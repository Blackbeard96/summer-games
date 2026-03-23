/**
 * Built-in equippable rows merged under Firestore `adminSettings/equippableArtifacts`.
 * Firestore entries override these by id.
 */

import type { ArtifactRarity } from '../constants/artifactRarity';

/** Canonical id: `captain-helmet` normalizes to this in compensation / battle code. */
export const DEFAULT_EQUIPPABLE_ARTIFACTS_CATALOG: Record<string, Record<string, unknown>> = {
  'captains-helmet': {
    id: 'captains-helmet',
    name: "Captain's Helmet",
    description:
      "A legendary helmet that boosts manifest move damage by 5%. Equip to the head slot to activate.",
    slot: 'head',
    rarity: 'common' as ArtifactRarity,
    level: 1,
    image: '/images/Captains Helmet.png',
    powerLevelBonus: 150,
    stats: { manifestDamageBoost: 0.05 },
    perks: [] as string[],
  },
};
