/**
 * Work Board (W) — assignable classroom work for MST Classroom OS.
 * Complements existing productivityStats.workStats energy rollups; does not replace them.
 */

import type { Timestamp } from 'firebase/firestore';
import type { BattleEnergyType } from '../constants/energyTypes';

/** Shorthand unit for Work effort. */
export type WorkValue = number;

export type WorkScope = 'period' | 'day' | 'week' | 'mission' | 'project';

export type WorkCategory =
  | 'academic'
  | 'physical'
  | 'mental'
  | 'emotional'
  | 'spiritual'
  | 'project'
  | 'reflection'
  | 'mastery'
  | 'artifact'
  | 'bonus';

export const WORK_CATEGORY_LABELS: Record<WorkCategory, string> = {
  academic: 'Academic',
  physical: 'Physical',
  mental: 'Mental',
  emotional: 'Emotional',
  spiritual: 'Spiritual',
  project: 'Project',
  reflection: 'Reflection',
  mastery: 'Mastery',
  artifact: 'Artifact',
  bonus: 'Bonus',
};

export type WorkCompletionMode =
  | 'manual_student'
  | 'manual_admin'
  | 'auto_training_quiz'
  | 'auto_live_event'
  | 'auto_mission'
  | 'auto_weekly_goal'
  | 'auto_assessment'
  | 'auto_reflection';

export type WorkItemStatus = 'draft' | 'active' | 'inactive' | 'archived';

export type WorkCompletionStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'verified'
  | 'rejected'
  | 'waived';

/** Admin-created Work definition. Collection: workItems/{workId} */
export interface WorkItem {
  id: string;
  title: string;
  description: string;
  classId: string;
  className?: string;
  scope: WorkScope;
  /** Optional period this Work belongs to (day/week/mission window). */
  periodId?: string | null;
  category: WorkCategory;
  required: boolean;
  /** Work value (W). */
  wValue: WorkValue;
  /** Optional PP reward on verified completion (0 = none). */
  ppReward: number;
  dueAt?: Timestamp | Date | null;
  relatedSkillIds: string[];
  relatedGoalId?: string | null;
  relatedProjectId?: string | null;
  completionMode: WorkCompletionMode;
  /** For auto modes: external id (quiz set, mission id, etc.). */
  completionSourceId?: string | null;
  /** Energies this Work contributes to (can be multiple). */
  energyTypes: BattleEnergyType[];
  status: WorkItemStatus;
  createdBy: string;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
  seasonId?: string | null;
  weekKey?: string | null;
}

/** Time window for Expected W declarations. Collection: workPeriods/{periodId} */
export interface WorkPeriod {
  id: string;
  title: string;
  classId: string;
  className?: string;
  scope: WorkScope;
  startsAt: Timestamp | Date;
  endsAt: Timestamp | Date;
  status: 'upcoming' | 'open' | 'closed';
  /** Linked Live Event / Game Time session when applicable. */
  liveEventSessionId?: string | null;
  createdBy: string;
  createdAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
}

/**
 * Student declaration for a period.
 * Doc id: `${periodId}_${studentId}` — collection: workDeclarations
 */
export interface WorkDeclaration {
  id: string;
  periodId: string;
  studentId: string;
  classId: string;
  declaredW: number;
  /** Snapshot of required W available when declared (informational). */
  requiredWAtDeclaration: number;
  availableWAtDeclaration: number;
  note?: string;
  declaredAt?: Timestamp | Date | null;
  updatedAt?: Timestamp | Date | null;
}

/**
 * Per-student completion of a Work item.
 * Doc id: `${workId}_${studentId}` — collection: workCompletions
 */
export interface WorkCompletion {
  id: string;
  workId: string;
  studentId: string;
  classId: string;
  status: WorkCompletionStatus;
  wAwarded: number;
  ppAwarded: number;
  submittedAt?: Timestamp | Date | null;
  verifiedAt?: Timestamp | Date | null;
  verifiedBy?: string | null;
  rejectionNote?: string | null;
  autoSource?: string | null;
  evidence?: string | null;
  updatedAt?: Timestamp | Date | null;
}

export interface WorkBoardTotals {
  totalWAvailable: number;
  requiredW: number;
  optionalW: number;
  completedW: number;
  remainingW: number;
  requiredCompletedW: number;
  optionalCompletedW: number;
}

export interface WorkPeriodProgress {
  periodId: string;
  studentId: string;
  declaredW: number;
  requiredW: number;
  availableW: number;
  completedW: number;
  /** completedW / declaredW; null when declaredW === 0 */
  completionRate: number | null;
  requiredCompletionRate: number | null;
  optionalWCompleted: number;
  totalWCompleted: number;
}

export function safeCompletionRate(completed: number, declared: number): number | null {
  if (!declared || declared <= 0) return null;
  return Math.round((Math.max(0, completed) / declared) * 1000) / 1000;
}

export function emptyWorkBoardTotals(): WorkBoardTotals {
  return {
    totalWAvailable: 0,
    requiredW: 0,
    optionalW: 0,
    completedW: 0,
    remainingW: 0,
    requiredCompletedW: 0,
    optionalCompletedW: 0,
  };
}

export function computeWorkBoardTotals(
  items: WorkItem[],
  completionsByWorkId: Record<string, WorkCompletion | undefined>
): WorkBoardTotals {
  const totals = emptyWorkBoardTotals();
  for (const item of items) {
    if (item.status !== 'active') continue;
    const w = Math.max(0, Number(item.wValue) || 0);
    totals.totalWAvailable += w;
    if (item.required) totals.requiredW += w;
    else totals.optionalW += w;

    const c = completionsByWorkId[item.id];
    const done = c && (c.status === 'verified' || c.status === 'submitted');
    if (done) {
      const awarded = Math.max(0, Number(c!.wAwarded) || w);
      totals.completedW += awarded;
      if (item.required) totals.requiredCompletedW += awarded;
      else totals.optionalCompletedW += awarded;
    }
  }
  totals.remainingW = Math.max(0, totals.totalWAvailable - totals.completedW);
  return totals;
}

export function buildWorkPeriodProgress(args: {
  periodId: string;
  studentId: string;
  declaredW: number;
  totals: WorkBoardTotals;
}): WorkPeriodProgress {
  const { periodId, studentId, declaredW, totals } = args;
  return {
    periodId,
    studentId,
    declaredW: Math.max(0, declaredW),
    requiredW: totals.requiredW,
    availableW: totals.totalWAvailable,
    completedW: totals.completedW,
    completionRate: safeCompletionRate(totals.completedW, declaredW),
    requiredCompletionRate: safeCompletionRate(totals.requiredCompletedW, totals.requiredW),
    optionalWCompleted: totals.optionalCompletedW,
    totalWCompleted: totals.completedW,
  };
}
