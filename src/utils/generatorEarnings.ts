/**
 * Utility functions for calculating generator passive earnings
 */

/**
 * Get the start of the current day in UTC (00:00:00 UTC)
 * This ensures consistent day boundaries regardless of timezone
 */
export function getCurrentUTCDayStart(): Date {
  const now = new Date();
  const utcDate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ));
  return utcDate;
}

/**
 * Get the start of a specific date in UTC
 */
export function getUTCDayStart(date: Date): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0, 0, 0, 0
  ));
}

/**
 * Calculate the number of full days between two dates (using UTC day boundaries)
 * Returns 0 if dates are on the same day or if lastClaimedAt is in the future
 */
export function calculateDaysAway(lastClaimedAt: Date | null | undefined): number {
  if (!lastClaimedAt) {
    return 0;
  }

  const now = new Date();
  const lastClaimedDayStart = getUTCDayStart(lastClaimedAt);
  const currentDayStart = getCurrentUTCDayStart();

  // If last claimed is today or in the future, return 0
  if (lastClaimedDayStart >= currentDayStart) {
    return 0;
  }

  // Calculate difference in milliseconds
  const diffMs = currentDayStart.getTime() - lastClaimedDayStart.getTime();
  // Convert to days (round down to get full days only)
  const daysAway = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Cap at 30 days to prevent runaway economy
  return Math.min(daysAway, 30);
}

/**
 * Calculate earnings based on days away and generator rates
 */
export function calculateEarnings(
  daysAway: number,
  ppPerDay: number,
  shieldsPerDay: number
): { ppEarned: number; shieldsEarned: number } {
  if (daysAway <= 0) {
    return { ppEarned: 0, shieldsEarned: 0 };
  }

  return {
    ppEarned: daysAway * ppPerDay,
    shieldsEarned: daysAway * shieldsPerDay
  };
}

/**
 * Check if modal should be shown today (based on lastModalShownAt)
 * Uses UTC day boundaries for consistency
 */
export function shouldShowModalToday(lastModalShownAt: Date | null | undefined): boolean {
  if (!lastModalShownAt) {
    return true; // Never shown before, so show it
  }

  const lastShownDayStart = getUTCDayStart(lastModalShownAt);
  const currentDayStart = getCurrentUTCDayStart();

  // Show if last shown was before today
  return lastShownDayStart < currentDayStart;
}









