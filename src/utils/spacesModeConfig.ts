/**
 * Spaces Mode Configuration Constants
 * 
 * These constants define the base values and scaling for Spaces Mode battles.
 * All values can be adjusted for game balance.
 */

// Match duration in seconds (4 minutes)
export const SPACES_MODE_DURATION_SEC = 240;

// Base integrity values
export const SUB_SPACE_BASE_INTEGRITY = 100;
export const MAIN_SPACE_BASE_INTEGRITY = 300;

// Integrity scaling per player level
export const SUB_SPACE_INTEGRITY_PER_LEVEL = 10;
export const MAIN_SPACE_INTEGRITY_PER_LEVEL = 30;

// Base shield values (can start at 0 or small value)
export const BASE_SHIELD = 0;
export const BASE_MAX_SHIELD = 50;

// Shield scaling per level (optional)
export const SHIELD_PER_LEVEL = 5;

// Scoring values
export const SUB_SPACE_DESTROYED_POINTS = 1;
export const MAIN_SPACE_DESTROYED_POINTS = 3;

