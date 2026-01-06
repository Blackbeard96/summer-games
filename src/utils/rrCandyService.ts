/**
 * Shared RR Candy Skills Service
 * 
 * This is the SINGLE SOURCE OF TRUTH for fetching and managing RR Candy skills.
 * Used by both Profile (Skill Tree Settings) and Skill Mastery.
 * 
 * DATA SOURCE:
 * - Firestore: battleMoves/{uid}/moves[]
 * - Filter: moves with id.startsWith('rr-candy-')
 * - If not found but unlocked, generates using getRRCandyMoves(candyType)
 * 
 * UPGRADE:
 * - Uses upgradeMove() from BattleContext
 * - Cost: 1000 PP base, then exponential multipliers (2x, 4x, 8x, etc.)
 */

import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Move } from '../types/battle';
import { getRRCandyMoves } from './rrCandyMoves';
import { getRRCandyStatus, getRRCandyStatusAsync } from './rrCandyUtils';

/**
 * Get RR Candy skills for a user
 * This matches the exact logic used in Profile → Skill Tree Settings
 * 
 * @param userId - User ID
 * @param battleMoves - Optional: existing moves array from BattleContext (to avoid extra fetch)
 * @returns Array of RR Candy Move objects, or empty array if not unlocked
 */
export async function getUserRRCandySkills(
  userId: string,
  battleMoves?: Move[]
): Promise<Move[]> {
  try {
    // Check unlock status
    const rrCandyStatus = await getRRCandyStatusAsync(userId);
    
    if (!rrCandyStatus.unlocked || !rrCandyStatus.candyType) {
      return [];
    }

    // If battleMoves provided, use them; otherwise fetch from Firestore
    let moves: Move[] = battleMoves || [];
    
    if (moves.length === 0) {
      const movesRef = doc(db, 'battleMoves', userId);
      const movesDoc = await getDoc(movesRef);
      moves = movesDoc.exists() ? (movesDoc.data().moves || []) : [];
    }

    // Filter for RR Candy moves
    let rrCandyMoves = moves.filter((move: Move) => move.id?.startsWith('rr-candy-'));

    // If no moves found but RR Candy is unlocked, generate them and persist to Firestore
    if (rrCandyMoves.length === 0 && rrCandyStatus.unlocked && rrCandyStatus.candyType) {
      const generatedMoves = getRRCandyMoves(rrCandyStatus.candyType);
      
      // Try to find matching moves in existing moves by ID, merge with generated data
      // Use ID matching (names may be outdated like "Vault Hack")
      rrCandyMoves = generatedMoves.map((genMove) => {
        const existingMove = moves.find((m: Move) => 
          m.id === genMove.id
        );
        // If found, merge: use existing move data but update name to canonical name and ensure unlocked
        if (existingMove) {
          return { ...existingMove, name: genMove.name, unlocked: true };
        }
        // Otherwise use generated move
        return genMove;
      });

      // Update existing moves with canonical names and persist to Firestore
      if (rrCandyMoves.length > 0) {
        const movesRef = doc(db, 'battleMoves', userId);
        // Update existing moves with canonical names, or add new moves
        const updatedMoves = moves.map((move: Move) => {
          const matchingGenMove = rrCandyMoves.find(rm => rm.id === move.id);
          if (matchingGenMove) {
            // Update existing RR Candy move with canonical name
            return { ...move, name: matchingGenMove.name, unlocked: true };
          }
          return move;
        });
        
        // Add any new RR Candy moves that don't exist yet
        rrCandyMoves.forEach((rm: Move) => {
          if (!updatedMoves.find((m: Move) => m.id === rm.id)) {
            updatedMoves.push(rm);
          }
        });
        
        try {
          const movesDoc = await getDoc(movesRef);
          if (movesDoc.exists()) {
            await updateDoc(movesRef, { moves: updatedMoves });
            console.log('rrCandyService: Updated RR Candy moves in Firestore with canonical names:', rrCandyMoves.map(m => `${m.id}: ${m.name}`));
          } else {
            await setDoc(movesRef, { moves: updatedMoves });
            console.log('rrCandyService: Created battleMoves doc with RR Candy moves:', rrCandyMoves.map(m => m.name));
          }
        } catch (error) {
          console.error('rrCandyService: Error updating RR Candy moves in Firestore:', error);
          // Continue anyway - return the generated moves even if write fails
        }
      }
    } else if (rrCandyMoves.length > 0) {
      // Update existing RR Candy moves with canonical names and ensure unlocked
      const generatedMoves = rrCandyStatus.candyType ? getRRCandyMoves(rrCandyStatus.candyType) : [];
      const nameMap = new Map(generatedMoves.map(m => [m.id, m.name]));
      
      const needsUpdate = moves.some((move: Move) => {
        if (move.id?.startsWith('rr-candy-')) {
          const canonicalName = nameMap.get(move.id);
          return !move.unlocked || (canonicalName && move.name !== canonicalName);
        }
        return false;
      });
      
      if (needsUpdate) {
        const updatedMoves = moves.map((move: Move) => {
          if (move.id?.startsWith('rr-candy-')) {
            const canonicalName = nameMap.get(move.id);
            return { 
              ...move, 
              unlocked: true,
              name: canonicalName || move.name // Update to canonical name if available
            };
          }
          return move;
        });
        
        const movesRef = doc(db, 'battleMoves', userId);
        try {
          await updateDoc(movesRef, { moves: updatedMoves });
          console.log('rrCandyService: Updated existing RR Candy moves with canonical names in Firestore');
          // Update local array with canonical names
          rrCandyMoves = updatedMoves
            .filter((move: Move) => move.id?.startsWith('rr-candy-'))
            .map((move: Move) => {
              const canonicalName = nameMap.get(move.id);
              return { ...move, name: canonicalName || move.name };
            });
        } catch (error) {
          console.error('rrCandyService: Error updating RR Candy moves:', error);
        }
      } else {
        // Ensure names are canonical even if no update needed
        rrCandyMoves = rrCandyMoves.map((move: Move) => {
          const canonicalName = nameMap.get(move.id);
          return canonicalName ? { ...move, name: canonicalName } : move;
        });
      }
    }

    // Ensure all RR Candy moves are marked as unlocked
    return rrCandyMoves.map(move => ({
      ...move,
      unlocked: true // Force unlock if RR Candy is globally unlocked
    }));
  } catch (error) {
    console.error('Error fetching RR Candy skills:', error);
    return [];
  }
}

/**
 * Check if RR Candy skills are unlocked for a user
 * @param userId - User ID
 * @returns Unlock status and candy type
 */
export async function checkRRCandyUnlock(userId: string): Promise<{
  unlocked: boolean;
  candyType: 'on-off' | 'up-down' | 'config' | null;
}> {
  const status = await getRRCandyStatusAsync(userId);
  return {
    unlocked: status.unlocked,
    candyType: status.candyType
  };
}

