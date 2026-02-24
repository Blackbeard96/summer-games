import { db } from '../firebase';
import {
  collection,
  doc,
  addDoc,
  getDoc,
  deleteDoc,
  setDoc,
  query,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  getDocs,
  where,
  Timestamp
} from 'firebase/firestore';
import { getLevelFromXP } from '../utils/leveling';

export interface LiveFeedPost {
  id: string;
  type: 'post' | 'milestone';
  createdAt: Timestamp;
  createdBy: {
    uid: string;
    displayName: string;
    photoURL?: string | null;
    role?: string;
    level?: number;
  };
  text: string;
  milestone?: {
    kind: string;
    refId?: string;
    meta?: any;
  };
  visibility: 'global';
  reactionsCount?: { [emoji: string]: number };
  eventKey?: string; // For deduplication
}

export interface Reaction {
  uid: string;
  displayName: string;
  emojis: string[];
  updatedAt: Timestamp;
}

/**
 * Create a user post in the global live feed
 */
export async function createPost(
  userId: string,
  userDisplayName: string,
  userPhotoURL: string | undefined,
  userRole: string | undefined,
  userLevel: number | undefined,
  text: string
): Promise<string> {
  if (!text.trim() || text.length > 240) {
    throw new Error('Post text must be between 1 and 240 characters');
  }

  const postsRef = collection(db, 'liveFeedPosts');
  
  const postData = {
    type: 'post' as const,
    text: text.trim(),
    createdBy: {
      uid: userId,
      displayName: userDisplayName,
      photoURL: userPhotoURL || null,
      role: userRole || null,
      level: userLevel || null
    },
    visibility: 'global' as const,
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(postsRef, postData);
  return docRef.id;
}

/**
 * Toggle a reaction on a post
 * If user already reacted with this emoji, remove it; otherwise add it
 */
export async function toggleReaction(
  postId: string,
  userId: string,
  userDisplayName: string,
  emoji: string
): Promise<void> {
  const reactionRef = doc(db, 'liveFeedPosts', postId, 'reactions', userId);
  const postRef = doc(db, 'liveFeedPosts', postId);

  // Get current reaction
  const reactionDoc = await getDoc(reactionRef);
  const currentEmojis = reactionDoc.exists() ? (reactionDoc.data().emojis || []) : [];
  
  // Toggle emoji
  const hasEmoji = currentEmojis.includes(emoji);
  const newEmojis = hasEmoji
    ? currentEmojis.filter((e: string) => e !== emoji)
    : [...currentEmojis, emoji];

  // Update or create reaction doc
  await setDoc(reactionRef, {
    uid: userId,
    displayName: userDisplayName,
    emojis: newEmojis,
    updatedAt: serverTimestamp()
  }, { merge: true });

  // Update cached reaction count on post (optional optimization)
  // This is best-effort; actual counts should be computed from reactions subcollection
  const postDoc = await getDoc(postRef);
  if (postDoc.exists()) {
    const currentCounts = postDoc.data().reactionsCount || {};
    const currentCount = currentCounts[emoji] || 0;
    const newCount = hasEmoji ? Math.max(0, currentCount - 1) : currentCount + 1;
    
    await setDoc(postRef, {
      reactionsCount: {
        ...currentCounts,
        [emoji]: newCount
      }
    }, { merge: true });
  }
}

/**
 * Delete a post (only by owner)
 */
export async function deletePost(postId: string, userId: string): Promise<void> {
  const postRef = doc(db, 'liveFeedPosts', postId);
  const postDoc = await getDoc(postRef);
  
  if (!postDoc.exists()) {
    throw new Error('Post not found');
  }

  const postData = postDoc.data();
  if (postData.type === 'milestone') {
    throw new Error('Cannot delete milestone posts');
  }

  if (postData.createdBy.uid !== userId) {
    throw new Error('You can only delete your own posts');
  }

  // Delete all reactions first
  const reactionsRef = collection(db, 'liveFeedPosts', postId, 'reactions');
  const reactionsSnapshot = await getDocs(reactionsRef);
  const deletePromises = reactionsSnapshot.docs.map(doc => deleteDoc(doc.ref));
  await Promise.all(deletePromises);

  // Delete post
  await deleteDoc(postRef);
}

/**
 * Create a milestone event in the live feed
 * Uses eventKey or deterministic docId to prevent duplicates
 */
export async function createLiveFeedMilestone(
  userId: string,
  userDisplayName: string,
  userPhotoURL: string | undefined,
  userRole: string | undefined,
  userLevel: number | undefined,
  kind: string,
  meta: any,
  refId?: string
): Promise<string | null> {
  // Generate eventKey for deduplication
  const eventKey = refId ? `${userId}_${kind}_${refId}` : `${userId}_${kind}_${Date.now()}`;
  
  // Check if this milestone already exists
  const postsRef = collection(db, 'liveFeedPosts');
  const existingQuery = query(
    postsRef,
    where('eventKey', '==', eventKey),
    where('type', '==', 'milestone')
  );
  const existingSnapshot = await getDocs(existingQuery);
  
  if (!existingSnapshot.empty) {
    // Milestone already exists, skip creation
    console.log(`[LiveFeed] Milestone already exists: ${eventKey}`);
    return null;
  }

  // Generate text based on kind
  let text = '';
  switch (kind) {
    case 'mission_accept':
      text = `${userDisplayName} accepted mission: ${meta.missionTitle || 'Unknown Mission'}`;
      break;
    case 'mission_complete':
      text = `${userDisplayName} completed mission: ${meta.missionTitle || 'Unknown Mission'}`;
      break;
    case 'chapter_complete':
      text = `${userDisplayName} completed ${meta.chapterId || 'a chapter'}!`;
      break;
    case 'challenge_complete':
      text = `Completed Daily Challenge: ${meta.challengeTitle || 'Challenge'}`;
      break;
    case 'level_up':
      text = `Leveled up to Level ${meta.newLevel || userLevel || '?'}`;
      break;
    case 'badge_earned':
      text = `Earned badge: ${meta.badgeName || 'Badge'}`;
      break;
    case 'vault_upgrade':
      text = `Upgraded ${meta.upgradeType || 'Vault'} to Level ${meta.upgradeLevel || '?'}`;
      break;
    case 'battle_win':
      text = `Won a battle in ${meta.modeName || 'Battle Arena'}`;
      break;
    case 'raid_complete':
      text = `Completed Island Raid`;
      break;
    case 'vault_attack':
      text = meta.targetName 
        ? `⚔️ Attacked ${meta.targetName}'s vault and stole ${meta.ppStolen || 0} PP`
        : `⚔️ Attacked an enemy vault`;
      break;
    case 'vault_defense':
      text = meta.attackerName
        ? `🛡️ Defended against ${meta.attackerName}'s attack`
        : `🛡️ Successfully defended vault`;
      break;
    case 'battle_win':
      text = meta.opponentName
        ? `🏆 Defeated ${meta.opponentName} in battle`
        : `🏆 Won a battle`;
      break;
    case 'pvp_win':
      text = meta.opponentName
        ? `⚔️ Defeated ${meta.opponentName} in PvP`
        : `⚔️ Won a PvP battle`;
      break;
    case 'chapter_complete':
      text = meta.chapterName
        ? `📖 Completed ${meta.chapterName}`
        : `📖 Completed a chapter`;
      break;
    default:
      text = `Achieved milestone: ${kind}`;
  }

  // Use deterministic docId for milestones with refId to prevent duplicates
  const docId = refId ? eventKey : undefined;
  
  const milestoneData = {
    type: 'milestone' as const,
    text,
    createdBy: {
      uid: userId,
      displayName: userDisplayName,
      photoURL: userPhotoURL || null,
      role: userRole || null,
      level: userLevel || null
    },
    milestone: {
      kind,
      refId: refId || null,
      meta: meta || {}
    },
    visibility: 'global' as const,
    eventKey,
    createdAt: serverTimestamp()
  };

  if (docId) {
    // Use deterministic docId
    const milestoneRef = doc(db, 'liveFeedPosts', docId);
    const existingDoc = await getDoc(milestoneRef);
    if (existingDoc.exists()) {
      console.log(`[LiveFeed] Milestone doc already exists: ${docId}`);
      return null;
    }
    await setDoc(milestoneRef, milestoneData);
    return docId;
  } else {
    // Use auto-generated docId
    const docRef = await addDoc(postsRef, milestoneData);
    return docRef.id;
  }
}

/**
 * Get reaction counts for a post by querying the reactions subcollection
 */
export async function getReactionCounts(postId: string): Promise<{ [emoji: string]: number }> {
  const reactionsRef = collection(db, 'liveFeedPosts', postId, 'reactions');
  const reactionsSnapshot = await getDocs(reactionsRef);
  
  const counts: { [emoji: string]: number } = {};
  reactionsSnapshot.forEach((doc) => {
    const data = doc.data();
    const emojis = data.emojis || [];
    emojis.forEach((emoji: string) => {
      counts[emoji] = (counts[emoji] || 0) + 1;
    });
  });
  
  return counts;
}

/**
 * Get user's reactions for a post
 */
export async function getUserReactions(postId: string, userId: string): Promise<string[]> {
  const reactionRef = doc(db, 'liveFeedPosts', postId, 'reactions', userId);
  const reactionDoc = await getDoc(reactionRef);
  
  if (!reactionDoc.exists()) {
    return [];
  }
  
  return reactionDoc.data().emojis || [];
}

