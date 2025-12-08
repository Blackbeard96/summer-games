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
  challengeType: 'defeat_enemies' | 'use_elemental_move' | 'attack_vault' | 'use_action_card' | 'win_battle' | 'earn_pp' | 'custom',
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
 */
export const updateChallengeProgressByType = async (
  userId: string,
  challengeType: 'defeat_enemies' | 'use_elemental_move' | 'attack_vault' | 'use_action_card' | 'win_battle' | 'earn_pp' | 'custom',
  amount: number = 1
) => {
  try {
    // First, get player's current challenges
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

    // Get challenge details to match by type
    const { collection, getDocs, query, where } = await import('firebase/firestore');
    const challengesRef = collection(db, 'adminSettings', 'dailyChallenges', 'challenges');
    
    // Fetch all challenge details
    const challengeDetails: { [id: string]: any } = {};
    const challengeIds = challenges.map(c => c.challengeId);
    
    // We'll need to fetch each challenge to get its type
    // For efficiency, we could cache this or store type in the progress object
    const challengeDocs = await Promise.all(
      challengeIds.map(id => getDoc(doc(db, 'adminSettings', 'dailyChallenges', 'challenges', id)))
    );

    challengeDocs.forEach((docSnap, index) => {
      if (docSnap.exists()) {
        challengeDetails[challengeIds[index]] = docSnap.data();
      }
    });

    // Update matching challenges
    let hasUpdates = false;
    const updatedChallenges = challenges.map((challenge) => {
      // Check if challenge type matches (use stored type if available, otherwise fetch from details)
      const storedType = challenge.type || challengeDetails[challenge.challengeId]?.type;
      const challengeTarget = challenge.target || challengeDetails[challenge.challengeId]?.target;
      
      if (storedType === challengeType && !challenge.completed && challengeTarget) {
        const newProgress = Math.min(challenge.progress + amount, challengeTarget);
        const completed = newProgress >= challengeTarget;
        
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
    console.error('Error updating challenge progress by type:', error);
  }
};

const getTodayDateString = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

