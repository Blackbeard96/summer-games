/**
 * Class Flow Sprint roster: merge classroom `students` with live session `players`
 * and resolve classroom UIDs server-side for productivity / penalties.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export type SprintRosterRow = {
  userId: string;
  displayName: string;
  /** True when this UID appears in the live session `players` list */
  isInSession: boolean;
};

/** UIDs from `classrooms/{classId}.students` (Firestore rules: single-doc read). */
export async function fetchClassroomStudentUids(classId: string): Promise<string[]> {
  const id = typeof classId === 'string' ? classId.trim() : '';
  if (!id) return [];
  const snap = await getDoc(doc(db, 'classrooms', id));
  if (!snap.exists()) return [];
  const raw = snap.data()?.students;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

/**
 * When `classStudents` is non-empty, list every class student and flag session presence.
 * Session-only guests (in session but not on the class list) are appended.
 * When `classStudents` is empty/undefined, fall back to session players only (all in-session).
 */
export function mergeSprintRosterForClassFlow(
  classStudents: { userId: string; displayName: string }[] | null | undefined,
  sessionPlayers: { userId: string; displayName: string }[]
): SprintRosterRow[] {
  const sessionSet = new Set(sessionPlayers.map((p) => p.userId));
  const sessionNameByUid = new Map(sessionPlayers.map((p) => [p.userId, p.displayName] as const));
  const merged = new Map<string, SprintRosterRow>();

  const classList = classStudents?.filter((c) => c.userId) ?? [];
  if (classList.length > 0) {
    for (const c of classList) {
      const inSession = sessionSet.has(c.userId);
      merged.set(c.userId, {
        userId: c.userId,
        displayName: inSession ? sessionNameByUid.get(c.userId) || c.displayName : c.displayName,
        isInSession: inSession,
      });
    }
  }

  for (const p of sessionPlayers) {
    if (merged.has(p.userId)) continue;
    merged.set(p.userId, {
      userId: p.userId,
      displayName: p.displayName,
      isInSession: true,
    });
  }

  if (merged.size === 0) {
    return sessionPlayers.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      isInSession: true,
    }));
  }

  const rows = Array.from(merged.values());
  rows.sort((a, b) => {
    if (a.isInSession !== b.isInSession) return a.isInSession ? -1 : 1;
    return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' });
  });
  return rows;
}
