import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { doc, onSnapshot, updateDoc, setDoc, serverTimestamp, getDoc, arrayUnion, arrayRemove, increment, deleteField, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import BattleEngine from './BattleEngine';
import { IslandRaidBattleRoom, IslandRaidEnemy, IslandRaidPlayer } from '../types/islandRaid';
import { getLevelFromXP } from '../utils/leveling';
import IslandRaidVictoryModal from './IslandRaidVictoryModal';
import LuzIntroCutscene from './LuzIntroCutscene';
import KonIntroCutscene from './KonIntroCutscene';
import Ch24ConclusionCutscene from './Ch24ConclusionCutscene';
import { debug } from '../utils/debug';
import { createLiveFeedMilestone } from '../services/liveFeed';
import { shouldShareEvent } from '../services/liveFeedPrivacy';

interface IslandRaidBattleProps {
  gameId: string;
  lobbyId: string;
  onLeave: () => void;
}

const IslandRaidBattle: React.FC<IslandRaidBattleProps> = ({ gameId, lobbyId, onLeave }) => {
  const { currentUser } = useAuth();
  const { vault, moves } = useBattle();
  const navigate = useNavigate();
  const [battleRoom, setBattleRoom] = useState<IslandRaidBattleRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [allies, setAllies] = useState<any[]>([]);
  const [opponents, setOpponents] = useState<any[]>([]);
  const [waveNumber, setWaveNumber] = useState(1);
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard' | 'nightmare'>('normal');
  const [battleLog, setBattleLog] = useState<string[]>(['Welcome to Island Raid!']);
  const [showVictoryModal, setShowVictoryModal] = useState(false);
  const [showLuzCutscene, setShowLuzCutscene] = useState(false);
  const [showKonCutscene, setShowKonCutscene] = useState(false);
  const [hasShownKonIntro, setHasShownKonIntro] = useState(false); // Track if Kon intro has been shown
  const [pendingWave1Start, setPendingWave1Start] = useState(false); // Track if we're waiting to start Wave 1 (legacy, not used for Kon intro anymore)
  const konIntroCompletedRef = useRef(false); // Use ref to track completion to prevent infinite loop
  const [showConclusionCutscene, setShowConclusionCutscene] = useState(false);
  const hasShownConclusionRef = useRef(false); // Track if conclusion video has been shown
  
  // Ensure Kon intro doesn't show at battle start - reset on mount
  useEffect(() => {
    setShowKonCutscene(false);
    konIntroCompletedRef.current = false;
    setHasShownKonIntro(false);
  }, []);
  const [victoryRewards, setVictoryRewards] = useState<{
    pp: number;
    xp: number;
    truthMetal: number;
    elementalRing?: { id: string; name: string; image: string };
    captainHelmet?: boolean;
  } | null>(null);
  const hasJoinedRef = useRef(false);
  const isUpdatingEnemiesRef = useRef(false); // Track when we're updating enemies to prevent listener from overwriting
  const isUpdatingEnemiesBlockStartRef = useRef<number | null>(null); // Track when the block started for safety timeout
  const isProcessingWaveTransitionRef = useRef(false); // Track when we're processing a wave transition
  const pendingWave4SpawnRef = useRef<(() => Promise<void>) | null>(null); // Store the Wave 4 spawn function
  const waveAdvanceLockRef = useRef(false); // Additional lock to prevent duplicate wave transitions
  const lastEnemiesRevisionRef = useRef<number>(0); // Track Firestore enemies revision to prevent stale updates
  const expectedWaveNumberRef = useRef<number | null>(null); // Track expected wave number during transitions to prevent oscillation
  const lastWaveUpdateTimeRef = useRef<number>(0); // Track when wave was last updated to prevent rapid oscillations
  const lastAppliedWaveRevisionRef = useRef<number>(0); // Track last applied waveRevision from Firestore
  const lastAppliedEnemiesRevisionRef = useRef<number>(0); // Track last applied enemiesRevision from Firestore
  const queuedSnapshotRef = useRef<any>(null); // Queue snapshot updates when isUpdatingEnemies is true

  // Join the battle room when component mounts
  useEffect(() => {
    if (!currentUser || !gameId || hasJoinedRef.current) return;

    const joinBattleRoom = async () => {
      try {
        const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
        const battleRoomDoc = await getDoc(battleRoomRef);

        if (battleRoomDoc.exists()) {
          const data = battleRoomDoc.data();
          const players = data.players || [];

          // Fetch game document to get all players that should be in the battle
          const gameRef = doc(db, 'islandRaidGames', gameId);
          const gameDoc = await getDoc(gameRef);
          
          let allPlayerIds = [...players];
          if (gameDoc.exists()) {
            const gameData = gameDoc.data();
            // Merge players from game document with existing battle room players
            if (gameData.players && Array.isArray(gameData.players)) {
              const gamePlayerIds = gameData.players;
              // Combine and deduplicate
              const combinedPlayers = [...gamePlayerIds, ...players];
              allPlayerIds = Array.from(new Set(combinedPlayers));
              
              // If battle room is missing players from game document, update it
              if (allPlayerIds.length > players.length) {
                console.log('🏝️ IslandRaidBattle: Syncing players from game document. Battle room had:', players.length, 'Game has:', gamePlayerIds.length, 'Total:', allPlayerIds.length);
                await updateDoc(battleRoomRef, {
                  players: allPlayerIds,
                  updatedAt: serverTimestamp()
                });
              }
            }
          }

          // Add current user to battle room if not already present
          if (!allPlayerIds.includes(currentUser.uid)) {
            await updateDoc(battleRoomRef, {
              players: arrayUnion(currentUser.uid),
              updatedAt: serverTimestamp()
            });
          }

          hasJoinedRef.current = true;
        } else {
          // Battle room doesn't exist - fetch game document to get all players
          const gameRef = doc(db, 'islandRaidGames', gameId);
          const gameDoc = await getDoc(gameRef);
          
          let allPlayerIds = [currentUser.uid];
          if (gameDoc.exists()) {
            const gameData = gameDoc.data();
            // Use players from game document if available
            if (gameData.players && Array.isArray(gameData.players)) {
              const combinedPlayers = [...gameData.players, currentUser.uid];
              allPlayerIds = Array.from(new Set(combinedPlayers)); // Ensure current user is included and deduplicated
              console.log('🏝️ IslandRaidBattle: Found players from game document:', allPlayerIds);
            }
          }
          
          // Create battle room with all players from game document
          // Fetch difficulty from game document to determine maxWaves (reuse gameDoc from above)
          const gameDifficulty = gameDoc.exists() ? (gameDoc.data().difficulty || 'normal') : 'normal';
          const maxWaves = gameDifficulty === 'easy' ? 3 : 5;
          
          const initialEnemies = generateWaveEnemies(1, gameDifficulty as 'easy' | 'normal' | 'hard' | 'nightmare');
          await setDoc(battleRoomRef, {
            id: gameId,
            gameId,
            lobbyId,
            players: allPlayerIds,
            enemies: initialEnemies,
            waveNumber: 1,
            maxWaves: maxWaves,
            status: 'active',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          console.log('🏝️ IslandRaidBattle: Created battle room with players:', allPlayerIds);
          hasJoinedRef.current = true;
        }
      } catch (error) {
        console.error('Error joining battle room:', error);
      }
    };

    joinBattleRoom();
  }, [currentUser, gameId, lobbyId]);

  // Fetch difficulty from game document
  useEffect(() => {
    if (!gameId) return;

    const fetchDifficulty = async () => {
      try {
        const gameRef = doc(db, 'islandRaidGames', gameId);
        const gameDoc = await getDoc(gameRef);
        
        if (gameDoc.exists()) {
          const gameData = gameDoc.data();
          if (gameData.difficulty) {
            setDifficulty(gameData.difficulty);
          }
        }
      } catch (error) {
        console.error('Error fetching game difficulty:', error);
      }
    };

    fetchDifficulty();
  }, [gameId]);

  // Listen to battle room updates
  useEffect(() => {
    if (!gameId || !currentUser) return;

    const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
    
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
    
    // Note: Callback must be synchronous - async work is handled via setTimeout
    const unsubscribe = onSnapshot(battleRoomRef, (docSnapshot) => {
      // Use setTimeout to handle async operations outside the listener callback
      setTimeout(async () => {
        // QUEUE UPDATES INSTEAD OF SKIPPING: If we're updating enemies, queue the snapshot for later
        if (isUpdatingEnemiesRef.current) {
          const blockStartTime = isUpdatingEnemiesBlockStartRef.current || Date.now();
          if (!isUpdatingEnemiesBlockStartRef.current) {
            isUpdatingEnemiesBlockStartRef.current = blockStartTime;
          }
          const blockDuration = Date.now() - blockStartTime;
          if (blockDuration > 3000) {
            debug.warn('IslandRaidBattle', 'isUpdatingEnemiesRef blocked for >3s, forcing reset');
            isUpdatingEnemiesRef.current = false;
            isUpdatingEnemiesBlockStartRef.current = null;
          } else {
            // Queue the snapshot instead of skipping
            debug.log('IslandRaidBattle', 'Queueing snapshot update (currently updating enemies)');
            queuedSnapshotRef.current = docSnapshot;
            return;
          }
        }
        
        // Process queued snapshot if available
        const snapshotToProcess = queuedSnapshotRef.current || docSnapshot;
        if (queuedSnapshotRef.current) {
          queuedSnapshotRef.current = null; // Clear queue
          debug.log('IslandRaidBattle', 'Processing queued snapshot update');
        }

        try {
          if (snapshotToProcess.exists()) {
            const data = snapshotToProcess.data();
            
            // REVISION-BASED GUARDING: Check if this update is newer than what we've already applied
            const incomingWaveRevision = data.waveRevision || 0;
            const incomingEnemiesRevision = data.enemiesRevision || 0;
            
            // Only apply if revisions are newer (prevents out-of-order updates)
            if (incomingWaveRevision < lastAppliedWaveRevisionRef.current) {
              debug.log('IslandRaidBattle', '⏸️ Skipping stale wave revision update', {
                incoming: incomingWaveRevision,
                lastApplied: lastAppliedWaveRevisionRef.current
              });
              return;
            }
            
            if (incomingEnemiesRevision < lastAppliedEnemiesRevisionRef.current) {
              debug.log('IslandRaidBattle', '⏸️ Skipping stale enemies revision update', {
                incoming: incomingEnemiesRevision,
                lastApplied: lastAppliedEnemiesRevisionRef.current
              });
              // Still update other fields, just not enemies
            }
            
            // Convert enemy spawnTime from Firestore Timestamp to Date if needed
            const enemies = (data.enemies || []).map((enemy: any) => ({
              ...enemy,
              spawnTime: enemy.spawnTime?.toDate ? enemy.spawnTime.toDate() : (enemy.spawnTime || new Date())
            }));
            const room: IslandRaidBattleRoom = {
              id: snapshotToProcess.id,
              ...data,
              createdAt: data.createdAt?.toDate() || new Date(),
              updatedAt: data.updatedAt?.toDate() || new Date(),
              enemies: enemies,
              players: data.players || []
            } as IslandRaidBattleRoom;
            
            // Preserve customWaves if it exists (for Chapter 2 story battles)
            if ((data as any).customWaves) {
              (room as any).customWaves = (data as any).customWaves;
            }

            debug.throttle('battle-room-update', 2000, 'IslandRaidBattle', 'Battle room updated', {
              players: room.players.length,
              enemies: room.enemies.length,
              waveNumber: room.waveNumber,
              waveRevision: incomingWaveRevision,
              enemiesRevision: incomingEnemiesRevision
            });
            
            // Only update battleRoom state if it's a significant change (wave change, new players, etc.)
            // Don't update if we're in the middle of a battle and only enemies changed
            // Use shallow comparison instead of JSON.stringify for better performance
            const playersChanged = !battleRoom || 
              room.players.length !== battleRoom.players.length ||
              room.players.some((id: string, idx: number) => id !== battleRoom.players[idx]);
            const shouldUpdateBattleRoom = !battleRoom || 
              room.waveNumber !== battleRoom.waveNumber ||
              playersChanged ||
              room.status !== battleRoom.status;
            
            if (shouldUpdateBattleRoom) {
              setBattleRoom(room);
            }
            const currentWave = room.waveNumber || 1;
            
            // Update revision refs if this is a newer revision
            if (incomingWaveRevision >= lastAppliedWaveRevisionRef.current) {
              lastAppliedWaveRevisionRef.current = incomingWaveRevision;
            }
            if (incomingEnemiesRevision >= lastAppliedEnemiesRevisionRef.current) {
              lastAppliedEnemiesRevisionRef.current = incomingEnemiesRevision;
            }
            
            // CRITICAL: Firestore is the single source of truth for wave numbers
            // Only update local state if:
            // 1. It's a valid sequential progression (next wave, same wave, or going backwards)
            // 2. We're not in the middle of a transition that expects a different wave
            // 3. Enough time has passed since last update to prevent rapid oscillations
            const isProcessingTransition = isProcessingWaveTransitionRef.current || waveAdvanceLockRef.current;
            const now = Date.now();
            const timeSinceLastUpdate = now - lastWaveUpdateTimeRef.current;
            const minUpdateInterval = 1000; // Minimum 1 second between wave updates to prevent oscillation
            
            // Check if we're expecting a specific wave number during transition
            const expectedWave = expectedWaveNumberRef.current;
            const isExpectedWave = expectedWave !== null && currentWave === expectedWave;
            
            // Determine if update is valid
            const isValidProgression = currentWave === waveNumber + 1 || currentWave === waveNumber || currentWave < waveNumber;
            // CRITICAL: If we're expecting a specific wave and Firestore matches it, always update (even during transition)
            const isExpectedWaveMatch = expectedWave !== null && currentWave === expectedWave;
            const isDuringTransition = isProcessingTransition && (isExpectedWaveMatch || currentWave === waveNumber + 1);
            // Allow immediate update if it's the expected wave (bypass throttling)
            const hasEnoughTimePassed = timeSinceLastUpdate >= minUpdateInterval || currentWave === waveNumber || isExpectedWaveMatch;
            
            if ((isValidProgression || isDuringTransition || isExpectedWaveMatch) && hasEnoughTimePassed) {
              // Valid progression: next wave, same wave, going backwards (reset), or expected wave during transition
              if (currentWave !== waveNumber) {
                console.log(`🏝️ IslandRaidBattle: Wave number updated from ${waveNumber} to ${currentWave} (Firestore is source of truth)`, {
                  isExpectedWave: isExpectedWaveMatch,
                  expectedWave,
                  isDuringTransition,
                  timeSinceLastUpdate
                });
                lastWaveUpdateTimeRef.current = now;
                // Clear expected wave if we've reached it
                if (expectedWave !== null && currentWave === expectedWave) {
                  console.log(`✅ IslandRaidBattle: Reached expected wave ${expectedWave}, clearing expectedWaveNumberRef`);
                  expectedWaveNumberRef.current = null;
                }
              }
              setWaveNumber(currentWave);
            } else if (currentWave > waveNumber + 1) {
              // Invalid: trying to skip waves - log warning and don't update
              console.warn(`⚠️ IslandRaidBattle: Attempted to skip from Wave ${waveNumber} to Wave ${currentWave}. Blocking invalid wave progression.`);
              // Don't update waveNumber - keep it at the current valid value
            } else if (!hasEnoughTimePassed && currentWave !== waveNumber && !isExpectedWaveMatch) {
              // Prevent rapid oscillations - log but don't update (unless it's expected wave)
              console.log(`⏸️ IslandRaidBattle: Wave update throttled (${timeSinceLastUpdate}ms < ${minUpdateInterval}ms). Current: ${waveNumber}, Firestore: ${currentWave}`);
            }
            
            // Note: Kon intro is now shown after Wave 3 completes (before Wave 4)
            // See wave transition logic for Wave 3 → 4
            
            // Add wave begin message to battle log if this is the initial load or wave changed
            // Only add wave begin message if we're on the correct wave and it's not already in the log
            if (room.enemies && room.enemies.length > 0 && !pendingWave1Start) {
              const waveBeginPattern = new RegExp(`WAVE ${currentWave} BEGINS`, 'i');
              const hasWaveBeginMessage = battleLog.some(log => waveBeginPattern.test(log));
              
              if (!hasWaveBeginMessage) {
                setBattleLog(prev => {
                  return [...prev, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, `🌊 WAVE ${currentWave} BEGINS!`, `Enemies: ${room.enemies.length}`, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`];
                });
              }
            }
            
            setLoading(false);

            // Load player data for allies - load ALL players in the battle room
            const playerIds = room.players || [];
            console.log('🏝️ IslandRaidBattle: Loading player data for:', playerIds.length, 'players:', playerIds);
            
            // Load all players in parallel for better performance
            const playerPromises = playerIds.map(async (userId: string) => {
              try {
                const [studentRef, vaultRef] = await Promise.all([
                  getDoc(doc(db, 'students', userId)),
                  getDoc(doc(db, 'vaults', userId))
                ]);
                
                if (studentRef.exists()) {
                  const studentData = studentRef.data();
                  const playerLevel = getLevelFromXP(studentData.xp || 0);
                  
                  // Load vault data for accurate health and shield stats
                  let vaultHealth = 100;
                  let maxVaultHealth = 100;
                  let shieldStrength = 100;
                  let maxShieldStrength = 100;
                  let currentPP = studentData.powerPoints || 0;
                  let maxPP = 1000;
                  
                  if (vaultRef.exists()) {
                    const vaultData = vaultRef.data();
                    maxPP = vaultData.capacity || 1000;
                    currentPP = vaultData.currentPP || 0;
                    
                    // Max vault health is 10% of max PP (capacity is the max PP)
                    maxVaultHealth = Math.floor(maxPP * 0.1);
                    vaultHealth = vaultData.vaultHealth !== undefined 
                      ? Math.min(vaultData.vaultHealth, maxVaultHealth, currentPP)
                      : Math.min(currentPP, maxVaultHealth);
                    
                    // Shield stats from vault
                    shieldStrength = vaultData.shieldStrength || 0;
                    maxShieldStrength = vaultData.maxShieldStrength || 100;
                  }
                  
                  return {
                    id: userId,
                    name: studentData.displayName || 'Player',
                    currentPP: currentPP,
                    maxPP: maxPP,
                    shieldStrength: shieldStrength,
                    maxShieldStrength: maxShieldStrength,
                    level: playerLevel,
                    photoURL: studentData.photoURL || null,
                    health: vaultHealth,
                    maxHealth: maxVaultHealth,
                    vaultHealth: vaultHealth, // Use vaultHealth for Island Raid to show health bar
                    maxVaultHealth: maxVaultHealth
                  };
                }
              } catch (error) {
                console.error(`Error loading player ${userId}:`, error);
              }
              return null;
            });

            const loadedPlayers = await Promise.all(playerPromises);
            const validPlayers = loadedPlayers.filter((p): p is any => p !== null);
            console.log('🏝️ IslandRaidBattle: Loaded players:', validPlayers.length, 'Player IDs in room:', playerIds, 'Valid players:', validPlayers.map(p => ({ name: p.name, id: p.id })));
            setAllies(validPlayers);

            // Always sync enemy health/shield changes from Firestore to keep all players in sync
            // Skip if we're currently updating enemies (prevent circular updates)
            if (!isUpdatingEnemiesRef.current && room.enemies) {
              // Check if we need to update opponents (new enemies, wave change, or health/shield changes)
              const hasNewEnemies = opponents.length === 0 || room.enemies.length !== opponents.length;
              const hasWaveChange = room.waveNumber && room.waveNumber !== waveNumber;
              
              if (hasWaveChange) {
                console.log(`🏝️ IslandRaidBattle: Wave change detected in listener: ${waveNumber} → ${room.waveNumber}`);
              }
              
              // CRITICAL: Check if enemy IDs are different (indicates completely new wave)
              // This is more reliable than just checking count, as it detects when enemies are replaced
              const currentEnemyIds = new Set(opponents.map(opp => opp.id));
              const newEnemyIds = new Set(room.enemies.map((enemy: IslandRaidEnemy) => enemy.id));
              const enemyIdsChanged = currentEnemyIds.size !== newEnemyIds.size || 
                !Array.from(newEnemyIds).every(id => currentEnemyIds.has(id));
              
              // Check if any enemy health or shield values have changed
              // This is critical for real-time synchronization - even small changes must be synced
              const hasHealthChanges = room.enemies.some((enemy: IslandRaidEnemy) => {
                const currentOpp = opponents.find(opp => opp.id === enemy.id);
                if (!currentOpp) return true; // New enemy
                // Check if health or shield changed (use exact comparison for precise sync)
                const currentHealth = currentOpp.vaultHealth !== undefined ? currentOpp.vaultHealth : (currentOpp.health !== undefined ? currentOpp.health : 0);
                const currentShield = currentOpp.shieldStrength || 0;
                const enemyHealth = enemy.health || 0;
                const enemyShield = enemy.shieldStrength || 0;
                const healthChanged = Math.abs(enemyHealth - currentHealth) > 0.1; // Allow small floating point differences
                const shieldChanged = Math.abs(enemyShield - currentShield) > 0.1;
                if (healthChanged || shieldChanged) {
                  console.log(`🔄 Health change detected for ${enemy.name}: health ${currentHealth} → ${enemyHealth}, shield ${currentShield} → ${enemyShield}`);
                }
                return healthChanged || shieldChanged;
              });
              
              const shouldUpdateOpponents = hasNewEnemies || hasWaveChange || hasHealthChanges || enemyIdsChanged;
              
              if (shouldUpdateOpponents) {
                // If wave changed or enemy IDs changed, completely replace opponents (don't merge)
                // This ensures old enemies from previous waves are removed
                const isCompleteReplacement = hasWaveChange || enemyIdsChanged;
                
                if (isCompleteReplacement) {
                  console.log(`🏝️ IslandRaidBattle: Wave change or enemy ID change detected. Completely replacing opponents. Wave: ${waveNumber} → ${room.waveNumber}, Enemy IDs changed: ${enemyIdsChanged}`);
                } else {
                  console.log('🏝️ IslandRaidBattle: Syncing enemies from Firestore. Enemy count:', room.enemies.length);
                }
                
                // Convert enemies to opponents format
                // If complete replacement, don't merge with existing opponents
                const opponentsList = room.enemies.map((enemy: IslandRaidEnemy) => {
                  // Only preserve local state if NOT a complete replacement
                  const existingOpp = isCompleteReplacement ? null : opponents.find(opp => opp.id === enemy.id);
                  
                  console.log('🏝️ IslandRaidBattle: Syncing enemy:', {
                    id: enemy.id,
                    name: enemy.name,
                    health: enemy.health,
                    maxHealth: enemy.maxHealth,
                    shieldStrength: enemy.shieldStrength,
                    previousHealth: existingOpp?.vaultHealth || existingOpp?.health,
                    isCompleteReplacement
                  });
                  
                  // Determine wave number: prioritize enemy.waveNumber, then parse from ID, then use room wave
                  let enemyWave = (enemy as any).waveNumber; // Check if enemy has waveNumber property
                  if (enemyWave === undefined || enemyWave === null) {
                    // Try to parse from ID pattern (e.g., enemy_w3_captain_0)
                    const enemyWaveMatch = enemy.id?.match(/enemy_w(\d+)/);
                    enemyWave = enemyWaveMatch ? parseInt(enemyWaveMatch[1], 10) : (room.waveNumber || waveNumber);
                  }
                  
                  // Log if waveNumber is missing or incorrect for debugging
                  if (enemyWave !== room.waveNumber && enemyWave !== waveNumber) {
                    console.log(`🔍 [LISTENER] Enemy ${enemy.name} (${enemy.id}) waveNumber: ${enemyWave}, room.waveNumber: ${room.waveNumber}, local waveNumber: ${waveNumber}`);
                  }
                  
                  // CRITICAL: Firestore is the source of truth - always use enemy.health/shield from Firestore
                  // Don't preserve local state for health/shield - sync from Firestore
                  const firestoreHealth = Number(enemy.health || 0);
                  const firestoreShield = Number(enemy.shieldStrength || 0);
                  
                  return {
                    id: enemy.id,
                    name: enemy.name,
                    currentPP: existingOpp?.currentPP || 0,
                    maxPP: existingOpp?.maxPP || 0,
                    shieldStrength: firestoreShield, // Always use Firestore value
                    maxShieldStrength: enemy.maxShieldStrength || 0,
                    level: enemy.level || existingOpp?.level || 1,
                    health: firestoreHealth, // Always use Firestore value
                    maxHealth: enemy.maxHealth || 100,
                    type: enemy.type || existingOpp?.type || 'zombie',
                    image: enemy.image || existingOpp?.image || undefined,
                    vaultHealth: firestoreHealth, // Always use Firestore value (source of truth)
                    maxVaultHealth: enemy.maxHealth || 100, // Always use Firestore value
                    waveNumber: enemyWave // CRITICAL: Set waveNumber for filtering
                  };
                });
                
                console.log('🏝️ IslandRaidBattle: Synced opponents:', opponentsList.map(opp => ({
                  name: opp.name,
                  vaultHealth: opp.vaultHealth,
                  maxVaultHealth: opp.maxVaultHealth,
                  shieldStrength: opp.shieldStrength
                })));
                
                // Only set opponents if we're not waiting for Kon intro to complete
                if (!pendingWave1Start) {
                  setOpponents(opponentsList);
                }
                
                // Immediately check if all enemies are defeated after updating opponents
                // This ensures wave progression happens as soon as enemies are defeated
                // CRITICAL: Check BOTH health AND shield (consistent with main check)
                const allDefeated = opponentsList.length > 0 && opponentsList.every(opp => {
                  const health = opp.vaultHealth !== undefined 
                    ? Math.max(0, Number(opp.vaultHealth))
                    : (opp.health !== undefined 
                      ? Math.max(0, Number(opp.health))
                      : (opp.currentPP !== undefined ? Math.max(0, Number(opp.currentPP)) : 0));
                  const shield = opp.shieldStrength !== undefined 
                    ? Math.max(0, Number(opp.shieldStrength))
                    : 0;
                  return health <= 0 && shield <= 0;
                });
                
                if (allDefeated && !isProcessingWaveTransitionRef.current && !waveAdvanceLockRef.current) {
                  const currentWave = room.waveNumber || waveNumber;
                  const maxWaves = room.maxWaves || battleRoom?.maxWaves || 5;
                  
                  console.log(`🏝️ [Listener] All enemies defeated detected! Wave ${currentWave}/${maxWaves}`);
                  
                  // Trigger wave progression - the main useEffect will handle it
                  // Just ensure opponents state is updated so the useEffect can see the defeat
                }
              } else {
                if (isUpdatingEnemiesRef.current) {
                  console.log('🏝️ IslandRaidBattle: Skipping opponent update (currently updating enemies)');
                } else {
                  console.log('🏝️ IslandRaidBattle: No changes detected, skipping opponent update');
                }
              }
            }
          }
      } catch (error) {
        if (isFirestoreInternalError(error)) {
          console.warn('⚠️ IslandRaidBattle: Firestore internal assertion error in battle room listener (suppressed)');
          return;
        }
        console.error('Error processing battle room snapshot:', error);
      }
      }, 0); // Execute async work on next tick
    }, (error) => {
      if (isFirestoreInternalError(error)) {
        console.warn('⚠️ IslandRaidBattle: Firestore internal assertion error in battle room listener (suppressed)');
        return;
      }
      console.error('Error listening to battle room:', error);
    });

    return () => unsubscribe();
  }, [gameId, currentUser]);

  // Generate enemies for a wave
  const generateWaveEnemies = (wave: number, difficulty: 'easy' | 'normal' | 'hard' | 'nightmare'): IslandRaidEnemy[] => {
    const enemies: IslandRaidEnemy[] = [];

    const difficultyMultiplier = {
      easy: 0.8,
      normal: 1.0,
      hard: 1.5,
      nightmare: 2.0
    }[difficulty];

    // Easy Mode: 3 waves with unpowered zombies
    if (difficulty === 'easy') {
      if (wave === 1) {
        // Wave 1: 2 Unpowered Zombies
        for (let i = 0; i < 2; i++) {
          const baseHealth = 80;
          const baseLevel = 1;
          
          enemies.push({
            id: `enemy_${wave}_${i}`,
            type: 'zombie',
            name: `Zombie ${i + 1}`,
            health: Math.floor(baseHealth * difficultyMultiplier),
            maxHealth: Math.floor(baseHealth * difficultyMultiplier),
            shieldStrength: 0,
            maxShieldStrength: 0,
            level: Math.floor(baseLevel * difficultyMultiplier),
            damage: Math.floor(30 * difficultyMultiplier),
            moves: [],
            position: { x: Math.random() * 100, y: Math.random() * 100 },
            spawnTime: new Date(),
            waveNumber: wave,
            image: '/images/Unpowered Zombie.png'
          });
        }
      } else if (wave === 2) {
        // Wave 2: 3 Unpowered Zombies
        for (let i = 0; i < 3; i++) {
          const baseHealth = 90;
          const baseLevel = 2;
          
          enemies.push({
            id: `enemy_${wave}_${i}`,
            type: 'zombie',
            name: `Zombie ${i + 1}`,
            health: Math.floor(baseHealth * difficultyMultiplier),
            maxHealth: Math.floor(baseHealth * difficultyMultiplier),
            shieldStrength: 0,
            maxShieldStrength: 0,
            level: Math.floor(baseLevel * difficultyMultiplier),
            damage: Math.floor(35 * difficultyMultiplier),
            moves: [],
            position: { x: Math.random() * 100, y: Math.random() * 100 },
            spawnTime: new Date(),
            waveNumber: wave,
            image: '/images/Unpowered Zombie.png'
          });
        }
      } else if (wave === 3) {
        // Wave 3: 2 Unpowered Zombies + 2 Powered Zombies
        // 2 Unpowered Zombies
        for (let i = 0; i < 2; i++) {
          const baseHealth = 100;
          const baseLevel = 2;
          
          enemies.push({
            id: `enemy_${wave}_unpowered_${i}`,
            type: 'zombie',
            name: `Zombie ${i + 1}`,
            health: Math.floor(baseHealth * difficultyMultiplier),
            maxHealth: Math.floor(baseHealth * difficultyMultiplier),
            shieldStrength: 0,
            maxShieldStrength: 0,
            level: Math.floor(baseLevel * difficultyMultiplier),
            damage: Math.floor(40 * difficultyMultiplier),
            moves: [],
            position: { x: Math.random() * 100, y: Math.random() * 100 },
            spawnTime: new Date(),
            waveNumber: wave,
            image: '/images/Unpowered Zombie.png'
          });
        }
        // 2 Powered Zombies
        for (let i = 0; i < 2; i++) {
          const baseHealth = 120;
          const baseLevel = 3;
          
          enemies.push({
            id: `enemy_${wave}_powered_${i}`,
            type: 'powered_zombie',
            name: `Powered Zombie ${i + 1}`,
            health: Math.floor(baseHealth * difficultyMultiplier),
            maxHealth: Math.floor(baseHealth * difficultyMultiplier),
            shieldStrength: 0,
            maxShieldStrength: 0,
            level: Math.floor(baseLevel * difficultyMultiplier),
            damage: Math.floor(50 * difficultyMultiplier),
            moves: [],
            position: { x: Math.random() * 100, y: Math.random() * 100 },
            spawnTime: new Date(),
            waveNumber: wave,
            image: '/images/Powered Zombie.png'
          });
        }
      }
    } else {
      // Normal, Hard, Nightmare modes
      // Wave-specific enemy generation
      if (wave === 1) {
        // Wave 1: 2 Powered Zombies
        for (let i = 0; i < 2; i++) {
          const baseHealth = 100;
          const baseLevel = 2;
          
          enemies.push({
            id: `enemy_${wave}_${i}`,
            type: 'powered_zombie',
            name: `Powered Zombie ${i + 1}`,
            health: Math.floor(baseHealth * difficultyMultiplier),
            maxHealth: Math.floor(baseHealth * difficultyMultiplier),
            shieldStrength: 0,
            maxShieldStrength: 0,
            level: Math.floor(baseLevel * difficultyMultiplier),
            damage: Math.floor(40 * difficultyMultiplier),
            moves: [],
            position: { x: Math.random() * 100, y: Math.random() * 100 },
            spawnTime: new Date(),
            waveNumber: wave,
            image: '/images/Powered Zombie.png'
          });
        }
      } else if (wave === 2) {
        // Wave 2: 2 Powered Zombies
        for (let i = 0; i < 2; i++) {
          const baseHealth = 120; // Slightly stronger than wave 1
          const baseLevel = 3;
          
          enemies.push({
            id: `enemy_${wave}_${i}`,
            type: 'powered_zombie',
            name: `Powered Zombie ${i + 1}`,
            health: Math.floor(baseHealth * difficultyMultiplier),
            maxHealth: Math.floor(baseHealth * difficultyMultiplier),
            shieldStrength: 0,
            maxShieldStrength: 0,
            level: Math.floor(baseLevel * difficultyMultiplier),
            damage: Math.floor(45 * difficultyMultiplier),
            moves: [],
            position: { x: Math.random() * 100, y: Math.random() * 100 },
            spawnTime: new Date(),
            waveNumber: wave,
            image: '/images/Powered Zombie.png'
          });
        }
      } else if (wave === 3) {
        // Wave 3: 3 Powered Zombies
        for (let i = 0; i < 3; i++) {
          const baseHealth = 140;
          const baseLevel = 5;
          
          enemies.push({
            id: `enemy_${wave}_${i}`,
            type: 'powered_zombie',
            name: `Powered Zombie ${i + 1}`,
            health: Math.floor(baseHealth * difficultyMultiplier),
            maxHealth: Math.floor(baseHealth * difficultyMultiplier),
            shieldStrength: 0,
            maxShieldStrength: 0,
            level: Math.floor(baseLevel * difficultyMultiplier),
            damage: Math.floor(55 * difficultyMultiplier),
            moves: [],
            position: { x: Math.random() * 100, y: Math.random() * 100 },
            spawnTime: new Date(),
            waveNumber: wave,
            image: '/images/Powered Zombie.png'
          });
        }
      } else if (wave === 4) {
        // Wave 4: 3 Powered Zombies + 1 Unpowered Zombie
        // 3 Powered Zombies
        for (let i = 0; i < 3; i++) {
          const baseHealth = 180;
          const baseLevel = 6;
          
          enemies.push({
            id: `enemy_${wave}_powered_${i}`,
            type: 'powered_zombie',
            name: `Powered Zombie ${i + 1}`,
            health: Math.floor(baseHealth * difficultyMultiplier),
            maxHealth: Math.floor(baseHealth * difficultyMultiplier),
            shieldStrength: 0,
            maxShieldStrength: 0,
            level: Math.floor(baseLevel * difficultyMultiplier),
            damage: Math.floor(60 * difficultyMultiplier),
            moves: [],
            position: { x: Math.random() * 100, y: Math.random() * 100 },
            spawnTime: new Date(),
            waveNumber: wave,
            image: '/images/Powered Zombie.png'
          });
        }
        // 1 Unpowered Zombie
        enemies.push({
          id: `enemy_${wave}_unpowered`,
          type: 'zombie',
          name: 'Zombie',
          health: Math.floor(120 * difficultyMultiplier),
          maxHealth: Math.floor(120 * difficultyMultiplier),
          shieldStrength: 0,
          maxShieldStrength: 0,
          level: Math.floor(4 * difficultyMultiplier),
          damage: Math.floor(45 * difficultyMultiplier),
          moves: [],
          position: { x: Math.random() * 100, y: Math.random() * 100 },
          spawnTime: new Date(),
          waveNumber: wave,
          image: '/images/Unpowered Zombie.png'
        });
      } else if (wave === 5) {
        // Wave 5: 1 Zombie Captain + 3 Powered Zombies
        // First, add the Zombie Captain
        const captainHealth = 500;
        const captainLevel = 8;
        
        enemies.push({
          id: `enemy_${wave}_0`,
          type: 'zombie_captain',
          name: 'Zombie Captain',
          health: Math.floor(captainHealth * difficultyMultiplier),
          maxHealth: Math.floor(captainHealth * difficultyMultiplier),
          shieldStrength: Math.floor(200 * difficultyMultiplier),
          maxShieldStrength: Math.floor(200 * difficultyMultiplier),
          level: Math.floor(captainLevel * difficultyMultiplier),
          damage: Math.floor(80 * difficultyMultiplier),
          moves: [],
          position: { x: 50, y: 50 }, // Center position for boss
          spawnTime: new Date(),
          waveNumber: wave,
          image: '/images/Zombie Captain.png'
        });
        
        // Then add 3 Powered Zombies
        for (let i = 1; i <= 3; i++) {
          const zombieHealth = 180; // Stronger than wave 4 zombies
          const zombieLevel = 7;
          
          enemies.push({
            id: `enemy_${wave}_${i}`,
            type: 'powered_zombie',
            name: `Powered Zombie ${i}`,
            health: Math.floor(zombieHealth * difficultyMultiplier),
            maxHealth: Math.floor(zombieHealth * difficultyMultiplier),
            shieldStrength: 0,
            maxShieldStrength: 0,
            level: Math.floor(zombieLevel * difficultyMultiplier),
            damage: Math.floor(60 * difficultyMultiplier),
            moves: [],
            position: { x: Math.random() * 100, y: Math.random() * 100 },
            spawnTime: new Date(),
            waveNumber: wave,
            image: '/images/Powered Zombie.png'
          });
        }
      } else {
        // Fallback for waves beyond 5
        const enemyCount = Math.min(3 + wave, 8);
        for (let i = 0; i < enemyCount; i++) {
          const baseHealth = 200;
          const baseLevel = Math.floor(wave * 1.5);
          
          enemies.push({
            id: `enemy_${wave}_${i}`,
            type: 'powered_zombie',
            name: `Powered Zombie ${i + 1}`,
            health: Math.floor(baseHealth * difficultyMultiplier * (1 + wave * 0.2)),
            maxHealth: Math.floor(baseHealth * difficultyMultiplier * (1 + wave * 0.2)),
            shieldStrength: 0,
            maxShieldStrength: 0,
            level: Math.floor(baseLevel * difficultyMultiplier),
            damage: Math.floor(40 * difficultyMultiplier * (1 + wave * 0.15)),
            moves: [],
            position: { x: Math.random() * 100, y: Math.random() * 100 },
            spawnTime: new Date(),
            waveNumber: wave,
            image: '/images/Powered Zombie.png'
          });
        }
      }
    }

    return enemies;
  };

  // Handle leaving the battle room
  const handleLeave = async () => {
    if (!currentUser || !battleRoom) return;

    try {
      const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
      await updateDoc(battleRoomRef, {
        players: arrayRemove(currentUser.uid),
        updatedAt: serverTimestamp()
      });
      onLeave();
    } catch (error) {
      console.error('Error leaving battle room:', error);
      onLeave(); // Still navigate away even if update fails
    }
  };

  /**
   * SINGLE WAVE ENGINE: Consolidated function to advance waves deterministically
   * This is the ONLY function that should trigger wave transitions
   * 
   * @param reason - Why this function was called (for debugging)
   * @returns Promise<boolean> - true if wave was advanced, false otherwise
   */
  const advanceWaveIfNeeded = async (reason: string): Promise<boolean> => {
    // Detailed logging ONCE per attempt
    debug.groupCollapsed('IslandRaidBattle', `🌊 Wave Engine: ${reason}`);
    
    // Gather all state for logging
    const currentWave = waveNumber;
    const maxWaves = battleRoom?.maxWaves || 5;
    const firestoreWave = battleRoom?.waveNumber || currentWave;
    const firestoreWaveRevision = (battleRoom as any)?.waveRevision || 0;
    const firestoreEnemiesRevision = (battleRoom as any)?.enemiesRevision || 0;
    const isProcessing = isProcessingWaveTransitionRef.current;
    const isLocked = waveAdvanceLockRef.current;
    const lastAppliedWaveRev = lastAppliedWaveRevisionRef.current;
    const lastAppliedEnemiesRev = lastAppliedEnemiesRevisionRef.current;
    
    debug.log('IslandRaidBattle', 'Current State', {
      localWave: currentWave,
      firestoreWave,
      maxWaves,
      firestoreWaveRevision,
      firestoreEnemiesRevision,
      lastAppliedWaveRev,
      lastAppliedEnemiesRev,
      isProcessing,
      isLocked,
      opponentsCount: opponents.length,
      battleRoomStatus: battleRoom?.status
    });
    
    // Early returns with detailed logging
    if (!battleRoom || battleRoom.status === 'victory' || battleRoom.status === 'defeated') {
      debug.log('IslandRaidBattle', '❌ Early return: Battle ended or no battleRoom', {
        hasBattleRoom: !!battleRoom,
        status: battleRoom?.status
      });
      debug.groupEnd();
      return false;
    }
    
    if (!opponents.length) {
      debug.log('IslandRaidBattle', '⏸️ Early return: No opponents (might be during transition)');
      debug.groupEnd();
      return false;
    }
    
    if (isProcessing || isLocked) {
      debug.log('IslandRaidBattle', '🔒 Early return: Transition already in progress', {
        isProcessing,
        isLocked
      });
      debug.groupEnd();
      return false;
    }
    
    if (currentWave >= maxWaves) {
      debug.log('IslandRaidBattle', '🏆 All waves complete', { currentWave, maxWaves });
      debug.groupEnd();
      return false;
    }
    
    // Check if all enemies are defeated (only check current wave enemies)
    const firestoreEnemies = battleRoom.enemies || [];
    const currentWaveEnemies = opponents.filter(opp => {
      // Prioritize waveNumber property on opponent object
      if (opp.waveNumber !== undefined && opp.waveNumber !== null) {
        return opp.waveNumber === currentWave;
      }
      // Fallback: parse from ID pattern (e.g., enemy_w2_captain_1)
      const parsedWave = opp.id?.match(/enemy_w(\d+)/)?.[1] ? parseInt(opp.id.match(/enemy_w(\d+)/)?.[1] || '0') : null;
      if (parsedWave !== null && parsedWave === currentWave) {
        return true;
      }
      // Final fallback: use room's waveNumber if enemy has no waveNumber property
      return false;
    });
    
    debug.log('IslandRaidBattle', 'Enemy Filtering', {
      totalOpponents: opponents.length,
      currentWaveEnemies: currentWaveEnemies.length,
      currentWave
    });
    
    let allEnemiesDefeated = false;
    if (currentWaveEnemies.length > 0) {
      allEnemiesDefeated = currentWaveEnemies.every(opp => {
        let health = opp.vaultHealth !== undefined 
          ? Math.max(0, Number(opp.vaultHealth))
          : (opp.health !== undefined 
            ? Math.max(0, Number(opp.health))
            : (opp.currentPP !== undefined ? Math.max(0, Number(opp.currentPP)) : 0));
        let shield = opp.shieldStrength !== undefined 
          ? Math.max(0, Number(opp.shieldStrength))
          : 0;
        
        // Check Firestore if local state shows alive
        if (health > 0 || shield > 0) {
          const firestoreEnemy = firestoreEnemies.find((e: any) => e.id === opp.id);
          if (firestoreEnemy) {
            const fsHealth = firestoreEnemy.health !== undefined ? Math.max(0, Number(firestoreEnemy.health)) : health;
            const fsShield = firestoreEnemy.shieldStrength !== undefined ? Math.max(0, Number(firestoreEnemy.shieldStrength)) : shield;
            if (fsHealth <= 0 && fsShield <= 0) {
              health = 0;
              shield = 0;
            }
          }
        }
        
        return health <= 0 && shield <= 0;
      });
    } else {
      // Fallback: if no enemies match current wave, check if ALL opponents are defeated
      debug.warn('IslandRaidBattle', 'No enemies found for current wave, checking all opponents as fallback');
      allEnemiesDefeated = opponents.every(opp => {
        let health = opp.vaultHealth !== undefined 
          ? Math.max(0, Number(opp.vaultHealth))
          : (opp.health !== undefined 
            ? Math.max(0, Number(opp.health))
            : (opp.currentPP !== undefined ? Math.max(0, Number(opp.currentPP)) : 0));
        let shield = opp.shieldStrength !== undefined 
          ? Math.max(0, Number(opp.shieldStrength))
          : 0;
        return health <= 0 && shield <= 0;
      });
    }
    
    debug.log('IslandRaidBattle', 'Defeat Check', {
      allEnemiesDefeated,
      currentWaveEnemiesCount: currentWaveEnemies.length
    });
    
    if (!allEnemiesDefeated) {
      debug.log('IslandRaidBattle', '⚔️ Not all enemies defeated - continuing battle');
      debug.groupEnd();
      return false;
    }
    
    // All enemies defeated - proceed with wave transition
    const nextWave = currentWave + 1;
    
    debug.log('IslandRaidBattle', '✅ All enemies defeated - advancing wave', {
      fromWave: currentWave,
      toWave: nextWave
    });
    
    // ACQUIRE LOCK
    isProcessingWaveTransitionRef.current = true;
    waveAdvanceLockRef.current = true;
    
    try {
      const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
      
      // Verify Firestore state before proceeding
      const battleRoomDoc = await getDoc(battleRoomRef);
      const battleRoomData = battleRoomDoc.exists() ? battleRoomDoc.data() : null;
      const fsWave = battleRoomData?.waveNumber || currentWave;
      const fsWaveRevision = battleRoomData?.waveRevision || 0;
      
      // Prevent skipping waves - if Firestore is ahead, abort
      if (fsWave > currentWave) {
        debug.error('IslandRaidBattle', '❌ Firestore wave is ahead - aborting to prevent skip', {
          localWave: currentWave,
          firestoreWave: fsWave
        });
        isProcessingWaveTransitionRef.current = false;
        waveAdvanceLockRef.current = false;
        debug.groupEnd();
        return false;
      }
      
      // Get custom enemies or generate new ones
      let newEnemies: IslandRaidEnemy[];
      if (battleRoomData && (battleRoomData as any).customWaves && (battleRoomData as any).customWaves[nextWave]) {
        debug.log('IslandRaidBattle', `Using CUSTOM enemies for Wave ${nextWave}`);
        newEnemies = (battleRoomData as any).customWaves[nextWave];
        newEnemies = newEnemies.map((enemy: any) => ({
          ...enemy,
          waveNumber: enemy.waveNumber !== undefined ? enemy.waveNumber : nextWave
        }));
      } else {
        debug.log('IslandRaidBattle', `Generating enemies for Wave ${nextWave}`);
        // generateWaveEnemies is defined in this file
        newEnemies = generateWaveEnemies(nextWave, difficulty);
        newEnemies = newEnemies.map((enemy: any) => ({
          ...enemy,
          waveNumber: enemy.waveNumber !== undefined ? enemy.waveNumber : nextWave
        }));
      }
      
      // Calculate new revision numbers
      const newWaveRevision = fsWaveRevision + 1;
      const newEnemiesRevision = (battleRoomData?.enemiesRevision || 0) + 1;
      
      // Clear player moves for the new wave
      const clearPlayerMoves: any = {};
      const players = battleRoom.players || [];
      players.forEach((playerId: string) => {
        clearPlayerMoves[`playerMoves.${playerId}`] = deleteField();
      });
      
      debug.log('IslandRaidBattle', 'Writing to Firestore (atomic update)', {
        waveNumber: nextWave,
        waveRevision: newWaveRevision,
        enemiesRevision: newEnemiesRevision,
        enemiesCount: newEnemies.length
      });
      
      // ATOMIC UPDATE: Write waveNumber, enemies, and revisions in one operation
      await updateDoc(battleRoomRef, {
        waveNumber: nextWave,
        waveRevision: newWaveRevision,
        enemies: newEnemies,
        enemiesRevision: newEnemiesRevision,
        status: 'active',
        updatedAt: serverTimestamp(),
        ...clearPlayerMoves
      });
      
      // Update local refs to track applied revisions
      lastAppliedWaveRevisionRef.current = newWaveRevision;
      lastAppliedEnemiesRevisionRef.current = newEnemiesRevision;
      expectedWaveNumberRef.current = nextWave;
      lastWaveUpdateTimeRef.current = Date.now();
      
      // Convert enemies to opponents format
      const newOpponentsList = newEnemies.map((enemy: IslandRaidEnemy) => {
        const enemyWaveNumber = (enemy as any).waveNumber !== undefined ? (enemy as any).waveNumber : nextWave;
        return {
          id: enemy.id,
          name: enemy.name,
          currentPP: 0,
          maxPP: 0,
          shieldStrength: enemy.shieldStrength || 0,
          maxShieldStrength: enemy.maxShieldStrength || 0,
          level: enemy.level || 1,
          health: enemy.health,
          maxHealth: enemy.maxHealth,
          type: enemy.type || 'zombie',
          image: enemy.image || undefined,
          vaultHealth: enemy.health,
          maxVaultHealth: enemy.maxHealth,
          waveNumber: enemyWaveNumber
        };
      });
      
      // Update local state immediately (Firestore listener will also update, but revision check prevents conflicts)
      setOpponents(newOpponentsList);
      setWaveNumber(nextWave);
      
      // Update battle log
      const waveMessages = [
        `🎉 Wave ${currentWave} complete!`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `🌊 WAVE ${nextWave} BEGINS!`,
        `Enemies: ${newEnemies.length}`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      ];
      setBattleLog(prev => [...prev, ...waveMessages]);
      
      debug.log('IslandRaidBattle', '✅ Wave transition complete', {
        fromWave: currentWave,
        toWave: nextWave,
        enemiesLoaded: newOpponentsList.length,
        waveRevision: newWaveRevision,
        enemiesRevision: newEnemiesRevision
      });
      
      // Handle Chapter 2-4 cutscenes
      const isChapter24 = (battleRoom as any)?.challengeId === 'ep2-its-all-a-game' || (battleRoom as any)?.isChapter2Battle;
      const isWave3To4 = currentWave === 3 && nextWave === 4;
      const candyChoice = (battleRoom as any)?.candyChoice;
      
      if (isChapter24 && isWave3To4) {
        if (candyChoice === 'config' && !hasShownKonIntro && !showKonCutscene) {
          debug.log('IslandRaidBattle', '🎬 Showing Kon intro cutscene before Wave 4');
          pendingWave4SpawnRef.current = null; // Clear any old reference
          setShowKonCutscene(true);
          setHasShownKonIntro(true);
          // Don't release lock yet - cutscene will handle it
          debug.groupEnd();
          return true;
        } else if (candyChoice === 'on-off') {
          debug.log('IslandRaidBattle', '🎬 Showing Luz intro cutscene before Wave 4');
          setShowLuzCutscene(true);
          // Don't release lock yet - cutscene will handle it
          debug.groupEnd();
          return true;
        }
      }
      
      // Release lock
      isProcessingWaveTransitionRef.current = false;
      waveAdvanceLockRef.current = false;
      
      debug.groupEnd();
      return true;
    } catch (error) {
      debug.error('IslandRaidBattle', '❌ Error advancing wave', error);
      // Release lock on error
      isProcessingWaveTransitionRef.current = false;
      waveAdvanceLockRef.current = false;
      debug.groupEnd();
      return false;
    }
  };

  // Automatically detect when all enemies are defeated and spawn next wave
  // CONSOLIDATED: All wave transitions now go through advanceWaveIfNeeded
  useEffect(() => {
    if (!battleRoom || !opponents.length) return;
    
    // Use the single wave engine function
    advanceWaveIfNeeded('Main useEffect: Enemy defeat check').catch(error => {
      debug.error('IslandRaidBattle', 'Error in advanceWaveIfNeeded', error);
    });
  }, [opponents, waveNumber, battleRoom]);

  // Handle victory when all waves are complete
  useEffect(() => {
    if (!battleRoom || !opponents.length) return;
    
    // Check if all enemies in final wave are defeated
    const firestoreEnemies = battleRoom.enemies || [];
    const finalWave = battleRoom.maxWaves || 5;
    
    // Only check for victory if we're on the final wave
    if (waveNumber < finalWave) return;
    
    // Check if all enemies in final wave are defeated
    const finalWaveEnemies = opponents.filter(opp => {
      const oppWave = opp.waveNumber !== undefined && opp.waveNumber !== null 
        ? opp.waveNumber 
        : (opp.id?.match(/enemy_w(\d+)/)?.[1] ? parseInt(opp.id.match(/enemy_w(\d+)/)?.[1] || '0') : finalWave);
      return oppWave === finalWave;
    });
    
    const allFinalWaveEnemiesDefeated = finalWaveEnemies.length > 0 && finalWaveEnemies.every(opp => {
      const health = opp.vaultHealth !== undefined 
        ? Math.max(0, Number(opp.vaultHealth))
        : (opp.health !== undefined ? Math.max(0, Number(opp.health)) : 0);
      const shield = opp.shieldStrength !== undefined ? Math.max(0, Number(opp.shieldStrength)) : 0;
      return health <= 0 && shield <= 0;
    });
    
    if (allFinalWaveEnemiesDefeated && waveNumber >= finalWave) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`🏆 [VICTORY] All waves complete! Wave ${waveNumber}/${battleRoom.maxWaves || 5}`);
      console.log(`${'='.repeat(60)}\n`);
      // All waves complete - show victory modal
      const completeRaid = async () => {
        try {
          const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
          await updateDoc(battleRoomRef, {
            status: 'victory',
            updatedAt: serverTimestamp()
          });
          setBattleLog(prev => [...prev, '🎉 All waves cleared! Island Raid complete!']);
          
          // Grant rewards to ALL players in the battle
          const players = battleRoom.players || [];
          console.log('🏝️ Granting rewards to all players:', players.length, players);
          
          // Determine rewards based on difficulty (same for all players)
          const difficultyKey = difficulty.toLowerCase();
          let baseRewards: { pp: number; xp: number; truthMetal: number; elementalRing?: { id: string; name: string; image: string }; captainHelmet?: boolean } = { pp: 0, xp: 0, truthMetal: 0 };
          
          if (difficulty === 'easy') {
            baseRewards = { pp: 150, xp: 150, truthMetal: 0, captainHelmet: true };
          } else if (difficulty === 'normal') {
            const elementalRings = [
              { id: 'blaze-ring', name: 'Blaze Ring', image: '/images/Blaze Ring.png' },
              { id: 'terra-ring', name: 'Terra Ring', image: '/images/Terra Ring.png' },
              { id: 'aqua-ring', name: 'Aqua Ring', image: '/images/Aqua Ring.png' },
              { id: 'air-ring', name: 'Air Ring', image: '/images/Air Ring.png' }
            ];
            const randomRing = elementalRings[Math.floor(Math.random() * elementalRings.length)];
            baseRewards = { pp: 300, xp: 300, truthMetal: 1, elementalRing: randomRing, captainHelmet: true };
          }
          
          // Grant rewards to each player
          const rewardPromises = players.map(async (playerId: string) => {
            try {
              const studentRef = doc(db, 'students', playerId);
              const studentDoc = await getDoc(studentRef);
              
              if (studentDoc.exists()) {
                const studentData = studentDoc.data();
                const islandRaidCompletions = studentData.islandRaidCompletions || {};
                const isFirstCompletion = !islandRaidCompletions[difficultyKey];
                
                // Use first completion rewards if first time, otherwise reduced rewards
                let rewards = baseRewards;
                if (!isFirstCompletion) {
                  // Subsequent completions - reduced rewards (no Captain Helmet on repeat)
                  if (difficulty === 'easy') {
                    rewards = { pp: 150, xp: 150, truthMetal: 0 };
                  } else if (difficulty === 'normal') {
                    rewards = { pp: 100, xp: 100, truthMetal: 0 };
                  }
                }
                
                // Grant artifacts if first completion
                const currentArtifacts = studentData.artifacts || {};
                let updatedArtifacts = { ...currentArtifacts };
                
                if (isFirstCompletion) {
                  // Grant Captain Helmet
                  if (rewards.captainHelmet) {
                    updatedArtifacts = {
                      ...updatedArtifacts,
                      'captains-helmet': true,
                      'captains-helmet_purchase': {
                        id: 'captains-helmet',
                        name: 'Captain\'s Helmet',
                        image: '/images/Captains Helmet.png',
                        slot: 'head',
                        category: 'armor',
                        rarity: 'rare',
                        stats: {
                          manifestDamageBoost: 0.05 // 5% boost
                        },
                        obtainedAt: new Date(),
                        fromIslandRaid: true
                      }
                    };
                  }
                  
                  // Grant elemental ring if provided
                  if (rewards.elementalRing) {
                    updatedArtifacts = {
                      ...updatedArtifacts,
                      [rewards.elementalRing.id]: true,
                      [`${rewards.elementalRing.id}_purchase`]: {
                        id: rewards.elementalRing.id,
                        name: rewards.elementalRing.name,
                        image: rewards.elementalRing.image,
                        category: 'ring',
                        rarity: 'rare',
                        purchasedAt: new Date(),
                        used: false,
                        fromIslandRaid: true
                      }
                    };
                  }
                }
                
                // Update player's data
                const updates: any = {
                  powerPoints: increment(rewards.pp),
                  xp: increment(rewards.xp),
                  truthMetal: increment(rewards.truthMetal)
                };
                
                // Only update artifacts if first completion
                if (isFirstCompletion && (rewards.captainHelmet || rewards.elementalRing)) {
                  updates.artifacts = updatedArtifacts;
                  updates.islandRaidCompletions = {
                    ...islandRaidCompletions,
                    [difficultyKey]: {
                      completed: true,
                      completedAt: new Date(),
                      firstCompletion: true
                    }
                  };
                }
                
                await updateDoc(studentRef, updates);
                
                // Also update users collection
                const userRef = doc(db, 'users', playerId);
                const userDoc = await getDoc(userRef);
                if (userDoc.exists()) {
                  await updateDoc(userRef, {
                    powerPoints: increment(rewards.pp),
                    xp: increment(rewards.xp),
                    truthMetal: increment(rewards.truthMetal)
                  });
                }
                
                console.log(`✅ Rewards granted to player ${playerId}:`, rewards);
              }
            } catch (error) {
              console.error(`Error granting rewards to player ${playerId}:`, error);
            }
          });
          
          // Wait for all rewards to be granted
          await Promise.all(rewardPromises);
          
          // Show victory modal to current user with their rewards
          if (currentUser) {
            const studentRef = doc(db, 'students', currentUser.uid);
            const studentDoc = await getDoc(studentRef);
            
            if (studentDoc.exists()) {
              const studentData = studentDoc.data();
              const islandRaidCompletions = studentData.islandRaidCompletions || {};
              const isFirstCompletion = !islandRaidCompletions[difficultyKey];
              
              // Create Live Feed post for Island Raid completion (if privacy settings allow)
              try {
                const shouldShare = await shouldShareEvent(currentUser.uid, 'raid_complete');
                if (shouldShare) {
                  const playerLevel = getLevelFromXP(studentData.xp || 0);
                  
                  await createLiveFeedMilestone(
                    currentUser.uid,
                    currentUser.displayName || 'Unknown',
                    currentUser.photoURL || undefined,
                    studentData.role || undefined,
                    playerLevel,
                    'raid_complete',
                    {
                      waveNumber: battleRoom.maxWaves || 5,
                      difficulty: difficulty || 'normal'
                    },
                    `raid_complete_${currentUser.uid}_${gameId}_${Date.now()}`
                  );
                }
              } catch (error) {
                console.error('Error creating Live Feed post for Island Raid completion:', error);
              }
              
              if (isFirstCompletion) {
                // Show first completion rewards
                setVictoryRewards(baseRewards);
                setShowVictoryModal(true);
              } else {
                // Show repeat completion rewards
                if (difficulty === 'easy') {
                  setVictoryRewards({ pp: 150, xp: 150, truthMetal: 0 });
                } else if (difficulty === 'normal') {
                  setVictoryRewards({ pp: 100, xp: 100, truthMetal: 0 });
                }
                setShowVictoryModal(true);
              }
            }
          }
        } catch (error) {
          console.error('Error completing raid:', error);
        }
      };
      // Reduced delay for faster completion
      const timer = setTimeout(completeRaid, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [opponents, waveNumber, battleRoom, gameId, difficulty, currentUser, onLeave]);

  // Periodic check as fallback to ensure wave progression (runs every 500ms for faster detection)
  // CONSOLIDATED: Now uses advanceWaveIfNeeded
  useEffect(() => {
    if (!battleRoom || battleRoom.status === 'victory' || battleRoom.status === 'defeated') return;
    if (!opponents.length) return;
    if (waveNumber >= (battleRoom.maxWaves || 5)) return; // Final wave, don't check

    const checkInterval = setInterval(async () => {
      // Use the single wave engine function - all logic is consolidated there
      await advanceWaveIfNeeded('Periodic check: Fallback wave progression');
    }, 500); // Check every 500ms for faster detection

    return () => clearInterval(checkInterval);
  }, [opponents, waveNumber, battleRoom, gameId, difficulty]);

  // Handle battle end (for manual battle end scenarios)
  const handleBattleEnd = async (result: 'victory' | 'defeat' | 'escape') => {
    if (!battleRoom) return;

    try {
      const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
      
      if (result === 'escape') {
        // Player escaped - update battle room and leave
        await updateDoc(battleRoomRef, {
          status: 'escaped',
          updatedAt: serverTimestamp()
        });
        setBattleLog(prev => [...prev, 'You escaped from the battle...']);
        // Leave the battle immediately
        onLeave();
      } else if (result === 'defeat') {
        // Defeat
        await updateDoc(battleRoomRef, {
          status: 'defeated',
          updatedAt: serverTimestamp()
        });
        setBattleLog(prev => [...prev, 'Your team has been defeated...']);
      } else if (result === 'victory' && waveNumber >= (battleRoom.maxWaves || 5)) {
        // All waves complete (fallback if auto-detection didn't trigger)
        await updateDoc(battleRoomRef, {
          status: 'victory',
          updatedAt: serverTimestamp()
        });
        setBattleLog(prev => [...prev, 'All waves cleared! Island Raid complete!']);
      }
      // Note: Wave progression is now handled automatically by the useEffect above
    } catch (error) {
      console.error('Error updating battle room:', error);
      // If escape fails to update, still leave the battle
      if (result === 'escape') {
        onLeave();
      }
    }
  };

  // Handle Luz intro cutscene completion
  const handleLuzCutsceneComplete = () => {
    console.log('🏝️ Luz intro cutscene completed, spawning Wave 4');
    setShowLuzCutscene(false);
    if (pendingWave4SpawnRef.current) {
      pendingWave4SpawnRef.current();
      pendingWave4SpawnRef.current = null;
    }
  };

  // Handle Kon intro cutscene completion
  const handleKonCutsceneComplete = () => {
    console.log('\n' + '='.repeat(60));
    console.log('🎬 [KON CUTSCENE] Kon intro cutscene completed');
    console.log('='.repeat(60) + '\n');
    // Mark as completed using ref to prevent infinite loop
    konIntroCompletedRef.current = true;
    setShowKonCutscene(false);
    
    // Kon intro now shows before Wave 4, so spawn Wave 4
    if (pendingWave4SpawnRef.current) {
      console.log('🎬 [KON CUTSCENE] Calling pendingWave4SpawnRef to spawn Wave 4');
      const spawnFunction = pendingWave4SpawnRef.current;
      pendingWave4SpawnRef.current = null; // Clear ref before calling to prevent double-call
      
      // Call spawn function with a small delay to ensure cutscene is fully closed
      setTimeout(() => {
        spawnFunction().catch(error => {
          console.error('❌ [KON CUTSCENE] Error spawning Wave 4:', error);
        });
      }, 100);
    } else {
      console.warn('⚠️ [KON CUTSCENE] pendingWave4SpawnRef is null! Wave 4 spawn function was not stored.');
    }
  };

  // Handle Chapter 2-4 conclusion cutscene completion
  const handleConclusionCutsceneComplete = async () => {
    console.log('🎬 Chapter 2-4 conclusion video completed, transitioning to Chapter 2-5');
    setShowConclusionCutscene(false);
    
    // Mark battle as victory and complete the challenge
    try {
      const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
      const maxWaves = battleRoom?.maxWaves || 4;
      
      // CRITICAL: Ensure waveNumber is set to maxWaves so SonidoTransmissionModal detects completion
      // Also ensure all enemies are marked as defeated
      const currentEnemies = battleRoom?.enemies || [];
      const defeatedEnemies = currentEnemies.map((enemy: any) => ({
        ...enemy,
        health: 0,
        vaultHealth: 0,
        shieldStrength: 0
      }));
      
      console.log('📝 Chapter 2-4: Writing victory status to Firestore...', {
        gameId,
        userId: currentUser?.uid,
        maxWaves,
        enemiesCount: defeatedEnemies.length
      });
      
      await updateDoc(battleRoomRef, {
        status: 'victory',
        waveNumber: maxWaves, // Ensure we're on the final wave
        enemies: defeatedEnemies, // Mark all enemies as defeated
        updatedAt: serverTimestamp()
      });
      
      // Verify the write succeeded by reading it back
      const verifyDoc = await getDoc(battleRoomRef);
      if (verifyDoc.exists()) {
        const verifyData = verifyDoc.data();
        console.log('✅ Chapter 2-4: Battle marked as victory. Verification:', {
          status: verifyData.status,
          waveNumber: verifyData.waveNumber,
          maxWaves: verifyData.maxWaves,
          enemiesDefeated: (verifyData.enemies || []).every((e: any) => 
            (e.vaultHealth || e.health || 0) <= 0 && (e.shieldStrength || 0) <= 0
          )
        });
      } else {
        console.error('❌ Chapter 2-4: Battle room document not found after write!');
      }
      
      console.log('✅ Chapter 2-4: Battle marked as victory with all enemies defeated. SonidoTransmissionModal will detect and complete challenge.');
      
      // Give the SonidoTransmissionModal listener MORE time to detect the victory and complete the challenge
      // before closing the battle view. Increased from 500ms to 2000ms to ensure listener fires.
      setTimeout(() => {
        console.log('🚪 Chapter 2-4: Closing battle view after completion delay');
        // Close the battle and return to chapter view
        // The SonidoTransmissionModal will handle completing the challenge
        onLeave();
      }, 2000); // Increased delay to ensure listener has time to fire
    } catch (error) {
      console.error('❌ Error completing Chapter 2-4:', error);
      // Still close the battle even if update fails
      onLeave();
    }
  };

  // Handle opponents update from BattleEngine
  const handleOpponentsUpdate = async (updatedOpponents: any[]) => {
    if (!battleRoom) {
      console.warn('🏝️ IslandRaidBattle: Cannot update enemies - battleRoom is null');
      return;
    }

    if (updatedOpponents.length === 0) {
      console.warn('🏝️ IslandRaidBattle: No opponents to update');
      return;
    }

    // Set flag to prevent listener from processing this update
    // Track when the flag was set for safety timeout
    isUpdatingEnemiesRef.current = true;
    isUpdatingEnemiesBlockStartRef.current = Date.now();

    try {
      const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
      
      // CRITICAL FIX: Read current enemy state from Firestore to avoid using stale cached data
      // This ensures we use the most up-to-date health values, not potentially stale battleRoom.enemies
      let currentBattleRoomEnemies: IslandRaidEnemy[] = [];
      try {
        const battleRoomDoc = await getDoc(battleRoomRef);
        if (battleRoomDoc.exists()) {
          currentBattleRoomEnemies = (battleRoomDoc.data().enemies || []) as IslandRaidEnemy[];
          console.log('🏝️ IslandRaidBattle: Read current enemies from Firestore:', currentBattleRoomEnemies.map(e => ({
            id: e.id,
            name: e.name,
            health: e.health,
            maxHealth: e.maxHealth
          })));
        } else {
          // Fallback to cached battleRoom if Firestore read fails
          currentBattleRoomEnemies = battleRoom.enemies || [];
          console.warn('🏝️ IslandRaidBattle: Battle room not found in Firestore, using cached enemies');
        }
      } catch (error) {
        console.error('🏝️ IslandRaidBattle: Error reading current enemies from Firestore:', error);
        // Fallback to cached battleRoom if Firestore read fails
        currentBattleRoomEnemies = battleRoom.enemies || [];
      }
      
      console.log('🏝️ IslandRaidBattle: handleOpponentsUpdate called with', updatedOpponents.length, 'opponents');
      console.log('🏝️ IslandRaidBattle: Current wave:', waveNumber, 'BattleRoom wave:', battleRoom?.waveNumber);
      console.log('🏝️ IslandRaidBattle: Updated opponents data:', updatedOpponents.map(opp => ({
        id: opp.id,
        name: opp.name,
        vaultHealth: opp.vaultHealth,
        maxVaultHealth: opp.maxVaultHealth,
        shieldStrength: opp.shieldStrength,
        health: opp.health,
        waveNumber: opp.waveNumber
      })));
      console.log('🏝️ IslandRaidBattle: Current local opponents:', opponents.map(opp => ({
        id: opp.id,
        name: opp.name,
        vaultHealth: opp.vaultHealth,
        waveNumber: opp.waveNumber
      })));
      
      // Convert updated opponents to enemy format, preserving all properties
      const enemies: IslandRaidEnemy[] = updatedOpponents.map(opp => {
        // Find original enemy data from battleRoom (to preserve all properties like damage, moves, position, etc.)
        const originalEnemy = currentBattleRoomEnemies.find((e: IslandRaidEnemy) => e.id === opp.id);
        
        // Use updated health/shields from opponent (this is the authoritative source from BattleEngine)
        // CRITICAL FIX: Do NOT fall back to originalEnemy.health - that would reset health to full!
        // Only use values from opp (BattleEngine update), or if missing, use current Firestore value
        // Priority: vaultHealth (Island Raid) > health > current Firestore health (NOT original full health)
        const currentFirestoreHealth = originalEnemy?.health !== undefined ? originalEnemy.health : 100;
        const updatedHealth = opp.vaultHealth !== undefined ? opp.vaultHealth : (opp.health !== undefined ? opp.health : currentFirestoreHealth);
        const updatedMaxHealth = opp.maxVaultHealth !== undefined ? opp.maxVaultHealth : (opp.maxHealth !== undefined ? opp.maxHealth : (originalEnemy?.maxHealth || 100));
        const currentFirestoreShield = originalEnemy?.shieldStrength !== undefined ? originalEnemy.shieldStrength : 0;
        const updatedShield = opp.shieldStrength !== undefined ? opp.shieldStrength : currentFirestoreShield;
        const updatedMaxShield = opp.maxShieldStrength !== undefined ? opp.maxShieldStrength : (originalEnemy?.maxShieldStrength || 0);
        
        // Log if we're using fallback values (shouldn't happen in normal flow)
        if (opp.vaultHealth === undefined && opp.health === undefined) {
          console.warn(`⚠️ IslandRaidBattle: No health value in opponent update for ${opp.name} (${opp.id}), using Firestore value: ${currentFirestoreHealth}`);
        }
        
        // Preserve all other properties from original enemy
        return {
          id: opp.id,
          type: opp.type || originalEnemy?.type || 'zombie',
          name: opp.name || originalEnemy?.name || 'Unknown Enemy',
          health: updatedHealth,
          maxHealth: updatedMaxHealth,
          shieldStrength: updatedShield,
          maxShieldStrength: updatedMaxShield,
          level: opp.level || originalEnemy?.level || 1,
          damage: originalEnemy?.damage || 30,
          moves: originalEnemy?.moves || [],
          position: originalEnemy?.position || { x: 0, y: 0 },
          spawnTime: originalEnemy?.spawnTime || new Date(),
          waveNumber: originalEnemy?.waveNumber || waveNumber,
          image: originalEnemy?.image || opp.image || undefined
        };
      });

      // Also preserve any enemies that weren't in the updated opponents array
      const updatedEnemyIds = new Set(updatedOpponents.map(opp => opp.id));
      const preservedEnemies = currentBattleRoomEnemies.filter((e: IslandRaidEnemy) => !updatedEnemyIds.has(e.id));
      const allEnemies = [...enemies, ...preservedEnemies];

      console.log('🏝️ IslandRaidBattle: Saving enemies to Firestore:', allEnemies.map(e => ({ 
        id: e.id, 
        name: e.name, 
        health: e.health, 
        maxHealth: e.maxHealth, 
        shieldStrength: e.shieldStrength,
        maxShieldStrength: e.maxShieldStrength
      })));

      // Use transaction to prevent race conditions when multiple players update simultaneously
      // Firestore automatically retries transactions on version conflicts, but we add manual retry
      // for better error handling and to reduce console noise
      try {
        await runTransaction(db, async (transaction) => {
          const battleRoomDoc = await transaction.get(battleRoomRef);
          
          if (!battleRoomDoc.exists()) {
            throw new Error('Battle room does not exist');
          }
          
          const currentRoomData = battleRoomDoc.data();
          const currentEnemies = (currentRoomData.enemies || []) as IslandRaidEnemy[];
          
          // Merge updates intelligently: use the minimum health/shield (most damage taken)
          // This ensures all players see the worst-case state (most accurate)
          const mergedEnemies = allEnemies.map(updatedEnemy => {
            const currentEnemy = currentEnemies.find(e => e.id === updatedEnemy.id);
            
            if (!currentEnemy) {
              // New enemy, use updated values
              return updatedEnemy;
            }
            
            // Get numeric values for comparison
            const updatedHealth = Number(updatedEnemy.health || currentEnemy.health || 100);
            const currentHealth = Number(currentEnemy.health || updatedEnemy.health || 100);
            const updatedShield = Number(updatedEnemy.shieldStrength || currentEnemy.shieldStrength || 0);
            const currentShield = Number(currentEnemy.shieldStrength || updatedEnemy.shieldStrength || 0);
            
            // Merge: use minimum health/shield to ensure all players see the most damage
            // This prevents one player's update from overwriting another player's damage
            const mergedHealth = Math.min(updatedHealth, currentHealth);
            const mergedShield = Math.min(updatedShield, currentShield);
            
            // Preserve all other properties from updated enemy, but use merged health/shield
            return {
              ...updatedEnemy,
              health: mergedHealth,
              shieldStrength: mergedShield,
              // Also preserve max values from current if they exist
              maxHealth: updatedEnemy.maxHealth || currentEnemy.maxHealth || 100,
              maxShieldStrength: updatedEnemy.maxShieldStrength || currentEnemy.maxShieldStrength || 0
            };
          });
          
          // Preserve enemies that weren't in the update
          const updatedEnemyIds = new Set(allEnemies.map(e => e.id));
          const preservedEnemies = currentEnemies.filter(e => !updatedEnemyIds.has(e.id));
          const finalEnemies = [...mergedEnemies, ...preservedEnemies];
          
          transaction.update(battleRoomRef, {
            enemies: finalEnemies,
            updatedAt: serverTimestamp()
          });
        });
        
        console.log('✅ IslandRaidBattle: Successfully saved enemies to Firestore (transactional)');
      } catch (error: any) {
        // Firestore transactions automatically retry on version conflicts
        // Suppress version mismatch errors (they're expected with concurrent updates)
        const isVersionMismatch = error?.message?.includes('version') || 
                                 error?.message?.includes('does not match') ||
                                 error?.code === 'failed-precondition';
        
        if (isVersionMismatch) {
          // This is expected with concurrent updates - Firestore will retry automatically
          // The listener will sync the correct state from Firestore
          console.log('🔄 IslandRaidBattle: Transaction version conflict (expected with concurrent updates, Firestore will retry)');
        } else {
          // Other errors should be logged
          console.error('❌ IslandRaidBattle: Transaction error:', error);
          // Fall back to non-transactional update as last resort (less safe but better than failing)
          try {
            await updateDoc(battleRoomRef, {
              enemies: allEnemies,
              updatedAt: serverTimestamp()
            });
            console.warn('⚠️ IslandRaidBattle: Fallback to non-transactional update');
          } catch (fallbackError) {
            console.error('❌ IslandRaidBattle: Fallback update also failed:', fallbackError);
          }
        }
      }
      
      // Update local opponents state immediately to reflect the changes
      // CRITICAL: Handle both updates to existing opponents AND add any new opponents that might be missing
      setOpponents(prev => {
        const updatedOpponentIds = new Set(updatedOpponents.map(u => u.id));
        const updated = prev.map(opp => {
          const updatedOpp = updatedOpponents.find(u => u.id === opp.id);
          if (updatedOpp) {
            const newOpp = {
              ...opp,
              vaultHealth: updatedOpp.vaultHealth !== undefined ? updatedOpp.vaultHealth : opp.vaultHealth,
              maxVaultHealth: updatedOpp.maxVaultHealth !== undefined ? updatedOpp.maxVaultHealth : opp.maxVaultHealth,
              shieldStrength: updatedOpp.shieldStrength !== undefined ? updatedOpp.shieldStrength : opp.shieldStrength,
              maxShieldStrength: updatedOpp.maxShieldStrength !== undefined ? updatedOpp.maxShieldStrength : opp.maxShieldStrength,
              // Also update health and maxHealth for compatibility
              health: updatedOpp.vaultHealth !== undefined ? updatedOpp.vaultHealth : (updatedOpp.health !== undefined ? updatedOpp.health : opp.health),
              maxHealth: updatedOpp.maxVaultHealth !== undefined ? updatedOpp.maxVaultHealth : (updatedOpp.maxHealth !== undefined ? updatedOpp.maxHealth : opp.maxHealth)
            };
            console.log(`🔄 Updated local opponent ${opp.name} (${opp.id}): vaultHealth ${opp.vaultHealth} → ${newOpp.vaultHealth}, shield ${opp.shieldStrength} → ${newOpp.shieldStrength}`);
            
            // Check if this is Kon in Chapter 2-4 Wave 4 and his shield just broke
            const isChapter24 = (battleRoom as any)?.challengeId === 'ep2-its-all-a-game' || (battleRoom as any)?.isChapter2Battle;
            // Check wave from both local state and battleRoom to be more reliable
            const currentWave = battleRoom?.waveNumber || waveNumber;
            const isWave4 = currentWave === 4 || waveNumber === 4;
            const isKon = opp.name?.toLowerCase().includes('kon') || opp.id?.toLowerCase().includes('kon') || opp.id?.includes('kon');
            const previousShield = Math.max(0, Number(opp.shieldStrength || 0));
            const currentShield = Math.max(0, Number(newOpp.shieldStrength || 0));
            
            // Check if Kon's shield just broke (was > 0, now <= 0)
            // CRITICAL: Only trigger if shield actually went from >0 to <=0
            if (isChapter24 && isWave4 && isKon && previousShield > 0 && currentShield <= 0 && !hasShownConclusionRef.current) {
              console.log(`\n${'='.repeat(60)}`);
              console.log(`🎬 [CONCLUSION] Kon's shield broken!`);
              console.log(`   Previous shield: ${previousShield}`);
              console.log(`   Current shield: ${currentShield}`);
              console.log(`   Wave: ${currentWave} (local: ${waveNumber})`);
              console.log(`   Kon detected: ${isKon} (name: ${opp.name}, id: ${opp.id})`);
              console.log(`   Showing conclusion video...`);
              console.log(`${'='.repeat(60)}\n`);
              hasShownConclusionRef.current = true;
              setShowConclusionCutscene(true);
            }
            
            return newOpp;
          }
          return opp;
        });
        
        // Add any opponents from updatedOpponents that aren't in prev (shouldn't happen, but safety check)
        const missingOpponents = updatedOpponents.filter(u => !prev.some(p => p.id === u.id));
        if (missingOpponents.length > 0) {
          console.warn(`⚠️ IslandRaidBattle: Found ${missingOpponents.length} opponents in update that weren't in local state. Adding them.`, {
            missingIds: missingOpponents.map(o => o.id),
            currentOpponentIds: prev.map(o => o.id)
          });
          // Add missing opponents to the array
          missingOpponents.forEach(missingOpp => {
            updated.push({
              ...missingOpp,
              vaultHealth: missingOpp.vaultHealth !== undefined ? missingOpp.vaultHealth : (missingOpp.health || 0),
              maxVaultHealth: missingOpp.maxVaultHealth !== undefined ? missingOpp.maxVaultHealth : (missingOpp.maxHealth || 100),
              health: missingOpp.vaultHealth !== undefined ? missingOpp.vaultHealth : (missingOpp.health || 0),
              maxHealth: missingOpp.maxVaultHealth !== undefined ? missingOpp.maxVaultHealth : (missingOpp.maxHealth || 100)
            });
          });
        }
        
        return updated;
      });
    } catch (error) {
      console.error('❌ IslandRaidBattle: Error updating enemies in Firestore:', error);
      // Re-throw to allow caller to handle if needed
      throw error;
    } finally {
      // Clear flag after a delay to allow Firestore write to complete and listener to process
      setTimeout(() => {
        isUpdatingEnemiesRef.current = false;
        isUpdatingEnemiesBlockStartRef.current = null;
        console.log('🏝️ IslandRaidBattle: Cleared isUpdatingEnemiesRef flag');
      }, 500);
    }
  };

  // Handle allies update from BattleEngine (when players take damage)
  const handleAlliesUpdate = async (updatedAllies: any[]) => {
    if (!battleRoom || !currentUser) return;

    try {
      // Update each player's vault health and shields in Firestore
      const updatePromises = updatedAllies.map(async (ally) => {
        if (ally.vaultHealth !== undefined || ally.shieldStrength !== undefined) {
          try {
            const vaultRef = doc(db, 'vaults', ally.id);
            const vaultDoc = await getDoc(vaultRef);
            
            if (vaultDoc.exists()) {
              const vaultData = vaultDoc.data();
              const updates: any = {};
              
              if (ally.vaultHealth !== undefined) {
                updates.vaultHealth = ally.vaultHealth;
              }
              if (ally.shieldStrength !== undefined) {
                updates.shieldStrength = ally.shieldStrength;
              }
              
              if (Object.keys(updates).length > 0) {
                await updateDoc(vaultRef, updates);
                console.log(`💾 Updated vault for ${ally.name}:`, updates);
              }
            }
          } catch (error) {
            console.error(`Error updating vault for ${ally.name}:`, error);
          }
        }
      });
      
      await Promise.all(updatePromises);
      
      // Also update local allies state
      setAllies(updatedAllies);
    } catch (error) {
      console.error('Error updating allies:', error);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading Island Raid battle...</div>
      </div>
    );
  }

  if (!battleRoom) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Battle room not found.</div>
        <button onClick={onLeave} style={{
          marginTop: '1rem',
          padding: '0.5rem 1rem',
          background: '#3b82f6',
          color: 'white',
          border: 'none',
          borderRadius: '0.5rem',
          cursor: 'pointer'
        }}>
          Return to Lobby
        </button>
      </div>
    );
  }

  return (
    <div style={{ 
      position: 'relative', 
      minHeight: '100vh'
    }}>
      {/* Battle Header */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'linear-gradient(135deg, rgba(102, 126, 234, 0.95) 0%, rgba(118, 75, 162, 0.95) 100%)',
        color: 'white',
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        backdropFilter: 'blur(4px)'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>
            {(battleRoom as any)?.challengeId === 'ep2-its-all-a-game' || (battleRoom as any)?.isChapter2Battle 
              ? 'Chapter 2-4' 
              : '🏝️ Island Raid'}
          </h2>
          <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>
            Wave {waveNumber} / {battleRoom.maxWaves || 5} • Players: {battleRoom.players.length} • Difficulty: <strong>{difficulty.toUpperCase()}</strong>
          </div>
        </div>
        <button
          onClick={handleLeave}
          style={{
            background: 'rgba(255,255,255,0.2)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '0.5rem',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
        >
          Leave Battle
        </button>
      </div>

      {/* Battle Engine */}
      <BattleEngine
        onBattleEnd={handleBattleEnd}
        opponents={opponents}
        allies={allies}
        isMultiplayer={true}
        onOpponentsUpdate={handleOpponentsUpdate}
        onAlliesUpdate={handleAlliesUpdate}
        onBattleLogUpdate={setBattleLog}
        initialBattleLog={battleLog}
        gameId={gameId}
        candyChoice={(battleRoom as any)?.candyChoice}
      />
      
      {/* Victory Modal */}
      {showVictoryModal && victoryRewards && (
        <IslandRaidVictoryModal
          isOpen={showVictoryModal}
          onClose={() => {
            setShowVictoryModal(false);
            onLeave(); // Return to lobby after closing modal
          }}
          waveNumber={waveNumber}
          difficulty={difficulty}
          rewards={victoryRewards}
        />
      )}

      {/* Luz Intro Cutscene - Shows after Wave 3 in Chapter 2-4 (On/Off choice) */}
      <LuzIntroCutscene
        isOpen={showLuzCutscene}
        onComplete={handleLuzCutsceneComplete}
      />

      {/* Kon Intro Cutscene - Shows after Wave 3 in Chapter 2-4 (Config choice) */}
      <KonIntroCutscene
        isOpen={showKonCutscene}
        onComplete={handleKonCutsceneComplete}
      />

      {/* Chapter 2-4 Conclusion Cutscene - Shows when Kon's shield breaks */}
      <Ch24ConclusionCutscene
        isOpen={showConclusionCutscene}
        onComplete={handleConclusionCutsceneComplete}
      />
    </div>
  );
};

export default IslandRaidBattle;
