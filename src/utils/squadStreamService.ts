import { db } from '../firebase';
import {
  collection,
  doc,
  addDoc,
  getDoc,
  runTransaction,
  serverTimestamp,
  updateDoc,
  increment,
  arrayUnion
} from 'firebase/firestore';

/**
 * Get today's date key (YYYY-MM-DD) in America/New_York timezone
 */
export function getDateKey(): string {
  const now = new Date();
  const nyTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const year = nyTime.getFullYear();
  const month = String(nyTime.getMonth() + 1).padStart(2, '0');
  const day = String(nyTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Send a chat message to the squad stream
 */
export async function sendChatMessage(
  squadId: string,
  senderId: string,
  senderName: string,
  senderAvatarUrl: string | undefined,
  text: string
): Promise<void> {
  const messagesRef = collection(db, 'squads', squadId, 'streamMessages');
  
  await addDoc(messagesRef, {
    type: 'chat',
    text: text.trim(),
    senderId,
    senderName,
    senderAvatarUrl: senderAvatarUrl || null,
    createdAt: serverTimestamp()
  });
}

/**
 * Create a system message in the squad stream
 */
export async function createSystemMessage(
  squadId: string,
  text: string,
  eventKey?: string
): Promise<void> {
  const messagesRef = collection(db, 'squads', squadId, 'streamMessages');
  
  await addDoc(messagesRef, {
    type: 'system',
    text,
    eventKey: eventKey || null,
    createdAt: serverTimestamp()
  });
}

/**
 * Check in to squad and award PP rewards
 * This uses a Firestore transaction to ensure atomicity and prevent double-check-ins
 */
export async function checkInToSquad(
  squadId: string,
  userId: string,
  userName: string
): Promise<{ success: boolean; error?: string; count?: number; checkedInUserIds?: string[] }> {
  try {
    const dateKey = getDateKey();
    const checkInRef = doc(db, 'squads', squadId, 'dailyCheckins', dateKey);
    const userRef = doc(db, 'users', userId);

    return await runTransaction(db, async (transaction) => {
      // PHASE 1: ALL READS FIRST (Firestore requirement)
      // Read check-in document
      const checkInDoc = await transaction.get(checkInRef);
      const checkInData = checkInDoc.exists() ? checkInDoc.data() : null;

      // Check if user already checked in
      const checkedInUserIds = checkInData?.checkedInUserIds || [];
      if (checkedInUserIds.includes(userId)) {
        return {
          success: false,
          error: 'You have already checked in today'
        };
      }

      // Add user to checked-in list
      const newCheckedInUserIds = [...checkedInUserIds, userId];
      const newCount = newCheckedInUserIds.length;

      // Award PP to all checked-in members (including the new one)
      const awardedMilestones = checkInData?.awardedMilestones || {};
      const updatedMilestones: { [key: string]: number } = { ...awardedMilestones };

      // Read ALL user documents first (before any writes)
      const userDocs: { [memberId: string]: { exists: boolean; data: any } } = {};
      for (const memberId of newCheckedInUserIds) {
        const memberUserRef = doc(db, 'users', memberId);
        const memberUserDoc = await transaction.get(memberUserRef);
        userDocs[memberId] = {
          exists: memberUserDoc.exists(),
          data: memberUserDoc.exists() ? memberUserDoc.data() : null
        };
      }

      // PHASE 2: ALL WRITES AFTER READS
      // Calculate PP deltas and prepare updates
      const userUpdates: { [memberId: string]: number } = {};
      for (const memberId of newCheckedInUserIds) {
        const memberMilestone = awardedMilestones[memberId] || 0;
        
        // Calculate how much PP this member should have earned
        // They should have: newCount * 50 PP total
        // They already have: memberMilestone * 50 PP
        // So award: (newCount - memberMilestone) * 50 PP
        const ppDelta = (newCount - memberMilestone) * 50;

        if (ppDelta > 0 && userDocs[memberId].exists) {
          const currentPP = userDocs[memberId].data?.pp || 0;
          userUpdates[memberId] = currentPP + ppDelta;
        }

        // Update milestone for this member
        updatedMilestones[memberId] = newCount;
      }

      // Write all user PP updates
      for (const [memberId, newPP] of Object.entries(userUpdates)) {
        const memberUserRef = doc(db, 'users', memberId);
        transaction.update(memberUserRef, {
          pp: newPP
        });
      }

      // Update or create check-in document
      if (checkInDoc.exists()) {
        transaction.update(checkInRef, {
          checkedInUserIds: arrayUnion(userId),
          awardedMilestones: updatedMilestones,
          updatedAt: serverTimestamp()
        });
      } else {
        transaction.set(checkInRef, {
          dateKey,
          checkedInUserIds: [userId],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          awardedMilestones: updatedMilestones
        });
      }

      // Note: System message is created by the caller (DailyCheckInCard) after transaction completes
      // This is because we can't write to a different collection in the same transaction
      
      return {
        success: true,
        count: newCount,
        checkedInUserIds: newCheckedInUserIds
      };
    });
  } catch (error: any) {
    console.error('Error checking in:', error);
    return {
      success: false,
      error: error.message || 'Failed to check in'
    };
  }
}

/**
 * Award PP to a user (helper function)
 * Note: This should ideally be done in a Cloud Function for security,
 * but for now we'll use transactions to ensure atomicity
 */
export async function awardPPToUser(
  userId: string,
  amount: number
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  
  await runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (userDoc.exists()) {
      const currentPP = userDoc.data().pp || 0;
      transaction.update(userRef, {
        pp: currentPP + amount
      });
    }
  });
}

