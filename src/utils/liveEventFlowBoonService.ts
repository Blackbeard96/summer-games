/**
 * Flow State boon selection + immediate rewards (Live Event session player row).
 */

import { arrayUnion, doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { FlowBoonId, FlowBoonThreshold } from '../types/liveEventFlowBoons';
import { creditPPToStudentUserVault, trackParticipation } from './inSessionStatsService';
import {
  flowStateToFirestore,
  getFlowBoonSelectionFeedback,
  getNextUnclaimedBoonThreshold,
  isValidBoonForThreshold,
  mergeFlowBoonSelection,
  parseFlowStateFromPlayerRow,
} from './liveEventFlowBoons';

export async function grantParticipationWithoutStreak(
  sessionId: string,
  playerId: string,
  participationAmount: number,
  playerDisplayName?: string
): Promise<boolean> {
  if (participationAmount <= 0) return true;
  return trackParticipation(sessionId, playerId, participationAmount, {
    playerDisplayName,
    skipStreakIncrement: true,
  });
}

export async function grantImmediateFlowPp(
  sessionId: string,
  playerId: string,
  amount: number
): Promise<void> {
  if (amount <= 0) return;
  const sessionRef = doc(db, 'inSessionRooms', sessionId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(sessionRef);
    if (!snap.exists()) return;
    const players = [...((snap.data()?.players || []) as Array<Record<string, unknown>>)];
    const idx = players.findIndex((p) => p?.userId === playerId);
    if (idx < 0) return;
    const row = { ...players[idx] };
    row.powerPoints = Math.max(0, (Number(row.powerPoints) || 0) + amount);
    players[idx] = row;
    tx.update(sessionRef, { players, updatedAt: serverTimestamp() });
  });
  try {
    await creditPPToStudentUserVault(playerId, amount);
  } catch {
    /* non-fatal — session PP still updated */
  }
}

async function applyImmediateBoonRewards(
  sessionId: string,
  playerId: string,
  boonId: FlowBoonId,
  displayName?: string
): Promise<void> {
  switch (boonId) {
    case 'bonus_participation_points':
      await grantParticipationWithoutStreak(sessionId, playerId, 3, displayName);
      break;
    case 'increase_power_points_300':
      await grantImmediateFlowPp(sessionId, playerId, 300);
      break;
    case 'increase_power_points_1000':
      await grantImmediateFlowPp(sessionId, playerId, 1000);
      break;
    default:
      break;
  }
}

/**
 * Player selects a boon for a pending streak threshold. Idempotent per threshold (claimedThresholds).
 */
export async function selectFlowStateBoon(
  sessionId: string,
  playerId: string,
  threshold: FlowBoonThreshold,
  boonId: FlowBoonId,
  displayName?: string
): Promise<{ ok: true; feedback: string } | { ok: false; error: string }> {
  if (!isValidBoonForThreshold(threshold, boonId)) {
    return { ok: false, error: 'Invalid boon for this streak tier.' };
  }

  let successStreak = 0;
  let logLine: string | null = null;

  try {
    const sessionRef = doc(db, 'inSessionRooms', sessionId);
    const txResult = await runTransaction(db, async (tx) => {
      const snap = await tx.get(sessionRef);
      if (!snap.exists()) return { ok: false as const, error: 'Session not found.' };

      const players = [...((snap.data()?.players || []) as Array<Record<string, unknown>>)];
      const idx = players.findIndex((p) => p?.userId === playerId);
      if (idx < 0) return { ok: false as const, error: 'Player not in session.' };

      const row = { ...players[idx] };
      const flow = parseFlowStateFromPlayerRow(row);
      successStreak = num(row.successStreak);

      if (successStreak < threshold) {
        return { ok: false as const, error: `Need a ${threshold}-success streak to claim this boon.` };
      }
      if (flow.claimedThresholds.includes(threshold)) {
        return { ok: false as const, error: 'You already claimed a boon for this streak tier.' };
      }
      const pending = flow.pendingThreshold;
      if (pending != null && pending !== threshold) {
        return { ok: false as const, error: 'Choose the boon for your current Flow tier first.' };
      }

      const merged = mergeFlowBoonSelection(flow, threshold, boonId);
      const nextPending = getNextUnclaimedBoonThreshold(successStreak, merged);
      merged.pendingThreshold = nextPending;

      row.flowState = flowStateToFirestore(merged);
      row.flowStateActive = true;
      players[idx] = row;

      const feedback = getFlowBoonSelectionFeedback(boonId);
      logLine = `✨ ${displayName || 'Player'} — Flow State: ${feedback}`;

      tx.update(sessionRef, {
        players,
        updatedAt: serverTimestamp(),
      });
      return { ok: true as const };
    });

    if (!txResult.ok) return txResult;

    await applyImmediateBoonRewards(sessionId, playerId, boonId, displayName);

    if (logLine) {
      await updateDoc(doc(db, 'inSessionRooms', sessionId), {
        battleLog: arrayUnion(logLine),
        updatedAt: serverTimestamp(),
      }).catch(() => undefined);
    }

    return { ok: true, feedback: getFlowBoonSelectionFeedback(boonId) };
  } catch (e) {
    console.error('selectFlowStateBoon', e);
    return { ok: false, error: 'Could not save boon. Try again.' };
  }
}

function num(v: unknown): number {
  return Math.max(0, Math.floor(Number(v) || 0));
}

/** Read parsed flow state for a player (client / scoring helpers). */
export async function getPlayerFlowStateFromSession(
  sessionId: string,
  playerId: string
): Promise<ReturnType<typeof parseFlowStateFromPlayerRow> | null> {
  try {
    const { getDoc } = await import('firebase/firestore');
    const snap = await getDoc(doc(db, 'inSessionRooms', sessionId));
    if (!snap.exists()) return null;
    const players = (snap.data()?.players || []) as Array<Record<string, unknown>>;
    const row = players.find((p) => p?.userId === playerId);
    if (!row) return null;
    return parseFlowStateFromPlayerRow(row);
  } catch {
    return null;
  }
}

export { parseFlowStateFromPlayerRow, applyFlowPpRewardMultiplier, applyFlowQuestionPointMultiplier } from './liveEventFlowBoons';
