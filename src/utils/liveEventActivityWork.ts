import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { LiveEventActivityWork } from '../types/inSessionStats';
import { getQuizSet } from './trainingGroundsService';

/**
 * Work students did inside a Live Event: Exam Mode submissions and completed live quizzes.
 * Reads staff/host-only collections, so call from the host's client.
 */
export async function loadLiveEventActivityWork(
  sessionId: string,
  rosterIds: string[]
): Promise<LiveEventActivityWork[]> {
  const roster = new Set(rosterIds);
  const exams = new Map<string, { title: string; done: Set<string> }>();
  const quizzes = new Map<string, Set<string>>();

  const examEntry = (quizSetId: string) => {
    const cur = exams.get(quizSetId) || { title: '', done: new Set<string>() };
    exams.set(quizSetId, cur);
    return cur;
  };

  const [progressSnap, examLogSnap, attemptSnap] = await Promise.all([
    getDocs(collection(db, 'inSessionRooms', sessionId, 'examProgress')).catch((e) => {
      console.warn('[liveEventActivityWork] examProgress', e);
      return null;
    }),
    getDocs(
      query(collection(db, 'examProductivityLogs'), where('sessionId', '==', sessionId), limit(300))
    ).catch((e) => {
      console.warn('[liveEventActivityWork] exam logs', e);
      return null;
    }),
    getDocs(
      query(collection(db, 'trainingAttempts'), where('liveEventSourceSessionId', '==', sessionId), limit(500))
    ).catch((e) => {
      console.warn('[liveEventActivityWork] live quiz attempts', e);
      return null;
    }),
  ]);

  progressSnap?.docs.forEach((d) => {
    const data = d.data() as { examQuizSetId?: string; completed?: boolean; playerId?: string };
    const quizSetId = data.examQuizSetId || '';
    if (!quizSetId) return;
    const entry = examEntry(quizSetId);
    const uid = data.playerId || d.id;
    if (data.completed && roster.has(uid)) entry.done.add(uid);
  });

  examLogSnap?.docs.forEach((d) => {
    const data = d.data() as { examQuizSetId?: string; quizId?: string; userId?: string; title?: string };
    const quizSetId = data.examQuizSetId || data.quizId || '';
    if (!quizSetId) return;
    const entry = examEntry(quizSetId);
    if (!entry.title && data.title) entry.title = data.title;
    if (data.userId && roster.has(data.userId)) entry.done.add(data.userId);
  });

  attemptSnap?.docs.forEach((d) => {
    const data = d.data() as { quizSetId?: string; userId?: string };
    if (!data.quizSetId || !data.userId || !roster.has(data.userId)) return;
    const set = quizzes.get(data.quizSetId) || new Set<string>();
    set.add(data.userId);
    quizzes.set(data.quizSetId, set);
  });

  const titleFor = async (quizSetId: string, fallback: string) => {
    try {
      return (await getQuizSet(quizSetId))?.title || fallback;
    } catch {
      return fallback;
    }
  };

  const activities: LiveEventActivityWork[] = [];
  for (const [quizSetId, entry] of Array.from(exams.entries())) {
    activities.push({
      id: `exam:${quizSetId}`,
      kind: 'exam',
      title: entry.title || (await titleFor(quizSetId, 'Exam')),
      completedPlayerIds: Array.from(entry.done),
    });
  }
  for (const [quizSetId, done] of Array.from(quizzes.entries())) {
    activities.push({
      id: `quiz:${quizSetId}`,
      kind: 'quiz',
      title: await titleFor(quizSetId, 'Live quiz'),
      completedPlayerIds: Array.from(done),
    });
  }
  return activities;
}
