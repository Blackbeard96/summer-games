/**
 * Re-scoring saved Training Grounds answers after a question's answer key changes (pure helpers,
 * no Firebase). Grading matches QuizPlayer: fully correct means exactly the correct choices were
 * picked; otherwise partial credit is correctPicked/correctCount − 0.25 per wrong pick (min 0).
 * Live Event answers only ever earn all-or-nothing credit.
 */

import type { TrainingAnswer, TrainingAttempt, TrainingQuestion } from '../types/trainingGrounds';
import { isMatchingQuestion } from './quizMatching';
import { calculateQuizRewards } from './trainingGroundsRewards';

export function correctIndicesOf(question: Pick<TrainingQuestion, 'correctIndices' | 'correctIndex'>): number[] {
  if (Array.isArray(question.correctIndices) && question.correctIndices.length > 0) return [...question.correctIndices];
  return typeof question.correctIndex === 'number' ? [question.correctIndex] : [];
}

export function sameIndexSet(a: number[], b: number[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && Array.from(sa).every((i) => sb.has(i));
}

export function gradeMultipleChoice(
  selected: number[],
  correct: number[],
  allOrNothing = false
): { isCorrect: boolean; partialCredit: number } {
  const correctSet = new Set(correct);
  const selectedSet = new Set(selected);
  const isCorrect =
    correct.length > 0 &&
    correct.every((i) => selectedSet.has(i)) &&
    selected.every((i) => correctSet.has(i)) &&
    correct.length === selected.length;
  if (isCorrect) return { isCorrect, partialCredit: 1 };
  if (allOrNothing || correct.length === 0) return { isCorrect, partialCredit: 0 };
  const picked = selected.filter((i) => correctSet.has(i)).length;
  const wrong = selected.filter((i) => !correctSet.has(i)).length;
  return { isCorrect, partialCredit: Math.max(0, picked / correct.length - wrong * 0.25) };
}

/**
 * Maps old option positions to new ones so a student keeps the choice they actually saw.
 * Returns null when positions are unchanged. Reordered or removed options are matched by text;
 * same-length edits are treated as in-place wording fixes. Unmatched old options map to null.
 */
export function buildOptionRemap(oldOptions: string[] | null | undefined, newOptions: string[]): Array<number | null> | null {
  const before = (oldOptions || []).map((o) => String(o ?? '').trim());
  const after = newOptions.map((o) => String(o ?? '').trim());
  if (before.length === 0) return null;
  if (before.length === after.length && before.every((t, i) => t === after[i])) return null;

  const sortedBefore = [...before].sort();
  const sortedAfter = [...after].sort();
  const isPermutation =
    before.length === after.length && sortedBefore.every((t, i) => t === sortedAfter[i]);
  if (!isPermutation && before.length === after.length) return null;

  const used = new Set<number>();
  return before.map((text) => {
    const idx = after.findIndex((t, i) => !used.has(i) && t === text);
    if (idx < 0) return null;
    used.add(idx);
    return idx;
  });
}

export function answerSelectedIndices(answer: Pick<TrainingAnswer, 'selectedIndices' | 'selectedIndex'>): number[] {
  if (Array.isArray(answer.selectedIndices) && answer.selectedIndices.length > 0) return [...answer.selectedIndices];
  return typeof answer.selectedIndex === 'number' ? [answer.selectedIndex] : [];
}

function answerCredit(a: Pick<TrainingAnswer, 'partialCredit' | 'isCorrect'>): number {
  return typeof a.partialCredit === 'number' ? a.partialCredit : a.isCorrect ? 1 : 0;
}

function answerEarned(a: TrainingAnswer): number {
  if (typeof a.pointsEarned === 'number' && Number.isFinite(a.pointsEarned)) return a.pointsEarned;
  return answerCredit(a);
}

function answerEarnedWhole(a: TrainingAnswer): number {
  if (typeof a.pointsEarned === 'number' && Number.isFinite(a.pointsEarned)) return a.pointsEarned;
  return a.isCorrect ? 1 : 0;
}

export function isLiveAttempt(attempt: Pick<TrainingAttempt, 'mode' | 'liveEventSourceSessionId'>): boolean {
  return attempt.mode === 'live' || !!attempt.liveEventSourceSessionId;
}

export interface AnswerChange {
  index: number;
  before: { isCorrect: boolean; partialCredit: number };
  after: { isCorrect: boolean; partialCredit: number };
}

export interface AttemptRegrade {
  answers: TrainingAnswer[];
  changes: AnswerChange[];
  /** Answers that flipped from wrong to fully correct / from correct to wrong. */
  nowCorrect: number;
  nowIncorrect: number;
  scoreCorrect: number;
  percent: number;
}

/**
 * Re-scores every answer to `questionId` in an attempt against `correctIndices`.
 * Returns null when nothing about the attempt changes.
 */
export function regradeAttempt(
  attempt: Pick<TrainingAttempt, 'answers' | 'scoreCorrect' | 'scoreTotal' | 'percent' | 'mode' | 'liveEventSourceSessionId'>,
  questionId: string,
  correctIndices: number[],
  remap: Array<number | null> | null = null
): AttemptRegrade | null {
  const answers = Array.isArray(attempt.answers) ? attempt.answers : [];
  const allOrNothing = isLiveAttempt(attempt);
  const changes: AnswerChange[] = [];
  let remapped = false;

  const next = answers.map((answer, index) => {
    if (!answer || answer.questionId !== questionId || answer.matchSelections) return answer;
    const original = answerSelectedIndices(answer);
    const selected = remap
      ? original.map((i) => remap[i]).filter((i): i is number => typeof i === 'number')
      : original;
    const graded = gradeMultipleChoice(selected, correctIndices, allOrNothing);
    const before = { isCorrect: !!answer.isCorrect, partialCredit: answerCredit(answer) };
    const selectionMoved = remap !== null && !(selected.length === original.length && selected.every((v, i) => v === original[i]));
    const gradeMoved =
      before.isCorrect !== graded.isCorrect || Math.abs(before.partialCredit - graded.partialCredit) > 1e-9;
    if (!selectionMoved && !gradeMoved) return answer;
    if (selectionMoved) remapped = true;
    if (gradeMoved) changes.push({ index, before, after: graded });

    const updated: TrainingAnswer = { ...answer, selectedIndices: selected, ...graded };
    if (answer.selectedIndex !== undefined) {
      if (selected.length > 0) updated.selectedIndex = selected[0];
      else delete updated.selectedIndex;
    }
    return updated;
  });

  if (changes.length === 0 && !remapped) return null;

  const total = Number(attempt.scoreTotal) || 0;
  const earned = next.reduce((sum, a) => sum + (a ? answerEarned(a) : 0), 0);
  const whole = next.reduce((sum, a) => sum + (a ? answerEarnedWhole(a) : 0), 0);
  const scoreCorrect = total > 0 ? Math.min(total, Math.max(0, whole)) : whole;
  const percent = total > 0 ? Math.min(100, Math.max(0, Math.round((earned / total) * 100))) : 0;

  return {
    answers: next,
    changes,
    nowCorrect: changes.filter((c) => !c.before.isCorrect && c.after.isCorrect).length,
    nowIncorrect: changes.filter((c) => c.before.isCorrect && !c.after.isCorrect).length,
    scoreCorrect,
    percent,
  };
}

/** Solo PP/XP owed (positive) or over-paid (negative) because of the regrade. Live attempts earn none. */
export function regradeRewardDelta(
  questions: TrainingQuestion[],
  beforeAnswers: TrainingAnswer[],
  afterAnswers: TrainingAnswer[]
): { pp: number; xp: number; bonuses: string[] } {
  const before = calculateQuizRewards(questions, beforeAnswers);
  const after = calculateQuizRewards(questions, afterAnswers);
  return { pp: after.ppGained - before.ppGained, xp: after.xpGained - before.xpGained, bonuses: after.bonuses };
}

/** Whether a saved edit changes how existing multiple-choice answers to this question are graded. */
export function questionEditNeedsRegrade(
  before: Pick<TrainingQuestion, 'options' | 'correctIndices' | 'correctIndex' | 'questionType'>,
  after: Pick<TrainingQuestion, 'options' | 'correctIndices' | 'correctIndex' | 'questionType'>
): boolean {
  if (isMatchingQuestion(after) || isMatchingQuestion(before)) return false;
  if (buildOptionRemap(before.options, after.options || []) !== null) return true;
  return !sameIndexSet(correctIndicesOf(before), correctIndicesOf(after));
}
