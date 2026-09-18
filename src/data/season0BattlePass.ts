/**
 * Legacy Season 0 Battle Pass — historically hardcoded in BattlePass.tsx.
 * Mirrored into `seasons/season_0` so Admin Battle Passes lists every pass.
 * Player claims for Season 0 still use `battlePass/{uid}_season0` (free/premium tracks).
 */

import type { BattlePassReward, BattlePassTier, Season } from '../types/season1';

export const SEASON_0_BATTLE_PASS_ID = 'season_0';

type LegacySeason0Reward = {
  type: 'pp' | 'xp' | 'shard' | 'actionCard';
  amount: number;
  actionCardName?: string;
  imageUrl?: string;
};

type LegacySeason0Tier = {
  tier: number;
  freeReward: LegacySeason0Reward;
  premiumReward: LegacySeason0Reward;
  requiredXP: number;
};

/** Canonical Season 0 tier table (matches player BattlePass.tsx). */
export const SEASON_0_LEGACY_TIERS: LegacySeason0Tier[] = [
  { tier: 1, freeReward: { type: 'pp', amount: 100 }, premiumReward: { type: 'pp', amount: 200 }, requiredXP: 1000 },
  { tier: 2, freeReward: { type: 'xp', amount: 50 }, premiumReward: { type: 'xp', amount: 100 }, requiredXP: 2000 },
  { tier: 3, freeReward: { type: 'pp', amount: 150 }, premiumReward: { type: 'pp', amount: 300 }, requiredXP: 3000 },
  { tier: 4, freeReward: { type: 'shard', amount: 1 }, premiumReward: { type: 'shard', amount: 2 }, requiredXP: 4000 },
  { tier: 5, freeReward: { type: 'pp', amount: 200 }, premiumReward: { type: 'pp', amount: 400 }, requiredXP: 5000 },
  { tier: 6, freeReward: { type: 'xp', amount: 75 }, premiumReward: { type: 'xp', amount: 150 }, requiredXP: 6000 },
  { tier: 7, freeReward: { type: 'pp', amount: 250 }, premiumReward: { type: 'pp', amount: 500 }, requiredXP: 7000 },
  { tier: 8, freeReward: { type: 'shard', amount: 2 }, premiumReward: { type: 'shard', amount: 4 }, requiredXP: 8000 },
  { tier: 9, freeReward: { type: 'pp', amount: 300 }, premiumReward: { type: 'pp', amount: 600 }, requiredXP: 9000 },
  { tier: 10, freeReward: { type: 'xp', amount: 100 }, premiumReward: { type: 'xp', amount: 200 }, requiredXP: 10000 },
  { tier: 11, freeReward: { type: 'pp', amount: 350 }, premiumReward: { type: 'pp', amount: 700 }, requiredXP: 11000 },
  { tier: 12, freeReward: { type: 'shard', amount: 3 }, premiumReward: { type: 'shard', amount: 6 }, requiredXP: 12000 },
  { tier: 13, freeReward: { type: 'pp', amount: 400 }, premiumReward: { type: 'pp', amount: 800 }, requiredXP: 13000 },
  { tier: 14, freeReward: { type: 'xp', amount: 125 }, premiumReward: { type: 'xp', amount: 250 }, requiredXP: 14000 },
  {
    tier: 15,
    freeReward: {
      type: 'actionCard',
      amount: 1,
      actionCardName: 'Freeze',
      imageUrl: '/images/Action Card - Freeze.png',
    },
    premiumReward: { type: 'pp', amount: 1000 },
    requiredXP: 15000,
  },
];

function mapLegacyReward(
  r: LegacySeason0Reward,
  track: 'free' | 'premium',
  tier: number
): BattlePassReward {
  const trackLabel = track === 'free' ? 'Free' : 'Premium';
  if (r.type === 'pp') {
    return {
      id: `s0_t${tier}_${track}_pp`,
      rewardType: 'pp',
      quantity: r.amount,
      displayName: `${trackLabel}: ${r.amount} PP`,
      description: `Season 0 ${trackLabel.toLowerCase()} track — Power Points.`,
      rarity: track === 'premium' ? 'uncommon' : 'common',
    };
  }
  if (r.type === 'xp') {
    return {
      id: `s0_t${tier}_${track}_xp`,
      rewardType: 'xp',
      quantity: r.amount,
      displayName: `${trackLabel}: ${r.amount} XP`,
      description: `Season 0 ${trackLabel.toLowerCase()} track — profile XP.`,
      rarity: track === 'premium' ? 'uncommon' : 'common',
    };
  }
  if (r.type === 'shard') {
    return {
      id: `s0_t${tier}_${track}_shard`,
      rewardType: 'item',
      quantity: r.amount,
      displayName: `${trackLabel}: ${r.amount} Shard${r.amount === 1 ? '' : 's'}`,
      description: `Season 0 ${trackLabel.toLowerCase()} track — shards.`,
      rarity: track === 'premium' ? 'rare' : 'uncommon',
    };
  }
  return {
    id: `s0_t${tier}_${track}_action`,
    rewardType: 'skill_card',
    quantity: r.amount,
    rewardRefId: r.actionCardName ? `action_card_${r.actionCardName.toLowerCase()}` : undefined,
    displayName: `${trackLabel}: ${r.actionCardName || 'Action Card'}`,
    description: `Season 0 ${trackLabel.toLowerCase()} track — action card.`,
    iconUrl: r.imageUrl,
    rarity: 'epic',
  };
}

export function buildSeason0BattlePassTiers(): BattlePassTier[] {
  return SEASON_0_LEGACY_TIERS.map((t) => ({
    id: `season0_tier_${t.tier}`,
    tierNumber: t.tier,
    requiredXP: t.requiredXP,
    rewards: [
      mapLegacyReward(t.freeReward, 'free', t.tier),
      mapLegacyReward(t.premiumReward, 'premium', t.tier),
    ],
  }));
}

/** Season document shape for Admin / `seasons/season_0`. Inactive by default (Season 1 stays deployed). */
export function createSeason0BattlePassDefinition(): Season {
  const start = new Date('2024-01-01T00:00:00');
  const end = new Date('2099-12-31T23:59:59');
  return {
    id: SEASON_0_BATTLE_PASS_ID,
    name: 'Season 0 — Timu Island',
    theme: 'Timu Island',
    active: false,
    startAt: start,
    endAt: end,
    description:
      'Legacy Season 0 Battle Pass (free + premium tracks). Player claims still use battlePass/{uid}_season0. Editing here updates the seasons/ catalog; keep Season 1 deployed as the active Meta State pass unless you intentionally switch.',
    linkedGameSeasonKey: 'season_0',
    featuredHero: 'Kon',
    tiers: buildSeason0BattlePassTiers(),
  };
}
