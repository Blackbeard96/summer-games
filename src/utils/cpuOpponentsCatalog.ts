/**
 * CPU opponent roster for mission builder, battle setup, etc.
 * Source of truth for custom enemies is Firestore adminSettings/cpuOpponentMoves (same as CPU Opponent Moves admin).
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  DEFAULT_OPPONENTS,
  type CPUOpponent,
} from '../components/CPUOpponentMovesAdmin';

function sortByName(a: CPUOpponent, b: CPUOpponent): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/**
 * Loads opponents from Firestore and merges in any defaults not present (mirrors CPUOpponentMovesAdmin load).
 */
export async function fetchCpuOpponentsMergedWithDefaults(): Promise<CPUOpponent[]> {
  try {
    const cpuMovesRef = doc(db, 'adminSettings', 'cpuOpponentMoves');
    const snap = await getDoc(cpuMovesRef);
    if (!snap.exists()) {
      return [...DEFAULT_OPPONENTS].sort(sortByName);
    }
    const data = snap.data();
    if (!data.opponents || !Array.isArray(data.opponents)) {
      return [...DEFAULT_OPPONENTS].sort(sortByName);
    }
    const fromDb = data.opponents as CPUOpponent[];
    const existingIds = new Set(fromDb.map((o) => o.id));
    const missingDefaults = DEFAULT_OPPONENTS.filter((o) => !existingIds.has(o.id));
    return [...fromDb, ...missingDefaults].sort(sortByName);
  } catch (e) {
    console.error('[cpuOpponentsCatalog] Failed to load, using defaults only', e);
    return [...DEFAULT_OPPONENTS].sort(sortByName);
  }
}

export type { CPUOpponent };
