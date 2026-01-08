/**
 * Session statistics service for In-Session Mode
 * Tracks and manages session stats during gameplay
 */

import { db } from '../firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { SessionStats, SessionSummary } from '../types/inSessionStats';
import { debug, debugError } from './inSessionDebug';

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
 * Track an elimination
 */
export async function trackElimination(
  sessionId: string,
  eliminatorId: string,
  eliminatedId: string
): Promise<boolean> {
  try {
    const eliminatorStatsRef = doc(db, 'inSessionRooms', sessionId, 'stats', eliminatorId);
    const eliminatedStatsRef = doc(db, 'inSessionRooms', sessionId, 'stats', eliminatedId);
    
    await runTransaction(db, async (transaction) => {
      // Increment eliminator's elimination count
      const eliminatorStatsDoc = await transaction.get(eliminatorStatsRef);
      if (eliminatorStatsDoc.exists()) {
        const eliminatorStats = eliminatorStatsDoc.data() as SessionStats;
        transaction.update(eliminatorStatsRef, {
          eliminations: (eliminatorStats.eliminations || 0) + 1,
          ppEarned: (eliminatorStats.ppEarned || 0) + 10 // Bonus PP for elimination
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
    
    debug('inSessionStats', `Tracked elimination: ${eliminatorId} eliminated ${eliminatedId}`);
    return true;
  } catch (error) {
    debugError('inSessionStats', `Error tracking elimination`, error);
    return false;
  }
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
      
      transaction.update(statsRef, {
        participationEarned: newParticipation,
        movesEarned: newMovesEarned
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
    
    // Create session summary
    const summary: SessionSummary = {
      sessionId,
      classId: sessionData.classId,
      className: sessionData.className,
      startedAt: sessionStartTime,
      endedAt: sessionEndTime,
      duration,
      totalPlayers: playerIds.length,
      stats: statsMap,
      mvpPlayerId
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


