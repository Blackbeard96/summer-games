import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Move } from '../types/battle';
import { Skill, moveToSkill, skillToMove } from '../types/skill';
import { getRRCandyMoves } from './rrCandyMoves';

/**
 * Fetch all skills for a user, aggregating from:
 * - Manifest skills (from moves collection)
 * - Element skills (from moves collection, filtered by elementalAffinity)
 * - RR Candy skills (from moves collection, filtered by category='system' and RR Candy IDs)
 */
export async function fetchUserSkills(userId: string): Promise<Skill[]> {
  try {
    // Fetch moves from Firestore (backward compatibility - still using "moves" collection)
    const movesRef = doc(db, 'moves', userId);
    const movesDoc = await getDoc(movesRef);
    
    const moves: Move[] = movesDoc.exists() ? (movesDoc.data().moves || []) : [];
    
    // Convert moves to skills, determining source type
    const skills: Skill[] = moves.map(move => {
      // Determine source type based on move properties
      let sourceType: 'manifest' | 'element' | 'rrCandy' = 'manifest';
      let sourceId: string | undefined;
      
      if (move.category === 'elemental' && move.elementalAffinity) {
        sourceType = 'element';
        sourceId = move.elementalAffinity;
      } else if (move.category === 'system' && move.id?.includes('rr-candy')) {
        sourceType = 'rrCandy';
        // Extract candy type from ID (e.g., 'rr-candy-on-off-shields-off' -> 'on-off')
        const candyMatch = move.id.match(/rr-candy-([^-]+)/);
        sourceId = candyMatch ? candyMatch[1] : undefined;
      } else if (move.manifestType) {
        sourceType = 'manifest';
        sourceId = move.manifestType;
      }
      
      return moveToSkill(move, sourceType, sourceId);
    });
    
    return skills;
  } catch (error) {
    console.error('Error fetching user skills:', error);
    return [];
  }
}

/**
 * Update a skill's level (upgrade)
 * This updates the underlying move in Firestore
 */
export async function updateSkillLevel(userId: string, skillId: string, newLevel: number): Promise<void> {
  try {
    const movesRef = doc(db, 'moves', userId);
    const movesDoc = await getDoc(movesRef);
    
    if (!movesDoc.exists()) {
      throw new Error('User moves document not found');
    }
    
    const moves: Move[] = movesDoc.data().moves || [];
    const updatedMoves = moves.map(move => {
      if (move.id === skillId) {
        return { ...move, level: newLevel };
      }
      return move;
    });
    
    await updateDoc(movesRef, { moves: updatedMoves });
  } catch (error) {
    console.error('Error updating skill level:', error);
    throw error;
  }
}

/**
 * Update a skill's mastery level
 * This updates the underlying move in Firestore
 */
export async function updateSkillMastery(userId: string, skillId: string, newMasteryLevel: number): Promise<void> {
  try {
    const movesRef = doc(db, 'moves', userId);
    const movesDoc = await getDoc(movesRef);
    
    if (!movesDoc.exists()) {
      throw new Error('User moves document not found');
    }
    
    const moves: Move[] = movesDoc.data().moves || [];
    const updatedMoves = moves.map(move => {
      if (move.id === skillId) {
        return { ...move, masteryLevel: newMasteryLevel };
      }
      return move;
    });
    
    await updateDoc(movesRef, { moves: updatedMoves });
  } catch (error) {
    console.error('Error updating skill mastery:', error);
    throw error;
  }
}

/**
 * Get RR Candy skills for a user based on their candy choice
 */
export async function getRRCandySkillsForUser(userId: string): Promise<Skill[]> {
  try {
    // Check user's chapter progress for RR Candy choice
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return [];
    }
    
    const userData = userDoc.data();
    const chapters = userData.chapters || {};
    const chapter2 = chapters[2] || {};
    const challenges = chapter2.challenges || {};
    const challenge = challenges['ep2-its-all-a-game'] || {};
    
    if (!challenge.isCompleted || !challenge.candyChoice) {
      return [];
    }
    
    const candyType = challenge.candyChoice as 'on-off' | 'up-down' | 'config';
    const rrCandyMoves = getRRCandyMoves(candyType);
    
    // Convert to skills
    return rrCandyMoves.map(move => moveToSkill(move, 'rrCandy', candyType));
  } catch (error) {
    console.error('Error fetching RR Candy skills:', error);
    return [];
  }
}

/**
 * Get element skills for a user based on their elemental affinity
 */
export async function getElementSkillsForUser(userId: string, elementAffinity?: string): Promise<Skill[]> {
  try {
    // If element affinity not provided, fetch from user data
    if (!elementAffinity) {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        return [];
      }
      
      const userData = userDoc.data();
      elementAffinity = userData.elementalAffinity || userData.style;
    }
    
    if (!elementAffinity) {
      return [];
    }
    
    // Fetch moves and filter for element skills
    const skills = await fetchUserSkills(userId);
    return skills.filter(skill => skill.sourceType === 'element' && skill.sourceId === elementAffinity);
  } catch (error) {
    console.error('Error fetching element skills:', error);
    return [];
  }
}




