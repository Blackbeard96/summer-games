/**
 * Unified RR Candy unlock status utility
 * 
 * SOURCE OF TRUTH FOR RR CANDY UNLOCK:
 * =====================================
 * RR Candy unlock is determined by checking:
 * - Firestore path: users/{uid}/chapters/2/challenges/ep2-its-all-a-game/
 * - Field: isCompleted === true OR status === 'approved'
 * - Field: candyChoice exists (values: 'on-off', 'up-down', or 'config')
 * 
 * This is the SINGLE SOURCE OF TRUTH used by:
 * - Profile page (Skill Tree Settings)
 * - Skill Mastery page (MovesDisplay)
 * - BattleContext (for syncing RR Candy moves)
 * 
 * RR Candy skills are stored in:
 * - Firestore path: battleMoves/{uid}/moves[]
 * - Filter: moves with id starting with 'rr-candy-'
 * - When RR Candy is unlocked, these moves should have unlocked: true
 * 
 * UPGRADE PATH:
 * - RR Candy skills use the same upgradeMove() function as other skills
 * - Upgrade cost: 1000 PP base (10x regular skills)
 * - Upgrades persist to battleMoves/{uid}/moves[] array
 * - Level and masteryLevel are updated atomically with PP deduction
 */

export interface RRCandyStatus {
  unlocked: boolean;
  candyType: 'on-off' | 'up-down' | 'config' | null;
  challengeData?: any;
}

/**
 * Get RR Candy unlock status from user data
 * This is the single source of truth for RR Candy unlock detection
 */
export function getRRCandyStatus(userData: any): RRCandyStatus {
  if (!userData) {
    console.warn('getRRCandyStatus: No userData provided');
    return { unlocked: false, candyType: null };
  }

  // Check Chapter 2-4 completion (ep2-its-all-a-game challenge)
  // Try multiple possible paths to handle different data structures
  const chapters = userData.chapters || {};
  const chapter2 = chapters[2] || chapters['2'] || {};
  const challenges = chapter2.challenges || {};
  
  // Try the standard challenge ID first
  let challenge = challenges['ep2-its-all-a-game'] || {};
  
  // If not found, try alternative challenge IDs that might exist
  if (!challenge || Object.keys(challenge).length === 0) {
    // Try finding any challenge that might be Chapter 2-4
    const challengeKeys = Object.keys(challenges);
    console.log('getRRCandyStatus: Available challenge keys:', challengeKeys);
    
    // Look for challenge with "its-all-a-game" or similar
    const matchingKey = challengeKeys.find(key => 
      key.toLowerCase().includes('its-all-a-game') || 
      key.toLowerCase().includes('all-a-game') ||
      key.toLowerCase().includes('2-4')
    );
    
    if (matchingKey) {
      challenge = challenges[matchingKey];
      console.log('getRRCandyStatus: Found alternative challenge key:', matchingKey);
    }
  }

  // Check if challenge is completed (matches Profile page logic exactly)
  // Also check if chapter itself is marked as completed (fallback)
  const challengeCompleted = challenge?.isCompleted === true || challenge?.status === 'approved';
  const chapterCompleted = chapter2?.isCompleted === true;
  const isCompleted = challengeCompleted || chapterCompleted;
  
  // Get candyType - default to 'on-off' if challenge is completed but candyChoice is missing
  // This matches Profile page behavior: const candyType = challenge?.candyChoice || 'on-off';
  let candyType = challenge?.candyChoice;
  if (isCompleted && !candyType) {
    // If challenge is completed but no candyChoice was saved, default to 'on-off'
    // This handles cases where the completion happened before candyChoice was properly saved
    console.warn('getRRCandyStatus: Challenge completed but candyChoice missing, defaulting to "on-off"');
    candyType = 'on-off';
  }

  console.log('getRRCandyStatus: Challenge check:', {
    challengeId: 'ep2-its-all-a-game',
    hasChallenge: !!challenge && Object.keys(challenge).length > 0,
    challengeCompleted,
    chapterCompleted,
    isCompleted,
    candyChoice: challenge?.candyChoice,
    candyType,
    challengeKeys: Object.keys(challenges),
    chapter2Keys: Object.keys(chapter2)
  });

  if (isCompleted && candyType) {
    // Normalize candy type to match expected format
    const normalizedType = candyType.toLowerCase().replace(/_/g, '-') as 'on-off' | 'up-down' | 'config';
    console.log('getRRCandyStatus: RR Candy UNLOCKED:', { candyType: normalizedType });
    return {
      unlocked: true,
      candyType: normalizedType,
      challengeData: challenge
    };
  }

  console.log('getRRCandyStatus: RR Candy NOT unlocked:', {
    isCompleted,
    hasCandyType: !!candyType,
    candyType,
    challengeCompleted,
    chapterCompleted
  });

  return {
    unlocked: false,
    candyType: null,
    challengeData: challenge
  };
}

/**
 * Check if RR Candy is unlocked (async version for Firestore queries)
 */
export async function getRRCandyStatusAsync(userId: string): Promise<RRCandyStatus> {
  const { db } = await import('../firebase');
  const { doc, getDoc } = await import('firebase/firestore');

  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      console.warn('getRRCandyStatusAsync: User document does not exist:', userId);
      return { unlocked: false, candyType: null };
    }

    const userData = userDoc.data();
    
    // Add detailed logging to debug unlock detection
    const chapters = userData?.chapters || {};
    const chapter2 = chapters[2] || chapters['2'] || {};
    const challenges = chapter2?.challenges || {};
    const challenge = challenges['ep2-its-all-a-game'] || {};
    
    console.log('getRRCandyStatusAsync: Debug data:', {
      userId,
      hasUserData: !!userData,
      hasChapters: !!userData?.chapters,
      hasChapter2: !!chapter2,
      chapter2Keys: Object.keys(chapter2),
      hasChallenges: !!challenges,
      challengeKeys: Object.keys(challenges),
      hasChallenge: !!challenge,
      challengeData: challenge,
      isCompleted: challenge?.isCompleted,
      status: challenge?.status,
      candyChoice: challenge?.candyChoice
    });
    
    const result = getRRCandyStatus(userData);
    
    console.log('getRRCandyStatusAsync: Result:', result);
    
    return result;
  } catch (error) {
    console.error('Error fetching RR Candy status:', error);
    return { unlocked: false, candyType: null };
  }
}

