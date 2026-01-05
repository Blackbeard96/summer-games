import React, { useState, useRef, useEffect } from 'react';

interface LuzIntroCutsceneProps {
  isOpen: boolean;
  onComplete: () => void;
}

const LuzIntroCutscene: React.FC<LuzIntroCutsceneProps> = ({ isOpen, onComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoEnded, setVideoEnded] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setVideoEnded(false);
      return;
    }

    // Play video when cutscene opens
    if (videoRef.current) {
      videoRef.current.play().catch(error => {
        console.error('Error playing video:', error);
      });
    }
  }, [isOpen]);

  const handleVideoEnd = () => {
    setVideoEnded(true);
  };

  const handleContinue = () => {
    onComplete();
  };

  if (!isOpen) return null;

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
        <video
          ref={videoRef}
          src="/videos/Ch2-4_LuzIntro.mp4"
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
        
        {videoEnded && (
          <button
            onClick={handleContinue}
            style={{
              position: 'absolute',
              bottom: '2rem',
              padding: '1rem 2rem',
              fontSize: '1.25rem',
              fontWeight: 'bold',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#2563eb';
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#3b82f6';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            Continue to Wave 4
          </button>
        )}
      </div>
    </div>
  );
};

export default LuzIntroCutscene;

