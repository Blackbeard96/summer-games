/**
 * Canonical Battle Skills Service
 *
 * SINGLE SOURCE OF TRUTH for battle-eligible skills.
 * - Unified 6-skill loadout: battle uses EQUIPPED skills only (manifest, elemental, RR Candy, artifact).
 * - getEquippedSkillsForBattle: returns only equipped skills for battle (max 6).
 * - getUserUnlockedSkillsForBattle: returns all unlocked (for loadout UI / backward compat).
 *
 * Cooldowns are tracked in battle state, NOT in skill library.
 * Returns Move[] for BattleEngine compatibility.
 */

import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Move } from '../types/battle';
import { getUserRRCandySkills } from './rrCandyService';
import { getRRCandyStatusAsync } from './rrCandyUtils';
import { getPlayerSkillState } from './skillStateService';
import { MAX_EQUIPPED_SKILLS } from '../constants/loadout';
import type { ArtifactSkillDefinition } from '../types/artifact';

/** Convert artifact skill definition to Move for battle engine. */
function artifactSkillToMove(skill: ArtifactSkillDefinition, artifactId: string): Move {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    category: 'system',
    type: skill.type || 'attack',
    level: 1,
    cost: skill.cost,
    cooldown: skill.cooldown,
    currentCooldown: 0,
    unlocked: true,
    masteryLevel: 1,
    damage: skill.damage,
    ppSteal: skill.ppSteal,
    healing: skill.healing,
    shieldBoost: skill.shieldBoost,
    debuffType: skill.debuffType as any,
    debuffStrength: skill.debuffStrength,
    buffType: skill.buffType as any,
    buffStrength: skill.buffStrength,
    duration: skill.duration,
    targetType: skill.targetType,
    priority: skill.priority,
  };
}

/** Get artifact skills from equipped artifacts (student data). Exported for Skill Mastery / MovesDisplay. */
export function getArtifactSkillsFromEquipped(studentData: Record<string, any>): Move[] {
  const equipped = studentData?.equippedArtifacts || {};
  const moves: Move[] = [];
  Object.values(equipped).forEach((art: any) => {
    if (!art || typeof art !== 'object' || !art.artifactSkill) return;
    const def = art.artifactSkill as ArtifactSkillDefinition;
    if (!def.id || !def.name) return;
    moves.push(artifactSkillToMove(def, art.id || ''));
  });
  return moves;
}

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

    // Get user's manifest from student data - do NOT default to 'reading'
    const studentRef = doc(db, 'students', userId);
    const studentDoc = await getDoc(studentRef);
    const studentData = studentDoc.exists() ? studentDoc.data() : {};
    
    let userManifest: string | null = null;
    if (studentData.manifest && typeof studentData.manifest === 'object' && studentData.manifest.manifestId) {
      userManifest = studentData.manifest.manifestId;
    } else if (studentData.manifest && typeof studentData.manifest === 'string') {
      userManifest = studentData.manifest;
    }
    
    // If no manifest found, return empty array (don't default to 'reading' moves)
    if (!userManifest) {
      console.warn(`[battleSkillsService] No valid manifest found for user ${userId}, returning empty manifest skills`);
      return allMoves.filter(move => move.category !== 'manifest'); // Only return non-manifest moves
    }

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
        // Pattern matches: rr-candy-{candyType}-{rest}
        // For 'on-off' type: matches 'on-off' before the next part (e.g., 'shields-off')
        const skillCandyMatch = skill.id.match(/^rr-candy-([^-]+(?:-[^-]+)?)-/);
        const skillCandyType = skillCandyMatch ? skillCandyMatch[1] : null;
        // Normalize for comparison
        const normalizedSkillType = skillCandyType?.toLowerCase().replace(/_/g, '-');
        const normalizedUserType = rrCandyType.toLowerCase().replace(/_/g, '-');
        return normalizedSkillType === normalizedUserType;
      });
    }

    // Combine all eligible skills (Manifest + Elemental + RR Candy only)
    // System Skills have been removed - all skills are now one of these three categories
    const battleSkills: Move[] = [
      ...manifestSkills,
      ...elementalSkills,
      ...rrCandySkills
    ];

    // Deduplicate by ID (in case of duplicates)
    const uniqueSkills = new Map<string, Move>();
    battleSkills.forEach(skill => {
      if (!uniqueSkills.has(skill.id)) {
        uniqueSkills.set(skill.id, skill);
      }
    });

    const finalSkills = Array.from(uniqueSkills.values());

    // Sort by category for consistent ordering: Manifest → Elemental → RR Candy
    finalSkills.sort((a, b) => {
      const categoryOrder: { [key: string]: number } = {
        'manifest': 1,
        'elemental': 2
      };
      // RR Candy skills have category='system' but id starts with 'rr-candy-'
      const aIsRRCandy = a.id?.startsWith('rr-candy-');
      const bIsRRCandy = b.id?.startsWith('rr-candy-');
      const aOrder = aIsRRCandy ? 3 : (categoryOrder[a.category] || 4);
      const bOrder = bIsRRCandy ? 3 : (categoryOrder[b.category] || 4);
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
 * Get battle skills with cooldown information (unlocked pool only).
 */
export async function getUserBattleSkillsWithCooldowns(
  userId: string,
  userElement: string | undefined,
  skillCooldowns: Map<string, number>,
  battleMoves?: Move[]
): Promise<Move[]> {
  const skills = await getUserUnlockedSkillsForBattle(userId, userElement, battleMoves);
  return skills.map(skill => ({
    ...skill,
    currentCooldown: skillCooldowns.get(skill.id) || 0
  }));
}

/**
 * Get EQUIPPED skills for battle (unified 6-skill loadout).
 * Only these skills appear in battle. If equippedSkillIds is empty, falls back to first
 * MAX_EQUIPPED_SKILLS of unlocked pool for backward compatibility.
 */
export async function getEquippedSkillsForBattle(
  userId: string,
  userElement?: string,
  battleMoves?: Move[]
): Promise<Move[]> {
  try {
    const [skillState, unlocked, studentDoc] = await Promise.all([
      getPlayerSkillState(userId),
      getUserUnlockedSkillsForBattle(userId, userElement, battleMoves),
      getDoc(doc(db, 'students', userId)),
    ]);
    const studentData = studentDoc.exists() ? studentDoc.data()! : {};
    const equippedIds = skillState.equippedSkillIds || [];
    const artifactMoves = getArtifactSkillsFromEquipped(studentData);

    const byId = new Map<string, Move>();
    unlocked.forEach(m => byId.set(m.id, m));
    artifactMoves.forEach(m => byId.set(m.id, m));

    if (equippedIds.length > 0) {
      const result: Move[] = [];
      const cappedIds = equippedIds.slice(0, MAX_EQUIPPED_SKILLS);
      for (const id of cappedIds) {
        const move = byId.get(id);
        if (move) result.push(move);
      }
      if (process.env.NODE_ENV === 'development') {
        console.log('🎯 getEquippedSkillsForBattle (equipped):', { count: result.length, ids: equippedIds });
      }
      return result;
    }

    const fallback = unlocked.slice(0, MAX_EQUIPPED_SKILLS);
    if (fallback.length > 0) {
      const ids = fallback.map(m => m.id);
      const skillStateRef = doc(db, 'players', userId, 'skill_state', 'main');
      updateDoc(skillStateRef, {
        equippedSkillIds: ids,
        lastUpdated: serverTimestamp(),
        version: 'v1',
      }).catch(() => {});
      if (process.env.NODE_ENV === 'development') {
        console.log('🎯 getEquippedSkillsForBattle (fallback, persisted):', { count: fallback.length, ids });
      }
      return fallback;
    }
    return [];
  } catch (error) {
    console.error('Error getEquippedSkillsForBattle:', error);
    return [];
  }
}




