import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { EnergyType } from '../types/season1';
import { applyEnergyGain, SEASON1_MAX_ENERGY_PER_TICK } from './season1Energy';
import { mergeSeason1FromStudentData } from './season1PlayerHydration';

/**
 * Award energy with throttling and safe merge into `students/{uid}.season1`.
 * Returns false if student doc missing or write fails.
 */
export async function awardEnergy(
  playerId: string,
  energyType: EnergyType,
  amount: number,
  _source: string
): Promise<boolean> {
  const ref = doc(db, 'students', playerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const raw = snap.data();
  const s1 = mergeSeason1FromStudentData(raw.season1 as Record<string, unknown> | undefined);
  const cap = Math.min(Math.max(0, amount), SEASON1_MAX_ENERGY_PER_TICK);
  const applied = applyEnergyGain(s1.energies, s1.energyXP, s1.energyLevels, energyType, cap);
  try {
    await updateDoc(ref, {
      season1: {
        ...s1,
        energies: applied.energies,
        energyXP: applied.energyXP,
        energyLevels: applied.energyLevels,
      },
    });
    return true;
  } catch (e) {
    console.warn('[season1] awardEnergy failed', e);
    return false;
  }
}
