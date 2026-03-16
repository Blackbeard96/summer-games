import React from 'react';
import type { TrainingQuestion } from '../../types/trainingGrounds';

interface LiveQuizQuestionCardProps {
  question: TrainingQuestion;
  questionNumber: number;
  totalQuestions: number;
  countdownSeconds?: number | null;
  /** When true, show "Time's up" or similar */
  timeExpired?: boolean;
}

export const LiveQuizQuestionCard: React.FC<LiveQuizQuestionCardProps> = ({
  question,
  questionNumber,
  totalQuestions,
  countdownSeconds,
  timeExpired,
}) => {
  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
        borderRadius: '1rem',
        padding: '1.5rem',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
        border: '2px solid #e2e8f0',
        marginBottom: '1rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 600 }}>
          Question {questionNumber} of {totalQuestions}
        </span>
        {countdownSeconds != null && !timeExpired && (
          <span
            style={{
              fontSize: '1.25rem',
              fontWeight: 'bold',
              color: countdownSeconds <= 5 ? '#dc2626' : '#4f46e5',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            ⏱ {countdownSeconds}s
          </span>
        )}
        {timeExpired && (
          <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#dc2626' }}>
            Time's up!
          </span>
        )}
      </div>
      <h2 style={{ fontSize: '1.35rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '1rem', lineHeight: 1.4 }}>
        {question.prompt}
      </h2>
      {question.imageUrl && (
        <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
          <img
            src={question.imageUrl}
            alt="Question"
            style={{
              maxWidth: '100%',
              maxHeight: '220px',
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
