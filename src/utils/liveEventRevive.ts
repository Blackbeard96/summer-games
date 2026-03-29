/**
 * Revive Potion: restore an eliminated teammate in a Live Event (inSessionRooms).
 */

import { db } from '../firebase';
import { doc, getDoc, runTransaction, serverTimestamp, updateDoc, deleteField } from 'firebase/firestore';
import { debug, debugError } from './inSessionDebug';

export const REVIVE_POTION_NAMES = ['Revive Potion', 'Revivie Potion'] as const;

export function isRevivePotionName(name: string): boolean {
  return REVIVE_POTION_NAMES.includes(name as (typeof REVIVE_POTION_NAMES)[number]);
}

type SessionPlayerLike = {
  userId: string;
  displayName?: string;
  eliminated?: boolean;
  eliminatedBy?: string;
  hp?: number;
  maxHp?: number;
  level?: number;
  shield?: number;
  maxShield?: number;
  /** Session PP balance (Live Event MST MKT / rewards). */
  powerPoints?: number;
};

/** Mutates row: clears elimination and sets HP from percent of max (1–100). */
export function reviveEliminatedSessionPlayerRow(target: SessionPlayerLike, hpPercent: number = 50): number {
  const pct = Math.max(1, Math.min(100, Math.floor(hpPercent)));
  const maxHp = target.maxHp ?? Math.max(100, (target.level || 1) * 10);
  const newHp = Math.max(1, Math.floor((maxHp * pct) / 100));
  target.eliminated = false;
  delete target.eliminatedBy;
  target.maxHp = maxHp;
  target.hp = newHp;
  const maxShield = target.maxShield ?? 100;
  target.shield = 0;
  target.maxShield = maxShield;
  return newHp;
}

export async function applyRevivePotionInLiveEvent(
  sessionId: string,
  actorUid: string,
  actorName: string,
  targetUid: string,
  targetName: string,
  options?: { hpPercent?: number }
): Promise<{ ok: boolean; error?: string }> {
  const hpPct = options?.hpPercent != null ? Math.max(1, Math.min(100, Math.floor(options.hpPercent))) : 50;
  try {
    await runTransaction(db, async (transaction) => {
      const sessionRef = doc(db, 'inSessionRooms', sessionId);
      const sessionDoc = await transaction.get(sessionRef);
      if (!sessionDoc.exists()) {
        throw new Error('Session not found');
      }
      const data = sessionDoc.data();
      const status = data.status;
      if (status !== 'live' && status !== 'active') {
        throw new Error('Session is not active');
      }

      const players = [...(data.players || [])];
      const tIdx = players.findIndex((p: { userId?: string }) => p.userId === targetUid);
      const aIdx = players.findIndex((p: { userId?: string }) => p.userId === actorUid);
      if (tIdx < 0) throw new Error('Target is not in this session');
      if (aIdx < 0) throw new Error('You are not in this session');

      const selfRevive = actorUid === targetUid;
      const actor = players[aIdx] as { eliminated?: boolean };

      if (selfRevive) {
        if (!actor.eliminated) {
          throw new Error('You are not eliminated — revive yourself only when eliminated, or use a potion on a teammate.');
        }
        const target = { ...(players[tIdx] as Record<string, unknown>) } as SessionPlayerLike;
        if (target.userId !== actorUid) throw new Error('Invalid self-revive target');
        const newHp = reviveEliminatedSessionPlayerRow(target, hpPct);
        const maxHp = target.maxHp ?? 100;
        players[tIdx] = target as (typeof players)[number];
        const battleLog = [...(data.battleLog || [])];
        battleLog.push(
          `💚 ${actorName} used a Revive Potion and returned at ${newHp}/${maxHp} HP!`
        );
        transaction.update(sessionRef, {
          players,
          battleLog,
          updatedAt: serverTimestamp(),
        });
        return;
      }

      if (actor.eliminated) {
        throw new Error('Eliminated players cannot revive others — use a Revive Potion on yourself if you have one.');
      }

      const target = { ...(players[tIdx] as Record<string, unknown>) } as SessionPlayerLike;
      if (!target.eliminated) throw new Error('That player is not eliminated');

      const newHp = reviveEliminatedSessionPlayerRow(target, hpPct);
      const maxHp = target.maxHp ?? 100;
      players[tIdx] = target as (typeof players)[number];

      const battleLog = [...(data.battleLog || [])];
      battleLog.push(
        `💚 ${actorName} used a Revive Potion on ${targetName}! They return with ${newHp}/${maxHp} HP.`
      );

      transaction.update(sessionRef, {
        players,
        battleLog,
        updatedAt: serverTimestamp(),
      });
    });

    await clearLiveEventEliminationStats(sessionId, targetUid);
    debug('liveEventRevive', `Revived ${targetUid} in ${sessionId}`);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    debugError('liveEventRevive', 'applyRevivePotionInLiveEvent', e);
    return { ok: false, error: msg };
  }
}

/** Exported for MST MKT self-revive and other live-event flows. */
export async function clearLiveEventEliminationStats(sessionId: string, targetUid: string): Promise<void> {
  try {
    const statsRef = doc(db, 'inSessionRooms', sessionId, 'stats', targetUid);
    const statsDoc = await getDoc(statsRef);
    if (statsDoc.exists()) {
      await updateDoc(statsRef, {
        isEliminated: false,
        eliminatedBy: deleteField()
      });
    }
  } catch (e) {
    debugError('liveEventRevive', 'clearEliminationStats', e);
  }
}
