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
  
  // Only apply ring bonuses to elemental moves
  if (move.category === 'elemental' && equippedArtifacts) {
    const ringSlots = ['ring1', 'ring2', 'ring3', 'ring4'];
    const moveElement = move.elementalAffinity?.toLowerCase();
    
    for (const slot of ringSlots) {
      const ring = equippedArtifacts[slot];
      if (!ring) continue;
      
      // Blaze Ring adds +1 to Fire moves
      if ((ring.id === 'blaze-ring' || (ring.name && ring.name.includes('Blaze Ring'))) && moveElement === 'fire') {
        effectiveLevel = Math.min(effectiveLevel + 1, 10); // Cap at level 10
        break; // Only apply once
      }
      
      // Terra Ring adds +1 to Earth moves
      if ((ring.id === 'terra-ring' || (ring.name && ring.name.includes('Terra Ring'))) && moveElement === 'earth') {
        effectiveLevel = Math.min(effectiveLevel + 1, 10); // Cap at level 10
        break; // Only apply once
      }
      
      // Aqua Ring adds +1 to Water moves
      if ((ring.id === 'aqua-ring' || (ring.name && ring.name.includes('Aqua Ring'))) && moveElement === 'water') {
        effectiveLevel = Math.min(effectiveLevel + 1, 10); // Cap at level 10
        break; // Only apply once
      }
      
      // Air Ring adds +1 to Air moves
      if ((ring.id === 'air-ring' || (ring.name && ring.name.includes('Air Ring'))) && moveElement === 'air') {
        effectiveLevel = Math.min(effectiveLevel + 1, 10); // Cap at level 10
        break; // Only apply once
      }
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

