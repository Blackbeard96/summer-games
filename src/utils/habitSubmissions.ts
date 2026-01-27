import { Timestamp } from 'firebase/firestore';
import { HabitDuration } from '../types/assessmentGoals';

/**
 * Helper functions for habit submission calculations
 */

/**
 * Calculate required check-ins based on duration
 */
export function getRequiredCheckIns(duration: HabitDuration): number {
  switch (duration) {
    case '1_class':
    case '1_day':
      return 1;
    case '3_days':
      return 3;
    case '1_week':
      return 7;
    default:
      return 1;
  }
}

/**
 * Calculate end date based on start date and duration
 */
export function calculateEndDate(startAt: Date, duration: HabitDuration): Date {
  const endDate = new Date(startAt);
  
  switch (duration) {
    case '1_class':
      // For 1 class, set to end of same day
      endDate.setHours(23, 59, 59, 999);
      break;
    case '1_day':
      // 24 hours from start
      endDate.setDate(endDate.getDate() + 1);
      break;
    case '3_days':
      // 3 days from start
      endDate.setDate(endDate.getDate() + 3);
      break;
    case '1_week':
      // 7 days from start
      endDate.setDate(endDate.getDate() + 7);
      break;
  }
  
  return endDate;
}

/**
 * Get UTC date key (YYYY-MM-DD) for a given date
 */
export function getDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a date key represents today (UTC)
 */
export function isToday(dateKey: string): boolean {
  const today = getDateKey(new Date());
  return dateKey === today;
}

/**
 * Check if student can check in today
 * - For 1_class/1_day: can check in once total, anytime before endAt
 * - For 3_days/1_week: can check in once per day, must be before endAt
 */
export function canCheckIn(
  duration: HabitDuration,
  checkIns: { [dateKey: string]: Timestamp },
  endAt: Timestamp
): boolean {
  const now = new Date();
  const endDate = endAt.toDate();
  
  // Cannot check in after end date
  if (now > endDate) {
    return false;
  }
  
  const todayKey = getDateKey(now);
  
  // For single check-in durations, check if already checked in
  if (duration === '1_class' || duration === '1_day') {
    return Object.keys(checkIns).length === 0;
  }
  
  // For multi-day durations, check if already checked in today
  return !checkIns[todayKey];
}


