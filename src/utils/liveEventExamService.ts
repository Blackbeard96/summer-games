import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type DocumentData,
  type Unsubscribe,
  type UpdateData,
} from 'firebase/firestore';
import { db } from '../firebase';
import { ENERGY_TYPES } from '../constants/energyTypes';
import {
  computeExamScoreFromBank,
  DEFAULT_LIVE_EVENT_EXAM_SETTINGS,
  mergeExamSettings,
  type LiveEventExamSettings,
  type PlayerExamProgress,
} from '../types/liveEventExam';
import type { TrainingAnswer, TrainingQuestion } from '../types/trainingGrounds';
import { tsMs } from './productivityTracking';
import { updatePlayerWorkStats } from './workStatsTracking';
import { recordQuizProductivityAttempt } from './productivityTracking';
import { getEnergyTypeForMode } from './season1Energy';
import type { LiveEventModeType } from '../types/season1';

export { DEFAULT_LIVE_EVENT_EXAM_SETTINGS, mergeExamSettings, isExamLiveEventMode } from '../types/liveEventExam';

export function examProgressRef(sessionId: string, playerId: string) {
  return doc(db, 'inSessionRooms', sessionId, 'examProgress', playerId);
}

export function parsePlayerExamProgress(
  playerId: string,
  raw: Record<string, unknown> | undefined
): PlayerExamProgress {
  if (!raw) {
    return {
      playerId,
      answeredCount: 0,
      correctCount: 0,
      totalQuestions: 0,
      scorePercent: 0,
      completed: false,
      currentQuestionIndex: 0,
    };
  }
  return {
    playerId,
    playerName: typeof raw.playerName === 'string' ? raw.playerName : undefined,
    answeredCount: Math.max(0, Number(raw.answeredCount) || 0),
    correctCount: Math.max(0, Number(raw.correctCount) || 0),
    totalQuestions: Math.max(0, Number(raw.totalQuestions) || 0),
    scorePercent: Math.max(0, Math.min(100, Number(raw.scorePercent) || 0)),
    completed: Boolean(raw.completed),
    submittedAt: (raw.submittedAt as PlayerExamProgress['submittedAt']) ?? null,
    currentQuestionIndex: Math.max(0, Number(raw.currentQuestionIndex) || 0),
    mentalWorkCredited: Boolean(raw.mentalWorkCredited),
    answers: Array.isArray(raw.answers) ? (raw.answers as TrainingAnswer[]) : undefined,
    examSessionStartedAt:
      (raw.examSessionStartedAt as PlayerExamProgress['examSessionStartedAt']) ?? null,
    examQuizSetId: typeof raw.examQuizSetId === 'string' ? raw.examQuizSetId : undefined,
  };
}

const ACTIVATION_TIME_TOLERANCE_MS = 3000;

/** True when stored progress belongs to a different exam launch or is corrupted. */
export function isExamProgressStale(
  data: Record<string, unknown>,
  examQuizSetId: string,
  examStartedAtMs: number | null,
  questionIds: string[],
  totalQuestions: number
): boolean {
  const progressQuizId = typeof data.examQuizSetId === 'string' ? data.examQuizSetId : '';
  if (progressQuizId && examQuizSetId && progressQuizId !== examQuizSetId) return true;

  const priorStartMs = tsMs(data.examSessionStartedAt);
  if (examStartedAtMs != null) {
    if (priorStartMs == null) return true;
    if (Math.abs(priorStartMs - examStartedAtMs) > ACTIVATION_TIME_TOLERANCE_MS) return true;
  }

  const index = Number(data.currentQuestionIndex) || 0;
  const answers = Array.isArray(data.answers) ? (data.answers as TrainingAnswer[]) : [];
  const completed = Boolean(data.completed);

  if (totalQuestions > 0) {
    if (index >= totalQuestions) return true;
    if (!completed && index > 0 && answers.length === 0) return true;
  }

  if (questionIds.length > 0 && answers.length > 0) {
    const valid = new Set(questionIds);
    if (answers.some((a) => typeof a.questionId === 'string' && !valid.has(a.questionId))) {
      return true;
    }
  }

  if (completed && questionIds.length > 0 && totalQuestions > 0) {
    const stubQuestions = questionIds.map((id) => ({ id })) as import('../types/trainingGrounds').TrainingQuestion[];
    const stored = computeExamScoreFromBank(stubQuestions, answers);
    const storedPercent = Number(data.scorePercent) || 0;
    if (Math.abs(storedPercent - stored.scorePercent) > 0.5) return true;
    if ((Number(data.correctCount) || 0) !== stored.correctCount) return true;
  }

  return false;
}

export function subscribeExamProgressCollection(
  sessionId: string,
  onUpdate: (rows: PlayerExamProgress[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  const col = collection(db, 'inSessionRooms', sessionId, 'examProgress');
  return onSnapshot(
    col,
    (snap) => {
      const rows = snap.docs.map((d) =>
        parsePlayerExamProgress(d.id, d.data() as Record<string, unknown>)
      );
      onUpdate(rows);
    },
    (err) => onError?.(err)
  );
}

/** Students subscribe only to their own progress doc (Firestore rules). */
export function subscribePlayerExamProgress(
  sessionId: string,
  playerId: string,
  onUpdate: (row: PlayerExamProgress | null) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  return onSnapshot(
    examProgressRef(sessionId, playerId),
    (snap) => {
      if (!snap.exists()) {
        onUpdate(null);
        return;
      }
      onUpdate(parsePlayerExamProgress(playerId, snap.data() as Record<string, unknown>));
    },
    (err) => onError?.(err)
  );
}

export async function getPlayerExamProgress(
  sessionId: string,
  playerId: string
): Promise<PlayerExamProgress | null> {
  const snap = await getDoc(examProgressRef(sessionId, playerId));
  if (!snap.exists()) return null;
  return parsePlayerExamProgress(playerId, snap.data() as Record<string, unknown>);
}

export async function ensureExamProgressDoc(
  sessionId: string,
  playerId: string,
  playerName: string,
  totalQuestions: number,
  examQuizSetId: string,
  examStartedAtMs: number | null,
  questionIds: string[] = []
): Promise<PlayerExamProgress> {
  const ref = examProgressRef(sessionId, playerId);
  const snap = await getDoc(ref);

  const buildFresh = () => ({
    playerId,
    playerName,
    answeredCount: 0,
    correctCount: 0,
    totalQuestions,
    scorePercent: 0,
    completed: false,
    currentQuestionIndex: 0,
    answers: [] as TrainingAnswer[],
    examQuizSetId,
    examSessionStartedAt:
      examStartedAtMs != null ? Timestamp.fromMillis(examStartedAtMs) : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (!snap.exists()) {
    const fresh = buildFresh();
    await setDoc(ref, fresh);
    return parsePlayerExamProgress(playerId, fresh);
  }

  const data = snap.data() as Record<string, unknown>;

  if (isExamProgressStale(data, examQuizSetId, examStartedAtMs, questionIds, totalQuestions)) {
    const fresh = buildFresh();
    await setDoc(ref, fresh);
    return parsePlayerExamProgress(playerId, fresh);
  }

  const patches: UpdateData<DocumentData> = { updatedAt: serverTimestamp() };
  if (totalQuestions > 0 && Number(data.totalQuestions) !== totalQuestions) {
    patches.totalQuestions = totalQuestions;
  }
  if (!data.examQuizSetId && examQuizSetId) {
    patches.examQuizSetId = examQuizSetId;
  }

  if (Object.keys(patches).length > 1) {
    await updateDoc(ref, patches);
    const updated = await getDoc(ref);
    return parsePlayerExamProgress(playerId, updated.data() as Record<string, unknown>);
  }

  return parsePlayerExamProgress(playerId, data);
}

function scoreAnswer(question: TrainingQuestion, selectedIndices: number[]): {
  isCorrect: boolean;
  partialCredit: number;
} {
  const correctIndices =
    question.correctIndices ??
    (question.correctIndex !== undefined ? [question.correctIndex] : []);
  const correctSet = new Set(correctIndices);
  const selectedSet = new Set(selectedIndices);
  const allCorrectSelected = correctIndices.every((idx) => selectedSet.has(idx));
  const noIncorrectSelected = selectedIndices.every((idx) => correctSet.has(idx));
  const isFullyCorrect =
    allCorrectSelected &&
    noIncorrectSelected &&
    correctIndices.length === selectedIndices.length;
  let partialCredit = 0;
  if (isFullyCorrect) {
    partialCredit = 1;
  } else if (correctIndices.length > 0) {
    const correctSelected = selectedIndices.filter((idx) => correctSet.has(idx)).length;
    const incorrectSelected = selectedIndices.filter((idx) => !correctSet.has(idx)).length;
    const correctRatio = correctSelected / correctIndices.length;
    const incorrectPenalty = incorrectSelected * 0.25;
    partialCredit = Math.max(0, correctRatio - incorrectPenalty);
  }
  return { isCorrect: isFullyCorrect, partialCredit };
}

export async function creditMentalWorkForExamQuestion(args: {
  userId: string;
  sessionId: string;
  classId?: string;
  playerName?: string;
  pointsEarned?: number;
}): Promise<void> {
  await updatePlayerWorkStats({
    userId: args.userId,
    energyType: ENERGY_TYPES.MENTAL,
    completedIncrement: 1,
    pointsEarnedIncrement: Math.max(0, args.pointsEarned ?? 0),
    classId: args.classId,
    playerName: args.playerName,
    source: 'live_event',
    sourceId: `${args.sessionId}_exam_q`,
    logActivity: true,
  });
}

/** Host activates Exam mode on an existing room. */
export async function activateExamLiveEvent(args: {
  sessionId: string;
  examQuizSetId: string;
  examAssessmentId?: string;
  examSettings?: Partial<LiveEventExamSettings>;
  totalQuestions: number;
}): Promise<void> {
  const settings = mergeExamSettings(args.examSettings);
  const energyTypeAwarded = getEnergyTypeForMode('exam' as LiveEventModeType);
  await updateDoc(doc(db, 'inSessionRooms', args.sessionId), {
    liveEventMode: 'exam',
    workType: 'mental',
    energyType: ENERGY_TYPES.MENTAL,
    energyTypeAwarded,
    goalLinkingEnabled: false,
    examQuizSetId: args.examQuizSetId.trim(),
    ...(args.examAssessmentId?.trim()
      ? { examAssessmentId: args.examAssessmentId.trim() }
      : {}),
    examSettings: settings,
    examStartedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function submitExamAnswer(args: {
  sessionId: string;
  playerId: string;
  playerName: string;
  classId?: string;
  question: TrainingQuestion;
  questionIndex: number;
  selectedIndices: number[];
  totalQuestions: number;
  timeSpentMs: number;
  existingAnswers: TrainingAnswer[];
  examQuizSetId?: string;
}): Promise<PlayerExamProgress> {
  const { isCorrect, partialCredit } = scoreAnswer(args.question, args.selectedIndices);
  const correctIndices =
    args.question.correctIndices ??
    (args.question.correctIndex !== undefined ? [args.question.correctIndex] : []);

  const answer: TrainingAnswer = {
    questionId: args.question.id,
    ...(correctIndices.length === 1 && args.selectedIndices.length === 1
      ? { selectedIndex: args.selectedIndices[0] }
      : {}),
    selectedIndices: args.selectedIndices,
    isCorrect,
    partialCredit,
    timeSpentMs: args.timeSpentMs,
  };

  const withoutCurrent = args.existingAnswers.filter((a) => a.questionId !== args.question.id);
  const answers = [...withoutCurrent, answer];
  const answeredCount = answers.length;
  let correctCount = 0;
  let scoreSum = 0;
  answers.forEach((a) => {
    const pc = a.partialCredit ?? (a.isCorrect ? 1 : 0);
    scoreSum += pc;
    if (a.isCorrect) correctCount += 1;
  });
  const scorePercent =
    args.totalQuestions > 0
      ? Math.round((scoreSum / args.totalQuestions) * 1000) / 10
      : 0;
  await setDoc(
    examProgressRef(args.sessionId, args.playerId),
    {
      playerId: args.playerId,
      playerName: args.playerName,
      answeredCount,
      correctCount,
      totalQuestions: args.totalQuestions,
      scorePercent,
      completed: false,
      /** Stays on this question until student taps Next (see advanceExamQuestionIndex). */
      currentQuestionIndex: args.questionIndex,
      answers,
      ...(args.examQuizSetId ? { examQuizSetId: args.examQuizSetId } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  void creditMentalWorkForExamQuestion({
    userId: args.playerId,
    sessionId: args.sessionId,
    classId: args.classId,
    playerName: args.playerName,
    pointsEarned: Math.round((partialCredit || 0) * 10),
  });

  return {
    playerId: args.playerId,
    playerName: args.playerName,
    answeredCount,
    correctCount,
    totalQuestions: args.totalQuestions,
    scorePercent,
    completed: false,
    currentQuestionIndex: args.questionIndex,
    answers,
  };
}

export async function advanceExamQuestionIndex(
  sessionId: string,
  playerId: string,
  nextIndex: number
): Promise<void> {
  await updateDoc(examProgressRef(sessionId, playerId), {
    currentQuestionIndex: nextIndex,
    updatedAt: serverTimestamp(),
  });
}

export async function completeExamAttempt(args: {
  sessionId: string;
  playerId: string;
  playerName: string;
  classId?: string;
  quizSetId: string;
  quizTitle?: string;
  examAssessmentId?: string;
  assessmentTitle?: string;
  progress: PlayerExamProgress;
  examSettings: LiveEventExamSettings;
  startedAtMs: number;
}): Promise<PlayerExamProgress> {
  const ref = examProgressRef(args.sessionId, args.playerId);
  const { getQuestions: loadQuestions } = await import('./trainingGroundsService');
  const bank = await loadQuestions(args.quizSetId);
  const scored = computeExamScoreFromBank(bank, args.progress.answers ?? []);

  await updateDoc(ref, {
    completed: true,
    submittedAt: serverTimestamp(),
    mentalWorkCredited: true,
    answeredCount: scored.answeredCount,
    correctCount: scored.correctCount,
    scorePercent: scored.scorePercent,
    totalQuestions: bank.length,
    answers: scored.alignedAnswers,
    examQuizSetId: args.quizSetId,
    currentQuestionIndex: Math.max(0, bank.length - 1),
    updatedAt: serverTimestamp(),
  });

  const finalProgress: PlayerExamProgress = {
    ...args.progress,
    completed: true,
    answeredCount: scored.answeredCount,
    correctCount: scored.correctCount,
    scorePercent: scored.scorePercent,
    totalQuestions: bank.length,
    answers: scored.alignedAnswers,
    examQuizSetId: args.quizSetId,
    currentQuestionIndex: Math.max(0, bank.length - 1),
  };

  const completedAtMs = Date.now();
  const timeTakenMs = Math.max(0, completedAtMs - args.startedAtMs);
  const title =
    args.assessmentTitle?.trim() ||
    args.quizTitle?.trim() ||
    'Live Event Exam';

  const { recordExamProductivityAttempt } = await import('./productivityTracking');
  await recordExamProductivityAttempt({
    userId: args.playerId,
    sessionId: args.sessionId,
    examQuizSetId: args.quizSetId,
    attemptId: `live_exam_${args.sessionId}_${args.playerId}`,
    classId: args.classId,
    title,
    quizTopic: args.quizTitle,
    assessmentId: args.examAssessmentId,
    assessmentTitle: args.assessmentTitle,
    scorePercent: scored.scorePercent,
    correctAnswers: scored.correctCount,
    totalQuestions: bank.length,
    timeTakenMs,
    completedAtMs,
  });

  if (args.examSettings.awardPP || args.examSettings.awardXP) {
    if (scored.alignedAnswers.length > 0 && bank.length > 0) {
      const { grantQuizRewards, calculateQuizRewards } = await import('./trainingGroundsRewards');
      const computed = calculateQuizRewards(bank, scored.alignedAnswers);
      await grantQuizRewards(args.playerId, {
        ppGained: args.examSettings.awardPP ? computed.ppGained : 0,
        xpGained: args.examSettings.awardXP ? computed.xpGained : 0,
        bonuses: computed.bonuses,
        breakdown: computed.breakdown,
      });
    }
  }

  return finalProgress;
}

export async function saveExamToAssessment(args: {
  assessmentId: string;
  studentId: string;
  scorePercent: number;
  maxScore: number;
  gradedBy: string;
}): Promise<void> {
  const actualScore = Math.round((args.scorePercent / 100) * args.maxScore);
  const { setAssessmentResult } = await import('./assessmentGoalsFirestore');
  await setAssessmentResult(
    args.assessmentId,
    args.studentId,
    actualScore,
    args.gradedBy
  );
}
