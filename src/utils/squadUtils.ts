import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

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
      const members = squadData.members || [];
      
      // Check if user is a member of this squad
      const isMember = members.some((member: any) => member.uid === userId);
      
      if (isMember && squadData.abbreviation) {
        return squadData.abbreviation;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching squad abbreviation:', error);
    return null;
  }
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
      
      // Check each member
      members.forEach((member: any) => {
        if (userIds.includes(member.uid) && abbreviation) {
          result.set(member.uid, abbreviation);
        }
      });
    });
    
    return result;
  } catch (error) {
    console.error('Error fetching squad abbreviations:', error);
    return result;
  }
}





