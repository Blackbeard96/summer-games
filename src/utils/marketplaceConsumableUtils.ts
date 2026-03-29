/**
 * Resolve consumable effects from merged marketplace items (admin + catalog), with legacy fallbacks.
 */

import type { MarketplaceStoreArtifact } from '../data/marketplaceArtifactsCatalog';
import type { ConsumableEffect } from '../types/consumableEffects';
import { parseConsumableEffect } from '../types/consumableEffects';

export function resolveConsumableEffectForItem(item: MarketplaceStoreArtifact): ConsumableEffect | null {
  if (item.consumableEffect != null && typeof item.consumableEffect === 'object') {
    const p = parseConsumableEffect(item.consumableEffect);
    if (p.ok) return p.value;
  }
  if (item.id === 'health-potion-25' || item.name === 'Health Potion (25)') {
    return { effectType: 'restore_health', amount: 25, targetScope: 'self' };
  }
  return null;
}

export function isBattleVaultConsumable(item: MarketplaceStoreArtifact): boolean {
  const eff = resolveConsumableEffectForItem(item);
  if (!eff) return false;
  return eff.effectType === 'restore_health' || eff.effectType === 'restore_shields';
}

function isLiveEventMstCandidate(item: MarketplaceStoreArtifact): boolean {
  if (!item.liveEventMkt?.enabled) return false;
  if ((item.liveEventMkt.pricePp ?? 0) <= 0) return false;
  return resolveConsumableEffectForItem(item) !== null;
}

/**
 * Live Event shop: at most one listing per restore_health and one per restore_shields
 * (keeps cheapest PP price when admin + catalog both define the same role).
 */
function dedupeLiveEventMstCatalog(items: MarketplaceStoreArtifact[]): MarketplaceStoreArtifact[] {
  const candidates = items.filter(isLiveEventMstCandidate);
  const pickCheapest = (effectType: 'restore_health' | 'restore_shields'): MarketplaceStoreArtifact | undefined => {
    let best: MarketplaceStoreArtifact | undefined;
    let bestPrice = Infinity;
    for (const i of candidates) {
      const eff = resolveConsumableEffectForItem(i);
      if (!eff || eff.effectType !== effectType) continue;
      const p = i.liveEventMkt?.pricePp ?? Infinity;
      if (p < bestPrice || (p === bestPrice && best && i.id < best.id)) {
        bestPrice = p;
        best = i;
      }
    }
    return best;
  };
  const healthWinner = pickCheapest('restore_health');
  const shieldWinner = pickCheapest('restore_shields');
  const skip = new Set<string>();
  for (const i of candidates) {
    const eff = resolveConsumableEffectForItem(i);
    if (eff?.effectType === 'restore_health' && healthWinner && i.id !== healthWinner.id) skip.add(i.id);
    if (eff?.effectType === 'restore_shields' && shieldWinner && i.id !== shieldWinner.id) skip.add(i.id);
  }
  return candidates.filter((i) => !skip.has(i.id));
}

export function liveEventMstListableItems(items: MarketplaceStoreArtifact[]): MarketplaceStoreArtifact[] {
  return dedupeLiveEventMstCatalog(items);
}
