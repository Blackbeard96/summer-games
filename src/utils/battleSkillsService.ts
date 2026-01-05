/**
 * Canonical Battle Skills Service
 * 
 * SINGLE SOURCE OF TRUTH for battle-eligible skills.
 * Used by BattleEngine, battle UIs, and skill selection components.
 * 
 * This service ensures ALL unlocked skills are available in battle:
 * - Manifest Skills (unlocked)
 * - Elemental Affinity Skills (unlocked + matches player element)
 * - RR Candy Skills (unlocked + matches housed candy)
 * 
 * IMPORTANT:
 * - Cooldowns are tracked in battle state, NOT in skill library
 * - Skills are filtered by unlock status, element match, and candy type match
 * - Returns Move[] format for backward compatibility with BattleEngine
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Move } from '../types/battle';
import { getUserRRCandySkills } from './rrCandyService';
import { getRRCandyStatusAsync } from './rrCandyUtils';

/**
 * Get all unlocked skills eligible for battle
 * 
 * This is the CANONICAL function used by:
 * - BattleEngine (for move selection and execution)
 * - Battle UI components (for displaying available skills)
 * - Multiplayer battle validation
 * 
 * @param userId - User ID
 * @param userElement - User's elemental affinity (e.g., 'fire', 'water')
 * @param battleMoves - Optional: existing moves array from BattleContext (to avoid extra fetch)
 * @returns Array of unlocked Move objects eligible for battle
 */
export async function getUserUnlockedSkillsForBattle(
  userId: string,
  userElement?: string,
  battleMoves?: Move[]
): Promise<Move[]> {
  try {
    // Fetch moves from Firestore if not provided
    let allMoves: Move[] = battleMoves || [];
    
    if (allMoves.length === 0) {
      const movesRef = doc(db, 'battleMoves', userId);
      const movesDoc = await getDoc(movesRef);
      allMoves = movesDoc.exists() ? (movesDoc.data().moves || []) : [];
    }

    // Get user's RR Candy status
    const rrCandyStatus = await getRRCandyStatusAsync(userId);
    const rrCandyUnlocked = rrCandyStatus.unlocked;
    const rrCandyType = rrCandyStatus.candyType;

    // Get user's manifest from student data
    const studentRef = doc(db, 'students', userId);
    const studentDoc = await getDoc(studentRef);
    const studentData = studentDoc.exists() ? studentDoc.data() : {};
    const userManifest = studentData.manifest?.manifestId || studentData.manifestationType || 'reading';

    // Get user's element if not provided
    const element = userElement || studentData.elementalAffinity || '';

    // Filter Manifest Skills
    const manifestSkills = allMoves.filter(move => {
      if (move.category !== 'manifest') return false;
      if (!move.unlocked) return false;
      // Only include moves that match user's manifest
      if (move.manifestType && move.manifestType !== userManifest) return false;
      return true;
    });

    // Filter Elemental Skills
    const elementalSkills = allMoves.filter(move => {
      if (move.category !== 'elemental') return false;
      if (!move.unlocked) return false;
      // Only include moves that match user's element
      if (move.elementalAffinity && move.elementalAffinity !== element) return false;
      return true;
    });

    // Get RR Candy Skills (using shared service)
    let rrCandySkills: Move[] = [];
    if (rrCandyUnlocked && rrCandyType) {
      rrCandySkills = await getUserRRCandySkills(userId, allMoves);
      // Filter to only include skills for the user's candy type
      rrCandySkills = rrCandySkills.filter(skill => {
        // Extract candy type from skill ID (e.g., 'rr-candy-on-off-shields-off' -> 'on-off')
        const skillCandyMatch = skill.id.match(/rr-candy-([^-]+)/);
        const skillCandyType = skillCandyMatch ? skillCandyMatch[1] : null;
        // Normalize for comparison
        const normalizedSkillType = skillCandyType?.toLowerCase().replace(/_/g, '-');
        const normalizedUserType = rrCandyType.toLowerCase().replace(/_/g, '-');
        return normalizedSkillType === normalizedUserType;
      });
    }

    // Filter System Skills (basic/utility skills, but exclude RR Candy and Power Card)
    const systemSkills = allMoves.filter(move => {
      if (move.category !== 'system') return false;
      if (!move.unlocked) return false;
      // Exclude RR Candy skills (handled separately)
      if (move.id?.startsWith('rr-candy-')) return false;
      // Exclude Power Card skills (custom moves)
      if (move.id?.startsWith('power-card-')) return false;
      return true;
    });

    // Combine all eligible skills
    const battleSkills: Move[] = [
      ...manifestSkills,
      ...elementalSkills,
      ...rrCandySkills,
      ...systemSkills
    ];

    // Deduplicate by ID (in case of duplicates)
    const uniqueSkills = new Map<string, Move>();
    battleSkills.forEach(skill => {
      if (!uniqueSkills.has(skill.id)) {
        uniqueSkills.set(skill.id, skill);
      }
    });

    const finalSkills = Array.from(uniqueSkills.values());

    // Sort by category for consistent ordering: Manifest → Element → RR Candy → System
    finalSkills.sort((a, b) => {
      const categoryOrder: { [key: string]: number } = {
        'manifest': 1,
        'elemental': 2,
        'system': 3
      };
      const aOrder = categoryOrder[a.category] || 4;
      const bOrder = categoryOrder[b.category] || 4;
      if (aOrder !== bOrder) return aOrder - bOrder;
      
      // Within same category, sort by name
      return a.name.localeCompare(b.name);
    });

    // DEV-ONLY: Log battle skills breakdown
    if (process.env.NODE_ENV === 'development') {
      console.log('🎯 getUserUnlockedSkillsForBattle:', {
        userId,
        userElement: element,
        userManifest,
        rrCandyUnlocked,
        rrCandyType,
        counts: {
          manifest: manifestSkills.length,
          elemental: elementalSkills.length,
          rrCandy: rrCandySkills.length,
          system: systemSkills.length,
          total: finalSkills.length
        },
        skillIds: finalSkills.map(s => s.id),
        skillNames: finalSkills.map(s => s.name)
      });
    }

    return finalSkills;
  } catch (error) {
    console.error('Error fetching battle skills:', error);
    return [];
  }
}

/**
 * Get battle skills with cooldown information
 * This is a helper that combines getUserUnlockedSkillsForBattle with cooldown tracking
 * 
 * @param userId - User ID
 * @param userElement - User's elemental affinity
 * @param skillCooldowns - Map of skillId -> turnsRemaining cooldown
 * @param battleMoves - Optional: existing moves array
 * @returns Array of skills with currentCooldown set from cooldown map
 */
export async function getUserBattleSkillsWithCooldowns(
  userId: string,
  userElement: string | undefined,
  skillCooldowns: Map<string, number>,
  battleMoves?: Move[]
): Promise<Move[]> {
  const skills = await getUserUnlockedSkillsForBattle(userId, userElement, battleMoves);
  
  // Apply cooldowns from battle state
  return skills.map(skill => ({
    ...skill,
    currentCooldown: skillCooldowns.get(skill.id) || 0
  }));
}




