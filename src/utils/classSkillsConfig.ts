/**
 * Class Skills (IRL) — parsing, bounds, templates, validation and rule timing (pure; no Firestore).
 */
import {
  CLASS_SKILL_ELEMENTS,
  type ClassSkill,
  type ClassSkillElement,
  type IrlActivation,
  type IrlActiveRule,
  type IrlConsequence,
  type IrlConsequenceType,
  type IrlDurationKind,
  type IrlEffectType,
  type IrlEventConfig,
  type IrlPlayerState,
  type IrlReward,
  type IrlRuleEffect,
  type IrlTargetType,
  type IrlViolation,
  type SkillContext,
} from '../types/classSkills';

export const CLASS_SKILL_LIMITS = {
  maxLevel: 4,
  maxCost: 20,
  maxCooldownSeconds: 3600,
  maxDurationSeconds: 3600,
  maxPenaltyPP: 50,
  maxDisableMinutes: 30,
  maxRewardPP: 100,
  maxMultiplier: 2,
  maxEffects: 6,
  maxTargets: 60,
  maxProtectionBlocks: 3,
} as const;

/** Shown with every rule: Class Skills never override essential classroom permissions. */
export const IRL_ESSENTIAL_EXCEPTIONS =
  'Never restricts asking for help, reporting a safety concern, essential needs, accommodations, water or bathroom access.';

export const IRL_EFFECT_TYPES: IrlEffectType[] = [
  'restriction',
  'requirement',
  'privilege',
  'challenge',
  'protection',
  'reward_modifier',
  'consequence_modifier',
  'special_rule',
];

export const IRL_EFFECT_LABELS: Record<IrlEffectType, string> = {
  restriction: 'Restriction',
  requirement: 'Requirement',
  privilege: 'Privilege',
  challenge: 'Challenge',
  protection: 'Protection',
  reward_modifier: 'Reward Modifier',
  consequence_modifier: 'Consequence Modifier',
  special_rule: 'Special Rule',
};

export const IRL_TARGET_LABELS: Record<IrlTargetType, string> = {
  self: 'Self',
  player: 'One player',
  team: 'Team',
  class: 'Whole class',
};

export const IRL_DURATION_LABELS: Record<IrlDurationKind, string> = {
  instant: 'Instant',
  timed: 'Timed',
  end_of_sprint: 'Until end of sprint',
  end_of_event: 'Until end of Live Event',
  objective: 'Until objective is completed',
};
const DURATION_KINDS = Object.keys(IRL_DURATION_LABELS) as IrlDurationKind[];

export const IRL_CONSEQUENCE_LABELS: Record<IrlConsequenceType, string> = {
  none: 'No consequence',
  deduct_pp: 'Deduct PP',
  warning: 'Record a warning',
  disable_irl_skills: 'Temporarily disable Class Skills',
  end_active_bonus: 'End active bonuses',
  corrective_action: 'Require a corrective action',
  lose_challenge_bonus: 'Lose the challenge bonus',
};

export const IRL_VERIFICATION_LABELS = {
  facilitator_confirmation: 'Facilitator confirmation',
  facilitator_observation: 'Facilitator observation',
  submission_review: 'Submission review',
} as const;

/** Event-specific defaults: Class Flow first; other modes allow nothing until a facilitator opts in. */
export const DEFAULT_ALLOWED_EFFECTS_BY_MODE: Record<string, IrlEffectType[]> = {
  class_flow: ['restriction', 'requirement', 'challenge', 'privilege', 'reward_modifier', 'protection', 'special_rule'],
  reflection: ['challenge', 'reward_modifier', 'protection'],
};

const str = (v: unknown, d = '', max = 600) => (typeof v === 'string' ? v.slice(0, max) : d);
const num = (v: unknown, d: number, min: number, max: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : d;
  return Math.max(min, Math.min(max, n));
};
const int = (v: unknown, d: number, min: number, max: number) => Math.floor(num(v, d, min, max));
function oneOf<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : d;
}

export const isClassSkillElement = (v: unknown): v is ClassSkillElement =>
  typeof v === 'string' && (CLASS_SKILL_ELEMENTS as readonly string[]).includes(v);

/** Existing Elemental Moves have no skillContext: they are In-Game Skills. */
export const resolveSkillContext = (raw: { skillContext?: unknown } | null | undefined): SkillContext =>
  raw?.skillContext === 'irl' ? 'irl' : 'in_game';

const CONSEQUENCE_TYPES = Object.keys(IRL_CONSEQUENCE_LABELS) as IrlConsequenceType[];

export function parseConsequence(raw: unknown): IrlConsequence {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const type = oneOf(o.type, CONSEQUENCE_TYPES, 'none');
  const max = type === 'deduct_pp' ? CLASS_SKILL_LIMITS.maxPenaltyPP : type === 'disable_irl_skills' ? CLASS_SKILL_LIMITS.maxDisableMinutes : 0;
  return { type, amount: max ? int(o.amount, 0, 0, max) : 0, note: str(o.note, '', 300) };
}

export function parseReward(raw: unknown): IrlReward {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const type = oneOf(o.type, ['none', 'bonus_pp', 'reward_multiplier'] as const, 'none');
  return {
    type,
    amount: type === 'none' ? 0 : int(o.amount, 0, 0, CLASS_SKILL_LIMITS.maxRewardPP),
    multiplier: type === 'reward_multiplier' ? num(o.multiplier, 1.25, 1, CLASS_SKILL_LIMITS.maxMultiplier) : 1,
  };
}

export function parseRuleEffect(raw: unknown, index = 0): IrlRuleEffect | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const type = oneOf(o.type, IRL_EFFECT_TYPES, 'special_rule');
  const effect: IrlRuleEffect = {
    id: str(o.id, '', 40) || `e${index + 1}`,
    type,
    behavior: str(o.behavior, '', 300),
    trigger: 'on_activation',
  };
  if (type === 'restriction' && o.blocksIrlSkills === true) effect.blocksIrlSkills = true;
  if (type === 'protection') effect.blocksRestrictions = int(o.blocksRestrictions, 1, 1, CLASS_SKILL_LIMITS.maxProtectionBlocks);
  return effect;
}

export function parseClassSkill(id: string, raw: unknown): ClassSkill {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const effects = (Array.isArray(o.effects) ? o.effects : [])
    .map((e, i) => parseRuleEffect(e, i))
    .filter((e): e is IrlRuleEffect => !!e)
    .slice(0, CLASS_SKILL_LIMITS.maxEffects);
  const durationKind = oneOf(o.durationKind, DURATION_KINDS, 'timed');
  return {
    id,
    skillContext: 'irl',
    name: str(o.name, 'Class Skill', 80).trim() || 'Class Skill',
    element: isClassSkillElement(o.element) ? o.element : 'fire',
    level: int(o.level, 1, 1, CLASS_SKILL_LIMITS.maxLevel),
    description: str(o.description),
    irlEffect: str(o.irlEffect),
    targetType: oneOf(o.targetType, ['self', 'player', 'team', 'class'] as const, 'self'),
    durationKind,
    durationSeconds: durationKind === 'timed' ? int(o.durationSeconds, 120, 10, CLASS_SKILL_LIMITS.maxDurationSeconds) : 0,
    activationCost: int(o.activationCost, 1, 0, CLASS_SKILL_LIMITS.maxCost),
    cooldownSeconds: int(o.cooldownSeconds, 300, 0, CLASS_SKILL_LIMITS.maxCooldownSeconds),
    activationConditions: str(o.activationConditions),
    violationConditions: str(o.violationConditions),
    consequence: parseConsequence(o.consequence),
    reward: parseReward(o.reward),
    verification: oneOf(o.verification, ['facilitator_confirmation', 'facilitator_observation', 'submission_review'] as const, 'facilitator_confirmation'),
    approval: oneOf(o.approval, ['auto', 'facilitator'] as const, 'facilitator'),
    effects,
    status: oneOf(o.status, ['draft', 'active', 'disabled'] as const, 'draft'),
    templateKey: typeof o.templateKey === 'string' && o.templateKey ? o.templateKey : null,
    updatedAtMs: typeof o.updatedAtMs === 'number' ? o.updatedAtMs : 0,
    updatedBy: typeof o.updatedBy === 'string' ? o.updatedBy : null,
  };
}

/** Firestore payload for a skill (parsed first so stored values are always within bounds). */
export function serializeClassSkill(skill: ClassSkill, updatedBy: string | null, nowMs: number): Record<string, unknown> {
  const s = parseClassSkill(skill.id, skill);
  const { id: _id, ...rest } = s;
  return { ...rest, updatedAtMs: nowMs, updatedBy };
}

/** Editor validation (values are already clamped by parseClassSkill; this checks completeness). */
export function validateClassSkill(skill: ClassSkill): string[] {
  const errors: string[] = [];
  if (!skill.name.trim()) errors.push('Name is required.');
  if (!skill.effects.length) errors.push('Add at least one rule effect.');
  skill.effects.forEach((e, i) => {
    if (!e.behavior.trim()) errors.push(`Rule ${i + 1}: describe the required behavior.`);
  });
  if (skill.consequence.type === 'deduct_pp' && skill.consequence.amount <= 0) errors.push('PP deduction must be at least 1.');
  if (skill.consequence.type === 'disable_irl_skills' && skill.consequence.amount <= 0) errors.push('Disable duration must be at least 1 minute.');
  if (skill.reward.type !== 'none' && skill.reward.amount <= 0) {
    errors.push(skill.reward.type === 'bonus_pp' ? 'Bonus PP must be at least 1.' : 'Set a maximum PP for the reward multiplier.');
  }
  if (skill.effects.some((e) => e.type === 'restriction') && skill.targetType === 'self') {
    errors.push('Restrictions must target another player, a team, or the class.');
  }
  if (skill.durationKind === 'instant' && skill.effects.some((e) => e.type === 'restriction' || e.type === 'protection')) {
    errors.push('Restrictions and protections need a duration (they last over time), so they cannot be Instant.');
  }
  return errors;
}

export function newClassSkill(element: ClassSkillElement, id = ''): ClassSkill {
  return parseClassSkill(id, {
    element,
    name: 'New Class Skill',
    effects: [{ id: 'e1', type: 'challenge', behavior: '' }],
    status: 'draft',
  });
}

/* --------------------------------- Templates --------------------------------- */

type TemplateInput = Partial<Omit<ClassSkill, 'effects'>> & { effects: Partial<IrlRuleEffect>[] };

const TEMPLATE_INPUTS: TemplateInput[] = [
  {
    templateKey: 'fire_silent_ember',
    name: 'Silent Ember',
    element: 'fire',
    level: 2,
    description: 'A smouldering hush settles over your rival.',
    irlEffect: 'Target must remain silent for 2 minutes, except for approved or essential communication.',
    targetType: 'player',
    durationKind: 'timed',
    durationSeconds: 120,
    activationCost: 2,
    cooldownSeconds: 900,
    violationConditions: 'Facilitator-confirmed unauthorized speaking.',
    consequence: { type: 'deduct_pp', amount: 5, note: '' },
    approval: 'facilitator',
    effects: [{ type: 'restriction', behavior: 'Do not speak unless an exception applies.' }],
  },
  {
    templateKey: 'water_flow_state',
    name: 'Flow State',
    element: 'water',
    level: 1,
    description: 'Ride the current of focused work.',
    irlEffect: 'Earn a 1.25× multiplier on one eligible, approved Class Flow task.',
    targetType: 'self',
    durationKind: 'end_of_sprint',
    activationCost: 1,
    cooldownSeconds: 1800,
    reward: { type: 'reward_multiplier', amount: 50, multiplier: 1.25 },
    approval: 'auto',
    effects: [{ type: 'reward_modifier', behavior: 'Complete and get one Class Flow task approved this sprint.' }],
  },
  {
    templateKey: 'air_swift_current',
    name: 'Swift Current',
    element: 'air',
    level: 1,
    description: 'Move like the wind.',
    irlEffect: 'Complete a facilitator-selected task within 3 minutes.',
    targetType: 'self',
    durationKind: 'timed',
    durationSeconds: 180,
    activationCost: 1,
    cooldownSeconds: 900,
    reward: { type: 'bonus_pp', amount: 25, multiplier: 1 },
    approval: 'facilitator',
    effects: [{ type: 'challenge', behavior: 'Finish the task the facilitator selects before time runs out.' }],
  },
  {
    templateKey: 'earth_stone_guard',
    name: 'Stone Guard',
    element: 'earth',
    level: 1,
    description: 'Plant your feet; nothing moves you.',
    irlEffect: 'Block one eligible IRL restriction.',
    targetType: 'self',
    durationKind: 'end_of_sprint',
    activationCost: 1,
    cooldownSeconds: 1800,
    approval: 'auto',
    effects: [{ type: 'protection', behavior: 'The next restriction aimed at you is blocked.', blocksRestrictions: 1 }],
  },
  {
    templateKey: 'lightning_flash_deadline',
    name: 'Flash Deadline',
    element: 'lightning',
    level: 2,
    description: 'Strike before the thunder lands.',
    irlEffect: 'Complete a facilitator-approved micro-task before the countdown expires.',
    targetType: 'player',
    durationKind: 'timed',
    durationSeconds: 180,
    activationCost: 2,
    cooldownSeconds: 900,
    violationConditions: 'The micro-task is not finished when the countdown ends.',
    consequence: { type: 'lose_challenge_bonus', amount: 0, note: 'Loses the optional challenge bonus.' },
    reward: { type: 'bonus_pp', amount: 15, multiplier: 1 },
    approval: 'facilitator',
    effects: [{ type: 'challenge', behavior: 'Finish the approved micro-task before the countdown ends.' }],
  },
  {
    templateKey: 'light_guiding_ray',
    name: 'Guiding Ray',
    element: 'light',
    level: 1,
    description: 'A beam of insight cuts through confusion.',
    irlEffect: 'Receive one additional facilitator hint during a task.',
    targetType: 'player',
    durationKind: 'objective',
    activationCost: 1,
    cooldownSeconds: 900,
    approval: 'auto',
    effects: [{ type: 'privilege', behavior: 'May ask the facilitator for one extra hint.' }],
  },
  {
    templateKey: 'shadow_quiet_veil',
    name: 'Quiet Veil',
    element: 'shadow',
    level: 2,
    description: 'Shadows smother your opponent’s power.',
    irlEffect: 'Target cannot activate another IRL Skill for 2 minutes.',
    targetType: 'player',
    durationKind: 'timed',
    durationSeconds: 120,
    activationCost: 2,
    cooldownSeconds: 900,
    approval: 'facilitator',
    effects: [{ type: 'restriction', behavior: 'Cannot activate Class Skills.', blocksIrlSkills: true }],
  },
  {
    templateKey: 'metal_iron_resolve',
    name: 'Iron Resolve',
    element: 'metal',
    level: 2,
    description: 'Forge ahead on the hardest work.',
    irlEffect: 'Earn bonus credit for completing a designated advanced assignment.',
    targetType: 'self',
    durationKind: 'objective',
    activationCost: 2,
    cooldownSeconds: 1800,
    reward: { type: 'bonus_pp', amount: 30, multiplier: 1 },
    approval: 'facilitator',
    effects: [{ type: 'reward_modifier', behavior: 'Complete the designated advanced assignment.' }],
  },
];

/** Example skills admins can inspect and enable. Always created as drafts. */
export const CLASS_SKILL_TEMPLATES: ClassSkill[] = TEMPLATE_INPUTS.map((t) =>
  parseClassSkill(`tpl_${t.templateKey}`, {
    ...t,
    effects: t.effects.map((e, i) => ({ id: `e${i + 1}`, ...e })),
    status: 'draft',
  })
);

/* ------------------------------- Event config -------------------------------- */

export function parseIrlEventConfig(raw: unknown, liveEventMode?: string | null): IrlEventConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const modeDefault = DEFAULT_ALLOWED_EFFECTS_BY_MODE[liveEventMode || 'class_flow'] ?? [];
  const allowed = Array.isArray(o.allowedEffectTypes)
    ? (o.allowedEffectTypes as unknown[]).filter((t): t is IrlEffectType => IRL_EFFECT_TYPES.includes(t as IrlEffectType))
    : modeDefault;
  return {
    enabled: o.enabled === true,
    approvalMode: o.approvalMode === 'all' ? 'all' : 'skill',
    maxLevel: int(o.maxLevel, CLASS_SKILL_LIMITS.maxLevel, 1, CLASS_SKILL_LIMITS.maxLevel),
    disabledSkillIds: Array.isArray(o.disabledSkillIds) ? (o.disabledSkillIds as unknown[]).filter((s): s is string => typeof s === 'string') : [],
    allowedEffectTypes: Array.from(new Set(allowed)),
  };
}

export const skillHasRestriction = (skill: Pick<ClassSkill, 'effects'>) => skill.effects.some((e) => e.type === 'restriction');

/** Whole-class and restriction skills always need a facilitator, whatever the skill says. */
export function effectiveApproval(skill: Pick<ClassSkill, 'approval' | 'targetType' | 'effects'>, config: Pick<IrlEventConfig, 'approvalMode'>): 'auto' | 'facilitator' {
  if (config.approvalMode === 'all') return 'facilitator';
  if (skill.targetType === 'class' || skillHasRestriction(skill)) return 'facilitator';
  return skill.approval;
}

/** Highest unlocked elemental move level for an element (existing progression; no separate leveling). */
export function elementalLevelFromMoves(moves: unknown, element: string): number {
  if (!Array.isArray(moves)) return 0;
  let level = 0;
  for (const m of moves) {
    if (!m || typeof m !== 'object') continue;
    const mv = m as Record<string, unknown>;
    if (mv.category !== 'elemental' || mv.unlocked !== true) continue;
    if (String(mv.elementalAffinity || '').toLowerCase() !== element) continue;
    level = Math.max(level, Number(mv.level) || 0);
  }
  return level;
}

/* -------------------------------- Validation --------------------------------- */

export interface ActivationCheckInput {
  skill: ClassSkill;
  config: IrlEventConfig;
  casterUid: string;
  casterLevel: number;
  casterState: IrlPlayerState | null;
  participationPoints: number;
  targetUids: string[];
  nowMs: number;
  sprintLive: boolean;
}

export type ActivationCheck = { ok: true } | { ok: false; reason: string };

const fmtWait = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s}s`;
};

/** Same checks on the player's screen (preview) and inside the facilitator's approval transaction. */
export function checkActivation(input: ActivationCheckInput): ActivationCheck {
  const { skill, config, casterState, nowMs } = input;
  if (!config.enabled) return { ok: false, reason: 'Class Skills are off for this Live Event.' };
  if (skill.status !== 'active') return { ok: false, reason: 'This skill is not active.' };
  if (config.disabledSkillIds.includes(skill.id)) return { ok: false, reason: 'This skill is disabled for this Live Event.' };
  if (skill.level > config.maxLevel) return { ok: false, reason: `Only level ${config.maxLevel} and below are allowed in this Live Event.` };
  const blockedType = skill.effects.find((e) => !config.allowedEffectTypes.includes(e.type));
  if (blockedType) return { ok: false, reason: `${IRL_EFFECT_LABELS[blockedType.type]} effects are not allowed in this Live Event.` };
  if (input.casterLevel < skill.level) return { ok: false, reason: `Requires ${skill.element} level ${skill.level}.` };
  if (casterState) {
    if (casterState.disabledUntilMs > nowMs) return { ok: false, reason: `Class Skills are disabled for you for ${fmtWait(casterState.disabledUntilMs - nowMs)}.` };
    if (casterState.skillLockUntilMs > nowMs) return { ok: false, reason: `A restriction stops you from using Class Skills for ${fmtWait(casterState.skillLockUntilMs - nowMs)}.` };
    const ready = casterState.cooldowns[skill.id] || 0;
    if (ready > nowMs) return { ok: false, reason: `On cooldown for ${fmtWait(ready - nowMs)}.` };
  }
  if (input.participationPoints < skill.activationCost) {
    return { ok: false, reason: `Needs ${skill.activationCost} Participation Point${skill.activationCost === 1 ? '' : 's'}.` };
  }
  if (skill.durationKind === 'end_of_sprint' && !input.sprintLive) return { ok: false, reason: 'Needs a running sprint.' };
  const targets = input.targetUids;
  if (targets.length > CLASS_SKILL_LIMITS.maxTargets) return { ok: false, reason: 'Too many targets.' };
  if (skill.targetType === 'self' && !(targets.length === 1 && targets[0] === input.casterUid)) return { ok: false, reason: 'This skill targets yourself.' };
  if (skill.targetType === 'player' && targets.length !== 1) return { ok: false, reason: 'Choose one player.' };
  if ((skill.targetType === 'team' || skill.targetType === 'class') && targets.length === 0) return { ok: false, reason: 'No players to target.' };
  return { ok: true };
}

/* ------------------------------- Rule timing --------------------------------- */

export function resolveRuleExpiry(
  skill: Pick<ClassSkill, 'durationKind' | 'durationSeconds'>,
  activatedAtMs: number,
  sprintId: string | null
): { expiresAtMs: number | null; sprintId: string | null } {
  if (skill.durationKind === 'timed') return { expiresAtMs: activatedAtMs + skill.durationSeconds * 1000, sprintId: null };
  if (skill.durationKind === 'end_of_sprint') return { expiresAtMs: null, sprintId };
  return { expiresAtMs: null, sprintId: null };
}

export interface RuleClock {
  nowMs: number;
  /** Current live sprint id (null when no sprint is running). */
  liveSprintId: string | null;
  eventEnded: boolean;
}

/** Expired rules can never trigger consequences or rewards. */
export function isRuleEnforceable(rule: Pick<IrlActiveRule, 'status' | 'expiresAtMs' | 'durationKind' | 'sprintId'>, clock: RuleClock): boolean {
  if (rule.status !== 'active' || clock.eventEnded) return false;
  if (rule.expiresAtMs != null && clock.nowMs >= rule.expiresAtMs) return false;
  if (rule.durationKind === 'end_of_sprint' && rule.sprintId !== clock.liveSprintId) return false;
  return true;
}

export const ruleRemainingMs = (rule: Pick<IrlActiveRule, 'expiresAtMs'>, nowMs: number): number | null =>
  rule.expiresAtMs == null ? null : Math.max(0, rule.expiresAtMs - nowMs);

/* ------------------------------ Rewards / costs ------------------------------ */

/** Bonus PP for completing a rule. Multipliers apply to facilitator-entered approved credit, capped. */
export function computeRewardPP(reward: IrlReward, approvedCredit = 0): number {
  if (reward.type === 'bonus_pp') return Math.min(CLASS_SKILL_LIMITS.maxRewardPP, reward.amount);
  if (reward.type === 'reward_multiplier') {
    const bonus = Math.floor(Math.max(0, approvedCredit) * (reward.multiplier - 1));
    return Math.min(reward.amount || CLASS_SKILL_LIMITS.maxRewardPP, CLASS_SKILL_LIMITS.maxRewardPP, bonus);
  }
  return 0;
}

export const consequencePP = (c: IrlConsequence): number =>
  c.type === 'deduct_pp' ? Math.min(CLASS_SKILL_LIMITS.maxPenaltyPP, Math.max(0, c.amount)) : 0;

export function describeConsequence(c: IrlConsequence): string {
  switch (c.type) {
    case 'none':
      return 'No consequence';
    case 'deduct_pp':
      return `−${consequencePP(c)} PP after facilitator confirmation`;
    case 'disable_irl_skills':
      return `Class Skills disabled for ${c.amount} min after facilitator confirmation`;
    default:
      return `${IRL_CONSEQUENCE_LABELS[c.type]}${c.note ? ` — ${c.note}` : ''} (after facilitator confirmation)`;
  }
}

export function describeReward(r: IrlReward): string {
  if (r.type === 'bonus_pp') return `+${r.amount} PP when the facilitator confirms completion`;
  if (r.type === 'reward_multiplier') return `${r.multiplier}× approved credit as bonus PP (max ${r.amount || CLASS_SKILL_LIMITS.maxRewardPP})`;
  return 'No reward';
}

export function describeDuration(skill: Pick<ClassSkill, 'durationKind' | 'durationSeconds'>): string {
  if (skill.durationKind !== 'timed') return IRL_DURATION_LABELS[skill.durationKind];
  const s = skill.durationSeconds;
  if (s % 60 === 0) return `${s / 60} min`;
  return s > 60 ? `${Math.floor(s / 60)} min ${s % 60}s` : `${s}s`;
}

export const formatRuleClock = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/* --------------------------- Targets / grouping ------------------------------ */

export interface IrlTeamOption {
  id: string;
  name: string;
  memberIds: string[];
}

/** Restrictions never land on the caster; other team/class skills include everyone in scope. */
export function resolveTargetUids(
  skill: Pick<ClassSkill, 'targetType' | 'effects'>,
  casterUid: string,
  pick: { playerUid?: string | null; teamId?: string | null },
  playerUids: string[],
  teams: IrlTeamOption[]
): string[] {
  const restrict = skillHasRestriction(skill);
  const cap = (ids: string[]) => Array.from(new Set(ids)).slice(0, CLASS_SKILL_LIMITS.maxTargets);
  switch (skill.targetType) {
    case 'self':
      return [casterUid];
    case 'player':
      return pick.playerUid && !(restrict && pick.playerUid === casterUid) ? [pick.playerUid] : [];
    case 'team': {
      const team = teams.find((t) => t.id === pick.teamId);
      return team ? cap(team.memberIds.filter((u) => !(restrict && u === casterUid))) : [];
    }
    case 'class':
      return cap(playerUids.filter((u) => !(restrict && u === casterUid)));
    default:
      return [];
  }
}

export interface IrlRuleGroup {
  activationId: string;
  skillName: string;
  element: ClassSkillElement;
  casterUid: string;
  casterName: string;
  rules: IrlActiveRule[];
}

/** One card per activation (a whole-class skill is one effect with many targets). */
export function groupRulesByActivation(rules: IrlActiveRule[]): IrlRuleGroup[] {
  const map = new Map<string, IrlRuleGroup>();
  rules.forEach((r) => {
    const g = map.get(r.activationId);
    if (g) g.rules.push(r);
    else map.set(r.activationId, { activationId: r.activationId, skillName: r.skillName, element: r.element, casterUid: r.casterUid, casterName: r.casterName, rules: [r] });
  });
  return Array.from(map.values());
}

export interface IrlSkillUsageRow {
  skillId: string;
  skillName: string;
  requested: number;
  approved: number;
  rejected: number;
  completed: number;
  violated: number;
  ended: number;
  blocked: number;
}

/** Class Skill analytics (separate from battle skill usage). */
export function summarizeIrlUsage(activations: IrlActivation[], rules: IrlActiveRule[]): IrlSkillUsageRow[] {
  const rows = new Map<string, IrlSkillUsageRow>();
  const row = (skillId: string, skillName: string) => {
    let r = rows.get(skillId);
    if (!r) {
      r = { skillId, skillName, requested: 0, approved: 0, rejected: 0, completed: 0, violated: 0, ended: 0, blocked: 0 };
      rows.set(skillId, r);
    }
    return r;
  };
  activations.forEach((a) => {
    if (a.status === 'cancelled') return;
    const r = row(a.skillId, a.skillName);
    r.requested += 1;
    if (a.status === 'approved') r.approved += 1;
    if (a.status === 'rejected') r.rejected += 1;
  });
  rules.forEach((rule) => {
    const r = row(rule.skillId, rule.skillName);
    if (rule.status === 'completed') r.completed += 1;
    if (rule.status === 'violated') r.violated += 1;
    if (rule.status === 'ended') r.ended += 1;
    if (rule.status === 'blocked') r.blocked += 1;
  });
  return Array.from(rows.values()).sort((a, b) => b.requested - a.requested || a.skillName.localeCompare(b.skillName));
}

/* ------------------------------ Doc parsers ---------------------------------- */

const strArr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseActivation(id: string, raw: Record<string, unknown>): IrlActivation {
  return {
    id,
    skillId: str(raw.skillId, '', 120),
    skillName: str(raw.skillName, 'Class Skill', 80),
    element: isClassSkillElement(raw.element) ? raw.element : 'fire',
    casterUid: str(raw.casterUid, '', 128),
    casterName: str(raw.casterName, 'Player', 80),
    targetType: oneOf(raw.targetType, ['self', 'player', 'team', 'class'] as const, 'self'),
    targetUids: strArr(raw.targetUids),
    targetLabel: str(raw.targetLabel, '', 120),
    requestedAtMs: Number(raw.requestedAtMs) || 0,
    status: oneOf(raw.status, ['pending', 'approved', 'rejected', 'cancelled'] as const, 'pending'),
    decidedBy: typeof raw.decidedBy === 'string' ? raw.decidedBy : null,
    decidedAtMs: numOrNull(raw.decidedAtMs),
    reason: typeof raw.reason === 'string' ? raw.reason : null,
    costCharged: Number(raw.costCharged) || 0,
    ruleIds: strArr(raw.ruleIds),
    blockedUids: strArr(raw.blockedUids),
  };
}

export function parseActiveRule(id: string, raw: Record<string, unknown>): IrlActiveRule {
  return {
    id,
    activationId: str(raw.activationId, '', 120),
    skillId: str(raw.skillId, '', 120),
    skillName: str(raw.skillName, 'Class Skill', 80),
    element: isClassSkillElement(raw.element) ? raw.element : 'fire',
    casterUid: str(raw.casterUid, '', 128),
    casterName: str(raw.casterName, 'Player', 80),
    targetUid: str(raw.targetUid, '', 128),
    targetName: str(raw.targetName, 'Player', 80),
    effects: (Array.isArray(raw.effects) ? raw.effects : []).map((e, i) => parseRuleEffect(e, i)).filter((e): e is IrlRuleEffect => !!e),
    irlEffect: str(raw.irlEffect),
    violationConditions: str(raw.violationConditions),
    consequence: parseConsequence(raw.consequence),
    reward: parseReward(raw.reward),
    verification: oneOf(raw.verification, ['facilitator_confirmation', 'facilitator_observation', 'submission_review'] as const, 'facilitator_confirmation'),
    durationKind: oneOf(raw.durationKind, DURATION_KINDS, 'timed'),
    activatedAtMs: Number(raw.activatedAtMs) || 0,
    expiresAtMs: numOrNull(raw.expiresAtMs),
    sprintId: typeof raw.sprintId === 'string' ? raw.sprintId : null,
    status: oneOf(raw.status, ['active', 'expired', 'completed', 'violated', 'ended', 'blocked'] as const, 'active'),
    resolvedBy: typeof raw.resolvedBy === 'string' ? raw.resolvedBy : null,
    resolvedAtMs: numOrNull(raw.resolvedAtMs),
    resolution: typeof raw.resolution === 'string' ? raw.resolution : null,
    ppDelta: Number(raw.ppDelta) || 0,
  };
}

export function parseViolation(id: string, raw: Record<string, unknown>): IrlViolation {
  return {
    id,
    ruleId: str(raw.ruleId, '', 200),
    targetUid: str(raw.targetUid, '', 128),
    reporterUid: str(raw.reporterUid, '', 128),
    reporterName: str(raw.reporterName, 'Player', 80),
    note: str(raw.note, '', 500),
    status: oneOf(raw.status, ['reported', 'player_report', 'confirmed', 'dismissed'] as const, 'player_report'),
    createdAtMs: Number(raw.createdAtMs) || 0,
    decidedBy: typeof raw.decidedBy === 'string' ? raw.decidedBy : null,
    decidedAtMs: numOrNull(raw.decidedAtMs),
    consequenceApplied: typeof raw.consequenceApplied === 'string' ? raw.consequenceApplied : null,
  };
}

export const EMPTY_IRL_STATS = { activations: 0, approved: 0, rejected: 0, rulesCompleted: 0, violations: 0, rewardsPP: 0, penaltiesPP: 0, overrides: 0 };

export function parsePlayerState(uid: string, raw: Record<string, unknown> | null | undefined): IrlPlayerState {
  const o = raw || {};
  const cooldowns: Record<string, number> = {};
  if (o.cooldowns && typeof o.cooldowns === 'object') {
    Object.entries(o.cooldowns as Record<string, unknown>).forEach(([k, v]) => {
      if (typeof v === 'number') cooldowns[k] = v;
    });
  }
  const p = o.protection as Record<string, unknown> | null | undefined;
  const statsRaw = (o.stats && typeof o.stats === 'object' ? o.stats : {}) as Record<string, unknown>;
  const stats = { ...EMPTY_IRL_STATS };
  (Object.keys(stats) as (keyof typeof stats)[]).forEach((k) => {
    stats[k] = Number(statsRaw[k]) || 0;
  });
  return {
    uid,
    cooldowns,
    skillLockUntilMs: Number(o.skillLockUntilMs) || 0,
    disabledUntilMs: Number(o.disabledUntilMs) || 0,
    protection:
      p && typeof p === 'object' && typeof p.ruleId === 'string' && Number(p.remaining) > 0
        ? { ruleId: p.ruleId, remaining: Number(p.remaining), expiresAtMs: numOrNull(p.expiresAtMs), sprintId: typeof p.sprintId === 'string' ? p.sprintId : null }
        : null,
    warnings: Number(o.warnings) || 0,
    stats,
  };
}

/** Protection is usable when it has blocks left and its rule window is still open. */
export function protectionActive(state: IrlPlayerState | null, clock: RuleClock): boolean {
  const p = state?.protection;
  if (!p || p.remaining <= 0 || clock.eventEnded) return false;
  if (p.expiresAtMs != null && clock.nowMs >= p.expiresAtMs) return false;
  if (p.sprintId && p.sprintId !== clock.liveSprintId) return false;
  return true;
}
