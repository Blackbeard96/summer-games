/**
 * Live Event Quiz scoring (regular mode).
 * Correct: up to 100 points if answered within the first 5 seconds, then linear decay to 10 by question end.
 */

/** Full points for correct answers in this many ms after the question starts */
export const LIVE_QUIZ_FAST_ANSWER_MS = 5000;
export const LIVE_QUIZ_MAX_POINTS_PER_QUESTION = 100;
export const LIVE_QUIZ_MIN_POINTS_PER_QUESTION = 10;

/** @deprecated Use LIVE_QUIZ_MAX_POINTS_PER_QUESTION */
export const LIVE_QUIZ_BASE_POINTS = LIVE_QUIZ_MAX_POINTS_PER_QUESTION;
/** @deprecated Speed curve replaced by 5s full score + decay to min */
export const LIVE_QUIZ_SPEED_BONUS_MAX = 0;

export interface CalculateLiveQuizPointsParams {
  isCorrect: boolean;
  submittedAt: number; // ms
  questionStartedAt: number;
  questionEndsAt: number;
}

const toMs = (v: number | { toMillis?: () => number } | undefined): number => {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof (v as { toMillis?: () => number }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  return 0;
};

/**
 * Calculate points for a single live quiz answer (regular Kahoot-style mode).
 * - Incorrect: 0
 * - Correct within first 5s: 100
 * - Correct after 5s: linear drop from 100 toward 10 by question end (minimum 10)
 */
export function calculateLiveQuizPoints(params: CalculateLiveQuizPointsParams): number {
  const { isCorrect, submittedAt, questionStartedAt, questionEndsAt } = params;
  if (!isCorrect) return 0;

  const startMs = toMs(questionStartedAt);
  const endMs = toMs(questionEndsAt);
  const submittedMs = toMs(submittedAt);

  const totalMs = endMs - startMs;
  if (totalMs <= 0) return LIVE_QUIZ_MAX_POINTS_PER_QUESTION;

  const clampedSubmit = Math.min(Math.max(submittedMs, startMs), endMs);
  const elapsed = clampedSubmit - startMs;

  if (elapsed <= LIVE_QUIZ_FAST_ANSWER_MS) {
    return LIVE_QUIZ_MAX_POINTS_PER_QUESTION;
  }

  const decayWindow = totalMs - LIVE_QUIZ_FAST_ANSWER_MS;
  if (decayWindow <= 0) {
    return LIVE_QUIZ_MIN_POINTS_PER_QUESTION;
  }

  const pastFast = elapsed - LIVE_QUIZ_FAST_ANSWER_MS;
  const ratio = Math.min(1, Math.max(0, pastFast / decayWindow));
  const span = LIVE_QUIZ_MAX_POINTS_PER_QUESTION - LIVE_QUIZ_MIN_POINTS_PER_QUESTION;
  const points = LIVE_QUIZ_MAX_POINTS_PER_QUESTION - span * ratio;
  return Math.floor(Math.max(LIVE_QUIZ_MIN_POINTS_PER_QUESTION, Math.min(LIVE_QUIZ_MAX_POINTS_PER_QUESTION, points)));
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
