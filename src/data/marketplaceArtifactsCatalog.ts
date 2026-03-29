/**
 * Canonical list of items shown in the MST Marketplace (MKT) page.
 * Kept in one module so Artifact Compensation can offer the same grantable items
 * without duplicating business logic.
 */

import type { ConsumableEffect, LiveEventMktListing, MarketplaceItemType } from '../types/consumableEffects';

export type { ConsumableEffect, LiveEventMktListing, MarketplaceItemType };

export interface MarketplaceStoreArtifact {
  id: string;
  name: string;
  description: string;
  price: number;
  /** Optional Truth Metal shards required in addition to PP (MST MKT). */
  truthMetalPrice?: number;
  icon: string;
  image: string;
  category: 'time' | 'protection' | 'food' | 'special' | 'equippable';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  originalPrice?: number;
  discount?: number;
  disabled?: boolean;
  /**
   * When set, purchasing this listing grants ownership of this equippable catalog id
   * (adminSettings/equippableArtifacts). Does not add a consumable to inventory.
   */
  equippableArtifactId?: string;
  /** Store semantics — drives admin validation and consumable resolution. */
  itemType?: MarketplaceItemType;
  /** When itemType is consumable (or effect present), used by battle vault + Live Event MST MKT. */
  consumableEffect?: ConsumableEffect;
  /** If set, this listing can appear in Live Event MST MKT for Participation PP. */
  liveEventMkt?: LiveEventMktListing;
}

export const MARKETPLACE_STORE_ARTIFACTS: MarketplaceStoreArtifact[] = [
  {
    id: 'checkin-free',
    name: 'Get Out of Check-in Free',
    description: 'Skip the next check-in requirement',
    price: 50,
    icon: '🎫',
    image: '/images/Get-Out-of-Check-in-Free.png',
    category: 'protection',
    rarity: 'common'
  },
  {
    id: 'shield',
    name: 'Shield',
    description: 'Block the next incoming attack on your vault',
    price: 50,
    icon: '🛡️',
    image: '/images/Shield Item.jpeg',
    category: 'protection',
    rarity: 'common'
  },
  {
    id: 'health-potion-25',
    name: 'Health Potion (25)',
    description: 'Restore 25 HP to your vault health',
    price: 40,
    icon: '🧪',
    image: '/images/Health Potion - 25.png',
    category: 'protection',
    rarity: 'common',
    itemType: 'consumable',
    consumableEffect: { effectType: 'restore_health', amount: 25, targetScope: 'self' },
    liveEventMkt: { enabled: true, pricePp: 600 },
  },
  {
    id: 'shield-restoration-cell',
    name: 'Shield Restoration Cell',
    description: 'Restores shield energy on your vault (additive, up to your max shield).',
    price: 120,
    icon: '🔋',
    image: '/images/Shield Item.jpeg',
    category: 'protection',
    rarity: 'common',
    itemType: 'consumable',
    consumableEffect: { effectType: 'restore_shields', amount: 30, targetScope: 'self' },
    liveEventMkt: { enabled: true, pricePp: 550 },
  },
  {
    id: 'lunch-mosley',
    name: 'Lunch on Mosley',
    description: 'Enjoy a special lunch with Mr. Mosley',
    price: 9999,
    icon: '🍽️',
    image:
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=facearea&w=256&h=256&facepad=2',
    category: 'food',
    rarity: 'legendary'
  },
  {
    id: 'forge-token',
    name: 'Forge Token',
    description: 'Redeem for any custom item you want printed from The Forge (3D Printer)',
    price: 2700,
    icon: '🛠️',
    image: '/images/Forge Token.png',
    category: 'special',
    rarity: 'legendary'
  },
  {
    id: 'uxp-credit-1',
    name: '+1 UXP Credit',
    description: 'Credit to be added to any non-assessment assignment',
    price: 1000,
    icon: '📕',
    image:
      'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=facearea&w=256&h=256&facepad=2',
    category: 'special',
    rarity: 'common'
  },
  {
    id: 'uxp-credit',
    name: '+2 UXP Credit',
    description: 'Credit to be added to any non-assessment assignment',
    price: 1800,
    icon: '📚',
    image:
      'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=facearea&w=256&h=256&facepad=2',
    category: 'special',
    rarity: 'common'
  },
  {
    id: 'uxp-credit-4',
    name: '+4 UXP Credit',
    description: 'Enhanced credit to be added to any non-assessment assignment',
    price: 3420,
    icon: '📖',
    image:
      'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=facearea&w=256&h=256&facepad=2',
    category: 'special',
    rarity: 'rare'
  },
  {
    id: 'double-pp',
    name: 'Double PP Boost',
    description: 'Double any PP you receive for the next 4 hours',
    price: 75,
    icon: '⚡',
    image: '/images/Double PP.png',
    category: 'special',
    rarity: 'epic',
    originalPrice: 100,
    discount: 25
  },
  {
    id: 'skip-the-line',
    name: 'Skip the Line',
    description: 'Skip the line and be the next up to use the pass to leave',
    price: 50,
    icon: '🚀',
    image: '/images/Skip the Line.png',
    category: 'special',
    rarity: 'common'
  },
  {
    id: 'work-extension',
    name: 'Work Extension',
    description:
      'Complete assignments that were past due and normally would no longer be graded',
    price: 250,
    icon: '📝',
    image:
      'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=facearea&w=256&h=256&facepad=2',
    category: 'special',
    rarity: 'common'
  },
  {
    id: 'instant-a',
    name: 'Instant A',
    description:
      'Grants an automatic A for the trimester, no matter what your grade may actually be. Limited to one user per class.',
    price: 99,
    icon: '⭐',
    image: '/images/Instant A.png',
    category: 'special',
    rarity: 'legendary'
  },
  {
    id: 'blaze-ring',
    name: 'Blaze Ring',
    description: 'Adds +1 Level to all Fire Elemental Moves. Equip to a ring slot to activate.',
    price: 540,
    icon: '💍',
    image: '/images/Blaze Ring.png',
    category: 'special',
    rarity: 'epic'
  },
  {
    id: 'terra-ring',
    name: 'Terra Ring',
    description: 'Adds +1 Level to all Earth Elemental Moves. Equip to a ring slot to activate.',
    price: 540,
    icon: '💍',
    image: '/images/Terra Ring.png',
    category: 'special',
    rarity: 'epic'
  },
  {
    id: 'aqua-ring',
    name: 'Aqua Ring',
    description: 'Adds +1 Level to all Water Elemental Moves. Equip to a ring slot to activate.',
    price: 540,
    icon: '💍',
    image: '/images/Aqua Ring.png',
    category: 'special',
    rarity: 'epic'
  },
  {
    id: 'air-ring',
    name: 'Air Ring',
    description: 'Adds +1 Level to all Air Elemental Moves. Equip to a ring slot to activate.',
    price: 540,
    icon: '💍',
    image: '/images/Air Ring.png',
    category: 'special',
    rarity: 'epic'
  },
  {
    id: 'instant-regrade-pass',
    name: 'Instant Regrade Pass',
    description: 'Allows players to get assignments regraded without coming in person. Lasts for 1 day.',
    price: 200,
    icon: '📋',
    image: '/images/Instant Regrade Pass.png',
    category: 'special',
    rarity: 'common'
  },
  {
    id: 'revive-potion',
    name: 'Revive Potion',
    description:
      'When you are eliminated in a Live Event, brings you back at 50% max HP (shields reset). You can buy from MST MKT before elimination to hold it. Use from your Bag to revive a teammate.',
    price: 180,
    icon: '💚',
    image: '/images/Revive Potion.png',
    category: 'special',
    rarity: 'epic',
    itemType: 'consumable',
    consumableEffect: { effectType: 'revive_eliminated_self', amount: 50, targetScope: 'self' },
    liveEventMkt: { enabled: true, pricePp: 1500 },
  }
];
