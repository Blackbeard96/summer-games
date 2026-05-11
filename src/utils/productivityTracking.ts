/**
 * MST productivity analytics: Class Flow sprints + Training Ground / live quizzes.
 * Aggregates in productivityStats/{userId}; sprintProductivityLogs / quizProductivityLogs for history.
 */

import { db } from '../firebase';
import {
  doc,
  runTransaction,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  limit,
  Timestamp,
  type Timestamp as FsTimestamp,
  type Transaction,
} from 'firebase/firestore';
import type { TrainingAttempt } from '../types/trainingGrounds';
import type { EnergyType } from '../types/season1';
import { getEnergyTypeForLiveEvent, ENERGY_TYPES } from '../constants/energyTypes';
import type { PlayerWorkStats } from './workStatsTracking';
import { parseWorkStatsFromDoc, updatePlayerWorkStats } from './workStatsTracking';

/** Monday-start week key (local): YYYY-MM-DD */
export function getWeekId(d: Date = new Date()): string {
  const t = new Date(d);
  const day = (t.getDay() + 6) % 7;
  t.setDate(t.getDate() - day);
  t.setHours(0, 0, 0, 0);
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const dayStr = String(t.getDate()).padStart(2, '0');
  return `${y}-${m}-${dayStr}`;
}

export function getIsoWeekMondayDate(weekId: string): Date | null {
  const [y, m, d] = weekId.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Deterministic sprint log doc id — avoids collisions and duplicate joins */
export function sprintProductivityDocId(sessionId: string, sprintId: string, userId: string): string {
  const safeSession = sessionId.replace(/\//g, '_').slice(0, 420);
  const safeSprint = sprintId.replace(/\//g, '_').slice(0, 120);
  return `${safeSession}__${safeSprint}__${userId}`.slice(0, 1400);
}

export function quizProductivityDocId(userId: string, quizId: string, attemptId: string): string {
  const safeQuiz = quizId.replace(/\//g, '_').slice(0, 200);
  return `${userId}__${safeQuiz}__${attemptId}`.slice(0, 1400);
}

export type ProductivityRankLabel =
  | 'Dormant'
  | 'Initiate'
  | 'Consistent'
  | 'Focused'
  | 'Ascended'
  | 'Flow State';

export function getProductivityRank(score: number): ProductivityRankLabel {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  if (s < 40) return 'Dormant';
  if (s < 60) return 'Initiate';
  if (s < 75) return 'Consistent';
  if (s < 85) return 'Focused';
  if (s < 95) return 'Ascended';
  return 'Flow State';
}

export function calculateSprintCompletionRate(joined: number, completed: number): number {
  if (!joined || joined <= 0) return completed > 0 ? 100 : 0;
  return Math.round((Math.min(joined, completed) / joined) * 1000) / 10;
}

/** Sprint + quiz cadence buckets — product spec */
export function consistencyFromWeeklyTotals(
  weekSprintJoined: number,
  weekSprintCompleted: number,
  weekQuizCompletes: number
): number {
  if (weekSprintJoined <= 0 && weekQuizCompletes <= 0 && weekSprintCompleted <= 0) {
    return 0;
  }
  const ratio =
    weekSprintJoined > 0 ? weekSprintCompleted / weekSprintJoined : weekSprintCompleted > 0 ? 1 : 0;

  const fullEngagement =
    weekSprintCompleted >= 1 &&
    weekQuizCompletes >= 1 &&
    (weekSprintJoined === 0 || ratio >= 0.75);

  if (fullEngagement) return 100;

  const strong =
    weekSprintCompleted + weekQuizCompletes >= 3 ||
    (weekQuizCompletes >= 1 && weekSprintJoined > 0 && ratio >= 0.5) ||
    weekSprintCompleted >= 2;

  if (strong) return 75;

  if (weekSprintCompleted >= 1 || weekQuizCompletes >= 1) return 50;

  if (weekSprintJoined >= 1 && weekSprintCompleted === 0 && weekQuizCompletes === 0) return 25;

  return 0;
}

export function calculateProductivityRating(
  sprintCompletionRatePct: number,
  averageQuizScorePct: number,
  consistencyScore: number
): number {
  const r =
    sprintCompletionRatePct * 0.4 + averageQuizScorePct * 0.4 + consistencyScore * 0.2;
  return Math.round(r * 10) / 10;
}

/** Named helpers for dashboards / tests (aggregates are usually read from Firestore). */
export function calculateConsistencyScore(
  weekSprintJoined: number,
  weekSprintCompleted: number,
  weekQuizCompletes: number
): number {
  return consistencyFromWeeklyTotals(weekSprintJoined, weekSprintCompleted, weekQuizCompletes);
}

export function calculateAverageQuizScore(quizScoreSum: number, quizCount: number): number {
  if (!quizCount || quizCount <= 0) return 0;
  return Math.round((quizScoreSum / quizCount) * 10) / 10;
}

/** Public shape for dashboards / Profile */
export type ProductivityStatDoc = {
  userId: string;
  classId?: string;
  primaryClassIds?: string[];
  totalSprintsJoined: number;
  totalSprintsCompleted: number;
  sprintCompletionRate: number;
  totalQuizzesCompleted: number;
  averageQuizScore: number;
  quizScoreSum?: number;
  currentStreak: number;
  bestStreak: number;
  streakAnchorWeekId?: string | null;
  weeklyProductivityRating: number;
  overallProductivityRating: number;
  productivityRank: ProductivityRankLabel;
  lastUpdated?: unknown;
  previousOverallRating?: number;
  ratingDelta?: number;
  activeWeekId?: string;
  weekSprintJoined?: number;
  weekSprintCompleted?: number;
  weekQuizCompletes?: number;
  weekQuizScoreSum?: number;
  /** Physical / Mental / Emotional / Spiritual work counters (MST). */
  workStats?: PlayerWorkStats;
};

export function tsMs(t: unknown): number | null {
  if (t && typeof (t as FsTimestamp).toMillis === 'function')
    return (t as FsTimestamp).toMillis();
  if (t instanceof Date) return t.getTime();
  return null;
}

function weeklyRatePassesStreak(weeklyRating: number, floor: number): boolean {
  return weeklyRating >= floor;
}

/** Consecutive calendar weeks (Monday keys) with weekly productivity ≥ floor */
export function evolveStreak(
  weeklyRating: number,
  activeWeekId: string,
  prior: Pick<ProductivityStatDoc, 'currentStreak' | 'bestStreak' | 'streakAnchorWeekId'>
): Pick<ProductivityStatDoc, 'currentStreak' | 'bestStreak' | 'streakAnchorWeekId'> {
  const floor = 50;
  let current = Math.max(0, prior.currentStreak || 0);
  let anchor = prior.streakAnchorWeekId ?? null;

  if (!weeklyRatePassesStreak(weeklyRating, floor)) {
    if (anchor === activeWeekId) {
      return {
        currentStreak: 0,
        bestStreak: Math.max(current, prior.bestStreak || 0),
        streakAnchorWeekId: null,
      };
    }
    return {
      currentStreak: current,
      bestStreak: Math.max(current, prior.bestStreak || 0),
      streakAnchorWeekId: anchor,
    };
  }

  const prevMondayMs = anchor ? getIsoWeekMondayDate(anchor)?.getTime() : null;
  const currMondayMs = getIsoWeekMondayDate(activeWeekId)?.getTime();
  if (prevMondayMs == null || anchor === null) {
    current = 1;
  } else if (currMondayMs != null && prevMondayMs === currMondayMs) {
    current = Math.max(1, current);
  } else if (
    currMondayMs != null &&
    prevMondayMs != null &&
    currMondayMs - prevMondayMs === 7 * 24 * 60 * 60 * 1000
  ) {
    current += 1;
  } else if (currMondayMs != null && prevMondayMs != null && currMondayMs > prevMondayMs) {
    current = 1;
  } else {
    current = Math.max(1, current);
  }

  anchor = activeWeekId;
  const best = Math.max(prior.bestStreak || 0, current);

  return { currentStreak: current, bestStreak: best, streakAnchorWeekId: anchor };
}

function mergeClassId(draft: DraftStats, classId?: string): void {
  if (typeof classId === 'string' && classId.trim()) {
    draft.primaryClassIds = Array.from(
      new Set([...(draft.primaryClassIds || []), classId.trim()])
    );
  }
}

const sprintLogs = () => collection(db, 'sprintProductivityLogs');
const quizLogs = () => collection(db, 'quizProductivityLogs');

type DraftStats = {
  userId: string;
  primaryClassIds?: string[];
  totalSprintsJoined: number;
  totalSprintsCompleted: number;
  sprintCompletionRate: number;
  totalQuizzesCompleted: number;
  averageQuizScore: number;
  quizScoreSum: number;
  activeWeekId?: string;
  weekSprintJoined: number;
  weekSprintCompleted: number;
  weekQuizCompletes: number;
  weekQuizScoreSum: number;
  currentStreak: number;
  bestStreak: number;
  streakAnchorWeekId: string | null;
};

async function applyProductivityTransaction(
  userId: string,
  mutate: (draft: DraftStats, tx: Transaction) => void,
  opts?: { classId?: string }
): Promise<void> {
  const statsRef = doc(db, 'productivityStats', userId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(statsRef);
    const raw = snap.exists() ? snap.data() : {};
    const weekIdNow = getWeekId();

    const draft: DraftStats = {
      userId,
      primaryClassIds: Array.isArray((raw as { primaryClassIds?: string[] }).primaryClassIds)
        ? [...((raw as { primaryClassIds?: string[] }).primaryClassIds || [])]
        : [],
      totalSprintsJoined: Number((raw as { totalSprintsJoined?: number }).totalSprintsJoined || 0),
      totalSprintsCompleted: Number((raw as { totalSprintsCompleted?: number }).totalSprintsCompleted || 0),
      sprintCompletionRate: Number((raw as { sprintCompletionRate?: number }).sprintCompletionRate || 0),
      totalQuizzesCompleted: Number((raw as { totalQuizzesCompleted?: number }).totalQuizzesCompleted || 0),
      averageQuizScore: Number((raw as { averageQuizScore?: number }).averageQuizScore || 0),
      quizScoreSum: Number((raw as { quizScoreSum?: number }).quizScoreSum || 0),
      activeWeekId: typeof (raw as { activeWeekId?: string }).activeWeekId === 'string'
        ? (raw as { activeWeekId: string }).activeWeekId
        : undefined,
      weekSprintJoined: Number((raw as { weekSprintJoined?: number }).weekSprintJoined || 0),
      weekSprintCompleted: Number((raw as { weekSprintCompleted?: number }).weekSprintCompleted || 0),
      weekQuizCompletes: Number((raw as { weekQuizCompletes?: number }).weekQuizCompletes || 0),
      weekQuizScoreSum: Number((raw as { weekQuizScoreSum?: number }).weekQuizScoreSum || 0),
      currentStreak: Number((raw as { currentStreak?: number }).currentStreak || 0),
      bestStreak: Number((raw as { bestStreak?: number }).bestStreak || 0),
      streakAnchorWeekId:
        typeof (raw as { streakAnchorWeekId?: string | null }).streakAnchorWeekId === 'string'
          ? (raw as { streakAnchorWeekId: string }).streakAnchorWeekId
          : (raw as { streakAnchorWeekId?: null }).streakAnchorWeekId ?? null,
    };

    mergeClassId(draft, opts?.classId);

    if (!draft.activeWeekId || draft.activeWeekId !== weekIdNow) {
      draft.activeWeekId = weekIdNow;
      draft.weekSprintJoined = 0;
      draft.weekSprintCompleted = 0;
      draft.weekQuizCompletes = 0;
      draft.weekQuizScoreSum = 0;
    }

    mutate(draft, tx);

    const sprintRate = calculateSprintCompletionRate(draft.totalSprintsJoined, draft.totalSprintsCompleted);
    const quizAvg =
      draft.totalQuizzesCompleted > 0
        ? Math.round((draft.quizScoreSum / draft.totalQuizzesCompleted) * 10) / 10
        : 0;
    draft.sprintCompletionRate = sprintRate;
    draft.averageQuizScore = quizAvg;

    const wQuizAvg =
      draft.weekQuizCompletes > 0
        ? Math.round((draft.weekQuizScoreSum / draft.weekQuizCompletes) * 10) / 10
        : 0;
    const weeklySprintRate =
      draft.weekSprintJoined > 0
        ? calculateSprintCompletionRate(draft.weekSprintJoined, draft.weekSprintCompleted)
        : draft.weekSprintCompleted > 0
          ? 100
          : 0;

    const consistencyW = consistencyFromWeeklyTotals(
      draft.weekSprintJoined,
      draft.weekSprintCompleted,
      draft.weekQuizCompletes
    );

    const weeklyRating = calculateProductivityRating(weeklySprintRate, wQuizAvg, consistencyW);
    const overallRating = calculateProductivityRating(sprintRate, quizAvg, consistencyW);

    const streak = evolveStreak(weeklyRating, weekIdNow, {
      currentStreak: draft.currentStreak,
      bestStreak: draft.bestStreak,
      streakAnchorWeekId: draft.streakAnchorWeekId,
    });

    const prevOverall = Number((raw as { overallProductivityRating?: number }).overallProductivityRating || 0);
    const delta = Math.round((overallRating - prevOverall) * 10) / 10;

    tx.set(
      statsRef,
      {
        userId,
        classId: draft.primaryClassIds?.[0] ?? (raw as { classId?: string }).classId ?? '',
        primaryClassIds: draft.primaryClassIds?.length ? draft.primaryClassIds : [],
        totalSprintsJoined: draft.totalSprintsJoined,
        totalSprintsCompleted: draft.totalSprintsCompleted,
        sprintCompletionRate: sprintRate,
        totalQuizzesCompleted: draft.totalQuizzesCompleted,
        averageQuizScore: quizAvg,
        quizScoreSum: draft.quizScoreSum,
        activeWeekId: weekIdNow,
        weekSprintJoined: draft.weekSprintJoined,
        weekSprintCompleted: draft.weekSprintCompleted,
        weekQuizCompletes: draft.weekQuizCompletes,
        weekQuizScoreSum: draft.weekQuizScoreSum,
        weeklyProductivityRating: weeklyRating,
        overallProductivityRating: overallRating,
        productivityRank: getProductivityRank(overallRating),
        currentStreak: streak.currentStreak,
        bestStreak: streak.bestStreak,
        streakAnchorWeekId: streak.streakAnchorWeekId,
        previousOverallRating: prevOverall,
        ratingDelta: delta,
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

/**
 * Player was in session when Class Flow sprint started — log `joined` (idempotent).
 */
export async function recordClassFlowSprintJoin(args: {
  sessionId: string;
  sprintId: string;
  userId: string;
  classId?: string;
  sprintTitle?: string;
  sprintType?: string;
  joinedAtMs: number;
  /** When set, drives work-stats bucket (defaults to class_flow → Physical). */
  liveEventMode?: string;
  neutralFlowEnergyType?: EnergyType;
}): Promise<void> {
  const weekId = getWeekId(new Date(args.joinedAtMs));
  const logId = sprintProductivityDocId(args.sessionId, args.sprintId, args.userId);
  const logRef = doc(db, 'sprintProductivityLogs', logId);

  let created = false;
  try {
    await runTransaction(db, async (tx) => {
      const ls = await tx.get(logRef);
      if (ls.exists()) return;
      created = true;
      tx.set(logRef, {
        userId: args.userId,
        sprintId: args.sprintId,
        sessionId: args.sessionId,
        classId: args.classId ?? '',
        status: 'joined',
        joinedAt: Timestamp.fromMillis(args.joinedAtMs),
        completedAt: null,
        completionTime: null,
        score: null,
        sprintType: args.sprintType ?? 'class_flow',
        sprintTitle: args.sprintTitle ?? '',
        weekId,
        updatedAt: serverTimestamp(),
      });
    });

    if (!created) return;

    await applyProductivityTransaction(
      args.userId,
      (draft) => {
        draft.totalSprintsJoined += 1;
        draft.weekSprintJoined += 1;
        mergeClassId(draft, args.classId);
      },
      { classId: args.classId }
    );

    const modeForEnergy =
      typeof args.liveEventMode === 'string' && args.liveEventMode.trim()
        ? args.liveEventMode.trim()
        : 'class_flow';
    const energy = getEnergyTypeForLiveEvent(modeForEnergy, args.neutralFlowEnergyType);
    void updatePlayerWorkStats({
      userId: args.userId,
      energyType: energy,
      attemptedIncrement: 1,
      classId: args.classId,
      source: 'live_event',
      sourceId: `${args.sessionId}__${args.sprintId}__join`,
    }).catch(() => {});
  } catch (e) {
    console.warn('[productivityTracking] sprint join', e);
  }
}

export function recordClassFlowSprintJoinsForPlayers(
  sessionId: string,
  sprintId: string,
  playerUids: string[],
  classId: string | undefined,
  sprintTitle: string,
  joinedAtMs: number,
  opts?: { liveEventMode?: string; neutralFlowEnergyType?: EnergyType }
): void {
  for (const uid of playerUids) {
    void recordClassFlowSprintJoin({
      sessionId,
      sprintId,
      userId: uid,
      classId,
      sprintTitle,
      sprintType: 'class_flow',
      joinedAtMs,
      liveEventMode: opts?.liveEventMode,
      neutralFlowEnergyType: opts?.neutralFlowEnergyType,
    });
  }
}

/** After sprint rewards granted (canonical completion signal) */
export async function recordClassFlowSprintCompletion(args: {
  sessionId: string;
  sprintId: string;
  userId: string;
  classId?: string;
  completedAtMs: number;
  sprintTitle?: string;
  sprintType?: string;
  score?: number | null;
  startedAtMs?: number | null;
  liveEventMode?: string;
  neutralFlowEnergyType?: EnergyType;
  /** Participation + vault + XP granted for this completion (best-effort). */
  pointsEarned?: number;
}): Promise<void> {
  const weekId = getWeekId(new Date(args.completedAtMs));
  const logId = sprintProductivityDocId(args.sessionId, args.sprintId, args.userId);
  const logRef = doc(db, 'sprintProductivityLogs', logId);

  let completionSecs: number | null = null;
  if (
    typeof args.startedAtMs === 'number' &&
    args.startedAtMs > 0 &&
    args.completedAtMs >= args.startedAtMs
  ) {
    completionSecs = Math.floor((args.completedAtMs - args.startedAtMs) / 1000);
  }

  let applied = false;
  try {
    await runTransaction(db, async (tx) => {
      const existing = await tx.get(logRef);
      const alreadyDone =
        existing.exists() &&
        ((existing.data() as { status?: string }).status === 'completed' ||
          !!(existing.data() as { completedAt?: unknown }).completedAt);
      if (alreadyDone) return;
      applied = true;
      tx.set(
        logRef,
        {
          userId: args.userId,
          sprintId: args.sprintId,
          sessionId: args.sessionId,
          classId:
            args.classId ??
            (existing.exists() ? (existing.data() as { classId?: string }).classId : '') ??
            '',
          status: 'completed',
          joinedAt:
            existing.exists() && (existing.data() as { joinedAt?: unknown }).joinedAt
              ? ((existing.data() as { joinedAt?: unknown }).joinedAt as FsTimestamp)
              : Timestamp.fromMillis(args.completedAtMs),
          completedAt: Timestamp.fromMillis(args.completedAtMs),
          completionTime: completionSecs,
          score:
            typeof args.score === 'number'
              ? args.score
              : (existing.exists() ? (existing.data() as { score?: number | null }).score : null) ?? null,
          sprintType: args.sprintType ?? 'class_flow',
          sprintTitle: args.sprintTitle ?? '',
          weekId,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    if (!applied) return;

    await applyProductivityTransaction(
      args.userId,
      (draft) => {
        draft.totalSprintsCompleted += 1;
        draft.weekSprintCompleted += 1;
        if (draft.weekSprintCompleted > draft.weekSprintJoined) {
          const bump = draft.weekSprintCompleted - draft.weekSprintJoined;
          draft.weekSprintJoined += bump;
          draft.totalSprintsJoined += bump;
        }
        mergeClassId(draft, args.classId);
      },
      { classId: args.classId }
    );

    const modeForEnergy =
      typeof args.liveEventMode === 'string' && args.liveEventMode.trim()
        ? args.liveEventMode.trim()
        : 'class_flow';
    const energy = getEnergyTypeForLiveEvent(modeForEnergy, args.neutralFlowEnergyType);
    const pts =
      typeof args.pointsEarned === 'number' && Number.isFinite(args.pointsEarned)
        ? Math.max(0, args.pointsEarned)
        : 0;
    void updatePlayerWorkStats({
      userId: args.userId,
      energyType: energy,
      completedIncrement: 1,
      pointsEarnedIncrement: pts,
      classId: args.classId,
      source: 'live_event',
      sourceId: `${args.sessionId}__${args.sprintId}__complete`,
    }).catch(() => {});
  } catch (e) {
    console.warn('[productivityTracking] sprint complete', e);
  }
}

export async function recordClassFlowSprintMissed(args: {
  sessionId: string;
  sprintId: string;
  userId: string;
  classId?: string;
  missedAtMs: number;
  sprintTitle?: string;
}): Promise<void> {
  const weekId = getWeekId(new Date(args.missedAtMs));
  const logId = sprintProductivityDocId(args.sessionId, args.sprintId, args.userId);
  const logRef = doc(db, 'sprintProductivityLogs', logId);

  /** Track incremental joined opportunity when penalty creates first log row */
  let firstOpportunityThisSprint = false;

  try {
    await runTransaction(db, async (tx) => {
      const existing = await tx.get(logRef);
      const st = existing.exists() ? (existing.data() as { status?: string }).status : '';
      if (st === 'completed') return;
      firstOpportunityThisSprint = !existing.exists();
      tx.set(
        logRef,
        {
          userId: args.userId,
          sprintId: args.sprintId,
          sessionId: args.sessionId,
          classId:
            args.classId ??
            (existing.exists() ? (existing.data() as { classId?: string }).classId : '') ??
            '',
          status: 'missed',
          joinedAt:
            existing.exists() && (existing.data() as { joinedAt?: unknown }).joinedAt
              ? (existing.data() as { joinedAt: FsTimestamp }).joinedAt
              : Timestamp.fromMillis(args.missedAtMs),
          missedAt: Timestamp.fromMillis(args.missedAtMs),
          sprintTitle: args.sprintTitle ?? '',
          weekId,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    await applyProductivityTransaction(
      args.userId,
      (draft) => {
        if (firstOpportunityThisSprint) {
          draft.totalSprintsJoined += 1;
          draft.weekSprintJoined += 1;
        }
        mergeClassId(draft, args.classId);
      },
      { classId: args.classId }
    );
  } catch (e) {
    console.warn('[productivityTracking] sprint missed', e);
  }
}

export async function recordQuizProductivityAttempt(args: {
  userId: string;
  quizSetId: string;
  attemptId: string;
  classId?: string;
  scorePercent: number;
  correctAnswers: number;
  totalQuestions: number;
  timeTakenMs: number;
  completedAtMs: number;
  quizTopic?: string;
  questionTags?: string[];
  mode?: TrainingAttempt['mode'];
  /** Live quiz session `gameMode` — battle royale variants map to Physical work. */
  liveQuizGameMode?: string;
  /** When false, only increments completed (e.g. live quiz after session join already counted attempted). */
  incrementAttempt?: boolean;
}): Promise<void> {
  const weekId = getWeekId(new Date(args.completedAtMs));
  const logId = quizProductivityDocId(args.userId, args.quizSetId, args.attemptId);
  const logRef = doc(db, 'quizProductivityLogs', logId);

  let created = false;
  try {
    await runTransaction(db, async (tx) => {
      const ls = await tx.get(logRef);
      if (ls.exists()) return;
      created = true;
      tx.set(logRef, {
        userId: args.userId,
        quizId: args.quizSetId,
        attemptId: args.attemptId,
        classId: args.classId ?? '',
        scorePercent: args.scorePercent,
        correctAnswers: args.correctAnswers,
        totalQuestions: args.totalQuestions,
        timeTaken: args.timeTakenMs,
        completedAt: Timestamp.fromMillis(args.completedAtMs),
        quizTopic: args.quizTopic ?? '',
        questionTags: args.questionTags ?? [],
        weekId,
        mode: args.mode ?? 'solo',
        updatedAt: serverTimestamp(),
      });
    });

    if (!created) return;

    await applyProductivityTransaction(
      args.userId,
      (draft) => {
        draft.totalQuizzesCompleted += 1;
        draft.weekQuizCompletes += 1;
        draft.quizScoreSum += args.scorePercent;
        draft.weekQuizScoreSum += args.scorePercent;
      },
      { classId: args.classId }
    );

    const gm = (args.liveQuizGameMode || '').toLowerCase();
    const isBattleQuiz = gm === 'battle_royale' || gm === 'team_battle_royale';
    const energy = isBattleQuiz ? ENERGY_TYPES.PHYSICAL : ENERGY_TYPES.MENTAL;
    const countAttempt = args.incrementAttempt !== false;
    void updatePlayerWorkStats({
      userId: args.userId,
      energyType: energy,
      attemptedIncrement: countAttempt ? 1 : 0,
      completedIncrement: 1,
      pointsEarnedIncrement: Math.max(0, Math.round(args.scorePercent || 0)),
      classId: args.classId,
      source: args.mode === 'live' ? 'live_event' : 'assessment',
      sourceId: args.quizSetId,
    }).catch(() => {});
  } catch (e) {
    console.warn('[productivityTracking] quiz', e);
  }
}

/** Recompute stats from logs (admin repair / backfill helper) */
export async function updateUserProductivityStats(userId: string): Promise<void> {
  const logsS = query(sprintLogs(), where('userId', '==', userId), limit(400));
  const logsQ = query(quizLogs(), where('userId', '==', userId), limit(800));
  const [ss, qs] = await Promise.all([getDocs(logsS), getDocs(logsQ)]);

  const joined = ss.size;
  let completed = 0;
  ss.forEach((d) => {
    const st = (d.data() as { status?: string }).status;
    if (st === 'completed') completed += 1;
  });

  let quizzes = 0;
  let qsum = 0;
  qs.forEach((qd) => {
    qsum += Number((qd.data() as { scorePercent?: number }).scorePercent ?? 0);
    quizzes += 1;
  });

  const statsRef = doc(db, 'productivityStats', userId);
  const wkNow = getWeekId();
  let wj = 0;
  let wc = 0;
  let wq = 0;
  let wqsum = 0;
  ss.forEach((d) => {
    const x = d.data() as { weekId?: string; status?: string };
    if (x.weekId !== wkNow) return;
    wj += 1;
    if (x.status === 'completed') wc += 1;
  });
  qs.forEach((d) => {
    const x = d.data() as { weekId?: string; scorePercent?: number };
    if (x.weekId !== wkNow) return;
    wq += 1;
    wqsum += Number(x.scorePercent || 0);
  });

  const sprintRate = calculateSprintCompletionRate(joined, completed);
  const quizAvg = quizzes > 0 ? Math.round((qsum / quizzes) * 10) / 10 : 0;
  const wsRate = calculateSprintCompletionRate(wj, wc);
  const wQuizAvg = wq > 0 ? Math.round((wqsum / wq) * 10) / 10 : 0;
  const c = consistencyFromWeeklyTotals(wj, wc, wq);
  const weeklyRating = calculateProductivityRating(wsRate, wQuizAvg, c);
  const overallRating = calculateProductivityRating(sprintRate, quizAvg, c);

  await runTransaction(db, async (tx) => {
    const prev = await tx.get(statsRef);
    const prow = prev.exists() ? prev.data() : {};
    const priorOverall = Number((prow as { overallProductivityRating?: number }).overallProductivityRating || 0);
    const prevStreak = evolveStreak(weeklyRating, wkNow, {
      currentStreak: Number((prow as { currentStreak?: number }).currentStreak || 0),
      bestStreak: Number((prow as { bestStreak?: number }).bestStreak || 0),
      streakAnchorWeekId: (prow as { streakAnchorWeekId?: string | null }).streakAnchorWeekId ?? null,
    });

    tx.set(
      statsRef,
      {
        userId,
        totalSprintsJoined: joined,
        totalSprintsCompleted: completed,
        sprintCompletionRate: sprintRate,
        totalQuizzesCompleted: quizzes,
        averageQuizScore: quizAvg,
        quizScoreSum: qsum,
        activeWeekId: wkNow,
        weekSprintJoined: wj,
        weekSprintCompleted: wc,
        weekQuizCompletes: wq,
        weekQuizScoreSum: wqsum,
        weeklyProductivityRating: weeklyRating,
        overallProductivityRating: overallRating,
        productivityRank: getProductivityRank(overallRating),
        currentStreak: prevStreak.currentStreak,
        bestStreak: Math.max(prevStreak.bestStreak, (prow as { bestStreak?: number }).bestStreak || 0),
        streakAnchorWeekId: prevStreak.streakAnchorWeekId,
        previousOverallRating: priorOverall,
        ratingDelta: Math.round((overallRating - priorOverall) * 10) / 10,
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );
  });
}
