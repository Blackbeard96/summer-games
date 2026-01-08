/**
 * Elimination detection and handling for In-Session Mode
 */

import { db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { trackElimination } from './inSessionStatsService';
import { debug, debugError } from './inSessionDebug';
import { SessionPlayer } from './inSessionService';

/**
 * Check if a player should be eliminated (health + shield = 0)
 */
export function shouldBeEliminated(health: number, shield: number): boolean {
  return health <= 0 && shield <= 0;
}

/**
 * Check and handle elimination for a player
 */
export async function checkAndHandleElimination(
  sessionId: string,
  playerId: string,
  health: number,
  shield: number,
  attackerId?: string
): Promise<boolean> {
  if (!shouldBeEliminated(health, shield)) {
    return false;
  }

  try {
    const sessionRef = doc(db, 'inSessionRooms', sessionId);
    const sessionDoc = await getDoc(sessionRef);
    
    if (!sessionDoc.exists()) {
      return false;
    }
    
    const sessionData = sessionDoc.data();
    const players: SessionPlayer[] = sessionData.players || [];
    const player = players.find(p => p.userId === playerId);
    
    // Already eliminated?
    if (player?.eliminated) {
      return false;
    }
    
    // Mark as eliminated
    const updatedPlayers = players.map(p => {
      if (p.userId === playerId) {
        return {
          ...p,
          eliminated: true
        };
      }
      return p;
    });
    
    const updatedLog = [
      ...(sessionData.battleLog || []),
      `☠️ ${player?.displayName || 'Player'} has been ELIMINATED!`
    ];
    
    await updateDoc(sessionRef, {
      players: updatedPlayers,
      battleLog: updatedLog,
      updatedAt: serverTimestamp()
    });
    
    // Track elimination in stats
    if (attackerId && attackerId !== playerId) {
      await trackElimination(sessionId, attackerId, playerId);
    }
    
    debug('inSessionEliminations', `Player ${playerId} eliminated in session ${sessionId}`, {
      attackerId,
      health,
      shield
    });
    
    return true;
  } catch (error) {
    debugError('inSessionEliminations', `Error handling elimination for ${playerId}`, error);
    return false;
  }
}

/**
 * Update player health/shield and check for elimination
 */
export async function updatePlayerHealthShield(
  sessionId: string,
  playerId: string,
  health: number,
  shield: number,
  attackerId?: string
): Promise<boolean> {
  try {
    const sessionRef = doc(db, 'inSessionRooms', sessionId);
    
    await runTransaction(db, async (transaction) => {
      const sessionDoc = await transaction.get(sessionRef);
      
      if (!sessionDoc.exists()) {
        return;
      }
      
      const sessionData = sessionDoc.data();
      const players: SessionPlayer[] = sessionData.players || [];
      
      // Update player health/shield
      const updatedPlayers = players.map(p => {
        if (p.userId === playerId) {
          return {
            ...p,
            hp: health,
            shield: shield
          };
        }
        return p;
      });
      
      transaction.update(sessionRef, {
        players: updatedPlayers,
        updatedAt: serverTimestamp()
      });
    });
    
    // Check for elimination after update
    await checkAndHandleElimination(sessionId, playerId, health, shield, attackerId);
    
    return true;
  } catch (error) {
    debugError('inSessionEliminations', `Error updating health/shield for ${playerId}`, error);
    return false;
  }
}


