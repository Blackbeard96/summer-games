import React from 'react';
import { createPortal } from 'react-dom';

interface ChallengeReward {
  type: 'xp' | 'pp' | 'artifact' | 'truthMetal' | 'move' | 'actionCard';
  value?: string | number;
  name?: string;
}

interface ChallengeRewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  challengeTitle: string;
  rewards: ChallengeReward[];
  xpReward: number;
  ppReward: number;
}

const ChallengeRewardModal: React.FC<ChallengeRewardModalProps> = ({
  isOpen,
  onClose,
  challengeTitle,
  rewards,
  xpReward,
  ppReward
}) => {
  if (!isOpen) return null;

  const getRewardIcon = (type: string, reward?: ChallengeReward) => {
    switch (type) {
      case 'xp': return '⭐';
      case 'pp': return '💰';
      case 'artifact': 
        // Check if this is Captain's Helmet
        if (reward) {
          const artifactId = String(reward.value || '').toLowerCase();
          const artifactName = String(reward.name || '').toLowerCase();
          if (artifactId.includes('captain') || artifactId.includes('helmet') || 
              artifactName.includes('captain') || artifactName.includes('helmet')) {
            return '🪖'; // Hat/helmet emoji
          }
        }
        return '💍'; // Default ring emoji for other artifacts
      case 'truthMetal': return '💎';
      case 'move': return '⚡';
      case 'actionCard': return '🃏';
      default: return '🎁';
    }
  };

  // Map artifact IDs to user-friendly names
  const getArtifactDisplayName = (artifactId: string | number | undefined): string => {
    if (!artifactId) return 'Artifact';
    
    const id = String(artifactId);
    
    // Map artifact IDs to display names
    const artifactNameMap: { [key: string]: string } = {
      'truth_metal_currency': 'Truth Metal +1',
      'elemental_ring_level_1': 'Elemental Ring',
      'blaze_ring': 'Blaze Ring',
      'terra_ring': 'Terra Ring',
      'aqua_ring': 'Aqua Ring',
      'air_ring': 'Air Ring',
      'shield_artifact': 'Shield Artifact',
      // Add more mappings as needed
    };
    
    return artifactNameMap[id] || id;
  };

  const getRewardName = (reward: ChallengeReward) => {
    switch (reward.type) {
      case 'xp': return `${reward.value || 0} XP`;
      case 'pp': return `${reward.value || 0} PP`;
      case 'artifact': 
        // Use name if provided, otherwise map the value to a display name
        return reward.name || getArtifactDisplayName(reward.value) || 'Artifact';
      case 'truthMetal': return `${reward.value || 0} Truth Metal`;
      case 'move': return reward.name || reward.value || 'Move';
      case 'actionCard': return reward.name || reward.value || 'Action Card';
      default: return 'Reward';
    }
  };

  const artifactRewards = rewards.filter(r => r.type === 'artifact');
  const otherRewards = rewards.filter(r => r.type !== 'artifact' && r.type !== 'xp' && r.type !== 'pp');

  return createPortal(
    <>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(30px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes sparkle {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.1); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          animation: 'fadeIn 0.3s ease-out',
          padding: '1.5rem'
        }}
        onClick={onClose}
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '1.5rem',
            padding: '2.5rem',
            maxWidth: '500px',
            width: '100%',
            color: 'white',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            animation: 'slideUp 0.4s ease-out',
            position: 'relative',
            border: '3px solid rgba(255, 255, 255, 0.3)'
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
              width: '2.5rem',
              height: '2.5rem',
              color: 'white',
              fontSize: '1.5rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
              fontWeight: 'bold'
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

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem', animation: 'pulse 2s infinite' }}>
              🎉
            </div>
            <h2 style={{ 
              margin: 0, 
              fontSize: '2rem', 
              fontWeight: 'bold',
              textShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)'
            }}>
              Challenge Completed!
            </h2>
            <p style={{ 
              marginTop: '0.5rem', 
              fontSize: '1.1rem', 
              opacity: 0.9,
              fontWeight: '500'
            }}>
              {challengeTitle}
            </p>
          </div>

          {/* Rewards Section */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.15)',
            borderRadius: '1rem',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            backdropFilter: 'blur(10px)'
          }}>
            <h3 style={{
              margin: '0 0 1rem 0',
              fontSize: '1.25rem',
              fontWeight: 'bold',
              textAlign: 'center'
            }}>
              Rewards Earned
            </h3>

            {/* Main XP and PP Rewards */}
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '2rem',
              marginBottom: artifactRewards.length > 0 || otherRewards.length > 0 ? '1.5rem' : '0',
              paddingBottom: artifactRewards.length > 0 || otherRewards.length > 0 ? '1.5rem' : '0',
              borderBottom: artifactRewards.length > 0 || otherRewards.length > 0 ? '2px solid rgba(255, 255, 255, 0.2)' : 'none'
            }}>
              {xpReward > 0 && (
                <div style={{
                  textAlign: 'center',
                  animation: 'sparkle 1.5s infinite'
                }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
                    ⭐
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                    +{xpReward} XP
                  </div>
                </div>
              )}
              {ppReward > 0 && (
                <div style={{
                  textAlign: 'center',
                  animation: 'sparkle 1.5s infinite',
                  animationDelay: '0.3s'
                }}>
                  <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
                    💰
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
                    +{ppReward} PP
                  </div>
                </div>
              )}
            </div>

            {/* Artifact Rewards */}
            {artifactRewards.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  marginBottom: '0.75rem',
                  textAlign: 'center',
                  opacity: 0.9
                }}>
                  Artifacts Unlocked:
                </div>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}>
                  {artifactRewards.map((reward, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '0.5rem'
                      }}
                    >
                      <span style={{ fontSize: '1.5rem' }}>
                        {getRewardIcon(reward.type, reward)}
                      </span>
                      <span style={{ fontSize: '1rem', fontWeight: '500' }}>
                        {getRewardName(reward)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Other Rewards */}
            {otherRewards.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <div style={{
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  marginBottom: '0.75rem',
                  textAlign: 'center',
                  opacity: 0.9
                }}>
                  Additional Rewards:
                </div>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}>
                  {otherRewards.map((reward, index) => (
                    <div
                      key={index}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.75rem',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '0.5rem'
                      }}
                    >
                      <span style={{ fontSize: '1.5rem' }}>
                        {getRewardIcon(reward.type, reward)}
                      </span>
                      <span style={{ fontSize: '1rem', fontWeight: '500' }}>
                        {getRewardName(reward)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '1rem',
              background: 'rgba(255, 255, 255, 0.2)',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '0.75rem',
              color: 'white',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.transform = 'scale(1.02)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'scale(1)';
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

export default ChallengeRewardModal;

