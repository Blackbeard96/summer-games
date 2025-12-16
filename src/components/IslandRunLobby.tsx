import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc, collection, addDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { IslandRunLobby, IslandRunPlayer } from '../types/islandRun';
import { getLevelFromXP } from '../utils/leveling';

const IslandRunLobbyView: React.FC = () => {
  const { lobbyId } = useParams<{ lobbyId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState<IslandRunLobby | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const hasJoinedRef = useRef(false);

  // Function to add player to lobby (extracted for reuse)
  const addPlayerToLobby = async (lobbyRef: any, players: IslandRunPlayer[]) => {
    if (!currentUser) return false;
    
    try {
      // Fetch user data to get level and XP
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      
      let playerLevel = 1;
      let playerXP = 0;
      if (studentDoc.exists()) {
        const studentData = studentDoc.data();
        playerXP = studentData.xp || 0;
        playerLevel = getLevelFromXP(playerXP);
      }

      const newPlayer: IslandRunPlayer = {
        userId: currentUser.uid,
        displayName: currentUser.displayName || 'Player',
        photoURL: currentUser.photoURL || undefined,
        level: playerLevel,
        xp: playerXP,
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

      // Check if lobby is full
      if (players.length >= 4) {
        console.warn('[IslandRunLobby] Lobby is full, cannot add player');
        return false;
      }

      const updatedPlayers = [...players, newPlayer];
      await updateDoc(lobbyRef, {
        players: updatedPlayers as any, // Type assertion needed for Firestore nested objects
        currentPlayers: updatedPlayers.length,
        updatedAt: serverTimestamp()
      });
      
      console.log('[IslandRunLobby] Successfully added player to lobby');
      return true;
    } catch (error) {
      console.error('[IslandRunLobby] Error adding player to lobby:', error);
      return false;
    }
  };

  useEffect(() => {
    if (!lobbyId || !currentUser) return;

    const lobbyRef = doc(db, 'islandRunLobbies', lobbyId);
    const unsubscribe = onSnapshot(lobbyRef, async (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        const players = data.players || [];
        const playerExists = players.some((p: IslandRunPlayer) => p.userId === currentUser.uid);

        // If player hasn't joined yet, add them to the lobby
        // Retry logic: if hasJoinedRef is false, try to join
        if (!playerExists) {
          if (!hasJoinedRef.current) {
            hasJoinedRef.current = true;
            const success = await addPlayerToLobby(lobbyRef, players);
            if (!success) {
              // If join failed, reset flag to allow retry
              hasJoinedRef.current = false;
            }
          } else {
            // Player was supposed to join but doesn't exist - retry
            console.log('[IslandRunLobby] Player should be in lobby but not found, retrying join...');
            hasJoinedRef.current = false;
            const success = await addPlayerToLobby(lobbyRef, players);
            if (success) {
              hasJoinedRef.current = true;
            }
          }
        } else {
          // Player exists - ensure flag is set
          hasJoinedRef.current = true;
        }

        // Get the latest player list (may have been updated by join attempt)
        const currentData = docSnapshot.data();
        let finalPlayers = currentData.players || [];
        
        // Final check: if player still doesn't exist and lobby is not full, try one more time
        const finalPlayerExists = finalPlayers.some((p: IslandRunPlayer) => p.userId === currentUser.uid);
        if (!finalPlayerExists && finalPlayers.length < 4 && !hasJoinedRef.current) {
          console.log('[IslandRunLobby] Final attempt: Player still not in lobby, retrying join...');
          const success = await addPlayerToLobby(lobbyRef, finalPlayers);
          if (success) {
            hasJoinedRef.current = true;
            // Re-fetch to get updated player list
            const updatedDoc = await getDoc(lobbyRef);
            if (updatedDoc.exists()) {
              const updatedData = updatedDoc.data();
              finalPlayers = updatedData.players || [];
            }
          }
        }

        const lobbyData = {
          id: docSnapshot.id,
          ...currentData,
          createdAt: currentData.createdAt?.toDate() || new Date(),
          players: finalPlayers
        } as IslandRunLobby;

        setLobby(lobbyData);
        setLoading(false);

        // Check if user is ready
        const player = finalPlayers.find((p: IslandRunPlayer) => p.userId === currentUser.uid);
        setIsReady(player?.isReady || false);

        // If game has started, redirect all players to the battle
        if (data.status === 'in_progress' && data.gameId) {
          navigate(`/island-raid/game/${data.gameId}`);
        }
      } else {
        // Lobby doesn't exist
        navigate('/island-raid');
      }
    }, (error) => {
      // Suppress Firestore internal assertion errors (known Firefox issue)
      if (error.message?.includes('INTERNAL ASSERTION FAILED') || 
          error.message?.includes('Unexpected state')) {
        return;
      }
      console.error('Error listening to lobby:', error);
    });

    return () => {
      unsubscribe();
      hasJoinedRef.current = false;
    };
  }, [lobbyId, currentUser, navigate]);

  const handleToggleReady = async () => {
    if (!lobbyId || !currentUser || !lobby) return;

    try {
      const lobbyRef = doc(db, 'islandRunLobbies', lobbyId);
      const lobbyDoc = await getDoc(lobbyRef);
      
      if (lobbyDoc.exists()) {
        const data = lobbyDoc.data();
        let players = [...(data.players || [])];
        const playerIndex = players.findIndex((p: IslandRunPlayer) => p.userId === currentUser.uid);
        
        if (playerIndex !== -1) {
          // Toggle ready status
          players[playerIndex] = {
            ...players[playerIndex],
            isReady: !players[playerIndex].isReady
          };
          
          await updateDoc(lobbyRef, {
            players: players as any, // Type assertion needed for Firestore nested objects
            updatedAt: serverTimestamp()
          });
        } else {
          // Player not found - try to add them automatically instead of showing error
          console.log('[IslandRunLobby] Player not found in lobby, attempting to add automatically...');
          const success = await addPlayerToLobby(lobbyRef, players);
          
          if (success) {
            // Retry the ready toggle after adding player
            const updatedDoc = await getDoc(lobbyRef);
            if (updatedDoc.exists()) {
              const updatedData = updatedDoc.data();
              const updatedPlayers = [...(updatedData.players || [])];
              const newPlayerIndex = updatedPlayers.findIndex((p: IslandRunPlayer) => p.userId === currentUser.uid);
              
              if (newPlayerIndex !== -1) {
                updatedPlayers[newPlayerIndex] = {
                  ...updatedPlayers[newPlayerIndex],
                  isReady: true // Set to ready since they clicked ready
                };
                
                await updateDoc(lobbyRef, {
                  players: updatedPlayers as any, // Type assertion needed for Firestore nested objects
                  updatedAt: serverTimestamp()
                });
              }
            }
          } else {
            // If auto-join failed, show error
            console.error('[IslandRunLobby] Failed to add player to lobby');
            alert('Unable to join lobby. Please refresh the page and try again.');
          }
        }
      }
    } catch (error) {
      console.error('[IslandRunLobby] Error updating ready status:', error);
      alert('Failed to update ready status. Please try again.');
    }
  };

  const handleStartGame = async () => {
    if (!lobbyId || !currentUser || !lobby) return;
    
    // Only host can start
    if (lobby.hostId !== currentUser.uid) {
      alert('Only the host can start the raid!');
      return;
    }

    // Check if all players are ready (allow solo play - at least 1 player must be ready)
    if (lobby.players.length === 0) {
      alert('At least one player must be in the lobby!');
      return;
    }
    
    const allReady = lobby.players.every(p => p.isReady);
    if (!allReady) {
      alert('All players must be ready before starting!');
      return;
    }

    try {
      // Create game document
      const gameData = {
        lobbyId,
        hostId: currentUser.uid,
        difficulty: lobby.difficulty,
        status: 'in_progress',
        players: lobby.players.map(p => p.userId),
        waveNumber: 1,
        maxWaves: lobby.difficulty === 'easy' ? 3 : 5,
        createdAt: serverTimestamp()
      };

      const gamesRef = collection(db, 'islandRaidGames');
      const gameDoc = await addDoc(gamesRef, gameData);
      const gameId = gameDoc.id;

      // Update lobby status
      const lobbyRef = doc(db, 'islandRunLobbies', lobbyId);
      await updateDoc(lobbyRef, {
        status: 'in_progress',
        gameId,
        updatedAt: serverTimestamp()
      }).catch((error) => {
        console.error('Error updating lobby:', error);
      });

      // Generate initial enemies for wave 1
      const generateWaveEnemies = (wave: number, difficulty: 'easy' | 'normal' | 'hard' | 'nightmare') => {
        const enemies: any[] = [];

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
              const baseHealth = 120;
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
            // Wave 5: 1 Zombie Captain + 4 Powered Zombies
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
              position: { x: 50, y: 50 },
              spawnTime: new Date(),
              waveNumber: wave,
              image: '/images/Zombie Captain.png'
            });
            
            // Then add 4 Powered Zombies
            for (let i = 1; i <= 4; i++) {
              const zombieHealth = 180;
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

      // Create battle room with all players and initial enemies
      const initialEnemies = generateWaveEnemies(1, lobby.difficulty);
      // Determine maxWaves based on difficulty
      const maxWaves = lobby.difficulty === 'easy' ? 3 : 5;
      
      const battleRoomData = {
        id: gameId,
        gameId,
        lobbyId,
        players: lobby.players.map(p => p.userId), // Include ALL players from lobby
        enemies: initialEnemies,
        waveNumber: 1,
        maxWaves: maxWaves,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
      await setDoc(battleRoomRef, battleRoomData);

      // Navigate to battle
      navigate(`/island-raid/game/${gameId}`);
    } catch (error) {
      console.error('Error starting game:', error);
      alert('Failed to start raid. Please try again.');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading lobby...</div>
      </div>
    );
  }

  if (!lobby) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Lobby not found.</div>
      </div>
    );
  }

  const isHost = lobby.hostId === currentUser?.uid;
  const allPlayersReady = lobby.players.every(p => p.isReady);

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '2rem',
        borderRadius: '1rem',
        marginBottom: '2rem',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🏝️ {lobby.name}</h1>
        <p style={{ fontSize: '1rem', opacity: 0.9 }}>
          Difficulty: <strong>{lobby.difficulty.toUpperCase()}</strong>
        </p>
      </div>

      {/* Players List */}
      <div style={{
        background: 'white',
        border: '2px solid #e5e7eb',
        borderRadius: '1rem',
        padding: '1.5rem',
        marginBottom: '2rem'
      }}>
        <h2 style={{ marginBottom: '1rem' }}>Players ({lobby.players.length} / {lobby.maxPlayers})</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {lobby.players.map((player) => (
            <div
              key={player.userId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '1rem',
                background: '#f9fafb',
                borderRadius: '0.5rem',
                border: player.userId === currentUser?.uid ? '2px solid #3b82f6' : '1px solid #e5e7eb'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {player.photoURL && (
                  <img
                    src={player.photoURL}
                    alt={player.displayName}
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%'
                    }}
                  />
                )}
                <div>
                  <div style={{ fontWeight: 'bold' }}>
                    {player.displayName}
                    {isHost && player.isLeader && ' 👑'}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                    Level {player.level}
                  </div>
                </div>
              </div>
              <div style={{
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                background: player.isReady ? '#10b981' : '#ef4444',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '0.875rem'
              }}>
                {player.isReady ? '✓ Ready' : 'Not Ready'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button
          onClick={handleToggleReady}
          style={{
            background: isReady
              ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
              : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          {isReady ? 'Not Ready' : 'Ready Up'}
        </button>
        
        {isHost && (
          <button
            onClick={handleStartGame}
            disabled={!allPlayersReady || lobby.players.length < 1}
            style={{
              background: allPlayersReady && lobby.players.length >= 1
                ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                : '#d1d5db',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: allPlayersReady && lobby.players.length >= 1 ? 'pointer' : 'not-allowed',
              opacity: allPlayersReady && lobby.players.length >= 1 ? 1 : 0.6
            }}
          >
            Start Game
          </button>
        )}
      </div>
    </div>
  );
};

export default IslandRunLobbyView;

