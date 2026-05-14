import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { refreshShutdownIfExpired } from './mstCivicEconomyService';

const PLAYER = 'mstCivicPlayerState';

/**
 * When true, block gameplay PP/XP/challenge rewards (job pay still applies separately).
 */
export async function isCivicShutdownActive(studentId: string): Promise<boolean> {
  await refreshShutdownIfExpired(studentId);
  const snap = await getDoc(doc(db, PLAYER, studentId));
  if (!snap.exists()) return false;
  const data = snap.data() as { taxStatus?: string; shutdownEndsAt?: { toMillis: () => number } };
  if (data.taxStatus !== 'shutdown') return false;
  const end = data.shutdownEndsAt?.toMillis?.();
  if (!end || end <= Date.now()) return false;
  return true;
}
