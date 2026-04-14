/**
 * Session statistics service for In-Session Mode
 * Tracks and manages session stats during gameplay
 */

import { db } from '../firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, runTransaction, increment, arrayUnion } from 'firebase/firestore';
import { SessionStats, SessionSummary } from '../types/inSessionStats';
import { debug, debugError } from './inSessionDebug';
import { applyParticipationStreakAward, breakParticipationStreakMessage } from './participationStreak';
import { evaluateFlowStateAfterSuccess, mergeFlowClearIntoRow } from './liveEventFlowState';
import type { LiveEventPowerGain } from '../types/playerPowerStats';
import {
  awardLiveEventPowerGain,
  awardPowerXpForElimination,
  computeSessionEndPowerXp,
} from './liveEventPowerStatsService';
import { unlockLevel2BuilderFromLiveFlow } from '../services/level2ManifestService';
import { awardBattlePassXpForDeployedSeason } from './awardBattlePassXp';
import { trackPlayerAction } from './playerProgressionRewards';

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
 * Ensures stats/{playerId} exists. Use when join used the "already in session" fast path,
 * failed-precondition recovery, or stats init failed — otherwise trackSkillUsage no-ops and attacks don't register.
 */
export async function ensurePlayerStatsIfMissing(
  sessionId: string,
  playerId: string,
  defaults?: { playerName?: string; startingPP?: number }
): Promise<boolean> {
  try {
    const statsRef = doc(db, 'inSessionRooms', sessionId, 'stats', playerId);
    const snap = await getDoc(statsRef);
    if (snap.exists()) return true;

    let playerName = defaults?.playerName ?? 'Player';
    let startingPP = defaults?.startingPP ?? 0;
    const roomRef = doc(db, 'inSessionRooms', sessionId);
    const roomSnap = await getDoc(roomRef);
    if (roomSnap.exists()) {
      const players = (roomSnap.data() as { players?: Array<{ userId: string; displayName?: string; powerPoints?: number }> }).players ?? [];
      const row = players.find((p) => p.userId === playerId);
      if (row) {
        if (row.displayName) playerName = row.displayName;
        if (typeof row.powerPoints === 'number') startingPP = row.powerPoints;
      }
    }

    const ok = await initializePlayerStats(sessionId, playerId, playerName, startingPP);
    if (ok) debug('inSessionStats', `ensurePlayerStatsIfMissing: created stats for ${playerId}`);
    return ok;
  } catch (error) {
    debugError('inSessionStats', `ensurePlayerStatsIfMissing failed for ${playerId}`, error);
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
    await ensurePlayerStatsIfMissing(sessionId, playerId, {});
    const statsRef = doc(db, 'inSessionRooms', sessionId, 'stats', playerId);
    
    await runTransaction(db, async (transaction) => {
      const statsDoc = await transaction.get(statsRef);
      
      if (!statsDoc.exists()) {
        debug('inSessionStats', `Stats still missing for ${playerId} after ensure — skip skill tracking`);
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
      
      // damageDealt is updated only in trackDamage (health + shield) to avoid double-counting
      transaction.update(statsRef, {
        ppSpent: newPPSpent,
        skillsUsed,
        totalSkillsUsed: (stats.totalSkillsUsed || 0) + 1,
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
    await ensurePlayerStatsIfMissing(sessionId, attackerId, {});
    await ensurePlayerStatsIfMissing(sessionId, targetId, {});
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

      void trackPlayerAction(eliminatorId, 'EARN_PP', ppFromElimination).catch((err) =>
        console.error('[inSessionStats] earn_pp daily challenge after elimination:', err)
      );
      void trackPlayerAction(eliminatorId, 'DEFEAT_ENEMY', 1).catch((err) =>
        console.error('[inSessionStats] defeat_enemies daily challenge after elimination:', err)
      );

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
    void awardPowerXpForElimination(eliminatorId, sessionId);
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
 * Track participation earned (single hub for Live Event “success streak” / Flow State).
 * Correct quiz answers, class-flow sprint rewards, and host-awarded participation all call this.
 * Updates stats + session `players[]` with `successStreak`, `flowStateActive`, `flowStateNonce` (see liveEventFlowState).
 */
export async function trackParticipation(
  sessionId: string,
  playerId: string,
  participationAmount: number,
  options?: { playerDisplayName?: string }
): Promise<boolean> {
  try {
    const statsRef = doc(db, 'inSessionRooms', sessionId, 'stats', playerId);
    const sessionRef = doc(db, 'inSessionRooms', sessionId);

    let streakLogLine: string | null = null;
    let nextConsecutive = 0;
    let flowEnteredThisCall = false;

    await runTransaction(db, async (transaction) => {
      const statsDoc = await transaction.get(statsRef);
      const sessionDoc = await transaction.get(sessionRef);

      if (!statsDoc.exists()) {
        return;
      }

      const stats = statsDoc.data() as SessionStats;
      const newParticipation = (stats.participationEarned || 0) + participationAmount;
      const newMovesEarned = Math.floor(newParticipation / 1); // 1 participation = 1 move
      const ppFromParticipation = participationAmount * LIVE_EVENT_PP_PER_PARTICIPATION_POINT;
      const newPPEarned = (stats.ppEarned || 0) + ppFromParticipation;

      const prevConsecutive = stats.consecutiveParticipationAwards ?? 0;
      const name = options?.playerDisplayName || stats.playerName || 'Player';
      const streakState = { consecutiveAwards: prevConsecutive };
      const { next, battleLogLine } = applyParticipationStreakAward(streakState, name, participationAmount);
      nextConsecutive = next.consecutiveAwards;
      streakLogLine = battleLogLine;

      transaction.update(statsRef, {
        participationEarned: newParticipation,
        movesEarned: newMovesEarned,
        ppEarned: newPPEarned,
        consecutiveParticipationAwards: nextConsecutive,
        lastLoggedStreakCount: nextConsecutive,
      });

      // Session row PP is what MST MKT and finalizeSessionStats use; mirror participation awards here
      // so players can spend earned PP during the Live Event (same rate as stats.ppEarned).
      if (sessionDoc.exists()) {
        const sessionPatch: {
          players?: unknown[];
          battleLog?: ReturnType<typeof arrayUnion>;
          updatedAt: ReturnType<typeof serverTimestamp>;
        } = { updatedAt: serverTimestamp() };
        const players = [...((sessionDoc.data()?.players || []) as Array<Record<string, unknown>>)];
        const pIdx = players.findIndex((p) => p && (p as { userId?: string }).userId === playerId);
        if (pIdx >= 0) {
          const row = { ...players[pIdx] } as Record<string, unknown>;
          const flowEval = evaluateFlowStateAfterSuccess(row, prevConsecutive, nextConsecutive);
          const { flowEntered, ...flowForStore } = flowEval;
          void flowEntered;
          row.powerPoints = Math.max(0, (Number(row.powerPoints) || 0) + ppFromParticipation);
          players[pIdx] = { ...row, ...flowForStore } as (typeof players)[number];
          sessionPatch.players = players;
        }
        if (streakLogLine) {
          sessionPatch.battleLog = arrayUnion(streakLogLine);
        }
        if (sessionPatch.players || sessionPatch.battleLog) {
          transaction.update(sessionRef, sessionPatch);
        }
      } else if (streakLogLine) {
        transaction.update(sessionRef, {
          battleLog: arrayUnion(streakLogLine),
          updatedAt: serverTimestamp(),
        });
      }
    });

    if (flowEnteredThisCall) {
      void unlockLevel2BuilderFromLiveFlow(playerId).catch((e) => {
        debugError('inSessionStats', 'Level 2 manifest unlock after Flow State failed', e);
      });
    }

    return true;
  } catch (error) {
    debugError('inSessionStats', `Error tracking participation`, error);
    return false;
  }
}

/** Call when a player fails a streak-eligible action (e.g. wrong quiz answer). */
export async function breakParticipationStreak(
  sessionId: string,
  playerId: string,
  playerDisplayName?: string
): Promise<void> {
  try {
    const statsRef = doc(db, 'inSessionRooms', sessionId, 'stats', playerId);
    const sessionRef = doc(db, 'inSessionRooms', sessionId);

    await runTransaction(db, async (transaction) => {
      const statsDoc = await transaction.get(statsRef);
      if (!statsDoc.exists()) return;
      const stats = statsDoc.data() as SessionStats;
      const prev = stats.consecutiveParticipationAwards ?? 0;
      const hadStreak = prev >= 3;
      const name = playerDisplayName || stats.playerName || 'Player';
      const msg = breakParticipationStreakMessage(name, hadStreak);

      transaction.update(statsRef, {
        consecutiveParticipationAwards: 0,
        lastLoggedStreakCount: 0,
      });

      const sessionDoc = await transaction.get(sessionRef);
      if (!sessionDoc.exists()) return;

      const players = [...((sessionDoc.data()?.players || []) as Array<Record<string, unknown>>)];
      const pIdx = players.findIndex((p) => p && (p as { userId?: string }).userId === playerId);
      const patch: Record<string, unknown> = {
        updatedAt: serverTimestamp(),
      };
      if (msg) {
        patch.battleLog = arrayUnion(msg);
      }
      if (pIdx >= 0) {
        const row = { ...players[pIdx] } as Record<string, unknown>;
        const flowClear = mergeFlowClearIntoRow(row);
        players[pIdx] = { ...row, ...flowClear } as (typeof players)[number];
        patch.players = players;
      }
      if (patch.battleLog !== undefined || patch.players !== undefined) {
        // Firestore UpdateData is strict; session row shape is dynamic (players[]).
        transaction.update(sessionRef, patch as Record<string, unknown> as never);
      }
    });
  } catch (error) {
    debugError('inSessionStats', `Error breaking participation streak`, error);
  }
}

/** UIDs that should receive session-end Power XP (roster + optional co-op `participantRecords`). */
function collectLiveEventRewardPlayerIds(sessionData: Record<string, unknown>, fallbackPlayerIds: string[]): string[] {
  const fromPlayers = Array.isArray(sessionData.players)
    ? (sessionData.players as { userId?: string }[])
        .map((p) => p?.userId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const pr = sessionData.participantRecords as
    | Record<string, { userId?: string; participantId?: string }>
    | undefined;
  const fromPr =
    pr && typeof pr === 'object' && !Array.isArray(pr)
      ? Object.values(pr)
          .map((r) => (typeof r?.userId === 'string' ? r.userId : r?.participantId))
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...fromPlayers, ...fromPr, ...fallbackPlayerIds]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out.length > 0 ? out : [...fallbackPlayerIds];
}

function buildSyntheticSessionStats(
  playerId: string,
  sessionId: string,
  sessionData: Record<string, unknown>,
  sessionStartTime: unknown,
  sessionEndTime: unknown,
  duration: number
): SessionStats {
  type PRow = {
    userId?: string;
    displayName?: string;
    powerPoints?: number;
    participationCount?: number;
    movesEarned?: number;
    eliminated?: boolean;
  };
  const players = (sessionData.players as PRow[] | undefined) || [];
  const prow = players.find((p) => p?.userId === playerId);
  return {
    playerId,
    playerName: prow?.displayName || 'Player',
    startingPP: typeof prow?.powerPoints === 'number' ? prow.powerPoints : 0,
    endingPP: typeof prow?.powerPoints === 'number' ? prow.powerPoints : 0,
    netPPGained: 0,
    ppSpent: 0,
    ppEarned: 0,
    participationEarned: typeof prow?.participationCount === 'number' ? prow.participationCount : 0,
    movesEarned: typeof prow?.movesEarned === 'number' ? prow.movesEarned : 0,
    eliminations: 0,
    isEliminated: !!prow?.eliminated,
    damageDealt: 0,
    damageTaken: 0,
    healingGiven: 0,
    healingReceived: 0,
    skillsUsed: [],
    totalSkillsUsed: 0,
    sessionId,
    sessionStartTime,
    sessionEndTime,
    sessionDuration: duration,
  };
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
    
    const sessionData = sessionDoc.data() as Record<string, unknown>;
    const existingSummary = sessionData.sessionSummary as SessionSummary | undefined;
    if (sessionData.status === 'ended' && existingSummary) {
      return existingSummary;
    }
    const sessionStartTime = sessionData.startedAt || sessionData.createdAt;
    const rewardPlayerIds = collectLiveEventRewardPlayerIds(sessionData, playerIds);
    const sessionEndTime = serverTimestamp();
    
    // Calculate duration
    let duration = 0;
    if (sessionStartTime) {
      const st = sessionStartTime as { toMillis?: () => number };
      const start = typeof st.toMillis === 'function' ? st.toMillis() : new Date(sessionStartTime as string | number | Date).getTime();
      const end = Date.now();
      duration = Math.floor((end - start) / 1000); // Duration in seconds
    }
    
    // Get all player stats (include roster + co-op participants; synthesize missing stats docs for Power XP)
    const statsMap: { [playerId: string]: SessionStats } = {};

    for (const playerId of rewardPlayerIds) {
      const statsRef = doc(db, 'inSessionRooms', sessionId, 'stats', playerId);
      const statsDoc = await getDoc(statsRef);

      if (statsDoc.exists()) {
        const stats = statsDoc.data() as SessionStats;

        const player = ((sessionData.players || []) as Array<{ userId?: string; powerPoints?: number }>).find(
          (p) => p.userId === playerId
        );
        const endingPP = player?.powerPoints || stats.endingPP || stats.startingPP;

        const netPPGained = endingPP - stats.startingPP;

        const finalizedStats: SessionStats = {
          ...stats,
          endingPP,
          netPPGained,
          sessionEndTime,
          sessionDuration: duration,
        };

        await updateDoc(statsRef, {
          endingPP,
          netPPGained,
          sessionEndTime,
          sessionDuration: duration,
        });

        statsMap[playerId] = finalizedStats;
      } else {
        statsMap[playerId] = buildSyntheticSessionStats(
          playerId,
          sessionId,
          sessionData,
          sessionStartTime,
          sessionEndTime,
          duration
        );
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

    const quizSessionRef = doc(db, 'inSessionRooms', sessionId, 'quizSession', 'current');
    const quizSessionSnap = await getDoc(quizSessionRef);
    let correctByPlayer: Record<string, number> = {};
    let leaderboard: Record<string, number> = {};
    let quizGameMode: string | undefined;
    if (quizSessionSnap.exists()) {
      const qd = quizSessionSnap.data() as {
        correctCount?: Record<string, number>;
        leaderboard?: Record<string, number>;
        gameMode?: string;
      };
      correctByPlayer = { ...(qd.correctCount || {}) };
      leaderboard = { ...(qd.leaderboard || {}) };
      quizGameMode = qd.gameMode;
    }

    const roomPlayersList = (sessionData.players || []) as Array<{ userId: string }>;
    const quizScoreUids = new Set<string>();
    roomPlayersList.forEach((p) => p?.userId && quizScoreUids.add(p.userId));
    Object.keys(leaderboard).forEach((uid) => quizScoreUids.add(uid));
    const sortedByQuizScore = Array.from(quizScoreUids).sort(
      (a, b) => (leaderboard[b] ?? 0) - (leaderboard[a] ?? 0)
    );
    const rankByPlayer: Record<string, number> = {};
    sortedByQuizScore.forEach((uid, idx) => {
      rankByPlayer[uid] = idx + 1;
    });
    const totalRanked = Math.max(1, sortedByQuizScore.length);

    const liveEventPowerGains: Record<string, LiveEventPowerGain> = {};
    const powerAwardPlayerIds = Array.from(new Set([...rewardPlayerIds, ...Object.keys(statsMap)]));
    for (const playerId of powerAwardPlayerIds) {
      const st = statsMap[playerId];
      if (!st) continue;
      const { branch, amount } = computeSessionEndPowerXp({
        liveEventMode: sessionData.liveEventMode as string | undefined,
        stats: st,
        correctAnswers: correctByPlayer[playerId] ?? 0,
        leaderboardScore: leaderboard[playerId] ?? 0,
        rankByScore: rankByPlayer[playerId] ?? totalRanked,
        totalRanked,
        quizPlacementPp: adjustedQuizPpByPlayer[playerId] ?? 0,
        quizGameMode,
      });
      if (amount <= 0) continue;
      const gain: LiveEventPowerGain =
        branch === 'physical'
          ? { physical: amount }
          : branch === 'mental'
            ? { mental: amount }
            : branch === 'emotional'
              ? { emotional: amount }
              : { spiritual: amount };
      await awardLiveEventPowerGain(playerId, gain);
      liveEventPowerGains[playerId] = gain;

      // Power stats use `students.stats.*`; battle pass season XP is separate — credit the same performance there too.
      await awardBattlePassXpForDeployedSeason(playerId, amount);
    }

    for (const playerId of Array.from(new Set(rewardPlayerIds))) {
      try {
        await trackPlayerAction(playerId, 'LIVE_EVENT_SESSION_FINALIZED', 1);
      } catch (e) {
        debugError('inSessionStats', 'LIVE_EVENT_SESSION_FINALIZED trackPlayerAction', e);
      }
    }

    // Sync each player's vault health and shield from session state so Live Event impact persists globally
    const players = (Array.isArray(sessionData.players) ? sessionData.players : []) as Array<{
      userId?: string;
      displayName?: string;
      hp?: number;
      shield?: number;
    }>;
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
        try {
          const snap = await getDoc(statsRef);
          if (snap.exists()) await updateDoc(statsRef, { badges });
        } catch {
          /* synthetic-only roster row: no stats subdoc */
        }
      }
    }
    
    // Determine overall MVP (prioritize eliminations, then PP)
    const mvpPlayerId = mvpEliminationsPlayer || mvpPPPlayer;

    /** Ranks for school leaderboard: only when quiz leaderboard had at least one positive score. */
    let liveEventQuizRankByPlayer: Record<string, number> | undefined;
    if (Object.keys(leaderboard).length > 0) {
      const scores = sortedByQuizScore.map((uid) => leaderboard[uid] ?? 0);
      const maxScore = scores.length > 0 ? Math.max(0, ...scores) : 0;
      if (maxScore > 0) {
        const byPlayer: Record<string, number> = {};
        sortedByQuizScore.forEach((uid, idx) => {
          if (statsMap[uid]) {
            byPlayer[uid] = idx + 1;
          }
        });
        if (Object.keys(byPlayer).length > 0) {
          liveEventQuizRankByPlayer = byPlayer;
        }
      }
    }
    
    // Create session summary (include quiz awards if stored when a quiz completed)
    const summary: SessionSummary = {
      sessionId,
      classId: String(sessionData.classId ?? ''),
      className: String(sessionData.className ?? ''),
      startedAt: sessionStartTime,
      endedAt: sessionEndTime,
      duration,
      totalPlayers: Math.max(rewardPlayerIds.length, Object.keys(statsMap).length),
      stats: statsMap,
      mvpPlayerId,
      liveEventPowerApplied: true,
      ...(Object.keys(liveEventPowerGains).length > 0 && { liveEventPowerGains }),
      ...(sessionData.lastQuizAwardsSnapshot &&
      typeof sessionData.lastQuizAwardsSnapshot === 'object' &&
      sessionData.lastQuizAwardsSnapshot !== null
        ? { quizAwardsSnapshot: sessionData.lastQuizAwardsSnapshot as SessionSummary['quizAwardsSnapshot'] }
        : {}),
      ...(Object.keys(adjustedQuizPpByPlayer).length > 0 && { quizPpByPlayer: adjustedQuizPpByPlayer }),
      ...(liveEventQuizRankByPlayer && { liveEventQuizRankByPlayer })
    };

    // Store summary in session document
    await updateDoc(sessionRef, {
      sessionSummary: summary,
      status: 'ended',
      endedAt: sessionEndTime
    });

    if (liveEventQuizRankByPlayer && Object.keys(liveEventQuizRankByPlayer).length > 0) {
      try {
        await setDoc(
          doc(db, 'liveEventPlacementRollups', sessionId),
          {
            sessionId,
            classId: sessionData.classId ?? '',
            rankByPlayer: liveEventQuizRankByPlayer,
            endedAt: sessionEndTime,
          },
          { merge: true }
        );
      } catch (rollupErr) {
        debugError('inSessionStats', 'Failed to write liveEventPlacementRollups', rollupErr);
      }
    }
    
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



