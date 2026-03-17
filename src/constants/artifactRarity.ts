/**
 * Artifact Rarity & Power Level — Single source of truth
 *
 * FEATURE: Artifact Rarity Power Level System
 * - Every artifact has a rarity; each rarity grants a FIXED Power Level bonus.
 * - Use these constants and helpers everywhere to avoid duplication.
 * - Defensive fallbacks for invalid or missing rarity.
 */

export type ArtifactRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const ARTIFACT_RARITIES: ArtifactRarity[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

/** Fixed Power Level bonus per rarity (no multiplier). */
export const RARITY_POWER_LEVEL_BONUS: Record<ArtifactRarity, number> = {
  common: 150,
  uncommon: 300,
  rare: 500,
  epic: 700,
  legendary: 900,
};

const RARITY_SET = new Set<string>(ARTIFACT_RARITIES);

/**
 * Get the fixed Power Level bonus for a rarity.
 * Returns 0 for null/undefined; normalizes and validates rarity otherwise.
 */
export function getPowerLevelBonusForRarity(
  rarity: string | null | undefined
): number {
  if (rarity == null || rarity === '') return RARITY_POWER_LEVEL_BONUS.common;
  const normalized = String(rarity).toLowerCase().trim();
  if (RARITY_SET.has(normalized)) {
    return RARITY_POWER_LEVEL_BONUS[normalized as ArtifactRarity];
  }
  return RARITY_POWER_LEVEL_BONUS.common;
}

/**
 * Normalize and validate rarity. Returns a valid ArtifactRarity or 'common'.
 */
export function normalizeArtifactRarity(
  rarity: string | null | undefined
): ArtifactRarity {
  if (rarity == null || rarity === '') return 'common';
  const normalized = String(rarity).toLowerCase().trim();
  return RARITY_SET.has(normalized) ? (normalized as ArtifactRarity) : 'common';
}

/**
 * Check if a string is a valid artifact rarity.
 */
export function isValidArtifactRarity(value: string): value is ArtifactRarity {
  return RARITY_SET.has(value.toLowerCase().trim());
}
