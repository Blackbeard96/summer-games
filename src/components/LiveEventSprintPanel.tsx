import React, { useEffect, useMemo, useState, useCallback } from 'react';
import type { ClassFlowSprintState } from '../types/season1';
import { LIVE_EVENT_PP_PER_PARTICIPATION_POINT } from '../utils/inSessionStatsService';
import {
  startClassFlowSprint,
  closeClassFlowSprint,
  clearClassFlowSprint,
  toggleClassFlowSprintMark,
  grantClassFlowSprintRewards,
  applyClassFlowSprintIncompletePenalties,
} from '../utils/liveEventSprintService';

export interface LiveEventSprintPanelProps {
  sessionId: string;
  sprint: ClassFlowSprintState | null;
  sessionPlayers: { userId: string; displayName: string }[];
  /** Room host — excluded from incomplete PP penalties */
  sessionHostUid?: string;
  isSessionHost: boolean;
  currentUserId: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
}

function endsAtMs(s: ClassFlowSprintState): number {
  const t = s.endsAt as { toMillis?: () => number };
  if (t && typeof t.toMillis === 'function') return t.toMillis();
  if (s.endsAt instanceof Date) return s.endsAt.getTime();
  return 0;
}

const LiveEventSprintPanel: React.FC<LiveEventSprintPanelProps> = ({
  sessionId,
  sprint,
  sessionPlayers,
  sessionHostUid = '',
  isSessionHost,
  currentUserId,
  userEmail,
  userDisplayName,
}) => {
  const [now, setNow] = useState(() => Date.now());
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  /** Sprint window length in minutes (sent to server as seconds). */
  const [durationMinutes, setDurationMinutes] = useState(2);
  const [rewardParticipationPoints, setRewardParticipationPoints] = useState(2);
  const [rewardVaultPP, setRewardVaultPP] = useState(25);
  const [rewardXP, setRewardXP] = useState(10);
  const [incompletePenaltyVaultPP, setIncompletePenaltyVaultPP] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!sprint || sprint.status !== 'live') return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sprint?.id, sprint?.status]);

  const remainingSec = useMemo(() => {
    if (!sprint) return 0;
    const end = endsAtMs(sprint);
    return Math.max(0, Math.ceil((end - now) / 1000));
  }, [sprint, now]);

  const timerExpired = sprint && sprint.status === 'live' && remainingSec <= 0;

  const playerNames = useMemo(() => {
    const m = new Map<string, string>();
    sessionPlayers.forEach((p) => m.set(p.userId, p.displayName || 'Player'));
    return m;
  }, [sessionPlayers]);

  const onStart = useCallback(async () => {
    setMessage(null);
    setBusy(true);
    try {
      const res = await startClassFlowSprint(
        sessionId,
        currentUserId,
        userEmail ?? undefined,
        userDisplayName ?? undefined,
        {
          title,
          description,
          durationSeconds: Math.round(durationMinutes * 60),
          rewardParticipationPoints,
          rewardVaultPP,
          rewardXP,
          incompletePenaltyVaultPP,
        }
      );
      if (!res.ok) setMessage(res.error || 'Could not start sprint');
      else {
        setTitle('');
        setDescription('');
      }
    } finally {
      setBusy(false);
    }
  }, [
    sessionId,
    currentUserId,
    userEmail,
    userDisplayName,
    title,
    description,
    durationMinutes,
    rewardParticipationPoints,
    rewardVaultPP,
    rewardXP,
    incompletePenaltyVaultPP,
  ]);

  const onToggle = useCallback(
    async (uid: string) => {
      setMessage(null);
      const res = await toggleClassFlowSprintMark(
        sessionId,
        currentUserId,
        userEmail ?? undefined,
        userDisplayName ?? undefined,
        uid,
        playerNames.get(uid) || 'Player'
      );
      if (!res.ok) setMessage(res.error || 'Could not update mark or grant rewards');
    },
    [sessionId, currentUserId, userEmail, userDisplayName, playerNames]
  );

  const onClose = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await closeClassFlowSprint(
        sessionId,
        currentUserId,
        userEmail ?? undefined,
        userDisplayName ?? undefined
      );
      if (!res.ok) setMessage(res.error || 'Could not close sprint');
    } finally {
      setBusy(false);
    }
  }, [sessionId, currentUserId, userEmail, userDisplayName]);

  const onGrant = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await grantClassFlowSprintRewards(
        sessionId,
        currentUserId,
        userEmail ?? undefined,
        userDisplayName ?? undefined,
        playerNames
      );
      if (!res.ok) setMessage(res.error || 'Could not grant rewards');
      else if (res.granted === 0) setMessage('No new completions to award (everyone marked may already be paid).');
      else setMessage(`Awarded ${res.granted} player(s).`);
    } finally {
      setBusy(false);
    }
  }, [sessionId, currentUserId, userEmail, userDisplayName, playerNames]);

  const onApplyIncompletePenalties = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await applyClassFlowSprintIncompletePenalties(
        sessionId,
        currentUserId,
        userEmail ?? undefined,
        userDisplayName ?? undefined
      );
      if (!res.ok) setMessage(res.error || 'Could not apply penalties');
      else if (res.penalized === 0) setMessage('No unchecked players left to penalize (or penalty already applied).');
      else setMessage(`Deducted vault PP from ${res.penalized} player(s) who were not marked complete.`);
    } finally {
      setBusy(false);
    }
  }, [sessionId, currentUserId, userEmail, userDisplayName]);

  const onClear = useCallback(async () => {
    if (!window.confirm('Remove this sprint from the room? Host can start a fresh sprint after.')) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await clearClassFlowSprint(
        sessionId,
        currentUserId,
        userEmail ?? undefined,
        userDisplayName ?? undefined
      );
      if (!res.ok) setMessage(res.error || 'Could not clear sprint');
    } finally {
      setBusy(false);
    }
  }, [sessionId, currentUserId, userEmail, userDisplayName]);

  const marked = useMemo(() => new Set(sprint?.markedCompleteUids || []), [sprint?.markedCompleteUids]);
  const granted = useMemo(() => new Set(sprint?.rewardsGrantedUids || []), [sprint?.rewardsGrantedUids]);
  const penaltiesGranted = useMemo(
    () => new Set(sprint?.incompletePenaltiesGrantedUids || []),
    [sprint?.incompletePenaltiesGrantedUids]
  );
  const pendingGrant = sprint
    ? (sprint.markedCompleteUids || []).filter((u) => !granted.has(u)).length
    : 0;
  const pendingPenaltyCount =
    sprint && (sprint.incompletePenaltyVaultPP || 0) > 0
      ? sessionPlayers.filter(
          (p) =>
            p.userId !== sessionHostUid &&
            !marked.has(p.userId) &&
            !penaltiesGranted.has(p.userId)
        ).length
      : 0;

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, #0f766e 0%, #115e59 100%)',
        color: '#f0fdfa',
        borderRadius: '0.75rem',
        padding: '1rem 1.25rem',
        border: '1px solid rgba(255,255,255,0.2)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700 }}>🏃 Class Flow Sprint</h2>
        {sprint && (
          <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
            {sprint.status === 'live' ? (timerExpired ? 'Time window ended' : `Time left: ${fmt(remainingSec)}`) : 'Window closed — award when ready'}
          </span>
        )}
      </div>
      <p style={{ margin: '0.5rem 0 0.75rem', fontSize: '0.85rem', opacity: 0.92, lineHeight: 1.45 }}>
        Host sets a timed goal and checks off students who finish on time. Rewards (session PP, moves, participation stats, and optional vault PP / XP) apply as soon as a student is checked—no separate award step required. Use “Award pending” only to catch anyone who was marked before this update or if a grant failed. Optionally set an incomplete penalty: after the sprint, use “Apply incomplete penalty” to deduct vault PP from everyone in the session who is still unchecked (host excluded).
      </p>

      {message && (
        <div style={{ marginBottom: '0.75rem', fontSize: '0.85rem', color: '#fef08a' }} role="status">
          {message}
        </div>
      )}

      {!sprint && isSessionHost && (
        <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: '0.5rem', padding: '0.85rem' }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: '0.85rem' }}>Sprint goal (title)</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Complete 10 practice problems"
            style={{ width: '100%', padding: '0.45rem', borderRadius: 6, border: '1px solid #94a3b8', marginBottom: 8 }}
          />
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: '0.85rem' }}>Details (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What “done” means for this sprint"
            style={{ width: '100%', padding: '0.45rem', borderRadius: 6, border: '1px solid #94a3b8', marginBottom: 8, resize: 'vertical' }}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
            <label style={{ fontSize: '0.8rem' }}>
              Timer (minutes)
              <input
                type="number"
                min={1}
                max={60}
                value={durationMinutes}
                onChange={(e) =>
                  setDurationMinutes(Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 2)))
                }
                style={{ width: '100%', marginTop: 4, padding: '0.35rem', borderRadius: 6 }}
              />
            </label>
            <label style={{ fontSize: '0.8rem' }}>
              Participation pts
              <input
                type="number"
                min={1}
                max={20}
                value={rewardParticipationPoints}
                onChange={(e) =>
                  setRewardParticipationPoints(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))
                }
                style={{ width: '100%', marginTop: 4, padding: '0.35rem', borderRadius: 6 }}
              />
            </label>
            <label style={{ fontSize: '0.8rem' }}>
              Bonus vault PP
              <input
                type="number"
                min={0}
                max={5000}
                value={rewardVaultPP}
                onChange={(e) => setRewardVaultPP(Math.max(0, Math.min(5000, parseInt(e.target.value, 10) || 0)))}
                style={{ width: '100%', marginTop: 4, padding: '0.35rem', borderRadius: 6 }}
              />
            </label>
            <label style={{ fontSize: '0.8rem' }}>
              Bonus XP
              <input
                type="number"
                min={0}
                max={5000}
                value={rewardXP}
                onChange={(e) => setRewardXP(Math.max(0, Math.min(5000, parseInt(e.target.value, 10) || 0)))}
                style={{ width: '100%', marginTop: 4, padding: '0.35rem', borderRadius: 6 }}
              />
            </label>
            <label style={{ fontSize: '0.8rem' }}>
              PP penalty if not checked (vault)
              <input
                type="number"
                min={0}
                max={5000}
                value={incompletePenaltyVaultPP}
                onChange={(e) =>
                  setIncompletePenaltyVaultPP(Math.max(0, Math.min(5000, parseInt(e.target.value, 10) || 0)))
                }
                style={{ width: '100%', marginTop: 4, padding: '0.35rem', borderRadius: 6 }}
              />
            </label>
          </div>
          <p style={{ fontSize: '0.75rem', opacity: 0.85, margin: '8px 0 0' }}>
            Each participation point adds {LIVE_EVENT_PP_PER_PARTICIPATION_POINT} session PP and moves toward your live-event streak.
          </p>
          <button
            type="button"
            disabled={busy || !title.trim()}
            onClick={() => void onStart()}
            style={{
              marginTop: 10,
              padding: '0.5rem 1rem',
              borderRadius: 8,
              border: 'none',
              fontWeight: 700,
              cursor: busy || !title.trim() ? 'not-allowed' : 'pointer',
              background: '#fbbf24',
              color: '#422006',
            }}
          >
            {busy ? 'Starting…' : 'Start sprint'}
          </button>
        </div>
      )}

      {!sprint && !isSessionHost && (
        <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.9 }}>The host hasn’t started a sprint yet.</p>
      )}

      {sprint && (
        <div style={{ marginTop: '0.5rem' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>{sprint.title}</div>
          {sprint.description ? (
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', opacity: 0.95, whiteSpace: 'pre-wrap' }}>{sprint.description}</p>
          ) : null}
          <div style={{ fontSize: '0.8rem', opacity: 0.9, marginBottom: '0.75rem' }}>
            Rewards per awarded player: {sprint.rewardParticipationPoints} participation pt(s) (~
            {sprint.rewardParticipationPoints * LIVE_EVENT_PP_PER_PARTICIPATION_POINT} session PP)
            {sprint.rewardVaultPP > 0 ? ` · +${sprint.rewardVaultPP} vault PP` : ''}
            {sprint.rewardXP > 0 ? ` · +${sprint.rewardXP} XP` : ''}
            {(sprint.incompletePenaltyVaultPP || 0) > 0
              ? ` · Incomplete (unchecked): −${sprint.incompletePenaltyVaultPP} vault PP each (host applies manually)`
              : ''}
          </div>

          {isSessionHost && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '0.75rem' }}>
              {sprint.status === 'live' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onClose()}
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.5)',
                    background: 'rgba(0,0,0,0.2)',
                    color: '#fff',
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  Close sprint window
                </button>
              )}
              <button
                type="button"
                disabled={busy || pendingGrant === 0}
                onClick={() => void onGrant()}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: 8,
                  border: 'none',
                  background: '#34d399',
                  color: '#064e3b',
                  fontWeight: 700,
                  cursor: busy || pendingGrant === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Award pending ({pendingGrant})
              </button>
              {(sprint.incompletePenaltyVaultPP || 0) > 0 && (
                <button
                  type="button"
                  disabled={busy || pendingPenaltyCount === 0}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Deduct ${sprint.incompletePenaltyVaultPP} vault PP from ${pendingPenaltyCount} player(s) who are not checked? (Cannot undo. Each player is only charged once per sprint.)`
                      )
                    ) {
                      return;
                    }
                    void onApplyIncompletePenalties();
                  }}
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: 8,
                    border: '1px solid rgba(248,113,113,0.6)',
                    background: 'rgba(127,29,29,0.45)',
                    color: '#fecaca',
                    fontWeight: 700,
                    cursor: busy || pendingPenaltyCount === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  Apply incomplete penalty ({pendingPenaltyCount})
                </button>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void onClear()}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.35)',
                  background: 'transparent',
                  color: '#e2e8f0',
                  cursor: busy ? 'not-allowed' : 'pointer',
                }}
              >
                Clear sprint
              </button>
            </div>
          )}

          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sessionPlayers.map((p) => {
              const isMarked = marked.has(p.userId);
              const isPaid = granted.has(p.userId);
              const canToggle = isSessionHost && (sprint.status === 'live' || sprint.status === 'closed');
              return (
                <div
                  key={p.userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '0.35rem 0.5rem',
                    background: 'rgba(0,0,0,0.12)',
                    borderRadius: 6,
                    fontSize: '0.875rem',
                  }}
                >
                  {canToggle ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }}>
                      <input type="checkbox" checked={isMarked} onChange={() => void onToggle(p.userId)} />
                      <span>{p.displayName}</span>
                    </label>
                  ) : (
                    <span style={{ flex: 1 }}>
                      {p.displayName}
                      {isMarked && (
                        <span style={{ marginLeft: 8, opacity: 0.9, color: '#a7f3d0' }}>
                          {p.userId === currentUserId ? '✓ You are marked complete' : '✓ Complete'}
                        </span>
                      )}
                    </span>
                  )}
                  {isPaid && <span style={{ fontSize: '0.75rem', color: '#a7f3d0' }}>Rewarded</span>}
                </div>
              );
            })}
          </div>

          {!isSessionHost && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.8rem', opacity: 0.88 }}>
              Your host will check you off if you finish the goal in time. When you’re checked, your participation PP and moves update right away so you can fight and shop in MST MKT.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default LiveEventSprintPanel;
