/**
 * Battle Session Manager
 * 
 * Utility functions for creating, joining, and managing shared battle sessions
 * in Firestore. All participants subscribe to the same battleSessions/{battleId}
 * document to see synchronized battle state.
 */

import { 
  doc, 
  setDoc, 
  updateDoc, 
  getDoc, 
  onSnapshot, 
  serverTimestamp, 
  arrayUnion,
  arrayRemove,
  Timestamp,
  Unsubscribe
} from 'firebase/firestore';
import { db } from '../firebase';
import { BattleSession, BattleParticipant, BattleCombatant, BattleStatus, BattleMode, PendingMove } from '../types/battleSession';
import { sanitizeFirestoreData } from './firestoreSanitizer';

/**
 * Clean a single combatant object - remove Date objects, undefined values, and functions
 * to ensure Firestore compatibility
 */
const cleanCombatant = (combatant: BattleCombatant): BattleCombatant => {
  const cleaned: any = {};
  Object.keys(combatant).forEach(key => {
    const value = (combatant as any)[key];
    // Skip undefined values
    if (value === undefined) return;
    // Skip Date objects
    if (value instanceof Date) return;
    // Skip functions
    if (typeof value === 'function') return;
    cleaned[key] = value;
  });
  return cleaned as BattleCombatant;
};

/**
 * Clean an array of combatants
 */
const cleanCombatants = (combatants: BattleCombatant[]): BattleCombatant[] => {
  return combatants.map(c => cleanCombatant(c));
};

/**
 * Create a new battle session
 */
export async function createBattleSession(
  battleId: string,
  hostId: string,
  config: {
    mode: BattleMode;
    allies: BattleCombatant[];
    enemies: BattleCombatant[];
    wave?: number;
    maxWaves?: number;
    difficulty?: 'easy' | 'normal' | 'hard' | 'nightmare';
    chapterId?: number;
    chapterName?: string;
    challengeId?: string;
    challengeName?: string;
    challengeNumber?: number;
    customWaves?: { [waveNumber: string]: BattleCombatant[] };
    rngSeed?: number;
  }
): Promise<void> {
  // Get host display name from allies if available
  const hostAlly = config.allies.find(a => a.id === hostId);
  const hostDisplayName = hostAlly?.name || 'Host';
  
  // Use Timestamp.now() for array elements (serverTimestamp() not allowed in arrays)
  const hostParticipant: BattleParticipant = {
    uid: hostId,
    displayName: hostDisplayName,
    joinedAt: Timestamp.now(), // Use Timestamp.now() instead of serverTimestamp() for arrays
    isReady: true,
    connected: true,
    ...(hostAlly?.photoURL && { photoURL: hostAlly.photoURL }),
    ...(hostAlly?.avatar && !hostAlly?.photoURL && { photoURL: hostAlly.avatar }),
    ...(hostAlly?.level !== undefined && { level: hostAlly.level })
  };
  
  // Clean combatants - remove Date objects and ensure all fields are Firestore-compatible
  const cleanedAllies = cleanCombatants(config.allies);
  const cleanedEnemies = cleanCombatants(config.enemies);
  
  // Clean customWaves if present
  const cleanedCustomWaves = config.customWaves ? Object.entries(config.customWaves).reduce((acc, [key, value]) => {
    acc[key] = cleanCombatants(value);
    return acc;
  }, {} as { [key: string]: BattleCombatant[] }) : undefined;

  const battleSession: Partial<BattleSession> = {
    battleId,
    status: 'active' as BattleStatus, // Battle starts immediately
    createdAt: serverTimestamp() as Timestamp,
    updatedAt: serverTimestamp() as Timestamp,
    hostId,
    participants: [hostParticipant],
    allies: cleanedAllies,
    enemies: cleanedEnemies,
    mode: config.mode,
    wave: config.wave || 1,
    maxWaves: config.maxWaves,
    difficulty: config.difficulty,
    chapterId: config.chapterId,
    chapterName: config.chapterName,
    challengeId: config.challengeId,
    challengeName: config.challengeName,
    challengeNumber: config.challengeNumber,
    customWaves: cleanedCustomWaves,
    pendingMoves: {},
    battleLog: [{
      timestamp: Timestamp.now(), // Use Timestamp.now() instead of serverTimestamp() for arrays
      text: 'Welcome to the MST Battle Arena!',
      type: 'system'
    }, {
      timestamp: Timestamp.now(), // Use Timestamp.now() instead of serverTimestamp() for arrays
      text: 'Select a move to begin your attack!',
      type: 'system'
    }],
    phase: 'selection',
    turnCount: 1,
    rngSeed: config.rngSeed || Date.now()
  };

  const battleSessionRef = doc(db, 'battleSessions', battleId);
  await setDoc(battleSessionRef, battleSession);
  
  console.log(`✅ Created battle session: ${battleId}`);
}

/**
 * Join an existing battle session
 */
export async function joinBattleSession(
  battleId: string,
  participant: {
    uid: string;
    displayName: string;
    photoURL?: string;
    level?: number;
    currentPP?: number;
    maxPP?: number;
    shieldStrength?: number;
    maxShieldStrength?: number;
    currentVaultHealth?: number;
    maxVaultHealth?: number;
  }
): Promise<void> {
  console.log('🔵 joinBattleSession: Starting for battleId:', battleId, 'participant:', participant.uid);
  
  if (!battleId) {
    throw new Error('Battle ID is required');
  }
  
  if (!participant.uid) {
    throw new Error('Participant UID is required');
  }
  
  const battleSessionRef = doc(db, 'battleSessions', battleId);
  const battleSessionDoc = await getDoc(battleSessionRef);
  
  if (!battleSessionDoc.exists()) {
    console.error('❌ joinBattleSession: Battle session does not exist:', battleId);
    throw new Error(`Battle session ${battleId} does not exist`);
  }

  console.log('✅ joinBattleSession: Battle session exists');
  const battleSession = battleSessionDoc.data() as BattleSession;
  
  // Check if already a participant
  const isAlreadyParticipant = battleSession.participants.some(p => p.uid === participant.uid);
  const isAlreadyAlly = battleSession.allies.some(a => a.id === participant.uid);
  
  if (!isAlreadyParticipant) {
    // Build participant object, ensuring no undefined values
    const newParticipantRaw: any = {
      uid: participant.uid,
      displayName: participant.displayName || 'Unknown Player',
      joinedAt: Timestamp.now(), // Use Timestamp.now() instead of serverTimestamp() for arrays
      isReady: false,
      connected: true
    };
    
    // Only add optional fields if they have defined values
    if (participant.photoURL) {
      newParticipantRaw.photoURL = participant.photoURL;
    }
    if (participant.level !== undefined) {
      newParticipantRaw.level = participant.level;
    }
    
    // Sanitize to remove any undefined values
    const newParticipant = sanitizeFirestoreData(newParticipantRaw) as BattleParticipant;
    
    // Debug log to verify no undefined values
    console.log('BattleSessionManager: Adding participant:', JSON.stringify(newParticipant));

    // Create ally combatant if not already in allies
    let newAlly: BattleCombatant | null = null;
    if (!isAlreadyAlly) {
      // Get vault data if not provided
      // Initialize with defaults to ensure TypeScript knows they're always defined
      let currentPP: number = participant.currentPP ?? 0;
      let maxPP: number = participant.maxPP ?? 1000;
      let shieldStrength: number = participant.shieldStrength ?? 0;
      let maxShieldStrength: number = participant.maxShieldStrength ?? 100;
      let currentVaultHealth: number = participant.currentVaultHealth ?? 0;
      let maxVaultHealth: number = participant.maxVaultHealth ?? Math.floor(maxPP * 0.1);
      
      // If vault data not provided, fetch from Firestore
      if (participant.currentPP === undefined || participant.maxPP === undefined) {
        try {
          const vaultRef = doc(db, 'vaults', participant.uid);
          const vaultDoc = await getDoc(vaultRef);
          
          if (vaultDoc.exists()) {
            const vaultData = vaultDoc.data();
            const fetchedMaxPP = vaultData.capacity || 1000;
            const fetchedCurrentPP = vaultData.currentPP || 0;
            maxPP = fetchedMaxPP;
            currentPP = fetchedCurrentPP;
            shieldStrength = vaultData.shieldStrength || 0;
            maxShieldStrength = vaultData.maxShieldStrength || 100;
            maxVaultHealth = Math.floor(fetchedMaxPP * 0.1);
            currentVaultHealth = vaultData.vaultHealth !== undefined 
              ? Math.min(vaultData.vaultHealth, maxVaultHealth)
              : Math.min(fetchedCurrentPP, maxVaultHealth);
          } else {
            // Fallback to student data
            const studentRef = doc(db, 'students', participant.uid);
            const studentDoc = await getDoc(studentRef);
            const studentData = studentDoc.exists() ? studentDoc.data() : {};
            const fallbackCurrentPP = studentData.powerPoints || 0;
            const fallbackMaxPP = 1000;
            currentPP = fallbackCurrentPP;
            maxPP = fallbackMaxPP;
            shieldStrength = 0;
            maxShieldStrength = 0;
            maxVaultHealth = Math.floor(fallbackMaxPP * 0.1);
            currentVaultHealth = Math.min(fallbackCurrentPP, maxVaultHealth);
          }
        } catch (error) {
          console.error(`Error fetching vault data for ${participant.uid}:`, error);
          // Use defaults - ensure all values are defined
          currentPP = participant.currentPP ?? 0;
          maxPP = participant.maxPP ?? 1000;
          shieldStrength = participant.shieldStrength ?? 0;
          maxShieldStrength = participant.maxShieldStrength ?? 100;
          maxVaultHealth = Math.floor(maxPP * 0.1);
          currentVaultHealth = participant.currentVaultHealth ?? Math.min(currentPP, maxVaultHealth);
        }
      } else {
        // Use provided values, calculate vault health if not provided
        if (participant.maxVaultHealth === undefined) {
          maxVaultHealth = Math.floor(maxPP * 0.1);
        } else {
          maxVaultHealth = participant.maxVaultHealth;
        }
        if (participant.currentVaultHealth === undefined) {
          currentVaultHealth = Math.min(currentPP, maxVaultHealth);
        } else {
          currentVaultHealth = participant.currentVaultHealth;
        }
      }

      // Build newAlly object, only including optional fields if they're defined
      const newAllyRaw: any = {
        id: participant.uid,
        name: participant.displayName,
        currentPP: currentPP,
        maxPP: maxPP,
        shieldStrength: shieldStrength,
        maxShieldStrength: maxShieldStrength,
        level: participant.level ?? 1,
        isPlayer: true
      };
      
      // Add optional fields only if defined
      if (currentVaultHealth !== undefined) {
        newAllyRaw.currentVaultHealth = currentVaultHealth;
      }
      if (maxVaultHealth !== undefined) {
        newAllyRaw.maxVaultHealth = maxVaultHealth;
      }
      if (participant.photoURL) {
        newAllyRaw.avatar = participant.photoURL;
        newAllyRaw.photoURL = participant.photoURL;
      }
      
      // Clean the ally object to ensure Firestore compatibility
      newAlly = cleanCombatant(newAllyRaw as BattleCombatant);
    }

    // Update battle session with participant and ally
    // Sanitize all data before writing to Firestore
    const updates: any = {
      participants: arrayUnion(sanitizeFirestoreData(newParticipant)),
      updatedAt: serverTimestamp()
    };
    
    if (newAlly) {
      updates.allies = arrayUnion(sanitizeFirestoreData(newAlly));
    }

    // Final sanitization of the entire updates object
    const sanitizedUpdates = sanitizeFirestoreData(updates);
    
    console.log('🔵 joinBattleSession: Writing updates to Firestore');
    console.log('🔵 joinBattleSession: Updates payload:', JSON.stringify(sanitizedUpdates, null, 2));
    
    try {
      await updateDoc(battleSessionRef, sanitizedUpdates);
      console.log('✅ joinBattleSession: Successfully updated battle session');
    } catch (updateError: any) {
      console.error('❌ joinBattleSession: Error updating battle session:', updateError);
      console.error('❌ joinBattleSession: Error details:', {
        message: updateError?.message,
        code: updateError?.code,
        stack: updateError?.stack,
        battleId,
        participantUid: participant.uid
      });
      throw updateError;
    }
    
    // Add join message to battle log
    await addBattleLogEntry(battleId, {
      text: `👋 ${participant.displayName} joined the battle!`,
      type: 'system'
    });
    
    console.log(`✅ ${participant.displayName} joined battle session: ${battleId}`, {
      addedToParticipants: true,
      addedToAllies: !!newAlly
    });
  } else {
    // Update connection status
    await updateParticipantConnection(battleId, participant.uid, true);
    
    // Also ensure they're in allies array (in case they were added to participants but not allies)
    if (!isAlreadyAlly) {
      // Get vault data and add to allies
      try {
        const vaultRef = doc(db, 'vaults', participant.uid);
        const vaultDoc = await getDoc(vaultRef);
        
        let currentPP = 0;
        let maxPP = 1000;
        let shieldStrength = 0;
        let maxShieldStrength = 0;
        let currentVaultHealth = 0;
        let maxVaultHealth = 100;
        
        if (vaultDoc.exists()) {
          const vaultData = vaultDoc.data();
          maxPP = vaultData.capacity || 1000;
          currentPP = vaultData.currentPP || 0;
          shieldStrength = vaultData.shieldStrength || 0;
          maxShieldStrength = vaultData.maxShieldStrength || 100;
          maxVaultHealth = Math.floor(maxPP * 0.1);
          currentVaultHealth = vaultData.vaultHealth !== undefined 
            ? Math.min(vaultData.vaultHealth, maxVaultHealth)
            : Math.min(currentPP, maxVaultHealth);
        } else {
          const studentRef = doc(db, 'students', participant.uid);
          const studentDoc = await getDoc(studentRef);
          const studentData = studentDoc.exists() ? studentDoc.data() : {};
          currentPP = studentData.powerPoints || 0;
          maxPP = 1000;
          maxVaultHealth = Math.floor(maxPP * 0.1);
          currentVaultHealth = Math.min(currentPP, maxVaultHealth);
        }
        
        const newAllyRaw: any = {
          id: participant.uid,
          name: participant.displayName,
          currentPP,
          maxPP,
          shieldStrength,
          maxShieldStrength,
          level: participant.level ?? 1,
          isPlayer: true
        };
        
        // Add optional fields only if defined
        if (currentVaultHealth !== undefined) {
          newAllyRaw.currentVaultHealth = currentVaultHealth;
        }
        if (maxVaultHealth !== undefined) {
          newAllyRaw.maxVaultHealth = maxVaultHealth;
        }
        if (participant.photoURL) {
          newAllyRaw.avatar = participant.photoURL;
          newAllyRaw.photoURL = participant.photoURL;
        }
        
        // Clean the ally object to ensure Firestore compatibility
        const newAlly: BattleCombatant = cleanCombatant(newAllyRaw as BattleCombatant);
        
        await updateDoc(battleSessionRef, {
          allies: arrayUnion(newAlly),
          updatedAt: serverTimestamp()
        });
        
        console.log(`✅ Added ${participant.displayName} to allies array (was missing)`);
      } catch (error) {
        console.error(`Error adding ${participant.displayName} to allies:`, error);
      }
    }
    
    console.log(`✅ ${participant.displayName} reconnected to battle session: ${battleId}`);
  }
}

/**
 * Update participant connection status
 */
export async function updateParticipantConnection(
  battleId: string,
  uid: string,
  connected: boolean
): Promise<void> {
  const battleSessionRef = doc(db, 'battleSessions', battleId);
  const battleSessionDoc = await getDoc(battleSessionRef);
  
  if (!battleSessionDoc.exists()) return;
  
  const battleSession = battleSessionDoc.data() as BattleSession;
  const participants = battleSession.participants.map(p => 
    p.uid === uid ? { ...p, connected } : p
  );
  
  await updateDoc(battleSessionRef, {
    participants,
    updatedAt: serverTimestamp()
  });
}

/**
 * Subscribe to battle session updates
 */
export function subscribeToBattleSession(
  battleId: string,
  callback: (battleSession: BattleSession | null) => void
): Unsubscribe {
  const battleSessionRef = doc(db, 'battleSessions', battleId);
  
  // Helper function to check if error is a Firestore internal assertion error
  const isFirestoreInternalError = (error: any): boolean => {
    if (!error) return false;
    const errorString = String(error);
    const errorMessage = error?.message || '';
    const errorCode = error?.code || '';
    return errorString.includes('INTERNAL ASSERTION FAILED') || 
           errorMessage.includes('INTERNAL ASSERTION FAILED') ||
           errorString.includes('ID: ca9') ||
           errorString.includes('ID: b815') ||
           errorCode === 'failed-precondition';
  };
  
  return onSnapshot(
    battleSessionRef,
    (snapshot) => {
      try {
        if (snapshot.exists()) {
          const data = snapshot.data() as BattleSession;
          console.log(`📡 Battle session update received: ${battleId}`, {
            status: data.status,
            participants: data.participants.length,
            phase: data.phase,
            turnCount: data.turnCount
          });
          callback(data);
        } else {
          console.warn(`⚠️ Battle session ${battleId} does not exist`);
          callback(null);
        }
      } catch (error) {
        if (isFirestoreInternalError(error)) {
          console.warn(`⚠️ Firestore internal assertion error in battle session listener (suppressed): ${battleId}`);
          return;
        }
        console.error(`❌ Error processing battle session snapshot ${battleId}:`, error);
        callback(null);
      }
    },
    (error) => {
      if (isFirestoreInternalError(error)) {
        console.warn(`⚠️ Firestore internal assertion error in battle session listener (suppressed): ${battleId}`);
        return;
      }
      console.error(`❌ Error subscribing to battle session ${battleId}:`, error);
      callback(null);
    }
  );
}

/**
 * Submit a move selection for a participant
 */
export async function submitMoveSelection(
  battleId: string,
  participantId: string,
  move: {
    moveId: string;
    moveName: string;
    targetId: string;
  }
): Promise<void> {
  const battleSessionRef = doc(db, 'battleSessions', battleId);
  
  const pendingMove: PendingMove = {
    participantId,
    moveId: move.moveId,
    moveName: move.moveName,
    targetId: move.targetId,
    submittedAt: serverTimestamp() as Timestamp
  };

  await updateDoc(battleSessionRef, {
    [`pendingMoves.${participantId}`]: pendingMove,
    updatedAt: serverTimestamp()
  });
  
  console.log(`✅ Submitted move selection for ${participantId}: ${move.moveName} on ${move.targetId}`);
}

/**
 * Add an entry to the battle log
 */
export async function addBattleLogEntry(
  battleId: string,
  entry: {
    text: string;
    actorId?: string;
    moveName?: string;
    type?: 'attack' | 'heal' | 'shield' | 'system' | 'info';
  }
): Promise<void> {
  const battleSessionRef = doc(db, 'battleSessions', battleId);
  const battleSessionDoc = await getDoc(battleSessionRef);
  
  if (!battleSessionDoc.exists()) return;
  
  const battleSession = battleSessionDoc.data() as BattleSession;
  const newEntry = {
    timestamp: Timestamp.now(), // Use Timestamp.now() instead of serverTimestamp() for arrays
    text: entry.text,
    actorId: entry.actorId,
    moveName: entry.moveName,
    type: entry.type || 'info'
  };
  
  await updateDoc(battleSessionRef, {
    battleLog: arrayUnion(newEntry),
    updatedAt: serverTimestamp()
  });
}

/**
 * Update battle phase
 */
export async function updateBattlePhase(
  battleId: string,
  phase: 'selection' | 'execution' | 'opponent_turn' | 'victory' | 'defeat'
): Promise<void> {
  const battleSessionRef = doc(db, 'battleSessions', battleId);
  await updateDoc(battleSessionRef, {
    phase,
    updatedAt: serverTimestamp()
  });
}

/**
 * Update combatants (allies or enemies)
 */
export async function updateCombatants(
  battleId: string,
  combatants: BattleCombatant[],
  type: 'allies' | 'enemies'
): Promise<void> {
  const battleSessionRef = doc(db, 'battleSessions', battleId);
  await updateDoc(battleSessionRef, {
    [type]: combatants,
    updatedAt: serverTimestamp()
  });
}

/**
 * Acquire turn resolution lock (host-only)
 */
export async function acquireTurnResolutionLock(
  battleId: string,
  hostId: string,
  turnNumber: number
): Promise<boolean> {
  const battleSessionRef = doc(db, 'battleSessions', battleId);
  const battleSessionDoc = await getDoc(battleSessionRef);
  
  if (!battleSessionDoc.exists()) return false;
  
  const battleSession = battleSessionDoc.data() as BattleSession;
  
  // Check if lock is already held
  if (battleSession.turnResolutionLock) {
    const lockAge = Date.now() - battleSession.turnResolutionLock.lockedAt.toMillis();
    // If lock is older than 30 seconds, consider it stale and allow override
    if (lockAge < 30000 && battleSession.turnResolutionLock.lockedBy !== hostId) {
      console.warn(`⚠️ Turn resolution lock held by ${battleSession.turnResolutionLock.lockedBy}`);
      return false;
    }
  }
  
  // Acquire lock
  await updateDoc(battleSessionRef, {
    turnResolutionLock: {
      lockedBy: hostId,
      lockedAt: serverTimestamp() as Timestamp,
      turnNumber
    },
    updatedAt: serverTimestamp()
  });
  
  console.log(`🔒 Acquired turn resolution lock for turn ${turnNumber}`);
  return true;
}

/**
 * Release turn resolution lock
 */
export async function releaseTurnResolutionLock(battleId: string): Promise<void> {
  const battleSessionRef = doc(db, 'battleSessions', battleId);
  await updateDoc(battleSessionRef, {
    turnResolutionLock: null,
    updatedAt: serverTimestamp()
  });
  
  console.log(`🔓 Released turn resolution lock`);
}

/**
 * Clear pending moves (after turn resolution)
 */
export async function clearPendingMoves(battleId: string): Promise<void> {
  const battleSessionRef = doc(db, 'battleSessions', battleId);
  await updateDoc(battleSessionRef, {
    pendingMoves: {},
    updatedAt: serverTimestamp()
  });
}

/**
 * Update turn queue
 */
export async function updateTurnQueue(
  battleId: string,
  turnQueue: Array<{
    participantId: string;
    orderScore: number;
    speed: number;
    random: number;
    priority: number;
  }>
): Promise<void> {
  const battleSessionRef = doc(db, 'battleSessions', battleId);
  await updateDoc(battleSessionRef, {
    turnQueue,
    currentTurnIndex: 0,
    updatedAt: serverTimestamp()
  });
}

/**
 * Update battle status
 */
export async function updateBattleStatus(
  battleId: string,
  status: BattleStatus
): Promise<void> {
  const battleSessionRef = doc(db, 'battleSessions', battleId);
  await updateDoc(battleSessionRef, {
    status,
    updatedAt: serverTimestamp()
  });
}

