/**
 * Tier / progress math for Firestore-defined battle passes (`seasons/{id}.tiers`).
 */

import type { BattlePassTier } from '../types/season1';

export function sortBattlePassTiers(tiers: BattlePassTier[]): BattlePassTier[] {
  return [...tiers].sort((a, b) => a.tierNumber - b.tierNumber);
}

export function maxTierNumber(tiers: BattlePassTier[]): number {
  if (!tiers.length) return 0;
  return Math.max(...tiers.map((t) => t.tierNumber));
}

/** Highest tier whose requiredXP threshold is met (cumulative XP style). */
export function tierReachedForXP(xp: number, tiers: BattlePassTier[]): number {
  const sorted = sortBattlePassTiers(tiers);
  let reached = 0;
  for (const t of sorted) {
    if (xp >= (Number(t.requiredXP) || 0)) reached = t.tierNumber;
  }
  return reached;
}

export type CompactCardProgressResult = {
  currentTier: number;
  maxTier: number;
  progressPercent: number;
  /** XP earned from the current segment floor toward the next tier threshold */
  xpInSegment: number;
  /** XP span for this segment (0 when fully complete) */
  xpSegmentSpan: number;
  isComplete: boolean;
};

/**
 * Season 0 home card: `currentTier` is the highest tier reached (0 = below first 1k threshold).
 * Progress spans [tier × 1000, (tier + 1) × 1000) until `currentTier >= maxTier`.
 */
export function season0CompactSegment(
  profileXp: number,
  maxTier: number,
  currentTier: number
): CompactCardProgressResult {
  const xp = Math.max(0, Math.floor(profileXp));
  if (currentTier >= maxTier) {
    return {
      currentTier,
      maxTier,
      progressPercent: 100,
      xpInSegment: xp,
      xpSegmentSpan: 0,
      isComplete: true,
    };
  }
  const low = currentTier * 1000;
  const high = (currentTier + 1) * 1000;
  const span = Math.max(1, high - low);
  const progressed = Math.max(0, xp - low);
  const progressPercent = Math.min(100, (progressed / span) * 100);
  return {
    currentTier,
    maxTier,
    progressPercent,
    xpInSegment: progressed,
    xpSegmentSpan: span,
    isComplete: false,
  };
}

/** Progress bar between previous and next tier thresholds. */
export function compactCardProgress(xp: number, tiers: BattlePassTier[]): CompactCardProgressResult {
  const sorted = sortBattlePassTiers(tiers);
  if (sorted.length === 0) {
    return {
      currentTier: 0,
      maxTier: 0,
      progressPercent: 0,
      xpInSegment: 0,
      xpSegmentSpan: 0,
      isComplete: true,
    };
  }
  const maxTier = maxTierNumber(sorted);
  const currentTier = tierReachedForXP(xp, sorted);
  const last = sorted[sorted.length - 1];
  const lastReq = Number(last.requiredXP) || 0;
  if (xp >= lastReq) {
    return {
      currentTier,
      maxTier,
      progressPercent: 100,
      xpInSegment: Math.max(0, xp),
      xpSegmentSpan: 0,
      isComplete: true,
    };
  }
  const nextT = sorted.find((t) => Number(t.requiredXP) > xp);
  if (!nextT) {
    return {
      currentTier,
      maxTier,
      progressPercent: 100,
      xpInSegment: Math.max(0, xp),
      xpSegmentSpan: 0,
      isComplete: true,
    };
  }
  const idx = sorted.indexOf(nextT);
  const prevT = idx > 0 ? sorted[idx - 1] : null;
  const low = prevT ? Number(prevT.requiredXP) || 0 : 0;
  const high = Number(nextT.requiredXP) || 0;
  const span = Math.max(1, high - low);
  const progressed = Math.max(0, xp - low);
  const progressPercent = Math.min(100, Math.max(0, (progressed / span) * 100));
  return {
    currentTier,
    maxTier,
    progressPercent,
    xpInSegment: progressed,
    xpSegmentSpan: span,
    isComplete: false,
  };
}
