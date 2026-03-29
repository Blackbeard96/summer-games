/**
 * Resolve vault-applicable consumables (battle bag / activateArtifact) from merged marketplace data.
 */

import type { MarketplaceStoreArtifact } from '../data/marketplaceArtifactsCatalog';
import type { ConsumableEffect } from '../types/consumableEffects';
import { fetchMergedMarketplaceCatalog } from './marketplaceStoreMerge';
import { resolveConsumableEffectForItem } from './marketplaceConsumableUtils';

export async function resolveVaultBattleConsumable(
  artifactName: string
): Promise<
  { ok: true; item: MarketplaceStoreArtifact; effect: ConsumableEffect } | { ok: false }
> {
  const catalog = await fetchMergedMarketplaceCatalog();
  const item = catalog.find((i) => i.name === artifactName);
  if (!item) return { ok: false };
  const effect = resolveConsumableEffectForItem(item);
  if (!effect) return { ok: false };
  if (effect.effectType !== 'restore_health' && effect.effectType !== 'restore_shields') {
    return { ok: false };
  }
  return { ok: true, item, effect };
}
