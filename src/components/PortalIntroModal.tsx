import React, { useRef, useEffect, useState } from 'react';

interface PortalIntroModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void | Promise<void>;
}

const PortalIntroModal: React.FC<PortalIntroModalProps> = ({ isOpen, onClose, onComplete }) => {
  const DEBUG_CH2_1 = process.env.REACT_APP_DEBUG_CH2_1 === 'true';
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
  const [videoWatched, setVideoWatched] = useState(false); // Track if video was actually watched
  const [videoProgress, setVideoProgress] = useState(0); // Track video progress
  const [completionAttempted, setCompletionAttempted] = useState(false); // Track if completion was attempted
  const [completionSuccess, setCompletionSuccess] = useState(false); // Track if completion succeeded
  const [isCompleting, setIsCompleting] = useState(false); // Track if manual completion is in progress
  const completionCalledRef = useRef(false); // Prevent double-calling onComplete

  useEffect(() => {
    if (isOpen && videoRef.current) {
      if (DEBUG_CH2_1) {
        console.log('[CH2-1] PortalIntroModal: Modal opened, resetting video');
      }
      // Reset video to beginning when modal opens
      videoRef.current.currentTime = 0;
      setShowWelcomeScreen(false);
      setVideoWatched(false);
      setVideoProgress(0);
      completionCalledRef.current = false; // Reset completion flag
    }
  }, [isOpen, DEBUG_CH2_1]);

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

  const handleVideoEnd = async () => {
    if (DEBUG_CH2_1) {
      console.log('[CH2-1] PortalIntroModal: Video ended event fired', {
        videoWatched,
        videoProgress,
        completionAlreadyCalled: completionCalledRef.current
      });
    }
    
    // Prevent double-calling onComplete
    if (completionCalledRef.current) {
      if (DEBUG_CH2_1) {
        console.warn('[CH2-1] PortalIntroModal: Completion already called, skipping');
      }
      return;
    }
    
    // Mark video as watched and show welcome screen after video ends
    setVideoWatched(true);
    setShowWelcomeScreen(true);
    
    // Try to automatically complete the challenge when video ends
    // But don't block the UI - let user manually complete if auto-complete fails
    if (DEBUG_CH2_1) {
      console.log('[CH2-1] PortalIntroModal: Video watched - attempting auto-complete');
    }
    
    if (!completionCalledRef.current) {
      completionCalledRef.current = true;
      setCompletionAttempted(true);
      
      try {
        // Call onComplete and await it if it's async
        const result = onComplete();
        if (result && typeof result === 'object' && 'then' in result) {
          await result;
          setCompletionSuccess(true);
          if (DEBUG_CH2_1) {
            console.log('[CH2-1] PortalIntroModal: onComplete() promise resolved - auto-complete succeeded');
          }
        } else {
          setCompletionSuccess(true);
          if (DEBUG_CH2_1) {
            console.log('[CH2-1] PortalIntroModal: onComplete() completed synchronously - auto-complete succeeded');
          }
        }
      } catch (error) {
        console.error('[CH2-1] PortalIntroModal: Error in auto-complete:', error);
        setCompletionSuccess(false);
        // Don't reset flag - let user manually complete
      }
    }
  };

  const handleMarkComplete = async () => {
    if (isCompleting) {
      if (DEBUG_CH2_1) {
        console.log('[CH2-1] PortalIntroModal: Completion already in progress, ignoring click');
      }
      return; // Prevent double-clicks
    }

    if (DEBUG_CH2_1) {
      console.log('[CH2-1] PortalIntroModal: Manual "Mark as Complete" button clicked');
    }
    
    setIsCompleting(true);
    setCompletionAttempted(true);
    
    try {
      // Call onComplete and properly await it - this will mark the challenge as complete in Firestore
      const result = onComplete();
      if (result && typeof result === 'object' && 'then' in result) {
        await result;
      }
      
      if (DEBUG_CH2_1) {
        console.log('[CH2-1] PortalIntroModal: onComplete() finished, waiting for state propagation...');
      }
      
      // Wait longer for Firestore to update and UI to refresh
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mark as successful
      setCompletionSuccess(true);
      setIsCompleting(false);
      
      if (DEBUG_CH2_1) {
        console.log('[CH2-1] PortalIntroModal: Manual completion succeeded - challenge should now be marked as complete');
      }
      
      // Show success message for a moment, then close modal
      // The parent component's real-time listener will update the UI to show completion
      setTimeout(() => {
        if (DEBUG_CH2_1) {
          console.log('[CH2-1] PortalIntroModal: Closing modal after successful completion');
        }
        onClose();
      }, 2000);
      
    } catch (error) {
      console.error('[CH2-1] PortalIntroModal: Error in manual completion:', error);
      setIsCompleting(false);
      setCompletionSuccess(false);
      alert('Error marking challenge as complete. Please try again or contact support.');
    }
  };

  const handleNext = () => {
    // Challenge should be completed, just close the modal
    if (DEBUG_CH2_1) {
      console.log('PortalIntroModal: Next clicked - closing modal', {
        completionSuccess,
        completionAttempted
      });
    }
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
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
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
                onPlay={() => {
                  if (DEBUG_CH2_1) {
                    console.log('[CH2-1] PortalIntroModal: Video started playing');
                  }
                }}
                onPause={() => {
                  if (DEBUG_CH2_1) {
                    console.log('[CH2-1] PortalIntroModal: Video paused');
                  }
                }}
                onError={(e) => {
                  console.error('[CH2-1] PortalIntroModal: Video error:', e);
                }}
                onLoadedMetadata={() => {
                  if (DEBUG_CH2_1 && videoRef.current) {
                    console.log('[CH2-1] PortalIntroModal: Video metadata loaded', {
                      duration: videoRef.current.duration,
                      readyState: videoRef.current.readyState
                    });
                  }
                }}
                onCanPlay={() => {
                  if (DEBUG_CH2_1) {
                    console.log('[CH2-1] PortalIntroModal: Video can play');
                  }
                }}
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
                margin: 0,
                marginBottom: '1rem'
              }}>
                Welcome to Timu Island
              </h2>
              
              {/* Completion Status Message */}
              {completionAttempted && (
                <div style={{
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  marginBottom: '1.5rem',
                  textAlign: 'center',
                  backgroundColor: completionSuccess ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                  border: `1px solid ${completionSuccess ? '#10b981' : '#ef4444'}`,
                  color: completionSuccess ? '#10b981' : '#ef4444'
                }}>
                  {completionSuccess ? (
                    <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>
                      ✅ Challenge completed automatically!
                    </span>
                  ) : (
                    <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>
                      ⚠️ Auto-completion failed. Please click "Mark as Complete" below.
                    </span>
                  )}
                </div>
              )}
              
              {/* Mark as Complete Button - Always show on welcome screen so users can manually complete */}
              <button
                onClick={handleMarkComplete}
                disabled={isCompleting || completionSuccess}
                style={{
                  background: isCompleting 
                    ? 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)' 
                    : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  color: 'white',
                  padding: '0.75rem 2rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  fontWeight: 'bold',
                  fontSize: '1.1rem',
                  cursor: isCompleting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: isCompleting 
                    ? '0 4px 12px rgba(107, 114, 128, 0.4)' 
                    : '0 4px 12px rgba(59, 130, 246, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                  width: '100%',
                  maxWidth: '300px',
                  justifyContent: 'center',
                  opacity: isCompleting ? 0.7 : 1
                }}
                onMouseEnter={(e) => {
                  if (!isCompleting) {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.6)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isCompleting) {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
                  }
                }}
              >
                  {isCompleting ? (
                    <>
                      <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                      Completing...
                    </>
                  ) : completionSuccess ? (
                    <>
                      <span>✅</span>
                      Completed!
                    </>
                  ) : (
                    <>
                      <span>✓</span>
                      Mark as Complete
                    </>
                  )}
                </button>
              
              {/* Next Button */}
              <button
                onClick={handleNext}
                style={{
                  background: completionSuccess ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                  color: 'white',
                  padding: '0.75rem 2rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  fontWeight: 'bold',
                  fontSize: '1.1rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: completionSuccess ? '0 4px 12px rgba(16, 185, 129, 0.4)' : '0 4px 12px rgba(107, 114, 128, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: '100%',
                  maxWidth: '300px',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  if (completionSuccess) {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.6)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (completionSuccess) {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
                  }
                }}
                disabled={!completionSuccess}
              >
                {completionSuccess ? (
                  <>
                    Continue
                    <span>→</span>
                  </>
                ) : (
                  'Complete the challenge first'
                )}
              </button>
            </div>
          </>
        )}
      </div>
      </div>
    </>
  );
};

export default PortalIntroModal;

