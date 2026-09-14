/**
 * Squad member objects in Firestore may use `uid` or legacy `userId`.
 * Squad docs also store `memberUids` for rules — prefer that for membership checks.
 */

import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export function squadMemberUid(member: any): string | undefined {
  const id = member?.uid ?? member?.userId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/** True if `uid` is in this squad (memberUids array and/or members list). */
export function isUidInSquad(squad: any, uid: string | undefined | null): boolean {
  if (!uid) return false;
  if (Array.isArray(squad?.memberUids) && squad.memberUids.includes(uid)) {
    return true;
  }
  const members = squad?.members || [];
  return members.some((m: any) => squadMemberUid(m) === uid);
}

/**
 * `getDocs(collection('users'))` fails for normal players: rules only allow reading your own `users/{uid}`.
 * Firestore rejects the whole query if it could return unreadable docs. Load a map safely + own doc fallback.
 */
export async function loadUsersDataMapSafe(
  currentUserUid?: string
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  try {
    const snap = await getDocs(collection(db, 'users'));
    snap.forEach((d) => map.set(d.id, d.data() as Record<string, unknown>));
  } catch (e) {
    console.warn(
      'Cannot list users collection (expected for non-admin). Enrichment uses students + your users doc only.',
      e
    );
  }
  if (currentUserUid && !map.has(currentUserUid)) {
    try {
      const mine = await getDoc(doc(db, 'users', currentUserUid));
      if (mine.exists()) map.set(currentUserUid, mine.data() as Record<string, unknown>);
    } catch {
      /* ignore */
    }
  }
  return map;
}

/** Collect every uid currently in any squad (supports uid / userId / memberUids). */
export function collectUidsInAnySquad(squadDocs: Array<{ data: () => any }>): Set<string> {
  const ids = new Set<string>();
  for (const d of squadDocs) {
    const squad = d.data();
    if (Array.isArray(squad?.memberUids)) {
      for (const uid of squad.memberUids) {
        if (typeof uid === 'string' && uid) ids.add(uid);
      }
    }
    if (Array.isArray(squad?.members)) {
      for (const member of squad.members) {
        const uid = squadMemberUid(member);
        if (uid) ids.add(uid);
      }
    }
  }
  return ids;
}

function asManifestString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.manifestId === 'string' && obj.manifestId.trim()) return obj.manifestId.trim();
    if (typeof obj.manifestationType === 'string' && obj.manifestationType.trim()) {
      return obj.manifestationType.trim();
    }
  }
  return undefined;
}

/** Best-effort display label for a player's manifest from users + students docs. */
export function resolvePlayerManifestLabel(
  userData?: Record<string, unknown> | null,
  studentData?: Record<string, unknown> | null
): string {
  const u = userData || {};
  const s = studentData || {};
  return (
    asManifestString(u.playerManifest) ||
    asManifestString(s.playerManifest) ||
    asManifestString(u.manifest) ||
    asManifestString(s.manifest) ||
    (typeof u.manifestationType === 'string' ? u.manifestationType : undefined) ||
    (typeof s.manifestationType === 'string' ? s.manifestationType : undefined) ||
    (typeof u.style === 'string' ? u.style : undefined) ||
    (typeof s.style === 'string' ? s.style : undefined) ||
    'Unknown'
  );
}

export type SquadDirectoryPlayer = {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string | null;
  level: number;
  xp: number;
  manifest: string;
  role?: string;
};

/**
 * Build invite/search roster from `students` (readable by all authenticated users),
 * optionally enriched with `users` docs when the caller can read them.
 */
export function buildPlayersFromStudents(
  studentDocs: Array<{ id: string; data: () => any }>,
  userDataMap: Map<string, Record<string, unknown>>
): SquadDirectoryPlayer[] {
  return studentDocs.map((d) => {
    const studentData = (d.data() || {}) as Record<string, unknown>;
    const userData = userDataMap.get(d.id) || {};
    const email =
      (typeof userData.email === 'string' && userData.email) ||
      (typeof studentData.email === 'string' && studentData.email) ||
      '';
    const displayName =
      (typeof userData.displayName === 'string' && userData.displayName) ||
      (typeof studentData.displayName === 'string' && studentData.displayName) ||
      (email ? email.split('@')[0] : '') ||
      'Unknown';
    return {
      uid: d.id,
      displayName,
      email,
      photoURL:
        (userData.photoURL as string | null | undefined) ??
        (studentData.photoURL as string | null | undefined) ??
        null,
      level: Number(userData.level ?? studentData.level ?? 1) || 1,
      xp: Math.max(Number(userData.xp ?? 0) || 0, Number(studentData.xp ?? 0) || 0),
      manifest: resolvePlayerManifestLabel(userData, studentData),
      role: (typeof userData.role === 'string' && userData.role) || 'Member',
    };
  });
}
