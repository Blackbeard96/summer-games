import {
  computeRrCandyShieldOnRestore,
  rrCandyShieldOffPercentDenominator,
  rrCandyShieldOnEffectiveMax,
  shieldOffMaxShieldRemoveFraction,
  shieldOffMaxShieldRemovePercent,
} from '../rrCandyMoves';

describe('Shield OFF mastery scaling', () => {
  it('level 1 = 25%', () => {
    expect(shieldOffMaxShieldRemovePercent(1)).toBe(25);
    expect(shieldOffMaxShieldRemoveFraction(1)).toBe(0.25);
  });
  it('level 2 = 30%', () => {
    expect(shieldOffMaxShieldRemovePercent(2)).toBe(30);
    expect(shieldOffMaxShieldRemoveFraction(2)).toBe(0.3);
  });
  it('level 5 = 45%', () => {
    expect(shieldOffMaxShieldRemovePercent(5)).toBe(45);
  });
  it('caps at 50% from level 6 onward', () => {
    expect(shieldOffMaxShieldRemovePercent(6)).toBe(50);
    expect(shieldOffMaxShieldRemovePercent(10)).toBe(50);
  });
  it('clamps invalid mastery to 1..10', () => {
    expect(shieldOffMaxShieldRemovePercent(0)).toBe(25);
    expect(shieldOffMaxShieldRemovePercent(-3)).toBe(25);
    expect(shieldOffMaxShieldRemovePercent(NaN)).toBe(25);
    expect(shieldOffMaxShieldRemovePercent(99)).toBe(50);
  });
});

describe('rrCandyShieldOffPercentDenominator', () => {
  it('uses max(stat max, current, 1) so missing max still strips shields', () => {
    expect(rrCandyShieldOffPercentDenominator({ maxShieldStrength: 0, shieldStrength: 3000 })).toBe(3000);
    expect(rrCandyShieldOffPercentDenominator({ maxShieldStrength: undefined, shieldStrength: 220 })).toBe(220);
  });
  it('prefers higher of max and current', () => {
    expect(rrCandyShieldOffPercentDenominator({ maxShieldStrength: 5000, shieldStrength: 3000 })).toBe(5000);
  });
});

describe('computeRrCandyShieldOnRestore / rrCandyShieldOnEffectiveMax', () => {
  it('effective max is at least current shields when max stat lags', () => {
    expect(rrCandyShieldOnEffectiveMax(100, 321)).toBe(321);
  });
  it('restore is up to half effective max without exceeding headroom', () => {
    expect(computeRrCandyShieldOnRestore(1000, 0)).toBe(500);
    expect(computeRrCandyShieldOnRestore(1000, 800)).toBe(100);
    expect(computeRrCandyShieldOnRestore(100, 321)).toBe(0);
  });
});
