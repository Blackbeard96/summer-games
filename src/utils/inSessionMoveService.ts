/**
 * Authoritative move application service for In-Session mode
 * Uses Firestore transactions to ensure single source of truth
 * 
 * NOW SUPPORTS UNIFIED RESOLVER: Can accept ResolvedSkillAction for consistent calculations
 */

import { db } from '../firebase';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { computeLiveEventParticipationSkillCostServer } from './liveEventSkillCost';
import { debug, debugError, debugAction, debugSessionWrite } from './inSessionDebug';
import { trackElimination } from './inSessionStatsService';
import { battleDebug, battleError, detectBattleMode } from './battleDebug';
import type { Move } from '../types/battle';
import type { ResolvedSkillAction } from './battleSkillResolver';

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
  /** Live Events: Participation Points (movesEarned) spent for this skill */
  participationPointsSpent?: number;
  participationCostDiscount?: number;
  battleLogEntry?: string;
  stateChanges?: {
    targetHpBefore?: number;
    targetHpAfter?: number;
    targetShieldBefore?: number;
    targetShieldAfter?: number;
    actorPpBefore?: number;
    actorPpAfter?: number;
  };
}

export interface ApplyMoveParams {
  sessionId: string;
  actorUid: string;
  actorName: string;
  targetUid: string;
  targetName: string;
  move: Move;
  // Legacy: Individual values (for backward compatibility)
  damage: number;
  shieldDamage: number;
  healing: number;
  shieldBoost: number;
  ppStolen: number;
  ppCost: number;
  battleLogMessage: string;
  // New: Unified resolved action (preferred, will override individual values if provided)
  resolvedAction?: ResolvedSkillAction;
  traceId?: string; // Optional traceId for debugging
  classId?: string; // Optional classId for debug mirror
  eventId?: string; // Optional eventId for debug mirror
  /** When true, skill cost is taken from session movesEarned (authoritative); vault powerPoints is not reduced for that cost */
  useLiveEventParticipationForSkillCost?: boolean;
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
    damage: legacyDamage,
    shieldDamage: legacyShieldDamage,
    healing: legacyHealing,
    shieldBoost: legacyShieldBoost,
    ppStolen: legacyPpStolen,
    ppCost: legacyPpCost,
    battleLogMessage: legacyBattleLogMessage,
    resolvedAction,
    traceId,
    classId,
    eventId,
    useLiveEventParticipationForSkillCost = false
  } = params;

  const DEBUG_LIVE_EVENTS = process.env.REACT_APP_DEBUG_LIVE_EVENTS === 'true' || 
                             process.env.REACT_APP_DEBUG === 'true';

  // Use resolvedAction if provided (unified resolver), otherwise use legacy individual values
  const damage = resolvedAction ? resolvedAction.damage : legacyDamage;
  const shieldDamage = resolvedAction ? resolvedAction.shieldDamage : legacyShieldDamage;
  const healing = resolvedAction ? resolvedAction.healing : legacyHealing;
  const shieldBoost = resolvedAction ? resolvedAction.shieldBoost : legacyShieldBoost;
  const ppStolen = resolvedAction ? resolvedAction.ppStolen : legacyPpStolen;
  const ppCost = resolvedAction ? resolvedAction.ppCost : legacyPpCost;
  const battleLogMessage = resolvedAction && resolvedAction.logMessages.length > 0 
    ? resolvedAction.logMessages[0] 
    : legacyBattleLogMessage;

  if (DEBUG_IN_SESSION_MOVES || DEBUG_LIVE_EVENTS) {
    console.log('[applyInSessionMove] 🎯 SUBMIT ACTION CALLED:', {
      sessionId,
      actorUid,
      actorName,
      targetUid,
      targetName,
      moveId: move.id,
      moveName: move.name,
      moveType: move.type,
      usingUnifiedResolver: !!resolvedAction,
      damage,
      shieldDamage,
      healing,
      shieldBoost,
      ppStolen,
      ppCost,
      battleLogMessage
    });
  }

  try {
    const sessionRef = doc(db, 'inSessionRooms', sessionId);
    const writePath = `inSessionRooms/${sessionId}`;
    
    // Stage D: Firestore write attempt
    if (traceId) {
      const { traceStage, writeDebugAction } = await import('./liveEventDebug');
      traceStage('written', traceId, 'Firestore write attempt', {
        writePath,
        sessionId,
        actorUid,
        targetUid,
        skillId: move.id
      }, { file: 'inSessionMoveService.ts', line: 88 });
      
      // Write debug mirror
      if (classId && eventId) {
        await writeDebugAction(classId, eventId, traceId, 'written', {
          actorUid,
          targetUid,
          skillId: move.id,
          skillName: move.name,
          paths: {
            actionPath: writePath,
            statePath: `${writePath}/players`
          }
        });
      }
    }
    
    // Instrument: Firestore write attempt
    battleDebug('firestore-write', {
      mode: 'liveEvent',
      sessionId,
      actorUid,
      targetUid,
      skillId: move.id,
      writePath,
      traceId,
      actionPayload: {
        moveId: move.id,
        moveName: move.name,
        damage,
        shieldDamage,
        healing,
        shieldBoost,
        ppStolen,
        ppCost
      }
    });
    
    if (DEBUG_LIVE_EVENTS) {
      console.log('[applyInSessionMove] 📍 Firestore path:', writePath, 'traceId:', traceId);
    }
    
    // ALWAYS log transaction start (critical for debugging) - concise
    console.log('🔄 [applyInSessionMove] ⚡ STARTING TRANSACTION ⚡', move.name, '→', targetName, '| Dmg:', damage, '| Shield:', shieldDamage, '| Heal:', healing);
    
    const result = await runTransaction(db, async (transaction) => {
      // Read session document
      const sessionDoc = await transaction.get(sessionRef);
      
      if (!sessionDoc.exists()) {
        console.error('❌ [applyInSessionMove] Session not found:', sessionId);
        throw new Error(`Session ${sessionId} not found`);
      }

      const sessionData = sessionDoc.data();
      const players: any[] = sessionData.players || [];
      const battleLog: string[] = sessionData.battleLog || [];
      
      // Find actor and target in players array
      const actorIndex = players.findIndex(p => p.userId === actorUid);
      const targetIndex = players.findIndex(p => p.userId === targetUid);
      
      // ALWAYS log what we read (critical for debugging) - concise
      if (actorIndex === -1 || targetIndex === -1) {
        console.error('❌ [applyInSessionMove] ⚠️ ACTOR OR TARGET NOT FOUND:', {
          actorFound: actorIndex >= 0,
          targetFound: targetIndex >= 0,
          playersCount: players.length
        });
      }

      if (actorIndex === -1) {
        throw new Error(`Actor ${actorName} (${actorUid}) not found in session`);
      }

      if (targetIndex === -1) {
        throw new Error(`Target ${targetName} (${targetUid}) not found in session`);
      }

      const actor = players[actorIndex];
      const target = players[targetIndex];
      
      // Log what we read (after variables are declared)
      console.log('📖 [applyInSessionMove] Read from Firestore | Target HP:', target.hp, '| Shield:', target.shield, '| Actor PP:', actor.powerPoints);

      // CRITICAL: Prevent eliminated players from acting
      if (actor.eliminated) {
        throw new Error(`Actor ${actorName} is eliminated and cannot perform actions`);
      }

      // Note: Eliminated targets can still be targeted (for cleanup/final blows)
      // But we'll check elimination status after damage is applied

      // Ensure we have mutable copies (don't mutate original array elements)
      const actorCopy = { ...actor };
      const targetCopy = { ...target };

      let participationPointsSpent = 0;
      let participationCostDiscount = 0;
      const vaultPpCostToDeduct = useLiveEventParticipationForSkillCost ? 0 : ppCost;

      if (useLiveEventParticipationForSkillCost) {
        const studentRef = doc(db, 'students', actorUid);
        const studentSnap = await transaction.get(studentRef);
        const equipped = studentSnap.exists()
          ? ((studentSnap.data() as { equippedArtifacts?: unknown }).equippedArtifacts ?? {})
          : {};
        const costBreakdown = computeLiveEventParticipationSkillCostServer(move, equipped);
        participationCostDiscount = costBreakdown.totalDiscount;
        const finalParticipationCost = costBreakdown.finalCost;
        const movesEarned = Math.max(0, Math.floor(Number(actorCopy.movesEarned) || 0));

        if (finalParticipationCost > movesEarned) {
          throw new Error(
            `Need ${finalParticipationCost} Participation Points to use this skill (have ${movesEarned})`
          );
        }

        actorCopy.movesEarned = movesEarned - finalParticipationCost;
        participationPointsSpent = finalParticipationCost;
      }

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
      // Use target's CURRENT state (read in this transaction) so attack impact is accurate
      const currentShield = targetCopy.shield || 0;
      const currentHp = targetCopy.hp || 0;
      let appliedShieldDamage = 0;
      let appliedHealthDamage = 0;

      if (shieldDamage > 0 && damage === 0) {
        // Special move: direct shield damage only (e.g. Shield OFF) - use passed-in shieldDamage
        appliedShieldDamage = Math.min(shieldDamage, currentShield);
        targetCopy.shield = Math.max(0, currentShield - shieldDamage);
      } else if (damage > 0) {
        // Normal damage: shield absorbs first, then health - computed from SERVER state for accurate impact
        const shieldAbsorbed = Math.min(currentShield, damage);
        const remainingDamage = Math.max(0, damage - shieldAbsorbed);
        appliedShieldDamage = shieldAbsorbed;
        appliedHealthDamage = remainingDamage;

        targetCopy.shield = Math.max(0, currentShield - shieldAbsorbed);
        if (remainingDamage > 0) {
          targetCopy.hp = Math.max(0, currentHp - remainingDamage);
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

      // Apply PP steal (no-op when actor and target are the same row — would double-apply wallet math)
      if (ppStolen > 0 && actorUid !== targetUid) {
        // Steal PP from target to actor
        const actualSteal = Math.min(ppStolen, targetCopy.powerPoints || 0);
        targetCopy.powerPoints = Math.max(0, (targetCopy.powerPoints || 0) - actualSteal);
        actorCopy.powerPoints = (actorCopy.powerPoints || 0) + actualSteal;
      }

      // Deduct vault PP cost from actor (skipped for Live Event skill cost when useLiveEventParticipationForSkillCost)
      if (vaultPpCostToDeduct > 0) {
        actorCopy.powerPoints = Math.max(0, (actorCopy.powerPoints || 0) - vaultPpCostToDeduct);
      }

      // Check for elimination (health + shield = 0)
      const targetTotalHealth = (targetCopy.hp || 0) + (targetCopy.shield || 0);
      if (targetTotalHealth <= 0 && !targetCopy.eliminated) {
        targetCopy.eliminated = true;
        if (actorUid !== targetUid) {
          targetCopy.eliminatedBy = actorUid;
        }
        if (DEBUG_IN_SESSION_MOVES) {
          debug('inSessionMove', `☠️ Target ${targetName} eliminated!`);
        }
      }

      // Same session row for actor + target (self heal / self buff / self-targeted effects): combat mutates
      // `targetCopy` while participation mutates `actorCopy`. `players.map` returns actorCopy first for that
      // index, which previously dropped all damage/healing — merge before writing.
      if (actorIndex === targetIndex) {
        const merged: Record<string, unknown> = { ...targetCopy };
        merged.movesEarned = actorCopy.movesEarned;
        merged.powerPoints = actorCopy.powerPoints;
        // Self shield boost was applied to actorCopy (pre-damage shield). Re-apply boost to post-damage shield.
        if (shieldBoost > 0 && targetUid === actorUid) {
          merged.shield = Math.min(
            (merged.maxShield as number) || 100,
            (targetCopy.shield || 0) + shieldBoost
          );
        }
        Object.assign(actorCopy, merged);
        Object.assign(targetCopy, merged);
      }

      // Update players array
      // CRITICAL: Create a new array to ensure Firestore detects the change
      const updatedPlayers = players.map((p, idx) => {
        if (idx === actorIndex) return actorCopy;
        if (idx === targetIndex) return targetCopy;
        return p;
      });
      
      // Verify the updates were applied correctly
      if (DEBUG_IN_SESSION_MOVES || DEBUG_LIVE_EVENTS) {
        console.log('🔍 [applyInSessionMove] Players array update verification:', {
          actorIndex,
          targetIndex,
          actorBefore: { hp: actor.hp, shield: actor.shield, pp: actor.powerPoints },
          actorAfter: { hp: actorCopy.hp, shield: actorCopy.shield, pp: actorCopy.powerPoints },
          targetBefore: { hp: target.hp, shield: target.shield, pp: target.powerPoints },
          targetAfter: { hp: targetCopy.hp, shield: targetCopy.shield, pp: targetCopy.powerPoints },
          updatedPlayersLength: updatedPlayers.length,
          originalPlayersLength: players.length
        });
      }

      // Add battle log entry - use actual applied damage so log matches impact
      let finalBattleLogMessage = battleLogMessage;
      if (appliedShieldDamage > 0 || appliedHealthDamage > 0) {
        const totalApplied = appliedShieldDamage + appliedHealthDamage;
        if (appliedShieldDamage > 0 && appliedHealthDamage > 0) {
          finalBattleLogMessage = `⚔️ ${actorName} attacked ${targetName} with ${move.name} for ${totalApplied} damage (${appliedShieldDamage} to shields, ${appliedHealthDamage} to vault health)!`;
        } else if (appliedShieldDamage > 0) {
          finalBattleLogMessage = `⚔️ ${actorName} attacked ${targetName} with ${move.name} for ${appliedShieldDamage} damage to shields!`;
        } else {
          finalBattleLogMessage = `⚔️ ${actorName} attacked ${targetName} with ${move.name} for ${appliedHealthDamage} damage to vault health!`;
        }
      } else if (!finalBattleLogMessage || typeof finalBattleLogMessage !== 'string') {
        debugError('inSessionMove', `Invalid battleLogMessage: ${battleLogMessage}`, {
          battleLogMessage,
          battleLogMessageType: typeof battleLogMessage,
          moveId: move.id,
          moveName: move.name
        });
        finalBattleLogMessage = `⚔️ ${actorName} used ${move.name} on ${targetName}!`;
        if (DEBUG_IN_SESSION_MOVES || DEBUG_LIVE_EVENTS) {
          console.warn('[applyInSessionMove] ⚠️ Using fallback battle log message');
        }
      }

      if (participationPointsSpent > 0) {
        const discountPart =
          participationCostDiscount > 0
            ? ` (-${participationCostDiscount} cost reduction)`
            : '';
        const ppPart = ` for ${participationPointsSpent} PP${discountPart}`;
        if (finalBattleLogMessage.endsWith('!')) {
          finalBattleLogMessage = finalBattleLogMessage.slice(0, -1) + ppPart + '!';
        } else {
          finalBattleLogMessage = `${finalBattleLogMessage}${ppPart}`;
        }
      }

      const updatedBattleLog = [...battleLog, finalBattleLogMessage];
      
      if (DEBUG_IN_SESSION_MOVES || DEBUG_LIVE_EVENTS) {
        console.log('[applyInSessionMove] 📝 Battle log update:', {
          oldLength: battleLog.length,
          newLength: updatedBattleLog.length,
          newEntry: battleLogMessage
        });
      }

      // Add elimination log entry if target was eliminated
      let finalBattleLog = updatedBattleLog;
      const wasEliminated = targetCopy.eliminated && targetTotalHealth <= 0;
      if (wasEliminated) {
        const eliminationMessage =
          actorUid !== targetUid
            ? `☠️ ${targetName} eliminated by ${actorName}!`
            : `☠️ ${targetName} has been ELIMINATED!`;
        finalBattleLog = [...updatedBattleLog, eliminationMessage];
      }

      // ALWAYS log what we're about to write (critical for debugging) - detailed version
      console.log('💾 [applyInSessionMove] ⚡ WRITING TO FIRESTORE ⚡', {
        targetName,
        targetHpBefore: target.hp,
        targetHpAfter: targetCopy.hp,
        targetShieldBefore: target.shield,
        targetShieldAfter: targetCopy.shield,
        actorPpBefore: actor.powerPoints,
        actorPpAfter: actorCopy.powerPoints,
        damage,
        shieldDamage,
        healing,
        shieldBoost,
        playersArrayLength: updatedPlayers.length,
        battleLogLength: finalBattleLog.length
      });
      
      // CRITICAL: Update session document with players array and battle log
      // This is the authoritative update that all clients will receive via subscription
      transaction.update(sessionRef, {
        players: updatedPlayers,
        battleLog: finalBattleLog,
        updatedAt: serverTimestamp()
      });

      // Keep global vault in sync in the SAME transaction so BattleContext cannot briefly see stale
      // vaultHealth/shieldStrength and write them back over the combat values (Live Event reset bug).
      const targetVaultRef = doc(db, 'vaults', targetUid);
      const targetVaultSnap = await transaction.get(targetVaultRef);
      if (targetVaultSnap.exists()) {
        transaction.update(targetVaultRef, {
          vaultHealth: Math.max(0, Math.floor(Number(targetCopy.hp) || 0)),
          shieldStrength: Math.max(0, Math.floor(Number(targetCopy.shield) || 0))
        });
      }
      
      // Log that transaction update was queued (will commit when transaction completes)
      if (DEBUG_IN_SESSION_MOVES || DEBUG_LIVE_EVENTS) {
        console.log('💾 [applyInSessionMove] Transaction update queued:', {
          targetIndex,
          targetHpDelta: targetCopy.hp - target.hp,
          targetShieldDelta: targetCopy.shield - target.shield,
          actorPpDelta: actorCopy.powerPoints - actor.powerPoints
        });
      }
      
      // Stage E: State applied - Update debug mirror (after transaction completes)
      // Note: We can't await async operations inside transaction, so we'll do this after

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
          actorPPBefore: actor.powerPoints + vaultPpCostToDeduct - (ppStolen > 0 ? ppStolen : 0),
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
        ppCost: vaultPpCostToDeduct,
        participationPointsSpent,
        participationCostDiscount,
        battleLogEntry: finalBattleLogMessage,
        // Include state changes for debug mirror
        stateChanges: {
          targetHpBefore: target.hp,
          targetHpAfter: targetCopy.hp,
          targetShieldBefore: target.shield,
          targetShieldAfter: targetCopy.shield,
          actorPpBefore: actor.powerPoints,
          actorPpAfter: actorCopy.powerPoints
        }
      };
    });
    
    // ALWAYS log transaction completion (critical for debugging) - concise but clear
    if (result.success) {
      const hpChange = result.stateChanges ? `${result.stateChanges.targetHpBefore} → ${result.stateChanges.targetHpAfter}` : 'N/A';
      const shieldChange = result.stateChanges ? `${result.stateChanges.targetShieldBefore} → ${result.stateChanges.targetShieldAfter}` : 'N/A';
      console.log('✅ [applyInSessionMove] ⚡ SUCCESS ⚡', targetName, '| HP:', hpChange, '| Shield:', shieldChange, '| Dmg:', result.damage, '| Subscription should update');
      // Vault was updated inside the transaction (atomic with session players).
    } else {
      console.error('❌ [applyInSessionMove] ⚠️ FAILED', move.name, '→', targetName, '| Error:', result.message);
    }
    
    // Stage E: Resolved - Update debug mirror
    if (traceId && classId && eventId && result.success) {
      const { writeDebugAction } = await import('./liveEventDebug');
      await writeDebugAction(classId, eventId, traceId, 'resolved', {
        actorUid,
        targetUid,
        skillId: move.id,
        skillName: move.name
      });
    }
    
    // Dispatch success event for debug overlay
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('liveEventActionUpdate', {
        detail: { actionId: traceId || 'unknown', status: 'resolved' }
      }));
    }
    
    // Instrument: Firestore write success
    battleDebug('firestore-write', {
      mode: 'liveEvent',
      sessionId,
      actorUid,
      targetUid,
      skillId: move.id,
      writePath,
      status: 'success',
      actionId: result.battleLogEntry ? 'logged' : 'no-log',
      targetHpAfter: result.damage !== undefined ? 'updated' : 'unknown',
      targetShieldAfter: result.shieldDamage !== undefined ? 'updated' : 'unknown'
    });
    
    // Instrument: State updated
    battleDebug('state-updated', {
      mode: 'liveEvent',
      sessionId,
      targetUid,
      damage,
      shieldDamage,
      healing,
      shieldBoost,
      ppStolen,
      actorPPAfter: result.ppCost !== undefined ? 'deducted' : 'unknown'
    });
    
    // Instrument: Battle log written
    if (result.battleLogEntry) {
      battleDebug('battle-log-written', {
        mode: 'liveEvent',
        sessionId,
        logId: 'session-battleLog',
        text: result.battleLogEntry
      });
    } else {
      battleDebug('battle-log-written', {
        mode: 'liveEvent',
        sessionId,
        logId: 'session-battleLog',
        text: 'NO LOG ENTRY',
        warning: 'Battle log entry missing from result!'
      });
    }

    if (DEBUG_LIVE_EVENTS) {
      console.log('[applyInSessionMove] ✅ FIRESTORE WRITE SUCCESS:', {
        sessionId,
        success: result.success,
        message: result.message
      });
    }

    return result;
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    const errorCode = error?.code || 'UNKNOWN_ERROR';
    
    // Stage F: Error - Update debug mirror
    if (traceId && classId && eventId) {
      const { writeDebugAction, traceError } = await import('./liveEventDebug');
      await writeDebugAction(classId, eventId, traceId, 'error', {
        actorUid,
        targetUid,
        skillId: move.id,
        skillName: move.name,
        error: {
          code: errorCode,
          message: errorMessage,
          stack: error?.stack
        }
      });
      traceError(traceId, error, { sessionId, actorUid, targetUid, moveId: move.id });
    }
    
    const DEBUG_LIVE_EVENTS = process.env.REACT_APP_DEBUG_LIVE_EVENT_SKILLS === 'true' ||
                               process.env.REACT_APP_DEBUG_LIVE_EVENTS === 'true' || 
                               process.env.REACT_APP_DEBUG === 'true';
    
    if (DEBUG_LIVE_EVENTS) {
      console.error('[applyInSessionMove] ❌ FIRESTORE WRITE ERROR:', {
        traceId,
        sessionId,
        errorCode,
        errorMessage,
        errorStack: error?.stack
      });
    }
    
    debugError('inSessionMove', `Error applying move: ${move.name}`, error);
    
    // Dispatch error event for debug overlay
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('liveEventDebugError', {
        detail: { traceId: traceId || 'unknown', error: { code: errorCode, message: errorMessage } }
      }));
    }
    
    // Show user-friendly error; pass through our transaction throws (eliminated, not in session, PP, etc.)
    const isOurMessage =
      typeof errorMessage === 'string' &&
      (errorMessage.includes('Participation Points') ||
        errorMessage.includes('eliminated') ||
        errorMessage.includes('not found in session') ||
        errorMessage.startsWith('Session ') ||
        errorMessage.startsWith('Actor ') ||
        errorMessage.startsWith('Target '));
    const userMessage = isOurMessage
      ? errorMessage
      : errorCode === 'permission-denied'
        ? 'You do not have permission to perform this action.'
        : errorCode === 'failed-precondition' || errorCode === 'aborted'
          ? 'The session state changed or another move was applying. Please try again.'
          : typeof errorMessage === 'string' && errorMessage.length > 0 && errorMessage.length < 200
            ? errorMessage
            : 'Failed to apply move. Please try again.';
    
    return {
      success: false,
      message: userMessage
    };
  }
}

