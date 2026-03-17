import React from 'react';
import type { TrainingQuestion } from '../../types/trainingGrounds';

interface LiveQuizAnswerOptionsProps {
  question: TrainingQuestion;
  selectedIndices: number[];
  onSelect: (index: number) => void;
  disabled?: boolean;
  /** After timer ends: show correct/incorrect */
  reveal?: boolean;
  /** Player's response for reveal (which indices they selected) */
  submittedIndices?: number[];
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export const LiveQuizAnswerOptions: React.FC<LiveQuizAnswerOptionsProps> = ({
  question,
  selectedIndices,
  onSelect,
  disabled,
  reveal,
  submittedIndices,
}) => {
  const correctIndices = question.correctIndices ?? (question.correctIndex !== undefined ? [question.correctIndex] : []);
  const selected = submittedIndices ?? selectedIndices;
  const isMultiple = correctIndices.length > 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '0.25rem', fontWeight: 600 }}>
        {isMultiple ? 'Select all that apply' : 'Select one answer'}
      </p>
      {question.options.map((option, index) => {
        const isSelected = selected.includes(index);
        const isCorrect = correctIndices.includes(index);
        const showCorrect = reveal && isCorrect;
        const showIncorrect = reveal && isSelected && !isCorrect;

        let bg = '#ffffff';
        let border = '2px solid #e2e8f0';
        let color = '#1e293b';
        if (reveal) {
          if (showCorrect) {
            bg = '#10b981';
            border = '2px solid #059669';
            color = '#fff';
          } else if (showIncorrect) {
            bg = '#ef4444';
            border = '2px solid #dc2626';
            color = '#fff';
          } else if (isCorrect) {
            bg = '#d1fae5';
            border = '2px solid #10b981';
            color = '#065f46';
          } else {
            bg = '#f1f5f9';
            border = '2px solid #e2e8f0';
            color = '#64748b';
          }
        } else if (isSelected) {
          bg = '#eef2ff';
          border = '2px solid #4f46e5';
          color = '#312e81';
        }

        return (
          <button
            key={index}
            type="button"
            onClick={() => !disabled && onSelect(index)}
            disabled={disabled}
            style={{
              width: '100%',
              padding: '1rem 1.25rem',
              borderRadius: '0.75rem',
              border,
              background: bg,
              color,
              fontSize: '1.05rem',
              textAlign: 'left',
              cursor: disabled ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              fontWeight: 500,
              transition: 'all 0.2s',
              boxShadow: isSelected && !reveal ? '0 2px 8px rgba(79, 70, 229, 0.25)' : '0 1px 3px rgba(0,0,0,0.06)',
            }}
          >
            <span
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: reveal ? 'transparent' : (isSelected ? '#4f46e5' : '#e2e8f0'),
                color: reveal ? (showCorrect || showIncorrect ? '#fff' : color) : (isSelected ? '#fff' : '#64748b'),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '1rem',
                flexShrink: 0,
              }}
            >
              {OPTION_LABELS[index] ?? index + 1}
            </span>
            <span style={{ flex: 1 }}>{option}</span>
            {reveal && showCorrect && <span style={{ fontSize: '1.25rem' }}>✓</span>}
            {reveal && showIncorrect && <span style={{ fontSize: '1.25rem' }}>✗</span>}
          </button>
        );
      })}
    </div>
  );
};

export default LiveQuizAnswerOptions;
