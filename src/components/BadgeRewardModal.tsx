import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

interface BadgeRewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  notificationId: string;
  badgeId: string;
  badgeName: string;
  description?: string;
  imageUrl?: string;
  xpReward?: number;
  ppReward?: number;
  awardedAt?: any;
}

const BadgeRewardModal: React.FC<BadgeRewardModalProps> = ({
  isOpen,
  onClose,
  notificationId,
  badgeId,
  badgeName,
  description,
  imageUrl,
  xpReward = 0,
  ppReward = 0,
  awardedAt
}) => {
  const { currentUser } = useAuth();
  const [markingRead, setMarkingRead] = useState(false);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && notificationId && currentUser) {
      // Mark notification as read when modal opens
      const markAsRead = async () => {
        try {
          setMarkingRead(true);
          const notificationRef = doc(db, 'students', currentUser.uid, 'badgeNotifications', notificationId);
          await updateDoc(notificationRef, {
            read: true,
            readAt: serverTimestamp()
          });
        } catch (error) {
          console.error('Error marking badge notification as read:', error);
        } finally {
          setMarkingRead(false);
        }
      };
      markAsRead();
    }
  }, [isOpen, notificationId, currentUser]);

  if (!isOpen) return null;

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
        // Only close if clicking the backdrop, not the modal content
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
        {/* Close Button - Top Right */}
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
          paddingRight: '0.5rem',
          // Custom scrollbar styling
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(99, 102, 241, 0.5) rgba(0, 0, 0, 0.3)'
        }}
        className="badge-reward-modal-scroll"
        >
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem', flexShrink: 0 }}>
            <div style={{ fontSize: '4rem', marginBottom: '0.5rem' }}>🏅</div>
            <h2 style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              margin: 0,
              marginBottom: '0.5rem',
              background: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              New Badge Earned!
            </h2>
            {awardedAt && (
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>
                {formatDate(awardedAt)}
              </p>
            )}
          </div>

          {/* Badge Display */}
          <div style={{
            background: 'rgba(99, 102, 241, 0.1)',
            border: '2px solid rgba(99, 102, 241, 0.3)',
            borderRadius: '1rem',
            padding: '2rem',
            marginBottom: '1.5rem',
            textAlign: 'center'
          }}>
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={badgeName}
                style={{
                  width: '120px',
                  height: '120px',
                  objectFit: 'contain',
                  marginBottom: '1rem',
                  borderRadius: '0.5rem'
                }}
              />
            ) : (
              <div style={{
                fontSize: '5rem',
                marginBottom: '1rem'
              }}>
                🏅
              </div>
            )}
            <div style={{
              fontSize: '1.75rem',
              fontWeight: 'bold',
              color: '#818cf8',
              marginBottom: '0.75rem'
            }}>
              {badgeName}
            </div>
            {description && (
              <p style={{
                fontSize: '1rem',
                color: '#cbd5e1',
                lineHeight: 1.6,
                margin: 0
              }}>
                {description}
              </p>
            )}
          </div>

          {/* Rewards Section */}
          {(xpReward > 0 || ppReward > 0) && (
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
              <div style={{
                display: 'grid',
                gridTemplateColumns: xpReward > 0 && ppReward > 0 ? '1fr 1fr' : '1fr',
                gap: '1rem'
              }}>
                {xpReward > 0 && (
                  <div style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '0.75rem',
                    padding: '1rem',
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
                      +{xpReward} XP
                    </div>
                  </div>
                )}
                {ppReward > 0 && (
                  <div style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '0.75rem',
                    padding: '1rem',
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
                      color: '#10b981'
                    }}>
                      +{ppReward} PP
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Close Button - Fixed at bottom */}
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

export default BadgeRewardModal;

