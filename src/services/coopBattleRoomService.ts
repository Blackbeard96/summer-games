import {
  arrayRemove,
  arrayUnion,
  doc,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { DEFAULT_MAX_ALLIED_PARTICIPANTS } from '../constants/coopBattle';
import type { CoopParticipantRecord, NpcAllyBattleInstance } from '../types/coopBattle';
import { markParticipantStatus, rebuildAllyTurnOrderSnapshot } from '../utils/coopBattleRoomState';

const ISLAND_RAID_BATTLE_ROOMS = 'islandRaidBattleRooms';

function logCoop(event: string, payload: Record<string, unknown>) {
  if (process.env.REACT_APP_DEBUG_COOP_BATTLE !== 'true') return;
  // eslint-disable-next-line no-console
  console.log(`[coopBattle] ${event}`, payload);
}

/** Built-in mission/raid NPC ally template (no extra admin doc required). */
export const DEFAULT_NPC_ALLY_TEMPLATES: Record<
  string,
  Omit<NpcAllyBattleInstance, 'participantId'>
> = {
  support_drone: {
    templateId: 'support_drone',
    displayName: 'Support Drone',
    avatarUrl: '/images/Forge Token.png',
    level: 6,
    currentPP: 180,
    maxPP: 180,
    shieldStrength: 40,
    maxShieldStrength: 40,
    aiProfile: 'support',
    battleMoves: [
      {
        id: 'drone_patch',
        name: 'Shield Patch',
        type: 'defense',
        shieldBoost: 25,
        damage: 0,
        cooldown: 0,
        cost: 0,
        description: 'Bolster an ally shield.',
      },
      {
        id: 'drone_zap',
        name: 'Focus Zap',
        type: 'attack',
        damage: 35,
        cooldown: 0,
        cost: 0,
        description: 'Light ranged strike.',
      },
    ],
  },
};

export async function transactionJoinIslandRaidBattleRoom(params: {
  db: Firestore;
  gameId: string;
  uid: string;
  displayName: string;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const { db, gameId, uid, displayName } = params;
  const ref = doc(db, ISLAND_RAID_BATTLE_ROOMS, gameId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('NO_ROOM');
      const d = snap.data() as Record<string, unknown>;
      const status = String(d.status || 'active');
      if (status !== 'active' && status !== 'wave_complete') throw new Error('ENDED');
      if (d.joinableMidBattle !== true) throw new Error('NOT_JOINABLE');
      const players = Array.isArray(d.players) ? ([...d.players] as string[]) : [];
      if (players.includes(uid)) {
        logCoop('join_idempotent', { gameId, uid });
        return;
      }
      const cap =
        typeof d.participantCap === 'number' && d.participantCap > 0
          ? d.participantCap
          : DEFAULT_MAX_ALLIED_PARTICIPANTS;
      const npcAlliesExisting = [...((d.npcAllies as NpcAllyBattleInstance[]) || [])];
      if (players.length + npcAlliesExisting.length >= cap) throw new Error('FULL');

      const nextPlayers = [...players, uid];
      const pr = { ...((d.participantRecords as Record<string, CoopParticipantRecord>) || {}) };
      const roundNumber = typeof d.roundNumber === 'number' ? d.roundNumber : 1;
      pr[uid] = {
        participantId: uid,
        type: 'player',
        userId: uid,
        displayName: displayName || 'Player',
        team: 'allies',
        status: 'active',
        joinedAtRound: roundNumber,
        canReceiveRewards: true,
        contributed: false,
      };
      const npcAllies = npcAlliesExisting;
      const allyTurnOrderSnapshot = rebuildAllyTurnOrderSnapshot({
        players: nextPlayers,
        npcAllies,
        participantRecords: pr,
      });
      const line = `${displayName || 'Player'} joined the battle.`;
      tx.update(ref, {
        players: arrayUnion(uid),
        participantRecords: pr,
        allyTurnOrderSnapshot,
        battleEventLog: arrayUnion(line),
        updatedAt: serverTimestamp(),
      });
      logCoop('join_ok', { gameId, uid, cap: nextPlayers.length });
    });
    return { ok: true };
  } catch (e) {
    const code = e instanceof Error ? e.message : 'UNKNOWN';
    logCoop('join_fail', { gameId, uid, code });
    return { ok: false, code };
  }
}

export async function transactionLeaveIslandRaidBattleRoom(params: {
  db: Firestore;
  gameId: string;
  uid: string;
  displayName: string;
}): Promise<{ ok: true } | { ok: false; code: string }> {
  const { db, gameId, uid, displayName } = params;
  const ref = doc(db, ISLAND_RAID_BATTLE_ROOMS, gameId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('NO_ROOM');
      const d = snap.data() as Record<string, unknown>;
      const players = Array.isArray(d.players) ? (d.players as string[]) : [];
      if (!players.includes(uid)) {
        logCoop('leave_idempotent', { gameId, uid });
        return;
      }
      const pr = markParticipantStatus(
        (d.participantRecords as Record<string, CoopParticipantRecord>) || {},
        uid,
        'left'
      );
      const nextPlayers = players.filter((p) => p !== uid);
      const hostPlayerId = (d.hostPlayerId as string) || players[0];
      let nextHost = hostPlayerId;
      if (hostPlayerId === uid && nextPlayers.length > 0) {
        nextHost = nextPlayers[0];
      }
      const npcAllies = (d.npcAllies as NpcAllyBattleInstance[]) || [];
      const allyTurnOrderSnapshot = rebuildAllyTurnOrderSnapshot({
        players: nextPlayers,
        npcAllies,
        participantRecords: pr,
      });
      const line = `${displayName || 'Player'} left the battle.`;
      const humansLeft = nextPlayers.length;
      const npcList = [...((d.npcAllies as NpcAllyBattleInstance[]) || [])];
      const npcLeft = npcList.length;
      const abandoned = humansLeft === 0 && npcLeft === 0 && d.joinableMidBattle === true;
      const updates: Record<string, unknown> = {
        players: arrayRemove(uid),
        participantRecords: pr,
        hostPlayerId: nextHost,
        allyTurnOrderSnapshot,
        battleEventLog: abandoned
          ? arrayUnion(line, 'All allies have left; battle ended.')
          : arrayUnion(line),
        updatedAt: serverTimestamp(),
      };
      if (abandoned) {
        updates.status = 'defeated';
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx.update(ref, updates as any);
      logCoop('leave_ok', { gameId, uid, humansLeft, npcLeft });
    });
    return { ok: true };
  } catch (e) {
    const code = e instanceof Error ? e.message : 'UNKNOWN';
    return { ok: false, code };
  }
}

export async function transactionAddNpcAllyToBattle(params: {
  db: Firestore;
  gameId: string;
  requesterUid: string;
  templateId: string;
}): Promise<{ ok: true; participantId: string } | { ok: false; code: string }> {
  const { db, gameId, requesterUid, templateId } = params;
  const ref = doc(db, ISLAND_RAID_BATTLE_ROOMS, gameId);
  const template = DEFAULT_NPC_ALLY_TEMPLATES[templateId];
  if (!template) return { ok: false, code: 'UNKNOWN_TEMPLATE' };
  const participantId = `npc-ally-${templateId}-${Date.now()}`;
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('NO_ROOM');
      const d = snap.data() as Record<string, unknown>;
      const status = String(d.status || 'active');
      if (status !== 'active' && status !== 'wave_complete') throw new Error('ENDED');
      if (d.allowNpcAllies !== true) throw new Error('NPC_NOT_ALLOWED');
      const players = Array.isArray(d.players) ? (d.players as string[]) : [];
      if (!players.includes(requesterUid)) throw new Error('NOT_IN_BATTLE');
      const npcAllies = [...((d.npcAllies as NpcAllyBattleInstance[]) || [])];
      const maxNpc = typeof d.maxNpcAllies === 'number' ? d.maxNpcAllies : 2;
      if (npcAllies.length >= maxNpc) throw new Error('NPC_CAP');
      const cap =
        typeof d.participantCap === 'number' && d.participantCap > 0
          ? d.participantCap
          : DEFAULT_MAX_ALLIED_PARTICIPANTS;
      if (players.length + npcAllies.length + 1 > cap) throw new Error('FULL');

      const instance: NpcAllyBattleInstance = { ...template, participantId };
      npcAllies.push(instance);
      const pr = { ...((d.participantRecords as Record<string, CoopParticipantRecord>) || {}) };
      pr[participantId] = {
        participantId,
        type: 'allyNpc',
        userId: null,
        sourceId: templateId,
        displayName: template.displayName,
        team: 'allies',
        status: 'active',
        aiControlled: true,
        canReceiveRewards: false,
        contributed: false,
        joinedAtRound: typeof d.roundNumber === 'number' ? d.roundNumber : 1,
      };
      const allyTurnOrderSnapshot = rebuildAllyTurnOrderSnapshot({
        players,
        npcAllies,
        participantRecords: pr,
      });
      const line = `${template.displayName} entered the battle.`;
      tx.update(ref, {
        npcAllies,
        participantRecords: pr,
        allyTurnOrderSnapshot,
        battleEventLog: arrayUnion(line),
        updatedAt: serverTimestamp(),
      });
    });
    return { ok: true, participantId };
  } catch (e) {
    const code = e instanceof Error ? e.message : 'UNKNOWN';
    return { ok: false, code };
  }
}
