/**
 * Training Grounds Service
 * Handles Firestore operations for quiz sets, questions, and attempts
 */

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  increment,
  runTransaction
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';
import { 
  TrainingQuizSet, 
  TrainingQuestion, 
  TrainingAttempt,
  TrainingGroundsStats,
  TrainingAnswer,
} from '../types/trainingGrounds';
import type { LiveQuizSession } from '../types/liveQuiz';

// ============================================================================
// Quiz Sets
// ============================================================================

export async function createQuizSet(data: Omit<TrainingQuizSet, 'id' | 'createdAt' | 'updatedAt' | 'questionCount'>): Promise<string> {
  const quizSetRef = await addDoc(collection(db, 'trainingQuizSets'), {
    ...data,
    questionCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return quizSetRef.id;
}

export async function getQuizSet(quizSetId: string): Promise<TrainingQuizSet | null> {
  const quizSetDoc = await getDoc(doc(db, 'trainingQuizSets', quizSetId));
  if (!quizSetDoc.exists()) return null;
  return { id: quizSetDoc.id, ...quizSetDoc.data() } as TrainingQuizSet;
}

/** Non-empty class IDs assigned to a quiz set (for visibility + admin sorting). */
export function assignedClassIdsForQuiz(quiz: TrainingQuizSet): string[] {
  if (!quiz.classIds || !Array.isArray(quiz.classIds)) return [];
  const seen = new Set<string>();
  for (const id of quiz.classIds) {
    if (typeof id === 'string' && id.trim()) seen.add(id.trim());
  }
  return Array.from(seen);
}

/**
 * Player Training Grounds: show only if the quiz is assigned to at least one class
 * and the student is enrolled in one of those classes.
 */
export function isTrainingQuizVisibleToStudentClasses(
  quiz: TrainingQuizSet,
  studentClassIds: string[]
): boolean {
  const assigned = assignedClassIdsForQuiz(quiz);
  if (assigned.length === 0) return false;
  if (!studentClassIds.length) return false;
  return assigned.some((id) => studentClassIds.includes(id));
}

/** Solo Training Grounds attempts allowed (admin can pause without unpublishing). Default: true. */
export function isTrainingQuizAcceptingSoloCompletions(quiz: TrainingQuizSet): boolean {
  return quiz.playerCompletionsEnabled !== false;
}

function quizCreatedAtMs(quiz: TrainingQuizSet): number {
  const ts = quiz.createdAt as { toMillis?: () => number } | number | undefined;
  if (ts && typeof (ts as { toMillis?: () => number }).toMillis === 'function') {
    return (ts as { toMillis: () => number }).toMillis();
  }
  if (typeof ts === 'number') return ts;
  return 0;
}

/** Admin list: group order by assigned class names (unassigned last), then newest first within a group. */
export function sortQuizSetsForAdminByClass(
  sets: TrainingQuizSet[],
  classrooms: Array<{ id: string; name: string }>
): TrainingQuizSet[] {
  const nameForId = (id: string) => classrooms.find((c) => c.id === id)?.name?.trim() || id;
  return [...sets].sort((a, b) => {
    const aAssigned = assignedClassIdsForQuiz(a);
    const bAssigned = assignedClassIdsForQuiz(b);
    const aKey =
      aAssigned.length === 0 ? '\uFFFF__unassigned' : [...aAssigned].sort().map(nameForId).join(' | ');
    const bKey =
      bAssigned.length === 0 ? '\uFFFF__unassigned' : [...bAssigned].sort().map(nameForId).join(' | ');
    if (aKey !== bKey) return aKey.localeCompare(bKey);
    return quizCreatedAtMs(b) - quizCreatedAtMs(a);
  });
}

/**
 * Published quiz sets. Pass `studentClassIds` to restrict to quizzes assigned to those classes (Training Grounds player page).
 * Call with no arguments (or `undefined`) to list all published sets (e.g. live event host picker).
 */
export async function getPublishedQuizSets(studentClassIds?: string[]): Promise<TrainingQuizSet[]> {
  let q = query(
    collection(db, 'trainingQuizSets'),
    where('isPublished', '==', true)
  );

  const snapshot = await getDocs(q);
  const quizSets: TrainingQuizSet[] = [];

  snapshot.forEach((docSnap) => {
    quizSets.push({ id: docSnap.id, ...docSnap.data() } as TrainingQuizSet);
  });

  const restrict = studentClassIds !== undefined;
  let filtered = quizSets;
  if (restrict) {
    const ids = studentClassIds ?? [];
    filtered = quizSets.filter((quiz) => isTrainingQuizVisibleToStudentClasses(quiz, ids));
  }

  filtered.sort((a, b) => quizCreatedAtMs(b) - quizCreatedAtMs(a));

  return filtered;
}

export async function getAllQuizSets(includeUnpublished: boolean = false): Promise<TrainingQuizSet[]> {
  let q = query(
    collection(db, 'trainingQuizSets'),
    orderBy('createdAt', 'desc')
  );
  
  const snapshot = await getDocs(q);
  const quizSets: TrainingQuizSet[] = [];
  
  snapshot.forEach(doc => {
    const data = { id: doc.id, ...doc.data() } as TrainingQuizSet;
    if (includeUnpublished || data.isPublished) {
      quizSets.push(data);
    }
  });
  
  return quizSets;
}

export async function updateQuizSet(quizSetId: string, updates: Partial<TrainingQuizSet>): Promise<void> {
  await updateDoc(doc(db, 'trainingQuizSets', quizSetId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteQuizSet(quizSetId: string): Promise<void> {
  // Delete all questions first
  const questionsRef = collection(db, 'trainingQuizSets', quizSetId, 'questions');
  const questionsSnapshot = await getDocs(questionsRef);
  const deletePromises = questionsSnapshot.docs.map(qDoc => deleteDoc(qDoc.ref));
  await Promise.all(deletePromises);
  
  // Delete quiz set
  await deleteDoc(doc(db, 'trainingQuizSets', quizSetId));
}

// ============================================================================
// Questions
// ============================================================================

export async function addQuestion(quizSetId: string, question: Omit<TrainingQuestion, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const questionRef = await addDoc(collection(db, 'trainingQuizSets', quizSetId, 'questions'), {
    ...question,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  // Update question count
  await updateDoc(doc(db, 'trainingQuizSets', quizSetId), {
    questionCount: increment(1),
    updatedAt: serverTimestamp(),
  });
  
  return questionRef.id;
}

export async function getQuestions(quizSetId: string): Promise<TrainingQuestion[]> {
  const questionsRef = collection(db, 'trainingQuizSets', quizSetId, 'questions');
  const q = query(questionsRef, orderBy('order', 'asc'));
  const snapshot = await getDocs(q);
  
  const questions: TrainingQuestion[] = [];
  snapshot.forEach(doc => {
    questions.push({ id: doc.id, ...doc.data() } as TrainingQuestion);
  });
  
  return questions;
}

export async function updateQuestion(quizSetId: string, questionId: string, updates: Partial<TrainingQuestion>): Promise<void> {
  await updateDoc(doc(db, 'trainingQuizSets', quizSetId, 'questions', questionId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteQuestion(quizSetId: string, questionId: string): Promise<void> {
  await deleteDoc(doc(db, 'trainingQuizSets', quizSetId, 'questions', questionId));
  
  // Update question count
  await updateDoc(doc(db, 'trainingQuizSets', quizSetId), {
    questionCount: increment(-1),
    updatedAt: serverTimestamp(),
  });
}

export async function reorderQuestions(quizSetId: string, questionIds: string[]): Promise<void> {
  const batch = questionIds.map((questionId, index) => 
    updateDoc(doc(db, 'trainingQuizSets', quizSetId, 'questions', questionId), {
      order: index,
      updatedAt: serverTimestamp(),
    })
  );
  await Promise.all(batch);
}

// ============================================================================
// Image Upload
// ============================================================================

export async function uploadQuestionImage(quizSetId: string, questionId: string, imageFile: File): Promise<string> {
  const storageRef = ref(storage, `trainingGrounds/${quizSetId}/${questionId}.png`);
  await uploadBytes(storageRef, imageFile);
  const downloadURL = await getDownloadURL(storageRef);
  return downloadURL;
}

export async function deleteQuestionImage(quizSetId: string, questionId: string): Promise<void> {
  const storageRef = ref(storage, `trainingGrounds/${quizSetId}/${questionId}.png`);
  try {
    await deleteObject(storageRef);
  } catch (error: any) {
    // Ignore if file doesn't exist
    if (error.code !== 'storage/object-not-found') {
      throw error;
    }
  }
}

// ============================================================================
// Attempts
// ============================================================================

export async function createAttempt(attempt: Omit<TrainingAttempt, 'id'>): Promise<string> {
  const attemptRef = await addDoc(collection(db, 'trainingAttempts'), {
    ...attempt,
    createdAt: serverTimestamp(),
  });
  return attemptRef.id;
}

export async function getAttempt(attemptId: string): Promise<TrainingAttempt | null> {
  const attemptDoc = await getDoc(doc(db, 'trainingAttempts', attemptId));
  if (!attemptDoc.exists()) return null;
  return { id: attemptDoc.id, ...attemptDoc.data() } as TrainingAttempt;
}

export async function getUserAttempts(userId: string, quizSetId?: string): Promise<TrainingAttempt[]> {
  // Query without orderBy to avoid index requirement
  // We'll filter and sort in memory
  let q = query(
    collection(db, 'trainingAttempts'),
    where('userId', '==', userId)
  );
  
  if (quizSetId) {
    q = query(q, where('quizSetId', '==', quizSetId));
  }
  
  const snapshot = await getDocs(q);
  const attempts: TrainingAttempt[] = [];
  snapshot.forEach(doc => {
    attempts.push({ id: doc.id, ...doc.data() } as TrainingAttempt);
  });
  
  // Sort by startedAt descending in memory (most recent first)
  attempts.sort((a, b) => {
    const aTime = a.startedAt?.toMillis?.() || (a.startedAt ? new Date(a.startedAt).getTime() : 0);
    const bTime = b.startedAt?.toMillis?.() || (b.startedAt ? new Date(b.startedAt).getTime() : 0);
    return bTime - aTime;
  });
  
  return attempts;
}

export async function getLastAttempt(userId: string, quizSetId: string): Promise<TrainingAttempt | null> {
  const attempts = await getUserAttempts(userId, quizSetId);
  return attempts.length > 0 ? attempts[0] : null;
}

/**
 * Mission sequences: true if the player has at least one completed attempt meeting the score rule.
 * `minimumPassPercent <= 0` means any completed attempt counts.
 */
export async function userMetMissionTrainingRequirement(
  userId: string,
  quizSetId: string,
  minimumPassPercent: number
): Promise<{ met: boolean; bestPercent: number; completedCount: number }> {
  const attempts = await getUserAttempts(userId, quizSetId);
  const completed = attempts.filter(
    (a) =>
      a.completedAt != null &&
      a.mode !== 'live' &&
      !a.liveEventSourceSessionId
  );
  if (completed.length === 0) {
    return { met: false, bestPercent: 0, completedCount: 0 };
  }
  const bestPercent = Math.max(...completed.map((a) => Number(a.percent) || 0));
  if (!Number.isFinite(minimumPassPercent) || minimumPassPercent <= 0) {
    return { met: true, bestPercent, completedCount: completed.length };
  }
  const met = completed.some((a) => (Number(a.percent) || 0) >= minimumPassPercent);
  return { met, bestPercent, completedCount: completed.length };
}

/**
 * After a Live Event quiz finishes, each player calls this once so Training Grounds shows the same score/history
 * as a solo attempt. Does not grant solo PP/XP (live placement rewards are separate). Idempotent per session+quiz.
 */
export async function syncLiveEventQuizToTrainingAttempt(
  liveEventSessionId: string,
  userId: string,
  session: LiveQuizSession
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  try {
    if (session.status !== 'completed' || !session.quizId) {
      return { ok: true, skipped: true };
    }

    const quizSetId = session.quizId;
    const existing = await getUserAttempts(userId, quizSetId);
    if (existing.some((a) => a.liveEventSourceSessionId === liveEventSessionId)) {
      return { ok: true, skipped: true };
    }

    const per = (session.perQuestionResults || {}) as Record<string, { questionId: string; quizRoundIndex: number; isCorrect: boolean; pointsAwarded: number }[]>;
    const rows = per[userId] ?? [];
    const correctFromRows = rows.filter((r) => r.isCorrect).length;
    let scoreCorrect = session.correctCount?.[userId] ?? correctFromRows;

    let scoreTotal = rows.length;
    if (scoreTotal === 0 && Array.isArray(session.questionOrder) && session.questionOrder.length > 0) {
      scoreTotal = session.questionOrder.length;
    }

    const lb = session.leaderboard?.[userId] ?? 0;
    const hasParticipation =
      rows.length > 0 ||
      scoreCorrect > 0 ||
      (typeof lb === 'number' && lb > 0);
    if (!hasParticipation) {
      return { ok: true, skipped: true };
    }

    if (scoreTotal <= 0) {
      return { ok: true, skipped: true };
    }

    scoreCorrect = Math.min(scoreCorrect, scoreTotal);
    const percent = Math.min(100, Math.max(0, Math.round((scoreCorrect / scoreTotal) * 100)));

    const answers: TrainingAnswer[] = rows.map((e) => ({
      questionId: e.questionId,
      selectedIndices: [],
      isCorrect: e.isCorrect,
      partialCredit: e.isCorrect ? 1 : 0,
      timeSpentMs: 0,
    }));

    const bonuses: string[] = ['live_event'];
    if (percent >= 100) bonuses.push('perfect');

    const attemptPayload: Omit<TrainingAttempt, 'id'> = {
      userId,
      quizSetId,
      startedAt: serverTimestamp(),
      completedAt: serverTimestamp(),
      scoreCorrect,
      scoreTotal,
      percent,
      answers,
      rewards: {
        ppGained: 0,
        xpGained: 0,
        bonuses,
      },
      mode: 'live',
      liveEventSourceSessionId: liveEventSessionId,
    };

    const attemptId = await createAttempt(attemptPayload);
    const createdAttempt: TrainingAttempt = { id: attemptId, ...attemptPayload };
    await updateTrainingStats(userId, createdAttempt);
    return { ok: true };
  } catch (e) {
    console.error('syncLiveEventQuizToTrainingAttempt', e);
    return { ok: false, error: String(e) };
  }
}

/**
 * Get all attempts for a quiz set (for admin analytics)
 */
export async function getQuizSetAttempts(quizSetId: string): Promise<TrainingAttempt[]> {
  const q = query(
    collection(db, 'trainingAttempts'),
    where('quizSetId', '==', quizSetId)
  );
  
  const snapshot = await getDocs(q);
  const attempts: TrainingAttempt[] = [];
  snapshot.forEach(doc => {
    attempts.push({ id: doc.id, ...doc.data() } as TrainingAttempt);
  });
  
  // Sort by startedAt descending (most recent first)
  attempts.sort((a, b) => {
    const aTime = a.startedAt?.toMillis?.() || (a.startedAt ? new Date(a.startedAt).getTime() : 0);
    const bTime = b.startedAt?.toMillis?.() || (b.startedAt ? new Date(b.startedAt).getTime() : 0);
    return bTime - aTime;
  });
  
  return attempts;
}

// ============================================================================
// Player Stats
// ============================================================================

export async function updateTrainingStats(userId: string, attempt: TrainingAttempt): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const studentRef = doc(db, 'students', userId);
  
  // Get current stats
  const userDoc = await getDoc(userRef);
  const studentDoc = await getDoc(studentRef);
  const userData = userDoc.exists() ? userDoc.data() : {};
  const studentData = studentDoc.exists() ? studentDoc.data() : {};
  
  const currentStats: TrainingGroundsStats = userData.trainingGroundsStats || studentData.trainingGroundsStats || {
    totalAttempts: 0,
    avgScore: 0,
    bestScore: 0,
    totalPPFromTraining: 0,
    totalXPFromTraining: 0,
    streakBest: 0,
  };
  
  // Calculate new stats
  const newTotalAttempts = currentStats.totalAttempts + 1;
  const newTotalPP = currentStats.totalPPFromTraining + attempt.rewards.ppGained;
  const newTotalXP = currentStats.totalXPFromTraining + attempt.rewards.xpGained;
  
  // Calculate new average score
  const currentTotalScore = currentStats.avgScore * currentStats.totalAttempts;
  const newAvgScore = (currentTotalScore + attempt.percent) / newTotalAttempts;
  
  // Update best score
  const newBestScore = Math.max(currentStats.bestScore, attempt.percent);
  
  const updatedStats: TrainingGroundsStats = {
    totalAttempts: newTotalAttempts,
    avgScore: newAvgScore,
    bestScore: newBestScore,
    totalPPFromTraining: newTotalPP,
    totalXPFromTraining: newTotalXP,
    streakBest: currentStats.streakBest, // TODO: Calculate streak from answers
    lastAttemptAt: serverTimestamp(),
  };
  
  // Update both collections
  if (userDoc.exists()) {
    await updateDoc(userRef, { trainingGroundsStats: updatedStats });
  }
  if (studentDoc.exists()) {
    await updateDoc(studentRef, { trainingGroundsStats: updatedStats });
  }
}

export async function getTrainingStats(userId: string): Promise<TrainingGroundsStats | null> {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);
  
  if (userDoc.exists()) {
    const userData = userDoc.data();
    return userData.trainingGroundsStats || null;
  }
  
  const studentRef = doc(db, 'students', userId);
  const studentDoc = await getDoc(studentRef);
  if (studentDoc.exists()) {
    const studentData = studentDoc.data();
    return studentData.trainingGroundsStats || null;
  }
  
  return null;
}

