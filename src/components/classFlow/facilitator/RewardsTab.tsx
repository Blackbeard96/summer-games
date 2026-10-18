import React, { useMemo, useState } from 'react';
import type {
  CfAllocation,
  CfConfig,
  CfSharingDecision,
  CfSprintAssignment,
  CfSubmission,
  CfTeam,
} from '../../../types/classFlowWork';
import { effectiveDistributionMode } from '../../../utils/classFlowConfig';
import { computeSprintRewards, majorityShareVote, UNASSIGNED_TEAM_ID } from '../../../utils/classFlowRewards';
import {
  createPayouts,
  decideShare,
  logClassFlowEvent,
  writeSprintAllocations,
  type CfSprintArchive,
} from '../../../utils/classFlowWorkService';
import type { CfPlayerRef, CfToastInput } from '../classFlowPanelTypes';

interface Props {
  sessionId: string;
  actorUid: string;
  config: CfConfig;
  currentSprint: { id: string; title: string; assignments: CfSprintAssignment[] } | null;
  archive: CfSprintArchive[];
  submissions: CfSubmission[];
  teams: CfTeam[];
  players: CfPlayerRef[];
  sharing: CfSharingDecision[];
  allocations: CfAllocation[];
  nameOf: (uid: string) => string;
  notify: (t: CfToastInput) => void;
}

const MODE_LABEL = {
  individual: 'Individual credit only (Team Mode off)',
  equal: 'A — Equal team distribution',
  contribution: 'B — Contribution-based',
  hybrid: 'C — Hybrid (individual + team share)',
};

const RewardsTab: React.FC<Props> = ({
  sessionId,
  actorUid,
  config,
  currentSprint,
  archive,
  submissions,
  teams,
  players,
  sharing,
  allocations,
  nameOf,
  notify,
}) => {
  const sprintChoices = useMemo(() => {
    const list = archive.map((a) => ({ id: a.sprintId, title: a.title, assignments: a.assignments || [], status: a.status }));
    if (currentSprint && !list.some((s) => s.id === currentSprint.id)) {
      list.push({ id: currentSprint.id, title: currentSprint.title, assignments: currentSprint.assignments, status: 'live' });
    }
    return list;
  }, [archive, currentSprint]);
  const [sprintId, setSprintId] = useState<string>(currentSprint?.id || sprintChoices[sprintChoices.length - 1]?.id || '');
  const chosen = sprintChoices.find((s) => s.id === sprintId) || null;
  const [excluded, setExcluded] = useState<string[]>([]);
  const [overridePct, setOverridePct] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const sprintSubs = useMemo(() => submissions.filter((s) => s.sprintId === sprintId), [submissions, sprintId]);
  const sprintSharing = useMemo(() => sharing.filter((d) => d.sprintId === sprintId), [sharing, sprintId]);
  const approvedShare = useMemo(() => {
    const m: Record<string, number> = {};
    sprintSharing.filter((d) => d.status === 'approved').forEach((d) => (m[d.teamId] = d.approvedPercent || 0));
    return m;
  }, [sprintSharing]);

  const result = useMemo(
    () =>
      chosen
        ? computeSprintRewards({
            config,
            assignments: chosen.assignments,
            submissions: sprintSubs,
            participantIds: players.map((p) => p.uid),
            teams,
            excludedIds: excluded,
            sharingPercentByTeam: approvedShare,
          })
        : null,
    [chosen, config, sprintSubs, players, teams, excluded, approvedShare]
  );

  const sprintAllocs = allocations.filter((a) => a.sprintId === sprintId);
  const paidCount = sprintAllocs.filter((a) => a.status === 'paid_out').length;
  const accruedAll = allocations.filter((a) => a.status === 'accrued' && !a.payoutId);
  const pendingReview = sprintSubs.filter((s) => s.status === 'submitted' || s.status === 'awaiting_approval').length;
  const mode = effectiveDistributionMode(config);

  const finalize = async () => {
    if (!result || !chosen) return;
    const warn = pendingReview ? `\n\n${pendingReview} submission(s) are still pending review and will count as 0.` : '';
    const payNow = config.payoutTiming === 'per_sprint';
    if (!window.confirm(`Finalize rewards for "${chosen.title}"?${payNow ? ' Rewards will be paid to players now.' : ' Rewards will accrue until the event payout.'}${warn}`)) return;
    setBusy(true);
    const w = await writeSprintAllocations(sessionId, chosen.id, result, actorUid);
    if (!w.ok) {
      setBusy(false);
      notify({ title: 'Finalize failed', body: w.error, tone: 'bad' });
      return;
    }
    let created = 0;
    if (payNow) {
      const fresh = Object.values(result.players).map(
        (p) => ({ ...p, id: `${chosen.id}__${p.playerId}`, sprintId: chosen.id, status: 'accrued', payoutId: null }) as CfAllocation
      );
      const pay = await createPayouts(sessionId, fresh, 'per_sprint', actorUid, chosen.id);
      if (!pay.ok) notify({ title: 'Payout failed', body: pay.error, tone: 'bad' });
      created = pay.ok ? pay.value || 0 : 0;
    }
    setBusy(false);
    void logClassFlowEvent(
      sessionId,
      `🏆 Sprint rewards finalized: "${chosen.title}" — ${result.pool.finalDistributed} Sprint Points${payNow ? `, ${created} payout(s) sent` : ' accrued'}.`
    );
    notify({ title: 'Rewards finalized', body: `${w.value} player record(s) saved${payNow ? `, ${created} payout(s) sent` : ''}.`, tone: 'good' });
  };

  const payEvent = async () => {
    if (!accruedAll.length) return;
    if (!window.confirm(`Pay out accrued rewards for ${new Set(accruedAll.map((a) => a.playerId)).size} player(s) now?`)) return;
    setBusy(true);
    const pay = await createPayouts(sessionId, accruedAll, 'end_of_event', actorUid);
    setBusy(false);
    if (pay.ok) {
      void logClassFlowEvent(sessionId, `🏆 Class Flow event rewards paid: ${pay.value} payout(s).`);
      notify({ title: 'Event rewards paid', body: `${pay.value} payout(s) sent.`, tone: 'good' });
    } else notify({ title: 'Payout failed', body: pay.error, tone: 'bad' });
  };

  const decide = async (teamId: string, approve: boolean, pct: number) => {
    const res = await decideShare(sessionId, sprintId, teamId, { approve, percent: Math.min(config.sharing.maxPercent, pct) }, actorUid);
    if (!res.ok) notify({ title: 'Sharing update failed', body: res.error, tone: 'bad' });
  };

  if (!chosen || !result) return <div className="cf-empty">Start a sprint to see rewards.</div>;

  const realTeams = teams.filter((t) => t.id !== UNASSIGNED_TEAM_ID);
  const rows = Object.values(result.players).sort((a, b) => b.totalPoints - a.totalPoints);

  return (
    <div>
      <div className="cf-row" style={{ marginBottom: 10 }}>
        <select className="cf-select" value={sprintId} onChange={(e) => setSprintId(e.target.value)} aria-label="Sprint">
          {sprintChoices.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} {s.status === 'finalized' ? '· finalized' : s.id === currentSprint?.id ? '· current' : ''}
            </option>
          ))}
        </select>
        <span className="cf-sub">
          {MODE_LABEL[mode]}
          {mode === 'hybrid' ? ` · team share ${config.hybridTeamPercent}%` : ''} · payout{' '}
          {config.payoutTiming === 'per_sprint' ? 'after each sprint' : 'at event end'}
          {config.ppPerPoint || config.xpPerPoint ? ` · 1 pt = ${config.ppPerPoint} PP / ${config.xpPerPoint} XP` : ' · no PP/XP conversion'}
        </span>
      </div>

      <div className="cf-grid">
        <div className="cf-card"><div className="cf-stat-label">Total base points</div><div className="cf-stat-value">{result.pool.totalBase}</div></div>
        <div className="cf-card"><div className="cf-stat-label">Approved base</div><div className="cf-stat-value">{result.pool.approvedBase}</div></div>
        <div className="cf-card"><div className="cf-stat-label">Remaining</div><div className="cf-stat-value">{result.pool.remainingBase}</div></div>
        <div className="cf-card"><div className="cf-stat-label">Extra credit</div><div className="cf-stat-value">{result.pool.extraApproved}</div></div>
        <div className="cf-card"><div className="cf-stat-label">Final distributed</div><div className="cf-stat-value">{result.pool.finalDistributed}</div></div>
      </div>

      {config.teamModeEnabled && realTeams.length > 0 && (
        <div className="cf-card" style={{ marginTop: 12 }}>
          <div className="cf-stat-label">Teams</div>
          <table className="cf-table">
            <thead>
              <tr><th>Team</th><th>Team total</th><th>Team reward / member</th>{config.teamCreditSharingEnabled && <th>Credit sharing</th>}</tr>
            </thead>
            <tbody>
              {realTeams.map((t) => {
                const summary = result.teams[t.id];
                const decision = sprintSharing.find((d) => d.teamId === t.id);
                const majority = decision ? majorityShareVote(decision.votes || {}, t.memberIds) : null;
                const suggested = config.sharing.initiator === 'captain' ? decision?.proposedPercent ?? null : config.sharing.initiator === 'majority' ? majority : null;
                const pctInput = overridePct[t.id] ?? String(decision?.approvedPercent ?? suggested ?? 0);
                return (
                  <tr key={t.id}>
                    <td>{t.displayName}</td>
                    <td>{summary?.teamTotal ?? 0}</td>
                    <td>{summary?.teamRewardPerMember ?? 0}</td>
                    {config.teamCreditSharingEnabled && (
                      <td>
                        <div className="cf-sub">
                          {decision?.status === 'approved'
                            ? `Approved ${decision.approvedPercent}% → ${summary?.sharedPool ?? 0} pts to ${summary?.shareRecipients.length ?? 0} teammate(s)`
                            : decision?.status === 'declined'
                              ? 'Declined'
                              : config.sharing.initiator === 'majority'
                                ? `${Object.keys(decision?.votes || {}).length}/${t.memberIds.length} voted${majority != null ? ` · majority ${majority}%` : ''}`
                                : config.sharing.initiator === 'captain'
                                  ? decision?.proposedPercent != null
                                    ? `Captain proposed ${decision.proposedPercent}%`
                                    : 'Waiting for captain'
                                  : 'Facilitator decides'}
                        </div>
                        <div className="cf-row" style={{ marginTop: 4 }}>
                          <input
                            className="cf-input"
                            type="number"
                            min={0}
                            max={config.sharing.maxPercent}
                            style={{ width: 64 }}
                            value={pctInput}
                            onChange={(e) => setOverridePct((o) => ({ ...o, [t.id]: e.target.value }))}
                            aria-label={`Share percent for ${t.displayName}`}
                          />
                          <span className="cf-sub">%</span>
                          <button type="button" className="cf-btn cf-btn--green" disabled={paidCount > 0} onClick={() => decide(t.id, true, Math.max(0, Number(pctInput) || 0))}>
                            Approve
                          </button>
                          <button type="button" className="cf-btn cf-btn--ghost" disabled={paidCount > 0} onClick={() => decide(t.id, false, 0)}>
                            Decline
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="cf-card" style={{ marginTop: 12, overflowX: 'auto' }}>
        <div className="cf-between">
          <div className="cf-stat-label">Players</div>
          <span className="cf-sub">Uncheck “Eligible” to exclude a player from team rewards and sharing (e.g. absent).</span>
        </div>
        <table className="cf-table">
          <thead>
            <tr>
              <th>Player</th>
              {config.teamModeEnabled && <th>Eligible</th>}
              <th>Approved work</th>
              <th>Extra</th>
              <th>Individual</th>
              {config.teamModeEnabled && <th>Team</th>}
              {config.teamCreditSharingEnabled && <th>Shared</th>}
              <th>Total</th>
              {(config.ppPerPoint > 0 || config.xpPerPoint > 0) && <th>PP / XP</th>}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const alloc = sprintAllocs.find((a) => a.playerId === p.playerId);
              return (
                <tr key={p.playerId}>
                  <td>{nameOf(p.playerId)}</td>
                  {config.teamModeEnabled && (
                    <td>
                      <input
                        type="checkbox"
                        checked={!excluded.includes(p.playerId)}
                        onChange={(e) => setExcluded((x) => (e.target.checked ? x.filter((u) => u !== p.playerId) : [...x, p.playerId]))}
                        aria-label={`Eligible: ${nameOf(p.playerId)}`}
                      />
                    </td>
                  )}
                  <td>{p.approvedWorkPoints}</td>
                  <td>{p.extraPoints || '—'}</td>
                  <td>{p.individualReward}</td>
                  {config.teamModeEnabled && <td>{p.teamReward}</td>}
                  {config.teamCreditSharingEnabled && <td>{p.sharedIn ? `+${p.sharedIn}` : p.sharedOut ? `−${p.sharedOut}` : '—'}</td>}
                  <td><strong>{p.totalPoints}</strong></td>
                  {(config.ppPerPoint > 0 || config.xpPerPoint > 0) && <td>{p.pp} / {p.xp}</td>}
                  <td className="cf-sub">{alloc ? (alloc.status === 'paid_out' ? 'Paid' : 'Accrued') : 'Preview'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="cf-row" style={{ marginTop: 12 }}>
        <button type="button" className="cf-btn cf-btn--primary" disabled={busy} onClick={finalize}>
          {busy ? 'Working…' : sprintAllocs.length ? 'Re-finalize sprint rewards' : 'Finalize sprint rewards'}
        </button>
        {config.payoutTiming === 'end_of_event' && (
          <button type="button" className="cf-btn cf-btn--green" disabled={busy || !accruedAll.length} onClick={payEvent}>
            Pay out event rewards ({new Set(accruedAll.map((a) => a.playerId)).size} players)
          </button>
        )}
        <span className="cf-sub">
          {paidCount ? `${paidCount} player(s) already paid for this sprint — they will not be paid again.` : ''}
          {pendingReview ? ` ${pendingReview} submission(s) still pending review.` : ''}
        </span>
      </div>
    </div>
  );
};

export default RewardsTab;
