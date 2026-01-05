import React, { useState, useEffect, useRef, useCallback } from 'react';
import { doc, setDoc, serverTimestamp, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import IslandRaidBattle from './IslandRaidBattle';

interface SonidoTransmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

interface TransmissionScene {
  dialogue: string;
  image?: string; // Optional image path, defaults to Ch2-4_SonidoComms.png
  isChoice?: boolean; // If true, this scene shows candy choice buttons instead of dialogue
}

const SonidoTransmissionModal: React.FC<SonidoTransmissionModalProps> = ({ isOpen, onClose, onComplete }) => {
  const { currentUser } = useAuth();
  const { vault, moves } = useBattle();
  const [currentScene, setCurrentScene] = useState(0);
  const [selectedCandy, setSelectedCandy] = useState<string | null>(null);
  const [showBattle, setShowBattle] = useState(false);
  const [gameId, setGameId] = useState<string | null>(null);
  const [showUpDownTooltip, setShowUpDownTooltip] = useState(false);
  const battleWonRef = useRef(false); // Track if battle was actually won

  // Define handleComplete early so it can be used in useEffect dependencies
  const handleComplete = useCallback(() => {
    console.log('✅ SonidoTransmissionModal: handleComplete called - marking chapter complete and closing modal');
    // Pass the selected candy choice to the completion handler if needed
    onComplete();
    // Close the modal after completion handler is called
    // This ensures the chapter is marked complete before the modal closes
    setTimeout(() => {
      onClose();
    }, 100);
  }, [onComplete, onClose]);

  // Reset to first scene when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentScene(0);
      setSelectedCandy(null);
      setShowBattle(false);
      setGameId(null);
      battleWonRef.current = false; // Reset battle won flag
    }
  }, [isOpen]);

  // Listen for battle completion (IslandRaidBattle handles wave progression internally)
  // CRITICAL: Keep listener active even after showBattle becomes false to catch victory from conclusion cutscene
  // Only set up listener if we have a gameId (battle has started)
  useEffect(() => {
    if (!gameId || !currentUser) return;

    // Helper function to check if error is a Firestore internal assertion error
    const isFirestoreInternalError = (error: any): boolean => {
      if (!error) return false;
      const errorString = String(error);
      const errorMessage = error?.message || '';
      return errorString.includes('INTERNAL ASSERTION FAILED') || 
             errorMessage.includes('INTERNAL ASSERTION FAILED') ||
             errorString.includes('ID: ca9') ||
             errorString.includes('ID: b815') ||
             (errorMessage.includes('FIRESTORE') && errorMessage.includes('Unexpected state'));
    };

    const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
    const unsubscribe = onSnapshot(battleRoomRef, async (snapshot) => {
      try {
        if (!snapshot.exists()) return;

        const battleRoom = snapshot.data();
        const currentWave = battleRoom.waveNumber || 1;
        const maxWaves = battleRoom.maxWaves || 4;
        
        // Check if battle is completed (victory or defeat)
        // Only complete challenge if all 4 waves were completed AND final boss is defeated
        if (battleRoom.status === 'victory' && currentWave >= maxWaves) {
          // CRITICAL: Verify all enemies in final wave are actually defeated (final boss must be defeated)
          const enemies = battleRoom.enemies || [];
          const allDefeated = enemies.length === 0 || enemies.every((enemy: any) => {
            // Check health (vaultHealth for Island Raid, or health/currentPP as fallback)
            const health = enemy.vaultHealth !== undefined 
              ? Math.max(0, Number(enemy.vaultHealth))
              : (enemy.health !== undefined 
                ? Math.max(0, Number(enemy.health))
                : (enemy.currentPP !== undefined ? Math.max(0, Number(enemy.currentPP)) : 0));
            // Check shield
            const shield = enemy.shieldStrength !== undefined 
              ? Math.max(0, Number(enemy.shieldStrength))
              : 0;
            // Enemy is defeated if both health and shield are 0
            return health <= 0 && shield <= 0;
          });
          
          if (allDefeated && !battleWonRef.current) {
            // Battle won - all waves completed AND final boss defeated - complete the challenge
            console.log('🎉 SonidoTransmissionModal: Battle victory detected! Completing challenge...', {
              gameId,
              userId: currentUser?.uid,
              status: battleRoom.status,
              waveNumber: currentWave,
              maxWaves,
              enemiesDefeated: allDefeated
            });
            battleWonRef.current = true; // Mark as won to prevent duplicate completions
            
            // Add a small delay to ensure Firestore write is fully propagated
            setTimeout(() => {
              console.log('✅ SonidoTransmissionModal: Calling handleComplete to mark chapter as complete');
              handleComplete();
            }, 100);
          }
        } else if (battleRoom.status === 'defeated' && showBattle) {
          // Battle lost - close modal without completing challenge (only if battle is still showing)
          setShowBattle(false);
          onClose();
        } else if (battleRoom.status === 'escaped' && showBattle) {
          // Battle escaped - close battle and return to modal (only if battle is still showing)
          setShowBattle(false);
          // Don't close the modal, just return to the transmission scenes
        }
      } catch (error) {
        if (isFirestoreInternalError(error)) {
          console.warn('⚠️ SonidoTransmissionModal: Firestore internal assertion error in battle listener (suppressed)');
          return;
        }
        console.error('SonidoTransmissionModal: Error processing battle snapshot:', error);
      }
    }, (error) => {
      if (isFirestoreInternalError(error)) {
        console.warn('⚠️ SonidoTransmissionModal: Firestore internal assertion error in battle listener (suppressed)');
        return;
      }
      console.error('SonidoTransmissionModal: Error in battle listener:', error);
    });

    return () => unsubscribe();
  }, [gameId, currentUser, handleComplete]); // Removed showBattle from deps to keep listener active even after battle closes

  if (!isOpen) return null;

  const scenes: TransmissionScene[] = [
    {
      dialogue: "I am happy to see so many of you survived your first encounter with the Island. I expected nothing less. Now is when things get real.",
      image: "/images/Ch2-4_SonidoComms.png"
    },
    {
      dialogue: "Your next mission will be your toughest. You will be searching for something called an 'RR Candy'. These candies are more than just a starburst - they will grant you with incredible power, the type of power you will need to escape this island.",
      image: "/images/Ch2-4_SonidoComms.png"
    },
    {
      dialogue: "We have located three RR Candy Locations",
      image: "/images/Ch2-4_CandyLocations.png"
    },
    {
      dialogue: "This is what we know about the three candies. One has the power of Off/On, the other Up/Down. The last one is config. We're not sure what this means yet, but that's for you to find out.",
      image: "/images/Ch2-4_CandyNames.png"
    },
    {
      dialogue: "Pick which RR Candy location to go to:",
      image: "/images/Ch2-4_ChooseYourCandy.png",
      isChoice: true
    }
  ];

  const handleNext = () => {
    if (currentScene < scenes.length - 1) {
      setCurrentScene(currentScene + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentScene > 0) {
      setCurrentScene(currentScene - 1);
    }
  };

  const getUnveiledEliteForCandy = (candyType: string) => {
    switch (candyType) {
      case 'on-off':
        return {
          id: 'unveiled_elite_luz',
          type: 'unveiled_elite',
          name: 'Luz, Wielder of Light',
          health: 2000, // IslandRaidBattle uses 'health' field
          maxHealth: 2000,
          currentPP: 2000, // Also include for display
          maxPP: 2000,
          vaultHealth: 2000, // Add vaultHealth for Island Raid detection
          maxVaultHealth: 2000,
          shieldStrength: 500,
          maxShieldStrength: 500,
          level: 20,
          damage: 150,
          moves: [],
          position: { x: 50, y: 50 },
          spawnTime: new Date(),
          waveNumber: 4,
          image: '/images/Luz, Wielder of Light.png' // Luz, Wielder of Light battle image
        };
      case 'up-down':
        // Will be implemented later
        return null;
      case 'config':
        return {
          id: 'unveiled_elite_kon',
          type: 'unveiled_elite',
          name: 'Kon, the Guardian for Config',
          health: 2000, // IslandRaidBattle uses 'health' field
          maxHealth: 2000,
          currentPP: 2000, // Also include for display
          maxPP: 2000,
          vaultHealth: 2000, // Add vaultHealth for Island Raid detection
          maxVaultHealth: 2000,
          shieldStrength: 500,
          maxShieldStrength: 500,
          level: 20,
          damage: 150,
          moves: [],
          position: { x: 50, y: 50 },
          spawnTime: new Date(),
          waveNumber: 4,
          image: '/images/Kon.png' // Kon battle image
        };
      default:
        return null;
    }
  };

  const generateWavesForCandy = (candyType: string) => {
    const waves: any = {};

    // Wave 1: 2 Powered Zombies and 2 Zombie Captains
    waves[1] = [];
    for (let i = 0; i < 2; i++) {
      waves[1].push({
        id: `enemy_w1_powered_${i}`,
        type: 'powered_zombie',
        name: `Powered Zombie ${i + 1}`,
        health: 250, // IslandRaidBattle uses 'health' field
        maxHealth: 250,
        currentPP: 250, // Also include for display
        maxPP: 250,
        vaultHealth: 250, // Add vaultHealth for Island Raid detection
        maxVaultHealth: 250,
        shieldStrength: 250,
        maxShieldStrength: 250,
        level: 8,
        damage: 50,
        moves: [],
        position: { x: 20 + i * 30, y: 40 },
        spawnTime: new Date(),
        waveNumber: 1,
        image: '/images/Powered Zombie.png'
      });
    }
    for (let i = 0; i < 2; i++) {
      waves[1].push({
        id: `enemy_w1_captain_${i}`,
        type: 'zombie_captain',
        name: `Zombie Captain ${i + 1}`,
        health: 500, // IslandRaidBattle uses 'health' field
        maxHealth: 500,
        currentPP: 500, // Also include for display
        maxPP: 500,
        vaultHealth: 500, // Add vaultHealth for Island Raid detection
        maxVaultHealth: 500,
        shieldStrength: 200,
        maxShieldStrength: 200,
        level: 10,
        damage: 80,
        moves: [],
        position: { x: 30 + i * 40, y: 60 },
        spawnTime: new Date(),
        waveNumber: 1,
        image: '/images/Zombie Captain.png'
      });
    }

    // Wave 2: 3 Zombie Captains
    waves[2] = [];
    for (let i = 0; i < 3; i++) {
      waves[2].push({
        id: `enemy_w2_captain_${i}`,
        type: 'zombie_captain',
        name: `Zombie Captain ${i + 1}`,
        health: 500, // IslandRaidBattle uses 'health' field
        maxHealth: 500,
        currentPP: 500, // Also include for display
        maxPP: 500,
        vaultHealth: 500, // Add vaultHealth for Island Raid detection
        maxVaultHealth: 500,
        shieldStrength: 200,
        maxShieldStrength: 200,
        level: 10,
        damage: 80,
        moves: [],
        position: { x: 20 + i * 30, y: 50 },
        spawnTime: new Date(),
        waveNumber: 2,
        image: '/images/Zombie Captain.png'
      });
    }

    // Wave 3: 3 Zombie Captains and 1 Zombie Elite
    waves[3] = [];
    for (let i = 0; i < 3; i++) {
      waves[3].push({
        id: `enemy_w3_captain_${i}`,
        type: 'zombie_captain',
        name: `Zombie Captain ${i + 1}`,
        health: 500, // IslandRaidBattle uses 'health' field
        maxHealth: 500,
        currentPP: 500, // Also include for display
        maxPP: 500,
        vaultHealth: 500, // Add vaultHealth for Island Raid detection
        maxVaultHealth: 500,
        shieldStrength: 200,
        maxShieldStrength: 200,
        level: 10,
        damage: 80,
        moves: [],
        position: { x: 15 + i * 25, y: 45 },
        spawnTime: new Date(),
        waveNumber: 3,
        image: '/images/Zombie Captain.png'
      });
    }
    waves[3].push({
      id: 'enemy_w3_elite',
      type: 'zombie_elite',
      name: 'Zombie Elite',
      health: 1000, // IslandRaidBattle uses 'health' field
      maxHealth: 1000,
      currentPP: 1000, // Also include for display
      maxPP: 1000,
      vaultHealth: 1000, // Add vaultHealth for Island Raid detection
      maxVaultHealth: 1000,
      shieldStrength: 300,
      maxShieldStrength: 300,
      level: 15,
      damage: 100,
      moves: [],
      position: { x: 50, y: 50 },
      spawnTime: new Date(),
      waveNumber: 3,
      image: '/images/Zombie Elite.png'
    });

    // Wave 4: 1 Zombie Captain, 2 Zombie Elites and an Unveiled Elite
    waves[4] = [];
    waves[4].push({
      id: 'enemy_w4_captain',
      type: 'zombie_captain',
      name: 'Zombie Captain',
      health: 500, // IslandRaidBattle uses 'health' field
      maxHealth: 500,
      currentPP: 500, // Also include for display
      maxPP: 500,
      vaultHealth: 500, // Add vaultHealth for Island Raid detection
      maxVaultHealth: 500,
      shieldStrength: 200,
      maxShieldStrength: 200,
      level: 10,
      damage: 80,
      moves: [],
      position: { x: 30, y: 40 },
      spawnTime: new Date(),
      waveNumber: 4,
      image: '/images/Zombie Captain.png'
    });
    for (let i = 0; i < 2; i++) {
      waves[4].push({
        id: `enemy_w4_elite_${i}`,
        type: 'zombie_elite',
        name: `Zombie Elite ${i + 1}`,
        health: 1000, // IslandRaidBattle uses 'health' field
        maxHealth: 1000,
        currentPP: 1000, // Also include for display
        maxPP: 1000,
        vaultHealth: 1000, // Add vaultHealth for Island Raid detection
        maxVaultHealth: 1000,
        shieldStrength: 300,
        maxShieldStrength: 300,
        level: 15,
        damage: 100,
        moves: [],
        position: { x: 20 + i * 60, y: 50 },
        spawnTime: new Date(),
        waveNumber: 4,
        image: '/images/Zombie Elite.png'
      });
    }
    const unveiledElite = getUnveiledEliteForCandy(candyType);
    if (unveiledElite) {
      waves[4].push(unveiledElite);
    }

    return waves;
  };

  const startRRCandyBattle = async (candyType: string) => {
    if (!currentUser || !vault) return;

    try {
      // Generate unique game ID
      const gameId = `rr-candy-${candyType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Generate waves based on candy choice
      const customWaves = generateWavesForCandy(candyType);

      // Create battle room in Firestore (Island Raid style)
      const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
      await setDoc(battleRoomRef, {
        id: gameId,
        gameId,
        lobbyId: null,
        status: 'active',
        players: [currentUser.uid],
        enemies: customWaves[1] || [], // Use 'enemies' for Island Raid style
        waveNumber: 1,
        maxWaves: 4,
        customWaves: customWaves,
        difficulty: 'normal',
        isChapter2Battle: true, // Flag for Chapter 2 battles
        chapterId: 2,
        chapterName: 'Test, Allies, & Enemies',
        challengeId: 'ep2-its-all-a-game',
        challengeName: 'It\'s All a Game',
        challengeNumber: 4,
        candyChoice: candyType, // Store which candy was chosen
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Set battle state (Island Raid style)
      setGameId(gameId);
      setShowBattle(true);
      setSelectedCandy(candyType);
    } catch (error) {
      console.error('Error starting RR Candy battle:', error);
      alert('Error starting battle. Please try again.');
    }
  };

  const handleCandyChoice = (candyType: string) => {
    setSelectedCandy(candyType);
    // Start the battle
    startRRCandyBattle(candyType);
  };



  // Show battle if active - use IslandRaidBattle component
  if (showBattle && gameId) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          zIndex: 10000
        }}
      >
        <IslandRaidBattle
          gameId={gameId}
          lobbyId=""
          onLeave={() => {
            console.log('🚪 SonidoTransmissionModal: onLeave called - hiding battle but keeping modal open for listener');
            // Only hide the battle, don't close the modal yet
            // The listener needs to stay active to detect victory and call handleComplete
            setShowBattle(false);
            // DON'T call onClose() here - let the listener detect victory first
            // handleComplete() will call onClose() after marking chapter as complete
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '2rem'
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#1f2937',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '800px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
          border: '2px solid #3b82f6'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sonido Communication Image */}
        <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          <img
            src={scenes[currentScene].image || "/images/Ch2-4_SonidoComms.png"}
            alt="Sonido Transmission"
            style={{
              width: '100%',
              maxWidth: '600px',
              height: 'auto',
              borderRadius: '0.5rem',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)'
            }}
          />
        </div>

        {/* Sonido's Dialogue or Choice Prompt */}
        {!scenes[currentScene].isChoice ? (
          <div
            style={{
              backgroundColor: '#111827',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              border: '1px solid #3b82f6',
              marginBottom: '1.5rem'
            }}
          >
            <div
              style={{
                color: '#60a5fa',
                fontSize: '0.875rem',
                fontWeight: 'bold',
                marginBottom: '0.5rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
            >
              Sonido
            </div>
            <div
              style={{
                color: '#e5e7eb',
                fontSize: '1.125rem',
                lineHeight: '1.75',
                fontStyle: 'italic'
              }}
            >
              "{scenes[currentScene].dialogue}"
            </div>
          </div>
        ) : (
          <div
            style={{
              backgroundColor: '#111827',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              border: '1px solid #3b82f6',
              marginBottom: '1.5rem'
            }}
          >
            <div
              style={{
                color: '#60a5fa',
                fontSize: '0.875rem',
                fontWeight: 'bold',
                marginBottom: '0.5rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
            >
              Sonido
            </div>
            <div
              style={{
                color: '#e5e7eb',
                fontSize: '1.125rem',
                lineHeight: '1.75',
                marginBottom: '1.5rem'
              }}
            >
              {scenes[currentScene].dialogue}
            </div>
            
            {/* Candy Choice Buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '1rem' }}>
              <button
                onClick={() => handleCandyChoice('on-off')}
                disabled={selectedCandy !== null}
                style={{
                  backgroundColor: selectedCandy === 'on-off' ? '#10b981' : selectedCandy ? '#374151' : '#3b82f6',
                  color: 'white',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  border: selectedCandy === 'on-off' ? '2px solid #10b981' : '2px solid #3b82f6',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: selectedCandy ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                  opacity: selectedCandy && selectedCandy !== 'on-off' ? 0.5 : 1
                }}
                onMouseOver={(e) => {
                  if (!selectedCandy) {
                    e.currentTarget.style.backgroundColor = '#2563eb';
                  }
                }}
                onMouseOut={(e) => {
                  if (!selectedCandy) {
                    e.currentTarget.style.backgroundColor = '#3b82f6';
                  }
                }}
              >
                On/Off
              </button>
              
              <div style={{ position: 'relative' }}>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  disabled={true}
                  style={{
                    backgroundColor: '#6b7280',
                    color: '#9ca3af',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    border: '2px solid #4b5563',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    cursor: 'not-allowed',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                    opacity: 0.6,
                    width: '100%'
                  }}
                  onMouseEnter={() => setShowUpDownTooltip(true)}
                  onMouseLeave={() => setShowUpDownTooltip(false)}
                >
                  Up/Down
                </button>
                {showUpDownTooltip && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(0, 0, 0, 0.9)',
                      color: 'white',
                      padding: '0.5rem 1rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                      whiteSpace: 'nowrap',
                      marginBottom: '0.5rem',
                      zIndex: 1000,
                      pointerEvents: 'none'
                    }}
                  >
                    Coming Soon
                  </div>
                )}
              </div>
              
              <button
                onClick={() => handleCandyChoice('config')}
                disabled={selectedCandy !== null}
                style={{
                  backgroundColor: selectedCandy === 'config' ? '#10b981' : selectedCandy ? '#374151' : '#3b82f6',
                  color: 'white',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  border: selectedCandy === 'config' ? '2px solid #10b981' : '2px solid #3b82f6',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: selectedCandy ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                  opacity: selectedCandy && selectedCandy !== 'config' ? 0.5 : 1
                }}
                onMouseOver={(e) => {
                  if (!selectedCandy) {
                    e.currentTarget.style.backgroundColor = '#2563eb';
                  }
                }}
                onMouseOut={(e) => {
                  if (!selectedCandy) {
                    e.currentTarget.style.backgroundColor = '#3b82f6';
                  }
                }}
              >
                Config
              </button>
            </div>
            
            {selectedCandy && (
              <div style={{
                marginTop: '1rem',
                padding: '0.75rem',
                backgroundColor: '#10b981',
                color: 'white',
                borderRadius: '0.5rem',
                textAlign: 'center',
                fontWeight: 'bold'
              }}>
                Selected: {selectedCandy === 'on-off' ? 'On/Off' : selectedCandy === 'up-down' ? 'Up/Down' : 'Config'}
              </div>
            )}
          </div>
        )}

        {/* Scene Indicator */}
        <div style={{ textAlign: 'center', marginBottom: '1rem', color: '#9ca3af', fontSize: '0.875rem' }}>
          {currentScene + 1} / {scenes.length}
        </div>

        {/* Navigation Buttons - Only show if not a choice scene */}
        {!scenes[currentScene].isChoice && (
          <div style={{ textAlign: 'center', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            {/* Back Button */}
            {currentScene > 0 && (
              <button
                onClick={handleBack}
                style={{
                  backgroundColor: '#6b7280',
                  color: 'white',
                  padding: '0.75rem 2rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#4b5563';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#6b7280';
                }}
              >
                Back
              </button>
            )}
            
            {/* Next/Continue Button */}
            {currentScene < scenes.length - 1 ? (
              <button
                onClick={handleNext}
                style={{
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  padding: '0.75rem 2rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#3b82f6';
                }}
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleComplete}
                style={{
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  padding: '0.75rem 2rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#3b82f6';
                }}
              >
                Continue
              </button>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(50px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default SonidoTransmissionModal;

