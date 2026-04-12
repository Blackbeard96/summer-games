/**
 * Season 1 — Level 2 Manifest custom skills (Live Events only).
 * Level 1 manifest skills stay on the existing battle/skill tree path.
 */

export type Level2ManifestTypeCategory = 'offensive' | 'defensive' | 'enhance' | 'utility';

/** Target scope is gated by player level in the builder (1–5 → single, …, 20+ → all). */
export type Level2ManifestTarget =
  | 'single_ally_or_enemy'
  | 'two_allies_or_enemies'
  | 'four_allies_or_enemies'
  | 'all_allies_or_enemies'
  | 'one_object_space';

/**
 * What the impact applies to (PP pool, skill bar, or cooldown timers).
 * Persisted on each skill; defaults to `pp` for legacy records.
 */
export type Level2ManifestImpactArea = 'player_skills' | 'pp' | 'cooldowns';

export type Level2ManifestImpact =
  | 'offensive_add'
  | 'offensive_remove'
  | 'offensive_stun_freeze'
  | 'enhance_increase'
  | 'enhance_decrease'
  | 'utility_confuse'
  | 'damage'
  | 'shield'
  | 'heal'
  | 'reveal'
  | 'silence'
  | 'root'
  | 'delay'
  | 'buff_attack'
  | 'buff_defense'
  | 'buff_speed'
  | 'reduce_cooldown'
  | 'copy_last_move'
  | 'mark_target'
  | 'predict_move'
  | 'remove_buff'
  | 'transfer_debuff'
  | 'add_element_tag';

export type Level2ManifestResult =
  | 'small'
  | 'medium'
  | 'strong'
  | 'cleanse_1'
  | 'duration_1'
  | 'duration_2'
  | 'bonus_if_marked'
  | 'bonus_in_meta_state'
  | 'bonus_on_streak'
  | 'refund_1_pp'
  | 'gain_1_shield'
  | 'expose_next_move'
  | 'apply_status'
  | 'hits_through_shield'
  | 'cannot_crit';

export type Level2ManifestUnlockSource = 'live_event_flow_first' | 'mission_auto' | 'admin' | 'season1_legacy_flow';

export interface Level2ManifestSkillRecord {
  id: string;
  playerId: string;
  manifestId: string;
  unlockSource: Level2ManifestUnlockSource;
  liveEventOnly: true;
  skillName: string;
  manifestType: Level2ManifestTypeCategory;
  target: Level2ManifestTarget;
  impact: Level2ManifestImpact;
  /** Where the impact applies (skills, PP, or cooldowns). Omitted on legacy → treated as `pp`. */
  impactArea?: Level2ManifestImpactArea;
  /**
   * PP amount (when impact area is PP) or turn count (skills / cooldowns), from level-scaled bands.
   * Omitted on legacy records → inferred from `result` when loading.
   */
  resultMagnitude?: number;
  result: Level2ManifestResult;
  description: string;
  ppCost: number;
  cooldownTurns: number;
  perkModifierNotes: string[];
  createdAt: unknown;
  updatedAt: unknown;
  /** Optional: mission step that this skill was created to satisfy */
  missionStepId?: string;
}

/** Persisted under students/{uid}.level2Manifest */
export interface Level2ManifestPlayerState {
  /** First time player crossed into Flow State in a Live Event (Meta / Flow unlock moment). */
  hasEnteredMetaFlowOnce: boolean;
  /** Can open the Level 2 builder (normally set together with first Flow, or via mission/admin). */
  builderUnlocked: boolean;
  /** One-shot client flag consumed after showing unlock celebration (optional). */
  pendingUnlockCelebration?: boolean;
  skills: Level2ManifestSkillRecord[];
  /** Single active custom skill for Live Event loadout (v1). */
  activeSkillId: string | null;
  /** Last use turn index per session is client-side; optional persisted cooldown epoch */
  lastSkillUseAt?: Record<string, number>;
}

export const DEFAULT_LEVEL2_MANIFEST_PLAYER_STATE: Level2ManifestPlayerState = {
  hasEnteredMetaFlowOnce: false,
  builderUnlocked: false,
  skills: [],
  activeSkillId: null,
};
