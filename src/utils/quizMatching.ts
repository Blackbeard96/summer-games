/**
 * Matching questions for Training Grounds CFUs (pure helpers, no Firebase).
 *
 * A matching question has 2–8 pairs. Players drag each response card onto its prompt card;
 * every correct match is worth 1 point, so a 5-pair question counts like 5 questions in scores.
 */

import type {
  MatchCardContent,
  MatchPair,
  TrainingAnswer,
  TrainingQuestion,
} from '../types/trainingGrounds';

export const MIN_MATCH_PAIRS = 2;
export const MAX_MATCH_PAIRS = 8;

/** Extra Live Event time per pair on top of the quiz's normal per-question timer. */
export const MATCHING_SECONDS_PER_PAIR = 10;

type QuestionLike = Pick<TrainingQuestion, 'questionType' | 'matchPairs'> | null | undefined;

export function isMatchingQuestion(question: QuestionLike): boolean {
  return question?.questionType === 'matching';
}

export function matchPairsOf(question: QuestionLike): MatchPair[] {
  if (!isMatchingQuestion(question) || !Array.isArray(question?.matchPairs)) return [];
  return question!.matchPairs!.filter((p) => p && typeof p.id === 'string' && p.id);
}

export function matchCardHasContent(card: MatchCardContent | null | undefined): boolean {
  return !!(card?.text && card.text.trim()) || !!(card?.imageUrl && card.imageUrl.trim());
}

/** Plain-text label for a card (lists, CSV, summaries). */
export function matchCardLabel(card: MatchCardContent | null | undefined): string {
  const text = card?.text?.trim();
  if (text) return text;
  return card?.imageUrl ? '[image]' : '—';
}

/** Score points a question is worth: 1 per matching pair, otherwise 1. */
export function questionPointsPossible(question: QuestionLike): number {
  if (isMatchingQuestion(question)) return Math.max(1, matchPairsOf(question).length);
  return 1;
}

export interface MatchingScore {
  correct: number;
  total: number;
  isCorrect: boolean;
  partialCredit: number;
}

export function scoreMatchingSelections(
  pairs: Array<Pick<MatchPair, 'id'>>,
  selections: Record<string, string> | null | undefined
): MatchingScore {
  const total = pairs.length;
  const correct = pairs.filter((p) => selections?.[p.id] === p.id).length;
  return {
    correct,
    total,
    isCorrect: total > 0 && correct === total,
    partialCredit: total > 0 ? correct / total : 0,
  };
}

/** Builds the stored answer for a matching question. */
export function buildMatchingAnswer(
  question: TrainingQuestion,
  selections: Record<string, string>,
  timeSpentMs: number
): TrainingAnswer {
  const pairs = matchPairsOf(question);
  const cleaned: Record<string, string> = {};
  for (const p of pairs) {
    const placed = selections[p.id];
    if (typeof placed === 'string' && placed) cleaned[p.id] = placed;
  }
  const score = scoreMatchingSelections(pairs, cleaned);
  return {
    questionId: question.id,
    selectedIndices: [],
    matchSelections: cleaned,
    isCorrect: score.isCorrect,
    partialCredit: score.partialCredit,
    pointsEarned: score.correct,
    pointsPossible: score.total,
    timeSpentMs,
  };
}

export function answerPointsEarned(answer: TrainingAnswer, question?: TrainingQuestion | null): number {
  if (typeof answer.pointsEarned === 'number' && Number.isFinite(answer.pointsEarned)) return answer.pointsEarned;
  if (question && isMatchingQuestion(question)) {
    return scoreMatchingSelections(matchPairsOf(question), answer.matchSelections).correct;
  }
  return typeof answer.partialCredit === 'number' ? answer.partialCredit : answer.isCorrect ? 1 : 0;
}

export function answerPointsPossible(answer: TrainingAnswer, question?: TrainingQuestion | null): number {
  if (typeof answer.pointsPossible === 'number' && answer.pointsPossible > 0) return answer.pointsPossible;
  return question ? questionPointsPossible(question) : 1;
}

export interface QuizPointTotals {
  /** Includes multiple-choice partial credit (drives the percent). */
  earned: number;
  /** Fully correct multiple-choice questions + correct matches (the "X / Y" shown to players). */
  earnedWhole: number;
  possible: number;
  percent: number;
}

export function quizPointTotals(questions: TrainingQuestion[], answers: TrainingAnswer[]): QuizPointTotals {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  let earned = 0;
  let earnedWhole = 0;
  let possible = 0;
  for (const q of questions) {
    possible += questionPointsPossible(q);
    const answer = byId.get(q.id);
    if (!answer) continue;
    if (isMatchingQuestion(q)) {
      const pts = answerPointsEarned(answer, q);
      earned += pts;
      earnedWhole += pts;
    } else {
      earned += typeof answer.partialCredit === 'number' ? answer.partialCredit : answer.isCorrect ? 1 : 0;
      earnedWhole += answer.isCorrect ? 1 : 0;
    }
  }
  return {
    earned,
    earnedWhole,
    possible,
    percent: possible > 0 ? Math.round((earned / possible) * 100) : 0,
  };
}

/** Live Event per-question result row (matching rows carry match counts; older rows don't). */
export interface LiveResultRowLike {
  isCorrect: boolean;
  correctMatches?: number;
  totalMatches?: number;
}

export function liveRowPointsEarned(row: LiveResultRowLike): number {
  if (typeof row.totalMatches === 'number' && row.totalMatches > 0) return Math.max(0, row.correctMatches ?? 0);
  return row.isCorrect ? 1 : 0;
}

export function liveRowPointsPossible(row: LiveResultRowLike): number {
  if (typeof row.totalMatches === 'number' && row.totalMatches > 0) return row.totalMatches;
  return 1;
}

export function liveRowPartialCredit(row: LiveResultRowLike): number {
  return liveRowPointsEarned(row) / liveRowPointsPossible(row);
}

/** Points available across a question order (unknown ids count as 1). */
export function pointsPossibleForOrder(
  questionOrder: string[] | null | undefined,
  questionsById: Map<string, TrainingQuestion>
): number {
  return (questionOrder || []).reduce((sum, id) => sum + questionPointsPossible(questionsById.get(id)), 0);
}

/**
 * "X out of Y correct" for a saved attempt. The percent gives partial credit on multi-answer
 * questions but X only counts fully correct answers, so say so when the two disagree.
 */
export function attemptScoreLine(attempt: { scoreCorrect: number; scoreTotal: number; percent: number }): string {
  const correct = Number(attempt.scoreCorrect) || 0;
  const total = Number(attempt.scoreTotal) || 0;
  const base = `${correct} out of ${total} correct`;
  const creditFromPercent = ((Number(attempt.percent) || 0) / 100) * total;
  return total > 0 && creditFromPercent - correct >= 0.25 ? `${base} + partial credit` : base;
}

export function isLiveEventAttempt(attempt: { mode?: string; liveEventSourceSessionId?: string | null }): boolean {
  return attempt.mode === 'live' || !!attempt.liveEventSourceSessionId;
}

export interface LiveSessionServedLike {
  questionOrder?: string[] | null;
  quizRoundIndex?: number | null;
  perQuestionResults?: Record<string, Array<LiveResultRowLike & { questionId: string; quizRoundIndex?: number }>> | null;
}

/**
 * Points available across every question actually served in a Live Event quiz, the same for every
 * player, so unanswered questions count as missed. Battle Royale auto-repeat can serve more rounds
 * than the quiz has questions. The final round only counts if it was scored: ending a quiz early
 * skips scoring the question that was live.
 */
export function liveSessionServedPointsPossible(
  session: LiveSessionServedLike,
  questionsById: Map<string, TrainingQuestion>
): number {
  const order = session.questionOrder || [];
  const questionByRound = new Map<number, string>();
  let maxScoredRound = 0;
  for (const rows of Object.values(session.perQuestionResults || {})) {
    for (const row of rows || []) {
      const round = Number(row.quizRoundIndex);
      if (!Number.isFinite(round) || round <= 0) continue;
      if (!questionByRound.has(round)) questionByRound.set(round, row.questionId);
      maxScoredRound = Math.max(maxScoredRound, round);
    }
  }

  const lastRound = Math.max(0, Math.floor(Number(session.quizRoundIndex) || 0));
  if (lastRound === 0) return pointsPossibleForOrder(order, questionsById);

  const servedRounds = maxScoredRound >= lastRound ? lastRound : Math.max(maxScoredRound, lastRound - 1);
  const reshuffled = lastRound > order.length;
  let total = 0;
  for (let round = 1; round <= servedRounds; round++) {
    const id = questionByRound.get(round) ?? (reshuffled ? undefined : order[round - 1]);
    total += questionPointsPossible(id ? questionsById.get(id) : undefined);
  }
  return total;
}

/**
 * Live Event timer for one question. A per-question override wins; matching questions otherwise get
 * the quiz timer plus 10s per pair, and never less than double the quiz timer.
 */
export function liveQuestionTimeLimitSeconds(
  question: (QuestionLike & { timeLimitSeconds?: number | null }) | null | undefined,
  baseSeconds: number
): number {
  const base = Number.isFinite(baseSeconds) && baseSeconds > 0 ? baseSeconds : 20;
  const override = Number(question?.timeLimitSeconds);
  if (Number.isFinite(override) && override > 0) return Math.round(override);
  if (isMatchingQuestion(question)) {
    const pairs = matchPairsOf(question).length;
    return Math.max(base * 2, base + MATCHING_SECONDS_PER_PAIR * pairs);
  }
  return base;
}

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Response-card order for display: shuffled, stable for the same seed (so re-renders and
 * reconnects keep the layout), and never identical to the prompt order when there are 2+ pairs.
 */
export function shuffledResponseIds(pairs: Array<Pick<MatchPair, 'id'>>, seed: string): string[] {
  const ids = pairs.map((p) => p.id);
  let state = hashString(seed) || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && out.every((id, i) => id === ids[i])) {
    out.push(out.shift()!);
  }
  return out;
}

export function newMatchPairId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
