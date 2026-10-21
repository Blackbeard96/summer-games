import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CfPlayerTaskStatus, CfSprintAssignment, CfSubmission } from '../../types/classFlowWork';
import { formatClock, sprintPhase, sprintRemainingMs, sprintTasks } from '../../utils/classFlowConfig';
import { UNASSIGNED_TEAM_ID } from '../../utils/classFlowRewards';
import { sanitizeTeamName } from '../../utils/classFlowTeams';
import {
  castShareVote,
  proposeShare,
  proposeTeamName,
  setTableNumber,
  submitWork,
} from '../../utils/classFlowWorkService';
import { sprintTimerInput } from '../../utils/liveEventSprintService';
import ClassFlowSprintTimer, { type CfTimerItem } from './ClassFlowSprintTimer';
import ClassFlowSubmitModal, { type CfSubmitDraft } from './ClassFlowSubmitModal';
import ClassFlowSupportButton from './ClassFlowSupportButton';
import type { CfPlayerData, CfSharedProps } from './classFlowPanelTypes';

export const CF_STATUS_LABEL: Record<CfPlayerTaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
  awaiting_approval: 'Awaiting approval',
  approved: 'Approved',
  revision_requested: 'Revision requested',
  rejected: 'Rejected',
};

type Props = CfSharedProps & {
  data: CfPlayerData;
  /** Only the floating Submit bar, submit form, and full-screen view (facilitators outside "My work"). */
  barOnly?: boolean;
  onOpenMyWork?: () => void;
};

function draftKey(sprintId: string, uid: string) {
  return `cf_in_progress_${sprintId}_${uid}`;
}

const ClassFlowPlayerView: React.FC<Props> = ({
  sessionId,
  actor,
  sprint,
  config,
  nowMs,
  nameOf,
  notify,
  data,
  embedded,
  roster,
  barOnly = false,
  onOpenMyWork,
}) => {
  const uid = actor.uid;
  const [modalFor, setModalFor] = useState<string | null | undefined>(undefined);
  const [inProgress, setInProgress] = useState<string[]>([]);
  const [nameDraft, setNameDraft] = useState('');
  const [customShare, setCustomShare] = useState('');
  const [busy, setBusy] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    if (!sprint) return;
    try {
      setInProgress(JSON.parse(localStorage.getItem(draftKey(sprint.id, uid)) || '[]'));
    } catch {
      setInProgress([]);
    }
  }, [sprint, uid]);

  const markInProgress = (assignmentId: string) => {
    if (!sprint) return;
    const next = Array.from(new Set([...inProgress, assignmentId]));
    setInProgress(next);
    try {
      localStorage.setItem(draftKey(sprint.id, uid), JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };

  const assignments: CfSprintAssignment[] = useMemo(
    () => sprintTasks(sprint).filter((a) => !a.isExtraCredit || config.extraCreditEnabled),
    [sprint, config.extraCreditEnabled]
  );

  const subsForSprint = useMemo(
    () => (sprint ? data.submissions.filter((s) => s.sprintId === sprint.id) : []),
    [data.submissions, sprint]
  );

  /** My record per assignment: my own submission, else a teammate's team submission that lists me. */
  const byAssignment = useMemo(() => {
    const out: Record<string, CfSubmission | undefined> = {};
    for (const s of subsForSprint) {
      const prev = out[s.assignmentId];
      if (!prev || s.playerId === uid) out[s.assignmentId] = s;
    }
    return out;
  }, [subsForSprint, uid]);

  const statusOf = (a: CfSprintAssignment): CfPlayerTaskStatus => {
    const s = byAssignment[a.assignmentId];
    if (s) return s.status;
    return inProgress.includes(a.assignmentId) ? 'in_progress' : 'not_started';
  };

  const myTeam = useMemo(
    () => (config.teamModeEnabled ? data.publicState?.teams.find((t) => t.memberIds.includes(uid)) || null : null),
    [config.teamModeEnabled, data.publicState, uid]
  );
  const teammates = useMemo(
    () => (myTeam ? myTeam.memberIds.filter((m) => m !== uid).map((m) => ({ uid: m, name: nameOf(m) })) : []),
    [myTeam, uid, nameOf]
  );

  const t = sprint ? sprintTimerInput(sprint) : null;
  const phase = t ? sprintPhase(t, nowMs) : null;
  const sprintEnded = phase === 'expired' || phase === 'closed';

  const approved = subsForSprint.filter((s) => s.status === 'approved');
  const myApproved = approved.filter((s) => !s.isExtraCredit);
  const myExtra = approved.filter((s) => s.isExtraCredit);
  const creditOf = (s: CfSubmission) =>
    s.workType === 'team' ? Math.floor(s.approvedPoints / Math.max(1, s.contributorIds.length)) : s.approvedPoints;
  const approvedCredit = myApproved.reduce((n, s) => n + creditOf(s), 0);
  const extraCredit = myExtra.reduce((n, s) => n + s.approvedPoints, 0);
  const pendingCredit = subsForSprint
    .filter((s) => s.status === 'submitted' || s.status === 'awaiting_approval')
    .reduce((n, s) => n + s.requestedPoints, 0);
  const standard = assignments.filter((a) => !a.isExtraCredit);
  const doneCount = standard.filter((a) => statusOf(a) === 'approved').length;
  const availablePoints = standard.reduce((n, a) => n + a.points, 0);

  const summaryText = (() => {
    const counts = { approved: 0, pending: 0, revision: 0 };
    subsForSprint.forEach((s) => {
      if (s.status === 'approved') counts.approved += 1;
      else if (s.status === 'revision_requested') counts.revision += 1;
      else if (s.status !== 'rejected') counts.pending += 1;
    });
    const parts = [`${counts.approved} approved`, `${counts.pending} pending`];
    if (counts.revision) parts.push(`${counts.revision} need revision`);
    return parts.join(' · ');
  })();

  const latestAlloc = useMemo(() => {
    const list = [...data.allocations];
    if (sprint) {
      const cur = list.find((a) => a.sprintId === sprint.id);
      if (cur) return cur;
    }
    return list.sort((a, b) => b.sprintId.localeCompare(a.sprintId))[0] || null;
  }, [data.allocations, sprint]);
  const latestPayout = latestAlloc?.payoutId ? data.payouts.find((p) => p.id === latestAlloc.payoutId) : null;

  const handleSubmit = async (drafts: CfSubmitDraft[]): Promise<string | null> => {
    if (!sprint) return 'No active sprint';
    for (const d of drafts) {
      const res = await submitWork({
        sessionId,
        sprintId: sprint.id,
        assignment: d.assignment,
        uid,
        playerName: actor.displayName || nameOf(uid),
        teamId: myTeam?.id ?? null,
        teamName: myTeam?.displayName ?? null,
        method: d.method,
        evidence: d.evidence,
        contributorIds: d.contributorIds,
      });
      if (!res.ok) return `${d.assignment.title}: ${res.error}`;
    }
    notify({
      title: 'Work submitted',
      body: `${drafts.length} task${drafts.length === 1 ? '' : 's'} sent for review.`,
      tone: 'info',
    });
    return null;
  };

  const sharingDecision =
    sprint && myTeam ? data.sharing.find((d) => d.sprintId === sprint.id && d.teamId === myTeam.id) : undefined;
  const showSharing =
    config.teamModeEnabled && config.teamCreditSharingEnabled && !!myTeam && myTeam.id !== UNASSIGNED_TEAM_ID && sprintEnded && !!sprint;

  const vote = async (pct: number) => {
    if (!sprint || !myTeam) return;
    setBusy(true);
    const res =
      config.sharing.initiator === 'captain'
        ? await proposeShare(sessionId, sprint.id, myTeam.id, uid, pct)
        : await castShareVote(sessionId, sprint.id, myTeam.id, uid, pct);
    setBusy(false);
    if (!res.ok) notify({ title: 'Could not save', body: res.error, tone: 'bad' });
  };

  const myTable = data.tableByUid[uid];

  const canSubmit = (a: CfSprintAssignment) => {
    const st = statusOf(a);
    const s = byAssignment[a.assignmentId];
    return (st === 'not_started' || st === 'in_progress' || st === 'revision_requested') && !(s && s.playerId !== uid);
  };
  const submittable = assignments.filter(canSubmit);
  const acceptingWork = phase === 'running' || phase === 'paused' || (phase === 'expired' && config.acceptLateSubmissions);
  const showBar =
    !!sprint && acceptingWork && (submittable.length > 0 || !barOnly) && modalFor === undefined && !fullScreen;
  const timerItems: CfTimerItem[] = assignments.map((a) => {
    const st = statusOf(a);
    return {
      assignment: a,
      statusLabel: CF_STATUS_LABEL[st],
      statusClass: `cf-status-${st}`,
      ...(canSubmit(a)
        ? { actionLabel: st === 'revision_requested' ? 'Resubmit' : 'Submit', onAction: () => setModalFor(a.assignmentId) }
        : {}),
    };
  });

  const barEl =
    showBar && sprint
      ? createPortal(
          <div className="cf-root cf-sprint-bar" role="region" aria-label="Sprint in progress">
            <span className="cf-timer-clock">{formatClock(t ? sprintRemainingMs(t, nowMs) : 0)}</span>
            <span style={{ fontSize: 13 }}>
              <strong>{sprint.title}</strong>
              <span className="cf-sub"> · {submittable.length > 0 ? `${submittable.length} to submit` : 'submitted'}</span>
            </span>
            {submittable.length > 0 && (
              <button type="button" className="cf-btn cf-btn--primary" onClick={() => setModalFor(null)}>
                Submit Work
              </button>
            )}
            {!barOnly && (
              <ClassFlowSupportButton
                sessionId={sessionId}
                sprintId={sprint.id}
                uid={uid}
                playerName={actor.displayName || nameOf(uid)}
                onError={(msg) => notify({ title: 'Could not send request', body: msg, tone: 'bad' })}
              />
            )}
            <button
              type="button"
              className="cf-btn cf-btn--ghost"
              onClick={() => (barOnly ? onOpenMyWork?.() : setFullScreen(true))}
            >
              {barOnly ? 'My work' : '⛶ View tasks'}
            </button>
          </div>,
          document.body
        )
      : null;

  const modalEl =
    modalFor !== undefined && sprint ? (
      <ClassFlowSubmitModal
        sessionId={sessionId}
        uid={uid}
        assignments={assignments.filter((a) => {
          const s = byAssignment[a.assignmentId];
          return !s || (s.playerId === uid && s.status === 'revision_requested');
        })}
        existing={byAssignment}
        teammates={teammates}
        initialAssignmentId={modalFor}
        onSubmit={handleSubmit}
        onClose={() => setModalFor(undefined)}
      />
    ) : null;

  if (barOnly) {
    return (
      <>
        {barEl}
        {modalEl}
      </>
    );
  }

  return (
    <div className={`cf-root${embedded ? ' cf-embedded' : ''}`} aria-label="Class Flow sprint">
      <div className="cf-between" style={{ marginBottom: 10 }}>
        <h3 className="cf-title">Class Flow · Sprint</h3>
        {myTeam && <span className="cf-team-tag">{myTeam.tag}</span>}
      </div>

      {!sprint && <div className="cf-empty">Waiting for the facilitator to start the next sprint.</div>}

      {sprint && (
        <>
          <ClassFlowSprintTimer
            sprint={sprint}
            nowMs={nowMs}
            expandable
            acceptLate={config.acceptLateSubmissions}
            teamLabel={myTeam?.tag ?? null}
            availablePoints={availablePoints}
            submissionSummary={summaryText}
            onSubmitWork={submittable.length ? () => setModalFor(null) : undefined}
            items={timerItems}
            roster={roster}
            viewerUid={uid}
            fullScreen={fullScreen}
            onFullScreenChange={setFullScreen}
          />
          {barEl}

          {assignments.length > 0 && (
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              {assignments.map((a) => {
                const st = statusOf(a);
                const s = byAssignment[a.assignmentId];
                const byTeammate = s && s.playerId !== uid;
                const canAct = (st === 'not_started' || st === 'in_progress' || st === 'revision_requested') && !byTeammate;
                return (
                  <div key={a.assignmentId} className="cf-card">
                    <div className="cf-between">
                      <div>
                        <strong>{a.title}</strong>{' '}
                        <span className="cf-sub">
                          {a.points} pts · {a.workType === 'team' ? 'Team' : 'Individual'}
                          {a.isExtraCredit ? ' · Extra credit' : ''}
                        </span>
                      </div>
                      <span className={`cf-badge cf-status-${st}`}>{CF_STATUS_LABEL[st]}</span>
                    </div>
                    {a.description && <div className="cf-sub" style={{ marginTop: 4 }}>{a.description}</div>}
                    {byTeammate && <div className="cf-sub" style={{ marginTop: 4 }}>Submitted by {s!.playerName} for your team</div>}
                    {s?.status === 'approved' && (
                      <div className="cf-sub" style={{ marginTop: 4, color: '#a7f3d0' }}>
                        Credit: +{creditOf(s)}
                        {s.approvedPoints < s.requestedPoints ? ` (partial of ${s.requestedPoints})` : ''}
                      </div>
                    )}
                    {s?.feedback && (s.status === 'revision_requested' || s.status === 'rejected') && (
                      <div className="cf-msg" style={{ marginTop: 6 }}>
                        Facilitator: {s.feedback}
                      </div>
                    )}
                    {canAct && phase !== 'closed' && (
                      <div className="cf-row" style={{ marginTop: 8 }}>
                        {st === 'not_started' && (
                          <button type="button" className="cf-btn cf-btn--ghost" onClick={() => markInProgress(a.assignmentId)}>
                            Start
                          </button>
                        )}
                        <button
                          type="button"
                          className="cf-btn cf-btn--primary"
                          onClick={() => setModalFor(a.assignmentId)}
                          disabled={phase === 'expired' && !config.acceptLateSubmissions}
                        >
                          {st === 'revision_requested' ? 'Resubmit' : 'Submit'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="cf-grid" style={{ marginTop: 12 }}>
            <div className="cf-card cf-card--gold">
              <div className="cf-stat-label">Your progress</div>
              <div className="cf-stat-value">
                {doneCount}/{standard.length}
              </div>
              <div className="cf-progress" style={{ margin: '6px 0' }}>
                <span style={{ width: `${standard.length ? (doneCount / standard.length) * 100 : 0}%` }} />
              </div>
              <div className="cf-sub">
                Approved credit {approvedCredit} · Pending {pendingCredit}
                {config.extraCreditEnabled ? ` · Extra ${extraCredit}` : ''}
              </div>
            </div>
            {myTeam && (
              <div className="cf-card cf-card--gold">
                <div className="cf-stat-label">Team progress</div>
                <div className="cf-stat-value">{myTeam.approvedPoints}</div>
                <div className="cf-sub">
                  Team credit · {myTeam.teamAssignmentsDone} team task{myTeam.teamAssignmentsDone === 1 ? '' : 's'} done ·{' '}
                  {myTeam.pendingCount} pending
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {showSharing && (
        <div className="cf-card cf-card--gold" style={{ marginTop: 12 }}>
          <div className="cf-stat-label">Team credit sharing</div>
          {sharingDecision?.status === 'approved' || sharingDecision?.status === 'declined' ? (
            <div style={{ marginTop: 6, fontSize: 13 }}>
              {sharingDecision.status === 'approved' && (sharingDecision.approvedPercent || 0) > 0
                ? `Approved: ${sharingDecision.approvedPercent}% of contributors' individual credit is shared with eligible teammates.`
                : 'No credit will be shared this sprint.'}
            </div>
          ) : config.sharing.initiator === 'facilitator' ? (
            <div className="cf-sub" style={{ marginTop: 6 }}>Your facilitator decides whether credit is shared.</div>
          ) : config.sharing.initiator === 'captain' && myTeam?.captainId !== uid ? (
            <div className="cf-sub" style={{ marginTop: 6 }}>
              Your team captain ({myTeam?.captainId ? nameOf(myTeam.captainId) : 'not set'}) proposes a share; the facilitator approves it.
              {sharingDecision?.proposedPercent != null ? ` Proposed: ${sharingDecision.proposedPercent}%.` : ''}
            </div>
          ) : (
            <>
              <div className="cf-sub" style={{ margin: '6px 0' }}>
                Share part of your individual credit with teammates who participated but have no approved work. Your facilitator
                approves the final decision. Team rewards are never reduced.
              </div>
              <div className="cf-row">
                {config.sharing.options.map((pct) => {
                  const mine =
                    config.sharing.initiator === 'captain' ? sharingDecision?.proposedPercent === pct : sharingDecision?.votes?.[uid] === pct;
                  return (
                    <button
                      key={pct}
                      type="button"
                      className={`cf-btn ${mine ? 'cf-btn--primary' : ''}`}
                      disabled={busy}
                      onClick={() => vote(pct)}
                    >
                      {pct === 0 ? 'Share nothing' : `${pct}%`}
                    </button>
                  );
                })}
                {config.sharing.allowCustom && (
                  <>
                    <input
                      className="cf-input"
                      style={{ width: 70 }}
                      type="number"
                      min={0}
                      max={config.sharing.maxPercent}
                      value={customShare}
                      onChange={(e) => setCustomShare(e.target.value)}
                      placeholder="%"
                    />
                    <button
                      type="button"
                      className="cf-btn"
                      disabled={busy || customShare === ''}
                      onClick={() => vote(Math.max(0, Math.min(config.sharing.maxPercent, Math.floor(Number(customShare) || 0))))}
                    >
                      Vote custom
                    </button>
                  </>
                )}
              </div>
              {config.sharing.initiator === 'majority' && sharingDecision && (
                <div className="cf-sub" style={{ marginTop: 6 }}>
                  {Object.keys(sharingDecision.votes || {}).length} of {myTeam?.memberIds.length ?? 0} teammates voted.
                </div>
              )}
            </>
          )}
        </div>
      )}

      {latestAlloc && (
        <div className="cf-card cf-card--gold" style={{ marginTop: 12 }}>
          <div className="cf-stat-label">Sprint summary</div>
          <table className="cf-table" style={{ marginTop: 6 }}>
            <tbody>
              <tr><td>Approved work</td><td>{latestAlloc.approvedWorkPoints}</td></tr>
              {latestAlloc.extraPoints > 0 && <tr><td>Extra credit</td><td>+{latestAlloc.extraPoints}</td></tr>}
              {config.teamModeEnabled && <tr><td>Team total</td><td>{latestAlloc.teamTotal}</td></tr>}
              <tr><td>Individual reward</td><td>+{latestAlloc.individualReward}</td></tr>
              {latestAlloc.teamReward > 0 && <tr><td>Team reward</td><td>+{latestAlloc.teamReward}</td></tr>}
              {latestAlloc.sharedIn > 0 && <tr><td>Shared with you</td><td>+{latestAlloc.sharedIn}</td></tr>}
              {latestAlloc.sharedOut > 0 && <tr><td>You shared</td><td>−{latestAlloc.sharedOut}</td></tr>}
              <tr><td><strong>Total Sprint Points</strong></td><td><strong>+{latestAlloc.totalPoints}</strong></td></tr>
              {(latestAlloc.pp > 0 || latestAlloc.xp > 0) && (
                <tr>
                  <td>MST rewards</td>
                  <td>
                    {latestAlloc.pp > 0 ? `+${latestAlloc.pp} PP ` : ''}
                    {latestAlloc.xp > 0 ? `+${latestAlloc.xp} XP` : ''}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="cf-sub" style={{ marginTop: 6 }}>
            {latestAlloc.status === 'paid_out'
              ? latestPayout?.status === 'claimed'
                ? 'Rewards received.'
                : 'Rewards are being delivered…'
              : config.payoutTiming === 'end_of_event'
                ? 'Rewards are paid at the end of the event.'
                : 'Waiting for the facilitator to finalize rewards.'}
          </div>
        </div>
      )}

      {config.teamModeEnabled && (
        <div className="cf-row" style={{ marginTop: 12 }}>
          {config.teamModeEnabled && config.grouping === 'table' && (
            <label className="cf-label">
              My table
              <input
                className="cf-input"
                style={{ width: 80 }}
                type="number"
                min={1}
                max={99}
                defaultValue={myTable ?? ''}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if ((n || null) !== (myTable ?? null)) void setTableNumber(sessionId, uid, n > 0 ? n : null, uid);
                }}
              />
            </label>
          )}
          {myTeam && myTeam.id !== UNASSIGNED_TEAM_ID && (
            <label className="cf-label" style={{ flex: 1 }}>
              Suggest a team name {myTeam.proposedName ? `(pending: “${myTeam.proposedName}”)` : ''}
              <div className="cf-row">
                <input
                  className="cf-input"
                  maxLength={32}
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder={myTeam.displayName}
                />
                <button
                  type="button"
                  className="cf-btn"
                  disabled={!sanitizeTeamName(nameDraft)}
                  onClick={async () => {
                    const res = await proposeTeamName(sessionId, myTeam.id, sanitizeTeamName(nameDraft), uid);
                    if (res.ok) {
                      setNameDraft('');
                      notify({ title: 'Name suggested', body: 'Your facilitator will review it.' });
                    } else notify({ title: 'Could not suggest name', body: res.error, tone: 'bad' });
                  }}
                >
                  Suggest
                </button>
              </div>
            </label>
          )}
        </div>
      )}

      {modalEl}
    </div>
  );
};

export default ClassFlowPlayerView;
