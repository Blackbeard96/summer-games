import { Timestamp } from 'firebase/firestore';

/**
 * Assessment Goals Types
 * 
 * This file defines the Firestore structure for the Assessment Goals feature.
 * Students can set goals for tests/exams, and receive PP rewards/penalties based on performance.
 */

// ============================================================================
// Core Types
// ============================================================================

export type AssessmentType = 'test' | 'exam' | 'quiz';
export type GradingStatus = 'draft' | 'open' | 'graded';
export type OutcomeType = 'hit' | 'miss' | 'exceed';

// ============================================================================
// Classes Collection
// ============================================================================

export interface Class {
  id: string;
  name: string;
  teacherAdminId: string;
  studentIds: string[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// ============================================================================
// Assessments Collection
// ============================================================================

export interface ArtifactReward {
  artifactId: string; // Artifact ID (e.g., 'captain-helmet', 'blaze-ring')
  artifactName: string; // Display name
  quantity?: number; // Number of artifacts to grant (default: 1)
}

export interface RewardTier {
  threshold: number; // Maximum absolute difference to qualify (e.g., 0 = exact hit, 2 = within 2 points)
  bonus: number; // PP bonus amount
  artifacts?: ArtifactReward[]; // Optional artifact rewards
}

export interface PenaltyTier {
  threshold: number; // Maximum absolute difference to qualify (e.g., 1 = within 1 point off, 5 = within 5 points off)
  penalty: number; // PP penalty amount (positive number, will be negated)
}

export interface Assessment {
  id: string;
  classId: string;
  title: string; // e.g., "Unit 3 Test"
  type: AssessmentType;
  date: Timestamp;
  maxScore: number; // Default 100
  minGoalScore?: number; // Minimum score students can set as their goal (default: 0)
  createdBy: string; // Admin uid
  isLocked: boolean; // Once locked, students can't change goals
  gradingStatus: GradingStatus;
  
  // Reward/Penalty Configuration
  rewardMode: 'pp' | 'pp_and_artifacts'; // PP only or PP + artifacts
  rewardTiers: RewardTier[];
  missPenaltyTiers: PenaltyTier[];
  penaltyCap: number; // Maximum penalty (e.g., 75)
  bonusCap: number; // Maximum bonus (e.g., 75)
  
  // Analytics
  numGoalsSet?: number;
  numGraded?: number;
  numApplied?: number;
  
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

// ============================================================================
// Assessment Goals Collection
// ============================================================================

export interface AssessmentGoal {
  id: string; // Format: ${assessmentId}_${studentId}
  assessmentId: string;
  classId: string;
  studentId: string;
  goalScore: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  locked: boolean; // True when assessment is locked
}

// ============================================================================
// Assessment Results Collection
// ============================================================================

export interface AssessmentResult {
  id: string; // Format: ${assessmentId}_${studentId}
  assessmentId: string;
  studentId: string;
  actualScore: number;
  gradedBy: string; // Admin uid
  gradedAt: Timestamp;
  
  // Computed fields (set by backend/function)
  computedDelta?: number; // actualScore - goalScore
  computedAbsDiff?: number; // abs(actualScore - goalScore)
  outcome?: OutcomeType; // 'hit' | 'miss' | 'exceed'
  ppChange?: number; // Positive or negative PP change
  artifactsGranted?: ArtifactReward[]; // Artifacts granted for this result
  applied: boolean; // Ensures rewards/penalties apply once
  appliedAt?: Timestamp;
}

// ============================================================================
// PP Ledger Collection
// ============================================================================

export interface PPLedgerEntry {
  id: string;
  studentId: string;
  sourceType: 'assessmentGoal'; // Extensible for other sources
  sourceId: string; // assessmentId
  amount: number; // Positive or negative
  createdAt: Timestamp;
  notes?: string; // e.g., "Within 5 points tier", "Exact hit bonus"
  
  // Reference fields for easier querying
  assessmentId?: string;
  goalScore?: number;
  actualScore?: number;
  outcome?: OutcomeType;
}

// ============================================================================
// UI Helper Types
// ============================================================================

export interface AssessmentWithGoal extends Assessment {
  goal?: AssessmentGoal;
  result?: AssessmentResult;
}

export interface StudentAssessmentRow {
  studentId: string;
  studentName: string;
  studentEmail?: string;
  goalScore?: number;
  actualScore?: number;
  computedDelta?: number;
  computedAbsDiff?: number;
  outcome?: OutcomeType;
  ppChange?: number;
  applied: boolean;
  goalId?: string;
  resultId?: string;
}

