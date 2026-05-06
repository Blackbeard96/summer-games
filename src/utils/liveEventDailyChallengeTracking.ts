import { db } from '../firebase';
import { doc, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import type { Move } from '../types/battle';
import {
  moveCountsForDailyElementalChallenge,
  moveCountsForDailyManifestChallenge,
} from './dailyChallengeShared';
import { updateChallengeProgressByType } from './dailyChallengeTracker';

type DailyChallengeEventType = 'live_event';

type DailyChallengeType =
  | 'defeat_enemies'
  | 'use_elemental_move'
  | 'attack_vault'
  | 'use_action_card'
  | 'win_battle'
  | 'earn_pp'
  | 'earn_xp'
  | 'participate_live_event'
  | 'use_manifest_ability'
  | 'use_health_potion'
  | 'custom';

interface TrackDailyChallengeProgressParams {
  userId: string;
  eventType: DailyChallengeEventType;
  actionType: 'skill_resolved' | 'final_placement';
  challengeTypes: DailyChallengeType[];
  amount?: number;
  sourceId: string;
  liveEventId: string;
  skillId?: string;
  skillName?: string;
  skillCategory?: 'elemental' | 'manifest' | 'rr_candy' | 'system' | 'unknown';
  placement?: number;
  metadata?: Record<string, unknown>;
}

function dailyChallengeEventRef(userId: string, sourceId: string) {
  return doc(db, 'students', userId, 'dailyChallengeEvents', sourceId);
}

export async function trackDailyChallengeProgress(
  params: TrackDailyChallengeProgressParams
): Promise<{ ok: boolean; duplicate?: boolean }> {
  const {
    userId,
    challengeTypes,
    amount = 1,
    sourceId,
    eventType,
    actionType,
    liveEventId,
    skillId,
    skillName,
    skillCategory,
    placement,
    metadata,
  } = params;
  if (!userId || !sourceId || !liveEventId) return { ok: false };
  if (!Array.isArray(challengeTypes) || challengeTypes.length === 0) {
    console.log('[liveEventDailyChallenge] matching daily challenge found', {
      userId,
      sourceId,
      liveEventId,
      actionType,
      matches: 0,
      skillCategory,
    });
    return { ok: true };
  }

  const markerRef = dailyChallengeEventRef(userId, sourceId);
  let reserved = false;
  try {
    reserved = await runTransaction(db, async (tx) => {
      const snap = await tx.get(markerRef);
      if (snap.exists()) return false;
      tx.set(markerRef, {
        sourceId,
        userId,
        liveEventId,
        eventType,
        actionType,
        challengeTypes,
        amount,
        skillId: skillId || null,
        skillName: skillName || null,
        skillCategory: skillCategory || null,
        placement: placement ?? null,
        metadata: metadata || {},
        createdAt: serverTimestamp(),
        status: 'processing',
      });
      return true;
    });
  } catch (reservationError) {
    console.warn('[liveEventDailyChallenge] reservation failed', {
      userId,
      sourceId,
      liveEventId,
      actionType,
      error: String(reservationError),
    });
    return { ok: false };
  }

  if (!reserved) {
    console.log('[liveEventDailyChallenge] duplicate award skipped', {
      userId,
      sourceId,
      liveEventId,
      actionType,
    });
    return { ok: true, duplicate: true };
  }

  try {
    console.log('[liveEventDailyChallenge] matching daily challenge found', {
      userId,
      sourceId,
      liveEventId,
      actionType,
      challengeTypes,
      skillCategory,
      placement,
    });

    for (const type of challengeTypes) {
      await updateChallengeProgressByType(userId, type, amount);
      console.log('[liveEventDailyChallenge] challenge progress incremented', {
        userId,
        sourceId,
        challengeType: type,
        amount,
      });
    }

    await updateDoc(markerRef, {
      status: 'applied',
      appliedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (error) {
    await updateDoc(markerRef, {
      status: 'error',
      error: String(error),
      erroredAt: serverTimestamp(),
    });
    return { ok: false };
  }
}

export function detectLiveEventSkillCategory(move: Move): TrackDailyChallengeProgressParams['skillCategory'] {
  if (moveCountsForDailyManifestChallenge(move)) {
    if (move.rrCandySkillId || move.rrCandyNodeId) return 'rr_candy';
    return 'manifest';
  }
  if (moveCountsForDailyElementalChallenge(move)) return 'elemental';
  return 'unknown';
}

export function challengeTypesForLiveEventSkill(move: Move): DailyChallengeType[] {
  const out: DailyChallengeType[] = [];
  if (moveCountsForDailyElementalChallenge(move)) out.push('use_elemental_move');
  if (moveCountsForDailyManifestChallenge(move)) out.push('use_manifest_ability');
  return out;
}
