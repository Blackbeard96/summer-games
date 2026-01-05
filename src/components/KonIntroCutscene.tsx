import React, { useState, useEffect, useRef } from 'react';

interface KonIntroCutsceneProps {
  isOpen: boolean;
  onComplete: () => void;
}

const KonIntroCutscene: React.FC<KonIntroCutsceneProps> = ({ isOpen, onComplete }) => {
  const [currentScene, setCurrentScene] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const [showKonStrikes, setShowKonStrikes] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setCurrentScene(0);
      setShowVideo(false);
      setVideoEnded(false);
      setShowKonStrikes(false);
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    // Play video when it's shown
    if (showVideo && videoRef.current) {
      videoRef.current.play().catch(error => {
        console.error('Error playing Kon intro video:', error);
      });
    }
  }, [showVideo]);

  const handleNext = () => {
    if (currentScene < 1) {
      setCurrentScene(currentScene + 1);
    } else {
      // On final dialogue scene, show video
      setShowVideo(true);
    }
  };

  const handleVideoEnd = () => {
    setVideoEnded(true);
    // After video ends, show KonStrikes image scene
    setShowKonStrikes(true);
  };

  const handleContinue = () => {
    // After KonStrikes scene, complete to start Wave 4 battle
    console.log('KonIntroCutscene: KonStrikes scene completed, calling onComplete to start Wave 4');
    onComplete();
  };

  if (!isOpen) return null;

  const dialogues = [
    "Now what do we have here? More practice for me?",
    "I'm still not very good at holding back. I appreciate the practice."
  ];

  // Show KonStrikes image scene after video
  if (showKonStrikes) {
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
          {/* Kon Strikes Image */}
          <img
            src="/images/Ch2-4_KonStrikes.png"
            alt="Kon Strikes"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />

          {/* Continue Button */}
          <button
            onClick={handleContinue}
            style={{
              position: 'absolute',
              bottom: '2rem',
              padding: '1rem 2rem',
              fontSize: '1.25rem',
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
              e.currentTarget.style.transform = 'scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#8b5cf6';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            Start Wave 4
          </button>
        </div>
      </div>
    );
  }

  // Show video after final dialogue scene
  if (showVideo) {
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
            src="/videos/Ch2-4_KonIntro.mp4"
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
        </div>
      </div>
    );
  }

  // Show dialogue scenes
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
          src="/images/Ch2-4_KonReady.png"
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
              fontSize: '1.5rem',
              color: '#ffffff',
              textAlign: 'center',
              lineHeight: '1.6',
              minHeight: '4rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {dialogues[currentScene]}
          </div>

          {/* Progress Indicator */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '0.5rem',
              marginTop: '1.5rem',
            }}
          >
            {dialogues.map((_, index) => (
              <div
                key={index}
                style={{
                  width: index === currentScene ? '2rem' : '0.5rem',
                  height: '0.5rem',
                  backgroundColor: index === currentScene ? '#8b5cf6' : '#4b5563',
                  borderRadius: '0.25rem',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </div>
        </div>

        {/* Continue/Next Button */}
        <button
          onClick={handleNext}
          style={{
            position: 'absolute',
            bottom: '1rem',
            padding: '1rem 2rem',
            fontSize: '1.25rem',
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
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#8b5cf6';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {currentScene < 1 ? 'Next' : 'Continue'}
        </button>
      </div>
    </div>
  );
};

export default KonIntroCutscene;

