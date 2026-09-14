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
  type Transaction
} from 'firebase/firestore';
import { syncPrimarySquadIdOnUser } from './squadPrimarySquadProfile';
import { squadMemberUid } from './squadMemberUtils';

/** User-facing message for Firestore failures (check-in, squad stream, etc.). */
export function formatSquadFirestoreError(
  error: unknown,
  context: 'checkin' | 'generic' = 'generic'
): string {
  const err = error as { code?: string; message?: string } | undefined;
  const code = err?.code;
  const raw = (err?.message || '').trim();
  if (
    code === 'permission-denied' ||
    /insufficient permissions/i.test(raw) ||
    /missing or insufficient permissions/i.test(raw)
  ) {
    if (context === 'checkin') {
      return 'Your check-in could not be saved. Refresh the page, open Squads once, then try Check In again. If it still fails, tell your teacher the app may need an update.';
    }
    return "This squad action couldn't be completed (permissions). Try refreshing the page or signing out and back in.";
  }
  if (raw) return raw;
  return 'Something went wrong. Please try again.';
}

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

/** UIDs from squad `members` (objects or legacy string ids) — used for Firestore rules `memberUids`. */
export function memberUidsFromSquadMembers(members: unknown): string[] {
  if (!Array.isArray(members)) return [];
  return members
    .map((m) => (typeof m === 'string' ? m : squadMemberUid(m)))
    .filter((u: unknown): u is string => typeof u === 'string' && u.length > 0);
}

/**
 * Rules check `memberUids` (legacy docs only had `members` objects, so rules never matched).
 * Call before transactions on subcollections (dailyCheckins, streamMessages).
 */
export async function ensureSquadHasMemberUids(squadId: string): Promise<void> {
  const squadRef = doc(db, 'squads', squadId);
  const snap = await getDoc(squadRef);
  if (!snap.exists()) return;
  const d = snap.data();
  const uids = memberUidsFromSquadMembers(d.members);
  if (uids.length === 0) return;
  const existing = d.memberUids;
  if (
    Array.isArray(existing) &&
    existing.length === uids.length &&
    uids.every((u) => existing.includes(u))
  ) {
    return;
  }
  await updateDoc(squadRef, { memberUids: uids });
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
  await ensureSquadHasMemberUids(squadId);
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
  await ensureSquadHasMemberUids(squadId);
  const messagesRef = collection(db, 'squads', squadId, 'streamMessages');

  await addDoc(messagesRef, {
    type: 'system',
    text,
    eventKey: eventKey || null,
    createdAt: serverTimestamp()
  });
}

/** Apply PP to the caller's own users + students docs (wallet uses powerPoints). */
function applySelfPpIncrements(
  transaction: Transaction,
  userId: string,
  ppDelta: number,
  userExists: boolean,
  studentExists: boolean
): void {
  if (ppDelta <= 0) return;
  if (userExists) {
    transaction.update(doc(db, 'users', userId), {
      powerPoints: increment(ppDelta),
      // Legacy field some older clients read
      pp: increment(ppDelta),
    });
  }
  if (studentExists) {
    transaction.update(doc(db, 'students', userId), {
      powerPoints: increment(ppDelta),
    });
  }
}

/**
 * Check in to squad and award PP to the checking-in player only.
 *
 * Previously this transaction also read/updated every teammate's `users/{uid}` doc.
 * Non-admins cannot read other users docs, so check-in failed with permission-denied
 * once the transaction touched teammates (and often failed more broadly in practice).
 *
 * Teammates already checked in receive catch-up PP via `claimSquadCheckInPpCatchUp`
 * when their client sees the count increase.
 */
export async function checkInToSquad(
  squadId: string,
  userId: string,
  _userName: string
): Promise<{ success: boolean; error?: string; count?: number; checkedInUserIds?: string[] }> {
  try {
    await ensureSquadHasMemberUids(squadId);
    await syncPrimarySquadIdOnUser(userId, squadId);
    const dateKey = getDateKey();
    const checkInRef = doc(db, 'squads', squadId, 'dailyCheckins', dateKey);
    const userRef = doc(db, 'users', userId);
    const studentRef = doc(db, 'students', userId);

    return await runTransaction(db, async (transaction) => {
      const checkInDoc = await transaction.get(checkInRef);
      const userDoc = await transaction.get(userRef);
      const studentDoc = await transaction.get(studentRef);

      const checkInData = checkInDoc.exists() ? checkInDoc.data() : null;
      const checkedInUserIds: string[] = Array.isArray(checkInData?.checkedInUserIds)
        ? [...checkInData!.checkedInUserIds]
        : [];

      if (checkedInUserIds.includes(userId)) {
        return {
          success: false,
          error: 'You have already checked in today'
        };
      }

      const newCheckedInUserIds = [...checkedInUserIds, userId];
      const newCount = newCheckedInUserIds.length;
      const awardedMilestones: { [key: string]: number } = {
        ...(checkInData?.awardedMilestones || {})
      };
      const myMilestone = Number(awardedMilestones[userId]) || 0;
      const ppDelta = Math.max(0, (newCount - myMilestone) * 50);
      awardedMilestones[userId] = newCount;

      if (checkInDoc.exists()) {
        transaction.update(checkInRef, {
          checkedInUserIds: newCheckedInUserIds,
          awardedMilestones,
          updatedAt: serverTimestamp()
        });
      } else {
        transaction.set(checkInRef, {
          dateKey,
          checkedInUserIds: newCheckedInUserIds,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          awardedMilestones
        });
      }

      applySelfPpIncrements(
        transaction,
        userId,
        ppDelta,
        userDoc.exists(),
        studentDoc.exists()
      );

      return {
        success: true,
        count: newCount,
        checkedInUserIds: newCheckedInUserIds
      };
    });
  } catch (error: unknown) {
    console.error('Error checking in:', error);
    return {
      success: false,
      error: formatSquadFirestoreError(error, 'checkin')
    };
  }
}

/**
 * When another member checks in, each already-checked-in player claims their own +50 catch-up.
 * Only touches the caller's users/students docs + their milestone on the check-in doc.
 */
export async function claimSquadCheckInPpCatchUp(
  squadId: string,
  userId: string
): Promise<{ claimed: boolean; ppDelta?: number; error?: string }> {
  try {
    const dateKey = getDateKey();
    const checkInRef = doc(db, 'squads', squadId, 'dailyCheckins', dateKey);
    const userRef = doc(db, 'users', userId);
    const studentRef = doc(db, 'students', userId);

    return await runTransaction(db, async (transaction) => {
      const checkInDoc = await transaction.get(checkInRef);
      if (!checkInDoc.exists()) {
        return { claimed: false };
      }
      const checkInData = checkInDoc.data();
      const checkedInUserIds: string[] = Array.isArray(checkInData?.checkedInUserIds)
        ? checkInData.checkedInUserIds
        : [];
      if (!checkedInUserIds.includes(userId)) {
        return { claimed: false };
      }

      const count = checkedInUserIds.length;
      const awardedMilestones: { [key: string]: number } = {
        ...(checkInData?.awardedMilestones || {})
      };
      const myMilestone = Number(awardedMilestones[userId]) || 0;
      if (myMilestone >= count) {
        return { claimed: false };
      }

      const ppDelta = (count - myMilestone) * 50;
      awardedMilestones[userId] = count;

      const userDoc = await transaction.get(userRef);
      const studentDoc = await transaction.get(studentRef);

      transaction.update(checkInRef, {
        awardedMilestones,
        updatedAt: serverTimestamp()
      });

      applySelfPpIncrements(
        transaction,
        userId,
        ppDelta,
        userDoc.exists(),
        studentDoc.exists()
      );

      return { claimed: true, ppDelta };
    });
  } catch (error: unknown) {
    console.error('Error claiming squad check-in PP catch-up:', error);
    return { claimed: false, error: formatSquadFirestoreError(error, 'checkin') };
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
  const studentRef = doc(db, 'students', userId);

  await runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    const studentDoc = await transaction.get(studentRef);
    if (userDoc.exists()) {
      transaction.update(userRef, {
        powerPoints: increment(amount),
        pp: increment(amount),
      });
    }
    if (studentDoc.exists()) {
      transaction.update(studentRef, {
        powerPoints: increment(amount),
      });
    }
  });
}
