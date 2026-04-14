import type { WeeklyGoalDoc, WeeklyGoalStatus } from '../types/weeklyGoals';

export function tsToMillis(t: unknown): number | null {
  if (t && typeof (t as { toMillis?: () => number }).toMillis === 'function') {
    return (t as { toMillis: () => number }).toMillis();
  }
  if (t instanceof Date) return t.getTime();
  return null;
}

export function weekBoundsMs(goal: Pick<WeeklyGoalDoc, 'weekStartDate' | 'weekEndDate'>): {
  start: number;
  end: number;
} {
  const s = tsToMillis(goal.weekStartDate);
  const e = tsToMillis(goal.weekEndDate);
  return {
    start: s ?? 0,
    end: e ?? 0,
  };
}

/** Goal window is active for automatic tracking */
export function isGoalInActiveWindow(goal: WeeklyGoalDoc, nowMs: number): boolean {
  const { start, end } = weekBoundsMs(goal);
  if (!start || !end) return false;
  return nowMs >= start && nowMs <= end;
}

export function shouldReceiveAutoUpdates(goal: WeeklyGoalDoc, nowMs: number): boolean {
  if (!isGoalInActiveWindow(goal, nowMs)) return false;
  if (goal.status === 'achieved' || goal.status === 'missed') return false;
  if (goal.evidenceType === 'custom_admin_verified') return false;
  return true;
}

export function recomputePercentFromParts(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(100, Math.round((numerator / denominator) * 100));
}

export function completionRateMeetsTarget(percentValue: number, targetPercent: number): boolean {
  return percentValue >= targetPercent;
}

export function countMeetsTarget(current: number, target: number): boolean {
  return current >= target;
}

/**
 * Derives display status for goals whose week has ended but doc was not updated.
 */
export function deriveDisplayStatus(goal: WeeklyGoalDoc, nowMs: number): WeeklyGoalStatus {
  const { end } = weekBoundsMs(goal);
  if (!end) return goal.status;

  if (goal.goalType === 'custom' && goal.evidenceType === 'custom_admin_verified') {
    if (goal.status === 'achieved' && goal.verificationStatus === 'verified') return 'achieved';
    if (goal.verificationStatus === 'rejected') return 'missed';
    if (nowMs > end && goal.verificationStatus === 'pending_admin_review') return 'missed';
    return goal.status;
  }

  const achieved =
    goal.goalType === 'sprint_completion_rate' && goal.evidenceType === 'tracked_completion_rate'
      ? completionRateMeetsTarget(goal.percentValue ?? 0, goal.targetValue)
      : goal.goalType === 'live_event_participation' && goal.evidenceType === 'tracked_participation'
        ? countMeetsTarget(goal.currentValue ?? 0, goal.targetValue)
        : goal.goalType === 'sprint_assignment_speed' && goal.evidenceType === 'tracked_completion_speed'
          ? countMeetsTarget(goal.qualifyingAssignmentsCompleted ?? 0, goal.targetValue)
          : false;

  if (goal.status === 'achieved' || goal.status === 'missed') return goal.status;
  if (nowMs > end) return achieved ? 'achieved' : 'missed';
  if (achieved) return 'achieved';
  return goal.status === 'not_started' ? 'not_started' : 'in_progress';
}

export function isAssignmentWithinSpeedWindow(
  sprintStartedAtMs: number,
  completedAtMs: number,
  speedTargetHours: number
): boolean {
  const ms = Math.max(0, speedTargetHours) * 3600 * 1000;
  return completedAtMs - sprintStartedAtMs <= ms;
}
