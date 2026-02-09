import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface RewardData {
  // Badge rewards
  badgeId?: string;
  badgeName?: string;
  badgeDescription?: string;
  badgeImageUrl?: string;
  
  // PP rewards (use ppChange, not ppReward)
  ppChange?: number;
  originalPP?: number;
  newPP?: number;
  
  // XP rewards
  xpReward?: number;
  
  // Artifacts
  artifacts?: Array<{
    id: string;
    name: string;
    icon?: string;
  }>;
  
  // Metadata
  awardedAt?: any;
  notificationId?: string;
  notificationType?: 'badge' | 'pp_approval' | 'badge_and_pp';
  scorekeeperName?: string;
}

interface RewardNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  reward: RewardData | null;
}

const RewardNotificationModal: React.FC<RewardNotificationModalProps> = ({
  isOpen,
  onClose,
  reward
}) => {
  const { currentUser } = useAuth();
  const [markingRead, setMarkingRead] = React.useState(false);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Mark notification as read when modal opens
  useEffect(() => {
    if (isOpen && reward?.notificationId && currentUser && reward.notificationType) {
      const markAsRead = async () => {
        try {
          setMarkingRead(true);
          
          if (reward.notificationType === 'badge') {
            // Mark badge notification as read
            const notificationRef = doc(db, 'students', currentUser.uid, 'badgeNotifications', reward.notificationId!);
            await updateDoc(notificationRef, {
              read: true,
              readAt: serverTimestamp()
            });
          } else if (reward.notificationType === 'pp_approval' || reward.notificationType === 'badge_and_pp') {
            // Mark PP approval notification as read
            const notificationRef = doc(db, 'students', currentUser.uid, 'notifications', reward.notificationId!);
            await updateDoc(notificationRef, {
              read: true,
              readAt: serverTimestamp()
            });
          }
        } catch (error) {
          console.error('Error marking notification as read:', error);
        } finally {
          setMarkingRead(false);
        }
      };
      markAsRead();
    }
  }, [isOpen, reward?.notificationId, currentUser, reward?.notificationType]);

  if (!isOpen || !reward) return null;

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    try {
      if (timestamp.toDate) {
        return timestamp.toDate().toLocaleString();
      }
      if (timestamp instanceof Date) {
        return timestamp.toLocaleString();
      }
      return new Date(timestamp).toLocaleString();
    } catch (error) {
      return '';
    }
  };

  const hasRewards = (reward.ppChange && reward.ppChange !== 0) || 
                     (reward.xpReward && reward.xpReward > 0) || 
                     (reward.artifacts && reward.artifacts.length > 0) ||
                     reward.badgeName;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100000,
        padding: '1rem',
        overflowY: 'auto'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: '1.5rem',
          padding: '2rem',
          maxWidth: '600px',
          width: '100%',
          maxHeight: 'calc(100vh - 2rem)',
          color: 'white',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
          border: '2px solid rgba(99, 102, 241, 0.5)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.5)',
            borderRadius: '0.5rem',
            padding: '0.5rem',
            color: '#fca5a5',
            cursor: 'pointer',
            fontSize: '1.25rem',
            fontWeight: 'bold',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.4)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ×
        </button>

        {/* Scrollable Content */}
        <div style={{
          overflowY: 'auto',
          overflowX: 'hidden',
          flex: 1,
          paddingRight: '0.5rem'
        }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem', flexShrink: 0 }}>
            <div style={{ fontSize: '4rem', marginBottom: '0.5rem' }}>
              {reward.badgeName ? '🏅' : '💰'}
            </div>
            <h2 style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              margin: 0,
              marginBottom: '0.5rem',
              background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              {reward.badgeName ? 'New Badge Earned!' : 'Rewards Updated!'}
            </h2>
            {reward.awardedAt && (
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>
                {formatDate(reward.awardedAt)}
              </p>
            )}
            {reward.scorekeeperName && (
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: '0.25rem 0 0 0' }}>
                Approved by: {reward.scorekeeperName}
              </p>
            )}
          </div>

          {/* Badge Display */}
          {reward.badgeName && (
            <div style={{
              background: 'rgba(99, 102, 241, 0.1)',
              border: '2px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '1rem',
              padding: '2rem',
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              {reward.badgeImageUrl ? (
                <img
                  src={reward.badgeImageUrl}
                  alt={reward.badgeName}
                  style={{
                    width: '120px',
                    height: '120px',
                    objectFit: 'contain',
                    marginBottom: '1rem',
                    borderRadius: '0.5rem'
                  }}
                />
              ) : (
                <div style={{ fontSize: '5rem', marginBottom: '1rem' }}>🏅</div>
              )}
              <div style={{
                fontSize: '1.75rem',
                fontWeight: 'bold',
                color: '#818cf8',
                marginBottom: '0.75rem'
              }}>
                {reward.badgeName}
              </div>
              {reward.badgeDescription && (
                <p style={{
                  fontSize: '1rem',
                  color: '#cbd5e1',
                  lineHeight: 1.6,
                  margin: 0
                }}>
                  {reward.badgeDescription}
                </p>
              )}
            </div>
          )}

          {/* Rewards Section */}
          {hasRewards && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '2px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '1rem',
              padding: '1.5rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{
                fontSize: '1.125rem',
                fontWeight: 'bold',
                color: '#10b981',
                marginBottom: '1rem',
                textAlign: 'center'
              }}>
                🎉 Rewards Earned
              </div>
              
              {/* PP Change */}
              {reward.ppChange !== undefined && reward.ppChange !== 0 && (
                <div style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  marginBottom: '1rem',
                  textAlign: 'center'
                }}>
                  <div style={{
                    fontSize: '0.875rem',
                    color: '#94a3b8',
                    marginBottom: '0.5rem',
                    fontWeight: 'bold'
                  }}>
                    Power Points
                  </div>
                  <div style={{
                    fontSize: '2rem',
                    fontWeight: 'bold',
                    color: reward.ppChange > 0 ? '#10b981' : '#ef4444'
                  }}>
                    {reward.ppChange > 0 ? '+' : ''}{reward.ppChange} PP
                  </div>
                  {reward.originalPP !== undefined && reward.newPP !== undefined && (
                    <div style={{
                      fontSize: '0.875rem',
                      color: '#94a3b8',
                      marginTop: '0.5rem'
                    }}>
                      {reward.originalPP} → {reward.newPP}
                    </div>
                  )}
                </div>
              )}

              {/* XP Reward */}
              {reward.xpReward && reward.xpReward > 0 && (
                <div style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  marginBottom: '1rem',
                  textAlign: 'center'
                }}>
                  <div style={{
                    fontSize: '0.875rem',
                    color: '#94a3b8',
                    marginBottom: '0.5rem',
                    fontWeight: 'bold'
                  }}>
                    Experience Points
                  </div>
                  <div style={{
                    fontSize: '2rem',
                    fontWeight: 'bold',
                    color: '#10b981'
                  }}>
                    +{reward.xpReward} XP
                  </div>
                </div>
              )}

              {/* Artifacts */}
              {reward.artifacts && reward.artifacts.length > 0 && (
                <div style={{
                  background: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{
                    fontSize: '0.875rem',
                    color: '#94a3b8',
                    marginBottom: '0.75rem',
                    fontWeight: 'bold',
                    textAlign: 'center'
                  }}>
                    Artifacts Earned
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                    gap: '0.75rem'
                  }}>
                    {reward.artifacts.map((artifact, index) => (
                      <div
                        key={index}
                        style={{
                          background: 'rgba(99, 102, 241, 0.2)',
                          borderRadius: '0.5rem',
                          padding: '0.75rem',
                          textAlign: 'center',
                          border: '1px solid rgba(99, 102, 241, 0.3)'
                        }}
                      >
                        {artifact.icon && (
                          <div style={{ fontSize: '2rem', marginBottom: '0.25rem' }}>
                            {artifact.icon}
                          </div>
                        )}
                        <div style={{
                          fontSize: '0.75rem',
                          color: '#cbd5e1',
                          fontWeight: 'bold'
                        }}>
                          {artifact.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Close Button */}
        <div style={{ flexShrink: 0, marginTop: '1rem' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            style={{
              width: '100%',
              padding: '1rem',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              border: 'none',
              borderRadius: '0.75rem',
              color: 'white',
              fontSize: '1.125rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(99, 102, 241, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.4)';
            }}
          >
            Awesome!
          </button>
        </div>
      </div>
    </div>
  );
};

export default RewardNotificationModal;

