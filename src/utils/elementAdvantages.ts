import type { ActionCard, Move } from '../types/battle';
import type { ElementType } from '../types/elementTypes';
import { normalizeElementType } from '../types/elementTypes';

/** For each element, which defender types it is strong against (1.5× damage). */
export const ELEMENT_ADVANTAGES: Record<ElementType, ElementType[]> = {
  water: ['fire'],
  fire: ['earth'],
  earth: ['water'],
  air: ['lightning'],
  lightning: ['metal'],
  metal: ['air'],
  light: ['dark'],
  dark: ['light'],
};

export type ElementEffectiveness = 'advantage' | 'disadvantage' | 'neutral';

export function getElementMultiplier(
  attackType?: ElementType | null,
  targetType?: ElementType | null
): number {
  if (!attackType || !targetType) return 1;

  if (ELEMENT_ADVANTAGES[attackType]?.includes(targetType)) return 1.5;

  if (ELEMENT_ADVANTAGES[targetType]?.includes(attackType)) return 0.5;

  return 1;
}

export function getElementEffectiveness(
  attackType?: ElementType | null,
  targetType?: ElementType | null
): ElementEffectiveness {
  const m = getElementMultiplier(attackType, targetType);
  if (m > 1.001) return 'advantage';
  if (m < 0.999) return 'disadvantage';
  return 'neutral';
}

/** Battle log line for type matchup (only when multiplier is not 1). */
export function elementEffectivenessBattleLogLine(multiplier: number): string | null {
  if (multiplier >= 1.499) return '✨ Type advantage — deals extra damage! (Advantage)';
  if (multiplier <= 0.501) return '📉 Type disadvantage — deals reduced damage. (Disadvantage)';
  return null;
}

/**
 * Element used for offensive type chart: elemental-category attacks, plus construct
 * skills (`construct-skill::…`) when `elementalAffinity` is set on the move.
 * Other manifest / system damage does not use the chart.
 */
export function attackElementFromMove(
  move: Pick<Move, 'type' | 'category' | 'elementalAffinity' | 'id'>
): ElementType | null {
  if (move.type !== 'attack') return null;
  const et = normalizeElementType(move.elementalAffinity);
  if (!et) return null;
  if (move.category === 'elemental') return et;
  if (move.id?.startsWith('construct-skill::')) return et;
  return null;
}

/** CPU / admin-config moves: attack element from move row, else optional fallback (e.g. enemy's defensive type). */
export function attackElementFromCpuStrike(
  cpuMove: { type?: string; elementalAffinity?: string | null | undefined },
  fallbackAttackerElement?: ElementType | null
): ElementType | null {
  const t = cpuMove?.type || 'attack';
  if (t !== 'attack') return null;
  const fromMove = normalizeElementType(cpuMove?.elementalAffinity);
  if (fromMove) return fromMove;
  return fallbackAttackerElement ?? null;
}

export function attackElementFromSummonAffinity(raw: string | null | undefined): ElementType | null {
  return normalizeElementType(raw);
}

/**
 * Offensive element from action cards that deal shield/health damage (Freeze, Shield Breaker).
 */
export function attackElementFromActionCard(
  card: Pick<ActionCard, 'type' | 'elementalAffinity' | 'effect'>
): ElementType | null {
  if (card.type !== 'attack') return null;
  if (!card.elementalAffinity) return null;
  const et = normalizeElementType(String(card.elementalAffinity));
  if (!et) return null;
  const fx = card.effect?.type;
  if (fx !== 'freeze' && fx !== 'shield_breach') return null;
  return et;
}
