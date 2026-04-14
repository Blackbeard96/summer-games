import type { Timestamp } from 'firebase/firestore';

export type WeeklyGoalType =
  | 'sprint_completion_rate'
  | 'live_event_participation'
  | 'sprint_assignment_speed'
  | 'custom';

export type WeeklyEvidenceType =
  | 'tracked_completion_rate'
  | 'tracked_participation'
  | 'tracked_completion_speed'
  | 'custom_admin_verified';

export type WeeklyGoalStatus = 'not_started' | 'in_progress' | 'achieved' | 'missed';

export type WeeklyVerificationStatus =
  | 'not_required'
  | 'pending_admin_review'
  | 'verified'
  | 'rejected';

/** Max active (current-week, open) goals per player */
export const MAX_ACTIVE_WEEKLY_GOALS = 3;

export const WEEKLY_GOAL_TYPE_LABELS: Record<WeeklyGoalType, string> = {
  sprint_completion_rate: 'Sprint completion rate',
  live_event_participation: 'Live Event participation',
  sprint_assignment_speed: 'Sprint assignment speed',
  custom: 'Custom goal',
};

export const WEEKLY_EVIDENCE_LABELS: Record<WeeklyEvidenceType, string> = {
  tracked_completion_rate: 'Completion rate (auto-tracked)',
  tracked_participation: 'Participation in Live Events (auto-tracked)',
  tracked_completion_speed: 'Completion speed (auto-tracked)',
  custom_admin_verified: 'Custom — admin verified',
};

export function defaultEvidenceForGoalType(goalType: WeeklyGoalType): WeeklyEvidenceType {
  switch (goalType) {
    case 'sprint_completion_rate':
      return 'tracked_completion_rate';
    case 'live_event_participation':
      return 'tracked_participation';
    case 'sprint_assignment_speed':
      return 'tracked_completion_speed';
    case 'custom':
    default:
      return 'custom_admin_verified';
  }
}

export interface WeeklyGoalDoc {
  id: string;
  playerId: string;
  title: string;
  description: string;
  goalType: WeeklyGoalType;
  evidenceType: WeeklyEvidenceType;
  targetValue: number;
  currentValue: number;
  unitLabel: string;
  status: WeeklyGoalStatus;
  verificationStatus: WeeklyVerificationStatus;
  customEvidenceText?: string;
  customEvidenceNotes?: string;
  adminFeedback?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  weekStartDate: Timestamp;
  weekEndDate: Timestamp;
  optionalNotes?: string;
  numerator?: number;
  denominator?: number;
  percentValue?: number;
  speedTargetHours?: number;
  qualifyingAssignmentsCompleted?: number;
  totalAssignmentsTracked?: number;
  participationSessionIds?: string[];
}

export type CreateWeeklyGoalInput = {
  title: string;
  description: string;
  goalType: WeeklyGoalType;
  /** Defaults by goal type; player may override in the creation UI. */
  evidenceType?: WeeklyEvidenceType;
  targetValue: number;
  unitLabel: string;
  weekStartDate: Date;
  weekEndDate: Date;
  optionalNotes?: string;
  speedTargetHours?: number;
};
