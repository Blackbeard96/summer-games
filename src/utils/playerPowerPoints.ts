import { doc, getDoc, runTransaction, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { recordPPChange, type RecordPPChangeInput } from './ppLedgerService';

export const DEFAULT_VAULT_CAPACITY = 1000;

/**
 * How vault capacity applies to a PP change:
 * - `award`: teacher/admin grants (Scorekeeper, Live Event, Work Board, assessments). Never capped;
 *   PP above capacity is spendable until the next generator grant.
 * - `earn`: gameplay earnings. Cannot raise PP above capacity, but never removes existing overflow.
 * - `generatorGrant`: the daily generator grant. Clamps to capacity, erasing award overflow.
 * Negative deltas (spends, penalties) are never capped.
 */
export type PPCapMode = 'award' | 'earn' | 'generatorGrant';

export function computeNextPP(args: {
  current: number;
  delta: number;
  capacity: number;
  mode: PPCapMode;
}): number {
  const current = Math.max(0, Math.floor(Number(args.current) || 0));
  const delta = Math.trunc(Number(args.delta) || 0);
  const capacity = Math.max(0, Math.floor(Number(args.capacity) || DEFAULT_VAULT_CAPACITY));
  const raw = Math.max(0, current + delta);
  if (args.mode === 'generatorGrant') return Math.min(capacity, raw);
  if (args.mode === 'earn' && delta > 0) {
    if (current >= capacity) return current;
    return Math.min(capacity, raw);
  }
  return raw;
}

/**
 * Player PP is mirrored across vaults.currentPP, students.powerPoints, and users.powerPoints.
 * Vault is the gameplay source of truth once a vault exists. Never reconcile with Math.max —
 * that undoes Marketplace / skill spends that only hit one store.
 */

export type PPChangeMeta = Pick<
  RecordPPChangeInput,
  'sourceType' | 'sourceId' | 'notes' | 'assessmentId' | 'goalScore' | 'actualScore' | 'outcome'
>;

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
  options?: { skipVaultIfMissing?: boolean; meta?: PPChangeMeta; previousAmount?: number }
): Promise<number> {
  if (!userId) throw new Error('setPlayerPowerPoints: missing userId');
  const next = Math.max(0, Math.floor(Number(amount) || 0));
  const vaultRef = doc(db, 'vaults', userId);
  const studentRef = doc(db, 'students', userId);
  const userRef = doc(db, 'users', userId);

  let previous =
    typeof options?.previousAmount === 'number'
      ? Math.max(0, Math.floor(options.previousAmount))
      : null;

  const vaultSnap = await getDoc(vaultRef);
  if (previous === null && options?.meta) {
    previous = resolveCanonicalPP({
      vaultExists: vaultSnap.exists(),
      vaultPP: vaultSnap.exists() ? vaultSnap.data()?.currentPP : undefined,
      studentPP: (await getDoc(studentRef)).data()?.powerPoints,
    });
  }

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

  if (options?.meta && previous !== null) {
    const delta = next - previous;
    if (delta !== 0) {
      void recordPPChange({
        studentId: userId,
        amount: delta,
        ...options.meta,
      });
    }
  }

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

export type PPDeltaResult = { previous: number; next: number; applied: number };

/**
 * Atomically apply a signed delta to the canonical balance (vault, else students) and write the
 * same result to vault + students + users, so no store can drift or overwrite another mode's change.
 */
export async function applyPlayerPPDelta(
  userId: string,
  delta: number,
  options?: { mode?: PPCapMode; meta?: PPChangeMeta; extraVaultFields?: Record<string, unknown> }
): Promise<PPDeltaResult> {
  if (!userId) throw new Error('applyPlayerPPDelta: missing userId');
  const mode = options?.mode ?? 'award';
  const vaultRef = doc(db, 'vaults', userId);
  const studentRef = doc(db, 'students', userId);
  const userRef = doc(db, 'users', userId);

  const result = await runTransaction(db, async (tx) => {
    const [vaultSnap, studentSnap] = await Promise.all([tx.get(vaultRef), tx.get(studentRef)]);
    const previous = resolveCanonicalPP({
      vaultExists: vaultSnap.exists(),
      vaultPP: vaultSnap.exists() ? vaultSnap.data()?.currentPP : undefined,
      studentPP: studentSnap.exists() ? studentSnap.data()?.powerPoints : undefined,
    });
    const capacity = vaultSnap.exists()
      ? Number(vaultSnap.data()?.capacity) || DEFAULT_VAULT_CAPACITY
      : DEFAULT_VAULT_CAPACITY;
    const next = computeNextPP({ current: previous, delta, capacity, mode });

    if (vaultSnap.exists()) {
      tx.update(vaultRef, { currentPP: next, ...(options?.extraVaultFields || {}) });
    }
    if (studentSnap.exists()) tx.update(studentRef, { powerPoints: next });
    return { previous, next, applied: next - previous };
  });

  // users is a display mirror that some callers cannot read; never fail the change over it.
  try {
    await setDoc(userRef, { powerPoints: result.next }, { merge: true });
  } catch (mirrorErr) {
    console.warn('[playerPowerPoints] users mirror failed', mirrorErr);
  }

  if (options?.meta && result.applied !== 0) {
    void recordPPChange({ studentId: userId, amount: result.applied, ...options.meta });
  }
  return result;
}

/** Apply a signed delta to the canonical balance and mirror all stores (teacher-award rules). */
export async function adjustPlayerPowerPoints(
  userId: string,
  delta: number,
  meta?: PPChangeMeta
): Promise<number> {
  const { next } = await applyPlayerPPDelta(userId, delta, { mode: 'award', meta });
  return next;
}
