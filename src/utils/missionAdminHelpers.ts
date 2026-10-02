/**
 * Shared Mission Admin helpers for Journey vs Side filters and publish state.
 */

import type { MissionTemplate, MissionCategory } from '../types/missions';
import { isJourneyMissionCategory } from '../types/missions';
import { CHAPTERS } from '../types/chapters';
import { resolveJourneyChallengePreviewUrl } from './journeyChallengePreviewDefaults';
import {
  hasJourneyOverrideContent,
  journeyChallengeIdForMission,
  orderJourneyChapterEntries,
  type JourneyChallengeOverride,
} from './journeyChallengeConfig';

export type MissionAdminFilter =
  | 'all'
  | 'journey'
  | 'side'
  | 'skill'
  | 'demo'
  | 'drafts'
  | 'published';

/** Prefix for synthetic Mission Admin rows built from hardcoded CHAPTERS challenges. */
export const JOURNEY_CHALLENGE_MISSION_PREFIX = 'journey-challenge:';

/** Non-empty classroom IDs assigned to a mission (Skill Missions visibility). */
export function assignedClassIdsForMission(mission: Pick<MissionTemplate, 'classIds'>): string[] {
  if (!mission.classIds || !Array.isArray(mission.classIds)) return [];
  const seen = new Set<string>();
  for (const id of mission.classIds) {
    if (typeof id === 'string' && id.trim()) seen.add(id.trim());
  }
  return Array.from(seen);
}

/**
 * Skill Missions: visible only if assigned to ≥1 class the student is enrolled in.
 * Admins bypass class gating so they can preview/test any Skill Mission.
 * Other categories: always visible at this layer (other filters apply separately).
 */
export function isSkillMissionVisibleToStudentClasses(
  mission: Pick<MissionTemplate, 'missionCategory' | 'classIds'>,
  studentClassIds: string[],
  options?: { isAdmin?: boolean }
): boolean {
  if (mission.missionCategory !== 'SKILL') return true;
  if (options?.isAdmin) return true;
  const assigned = assignedClassIdsForMission(mission);
  if (assigned.length === 0) return false;
  if (!studentClassIds.length) return false;
  return assigned.some((id) => studentClassIds.includes(id));
}

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
  if (mission.journeyPlacement) return true;
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
 * Rows follow the order players see in each chapter (core challenges plus missions
 * placed as new steps), numbered Ch N-M. If a Firestore mission links to a core
 * challenge, the Firestore row replaces the synthetic duplicate.
 * Optional mediaMap applies preview/modal URLs onto core journey rows; overrides
 * apply admin title / description / reward edits.
 */
export function mergeJourneyMissionsForAdmin(
  firestoreMissions: MissionTemplate[],
  mediaMap?: Record<string, { previewImageUrl?: string; modalImageUrl?: string; previewImageStoragePath?: string; modalImageStoragePath?: string }>,
  overrides?: Record<string, JourneyChallengeOverride>
): MissionTemplate[] {
  const linkedByChallengeId = new Map<string, MissionTemplate>();
  for (const m of firestoreMissions) {
    const linkId = m.playerJourneyLink?.challengeId;
    if (linkId && !m.journeyPlacement && !linkedByChallengeId.has(linkId)) {
      linkedByChallengeId.set(linkId, m);
    }
  }

  const hardcodedById = new Map<string, MissionTemplate>();
  for (const m of buildHardcodedJourneyMissions()) {
    const challengeId = challengeIdFromJourneyMissionId(m.id)!;
    const media = mediaMap ? mediaMap[challengeId] : undefined;
    const override = overrides?.[challengeId];
    const edited = hasJourneyOverrideContent(override);
    // Show the same bundled /images previews the Journey page uses when no
    // Firestore journeyChallengeMedia override has been uploaded yet.
    const previewImageUrl = resolveJourneyChallengePreviewUrl(challengeId, media) || m.previewImageUrl;
    hardcodedById.set(challengeId, {
      ...m,
      title: override?.title?.trim() || m.title,
      description: override?.description?.trim() || m.description,
      shortDescription: override?.description?.trim() || m.shortDescription,
      xpReward: typeof override?.xpReward === 'number' ? override.xpReward : m.xpReward,
      ppReward: typeof override?.ppReward === 'number' ? override.ppReward : m.ppReward,
      previewImageUrl,
      previewImageStoragePath: media?.previewImageStoragePath || m.previewImageStoragePath,
      modalImageUrl: media?.modalImageUrl || m.modalImageUrl,
      modalImageStoragePath: media?.modalImageStoragePath || m.modalImageStoragePath,
      metadata: { ...m.metadata, journeyOverride: edited },
    });
  }

  const placed = firestoreMissions.filter((m) => m.journeyPlacement);
  const used = new Set<string>();
  const ordered: MissionTemplate[] = [];
  for (const chapter of CHAPTERS) {
    const entries = orderJourneyChapterEntries(
      chapter.challenges,
      placed.filter((m) => m.journeyPlacement?.chapterId === chapter.id)
    );
    entries.forEach((entry, index) => {
      const position = { chapterNumber: chapter.id, missionNumber: index + 1, sortOrder: index + 1 };
      if (entry.kind === 'mission') {
        used.add(entry.mission.id);
        ordered.push({ ...entry.mission, ...position });
        return;
      }
      const linked = linkedByChallengeId.get(entry.challenge.id);
      if (linked) {
        used.add(linked.id);
        ordered.push(linked);
        return;
      }
      const core = hardcodedById.get(entry.challenge.id);
      if (core) ordered.push({ ...core, ...position });
    });
  }

  const remaining = firestoreMissions.filter((m) => !used.has(m.id) && isPlayerJourneyMission(m));
  return [...ordered, ...sortJourneyMissions(remaining)];
}

export interface JourneyStepChoice {
  /** Challenge id used as a `journeyPlacement.afterChallengeId` anchor. */
  id: string;
  label: string;
  /** Set when the step is a mission placed in the chapter (not a core challenge). */
  missionId?: string;
}

/** Steps of every chapter in Journey order, for "Place after" pickers in Mission Admin. */
export function buildJourneyStepChoices(
  firestoreMissions: MissionTemplate[],
  overrides?: Record<string, JourneyChallengeOverride>
): Record<number, JourneyStepChoice[]> {
  const placed = firestoreMissions.filter((m) => m.journeyPlacement);
  const out: Record<number, JourneyStepChoice[]> = {};
  for (const chapter of CHAPTERS) {
    const entries = orderJourneyChapterEntries(
      chapter.challenges,
      placed.filter((m) => m.journeyPlacement?.chapterId === chapter.id)
    );
    out[chapter.id] = entries.map((entry, index) => {
      const num = `${chapter.id}-${index + 1}`;
      if (entry.kind === 'core') {
        const title = overrides?.[entry.challenge.id]?.title?.trim() || entry.challenge.title;
        return { id: entry.challenge.id, label: `${num} ${title}` };
      }
      const draft = entry.mission.isPublished === false ? ' (draft)' : '';
      return {
        id: journeyChallengeIdForMission(entry.mission.id),
        label: `${num} ${entry.mission.title}${draft}`,
        missionId: entry.mission.id,
      };
    });
  }
  return out;
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
    case 'skill':
      return missions.filter((m) => m.missionCategory === 'SKILL');
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
  if (category === 'SKILL') return 'Skill Mission';
  return category;
}

/**
 * Build a Firestore payload for duplicating a mission template.
 * Caller supplies fresh `createdAt` / `updatedAt` (usually serverTimestamp()).
 * Does not copy player progress (that lives in `playerMissions` by mission id).
 */
export function buildDuplicatedMissionDoc(
  source: Record<string, unknown>,
  timestamps: { createdAt: unknown; updatedAt: unknown }
): { title: string; data: Record<string, unknown> } {
  const baseTitle =
    typeof source.title === 'string' && source.title.trim()
      ? source.title.trim()
      : 'Untitled Mission';
  const title = `${baseTitle} (Copy)`;

  const data: Record<string, unknown> = { ...source };
  delete data.id;
  // Avoid hub order / journey-link collisions with the original
  delete data.hubDisplayOrder;
  delete data.playerJourneyLink;
  delete data.isDraft;

  data.title = title;
  data.isPublished = false;
  data.createdAt = timestamps.createdAt;
  data.updatedAt = timestamps.updatedAt;
  if (data.sequenceVersion != null) {
    data.sequenceVersion = 1;
  }

  return { title, data };
}
