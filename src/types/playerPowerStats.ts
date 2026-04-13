/**
 * Four Power stats — progression from Live Events and goal achievements.
 * Persisted on students/{uid}.stats (see liveEventPowerStatsService).
 */

export type PowerStatBranch = 'physical' | 'mental' | 'emotional' | 'spiritual';

/** Shown on hover in Profile / player card — what progresses each stat */
export const POWER_STAT_EVENT_DESCRIPTION: Record<PowerStatBranch, string> = {
  physical: 'Leveled by Battle Royale live events.',
  mental: 'Leveled by Quiz live events.',
  emotional: 'Leveled by Reflection live events and strong, goal-linked writing.',
  spiritual: 'Leveled by achieving goals: habits, assessment goals, and story goals.',
};

/** Live / room modes and quiz mechanics that map to a Power stat via getPowerTypeForEvent */
export type LiveEventPowerSourceType =
  | 'battle_royale'
  | 'team_battle_royale'
  | 'quiz'
  | 'reflection'
  | 'goal_setting'
  /** Alias for goal-setting flows (same Spiritual progression). */
  | 'goal_completion'
  | 'class_flow'
  | 'neutral_flow';

export interface PowerStatBranchState {
  level: number;
  /** XP accumulated toward the next level (0 .. xpToNextLevel-1 once synced) */
  xp: number;
  /** XP required to reach the next level from the current level */
  xpToNextLevel: number;
  /** Lifetime XP added to this branch from all sources */
  totalEarned: number;
  /** Unlocked bonus ids (e.g. physical_tier_5) */
  bonusesUnlocked: string[];
}

export type PlayerPowerStatsMap = Record<PowerStatBranch, PowerStatBranchState>;

/** Partial gains shown in session summary (only nonzero fields set) */
export interface LiveEventPowerGain {
  physical?: number;
  mental?: number;
  emotional?: number;
  spiritual?: number;
}
