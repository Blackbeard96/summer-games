import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { TrainingAnswer, TrainingQuestion } from '../types/trainingGrounds';
import { getQuestions, getQuizSet, getUserAttempts } from './trainingGroundsService';
import { loadExamHistoryForUser } from './examProfileHistory';
import { attemptScoreLine, isLiveEventAttempt } from './quizMatching';
import { tsMs } from './productivityTracking';

/** One Live Event quiz or Exam Mode attempt the player can review from their Profile. */
export type LiveAssessmentReviewItem = {
  key: string;
  kind: 'quiz' | 'exam';
  title: string;
  quizSetId: string;
  sessionId: string;
  completedAtMs: number;
  scorePercent: number;
  scoreLine: string;
  answers?: TrainingAnswer[];
  /** Question order as served; exams fall back to the bank order when missing. */
  questionIds?: string[];
};

export type LiveAssessmentReviewDetail = {
  questions: TrainingQuestion[];
  answers: TrainingAnswer[];
  /** False for attempts taken before the player's selections were stored. */
  responsesSaved: boolean;
};

function hasSavedResponse(a: TrainingAnswer): boolean {
  return (Array.isArray(a.selectedIndices) && a.selectedIndices.length > 0) || a.matchSelections != null;
}

export async function loadRecentLiveAssessments(
  userId: string,
  max = 3
): Promise<LiveAssessmentReviewItem[]> {
  const [attempts, exams] = await Promise.all([
    getUserAttempts(userId).catch((e) => {
      console.warn('[liveAssessmentReview] attempts', e);
      return [];
    }),
    loadExamHistoryForUser(userId, max + 3).catch((e) => {
      console.warn('[liveAssessmentReview] exams', e);
      return [];
    }),
  ]);

  const quizItems: LiveAssessmentReviewItem[] = attempts
    .filter((a) => isLiveEventAttempt(a) && a.completedAt != null)
    .map((a) => ({
      key: `quiz:${a.id}`,
      kind: 'quiz' as const,
      title: 'Live Event Quiz',
      quizSetId: a.quizSetId,
      sessionId: a.liveEventSourceSessionId || '',
      completedAtMs: tsMs(a.completedAt) || tsMs(a.startedAt) || 0,
      scorePercent: Number(a.percent) || 0,
      scoreLine: attemptScoreLine(a),
      answers: Array.isArray(a.answers) ? a.answers : [],
      questionIds: Array.isArray(a.answers) ? a.answers.map((x) => x.questionId) : [],
    }));

  const examItems: LiveAssessmentReviewItem[] = exams
    .filter((e) => e.examQuizSetId)
    .map((e) => ({
      key: `exam:${e.id}`,
      kind: 'exam' as const,
      title: e.assessmentTitle || e.title || 'Live Event Exam',
      quizSetId: e.examQuizSetId,
      sessionId: e.sessionId,
      completedAtMs: tsMs(e.completedAt) || 0,
      scorePercent: Number(e.scorePercent) || 0,
      scoreLine: `${e.correctAnswers} out of ${e.totalQuestions} correct`,
      answers: e.answers,
      questionIds: e.questionIds,
    }));

  const recent = [...quizItems, ...examItems]
    .sort((a, b) => b.completedAtMs - a.completedAtMs)
    .slice(0, max);

  await Promise.all(
    recent
      .filter((item) => item.kind === 'quiz')
      .map(async (item) => {
        const set = await getQuizSet(item.quizSetId).catch(() => null);
        if (set?.title) item.title = set.title;
      })
  );

  return recent;
}

export async function loadLiveAssessmentDetail(
  item: LiveAssessmentReviewItem,
  userId: string
): Promise<LiveAssessmentReviewDetail> {
  const bank = await getQuestions(item.quizSetId);
  const byId = new Map(bank.map((q) => [q.id, q]));

  let answers = item.answers;
  let questionIds = item.questionIds;
  if (item.kind === 'exam' && !answers && item.sessionId) {
    try {
      const snap = await getDoc(doc(db, 'inSessionRooms', item.sessionId, 'examProgress', userId));
      const data = snap.exists() ? snap.data() : null;
      if (
        data?.completed &&
        Array.isArray(data.answers) &&
        (!data.examQuizSetId || data.examQuizSetId === item.quizSetId)
      ) {
        answers = data.answers as TrainingAnswer[];
      }
    } catch (e) {
      console.warn('[liveAssessmentReview] exam progress fallback', e);
    }
  }
  answers = answers ?? [];

  if (!questionIds?.length) {
    questionIds = item.kind === 'exam' ? bank.map((q) => q.id) : answers.map((a) => a.questionId);
  }
  const questions = questionIds
    .map((id) => byId.get(id))
    .filter((q): q is TrainingQuestion => Boolean(q));

  return {
    questions,
    answers,
    responsesSaved: answers.length > 0 && answers.some(hasSavedResponse),
  };
}
