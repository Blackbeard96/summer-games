/**
 * Merge canonical MST MKT catalog with adminSettings/marketplaceArtifacts (Firestore).
 * Firestore values override catalog fields per item id; items only in Firestore are appended.
 */

import {
  MARKETPLACE_STORE_ARTIFACTS,
  type MarketplaceStoreArtifact,
} from '../data/marketplaceArtifactsCatalog';
import type { LiveEventMktListing, MarketplaceItemType } from '../types/consumableEffects';
import { parseConsumableEffect } from '../types/consumableEffects';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

const DOC_META = new Set(['lastUpdated', 'updatedBy']);

export function normalizeMarketplaceItem(
  id: string,
  partial: Partial<MarketplaceStoreArtifact> & Record<string, unknown>
): MarketplaceStoreArtifact {
  const tm = partial.truthMetalPrice;
  const cat = partial.category;
  const rarity = partial.rarity;
  return {
    id: typeof partial.id === 'string' && partial.id.trim() ? partial.id.trim() : id,
    name: typeof partial.name === 'string' && partial.name.trim() ? partial.name.trim() : id,
    description: typeof partial.description === 'string' ? partial.description : '',
    price: Math.max(0, Math.floor(Number(partial.price) || 0)),
    truthMetalPrice:
      tm !== undefined && tm !== null && String(tm).trim() !== ''
        ? Math.max(0, Math.floor(Number(tm) || 0))
        : undefined,
    icon: typeof partial.icon === 'string' && partial.icon ? partial.icon : '📦',
    image: typeof partial.image === 'string' ? partial.image : '',
    category: (
      ['time', 'protection', 'food', 'special', 'equippable'].includes(cat as string)
        ? cat
        : 'special'
    ) as MarketplaceStoreArtifact['category'],
    equippableArtifactId:
      typeof partial.equippableArtifactId === 'string' && partial.equippableArtifactId.trim()
        ? partial.equippableArtifactId.trim()
        : undefined,
    rarity: (['common', 'rare', 'epic', 'legendary'].includes(rarity as string)
      ? rarity
      : 'common') as MarketplaceStoreArtifact['rarity'],
    originalPrice:
      partial.originalPrice != null && String(partial.originalPrice).trim() !== ''
        ? Math.max(0, Math.floor(Number(partial.originalPrice) || 0))
        : undefined,
    discount:
      partial.discount != null && String(partial.discount).trim() !== ''
        ? Math.max(0, Math.min(100, Math.floor(Number(partial.discount) || 0)))
        : undefined,
    disabled: partial.disabled === true,
    itemType: normalizeItemType(partial),
    consumableEffect: normalizeConsumableEffectField(partial.consumableEffect),
    liveEventMkt: normalizeLiveEventMkt(partial.liveEventMkt),
  };
}

function normalizeItemType(partial: Record<string, unknown>): MarketplaceItemType | undefined {
  const it = partial.itemType;
  if (it === 'consumable' || it === 'equippable_grant' || it === 'currency' || it === 'unlock' || it === 'other') {
    return it;
  }
  const eq = partial.equippableArtifactId;
  if (typeof eq === 'string' && eq.trim() && !partial.consumableEffect) {
    return 'equippable_grant';
  }
  if (partial.consumableEffect && typeof partial.consumableEffect === 'object') {
    const p = parseConsumableEffect(partial.consumableEffect);
    if (p.ok) return 'consumable';
  }
  return undefined;
}

function normalizeConsumableEffectField(raw: unknown): MarketplaceStoreArtifact['consumableEffect'] {
  if (raw == null || typeof raw !== 'object') return undefined;
  const p = parseConsumableEffect(raw);
  return p.ok ? p.value : undefined;
}

function normalizeLiveEventMkt(raw: unknown): LiveEventMktListing | undefined {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const enabled = o.enabled === true;
  const pricePp = Math.max(0, Math.floor(Number(o.pricePp) || 0));
  if (!enabled && pricePp <= 0) return undefined;
  return { enabled, pricePp };
}

/** Merged catalog for clients (Marketplace, battle bag, Live Event MKT). */
export async function fetchMergedMarketplaceCatalog(): Promise<MarketplaceStoreArtifact[]> {
  const snap = await getDoc(doc(db, 'adminSettings', 'marketplaceArtifacts'));
  return mergeMarketplaceStoreItems(MARKETPLACE_STORE_ARTIFACTS, snap.exists() ? snap.data() : {});
}

/** Strip Firestore doc metadata → raw slot map */
export function marketplaceFirestoreSlots(
  doc: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!doc || typeof doc !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc)) {
    if (DOC_META.has(k)) continue;
    out[k] = v;
  }
  return out;
}

export function mergeMarketplaceStoreItems(
  catalog: MarketplaceStoreArtifact[],
  firestoreDoc: Record<string, unknown> | null | undefined
): MarketplaceStoreArtifact[] {
  const raw = marketplaceFirestoreSlots(firestoreDoc || undefined);
  const result = new Map<string, MarketplaceStoreArtifact>();

  for (const c of catalog) {
    const ov = raw[c.id];
    if (ov && typeof ov === 'object' && !Array.isArray(ov)) {
      result.set(c.id, normalizeMarketplaceItem(c.id, { ...c, ...(ov as Record<string, unknown>) }));
    } else {
      result.set(c.id, { ...c });
    }
  }

  for (const [k, v] of Object.entries(raw)) {
    if (result.has(k)) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      result.set(k, normalizeMarketplaceItem(k, v as Record<string, unknown>));
    }
  }

  return Array.from(result.values()).sort((a, b) => {
    const ia = catalog.findIndex((x) => x.id === a.id);
    const ib = catalog.findIndex((x) => x.id === b.id);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

/** Full id → item map for Artifacts Admin (editable snapshot). */
export function buildMarketplaceAdminMap(
  catalog: MarketplaceStoreArtifact[],
  firestoreDoc: Record<string, unknown> | null | undefined
): Record<string, MarketplaceStoreArtifact> {
  const list = mergeMarketplaceStoreItems(catalog, firestoreDoc);
  return Object.fromEntries(list.map((item) => [item.id, item]));
}
