/**
 * Authoritative move application service for In-Session mode
 * Uses Firestore transactions to ensure single source of truth
 */

import { db } from '../firebase';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { debug, debugError, debugAction, debugSessionWrite } from './inSessionDebug';
import { trackElimination } from './inSessionStatsService';
import type { Move } from '../types/battle';

const DEBUG_IN_SESSION_MOVES = process.env.REACT_APP_DEBUG_IN_SESSION_MOVES === 'true' || 
                                 process.env.REACT_APP_DEBUG === 'true';

export interface InSessionMoveResult {
  success: boolean;
  message: string;
  damage?: number;
  shieldDamage?: number;
  healing?: number;
  shieldBoost?: number;
  ppStolen?: number;
  ppCost?: number;
  battleLogEntry?: string;
}

export interface ApplyMoveParams {
  sessionId: string;
  actorUid: string;
  actorName: string;
  targetUid: string;
  targetName: string;
  move: Move;
  damage: number;
  shieldDamage: number;
  healing: number;
  shieldBoost: number;
  ppStolen: number;
  ppCost: number;
  battleLogMessage: string;
}

/**
 * Apply a move in In-Session mode using a Firestore transaction
 * This is the AUTHORITATIVE source - all clients should use this
 */
export async function applyInSessionMove(params: ApplyMoveParams): Promise<InSessionMoveResult> {
  const {
    sessionId,
    actorUid,
    actorName,
    targetUid,
    targetName,
    move,
    damage,
    shieldDamage,
    healing,
    shieldBoost,
    ppStolen,
    ppCost,
    battleLogMessage
  } = params;

  if (DEBUG_IN_SESSION_MOVES) {
    debugAction('inSessionMove', `🎯 Applying move: ${move.name} by ${actorName} on ${targetName}`, {
      sessionId,
      actorUid,
      targetUid,
      damage,
      shieldDamage,
      healing,
      shieldBoost,
      ppStolen,
      ppCost
    });
  }

  try {
    const sessionRef = doc(db, 'inSessionRooms', sessionId);
    
    const result = await runTransaction(db, async (transaction) => {
      // Read session document
      const sessionDoc = await transaction.get(sessionRef);
      
      if (!sessionDoc.exists()) {
        throw new Error(`Session ${sessionId} not found`);
      }

      const sessionData = sessionDoc.data();
      const players: any[] = sessionData.players || [];
      const battleLog: string[] = sessionData.battleLog || [];

      // Find actor and target in players array
      const actorIndex = players.findIndex(p => p.userId === actorUid);
      const targetIndex = players.findIndex(p => p.userId === targetUid);

      if (actorIndex === -1) {
        throw new Error(`Actor ${actorName} (${actorUid}) not found in session`);
      }

      if (targetIndex === -1) {
        throw new Error(`Target ${targetName} (${targetUid}) not found in session`);
      }

      const actor = players[actorIndex];
      const target = players[targetIndex];

      // CRITICAL: Prevent eliminated players from acting
      if (actor.eliminated) {
        throw new Error(`Actor ${actorName} is eliminated and cannot perform actions`);
      }

      // Note: Eliminated targets can still be targeted (for cleanup/final blows)
      // But we'll check elimination status after damage is applied

      // Ensure we have mutable copies (don't mutate original array elements)
      const actorCopy = { ...actor };
      const targetCopy = { ...target };

      // Validate actor has enough participation points (if required)
      // For now, we assume moves are consumed via handleMoveConsumption before this is called
      // But we can add validation here if needed

      // Initialize target vault data if missing (based on level if available)
      if (targetCopy.maxHp === undefined) {
        targetCopy.maxHp = Math.max(100, (targetCopy.level || 1) * 10);
      }
      if (targetCopy.hp === undefined) {
        targetCopy.hp = targetCopy.maxHp; // Start at full HP
      }
      if (targetCopy.maxShield === undefined) {
        targetCopy.maxShield = 100;
      }
      if (targetCopy.shield === undefined) {
        targetCopy.shield = targetCopy.maxShield; // Start at full shield
      }
      if (targetCopy.powerPoints === undefined) targetCopy.powerPoints = 0;

      // Initialize actor vault data if missing
      if (actorCopy.maxHp === undefined) {
        actorCopy.maxHp = Math.max(100, (actorCopy.level || 1) * 10);
      }
      if (actorCopy.hp === undefined) {
        actorCopy.hp = actorCopy.maxHp; // Start at full HP
      }
      if (actorCopy.maxShield === undefined) {
        actorCopy.maxShield = 100;
      }
      if (actorCopy.shield === undefined) {
        actorCopy.shield = actorCopy.maxShield; // Start at full shield
      }
      if (actorCopy.powerPoints === undefined) actorCopy.powerPoints = 0;

      // Apply damage to target
      // Handle normal damage: shield absorbs first, then health
      // Handle special shield damage (like Shield OFF): direct shield damage
      const currentShield = targetCopy.shield || 0;
      
      if (shieldDamage > 0) {
        // Apply shield damage (for special moves or pre-calculated shield absorption)
        targetCopy.shield = Math.max(0, currentShield - shieldDamage);
        
        // Then apply remaining damage to health (if any)
        const remainingDamage = Math.max(0, damage - shieldDamage);
        if (remainingDamage > 0) {
          targetCopy.hp = Math.max(0, (targetCopy.hp || 0) - remainingDamage);
        }
      } else if (damage > 0) {
        // Normal damage flow: shield absorbs first, then health
        const shieldAbsorbed = Math.min(currentShield, damage);
        const remainingDamage = Math.max(0, damage - shieldAbsorbed);
        
        // Apply shield damage first
        if (shieldAbsorbed > 0) {
          targetCopy.shield = Math.max(0, currentShield - shieldAbsorbed);
        }
        
        // Apply remaining damage to health
        if (remainingDamage > 0) {
          targetCopy.hp = Math.max(0, (targetCopy.hp || 0) - remainingDamage);
        }
      }

      // Apply healing to target
      if (healing > 0) {
        targetCopy.hp = Math.min(targetCopy.maxHp || 100, (targetCopy.hp || 0) + healing);
      }

      // Apply shield boost to target (or actor if self-targeting)
      if (shieldBoost > 0) {
        if (targetUid === actorUid) {
          actorCopy.shield = Math.min(actorCopy.maxShield || 100, (actorCopy.shield || 0) + shieldBoost);
        } else {
          targetCopy.shield = Math.min(targetCopy.maxShield || 100, (targetCopy.shield || 0) + shieldBoost);
        }
      }

      // Apply PP steal
      if (ppStolen > 0) {
        // Steal PP from target to actor
        const actualSteal = Math.min(ppStolen, targetCopy.powerPoints || 0);
        targetCopy.powerPoints = Math.max(0, (targetCopy.powerPoints || 0) - actualSteal);
        actorCopy.powerPoints = (actorCopy.powerPoints || 0) + actualSteal;
      }

      // Deduct PP cost from actor
      if (ppCost > 0) {
        actorCopy.powerPoints = Math.max(0, (actorCopy.powerPoints || 0) - ppCost);
      }

      // Check for elimination (health + shield = 0)
      const targetTotalHealth = (targetCopy.hp || 0) + (targetCopy.shield || 0);
      if (targetTotalHealth <= 0 && !targetCopy.eliminated) {
        targetCopy.eliminated = true;
        if (DEBUG_IN_SESSION_MOVES) {
          debug('inSessionMove', `☠️ Target ${targetName} eliminated!`);
        }
      }

      // Update players array
      const updatedPlayers = [...players];
      updatedPlayers[actorIndex] = actorCopy;
      updatedPlayers[targetIndex] = targetCopy;

      // Add battle log entry (validate it's not undefined)
      if (!battleLogMessage || typeof battleLogMessage !== 'string') {
        debugError('inSessionMove', `Invalid battleLogMessage: ${battleLogMessage}`, { battleLogMessage });
        throw new Error('Battle log message is required and must be a string');
      }
      const updatedBattleLog = [...battleLog, battleLogMessage];

      // Add elimination log entry if target was eliminated
      let finalBattleLog = updatedBattleLog;
      const wasEliminated = targetCopy.eliminated && targetTotalHealth <= 0;
      if (wasEliminated) {
        const eliminationMessage = `☠️ ${targetName} has been ELIMINATED!`;
        finalBattleLog = [...updatedBattleLog, eliminationMessage];
      }

      // Update session document
      transaction.update(sessionRef, {
        players: updatedPlayers,
        battleLog: finalBattleLog,
        updatedAt: serverTimestamp()
      });

      if (DEBUG_IN_SESSION_MOVES) {
        debugSessionWrite('inSessionMove', `💾 Writing move result to Firestore`, {
          targetHp: targetCopy.hp,
          targetShield: targetCopy.shield,
          targetEliminated: targetCopy.eliminated,
          battleLogLength: finalBattleLog.length
        });
      }

      // Track elimination in stats (outside transaction to avoid timeout)
      if (wasEliminated && actorUid !== targetUid) {
        // Schedule async tracking (don't await in transaction)
        Promise.resolve().then(async () => {
          try {
            await trackElimination(sessionId, actorUid, targetUid);
            if (DEBUG_IN_SESSION_MOVES) {
              debug('inSessionMove', `📊 Elimination tracked: ${actorName} eliminated ${targetName}`);
            }
          } catch (trackError) {
            debugError('inSessionMove', 'Error tracking elimination', trackError);
          }
        });
      }

      if (DEBUG_IN_SESSION_MOVES) {
        debug('inSessionMove', `✅ Move applied successfully`, {
          targetHpBefore: players[targetIndex].hp,
          targetHpAfter: targetCopy.hp,
          targetShieldBefore: players[targetIndex].shield,
          targetShieldAfter: targetCopy.shield,
          targetPPBefore: players[targetIndex].powerPoints,
          targetPPAfter: targetCopy.powerPoints,
          actorPPBefore: actor.powerPoints + ppCost - (ppStolen > 0 ? ppStolen : 0),
          actorPPAfter: actorCopy.powerPoints,
          wasEliminated
        });
      }

      return {
        success: true,
        message: 'Move applied successfully',
        damage,
        shieldDamage,
        healing,
        shieldBoost,
        ppStolen,
        ppCost,
        battleLogEntry: battleLogMessage
      };
    });

    return result;
  } catch (error: any) {
    debugError('inSessionMove', `Error applying move: ${move.name}`, error);
    return {
      success: false,
      message: error.message || 'Failed to apply move',
    };
  }
}

