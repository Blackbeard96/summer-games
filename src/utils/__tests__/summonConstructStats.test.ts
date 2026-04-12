import { resolveConstructStatsForSummonEffect } from '../summonConstructStats';

describe('resolveConstructStatsForSummonEffect', () => {
  const lightSummon = {
    type: 'summon' as const,
    summonElementalType: 'light',
    summonDamage: 100,
  };

  it('scales light construct with mastery at fixed artifact level', () => {
    const base = resolveConstructStatsForSummonEffect(lightSummon, 1, 1);
    const m2 = resolveConstructStatsForSummonEffect(lightSummon, 1, 2);
    expect(base.maxHealth).toBe(100);
    expect(base.powerMultiplier).toBeCloseTo(1.0, 5);
    expect(m2.maxHealth).toBe(110);
    expect(m2.attackDamage).toBe(110);
    expect(m2.maxShield).toBe(55);
    expect(m2.masteryLevelUsed).toBe(2);
    expect(m2.powerMultiplier).toBeCloseTo(1.1, 5);
  });

  it('combines artifact and mastery multipliers', () => {
    const s = resolveConstructStatsForSummonEffect(lightSummon, 2, 2);
    // art L2 → 1.1, mast M2 → 1.1 → 1.21
    expect(s.powerMultiplier).toBeCloseTo(1.21, 5);
    expect(s.maxHealth).toBe(121);
  });
});
