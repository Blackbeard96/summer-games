import { db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

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
  challengeType: 'defeat_enemies' | 'use_elemental_move' | 'attack_vault' | 'use_action_card' | 'win_battle' | 'earn_pp' | 'use_manifest_ability' | 'custom',
  amount: number = 1
) => {
  try {
    const playerChallengesRef = doc(db, 'students', userId, 'dailyChallenges', 'current');
    const playerChallengesDoc = await getDoc(playerChallengesRef);

    if (!playerChallengesDoc.exists()) {
      return; // No challenges assigned yet
    }

    const data = playerChallengesDoc.data();
    const today = getTodayDateString();

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
    const today = getTodayDateString();

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
  challengeType: 'defeat_enemies' | 'use_elemental_move' | 'attack_vault' | 'use_action_card' | 'win_battle' | 'earn_pp' | 'use_manifest_ability' | 'custom',
  amount: number = 1
) => {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Daily Challenge] updateChallengeProgressByType called:', { userId, challengeType, amount });
    }
    // First, get player's current challenges
    const playerChallengesRef = doc(db, 'students', userId, 'dailyChallenges', 'current');
    const playerChallengesDoc = await getDoc(playerChallengesRef);

    if (!playerChallengesDoc.exists()) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Daily Challenge] No challenges document found for user:', userId);
      }
      return;
    }

    const data = playerChallengesDoc.data();
    const today = getTodayDateString();

    if (data.assignedDate !== today) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Daily Challenge] Challenges are not for today. Assigned date:', data.assignedDate, 'Today:', today);
      }
      return;
    }

    const challenges: PlayerChallengeProgress[] = data.challenges || [];
    
    if (challenges.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Daily Challenge] No challenges found in document');
      }
      return;
    }

    // Get challenge details to match by type
    const challengeDetails: { [id: string]: any } = {};
    const challengeIds = challenges.map(c => c.challengeId).filter(Boolean);
    
    if (challengeIds.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Daily Challenge] No challenge IDs found');
      }
      return;
    }
    
    // Fetch all challenge details
    try {
      const challengeDocs = await Promise.all(
        challengeIds.map(id => getDoc(doc(db, 'adminSettings', 'dailyChallenges', 'challenges', id)))
      );

      challengeDocs.forEach((docSnap, index) => {
        if (docSnap.exists()) {
          challengeDetails[challengeIds[index]] = docSnap.data();
        }
      });
    } catch (error) {
      console.error('[Daily Challenge] Error fetching challenge details:', error);
      // Continue with what we have (might have type stored in progress object)
    }

    // Update matching challenges
    let hasUpdates = false;
    const updatedChallenges = challenges.map((challenge) => {
      // Check if challenge type matches (use stored type if available, otherwise fetch from details)
      const storedType = challenge.type || challengeDetails[challenge.challengeId]?.type;
      const challengeTarget = challenge.target || challengeDetails[challenge.challengeId]?.target;
      
      // Normalize types for comparison (handle case sensitivity and whitespace)
      const normalizedStoredType = storedType?.toLowerCase().trim();
      const normalizedChallengeType = challengeType.toLowerCase().trim();
      
      // Debug logging
      if (process.env.NODE_ENV === 'development') {
        console.log('[Daily Challenge] Checking challenge:', {
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
      }
      
      if (normalizedStoredType === normalizedChallengeType && !challenge.completed) {
        // If target is not set, default to a high number to allow progress tracking
        const target = challengeTarget || 999999;
        const newProgress = Math.min((challenge.progress || 0) + amount, target);
        const completed = newProgress >= target;
        
        hasUpdates = true;
        
        if (process.env.NODE_ENV === 'development') {
          console.log('[Daily Challenge] Updating challenge:', {
            challengeId: challenge.challengeId,
            oldProgress: challenge.progress,
            newProgress,
            amount,
            target,
            completed
          });
        }
        
        return {
          ...challenge,
          progress: newProgress,
          completed: completed,
          type: storedType || challengeType, // Store type for future lookups
          target: challengeTarget || target // Store target for future lookups
        };
      }
      return challenge;
    });

    if (hasUpdates) {
      await updateDoc(playerChallengesRef, {
        challenges: updatedChallenges,
        updatedAt: serverTimestamp()
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[Daily Challenge] Successfully updated challenges for type:', challengeType);
      }
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[Daily Challenge] No matching challenges found for type:', challengeType, {
          availableTypes: challenges.map(c => c.type || challengeDetails[c.challengeId]?.type),
          challengeIds: challenges.map(c => c.challengeId)
        });
      }
    }
  } catch (error) {
    console.error('Error updating challenge progress by type:', error);
  }
};

const getTodayDateString = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

