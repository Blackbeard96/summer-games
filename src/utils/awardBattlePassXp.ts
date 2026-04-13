import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { fetchActiveBattlePassSeasonId } from './activeBattlePassClient';
import { mergeSeason1FromStudentData } from './season1PlayerHydration';

/**
 * Adds XP toward the deployed Season 1+ battle pass (`students.season1.battlePass`).
 * Profile `xp` is separate; the home card reads battlePassXP when a season is active.
 */
export async function awardBattlePassXpForDeployedSeason(playerId: string, xpDelta: number): Promise<void> {
  if (!playerId || xpDelta <= 0) return;
  const activeId = await fetchActiveBattlePassSeasonId();
  if (!activeId) return;

  const ref = doc(db, 'students', playerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const raw = snap.data();
  const s1 = mergeSeason1FromStudentData(raw.season1 as Record<string, unknown> | undefined);
  const bp = s1.battlePass;
  const prevSeason = bp.currentSeasonId;
  let nextXp: number;
  if (prevSeason !== activeId) {
    nextXp = xpDelta;
  } else {
    nextXp = Math.max(0, Math.floor(Number(bp.battlePassXP) || 0) + xpDelta);
  }

  try {
    await updateDoc(ref, {
      season1: {
        ...s1,
        battlePass: {
          ...bp,
          currentSeasonId: activeId,
          battlePassXP: nextXp,
          currentTier: Math.max(0, Number(bp.currentTier) || 0),
          claimedRewardIds: Array.isArray(bp.claimedRewardIds) ? bp.claimedRewardIds : [],
        },
      },
    });
  } catch (e) {
    console.warn('[battlePass] awardBattlePassXpForDeployedSeason failed', e);
  }
}

/** @deprecated Prefer `awardBattlePassXpForDeployedSeason` — same behavior. */
export async function awardBattlePassXpFromIslandRaid(playerId: string, xpDelta: number): Promise<void> {
  return awardBattlePassXpForDeployedSeason(playerId, xpDelta);
}

/** Persist that the player dismissed the deployed season intro (hero video / slide sequence). */
export async function markBattlePassIntroSeenForSeason(playerId: string, seasonId: string): Promise<void> {
  const sid = String(seasonId || '').trim();
  if (!playerId || !sid) return;

  const ref = doc(db, 'students', playerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const raw = snap.data();
  const s1 = mergeSeason1FromStudentData(raw.season1 as Record<string, unknown> | undefined);
  const bp = s1.battlePass;

  try {
    await updateDoc(ref, {
      season1: {
        ...s1,
        battlePass: {
          ...bp,
          introSeenSeasonId: sid,
        },
      },
    });
  } catch (e) {
    console.warn('[battlePass] markBattlePassIntroSeenForSeason failed', e);
  }
}
