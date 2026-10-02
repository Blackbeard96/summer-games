import type { TrainingAnswer, TrainingQuestion } from '../../types/trainingGrounds';
import {
  buildMatchingAnswer,
  liveQuestionTimeLimitSeconds,
  liveRowPartialCredit,
  liveRowPointsEarned,
  liveRowPointsPossible,
  pointsPossibleForOrder,
  questionPointsPossible,
  quizPointTotals,
  scoreMatchingSelections,
  shuffledResponseIds,
} from '../quizMatching';
import { calculateQuizRewards } from '../trainingGroundsRewards';
import { computeExamScoreFromBank } from '../../types/liveEventExam';

jest.mock('../../firebase', () => ({ db: {} }));

const pairs = ['a', 'b', 'c', 'd'].map((id) => ({
  id,
  prompt: { text: `prompt ${id}` },
  response: { text: `response ${id}` },
}));

const matching: TrainingQuestion = {
  id: 'm1',
  prompt: 'Match the following',
  questionType: 'matching',
  matchPairs: pairs,
  options: [],
  correctIndices: [],
  difficulty: 'medium',
  pointsPP: 2,
  pointsXP: 3,
  order: 1,
};

const mc: TrainingQuestion = {
  id: 'q1',
  prompt: '2 + 2?',
  options: ['3', '4'],
  correctIndices: [1],
  difficulty: 'medium',
  pointsPP: 10,
  pointsXP: 10,
  order: 0,
};

describe('matching scoring', () => {
  it('awards one point per correct match', () => {
    const score = scoreMatchingSelections(pairs, { a: 'a', b: 'c', c: 'b', d: 'd' });
    expect(score).toEqual({ correct: 2, total: 4, isCorrect: false, partialCredit: 0.5 });
  });

  it('builds an answer that records selections and points', () => {
    const answer = buildMatchingAnswer(matching, { a: 'a', b: 'b', c: 'c', d: 'd', stray: 'x' }, 1200);
    expect(answer).toEqual(
      expect.objectContaining({
        isCorrect: true,
        partialCredit: 1,
        pointsEarned: 4,
        pointsPossible: 4,
        selectedIndices: [],
        matchSelections: { a: 'a', b: 'b', c: 'c', d: 'd' },
      })
    );
  });

  it('counts each pair as a question in quiz totals', () => {
    expect(questionPointsPossible(matching)).toBe(4);
    expect(questionPointsPossible(mc)).toBe(1);
    const answers: TrainingAnswer[] = [
      { questionId: 'q1', selectedIndices: [1], isCorrect: true, partialCredit: 1, timeSpentMs: 0 },
      buildMatchingAnswer(matching, { a: 'a', b: 'b', c: 'd', d: 'c' }, 0),
    ];
    expect(quizPointTotals([mc, matching], answers)).toEqual({ earned: 3, earnedWhole: 3, possible: 5, percent: 60 });
  });
});

describe('live timer', () => {
  it('gives matching questions more time than multiple choice', () => {
    expect(liveQuestionTimeLimitSeconds(mc, 20)).toBe(20);
    expect(liveQuestionTimeLimitSeconds(matching, 20)).toBe(60);
    expect(liveQuestionTimeLimitSeconds({ ...matching, matchPairs: pairs.slice(0, 2) }, 30)).toBe(60);
    expect(liveQuestionTimeLimitSeconds({ ...matching, timeLimitSeconds: 45 }, 20)).toBe(45);
  });
});

describe('live result rows', () => {
  it('counts matches as questions and keeps legacy rows at one point', () => {
    const matchRow = { isCorrect: false, correctMatches: 3, totalMatches: 4 };
    const mcRow = { isCorrect: true };
    expect(liveRowPointsEarned(matchRow)).toBe(3);
    expect(liveRowPointsPossible(matchRow)).toBe(4);
    expect(liveRowPartialCredit(matchRow)).toBe(0.75);
    expect(liveRowPointsEarned(mcRow)).toBe(1);
    expect(liveRowPointsPossible({ isCorrect: false })).toBe(1);
    const byId = new Map([
      [mc.id, mc],
      [matching.id, matching],
    ]);
    expect(pointsPossibleForOrder(['q1', 'm1', 'missing'], byId)).toBe(6);
  });
});

describe('exam scoring', () => {
  it('scores matching per pair and agrees when re-scored from id-only stubs', () => {
    const answers: TrainingAnswer[] = [
      { questionId: 'q1', selectedIndices: [1], isCorrect: true, partialCredit: 1, timeSpentMs: 0 },
      buildMatchingAnswer(matching, { a: 'a', b: 'b', c: 'd', d: 'c' }, 0),
    ];
    const real = computeExamScoreFromBank([mc, matching], answers);
    expect(real).toEqual(expect.objectContaining({ correctCount: 1, scorePercent: 60 }));
    const stubs = [{ id: 'q1' }, { id: 'm1' }] as TrainingQuestion[];
    expect(computeExamScoreFromBank(stubs, answers).scorePercent).toBe(real.scorePercent);
  });
});

describe('response shuffle', () => {
  it('is stable for a seed and never matches prompt order', () => {
    const first = shuffledResponseIds(pairs, 'seed');
    expect(shuffledResponseIds(pairs, 'seed')).toEqual(first);
    expect([...first].sort()).toEqual(['a', 'b', 'c', 'd']);
    for (const seed of ['x', 'y', 'z', 'q1', 'm1', '']) {
      expect(shuffledResponseIds(pairs, seed)).not.toEqual(['a', 'b', 'c', 'd']);
    }
  });
});

describe('calculateQuizRewards with matching', () => {
  it('scales rewards by points and pays per match', () => {
    const allRight = calculateQuizRewards(
      [matching],
      [buildMatchingAnswer(matching, { a: 'a', b: 'b', c: 'c', d: 'd' }, 0)]
    );
    const half = calculateQuizRewards(
      [matching],
      [buildMatchingAnswer(matching, { a: 'a', b: 'b', c: 'd', d: 'c' }, 0)]
    );
    expect(allRight.breakdown.basePP).toBe(8);
    expect(allRight.breakdown.baseXP).toBe(12);
    expect(half.breakdown.basePP).toBe(4);
  });
});
