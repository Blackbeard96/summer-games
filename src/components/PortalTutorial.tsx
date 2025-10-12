import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

interface PortalTutorialProps {
  isOpen: boolean;
  onComplete: () => void;
  onClose: () => void;
}

const PortalTutorial: React.FC<PortalTutorialProps> = ({ isOpen, onComplete, onClose }) => {
  const { currentUser } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  const tutorialSteps = [
    {
      title: "Welcome to Xiotein School!",
      content: "Let's take a quick tour of your new learning environment. This is your dashboard where you'll track your progress and access all features.",
      highlight: "dashboard",
      action: "Look around the interface"
    },
    {
      title: "Navigation Bar",
      content: "The top navigation bar gives you access to all major areas: Player's Journey, Battle Arena, Hall of Fame, and more.",
      highlight: "navigation",
      action: "Notice the navigation options"
    },
    {
      title: "Chapter Challenges",
      content: "Here you'll find your story challenges. Complete these to progress through your journey and unlock new abilities.",
      highlight: "challenges",
      action: "Explore the challenge system"
    },
    {
      title: "Marketplace (MST MKT)",
      content: "Visit the marketplace to spend your Power Points on useful artifacts and abilities that will help you on your journey.",
      highlight: "marketplace",
      action: "Check out the marketplace"
    },
    {
      title: "Battle Arena",
      content: "Test your abilities and battle other players in the Battle Arena. This is where you'll put your Power Card moves to the test!",
      highlight: "battle",
      action: "Discover the battle system"
    },
    {
      title: "Profile & Progress",
      content: "Your profile shows your level, XP, Power Points, and achievements. Keep track of your growth as you complete challenges.",
      highlight: "profile",
      action: "Review your progress"
    },
    {
      title: "Tutorial Complete!",
      content: "You've successfully navigated the portal! You now understand the key areas of Xiotein School. Your journey begins now!",
      highlight: "complete",
      action: "Begin your adventure"
    }
  ];

  const handleNext = () => {
    if (currentStep < tutorialSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    if (!currentUser || isCompleted) return;

    try {
      setIsCompleted(true);
      
      // Mark the tutorial challenge as completed
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        [`chapters.1.challenges.ep1-portal-sequence.isCompleted`]: true,
        [`chapters.1.challenges.ep1-portal-sequence.completedAt`]: serverTimestamp(),
        [`chapters.1.challenges.ep1-portal-sequence.autoCompleted`]: true
      });

      // Add to challenge submissions for tracking
      const { addDoc, collection } = await import('firebase/firestore');
      await addDoc(collection(db, 'challengeSubmissions'), {
        userId: currentUser.uid,
        displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
        email: currentUser.email || '',
        photoURL: currentUser.photoURL || '',
        challengeId: 'ep1-portal-sequence',
        challengeName: 'Navigate the Portal',
        submissionType: 'auto_completed',
        status: 'approved',
        timestamp: serverTimestamp(),
        xpReward: 20,
        ppReward: 10,
        manifestationType: 'Chapter Challenge',
        character: 'Tutorial System',
        autoCompleted: true
      });

      onComplete();
    } catch (error) {
      console.error('Error completing tutorial:', error);
      alert('Failed to complete tutorial. Please try again.');
    }
  };

  if (!isOpen) {
    return null;
  }

  const currentTutorialStep = tutorialSteps[currentStep];
  const isLastStep = currentStep === tutorialSteps.length - 1;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '1rem',
        padding: '2rem',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto',
        position: 'relative'
      }}>
        {/* Progress Bar */}
        <div style={{
          width: '100%',
          height: '4px',
          backgroundColor: '#e5e7eb',
          borderRadius: '2px',
          marginBottom: '1.5rem'
        }}>
          <div style={{
            width: `${((currentStep + 1) / tutorialSteps.length) * 100}%`,
            height: '100%',
            backgroundColor: '#3b82f6',
            borderRadius: '2px',
            transition: 'width 0.3s ease'
          }}></div>
        </div>

        {/* Step Counter */}
        <div style={{
          textAlign: 'center',
          marginBottom: '1rem',
          fontSize: '0.875rem',
          color: '#6b7280'
        }}>
          Step {currentStep + 1} of {tutorialSteps.length}
        </div>

        {/* Tutorial Content */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            marginBottom: '1rem',
            color: '#1f2937'
          }}>
            {currentTutorialStep.title}
          </h2>
          
          <div style={{
            background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
            border: '2px solid #3b82f6',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '1rem'
          }}>
            <p style={{
              color: '#1e40af',
              fontSize: '1rem',
              lineHeight: '1.6',
              marginBottom: '1rem'
            }}>
              {currentTutorialStep.content}
            </p>
            
            <div style={{
              background: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              fontSize: '0.875rem',
              color: '#92400e',
              fontWeight: 'bold'
            }}>
              💡 {currentTutorialStep.action}
            </div>
          </div>

          {/* Highlight Indicator */}
          {currentTutorialStep.highlight !== 'complete' && (
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #22c55e',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              fontSize: '0.875rem',
              color: '#166534'
            }}>
              🎯 Look for the highlighted area: <strong>{currentTutorialStep.highlight}</strong>
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <button
            onClick={handlePrevious}
            disabled={currentStep === 0}
            style={{
              background: currentStep === 0 ? '#9ca3af' : '#6b7280',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: currentStep === 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
          >
            ← Previous
          </button>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              onClick={onClose}
              style={{
                background: '#6b7280',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Skip Tutorial
            </button>

            <button
              onClick={handleNext}
              style={{
                background: isLastStep 
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {isLastStep ? '🎉 Complete Tutorial' : 'Next →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortalTutorial;
