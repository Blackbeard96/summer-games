/**
 * Class Flow Sprint Management: work library, sprint assignments, submissions, teams, rewards.
 * All fields are optional on older rooms; parse helpers in classFlowConfig.ts supply safe defaults.
 */
import type { Timestamp } from 'firebase/firestore';

export type CfSubmissionMethod = 'facilitator' | 'written' | 'link' | 'upload' | 'confirm';
export type CfWorkType = 'individual' | 'team';
export type CfAssignmentStatus = 'draft' | 'active' | 'archived';
export type CfDifficulty = 'easy' | 'medium' | 'hard';
export type CfBonusType = 'none' | 'flat' | 'multiplier';

export interface CfBonusConfig {
  type: CfBonusType;
  /** Flat: extra Sprint Points. Multiplier: e.g. 1.25. */
  value: number;
  /** Multiplier scope: the assignment whose approved credit is boosted. */
  targetAssignmentId?: string | null;
}

/** Reusable Work Library entry (`classFlowWorkLibrary/{id}`). */
export interface CfWorkAssignment {
  id: string;
  title: string;
  description: string;
  instructions: string;
  submissionRequirements: string;
  workType: CfWorkType;
  basePoints: number;
  estimatedMinutes: number;
  difficulty: CfDifficulty | null;
  submissionMethods: CfSubmissionMethod[];
  evidenceRequired: boolean;
  extraCreditEligible: boolean;
  /** Optional bonus task (requires approval like standard work). */
  isExtraCredit: boolean;
  bonus: CfBonusConfig;
  classId: string | null;
  status: CfAssignmentStatus;
  createdBy: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

/** Sprint-specific copy of a library assignment (points can differ from the library). */
export interface CfSprintAssignment {
  assignmentId: string;
  title: string;
  description: string;
  instructions: string;
  submissionRequirements: string;
  workType: CfWorkType;
  points: number;
  submissionMethods: CfSubmissionMethod[];
  evidenceRequired: boolean;
  isExtraCredit: boolean;
  bonus: CfBonusConfig;
}

export interface CfSprintPlanItem {
  planId: string;
  title: string;
  objective: string;
  durationMinutes: number;
  assignments: CfSprintAssignment[];
}

export type CfGrouping = 'squad' | 'table' | 'manual';
export type CfTagDisplay = 'replace' | 'alongside';
export type CfDistributionMode = 'equal' | 'contribution' | 'hybrid';
export type CfPayoutTiming = 'per_sprint' | 'end_of_event';
export type CfSharingInitiator = 'captain' | 'majority' | 'facilitator';

export interface CfBonusLimits {
  maxBonusPerPlayer: number;
  allowStacking: boolean;
  maxMultiplier: number;
  extraCountsToTeam: boolean;
}

export interface CfSharingConfig {
  initiator: CfSharingInitiator;
  options: number[];
  allowCustom: boolean;
  maxPercent: number;
}

/** `inSessionRooms/{id}.classFlowConfig` */
export interface CfConfig {
  workAssignmentsEnabled: boolean;
  submissionApprovalRequired: boolean;
  teamModeEnabled: boolean;
  teamCreditSharingEnabled: boolean;
  extraCreditEnabled: boolean;
  expandedTimerEnabled: boolean;
  contributionRewardsEnabled: boolean;
  acceptLateSubmissions: boolean;
  grouping: CfGrouping;
  tagDisplay: CfTagDisplay;
  distributionMode: CfDistributionMode;
  /** Hybrid: % of the per-member team share paid as the team reward. */
  hybridTeamPercent: number;
  payoutTiming: CfPayoutTiming;
  /** Sprint Points → MST rewards. 0 means points are tracked but not converted. */
  ppPerPoint: number;
  xpPerPoint: number;
  bonusLimits: CfBonusLimits;
  sharing: CfSharingConfig;
  plan: CfSprintPlanItem[];
}

/** Extra fields stored on `classFlowSprint` when Work Assignments are enabled. */
export interface CfSprintWork {
  planId?: string | null;
  objective?: string;
  assignments: CfSprintAssignment[];
}

export type CfSubmissionStatus =
  | 'submitted'
  | 'awaiting_approval'
  | 'approved'
  | 'revision_requested'
  | 'rejected';

/** Player-facing status, including client-only states. */
export type CfPlayerTaskStatus = 'not_started' | 'in_progress' | CfSubmissionStatus;

export interface CfEvidence {
  text?: string | null;
  url?: string | null;
  fileUrl?: string | null;
  filePath?: string | null;
  fileName?: string | null;
  confirmed?: boolean;
}

export interface CfAuditEntry {
  action: string;
  by: string;
  at: number;
  points?: number | null;
  feedback?: string | null;
}

/** `inSessionRooms/{sid}/cfSubmissions/{sprintId}__{assignmentId}__{uid}` */
export interface CfSubmission {
  id: string;
  sprintId: string;
  assignmentId: string;
  assignmentTitle: string;
  playerId: string;
  playerName: string;
  teamId: string | null;
  teamName: string | null;
  workType: CfWorkType;
  isExtraCredit: boolean;
  method: CfSubmissionMethod;
  evidence: CfEvidence;
  contributorIds: string[];
  requestedPoints: number;
  status: CfSubmissionStatus;
  approvedPoints: number;
  reviewedBy: string | null;
  reviewedAt: number | null;
  feedback: string | null;
  submittedAt: number;
  revisionCount: number;
  history: CfAuditEntry[];
}

/** `inSessionRooms/{sid}/cfTeams/{teamId}` (event-scoped; never touches permanent squads). */
export interface CfTeam {
  id: string;
  groupingType: CfGrouping;
  tableNumber: number | null;
  squadId: string | null;
  squadTag: string | null;
  defaultName: string;
  displayName: string;
  proposedName: string | null;
  memberIds: string[];
  captainId: string | null;
}

/** `inSessionRooms/{sid}/cfAllocations/{sprintId}__{uid}` */
export interface CfAllocation {
  id: string;
  sprintId: string;
  playerId: string;
  teamId: string | null;
  approvedWorkPoints: number;
  extraPoints: number;
  individualContribution: number;
  teamTotal: number;
  individualReward: number;
  teamReward: number;
  sharedIn: number;
  sharedOut: number;
  totalPoints: number;
  pp: number;
  xp: number;
  status: 'accrued' | 'paid_out';
  payoutId: string | null;
}

/** `inSessionRooms/{sid}/cfPayouts/{payoutId}` — amounts are immutable once created. */
export interface CfPayout {
  id: string;
  playerId: string;
  points: number;
  pp: number;
  xp: number;
  sprintIds: string[];
  status: 'pending' | 'claimed';
}

/** `inSessionRooms/{sid}/cfSharing/{sprintId}__{teamId}` */
export interface CfSharingDecision {
  id: string;
  sprintId: string;
  teamId: string;
  eligibleRecipients: string[];
  votes: Record<string, number>;
  proposedBy: string | null;
  proposedPercent: number | null;
  status: 'open' | 'proposed' | 'approved' | 'declined';
  approvedPercent: number | null;
  approvedBy: string | null;
  history: CfAuditEntry[];
}
