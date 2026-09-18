/**
 * Index of session-end rewards owed to a player so Home/login can reclaim
 * without the student needing to reopen the Live Event room.
 *
 * Doc id: `${sessionId}_${playerId}`
 * Path: liveEventPendingClaims/{id}
 */

import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { claimAllLiveEventSessionEndRewards } from './inSessionStatsService';

const COLLECTION = 'liveEventPendingClaims';

function claimDocId(sessionId: string, playerId: string): string {
  return `${sessionId}_${playerId}`;
}

/** Host calls at finalize so the student can discover pending sessions later. */
export async function registerLiveEventPendingClaim(
  sessionId: string,
  playerId: string
): Promise<void> {
  if (!sessionId || !playerId) return;
  await setDoc(
    doc(db, COLLECTION, claimDocId(sessionId, playerId)),
    {
      sessionId,
      playerId,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function markLiveEventPendingClaimSettled(
  sessionId: string,
  playerId: string
): Promise<void> {
  if (!sessionId || !playerId) return;
  try {
    await updateDoc(doc(db, COLLECTION, claimDocId(sessionId, playerId)), {
      status: 'settled',
      settledAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    /* doc may not exist for older sessions */
  }
}

/**
 * Claim all outstanding Live Event session-end rewards for this player
 * (from recent pending index docs). Idempotent.
 */
export async function claimOutstandingLiveEventRewardsForPlayer(
  playerId: string
): Promise<{ sessionsChecked: number; ok: boolean }> {
  if (!playerId) return { sessionsChecked: 0, ok: false };
  try {
    const q = query(
      collection(db, COLLECTION),
      where('playerId', '==', playerId),
      where('status', '==', 'pending'),
      limit(25)
    );
    const snap = await getDocs(q);
    const sessionIds = Array.from(
      new Set(
        snap.docs
          .map((d) => String((d.data() as { sessionId?: string }).sessionId || ''))
          .filter(Boolean)
      )
    );
    for (const sessionId of sessionIds) {
      await claimAllLiveEventSessionEndRewards(sessionId, playerId);
    }
    return { sessionsChecked: sessionIds.length, ok: true };
  } catch (e) {
    console.warn('[liveEventPendingClaims] claimOutstanding failed', e);
    return { sessionsChecked: 0, ok: false };
  }
}
