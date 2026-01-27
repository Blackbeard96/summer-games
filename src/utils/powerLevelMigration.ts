/**
 * Power Level Migration Service
 * 
 * Handles migration and backfill of Power Level for existing players
 */

import { db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { recalculatePowerLevel } from '../services/recalculatePowerLevel';

/**
 * Migrate existing player to have Power Level initialized
 * This is idempotent - safe to call multiple times
 * 
 * @param userId - User ID to migrate
 * @returns Promise<boolean> - Success status
 */
export async function migratePlayerPowerLevel(userId: string): Promise<boolean> {
  try {
    const studentRef = doc(db, 'students', userId);
    const studentDoc = await getDoc(studentRef);
    
    if (!studentDoc.exists()) {
      console.log(`[PowerLevelMigration] Student document not found for ${userId}, skipping migration`);
      return false;
    }
    
    const studentData = studentDoc.data();
    
    // Check if powerLevel already exists and is valid
    if (studentData.powerLevel !== null && studentData.powerLevel !== undefined) {
      // Power level already exists, but check if we need to recalculate
      // Only recalculate if powerBreakdown is missing (indicates old format)
      if (studentData.powerBreakdown) {
        console.log(`[PowerLevelMigration] Power level already exists for ${userId}: ${studentData.powerLevel}`);
        return true; // Already migrated
      } else {
        console.log(`[PowerLevelMigration] Power level exists but breakdown missing for ${userId}, recalculating...`);
        // Recalculate to get breakdown
        await recalculatePowerLevel(userId);
        return true;
      }
    }
    
    // Power level doesn't exist - initialize it
    console.log(`[PowerLevelMigration] Initializing power level for ${userId}...`);
    
    // Set default equippedSkills and equippedArtifacts if missing
    const updateData: any = {
      powerLevelInitialized: true,
      powerLevelInitializedAt: serverTimestamp()
    };
    
    // Initialize equippedSkills if missing
    if (!studentData.equippedSkillIds) {
      updateData.equippedSkillIds = [];
      console.log(`[PowerLevelMigration] Initialized equippedSkillIds for ${userId}`);
    }
    
    // Initialize equippedArtifacts if missing
    if (!studentData.equippedArtifacts) {
      updateData.equippedArtifacts = {};
      console.log(`[PowerLevelMigration] Initialized equippedArtifacts for ${userId}`);
    }
    
    // Initialize manifestAscensionLevel if missing (derive from manifest.currentLevel if available)
    if (!studentData.manifestAscensionLevel) {
      const manifest = studentData.manifest || {};
      if (manifest.currentLevel) {
        // Convert manifest currentLevel to ascension level (1-4)
        updateData.manifestAscensionLevel = Math.min(4, Math.max(1, manifest.currentLevel));
      } else {
        updateData.manifestAscensionLevel = 1; // Default
      }
      console.log(`[PowerLevelMigration] Initialized manifestAscensionLevel for ${userId}: ${updateData.manifestAscensionLevel}`);
    }
    
    // Apply initializations if any
    if (Object.keys(updateData).length > 0) {
      await updateDoc(studentRef, updateData);
    }
    
    // Recalculate power level (this will compute and store powerLevel + powerBreakdown)
    await recalculatePowerLevel(userId);
    
    console.log(`✅ [PowerLevelMigration] Power level initialized for ${userId}`);
    return true;
  } catch (error) {
    console.error(`❌ [PowerLevelMigration] Error migrating power level for ${userId}:`, error);
    // Don't throw - migration errors shouldn't break the app
    return false;
  }
}

/**
 * Migrate existing players to have Power Level initialized (batch migration)
 * This is a utility function that can be called manually or from admin tools
 * 
 * @param userIds - Array of user IDs to migrate (optional, if empty, migrates current user)
 * @returns Promise<{ success: number, failed: number, errors: string[] }>
 */
export async function migratePlayersPowerLevel(
  userIds?: string[]
): Promise<{ success: number; failed: number; errors: string[] }> {
  const errors: string[] = [];
  let success = 0;
  let failed = 0;
  
  try {
    if (!userIds || userIds.length === 0) {
      console.log('[PowerLevelMigration] No user IDs provided, skipping batch migration');
      return { success: 0, failed: 0, errors: [] };
    }
    
    console.log(`[PowerLevelMigration] Starting batch migration for ${userIds.length} players...`);
    
    // Process each user
    for (const userId of userIds) {
      try {
        const result = await migratePlayerPowerLevel(userId);
        if (result) {
          success++;
        } else {
          failed++;
          errors.push(`Failed to migrate ${userId}`);
        }
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${userId}: ${errorMsg}`);
        console.error(`[PowerLevelMigration] Error migrating ${userId}:`, error);
      }
    }
    
    console.log(`✅ [PowerLevelMigration] Batch migration complete: ${success} success, ${failed} failed`);
    return { success, failed, errors };
  } catch (error) {
    console.error('[PowerLevelMigration] Batch migration error:', error);
    return { success, failed, errors };
  }
}

/**
 * Ensure player has Power Level initialized
 * This is a convenience wrapper that can be called on login/app start
 * 
 * @param userId - User ID to ensure has power level
 * @returns Promise<void>
 */
export async function ensurePlayerPowerLevel(userId: string): Promise<void> {
  try {
    await migratePlayerPowerLevel(userId);
  } catch (error) {
    // Silently fail - this is a best-effort migration
    console.error(`[PowerLevelMigration] Error ensuring power level for ${userId}:`, error);
  }
}


