import React, { useState, useEffect } from 'react';

interface GiantIceGolemCutsceneProps {
  isOpen: boolean;
  onComplete: () => void;
}

const GiantIceGolemCutscene: React.FC<GiantIceGolemCutsceneProps> = ({ isOpen, onComplete }) => {
  const [phase, setPhase] = useState<'combining' | 'giant-appears' | 'hela-dialogue' | 'ice-rain' | 'blackout'>('combining');
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setPhase('combining');
      setShowText(false);
      return;
    }

    // Phase 1: Golems combining (2 seconds)
    const timer1 = setTimeout(() => {
      setPhase('giant-appears');
      setShowText(true);
    }, 2000);

    // Phase 2: Giant appears (3 seconds)
    const timer2 = setTimeout(() => {
      setPhase('hela-dialogue');
      setShowText(false);
    }, 5000);

    // Phase 3: Hela dialogue "Let's end this now!" (2 seconds)
    const timer3 = setTimeout(() => {
      setPhase('ice-rain');
    }, 7000);

    // Phase 4: Ice Rain scene (3 seconds)
    const timer4 = setTimeout(() => {
      setPhase('blackout');
    }, 10000);

    // Phase 5: Blackout, then complete (1 second)
    const timer5 = setTimeout(() => {
      onComplete();
    }, 11000);

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
      background: phase === 'blackout' 
        ? '#000000' 
        : phase === 'ice-rain'
        ? 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)'
        : phase === 'hela-dialogue'
        ? 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #60a5fa 100%)'
        : 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background 0.5s ease',
      overflow: 'hidden'
    }}>
      {/* Combining Phase - Show multiple Ice Golems */}
      {phase === 'combining' && (
        <div style={{
          display: 'flex',
          gap: '2rem',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeIn 0.5s ease-in'
        }}>
          {[1, 2, 3, 4].map((num) => (
            <div
              key={num}
              style={{
                width: '150px',
                height: '150px',
                backgroundImage: 'url("/images/Ice Golem.png")',
                backgroundSize: 'contain',
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'center',
                filter: 'drop-shadow(0 0 20px rgba(59, 130, 246, 0.8))',
                animation: `combine${num} 2s ease-in-out`,
                opacity: 1
              }}
            />
          ))}
        </div>
      )}

      {/* Giant Appears Phase */}
      {phase === 'giant-appears' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2rem',
          animation: 'fadeIn 0.5s ease-in'
        }}>
          <div
            style={{
              width: '400px',
              height: '500px',
              backgroundImage: 'url("/images/Giant Ice Golem.png")',
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              filter: 'drop-shadow(0 0 30px rgba(59, 130, 246, 1))',
              animation: 'giantAppear 1s ease-out'
            }}
          />
          {showText && (
            <div style={{
              color: '#fff',
              fontSize: '2rem',
              fontWeight: 'bold',
              textAlign: 'center',
              textShadow: '0 0 20px rgba(59, 130, 246, 0.8)',
              animation: 'fadeIn 0.5s ease-in'
            }}>
              The Golems Combine...
            </div>
          )}
        </div>
      )}

      {/* Hela Dialogue Phase */}
      {phase === 'hela-dialogue' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2rem',
          width: '100%',
          height: '100%'
        }}>
          <div
            style={{
              width: '400px',
              height: '500px',
              backgroundImage: 'url("/images/Giant Ice Golem.png")',
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              filter: 'drop-shadow(0 0 40px rgba(59, 130, 246, 1))',
              animation: 'giantAppear 1s ease-out'
            }}
          />
          <div style={{
            color: '#fff',
            fontSize: '2.5rem',
            fontWeight: 'bold',
            textAlign: 'center',
            textShadow: '0 0 30px rgba(59, 130, 246, 1)',
            zIndex: 1,
            animation: 'fadeIn 0.3s ease-in',
            fontStyle: 'italic'
          }}>
            "Let's end this now!"
          </div>
        </div>
      )}

      {/* Ice Rain Phase */}
      {phase === 'ice-rain' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '2rem',
          width: '100%',
          height: '100%',
          position: 'relative'
        }}>
          <div
            style={{
              width: '100%',
              height: '100%',
              backgroundImage: 'url("/images/Ice Rain.png")',
              backgroundSize: 'cover',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              position: 'absolute',
              top: 0,
              left: 0,
              zIndex: 0
            }}
          />
          <div style={{
            color: '#fff',
            fontSize: '3rem',
            fontWeight: 'bold',
            textAlign: 'center',
            textShadow: '0 0 40px rgba(59, 130, 246, 1), 0 0 80px rgba(59, 130, 246, 0.8)',
            zIndex: 1,
            animation: 'fadeIn 0.3s ease-in',
            fontStyle: 'italic',
            position: 'relative',
            marginTop: '2rem'
          }}>
            "Ice Age: ICE RAIN!"
          </div>
        </div>
      )}

      {/* Blackout Phase */}
      {phase === 'blackout' && (
        <div style={{
          width: '100%',
          height: '100%',
          background: '#000000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'fadeToBlack 0.5s ease-in'
        }}>
          <div style={{
            color: '#fff',
            fontSize: '1.5rem',
            fontWeight: 'bold',
            textAlign: 'center',
            opacity: 0.7
          }}>
            ...
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes combine1 {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          50% { transform: translate(-100px, -50px) scale(0.8); opacity: 0.7; }
          100% { transform: translate(-200px, -100px) scale(0.3); opacity: 0; }
        }
        
        @keyframes combine2 {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          50% { transform: translate(50px, -50px) scale(0.8); opacity: 0.7; }
          100% { transform: translate(100px, -100px) scale(0.3); opacity: 0; }
        }
        
        @keyframes combine3 {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          50% { transform: translate(-50px, 50px) scale(0.8); opacity: 0.7; }
          100% { transform: translate(-100px, 100px) scale(0.3); opacity: 0; }
        }
        
        @keyframes combine4 {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          50% { transform: translate(100px, 50px) scale(0.8); opacity: 0.7; }
          100% { transform: translate(200px, 100px) scale(0.3); opacity: 0; }
        }
        
        @keyframes giantAppear {
          0% { transform: scale(0) rotate(0deg); opacity: 0; }
          50% { transform: scale(1.2) rotate(180deg); opacity: 0.8; }
          100% { transform: scale(1) rotate(360deg); opacity: 1; }
        }
        
        @keyframes attackPulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 40px rgba(239, 68, 68, 1)); }
          50% { transform: scale(1.1); filter: drop-shadow(0 0 60px rgba(239, 68, 68, 1)); }
        }
        
        @keyframes attackBeam {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.5); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
        
        @keyframes fadeToBlack {
          from { background: rgba(0, 0, 0, 0); }
          to { background: rgba(0, 0, 0, 1); }
        }
      `}</style>
    </div>
  );
};

export default GiantIceGolemCutscene;

