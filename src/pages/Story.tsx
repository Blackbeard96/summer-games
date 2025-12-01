import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { useStory } from '../context/StoryContext';
import { STORY_EPISODES, StoryEpisode } from '../types/story';

const Story: React.FC = () => {
  const { currentUser } = useAuth();
  const { vault, moves, actionCards } = useBattle();
  const { storyProgress, getEpisodeStatus, isEpisodeUnlocked, startEpisode, isLoading, error } = useStory();
  const navigate = useNavigate();
  
  const [selectedEpisode, setSelectedEpisode] = useState<StoryEpisode | null>(null);

  // Calculate player power level
  const calculatePlayerPower = () => {
    if (!vault || !moves || !actionCards) return 0;
    
    const unlockedMoves = moves.filter(move => move.unlocked).length;
    const unlockedCards = actionCards.filter(card => card.unlocked).length;
    const vaultStrength = vault.shieldStrength + (vault.generatorLevel || 1) * 5; // Use generator level instead of firewall
    const level = Math.floor((vault.currentPP / vault.capacity) * 10);
    
    return unlockedMoves * 10 + unlockedCards * 15 + vaultStrength + level;
  };

  const playerPower = calculatePlayerPower();

  // Check if episode is unlocked (with power level check)
  const isEpisodeUnlockedWithPower = (episode: StoryEpisode) => {
    if (episode.id === 'ep_01_xiotein_letter') return true;
    
    const requiredEpisodes = episode.gates.requires;
    const hasRequiredEpisodes = requiredEpisodes.every(req => 
      storyProgress.completedEpisodes.includes(req)
    );
    
    const hasMinLevel = playerPower >= episode.gates.minPower;
    
    return hasRequiredEpisodes && hasMinLevel;
  };

  // Get episode status (with power level check)
  const getEpisodeStatusWithPower = (episode: StoryEpisode) => {
    if (storyProgress.completedEpisodes.includes(episode.id)) {
      return 'completed';
    } else if (isEpisodeUnlockedWithPower(episode)) {
      return 'unlocked';
    } else {
      return 'locked';
    }
  };

  // Get difficulty color
  const getDifficultyColor = (power: number) => {
    if (playerPower >= power) return '#10b981'; // Green - Easy
    if (playerPower >= power * 0.8) return '#f59e0b'; // Yellow - Medium
    return '#ef4444'; // Red - Hard
  };

  // Handle episode selection
  const handleEpisodeClick = (episode: StoryEpisode) => {
    const status = getEpisodeStatusWithPower(episode);
    if (status === 'locked') return;
    
    setSelectedEpisode(episode);
  };

  // Start episode
  const handleStartEpisode = async (episode: StoryEpisode) => {
    try {
      await startEpisode(episode.id);
      // Navigate to episode battle
      navigate(`/story/${episode.id}/battle`);
    } catch (error) {
      console.error('Error starting episode:', error);
    }
  };

  if (!currentUser) {
    navigate('/login');
    return null;
  }

  if (isLoading) {
    return (
      <div style={{ 
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔄</div>
          <div style={{ fontSize: '1.25rem' }}>Loading Story Mode...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>❌</div>
          <div style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Error Loading Story Mode</div>
          <div style={{ fontSize: '1rem', opacity: 0.8 }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '2rem'
    }}>
      {/* Header */}
      <div style={{
        textAlign: 'center',
        marginBottom: '3rem',
        color: 'white'
      }}>
        <h1 style={{ 
          fontSize: '3rem', 
          fontWeight: 'bold', 
          marginBottom: '1rem',
          textShadow: '0 4px 8px rgba(0,0,0,0.3)'
        }}>
          📖 Story Mode
        </h1>
        <p style={{ 
          fontSize: '1.2rem', 
          opacity: 0.9,
          marginBottom: '2rem'
        }}>
          Your journey through the Nine Knowings Universe
        </p>
        
        {/* Progress Bar */}
        <div style={{
          background: 'rgba(255,255,255,0.2)',
          borderRadius: '1rem',
          padding: '1rem',
          marginBottom: '2rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span>Season Progress</span>
            <span>{storyProgress.completedEpisodes.length}/9 Episodes</span>
          </div>
          <div style={{
            background: 'rgba(255,255,255,0.3)',
            height: '8px',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
              height: '100%',
              width: `${(storyProgress.completedEpisodes.length / 9) * 100}%`,
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>

        {/* Player Power */}
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '0.75rem',
          padding: '1rem',
          display: 'inline-block'
        }}>
          <div style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.25rem' }}>
            Your Power Level
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
            {playerPower}
          </div>
        </div>
      </div>

      {/* Episode Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
        gap: '2rem',
        maxWidth: '1400px',
        margin: '0 auto'
      }}>
        {STORY_EPISODES.map(episode => {
          const status = getEpisodeStatusWithPower(episode);
          const isUnlocked = status !== 'locked';
          const isCompleted = status === 'completed';
          
          return (
            <div
              key={episode.id}
              onClick={() => handleEpisodeClick(episode)}
              style={{
                background: isUnlocked 
                  ? 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
                  : 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                borderRadius: '1.5rem',
                padding: '2rem',
                cursor: isUnlocked ? 'pointer' : 'not-allowed',
                boxShadow: isUnlocked 
                  ? '0 10px 25px -5px rgba(0, 0, 0, 0.2)'
                  : '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                transition: 'all 0.3s ease',
                opacity: isUnlocked ? 1 : 0.7,
                position: 'relative',
                overflow: 'hidden'
              }}
              onMouseEnter={(e) => {
                if (isUnlocked) {
                  e.currentTarget.style.transform = 'translateY(-8px)';
                  e.currentTarget.style.boxShadow = '0 20px 40px -10px rgba(0, 0, 0, 0.3)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = isUnlocked 
                  ? '0 10px 25px -5px rgba(0, 0, 0, 0.2)'
                  : '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
              }}
            >
              {/* Status Badge */}
              <div style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: isCompleted ? '#10b981' : isUnlocked ? '#3b82f6' : '#6b7280',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '1rem',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                textTransform: 'uppercase'
              }}>
                {isCompleted ? '✓ Completed' : isUnlocked ? 'Unlocked' : 'Locked'}
              </div>

              {/* Chapter Number */}
              <div style={{
                position: 'absolute',
                top: '1rem',
                left: '1rem',
                background: 'rgba(0,0,0,0.1)',
                color: isUnlocked ? '#374151' : '#9ca3af',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
                fontWeight: 'bold'
              }}>
                {episode.chapter}
              </div>

              {/* Episode Content */}
              <div style={{ marginTop: '3rem' }}>
                <h3 style={{
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  color: isUnlocked ? '#1f2937' : '#9ca3af',
                  marginBottom: '1rem',
                  textAlign: 'center'
                }}>
                  {episode.title}
                </h3>

                <p style={{
                  color: isUnlocked ? '#6b7280' : '#9ca3af',
                  fontSize: '0.875rem',
                  lineHeight: '1.5',
                  marginBottom: '1.5rem',
                  textAlign: 'center'
                }}>
                  {episode.summary}
                </p>

                {/* Difficulty */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1rem',
                  gap: '0.5rem'
                }}>
                  <span style={{ fontSize: '0.75rem', color: isUnlocked ? '#6b7280' : '#9ca3af' }}>
                    Recommended Power:
                  </span>
                  <span style={{
                    fontSize: '0.875rem',
                    fontWeight: 'bold',
                    color: getDifficultyColor(episode.recommendedPower)
                  }}>
                    {episode.recommendedPower}
                  </span>
                </div>

                {/* Rewards Preview */}
                <div style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  marginBottom: '1.5rem'
                }}>
                  <div style={{
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    color: '#065f46',
                    marginBottom: '0.5rem'
                  }}>
                    Rewards:
                  </div>
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#065f46',
                    lineHeight: '1.4'
                  }}>
                    {episode.rewards.fixed.slice(0, 2).join(', ')}
                    {episode.rewards.fixed.length > 2 && '...'}
                  </div>
                </div>

                {/* Start Button */}
                {isUnlocked && !isCompleted && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEpisode(episode);
                    }}
                    style={{
                      background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                      color: 'white',
                      border: 'none',
                      padding: '0.75rem 1.5rem',
                      borderRadius: '0.75rem',
                      fontSize: '0.875rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      width: '100%',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 8px rgba(59, 130, 246, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    🚀 Start Episode
                  </button>
                )}

                {isCompleted && (
                  <div style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: 'white',
                    padding: '0.75rem',
                    borderRadius: '0.75rem',
                    textAlign: 'center',
                    fontSize: '0.875rem',
                    fontWeight: 'bold'
                  }}>
                    ✅ Episode Complete
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Episode Detail Modal */}
      {selectedEpisode && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '2rem'
        }}
        onClick={() => setSelectedEpisode(null)}
        >
          <div style={{
            background: 'white',
            borderRadius: '1.5rem',
            padding: '2rem',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
              textAlign: 'center'
            }}>
              {selectedEpisode.title}
            </h2>

            <p style={{
              color: '#6b7280',
              fontSize: '1rem',
              lineHeight: '1.6',
              marginBottom: '2rem',
              textAlign: 'center'
            }}>
              {selectedEpisode.summary}
            </p>

            {/* Lore */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                📖 Lore
              </h3>
              {selectedEpisode.lore.map((entry, index) => (
                <div key={index} style={{
                  background: '#f8fafc',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>
                    {entry.speaker}
                  </div>
                  <div style={{ color: '#6b7280', fontStyle: 'italic' }}>
                    "{entry.text}"
                  </div>
                </div>
              ))}
            </div>

            {/* Objectives */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                🎯 Objectives
              </h3>
              {selectedEpisode.objectives.map((objective, index) => (
                <div key={index} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  marginBottom: '0.5rem'
                }}>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: objective.required ? '#ef4444' : '#f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    color: 'white',
                    fontWeight: 'bold'
                  }}>
                    {objective.required ? '!' : '?'}
                  </div>
                  <span style={{ color: '#374151' }}>
                    {objective.text}
                  </span>
                </div>
              ))}
            </div>

            {/* Rewards */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                🎁 Rewards
              </h3>
              <div style={{
                background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                border: '2px solid #bbf7d0',
                borderRadius: '0.75rem',
                padding: '1rem'
              }}>
                <div style={{ marginBottom: '1rem' }}>
                  <strong>Fixed Rewards:</strong>
                  <ul style={{ margin: '0.5rem 0 0 1rem', color: '#065f46' }}>
                    {selectedEpisode.rewards.fixed.map((reward, index) => (
                      <li key={index}>{reward}</li>
                    ))}
                  </ul>
                </div>
                {selectedEpisode.rewards.choices.length > 0 && (
                  <div>
                    <strong>Choice Rewards:</strong>
                    <ul style={{ margin: '0.5rem 0 0 1rem', color: '#065f46' }}>
                      {selectedEpisode.rewards.choices.map((choice, index) => (
                        <li key={index}>{choice}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div style={{ marginTop: '1rem', color: '#065f46' }}>
                  <strong>PP:</strong> {selectedEpisode.rewards.pp} | <strong>XP:</strong> {selectedEpisode.rewards.xp}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button
                onClick={() => setSelectedEpisode(null)}
                style={{
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.75rem',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  flex: 1
                }}
              >
                Close
              </button>
              {getEpisodeStatusWithPower(selectedEpisode) === 'unlocked' && (
                <button
                  onClick={() => {
                    setSelectedEpisode(null);
                    handleStartEpisode(selectedEpisode);
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.75rem',
                    fontSize: '0.875rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    flex: 1
                  }}
                >
                  🚀 Start Episode
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Story;
