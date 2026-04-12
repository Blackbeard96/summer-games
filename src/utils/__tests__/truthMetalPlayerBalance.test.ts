import { truthMetalBalanceForHud, truthMetalTotalAcrossDocs } from '../truthMetalPlayerBalance';

describe('truthMetalBalanceForHud', () => {
  it('prefers students when non-zero (Profile / Artifacts)', () => {
    expect(truthMetalBalanceForHud(36, 0)).toBe(36);
    expect(truthMetalBalanceForHud(36, 99)).toBe(36);
  });
  it('falls back to users when students is zero', () => {
    expect(truthMetalBalanceForHud(0, 12)).toBe(12);
    expect(truthMetalBalanceForHud(undefined, 5)).toBe(5);
  });
});

describe('truthMetalTotalAcrossDocs', () => {
  it('sums both buckets', () => {
    expect(truthMetalTotalAcrossDocs(10, 6)).toBe(16);
  });
});
