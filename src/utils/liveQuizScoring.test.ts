import {
  calculateLiveQuizPoints,
  LIVE_QUIZ_MAX_POINTS_PER_QUESTION,
  LIVE_QUIZ_MIN_POINTS_PER_QUESTION,
  LIVE_QUIZ_FAST_ANSWER_MS,
} from './liveQuizScoring';

describe('calculateLiveQuizPoints (regular live quiz)', () => {
  const start = 1_000_000;
  const end = start + 20_000; // 20s question

  it('returns 0 when incorrect', () => {
    expect(
      calculateLiveQuizPoints({
        isCorrect: false,
        submittedAt: start + 1000,
        questionStartedAt: start,
        questionEndsAt: end,
      })
    ).toBe(0);
  });

  it('gives max points when correct within first 5 seconds', () => {
    expect(
      calculateLiveQuizPoints({
        isCorrect: true,
        submittedAt: start + LIVE_QUIZ_FAST_ANSWER_MS,
        questionStartedAt: start,
        questionEndsAt: end,
      })
    ).toBe(LIVE_QUIZ_MAX_POINTS_PER_QUESTION);
    expect(
      calculateLiveQuizPoints({
        isCorrect: true,
        submittedAt: start + 1000,
        questionStartedAt: start,
        questionEndsAt: end,
      })
    ).toBe(LIVE_QUIZ_MAX_POINTS_PER_QUESTION);
  });

  it('gives minimum points when correct at deadline', () => {
    expect(
      calculateLiveQuizPoints({
        isCorrect: true,
        submittedAt: end,
        questionStartedAt: start,
        questionEndsAt: end,
      })
    ).toBe(LIVE_QUIZ_MIN_POINTS_PER_QUESTION);
  });

  it('decays between max and min after 5s', () => {
    const mid = start + LIVE_QUIZ_FAST_ANSWER_MS + (end - start - LIVE_QUIZ_FAST_ANSWER_MS) / 2;
    const pts = calculateLiveQuizPoints({
      isCorrect: true,
      submittedAt: mid,
      questionStartedAt: start,
      questionEndsAt: end,
    });
    expect(pts).toBeGreaterThan(LIVE_QUIZ_MIN_POINTS_PER_QUESTION);
    expect(pts).toBeLessThan(LIVE_QUIZ_MAX_POINTS_PER_QUESTION);
  });
});
