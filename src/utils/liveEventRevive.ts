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

export async function applyRevivePotionInLiveEvent(
  sessionId: string,
  actorUid: string,
  actorName: string,
  targetUid: string,
  targetName: string
): Promise<{ ok: boolean; error?: string }> {
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
      if (actorUid === targetUid) throw new Error('You cannot revive yourself');

      const actor = players[aIdx] as { eliminated?: boolean };
      if (actor.eliminated) throw new Error('Eliminated players cannot use a Revive Potion');

      const target = { ...(players[tIdx] as Record<string, unknown>) } as {
        userId: string;
        displayName?: string;
        eliminated?: boolean;
        eliminatedBy?: string;
        hp?: number;
        maxHp?: number;
        level?: number;
        shield?: number;
        maxShield?: number;
      };

      if (!target.eliminated) throw new Error('That player is not eliminated');

      const maxHp = target.maxHp ?? Math.max(100, (target.level || 1) * 10);
      const newHp = Math.max(1, Math.floor(maxHp * 0.5));

      target.eliminated = false;
      delete target.eliminatedBy;
      target.maxHp = maxHp;
      target.hp = newHp;
      const maxShield = target.maxShield ?? 100;
      target.shield = 0;
      target.maxShield = maxShield;

      players[tIdx] = target;

      const battleLog = [...(data.battleLog || [])];
      battleLog.push(
        `💚 ${actorName} used a Revive Potion on ${targetName}! They return with ${newHp}/${maxHp} HP.`
      );

      transaction.update(sessionRef, {
        players,
        battleLog,
        updatedAt: serverTimestamp()
      });
    });

    await clearEliminationStats(sessionId, targetUid);
    debug('liveEventRevive', `Revived ${targetUid} in ${sessionId}`);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    debugError('liveEventRevive', 'applyRevivePotionInLiveEvent', e);
    return { ok: false, error: msg };
  }
}

async function clearEliminationStats(sessionId: string, targetUid: string): Promise<void> {
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
