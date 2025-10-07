import { db } from '../firebase';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { PlayerManifest } from '../types/manifest';

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
    const playerManifest = userData.playerManifest as PlayerManifest;
    
    if (!playerManifest || playerManifest.manifestId !== manifestId) {
      console.error('Player manifest not found or manifest ID mismatch');
      return false;
    }
    
    // Initialize abilityUsage if it doesn't exist
    if (!playerManifest.abilityUsage) {
      playerManifest.abilityUsage = {};
    }
    
    // Increment the usage count for this level
    const currentUsage = playerManifest.abilityUsage[level] || 0;
    playerManifest.abilityUsage[level] = currentUsage + 1;
    
    // Update the document
    await updateDoc(userRef, {
      playerManifest: playerManifest
    });
    
    console.log(`Tracked ability usage: Level ${level} of ${manifestId} used ${playerManifest.abilityUsage[level]} times`);
    return true;
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
  return playerManifest;
};
