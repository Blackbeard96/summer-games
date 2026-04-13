/**
 * Missions Service
 * 
 * Centralized service for mission operations (accept, track, complete)
 * Supports both SIDE and STORY missions
 */

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteField,
  query, 
  where, 
  serverTimestamp,
  writeBatch,
  runTransaction
} from 'firebase/firestore';
import { db } from '../firebase';
import { createLiveFeedMilestone } from '../services/liveFeed';
import { updateProgressOnChallengeComplete } from './chapterProgression';
import { grantChallengeRewards } from './challengeRewards';
import { CHAPTERS } from '../types/chapters';
import { shouldShareEvent } from '../services/liveFeedPrivacy';
import { getLevelFromXP } from '../utils/leveling';
import { parseMissionRewardEntriesFromFirestore } from './seasonFirestoreService';
import {
  grantPackedBattlePassMissionRewards,
  mergeBattleStepRewardsIntoFlat,
  partitionMissionRewardEntries,
} from './missionBattlePassRewards';
import { 
  MissionTemplate, 
  PlayerMission, 
  PlayerStoryProgress,
  MissionCategory,
  DeliveryChannel,
  MissionStatus,
  MissionSource,
  ProfileJourneyStageId
} from '../types/missions';

export function parseMissionRewardsFromDoc(raw: unknown): MissionTemplate['rewards'] {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const entries = parseMissionRewardEntriesFromFirestore(r.entries);
  const base = { ...(r as Record<string, unknown>) } as NonNullable<MissionTemplate['rewards']>;
  if (entries.length > 0) {
    return { ...base, entries };
  }
  const { entries: _removed, ...rest } = base as NonNullable<MissionTemplate['rewards']> & {
    entries?: unknown;
  };
  return rest;
}

function timestampToMs(ts: unknown): number | null {
  const t = ts as { toMillis?: () => number; seconds?: number; nanoseconds?: number } | undefined;
  if (!t) return null;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000 + (typeof t.nanoseconds === 'number' ? t.nanoseconds / 1e6 : 0);
  return null;
}

/** Milliseconds from Firestore Timestamp or legacy fields (for stable default ordering). */
export function missionCreatedAtMs(m: MissionTemplate): number {
  return timestampToMs(m.createdAt) ?? 0;
}

/**
 * Oldest-first sort key: createdAt, else updatedAt, else 0.
 * Avoids title-based tie-breaking (e.g. "Silence…" before "The Noise" when dates were missing/equal).
 */
export function missionChronologicalSortMs(m: MissionTemplate): number {
  return timestampToMs(m.createdAt) ?? timestampToMs(m.updatedAt) ?? 0;
}

/**
 * Sort missions for NPC hub lists: explicit hubDisplayOrder first (lower first), then oldest-first by
 * created time (later-created missions get higher display numbers 2, 3, …), then stable id order.
 */
export function sortMissionsForHubList(missions: MissionTemplate[]): MissionTemplate[] {
  return [...missions].sort((a, b) => {
    const orderA =
      typeof a.hubDisplayOrder === 'number' && Number.isFinite(a.hubDisplayOrder)
        ? a.hubDisplayOrder
        : Number.MAX_SAFE_INTEGER;
    const orderB =
      typeof b.hubDisplayOrder === 'number' && Number.isFinite(b.hubDisplayOrder)
        ? b.hubDisplayOrder
        : Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    const t = missionChronologicalSortMs(a) - missionChronologicalSortMs(b);
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Get mission template by ID
 */
export async function getMissionTemplate(missionId: string): Promise<MissionTemplate | null> {
  try {
    const missionRef = doc(db, 'missions', missionId);
    const missionDoc = await getDoc(missionRef);
    
    if (!missionDoc.exists()) {
      return null;
    }
    
    const data = missionDoc.data();
    
    // Apply defaults for backward compatibility
    return {
      id: missionDoc.id,
      title: data.title || 'Untitled Mission',
      description: data.description || '',
      npc: data.npc || null,
      missionCategory: data.missionCategory || 'SIDE',
      deliveryChannels: data.deliveryChannels || ['HUB_NPC'],
      story: data.story || undefined,
      profile: data.profile || undefined,
      playerJourneyLink: data.playerJourneyLink || undefined,
      gating: data.gating || undefined,
      rewards: parseMissionRewardsFromDoc(data.rewards),
      objectives: data.objectives || [],
      sequence: Array.isArray(data.sequence) ? data.sequence : undefined,
      sequenceVersion: typeof data.sequenceVersion === 'number' ? data.sequenceVersion : undefined,
      hubDisplayOrder:
        typeof data.hubDisplayOrder === 'number' && Number.isFinite(data.hubDisplayOrder)
          ? data.hubDisplayOrder
          : undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    } as MissionTemplate;
  } catch (error) {
    console.error('Error fetching mission template:', error);
    return null;
  }
}

/**
 * Get all mission templates (with optional filters)
 */
export async function getMissionTemplates(filters?: {
  category?: MissionCategory;
  npc?: string;
  chapterId?: string;
  deliveryChannel?: DeliveryChannel;
}): Promise<MissionTemplate[]> {
  try {
    const missionsRef = collection(db, 'missions');
    let q = query(missionsRef);
    
    // Apply filters if provided
    if (filters?.category) {
      q = query(q, where('missionCategory', '==', filters.category));
    }
    if (filters?.npc) {
      q = query(q, where('npc', '==', filters.npc));
    }
    if (filters?.chapterId && filters?.category === 'STORY') {
      q = query(q, where('story.chapterId', '==', filters.chapterId));
    }
    
    const snapshot = await getDocs(q);
    const missions: MissionTemplate[] = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      
      // Apply defaults
      const mission: MissionTemplate = {
        id: doc.id,
        title: data.title || 'Untitled Mission',
        description: data.description || '',
        npc: data.npc || null,
        missionCategory: data.missionCategory || 'SIDE',
        deliveryChannels: data.deliveryChannels || ['HUB_NPC'],
        story: data.story || undefined,
        profile: data.profile || undefined,
        playerJourneyLink: data.playerJourneyLink || undefined,
        gating: data.gating || undefined,
        rewards: parseMissionRewardsFromDoc(data.rewards),
        objectives: data.objectives || [],
        sequence: Array.isArray(data.sequence) ? data.sequence : undefined,
        sequenceVersion: typeof data.sequenceVersion === 'number' ? data.sequenceVersion : undefined,
        hubDisplayOrder:
          typeof data.hubDisplayOrder === 'number' && Number.isFinite(data.hubDisplayOrder)
            ? data.hubDisplayOrder
            : undefined,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt
      };
      
      // Apply delivery channel filter if provided
      if (filters?.deliveryChannel) {
        if (!mission.deliveryChannels.includes(filters.deliveryChannel)) {
          return; // Skip this mission
        }
      }
      
      missions.push(mission);
    });
    
    return missions;
  } catch (error) {
    console.error('Error fetching mission templates:', error);
    return [];
  }
}

/**
 * Get profile journey stage content (text players wrote for each stage on their Power Card)
 */
export async function getProfileJourneyContent(userId: string): Promise<Record<string, string>> {
  try {
    const userRef = doc(db, 'students', userId);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) return {};
    const data = userDoc.data();
    return (data?.journeyStageContent && typeof data.journeyStageContent === 'object') ? data.journeyStageContent : {};
  } catch (error) {
    console.error('Error fetching profile journey content:', error);
    return {};
  }
}

/**
 * Save text for a profile journey stage (used when completing Profile missions)
 */
export async function saveProfileJourneyText(
  userId: string,
  journeyStageId: ProfileJourneyStageId | string,
  text: string
): Promise<void> {
  const userRef = doc(db, 'students', userId);
  const userDoc = await getDoc(userRef);
  const existing = userDoc.exists() ? (userDoc.data()?.journeyStageContent || {}) : {};
  const updated = { ...existing, [journeyStageId]: text };
  await updateDoc(userRef, { journeyStageContent: updated });
}

/**
 * Get player's mission instances
 */
export async function getPlayerMissions(userId: string): Promise<PlayerMission[]> {
  try {
    const playerMissionsRef = collection(db, 'playerMissions');
    const q = query(playerMissionsRef, where('userId', '==', userId));
    const snapshot = await getDocs(q);
    
    const missions: PlayerMission[] = [];
    snapshot.forEach((doc) => {
      missions.push({
        id: doc.id,
        ...doc.data()
      } as PlayerMission);
    });
    
    return missions;
  } catch (error) {
    console.error('Error fetching player missions:', error);
    return [];
  }
}

/**
 * Get player's story progress
 */
export async function getPlayerStoryProgress(userId: string): Promise<PlayerStoryProgress | null> {
  try {
    const progressRef = doc(db, 'playerStoryProgress', userId);
    const progressDoc = await getDoc(progressRef);
    
    if (!progressDoc.exists()) {
      // Initialize default progress
      const defaultProgress: PlayerStoryProgress = {
        userId,
        currentChapterId: 'chapter_1',
        unlockedChapterIds: ['chapter_1'],
        updatedAt: serverTimestamp()
      };
      await setDoc(progressRef, defaultProgress);
      return defaultProgress;
    }
    
    return progressDoc.data() as PlayerStoryProgress;
  } catch (error) {
    console.error('Error fetching player story progress:', error);
    return null;
  }
}

/**
 * Get active story mission for a chapter
 */
export async function getActiveStoryMissionForChapter(
  userId: string, 
  chapterId: string
): Promise<PlayerMission | null> {
  try {
    const playerMissions = await getPlayerMissions(userId);
    
    // Find active story mission for this chapter
    for (const playerMission of playerMissions) {
      if (playerMission.status === 'active') {
        const template = await getMissionTemplate(playerMission.missionId);
        if (template?.missionCategory === 'STORY' && 
            template?.story?.chapterId === chapterId) {
          return playerMission;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching active story mission:', error);
    return null;
  }
}

/**
 * Check if prerequisites are met for a mission
 */
export async function checkPrerequisites(
  userId: string, 
  mission: MissionTemplate
): Promise<boolean> {
  if (!mission.story?.prerequisites || mission.story.prerequisites.length === 0) {
    return true;
  }
  
  try {
    const playerMissions = await getPlayerMissions(userId);
    const completedMissionIds = playerMissions
      .filter(pm => pm.status === 'completed')
      .map(pm => pm.missionId);
    
    // All prerequisites must be completed
    return mission.story.prerequisites.every(prereqId => 
      completedMissionIds.includes(prereqId)
    );
  } catch (error) {
    console.error('Error checking prerequisites:', error);
    return false;
  }
}

/**
 * Check if player meets gating requirements
 */
export async function checkGating(
  userId: string, 
  mission: MissionTemplate
): Promise<{ met: boolean; reason?: string }> {
  if (!mission.gating) {
    return { met: true };
  }
  
  try {
    // Check player level
    if (mission.gating.minPlayerLevel) {
      const userDoc = await getDoc(doc(db, 'students', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const userLevel = userData.level || 1;
        if (userLevel < mission.gating.minPlayerLevel) {
          return { 
            met: false, 
            reason: `Requires level ${mission.gating.minPlayerLevel}` 
          };
        }
      }
    }
    
    // Check chapter unlock
    if (mission.gating.requiresChapterUnlocked && mission.gating.chapterId) {
      const progress = await getPlayerStoryProgress(userId);
      if (!progress?.unlockedChapterIds.includes(mission.gating.chapterId)) {
        return { 
          met: false, 
          reason: `Chapter ${mission.gating.chapterId} must be unlocked` 
        };
      }
    }
    
    return { met: true };
  } catch (error) {
    console.error('Error checking gating:', error);
    return { met: false, reason: 'Error checking requirements' };
  }
}

/**
 * Accept a mission
 * 
 * For STORY missions: Only one active STORY mission per chapter allowed
 * For SIDE missions: Multiple active missions allowed
 */
export async function acceptMission(
  userId: string,
  missionId: string,
  source: MissionSource
): Promise<{ success: boolean; error?: string; playerMissionId?: string }> {
  try {
    // Get mission template
    const mission = await getMissionTemplate(missionId);
    if (!mission) {
      return { success: false, error: 'Mission not found' };
    }
    
    // Check if already accepted
    const playerMissions = await getPlayerMissions(userId);
    const existingMission = playerMissions.find(pm => pm.missionId === missionId);
    
    if (existingMission) {
      if (existingMission.status === 'active') {
        return {
          success: false,
          error: 'Mission already active',
          playerMissionId: existingMission.id,
        };
      }
      if (existingMission.status === 'completed') {
        return { success: false, error: 'Mission already completed' };
      }
    }
    
    // For STORY missions: Check if another story mission is active for this chapter
    if (mission.missionCategory === 'STORY' && mission.story) {
      const activeStoryMission = await getActiveStoryMissionForChapter(
        userId, 
        mission.story.chapterId
      );
      if (activeStoryMission) {
        return { 
          success: false, 
          error: 'Finish your current story objective first.' 
        };
      }
    }
    
    // Check prerequisites
    const prerequisitesMet = await checkPrerequisites(userId, mission);
    if (!prerequisitesMet) {
      return { success: false, error: 'Prerequisites not met' };
    }
    
    // Check gating
    const gatingCheck = await checkGating(userId, mission);
    if (!gatingCheck.met) {
      return { success: false, error: gatingCheck.reason || 'Requirements not met' };
    }
    
    // Create or update player mission
    const playerMissionRef = doc(collection(db, 'playerMissions'));
    const playerMission: PlayerMission = {
      id: playerMissionRef.id,
      userId,
      missionId,
      status: 'active',
      source,
      acceptedAt: serverTimestamp(),
      progress: {}
    };
    
    await setDoc(playerMissionRef, playerMission);
    
    // Log to live feed (if privacy settings allow)
    try {
      const shouldShare = await shouldShareEvent(userId, 'mission_accept');
      if (shouldShare) {
        const userDoc = await getDoc(doc(db, 'students', userId));
        const userData = userDoc.exists() ? userDoc.data() : null;
        const userDisplayName = userData?.displayName || 'Unknown';
        const userPhotoURL = userData?.photoURL || undefined;
        const userRole = userData?.role || undefined;
        const userLevel = userData ? getLevelFromXP(userData.xp || 0) : undefined;
        
        await createLiveFeedMilestone(
          userId,
          userDisplayName,
          userPhotoURL,
          userRole,
          userLevel,
          'mission_accept',
          {
            missionId,
            missionTitle: mission.title,
            missionCategory: mission.missionCategory
          },
          `mission_accept_${userId}_${missionId}`
        );
      }
    } catch (error) {
      console.error('Error logging mission accept to live feed:', error);
      // Don't fail the mission accept if live feed logging fails
    }
    
    return { success: true, playerMissionId: playerMissionRef.id };
  } catch (error) {
    console.error('Error accepting mission:', error);
    return { success: false, error: 'Failed to accept mission' };
  }
}

/**
 * Complete a mission
 */
export async function completeMission(
  userId: string,
  playerMissionId: string
): Promise<{ success: boolean; error?: string; pendingRewardChoices?: boolean }> {
  try {
    const playerMissionRef = doc(db, 'playerMissions', playerMissionId);
    const playerMissionDoc = await getDoc(playerMissionRef);
    
    if (!playerMissionDoc.exists()) {
      return { success: false, error: 'Mission not found' };
    }
    
    const playerMission = playerMissionDoc.data() as PlayerMission;
    if (playerMission.status === 'completed') {
      return { success: false, error: 'Mission already completed' };
    }
    
    const mission = await getMissionTemplate(playerMission.missionId);
    const { fixedFlat, choiceGroups } = partitionMissionRewardEntries(mission);
    const fixedFlatForGrant = mergeBattleStepRewardsIntoFlat(fixedFlat, mission);

    const pendingPatch =
      choiceGroups.length > 0
        ? {
            missionRewardChoicesPending: {
              groups: choiceGroups.map((g) => ({
                groupId: g.id,
                pickCount: g.pickCount,
                displayName: g.displayName,
                description: g.description || '',
                options: g.options,
              })),
            },
          }
        : { missionRewardChoicesPending: deleteField() };

    await updateDoc(playerMissionRef, {
      status: 'completed',
      completedAt: serverTimestamp(),
      sequencePlayheadIndex: deleteField(),
      ...pendingPatch,
    });
    
    // Check if mission is linked to Player Journey step
    let journeyStepCompleted = false;
    if (mission?.playerJourneyLink) {
      const { chapterId, challengeId } = mission.playerJourneyLink;
      
      // Check if journey step is already completed to prevent double completion
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const chapterProgress = userData.chapters?.[String(chapterId)];
        const challengeProgress = chapterProgress?.challenges?.[challengeId];
        
        // Only complete if not already completed
        if (!challengeProgress?.isCompleted && challengeProgress?.status !== 'approved') {
          // Use the canonical progression engine to mark journey step complete
          const progressionResult = await updateProgressOnChallengeComplete(
            userId,
            chapterId,
            challengeId
          );
          
          if (progressionResult.success && !progressionResult.alreadyCompleted) {
            journeyStepCompleted = true;
            
            // Grant journey step rewards if challenge definition exists
            const chapter = CHAPTERS.find(c => c.id === chapterId);
            const challenge = chapter?.challenges.find(c => c.id === challengeId);
            
            if (challenge && challenge.rewards.length > 0) {
              // Grant journey step rewards (these are separate from mission rewards)
              // Note: We'll grant mission rewards below, so we need to be careful about double rewards
              // For MVP: If mission rewards match journey rewards, only grant once
              // Otherwise, grant both but ensure idempotency
              const rewardResult = await grantChallengeRewards(
                userId,
                challengeId,
                challenge.rewards,
                challenge.title
              );
              
              if (!rewardResult.success) {
                console.error('Error granting journey step rewards:', rewardResult.error);
              }
            }
          }
        }
      }
    }
    
    if (fixedFlatForGrant.length > 0 && mission) {
      const claimId = `mission_complete_${playerMissionId}`;
      const { grantOk } = await grantPackedBattlePassMissionRewards(
        userId,
        claimId,
        fixedFlatForGrant,
        mission.title
      );
      if (!grantOk) {
        console.error('Error granting mission fixed rewards (mission_complete)');
      }
    }
    
    // Check if chapter is complete (for STORY missions)
    if (mission?.missionCategory === 'STORY' && mission.story) {
      const chapterComplete = await checkChapterCompletion(userId, mission.story.chapterId);
      
      // Log chapter completion if applicable
      if (chapterComplete) {
        try {
          const shouldShare = await shouldShareEvent(userId, 'chapter_complete');
          if (shouldShare) {
            const userDoc = await getDoc(doc(db, 'students', userId));
            const userData = userDoc.exists() ? userDoc.data() : null;
            const userDisplayName = userData?.displayName || 'Unknown';
            const userPhotoURL = userData?.photoURL || undefined;
            const userRole = userData?.role || undefined;
            const userLevel = userData ? getLevelFromXP(userData.xp || 0) : undefined;
            
            await createLiveFeedMilestone(
              userId,
              userDisplayName,
              userPhotoURL,
              userRole,
              userLevel,
              'chapter_complete',
              {
                chapterId: mission.story.chapterId
              },
              `chapter_complete_${userId}_${mission.story.chapterId}`
            );
          }
        } catch (error) {
          console.error('Error logging chapter completion to live feed:', error);
        }
      }
    }
    
    // Log mission completion to live feed (if privacy settings allow)
    try {
      const shouldShare = await shouldShareEvent(userId, 'mission_complete');
      if (shouldShare) {
        const userDoc = await getDoc(doc(db, 'students', userId));
        const userData = userDoc.exists() ? userDoc.data() : null;
        const userDisplayName = userData?.displayName || 'Unknown';
        const userPhotoURL = userData?.photoURL || undefined;
        const userRole = userData?.role || undefined;
        const userLevel = userData ? getLevelFromXP(userData.xp || 0) : undefined;
        
        await createLiveFeedMilestone(
          userId,
          userDisplayName,
          userPhotoURL,
          userRole,
          userLevel,
          'mission_complete',
          {
            missionId: playerMission.missionId,
            missionTitle: mission?.title || 'Unknown Mission',
            missionCategory: mission?.missionCategory || 'SIDE'
          },
          `mission_complete_${userId}_${playerMission.missionId}`
        );
      }
    } catch (error) {
      console.error('Error logging mission complete to live feed:', error);
      // Don't fail the mission complete if live feed logging fails
    }
    
    return {
      success: true,
      pendingRewardChoices: choiceGroups.length > 0,
    };
  } catch (error) {
    console.error('Error completing mission:', error);
    return { success: false, error: 'Failed to complete mission' };
  }
}

/**
 * Claim Battle Pass–style mission reward choices after completion.
 * @param picksByGroupId maps choice group id → selected option reward ids (length must equal each group's pickCount).
 */
export async function claimMissionRewardChoices(
  userId: string,
  playerMissionId: string,
  picksByGroupId: Record<string, string[]>
): Promise<{ success: boolean; error?: string }> {
  try {
    const playerMissionRef = doc(db, 'playerMissions', playerMissionId);
    const snap = await getDoc(playerMissionRef);
    if (!snap.exists()) {
      return { success: false, error: 'Mission record not found' };
    }
    const data = snap.data() as PlayerMission;
    const pending = data.missionRewardChoicesPending;
    if (!pending?.groups?.length) {
      return { success: false, error: 'No pending reward choices for this mission.' };
    }

    for (const g of pending.groups) {
      const picks = picksByGroupId[g.groupId];
      if (!Array.isArray(picks) || picks.length !== g.pickCount) {
        return {
          success: false,
          error: `Choose exactly ${g.pickCount} reward(s) for "${g.displayName || 'each choice group'}".`,
        };
      }
      const optIds = new Set(g.options.map((o) => o.id));
      const uniq = new Set(picks);
      if (uniq.size !== picks.length) {
        return { success: false, error: 'Each pick must be a different option.' };
      }
      for (const pid of picks) {
        if (!optIds.has(pid)) {
          return { success: false, error: 'Invalid reward selection.' };
        }
      }
    }

    for (const g of pending.groups) {
      const picks = picksByGroupId[g.groupId];
      const rewards = picks
        .map((pid) => g.options.find((o) => o.id === pid))
        .filter((x): x is NonNullable<typeof x> => x != null);
      const claimId = `mission_choice_${playerMissionId}_${g.groupId}`;
      const { grantOk } = await grantPackedBattlePassMissionRewards(
        userId,
        claimId,
        rewards,
        'Mission reward choice'
      );
      if (!grantOk) {
        return {
          success: false,
          error: 'Could not grant rewards. You may have already claimed them; refresh and try again.',
        };
      }
    }

    await updateDoc(playerMissionRef, {
      missionRewardChoicesPending: deleteField(),
    });

    return { success: true };
  } catch (e) {
    console.error('claimMissionRewardChoices', e);
    return { success: false, error: 'Failed to claim rewards.' };
  }
}

/**
 * Mark a mission sequence step complete (e.g. Level 2 Manifest builder finished).
 */
/** Persist which sequence step the player should see when reopening the mission runner. */
export async function setPlayerMissionSequencePlayheadIndex(
  playerMissionId: string,
  index: number
): Promise<void> {
  const ref = doc(db, 'playerMissions', playerMissionId);
  await updateDoc(ref, { sequencePlayheadIndex: index });
}

export async function markMissionSequenceStepComplete(
  playerMissionId: string,
  stepId: string,
  extras?: { skillId?: string }
): Promise<{ success: boolean; error?: string }> {
  try {
    const ref = doc(db, 'playerMissions', playerMissionId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return { success: false, error: 'Player mission not found.' };
    }
    await updateDoc(ref, {
      [`sequenceStepCompletion.${stepId}`]: {
        completedAt: serverTimestamp(),
        ...(extras?.skillId ? { skillId: extras.skillId } : {}),
      },
    });
    return { success: true };
  } catch (e) {
    console.error('markMissionSequenceStepComplete', e);
    return { success: false, error: 'Failed to save step progress.' };
  }
}

/**
 * Check if chapter is complete and unlock next chapter
 * Returns true if chapter was just completed, false otherwise
 */
export async function checkChapterCompletion(
  userId: string,
  chapterId: string
): Promise<boolean> {
  try {
    // Get all STORY missions for this chapter
    const storyMissions = await getMissionTemplates({
      category: 'STORY',
      chapterId
    });
    
    // Filter to only required missions
    const requiredMissions = storyMissions.filter(
      m => m.story?.required !== false
    );
    
    // Get player's completed missions
    const playerMissions = await getPlayerMissions(userId);
    const completedMissionIds = playerMissions
      .filter(pm => pm.status === 'completed')
      .map(pm => pm.missionId);
    
    // Check if all required missions are completed
    const allCompleted = requiredMissions.every(mission =>
      completedMissionIds.includes(mission.id)
    );
    
    if (allCompleted) {
      // Unlock next chapter
      const progress = await getPlayerStoryProgress(userId);
      if (progress) {
        const chapterNumber = parseInt(chapterId.replace('chapter_', ''));
        const nextChapterId = `chapter_${chapterNumber + 1}`;
        
        if (!progress.unlockedChapterIds.includes(nextChapterId)) {
          const progressRef = doc(db, 'playerStoryProgress', userId);
          await updateDoc(progressRef, {
            unlockedChapterIds: [...progress.unlockedChapterIds, nextChapterId],
            currentChapterId: nextChapterId,
            updatedAt: serverTimestamp()
          });
          return true; // Chapter was just completed
        }
      }
      return true; // Chapter is complete (was already unlocked)
    }
    return false; // Chapter not yet complete
  } catch (error) {
    console.error('Error checking chapter completion:', error);
    return false;
  }
}

const HUB_SPOTLIGHT_NPCS = ['sonido', 'zeke', 'luz', 'kon'] as const;
export type HubSpotlightNpcId = (typeof HUB_SPOTLIGHT_NPCS)[number];

export type HubNpcMissionAttentionMap = Record<HubSpotlightNpcId, boolean>;

export const DEFAULT_HUB_NPC_MISSION_ATTENTION: HubNpcMissionAttentionMap = {
  sonido: false,
  zeke: false,
  luz: false,
  kon: false,
};

async function hubMissionNeedsPlayerAttention(
  userId: string,
  mission: MissionTemplate,
  playerMissions: PlayerMission[]
): Promise<boolean> {
  const pm = playerMissions.find((p) => p.missionId === mission.id);
  if (pm) {
    const pendingGroups = pm.missionRewardChoicesPending?.groups;
    if (Array.isArray(pendingGroups) && pendingGroups.length > 0) return true;
    if (pm.status === 'completed') return false;
    if (pm.status === 'locked') return false;
    return true;
  }
  const [prerequisitesMet, gatingCheck] = await Promise.all([
    checkPrerequisites(userId, mission),
    checkGating(userId, mission),
  ]);
  return prerequisitesMet && gatingCheck.met;
}

/** True when this NPC has at least one HUB_NPC mission the player can start, is working on, or must claim rewards for. */
export async function fetchHubNpcMissionAttentionMap(
  userId: string
): Promise<HubNpcMissionAttentionMap> {
  const playerMissions = await getPlayerMissions(userId);
  const lists = await Promise.all(
    HUB_SPOTLIGHT_NPCS.map((npc) =>
      getMissionTemplates({ npc, deliveryChannel: 'HUB_NPC' })
    )
  );
  const flags = await Promise.all(
    lists.map(async (templates) => {
      if (templates.length === 0) return false;
      const perMission = await Promise.all(
        templates.map((m) =>
          hubMissionNeedsPlayerAttention(userId, m, playerMissions)
        )
      );
      return perMission.some(Boolean);
    })
  );
  return {
    sonido: flags[0],
    zeke: flags[1],
    luz: flags[2],
    kon: flags[3],
  };
}

/**
 * Get mission status for a player
 */
export async function getMissionStatus(
  userId: string,
  missionId: string
): Promise<MissionStatus> {
  try {
    const playerMissions = await getPlayerMissions(userId);
    const playerMission = playerMissions.find(pm => pm.missionId === missionId);
    
    if (!playerMission) {
      // Check if mission is available (prerequisites met, gating met)
      const mission = await getMissionTemplate(missionId);
      if (!mission) return 'locked';
      
      const prerequisitesMet = await checkPrerequisites(userId, mission);
      const gatingCheck = await checkGating(userId, mission);
      
      if (prerequisitesMet && gatingCheck.met) {
        return 'available';
      }
      return 'locked';
    }
    
    return playerMission.status;
  } catch (error) {
    console.error('Error getting mission status:', error);
    return 'locked';
  }
}

/**
 * Admin: delete every `playerMissions` document for this mission template so all players can accept and run it again.
 * Does not modify Player Journey chapter progress or `users/{uid}/missionReflectionResponses`.
 */
export async function deleteAllPlayerMissionDocsForMissionTemplate(
  missionId: string
): Promise<{ deletedCount: number }> {
  const playerMissionsRef = collection(db, 'playerMissions');
  const q = query(playerMissionsRef, where('missionId', '==', missionId));
  const snapshot = await getDocs(q);
  const docs = snapshot.docs;
  const CHUNK = 400;
  let deletedCount = 0;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const chunk = docs.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deletedCount += chunk.length;
  }
  return { deletedCount };
}

