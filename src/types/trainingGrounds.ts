/**
 * Training Grounds Quiz System Types
 */

export interface TrainingQuestion {
  id: string;
  prompt: string;
  imageUrl?: string | null;
  options: string[]; // Array of answer option texts (always 4 options: A, B, C, D)
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
  classIds?: string[]; // Array of class IDs who can see this
  groupIds?: string[]; // Array of group IDs (optional)
  isPublished: boolean;
  questionCount: number; // Denormalized count
  tags?: string[];
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

