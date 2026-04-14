import {
  dailyChallengeStoredTypeMatchesEvent,
  getEffectiveDailyChallengeTarget,
  moveCountsForDailyElementalChallenge,
  moveCountsForDailyManifestChallenge,
  scaledDailyChallengeRewardPP,
} from '../dailyChallengeShared';
import type { Move } from '../../types/battle';

describe('dailyChallengeShared', () => {
  test('getEffectiveDailyChallengeTarget prefers parenthetical count in title', () => {
    expect(
      getEffectiveDailyChallengeTarget({
        title: 'Use your Manifest Abilities THREE (3) Times',
        target: 1,
      })
    ).toBe(3);
  });

  test('dailyChallengeStoredTypeMatchesEvent accepts common admin variants', () => {
    expect(dailyChallengeStoredTypeMatchesEvent('Use Elemental Moves', 'use_elemental_move')).toBe(true);
    expect(dailyChallengeStoredTypeMatchesEvent('elemental', 'use_elemental_move')).toBe(true);
    expect(dailyChallengeStoredTypeMatchesEvent('manifest', 'use_manifest_ability')).toBe(true);
    expect(dailyChallengeStoredTypeMatchesEvent('use_manifest_abilities', 'use_manifest_ability')).toBe(true);
    expect(
      dailyChallengeStoredTypeMatchesEvent('Use your Manifest Abilities THREE (3) Times', 'use_manifest_ability')
    ).toBe(true);
    expect(dailyChallengeStoredTypeMatchesEvent('win_battle', 'earn_pp')).toBe(false);
  });

  test('earn_xp challenge type synonyms', () => {
    expect(dailyChallengeStoredTypeMatchesEvent('Earn XP', 'earn_xp')).toBe(true);
    expect(dailyChallengeStoredTypeMatchesEvent('gain_xp', 'earn_xp')).toBe(true);
  });

  test('participate_live_event challenge type synonyms', () => {
    expect(dailyChallengeStoredTypeMatchesEvent('Live Event', 'participate_live_event')).toBe(true);
    expect(dailyChallengeStoredTypeMatchesEvent('join_live_event', 'participate_live_event')).toBe(true);
  });

  test('scaledDailyChallengeRewardPP multiplies by 10', () => {
    expect(scaledDailyChallengeRewardPP(50)).toBe(500);
  });

  test('moveCountsForDailyElementalChallenge uses affinity when category is wrong', () => {
    const m = { category: 'system' as Move['category'], elementalAffinity: 'fire' as const };
    expect(moveCountsForDailyElementalChallenge(m)).toBe(true);
  });

  test('moveCountsForDailyManifestChallenge counts RR Candy ids', () => {
    expect(
      moveCountsForDailyManifestChallenge({
        category: 'system',
        id: 'rr-candy-some-skill',
        name: 'X',
      } as Move)
    ).toBe(true);
  });

  test('moveCountsForDailyManifestChallenge treats Room Scan override name as manifest', () => {
    expect(
      moveCountsForDailyManifestChallenge({
        category: 'system',
        id: 'reading-l1',
        name: 'Room Scan',
      } as Move)
    ).toBe(true);
  });
});
