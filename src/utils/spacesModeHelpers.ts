/**
 * Spaces Mode Helper Functions
 * 
 * Pure functions for Spaces Mode logic that are easy to test.
 */

import { SpaceId, SpaceState, PlayerSpaces, SpacesModeState } from '../types/battleSession';
import {
  SUB_SPACE_BASE_INTEGRITY,
  MAIN_SPACE_BASE_INTEGRITY,
  SUB_SPACE_INTEGRITY_PER_LEVEL,
  MAIN_SPACE_INTEGRITY_PER_LEVEL,
  BASE_SHIELD,
  BASE_MAX_SHIELD,
  SHIELD_PER_LEVEL,
  SUB_SPACE_DESTROYED_POINTS,
  MAIN_SPACE_DESTROYED_POINTS
} from './spacesModeConfig';

/**
 * Create spaces for a player based on their level/stats
 */
export function createSpacesForPlayer(
  uid: string,
  playerLevel: number
): PlayerSpaces {
  const subIntegrity = SUB_SPACE_BASE_INTEGRITY + (playerLevel * SUB_SPACE_INTEGRITY_PER_LEVEL);
  const mainIntegrity = MAIN_SPACE_BASE_INTEGRITY + (playerLevel * MAIN_SPACE_INTEGRITY_PER_LEVEL);
  const shield = BASE_SHIELD;
  const maxShield = BASE_MAX_SHIELD + (playerLevel * SHIELD_PER_LEVEL);

  const spaces: Record<SpaceId, SpaceState> = {
    subLeft: {
      id: 'subLeft',
      ownerUid: uid,
      maxIntegrity: subIntegrity,
      integrity: subIntegrity,
      maxShield: maxShield,
      shield: shield,
      destroyed: false,
      locked: false
    },
    main: {
      id: 'main',
      ownerUid: uid,
      maxIntegrity: mainIntegrity,
      integrity: mainIntegrity,
      maxShield: maxShield,
      shield: shield,
      destroyed: false,
      locked: true // Main is locked initially
    },
    subRight: {
      id: 'subRight',
      ownerUid: uid,
      maxIntegrity: subIntegrity,
      integrity: subIntegrity,
      maxShield: maxShield,
      shield: shield,
      destroyed: false,
      locked: false
    }
  };

  return {
    ownerUid: uid,
    spaces,
    destroyedCount: 0
  };
}

/**
 * Check if main space is unlocked (at least one sub destroyed)
 */
export function isMainUnlocked(playerSpaces: PlayerSpaces): boolean {
  return !playerSpaces.spaces.main.locked;
}

/**
 * Unlock main space (called when a sub space is destroyed)
 */
export function unlockMainSpace(playerSpaces: PlayerSpaces): PlayerSpaces {
  if (!playerSpaces.spaces.main.destroyed) {
    return {
      ...playerSpaces,
      spaces: {
        ...playerSpaces.spaces,
        main: {
          ...playerSpaces.spaces.main,
          locked: false
        }
      }
    };
  }
  return playerSpaces;
}

/**
 * Compute space score for a player
 * Sub destroyed = 1 point each, Main destroyed = 3 points
 */
export function computeSpaceScore(playerSpaces: PlayerSpaces): number {
  let score = 0;
  
  if (playerSpaces.spaces.subLeft.destroyed) {
    score += SUB_SPACE_DESTROYED_POINTS;
  }
  if (playerSpaces.spaces.subRight.destroyed) {
    score += SUB_SPACE_DESTROYED_POINTS;
  }
  if (playerSpaces.spaces.main.destroyed) {
    score += MAIN_SPACE_DESTROYED_POINTS;
  }
  
  return score;
}

/**
 * Calculate remaining total integrity percentage across all spaces
 */
export function calculateRemainingIntegrityPercent(playerSpaces: PlayerSpaces): number {
  let totalMax = 0;
  let totalCurrent = 0;
  
  Object.values(playerSpaces.spaces).forEach(space => {
    if (!space.destroyed) {
      totalMax += space.maxIntegrity;
      totalCurrent += space.integrity;
    }
  });
  
  if (totalMax === 0) return 0;
  return (totalCurrent / totalMax) * 100;
}

/**
 * Apply damage to a space (shield first, then integrity)
 * Returns updated space state and whether it was destroyed
 */
export function applyDamageToSpace(
  space: SpaceState,
  damage: number
): { space: SpaceState; destroyed: boolean; damageDealt: number } {
  if (space.destroyed) {
    return { space, destroyed: true, damageDealt: 0 };
  }

  let remainingDamage = damage;
  let newShield = space.shield;
  let newIntegrity = space.integrity;
  let damageDealt = 0;

  // Apply to shield first
  if (newShield > 0 && remainingDamage > 0) {
    const shieldDamage = Math.min(newShield, remainingDamage);
    newShield -= shieldDamage;
    remainingDamage -= shieldDamage;
    damageDealt += shieldDamage;
  }

  // Apply remaining damage to integrity
  if (remainingDamage > 0) {
    const integrityDamage = Math.min(newIntegrity, remainingDamage);
    newIntegrity -= integrityDamage;
    remainingDamage -= integrityDamage;
    damageDealt += integrityDamage;
  }

  const destroyed = newIntegrity <= 0;

  const updatedSpace: SpaceState = {
    ...space,
    shield: Math.max(0, newShield),
    integrity: Math.max(0, newIntegrity),
    destroyed,
    // If destroyed, set values to 0
    ...(destroyed && {
      shield: 0,
      integrity: 0
    })
  };

  return { space: updatedSpace, destroyed, damageDealt };
}

/**
 * Check if a target space is valid for targeting
 */
export function isValidTarget(
  targetSpaceId: SpaceId,
  targetOwnerUid: string,
  attackerUid: string,
  spacesModeState: SpacesModeState
): { valid: boolean; reason?: string } {
  // Can't target your own spaces
  if (targetOwnerUid === attackerUid) {
    return { valid: false, reason: 'Cannot target your own spaces' };
  }

  const targetPlayerSpaces = spacesModeState.players[targetOwnerUid];
  if (!targetPlayerSpaces) {
    return { valid: false, reason: 'Target player not found' };
  }

  const targetSpace = targetPlayerSpaces.spaces[targetSpaceId];
  if (!targetSpace) {
    return { valid: false, reason: 'Target space not found' };
  }

  // Can't target destroyed spaces
  if (targetSpace.destroyed) {
    return { valid: false, reason: 'Space is already destroyed' };
  }

  // Main space can only be targeted if unlocked
  if (targetSpaceId === 'main' && targetSpace.locked) {
    return { valid: false, reason: 'Main Space is locked! Destroy a Sub Space first.' };
  }

  return { valid: true };
}

/**
 * Determine winner when time expires
 */
export function determineWinnerOnTimeExpiry(
  spacesModeState: SpacesModeState
): { winnerUid?: string; winReason: 'SPACE_ADVANTAGE' | 'TIEBREAK' | 'DRAW' } {
  const playerUids = Object.keys(spacesModeState.players);
  if (playerUids.length !== 2) {
    return { winReason: 'DRAW' };
  }

  const [uid1, uid2] = playerUids;
  const player1 = spacesModeState.players[uid1];
  const player2 = spacesModeState.players[uid2];

  const score1 = computeSpaceScore(player1);
  const score2 = computeSpaceScore(player2);

  // Higher score wins
  if (score1 > score2) {
    return { winnerUid: uid1, winReason: 'SPACE_ADVANTAGE' };
  }
  if (score2 > score1) {
    return { winnerUid: uid2, winReason: 'SPACE_ADVANTAGE' };
  }

  // Tiebreaker: higher remaining integrity%
  const integrity1 = calculateRemainingIntegrityPercent(player1);
  const integrity2 = calculateRemainingIntegrityPercent(player2);

  if (integrity1 > integrity2) {
    return { winnerUid: uid1, winReason: 'TIEBREAK' };
  }
  if (integrity2 > integrity1) {
    return { winnerUid: uid2, winReason: 'TIEBREAK' };
  }

  // Still tied: draw
  return { winReason: 'DRAW' };
}

