import { db } from '../firebase';
import {
  addDoc,
  collection,
  collectionGroup,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import type { WeeklyGoalDoc, CreateWeeklyGoalInput } from '../types/weeklyGoals';
import {
  MAX_ACTIVE_WEEKLY_GOALS,
  defaultEvidenceForGoalType,
} from '../types/weeklyGoals';
import {
  recomputePercentFromParts,
  completionRateMeetsTarget,
  countMeetsTarget,
  tsToMillis,
  shouldReceiveAutoUpdates,
  isAssignmentWithinSpeedWindow,
} from './weeklyGoalDerived';

const goalsCol = (playerId: string) => collection(db, 'students', playerId, 'weeklyGoals');

export function intervalsOverlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

function parseGoal(id: string, data: Record<string, unknown>): WeeklyGoalDoc | null {
  if (typeof data.playerId !== 'string') return null;
  return {
    id,
    playerId: data.playerId as string,
    title: typeof data.title === 'string' ? data.title : '',
    description: typeof data.description === 'string' ? data.description : '',
    goalType: data.goalType as WeeklyGoalDoc['goalType'],
    evidenceType: data.evidenceType as WeeklyGoalDoc['evidenceType'],
    targetValue: typeof data.targetValue === 'number' ? data.targetValue : 0,
    currentValue: typeof data.currentValue === 'number' ? data.currentValue : 0,
    unitLabel: typeof data.unitLabel === 'string' ? data.unitLabel : '',
    status: data.status as WeeklyGoalDoc['status'],
    verificationStatus: data.verificationStatus as WeeklyGoalDoc['verificationStatus'],
    customEvidenceText: typeof data.customEvidenceText === 'string' ? data.customEvidenceText : undefined,
    customEvidenceNotes: typeof data.customEvidenceNotes === 'string' ? data.customEvidenceNotes : undefined,
    adminFeedback: typeof data.adminFeedback === 'string' ? data.adminFeedback : undefined,
    createdAt: data.createdAt as WeeklyGoalDoc['createdAt'],
    updatedAt: data.updatedAt as WeeklyGoalDoc['updatedAt'],
    weekStartDate: data.weekStartDate as WeeklyGoalDoc['weekStartDate'],
    weekEndDate: data.weekEndDate as WeeklyGoalDoc['weekEndDate'],
    optionalNotes: typeof data.optionalNotes === 'string' ? data.optionalNotes : undefined,
    numerator: typeof data.numerator === 'number' ? data.numerator : undefined,
    denominator: typeof data.denominator === 'number' ? data.denominator : undefined,
    percentValue: typeof data.percentValue === 'number' ? data.percentValue : undefined,
    speedTargetHours: typeof data.speedTargetHours === 'number' ? data.speedTargetHours : undefined,
    qualifyingAssignmentsCompleted:
      typeof data.qualifyingAssignmentsCompleted === 'number' ? data.qualifyingAssignmentsCompleted : undefined,
    totalAssignmentsTracked:
      typeof data.totalAssignmentsTracked === 'number' ? data.totalAssignmentsTracked : undefined,
    participationSessionIds: Array.isArray(data.participationSessionIds)
      ? (data.participationSessionIds as string[])
      : undefined,
  };
}

export async function listWeeklyGoals(playerId: string, max = 80): Promise<WeeklyGoalDoc[]> {
  const q = query(goalsCol(playerId), orderBy('weekStartDate', 'desc'), limit(max));
  const snap = await getDocs(q);
  const out: WeeklyGoalDoc[] = [];
  snap.forEach((d) => {
    const g = parseGoal(d.id, d.data() as Record<string, unknown>);
    if (g) out.push(g);
  });
  return out;
}

export function countOverlappingOpenGoals(
  goals: WeeklyGoalDoc[],
  weekStartMs: number,
  weekEndMs: number
): number {
  return goals.filter((g) => {
    const s = tsToMillis(g.weekStartDate) ?? 0;
    const e = tsToMillis(g.weekEndDate) ?? 0;
    const overlaps = intervalsOverlapMs(weekStartMs, weekEndMs, s, e);
    const open = g.status !== 'achieved' && g.status !== 'missed';
    return overlaps && open;
  }).length;
}

export async function createWeeklyGoal(playerId: string, input: CreateWeeklyGoalInput): Promise<string> {
  const ws = input.weekStartDate.getTime();
  const we = input.weekEndDate.getTime();
  if (!(we > ws)) throw new Error('Week end must be after week start');

  const existing = await listWeeklyGoals(playerId, 80);
  if (countOverlappingOpenGoals(existing, ws, we) >= MAX_ACTIVE_WEEKLY_GOALS) {
    throw new Error(`You can have at most ${MAX_ACTIVE_WEEKLY_GOALS} active weekly goals in the same week window.`);
  }

  const evidence: WeeklyGoalDoc['evidenceType'] =
    input.goalType === 'custom'
      ? 'custom_admin_verified'
      : input.evidenceType ?? defaultEvidenceForGoalType(input.goalType);

  let initialStatus: WeeklyGoalDoc['status'] = 'in_progress';
  let verificationStatus: WeeklyGoalDoc['verificationStatus'] = 'not_required';
  if (input.goalType === 'custom') {
    initialStatus = 'not_started';
    verificationStatus = 'not_required';
  } else if (evidence === 'custom_admin_verified') {
    initialStatus = 'not_started';
    verificationStatus = 'not_required';
  }

  const base: Record<string, unknown> = {
    playerId,
    title: input.title.trim(),
    description: input.description.trim(),
    goalType: input.goalType,
    evidenceType: evidence,
    targetValue: input.targetValue,
    currentValue:
      input.goalType === 'sprint_completion_rate' && evidence === 'tracked_completion_rate'
        ? 0
        : input.goalType === 'live_event_participation' && evidence === 'tracked_participation'
          ? 0
          : input.goalType === 'sprint_assignment_speed' && evidence === 'tracked_completion_speed'
            ? 0
            : 0,
    unitLabel: input.unitLabel.trim(),
    status: initialStatus,
    verificationStatus,
    weekStartDate: Timestamp.fromDate(input.weekStartDate),
    weekEndDate: Timestamp.fromDate(input.weekEndDate),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (input.optionalNotes?.trim()) base.optionalNotes = input.optionalNotes.trim();

  if (input.goalType === 'sprint_completion_rate' && evidence === 'tracked_completion_rate') {
    base.numerator = 0;
    base.denominator = 0;
    base.percentValue = 0;
  }
  if (input.goalType === 'sprint_assignment_speed' && evidence === 'tracked_completion_speed') {
    base.speedTargetHours =
      typeof input.speedTargetHours === 'number' && input.speedTargetHours > 0 ? input.speedTargetHours : 24;
    base.qualifyingAssignmentsCompleted = 0;
    base.totalAssignmentsTracked = 0;
  }
  if (input.goalType === 'live_event_participation' && evidence === 'tracked_participation') {
    base.participationSessionIds = [];
  }

  const ref = await addDoc(goalsCol(playerId), base);
  return ref.id;
}

export function subscribeWeeklyGoals(
  playerId: string,
  onGoals: (goals: WeeklyGoalDoc[]) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  const q = query(goalsCol(playerId), orderBy('weekStartDate', 'desc'), limit(80));
  return onSnapshot(
    q,
    (snap) => {
      const out: WeeklyGoalDoc[] = [];
      snap.forEach((d) => {
        const g = parseGoal(d.id, d.data() as Record<string, unknown>);
        if (g) out.push(g);
      });
      onGoals(out);
    },
    (err) => onError?.(err as Error)
  );
}

async function updateGoalDoc(playerId: string, goalId: string, patch: Record<string, unknown>): Promise<void> {
  const ref = doc(db, 'students', playerId, 'weeklyGoals', goalId);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
}

function nextStatusForTracked(goal: WeeklyGoalDoc, achieved: boolean): WeeklyGoalDoc['status'] {
  if (achieved) return 'achieved';
  if (goal.status === 'achieved' || goal.status === 'missed') return goal.status;
  if (goal.status === 'not_started') return 'in_progress';
  return 'in_progress';
}

/** After sprint starts: count sprint opportunities for completion-rate and speed goals. */
export async function recordSprintOpportunityForPlayers(
  playerUids: string[],
  _sessionId: string
): Promise<void> {
  const nowMs = Date.now();
  for (const uid of playerUids) {
    const goals = await listWeeklyGoals(uid, 80);
    for (const g of goals) {
      if (!shouldReceiveAutoUpdates(g, nowMs)) continue;
      if (g.goalType === 'sprint_completion_rate' && g.evidenceType === 'tracked_completion_rate') {
        const denominator = (g.denominator ?? 0) + 1;
        const numerator = g.numerator ?? 0;
        const percentValue = recomputePercentFromParts(numerator, denominator);
        const achieved = completionRateMeetsTarget(percentValue, g.targetValue);
        await updateGoalDoc(uid, g.id, {
          denominator,
          percentValue,
          currentValue: percentValue,
          status: nextStatusForTracked(g, achieved),
        });
      } else if (g.goalType === 'sprint_assignment_speed' && g.evidenceType === 'tracked_completion_speed') {
        const total = (g.totalAssignmentsTracked ?? 0) + 1;
        await updateGoalDoc(uid, g.id, {
          totalAssignmentsTracked: total,
          status: g.status === 'not_started' ? 'in_progress' : g.status,
        });
      }
    }
  }
}

/** After host marks a player complete on a sprint. */
export async function recordSprintMarkedCompleteForPlayer(
  playerUid: string,
  sprintStartedAtMs: number,
  completedAtMs: number
): Promise<void> {
  const nowMs = Date.now();
  const goals = await listWeeklyGoals(playerUid, 80);
  for (const g of goals) {
    if (!shouldReceiveAutoUpdates(g, nowMs)) continue;
    if (g.goalType === 'sprint_completion_rate' && g.evidenceType === 'tracked_completion_rate') {
      const numerator = (g.numerator ?? 0) + 1;
      const denominator = Math.max(g.denominator ?? 0, numerator);
      const percentValue = recomputePercentFromParts(numerator, denominator);
      const achieved = completionRateMeetsTarget(percentValue, g.targetValue);
      await updateGoalDoc(playerUid, g.id, {
        numerator,
        denominator,
        percentValue,
        currentValue: percentValue,
        status: nextStatusForTracked(g, achieved),
      });
    } else if (g.goalType === 'sprint_assignment_speed' && g.evidenceType === 'tracked_completion_speed') {
      const hours = g.speedTargetHours && g.speedTargetHours > 0 ? g.speedTargetHours : 24;
      const within = isAssignmentWithinSpeedWindow(sprintStartedAtMs, completedAtMs, hours);
      if (!within) continue;
      const qn = (g.qualifyingAssignmentsCompleted ?? 0) + 1;
      const achieved = countMeetsTarget(qn, g.targetValue);
      await updateGoalDoc(playerUid, g.id, {
        qualifyingAssignmentsCompleted: qn,
        currentValue: qn,
        status: nextStatusForTracked(g, achieved),
      });
    }
  }
}

/** First-time join to a live session in the week counts as one participation. */
export async function recordLiveEventParticipationForPlayer(
  playerUid: string,
  sessionId: string
): Promise<void> {
  const nowMs = Date.now();
  const goals = await listWeeklyGoals(playerUid, 80);
  for (const g of goals) {
    if (!shouldReceiveAutoUpdates(g, nowMs)) continue;
    if (g.goalType !== 'live_event_participation' || g.evidenceType !== 'tracked_participation') continue;
    const prev = g.participationSessionIds ?? [];
    if (prev.includes(sessionId)) continue;
    const participationSessionIds = [...prev, sessionId];
    const currentValue = participationSessionIds.length;
    const achieved = countMeetsTarget(currentValue, g.targetValue);
    await updateGoalDoc(playerUid, g.id, {
      participationSessionIds,
      currentValue,
      status: nextStatusForTracked(g, achieved),
    });
  }
}

export async function submitCustomEvidence(
  playerId: string,
  goalId: string,
  evidenceText: string,
  evidenceNotes?: string
): Promise<void> {
  const ref = doc(db, 'students', playerId, 'weeklyGoals', goalId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Goal not found');
  const g = parseGoal(goalId, snap.data() as Record<string, unknown>);
  if (!g || g.playerId !== playerId) throw new Error('Goal not found');
  if (g.goalType !== 'custom' || g.evidenceType !== 'custom_admin_verified') {
    throw new Error('This goal does not use custom evidence');
  }
  await updateDoc(ref, {
    customEvidenceText: evidenceText.trim(),
    customEvidenceNotes: evidenceNotes?.trim() || '',
    verificationStatus: 'pending_admin_review',
    status: 'in_progress',
    updatedAt: serverTimestamp(),
  });
}

export async function adminSetWeeklyGoalVerification(input: {
  playerId: string;
  goalId: string;
  decision: 'verified' | 'rejected';
  feedback?: string;
}): Promise<void> {
  const ref = doc(db, 'students', input.playerId, 'weeklyGoals', input.goalId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Goal not found');
  if (!parseGoal(input.goalId, snap.data() as Record<string, unknown>)) throw new Error('Goal not found');

  const fb = input.feedback?.trim();
  const feedbackPatch = fb ? { adminFeedback: fb } : { adminFeedback: deleteField() };

  if (input.decision === 'verified') {
    await updateDoc(ref, {
      verificationStatus: 'verified',
      status: 'achieved',
      ...feedbackPatch,
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(ref, {
      verificationStatus: 'rejected',
      status: 'missed',
      ...feedbackPatch,
      updatedAt: serverTimestamp(),
    });
  }
}

/** Pending custom goals across all students (admin UI). */
export async function listPendingCustomWeeklyGoalsForAdmin(max = 100): Promise<WeeklyGoalDoc[]> {
  const q = query(
    collectionGroup(db, 'weeklyGoals'),
    where('verificationStatus', '==', 'pending_admin_review'),
    limit(max)
  );
  const snap = await getDocs(q);
  const out: WeeklyGoalDoc[] = [];
  snap.forEach((d) => {
    const g = parseGoal(d.id, d.data() as Record<string, unknown>);
    if (g) out.push(g);
  });
  out.sort((a, b) => (tsToMillis(b.weekStartDate) ?? 0) - (tsToMillis(a.weekStartDate) ?? 0));
  return out;
}
