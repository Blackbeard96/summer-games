/**
 * Live Event Game Time controls — OPEN / PAUSE / END + Online/Offline participation.
 * Builds on inSessionRooms; does not replace Live Event modes.
 */

import { doc, getDoc, updateDoc, serverTimestamp, type UpdateData } from 'firebase/firestore';
import { db } from '../firebase';
import type { InSessionRoom, InSessionPlayer } from '../types/inSession';

export type GameTimeStatus = 'closed' | 'open' | 'paused' | 'ended';
export type ParticipationMode = 'online' | 'offline';

export async function setGameTimeStatus(
  sessionId: string,
  status: GameTimeStatus,
  extras?: { workPeriodId?: string | null; offlineSiegeEnabled?: boolean }
): Promise<void> {
  const ref = doc(db, 'inSessionRooms', sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Session not found');
  const prev = (snap.data() as InSessionRoom).gameTime || { status: 'closed' as const };
  const gameTime: Record<string, unknown> = {
    ...prev,
    status,
  };
  if (extras?.workPeriodId !== undefined) gameTime.workPeriodId = extras.workPeriodId;
  if (extras?.offlineSiegeEnabled !== undefined) {
    gameTime.offlineSiegeEnabled = extras.offlineSiegeEnabled;
  }
  if (status === 'open') gameTime.openedAt = serverTimestamp();
  if (status === 'paused') gameTime.pausedAt = serverTimestamp();
  if (status === 'ended') gameTime.endedAt = serverTimestamp();

  const patch: UpdateData<InSessionRoom> = {
    gameTime: gameTime as InSessionRoom['gameTime'],
    updatedAt: serverTimestamp(),
  };
  await updateDoc(ref, patch);
}

export async function setPlayerParticipationMode(
  sessionId: string,
  userId: string,
  mode: ParticipationMode
): Promise<void> {
  const ref = doc(db, 'inSessionRooms', sessionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Session not found');
  const data = snap.data() as InSessionRoom;
  const players = [...(data.players || [])] as InSessionPlayer[];
  const idx = players.findIndex((p) => p.userId === userId);
  if (idx < 0) throw new Error('Player not in session');
  const row = { ...players[idx] };
  row.participationMode = mode;
  if (row.liveEventStartingPP == null) {
    row.liveEventStartingPP = Math.max(0, Math.floor(Number(row.powerPoints) || 0));
  }
  players[idx] = row;
  await updateDoc(ref, { players, updatedAt: serverTimestamp() });
}

/** Protection floor = floor(startingPP / 9). Used by Offline Siege (Phase 2). */
export function computeSiegeProtectionFloor(
  startingPP: number,
  fractionDenominator = 9
): number {
  const pp = Math.max(0, Math.floor(Number(startingPP) || 0));
  const d = Math.max(1, Math.floor(fractionDenominator) || 9);
  return Math.floor(pp / d);
}

export type GameTimeRosterRow = {
  userId: string;
  displayName: string;
  participationMode: ParticipationMode | 'online' | 'offline' | 'unknown';
  connected: boolean;
  powerPoints: number;
  liveEventStartingPP: number;
  protectionFloor: number;
  participationCount: number;
  eliminated: boolean;
};

export function buildGameTimeRoster(
  session: InSessionRoom,
  presenceByUid?: Record<string, { connected?: boolean }>
): GameTimeRosterRow[] {
  return (session.players || []).map((p) => {
    const start = Math.max(
      0,
      Math.floor(Number(p.liveEventStartingPP ?? p.powerPoints) || 0)
    );
    return {
      userId: p.userId,
      displayName: p.displayName || 'Player',
      participationMode: p.participationMode || 'online',
      connected: Boolean(presenceByUid?.[p.userId]?.connected),
      powerPoints: Math.max(0, Math.floor(Number(p.powerPoints) || 0)),
      liveEventStartingPP: start,
      protectionFloor: computeSiegeProtectionFloor(start),
      participationCount: Math.max(0, Number(p.participationCount) || 0),
      eliminated: Boolean(p.eliminated),
    };
  });
}
