import { db } from '../firebase';
import { deleteField, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

/**
 * Denormalized `primarySquadId` on `users/{uid}` lets security rules verify that a
 * squad check-in transaction may update another member's `pp` (same squad only).
 *
 * If there is no `users/{uid}` doc yet, create a minimal merged doc so rules can read
 * `primarySquadId` (otherwise check-in transactions fail when updating teammates).
 */
export async function syncPrimarySquadIdOnUser(userId: string, squadId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, { primarySquadId: squadId }, { merge: true });
    return;
  }
  if (snap.data()?.primarySquadId === squadId) return;
  await updateDoc(userRef, { primarySquadId: squadId });
}

export async function clearPrimarySquadIdOnUser(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return;
  await updateDoc(userRef, { primarySquadId: deleteField() });
}
