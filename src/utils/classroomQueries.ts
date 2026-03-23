/**
 * Firestore classroom queries that respect security rules.
 * Never use getDocs(collection('classrooms')) for students — rules only allow reads
 * for docs where the user is in `students`, so collection-wide queries fail.
 */

import { collection, getDocs, query, where } from 'firebase/firestore';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '../firebase';

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
  if (classIds.length === 0) return [];
  const snaps = await Promise.all(
    classIds.map((classId) =>
      getDocs(query(collection(db, 'inSessionRooms'), where('classId', '==', classId)))
    )
  );
  const docs = snaps.flatMap((s) => s.docs);
  const statusSet = new Set(statuses);
  return docs.filter((d) => statusSet.has(String(d.data().status || '')));
}
