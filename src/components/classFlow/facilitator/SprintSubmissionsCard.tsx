import React, { useMemo, useState } from 'react';
import { rosterReviewState, type CfRosterReviewState, type CfRosterStatusRow } from '../../../utils/classFlowAnalytics';
import { resolveSupportRequest, type CfSupportRequest } from '../../../utils/classFlowWorkService';
import type { CfToastInput } from '../classFlowPanelTypes';

type SortMode = 'order' | 'resubmit' | 'name';

export interface SprintReviewActions {
  approvePlayer: (uid: string) => Promise<{ ok: boolean; error?: string }>;
  requestRevision: (uid: string, feedback: string) => Promise<{ ok: boolean; error?: string }>;
}

const STATE_BADGE: Record<Exclude<CfRosterReviewState, 'none'>, { label: string; cls: string }> = {
  pending: { label: '📝 Awaiting review', cls: 'cf-status-awaiting_approval' },
  revision: { label: '↺ Needs resubmission', cls: 'cf-status-revision_requested' },
  approved: { label: '✓ Approved', cls: 'cf-status-approved' },
};

/** "Needs resubmission" sort: waiting on the student first, then fixed work waiting on review. */
function resubmitRank(state: CfRosterReviewState, resubmitted: boolean): number {
  if (state === 'revision') return 0;
  if (state === 'pending' && resubmitted) return 1;
  if (state === 'pending') return 2;
  if (state === 'approved') return 3;
  return 4;
}

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const SprintSubmissionsCard: React.FC<{
  sessionId: string;
  actorUid: string;
  rows: CfRosterStatusRow[];
  support: CfSupportRequest[];
  rewardedUids: string[];
  actions: SprintReviewActions | null;
  notify: (n: CfToastInput) => void;
}> = ({ sessionId, actorUid, rows, support, rewardedUids, actions, notify }) => {
  const [sortMode, setSortMode] = useState<SortMode>('order');
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const rewarded = useMemo(() => new Set(rewardedUids), [rewardedUids]);

  const list = useMemo(() => {
    const withState = rows.map((r) => ({ r, state: rosterReviewState(r) }));
    type Item = (typeof withState)[number];
    const byName = (a: Item, b: Item) => a.r.name.localeCompare(b.r.name);
    const byOrder = (a: Item, b: Item) => {
      const fa = a.r.firstSubmittedAt;
      const fb = b.r.firstSubmittedAt;
      if (fa && fb) return fa - fb;
      if (fa) return -1;
      if (fb) return 1;
      return byName(a, b);
    };
    const orderOf = new Map(
      withState
        .filter((x) => x.r.firstSubmittedAt)
        .sort(byOrder)
        .map((x, i) => [x.r.uid, i + 1])
    );
    const sorted = [...withState].sort((a, b) => {
      if (sortMode === 'name') return byName(a, b);
      if (sortMode === 'resubmit') {
        const d = resubmitRank(a.state, a.r.resubmitted) - resubmitRank(b.state, b.r.resubmitted);
        if (d !== 0) return d;
      }
      return byOrder(a, b);
    });
    return sorted.map((x) => ({ ...x, order: orderOf.get(x.r.uid) ?? null }));
  }, [rows, sortMode]);

  const counts = useMemo(() => {
    const c = { submitted: 0, pending: 0, revision: 0, approved: 0, offline: 0 };
    list.forEach(({ r, state }) => {
      if (r.firstSubmittedAt) c.submitted += 1;
      if (!r.inSession) c.offline += 1;
      if (state === 'pending') c.pending += 1;
      else if (state === 'revision') c.revision += 1;
      else if (state === 'approved') c.approved += 1;
    });
    return c;
  }, [list]);

  const approve = async (r: CfRosterStatusRow) => {
    if (!actions) return;
    setBusyUid(r.uid);
    const res = await actions.approvePlayer(r.uid);
    setBusyUid(null);
    if (!res.ok) notify({ title: 'Could not approve', body: res.error, tone: 'bad' });
  };

  const revise = async (r: CfRosterStatusRow) => {
    if (!actions) return;
    const feedback = window.prompt(`What should ${r.name} fix before resubmitting?`);
    if (feedback === null) return;
    if (!feedback.trim()) {
      notify({ title: 'Feedback needed', body: 'Add feedback so the player knows what to fix.', tone: 'warn' });
      return;
    }
    setBusyUid(r.uid);
    const res = await actions.requestRevision(r.uid, feedback);
    setBusyUid(null);
    if (!res.ok) notify({ title: 'Could not request revision', body: res.error, tone: 'bad' });
  };

  const resolve = async (req: CfSupportRequest) => {
    const res = await resolveSupportRequest(sessionId, req.id, actorUid);
    if (!res.ok) notify({ title: 'Could not resolve', body: res.error, tone: 'bad' });
  };

  return (
    <>
      <div
        className="cf-card"
        style={{ marginTop: 12, borderColor: support.length ? 'rgba(244, 114, 182, 0.6)' : undefined }}
        aria-label="Support requests"
      >
        <div className="cf-between" style={{ marginBottom: support.length ? 8 : 0 }}>
          <div className="cf-stat-label">🙋 Support requests</div>
          <div className="cf-sub">
            {support.length ? `${support.length} waiting · in the order they asked` : 'Nobody is waiting for help'}
          </div>
        </div>
        {support.length > 0 && (
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {support.map((req, i) => (
              <li
                key={req.id}
                className="cf-row"
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: i === 0 ? 'rgba(244, 114, 182, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                  fontSize: 13,
                }}
              >
                <strong style={{ minWidth: 22 }}>{i + 1}.</strong>
                <span style={{ flex: 1, fontWeight: i === 0 ? 700 : 500 }}>{req.playerName}</span>
                <span className="cf-sub">{clockTime(req.requestedAt)}</span>
                <button type="button" className="cf-btn cf-btn--ghost" onClick={() => void resolve(req)}>
                  Resolve
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="cf-card cf-card--gold" style={{ marginTop: 12 }} aria-label="Submissions">
        <div className="cf-between" style={{ marginBottom: 8 }}>
          <div>
            <div className="cf-stat-label">Submissions</div>
            <div className="cf-sub">
              {counts.submitted} of {list.length} submitted · {counts.pending} awaiting review · {counts.revision} need
              resubmission · {counts.approved} approved{counts.offline ? ` · ${counts.offline} not in Live Event` : ''}
            </div>
          </div>
          <label className="cf-row" style={{ gap: 6, fontSize: 12 }}>
            <span className="cf-sub">Sort</span>
            <select className="cf-select" value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
              <option value="order">Submission order</option>
              <option value="resubmit">Needs resubmission first</option>
              <option value="name">Name</option>
            </select>
          </label>
        </div>
        <div className="cf-sub" style={{ marginBottom: 8 }}>
          Approving a player's work pays the sprint rewards right away.
        </div>
        {list.length === 0 ? (
          <div className="cf-empty">No students yet.</div>
        ) : (
          <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {list.map(({ r, state, order }) => {
              const badge = state === 'none' ? null : STATE_BADGE[state];
              const label = state === 'pending' && r.resubmitted ? '🔁 Resubmitted' : badge?.label;
              return (
                <div
                  key={r.uid}
                  data-review-state={state}
                  className="cf-row"
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    gap: 8,
                    fontSize: 13,
                    background: state === 'pending' ? 'rgba(251, 191, 36, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                    boxShadow: state === 'pending' ? 'inset 3px 0 0 #fbbf24' : state === 'revision' ? 'inset 3px 0 0 #fb923c' : undefined,
                  }}
                >
                  <span className="cf-sub" style={{ minWidth: 26, fontWeight: 700 }} title="Submission order">
                    {order ? `#${order}` : '—'}
                  </span>
                  <span style={{ flex: 1, minWidth: 120, fontWeight: state === 'pending' ? 700 : 500 }}>{r.name}</span>
                  {badge && <span className={`cf-badge ${badge.cls}`}>{label}</span>}
                  {!r.inSession && <span className="cf-badge cf-status-not_started">Not in session</span>}
                  {r.lastSubmittedAt ? (
                    <span className="cf-sub">
                      {r.resubmitted ? 'resubmitted' : 'submitted'} {clockTime(r.lastSubmittedAt)}
                    </span>
                  ) : null}
                  {rewarded.has(r.uid) && <span className="cf-badge cf-status-approved">Rewarded</span>}
                  {state === 'pending' && actions && (
                    <>
                      <button
                        type="button"
                        className="cf-btn cf-btn--green"
                        disabled={busyUid === r.uid}
                        onClick={() => void approve(r)}
                      >
                        ✓ Approve
                      </button>
                      <button
                        type="button"
                        className="cf-btn cf-btn--ghost"
                        disabled={busyUid === r.uid}
                        onClick={() => void revise(r)}
                      >
                        ↺ Request revision
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default SprintSubmissionsCard;
