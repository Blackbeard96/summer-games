/**
 * Canonical **profile XP** (`students.xp` / `users.xp`) + mirrored progression:
 * - Deployed season Battle Pass (`season1.battlePass.battlePassXP`) via `awardBattlePassXpForDeployedSeason`
 * - Daily challenges keyed as `earn_xp` (admin type synonyms in `dailyChallengeShared`)
 *
 * **Power stat XP** (Physical/Mental/Emotional/Spiritual on `students.stats`) is separate; Live Event
 * reflection/goals credit BP beside `awardPowerStatXp` in `liveEventPowerStatsService.ts`.
 *
 * When another code path already performs `xp: increment(Δ)` in a combined `updateDoc`, call
 * `mirrorProfileXpToProgressionSystems` only — do not double-increment profile XP.
 */

import { doc, getDoc, increment, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { awardBattlePassXpForDeployedSeason } from './awardBattlePassXp';
import { updateChallengeProgressByType } from './dailyChallengeTracker';

/** Standardized hooks for daily challenges (Firestore). Prefer this over ad-hoc `updateChallengeProgressByType` in gameplay code. */
export type TrackedPlayerAction =
  | 'BATTLE_WON'
  | 'LIVE_EVENT_SESSION_FINALIZED'
  | 'MANIFEST_SKILL_USED'
  | 'ELEMENTAL_MOVE_USED'
  | 'EARN_PP'
  | 'DEFEAT_ENEMY';

export async function trackPlayerAction(
  userId: string,
  action: TrackedPlayerAction,
  value: number = 1
): Promise<void> {
  if (!userId || value <= 0) return;
  progressionDebugLog('trackPlayerAction', { userId, action, value });
  switch (action) {
    case 'BATTLE_WON':
      await updateChallengeProgressByType(userId, 'win_battle', value);
      return;
    case 'LIVE_EVENT_SESSION_FINALIZED':
      await updateChallengeProgressByType(userId, 'participate_live_event', value);
      return;
    case 'MANIFEST_SKILL_USED':
      await updateChallengeProgressByType(userId, 'use_manifest_ability', value);
      return;
    case 'ELEMENTAL_MOVE_USED':
      await updateChallengeProgressByType(userId, 'use_elemental_move', value);
      return;
    case 'EARN_PP':
      await updateChallengeProgressByType(userId, 'earn_pp', value);
      return;
    case 'DEFEAT_ENEMY':
      await updateChallengeProgressByType(userId, 'defeat_enemies', value);
      return;
    default:
      return;
  }
}

const DEBUG = process.env.REACT_APP_DEBUG_PROGRESSION === 'true';

export function progressionDebugLog(tag: string, payload: Record<string, unknown>): void {
  if (!DEBUG) return;
  console.log(`[progression:${tag}]`, { ts: new Date().toISOString(), ...payload });
}

export type ProfileXpSource =
  | 'battle_win'
  | 'battle_context'
  | 'live_quiz'
  | 'live_event_sprint'
  | 'island_raid'
  | 'practice'
  | 'daily_challenge'
  | 'other';

export interface GrantPlayerProfileXpOptions {
  /** Default true: credit `season1.battlePass.battlePassXP` with the same Δ as profile XP (1:1). */
  mirrorBattlePass?: boolean;
  /** Default true: advance daily challenges that match `earn_xp` by Δ. */
  creditEarnXpDailyChallenge?: boolean;
  /** Default true: increment `users/{id}.xp` when that doc exists. */
  mirrorUserDoc?: boolean;
}

/**
 * Increment profile XP on `students` + optional `users` mirror, then mirror to battle pass + daily challenges.
 */
export async function grantPlayerProfileXp(
  playerId: string,
  amount: number,
  source: ProfileXpSource,
  options?: GrantPlayerProfileXpOptions
): Promise<{ granted: number }> {
  const delta = Math.max(0, Math.floor(Number(amount) || 0));
  if (!playerId || delta <= 0) return { granted: 0 };

  const mirrorBp = options?.mirrorBattlePass !== false;
  const creditChallenge = options?.creditEarnXpDailyChallenge !== false;
  const mirrorUser = options?.mirrorUserDoc !== false;

  const studentRef = doc(db, 'students', playerId);
  const studentSnap = await getDoc(studentRef);
  if (!studentSnap.exists()) {
    progressionDebugLog('grantPlayerProfileXp', { playerId, source, error: 'missing_student' });
    return { granted: 0 };
  }
  const prevXp = Math.floor(Number(studentSnap.data()?.xp) || 0);

  await updateDoc(studentRef, {
    xp: increment(delta),
    updatedAt: serverTimestamp(),
  });

  if (mirrorUser) {
    const userRef = doc(db, 'users', playerId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      await updateDoc(userRef, { xp: increment(delta) });
    }
  }

  if (mirrorBp) {
    await awardBattlePassXpForDeployedSeason(playerId, delta);
  }
  if (creditChallenge) {
    try {
      await updateChallengeProgressByType(playerId, 'earn_xp', delta);
    } catch (e) {
      console.warn('[progression] earn_xp daily challenge update failed', e);
    }
  }

  progressionDebugLog('grantPlayerProfileXp', {
    playerId,
    source,
    xpGained: delta,
    prevProfileXp: prevXp,
    battlePassMirrored: mirrorBp,
    earnXpChallengeCredited: creditChallenge,
  });

  return { granted: delta };
}

/**
 * Call after profile `xp` was already incremented elsewhere (e.g. combined raid `updateDoc`).
 * Applies the same Δ to battle pass + `earn_xp` daily challenges (1:1 with profile XP gained).
 */
export async function mirrorProfileXpToProgressionSystems(
  playerId: string,
  xpDelta: number,
  source: ProfileXpSource
): Promise<void> {
  const delta = Math.max(0, Math.floor(Number(xpDelta) || 0));
  if (!playerId || delta <= 0) return;

  progressionDebugLog('mirrorProfileXpToProgressionSystems', { playerId, source, xpDelta: delta });

  await awardBattlePassXpForDeployedSeason(playerId, delta);
  try {
    await updateChallengeProgressByType(playerId, 'earn_xp', delta);
  } catch (e) {
    console.warn('[progression] earn_xp daily challenge (mirror) failed', e);
  }
}
