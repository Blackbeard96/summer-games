import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { setStudentClassroomId } from './liveEventStudentAlerts';

export type PendingClassroomInvite = {
  email: string;
  displayName: string;
  photoURL?: string;
  invitedAt?: unknown;
  source?: string;
};

export function normalizeStudentEmail(email: string | null | undefined): string {
  return (email || '').trim().toLowerCase();
}

/** Firestore map keys cannot reliably use raw emails; normalize to a safe key. */
export function pendingEmailMapKey(email: string): string {
  return normalizeStudentEmail(email).replace(/[.@]/g, '_');
}

/** Find an existing Auth-backed player by email (students or users doc id = uid). */
export async function findPlayerUidByEmail(
  email: string
): Promise<{ uid: string; displayName: string; email: string } | null> {
  const normalized = normalizeStudentEmail(email);
  if (!normalized) return null;

  const tryQuery = async (col: 'students' | 'users') => {
    const snap = await getDocs(
      query(collection(db, col), where('email', '==', normalized))
    );
    if (snap.empty) return null;
    const d = snap.docs[0];
    const data = d.data();
    return {
      uid: d.id,
      displayName:
        (typeof data.displayName === 'string' && data.displayName.trim()) ||
        normalized.split('@')[0] ||
        'Student',
      email: normalizeStudentEmail(data.email) || normalized,
    };
  };

  return (await tryQuery('students')) || (await tryQuery('users'));
}

export async function enrollStudentInClassroom(args: {
  classroomId: string;
  uid: string;
  displayName: string;
}): Promise<void> {
  const { classroomId, uid, displayName } = args;
  if (!classroomId || !uid) return;
  await updateDoc(doc(db, 'classrooms', classroomId), {
    students: arrayUnion(uid),
    [`studentDisplayNames.${uid}`]: displayName || 'Student',
  });
  await setStudentClassroomId(uid, classroomId);
}

/** Queue invite for players who have not signed up yet (no orphan Auth docs). */
export async function addPendingClassroomInvite(args: {
  classroomId: string;
  email: string;
  displayName: string;
  photoURL?: string;
  source?: string;
}): Promise<void> {
  const email = normalizeStudentEmail(args.email);
  if (!args.classroomId || !email) return;

  const pending: PendingClassroomInvite = {
    email,
    displayName: args.displayName || email.split('@')[0] || 'Student',
    ...(args.photoURL ? { photoURL: args.photoURL } : {}),
    invitedAt: serverTimestamp(),
    source: args.source || 'google_classroom',
  };

  await updateDoc(doc(db, 'classrooms', args.classroomId), {
    pendingStudentEmails: arrayUnion(email),
    [`pendingStudents.${pendingEmailMapKey(email)}`]: pending,
  });
}

/**
 * On signup/login: claim any classroom pending invites matching this email.
 * Uses email string match on pendingStudentEmails; clears pendingStudents map entry.
 */
export async function claimPendingClassroomEnrollments(
  uid: string,
  email: string,
  displayName?: string
): Promise<string[]> {
  const normalized = normalizeStudentEmail(email);
  if (!uid || !normalized) return [];

  const classroomsSnap = await getDocs(
    query(
      collection(db, 'classrooms'),
      where('pendingStudentEmails', 'array-contains', normalized)
    )
  );

  const claimed: string[] = [];
  for (const classroomDoc of classroomsSnap.docs) {
    const data = classroomDoc.data();
    const name =
      displayName ||
      data.pendingStudents?.[pendingEmailMapKey(normalized)]?.displayName ||
      normalized.split('@')[0] ||
      'Student';
    try {
      await enrollStudentInClassroom({
        classroomId: classroomDoc.id,
        uid,
        displayName: name,
      });
      await updateDoc(doc(db, 'classrooms', classroomDoc.id), {
        pendingStudentEmails: arrayRemove(normalized),
        [`pendingStudents.${pendingEmailMapKey(normalized)}`]: deleteField(),
      });
      claimed.push(classroomDoc.id);
    } catch (err) {
      console.error(
        `claimPendingClassroomEnrollments failed for ${classroomDoc.id}:`,
        err
      );
    }
  }
  return claimed;
}
