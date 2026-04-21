import {
  doc,
  getDoc,
  increment,
  serverTimestamp,
  updateDoc,
  type UpdateData,
} from 'firebase/firestore';
import { db } from '../firebase';
import { fetchActiveBattlePassSeasonId } from './activeBattlePassClient';
import { mergeSeason1FromStudentData } from './season1PlayerHydration';

const DEBUG_BP = process.env.REACT_APP_DEBUG_PROGRESSION === 'true';

/**
 * Adds XP toward the deployed Season 1+ battle pass (`students.season1.battlePass`).
 * Call this whenever **profile XP** is granted (`students`/`users` `xp` field) so the Battle Pass
 * bar stays in sync — including any custom `updateDoc` paths that increment XP outside shared helpers.
 * Profile `xp` and `season1.battlePass.battlePassXP` are stored separately; the Home deployed pass reads the latter.
 *
 * Uses atomic `increment` on `battlePassXP` to reduce lost updates when multiple writers credit XP close together;
 * falls back to read-merge-write if the increment update fails (e.g. unusual legacy shape).
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
  const prevXp = Math.max(0, Math.floor(Number(bp.battlePassXP) || 0));
  const delta = Math.max(0, Math.floor(xpDelta));
  const nextXpFallback = prevXp + delta;

  try {
    await updateDoc(
      ref,
      {
        'season1.battlePass.battlePassXP': increment(delta),
        'season1.battlePass.currentSeasonId': activeId,
        updatedAt: serverTimestamp(),
      } as UpdateData<Record<string, unknown>>
    );
    if (DEBUG_BP) {
      console.log('[battlePass] awardBattlePassXpForDeployedSeason (increment)', {
        playerId,
        xpDelta: delta,
        prevBattlePassXp: prevXp,
        newBattlePassXpApprox: prevXp + delta,
        currentSeasonId: activeId,
        ok: true,
      });
    }
  } catch (e) {
    try {
      const nextBattlePass: Record<string, unknown> = {
        ...bp,
        currentSeasonId: activeId,
        battlePassXP: nextXpFallback,
        currentTier: Math.max(0, Number(bp.currentTier) || 0),
        claimedRewardIds: Array.isArray(bp.claimedRewardIds) ? bp.claimedRewardIds : [],
      };
      if (typeof bp.introSeenSeasonId === 'string' && bp.introSeenSeasonId.trim()) {
        nextBattlePass.introSeenSeasonId = bp.introSeenSeasonId.trim();
      }
      await updateDoc(ref, {
        season1: {
          ...s1,
          battlePass: nextBattlePass,
        },
      });
      if (DEBUG_BP) {
        console.log('[battlePass] awardBattlePassXpForDeployedSeason (fallback merge)', {
          playerId,
          xpDelta: delta,
          prevBattlePassXp: prevXp,
          newBattlePassXp: nextXpFallback,
          currentSeasonId: activeId,
          ok: true,
        });
      }
    } catch (e2) {
      console.warn('[battlePass] awardBattlePassXpForDeployedSeason failed', e, e2);
      if (DEBUG_BP) {
        console.log('[battlePass] awardBattlePassXpForDeployedSeason', {
          playerId,
          xpDelta: delta,
          prevBattlePassXp: prevXp,
          ok: false,
        });
      }
    }
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
