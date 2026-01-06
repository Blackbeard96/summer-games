/**
 * Rival Service - Manages rival relationships between players
 */

import { db } from '../firebase';
import { 
  doc, 
  getDoc, 
  runTransaction, 
  serverTimestamp, 
  collection,
  query,
  where,
  getDocs,
  limit,
  deleteDoc,
  addDoc
} from 'firebase/firestore';

export interface Rival {
  uid: string;
  displayName: string;
  setAt: any; // Firestore Timestamp
}

export interface UserRivals {
  chosen?: Rival;
  inbound?: Rival;
}

/**
 * Get rivals for a user, with up-to-date displayNames
 */
export async function getRivals(userId: string): Promise<UserRivals> {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return {};
    }
    
    const userData = userDoc.data();
    const rivals = userData.rivals || {};
    
    // Fetch latest displayNames for rivals to ensure accuracy
    const result: UserRivals = {};
    
    if (rivals.chosen?.uid) {
      try {
        const [chosenUserDoc, chosenStudentDoc] = await Promise.all([
          getDoc(doc(db, 'users', rivals.chosen.uid)),
          getDoc(doc(db, 'students', rivals.chosen.uid))
        ]);
        
        let chosenDisplayName = rivals.chosen.displayName;
        if (chosenUserDoc.exists()) {
          const userData = chosenUserDoc.data();
          chosenDisplayName = userData.displayName || chosenDisplayName;
        }
        if (chosenStudentDoc.exists() && !chosenDisplayName) {
          const studentData = chosenStudentDoc.data();
          chosenDisplayName = studentData.displayName || studentData.name || chosenDisplayName;
        }
        
        result.chosen = {
          uid: rivals.chosen.uid,
          displayName: chosenDisplayName,
          setAt: rivals.chosen.setAt
        };
      } catch (error) {
        console.error('Error fetching chosen rival displayName:', error);
        // Fallback to stored displayName
        result.chosen = rivals.chosen;
      }
    }
    
    if (rivals.inbound?.uid) {
      try {
        const [inboundUserDoc, inboundStudentDoc] = await Promise.all([
          getDoc(doc(db, 'users', rivals.inbound.uid)),
          getDoc(doc(db, 'students', rivals.inbound.uid))
        ]);
        
        let inboundDisplayName = rivals.inbound.displayName;
        if (inboundUserDoc.exists()) {
          const userData = inboundUserDoc.data();
          inboundDisplayName = userData.displayName || inboundDisplayName;
        }
        if (inboundStudentDoc.exists() && !inboundDisplayName) {
          const studentData = inboundStudentDoc.data();
          inboundDisplayName = studentData.displayName || studentData.name || inboundDisplayName;
        }
        
        result.inbound = {
          uid: rivals.inbound.uid,
          displayName: inboundDisplayName,
          setAt: rivals.inbound.setAt
        };
      } catch (error) {
        console.error('Error fetching inbound rival displayName:', error);
        // Fallback to stored displayName
        result.inbound = rivals.inbound;
      }
    }
    
    return result;
  } catch (error) {
    console.error('Error getting rivals:', error);
    return {};
  }
}

/**
 * Check if a user is a rival (either chosen or inbound)
 */
export async function isRival(winnerUid: string, loserUid: string): Promise<boolean> {
  if (winnerUid === loserUid) return false;
  
  try {
    const rivals = await getRivals(winnerUid);
    return (
      rivals.chosen?.uid === loserUid ||
      rivals.inbound?.uid === loserUid
    );
  } catch (error) {
    console.error('Error checking if rival:', error);
    return false;
  }
}

/**
 * Set chosen rival (transaction-based)
 * Also handles inbound rival assignment for target user
 */
export async function setChosenRival(
  actorUid: string,
  actorDisplayName: string,
  targetUid: string,
  targetDisplayName: string
): Promise<{ success: boolean; error?: string }> {
  if (actorUid === targetUid) {
    return { success: false, error: 'Cannot set yourself as rival' };
  }

  try {
    // Fetch actual displayName from Firestore to ensure accuracy
    const [targetUserDoc, targetStudentDoc] = await Promise.all([
      getDoc(doc(db, 'users', targetUid)),
      getDoc(doc(db, 'students', targetUid))
    ]);
    
    // Get the most accurate displayName (prioritize users collection, then students, then fallback)
    let actualTargetDisplayName = targetDisplayName;
    if (targetUserDoc.exists()) {
      const userData = targetUserDoc.data();
      actualTargetDisplayName = userData.displayName || actualTargetDisplayName;
    }
    if (targetStudentDoc.exists() && !actualTargetDisplayName) {
      const studentData = targetStudentDoc.data();
      actualTargetDisplayName = studentData.displayName || studentData.name || actualTargetDisplayName;
    }
    
    // Also fetch actor's actual displayName
    const [actorUserDoc, actorStudentDoc] = await Promise.all([
      getDoc(doc(db, 'users', actorUid)),
      getDoc(doc(db, 'students', actorUid))
    ]);
    
    let actualActorDisplayName = actorDisplayName;
    if (actorUserDoc.exists()) {
      const userData = actorUserDoc.data();
      actualActorDisplayName = userData.displayName || actualActorDisplayName;
    }
    if (actorStudentDoc.exists() && !actualActorDisplayName) {
      const studentData = actorStudentDoc.data();
      actualActorDisplayName = studentData.displayName || studentData.name || actualActorDisplayName;
    }

    await runTransaction(db, async (transaction) => {
      // ALL READS MUST HAPPEN FIRST (before any writes)
      
      // Read actor and target user docs
      const actorRef = doc(db, 'users', actorUid);
      const targetRef = doc(db, 'users', targetUid);
      
      const actorDoc = await transaction.get(actorRef);
      const targetDoc = await transaction.get(targetRef);
      
      if (!actorDoc.exists()) {
        throw new Error('Actor user not found');
      }
      
      if (!targetDoc.exists()) {
        throw new Error('Target user not found');
      }
      
      const actorData = actorDoc.data();
      const targetData = targetDoc.data();
      
      // Get old chosen rival to clean up request
      const oldChosenRival = actorData.rivals?.chosen;
      
      // Read request documents BEFORE any writes
      const requestRef = doc(db, 'rivalRequests', targetUid, 'requests', actorUid);
      const requestDoc = await transaction.get(requestRef);
      
      // Read old request if changing rival (before any writes)
      let oldRequestDoc = null;
      if (oldChosenRival && oldChosenRival.uid !== targetUid) {
        const oldRequestRef = doc(db, 'rivalRequests', oldChosenRival.uid, 'requests', actorUid);
        oldRequestDoc = await transaction.get(oldRequestRef);
      }
      
      // NOW ALL READS ARE DONE - CAN PERFORM WRITES
      
      // Update actor's chosen rival (use actual displayName from Firestore)
      const newRivals = {
        ...actorData.rivals,
        chosen: {
          uid: targetUid,
          displayName: actualTargetDisplayName,
          setAt: serverTimestamp()
        }
      };
      
      transaction.update(actorRef, {
        rivals: newRivals
      });
      
      // Create/update request in rivalRequests collection
      // Use set() - it will create if doesn't exist, or overwrite if exists
      transaction.set(requestRef, {
        requesterUid: actorUid,
        requesterDisplayName: actualActorDisplayName,
        createdAt: serverTimestamp()
      });
      
      // Set target's inbound rival if it doesn't exist
      const targetRivals = targetData.rivals || {};
      const isNewInboundRival = !targetRivals.inbound;
      if (isNewInboundRival) {
        transaction.update(targetRef, {
          rivals: {
            ...targetRivals,
            inbound: {
              uid: actorUid,
              displayName: actualActorDisplayName,
              setAt: serverTimestamp()
            }
          }
        });
      }
      
      // Note: Old request cleanup is handled outside transaction (after line 249)
    });
    
    // Clean up old request outside transaction (if changed)
    const actorRef = doc(db, 'users', actorUid);
    const actorDoc = await getDoc(actorRef);
    if (actorDoc.exists()) {
      const actorData = actorDoc.data();
      const oldChosenRival = actorData.rivals?.chosen;
      if (oldChosenRival && oldChosenRival.uid !== targetUid) {
        try {
          const oldRequestRef = doc(db, 'rivalRequests', oldChosenRival.uid, 'requests', actorUid);
          await deleteDoc(oldRequestRef);
        } catch (error) {
          // Ignore cleanup errors
          console.warn('Could not clean up old rival request:', error);
        }
      }
    }
    
    // Create notification for target player (use actual displayName)
    try {
      await addDoc(collection(db, 'students', targetUid, 'notifications'), {
        type: 'rival_set',
        message: `${actualActorDisplayName} has set you as their rival! You are now their Inbound Rival. Defeat them in battle to earn double rewards!`,
        actorUid: actorUid,
        actorDisplayName: actualActorDisplayName,
        timestamp: serverTimestamp(),
        read: false
      });
    } catch (notificationError) {
      console.error('Error creating rival notification:', notificationError);
      // Don't fail the whole operation if notification fails
    }
    
    return { success: true };
  } catch (error: any) {
    console.error('Error setting chosen rival:', error);
    return { success: false, error: error.message || 'Failed to set rival' };
  }
}

/**
 * Search players in user's class
 */
export async function searchClassPlayers(
  userId: string,
  searchQuery: string,
  limitCount: number = 20
): Promise<Array<{ uid: string; displayName: string; photoURL?: string; level: number }>> {
  try {
    // Get user's classId from students collection
    const studentRef = doc(db, 'students', userId);
    const studentDoc = await getDoc(studentRef);
    
    if (!studentDoc.exists()) {
      return [];
    }
    
    const studentData = studentDoc.data();
    const classId = studentData.classId || studentData.class;
    
    if (!classId) {
      return [];
    }
    
    // Get classroom to find all student IDs
    const classroomRef = doc(db, 'classrooms', classId);
    const classroomDoc = await getDoc(classroomRef);
    
    if (!classroomDoc.exists()) {
      return [];
    }
    
    const classroomData = classroomDoc.data();
    const studentIds = classroomData.students || [];
    
    // Filter by search query and fetch user data
    const queryLower = searchQuery.toLowerCase().trim();
    const results: Array<{ uid: string; displayName: string; photoURL?: string; level: number }> = [];
    
    for (const studentId of studentIds) {
      if (studentId === userId) continue; // Skip self
      
      try {
        const [userDoc, studentDataDoc] = await Promise.all([
          getDoc(doc(db, 'users', studentId)),
          getDoc(doc(db, 'students', studentId))
        ]);
        
        const userData = userDoc.exists() ? userDoc.data() : {};
        const studentInfo = studentDataDoc.exists() ? studentDataDoc.data() : {};
        
        const displayName = userData.displayName || studentInfo.displayName || studentInfo.name || '';
        const displayNameLower = displayName.toLowerCase();
        
        // Filter by search query
        if (!queryLower || displayNameLower.includes(queryLower)) {
          const level = studentInfo.level || 1;
          results.push({
            uid: studentId,
            displayName,
            photoURL: userData.photoURL || studentInfo.photoURL,
            level
          });
        }
        
        if (results.length >= limitCount) break;
      } catch (error) {
        // Skip errors for individual users
        continue;
      }
    }
    
    return results.sort((a, b) => a.displayName.localeCompare(b.displayName));
  } catch (error) {
    console.error('Error searching class players:', error);
    return [];
  }
}

/**
 * Search all players (prefix search on displayNameLowercase)
 */
export async function searchAllPlayers(
  searchQuery: string,
  limitCount: number = 20
): Promise<Array<{ uid: string; displayName: string; photoURL?: string; level: number }>> {
  try {
    const queryLower = searchQuery.toLowerCase().trim();
    
    if (!queryLower || queryLower.length < 1) {
      return [];
    }
    
    // Use prefix search on displayNameLowercase if it exists
    // Otherwise fall back to client-side filtering
    const usersRef = collection(db, 'users');
    let usersQuery;
    
    try {
      // Try prefix search first
      usersQuery = query(
        usersRef,
        where('displayNameLowercase', '>=', queryLower),
        where('displayNameLowercase', '<', queryLower + '\uf8ff'),
        limit(limitCount)
      );
    } catch (error) {
      // If displayNameLowercase doesn't exist, fall back to getting all and filtering
      usersQuery = query(usersRef, limit(100)); // Get more to filter
    }
    
    const snapshot = await getDocs(usersQuery);
    const results: Array<{ uid: string; displayName: string; photoURL?: string; level: number }> = [];
    
    for (const userDoc of snapshot.docs) {
      const userData = userDoc.data();
      const displayName = userData.displayName || '';
      const displayNameLower = displayName.toLowerCase();
      
      // If we used prefix search, all results match
      // Otherwise filter client-side
      if (displayNameLower.includes(queryLower)) {
        // Get level from students collection
        let level = 1;
        try {
          const studentDoc = await getDoc(doc(db, 'students', userDoc.id));
          if (studentDoc.exists()) {
            level = studentDoc.data().level || 1;
          }
        } catch (error) {
          // Use default level
        }
        
        results.push({
          uid: userDoc.id,
          displayName,
          photoURL: userData.photoURL,
          level
        });
        
        if (results.length >= limitCount) break;
      }
    }
    
    return results.sort((a, b) => a.displayName.localeCompare(b.displayName));
  } catch (error) {
    console.error('Error searching all players:', error);
    return [];
  }
}

