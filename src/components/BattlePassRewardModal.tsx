import React from 'react';

interface BattlePassRewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  reward: {
    type: 'pp' | 'xp' | 'item' | 'shard' | 'actionCard';
    amount: number;
    name?: string;
    actionCardName?: string;
    imageUrl?: string;
  } | null;
  tier: number;
  isPremium: boolean;
}

const BattlePassRewardModal: React.FC<BattlePassRewardModalProps> = ({ 
  isOpen, 
  onClose, 
  reward, 
  tier, 
  isPremium 
}) => {
  if (!isOpen || !reward) return null;

  const getRewardIcon = (type: string) => {
    switch (type) {
      case 'pp': return '🪙';
      case 'xp': return '⭐';
      case 'shard': return '💎';
      case 'actionCard': return '🃏';
      default: return '🎁';
    }
  };

  const getRewardName = () => {
    if (reward.type === 'pp') {
      return `${reward.amount} PP`;
    } else if (reward.type === 'xp') {
      return `${reward.amount} XP`;
    } else if (reward.type === 'shard') {
      return `${reward.amount} Truth Metal Shard${reward.amount > 1 ? 's' : ''}`;
    } else if (reward.type === 'actionCard') {
      return `${reward.actionCardName} Action Card`;
    }
    return 'Reward';
  };

  const getRewardDescription = () => {
    return `You reached Tier ${tier} in the Battle Pass${isPremium ? ' (Premium)' : ' (Free)'}!`;
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 20000,
      animation: 'fadeIn 0.3s ease-in'
    }}
    onClick={onClose}
    >
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '1.5rem',
        padding: '2rem',
        maxWidth: '500px',
        width: '90%',
        border: `3px solid ${isPremium ? '#fbbf24' : '#8b5cf6'}`,
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        animation: 'slideUp 0.3s ease-out',
        position: 'relative'
      }}
      onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            borderRadius: '50%',
            width: '2rem',
            height: '2rem',
            color: 'white',
            fontSize: '1.25rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          }}
        >
          ×
        </button>

        {/* Header */}
        <div style={{
          textAlign: 'center',
          marginBottom: '1.5rem'
        }}>
          <div style={{
            fontSize: '4rem',
            marginBottom: '0.5rem'
          }}>
            {getRewardIcon(reward.type)}
          </div>
          <h2 style={{
            color: 'white',
            fontSize: '1.75rem',
            fontWeight: 'bold',
            margin: '0.5rem 0',
            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)'
          }}>
            Reward Claimed!
          </h2>
          <p style={{
            color: 'rgba(255, 255, 255, 0.8)',
            fontSize: '1rem',
            margin: '0.5rem 0'
          }}>
            {getRewardDescription()}
          </p>
        </div>

        {/* Reward Details */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '1rem',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            marginBottom: '1rem'
          }}>
            {reward.imageUrl && (
              <img 
                src={reward.imageUrl} 
                alt={getRewardName()}
                style={{
                  width: '80px',
                  height: '80px',
                  objectFit: 'contain',
                  borderRadius: '0.5rem'
                }}
              />
            )}
            <div style={{
              fontSize: '2.5rem'
            }}>
              {!reward.imageUrl && getRewardIcon(reward.type)}
            </div>
          </div>
          <h3 style={{
            color: 'white',
            fontSize: '1.5rem',
            fontWeight: 'bold',
            textAlign: 'center',
            margin: '0.5rem 0'
          }}>
            {getRewardName()}
          </h3>
          {isPremium && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              marginTop: '0.5rem'
            }}>
              <span style={{
                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                color: 'white',
                padding: '0.25rem 0.75rem',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 'bold'
              }}>
                ⭐ Premium Reward
              </span>
            </div>
          )}
        </div>

        {/* How they earned it */}
        <div style={{
          background: 'rgba(139, 92, 246, 0.1)',
          borderRadius: '0.75rem',
          padding: '1rem',
          marginBottom: '1.5rem',
          border: '1px solid rgba(139, 92, 246, 0.3)'
        }}>
          <p style={{
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '0.875rem',
            textAlign: 'center',
            margin: 0,
            lineHeight: '1.5'
          }}>
            <strong>How you earned it:</strong><br />
            You've accumulated enough XP to reach Tier {tier} in the Battle Pass!
            {isPremium && ' As a Premium member, you received this enhanced reward.'}
          </p>
        </div>

        {/* OK Button */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '0.75rem',
            background: isPremium 
              ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
              : 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
            border: 'none',
            borderRadius: '0.75rem',
            color: 'white',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
          }}
        >
          Awesome!
        </button>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        @keyframes slideUp {
          from {
            transform: translateY(30px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default BattlePassRewardModal;


