import { shieldOffMaxShieldRemoveFraction, shieldOffMaxShieldRemovePercent } from '../rrCandyMoves';

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
