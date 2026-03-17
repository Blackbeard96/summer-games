/**
 * Canonical Artifact types for MST/9K
 *
 * FEATURE: Artifact Rarity Power Level + optional Artifact Skills
 * - Every artifact has rarity, powerLevelBonus (derived from rarity), perks.
 * - Legendary (and optionally others) can define an equippable artifactSkill (uses 1 of 6 loadout slots).
 */

import type { ArtifactRarity } from '../constants/artifactRarity';

/** Move-like definition for an artifact-granted skill (occupies one of 6 loadout slots). */
export interface ArtifactSkillDefinition {
  id: string;
  name: string;
  description: string;
  category: 'system';
  type: 'attack' | 'defense' | 'utility' | 'support' | 'control';
  cost: number;
  cooldown: number;
  damage?: number;
  ppSteal?: number;
  healing?: number;
  shieldBoost?: number;
  debuffType?: string;
  debuffStrength?: number;
  buffType?: string;
  buffStrength?: number;
  duration?: number;
  targetType?: 'self' | 'single' | 'team' | 'enemy' | 'enemy_team' | 'all';
  priority?: number;
}

/**
 * Artifact schema: rarity, powerLevelBonus (derived from rarity if not set), perks, optional artifactSkill.
 * Used for equipped artifacts and artifact definitions.
 */
export interface ArtifactData {
  id: string;
  name: string;
  /** Must be one of: common, uncommon, rare, epic, legendary. */
  rarity?: ArtifactRarity | string;
  /** Fixed Power Level bonus; derived from rarity if missing. */
  powerLevelBonus?: number;
  /** Premium perks (e.g. descriptions). */
  perks?: string[];
  /** Optional skill granted by this artifact; uses one of 6 loadout slots when equipped. */
  artifactSkill?: ArtifactSkillDefinition | null;
  /** Legacy / display. */
  slot?: string;
  stats?: Record<string, number>;
  level?: number;
  image?: string;
  price?: number;
  upgradeLevel?: number;
}
