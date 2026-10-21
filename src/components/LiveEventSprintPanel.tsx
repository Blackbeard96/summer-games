import React, { useEffect, useMemo, useState, useCallback } from 'react';
import type { ClassFlowSprintState } from '../types/season1';
import { LIVE_EVENT_PP_PER_PARTICIPATION_POINT } from '../utils/inSessionStatsService';
import {
  startClassFlowSprint,
  closeClassFlowSprint,
  clearClassFlowSprint,
  grantClassFlowSprintRewards,
  applyClassFlowSprintIncompletePenalties,
  sprintTimerInput,
} from '../utils/liveEventSprintService';
import { sprintRemainingMs } from '../utils/classFlowConfig';
import { mergeSprintRosterForClassFlow, fetchClassroomStudentRoster } from '../utils/classFlowSprintRosterService';
import LiveEventWeeklyDeliverableMarkPanel from './LiveEventWeeklyDeliverableMarkPanel';
import SprintWorkPicker from './classFlow/SprintWorkPicker';
import type { CfSprintAssignment } from '../types/classFlowWork';
import { recordSprintArchive, updateCfConfig } from '../utils/classFlowWorkService';

export interface LiveEventSprintPanelProps {
  sessionId: string;
  sprint: ClassFlowSprintState | null;
  sessionPlayers: { userId: string; displayName: string }[];
  /** Full class roster (same class as the live session). When set, sprint list includes everyone and flags who is in-session. */
  classStudentRoster?: { userId: string; displayName: string }[] | null;
  /** Room host — excluded from incomplete PP penalties */
  sessionHostUid?: string;
  isSessionHost: boolean;
  currentUserId: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
  /** When set with goalSettingAssessmentId, host can mark weekly deliverable completion here. */
  classId?: string;
  goalSettingAssessmentId?: string | null;
  /** Class Flow Work Assignments already enabled for this room. */
  classFlowWorkEnabled?: boolean;
  /** Integrated Sprint Manager (work, approvals, teams, rewards). */
  children?: React.ReactNode;
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
  currentUserId,
  userEmail,
  userDisplayName,
  classId = '',
  goalSettingAssessmentId = null,
  classFlowWorkEnabled = false,
  children,
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
  const [sprintWork, setSprintWork] = useState<CfSprintAssignment[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fetchedClassRoster, setFetchedClassRoster] = useState<
    { userId: string; displayName: string }[] | null
  >(null);

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
    fetchClassroomStudentRoster(cid)
      .then((rows) => {
        if (!cancelled) setFetchedClassRoster(rows.length > 0 ? rows : null);
      })
      .catch(() => {
        if (!cancelled) setFetchedClassRoster(null);
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

  const sprintPaused = !!sprint?.pausedAt;
  const remainingSec = useMemo(() => {
    if (!sprint) return 0;
    if (sprintPaused) return Math.ceil(sprintRemainingMs(sprintTimerInput(sprint), now) / 1000);
    const end = endsAtMs(sprint);
    return Math.max(0, Math.ceil((end - now) / 1000));
  }, [sprint, now, sprintPaused]);

  const timerExpired = sprint && sprint.status === 'live' && !sprintPaused && remainingSec <= 0;

  const sprintRosterRows = useMemo(
    () => mergeSprintRosterForClassFlow(effectiveClassRoster, sessionPlayers),
    [effectiveClassRoster, sessionPlayers]
  );
  const playerNames = useMemo(() => {
    const m = new Map<string, string>();
    sprintRosterRows.forEach((p) => m.set(p.userId, p.displayName || 'Player'));
    return m;
  }, [sprintRosterRows]);

  const onStart = useCallback(async () => {
    setMessage(null);
    setBusy(true);
    try {
      const hasWork = sprintWork.length > 0;
      const durationSeconds = Math.round(durationMinutes * 60);
      const startedAtMs = Date.now();
      const res = await startClassFlowSprint(
        sessionId,
        currentUserId,
        userEmail ?? undefined,
        userDisplayName ?? undefined,
        {
          title,
          description,
          durationSeconds,
          rewardParticipationPoints,
          rewardVaultPP,
          rewardXP,
          incompletePenaltyVaultPP,
          ...(hasWork ? { objective: description, assignments: sprintWork, nowMs: startedAtMs } : {}),
        }
      );
      if (!res.ok) setMessage(res.error || 'Could not start sprint');
      else {
        if (hasWork && res.sprintId) {
          await recordSprintArchive(sessionId, res.sprintId, {
            title: title.trim(),
            objective: description.trim(),
            durationSeconds,
            assignments: sprintWork,
            startedAtMs,
            startedBy: currentUserId,
          });
        }
        if (!classFlowWorkEnabled) {
          const cfg = await updateCfConfig(sessionId, { workAssignmentsEnabled: true, expandedTimerEnabled: true });
          if (!cfg.ok) setMessage('Sprint started, but work submission could not be switched on for this room.');
        }
        setTitle('');
        setDescription('');
        setSprintWork([]);
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
    sprintWork,
    classFlowWorkEnabled,
  ]);

  const onEnableSubmissions = useCallback(async () => {
    setBusy(true);
    const cfg = await updateCfConfig(sessionId, { workAssignmentsEnabled: true, expandedTimerEnabled: true });
    setBusy(false);
    if (!cfg.ok) setMessage(cfg.error || 'Could not switch on work submission');
  }, [sessionId]);

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
      else if (res.granted === 0) setMessage('No unpaid rewards left — everyone approved has been paid.');
      else setMessage(`Paid sprint rewards to ${res.granted} player(s).`);
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
      else if (res.penalized === 0) setMessage('No unapproved players left to penalize (or penalty already applied).');
      else setMessage(`Deducted vault PP from ${res.penalized} player(s) whose work was not approved.`);
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
            {sprint.status === 'live'
              ? timerExpired
                ? 'Time window ended'
                : `${sprintPaused ? 'Paused — ' : ''}Time left: ${fmt(remainingSec)}`
              : 'Window closed — review in Sprint Manager'}
          </span>
        )}
      </div>

      <p style={{ margin: '0.5rem 0 0.75rem', fontSize: '0.85rem', opacity: 0.92, lineHeight: 1.45 }}>
        Host sets a timed goal. Players flag their work as done with <strong>Submit Work</strong> or tap{' '}
        <strong>Request support</strong>. Both show up in the <strong>Sprint Manager</strong> below, where approving work
        pays the sprint rewards (vault PP / XP / participation credit) right away. Optional incomplete penalty deducts
        vault PP from class students whose work was not approved (host excluded).
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
                max={sprintWork.length ? 120 : 60}
                value={durationMinutes}
                onChange={(e) =>
                  setDurationMinutes(
                    Math.max(1, Math.min(sprintWork.length ? 120 : 60, parseInt(e.target.value, 10) || 2))
                  )
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
          <div style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>Work for this sprint (optional)</div>
            <p style={{ fontSize: '0.75rem', opacity: 0.85, margin: '0 0 6px' }}>
              Attach work from the library or create it here. Players submit it from their Sprint view and you approve it
              in the Sprint Manager below. Attaching work turns on Work Assignments for this room.
            </p>
            <SprintWorkPicker
              standalone
              assignments={sprintWork}
              onChange={setSprintWork}
              actorUid={currentUserId}
              classId={classId || null}
              onMessage={(text) => setMessage(text)}
            />
          </div>
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
            Rewards when work is approved: {sprint.rewardParticipationPoints} participation pt(s) (~
            {sprint.rewardParticipationPoints * LIVE_EVENT_PP_PER_PARTICIPATION_POINT} session PP)
            {sprint.rewardVaultPP > 0 ? ` · +${sprint.rewardVaultPP} vault PP` : ''}
            {sprint.rewardXP > 0 ? ` · +${sprint.rewardXP} XP` : ''}
            {(sprint.incompletePenaltyVaultPP || 0) > 0
              ? ` · Not approved: −${sprint.incompletePenaltyVaultPP} vault PP each (host applies manually)`
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
              {!classFlowWorkEnabled && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onEnableSubmissions()}
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: 8,
                    border: 'none',
                    background: '#fbbf24',
                    color: '#422006',
                    fontWeight: 700,
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  Turn on work submission
                </button>
              )}
              {pendingGrant > 0 && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onGrant()}
                  title="Approved players whose reward payment did not finish"
                  style={{
                    padding: '0.45rem 0.85rem',
                    borderRadius: 8,
                    border: 'none',
                    background: '#34d399',
                    color: '#064e3b',
                    fontWeight: 700,
                    cursor: busy ? 'not-allowed' : 'pointer',
                  }}
                >
                  Retry unpaid rewards ({pendingGrant})
                </button>
              )}
              {(sprint.incompletePenaltyVaultPP || 0) > 0 && (
                <button
                  type="button"
                  disabled={busy || pendingPenaltyCount === 0}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Deduct ${sprint.incompletePenaltyVaultPP} vault PP from ${pendingPenaltyCount} player(s) whose work is not approved? (Cannot undo. Each player is only charged once per sprint.)`
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

          {!isSessionHost && (
            <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.88 }}>
              When you finish, use <strong>Submit Work</strong> in the sprint bar to flag it as done, or{' '}
              <strong>Request support</strong> if you need help. Once your host approves your work, your participation PP and
              moves update right away.
            </p>
          )}
        </div>
      )}

      {children}

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
