import { Move } from '../types/battle';
import type { RRCandyNodeDefinition } from '../types/rrCandyConfig';
import { rrCandyBattleMoveIdFromSkillId } from './rrCandyConfigMapping';

function categoryToMoveType(category: string): Move['type'] {
  const c = category.toLowerCase();
  if (c.includes('defense')) return 'defense';
  if (c.includes('control')) return 'control';
  if (c.includes('attack')) return 'attack';
  return 'utility';
}

/** Shield OFF: percent of target *max* shields removed, keyed to mastery level (1–10). */
const SHIELD_OFF_BASE_PERCENT = 25;
const SHIELD_OFF_PER_MASTERY_STEP = 5;
const SHIELD_OFF_MAX_PERCENT = 50;

export function shieldOffMaxShieldRemovePercent(masteryLevel: number): number {
  const m = Math.max(1, Math.min(10, Math.floor(Number(masteryLevel) || 1)));
  return Math.min(SHIELD_OFF_MAX_PERCENT, SHIELD_OFF_BASE_PERCENT + (m - 1) * SHIELD_OFF_PER_MASTERY_STEP);
}

export function shieldOffMaxShieldRemoveFraction(masteryLevel: number): number {
  return shieldOffMaxShieldRemovePercent(masteryLevel) / 100;
}

/**
 * Base for Shield OFF % removal: max(stat max, current shields, 1).
 * If max shields are missing/0 on an enemy row, `floor(0 * pct)` would strip nothing; current shields still allow a strip.
 */
export function rrCandyShieldOffPercentDenominator(o: {
  maxShieldStrength?: number;
  shieldStrength?: number;
}): number {
  const mx = Math.max(0, Math.floor(Number(o.maxShieldStrength) || 0));
  const cur = Math.max(0, Math.floor(Number(o.shieldStrength) || 0));
  return Math.max(mx, cur, 1);
}

/** Effective max for RR Candy Shield ON when vault/ally rows disagree or shields exceed stored max. */
export function rrCandyShieldOnEffectiveMax(maxShieldRaw: number, currentShieldRaw: number): number {
  const cur = Math.max(0, Math.floor(Number(currentShieldRaw) || 0));
  const maxStat = Math.max(0, Math.floor(Number(maxShieldRaw) || 0));
  return Math.max(maxStat, cur, 1);
}

/**
 * RR Candy Shield ON: restore up to 50% of effective max, without exceeding headroom.
 */
export function computeRrCandyShieldOnRestore(maxShieldRaw: number, currentShieldRaw: number): number {
  const effectiveMax = rrCandyShieldOnEffectiveMax(maxShieldRaw, currentShieldRaw);
  const cur = Math.max(0, Math.floor(Number(currentShieldRaw) || 0));
  const headroom = Math.max(0, effectiveMax - cur);
  const want = Math.floor(effectiveMax * 0.5);
  return Math.min(want, headroom);
}

/** Build battle Move rows from Konfig tree nodes the player has learned (config-driven). */
export function buildKonfigMovesFromLearnedNodes(
  nodes: RRCandyNodeDefinition[],
  learnedNodeIds: Set<string>
): Move[] {
  return nodes
    .filter((n) => n.isEnabled && learnedNodeIds.has(n.nodeId))
    .map((n) => ({
      id: rrCandyBattleMoveIdFromSkillId(n.skillId),
      name: n.icon ? `${n.icon} ${n.name}` : n.name,
      description: n.summary,
      category: 'system' as const,
      type: categoryToMoveType(n.category),
      level: 1,
      cost: 2,
      cooldown: 3,
      currentCooldown: 0,
      unlocked: true,
      masteryLevel: 1,
      targetType: 'single' as const,
      priority: 0,
      effectKey: n.effectKey,
      rrCandyNodeId: n.nodeId,
      rrCandySkillId: n.skillId,
    }));
}

/**
 * Generates RR Candy moves based on the candy type the player has unlocked
 */
export function getRRCandyMoves(candyType: 'on-off' | 'up-down' | 'config'): Move[] {
  const moves: Move[] = [];

  if (candyType === 'on-off') {
    // Shield OFF — % of opponent max shields scales with mastery (see shieldOffMaxShieldRemovePercent)
    moves.push({
      id: 'rr-candy-on-off-shields-off',
      name: 'Shield OFF',
      description: `Remove ${shieldOffMaxShieldRemovePercent(1)}% of opponent's maximum shields. Higher mastery increases this cap (up to ${SHIELD_OFF_MAX_PERCENT}%).`,
      category: 'system',
      type: 'control',
      level: 1,
      cost: 2,
      debuffType: 'shield_break',
      debuffStrength: shieldOffMaxShieldRemovePercent(1),
      cooldown: 3,
      currentCooldown: 0,
      unlocked: true,
      masteryLevel: 1,
      targetType: 'single',
      priority: 0
    });

    // Shield ON - Restore 50% of max shields
    moves.push({
      id: 'rr-candy-on-off-shields-on',
      name: 'Shield ON',
      description: 'Restore 50% of your maximum shields.',
      category: 'system',
      type: 'defense',
      level: 1,
      cost: 3,
      shieldBoost: 50, // 50% of max shields restored
      cooldown: 4,
      currentCooldown: 0,
      unlocked: true,
      masteryLevel: 1,
      targetType: 'self',
      priority: 0
    });
  }

  // TODO: Add moves for 'up-down' and 'config' candy types

  return moves;
}

/** Known On/Off RR Candy move ids → display names (independent of chapter candyType; fixes "Vault Hack" in UI). */
const RR_CANDY_ON_OFF_DISPLAY: Record<string, string> = {
  'rr-candy-on-off-shields-off': 'Shield OFF',
  'rr-candy-on-off-shields-on': 'Shield ON',
};

const RR_CANDY_KONFIG_DISPLAY: Record<string, string> = {
  'rr-candy-konfig-evasive-calibration': 'Evasive Calibration',
  'rr-candy-konfig-system-redirect': 'System Redirect',
};

/**
 * Human-readable name for an RR Candy move for UI (loadout preview, lists).
 * Uses move id first so legacy stored names like "Vault Hack" never show when ids are canonical.
 */
export function getRRCandyDisplayName(move: Pick<Move, 'id' | 'name'>): string {
  const id = move.id || '';
  if (RR_CANDY_ON_OFF_DISPLAY[id]) return RR_CANDY_ON_OFF_DISPLAY[id];
  if (RR_CANDY_KONFIG_DISPLAY[id]) return RR_CANDY_KONFIG_DISPLAY[id];
  if (!id.startsWith('rr-candy-')) return move.name;

  for (const ct of ['on-off', 'up-down', 'config'] as const) {
    const found = getRRCandyMoves(ct).find((m) => m.id === id);
    if (found) return found.name;
  }

  const n = move.name;
  if (n === 'Vault Hack' || n === 'Shield Restoration') {
    if (id.includes('shields-off')) return 'Shield OFF';
    if (id.includes('shields-on')) return 'Shield ON';
  }
  return n;
}

/**
 * Checks if a player has unlocked an RR Candy
 */
export async function hasRRCandyUnlocked(userId: string, candyType: 'on-off' | 'up-down' | 'config'): Promise<boolean> {
  const { db } = await import('../firebase');
  const { doc, getDoc } = await import('firebase/firestore');
  
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) return false;
    
    const userData = userDoc.data();
    const chapters = userData.chapters || {};
    const chapter2 = chapters[2] || {};
    const challenges = chapter2.challenges || {};
    const challenge = challenges['ep2-its-all-a-game'] || {};
    
    // Check if challenge is completed and candy choice matches
    if (challenge.isCompleted && challenge.candyChoice === candyType) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking RR Candy unlock:', error);
    return false;
  }
}









