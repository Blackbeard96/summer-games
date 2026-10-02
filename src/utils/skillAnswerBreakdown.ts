/**
 * Skill Analytics drill-down: every answer a class gave on questions tagged with one skill.
 * Built from skillEvidence (one row per answer per skill); solo answers are joined to their
 * trainingAttempts doc to show the exact choice. Live Event answers only keep right/wrong.
 */

import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { SkillEvidenceMode } from '../types/academicSkills';
import type { TrainingAnswer, TrainingQuestion } from '../types/trainingGrounds';
import {
  answerPointsEarned,
  isMatchingQuestion,
  matchCardLabel,
  matchPairsOf,
  questionPointsPossible,
} from './quizMatching';

export interface SkillAnswerRow {
  evidenceId: string;
  userId: string;
  playerName: string;
  attemptId: string;
  attemptNumber: number;
  mode: SkillEvidenceMode;
  correct: boolean;
  partialCredit: number;
  timestampMs: number;
  responseTimeMs: number;
  /** The saved answer for this question in that attempt (solo CFUs only). */
  answer: TrainingAnswer | null;
}

export interface SkillQuestionBreakdown {
  key: string;
  cfuId: string;
  cfuTitle: string;
  questionId: string;
  question: TrainingQuestion | null;
  rows: SkillAnswerRow[];
  players: number;
  correctCount: number;
  averageCredit: number;
}

export interface SkillPlayerSummary {
  userId: string;
  playerName: string;
  answered: number;
  questions: number;
  correct: number;
  averageCredit: number;
  lastAnsweredMs: number;
}

export interface SkillAnswerBreakdown {
  questions: SkillQuestionBreakdown[];
  players: SkillPlayerSummary[];
}

export type AnswerOutcome = 'correct' | 'partial' | 'incorrect';

export function answerOutcome(row: Pick<SkillAnswerRow, 'correct' | 'partialCredit'>): AnswerOutcome {
  if (row.correct) return 'correct';
  return row.partialCredit > 0 ? 'partial' : 'incorrect';
}

function letter(idx: number): string {
  return String.fromCharCode(65 + idx);
}

function correctIndicesOf(question: TrainingQuestion): number[] {
  return question.correctIndices ?? (question.correctIndex !== undefined ? [question.correctIndex] : []);
}

/** Short label for the question's correct answer. */
export function describeCorrectAnswer(question: TrainingQuestion | null): string {
  if (!question) return '—';
  if (isMatchingQuestion(question)) {
    return matchPairsOf(question)
      .map((p) => `${matchCardLabel(p.prompt)} → ${matchCardLabel(p.response)}`)
      .join(' · ');
  }
  const idxs = correctIndicesOf(question);
  if (idxs.length === 0) return '—';
  return idxs.map((i) => `${letter(i)}: ${question.options?.[i] ?? '—'}`).join(', ');
}

export interface DescribedAnswer {
  summary: string;
  /** Matching only: one line per prompt with what the player placed. */
  details?: Array<{ prompt: string; placed: string; correct: boolean }>;
}

/** What the player chose, in words. */
export function describePlayerAnswer(
  question: TrainingQuestion | null,
  row: Pick<SkillAnswerRow, 'answer' | 'mode'>
): DescribedAnswer {
  const answer = row.answer;
  if (!answer) {
    return {
      summary: row.mode === 'live-event' ? 'Live Event (choice not saved)' : 'Answer not available',
    };
  }
  if (question && isMatchingQuestion(question)) {
    const pairs = matchPairsOf(question);
    const byId = new Map(pairs.map((p) => [p.id, p]));
    const selections = answer.matchSelections || {};
    return {
      summary: `${answerPointsEarned(answer, question)} of ${questionPointsPossible(question)} matches`,
      details: pairs.map((p) => {
        const placedId = selections[p.id];
        return {
          prompt: matchCardLabel(p.prompt),
          placed: placedId ? matchCardLabel(byId.get(placedId)?.response) : 'No match',
          correct: placedId === p.id,
        };
      }),
    };
  }
  const selected =
    answer.selectedIndices && answer.selectedIndices.length > 0
      ? answer.selectedIndices
      : answer.selectedIndex !== undefined
        ? [answer.selectedIndex]
        : [];
  if (selected.length === 0) {
    return { summary: row.mode === 'live-event' ? 'Live Event (choice not saved)' : 'No answer' };
  }
  return {
    summary: selected
      .map((i) => `${letter(i)}: ${question?.options?.[i] ?? '(removed option)'}`)
      .join(', '),
  };
}

function anyToMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  const v = value as { toMillis?: () => number; seconds?: number };
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  const n = new Date(value as string).getTime();
  return Number.isFinite(n) ? n : 0;
}

/** Group evidence rows into per-question and per-player summaries (pure). */
export function buildSkillAnswerBreakdown(
  rows: Array<SkillAnswerRow & { cfuId: string; questionId: string }>,
  questionLookup: (cfuId: string, questionId: string) => TrainingQuestion | null,
  cfuTitleLookup: (cfuId: string) => string
): SkillAnswerBreakdown {
  const byQuestion = new Map<string, SkillQuestionBreakdown>();
  const byPlayer = new Map<string, SkillPlayerSummary & { questionKeys: Set<string>; creditSum: number }>();

  for (const row of rows) {
    const key = `${row.cfuId}/${row.questionId}`;
    if (!byQuestion.has(key)) {
      byQuestion.set(key, {
        key,
        cfuId: row.cfuId,
        cfuTitle: cfuTitleLookup(row.cfuId),
        questionId: row.questionId,
        question: questionLookup(row.cfuId, row.questionId),
        rows: [],
        players: 0,
        correctCount: 0,
        averageCredit: 0,
      });
    }
    byQuestion.get(key)!.rows.push(row);

    if (!byPlayer.has(row.userId)) {
      byPlayer.set(row.userId, {
        userId: row.userId,
        playerName: row.playerName,
        answered: 0,
        questions: 0,
        correct: 0,
        averageCredit: 0,
        lastAnsweredMs: 0,
        questionKeys: new Set(),
        creditSum: 0,
      });
    }
    const p = byPlayer.get(row.userId)!;
    p.answered += 1;
    p.questionKeys.add(key);
    if (row.correct) p.correct += 1;
    p.creditSum += row.partialCredit;
    p.lastAnsweredMs = Math.max(p.lastAnsweredMs, row.timestampMs);
  }

  const questions = Array.from(byQuestion.values()).map((q) => {
    const sorted = [...q.rows].sort(
      (a, b) => a.playerName.localeCompare(b.playerName) || a.timestampMs - b.timestampMs
    );
    const credit = sorted.reduce((s, r) => s + r.partialCredit, 0);
    return {
      ...q,
      rows: sorted,
      players: new Set(sorted.map((r) => r.userId)).size,
      correctCount: sorted.filter((r) => r.correct).length,
      averageCredit: sorted.length ? credit / sorted.length : 0,
    };
  });
  questions.sort(
    (a, b) =>
      a.cfuTitle.localeCompare(b.cfuTitle) ||
      (a.question?.order ?? 0) - (b.question?.order ?? 0) ||
      a.questionId.localeCompare(b.questionId)
  );

  const players = Array.from(byPlayer.values())
    .map(({ questionKeys, creditSum, ...p }) => ({
      ...p,
      questions: questionKeys.size,
      averageCredit: p.answered ? creditSum / p.answered : 0,
    }))
    .sort((a, b) => a.playerName.localeCompare(b.playerName));

  return { questions, players };
}

async function inChunks<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

async function loadPlayerNames(userIds: string[]): Promise<Map<string, string>> {
  const entries = await inChunks(userIds, 20, async (uid) => {
    for (const col of ['users', 'students']) {
      try {
        const snap = await getDoc(doc(db, col, uid));
        const data = snap.exists() ? snap.data() : null;
        const name = data?.displayName || data?.name || data?.email;
        if (typeof name === 'string' && name.trim()) return [uid, name.trim()] as const;
      } catch {
        /* try the next collection */
      }
    }
    return [uid, uid.slice(0, 8)] as const;
  });
  return new Map(entries);
}

export async function getSkillAnswerBreakdown(params: {
  skillId: string;
  classStudentIds: string[];
}): Promise<SkillAnswerBreakdown> {
  const classSet = new Set(params.classStudentIds);
  const evidenceSnap = await getDocs(
    query(collection(db, 'skillEvidence'), where('skillId', '==', params.skillId))
  );
  const evidence = evidenceSnap.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .filter(
      ({ data }) =>
        classSet.has(data.userId) && typeof data.cfuId === 'string' && typeof data.questionId === 'string'
    );
  if (evidence.length === 0) return { questions: [], players: [] };

  const cfuIds = Array.from(new Set(evidence.map((e) => e.data.cfuId as string)));
  const userIds = Array.from(new Set(evidence.map((e) => e.data.userId as string)));
  const soloAttemptIds = Array.from(
    new Set(
      evidence
        .filter((e) => e.data.mode !== 'live-event' && typeof e.data.attemptId === 'string')
        .map((e) => e.data.attemptId as string)
    )
  );

  const [cfuData, names, attempts] = await Promise.all([
    inChunks(cfuIds, 10, async (cfuId) => {
      const [setSnap, qSnap] = await Promise.all([
        getDoc(doc(db, 'trainingQuizSets', cfuId)).catch(() => null),
        getDocs(collection(db, 'trainingQuizSets', cfuId, 'questions')).catch(() => null),
      ]);
      const questions = new Map<string, TrainingQuestion>();
      qSnap?.docs.forEach((d) => questions.set(d.id, { id: d.id, ...d.data() } as TrainingQuestion));
      const title = setSnap?.exists() ? (setSnap.data().title as string) || cfuId : 'Deleted CFU';
      return [cfuId, { title, questions }] as const;
    }),
    loadPlayerNames(userIds),
    inChunks(soloAttemptIds, 20, async (attemptId) => {
      try {
        const snap = await getDoc(doc(db, 'trainingAttempts', attemptId));
        const answers = snap.exists() && Array.isArray(snap.data().answers) ? snap.data().answers : [];
        return [attemptId, answers as TrainingAnswer[]] as const;
      } catch {
        return [attemptId, [] as TrainingAnswer[]] as const;
      }
    }),
  ]);
  const cfuById = new Map(cfuData);
  const answersByAttempt = new Map(attempts);

  const rows = evidence.map(({ id, data }) => {
    const attemptId = typeof data.attemptId === 'string' ? data.attemptId : '';
    const answer =
      answersByAttempt.get(attemptId)?.find((a) => a?.questionId === data.questionId) ?? null;
    return {
      evidenceId: id,
      userId: data.userId as string,
      playerName: names.get(data.userId) || (data.userId as string).slice(0, 8),
      cfuId: data.cfuId as string,
      questionId: data.questionId as string,
      attemptId,
      attemptNumber: Number(data.attemptNumber) || 1,
      mode: (data.mode as SkillEvidenceMode) || 'training-grounds',
      correct: !!data.correct,
      partialCredit:
        typeof data.partialCredit === 'number' ? data.partialCredit : data.correct ? 1 : 0,
      timestampMs: Number(data.createdAtMs) || anyToMillis(data.timestamp),
      responseTimeMs: Number(data.responseTimeMs) || 0,
      answer,
    };
  });

  return buildSkillAnswerBreakdown(
    rows,
    (cfuId, questionId) => cfuById.get(cfuId)?.questions.get(questionId) ?? null,
    (cfuId) => cfuById.get(cfuId)?.title ?? 'Deleted CFU'
  );
}
