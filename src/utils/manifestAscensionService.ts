/**
 * Manifest Ascension Service
 * 
 * Handles manifest level ascension and updates power level accordingly.
 */

import { db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { PlayerManifest } from '../types/manifest';
import { recalculatePowerLevel } from '../services/recalculatePowerLevel';

/**
 * Update manifest currentLevel (ascension level)
 * This triggers power level recalculation
 */
export async function updateManifestAscensionLevel(
  userId: string,
  newLevel: number
): Promise<void> {
  try {
    const studentRef = doc(db, 'students', userId);
    const studentDoc = await getDoc(studentRef);
    
    if (!studentDoc.exists()) {
      throw new Error('Student document not found');
    }
    
    const studentData = studentDoc.data();
    const currentManifest = studentData.manifest as PlayerManifest;
    
    if (!currentManifest) {
      throw new Error('Player manifest not found');
    }
    
    // Update manifest currentLevel
    const updatedManifest: PlayerManifest = {
      ...currentManifest,
      currentLevel: Math.min(4, Math.max(1, newLevel)), // Clamp to 1-4
      lastAscension: serverTimestamp()
    };
    
    // Update unlockedLevels if needed
    if (!updatedManifest.unlockedLevels.includes(updatedManifest.currentLevel)) {
      updatedManifest.unlockedLevels = [...updatedManifest.unlockedLevels, updatedManifest.currentLevel].sort();
    }
    
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
    
    // Recalculate power level after ascension
    await recalculatePowerLevel(userId);
    
    console.log(`✅ Manifest ascension level updated for ${userId}: ${currentManifest.currentLevel} → ${updatedManifest.currentLevel}`);
  } catch (error) {
    console.error('Error updating manifest ascension level:', error);
    throw error;
  }
}

/**
 * Unlock a manifest level (adds to unlockedLevels)
 * This may also update currentLevel if needed
 */
export async function unlockManifestLevel(
  userId: string,
  level: number
): Promise<void> {
  try {
    const studentRef = doc(db, 'students', userId);
    const studentDoc = await getDoc(studentRef);
    
    if (!studentDoc.exists()) {
      throw new Error('Student document not found');
    }
    
    const studentData = studentDoc.data();
    const currentManifest = studentData.manifest as PlayerManifest;
    
    if (!currentManifest) {
      throw new Error('Player manifest not found');
    }
    
    // Check if already unlocked
    if (currentManifest.unlockedLevels.includes(level)) {
      return; // Already unlocked
    }
    
    // Update unlockedLevels
    const updatedUnlockedLevels = [...currentManifest.unlockedLevels, level].sort();
    
    // Update currentLevel to the highest unlocked level if it's higher
    const newCurrentLevel = Math.max(currentManifest.currentLevel, level);
    
    const updatedManifest: PlayerManifest = {
      ...currentManifest,
      unlockedLevels: updatedUnlockedLevels,
      currentLevel: newCurrentLevel,
      lastAscension: serverTimestamp()
    };
    
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
    
    // Recalculate power level after level unlock
    await recalculatePowerLevel(userId);
    
    console.log(`✅ Manifest level ${level} unlocked for ${userId}, currentLevel: ${currentManifest.currentLevel} → ${newCurrentLevel}`);
  } catch (error) {
    console.error('Error unlocking manifest level:', error);
    throw error;
  }
}


