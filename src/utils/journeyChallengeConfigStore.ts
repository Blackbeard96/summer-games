import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { CHAPTERS, type ChapterChallenge } from '../types/chapters';
import type { MissionTemplate } from '../types/missions';
import { normalizeMissionCategory } from '../types/missions';
import {
  JOURNEY_CHALLENGE_OVERRIDES_COLLECTION,
  applyJourneyChallengeOverride,
  type JourneyChallengeOverride,
} from './journeyChallengeConfig';
import { parseMissionRewardsFromDoc } from './missionsService';

function parseOverride(id: string, data: Record<string, any>): JourneyChallengeOverride {
  return {
    challengeId: id,
    chapterId: typeof data.chapterId === 'number' ? data.chapterId : 0,
    title: typeof data.title === 'string' ? data.title : undefined,
    description: typeof data.description === 'string' ? data.description : undefined,
    xpReward: typeof data.xpReward === 'number' ? data.xpReward : undefined,
    ppReward: typeof data.ppReward === 'number' ? data.ppReward : undefined,
    updatedAt: data.updatedAt,
  };
}

export async function loadAllJourneyChallengeOverrides(): Promise<Record<string, JourneyChallengeOverride>> {
  const snap = await getDocs(collection(db, JOURNEY_CHALLENGE_OVERRIDES_COLLECTION));
  const out: Record<string, JourneyChallengeOverride> = {};
  snap.forEach((d) => {
    out[d.id] = parseOverride(d.id, d.data());
  });
  return out;
}

export async function getJourneyChallengeOverride(challengeId: string): Promise<JourneyChallengeOverride | null> {
  const snap = await getDoc(doc(db, JOURNEY_CHALLENGE_OVERRIDES_COLLECTION, challengeId));
  return snap.exists() ? parseOverride(snap.id, snap.data()) : null;
}

/** Core challenge from CHAPTERS with any Mission Admin edits (title / description / XP / PP) applied. */
export async function getEffectiveJourneyChallenge(
  chapterId: number,
  challengeId: string
): Promise<ChapterChallenge | undefined> {
  const base = CHAPTERS.find((c) => c.id === chapterId)?.challenges.find((c) => c.id === challengeId);
  if (!base) return undefined;
  try {
    return applyJourneyChallengeOverride(base, await getJourneyChallengeOverride(challengeId));
  } catch (error) {
    console.warn('getEffectiveJourneyChallenge: override load failed, using chapter defaults', error);
    return base;
  }
}

/** Replaces the override for a core challenge; blank fields fall back to the chapter code. */
export async function saveJourneyChallengeOverride(
  challengeId: string,
  chapterId: number,
  patch: { title?: string; description?: string; xpReward?: number; ppReward?: number }
): Promise<void> {
  const data: Record<string, unknown> = { challengeId, chapterId, updatedAt: serverTimestamp() };
  if (patch.title?.trim()) data.title = patch.title.trim();
  if (patch.description?.trim()) data.description = patch.description.trim();
  if (typeof patch.xpReward === 'number' && Number.isFinite(patch.xpReward)) data.xpReward = patch.xpReward;
  if (typeof patch.ppReward === 'number' && Number.isFinite(patch.ppReward)) data.ppReward = patch.ppReward;
  await setDoc(doc(db, JOURNEY_CHALLENGE_OVERRIDES_COLLECTION, challengeId), data);
}

export async function clearJourneyChallengeOverride(challengeId: string): Promise<void> {
  await deleteDoc(doc(db, JOURNEY_CHALLENGE_OVERRIDES_COLLECTION, challengeId));
}

/** Published missions placed as numbered steps in a chapter (player view). */
export async function loadJourneyMissionsForChapter(chapterId: number): Promise<MissionTemplate[]> {
  const snap = await getDocs(
    query(collection(db, 'missions'), where('journeyPlacement.chapterId', '==', chapterId))
  );
  const out: MissionTemplate[] = [];
  snap.forEach((d) => {
    const data = d.data();
    if (data.isDraft === true || data.isPublished === false) return;
    out.push({
      id: d.id,
      title: data.title || 'Untitled Mission',
      description: data.description || '',
      shortDescription: data.shortDescription || undefined,
      npc: data.npc || null,
      missionCategory: normalizeMissionCategory(data.missionCategory),
      deliveryChannels: data.deliveryChannels || ['PLAYER_JOURNEY'],
      playerJourneyLink: data.playerJourneyLink || undefined,
      journeyPlacement: data.journeyPlacement || undefined,
      xpReward: typeof data.xpReward === 'number' ? data.xpReward : undefined,
      ppReward: typeof data.ppReward === 'number' ? data.ppReward : undefined,
      rewards: parseMissionRewardsFromDoc(data.rewards),
      sequence: Array.isArray(data.sequence) ? data.sequence : undefined,
      previewImageUrl: data.previewImageUrl || undefined,
      modalImageUrl: data.modalImageUrl || undefined,
      sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : undefined,
      isPublished: true,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  });
  return out;
}
