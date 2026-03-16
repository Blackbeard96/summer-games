import React from 'react';

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  score: number;
  correctCount?: number;
  /** PP earned from this quiz (placement rewards); shown at end of quiz */
  ppEarned?: number;
}

interface LiveQuizLeaderboardProps {
  entries: LeaderboardEntry[];
  title?: string;
  maxEntries?: number;
}

export const LiveQuizLeaderboard: React.FC<LiveQuizLeaderboardProps> = ({
  entries,
  title = 'Leaderboard',
  maxEntries = 10,
}) => {
  const sorted = [...entries].sort((a, b) => b.score - a.score).slice(0, maxEntries);

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
        borderRadius: '1rem',
        padding: '1.25rem',
        border: '2px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
    >
      <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1e293b', marginBottom: '1rem' }}>
        🏆 {title}
      </h3>
      {sorted.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: '0.95rem' }}>No scores yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {sorted.map((entry, i) => (
            <li
              key={entry.uid}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.6rem 0.75rem',
                borderRadius: '0.5rem',
                marginBottom: i < sorted.length - 1 ? '0.5rem' : 0,
                background: i < 3 ? (i === 0 ? '#fef3c7' : i === 1 ? '#f3f4f6' : '#fed7aa') : '#ffffff',
                border: i === 0 ? '2px solid #f59e0b' : '1px solid #e5e7eb',
              }}
            >
              <span style={{ fontWeight: 'bold', color: '#64748b', minWidth: '1.5rem' }}>
                #{i + 1}
              </span>
              <span style={{ flex: 1, fontWeight: 600, color: '#1e293b' }}>{entry.displayName}</span>
              <span style={{ fontWeight: 'bold', color: '#4f46e5' }}>{entry.score} pts</span>
              {entry.correctCount != null && (
                <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                  {entry.correctCount} correct
                </span>
              )}
              {entry.ppEarned != null && entry.ppEarned > 0 && (
                <span style={{ fontWeight: 600, color: '#059669', fontSize: '0.875rem' }}>
                  +{entry.ppEarned} PP
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default LiveQuizLeaderboard;
