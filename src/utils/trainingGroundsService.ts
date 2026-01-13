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
  TrainingGroundsStats
} from '../types/trainingGrounds';

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

export async function getPublishedQuizSets(classIds?: string[]): Promise<TrainingQuizSet[]> {
  // Query only by isPublished to avoid index requirement
  // We'll sort and filter in memory
  let q = query(
    collection(db, 'trainingQuizSets'),
    where('isPublished', '==', true)
  );
  
  const snapshot = await getDocs(q);
  const quizSets: TrainingQuizSet[] = [];
  
  snapshot.forEach(doc => {
    const data = { id: doc.id, ...doc.data() } as TrainingQuizSet;
    
    // Show ALL published quiz sets to ALL players
    // Class filtering is optional - if classIds are assigned, still show to everyone
    // (Future: can add class-based filtering if needed)
    quizSets.push(data);
  });
  
  // Sort by createdAt descending (in memory, no index needed)
  quizSets.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() || a.createdAt || 0;
    const bTime = b.createdAt?.toMillis?.() || b.createdAt || 0;
    return bTime - aTime;
  });
  
  return quizSets;
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

