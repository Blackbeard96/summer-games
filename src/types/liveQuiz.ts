/**
 * Live Event Quiz Mode (Kahoot-style) types.
 * Quiz session lives under inSessionRooms/{sessionId}/quizSession
 */

import { TrainingQuestion } from './trainingGrounds';

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

export interface LiveQuizSession {
  status: LiveQuizStatus;
  quizId: string;
  quizTitle?: string;
  questionIndex: number;       // 0-based current question
  questionOrder: string[];     // questionIds in order
  currentQuestionId: string | null;
  questionStartedAt: number | null;  // server timestamp ms
  questionEndsAt: number | null;     // server timestamp ms
  timeLimitSeconds: number;
  hostUid: string;
  /** Total points per player (uid -> points) */
  leaderboard: { [uid: string]: number };
  /** Correct count per player (optional, for display) */
  correctCount?: { [uid: string]: number };
  /** Per-question results per player for quiz summary (questionId -> isCorrect, pointsAwarded) */
  perQuestionResults?: { [uid: string]: Array<{ questionId: string; isCorrect: boolean; pointsAwarded: number }> };
  /** Reward config set by host when starting the quiz. Applied when quiz completes. */
  rewardConfig?: LiveQuizRewardConfig;
  createdAt?: any;
  updatedAt?: any;
}

export interface LiveQuizResponse {
  currentQuestionId: string;
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
