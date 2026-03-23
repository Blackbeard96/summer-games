/**
 * Summoned construct stats for Skills UI and battle spawn.
 * Power scales with the granting artifact's level (+10% per level above 1, up to level 10).
 */

export const SUMMON_ARTIFACT_MAX_LEVEL = 10;

/** L1 = ×1.0, L10 = ×1.9 (+10% per level after 1). */
export function summonArtifactPowerMultiplier(artifactLevel: number): number {
  const L = Math.max(
    1,
    Math.min(SUMMON_ARTIFACT_MAX_LEVEL, Math.floor(Number(artifactLevel) || 1))
  );
  return 1 + (L - 1) * 0.1;
}

export interface SummonEffectLike {
  type?: string;
  duration?: number;
  summonDamage?: number;
  summonElementalType?: string;
  summonName?: string;
}

export interface ResolvedConstructStats {
  displayName: string;
  durationTurns: number;
  elementalType: string;
  /** Per-hit elemental attack damage (construct turn). */
  attackDamage: number;
  maxHealth: number;
  maxShield: number;
  artifactLevelUsed: number;
  powerMultiplier: number;
}

export function getFirstSummonEffectFromMove(move: {
  statusEffects?: Array<{ type?: string; [key: string]: unknown }> | null | undefined;
}): SummonEffectLike | null {
  const fx = move.statusEffects?.find((e) => e && e.type === 'summon');
  if (!fx) return null;
  return fx as SummonEffectLike;
}

/**
 * Resolve HP, shields, and attack damage from a summon status effect + artifact level.
 * Light constructs use the Stroke-of-Creation-style profile (100/50 base); others use 50/25 base.
 */
export function resolveConstructStatsForSummonEffect(
  effect: SummonEffectLike,
  artifactLevel: number
): ResolvedConstructStats {
  const mult = summonArtifactPowerMultiplier(artifactLevel);
  const elemental = String(effect.summonElementalType || 'fire').toLowerCase();
  const baseDamage = Math.max(1, Math.floor(Number(effect.summonDamage) || 100));
  const durationTurns = Math.max(1, Math.floor(Number(effect.duration) || 2));

  const isLight = elemental === 'light';
  const baseHealth = isLight ? 100 : 50;
  const baseShield = isLight ? 50 : 25;

  const attackDamage = Math.max(1, Math.round(baseDamage * mult));
  const maxHealth = Math.max(1, Math.round(baseHealth * mult));
  const maxShield = Math.max(0, Math.round(baseShield * mult));

  let displayName = typeof effect.summonName === 'string' ? effect.summonName.trim() : '';
  if (!displayName) {
    displayName = elemental === 'light' ? 'Light Construct' : `Summoned Construct (${elemental})`;
  }
  if (displayName === 'Construct of Light') displayName = 'Light Construct';

  const L = Math.max(
    1,
    Math.min(SUMMON_ARTIFACT_MAX_LEVEL, Math.floor(Number(artifactLevel) || 1))
  );

  return {
    displayName,
    durationTurns,
    elementalType: elemental,
    attackDamage,
    maxHealth,
    maxShield,
    artifactLevelUsed: L,
    powerMultiplier: mult,
  };
}
