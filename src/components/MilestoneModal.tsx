import React from 'react';
import { createPortal } from 'react-dom';

interface MilestoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  milestone: number;
  moveName: string;
  rewards: {
    pp: number;
    tmShards?: number;
    xp?: number;
  };
}

const MilestoneModal: React.FC<MilestoneModalProps> = ({
  isOpen,
  onClose,
  milestone,
  moveName,
  rewards
}) => {
  if (!isOpen) return null;

  return createPortal(
    <>
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideInUp {
            from {
              opacity: 0;
              transform: translateY(30px) scale(0.95);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
        `}
      </style>
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
          animation: 'fadeIn 0.3s ease-out'
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            animation: 'slideInUp 0.4s ease-out',
            position: 'relative',
            border: '4px solid #fbbf24'
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
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '2rem',
              height: '2rem',
              color: 'white',
              fontSize: '1.5rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            ×
          </button>

          {/* Celebration Icon */}
          <div
            style={{
              textAlign: 'center',
              marginBottom: '1.5rem',
              animation: 'pulse 2s ease-in-out infinite'
            }}
          >
            <div style={{ fontSize: '4rem' }}>🎉</div>
          </div>

          {/* Title */}
          <h2
            style={{
              color: 'white',
              fontSize: '2rem',
              fontWeight: 'bold',
              textAlign: 'center',
              marginBottom: '1rem',
              textShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)'
            }}
          >
            Milestone Achieved!
          </h2>

          {/* Milestone Info */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}
          >
            <p
              style={{
                color: 'white',
                fontSize: '1.25rem',
                marginBottom: '0.5rem',
                fontWeight: '600'
              }}
            >
              {moveName}
            </p>
            <p
              style={{
                color: '#fbbf24',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                textShadow: '1px 1px 2px rgba(0, 0, 0, 0.3)'
              }}
            >
              {milestone} Uses Milestone!
            </p>
          </div>

          {/* Rewards Section */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              marginBottom: '1.5rem'
            }}
          >
            <h3
              style={{
                color: 'white',
                fontSize: '1.25rem',
                fontWeight: 'bold',
                marginBottom: '1rem',
                textAlign: 'center'
              }}
            >
              Rewards Earned:
            </h3>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}
            >
              {rewards.pp > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255, 255, 255, 0.1)',
                    padding: '0.75rem',
                    borderRadius: '0.5rem'
                  }}
                >
                  <span style={{ color: 'white', fontSize: '1.1rem' }}>
                    💰 Power Points
                  </span>
                  <span
                    style={{
                      color: '#fbbf24',
                      fontSize: '1.25rem',
                      fontWeight: 'bold'
                    }}
                  >
                    +{rewards.pp} PP
                  </span>
                </div>
              )}
              {rewards.tmShards && rewards.tmShards > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255, 255, 255, 0.1)',
                    padding: '0.75rem',
                    borderRadius: '0.5rem'
                  }}
                >
                  <span style={{ color: 'white', fontSize: '1.1rem' }}>
                    ⭐ Truth Metal Shard{rewards.tmShards > 1 ? 's' : ''}
                  </span>
                  <span
                    style={{
                      color: '#fbbf24',
                      fontSize: '1.25rem',
                      fontWeight: 'bold'
                    }}
                  >
                    +{rewards.tmShards}
                  </span>
                </div>
              )}
              {rewards.xp && rewards.xp > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(255, 255, 255, 0.1)',
                    padding: '0.75rem',
                    borderRadius: '0.5rem'
                  }}
                >
                  <span style={{ color: 'white', fontSize: '1.1rem' }}>
                    ⚡ Experience Points
                  </span>
                  <span
                    style={{
                      color: '#fbbf24',
                      fontSize: '1.25rem',
                      fontWeight: 'bold'
                    }}
                  >
                    +{rewards.xp} XP
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
              color: 'white',
              border: 'none',
              padding: '1rem',
              borderRadius: '0.5rem',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.2)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.2)';
            }}
          >
            Awesome!
          </button>
        </div>
      </div>
    </>,
    document.body
  );
};

export default MilestoneModal;





