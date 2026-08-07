/**
 * Shared Skills & Mastery upgrade pricing.
 * Source of truth for Manifest, Elemental, and other battle skill mastery PP costs.
 *
 * Ascension milestones (UX only — not separate cost tiers for 6–9):
 * - Level 5 = First Ascension (upgrade from 4 → 5)
 * - Level 10 = Final Ascension (upgrade from 9 → 10)
 */

export const SKILL_MAX_MASTERY_LEVEL = 10;

/** PP cost to reach each target mastery level (keys are the level AFTER upgrade). */
export const SKILL_UPGRADE_COSTS: Readonly<Record<number, number>> = {
  2: 150,
  3: 300,
  4: 500,
  5: 800,
  6: 1000,
  7: 1300,
  8: 1700,
  9: 2200,
  10: 3000,
};

export type SkillAscensionKind = 'first' | 'final' | null;

/** PP required to upgrade TO `targetLevel`. Returns null if invalid / maxed. */
export function getSkillUpgradeCost(targetLevel: number): number | null {
  if (!Number.isFinite(targetLevel)) return null;
  const level = Math.floor(targetLevel);
  if (level < 2 || level > SKILL_MAX_MASTERY_LEVEL) return null;
  const cost = SKILL_UPGRADE_COSTS[level];
  return typeof cost === 'number' ? cost : null;
}

/** PP required to upgrade from `currentLevel` to the next level. */
export function getSkillUpgradeCostFromLevel(currentLevel: number): number | null {
  const current = Math.floor(Number(currentLevel) || 1);
  if (current >= SKILL_MAX_MASTERY_LEVEL) return null;
  return getSkillUpgradeCost(current + 1);
}

/** Ascension milestone when upgrading TO `targetLevel`. */
export function getSkillAscensionKind(targetLevel: number): SkillAscensionKind {
  const level = Math.floor(targetLevel);
  if (level === 5) return 'first';
  if (level === 10) return 'final';
  return null;
}

export function isSkillAtMaxMastery(currentLevel: number): boolean {
  return Math.floor(Number(currentLevel) || 0) >= SKILL_MAX_MASTERY_LEVEL;
}

/** Button / confirm copy for the upgrade that reaches `targetLevel`. */
export function getSkillUpgradeButtonLabel(
  targetLevel: number,
  options?: { formatCost?: (n: number) => string; shardsSuffix?: string }
): string {
  const cost = getSkillUpgradeCost(targetLevel);
  if (cost == null) return 'Cannot Upgrade';
  const format = options?.formatCost ?? ((n: number) => n.toLocaleString());
  const costText = `${format(cost)} PP`;
  const shards = options?.shardsSuffix ?? '';
  const ascension = getSkillAscensionKind(targetLevel);
  if (ascension === 'first') {
    return `First Ascension — Level 5 (${costText}${shards})`;
  }
  if (ascension === 'final') {
    return `Final Ascension — Level 10 (${costText}${shards})`;
  }
  return `Upgrade to Level ${targetLevel} (${costText}${shards})`;
}

export function getSkillUpgradeSuccessMessage(skillName: string, newLevel: number): string {
  const ascension = getSkillAscensionKind(newLevel);
  if (ascension === 'first') {
    return `Successfully Ascended ${skillName} to Level 5!`;
  }
  if (ascension === 'final') {
    return `Successfully completed Final Ascension for ${skillName}!`;
  }
  return `Successfully upgraded ${skillName} to Level ${newLevel}!`;
}
