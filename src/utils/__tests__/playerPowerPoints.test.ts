import { computeNextPP, resolveCanonicalPP } from '../playerPowerPoints';

describe('computeNextPP', () => {
  it('lets teacher awards go above capacity', () => {
    expect(computeNextPP({ current: 950, delta: 200, capacity: 1000, mode: 'award' })).toBe(1150);
  });

  it('caps gameplay earnings at capacity', () => {
    expect(computeNextPP({ current: 950, delta: 200, capacity: 1000, mode: 'earn' })).toBe(1000);
  });

  it('does not erase award overflow on a gameplay earning', () => {
    expect(computeNextPP({ current: 1150, delta: 20, capacity: 1000, mode: 'earn' })).toBe(1150);
  });

  it('lets students spend overflow', () => {
    expect(computeNextPP({ current: 1150, delta: -100, capacity: 1000, mode: 'earn' })).toBe(1050);
  });

  it('generator grant trims overflow back to capacity', () => {
    expect(computeNextPP({ current: 1150, delta: 50, capacity: 1000, mode: 'generatorGrant' })).toBe(1000);
    expect(computeNextPP({ current: 600, delta: 50, capacity: 1000, mode: 'generatorGrant' })).toBe(650);
  });

  it('never goes below zero', () => {
    expect(computeNextPP({ current: 30, delta: -100, capacity: 1000, mode: 'award' })).toBe(0);
  });
});

describe('resolveCanonicalPP', () => {
  it('uses student PP when no vault exists', () => {
    expect(
      resolveCanonicalPP({ vaultExists: false, vaultPP: 0, studentPP: 400 })
    ).toBe(400);
  });

  it('prefers vault over higher student PP (spend must stick)', () => {
    expect(
      resolveCanonicalPP({ vaultExists: true, vaultPP: 50, studentPP: 400 })
    ).toBe(50);
  });

  it('keeps vault at 0 after spend-to-zero (does not pull student balance)', () => {
    expect(
      resolveCanonicalPP({ vaultExists: true, vaultPP: 0, studentPP: 200 })
    ).toBe(0);
  });

  it('uses vault when student is lower (generator / vault-only credit)', () => {
    expect(
      resolveCanonicalPP({ vaultExists: true, vaultPP: 150, studentPP: 100 })
    ).toBe(150);
  });
});
