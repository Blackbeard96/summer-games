/**
 * Permanent Live Event History & Analytics (admin mission-control).
 * Top-level: liveEventSessions/{sessionId}
 * Subcollections: participants, questions, timeline, rewards
 */

export type LiveEventHistoryStatus = 'live' | 'completed' | 'archived';

export type LiveEventHistoryEventType =
  | 'quiz'
  | 'battle_royale'
  | 'team_battle_royale'
  | 'reflection'
  | 'goals'
  | 'neutral_flow'
  | 'exam'
  | 'class_flow'
  | 'unknown'
  | string;

export interface LiveEventSettingsSnapshot {
  liveEventMode?: string;
  neutralFlowEnergyType?: string;
  gameMode?: string;
  quizId?: string;
  quizTitle?: string;
  timeLimitSeconds?: number;
  battleRoyaleConfig?: Record<string, unknown>;
  teamBattleRoyaleConfig?: Record<string, unknown>;
  rewardConfig?: Record<string, unknown>;
  inviteAllClasses?: boolean;
  classIds?: string[];
  hostParticipates?: boolean;
  examConfig?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LiveEventOverviewMetrics {
  averageAccuracy?: number;
  completionRate?: number;
  participationRate?: number;
  averageResponseTimeMs?: number;
  questionCount?: number;
  totalDamage?: number;
  totalDamageTaken?: number;
  totalHealing?: number;
  totalShieldGenerated?: number;
  totalEliminations?: number;
  totalMovesUsed?: number;
  totalPpSpent?: number;
  totalPpAwarded?: number;
  totalXpAwarded?: number;
  totalBattlePassXp?: number;
  disconnectEvents?: number;
  affectedPlayersByDisconnect?: number;
  studentsAssigned?: number;
  studentsJoined?: number;
  studentsCompleted?: number;
  studentsNeverJoined?: number;
  studentsLeftEarly?: number;
  strongestSkillId?: string;
  strongestSkillName?: string;
  strongestSkillAccuracy?: number;
  weakestSkillId?: string;
  weakestSkillName?: string;
  weakestSkillAccuracy?: number;
}

export interface LiveEventSkillAggregate {
  skillId: string;
  skillName?: string;
  correct: number;
  incorrect: number;
  unanswered?: number;
  responses: number;
  accuracy: number;
}

export interface LiveEventMoveUsageAggregate {
  moveId: string;
  moveName: string;
  moveType?: string;
  uses: number;
  totalDamage?: number;
  totalHealing?: number;
  totalShield?: number;
  /** Transparent effectiveness: (damage+healing+shield) / uses */
  effectivenessPerUse?: number;
}

export interface LiveEventTeamAggregate {
  teamId: string;
  teamName?: string;
  placement?: number;
  score?: number;
  accuracy?: number;
  damage?: number;
  healing?: number;
  shields?: number;
  eliminations?: number;
  memberIds?: string[];
}

export interface LiveEventSessionRecord {
  eventSessionId: string;
  eventId: string;
  eventType: LiveEventHistoryEventType;
  eventName: string;

  hostId: string;
  hostName?: string;
  classId: string;
  classIds: string[];
  className: string;

  quizId?: string;
  cfuId?: string;
  quizTitle?: string;

  startedAt: unknown;
  endedAt?: unknown;
  duration?: number;

  participantCount: number;
  questionCount?: number;

  status: LiveEventHistoryStatus;
  winnerIds?: string[];
  winnerNames?: string[];
  mvpPlayerId?: string;

  settingsSnapshot: LiveEventSettingsSnapshot;
  overview: LiveEventOverviewMetrics;

  skillPerformance?: LiveEventSkillAggregate[];
  moveUsage?: LiveEventMoveUsageAggregate[];
  teamAnalytics?: LiveEventTeamAggregate[];

  insights?: string[];
  timelinePreview?: LiveEventTimelineEntry[];
  timelineCount?: number;

  /** Soft-archive flag (also mirrored in status). */
  archived?: boolean;
  archivedAt?: unknown;
  archivedBy?: string;

  masteryAppliedAt?: unknown;
  sourceRoomId: string;

  createdAt: unknown;
  updatedAt: unknown;
}

export interface LiveEventParticipantRecord {
  userId: string;
  playerName?: string;
  /** Snapshot at event time when available */
  levelSnapshot?: number;
  roleSnapshot?: string;
  teamId?: string;
  teamName?: string;

  joinedAt?: unknown;
  finishedAt?: unknown;

  placement?: number;
  score?: number;

  questionsSeen?: number;
  questionsAnswered?: number;
  questionsCorrect?: number;
  questionsIncorrect?: number;
  questionsUnanswered?: number;
  accuracy?: number;
  averageResponseTimeMs?: number;

  ppEarned?: number;
  xpEarned?: number;
  battlePassXpEarned?: number;
  quizPp?: number;

  damageDealt?: number;
  damageTaken?: number;
  healingDone?: number;
  healingReceived?: number;
  shieldGenerated?: number;
  shieldDamageTaken?: number;

  elementalMovesUsed?: number;
  manifestMovesUsed?: number;
  skillsUsed?: Array<{
    skillId: string;
    skillName: string;
    count: number;
    energyType?: string;
    totalDamage?: number;
    totalHealing?: number;
  }>;
  totalSkillsUsed?: number;

  eliminations?: number;
  timesEliminated?: number;
  isEliminated?: boolean;
  longestStreak?: number;

  disconnectCount?: number;
  reconnectCount?: number;
  totalDisconnectedTimeMs?: number;

  completedEvent?: boolean;
  leftEarly?: boolean;

  skillResults?: LiveEventSkillAggregate[];
  rewardsAudit?: {
    pp?: number;
    xp?: number;
    battlePassXp?: number;
    artifacts?: string[];
    dailyChallenges?: string[];
  };
}

export interface LiveEventQuestionRecord {
  questionId: string;
  prompt?: string;
  difficulty?: string;
  skillIds?: string[];
  skillNames?: string[];
  orderIndex?: number;
  studentsAnswered: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  accuracy: number;
  averageResponseTimeMs?: number;
  highMiss?: boolean;
}

export interface LiveEventTimelineEntry {
  id: string;
  atMs: number;
  label: string;
  category?: 'system' | 'join' | 'question' | 'battle' | 'reward' | 'tech' | 'other';
  userId?: string;
  meta?: Record<string, unknown>;
}

export interface LiveEventRewardRecord {
  id: string;
  userId: string;
  playerName?: string;
  kind: 'pp' | 'xp' | 'battle_pass_xp' | 'artifact' | 'daily_challenge' | 'other';
  amount?: number;
  label: string;
  detail?: string;
}

export interface LiveEventHistoryListFilters {
  classId?: string;
  eventType?: string;
  hostId?: string;
  status?: LiveEventHistoryStatus | 'all';
  quizId?: string;
  search?: string;
  dateFromMs?: number;
  dateToMs?: number;
  includeArchived?: boolean;
  limit?: number;
}
