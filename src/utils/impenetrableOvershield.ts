/**
 * Impenetrable artifact perk: grants one vault overshield per Eastern calendar day when none is active.
 */

import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import type { Vault } from '../types/battle';
import { getTodayDateStringEastern } from './dailyChallengeDateUtils';
import { hasImpenetrablePerkEquipped } from './artifactPerkEffects';

export async function applyImpenetrableDailyOvershieldIfEligible(
  userId: string,
  vault: Vault,
  equipped: Record<string, unknown> | null | undefined,
  rawCatalog: Record<string, unknown> | null | undefined
): Promise<{ applied: boolean }> {
  if (!hasImpenetrablePerkEquipped(equipped, rawCatalog)) {
    return { applied: false };
  }

  const today = getTodayDateStringEastern();
  const overshield = vault.overshield || 0;
  const lastGrant = vault.impenetrableLastGrantDateEastern;

  if (overshield > 0) {
    return { applied: false };
  }
  if (lastGrant === today) {
    return { applied: false };
  }

  const vaultRef = doc(db, 'vaults', userId);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(vaultRef);
      if (!snap.exists()) return;
      const v = snap.data() as Vault;
      if ((v.overshield || 0) > 0) return;
      if (v.impenetrableLastGrantDateEastern === today) return;

      transaction.update(vaultRef, {
        overshield: 1,
        impenetrableLastGrantDateEastern: today,
      });
    });
    return { applied: true };
  } catch (e) {
    console.error('Impenetrable: daily overshield grant failed:', e);
    return { applied: false };
  }
}
