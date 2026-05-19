import type { Timestamp } from 'firebase/firestore';

/** Completed Live Event Exam — `examProductivityLogs/{logId}` */
export type ExamProductivityLog = {
  id: string;
  userId: string;
  sessionId: string;
  examQuizSetId: string;
  attemptId: string;
  classId?: string;
  /** Display title (quiz bank or linked assessment). */
  title: string;
  quizTopic?: string;
  assessmentId?: string;
  assessmentTitle?: string;
  scorePercent: number;
  correctAnswers: number;
  totalQuestions: number;
  timeTakenMs: number;
  completedAt: Timestamp | unknown;
  weekId: string;
  /** True when migrated from legacy quizProductivityLogs row. */
  legacyFromQuizLog?: boolean;
};
