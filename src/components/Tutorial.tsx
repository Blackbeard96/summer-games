import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface TutorialStep {
  id: string;
  title: string;
  content: string;
  target: string; // CSS selector for element to highlight
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  illustration?: string; // URL or emoji for illustration
  action?: 'click' | 'scroll' | 'wait' | 'complete';
  required?: boolean;
  skipText?: string;
  character?: {
    name: string;
    image: string;
    quote: string;
  };
}

interface TutorialProps {
  isOpen: boolean;
  onClose: () => void;
  tutorialId: string;
}

const Tutorial: React.FC<TutorialProps> = ({ isOpen, onClose, tutorialId }) => {
  const { currentUser } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);

  // Tutorial steps for different sections
  const tutorials: { [key: string]: TutorialStep[] } = {
    'welcome': [
      {
        id: 'welcome-1',
        title: 'Welcome to Xiotein School! 🏛️',
        content: 'Greetings, young seeker. I am your guide through the Nine Knowings Universe. You\'ve been chosen to manifest your truth and discover your extraordinary potential.',
        target: 'body',
        position: 'center',
        illustration: '🏛️',
        action: 'wait',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"In the Nine Knowings Universe, ordinary skills become extraordinary through mastery, intent, and will."'
        }
      },
      {
        id: 'welcome-2',
        title: 'Your Manifestation Journey',
        content: 'I will guide you through completing challenges, unlocking abilities, and discovering your true potential. Each step brings you closer to your ascension.',
        target: 'body',
        position: 'center',
        illustration: '⚡',
        action: 'wait',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"Your journey begins with a single step, but your potential knows no bounds."'
        }
      }
    ],
    'navigation': [
      {
        id: 'nav-1',
        title: 'Navigation Menu',
        content: 'This sacred menu connects you to all aspects of your journey. Each path leads to different realms of knowledge and power.',
        target: 'nav',
        position: 'bottom',
        illustration: '🧭',
        action: 'click',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"Every path you choose shapes your destiny."'
        }
      },
      {
        id: 'nav-2',
        title: 'Player\'s Journey',
        content: 'This is your sacred space - the Player\'s Journey where you\'ll see your progress and current challenges. Here, your growth becomes visible.',
        target: 'nav a[href="/chapters"]',
        position: 'bottom',
        illustration: '🏋️',
        action: 'click',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"In the Player\'s Journey, every challenge is an opportunity for growth."'
        }
      },
      {
        id: 'nav-3',
        title: 'Battle Arena',
        content: 'Here lies the path to your chapters and story challenges. Each chapter reveals deeper truths about yourself and the universe.',
        target: 'nav a[href="/battle"]',
        position: 'bottom',
        illustration: '⚔️',
        action: 'click',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"Your story is written in the choices you make."'
        }
      },
      {
        id: 'nav-4',
        title: 'MST MKT',
        content: 'The Marketplace of Sacred Treasures - where you can acquire artifacts and power-ups with your earned Power Points.',
        target: 'nav a[href="/marketplace"]',
        position: 'bottom',
        illustration: '🛒',
        action: 'click',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"Every artifact holds the power to transform your journey."'
        }
      }
    ],
    'profile': [
      {
        id: 'profile-1',
        title: 'Complete Your Profile',
        content: 'Your profile is your identity in this realm. Let us begin by crafting your digital presence with your display name and avatar.',
        target: '.profile-card',
        position: 'bottom',
        illustration: '👤',
        action: 'click',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"Your identity is the foundation upon which your power is built."'
        }
      },
      {
        id: 'profile-2',
        title: 'Profile Information',
        content: 'Add your display name and upload an avatar to personalize your experience. Your chosen identity will guide your entire journey.',
        target: '.profile-settings',
        position: 'left',
        illustration: '✏️',
        action: 'complete',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"Choose your name wisely, for it will be spoken in halls of legend."'
        }
      }
    ],
    'manifest': [
      {
        id: 'manifest-1',
        title: 'Choose Your Manifest',
        content: 'Your manifest represents your unique path and abilities in the Nine Knowings Universe. This choice will define your entire journey.',
        target: '.manifest-selection',
        position: 'center',
        illustration: '🌟',
        action: 'click',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"Your manifest is not just a choice - it is your destiny calling."'
        }
      },
      {
        id: 'manifest-2',
        title: 'Manifest Types',
        content: 'Each manifest has unique abilities and progression paths. Read the descriptions carefully, for this choice cannot be undone.',
        target: '.manifest-options',
        position: 'center',
        illustration: '📚',
        action: 'wait',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"Each path leads to different powers and possibilities."'
        }
      },
      {
        id: 'manifest-3',
        title: 'Confirm Selection',
        content: 'Once you choose your manifest, it will guide your entire journey. This is the moment your true power begins to awaken.',
        target: '.manifest-confirm',
        position: 'center',
        illustration: '✅',
        action: 'complete',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"Your manifest will be your companion through every challenge."'
        }
      }
    ],
    'chapter1': [
      {
        id: 'ch1-1',
        title: 'Chapter 1: The Beginning',
        content: 'Welcome to your first chapter, young seeker. These challenges will awaken your latent abilities and begin your ascension.',
        target: '.chapter-1',
        position: 'center',
        illustration: '📖',
        action: 'wait',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"The first step is always the most important."'
        }
      },
      {
        id: 'ch1-2',
        title: 'Update Your Profile',
        content: 'Complete your profile to unlock your first ability. This simple act will open the door to greater powers.',
        target: '.challenge-profile',
        position: 'bottom',
        illustration: '👤',
        action: 'complete',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"Your profile is the key to your first awakening."'
        }
      },
      {
        id: 'ch1-3',
        title: 'Declare Your Manifest',
        content: 'Choose your manifestation path to continue your journey. This choice will determine your unique abilities.',
        target: '.challenge-manifest',
        position: 'bottom',
        illustration: '🌟',
        action: 'complete',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"Your manifest is your connection to the Nine Knowings."'
        }
      },
      {
        id: 'ch1-4',
        title: 'Identify Your Artifact',
        content: 'Discover the artifact linked to your inner truth. This sacred object will amplify your powers and guide your path.',
        target: '.challenge-artifact',
        position: 'bottom',
        illustration: '🔮',
        action: 'click',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"Every artifact holds a piece of ancient wisdom."'
        }
      }
    ],
    'marketplace': [
      {
        id: 'market-1',
        title: 'Welcome to MST MKT',
        content: 'The Marketplace of Sacred Treasures awaits. Here you can acquire artifacts and power-ups to enhance your abilities.',
        target: '.marketplace-header',
        position: 'bottom',
        illustration: '🛒',
        action: 'wait',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"Every artifact has a story and a purpose."'
        }
      },
      {
        id: 'market-2',
        title: 'Power Points',
        content: 'Earn Power Points by completing challenges, then spend them here. Each point represents your growing mastery.',
        target: '.power-points',
        position: 'left',
        illustration: '⚡',
        action: 'wait',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"Power Points are the currency of your achievements."'
        }
      },
      {
        id: 'market-3',
        title: 'Artifact Categories',
        content: 'Filter artifacts by category: Time, Protection, Food, or Special powers. Each category serves different needs.',
        target: '.category-filters',
        position: 'right',
        illustration: '🏷️',
        action: 'click',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"Choose your artifacts wisely, for they will serve you well."'
        }
      },
      {
        id: 'market-4',
        title: 'Purchase Artifacts',
        content: 'Click on any artifact to purchase it with your Power Points. Each acquisition brings you closer to your full potential.',
        target: '.artifact-card',
        position: 'top',
        illustration: '💎',
        action: 'click',
        character: {
          name: 'The Guide',
          image: '/guide-character.png?v=1',
          quote: '"Every purchase is an investment in your future."'
        }
      }
    ]
  };

  const currentTutorial = tutorials[tutorialId] || [];
  const currentStepData = currentTutorial[currentStep];

  useEffect(() => {
    if (isOpen && currentTutorial.length > 0) {
      setIsVisible(true);
      highlightTargetElement();
    } else {
      setIsVisible(false);
    }
  }, [isOpen, currentStep, tutorialId]);

  const highlightTargetElement = () => {
    if (!currentStepData) return;

    // Remove previous highlights
    const previousHighlights = document.querySelectorAll('.tutorial-highlight');
    previousHighlights.forEach(el => {
      el.classList.remove('tutorial-highlight');
    });

    // Add highlight to current target
    const target = document.querySelector(currentStepData.target) as HTMLElement;
    if (target) {
      target.classList.add('tutorial-highlight');
      setTargetElement(target);
    }
  };

  const nextStep = () => {
    if (currentStep < currentTutorial.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTutorial();
    }
  };

  const previousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const skipTutorial = async () => {
    if (currentUser) {
      try {
        console.log(`Skipping tutorial: ${tutorialId}`);
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          [`tutorials.${tutorialId}.completed`]: true,
          [`tutorials.${tutorialId}.skipped`]: true,
          [`tutorials.${tutorialId}.completedAt`]: new Date()
        });
        console.log(`Tutorial ${tutorialId} marked as skipped`);
      } catch (error) {
        console.error('Error skipping tutorial:', error);
      }
    }
    onClose();
  };

  const completeTutorial = async () => {
    if (currentUser) {
      try {
        console.log(`Completing tutorial: ${tutorialId}`);
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          [`tutorials.${tutorialId}.completed`]: true,
          [`tutorials.${tutorialId}.completedAt`]: new Date()
        });
        console.log(`Tutorial ${tutorialId} marked as completed`);
      } catch (error) {
        console.error('Error completing tutorial:', error);
      }
    }
    onClose();
  };

  if (!isOpen || !isVisible) return null;

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
        onClick={currentStepData?.action === 'click' ? nextStep : undefined}
      />

      {/* Tutorial Popup */}
      <div 
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '550px',
          width: '90%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          zIndex: 9999,
          border: '2px solid #4f46e5'
        }}
      >
        {/* Illustration */}
        {currentStepData?.illustration && (
          <div style={{
            textAlign: 'center',
            fontSize: '3rem',
            marginBottom: '1rem'
          }}>
            {currentStepData.illustration}
          </div>
        )}

        {/* Character Info */}
        {currentStepData?.character && (
          <div style={{
            textAlign: 'center',
            marginBottom: '1rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '1rem',
            backgroundColor: '#f8fafc',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb'
          }}>
            <img 
              src={currentStepData.character.image} 
              alt={currentStepData.character.name}
              onError={(e) => {
                // Fallback to emoji if image fails to load
                e.currentTarget.style.display = 'none';
                const nextElement = e.currentTarget.nextElementSibling as HTMLElement;
                if (nextElement) {
                  nextElement.style.display = 'flex';
                }
              }}
              style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                marginBottom: '0.5rem',
                border: '2px solid #4f46e5',
                objectFit: 'cover'
              }}
            />
            <div style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              marginBottom: '0.5rem',
              border: '2px solid #4f46e5',
              backgroundColor: '#4f46e5',
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '3rem',
              fontWeight: 'bold'
            }}>
              👩‍🏫
            </div>
            <p style={{
              fontSize: '0.875rem',
              color: '#6b7280',
              fontStyle: 'italic',
              marginBottom: '0.25rem',
              lineHeight: '1.4'
            }}>
              "{currentStepData.character.quote}"
            </p>
            <p style={{
              fontSize: '0.75rem',
              color: '#4f46e5',
              fontWeight: 'bold'
            }}>
              - {currentStepData.character.name}
            </p>
          </div>
        )}

        {/* Title */}
        <h3 style={{
          fontSize: '1.25rem',
          fontWeight: 'bold',
          marginBottom: '1rem',
          color: '#1f2937',
          textAlign: 'center'
        }}>
          {currentStepData?.title}
        </h3>

        {/* Content */}
        <p style={{
          fontSize: '1rem',
          lineHeight: '1.6',
          color: '#6b7280',
          marginBottom: '1.5rem',
          textAlign: 'center'
        }}>
          {currentStepData?.content}
        </p>

        {/* Progress */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '1.5rem'
        }}>
          <div style={{
            display: 'flex',
            gap: '0.5rem'
          }}>
            {currentTutorial.map((_, index) => (
              <div
                key={index}
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: index === currentStep ? '#4f46e5' : '#d1d5db'
                }}
              />
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          {currentStep > 0 && (
            <button
              onClick={previousStep}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}
            >
              ← Previous
            </button>
          )}

          <button
            onClick={nextStep}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#4f46e5',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            {currentStep === currentTutorial.length - 1 ? 'Complete' : 'Next →'}
          </button>

          {/* Skip Button - Always visible */}
          <button
            onClick={skipTutorial}
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: 'transparent',
              color: '#6b7280',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.color = '#374151';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#6b7280';
            }}
          >
            Skip Tutorial
          </button>
        </div>
      </div>

      {/* Highlight Styles */}
      <style>{`
        .tutorial-highlight {
          position: relative;
          z-index: 9997 !important;
          box-shadow: 0 0 0 4px #4f46e5, 0 0 0 8px rgba(79, 70, 229, 0.3) !important;
          border-radius: 0.5rem !important;
          animation: tutorial-pulse 2s infinite !important;
        }
        
        @keyframes tutorial-pulse {
          0%, 100% { box-shadow: 0 0 0 4px #4f46e5, 0 0 0 8px rgba(79, 70, 229, 0.3); }
          50% { box-shadow: 0 0 0 4px #4f46e5, 0 0 0 12px rgba(79, 70, 229, 0.5); }
        }
      `}</style>
    </>
  );
};

export default Tutorial; 