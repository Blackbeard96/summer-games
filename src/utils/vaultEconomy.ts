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

/**
 * Calculate max shields for a given shield level
 * Formula: MaxShields(L) = round(2.1 * Capacity(L))
 * 
 * Note: This uses the capacity formula with shieldLevel as the index,
 * so shields scale independently but use the same curve.
 * 
 * @param shieldLevel - Current shield level (starts at 1)
 * @returns Max shield strength
 */
export function getMaxShields(shieldLevel: number): number {
  if (shieldLevel < 1) shieldLevel = 1;
  const capacityAtLevel = getCapacity(shieldLevel);
  return Math.round(2.1 * capacityAtLevel);
}

/**
 * Calculate shield upgrade cost (L -> L+1)
 * Formula: CostShields = round(0.12 * Capacity(L))
 *          CostShields = min(CostShields, floor(0.75 * Capacity(L)))
 * 
 * @param currentShieldLevel - Current shield level
 * @returns Upgrade cost in PP
 */
export function getShieldUpgradeCost(currentShieldLevel: number): number {
  if (currentShieldLevel < 1) currentShieldLevel = 1;
  const capacityAtLevel = getCapacity(currentShieldLevel);
  const rawCost = Math.round(0.12 * capacityAtLevel);
  const hardCap = Math.floor(0.75 * capacityAtLevel);
  return Math.min(rawCost, hardCap);
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
 * Infer shield level from stored maxShieldStrength value
 * Used for migration of existing players
 * 
 * @param storedMaxShields - Stored maxShieldStrength value from Firestore
 * @returns Inferred level (defaults to 1 if cannot be determined)
 */
export function inferShieldLevel(storedMaxShields: number): number {
  if (!storedMaxShields || storedMaxShields < 2100) return 1; // 2.1 * 1000
  
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


