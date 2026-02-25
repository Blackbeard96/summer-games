import React from 'react';
import { MANIFESTS, PlayerManifest } from '../types/manifest';
import { trackAbilityUsage, trackMoveUsage, getMilestoneProgress, getMoveUsageCount, claimMilestoneRewards, MANIFEST_MILESTONES } from '../utils/manifestTracking';

interface ManifestMove {
  name: string;
  icon?: string;
  description?: string;
  category?: 'manifest' | 'elemental' | 'system';
}

interface ManifestProgressProps {
  playerManifest: PlayerManifest;
  onVeilBreak?: (veilId: string) => void;
  userId?: string;
  onAbilityUsed?: () => void; // Callback to refresh data after ability usage
  moves?: ManifestMove[]; // Player's moves (manifest + elemental)
}

const ManifestProgress: React.FC<ManifestProgressProps> = ({ 
  playerManifest, 
  onVeilBreak, 
  userId, 
  onAbilityUsed,
  moves = []
}) => {
  const manifest = MANIFESTS.find(m => m.id === playerManifest.manifestId);
  
  if (!manifest) {
    return <div>Manifest not found</div>;
  }

  // Get default move name for a level based on manifest type (used when moves array is empty)
  const getDefaultMoveNameForLevel = (level: number): string | null => {
    const defaultMoveNames: { [key: string]: { [level: number]: string } } = {
      'reading': {
        1: 'Read the Room',
        2: 'Pattern Shield',
        3: 'Team Read',
        4: 'Environment Read'
      },
      'writing': {
        1: 'Reality Rewrite',
        2: 'Narrative Barrier',
        3: 'Story Weave',
        4: 'World Rewrite'
      },
      'drawing': {
        1: 'Illusion Strike',
        2: 'Mirage Shield',
        3: 'Visual Deception',
        4: 'Reality Illusion'
      },
      'athletics': {
        1: 'Flow Strike',
        2: 'Rhythm Guard',
        3: 'Team Flow',
        4: 'Athletic Mastery'
      },
      'singing': {
        1: 'Harmonic Blast',
        2: 'Melody Shield',
        3: 'Chorus Power',
        4: 'Song of Power'
      },
      'gaming': {
        1: 'Pattern Break',
        2: 'Strategy Matrix',
        3: 'Game Mastery',
        4: 'Ultimate Strategy'
      },
      'observation': {
        1: 'Strike Counter',
        2: 'Foresight',
        3: 'Perfect Observation',
        4: 'Omniscient View'
      },
      'empathy': {
        1: 'Emotional Resonance',
        2: 'Empathic Barrier',
        3: 'Group Empathy',
        4: 'Universal Connection'
      },
      'creating': {
        1: 'Tool Strike',
        2: 'Construct Shield',
        3: 'Creative Mastery',
        4: 'Divine Creation'
      },
      'cooking': {
        1: 'Energy Feast',
        2: 'Nourishing Barrier',
        3: 'Feast of Power',
        4: 'Divine Nourishment'
      }
    };
    
    return defaultMoveNames[playerManifest.manifestId]?.[level] || null;
  };

  // Map manifest levels to their associated moves
  // This mapping connects manifest levels to the moves that represent them
  const getMoveForLevel = (level: number): string | null => {
    if (moves.length === 0) {
      // Return default move name when no moves are available
      return getDefaultMoveNameForLevel(level);
    }

    // Define keywords/patterns for each manifest type and level
    const manifestLevelPatterns: { [key: string]: { [level: number]: string[] } } = {
      'reading': {
        1: ['read the room', 'emotional read', 'read'],
        2: ['pattern shield', 'shield'],
        3: ['read', 'pattern'],
        4: ['read', 'environment']
      },
      'writing': {
        1: ['reality rewrite', 'rewrite'],
        2: ['narrative barrier', 'barrier'],
        3: ['narrative', 'rewrite'],
        4: ['narrative', 'story']
      },
      'drawing': {
        1: ['illusion strike', 'strike'],
        2: ['mirage shield', 'shield'],
        3: ['illusion', 'mirage'],
        4: ['illusion', 'visual']
      },
      'athletics': {
        1: ['flow strike', 'strike'],
        2: ['rhythm guard', 'guard'],
        3: ['flow', 'rhythm'],
        4: ['flow', 'athletic']
      },
      'singing': {
        1: ['harmonic blast', 'blast'],
        2: ['melody shield', 'shield'],
        3: ['harmonic', 'melody'],
        4: ['harmonic', 'song']
      },
      'gaming': {
        1: ['pattern break', 'break'],
        2: ['strategy matrix', 'matrix'],
        3: ['pattern', 'strategy'],
        4: ['pattern', 'game']
      },
      'observation': {
        1: ['precision strike', 'strike'],
        2: ['memory shield', 'shield'],
        3: ['precision', 'memory'],
        4: ['precision', 'observe']
      },
      'empathy': {
        1: ['emotional resonance', 'resonance'],
        2: ['empathic barrier', 'barrier'],
        3: ['emotional', 'empathic'],
        4: ['emotional', 'empathy']
      },
      'creating': {
        1: ['tool strike', 'strike'],
        2: ['construct shield', 'shield'],
        3: ['tool', 'construct'],
        4: ['tool', 'create']
      },
      'cooking': {
        1: ['energy feast', 'feast'],
        2: ['nourishing barrier', 'barrier'],
        3: ['energy', 'nourishing'],
        4: ['energy', 'cook']
      }
    };

    const patterns = manifestLevelPatterns[playerManifest.manifestId]?.[level] || [];
    if (patterns.length === 0) return null;

    // Find moves that match the patterns for this level
    const matchingMoves = moves.filter(move => {
      const moveNameLower = move.name.toLowerCase();
      return patterns.some(pattern => moveNameLower.includes(pattern));
    });

    // For Level 1, prioritize the first attack/primary move
    if (level === 1 && matchingMoves.length > 0) {
      // Prefer moves that match the first pattern (usually the primary attack move)
      const primaryMove = matchingMoves.find(m => 
        m.name.toLowerCase().includes(patterns[0])
      );
      return primaryMove?.name || matchingMoves[0]?.name;
    }

    return matchingMoves[0]?.name || null;
  };

  const handleAbilityUsage = async (level: number) => {
    if (!userId) {
      console.error('User ID not provided for ability tracking');
      return;
    }

    // Track ability usage by level
    const success = await trackAbilityUsage(userId, playerManifest.manifestId, level);
    
    // Also track move usage if there's a matching move for this level
    const moveName = getMoveForLevel(level);
    if (moveName) {
      await trackMoveUsage(userId, moveName);
    }
    
    if (success && onAbilityUsed) {
      onAbilityUsed(); // Refresh the data
    }
  };

  const currentLevel = manifest.levels.find(l => l.level === playerManifest.currentLevel);
  const nextLevel = manifest.levels.find(l => l.level === playerManifest.currentLevel + 1);
  const progressToNext = nextLevel ? (playerManifest.xp / nextLevel.xpRequired) * 100 : 100;

  return (
    <div style={{
      background: `linear-gradient(135deg, ${manifest.color}10 0%, ${manifest.color}05 100%)`,
      border: `2px solid ${manifest.color}`,
      borderRadius: '1rem',
      padding: '1.5rem',
      marginTop: '1rem', // Add whitespace between title and container
      marginBottom: '1.5rem',
      color: 'white'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '1rem', 
        marginBottom: '1.5rem' 
      }}>
        <div style={{ fontSize: '3rem' }}>
          {manifest.icon}
        </div>
        <div>
          <h3 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 'bold', 
            marginBottom: '0.25rem',
            color: manifest.color
          }}>
            {manifest.name}
          </h3>
          <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
            Level {playerManifest.currentLevel} • {currentLevel?.scale}
          </p>
        </div>
      </div>

      {/* Horizontal Scrollable Cards */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        overflowX: 'auto',
        paddingBottom: '0.5rem',
        scrollbarWidth: 'thin',
        scrollbarColor: `${manifest.color} rgba(255,255,255,0.2)`
      }}>

        {/* Ascension Path Card */}
        <div style={{
          minWidth: '300px',
          background: 'rgba(0,0,0,0.2)',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          border: `1px solid ${manifest.color}50`
        }}>
          <h4 style={{ 
            marginBottom: '1rem', 
            color: manifest.color,
            fontSize: '1.1rem',
            fontWeight: 'bold'
          }}>
            Ascension Path
          </h4>
          <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
            {manifest.levels.map((level) => (
              <div
                key={level.level}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem',
                  background: playerManifest.unlockedLevels.includes(level.level)
                    ? `rgba(${manifest.color.replace('#', '')}20, 0.3)`
                    : 'rgba(255,255,255,0.05)',
                  border: playerManifest.unlockedLevels.includes(level.level)
                    ? `1px solid ${manifest.color}`
                    : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '0.5rem',
                  opacity: playerManifest.unlockedLevels.includes(level.level) ? 1 : 0.6,
                  marginBottom: '0.5rem'
                }}
              >
                <div style={{
                  width: '1.5rem',
                  height: '1.5rem',
                  borderRadius: '50%',
                  background: playerManifest.unlockedLevels.includes(level.level)
                    ? manifest.color
                    : 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 'bold'
                }}>
                  {playerManifest.unlockedLevels.includes(level.level) ? '✓' : level.level}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    marginBottom: '0.25rem'
                  }}>
                    <span style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>
                      {(() => {
                        const moveName = getMoveForLevel(level.level);
                        if (moveName) return `Level ${level.level}: ${moveName}`;
                        // Show manifest name instead of "Self" for level 1
                        if (level.scale === 'Self') return manifest.name;
                        return `Level ${level.level}: ${level.scale}`;
                      })()}
                    </span>
                    <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                      {level.xpRequired} XP
                    </span>
                  </div>
                  <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                    {level.example}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ability Usage Tracking Card */}
        <div style={{
          minWidth: '350px',
          background: 'rgba(0,0,0,0.2)',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          border: `1px solid ${manifest.color}50`
        }}>
          <h4 style={{ 
            marginBottom: '1rem', 
            color: manifest.color,
            fontSize: '1.1rem',
            fontWeight: 'bold'
          }}>
            Ability Usage & Milestones
          </h4>
          <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
            {moves.length > 0 ? (
              // Show move-specific usage
              moves.map((move) => {
                const usageCount = getMoveUsageCount(playerManifest, move.name);
                const milestones = [20, 50, 100];
                const milestoneProgress = getMilestoneProgress(usageCount);
                const reachedMilestones = milestones.filter(m => usageCount >= m);
                const unclaimedMilestones = playerManifest.unclaimedMilestones?.[move.name] || [];
                
                // Check which milestones have been reached
                // A milestone is available to claim if: it's reached AND it's in unclaimedMilestones
                // If reached but not in unclaimedMilestones, it was likely already claimed
                const availableToClaim = milestones.filter(m => {
                  const isReached = usageCount >= m;
                  const isUnclaimed = unclaimedMilestones.includes(m);
                  return isReached && isUnclaimed;
                });
                
                const hasUnclaimedMilestones = availableToClaim.length > 0;
                // Check if any milestones have been reached (for showing button)
                const hasReachedMilestones = reachedMilestones.length > 0;
                
                // Find which level this move corresponds to by checking manifest patterns
                const findLevelForMove = (moveName: string): number | null => {
                  const moveNameLower = moveName.toLowerCase();
                  const manifestLevelPatterns: { [key: string]: { [level: number]: string[] } } = {
                    'reading': {
                      1: ['read the room', 'emotional read', 'read'],
                      2: ['pattern shield', 'shield'],
                      3: ['read', 'pattern'],
                      4: ['read', 'environment']
                    },
                    'writing': {
                      1: ['reality rewrite', 'rewrite'],
                      2: ['narrative barrier', 'barrier'],
                      3: ['narrative', 'rewrite'],
                      4: ['narrative', 'story']
                    },
                    'drawing': {
                      1: ['illusion strike', 'strike'],
                      2: ['mirage shield', 'shield'],
                      3: ['illusion', 'mirage'],
                      4: ['illusion', 'visual']
                    },
                    'athletics': {
                      1: ['flow strike', 'strike'],
                      2: ['rhythm guard', 'guard'],
                      3: ['flow', 'rhythm'],
                      4: ['flow', 'athletic']
                    },
                    'singing': {
                      1: ['harmonic blast', 'blast'],
                      2: ['melody shield', 'shield'],
                      3: ['harmonic', 'melody'],
                      4: ['harmonic', 'song']
                    },
                    'gaming': {
                      1: ['pattern break', 'break'],
                      2: ['strategy matrix', 'matrix'],
                      3: ['pattern', 'strategy'],
                      4: ['pattern', 'game']
                    },
                    'observation': {
                      1: ['precision strike', 'strike'],
                      2: ['memory shield', 'shield'],
                      3: ['precision', 'memory'],
                      4: ['precision', 'observe']
                    },
                    'empathy': {
                      1: ['emotional resonance', 'resonance'],
                      2: ['empathic barrier', 'barrier'],
                      3: ['emotional', 'empathic'],
                      4: ['emotional', 'empathy']
                    },
                    'creating': {
                      1: ['tool strike', 'strike'],
                      2: ['construct shield', 'shield'],
                      3: ['tool', 'construct'],
                      4: ['tool', 'create']
                    },
                    'cooking': {
                      1: ['energy feast', 'feast'],
                      2: ['nourishing barrier', 'barrier'],
                      3: ['energy', 'nourishing'],
                      4: ['energy', 'cook']
                    }
                  };
                  
                  const patterns = manifestLevelPatterns[playerManifest.manifestId];
                  if (!patterns) return null;
                  
                  // Check each level, starting from 1
                  for (let level = 1; level <= 4; level++) {
                    const levelPatterns = patterns[level] || [];
                    // Check if move name matches any pattern for this level
                    if (levelPatterns.some(pattern => moveNameLower.includes(pattern))) {
                      return level;
                    }
                  }
                  return null;
                };
                
                const moveLevel = findLevelForMove(move.name);
                const displayName = moveLevel ? `Level ${moveLevel}: ${move.name}` : move.name;
                
                return (
                  <div
                    key={move.name}
                    style={{
                      padding: '0.75rem',
                      background: `rgba(${manifest.color.replace('#', '')}20, 0.3)`,
                      border: `1px solid ${manifest.color}`,
                      borderRadius: '0.5rem',
                      marginBottom: '0.75rem'
                    }}
                  >
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.5rem'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {move.icon && <span style={{ fontSize: '1rem' }}>{move.icon}</span>}
                        <span style={{ 
                          fontWeight: 'bold', 
                          fontSize: '0.9rem',
                          color: manifest.color
                        }}>
                          {displayName}
                        </span>
                      </div>
                      <span style={{ 
                        fontSize: '0.8rem', 
                        fontWeight: 'bold',
                        color: manifest.color
                      }}>
                        {usageCount} uses
                      </span>
                    </div>
                    
                    {move.description && (
                      <div style={{ 
                        fontSize: '0.7rem', 
                        opacity: 0.8,
                        marginBottom: '0.5rem'
                      }}>
                        {move.description}
                      </div>
                    )}
                    
                    <div style={{ marginBottom: '0.5rem' }}>
                      <div style={{ 
                        fontSize: '0.7rem', 
                        marginBottom: '0.25rem',
                        color: 'rgba(255,255,255,0.8)'
                      }}>
                        Milestones:
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                        {milestones.map((milestone) => {
                          const isReached = usageCount >= milestone;
                          return (
                            <div
                              key={milestone}
                              style={{
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.25rem',
                                fontSize: '0.7rem',
                                fontWeight: 'bold',
                                background: isReached 
                                  ? manifest.color 
                                  : 'rgba(255,255,255,0.1)',
                                color: isReached 
                                  ? 'white' 
                                  : 'rgba(255,255,255,0.6)',
                                border: `1px solid ${isReached ? manifest.color : 'rgba(255,255,255,0.2)'}`
                              }}
                            >
                              {milestone} {isReached ? '✓' : ''}
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Next Milestone Progress */}
                      {milestoneProgress && (
                        <div style={{ marginBottom: '0.5rem' }}>
                          <div style={{ 
                            fontSize: '0.7rem', 
                            marginBottom: '0.25rem',
                            color: 'rgba(255,255,255,0.8)'
                          }}>
                            Next: {milestoneProgress.milestone} uses
                          </div>
                          <div style={{
                            width: '100%',
                            height: '0.25rem',
                            background: 'rgba(255,255,255,0.2)',
                            borderRadius: '0.125rem',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${milestoneProgress.progress}%`,
                              height: '100%',
                              background: manifest.color,
                              transition: 'width 0.3s ease'
                            }} />
                          </div>
                        </div>
                      )}
                      
                      {/* Claim Milestone Button - Replace "Use Ability" when milestones are reached */}
                      {hasReachedMilestones && userId ? (
                        <button
                          onClick={async () => {
                            if (hasUnclaimedMilestones) {
                              // Use availableToClaim - these are reached and in unclaimedMilestones
                              await claimMilestoneRewards(userId, move.name, availableToClaim);
                              if (onAbilityUsed) {
                                onAbilityUsed(); // Refresh the data
                              }
                            }
                          }}
                          disabled={!hasUnclaimedMilestones}
                          style={{
                            padding: '0.5rem 1rem',
                            background: hasUnclaimedMilestones ? '#fbbf24' : '#9ca3af',
                            border: 'none',
                            borderRadius: '0.25rem',
                            color: 'white',
                            cursor: hasUnclaimedMilestones ? 'pointer' : 'not-allowed',
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            width: '100%',
                            transition: 'all 0.2s ease',
                            boxShadow: hasUnclaimedMilestones ? '0 2px 4px rgba(0,0,0,0.2)' : 'none',
                            opacity: hasUnclaimedMilestones ? 1 : 0.6
                          }}
                          onMouseOver={(e) => {
                            if (hasUnclaimedMilestones) {
                              e.currentTarget.style.opacity = '0.9';
                              e.currentTarget.style.transform = 'translateY(-1px)';
                            }
                          }}
                          onMouseOut={(e) => {
                            if (hasUnclaimedMilestones) {
                              e.currentTarget.style.opacity = '1';
                              e.currentTarget.style.transform = 'translateY(0)';
                            }
                          }}
                        >
                          {hasUnclaimedMilestones ? (
                            <>🎁 Claim Milestone{availableToClaim.length > 1 ? 's' : ''} ({availableToClaim.length})</>
                          ) : (
                            <>✓ Milestone Claimed - Next: {milestoneProgress?.milestone || 'N/A'} uses</>
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={async () => {
                            if (userId) {
                              const moveLevel = findLevelForMove(move.name);
                              if (moveLevel) {
                                await handleAbilityUsage(moveLevel);
                              }
                            }
                          }}
                          style={{
                            padding: '0.5rem 1rem',
                            background: manifest.color,
                            border: 'none',
                            borderRadius: '0.25rem',
                            color: 'white',
                            cursor: 'pointer',
                            fontSize: '0.7rem',
                            fontWeight: 'bold',
                            width: '100%',
                            transition: 'opacity 0.2s ease'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.opacity = '0.8'}
                          onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                        >
                          Use Ability
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              // Fallback: Show level-based usage if no moves
              manifest.levels.map((level) => {
                const isUnlocked = playerManifest.unlockedLevels.includes(level.level);
                const usageCount = playerManifest.abilityUsage?.[level.level] || 0;
                const milestones = [...MANIFEST_MILESTONES];
                const milestoneProgress = getMilestoneProgress(usageCount);
                const moveName = getMoveForLevel(level.level) || getDefaultMoveNameForLevel(level.level);
                const unclaimedMilestones = moveName ? (playerManifest.unclaimedMilestones?.[moveName] || []) : [];
                const reachedMilestones = milestones.filter(m => usageCount >= m);
                
                // Check which milestones have been reached and are actually unclaimed
                const availableToClaim = moveName ? milestones.filter(m => {
                  const isReached = usageCount >= m;
                  const isUnclaimed = unclaimedMilestones.includes(m);
                  // If reached, it's available to claim
                  // But only if it's in unclaimedMilestones (not already claimed)
                  return isReached && isUnclaimed;
                }) : [];
                
                const hasUnclaimedMilestones = availableToClaim.length > 0;
                const hasReachedMilestones = reachedMilestones.length > 0;
                
                return (
                  <div
                    key={level.level}
                    style={{
                      padding: '0.75rem',
                      background: isUnlocked 
                        ? `rgba(${manifest.color.replace('#', '')}20, 0.3)`
                        : 'rgba(255,255,255,0.05)',
                      border: isUnlocked
                        ? `1px solid ${manifest.color}`
                        : '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '0.5rem',
                      opacity: isUnlocked ? 1 : 0.4,
                      marginBottom: '0.75rem'
                    }}
                  >
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.5rem'
                    }}>
                      <span style={{ 
                        fontWeight: 'bold', 
                        fontSize: '0.9rem',
                        color: isUnlocked ? manifest.color : 'rgba(255,255,255,0.6)'
                      }}>
                        {(() => {
                          // Always try to get the move name first, even if moves array is empty
                          // This ensures we show "Level 1: Read the Room" instead of "Level 1: Self"
                          const moveName = getMoveForLevel(level.level);
                          if (moveName) {
                            return `Level ${level.level}: ${moveName}`;
                          }
                          // If getMoveForLevel returns null, try the default move name
                          const defaultMoveName = getDefaultMoveNameForLevel(level.level);
                          if (defaultMoveName) {
                            return `Level ${level.level}: ${defaultMoveName}`;
                          }
                          // Final fallback: show level with scale (but this should rarely happen)
                          return `Level ${level.level}: ${level.scale}`;
                        })()}
                      </span>
                      <span style={{ 
                        fontSize: '0.8rem', 
                        fontWeight: 'bold',
                        color: isUnlocked ? manifest.color : 'rgba(255,255,255,0.6)'
                      }}>
                        {usageCount} uses
                      </span>
                    </div>
                    
                    {isUnlocked && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <div style={{ 
                          fontSize: '0.7rem', 
                          marginBottom: '0.25rem',
                          color: 'rgba(255,255,255,0.8)'
                        }}>
                          Milestones:
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                          {milestones.map((milestone) => {
                            const isReached = usageCount >= milestone;
                            return (
                              <div
                                key={milestone}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.7rem',
                                  fontWeight: 'bold',
                                  background: isReached 
                                    ? manifest.color 
                                    : 'rgba(255,255,255,0.1)',
                                  color: isReached 
                                    ? 'white' 
                                    : 'rgba(255,255,255,0.6)',
                                  border: `1px solid ${isReached ? manifest.color : 'rgba(255,255,255,0.2)'}`
                                }}
                              >
                                {milestone} ✓
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Next Milestone Progress */}
                        {milestoneProgress && (
                          <div style={{ marginBottom: '0.5rem' }}>
                            <div style={{ 
                              fontSize: '0.7rem', 
                              marginBottom: '0.25rem',
                              color: 'rgba(255,255,255,0.8)'
                            }}>
                              Next: {milestoneProgress.milestone} uses
                            </div>
                            <div style={{
                              width: '100%',
                              height: '0.25rem',
                              background: 'rgba(255,255,255,0.2)',
                              borderRadius: '0.125rem',
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                width: `${milestoneProgress.progress}%`,
                                height: '100%',
                                background: manifest.color,
                                transition: 'width 0.3s ease'
                              }} />
                            </div>
                          </div>
                        )}
                        
                        {/* Claim Milestone Button - Show if milestones are reached */}
                        {hasReachedMilestones && userId && moveName ? (
                          <button
                            onClick={async () => {
                              if (hasUnclaimedMilestones) {
                                await claimMilestoneRewards(userId, moveName, availableToClaim);
                                if (onAbilityUsed) {
                                  onAbilityUsed(); // Refresh the data
                                }
                              }
                            }}
                            disabled={!hasUnclaimedMilestones}
                            style={{
                              padding: '0.5rem 1rem',
                              background: hasUnclaimedMilestones ? '#fbbf24' : '#9ca3af',
                              border: 'none',
                              borderRadius: '0.25rem',
                              color: 'white',
                              cursor: hasUnclaimedMilestones ? 'pointer' : 'not-allowed',
                              fontSize: '0.8rem',
                              fontWeight: 'bold',
                              width: '100%',
                              transition: 'all 0.2s ease',
                              boxShadow: hasUnclaimedMilestones ? '0 2px 4px rgba(0,0,0,0.2)' : 'none',
                              opacity: hasUnclaimedMilestones ? 1 : 0.6,
                              marginBottom: '0.5rem'
                            }}
                            onMouseOver={(e) => {
                              if (hasUnclaimedMilestones) {
                                e.currentTarget.style.opacity = '0.9';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                              }
                            }}
                            onMouseOut={(e) => {
                              if (hasUnclaimedMilestones) {
                                e.currentTarget.style.opacity = '1';
                                e.currentTarget.style.transform = 'translateY(0)';
                              }
                            }}
                          >
                            {hasUnclaimedMilestones ? (
                              <>🎁 Claim Milestone{availableToClaim.length > 1 ? 's' : ''} ({availableToClaim.length})</>
                            ) : (
                              <>✓ Milestone Claimed - Next: {milestoneProgress?.milestone || 'N/A'} uses</>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAbilityUsage(level.level)}
                            style={{
                              padding: '0.5rem 1rem',
                              background: manifest.color,
                              border: 'none',
                              borderRadius: '0.25rem',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '0.7rem',
                              fontWeight: 'bold',
                              width: '100%',
                              transition: 'opacity 0.2s ease'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.opacity = '0.8'}
                            onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                          >
                            Use Ability
                          </button>
                        )}
                      </div>
                    )}
                    
                    <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                      {level.example}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Elemental Milestones - same tracking as manifest (20, 50, 100, 200, 500) */}
        {moves.some((m) => (m as ManifestMove).category === 'elemental') && (
          <div style={{
            minWidth: '350px',
            background: 'rgba(0,0,0,0.2)',
            padding: '1.5rem',
            borderRadius: '0.75rem',
            border: '1px solid rgba(245, 158, 11, 0.5)'
          }}>
            <h4 style={{
              marginBottom: '1rem',
              color: '#f59e0b',
              fontSize: '1.1rem',
              fontWeight: 'bold'
            }}>
              ⚡ Elemental Milestones
            </h4>
            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
              {moves
                .filter((move) => (move as ManifestMove).category === 'elemental')
                .map((move) => {
                  const usageCount = getMoveUsageCount(playerManifest, move.name);
                  const milestones = [...MANIFEST_MILESTONES];
                  const milestoneProgress = getMilestoneProgress(usageCount);
                  const reachedMilestones = milestones.filter((m) => usageCount >= m);
                  const unclaimedMilestones = playerManifest.unclaimedMilestones?.[move.name] || [];
                  const availableToClaim = milestones.filter((m) => usageCount >= m && unclaimedMilestones.includes(m));
                  const hasUnclaimedMilestones = availableToClaim.length > 0;
                  const hasReachedMilestones = reachedMilestones.length > 0;
                  const elementalColor = '#f59e0b';
                  return (
                    <div
                      key={move.name}
                      style={{
                        padding: '0.75rem',
                        background: 'rgba(245, 158, 11, 0.15)',
                        border: '1px solid rgba(245, 158, 11, 0.5)',
                        borderRadius: '0.5rem',
                        marginBottom: '0.75rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {move.icon && <span style={{ fontSize: '1rem' }}>{move.icon}</span>}
                          <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: elementalColor }}>{move.name}</span>
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: elementalColor }}>{usageCount} uses</span>
                      </div>
                      {move.description && (
                        <div style={{ fontSize: '0.7rem', opacity: 0.8, marginBottom: '0.5rem' }}>{move.description}</div>
                      )}
                      <div style={{ marginBottom: '0.5rem' }}>
                        <div style={{ fontSize: '0.7rem', marginBottom: '0.25rem', color: 'rgba(255,255,255,0.8)' }}>Milestones:</div>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                          {milestones.map((milestone) => {
                            const isReached = usageCount >= milestone;
                            return (
                              <div
                                key={milestone}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.7rem',
                                  fontWeight: 'bold',
                                  background: isReached ? elementalColor : 'rgba(255,255,255,0.1)',
                                  color: isReached ? 'white' : 'rgba(255,255,255,0.6)',
                                  border: `1px solid ${isReached ? elementalColor : 'rgba(255,255,255,0.2)'}`
                                }}
                              >
                                {milestone} {isReached ? '✓' : ''}
                              </div>
                            );
                          })}
                        </div>
                        {milestoneProgress && (
                          <div style={{ marginBottom: '0.5rem' }}>
                            <div style={{ fontSize: '0.7rem', marginBottom: '0.25rem', color: 'rgba(255,255,255,0.8)' }}>Next: {milestoneProgress.milestone} uses</div>
                            <div style={{ width: '100%', height: '0.25rem', background: 'rgba(255,255,255,0.2)', borderRadius: '0.125rem', overflow: 'hidden' }}>
                              <div style={{ width: `${milestoneProgress.progress}%`, height: '100%', background: elementalColor, transition: 'width 0.3s ease' }} />
                            </div>
                          </div>
                        )}
                        {hasReachedMilestones && userId ? (
                          <button
                            onClick={async () => {
                              if (hasUnclaimedMilestones) {
                                await claimMilestoneRewards(userId, move.name, availableToClaim);
                                if (onAbilityUsed) onAbilityUsed();
                              }
                            }}
                            disabled={!hasUnclaimedMilestones}
                            style={{
                              padding: '0.5rem 1rem',
                              background: hasUnclaimedMilestones ? '#f59e0b' : '#9ca3af',
                              border: 'none',
                              borderRadius: '0.25rem',
                              color: 'white',
                              cursor: hasUnclaimedMilestones ? 'pointer' : 'not-allowed',
                              fontSize: '0.8rem',
                              fontWeight: 'bold',
                              width: '100%',
                              transition: 'all 0.2s ease',
                              opacity: hasUnclaimedMilestones ? 1 : 0.6
                            }}
                          >
                            {hasUnclaimedMilestones ? (
                              <>🎁 Claim Milestone{availableToClaim.length > 1 ? 's' : ''} ({availableToClaim.length})</>
                            ) : (
                              <>✓ Milestone Claimed - Next: {milestoneProgress?.milestone || 'N/A'} uses</>
                            )}
                          </button>
                        ) : (
                          <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)' }}>
                            Use this move in battle to progress (20, 50, 100, 200, 500 uses).
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Current Level Card */}
        <div style={{
          minWidth: '280px',
          background: 'rgba(0,0,0,0.3)',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          border: `1px solid ${manifest.color}50`
        }}>
          <h4 style={{ 
            marginBottom: '1rem', 
            color: manifest.color,
            fontSize: '1.1rem',
            fontWeight: 'bold'
          }}>
            Current Power
          </h4>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              {(() => {
                if (!currentLevel) return manifest.name;
                const moveName = getMoveForLevel(currentLevel.level);
                if (moveName) return `Level ${currentLevel.level}: ${moveName}`;
                if (currentLevel.scale === 'Self') return manifest.name;
                return currentLevel.scale;
              })()}
            </div>
            <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: '1.4' }}>
              {currentLevel?.example}
            </p>
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
            <div>XP: {playerManifest.xp}</div>
            {nextLevel && (
              <div>Next Level: {nextLevel.xpRequired} XP</div>
            )}
          </div>
          {nextLevel && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                marginBottom: '0.5rem',
                fontSize: '0.8rem'
              }}>
                <span>Progress to Level {nextLevel.level}</span>
                <span>{Math.round(progressToNext)}%</span>
              </div>
              <div style={{
                width: '100%',
                height: '0.5rem',
                background: 'rgba(255,255,255,0.2)',
                borderRadius: '0.25rem',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${Math.min(progressToNext, 100)}%`,
                  height: '100%',
                  background: manifest.color,
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Veil Card */}
        <div style={{
          minWidth: '250px',
          background: 'rgba(220, 38, 38, 0.2)',
          border: '1px solid rgba(220, 38, 38, 0.5)',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          position: 'relative',
          opacity: 0.6
        }}>
          {/* Lock Icon */}
          <div style={{
            position: 'absolute',
            top: '0.75rem',
            right: '0.75rem',
            fontSize: '1.25rem',
            color: '#DC2626',
            opacity: 0.8
          }}>
            🔒
          </div>
          
          <h4 style={{ 
            marginBottom: '1rem', 
            color: '#DC2626',
            fontSize: '1.1rem',
            fontWeight: 'bold'
          }}>
            Veil to Break
          </h4>
          <p style={{ fontSize: '0.9rem', marginBottom: '1rem', lineHeight: '1.4' }}>
            {playerManifest.veil}
          </p>
          <button
            disabled
            style={{
              padding: '0.75rem 1.5rem',
              background: '#9CA3AF',
              border: 'none',
              borderRadius: '0.5rem',
              color: 'white',
              cursor: 'not-allowed',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              width: '100%',
              opacity: 0.7
            }}
          >
            🔒 Feature Locked
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManifestProgress;