/**
 * Spaces Mode Battle Integration
 * 
 * Functions to initialize and manage Spaces Mode battles
 */

import { Timestamp } from 'firebase/firestore';
import { SpacesModeState, PlayerSpaces } from '../types/battleSession';
import { createSpacesForPlayer, unlockMainSpace, applyDamageToSpace, isValidTarget, determineWinnerOnTimeExpiry } from './spacesModeHelpers';
import { SPACES_MODE_DURATION_SEC } from './spacesModeConfig';

/**
 * Initialize Spaces Mode state for a new battle
 */
export function initializeSpacesModeBattle(
  player1Uid: string,
  player1Level: number,
  player2Uid: string,
  player2Level: number
): SpacesModeState {
  const startedAt = Date.now();
  const endsAt = startedAt + (SPACES_MODE_DURATION_SEC * 1000);

  const player1Spaces = createSpacesForPlayer(player1Uid, player1Level);
  const player2Spaces = createSpacesForPlayer(player2Uid, player2Level);

  return {
    mode: 'PVP_SPACES_1V1',
    startedAt,
    endsAt,
    durationSec: SPACES_MODE_DURATION_SEC,
    players: {
      [player1Uid]: player1Spaces,
      [player2Uid]: player2Spaces
    }
  };
}

/**
 * Apply damage to a space and handle destruction logic
 */
export function applyDamageToSpaceInBattle(
  spacesModeState: SpacesModeState,
  targetSpaceId: 'subLeft' | 'main' | 'subRight',
  targetOwnerUid: string,
  damage: number
): {
  updatedState: SpacesModeState;
  wasDestroyed: boolean;
  wasMainDestroyed: boolean;
  mainUnlocked: boolean;
} {
  const targetPlayerSpaces = spacesModeState.players[targetOwnerUid];
  if (!targetPlayerSpaces) {
    throw new Error(`Player ${targetOwnerUid} not found in battle`);
  }

  const targetSpace = targetPlayerSpaces.spaces[targetSpaceId];
  if (!targetSpace || targetSpace.destroyed) {
    return {
      updatedState: spacesModeState,
      wasDestroyed: false,
      wasMainDestroyed: false,
      mainUnlocked: false
    };
  }

  const { space: updatedSpace, destroyed } = applyDamageToSpace(targetSpace, damage);

  let updatedPlayerSpaces: PlayerSpaces = {
    ...targetPlayerSpaces,
    spaces: {
      ...targetPlayerSpaces.spaces,
      [targetSpaceId]: updatedSpace
    }
  };

  let mainUnlocked = false;
  let wasMainDestroyed = false;

  // If a sub space was destroyed, unlock main
  if (destroyed && (targetSpaceId === 'subLeft' || targetSpaceId === 'subRight')) {
    if (updatedPlayerSpaces.spaces.main.locked) {
      updatedPlayerSpaces = unlockMainSpace(updatedPlayerSpaces);
      mainUnlocked = true;
    }
    // Update destroyed count
    updatedPlayerSpaces.destroyedCount += 1;
  }

  // If main was destroyed
  if (destroyed && targetSpaceId === 'main') {
    wasMainDestroyed = true;
    updatedPlayerSpaces.destroyedCount += 3; // Main is worth 3 points
  }

  const updatedState: SpacesModeState = {
    ...spacesModeState,
    players: {
      ...spacesModeState.players,
      [targetOwnerUid]: updatedPlayerSpaces
    }
  };

  return {
    updatedState,
    wasDestroyed: destroyed,
    wasMainDestroyed,
    mainUnlocked
  };
}

/**
 * Check if battle should end (main destroyed or time expired)
 */
export function checkBattleEndCondition(
  spacesModeState: SpacesModeState
): {
  shouldEnd: boolean;
  winnerUid?: string;
  winReason?: 'MAIN_DESTROYED' | 'SPACE_ADVANTAGE' | 'TIEBREAK' | 'FORFEIT';
} {
  // Check if any main space is destroyed
  for (const [uid, playerSpaces] of Object.entries(spacesModeState.players)) {
    if (playerSpaces.spaces.main.destroyed) {
      // Opponent wins
      const opponentUid = Object.keys(spacesModeState.players).find(u => u !== uid);
      return {
        shouldEnd: true,
        winnerUid: opponentUid,
        winReason: 'MAIN_DESTROYED'
      };
    }
  }

  // Check if time expired
  const now = Date.now();
  if (now >= spacesModeState.endsAt) {
    const result = determineWinnerOnTimeExpiry(spacesModeState);
    if (result.winReason === 'DRAW') {
      return {
        shouldEnd: true,
        winReason: 'TIEBREAK' // Treat draw as tiebreak for now
      };
    }
    return {
      shouldEnd: true,
      winnerUid: result.winnerUid,
      winReason: result.winReason
    };
  }

  return { shouldEnd: false };
}

/**
 * Validate target for Spaces Mode
 */
export function validateSpacesModeTarget(
  spacesModeState: SpacesModeState,
  attackerUid: string,
  targetSpaceId: 'subLeft' | 'main' | 'subRight',
  targetOwnerUid: string
): { valid: boolean; reason?: string } {
  return isValidTarget(targetSpaceId, targetOwnerUid, attackerUid, spacesModeState);
}

