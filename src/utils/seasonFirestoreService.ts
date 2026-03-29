/**
 * Firestore CRUD for Season 1 battle pass definitions: collection `seasons/{seasonId}`.
 * Clients should parse with parseSeasonFromFirestore for safe defaults.
 */
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { BattlePassReward, BattlePassTier, Season } from '../types/season1';

export const SEASONS_COLLECTION = 'seasons';

const REWARD_TYPES = new Set(['xp', 'pp', 'artifact', 'item', 'skill_card']);
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

function parseTier(raw: unknown, idx: number): BattlePassTier {
  const t = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const rewardsRaw = Array.isArray(t.rewards) ? t.rewards : [];
  return {
    id: String(t.id || `tier_${idx + 1}`),
    tierNumber: Number(t.tierNumber) || idx + 1,
    requiredXP: Number(t.requiredXP) || 0,
    rewards: rewardsRaw.map((r, j) => parseReward(r, j)),
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
  return {
    id,
    name: String(d.name || 'Unnamed season'),
    theme: String(d.theme || ''),
    active: !!d.active,
    startAt: coerceToDate(d.startAt),
    endAt: coerceToDate(d.endAt),
    description: String(d.description || ''),
    featuredHero: d.featuredHero != null && String(d.featuredHero).trim() ? String(d.featuredHero) : undefined,
    homeBannerImage:
      d.homeBannerImage != null && String(d.homeBannerImage).trim() ? String(d.homeBannerImage) : undefined,
    tiers,
  };
}

export function seasonToFirestoreWrite(season: Season): Record<string, unknown> {
  return {
    name: season.name,
    theme: season.theme,
    active: season.active,
    startAt: Timestamp.fromDate(coerceToDate(season.startAt)),
    endAt: Timestamp.fromDate(coerceToDate(season.endAt)),
    description: season.description,
    featuredHero: season.featuredHero ?? null,
    homeBannerImage: season.homeBannerImage ?? null,
    tiers: season.tiers.map((t) => ({
      id: t.id,
      tierNumber: t.tierNumber,
      requiredXP: t.requiredXP,
      rewards: t.rewards.map((r) => ({
        id: r.id,
        rewardType: r.rewardType,
        rewardRefId: r.rewardRefId ?? null,
        quantity: r.quantity ?? null,
        rarity: r.rarity ?? null,
        displayName: r.displayName,
        description: r.description,
        iconUrl: r.iconUrl ?? null,
      })),
    })),
    updatedAt: serverTimestamp(),
  };
}

export async function listSeasons(): Promise<Season[]> {
  const snap = await getDocs(collection(db, SEASONS_COLLECTION));
  const list: Season[] = [];
  snap.forEach((docSnap) => {
    list.push(parseSeasonFromFirestore(docSnap.id, docSnap.data() as Record<string, unknown>));
  });
  list.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return coerceToDate(b.startAt).getTime() - coerceToDate(a.startAt).getTime();
  });
  return list;
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
    name: 'New battle pass season',
    theme: 'Flow State',
    active: false,
    startAt: now,
    endAt: end,
    description: 'Configure tiers and rewards. Deploy when ready.',
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
