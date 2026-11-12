import React, { useState } from 'react';
import type { ClassSkillPhase, IrlActivation, IrlEventConfig } from '../../types/classSkills';
import { formatRuleClock } from '../../utils/classSkillsConfig';
import { PHASE_CLOSE_LABELS, phaseRemainingMs, phaseSummary, type PhaseSprint, sprintClassSkillsEnabled } from '../../utils/classSkillPhase';
import { describeResolvedEffect } from '../../utils/classSkillDirectEffects';
import { sprintPhase } from '../../utils/classFlowConfig';

const OUTCOME_LABEL = { activated: 'Activated', passed: 'Passed', pending: 'Pending approval', no_response: 'No response' } as const;

/** Facilitator view of the post-sprint Class Skill Phase. */
const ClassSkillPhaseFacilitator: React.FC<{
  phase: ClassSkillPhase | null;
  sprint: PhaseSprint | null;
  config: IrlEventConfig;
  activations: IrlActivation[];
  nowMs: number;
  nameOf: (uid: string) => string;
  onOpen: () => Promise<void>;
  onClose: (phaseId: string) => Promise<void>;
  onExtend: (phaseId: string, seconds: number) => Promise<void>;
  onToggleSprint: (sprintId: string, enabled: boolean) => Promise<void>;
  onShowApprovals: () => void;
}> = ({ phase, sprint, config, activations, nowMs, nameOf, onOpen, onClose, onExtend, onToggleSprint, onShowApprovals }) => {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const sprintOn = sprintClassSkillsEnabled(config, sprint);
  const sprintState = sprint ? sprintPhase(sprint.timer, nowMs) : null;
  const open = !!phase && phase.status === 'open';
  const left = phase ? phaseRemainingMs(phase, nowMs) : 0;
  const rows = phase ? phaseSummary(phase, activations) : [];
  const count = (o: keyof typeof OUTCOME_LABEL) => rows.filter((r) => r.outcome === o).length;
  const pending = rows.reduce((n, r) => n + r.activations.filter((a) => a.status === 'pending').length, 0);
  const vaultLines = rows.flatMap((r) => r.activations.filter((a) => a.status === 'approved').flatMap((a) => a.resolvedEffects.map((e) => describeResolvedEffect(e, nameOf))));

  return (
    <div data-testid="class-skill-phase-facilitator">
      <div className="cf-row" style={{ alignItems: 'center', gap: 12 }}>
        {sprint ? (
          <label className="cf-check">
            <input type="checkbox" checked={sprintOn} disabled={busy || !config.enabled} onChange={(e) => run(() => onToggleSprint(sprint.id, e.target.checked))} />
            Class Skills for this sprint ({sprint.title})
          </label>
        ) : (
          <span className="cf-sub">No sprint yet. A Class Skill Phase opens automatically when each sprint ends.</span>
        )}
        <span className="cf-sub">
          Default for new sprints: {config.sprintPhaseDefault ? 'Enabled' : 'Disabled'} · Phase {config.phaseSeconds}s · {config.activationLimit} activation
          {config.activationLimit === 1 ? '' : 's'} per player · Cost {config.costSource === 'event' ? `${config.classSkillCost} Participation Points` : 'set per skill'}
        </span>
      </div>

      <div className={`cs-phase-banner${open ? ' cs-phase-banner--open' : ''}`}>
        <div>
          <strong>
            {open
              ? `Class Skill Phase open — after "${phase!.sprintTitle}"`
              : phase
                ? `Last phase closed (${PHASE_CLOSE_LABELS[phase.closeReason || ''] || phase.closeReason || 'closed'})`
                : 'No Class Skill Phase yet'}
          </strong>
          <div className="cf-sub">
            {sprintState === 'running' || sprintState === 'paused'
              ? 'Sprint in progress — Class Skills unlock when it ends.'
              : open
                ? `${count('activated')} activated · ${count('passed')} passed · ${count('pending')} pending · ${count('no_response')} no response · ${phase!.ppSpent} Participation Points spent`
                : phase
                  ? `${count('activated')} activated · ${count('passed')} passed · ${count('no_response')} no response · ${phase.ppSpent} Participation Points spent`
                  : ''}
          </div>
        </div>
        {open && <span className="cs-phase-clock">{formatRuleClock(left)}</span>}
      </div>

      <div className="cf-row" style={{ marginTop: 10 }}>
        {open ? (
          <>
            <button type="button" className="cf-btn cf-btn--ghost" disabled={busy} onClick={() => run(() => onExtend(phase!.id, 15))}>
              +15s
            </button>
            <button type="button" className="cf-btn cf-btn--ghost" disabled={busy} onClick={() => run(() => onExtend(phase!.id, 30))}>
              +30s
            </button>
            <button type="button" className="cf-btn cf-btn--red" disabled={busy} onClick={() => run(() => onClose(phase!.id))}>
              End phase now
            </button>
            {pending > 0 && (
              <button type="button" className="cf-btn cf-btn--primary" onClick={onShowApprovals}>
                Review {pending} pending approval{pending === 1 ? '' : 's'}
              </button>
            )}
          </>
        ) : (
          <button type="button" className="cf-btn cf-btn--primary" disabled={busy || !config.enabled || sprintState === 'running' || sprintState === 'paused'} onClick={() => run(onOpen)}>
            Open Class Skill Phase now
          </button>
        )}
      </div>

      {phase && rows.length > 0 && (
        <table className="cf-table" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Player</th>
              <th>Status</th>
              <th>Skill → target</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.uid}>
                <td>{nameOf(r.uid)}</td>
                <td>{OUTCOME_LABEL[r.outcome]}</td>
                <td>
                  {r.activations.length
                    ? r.activations.map((a) => (
                        <div key={a.id}>
                          {a.skillName} → {a.targetLabel || '—'} <span className="cf-sub">({a.status}{a.status === 'approved' ? ` · −${a.costCharged} PartP` : ''})</span>
                        </div>
                      ))
                    : '—'}
                </td>
                <td>
                  {r.activations.flatMap((a) =>
                    a.status === 'rejected' && a.reason
                      ? [<div key={a.id} className="cf-sub">{a.reason}</div>]
                      : a.resolvedEffects.map((e, i) => (
                          <div key={`${a.id}-${i}`} className="cf-sub">
                            {describeResolvedEffect(e, nameOf)}
                          </div>
                        ))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {vaultLines.length > 0 && (
        <div className="cf-sub" style={{ marginTop: 8 }}>
          Vault changes this phase: {vaultLines.length}
        </div>
      )}
    </div>
  );
};

export default ClassSkillPhaseFacilitator;
