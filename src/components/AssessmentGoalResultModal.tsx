import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ArtifactReward } from '../types/assessmentGoals';

interface AssessmentGoalResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  notificationId: string;
  assessmentTitle: string;
  goalScore: number;
  actualScore: number;
  maxScore: number;
  outcome: 'hit' | 'miss' | 'exceed';
  ppChange: number;
  artifactsGranted?: ArtifactReward[];
}

const AssessmentGoalResultModal: React.FC<AssessmentGoalResultModalProps> = ({
  isOpen,
  onClose,
  notificationId,
  assessmentTitle,
  goalScore,
  actualScore,
  maxScore,
  outcome,
  ppChange,
  artifactsGranted = []
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
          const notificationRef = doc(db, 'students', currentUser.uid, 'notifications', notificationId);
          await updateDoc(notificationRef, {
            read: true,
            readAt: serverTimestamp()
          });
        } catch (error) {
          console.error('Error marking notification as read:', error);
        } finally {
          setMarkingRead(false);
        }
      };
      markAsRead();
    }
  }, [isOpen, notificationId, currentUser]);

  if (!isOpen) return null;

  const outcomeText = outcome === 'hit' ? 'Hit' : outcome === 'exceed' ? 'Exceeded' : 'Missed';
  const outcomeColor = outcome === 'hit' ? '#10b981' : outcome === 'exceed' ? '#3b82f6' : '#ef4444';
  const outcomeBg = outcome === 'hit' ? 'rgba(16, 185, 129, 0.1)' : outcome === 'exceed' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)';
  const delta = actualScore - goalScore;
  const deltaText = delta > 0 ? `+${delta}` : `${delta}`;

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
          border: '2px solid rgba(139, 92, 246, 0.5)',
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
          scrollbarColor: 'rgba(139, 92, 246, 0.5) rgba(0, 0, 0, 0.3)'
        }}
        className="assessment-goal-modal-scroll"
        >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem', flexShrink: 0 }}>
          <div style={{ fontSize: '4rem', marginBottom: '0.5rem' }}>
            {outcome === 'hit' ? '🎯' : outcome === 'exceed' ? '🌟' : '⚠️'}
          </div>
          <h2 style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            margin: 0,
            marginBottom: '0.5rem',
            background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Assessment Goal Result
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '1.125rem', margin: 0 }}>
            {assessmentTitle}
          </p>
        </div>

        {/* Outcome Badge */}
        <div style={{
          background: outcomeBg,
          border: `2px solid ${outcomeColor}`,
          borderRadius: '1rem',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: outcomeColor,
            marginBottom: '0.5rem'
          }}>
            {outcomeText} Your Goal!
          </div>
          <div style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
            {outcome === 'hit' && 'You hit your goal exactly!'}
            {outcome === 'exceed' && 'You exceeded your goal!'}
            {outcome === 'miss' && 'You missed your goal.'}
          </div>
        </div>

        {/* Score Comparison */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}>
          {/* Goal Score */}
          <div style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '2px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '1rem',
            padding: '1.5rem',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '0.875rem',
              color: '#94a3b8',
              marginBottom: '0.5rem',
              fontWeight: 'bold'
            }}>
              Your Goal
            </div>
            <div style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              color: '#60a5fa'
            }}>
              {goalScore}
            </div>
            <div style={{
              fontSize: '0.75rem',
              color: '#64748b',
              marginTop: '0.25rem'
            }}>
              / {maxScore}
            </div>
          </div>

          {/* Actual Score */}
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '2px solid rgba(16, 185, 129, 0.3)',
            borderRadius: '1rem',
            padding: '1.5rem',
            textAlign: 'center'
          }}>
            <div style={{
              fontSize: '0.875rem',
              color: '#94a3b8',
              marginBottom: '0.5rem',
              fontWeight: 'bold'
            }}>
              Actual Score
            </div>
            <div style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              color: '#10b981'
            }}>
              {actualScore}
            </div>
            <div style={{
              fontSize: '0.75rem',
              color: '#64748b',
              marginTop: '0.25rem'
            }}>
              / {maxScore}
            </div>
          </div>
        </div>

        {/* Delta */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '1rem',
          padding: '1rem',
          marginBottom: '1.5rem',
          textAlign: 'center',
          border: '1px solid rgba(139, 92, 246, 0.3)'
        }}>
          <div style={{
            fontSize: '0.875rem',
            color: '#94a3b8',
            marginBottom: '0.5rem'
          }}>
            Difference
          </div>
          <div style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: delta >= 0 ? '#10b981' : '#ef4444'
          }}>
            {deltaText} points
          </div>
        </div>

        {/* PP Change */}
        <div style={{
          background: ppChange > 0 
            ? 'rgba(16, 185, 129, 0.15)' 
            : ppChange < 0 
              ? 'rgba(239, 68, 68, 0.15)' 
              : 'rgba(100, 100, 100, 0.15)',
          border: `2px solid ${ppChange > 0 
            ? 'rgba(16, 185, 129, 0.5)' 
            : ppChange < 0 
              ? 'rgba(239, 68, 68, 0.5)' 
              : 'rgba(100, 100, 100, 0.5)'}`,
          borderRadius: '1rem',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '0.875rem',
            color: '#94a3b8',
            marginBottom: '0.5rem',
            fontWeight: 'bold'
          }}>
            Power Points Change
          </div>
          <div style={{
            fontSize: '2.5rem',
            fontWeight: 'bold',
            color: ppChange > 0 ? '#10b981' : ppChange < 0 ? '#ef4444' : '#94a3b8'
          }}>
            {ppChange > 0 ? '+' : ''}{ppChange} PP
          </div>
          {ppChange > 0 && (
            <div style={{
              fontSize: '0.875rem',
              color: '#10b981',
              marginTop: '0.5rem'
            }}>
              🎉 Reward earned!
            </div>
          )}
          {ppChange < 0 && (
            <div style={{
              fontSize: '0.875rem',
              color: '#ef4444',
              marginTop: '0.5rem'
            }}>
              ⚠️ Penalty applied
            </div>
          )}
        </div>

        {/* Artifacts Granted */}
        {artifactsGranted && artifactsGranted.length > 0 && (
          <div style={{
            background: 'rgba(251, 191, 36, 0.1)',
            border: '2px solid rgba(251, 191, 36, 0.3)',
            borderRadius: '1rem',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              fontSize: '1.125rem',
              fontWeight: 'bold',
              color: '#fbbf24',
              marginBottom: '1rem',
              textAlign: 'center'
            }}>
              🎁 Artifacts Earned
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              {artifactsGranted.map((artifact, index) => (
                <div
                  key={index}
                  style={{
                    background: 'rgba(0, 0, 0, 0.2)',
                    borderRadius: '0.75rem',
                    padding: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem'
                  }}
                >
                  <div style={{ fontSize: '2rem' }}>
                    {artifact.artifactId === 'truth_metal_currency' ? '💎' : '🎁'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: '1rem',
                      fontWeight: 'bold',
                      color: '#fbbf24',
                      marginBottom: '0.25rem'
                    }}>
                      {artifact.artifactName}
                    </div>
                    {artifact.quantity && artifact.quantity > 1 && (
                      <div style={{
                        fontSize: '0.875rem',
                        color: '#94a3b8'
                      }}>
                        Quantity: {artifact.quantity}
                      </div>
                    )}
                  </div>
                </div>
              ))}
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
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              border: 'none',
              borderRadius: '0.75rem',
              color: 'white',
              fontSize: '1.125rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(139, 92, 246, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.4)';
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssessmentGoalResultModal;

