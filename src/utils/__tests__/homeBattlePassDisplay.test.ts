import { effectiveDeployedBattlePassXp } from '../homeBattlePassDisplay';
import type { Season1BattlePassProgress } from '../../types/season1';

describe('effectiveDeployedBattlePassXp', () => {
  it('uses only the season battle pass bucket, not profile lifetime XP', () => {
    const bp = {
      battlePassXP: 80,
      currentSeasonId: 'season_a',
    } as Season1BattlePassProgress;
    expect(effectiveDeployedBattlePassXp(bp)).toBe(80);
  });

  it('does not fall back to profile XP when the bucket is behind (season-scoped counter is source of truth)', () => {
    const bp = {
      battlePassXP: 200,
      currentSeasonId: 'old_season',
    } as Season1BattlePassProgress;
    expect(effectiveDeployedBattlePassXp(bp)).toBe(200);
  });
});
