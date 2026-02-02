import { db } from '../firebase';
import { doc, updateDoc, getDoc, increment, runTransaction } from 'firebase/firestore';
import { PlayerManifest, MANIFESTS } from '../types/manifest';

/**
 * Track the usage of a manifest ability
 * @param userId - The user's ID
 * @param manifestId - The manifest ID
 * @param level - The ability level that was used
 * @returns Promise<boolean> - Success status
 */
export const trackAbilityUsage = async (
  userId: string, 
  manifestId: string, 
  level: number
): Promise<boolean> => {
  try {
    const userRef = doc(db, 'students', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.error('User document not found');
      return false;
    }
    
    const userData = userDoc.data();
    // The manifest is stored as 'manifest' in the database, not 'playerManifest'
    const playerManifest = (userData.manifest || userData.playerManifest) as PlayerManifest;
    
    if (!playerManifest || playerManifest.manifestId !== manifestId) {
      console.error('Player manifest not found or manifest ID mismatch');
      return false;
    }
    
    // Initialize abilityUsage if it doesn't exist
    if (!playerManifest.abilityUsage) {
      playerManifest.abilityUsage = {};
    }
    
    // Use Firestore transaction with atomic increment to prevent race conditions
    // This ensures accuracy when multiple battles happen simultaneously
    try {
      let newUsageCount = 0;
      await runTransaction(db, async (transaction) => {
        const currentDoc = await transaction.get(userRef);
        if (!currentDoc.exists()) {
          throw new Error('User document not found');
        }
        
        const currentData = currentDoc.data();
        const currentManifest = (currentData.manifest || currentData.playerManifest) as PlayerManifest;
        
        if (!currentManifest || currentManifest.manifestId !== manifestId) {
          throw new Error('Player manifest not found or manifest ID mismatch');
        }
        
        // Initialize abilityUsage if it doesn't exist
        if (!currentManifest.abilityUsage) {
          currentManifest.abilityUsage = {};
        }
        
        // Increment the usage count atomically
        const currentUsage = currentManifest.abilityUsage[level] || 0;
        newUsageCount = currentUsage + 1;
        currentManifest.abilityUsage[level] = newUsageCount;
        
        // Update within transaction
        transaction.update(userRef, {
          manifest: currentManifest
        });
      });
      
      console.log(`Tracked ability usage: Level ${level} of ${manifestId} used ${newUsageCount} times (atomic increment)`);
      return true;
    } catch (transactionError) {
      // Fallback to regular update if transaction fails
      console.warn('Transaction failed, using fallback update:', transactionError);
      const currentUsage = playerManifest.abilityUsage?.[level] || 0;
      const newUsageCount = currentUsage + 1;
      if (!playerManifest.abilityUsage) {
        playerManifest.abilityUsage = {};
      }
      playerManifest.abilityUsage[level] = newUsageCount;
      
      await updateDoc(userRef, {
        manifest: playerManifest
      });
      
      console.log(`Tracked ability usage: Level ${level} of ${manifestId} used ${newUsageCount} times (fallback)`);
      return true;
    }
  } catch (error) {
    console.error('Error tracking ability usage:', error);
    return false;
  }
};

/**
 * Get the usage count for a specific ability level
 * @param playerManifest - The player's manifest data
 * @param level - The ability level
 * @returns number - The usage count
 */
export const getAbilityUsageCount = (playerManifest: PlayerManifest, level: number): number => {
  return playerManifest.abilityUsage?.[level] || 0;
};

/**
 * Check if a milestone has been reached
 * @param usageCount - The current usage count
 * @param milestone - The milestone to check (20, 50, 100)
 * @returns boolean - Whether the milestone has been reached
 */
export const hasReachedMilestone = (usageCount: number, milestone: number): boolean => {
  return usageCount >= milestone;
};

/**
 * Get all reached milestones for a usage count
 * @param usageCount - The current usage count
 * @returns number[] - Array of reached milestones
 */
export const getReachedMilestones = (usageCount: number): number[] => {
  const milestones = [20, 50, 100];
  return milestones.filter(milestone => usageCount >= milestone);
};

/**
 * Get the next milestone to reach
 * @param usageCount - The current usage count
 * @returns number | null - The next milestone or null if all are reached
 */
export const getNextMilestone = (usageCount: number): number | null => {
  const milestones = [20, 50, 100];
  return milestones.find(milestone => usageCount < milestone) || null;
};

/**
 * Calculate progress towards the next milestone
 * @param usageCount - The current usage count
 * @returns { milestone: number, progress: number } | null - Progress info or null if all milestones reached
 */
export const getMilestoneProgress = (usageCount: number): { milestone: number, progress: number } | null => {
  const nextMilestone = getNextMilestone(usageCount);
  if (!nextMilestone) return null;
  
  const previousMilestone = nextMilestone === 20 ? 0 : (nextMilestone === 50 ? 20 : 50);
  const progress = ((usageCount - previousMilestone) / (nextMilestone - previousMilestone)) * 100;
  
  return {
    milestone: nextMilestone,
    progress: Math.min(Math.max(progress, 0), 100)
  };
};

/**
 * Initialize ability usage tracking for a new manifest
 * @param playerManifest - The player's manifest data
 * @returns PlayerManifest - Updated manifest with initialized usage tracking
 */
export const initializeAbilityUsage = (playerManifest: PlayerManifest): PlayerManifest => {
  if (!playerManifest.abilityUsage) {
    playerManifest.abilityUsage = {};
  }
  if (!playerManifest.moveUsage) {
    playerManifest.moveUsage = {};
  }
  return playerManifest;
};

/**
 * Determine which manifest level a move corresponds to
 * @param moveName - The name of the move
 * @param manifestId - The manifest ID
 * @returns number | null - The level (1-4) or null if not found
 */
const getManifestLevelForMove = (moveName: string, manifestId: string): number | null => {
  const moveNameLower = moveName.toLowerCase();
  
  // Define keywords/patterns for each manifest type and level
  // More specific patterns should come first, generic ones last
  // Patterns match actual move names from MOVE_TEMPLATES and common variations
  const manifestLevelPatterns: { [key: string]: { [level: number]: string[] } } = {
    'reading': {
      1: ['read the room', 'emotional read', 'read'], // Level 1: Emotional Read, Read the Room (custom)
      2: ['pattern shield', 'shield'], // Level 2: Pattern Shield
      3: ['team read', 'read pattern', 'pattern'], // Level 3: Team Read
      4: ['environment read', 'read environment', 'environment'] // Level 4: Environment Read
    },
    'writing': {
      1: ['reality rewrite', 'rewrite'], // Level 1: Reality Rewrite
      2: ['narrative barrier', 'barrier'], // Level 2: Narrative Barrier
      3: ['narrative weave', 'story weave', 'narrative'], // Level 3: Story Weave
      4: ['world rewrite', 'rewrite world', 'story'] // Level 4: World Rewrite
    },
    'drawing': {
      1: ['illusion strike', 'strike', 'illusion'], // Level 1: Illusion Strike
      2: ['mirage shield', 'shield', 'mirage'], // Level 2: Mirage Shield
      3: ['visual deception', 'illusion mastery', 'visual'], // Level 3: Visual Deception
      4: ['reality illusion', 'illusion reality', 'reality'] // Level 4: Reality Illusion
    },
    'athletics': {
      1: ['flow strike', 'strike', 'flow'], // Level 1: Flow Strike
      2: ['rhythm guard', 'guard', 'rhythm'], // Level 2: Rhythm Guard
      3: ['team flow', 'flow team', 'team'], // Level 3: Team Flow
      4: ['athletic mastery', 'mastery athletic', 'athletic'] // Level 4: Athletic Mastery
    },
    'singing': {
      1: ['harmonic blast', 'blast', 'harmonic'], // Level 1: Harmonic Blast
      2: ['melody shield', 'shield', 'melody'], // Level 2: Melody Shield
      3: ['chorus power', 'harmonic chorus', 'chorus'], // Level 3: Chorus Power
      4: ['song of power', 'power song', 'song'] // Level 4: Song of Power
    },
    'gaming': {
      1: ['pattern break', 'break', 'pattern'], // Level 1: Pattern Break
      2: ['strategy matrix', 'matrix', 'strategy'], // Level 2: Strategy Matrix
      3: ['game mastery', 'gaming mastery', 'game'], // Level 3: Game Mastery
      4: ['ultimate strategy', 'strategy ultimate', 'ultimate'] // Level 4: Ultimate Strategy
    },
    'observation': {
      1: ['strike counter', 'counter', 'strike'], // Level 1: Strike Counter
      2: ['foresight', 'foresee', 'predict'], // Level 2: Foresight
      3: ['perfect observation', 'observation perfect', 'perfect'], // Level 3: Perfect Observation
      4: ['omniscient view', 'view omniscient', 'omniscient'] // Level 4: Omniscient View
    },
    'empathy': {
      1: ['emotional resonance', 'resonance', 'emotional'], // Level 1: Emotional Resonance
      2: ['empathic barrier', 'barrier', 'empathic'], // Level 2: Empathic Barrier
      3: ['group empathy', 'empathy group', 'group'], // Level 3: Group Empathy
      4: ['universal connection', 'connection universal', 'universal'] // Level 4: Universal Connection
    },
    'creating': {
      1: ['tool strike', 'strike', 'tool'], // Level 1: Tool Strike
      2: ['construct shield', 'shield', 'construct'], // Level 2: Construct Shield
      3: ['creative mastery', 'mastery creative', 'creative'], // Level 3: Creative Mastery
      4: ['divine creation', 'creation divine', 'divine'] // Level 4: Divine Creation
    },
    'cooking': {
      1: ['energy feast', 'feast', 'energy'], // Level 1: Energy Feast
      2: ['nourishing barrier', 'barrier', 'nourishing'], // Level 2: Nourishing Barrier
      3: ['feast of power', 'power feast', 'power'], // Level 3: Feast of Power
      4: ['divine nourishment', 'nourishment divine', 'nourishment'] // Level 4: Divine Nourishment
    }
  };
  
  const patterns = manifestLevelPatterns[manifestId];
  if (!patterns) {
    console.log(`[getManifestLevelForMove] No patterns found for manifest: ${manifestId}`);
    return null;
  }
  
  // Check each level, prioritizing more specific matches
  // Start with Level 1 and work up, but check all patterns for best match
  let bestMatch: { level: number; specificity: number } | null = null;
  
  for (let level = 1; level <= 4; level++) {
    const levelPatterns = patterns[level] || [];
    for (const pattern of levelPatterns) {
      if (moveNameLower.includes(pattern)) {
        // Calculate specificity (longer patterns are more specific)
        const specificity = pattern.length;
        if (!bestMatch || specificity > bestMatch.specificity) {
          bestMatch = { level, specificity };
        }
      }
    }
  }
  
  // If no specific match found, the move is likely not a manifest move
  // or uses a name that doesn't match our patterns
  // In this case, we return null and only track move usage (not ability usage)
  
  if (bestMatch) {
    console.log(`[getManifestLevelForMove] Move "${moveName}" matched Level ${bestMatch.level} for ${manifestId}`);
    return bestMatch.level;
  }
  
  console.log(`[getManifestLevelForMove] No match found for move "${moveName}" with manifest ${manifestId}`);
  return null;
};

/**
 * Track the usage of a move
 * @param userId - The user's ID
 * @param moveName - The name of the move that was used
 * @returns Promise<boolean> - Success status
 */
export const trackMoveUsage = async (
  userId: string,
  moveName: string
): Promise<boolean> => {
  try {
    console.log(`[trackMoveUsage] Starting tracking for move: "${moveName}", userId: ${userId}`);
    
    const userRef = doc(db, 'students', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.error('[trackMoveUsage] User document not found');
      return false;
    }
    
    const userData = userDoc.data();
    // The manifest is stored as 'manifest' in the database, not 'playerManifest'
    let playerManifest = (userData.manifest || userData.playerManifest) as PlayerManifest;
    
    if (!playerManifest) {
      console.error('[trackMoveUsage] Player manifest not found. User data keys:', Object.keys(userData));
      console.error('[trackMoveUsage] Cannot track move usage without a valid manifest. Returning false.');
      // DO NOT create a default manifest - this would overwrite existing data
      // The manifest should be set through the proper manifest selection flow
      return false;
    }
    
    // Initialize moveUsage if it doesn't exist
    if (!playerManifest.moveUsage) {
      playerManifest.moveUsage = {};
      console.log('[trackMoveUsage] Initialized moveUsage object');
    }
    
    // Increment the usage count for this move
    const currentUsage = playerManifest.moveUsage[moveName] || 0;
    playerManifest.moveUsage[moveName] = currentUsage + 1;
    
    console.log(`[trackMoveUsage] Move "${moveName}" usage: ${currentUsage} -> ${playerManifest.moveUsage[moveName]}`);
    
    // Also track as manifest ability usage if this is a manifest move
    const manifestLevel = getManifestLevelForMove(moveName, playerManifest.manifestId);
    if (manifestLevel) {
      // Initialize abilityUsage if it doesn't exist
      if (!playerManifest.abilityUsage) {
        playerManifest.abilityUsage = {};
      }
      
      // Increment the ability usage for this level
      const currentAbilityUsage = playerManifest.abilityUsage[manifestLevel] || 0;
      playerManifest.abilityUsage[manifestLevel] = currentAbilityUsage + 1;
      
      console.log(`[trackMoveUsage] Also tracking as manifest ability: Level ${manifestLevel} of ${playerManifest.manifestId} used ${playerManifest.abilityUsage[manifestLevel]} times`);
    } else {
      console.log(`[trackMoveUsage] Move "${moveName}" does not match any manifest level patterns for ${playerManifest.manifestId}`);
    }
    
    // Check for milestone rewards - mark as unclaimed instead of auto-awarding
    const newUsageCount = playerManifest.moveUsage[moveName];
    const milestones = [20, 50, 100];
    const reachedMilestones = milestones.filter(m => newUsageCount === m);
    
    console.log(`[trackMoveUsage] Reached milestones:`, reachedMilestones);
    
    // Initialize unclaimedMilestones if it doesn't exist
    if (!playerManifest.unclaimedMilestones) {
      playerManifest.unclaimedMilestones = {};
    }
    
    // Initialize unclaimed milestones for this move if it doesn't exist
    if (!playerManifest.unclaimedMilestones[moveName]) {
      playerManifest.unclaimedMilestones[moveName] = [];
    }
    
    // Add newly reached milestones to unclaimed list (avoid duplicates)
    reachedMilestones.forEach(milestone => {
      if (!playerManifest.unclaimedMilestones![moveName].includes(milestone)) {
        playerManifest.unclaimedMilestones![moveName].push(milestone);
        console.log(`[trackMoveUsage] Added milestone ${milestone} to unclaimed list for "${moveName}"`);
      }
    });
    
    // Update the document - use 'manifest' field name to match database structure
    await updateDoc(userRef, {
      manifest: playerManifest
    });
    
    console.log(`[trackMoveUsage] Successfully updated Firestore for move: "${moveName}"`);
    
    // Note: We don't recalculate power level here because move usage doesn't directly affect power level.
    // Power level is based on manifest.currentLevel (ascension level), not usage counts.
    // If manifest.currentLevel is updated elsewhere, it should trigger recalculation there.
    
    console.log(`[trackMoveUsage] Tracked move usage: ${moveName} used ${playerManifest.moveUsage[moveName]} times`);
    return true;
  } catch (error) {
    console.error('[trackMoveUsage] Error tracking move usage:', error);
    return false;
  }
};

/**
 * Claim and award rewards for milestones
 * @param userId - The user's ID
 * @param moveName - The name of the move
 * @param milestones - Array of milestone numbers to claim
 */
export const claimMilestoneRewards = async (
  userId: string,
  moveName: string,
  milestones: number[]
): Promise<void> => {
  try {
    console.log(`[claimMilestoneRewards] Claiming rewards for move: "${moveName}", milestones:`, milestones);
    
    const userRef = doc(db, 'students', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.error('[claimMilestoneRewards] User document not found for milestone rewards');
      return;
    }
    
    const userData = userDoc.data();
    const playerManifest = (userData.manifest || userData.playerManifest) as PlayerManifest;
    
    if (!playerManifest) {
      console.error('[claimMilestoneRewards] Player manifest not found');
      return;
    }
    
    // Initialize unclaimedMilestones if it doesn't exist
    if (!playerManifest.unclaimedMilestones) {
      playerManifest.unclaimedMilestones = {};
    }
    if (!playerManifest.unclaimedMilestones[moveName]) {
      playerManifest.unclaimedMilestones[moveName] = [];
    }
    
    // Get current usage count for this move
    const usageCount = playerManifest.moveUsage?.[moveName] || 0;
    
    // Verify milestones: they must be reached (usageCount >= milestone) and not already claimed
    // If a milestone is reached but not in unclaimedMilestones, add it (handles retroactive cases)
    const validMilestones: number[] = [];
    milestones.forEach(milestone => {
      const isReached = usageCount >= milestone;
      const isInUnclaimed = playerManifest.unclaimedMilestones![moveName].includes(milestone);
      
      if (isReached) {
        // If reached but not in unclaimed list, add it (retroactive claim)
        if (!isInUnclaimed) {
          playerManifest.unclaimedMilestones![moveName].push(milestone);
          console.log(`[claimMilestoneRewards] Added retroactive milestone ${milestone} for "${moveName}"`);
        }
        validMilestones.push(milestone);
      }
    });
    
    if (validMilestones.length === 0) {
      console.warn(`[claimMilestoneRewards] No valid milestones found for "${moveName}" (usage: ${usageCount})`);
      return;
    }
    
    let powerPoints = userData.powerPoints || 0;
    let xp = userData.xp || 0;
    let truthMetal = Math.floor(userData.truthMetal || 0);
    
    console.log(`[claimMilestoneRewards] Current PP: ${powerPoints}, XP: ${xp}, Truth Metal: ${truthMetal}`);
    
    // Award rewards based on milestone and trigger modal for each milestone
    const updateData: any = {};
    const claimedMilestones: number[] = [];
    
    validMilestones.forEach(milestone => {
      if (milestone === 20) {
        // First milestone: 500 PP and 1 Truth Metal Shard
        powerPoints += 500;
        truthMetal += 1;
        claimedMilestones.push(20);
        
        // Dispatch custom event to trigger milestone modal
        window.dispatchEvent(new CustomEvent('milestoneReached', {
          detail: {
            milestone: 20,
            moveName: moveName,
            rewards: {
              pp: 500,
              tmShards: 1
            }
          }
        }));
      } else if (milestone === 50) {
        powerPoints += 100; // 100 PP for 50 uses
        xp += 50; // 50 XP for 50 uses
        claimedMilestones.push(50);
        
        // Dispatch custom event to trigger milestone modal
        window.dispatchEvent(new CustomEvent('milestoneReached', {
          detail: {
            milestone: 50,
            moveName: moveName,
            rewards: {
              pp: 100,
              xp: 50
            }
          }
        }));
      } else if (milestone === 100) {
        powerPoints += 200; // 200 PP for 100 uses
        xp += 100; // 100 XP for 100 uses
        claimedMilestones.push(100);
        
        // Dispatch custom event to trigger milestone modal
        window.dispatchEvent(new CustomEvent('milestoneReached', {
          detail: {
            milestone: 100,
            moveName: moveName,
            rewards: {
              pp: 200,
              xp: 100
            }
          }
        }));
      }
    });
    
    updateData.powerPoints = powerPoints;
    updateData.xp = xp;
    if (truthMetal > Math.floor(userData.truthMetal || 0)) {
      updateData.truthMetal = truthMetal;
    }
    
    // Remove claimed milestones from unclaimed list
    if (playerManifest.unclaimedMilestones && playerManifest.unclaimedMilestones[moveName]) {
      playerManifest.unclaimedMilestones[moveName] = playerManifest.unclaimedMilestones[moveName].filter(
        m => !claimedMilestones.includes(m)
      );
      
      // Clean up empty arrays
      if (playerManifest.unclaimedMilestones[moveName].length === 0) {
        delete playerManifest.unclaimedMilestones[moveName];
      }
      
      // If unclaimedMilestones is now empty, set it to empty object
      if (Object.keys(playerManifest.unclaimedMilestones).length === 0) {
        playerManifest.unclaimedMilestones = {};
      }
    }
    
    console.log(`[claimMilestoneRewards] New PP: ${powerPoints}, XP: ${xp}, Truth Metal: ${truthMetal}`);
    
    // Update both user stats and manifest
    await updateDoc(userRef, {
      ...updateData,
      manifest: playerManifest
    });
    
    // Note: Milestone rewards don't directly change manifest.currentLevel, so we don't recalculate here.
    // If manifest.currentLevel is updated elsewhere, it should trigger recalculation there.
    
    console.log(`[claimMilestoneRewards] Claimed milestone rewards for ${moveName}:`, claimedMilestones);
  } catch (error) {
    console.error('[claimMilestoneRewards] Error claiming milestone rewards:', error);
  }
};

/**
 * Get the usage count for a specific move
 * @param playerManifest - The player's manifest data
 * @param moveName - The move name
 * @returns number - The usage count
 */
export const getMoveUsageCount = (playerManifest: PlayerManifest, moveName: string): number => {
  return playerManifest.moveUsage?.[moveName] || 0;
};
