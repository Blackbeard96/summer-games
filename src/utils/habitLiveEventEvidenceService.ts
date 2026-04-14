/**
 * Tracks Class Flow sprint stats for Habit Goals when students choose live-event evidence types.
 * Stored under habitSubmissions/{submissionId}/liveEventSessions/{sessionId} so session hosts can write
 * (see firestore.rules) without broad habit doc access.
 */

import { db } from '../firebase';
import {
  arrayUnion,
  collection,
  doc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import type { HabitEvidenceType, HabitLiveEventSessionEvidence, HabitSubmission } from '../types/assessmentGoals';

function tsToMs(t: unknown): number {
  if (t && typeof (t as { toMillis?: () => number }).toMillis === 'function') {
    return (t as { toMillis: () => number }).toMillis();
  }
  if (t instanceof Date) return t.getTime();
  return 0;
}

export function isHabitWindowActive(sub: HabitSubmission, nowMs: number = Date.now()): boolean {
  const st = sub.status;
  if (st !== 'IN_PROGRESS' && st !== 'active') return false;
  const start = tsToMs(sub.startAt);
  const end = tsToMs(sub.endAt);
  if (!(end > start)) return false;
  return nowMs >= start && nowMs <= end;
}

export function habitEvidenceTracksLiveEvents(t: HabitEvidenceType | undefined): boolean {
  return t === 'live_event_sprint_rate' || t === 'live_event_consistency';
}

function normalizedEvidenceType(t: HabitEvidenceType | undefined): HabitEvidenceType {
  return t ?? 'other';
}

async function habitSubmissionsForStudent(studentId: string): Promise<HabitSubmission[]> {
  const q = query(collection(db, 'habitSubmissions'), where('studentId', '==', studentId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as HabitSubmission));
}

function submissionsToUpdateForLiveEvent(
  subs: HabitSubmission[],
  nowMs: number
): HabitSubmission[] {
  return subs.filter((sub) => {
    if (!habitEvidenceTracksLiveEvents(normalizedEvidenceType(sub.habitEvidenceType))) return false;
    return isHabitWindowActive(sub, nowMs);
  });
}

function sessionEvidenceRef(submissionId: string, sessionId: string) {
  return doc(db, 'habitSubmissions', submissionId, 'liveEventSessions', sessionId);
}

/** When a Class Flow sprint starts: count one “sprint opportunity” per active tracked habit goal. */
export async function recordHabitLiveEventSprintOpportunity(
  sessionId: string,
  sessionTitle: string,
  playerUids: string[]
): Promise<void> {
  const sid = String(sessionId || '').trim();
  if (!sid || !playerUids.length) return;
  const title = sessionTitle.trim();
  const nowMs = Date.now();

  for (const playerUid of playerUids) {
    if (!playerUid) continue;
    try {
      const subs = await habitSubmissionsForStudent(playerUid);
      const targets = submissionsToUpdateForLiveEvent(subs, nowMs);
      for (const sub of targets) {
        const ref = sessionEvidenceRef(sub.id, sid);
        await setDoc(
          ref,
          {
            sessionId: sid,
            studentId: playerUid,
            sessionTitle: title,
            sprintsOffered: increment(1),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    } catch (e) {
      console.warn('[habitLiveEventEvidence] opportunity failed', playerUid, e);
    }
  }
}

/** When a player is marked complete for a sprint (reward path): record completion + day for consistency. */
export async function recordHabitLiveEventSprintCompletion(
  sessionId: string,
  playerUid: string,
  completedAtMs: number
): Promise<void> {
  const sid = String(sessionId || '').trim();
  if (!sid || !playerUid) return;
  const dateKey = new Date(completedAtMs).toISOString().slice(0, 10);
  const nowMs = Date.now();

  try {
    const subs = await habitSubmissionsForStudent(playerUid);
    const targets = submissionsToUpdateForLiveEvent(subs, nowMs);
    for (const sub of targets) {
      const ref = sessionEvidenceRef(sub.id, sid);
      await setDoc(
        ref,
        {
          sessionId: sid,
          studentId: playerUid,
          sprintsCompleted: increment(1),
          daysWithCompletedSprint: arrayUnion(dateKey),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (e) {
    console.warn('[habitLiveEventEvidence] completion failed', playerUid, e);
  }
}

export async function listHabitLiveEventSessionEvidence(
  submissionId: string
): Promise<HabitLiveEventSessionEvidence[]> {
  const col = collection(db, 'habitSubmissions', submissionId, 'liveEventSessions');
  const snap = await getDocs(col);
  const out: HabitLiveEventSessionEvidence[] = [];
  snap.forEach((d) => {
    const x = d.data() as Record<string, unknown>;
    out.push({
      sessionId: d.id,
      studentId: typeof x.studentId === 'string' ? x.studentId : '',
      sessionTitle: typeof x.sessionTitle === 'string' ? x.sessionTitle : undefined,
      sprintsOffered: Math.max(0, Number(x.sprintsOffered) || 0),
      sprintsCompleted: Math.max(0, Number(x.sprintsCompleted) || 0),
      daysWithCompletedSprint: Array.isArray(x.daysWithCompletedSprint)
        ? (x.daysWithCompletedSprint as string[]).filter((s) => typeof s === 'string')
        : undefined,
      updatedAt: x.updatedAt as HabitLiveEventSessionEvidence['updatedAt'],
    });
  });
  out.sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  return out;
}

export function formatHabitLiveEventEvidenceLines(
  habitEvidenceType: HabitEvidenceType | undefined,
  sessions: HabitLiveEventSessionEvidence[]
): string[] {
  if (!sessions.length) return ['No live event sessions recorded yet. Join a Live Event and participate in Class Flow sprints.'];
  const t = normalizedEvidenceType(habitEvidenceType);
  return sessions.map((s) => {
    const offered = Math.max(0, s.sprintsOffered);
    const done = Math.max(0, s.sprintsCompleted);
    const rate = offered > 0 ? Math.round((done / offered) * 100) : done > 0 ? 100 : 0;
    const label = s.sessionTitle?.trim() || s.sessionId;
    if (t === 'live_event_consistency') {
      const days = s.daysWithCompletedSprint?.length ?? 0;
      return `${label}: ${days} day(s) with at least one completed sprint · ${done} sprint completion(s)`;
    }
    return `${label}: ${done} / ${offered} sprints completed (${rate}%)`;
  });
}
