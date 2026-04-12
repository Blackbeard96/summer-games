import type { CoopContributionTally } from '../types/coopBattle';

export interface BattleContributionResult {
  score: number;
  tier: 'full' | 'partial' | 'none';
  /** 0–1 normalized for reward scaling. */
  eligibilityFactor: number;
}

const FULL_THRESHOLD = 0.55;
const PARTIAL_THRESHOLD = 0.2;

/**
 * Heuristic contribution score for anti-exploit rewards.
 * Extend tallies from BattleEngine / cloud functions over time.
 */
export function calculateBattleContribution(
  tally: CoopContributionTally | undefined,
  roundsPresent: number,
  totalBattleRounds: number
): BattleContributionResult {
  const t = tally || {};
  const damage = Math.max(0, t.damageDealt || 0);
  const healing = Math.max(0, t.healingDone || 0);
  const shield = Math.max(0, t.shieldingDone || 0);
  const turns = Math.max(0, t.turnsActed || 0);
  const presence = Math.max(0, roundsPresent || t.roundsPresent || 0);

  const activityScore = damage * 1 + healing * 0.8 + shield * 0.6 + turns * 15;
  const presenceRatio =
    totalBattleRounds > 0 ? Math.min(1, presence / Math.max(1, totalBattleRounds)) : presence > 0 ? 1 : 0;
  const score = activityScore * (0.5 + 0.5 * presenceRatio);

  let tier: BattleContributionResult['tier'] = 'none';
  let eligibilityFactor = 0;
  if (score >= 200 || (turns >= 2 && presenceRatio >= 0.35)) {
    tier = 'full';
    eligibilityFactor = 1;
  } else if (score >= 40 || turns >= 1) {
    tier = 'partial';
    eligibilityFactor = 0.45;
  } else if (presenceRatio >= PARTIAL_THRESHOLD) {
    tier = 'partial';
    eligibilityFactor = 0.25;
  } else {
    tier = 'none';
    eligibilityFactor = 0;
  }

  if (tier === 'full' && presenceRatio < FULL_THRESHOLD && damage + healing + shield < 5) {
    tier = 'partial';
    eligibilityFactor = Math.min(eligibilityFactor, 0.35);
  }

  return { score, tier, eligibilityFactor };
}
