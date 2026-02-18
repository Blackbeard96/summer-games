import React from 'react';

interface BattlePassCompactCardProps {
  currentTier: number;
  maxTier: number;
  totalXP: number;
  onViewRewards: () => void;
}

const BattlePassCompactCard: React.FC<BattlePassCompactCardProps> = ({
  currentTier,
  maxTier,
  totalXP,
  onViewRewards
}) => {
  // Calculate progress for current tier
  const currentTierXP = currentTier > 0 ? (currentTier - 1) * 1000 : 0;
  const nextTierXP = currentTier < maxTier ? currentTier * 1000 : maxTier * 1000;
  const xpInCurrentTier = totalXP - currentTierXP;
  const xpNeededForNextTier = nextTierXP - currentTierXP;
  const progressPercent = xpNeededForNextTier > 0 
    ? Math.min(100, (xpInCurrentTier / xpNeededForNextTier) * 100) 
    : 100;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }}>
      {/* Main Battle Pass Card */}
      <div style={{
        background: 'rgba(31, 41, 55, 0.85)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '1rem',
        padding: '1.5rem'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.75rem'
        }}>
          <span style={{ fontSize: '1.5rem' }}>🛡️</span>
          <h3 style={{
            margin: 0,
            fontSize: '1.125rem',
            fontWeight: 'bold',
            color: 'white'
          }}>
            Battle Pass
          </h3>
        </div>
        <p style={{
          margin: 0,
          marginBottom: '1rem',
          fontSize: '0.875rem',
          color: 'rgba(255, 255, 255, 0.7)'
        }}>
          Season 0 Battle Pass
        </p>

        {/* Tier Progress */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem'
          }}>
            <span style={{
              fontSize: '0.875rem',
              fontWeight: 'bold',
              color: 'white'
            }}>
              Tier {currentTier} / {maxTier}
            </span>
            <span style={{
              fontSize: '0.875rem',
              color: 'rgba(255, 255, 255, 0.7)',
              fontWeight: 'bold'
            }}>
              {totalXP.toLocaleString()} XP
            </span>
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)',
              borderRadius: '4px',
              transition: 'width 0.3s ease',
              boxShadow: '0 0 8px rgba(251, 191, 36, 0.5)'
            }} />
          </div>
        </div>

        {/* View Rewards Button */}
        <button
          onClick={onViewRewards}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: 'rgba(139, 92, 246, 0.3)',
            border: '1px solid rgba(139, 92, 246, 0.5)',
            borderRadius: '0.5rem',
            color: 'white',
            fontSize: '0.875rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.5)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.3)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          View Rewards →
        </button>
      </div>

      {/* Featured Reward Card (Optional) */}
      <div style={{
        background: 'rgba(31, 41, 55, 0.85)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '1rem',
        padding: '1rem',
        textAlign: 'center'
      }}>
        <div style={{
          width: '100%',
          height: '120px',
          background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
          borderRadius: '0.5rem',
          marginBottom: '0.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '3rem',
          border: '2px solid rgba(251, 191, 36, 0.3)',
          boxShadow: '0 0 20px rgba(220, 38, 38, 0.5)'
        }}>
          🧥
        </div>
        <p style={{
          margin: 0,
          marginBottom: '0.5rem',
          fontSize: '0.75rem',
          color: '#fbbf24',
          fontWeight: 'bold'
        }}>
          ★ Featured Reward
        </p>
        <p style={{
          margin: 0,
          marginBottom: '0.25rem',
          fontSize: '0.875rem',
          fontWeight: 'bold',
          color: 'white'
        }}>
          Flame Emperor Cloak
        </p>
        <p style={{
          margin: 0,
          fontSize: '0.75rem',
          color: 'rgba(255, 255, 255, 0.7)'
        }}>
          Unlocks at Tier 18
        </p>
        <button
          onClick={onViewRewards}
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem 1rem',
            background: 'rgba(139, 92, 246, 0.3)',
            border: '1px solid rgba(139, 92, 246, 0.5)',
            borderRadius: '0.375rem',
            color: 'white',
            fontSize: '0.75rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.5)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.3)';
          }}
        >
          View →
        </button>
      </div>
    </div>
  );
};

export default BattlePassCompactCard;


