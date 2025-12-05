import React, { useState, useEffect } from 'react';

interface IcyDeathCutsceneProps {
  isOpen: boolean;
  onComplete: () => void;
}

const IcyDeathCutscene: React.FC<IcyDeathCutsceneProps> = ({ isOpen, onComplete }) => {
  const [phase, setPhase] = useState<'black' | 'text' | 'image' | 'interrupted' | 'saved' | 'ezekiel'>('black');
  const [textVisible, setTextVisible] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setPhase('black');
      setTextVisible(false);
      return;
    }

    // Phase 1: Black screen (1 second)
    const timer1 = setTimeout(() => {
      setPhase('text');
      setTextVisible(true);
    }, 1000);

    // Phase 2: Text appears and stays (4 seconds)
    const timer2 = setTimeout(() => {
      setPhase('image');
      setTextVisible(false);
    }, 5000);

    // Phase 3: Image scene (3 seconds)
    const timer3 = setTimeout(() => {
      setPhase('interrupted');
    }, 8000);

    // Phase 4: Player interrupted "Oh w..." (2 seconds)
    const timer4 = setTimeout(() => {
      setPhase('saved');
    }, 10000);

    // Phase 5: Saved by the Wind image (3 seconds)
    const timer5 = setTimeout(() => {
      setPhase('ezekiel');
    }, 13000);

    // Phase 6: Ezekiel Arrives image with dialogue and button - wait for button click
    // (No timer needed - user clicks button to complete)

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timer5);
    };
  }, [isOpen, onComplete]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 10000,
      background: phase === 'black' || phase === 'text' || phase === 'interrupted'
        ? '#000000' 
        : phase === 'image' || phase === 'saved' || phase === 'ezekiel'
        ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)'
        : '#000000',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background 0.5s ease',
      overflow: 'hidden'
    }}>
      {/* Black screen with text */}
      {(phase === 'black' || phase === 'text') && (
        <div style={{
          color: '#fff',
          fontSize: '1.5rem',
          fontWeight: 'normal',
          textAlign: 'center',
          padding: '2rem',
          maxWidth: '800px',
          lineHeight: '1.6',
          animation: textVisible ? 'fadeIn 1s ease-in' : 'none',
          opacity: textVisible ? 1 : 0
        }}>
          "I was just starting to think that my life was finally getting better... but now, I just may lose it."
        </div>
      )}

      {/* Icy Death Imminent image */}
      {phase === 'image' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          animation: 'fadeIn 0.5s ease-in'
        }}>
          <img
            src="/images/Icy Death Imminent.png"
            alt="Icy Death Imminent"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              objectPosition: 'center'
            }}
          />
        </div>
      )}

      {/* Player interrupted */}
      {phase === 'interrupted' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          animation: 'fadeIn 0.5s ease-in'
        }}>
          <div style={{
            color: '#fff',
            fontSize: '2rem',
            fontWeight: 'bold',
            textAlign: 'center',
            textShadow: '0 0 20px rgba(59, 130, 246, 0.8)',
            fontStyle: 'italic'
          }}>
            "Oh w..."
          </div>
        </div>
      )}

      {/* Saved by the Wind image */}
      {phase === 'saved' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          animation: 'fadeIn 0.5s ease-in'
        }}>
          <img
            src="/images/Saved by the Wind.png"
            alt="Saved by the Wind"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              objectPosition: 'center'
            }}
          />
        </div>
      )}

      {/* Ezekiel Arrives image with dialogue and button */}
      {phase === 'ezekiel' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          animation: 'fadeIn 0.5s ease-in',
          position: 'relative'
        }}>
          <img
            src="/images/Ezekiel Ventura Arrives.png"
            alt="Ezekiel Arrives"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              objectPosition: 'center',
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 0
            }}
          />
          <div style={{
            position: 'absolute',
            bottom: '4rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1.5rem',
            width: '100%',
            maxWidth: '800px',
            padding: '0 2rem'
          }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              alignItems: 'center'
            }}>
              <div style={{
                color: '#fff',
                fontSize: '1.5rem',
                fontWeight: 'normal',
                textAlign: 'center',
                lineHeight: '1.6',
                textShadow: '0 0 20px rgba(0, 0, 0, 0.8), 0 0 10px rgba(255, 255, 255, 0.5)',
                background: 'rgba(0, 0, 0, 0.5)',
                padding: '1rem 2rem',
                borderRadius: '0.5rem'
              }}>
                "Looks like I arrived on time"
              </div>
              <div style={{
                color: '#fff',
                fontSize: '1.5rem',
                fontWeight: 'normal',
                textAlign: 'center',
                lineHeight: '1.6',
                textShadow: '0 0 20px rgba(0, 0, 0, 0.8), 0 0 10px rgba(255, 255, 255, 0.5)',
                background: 'rgba(0, 0, 0, 0.5)',
                padding: '1rem 2rem',
                borderRadius: '0.5rem'
              }}>
                "Take this"
              </div>
            </div>
            <button
              onClick={onComplete}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                border: 'none',
                padding: '1rem 2rem',
                borderRadius: '0.75rem',
                fontSize: '1.125rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
                textShadow: '0 0 10px rgba(0, 0, 0, 0.3)'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.6)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
              }}
            >
              Accept the Gift from Zeke
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default IcyDeathCutscene;

