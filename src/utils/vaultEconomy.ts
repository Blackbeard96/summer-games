/**
 * Vault Economy Formulas
 * 
 * Single source of truth for vault upgrade calculations.
 * All upgrade costs are capped at 75% of current capacity to prevent blocking progression.
 */

/**
 * Calculate vault capacity for a given level
 * Formula: Capacity(L) = 1000 + 350*(L-1) + 50*(L-1)^2
 * 
 * @param level - Current capacity level (starts at 1)
 * @returns Capacity in PP
 */
export function getCapacity(level: number): number {
  if (level < 1) level = 1;
  if (level === 1) return 1000;
  const lMinus1 = level - 1;
  return 1000 + 350 * lMinus1 + 50 * (lMinus1 * lMinus1);
}

/**
 * Calculate capacity upgrade cost (L -> L+1)
 * Formula: rawCost = round(0.45 * Capacity(L))
 *          hardCap = floor(0.75 * Capacity(L))
 *          CostCapacity = min(rawCost, hardCap)
 * 
 * @param currentLevel - Current capacity level
 * @returns Upgrade cost in PP
 */
export function getCapacityUpgradeCost(currentLevel: number): number {
  if (currentLevel < 1) currentLevel = 1;
  const currentCapacity = getCapacity(currentLevel);
  const rawCost = Math.round(0.45 * currentCapacity);
  const hardCap = Math.floor(0.75 * currentCapacity);
  return Math.min(rawCost, hardCap);
}

/** Shield Enhancement max supported upgrade level in UI/transactions. */
export const SHIELD_MAX_LEVEL = 10;

/** Curated shield progression table (level -> max shields). */
const SHIELD_MAX_VALUE_BY_LEVEL: Record<number, number> = {
  1: 500,
  2: 900,
  3: 1500,
  4: 2400,
  5: 3800,
  6: 5600,
  7: 7600,
  8: 9800,
  9: 12200,
  10: 15000,
};

/** Curated shield upgrade cost table (current level -> PP cost to next level). */
const SHIELD_UPGRADE_COST_BY_LEVEL: Record<number, number> = {
  1: 120,
  2: 220,
  3: 420,
  4: 750,
  5: 1200,
  6: 1750,
  7: 2500,
  8: 3600,
  9: 5000,
};

/**
 * Calculate max shields for a given shield level using curated table.
 * For legacy data above level 10, we extend conservatively so existing users don't break.
 */
export function getMaxShields(shieldLevel: number): number {
  if (shieldLevel < 1) shieldLevel = 1;
  if (shieldLevel <= SHIELD_MAX_LEVEL) {
    return SHIELD_MAX_VALUE_BY_LEVEL[shieldLevel];
  }
  // Safe legacy fallback for users above configured max level.
  return SHIELD_MAX_VALUE_BY_LEVEL[SHIELD_MAX_LEVEL] + (shieldLevel - SHIELD_MAX_LEVEL) * 3000;
}

/**
 * Calculate shield upgrade cost (L -> L+1) using curated table.
 * Returns Infinity at/above max to prevent further upgrades.
 */
export function getShieldUpgradeCost(currentShieldLevel: number): number {
  if (currentShieldLevel < 1) currentShieldLevel = 1;
  if (currentShieldLevel >= SHIELD_MAX_LEVEL) return Number.POSITIVE_INFINITY;
  return SHIELD_UPGRADE_COST_BY_LEVEL[currentShieldLevel] ?? Number.POSITIVE_INFINITY;
}

/**
 * Calculate generator PP per day for a given level
 * Formula: GenPP(L) = round(10 + 12*(L-1) + 3*( (L-1) ^ 1.4 ))
 * 
 * @param generatorLevel - Current generator level (starts at 1)
 * @returns PP generated per day
 */
export function getGeneratorPPPerDay(generatorLevel: number): number {
  if (generatorLevel < 1) generatorLevel = 1;
  if (generatorLevel === 1) return 10;
  const lMinus1 = generatorLevel - 1;
  return Math.round(10 + 12 * lMinus1 + 3 * Math.pow(lMinus1, 1.4));
}

/**
 * Calculate generator shields per day for a given level
 * Formula: GenShields(L) = GenPP(L)
 * 
 * @param generatorLevel - Current generator level (starts at 1)
 * @returns Shields generated per day
 */
export function getGeneratorShieldsPerDay(generatorLevel: number): number {
  return getGeneratorPPPerDay(generatorLevel);
}

/**
 * Calculate generator upgrade cost (L -> L+1)
 * Formula: CostGeneratorRaw = round(0.35 * Capacity(L))
 *          CostGenerator = min(CostGeneratorRaw, floor(0.75 * Capacity(L)))
 * 
 * Note: Uses capacity level, not generator level, for cost calculation
 * 
 * @param capacityLevel - Current capacity level (used for cost calculation)
 * @returns Upgrade cost in PP
 */
export function getGeneratorUpgradeCost(capacityLevel: number): number {
  if (capacityLevel < 1) capacityLevel = 1;
  const currentCapacity = getCapacity(capacityLevel);
  const rawCost = Math.round(0.35 * currentCapacity);
  const hardCap = Math.floor(0.75 * currentCapacity);
  return Math.min(rawCost, hardCap);
}

/**
 * Infer capacity level from stored capacity value
 * Used for migration of existing players
 * 
 * @param storedCapacity - Stored capacity value from Firestore
 * @returns Inferred level (defaults to 1 if cannot be determined)
 */
export function inferCapacityLevel(storedCapacity: number): number {
  if (!storedCapacity || storedCapacity < 1000) return 1;
  
  // Try to find the closest matching level
  for (let level = 1; level <= 100; level++) {
    const calculatedCapacity = getCapacity(level);
    const tolerance = 50; // Allow 50 PP tolerance for rounding
    if (Math.abs(calculatedCapacity - storedCapacity) <= tolerance) {
      return level;
    }
    // If we've passed the stored capacity, return previous level
    if (calculatedCapacity > storedCapacity + tolerance) {
      return Math.max(1, level - 1);
    }
  }
  
  // Default to level 1 if we can't determine
  return 1;
}

/**
 * Smallest capacity level L such that getCapacity(L) >= storedCapacity.
 * Used after migration merges so levels stay consistent with preserved capacity.
 */
export function minCapacityLevelForAtLeast(storedCapacity: number): number {
  if (!storedCapacity || storedCapacity <= 0) return 1;
  for (let level = 1; level <= 100; level++) {
    if (getCapacity(level) >= storedCapacity) return level;
  }
  return 100;
}

/**
 * Infer shield level from stored maxShieldStrength value
 * Used for migration of existing players
 * 
 * @param storedMaxShields - Stored maxShieldStrength value from Firestore
 * @returns Inferred level (defaults to 1 if cannot be determined)
 */
export function inferShieldLevel(storedMaxShields: number): number {
  if (!storedMaxShields || storedMaxShields < SHIELD_MAX_VALUE_BY_LEVEL[1]) return 1;
  
  // Try to find the closest matching level
  for (let level = 1; level <= 100; level++) {
    const calculatedMaxShields = getMaxShields(level);
    const tolerance = 100; // Allow 100 shield tolerance for rounding
    if (Math.abs(calculatedMaxShields - storedMaxShields) <= tolerance) {
      return level;
    }
    // If we've passed the stored max shields, return previous level
    if (calculatedMaxShields > storedMaxShields + tolerance) {
      return Math.max(1, level - 1);
    }
  }
  
  // Default to level 1 if we can't determine
  return 1;
}

/**
 * Smallest shield level L such that getMaxShields(L) >= storedMaxShields.
 */
export function minShieldLevelForAtLeast(storedMaxShields: number): number {
  if (!storedMaxShields || storedMaxShields <= 0) return 1;
  for (let level = 1; level <= 100; level++) {
    if (getMaxShields(level) >= storedMaxShields) return level;
  }
  return 100;
}

/**
 * Infer generator level from stored PP per day value
 * Used for migration of existing players
 * 
 * @param storedPPPerDay - Stored generator PP per day value
 * @returns Inferred level (defaults to 1 if cannot be determined)
 */
export function inferGeneratorLevel(storedPPPerDay: number): number {
  if (!storedPPPerDay || storedPPPerDay < 10) return 1;
  
  // Try to find the closest matching level
  for (let level = 1; level <= 100; level++) {
    const calculatedPPPerDay = getGeneratorPPPerDay(level);
    const tolerance = 5; // Allow 5 PP tolerance for rounding
    if (Math.abs(calculatedPPPerDay - storedPPPerDay) <= tolerance) {
      return level;
    }
    // If we've passed the stored PP per day, return previous level
    if (calculatedPPPerDay > storedPPPerDay + tolerance) {
      return Math.max(1, level - 1);
    }
  }
  
  // Default to level 1 if we can't determine
  return 1;
}


