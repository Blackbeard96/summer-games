/**
 * Work Board Firestore service — Work items, periods, declarations, completions.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
  Timestamp,
  type QueryConstraint,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  WorkCompletion,
  WorkCompletionStatus,
  WorkDeclaration,
  WorkItem,
  WorkItemStatus,
  WorkPeriod,
} from '../types/workBoard';
import {
  buildWorkPeriodProgress,
  computeWorkBoardTotals,
  type WorkBoardTotals,
  type WorkPeriodProgress,
} from '../types/workBoard';
import { ENERGY_TYPES, type BattleEnergyType } from '../constants/energyTypes';
import { updatePlayerWorkStats } from './workStatsTracking';
import { adjustPlayerPowerPoints } from './playerPowerPoints';
import type { LiveEventWorkSummary } from '../types/inSessionStats';

const WORK_ITEMS = 'workItems';
const WORK_PERIODS = 'workPeriods';
const WORK_DECLARATIONS = 'workDeclarations';
const WORK_COMPLETIONS = 'workCompletions';

function workCompletionDocId(workId: string, studentId: string): string {
  return `${workId}_${studentId}`;
}

function workDeclarationDocId(periodId: string, studentId: string): string {
  return `${periodId}_${studentId}`;
}

function asDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as { toDate?: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate();
  }
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseWorkItem(id: string, raw: Record<string, unknown>): WorkItem {
  const energies = Array.isArray(raw.energyTypes)
    ? (raw.energyTypes as string[])
        .map((e) => e as BattleEnergyType)
        .filter((e) => Object.values(ENERGY_TYPES).includes(e))
    : [];
  return {
    id,
    title: String(raw.title || ''),
    description: String(raw.description || ''),
    classId: String(raw.classId || ''),
    className: raw.className ? String(raw.className) : undefined,
    scope: (raw.scope as WorkItem['scope']) || 'day',
    periodId: (raw.periodId as string) || null,
    category: (raw.category as WorkItem['category']) || 'academic',
    required: Boolean(raw.required),
    wValue: Math.max(0, Number(raw.wValue) || 0),
    ppReward: Math.max(0, Math.floor(Number(raw.ppReward) || 0)),
    dueAt: (raw.dueAt as Timestamp) || null,
    relatedSkillIds: Array.isArray(raw.relatedSkillIds)
      ? (raw.relatedSkillIds as string[]).map(String)
      : [],
    relatedGoalId: (raw.relatedGoalId as string) || null,
    relatedProjectId: (raw.relatedProjectId as string) || null,
    completionMode: (raw.completionMode as WorkItem['completionMode']) || 'manual_student',
    completionSourceId: (raw.completionSourceId as string) || null,
    energyTypes: energies.length ? energies : [ENERGY_TYPES.MENTAL],
    status: (raw.status as WorkItemStatus) || 'draft',
    createdBy: String(raw.createdBy || ''),
    createdAt: (raw.createdAt as Timestamp) || null,
    updatedAt: (raw.updatedAt as Timestamp) || null,
    seasonId: (raw.seasonId as string) || null,
    weekKey: (raw.weekKey as string) || null,
  };
}

export async function createWorkItem(
  input: Omit<WorkItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<string> {
  const ref = input.id ? doc(db, WORK_ITEMS, input.id) : doc(collection(db, WORK_ITEMS));
  const {
    id: _ignore,
    title,
    description,
    classId,
    className,
    scope,
    periodId,
    category,
    required,
    wValue,
    ppReward,
    dueAt,
    relatedSkillIds,
    relatedGoalId,
    relatedProjectId,
    completionMode,
    completionSourceId,
    energyTypes,
    status,
    createdBy,
    seasonId,
    weekKey,
  } = input;
  await setDoc(ref, {
    id: ref.id,
    title,
    description,
    classId,
    className: className || null,
    scope,
    periodId: periodId || null,
    category,
    required: Boolean(required),
    wValue: Math.max(0, Number(wValue) || 0),
    ppReward: Math.max(0, Math.floor(Number(ppReward) || 0)),
    dueAt: dueAt || null,
    relatedSkillIds: relatedSkillIds || [],
    relatedGoalId: relatedGoalId || null,
    relatedProjectId: relatedProjectId || null,
    completionMode,
    completionSourceId: completionSourceId || null,
    energyTypes: energyTypes?.length ? energyTypes : [ENERGY_TYPES.MENTAL],
    status,
    createdBy,
    seasonId: seasonId || null,
    weekKey: weekKey || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateWorkItem(
  workId: string,
  patch: Partial<WorkItem>
): Promise<void> {
  const { id: _id, createdAt: _c, ...rest } = patch;
  await updateDoc(doc(db, WORK_ITEMS, workId), {
    ...rest,
    updatedAt: serverTimestamp(),
  });
}

export async function listWorkItemsForClass(
  classId: string,
  opts?: { status?: WorkItemStatus | WorkItemStatus[]; periodId?: string | null }
): Promise<WorkItem[]> {
  const constraints: QueryConstraint[] = [where('classId', '==', classId)];
  if (opts?.periodId) constraints.push(where('periodId', '==', opts.periodId));
  const snap = await getDocs(query(collection(db, WORK_ITEMS), ...constraints));
  let items = snap.docs.map((d) => parseWorkItem(d.id, d.data() as Record<string, unknown>));
  if (opts?.status) {
    const allowed = new Set(Array.isArray(opts.status) ? opts.status : [opts.status]);
    items = items.filter((i) => allowed.has(i.status));
  }
  return items.sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
}

export async function createWorkPeriod(
  input: Omit<WorkPeriod, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): Promise<string> {
  const ref = input.id ? doc(db, WORK_PERIODS, input.id) : doc(collection(db, WORK_PERIODS));
  await setDoc(ref, {
    ...input,
    id: ref.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateWorkPeriod(
  periodId: string,
  patch: Partial<WorkPeriod>
): Promise<void> {
  const { id: _id, createdAt: _c, ...rest } = patch;
  await updateDoc(doc(db, WORK_PERIODS, periodId), {
    ...rest,
    updatedAt: serverTimestamp(),
  });
}

export async function listWorkPeriodsForClass(classId: string): Promise<WorkPeriod[]> {
  const snap = await getDocs(
    query(collection(db, WORK_PERIODS), where('classId', '==', classId))
  );
  return snap.docs
    .map((d) => {
      const raw = d.data() as Record<string, unknown>;
      return {
        id: d.id,
        title: String(raw.title || ''),
        classId: String(raw.classId || ''),
        className: raw.className ? String(raw.className) : undefined,
        scope: (raw.scope as WorkPeriod['scope']) || 'day',
        startsAt: (raw.startsAt as Timestamp) || Timestamp.now(),
        endsAt: (raw.endsAt as Timestamp) || Timestamp.now(),
        status: (raw.status as WorkPeriod['status']) || 'upcoming',
        liveEventSessionId: (raw.liveEventSessionId as string) || null,
        createdBy: String(raw.createdBy || ''),
        createdAt: (raw.createdAt as Timestamp) || null,
        updatedAt: (raw.updatedAt as Timestamp) || null,
      } satisfies WorkPeriod;
    })
    .sort((a, b) => {
      const as = asDate(a.startsAt)?.getTime() || 0;
      const bs = asDate(b.startsAt)?.getTime() || 0;
      return bs - as;
    });
}

export async function declareExpectedW(args: {
  periodId: string;
  studentId: string;
  classId: string;
  declaredW: number;
  requiredWAtDeclaration: number;
  availableWAtDeclaration: number;
  note?: string;
}): Promise<void> {
  const id = workDeclarationDocId(args.periodId, args.studentId);
  const declaredW = Math.max(0, Math.floor(Number(args.declaredW) || 0));
  const existing = await getDoc(doc(db, WORK_DECLARATIONS, id));
  const payload = {
    id,
    periodId: args.periodId,
    studentId: args.studentId,
    classId: args.classId,
    declaredW,
    requiredWAtDeclaration: Math.max(0, Number(args.requiredWAtDeclaration) || 0),
    availableWAtDeclaration: Math.max(0, Number(args.availableWAtDeclaration) || 0),
    note: args.note || '',
    updatedAt: serverTimestamp(),
  };
  if (!existing.exists()) {
    await setDoc(doc(db, WORK_DECLARATIONS, id), {
      ...payload,
      declaredAt: serverTimestamp(),
    });
  } else {
    await updateDoc(doc(db, WORK_DECLARATIONS, id), payload);
  }
}

export async function getWorkDeclaration(
  periodId: string,
  studentId: string
): Promise<WorkDeclaration | null> {
  const id = workDeclarationDocId(periodId, studentId);
  const snap = await getDoc(doc(db, WORK_DECLARATIONS, id));
  if (!snap.exists()) return null;
  const raw = snap.data() as Record<string, unknown>;
  return {
    id,
    periodId: String(raw.periodId || periodId),
    studentId: String(raw.studentId || studentId),
    classId: String(raw.classId || ''),
    declaredW: Math.max(0, Number(raw.declaredW) || 0),
    requiredWAtDeclaration: Math.max(0, Number(raw.requiredWAtDeclaration) || 0),
    availableWAtDeclaration: Math.max(0, Number(raw.availableWAtDeclaration) || 0),
    note: raw.note ? String(raw.note) : undefined,
    declaredAt: (raw.declaredAt as Timestamp) || null,
    updatedAt: (raw.updatedAt as Timestamp) || null,
  };
}

export async function listDeclarationsForPeriod(periodId: string): Promise<WorkDeclaration[]> {
  const snap = await getDocs(
    query(collection(db, WORK_DECLARATIONS), where('periodId', '==', periodId))
  );
  return snap.docs.map((d) => {
    const raw = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      periodId: String(raw.periodId || periodId),
      studentId: String(raw.studentId || ''),
      classId: String(raw.classId || ''),
      declaredW: Math.max(0, Number(raw.declaredW) || 0),
      requiredWAtDeclaration: Math.max(0, Number(raw.requiredWAtDeclaration) || 0),
      availableWAtDeclaration: Math.max(0, Number(raw.availableWAtDeclaration) || 0),
      note: raw.note ? String(raw.note) : undefined,
      declaredAt: (raw.declaredAt as Timestamp) || null,
      updatedAt: (raw.updatedAt as Timestamp) || null,
    };
  });
}

export async function getWorkCompletion(
  workId: string,
  studentId: string
): Promise<WorkCompletion | null> {
  const id = workCompletionDocId(workId, studentId);
  const snap = await getDoc(doc(db, WORK_COMPLETIONS, id));
  if (!snap.exists()) return null;
  return parseWorkCompletion(id, snap.data() as Record<string, unknown>);
}

function parseWorkCompletion(id: string, raw: Record<string, unknown>): WorkCompletion {
  return {
    id,
    workId: String(raw.workId || ''),
    studentId: String(raw.studentId || ''),
    classId: String(raw.classId || ''),
    status: (raw.status as WorkCompletionStatus) || 'not_started',
    wAwarded: Math.max(0, Number(raw.wAwarded) || 0),
    ppAwarded: Math.max(0, Number(raw.ppAwarded) || 0),
    submittedAt: (raw.submittedAt as Timestamp) || null,
    verifiedAt: (raw.verifiedAt as Timestamp) || null,
    verifiedBy: (raw.verifiedBy as string) || null,
    rejectionNote: (raw.rejectionNote as string) || null,
    autoSource: (raw.autoSource as string) || null,
    evidence: (raw.evidence as string) || null,
    updatedAt: (raw.updatedAt as Timestamp) || null,
  };
}

export async function listCompletionsForStudent(
  studentId: string,
  classId?: string
): Promise<WorkCompletion[]> {
  const constraints: QueryConstraint[] = [where('studentId', '==', studentId)];
  if (classId) constraints.push(where('classId', '==', classId));
  const snap = await getDocs(query(collection(db, WORK_COMPLETIONS), ...constraints));
  return snap.docs.map((d) => parseWorkCompletion(d.id, d.data() as Record<string, unknown>));
}

export async function listCompletionsForClass(classId: string): Promise<WorkCompletion[]> {
  const snap = await getDocs(
    query(collection(db, WORK_COMPLETIONS), where('classId', '==', classId))
  );
  return snap.docs.map((d) => parseWorkCompletion(d.id, d.data() as Record<string, unknown>));
}

/**
 * Student marks Work complete (or submits for admin verification).
 * manual_admin → submitted; manual_student → verified immediately.
 */
export async function submitWorkCompletion(args: {
  work: WorkItem;
  studentId: string;
  evidence?: string;
}): Promise<WorkCompletion> {
  const { work, studentId, evidence } = args;
  const id = workCompletionDocId(work.id, studentId);
  const needsAdmin = work.completionMode === 'manual_admin';
  const status: WorkCompletionStatus = needsAdmin ? 'submitted' : 'verified';
  const wAwarded = Math.max(0, Number(work.wValue) || 0);
  const ppAwarded =
    status === 'verified' ? Math.max(0, Math.floor(Number(work.ppReward) || 0)) : 0;

  const completion: WorkCompletion = {
    id,
    workId: work.id,
    studentId,
    classId: work.classId,
    status,
    wAwarded: status === 'verified' ? wAwarded : 0,
    ppAwarded,
    submittedAt: new Date(),
    verifiedAt: status === 'verified' ? new Date() : null,
    verifiedBy: status === 'verified' ? studentId : null,
    evidence: evidence || null,
    updatedAt: new Date(),
  };

  await setDoc(
    doc(db, WORK_COMPLETIONS, id),
    {
      ...completion,
      submittedAt: serverTimestamp(),
      verifiedAt: status === 'verified' ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  if (status === 'verified') {
    await applyVerifiedWorkSideEffects(work, studentId, wAwarded, ppAwarded);
  }

  return completion;
}

/** Admin verifies or rejects a submitted Work completion. */
export async function adminSetWorkCompletion(args: {
  work: WorkItem;
  studentId: string;
  status: 'verified' | 'rejected' | 'waived';
  adminUid: string;
  rejectionNote?: string;
}): Promise<void> {
  const { work, studentId, status, adminUid, rejectionNote } = args;
  const id = workCompletionDocId(work.id, studentId);
  const existing = await getWorkCompletion(work.id, studentId);
  if (existing?.status === 'verified' && status === 'verified') return;

  const wAwarded = status === 'verified' ? Math.max(0, Number(work.wValue) || 0) : 0;
  const ppAwarded =
    status === 'verified' ? Math.max(0, Math.floor(Number(work.ppReward) || 0)) : 0;

  await setDoc(
    doc(db, WORK_COMPLETIONS, id),
    {
      id,
      workId: work.id,
      studentId,
      classId: work.classId,
      status,
      wAwarded,
      ppAwarded,
      verifiedAt: serverTimestamp(),
      verifiedBy: adminUid,
      rejectionNote: rejectionNote || null,
      updatedAt: serverTimestamp(),
      submittedAt: existing?.submittedAt || serverTimestamp(),
    },
    { merge: true }
  );

  if (status === 'verified') {
    await applyVerifiedWorkSideEffects(work, studentId, wAwarded, ppAwarded);
  }
}

async function applyVerifiedWorkSideEffects(
  work: WorkItem,
  studentId: string,
  wAwarded: number,
  ppAwarded: number
): Promise<void> {
  for (const energy of work.energyTypes?.length ? work.energyTypes : [ENERGY_TYPES.MENTAL]) {
    try {
      await updatePlayerWorkStats({
        userId: studentId,
        energyType: energy,
        attemptedIncrement: 1,
        completedIncrement: 1,
        pointsEarnedIncrement: wAwarded,
        source: 'assessment',
        sourceId: `work:${work.id}`,
      });
    } catch (e) {
      console.warn('[workBoard] workStats update failed', e);
    }
  }
  if (ppAwarded > 0) {
    try {
      await adjustPlayerPowerPoints(studentId, ppAwarded, {
        sourceType: 'workBoard',
        sourceId: `work:${work.id}`,
        notes: `Work Board: ${work.title || work.id}`,
      });
    } catch (e) {
      console.warn('[workBoard] PP reward failed (may need self-claim / staff)', e);
    }
  }
}

export async function getStudentWorkBoard(args: {
  classId: string;
  studentId: string;
  periodId?: string | null;
}): Promise<{
  items: WorkItem[];
  completions: Record<string, WorkCompletion>;
  totals: WorkBoardTotals;
  required: WorkItem[];
  optional: WorkItem[];
  completed: WorkItem[];
}> {
  const items = await listWorkItemsForClass(args.classId, {
    status: 'active',
    periodId: args.periodId,
  });
  const allCompletions = await listCompletionsForStudent(args.studentId, args.classId);
  const completions: Record<string, WorkCompletion> = {};
  for (const c of allCompletions) {
    if (items.some((i) => i.id === c.workId)) completions[c.workId] = c;
  }
  const totals = computeWorkBoardTotals(items, completions);
  const isDone = (id: string) => {
    const s = completions[id]?.status;
    return s === 'verified' || s === 'submitted';
  };
  return {
    items,
    completions,
    totals,
    required: items.filter((i) => i.required && !isDone(i.id)),
    optional: items.filter((i) => !i.required && !isDone(i.id)),
    completed: items.filter((i) => isDone(i.id)),
  };
}

export async function getStudentPeriodProgress(args: {
  periodId: string;
  studentId: string;
  classId: string;
}): Promise<WorkPeriodProgress> {
  const board = await getStudentWorkBoard({
    classId: args.classId,
    studentId: args.studentId,
    periodId: args.periodId,
  });
  const decl = await getWorkDeclaration(args.periodId, args.studentId);
  return buildWorkPeriodProgress({
    periodId: args.periodId,
    studentId: args.studentId,
    declaredW: decl?.declaredW ?? 0,
    totals: board.totals,
  });
}

/**
 * Snapshot Work Board progress for a Live Event session summary.
 * Prefer gameTime.workPeriodId, else a period linked to this session, else the class's open period.
 */
export async function buildLiveEventWorkSummary(args: {
  sessionId: string;
  classId?: string | null;
  workPeriodId?: string | null;
  players: Array<{ userId: string; displayName?: string; classId?: string | null }>;
}): Promise<LiveEventWorkSummary | null> {
  const players = (args.players || []).filter((p) => p?.userId);
  if (players.length === 0) return null;

  const classIds = Array.from(
    new Set(
      [
        args.classId,
        ...players.map((p) => p.classId),
      ]
        .map((c) => (typeof c === 'string' ? c.trim() : ''))
        .filter(Boolean)
    )
  );
  if (classIds.length === 0) return null;

  let periodId = typeof args.workPeriodId === 'string' ? args.workPeriodId.trim() : '';
  let periodTitle: string | null = null;

  if (!periodId) {
    for (const classId of classIds) {
      try {
        const periods = await listWorkPeriodsForClass(classId);
        const linked = periods.find((p) => p.liveEventSessionId === args.sessionId);
        const open = periods.find((p) => p.status === 'open');
        const pick = linked || open || periods[0];
        if (pick) {
          periodId = pick.id;
          periodTitle = pick.title || null;
          break;
        }
      } catch (e) {
        console.warn('[workBoard] listWorkPeriodsForClass failed', classId, e);
      }
    }
  } else {
    try {
      const snap = await getDoc(doc(db, WORK_PERIODS, periodId));
      if (snap.exists()) {
        periodTitle = String((snap.data() as { title?: string }).title || '') || null;
      }
    } catch {
      /* ignore */
    }
  }

  const byPlayer: LiveEventWorkSummary['byPlayer'] = [];
  let availableW = 0;
  let completedW = 0;
  let requiredAvailableW = 0;
  let requiredCompletedW = 0;

  for (const p of players) {
    const classId =
      (typeof p.classId === 'string' && p.classId.trim()) ||
      (typeof args.classId === 'string' && args.classId.trim()) ||
      classIds[0];
    if (!classId) continue;
    try {
      const board = await getStudentWorkBoard({
        classId,
        studentId: p.userId,
        periodId: periodId || null,
      });
      const decl = periodId ? await getWorkDeclaration(periodId, p.userId) : null;
      const avail = Math.max(0, board.totals.totalWAvailable || 0);
      const done = Math.max(0, board.totals.completedW || 0);
      const reqAvail = Math.max(0, board.totals.requiredW || 0);
      const reqDone = Math.max(0, board.totals.requiredCompletedW || 0);
      const pct = avail > 0 ? Math.round((done / avail) * 1000) / 10 : 0;
      availableW += avail;
      completedW += done;
      requiredAvailableW += reqAvail;
      requiredCompletedW += reqDone;
      byPlayer.push({
        playerId: p.userId,
        playerName: p.displayName || 'Player',
        availableW: avail,
        completedW: done,
        declaredW: Math.max(0, Number(decl?.declaredW) || 0),
        completionPct: pct,
      });
    } catch (e) {
      console.warn('[workBoard] live event work summary player failed', p.userId, e);
    }
  }

  if (byPlayer.length === 0 && availableW === 0 && completedW === 0) {
    return null;
  }

  byPlayer.sort((a, b) => b.completedW - a.completedW || a.playerName.localeCompare(b.playerName));

  return {
    periodId: periodId || null,
    periodTitle,
    availableW,
    completedW,
    completionPct: availableW > 0 ? Math.round((completedW / availableW) * 1000) / 10 : 0,
    requiredAvailableW,
    requiredCompletedW,
    requiredCompletionPct:
      requiredAvailableW > 0
        ? Math.round((requiredCompletedW / requiredAvailableW) * 1000) / 10
        : 0,
    byPlayer,
  };
}

