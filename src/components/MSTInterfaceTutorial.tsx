import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface MSTInterfaceTutorialProps {
  isOpen: boolean;
  onComplete: () => void;
  onClose: () => void;
}

const MSTInterfaceTutorial: React.FC<MSTInterfaceTutorialProps> = ({ isOpen, onComplete, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

  if (!isOpen) return null;

  const tutorialSteps = [
    {
      title: "Welcome to the MST Interface!",
      content: "Welcome to the Masters of Space and Time (MST) interface! This tutorial will guide you through the four main areas of Xiotein School. Let's start your journey to becoming a master manifester.",
      icon: "🎓",
      action: null
    },
    {
      title: "My Profile - Your Manifestation Identity",
      content: "My Profile is where you manage your manifestation identity. Here you can view your current manifest type, level, XP, and artifacts. You can also update your display name, avatar, and manifestation preferences. This is essential for tracking your growth as a manifester.",
      icon: "👤",
      action: {
        label: "Visit My Profile",
        route: "/profile",
        description: "See your current manifestation status and customize your identity"
      }
    },
    {
      title: "MST MKT - The Marketplace",
      content: "MST MKT is the marketplace where you can purchase powerful artifacts, abilities, and upgrades using your earned currency. Here you'll find items that can enhance your manifestation abilities, provide protection in battles, and unlock new possibilities. Save your currency wisely!",
      icon: "🛒",
      action: {
        label: "Visit MST MKT",
        route: "/marketplace",
        description: "Browse and purchase artifacts to enhance your abilities"
      }
    },
    {
      title: "Hall of Fame - The Leaderboard",
      content: "The Hall of Fame displays the top manifesters in Xiotein School. See who's leading in XP, battle victories, and artifact collections. This is where you can track your progress against other students and find inspiration for your own journey.",
      icon: "🏆",
      action: {
        label: "View Hall of Fame",
        route: "/leaderboard",
        description: "See the top manifesters and track your ranking"
      }
    },
    {
      title: "Battle Arena - Test Your Skills",
      content: "The Battle Arena is where you put your manifestation abilities to the test. Engage in strategic battles against other students, AI opponents, or story challenges. Here you'll earn XP, test new strategies, and prove your mastery of the mystical arts.",
      icon: "⚔️",
      action: {
        label: "Enter Battle Arena",
        route: "/battle",
        description: "Engage in battles to test and improve your manifestation skills"
      }
    },
    {
      title: "Tutorial Complete!",
      content: "Congratulations! You've completed the MST Interface tutorial. You now know about the four main areas of Xiotein School. Use My Profile to track your progress, MST MKT to enhance your abilities, Hall of Fame to see how you rank, and Battle Arena to test your skills. Your journey as a master manifester begins now!",
      icon: "🎉",
      action: null
    }
  ];

  const currentStepData = tutorialSteps[currentStep];
  const isLastStep = currentStep === tutorialSteps.length - 1;
  const isFirstStep = currentStep === 0;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (!isFirstStep) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleActionClick = (route: string) => {
    navigate(route);
    // Don't close the tutorial, let user explore and come back
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '2rem'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '1.5rem',
        padding: '2rem',
        maxWidth: '600px',
        width: '100%',
        maxHeight: '80vh',
        overflow: 'auto',
        color: 'white',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem'
        }}>
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: '2rem' }}>{currentStepData.icon}</span>
            {currentStepData.title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              color: 'white',
              fontSize: '1.25rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>

        {/* Progress Indicator */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '2rem',
          gap: '0.5rem'
        }}>
          {tutorialSteps.map((_, index) => (
            <div
              key={index}
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: index <= currentStep ? 'white' : 'rgba(255,255,255,0.3)',
                transition: 'background 0.3s ease'
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div style={{
          marginBottom: '2rem',
          lineHeight: '1.6'
        }}>
          <p style={{
            fontSize: '1.1rem',
            margin: 0
          }}>
            {currentStepData.content}
          </p>
        </div>

        {/* Action Button */}
        {currentStepData.action && (
          <div style={{
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '1rem',
            padding: '1.5rem',
            marginBottom: '2rem',
            border: '1px solid rgba(255,255,255,0.2)'
          }}>
            <h4 style={{
              fontSize: '1.125rem',
              fontWeight: 'bold',
              marginBottom: '0.5rem'
            }}>
              Try It Out:
            </h4>
            <p style={{
              fontSize: '0.875rem',
              opacity: 0.9,
              marginBottom: '1rem'
            }}>
              {currentStepData.action.description}
            </p>
            <button
              onClick={() => handleActionClick(currentStepData.action.route)}
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.75rem',
                fontSize: '0.875rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s',
                width: '100%'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(59, 130, 246, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {currentStepData.action.label}
            </button>
          </div>
        )}

        {/* Navigation */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <button
            onClick={handlePrevious}
            disabled={isFirstStep}
            style={{
              background: isFirstStep ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.2)',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.75rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: isFirstStep ? 'not-allowed' : 'pointer',
              opacity: isFirstStep ? 0.5 : 1
            }}
          >
            ← Previous
          </button>

          <span style={{
            fontSize: '0.875rem',
            opacity: 0.8
          }}>
            {currentStep + 1} of {tutorialSteps.length}
          </span>

          <button
            onClick={handleNext}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.75rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {isLastStep ? 'Complete Tutorial' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MSTInterfaceTutorial;
