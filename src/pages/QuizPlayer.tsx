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
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
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
    setSelectedAnswer(index);
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null) {
      alert('Please select an answer');
      return;
    }
    
    const currentQuestion = questions[currentQuestionIndex];
    const isCorrect = selectedAnswer === currentQuestion.correctIndex;
    const timeSpent = Date.now() - questionStartTime;
    
    const answer: TrainingAnswer = {
      questionId: currentQuestion.id,
      selectedIndex: selectedAnswer,
      isCorrect,
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
      const correctCount = answers.filter(a => a.isCorrect).length;
      const totalQuestions = questions.length;
      const percent = Math.round((correctCount / totalQuestions) * 100);
      
      // Create attempt record
      const attemptId = await createAttempt({
        userId: currentUser.uid,
        quizSetId,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        scoreCorrect: correctCount,
        scoreTotal: totalQuestions,
        percent,
        answers,
        rewards: {
          ppGained: rewardResult.ppGained,
          xpGained: rewardResult.xpGained,
          bonuses: rewardResult.bonuses,
        },
        mode: 'solo',
      });
      
      // Grant rewards
      await grantQuizRewards(currentUser.uid, rewardResult);
      
      // Update stats (using the created attempt)
      const createdAttempt: TrainingAttempt = {
        id: attemptId,
        userId: currentUser.uid,
        quizSetId,
        startedAt: new Date(startTime),
        completedAt: new Date(),
        scoreCorrect: correctCount,
        scoreTotal: totalQuestions,
        percent,
        answers,
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
  const isCorrect = selectedAnswer !== null && selectedAnswer === currentQuestion.correctIndex;

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
              textAlign: 'center'
            }}>
              <img 
                src={currentQuestion.imageUrl} 
                alt="Question illustration"
                style={{
                  maxWidth: '100%',
                  maxHeight: '400px',
                  borderRadius: '0.5rem',
                  objectFit: 'contain'
                }}
              />
            </div>
          )}

          {/* Answer options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {currentQuestion.options.map((option, index) => {
              let buttonStyle: React.CSSProperties = {
                padding: '1rem',
                borderRadius: '0.5rem',
                border: '2px solid #e5e7eb',
                background: 'white',
                cursor: showFeedback ? 'default' : 'pointer',
                fontSize: '1rem',
                textAlign: 'left',
                transition: 'all 0.2s',
              };

              if (showFeedback) {
                if (index === currentQuestion.correctIndex) {
                  buttonStyle.background = '#10b981';
                  buttonStyle.color = 'white';
                  buttonStyle.borderColor = '#10b981';
                } else if (index === selectedAnswer && index !== currentQuestion.correctIndex) {
                  buttonStyle.background = '#ef4444';
                  buttonStyle.color = 'white';
                  buttonStyle.borderColor = '#ef4444';
                } else {
                  buttonStyle.opacity = 0.6;
                }
              } else if (selectedAnswer === index) {
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
                  {option}
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
                disabled={selectedAnswer === null}
                style={{
                  padding: '0.75rem 2rem',
                  background: selectedAnswer === null ? '#9ca3af' : '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: selectedAnswer === null ? 'not-allowed' : 'pointer',
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

