import React from 'react';
import type { CfConfig } from '../../../types/classFlowWork';
import { updateCfConfig } from '../../../utils/classFlowWorkService';
import type { CfToastInput } from '../classFlowPanelTypes';

interface Props {
  sessionId: string;
  config: CfConfig;
  notify: (t: CfToastInput) => void;
}

const FLAGS: [keyof CfConfig, string, string][] = [
  ['workAssignmentsEnabled', 'Work Assignments', 'Sprints carry assignments players submit. Off = classic Class Flow only.'],
  ['submissionApprovalRequired', 'Submission approval required', 'Off = submissions are approved automatically (facilitator verification still needs you).'],
  ['expandedTimerEnabled', 'Expanded timer', 'Players can expand the sprint timer into a full sprint view.'],
  ['teamModeEnabled', 'Team Mode', 'Group players into event teams and enable team rewards.'],
  ['contributionRewardsEnabled', 'Contribution-based rewards', 'Allows Contribution and Hybrid distribution. Off = equal team shares.'],
  ['extraCreditEnabled', 'Extra credit', 'Extra-credit tasks (flat bonus or multiplier) count once approved.'],
  ['teamCreditSharingEnabled', 'Team credit sharing', 'Teams may share part of their individual credit with eligible teammates.'],
  ['acceptLateSubmissions', 'Accept late submissions', 'Allow submissions after the sprint timer ends.'],
];

const SettingsTab: React.FC<Props> = ({ sessionId, config, notify }) => {
  const save = async (patch: Partial<CfConfig>) => {
    const res = await updateCfConfig(sessionId, patch);
    if (!res.ok) notify({ title: 'Settings not saved', body: res.error, tone: 'bad' });
  };
  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Number(v) || 0));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="cf-card">
        <div className="cf-stat-label" style={{ marginBottom: 8 }}>Feature flags (this session)</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {FLAGS.map(([key, label, help]) => (
            <label key={key} className="cf-check" style={{ alignItems: 'flex-start' }}>
              <input type="checkbox" checked={!!config[key]} onChange={(e) => save({ [key]: e.target.checked } as Partial<CfConfig>)} />
              <span>
                <strong>{label}</strong>
                <div className="cf-sub">{help}</div>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="cf-card">
        <div className="cf-stat-label" style={{ marginBottom: 8 }}>Rewards</div>
        <div className="cf-row">
          <label className="cf-label">
            Distribution
            <select
              className="cf-select"
              value={config.distributionMode}
              disabled={!config.teamModeEnabled || !config.contributionRewardsEnabled}
              onChange={(e) => save({ distributionMode: e.target.value as CfConfig['distributionMode'] })}
            >
              <option value="hybrid">C — Hybrid (recommended)</option>
              <option value="contribution">B — Contribution-based</option>
              <option value="equal">A — Equal team distribution</option>
            </select>
          </label>
          <label className="cf-label">
            Hybrid team share %
            <input className="cf-input" type="number" min={0} max={100} defaultValue={config.hybridTeamPercent} key={`h${config.hybridTeamPercent}`} onBlur={(e) => save({ hybridTeamPercent: num(e.target.value, 0, 100) })} style={{ width: 90 }} />
          </label>
          <label className="cf-label">
            Payout timing
            <select className="cf-select" value={config.payoutTiming} onChange={(e) => save({ payoutTiming: e.target.value as CfConfig['payoutTiming'] })}>
              <option value="per_sprint">After each sprint</option>
              <option value="end_of_event">Once at the end of the event</option>
            </select>
          </label>
          <label className="cf-label">
            PP per Sprint Point
            <input className="cf-input" type="number" min={0} max={100} step={0.1} defaultValue={config.ppPerPoint} key={`pp${config.ppPerPoint}`} onBlur={(e) => save({ ppPerPoint: num(e.target.value, 0, 100) })} style={{ width: 90 }} />
          </label>
          <label className="cf-label">
            XP per Sprint Point
            <input className="cf-input" type="number" min={0} max={100} step={0.1} defaultValue={config.xpPerPoint} key={`xp${config.xpPerPoint}`} onBlur={(e) => save({ xpPerPoint: num(e.target.value, 0, 100) })} style={{ width: 90 }} />
          </label>
        </div>
        <div className="cf-sub" style={{ marginTop: 6 }}>
          Sprint Points are not PP or XP. They convert only when you set a rate above (0 = no conversion).
        </div>
      </div>

      <div className="cf-card">
        <div className="cf-stat-label" style={{ marginBottom: 8 }}>Extra credit limits</div>
        <div className="cf-row">
          <label className="cf-label">
            Max bonus per player (0 = no cap)
            <input className="cf-input" type="number" min={0} defaultValue={config.bonusLimits.maxBonusPerPlayer} key={`mb${config.bonusLimits.maxBonusPerPlayer}`} onBlur={(e) => save({ bonusLimits: { ...config.bonusLimits, maxBonusPerPlayer: num(e.target.value, 0, 100000) } })} style={{ width: 100 }} />
          </label>
          <label className="cf-label">
            Max multiplier
            <input className="cf-input" type="number" min={1} max={5} step={0.05} defaultValue={config.bonusLimits.maxMultiplier} key={`mm${config.bonusLimits.maxMultiplier}`} onBlur={(e) => save({ bonusLimits: { ...config.bonusLimits, maxMultiplier: num(e.target.value, 1, 5) } })} style={{ width: 90 }} />
          </label>
          <label className="cf-check">
            <input type="checkbox" checked={config.bonusLimits.allowStacking} onChange={(e) => save({ bonusLimits: { ...config.bonusLimits, allowStacking: e.target.checked } })} />
            Bonuses stack
          </label>
          <label className="cf-check">
            <input type="checkbox" checked={config.bonusLimits.extraCountsToTeam} onChange={(e) => save({ bonusLimits: { ...config.bonusLimits, extraCountsToTeam: e.target.checked } })} />
            Extra credit counts toward team total (off = individual rewards only)
          </label>
        </div>
      </div>

      <div className="cf-card">
        <div className="cf-stat-label" style={{ marginBottom: 8 }}>Team credit sharing</div>
        <div className="cf-row">
          <label className="cf-label">
            Who initiates
            <select className="cf-select" value={config.sharing.initiator} onChange={(e) => save({ sharing: { ...config.sharing, initiator: e.target.value as CfConfig['sharing']['initiator'] } })}>
              <option value="majority">Team majority vote (recommended)</option>
              <option value="captain">Team captain</option>
              <option value="facilitator">Facilitator only</option>
            </select>
          </label>
          <label className="cf-label">
            Max share %
            <input className="cf-input" type="number" min={0} max={100} defaultValue={config.sharing.maxPercent} key={`sp${config.sharing.maxPercent}`} onBlur={(e) => save({ sharing: { ...config.sharing, maxPercent: num(e.target.value, 0, 100) } })} style={{ width: 90 }} />
          </label>
          <label className="cf-check">
            <input type="checkbox" checked={config.sharing.allowCustom} onChange={(e) => save({ sharing: { ...config.sharing, allowCustom: e.target.checked } })} />
            Allow custom percentages
          </label>
        </div>
        <div className="cf-sub" style={{ marginTop: 6 }}>
          Options shown to teams: {config.sharing.options.map((o) => (o === 0 ? 'nothing' : `${o}%`)).join(', ')}. Every decision needs your approval and only moves individual credit — team rewards are never reduced.
        </div>
      </div>
    </div>
  );
};

export default SettingsTab;
