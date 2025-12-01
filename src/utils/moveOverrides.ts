import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { MOVE_DAMAGE_VALUES } from '../types/battle';

interface StatusEffect {
  type: 'burn' | 'stun' | 'bleed' | 'poison' | 'confuse' | 'drain' | 'cleanse' | 'freeze' | 'none';
  duration: number;
  intensity?: number;
  damagePerTurn?: number;
  ppLossPerTurn?: number;
  ppStealPerTurn?: number;
  healPerTurn?: number;
  chance?: number;
  successChance?: number;
}

interface MoveOverrideData {
  id: string;
  name: string;
  damage: number | { min: number; max: number };
  description?: string;
  statusEffect?: StatusEffect; // Legacy support - single effect
  statusEffects?: StatusEffect[]; // New - multiple effects
}

interface MoveOverrides {
  [moveName: string]: MoveOverrideData;
}

// Cache for move overrides to avoid repeated Firestore calls
let moveOverridesCache: MoveOverrides | null = null;
let lastCacheTime: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Loads move overrides from Firestore with caching
 */
export const loadMoveOverrides = async (): Promise<MoveOverrides> => {
  const now = Date.now();
  
  // Return cached data if it's still fresh
  if (moveOverridesCache && (now - lastCacheTime) < CACHE_DURATION) {
    console.log('MoveOverrides: Using cached data');
    return moveOverridesCache;
  }

  try {
    console.log('MoveOverrides: Loading fresh data from Firestore');
    const moveOverridesRef = doc(db, 'adminSettings', 'moveOverrides');
    const overrideDoc = await getDoc(moveOverridesRef);
    
    if (overrideDoc.exists()) {
      const overrideData = overrideDoc.data();
      // Filter out metadata fields
      const { lastUpdated, updatedBy, ...moveOverrides } = overrideData;
      
      moveOverridesCache = moveOverrides as MoveOverrides;
      lastCacheTime = now;
      
      console.log('MoveOverrides: Loaded overrides:', moveOverridesCache);
      return moveOverridesCache;
    } else {
      console.log('MoveOverrides: No overrides found in database');
      moveOverridesCache = {};
      lastCacheTime = now;
      return moveOverridesCache;
    }
  } catch (error) {
    console.error('MoveOverrides: Error loading overrides:', error);
    // Return cached data if available, otherwise return empty object
    return moveOverridesCache || {};
  }
};

/**
 * Gets the damage value for a move, applying overrides if they exist
 */
export const getMoveDamage = async (moveName: string): Promise<number | { min: number; max: number }> => {
  const overrides = await loadMoveOverrides();
  
  // Check if there's an override for this move
  if (overrides[moveName]) {
    console.log(`MoveOverrides: Using override for ${moveName}:`, overrides[moveName].damage);
    return overrides[moveName].damage;
  }
  
  // Fall back to default values
  const defaultMove = MOVE_DAMAGE_VALUES[moveName];
  if (defaultMove) {
    console.log(`MoveOverrides: Using default for ${moveName}:`, defaultMove.damage);
    return defaultMove.damage;
  }
  
  console.warn(`MoveOverrides: No damage value found for ${moveName}`);
  return 0;
};

/**
 * Gets the name for a move, applying overrides if they exist
 */
export const getMoveName = async (moveName: string): Promise<string> => {
  const overrides = await loadMoveOverrides();
  
  // Check if there's an override for this move
  if (overrides[moveName]) {
    return overrides[moveName].name;
  }
  
  // Fall back to default name
  return moveName;
};

/**
 * Gets the description for a move, applying overrides if they exist
 */
export const getMoveDescription = async (moveName: string): Promise<string> => {
  const overrides = await loadMoveOverrides();
  
  // Check if there's an override for this move
  if (overrides[moveName]) {
    return overrides[moveName].description || '';
  }
  
  // Fall back to empty description (MOVE_DAMAGE_VALUES doesn't have descriptions)
  return '';
};

/**
 * Invalidates the cache, forcing a fresh load on next request
 */
export const invalidateMoveOverridesCache = () => {
  console.log('MoveOverrides: Cache invalidated');
  moveOverridesCache = null;
  lastCacheTime = 0;
};

/**
 * Synchronous version that uses cached data if available
 * Returns the default value if no cache is available
 */
export const getMoveDamageSync = (moveName: string): number | { min: number; max: number } => {
  // Check if we have cached data
  if (moveOverridesCache && moveOverridesCache[moveName]) {
    return moveOverridesCache[moveName].damage;
  }
  
  // Fall back to default values
  const defaultMove = MOVE_DAMAGE_VALUES[moveName];
  if (defaultMove) {
    return defaultMove.damage;
  }
  
  return 0;
};

/**
 * Synchronous version for move name with cache
 */
export const getMoveNameSync = (moveName: string): string => {
  if (moveOverridesCache && moveOverridesCache[moveName]) {
    return moveOverridesCache[moveName].name;
  }
  
  return moveName;
};

/**
 * Synchronous version for move description with cache
 */
export const getMoveDescriptionSync = (moveName: string): string => {
  if (moveOverridesCache && moveOverridesCache[moveName]) {
    return moveOverridesCache[moveName].description || '';
  }
  
  return '';
};

/**
 * Gets move status effect(s) with overrides applied (async version)
 * Returns an object with both statusEffect (legacy) and statusEffects (new) for compatibility
 */
export const getMoveStatusEffect = async (moveName: string) => {
  // "Read the Room" and "Emotional Read" should never have status effects
  if (moveName === 'Read the Room' || moveName === 'Emotional Read') {
    return {
      statusEffect: null,
      statusEffects: []
    };
  }
  
  const overrides = await loadMoveOverrides();
  const override = overrides[moveName];
  if (override) {
    return {
      statusEffect: override.statusEffect || null,
      statusEffects: override.statusEffects || null
    };
  }
  return null;
};

/**
 * Gets move status effect(s) with overrides applied (sync version)
 * Returns an object with both statusEffect (legacy) and statusEffects (new) for compatibility
 */
export const getMoveStatusEffectSync = (moveName: string) => {
  // "Read the Room" and "Emotional Read" should never have status effects
  if (moveName === 'Read the Room' || moveName === 'Emotional Read') {
    return {
      statusEffect: null,
      statusEffects: []
    };
  }
  
  if (moveOverridesCache && moveOverridesCache[moveName]) {
    const override = moveOverridesCache[moveName];
    return {
      statusEffect: override.statusEffect || null,
      statusEffects: override.statusEffects || null
    };
  }
  
  return null;
};
