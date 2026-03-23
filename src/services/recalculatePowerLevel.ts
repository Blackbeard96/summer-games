/**
 * Power Level Recalculation Service
 * 
 * Recalculates and updates a player's power level in Firestore whenever
 * contributing data changes (level, equipped skills/artifacts, ascension).
 */

import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { computePowerLevel } from '../utils/powerLevel';
import { getLevelFromXP } from '../utils/leveling';
import { getPlayerSkillState } from '../utils/skillStateService';
import { normalizeArtifact } from '../utils/artifactUtils';

/**
 * Recalculate and update power level for a player
 * Only writes to Firestore if the computed value differs from stored value
 */
export async function recalculatePowerLevel(playerId: string): Promise<void> {
  try {
    // Read player documents (both students and users collections may have relevant data)
    const [studentDoc, userDoc] = await Promise.all([
      getDoc(doc(db, 'students', playerId)),
      getDoc(doc(db, 'users', playerId))
    ]);
    
    const studentData = studentDoc.exists() ? studentDoc.data() : {};
    const userData = userDoc.exists() ? userDoc.data() : {};
    
    // Merge data (students takes precedence for most fields)
    const playerData = { ...userData, ...studentData };
    
    // Get player level from XP
    const xp = playerData.xp || 0;
    const playerLevel = getLevelFromXP(xp);
    
    // Get equipped skills from skill state
    const skillState = await getPlayerSkillState(playerId);
    const equippedSkillIds = skillState.equippedSkillIds || [];
    
    // Fetch skill documents (skills may be stored in moves/{playerId} or battleMoves/{playerId})
    // Try moves collection first (legacy), then battleMoves
    let equippedSkillDocs: any[] = [];
    
    if (equippedSkillIds.length > 0) {
      // Legacy moves/{userId} is often blocked by rules if not declared — must not fail entire PL recalc
      try {
        const movesDoc = await getDoc(doc(db, 'moves', playerId));
        if (movesDoc.exists()) {
          const moves = movesDoc.data().moves || [];
          equippedSkillDocs = equippedSkillIds
            .map(skillId => moves.find((m: any) => m.id === skillId))
            .filter(Boolean);
        }
      } catch (e) {
        console.warn(
          `[recalculatePowerLevel] Skipping legacy moves/${playerId} read (permission or missing rules):`,
          e
        );
      }

      if (equippedSkillDocs.length === 0) {
        try {
          const battleMovesDoc = await getDoc(doc(db, 'battleMoves', playerId));
          if (battleMovesDoc.exists()) {
            const moves = battleMovesDoc.data().moves || [];
            equippedSkillDocs = equippedSkillIds
              .map(skillId => moves.find((m: any) => m.id === skillId))
              .filter(Boolean);
          }
        } catch (e) {
          console.warn(`[recalculatePowerLevel] battleMoves/${playerId} read failed:`, e);
        }
      }

      equippedSkillDocs = equippedSkillDocs.map(skillDoc => {
        const skillId = skillDoc.id;
        const upgrade = skillState.skillUpgrades?.[skillId];
        return {
          ...skillDoc,
          tier: skillDoc.tier || 1,
          upgradeLevel: upgrade?.level || skillDoc.level || 1,
        };
      });
    }
    
    // Equipped artifacts: merge users + students so an empty {} on one doc doesn't wipe the other
    // (spread merge { ...userData, ...studentData } lets student.equippedArtifacts: {} hide user's slots).
    const eqU = (userData as { equippedArtifacts?: Record<string, unknown> }).equippedArtifacts;
    const eqS = (studentData as { equippedArtifacts?: Record<string, unknown> }).equippedArtifacts;
    const equippedArtifacts: Record<string, unknown> = {
      ...(eqU && typeof eqU === 'object' && !Array.isArray(eqU) ? eqU : {}),
      ...(eqS && typeof eqS === 'object' && !Array.isArray(eqS) ? eqS : {}),
    };
    const inventoryArtifacts = playerData.artifacts;
    const equippedArtifactDocs: any[] = [];

    const findArtifactInInventory = (artifactId: string): any | null => {
      if (!artifactId || inventoryArtifacts == null) return null;
      if (Array.isArray(inventoryArtifacts)) {
        return (
          inventoryArtifacts.find(
            (a: any) => a && typeof a === 'object' && (a.id === artifactId || a.name === artifactId)
          ) || null
        );
      }
      if (typeof inventoryArtifacts !== 'object') return null;
      const direct = (inventoryArtifacts as Record<string, unknown>)[artifactId];
      if (direct && typeof direct === 'object') return direct;
      for (const art of Object.values(inventoryArtifacts)) {
        if (art && typeof art === 'object') {
          const o = art as { id?: string; name?: string };
          if (o.id === artifactId || o.name === artifactId) return art;
        }
      }
      return null;
    };

    Object.values(equippedArtifacts).forEach((equipped: any) => {
      if (!equipped || typeof equipped !== 'object') return;
      const id = equipped.id || equipped.name;
      if (!id) return;

      // Prefer equipped snapshot (what Artifacts page wrote); merge inventory for missing rarity/bonus
      let merged: any = { ...equipped };
      const needsEnrichment =
        merged.rarity == null &&
        (merged.powerLevelBonus == null || merged.powerLevelBonus === undefined);
      if (needsEnrichment) {
        const fromInv = findArtifactInInventory(String(id));
        if (fromInv && typeof fromInv === 'object') {
          merged = { ...fromInv, ...equipped };
        }
      }
      equippedArtifactDocs.push(normalizeArtifact(merged));
    });
    
    // Get manifest ascension level
    // Ascension is typically stored in students/{playerId}.manifest.currentLevel
    // or students/{playerId}.manifestAscensionLevel
    const manifest = playerData.manifest || {};
    let manifestAscensionLevel = playerData.manifestAscensionLevel;
    
    if (!manifestAscensionLevel && manifest.currentLevel) {
      // Convert manifest currentLevel to ascension level (1-4)
      manifestAscensionLevel = Math.min(4, Math.max(1, manifest.currentLevel));
    } else if (!manifestAscensionLevel) {
      manifestAscensionLevel = 1; // Default
    }
    
    // Compute power level
    const result = computePowerLevel({
      playerLevel,
      equippedSkillDocs,
      equippedArtifactDocs,
      manifestAscensionLevel
    });
    
    const currentPowerLevel = playerData.powerLevel;
    const prevArtifacts = playerData.powerBreakdown?.artifacts;
    const breakdownPayload = {
      base: result.breakdown.base,
      skills: result.breakdown.skills,
      artifacts: result.breakdown.artifacts,
      ascension: result.breakdown.ascension,
      total: result.breakdown.total,
    };
    const shouldWrite =
      currentPowerLevel !== result.powerLevel ||
      prevArtifacts !== breakdownPayload.artifacts ||
      playerData.powerBreakdown?.total !== breakdownPayload.total;

    if (shouldWrite) {
      const plPayload = {
        powerLevel: result.powerLevel,
        powerBreakdown: breakdownPayload,
        powerLevelUpdatedAt: serverTimestamp(),
      };

      const studentRef = doc(db, 'students', playerId);
      const userRef = doc(db, 'users', playerId);
      let wroteAny = false;

      if (studentDoc.exists()) {
        try {
          await setDoc(studentRef, plPayload, { merge: true });
          wroteAny = true;
        } catch (e) {
          console.error(`[recalculatePowerLevel] students/${playerId} write failed:`, e);
        }
      }

      if (userDoc.exists()) {
        try {
          await setDoc(userRef, plPayload, { merge: true });
          wroteAny = true;
        } catch (e) {
          console.error(`[recalculatePowerLevel] users/${playerId} write failed:`, e);
        }
      }

      if (wroteAny) {
        console.log(
          `✅ Power level recalculated for ${playerId}: ${currentPowerLevel ?? 'null'} → ${result.powerLevel} (artifacts PL: ${breakdownPayload.artifacts})`
        );
      } else if (studentDoc.exists() || userDoc.exists()) {
        throw new Error(
          'Power level could not be written to students or users (check Firestore rules and auth uid).'
        );
      }
    }
  } catch (error) {
    console.error(`❌ Error recalculating power level for ${playerId}:`, error);
    throw error;
  }
}


