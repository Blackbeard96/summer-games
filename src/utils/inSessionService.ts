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
  Unsubscribe,
  runTransaction
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
  status: 'live' | 'active' | 'ended'; // 'active' for backward compatibility
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
    
    // CRITICAL: Ensure all required fields are defined (no undefined values)
    const sessionData = {
      classId: classId || '',
      className: className || '',
      teacherId: hostUid || '', // Keep for backward compatibility
      hostUid: hostUid || '',
      status: 'live' as const, // Use 'live' consistently
      mode: 'in_session' as const,
      players: [] as SessionPlayer[],
      battleLog: ['🎆 Live Event Started!'] as string[],
      createdAt: serverTimestamp(),
      startedAt: serverTimestamp()
    };

    // Validate required fields
    if (!sessionData.classId || !sessionData.hostUid) {
      debugError('inSessionService', 'Cannot create session: missing required fields', {
        classId: sessionData.classId,
        hostUid: sessionData.hostUid
      });
      return null;
    }
    
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
 * NOW TRANSACTION-SAFE: Uses Firestore transaction to prevent race conditions
 * Returns: { success: boolean, error?: string }
 */
export async function joinSession(
  sessionId: string,
  player: SessionPlayer
): Promise<{ success: boolean; error?: string }> {
  const DEBUG_JOIN = process.env.REACT_APP_DEBUG_LIVE_EVENTS === 'true' || 
                     process.env.REACT_APP_DEBUG === 'true';
  
  if (DEBUG_JOIN) {
    debug('inSessionService', `🔵 JOIN ATTEMPT: ${player.userId} joining session ${sessionId}`, {
      playerName: player.displayName,
      playerLevel: player.level,
      playerPP: player.powerPoints
    });
  }
  
  // Declare refs outside try block so they're accessible in catch block
  const sessionRef = doc(db, 'inSessionRooms', sessionId);
  const playerPresenceRef = doc(db, 'inSessionRooms', sessionId, 'players', player.userId);
  
  try {
    
    // Quick check: If player is already in session, return success immediately (idempotent)
    // This prevents unnecessary transaction conflicts
    try {
      const quickCheck = await getDoc(sessionRef);
      if (quickCheck.exists()) {
        const quickData = quickCheck.data() as InSessionRoom;
        const alreadyInSession = quickData.players?.some(p => p.userId === player.userId) || false;
        if (alreadyInSession) {
          if (DEBUG_JOIN) {
            debug('inSessionService', `✅ Player ${player.userId} already in session, skipping join`);
          }
          // Still update presence to show they're connected
          try {
            await updateDoc(playerPresenceRef, {
              connected: true,
              lastSeenAt: serverTimestamp()
            });
          } catch (presenceError) {
            // If presence doc doesn't exist, create it
            try {
              await setDoc(playerPresenceRef, {
                connected: true,
                lastSeenAt: serverTimestamp(),
                joinedAt: serverTimestamp()
              });
            } catch (setError) {
              // Ignore - presence is optional
            }
          }
          return { success: true };
        }
      }
    } catch (quickCheckError) {
      // Continue with full transaction if quick check fails
      if (DEBUG_JOIN) {
        debug('inSessionService', 'Quick check failed, proceeding with transaction', quickCheckError);
      }
    }
    
    // Use transaction to ensure atomic join
    // CRITICAL: Firestore transactions require ALL reads before ANY writes
    // Firestore will automatically retry on failed-precondition errors
    const result = await runTransaction(db, async (transaction) => {
      // PHASE 1: ALL READS FIRST (Firestore requirement)
      // Read session document
      const sessionDoc = await transaction.get(sessionRef);
      
      if (!sessionDoc.exists()) {
        if (DEBUG_JOIN) {
          debugError('inSessionService', `❌ JOIN FAILED: Session ${sessionId} does not exist`);
        }
        throw new Error(`Session ${sessionId} does not exist`);
      }
      
      const sessionData = sessionDoc.data() as InSessionRoom;
      
      // Check session status - allow 'live' and 'active' for backward compatibility
      if (sessionData.status !== 'live' && sessionData.status !== 'active') {
        if (DEBUG_JOIN) {
          debugError('inSessionService', `❌ JOIN FAILED: Session ${sessionId} is not live (status: ${sessionData.status})`);
        }
        throw new Error(`Session is not active. Current status: ${sessionData.status}`);
      }
      
      // Read presence document BEFORE any writes
      const presenceDoc = await transaction.get(playerPresenceRef);
      
      // Check if player already exists
      const existingPlayerIndex = sessionData.players.findIndex(p => p.userId === player.userId);
      const isNewPlayer = existingPlayerIndex === -1;
      
      // CRITICAL: Validate player data before adding to array
      if (!player.userId || typeof player.userId !== 'string') {
        debugError('inSessionService', 'Invalid player data: userId is required', { player });
        throw new Error('Player userId is required and must be a string');
      }
      if (!player.displayName || typeof player.displayName !== 'string') {
        debugError('inSessionService', 'Invalid player data: displayName is required', { player });
        throw new Error('Player displayName is required and must be a string');
      }

      // PHASE 2: ALL WRITES AFTER READS
      // Update or add player
      const updatedPlayers = [...sessionData.players];
      if (isNewPlayer) {
        updatedPlayers.push(player);
        if (DEBUG_JOIN) {
          debug('inSessionService', `✅ NEW PLAYER: Adding ${player.displayName} to session`);
        }
      } else {
        // Update existing player with latest data (idempotent rejoin)
        updatedPlayers[existingPlayerIndex] = { ...updatedPlayers[existingPlayerIndex], ...player };
        if (DEBUG_JOIN) {
          debug('inSessionService', `🔄 REJOIN: Updating existing player ${player.displayName}`);
        }
      }
      
      // Update battle log only for new players
      // CRITICAL: Validate battle log message is not undefined
      const joinMessage = `👋 ${player.displayName || 'Player'} joined the session!`;
      if (!joinMessage || typeof joinMessage !== 'string') {
        debugError('inSessionService', 'Invalid join message', { joinMessage, player });
        throw new Error('Join message must be a valid string');
      }
      const updatedLog = isNewPlayer 
        ? [...(sessionData.battleLog || []), joinMessage]
        : sessionData.battleLog || [];
      
      // Update session document
      transaction.update(sessionRef, {
        players: updatedPlayers,
        battleLog: updatedLog,
        updatedAt: serverTimestamp()
      });
      
      // Update presence document (we already read it above)
      if (!presenceDoc.exists()) {
        transaction.set(playerPresenceRef, {
          connected: true,
          lastSeenAt: serverTimestamp(),
          joinedAt: serverTimestamp()
        });
        if (DEBUG_JOIN) {
          debug('inSessionService', `📝 Created presence doc for ${player.userId}`);
        }
      } else {
        transaction.update(playerPresenceRef, {
          connected: true,
          lastSeenAt: serverTimestamp()
        });
        if (DEBUG_JOIN) {
          debug('inSessionService', `🔄 Updated presence doc for ${player.userId}`);
        }
      }
      
      return { isNewPlayer, playerCount: updatedPlayers.length };
    });
    
    // Initialize stats for new player (outside transaction to avoid transaction timeout)
    if (result.isNewPlayer) {
      try {
        await initializePlayerStats(sessionId, player.userId, player.displayName, player.powerPoints);
        if (DEBUG_JOIN) {
          debug('inSessionService', `📊 Initialized stats for new player ${player.userId}`);
        }
      } catch (statsError) {
        debugError('inSessionService', `Error initializing stats for ${player.userId}`, statsError);
        // Don't fail join if stats init fails
      }
    }
    
    if (DEBUG_JOIN) {
      debug('inSessionService', `✅ JOIN SUCCESS: ${player.displayName} joined session ${sessionId}`, {
        isNewPlayer: result.isNewPlayer,
        playerCount: result.playerCount
      });
    }
    
    return { success: true };
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error occurred';
    const errorCode = error?.code || 'unknown';
    
    debugError('inSessionService', `❌ JOIN ERROR: Error joining session ${sessionId}`, error);
    console.error('[InSession] Join error details:', {
      sessionId,
      playerId: player.userId,
      playerName: player.displayName,
      errorMessage,
      errorCode,
      errorStack: error?.stack
    });
    
    // If it's a failed-precondition error, the transaction was retried but still failed
    // This usually means the document is being updated too frequently
    // Check if player actually got added despite the error
    if (errorCode === 'failed-precondition') {
      try {
        const checkDoc = await getDoc(sessionRef);
        if (checkDoc.exists()) {
          const checkData = checkDoc.data() as InSessionRoom;
          const playerInSession = checkData.players?.some(p => p.userId === player.userId) || false;
          if (playerInSession) {
            console.log('[InSession] Player was added despite transaction error - join succeeded');
            // Update presence anyway
            try {
              await updateDoc(playerPresenceRef, {
                connected: true,
                lastSeenAt: serverTimestamp()
              });
            } catch (presenceError) {
              // Ignore presence errors
            }
            return { success: true };
          }
        }
      } catch (checkError) {
        // Ignore check errors
      }
    }
    
    // Return detailed error information
    return { 
      success: false, 
      error: errorMessage 
    };
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
 * CRITICAL: Ensure cleanup is called to prevent duplicate subscriptions
 */
export function subscribeToSession(
  sessionId: string,
  callback: (session: InSessionRoom | null) => void
): Unsubscribe {
  const DEBUG_SESSION = process.env.REACT_APP_DEBUG_SESSION === 'true';
  
  if (DEBUG_SESSION) {
    console.log(`[Listener] [inSessionService] Subscribing to session ${sessionId}`);
  }
  
  const sessionRef = doc(db, 'inSessionRooms', sessionId);
  
  return onSnapshot(
    sessionRef,
    (doc) => {
      if (doc.exists()) {
        const session = {
          id: doc.id,
          ...doc.data()
        } as InSessionRoom;
        
        if (DEBUG_SESSION) {
          console.log(`[Listener] [inSessionService] Session update: ${sessionId}`, {
            status: session.status,
            playersCount: session.players.length,
            battleLogLength: session.battleLog?.length || 0
          });
        }
        
        callback(session);
      } else {
        if (DEBUG_SESSION) {
          console.log(`[Listener] [inSessionService] Session ${sessionId} does not exist`);
        }
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



