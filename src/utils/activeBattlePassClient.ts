/**
 * Client reads for the globally active battle pass (admin deploy).
 *
 * Resolution order:
 * 1. `adminSettings/season1.activeBattlePassSeasonId` when that `seasons/{id}` document exists.
 * 2. Any `seasons/*` document with `active: true` (from admin "Deploy as active").
 * 3. Any season with `linkedGameSeasonKey === 'season_1'` (default Season 1 passes from admin).
 * 4. Otherwise the first season after `sortSeasonsList` (newest `startAt` among remaining).
 *
 * This lets all players see the live pass even if `activeBattlePassSeasonId` was never written.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getSeasonById, listSeasons } from './seasonFirestoreService';
import type { Season } from '../types/season1';

async function resolveActiveBattlePassSeasonId(): Promise<string | null> {
  let adminId: string | null = null;
  try {
    const snap = await getDoc(doc(db, 'adminSettings', 'season1'));
    if (snap.exists()) {
      const raw = snap.data()?.activeBattlePassSeasonId;
      if (typeof raw === 'string' && raw.trim()) {
        adminId = raw.trim();
      }
    }
  } catch {
    adminId = null;
  }

  if (adminId) {
    const byAdmin = await getSeasonById(adminId);
    if (byAdmin) return adminId;
  }

  try {
    const all = await listSeasons();
    if (!all.length) return null;

    const activeDoc = all.find((s) => s.active);
    if (activeDoc) return activeDoc.id;

    const season1Linked = all.find((s) => s.linkedGameSeasonKey === 'season_1');
    if (season1Linked) return season1Linked.id;

    return all[0]?.id ?? adminId;
  } catch (e) {
    console.warn('[activeBattlePassClient] listSeasons fallback failed', e);
    return adminId;
  }
}

export async function fetchActiveBattlePassSeasonId(): Promise<string | null> {
  return resolveActiveBattlePassSeasonId();
}

export async function fetchActiveBattlePassSeason(): Promise<Season | null> {
  const id = await resolveActiveBattlePassSeasonId();
  if (!id) return null;
  return getSeasonById(id);
}
