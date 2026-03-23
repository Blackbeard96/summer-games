/**
 * Canonical Artifact types for MST/9K
 *
 * FEATURE: Artifact Rarity Power Level + optional Artifact Skills
 * - Every artifact has rarity, powerLevelBonus (derived from rarity), perks.
 * - Legendary (and optionally others) can define an equippable artifactSkill (uses 1 of 6 loadout slots).
 */

import type { ArtifactRarity } from '../constants/artifactRarity';

/** Status effect applied by a skill (same shape as Manifest move overrides). */
export interface ArtifactStatusEffect {
  type: 'burn' | 'stun' | 'bleed' | 'poison' | 'confuse' | 'drain' | 'cleanse' | 'freeze' | 'reduce' | 'summon' | 'none';
  duration: number;
  intensity?: number;
  damagePerTurn?: number;
  ppLossPerTurn?: number;
  ppStealPerTurn?: number;
  healPerTurn?: number;
  chance?: number;
  successChance?: number;
  damageReduction?: number;
  /** Summon effect: elemental type for the construct's attacks */
  summonElementalType?: 'fire' | 'water' | 'air' | 'earth' | 'lightning' | 'light' | 'shadow' | 'metal';
  /** Summon effect: damage dealt by the construct each time it attacks */
  summonDamage?: number;
  /** Summon effect: display name for the construct (e.g. "Construct of Light") */
  summonName?: string;
}

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
  /** Status effects applied when this skill is used (same as Manifest move status effects). */
  statusEffects?: ArtifactStatusEffect[];
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
