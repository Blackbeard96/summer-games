import { db } from '../firebase';
import { deleteField, doc, getDoc, updateDoc } from 'firebase/firestore';

/**
 * Denormalized `primarySquadId` on `users/{uid}` lets security rules verify that a
 * squad check-in transaction may update another member's `pp` (same squad only).
 */
export async function syncPrimarySquadIdOnUser(userId: string, squadId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return;
  if (snap.data()?.primarySquadId === squadId) return;
  await updateDoc(userRef, { primarySquadId: squadId });
}

export async function clearPrimarySquadIdOnUser(userId: string): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  if (!snap.exists()) return;
  await updateDoc(userRef, { primarySquadId: deleteField() });
}
