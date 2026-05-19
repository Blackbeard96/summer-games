import React from 'react';
import { formatExamCountdown, type LiveEventExamSettings } from '../../types/liveEventExam';

export interface ExamCountdownProps {
  remainingSec: number | null;
  settings: LiveEventExamSettings;
  /** Host banner vs student sticky chip */
  variant?: 'host' | 'student';
  expired?: boolean;
}

const ExamCountdown: React.FC<ExamCountdownProps> = ({
  remainingSec,
  settings,
  variant = 'student',
  expired = false,
}) => {
  if (!settings.timeLimitMinutes || remainingSec === null) return null;

  const urgent = remainingSec <= 60 && !expired;
  const color = expired ? '#dc2626' : urgent ? '#dc2626' : '#4f46e5';
  const bg = expired ? '#fef2f2' : urgent ? '#fef2f2' : '#eef2ff';
  const border = expired ? '#fecaca' : urgent ? '#fecaca' : '#c7d2fe';

  const label = expired
    ? 'Time is up'
    : `Time left: ${formatExamCountdown(remainingSec)}`;

  if (variant === 'host') {
    return (
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.4rem 0.75rem',
          borderRadius: '999px',
          background: bg,
          border: `1px solid ${border}`,
          fontSize: '0.85rem',
          fontWeight: 700,
          color,
        }}
      >
        <span aria-hidden>⏱</span>
        <span>
          {label}
          <span style={{ fontWeight: 500, color: '#64748b', marginLeft: 6 }}>
            ({settings.timeLimitMinutes} min limit)
          </span>
        </span>
      </div>
    );
  }

  return (
    <div
      role="timer"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 2,
        minWidth: 120,
      }}
    >
      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
        Exam time
      </span>
      <span
        style={{
          fontSize: variant === 'student' ? '1.35rem' : '1rem',
          fontWeight: 800,
          fontVariantNumeric: 'tabular-nums',
          color,
          padding: '0.35rem 0.65rem',
          borderRadius: '0.5rem',
          background: bg,
          border: `2px solid ${border}`,
        }}
      >
        {label}
      </span>
    </div>
  );
};

export default ExamCountdown;
