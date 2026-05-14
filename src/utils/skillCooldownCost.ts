/**
 * Canonical skill **energy cost** and **turn cooldown** base values for Manifest & Elemental moves.
 * RR Candy and other skills keep catalog / move row values unless they fall through to defaults.
 */

import type { Move } from '../types/battle';

export function isRrCandySkillMove(move: Pick<Move, 'id' | 'rrCandyNodeId' | 'rrCandySkillId'>): boolean {
  const id = String(move.id || '').toLowerCase();
  return (
    id.startsWith('rr-candy-') ||
    id.includes('rr-candy') ||
    Boolean(move.rrCandyNodeId) ||
    Boolean(move.rrCandySkillId)
  );
}

/** Manifest path: primary manifest moves + Level 2 Meta manifest rows (often `category: system`). */
export function isManifestSkillMove(move: Pick<Move, 'id' | 'category' | 'effectKey'>): boolean {
  if (isRrCandySkillMove(move)) return false;
  const id = String(move.id || '').toLowerCase();
  return move.category === 'manifest' || move.effectKey === 'level2_manifest' || id.startsWith('l2-manifest::');
}

export function isElementalSkillMove(move: Pick<Move, 'category'>): boolean {
  return move.category === 'elemental';
}

/** Skill level used for pricing / cooldown (not mastery rank). */
export function getSkillLevelForCooldownCost(move: Pick<Move, 'level'>): number {
  return Math.max(1, Math.floor(Number(move.level) || 1));
}

export function getManifestSkillCooldownOrCostForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return Math.max(1, Math.floor(lv / 2));
}

export function getElementalSkillCooldownOrCostForLevel(level: number): number {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  if (lv <= 2) return 1;
  if (lv <= 5) return 2;
  if (lv <= 8) return 3;
  return 4;
}

/**
 * Single canonical value used as both vault-battle **energy cost** and **post-use cooldown turns**
 * for Manifest & Elemental skills. RR Candy uses stored `cost` / `cooldown` when set; otherwise sensible defaults.
 */
export function getSkillCooldownOrCost(move: Move): number {
  if (isRrCandySkillMove(move)) {
    const c = typeof move.cost === 'number' ? move.cost : undefined;
    const cd = typeof move.cooldown === 'number' ? move.cooldown : undefined;
    if (c != null && c > 0) return Math.floor(c);
    if (cd != null && cd > 0) return Math.floor(cd);
    return Math.max(1, Math.floor(Number(c ?? cd) || 1));
  }
  if (isManifestSkillMove(move)) {
    return getManifestSkillCooldownOrCostForLevel(getSkillLevelForCooldownCost(move));
  }
  if (isElementalSkillMove(move)) {
    return getElementalSkillCooldownOrCostForLevel(getSkillLevelForCooldownCost(move));
  }
  const c = typeof move.cost === 'number' ? move.cost : undefined;
  const cd = typeof move.cooldown === 'number' ? move.cooldown : undefined;
  if (cd != null && cd > 0) return Math.floor(cd);
  if (c != null && c > 0) return Math.floor(c);
  return 1;
}

/** Live Event participation **base** before artifact reductions (RR stays flat 4). */
export function getLiveEventParticipationBaseFromSkillRules(move: Move): number {
  if (isRrCandySkillMove(move)) return 4;
  if (isManifestSkillMove(move) || isElementalSkillMove(move)) {
    return getSkillCooldownOrCost(move);
  }
  return 1;
}

/** Apply canonical cost + cooldown to a move copy (manifest, elemental, L2 manifest id). RR / artifacts unchanged. */
export function applyCanonicalSkillCostAndCooldown(move: Move): Move {
  if (isRrCandySkillMove(move)) return move;
  if (!isManifestSkillMove(move) && !isElementalSkillMove(move)) return move;
  const v = getSkillCooldownOrCost(move);
  return { ...move, cost: v, cooldown: v };
}
