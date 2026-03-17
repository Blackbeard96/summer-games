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
 * Summary modal shown after a Training Grounds quiz, matching the style of the
 * Live Event quiz summary (SessionSummaryModal) so players see a consistent experience.
 */
const TrainingQuizSummaryModal: React.FC<TrainingQuizSummaryModalProps> = ({
  isOpen,
  onClose,
  quizTitle,
  attempt,
  playerName = 'You'
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
    const end = attempt.completedAt?.toDate?.() ?? (attempt.completedAt ? new Date(attempt.completedAt) : new Date());
    const seconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const { rewards, percent, scoreCorrect, scoreTotal } = attempt;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '1rem'
      }}
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
      <div
        style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          border: '2px solid #fff'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — same style as Live Event */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <h2
            id="training-summary-title"
            style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              color: '#fff',
              marginBottom: '0.5rem',
              textShadow: '2px 2px 4px rgba(0,0,0,0.3)'
            }}
          >
            🎉 Quiz Summary
          </h2>
          <p style={{ fontSize: '1rem', color: '#f0f0f0' }}>
            {quizTitle} • {formatDuration()}
          </p>
        </div>

        {/* Awards — same card style as Live Event placements */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '0.75rem',
            padding: '1.25rem',
            marginBottom: '1rem',
            border: '2px solid #f59e0b'
          }}
        >
          <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.5rem' }}>
            🏆 Awards
          </h3>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>
            Rewards from this quiz:
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li
              style={{
                padding: '0.5rem 0',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <span style={{ fontWeight: 'bold', color: '#1f2937', minWidth: '6rem' }}>Your result</span>
              {rewards.ppGained > 0 && <span style={{ color: '#059669', fontSize: '0.9rem' }}>{rewards.ppGained} PP</span>}
              {rewards.ppGained > 0 && rewards.xpGained > 0 && <span style={{ color: '#6b7280' }}>•</span>}
              {rewards.xpGained > 0 && <span style={{ color: '#2563eb', fontSize: '0.9rem' }}>{rewards.xpGained} XP</span>}
              {rewards.bonuses.length > 0 && rewards.bonuses.map((b, i) => (
                <span key={i} style={{ color: '#7c3aed', fontSize: '0.9rem' }}>• {b}</span>
              ))}
            </li>
          </ul>
        </div>

        {/* Your stats — same highlighted section as Live Event "Current Player" */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '2rem',
            border: '3px solid #ffd700',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.2)'
          }}
        >
          <h3 style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#1f2937',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            👤 {playerName}
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '1rem',
            marginBottom: '1rem'
          }}>
            {/* Score */}
            <div style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#fff',
              padding: '1rem',
              borderRadius: '0.5rem',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.25rem' }}>Score</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{percent}%</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>
                {scoreCorrect} / {scoreTotal} correct
              </div>
            </div>

            {/* PP Earned */}
            <div style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#fff',
              padding: '1rem',
              borderRadius: '0.5rem',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.25rem' }}>Quiz</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>+{rewards.ppGained} PP</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>from this quiz</div>
            </div>

            {/* XP Earned */}
            <div style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: '#fff',
              padding: '1rem',
              borderRadius: '0.5rem',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.25rem' }}>Experience</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>+{rewards.xpGained} XP</div>
            </div>

            {/* Bonuses */}
            {rewards.bonuses.length > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                color: '#fff',
                padding: '1rem',
                borderRadius: '0.5rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.25rem' }}>Bonuses</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
                  {rewards.bonuses.join(', ')}
                </div>
              </div>
            )}
          </div>
        </div>

        <p style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.85)', marginTop: '1.5rem', marginBottom: '0.5rem', textAlign: 'center' }}>
          Click the button below when you&apos;re done reading.
        </p>
        <button
          onClick={onClose}
          style={{
            width: '100%',
            marginTop: '0.5rem',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#fff',
            border: 'none',
            padding: '1rem',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.2)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 8px rgba(0, 0, 0, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.2)';
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default TrainingQuizSummaryModal;
