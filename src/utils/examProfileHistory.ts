import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { tsMs } from './productivityTracking';
import type { ExamProductivityLog } from '../types/examProductivity';

const LEGACY_EXAM_ATTEMPT_PREFIX = 'live_exam_';

export function examProductivityDocId(userId: string, sessionId: string): string {
  const safeSession = sessionId.replace(/\//g, '_').slice(0, 420);
  return `${userId}__exam__${safeSession}`.slice(0, 1400);
}

export function isLegacyExamQuizAttemptId(attemptId: string | undefined): boolean {
  return Boolean(attemptId && attemptId.startsWith(LEGACY_EXAM_ATTEMPT_PREFIX));
}

export function formatExamDurationMs(ms: number | undefined): string {
  if (ms == null || ms <= 0) return '—';
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min <= 0) return `${sec}s`;
  return `${min}m ${sec}s`;
}

function rowSortKey(row: ExamProductivityLog): number {
  return tsMs(row.completedAt) || 0;
}

function legacyQuizRowToExam(
  id: string,
  data: Record<string, unknown>
): ExamProductivityLog | null {
  const attemptId = typeof data.attemptId === 'string' ? data.attemptId : '';
  if (!isLegacyExamQuizAttemptId(attemptId)) return null;
  const userId = typeof data.userId === 'string' ? data.userId : '';
  if (!userId) return null;
  const sessionId = attemptId.slice(LEGACY_EXAM_ATTEMPT_PREFIX.length).replace(/_[^_]+$/, '');
  return {
    id: `legacy_quiz__${id}`,
    userId,
    sessionId: sessionId || id,
    examQuizSetId: typeof data.quizId === 'string' ? data.quizId : '',
    attemptId,
    classId: typeof data.classId === 'string' ? data.classId : undefined,
    title: (typeof data.quizTopic === 'string' && data.quizTopic.trim()) || 'Live Event Exam',
    quizTopic: typeof data.quizTopic === 'string' ? data.quizTopic : undefined,
    scorePercent: Number(data.scorePercent) || 0,
    correctAnswers: Number(data.correctAnswers) || 0,
    totalQuestions: Number(data.totalQuestions) || 0,
    timeTakenMs: Number(data.timeTaken) || 0,
    completedAt: data.completedAt,
    weekId: typeof data.weekId === 'string' ? data.weekId : '',
    legacyFromQuizLog: true,
  };
}

function normalizeExamDoc(id: string, data: Record<string, unknown>): ExamProductivityLog {
  return {
    id,
    userId: String(data.userId || ''),
    sessionId: String(data.sessionId || ''),
    examQuizSetId: String(data.examQuizSetId || data.quizId || ''),
    attemptId: String(data.attemptId || ''),
    classId: typeof data.classId === 'string' ? data.classId : undefined,
    title: String(data.title || data.quizTopic || 'Exam'),
    quizTopic: typeof data.quizTopic === 'string' ? data.quizTopic : undefined,
    assessmentId: typeof data.assessmentId === 'string' ? data.assessmentId : undefined,
    assessmentTitle: typeof data.assessmentTitle === 'string' ? data.assessmentTitle : undefined,
    scorePercent: Number(data.scorePercent) || 0,
    correctAnswers: Number(data.correctAnswers) || 0,
    totalQuestions: Number(data.totalQuestions) || 0,
    timeTakenMs: Number(data.timeTakenMs ?? data.timeTaken) || 0,
    completedAt: data.completedAt,
    weekId: typeof data.weekId === 'string' ? data.weekId : '',
    legacyFromQuizLog: Boolean(data.legacyFromQuizLog),
  };
}

/** Loads exam history for profile (new exam logs + legacy quiz logs from exam mode). */
export async function loadExamHistoryForUser(
  userId: string,
  maxRows = 24
): Promise<ExamProductivityLog[]> {
  const byKey = new Map<string, ExamProductivityLog>();

  const add = (row: ExamProductivityLog) => {
    const key = row.sessionId ? `${row.userId}__${row.sessionId}` : row.id;
    const existing = byKey.get(key);
    if (!existing || rowSortKey(row) >= rowSortKey(existing)) {
      byKey.set(key, row);
    }
  };

  try {
    const examQ = query(
      collection(db, 'examProductivityLogs'),
      where('userId', '==', userId),
      orderBy('completedAt', 'desc'),
      limit(maxRows)
    );
    const examSnap = await getDocs(examQ);
    examSnap.docs.forEach((d) => add(normalizeExamDoc(d.id, d.data() as Record<string, unknown>)));
  } catch {
    const examFallback = query(
      collection(db, 'examProductivityLogs'),
      where('userId', '==', userId),
      limit(maxRows * 2)
    );
    const examSnap = await getDocs(examFallback);
    examSnap.docs.forEach((d) => add(normalizeExamDoc(d.id, d.data() as Record<string, unknown>)));
  }

  try {
    const quizQ = query(
      collection(db, 'quizProductivityLogs'),
      where('userId', '==', userId),
      limit(120)
    );
    const quizSnap = await getDocs(quizQ);
    quizSnap.docs.forEach((d) => {
      const legacy = legacyQuizRowToExam(d.id, d.data() as Record<string, unknown>);
      if (legacy) add(legacy);
    });
  } catch (e) {
    console.warn('[examProfileHistory] legacy quiz exam rows', e);
  }

  return Array.from(byKey.values())
    .sort((a, b) => rowSortKey(b) - rowSortKey(a))
    .slice(0, maxRows);
}

/** All completed exams for one live event session (`examProductivityLogs`). */
export async function loadExamHistoryForSession(
  sessionId: string,
  maxRows = 80
): Promise<ExamProductivityLog[]> {
  const sid = sessionId.trim();
  if (!sid) return [];

  const runQuery = async (withOrder: boolean) => {
    const q = withOrder
      ? query(
          collection(db, 'examProductivityLogs'),
          where('sessionId', '==', sid),
          orderBy('completedAt', 'desc'),
          limit(maxRows)
        )
      : query(
          collection(db, 'examProductivityLogs'),
          where('sessionId', '==', sid),
          limit(maxRows * 2)
        );
    const snap = await getDocs(q);
    return snap.docs.map((d) => normalizeExamDoc(d.id, d.data() as Record<string, unknown>));
  };

  try {
    const rows = await runQuery(true);
    return rows.sort((a, b) => rowSortKey(b) - rowSortKey(a));
  } catch {
    try {
      const rows = await runQuery(false);
      return rows.sort((a, b) => rowSortKey(b) - rowSortKey(a)).slice(0, maxRows);
    } catch (e) {
      console.warn('[examProfileHistory] session exams', e);
      return [];
    }
  }
}

export type ExamSessionSummary = {
  sessionId: string;
  title: string;
  classId?: string;
  completedCount: number;
  lastCompletedAt: unknown;
};

/** Recent live events that had at least one completed exam (for admin pickers). */
export async function loadRecentExamSessionsForClass(
  classId: string,
  maxSessions = 24
): Promise<ExamSessionSummary[]> {
  const cid = classId.trim();
  if (!cid) return [];

  const runQuery = async (withOrder: boolean) => {
    const q = withOrder
      ? query(
          collection(db, 'examProductivityLogs'),
          where('classId', '==', cid),
          orderBy('completedAt', 'desc'),
          limit(200)
        )
      : query(
          collection(db, 'examProductivityLogs'),
          where('classId', '==', cid),
          limit(200)
        );
    return getDocs(q);
  };

  let snap;
  try {
    snap = await runQuery(true);
  } catch {
    try {
      snap = await runQuery(false);
    } catch (e) {
      console.warn('[examProfileHistory] recent exam sessions', e);
      return [];
    }
  }

  const bySession = new Map<string, ExamSessionSummary>();
  snap.docs.forEach((d) => {
    const row = normalizeExamDoc(d.id, d.data() as Record<string, unknown>);
    if (!row.sessionId) return;
    const existing = bySession.get(row.sessionId);
    const when = rowSortKey(row);
    if (!existing) {
      bySession.set(row.sessionId, {
        sessionId: row.sessionId,
        title: row.title || row.assessmentTitle || 'Live Event Exam',
        classId: row.classId,
        completedCount: 1,
        lastCompletedAt: row.completedAt,
      });
      return;
    }
    existing.completedCount += 1;
    const prevWhen = tsMs(existing.lastCompletedAt) || 0;
    if (when >= prevWhen) {
      existing.lastCompletedAt = row.completedAt;
      if (row.title?.trim()) existing.title = row.title;
    }
  });

  return Array.from(bySession.values())
    .sort((a, b) => (tsMs(b.lastCompletedAt) || 0) - (tsMs(a.lastCompletedAt) || 0))
    .slice(0, maxSessions);
}
