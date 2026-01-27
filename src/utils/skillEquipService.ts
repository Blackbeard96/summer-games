/**
 * Skill Equip/Unequip Service
 * Manages equipping and unequipping skills in player loadout
 */

import { db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { getPlayerSkillState } from './skillStateService';
import { recalculatePowerLevel } from '../services/recalculatePowerLevel';

const SKILL_STATE_VERSION = 'v1';

/**
 * Equip a skill to the player's loadout
 * @param userId - User ID
 * @param skillId - Skill ID to equip
 * @param maxEquipped - Maximum number of equipped skills (default: 3)
 */
export async function equipSkill(userId: string, skillId: string, maxEquipped: number = 3): Promise<boolean> {
  try {
    const skillState = await getPlayerSkillState(userId);
    const currentEquipped = skillState.equippedSkillIds || [];
    
    // Check if already equipped
    if (currentEquipped.includes(skillId)) {
      return true; // Already equipped
    }
    
    // Check if at max capacity
    if (currentEquipped.length >= maxEquipped) {
      throw new Error(`Cannot equip more than ${maxEquipped} skills. Unequip one first.`);
    }
    
    // Add to equipped list
    const updatedEquipped = [...currentEquipped, skillId];
    
    const skillStateRef = doc(db, 'players', userId, 'skill_state', 'main');
    await updateDoc(skillStateRef, {
      equippedSkillIds: updatedEquipped,
      lastUpdated: serverTimestamp(),
      version: SKILL_STATE_VERSION
    });
    
    // Recalculate power level after equip
    try {
      await recalculatePowerLevel(userId);
    } catch (plError) {
      console.error('Error recalculating power level after skill equip:', plError);
      // Don't throw - power level recalculation is non-critical
    }
    
    return true;
  } catch (error) {
    console.error('Error equipping skill:', error);
    throw error;
  }
}

/**
 * Unequip a skill from the player's loadout
 * @param userId - User ID
 * @param skillId - Skill ID to unequip
 */
export async function unequipSkill(userId: string, skillId: string): Promise<boolean> {
  try {
    const skillState = await getPlayerSkillState(userId);
    const currentEquipped = skillState.equippedSkillIds || [];
    
    // Check if not equipped
    if (!currentEquipped.includes(skillId)) {
      return true; // Already unequipped
    }
    
    // Remove from equipped list
    const updatedEquipped = currentEquipped.filter(id => id !== skillId);
    
    const skillStateRef = doc(db, 'players', userId, 'skill_state', 'main');
    await updateDoc(skillStateRef, {
      equippedSkillIds: updatedEquipped,
      lastUpdated: serverTimestamp(),
      version: SKILL_STATE_VERSION
    });
    
    // Recalculate power level after unequip
    try {
      await recalculatePowerLevel(userId);
    } catch (plError) {
      console.error('Error recalculating power level after skill unequip:', plError);
      // Don't throw - power level recalculation is non-critical
    }
    
    return true;
  } catch (error) {
    console.error('Error unequipping skill:', error);
    throw error;
  }
}

/**
 * Update equipped skills array directly (for batch operations)
 * This also triggers power level recalculation
 */
export async function updateEquippedSkills(userId: string, equippedSkillIds: string[]): Promise<void> {
  try {
    const skillStateRef = doc(db, 'players', userId, 'skill_state', 'main');
    await updateDoc(skillStateRef, {
      equippedSkillIds,
      lastUpdated: serverTimestamp(),
      version: SKILL_STATE_VERSION
    });
    
    // Recalculate power level after update
    try {
      await recalculatePowerLevel(userId);
    } catch (plError) {
      console.error('Error recalculating power level after equipped skills update:', plError);
      // Don't throw - power level recalculation is non-critical
    }
  } catch (error) {
    console.error('Error updating equipped skills:', error);
    throw error;
  }
}


