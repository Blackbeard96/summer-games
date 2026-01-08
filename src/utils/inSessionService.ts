/**
 * Session service for In Session mode
 * Manages session creation, joining, and ending
 */

import { db } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  getDocs,
  serverTimestamp,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { debug, debugError } from './inSessionDebug';
import { isUserAdmin } from './roleManagement';
import { initializePlayerStats, finalizeSessionStats } from './inSessionStatsService';

export interface SessionPlayer {
  userId: string;
  displayName: string;
  photoURL?: string;
  level: number;
  powerPoints: number;
  participationCount: number;
  movesEarned: number;
  eliminated?: boolean;
  hp?: number;
  maxHp?: number;
  shield?: number;
  maxShield?: number;
}

export interface InSessionRoom {
  id: string;
  classId: string;
  className: string;
  teacherId: string;
  hostUid: string; // UID of the host (admin who started session)
  status: 'live' | 'ended';
  mode: 'in_session';
  createdAt: any;
  startedAt?: any;
  endedAt?: any;
  players: SessionPlayer[];
  battleLog: string[];
}

/**
 * Check if user is Yondaime (global host)
 */
export function isGlobalHost(uid: string, email?: string, displayName?: string): boolean {
  // Yondaime UID or email/displayName check
  const yondaimeEmail = 'edm21179@gmail.com';
  const yondaimeDisplayName = 'Yondaime';
  
  return (
    email === yondaimeEmail ||
    displayName === yondaimeDisplayName ||
    displayName?.toLowerCase() === yondaimeDisplayName.toLowerCase()
  );
}

/**
 * Check if user can host sessions for a class
 */
export async function canHostSession(
  userId: string,
  classId: string,
  userEmail?: string,
  userDisplayName?: string
): Promise<boolean> {
  // Check if user is admin
  const isAdmin = await isUserAdmin(userId, userEmail);
  if (isAdmin) return true;
  
  // Check if user is Yondaime (global host)
  if (isGlobalHost(userId, userEmail, userDisplayName)) return true;
  
  // TODO: Check if user is class admin (if class admin system exists)
  // For now, only admins and Yondaime can host
  
  return false;
}

/**
 * Create a new session
 */
export async function createSession(
  classId: string,
  className: string,
  hostUid: string
): Promise<string | null> {
  try {
    // Check for existing active session
    const existingSession = await getActiveSessionForClass(classId);
    if (existingSession) {
      debug('inSessionService', `Active session already exists for class ${classId}: ${existingSession.id}`);
      return existingSession.id;
    }
    
    const sessionData = {
      classId,
      className,
      teacherId: hostUid, // Keep for backward compatibility
      hostUid,
      status: 'live',
      mode: 'in_session',
      players: [],
      battleLog: ['📚 In Session Battle Started!'],
      createdAt: serverTimestamp(),
      startedAt: serverTimestamp()
    };
    
    const sessionRef = doc(collection(db, 'inSessionRooms'));
    await setDoc(sessionRef, sessionData);
    
    debug('inSessionService', `Session created: ${sessionRef.id} for class ${classId}`);
    
    return sessionRef.id;
  } catch (error) {
    debugError('inSessionService', `Error creating session for class ${classId}`, error);
    return null;
  }
}

/**
 * Get active session for a class
 */
export async function getActiveSessionForClass(classId: string): Promise<InSessionRoom | null> {
  try {
    const sessionsRef = collection(db, 'inSessionRooms');
    const q = query(
      sessionsRef,
      where('classId', '==', classId),
      where('status', '==', 'live')
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }
    
    // Get the most recent session
    const sessions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as InSessionRoom));
    
    sessions.sort((a, b) => {
      const aTime = a.startedAt?.toMillis?.() || 0;
      const bTime = b.startedAt?.toMillis?.() || 0;
      return bTime - aTime;
    });
    
    return sessions[0] || null;
  } catch (error) {
    debugError('inSessionService', `Error getting active session for class ${classId}`, error);
    return null;
  }
}

/**
 * Join a session (idempotent - safe to call multiple times)
 */
export async function joinSession(
  sessionId: string,
  player: SessionPlayer
): Promise<boolean> {
  try {
    const sessionRef = doc(db, 'inSessionRooms', sessionId);
    const sessionDoc = await getDoc(sessionRef);
    
    if (!sessionDoc.exists()) {
      debugError('inSessionService', `Session ${sessionId} does not exist`);
      return false;
    }
    
    const sessionData = sessionDoc.data() as InSessionRoom;
    
    if (sessionData.status !== 'live') {
      debugError('inSessionService', `Session ${sessionId} is not live (status: ${sessionData.status})`);
      return false;
    }
    
    // Check if player already exists
    const existingPlayer = sessionData.players.find(p => p.userId === player.userId);
    
    if (existingPlayer) {
      // Update existing player data (idempotent join)
      const updatedPlayers = sessionData.players.map(p => 
        p.userId === player.userId 
          ? { ...p, ...player } // Update with latest data
          : p
      );
      
      await updateDoc(sessionRef, {
        players: updatedPlayers,
        updatedAt: serverTimestamp()
      });
      
      debug('inSessionService', `Player ${player.userId} updated in session ${sessionId}`);
    } else {
      // Add new player
      const updatedPlayers = [...sessionData.players, player];
      const updatedLog = [...sessionData.battleLog, `👋 ${player.displayName} joined the session!`];
      
      await updateDoc(sessionRef, {
        players: updatedPlayers,
        battleLog: updatedLog,
        updatedAt: serverTimestamp()
      });
      
      // Initialize stats for new player
      await initializePlayerStats(sessionId, player.userId, player.displayName, player.powerPoints);
      
      debug('inSessionService', `Player ${player.userId} joined session ${sessionId}`);
    }
    
    // Ensure player presence doc exists
    const playerPresenceRef = doc(db, 'inSessionRooms', sessionId, 'players', player.userId);
    const playerPresenceDoc = await getDoc(playerPresenceRef);
    
    if (!playerPresenceDoc.exists()) {
      await setDoc(playerPresenceRef, {
        connected: true,
        lastSeenAt: serverTimestamp(),
        joinedAt: serverTimestamp()
      });
    }
    
    return true;
  } catch (error) {
    debugError('inSessionService', `Error joining session ${sessionId}`, error);
    return false;
  }
}

/**
 * End a session
 */
export async function endSession(sessionId: string, hostUid: string, userEmail?: string): Promise<boolean> {
  try {
    const sessionRef = doc(db, 'inSessionRooms', sessionId);
    const sessionDoc = await getDoc(sessionRef);
    
    if (!sessionDoc.exists()) {
      debugError('inSessionService', `Session ${sessionId} does not exist`);
      return false;
    }
    
    const sessionData = sessionDoc.data() as InSessionRoom;
    
    // Check if user is the host
    const isHost = sessionData.hostUid === hostUid;
    
    // Check if user is an admin (allow admins to end any session)
    const isAdmin = await isUserAdmin(hostUid, userEmail);
    
    // Check if user is global host (Yondaime)
    const isGlobal = isGlobalHost(hostUid, userEmail);
    
    // Allow if user is host, admin, or global host
    if (!isHost && !isAdmin && !isGlobal) {
      debugError('inSessionService', `User ${hostUid} is not authorized to end session ${sessionId} (not host, admin, or global host)`);
      return false;
    }
    
    // Finalize session stats before ending
    const playerIds = sessionData.players.map((p: SessionPlayer) => p.userId);
    const summary = await finalizeSessionStats(sessionId, playerIds);
    
    // Finalize session
    await updateDoc(sessionRef, {
      status: 'ended',
      endedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    debug('inSessionService', `Session ${sessionId} ended by ${hostUid} (${isHost ? 'host' : isAdmin ? 'admin' : 'global host'})`, {
      summaryGenerated: !!summary,
      players: playerIds.length
    });
    
    return true;
  } catch (error) {
    debugError('inSessionService', `Error ending session ${sessionId}`, error);
    return false;
  }
}

/**
 * Subscribe to session updates
 */
export function subscribeToSession(
  sessionId: string,
  callback: (session: InSessionRoom | null) => void
): Unsubscribe {
  debug('inSessionService', `Subscribing to session ${sessionId}`);
  
  const sessionRef = doc(db, 'inSessionRooms', sessionId);
  
  return onSnapshot(
    sessionRef,
    (doc) => {
      if (doc.exists()) {
        const session = {
          id: doc.id,
          ...doc.data()
        } as InSessionRoom;
        
        debug('inSessionService', `Session update: ${sessionId}`, {
          status: session.status,
          playersCount: session.players.length
        });
        
        callback(session);
      } else {
        debug('inSessionService', `Session ${sessionId} does not exist`);
        callback(null);
      }
    },
    (error) => {
      debugError('inSessionService', 'Error in session subscription', error);
      callback(null);
    }
  );
}

/**
 * Get session by ID
 */
export async function getSession(sessionId: string): Promise<InSessionRoom | null> {
  try {
    const sessionRef = doc(db, 'inSessionRooms', sessionId);
    const sessionDoc = await getDoc(sessionRef);
    
    if (!sessionDoc.exists()) {
      return null;
    }
    
    return {
      id: sessionDoc.id,
      ...sessionDoc.data()
    } as InSessionRoom;
  } catch (error) {
    debugError('inSessionService', `Error getting session ${sessionId}`, error);
    return null;
  }
}



