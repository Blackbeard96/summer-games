import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { LEVEL2_MANIFEST_RESPEC_PP, LEVEL2_MANIFEST_RESPEC_TRUTH_METAL } from '../constants/level2ManifestRespec';

/**
 * Charges vault PP and Truth Metal (users + students, same split as RR Candy upgrades) so the player can re-enter
 * the Level 2 Manifest builder. Mirrors `upgradeMove` PP path (vault only) + RR Truth Metal deduction.
 */
export async function payLevel2ManifestRespecCost(
  userId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const vaultRef = doc(db, 'vaults', userId);
  const userRef = doc(db, 'users', userId);
  const studentRef = doc(db, 'students', userId);

  try {
    await runTransaction(db, async (tx) => {
      const vSnap = await tx.get(vaultRef);
      if (!vSnap.exists()) {
        throw new Error('Vault not found. Try again after your profile loads.');
      }
      const vp = Math.floor(Number(vSnap.data().currentPP) || 0);
      if (vp < LEVEL2_MANIFEST_RESPEC_PP) {
        throw new Error(
          `Insufficient PP. You need ${LEVEL2_MANIFEST_RESPEC_PP.toLocaleString()} PP (you have ${vp.toLocaleString()}).`
        );
      }

      const [uSnap, sSnap] = await Promise.all([tx.get(userRef), tx.get(studentRef)]);
      const uTm = uSnap.exists() ? Math.floor(Number(uSnap.data().truthMetal) || 0) : 0;
      const sTm = sSnap.exists() ? Math.floor(Number(sSnap.data().truthMetal) || 0) : 0;
      if (uTm + sTm < LEVEL2_MANIFEST_RESPEC_TRUTH_METAL) {
        throw new Error(
          `Insufficient Truth Metal Shards. You need ${LEVEL2_MANIFEST_RESPEC_TRUTH_METAL} (you have ${uTm + sTm}).`
        );
      }

      let remaining = LEVEL2_MANIFEST_RESPEC_TRUTH_METAL;
      let nextUserTm = uTm;
      let nextStudentTm = sTm;
      if (nextUserTm >= remaining) {
        nextUserTm -= remaining;
        remaining = 0;
      } else {
        remaining -= nextUserTm;
        nextUserTm = 0;
        nextStudentTm = Math.max(0, nextStudentTm - remaining);
      }

      tx.update(vaultRef, { currentPP: vp - LEVEL2_MANIFEST_RESPEC_PP });

      if (uSnap.exists()) {
        tx.update(userRef, { truthMetal: nextUserTm });
      }
      if (sSnap.exists()) {
        tx.update(studentRef, { truthMetal: nextStudentTm });
      }
    });

    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, message };
  }
}
