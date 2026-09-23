import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { ClassFlowSprintState } from '../types/season1';
import type { InSessionRoom } from '../types/inSession';
import type { WorkPeriodProgress } from '../types/workBoard';
import { LIVE_EVENT_PP_PER_PARTICIPATION_POINT } from '../utils/inSessionStatsService';
import {
  startClassFlowSprint,
  closeClassFlowSprint,
  clearClassFlowSprint,
  toggleClassFlowSprintMark,
  grantClassFlowSprintRewards,
  applyClassFlowSprintIncompletePenalties,
} from '../utils/liveEventSprintService';
import { mergeSprintRosterForClassFlow, fetchClassroomStudentRoster } from '../utils/classFlowSprintRosterService';
import {
  buildGameTimeRoster,
  setGameTimeStatus,
  type GameTimeStatus,
} from '../utils/liveEventGameTimeService';
import {
  getStudentPeriodProgress,
  listWorkPeriodsForClass,
} from '../utils/workBoardService';
import LiveEventWeeklyDeliverableMarkPanel from './LiveEventWeeklyDeliverableMarkPanel';

export interface LiveEventSprintPanelProps {
  sessionId: string;
  sprint: ClassFlowSprintState | null;
  sessionPlayers: { userId: string; displayName: string }[];
  /** Full class roster (same class as the live session). When set, sprint list includes everyone and flags who is in-session. */
  classStudentRoster?: { userId: string; displayName: string }[] | null;
  /** Room host — excluded from incomplete PP penalties */
  sessionHostUid?: string;
  isSessionHost: boolean;
  /** Host or admin: Open / Pause / End Game Time + roster columns */
  showGameTimeControls?: boolean;
  currentUserId: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
  /** When set with goalSettingAssessmentId, host can mark weekly deliverable completion here. */
  classId?: string;
  goalSettingAssessmentId?: string | null;
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
  classStudentRoster = null,
  sessionHostUid = '',
  isSessionHost,
  showGameTimeControls = false,
  currentUserId,
  userEmail,
  userDisplayName,
  classId = '',
  goalSettingAssessmentId = null,
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
  const [fetchedClassRoster, setFetchedClassRoster] = useState<
    { userId: string; displayName: string }[] | null
  >(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [roomSnap, setRoomSnap] = useState<InSessionRoom | null>(null);
  const [workProgressByUid, setWorkProgressByUid] = useState<Record<string, WorkPeriodProgress>>({});
  const [gameTimeBusy, setGameTimeBusy] = useState(false);
  const [showGameTimeRoster, setShowGameTimeRoster] = useState(true);

  useEffect(() => {
    if (!showGameTimeControls || !sessionId) return;
    const unsub = onSnapshot(doc(db, 'inSessionRooms', sessionId), (snap) => {
      if (snap.exists()) setRoomSnap({ id: snap.id, ...(snap.data() as Omit<InSessionRoom, 'id'>) });
      else setRoomSnap(null);
    });
    return () => unsub();
  }, [sessionId, showGameTimeControls]);

  const gameTimeRoster = useMemo(
    () => (roomSnap ? buildGameTimeRoster(roomSnap) : []),
    [roomSnap]
  );

  useEffect(() => {
    if (!showGameTimeControls || !roomSnap?.classId || !roomSnap.players?.length) return;
    let cancelled = false;
    (async () => {
      try {
        const periods = await listWorkPeriodsForClass(roomSnap.classId!);
        const open = periods.find((p) => p.status === 'open') || periods[0];
        if (!open) return;
        const entries = await Promise.all(
          roomSnap.players.map(async (p) => {
            try {
              const prog = await getStudentPeriodProgress({
                periodId: open.id,
                studentId: p.userId,
                classId: roomSnap.classId!,
              });
              return [p.userId, prog] as const;
            } catch {
              return null;
            }
          })
        );
        if (cancelled) return;
        const map: Record<string, WorkPeriodProgress> = {};
        for (const e of entries) {
          if (e) map[e[0]] = e[1];
        }
        setWorkProgressByUid(map);
      } catch (e) {
        console.warn('[LiveEventSprintPanel] work progress load failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showGameTimeControls, roomSnap]);

  const onSetGameTimeStatus = async (status: GameTimeStatus) => {
    if (!showGameTimeControls) return;
    setGameTimeBusy(true);
    try {
      await setGameTimeStatus(sessionId, status);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Failed to update Game Time');
    } finally {
      setGameTimeBusy(false);
    }
  };

  // Harden full-class tracking: if parent didn't pass roster, load classroom.students by classId
  // so paper / offline formative students still appear for host checkmarks.
  useEffect(() => {
    if (classStudentRoster && classStudentRoster.length > 0) {
      setFetchedClassRoster(null);
      return;
    }
    const cid = typeof classId === 'string' ? classId.trim() : '';
    if (!cid || !isSessionHost) return;
    let cancelled = false;
    setRosterLoading(true);
    fetchClassroomStudentRoster(cid)
      .then((rows) => {
        if (!cancelled) setFetchedClassRoster(rows.length > 0 ? rows : null);
      })
      .catch(() => {
        if (!cancelled) setFetchedClassRoster(null);
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classId, classStudentRoster, isSessionHost]);

  const effectiveClassRoster =
    classStudentRoster && classStudentRoster.length > 0
      ? classStudentRoster
      : fetchedClassRoster;

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

  const sprintRosterRows = useMemo(
    () => mergeSprintRosterForClassFlow(effectiveClassRoster, sessionPlayers),
    [effectiveClassRoster, sessionPlayers]
  );
  const showPresenceBadges = Boolean(effectiveClassRoster && effectiveClassRoster.length > 0);
  const offlineCount = sprintRosterRows.filter((r) => !r.isInSession).length;

  const playerNames = useMemo(() => {
    const m = new Map<string, string>();
    sprintRosterRows.forEach((p) => m.set(p.userId, p.displayName || 'Player'));
    return m;
  }, [sprintRosterRows]);

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
      ? sprintRosterRows.filter(
          (p) =>
            p.userId !== sessionHostUid &&
            !marked.has(p.userId) &&
            !penaltiesGranted.has(p.userId)
        ).length
      : 0;
  const selfMarked = marked.has(currentUserId);
  const canSelfCheckIn = !!sprint && !isSessionHost && sprint.status === 'live' && !timerExpired && !selfMarked;

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

      {showGameTimeControls && (
        <div
          style={{
            marginTop: '0.75rem',
            marginBottom: '0.35rem',
            background: 'rgba(15, 23, 42, 0.45)',
            border: '1px solid rgba(125, 211, 252, 0.35)',
            borderRadius: 10,
            padding: '0.65rem 0.75rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontSize: '0.85rem' }}>
              <strong>Game Time</strong>{' '}
              <span style={{ opacity: 0.9 }}>({roomSnap?.gameTime?.status || 'closed'})</span>
              {' · '}
              <span style={{ color: '#7dd3fc', fontWeight: 600 }}>
                {(roomSnap?.liveEventMode || 'class_flow').replace(/_/g, ' ')}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                disabled={gameTimeBusy}
                onClick={() => void onSetGameTimeStatus('open')}
                style={{
                  padding: '0.3rem 0.55rem',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.35)',
                  background: 'rgba(16,185,129,0.85)',
                  color: '#022c22',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: gameTimeBusy ? 'wait' : 'pointer',
                }}
              >
                Open
              </button>
              <button
                type="button"
                disabled={gameTimeBusy}
                onClick={() => void onSetGameTimeStatus('paused')}
                style={{
                  padding: '0.3rem 0.55rem',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.35)',
                  background: 'rgba(251,191,36,0.9)',
                  color: '#422006',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: gameTimeBusy ? 'wait' : 'pointer',
                }}
              >
                Pause
              </button>
              <button
                type="button"
                disabled={gameTimeBusy}
                onClick={() => void onSetGameTimeStatus('ended')}
                style={{
                  padding: '0.3rem 0.55rem',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.35)',
                  background: 'rgba(239,68,68,0.9)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: gameTimeBusy ? 'wait' : 'pointer',
                }}
              >
                End
              </button>
              <button
                type="button"
                onClick={() => setShowGameTimeRoster((v) => !v)}
                style={{
                  padding: '0.3rem 0.55rem',
                  borderRadius: 6,
                  border: '1px solid rgba(255,255,255,0.35)',
                  background: 'transparent',
                  color: '#e2e8f0',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                {showGameTimeRoster ? 'Hide roster' : 'Show roster'}
              </button>
            </div>
          </div>
          {showGameTimeRoster && gameTimeRoster.length > 0 && (
            <div style={{ overflowX: 'auto', marginTop: 8, maxHeight: 220, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(148,163,184,0.45)' }}>
                    <th style={{ padding: '4px 6px' }}>Player</th>
                    <th>Mode</th>
                    <th>Declared W</th>
                    <th>Done W</th>
                    <th>Req %</th>
                    <th>PP</th>
                    <th>Floor</th>
                  </tr>
                </thead>
                <tbody>
                  {gameTimeRoster.map((row) => {
                    const prog = workProgressByUid[row.userId];
                    const reqPct =
                      prog?.requiredCompletionRate == null
                        ? '—'
                        : `${Math.round(prog.requiredCompletionRate * 100)}%`;
                    return (
                      <tr key={row.userId} style={{ borderBottom: '1px solid rgba(30,41,59,0.8)' }}>
                        <td style={{ padding: '4px 6px' }}>{row.displayName}</td>
                        <td>{row.participationMode}</td>
                        <td>{prog?.declaredW ?? '—'}</td>
                        <td>{prog?.completedW ?? '—'}</td>
                        <td>{reqPct}</td>
                        <td>{row.powerPoints}</td>
                        <td>{row.protectionFloor}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <p style={{ margin: '0.5rem 0 0.75rem', fontSize: '0.85rem', opacity: 0.92, lineHeight: 1.45 }}>
        Host sets a timed goal and checks off students who finish. The checklist includes the{' '}
        <strong>full class roster</strong> — students do <strong>not</strong> need to be logged into the Live Event
        (paper formative / offline OK). “Not in session” means they never joined the room; you can still mark them and
        they receive vault PP / XP / participation credit. Rewards apply as soon as you check someone off. Use “Award
        pending” only if a grant failed. Optional incomplete penalty deducts vault PP from unchecked class students
        (host excluded).
        {classId && goalSettingAssessmentId?.trim() ? (
          <>
            {' '}
            If this live session has <strong>Goal setting</strong> linked to a <strong>Weekly Deliverable</strong>{' '}
            assessment, use the deliverable block below to mark completion and apply vault PP the same way as the admin
            dashboard.
          </>
        ) : null}
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

          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {isSessionHost && (
              <div style={{ fontSize: '0.75rem', opacity: 0.9, marginBottom: 2 }}>
                {rosterLoading
                  ? 'Loading class roster…'
                  : `${sprintRosterRows.length} students on checklist${
                      showPresenceBadges ? ` · ${offlineCount} not in Live Event` : ''
                    }`}
              </div>
            )}
            {sprintRosterRows.map((p) => {
              const isMarked = marked.has(p.userId);
              const isPaid = granted.has(p.userId);
              const canToggle = isSessionHost && (sprint.status === 'live' || sprint.status === 'closed');
              const sessionBadge = showPresenceBadges ? (
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    padding: '2px 6px',
                    borderRadius: 4,
                    flexShrink: 0,
                    background: p.isInSession ? 'rgba(52,211,153,0.25)' : 'rgba(148,163,184,0.35)',
                    color: p.isInSession ? '#d1fae5' : '#e2e8f0',
                    border: `1px solid ${p.isInSession ? 'rgba(52,211,153,0.45)' : 'rgba(148,163,184,0.5)'}`,
                  }}
                >
                  {p.isInSession ? 'In session' : 'Not in session'}
                </span>
              ) : null;
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
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                        <span>{p.displayName}</span>
                        {sessionBadge}
                      </span>
                    </label>
                  ) : (
                    <span style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                      <span>{p.displayName}</span>
                      {sessionBadge}
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
          {!isSessionHost && sprint.status === 'live' && (
            <div style={{ marginTop: '0.65rem' }}>
              {selfMarked ? (
                <div style={{ fontSize: '0.85rem', color: '#a7f3d0', fontWeight: 600 }}>
                  ✓ You are checked in for this sprint.
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!canSelfCheckIn}
                  onClick={() => void onToggle(currentUserId)}
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.55)',
                    background: canSelfCheckIn ? 'rgba(16,185,129,0.95)' : 'rgba(255,255,255,0.2)',
                    color: canSelfCheckIn ? '#022c22' : '#e2e8f0',
                    fontWeight: 700,
                    cursor: canSelfCheckIn ? 'pointer' : 'not-allowed',
                  }}
                >
                  ✅ Check in complete
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {isSessionHost && classId && goalSettingAssessmentId?.trim() && (
        <LiveEventWeeklyDeliverableMarkPanel
          classId={classId}
          goalSettingAssessmentId={goalSettingAssessmentId.trim()}
          hostUid={currentUserId}
          classStudentRoster={classStudentRoster}
          sessionPlayers={sessionPlayers}
          isSessionHost={isSessionHost}
        />
      )}
    </div>
  );
};

export default LiveEventSprintPanel;
