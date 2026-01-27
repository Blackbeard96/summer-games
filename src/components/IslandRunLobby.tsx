import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc, collection, addDoc, setDoc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { IslandRunLobby, IslandRunPlayer } from '../types/islandRun';
import { getLevelFromXP } from '../utils/leveling';
import { joinRaidLobby, leaveRaidLobby, touchRaidLobby, touchRaidLobbyMember } from '../utils/raidLobbyService';

const IslandRunLobbyView: React.FC = () => {
  const { lobbyId } = useParams<{ lobbyId: string }>();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [lobby, setLobby] = useState<IslandRunLobby | null>(null);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now()); // For timer updates
  const hasJoinedRef = useRef(false);
  const joinAttemptedRef = useRef(false);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Join lobby transactionally on mount
  useEffect(() => {
    if (!lobbyId || !currentUser || joinAttemptedRef.current) return;

    const joinLobby = async () => {
      joinAttemptedRef.current = true;

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

        const joinResult = await joinRaidLobby(
          lobbyId,
          currentUser.uid,
          currentUser.displayName || 'Player',
          currentUser.photoURL || undefined,
          playerLevel,
          playerXP
        );

        if (joinResult.success) {
          hasJoinedRef.current = true;
          if (joinResult.alreadyJoined) {
            console.log('[IslandRunLobby] User already in lobby');
          }
          
          // Start heartbeat after successful join
          startHeartbeat();
        } else {
          console.error('[IslandRunLobby] Failed to join lobby:', joinResult.error);
          if (joinResult.isFull) {
            alert('This lobby is full!');
            navigate('/island-raid');
          } else {
            alert(`Failed to join lobby: ${joinResult.error}`);
            navigate('/island-raid');
          }
          joinAttemptedRef.current = false; // Allow retry
        }
      } catch (error) {
        console.error('[IslandRunLobby] Error joining lobby:', error);
        joinAttemptedRef.current = false; // Allow retry
      }
    };

    joinLobby();
  }, [lobbyId, currentUser, navigate]);

  // Listen to lobby updates
  useEffect(() => {
    if (!lobbyId || !currentUser) return;

    const lobbyRef = doc(db, 'islandRunLobbies', lobbyId);
    const unsubscribe = onSnapshot(lobbyRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        const players = data.players || [];

        // Check if player is in lobby (may have been removed)
        const playerExists = players.some((p: IslandRunPlayer) => p.userId === currentUser.uid);
        
        if (!playerExists && hasJoinedRef.current && data.status === 'waiting') {
          // Player was removed - try to rejoin if lobby is still waiting
          console.log('[IslandRunLobby] Player removed from lobby, attempting rejoin...');
          hasJoinedRef.current = false;
          joinAttemptedRef.current = false;
        }

        const lobbyData = {
          id: docSnapshot.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          players: players
        } as IslandRunLobby;

        setLobby(lobbyData);
        setLoading(false);

        // Check if user is ready
        const player = players.find((p: IslandRunPlayer) => p.userId === currentUser.uid);
        setIsReady(player?.isReady || false);

        // If game has started, redirect all players to the battle
        if (data.status === 'in_progress' && data.gameId) {
          navigate(`/island-raid/game/${data.gameId}`);
        }

        // If lobby is expired, redirect to lobby list
        if (data.status === 'expired') {
          alert('This lobby has expired.');
          navigate('/island-raid');
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

    // Update timer every second
    const timerInterval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(timerInterval);
    };
  }, [lobbyId, currentUser, navigate]);

  // Heartbeat function
  const startHeartbeat = () => {
    if (!lobbyId || heartbeatIntervalRef.current) return; // Already running

    // Clear any existing interval
    stopHeartbeat();

    // Start heartbeat interval (10 seconds for member presence, 15 seconds for lobby-level)
    heartbeatIntervalRef.current = setInterval(() => {
      if (hasJoinedRef.current && lobbyId && currentUser) {
        // Update per-player presence (member subcollection)
        touchRaidLobbyMember(lobbyId, currentUser.uid).catch((error) => {
          console.error('[IslandRunLobby] Error updating member heartbeat:', error);
        });
        // Also update lobby-level activity (for backward compatibility)
        touchRaidLobby(lobbyId).catch((error) => {
          console.error('[IslandRunLobby] Error updating lobby heartbeat:', error);
        });
      }
    }, 10000); // 10 seconds for better presence accuracy

    // Also update on page visibility change (when tab becomes visible)
    const handleVisibilityChange = () => {
      if (!document.hidden && hasJoinedRef.current && lobbyId && currentUser) {
        touchRaidLobbyMember(lobbyId, currentUser.uid).catch((error) => {
          console.error('[IslandRunLobby] Error updating member heartbeat on visibility change:', error);
        });
        touchRaidLobby(lobbyId).catch((error) => {
          console.error('[IslandRunLobby] Error updating lobby heartbeat on visibility change:', error);
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Store cleanup function on window for beforeunload
    (window as any).__islandRaidHeartbeatCleanup = () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  };

  const stopHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if ((window as any).__islandRaidHeartbeatCleanup) {
      (window as any).__islandRaidHeartbeatCleanup();
      delete (window as any).__islandRaidHeartbeatCleanup;
    }
  };

  // Leave lobby on unmount (cleanup)
  useEffect(() => {
    return () => {
      stopHeartbeat();
      if (lobbyId && currentUser && hasJoinedRef.current) {
        // Leave lobby asynchronously (don't wait)
        leaveRaidLobby(lobbyId, currentUser.uid).catch((error) => {
          console.error('[IslandRunLobby] Error leaving lobby on unmount:', error);
        });
      }
    };
  }, [lobbyId, currentUser]);

  const handleLeaveLobby = async () => {
    if (!lobbyId || !currentUser) return;

    try {
      stopHeartbeat();
      const result = await leaveRaidLobby(lobbyId, currentUser.uid);
      if (result.success) {
        navigate('/island-raid');
      } else {
        alert(`Failed to leave lobby: ${result.error}`);
      }
    } catch (error) {
      console.error('[IslandRunLobby] Error leaving lobby:', error);
      alert('Failed to leave lobby. Please try again.');
    }
  };

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
          const newReadyStatus = !players[playerIndex].isReady;
          players[playerIndex] = {
            ...players[playerIndex],
            isReady: newReadyStatus
          };
          
          // Update players array
          await updateDoc(lobbyRef, {
            players: players as any, // Type assertion needed for Firestore nested objects
            updatedAt: serverTimestamp()
          });

          // Also update member subcollection
          const memberRef = doc(db, 'islandRunLobbies', lobbyId, 'members', currentUser.uid);
          await updateDoc(memberRef, {
            ready: newReadyStatus
          }).catch((err) => {
            // Member doc might not exist (legacy lobby), that's OK
            if (process.env.REACT_APP_DEBUG_RAID === 'true') {
              console.warn('[IslandRunLobby] Could not update member ready status:', err);
            }
          });
        } else {
          // Player not found - this shouldn't happen if join worked correctly
          console.error('[IslandRunLobby] Player not found in lobby');
          alert('You are not in this lobby. Please refresh the page.');
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
        <p style={{ fontSize: '0.9rem', marginTop: '0.5rem', opacity: 0.95 }}>
          ⏱️ Time Remaining: {(() => {
            const TEN_MINUTES_MS = 10 * 60 * 1000; // 10 minutes in milliseconds
            const elapsedMs = currentTime - lobby.createdAt.getTime();
            const remainingMs = Math.max(0, TEN_MINUTES_MS - elapsedMs);
            const remainingSeconds = Math.floor(remainingMs / 1000);
            
            if (remainingSeconds <= 0) {
              return '0:00';
            }
            
            const minutes = Math.floor(remainingSeconds / 60);
            const seconds = remainingSeconds % 60;
            
            // Format as MM:SS
            return `${minutes}:${seconds.toString().padStart(2, '0')}`;
          })()}
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
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
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

        <button
          onClick={handleLeaveLobby}
          style={{
            background: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          Leave Lobby
        </button>
      </div>
    </div>
  );
};

export default IslandRunLobbyView;

