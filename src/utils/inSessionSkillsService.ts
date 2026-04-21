/**
 * Skills service for In Session mode
 * Manages skill availability and loadout snapshots
 */

import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Move } from '../types/battle';
import {
  computeLiveEventParticipationSkillCost,
  logLiveEventSkillCostAttempt,
} from './liveEventSkillCost';
import { getPlayerUniversalLawEffects } from './universalLawBoons';
import { defaultEnergies } from './season1PlayerHydration';
import { resolveSeason1SkillCost } from './season1SkillCost';
import { getEquippedSkillsForBattle } from './battleSkillsService';
import { shouldEnforceTurnSkillCooldownsInLiveSession } from './battleModeSkillRules';
import { debug, debugError } from './inSessionDebug';

export interface SessionLoadout {
  manifest: Move[];
  elemental: Move[];
  rrCandy: Move[];
  artifact?: Move[];
  snapshotAt: any; // Firestore Timestamp
}

/**
 * Get or create session loadout snapshot for a player
 * This ensures consistent skill availability across all clients
 */
export async function getSessionLoadout(
  sessionId: string,
  userId: string,
  userElement?: string
): Promise<SessionLoadout | null> {
  try {
    const loadoutRef = doc(db, 'inSessionRooms', sessionId, 'players', userId);
    const loadoutDoc = await getDoc(loadoutRef);
    
    if (loadoutDoc.exists()) {
      const data = loadoutDoc.data();
      if (data.activeLoadout) {
        debug('inSessionSkills', `Found existing loadout for ${userId}`);
        return data.activeLoadout as SessionLoadout;
      }
    }
    
    // No loadout exists - create one
    debug('inSessionSkills', `Creating new loadout for ${userId}`);
    return await createSessionLoadout(sessionId, userId, userElement);
  } catch (error) {
    debugError('inSessionSkills', `Error getting loadout for ${userId}`, error);
    return null;
  }
}

/**
 * Create a new loadout snapshot for a player
 */
export async function createSessionLoadout(
  sessionId: string,
  userId: string,
  userElement?: string
): Promise<SessionLoadout | null> {
  try {
    // Get EQUIPPED skills for this user (unified 6-skill loadout)
    const allSkills = await getEquippedSkillsForBattle(userId, userElement);
    
    const manifest = allSkills.filter(s => s.category === 'manifest');
    const elemental = allSkills.filter(s => s.category === 'elemental');
    const rrCandy = allSkills.filter(s => s.id?.startsWith('rr-candy-'));
    const artifact = allSkills.filter(s => s.category === 'system' && !s.id?.startsWith('rr-candy-'));
    
    const loadout: SessionLoadout = {
      manifest,
      elemental,
      rrCandy,
      artifact,
      snapshotAt: serverTimestamp()
    };
    
    // Store in player doc
    const playerRef = doc(db, 'inSessionRooms', sessionId, 'players', userId);
    const playerDoc = await getDoc(playerRef);
    
    if (playerDoc.exists()) {
      await updateDoc(playerRef, {
        activeLoadout: loadout
      });
    } else {
      // Player doc doesn't exist yet - will be created on join
      await setDoc(playerRef, {
        activeLoadout: loadout,
        connected: true,
        lastSeenAt: serverTimestamp(),
        joinedAt: serverTimestamp()
      });
    }
    
    debug('inSessionSkills', `Created loadout for ${userId}:`, {
      manifest: manifest.length,
      elemental: elemental.length,
      rrCandy: rrCandy.length
    });
    
    return loadout;
  } catch (error) {
    debugError('inSessionSkills', `Error creating loadout for ${userId}`, error);
    return null;
  }
}

/**
 * Get all available skills for a player in session
 */
export async function getAvailableSkillsForSession(
  sessionId: string,
  userId: string,
  userElement?: string
): Promise<Move[]> {
  const loadout = await getSessionLoadout(sessionId, userId, userElement);
  
  if (!loadout) {
    // Fallback: get equipped skills directly (no snapshot)
    debug('inSessionSkills', `No loadout found, using getEquippedSkillsForBattle for ${userId}`);
    return await getEquippedSkillsForBattle(userId, userElement);
  }
  
  return [
    ...loadout.manifest,
    ...loadout.elemental,
    ...loadout.rrCandy,
    ...(loadout.artifact || [])
  ];
}

/**
 * Validate if a skill can be used (Live Events: Participation Point cost from movesEarned)
 * Returns { valid: boolean, reason?: string }
 */
export async function validateSkillUsage(
  sessionId: string,
  userId: string,
  skillId: string,
  participationPointsAvailable: number,
  equippedArtifacts?: Record<string, unknown> | null,
  season1?: {
    energies?: import('../types/season1').EnergiesMap;
    awakenedFlow?: boolean;
    reductionFromEffects?: number;
  }
): Promise<{ valid: boolean; reason?: string; spendSummary?: string }> {
  try {
    const lawFx = await getPlayerUniversalLawEffects(userId);
    const skills = await getAvailableSkillsForSession(sessionId, userId);
    const skill = skills.find(s => s.id === skillId);
    
    if (!skill) {
      return { valid: false, reason: 'Skill not found in session loadout' };
    }
    
    if (!skill.unlocked) {
      return { valid: false, reason: 'Skill is locked' };
    }

    if (skill.season1Cost) {
      const res = resolveSeason1SkillCost(
        skill,
        participationPointsAvailable,
        season1?.energies ?? defaultEnergies(),
        equippedArtifacts ?? null,
        {
          reductionFromEffects: season1?.reductionFromEffects ?? 0,
          awakenedFlow: season1?.awakenedFlow ?? false,
          universalLawEffects: lawFx,
        }
      );
      if (!res.canUse) {
        logLiveEventSkillCostAttempt({
          actorId: userId,
          skillId: skill.id,
          skillName: skill.name,
          detectedCategory: res.breakdown.category,
          detectedLevel: res.breakdown.elementalMoveTier,
          baseCost: res.breakdown.baseCost,
          reduction: res.breakdown.reductionFromArtifacts + res.breakdown.reductionFromEffects,
          finalCost: res.breakdown.finalCost,
          playerCurrentPP: participationPointsAvailable,
          validationResult: res.reason?.includes('Participation')
            ? 'blocked_insufficient_pp'
            : 'blocked_other',
        });
        return { valid: false, reason: res.reason };
      }
      if (
        shouldEnforceTurnSkillCooldownsInLiveSession() &&
        skill.currentCooldown &&
        skill.currentCooldown > 0
      ) {
        logLiveEventSkillCostAttempt({
          actorId: userId,
          skillId: skill.id,
          skillName: skill.name,
          detectedCategory: res.breakdown.category,
          detectedLevel: res.breakdown.elementalMoveTier,
          baseCost: res.breakdown.baseCost,
          reduction: res.breakdown.reductionFromArtifacts + res.breakdown.reductionFromEffects,
          finalCost: res.breakdown.finalCost,
          playerCurrentPP: participationPointsAvailable,
          validationResult: 'blocked_other',
        });
        return { valid: false, reason: `Skill is on cooldown (${skill.currentCooldown} turns remaining)` };
      }
      logLiveEventSkillCostAttempt({
        actorId: userId,
        skillId: skill.id,
        skillName: skill.name,
        detectedCategory: res.breakdown.category,
        detectedLevel: res.breakdown.elementalMoveTier,
        baseCost: res.breakdown.baseCost,
        reduction: res.breakdown.reductionFromArtifacts + res.breakdown.reductionFromEffects,
        finalCost: res.breakdown.finalCost,
        playerCurrentPP: participationPointsAvailable,
        validationResult: 'ok',
      });
      return { valid: true, spendSummary: res.spendSummary };
    }
    
    const breakdown = computeLiveEventParticipationSkillCost(
      skill,
      equippedArtifacts ?? null,
      null,
      season1?.reductionFromEffects ?? 0,
      lawFx
    );
    if (participationPointsAvailable < breakdown.finalCost) {
      logLiveEventSkillCostAttempt({
        actorId: userId,
        skillId: skill.id,
        skillName: skill.name,
        detectedCategory: breakdown.category,
        detectedLevel: breakdown.elementalMoveTier,
        baseCost: breakdown.baseCost,
        reduction: breakdown.reductionFromArtifacts + breakdown.reductionFromEffects,
        finalCost: breakdown.finalCost,
        playerCurrentPP: participationPointsAvailable,
        validationResult: 'blocked_insufficient_pp',
      });
      return {
        valid: false,
        reason: `Need ${breakdown.finalCost} Participation Points to use this skill (have ${participationPointsAvailable})`,
      };
    }
    
    if (
      shouldEnforceTurnSkillCooldownsInLiveSession() &&
      skill.currentCooldown &&
      skill.currentCooldown > 0
    ) {
      logLiveEventSkillCostAttempt({
        actorId: userId,
        skillId: skill.id,
        skillName: skill.name,
        detectedCategory: breakdown.category,
        detectedLevel: breakdown.elementalMoveTier,
        baseCost: breakdown.baseCost,
        reduction: breakdown.reductionFromArtifacts + breakdown.reductionFromEffects,
        finalCost: breakdown.finalCost,
        playerCurrentPP: participationPointsAvailable,
        validationResult: 'blocked_other',
      });
      return { valid: false, reason: `Skill is on cooldown (${skill.currentCooldown} turns remaining)` };
    }
    
    logLiveEventSkillCostAttempt({
      actorId: userId,
      skillId: skill.id,
      skillName: skill.name,
      detectedCategory: breakdown.category,
      detectedLevel: breakdown.elementalMoveTier,
      baseCost: breakdown.baseCost,
      reduction: breakdown.reductionFromArtifacts + breakdown.reductionFromEffects,
      finalCost: breakdown.finalCost,
      playerCurrentPP: participationPointsAvailable,
      validationResult: 'ok',
    });
    return { valid: true };
  } catch (error) {
    debugError('inSessionSkills', `Error validating skill usage for ${userId}`, error);
    return { valid: false, reason: 'Error validating skill' };
  }
}

/**
 * Refresh loadout snapshot (useful when skills are upgraded)
 */
export async function refreshSessionLoadout(
  sessionId: string,
  userId: string,
  userElement?: string
): Promise<SessionLoadout | null> {
  debug('inSessionSkills', `Refreshing loadout for ${userId}`);
  
  // Delete existing loadout
  const playerRef = doc(db, 'inSessionRooms', sessionId, 'players', userId);
  const playerDoc = await getDoc(playerRef);
  
  if (playerDoc.exists()) {
    await updateDoc(playerRef, {
      activeLoadout: null
    });
  }
  
  // Create new loadout
  return await createSessionLoadout(sessionId, userId, userElement);
}

