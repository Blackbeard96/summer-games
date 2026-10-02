/**
 * Admin-editable layer on top of the hardcoded Player's Journey (CHAPTERS).
 *
 * - Core challenges keep their gameplay code but can have their title, description,
 *   and XP/PP rewards overridden from Mission Admin (`journeyChallengeOverrides`).
 * - New Journey steps are Firestore missions with a `journeyPlacement`; they are
 *   inserted into the chapter list as numbered challenges and played in MissionRunner.
 *
 * Pure helpers only (no Firestore) so admin + player views share the same ordering.
 */

import type { Chapter, ChapterChallenge, ChallengeReward } from '../types/chapters';
import type { MissionTemplate } from '../types/missions';

export const JOURNEY_CHALLENGE_OVERRIDES_COLLECTION = 'journeyChallengeOverrides';

/** Challenge ids for Journey steps backed by a Firestore mission. */
export const JOURNEY_MISSION_CHALLENGE_PREFIX = 'mission-';

export interface JourneyChallengeOverride {
  challengeId: string;
  chapterId: number;
  title?: string;
  description?: string;
  xpReward?: number;
  ppReward?: number;
  updatedAt?: unknown;
}

export function journeyChallengeIdForMission(missionId: string): string {
  return `${JOURNEY_MISSION_CHALLENGE_PREFIX}${missionId}`;
}

export function isJourneyMissionChallengeId(challengeId: string): boolean {
  return challengeId.startsWith(JOURNEY_MISSION_CHALLENGE_PREFIX);
}

export function hasJourneyOverrideContent(override?: JourneyChallengeOverride | null): boolean {
  if (!override) return false;
  return (
    !!override.title?.trim() ||
    !!override.description?.trim() ||
    typeof override.xpReward === 'number' ||
    typeof override.ppReward === 'number'
  );
}

function withRewardValue(
  rewards: ChallengeReward[],
  type: 'xp' | 'pp',
  value: number | undefined
): ChallengeReward[] {
  if (typeof value !== 'number' || !Number.isFinite(value)) return rewards;
  const amount = Math.max(0, Math.floor(value));
  const idx = rewards.findIndex((r) => r.type === type);
  if (idx >= 0) {
    if (amount === 0) return rewards.filter((_, i) => i !== idx);
    return rewards.map((r, i) => (i === idx ? { ...r, value: amount } : r));
  }
  if (amount === 0) return rewards;
  const label = type === 'xp' ? 'XP' : 'Power Points';
  return [...rewards, { type, value: amount, description: `${amount} ${label}` }];
}

export function applyJourneyChallengeOverride(
  challenge: ChapterChallenge,
  override?: JourneyChallengeOverride | null
): ChapterChallenge {
  if (!hasJourneyOverrideContent(override)) return challenge;
  let rewards = challenge.rewards;
  rewards = withRewardValue(rewards, 'xp', override!.xpReward);
  rewards = withRewardValue(rewards, 'pp', override!.ppReward);
  return {
    ...challenge,
    title: override!.title?.trim() || challenge.title,
    description: override!.description?.trim() || challenge.description,
    rewards,
  };
}

/** XP / PP shown on Journey cards for a mission-backed step (fixed rewards only). */
export function journeyMissionRewardTotals(mission: MissionTemplate): { xp: number; pp: number } {
  let xp = 0;
  let pp = 0;
  const entries = mission.rewards?.entries;
  if (Array.isArray(entries) && entries.length > 0) {
    for (const e of entries) {
      if (!e || typeof e !== 'object' || 'options' in e) continue;
      const q = Math.max(0, Math.floor(Number(e.quantity) || 0));
      if (e.rewardType === 'xp') xp += q;
      if (e.rewardType === 'pp') pp += q;
    }
    return { xp, pp };
  }
  xp = typeof mission.xpReward === 'number' ? mission.xpReward : Number(mission.rewards?.xp) || 0;
  pp = typeof mission.ppReward === 'number' ? mission.ppReward : Number(mission.rewards?.pp) || 0;
  return { xp, pp };
}

export function journeyMissionToChallenge(mission: MissionTemplate): ChapterChallenge {
  const { xp, pp } = journeyMissionRewardTotals(mission);
  const rewards: ChallengeReward[] = [];
  if (xp > 0) rewards.push({ type: 'xp', value: xp, description: `${xp} XP` });
  if (pp > 0) rewards.push({ type: 'pp', value: pp, description: `${pp} Power Points` });
  return {
    id: journeyChallengeIdForMission(mission.id),
    title: mission.title,
    description: mission.shortDescription || mission.description,
    type: 'solo',
    requirements: [],
    rewards,
    isCompleted: false,
    linkedMissionId: mission.id,
  };
}

function placementSortKey(m: MissionTemplate): number {
  const t = m.createdAt as { toMillis?: () => number; seconds?: number } | undefined;
  if (t && typeof t.toMillis === 'function') return t.toMillis();
  if (t && typeof t.seconds === 'number') return t.seconds * 1000;
  return 0;
}

export type JourneyChapterEntry =
  | { kind: 'core'; challenge: ChapterChallenge }
  | { kind: 'mission'; mission: MissionTemplate };

/**
 * Ordered entries for one chapter: each core challenge followed by any missions
 * placed after it (missions may also be placed after other placed missions).
 * Missions with no / unknown anchor go at the end of the chapter.
 */
export function orderJourneyChapterEntries(
  coreChallenges: ChapterChallenge[],
  placedMissions: MissionTemplate[]
): JourneyChapterEntry[] {
  const sorted = [...placedMissions].sort((a, b) => {
    const ao = a.sortOrder ?? 0;
    const bo = b.sortOrder ?? 0;
    if (ao !== bo) return ao - bo;
    return placementSortKey(a) - placementSortKey(b);
  });
  const knownIds = new Set<string>([
    ...coreChallenges.map((c) => c.id),
    ...sorted.map((m) => journeyChallengeIdForMission(m.id)),
  ]);
  const byAnchor = new Map<string, MissionTemplate[]>();
  const tail: MissionTemplate[] = [];
  for (const m of sorted) {
    const anchor = m.journeyPlacement?.afterChallengeId || '';
    if (anchor && knownIds.has(anchor) && anchor !== journeyChallengeIdForMission(m.id)) {
      const list = byAnchor.get(anchor) || [];
      list.push(m);
      byAnchor.set(anchor, list);
    } else {
      tail.push(m);
    }
  }

  const out: JourneyChapterEntry[] = [];
  const emitted = new Set<string>();
  const emitMissionsAfter = (anchorId: string) => {
    for (const m of byAnchor.get(anchorId) || []) {
      if (emitted.has(m.id)) continue;
      emitted.add(m.id);
      out.push({ kind: 'mission', mission: m });
      emitMissionsAfter(journeyChallengeIdForMission(m.id));
    }
  };

  for (const challenge of coreChallenges) {
    out.push({ kind: 'core', challenge });
    emitMissionsAfter(challenge.id);
  }
  for (const m of tail) {
    if (emitted.has(m.id)) continue;
    emitted.add(m.id);
    out.push({ kind: 'mission', mission: m });
    emitMissionsAfter(journeyChallengeIdForMission(m.id));
  }
  // Anything left (e.g. anchor cycles) still shows up rather than vanishing
  for (const m of sorted) {
    if (!emitted.has(m.id)) {
      emitted.add(m.id);
      out.push({ kind: 'mission', mission: m });
    }
  }
  return out;
}

/** Chapter as players see it: overrides applied and placed missions inserted. */
export function buildJourneyChapter(
  chapter: Chapter,
  overrides: Record<string, JourneyChallengeOverride>,
  placedMissions: MissionTemplate[]
): Chapter {
  const core = chapter.challenges.map((c) => applyJourneyChallengeOverride(c, overrides[c.id]));
  const forChapter = placedMissions.filter((m) => m.journeyPlacement?.chapterId === chapter.id);
  if (forChapter.length === 0 && core.every((c, i) => c === chapter.challenges[i])) {
    return chapter;
  }
  const challenges = orderJourneyChapterEntries(core, forChapter).map((entry) =>
    entry.kind === 'core' ? entry.challenge : journeyMissionToChallenge(entry.mission)
  );
  return { ...chapter, challenges };
}
