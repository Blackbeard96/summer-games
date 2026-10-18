import React, { useMemo, useState } from 'react';
import type { CfSubmission, CfTeam } from '../../../types/classFlowWork';
import { CF_METHOD_LABELS } from '../../../utils/classFlowConfig';
import { reviewSubmission, type CfSprintArchive } from '../../../utils/classFlowWorkService';
import type { CfToastInput } from '../classFlowPanelTypes';

type View = 'pending' | 'approved' | 'revisions' | 'rejected' | 'all';

interface Props {
  sessionId: string;
  reviewerUid: string;
  submissions: CfSubmission[];
  teams: CfTeam[];
  tableByUid: Record<string, number>;
  archive: CfSprintArchive[];
  currentSprintId: string | null;
  notify: (t: CfToastInput) => void;
}

const isPending = (s: CfSubmission) => s.status === 'submitted' || s.status === 'awaiting_approval';

const STATUS_TEXT: Record<CfSubmission['status'], string> = {
  submitted: 'Submitted',
  awaiting_approval: 'Awaiting approval',
  approved: 'Approved',
  revision_requested: 'Revision requested',
  rejected: 'Rejected',
};

function timeLabel(ms: number) {
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const ApprovalsTab: React.FC<Props> = ({
  sessionId,
  reviewerUid,
  submissions,
  teams,
  tableByUid,
  archive,
  currentSprintId,
  notify,
}) => {
  const [view, setView] = useState<View>('pending');
  const [teamFilter, setTeamFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const [assignmentFilter, setAssignmentFilter] = useState('');
  const [sprintFilter, setSprintFilter] = useState<string>(currentSprintId || '');
  const [open, setOpen] = useState<{ id: string; mode: 'partial' | 'revision' | 'reject' | 'evidence' } | null>(null);
  const [partialMode, setPartialMode] = useState<'percent' | 'amount'>('percent');
  const [partialValue, setPartialValue] = useState('50');
  const [feedback, setFeedback] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const teamOf = useMemo(() => {
    const m = new Map<string, CfTeam>();
    teams.forEach((t) => t.memberIds.forEach((uid) => m.set(uid, t)));
    return m;
  }, [teams]);

  const sprintTitle = useMemo(() => new Map(archive.map((a) => [a.sprintId, a.title])), [archive]);
  const assignmentOptions = useMemo(() => {
    const m = new Map<string, string>();
    submissions.forEach((s) => m.set(s.assignmentId, s.assignmentTitle));
    return Array.from(m.entries());
  }, [submissions]);
  const tables = useMemo(() => Array.from(new Set(Object.values(tableByUid))).sort((a, b) => a - b), [tableByUid]);
  const sprintOptions = useMemo(() => Array.from(new Set(submissions.map((s) => s.sprintId))), [submissions]);

  const filtered = useMemo(
    () =>
      submissions
        .filter((s) => {
          if (view === 'pending' && !isPending(s)) return false;
          if (view === 'approved' && s.status !== 'approved') return false;
          if (view === 'revisions' && s.status !== 'revision_requested') return false;
          if (view === 'rejected' && s.status !== 'rejected') return false;
          if (teamFilter && teamOf.get(s.playerId)?.id !== teamFilter) return false;
          if (tableFilter && String(tableByUid[s.playerId] ?? '') !== tableFilter) return false;
          if (assignmentFilter && s.assignmentId !== assignmentFilter) return false;
          if (sprintFilter && s.sprintId !== sprintFilter) return false;
          return true;
        })
        .sort((a, b) => (view === 'pending' ? a.submittedAt - b.submittedAt : b.submittedAt - a.submittedAt)),
    [submissions, view, teamFilter, tableFilter, assignmentFilter, sprintFilter, teamOf, tableByUid]
  );
  const pendingCount = submissions.filter(isPending).length;

  const act = async (s: CfSubmission, action: Parameters<typeof reviewSubmission>[2], label: string) => {
    setBusyId(s.id);
    const res = await reviewSubmission(sessionId, s.id, action, reviewerUid);
    setBusyId(null);
    if (res.ok) {
      setOpen(null);
      setFeedback('');
      notify({ title: label, body: `${s.playerName} — ${s.assignmentTitle}`, tone: label.startsWith('Approved') ? 'good' : 'info' });
    } else notify({ title: 'Review failed', body: res.error, tone: 'bad' });
  };

  const partialPoints = (s: CfSubmission) => {
    const v = Math.max(0, Number(partialValue) || 0);
    return partialMode === 'percent'
      ? Math.floor((s.requestedPoints * Math.min(100, v)) / 100)
      : Math.min(s.requestedPoints, Math.floor(v));
  };

  const approveVisible = async () => {
    const list = filtered.filter(isPending);
    for (const s of list) {
      await reviewSubmission(sessionId, s.id, { kind: 'approve', points: s.requestedPoints }, reviewerUid);
    }
    notify({ title: 'Approved', body: `${list.length} submission${list.length === 1 ? '' : 's'} approved.`, tone: 'good' });
  };

  const VIEWS: [View, string][] = [
    ['pending', `Pending${pendingCount ? ` (${pendingCount})` : ''}`],
    ['approved', 'Approved'],
    ['revisions', 'Revisions'],
    ['rejected', 'Rejected'],
    ['all', 'All'],
  ];

  return (
    <div>
      <div className="cf-row" style={{ marginBottom: 8 }}>
        {VIEWS.map(([v, label]) => (
          <button key={v} type="button" className={`cf-btn ${view === v ? 'cf-btn--primary' : 'cf-btn--ghost'}`} onClick={() => setView(v)}>
            {label}
          </button>
        ))}
      </div>
      <div className="cf-row" style={{ marginBottom: 10 }}>
        <select className="cf-select" value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)} aria-label="Filter by sprint">
          <option value="">All sprints</option>
          {sprintOptions.map((id) => (
            <option key={id} value={id}>
              {sprintTitle.get(id) || id}
              {id === currentSprintId ? ' (current)' : ''}
            </option>
          ))}
        </select>
        {teams.length > 0 && (
          <select className="cf-select" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} aria-label="Filter by team">
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.displayName}</option>
            ))}
          </select>
        )}
        {tables.length > 0 && (
          <select className="cf-select" value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} aria-label="Filter by table">
            <option value="">All tables</option>
            {tables.map((n) => (
              <option key={n} value={String(n)}>Table {n}</option>
            ))}
          </select>
        )}
        <select className="cf-select" value={assignmentFilter} onChange={(e) => setAssignmentFilter(e.target.value)} aria-label="Filter by assignment">
          <option value="">All assignments</option>
          {assignmentOptions.map(([id, title]) => (
            <option key={id} value={id}>{title}</option>
          ))}
        </select>
        {view === 'pending' && filtered.length > 1 && (
          <button type="button" className="cf-btn cf-btn--green" onClick={approveVisible}>
            Approve all shown
          </button>
        )}
      </div>

      {filtered.length === 0 && <div className="cf-empty">Nothing here.</div>}
      <div style={{ display: 'grid', gap: 8 }}>
        {filtered.map((s) => {
          const team = teamOf.get(s.playerId);
          const table = tableByUid[s.playerId];
          const isOpen = open?.id === s.id;
          return (
            <div key={s.id} className="cf-card">
              <div className="cf-between">
                <div>
                  <strong>{s.playerName}</strong>
                  <span className="cf-sub">
                    {' '}
                    · {team?.displayName || s.teamName || 'No team'}
                    {table != null ? ` · Table ${table}` : ''} · {timeLabel(s.submittedAt)}
                  </span>
                  <div style={{ fontSize: 13, marginTop: 2 }}>
                    {s.assignmentTitle}{' '}
                    <span className="cf-sub">
                      · {CF_METHOD_LABELS[s.method]} · requested {s.requestedPoints} pts
                      {s.workType === 'team' && s.contributorIds.length > 1 ? ` · ${s.contributorIds.length} contributors` : ''}
                      {s.isExtraCredit ? ' · extra credit' : ''}
                      {s.revisionCount > 0 ? ` · revision ${s.revisionCount}` : ''}
                    </span>
                  </div>
                </div>
                <span className={`cf-badge cf-status-${s.status}`}>
                  {STATUS_TEXT[s.status]}
                  {s.status === 'approved' ? ` +${s.approvedPoints}` : ''}
                </span>
              </div>
              <div className="cf-row" style={{ marginTop: 8 }}>
                <button type="button" className="cf-btn cf-btn--green" disabled={busyId === s.id || (s.status === 'approved' && s.approvedPoints === s.requestedPoints)} onClick={() => act(s, { kind: 'approve', points: s.requestedPoints }, 'Approved')}>
                  Approve
                </button>
                <button type="button" className="cf-btn" onClick={() => setOpen(isOpen && open?.mode === 'partial' ? null : { id: s.id, mode: 'partial' })}>
                  Partial credit
                </button>
                <button type="button" className="cf-btn cf-btn--purple" onClick={() => setOpen(isOpen && open?.mode === 'revision' ? null : { id: s.id, mode: 'revision' })}>
                  Request revision
                </button>
                <button type="button" className="cf-btn cf-btn--red" onClick={() => setOpen(isOpen && open?.mode === 'reject' ? null : { id: s.id, mode: 'reject' })}>
                  Reject
                </button>
                <button type="button" className="cf-btn cf-btn--ghost" onClick={() => setOpen(isOpen && open?.mode === 'evidence' ? null : { id: s.id, mode: 'evidence' })}>
                  View evidence
                </button>
              </div>

              {isOpen && open?.mode === 'evidence' && (
                <div className="cf-card" style={{ marginTop: 8, fontSize: 13 }}>
                  {s.evidence.text && <div style={{ whiteSpace: 'pre-wrap' }}>{s.evidence.text}</div>}
                  {s.evidence.url && (
                    <a href={s.evidence.url} target="_blank" rel="noopener noreferrer" style={{ color: '#f0c96a' }}>
                      {s.evidence.url}
                    </a>
                  )}
                  {s.evidence.fileUrl && (
                    <div>
                      {/\.(png|jpe?g|gif|webp)$/i.test(s.evidence.fileName || '') ? (
                        <img src={s.evidence.fileUrl} alt={s.evidence.fileName || 'Evidence'} style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 8 }} />
                      ) : null}
                      <a href={s.evidence.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#f0c96a' }}>
                        Open {s.evidence.fileName || 'file'}
                      </a>
                    </div>
                  )}
                  {s.evidence.confirmed && <div>Player confirmed completion.</div>}
                  {s.method === 'facilitator' && <div>Verify in person.</div>}
                  {s.history.length > 0 && (
                    <div className="cf-sub" style={{ marginTop: 6 }}>
                      History: {s.history.map((h) => `${h.action}${h.points != null ? ` (${h.points})` : ''} ${timeLabel(h.at)}`).join(' → ')}
                    </div>
                  )}
                </div>
              )}

              {isOpen && open?.mode === 'partial' && (
                <div className="cf-row" style={{ marginTop: 8 }}>
                  <select className="cf-select" value={partialMode} onChange={(e) => setPartialMode(e.target.value as 'percent' | 'amount')}>
                    <option value="percent">Percentage</option>
                    <option value="amount">Amount</option>
                  </select>
                  <input className="cf-input" type="number" min={0} value={partialValue} onChange={(e) => setPartialValue(e.target.value)} style={{ width: 90 }} />
                  <span className="cf-sub">= {partialPoints(s)} of {s.requestedPoints} pts</span>
                  <button type="button" className="cf-btn cf-btn--green" disabled={busyId === s.id} onClick={() => act(s, { kind: 'approve', points: partialPoints(s) }, 'Approved (partial)')}>
                    Approve partial
                  </button>
                </div>
              )}

              {isOpen && (open?.mode === 'revision' || open?.mode === 'reject') && (
                <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                  <textarea
                    className="cf-textarea"
                    placeholder={open.mode === 'revision' ? 'What should the player fix?' : 'Reason (optional)'}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    maxLength={600}
                  />
                  <div>
                    <button
                      type="button"
                      className={`cf-btn ${open.mode === 'revision' ? 'cf-btn--purple' : 'cf-btn--red'}`}
                      disabled={busyId === s.id || (open.mode === 'revision' && !feedback.trim())}
                      onClick={() =>
                        act(
                          s,
                          open.mode === 'revision' ? { kind: 'revision', feedback } : { kind: 'reject', feedback },
                          open.mode === 'revision' ? 'Revision requested' : 'Rejected'
                        )
                      }
                    >
                      {open.mode === 'revision' ? 'Send revision request' : 'Reject submission'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ApprovalsTab;
