import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Bell + in-app alerts for Live Events. Discovery still uses classroom enrollment;
 * these writes make the navbar notification list work for newly enrolled students.
 */
export async function notifyStudentsOfLiveEvent(args: {
  studentIds: string[];
  sessionId: string;
  className: string;
  classId?: string | null;
}): Promise<void> {
  const uniqueIds = Array.from(new Set(args.studentIds.filter(Boolean)));
  if (!args.sessionId || uniqueIds.length === 0) return;

  const classLabel = args.className?.trim() || 'your class';
  await Promise.all(
    uniqueIds.map(async (studentId) => {
      try {
        await addDoc(collection(db, 'students', studentId, 'notifications'), {
          type: 'live_event',
          message: `🎆 Live Event is now active for ${classLabel}! Join the battle in the arena.`,
          sessionId: args.sessionId,
          classId: args.classId || null,
          timestamp: serverTimestamp(),
          read: false,
        });
      } catch (err) {
        console.error(`Failed to notify ${studentId} of live event ${args.sessionId}:`, err);
      }
    })
  );
}

/** Keep students.classId in sync so Universal Event rules and join payloads work. */
export async function setStudentClassroomId(studentId: string, classId: string): Promise<void> {
  if (!studentId || !classId) return;
  await setDoc(doc(db, 'students', studentId), { classId }, { merge: true });
  const userRef = doc(db, 'users', studentId);
  const userSnap = await getDoc(userRef);
  if (userSnap.exists()) {
    await setDoc(userRef, { classId }, { merge: true });
  }
}
