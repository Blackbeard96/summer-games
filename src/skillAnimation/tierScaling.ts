import type { AnimationTier, SkillVfxTimings, VfxQuality } from './types';
import { vfxDensityScale } from './vfxQuality';

/** Tier bands (ms) — total feel; individual phases scaled proportionally. */
const TIER_TOTAL_MS: Record<AnimationTier, { min: number; max: number }> = {
  1: { min: 400, max: 800 },
  2: { min: 800, max: 1200 },
  3: { min: 1200, max: 1800 },
  4: { min: 1800, max: 2800 },
};

export function targetTotalDurationMs(tier: AnimationTier, quality: VfxQuality): number {
  const { min, max } = TIER_TOTAL_MS[tier];
  const mid = (min + max) / 2;
  const q = vfxDensityScale(quality);
  return Math.round(mid * (0.85 + 0.15 * q));
}

/**
 * Scale base timings toward tier target while preserving rough phase ratios.
 */
export function scaleTimingsForTier(
  base: SkillVfxTimings,
  tier: AnimationTier,
  quality: VfxQuality
): SkillVfxTimings {
  const cast = base.castMs || 200;
  const man = base.manifestationMs ?? Math.round(cast * 0.4);
  const travel = base.travelMs ?? 250;
  const impactD = base.impactDelayMs ?? 40;
  const after = base.afterMs ?? 200;
  const rawSum = cast + man + travel + impactD + after;
  const target = targetTotalDurationMs(tier, quality);
  const factor = rawSum > 0 ? target / rawSum : 1;
  return {
    castMs: Math.max(120, Math.round(cast * factor)),
    manifestationMs: Math.max(0, Math.round(man * factor)),
    travelMs: base.travelMs !== undefined ? Math.max(0, Math.round(travel * factor)) : Math.max(0, Math.round(travel * factor)),
    impactDelayMs: Math.max(0, Math.round(impactD * factor)),
    afterMs: Math.max(80, Math.round(after * factor)),
  };
}

export function tierShakeLevel(tier: AnimationTier): 'none' | 'light' | 'medium' | 'heavy' {
  if (tier <= 1) return 'none';
  if (tier === 2) return 'light';
  if (tier === 3) return 'medium';
  return 'heavy';
}
