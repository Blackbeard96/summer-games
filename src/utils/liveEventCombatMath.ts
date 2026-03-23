/**
 * HP/shield absorption for Live Event combat (matches applyInSessionMove shield-first rules).
 */

export function computeDamageAfterShield(
  hp: number,
  shield: number,
  damage: number
): { hp: number; shield: number } {
  if (damage <= 0) return { hp, shield };
  const absorbed = Math.min(shield, damage);
  const remaining = Math.max(0, damage - absorbed);
  return {
    shield: Math.max(0, shield - absorbed),
    hp: Math.max(0, hp - remaining),
  };
}
