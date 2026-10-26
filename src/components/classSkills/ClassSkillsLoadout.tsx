import React, { useEffect, useMemo, useState } from 'react';
import SkillCardArt from '../skillCard/SkillCardArt';
import type { ClassSkill } from '../../types/classSkills';
import { CLASS_SKILL_ELEMENTS } from '../../types/classSkills';
import { IRL_TARGET_LABELS, describeDuration, elementalLevelFromMoves } from '../../utils/classSkillsConfig';
import { classSkillArtKey, subscribeClassSkills } from '../../utils/classSkillsService';
import '../classFlow/classFlow.css';
import './classSkills.css';

interface ClassSkillsLoadoutProps {
  /** The player's battle moves; elemental level = highest unlocked elemental move (existing progression). */
  moves: unknown[];
}

/** Read-only Class Skills (IRL) list, separate from battle skills. Activation happens in Live Events. */
const ClassSkillsLoadout: React.FC<ClassSkillsLoadoutProps> = ({ moves }) => {
  const [skills, setSkills] = useState<ClassSkill[]>([]);
  useEffect(() => subscribeClassSkills(setSkills), []);

  const levels = useMemo(() => {
    const out: Record<string, number> = {};
    CLASS_SKILL_ELEMENTS.forEach((el) => (out[el] = elementalLevelFromMoves(moves, el)));
    return out;
  }, [moves]);
  const mine = skills.filter((s) => s.status === 'active' && (levels[s.element] || 0) > 0);
  if (!mine.length) return null;

  return (
    <div className="cf-root cs-root" style={{ marginBottom: '2rem' }} data-testid="class-skills-loadout">
      <h4 className="cf-title">Class Skills (IRL)</h4>
      <div className="cf-sub" style={{ marginBottom: 10 }}>
        Classroom skills that unlock with your elemental level. Use them in Live Events when your facilitator turns Class Skills on. They never change battle stats.
      </div>
      <div className="cs-skill-grid">
        {mine.map((s) => {
          const unlocked = (levels[s.element] || 0) >= s.level;
          return (
            <div key={s.id} className={`cs-skill cs-el-${s.element}${unlocked ? '' : ' cs-skill--locked'}`}>
              <SkillCardArt skill={{ id: classSkillArtKey(s.id), name: s.name, category: 'elemental', elementalAffinity: s.element }} alt="" className="cs-skill-art" />
              <div className="cs-skill-body">
                <div className="cs-skill-name">{s.name}</div>
                <div className="cf-sub">
                  Lv {s.level} · {IRL_TARGET_LABELS[s.targetType]} · {describeDuration(s)}
                </div>
                <div className="cs-skill-effect">{s.irlEffect || s.description}</div>
                <div className={unlocked ? 'cf-status-approved' : 'cs-skill-reason'} style={{ fontSize: 12 }}>
                  {unlocked ? 'Unlocked' : `Unlocks at ${s.element} level ${s.level}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ClassSkillsLoadout;
