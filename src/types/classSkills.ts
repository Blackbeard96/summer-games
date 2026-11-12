/**
 * Class Skills (IRL): elemental skills that create temporary, facilitator-verified classroom rules.
 * Battle skills ("In-Game Skills") keep using Move / MOVE_TEMPLATES; nothing here feeds the battle engine.
 */

export type SkillContext = 'in_game' | 'irl';

export const CLASS_SKILL_ELEMENTS = ['fire', 'water', 'air', 'earth', 'lightning', 'light', 'shadow', 'metal'] as const;
export type ClassSkillElement = (typeof CLASS_SKILL_ELEMENTS)[number];

export type IrlEffectType =
  | 'restriction'
  | 'requirement'
  | 'privilege'
  | 'challenge'
  | 'protection'
  | 'reward_modifier'
  | 'consequence_modifier'
  | 'special_rule'
  | 'vault_damage'
  | 'vault_transfer'
  | 'player_reward'
  | 'player_penalty'
  | 'vault_protection'
  | 'vault_modifier';

/** Effects resolved by the approval transaction against Vaults (no IRL rule to track). */
export type DirectEffectType = Extract<
  IrlEffectType,
  'vault_damage' | 'vault_transfer' | 'player_reward' | 'player_penalty' | 'vault_protection' | 'vault_modifier'
>;

/** `players` = several chosen players; `class` = every eligible player. */
export type IrlTargetType = 'self' | 'player' | 'players' | 'team' | 'class';
/** `instant`: a one-time effect with no countdown; it stays open until the facilitator resolves it. */
export type IrlDurationKind = 'instant' | 'timed' | 'end_of_sprint' | 'end_of_event' | 'objective';
export type IrlVerification = 'facilitator_confirmation' | 'facilitator_observation' | 'submission_review';
export type IrlApprovalMode = 'auto' | 'facilitator';
export type ClassSkillStatus = 'draft' | 'active' | 'disabled';

export type IrlConsequenceType =
  | 'none'
  | 'deduct_pp'
  | 'warning'
  | 'disable_irl_skills'
  | 'end_active_bonus'
  | 'corrective_action'
  | 'lose_challenge_bonus';

export type IrlRewardType = 'none' | 'bonus_pp' | 'reward_multiplier';

/** One entry of the Rule Builder: TARGET + TRIGGER + REQUIRED BEHAVIOR + DURATION + CONSEQUENCE. */
export interface IrlRuleEffect {
  id: string;
  type: IrlEffectType;
  /** What the affected player must do or avoid. */
  behavior: string;
  trigger: 'on_activation';
  /** Restriction: target cannot activate Class Skills while the rule is active. */
  blocksIrlSkills?: boolean;
  /** Protection: number of incoming restriction rules this blocks (consumed one at a time). */
  blocksRestrictions?: number;
  /** Direct effects: PP amount (bounded by CLASS_SKILL_LIMITS.maxDirectPP). Never taken from the client. */
  amount?: number;
  /** vault_damage / vault_transfer: skip the in-event shield. Only affects this Class Skill effect. */
  bypassShields?: boolean;
  /** player_reward / player_penalty: who receives it. */
  recipient?: 'caster' | 'target';
  /** vault_protection: number of incoming direct Vault effects blocked. */
  blocksVaultEffects?: number;
  /** vault_modifier: multiplies incoming Vault damage/transfers/penalties (0.5 = resist, 2 = vulnerable). */
  multiplier?: number;
}

export interface IrlConsequence {
  type: IrlConsequenceType;
  /** PP for deduct_pp; minutes for disable_irl_skills. Bounded by CLASS_SKILL_LIMITS. */
  amount: number;
  note: string;
}

export interface IrlReward {
  type: IrlRewardType;
  /** Flat PP for bonus_pp; the cap for reward_multiplier. */
  amount: number;
  /** reward_multiplier only (1–2). */
  multiplier: number;
}

export interface ClassSkill {
  id: string;
  skillContext: 'irl';
  name: string;
  element: ClassSkillElement;
  /** Required elemental level (highest unlocked elemental move level of this element). */
  level: number;
  description: string;
  /** Narrative of what happens in the classroom. */
  irlEffect: string;
  targetType: IrlTargetType;
  durationKind: IrlDurationKind;
  durationSeconds: number;
  /** Live Event Participation Points, charged only when the activation is approved. */
  activationCost: number;
  cooldownSeconds: number;
  activationConditions: string;
  violationConditions: string;
  consequence: IrlConsequence;
  reward: IrlReward;
  verification: IrlVerification;
  approval: IrlApprovalMode;
  effects: IrlRuleEffect[];
  status: ClassSkillStatus;
  templateKey: string | null;
  updatedAtMs: number;
  updatedBy: string | null;
}

/* ------------------------------ Live Event state ------------------------------ */

/**
 * Room field `irlSkillsConfig` (facilitator-only). Absent = on for Class Flow (Battle Sprints) events,
 * off for every other mode, so unrelated events are unchanged.
 */
export interface IrlEventConfig {
  enabled: boolean;
  /** 'skill' honours each skill's approval setting (restrictions/class targets still need approval). */
  approvalMode: 'skill' | 'all';
  maxLevel: number;
  disabledSkillIds: string[];
  allowedEffectTypes: IrlEffectType[];
  /** 'event' charges `classSkillCost` for every skill; 'skill' charges each skill's own activationCost. */
  costSource: 'event' | 'skill';
  /** Participation Points per activation when costSource is 'event' (default 3). */
  classSkillCost: number;
  /** Default for new sprints when a sprint has no Class Skills override. */
  sprintPhaseDefault: boolean;
  /** Length of the post-sprint Class Skill Phase. */
  phaseSeconds: number;
  /** Activations per player per phase. */
  activationLimit: number;
  /** Protected minimum Vault PP for direct effects (the Offline Siege floor still applies on top). */
  vaultFloorPP: number;
}

/** Room field `classSkillPhase`: the current or most recent post-sprint Class Skill Phase. */
export interface ClassSkillPhaseDecision {
  choice: 'passed' | 'activated';
  atMs: number;
}

export interface ClassSkillPhase {
  /** Completion cycle id: `${sprintId}@${endsAtMs}`. One phase per real sprint expiry. */
  id: string;
  sprintId: string;
  sprintTitle: string;
  status: 'open' | 'closed';
  openedAtMs: number;
  endsAtMs: number;
  durationSeconds: number;
  closedAtMs: number | null;
  closeReason: string | null;
  openedBy: string;
  activationLimit: number;
  cost: number;
  eligibleUids: string[];
  decisions: Record<string, ClassSkillPhaseDecision>;
  activationCounts: Record<string, number>;
  /** Participation Points spent in this phase (approved activations only). */
  ppSpent: number;
}

export type IrlActivationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** One line of a direct effect's outcome, stored on the approved activation (audit + skill card). */
export interface IrlResolvedEffect {
  effectId: string;
  type: DirectEffectType;
  targetUid: string;
  /** PP moved/removed/awarded; 0 when blocked or nothing was available. */
  amount: number;
  /** Requested amount after modifiers, before floors/capacity. */
  requested: number;
  shieldAbsorbed: number;
  /** For transfers: who received the PP. */
  toUid: string | null;
  kind: 'transfer' | 'removal' | 'award' | 'protection' | 'modifier';
  note: string;
}

export interface IrlActivation {
  id: string;
  skillId: string;
  skillName: string;
  element: ClassSkillElement;
  casterUid: string;
  casterName: string;
  targetType: IrlTargetType;
  targetUids: string[];
  targetLabel: string;
  requestedAtMs: number;
  status: IrlActivationStatus;
  decidedBy: string | null;
  decidedAtMs: number | null;
  reason: string | null;
  costCharged: number;
  ruleIds: string[];
  blockedUids: string[];
  /** Class Skill Phase this request was made in (null = legacy request). */
  phaseId: string | null;
  /** Server time of the request (serverTimestamp), used to enforce the phase window. */
  requestedAtServerMs: number | null;
  resolvedEffects: IrlResolvedEffect[];
}

export type IrlRuleStatus = 'active' | 'expired' | 'completed' | 'violated' | 'ended' | 'blocked';

export interface IrlActiveRule {
  id: string;
  activationId: string;
  skillId: string;
  skillName: string;
  element: ClassSkillElement;
  casterUid: string;
  casterName: string;
  targetUid: string;
  targetName: string;
  effects: IrlRuleEffect[];
  irlEffect: string;
  violationConditions: string;
  consequence: IrlConsequence;
  reward: IrlReward;
  verification: IrlVerification;
  durationKind: IrlDurationKind;
  activatedAtMs: number;
  expiresAtMs: number | null;
  sprintId: string | null;
  status: IrlRuleStatus;
  resolvedBy: string | null;
  resolvedAtMs: number | null;
  resolution: string | null;
  /** PP actually applied by the resolution (negative for consequences). */
  ppDelta: number;
}

export type IrlViolationStatus = 'reported' | 'player_report' | 'confirmed' | 'dismissed';

export interface IrlViolation {
  id: string;
  ruleId: string;
  targetUid: string;
  reporterUid: string;
  reporterName: string;
  note: string;
  status: IrlViolationStatus;
  createdAtMs: number;
  decidedBy: string | null;
  decidedAtMs: number | null;
  consequenceApplied: string | null;
}

export interface IrlPlayerStats {
  activations: number;
  approved: number;
  rejected: number;
  rulesCompleted: number;
  violations: number;
  rewardsPP: number;
  penaltiesPP: number;
  overrides: number;
}

/** irlPlayerState/{uid}: facilitator-written cooldowns, locks, protections and counters. */
export interface IrlPlayerState {
  uid: string;
  cooldowns: Record<string, number>;
  skillLockUntilMs: number;
  disabledUntilMs: number;
  protection: { ruleId: string; remaining: number; expiresAtMs: number | null; sprintId: string | null } | null;
  /** Blocks incoming direct Vault effects (vault_protection). */
  vaultProtection: { activationId: string; remaining: number; expiresAtMs: number | null; sprintId: string | null } | null;
  /** Scales incoming direct Vault effects (vault_modifier). */
  vaultModifier: { activationId: string; multiplier: number; expiresAtMs: number | null; sprintId: string | null } | null;
  warnings: number;
  stats: IrlPlayerStats;
}
