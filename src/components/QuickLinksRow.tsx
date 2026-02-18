import React from 'react';
import { useNavigate } from 'react-router-dom';

interface QuickLink {
  label: string;
  path: string;
  icon: string;
}

const quickLinks: QuickLink[] = [
  { label: 'Battle Arena', path: '/battle', icon: '⚔️' },
  { label: "Player's Journey", path: '/chapters', icon: '📖' },
  { label: 'Market', path: '/marketplace', icon: '🛒' },
  { label: 'Squads', path: '/squads', icon: '👥' },
  { label: 'Leaderboard', path: '/leaderboard', icon: '🏆' },
];

const QuickLinksRow: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{
      display: 'flex',
      gap: '0.75rem',
      padding: '0.75rem 1rem',
      background: 'rgba(31, 41, 55, 0.8)',
      backdropFilter: 'blur(10px)',
      borderRadius: '0.5rem',
      marginBottom: '1.5rem',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      flexWrap: 'wrap',
      justifyContent: 'center'
    }}>
      {quickLinks.map((link) => (
        <button
          key={link.path}
          onClick={() => navigate(link.path)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '0.375rem',
            color: 'white',
            fontSize: '0.875rem',
            fontWeight: '500',
            cursor: 'pointer',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <span>{link.icon}</span>
          <span>{link.label}</span>
        </button>
      ))}
    </div>
  );
};

export default QuickLinksRow;


