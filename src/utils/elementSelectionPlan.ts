/**
 * Pure helpers for Element selection validation / idempotent move unlock planning.
 * Firestore I/O is covered by selectPlayerElement; these keep Chapter 1 logic testable.
 */

import { normalizeElementType } from '../types/elementTypes';
import { isValidSelectableElement } from './elementDisplay';
import type { Move } from '../types/battle';

export function planElementalMoveUnlocks(
  moves: Move[],
  elementRaw: string
): { valid: boolean; element: string | null; unlockIds: string[]; alreadyUnlockedIds: string[] } {
  const element = normalizeElementType(elementRaw);
  if (!element || !isValidSelectableElement(element)) {
    return { valid: false, element: null, unlockIds: [], alreadyUnlockedIds: [] };
  }

  const unlockIds: string[] = [];
  const alreadyUnlockedIds: string[] = [];

  for (const move of moves) {
    if (
      move.category === 'elemental' &&
      (move.elementalAffinity || '').toString().toLowerCase() === element &&
      move.level === 1
    ) {
      if (move.unlocked) {
        alreadyUnlockedIds.push(move.id);
      } else {
        unlockIds.push(move.id);
      }
    }
  }

  return { valid: true, element, unlockIds, alreadyUnlockedIds };
}

/** Retrying selection must not re-list already unlocked moves. */
export function wouldCreateDuplicateElementalUnlocks(
  moves: Move[],
  elementRaw: string
): boolean {
  const plan = planElementalMoveUnlocks(moves, elementRaw);
  if (!plan.valid) return false;
  // After first unlock, unlockIds should be empty
  const after = moves.map((m) =>
    plan.unlockIds.includes(m.id) ? { ...m, unlocked: true } : m
  );
  const second = planElementalMoveUnlocks(after, elementRaw);
  return second.unlockIds.length > 0;
}
