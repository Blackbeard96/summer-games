/**
 * Class Flow Sprint Management — Firestore layer.
 *
 * Collections (all additive):
 *  classFlowWorkLibrary/{id}                         admin Work Library
 *  inSessionRooms/{sid}.classFlowConfig              feature flags + sprint plan
 *  inSessionRooms/{sid}/cfSprints/{sprintId}         sprint archive (for analytics / history)
 *  inSessionRooms/{sid}/cfSubmissions/{sprint__assignment__uid}
 *  inSessionRooms/{sid}/cfTeams/{teamId}             event-scoped team names / manual teams
 *  inSessionRooms/{sid}/cfTables/{uid}               event-scoped table numbers
 *  inSessionRooms/{sid}/cfSharing/{sprint__team}     credit sharing votes + facilitator decision
 *  inSessionRooms/{sid}/cfAllocations/{sprint__uid}  computed reward breakdown
 *  inSessionRooms/{sid}/cfPayouts/{payoutId}         immutable payout; the student claims it
 */
import { db } from '../firebase';
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { storage } from '../firebase';
import type {
  CfAllocation,
  CfAuditEntry,
  CfConfig,
  CfEvidence,
  CfPayout,
  CfSharingDecision,
  CfSprintAssignment,
  CfSprintPlanItem,
  CfSubmission,
  CfSubmissionMethod,
  CfSubmissionStatus,
  CfWorkAssignment,
  CfAssignmentStatus,
  CfGrouping,
} from '../types/classFlowWork';
import {
  allocationDocId,
  parseSprintAssignments,
  parseWorkAssignment,
  sharingDocId,
  submissionDocId,
} from './classFlowConfig';
import type { CfRewardResult } from './classFlowRewards';
import { startClassFlowSprint, closeClassFlowSprint } from './liveEventSprintService';
import { applyPlayerPPDelta } from './playerPowerPoints';
import { mirrorProfileXpToProgressionSystems } from './playerProgressionRewards';

type Result<T = void> = { ok: true; value?: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : String(e),
});

const room = (sid: string) => doc(db, 'inSessionRooms', sid);
const sub = (sid: string, name: string) => collection(db, 'inSessionRooms', sid, name);
const subDoc = (sid: string, name: string, id: string) => doc(db, 'inSessionRooms', sid, name, id);

/** Strip undefined (Firestore rejects it) from shallow objects. */
function clean<T extends Record<string, unknown>>(o: T): T {
  const out: Record<string, unknown> = {};
  Object.entries(o).forEach(([k, v]) => {
    if (v !== undefined) out[k] = v;
  });
  return out as T;
}

/* ------------------------------- Work Library ------------------------------ */

export function subscribeWorkLibrary(cb: (items: CfWorkAssignment[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    collection(db, 'classFlowWorkLibrary'),
    (snap) => {
      const items = snap.docs.map((d) => parseWorkAssignment(d.id, d.data()));
      items.sort((a, b) => a.title.localeCompare(b.title));
      cb(items);
    },
    (e) => onError?.(e)
  );
}

export async function saveWorkAssignment(
  item: Omit<CfWorkAssignment, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> & { id?: string },
  actingUid: string
): Promise<Result<string>> {
  try {
    const { id, ...rest } = item;
    const data = clean({
      ...rest,
      bonus: clean({ ...rest.bonus }),
      title: rest.title.trim(),
      updatedAt: serverTimestamp(),
    });
    if (!data.title) return { ok: false, error: 'Title is required' };
    if (id) {
      await updateDoc(doc(db, 'classFlowWorkLibrary', id), data);
      return { ok: true, value: id };
    }
    const created = await addDoc(collection(db, 'classFlowWorkLibrary'), {
      ...data,
      createdBy: actingUid,
      createdAt: serverTimestamp(),
    });
    return { ok: true, value: created.id };
  } catch (e) {
    return fail(e);
  }
}

export async function setWorkAssignmentStatus(id: string, status: CfAssignmentStatus): Promise<Result> {
  try {
    await updateDoc(doc(db, 'classFlowWorkLibrary', id), { status, updatedAt: serverTimestamp() });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteWorkAssignment(id: string): Promise<Result> {
  try {
    await deleteDoc(doc(db, 'classFlowWorkLibrary', id));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------------- Config --------------------------------- */

export async function updateCfConfig(sessionId: string, patch: Partial<CfConfig>): Promise<Result> {
  try {
    const update: Record<string, unknown> = { updatedAt: serverTimestamp() };
    Object.entries(patch).forEach(([k, v]) => {
      if (v !== undefined) update[`classFlowConfig.${k}`] = v;
    });
    await updateDoc(room(sessionId), update as DocumentData);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export function newPlanItem(index: number): CfSprintPlanItem {
  return {
    planId: `plan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    title: `Sprint ${index + 1}`,
    objective: '',
    durationMinutes: 15,
    assignments: [],
  };
}

/* --------------------------------- Sprints -------------------------------- */

export interface CfActor {
  uid: string;
  email?: string;
  displayName?: string;
}

/** Starts a sprint from a plan item using the existing Class Flow sprint (legacy PP/XP rewards stay at 0). */
export async function startPlannedSprint(
  sessionId: string,
  actor: CfActor,
  plan: CfSprintPlanItem,
  nowMs: number
): Promise<Result<string>> {
  const res = await startClassFlowSprint(sessionId, actor.uid, actor.email, actor.displayName, {
    title: plan.title,
    description: plan.objective,
    durationSeconds: plan.durationMinutes * 60,
    rewardParticipationPoints: 1,
    rewardVaultPP: 0,
    rewardXP: 0,
    incompletePenaltyVaultPP: 0,
    objective: plan.objective,
    planId: plan.planId,
    assignments: plan.assignments,
    nowMs,
  });
  if (!res.ok || !res.sprintId) return { ok: false, error: res.error || 'Could not start sprint' };
  try {
    await setDoc(subDoc(sessionId, 'cfSprints', res.sprintId), {
      sprintId: res.sprintId,
      planId: plan.planId,
      title: plan.title,
      objective: plan.objective,
      durationSeconds: plan.durationMinutes * 60,
      assignments: plan.assignments,
      startedAtMs: nowMs,
      status: 'live',
      startedBy: actor.uid,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[classFlow] sprint archive write failed', e);
  }
  return { ok: true, value: res.sprintId };
}

export async function endPlannedSprint(sessionId: string, actor: CfActor, sprintId: string): Promise<Result> {
  const res = await closeClassFlowSprint(sessionId, actor.uid, actor.email, actor.displayName);
  if (!res.ok) return { ok: false, error: res.error || 'Could not end sprint' };
  try {
    await setDoc(
      subDoc(sessionId, 'cfSprints', sprintId),
      { status: 'closed', endedAtMs: Date.now(), endedBy: actor.uid },
      { merge: true }
    );
  } catch {
    /* archive is best-effort */
  }
  return { ok: true };
}

export interface CfSprintArchive {
  sprintId: string;
  planId: string | null;
  title: string;
  objective: string;
  assignments: CfSprintAssignment[];
  startedAtMs: number;
  status: 'live' | 'closed' | 'finalized';
  finalizedAtMs?: number;
}

export function subscribeSprintArchive(sessionId: string, cb: (rows: CfSprintArchive[]) => void) {
  return onSnapshot(
    sub(sessionId, 'cfSprints'),
    (snap) => {
      const rows = snap.docs.map((d) => ({ ...(d.data() as CfSprintArchive), sprintId: d.id }));
      rows.sort((a, b) => (a.startedAtMs || 0) - (b.startedAtMs || 0));
      cb(rows);
    },
    () => cb([])
  );
}

/* ------------------------------- Submissions ------------------------------- */

function parseSubmission(id: string, raw: Record<string, unknown>): CfSubmission {
  return {
    id,
    sprintId: String(raw.sprintId || ''),
    assignmentId: String(raw.assignmentId || ''),
    assignmentTitle: String(raw.assignmentTitle || ''),
    playerId: String(raw.playerId || ''),
    playerName: String(raw.playerName || 'Player'),
    teamId: typeof raw.teamId === 'string' ? raw.teamId : null,
    teamName: typeof raw.teamName === 'string' ? raw.teamName : null,
    workType: raw.workType === 'team' ? 'team' : 'individual',
    isExtraCredit: raw.isExtraCredit === true,
    method: (raw.method as CfSubmissionMethod) || 'confirm',
    evidence: (raw.evidence as CfEvidence) || {},
    contributorIds: Array.isArray(raw.contributorIds) ? (raw.contributorIds as string[]) : [],
    requestedPoints: Number(raw.requestedPoints) || 0,
    status: (raw.status as CfSubmissionStatus) || 'submitted',
    approvedPoints: Number(raw.approvedPoints) || 0,
    reviewedBy: typeof raw.reviewedBy === 'string' ? raw.reviewedBy : null,
    reviewedAt: typeof raw.reviewedAt === 'number' ? raw.reviewedAt : null,
    feedback: typeof raw.feedback === 'string' ? raw.feedback : null,
    submittedAt: Number(raw.submittedAt) || 0,
    revisionCount: Number(raw.revisionCount) || 0,
    history: Array.isArray(raw.history) ? (raw.history as CfAuditEntry[]) : [],
  };
}

/** Facilitator view: every submission in the room. */
export function subscribeAllSubmissions(sessionId: string, cb: (rows: CfSubmission[]) => void) {
  return onSnapshot(
    sub(sessionId, 'cfSubmissions'),
    (snap) => cb(snap.docs.map((d) => parseSubmission(d.id, d.data()))),
    () => cb([])
  );
}

/** Player view: own submissions plus team work that lists them as a contributor. */
export function subscribeMySubmissions(sessionId: string, uid: string, cb: (rows: CfSubmission[]) => void) {
  let own: CfSubmission[] = [];
  let shared: CfSubmission[] = [];
  const emit = () => {
    const m = new Map<string, CfSubmission>();
    [...own, ...shared].forEach((s) => m.set(s.id, s));
    cb(Array.from(m.values()));
  };
  const u1 = onSnapshot(
    query(sub(sessionId, 'cfSubmissions'), where('playerId', '==', uid)),
    (snap) => {
      own = snap.docs.map((d) => parseSubmission(d.id, d.data()));
      emit();
    },
    () => undefined
  );
  const u2 = onSnapshot(
    query(sub(sessionId, 'cfSubmissions'), where('contributorIds', 'array-contains', uid)),
    (snap) => {
      shared = snap.docs.map((d) => parseSubmission(d.id, d.data()));
      emit();
    },
    () => undefined
  );
  return () => {
    u1();
    u2();
  };
}

export async function uploadEvidenceFile(
  sessionId: string,
  uid: string,
  file: File
): Promise<{ url: string; path: string; name: string }> {
  if (file.size > 10 * 1024 * 1024) throw new Error('File must be 10 MB or smaller');
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const path = `classFlowEvidence/${sessionId}/${uid}/${Date.now()}_${safe}`;
  const r = storageRef(storage, path);
  await uploadBytes(r, file, { contentType: file.type || 'application/octet-stream' });
  return { url: await getDownloadURL(r), path, name: file.name };
}

export interface SubmitWorkInput {
  sessionId: string;
  sprintId: string;
  assignment: CfSprintAssignment;
  uid: string;
  playerName: string;
  teamId: string | null;
  teamName: string | null;
  method: CfSubmissionMethod;
  evidence: CfEvidence;
  contributorIds: string[];
}

/**
 * Creates (or resubmits after a revision request) the player's submission for one assignment.
 * Deterministic doc id + transaction = no duplicate submissions, even on double-click/retry.
 */
export async function submitWork(input: SubmitWorkInput): Promise<Result> {
  const { sessionId, sprintId, assignment, uid } = input;
  const ref = subDoc(sessionId, 'cfSubmissions', submissionDocId(sprintId, assignment.assignmentId, uid));
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const prev = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
      if (prev && prev.status !== 'revision_requested') {
        throw new Error('You already submitted this work. Wait for the facilitator to review it.');
      }
      const now = Date.now();
      const status: CfSubmissionStatus = input.method === 'facilitator' ? 'awaiting_approval' : 'submitted';
      const contributors = Array.from(new Set([uid, ...input.contributorIds]));
      const entry: CfAuditEntry = { action: prev ? 'resubmitted' : 'submitted', by: uid, at: now };
      const history = [...((prev?.history as CfAuditEntry[]) || []), entry].slice(-30);
      tx.set(ref, {
        sprintId,
        assignmentId: assignment.assignmentId,
        assignmentTitle: assignment.title,
        playerId: uid,
        playerName: input.playerName,
        teamId: input.teamId,
        teamName: input.teamName,
        workType: assignment.workType,
        isExtraCredit: assignment.isExtraCredit,
        method: input.method,
        evidence: clean({ ...input.evidence }),
        contributorIds: assignment.workType === 'team' ? contributors : [uid],
        requestedPoints: assignment.points,
        status,
        approvedPoints: 0,
        reviewedBy: null,
        reviewedAt: null,
        feedback: prev ? (prev.feedback as string | null) ?? null : null,
        submittedAt: now,
        revisionCount: prev ? (Number(prev.revisionCount) || 0) + 1 : 0,
        history,
      });
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export type ReviewAction =
  | { kind: 'approve'; points: number }
  | { kind: 'revision'; feedback: string }
  | { kind: 'reject'; feedback: string };

/**
 * Facilitator review. Refuses once the player's allocation for that sprint was paid out,
 * so approvals can never create a second payout.
 */
export async function reviewSubmission(
  sessionId: string,
  submissionId: string,
  action: ReviewAction,
  reviewerUid: string
): Promise<Result> {
  const ref = subDoc(sessionId, 'cfSubmissions', submissionId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Submission not found');
      const s = parseSubmission(snap.id, snap.data());
      const allocSnap = await tx.get(subDoc(sessionId, 'cfAllocations', allocationDocId(s.sprintId, s.playerId)));
      if (allocSnap.exists() && allocSnap.data()?.status === 'paid_out') {
        throw new Error('Rewards for this sprint were already paid to this player.');
      }
      // Credit is capped by the sprint's assignment value, never by the client-written requestedPoints.
      const archiveSnap = await tx.get(subDoc(sessionId, 'cfSprints', s.sprintId));
      let sprintAssignments = parseSprintAssignments(archiveSnap.exists() ? archiveSnap.data()?.assignments : null);
      if (!sprintAssignments.length) {
        const roomSnap = await tx.get(room(sessionId));
        const live = roomSnap.data()?.classFlowSprint;
        if (live?.id === s.sprintId) sprintAssignments = parseSprintAssignments(live.assignments);
      }
      const assignment = sprintAssignments.find((a) => a.assignmentId === s.assignmentId);
      if (!assignment) throw new Error('This work is not part of that sprint.');
      const now = Date.now();
      let patch: Record<string, unknown>;
      if (action.kind === 'approve') {
        const points = Math.max(0, Math.min(assignment.points, Math.floor(action.points)));
        if (s.status === 'approved' && s.approvedPoints === points) return;
        patch = {
          status: 'approved',
          approvedPoints: points,
          feedback: null,
          requestedPoints: assignment.points,
          history: [...s.history, { action: points < assignment.points ? 'partial' : 'approved', by: reviewerUid, at: now, points }].slice(-30),
        };
      } else {
        const feedback = action.feedback.trim().slice(0, 600);
        if (action.kind === 'revision' && !feedback) throw new Error('Add feedback so the player knows what to fix.');
        patch = {
          status: action.kind === 'revision' ? 'revision_requested' : 'rejected',
          approvedPoints: 0,
          feedback: feedback || null,
          history: [...s.history, { action: action.kind === 'revision' ? 'revision_requested' : 'rejected', by: reviewerUid, at: now, feedback }].slice(-30),
        };
      }
      tx.update(ref, { ...patch, reviewedBy: reviewerUid, reviewedAt: now });
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------ Teams & tables ----------------------------- */

export interface CfStoredTeam {
  id: string;
  groupingType?: CfGrouping;
  displayName?: string;
  proposedName?: string | null;
  proposedBy?: string | null;
  captainId?: string | null;
  memberIds?: string[];
}

export function subscribeStoredTeams(sessionId: string, cb: (rows: Record<string, CfStoredTeam>) => void) {
  return onSnapshot(
    sub(sessionId, 'cfTeams'),
    (snap) => {
      const out: Record<string, CfStoredTeam> = {};
      snap.docs.forEach((d) => (out[d.id] = { id: d.id, ...(d.data() as Omit<CfStoredTeam, 'id'>) }));
      cb(out);
    },
    () => cb({})
  );
}

export async function saveStoredTeam(sessionId: string, teamId: string, patch: Partial<CfStoredTeam>): Promise<Result> {
  try {
    const data: Record<string, unknown> = { updatedAt: serverTimestamp() };
    Object.entries(patch).forEach(([k, v]) => {
      if (k !== 'id' && v !== undefined) data[k] = v;
    });
    await setDoc(subDoc(sessionId, 'cfTeams', teamId), data, { merge: true });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteStoredTeam(sessionId: string, teamId: string): Promise<Result> {
  try {
    await deleteDoc(subDoc(sessionId, 'cfTeams', teamId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Student: propose a name for their event team. Only the proposal fields are writable by students. */
export async function proposeTeamName(sessionId: string, teamId: string, name: string, uid: string): Promise<Result> {
  try {
    await setDoc(
      subDoc(sessionId, 'cfTeams', teamId),
      { proposedName: name, proposedBy: uid, proposedAt: serverTimestamp() },
      { merge: true }
    );
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resolveTeamName(
  sessionId: string,
  teamId: string,
  decision: 'approve' | 'decline' | 'reset',
  proposedName?: string | null
): Promise<Result> {
  try {
    const patch: Record<string, unknown> = { proposedName: null, proposedBy: null, updatedAt: serverTimestamp() };
    if (decision === 'approve' && proposedName) patch.displayName = proposedName;
    if (decision === 'reset') patch.displayName = deleteField();
    await setDoc(subDoc(sessionId, 'cfTeams', teamId), patch, { merge: true });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export function subscribeTables(sessionId: string, cb: (byUid: Record<string, number>) => void) {
  return onSnapshot(
    sub(sessionId, 'cfTables'),
    (snap) => {
      const out: Record<string, number> = {};
      snap.docs.forEach((d) => {
        const n = Number(d.data()?.tableNumber);
        if (Number.isFinite(n) && n > 0) out[d.id] = n;
      });
      cb(out);
    },
    () => cb({})
  );
}

export async function setTableNumber(sessionId: string, uid: string, n: number | null, by: string): Promise<Result> {
  try {
    const ref = subDoc(sessionId, 'cfTables', uid);
    if (n == null || !Number.isFinite(n) || n <= 0) await deleteDoc(ref);
    else await setDoc(ref, { tableNumber: Math.min(99, Math.floor(n)), setBy: by, updatedAt: serverTimestamp() });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* --------------------------------- Sharing -------------------------------- */

function parseSharing(id: string, raw: Record<string, unknown>): CfSharingDecision {
  return {
    id,
    sprintId: String(raw.sprintId || ''),
    teamId: String(raw.teamId || ''),
    eligibleRecipients: Array.isArray(raw.eligibleRecipients) ? (raw.eligibleRecipients as string[]) : [],
    votes: (raw.votes as Record<string, number>) || {},
    proposedBy: typeof raw.proposedBy === 'string' ? raw.proposedBy : null,
    proposedPercent: typeof raw.proposedPercent === 'number' ? raw.proposedPercent : null,
    status: (raw.status as CfSharingDecision['status']) || 'open',
    approvedPercent: typeof raw.approvedPercent === 'number' ? raw.approvedPercent : null,
    approvedBy: typeof raw.approvedBy === 'string' ? raw.approvedBy : null,
    history: Array.isArray(raw.history) ? (raw.history as CfAuditEntry[]) : [],
  };
}

export function subscribeSharing(sessionId: string, cb: (rows: CfSharingDecision[]) => void) {
  return onSnapshot(
    sub(sessionId, 'cfSharing'),
    (snap) => cb(snap.docs.map((d) => parseSharing(d.id, d.data()))),
    () => cb([])
  );
}

/** Player vote (majority mode) — writes only their own key. */
export async function castShareVote(
  sessionId: string,
  sprintId: string,
  teamId: string,
  uid: string,
  percent: number
): Promise<Result> {
  try {
    await setDoc(
      subDoc(sessionId, 'cfSharing', sharingDocId(sprintId, teamId)),
      { sprintId, teamId, votes: { [uid]: Math.max(0, Math.floor(percent)) } },
      { merge: true }
    );
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Captain proposal (captain mode). Facilitator still approves. */
export async function proposeShare(
  sessionId: string,
  sprintId: string,
  teamId: string,
  uid: string,
  percent: number
): Promise<Result> {
  try {
    await setDoc(
      subDoc(sessionId, 'cfSharing', sharingDocId(sprintId, teamId)),
      { sprintId, teamId, proposedBy: uid, proposedPercent: Math.max(0, Math.floor(percent)), status: 'proposed' },
      { merge: true }
    );
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Facilitator decision: approve a percentage (override allowed) or decline. Recorded in history. */
export async function decideShare(
  sessionId: string,
  sprintId: string,
  teamId: string,
  decision: { approve: boolean; percent: number },
  facilitatorUid: string
): Promise<Result> {
  const ref = subDoc(sessionId, 'cfSharing', sharingDocId(sprintId, teamId));
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const prev = snap.exists() ? parseSharing(snap.id, snap.data()) : null;
      const paid = await getDocs(
        query(sub(sessionId, 'cfAllocations'), where('sprintId', '==', sprintId), where('status', '==', 'paid_out'))
      );
      if (!paid.empty) throw new Error('Rewards for this sprint were already paid out; sharing is locked.');
      const entry: CfAuditEntry = {
        action: decision.approve ? 'share_approved' : 'share_declined',
        by: facilitatorUid,
        at: Date.now(),
        points: decision.approve ? decision.percent : 0,
      };
      tx.set(
        ref,
        {
          sprintId,
          teamId,
          status: decision.approve ? 'approved' : 'declined',
          approvedPercent: decision.approve ? Math.max(0, Math.floor(decision.percent)) : 0,
          approvedBy: facilitatorUid,
          history: [...(prev?.history || []), entry].slice(-30),
        },
        { merge: true }
      );
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------ Allocations & payouts ------------------------------ */

export function subscribeAllocations(sessionId: string, cb: (rows: CfAllocation[]) => void) {
  return onSnapshot(
    sub(sessionId, 'cfAllocations'),
    (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as CfAllocation), id: d.id }))),
    () => cb([])
  );
}

export function subscribeMyAllocations(sessionId: string, uid: string, cb: (rows: CfAllocation[]) => void) {
  return onSnapshot(
    query(sub(sessionId, 'cfAllocations'), where('playerId', '==', uid)),
    (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as CfAllocation), id: d.id }))),
    () => cb([])
  );
}

export function subscribeMyPayouts(sessionId: string, uid: string, cb: (rows: CfPayout[]) => void) {
  return onSnapshot(
    query(sub(sessionId, 'cfPayouts'), where('playerId', '==', uid)),
    (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as CfPayout), id: d.id }))),
    () => cb([])
  );
}

/**
 * Writes the computed breakdown for a sprint. Rows already paid out are left untouched,
 * so re-running finalize after a refresh or a late approval never double-pays.
 */
export async function writeSprintAllocations(
  sessionId: string,
  sprintId: string,
  result: CfRewardResult,
  actingUid: string
): Promise<Result<number>> {
  try {
    const existing = await getDocs(query(sub(sessionId, 'cfAllocations'), where('sprintId', '==', sprintId)));
    const paid = new Set(existing.docs.filter((d) => d.data()?.status === 'paid_out').map((d) => d.id));
    let batch = writeBatch(db);
    let ops = 0;
    let written = 0;
    for (const p of Object.values(result.players)) {
      const id = allocationDocId(sprintId, p.playerId);
      if (paid.has(id)) continue;
      batch.set(subDoc(sessionId, 'cfAllocations', id), {
        ...p,
        id,
        sprintId,
        status: 'accrued',
        payoutId: null,
        computedBy: actingUid,
        computedAt: serverTimestamp(),
      });
      written += 1;
      ops += 1;
      if (ops >= 400) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }
    batch.set(
      subDoc(sessionId, 'cfSprints', sprintId),
      { status: 'finalized', finalizedAtMs: Date.now(), finalizedBy: actingUid, pool: result.pool },
      { merge: true }
    );
    await batch.commit();
    return { ok: true, value: written };
  } catch (e) {
    return fail(e);
  }
}

function shortHash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Creates payouts for accrued allocations. Payout ids are deterministic
 * (`{sprintId}__{uid}` per sprint, `event_{hash}__{uid}` at event end) and created
 * in a transaction only if absent, so retries/reconnects cannot pay twice.
 */
export async function createPayouts(
  sessionId: string,
  allocations: CfAllocation[],
  timing: 'per_sprint' | 'end_of_event',
  actingUid: string,
  onlySprintId?: string
): Promise<Result<number>> {
  try {
    const accrued = allocations.filter(
      (a) => a.status === 'accrued' && !a.payoutId && (!onlySprintId || a.sprintId === onlySprintId)
    );
    const groups = new Map<string, CfAllocation[]>();
    for (const a of accrued) {
      const key = timing === 'per_sprint' ? `${a.sprintId}__${a.playerId}` : a.playerId;
      groups.set(key, [...(groups.get(key) || []), a]);
    }
    let created = 0;
    for (const [key, rows] of Array.from(groups.entries())) {
      const playerId = rows[0].playerId;
      const sprintIds = rows.map((r) => r.sprintId).sort();
      const payoutId = timing === 'per_sprint' ? key : `event_${shortHash(sprintIds.join('|'))}__${playerId}`;
      const payoutRef = subDoc(sessionId, 'cfPayouts', payoutId);
      const didCreate = await runTransaction(db, async (tx) => {
        const snap = await tx.get(payoutRef);
        const allocRefs = rows.map((r) => subDoc(sessionId, 'cfAllocations', r.id));
        const allocSnaps = await Promise.all(allocRefs.map((r) => tx.get(r)));
        const live = allocSnaps.filter((s) => s.exists() && s.data()?.status === 'accrued');
        if (snap.exists()) {
          live.forEach((s) => tx.update(s.ref, { status: 'paid_out', payoutId }));
          return false;
        }
        if (!live.length) return false;
        const sum = (k: 'totalPoints' | 'pp' | 'xp') => live.reduce((n, s) => n + (Number(s.data()?.[k]) || 0), 0);
        tx.set(payoutRef, {
          playerId,
          points: sum('totalPoints'),
          pp: sum('pp'),
          xp: sum('xp'),
          sprintIds: live.map((s) => String(s.data()?.sprintId)),
          status: 'pending',
          createdBy: actingUid,
          createdAt: serverTimestamp(),
        });
        live.forEach((s) => tx.update(s.ref, { status: 'paid_out', payoutId }));
        return true;
      });
      if (didCreate) created += 1;
    }
    return { ok: true, value: created };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Student claims their own pending payouts. PP, profile XP, and the payout's `claimed` flag are
 * written in ONE transaction (via applyPlayerPPDelta's guard), so a payout can be claimed once.
 */
export async function claimMyPayouts(sessionId: string, uid: string, payouts: CfPayout[]): Promise<{ pp: number; xp: number; points: number }> {
  const totals = { pp: 0, xp: 0, points: 0 };
  for (const p of payouts) {
    if (p.playerId !== uid || p.status !== 'pending') continue;
    const ref = subDoc(sessionId, 'cfPayouts', p.id);
    try {
      const pre = await getDoc(ref);
      if (!pre.exists() || pre.data()?.status !== 'pending') continue;
      const pp = Math.max(0, Math.floor(Number(pre.data()?.pp) || 0));
      const xp = Math.max(0, Math.floor(Number(pre.data()?.xp) || 0));
      const res = await applyPlayerPPDelta(uid, pp, {
        mode: 'award',
        meta: { sourceType: 'liveEvent', sourceId: `classflow_${p.id}`, notes: 'Class Flow Sprint rewards' },
        extraStudentFields: xp > 0 ? { xp: increment(xp) } : undefined,
        guard: {
          ref,
          isClaimable: (d) => d?.status === 'pending' && d?.playerId === uid,
          claimUpdate: { status: 'claimed', claimedAt: serverTimestamp() },
        },
      });
      if (res.skipped) continue;
      if (xp > 0) {
        try {
          await updateDoc(doc(db, 'users', uid), { xp: increment(xp) });
        } catch {
          /* users mirror is best-effort */
        }
        void mirrorProfileXpToProgressionSystems(uid, xp, 'live_event_sprint').catch(() => undefined);
      }
      totals.pp += pp;
      totals.xp += xp;
      totals.points += Number(pre.data()?.points) || 0;
    } catch (e) {
      console.warn('[classFlow] payout claim failed', p.id, e);
    }
  }
  return totals;
}

/* ------------------------------ Public team state ------------------------------ */

/** Facilitator-published team progress (`cfPublic/state`) so players never need others' submissions. */
export async function publishPublicState(sessionId: string, state: Record<string, unknown>): Promise<void> {
  try {
    await setDoc(subDoc(sessionId, 'cfPublic', 'state'), { ...state, updatedAt: serverTimestamp() });
  } catch (e) {
    console.warn('[classFlow] publish state failed', e);
  }
}

export function subscribePublicState(sessionId: string, cb: (state: Record<string, unknown> | null) => void) {
  return onSnapshot(
    subDoc(sessionId, 'cfPublic', 'state'),
    (snap) => cb(snap.exists() ? (snap.data() as Record<string, unknown>) : null),
    () => cb(null)
  );
}

/* --------------------------------- Audit log -------------------------------- */

export async function logClassFlowEvent(sessionId: string, line: string): Promise<void> {
  try {
    await updateDoc(room(sessionId), { battleLog: arrayUnion(line), updatedAt: serverTimestamp() });
  } catch {
    /* best-effort */
  }
}
