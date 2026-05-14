import React from 'react';
import type { TrainingQuestion } from '../../types/trainingGrounds';

interface LiveQuizQuestionCardProps {
  question: TrainingQuestion;
  questionNumber: number;
  totalQuestions: number;
  countdownSeconds?: number | null;
  /** When true, show "Time's up" or similar */
  timeExpired?: boolean;
  /** Tighter padding when the live event quiz column is narrow (player columns visible) */
  compact?: boolean;
}

export const LiveQuizQuestionCard: React.FC<LiveQuizQuestionCardProps> = ({
  question,
  questionNumber,
  totalQuestions,
  countdownSeconds,
  timeExpired,
  compact = false,
}) => {
  const pad = compact ? '1rem' : '1.5rem';
  const titleSize = compact ? '1.15rem' : '1.35rem';
  const metaSize = compact ? '0.8rem' : '0.875rem';
  const timerSize = compact ? '1.05rem' : '1.25rem';
  const imgMax = compact ? 'min(38vh, 320px)' : 'min(75vh, 720px)';

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        borderRadius: '1rem',
        padding: pad,
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
        border: '2px solid #e2e8f0',
        marginBottom: compact ? '0.5rem' : '1rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: compact ? '0.45rem' : '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span style={{ fontSize: metaSize, color: '#64748b', fontWeight: 600 }}>
          Question {questionNumber} of {totalQuestions}
        </span>
        {countdownSeconds != null && !timeExpired && (
          <span
            style={{
              fontSize: timerSize,
              fontWeight: 'bold',
              color: countdownSeconds <= 5 ? '#dc2626' : '#4f46e5',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            ⏱ {countdownSeconds}s
          </span>
        )}
        {timeExpired && (
          <span style={{ fontSize: compact ? '0.9rem' : '1rem', fontWeight: 'bold', color: '#dc2626' }}>
            Time's up!
          </span>
        )}
      </div>
      <h2
        style={{
          fontSize: titleSize,
          fontWeight: 'bold',
          color: '#1e293b',
          marginBottom: compact ? '0.35rem' : '0.5rem',
          lineHeight: 1.45,
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
          hyphens: 'auto',
        }}
      >
        {question.prompt}
      </h2>
      <p style={{ fontSize: compact ? '0.82rem' : '0.9rem', color: '#64748b', marginBottom: compact ? '0.65rem' : '1rem', fontWeight: 500 }}>
        {(question.correctIndices ?? (question.correctIndex !== undefined ? [question.correctIndex] : [])).length > 1
          ? '☑️ Select all that apply'
          : '○ Select one answer'}
      </p>
      {question.imageUrl && (
        <div style={{ marginBottom: compact ? '0.65rem' : '1rem', textAlign: 'center' }}>
          <img
            src={question.imageUrl}
            alt="Question"
            style={{
              maxWidth: '100%',
              width: 'auto',
              height: 'auto',
              maxHeight: imgMax,
              borderRadius: '0.5rem',
              objectFit: 'contain',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            }}
          />
        </div>
      )}
    </div>
  );
};

export default LiveQuizQuestionCard;
