/**
 * Habit Rewards & Penalties Constants
 * 
 * Default PP impact values for different habit statuses.
 * These can be tuned later via admin configuration.
 */

export const HABIT_PP_REWARDS = {
  COMPLETED: 25,      // +25 PP for completing habit
  BROKEN: -15,        // -15 PP for breaking habit
  IN_PROGRESS: 0,     // 0 PP for in-progress (not applied)
  DISPUTED: 0,        // 0 PP for disputed (not applied until resolved)
} as const;

/**
 * Computes PP impact based on habit status
 */
export function computeHabitImpact(status: string): number {
  switch (status) {
    case 'COMPLETED':
      return HABIT_PP_REWARDS.COMPLETED;
    case 'BROKEN':
      return HABIT_PP_REWARDS.BROKEN;
    case 'IN_PROGRESS':
    case 'DISPUTED':
    case 'active': // Legacy status
      return HABIT_PP_REWARDS.IN_PROGRESS;
    case 'completed': // Legacy status
      return HABIT_PP_REWARDS.COMPLETED;
    case 'failed': // Legacy status
      return HABIT_PP_REWARDS.BROKEN;
    default:
      return 0;
  }
}

/**
 * Checks if a habit status can have PP applied
 */
export function canApplyHabitPP(status: string, verification?: string): boolean {
  // Only COMPLETED and BROKEN can have PP applied
  if (status !== 'COMPLETED' && status !== 'BROKEN' && status !== 'completed' && status !== 'failed') {
    return false;
  }
  
  // Must have verification set
  if (!verification) {
    return false;
  }
  
  return true;
}


