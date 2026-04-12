/**
 * Client reads for the globally active battle pass (admin deploy).
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getSeasonById } from './seasonFirestoreService';
import type { Season } from '../types/season1';

export async function fetchActiveBattlePassSeasonId(): Promise<string | null> {
  const snap = await getDoc(doc(db, 'adminSettings', 'season1'));
  if (!snap.exists()) return null;
  const raw = snap.data()?.activeBattlePassSeasonId;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export async function fetchActiveBattlePassSeason(): Promise<Season | null> {
  const id = await fetchActiveBattlePassSeasonId();
  if (!id) return null;
  return getSeasonById(id);
}
