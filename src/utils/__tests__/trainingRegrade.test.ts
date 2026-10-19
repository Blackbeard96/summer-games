import {
  buildOptionRemap,
  gradeMultipleChoice,
  questionEditNeedsRegrade,
  regradeAttempt,
  regradeRewardDelta,
} from '../trainingRegrade';
import type { TrainingAnswer, TrainingAttempt, TrainingQuestion } from '../../types/trainingGrounds';

jest.mock('../../firebase', () => ({ db: {} }));

const mc = (id: string, correctIndices: number[], options = ['A', 'B', 'C', 'D']): TrainingQuestion => ({
  id,
  prompt: id,
  options,
  correctIndices,
  difficulty: 'medium',
  pointsPP: 10,
  pointsXP: 10,
  order: 0,
});

const answer = (questionId: string, selectedIndices: number[], isCorrect: boolean, partialCredit = isCorrect ? 1 : 0): TrainingAnswer => ({
  questionId,
  selectedIndices,
  isCorrect,
  partialCredit,
  timeSpentMs: 1000,
});

const attempt = (answers: TrainingAnswer[], extra: Partial<TrainingAttempt> = {}): TrainingAttempt => {
  const earned = answers.reduce((s, a) => s + (a.partialCredit ?? 0), 0);
  return {
    id: 'att1',
    userId: 'u1',
    quizSetId: 'quiz',
    startedAt: null,
    scoreCorrect: answers.filter((a) => a.isCorrect).length,
    scoreTotal: answers.length,
    percent: Math.round((earned / answers.length) * 100),
    answers,
    rewards: { ppGained: 0, xpGained: 0, bonuses: [] },
    mode: 'solo',
    ...extra,
  };
};

describe('gradeMultipleChoice', () => {
  it('matches QuizPlayer grading, including partial credit', () => {
    expect(gradeMultipleChoice([1], [1])).toEqual({ isCorrect: true, partialCredit: 1 });
    expect(gradeMultipleChoice([0], [1])).toEqual({ isCorrect: false, partialCredit: 0 });
    expect(gradeMultipleChoice([0], [0, 2])).toEqual({ isCorrect: false, partialCredit: 0.5 });
    expect(gradeMultipleChoice([0, 1], [0, 2])).toEqual({ isCorrect: false, partialCredit: 0.25 });
  });

  it('gives Live Event answers all-or-nothing credit', () => {
    expect(gradeMultipleChoice([0], [0, 2], true)).toEqual({ isCorrect: false, partialCredit: 0 });
  });
});

describe('regradeAttempt', () => {
  it('marks a previously-wrong pick correct and a previously-right pick wrong after a key fix', () => {
    const base = attempt([answer('q1', [1], false), answer('q2', [0], true)]);
    const studentWithB = regradeAttempt(base, 'q1', [1])!;
    expect(studentWithB.answers[0]).toMatchObject({ isCorrect: true, partialCredit: 1 });
    expect(studentWithB.nowCorrect).toBe(1);
    expect(studentWithB.scoreCorrect).toBe(2);
    expect(studentWithB.percent).toBe(100);

    const luckyBefore = attempt([answer('q1', [0], true), answer('q2', [0], true)]);
    const lucky = regradeAttempt(luckyBefore, 'q1', [1])!;
    expect(lucky.answers[0]).toMatchObject({ isCorrect: false, partialCredit: 0 });
    expect(lucky.nowIncorrect).toBe(1);
    expect(lucky.scoreCorrect).toBe(1);
    expect(lucky.percent).toBe(50);
  });

  it('returns null when the attempt already matches the key (idempotent)', () => {
    expect(regradeAttempt(attempt([answer('q1', [1], true)]), 'q1', [1])).toBeNull();
    expect(regradeAttempt(attempt([answer('q2', [1], false)]), 'q1', [1])).toBeNull();
  });

  it('keeps unanswered questions counting against the score', () => {
    const a = attempt([answer('q1', [2], false)], { scoreTotal: 4, scoreCorrect: 0, percent: 0 });
    const r = regradeAttempt(a, 'q1', [2])!;
    expect(r.scoreCorrect).toBe(1);
    expect(r.percent).toBe(25);
  });

  it('follows the option text when options were reordered', () => {
    const remap = buildOptionRemap(['A', 'B', 'C', 'D'], ['B', 'A', 'C', 'D']);
    const r = regradeAttempt(attempt([answer('q1', [1], false)]), 'q1', [0], remap)!;
    expect(r.answers[0]).toMatchObject({ selectedIndices: [0], isCorrect: true });
  });

  it('regrades legacy answers that only stored selectedIndex', () => {
    const legacy: TrainingAnswer = { questionId: 'q1', selectedIndex: 2, selectedIndices: [], isCorrect: false, partialCredit: 0, timeSpentMs: 0 };
    const r = regradeAttempt(attempt([legacy]), 'q1', [2])!;
    expect(r.answers[0]).toMatchObject({ isCorrect: true, selectedIndices: [2], selectedIndex: 2 });
  });

  it('uses all-or-nothing scoring for Live Event attempts', () => {
    const live = attempt([answer('q1', [0], false), answer('q2', [1], true)], { mode: 'live', liveEventSourceSessionId: 's1' });
    const r = regradeAttempt(live, 'q1', [0, 2])!;
    expect(r).toBeNull();
    const fixed = regradeAttempt(live, 'q1', [0])!;
    expect(fixed.scoreCorrect).toBe(2);
    expect(fixed.percent).toBe(100);
  });

  it('leaves matching answers alone', () => {
    const matching: TrainingAnswer = { ...answer('q1', [], false), matchSelections: { a: 'b' } };
    expect(regradeAttempt(attempt([matching]), 'q1', [0])).toBeNull();
  });
});

describe('buildOptionRemap', () => {
  it('is null when positions did not change (including in-place wording fixes)', () => {
    expect(buildOptionRemap(['A', 'B'], ['A', 'B'])).toBeNull();
    expect(buildOptionRemap(['Paris', 'Lodnon'], ['Paris', 'London'])).toBeNull();
  });

  it('maps by text when an option is removed', () => {
    expect(buildOptionRemap(['A', 'B', 'C'], ['A', 'C'])).toEqual([0, null, 1]);
  });
});

describe('regradeRewardDelta', () => {
  it('owes PP/XP when an answer becomes correct and claws back when it becomes wrong', () => {
    const questions = [mc('q1', [1]), mc('q2', [0])];
    const before = [answer('q1', [1], false), answer('q2', [0], true)];
    const after = [answer('q1', [1], true), answer('q2', [0], true)];
    const up = regradeRewardDelta(questions, before, after);
    expect(up.pp).toBeGreaterThan(0);
    expect(up.xp).toBeGreaterThan(0);
    const down = regradeRewardDelta(questions, after, before);
    expect(down.pp).toBe(-up.pp);
    expect(down.xp).toBe(-up.xp);
  });
});

describe('questionEditNeedsRegrade', () => {
  it('detects answer-key and option-order changes only', () => {
    expect(questionEditNeedsRegrade(mc('q', [0]), mc('q', [1]))).toBe(true);
    expect(questionEditNeedsRegrade(mc('q', [0]), mc('q', [0]))).toBe(false);
    expect(questionEditNeedsRegrade(mc('q', [0]), mc('q', [1], ['B', 'A', 'C', 'D']))).toBe(true);
    expect(questionEditNeedsRegrade({ ...mc('q', [0]), correctIndices: [], correctIndex: 0 }, mc('q', [0]))).toBe(false);
  });
});
