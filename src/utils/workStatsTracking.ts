/**
 * MST work stats: Physical / Mental / Emotional / Spiritual completion counters
 * stored on `productivityStats/{userId}.workStats` (same doc as sprint/quiz productivity).
 */

import { db } from '../firebase';
import {
  addDoc,
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  type Timestamp as FsTimestamp,
} from 'firebase/firestore';
import {
  ENERGY_TYPES,
  type BattleEnergyType,
  normalizeEnergyType,
} from '../constants/energyTypes';
import { workStatsDebug } from './liveEventDebugLogging';

export const WORK_ENERGY_ORDER: readonly BattleEnergyType[] = [
  ENERGY_TYPES.PHYSICAL,
  ENERGY_TYPES.MENTAL,
  ENERGY_TYPES.EMOTIONAL,
  ENERGY_TYPES.SPIRITUAL,
] as const;

export type WorkStatBucket = {
  completed: number;
  attempted: number;
  pointsEarned: number;
  lastCompletedAt: unknown | null;
};

export type PlayerWorkStats = Record<BattleEnergyType, WorkStatBucket>;

export function emptyWorkStatBucket(): WorkStatBucket {
  return { completed: 0, attempted: 0, pointsEarned: 0, lastCompletedAt: null };
}

export function defaultPlayerWorkStats(): PlayerWorkStats {
  return {
    [ENERGY_TYPES.PHYSICAL]: emptyWorkStatBucket(),
    [ENERGY_TYPES.MENTAL]: emptyWorkStatBucket(),
    [ENERGY_TYPES.EMOTIONAL]: emptyWorkStatBucket(),
    [ENERGY_TYPES.SPIRITUAL]: emptyWorkStatBucket(),
  };
}

export function parseWorkStatsFromDoc(raw: unknown): PlayerWorkStats {
  const out = defaultPlayerWorkStats();
  if (!raw || typeof raw !== 'object') return out;
  const o = raw as Record<string, unknown>;
  for (const k of WORK_ENERGY_ORDER) {
    const b = o[k];
    if (b && typeof b === 'object') {
      const row = b as Record<string, unknown>;
      out[k] = {
        completed: Math.max(0, Number(row.completed) || 0),
        attempted: Math.max(0, Number(row.attempted) || 0),
        pointsEarned: Math.max(0, Number(row.pointsEarned) || 0),
        lastCompletedAt: row.lastCompletedAt ?? null,
      };
    }
  }
  return out;
}

export function workCompletionRatePct(completed: number, attempted: number): number {
  if (!attempted || attempted <= 0) return 0;
  return Math.min(100, Math.round((Math.min(completed, attempted) / attempted) * 1000) / 10);
}

export type WorkStatsSource = 'live_event' | 'assessment';

export type UpdatePlayerWorkStatsParams = {
  userId: string;
  energyType: BattleEnergyType | string;
  attemptedIncrement?: number;
  completedIncrement?: number;
  pointsEarnedIncrement?: number;
  classId?: string;
  playerName?: string;
  source: WorkStatsSource;
  sourceId?: string;
  /** When false, skip writing `workStatsActivityLogs` (e.g. high-frequency retries). */
  logActivity?: boolean;
};

function tsMs(t: unknown): number | null {
  if (t && typeof (t as FsTimestamp).toMillis === 'function') return (t as FsTimestamp).toMillis();
  if (t instanceof Date) return t.getTime();
  return null;
}

/** Latest completion timestamp across the four buckets (for coarse date filtering). */
export function maxWorkStatLastCompletedMs(work: PlayerWorkStats | undefined): number {
  if (!work) return 0;
  let m = 0;
  for (const k of WORK_ENERGY_ORDER) {
    const ms = tsMs(work[k]?.lastCompletedAt);
    if (ms != null && ms > m) m = ms;
  }
  return m;
}

/**
 * Merge increments into `productivityStats/{userId}.workStats` and optionally append an activity log row.
 */
export async function updatePlayerWorkStats(params: UpdatePlayerWorkStatsParams): Promise<void> {
  const {
    userId,
    energyType: energyRaw,
    attemptedIncrement = 0,
    completedIncrement = 0,
    pointsEarnedIncrement = 0,
    classId,
    playerName,
    source,
    sourceId,
    logActivity = true,
  } = params;

  const energyType = normalizeEnergyType(energyRaw as string);

  if (
    attemptedIncrement <= 0 &&
    completedIncrement <= 0 &&
    pointsEarnedIncrement <= 0
  ) {
    return;
  }

  const statsRef = doc(db, 'productivityStats', userId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(statsRef);
    const raw = snap.exists() ? snap.data() : {};
    const existingWork = parseWorkStatsFromDoc((raw as { workStats?: unknown }).workStats);
    const prev = existingWork[energyType] || emptyWorkStatBucket();

    const nextBucket: WorkStatBucket = {
      completed: prev.completed + Math.max(0, Math.floor(completedIncrement)),
      attempted: prev.attempted + Math.max(0, Math.floor(attemptedIncrement)),
      pointsEarned: prev.pointsEarned + Math.max(0, pointsEarnedIncrement),
      lastCompletedAt:
        completedIncrement > 0 ? serverTimestamp() : prev.lastCompletedAt,
    };

    const nextWork: PlayerWorkStats = { ...existingWork, [energyType]: nextBucket };

    tx.set(
      statsRef,
      {
        userId,
        workStats: nextWork,
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );
  });

  workStatsDebug({
    playerId: userId,
    eventId: sourceId ?? source,
    eventType: source,
    inferredEnergyType: energyType,
    attemptedIncrement,
    completedIncrement,
    pointsEarnedIncrement,
    classId: classId ?? '',
  });

  if (!logActivity) return;

  try {
    await addDoc(collection(db, 'workStatsActivityLogs'), {
      playerId: userId,
      playerName: typeof playerName === 'string' ? playerName : '',
      classId: typeof classId === 'string' ? classId : '',
      source,
      sourceId: sourceId ?? '',
      energyType,
      workType: energyType,
      attemptedIncrement: Math.max(0, Math.floor(attemptedIncrement)),
      completedIncrement: Math.max(0, Math.floor(completedIncrement)),
      pointsEarned: Math.max(0, pointsEarnedIncrement),
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[workStatsTracking] activity log', e);
  }
}
