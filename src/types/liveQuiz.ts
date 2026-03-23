/**
 * Live Event Quiz Mode (Kahoot-style) types.
 * Quiz session lives under inSessionRooms/{sessionId}/quizSession
 */

import { TrainingQuestion } from './trainingGrounds';

/** Regular Kahoot-style quiz vs battle-layer modes */
export type LiveQuizGameMode = 'regular' | 'battle_royale' | 'team_battle_royale';

export type BattleRoyaleSurvivorPreset = 1 | 3 | 5 | 10 | 'custom';

/** Host options for free-for-all battle royale quiz */
export interface BattleRoyaleHostConfig {
  /** End when this many players (or fewer) remain alive */
  finalSurvivorsTarget: number;
  shuffleAnswers: boolean;
  /** Loop question bank when exhausted */
  autoRepeatQuestions: boolean;
  /** When true, eliminated players cannot use combat (spectators) */
  spectatorsOnElimination: boolean;
  /** If true, eliminated players may still answer for PP-only (no combat if spectator mode) */
  allowEliminatedQuizAnswering: boolean;
  /** Host advances automatically after reveal (ms delay after timer ends); 0 = manual only */
  autoAdvanceDelayMs: number;
}

export interface TeamBattleRoyaleTeamDef {
  id: string;
  name: string;
  color: string;
}

/** Host options for team battle royale */
export interface TeamBattleRoyaleHostConfig {
  teamCount: number;
  teams: TeamBattleRoyaleTeamDef[];
  autoBalanceTeams: boolean;
  supportAlliesEnabled: boolean;
  /** false = each player has own HP (MVP); true reserved for shared pool UX */
  sharedTeamHealth: boolean;
  shuffleAnswers: boolean;
  autoRepeatQuestions: boolean;
  spectatorsOnElimination: boolean;
  allowEliminatedQuizAnswering: boolean;
  autoAdvanceDelayMs: number;
}

/** Runtime team assignments (uid -> team id) */
export interface TeamBattleRoyaleRuntimeState {
  playerTeamId: Record<string, string>;
  teams: TeamBattleRoyaleTeamDef[];
}

/** Streak / energy state for battle quiz modes (keys = uid) */
export interface BattleRoyaleRuntimeState {
  streaks: Record<string, number>;
  energy: Record<string, number>;
  /** Set when streak hits 7 until consumed by a strong move */
  strongUnlocked: Record<string, boolean>;
}

export type LiveQuizStatus =
  | 'idle'       // No quiz running (doc may exist but UI hides quiz)
  | 'lobby'      // Quiz selected, waiting to start
  | 'question_live'  // Question shown, players answering
  | 'answer_reveal'  // Timer ended, showing correct answer
  | 'leaderboard'    // Showing standings after question
  | 'completed';     // Quiz finished, final results

/** Which placement tiers receive rewards (union of selected tiers). */
export type LiveQuizPlacementTier = '1st' | '2nd' | '3rd' | 'top5' | 'top10';

/** Placement key: 1st = rank 1, 2nd = rank 2, 3rd = rank 3, top5 = ranks 4–5, top10 = ranks 6–10. */
export type LiveQuizPlacementKey = 'first' | 'second' | 'third' | 'top5' | 'top10';

/** Rewards for a single placement tier (PP, XP, and optional artifact). */
export interface LiveQuizPlacementReward {
  pp: number;
  xp: number;
  artifactId?: string;
  artifactName?: string;
}

/** Reward configuration: different PP, XP, and artifact per placement (1st, 2nd, 3rd, Top 5, Top 10). */
export interface LiveQuizRewardConfig {
  /** Per-placement rewards. first=1st, second=2nd, third=3rd, top5=4th–5th, top10=6th–10th. */
  placements: Record<LiveQuizPlacementKey, LiveQuizPlacementReward>;
}

/** One row in per-question history; quizRoundIndex disambiguates repeated question IDs */
export interface LiveQuizPerQuestionResultEntry {
  questionId: string;
  quizRoundIndex: number;
  isCorrect: boolean;
  pointsAwarded: number;
}

export interface LiveQuizSession {
  status: LiveQuizStatus;
  quizId: string;
  quizTitle?: string;
  questionIndex: number;       // 0-based current question
  questionOrder: string[];     // questionIds in order
  currentQuestionId: string | null;
  /** Increments each time a new question goes live; answers must match this round */
  quizRoundIndex?: number;
  questionStartedAt: number | null;  // server timestamp ms
  questionEndsAt: number | null;     // server timestamp ms
  timeLimitSeconds: number;
  hostUid: string;
  /** Default regular Kahoot-style; battle modes change scoring and flow */
  gameMode?: LiveQuizGameMode;
  battleRoyaleConfig?: BattleRoyaleHostConfig;
  teamBattleRoyaleConfig?: TeamBattleRoyaleHostConfig;
  teamBattleState?: TeamBattleRoyaleRuntimeState;
  battleRoyaleState?: BattleRoyaleRuntimeState;
  /** Set when a battle mode ends early (survivors / one team left / host) */
  battleEndReason?: 'survivor_threshold' | 'team_elimination' | 'host' | 'manual_complete';
  /** Total points per player (uid -> points) */
  leaderboard: { [uid: string]: number };
  /** Correct count per player (optional, for display) */
  correctCount?: { [uid: string]: number };
  /** Per-question results per player for quiz summary */
  perQuestionResults?: { [uid: string]: LiveQuizPerQuestionResultEntry[] };
  /** Reward config set by host when starting the quiz. Applied when quiz completes. */
  rewardConfig?: LiveQuizRewardConfig;
  createdAt?: any;
  updatedAt?: any;
}

export interface LiveQuizResponse {
  currentQuestionId: string;
  /** Must match LiveQuizSession.quizRoundIndex for the active question (omitted on legacy docs) */
  quizRoundIndex?: number;
  selectedIndices: number[];
  submittedAt: number;         // ms
  isCorrect: boolean;
  pointsAwarded: number;
}

export interface LiveQuizQuestionState extends TrainingQuestion {
  /** When this question started (ms). */
  startedAt?: number;
  /** When this question ends (ms). */
  endsAt?: number;
}
