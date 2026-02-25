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
      gating: data.gating || undefined,
      rewards: data.rewards || {},
      objectives: data.objectives || [],
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
        gating: data.gating || undefined,
        rewards: data.rewards || {},
        objectives: data.objectives || [],
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
): Promise<{ success: boolean; error?: string }> {
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
        return { success: false, error: 'Mission already active' };
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
    
    return { success: true };
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
): Promise<{ success: boolean; error?: string }> {
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
    
    // Get mission template for rewards
    const mission = await getMissionTemplate(playerMission.missionId);
    
    // Update player mission status
    await updateDoc(playerMissionRef, {
      status: 'completed',
      completedAt: serverTimestamp()
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
    
    // Award mission rewards if mission template exists
    // IMPORTANT: If journey step was just completed above, we may have already granted some rewards
    // For MVP, we'll grant mission rewards separately. In production, you might want to merge rewards
    if (mission?.rewards) {
      const userRef = doc(db, 'students', userId);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const updates: any = {};
        
        if (mission.rewards.xp) {
          updates.xp = (userDoc.data().xp || 0) + mission.rewards.xp;
        }
        
        if (mission.rewards.pp) {
          // Update vault PP if available
          const vaultRef = doc(db, 'vaults', userId);
          const vaultDoc = await getDoc(vaultRef);
          if (vaultDoc.exists()) {
            await updateDoc(vaultRef, {
              powerPoints: (vaultDoc.data().powerPoints || 0) + mission.rewards.pp
            });
          }
        }
        
        if (Object.keys(updates).length > 0) {
          await updateDoc(userRef, updates);
        }
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
    
    return { success: true };
  } catch (error) {
    console.error('Error completing mission:', error);
    return { success: false, error: 'Failed to complete mission' };
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

