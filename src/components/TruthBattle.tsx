import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import BattleEngine from './BattleEngine';

interface TruthBattleProps {
  isOpen: boolean;
  onVictory: (truthRevealed: string) => void;
  onDefeat: () => void;
  onClose: () => void;
}



const TruthBattle: React.FC<TruthBattleProps> = ({ isOpen, onVictory, onDefeat, onClose }) => {
  const { currentUser } = useAuth();
  const { moves, vault } = useBattle();
  
  const [battlePhase, setBattlePhase] = useState<'intro' | 'battle' | 'victory' | 'defeat'>('intro');
  const [showBattleEngine, setShowBattleEngine] = useState(false);

  // Truth revelations based on player's choices
  const truthRevelations = [
    "You are stronger than you believe, but you fear your own power.",
    "Your greatest enemy is not external - it's the voice inside that says 'you're not enough'.",
    "You seek validation from others because you haven't learned to validate yourself.",
    "Your potential is limitless, but you limit yourself with self-imposed boundaries.",
    "You are worthy of love, success, and happiness - but you must first believe it.",
    "Your mistakes don't define you - your response to them does.",
    "You have everything you need within you to overcome any challenge.",
    "The person you're meant to become is already inside you, waiting to emerge."
  ];

  useEffect(() => {
    if (isOpen) {
      // Start intro sequence
      setTimeout(() => {
        setBattlePhase('battle');
        setShowBattleEngine(true);
      }, 3000);
    }
  }, [isOpen]);

  const handleBattleEnd = (result: 'victory' | 'defeat' | 'escape') => {
    setShowBattleEngine(false);
    
    if (result === 'victory') {
      setBattlePhase('victory');
      // Select random truth revelation
      const revealedTruth = truthRevelations[Math.floor(Math.random() * truthRevelations.length)];
      
      setTimeout(() => {
        onVictory(revealedTruth);
      }, 2000);
    } else {
      setBattlePhase('defeat');
      setTimeout(() => {
        onDefeat();
      }, 2000);
    }
  };

  // Truth opponent configuration
  const truthOpponent = {
    id: 'truth',
    name: 'Truth',
    currentPP: 100,
    maxPP: 100,
    shieldStrength: 50,
    maxShieldStrength: 50,
    level: 5
  };

  if (!isOpen) return null;

  return (
    <>
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideInUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
          @keyframes glow {
            0%, 100% { box-shadow: 0 0 5px #dc2626; }
            50% { box-shadow: 0 0 20px #dc2626, 0 0 30px #dc2626; }
          }
        `}
      </style>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        animation: 'fadeIn 0.3s ease-out'
      }}>
        <div style={{
          backgroundColor: '#1f2937',
          borderRadius: '1rem',
          padding: showBattleEngine ? '0' : '2rem',
          maxWidth: '1400px',
          width: '95%',
          maxHeight: '95vh',
          overflow: showBattleEngine ? 'hidden' : 'auto',
          position: 'relative',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          animation: 'slideInUp 0.4s ease-out',
          border: '2px solid #374151'
        }}>
          {/* Close Button */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#9ca3af',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'all 0.2s ease',
              zIndex: 1001
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#374151';
              e.currentTarget.style.color = '#f3f4f6';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#9ca3af';
            }}
          >
            ×
          </button>

          {battlePhase === 'intro' && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <h2 style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: '#fbbf24',
                marginBottom: '1.5rem'
              }}>
                The Truth Materializes...
              </h2>
              
              <div style={{
                width: '150px',
                height: '150px',
                backgroundColor: '#dc2626',
                borderRadius: '50%',
                margin: '0 auto 2rem auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '4rem',
                color: 'white',
                animation: 'glow 2s infinite, pulse 2s infinite'
              }}>
                👁️
              </div>

              <p style={{
                fontSize: '1.1rem',
                color: '#d1d5db',
                marginBottom: '2rem',
                lineHeight: '1.6'
              }}>
                A shadowy figure emerges from the Truth Metal's energy. It looks like you, but different - 
                it carries all your doubts, fears, and hidden truths.
              </p>

              <p style={{
                fontSize: '1rem',
                color: '#fbbf24',
                fontStyle: 'italic',
                fontWeight: '500'
              }}>
                "I am Truth. I am everything you fear about yourself. Defeat me, and you will know yourself truly."
              </p>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '1rem',
                color: '#fbbf24',
                marginTop: '2rem'
              }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  border: '2px solid #fbbf24',
                  borderTop: '2px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                <span>Preparing the battle arena...</span>
              </div>
            </div>
          )}

          {showBattleEngine && battlePhase === 'battle' && (
            <div style={{ 
              width: '100%', 
              height: '100%',
              minHeight: '800px'
            }}>
              <BattleEngine
                onBattleEnd={handleBattleEnd}
                opponent={truthOpponent}
              />
            </div>
          )}

          {battlePhase === 'victory' && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <h2 style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: '#10b981',
                marginBottom: '1.5rem'
              }}>
                🏆 Victory!
              </h2>
              
              <div style={{
                width: '120px',
                height: '120px',
                backgroundColor: '#10b981',
                borderRadius: '50%',
                margin: '0 auto 2rem auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '3rem',
                color: 'white',
                animation: 'pulse 2s infinite'
              }}>
                ✨
              </div>

              <p style={{
                fontSize: '1.1rem',
                color: '#d1d5db',
                marginBottom: '2rem',
                lineHeight: '1.6'
              }}>
                Truth has been defeated! The energy of the Truth Metal flows through you, 
                revealing deep insights about yourself...
              </p>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '1rem',
                color: '#fbbf24'
              }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  border: '2px solid #fbbf24',
                  borderTop: '2px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                <span>Revealing your truth...</span>
              </div>
            </div>
          )}

          {battlePhase === 'defeat' && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <h2 style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: '#dc2626',
                marginBottom: '1.5rem'
              }}>
                💔 Defeat
              </h2>
              
              <div style={{
                width: '120px',
                height: '120px',
                backgroundColor: '#dc2626',
                borderRadius: '50%',
                margin: '0 auto 2rem auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '3rem',
                color: 'white',
                animation: 'pulse 2s infinite'
              }}>
                😞
              </div>

              <p style={{
                fontSize: '1.1rem',
                color: '#d1d5db',
                marginBottom: '2rem',
                lineHeight: '1.6'
              }}>
                Truth has overwhelmed you. The battle has ended, but your journey of self-discovery continues...
              </p>

              <p style={{
                fontSize: '1rem',
                color: '#fbbf24',
                fontStyle: 'italic',
                fontWeight: '500'
              }}>
                "Every defeat is a lesson. Every lesson brings you closer to your truth."
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default TruthBattle;
