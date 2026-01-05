import React, { useRef, useEffect, useState } from 'react';

interface PortalIntroModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const PortalIntroModal: React.FC<PortalIntroModalProps> = ({ isOpen, onClose, onComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
  const [videoWatched, setVideoWatched] = useState(false); // Track if video was actually watched
  const [videoProgress, setVideoProgress] = useState(0); // Track video progress

  useEffect(() => {
    if (isOpen && videoRef.current) {
      // Reset video to beginning when modal opens
      videoRef.current.currentTime = 0;
      setShowWelcomeScreen(false);
      setVideoWatched(false);
      setVideoProgress(0);
    }
  }, [isOpen]);

  // Track video progress to ensure it's being watched
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (video.duration > 0) {
        const progress = (video.currentTime / video.duration) * 100;
        setVideoProgress(progress);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [isOpen]);

  const handleVideoEnd = () => {
    // Mark video as watched and show welcome screen after video ends
    console.log('PortalIntroModal: Video ended - marking as watched');
    setVideoWatched(true);
    setShowWelcomeScreen(true);
  };

  const handleNext = () => {
    // CRITICAL: Only complete if video was actually watched
    if (!videoWatched) {
      console.warn('PortalIntroModal: Attempted to complete without watching video');
      alert('Please watch the video before continuing.');
      return;
    }

    // Ensure video was watched (at least 90% of it)
    if (videoProgress < 90) {
      console.warn('PortalIntroModal: Video not fully watched', { videoProgress });
      alert('Please watch the complete video before continuing.');
      return;
    }

    console.log('PortalIntroModal: Video watched and Next clicked - completing challenge');
    // Complete the challenge when Next is clicked after video is watched
    onComplete();
    onClose();
  };

  const handleClose = () => {
    // If video hasn't been watched, warn the user
    if (!videoWatched && videoProgress < 90) {
      const confirmClose = window.confirm('You haven\'t finished watching the video. Are you sure you want to close? The challenge will not be marked as complete.');
      if (!confirmClose) {
        return; // Don't close if user cancels
      }
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '2rem'
    }}>
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '1200px',
        maxHeight: '90vh',
        backgroundColor: '#1a1a1a',
        borderRadius: '1rem',
        padding: '2rem',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto'
      }}>
        {/* Close Button */}
        <button
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            color: 'white',
            fontSize: '1.5rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          }}
        >
          ×
        </button>

        {!showWelcomeScreen ? (
          <>
            {/* Title */}
            <h2 style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              color: 'white',
              marginBottom: '1.5rem',
              textAlign: 'center'
            }}>
              Arrival on Timu Island
            </h2>

            {/* Video Container */}
            <div style={{
              marginBottom: '1.5rem',
              borderRadius: '0.75rem',
              overflow: 'hidden',
              background: '#000',
              flexShrink: 0
            }}>
              <video
                ref={videoRef}
                src="/videos/Ch2-1_Video_EnterTimuIsland.mp4"
                controls
                autoPlay
                style={{
                  width: '100%',
                  maxHeight: '400px',
                  display: 'block'
                }}
                onEnded={handleVideoEnd}
                onPlay={() => console.log('PortalIntroModal: Video started playing')}
                onPause={() => console.log('PortalIntroModal: Video paused')}
              />
            </div>

            {/* Description */}
            <p style={{
              fontSize: '1rem',
              lineHeight: '1.6',
              color: '#cbd5e1',
              textAlign: 'center',
              marginTop: '1rem',
              flexShrink: 0
            }}>
              Watch as you escape the Abandoned Subway, go through the portal, and arrive on Timu Island.
            </p>
          </>
        ) : (
          /* Welcome Screen */
          <>
            <div style={{
              width: '100%',
              minHeight: '400px',
              maxHeight: '500px',
              backgroundColor: '#000000',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '0.75rem',
              marginBottom: '1.5rem',
              gap: '2rem',
              padding: '2rem',
              flexShrink: 0
            }}>
              <h2 style={{
                fontSize: '2.5rem',
                fontWeight: 'bold',
                color: '#fbbf24',
                textAlign: 'center',
                textShadow: '0 0 20px rgba(251, 191, 36, 0.5)',
                animation: 'fadeIn 0.5s ease-in',
                margin: 0
              }}>
                Welcome to Timu Island
              </h2>
              
              {/* Next Button */}
              <button
                onClick={handleNext}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  padding: '0.75rem 2rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  fontWeight: 'bold',
                  fontSize: '1.1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.6)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
                }}
              >
                Next
                <span>→</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default PortalIntroModal;

