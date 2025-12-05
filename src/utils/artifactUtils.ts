/**
 * Utility functions for artifact calculations
 */

/**
 * Calculate damage multiplier for an artifact based on its level
 * Each level adds 50-75% damage (we use 62.5% average for consistency)
 * @param level - The artifact level (defaults to 1)
 * @returns Damage multiplier (1.0 for level 1, 1.625 for level 2, etc.)
 */
export const getArtifactDamageMultiplier = (level: number = 1): number => {
  if (level <= 1) return 1.0;
  // Each level adds 62.5% damage (average of 50-75%)
  return 1.0 + (level - 1) * 0.625;
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
      return artifact.level || 1;
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
  const pp = 100 * Math.pow(2, currentLevel - 1);
  const truthMetal = currentLevel;
  return { pp, truthMetal };
};

