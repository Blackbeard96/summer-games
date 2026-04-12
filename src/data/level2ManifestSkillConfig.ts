/**
 * Data-driven Level 2 Manifest Skill builder rules.
 * Targets scale with player level; impacts scale with manifest type (Offensive / Enhance / Utility).
 */

import type {
  Level2ManifestImpact,
  Level2ManifestImpactArea,
  Level2ManifestResult,
  Level2ManifestTarget,
  Level2ManifestTypeCategory,
} from '../types/level2Manifest';

export const LEVEL2_MANIFEST_TYPE_LABELS: Record<Level2ManifestTypeCategory, string> = {
  offensive: 'Offensive',
  defensive: 'Defensive',
  enhance: 'Enhance',
  utility: 'Utility',
};

export const LEVEL2_TARGET_LABELS: Record<Level2ManifestTarget, string> = {
  single_ally_or_enemy: 'Single enemy or ally',
  two_allies_or_enemies: '2 enemies or allies',
  four_allies_or_enemies: '4 enemies or allies',
  all_allies_or_enemies: 'ALL enemies or allies',
  one_object_space: 'One object / space',
};

export const LEVEL2_IMPACT_AREA_LABELS: Record<Level2ManifestImpactArea, string> = {
  player_skills: 'Player skills',
  pp: 'PP',
  cooldowns: 'Cooldowns',
};

export const LEVEL2_IMPACT_LABELS: Record<Level2ManifestImpact, string> = {
  offensive_add: 'Add',
  offensive_remove: 'Remove',
  offensive_stun_freeze: 'Stun / Freeze',
  enhance_increase: 'Increase',
  enhance_decrease: 'Decrease',
  utility_confuse: 'Confuse',
  damage: 'Damage',
  shield: 'Shield',
  heal: 'Heal',
  reveal: 'Reveal',
  silence: 'Silence',
  root: 'Root',
  delay: 'Delay',
  buff_attack: 'Buff attack',
  buff_defense: 'Buff defense',
  buff_speed: 'Buff speed',
  reduce_cooldown: 'Reduce cooldown',
  copy_last_move: 'Copy last move',
  mark_target: 'Mark target',
  predict_move: 'Predict move',
  remove_buff: 'Remove buff',
  transfer_debuff: 'Transfer debuff',
  add_element_tag: 'Add element tag',
};

export const LEVEL2_RESULT_LABELS: Record<Level2ManifestResult, string> = {
  small: 'Small',
  medium: 'Medium',
  strong: 'Strong',
  cleanse_1: 'Cleanse 1',
  duration_1: 'Duration 1 Turn',
  duration_2: 'Duration 2 Turns',
  bonus_if_marked: 'Bonus if Marked',
  bonus_in_meta_state: 'Bonus in Meta / Flow State',
  bonus_on_streak: 'Bonus on Streak',
  refund_1_pp: 'Refund 1 PP',
  gain_1_shield: 'Gain 1 Shield',
  expose_next_move: 'Expose Next Move',
  apply_status: 'Apply Status',
  hits_through_shield: 'Hits Through Shield',
  cannot_crit: 'Cannot Crit',
};

export const LEVEL2_ALL_TYPES: Level2ManifestTypeCategory[] = [
  'offensive',
  'defensive',
  'enhance',
  'utility',
];

export const LEVEL2_ALL_TARGETS: Level2ManifestTarget[] = [
  'single_ally_or_enemy',
  'two_allies_or_enemies',
  'four_allies_or_enemies',
  'all_allies_or_enemies',
  'one_object_space',
];

export const LEVEL2_ALL_IMPACT_AREAS: Level2ManifestImpactArea[] = ['player_skills', 'pp', 'cooldowns'];

export const LEVEL2_ALL_IMPACTS: Level2ManifestImpact[] = [
  'offensive_add',
  'offensive_remove',
  'offensive_stun_freeze',
  'enhance_increase',
  'enhance_decrease',
  'utility_confuse',
  'damage',
  'shield',
  'heal',
  'reveal',
  'silence',
  'root',
  'delay',
  'buff_attack',
  'buff_defense',
  'buff_speed',
  'reduce_cooldown',
  'copy_last_move',
  'mark_target',
  'predict_move',
  'remove_buff',
  'transfer_debuff',
  'add_element_tag',
];

export const LEVEL2_ALL_RESULTS: Level2ManifestResult[] = [
  'small',
  'medium',
  'strong',
  'cleanse_1',
  'duration_1',
  'duration_2',
  'bonus_if_marked',
  'bonus_in_meta_state',
  'bonus_on_streak',
  'refund_1_pp',
  'gain_1_shield',
  'expose_next_move',
  'apply_status',
  'hits_through_shield',
  'cannot_crit',
];

/** Targets unlocked at this player level (1-based). */
export function level2TargetsUnlockedAtLevel(level: number): Level2ManifestTarget[] {
  const lv = Math.max(1, Math.floor(level || 1));
  const out: Level2ManifestTarget[] = ['single_ally_or_enemy'];
  if (lv >= 6) out.push('two_allies_or_enemies');
  if (lv >= 11) out.push('four_allies_or_enemies');
  if (lv >= 20) out.push('all_allies_or_enemies');
  return out;
}

/** Inclusive PP range for the Result dropdown when impact area is PP (player level 1-based). */
export function level2PpResultRange(level: number): { min: number; max: number } {
  const lv = Math.max(1, Math.floor(level || 1));
  if (lv <= 5) return { min: 5, max: 10 };
  if (lv <= 10) return { min: 11, max: 20 };
  if (lv <= 19) return { min: 20, max: 40 };
  return { min: 50, max: 100 };
}

/**
 * Maximum turn count allowed for Player skills / Cooldowns at this player level (cap for the Result dropdown).
 * Player may pick any integer from 1 through this value in the builder.
 */
export function level2TurnResultForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(level || 1));
  if (lv <= 5) return 1;
  if (lv <= 10) return 2;
  if (lv <= 19) return 3;
  return 4;
}

/** Discrete magnitudes offered in the builder for the current level and impact area. */
export function level2ResultMagnitudeOptions(
  level: number,
  impactArea: Level2ManifestImpactArea
): number[] {
  if (impactArea === 'pp') {
    const { min, max } = level2PpResultRange(level);
    const out: number[] = [];
    for (let n = min; n <= max; n++) out.push(n);
    return out;
  }
  const maxTurns = level2TurnResultForLevel(level);
  const out: number[] = [];
  for (let t = 1; t <= maxTurns; t++) out.push(t);
  return out;
}

/** Best-effort magnitude when loading legacy skills that only stored `result`. */
export function inferLegacyLevel2ResultMagnitude(
  result: Level2ManifestResult,
  impactArea: Level2ManifestImpactArea
): number {
  if (impactArea === 'pp') {
    switch (result) {
      case 'small':
        return 8;
      case 'medium':
        return 16;
      case 'strong':
        return 30;
      default:
        return 10;
    }
  }
  if (result === 'duration_2' || result === 'duration_1') {
    return result === 'duration_2' ? 2 : 1;
  }
  return 1;
}

/** Impact verbs allowed for the selected manifest type (Defensive uses the same toolbox as Utility). */
export function level2ImpactsForManifestType(
  manifestType: Level2ManifestTypeCategory
): Level2ManifestImpact[] {
  switch (manifestType) {
    case 'offensive':
      return ['offensive_add', 'offensive_remove', 'offensive_stun_freeze'];
    case 'enhance':
      return ['enhance_increase', 'enhance_decrease'];
    case 'defensive':
    case 'utility':
      return [
        'heal',
        'utility_confuse',
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
      ];
    default:
      return ['reveal'];
  }
}

/** Impact power tier for PP / cooldown baselines (1 = light, 3 = heavy). */
export const LEVEL2_IMPACT_POWER_TIER: Record<Level2ManifestImpact, 1 | 2 | 3> = {
  offensive_add: 2,
  offensive_remove: 2,
  offensive_stun_freeze: 3,
  enhance_increase: 2,
  enhance_decrease: 2,
  utility_confuse: 3,
  reveal: 1,
  mark_target: 1,
  add_element_tag: 1,
  reduce_cooldown: 2,
  buff_speed: 2,
  buff_attack: 2,
  buff_defense: 2,
  heal: 2,
  shield: 2,
  delay: 2,
  remove_buff: 2,
  damage: 2,
  silence: 3,
  root: 3,
  copy_last_move: 3,
  predict_move: 2,
  transfer_debuff: 2,
};

/** Extra PP steps from result modifier. */
export const LEVEL2_RESULT_PP_BUMP: Record<Level2ManifestResult, number> = {
  small: 0,
  medium: 1,
  strong: 2,
  cleanse_1: 0,
  duration_1: 0,
  duration_2: 1,
  bonus_if_marked: 0,
  bonus_in_meta_state: 0,
  bonus_on_streak: 0,
  refund_1_pp: -1,
  gain_1_shield: 0,
  expose_next_move: 1,
  apply_status: 1,
  hits_through_shield: 1,
  cannot_crit: -1,
};

export interface ManifestLevel2Allowlist {
  manifestTypes: Level2ManifestTypeCategory[];
  results: Level2ManifestResult[];
  /** Additional targets beyond level defaults (e.g. Object/Space for Drawing). */
  extraTargets?: Level2ManifestTarget[];
}

/**
 * Per-manifest allowed dropdown values. Missing manifest id falls back to `default`.
 * Impacts are chosen from manifest type; targets from player level ∩ optional extraTargets.
 */
export const LEVEL2_MANIFEST_ALLOWLISTS: Record<string, ManifestLevel2Allowlist> = {
  default: {
    manifestTypes: [...LEVEL2_ALL_TYPES],
    results: [...LEVEL2_ALL_RESULTS],
  },
  reading: {
    manifestTypes: ['utility', 'enhance', 'offensive'],
    results: ['small', 'medium', 'expose_next_move', 'bonus_in_meta_state', 'bonus_if_marked', 'duration_1'],
  },
  writing: {
    manifestTypes: ['enhance', 'utility', 'defensive'],
    results: ['medium', 'strong', 'duration_2', 'cleanse_1', 'apply_status'],
  },
  drawing: {
    manifestTypes: ['utility', 'defensive', 'enhance'],
    results: ['small', 'medium', 'duration_1', 'duration_2', 'apply_status'],
    extraTargets: ['one_object_space'],
  },
  athletics: {
    manifestTypes: ['offensive', 'enhance', 'utility'],
    results: ['small', 'medium', 'strong', 'bonus_on_streak', 'hits_through_shield'],
  },
  singing: {
    manifestTypes: ['enhance', 'defensive', 'utility'],
    results: ['cleanse_1', 'duration_1', 'duration_2', 'small', 'medium', 'gain_1_shield'],
  },
  gaming: {
    manifestTypes: ['utility', 'offensive', 'enhance'],
    results: ['bonus_if_marked', 'refund_1_pp', 'expose_next_move', 'small', 'medium', 'bonus_on_streak'],
  },
  observation: {
    manifestTypes: ['utility', 'enhance'],
    results: ['small', 'medium', 'expose_next_move', 'bonus_in_meta_state'],
  },
  empathy: {
    manifestTypes: ['defensive', 'enhance', 'utility'],
    results: ['cleanse_1', 'small', 'medium', 'duration_2', 'gain_1_shield'],
  },
  creating: {
    manifestTypes: ['utility', 'enhance', 'defensive'],
    results: ['medium', 'duration_1', 'duration_2', 'refund_1_pp', 'apply_status'],
    extraTargets: ['one_object_space'],
  },
  cooking: {
    manifestTypes: ['enhance', 'defensive', 'utility'],
    results: ['cleanse_1', 'small', 'medium', 'gain_1_shield', 'duration_2'],
  },
};

/** Map pre–Season-1 builder target ids onto level‑scoped targets. */
const LEGACY_TARGET_MAP: Record<string, Level2ManifestTarget> = {
  one_enemy: 'single_ally_or_enemy',
  one_ally: 'single_ally_or_enemy',
  ally_or_enemy: 'single_ally_or_enemy',
  random_opponent: 'single_ally_or_enemy',
};

export function normalizeLevel2ManifestTarget(raw: unknown): Level2ManifestTarget {
  const s = String(raw || '').trim();
  if (LEGACY_TARGET_MAP[s]) return LEGACY_TARGET_MAP[s];
  if (LEVEL2_ALL_TARGETS.includes(s as Level2ManifestTarget)) return s as Level2ManifestTarget;
  return 'single_ally_or_enemy';
}

export function getAllowlistForManifest(manifestId: string | undefined | null): ManifestLevel2Allowlist {
  const id = (manifestId || '').trim().toLowerCase();
  return LEVEL2_MANIFEST_ALLOWLISTS[id] || LEVEL2_MANIFEST_ALLOWLISTS.default;
}

export function basePpAndCooldown(
  impact: Level2ManifestImpact,
  result: Level2ManifestResult
): { pp: number; cooldown: number } {
  const tier = LEVEL2_IMPACT_POWER_TIER[impact] ?? 2;
  let pp: number = tier;
  pp += LEVEL2_RESULT_PP_BUMP[result] ?? 0;
  pp = Math.min(5, Math.max(1, pp));
  let cooldown = 2 + tier + (LEVEL2_RESULT_PP_BUMP[result] > 0 ? 1 : 0);
  cooldown = Math.min(6, Math.max(2, cooldown));
  return { pp, cooldown };
}

/** PP / cooldown for skills built with `resultMagnitude` + `impactArea`. */
export function basePpAndCooldownLevel2(
  impact: Level2ManifestImpact,
  impactArea: Level2ManifestImpactArea,
  resultMagnitude: number
): { pp: number; cooldown: number } {
  const tier = LEVEL2_IMPACT_POWER_TIER[impact] ?? 2;
  let pp: number = tier;
  let cooldown: number = 2 + tier;
  const mag = Math.max(0, Math.floor(resultMagnitude));

  if (impactArea === 'pp') {
    const band = mag <= 10 ? 0 : mag <= 20 ? 1 : mag <= 40 ? 2 : 3;
    pp += band;
    if (band > 0) cooldown += 1;
  } else {
    const turns = Math.max(1, Math.min(4, mag));
    pp += Math.min(2, turns - 1);
    cooldown += Math.min(2, turns - 1);
  }

  pp = Math.min(5, Math.max(1, pp));
  cooldown = Math.min(6, Math.max(2, cooldown));
  return { pp, cooldown };
}
