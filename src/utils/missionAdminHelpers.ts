/**
 * Shared Mission Admin helpers for Journey vs Side filters and publish state.
 */

import type { MissionTemplate, MissionCategory } from '../types/missions';
import { isJourneyMissionCategory } from '../types/missions';
import { CHAPTERS } from '../types/chapters';
import { resolveJourneyChallengePreviewUrl } from './journeyChallengePreviewDefaults';

export type MissionAdminFilter =
  | 'all'
  | 'journey'
  | 'side'
  | 'demo'
  | 'drafts'
  | 'published';

/** Prefix for synthetic Mission Admin rows built from hardcoded CHAPTERS challenges. */
export const JOURNEY_CHALLENGE_MISSION_PREFIX = 'journey-challenge:';

export function isHardcodedJourneyMissionId(id: string): boolean {
  return id.startsWith(JOURNEY_CHALLENGE_MISSION_PREFIX);
}

export function challengeIdFromJourneyMissionId(id: string): string | null {
  if (!isHardcodedJourneyMissionId(id)) return null;
  return id.slice(JOURNEY_CHALLENGE_MISSION_PREFIX.length);
}

/** Existing missions without isPublished are treated as published. */
export function isMissionPublished(mission: Pick<MissionTemplate, 'isPublished'>): boolean {
  return mission.isPublished !== false;
}

/** True if this Firestore mission belongs on the Player's Journey admin list. */
export function isPlayerJourneyMission(mission: MissionTemplate): boolean {
  if (isJourneyMissionCategory(mission.missionCategory)) return true;
  if (mission.deliveryChannels?.includes('PLAYER_JOURNEY')) return true;
  if (mission.playerJourneyLink) return true;
  return false;
}

/**
 * Build MissionTemplate-shaped rows for every hardcoded CHAPTERS challenge
 * so Mission Admin can list the full Player's Journey (not only Firestore STORY docs).
 */
export function buildHardcodedJourneyMissions(): MissionTemplate[] {
  const rows: MissionTemplate[] = [];
  for (const chapter of CHAPTERS) {
    chapter.challenges.forEach((challenge, index) => {
      const xp = challenge.rewards.find((r) => r.type === 'xp')?.value;
      const pp = challenge.rewards.find((r) => r.type === 'pp')?.value;
      rows.push({
        id: `${JOURNEY_CHALLENGE_MISSION_PREFIX}${challenge.id}`,
        title: challenge.title,
        description: challenge.description,
        shortDescription: challenge.description,
        missionCategory: 'STORY',
        deliveryChannels: ['PLAYER_JOURNEY'],
        journeyMissionType:
          challenge.id.includes('touch') || challenge.id.includes('battle')
            ? 'battle'
            : 'story',
        chapterNumber: chapter.id,
        missionNumber: index + 1,
        sortOrder: index + 1,
        xpReward: typeof xp === 'number' ? xp : undefined,
        ppReward: typeof pp === 'number' ? pp : undefined,
        isPublished: true,
        story: {
          chapterId: `chapter_${chapter.id}`,
          order: index + 1,
          required: true,
        },
        playerJourneyLink: {
          chapterId: chapter.id,
          challengeId: challenge.id,
        },
        metadata: {
          source: 'hardcoded-chapters',
          challengeType: challenge.type,
        },
      });
    });
  }
  return rows;
}

/**
 * Merge Firestore missions with hardcoded Journey challenges for admin listing.
 * If a Firestore mission already links to a challenge, keep the Firestore row
 * and skip the synthetic duplicate.
 * Optional mediaMap applies preview/modal URLs onto core journey rows.
 */
export function mergeJourneyMissionsForAdmin(
  firestoreMissions: MissionTemplate[],
  mediaMap?: Record<string, { previewImageUrl?: string; modalImageUrl?: string; previewImageStoragePath?: string; modalImageStoragePath?: string }>
): MissionTemplate[] {
  const linkedChallengeIds = new Set<string>();
  for (const m of firestoreMissions) {
    if (m.playerJourneyLink?.challengeId) {
      linkedChallengeIds.add(m.playerJourneyLink.challengeId);
    }
  }

  const hardcoded = buildHardcodedJourneyMissions()
    .filter((m) => {
      const challengeId = challengeIdFromJourneyMissionId(m.id);
      return challengeId ? !linkedChallengeIds.has(challengeId) : true;
    })
    .map((m) => {
      const challengeId = challengeIdFromJourneyMissionId(m.id);
      const media = challengeId && mediaMap ? mediaMap[challengeId] : undefined;
      // Show the same bundled /images previews the Journey page uses when no
      // Firestore journeyChallengeMedia override has been uploaded yet.
      const previewImageUrl = resolveJourneyChallengePreviewUrl(challengeId, media) || m.previewImageUrl;
      return {
        ...m,
        previewImageUrl,
        previewImageStoragePath: media?.previewImageStoragePath || m.previewImageStoragePath,
        modalImageUrl: media?.modalImageUrl || m.modalImageUrl,
        modalImageStoragePath: media?.modalImageStoragePath || m.modalImageStoragePath,
      };
    });

  const firestoreJourney = firestoreMissions.filter(isPlayerJourneyMission);
  return sortJourneyMissions([...hardcoded, ...firestoreJourney]);
}

export function filterMissionsForAdmin(
  missions: MissionTemplate[],
  filter: MissionAdminFilter
): MissionTemplate[] {
  switch (filter) {
    case 'journey':
      return missions.filter(isPlayerJourneyMission);
    case 'side':
      return missions.filter((m) => m.missionCategory === 'SIDE' && !m.deliveryChannels?.includes('PLAYER_JOURNEY'));
    case 'demo':
      return missions.filter((m) => m.missionCategory === 'DEMO');
    case 'drafts':
      return missions.filter((m) => !isMissionPublished(m));
    case 'published':
      return missions.filter((m) => isMissionPublished(m));
    default:
      return missions;
  }
}

export function getJourneyChapterLabel(mission: MissionTemplate): string {
  if (mission.chapterNumber != null && mission.missionNumber != null) {
    return `Ch ${mission.chapterNumber}-${mission.missionNumber}`;
  }
  if (mission.story?.chapterId) {
    const order = mission.story.order != null ? ` · #${mission.story.order}` : '';
    return `${mission.story.chapterId}${order}`;
  }
  return '—';
}

export function sortJourneyMissions(missions: MissionTemplate[]): MissionTemplate[] {
  return [...missions].sort((a, b) => {
    const aChapter = a.chapterNumber ?? parseChapterNum(a.story?.chapterId) ?? 999;
    const bChapter = b.chapterNumber ?? parseChapterNum(b.story?.chapterId) ?? 999;
    if (aChapter !== bChapter) return aChapter - bChapter;
    const aOrder = a.sortOrder ?? a.missionNumber ?? a.story?.order ?? 0;
    const bOrder = b.sortOrder ?? b.missionNumber ?? b.story?.order ?? 0;
    return aOrder - bOrder;
  });
}

function parseChapterNum(chapterId?: string): number | null {
  if (!chapterId) return null;
  const m = String(chapterId).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export function missionXpReward(mission: MissionTemplate): number {
  if (typeof mission.xpReward === 'number') return mission.xpReward;
  if (typeof mission.rewards?.xp === 'number') return mission.rewards.xp;
  return 0;
}

export function missionPpReward(mission: MissionTemplate): number {
  if (typeof mission.ppReward === 'number') return mission.ppReward;
  if (typeof mission.rewards?.pp === 'number') return mission.rewards.pp;
  return 0;
}

export function categoryBadgeForFilter(category: MissionCategory): string {
  if (category === 'STORY') return "Player's Journey";
  if (category === 'SOVEREIGN') return 'Sovereign';
  if (category === 'DEMO') return 'Demo';
  return category;
}
