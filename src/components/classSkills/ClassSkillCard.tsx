import React from 'react';
import SkillCardArt from '../skillCard/SkillCardArt';
import type { ClassSkill } from '../../types/classSkills';
import { IRL_TARGET_LABELS, describeDuration, describeEffect, isDirectEffectType } from '../../utils/classSkillsConfig';
import { classSkillArtKey } from '../../utils/classSkillsService';

export type ClassSkillCardTone = 'ready' | 'locked' | 'muted' | 'active' | 'warn';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtCooldown = (s: number) => (s <= 0 ? 'None' : s % 60 === 0 ? `${s / 60} min` : s > 60 ? `${Math.floor(s / 60)} min ${s % 60}s` : `${s}s`);

/** One Class Skill with everything a player needs to decide (art, element, level, target, effect, cost, cooldown). */
const ClassSkillCard: React.FC<{
  skill: ClassSkill;
  /** Participation Points per activation. */
  cost: number;
  status?: { label: string; tone: ClassSkillCardTone } | null;
  equipped?: boolean;
  compact?: boolean;
  children?: React.ReactNode;
}> = ({ skill, cost, status, equipped, compact, children }) => {
  const direct = skill.effects.filter((e) => isDirectEffectType(e.type));
  const locked = status?.tone === 'locked' || status?.tone === 'muted';
  return (
    <div className={`cs-skill cs-el-${skill.element}${locked ? ' cs-skill--locked' : ''}${equipped ? ' cs-skill--equipped' : ''}`} data-testid={`class-skill-card-${skill.id}`}>
      <SkillCardArt skill={{ id: classSkillArtKey(skill.id), name: skill.name, category: 'elemental', elementalAffinity: skill.element }} alt="" className="cs-skill-art" />
      <div className="cs-skill-body">
        <div className="cf-between" style={{ alignItems: 'flex-start' }}>
          <div className="cs-skill-name">{skill.name}</div>
          {equipped && <span className="cs-chip cs-chip--equipped">Equipped</span>}
        </div>
        <div className="cf-sub">
          {cap(skill.element)} · Lv {skill.level} · {IRL_TARGET_LABELS[skill.targetType]}
        </div>
        {!compact && skill.description && <div className="cf-sub">{skill.description}</div>}
        <div className="cs-skill-effect">{skill.irlEffect || skill.effects[0]?.behavior || skill.description}</div>
        {direct.map((e) => (
          <div key={e.id} className="cf-sub">
            ⚡ {describeEffect(e)}
          </div>
        ))}
        <div className="cf-sub">
          Cost {cost} Participation Point{cost === 1 ? '' : 's'} · Cooldown {fmtCooldown(skill.cooldownSeconds)}
          {skill.effects.some((e) => !isDirectEffectType(e.type)) ? ` · ${describeDuration(skill)}` : ''}
        </div>
        {status && <div className={`cs-chip cs-chip--${status.tone}`}>{status.label}</div>}
        {children}
      </div>
    </div>
  );
};

export default ClassSkillCard;
