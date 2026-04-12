import React, { useMemo, useState } from 'react';
import type { IslandRaidBattleRoom } from '../../types/islandRaid';
import { DEFAULT_MAX_ALLIED_PARTICIPANTS } from '../../constants/coopBattle';
import { getJoinEligibility } from '../../utils/coopBattleRoomState';
import {
  transactionAddNpcAllyToBattle,
  transactionJoinIslandRaidBattleRoom,
} from '../../services/coopBattleRoomService';
import { db } from '../../firebase';

export interface CoopBattleRosterPanelProps {
  gameId: string;
  battleRoom: IslandRaidBattleRoom | null;
  currentUserId: string | undefined;
  displayName: string;
  /** When true, opening user is not auto-added — show Join until they act. */
  needsExplicitJoin: boolean;
  onJoined: () => void;
  onDismissExplicit?: () => void;
}

/**
 * Roster + join CTA + optional NPC ally call for joinable Mission / Island Raid rooms.
 */
const CoopBattleRosterPanel: React.FC<CoopBattleRosterPanelProps> = ({
  gameId,
  battleRoom,
  currentUserId,
  displayName,
  needsExplicitJoin,
  onJoined,
  onDismissExplicit,
}) => {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cap = battleRoom?.participantCap ?? DEFAULT_MAX_ALLIED_PARTICIPANTS;
  const players = battleRoom?.players || [];
  const npcCount = battleRoom?.npcAllies?.length ?? 0;
  const joinable = battleRoom?.joinableMidBattle === true;
  const allowNpc = battleRoom?.allowNpcAllies === true;

  const eligibility = useMemo(
    () =>
      getJoinEligibility({
        uid: currentUserId,
        roomStatus: battleRoom?.status,
        players,
        joinableMidBattle: joinable,
        participantCap: cap,
      }),
    [battleRoom?.status, cap, currentUserId, joinable, players]
  );

  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/island-raid/game/${encodeURIComponent(gameId)}`
      : '';

  const onJoin = async () => {
    if (!currentUserId) return;
    setBusy(true);
    setErr(null);
    const r = await transactionJoinIslandRaidBattleRoom({
      db,
      gameId,
      uid: currentUserId,
      displayName,
    });
    setBusy(false);
    if (!r.ok) {
      setErr(
        r.code === 'FULL'
          ? 'Battle full.'
          : r.code === 'ENDED'
            ? 'Battle already ended.'
            : r.code === 'NOT_JOINABLE'
              ? 'This battle is not open for joining.'
              : r.code === 'NO_ROOM'
                ? 'Battle room not found.'
                : `Could not join (${r.code}).`
      );
      return;
    }
    onJoined();
  };

  const onCallSupportDrone = async () => {
    if (!currentUserId) return;
    setBusy(true);
    setErr(null);
    const r = await transactionAddNpcAllyToBattle({
      db,
      gameId,
      requesterUid: currentUserId,
      templateId: 'support_drone',
    });
    setBusy(false);
    if (!r.ok) {
      const map: Record<string, string> = {
        NPC_NOT_ALLOWED: 'NPC allies are disabled for this battle.',
        NPC_CAP: 'Maximum NPC allies already in battle.',
        FULL: 'Party is full.',
        NOT_IN_BATTLE: 'You must be in the battle to call an ally.',
        UNKNOWN_TEMPLATE: 'Unknown ally template.',
      };
      setErr(map[r.code] || `Could not add ally (${r.code}).`);
      return;
    }
  };

  if (!battleRoom || !joinable) return null;

  return (
    <div
      style={{
        margin: '0 1rem 1rem',
        padding: '1rem',
        background: 'rgba(255,255,255,0.95)',
        borderRadius: '0.75rem',
        border: '1px solid rgba(99,102,241,0.35)',
        boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#1e293b' }}>Co-op roster</div>
      <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.75rem' }}>
        Allies: {players.length + npcCount}/{cap} • Host:{' '}
        <span style={{ fontFamily: 'monospace' }}>{(battleRoom as { hostPlayerId?: string }).hostPlayerId || '—'}</span>
      </div>
      {needsExplicitJoin && (
        <div
          style={{
            padding: '0.75rem',
            marginBottom: '0.75rem',
            background: 'rgba(99,102,241,0.08)',
            borderRadius: '0.5rem',
          }}
        >
          <div style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            This battle uses <strong>explicit join</strong>. You are not on the roster yet.
          </div>
          <button
            type="button"
            disabled={busy || !eligibility.ok}
            onClick={onJoin}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: busy || !eligibility.ok ? 'not-allowed' : 'pointer',
              background: eligibility.ok ? '#4f46e5' : '#94a3b8',
              color: 'white',
              fontWeight: 600,
            }}
          >
            {busy ? 'Joining…' : 'Join battle'}
          </button>
          {!eligibility.ok && (
            <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#b91c1c' }}>
              {eligibility.reason === 'battle_full'
                ? 'Battle full.'
                : eligibility.reason === 'battle_ended'
                  ? 'Battle ended.'
                  : eligibility.reason === 'already_in_battle'
                    ? 'You are already in this battle.'
                    : `Cannot join (${eligibility.reason}).`}
            </div>
          )}
          {onDismissExplicit && (
            <button
              type="button"
              onClick={onDismissExplicit}
              style={{ marginLeft: '0.5rem', fontSize: '0.8rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
            >
              Dismiss
            </button>
          )}
        </div>
      )}

      {currentUserId && players.includes(currentUserId) && allowNpc && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.85rem', marginBottom: '0.35rem', color: '#334155' }}>NPC ally</div>
          <button
            type="button"
            disabled={busy}
            onClick={onCallSupportDrone}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: '0.45rem',
              border: '1px solid #6366f1',
              background: 'white',
              color: '#4338ca',
              cursor: busy ? 'wait' : 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Call Support Drone
          </button>
        </div>
      )}

      <div style={{ fontSize: '0.78rem', color: '#64748b', wordBreak: 'break-all' }}>
        <strong>Invite link:</strong> {shareUrl}
      </div>
      {err && <div style={{ marginTop: '0.5rem', color: '#b91c1c', fontSize: '0.85rem' }}>{err}</div>}
    </div>
  );
};

export default CoopBattleRosterPanel;
