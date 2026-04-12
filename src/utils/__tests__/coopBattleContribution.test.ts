import { calculateBattleContribution } from '../coopBattleContribution';

describe('calculateBattleContribution', () => {
  test('full tier for active fighter', () => {
    const r = calculateBattleContribution(
      { damageDealt: 300, turnsActed: 3, healingDone: 0, shieldingDone: 0 },
      4,
      5
    );
    expect(r.tier).toBe('full');
    expect(r.eligibilityFactor).toBe(1);
  });

  test('none for idle join', () => {
    const r = calculateBattleContribution(undefined, 0, 8);
    expect(r.tier).toBe('none');
    expect(r.eligibilityFactor).toBe(0);
  });
});
