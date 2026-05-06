/**
 * Firestore classroom queries that respect security rules.
 * Never use getDocs(collection('classrooms')) for students — rules only allow reads
 * for docs where the user is in `students`, so collection-wide queries fail.
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import { canUserJoinLiveEvent } from './liveEventEligibility';

/** Class IDs where this user appears in `classrooms.students` (array-contains). */
export async function getClassroomIdsForEnrolledStudent(userId: string): Promise<string[]> {
  const snap = await getDocs(
    query(collection(db, 'classrooms'), where('students', 'array-contains', userId))
  );
  return snap.docs.map((d) => d.id);
}

const LIVE_SESSION_STATUSES = ['active', 'live'] as const;

/**
 * Fetch inSessionRooms docs for the given class IDs (one query per class — each result set
 * passes rules for enrolled students). Filter to active/live on the client.
 */
export async function getLiveSessionSnapshotsForClassIds(
  classIds: string[],
  statuses: readonly string[] = LIVE_SESSION_STATUSES
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const dedupedClassIds = Array.from(new Set(classIds.filter(Boolean)));
  const queryPromises: Array<Promise<any>> = [];
  queryPromises.push(getDocs(query(collection(db, 'inSessionRooms'), where('inviteAllClasses', '==', true))));
  queryPromises.push(
    ...dedupedClassIds.map((classId) =>
      getDocs(query(collection(db, 'inSessionRooms'), where('classId', '==', classId)))
    )
  );
  queryPromises.push(
    ...dedupedClassIds.map((classId) =>
      getDocs(query(collection(db, 'inSessionRooms'), where('classIds', 'array-contains', classId)))
    )
  );

  const snaps = await Promise.all(queryPromises);
  const docs = snaps.flatMap((s) => s.docs) as QueryDocumentSnapshot<DocumentData>[];
  const statusSet = new Set(statuses);
  const unique = new Map<string, QueryDocumentSnapshot<DocumentData>>();
  for (const docSnap of docs) {
    const data = docSnap.data();
    if (!statusSet.has(String(data.status || ''))) continue;
    if (!canUserJoinLiveEvent(dedupedClassIds, data)) continue;
    unique.set(docSnap.id, docSnap);
  }
  return Array.from(unique.values());
}

export async function getVisibleLiveEventsForUser(
  userClassIds: string[],
  statuses: readonly string[] = LIVE_SESSION_STATUSES
): Promise<Array<{ id: string; data: DocumentData }>> {
  const docs = await getLiveSessionSnapshotsForClassIds(userClassIds, statuses);
  return docs.map((d) => ({ id: d.id, data: d.data() }));
}
