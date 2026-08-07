/**
 * Grant Power Points for a mission Skills & Mastery step (idempotent per playerMission + step).
 * Firestore txs require all reads before all writes.
 */

import { doc, getDoc, increment, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { PlayerMission } from '../types/missions';

export async function grantMissionSkillsMasteryPp(args: {
  userId: string;
  playerMissionId: string;
  stepId: string;
  amount: number;
}): Promise<{ granted: number; alreadyClaimed: boolean }> {
  const amount = Math.max(0, Math.floor(Number(args.amount) || 0));
  if (amount <= 0) {
    return { granted: 0, alreadyClaimed: false };
  }

  const playerMissionRef = doc(db, 'playerMissions', args.playerMissionId);
  const vaultRef = doc(db, 'vaults', args.userId);
  const studentRef = doc(db, 'students', args.userId);
  const userRef = doc(db, 'users', args.userId);

  return runTransaction(db, async (tx) => {
    // --- all reads first ---
    const [pmSnap, vaultSnap, studentSnap, userSnap] = await Promise.all([
      tx.get(playerMissionRef),
      tx.get(vaultRef),
      tx.get(studentRef),
      tx.get(userRef),
    ]);

    if (!pmSnap.exists()) {
      throw new Error('Player mission not found.');
    }

    const pm = pmSnap.data() as PlayerMission;
    const prior = pm.sequenceStepCompletion?.[args.stepId];
    if (prior && typeof prior.ppGranted === 'number' && prior.ppGranted > 0) {
      if (!prior.visited) {
        tx.update(playerMissionRef, {
          [`sequenceStepCompletion.${args.stepId}`]: {
            ...prior,
            visited: true,
            completedAt: prior.completedAt || serverTimestamp(),
          },
        });
      }
      return { granted: prior.ppGranted, alreadyClaimed: true };
    }

    // --- all writes after reads ---
    if (vaultSnap.exists()) {
      const vaultData = vaultSnap.data();
      const capacity = typeof vaultData.capacity === 'number' ? vaultData.capacity : 1000;
      const current = typeof vaultData.currentPP === 'number' ? vaultData.currentPP : 0;
      tx.update(vaultRef, { currentPP: Math.min(capacity, current + amount) });
    } else {
      tx.set(vaultRef, { currentPP: amount, capacity: 1000 }, { merge: true });
    }

    if (studentSnap.exists()) {
      tx.update(studentRef, { powerPoints: increment(amount) });
    }

    if (userSnap.exists()) {
      tx.update(userRef, { powerPoints: increment(amount) });
    }

    tx.update(playerMissionRef, {
      [`sequenceStepCompletion.${args.stepId}`]: {
        completedAt: serverTimestamp(),
        ppGranted: amount,
        visited: true,
      },
    });

    return { granted: amount, alreadyClaimed: false };
  });
}

/** Mark Skills & Mastery step visited without granting PP (e.g. grantPP = 0). */
export async function markSkillsMasteryStepVisited(
  playerMissionId: string,
  stepId: string
): Promise<void> {
  const ref = doc(db, 'playerMissions', playerMissionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const pm = snap.data() as PlayerMission;
  const prior = pm.sequenceStepCompletion?.[stepId] || {};
  await updateDoc(ref, {
    [`sequenceStepCompletion.${stepId}`]: {
      ...prior,
      completedAt: prior.completedAt || serverTimestamp(),
      visited: true,
    },
  });
}
