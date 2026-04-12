/**
 * MST Skill Effects Engine — canonical payload for standardized battle effects.
 * Legacy moves use damage/healing/shieldBoost/debuffType on Move; opt in with `move.skillEffects`.
 */

export const SKILL_EFFECT_TYPES = [
  'heal',
  'confuse',
  'silence',
  'root',
  'delay',
  'reveal',
  'mark_target',
  'predict_move',
  'remove_buff',
  'transfer_debuff',
  'shield',
  'copy_last_move',
  'add_element_tag',
  'buff_attack',
  'buff_defense',
  'buff_speed',
  'reduce_cooldown',
] as const;

export type SkillEffectType = (typeof SKILL_EFFECT_TYPES)[number];

export type SkillEffectTargetScope =
  | 'self'
  | 'single'
  | 'ally'
  | 'enemy'
  | 'all_enemies'
  | 'all_allies';

/** Serializable effect definition (Firestore-safe when stored as plain JSON). */
export interface SkillEffectPayload {
  type: SkillEffectType;
  value?: number;
  secondaryValue?: number;
  duration?: number | null;
  chance?: number;
  targetScope?: SkillEffectTargetScope;
  stackable?: boolean;
  maxStacks?: number;
  elementTag?: string | null;
  metadata?: Record<string, unknown>;
}

/** Runtime instance applied to a combatant. */
export interface SkillEffectInstance {
  id: string;
  payload: SkillEffectPayload;
  /** null = no turn decay (removed explicitly or non-temporal) */
  remainingTurns: number | null;
  sourceId: string;
  stacks: number;
}

/** One-shot reactive buffer (e.g. predict next hit). */
export interface ReactiveEffectPredictMove {
  kind: 'predict_move';
  reductionPercent: number;
  /** Triggers consumed after this many qualifying hits (MVP: 1). */
  remainingTriggers: number;
  sourceId: string;
}

export type ReactiveEffect = ReactiveEffectPredictMove;
