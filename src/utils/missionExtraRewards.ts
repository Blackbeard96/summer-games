import { doc, runTransaction, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import type { MissionTemplate } from '../types/missions';
import type { Move } from '../types/battle';

/**
 * Grants mission rewards stored as move IDs (battle skill unlocks) and inventory item keys.
 * Idempotent per claimId (stored under users/{uid}/rewardClaims/{claimId}).
 */
export async function grantMissionExtraRewards(
  userId: string,
  claimId: string,
  rewards: MissionTemplate['rewards'] | undefined
): Promise<void> {
  if (!rewards) return;
  const moves = (rewards.moves || []).map((s) => String(s).trim()).filter(Boolean);
  const items = (rewards.items || []).map((s) => String(s).trim()).filter(Boolean);
  if (moves.length === 0 && items.length === 0) return;

  try {
    await runTransaction(db, async (transaction) => {
      const claimRef = doc(db, 'users', userId, 'rewardClaims', claimId);
      const claimDoc = await transaction.get(claimRef);
      if (claimDoc.exists() && claimDoc.data()?.claimed === true) {
        return;
      }

      const battleMovesRef = doc(db, 'battleMoves', userId);
      const studentRef = doc(db, 'students', userId);

      const [battleMovesDoc, studentDoc] = await Promise.all([
        transaction.get(battleMovesRef),
        transaction.get(studentRef)
      ]);

      if (moves.length > 0 && battleMovesDoc.exists()) {
        const list: Move[] = battleMovesDoc.data().moves || [];
        let changed = false;
        const updated = list.map((m) => {
          if (moves.includes(m.id)) {
            if (!m.unlocked) changed = true;
            return { ...m, unlocked: true };
          }
          return m;
        });
        if (changed) {
          transaction.update(battleMovesRef, { moves: updated });
        }
      } else if (moves.length > 0 && !battleMovesDoc.exists()) {
        console.warn(
          `[grantMissionExtraRewards] battleMoves/${userId} missing — cannot unlock move IDs:`,
          moves
        );
      }

      if (items.length > 0 && studentDoc.exists()) {
        transaction.update(studentRef, { inventory: arrayUnion(...items) });
      } else if (items.length > 0 && !studentDoc.exists()) {
        console.warn(`[grantMissionExtraRewards] students/${userId} missing — cannot grant items`);
      }

      transaction.set(
        claimRef,
        {
          claimed: true,
          claimedAt: serverTimestamp(),
          kind: 'mission_extras',
          movesGranted: moves,
          itemsGranted: items,
          userId
        },
        { merge: true }
      );
    });
  } catch (e) {
    console.error('[grantMissionExtraRewards] Failed:', e);
  }
}
