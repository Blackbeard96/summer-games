/**
 * Skills service for In Session mode
 * Manages skill availability and loadout snapshots
 */

import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Move } from '../types/battle';
import { getUserUnlockedSkillsForBattle } from './battleSkillsService';
import { debug, debugError } from './inSessionDebug';

export interface SessionLoadout {
  manifest: Move[];
  elemental: Move[];
  rrCandy: Move[];
  system: Move[];
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
    // Get all unlocked skills for this user
    const allSkills = await getUserUnlockedSkillsForBattle(userId, userElement);
    
    // Categorize skills
    const manifest = allSkills.filter(s => s.category === 'manifest');
    const elemental = allSkills.filter(s => s.category === 'elemental');
    const rrCandy = allSkills.filter(s => s.id?.startsWith('rr-candy-'));
    const system = allSkills.filter(s => s.category === 'system' && !s.id?.startsWith('rr-candy-') && !s.id?.startsWith('power-card-'));
    
    const loadout: SessionLoadout = {
      manifest,
      elemental,
      rrCandy,
      system,
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
      rrCandy: rrCandy.length,
      system: system.length
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
    // Fallback: get skills directly (no snapshot)
    debug('inSessionSkills', `No loadout found, using direct fetch for ${userId}`);
    return await getUserUnlockedSkillsForBattle(userId, userElement);
  }
  
  // Combine all categories
  return [
    ...loadout.manifest,
    ...loadout.elemental,
    ...loadout.rrCandy,
    ...loadout.system
  ];
}

/**
 * Validate if a skill can be used (PP cost check)
 * Returns { valid: boolean, reason?: string }
 */
export async function validateSkillUsage(
  sessionId: string,
  userId: string,
  skillId: string,
  currentPP: number
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const skills = await getAvailableSkillsForSession(sessionId, userId);
    const skill = skills.find(s => s.id === skillId);
    
    if (!skill) {
      return { valid: false, reason: 'Skill not found in session loadout' };
    }
    
    if (!skill.unlocked) {
      return { valid: false, reason: 'Skill is locked' };
    }
    
    // Check PP cost
    const cost = skill.cost || 0;
    if (currentPP < cost) {
      return { valid: false, reason: `Insufficient PP. Need ${cost}, have ${currentPP}` };
    }
    
    // Check cooldown (if provided)
    if (skill.currentCooldown && skill.currentCooldown > 0) {
      return { valid: false, reason: `Skill is on cooldown (${skill.currentCooldown} turns remaining)` };
    }
    
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

