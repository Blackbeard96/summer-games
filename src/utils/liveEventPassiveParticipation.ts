/**
 * Live Event passive Participation Power: +1 `movesEarned` every 2 minutes of session time
 * (in addition to admin taps, quizzes, etc.). Uses `participationPassiveStartedAtMs` on each
 * session player row as the accrual clock anchor.
 */

import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const MS_PER_GRANT = 120_000;
/** Max whole grant periods to apply in one transaction (catch-up without huge single writes). */
const MAX_GRANTS_PER_TICK = 120;

export type PassiveParticipationUi = {
  fillPct: number;
  secondsToNext: number;
  /** Whole passive grant periods completed since anchor (each period is 2 minutes). */
  grantsBanked: number;
};

/**
 * UI state for the progress bar toward the next passive +1.
 * `grantsBanked` is whole periods accrued since anchor (may already be reflected in `movesEarned` after sync).
 */
export function getPassiveParticipationUi(
  startedAtMs: number | undefined,
  nowMs: number
): PassiveParticipationUi | null {
  if (startedAtMs == null || !Number.isFinite(startedAtMs) || startedAtMs <= 0) return null;
  const elapsed = Math.max(0, nowMs - startedAtMs);
  const grantsBanked = Math.floor(elapsed / MS_PER_GRANT);
  const msInto = elapsed % MS_PER_GRANT;
  const fillPct = Math.min(100, (msInto / MS_PER_GRANT) * 100);
  const secondsToNext = Math.max(0, Math.ceil((MS_PER_GRANT - msInto) / 1000));
  return { fillPct, secondsToNext, grantsBanked };
}

function fmtClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `0:${s.toString().padStart(2, '0')}`;
}

export function formatPassiveParticipationCountdown(ui: PassiveParticipationUi | null): string {
  if (!ui) return '—';
  if (ui.secondsToNext <= 0) return '0:00';
  return fmtClock(ui.secondsToNext);
}

/**
 * Credits whole passive periods (2 minutes each) since `participationPassiveStartedAtMs`,
 * advancing the anchor so grants stay idempotent under concurrent callers.
 */
export async function tryCreditLiveEventPassiveParticipation(
  sessionId: string,
  userId: string
): Promise<{ credited: number } | null> {
  const sessionRef = doc(db, 'inSessionRooms', sessionId);
  try {
    const credited = await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(sessionRef);
      if (!snap.exists()) return 0;
      const data = snap.data() as { status?: string; players?: Array<Record<string, unknown>> };
      const status = data.status;
      if (status !== 'live' && status !== 'active') return 0;

      const players = [...(data.players || [])];
      const idx = players.findIndex((p) => p && (p as { userId?: string }).userId === userId);
      if (idx < 0) return 0;

      const row = { ...(players[idx] as Record<string, unknown>) };
      const now = Date.now();

      let started = row.participationPassiveStartedAtMs;
      if (typeof started !== 'number' || !Number.isFinite(started) || started <= 0) {
        row.participationPassiveStartedAtMs = now;
        players[idx] = row;
        transaction.update(sessionRef, {
          players,
          updatedAt: serverTimestamp(),
        });
        return 0;
      }

      const elapsed = now - started;
      const wholePeriods = Math.floor(elapsed / MS_PER_GRANT);
      if (wholePeriods < 1) return 0;

      const toCredit = Math.min(wholePeriods, MAX_GRANTS_PER_TICK);
      const moves = Math.max(0, Math.floor(Number(row.movesEarned) || 0));
      row.movesEarned = moves + toCredit;
      row.participationPassiveStartedAtMs = started + toCredit * MS_PER_GRANT;
      players[idx] = row;

      transaction.update(sessionRef, {
        players,
        updatedAt: serverTimestamp(),
      });
      return toCredit;
    });
    return { credited };
  } catch (e) {
    console.warn('[liveEventPassiveParticipation] tryCredit failed:', e);
    return null;
  }
}
