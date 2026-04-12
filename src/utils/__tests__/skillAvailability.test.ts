import type { Move } from '../../types/battle';
import type { BattleSkillRuntimePolicy } from '../battleModeSkillRules';
import { getSkillAvailability, getSkillAvailabilityLabel } from '../skillAvailability';
import { setSkillOnCooldown } from '../battleCooldownState';

function testMove(over: Partial<Move> = {}): Move {
  return {
    id: 'skill-1',
    name: 'Test Skill',
    description: '',
    category: 'elemental',
    type: 'attack',
    level: 1,
    cost: 3,
    cooldown: 2,
    currentCooldown: 0,
    unlocked: true,
    masteryLevel: 1,
    ...over,
  };
}

const standardPolicy: BattleSkillRuntimePolicy = {
  applyTurnSkillCooldownTicks: true,
  applyTurnSkillCooldownOnUse: true,
  participationPowerGatesSkills: false,
};

const livePpOnlyPolicy: BattleSkillRuntimePolicy = {
  applyTurnSkillCooldownTicks: false,
  applyTurnSkillCooldownOnUse: false,
  participationPowerGatesSkills: true,
};

const liveHybridPolicy: BattleSkillRuntimePolicy = {
  applyTurnSkillCooldownTicks: true,
  applyTurnSkillCooldownOnUse: true,
  participationPowerGatesSkills: true,
};

describe('getSkillAvailability', () => {
  test('locked skill', () => {
    const r = getSkillAvailability({
      actor: { id: 'p1' },
      skill: testMove({ unlocked: false }),
      battleContext: {
        policy: standardPolicy,
        battleModeLabel: 'standard',
      },
      currentState: { cooldowns: {} },
    });
    expect(r.canUse).toBe(false);
    expect(r.reasons[0]).toMatch(/locked/i);
  });

  test('2-turn cooldown: blocked while active when policy applies turn CD', () => {
    const cooldowns = setSkillOnCooldown('p1', 'skill-1', 2, {});
    const r = getSkillAvailability({
      actor: { id: 'p1' },
      skill: testMove(),
      battleContext: { policy: standardPolicy, battleModeLabel: 'standard' },
      currentState: { cooldowns },
    });
    expect(r.canUse).toBe(false);
    expect(r.remainingCooldown).toBe(2);
    expect(r.reasons.some((x) => x.includes('Cooldown'))).toBe(true);
  });

  test('Live PP-only: cooldown in state does not block when turn CD off', () => {
    const cooldowns = setSkillOnCooldown('p1', 'skill-1', 2, {});
    const r = getSkillAvailability({
      actor: { id: 'p1' },
      skill: testMove({ cost: 3 }),
      battleContext: {
        policy: livePpOnlyPolicy,
        battleModeLabel: 'live',
        participationPointsAvailable: 5,
        liveEventFinalCost: 3,
      },
      currentState: { cooldowns },
    });
    expect(r.canUse).toBe(true);
  });

  test('Live PP-only: not enough participation points', () => {
    const r = getSkillAvailability({
      actor: { id: 'p1' },
      skill: testMove({ cost: 3 }),
      battleContext: {
        policy: livePpOnlyPolicy,
        battleModeLabel: 'live',
        participationPointsAvailable: 2,
        liveEventFinalCost: 3,
      },
      currentState: { cooldowns: {} },
    });
    expect(r.canUse).toBe(false);
    expect(r.missingPP).toBe(1);
    expect(r.reasons.join(' ')).toMatch(/Need 1 more/);
  });

  test('Live hybrid: both cooldown and PP must pass', () => {
    const cooldowns = setSkillOnCooldown('p1', 'skill-1', 1, {});
    const r = getSkillAvailability({
      actor: { id: 'p1' },
      skill: testMove({ cost: 2 }),
      battleContext: {
        policy: liveHybridPolicy,
        battleModeLabel: 'live',
        participationPointsAvailable: 5,
        liveEventFinalCost: 2,
      },
      currentState: { cooldowns },
    });
    expect(r.canUse).toBe(false);
    expect(r.reasons.some((x) => x.includes('Cooldown'))).toBe(true);
  });

  test('stunned blocks', () => {
    const r = getSkillAvailability({
      actor: { id: 'p1' },
      skill: testMove(),
      battleContext: {
        policy: standardPolicy,
        battleModeLabel: 'standard',
        isActorStunned: true,
      },
      currentState: { cooldowns: {} },
    });
    expect(r.canUse).toBe(false);
    expect(r.reasons).toContain('Stunned');
  });

  test('shield break blocks attacks only', () => {
    const atk = getSkillAvailability({
      actor: { id: 'p1' },
      skill: testMove({ type: 'attack' }),
      battleContext: {
        policy: standardPolicy,
        battleModeLabel: 'standard',
        hasShieldBreak: true,
      },
      currentState: { cooldowns: {} },
    });
    expect(atk.canUse).toBe(false);
    expect(atk.reasons).toContain('Shield Break active');

    const def = getSkillAvailability({
      actor: { id: 'p1' },
      skill: testMove({ type: 'defense', shieldBoost: 5 }),
      battleContext: {
        policy: standardPolicy,
        battleModeLabel: 'standard',
        hasShieldBreak: true,
      },
      currentState: { cooldowns: {} },
    });
    expect(def.canUse).toBe(true);
  });

  test('two actors same skill id: cooldowns independent', () => {
    const cooldowns = setSkillOnCooldown('e1', 'skill-1', 2, setSkillOnCooldown('e2', 'skill-1', 0, {}));
    const a = getSkillAvailability({
      actor: { id: 'e1' },
      skill: testMove(),
      battleContext: { policy: standardPolicy, battleModeLabel: 'standard' },
      currentState: { cooldowns },
    });
    const b = getSkillAvailability({
      actor: { id: 'e2' },
      skill: testMove(),
      battleContext: { policy: standardPolicy, battleModeLabel: 'standard' },
      currentState: { cooldowns },
    });
    expect(a.canUse).toBe(false);
    expect(b.canUse).toBe(true);
  });
});

describe('getSkillAvailabilityLabel', () => {
  test('ready vs reasons', () => {
    expect(getSkillAvailabilityLabel({ canUse: true, reasons: [], remainingCooldown: 0 })).toBe('Ready');
    expect(
      getSkillAvailabilityLabel({
        canUse: false,
        reasons: ['A', 'B'],
        remainingCooldown: 1,
      })
    ).toBe('A · B');
  });
});
