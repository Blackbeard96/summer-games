import type { TrainingAnswer, TrainingQuestion } from '../../types/trainingGrounds';
import {
  answerOutcome,
  buildSkillAnswerBreakdown,
  describeCorrectAnswer,
  describePlayerAnswer,
  SkillAnswerRow,
} from '../skillAnswerBreakdown';

jest.mock('../../firebase', () => ({ db: {} }));

const mc: TrainingQuestion = {
  id: 'q1',
  prompt: 'Which is a noun?',
  options: ['run', 'dog', 'blue', 'quickly'],
  correctIndices: [1],
  difficulty: 'easy',
  pointsPP: 1,
  pointsXP: 1,
  order: 2,
};

const matching: TrainingQuestion = {
  id: 'q2',
  prompt: 'Match the pairs',
  questionType: 'matching',
  matchPairs: [
    { id: 'a', prompt: { text: 'Cat' }, response: { text: 'Meow' } },
    { id: 'b', prompt: { text: 'Dog' }, response: { text: 'Woof' } },
  ],
  options: [],
  correctIndices: [],
  difficulty: 'medium',
  pointsPP: 1,
  pointsXP: 1,
  order: 1,
};

function row(overrides: Partial<SkillAnswerRow & { cfuId: string; questionId: string }>) {
  return {
    evidenceId: 'e',
    userId: 'u1',
    playerName: 'Ava',
    attemptId: 'att1',
    attemptNumber: 1,
    mode: 'training-grounds' as const,
    correct: true,
    partialCredit: 1,
    timestampMs: 1000,
    responseTimeMs: 0,
    answer: null,
    cfuId: 'cfu1',
    questionId: 'q1',
    ...overrides,
  };
}

describe('answerOutcome', () => {
  it('distinguishes correct, partial and incorrect', () => {
    expect(answerOutcome({ correct: true, partialCredit: 1 })).toBe('correct');
    expect(answerOutcome({ correct: false, partialCredit: 0.5 })).toBe('partial');
    expect(answerOutcome({ correct: false, partialCredit: 0 })).toBe('incorrect');
  });
});

describe('describeCorrectAnswer', () => {
  it('labels multiple choice and matching answers', () => {
    expect(describeCorrectAnswer(mc)).toBe('B: dog');
    expect(describeCorrectAnswer(matching)).toBe('Cat → Meow · Dog → Woof');
    expect(describeCorrectAnswer(null)).toBe('—');
  });
});

describe('describePlayerAnswer', () => {
  it('shows the chosen option for multiple choice', () => {
    const answer = { questionId: 'q1', selectedIndices: [2], isCorrect: false } as TrainingAnswer;
    expect(describePlayerAnswer(mc, { answer, mode: 'training-grounds' }).summary).toBe('C: blue');
  });

  it('explains live answers have no saved choice', () => {
    expect(describePlayerAnswer(mc, { answer: null, mode: 'live-event' }).summary).toBe(
      'Live Event (choice not saved)'
    );
  });

  it('lists each placed match for matching questions', () => {
    const answer = {
      questionId: 'q2',
      matchSelections: { a: 'a', b: 'a' },
      isCorrect: false,
      pointsEarned: 1,
      pointsPossible: 2,
    } as unknown as TrainingAnswer;
    const described = describePlayerAnswer(matching, { answer, mode: 'training-grounds' });
    expect(described.summary).toBe('1 of 2 matches');
    expect(described.details).toEqual([
      { prompt: 'Cat', placed: 'Meow', correct: true },
      { prompt: 'Dog', placed: 'Meow', correct: false },
    ]);
  });
});

describe('buildSkillAnswerBreakdown', () => {
  it('groups answers by question and by player', () => {
    const rows = [
      row({ userId: 'u2', playerName: 'Ben', correct: false, partialCredit: 0, timestampMs: 500 }),
      row({ userId: 'u1', playerName: 'Ava' }),
      row({ userId: 'u1', playerName: 'Ava', questionId: 'q2', correct: false, partialCredit: 0.5, timestampMs: 3000 }),
      row({ userId: 'u1', playerName: 'Ava', attemptNumber: 2, timestampMs: 2000 }),
    ];
    const questions: Record<string, TrainingQuestion> = { q1: mc, q2: matching };
    const result = buildSkillAnswerBreakdown(
      rows,
      (_cfu, qid) => questions[qid] ?? null,
      () => 'Parts of Speech'
    );

    expect(result.questions.map((q) => q.questionId)).toEqual(['q2', 'q1']);
    const q1 = result.questions.find((q) => q.questionId === 'q1')!;
    expect(q1.players).toBe(2);
    expect(q1.correctCount).toBe(2);
    expect(q1.averageCredit).toBeCloseTo(2 / 3);
    expect(q1.rows.map((r) => `${r.playerName}#${r.attemptNumber}`)).toEqual(['Ava#1', 'Ava#2', 'Ben#1']);

    expect(result.players).toEqual([
      expect.objectContaining({ userId: 'u1', answered: 3, questions: 2, correct: 2, lastAnsweredMs: 3000 }),
      expect.objectContaining({ userId: 'u2', answered: 1, questions: 1, correct: 0, averageCredit: 0 }),
    ]);
    expect(result.players[0].averageCredit).toBeCloseTo(2.5 / 3);
  });
});
