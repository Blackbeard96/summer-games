/**
 * Unified Skill Loadout — Single source of truth
 *
 * FEATURE: 6-skill loadout from any source (manifest, elemental, RR Candy, artifact).
 * - Players can equip up to MAX_EQUIPPED_SKILLS at a time.
 * - Artifact skills use one of these slots when equipped.
 */

export const MAX_EQUIPPED_SKILLS = 6;

/** Skill source for UI grouping and eligibility. */
export type SkillSource = 'manifest' | 'elemental' | 'rrCandy' | 'artifact';
