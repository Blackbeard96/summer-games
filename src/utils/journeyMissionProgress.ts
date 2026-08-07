/**
 * Player Journey / challenge progress status helpers.
 * Single source of truth for whether a challenge/mission looks completed in UI.
 */

export type JourneyProgressStatus =
  | 'locked'
  | 'available'
  | 'in_progress'
  | 'completed';

export const JOURNEY_PROGRESS_STATUSES: JourneyProgressStatus[] = [
  'locked',
  'available',
  'in_progress',
  'completed',
];

/** True when challenge progress record marks completion. */
export function isChallengeProgressCompleted(progress: any): boolean {
  if (!progress || typeof progress !== 'object') return false;
  return progress.isCompleted === true || progress.status === 'approved';
}

/**
 * Normalize a challenge progress blob so completion is unambiguous.
 * Used when writing completions outside the canonical engine (legacy paths).
 */
export function buildCompletedChallengeProgress(
  existing: Record<string, unknown> | undefined,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...(existing || {}),
    ...(extra || {}),
    isCompleted: true,
    status: 'approved',
    rewardsClaimed: (existing as any)?.rewardsClaimed === true,
  };
}

/** Format completion date for Journey cards. */
export function formatMissionCompletionDate(completedAt: any): string | null {
  if (!completedAt) return null;
  try {
    const date =
      typeof completedAt?.toDate === 'function'
        ? completedAt.toDate()
        : completedAt instanceof Date
          ? completedAt
          : new Date(completedAt);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString();
  } catch {
    return null;
  }
}
