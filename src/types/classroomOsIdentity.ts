/**
 * Story identity + Reputation — Power Card reflective fields (Classroom OS Phase 1).
 * Evidence fields only; no automatic psychological judgments.
 */

export type ReputationStatus =
  | 'in_poor_standing'
  | 'questionable'
  | 'neutral'
  | 'good_standing'
  | 'trusted'
  | 'high_standing';

export const REPUTATION_STATUS_LABELS: Record<ReputationStatus, string> = {
  in_poor_standing: 'In Poor Standing',
  questionable: 'Questionable',
  neutral: 'Neutral',
  good_standing: 'Good Standing',
  trusted: 'Trusted',
  high_standing: 'High Standing',
};

/** Configurable thresholds — stored at adminSettings/reputationThresholds */
export interface ReputationThresholds {
  /** Min consecutive verified goal outcomes for each tier (ascending). */
  streakForQuestionable: number;
  streakForNeutral: number;
  streakForGoodStanding: number;
  streakForTrusted: number;
  streakForHighStanding: number;
  /** Missed verified goals that drop status (recent window). */
  recentMissDrop: number;
}

export const DEFAULT_REPUTATION_THRESHOLDS: ReputationThresholds = {
  streakForQuestionable: 1,
  streakForNeutral: 2,
  streakForGoodStanding: 3,
  streakForTrusted: 5,
  streakForHighStanding: 8,
  recentMissDrop: 2,
};

export interface PlayerReputation {
  currentGoalStreak: number;
  longestGoalStreak: number;
  goalsDeclared: number;
  goalsAchieved: number;
  goalCompletionRate: number | null;
  currentReputationStatus: ReputationStatus;
  updatedAt?: unknown;
}

export function defaultPlayerReputation(): PlayerReputation {
  return {
    currentGoalStreak: 0,
    longestGoalStreak: 0,
    goalsDeclared: 0,
    goalsAchieved: 0,
    goalCompletionRate: null,
    currentReputationStatus: 'neutral',
  };
}

export function reputationFromStreak(
  streak: number,
  thresholds: ReputationThresholds = DEFAULT_REPUTATION_THRESHOLDS
): ReputationStatus {
  if (streak >= thresholds.streakForHighStanding) return 'high_standing';
  if (streak >= thresholds.streakForTrusted) return 'trusted';
  if (streak >= thresholds.streakForGoodStanding) return 'good_standing';
  if (streak >= thresholds.streakForNeutral) return 'neutral';
  if (streak >= thresholds.streakForQuestionable) return 'questionable';
  return 'in_poor_standing';
}

export type StoryEnemyType = 'internal' | 'external' | 'systemic' | 'unknown';

export const STORY_ENEMY_TYPE_LABELS: Record<StoryEnemyType, string> = {
  internal: 'Internal',
  external: 'External',
  systemic: 'Systemic',
  unknown: 'Unknown',
};

/** Reflective narrative fields on students/{uid}.storyIdentity */
export interface StoryIdentity {
  guide: string;
  code: string;
  primaryEnemy: string;
  enemyType: StoryEnemyType;
  enemyDescription: string;
  enemyEffect: string;
  enemyWeakness: string;
  updatedAt?: unknown;
}

export function defaultStoryIdentity(): StoryIdentity {
  return {
    guide: '',
    code: '',
    primaryEnemy: '',
    enemyType: 'unknown',
    enemyDescription: '',
    enemyEffect: '',
    enemyWeakness: '',
  };
}

export type StoryRole = 'main_character' | 'rival' | 'side_character' | 'npc';

export const STORY_ROLE_LABELS: Record<StoryRole, string> = {
  main_character: 'Main Character',
  rival: 'Rival',
  side_character: 'Side Character',
  npc: 'NPC',
};

export interface StoryRoleAssignment {
  role: StoryRole;
  seasonId?: string | null;
  weekKey?: string | null;
  assignedBy: string;
  assignedAt: unknown;
  note?: string;
}

export interface PlayerStoryRoleState {
  currentRole: StoryRole;
  history: StoryRoleAssignment[];
}
