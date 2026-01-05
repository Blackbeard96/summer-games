import React, { useState, useEffect, useRef } from 'react';

interface Ch24ConclusionCutsceneProps {
  isOpen: boolean;
  onComplete: () => void;
}

const Ch24ConclusionCutscene: React.FC<Ch24ConclusionCutsceneProps> = ({ isOpen, onComplete }) => {
  const [showVideo, setShowVideo] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [showDialogue, setShowDialogue] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setShowVideo(false);
      setVideoEnded(false);
      setShowDialogue(false);
      return;
    }
    // Show video immediately when opened
    setShowVideo(true);
  }, [isOpen]);

  useEffect(() => {
    // Play video when it's shown
    if (showVideo && videoRef.current) {
      videoRef.current.play().catch(error => {
        console.error('Error playing Ch2-4 Conclusion video:', error);
      });
    }
  }, [showVideo]);

  const handleVideoEnd = () => {
    setVideoEnded(true);
    // After video ends, show dialogue scene
    setShowDialogue(true);
  };

  const handleContinue = () => {
    // After dialogue, complete to transition to Chapter 2-5
    console.log('Ch24ConclusionCutscene: Dialogue completed, calling onComplete to transition to Chapter 2-5');
    onComplete();
  };

  if (!isOpen) return null;

  // Show dialogue scene after video
  if (showDialogue) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#000000',
          zIndex: 20000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
          }}
        >
          {/* Kon Image */}
          <img
            src="/images/Ch2-4_Config_Conclusion.png"
            alt="Kon, the Guardian for Config"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />

          {/* Dialogue Box */}
          <div
            style={{
              position: 'absolute',
              bottom: '4rem',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '80%',
              maxWidth: '800px',
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              border: '3px solid #8b5cf6',
              borderRadius: '1rem',
              padding: '2rem',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            }}
          >
            {/* Speaker Name */}
            <div
              style={{
                fontSize: '1.25rem',
                fontWeight: 'bold',
                color: '#8b5cf6',
                marginBottom: '1rem',
                textAlign: 'center',
              }}
            >
              Kon, the Guardian for Config
            </div>

            {/* Dialogue Text */}
            <div
              style={{
                fontSize: '1.1rem',
                color: '#ffffff',
                lineHeight: '1.6',
                textAlign: 'center',
                marginBottom: '1.5rem',
              }}
            >
              "You have a long way to go, but I believe you are worthy. Take this ... you'll need it for the real battle that is to come."
            </div>

            {/* Continue Button */}
            <button
              onClick={handleContinue}
              style={{
                width: '100%',
                padding: '1rem 2rem',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                backgroundColor: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#7c3aed';
                e.currentTarget.style.transform = 'scale(1.02)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#8b5cf6';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              Take RR Candy (Config)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show video first
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#000000',
        zIndex: 20000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {showVideo && (
          <video
            ref={videoRef}
            src="/videos/Ch2-4_Conclusion_Testing.mp4"
            onEnded={handleVideoEnd}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
            controls={false}
            autoPlay
            playsInline
          />
        )}
      </div>
    </div>
  );
};

export default Ch24ConclusionCutscene;

