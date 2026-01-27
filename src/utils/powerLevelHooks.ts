/**
 * Power Level Recalculation Hooks
 * 
 * Helper utilities to trigger power level recalculation after mutations.
 * Use these in non-critical paths where errors shouldn't block the operation.
 */

import { recalculatePowerLevel } from '../services/recalculatePowerLevel';

/**
 * Recalculate power level asynchronously (non-blocking)
 * Catches and logs errors but doesn't throw
 */
export async function triggerPowerLevelRecalc(userId: string): Promise<void> {
  try {
    await recalculatePowerLevel(userId);
  } catch (error) {
    console.error(`Error recalculating power level for ${userId}:`, error);
    // Don't throw - power level recalculation is non-critical
  }
}


