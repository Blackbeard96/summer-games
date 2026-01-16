import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getQuizSet, getQuestions } from '../utils/trainingGroundsService';
import { createAttempt, updateTrainingStats } from '../utils/trainingGroundsService';
import { calculateQuizRewards, grantQuizRewards } from '../utils/trainingGroundsRewards';
import { TrainingQuizSet, TrainingQuestion, TrainingAnswer, TrainingAttempt } from '../types/trainingGrounds';
import { serverTimestamp } from 'firebase/firestore';

const QuizPlayer: React.FC = () => {
  const { quizSetId } = useParams<{ quizSetId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  const [quizSet, setQuizSet] = useState<TrainingQuizSet | null>(null);
  const [questions, setQuestions] = useState<TrainingQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null); // For backwards compatibility
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set()); // For multi-select
  const [answers, setAnswers] = useState<TrainingAnswer[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const [loading, setLoading] = useState(true);
  const [startTime] = useState(Date.now());
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  
  useEffect(() => {
    if (!quizSetId || !currentUser) return;
    
    const loadQuiz = async () => {
      try {
        setLoading(true);
        const quiz = await getQuizSet(quizSetId);
        if (!quiz) {
          alert('Quiz not found');
          navigate('/training-grounds');
          return;
        }
        setQuizSet(quiz);
        
        const quizQuestions = await getQuestions(quizSetId);
        if (quizQuestions.length === 0) {
          alert('Quiz has no questions');
          navigate('/training-grounds');
          return;
        }
        setQuestions(quizQuestions);
      } catch (error) {
        console.error('Error loading quiz:', error);
        alert('Failed to load quiz');
        navigate('/training-grounds');
      } finally {
        setLoading(false);
      }
    };
    
    loadQuiz();
  }, [quizSetId, currentUser, navigate]);

  const handleAnswerSelect = (index: number) => {
    if (showFeedback) return; // Prevent changing answer after feedback
    
    const currentQuestion = questions[currentQuestionIndex];
    const correctIndices = currentQuestion.correctIndices || 
      (currentQuestion.correctIndex !== undefined ? [currentQuestion.correctIndex] : []);
    const isMultiSelect = correctIndices.length > 1;
    
    // If single correct answer (backwards compatibility), use radio button behavior
    if (!isMultiSelect) {
      setSelectedAnswer(index);
      setSelectedIndices(new Set([index]));
    } else {
      // Multi-select: toggle the index
      const newSelected = new Set(selectedIndices);
      if (newSelected.has(index)) {
        newSelected.delete(index);
      } else {
        newSelected.add(index);
      }
      setSelectedIndices(newSelected);
      // Clear old selectedAnswer for multi-select questions
      setSelectedAnswer(null);
    }
  };

  const handleSubmitAnswer = () => {
    const currentQuestion = questions[currentQuestionIndex];
    const correctIndices = currentQuestion.correctIndices || 
      (currentQuestion.correctIndex !== undefined ? [currentQuestion.correctIndex] : []);
    
    // Check if at least one answer is selected
    const selectedArray = Array.from(selectedIndices);
    const hasOldSelection = selectedAnswer !== null;
    
    if (selectedArray.length === 0 && !hasOldSelection) {
      alert('Please select at least one answer');
      return;
    }
    
    // Use selectedIndices if available, otherwise fall back to selectedAnswer (backwards compatibility)
    const finalSelectedIndices = selectedArray.length > 0 
      ? selectedArray 
      : (selectedAnswer !== null ? [selectedAnswer] : []);
    
    const timeSpent = Date.now() - questionStartTime;
    
    // Calculate correctness and partial credit
    const correctSet = new Set(correctIndices);
    const selectedSet = new Set(finalSelectedIndices);
    
    // Check if all correct are selected and no incorrect are selected
    const allCorrectSelected = correctIndices.every(idx => selectedSet.has(idx));
    const noIncorrectSelected = finalSelectedIndices.every(idx => correctSet.has(idx));
    const isFullyCorrect = allCorrectSelected && noIncorrectSelected && correctIndices.length === finalSelectedIndices.length;
    
    // Calculate partial credit
    let partialCredit = 0;
    if (!isFullyCorrect && correctIndices.length > 0) {
      // Count correct selections
      const correctSelected = finalSelectedIndices.filter(idx => correctSet.has(idx)).length;
      // Count incorrect selections
      const incorrectSelected = finalSelectedIndices.filter(idx => !correctSet.has(idx)).length;
      
      // Partial credit: (correct selected / total correct) - penalty for incorrect
      const correctRatio = correctSelected / correctIndices.length;
      const incorrectPenalty = incorrectSelected * 0.25; // Each incorrect answer reduces credit by 25%
      partialCredit = Math.max(0, correctRatio - incorrectPenalty);
    } else if (isFullyCorrect) {
      partialCredit = 1.0;
    }
    
    const answer: TrainingAnswer = {
      questionId: currentQuestion.id,
      // Only include selectedIndex if there's a single correct answer (for backwards compatibility)
      ...(correctIndices.length === 1 && { selectedIndex: finalSelectedIndices[0] }),
      selectedIndices: finalSelectedIndices,
      isCorrect: isFullyCorrect,
      partialCredit,
      timeSpentMs: timeSpent,
    };
    
    setAnswers([...answers, answer]);
    setShowFeedback(true);
  };

  const handleNext = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
      setShowFeedback(false);
      setQuestionStartTime(Date.now());
    } else {
      // Quiz complete - calculate results and navigate
      await completeQuiz();
    }
  };

  const completeQuiz = async () => {
    if (!currentUser || !quizSetId || !quizSet) return;
    
    try {
      // Calculate rewards
      const rewardResult = calculateQuizRewards(questions, answers);
      
      // Calculate score with partial credit
      let totalScore = 0;
      answers.forEach(answer => {
        const partialCredit = answer.partialCredit !== undefined ? answer.partialCredit : (answer.isCorrect ? 1.0 : 0.0);
        totalScore += partialCredit;
      });
      const totalQuestions = questions.length;
      const percent = totalQuestions > 0 ? Math.round((totalScore / totalQuestions) * 100) : 0;
      
      // For display, count fully correct answers
      const correctCount = answers.filter(a => a.isCorrect).length;
      
      // Clean answers to remove undefined values (Firestore doesn't allow undefined)
      const cleanedAnswers = answers.map(answer => {
        const cleaned: any = {
          questionId: answer.questionId,
          selectedIndices: answer.selectedIndices,
          isCorrect: answer.isCorrect,
          partialCredit: answer.partialCredit,
          timeSpentMs: answer.timeSpentMs,
        };
        // Only include selectedIndex if it exists (for backwards compatibility)
        if (answer.selectedIndex !== undefined) {
          cleaned.selectedIndex = answer.selectedIndex;
        }
        return cleaned;
      });
      
      // Create attempt record
      const attemptId = await createAttempt({
        userId: currentUser.uid,
        quizSetId,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        scoreCorrect: correctCount,
        scoreTotal: totalQuestions,
        percent,
        answers: cleanedAnswers,
        rewards: {
          ppGained: rewardResult.ppGained,
          xpGained: rewardResult.xpGained,
          bonuses: rewardResult.bonuses,
        },
        mode: 'solo',
      });
      
      // Grant rewards
      await grantQuizRewards(currentUser.uid, rewardResult);
      
      // Update stats (using the created attempt with cleaned answers)
      const createdAttempt: TrainingAttempt = {
        id: attemptId,
        userId: currentUser.uid,
        quizSetId,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        scoreCorrect: correctCount,
        scoreTotal: totalQuestions,
        percent,
        answers: cleanedAnswers,
        rewards: {
          ppGained: rewardResult.ppGained,
          xpGained: rewardResult.xpGained,
          bonuses: rewardResult.bonuses,
        },
        mode: 'solo',
      };
      await updateTrainingStats(currentUser.uid, createdAttempt);
      
      // Navigate to results
      navigate(`/training-grounds/results/${attemptId}`);
    } catch (error) {
      console.error('Error completing quiz:', error);
      alert('Failed to save quiz results. Please try again.');
    }
  };

  if (loading || !quizSet || questions.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading quiz...</div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
  
  // Get correct indices (support both old and new format)
  const correctIndices = currentQuestion.correctIndices || 
    (currentQuestion.correctIndex !== undefined ? [currentQuestion.correctIndex] : []);
  const isMultiSelect = correctIndices.length > 1;
  
  // Calculate if current answer is correct (for display before submission)
  let isCorrect = false;
  if (showFeedback && answers.length > currentQuestionIndex) {
    isCorrect = answers[currentQuestionIndex]?.isCorrect || false;
  } else if (!isMultiSelect && selectedAnswer !== null) {
    isCorrect = selectedAnswer === correctIndices[0];
  } else if (isMultiSelect && selectedIndices.size > 0) {
    const selectedArray = Array.from(selectedIndices);
    const correctSet = new Set(correctIndices);
    const allCorrect = correctIndices.every(idx => selectedIndices.has(idx));
    const noIncorrect = selectedArray.every(idx => correctSet.has(idx));
    isCorrect = allCorrect && noIncorrect && correctIndices.length === selectedIndices.size;
  }

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(to bottom, #f3f4f6, #e5e7eb)',
      padding: '2rem'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        {/* Progress bar */}
        <div style={{
          background: 'white',
          borderRadius: '1rem',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginBottom: '0.5rem',
            fontSize: '0.875rem',
            color: '#6b7280'
          }}>
            <span>Question {currentQuestionIndex + 1} of {questions.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            background: '#e5e7eb',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              background: '#4f46e5',
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>

        {/* Question card */}
        <div style={{
          background: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '1.5rem'
        }}>
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 'bold',
            marginBottom: '1.5rem',
            color: '#1f2937'
          }}>
            {currentQuestion.prompt}
          </h2>

          {currentQuestion.imageUrl && (
            <div style={{ 
              marginBottom: '1.5rem',
              textAlign: 'center',
              position: 'relative'
            }}>
              <img 
                src={currentQuestion.imageUrl} 
                alt="Question illustration"
                onError={(e) => {
                  console.error('Failed to load image:', currentQuestion.imageUrl);
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  // Show error message
                  const errorDiv = target.parentElement?.querySelector('.image-error') as HTMLElement;
                  if (errorDiv) {
                    errorDiv.style.display = 'block';
                  }
                }}
                onLoad={(e) => {
                  const target = e.currentTarget;
                  target.style.display = 'block';
                  // Hide error message if visible
                  const errorDiv = target.parentElement?.querySelector('.image-error') as HTMLElement;
                  if (errorDiv) {
                    errorDiv.style.display = 'none';
                  }
                }}
                style={{
                  maxWidth: '100%',
                  maxHeight: '400px',
                  borderRadius: '0.5rem',
                  objectFit: 'contain',
                  display: 'block',
                  margin: '0 auto',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                }}
              />
              <div className="image-error" style={{
                display: 'none',
                padding: '1rem',
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                borderRadius: '0.5rem',
                color: '#991b1b',
                fontSize: '0.875rem'
              }}>
                ⚠️ Image could not be loaded. Please contact an administrator.
              </div>
            </div>
          )}

          {/* Answer selection hint */}
          {isMultiSelect && !showFeedback && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              background: '#eff6ff',
              borderRadius: '0.5rem',
              border: '1px solid #bfdbfe',
              fontSize: '0.875rem',
              color: '#1e40af'
            }}>
              <strong>Multiple correct answers:</strong> Select all that apply
            </div>
          )}

          {/* Answer options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {currentQuestion.options.map((option, index) => {
              const isSelected = isMultiSelect ? selectedIndices.has(index) : selectedAnswer === index;
              const isCorrectAnswer = correctIndices.includes(index);
              
              let buttonStyle: React.CSSProperties = {
                padding: '1rem',
                borderRadius: '0.5rem',
                border: '2px solid #e5e7eb',
                background: 'white',
                cursor: showFeedback ? 'default' : 'pointer',
                fontSize: '1rem',
                textAlign: 'left',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem'
              };

              if (showFeedback) {
                // Show correct answers in green
                if (isCorrectAnswer) {
                  buttonStyle.background = '#10b981';
                  buttonStyle.color = 'white';
                  buttonStyle.borderColor = '#10b981';
                } 
                // Show selected but incorrect answers in red
                else if (isSelected && !isCorrectAnswer) {
                  buttonStyle.background = '#ef4444';
                  buttonStyle.color = 'white';
                  buttonStyle.borderColor = '#ef4444';
                } 
                // Show correct but not selected in muted green
                else if (isCorrectAnswer && !isSelected) {
                  buttonStyle.background = '#d1fae5';
                  buttonStyle.color = '#065f46';
                  buttonStyle.borderColor = '#10b981';
                  buttonStyle.opacity = 0.8;
                }
                else {
                  buttonStyle.opacity = 0.6;
                }
              } else if (isSelected) {
                buttonStyle.borderColor = '#4f46e5';
                buttonStyle.background = '#eef2ff';
              }

              return (
                <button
                  key={index}
                  onClick={() => handleAnswerSelect(index)}
                  style={buttonStyle}
                  disabled={showFeedback}
                >
                  {/* Checkbox for multi-select, radio button indicator for single-select */}
                  <div style={{
                    width: '20px',
                    height: '20px',
                    border: '2px solid',
                    borderColor: isSelected ? '#4f46e5' : '#9ca3af',
                    borderRadius: isMultiSelect ? '4px' : '50%',
                    background: isSelected ? '#4f46e5' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {isSelected && (
                      <span style={{ color: 'white', fontSize: '0.75rem', fontWeight: 'bold' }}>
                        {isMultiSelect ? '✓' : '●'}
                      </span>
                    )}
                  </div>
                  <span style={{ flex: 1 }}>{option}</span>
                </button>
              );
            })}
          </div>

          {/* Feedback */}
          {showFeedback && (
            <div style={{
              padding: '1rem',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              background: isCorrect ? '#ecfdf5' : '#fef2f2',
              border: `2px solid ${isCorrect ? '#10b981' : '#ef4444'}`
            }}>
              <div style={{ 
                fontSize: '1.125rem', 
                fontWeight: 'bold',
                marginBottom: '0.5rem',
                color: isCorrect ? '#10b981' : '#ef4444'
              }}>
                {isCorrect ? '✓ Correct!' : '✗ Incorrect'}
              </div>
              {currentQuestion.explanation && (
                <div style={{ color: '#6b7280' }}>
                  {currentQuestion.explanation}
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
            {!showFeedback ? (
              <button
                onClick={handleSubmitAnswer}
                disabled={(selectedIndices.size === 0 && selectedAnswer === null)}
                style={{
                  padding: '0.75rem 2rem',
                  background: (selectedIndices.size === 0 && selectedAnswer === null) ? '#9ca3af' : '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: (selectedIndices.size === 0 && selectedAnswer === null) ? 'not-allowed' : 'pointer',
                }}
              >
                Submit Answer
              </button>
            ) : (
              <button
                onClick={handleNext}
                style={{
                  padding: '0.75rem 2rem',
                  background: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                {currentQuestionIndex < questions.length - 1 ? 'Next Question' : 'View Results'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuizPlayer;

