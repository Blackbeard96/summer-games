/**
 * Class Flow — timed sprints on inSessionRooms.classFlowSprint
 */

import { db } from '../firebase';
import {
  doc,
  getDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  increment,
  deleteField,
} from 'firebase/firestore';
import type { UpdateData, DocumentData } from 'firebase/firestore';
import type { ClassFlowSprintState } from '../types/season1';
import { trackParticipation } from './inSessionStatsService';
import { isGlobalHost } from './inSessionService';
import { mirrorProfileXpToProgressionSystems } from './playerProgressionRewards';
import { recordSprintMarkedCompleteForPlayer, recordSprintOpportunityForPlayers } from './weeklyGoalsService';
import {
  recordHabitLiveEventSprintCompletion,
  recordHabitLiveEventSprintOpportunity,
} from './habitLiveEventEvidenceService';

const roomRef = (sessionId: string) => doc(db, 'inSessionRooms', sessionId);

/** Human-readable duration for battle log (stored value is always seconds). */
export function formatSprintDurationForLog(durationSeconds: number): string {
  const s = Math.max(0, Math.floor(durationSeconds || 0));
  const wholeMin = Math.floor(s / 60);
  const rem = s % 60;
  if (wholeMin === 0) return `${s}s`;
  if (rem === 0) return wholeMin === 1 ? '1 minute' : `${wholeMin} minutes`;
  return `${wholeMin} min ${rem}s`;
}

function canActAsRoomHost(
  roomHostUid: unknown,
  actingUid: string,
  email?: string,
  displayName?: string
): boolean {
  if (typeof roomHostUid === 'string' && roomHostUid === actingUid) return true;
  return isGlobalHost(actingUid, email, displayName);
}

function tsToMillis(t: unknown): number | null {
  if (t && typeof (t as Timestamp).toMillis === 'function') {
    return (t as Timestamp).toMillis();
  }
  if (t instanceof Date) return t.getTime();
  return null;
}

/** Parse Firestore map into a typed sprint (or null if missing/invalid). */
export function parseClassFlowSprint(raw: unknown): ClassFlowSprintState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.title !== 'string') return null;
  if (typeof o.hostUid !== 'string') return null;
  if (o.status !== 'live' && o.status !== 'closed') return null;
  const startedMs = tsToMillis(o.startedAt);
  const endsMs = tsToMillis(o.endsAt);
  if (startedMs == null || endsMs == null) return null;

  const marked = Array.isArray(o.markedCompleteUids)
    ? o.markedCompleteUids.filter((x): x is string => typeof x === 'string')
    : [];
  const granted = Array.isArray(o.rewardsGrantedUids)
    ? o.rewardsGrantedUids.filter((x): x is string => typeof x === 'string')
    : [];
  const penaltyGranted = Array.isArray(o.incompletePenaltiesGrantedUids)
    ? o.incompletePenaltiesGrantedUids.filter((x): x is string => typeof x === 'string')
    : [];

  return {
    id: o.id,
    title: o.title,
    description: typeof o.description === 'string' ? o.description : undefined,
    durationSeconds: typeof o.durationSeconds === 'number' ? o.durationSeconds : 0,
    startedAt: (o.startedAt as Timestamp) || new Date(startedMs),
    endsAt: (o.endsAt as Timestamp) || new Date(endsMs),
    status: o.status,
    hostUid: o.hostUid,
    rewardParticipationPoints:
      typeof o.rewardParticipationPoints === 'number' ? Math.max(1, Math.floor(o.rewardParticipationPoints)) : 1,
    rewardVaultPP: typeof o.rewardVaultPP === 'number' ? Math.max(0, Math.floor(o.rewardVaultPP)) : 0,
    rewardXP: typeof o.rewardXP === 'number' ? Math.max(0, Math.floor(o.rewardXP)) : 0,
    incompletePenaltyVaultPP:
      typeof o.incompletePenaltyVaultPP === 'number' ? Math.max(0, Math.floor(o.incompletePenaltyVaultPP)) : 0,
    markedCompleteUids: marked,
    rewardsGrantedUids: granted,
    incompletePenaltiesGrantedUids: penaltyGranted,
  };
}

export type StartClassFlowSprintPayload = {
  title: string;
  description?: string;
  durationSeconds: number;
  rewardParticipationPoints: number;
  rewardVaultPP: number;
  rewardXP: number;
  /** Deduct this much vault PP from each session player not marked complete (0 = off). */
  incompletePenaltyVaultPP?: number;
};

export async function startClassFlowSprint(
  sessionId: string,
  actingUid: string,
  actingEmail: string | undefined,
  actingDisplayName: string | undefined,
  payload: StartClassFlowSprintPayload
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ref = roomRef(sessionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, error: 'Session not found' };
    const players = (snap.data()?.players as { userId?: string }[]) || [];
    const playerUidsForSprints = players
      .map((p) => p.userId)
      .filter((x): x is string => typeof x === 'string' && !!x);
    const hostUid = snap.data()?.hostUid;
    if (!canActAsRoomHost(hostUid, actingUid, actingEmail, actingDisplayName)) {
      return { ok: false, error: 'Only the session host can start a sprint' };
    }

    const title = payload.title.trim();
    if (!title) return { ok: false, error: 'Enter a sprint goal title' };

    const durationSeconds = Math.max(60, Math.min(3600, Math.floor(payload.durationSeconds || 120)));
    const rewardParticipationPoints = Math.max(1, Math.min(20, Math.floor(payload.rewardParticipationPoints || 1)));
    const rewardVaultPP = Math.max(0, Math.min(5000, Math.floor(payload.rewardVaultPP || 0)));
    const rewardXP = Math.max(0, Math.min(5000, Math.floor(payload.rewardXP || 0)));
    const incompletePenaltyVaultPP = Math.max(
      0,
      Math.min(5000, Math.floor(payload.incompletePenaltyVaultPP ?? 0))
    );

    const now = Timestamp.now();
    const endsAt = Timestamp.fromMillis(now.toMillis() + durationSeconds * 1000);
    const id = `sprint_${Date.now()}`;

    await updateDoc(ref, {
      classFlowSprint: {
        id,
        title,
        description: (payload.description || '').trim() || '',
        durationSeconds,
        startedAt: now,
        endsAt,
        status: 'live',
        hostUid: actingUid,
        rewardParticipationPoints,
        rewardVaultPP,
        rewardXP,
        incompletePenaltyVaultPP,
        markedCompleteUids: [],
        rewardsGrantedUids: [],
        incompletePenaltiesGrantedUids: [],
      },
      updatedAt: serverTimestamp(),
      battleLog: arrayUnion(
        `🏃 Sprint started: "${title}" — ${formatSprintDurationForLog(durationSeconds)} to complete the goal.`
      ),
    });

    void recordSprintOpportunityForPlayers(playerUidsForSprints, sessionId).catch(() => {
      /* best-effort weekly goals */
    });
    void recordHabitLiveEventSprintOpportunity(sessionId, title, playerUidsForSprints).catch(() => {
      /* best-effort habit live-event evidence */
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function closeClassFlowSprint(
  sessionId: string,
  actingUid: string,
  actingEmail: string | undefined,
  actingDisplayName: string | undefined
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ref = roomRef(sessionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, error: 'Session not found' };
    if (!canActAsRoomHost(snap.data()?.hostUid, actingUid, actingEmail, actingDisplayName)) {
      return { ok: false, error: 'Only the session host can close the sprint' };
    }
    const sprint = parseClassFlowSprint(snap.data()?.classFlowSprint);
    if (!sprint) return { ok: false, error: 'No active sprint' };

    await updateDoc(ref, {
      'classFlowSprint.status': 'closed',
      updatedAt: serverTimestamp(),
      battleLog: arrayUnion(`🏁 Sprint window closed: "${sprint.title}" — award completions when ready.`),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function clearClassFlowSprint(
  sessionId: string,
  actingUid: string,
  actingEmail: string | undefined,
  actingDisplayName: string | undefined
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ref = roomRef(sessionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, error: 'Session not found' };
    if (!canActAsRoomHost(snap.data()?.hostUid, actingUid, actingEmail, actingDisplayName)) {
      return { ok: false, error: 'Only the session host can clear the sprint' };
    }
    await updateDoc(ref, {
      classFlowSprint: deleteField(),
      updatedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function toggleClassFlowSprintMark(
  sessionId: string,
  actingUid: string,
  actingEmail: string | undefined,
  actingDisplayName: string | undefined,
  playerUid: string,
  playerDisplayName?: string
): Promise<{ ok: boolean; error?: string }> {
  let addedMark = false;
  try {
    const ref = roomRef(sessionId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Session not found');
      const hostUid = snap.data()?.hostUid;
      if (!canActAsRoomHost(hostUid, actingUid, actingEmail, actingDisplayName)) {
        throw new Error('Only the session host can mark completions');
      }
      const sprint = parseClassFlowSprint(snap.data()?.classFlowSprint);
      if (!sprint) throw new Error('No sprint');
      if (sprint.status !== 'live' && sprint.status !== 'closed') {
        throw new Error('Sprint is not open for marking');
      }

      const set = new Set(sprint.markedCompleteUids || []);
      const wasIn = set.has(playerUid);
      if (wasIn) {
        set.delete(playerUid);
      } else {
        set.add(playerUid);
        addedMark = true;
      }

      tx.update(ref, {
        'classFlowSprint.markedCompleteUids': Array.from(set),
        updatedAt: serverTimestamp(),
      });
    });

    if (addedMark) {
      const g = await grantSprintRewardForSinglePlayer(
        sessionId,
        actingUid,
        actingEmail,
        actingDisplayName,
        playerUid,
        playerDisplayName || 'Player'
      );
      if (!g.ok) return { ok: false, error: g.error };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function bumpSessionPlayerVaultPP(sessionId: string, uid: string, delta: number): Promise<void> {
  if (delta <= 0) return;
  const ref = roomRef(sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const players = [...((snap.data()?.players as { userId: string; powerPoints?: number }[]) || [])];
    const idx = players.findIndex((p) => p && (p as { userId?: string }).userId === uid);
    if (idx < 0) return;
    const p = { ...players[idx] } as { userId: string; powerPoints?: number };
    p.powerPoints = Math.max(0, (p.powerPoints ?? 0) + delta);
    players[idx] = p;
    tx.update(ref, { players, updatedAt: serverTimestamp() });
  });
}

/** Adjust session row PP (negative delta = deduction, floored at 0). */
async function bumpSessionPlayerVaultPPDelta(sessionId: string, uid: string, delta: number): Promise<void> {
  if (delta === 0) return;
  const ref = roomRef(sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const players = [...((snap.data()?.players as { userId: string; powerPoints?: number }[]) || [])];
    const idx = players.findIndex((p) => p && (p as { userId?: string }).userId === uid);
    if (idx < 0) return;
    const p = { ...players[idx] } as { userId: string; powerPoints?: number };
    p.powerPoints = Math.max(0, (p.powerPoints ?? 0) + delta);
    players[idx] = p;
    tx.update(ref, { players, updatedAt: serverTimestamp() });
  });
}

async function deductVaultPPFromPlayerClamped(playerUid: string, penalty: number): Promise<void> {
  if (penalty <= 0) return;
  const studentRef = doc(db, 'students', playerUid);
  const userRef = doc(db, 'users', playerUid);
  const vaultRef = doc(db, 'vaults', playerUid);

  const studentDoc = await getDoc(studentRef);
  if (studentDoc.exists()) {
    const cur = Number(studentDoc.data()?.powerPoints) || 0;
    await updateDoc(studentRef, { powerPoints: Math.max(0, cur - penalty) });
  }
  const userDoc = await getDoc(userRef);
  if (userDoc.exists()) {
    const cur = Number(userDoc.data()?.powerPoints) || 0;
    await updateDoc(userRef, { powerPoints: Math.max(0, cur - penalty) });
  }
  const vaultDoc = await getDoc(vaultRef);
  if (vaultDoc.exists()) {
    const v = vaultDoc.data();
    const cur = v?.currentPP ?? 0;
    await updateDoc(vaultRef, { currentPP: Math.max(0, cur - penalty) });
  }
}

type SessionPlayerRow = {
  userId: string;
  powerPoints?: number;
  participationCount?: number;
  movesEarned?: number;
};

/** Keeps session `players[]` participation / moves in sync with sprint stats (FIGHT / BAG buttons). */
async function bumpSessionPlayerParticipationMoves(sessionId: string, uid: string, delta: number): Promise<void> {
  if (delta <= 0) return;
  const ref = roomRef(sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const players = [...((snap.data()?.players as SessionPlayerRow[]) || [])];
    const idx = players.findIndex((p) => p?.userId === uid);
    if (idx < 0) return;
    const p = { ...players[idx] };
    const pc = (p.participationCount ?? 0) + delta;
    const me = (p.movesEarned ?? 0) + delta;
    players[idx] = { ...p, participationCount: pc, movesEarned: me };
    tx.update(ref, { players, updatedAt: serverTimestamp() });
  });
}

/**
 * Grant sprint rewards for one marked player (idempotent if already in rewardsGrantedUids).
 * Updates stats, session PP, participation/moves on session row, vault/XP, and battle log.
 */
export async function grantSprintRewardForSinglePlayer(
  sessionId: string,
  actingUid: string,
  actingEmail: string | undefined,
  actingDisplayName: string | undefined,
  playerUid: string,
  playerDisplayName: string,
  options?: { skipBattleLog?: boolean }
): Promise<{ ok: boolean; granted?: boolean; error?: string }> {
  try {
    const ref = roomRef(sessionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, error: 'Session not found' };
    if (!canActAsRoomHost(snap.data()?.hostUid, actingUid, actingEmail, actingDisplayName)) {
      return { ok: false, error: 'Only the session host can grant sprint rewards' };
    }
    const sprint = parseClassFlowSprint(snap.data()?.classFlowSprint);
    if (!sprint) return { ok: false, error: 'No sprint data' };

    const marked = new Set(sprint.markedCompleteUids || []);
    if (!marked.has(playerUid)) return { ok: false, error: 'Player is not marked complete for this sprint' };

    const grantedSet = new Set(sprint.rewardsGrantedUids || []);
    if (grantedSet.has(playerUid)) return { ok: true, granted: false };

    const ppAmt = sprint.rewardParticipationPoints;
    const vaultPP = sprint.rewardVaultPP;
    const xpAmt = sprint.rewardXP;

    const statsOk = await trackParticipation(sessionId, playerUid, ppAmt, { playerDisplayName });
    if (!statsOk) return { ok: false, error: 'Could not update participation stats for this player' };

    await bumpSessionPlayerParticipationMoves(sessionId, playerUid, ppAmt);

    if (vaultPP > 0 || xpAmt > 0) {
      const studentRef = doc(db, 'students', playerUid);
      const userRef = doc(db, 'users', playerUid);
      const vaultRef = doc(db, 'vaults', playerUid);
      const studentUpdates: UpdateData<DocumentData> = {};
      const userUpdates: UpdateData<DocumentData> = {};
      if (vaultPP > 0) {
        studentUpdates.powerPoints = increment(vaultPP);
        userUpdates.powerPoints = increment(vaultPP);
      }
      if (xpAmt > 0) {
        studentUpdates.xp = increment(xpAmt);
        userUpdates.xp = increment(xpAmt);
      }
      if (Object.keys(studentUpdates).length > 0) {
        const studentDoc = await getDoc(studentRef);
        if (studentDoc.exists()) {
          await updateDoc(studentRef, studentUpdates);
          if (xpAmt > 0) {
            await mirrorProfileXpToProgressionSystems(playerUid, xpAmt, 'live_event_sprint');
          }
        }
      }
      if (Object.keys(userUpdates).length > 0) {
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) await updateDoc(userRef, userUpdates);
      }
      if (vaultPP > 0) {
        const vaultDoc = await getDoc(vaultRef);
        if (vaultDoc.exists()) {
          const v = vaultDoc.data();
          const cur = v?.currentPP ?? 0;
          const cap = v?.capacity ?? 1000;
          await updateDoc(vaultRef, { currentPP: Math.min(cap, cur + vaultPP) });
        }
        await bumpSessionPlayerVaultPP(sessionId, playerUid, vaultPP);
      }
    }

    await updateDoc(ref, {
      'classFlowSprint.rewardsGrantedUids': arrayUnion(playerUid),
      updatedAt: serverTimestamp(),
    });

    if (!options?.skipBattleLog) {
      await updateDoc(ref, {
        battleLog: arrayUnion(
          `🏃 ${playerDisplayName} earned sprint rewards for "${sprint.title}" (${ppAmt} par. pt(s)${
            vaultPP > 0 ? `, +${vaultPP} vault PP` : ''
          }${xpAmt > 0 ? `, +${xpAmt} XP` : ''}).`
        ),
      });
    }

    try {
      const startedMs = tsToMillis(sprint.startedAt);
      if (startedMs != null) {
        await recordSprintMarkedCompleteForPlayer(playerUid, startedMs, Date.now());
      }
      await recordHabitLiveEventSprintCompletion(sessionId, playerUid, Date.now());
    } catch (_) {
      /* best-effort weekly goals + habit evidence */
    }

    return { ok: true, granted: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function grantClassFlowSprintRewards(
  sessionId: string,
  actingUid: string,
  actingEmail: string | undefined,
  actingDisplayName: string | undefined,
  playerNames: Map<string, string>
): Promise<{ ok: boolean; granted?: number; error?: string }> {
  try {
    const ref = roomRef(sessionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, error: 'Session not found' };
    if (!canActAsRoomHost(snap.data()?.hostUid, actingUid, actingEmail, actingDisplayName)) {
      return { ok: false, error: 'Only the session host can grant sprint rewards' };
    }
    const sprint = parseClassFlowSprint(snap.data()?.classFlowSprint);
    if (!sprint) return { ok: false, error: 'No sprint data' };

    const grantedSet = new Set(sprint.rewardsGrantedUids || []);
    const toGrant = (sprint.markedCompleteUids || []).filter((u) => !grantedSet.has(u));
    if (toGrant.length === 0) return { ok: true, granted: 0 };

    let count = 0;
    for (const uid of toGrant) {
      const displayName = playerNames.get(uid) || 'Player';
      const r = await grantSprintRewardForSinglePlayer(
        sessionId,
        actingUid,
        actingEmail,
        actingDisplayName,
        uid,
        displayName,
        { skipBattleLog: true }
      );
      if (r.ok && r.granted) count++;
    }

    if (count > 0) {
      const ppAmt = sprint.rewardParticipationPoints;
      const vaultPP = sprint.rewardVaultPP;
      const xpAmt = sprint.rewardXP;
      await updateDoc(ref, {
        battleLog: arrayUnion(
          `🏃 Sprint rewards granted: ${count} player(s) earned "${sprint.title}" (${ppAmt} participation pt(s) each${
            vaultPP > 0 ? `, +${vaultPP} vault PP` : ''
          }${xpAmt > 0 ? `, +${xpAmt} XP` : ''}).`
        ),
      });
    }

    return { ok: true, granted: count };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Deduct vault PP from every player in the session who is not marked complete for this sprint.
 * Idempotent per player via incompletePenaltiesGrantedUids. Session host is never penalized.
 */
export async function applyClassFlowSprintIncompletePenalties(
  sessionId: string,
  actingUid: string,
  actingEmail: string | undefined,
  actingDisplayName: string | undefined
): Promise<{ ok: boolean; penalized?: number; error?: string }> {
  try {
    const ref = roomRef(sessionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: false, error: 'Session not found' };
    if (!canActAsRoomHost(snap.data()?.hostUid, actingUid, actingEmail, actingDisplayName)) {
      return { ok: false, error: 'Only the session host can apply incomplete penalties' };
    }
    const sprint = parseClassFlowSprint(snap.data()?.classFlowSprint);
    if (!sprint) return { ok: false, error: 'No sprint data' };

    const penalty = Math.max(0, Math.floor(sprint.incompletePenaltyVaultPP || 0));
    if (penalty <= 0) return { ok: false, error: 'This sprint has no incomplete PP penalty configured' };

    const roomHostUid = typeof snap.data()?.hostUid === 'string' ? snap.data()!.hostUid : '';
    const marked = new Set(sprint.markedCompleteUids || []);
    const already = new Set(sprint.incompletePenaltiesGrantedUids || []);
    const sessionPlayers = (snap.data()?.players as { userId?: string }[]) || [];

    const toPenalize: string[] = [];
    for (const row of sessionPlayers) {
      const uid = typeof row?.userId === 'string' ? row.userId : '';
      if (!uid || uid === roomHostUid) continue;
      if (marked.has(uid)) continue;
      if (already.has(uid)) continue;
      toPenalize.push(uid);
    }

    if (toPenalize.length === 0) return { ok: true, penalized: 0 };

    const newlyPenalized: string[] = [];
    for (const uid of toPenalize) {
      try {
        await deductVaultPPFromPlayerClamped(uid, penalty);
        await bumpSessionPlayerVaultPPDelta(sessionId, uid, -penalty);
        newlyPenalized.push(uid);
      } catch (err) {
        console.warn('[applyClassFlowSprintIncompletePenalties] failed for', uid, err);
      }
    }

    if (newlyPenalized.length === 0) {
      return { ok: false, error: 'Could not apply penalties (check player documents / vaults)' };
    }

    await updateDoc(ref, {
      'classFlowSprint.incompletePenaltiesGrantedUids': arrayUnion(...newlyPenalized),
      updatedAt: serverTimestamp(),
      battleLog: arrayUnion(
        `⚠️ Incomplete sprint penalty: −${penalty} vault PP for ${newlyPenalized.length} player(s) on "${sprint.title}" (not marked complete).`
      ),
    });

    return { ok: true, penalized: newlyPenalized.length };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
