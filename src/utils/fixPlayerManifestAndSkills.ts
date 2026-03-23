/**
 * Utility to fix a player's manifest and skill levels
 * Used for correcting inaccurate player data
 */

import { db } from '../firebase';
import { doc, getDoc, updateDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import { PlayerManifest, MANIFESTS } from '../types/manifest';
import { updateManifestAscensionLevel, unlockManifestLevel } from './manifestAscensionService';
import { updateSkillLevel, updateSkillMastery } from './skillService';
import { recalculatePowerLevel } from '../services/recalculatePowerLevel';
import { Move } from '../types/battle';

export interface FixPlayerManifestOptions {
  manifestId: string; // e.g., 'reading', 'writing', 'gaming', etc.
  manifestLevel: number; // 1-4 (ascension level)
  unlockedLevels?: number[]; // Array of unlocked levels (defaults to [1, 2, 3, 4] if manifestLevel is 4)
  skillLevels?: { [skillId: string]: { level: number; mastery: number } }; // Optional: specific skill levels to set
}

/**
 * Find a player by display name (case-insensitive partial match)
 */
export async function findPlayerByName(displayName: string): Promise<string | null> {
  try {
    // Get all students and search case-insensitively
    const studentsRef = collection(db, 'students');
    const allStudentsSnapshot = await getDocs(studentsRef);
    const searchTerm = displayName.toLowerCase();
    
    const matches = allStudentsSnapshot.docs.filter(doc => {
      const data = doc.data();
      const name = (data.displayName || '').toLowerCase();
      return name === searchTerm || name.includes(searchTerm) || searchTerm.includes(name);
    });
    
    if (matches.length > 0) {
      // If multiple matches, prefer exact match
      const exactMatch = matches.find(doc => {
        const data = doc.data();
        return (data.displayName || '').toLowerCase() === searchTerm;
      });
      return exactMatch ? exactMatch.id : matches[0].id;
    }
    
    return null;
  } catch (error) {
    console.error('Error finding player:', error);
    return null;
  }
}

/**
 * Fix a player's manifest and skill levels
 */
export async function fixPlayerManifestAndSkills(
  userId: string,
  options: FixPlayerManifestOptions
): Promise<{ success: boolean; message: string }> {
  try {
    const studentRef = doc(db, 'students', userId);
    const studentDoc = await getDoc(studentRef);
    
    if (!studentDoc.exists()) {
      return { success: false, message: `Student document not found for user ID: ${userId}` };
    }
    
    const studentData = studentDoc.data();
    const manifest = MANIFESTS.find(m => m.id === options.manifestId);
    
    if (!manifest) {
      return { success: false, message: `Invalid manifest ID: ${options.manifestId}` };
    }
    
    // Validate manifest level
    if (options.manifestLevel < 1 || options.manifestLevel > 4) {
      return { success: false, message: `Invalid manifest level: ${options.manifestLevel}. Must be 1-4.` };
    }
    
    // Determine unlocked levels
    const unlockedLevels = options.unlockedLevels || 
      (options.manifestLevel === 4 ? [1, 2, 3, 4] : 
       options.manifestLevel === 3 ? [1, 2, 3] :
       options.manifestLevel === 2 ? [1, 2] : [1]);
    
    // Create or update PlayerManifest
    const currentManifest = studentData.manifest as PlayerManifest | undefined;
    const updatedManifest: PlayerManifest = {
      manifestId: options.manifestId,
      currentLevel: options.manifestLevel,
      xp: currentManifest?.xp || 0,
      catalyst: manifest.catalyst,
      veil: currentManifest?.veil || 'Fear of inadequacy',
      signatureMove: manifest.signatureMove,
      unlockedLevels: unlockedLevels,
      lastAscension: serverTimestamp(),
      abilityUsage: currentManifest?.abilityUsage || {},
      moveUsage: currentManifest?.moveUsage || {},
      unclaimedMilestones: currentManifest?.unclaimedMilestones || {}
    };
    
    // Update manifest in students collection
    await updateDoc(studentRef, {
      manifest: updatedManifest
    });
    
    // Also update users collection if it exists
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      await updateDoc(userRef, {
        manifest: updatedManifest
      });
    }
    
    // Update skill levels if provided
    if (options.skillLevels) {
      for (const [skillId, { level, mastery }] of Object.entries(options.skillLevels)) {
        try {
          await updateSkillLevel(userId, skillId, level);
          await updateSkillMastery(userId, skillId, mastery);
        } catch (error) {
          console.error(`Error updating skill ${skillId}:`, error);
        }
      }
    }
    
    // Recalculate power level
    await recalculatePowerLevel(userId);
    
    return { 
      success: true, 
      message: `Successfully updated ${studentData.displayName || userId}: Manifest set to ${manifest.name} Level ${options.manifestLevel}` 
    };
  } catch (error) {
    console.error('Error fixing player manifest and skills:', error);
    return { 
      success: false, 
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

/**
 * Update move levels in battleMoves collection (source of truth for Battle UI).
 * Prevents skill level resets when only the legacy moves collection was updated.
 */
export async function updateBattleMoveLevels(
  userId: string,
  skillLevels: { [skillId: string]: { level: number; mastery: number } }
): Promise<void> {
  const battleMovesRef = doc(db, 'battleMoves', userId);
  const battleMovesDoc = await getDoc(battleMovesRef);
  if (!battleMovesDoc.exists()) return;
  const moves: Move[] = battleMovesDoc.data().moves || [];
  if (!moves.length) return;
  let updated = false;
  const updatedMoves = moves.map((m) => {
    const spec = skillLevels[m.id ?? ''];
    if (!spec) return m;
    if (m.level === spec.level && m.masteryLevel === spec.mastery) return m;
    updated = true;
    return { ...m, level: spec.level, masteryLevel: spec.mastery };
  });
  if (updated) await updateDoc(battleMovesRef, { moves: updatedMoves });
}

/**
 * Restore a player's manifest skill levels in battleMoves by display name.
 * Use when a player's manifest skills were incorrectly reset to level 1.
 */
export async function restorePlayerManifestSkillLevels(
  displayName: string,
  manifestMoveLevels: { moveName: string; level: number; masteryLevel?: number }[]
): Promise<{ success: boolean; message: string }> {
  const userId = await findPlayerByName(displayName);
  if (!userId) {
    return { success: false, message: `Could not find player "${displayName}".` };
  }
  const battleMovesRef = doc(db, 'battleMoves', userId);
  const battleMovesDoc = await getDoc(battleMovesRef);
  if (!battleMovesDoc.exists()) {
    return { success: false, message: `No battleMoves document for ${displayName}.` };
  }
  const moves: Move[] = battleMovesDoc.data().moves || [];
  const nameToSpec = new Map(manifestMoveLevels.map((s) => [s.moveName.toLowerCase().trim(), s]));
  let changed = false;
  const updatedMoves = moves.map((m) => {
    const spec = nameToSpec.get((m.name ?? '').toLowerCase().trim());
    if (!spec || (m.level === spec.level && (m.masteryLevel ?? 1) === (spec.masteryLevel ?? 1))) return m;
    changed = true;
    return {
      ...m,
      level: spec.level,
      masteryLevel: spec.masteryLevel ?? 1
    };
  });
  if (!changed) {
    return { success: true, message: `${displayName}: manifest move levels already correct.` };
  }
  await updateDoc(battleMovesRef, { moves: updatedMoves });
  await recalculatePowerLevel(userId);
  return {
    success: true,
    message: `Restored manifest skill levels for ${displayName}: ${manifestMoveLevels.map((s) => `${s.moveName} → level ${s.level}`).join(', ')}.`
  };
}

/**
 * Restore Eddie Vasquez's Gaming manifest skills (Pattern Break, Strategy Matrix) to level 2.
 * Run once after a mistaken reset; safe to call multiple times.
 */
export async function restoreEddieVasquezManifestSkills(): Promise<{ success: boolean; message: string }> {
  return restorePlayerManifestSkillLevels('Eddie Vasquez', [
    { moveName: 'Pattern Break', level: 2, masteryLevel: 1 },
    { moveName: 'Strategy Matrix', level: 2, masteryLevel: 1 }
  ]);
}

/**
 * Fix Blackbeard's manifest and skills (convenience function)
 * Assumes Blackbeard should have a high-level manifest
 */
export async function fixBlackbeardManifestAndSkills(
  manifestId: string = 'gaming', // Default to gaming manifest
  manifestLevel: number = 4, // Default to max level
  skillLevels?: { [skillId: string]: { level: number; mastery: number } }
): Promise<{ success: boolean; message: string }> {
  // Try to find Blackbeard by name
  const userId = await findPlayerByName('Blackbeard');
  
  if (!userId) {
    return { success: false, message: 'Could not find player named "Blackbeard". Please provide the user ID directly.' };
  }
  
  return fixPlayerManifestAndSkills(userId, {
    manifestId,
    manifestLevel,
    unlockedLevels: manifestLevel === 4 ? [1, 2, 3, 4] : undefined,
    skillLevels
  });
}

