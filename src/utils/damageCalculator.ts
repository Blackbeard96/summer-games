// Damage Range Calculator for MST Battle System
// Implements probability-based damage ranges with player level and move mastery affecting max damage probability

export interface DamageRange {
  min: number;
  max: number;
  average: number;
}

export interface DamageResult {
  damage: number;
  isMaxDamage: boolean;
  roll: number; // 0-100, for debugging
  probability: number; // Chance of hitting max damage
}

/**
 * Calculate damage range for a move based on its base damage
 * @param baseDamage - The base damage value from MOVE_DAMAGE_VALUES
 * @param moveLevel - The move's level (1-4 for elemental, 1-5 for others)
 * @param masteryLevel - The move's mastery level (1-5)
 * @returns DamageRange object with min, max, and average values
 */
export const calculateDamageRange = (
  baseDamage: number,
  moveLevel: number,
  masteryLevel: number
): DamageRange => {
  // Base range is 80% to 100% of base damage
  const baseMin = Math.floor(baseDamage * 0.8);
  const baseMax = baseDamage;
  
  // Move level bonus: +10% range per level
  const levelBonus = Math.floor(baseDamage * 0.1 * (moveLevel - 1));
  
  // Mastery bonus: +5% range per mastery level
  const masteryBonus = Math.floor(baseDamage * 0.05 * (masteryLevel - 1));
  
  const min = baseMin + levelBonus;
  const max = baseMax + levelBonus + masteryBonus;
  const average = Math.floor((min + max) / 2);
  
  return { min, max, average };
};

/**
 * Calculate shield boost range for defensive moves
 * @param baseShieldBoost - The base shield boost value
 * @param moveLevel - The move's level
 * @param masteryLevel - The move's mastery level
 * @returns DamageRange object (reusing interface for shield boost)
 */
export const calculateShieldBoostRange = (
  baseShieldBoost: number,
  moveLevel: number,
  masteryLevel: number
): DamageRange => {
  // Shield boost has tighter range: 85% to 100%
  const baseMin = Math.floor(baseShieldBoost * 0.85);
  const baseMax = baseShieldBoost;
  
  // Move level bonus: +8% range per level
  const levelBonus = Math.floor(baseShieldBoost * 0.08 * (moveLevel - 1));
  
  // Mastery bonus: +4% range per mastery level
  const masteryBonus = Math.floor(baseShieldBoost * 0.04 * (masteryLevel - 1));
  
  const min = baseMin + levelBonus;
  const max = baseMax + levelBonus + masteryBonus;
  const average = Math.floor((min + max) / 2);
  
  return { min, max, average };
};

/**
 * Calculate healing range for support moves
 * @param baseHealing - The base healing value
 * @param moveLevel - The move's level
 * @param masteryLevel - The move's mastery level
 * @returns DamageRange object (reusing interface for healing)
 */
export const calculateHealingRange = (
  baseHealing: number,
  moveLevel: number,
  masteryLevel: number
): DamageRange => {
  // Healing has moderate range: 80% to 100%
  const baseMin = Math.floor(baseHealing * 0.8);
  const baseMax = baseHealing;
  
  // Move level bonus: +10% range per level
  const levelBonus = Math.floor(baseHealing * 0.1 * (moveLevel - 1));
  
  // Mastery bonus: +5% range per mastery level
  const masteryBonus = Math.floor(baseHealing * 0.05 * (masteryLevel - 1));
  
  const min = baseMin + levelBonus;
  const max = baseMax + levelBonus + masteryBonus;
  const average = Math.floor((min + max) / 2);
  
  return { min, max, average };
};

/**
 * Roll for damage based on player level and move mastery
 * Higher player level and move mastery increase chance of hitting max damage
 * @param damageRange - The calculated damage range
 * @param playerLevel - The player's current level
 * @param moveLevel - The move's level
 * @param masteryLevel - The move's mastery level
 * @returns DamageResult with actual damage, roll info, and probability
 */
export const rollDamage = (
  damageRange: DamageRange,
  playerLevel: number,
  moveLevel: number,
  masteryLevel: number
): DamageResult => {
  // Base probability of hitting max damage: 20%
  let maxDamageProbability = 20;
  
  // Player level bonus: +2% per level (capped at 50% bonus)
  const playerLevelBonus = Math.min(playerLevel * 2, 50);
  maxDamageProbability += playerLevelBonus;
  
  // Move level bonus: +5% per level
  const moveLevelBonus = (moveLevel - 1) * 5;
  maxDamageProbability += moveLevelBonus;
  
  // Mastery level bonus: +8% per mastery level
  const masteryBonus = (masteryLevel - 1) * 8;
  maxDamageProbability += masteryBonus;
  
  // Cap at 95% (always leave some chance for lower damage)
  maxDamageProbability = Math.min(maxDamageProbability, 95);
  
  // Roll 0-100
  const roll = Math.floor(Math.random() * 100);
  
  // Determine if we hit max damage
  const isMaxDamage = roll < maxDamageProbability;
  
  let damage: number;
  if (isMaxDamage) {
    damage = damageRange.max;
  } else {
    // Linear interpolation between min and max based on how close the roll was
    const rollRange = 100 - maxDamageProbability;
    const adjustedRoll = roll - maxDamageProbability;
    const ratio = adjustedRoll / rollRange;
    damage = Math.floor(damageRange.min + (damageRange.max - damageRange.min) * ratio);
  }
  
  return {
    damage,
    isMaxDamage,
    roll,
    probability: maxDamageProbability
  };
};

/**
 * Roll for shield boost (defensive moves)
 * @param shieldRange - The calculated shield boost range
 * @param playerLevel - The player's current level
 * @param moveLevel - The move's level
 * @param masteryLevel - The move's mastery level
 * @returns DamageResult with actual shield boost
 */
export const rollShieldBoost = (
  shieldRange: DamageRange,
  playerLevel: number,
  moveLevel: number,
  masteryLevel: number
): DamageResult => {
  // Shield boost has higher base probability: 30%
  let maxBoostProbability = 30;
  
  // Player level bonus: +2% per level
  const playerLevelBonus = Math.min(playerLevel * 2, 50);
  maxBoostProbability += playerLevelBonus;
  
  // Move level bonus: +6% per level
  const moveLevelBonus = (moveLevel - 1) * 6;
  maxBoostProbability += moveLevelBonus;
  
  // Mastery level bonus: +10% per mastery level
  const masteryBonus = (masteryLevel - 1) * 10;
  maxBoostProbability += masteryBonus;
  
  // Cap at 95%
  maxBoostProbability = Math.min(maxBoostProbability, 95);
  
  const roll = Math.floor(Math.random() * 100);
  const isMaxDamage = roll < maxBoostProbability;
  
  let boost: number;
  if (isMaxDamage) {
    boost = shieldRange.max;
  } else {
    const rollRange = 100 - maxBoostProbability;
    const adjustedRoll = roll - maxBoostProbability;
    const ratio = adjustedRoll / rollRange;
    boost = Math.floor(shieldRange.min + (shieldRange.max - shieldRange.min) * ratio);
  }
  
  return {
    damage: boost,
    isMaxDamage,
    roll,
    probability: maxBoostProbability
  };
};

/**
 * Roll for healing (support moves)
 * @param healingRange - The calculated healing range
 * @param playerLevel - The player's current level
 * @param moveLevel - The move's level
 * @param masteryLevel - The move's mastery level
 * @returns DamageResult with actual healing amount
 */
export const rollHealing = (
  healingRange: DamageRange,
  playerLevel: number,
  moveLevel: number,
  masteryLevel: number
): DamageResult => {
  // Healing has moderate base probability: 25%
  let maxHealingProbability = 25;
  
  // Player level bonus: +2% per level
  const playerLevelBonus = Math.min(playerLevel * 2, 50);
  maxHealingProbability += playerLevelBonus;
  
  // Move level bonus: +5% per level
  const moveLevelBonus = (moveLevel - 1) * 5;
  maxHealingProbability += moveLevelBonus;
  
  // Mastery level bonus: +8% per mastery level
  const masteryBonus = (masteryLevel - 1) * 8;
  maxHealingProbability += masteryBonus;
  
  // Cap at 95%
  maxHealingProbability = Math.min(maxHealingProbability, 95);
  
  const roll = Math.floor(Math.random() * 100);
  const isMaxDamage = roll < maxHealingProbability;
  
  let healing: number;
  if (isMaxDamage) {
    healing = healingRange.max;
  } else {
    const rollRange = 100 - maxHealingProbability;
    const adjustedRoll = roll - maxHealingProbability;
    const ratio = adjustedRoll / rollRange;
    healing = Math.floor(healingRange.min + (healingRange.max - healingRange.min) * ratio);
  }
  
  return {
    damage: healing,
    isMaxDamage,
    roll,
    probability: maxHealingProbability
  };
};

/**
 * Get formatted damage range string for UI display
 * @param range - The damage range
 * @returns Formatted string like "12-15"
 */
export const formatDamageRange = (range: DamageRange): string => {
  return `${range.min}-${range.max}`;
};

/**
 * Get formatted damage range with average for UI display
 * @param range - The damage range
 * @returns Formatted string like "12-15 (avg: 13)"
 */
export const formatDamageRangeWithAverage = (range: DamageRange): string => {
  return `${range.min}-${range.max} (avg: ${range.average})`;
};
