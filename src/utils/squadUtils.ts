import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { isUidInSquad, squadMemberUid } from './squadMemberUtils';

/**
 * Fetches the squad abbreviation for a given user ID
 * @param userId - The user ID to look up
 * @returns The squad abbreviation string, or null if user is not in a squad or squad has no abbreviation
 */
export async function getUserSquadAbbreviation(userId: string): Promise<string | null> {
  try {
    const squadsSnapshot = await getDocs(collection(db, 'squads'));
    
    for (const squadDoc of squadsSnapshot.docs) {
      const squadData = squadDoc.data();
      if (!isUidInSquad(squadData, userId)) continue;
      if (squadData.abbreviation) {
        return squadData.abbreviation;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching squad abbreviation:', error);
    return null;
  }
}

export interface UserSquadInfo {
  squadId: string;
  name: string;
  abbreviation: string | null;
}

/** Read-only squad membership for many users (first squad found wins). */
export async function getUserSquadInfo(userIds: string[]): Promise<Map<string, UserSquadInfo>> {
  const result = new Map<string, UserSquadInfo>();
  const wanted = new Set(userIds);
  try {
    const squadsSnapshot = await getDocs(collection(db, 'squads'));
    squadsSnapshot.docs.forEach((squadDoc) => {
      const data = squadDoc.data();
      const info: UserSquadInfo = {
        squadId: squadDoc.id,
        name: typeof data.name === 'string' && data.name ? data.name : data.abbreviation || 'Squad',
        abbreviation: data.abbreviation || null,
      };
      const uids = new Set<string>(Array.isArray(data.memberUids) ? data.memberUids : []);
      (data.members || []).forEach((m: unknown) => {
        const mid = squadMemberUid(m as never);
        if (mid) uids.add(mid);
      });
      uids.forEach((uid) => {
        if (wanted.has(uid) && !result.has(uid)) result.set(uid, info);
      });
    });
  } catch (error) {
    console.error('Error fetching squad info:', error);
  }
  return result;
}

/**
 * Fetches squad abbreviations for multiple users at once
 * @param userIds - Array of user IDs to look up
 * @returns Map of userId -> squad abbreviation (or null)
 */
export async function getUserSquadAbbreviations(userIds: string[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  
  try {
    const squadsSnapshot = await getDocs(collection(db, 'squads'));
    
    // Initialize all users with null
    userIds.forEach(userId => result.set(userId, null));
    
    // Process each squad
    squadsSnapshot.docs.forEach(squadDoc => {
      const squadData = squadDoc.data();
      const members = squadData.members || [];
      const abbreviation = squadData.abbreviation || null;
      const memberUids: string[] = Array.isArray(squadData.memberUids) ? squadData.memberUids : [];

      memberUids.forEach((uid: string) => {
        if (userIds.includes(uid) && abbreviation) {
          result.set(uid, abbreviation);
        }
      });

      members.forEach((member: any) => {
        const mid = squadMemberUid(member);
        if (mid && userIds.includes(mid) && abbreviation) {
          result.set(mid, abbreviation);
        }
      });
    });
    
    return result;
  } catch (error) {
    console.error('Error fetching squad abbreviations:', error);
    return result;
  }
}





