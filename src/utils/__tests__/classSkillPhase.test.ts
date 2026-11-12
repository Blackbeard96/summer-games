import type { ClassSkill, ClassSkillPhase, IrlActivation, IrlPlayerState, IrlRuleEffect } from '../../types/classSkills';
import { MAX_EQUIPPED_SKILLS } from '../../constants/loadout';
import {
  CLASS_SKILL_LIMITS,
  CLASS_SKILL_TEMPLATES,
  checkActivation,
  classSkillUnlockState,
  effectiveApproval,
  effectiveCost,
  isRuleEnforceable,
  parseActivation,
  parseClassSkillCapacity,
  parseClassSkillEquipped,
  parseIrlEventConfig,
  parsePlayerState,
  parseRuleEffect,
  resolveTargetUids,
  validateClassSkill,
} from '../classSkillsConfig';
import {
  AUTO_OPEN_STALE_MS,
  buildClassSkillPhase,
  closeOpenPhasePatch,
  completionCycleId,
  parseClassSkillPhase,
  phaseAcceptsRequest,
  phaseAutoCloseReason,
  phaseSummary,
  phaseToOpen,
  playerPhaseStatus,
  sprintClassSkillsEnabled,
  type PhaseSprint,
} from '../classSkillPhase';
import { resolveDirectEffects, type DirectEffectInput } from '../classSkillDirectEffects';

const T0 = 1_700_000_000_000;
const config = parseIrlEventConfig(undefined, 'class_flow');
const tpl = (key: string): ClassSkill => ({ ...CLASS_SKILL_TEMPLATES.find((t) => t.templateKey === key)!, id: `id_${key}`, status: 'active' });

const sprint = (over: Partial<PhaseSprint> = {}, timer: Partial<PhaseSprint['timer']> = {}): PhaseSprint => ({
  id: 'sp1',
  title: 'Sprint 1',
  ...over,
  timer: { status: 'live', startedAtMs: T0 - 600_000, endsAtMs: T0, pausedAtMs: null, ...timer },
});
const openPhase = (over: Partial<ClassSkillPhase> = {}): ClassSkillPhase => ({
  ...buildClassSkillPhase({ cycleId: completionCycleId('sp1', T0), sprint: sprint(), config, eligibleUids: ['u1', 'u2', 'u3'], nowMs: T0, openedBy: 'fac' }),
  ...over,
});
const act = (over: Partial<IrlActivation> = {}): IrlActivation => ({
  ...parseActivation('a1', { skillId: 's1', casterUid: 'u1', status: 'pending', phaseId: completionCycleId('sp1', T0), requestedAt: T0 + 5000 }),
  ...over,
});

describe('Battle Sprint completion cycles', () => {
  it('a running or paused sprint never opens a phase', () => {
    expect(phaseToOpen({ config, sprint: sprint({}, { endsAtMs: T0 + 60_000 }), phase: null, cycles: [], nowMs: T0 })).toBeNull();
    expect(phaseToOpen({ config, sprint: sprint({}, { pausedAtMs: T0 - 1000 }), phase: null, cycles: [], nowMs: T0 + 10_000 })).toBeNull();
  });

  it('a real expiry opens exactly one phase; refreshes and repeated End Sprint clicks map to the same cycle', () => {
    const expired = sprint();
    const id = phaseToOpen({ config, sprint: expired, phase: null, cycles: [], nowMs: T0 + 1000 });
    expect(id).toBe('sp1@' + T0);
    // Ending manually keeps endsAt, so it's the same cycle.
    expect(phaseToOpen({ config, sprint: sprint({}, { status: 'closed' }), phase: null, cycles: [], nowMs: T0 + 1000 })).toBe(id);
    // Once opened (phase on the room or remembered in cycles) it never opens again.
    expect(phaseToOpen({ config, sprint: expired, phase: openPhase(), cycles: [], nowMs: T0 + 2000 })).toBeNull();
    expect(phaseToOpen({ config, sprint: sprint({}, { status: 'closed' }), phase: openPhase({ status: 'closed' }), cycles: [id!], nowMs: T0 + 90_000 })).toBeNull();
  });

  it('ending a paused sprint is a real end', () => {
    expect(phaseToOpen({ config, sprint: sprint({}, { status: 'closed', pausedAtMs: T0 - 5000, endsAtMs: T0 + 60_000 }), phase: null, cycles: [], nowMs: T0 })).toBe(`sp1@${T0 + 60_000}`);
  });

  it('extending or resuming then expiring again is a new cycle; a new sprint is a new cycle', () => {
    const first = completionCycleId('sp1', T0);
    const extended = sprint({}, { endsAtMs: T0 + 120_000 });
    expect(phaseToOpen({ config, sprint: extended, phase: openPhase({ status: 'closed' }), cycles: [first], nowMs: T0 + 60_000 })).toBeNull();
    expect(phaseToOpen({ config, sprint: extended, phase: openPhase({ status: 'closed' }), cycles: [first], nowMs: T0 + 121_000 })).toBe(`sp1@${T0 + 120_000}`);
    expect(phaseToOpen({ config, sprint: sprint({ id: 'sp2' }, { endsAtMs: T0 + 900_000 }), phase: openPhase({ status: 'closed' }), cycles: [first], nowMs: T0 + 901_000 })).toBe(
      `sp2@${T0 + 900_000}`
    );
  });

  it('per-sprint toggle: override wins, legacy sprints use the Live Event default, then enabled', () => {
    expect(sprintClassSkillsEnabled(config, sprint())).toBe(true);
    expect(sprintClassSkillsEnabled({ ...config, sprintPhaseDefault: false }, sprint())).toBe(false);
    expect(sprintClassSkillsEnabled({ ...config, sprintPhaseDefault: false }, sprint({ classSkillsEnabled: true }))).toBe(true);
    expect(sprintClassSkillsEnabled(config, sprint({ classSkillsEnabled: false }))).toBe(false);
    expect(sprintClassSkillsEnabled({ ...config, enabled: false }, sprint({ classSkillsEnabled: true }))).toBe(false);
    expect(phaseToOpen({ config, sprint: sprint({ classSkillsEnabled: false }), phase: null, cycles: [], nowMs: T0 + 1000 })).toBeNull();
  });

  it('does not auto-open for a sprint that ended long ago', () => {
    expect(phaseToOpen({ config, sprint: sprint(), phase: null, cycles: [], nowMs: T0 + AUTO_OPEN_STALE_MS + 1 })).toBeNull();
  });

  it('builds the phase from Live Event settings (default 30s, 1 activation, 3 Participation Points)', () => {
    const p = openPhase();
    expect(p).toMatchObject({ status: 'open', durationSeconds: 30, endsAtMs: T0 + 30_000, activationLimit: 1, cost: 3, ppSpent: 0 });
    expect(parseClassSkillPhase(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(parseClassSkillPhase({ id: 5 })).toBeNull();
  });

  it('starting the next sprint closes an open phase; a closed phase is left alone', () => {
    expect(closeOpenPhasePatch(openPhase(), T0 + 9000, 'next_sprint')).toEqual({
      'classSkillPhase.status': 'closed',
      'classSkillPhase.closedAtMs': T0 + 9000,
      'classSkillPhase.closeReason': 'next_sprint',
    });
    expect(closeOpenPhasePatch(openPhase({ status: 'closed' }), T0, 'x')).toEqual({});
    expect(closeOpenPhasePatch(undefined, T0, 'x')).toEqual({});
  });
});

describe('Class Skill timing gate', () => {
  const status = (over: Partial<Parameters<typeof playerPhaseStatus>[0]> = {}) =>
    playerPhaseStatus({ config, sprint: sprint({}, { endsAtMs: T0 + 60_000 }), phase: null, uid: 'u1', nowMs: T0, pendingInPhase: 0, ...over });

  it('during an active sprint Class Skills are visible but not usable', () => {
    const s = status();
    expect(s.state).toBe('awaiting');
    expect(s.gate).toEqual({ ok: false, reason: 'Available after the Sprint ends.' });
    expect(checkActivation({ skill: tpl('air_swift_current'), config, phase: s.gate, casterUid: 'u1', casterLevel: 4, casterState: null, participationPoints: 99, targetUids: ['u1'], nowMs: T0, sprintLive: true })).toEqual({
      ok: false,
      reason: 'Available after the Sprint ends.',
    });
  });

  it('opens for eligible players and closes after pass, use, pending request or time-up', () => {
    const phase = openPhase();
    expect(status({ phase, nowMs: T0 + 1000 }).gate).toEqual({ ok: true, phaseId: phase.id });
    expect(status({ phase: { ...phase, decisions: { u1: { choice: 'passed', atMs: T0 } } }, nowMs: T0 + 1000 }).state).toBe('passed');
    expect(status({ phase: { ...phase, activationCounts: { u1: 1 } }, nowMs: T0 + 1000 }).state).toBe('used');
    expect(status({ phase, nowMs: T0 + 1000, pendingInPhase: 1 }).state).toBe('pending');
    expect(status({ phase, nowMs: T0 + 31_000 }).state).toBe('closed');
    expect(status({ phase, uid: 'late', nowMs: T0 + 1000 }).state).toBe('not_eligible');
    expect(status({ phase: { ...phase, activationLimit: 2, activationCounts: { u1: 1 } }, nowMs: T0 + 1000 }).state).toBe('open');
  });

  it('sprint-level disable and event-level disable block activation', () => {
    expect(status({ sprint: sprint({ classSkillsEnabled: false }) }).state).toBe('disabled');
    expect(status({ config: { ...config, enabled: false } }).state).toBe('disabled');
  });

  it('the approval transaction re-checks the server-timed window, phase id and per-phase limit', () => {
    const phase = openPhase();
    expect(phaseAcceptsRequest(phase, act())).toEqual({ ok: true });
    expect(phaseAcceptsRequest(phase, act({ phaseId: 'sp0@1' })).ok).toBe(false);
    expect(phaseAcceptsRequest(phase, act({ phaseId: null })).ok).toBe(false);
    expect(phaseAcceptsRequest(null, act()).ok).toBe(false);
    expect(phaseAcceptsRequest(phase, act({ requestedAtServerMs: null })).ok).toBe(false);
    expect(phaseAcceptsRequest(phase, act({ requestedAtServerMs: T0 - 10_000 })).ok).toBe(false);
    expect(phaseAcceptsRequest(phase, act({ requestedAtServerMs: T0 + 40_000 })).ok).toBe(false);
    expect(phaseAcceptsRequest({ ...phase, status: 'closed', closedAtMs: T0 + 2000 }, act({ requestedAtServerMs: T0 + 10_000 })).ok).toBe(false);
    // Requests made before an early close stay approvable.
    expect(phaseAcceptsRequest({ ...phase, status: 'closed', closedAtMs: T0 + 20_000 }, act({ requestedAtServerMs: T0 + 10_000 })).ok).toBe(true);
    expect(phaseAcceptsRequest({ ...phase, activationCounts: { u1: 1 } }, act()).ok).toBe(false);
    expect(phaseAcceptsRequest({ ...phase, decisions: { u1: { choice: 'passed', atMs: T0 } } }, act()).ok).toBe(false);
    expect(phaseAcceptsRequest(phase, act({ casterUid: 'stranger' })).ok).toBe(false);
  });

  it('parses the server request time from a Firestore timestamp', () => {
    const a = parseActivation('a', { phaseId: 'x', requestedAt: { toMillis: () => T0 + 7 } });
    expect(a.requestedAtServerMs).toBe(T0 + 7);
    expect(parseActivation('a', {}).phaseId).toBeNull();
  });

  it('auto-closes when time is up or everyone acted, never while a request is pending', () => {
    const phase = openPhase();
    expect(phaseAutoCloseReason(phase, T0 + 1000, 0)).toBeNull();
    expect(phaseAutoCloseReason(phase, T0 + 30_000, 0)).toBe('time_up');
    expect(phaseAutoCloseReason(phase, T0 + 30_000, 1)).toBeNull();
    const allDone = { ...phase, decisions: { u1: { choice: 'passed' as const, atMs: T0 }, u2: { choice: 'passed' as const, atMs: T0 } }, activationCounts: { u3: 1 } };
    expect(phaseAutoCloseReason(allDone, T0 + 1000, 0)).toBe('all_acted');
    expect(phaseAutoCloseReason({ ...phase, status: 'closed' }, T0 + 99_000, 0)).toBeNull();
  });

  it('summarizes acted / passed / pending / no response for the facilitator', () => {
    const phase = { ...openPhase(), decisions: { u2: { choice: 'passed' as const, atMs: T0 } } };
    const rows = phaseSummary(phase, [act({ status: 'approved' }), act({ id: 'a2', casterUid: 'u3', status: 'pending' }), act({ id: 'old', casterUid: 'u3', phaseId: 'other' })]);
    expect(Object.fromEntries(rows.map((r) => [r.uid, r.outcome]))).toEqual({ u1: 'activated', u2: 'passed', u3: 'pending' });
    expect(phaseSummary({ ...phase, eligibleUids: ['u9'] }, [])[0].outcome).toBe('no_response');
  });

  it('"until end of sprint" rules from a phase wait for the next sprint', () => {
    const rule = { status: 'active' as const, expiresAtMs: null, durationKind: 'end_of_sprint' as const, sprintId: null };
    expect(isRuleEnforceable(rule, { nowMs: T0, liveSprintId: 'sp1', eventEnded: false })).toBe(true);
    expect(isRuleEnforceable({ ...rule, sprintId: 'sp2' }, { nowMs: T0, liveSprintId: 'sp2', eventEnded: false })).toBe(true);
    expect(isRuleEnforceable({ ...rule, sprintId: 'sp2' }, { nowMs: T0, liveSprintId: 'sp3', eventEnded: false })).toBe(false);
  });
});

describe('Class Skill loadouts', () => {
  it('Class Skill slots default to 3 and are separate from the 6 In-Game Skill slots', () => {
    expect(MAX_EQUIPPED_SKILLS).toBe(6);
    expect(parseClassSkillCapacity(null)).toBe(3);
    expect(parseClassSkillCapacity({ capacity: 99 })).toBe(CLASS_SKILL_LIMITS.maxCapacity);
    expect(parseClassSkillEquipped(['a', 'b', 'a', 7, 'c', 'd'], 3)).toEqual(['a', 'b', 'c']);
  });

  it('only unlocked skills can be equipped (existing elemental progression + mission picks)', () => {
    const s = tpl('fire_silent_ember'); // level 2
    expect(classSkillUnlockState(s, { fire: 2 }, []).unlocked).toBe(true);
    expect(classSkillUnlockState(s, { fire: 1 }, []).unlocked).toBe(false);
    expect(classSkillUnlockState(s, { water: 4 }, []).unlocked).toBe(false);
    expect(classSkillUnlockState({ ...s, status: 'draft' }, { fire: 4 }, []).unlocked).toBe(false);
    expect(classSkillUnlockState(s, { fire: 4 }, ['other']).unlocked).toBe(false);
  });

  it('activation requires the skill to be equipped', () => {
    const base = { skill: tpl('air_swift_current'), config, casterUid: 'u1', casterLevel: 4, casterState: null, participationPoints: 9, targetUids: ['u1'], nowMs: T0, sprintLive: false, phase: { ok: true as const, phaseId: 'p' } };
    expect(checkActivation({ ...base, equipped: [] })).toEqual({ ok: false, reason: 'Equip this Class Skill in your Loadout first.' });
    expect(checkActivation({ ...base, equipped: ['id_air_swift_current'] }).ok).toBe(true);
  });

  it('cost comes from Participation Points: event default 3, or each skill when configured', () => {
    const s = tpl('fire_silent_ember');
    expect(effectiveCost(s, config)).toBe(3);
    expect(effectiveCost(s, { ...config, costSource: 'skill' })).toBe(s.activationCost);
    expect(effectiveCost(s, parseIrlEventConfig({ classSkillCost: 5 }, 'class_flow'))).toBe(5);
    expect(parseIrlEventConfig({ phaseSeconds: 1, activationLimit: 99 }, 'class_flow')).toMatchObject({
      phaseSeconds: CLASS_SKILL_LIMITS.minPhaseSeconds,
      activationLimit: CLASS_SKILL_LIMITS.maxActivationLimit,
    });
  });
});

/* ------------------------------- Direct effects ------------------------------- */

const eff = (o: Partial<IrlRuleEffect> & Pick<IrlRuleEffect, 'type'>): IrlRuleEffect => parseRuleEffect({ id: 'e1', behavior: '', ...o })!;
const vault = (currentPP: number, capacity = 1000) => ({ exists: true, currentPP, capacity });
const playerState = (uid: string, over: Partial<IrlPlayerState> = {}): IrlPlayerState => ({ ...parsePlayerState(uid, {}), ...over });
const run = (over: Partial<DirectEffectInput>) =>
  resolveDirectEffects({
    activationId: 'act1',
    effects: [],
    casterUid: 'c',
    targetUids: ['t'],
    vaults: { c: vault(100), t: vault(100) },
    shields: { c: 0, t: 0 },
    floors: {},
    states: {},
    clock: { nowMs: T0, liveSprintId: null, eventEnded: false },
    expiry: { expiresAtMs: null, sprintId: null },
    ...over,
  });

describe('Direct Class Skill effects', () => {
  it('bypassShields damages the Vault and leaves shields untouched', () => {
    const out = run({ effects: [eff({ type: 'vault_damage', amount: 30, bypassShields: true })], shields: { t: 50 } });
    expect(out.vaultPP).toEqual({ t: 70 });
    expect(out.shields).toEqual({});
    expect(out.resolved[0]).toMatchObject({ kind: 'removal', amount: 30, shieldAbsorbed: 0 });
  });

  it('without bypass, the in-event shield absorbs first', () => {
    const out = run({ effects: [eff({ type: 'vault_damage', amount: 30 })], shields: { t: 20 } });
    expect(out.shields).toEqual({ t: 0 });
    expect(out.vaultPP).toEqual({ t: 90 });
    expect(out.resolved[0]).toMatchObject({ amount: 10, shieldAbsorbed: 20 });
  });

  it('transfers conserve PP: the target loses exactly what the caster gains', () => {
    const out = run({ effects: [eff({ type: 'vault_transfer', amount: 40, bypassShields: true })] });
    expect(out.vaultPP).toEqual({ t: 60, c: 140 });
    expect(out.ppDelta.t + out.ppDelta.c).toBe(0);
    expect(out.resolved[0]).toMatchObject({ kind: 'transfer', amount: 40, toUid: 'c' });
  });

  it("transfers stop at the caster's capacity; the rest stays with the target", () => {
    const out = run({ effects: [eff({ type: 'vault_transfer', amount: 40, bypassShields: true })], vaults: { c: vault(990, 1000), t: vault(100) } });
    expect(out.vaultPP).toEqual({ t: 90, c: 1000 });
  });

  it('multi-target transfers share the caster capacity and never create PP', () => {
    const out = run({
      effects: [eff({ type: 'vault_transfer', amount: 30, bypassShields: true })],
      targetUids: ['t', 'u'],
      vaults: { c: vault(950, 1000), t: vault(100), u: vault(100) },
    });
    expect(out.vaultPP).toEqual({ t: 70, c: 1000, u: 80 });
    expect(Object.values(out.ppDelta).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('never goes below the protected minimum or zero', () => {
    const floored = run({ effects: [eff({ type: 'vault_damage', amount: 250, bypassShields: true })], floors: { t: 25 } });
    expect(floored.vaultPP).toEqual({ t: 25 });
    const empty = run({ effects: [eff({ type: 'player_penalty', amount: 50 })], vaults: { c: vault(0), t: vault(10) } });
    expect(empty.vaultPP).toEqual({ t: 0 });
  });

  it('Vault protection blocks one activation and consumes one charge', () => {
    const states = { t: playerState('t', { vaultProtection: { activationId: 'p', remaining: 1, expiresAtMs: null, sprintId: null } }) };
    const out = run({ effects: [eff({ type: 'vault_damage', amount: 30, bypassShields: true }), eff({ id: 'e2', type: 'player_penalty', amount: 5 })], states });
    expect(out.vaultPP).toEqual({});
    expect(out.resolved.every((r) => r.note === 'Blocked by Vault protection')).toBe(true);
    expect(out.stateWrites.t.vaultProtection).toBeNull();
  });

  it('expired protection does not block', () => {
    const states = { t: playerState('t', { vaultProtection: { activationId: 'p', remaining: 1, expiresAtMs: T0 - 1, sprintId: null } }) };
    expect(run({ effects: [eff({ type: 'vault_damage', amount: 30, bypassShields: true })], states }).vaultPP).toEqual({ t: 70 });
  });

  it('Vault modifiers scale incoming damage', () => {
    const states = { t: playerState('t', { vaultModifier: { activationId: 'm', multiplier: 0.5, expiresAtMs: null, sprintId: null } }) };
    expect(run({ effects: [eff({ type: 'vault_damage', amount: 30, bypassShields: true })], states }).vaultPP).toEqual({ t: 85 });
  });

  it('rewards are new PP capped at Vault capacity; caster-paid penalties hit the caster once', () => {
    const reward = run({ effects: [eff({ type: 'player_reward', amount: 50 })], vaults: { c: vault(980, 1000), t: vault(100) } });
    expect(reward.vaultPP).toEqual({ c: 1000 });
    expect(reward.resolved[0]).toMatchObject({ kind: 'award', amount: 20 });
    const toTargets = run({ effects: [eff({ type: 'player_reward', amount: 10, recipient: 'target' })], targetUids: ['t', 'u'], vaults: { c: vault(0), t: vault(1), u: vault(2) } });
    expect(toTargets.vaultPP).toEqual({ t: 11, u: 12 });
    const drawback = run({ effects: [eff({ type: 'player_penalty', amount: 5, recipient: 'caster' })], targetUids: ['t', 'u'], vaults: { c: vault(50), t: vault(1), u: vault(1) } });
    expect(drawback.vaultPP).toEqual({ c: 45 });
  });

  it('never damages the caster, and skips players without a Vault', () => {
    const out = run({ effects: [eff({ type: 'vault_damage', amount: 10, bypassShields: true })], targetUids: ['c', 't', 'x'], vaults: { c: vault(100), t: vault(100) } });
    expect(out.vaultPP).toEqual({ t: 90 });
    expect(out.resolved.find((r) => r.targetUid === 'x')?.note).toBe('No Vault');
  });

  it('protections and modifiers become player state for the activation duration', () => {
    const out = run({
      effects: [eff({ type: 'vault_protection', blocksVaultEffects: 2 }), eff({ id: 'e2', type: 'vault_modifier', multiplier: 0.75 })],
      targetUids: ['c'],
      expiry: { expiresAtMs: T0 + 60_000, sprintId: null },
    });
    expect(out.stateWrites.c).toEqual({
      vaultProtection: { activationId: 'act1', remaining: 2, expiresAtMs: T0 + 60_000, sprintId: null },
      vaultModifier: { activationId: 'act1', multiplier: 0.75, expiresAtMs: T0 + 60_000, sprintId: null },
    });
    expect(out.vaultPP).toEqual({});
  });

  it('stored amounts are clamped, so a tampered skill doc cannot exceed the limits', () => {
    expect(eff({ type: 'vault_damage', amount: 1e9 }).amount).toBe(CLASS_SKILL_LIMITS.maxDirectPP);
    expect(eff({ type: 'vault_modifier', multiplier: 50 }).multiplier).toBe(CLASS_SKILL_LIMITS.maxVaultMultiplier);
    expect(eff({ type: 'challenge', amount: 50, bypassShields: true })).not.toHaveProperty('amount');
  });

  it('validation: harmful direct effects need an amount and another target; penalties need approval', () => {
    const base = { ...tpl('air_swift_current'), targetType: 'self' as const, effects: [eff({ type: 'vault_damage', amount: 0 })] };
    const errors = validateClassSkill(base);
    expect(errors.some((e) => e.includes('needs an amount'))).toBe(true);
    expect(errors.some((e) => e.includes('must target another player'))).toBe(true);
    expect(effectiveApproval({ ...base, approval: 'auto', targetType: 'player', effects: [eff({ type: 'player_penalty', amount: 5 })] }, config)).toBe('facilitator');
  });

  it('multiple-player targeting excludes the caster for harmful skills and unknown players', () => {
    const skill = { targetType: 'players' as const, effects: [eff({ type: 'vault_damage', amount: 5 })] };
    expect(resolveTargetUids(skill, 'c', { playerUids: ['c', 'a', 'b', 'ghost'] }, ['a', 'b', 'c'], [])).toEqual(['a', 'b']);
  });
});
