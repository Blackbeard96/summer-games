import { liveEventMstListableItems } from './marketplaceConsumableUtils';
import type { MarketplaceStoreArtifact } from '../data/marketplaceArtifactsCatalog';

describe('liveEventMstListableItems', () => {
  it('keeps one restore_health and one restore_shields (cheapest PP each)', () => {
    const items: MarketplaceStoreArtifact[] = [
      {
        id: 'expensive-heal',
        name: 'Health Potion (25)',
        description: 'x',
        price: 1,
        icon: '🧪',
        image: '/x.png',
        category: 'protection',
        rarity: 'common',
        itemType: 'consumable',
        consumableEffect: { effectType: 'restore_health', amount: 25, targetScope: 'self' },
        liveEventMkt: { enabled: true, pricePp: 600 },
      },
      {
        id: 'cheap-heal',
        name: 'Health Potion (50 HP)',
        description: 'x',
        price: 1,
        icon: '🧪',
        image: '/x.png',
        category: 'protection',
        rarity: 'common',
        itemType: 'consumable',
        consumableEffect: { effectType: 'restore_health', amount: 50, targetScope: 'self' },
        liveEventMkt: { enabled: true, pricePp: 40 },
      },
      {
        id: 'shield-a',
        name: 'Shield A',
        description: 'x',
        price: 1,
        icon: '🔋',
        image: '/x.png',
        category: 'protection',
        rarity: 'common',
        itemType: 'consumable',
        consumableEffect: { effectType: 'restore_shields', amount: 30, targetScope: 'self' },
        liveEventMkt: { enabled: true, pricePp: 550 },
      },
      {
        id: 'shield-b',
        name: 'Shield B',
        description: 'x',
        price: 1,
        icon: '🔋',
        image: '/x.png',
        category: 'protection',
        rarity: 'common',
        itemType: 'consumable',
        consumableEffect: { effectType: 'restore_shields', amount: 20, targetScope: 'self' },
        liveEventMkt: { enabled: true, pricePp: 100 },
      },
      {
        id: 'revive',
        name: 'Revive',
        description: 'x',
        price: 1,
        icon: '💚',
        image: '/x.png',
        category: 'special',
        rarity: 'epic',
        itemType: 'consumable',
        consumableEffect: { effectType: 'revive_eliminated_self', amount: 50, targetScope: 'self' },
        liveEventMkt: { enabled: true, pricePp: 75 },
      },
    ];
    const out = liveEventMstListableItems(items);
    const ids = out.map((i) => i.id).sort();
    expect(ids).toEqual(['cheap-heal', 'revive', 'shield-b'].sort());
  });
});
