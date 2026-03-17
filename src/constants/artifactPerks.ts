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
    description: 'Grants access to a specific elemental move set.'
  },
  {
    id: 'damage-boost',
    label: 'Damage Boost',
    description: 'Increases damage dealt by the artifact or linked skill.'
  },
  {
    id: 'shield-boost',
    label: 'Shield Boost',
    description: 'Improves shield strength or shield restoration effects.'
  },
  {
    id: 'healing-boost',
    label: 'Healing Boost',
    description: 'Improves healing effects and recovery amounts.'
  },
  {
    id: 'cooldown-reduction',
    label: 'Cooldown Reduction',
    description: 'Reduces cooldowns for the artifact-provided skill.'
  },
  {
    id: 'pp-economy',
    label: 'PP Economy',
    description: 'Improves PP efficiency or lowers activation cost.'
  },
  {
    id: 'status-defense',
    label: 'Status Defense',
    description: 'Reduces the impact of debuffs and status effects.'
  },
  {
    id: 'turn-priority',
    label: 'Turn Priority',
    description: 'Improves action priority for battle timing.'
  },
  {
    id: 'artifact-synergy',
    label: 'Artifact Synergy',
    description: 'Improves compatibility with other equipped artifacts.'
  },
  {
    id: 'vault-defense',
    label: 'Vault Defense',
    description: 'Increases vault protection during battle.'
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

