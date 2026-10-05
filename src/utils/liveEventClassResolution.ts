import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { normalizeLiveEventEligibility } from './liveEventEligibility';

export type LiveEventRosterPlayer = {
  userId: string;
  classId?: string | null;
  isTeacher?: boolean;
};

export type LiveEventClassResolution = {
  /** Student uid → class they represented. Hosts are omitted. */
  classIdByPlayer: Record<string, string>;
  classNameById: Record<string, string>;
  hostIds: string[];
};

/**
 * Resolves each player's class from the invited classes' rosters. The class stored on the room's
 * player row came from the legacy `students.classId` field, which is often blank or stale.
 */
export async function resolveLiveEventPlayerClasses(args: {
  roomClassId?: string | null;
  classIds?: string[] | null;
  hostUid?: string | null;
  players: LiveEventRosterPlayer[];
}): Promise<LiveEventClassResolution> {
  const invited = normalizeLiveEventEligibility({
    classId: args.roomClassId,
    classIds: args.classIds,
  }).classIds;
  const hostIds = args.players
    .filter((p) => p.isTeacher || (args.hostUid && p.userId === args.hostUid))
    .map((p) => p.userId);
  const hostSet = new Set(hostIds);
  const students = args.players.filter((p) => p.userId && !hostSet.has(p.userId));

  const storedIds = students
    .map((p) => (typeof p.classId === 'string' ? p.classId.trim() : ''))
    .filter(Boolean);
  const toFetch = Array.from(new Set([...invited, ...storedIds])).slice(0, 30);

  const rosterByClass = new Map<string, Set<string>>();
  const classNameById: Record<string, string> = {};
  await Promise.all(
    toFetch.map(async (classId) => {
      try {
        const snap = await getDoc(doc(db, 'classrooms', classId));
        if (!snap.exists()) return;
        const data = snap.data() as { name?: string; students?: string[] };
        if (data.name) classNameById[classId] = String(data.name);
        rosterByClass.set(classId, new Set(Array.isArray(data.students) ? data.students : []));
      } catch (e) {
        console.warn('[liveEventClassResolution] classroom read failed', classId, e);
      }
    })
  );

  const classIdByPlayer: Record<string, string> = {};
  for (const p of students) {
    const onInvitedRoster = invited.find((cid) => rosterByClass.get(cid)?.has(p.userId));
    const stored = typeof p.classId === 'string' ? p.classId.trim() : '';
    const resolved = onInvitedRoster || stored;
    if (resolved) classIdByPlayer[p.userId] = resolved;
  }

  return { classIdByPlayer, classNameById, hostIds };
}
