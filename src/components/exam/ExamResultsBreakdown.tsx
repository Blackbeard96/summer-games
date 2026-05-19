import React, { useState } from 'react';
import type { TrainingAnswer, TrainingQuestion } from '../../types/trainingGrounds';

export interface ExamResultsBreakdownProps {
  questions: TrainingQuestion[];
  answers: TrainingAnswer[];
  scorePercent: number;
  correctCount: number;
  title?: string;
}

function formatChoiceLabels(question: TrainingQuestion, indices: number[]): string {
  if (indices.length === 0) return 'None selected';
  return indices
    .map((idx) => `${String.fromCharCode(65 + idx)}: ${question.options[idx] ?? '—'}`)
    .join(', ');
}

const ExamResultsBreakdown: React.FC<ExamResultsBreakdownProps> = ({
  questions,
  answers,
  scorePercent,
  correctCount,
  title,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const scoreColor =
    scorePercent >= 70 ? '#059669' : scorePercent >= 50 ? '#d97706' : '#dc2626';

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
        {title ? (
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.35rem', fontWeight: 800, color: '#1e293b' }}>
            {title}
          </h2>
        ) : null}
        <p style={{ fontSize: '2.5rem', fontWeight: 800, color: scoreColor, margin: '0.25rem 0' }}>
          {Math.round(scorePercent)}%
        </p>
        <p style={{ color: '#64748b', margin: 0 }}>
          {correctCount} of {questions.length} fully correct
        </p>
      </div>

      <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1e293b', marginBottom: '0.75rem' }}>
        Question review
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {questions.map((question, index) => {
          const answer = answers.find((a) => a.questionId === question.id);
          const isCorrect = Boolean(answer?.isCorrect);
          const partial = (answer?.partialCredit ?? 0) > 0 && !isCorrect;
          const borderColor = isCorrect ? '#10b981' : partial ? '#d97706' : '#ef4444';
          const headerBg = isCorrect ? '#ecfdf5' : partial ? '#fffbeb' : '#fef2f2';
          const isOpen = expanded.has(question.id);
          const selectedIndices =
            answer?.selectedIndices ??
            (answer?.selectedIndex !== undefined ? [answer.selectedIndex] : []);
          const correctIndices =
            question.correctIndices ??
            (question.correctIndex !== undefined ? [question.correctIndex] : []);

          return (
            <div
              key={question.id}
              style={{
                border: `2px solid ${borderColor}`,
                borderRadius: '0.5rem',
                overflow: 'hidden',
                background: '#fff',
              }}
            >
              <button
                type="button"
                onClick={() => toggle(question.id)}
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem',
                  background: headerBg,
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '0.75rem',
                  textAlign: 'left',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 800, flexShrink: 0 }}>
                    {isCorrect ? '✓' : partial ? '~' : '✗'}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>
                    Q{index + 1}:{' '}
                    {question.prompt.length > 72
                      ? `${question.prompt.slice(0, 72)}…`
                      : question.prompt}
                  </span>
                </span>
                <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{isOpen ? '▼' : '▶'}</span>
              </button>
              {isOpen ? (
                <div style={{ padding: '1rem', borderTop: `1px solid ${borderColor}` }}>
                  <p style={{ margin: '0 0 0.75rem', color: '#334155' }}>
                    <strong>Question:</strong> {question.prompt}
                  </p>
                  {question.imageUrl ? (
                    <div style={{ marginBottom: '0.75rem', textAlign: 'center' }}>
                      <img
                        src={question.imageUrl}
                        alt=""
                        style={{ maxWidth: '100%', maxHeight: 260, borderRadius: '0.5rem' }}
                      />
                    </div>
                  ) : null}
                  <p style={{ margin: '0 0 0.5rem', color: '#334155' }}>
                    <strong>Your answer:</strong>{' '}
                    <span
                      style={{
                        color: isCorrect ? '#059669' : partial ? '#d97706' : '#dc2626',
                        fontWeight: 600,
                      }}
                    >
                      {formatChoiceLabels(question, selectedIndices)}
                    </span>
                    {partial ? (
                      <span style={{ color: '#d97706', marginLeft: '0.35rem' }}>
                        ({Math.round((answer?.partialCredit ?? 0) * 100)}% credit)
                      </span>
                    ) : null}
                  </p>
                  <p style={{ margin: '0 0 0.5rem', color: '#334155' }}>
                    <strong>Correct answer:</strong>{' '}
                    <span style={{ color: '#059669', fontWeight: 600 }}>
                      {formatChoiceLabels(question, correctIndices)}
                    </span>
                  </p>
                  {question.explanation ? (
                    <p
                      style={{
                        margin: '0.75rem 0 0',
                        padding: '0.65rem',
                        background: '#f8fafc',
                        borderRadius: '0.4rem',
                        color: '#64748b',
                        fontSize: '0.9rem',
                      }}
                    >
                      <strong>Explanation:</strong> {question.explanation}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ExamResultsBreakdown;
