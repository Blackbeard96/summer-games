import { db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp, runTransaction, increment } from 'firebase/firestore';
import { getTodayDateStringEastern } from './dailyChallengeDateUtils';

// Debug flag - set REACT_APP_DEBUG_DAILY=true to enable verbose logging
const DEBUG_DAILY = process.env.REACT_APP_DEBUG_DAILY === 'true';

interface PlayerChallengeProgress {
  challengeId: string;
  progress: number;
  completed: boolean;
  claimed: boolean;
  assignedDate: string;
  type?: string;
  target?: number;
}

/**
 * Update daily challenge progress for a player
 */
export const updateDailyChallengeProgress = async (
  userId: string,
  challengeType: 'defeat_enemies' | 'use_elemental_move' | 'attack_vault' | 'use_action_card' | 'win_battle' | 'earn_pp' | 'use_manifest_ability' | 'use_health_potion' | 'custom',
  amount: number = 1
) => {
  try {
    const playerChallengesRef = doc(db, 'students', userId, 'dailyChallenges', 'current');
    const playerChallengesDoc = await getDoc(playerChallengesRef);

    if (!playerChallengesDoc.exists()) {
      return; // No challenges assigned yet
    }

    const data = playerChallengesDoc.data();
    const today = getTodayDateStringEastern();

    // Check if challenges are for today
    if (data.assignedDate !== today) {
      return; // Challenges are from a different day
    }

    const challenges: PlayerChallengeProgress[] = data.challenges || [];
    let updated = false;

    // Update progress for matching challenge types
    const updatedChallenges = challenges.map((challenge: PlayerChallengeProgress) => {
      // Get challenge details to check type
      // We'll need to fetch the challenge details or store type in progress
      // For now, we'll update all challenges and let the component filter
      return challenge;
    });

    // We need to fetch challenge details to match by type
    // This is a simplified version - in production, you might want to cache challenge types
    if (updatedChallenges.length > 0) {
      // Update the challenge progress
      // Note: This is a simplified version. In a full implementation,
      // you'd fetch challenge details and match by type
      await updateDoc(playerChallengesRef, {
        challenges: updatedChallenges,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Error updating daily challenge progress:', error);
  }
};

/**
 * Update challenge progress by challenge ID and type
 */
export const updateChallengeProgressById = async (
  userId: string,
  challengeId: string,
  progressIncrement: number = 1
) => {
  try {
    const playerChallengesRef = doc(db, 'students', userId, 'dailyChallenges', 'current');
    const playerChallengesDoc = await getDoc(playerChallengesRef);

    if (!playerChallengesDoc.exists()) {
      return;
    }

    const data = playerChallengesDoc.data();
    const today = getTodayDateStringEastern();

    if (data.assignedDate !== today) {
      return;
    }

    const challenges: PlayerChallengeProgress[] = data.challenges || [];
    let hasUpdates = false;

    const updatedChallenges = challenges.map((challenge) => {
      if (challenge.challengeId === challengeId && !challenge.completed) {
        const newProgress = challenge.progress + progressIncrement;
        const completed = newProgress >= (challenge as any).target; // We'll need to store target in progress
        
        hasUpdates = true;
        return {
          ...challenge,
          progress: newProgress,
          completed: completed
        };
      }
      return challenge;
    });

    if (hasUpdates) {
      await updateDoc(playerChallengesRef, {
        challenges: updatedChallenges,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Error updating challenge progress by ID:', error);
  }
};

/**
 * Update challenge progress by type (more efficient for real-time updates)
 * This function updates daily challenge progress when a player performs an action
 * that matches a challenge type (e.g., defeats an enemy, uses a manifest ability)
 */
export const updateChallengeProgressByType = async (
  userId: string,
  challengeType: 'defeat_enemies' | 'use_elemental_move' | 'attack_vault' | 'use_action_card' | 'win_battle' | 'earn_pp' | 'use_manifest_ability' | 'use_health_potion' | 'custom',
  amount: number = 1
) => {
  // Layer A: Event trigger logging
  if (DEBUG_DAILY) {
    console.log('[Daily Challenge] 🎯 EVENT TRIGGER:', {
      userId,
      challengeType,
      amount,
      timestamp: new Date().toISOString()
    });
  }

  try {
    // First, get player's current challenges
    const playerChallengesRef = doc(db, 'students', userId, 'dailyChallenges', 'current');
    const playerChallengesDoc = await getDoc(playerChallengesRef);

    if (!playerChallengesDoc.exists()) {
      console.warn('[Daily Challenge] ⚠️ No challenges document found for user:', userId);
      return;
    }

    const data = playerChallengesDoc.data();
    const today = getTodayDateStringEastern();

    // Layer B: Daily-progress update function logging
    if (DEBUG_DAILY) {
      console.log('[Daily Challenge] 📅 Date check:', {
        assignedDate: data.assignedDate,
        today,
        matches: data.assignedDate === today,
        docPath: `students/${userId}/dailyChallenges/current`
      });
    }

    if (data.assignedDate !== today) {
      if (DEBUG_DAILY) {
        console.warn('[Daily Challenge] ⚠️ Challenges are not for today. Assigned date:', data.assignedDate, 'Today:', today);
      }
      return;
    }

    const challenges: PlayerChallengeProgress[] = data.challenges || [];
    
    if (challenges.length === 0) {
      console.warn('[Daily Challenge] ⚠️ No challenges found in document');
      return;
    }

    // Get challenge details to match by type (fetch outside transaction for efficiency)
    // CRITICAL: Always fetch challenge details to ensure we have type/target even if not stored in progress
    const challengeDetails: { [id: string]: any } = {};
    const challengeIds = challenges.map(c => c.challengeId).filter(Boolean);
    
    if (challengeIds.length === 0) {
      console.warn('[Daily Challenge] ⚠️ No challenge IDs found');
      return;
    }
    
    // Fetch all challenge details - CRITICAL: We need these to match by type
    // Always fetch to ensure we have type/target even if not stored in progress object
    try {
      const challengeDocs = await Promise.all(
        challengeIds.map(id => getDoc(doc(db, 'adminSettings', 'dailyChallenges', 'challenges', id)))
      );

      challengeDocs.forEach((docSnap, index) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          challengeDetails[challengeIds[index]] = data;
          console.log('[Daily Challenge] 📋 Fetched challenge details:', {
            challengeId: challengeIds[index],
            type: data.type,
            target: data.target
          });
        } else {
          console.warn('[Daily Challenge] ⚠️ Challenge document not found:', challengeIds[index]);
        }
      });
      
      // Log summary of fetched details
      console.log('[Daily Challenge] 📚 Challenge details summary:', {
        totalChallenges: challengeIds.length,
        fetchedDetails: Object.keys(challengeDetails).length,
        details: Object.entries(challengeDetails).map(([id, data]) => ({
          id,
          type: data.type,
          target: data.target
        }))
      });
      
      // Check if any challenges are missing type/target and repair them if needed
      const needsRepair = challenges.some(c => !c.type || !c.target);
      if (needsRepair) {
        console.log('[Daily Challenge] 🔧 Some challenges missing type/target, attempting repair...');
        // Try to repair in the background (don't await to avoid blocking)
        repairChallengeProgress(userId).catch(err => 
          console.error('[Daily Challenge] ❌ Error during repair:', err)
        );
      }
    } catch (error) {
      console.error('[Daily Challenge] ❌ Error fetching challenge details:', error);
      // If we can't fetch details, we can't match by type - abort
      console.error('[Daily Challenge] ❌ Cannot proceed without challenge details');
      return;
    }

    // Use transaction to prevent race conditions
    await runTransaction(db, async (transaction) => {
      // Re-read within transaction to get latest state
      const currentDoc = await transaction.get(playerChallengesRef);
      if (!currentDoc.exists()) {
        console.warn('[Daily Challenge] ⚠️ Document deleted during transaction');
        return;
      }

      const currentData = currentDoc.data();
      if (currentData.assignedDate !== today) {
        console.warn('[Daily Challenge] ⚠️ Date changed during transaction');
        return;
      }

      const currentChallenges: PlayerChallengeProgress[] = currentData.challenges || [];
      
      // Update matching challenges
      let hasUpdates = false;
      const updatedChallenges = currentChallenges.map((challenge) => {
        // Check if challenge type matches (use stored type if available, otherwise fetch from details)
        // IMPORTANT: Always prefer stored type, but fall back to challenge details if missing
        // CRITICAL: challengeDetails should always be populated from the fetch above
        const storedType = challenge.type || challengeDetails[challenge.challengeId]?.type;
        const challengeTarget = challenge.target || challengeDetails[challenge.challengeId]?.target;
        
        // If we still don't have a type, this is a problem - log it
        if (!storedType) {
          console.error('[Daily Challenge] ❌ CRITICAL: Challenge missing type!', {
            challengeId: challenge.challengeId,
            hasStoredType: !!challenge.type,
            hasDetailsType: !!challengeDetails[challenge.challengeId]?.type,
            challengeDetailsExists: !!challengeDetails[challenge.challengeId],
            allChallengeIds: Object.keys(challengeDetails),
            challengeDetailsKeys: Object.keys(challengeDetails),
            challengeDetailsForThisId: challengeDetails[challenge.challengeId]
          });
          // Return unchanged - we can't match without a type
          return challenge;
        }
        
        // Log if we're using details type instead of stored type (indicates repair needed)
        if (!challenge.type && challengeDetails[challenge.challengeId]?.type) {
          console.log('[Daily Challenge] ⚠️ Using challenge details type (stored type missing):', {
            challengeId: challenge.challengeId,
            typeFromDetails: challengeDetails[challenge.challengeId]?.type
          });
        }
        
        // Normalize types for comparison (handle case sensitivity and whitespace)
        const normalizedStoredType = storedType.toLowerCase().trim();
        const normalizedChallengeType = challengeType.toLowerCase().trim();
        
        console.log('[Daily Challenge] 🔍 Checking challenge:', {
          challengeId: challenge.challengeId,
          storedType,
          normalizedStoredType,
          challengeType,
          normalizedChallengeType,
          matches: normalizedStoredType === normalizedChallengeType,
          completed: challenge.completed,
          currentProgress: challenge.progress,
          target: challengeTarget
        });
        
        if (normalizedStoredType === normalizedChallengeType && !challenge.completed) {
          // Use stored target or fetch from details, but ensure we have a valid target
          const target = challengeTarget || challengeDetails[challenge.challengeId]?.target || 999999;
          const oldProgress = challenge.progress || 0;
          const newProgress = oldProgress + amount;
          // Only mark as completed if we've reached or exceeded the target
          const completed = newProgress >= target;
          
          hasUpdates = true;
          
          console.log('[Daily Challenge] ✅ UPDATING challenge:', {
            challengeId: challenge.challengeId,
            oldProgress,
            newProgress,
            amount,
            target,
            completed
          });
          
          // Always store type and target for future lookups (even if they were already stored)
          return {
            ...challenge,
            progress: newProgress,
            completed: completed,
            type: storedType, // Always store the type we found
            target: target // Always store the target we found
          };
        }
        return challenge;
      });

      if (hasUpdates) {
        // Layer C: Firestore write result logging
        transaction.update(playerChallengesRef, {
          challenges: updatedChallenges,
          updatedAt: serverTimestamp()
        });
        
        console.log('[Daily Challenge] 💾 Firestore write queued:', {
          docPath: `students/${userId}/dailyChallenges/current`,
          updatedChallenges: updatedChallenges.map(c => ({
            challengeId: c.challengeId,
            progress: c.progress,
            completed: c.completed
          }))
        });
      } else {
        console.warn('[Daily Challenge] ⚠️ No matching challenges found for type:', challengeType, {
          availableTypes: currentChallenges.map(c => c.type || challengeDetails[c.challengeId]?.type),
          challengeIds: currentChallenges.map(c => c.challengeId)
        });
      }
    });
    
    console.log('[Daily Challenge] ✅ Transaction completed successfully for type:', challengeType);
  } catch (error) {
    console.error('[Daily Challenge] ❌ Error updating challenge progress by type:', error);
    // Don't re-throw - allow the game to continue even if challenge tracking fails
  }
};

/**
 * Repair challenge progress objects that are missing type or target
 * This ensures old challenges assigned before type/target were stored can still be tracked
 */
export const repairChallengeProgress = async (userId: string) => {
  try {
    const playerChallengesRef = doc(db, 'students', userId, 'dailyChallenges', 'current');
    const playerChallengesDoc = await getDoc(playerChallengesRef);

    if (!playerChallengesDoc.exists()) {
      return;
    }

    const data = playerChallengesDoc.data();
    const challenges: PlayerChallengeProgress[] = data.challenges || [];
    
    // Find challenges missing type or target
    const challengesNeedingRepair = challenges.filter(c => !c.type || !c.target);
    
    if (challengesNeedingRepair.length === 0) {
      return; // All challenges have type and target
    }

    // Fetch challenge details for challenges that need repair
    const challengeDetails: { [id: string]: any } = {};
    const challengeIds = challengesNeedingRepair.map(c => c.challengeId).filter(Boolean);
    
    if (challengeIds.length > 0) {
      const challengeDocs = await Promise.all(
        challengeIds.map(id => getDoc(doc(db, 'adminSettings', 'dailyChallenges', 'challenges', id)))
      );

      challengeDocs.forEach((docSnap, index) => {
        if (docSnap.exists()) {
          challengeDetails[challengeIds[index]] = docSnap.data();
        }
      });
    }

    // Update challenges with missing type/target
    const repairedChallenges = challenges.map((challenge) => {
      if (!challenge.type || !challenge.target) {
        const details = challengeDetails[challenge.challengeId];
        if (details) {
          return {
            ...challenge,
            type: challenge.type || details.type,
            target: challenge.target || details.target
          };
        }
      }
      return challenge;
    });

    // Only update if we actually repaired something
    const wasRepaired = repairedChallenges.some((c, i) => 
      c.type !== challenges[i].type || c.target !== challenges[i].target
    );

    if (wasRepaired) {
      await updateDoc(playerChallengesRef, {
        challenges: repairedChallenges,
        updatedAt: serverTimestamp()
      });
      console.log('[Daily Challenge] 🔧 Repaired challenges with missing type/target');
    }
  } catch (error) {
    console.error('[Daily Challenge] ❌ Error repairing challenge progress:', error);
  }
};

// Deprecated: Use getTodayDateStringEastern from dailyChallengeDateUtils instead
// Keeping for backward compatibility during migration
const getTodayDateString = () => {
  console.warn('[Daily Challenge] ⚠️ Using deprecated getTodayDateString() - should use getTodayDateStringEastern()');
  return getTodayDateStringEastern();
};

