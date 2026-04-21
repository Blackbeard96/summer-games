/**
 * Session statistics types for In-Session Mode
 * Tracks player performance during a session
 */

import type { LiveEventPowerGain } from './playerPowerStats';

export interface SessionStats {
  // Player identification
  playerId: string;
  playerName: string;
  
  // PP tracking
  startingPP: number;
  endingPP: number;
  netPPGained: number; // endingPP - startingPP
  ppSpent: number; // Total PP spent on skills/actions
  ppEarned: number; // PP earned from participation/eliminations
  /** PP already mirrored to vault + students during the session (eliminations, sprint vault bonus) — used at finalize to avoid double credit. */
  vaultPpGrantedMidSession?: number;
  /** Set at session end by host: PP still owed to students/users/vault (participant claims with {@link claimLiveEventSessionEndPendingPp}). */
  sessionEndAccountPpPending?: number;
  sessionEndAccountPpClaimedAt?: unknown;

  /**
   * Host cannot update other users' `students` docs. Session-end Power stat XP + matching Battle Pass XP
   * are written here; the participant applies them with {@link claimLiveEventSessionEndPowerAndBattlePass}.
   */
  sessionEndBattlePassXpPending?: number;
  sessionEndPowerGainPending?: LiveEventPowerGain;
  sessionEndPowerBpClaimedAt?: unknown;

  // Participation tracking
  participationEarned: number; // Total participation points earned
  movesEarned: number; // Moves earned from participation
  /** Season 1: consecutive successful participation awards (for battle-log streak). */
  consecutiveParticipationAwards?: number;
  /** Season 1: last displayed streak count (optional, for dedupe). */
  lastLoggedStreakCount?: number;

  // Combat stats
  eliminations: number; // Number of players eliminated by this player
  eliminatedBy?: string; // ID of player who eliminated this player (if eliminated)
  isEliminated: boolean; // Whether this player was eliminated
  damageDealt: number; // Total damage dealt to other players
  damageTaken: number; // Total damage taken from other players
  healingGiven: number; // Total healing given (if applicable)
  healingReceived: number; // Total healing received (if applicable)
  
  // Skill usage
  skillsUsed: Array<{
    skillId: string;
    skillName: string;
    count: number; // How many times this skill was used
    totalDamage?: number; // Total damage dealt with this skill
    totalHealing?: number; // Total healing with this skill
  }>;
  totalSkillsUsed: number; // Total number of skill activations
  
  // Session metadata
  sessionId: string;
  sessionStartTime: any; // Firestore Timestamp
  sessionEndTime: any; // Firestore Timestamp
  sessionDuration: number; // Duration in seconds
  
  // Optional: MVP badges
  badges?: Array<{
    type: 'most_pp' | 'most_eliminations' | 'most_participation' | 'most_damage' | 'survivor';
    label: string;
  }>;
}

/** Quiz awards snapshot (stored when a quiz completes, shown in Live Event summary). */
export interface QuizAwardsPlacement {
  place: string;   // e.g. "1st", "2nd", "Top 5"
  pp: number;
  xp: number;
  artifactName?: string;
}

export interface QuizAwardsSnapshot {
  quizTitle?: string;
  placements: QuizAwardsPlacement[];
}

export interface SessionSummary {
  sessionId: string;
  classId: string;
  className: string;
  startedAt: any; // Firestore Timestamp
  endedAt: any; // Firestore Timestamp
  duration: number; // Duration in seconds
  totalPlayers: number;
  stats: { [playerId: string]: SessionStats };
  mvpPlayerId?: string; // Player with most eliminations or most PP
  /** Quiz rewards by placement (if a quiz was run during the event). */
  quizAwardsSnapshot?: QuizAwardsSnapshot;
  /** PP earned from quiz placement per player (uid -> PP), when a quiz was completed. */
  quizPpByPlayer?: Record<string, number>;
  /** Power stat XP granted at session end (per player); shown in summary. */
  liveEventPowerGains?: Record<string, LiveEventPowerGain>;
  /**
   * When there was no session-end Power/BP to grant, this is true (nothing to apply).
   * When rewards were queued on `stats/*` for students to claim, this is false until each player opens the
   * summary / ended room (then claim runs client-side).
   */
  liveEventPowerApplied?: boolean;
  /**
   * Final quiz leaderboard rank (1 = highest score) per player uid, only when the session had
   * a scored live quiz (max leaderboard score > 0). Used for school-wide placement stats.
   */
  liveEventQuizRankByPlayer?: Record<string, number>;
}



