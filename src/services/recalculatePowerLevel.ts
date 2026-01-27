/**
 * Power Level Recalculation Service
 * 
 * Recalculates and updates a player's power level in Firestore whenever
 * contributing data changes (level, equipped skills/artifacts, ascension).
 */

import { db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp, getDocs, collection, query, where } from 'firebase/firestore';
import { computePowerLevel } from '../utils/powerLevel';
import { getLevelFromXP } from '../utils/leveling';
import { getPlayerSkillState } from '../utils/skillStateService';

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
      // Try moves collection (legacy format)
      const movesRef = doc(db, 'moves', playerId);
      const movesDoc = await getDoc(movesRef);
      
      if (movesDoc.exists()) {
        const moves = movesDoc.data().moves || [];
        // Match equipped skill IDs with moves
        equippedSkillDocs = equippedSkillIds
          .map(skillId => moves.find((m: any) => m.id === skillId))
          .filter(Boolean);
      }
      
      // If not found in moves, try battleMoves collection
      if (equippedSkillDocs.length === 0) {
        const battleMovesRef = doc(db, 'battleMoves', playerId);
        const battleMovesDoc = await getDoc(battleMovesRef);
        
        if (battleMovesDoc.exists()) {
          const moves = battleMovesDoc.data().moves || [];
          equippedSkillDocs = equippedSkillIds
            .map(skillId => moves.find((m: any) => m.id === skillId))
            .filter(Boolean);
        }
      }
      
      // Enrich skill docs with upgrade levels from skillState
      equippedSkillDocs = equippedSkillDocs.map(skillDoc => {
        const skillId = skillDoc.id;
        const upgrade = skillState.skillUpgrades?.[skillId];
        
        return {
          ...skillDoc,
          tier: skillDoc.tier || 1, // Default tier if missing
          upgradeLevel: upgrade?.level || skillDoc.level || 1
        };
      });
    }
    
    // Get equipped artifacts from students collection
    const equippedArtifacts = playerData.equippedArtifacts || {};
    const equippedArtifactDocs: any[] = [];
    
    // Extract artifact IDs from equipped slots (weapon, armor, catalyst, utility)
    const artifactIds = Object.values(equippedArtifacts)
      .filter((artifact: any) => artifact && typeof artifact === 'object' && artifact.id)
      .map((artifact: any) => artifact.id);
    
    if (artifactIds.length > 0) {
      // Artifacts are stored in students/{playerId}.artifacts (object or array)
      const artifacts = playerData.artifacts || {};
      
      // Handle both object and array formats
      if (Array.isArray(artifacts)) {
        // Array format: find artifacts by ID
        artifactIds.forEach(artifactId => {
          const artifact = artifacts.find((a: any) => a.id === artifactId || a.name === artifactId);
          if (artifact) {
            equippedArtifactDocs.push(artifact);
          }
        });
      } else {
        // Object format: artifacts stored by key
        artifactIds.forEach(artifactId => {
          // Try direct key match
          const artifact = artifacts[artifactId];
          if (artifact) {
            equippedArtifactDocs.push(artifact);
          } else {
            // Try finding by id property in nested objects
            Object.values(artifacts).forEach((art: any) => {
              if (art && typeof art === 'object' && (art.id === artifactId || art.name === artifactId)) {
                equippedArtifactDocs.push(art);
              }
            });
          }
        });
      }
    }
    
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
    
    // Only update if power level changed
    const currentPowerLevel = playerData.powerLevel;
    
    if (currentPowerLevel !== result.powerLevel) {
      // Update students collection (primary storage)
      const studentRef = doc(db, 'students', playerId);
      
      await updateDoc(studentRef, {
        powerLevel: result.powerLevel,
        powerBreakdown: result.breakdown,
        powerLevelUpdatedAt: serverTimestamp()
      });
      
      // Also update users collection if it exists (keep in sync)
      if (userDoc.exists()) {
        const userRef = doc(db, 'users', playerId);
        await updateDoc(userRef, {
          powerLevel: result.powerLevel,
          powerBreakdown: result.breakdown,
          powerLevelUpdatedAt: serverTimestamp()
        });
      }
      
      console.log(`✅ Power level recalculated for ${playerId}: ${currentPowerLevel || 'null'} → ${result.powerLevel}`);
    }
  } catch (error) {
    console.error(`❌ Error recalculating power level for ${playerId}:`, error);
    throw error;
  }
}


