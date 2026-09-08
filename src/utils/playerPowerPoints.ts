import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Player PP is mirrored across vaults.currentPP, students.powerPoints, and users.powerPoints.
 * Vault is the gameplay source of truth once a vault exists. Never reconcile with Math.max —
 * that undoes Marketplace / skill spends that only hit one store.
 */

export function resolveCanonicalPP(args: {
  vaultPP: number | null | undefined;
  studentPP: number | null | undefined;
  /** When true (vault doc exists), vault wins even at 0. */
  vaultExists: boolean;
}): number {
  const student = Math.max(0, Number(args.studentPP) || 0);
  if (!args.vaultExists) return student;
  const vault = Math.max(0, Number(args.vaultPP) || 0);
  return vault;
}

/** Write the same PP balance to vault + students + users (creates vault field if vault exists). */
export async function setPlayerPowerPoints(
  userId: string,
  amount: number,
  options?: { skipVaultIfMissing?: boolean }
): Promise<number> {
  if (!userId) throw new Error('setPlayerPowerPoints: missing userId');
  const next = Math.max(0, Math.floor(Number(amount) || 0));
  const vaultRef = doc(db, 'vaults', userId);
  const studentRef = doc(db, 'students', userId);
  const userRef = doc(db, 'users', userId);

  const vaultSnap = await getDoc(vaultRef);
  const writes: Promise<unknown>[] = [
    setDoc(studentRef, { powerPoints: next }, { merge: true }),
    setDoc(userRef, { powerPoints: next }, { merge: true }),
  ];

  if (vaultSnap.exists()) {
    writes.push(updateDoc(vaultRef, { currentPP: next }));
  } else if (!options?.skipVaultIfMissing) {
    // No vault yet — student/users only; BattleContext will seed vault from student later.
  }

  await Promise.all(writes);
  return next;
}

/** Read canonical PP (vault if present, else students). */
export async function getPlayerPowerPoints(userId: string): Promise<number> {
  const [vaultSnap, studentSnap] = await Promise.all([
    getDoc(doc(db, 'vaults', userId)),
    getDoc(doc(db, 'students', userId)),
  ]);
  return resolveCanonicalPP({
    vaultExists: vaultSnap.exists(),
    vaultPP: vaultSnap.exists() ? vaultSnap.data()?.currentPP : undefined,
    studentPP: studentSnap.exists() ? studentSnap.data()?.powerPoints : undefined,
  });
}

/** Apply a signed delta to the canonical balance and mirror all stores. */
export async function adjustPlayerPowerPoints(
  userId: string,
  delta: number
): Promise<number> {
  const current = await getPlayerPowerPoints(userId);
  return setPlayerPowerPoints(userId, current + delta);
}
