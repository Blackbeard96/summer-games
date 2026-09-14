import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getQuizSet,
  getQuestions,
  createAttempt,
  updateTrainingStats,
  isTrainingQuizVisibleToStudentClasses,
  isTrainingQuizAcceptingSoloCompletions,
  isTrainingQuizArchived,
} from '../utils/trainingGroundsService';
import { getClassesByStudent } from '../utils/assessmentGoalsFirestore';
import { calculateQuizRewards, grantQuizRewards } from '../utils/trainingGroundsRewards';
import { TrainingQuizSet, TrainingQuestion, TrainingAnswer, TrainingAttempt } from '../types/trainingGrounds';
import { recordQuizProductivityAttempt } from '../utils/productivityTracking';
import { enrichAnswersWithSkills, recordSkillEvidenceFromAttempt } from '../utils/masteryService';

const QuizPlayer: React.FC = () => {
  const { quizSetId } = useParams<{ quizSetId: string }>();
  const { currentUser, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnMissionRaw = searchParams.get('returnMission');
  const returnMission =
    returnMissionRaw &&
    returnMissionRaw.startsWith('/mission/') &&
    !returnMissionRaw.includes('..')
      ? returnMissionRaw
      : null;
  
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
          navigate(returnMission || '/training-grounds');
          return;
        }
        // Admins may test unpublished CFUs; archived stays staff-only via Admin archive folder.
        if (isTrainingQuizArchived(quiz)) {
          alert('This CFU is archived and is not available.');
          navigate(returnMission || '/training-grounds');
          return;
        }
        if (!quiz.isPublished && !isAdmin) {
          alert('This CFU is unpublished and is not available.');
          navigate(returnMission || '/training-grounds');
          return;
        }
        if (!isAdmin) {
          const studentClasses = await getClassesByStudent(currentUser.uid);
          const studentClassIds = studentClasses.map((c) => c.id);
          if (!isTrainingQuizVisibleToStudentClasses(quiz, studentClassIds)) {
            alert('This CFU quiz is not assigned to your class.');
            navigate(returnMission || '/training-grounds');
            return;
          }
          if (!isTrainingQuizAcceptingSoloCompletions(quiz)) {
            alert(
              'This CFU is temporarily closed for completions. You can still see it on Training Grounds, but your teacher needs to turn completions back on before you can take it.'
            );
            navigate(returnMission || '/training-grounds');
            return;
          }
        }

        setQuizSet(quiz);

        const quizQuestions = await getQuestions(quizSetId);
        if (quizQuestions.length === 0) {
          alert('Quiz has no questions');
          navigate(returnMission || '/training-grounds');
          return;
        }
        setQuestions(quizQuestions);
      } catch (error) {
        console.error('Error loading quiz:', error);
        alert('Failed to load quiz');
        navigate(returnMission || '/training-grounds');
      } finally {
        setLoading(false);
      }
    };
    
    loadQuiz();
  }, [quizSetId, currentUser, navigate, returnMission, isAdmin]);

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
      const enriched = enrichAnswersWithSkills(answers, questions);
      const cleanedAnswers = enriched.map(answer => {
        const cleaned: any = {
          questionId: answer.questionId,
          selectedIndices: answer.selectedIndices,
          isCorrect: answer.isCorrect,
          partialCredit: answer.partialCredit,
          timeSpentMs: answer.timeSpentMs,
          skillIds: Array.isArray(answer.skillIds) ? answer.skillIds : [],
        };
        if (answer.difficulty) cleaned.difficulty = answer.difficulty;
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

      // Skill Mastery evidence (non-blocking for quiz completion)
      try {
        await recordSkillEvidenceFromAttempt({
          userId: currentUser.uid,
          quizSetId,
          attemptId,
          answers: cleanedAnswers,
          mode: 'training-grounds',
        });
      } catch (skillErr) {
        console.warn('Skill mastery update failed (quiz still saved):', skillErr);
      }
      
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

      const quizClassId =
        quizSet.classIds && quizSet.classIds.length > 0 ? quizSet.classIds[0] : undefined;
      const questionTags = Array.from(
        new Set(
          questions
            .map((q) => (typeof q.category === 'string' ? q.category.trim() : ''))
            .filter(Boolean)
        )
      );
      await recordQuizProductivityAttempt({
        userId: currentUser.uid,
        quizSetId,
        attemptId,
        classId: quizClassId,
        scorePercent: percent,
        correctAnswers: correctCount,
        totalQuestions,
        timeTakenMs: Math.max(0, Date.now() - startTime),
        completedAtMs: Date.now(),
        quizTopic: quizSet.title,
        questionTags,
        mode: 'solo',
      });
      
      const suffix = returnMission ? `?returnMission=${encodeURIComponent(returnMission)}` : '';
      navigate(`/training-grounds/results/${attemptId}${suffix}`);
    } catch (error) {
      console.error('Error completing quiz:', error);
      alert('Failed to save quiz results. Please try again.');
    }
  };

  if (loading || !quizSet || questions.length === 0) {
    return (
      <div className="mst-mission-shell">
        <div className="mst-mission-loading" role="status" aria-live="polite">
          <div className="mst-mission-loading-mark" aria-hidden="true" />
          <p className="mst-mission-loading-title">Loading CFU...</p>
          <p className="mst-mission-loading-copy">Preparing your Training Grounds quiz...</p>
        </div>
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

  const canSubmit = selectedIndices.size > 0 || selectedAnswer !== null;

  return (
    <div className="mst-mission-shell">
      <div className="mst-quiz-layout">
        {returnMission && (
          <button
            type="button"
            className="mst-mission-btn mst-mission-btn--ghost"
            onClick={() => navigate(returnMission)}
          >
            ← Back to mission
          </button>
        )}

        <div className="mst-mission-panel mst-quiz-panel">
          <header className="mst-mission-header">
            <p className="mst-mission-kicker">Training Grounds · CFU</p>
            <h1 className="mst-mission-title">{quizSet.title}</h1>
            <p className="mst-mission-step-meta">
              Question {currentQuestionIndex + 1} of {questions.length}
              {' · '}
              {Math.round(progress)}%
            </p>
            <div className="mst-mission-progress" aria-hidden="true">
              <div className="mst-mission-progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </header>

          <h2 className="mst-mission-step-heading">{currentQuestion.prompt}</h2>

          {currentQuestion.imageUrl && (
            <div style={{ position: 'relative', marginBottom: '1.15rem' }}>
              <img
                className="mst-mission-media"
                src={currentQuestion.imageUrl}
                alt="Question illustration"
                onError={(e) => {
                  console.error('Failed to load image:', currentQuestion.imageUrl);
                  const target = e.currentTarget;
                  target.style.display = 'none';
                  const errorDiv = target.parentElement?.querySelector('.image-error') as HTMLElement;
                  if (errorDiv) errorDiv.style.display = 'flex';
                }}
                onLoad={(e) => {
                  const target = e.currentTarget;
                  target.style.display = 'block';
                  const errorDiv = target.parentElement?.querySelector('.image-error') as HTMLElement;
                  if (errorDiv) errorDiv.style.display = 'none';
                }}
              />
              <div className="image-error mst-mission-media-fallback" style={{ display: 'none' }}>
                Image could not be loaded. Please contact an administrator.
              </div>
            </div>
          )}

          {!showFeedback && (
            <p className={`mst-quiz-hint${isMultiSelect ? ' mst-quiz-hint--multi' : ''}`}>
              {isMultiSelect ? (
                <>
                  <strong>Multiple correct answers.</strong> Select all that apply.
                </>
              ) : (
                'Select one answer'
              )}
            </p>
          )}

          <div className="mst-quiz-options">
            {currentQuestion.options.map((option, index) => {
              const isSelected = isMultiSelect ? selectedIndices.has(index) : selectedAnswer === index;
              const isCorrectAnswer = correctIndices.includes(index);

              let stateClass = '';
              if (showFeedback) {
                if (isCorrectAnswer && isSelected) stateClass = 'is-correct';
                else if (isSelected && !isCorrectAnswer) stateClass = 'is-wrong';
                else if (isCorrectAnswer && !isSelected) stateClass = 'is-missed';
                else stateClass = 'is-dimmed';
              } else if (isSelected) {
                stateClass = 'is-selected';
              }

              return (
                <button
                  key={index}
                  type="button"
                  className={`mst-quiz-option ${stateClass}`.trim()}
                  onClick={() => handleAnswerSelect(index)}
                  disabled={showFeedback}
                >
                  <span
                    className={`mst-quiz-option-mark${isMultiSelect ? ' mst-quiz-option-mark--check' : ''}`}
                    aria-hidden="true"
                  >
                    {isSelected ? (isMultiSelect ? '✓' : '●') : ''}
                  </span>
                  <span className="mst-quiz-option-text">{option}</span>
                </button>
              );
            })}
          </div>

          {showFeedback && (
            <div className={`mst-quiz-feedback ${isCorrect ? 'mst-quiz-feedback--ok' : 'mst-quiz-feedback--bad'}`}>
              <p className="mst-quiz-feedback-title">
                {isCorrect ? '✓ Correct' : '✗ Incorrect'}
              </p>
              {currentQuestion.explanation && (
                <p className="mst-quiz-feedback-copy">{currentQuestion.explanation}</p>
              )}
            </div>
          )}

          <div className="mst-quiz-actions">
            {!showFeedback ? (
              <button
                type="button"
                className="mst-mission-btn mst-mission-btn--primary"
                onClick={handleSubmitAnswer}
                disabled={!canSubmit}
              >
                Submit Answer
              </button>
            ) : (
              <button
                type="button"
                className="mst-mission-btn mst-mission-btn--primary"
                onClick={handleNext}
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

