import React, { useState, useEffect } from 'react';
import { useBattle } from '../context/BattleContext';
import BattleEngine from './BattleEngine';

interface HelaBattleProps {
  isOpen: boolean;
  onClose: () => void;
  onVictory: () => void;
  onDefeat: () => void;
  onEscape: () => void;
}

const HelaBattle: React.FC<HelaBattleProps> = ({ 
  isOpen, 
  onClose, 
  onVictory, 
  onDefeat, 
  onEscape 
}) => {
  const [battlePhase, setBattlePhase] = useState<'intro' | 'hela_revealed' | 'choice' | 'battle' | 'victory' | 'defeat'>('intro');
  const [showBattleEngine, setShowBattleEngine] = useState(false);
  const [playerChoice, setPlayerChoice] = useState<'fight' | 'run' | null>(null);
  const { vault } = useBattle();

  // Hela's stats
  const helaStats = {
    name: 'Hela',
    element: 'Ice',
    powerPoints: 90,
    shields: 30,
    moves: [
      {
        name: 'Ice Shard',
        description: 'Piercing ice attack that deals 5-10 damage',
        damage: { min: 5, max: 10 },
        type: 'attack'
      },
      {
        name: 'Ice Wall',
        description: 'Restores 10-15 shields',
        shieldRestore: { min: 10, max: 15 },
        type: 'defense'
      }
    ]
  };

  const handleChoice = (choice: 'fight' | 'run') => {
    setPlayerChoice(choice);
    if (choice === 'run') {
      onEscape();
    } else {
      setBattlePhase('battle');
      setShowBattleEngine(true);
    }
  };

  const handleBattleEnd = (result: 'victory' | 'defeat' | 'escape') => {
    setShowBattleEngine(false);
    
    if (result === 'victory') {
      setBattlePhase('victory');
      setTimeout(() => {
        onVictory();
      }, 2000);
    } else if (result === 'escape') {
      onEscape();
    } else {
      setBattlePhase('defeat');
      setTimeout(() => {
        onDefeat();
      }, 2000);
    }
  };

  // Hela opponent configuration for BattleEngine
  const helaOpponent = {
    id: 'hela',
    name: helaStats.name,
    currentPP: helaStats.powerPoints,
    maxPP: helaStats.powerPoints,
    shieldStrength: helaStats.shields,
    maxShieldStrength: helaStats.shields,
    level: 3
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
        backgroundColor: '#1a1a2e',
        border: '3px solid #16213e',
        borderRadius: battlePhase === 'battle' ? '0' : '1rem',
        padding: battlePhase === 'battle' ? '0' : '2rem',
        maxWidth: battlePhase === 'battle' ? '1400px' : '700px',
        width: '100%',
        maxHeight: battlePhase === 'battle' ? '95vh' : '80vh',
        overflow: battlePhase === 'battle' ? 'hidden' : 'auto'
      }}>
        {battlePhase === 'intro' && (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ 
              color: '#e94560', 
              fontSize: '2rem', 
              marginBottom: '1rem',
              textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
            }}>
              🧊 The Portal Incident
            </h2>
            
            <div style={{ 
              fontSize: '1.1rem', 
              lineHeight: '1.6', 
              marginBottom: '2rem',
              color: '#eee'
            }}>
              <p style={{ marginBottom: '1rem' }}>
                You arrive at the abandoned subway station and see other manifesters gathering, 
                each holding the same letter from Xiotein School. A portal begins to open, 
                shimmering with mystical energy...
              </p>
              
              <p style={{ marginBottom: '2rem' }}>
                Suddenly, a shard of ice pierces through the portal creator, shutting down 
                the gateway. From the shadows, a figure slowly emerges.
              </p>
            </div>

            <button
              onClick={() => setBattlePhase('hela_revealed')}
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '1rem 2rem',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              Continue
            </button>
          </div>
        )}

        {battlePhase === 'hela_revealed' && (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ 
              color: '#e94560', 
              fontSize: '2rem', 
              marginBottom: '1rem',
              textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
            }}>
              🧊 Hela Revealed
            </h2>
            
            <div style={{ 
              marginBottom: '2rem'
            }}>
              <img 
                src="/images/Hela.png" 
                alt="Hela" 
                style={{
                  width: '450px',
                  height: '300px',
                  objectFit: 'contain',
                  borderRadius: '1rem',
                  border: '3px solid #e94560',
                  marginBottom: '1.5rem'
                }}
              />
              
              <div style={{ 
                fontSize: '1.2rem', 
                fontWeight: 'bold',
                color: '#e94560',
                marginBottom: '1rem'
              }}>
                "You have 2 choices - hand over your power cards and go home... or die."
              </div>
              
              <div style={{
                background: 'linear-gradient(135deg, #e94560 0%, #f27121 100%)',
                border: '2px solid #d63031',
                borderRadius: '0.5rem',
                padding: '1rem',
                marginBottom: '2rem',
                maxWidth: '400px',
                margin: '0 auto 2rem auto'
              }}>
                <p style={{ 
                  color: 'white', 
                  fontWeight: 'bold',
                  margin: 0,
                  fontSize: '1.1rem'
                }}>
                  🧊 Hela steps forward, her ice-based powers crackling around her
                </p>
              </div>
            </div>

            <button
              onClick={() => setBattlePhase('choice')}
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '1rem 2rem',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              Continue
            </button>
          </div>
        )}

        {battlePhase === 'choice' && (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ 
              color: '#e94560', 
              fontSize: '2rem', 
              marginBottom: '2rem',
              textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
            }}>
              ⚔️ Your Choice
            </h2>
            
            <div style={{ 
              fontSize: '1.2rem', 
              marginBottom: '2rem',
              color: '#eee'
            }}>
              <p>Hela stands before you, her ice powers ready to strike.</p>
              <p style={{ marginBottom: '2rem' }}>What will you do?</p>
            </div>

            <div style={{ 
              display: 'flex', 
              gap: '1rem', 
              justifyContent: 'center',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={() => handleChoice('fight')}
                style={{
                  background: 'linear-gradient(135deg, #e94560 0%, #f27121 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '1rem 2rem',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  minWidth: '150px'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(233,69,96,0.4)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                ⚔️ Fight
              </button>

              <button
                onClick={() => handleChoice('run')}
                style={{
                  background: 'linear-gradient(135deg, #6c757d 0%, #495057 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '1rem 2rem',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  minWidth: '150px'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(108,117,125,0.4)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                🏃 Run Away
              </button>
            </div>
          </div>
        )}

        {battlePhase === 'battle' && showBattleEngine && (
          <div style={{ 
            width: '100%', 
            height: '100%',
            minHeight: '800px'
          }}>
            <BattleEngine
              onBattleEnd={handleBattleEnd}
              opponent={helaOpponent}
            />
          </div>
        )}

        {battlePhase === 'victory' && (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ 
              color: '#28a745', 
              fontSize: '2rem', 
              marginBottom: '1rem' 
            }}>
              🎉 Victory!
            </h2>
            <p style={{ fontSize: '1.1rem', color: '#eee', marginBottom: '2rem' }}>
              You've defeated Hela and can now continue to Xiotein School!
            </p>
            <button
              onClick={onClose}
              style={{
                background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)',
                color: 'white',
                border: '3px solid #1e7e34',
                borderRadius: '0.5rem',
                padding: '1rem 2rem',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              Continue Journey
            </button>
          </div>
        )}

        {battlePhase === 'defeat' && (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ 
              color: '#dc3545', 
              fontSize: '2rem', 
              marginBottom: '1rem' 
            }}>
              💀 Defeat
            </h2>
            <p style={{ fontSize: '1.1rem', color: '#eee', marginBottom: '2rem' }}>
              Hela has overpowered you. Your journey ends here...
            </p>
            <button
              onClick={onClose}
              style={{
                background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
                color: 'white',
                border: '3px solid #bd2130',
                borderRadius: '0.5rem',
                padding: '1rem 2rem',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              Return to Challenges
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HelaBattle;
