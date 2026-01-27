/**
 * Power Level Calculation System
 * 
 * Calculates player Power Level (PL) based on:
 * - Base power (player level * 10)
 * - Equipped skills (tier + upgrade level)
 * - Equipped artifacts (rarity + upgrade level)
 * - Manifest ascension bonus
 */

export interface PowerBreakdown {
  base: number;
  skills: number;
  artifacts: number;
  ascension: number;
  total: number;
}

export interface PowerLevelResult {
  powerLevel: number;
  breakdown: PowerBreakdown;
}

/**
 * Tier value map for skills
 */
const SKILL_TIER_VALUES: Record<number, number> = {
  1: 15,
  2: 30,
  3: 50,
  4: 75
};

/**
 * Skill upgrade multiplier map
 */
const SKILL_UPGRADE_MULTIPLIERS: Record<number, number> = {
  1: 1.0,
  2: 1.15,
  3: 1.35,
  4: 1.6,
  5: 1.9
};

/**
 * Rarity value map for artifacts
 */
const ARTIFACT_RARITY_VALUES: Record<string, number> = {
  common: 20,
  uncommon: 35,
  rare: 55,
  epic: 80,
  legendary: 110,
  mythic: 150
};

/**
 * Artifact upgrade multiplier map
 */
const ARTIFACT_UPGRADE_MULTIPLIERS: Record<number, number> = {
  1: 1.0,
  2: 1.1,
  3: 1.25,
  4: 1.45,
  5: 1.7
};

/**
 * Manifest ascension bonus map
 */
const ASCENSION_BONUS: Record<number, number> = {
  1: 0,
  2: 25,
  3: 60,
  4: 110
};

/**
 * Calculate power contribution from a single skill
 */
export function getSkillPower(skillDoc: any): number {
  if (!skillDoc) return 0;
  
  // Defaults for missing fields
  const tier = skillDoc.tier || 1;
  const upgradeLevel = skillDoc.upgradeLevel || skillDoc.level || 1;
  
  // Ensure tier and upgradeLevel are valid
  const validTier = Math.max(1, Math.min(4, tier));
  const validUpgradeLevel = Math.max(1, Math.min(5, upgradeLevel));
  
  const tierValue = SKILL_TIER_VALUES[validTier] || SKILL_TIER_VALUES[1];
  const multiplier = SKILL_UPGRADE_MULTIPLIERS[validUpgradeLevel] || SKILL_UPGRADE_MULTIPLIERS[1];
  
  return Math.round(tierValue * multiplier);
}

/**
 * Calculate power contribution from a single artifact
 */
export function getArtifactPower(artifactDoc: any): number {
  if (!artifactDoc) return 0;
  
  // Defaults for missing fields
  const rarity = (artifactDoc.rarity || 'common').toLowerCase();
  const upgradeLevel = artifactDoc.upgradeLevel || 1;
  
  // Ensure upgradeLevel is valid
  const validUpgradeLevel = Math.max(1, Math.min(5, upgradeLevel));
  
  const rarityValue = ARTIFACT_RARITY_VALUES[rarity] || ARTIFACT_RARITY_VALUES.common;
  const multiplier = ARTIFACT_UPGRADE_MULTIPLIERS[validUpgradeLevel] || ARTIFACT_UPGRADE_MULTIPLIERS[1];
  
  return Math.round(rarityValue * multiplier);
}

/**
 * Get ascension bonus from manifest ascension level
 */
export function getAscensionBonus(ascensionLevel: number | null | undefined): number {
  if (!ascensionLevel || ascensionLevel < 1) return ASCENSION_BONUS[1];
  if (ascensionLevel > 4) return ASCENSION_BONUS[4];
  return ASCENSION_BONUS[ascensionLevel] || ASCENSION_BONUS[1];
}

/**
 * Compute total power level from all components
 */
export function computePowerLevel(params: {
  playerLevel: number;
  equippedSkillDocs: any[]; // Array of skill document data
  equippedArtifactDocs: any[]; // Array of artifact document data
  manifestAscensionLevel?: number | null;
}): PowerLevelResult {
  const {
    playerLevel = 1,
    equippedSkillDocs = [],
    equippedArtifactDocs = [],
    manifestAscensionLevel = 1
  } = params;
  
  // Base power: player level * 10
  const base = playerLevel * 10;
  
  // Skill power: sum of all equipped skills
  const skills = equippedSkillDocs.reduce((sum, skillDoc) => {
    return sum + getSkillPower(skillDoc);
  }, 0);
  
  // Artifact power: sum of all equipped artifacts
  const artifacts = equippedArtifactDocs.reduce((sum, artifactDoc) => {
    return sum + getArtifactPower(artifactDoc);
  }, 0);
  
  // Ascension bonus
  const ascension = getAscensionBonus(manifestAscensionLevel);
  
  // Total power level
  const total = base + skills + artifacts + ascension;
  
  return {
    powerLevel: total,
    breakdown: {
      base,
      skills,
      artifacts,
      ascension,
      total
    }
  };
}


