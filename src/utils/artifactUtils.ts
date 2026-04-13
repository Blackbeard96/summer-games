/**
 * Utility functions for artifact calculations
 */

import { getPowerLevelBonusForRarity, normalizeArtifactRarity } from '../constants/artifactRarity';

/** Max artifact level (perk curves and upgrades cap here). */
export const ARTIFACT_MAX_LEVEL = 10;

/** Move mastery ceiling after applying affinity-ring bonus (matches battle logic). */
export const MOVE_MASTERY_CAP_WITH_RING = 10;

/** Mastery levels granted by a maxed (Lv.10) elemental affinity ring. */
export const ELEMENTAL_AFFINITY_RING_MAX_MASTERY_BONUS = 2;

type AffinityRingMatch = { ring: any; artifactLevel: number };

const AFFINITY_RING_ROWS: Array<{
  ids: string[];
  nameSubstrings: string[];
  elements: string[];
}> = [
  { ids: ['blaze-ring'], nameSubstrings: ['blaze ring'], elements: ['fire'] },
  { ids: ['terra-ring'], nameSubstrings: ['terra ring'], elements: ['earth'] },
  { ids: ['aqua-ring'], nameSubstrings: ['aqua ring'], elements: ['water'] },
  { ids: ['air-ring'], nameSubstrings: ['air ring'], elements: ['air'] },
  { ids: ['thunder-ring'], nameSubstrings: ['thunder ring'], elements: ['lightning', 'thunder'] },
];

function affinityRowMatchesRing(ring: { id?: string; name?: string }, row: (typeof AFFINITY_RING_ROWS)[0]): boolean {
  const id = String(ring.id || '').toLowerCase();
  const name = String(ring.name || '').toLowerCase();
  return (
    row.ids.some(
      (rid) => id === rid || id.startsWith(`${rid}-`) || id.startsWith(`${rid}_`) || id.startsWith(`${rid}.`)
    ) || row.nameSubstrings.some((frag) => name.includes(frag))
  );
}

/**
 * Equipped Blaze / Terra / Aqua / Air / Thunder ring affecting this elemental move, if any.
 */
export function findElementalAffinityRingForMove(
  move: { category?: string; elementalAffinity?: string } | null | undefined,
  equippedArtifacts: any
): AffinityRingMatch | null {
  if (!move || move.category !== 'elemental' || !equippedArtifacts) return null;
  const moveElement = move.elementalAffinity?.toLowerCase();
  if (!moveElement) return null;
  const ringSlots = ['ring1', 'ring2', 'ring3', 'ring4'] as const;
  for (const slot of ringSlots) {
    const ring = equippedArtifacts[slot];
    if (!ring || typeof ring !== 'object') continue;
    for (const row of AFFINITY_RING_ROWS) {
      if (!row.elements.includes(moveElement)) continue;
      if (!affinityRowMatchesRing(ring, row)) continue;
      return {
        ring,
        artifactLevel: clampArtifactLevel((ring as { level?: number }).level ?? 1),
      };
    }
  }
  return null;
}

/** +1 mastery until ring artifact L10, then +2 (capped with move mastery). */
export function getElementalAffinityRingMasteryBonusFromArtifactLevel(artifactLevel: number): number {
  return clampArtifactLevel(artifactLevel) >= ARTIFACT_MAX_LEVEL
    ? ELEMENTAL_AFFINITY_RING_MAX_MASTERY_BONUS
    : 1;
}

/**
 * Extra damage fraction for matching elemental moves from ring level (L1: 0; L9–L10: +25%).
 * Linear L2→L9 from ~3.125% to 25%.
 */
export function getElementalAffinityRingDamageBonusFraction(artifactLevel: number): number {
  const L = clampArtifactLevel(artifactLevel);
  const u = Math.min(9, L);
  if (u <= 1) return 0;
  return 0.25 * ((u - 1) / 8);
}

export function getElementalAffinityRingDamageMultiplierFromArtifactLevel(artifactLevel: number): number {
  return 1 + getElementalAffinityRingDamageBonusFraction(artifactLevel);
}

export function getElementalAffinityRingDamageMultiplierForMove(
  move: { category?: string; elementalAffinity?: string } | null | undefined,
  equippedArtifacts: any
): number {
  const hit = findElementalAffinityRingForMove(move, equippedArtifacts);
  if (!hit) return 1;
  return getElementalAffinityRingDamageMultiplierFromArtifactLevel(hit.artifactLevel);
}

export function clampArtifactLevel(level: unknown): number {
  return Math.max(1, Math.min(ARTIFACT_MAX_LEVEL, Math.floor(Number(level) || 1)));
}

/**
 * Normalize an artifact for power level and display: ensure rarity and powerLevelBonus.
 * Safe for migration and backward compatibility (missing rarity → 'common').
 */
export function normalizeArtifact(artifact: any): any {
  if (!artifact || typeof artifact !== 'object') return artifact;
  const rarity = normalizeArtifactRarity(artifact.rarity);
  const powerLevelBonus =
    typeof artifact.powerLevelBonus === 'number' && artifact.powerLevelBonus >= 0
      ? artifact.powerLevelBonus
      : getPowerLevelBonusForRarity(rarity);
  return {
    ...artifact,
    rarity,
    powerLevelBonus,
    perks: Array.isArray(artifact.perks) ? artifact.perks : [],
  };
}

/**
 * Calculate damage multiplier for an artifact based on its level
 * Each level adds 50-75% damage (we use 62.5% average for consistency)
 * @param level - The artifact level (defaults to 1)
 * @returns Damage multiplier (1.0 for level 1, 1.625 for level 2, etc.)
 */
export const getArtifactDamageMultiplier = (level: number = 1): number => {
  const L = clampArtifactLevel(level);
  if (L <= 1) return 1.0;
  // Each level adds 62.5% damage (average of 50-75%)
  return 1.0 + (L - 1) * 0.625;
};

/**
 * Get the equipped Elemental Ring level for a user
 * @param equippedArtifacts - The user's equipped artifacts object
 * @returns The level of the Elemental Ring, or 1 if not found/equipped
 */
export const getElementalRingLevel = (equippedArtifacts: any): number => {
  if (!equippedArtifacts) return 1;
  
  // Check all ring slots
  const ringSlots = ['ring1', 'ring2', 'ring3', 'ring4'];
  for (const slot of ringSlots) {
    const artifact = equippedArtifacts[slot];
    if (artifact && artifact.id === 'elemental-ring-level-1') {
      return clampArtifactLevel(artifact.level ?? 1);
    }
  }
  
  return 1; // Default to level 1 if no ring found
};

/**
 * Calculate upgrade cost for an artifact level
 * @param currentLevel - The current artifact level
 * @returns Object with pp and truthMetal costs
 */
export const calculateUpgradeCost = (currentLevel: number): { pp: number; truthMetal: number } => {
  // Level 1 → 2: 100 PP + 1 Truth Metal
  // Level 2 → 3: 200 PP + 2 Truth Metal
  // Level 3 → 4: 400 PP + 3 Truth Metal
  // Pattern: PP = 100 * 2^(level-1), Truth Metal = level
  const L = clampArtifactLevel(currentLevel);
  if (L >= ARTIFACT_MAX_LEVEL) {
    return { pp: 0, truthMetal: 0 };
  }
  const pp = 100 * Math.pow(2, L - 1);
  const truthMetal = L;
  return { pp, truthMetal };
};

/**
 * Get the effective mastery level for a move considering equipped artifacts
 * Blaze Ring adds +1 to Fire elemental moves' mastery level
 * Terra Ring adds +1 to Earth elemental moves' mastery level
 * Aqua Ring adds +1 to Water elemental moves' mastery level
 * Air Ring adds +1 to Air elemental moves' mastery level
 * @param move The move to check (should have category and elementalAffinity)
 * @param equippedArtifacts The user's equipped artifacts
 * @returns The effective mastery level (original + artifact bonuses)
 */
export const getEffectiveMasteryLevel = (move: { category: string; masteryLevel: number; elementalAffinity?: string }, equippedArtifacts: any): number => {
  let effectiveLevel = move.masteryLevel;

  if (move.category === 'elemental' && equippedArtifacts) {
    const hit = findElementalAffinityRingForMove(move, equippedArtifacts);
    if (hit) {
      const bonus = getElementalAffinityRingMasteryBonusFromArtifactLevel(hit.artifactLevel);
      effectiveLevel = Math.min(effectiveLevel + bonus, MOVE_MASTERY_CAP_WITH_RING);
    }
  }

  return effectiveLevel;
};

/**
 * Get the manifest damage boost from equipped artifacts (e.g., Captain's Helmet)
 * @param equippedArtifacts The user's equipped artifacts
 * @returns The damage multiplier (1.0 = no boost, 1.05 = 5% boost, etc.)
 */
export const getManifestDamageBoost = (equippedArtifacts: any): number => {
  if (!equippedArtifacts) return 1.0;
  
  let boost = 0;
  
  // Check head slot for Captain's Helmet
  const headArtifact = equippedArtifacts.head;
  if (headArtifact && (headArtifact.id === 'captains-helmet' || headArtifact.name === 'Captain\'s Helmet')) {
    const stats = headArtifact.stats || {};
    boost += stats.manifestDamageBoost || 0.05; // Default 5% if not specified
  }
  
  return 1.0 + boost;
};

