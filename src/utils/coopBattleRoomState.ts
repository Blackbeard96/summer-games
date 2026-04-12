import { DEFAULT_MAX_ALLIED_PARTICIPANTS } from '../constants/coopBattle';
import type { CoopParticipantRecord, CoopParticipantStatus } from '../types/coopBattle';

export type JoinEligibilityReason =
  | 'ok'
  | 'not_authenticated'
  | 'battle_ended'
  | 'battle_full'
  | 'already_in_battle'
  | 'not_joinable'
  | 'no_room';

export function getJoinEligibility(params: {
  uid: string | undefined;
  roomStatus: string | undefined;
  players: string[] | undefined;
  joinableMidBattle: boolean | undefined;
  participantCap: number | undefined;
}): { ok: boolean; reason: JoinEligibilityReason } {
  if (!params.uid) return { ok: false, reason: 'not_authenticated' };
  const status = params.roomStatus || 'active';
  if (status !== 'active' && status !== 'wave_complete') {
    return { ok: false, reason: 'battle_ended' };
  }
  if (!params.joinableMidBattle) return { ok: false, reason: 'not_joinable' };
  const cap = params.participantCap ?? DEFAULT_MAX_ALLIED_PARTICIPANTS;
  const players = params.players || [];
  if (players.includes(params.uid)) return { ok: false, reason: 'already_in_battle' };
  if (players.length >= cap) return { ok: false, reason: 'battle_full' };
  return { ok: true, reason: 'ok' };
}

/** Next ally-side turn order = active human UIDs + stable NPC ids (Firestore snapshot). */
export function rebuildAllyTurnOrderSnapshot(params: {
  players: string[];
  npcAllies: Array<{ participantId: string }> | undefined;
  participantRecords: Record<string, CoopParticipantRecord> | undefined;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const uid of params.players) {
    const st = params.participantRecords?.[uid]?.status;
    if (st === 'left') continue;
    if (!seen.has(uid)) {
      seen.add(uid);
      out.push(uid);
    }
  }
  for (const n of params.npcAllies || []) {
    if (!n.participantId || seen.has(n.participantId)) continue;
    const st = params.participantRecords?.[n.participantId]?.status;
    if (st === 'left' || st === 'defeated') continue;
    seen.add(n.participantId);
    out.push(n.participantId);
  }
  return out;
}

export function markParticipantStatus(
  records: Record<string, CoopParticipantRecord> | undefined,
  participantId: string,
  status: CoopParticipantStatus
): Record<string, CoopParticipantRecord> {
  const prev = records || {};
  const row = prev[participantId];
  const next = { ...prev };
  next[participantId] = {
    participantId,
    type: row?.type || 'player',
    userId: row?.userId ?? null,
    displayName: row?.displayName || 'Unknown',
    team: row?.team || 'allies',
    status,
    sourceId: row?.sourceId,
    avatarUrl: row?.avatarUrl,
    joinedAtRound: row?.joinedAtRound,
    joinedAtTurn: row?.joinedAtTurn,
    aiControlled: row?.aiControlled,
    canReceiveRewards: row?.canReceiveRewards,
    contributed: row?.contributed,
    joinedAt: row?.joinedAt,
  };
  return next;
}
