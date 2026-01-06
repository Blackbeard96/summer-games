/**
 * Island Raid Lobby Service
 * 
 * Canonical, transactional lobby join/leave operations.
 * Prevents race conditions and ensures data consistency.
 */

import { 
  doc, 
  getDoc, 
  updateDoc, 
  runTransaction, 
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { IslandRunPlayer } from '../types/islandRun';

const DEBUG_RAID = process.env.REACT_APP_DEBUG_RAID === 'true';

/**
 * Join a raid lobby transactionally
 * 
 * Prevents race conditions by using Firestore transactions.
 * Ensures maxPlayers limit is enforced atomically.
 * 
 * @param lobbyId - Lobby ID to join
 * @param userId - User ID joining
 * @param userDisplayName - User display name
 * @param userPhotoURL - User photo URL (optional)
 * @param userLevel - User level
 * @param userXP - User XP
 * @returns { success: boolean, error?: string, isFull?: boolean, alreadyJoined?: boolean }
 */
export async function joinRaidLobby(
  lobbyId: string,
  userId: string,
  userDisplayName: string,
  userPhotoURL?: string,
  userLevel: number = 1,
  userXP: number = 0
): Promise<{
  success: boolean;
  error?: string;
  isFull?: boolean;
  alreadyJoined?: boolean;
}> {
  try {
    const result = await runTransaction(db, async (transaction) => {
      const lobbyRef = doc(db, 'islandRunLobbies', lobbyId);
      const lobbyDoc = await transaction.get(lobbyRef);

      if (!lobbyDoc.exists()) {
        throw new Error('Lobby does not exist');
      }

      const lobbyData = lobbyDoc.data();
      const status = lobbyData.status;
      const maxPlayers = lobbyData.maxPlayers || 4;
      const players = lobbyData.players || [];
      const currentPlayers = players.length;

      // Check if lobby is in joinable state
      if (status !== 'waiting' && status !== 'starting') {
        throw new Error(`Lobby is not joinable (status: ${status})`);
      }

      // Check if already joined
      const existingPlayerIndex = players.findIndex(
        (p: IslandRunPlayer) => p.userId === userId
      );
      
      if (existingPlayerIndex !== -1) {
        if (DEBUG_RAID) {
          console.log(`🏝️ [RaidLobbyService] User ${userId} already in lobby ${lobbyId}`);
        }
        return { success: true, alreadyJoined: true };
      }

      // Check if lobby is full
      if (currentPlayers >= maxPlayers) {
        if (DEBUG_RAID) {
          console.log(`🏝️ [RaidLobbyService] Lobby ${lobbyId} is full (${currentPlayers}/${maxPlayers})`);
        }
        throw new Error('Lobby is full');
      }

      // Create new player object
      const newPlayer: IslandRunPlayer = {
        userId,
        displayName: userDisplayName,
        photoURL: userPhotoURL,
        level: userLevel,
        xp: userXP,
        health: 100,
        maxHealth: 100,
        shieldStrength: 0,
        maxShieldStrength: 0,
        equippedArtifacts: {},
        moves: [],
        actionCards: [],
        isReady: false,
        isLeader: false
      };

      // Add player to array
      const updatedPlayers = [...players, newPlayer];

      // Update lobby atomically
      transaction.update(lobbyRef, {
        players: updatedPlayers,
        currentPlayers: updatedPlayers.length,
        updatedAt: serverTimestamp(),
        lastActivityAt: serverTimestamp()
      });

      if (DEBUG_RAID) {
        console.log(`🏝️ [RaidLobbyService] User ${userId} joined lobby ${lobbyId} (${updatedPlayers.length}/${maxPlayers})`);
      }

      return { success: true, alreadyJoined: false };
    });

    return result;
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error';
    
    if (DEBUG_RAID) {
      console.error(`🏝️ [RaidLobbyService] Join error for lobby ${lobbyId}:`, error);
    }

    if (errorMessage.includes('full')) {
      return { success: false, error: errorMessage, isFull: true };
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Leave a raid lobby transactionally
 * 
 * @param lobbyId - Lobby ID to leave
 * @param userId - User ID leaving
 * @returns { success: boolean, error?: string }
 */
export async function leaveRaidLobby(
  lobbyId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await runTransaction(db, async (transaction) => {
      const lobbyRef = doc(db, 'islandRunLobbies', lobbyId);
      const lobbyDoc = await transaction.get(lobbyRef);

      if (!lobbyDoc.exists()) {
        // Lobby doesn't exist - consider it a successful leave
        if (DEBUG_RAID) {
          console.log(`🏝️ [RaidLobbyService] Lobby ${lobbyId} doesn't exist, leave successful`);
        }
        return;
      }

      const lobbyData = lobbyDoc.data();
      const players = lobbyData.players || [];
      const playerIndex = players.findIndex(
        (p: IslandRunPlayer) => p.userId === userId
      );

      if (playerIndex === -1) {
        // Player not in lobby - consider it a successful leave
        if (DEBUG_RAID) {
          console.log(`🏝️ [RaidLobbyService] User ${userId} not in lobby ${lobbyId}, leave successful`);
        }
        return;
      }

      // Remove player from array
      const updatedPlayers = players.filter(
        (p: IslandRunPlayer) => p.userId !== userId
      );

      // If host leaves and lobby is not in_progress, mark lobby as expired
      // Otherwise, just remove the player
      const isHost = lobbyData.hostId === userId;
      const status = lobbyData.status;
      const updates: any = {
        players: updatedPlayers,
        currentPlayers: updatedPlayers.length,
        updatedAt: serverTimestamp(),
        lastActivityAt: serverTimestamp()
      };

      // If host leaves and lobby is waiting/starting, mark as expired
      if (isHost && (status === 'waiting' || status === 'starting')) {
        updates.status = 'expired';
        if (DEBUG_RAID) {
          console.log(`🏝️ [RaidLobbyService] Host left, marking lobby ${lobbyId} as expired`);
        }
      }

      transaction.update(lobbyRef, updates);

      if (DEBUG_RAID) {
        console.log(`🏝️ [RaidLobbyService] User ${userId} left lobby ${lobbyId} (${updatedPlayers.length} remaining)`);
      }
    });

    return { success: true };
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error';
    
    if (DEBUG_RAID) {
      console.error(`🏝️ [RaidLobbyService] Leave error for lobby ${lobbyId}:`, error);
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Find active lobby for a user
 * 
 * @param userId - User ID to search for
 * @returns Lobby ID if found, null otherwise
 */
export async function findActiveLobbyForUser(
  userId: string
): Promise<string | null> {
  try {
    const lobbiesRef = collection(db, 'islandRunLobbies');
    const q = query(
      lobbiesRef,
      where('status', 'in', ['waiting', 'starting', 'in_progress'])
    );
    
    const snapshot = await getDocs(q);
    
    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data();
      const players = data.players || [];
      const playerExists = players.some(
        (p: IslandRunPlayer) => p.userId === userId
      );
      
      if (playerExists) {
        if (DEBUG_RAID) {
          console.log(`🏝️ [RaidLobbyService] Found active lobby ${docSnapshot.id} for user ${userId}`);
        }
        return docSnapshot.id;
      }
    }

    return null;
  } catch (error) {
    if (DEBUG_RAID) {
      console.error(`🏝️ [RaidLobbyService] Error finding active lobby for user ${userId}:`, error);
    }
    return null;
  }
}

/**
 * Touch lobby to update lastActivityAt (for heartbeat/presence)
 * 
 * @param lobbyId - Lobby ID to touch
 * @returns { success: boolean, error?: string }
 */
export async function touchRaidLobby(
  lobbyId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const lobbyRef = doc(db, 'islandRunLobbies', lobbyId);
    await updateDoc(lobbyRef, {
      lastActivityAt: serverTimestamp()
    });
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}

/**
 * Cleanup expired/inactive lobbies (client-side)
 * 
 * Marks lobbies as expired if:
 * - Status is 'waiting' or 'starting'
 * - Has no players (players.length === 0)
 * - lastActivityAt is older than 10 minutes
 * 
 * NOTE: This is a client-side cleanup. For production, consider using a Cloud Function
 * scheduled to run every minute to handle cleanup server-side.
 * 
 * @returns Number of lobbies marked as expired
 */
export async function cleanupExpiredRaidLobbiesClient(): Promise<number> {
  try {
    const now = Timestamp.now();
    const tenMinutesAgo = Timestamp.fromMillis(now.toMillis() - 10 * 60 * 1000);

    const lobbiesRef = collection(db, 'islandRunLobbies');
    const q = query(
      lobbiesRef,
      where('status', 'in', ['waiting', 'starting'])
    );

    const snapshot = await getDocs(q);
    let expiredCount = 0;

    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data();
      const players = data.players || [];
      const lastActivityAt = data.lastActivityAt as Timestamp | undefined;

      // Check if lobby is empty and inactive for 10+ minutes
      if (players.length === 0 && lastActivityAt) {
        // Compare timestamps (lastActivityAt should be before tenMinutesAgo)
        if (lastActivityAt.toMillis() < tenMinutesAgo.toMillis()) {
          const lobbyRef = doc(db, 'islandRunLobbies', docSnapshot.id);
          await updateDoc(lobbyRef, {
            status: 'expired',
            updatedAt: serverTimestamp()
          });
          expiredCount++;

          if (DEBUG_RAID) {
            console.log(`🏝️ [RaidLobbyService] Marked empty lobby ${docSnapshot.id} as expired (inactive for 10+ minutes)`);
          }
        }
      }
    }

    if (DEBUG_RAID && expiredCount > 0) {
      console.log(`🏝️ [RaidLobbyService] Cleanup: Marked ${expiredCount} lobbies as expired`);
    }

    return expiredCount;
  } catch (error) {
    if (DEBUG_RAID) {
      console.error('🏝️ [RaidLobbyService] Error cleaning up expired lobbies:', error);
    }
    return 0;
  }
}
