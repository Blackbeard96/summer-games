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
 * candyChoice / candyChoice fields are not always strings (objects, numbers, legacy shapes).
 * Never call .toLowerCase() on raw Firestore values.
 */
function coerceCandyChoiceToString(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof raw === 'number' || typeof raw === 'boolean') {
    return String(raw);
  }
  if (typeof raw === 'object') {
    const o = raw as Record<string, unknown>;
    for (const k of ['choice', 'candyChoice', 'type', 'value', 'id']) {
      const v = o[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return null;
}

/**
 * Chapter progress is sometimes under chapters[2], sometimes under another numeric key.
 * Scan all chapter objects for ep2-its-all-a-game (RR Candy unlock challenge).
 */
function findEp2ItsAllAGameChallenge(userData: any): { challenge: any; parentChapter: any } {
  const chapters = userData?.chapters || {};
  if (!chapters || typeof chapters !== 'object') return { challenge: {}, parentChapter: {} };

  for (const key of Object.keys(chapters)) {
    const ch = chapters[key];
    if (!ch || typeof ch !== 'object') continue;
    const challenges = ch.challenges;
    if (!challenges || typeof challenges !== 'object') continue;
    const direct = challenges['ep2-its-all-a-game'];
    if (direct && typeof direct === 'object' && Object.keys(direct).length > 0) {
      return { challenge: direct, parentChapter: ch };
    }
    for (const ck of Object.keys(challenges)) {
      const low = ck.toLowerCase();
      if (low.includes('its-all-a-game') || low.includes('all-a-game')) {
        const c = challenges[ck];
        if (c && typeof c === 'object' && Object.keys(c).length > 0) {
          return { challenge: c, parentChapter: ch };
        }
      }
    }
  }
  return { challenge: {}, parentChapter: {} };
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

  const chapters = userData.chapters || {};
  const { challenge: foundChallenge, parentChapter: foundChapter } = findEp2ItsAllAGameChallenge(userData);

  // Legacy path: chapter keyed as "2" only
  const chapter2 = foundChapter && Object.keys(foundChapter).length > 0
    ? foundChapter
    : chapters[2] || chapters['2'] || {};
  const challenges = chapter2.challenges || {};

  let challenge =
    foundChallenge && Object.keys(foundChallenge).length > 0
      ? foundChallenge
      : challenges['ep2-its-all-a-game'] || {};

  if (!challenge || Object.keys(challenge).length === 0) {
    const challengeKeys = Object.keys(challenges);
    const matchingKey = challengeKeys.find(
      (key) =>
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
  let isCompleted = challengeCompleted || chapterCompleted;

  // Reward grants rr_candy artifact — treat as unlocked if present (progress may live only in students.artifacts)
  const artifacts = userData.artifacts || {};
  const hasRRCandyArtifact =
    artifacts.rr_candy === true ||
    artifacts['rr_candy'] === true ||
    artifacts.rrCandy === true;
  if (hasRRCandyArtifact) {
    isCompleted = true;
  }
  
  const candyRaw =
    challenge?.candyChoice ||
    artifacts.candy_choice ||
    artifacts.candyChoice ||
    userData.candyChoice;
  let candyTypeStr = coerceCandyChoiceToString(candyRaw);
  if (isCompleted && !candyTypeStr) {
    console.warn(
      'getRRCandyStatus: Challenge completed but candyChoice missing or non-string, defaulting to "on-off"',
      { candyRaw }
    );
    candyTypeStr = 'on-off';
  }

  console.log('getRRCandyStatus: Challenge check:', {
    challengeId: 'ep2-its-all-a-game',
    hasChallenge: !!challenge && Object.keys(challenge).length > 0,
    challengeCompleted,
    chapterCompleted,
    isCompleted,
    candyChoice: challenge?.candyChoice,
    candyTypeStr,
    challengeKeys: Object.keys(challenges),
    chapter2Keys: Object.keys(chapter2)
  });

  if (isCompleted && candyTypeStr) {
    // Normalize candy type to match expected format
    const normalizedType = candyTypeStr.toLowerCase().replace(/_/g, '-') as 'on-off' | 'up-down' | 'config';
    console.log('getRRCandyStatus: RR Candy UNLOCKED:', { candyType: normalizedType });
    return {
      unlocked: true,
      candyType: normalizedType,
      challengeData: challenge
    };
  }

  console.log('getRRCandyStatus: RR Candy NOT unlocked:', {
    isCompleted,
    hasCandyType: !!candyTypeStr,
    candyTypeStr,
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
    const userData = userDoc.exists() ? userDoc.data() : {};

    let result = getRRCandyStatus(userData);

    // Chapter / artifact progress is sometimes written only on students/{uid}
    if (!result.unlocked) {
      try {
        const studentRef = doc(db, 'students', userId);
        const studentDoc = await getDoc(studentRef);
        if (studentDoc.exists()) {
          const sResult = getRRCandyStatus(studentDoc.data());
          if (sResult.unlocked) {
            result = sResult;
            console.log('getRRCandyStatusAsync: Unlocked from students doc');
          }
        }
      } catch (e) {
        console.warn('getRRCandyStatusAsync: students doc read skipped', e);
      }
    }

    console.log('getRRCandyStatusAsync: Result:', result);
    return result;
  } catch (error) {
    console.error('Error fetching RR Candy status:', error);
    return { unlocked: false, candyType: null };
  }
}

