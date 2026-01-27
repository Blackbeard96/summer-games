/**
 * Skill State Service
 * Manages player skill state in Firestore (unlocked nodes, etc.)
 */

import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, collection, serverTimestamp } from 'firebase/firestore';
import { PlayerSkillState } from '../types/skillSystem';
import { getStarterNodes } from '../data/skillTreeDefinition';
import { recalculatePowerLevel } from '../services/recalculatePowerLevel';

const SKILL_STATE_VERSION = 'v1';

/**
 * Get player skill state from Firestore
 * If state doesn't exist, initializes with starter nodes
 */
export async function getPlayerSkillState(userId: string): Promise<PlayerSkillState> {
  try {
    const skillStateRef = doc(db, 'players', userId, 'skill_state', 'main');
    const skillStateDoc = await getDoc(skillStateRef);
    
    if (skillStateDoc.exists()) {
      return skillStateDoc.data() as PlayerSkillState;
    }
    
    // Initialize with starter nodes
    const initialState: PlayerSkillState = {
      unlockedNodeIds: getStarterNodes(),
      equippedSkillIds: [],
      skillUpgrades: {},
      version: SKILL_STATE_VERSION,
      lastUpdated: serverTimestamp() as any
    };
    
    // Save initial state
    await setDoc(skillStateRef, initialState);
    
    return initialState;
  } catch (error) {
    console.error('Error getting player skill state:', error);
    // Return default state on error
    return {
      unlockedNodeIds: getStarterNodes(),
      equippedSkillIds: [],
      skillUpgrades: {},
      version: SKILL_STATE_VERSION
    };
  }
}

/**
 * Unlock a skill node
 * Validates dependencies before unlocking
 */
export async function unlockSkillNode(
  userId: string,
  nodeId: string,
  currentUnlockedNodeIds: string[]
): Promise<boolean> {
  try {
    // Check if already unlocked
    if (currentUnlockedNodeIds.includes(nodeId)) {
      return true; // Already unlocked
    }
    
    const skillStateRef = doc(db, 'players', userId, 'skill_state', 'main');
    
    // Add to unlocked nodes
    const updatedUnlockedNodes = [...currentUnlockedNodeIds, nodeId];
    
    await updateDoc(skillStateRef, {
      unlockedNodeIds: updatedUnlockedNodes,
      lastUpdated: serverTimestamp(),
      version: SKILL_STATE_VERSION
    });
    
    return true;
  } catch (error) {
    console.error('Error unlocking skill node:', error);
    return false;
  }
}

/**
 * Check if a node can be unlocked (dependencies met)
 */
export function canUnlockNode(
  nodeId: string,
  unlockedNodeIds: string[],
  nodeRequires: string[]
): boolean {
  // If already unlocked, can't unlock again
  if (unlockedNodeIds.includes(nodeId)) {
    return false;
  }
  
  // Check if all required nodes are unlocked
  const allRequirementsMet = nodeRequires.every(reqNodeId => 
    unlockedNodeIds.includes(reqNodeId)
  );
  
  return allRequirementsMet;
}

/**
 * Get unlocked skills from node IDs
 */
export function getUnlockedSkillIds(
  unlockedNodeIds: string[],
  nodes: { id: string; skillId: string }[]
): string[] {
  const skillIds = new Set<string>();
  
  unlockedNodeIds.forEach(nodeId => {
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      skillIds.add(node.skillId);
    }
  });
  
  return Array.from(skillIds);
}

