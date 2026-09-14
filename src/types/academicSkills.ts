/**
 * Academic Skill Mastery — universal MST skill objects (distinct from battle Skill Mastery).
 * Designed to attach later to CFUs, missions, live events, exams, IRL trees, etc.
 */

export type SkillMasteryBand =
  | 'mastered'
  | 'strong'
  | 'developing'
  | 'weak'
  | 'critical'
  | 'unexplored';

export type SkillEvidenceMode =
  | 'training-grounds'
  | 'live-event'
  | 'exam'
  | 'quiz'
  | 'skill-practice';

export interface AcademicSkill {
  id: string;
  name: string;
  slug: string;
  description?: string;
  category?: string;
  courseId?: string | null;
  parentSkillId?: string | null;
  icon?: string;
  color?: string;
  active: boolean;
  /** Future extensibility — optional, never required */
  linkedSkillTreeNodeId?: string | null;
  linkedRewardId?: string | null;
  linkedManifestId?: string | null;
  linkedAbilityId?: string | null;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
}

export interface SkillEvidenceEvent {
  id?: string;
  userId: string;
  skillId: string;
  cfuId?: string;
  questionId?: string;
  correct: boolean;
  partialCredit: number;
  weight: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  mode: SkillEvidenceMode;
  attemptNumber: number;
  responseTimeMs?: number;
  timestamp: any;
}

export interface PlayerSkillMastery {
  userId: string;
  skillId: string;
  totalAttempts: number;
  correctAttempts: number;
  incorrectAttempts: number;
  rawAccuracy: number;
  weightedAccuracy: number;
  recentAccuracy: number;
  masteryScore: number;
  masteryBand: SkillMasteryBand;
  lastPracticed?: any;
  trend: number[]; // recent mastery snapshots (0–100), oldest → newest
  difficultyCorrect?: Partial<Record<'easy' | 'medium' | 'hard', number>>;
  difficultyAttempts?: Partial<Record<'easy' | 'medium' | 'hard', number>>;
  milestonesAwarded?: string[];
  updatedAt?: any;
}

export interface SkillInsight {
  type: 'strongest' | 'growth' | 'needs_training' | 'recently_improved';
  title: string;
  message: string;
  skillId?: string;
}

export const MASTERY_BANDS: {
  id: SkillMasteryBand;
  label: string;
  min: number;
  max: number;
  color: string;
  bg: string;
}[] = [
  { id: 'mastered', label: 'Mastered', min: 90, max: 100, color: '#6ee7b7', bg: 'rgba(16,185,129,0.18)' },
  { id: 'strong', label: 'Strong', min: 75, max: 89, color: '#93c5fd', bg: 'rgba(59,130,246,0.18)' },
  { id: 'developing', label: 'Developing', min: 60, max: 74, color: '#f0c96a', bg: 'rgba(212,168,79,0.16)' },
  { id: 'weak', label: 'Weak', min: 40, max: 59, color: '#fdba74', bg: 'rgba(249,115,22,0.16)' },
  { id: 'critical', label: 'Critical', min: 0, max: 39, color: '#fca5a5', bg: 'rgba(239,68,68,0.16)' },
  { id: 'unexplored', label: 'Unexplored', min: -1, max: -1, color: '#9ca3af', bg: 'rgba(156,163,175,0.12)' },
];

export const ATTEMPT_WEIGHTS = {
  first: 1,
  second: 0.75,
  thirdPlus: 0.5,
} as const;

export const MASTERY_FORMULA = {
  withDifficulty: { weighted: 0.7, recent: 0.2, difficulty: 0.1 },
  withoutDifficulty: { weighted: 0.8, recent: 0.2 },
  recentWindow: 8,
} as const;

export const HIGH_MISS_QUESTION = {
  maxAccuracy: 50,
  minAttempts: 10,
} as const;
