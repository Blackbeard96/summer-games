import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { doc, onSnapshot, updateDoc, setDoc, serverTimestamp, getDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import BattleEngine from './BattleEngine';
import { IslandRaidBattleRoom, IslandRaidEnemy, IslandRaidPlayer } from '../types/islandRaid';
import { getLevelFromXP } from '../utils/leveling';
import IslandRaidVictoryModal from './IslandRaidVictoryModal';

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
  const [victoryRewards, setVictoryRewards] = useState<{
    pp: number;
    xp: number;
    truthMetal: number;
    elementalRing?: { id: string; name: string; image: string };
  } | null>(null);
  const hasJoinedRef = useRef(false);
  const isUpdatingEnemiesRef = useRef(false); // Track when we're updating enemies to prevent listener from overwriting

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
    const unsubscribe = onSnapshot(battleRoomRef, async (docSnapshot) => {
      // Skip processing if we're currently updating enemies (prevent circular updates)
      if (isUpdatingEnemiesRef.current) {
        console.log('🏝️ IslandRaidBattle: Skipping listener update (currently updating enemies)');
        return;
      }

      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        // Convert enemy spawnTime from Firestore Timestamp to Date if needed
        const enemies = (data.enemies || []).map((enemy: any) => ({
          ...enemy,
          spawnTime: enemy.spawnTime?.toDate ? enemy.spawnTime.toDate() : (enemy.spawnTime || new Date())
        }));
        const room: IslandRaidBattleRoom = {
          id: docSnapshot.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          enemies: enemies,
          players: data.players || []
        } as IslandRaidBattleRoom;

        console.log('🏝️ IslandRaidBattle: Battle room updated, players:', room.players, 'Player count:', room.players.length);
        console.log('🏝️ IslandRaidBattle: Enemies from Firestore:', room.enemies);
        
        // Only update battleRoom state if it's a significant change (wave change, new players, etc.)
        // Don't update if we're in the middle of a battle and only enemies changed
        const shouldUpdateBattleRoom = !battleRoom || 
          room.waveNumber !== battleRoom.waveNumber ||
          JSON.stringify(room.players) !== JSON.stringify(battleRoom.players) ||
          room.status !== battleRoom.status;
        
        if (shouldUpdateBattleRoom) {
          setBattleRoom(room);
        }
        const currentWave = room.waveNumber || 1;
        setWaveNumber(currentWave);
        
        // Add wave begin message to battle log if this is the initial load
        if (currentWave === 1 && room.enemies && room.enemies.length > 0) {
          setBattleLog(prev => {
            // Only add if not already present
            if (!prev.some(log => log.includes('WAVE 1 BEGINS'))) {
              return [...prev, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, `🌊 WAVE 1 BEGINS!`, `Enemies: ${room.enemies.length}`, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`];
            }
            return prev;
          });
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
                
                // Max vault health is 10% of vault capacity
                maxVaultHealth = Math.floor((vaultData.capacity || 1000) * 0.1);
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

        // Only update opponents if we don't have any yet, or if this is a new wave (enemy count/wave changed)
        // This prevents overwriting local state during battle when handleOpponentsUpdate writes to Firestore
        // Also skip if we're currently updating enemies (prevent circular updates)
        const shouldUpdateOpponents = !isUpdatingEnemiesRef.current && (
          opponents.length === 0 || 
          (room.enemies && room.enemies.length !== opponents.length) ||
          (room.waveNumber && room.waveNumber !== waveNumber)
        );
        
        if (shouldUpdateOpponents) {
          // Convert enemies to opponents format
          console.log('🏝️ IslandRaidBattle: Converting enemies to opponents. Enemy count:', (room.enemies || []).length);
          const opponentsList = (room.enemies || []).map((enemy: IslandRaidEnemy) => {
            console.log('🏝️ IslandRaidBattle: Enemy data:', {
              id: enemy.id,
              name: enemy.name,
              health: enemy.health,
              maxHealth: enemy.maxHealth,
              shieldStrength: enemy.shieldStrength
            });
            return {
              id: enemy.id,
              name: enemy.name,
              currentPP: 0,
              maxPP: 0,
              shieldStrength: enemy.shieldStrength || 0,
              maxShieldStrength: enemy.maxShieldStrength || 0,
              level: enemy.level,
              health: enemy.health,
              maxHealth: enemy.maxHealth,
              type: enemy.type,
              image: enemy.image || undefined, // Include image if available
              vaultHealth: enemy.health, // Use health as vaultHealth for Island Raid enemies
              maxVaultHealth: enemy.maxHealth // Use maxHealth as maxVaultHealth
            };
          });
          console.log('🏝️ IslandRaidBattle: Converted opponents:', opponentsList.map(opp => ({
            name: opp.name,
            vaultHealth: opp.vaultHealth,
            maxVaultHealth: opp.maxVaultHealth
          })));
          setOpponents(opponentsList);
        } else {
          if (isUpdatingEnemiesRef.current) {
            console.log('🏝️ IslandRaidBattle: Skipping opponent update (currently updating enemies)');
          } else {
            console.log('🏝️ IslandRaidBattle: Skipping opponent update (battle in progress)');
          }
        }
      }
    }, (error) => {
      // Suppress Firestore internal assertion errors
      if (error.message?.includes('INTERNAL ASSERTION FAILED') || 
          error.message?.includes('Unexpected state')) {
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

  // Automatically detect when all enemies are defeated and spawn next wave
  useEffect(() => {
    if (!battleRoom || !opponents.length) {
      return undefined; // No battle room or no opponents yet
    }

    // Check if all enemies are defeated
    const allEnemiesDefeated = opponents.every(opp => {
      const health = opp.vaultHealth !== undefined ? opp.vaultHealth : (opp.health || 0);
      return health <= 0;
    });
    
    if (!allEnemiesDefeated) {
      return; // Not all enemies defeated yet
    }
    
    if (waveNumber < (battleRoom.maxWaves || 5)) {
      console.log(`🏝️ All enemies defeated in Wave ${waveNumber}. Spawning Wave ${waveNumber + 1}...`);
      
      const spawnNextWave = async () => {
        try {
          const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
          const nextWave = waveNumber + 1;
          const newEnemies = generateWaveEnemies(nextWave, difficulty);
          
          await updateDoc(battleRoomRef, {
            waveNumber: nextWave,
            enemies: newEnemies,
            status: 'active',
            updatedAt: serverTimestamp()
          });

          setWaveNumber(nextWave);
          const waveMessages = [
            `🎉 Wave ${waveNumber} complete!`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
            `🌊 WAVE ${nextWave} BEGINS!`,
            `Enemies: ${newEnemies.length}`,
            `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
          ];
          // Update local battle log - this will be passed to BattleEngine via initialBattleLog prop
          setBattleLog(prev => {
            const updated = [...prev, ...waveMessages];
            return updated;
          });
          
          console.log(`✅ Wave ${nextWave} spawned with ${newEnemies.length} enemies`);
        } catch (error) {
          console.error('Error spawning next wave:', error);
        }
      };

      // Small delay to allow battle log to update
      const timer = setTimeout(spawnNextWave, 1500);
      return () => clearTimeout(timer);
    }
    
    if (allEnemiesDefeated && waveNumber >= (battleRoom.maxWaves || 5)) {
      // All waves complete - show victory modal
      console.log('🏝️ All waves complete! Island Raid victory!');
      const completeRaid = async () => {
        try {
          const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
          await updateDoc(battleRoomRef, {
            status: 'victory',
            updatedAt: serverTimestamp()
          });
          setBattleLog(prev => [...prev, '🎉 All waves cleared! Island Raid complete!']);
          
          // Check if this is first completion and calculate rewards
          if (currentUser) {
            const studentRef = doc(db, 'students', currentUser.uid);
            const studentDoc = await getDoc(studentRef);
            
            if (studentDoc.exists()) {
              const studentData = studentDoc.data();
              const islandRaidCompletions = studentData.islandRaidCompletions || {};
              const difficultyKey = difficulty.toLowerCase();
              const isFirstCompletion = !islandRaidCompletions[difficultyKey];
              
              if (isFirstCompletion) {
                // Give first-time completion rewards based on difficulty
                if (difficulty === 'easy') {
                  // Easy mode: 150 PP + 150 XP
                  setVictoryRewards({
                    pp: 150,
                    xp: 150,
                    truthMetal: 0
                  });
                } else if (difficulty === 'normal') {
                  // Normal mode: 300 PP + 300 XP + random elemental ring
                  const elementalRings = [
                    { id: 'blaze-ring', name: 'Blaze Ring', image: '/images/Blaze Ring.png' },
                    { id: 'terra-ring', name: 'Terra Ring', image: '/images/Terra Ring.png' },
                    { id: 'aqua-ring', name: 'Aqua Ring', image: '/images/Aqua Ring.png' },
                    { id: 'air-ring', name: 'Air Ring', image: '/images/Air Ring.png' }
                  ];
                  
                  // Randomly select one ring
                  const randomRing = elementalRings[Math.floor(Math.random() * elementalRings.length)];
                  
                  setVictoryRewards({
                    pp: 300,
                    xp: 300,
                    truthMetal: 1,
                    elementalRing: randomRing
                  });
                } else {
                  // Hard and Nightmare (coming soon) - no rewards for now
                  setVictoryRewards({
                    pp: 0,
                    xp: 0,
                    truthMetal: 0
                  });
                }
                
                setShowVictoryModal(true);
              } else {
                // Subsequent completions - give reduced rewards
                if (difficulty === 'easy') {
                  setVictoryRewards({
                    pp: 150,
                    xp: 150,
                    truthMetal: 0
                  });
                  setShowVictoryModal(true);
                } else if (difficulty === 'normal') {
                  // Normal mode subsequent completions - reduced rewards
                  setVictoryRewards({
                    pp: 100,
                    xp: 100,
                    truthMetal: 0
                  });
                  setShowVictoryModal(true);
                }
              }
            }
          }
        } catch (error) {
          console.error('Error completing raid:', error);
        }
      };
      const timer = setTimeout(completeRaid, 1500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [opponents, waveNumber, battleRoom, gameId, difficulty, currentUser, onLeave]);

  // Handle battle end (for manual battle end scenarios)
  const handleBattleEnd = async (result: 'victory' | 'defeat' | 'escape') => {
    if (!battleRoom) return;

    try {
      const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
      
      if (result === 'defeat') {
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
    }
  };

  // Handle opponents update from BattleEngine
  const handleOpponentsUpdate = async (updatedOpponents: any[]) => {
    if (!battleRoom) return;

    // Set flag to prevent listener from processing this update
    isUpdatingEnemiesRef.current = true;

    try {
      const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
      
      // Use current local opponents state as the source of truth - this is the most up-to-date
      // Convert local opponents to enemy format, then merge with updated health/shields
      const currentLocalOpponents = opponents.length > 0 ? opponents : [];
      const currentBattleRoomEnemies = battleRoom.enemies || [];
      
      const enemies: IslandRaidEnemy[] = updatedOpponents.map(opp => {
        // First try to find original enemy data from battleRoom (preserves all properties)
        const originalEnemy = currentBattleRoomEnemies.find((e: IslandRaidEnemy) => e.id === opp.id);
        // Also check local opponents for current health/shields
        const localOpponent = currentLocalOpponents.find((e: any) => e.id === opp.id);
        
        // Use updated health/shields from opponent (this is the new state from BattleEngine)
        // This is the authoritative source for health/shields
        const updatedHealth = opp.vaultHealth !== undefined ? opp.vaultHealth : (opp.health !== undefined ? opp.health : (originalEnemy?.health || 100));
        const updatedMaxHealth = opp.maxVaultHealth !== undefined ? opp.maxVaultHealth : (opp.maxHealth !== undefined ? opp.maxHealth : (originalEnemy?.maxHealth || 100));
        const updatedShield = opp.shieldStrength !== undefined ? opp.shieldStrength : (originalEnemy?.shieldStrength || 0);
        const updatedMaxShield = opp.maxShieldStrength !== undefined ? opp.maxShieldStrength : (originalEnemy?.maxShieldStrength || 0);
        
        // Preserve all other properties from original enemy
        return {
          id: opp.id,
          type: opp.type || originalEnemy?.type || 'zombie',
          name: opp.name,
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
          image: originalEnemy?.image || localOpponent?.image || undefined
        };
      });

      // Also preserve any enemies that weren't in the updated opponents array
      const updatedEnemyIds = new Set(updatedOpponents.map(opp => opp.id));
      const preservedEnemies = currentBattleRoomEnemies.filter((e: IslandRaidEnemy) => !updatedEnemyIds.has(e.id));
      const allEnemies = [...enemies, ...preservedEnemies];

      console.log('🏝️ IslandRaidBattle: Updating enemies in Firestore:', allEnemies.map(e => ({ id: e.id, name: e.name, health: e.health, maxHealth: e.maxHealth, shieldStrength: e.shieldStrength })));

      await updateDoc(battleRoomRef, {
        enemies: allEnemies,
        updatedAt: serverTimestamp()
      });
      
      // Update local opponents state immediately to reflect the changes
      setOpponents(prev => {
        return prev.map(opp => {
          const updated = updatedOpponents.find(u => u.id === opp.id);
          if (updated) {
            return {
              ...opp,
              vaultHealth: updated.vaultHealth !== undefined ? updated.vaultHealth : opp.vaultHealth,
              maxVaultHealth: updated.maxVaultHealth !== undefined ? updated.maxVaultHealth : opp.maxVaultHealth,
              shieldStrength: updated.shieldStrength !== undefined ? updated.shieldStrength : opp.shieldStrength,
              maxShieldStrength: updated.maxShieldStrength !== undefined ? updated.maxShieldStrength : opp.maxShieldStrength
            };
          }
          return opp;
        });
      });
    } catch (error) {
      console.error('Error updating enemies:', error);
    } finally {
      // Clear flag after a longer delay to allow Firestore write to complete and listener to process
      setTimeout(() => {
        isUpdatingEnemiesRef.current = false;
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
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>🏝️ Island Raid</h2>
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
    </div>
  );
};

export default IslandRaidBattle;
