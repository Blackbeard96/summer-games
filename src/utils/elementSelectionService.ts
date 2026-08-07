/**
 * Idempotent Element selection for Chapter 1 / Artifacts onboarding.
 * Saves affinity, equips Elemental Ring metadata, unlocks Level 1 elemental moves once.
 */

import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';
import { normalizeElementType, type ElementType } from '../types/elementTypes';
import { isValidSelectableElement, SELECTABLE_ONBOARDING_ELEMENTS } from './elementDisplay';
import type { Move } from '../types/battle';
import { planElementalMoveUnlocks } from './elementSelectionPlan';

export interface ElementSelectionResult {
  success: boolean;
  alreadySelected: boolean;
  element: ElementType | null;
  movesUnlocked: string[];
  error?: string;
}

/**
 * Persist the player's Element and unlock Level 1 elemental moves for that affinity.
 * Safe to retry: will not duplicate moves or overwrite a different already-chosen Element.
 */
export async function selectPlayerElement(
  userId: string,
  elementRaw: string,
  options?: {
    /** When true, allow changing Element even if one was already set (admin / repair). Default false. */
    allowOverwrite?: boolean;
  }
): Promise<ElementSelectionResult> {
  const element = normalizeElementType(elementRaw);
  if (!element || !isValidSelectableElement(element)) {
    return {
      success: false,
      alreadySelected: false,
      element: null,
      movesUnlocked: [],
      error: `Invalid Element. Allowed: ${SELECTABLE_ONBOARDING_ELEMENTS.join(', ')}`,
    };
  }

  try {
    const studentRef = doc(db, 'students', userId);
    const userRef = doc(db, 'users', userId);
    const movesRef = doc(db, 'battleMoves', userId);
    const unlockedNames: string[] = [];

    await runTransaction(db, async (tx) => {
      const [studentSnap, userSnap, movesSnap] = await Promise.all([
        tx.get(studentRef),
        tx.get(userRef),
        tx.get(movesRef),
      ]);

      const studentData = studentSnap.exists() ? studentSnap.data() : {};
      const userData = userSnap.exists() ? userSnap.data() : {};

      const existing =
        (studentData.elementalAffinity as string | undefined) ||
        (studentData.artifacts?.chosen_element as string | undefined) ||
        (userData.elementalAffinity as string | undefined);

      const existingNorm = normalizeElementType(existing);
      if (existingNorm && existingNorm !== element && !options?.allowOverwrite) {
        // Already has a different Element — repair ring + L1 unlocks for the *existing*
        // Element so reused demo profiles still get elemental skills in battle.
        const repairElement = existingNorm;
        const elementalRing = {
          id: 'elemental-ring-level-1',
          name: `Elemental Ring: ${repairElement.charAt(0).toUpperCase() + repairElement.slice(1)} (Level 1)`,
          slot: 'ring1',
          level: 1,
          image: '/images/Elemental Ring.png',
          stats: {},
        };
        const currentEquipped = (studentData.equippedArtifacts as Record<string, unknown>) || {};
        const updatedArtifacts = {
          ...(studentData.artifacts || {}),
          elemental_ring_level_1: true,
          elemental_ring_modal_seen: true,
          chosen_element: repairElement,
        };
        const studentUpdate = {
          artifacts: updatedArtifacts,
          equippedArtifacts: { ...currentEquipped, ring1: elementalRing },
          elementalAffinity: repairElement,
          lastUpdated: serverTimestamp(),
        };
        if (studentSnap.exists()) {
          tx.update(studentRef, studentUpdate);
        } else {
          tx.set(studentRef, { ...studentUpdate, createdAt: serverTimestamp() }, { merge: true });
        }
        if (userSnap.exists()) {
          tx.update(userRef, {
            elementalAffinity: repairElement,
            lastUpdated: serverTimestamp(),
          });
        }
        if (movesSnap.exists()) {
          const currentMoves: Move[] = movesSnap.data().moves || [];
          const plan = planElementalMoveUnlocks(currentMoves, repairElement);
          const unlockSet = new Set(plan.unlockIds);
          const updatedMoves = currentMoves.map((move) => {
            if (unlockSet.has(move.id)) {
              unlockedNames.push(move.name);
              return { ...move, unlocked: true };
            }
            return move;
          });
          tx.update(movesRef, { moves: updatedMoves });
        }
        return;
      }
      if (existingNorm === element) {
        // Same Element already saved — still ensure L1 moves are unlocked (repair path)
      }

      const elementalRing = {
        id: 'elemental-ring-level-1',
        name: `Elemental Ring: ${element.charAt(0).toUpperCase() + element.slice(1)} (Level 1)`,
        slot: 'ring1',
        level: 1,
        image: '/images/Elemental Ring.png',
        stats: {},
      };

      const currentEquipped = (studentData.equippedArtifacts as Record<string, unknown>) || {};
      const updatedEquipped = {
        ...currentEquipped,
        ring1: elementalRing,
      };

      const updatedArtifacts = {
        ...(studentData.artifacts || {}),
        elemental_ring_level_1: true,
        elemental_ring_modal_seen: true,
        chosen_element: element,
      };

      const studentUpdate = {
        artifacts: updatedArtifacts,
        equippedArtifacts: updatedEquipped,
        elementalAffinity: element,
        lastUpdated: serverTimestamp(),
      };

      if (studentSnap.exists()) {
        tx.update(studentRef, studentUpdate);
      } else {
        tx.set(studentRef, { ...studentUpdate, createdAt: serverTimestamp() }, { merge: true });
      }

      if (userSnap.exists()) {
        tx.update(userRef, {
          elementalAffinity: element,
          lastUpdated: serverTimestamp(),
        });
      } else {
        tx.set(
          userRef,
          { elementalAffinity: element, lastUpdated: serverTimestamp() },
          { merge: true }
        );
      }

      if (movesSnap.exists()) {
        const currentMoves: Move[] = movesSnap.data().moves || [];
        const plan = planElementalMoveUnlocks(currentMoves, element);
        const unlockSet = new Set(plan.unlockIds);
        const updatedMoves = currentMoves.map((move) => {
          if (unlockSet.has(move.id)) {
            unlockedNames.push(move.name);
            return { ...move, unlocked: true };
          }
          return move;
        });
        tx.update(movesRef, { moves: updatedMoves });
      }
    });

    const studentAfter = await getDoc(studentRef);
    const saved = normalizeElementType(studentAfter.data()?.elementalAffinity);
    const alreadySelected =
      !!saved && (saved !== element || unlockedNames.length === 0);

    // Refresh Manifest + elemental unlock flags and merge elementals into the fight loadout.
    try {
      const { ensureManifestSkillsForBattle } = await import('./battleMovesManifestSync');
      await ensureManifestSkillsForBattle(userId);
    } catch (syncErr) {
      console.warn('[selectPlayerElement] ensureManifestSkillsForBattle failed', syncErr);
    }

    return {
      success: true,
      alreadySelected,
      element: saved || element,
      movesUnlocked: unlockedNames,
    };
  } catch (error: any) {
    console.error('selectPlayerElement failed:', error);
    return {
      success: false,
      alreadySelected: false,
      element: null,
      movesUnlocked: [],
      error: error?.message || 'Failed to select Element',
    };
  }
}
