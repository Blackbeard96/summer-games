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
      
      // Try to find matching moves in existing moves by name/id, merge with generated data
      rrCandyMoves = generatedMoves.map((genMove) => {
        const existingMove = moves.find((m: Move) => 
          m.name === genMove.name || m.id === genMove.id
        );
        // If found, merge: use existing move data but ensure unlocked is true
        if (existingMove) {
          return { ...existingMove, unlocked: true };
        }
        // Otherwise use generated move
        return genMove;
      });

      // Persist generated moves to Firestore if they don't exist
      if (rrCandyMoves.length > 0) {
        const movesRef = doc(db, 'battleMoves', userId);
        const updatedMoves = [...moves, ...rrCandyMoves];
        
        try {
          const movesDoc = await getDoc(movesRef);
          if (movesDoc.exists()) {
            await updateDoc(movesRef, { moves: updatedMoves });
            console.log('rrCandyService: Added RR Candy moves to Firestore:', rrCandyMoves.map(m => m.name));
          } else {
            await setDoc(movesRef, { moves: updatedMoves });
            console.log('rrCandyService: Created battleMoves doc with RR Candy moves:', rrCandyMoves.map(m => m.name));
          }
        } catch (error) {
          console.error('rrCandyService: Error persisting RR Candy moves to Firestore:', error);
          // Continue anyway - return the generated moves even if write fails
        }
      }
    } else if (rrCandyMoves.length > 0) {
      // Ensure existing RR Candy moves are unlocked and persist if needed
      const needsUpdate = rrCandyMoves.some(move => !move.unlocked);
      if (needsUpdate) {
        const updatedMoves = moves.map((move: Move) => {
          if (move.id?.startsWith('rr-candy-') && !move.unlocked) {
            return { ...move, unlocked: true };
          }
          return move;
        });
        
        const movesRef = doc(db, 'battleMoves', userId);
        try {
          await updateDoc(movesRef, { moves: updatedMoves });
          console.log('rrCandyService: Unlocked existing RR Candy moves in Firestore');
          // Update local array
          rrCandyMoves = updatedMoves.filter((move: Move) => move.id?.startsWith('rr-candy-'));
        } catch (error) {
          console.error('rrCandyService: Error unlocking RR Candy moves:', error);
        }
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

