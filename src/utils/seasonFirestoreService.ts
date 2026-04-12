/**
 * Firestore CRUD for Season 1 battle pass definitions: collection `seasons/{seasonId}`.
 * Clients should parse with parseSeasonFromFirestore for safe defaults.
 */
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  isBattlePassChoiceGroup,
  type BattlePassReward,
  type BattlePassRewardChoiceGroup,
  type BattlePassTier,
  type BattlePassTierRewardEntry,
  type Season,
} from '../types/season1';
import type { BattlePassIntroStep } from '../types/missions';

export const SEASONS_COLLECTION = 'seasons';

const REWARD_TYPES = new Set([
  'xp',
  'pp',
  'artifact',
  'item',
  'skill_card',
  'truth_metal',
  'ability',
]);
const RARITIES = new Set(['common', 'uncommon', 'rare', 'epic', 'legendary']);

export function coerceToDate(v: unknown): Date {
  if (v == null) return new Date();
  if (v instanceof Date) return v;
  if (typeof (v as Timestamp).toDate === 'function') return (v as Timestamp).toDate();
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }
  return new Date();
}

function parseReward(raw: unknown, fallbackIdx: number): BattlePassReward {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rt = r.rewardType;
  return {
    id: String(r.id || `reward_${fallbackIdx}_${Date.now()}`),
    rewardType: REWARD_TYPES.has(rt as string) ? (rt as BattlePassReward['rewardType']) : 'xp',
    rewardRefId: r.rewardRefId != null && String(r.rewardRefId).trim() ? String(r.rewardRefId) : undefined,
    quantity: r.quantity != null && r.quantity !== '' ? Number(r.quantity) : undefined,
    rarity: RARITIES.has(r.rarity as string) ? (r.rarity as BattlePassReward['rarity']) : undefined,
    displayName: String(r.displayName || 'Reward'),
    description: String(r.description || ''),
    iconUrl: r.iconUrl != null && String(r.iconUrl).trim() ? String(r.iconUrl) : undefined,
  };
}

/** Parse mission `rewards.entries` array (same shape as tier rewards on seasons). */
export function parseMissionRewardEntriesFromFirestore(raw: unknown): BattlePassTierRewardEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r, j) => parseRewardEntry(r, j));
}

export function missionRewardEntriesToFirestoreWrite(entries: BattlePassTierRewardEntry[]): unknown[] {
  return entries.map((e) => rewardEntryToFirestoreWrite(e));
}

function parseRewardEntry(raw: unknown, fallbackIdx: number): BattlePassTierRewardEntry {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  if (r.kind === 'choice_group') {
    const optionsRaw = Array.isArray(r.options) ? r.options : [];
    const options = optionsRaw.map((o, j) => parseReward(o, j));
    const pc = Math.max(1, Math.floor(Number(r.pickCount) || 1));
    const cappedPick = options.length > 0 ? Math.min(pc, options.length) : 1;
    const g: BattlePassRewardChoiceGroup = {
      id: String(r.id || `choice_${fallbackIdx}_${Date.now()}`),
      pickCount: cappedPick,
      displayName:
        r.displayName != null && String(r.displayName).trim() ? String(r.displayName).trim() : undefined,
      description: String(r.description ?? ''),
      options,
    };
    return g;
  }
  return parseReward(raw, fallbackIdx);
}

function rewardToFirestoreWrite(r: BattlePassReward): Record<string, unknown> {
  return {
    id: r.id,
    rewardType: r.rewardType,
    rewardRefId: r.rewardRefId ?? null,
    quantity: r.quantity ?? null,
    rarity: r.rarity ?? null,
    displayName: r.displayName,
    description: r.description,
    iconUrl: r.iconUrl ?? null,
  };
}

function rewardEntryToFirestoreWrite(e: BattlePassTierRewardEntry): Record<string, unknown> {
  if (isBattlePassChoiceGroup(e)) {
    return {
      kind: 'choice_group',
      id: e.id,
      pickCount: e.pickCount,
      displayName: e.displayName ?? null,
      description: e.description ?? '',
      options: e.options.map(rewardToFirestoreWrite),
    };
  }
  return rewardToFirestoreWrite(e);
}

function parseBattlePassIntroStep(raw: unknown, idx: number): BattlePassIntroStep | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!o || typeof o.type !== 'string') return null;
  if (o.type === 'STORY_SLIDE') {
    const img = o.image && typeof o.image === 'object' ? (o.image as Record<string, unknown>) : {};
    return {
      id: String(o.id || `intro_${idx}`),
      type: 'STORY_SLIDE',
      order: Number(o.order) || idx,
      title: o.title != null && String(o.title).trim() ? String(o.title) : undefined,
      bodyText: String(o.bodyText ?? ''),
      image: {
        url: String(img.url || ''),
        storagePath:
          img.storagePath != null && String(img.storagePath).trim() ? String(img.storagePath) : undefined,
        width: img.width != null ? Number(img.width) : undefined,
        height: img.height != null ? Number(img.height) : undefined,
        alt: img.alt != null && String(img.alt).trim() ? String(img.alt) : undefined,
      },
    };
  }
  if (o.type === 'VIDEO') {
    const vid = o.video && typeof o.video === 'object' ? (o.video as Record<string, unknown>) : {};
    const st = vid.sourceType === 'UPLOAD' ? 'UPLOAD' : 'URL';
    return {
      id: String(o.id || `intro_${idx}`),
      type: 'VIDEO',
      order: Number(o.order) || idx,
      title: o.title != null && String(o.title).trim() ? String(o.title) : undefined,
      bodyText: o.bodyText != null && String(o.bodyText).trim() ? String(o.bodyText) : undefined,
      video: {
        sourceType: st,
        url: String(vid.url || ''),
        storagePath:
          vid.storagePath != null && String(vid.storagePath).trim() ? String(vid.storagePath) : undefined,
        posterUrl:
          vid.posterUrl != null && String(vid.posterUrl).trim() ? String(vid.posterUrl) : undefined,
        autoplay: !!vid.autoplay,
        muted: !!vid.muted,
        controls: vid.controls !== false,
      },
    };
  }
  return null;
}

function introStepToFirestoreWrite(step: BattlePassIntroStep): Record<string, unknown> {
  if (step.type === 'STORY_SLIDE') {
    return {
      id: step.id,
      type: 'STORY_SLIDE',
      order: step.order,
      title: step.title ?? null,
      bodyText: step.bodyText,
      image: {
        url: step.image.url,
        storagePath: step.image.storagePath ?? null,
        width: step.image.width ?? null,
        height: step.image.height ?? null,
        alt: step.image.alt ?? null,
      },
    };
  }
  return {
    id: step.id,
    type: 'VIDEO',
    order: step.order,
    title: step.title ?? null,
    bodyText: step.bodyText ?? null,
    video: {
      sourceType: step.video.sourceType,
      url: step.video.url,
      storagePath: step.video.storagePath ?? null,
      posterUrl: step.video.posterUrl ?? null,
      autoplay: step.video.autoplay ?? false,
      muted: step.video.muted ?? false,
      controls: step.video.controls !== false,
    },
  };
}

/** Re-index order fields from array index (call before save). */
export function normalizeIntroSequence(seq: BattlePassIntroStep[] | undefined): BattlePassIntroStep[] | undefined {
  if (!seq?.length) return undefined;
  return seq.map((s, i) => ({ ...s, order: i }));
}

function parseTier(raw: unknown, idx: number): BattlePassTier {
  const t = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rewardsRaw = Array.isArray(t.rewards) ? t.rewards : [];
  return {
    id: String(t.id || `tier_${idx + 1}`),
    tierNumber: Number(t.tierNumber) || idx + 1,
    requiredXP: Number(t.requiredXP) || 0,
    rewards: rewardsRaw.map((r, j) => parseRewardEntry(r, j)),
  };
}

export function defaultTiersTemplate(): BattlePassTier[] {
  return [
    {
      id: `tier_${Date.now()}_1`,
      tierNumber: 1,
      requiredXP: 1000,
      rewards: [
        {
          id: `reward_${Date.now()}_a`,
          rewardType: 'xp',
          displayName: 'XP bundle',
          description: 'Bonus experience toward your profile.',
          quantity: 500,
          rarity: 'common',
        },
      ],
    },
  ];
}

export function parseSeasonFromFirestore(id: string, data: Record<string, unknown> | undefined): Season {
  const d = data || {};
  const tiersRaw = Array.isArray(d.tiers) ? d.tiers : [];
  const tiers = tiersRaw.length > 0 ? tiersRaw.map((t, i) => parseTier(t, i)) : defaultTiersTemplate();
  const introRaw = Array.isArray(d.introSequence) ? d.introSequence : [];
  const introParsed = introRaw
    .map((raw, i) => parseBattlePassIntroStep(raw, i))
    .filter((s): s is BattlePassIntroStep => s != null);
  introParsed.sort((a, b) => a.order - b.order);
  const introSequence = introParsed.length > 0 ? introParsed.map((s, i) => ({ ...s, order: i })) : undefined;
  return {
    id,
    name: String(d.name || 'Unnamed season'),
    theme: String(d.theme || ''),
    active: !!d.active,
    startAt: coerceToDate(d.startAt),
    endAt: coerceToDate(d.endAt),
    description: String(d.description || ''),
    linkedGameSeasonKey:
      d.linkedGameSeasonKey != null && String(d.linkedGameSeasonKey).trim()
        ? String(d.linkedGameSeasonKey).trim()
        : undefined,
    featuredHero: d.featuredHero != null && String(d.featuredHero).trim() ? String(d.featuredHero) : undefined,
    homeBannerImage:
      d.homeBannerImage != null && String(d.homeBannerImage).trim() ? String(d.homeBannerImage) : undefined,
    seasonIntroVideoUrl:
      d.seasonIntroVideoUrl != null && String(d.seasonIntroVideoUrl).trim()
        ? String(d.seasonIntroVideoUrl).trim()
        : undefined,
    seasonIntroVideoStoragePath:
      d.seasonIntroVideoStoragePath != null && String(d.seasonIntroVideoStoragePath).trim()
        ? String(d.seasonIntroVideoStoragePath).trim()
        : undefined,
    introSequence,
    tiers,
  };
}

export function seasonToFirestoreWrite(season: Season): Record<string, unknown> {
  const introNorm = normalizeIntroSequence(season.introSequence);
  return {
    name: season.name,
    theme: season.theme,
    active: season.active,
    startAt: Timestamp.fromDate(coerceToDate(season.startAt)),
    endAt: Timestamp.fromDate(coerceToDate(season.endAt)),
    description: season.description,
    linkedGameSeasonKey: season.linkedGameSeasonKey ?? null,
    featuredHero: season.featuredHero ?? null,
    homeBannerImage: season.homeBannerImage ?? null,
    seasonIntroVideoUrl: season.seasonIntroVideoUrl ?? null,
    seasonIntroVideoStoragePath: season.seasonIntroVideoStoragePath ?? null,
    introSequence:
      introNorm && introNorm.length > 0 ? introNorm.map(introStepToFirestoreWrite) : null,
    tiers: season.tiers.map((t) => ({
      id: t.id,
      tierNumber: t.tierNumber,
      requiredXP: t.requiredXP,
      rewards: t.rewards.map((r) => rewardEntryToFirestoreWrite(r)),
    })),
    updatedAt: serverTimestamp(),
  };
}

export function sortSeasonsList(list: Season[]): Season[] {
  return [...list].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return coerceToDate(b.startAt).getTime() - coerceToDate(a.startAt).getTime();
  });
}

export async function listSeasons(): Promise<Season[]> {
  const snap = await getDocs(collection(db, SEASONS_COLLECTION));
  const list: Season[] = [];
  snap.forEach((docSnap) => {
    list.push(parseSeasonFromFirestore(docSnap.id, docSnap.data() as Record<string, unknown>));
  });
  return sortSeasonsList(list);
}

/** Read one battle pass doc — used after save to verify persistence. */
export async function getSeasonById(seasonId: string): Promise<Season | null> {
  const snap = await getDoc(doc(db, SEASONS_COLLECTION, seasonId));
  if (!snap.exists()) return null;
  return parseSeasonFromFirestore(snap.id, snap.data() as Record<string, unknown>);
}

export async function saveSeason(season: Season): Promise<void> {
  await setDoc(doc(db, SEASONS_COLLECTION, season.id), seasonToFirestoreWrite(season), { merge: true });
}

export async function deleteSeasonById(seasonId: string): Promise<void> {
  await deleteDoc(doc(db, SEASONS_COLLECTION, seasonId));
}

/**
 * Marks one season active and all others inactive; writes `activeBattlePassSeasonId` on adminSettings/season1 for quick client reads.
 */
export async function setActiveSeasonExclusive(seasonId: string, allSeasonIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  for (const id of allSeasonIds) {
    const ref = doc(db, SEASONS_COLLECTION, id);
    batch.set(ref, { active: id === seasonId, updatedAt: serverTimestamp() }, { merge: true });
  }
  batch.set(
    doc(db, 'adminSettings', 'season1'),
    {
      activeBattlePassSeasonId: seasonId,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  await batch.commit();
}

export function createNewSeasonDraftId(): string {
  return `season_${Date.now()}`;
}

export function createDefaultSeason(id: string): Season {
  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + 3);
  return {
    id,
    name: 'New battle pass',
    theme: 'Flow State',
    active: false,
    startAt: now,
    endAt: end,
    description: 'Configure tiers and rewards. Deploy when ready.',
    linkedGameSeasonKey: 'season_1',
    featuredHero: 'Kon',
    tiers: defaultTiersTemplate(),
  };
}

/** Format a Date for datetime-local inputs (local timezone). */
export function dateToDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalValueToDate(value: string): Date {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
