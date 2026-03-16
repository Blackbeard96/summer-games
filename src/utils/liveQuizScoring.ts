/**
 * Live Event Quiz scoring (Kahoot-style).
 * Correct answer required for points; faster answers get more points.
 */

export const LIVE_QUIZ_BASE_POINTS = 100;
export const LIVE_QUIZ_SPEED_BONUS_MAX = 50;

export interface CalculateLiveQuizPointsParams {
  isCorrect: boolean;
  submittedAt: number;   // ms
  questionStartedAt: number;
  questionEndsAt: number;
}

/**
 * Calculate points for a single live quiz answer.
 * - Incorrect: 0
 * - Correct: base (100) + speed bonus (up to 50) based on remaining time
 */
export function calculateLiveQuizPoints(params: CalculateLiveQuizPointsParams): number {
  const { isCorrect, submittedAt, questionStartedAt, questionEndsAt } = params;
  if (!isCorrect) return 0;

  const totalMs = questionEndsAt - questionStartedAt;
  if (totalMs <= 0) return LIVE_QUIZ_BASE_POINTS;

  const elapsed = submittedAt - questionStartedAt;
  const remainingMs = Math.max(0, questionEndsAt - submittedAt);
  const remainingRatio = remainingMs / totalMs; // 1 = answered instantly, 0 = at deadline

  const speedBonus = Math.floor(LIVE_QUIZ_SPEED_BONUS_MAX * remainingRatio);
  return LIVE_QUIZ_BASE_POINTS + speedBonus;
}
