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

const toMs = (v: number | { toMillis?: () => number } | undefined): number => {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof (v as { toMillis?: () => number }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  return 0;
};

/** Max points per question (base + speed bonus). Cap to prevent timestamp bugs from producing huge values. */
export const LIVE_QUIZ_MAX_POINTS_PER_QUESTION = LIVE_QUIZ_BASE_POINTS + LIVE_QUIZ_SPEED_BONUS_MAX;

/**
 * Calculate points for a single live quiz answer.
 * - Incorrect: 0
 * - Correct: base (100) + speed bonus (up to 50) based on remaining time
 * - Result is capped at LIVE_QUIZ_MAX_POINTS_PER_QUESTION to avoid runaway scores from bad timestamps
 */
export function calculateLiveQuizPoints(params: CalculateLiveQuizPointsParams): number {
  const { isCorrect, submittedAt, questionStartedAt, questionEndsAt } = params;
  if (!isCorrect) return 0;

  const startMs = toMs(questionStartedAt);
  const endMs = toMs(questionEndsAt);
  const submittedMs = toMs(submittedAt);

  const totalMs = endMs - startMs;
  if (totalMs <= 0) return LIVE_QUIZ_BASE_POINTS;

  const remainingMs = Math.max(0, endMs - submittedMs);
  const remainingRatio = Math.min(1, Math.max(0, remainingMs / totalMs)); // clamp 0..1

  const speedBonus = Math.floor(LIVE_QUIZ_SPEED_BONUS_MAX * remainingRatio);
  const points = LIVE_QUIZ_BASE_POINTS + speedBonus;
  return Math.min(LIVE_QUIZ_MAX_POINTS_PER_QUESTION, Math.max(0, points));
}

/** Battle royale / team BR: 1 PP per correct + streak milestones (wrong / skip resets streak elsewhere). */
export function computeBattleRoyaleStreakRewards(prevStreak: number): {
  newStreak: number;
  ppAwarded: number;
  energyDelta: number;
  strongUnlockedNow: boolean;
} {
  const newStreak = prevStreak + 1;
  let ppAwarded = 1;
  if (newStreak > 0 && newStreak % 3 === 0) ppAwarded += 1;
  let energyDelta = 0;
  if (newStreak > 0 && newStreak % 5 === 0) energyDelta += 1;
  const strongUnlockedNow = newStreak > 0 && newStreak % 7 === 0;
  return { newStreak, ppAwarded, energyDelta, strongUnlockedNow };
}
