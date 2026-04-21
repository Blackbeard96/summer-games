import { liveEventPowerGainHasPositiveAmount } from '../liveEventPowerStatsService';

describe('liveEventPowerGainHasPositiveAmount', () => {
  test('empty or undefined', () => {
    expect(liveEventPowerGainHasPositiveAmount(undefined)).toBe(false);
    expect(liveEventPowerGainHasPositiveAmount({})).toBe(false);
  });

  test('detects any positive branch', () => {
    expect(liveEventPowerGainHasPositiveAmount({ physical: 1 })).toBe(true);
    expect(liveEventPowerGainHasPositiveAmount({ mental: 0, spiritual: 3 })).toBe(true);
  });

  test('zero and negatives are not positive', () => {
    expect(liveEventPowerGainHasPositiveAmount({ physical: 0, mental: 0 })).toBe(false);
  });
});
