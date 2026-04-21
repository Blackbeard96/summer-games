/**
 * Training Grounds Quiz System Types
 */

export interface TrainingQuestion {
  id: string;
  prompt: string;
  imageUrl?: string | null;
  options: string[]; // Non-empty answer texts in display order (typically 2–6 choices)
  correctIndex?: number; // DEPRECATED: Use correctIndices instead (0-based: 0=A, 1=B, 2=C, 3=D)
  correctIndices: number[]; // Array of indices of correct answers (supports multiple correct answers)
  explanation?: string | null;
  difficulty: 'easy' | 'medium' | 'hard';
  category?: string;
  pointsPP: number; // PP reward for fully correct answer (partial credit calculated proportionally)
  pointsXP: number; // XP reward for fully correct answer (partial credit calculated proportionally)
  artifactRewards?: string[]; // Array of artifact IDs to grant for correct answer
  order: number; // Order within quiz set
  createdAt?: any;
  updatedAt?: any;
}

export interface TrainingQuizSet {
  id: string;
  title: string;
  description?: string;
  createdBy: string; // Admin UID
  /** Class (classroom) IDs this CFU is for. Students only see published quizzes assigned to a class they are in. */
  classIds?: string[];
  groupIds?: string[]; // Array of group IDs (optional)
  isPublished: boolean;
  /**
   * When false, students still see this published CFU but cannot start or submit solo attempts.
   * Missing or true = accepting completions (backward compatible).
   */
  playerCompletionsEnabled?: boolean;
  questionCount: number; // Denormalized count
  tags?: string[];
  /** If true, quiz can be launched in Live Event Quiz Mode. Default true when undefined. */
  isLiveEventCompatible?: boolean;
  /** Per-question time limit in seconds for live mode. Override default (e.g. 20). */
  timeLimitSeconds?: number;
  createdAt: any;
  updatedAt: any;
}

export interface TrainingAttempt {
  id: string;
  userId: string;
  quizSetId: string;
  startedAt: any;
  completedAt?: any;
  scoreCorrect: number;
  scoreTotal: number;
  percent: number;
  answers: TrainingAnswer[];
  rewards: {
    ppGained: number;
    xpGained: number;
    bonuses: string[]; // e.g., ['streak', 'perfect']
  };
  mode: 'solo' | 'live'; // Phase 2: 'live' for Kahoot-style
  /** Set when this attempt was synced from a completed Live Event quiz (dedupe + provenance). */
  liveEventSourceSessionId?: string;
}

export interface TrainingAnswer {
  questionId: string;
  selectedIndex?: number; // DEPRECATED: Use selectedIndices instead
  selectedIndices: number[]; // Array of selected answer indices (supports multiple selections)
  isCorrect: boolean; // Fully correct (all correct answers selected, no incorrect)
  partialCredit: number; // 0.0 to 1.0 - percentage credit for partial correctness
  timeSpentMs: number; // Time taken to answer (optional, can be 0)
}

export interface TrainingGroundsStats {
  totalAttempts: number;
  avgScore: number; // Average percentage (0-100)
  bestScore: number; // Best percentage (0-100)
  totalPPFromTraining: number;
  totalXPFromTraining: number;
  streakBest: number; // Best streak of correct answers
  lastAttemptAt?: any;
}

export interface QuizRewardConfig {
  basePP: number;
  baseXP: number;
  streakBonusPP?: number; // Bonus PP every N correct in a row
  streakBonusThreshold?: number; // N correct answers for streak bonus
  perfectScoreBonusPP?: number;
  perfectScoreBonusXP?: number;
}

// Default reward values per difficulty
export const DEFAULT_REWARDS: Record<string, QuizRewardConfig> = {
  easy: {
    basePP: 5,
    baseXP: 5,
    streakBonusPP: 5,
    streakBonusThreshold: 3,
    perfectScoreBonusPP: 20,
    perfectScoreBonusXP: 20,
  },
  medium: {
    basePP: 10,
    baseXP: 10,
    streakBonusPP: 5,
    streakBonusThreshold: 3,
    perfectScoreBonusPP: 20,
    perfectScoreBonusXP: 20,
  },
  hard: {
    basePP: 15,
    baseXP: 15,
    streakBonusPP: 5,
    streakBonusThreshold: 3,
    perfectScoreBonusPP: 20,
    perfectScoreBonusXP: 20,
  },
};

