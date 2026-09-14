import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getPublishedQuizSets,
  getLastAttempt,
  isTrainingQuizAcceptingSoloCompletions,
} from '../utils/trainingGroundsService';
import { TrainingQuizSet, TrainingAttempt } from '../types/trainingGrounds';
import { getClassesByStudent } from '../utils/assessmentGoalsFirestore';

const TrainingGrounds: React.FC = () => {
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
  const [quizSets, setQuizSets] = useState<TrainingQuizSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastAttempts, setLastAttempts] = useState<Record<string, TrainingAttempt>>({});
  const [enrolledClassIds, setEnrolledClassIds] = useState<string[]>([]);

  useEffect(() => {
    if (!currentUser) return;
    
    const loadQuizSets = async () => {
      try {
        setLoading(true);
        
        // Get user's classrooms from the classrooms collection
        const userClasses = await getClassesByStudent(currentUser.uid);
        const classIds = userClasses.map(c => c.id);
        setEnrolledClassIds(classIds);

        // Admins can browse/test all published CFUs (not limited to student enrollment)
        const published = isAdmin
          ? await getPublishedQuizSets()
          : await getPublishedQuizSets(classIds);
        setQuizSets(published);
        
        // Load last attempt for each quiz set
        const attempts: Record<string, TrainingAttempt> = {};
        for (const quizSet of published) {
          const lastAttempt = await getLastAttempt(currentUser.uid, quizSet.id);
          if (lastAttempt) {
            attempts[quizSet.id] = lastAttempt;
          }
        }
        setLastAttempts(attempts);
      } catch (error) {
        console.error('Error loading quiz sets:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadQuizSets();
  }, [currentUser, isAdmin]);

  const handleStartQuiz = (quizSetId: string) => {
    const suffix = returnMission
      ? `?returnMission=${encodeURIComponent(returnMission)}`
      : '';
    navigate(`/training-grounds/quiz/${quizSetId}${suffix}`);
  };

  const canSubmitQuiz = (quiz: TrainingQuizSet) => isTrainingQuizAcceptingSoloCompletions(quiz);

  if (loading) {
    return (
      <div className="mst-mission-shell">
        <div className="mst-mission-loading" role="status" aria-live="polite">
          <div className="mst-mission-loading-mark" aria-hidden="true" />
          <p className="mst-mission-loading-title">Loading Training Grounds...</p>
          <p className="mst-mission-loading-copy">Gathering your CFUs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mst-mission-shell">
      <div className="mst-quiz-layout mst-quiz-layout--wide">
        {returnMission && (
          <button
            type="button"
            className="mst-mission-btn mst-mission-btn--ghost"
            onClick={() => navigate(returnMission)}
          >
            ← Back to mission
          </button>
        )}

        <header className="mst-mission-header" style={{ textAlign: 'left', marginBottom: '0.5rem' }}>
          <p className="mst-mission-kicker">Learn · CFUs</p>
          <h1 className="mst-mission-title">Training Grounds</h1>
          <p className="mst-mission-step-meta">
            Practice quizzes to review assignments and earn rewards
            {isAdmin ? ' · Admin: showing all published CFUs for testing' : ''}
          </p>
        </header>

        {quizSets.length === 0 ? (
          <div className="mst-mission-panel mst-quiz-panel">
            <h2 className="mst-mission-step-heading">No quizzes available</h2>
            <p className="mst-mission-body-text">
              {isAdmin
                ? 'There are no published CFU quizzes yet. Publish one in Admin → Training Grounds.'
                : enrolledClassIds.length === 0
                  ? 'You need to be enrolled in a class to see CFU quizzes. Ask your teacher if you believe this is a mistake.'
                  : 'There are no published CFU quizzes for your class yet. Check back later.'}
            </p>
          </div>
        ) : (
          <div className="mst-quiz-grid">
            {quizSets.map((quizSet) => {
              const lastAttempt = lastAttempts[quizSet.id];
              const estimatedMinutes = Math.ceil(quizSet.questionCount * 0.5);
              const openForCompletions = canSubmitQuiz(quizSet);
              const scoreClass =
                lastAttempt == null
                  ? ''
                  : lastAttempt.percent >= 70
                    ? 'is-high'
                    : lastAttempt.percent >= 50
                      ? 'is-mid'
                      : 'is-low';

              return (
                <div
                  key={quizSet.id}
                  className={`mst-quiz-card${openForCompletions ? ' is-open' : ''}`}
                  onClick={() => {
                    if (openForCompletions) handleStartQuiz(quizSet.id);
                  }}
                  role={openForCompletions ? 'button' : undefined}
                  tabIndex={openForCompletions ? 0 : undefined}
                  onKeyDown={(e) => {
                    if (!openForCompletions) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleStartQuiz(quizSet.id);
                    }
                  }}
                >
                  <h3 className="mst-quiz-card-title">{quizSet.title}</h3>
                  {quizSet.description ? (
                    <p className="mst-quiz-card-desc">{quizSet.description}</p>
                  ) : (
                    <div className="mst-quiz-card-desc" />
                  )}

                  <div className="mst-quiz-card-meta">
                    <span>{quizSet.questionCount} questions</span>
                    <span>~{estimatedMinutes} min</span>
                  </div>

                  {!openForCompletions && (
                    <p className="mst-quiz-warn">
                      This CFU is visible but <strong>temporarily closed</strong> for completions.
                      Check back when your teacher reopens it.
                    </p>
                  )}

                  {lastAttempt && (
                    <div className="mst-quiz-card-last">
                      <div className="mst-quiz-reward-label">Last attempt</div>
                      <div
                        className={`mst-quiz-score-value ${scoreClass}`}
                        style={{ fontSize: '1.75rem', margin: '0.15rem 0' }}
                      >
                        {lastAttempt.percent}%
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--mst-text-muted)' }}>
                        {lastAttempt.scoreCorrect} out of {lastAttempt.scoreTotal} correct
                      </div>
                      {lastAttempt.rewards &&
                        (lastAttempt.rewards.ppGained > 0 || lastAttempt.rewards.xpGained > 0) && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--mst-text-muted)',
                              marginTop: '0.5rem',
                              paddingTop: '0.5rem',
                              borderTop: '1px solid rgba(255,255,255,0.08)',
                            }}
                          >
                            Earned:{' '}
                            {lastAttempt.rewards.ppGained > 0 &&
                              `+${lastAttempt.rewards.ppGained} PP`}
                            {lastAttempt.rewards.ppGained > 0 &&
                              lastAttempt.rewards.xpGained > 0 &&
                              ' · '}
                            {lastAttempt.rewards.xpGained > 0 &&
                              `+${lastAttempt.rewards.xpGained} XP`}
                          </div>
                        )}
                    </div>
                  )}

                  <button
                    type="button"
                    className={`mst-mission-btn ${
                      openForCompletions
                        ? 'mst-mission-btn--primary'
                        : 'mst-mission-btn--secondary'
                    } mst-mission-btn--block`}
                    disabled={!openForCompletions}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (openForCompletions) handleStartQuiz(quizSet.id);
                    }}
                  >
                    {!openForCompletions
                      ? 'Not accepting completions'
                      : lastAttempt
                        ? 'Retry Quiz'
                        : 'Start Quiz'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrainingGrounds;

