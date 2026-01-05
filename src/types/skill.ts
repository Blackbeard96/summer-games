import { Move } from './battle';

/**
 * Unified Skill type that encompasses all skill sources:
 * - Manifest Skills (core skill set)
 * - Element Skills (elemental affinity)
 * - RR Candy Skills (reality-rewrite skills)
 */
export interface Skill {
  id: string;
  name: string;
  sourceType: 'manifest' | 'element' | 'rrCandy';
  sourceId?: string; // e.g. manifestName, elementName, candyType
  description: string;
  cost: number; // Skill cost in battle (formerly "move cost")
  cooldownTurns: number; // Cooldown in turns
  level: number; // Skill level (1-4 for element, 1-5 for others)
  mastery: {
    current: number; // Current mastery level (1-5)
    max: number; // Maximum mastery level (typically 5)
  };
  stats: {
    damage?: number;
    damageRange?: { min: number; max: number };
    ppSteal?: number;
    healing?: number;
    shieldBoost?: number;
    debuffType?: string;
    debuffStrength?: number;
    buffType?: string;
    buffStrength?: number;
    duration?: number;
  };
  tags?: string[]; // e.g. "attack", "defense", "control"
  unlocked: boolean;
  currentCooldown?: number; // Current cooldown remaining
  targetType?: 'self' | 'single' | 'team' | 'enemy' | 'enemy_team' | 'all';
  priority?: number; // Turn priority modifier (-2 to +2, default 0)
  category?: 'manifest' | 'elemental' | 'system'; // Legacy category for compatibility
  type?: 'attack' | 'defense' | 'utility' | 'support' | 'control' | 'mobility' | 'stealth' | 'reveal' | 'cleanse'; // Legacy type
  elementalAffinity?: 'fire' | 'water' | 'air' | 'earth' | 'lightning' | 'light' | 'shadow' | 'metal';
  manifestType?: 'reading' | 'writing' | 'drawing' | 'athletics' | 'singing' | 'gaming' | 'observation' | 'empathy' | 'creating' | 'cooking';
}

/**
 * Convert a Move to a Skill
 * This provides backward compatibility while transitioning to the unified Skill model
 */
export function moveToSkill(move: Move, sourceType: 'manifest' | 'element' | 'rrCandy' = 'manifest', sourceId?: string): Skill {
  return {
    id: move.id,
    name: move.name,
    sourceType,
    sourceId,
    description: move.description,
    cost: move.cost,
    cooldownTurns: move.cooldown,
    level: move.level,
    mastery: {
      current: move.masteryLevel,
      max: 5, // Default max mastery
    },
    stats: {
      damage: move.damage,
      ppSteal: move.ppSteal,
      healing: move.healing,
      shieldBoost: move.shieldBoost,
      debuffType: move.debuffType,
      debuffStrength: move.debuffStrength,
      buffType: move.buffType,
      buffStrength: move.buffStrength,
      duration: move.duration,
    },
    tags: move.type ? [move.type] : [],
    unlocked: move.unlocked,
    currentCooldown: move.currentCooldown,
    targetType: move.targetType,
    priority: move.priority,
    // Legacy fields for compatibility
    category: move.category,
    type: move.type,
    elementalAffinity: move.elementalAffinity,
    manifestType: move.manifestType,
  };
}

/**
 * Convert a Skill back to a Move (for backward compatibility with existing systems)
 */
export function skillToMove(skill: Skill): Move {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    category: skill.category || (skill.sourceType === 'element' ? 'elemental' : skill.sourceType === 'rrCandy' ? 'system' : 'manifest'),
    type: skill.type || 'attack',
    elementalAffinity: skill.elementalAffinity,
    manifestType: skill.manifestType,
    level: skill.level,
    cost: skill.cost,
    damage: skill.stats.damage,
    ppSteal: skill.stats.ppSteal,
    healing: skill.stats.healing,
    shieldBoost: skill.stats.shieldBoost,
    debuffType: skill.stats.debuffType as any,
    debuffStrength: skill.stats.debuffStrength,
    buffType: skill.stats.buffType as any,
    buffStrength: skill.stats.buffStrength,
    duration: skill.stats.duration,
    cooldown: skill.cooldownTurns,
    currentCooldown: skill.currentCooldown || 0,
    unlocked: skill.unlocked,
    masteryLevel: skill.mastery.current,
    targetType: skill.targetType,
    priority: skill.priority,
  };
}

/**
 * Group skills by source type for display
 */
export function groupSkillsBySource(skills: Skill[]): {
  manifest: Skill[];
  element: Skill[];
  rrCandy: Skill[];
} {
  return {
    manifest: skills.filter(s => s.sourceType === 'manifest'),
    element: skills.filter(s => s.sourceType === 'element'),
    rrCandy: skills.filter(s => s.sourceType === 'rrCandy'),
  };
}




