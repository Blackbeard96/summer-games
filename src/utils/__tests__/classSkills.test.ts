import { MOVE_TEMPLATES } from '../../types/battle';
import type { ClassSkill, IrlActiveRule, IrlPlayerState } from '../../types/classSkills';
import {
  CLASS_SKILL_LIMITS,
  CLASS_SKILL_TEMPLATES,
  checkActivation,
  computeRewardPP,
  consequencePP,
  effectiveApproval,
  elementalLevelFromMoves,
  groupRulesByActivation,
  isRuleEnforceable,
  newClassSkill,
  parseActiveRule,
  parseClassSkill,
  parseIrlEventConfig,
  parsePlayerState,
  protectionActive,
  resolveRuleExpiry,
  resolveSkillContext,
  resolveTargetUids,
  ruleRemainingMs,
  serializeClassSkill,
  summarizeIrlUsage,
  validateClassSkill,
  type RuleClock,
} from '../classSkillsConfig';
import { resolveSkillArtwork, getDefaultSkillArt } from '../skillArtworkDefaults';

jest.mock('../../firebase', () => ({ db: {}, storage: {} }));
// eslint-disable-next-line import/first
import { classSkillArtKey } from '../classSkillsService';

const T0 = 1_700_000_000_000;
const tpl = (key: string): ClassSkill => ({ ...CLASS_SKILL_TEMPLATES.find((t) => t.templateKey === key)!, id: `id_${key}`, status: 'active' });
const enabled = parseIrlEventConfig({ enabled: true }, 'class_flow');
const state = (p: Partial<IrlPlayerState> = {}): IrlPlayerState => ({ ...parsePlayerState('u1', {}), ...p });
const baseCheck = (skill: ClassSkill, over: Partial<Parameters<typeof checkActivation>[0]> = {}) =>
  checkActivation({
    skill,
    config: enabled,
    casterUid: 'u1',
    casterLevel: 4,
    casterState: null,
    participationPoints: 20,
    targetUids: skill.targetType === 'self' ? ['u1'] : ['u2'],
    nowMs: T0,
    sprintLive: true,
    ...over,
  });
const rule = (over: Partial<IrlActiveRule> = {}): IrlActiveRule =>
  parseActiveRule('a1__u2', {
    activationId: 'a1',
    skillId: 's1',
    skillName: 'Silent Ember',
    element: 'fire',
    targetUid: 'u2',
    status: 'active',
    durationKind: 'timed',
    activatedAtMs: T0,
    expiresAtMs: T0 + 120_000,
    consequence: { type: 'deduct_pp', amount: 5 },
    ...over,
  });
const clock = (over: Partial<RuleClock> = {}): RuleClock => ({ nowMs: T0 + 1000, liveSprintId: 'sp1', eventEnded: false, ...over });

describe('Class Skills — backward compatibility (tests 1, 2, 16, 17)', () => {
  it('existing Fire elemental moves are untouched and resolve as In-Game Skills', () => {
    const fire = MOVE_TEMPLATES.filter((m) => m.category === 'elemental' && m.elementalAffinity === 'fire');
    expect(fire.length).toBeGreaterThan(0);
    fire.forEach((m) => {
      expect((m as unknown as { skillContext?: string }).skillContext).toBeUndefined();
      expect(resolveSkillContext(m as unknown as { skillContext?: unknown })).toBe('in_game');
    });
  });

  it('every existing elemental move stays In-Game; only explicit irl is a Class Skill', () => {
    MOVE_TEMPLATES.forEach((m) => expect(resolveSkillContext(m as unknown as { skillContext?: unknown })).toBe('in_game'));
    expect(resolveSkillContext({ skillContext: 'irl' })).toBe('irl');
    expect(resolveSkillContext(null)).toBe('in_game');
  });

  it('Live Events without Class Skills config are unchanged (disabled by default)', () => {
    const cfg = parseIrlEventConfig(undefined, 'class_flow');
    expect(cfg.enabled).toBe(false);
    expect(checkActivation({ ...{ skill: tpl('fire_silent_ember') }, config: cfg, casterUid: 'u1', casterLevel: 4, casterState: null, participationPoints: 99, targetUids: ['u2'], nowMs: T0, sprintLive: true }).ok).toBe(false);
    expect(parseIrlEventConfig(undefined, 'battle_royale').allowedEffectTypes).toEqual([]);
  });
});

describe('Class Skills — admin model (tests 3, 4, 5)', () => {
  it('parsed Class Skills are always irl context, never battle moves', () => {
    const s = parseClassSkill('x', { name: 'Test', element: 'water', skillContext: 'in_game' });
    expect(s.skillContext).toBe('irl');
  });

  it('create + edit round-trips through serialize/parse with element and level', () => {
    const s = { ...newClassSkill('earth'), name: 'Rock Wall', level: 3, effects: [{ id: 'e1', type: 'protection' as const, behavior: 'Block one restriction', trigger: 'on_activation' as const, blocksRestrictions: 2 }] };
    const stored = serializeClassSkill(s, 'admin', T0);
    const back = parseClassSkill('new-id', stored);
    expect(back).toMatchObject({ id: 'new-id', name: 'Rock Wall', element: 'earth', level: 3, updatedBy: 'admin', updatedAtMs: T0 });
    expect(back.effects[0]).toMatchObject({ type: 'protection', blocksRestrictions: 2 });
    expect(stored).not.toHaveProperty('id');
  });

  it('clamps out-of-range values and rejects unknown elements', () => {
    const s = parseClassSkill('x', { element: 'plasma', level: 99, activationCost: -5, cooldownSeconds: 1e9, consequence: { type: 'deduct_pp', amount: 9999 }, reward: { type: 'reward_multiplier', amount: 1e6, multiplier: 10 } });
    expect(s.element).toBe('fire');
    expect(s.level).toBe(CLASS_SKILL_LIMITS.maxLevel);
    expect(s.activationCost).toBe(0);
    expect(s.cooldownSeconds).toBe(CLASS_SKILL_LIMITS.maxCooldownSeconds);
    expect(s.consequence.amount).toBe(CLASS_SKILL_LIMITS.maxPenaltyPP);
    expect(s.reward.amount).toBe(CLASS_SKILL_LIMITS.maxRewardPP);
    expect(s.reward.multiplier).toBe(CLASS_SKILL_LIMITS.maxMultiplier);
  });

  it('editor validation catches incomplete rules and self-restrictions', () => {
    expect(validateClassSkill(newClassSkill('fire'))).toContain('Rule 1: describe the required behavior.');
    const selfRestrict = { ...tpl('fire_silent_ember'), targetType: 'self' as const };
    expect(validateClassSkill(selfRestrict)).toContain('Restrictions must target another player, a team, or the class.');
    CLASS_SKILL_TEMPLATES.forEach((t) => expect(validateClassSkill(t)).toEqual([]));
  });

  it('ships the 8 example templates as drafts, one per element', () => {
    expect(CLASS_SKILL_TEMPLATES).toHaveLength(8);
    expect(new Set(CLASS_SKILL_TEMPLATES.map((t) => t.element)).size).toBe(8);
    CLASS_SKILL_TEMPLATES.forEach((t) => expect(t.status).toBe('draft'));
  });
});

describe('Class Skills — activation (tests 6, 7, 8)', () => {
  it('elemental level comes from unlocked elemental moves only', () => {
    const moves = [
      { category: 'elemental', elementalAffinity: 'fire', level: 1, unlocked: true },
      { category: 'elemental', elementalAffinity: 'fire', level: 3, unlocked: true },
      { category: 'elemental', elementalAffinity: 'fire', level: 4, unlocked: false },
      { category: 'manifest', elementalAffinity: 'fire', level: 4, unlocked: true },
    ];
    expect(elementalLevelFromMoves(moves, 'fire')).toBe(3);
    expect(elementalLevelFromMoves(moves, 'water')).toBe(0);
  });

  it('players cannot activate locked, draft, disabled or over-level skills', () => {
    const ember = tpl('fire_silent_ember');
    expect(baseCheck(ember, { casterLevel: ember.level - 1 })).toEqual({ ok: false, reason: `Requires fire level ${ember.level}.` });
    expect(baseCheck({ ...ember, status: 'draft' }).ok).toBe(false);
    expect(baseCheck(ember, { config: { ...enabled, disabledSkillIds: [ember.id] } }).ok).toBe(false);
    expect(baseCheck(ember, { config: { ...enabled, maxLevel: 1 } }).ok).toBe(false);
    expect(baseCheck(ember, { config: { ...enabled, allowedEffectTypes: ['challenge'] } }).ok).toBe(false);
    expect(baseCheck(ember).ok).toBe(true);
  });

  it('enforces Participation Point cost, cooldown, locks and disable windows', () => {
    const s = tpl('air_swift_current');
    expect(baseCheck(s, { participationPoints: s.activationCost - 1 }).ok).toBe(false);
    expect(baseCheck(s, { participationPoints: s.activationCost }).ok).toBe(true);
    expect(baseCheck(s, { casterState: state({ cooldowns: { [s.id]: T0 + 5000 } }) }).ok).toBe(false);
    expect(baseCheck(s, { casterState: state({ cooldowns: { [s.id]: T0 - 1 } }) }).ok).toBe(true);
    expect(baseCheck(s, { casterState: state({ skillLockUntilMs: T0 + 1 }) }).ok).toBe(false);
    expect(baseCheck(s, { casterState: state({ disabledUntilMs: T0 + 1 }) }).ok).toBe(false);
  });

  it('class-wide and restriction skills always need approval; event can require approval for all', () => {
    const swift = tpl('air_swift_current');
    expect(effectiveApproval({ ...swift, approval: 'auto' }, enabled)).toBe('auto');
    expect(effectiveApproval({ ...swift, approval: 'auto', targetType: 'class' }, enabled)).toBe('facilitator');
    expect(effectiveApproval({ ...tpl('fire_silent_ember'), approval: 'auto' }, enabled)).toBe('facilitator');
    expect(effectiveApproval({ ...swift, approval: 'auto' }, { approvalMode: 'all' })).toBe('facilitator');
  });

  it('restrictions never target the caster; targets are capped', () => {
    const ember = tpl('fire_silent_ember');
    expect(resolveTargetUids(ember, 'u1', { playerUid: 'u1' }, [], [])).toEqual([]);
    expect(resolveTargetUids(ember, 'u1', { playerUid: 'u2' }, [], [])).toEqual(['u2']);
    const classWide = { ...ember, targetType: 'class' as const };
    expect(resolveTargetUids(classWide, 'u1', {}, ['u1', 'u2', 'u3'], [])).toEqual(['u2', 'u3']);
    const many = Array.from({ length: 100 }, (_, i) => `p${i}`);
    expect(resolveTargetUids({ ...tpl('light_guiding_ray'), targetType: 'class' }, 'u1', {}, many, [])).toHaveLength(CLASS_SKILL_LIMITS.maxTargets);
    expect(resolveTargetUids({ ...ember, targetType: 'team' }, 'u1', { teamId: 't' }, [], [{ id: 't', name: 'T', memberIds: ['u1', 'u4'] }])).toEqual(['u4']);
  });
});

describe('Class Skills — Skill Card artwork (test 9)', () => {
  it('uses the shared artwork store key, falling back to the element default', () => {
    const skill = { id: classSkillArtKey('AbC123'), name: 'Silent Ember', category: 'elemental', elementalAffinity: 'fire' };
    expect(resolveSkillArtwork(skill, {}).src).toBe(getDefaultSkillArt('elemental_fire'));
    const custom = resolveSkillArtwork(skill, { irl_abc123: { imageUrl: 'https://cdn.example/ember.png' } });
    expect(custom).toMatchObject({ src: 'https://cdn.example/ember.png', source: 'custom' });
  });
});

describe('Class Skills — active rules and timing (tests 10, 11, 12)', () => {
  it('groups one card per activation and keeps affected players visible', () => {
    const groups = groupRulesByActivation([rule(), rule({ id: 'a1__u3', targetUid: 'u3' } as Partial<IrlActiveRule>), rule({ activationId: 'a2' })]);
    expect(groups).toHaveLength(2);
    expect(groups[0].rules.map((r) => r.targetUid)).toEqual(['u2', 'u3']);
  });

  it('countdowns derive from one authoritative expiry, so every screen agrees', () => {
    const r = rule();
    expect(resolveRuleExpiry({ durationKind: 'timed', durationSeconds: 120 }, T0, null)).toEqual({ expiresAtMs: T0 + 120_000, sprintId: null });
    expect(resolveRuleExpiry({ durationKind: 'end_of_sprint', durationSeconds: 0 }, T0, 'sp1')).toEqual({ expiresAtMs: null, sprintId: 'sp1' });
    // Two clients with the same server-corrected now show the same remaining time.
    expect(ruleRemainingMs(r, T0 + 30_000)).toBe(90_000);
    expect(ruleRemainingMs(r, T0 + 500_000)).toBe(0);
  });

  it('instant effects have no countdown, stay open until resolved, and cannot be restrictions', () => {
    const fireball = parseClassSkill('fb', { name: 'Fireball', element: 'fire', durationKind: 'instant', durationSeconds: 120, effects: [{ type: 'challenge', behavior: 'Answer now' }] });
    expect(fireball.durationKind).toBe('instant');
    expect(fireball.durationSeconds).toBe(0);
    expect(resolveRuleExpiry(fireball, T0, 'sp1')).toEqual({ expiresAtMs: null, sprintId: null });
    const r = rule({ durationKind: 'instant', expiresAtMs: null });
    expect(ruleRemainingMs(r, T0 + 10 * 3600_000)).toBeNull();
    expect(isRuleEnforceable(r, clock({ nowMs: T0 + 10 * 3600_000, liveSprintId: null }))).toBe(true);
    expect(isRuleEnforceable(r, clock({ eventEnded: true }))).toBe(false);
    expect(validateClassSkill(fireball)).toEqual([]);
    expect(validateClassSkill({ ...tpl('fire_silent_ember'), durationKind: 'instant' })).toContain(
      'Restrictions and protections need a duration (they last over time), so they cannot be Instant.'
    );
  });

  it('expired, ended and resolved rules are never enforceable', () => {
    expect(isRuleEnforceable(rule(), clock())).toBe(true);
    expect(isRuleEnforceable(rule(), clock({ nowMs: T0 + 120_000 }))).toBe(false);
    expect(isRuleEnforceable(rule(), clock({ eventEnded: true }))).toBe(false);
    expect(isRuleEnforceable(rule({ status: 'violated' }), clock())).toBe(false);
    expect(isRuleEnforceable(rule({ status: 'blocked' }), clock())).toBe(false);
    const sprintRule = rule({ durationKind: 'end_of_sprint', expiresAtMs: null, sprintId: 'sp1' });
    expect(isRuleEnforceable(sprintRule, clock())).toBe(true);
    expect(isRuleEnforceable(sprintRule, clock({ liveSprintId: 'sp2' }))).toBe(false);
    expect(isRuleEnforceable(sprintRule, clock({ liveSprintId: null }))).toBe(false);
  });

  it('protection only blocks while it has charges and its window is open', () => {
    const p = state({ protection: { ruleId: 'r', remaining: 1, expiresAtMs: null, sprintId: 'sp1' } });
    expect(protectionActive(p, clock())).toBe(true);
    expect(protectionActive(p, clock({ liveSprintId: 'sp2' }))).toBe(false);
    expect(protectionActive(state({ protection: null }), clock())).toBe(false);
  });
});

describe('Class Skills — violations, consequences and rewards (tests 13, 14, 15)', () => {
  it('a rule claim succeeds once: after the active → violated transition it is no longer claimable', () => {
    // Mirrors the idempotency guard used by confirmClassSkillViolation / completeClassSkillRule.
    const claimable = (d: Record<string, unknown>) => isRuleEnforceable(parseActiveRule('a1__u2', d), clock());
    const doc: Record<string, unknown> = { ...rule() };
    let applied = 0;
    for (let i = 0; i < 3; i += 1) {
      if (claimable(doc)) {
        applied += 1;
        doc.status = 'violated';
      }
    }
    expect(applied).toBe(1);
  });

  it('consequences and rewards are bounded no matter what is stored', () => {
    expect(consequencePP({ type: 'deduct_pp', amount: 10_000, note: '' })).toBe(CLASS_SKILL_LIMITS.maxPenaltyPP);
    expect(consequencePP({ type: 'warning', amount: 50, note: '' })).toBe(0);
    expect(computeRewardPP({ type: 'bonus_pp', amount: 10_000, multiplier: 1 })).toBe(CLASS_SKILL_LIMITS.maxRewardPP);
    expect(computeRewardPP({ type: 'reward_multiplier', amount: 50, multiplier: 1.25 }, 100)).toBe(25);
    expect(computeRewardPP({ type: 'reward_multiplier', amount: 50, multiplier: 2 }, 1000)).toBe(50);
    expect(computeRewardPP({ type: 'reward_multiplier', amount: 50, multiplier: 2 }, -40)).toBe(0);
  });

  it('player-written fields cannot smuggle in effects: rule docs are re-parsed and clamped', () => {
    const r = parseActiveRule('x', { status: 'hacked', consequence: { type: 'deduct_pp', amount: -500 }, reward: { type: 'bonus_pp', amount: 1e9 } });
    expect(r.status).toBe('active');
    expect(r.consequence.amount).toBe(0);
    expect(r.reward.amount).toBe(CLASS_SKILL_LIMITS.maxRewardPP);
  });
});

describe('Class Skills — analytics (Phase 9)', () => {
  it('summarizes Class Skill usage separately from battle skills', () => {
    const rows = summarizeIrlUsage(
      [
        { id: '1', skillId: 's1', skillName: 'Silent Ember', status: 'approved' },
        { id: '2', skillId: 's1', skillName: 'Silent Ember', status: 'rejected' },
        { id: '3', skillId: 's1', skillName: 'Silent Ember', status: 'cancelled' },
      ].map((a) => ({ element: 'fire', casterUid: 'u1', casterName: 'A', targetType: 'player', targetUids: [], targetLabel: '', requestedAtMs: T0, decidedBy: null, decidedAtMs: null, reason: null, costCharged: 0, ruleIds: [], blockedUids: [], ...a }) as never),
      [rule({ skillId: 's1', status: 'violated' }), rule({ skillId: 's1', status: 'completed' })]
    );
    expect(rows).toEqual([{ skillId: 's1', skillName: 'Silent Ember', requested: 2, approved: 1, rejected: 1, completed: 1, violated: 1, ended: 0, blocked: 0 }]);
  });
});
