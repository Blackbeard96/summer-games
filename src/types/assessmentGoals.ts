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

export type WrittenAssessmentKind = 'test' | 'exam' | 'quiz';

/** One prompt in a Reflection-type assessment (admin-configured). */
export interface ReflectionQuestionConfig {
  id: string;
  prompt: string;
  responseMode: 'open' | 'preset';
  /** When responseMode === 'preset', labels shown in the student dropdown (min 2). */
  presetOptions?: string[];
}

export type AssessmentType =
  | 'written_assessment'
  | 'reflection'
  | 'habits'
  | 'story-goal'
  /** Physical work — admin-defined deliverable; completion is marked on/off (same scoring shape as label tiers). */
  | 'weekly_deliverable'
  /** @deprecated Legacy — treat as written_assessment in UI. */
  | 'test'
  | 'exam'
  | 'quiz'
  /** @deprecated Use `reflection`. */
  | 'live_reflection'
  /** @deprecated Live-event templates; avoid new creates. */
  | 'class_flow'
  | 'battle_royale'
  | 'live_event_quiz'
  | 'live_goal_setting';
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

export type RewardTierLabel = 'Completed' | 'Almost' | 'Attempted' | 'Did not Complete';

export interface RewardTier {
  label?: RewardTierLabel; // Descriptive label for the tier (new system)
  threshold?: number; // Legacy: numeric threshold (for backward compatibility)
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
  /** Physical / Mental / Emotional / Spiritual — optional on legacy rows. */
  energyType?: string;
  /** When type is written_assessment (or legacy test/exam/quiz coerced in UI). */
  writtenAssessmentKind?: WrittenAssessmentKind;
  /** When type is reflection — structured prompts for students. */
  reflectionConfig?: { questions: ReflectionQuestionConfig[] };
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
  
  // Habits-specific configuration (only used when type === 'habits')
  habitsConfig?: {
    defaultDuration?: HabitDuration; // Default duration for habit commitments
    defaultRewardPP?: number; // PP reward for completion
    defaultRewardXP?: number; // XP reward for completion
    defaultConsequencePP?: number; // PP penalty for failure (negative number)
    defaultConsequenceXP?: number; // XP penalty for failure (negative number)
    requireNotesOnCheckIn?: boolean; // Whether check-ins require notes (default: false)
  };
  
  // Story Goal-specific configuration (only used when type === 'story-goal')
  storyGoal?: {
    stageId: string;        // Canonical stage ID (e.g., 'call-to-adventure')
    stageLabel: string;     // Display label (e.g., 'Call to Adventure')
    milestoneTitle?: string; // Optional milestone title (e.g., 'Accept the invite')
    prompt?: string;        // Optional prompt/notes shown to students
  };

  /** Weekly deliverable — what kind of physical assignment it is (e.g. "Lab packet", "Equipment return"). */
  weeklyDeliverableConfig?: {
    assignmentType: string;
  };
}

// ============================================================================
// Assessment Goals Collection
// ============================================================================

export interface AssessmentGoal {
  id: string; // Format: ${assessmentId}_${studentId}
  assessmentId: string;
  classId: string;
  studentId: string;
  goalScore?: number; // Required for numeric goals (test/exam/quiz), optional for text-based goals
  textGoal?: string; // Required for Story Goals (text-based), optional for numeric goals
  /** Reflection-type assessments: answers keyed by question id. */
  reflectionResponses?: Record<string, string>;
  evidence?: string | null; // Optional evidence/reflection text for Story Goals and Habit Goals
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
// Habit Submissions Collection (for Habits assessment type)
// ============================================================================

export type HabitDuration = '1_class' | '1_day' | '3_days' | '1_week';
export type HabitSubmissionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'BROKEN' | 'DISPUTED' | 'active' | 'completed' | 'failed'; // Legacy statuses kept for compatibility
export type HabitVerification = 'VERIFIED' | 'NOT_VERIFIED' | 'TRUST_ACCEPTED';

/** How habit “evidence” is shown: tracked live-event stats vs free text. */
export type HabitEvidenceType =
  | 'live_event_sprint_rate'
  | 'live_event_consistency'
  | 'other';

/** Stored at habitSubmissions/{submissionId}/liveEventSessions/{sessionId} */
export interface HabitLiveEventSessionEvidence {
  sessionId: string;
  studentId: string;
  sessionTitle?: string;
  sprintsOffered: number;
  sprintsCompleted: number;
  /** UTC calendar days (YYYY-MM-DD) where the player completed ≥1 sprint */
  daysWithCompletedSprint?: string[];
  updatedAt?: Timestamp;
}

export interface HabitSubmission {
  id: string; // Format: ${assessmentId}_${studentId}
  assessmentId: string;
  classId: string;
  studentId: string;
  habitText: string; // 3-180 characters
  duration: HabitDuration;
  startAt: Timestamp;
  endAt: Timestamp;
  status: HabitSubmissionStatus; // IN_PROGRESS | COMPLETED | BROKEN | DISPUTED

  /** Defaults to `other` when missing (legacy). */
  habitEvidenceType?: HabitEvidenceType;
  
  // Check-in tracking (legacy, may be deprecated)
  checkIns?: { [dateKey: string]: Timestamp }; // dateKey format: YYYY-MM-DD
  requiredCheckIns?: number; // Calculated based on duration
  checkInCount?: number; // Current count of unique check-ins
  
  // New status-based tracking
  evidence?: string | null; // Optional reflection/evidence text (used when habitEvidenceType is `other`)
  verification?: HabitVerification; // VERIFIED | NOT_VERIFIED | TRUST_ACCEPTED
  ppImpact?: number; // Computed PP change (+25 for COMPLETED, -15 for BROKEN, etc.)
  
  // Application tracking
  applied?: boolean; // Whether PP has been applied
  appliedAt?: Timestamp | null; // When PP was applied
  appliedStatus?: 'APPLIED' | 'PENDING'; // Status of PP application
  
  // Legacy resolution tracking (deprecated)
  resolvedAt?: Timestamp;
  rewardApplied?: boolean;
  consequenceApplied?: boolean;
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
  habitSubmission?: HabitSubmission; // For Habits assessments
}

