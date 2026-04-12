import {
  cloneCooldowns,
  decrementCooldownsForCombatant,
  getRemainingCooldown,
  initializeCombatantCooldowns,
  migrateMapToByCombatant,
  setSkillOnCooldown,
} from '../battleCooldownState';

describe('battleCooldownState', () => {
  test('initializeCombatantCooldowns returns empty object', () => {
    expect(initializeCombatantCooldowns()).toEqual({});
  });

  test('setSkillOnCooldown is immutable and stores turns', () => {
    const base = initializeCombatantCooldowns();
    const next = setSkillOnCooldown('p1', 'fireball', 2, base);
    expect(base).toEqual({});
    expect(getRemainingCooldown('p1', 'fireball', next)).toBe(2);
  });

  test('setSkillOnCooldown with 0 returns same reference', () => {
    const base = setSkillOnCooldown('p1', 'a', 2, {});
    expect(setSkillOnCooldown('p1', 'b', 0, base)).toBe(base);
  });

  test('decrementCooldownsForCombatant counts down to zero and removes row', () => {
    let s = setSkillOnCooldown('p1', 's1', 2, {});
    s = decrementCooldownsForCombatant('p1', s);
    expect(getRemainingCooldown('p1', 's1', s)).toBe(1);
    s = decrementCooldownsForCombatant('p1', s);
    expect(getRemainingCooldown('p1', 's1', s)).toBe(0);
    expect(s.p1).toBeUndefined();
  });

  test('independent skills and combatants', () => {
    let s = setSkillOnCooldown('p1', 'a', 3, {});
    s = setSkillOnCooldown('p1', 'b', 1, s);
    s = setSkillOnCooldown('p2', 'a', 2, s);
    s = decrementCooldownsForCombatant('p1', s);
    expect(getRemainingCooldown('p1', 'a', s)).toBe(2);
    expect(getRemainingCooldown('p1', 'b', s)).toBe(0);
    expect(getRemainingCooldown('p2', 'a', s)).toBe(2);
  });

  test('cloneCooldowns deep-copies per combatant rows', () => {
    const a = setSkillOnCooldown('x', 'm', 1, {});
    const b = cloneCooldowns(a);
    expect(b).toEqual(a);
    expect(b.x).not.toBe(a.x);
  });

  test('migrateMapToByCombatant', () => {
    const m = new Map<string, number>([
      ['u', 2],
      ['v', 0],
    ]);
    const s = migrateMapToByCombatant('cpu', m);
    expect(getRemainingCooldown('cpu', 'u', s)).toBe(2);
    expect(getRemainingCooldown('cpu', 'v', s)).toBe(0);
  });
});
