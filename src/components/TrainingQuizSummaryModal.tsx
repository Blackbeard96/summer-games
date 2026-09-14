import React from 'react';
import { TrainingAttempt } from '../types/trainingGrounds';

interface TrainingQuizSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  quizTitle: string;
  attempt: TrainingAttempt;
  playerName?: string;
}

/**
 * Summary modal shown after a Training Grounds quiz — MST cinematic chrome
 * (aligned with mission victory / CFU quiz surfaces).
 */
const TrainingQuizSummaryModal: React.FC<TrainingQuizSummaryModalProps> = ({
  isOpen,
  onClose,
  quizTitle,
  attempt,
  playerName = 'You',
}) => {
  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen]);

  if (!isOpen || !attempt) return null;

  const formatDuration = (): string => {
    const start = attempt.startedAt?.toDate?.() ?? new Date(attempt.startedAt);
    const end =
      attempt.completedAt?.toDate?.() ??
      (attempt.completedAt ? new Date(attempt.completedAt) : new Date());
    const seconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const { rewards, percent, scoreCorrect, scoreTotal } = attempt;

  return (
    <div
      className="mst-quiz-summary-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="training-summary-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <div className="mst-quiz-summary-modal" onClick={(e) => e.stopPropagation()}>
        <header className="mst-quiz-summary-header">
          <p className="mst-quiz-summary-kicker">Training Grounds · CFU</p>
          <h2 id="training-summary-title" className="mst-quiz-summary-title">
            Quiz Summary
          </h2>
          <p className="mst-quiz-summary-meta">
            {quizTitle} · {formatDuration()}
          </p>
        </header>

        <section className="mst-quiz-summary-section">
          <h3 className="mst-quiz-summary-section-title">Awards</h3>
          <p className="mst-quiz-summary-section-copy">Rewards from this quiz:</p>
          <ul className="mst-quiz-summary-awards">
            <li className="mst-quiz-summary-awards-label">Your result</li>
            {rewards.ppGained > 0 && (
              <li className="mst-quiz-summary-chip mst-quiz-summary-chip--pp">
                {rewards.ppGained} PP
              </li>
            )}
            {rewards.xpGained > 0 && (
              <li className="mst-quiz-summary-chip mst-quiz-summary-chip--xp">
                {rewards.xpGained} XP
              </li>
            )}
            {rewards.bonuses.map((b, i) => (
              <li key={i} className="mst-quiz-summary-chip mst-quiz-summary-chip--bonus">
                {b}
              </li>
            ))}
          </ul>
        </section>

        <section className="mst-quiz-summary-section">
          <h3 className="mst-quiz-summary-player">{playerName}</h3>
          <div className="mst-quiz-summary-stats">
            <div className="mst-quiz-summary-stat mst-quiz-summary-stat--score">
              <div className="mst-quiz-summary-stat-label">Score</div>
              <div className="mst-quiz-summary-stat-value">{percent}%</div>
              <div className="mst-quiz-summary-stat-note">
                {scoreCorrect} / {scoreTotal} correct
              </div>
            </div>

            <div className="mst-quiz-summary-stat mst-quiz-summary-stat--pp">
              <div className="mst-quiz-summary-stat-label">Quiz</div>
              <div className="mst-quiz-summary-stat-value">+{rewards.ppGained} PP</div>
              <div className="mst-quiz-summary-stat-note">from this quiz</div>
            </div>

            <div className="mst-quiz-summary-stat mst-quiz-summary-stat--xp">
              <div className="mst-quiz-summary-stat-label">Experience</div>
              <div className="mst-quiz-summary-stat-value">+{rewards.xpGained} XP</div>
            </div>

            {rewards.bonuses.length > 0 && (
              <div className="mst-quiz-summary-stat mst-quiz-summary-stat--bonus">
                <div className="mst-quiz-summary-stat-label">Bonuses</div>
                <div className="mst-quiz-summary-stat-value">{rewards.bonuses.join(', ')}</div>
              </div>
            )}
          </div>
        </section>

        <p className="mst-quiz-summary-hint">
          Click the button below when you&apos;re done reading.
        </p>
        <button
          type="button"
          className="mst-mission-btn mst-mission-btn--primary mst-quiz-summary-close"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default TrainingQuizSummaryModal;
