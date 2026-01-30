import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

interface Season0IntroModalProps {
  isOpen: boolean;
  onClose: () => void;
  autoPlayVideo?: boolean; // Whether to auto-play video (only true on first login)
}

const Season0IntroModal: React.FC<Season0IntroModalProps> = ({ isOpen, onClose, autoPlayVideo = false }) => {
  const { currentUser } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [hasAutoPlayed, setHasAutoPlayed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Reset to first slide when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentSlide(0);
    }
  }, [isOpen]);

  // Check if video has been auto-played before and auto-play on first login
  useEffect(() => {
    const checkAndAutoPlayVideo = async () => {
      if (!currentUser || !isOpen || currentSlide !== 0) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'students', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const videoAutoPlayed = userData.season0VideoAutoPlayed || false;
          setHasAutoPlayed(videoAutoPlayed);
          
          // Auto-play video if it hasn't been auto-played before and autoPlayVideo is true
          if (autoPlayVideo && !videoAutoPlayed && videoRef.current) {
            // Small delay to ensure video element is ready
            setTimeout(async () => {
              if (videoRef.current) {
                try {
                  await videoRef.current.play();
                  // Mark as auto-played
                  await setDoc(doc(db, 'students', currentUser.uid), {
                    season0VideoAutoPlayed: true,
                    season0VideoAutoPlayedAt: serverTimestamp()
                  }, { merge: true });
                  setHasAutoPlayed(true);
                } catch (err) {
                  console.error('Error auto-playing video:', err);
                  // Browser may block auto-play, that's okay
                }
              }
            }, 300);
          }
        } else {
          // New user - auto-play video
          if (autoPlayVideo && videoRef.current) {
            setTimeout(async () => {
              if (videoRef.current) {
                try {
                  await videoRef.current.play();
                  await setDoc(doc(db, 'students', currentUser.uid), {
                    season0VideoAutoPlayed: true,
                    season0VideoAutoPlayedAt: serverTimestamp()
                  }, { merge: true });
                  setHasAutoPlayed(true);
                } catch (err) {
                  console.error('Error auto-playing video:', err);
                }
              }
            }, 300);
          }
        }
      } catch (error) {
        console.error('Error checking video status:', error);
      }
    };
    
    checkAndAutoPlayVideo();
  }, [currentUser, isOpen, autoPlayVideo, currentSlide]);

  const slides = [
    {
      title: "Welcome to MST: Season 0 - Timu Island!",
      content: "We're leveling up to help YOU level up. Check out what's new.",
      icon: "🎉",
      hasVideo: true
    },
    {
      title: "New Battle Pass",
      content: "Check out the new Battle pass. It may not be much now, but it will be expanding more and more each season.",
      icon: "🎁",
      hasVideo: false
    },
    {
      title: "Practice Mode Challenges",
      content: "The Practice Mode has some new challenges. Check them out and see how powerful you truly are.",
      icon: "⚔️",
      hasVideo: false
    },
    {
      title: "Battle Mode Changes",
      content: "The Battle Mode has changed. Instead of all of your PP being your health, now your health is 10% of your total PP. Meaning, you can only lose 10% of your PP at a time.",
      icon: "🛡️",
      hasVideo: false
    },
    {
      title: "Coming Soon",
      content: "Artifacts, Multiplayer Mode and More",
      icon: "🚀",
      hasVideo: false
    }
  ];

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      handleClose();
    }
  };

  const handlePrevious = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleClose = useCallback(async () => {
    // Always close the modal immediately - don't wait for Firestore
    onClose();
    
    // Mark as seen in Firestore in the background (non-blocking)
    if (currentUser) {
      // Use a timeout to ensure we don't block the UI
      setTimeout(async () => {
        try {
          const userRef = doc(db, 'students', currentUser.uid);
          await setDoc(userRef, {
            season0IntroSeen: true,
            season0IntroSeenAt: serverTimestamp()
          }, { merge: true });
          console.log('Season 0 intro marked as seen for user:', currentUser.uid);
        } catch (error) {
          console.error('Error marking intro as seen:', error);
          // Error is non-critical - modal is already closed
        }
      }, 0);
    }
  }, [currentUser, onClose]);

  // Add ESC key handler to close modal
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const currentSlideData = slides[currentSlide];

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10001,
        padding: '2rem'
      }}
      onClick={(e) => {
        // Close modal when clicking on backdrop (but not on the modal content itself)
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div 
        style={{
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: 'white',
          borderRadius: '1.5rem',
          padding: '3rem',
          maxWidth: currentSlide === 0 && currentSlideData.hasVideo ? '900px' : '600px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
          border: '2px solid rgba(139, 92, 246, 0.5)',
          position: 'relative',
          textAlign: 'center'
        }}
        onClick={(e) => {
          // Prevent backdrop click from closing when clicking inside modal
          e.stopPropagation();
        }}
      >
        {/* Close Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'rgba(239, 68, 68, 0.3)',
            border: '2px solid rgba(239, 68, 68, 0.7)',
            borderRadius: '50%',
            width: '44px',
            height: '44px',
            color: '#fee2e2',
            cursor: 'pointer',
            fontSize: '1.75rem',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10002,
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.5)';
            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 1)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.3)';
            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.7)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title="Close (ESC)"
        >
          ×
        </button>

        {/* Slide Content */}
        <div style={{ marginBottom: '2rem' }}>
          {currentSlide === 0 && currentSlideData.hasVideo ? (
            // Video slide
            <div>
              <h2 style={{
                fontSize: '2.5rem',
                fontWeight: 'bold',
                marginBottom: '1.5rem',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                {currentSlideData.title}
              </h2>
              <div style={{
                marginBottom: '1.5rem',
                borderRadius: '0.75rem',
                overflow: 'hidden',
                background: '#000'
              }}>
                <video
                  ref={videoRef}
                  src="/videos/MST Season 0 Launch.mp4"
                  controls
                  style={{
                    width: '100%',
                    maxHeight: '500px',
                    display: 'block'
                  }}
                  onEnded={() => {
                    // Auto-advance to next slide when video ends (only if auto-played)
                    if (autoPlayVideo && currentSlide < slides.length - 1) {
                      setTimeout(() => setCurrentSlide(1), 500);
                    }
                  }}
                />
              </div>
              <p style={{
                fontSize: '1.25rem',
                lineHeight: '1.8',
                color: '#cbd5e1',
                marginBottom: '2rem'
              }}>
                {currentSlideData.content}
              </p>
            </div>
          ) : (
            // Regular slide
            <>
              <div style={{
                fontSize: '5rem',
                marginBottom: '1.5rem'
              }}>
                {currentSlideData.icon}
              </div>
              <h2 style={{
                fontSize: '2.5rem',
                fontWeight: 'bold',
                marginBottom: '1.5rem',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                {currentSlideData.title}
              </h2>
              <p style={{
                fontSize: '1.25rem',
                lineHeight: '1.8',
                color: '#cbd5e1',
                marginBottom: '2rem'
              }}>
                {currentSlideData.content}
              </p>
            </>
          )}
        </div>

        {/* Slide Indicators */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '0.5rem',
          marginBottom: '2rem'
        }}>
          {slides.map((_, index) => (
            <div
              key={index}
              style={{
                width: currentSlide === index ? '30px' : '10px',
                height: '10px',
                borderRadius: '5px',
                background: currentSlide === index 
                  ? 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)'
                  : 'rgba(139, 92, 246, 0.3)',
                transition: 'all 0.3s'
              }}
            />
          ))}
        </div>

        {/* Navigation Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '1rem'
        }}>
          <button
            onClick={handlePrevious}
            disabled={currentSlide === 0}
            style={{
              flex: 1,
              padding: '1rem 2rem',
              background: currentSlide === 0
                ? 'rgba(100, 100, 100, 0.3)'
                : 'rgba(139, 92, 246, 0.3)',
              border: `1px solid ${currentSlide === 0 ? 'rgba(100, 100, 100, 0.5)' : 'rgba(139, 92, 246, 0.5)'}`,
              borderRadius: '0.75rem',
              color: 'white',
              fontSize: '1.125rem',
              fontWeight: 'bold',
              cursor: currentSlide === 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s',
              opacity: currentSlide === 0 ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (currentSlide > 0) {
                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.5)';
              }
            }}
            onMouseLeave={(e) => {
              if (currentSlide > 0) {
                e.currentTarget.style.background = 'rgba(139, 92, 246, 0.3)';
              }
            }}
          >
            ← Previous
          </button>
          <button
            onClick={handleNext}
            style={{
              flex: 1,
              padding: '1rem 2rem',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              border: 'none',
              borderRadius: '0.75rem',
              color: 'white',
              fontSize: '1.125rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.3s',
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
            {currentSlide === slides.length - 1 ? 'Get Started' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Season0IntroModal;

