/**
 * Unified RR Candy unlock status utility
 * 
 * SOURCE OF TRUTH FOR RR CANDY UNLOCK:
 * =====================================
 * RR Candy unlock is determined by checking:
 * - Firestore path: users/{uid}/chapters/2/challenges/ep2-its-all-a-game/
 * - Field: isCompleted === true OR status === 'approved'
 * - Field: candyChoice exists (values: 'on-off', 'up-down', 'config', or synonyms like 'konfig')
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

/** Values stored in chapter candyChoice / normalized by getRRCandyStatus. */
export type LegacyRRCandyType = 'on-off' | 'up-down' | 'config';

export interface RRCandyStatus {
  unlocked: boolean;
  candyType: LegacyRRCandyType | null;
  challengeData?: any;
}

/**
 * IMPLEMENTATION NOTE (RR Candy skill trees v1):
 * - Unlock detection: this file (Firestore users/{uid} + students/{uid} chapters / artifacts).
 * - Learned RR tree nodes: players/{uid}/skill_state/main → rrCandySkillState (see rrCandyPlayerStateService).
 * - Global tree definitions: system_config/rr_candy_trees_v1 (see rrCandyConfigService + defaultRRCandyTrees).
 * - Admin: AdminPanel tab → pages/admin/RRCandyAdminPage.tsx
 */

/**
 * candyChoice / candyChoice fields are not always strings (objects, numbers, legacy shapes).
 * Never call .toLowerCase() on raw Firestore values.
 */
export function coerceCandyChoiceToString(raw: unknown): string | null {
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
 * Map stored labels onto legacy candy types. Konfig is stored as `config` in most flows;
 * some docs use `konfig` or similar — normalize so `candyType === 'config'` checks work.
 */
export function normalizeLegacyRRCandyTypeInput(raw: string | null | undefined): LegacyRRCandyType | null {
  if (raw == null || String(raw).trim() === '') return null;
  const n = String(raw).toLowerCase().replace(/_/g, '-').trim();
  if (
    n === 'konfig' ||
    n === 'reality-configuration' ||
    n === 'manifest-configuration' ||
    n === 'configuration'
  ) {
    return 'config';
  }
  if (n === 'onoff') return 'on-off';
  if (n === 'updown') return 'up-down';
  if (n === 'on-off' || n === 'up-down' || n === 'config') return n;
  return null;
}

/** When users vs students disagree, prefer config > up-down > on-off (split-brain repair). */
export function pickStrongerRRCandyType(
  a: LegacyRRCandyType | null,
  b: LegacyRRCandyType | null
): LegacyRRCandyType | null {
  const rank: Record<LegacyRRCandyType, number> = { 'on-off': 1, 'up-down': 2, config: 3 };
  if (!a) return b;
  if (!b) return a;
  return rank[a] >= rank[b] ? a : b;
}

function mergeExplicitCandyFromTwoDocs(
  uExplicit: string | null,
  sExplicit: string | null
): LegacyRRCandyType | null {
  return pickStrongerRRCandyType(
    normalizeLegacyRRCandyTypeInput(uExplicit),
    normalizeLegacyRRCandyTypeInput(sExplicit)
  );
}

/** Raw unlock parts from one Firestore doc (users or students) — no default candy. */
export function analyzeRRCandyDoc(userData: any) {
  return computeRRCandyUnlockParts(userData);
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

/** Per-document unlock + explicit candy (no default to on-off). */
function computeRRCandyUnlockParts(userData: any): {
  isCompleted: boolean;
  explicitCandyStr: string | null;
  challenge: any;
  challengeCompleted: boolean;
  chapterCompleted: boolean;
} {
  if (!userData) {
    return {
      isCompleted: false,
      explicitCandyStr: null,
      challenge: {},
      challengeCompleted: false,
      chapterCompleted: false,
    };
  }

  const chapters = userData.chapters || {};
  const { challenge: foundChallenge, parentChapter: foundChapter } = findEp2ItsAllAGameChallenge(userData);

  const chapter2 =
    foundChapter && Object.keys(foundChapter).length > 0
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

  const challengeCompleted = challenge?.isCompleted === true || challenge?.status === 'approved';
  const chapterCompleted = chapter2?.isCompleted === true;
  let isCompleted = challengeCompleted || chapterCompleted;

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
    artifacts.rr_candy_choice ||
    artifacts.rrCandyChoice ||
    artifacts.rr_candy_type ||
    artifacts.rrCandyType ||
    artifacts.candy_choice ||
    artifacts.candyChoice ||
    userData.candyChoice;
  const explicitCandyStr = coerceCandyChoiceToString(candyRaw);

  return {
    isCompleted,
    explicitCandyStr,
    challenge,
    challengeCompleted,
    chapterCompleted,
  };
}

function statusFromParts(
  isCompleted: boolean,
  explicitCandyStr: string | null,
  challenge: any,
  challengeCompleted: boolean,
  chapterCompleted: boolean,
  logPrefix: string
): RRCandyStatus {
  if (!isCompleted) {
    console.log(`${logPrefix}: RR Candy NOT unlocked:`, {
      challengeCompleted,
      chapterCompleted,
    });
    return {
      unlocked: false,
      candyType: null,
      challengeData: challenge,
    };
  }

  let candyTypeStr = explicitCandyStr;
  if (isCompleted && !candyTypeStr) {
    console.warn(
      `${logPrefix}: Challenge completed but candyChoice missing or non-string, defaulting to "on-off"`,
      { explicitCandyStr }
    );
    candyTypeStr = 'on-off';
  }

  console.log(`${logPrefix}: Challenge check:`, {
    challengeId: 'ep2-its-all-a-game',
    hasChallenge: !!challenge && Object.keys(challenge).length > 0,
    challengeCompleted,
    chapterCompleted,
    isCompleted,
    candyChoice: challenge?.candyChoice,
    candyTypeStr,
  });

  if (candyTypeStr) {
    let normalizedType = normalizeLegacyRRCandyTypeInput(candyTypeStr);
    if (!normalizedType) {
      console.warn(`${logPrefix}: Unknown candy label "${candyTypeStr}", defaulting to on-off`);
      normalizedType = 'on-off';
    }
    console.log(`${logPrefix}: RR Candy UNLOCKED:`, { candyType: normalizedType });
    return {
      unlocked: true,
      candyType: normalizedType,
      challengeData: challenge,
    };
  }

  return {
    unlocked: false,
    candyType: null,
    challengeData: challenge,
  };
}

/**
 * Get RR Candy unlock status from a single document (users or students).
 * If completed but candyChoice is missing, defaults to on-off (legacy).
 */
export function getRRCandyStatus(userData: any): RRCandyStatus {
  if (!userData) {
    console.warn('getRRCandyStatus: No userData provided');
    return { unlocked: false, candyType: null };
  }
  const p = computeRRCandyUnlockParts(userData);
  return statusFromParts(
    p.isCompleted,
    p.explicitCandyStr,
    p.challenge,
    p.challengeCompleted,
    p.chapterCompleted,
    'getRRCandyStatus'
  );
}

/**
 * Merge users/{uid} + students/{uid} so candyChoice is not lost when one doc
 * has completion flags and the other has the actual choice (common split-brain).
 */
export function getMergedRRCandyStatus(userData: any, studentData: any | null | undefined): RRCandyStatus {
  const u = computeRRCandyUnlockParts(userData || {});
  const s =
    studentData && typeof studentData === 'object'
      ? computeRRCandyUnlockParts(studentData)
      : {
          isCompleted: false,
          explicitCandyStr: null,
          challenge: {},
          challengeCompleted: false,
          chapterCompleted: false,
        };

  const unlocked = u.isCompleted || s.isCompleted;
  const explicitCandyStr = mergeExplicitCandyFromTwoDocs(u.explicitCandyStr, s.explicitCandyStr);
  const challenge =
    u.challenge && Object.keys(u.challenge).length > 0
      ? u.challenge
      : s.challenge && Object.keys(s.challenge).length > 0
        ? s.challenge
        : u.challenge;

  return statusFromParts(
    unlocked,
    explicitCandyStr,
    challenge,
    u.challengeCompleted || s.challengeCompleted,
    u.chapterCompleted || s.chapterCompleted,
    'getMergedRRCandyStatus'
  );
}

/** True if skill_state indicates Vibration law boons were unlocked (intended to require Config RR Candy). */
export function skillStateImpliesKonfigCandy(skillData: Record<string, unknown> | undefined): boolean {
  const byLaw = skillData?.universalLawProgress as { unlockedByLaw?: { vibration?: unknown } } | undefined;
  const vibration = byLaw?.unlockedByLaw?.vibration;
  return Array.isArray(vibration) && vibration.length > 0;
}

/**
 * Check if RR Candy is unlocked (async version for Firestore queries)
 */
export async function getRRCandyStatusAsync(userId: string): Promise<RRCandyStatus> {
  const { db } = await import('../firebase');
  const { doc, getDoc } = await import('firebase/firestore');

  try {
    try {
      const { migrateExistingKonfigOwners } = await import('../services/rrCandyPlayerStateService');
      await migrateExistingKonfigOwners(userId);
    } catch (migrateErr) {
      console.warn('getRRCandyStatusAsync: Konfig starter migration skipped (unlock still from chapter data)', migrateErr);
    }

    const userRef = doc(db, 'users', userId);
    const studentRef = doc(db, 'students', userId);
    const [userDoc, studentDoc] = await Promise.all([getDoc(userRef), getDoc(studentRef)]);

    const userData = userDoc.exists() ? userDoc.data() : {};
    const studentData = studentDoc.exists() ? studentDoc.data() : null;

    let result = getMergedRRCandyStatus(userData, studentData);

    // Konfig skill_state is authoritative if chapter data wrongly defaulted to on-off
    try {
      const skillRef = doc(db, 'players', userId, 'skill_state', 'main');
      const skillSnap = await getDoc(skillRef);
      const skillData = skillSnap.data() as Record<string, unknown> | undefined;
      const learned = skillData?.rrCandySkillState as { konfig?: { learnedNodeIds?: unknown } } | undefined;
      const konfigIds = learned?.konfig?.learnedNodeIds;
      const hasKonfigNodes = Array.isArray(konfigIds) && konfigIds.length > 0;
      const hasVibration = skillStateImpliesKonfigCandy(skillData);
      if (result.candyType === 'on-off' && (hasKonfigNodes || hasVibration)) {
        result = { ...result, candyType: 'config' };
        console.log('getRRCandyStatusAsync: Overriding on-off → config from skill_state', {
          hasKonfigNodes,
          hasVibration,
        });
      }
    } catch (e) {
      console.warn('getRRCandyStatusAsync: skill_state read skipped', e);
    }

    console.log('getRRCandyStatusAsync: Result:', result);
    return result;
  } catch (error) {
    console.error('Error fetching RR Candy status:', error);
    return { unlocked: false, candyType: null };
  }
}

