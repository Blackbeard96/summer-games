import React, { useState, useEffect, useRef, useCallback } from 'react';
import { doc, setDoc, serverTimestamp, onSnapshot, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import IslandRaidBattle from './IslandRaidBattle';
import { createLiveFeedMilestone } from '../services/liveFeed';
import { shouldShareEvent } from '../services/liveFeedPrivacy';
import { getLevelFromXP } from '../utils/leveling';

interface SonidoTransmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (battleRoomId?: string) => void;
}

interface TransmissionScene {
  dialogue: string;
  image?: string; // Optional image path, defaults to Ch2-4_SonidoComms.png
  isChoice?: boolean; // If true, this scene shows candy choice buttons instead of dialogue
}

const POWERED_ZOMBIE_MOVES = [
  { id: 'powered-punch', name: 'Powered Punch', type: 'attack', damageRange: { min: 2, max: 4 } },
  { id: 'energy-flash', name: 'Energy Flash', type: 'attack', damageRange: { min: 2, max: 3 } },
];
const ZOMBIE_CAPTAIN_MOVES = [
  { id: 'energy-strike', name: 'Energy Strike', type: 'attack', damageRange: { min: 2, max: 4 } },
  { id: 'energy-wave', name: 'Energy Wave', type: 'attack', damageRange: { min: 3, max: 5 } },
];
const ZOMBIE_ELITE_MOVES = [
  { id: 'elite-slam', name: 'Elite Slam', type: 'attack', damageRange: { min: 3, max: 4 } },
  { id: 'elite-surge', name: 'Elite Surge', type: 'attack', damageRange: { min: 3, max: 5 } },
];
const UNVEILED_ELITE_MOVES = [
  { id: 'unveiled-strike', name: 'Unveiled Strike', type: 'attack', damageRange: { min: 3, max: 5 } },
  { id: 'reality-break', name: 'Reality Break', type: 'attack', damageRange: { min: 4, max: 6 } },
];

/** Island Raid enemy row (IslandRaidBattle reads health, currentPP, and vaultHealth). */
const makeStoryEnemy = (e: {
  id: string;
  type: string;
  name: string;
  health: number;
  shields: number;
  level: number;
  moves: unknown[];
  waveNumber: number;
  position: { x: number; y: number };
  image: string;
}) => ({
  id: e.id,
  type: e.type,
  name: e.name,
  health: e.health,
  maxHealth: e.health,
  currentPP: e.health,
  maxPP: e.health,
  vaultHealth: e.health,
  maxVaultHealth: e.health,
  shieldStrength: e.shields,
  maxShieldStrength: e.shields,
  level: e.level,
  moves: e.moves,
  fixedStats: true,
  position: e.position,
  spawnTime: new Date(),
  waveNumber: e.waveNumber,
  image: e.image,
});

const SonidoTransmissionModal: React.FC<SonidoTransmissionModalProps> = ({ isOpen, onClose, onComplete }) => {
  const { currentUser } = useAuth();
  const [currentScene, setCurrentScene] = useState(0);
  const [selectedCandy, setSelectedCandy] = useState<string | null>(null);
  const [showBattle, setShowBattle] = useState(false);
  const [gameId, setGameId] = useState<string | null>(null);
  const battleWonRef = useRef(false); // Track if battle was actually won

  // Define handleComplete early so it can be used in useEffect dependencies
  const handleComplete = useCallback(async (battleRoomId?: string) => {
    console.log('✅ SonidoTransmissionModal: handleComplete called - marking chapter complete and closing modal');
    
    // Create Live Feed post for chapter completion (if privacy settings allow)
    if (currentUser) {
      try {
        const shouldShare = await shouldShareEvent(currentUser.uid, 'chapter_complete');
        if (shouldShare) {
          const studentDoc = await getDoc(doc(db, 'students', currentUser.uid));
          const studentData = studentDoc.exists() ? studentDoc.data() : null;
          const playerLevel = studentData ? getLevelFromXP(studentData.xp || 0) : undefined;
          
          await createLiveFeedMilestone(
            currentUser.uid,
            currentUser.displayName || 'Unknown',
            currentUser.photoURL || undefined,
            studentData?.role || undefined,
            playerLevel,
            'chapter_complete',
            {
              chapterName: 'Chapter 2-4'
            },
            `chapter_complete_${currentUser.uid}_ch2-4_${Date.now()}`
          );
        }
      } catch (error) {
        console.error('Error creating Live Feed post for chapter completion:', error);
      }
    }
    
    onComplete(battleRoomId);
    // Close the modal after completion handler is called
    // This ensures the chapter is marked complete before the modal closes
    setTimeout(() => {
      onClose();
    }, 100);
  }, [onComplete, onClose, currentUser]);

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
            if (enemy.isDefeated === true) return true;
            // IslandRaidBattle writes damage to `health`; spawned vaultHealth/currentPP are never updated.
            const health = enemy.health !== undefined
              ? Math.max(0, Number(enemy.health))
              : (enemy.vaultHealth !== undefined
                ? Math.max(0, Number(enemy.vaultHealth))
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
              handleComplete(gameId);
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
    const bosses: Record<string, { id: string; name: string; image: string }> = {
      'on-off': { id: 'unveiled_elite_luz', name: 'Luz, Wielder of Light', image: '/images/Luz, Wielder of Light.png' },
      'up-down': { id: 'unveiled_elite_varion', name: 'Varion, Elite of the Vertical', image: '/images/Varion - Elite.png' },
      'config': { id: 'unveiled_elite_kon', name: 'Kon, the Guardian for Config', image: '/images/Kon.png' },
    };
    const boss = bosses[candyType];
    if (!boss) return null;
    return makeStoryEnemy({
      ...boss,
      type: 'unveiled_elite',
      health: 60,
      shields: 30,
      level: 20,
      moves: UNVEILED_ELITE_MOVES,
      waveNumber: 4,
      position: { x: 50, y: 50 },
    });
  };

  // Tuned so a solo player fresh out of Squad Up (~12 damage per turn, ~100 health + shields) can clear
  // all four waves; squadmates make it easier. Embedded moves + fixedStats keep the admin CPU config
  // (balanced for late-game raids) from overriding these enemies.
  const generateWavesForCandy = (candyType: string) => {
    const waves: any = {};

    // Wave 1: a Powered Zombie and a Zombie Captain
    waves[1] = [
      makeStoryEnemy({ id: 'enemy_w1_powered_0', type: 'powered_zombie', name: 'Powered Zombie', health: 20, shields: 10, level: 8, moves: POWERED_ZOMBIE_MOVES, waveNumber: 1, position: { x: 30, y: 40 }, image: '/images/Powered Zombie.png' }),
      makeStoryEnemy({ id: 'enemy_w1_captain_0', type: 'zombie_captain', name: 'Zombie Captain', health: 25, shields: 10, level: 10, moves: ZOMBIE_CAPTAIN_MOVES, waveNumber: 1, position: { x: 70, y: 60 }, image: '/images/Zombie Captain.png' }),
    ];

    // Wave 2: 2 Zombie Captains
    waves[2] = [0, 1].map((i) =>
      makeStoryEnemy({ id: `enemy_w2_captain_${i}`, type: 'zombie_captain', name: `Zombie Captain ${i + 1}`, health: 25, shields: 10, level: 10, moves: ZOMBIE_CAPTAIN_MOVES, waveNumber: 2, position: { x: 30 + i * 40, y: 50 }, image: '/images/Zombie Captain.png' })
    );

    // Wave 3: a Zombie Captain and a Zombie Elite
    waves[3] = [
      makeStoryEnemy({ id: 'enemy_w3_captain_0', type: 'zombie_captain', name: 'Zombie Captain', health: 25, shields: 10, level: 10, moves: ZOMBIE_CAPTAIN_MOVES, waveNumber: 3, position: { x: 30, y: 45 }, image: '/images/Zombie Captain.png' }),
      makeStoryEnemy({ id: 'enemy_w3_elite', type: 'zombie_elite', name: 'Zombie Elite', health: 35, shields: 15, level: 15, moves: ZOMBIE_ELITE_MOVES, waveNumber: 3, position: { x: 70, y: 50 }, image: '/images/Zombie Elite.png' }),
    ];

    // Wave 4: a Zombie Elite and the Unveiled Elite for the chosen candy
    waves[4] = [
      makeStoryEnemy({ id: 'enemy_w4_elite_0', type: 'zombie_elite', name: 'Zombie Elite', health: 35, shields: 15, level: 15, moves: ZOMBIE_ELITE_MOVES, waveNumber: 4, position: { x: 25, y: 50 }, image: '/images/Zombie Elite.png' }),
    ];
    const unveiledElite = getUnveiledEliteForCandy(candyType);
    if (unveiledElite) {
      waves[4].push(unveiledElite);
    }

    return waves;
  };

  const startRRCandyBattle = async (candyType: string) => {
    if (!currentUser) {
      alert('You must be signed in to start this battle.');
      return;
    }

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

      // Set battle state (Island Raid style) — only after room is created so UI never locks without a battle
      setGameId(gameId);
      setShowBattle(true);
      setSelectedCandy(candyType);
    } catch (error) {
      console.error('Error starting RR Candy battle:', error);
      alert('Error starting battle. Please try again.');
    }
  };

  const handleCandyChoice = (candyType: string) => {
    void startRRCandyBattle(candyType);
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
            // Let players pick again if they retreated / lost without finishing (victory path still closes modal)
            setSelectedCandy(null);
            // DON'T call onClose() here - let the listener detect victory first
            // handleComplete() will call onClose() after marking chapter as complete
          }}
        />
      </div>
    );
  }

  return (
    <div className="mst-popup-overlay"
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
      onClick={(e) => {
        // Do not dismiss during candy choice — mis-taps left players stuck with a selection and no battle
        if (e.target === e.currentTarget && !scenes[currentScene]?.isChoice) {
          onClose();
        }
      }}
    ><button type="button" className="mst-popup-close" aria-label="Close" onClick={(e) => { e.stopPropagation(); onClose?.(); }}>×</button>
      <div className="mst-popup-panel"
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
                type="button"
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
              
              <button
                type="button"
                onClick={() => handleCandyChoice('up-down')}
                disabled={selectedCandy !== null}
                style={{
                  backgroundColor: selectedCandy === 'up-down' ? '#10b981' : selectedCandy ? '#374151' : '#3b82f6',
                  color: 'white',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  border: selectedCandy === 'up-down' ? '2px solid #10b981' : '2px solid #3b82f6',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: selectedCandy ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
                  opacity: selectedCandy && selectedCandy !== 'up-down' ? 0.5 : 1,
                  width: '100%',
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
                Up/Down
              </button>
              
              <button
                type="button"
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
                onClick={() => handleComplete()}
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

