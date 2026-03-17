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

    // Canonical On/Off RR Candy ids (Shield OFF / Shield ON — shut down or turn off shields)
    const ON_OFF_CANONICAL_IDS = ['rr-candy-on-off-shields-off', 'rr-candy-on-off-shields-on'];

    // Migrate legacy RR Candy moves (e.g. wrong id or old "Vault Hack" name) to canonical On/Off skills
    if (rrCandyStatus.candyType === 'on-off' && rrCandyMoves.length > 0) {
      const hasLegacyIds = rrCandyMoves.some((m: Move) => !ON_OFF_CANONICAL_IDS.includes(m.id || ''));
      const hasWrongNames = rrCandyMoves.some((m: Move) => m.name === 'Vault Hack');
      if (hasLegacyIds || hasWrongNames) {
        const canonical = getRRCandyMoves('on-off');
        const migrated = canonical.map((canon, idx) => {
          const existing = rrCandyMoves[idx];
          return {
            ...canon,
            ...(existing && {
              level: existing.level ?? canon.level,
              masteryLevel: existing.masteryLevel ?? canon.masteryLevel,
              cost: existing.cost ?? canon.cost,
              cooldown: existing.cooldown ?? canon.cooldown,
              debuffStrength: existing.debuffStrength ?? canon.debuffStrength,
              shieldBoost: existing.shieldBoost ?? canon.shieldBoost
            })
          } as Move;
        });
        rrCandyMoves = migrated;
        const movesRef = doc(db, 'battleMoves', userId);
        const otherMoves = moves.filter((m: Move) => !m.id?.startsWith('rr-candy-'));
        const updatedMoves = [...otherMoves, ...rrCandyMoves];
        try {
          await updateDoc(movesRef, { moves: updatedMoves });
          console.log('rrCandyService: Migrated legacy RR Candy to On/Off skills:', rrCandyMoves.map(m => m.name));
        } catch (e) {
          console.error('rrCandyService: Migration write failed', e);
        }
      }
    }

    // Legacy: On/Off RR Candy stored as "Vault Hack" / "Shield Restoration" without rr-candy- ids — replace with canonical Shield OFF / Shield ON
    if (rrCandyStatus.candyType === 'on-off' && rrCandyMoves.length === 0) {
      const legacyCandy = moves.filter((m: Move) =>
        m.category === 'system' && (m.name === 'Vault Hack' || m.name === 'Shield Restoration')
      );
      if (legacyCandy.length >= 1) {
        const canonical = getRRCandyMoves('on-off');
        const migrated = canonical.map((canon, idx) => {
          const existing = legacyCandy[idx];
          return {
            ...canon,
            ...(existing && {
              level: existing.level ?? canon.level,
              masteryLevel: existing.masteryLevel ?? canon.masteryLevel,
              cost: existing.cost ?? canon.cost,
              cooldown: existing.cooldown ?? canon.cooldown,
              debuffStrength: existing.debuffStrength ?? canon.debuffStrength,
              shieldBoost: existing.shieldBoost ?? canon.shieldBoost
            })
          } as Move;
        });
        rrCandyMoves = migrated;
        const movesRef = doc(db, 'battleMoves', userId);
        const otherMoves = moves.filter((m: Move) =>
          !(m.category === 'system' && (m.name === 'Vault Hack' || m.name === 'Shield Restoration'))
        );
        const updatedMoves = [...otherMoves, ...rrCandyMoves];
        try {
          await updateDoc(movesRef, { moves: updatedMoves });
          console.log('rrCandyService: Replaced legacy Vault Hack/Shield Restoration with Shield OFF / Shield ON');
        } catch (e) {
          console.error('rrCandyService: Legacy replacement write failed', e);
        }
      }
    }

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
      const canonicalById = new Map(generatedMoves.map(m => [m.id, m]));

      const needsUpdate = moves.some((move: Move) => {
        if (move.id?.startsWith('rr-candy-')) {
          const canon = canonicalById.get(move.id);
          return !move.unlocked || (canon && (move.name !== canon.name || move.description !== canon.description));
        }
        return false;
      });
      
      if (needsUpdate) {
        const updatedMoves = moves.map((move: Move) => {
          if (move.id?.startsWith('rr-candy-')) {
            const canon = canonicalById.get(move.id);
            return canon
              ? { ...move, unlocked: true, name: canon.name, description: canon.description }
              : { ...move, unlocked: true };
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
              const canon = canonicalById.get(move.id);
              return canon ? { ...move, name: canon.name, description: canon.description } : move;
            });
        } catch (error) {
          console.error('rrCandyService: Error updating RR Candy moves:', error);
        }
      } else {
        // Ensure names are canonical even if no update needed
        rrCandyMoves = rrCandyMoves.map((move: Move) => {
          const canon = canonicalById.get(move.id);
          return canon ? { ...move, name: canon.name, description: canon.description } : move;
        });
      }
    }

    // Always apply canonical name and description (On/Off: Shield OFF, Shield ON)
    const canonicalMoves = getRRCandyMoves(rrCandyStatus.candyType!);
    const canonicalById = new Map(canonicalMoves.map(m => [m.id, m]));

    return rrCandyMoves.map(move => {
      const canon = canonicalById.get(move.id);
      return {
        ...move,
        unlocked: true,
        ...(canon && { name: canon.name, description: canon.description })
      };
    });
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

