import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useStory } from '../context/StoryContext';
import { useBattle } from '../context/BattleContext';
import { STORY_EPISODES, BossData } from '../types/story';
import EpisodeRewardsModal from '../components/EpisodeRewardsModal';

const StoryEpisodeBattle: React.FC = () => {
  const { episodeId } = useParams<{ episodeId: string }>();
  const { currentUser } = useAuth();
  const { defeatBoss } = useStory();
  const { vault } = useBattle();
  const navigate = useNavigate();

  const [episode, setEpisode] = useState(STORY_EPISODES.find(ep => ep.id === episodeId));
  const [boss, setBoss] = useState<BossData | null>(null);
  const [bossHealth, setBossHealth] = useState(0);
  const [maxBossHealth, setMaxBossHealth] = useState(0);
  const [currentPhase, setCurrentPhase] = useState(1);
  const [playerHealth, setPlayerHealth] = useState(100);
  const [maxPlayerHealth] = useState(100);
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [isBattling, setIsBattling] = useState(false);
  const [battleEnded, setBattleEnded] = useState(false);
  const [victory, setVictory] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const [turn, setTurn] = useState(1);

  useEffect(() => {
    if (!episode) {
      navigate('/story');
      return;
    }

    // Initialize boss
    const bossData = episode.boss;
    setBoss(bossData);
    setBossHealth(bossData.health);
    setMaxBossHealth(bossData.health);
    
    // Initialize battle
    addToBattleLog(`⚔️ Battle Start: ${bossData.name}`);
    addToBattleLog(`${bossData.name} has ${bossData.health} HP!`);
    
  }, [episode, navigate]);

  const addToBattleLog = (message: string) => {
    setBattleLog(prev => [...prev, message]);
  };

  const calculateDamage = (baseDamage: number): number => {
    // Add some randomness to damage (±20%)
    const variance = 0.2;
    const modifier = 1 + (Math.random() * variance * 2 - variance);
    return Math.round(baseDamage * modifier);
  };

  const playerAttack = () => {
    if (!boss || battleEnded || !isBattling) return;

    // Player attacks
    const damage = calculateDamage(20 + (vault?.shieldStrength || 0));
    const newBossHealth = Math.max(0, bossHealth - damage);
    setBossHealth(newBossHealth);
    addToBattleLog(`💥 You deal ${damage} damage to ${boss.name}!`);

    // Check if boss is defeated
    if (newBossHealth <= 0) {
      handleVictory();
      return;
    }

    // Check for phase transition
    const healthPercent = newBossHealth / maxBossHealth;
    if (boss.phases >= 2 && currentPhase === 1 && healthPercent <= 0.5) {
      setCurrentPhase(2);
      addToBattleLog(`🌟 ${boss.name} enters Phase 2!`);
    }
    if (boss.phases >= 3 && currentPhase === 2 && healthPercent <= 0.25) {
      setCurrentPhase(3);
      addToBattleLog(`⚡ ${boss.name} enters Phase 3!`);
    }

    // Boss attacks back
    setTimeout(() => {
      bossAttack();
    }, 1000);
  };

  const bossAttack = () => {
    if (!boss || battleEnded) return;

    // Get available moves for current phase
    const availableMoves = boss.moves.filter(move => move.phase <= currentPhase);
    
    if (availableMoves.length === 0) {
      addToBattleLog(`${boss.name} has no available moves!`);
      setTurn(prev => prev + 1);
      setIsBattling(false);
      return;
    }

    // Select a random move
    const move = availableMoves[Math.floor(Math.random() * availableMoves.length)];
    
    // Execute move
    if (move.damage) {
      const damage = calculateDamage(move.damage);
      const shieldAbsorbed = Math.min(damage, vault?.shieldStrength || 0);
      const actualDamage = damage - shieldAbsorbed;
      
      const newPlayerHealth = Math.max(0, playerHealth - actualDamage);
      setPlayerHealth(newPlayerHealth);
      
      if (shieldAbsorbed > 0) {
        addToBattleLog(`🛡️ ${boss.name} uses ${move.name}! Your shield absorbs ${shieldAbsorbed} damage!`);
        if (actualDamage > 0) {
          addToBattleLog(`💔 You take ${actualDamage} damage!`);
        }
      } else {
        addToBattleLog(`💔 ${boss.name} uses ${move.name} for ${actualDamage} damage!`);
      }

      // Check if player is defeated
      if (newPlayerHealth <= 0) {
        handleDefeat();
        return;
      }
    } else {
      addToBattleLog(`✨ ${boss.name} uses ${move.name}!`);
    }

    // Apply effects
    move.effects.forEach(effect => {
      if (effect.type === 'debuff' && effect.target === 'player') {
        addToBattleLog(`⚠️ You are debuffed! (-${effect.value} for ${effect.duration} turns)`);
      }
    });

    setTurn(prev => prev + 1);
    setIsBattling(false);
  };

  const handleVictory = async () => {
    if (!episode || !currentUser) return;
    
    setBattleEnded(true);
    setVictory(true);
    addToBattleLog(`🎉 Victory! You defeated ${boss?.name}!`);
    
    // Mark boss as defeated in story progress
    try {
      await defeatBoss(episode.id);
      
      // Show rewards modal after a short delay
      setTimeout(() => {
        setShowRewards(true);
      }, 1500);
    } catch (error) {
      console.error('Error marking boss as defeated:', error);
    }
  };

  const handleDefeat = () => {
    setBattleEnded(true);
    setVictory(false);
    addToBattleLog(`💀 Defeat! You have been defeated...`);
  };

  const handleAttackClick = () => {
    if (isBattling) return;
    setIsBattling(true);
    playerAttack();
  };

  const handleRetry = () => {
    // Reset battle state
    if (!episode) return;
    
    const bossData = episode.boss;
    setBossHealth(bossData.health);
    setMaxBossHealth(bossData.health);
    setCurrentPhase(1);
    setPlayerHealth(maxPlayerHealth);
    setBattleLog([]);
    setBattleEnded(false);
    setVictory(false);
    setTurn(1);
    addToBattleLog(`⚔️ Battle Start: ${bossData.name}`);
    addToBattleLog(`${bossData.name} has ${bossData.health} HP!`);
  };

  const handleCloseRewards = () => {
    setShowRewards(false);
    navigate('/story');
  };

  if (!episode || !boss) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
          <div style={{ fontSize: '1.25rem' }}>Episode not found</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
      padding: '2rem'
    }}>
      {/* Header */}
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <button
          onClick={() => navigate('/story')}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: 'white',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: '500'
          }}
        >
          ← Back to Story
        </button>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: 'bold',
          color: 'white',
          margin: 0,
          textAlign: 'center',
          flex: 1
        }}>
          {episode.title}
        </h1>
        <div style={{ width: '150px' }} />
      </div>

      {/* Battle Arena */}
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '2rem',
        marginBottom: '2rem'
      }}>
        {/* Boss Side */}
        <div style={{
          background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
          borderRadius: '1.5rem',
          padding: '2rem',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
          border: '2px solid rgba(255, 255, 255, 0.1)'
        }}>
          <h2 style={{
            fontSize: '1.75rem',
            fontWeight: 'bold',
            color: 'white',
            marginBottom: '1rem',
            textAlign: 'center'
          }}>
            {boss.name}
          </h2>

          {/* Boss Visual */}
          <div style={{
            width: '200px',
            height: '200px',
            margin: '0 auto 1.5rem',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '6rem',
            border: '4px solid rgba(255, 255, 255, 0.2)',
            boxShadow: currentPhase > 1 ? '0 0 30px rgba(239, 68, 68, 0.6)' : 'none'
          }}>
            👹
          </div>

          {/* Boss Health Bar */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '0.5rem',
              color: 'white'
            }}>
              <span style={{ fontWeight: 'bold' }}>HP</span>
              <span>{bossHealth}/{maxBossHealth}</span>
            </div>
            <div style={{
              background: 'rgba(0, 0, 0, 0.3)',
              height: '20px',
              borderRadius: '10px',
              overflow: 'hidden',
              border: '2px solid rgba(255, 255, 255, 0.2)'
            }}>
              <div style={{
                background: bossHealth / maxBossHealth > 0.5
                  ? 'linear-gradient(90deg, #10b981, #059669)'
                  : bossHealth / maxBossHealth > 0.25
                    ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                    : 'linear-gradient(90deg, #ef4444, #dc2626)',
                height: '100%',
                width: `${(bossHealth / maxBossHealth) * 100}%`,
                transition: 'width 0.5s ease'
              }} />
            </div>
          </div>

          {/* Phase Indicator */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '0.5rem',
            padding: '0.75rem',
            textAlign: 'center',
            color: 'white',
            fontWeight: 'bold',
            marginBottom: '1rem'
          }}>
            Phase {currentPhase} of {boss.phases}
          </div>

          {/* Boss Moves */}
          <div>
            <h3 style={{ color: 'white', fontSize: '1rem', marginBottom: '0.5rem' }}>
              Available Moves:
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {boss.moves.filter(move => move.phase <= currentPhase).map(move => (
                <div key={move.id} style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  padding: '0.5rem',
                  borderRadius: '0.5rem',
                  color: 'rgba(255, 255, 255, 0.8)',
                  fontSize: '0.875rem'
                }}>
                  <strong>{move.name}</strong>
                  {move.damage && ` (${move.damage} dmg)`}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Player Side */}
        <div style={{
          background: 'linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%)',
          borderRadius: '1.5rem',
          padding: '2rem',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
          border: '2px solid rgba(255, 255, 255, 0.1)'
        }}>
          <h2 style={{
            fontSize: '1.75rem',
            fontWeight: 'bold',
            color: 'white',
            marginBottom: '1rem',
            textAlign: 'center'
          }}>
            {currentUser?.displayName || 'You'}
          </h2>

          {/* Player Visual */}
          <div style={{
            width: '200px',
            height: '200px',
            margin: '0 auto 1.5rem',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '6rem',
            border: '4px solid rgba(255, 255, 255, 0.2)'
          }}>
            {currentUser?.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt="Player"
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  objectFit: 'cover'
                }}
              />
            ) : (
              '⚔️'
            )}
          </div>

          {/* Player Health Bar */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '0.5rem',
              color: 'white'
            }}>
              <span style={{ fontWeight: 'bold' }}>HP</span>
              <span>{playerHealth}/{maxPlayerHealth}</span>
            </div>
            <div style={{
              background: 'rgba(0, 0, 0, 0.3)',
              height: '20px',
              borderRadius: '10px',
              overflow: 'hidden',
              border: '2px solid rgba(255, 255, 255, 0.2)'
            }}>
              <div style={{
                background: playerHealth / maxPlayerHealth > 0.5
                  ? 'linear-gradient(90deg, #10b981, #059669)'
                  : playerHealth / maxPlayerHealth > 0.25
                    ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                    : 'linear-gradient(90deg, #ef4444, #dc2626)',
                height: '100%',
                width: `${(playerHealth / maxPlayerHealth) * 100}%`,
                transition: 'width 0.5s ease'
              }} />
            </div>
          </div>

          {/* Turn Counter */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '0.5rem',
            padding: '0.75rem',
            textAlign: 'center',
            color: 'white',
            fontWeight: 'bold',
            marginBottom: '1rem'
          }}>
            Turn {turn}
          </div>

          {/* Action Buttons */}
          {!battleEnded && (
            <button
              onClick={handleAttackClick}
              disabled={isBattling}
              style={{
                width: '100%',
                background: isBattling
                  ? 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)'
                  : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: 'white',
                border: 'none',
                padding: '1rem',
                borderRadius: '0.75rem',
                fontSize: '1.25rem',
                fontWeight: 'bold',
                cursor: isBattling ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                boxShadow: isBattling ? 'none' : '0 4px 12px rgba(239, 68, 68, 0.4)'
              }}
              onMouseEnter={(e) => {
                if (!isBattling) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.5)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.4)';
              }}
            >
              {isBattling ? '⏳ Attacking...' : '⚔️ Attack'}
            </button>
          )}

          {/* Battle End Buttons */}
          {battleEnded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {!victory && (
                <button
                  onClick={handleRetry}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: 'white',
                    border: 'none',
                    padding: '1rem',
                    borderRadius: '0.75rem',
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  🔄 Retry Battle
                </button>
              )}
              <button
                onClick={() => navigate('/story')}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                ← Return to Story
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Battle Log */}
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '1rem',
        padding: '1.5rem',
        border: '2px solid rgba(255, 255, 255, 0.1)'
      }}>
        <h3 style={{
          color: 'white',
          fontSize: '1.25rem',
          fontWeight: 'bold',
          marginBottom: '1rem'
        }}>
          📜 Battle Log
        </h3>
        <div style={{
          maxHeight: '300px',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          {battleLog.map((message, index) => (
            <div
              key={index}
              style={{
                color: 'rgba(255, 255, 255, 0.9)',
                fontSize: '0.875rem',
                padding: '0.5rem',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '0.25rem',
                animation: 'slideIn 0.3s ease-out'
              }}
            >
              {message}
            </div>
          ))}
        </div>
      </div>

      {/* Rewards Modal */}
      {showRewards && victory && (
        <EpisodeRewardsModal
          episode={episode}
          onClose={handleCloseRewards}
          onClaimComplete={handleCloseRewards}
        />
      )}

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(-20px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
};

export default StoryEpisodeBattle;

