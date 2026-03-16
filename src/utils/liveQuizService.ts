/**
 * Live Event Quiz Mode — Firestore service.
 * Session state: inSessionRooms/{sessionId}/quizSession/current
 * Player responses: inSessionRooms/{sessionId}/quizSession/current/responses/{uid}
 */

import { db } from '../firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  increment,
  arrayUnion,
} from 'firebase/firestore';
import type { UpdateData, DocumentData } from 'firebase/firestore';
import type { LiveQuizSession, LiveQuizStatus, LiveQuizResponse, LiveQuizRewardConfig, LiveQuizPlacementReward } from '../types/liveQuiz';
import { getQuizSet, getQuestions } from './trainingGroundsService';
import { calculateLiveQuizPoints } from './liveQuizScoring';
import { trackParticipation } from './inSessionStatsService';

const DEBUG = process.env.REACT_APP_DEBUG_LIVE_QUIZ === 'true';

function log(...args: unknown[]) {
  if (DEBUG) console.log('[LiveQuiz]', ...args);
}

const QUIZ_SESSION_CURRENT = 'current';

function sessionRef(sessionId: string) {
  return doc(db, 'inSessionRooms', sessionId, 'quizSession', QUIZ_SESSION_CURRENT);
}

function responsesRef(sessionId: string) {
  return collection(db, 'inSessionRooms', sessionId, 'quizSession', QUIZ_SESSION_CURRENT, 'responses');
}

function responseDocRef(sessionId: string, uid: string) {
  return doc(db, 'inSessionRooms', sessionId, 'quizSession', QUIZ_SESSION_CURRENT, 'responses', uid);
}

/** Get current quiz session (null if none or idle). */
export async function getQuizSession(sessionId: string): Promise<LiveQuizSession | null> {
  const snap = await getDoc(sessionRef(sessionId));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data?.status === 'idle' || !data?.status) return null;
  return data as LiveQuizSession;
}

/** Subscribe to quiz session changes. */
export function subscribeQuizSession(
  sessionId: string,
  onSession: (session: LiveQuizSession | null) => void
): () => void {
  return onSnapshot(
    sessionRef(sessionId),
    (snap) => {
      if (!snap.exists()) {
        onSession(null);
        return;
      }
      const data = snap.data();
      if (data?.status === 'idle' || !data?.status) {
        onSession(null);
        return;
      }
      onSession(data as LiveQuizSession);
    },
    (err) => {
      console.error('LiveQuiz subscribe error:', err);
      onSession(null);
    }
  );
}

/** Start a quiz session (host only). Uses first N questions from the quiz. */
export async function startQuizSession(
  sessionId: string,
  hostUid: string,
  quizId: string,
  numQuestions?: number,
  timeLimitSeconds: number = 20,
  rewardConfig?: LiveQuizRewardConfig
): Promise<{ ok: boolean; error?: string }> {
  try {
    const quiz = await getQuizSet(quizId);
    if (!quiz) {
      return { ok: false, error: 'Quiz not found' };
    }
    const questions = await getQuestions(quizId);
    if (questions.length === 0) {
      return { ok: false, error: 'Quiz has no questions' };
    }
    const count = numQuestions ? Math.min(numQuestions, questions.length) : questions.length;
    const questionOrder = questions.slice(0, count).map((q) => q.id);

    const session: LiveQuizSession = {
      status: 'lobby',
      quizId,
      quizTitle: quiz.title,
      questionIndex: -1,
      questionOrder,
      currentQuestionId: null,
      questionStartedAt: null,
      questionEndsAt: null,
      timeLimitSeconds,
      hostUid,
      leaderboard: {},
      correctCount: {},
      rewardConfig: rewardConfig ?? undefined,
      updatedAt: serverTimestamp(),
    };

    await setDoc(sessionRef(sessionId), session);
    log('Quiz session created', { sessionId, quizId, questionCount: questionOrder.length, rewardConfig: !!rewardConfig });
    return { ok: true };
  } catch (e) {
    log('startQuizSession error', e);
    return { ok: false, error: String(e) };
  }
}

/** Get placement reward for a 1-based rank. first=1, second=2, third=3, top5=4-5, top10=6-10. Exported for UI to show PP earned per player. */
export function getPlacementRewardForRank(
  placements: LiveQuizRewardConfig['placements'],
  rank: number
): LiveQuizPlacementReward | null {
  let key: keyof typeof placements;
  if (rank === 1) key = 'first';
  else if (rank === 2) key = 'second';
  else if (rank === 3) key = 'third';
  else if (rank === 4 || rank === 5) key = 'top5';
  else if (rank >= 6 && rank <= 10) key = 'top10';
  else return null;
  const p = placements[key];
  if (!p) return null;
  const hasReward = (p.pp > 0 || p.xp > 0 || !!(p.artifactId || p.artifactName));
  return hasReward ? p : null;
}

/** Legacy reward config (old UI shape) for backward compatibility with existing Firestore docs. */
interface LegacyRewardConfig {
  rewardTypes: { pp: boolean; xp: boolean; artifacts: boolean };
  whoReceives: { first: boolean; second: boolean; third: boolean; top5: boolean; top10: boolean };
  ppAmount: number;
  xpAmount: number;
  artifactId?: string;
  artifactName?: string;
}

function isLegacyConfig(config: LiveQuizRewardConfig | LegacyRewardConfig | undefined): config is LegacyRewardConfig {
  return !!config && 'rewardTypes' in config && 'whoReceives' in config;
}

/** Grant PP/XP/artifacts to players based on final leaderboard and session rewardConfig. Called when quiz completes. */
export async function grantLiveQuizRewards(sessionId: string): Promise<{ granted: number; error?: string }> {
  try {
    const snap = await getDoc(sessionRef(sessionId));
    if (!snap.exists()) return { granted: 0 };
    const session = snap.data() as LiveQuizSession;
    const config = session.rewardConfig as LiveQuizRewardConfig | LegacyRewardConfig | undefined;
    if (!config) return { granted: 0 };

    const leaderboard = session.leaderboard ?? {};
    const sorted = Object.entries(leaderboard)
      .map(([uid, score]) => ({ uid, score }))
      .sort((a, b) => b.score - a.score);

    let grantedCount = 0;

    if (isLegacyConfig(config)) {
      if (!config.rewardTypes.pp && !config.rewardTypes.xp && !config.rewardTypes.artifacts) return { granted: 0 };
      const rewardRanks = new Set<number>();
      if (config.whoReceives.first) rewardRanks.add(1);
      if (config.whoReceives.second) rewardRanks.add(2);
      if (config.whoReceives.third) rewardRanks.add(3);
      if (config.whoReceives.top5) for (let i = 1; i <= 5; i++) rewardRanks.add(i);
      if (config.whoReceives.top10) for (let i = 1; i <= 10; i++) rewardRanks.add(i);
      for (let i = 0; i < sorted.length; i++) {
        const rank = i + 1;
        if (!rewardRanks.has(rank)) continue;
        const { uid } = sorted[i];
        const studentRef = doc(db, 'students', uid);
        const userRef = doc(db, 'users', uid);
        const vaultRef = doc(db, 'vaults', uid);
        let didGrant = false;
        const studentUpdates: UpdateData<DocumentData> = {};
        const userUpdates: UpdateData<DocumentData> = {};
        if (config.rewardTypes.pp && config.ppAmount > 0) {
          studentUpdates.powerPoints = increment(config.ppAmount);
          userUpdates.powerPoints = increment(config.ppAmount);
          didGrant = true;
        }
        if (config.rewardTypes.xp && config.xpAmount > 0) {
          studentUpdates.xp = increment(config.xpAmount);
          userUpdates.xp = increment(config.xpAmount);
          didGrant = true;
        }
        if (config.rewardTypes.artifacts && (config.artifactId || config.artifactName)) {
          studentUpdates.inventory = arrayUnion(config.artifactName || config.artifactId || '');
          didGrant = true;
        }
        if (Object.keys(studentUpdates).length > 0) {
          const studentDoc = await getDoc(studentRef);
          if (studentDoc.exists()) await updateDoc(studentRef, studentUpdates);
        }
        if (Object.keys(userUpdates).length > 0) {
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) await updateDoc(userRef, userUpdates);
        }
        if (config.rewardTypes.pp && config.ppAmount > 0) {
          const vaultDoc = await getDoc(vaultRef);
          if (vaultDoc.exists()) {
            const v = vaultDoc.data();
            const cur = v?.currentPP ?? 0;
            const cap = v?.capacity ?? 1000;
            await updateDoc(vaultRef, { currentPP: Math.min(cap, cur + config.ppAmount) });
          }
        }
        if (didGrant) grantedCount++;
      }
      log('Live quiz rewards granted (legacy)', { sessionId, grantedCount });
      return { granted: grantedCount };
    }

    if (!('placements' in config) || !config.placements) return { granted: 0 };
    const placements = (config as LiveQuizRewardConfig).placements;

    for (let i = 0; i < sorted.length; i++) {
      const rank = i + 1;
      const reward = getPlacementRewardForRank(placements, rank);
      if (!reward) continue;
      const { uid } = sorted[i];
      const studentRef = doc(db, 'students', uid);
      const userRef = doc(db, 'users', uid);
      const vaultRef = doc(db, 'vaults', uid);
      let didGrant = false;
      const studentUpdates: UpdateData<DocumentData> = {};
      const userUpdates: UpdateData<DocumentData> = {};
      const ppAmount = reward.pp ?? 0;
      const xpAmount = reward.xp ?? 0;
      const artifactName = reward.artifactName || reward.artifactId;
      if (ppAmount > 0) {
        studentUpdates.powerPoints = increment(ppAmount);
        userUpdates.powerPoints = increment(ppAmount);
        didGrant = true;
      }
      if (xpAmount > 0) {
        studentUpdates.xp = increment(xpAmount);
        userUpdates.xp = increment(xpAmount);
        didGrant = true;
      }
      if (artifactName) {
        studentUpdates.inventory = arrayUnion(artifactName);
        didGrant = true;
      }
      if (Object.keys(studentUpdates).length > 0) {
        const studentDoc = await getDoc(studentRef);
        if (studentDoc.exists()) await updateDoc(studentRef, studentUpdates);
      }
      if (Object.keys(userUpdates).length > 0) {
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) await updateDoc(userRef, userUpdates);
      }
      if (ppAmount > 0) {
        const vaultDoc = await getDoc(vaultRef);
        if (vaultDoc.exists()) {
          const v = vaultDoc.data();
          const cur = v?.currentPP ?? 0;
          const cap = v?.capacity ?? 1000;
          await updateDoc(vaultRef, { currentPP: Math.min(cap, cur + ppAmount) });
        }
      }
      if (didGrant) grantedCount++;
    }
    log('Live quiz rewards granted', { sessionId, grantedCount });
    return { granted: grantedCount };
  } catch (e) {
    log('grantLiveQuizRewards error', e);
    return { granted: 0, error: String(e) };
  }
}

/** Launch first question (host). */
export async function launchFirstQuestion(sessionId: string, hostUid: string): Promise<{ ok: boolean; error?: string }> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(sessionRef(sessionId));
    if (!snap.exists()) return { ok: false, error: 'No quiz session' };
    const session = snap.data() as LiveQuizSession;
    if (session.hostUid !== hostUid) return { ok: false, error: 'Only host can start' };
    if (session.questionOrder.length === 0) return { ok: false, error: 'No questions' };

    const questionId = session.questionOrder[0];
    const now = Date.now();
    const endsAt = now + session.timeLimitSeconds * 1000;

    tx.update(sessionRef(sessionId), {
      status: 'question_live',
      questionIndex: 0,
      currentQuestionId: questionId,
      questionStartedAt: now,
      questionEndsAt: endsAt,
      updatedAt: serverTimestamp(),
    });
    log('First question launched', { sessionId, questionId });
    return { ok: true };
  });
}

/** Advance to next question or finish (host). Aggregates points from current question responses into leaderboard. */
export async function advanceQuiz(
  sessionId: string,
  hostUid: string
): Promise<{ ok: boolean; error?: string; completed?: boolean }> {
  // Firestore transactions only allow tx.get(DocumentReference), not Query. Fetch responses outside the transaction.
  const responsesSnap = await getDocs(responsesRef(sessionId));
  const responsesForCurrentQuestion: { uid: string; data: LiveQuizResponse }[] = [];
  responsesSnap.docs.forEach((d) => {
    const r = d.data() as LiveQuizResponse;
    responsesForCurrentQuestion.push({ uid: d.id, data: r });
  });

  return runTransaction(db, async (tx) => {
    const sessionSnap = await tx.get(sessionRef(sessionId));
    if (!sessionSnap.exists()) return { ok: false, error: 'No quiz session' };
    const session = sessionSnap.data() as LiveQuizSession;
    if (session.hostUid !== hostUid) return { ok: false, error: 'Only host can advance' };

    const currentQId = session.currentQuestionId;
    const newLeaderboard = { ...session.leaderboard };
    const newCorrectCount = { ...(session.correctCount || {}) };

    if (currentQId) {
      responsesForCurrentQuestion.forEach(({ uid, data: r }) => {
        if (r.currentQuestionId === currentQId) {
          newLeaderboard[uid] = (newLeaderboard[uid] || 0) + r.pointsAwarded;
          if (r.isCorrect) newCorrectCount[uid] = (newCorrectCount[uid] || 0) + 1;
        }
      });
    }

    const nextIndex = session.questionIndex + 1;
    if (nextIndex >= session.questionOrder.length) {
      tx.update(sessionRef(sessionId), {
        status: 'completed',
        questionIndex: nextIndex - 1,
        currentQuestionId: null,
        questionStartedAt: null,
        questionEndsAt: null,
        leaderboard: newLeaderboard,
        correctCount: newCorrectCount,
        updatedAt: serverTimestamp(),
      });
      log('Quiz completed', { sessionId });
      return { ok: true, completed: true };
    }

    const nextQuestionId = session.questionOrder[nextIndex];
    const now = Date.now();
    const endsAt = now + session.timeLimitSeconds * 1000;

    tx.update(sessionRef(sessionId), {
      status: 'question_live',
      questionIndex: nextIndex,
      currentQuestionId: nextQuestionId,
      questionStartedAt: now,
      questionEndsAt: endsAt,
      leaderboard: newLeaderboard,
      correctCount: newCorrectCount,
      updatedAt: serverTimestamp(),
    });
    log('Advanced to question', { sessionId, nextIndex, nextQuestionId });
    return { ok: true, completed: false };
  });
}

/** Set status to answer_reveal or leaderboard (host). */
export async function setQuizStatus(
  sessionId: string,
  hostUid: string,
  status: LiveQuizStatus
): Promise<{ ok: boolean; error?: string }> {
  try {
    const snap = await getDoc(sessionRef(sessionId));
    if (!snap.exists()) return { ok: false, error: 'No quiz session' };
    const session = snap.data() as LiveQuizSession;
    if (session.hostUid !== hostUid) return { ok: false, error: 'Only host can change status' };
    await updateDoc(sessionRef(sessionId), { status, updatedAt: serverTimestamp() });
    log('Status set', { sessionId, status });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Submit answer (player). First answer locks; late answers rejected. */
export async function submitQuizResponse(
  sessionId: string,
  uid: string,
  questionId: string,
  selectedIndices: number[],
  correctIndices: number[]
): Promise<{ ok: boolean; error?: string; pointsAwarded?: number }> {
  return runTransaction(db, async (tx) => {
    const sessionSnap = await tx.get(sessionRef(sessionId));
    if (!sessionSnap.exists()) return { ok: false, error: 'No quiz session' };
    const session = sessionSnap.data() as LiveQuizSession;
    if (session.currentQuestionId !== questionId)
      return { ok: false, error: 'Wrong question' };
    const now = Date.now();
    const endsAt = session.questionEndsAt ?? 0;
    if (now > endsAt) return { ok: false, error: 'Time expired' };

    const responseSnap = await tx.get(responseDocRef(sessionId, uid));
    if (responseSnap.exists()) {
      const existing = responseSnap.data() as LiveQuizResponse;
      if (existing.currentQuestionId === questionId) return { ok: false, error: 'Already answered' };
    }

    const correctSet = new Set(correctIndices);
    const selectedSet = new Set(selectedIndices);
    const allCorrect =
      correctIndices.length === selectedIndices.length &&
      correctIndices.every((i) => selectedSet.has(i)) &&
      selectedIndices.every((i) => correctSet.has(i));
    const startedAt = session.questionStartedAt ?? now;
    const pointsAwarded = calculateLiveQuizPoints({
      isCorrect: allCorrect,
      submittedAt: now,
      questionStartedAt: startedAt,
      questionEndsAt: endsAt,
    });

    const response: LiveQuizResponse = {
      currentQuestionId: questionId,
      selectedIndices,
      submittedAt: now,
      isCorrect: allCorrect,
      pointsAwarded,
    };
    tx.set(responseDocRef(sessionId, uid), response);
    log('Response submitted', { sessionId, uid, questionId, isCorrect: allCorrect, pointsAwarded });
    return { ok: true, pointsAwarded, isCorrect: allCorrect };
  }).then(async (result) => {
    // Correct answers in Live Event quiz count as 1 participation point so players can use skills
    if (result.ok && result.isCorrect) {
      await trackParticipation(sessionId, uid, 1);
      // Update the session room's players array so this player's movesEarned increases (enables skill use)
      try {
        const roomRef = doc(db, 'inSessionRooms', sessionId);
        const roomSnap = await getDoc(roomRef);
        if (roomSnap.exists()) {
          const data = roomSnap.data();
          const players: Array<{ userId: string; participationCount?: number; movesEarned?: number; [k: string]: unknown }> = data?.players ?? [];
          const idx = players.findIndex((p) => p.userId === uid);
          if (idx >= 0) {
            const p = players[idx];
            const newParticipationCount = (p.participationCount ?? 0) + 1;
            const newMovesEarned = (p.movesEarned ?? 0) + 1;
            const updatedPlayers = [...players];
            updatedPlayers[idx] = { ...p, participationCount: newParticipationCount, movesEarned: newMovesEarned };
            await updateDoc(roomRef, {
              players: updatedPlayers,
              updatedAt: serverTimestamp(),
            });
            log('Session player participation +1 for correct quiz answer (moves available for skills)', { sessionId, uid, newMovesEarned });
          }
        }
      } catch (err) {
        log('Failed to update session player participation for quiz correct', err);
      }
    }
    return result;
  });
}

/** Get current response for a player (for their own display). */
export async function getMyResponse(sessionId: string, uid: string): Promise<LiveQuizResponse | null> {
  const snap = await getDoc(responseDocRef(sessionId, uid));
  if (!snap.exists()) return null;
  return snap.data() as LiveQuizResponse;
}

/** Subscribe to response count for host (how many answered current question). */
export function subscribeResponseCount(
  sessionId: string,
  currentQuestionId: string | null,
  onCount: (count: number) => void
): () => void {
  if (!currentQuestionId) {
    onCount(0);
    return () => {};
  }
  return onSnapshot(responsesRef(sessionId), (snap) => {
    let count = 0;
    snap.docs.forEach((d) => {
      const r = d.data() as LiveQuizResponse;
      if (r.currentQuestionId === currentQuestionId) count++;
    });
    onCount(count);
  });
}

/** End quiz early (host). */
export async function endQuizSession(sessionId: string, hostUid: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const snap = await getDoc(sessionRef(sessionId));
    if (!snap.exists()) return { ok: false, error: 'No quiz session' };
    const session = snap.data() as LiveQuizSession;
    if (session.hostUid !== hostUid) return { ok: false, error: 'Only host can end quiz' };
    await updateDoc(sessionRef(sessionId), {
      status: 'completed',
      currentQuestionId: null,
      questionStartedAt: null,
      questionEndsAt: null,
      updatedAt: serverTimestamp(),
    });
    log('Quiz ended by host', { sessionId });
    await grantLiveQuizRewards(sessionId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Clear quiz session (set to idle) so UI returns to battle mode. Host only. */
export async function clearQuizSession(sessionId: string, hostUid: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const snap = await getDoc(sessionRef(sessionId));
    if (!snap.exists()) return { ok: true };
    const session = snap.data() as LiveQuizSession;
    if (session.hostUid !== hostUid) return { ok: false, error: 'Only host can clear' };
    await updateDoc(sessionRef(sessionId), {
      status: 'idle',
      updatedAt: serverTimestamp(),
    });
    log('Quiz session cleared', { sessionId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
