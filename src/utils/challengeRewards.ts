/**
 * Centralized Challenge Reward Granting Service
 * 
 * Provides atomic, idempotent reward granting for all challenges.
 * Ensures PP, XP, and artifacts are always granted correctly.
 */

import { 
  doc, 
  getDoc, 
  updateDoc, 
  runTransaction, 
  increment, 
  serverTimestamp,
  Timestamp,
  arrayUnion
} from 'firebase/firestore';
import { db } from '../firebase';
import { ChallengeReward } from '../types/chapters';

export interface RewardGrantResult {
  success: boolean;
  alreadyClaimed: boolean;
  rewardsGranted: {
    xp: number;
    pp: number;
    artifacts: string[];
    truthMetal: number;
  };
  error?: string;
}

/**
 * Artifact lookup for artifact metadata
 */
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
  }
};

// Normalize artifact IDs (handle both 'captains-helmet' and 'captain-helmet')
function normalizeArtifactId(artifactId: string): string {
  if (artifactId === 'captain-helmet' || artifactId === 'captains-helmet') {
    return 'captains-helmet'; // Use consistent ID
  }
  return artifactId;
}

/**
 * Grant challenge rewards atomically and idempotently
 * 
 * @param userId - User ID
 * @param challengeId - Challenge ID (e.g., 'ch2-team-trial')
 * @param rewards - Array of reward definitions from challenge config
 * @param challengeTitle - Optional challenge title for logging
 * @returns Result object with success status and granted rewards
 */
export async function grantChallengeRewards(
  userId: string,
  challengeId: string,
  rewards: ChallengeReward[],
  challengeTitle?: string
): Promise<RewardGrantResult> {
  console.log(`🎁 grantChallengeRewards: Starting for user ${userId}, challenge ${challengeId}`, {
    challengeTitle,
    rewardsCount: rewards.length,
    rewards: rewards.map(r => ({ type: r.type, value: r.value }))
  });

  try {
    // Parse rewards - filter to only process supported reward types
    const supportedRewards = rewards.filter(r => 
      r.type === 'xp' || 
      r.type === 'pp' || 
      r.type === 'artifact' || 
      r.type === 'ability' ||
      r.type === 'team' ||
      r.type === 'rival' ||
      r.type === 'truthMetal'
    );
    
    const xpReward = supportedRewards.find(r => r.type === 'xp')?.value as number || 0;
    const ppReward = supportedRewards.find(r => r.type === 'pp')?.value as number || 0;
    const truthMetalReward = supportedRewards.find(r => r.type === 'truthMetal')?.value as number || 0;
    const artifactRewards = supportedRewards.filter(r => r.type === 'artifact');
    const artifactIds = artifactRewards.map(r => String(r.value));
    
    // Log unsupported reward types (for future implementation)
    const unsupportedRewards = rewards.filter(r => 
      r.type !== 'xp' && 
      r.type !== 'pp' && 
      r.type !== 'artifact' && 
      r.type !== 'ability' &&
      r.type !== 'team' &&
      r.type !== 'rival' &&
      r.type !== 'truthMetal'
    );
    if (unsupportedRewards.length > 0) {
      console.log(`🎁 grantChallengeRewards: Skipping unsupported reward types:`, unsupportedRewards.map(r => r.type));
    }

    console.log(`🎁 grantChallengeRewards: Parsed rewards:`, {
      xpReward,
      ppReward,
      truthMetalReward,
      artifactIds
    });

    // Validate reward payload
    if (xpReward < 0 || ppReward < 0 || truthMetalReward < 0) {
      throw new Error(`Invalid reward values: XP=${xpReward}, PP=${ppReward}, TruthMetal=${truthMetalReward}`);
    }

    if (xpReward === 0 && ppReward === 0 && truthMetalReward === 0 && artifactIds.length === 0) {
      console.log(`🎁 grantChallengeRewards: No rewards to grant for challenge ${challengeId}`);
      return {
        success: true,
        alreadyClaimed: false,
        rewardsGranted: { xp: 0, pp: 0, artifacts: [], truthMetal: 0 }
      };
    }

    // Use transaction for atomicity and idempotency
    console.log(`🎁 grantChallengeRewards: Starting transaction for challenge ${challengeId}`);
    
    const result = await runTransaction(db, async (transaction) => {
      // Check if rewards were already claimed (idempotency check)
      const claimRef = doc(db, 'users', userId, 'rewardClaims', challengeId);
      const claimDoc = await transaction.get(claimRef);

        if (claimDoc.exists()) {
          const claimData = claimDoc.data();
          if (claimData.claimed === true) {
            console.log(`🎁 grantChallengeRewards: Rewards already claimed for challenge ${challengeId}`);
            const snapshot = claimData.rewardsSnapshot || { xp: 0, pp: 0, artifacts: [], truthMetal: 0 };
            return {
              success: true,
              alreadyClaimed: true,
              rewardsGranted: {
                xp: snapshot.xp || 0,
                pp: snapshot.pp || 0,
                artifacts: snapshot.artifacts || [],
                truthMetal: snapshot.truthMetal || 0
              }
            };
          }
        }

      // Read current user state
      const userRef = doc(db, 'users', userId);
      const studentRef = doc(db, 'students', userId);
      const vaultRef = doc(db, 'vaults', userId);

      const [userDoc, studentDoc, vaultDoc] = await Promise.all([
        transaction.get(userRef),
        transaction.get(studentRef),
        transaction.get(vaultRef)
      ]);

      if (!userDoc.exists() && !studentDoc.exists()) {
        throw new Error(`User documents not found for ${userId}`);
      }

      const userData = userDoc.exists() ? userDoc.data() : {};
      const studentData = studentDoc.exists() ? studentDoc.data() : {};
      const vaultData = vaultDoc.exists() ? vaultDoc.data() : {};

      // Get current values
      const currentUserPP = userData.powerPoints || studentData.powerPoints || 0;
      const currentUserXP = userData.xp || studentData.xp || 0;
      const currentUserTruthMetal = userData.truthMetal || studentData.truthMetal || 0;
      const currentVaultPP = vaultData.currentPP || currentUserPP;
      const vaultCapacity = vaultData.capacity || 1000;

      // Calculate new values
      const newUserPP = currentUserPP + ppReward;
      const newUserXP = currentUserXP + xpReward;
      const newUserTruthMetal = currentUserTruthMetal + truthMetalReward;
      const newVaultPP = Math.min(vaultCapacity, currentVaultPP + ppReward);

      // Prepare artifact updates
      const currentStudentArtifacts = studentData.artifacts || {};
      const updatedStudentArtifacts = { ...currentStudentArtifacts };
      
      const currentUserArtifacts = Array.isArray(userData.artifacts) ? userData.artifacts : [];
      const newUserArtifacts: any[] = [];

      // Grant each artifact
      artifactIds.forEach(artifactId => {
        // Normalize artifact ID
        const normalizedId = normalizeArtifactId(artifactId);
        
        console.log(`🎁 grantChallengeRewards: Processing artifact ${artifactId} (normalized: ${normalizedId})`);
        
        // Update students collection (object format)
        updatedStudentArtifacts[normalizedId] = true;
        
        // Store artifact metadata
        const artifactDetails = ARTIFACT_LOOKUP[normalizedId] || ARTIFACT_LOOKUP[artifactId] || {
          name: artifactId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          description: `Artifact: ${artifactId}`,
          icon: '🎁',
          image: '',
          category: 'special',
          rarity: 'common'
        };

        updatedStudentArtifacts[`${normalizedId}_purchase`] = {
          id: normalizedId,
          name: artifactDetails.name,
          description: artifactDetails.description,
          icon: artifactDetails.icon,
          image: artifactDetails.image,
          category: artifactDetails.category,
          rarity: artifactDetails.rarity,
          obtainedAt: Timestamp.now(),
          fromChallenge: challengeId
        };

        // Update users collection (array format)
        // Check if artifact already exists
        const existingArtifact = currentUserArtifacts.find((art: any) => 
          (typeof art === 'string' && (art === normalizedId || art === artifactId)) ||
          (typeof art === 'object' && (art.id === normalizedId || art.id === artifactId || art.name === artifactDetails.name))
        );

        if (!existingArtifact) {
          console.log(`🎁 grantChallengeRewards: Adding new artifact to users collection: ${normalizedId}`);
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
            fromChallenge: challengeId
          });
        } else {
          console.log(`🎁 grantChallengeRewards: Artifact ${normalizedId} already exists in users collection, skipping`);
        }
      });

      const updatedUserArtifacts = [...currentUserArtifacts, ...newUserArtifacts];

      console.log(`🎁 grantChallengeRewards: Transaction - Preparing updates:`, {
        currentUserPP,
        newUserPP,
        currentUserXP,
        newUserXP,
        currentVaultPP,
        newVaultPP,
        artifactsToGrant: artifactIds,
        newArtifactsCount: newUserArtifacts.length
      });

      // Update all documents atomically
      if (userDoc.exists()) {
        const userUpdates: any = {
          powerPoints: increment(ppReward),
          xp: increment(xpReward)
        };
        
        if (truthMetalReward > 0) {
          userUpdates.truthMetal = increment(truthMetalReward);
        }
        
        if (newUserArtifacts.length > 0) {
          userUpdates.artifacts = updatedUserArtifacts;
          console.log(`🎁 grantChallengeRewards: Updating users collection with ${newUserArtifacts.length} new artifacts:`, newUserArtifacts.map(a => a.id || a));
        }
        
        console.log(`🎁 grantChallengeRewards: Updating users document:`, {
          ppIncrement: ppReward,
          xpIncrement: xpReward,
          truthMetalIncrement: truthMetalReward,
          artifactsCount: updatedUserArtifacts.length
        });
        
        transaction.update(userRef, userUpdates);
      } else {
        console.warn(`⚠️ grantChallengeRewards: User document does not exist for ${userId}`);
      }

      if (studentDoc.exists()) {
        const studentUpdates: any = {
          powerPoints: increment(ppReward),
          xp: increment(xpReward)
        };
        
        if (truthMetalReward > 0) {
          studentUpdates.truthMetal = increment(truthMetalReward);
        }
        
        if (Object.keys(updatedStudentArtifacts).length > 0) {
          studentUpdates.artifacts = updatedStudentArtifacts;
          console.log(`🎁 grantChallengeRewards: Updating students collection with artifacts:`, Object.keys(updatedStudentArtifacts).filter(k => !k.endsWith('_purchase')));
        }
        
        console.log(`🎁 grantChallengeRewards: Updating students document:`, {
          ppIncrement: ppReward,
          xpIncrement: xpReward,
          truthMetalIncrement: truthMetalReward,
          artifactsCount: Object.keys(updatedStudentArtifacts).filter(k => !k.endsWith('_purchase')).length
        });
        
        transaction.update(studentRef, studentUpdates);
      } else {
        console.warn(`⚠️ grantChallengeRewards: Student document does not exist for ${userId}`);
      }

      if (vaultDoc.exists() && ppReward > 0) {
        transaction.update(vaultRef, {
          currentPP: newVaultPP
        });
      }

      // Create claim record (idempotency)
      const rewardsSnapshot = {
        xp: xpReward,
        pp: ppReward,
        artifacts: artifactIds,
        truthMetal: truthMetalReward
      };

      transaction.set(claimRef, {
        claimed: true,
        claimedAt: serverTimestamp(),
        challengeId,
        challengeTitle: challengeTitle || challengeId,
        rewardsSnapshot,
        userId
      }, { merge: true });

      console.log(`✅ grantChallengeRewards: Transaction committed successfully`);

      return {
        success: true,
        alreadyClaimed: false,
        rewardsGranted: rewardsSnapshot
      };
    });

    // Verify the rewards were actually applied (post-transaction check)
    if (result.success && !result.alreadyClaimed) {
      try {
        const [verifyUserDoc, verifyStudentDoc] = await Promise.all([
          getDoc(doc(db, 'users', userId)),
          getDoc(doc(db, 'students', userId))
        ]);
        
        const verifyUserData = verifyUserDoc.exists() ? verifyUserDoc.data() : {};
        const verifyStudentData = verifyStudentDoc.exists() ? verifyStudentDoc.data() : {};
        
        const verifyUserArtifacts = Array.isArray(verifyUserData.artifacts) ? verifyUserData.artifacts : [];
        const verifyStudentArtifacts = verifyStudentData.artifacts || {};
        
        console.log(`🔍 grantChallengeRewards: Post-transaction verification:`, {
          userPP: verifyUserData.powerPoints,
          userXP: verifyUserData.xp,
          userArtifactsCount: verifyUserArtifacts.length,
          userArtifacts: verifyUserArtifacts.map((a: any) => typeof a === 'string' ? a : (a.id || a.name)),
          studentPP: verifyStudentData.powerPoints,
          studentXP: verifyStudentData.xp,
          studentArtifacts: Object.keys(verifyStudentArtifacts).filter(k => !k.endsWith('_purchase')),
          expectedArtifacts: artifactIds
        });
        
        // Check if artifacts were actually added
        const missingArtifacts = artifactIds.filter(artifactId => {
          const normalizedId = normalizeArtifactId(artifactId);
          const inUser = verifyUserArtifacts.some((a: any) => 
            (typeof a === 'string' && a === normalizedId) ||
            (typeof a === 'object' && (a.id === normalizedId || a.name?.includes('Captain')))
          );
          const inStudent = verifyStudentArtifacts[normalizedId] === true;
          return !inUser && !inStudent;
        });
        
        if (missingArtifacts.length > 0) {
          console.error(`❌ grantChallengeRewards: Artifacts not found after transaction:`, missingArtifacts);
        } else {
          console.log(`✅ grantChallengeRewards: All artifacts verified in post-transaction check`);
        }
      } catch (verifyError) {
        console.error(`⚠️ grantChallengeRewards: Error during post-transaction verification:`, verifyError);
      }
    }

    // PP Anomaly Detection (dev-only logging)
    // Warn if user gains >100 PP in <5 minutes from challenges (potential farming)
    if (result.success && !result.alreadyClaimed && ppReward > 0) {
      try {
        const claimRef = doc(db, 'users', userId, 'rewardClaims', challengeId);
        const claimDoc = await getDoc(claimRef);
        
        if (claimDoc.exists()) {
          const claimData = claimDoc.data();
          const claimedAt = claimData.claimedAt?.toDate?.() || new Date();
          const now = new Date();
          const timeDiff = (now.getTime() - claimedAt.getTime()) / 1000 / 60; // minutes
          
          // Check recent reward claims in the last 5 minutes
          // This is a simple check - in production, you'd want to query all recent claims
          // For now, we log a warning if this single reward is >100 PP
          if (ppReward > 100) {
            console.warn(`⚠️ PP ANOMALY DETECTED: User ${userId} gained ${ppReward} PP from challenge ${challengeId}`, {
              userId,
              challengeId,
              challengeTitle,
              ppReward,
              timestamp: claimedAt.toISOString(),
              warning: 'Large PP reward detected - verify this is legitimate'
            });
          }
          
          // Log all PP rewards for monitoring (dev-only)
          if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
            console.log(`📊 PP Reward Log: User ${userId} gained ${ppReward} PP from ${challengeId} at ${claimedAt.toISOString()}`);
          }
        }
      } catch (anomalyError) {
        // Don't fail reward granting if anomaly detection fails
        console.warn(`⚠️ Error in PP anomaly detection:`, anomalyError);
      }
    }

    console.log(`✅ grantChallengeRewards: Completed for challenge ${challengeId}:`, result);
    return result;

  } catch (error: any) {
    console.error(`❌ grantChallengeRewards: Error granting rewards for challenge ${challengeId}:`, error);
    return {
      success: false,
      alreadyClaimed: false,
      rewardsGranted: { xp: 0, pp: 0, artifacts: [], truthMetal: 0 },
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Check if rewards have already been claimed for a challenge
 * 
 * @param userId - User ID
 * @param challengeId - Challenge ID
 * @returns True if rewards were already claimed
 */
export async function areRewardsClaimed(
  userId: string,
  challengeId: string
): Promise<boolean> {
  try {
    const claimRef = doc(db, 'users', userId, 'rewardClaims', challengeId);
    const claimDoc = await getDoc(claimRef);
    
    if (claimDoc.exists()) {
      const claimData = claimDoc.data();
      return claimData.claimed === true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error checking reward claim status:`, error);
    return false;
  }
}

/**
 * Get reward claim details for a challenge
 * 
 * @param userId - User ID
 * @param challengeId - Challenge ID
 * @returns Claim data or null if not claimed
 */
export async function getRewardClaim(
  userId: string,
  challengeId: string
): Promise<{ claimed: boolean; claimedAt: any; rewardsSnapshot: any } | null> {
  try {
    const claimRef = doc(db, 'users', userId, 'rewardClaims', challengeId);
    const claimDoc = await getDoc(claimRef);
    
    if (claimDoc.exists()) {
      const data = claimDoc.data();
      return {
        claimed: data.claimed || false,
        claimedAt: data.claimedAt,
        rewardsSnapshot: data.rewardsSnapshot || { xp: 0, pp: 0, artifacts: [] }
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Error getting reward claim:`, error);
    return null;
  }
}

