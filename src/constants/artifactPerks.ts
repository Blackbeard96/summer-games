/**
 * Artifact perk catalog and rarity-based perk limits.
 *
 * Used by the Equippable Artifacts admin UI so perks can be chosen from a dropdown.
 * Existing saved artifacts remain compatible because perks are still stored as string[].
 */

import type { ArtifactRarity } from './artifactRarity';

export interface ArtifactPerkOption {
  id: string;
  label: string;
  description: string;
}

export const ARTIFACT_PERK_OPTIONS: ArtifactPerkOption[] = [
  {
    id: 'elemental-access',
    label: 'Elemental Access',
    description:
      'Unlocks a second element in the Artifacts menu. Choose Water, Earth, Air, etc. (not your primary). Matching elemental skills appear in battle and Skills & Mastery.'
  },
  {
    id: 'damage-boost',
    label: 'Damage Boost',
    description:
      'Increases damage dealt by all of your skills. Starts at +10% at artifact level 1 and scales with level up to +100% at max level (level 10). Multiple pieces with this perk stack toward the same cap (total +100% from this perk type).'
  },
  {
    id: 'manifest-boost',
    label: 'Manifest Boost',
    description:
      'Increases damage (and offensive manifest shield effects) from manifest-category skills only. +10% at artifact level 1, scaling up to +100% at level 10. Multiple pieces stack toward the same cap (+100% total from this perk type). Artifact Synergy can strengthen this perk.'
  },
  {
    id: 'elemental-boost',
    label: 'Elemental Boost',
    description:
      'Increases damage from elemental-category skills only. +10% at artifact level 1, scaling up to +100% at level 10. Multiple pieces stack toward the same cap (+100% total from this perk type). Stacks multiplicatively with Elemental Ring level bonuses. Artifact Synergy can strengthen this perk.'
  },
  {
    id: 'shield-boost',
    label: 'Shield Boost',
    description:
      'Increases vault shield capacity: +100 at level 1, +50 more per artifact level. Applies while equipped.'
  },
  {
    id: 'impenetrable',
    label: 'Impenetrable',
    description:
      'Grants 1 daily Overshield on your vault while equipped: it must be broken before your vault can be damaged. If destroyed, it returns on the next Eastern calendar day (at most once per day). Also increases shield capacity by +10 at artifact level 1, scaling up to +100 at max level (10). Artifact Synergy can strengthen the shield bonus.'
  },
  {
    id: 'healing-boost',
    label: 'Healing Boost',
    description:
      'At the start of each of your turns in battle, restores vault health (or PP when no vault health is used): 10 at artifact level 1, scaling up to 50 at level 10. Multiple pieces stack toward the same cap (50 total per turn from this perk). Artifact Synergy can increase this perk’s strength.'
  },
  {
    id: 'cooldown-reduction',
    label: 'Cost Reduction',
    description:
      'Live Events: each piece reduces skill Participation Point cost by 1, or by 2 at max artifact level (10). Also increases skill damage slightly as the artifact levels, up to +5% total effectiveness at max (stacking across pieces caps at +5%). Artifact Synergy strengthens both effects.'
  },
  {
    id: 'pp-economy',
    label: 'PP Economy',
    description:
      'Increases all PP you receive in battle (stolen PP, end-of-battle rewards, PP added by healing effects, etc.): +10% at artifact level 1, scaling with level up to +50% per piece. Multiple pieces stack toward the same cap (+50% total bonus from this perk type). Artifact Synergy can increase this perk’s strength.'
  },
  {
    id: 'status-defense',
    label: 'Status Defense',
    description:
      'Mitigates incoming damage (after shields): 5% reduction at level 1, scaling with artifact level up to 30% at max level (level 10). Multiple pieces stack, capped at 30% total mitigation from this perk.'
  },
  {
    id: 'turn-priority',
    label: 'Turn Priority',
    description: 'Improves action priority for battle timing.'
  },
  {
    id: 'artifact-synergy',
    label: 'Artifact Synergy',
    description:
      'Matching set bonus: other equipped artifacts whose names share the same leading set word as this item (e.g. “Unveiled” from “Unveiled Leg Armor”) gain +10% effectiveness on their combat perks (damage boost, manifest boost, elemental boost, shield boost, Cost Reduction, Freeze on hit, etc.) per synergizing piece, up to +30% total. This item does not buff itself.'
  },
  {
    id: 'vault-defense',
    label: 'Vault Defense',
    description: 'Increases vault protection during battle.'
  },
  {
    id: 'freeze-on-hit',
    label: 'Freeze',
    description:
      'Vault Siege: when your offensive skill deals shield or vault health damage, chance to freeze the defender — they skip their next vault attack attempt (daily move still consumed). 5% at artifact level 1 up to 20% at level 10 per piece; multiple pieces stack toward a 25% total cap. Artifact Synergy can increase this chance.'
  }
];

export const ARTIFACT_PERK_LIMITS: Record<ArtifactRarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 2,
  epic: 3,
  legendary: 3
};

export function getArtifactPerkLimit(rarity: ArtifactRarity | string | null | undefined): number {
  const normalized = String(rarity || 'common').toLowerCase().trim() as ArtifactRarity;
  return ARTIFACT_PERK_LIMITS[normalized] ?? ARTIFACT_PERK_LIMITS.common;
}

