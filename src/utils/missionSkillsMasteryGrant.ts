/**
 * Grant Power Points for a mission Skills & Mastery step (idempotent per playerMission + step).
 * Firestore txs require all reads before all writes.
 */

import { doc, getDoc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { PlayerMission } from '../types/missions';
import { applyPlayerPPDelta } from './playerPowerPoints';

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

  const result = await runTransaction(db, async (tx) => {
    // --- all reads first ---
    const pmSnap = await tx.get(playerMissionRef);

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
    tx.update(playerMissionRef, {
      [`sequenceStepCompletion.${args.stepId}`]: {
        completedAt: serverTimestamp(),
        ppGranted: amount,
        visited: true,
      },
    });

    return { granted: amount, alreadyClaimed: false };
  });

  if (!result.alreadyClaimed) {
    await applyPlayerPPDelta(args.userId, amount, {
      mode: 'earn',
      meta: {
        sourceType: 'other',
        sourceId: `${args.playerMissionId}:${args.stepId}`,
        notes: 'Mission skills mastery',
      },
    });
  }

  return result;
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
