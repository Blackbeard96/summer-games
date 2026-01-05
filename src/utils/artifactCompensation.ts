/**
 * Admin Artifact Compensation Service
 * 
 * Allows admins to grant artifacts to players to compensate for errors
 */

import { 
  doc, 
  getDoc, 
  runTransaction, 
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';

// Artifact lookup - expanded list for compensation
const ARTIFACT_LOOKUP: Record<string, { name: string; description: string; icon: string; image: string; category: string; rarity: string }> = {
  'captains-helmet': {
    name: "Captain's Helmet",
    description: "A legendary helmet that boosts manifest move damage by 5%",
    icon: '⛑️',
    image: '/images/Captains Helmet.png',
    category: 'armor',
    rarity: 'rare'
  },
  'captain-helmet': {
    name: "Captain's Helmet",
    description: "A legendary helmet that boosts manifest move damage by 5%",
    icon: '⛑️',
    image: '/images/Captains Helmet.png',
    category: 'armor',
    rarity: 'rare'
  },
  'elemental-ring': {
    name: "Elemental Ring",
    description: "A ring that enhances elemental move damage",
    icon: '💍',
    image: '/images/Elemental Ring.png',
    category: 'accessory',
    rarity: 'common'
  },
  'rr_candy': {
    name: "RR Candy",
    description: "A special candy with mysterious properties",
    icon: '🍬',
    image: '/images/RR Candy.png',
    category: 'consumable',
    rarity: 'rare'
  }
};

// Normalize artifact IDs
function normalizeArtifactId(artifactId: string): string {
  if (artifactId === 'captain-helmet' || artifactId === 'captains-helmet') {
    return 'captains-helmet';
  }
  return artifactId;
}

export interface ArtifactGrantResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Grant an artifact to a player (admin-only compensation)
 * 
 * @param userId - User ID of the player
 * @param artifactId - Artifact ID to grant
 * @param adminId - Admin user ID (for logging)
 * @param reason - Reason for granting (optional)
 * @returns Result object with success status
 */
export async function grantArtifactToPlayer(
  userId: string,
  artifactId: string,
  adminId: string,
  reason?: string
): Promise<ArtifactGrantResult> {
  console.log(`🎁 grantArtifactToPlayer: Granting artifact ${artifactId} to user ${userId} by admin ${adminId}`, { reason });

  try {
    // Normalize artifact ID
    const normalizedId = normalizeArtifactId(artifactId);
    
    // Get artifact details
    const artifactDetails = ARTIFACT_LOOKUP[normalizedId] || ARTIFACT_LOOKUP[artifactId] || {
      name: artifactId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      description: `Artifact: ${artifactId}`,
      icon: '🎁',
      image: '',
      category: 'special',
      rarity: 'common'
    };

    const result = await runTransaction(db, async (transaction) => {
      // Read current user state
      const userRef = doc(db, 'users', userId);
      const studentRef = doc(db, 'students', userId);

      const [userDoc, studentDoc] = await Promise.all([
        transaction.get(userRef),
        transaction.get(studentRef)
      ]);

      if (!userDoc.exists() && !studentDoc.exists()) {
        throw new Error(`User documents not found for ${userId}`);
      }

      const userData = userDoc.exists() ? userDoc.data() : {};
      const studentData = studentDoc.exists() ? studentDoc.data() : {};

      // Prepare artifact updates
      const currentStudentArtifacts = studentData.artifacts || {};
      const updatedStudentArtifacts = { ...currentStudentArtifacts };
      
      const currentUserArtifacts = Array.isArray(userData.artifacts) ? userData.artifacts : [];
      const newUserArtifacts: any[] = [];

      // Check if artifact already exists
      const existingInStudent = updatedStudentArtifacts[normalizedId] === true;
      const existingInUser = currentUserArtifacts.find((art: any) => 
        (typeof art === 'string' && (art === normalizedId || art === artifactId)) ||
        (typeof art === 'object' && (art.id === normalizedId || art.id === artifactId || art.name === artifactDetails.name))
      );

      if (existingInStudent || existingInUser) {
        console.log(`⚠️ grantArtifactToPlayer: Artifact ${normalizedId} already exists for user ${userId}`);
        // Still update metadata but don't duplicate
      }

      // Update students collection (object format)
      updatedStudentArtifacts[normalizedId] = true;
      
      updatedStudentArtifacts[`${normalizedId}_purchase`] = {
        id: normalizedId,
        name: artifactDetails.name,
        description: artifactDetails.description,
        icon: artifactDetails.icon,
        image: artifactDetails.image,
        category: artifactDetails.category,
        rarity: artifactDetails.rarity,
        obtainedAt: Timestamp.now(),
        fromAdmin: true,
        adminId: adminId,
        reason: reason || 'Compensation',
        grantedAt: Timestamp.now()
      };

      // Update users collection (array format)
      if (!existingInUser) {
        newUserArtifacts.push({
          id: normalizedId,
          name: artifactDetails.name,
          description: artifactDetails.description,
          price: 0,
          icon: artifactDetails.icon,
          image: artifactDetails.image,
          category: artifactDetails.category,
          rarity: artifactDetails.rarity,
          purchasedAt: new Date(),
          used: false,
          fromAdmin: true,
          adminId: adminId,
          reason: reason || 'Compensation',
          grantedAt: new Date()
        });
      }

      const updatedUserArtifacts = [...currentUserArtifacts, ...newUserArtifacts];

      console.log(`🎁 grantArtifactToPlayer: Transaction - Preparing updates:`, {
        artifactId: normalizedId,
        artifactName: artifactDetails.name,
        alreadyExists: existingInStudent || existingInUser,
        newArtifactsCount: newUserArtifacts.length
      });

      // Update all documents atomically
      if (userDoc.exists()) {
        const userUpdates: any = {};
        
        if (newUserArtifacts.length > 0) {
          userUpdates.artifacts = updatedUserArtifacts;
        }
        
        if (Object.keys(userUpdates).length > 0) {
          transaction.update(userRef, userUpdates);
        }
      }

      if (studentDoc.exists()) {
        const studentUpdates: any = {};
        
        if (Object.keys(updatedStudentArtifacts).length > 0) {
          studentUpdates.artifacts = updatedStudentArtifacts;
        }
        
        if (Object.keys(studentUpdates).length > 0) {
          transaction.update(studentRef, studentUpdates);
        }
      }

      console.log(`✅ grantArtifactToPlayer: Transaction committed successfully`);

      return {
        success: true,
        message: existingInStudent || existingInUser 
          ? `Artifact "${artifactDetails.name}" already exists for this player, but metadata was updated.`
          : `Artifact "${artifactDetails.name}" granted successfully to player.`
      };
    });

    // Verify the artifact was actually applied (post-transaction check)
    if (result.success) {
      try {
        const [verifyUserDoc, verifyStudentDoc] = await Promise.all([
          getDoc(doc(db, 'users', userId)),
          getDoc(doc(db, 'students', userId))
        ]);
        
        const verifyUserData = verifyUserDoc.exists() ? verifyUserDoc.data() : {};
        const verifyStudentData = verifyStudentDoc.exists() ? verifyStudentDoc.data() : {};
        
        const verifyUserArtifacts = Array.isArray(verifyUserData.artifacts) ? verifyUserData.artifacts : [];
        const verifyStudentArtifacts = verifyStudentData.artifacts || {};
        
        const inUser = verifyUserArtifacts.some((a: any) => 
          (typeof a === 'string' && a === normalizedId) ||
          (typeof a === 'object' && (a.id === normalizedId || a.name === artifactDetails.name))
        );
        const inStudent = verifyStudentArtifacts[normalizedId] === true;
        
        if (inUser || inStudent) {
          console.log(`✅ grantArtifactToPlayer: Artifact verified in post-transaction check`);
        } else {
          console.warn(`⚠️ grantArtifactToPlayer: Artifact not found in post-transaction check`);
        }
      } catch (verifyError) {
        console.error(`⚠️ grantArtifactToPlayer: Error during post-transaction verification:`, verifyError);
      }
    }

    console.log(`✅ grantArtifactToPlayer: Completed for user ${userId}:`, result);
    return result;

  } catch (error: any) {
    console.error(`❌ grantArtifactToPlayer: Error granting artifact to user ${userId}:`, error);
    return {
      success: false,
      message: `Failed to grant artifact: ${error.message || 'Unknown error'}`,
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Get list of available artifacts
 */
export function getAvailableArtifacts(): Array<{ id: string; name: string; description: string; icon: string; image: string; category: string; rarity: string }> {
  return Object.entries(ARTIFACT_LOOKUP).map(([id, details]) => ({
    id,
    ...details
  }));
}

