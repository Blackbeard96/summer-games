/**
 * Presence service for In Session mode
 * Manages player connectivity and heartbeat
 */

import { db } from '../firebase';
import { doc, updateDoc, getDoc, serverTimestamp, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { debug, debugError, debugThrottle } from './inSessionDebug';

export interface PlayerPresence {
  uid: string;
  connected: boolean;
  lastSeenAt: any; // Firestore Timestamp
  joinedAt: any; // Firestore Timestamp
}

const PRESENCE_HEARTBEAT_INTERVAL = 15000; // 15 seconds
const PRESENCE_STALE_THRESHOLD = 45000; // 45 seconds

let heartbeatIntervals = new Map<string, NodeJS.Timeout>();
let presenceUnsubscribes = new Map<string, Unsubscribe>();

/**
 * Start presence tracking for a user in a session
 */
export function startPresence(sessionId: string, userId: string): () => void {
  const key = `${sessionId}:${userId}`;
  
  // Clean up existing if any
  stopPresence(sessionId, userId);
  
  debug('inSessionPresence', `Starting presence for user ${userId} in session ${sessionId}`);
  
  const playerRef = doc(db, 'inSessionRooms', sessionId, 'players', userId);
  
  // Initial heartbeat
  updatePresence(sessionId, userId);
  
  // Set up heartbeat interval
  const interval = setInterval(() => {
    updatePresence(sessionId, userId);
  }, PRESENCE_HEARTBEAT_INTERVAL);
  
  heartbeatIntervals.set(key, interval);
  
  // Handle page visibility
  const handleVisibilityChange = () => {
    if (document.hidden) {
      // Mark as disconnected when tab is hidden
      updatePresence(sessionId, userId, false);
    } else {
      // Mark as connected when tab becomes visible
      updatePresence(sessionId, userId, true);
    }
  };
  
  // Handle page unload
  const handleBeforeUnload = () => {
    updatePresence(sessionId, userId, false);
  };
  
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', handleBeforeUnload);
  
  // Return cleanup function
  return () => {
    stopPresence(sessionId, userId);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('beforeunload', handleBeforeUnload);
  };
}

/**
 * Update presence for a user
 */
async function updatePresence(sessionId: string, userId: string, connected: boolean = true): Promise<void> {
  try {
    const playerRef = doc(db, 'inSessionRooms', sessionId, 'players', userId);
    await updateDoc(playerRef, {
      connected,
      lastSeenAt: serverTimestamp()
    });
    
    debugThrottle(`presence-${sessionId}-${userId}`, 5000, 'inSessionPresence', 
      `Presence updated: ${userId} (connected: ${connected})`);
  } catch (error) {
    // If player doc doesn't exist, that's okay - they'll be created on join
    if (error instanceof Error && error.message.includes('No document to update')) {
      debug('inSessionPresence', `Player doc doesn't exist yet for ${userId}`);
      return;
    }
    debugError('inSessionPresence', `Error updating presence for ${userId}`, error);
  }
}

/**
 * Stop presence tracking for a user
 */
export function stopPresence(sessionId: string, userId: string): void {
  const key = `${sessionId}:${userId}`;
  
  // Clear heartbeat interval
  const interval = heartbeatIntervals.get(key);
  if (interval) {
    clearInterval(interval);
    heartbeatIntervals.delete(key);
  }
  
  // Mark as disconnected
  updatePresence(sessionId, userId, false).catch(err => {
    debugError('inSessionPresence', `Error stopping presence for ${userId}`, err);
  });
  
  // Unsubscribe from presence listener
  const unsubscribe = presenceUnsubscribes.get(key);
  if (unsubscribe) {
    unsubscribe();
    presenceUnsubscribes.delete(key);
  }
  
  debug('inSessionPresence', `Stopped presence for user ${userId} in session ${sessionId}`);
}

/**
 * Subscribe to presence changes for all players in a session
 * Note: This listens to the session doc and fetches presence from subcollection
 * For better performance, consider using a collection group query if needed
 */
export function subscribeToPresence(
  sessionId: string,
  callback: (presence: Map<string, PlayerPresence>) => void
): Unsubscribe {
  debug('inSessionPresence', `Subscribing to presence for session ${sessionId}`);
  
  // Listen to session doc for player list changes
  const unsubscribe = onSnapshot(
    doc(db, 'inSessionRooms', sessionId),
    async (sessionDoc) => {
      if (!sessionDoc.exists()) {
        callback(new Map());
        return;
      }
      
      const sessionData = sessionDoc.data();
      const players = sessionData.players || [];
      
      // Get presence data for each player from subcollection
      const presenceMap = new Map<string, PlayerPresence>();
      
      // Fetch presence for all players in parallel
      const presencePromises = players.map(async (player: any) => {
        const playerPresenceRef = doc(db, 'inSessionRooms', sessionId, 'players', player.userId);
        try {
          const playerPresenceDoc = await getDoc(playerPresenceRef);
          if (playerPresenceDoc.exists()) {
            const presenceData = playerPresenceDoc.data();
            return {
              uid: player.userId,
              connected: presenceData.connected ?? true,
              lastSeenAt: presenceData.lastSeenAt,
              joinedAt: presenceData.joinedAt
            } as PlayerPresence;
          } else {
            // Default to connected if no presence doc exists
            return {
              uid: player.userId,
              connected: true,
              lastSeenAt: null,
              joinedAt: null
            } as PlayerPresence;
          }
        } catch (error) {
          debugError('inSessionPresence', `Error getting presence for ${player.userId}`, error);
          // Default to connected on error
          return {
            uid: player.userId,
            connected: true,
            lastSeenAt: null,
            joinedAt: null
          } as PlayerPresence;
        }
      });
      
      const presenceResults = await Promise.all(presencePromises);
      presenceResults.forEach((presence: PlayerPresence) => {
        if (presence) {
          presenceMap.set(presence.uid, presence);
        }
      });
      
      callback(presenceMap);
    },
    (error: any) => {
      debugError('inSessionPresence', 'Error in presence subscription', error);
      callback(new Map());
    }
  );
  
  return unsubscribe;
}

/**
 * Check if a player is considered online (within stale threshold)
 */
export function isPlayerOnline(presence: PlayerPresence | null): boolean {
  if (!presence) return false;
  if (!presence.connected) return false;
  
  if (!presence.lastSeenAt) return true; // No timestamp = assume online
  
  const lastSeen = presence.lastSeenAt.toMillis ? presence.lastSeenAt.toMillis() : Date.now();
  const now = Date.now();
  const age = now - lastSeen;
  
  return age < PRESENCE_STALE_THRESHOLD;
}
