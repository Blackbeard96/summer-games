import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAttempt, getQuizSet, getQuestions, isTrainingQuizAcceptingSoloCompletions } from '../utils/trainingGroundsService';
import { TrainingAttempt, TrainingQuestion, TrainingQuizSet } from '../types/trainingGrounds';
import TrainingQuizSummaryModal from '../components/TrainingQuizSummaryModal';

const QuizResults: React.FC = () => {
  const { attemptId } = useParams<{ attemptId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnMissionRaw = searchParams.get('returnMission');
  const returnMission =
    returnMissionRaw &&
    returnMissionRaw.startsWith('/mission/') &&
    !returnMissionRaw.includes('..')
      ? returnMissionRaw
      : null;
  
  const [attempt, setAttempt] = useState<TrainingAttempt | null>(null);
  const [quizSet, setQuizSet] = useState<TrainingQuizSet | null>(null);
  const [questions, setQuestions] = useState<TrainingQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [showSummaryModal, setShowSummaryModal] = useState(true);

  useEffect(() => {
    if (!attemptId || !currentUser) return;
    
    const loadResults = async () => {
      try {
        setLoading(true);
        const attemptData = await getAttempt(attemptId);
        if (!attemptData || attemptData.userId !== currentUser.uid) {
          alert('Attempt not found');
          navigate('/training-grounds');
          return;
        }
        setAttempt(attemptData);
        
        const quiz = await getQuizSet(attemptData.quizSetId);
        setQuizSet(quiz);
        
        const quizQuestions = await getQuestions(attemptData.quizSetId);
        setQuestions(quizQuestions);
      } catch (error) {
        console.error('Error loading results:', error);
        alert('Failed to load results');
        navigate('/training-grounds');
      } finally {
        setLoading(false);
      }
    };
    
    loadResults();
  }, [attemptId, currentUser, navigate]);

  const toggleQuestion = (questionId: string) => {
    setExpandedQuestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
  };

  if (loading || !attempt || !quizSet) {
    return (
      <div className="mst-mission-shell">
        <div className="mst-mission-loading" role="status" aria-live="polite">
          <div className="mst-mission-loading-mark" aria-hidden="true" />
          <p className="mst-mission-loading-title">Loading results...</p>
          <p className="mst-mission-loading-copy">Calculating your CFU score...</p>
        </div>
      </div>
    );
  }

  const scoreTier =
    attempt.percent >= 70 ? 'is-high' : attempt.percent >= 50 ? 'is-mid' : 'is-low';
  const playerName = currentUser?.displayName ?? currentUser?.email ?? 'You';
  const canRetrySolo = isTrainingQuizAcceptingSoloCompletions(quizSet);

  return (
    <>
      <TrainingQuizSummaryModal
        isOpen={showSummaryModal}
        onClose={() => setShowSummaryModal(false)}
        quizTitle={quizSet.title}
        attempt={attempt}
        playerName={playerName}
      />

      <div className="mst-mission-shell">
        <div className="mst-quiz-layout">
          <div className="mst-mission-panel mst-quiz-panel">
            <header className="mst-mission-header">
              <p className="mst-mission-kicker">Training Grounds · CFU</p>
              <h1 className="mst-mission-title">Quiz Complete</h1>
              <p className="mst-mission-step-meta">{quizSet.title}</p>
            </header>

            <div className="mst-quiz-score">
              <div className={`mst-quiz-score-value ${scoreTier}`}>{attempt.percent}%</div>
              <p className="mst-quiz-score-meta">
                {attempt.scoreCorrect} out of {attempt.scoreTotal} correct
              </p>
            </div>

            <div className="mst-mission-block mst-mission-block--accent">
              <h3>Rewards Earned</h3>
              <div className="mst-quiz-rewards">
                <div>
                  <div className="mst-quiz-reward-label">Power Points</div>
                  <div className="mst-quiz-reward-value mst-quiz-reward-value--pp">
                    +{attempt.rewards.ppGained} PP
                  </div>
                </div>
                <div>
                  <div className="mst-quiz-reward-label">Experience</div>
                  <div className="mst-quiz-reward-value mst-quiz-reward-value--xp">
                    +{attempt.rewards.xpGained} XP
                  </div>
                </div>
              </div>
              {attempt.rewards.bonuses.length > 0 && (
                <div className="mst-quiz-bonus-row">
                  {attempt.rewards.bonuses.map((bonus, index) => (
                    <span key={index} className="mst-quiz-bonus">
                      {bonus}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mst-mission-panel mst-quiz-panel">
            <h2 className="mst-mission-step-heading">Question Breakdown</h2>
            <div className="mst-quiz-breakdown">
              {questions.map((question, index) => {
                const answer = attempt.answers.find((a) => a.questionId === question.id);
                const isCorrect = answer?.isCorrect || false;
                const isExpanded = expandedQuestions.has(question.id);

                return (
                  <div
                    key={question.id}
                    className={`mst-quiz-row ${isCorrect ? 'is-ok' : 'is-bad'}`}
                  >
                    <button
                      type="button"
                      className="mst-quiz-row-head"
                      onClick={() => toggleQuestion(question.id)}
                      aria-expanded={isExpanded}
                    >
                      <span>
                        {isCorrect ? '✓' : '✗'} Question {index + 1}:{' '}
                        {question.prompt.length > 50
                          ? `${question.prompt.substring(0, 50)}...`
                          : question.prompt}
                      </span>
                      <span aria-hidden="true">{isExpanded ? '▼' : '▶'}</span>
                    </button>

                    {isExpanded && (
                      <div className="mst-quiz-row-body">
                        <div style={{ marginBottom: '0.85rem' }}>
                          <strong style={{ color: 'var(--mst-text-primary)' }}>Question:</strong>{' '}
                          {question.prompt}
                        </div>
                        {question.imageUrl && (
                          <img
                            className="mst-mission-media"
                            src={question.imageUrl}
                            alt="Question illustration"
                          />
                        )}
                        <div style={{ marginBottom: '0.75rem' }}>
                          <strong style={{ color: 'var(--mst-text-primary)' }}>Your answer(s):</strong>{' '}
                          <span
                            style={{
                              color: isCorrect
                                ? '#6ee7a8'
                                : answer?.partialCredit && answer.partialCredit > 0
                                  ? 'var(--mst-gold-bright)'
                                  : '#fca5a5',
                              fontWeight: 600,
                            }}
                          >
                            {(() => {
                              const selectedIndices =
                                answer?.selectedIndices ||
                                (answer?.selectedIndex !== undefined
                                  ? [answer.selectedIndex]
                                  : []);
                              if (selectedIndices.length === 0) return 'None selected';
                              return selectedIndices
                                .map(
                                  (idx) =>
                                    `${String.fromCharCode(65 + idx)}: ${question.options[idx]}`
                                )
                                .join(', ');
                            })()}
                          </span>
                          {answer?.partialCredit &&
                            answer.partialCredit > 0 &&
                            answer.partialCredit < 1 && (
                              <span style={{ color: 'var(--mst-gold-bright)', marginLeft: '0.5rem' }}>
                                ({Math.round(answer.partialCredit * 100)}% credit)
                              </span>
                            )}
                        </div>
                        <div style={{ marginBottom: question.explanation ? '0.75rem' : 0 }}>
                          <strong style={{ color: 'var(--mst-text-primary)' }}>
                            Correct answer(s):
                          </strong>{' '}
                          <span style={{ color: '#6ee7a8', fontWeight: 600 }}>
                            {(() => {
                              const idxs =
                                (question as { correctIndices?: number[] }).correctIndices ||
                                (question.correctIndex !== undefined
                                  ? [question.correctIndex]
                                  : []);
                              if (idxs.length === 0) return 'None';
                              return idxs
                                .map(
                                  (idx: number) =>
                                    `${String.fromCharCode(65 + idx)}: ${question.options[idx]}`
                                )
                                .join(', ');
                            })()}
                          </span>
                        </div>
                        {question.explanation && (
                          <div className="mst-mission-block mst-mission-block--info" style={{ marginBottom: 0 }}>
                            <strong style={{ color: 'var(--mst-text-primary)' }}>Explanation:</strong>{' '}
                            {question.explanation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mst-quiz-actions mst-quiz-actions--center">
            {returnMission && (
              <button
                type="button"
                className="mst-mission-btn mst-mission-btn--primary"
                onClick={() => navigate(returnMission)}
              >
                Back to mission
              </button>
            )}
            <button
              type="button"
              className="mst-mission-btn mst-mission-btn--complete"
              disabled={!canRetrySolo}
              title={
                !canRetrySolo
                  ? 'This CFU is temporarily closed for completions. Your teacher can turn it back on.'
                  : undefined
              }
              onClick={() => {
                if (!canRetrySolo) return;
                const base = `/training-grounds/quiz/${attempt.quizSetId}`;
                navigate(
                  returnMission
                    ? `${base}?returnMission=${encodeURIComponent(returnMission)}`
                    : base
                );
              }}
            >
              {canRetrySolo ? 'Retry Quiz' : 'Retry unavailable'}
            </button>
            <button
              type="button"
              className="mst-mission-btn mst-mission-btn--secondary"
              onClick={() => navigate('/training-grounds')}
            >
              Back to Training Grounds
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default QuizResults;

