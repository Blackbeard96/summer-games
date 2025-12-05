import React, { useState, useEffect } from 'react';

interface ZekeEndsBattleCutsceneProps {
  isOpen: boolean;
  onComplete: () => void;
}

const ZekeEndsBattleCutscene: React.FC<ZekeEndsBattleCutsceneProps> = ({ isOpen, onComplete }) => {
  const [phase, setPhase] = useState<'black' | 'zeke-dialogue' | 'wind-scythe' | 'zeke-vs-hela' | 'fade-to-white' | 'ethic-of-listening' | 'ethic-of-listening-calm' | 'vanish' | 'resolution'>('black');

  useEffect(() => {
    if (!isOpen) {
      setPhase('black');
      return;
    }

    // Phase 1: Black screen (1 second)
    const timer1 = setTimeout(() => {
      setPhase('zeke-dialogue');
    }, 1000);

    // Phase 2: Zeke says "It's time to end this." (4 seconds)
    const timer2 = setTimeout(() => {
      setPhase('wind-scythe');
    }, 5000);

    // Phase 3: Zeke creates and hurls the wind scythe (4 seconds)
    const timer3 = setTimeout(() => {
      setPhase('zeke-vs-hela');
    }, 9000);

    // Phase 4: Zeke vs Hela image (3 seconds)
    const timer4 = setTimeout(() => {
      setPhase('fade-to-white');
    }, 12000);

    // Phase 5: Fade to white (1 second fade)
    const timer5 = setTimeout(() => {
      setPhase('ethic-of-listening');
    }, 13000);

    // Phase 6: Ethic of Listening says "Not today, I'm afraid" (4 seconds)
    const timer6 = setTimeout(() => {
      setPhase('ethic-of-listening-calm');
    }, 17000);

    // Phase 7: Ethic of Listening - Calm with longer dialogue (5 seconds)
    const timer7 = setTimeout(() => {
      setPhase('vanish');
    }, 22000);

    // Phase 8: They vanish together (2 seconds)
    const timer8 = setTimeout(() => {
      setPhase('resolution');
    }, 24000);

    // Phase 9: Resolution - wait for button click
    // (No timer needed - user clicks button to complete)

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timer5);
      clearTimeout(timer6);
      clearTimeout(timer7);
      clearTimeout(timer8);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: phase === 'black' ? '#000000' : phase === 'fade-to-white' ? '#ffffff' : 'rgba(0, 0, 0, 0.95)',
      zIndex: 10000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: phase === 'fade-to-white' ? 'fadeToWhite 1s ease-in' : phase !== 'black' ? 'fadeIn 0.5s ease-in' : 'none'
    }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeToWhite {
          from { background: rgba(0, 0, 0, 0.95); }
          to { background: #ffffff; }
        }
        @keyframes fadeOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `}</style>

      {phase === 'zeke-dialogue' && (
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
            src="/images/Zeke - chill.png"
            alt="Zeke"
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
              color: '#fff',
              fontSize: '2rem',
              fontWeight: 'bold',
              textAlign: 'center',
              lineHeight: '1.6',
              textShadow: '0 0 20px rgba(0, 0, 0, 0.8), 0 0 10px rgba(255, 255, 255, 0.5)',
              background: 'rgba(0, 0, 0, 0.7)',
              padding: '1.5rem 2.5rem',
              borderRadius: '0.75rem',
              border: '2px solid rgba(255, 255, 255, 0.3)'
            }}>
              "It's time to end this."
            </div>
            <div style={{
              color: '#a78bfa',
              fontSize: '1.25rem',
              fontWeight: 'normal',
              textAlign: 'center',
              fontStyle: 'italic'
            }}>
              - Zeke
            </div>
          </div>
        </div>
      )}

      {phase === 'wind-scythe' && (
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
            src="/images/Zeke - Windscyte.png"
            alt="Zeke Windscythe"
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
              color: '#fff',
              fontSize: '2rem',
              fontWeight: 'bold',
              textAlign: 'center',
              lineHeight: '1.6',
              textShadow: '0 0 20px rgba(0, 0, 0, 0.8), 0 0 10px rgba(135, 206, 250, 0.8)',
              background: 'rgba(0, 0, 0, 0.7)',
              padding: '1.5rem 2.5rem',
              borderRadius: '0.75rem',
              border: '2px solid rgba(135, 206, 250, 0.5)'
            }}>
              "Crescent Wind Scythe... SLASH"
            </div>
            <div style={{
              color: '#87cefa',
              fontSize: '1.25rem',
              fontWeight: 'normal',
              textAlign: 'center',
              fontStyle: 'italic'
            }}>
              - Zeke
            </div>
          </div>
        </div>
      )}

      {phase === 'zeke-vs-hela' && (
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
            src="/images/Zeke vs Hela.png"
            alt="Zeke vs Hela"
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
        </div>
      )}

      {phase === 'fade-to-white' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          position: 'relative'
        }}>
          {/* White screen - background handles the fade */}
        </div>
      )}

      {phase === 'ethic-of-listening' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          animation: 'fadeIn 0.5s ease-in',
          position: 'relative',
          background: '#000000'
        }}>
          <img
            src="/images/Ethic of Listening.png"
            alt="Ethic of Listening"
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
              color: '#fff',
              fontSize: '2rem',
              fontWeight: 'bold',
              textAlign: 'center',
              lineHeight: '1.6',
              textShadow: '0 0 20px rgba(0, 0, 0, 0.8), 0 0 10px rgba(139, 92, 246, 0.8)',
              background: 'rgba(0, 0, 0, 0.7)',
              padding: '1.5rem 2.5rem',
              borderRadius: '0.75rem',
              border: '2px solid rgba(139, 92, 246, 0.5)'
            }}>
              "Not today, I'm afraid."
            </div>
            <div style={{
              color: '#a78bfa',
              fontSize: '1.25rem',
              fontWeight: 'normal',
              textAlign: 'center',
              fontStyle: 'italic'
            }}>
              - Ethic of Listening
            </div>
          </div>
        </div>
      )}

      {phase === 'ethic-of-listening-calm' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          animation: 'fadeIn 0.5s ease-in',
          position: 'relative',
          background: '#000000'
        }}>
          <img
            src="/images/EoListening - Calm.png"
            alt="Ethic of Listening - Calm"
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
              color: '#fff',
              fontSize: '1.75rem',
              fontWeight: 'bold',
              textAlign: 'center',
              lineHeight: '1.6',
              textShadow: '0 0 20px rgba(0, 0, 0, 0.8), 0 0 10px rgba(139, 92, 246, 0.8)',
              background: 'rgba(0, 0, 0, 0.7)',
              padding: '1.5rem 2.5rem',
              borderRadius: '0.75rem',
              border: '2px solid rgba(139, 92, 246, 0.5)'
            }}>
              "Now's not the time. But soon. Heed my words and prepare. You must be ready for what is to come."
            </div>
            <div style={{
              color: '#a78bfa',
              fontSize: '1.25rem',
              fontWeight: 'normal',
              textAlign: 'center',
              fontStyle: 'italic'
            }}>
              - Ethic of Listening
            </div>
          </div>
        </div>
      )}

      {phase === 'vanish' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          animation: 'fadeOut 2s ease-out',
          position: 'relative',
          background: '#000000'
        }}>
          <img
            src="/images/EoListening - Calm.png"
            alt="Ethic of Listening - Calm"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              objectPosition: 'center',
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 0,
              opacity: 0.3
            }}
          />
        </div>
      )}

      {phase === 'resolution' && (
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
              color: '#fff',
              fontSize: '1.5rem',
              fontWeight: 'normal',
              textAlign: 'center',
              lineHeight: '1.6',
              textShadow: '0 0 20px rgba(0, 0, 0, 0.8), 0 0 10px rgba(255, 255, 255, 0.5)',
              background: 'rgba(0, 0, 0, 0.7)',
              padding: '1.5rem 2rem',
              borderRadius: '0.75rem',
              marginBottom: '1rem'
            }}>
              Chapter 1 Complete
            </div>
            <div style={{
              color: '#a78bfa',
              fontSize: '1.25rem',
              fontWeight: 'normal',
              textAlign: 'center',
              lineHeight: '1.6',
              textShadow: '0 0 20px rgba(0, 0, 0, 0.8)',
              background: 'rgba(0, 0, 0, 0.7)',
              padding: '1rem 2rem',
              borderRadius: '0.75rem',
              marginBottom: '1rem'
            }}>
              Your journey at Xiotein School has just begun...
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
              Continue Your Journey
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZekeEndsBattleCutscene;

