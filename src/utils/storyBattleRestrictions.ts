/**
 * Story / tutorial battle loadout restrictions.
 * Scoped per battle — does not permanently alter player profiles.
 */

export type StoryMoveCategory = 'manifest' | 'elemental' | 'system';

export type StoryDisabledAction = 'vault' | 'bag' | 'run' | 'artifacts';

export interface StoryBattleRestrictions {
  /** When set, only these move categories appear in Fight. */
  allowedMoveCategories?: StoryMoveCategory[];
  /** Optional allow-list by move id. */
  allowedMoveIds?: string[];
  /** Optional allow-list by move name (fallback when ids differ). */
  allowedMoveNames?: string[];
  disabledActions?: StoryDisabledAction[];
  /** Prefer Level N Manifest moves when filtering (e.g. 1 for onboarding). */
  forceManifestLevel?: number;
  /** Tutorial banner shown above the Fight menu. */
  tutorialMessage?: string;
}

/** First Truth Metal fight: Manifest only, Level 1. */
export const TRUTH_METAL_BATTLE_RESTRICTIONS: StoryBattleRestrictions = {
  allowedMoveCategories: ['manifest'],
  forceManifestLevel: 1,
  disabledActions: ['vault', 'bag'],
  tutorialMessage:
    'Your elemental affinity has not awakened yet. Use your Manifest—the power born from who you are.',
};

/** Soft Truth encounter for ~2–4 player actions (tutorial). */
export const TRUTH_METAL_OPPONENT = {
  id: 'truth',
  name: 'Truth',
  currentPP: 40,
  maxPP: 40,
  shieldStrength: 10,
  maxShieldStrength: 10,
  level: 1,
} as const;

export interface FilterableBattleMove {
  id?: string;
  name?: string;
  category?: string;
  level?: number;
  unlocked?: boolean;
  type?: string;
  damage?: number;
  manifestType?: string;
}

/**
 * Filter unlocked moves for a restricted Story battle.
 * Prefers Level-1 Manifest attack moves when forceManifestLevel is set,
 * but keeps at least one Manifest move (even support) so the Fight menu is never empty.
 */
export function filterMovesForStoryBattle<T extends FilterableBattleMove>(
  moves: T[],
  restrictions?: StoryBattleRestrictions | null
): T[] {
  if (!restrictions) return moves;

  let filtered = moves.filter((m) => m.unlocked !== false);

  if (restrictions.allowedMoveCategories?.length) {
    const allowed = new Set(restrictions.allowedMoveCategories);
    filtered = filtered.filter((m) => allowed.has(m.category as StoryMoveCategory));
  }

  if (restrictions.allowedMoveIds?.length) {
    const ids = new Set(restrictions.allowedMoveIds);
    filtered = filtered.filter((m) => m.id && ids.has(m.id));
  }

  if (restrictions.allowedMoveNames?.length) {
    const names = new Set(restrictions.allowedMoveNames.map((n) => n.toLowerCase()));
    filtered = filtered.filter((m) => m.name && names.has(m.name.toLowerCase()));
  }

  if (restrictions.forceManifestLevel != null) {
    const level = restrictions.forceManifestLevel;
    const atLevel = filtered.filter(
      (m) => m.category === 'manifest' && (m.level == null || m.level === level)
    );
    if (atLevel.length > 0) {
      filtered = atLevel;
    }
  }

  // Prefer an offensive Manifest move when available so the tutorial fight is winnable
  const withDamage = filtered.filter((m) => (m.damage ?? 0) > 0);
  if (withDamage.length > 0 && restrictions.allowedMoveCategories?.includes('manifest')) {
    // Keep damage moves + at most one support so UI stays simple for onboarding
    const support = filtered.filter((m) => !(m.damage ?? 0)).slice(0, 0);
    filtered = [...withDamage, ...support];
  }

  return filtered;
}

export function isActionDisabledByStoryRestrictions(
  action: StoryDisabledAction,
  restrictions?: StoryBattleRestrictions | null
): boolean {
  return !!restrictions?.disabledActions?.includes(action);
}
