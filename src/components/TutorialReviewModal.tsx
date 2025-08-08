import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface TutorialReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTutorialSelect: (tutorialId: string) => void;
  tutorialState: { [key: string]: { completed: boolean; skipped?: boolean; completedAt?: Date } };
}

const TutorialReviewModal: React.FC<TutorialReviewModalProps> = ({
  isOpen,
  onClose,
  onTutorialSelect,
  tutorialState
}) => {
  const { currentUser } = useAuth();

  const tutorials = [
    {
      id: 'welcome',
      title: 'Welcome to Xiotein School',
      description: 'Introduction to the Nine Knowings Universe and your journey',
      icon: '🏛️',
      character: 'The Guide'
    },
    {
      id: 'navigation',
      title: 'Navigation & Interface',
      description: 'Learn how to navigate through the different sections of the app',
      icon: '🧭',
      character: 'The Guide'
    },
    {
      id: 'profile',
      title: 'Update Your Profile',
      description: 'Complete your profile to unlock your first ability',
      icon: '👤',
      character: 'The Guide'
    },
    {
      id: 'manifest',
      title: 'Your Manifestation Journey',
      description: 'Choose your manifest and begin your awakening',
      icon: '⚡',
      character: 'The Guide'
    },
    {
      id: 'chapter1',
      title: 'Chapter 1: The Awakening',
      description: 'Complete your first challenges and unlock new abilities',
      icon: '📖',
      character: 'The Guide'
    },
    {
      id: 'marketplace',
      title: 'Artifact Marketplace',
      description: 'Discover and purchase powerful artifacts to enhance your journey',
      icon: '🏪',
      character: 'The Guide'
    }
  ];

  const resetTutorial = async (tutorialId: string) => {
    if (currentUser) {
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          [`tutorials.${tutorialId}.completed`]: false,
          [`tutorials.${tutorialId}.skipped`]: false,
          [`tutorials.${tutorialId}.completedAt`]: null
        });
      } catch (error) {
        console.error('Error resetting tutorial:', error);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          zIndex: 9998,
          backdropFilter: 'blur(2px)'
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div 
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          zIndex: 9999,
          border: '2px solid #4f46e5'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#1f2937',
            margin: 0
          }}>
            📚 Tutorial Review
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0.5rem'
            }}
          >
            ✕
          </button>
        </div>

        {/* Tutorial List */}
        <div style={{ marginBottom: '1rem' }}>
          <p style={{
            color: '#6b7280',
            marginBottom: '1rem',
            fontSize: '0.875rem'
          }}>
            Review tutorials to refresh your knowledge or replay them if needed.
          </p>
        </div>

        <div style={{ display: 'grid', gap: '1rem' }}>
          {tutorials.map((tutorial) => {
            const isCompleted = tutorialState[tutorial.id]?.completed;
            const isSkipped = tutorialState[tutorial.id]?.skipped;
            
            return (
              <div key={tutorial.id} style={{
                padding: '1rem',
                border: '1px solid #e5e7eb',
                borderRadius: '0.5rem',
                backgroundColor: isCompleted ? '#f0fdf4' : '#f9fafb',
                transition: 'all 0.2s ease'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '0.5rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontSize: '1.5rem' }}>{tutorial.icon}</span>
                    <div>
                      <h3 style={{
                        fontSize: '1rem',
                        fontWeight: 'bold',
                        color: '#1f2937',
                        margin: 0
                      }}>
                        {tutorial.title}
                      </h3>
                      <p style={{
                        fontSize: '0.875rem',
                        color: '#6b7280',
                        margin: '0.25rem 0 0 0'
                      }}>
                        {tutorial.description}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {isCompleted && (
                      <span style={{
                        backgroundColor: '#22c55e',
                        color: 'white',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                      }}>
                        ✓ Completed
                      </span>
                    )}
                    {isSkipped && (
                      <span style={{
                        backgroundColor: '#f59e0b',
                        color: 'white',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        fontWeight: 'bold'
                      }}>
                        ⏭️ Skipped
                      </span>
                    )}
                  </div>
                </div>
                
                <div style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginTop: '0.75rem'
                }}>
                  <button
                    onClick={() => onTutorialSelect(tutorial.id)}
                    style={{
                      backgroundColor: '#4f46e5',
                      color: 'white',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '0.25rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#4338ca'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#4f46e5'}
                  >
                    {isCompleted ? 'Replay' : 'Start'}
                  </button>
                  
                  {isCompleted && (
                    <button
                      onClick={() => resetTutorial(tutorial.id)}
                      style={{
                        backgroundColor: '#6b7280',
                        color: 'white',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#4b5563'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = '#6b7280'}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          marginTop: '1.5rem',
          paddingTop: '1rem',
          borderTop: '1px solid #e5e7eb',
          textAlign: 'center'
        }}>
          <button
            onClick={onClose}
            style={{
              backgroundColor: '#6b7280',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.25rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              transition: 'background-color 0.2s'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#4b5563'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#6b7280'}
          >
            Close
          </button>
        </div>
      </div>
    </>
  );
};

export default TutorialReviewModal; 