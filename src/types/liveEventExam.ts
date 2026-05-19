import type { Timestamp } from 'firebase/firestore';
import type { TrainingAnswer, TrainingQuestion } from './trainingGrounds';

/** Admin-configurable behavior for Exam Live Events (stored on inSessionRooms). */
export interface LiveEventExamSettings {
  fullScreen: boolean;
  allowCombat: boolean;
  allowSkills: boolean;
  allowItems: boolean;
  awardPP: boolean;
  awardXP: boolean;
  /** When false (default), correct answers are revealed only on the results screen at the end. */
  showFeedbackDuringExam: boolean;
  /** Whole-exam time limit in minutes. 0 = no limit (students work at their own pace). */
  timeLimitMinutes: number;
}

export const DEFAULT_LIVE_EVENT_EXAM_SETTINGS: LiveEventExamSettings = {
  fullScreen: true,
  allowCombat: false,
  allowSkills: false,
  allowItems: false,
  awardPP: false,
  awardXP: false,
  showFeedbackDuringExam: false,
  timeLimitMinutes: 0,
};

/** Per-player progress: inSessionRooms/{sessionId}/examProgress/{playerId} */
export interface PlayerExamProgress {
  playerId: string;
  playerName?: string;
  answeredCount: number;
  correctCount: number;
  totalQuestions: number;
  scorePercent: number;
  completed: boolean;
  submittedAt?: Timestamp | null;
  currentQuestionIndex: number;
  /** Mental work credited for each answered question (idempotent flag). */
  mentalWorkCredited?: boolean;
  answers?: TrainingAnswer[];
  /** Room examStartedAt when this attempt began (for reset on host re-launch). */
  examSessionStartedAt?: Timestamp | null;
  /** Training Grounds CFU id for this attempt (reset when host picks a different set). */
  examQuizSetId?: string;
}

/** Score summary aligned to the current question bank (ignores stale answers from other CFUs). */
export function computeExamScoreFromBank(
  questions: TrainingQuestion[],
  answers: TrainingAnswer[]
): {
  alignedAnswers: TrainingAnswer[];
  answeredCount: number;
  correctCount: number;
  scorePercent: number;
} {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  const aligned: TrainingAnswer[] = [];
  let scoreSum = 0;
  let correctCount = 0;

  for (const q of questions) {
    const a = byId.get(q.id);
    if (!a) continue;
    aligned.push(a);
    const pc = a.partialCredit ?? (a.isCorrect ? 1 : 0);
    scoreSum += pc;
    if (a.isCorrect) correctCount += 1;
  }

  const total = questions.length;
  const scorePercent =
    total > 0 ? Math.round((scoreSum / total) * 1000) / 10 : 0;

  return {
    alignedAnswers: aligned,
    answeredCount: aligned.length,
    correctCount,
    scorePercent,
  };
}

export function isExamLiveEventMode(mode: string | undefined): boolean {
  return mode === 'exam';
}

export function mergeExamSettings(
  raw: Partial<LiveEventExamSettings> | undefined
): LiveEventExamSettings {
  const merged = {
    ...DEFAULT_LIVE_EVENT_EXAM_SETTINGS,
    ...(raw || {}),
  };
  const minutes = Number(merged.timeLimitMinutes);
  return {
    ...merged,
    timeLimitMinutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : 0,
  };
}

export function examHasTimeLimit(settings: LiveEventExamSettings): boolean {
  return settings.timeLimitMinutes > 0;
}

export function examTimeLimitMs(settings: LiveEventExamSettings): number {
  return examHasTimeLimit(settings) ? settings.timeLimitMinutes * 60 * 1000 : 0;
}

/** Seconds left for the whole exam, or null when no limit / no start time yet. */
export function examRemainingSeconds(
  startedAtMs: number | null,
  settings: LiveEventExamSettings,
  nowMs: number = Date.now()
): number | null {
  const limitMs = examTimeLimitMs(settings);
  if (!limitMs || startedAtMs == null) return null;
  return Math.max(0, Math.ceil((startedAtMs + limitMs - nowMs) / 1000));
}

/** Safe index for question bank length (progress index can be stale after re-launch). */
export function clampExamQuestionIndex(index: number, questionCount: number): number {
  if (questionCount <= 0) return 0;
  return Math.min(Math.max(0, index), questionCount - 1);
}

export function formatExamCountdown(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}
