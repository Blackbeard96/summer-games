import React, { useMemo, useState } from 'react';
import type { CfAllocation, CfSprintAssignment, CfSubmission, CfTeam } from '../../../types/classFlowWork';
import { computeClassFlowAnalytics } from '../../../utils/classFlowAnalytics';
import { UNASSIGNED_TEAM_ID } from '../../../utils/classFlowRewards';
import type { CfSprintArchive } from '../../../utils/classFlowWorkService';
import type { CfPlayerRef } from '../classFlowPanelTypes';

interface Props {
  submissions: CfSubmission[];
  allocations: CfAllocation[];
  archive: CfSprintArchive[];
  currentAssignments: CfSprintAssignment[];
  teams: CfTeam[];
  players: CfPlayerRef[];
  nameOf: (uid: string) => string;
}

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const AnalyticsTab: React.FC<Props> = ({ submissions, allocations, archive, currentAssignments, teams, players, nameOf }) => {
  const [sprintId, setSprintId] = useState('');
  const realTeams = teams.filter((t) => t.id !== UNASSIGNED_TEAM_ID);

  const a = useMemo(() => {
    const subs = sprintId ? submissions.filter((s) => s.sprintId === sprintId) : submissions;
    const allocs = sprintId ? allocations.filter((x) => x.sprintId === sprintId) : allocations;
    const assignments = sprintId
      ? archive.find((s) => s.sprintId === sprintId)?.assignments || currentAssignments
      : archive.length
        ? archive.flatMap((s) => s.assignments || [])
        : currentAssignments;
    return computeClassFlowAnalytics({
      participantIds: players.map((p) => p.uid),
      assignments,
      submissions: subs,
      allocations: allocs,
      teamCount: realTeams.length,
    });
  }, [sprintId, submissions, allocations, archive, currentAssignments, players, realTeams.length]);

  const teamOf = useMemo(() => {
    const m = new Map<string, string>();
    teams.forEach((t) => t.memberIds.forEach((uid) => m.set(uid, t.id)));
    return m;
  }, [teams]);
  const teamTotals = useMemo(() => {
    const out: Record<string, number> = {};
    Object.entries(a.approvedPointsByPlayer).forEach(([uid, pts]) => {
      const t = teamOf.get(uid);
      if (t) out[t] = (out[t] || 0) + pts;
    });
    return out;
  }, [a, teamOf]);

  const exportCsv = () => {
    const rows = [
      ['sprint', 'player', 'team', 'assignment', 'type', 'status', 'requested', 'approved', 'revisions', 'submittedAt', 'reviewedAt'],
      ...submissions.map((s) => [
        archive.find((x) => x.sprintId === s.sprintId)?.title || s.sprintId,
        s.playerName,
        s.teamName || '',
        s.assignmentTitle,
        s.isExtraCredit ? 'extra' : s.workType,
        s.status,
        s.requestedPoints,
        s.approvedPoints,
        s.revisionCount,
        s.submittedAt ? new Date(s.submittedAt).toISOString() : '',
        s.reviewedAt ? new Date(s.reviewedAt).toISOString() : '',
      ]),
      [],
      ['sprint', 'player', 'approvedWork', 'extra', 'individualReward', 'teamReward', 'sharedIn', 'sharedOut', 'totalPoints', 'pp', 'xp', 'status'],
      ...allocations.map((x) => [
        archive.find((s) => s.sprintId === x.sprintId)?.title || x.sprintId,
        nameOf(x.playerId),
        x.approvedWorkPoints,
        x.extraPoints,
        x.individualReward,
        x.teamReward,
        x.sharedIn,
        x.sharedOut,
        x.totalPoints,
        x.pp,
        x.xp,
        x.status,
      ]),
    ];
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `class-flow-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const Stat = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="cf-card">
      <div className="cf-stat-label">{label}</div>
      <div className="cf-stat-value">{value}</div>
    </div>
  );

  return (
    <div>
      <div className="cf-row" style={{ marginBottom: 10 }}>
        <select className="cf-select" value={sprintId} onChange={(e) => setSprintId(e.target.value)} aria-label="Sprint">
          <option value="">Whole event</option>
          {archive.map((s) => (
            <option key={s.sprintId} value={s.sprintId}>{s.title}</option>
          ))}
        </select>
        <button type="button" className="cf-btn" onClick={exportCsv}>Export CSV</button>
      </div>

      <div className="cf-stat-label" style={{ marginBottom: 6 }}>Completion</div>
      <div className="cf-grid">
        <Stat label="Participation" value={`${a.participationRate}%`} />
        <Stat label="Submission rate" value={`${a.submissionRate}%`} />
        <Stat label="Approval rate" value={`${a.approvalRate}%`} />
        <Stat label="Completion" value={`${a.completionRate}%`} />
        <Stat label="Revision rate" value={`${a.revisionRate}%`} />
        <Stat label="Avg. review time" value={a.avgApprovalTurnaroundSec != null ? `${Math.round(a.avgApprovalTurnaroundSec / 60)}m` : '—'} />
        <Stat label="Extra credit approved" value={a.extraCreditApproved} />
        <Stat label="Pending" value={a.pending} />
      </div>

      <div className="cf-stat-label" style={{ margin: '12px 0 6px' }}>Rewards (separate from completion)</div>
      <div className="cf-grid">
        <Stat label="Sprint points allocated" value={a.rewards.pointsAllocated} />
        <Stat label="PP allocated" value={a.rewards.ppAllocated} />
        <Stat label="XP allocated" value={a.rewards.xpAllocated} />
        <Stat label="Players paid" value={a.rewards.paidOutPlayers} />
        <Stat label="Shared credit" value={a.rewards.sharedCredit} />
      </div>

      <div className="cf-grid" style={{ marginTop: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <div className="cf-card">
          <div className="cf-stat-label">By assignment</div>
          <table className="cf-table">
            <thead><tr><th>Work</th><th>Sub.</th><th>Appr.</th><th>Rev.</th><th>Rej.</th></tr></thead>
            <tbody>
              {a.byAssignment.map((x) => (
                <tr key={x.assignmentId}><td>{x.title}</td><td>{x.submitted}</td><td>{x.approved}</td><td>{x.revisions}</td><td>{x.rejected}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {realTeams.length > 0 && (
          <div className="cf-card">
            <div className="cf-stat-label">Team performance (approved credit)</div>
            <table className="cf-table">
              <tbody>
                {realTeams
                  .map((t) => ({ t, pts: teamTotals[t.id] || 0 }))
                  .sort((x, y) => y.pts - x.pts)
                  .map(({ t, pts }) => (
                    <tr key={t.id}><td>{t.displayName}</td><td>{pts}</td></tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="cf-card">
          <div className="cf-stat-label">Individual contribution (approved credit)</div>
          <table className="cf-table">
            <tbody>
              {players
                .map((p) => ({ p, pts: a.approvedPointsByPlayer[p.uid] || 0 }))
                .sort((x, y) => y.pts - x.pts)
                .map(({ p, pts }) => (
                  <tr key={p.uid}><td>{p.name}</td><td>{pts}</td></tr>
                ))}
            </tbody>
          </table>
        </div>
        {!sprintId && Object.keys(a.bySprint).length > 0 && (
          <div className="cf-card">
            <div className="cf-stat-label">By sprint</div>
            <table className="cf-table">
              <thead><tr><th>Sprint</th><th>Submissions</th><th>Approved</th></tr></thead>
              <tbody>
                {Object.entries(a.bySprint).map(([id, v]) => (
                  <tr key={id}><td>{archive.find((s) => s.sprintId === id)?.title || id}</td><td>{v.submissions}</td><td>{v.approved}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsTab;
