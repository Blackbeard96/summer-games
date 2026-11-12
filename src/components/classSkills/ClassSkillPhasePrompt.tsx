import React, { useState } from 'react';
import type { ClassSkill, ClassSkillPhase } from '../../types/classSkills';
import { formatRuleClock } from '../../utils/classSkillsConfig';
import { phaseRemainingMs } from '../../utils/classSkillPhase';
import ClassSkillCard, { type ClassSkillCardTone } from './ClassSkillCard';

export interface PhasePromptSkill {
  skill: ClassSkill;
  cost: number;
  status: { label: string; tone: ClassSkillCardTone };
  canUse: boolean;
}

/** Shown to every participating player when a Battle Sprint ends and the Class Skill Phase opens. */
const ClassSkillPhasePrompt: React.FC<{
  phase: ClassSkillPhase;
  nowMs: number;
  participationPoints: number;
  cost: number;
  equipped: PhasePromptSkill[];
  /** Unlocked skills that can still be equipped (free slots). */
  equipOptions: ClassSkill[];
  onChoose: (skill: ClassSkill) => void;
  onEquip: (skill: ClassSkill) => Promise<void>;
  onPass: () => Promise<void>;
}> = ({ phase, nowMs, participationPoints, cost, equipped, equipOptions, onChoose, onEquip, onPass }) => {
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const left = phaseRemainingMs(phase, nowMs);

  const pass = async () => {
    setBusy(true);
    await onPass();
    setBusy(false);
  };

  return (
    <div className="cf-modal-backdrop" role="dialog" aria-modal="true" aria-label="Class Skill Phase" data-testid="class-skill-phase-prompt">
      <div className="cf-root cs-root cf-modal cs-phase-prompt">
        <h2 className="cs-phase-title">SPRINT COMPLETE</h2>
        <p style={{ textAlign: 'center', margin: '8px 0 0' }}>
          The Class Skill Phase has begun. Choose one equipped Class Skill to use before the next Sprint begins, or pass.
        </p>
        <div className="cs-phase-meta">
          <span>
            Time left: <strong className="cs-phase-clock">{formatRuleClock(left)}</strong>
          </span>
          <span>
            Participation Points: <strong>{participationPoints}</strong>
          </span>
          <span>
            Class Skill Cost: <strong>{cost} Participation Points</strong>
          </span>
        </div>

        {!choosing ? (
          <div className="cf-row" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button type="button" className="cf-btn cf-btn--primary" disabled={busy} onClick={() => setChoosing(true)} data-testid="phase-choose">
              Choose Class Skill
            </button>
            <button type="button" className="cf-btn cf-btn--ghost" disabled={busy} onClick={pass} data-testid="phase-pass">
              {busy ? 'Passing…' : 'Pass'}
            </button>
          </div>
        ) : (
          <>
            {equipped.length === 0 ? (
              <div className="cf-empty">You have no Class Skills equipped.{equipOptions.length ? ' Equip one below.' : ''}</div>
            ) : (
              <div className="cs-skill-grid" style={{ marginTop: 10 }}>
                {equipped.map(({ skill, cost: c, status, canUse }) => (
                  <ClassSkillCard key={skill.id} skill={skill} cost={c} status={status} equipped compact>
                    <button type="button" className="cf-btn cf-btn--primary" disabled={!canUse || busy} onClick={() => onChoose(skill)}>
                      Use
                    </button>
                  </ClassSkillCard>
                ))}
              </div>
            )}
            {equipOptions.length > 0 && (
              <>
                <div className="cf-stat-label" style={{ margin: '12px 0 6px' }}>
                  Equip an unlocked Class Skill
                </div>
                <div className="cs-skill-grid">
                  {equipOptions.map((s) => (
                    <ClassSkillCard key={s.id} skill={s} cost={cost} compact status={{ label: 'Unlocked', tone: 'ready' }}>
                      <button
                        type="button"
                        className="cf-btn cf-btn--ghost"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          await onEquip(s);
                          setBusy(false);
                        }}
                      >
                        Equip
                      </button>
                    </ClassSkillCard>
                  ))}
                </div>
              </>
            )}
            <div className="cf-row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
              <button type="button" className="cf-btn cf-btn--ghost" disabled={busy} onClick={() => setChoosing(false)}>
                Back
              </button>
              <button type="button" className="cf-btn cf-btn--ghost" disabled={busy} onClick={pass}>
                Pass
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ClassSkillPhasePrompt;
