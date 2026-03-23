/**
 * Mission Event Engine
 *
 * Centralized service for processing gameplay events and updating mission progress.
 * Powers the universal Challenge/Feat system (Ghost of Tsushima-style).
 *
 * Usage:
 *   processMissionEvent(playerId, 'practice_battle_completed')
 *   processMissionEvent(playerId, 'skill_used', { skillType: 'manifest' })
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  runTransaction,
  increment
} from 'firebase/firestore';
import { db } from '../firebase';
import { getMissionTemplate } from './missionsService';
import { grantChallengeRewards } from './challengeRewards';
import type { MissionTemplate, MissionTriggerType, PlayerMission } from '../types/missions';
import type { ChallengeReward } from '../types/chapters';

export interface MissionEventPayload {
  /** Optional deduplication - if same eventId processed twice, second is ignored */
  eventId?: string;
  /** For skill_used: 'manifest' | 'elemental' | 'generic' */
  skillType?: string;
  /** For specific_skill_used: skill/move name */
  skillName?: string;
  /** For enemy_defeated / practice: opponent ID */
  opponentId?: string;
  /** For cumulative_value: amount to add (e.g. XP earned, PP earned) */
  amount?: number;
  /** For unique_targets: target ID to record */
  targetId?: string;
  [key: string]: unknown;
}

const DEDUPE_COLLECTION = 'missionEventDedupe';
const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Process a gameplay event and update matching mission progress
 */
export async function processMissionEvent(
  playerId: string,
  eventType: MissionTriggerType | string,
  payload?: MissionEventPayload
): Promise<{ processed: number; completed: string[] }> {
  const eventId = payload?.eventId;
  if (eventId) {
    const alreadyProcessed = await checkEventDedupe(playerId, eventId);
    if (alreadyProcessed) {
      return { processed: 0, completed: [] };
    }
  }

  const missions = await getMissionsByTrigger(eventType);
  if (missions.length === 0) {
    return { processed: 0, completed: [] };
  }

  const completed: string[] = [];

  for (const mission of missions) {
    if (!matchesPayload(mission, payload, eventType)) continue;

    const result = await processMissionForEvent(playerId, mission, eventType, payload);
    if (result.updated) {
      if (eventId) {
        await recordEventDedupe(playerId, eventId);
      }
      if (result.completed) {
        completed.push(mission.id);
      }
    }
  }

  return { processed: missions.length, completed };
}

async function getMissionsByTrigger(triggerType: string): Promise<MissionTemplate[]> {
  try {
    const missionsRef = collection(db, 'missions');
    const q = query(
      missionsRef,
      where('triggerType', '==', triggerType)
    );
    const snapshot = await getDocs(q);
    const missions: MissionTemplate[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      missions.push({
        id: docSnap.id,
        title: data.title || 'Untitled',
        description: data.description || '',
        missionCategory: data.missionCategory || 'SIDE',
        deliveryChannels: data.deliveryChannels || ['HUB_NPC'],
        triggerType: data.triggerType,
        progressType: data.progressType || 'count',
        targetValue: data.targetValue ?? 1,
        rewards: data.rewards || {},
        metadata: data.metadata || {},
        missionType: data.missionType,
        sourceArea: data.sourceArea,
        difficultyTier: data.difficultyTier,
        isRepeatable: data.isRepeatable,
        repeatInterval: data.repeatInterval,
        isHidden: data.isHidden
      } as MissionTemplate);
    });
    return missions;
  } catch (error) {
    console.error('[MissionEventEngine] Error fetching missions by trigger:', error);
    return [];
  }
}

function matchesPayload(
  mission: MissionTemplate,
  payload: MissionEventPayload | undefined,
  eventType: string
): boolean {
  const meta = mission.metadata || {};
  if (!payload) return true;

  if (eventType === 'skill_used' || eventType === 'manifest_skill_used' || eventType === 'elemental_skill_used') {
    const requiredSkillType = meta.skillType as string | undefined;
    if (requiredSkillType && payload.skillType !== requiredSkillType) {
      return false;
    }
  }

  if (eventType === 'enemy_defeated' || eventType === 'practice_battle_completed') {
    const requiredOpponentId = meta.opponentId as string | undefined;
    if (requiredOpponentId && payload.opponentId !== requiredOpponentId) {
      return false;
    }
  }

  return true;
}

async function processMissionForEvent(
  playerId: string,
  mission: MissionTemplate,
  eventType: string,
  payload: MissionEventPayload | undefined
): Promise<{ updated: boolean; completed: boolean }> {
  const targetValue = mission.targetValue ?? 1;
  const progressType = mission.progressType || 'count';
  const incrementAmount = progressType === 'cumulative_value' && payload?.amount != null
    ? payload.amount
    : 1;

  let shouldGrantRewards = false;
  const result = await runTransaction(db, async (transaction) => {
    const playerMissionsRef = collection(db, 'playerMissions');
    const q = query(
      playerMissionsRef,
      where('userId', '==', playerId),
      where('missionId', '==', mission.id)
    );
    const snapshot = await getDocs(q);

    let playerMission: PlayerMission | null = null;
    let playerMissionRef = doc(db, 'playerMissions', 'placeholder');

    if (snapshot.empty) {
      const fullMission = await getMissionTemplate(mission.id);
      if (!fullMission) return { updated: false, completed: false };

      if (!fullMission.triggerType) return { updated: false, completed: false };

      const newRef = doc(collection(db, 'playerMissions'));
      playerMissionRef = newRef;
      playerMission = {
        id: newRef.id,
        userId: playerId,
        missionId: mission.id,
        status: 'active',
        source: 'HUB_NPC',
        acceptedAt: serverTimestamp(),
        progress: { main: 0 },
        autoAccepted: true
      };
      transaction.set(newRef, {
        userId: playerId,
        missionId: mission.id,
        status: 'active',
        source: 'HUB_NPC',
        acceptedAt: serverTimestamp(),
        progress: { main: 0 },
        autoAccepted: true
      });
    } else {
      const docSnap = snapshot.docs[0];
      playerMissionRef = doc(db, 'playerMissions', docSnap.id);
      const data = docSnap.data();
      playerMission = {
        id: docSnap.id,
        userId: data.userId,
        missionId: data.missionId,
        status: data.status,
        source: data.source,
        acceptedAt: data.acceptedAt,
        completedAt: data.completedAt,
        progress: data.progress || { main: 0 }
      };
    }

    if (!playerMission || playerMission.status === 'completed') {
      if (playerMission?.status === 'completed' && mission.isRepeatable) {
        const newRef = doc(collection(db, 'playerMissions'));
        transaction.set(newRef, {
          userId: playerId,
          missionId: mission.id,
          status: 'active',
          source: 'HUB_NPC',
          acceptedAt: serverTimestamp(),
          progress: { main: incrementAmount },
          autoAccepted: true
        });
        const completed = incrementAmount >= targetValue;
        if (completed) {
          transaction.update(newRef, {
            status: 'completed',
            completedAt: serverTimestamp(),
            progress: { main: targetValue }
          });
        }
        return { updated: true, completed };
      }
      return { updated: false, completed: false };
    }

    const currentProgress = playerMission.progress?.main ?? 0;
    const newProgress = currentProgress + incrementAmount;
    const isComplete = newProgress >= targetValue;

    transaction.update(playerMissionRef, {
      progress: { ...playerMission.progress, main: Math.min(newProgress, targetValue) },
      ...(isComplete
        ? { status: 'completed', completedAt: serverTimestamp() }
        : {})
    });

    if (isComplete) {
      shouldGrantRewards = true;
    }

    return { updated: true, completed: isComplete };
  });

  if (shouldGrantRewards) {
    const rewards = buildChallengeRewards(mission);
    if (rewards.length > 0) {
      grantMissionRewards(playerId, mission.id, rewards, mission.title).catch((err) =>
        console.error('[MissionEventEngine] Failed to grant rewards:', err)
      );
    }
  }

  return result;
}

function buildChallengeRewards(mission: MissionTemplate): ChallengeReward[] {
  const rewards: ChallengeReward[] = [];
  const r = mission.rewards || {};

  if (r.xp && r.xp > 0) {
    rewards.push({ type: 'xp', value: r.xp, description: `${r.xp} XP` });
  }
  if (r.pp && r.pp > 0) {
    rewards.push({ type: 'pp', value: r.pp, description: `${r.pp} PP` });
  }
  if (r.truthMetal && r.truthMetal > 0) {
    rewards.push({ type: 'truthMetal', value: r.truthMetal, description: `${r.truthMetal} Truth Metal` });
  }
  if (r.artifactIds && r.artifactIds.length > 0) {
    for (const aid of r.artifactIds) {
      rewards.push({ type: 'artifact', value: aid, description: `Artifact: ${aid}` });
    }
  }

  return rewards;
}

async function grantMissionRewards(
  userId: string,
  missionId: string,
  rewards: ChallengeReward[],
  missionTitle?: string
): Promise<void> {
  const challengeId = `mission_${missionId}`;
  const result = await grantChallengeRewards(userId, challengeId, rewards, missionTitle);
  if (!result.success && !result.alreadyClaimed) {
    console.error('[MissionEventEngine] Failed to grant rewards:', result.error);
  }
}

async function checkEventDedupe(playerId: string, eventId: string): Promise<boolean> {
  try {
    const dedupeRef = doc(db, 'students', playerId, DEDUPE_COLLECTION, eventId);
    const snap = await getDoc(dedupeRef);
    if (!snap.exists()) return false;
    const data = snap.data();
    const ts = data?.processedAt?.toMillis?.() ?? 0;
    if (Date.now() - ts > DEDUPE_TTL_MS) return false;
    return true;
  } catch {
    return false;
  }
}

async function recordEventDedupe(playerId: string, eventId: string): Promise<void> {
  try {
    const dedupeRef = doc(db, 'students', playerId, DEDUPE_COLLECTION, eventId);
    await setDoc(dedupeRef, { processedAt: serverTimestamp() }, { merge: true });
  } catch (error) {
    console.warn('[MissionEventEngine] Failed to record dedupe:', error);
  }
}
