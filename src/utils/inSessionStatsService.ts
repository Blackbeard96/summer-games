/**
 * Session statistics service for In-Session Mode
 * Tracks and manages session stats during gameplay
 */

import { db } from '../firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, runTransaction, increment } from 'firebase/firestore';
import { SessionStats, SessionSummary } from '../types/inSessionStats';
import { debug, debugError } from './inSessionDebug';

/** Base PP awarded per elimination in a live event (eliminator also receives the eliminated player's vault PP) */
export const LIVE_EVENT_PP_BASE_PER_ELIMINATION = 500;
/** PP awarded per participation point in a live event */
export const LIVE_EVENT_PP_PER_PARTICIPATION_POINT = 50;

/** Eliminated players keep this fraction of quiz + elimination PP (participation PP in stats is not deducted from vault). */
export const LIVE_EVENT_ELIMINATED_PP_FRACTION = 0.5;

/**
 * Initialize session stats for a player when they join
 */
export async function initializePlayerStats(
  sessionId: string,
  playerId: string,
  playerName: string,
  startingPP: number
): Promise<boolean> {
  try {
    const statsRef = doc(db, 'inSessionRooms', sessionId, 'stats', playerId);
    
    const initialStats: SessionStats = {
      playerId,
      playerName,
      startingPP,
      endingPP: startingPP,
      netPPGained: 0,
      ppSpent: 0,
      ppEarned: 0,
      participationEarned: 0,
      movesEarned: 0,
      eliminations: 0,
      isEliminated: false,
      damageDealt: 0,
      damageTaken: 0,
      healingGiven: 0,
      healingReceived: 0,
      skillsUsed: [],
      totalSkillsUsed: 0,
      sessionId,
      sessionStartTime: serverTimestamp(),
      sessionEndTime: null,
      sessionDuration: 0
    };
    
    await setDoc(statsRef, initialStats);
    
    debug('inSessionStats', `Initialized stats for player ${playerId} in session ${sessionId}`);
    return true;
  } catch (error) {
    debugError('inSessionStats', `Error initializing stats for player ${playerId}`, error);
    return false;
  }
}

/**
 * Track a skill usage
 */
export async function trackSkillUsage(
  sessionId: string,
  playerId: string,
  skillId: string,
  skillName: string,
  ppCost: number,
  damage?: number,
  healing?: number
): Promise<boolean> {
  try {
    const statsRef = doc(db, 'inSessionRooms', sessionId, 'stats', playerId);
    
    await runTransaction(db, async (transaction) => {
      const statsDoc = await transaction.get(statsRef);
      
      if (!statsDoc.exists()) {
        debug('inSessionStats', `Stats not found for player ${playerId}, initializing...`);
        // Stats should have been initialized on join, but handle gracefully
        return;
      }
      
      const stats = statsDoc.data() as SessionStats;
      
      // Update PP spent
      const newPPSpent = (stats.ppSpent || 0) + ppCost;
      
      // Update or add skill usage
      const skillsUsed = [...(stats.skillsUsed || [])];
      const skillIndex = skillsUsed.findIndex(s => s.skillId === skillId);
      
      if (skillIndex >= 0) {
        // Update existing skill
        skillsUsed[skillIndex] = {
          ...skillsUsed[skillIndex],
          count: skillsUsed[skillIndex].count + 1,
          totalDamage: (skillsUsed[skillIndex].totalDamage || 0) + (damage || 0),
          totalHealing: (skillsUsed[skillIndex].totalHealing || 0) + (healing || 0)
        };
      } else {
        // Add new skill
        skillsUsed.push({
          skillId,
          skillName,
          count: 1,
          totalDamage: damage || 0,
          totalHealing: healing || 0
        });
      }
      
      transaction.update(statsRef, {
        ppSpent: newPPSpent,
        skillsUsed,
        totalSkillsUsed: (stats.totalSkillsUsed || 0) + 1,
        damageDealt: (stats.damageDealt || 0) + (damage || 0),
        healingGiven: (stats.healingGiven || 0) + (healing || 0)
      });
    });
    
    debug('inSessionStats', `Tracked skill usage: ${skillName} by ${playerId}`);
    return true;
  } catch (error) {
    debugError('inSessionStats', `Error tracking skill usage for ${playerId}`, error);
    return false;
  }
}

/**
 * Track damage dealt/taken
 */
export async function trackDamage(
  sessionId: string,
  attackerId: string,
  targetId: string,
  damage: number,
  shieldDamage?: number
): Promise<boolean> {
  try {
    const attackerStatsRef = doc(db, 'inSessionRooms', sessionId, 'stats', attackerId);
    const targetStatsRef = doc(db, 'inSessionRooms', sessionId, 'stats', targetId);
    
    await runTransaction(db, async (transaction) => {
      // Update attacker's damage dealt
      const attackerStatsDoc = await transaction.get(attackerStatsRef);
      if (attackerStatsDoc.exists()) {
        const attackerStats = attackerStatsDoc.data() as SessionStats;
        transaction.update(attackerStatsRef, {
          damageDealt: (attackerStats.damageDealt || 0) + damage + (shieldDamage || 0)
        });
      }
      
      // Update target's damage taken
      const targetStatsDoc = await transaction.get(targetStatsRef);
      if (targetStatsDoc.exists()) {
        const targetStats = targetStatsDoc.data() as SessionStats;
        transaction.update(targetStatsRef, {
          damageTaken: (targetStats.damageTaken || 0) + damage + (shieldDamage || 0)
        });
      }
    });
    
    return true;
  } catch (error) {
    debugError('inSessionStats', `Error tracking damage`, error);
    return false;
  }
}

/**
 * Track an elimination.
 * Eliminator earns LIVE_EVENT_PP_BASE_PER_ELIMINATION (500) + the eliminated player's vault currentPP.
 */
export async function trackElimination(
  sessionId: string,
  eliminatorId: string,
  eliminatedId: string
): Promise<boolean> {
  try {
    const eliminatorStatsRef = doc(db, 'inSessionRooms', sessionId, 'stats', eliminatorId);
    const eliminatedStatsRef = doc(db, 'inSessionRooms', sessionId, 'stats', eliminatedId);

    // PP earned = base + eliminated player's vault PP (read at elimination time)
    let eliminatedVaultPP = 0;
    try {
      const vaultRef = doc(db, 'vaults', eliminatedId);
      const vaultSnap = await getDoc(vaultRef);
      if (vaultSnap.exists()) {
        eliminatedVaultPP = vaultSnap.data()?.currentPP ?? 0;
      }
    } catch (vaultErr) {
      debugError('inSessionStats', `Could not read vault for eliminated player ${eliminatedId}`, vaultErr);
    }
    const ppFromElimination = LIVE_EVENT_PP_BASE_PER_ELIMINATION + Math.max(0, eliminatedVaultPP);

    await runTransaction(db, async (transaction) => {
      // Increment eliminator's elimination count and add PP (base + vault)
      const eliminatorStatsDoc = await transaction.get(eliminatorStatsRef);
      if (eliminatorStatsDoc.exists()) {
        const eliminatorStats = eliminatorStatsDoc.data() as SessionStats;
        transaction.update(eliminatorStatsRef, {
          eliminations: (eliminatorStats.eliminations || 0) + 1,
          ppEarned: (eliminatorStats.ppEarned || 0) + ppFromElimination
        });
      }

      // Mark eliminated player
      const eliminatedStatsDoc = await transaction.get(eliminatedStatsRef);
      if (eliminatedStatsDoc.exists()) {
        transaction.update(eliminatedStatsRef, {
          isEliminated: true,
          eliminatedBy: eliminatorId
        });
      }
    });

    // Grant PP to eliminator's account (students, users, vault) so they actually receive +500 (and vault PP)
    try {
      const studentRef = doc(db, 'students', eliminatorId);
      const userRef = doc(db, 'users', eliminatorId);
      const vaultRef = doc(db, 'vaults', eliminatorId);

      const studentDoc = await getDoc(studentRef);
      if (studentDoc.exists()) {
        await updateDoc(studentRef, { powerPoints: increment(ppFromElimination) });
      }
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        await updateDoc(userRef, { powerPoints: increment(ppFromElimination) });
      }
      const vaultDoc = await getDoc(vaultRef);
      if (vaultDoc.exists()) {
        const v = vaultDoc.data();
        const cur = v?.currentPP ?? 0;
        const cap = v?.capacity ?? 1000;
        await updateDoc(vaultRef, { currentPP: Math.min(cap, cur + ppFromElimination) });
      }

      // Update session players so eliminator's in-session PP display reflects the grant
      const sessionRef = doc(db, 'inSessionRooms', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      if (sessionDoc.exists()) {
        const sessionData = sessionDoc.data();
        const players = sessionData?.players || [];
        const eliminatorIndex = players.findIndex((p: any) => p.userId === eliminatorId);
        if (eliminatorIndex >= 0) {
          const updatedPlayers = [...players];
          const currentPP = updatedPlayers[eliminatorIndex].powerPoints ?? 0;
          updatedPlayers[eliminatorIndex] = { ...updatedPlayers[eliminatorIndex], powerPoints: currentPP + ppFromElimination };
          await updateDoc(sessionRef, { players: updatedPlayers, updatedAt: serverTimestamp() });
        }
      }
    } catch (grantError) {
      debugError('inSessionStats', `Error granting PP to eliminator ${eliminatorId}`, grantError);
    }

    debug('inSessionStats', `Tracked elimination: ${eliminatorId} eliminated ${eliminatedId} (+${ppFromElimination} PP = 500 + ${eliminatedVaultPP} vault)`);
    return true;
  } catch (error) {
    debugError('inSessionStats', `Error tracking elimination`, error);
    return false;
  }
}

type RoomPlayerEliminationFields = {
  userId: string;
  displayName?: string;
  powerPoints?: number;
  participationCount?: number;
  movesEarned?: number;
  eliminated?: boolean;
  eliminatedBy?: string;
};

/**
 * Merge room.players[].eliminated (authoritative) into stats so the session summary lists eliminations
 * even when stats subdocs missed trackElimination or never existed.
 */
function mergeRoomEliminationsIntoStatsMap(
  statsMap: { [playerId: string]: SessionStats },
  roomPlayers: RoomPlayerEliminationFields[],
  sessionId: string,
  sessionStartTime: any,
  sessionEndTime: any,
  duration: number
): void {
  for (const rp of roomPlayers) {
    if (!rp?.userId || !rp.eliminated) continue;
    const uid = rp.userId;
    const eliminatedBy = rp.eliminatedBy || statsMap[uid]?.eliminatedBy;
    const existing = statsMap[uid];
    if (existing) {
      statsMap[uid] = {
        ...existing,
        isEliminated: true,
        ...(eliminatedBy ? { eliminatedBy } : {}),
        playerName: existing.playerName || rp.displayName || 'Player'
      };
    } else {
      const endingPP = rp.powerPoints ?? 0;
      statsMap[uid] = {
        playerId: uid,
        playerName: rp.displayName || 'Player',
        startingPP: endingPP,
        endingPP,
        netPPGained: 0,
        ppSpent: 0,
        ppEarned: 0,
        participationEarned: rp.participationCount ?? 0,
        movesEarned: rp.movesEarned ?? 0,
        eliminations: 0,
        isEliminated: true,
        ...(eliminatedBy ? { eliminatedBy } : {}),
        damageDealt: 0,
        damageTaken: 0,
        healingGiven: 0,
        healingReceived: 0,
        skillsUsed: [],
        totalSkillsUsed: 0,
        sessionId,
        sessionStartTime,
        sessionEndTime,
        sessionDuration: duration
      };
    }
  }
}

/**
 * Client-side: enrich embedded sessionSummary with room snapshot (fixes older summaries / reconnects).
 */
export function mergeRoomEliminationsIntoSummary(
  summary: SessionSummary,
  roomPlayers: RoomPlayerEliminationFields[] | null | undefined
): SessionSummary {
  if (!roomPlayers?.length) return summary;
  const stats = { ...summary.stats };
  mergeRoomEliminationsIntoStatsMap(stats, roomPlayers, summary.sessionId, summary.startedAt, summary.endedAt, summary.duration);
  const mergedKeys = Object.keys(stats).length;
  return {
    ...summary,
    stats,
    totalPlayers: Math.max(summary.totalPlayers, mergedKeys)
  };
}

/**
 * Estimates elimination portion of ppEarned (same heuristic as SessionSummaryModal: total minus participation notional).
 */
export function estimateEliminationPpFromStats(stats: SessionStats): number {
  const partPP = (stats.participationEarned || 0) * LIVE_EVENT_PP_PER_PARTICIPATION_POINT;
  return Math.max(0, (stats.ppEarned || 0) - partPP);
}

async function deductPPFromStudentUserVault(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  try {
    const studentRef = doc(db, 'students', userId);
    const userRef = doc(db, 'users', userId);
    const vaultRef = doc(db, 'vaults', userId);
    const studentDoc = await getDoc(studentRef);
    if (studentDoc.exists()) {
      const cur = (studentDoc.data() as { powerPoints?: number }).powerPoints ?? 0;
      await updateDoc(studentRef, { powerPoints: Math.max(0, cur - amount) });
    }
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      const cur = (userDoc.data() as { powerPoints?: number }).powerPoints ?? 0;
      await updateDoc(userRef, { powerPoints: Math.max(0, cur - amount) });
    }
    const vaultDoc = await getDoc(vaultRef);
    if (vaultDoc.exists()) {
      const v = vaultDoc.data() as { currentPP?: number };
      const cur = v?.currentPP ?? 0;
      await updateDoc(vaultRef, { currentPP: Math.max(0, cur - amount) });
    }
    debug('inSessionStats', `Elimination PP penalty: deducted ${amount} PP from accounts for ${userId}`);
  } catch (e) {
    debugError('inSessionStats', `deductPPFromStudentUserVault failed for ${userId}`, e);
  }
}

/**
 * Halves quiz + stats PP for eliminated players, deducts vault/student/user for quiz + elimination portions that were actually granted.
 */
async function applyEliminatedPlayerPointPenalty(
  sessionId: string,
  statsMap: { [playerId: string]: SessionStats },
  quizPpByPlayer: Record<string, number> | undefined
): Promise<Record<string, number>> {
  const out: Record<string, number> = { ...(quizPpByPlayer ?? {}) };
  const frac = LIVE_EVENT_ELIMINATED_PP_FRACTION;

  for (const [uid, stats] of Object.entries(statsMap)) {
    if (!stats.isEliminated) continue;

    const quizPP = out[uid] ?? 0;
    const pe = stats.ppEarned ?? 0;
    const elimPP = estimateEliminationPpFromStats(stats);

    const newQuiz = Math.floor(quizPP * frac);
    const newPe = Math.floor(pe * frac);
    const newElimPP = Math.floor(elimPP * frac);
    const oldNet = stats.netPPGained ?? 0;
    const newNet = Math.floor(oldNet * frac);
    const startingPP = stats.startingPP ?? 0;
    const newEndingPP = Math.max(0, startingPP + newNet);

    out[uid] = newQuiz;

    const deductQuiz = quizPP - newQuiz;
    const deductElim = elimPP - newElimPP;
    const totalDeduct = deductQuiz + deductElim;

    statsMap[uid] = {
      ...stats,
      ppEarned: newPe,
      netPPGained: newNet,
      endingPP: newEndingPP
    };

    if (totalDeduct > 0) {
      await deductPPFromStudentUserVault(uid, totalDeduct);
    }

    try {
      const statsRef = doc(db, 'inSessionRooms', sessionId, 'stats', uid);
      const statsDoc = await getDoc(statsRef);
      if (statsDoc.exists()) {
        await updateDoc(statsRef, {
          ppEarned: newPe,
          netPPGained: newNet,
          endingPP: newEndingPP
        });
      }
    } catch (e) {
      debugError('inSessionStats', `Failed to persist penalty stats for ${uid}`, e);
    }
  }

  return out;
}

/**
 * Track participation earned
 */
export async function trackParticipation(
  sessionId: string,
  playerId: string,
  participationAmount: number
): Promise<boolean> {
  try {
    const statsRef = doc(db, 'inSessionRooms', sessionId, 'stats', playerId);
    
    await runTransaction(db, async (transaction) => {
      const statsDoc = await transaction.get(statsRef);
      
      if (!statsDoc.exists()) {
        return;
      }
      
      const stats = statsDoc.data() as SessionStats;
      const newParticipation = (stats.participationEarned || 0) + participationAmount;
      const newMovesEarned = Math.floor(newParticipation / 1); // 1 participation = 1 move
      const ppFromParticipation = participationAmount * LIVE_EVENT_PP_PER_PARTICIPATION_POINT;
      const newPPEarned = (stats.ppEarned || 0) + ppFromParticipation;
      
      transaction.update(statsRef, {
        participationEarned: newParticipation,
        movesEarned: newMovesEarned,
        ppEarned: newPPEarned
      });
    });
    
    return true;
  } catch (error) {
    debugError('inSessionStats', `Error tracking participation`, error);
    return false;
  }
}

/**
 * Finalize session stats when session ends
 */
export async function finalizeSessionStats(
  sessionId: string,
  playerIds: string[]
): Promise<SessionSummary | null> {
  try {
    const sessionRef = doc(db, 'inSessionRooms', sessionId);
    const sessionDoc = await getDoc(sessionRef);
    
    if (!sessionDoc.exists()) {
      debugError('inSessionStats', `Session ${sessionId} does not exist`);
      return null;
    }
    
    const sessionData = sessionDoc.data();
    const sessionStartTime = sessionData.startedAt || sessionData.createdAt;
    const sessionEndTime = serverTimestamp();
    
    // Calculate duration
    let duration = 0;
    if (sessionStartTime) {
      const start = sessionStartTime.toMillis ? sessionStartTime.toMillis() : new Date(sessionStartTime).getTime();
      const end = Date.now();
      duration = Math.floor((end - start) / 1000); // Duration in seconds
    }
    
    // Get all player stats
    const statsMap: { [playerId: string]: SessionStats } = {};
    
    for (const playerId of playerIds) {
      const statsRef = doc(db, 'inSessionRooms', sessionId, 'stats', playerId);
      const statsDoc = await getDoc(statsRef);
      
      if (statsDoc.exists()) {
        const stats = statsDoc.data() as SessionStats;
        
        // Get current ending PP from session players
        const player = (sessionData.players || []).find((p: any) => p.userId === playerId);
        const endingPP = player?.powerPoints || stats.endingPP || stats.startingPP;
        
        // Calculate net PP gained
        const netPPGained = endingPP - stats.startingPP;
        
        // Finalize stats
        const finalizedStats: SessionStats = {
          ...stats,
          endingPP,
          netPPGained,
          sessionEndTime,
          sessionDuration: duration
        };
        
        // Update in Firestore
        await updateDoc(statsRef, {
          endingPP,
          netPPGained,
          sessionEndTime,
          sessionDuration: duration
        });
        
        statsMap[playerId] = finalizedStats;
      }
    }

    mergeRoomEliminationsIntoStatsMap(
      statsMap,
      (sessionData.players || []) as RoomPlayerEliminationFields[],
      sessionId,
      sessionStartTime,
      sessionEndTime,
      duration
    );

    const rawQuizPpByPlayer = (sessionData.lastQuizPpByPlayer || {}) as Record<string, number>;
    const adjustedQuizPpByPlayer = await applyEliminatedPlayerPointPenalty(
      sessionId,
      statsMap,
      rawQuizPpByPlayer
    );

    // Sync each player's vault health and shield from session state so Live Event impact persists globally
    const players = sessionData.players || [];
    for (const p of players) {
      const uid = p.userId;
      if (!uid) continue;
      const hp = p.hp;
      const shield = p.shield;
      if (hp === undefined && shield === undefined) continue;
      try {
        const vaultRef = doc(db, 'vaults', uid);
        const updates: { vaultHealth?: number; shieldStrength?: number } = {};
        if (hp !== undefined) updates.vaultHealth = Math.max(0, hp);
        if (shield !== undefined) updates.shieldStrength = Math.max(0, shield);
        if (Object.keys(updates).length > 0) {
          await updateDoc(vaultRef, updates);
          debug('inSessionStats', `Synced vault for ${p.displayName || uid}: vaultHealth=${updates.vaultHealth ?? '—'}, shieldStrength=${updates.shieldStrength ?? '—'}`);
        }
      } catch (err) {
        debugError('inSessionStats', `Failed to sync vault for ${uid} at session end`, err);
      }
    }

    // Calculate MVP badges
    let mostPP = 0;
    let mostEliminations = 0;
    let mostParticipation = 0;
    let mostDamage = 0;
    
    let mvpPPPlayer: string | undefined;
    let mvpEliminationsPlayer: string | undefined;
    let mvpParticipationPlayer: string | undefined;
    let mvpDamagePlayer: string | undefined;
    
    for (const [playerId, stats] of Object.entries(statsMap)) {
      if (stats.netPPGained > mostPP) {
        mostPP = stats.netPPGained;
        mvpPPPlayer = playerId;
      }
      if (stats.eliminations > mostEliminations) {
        mostEliminations = stats.eliminations;
        mvpEliminationsPlayer = playerId;
      }
      if (stats.participationEarned > mostParticipation) {
        mostParticipation = stats.participationEarned;
        mvpParticipationPlayer = playerId;
      }
      if (stats.damageDealt > mostDamage) {
        mostDamage = stats.damageDealt;
        mvpDamagePlayer = playerId;
      }
    }
    
    // Assign badges
    for (const [playerId, stats] of Object.entries(statsMap)) {
      const badges: Array<{ type: string; label: string }> = [];
      
      if (playerId === mvpPPPlayer && mostPP > 0) {
        badges.push({ type: 'most_pp', label: '💰 Most PP Earned' });
      }
      if (playerId === mvpEliminationsPlayer && mostEliminations > 0) {
        badges.push({ type: 'most_eliminations', label: '⚔️ Most Eliminations' });
      }
      if (playerId === mvpParticipationPlayer && mostParticipation > 0) {
        badges.push({ type: 'most_participation', label: '✨ Most Participation' });
      }
      if (playerId === mvpDamagePlayer && mostDamage > 0) {
        badges.push({ type: 'most_damage', label: '💥 Most Damage Dealt' });
      }
      if (!stats.isEliminated) {
        badges.push({ type: 'survivor', label: '🛡️ Survivor' });
      }
      
      if (badges.length > 0) {
        statsMap[playerId].badges = badges as any;
        const statsRef = doc(db, 'inSessionRooms', sessionId, 'stats', playerId);
        await updateDoc(statsRef, { badges });
      }
    }
    
    // Determine overall MVP (prioritize eliminations, then PP)
    const mvpPlayerId = mvpEliminationsPlayer || mvpPPPlayer;
    
    // Create session summary (include quiz awards if stored when a quiz completed)
    const summary: SessionSummary = {
      sessionId,
      classId: sessionData.classId,
      className: sessionData.className,
      startedAt: sessionStartTime,
      endedAt: sessionEndTime,
      duration,
      totalPlayers: Math.max(playerIds.length, Object.keys(statsMap).length),
      stats: statsMap,
      mvpPlayerId,
      ...(sessionData.lastQuizAwardsSnapshot && { quizAwardsSnapshot: sessionData.lastQuizAwardsSnapshot }),
      ...(Object.keys(adjustedQuizPpByPlayer).length > 0 && { quizPpByPlayer: adjustedQuizPpByPlayer })
    };

    // Store summary in session document
    await updateDoc(sessionRef, {
      sessionSummary: summary,
      status: 'ended',
      endedAt: sessionEndTime
    });
    
    debug('inSessionStats', `Finalized session stats for ${sessionId}`, {
      totalPlayers: playerIds.length,
      mvp: mvpPlayerId
    });
    
    return summary;
  } catch (error) {
    debugError('inSessionStats', `Error finalizing session stats`, error);
    return null;
  }
}

/**
 * Get session stats for a player
 */
export async function getPlayerStats(
  sessionId: string,
  playerId: string
): Promise<SessionStats | null> {
  try {
    const statsRef = doc(db, 'inSessionRooms', sessionId, 'stats', playerId);
    const statsDoc = await getDoc(statsRef);
    
    if (!statsDoc.exists()) {
      return null;
    }
    
    return statsDoc.data() as SessionStats;
  } catch (error) {
    debugError('inSessionStats', `Error getting player stats`, error);
    return null;
  }
}

/**
 * Get session summary
 */
export async function getSessionSummary(
  sessionId: string
): Promise<SessionSummary | null> {
  try {
    const sessionRef = doc(db, 'inSessionRooms', sessionId);
    const sessionDoc = await getDoc(sessionRef);
    
    if (!sessionDoc.exists()) {
      return null;
    }
    
    const sessionData = sessionDoc.data();
    return sessionData.sessionSummary || null;
  } catch (error) {
    debugError('inSessionStats', `Error getting session summary`, error);
    return null;
  }
}



