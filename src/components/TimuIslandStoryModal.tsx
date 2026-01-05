import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, serverTimestamp, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import BattleEngine from './BattleEngine';
import IslandRaidVictoryModal from './IslandRaidVictoryModal';
import { getLevelFromXP } from '../utils/leveling';

interface TimuIslandStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

interface StorySlide {
  type: 'image' | 'video';
  src: string;
  title?: string;
  description?: string;
  speaker?: string; // Optional speaker name (defaults to "Narrator")
}

const TimuIslandStoryModal: React.FC<TimuIslandStoryModalProps> = ({ isOpen, onClose, onComplete }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showBattle, setShowBattle] = useState(false);
  const [gameId, setGameId] = useState<string | null>(null);
  const [allies, setAllies] = useState<any[]>([]);
  const [opponents, setOpponents] = useState<any[]>([]);
  const [waveNumber, setWaveNumber] = useState(1);
  const [battleLog, setBattleLog] = useState<string[]>(['Welcome to Timu Island!']);
  const [showVictoryModal, setShowVictoryModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [victoryRewards, setVictoryRewards] = useState<{
    pp: number;
    xp: number;
    truthMetal: number;
  } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { vault, moves } = useBattle();
  const isUpdatingEnemiesRef = useRef(false);

  // Check if joining an existing battle from invitation
  useEffect(() => {
    if (!isOpen || !currentUser) return;

    const joinGameId = sessionStorage.getItem('timuIslandBattleGameId');
    if (joinGameId) {
      console.log('TimuIslandStoryModal: Joining existing battle:', joinGameId);
      setGameId(joinGameId);
      setShowBattle(true);
      // Skip story slides and go straight to battle
      setCurrentSlide(999); // Set to a high number to skip all slides
      sessionStorage.removeItem('timuIslandBattleGameId');
    }
  }, [isOpen, currentUser]);

  const storySlides: StorySlide[] = [
    {
      type: 'image',
      src: '/images/TimuIsland_Overheadshot.png',
      title: 'Timu Island',
      description: 'An overhead view of Timu Island - a dangerous place filled with jungle, animals, hostile rebels, and zombies.'
    },
    {
      type: 'image',
      src: '/images/Portalling_In.png',
      title: 'Arrival',
      description: 'After some confusion, the islands new inhabitants realized that there was a lot going on. A few moments later, they heard a "beep" coming from their feet.'
    },
    {
      type: 'image',
      src: '/images/SonidosTransmission.png',
      title: 'Sonido\'s Transmission',
      description: 'Looking down, the manifesters discovered the video device Sonido had placed at the portal locations for them to find.'
    },
    {
      type: 'video',
      src: '/videos/Ch2-2_Video_SonidosTransmission1.mp4',
      title: 'Sonido\'s Message',
      description: undefined
    },
    {
      type: 'video',
      src: '/videos/Ch2-2_Video_Transmission2.mp4',
      title: 'Sonido\'s Message (Continued)',
      description: undefined
    },
    {
      type: 'image',
      src: '/images/Ch2-2_TimuIsland_Map.png',
      title: 'Timu Island Map',
      description: 'Here is a map of the Island. It\'s the most recent version I have, but warning, things may have changed since I\'ve been ... relocated',
      speaker: 'Sonido'
    },
    {
      type: 'image',
      src: '/images/Ch2-2_TimuIsland_Map.png',
      title: 'Your First Mission',
      description: 'Your first mission is to establish a base of operations by capturing one of the remote Research facilities. You will need to fight through a few zombie hordes to get there, but for an awakened manifester like yourself, it should be a cake walk.',
      speaker: 'Sonido'
    },
    {
      type: 'image',
      src: '/images/Ch2-2_TimuIsland_Map.png',
      title: 'Godspeed',
      description: 'Godspeed...',
      speaker: 'Sonido'
    }
  ];

  useEffect(() => {
    if (isOpen) {
      // Check if joining an existing battle from invitation
      const joinGameId = sessionStorage.getItem('timuIslandBattleGameId');
      if (joinGameId && currentUser) {
        console.log('TimuIslandStoryModal: Joining existing battle from invitation:', joinGameId);
        // Immediately set up the battle - no story slides
        setGameId(joinGameId);
        setShowBattle(true);
        setCurrentSlide(999); // Set to a high number to skip all slides
        sessionStorage.removeItem('timuIslandBattleGameId');
        console.log('TimuIslandStoryModal: Battle should now be visible for invited player');
      } else {
        // Reset to first slide when modal opens normally
        setCurrentSlide(0);
        setShowBattle(false);
        setGameId(null);
      }
      setWaveNumber(1);
      setBattleLog(['Welcome to Timu Island!']);
      setOpponents([]);
      setAllies([]);
      setShowVideoModal(false);
      setShowVictoryModal(false);
    }
  }, [isOpen, currentUser]);

  // Reset video when slide changes to a video slide
  useEffect(() => {
    const slideData = storySlides[currentSlide];
    if (slideData?.type === 'video' && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.load();
    }
  }, [currentSlide]);

  const startIslandRaidBattle = async () => {
    if (!currentUser) return;

    try {
      // Generate a unique game ID
      const gameId = `ch2-2-battle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Create enemies for wave 1: 2 Unpowered Zombies
      const wave1Enemies = [
        {
          id: 'enemy_w1_1',
          type: 'zombie',
          name: 'Unpowered Zombie 1',
          health: 150,
          maxHealth: 150,
          shieldStrength: 0,
          maxShieldStrength: 0,
          level: 5,
          damage: 25,
          moves: [],
          position: { x: 30, y: 50 },
          spawnTime: new Date(),
          waveNumber: 1,
          image: '/images/Unpowered Zombie.png'
        },
        {
          id: 'enemy_w1_2',
          type: 'zombie',
          name: 'Unpowered Zombie 2',
          health: 150,
          maxHealth: 150,
          shieldStrength: 0,
          maxShieldStrength: 0,
          level: 5,
          damage: 25,
          moves: [],
          position: { x: 70, y: 50 },
          spawnTime: new Date(),
          waveNumber: 1,
          image: '/images/Unpowered Zombie.png'
        }
      ];

      // Create enemies for wave 2: 2 Powered Zombies
      const wave2Enemies = [
        {
          id: 'enemy_w2_1',
          type: 'powered_zombie',
          name: 'Powered Zombie 1',
          health: 250,
          maxHealth: 250,
          shieldStrength: 250,
          maxShieldStrength: 250,
          level: 8,
          damage: 40,
          moves: [],
          position: { x: 30, y: 50 },
          spawnTime: new Date(),
          waveNumber: 2,
          image: '/images/Powered Zombie.png'
        },
        {
          id: 'enemy_w2_2',
          type: 'powered_zombie',
          name: 'Powered Zombie 2',
          health: 250,
          maxHealth: 250,
          shieldStrength: 250,
          maxShieldStrength: 250,
          level: 8,
          damage: 40,
          moves: [],
          position: { x: 70, y: 50 },
          spawnTime: new Date(),
          waveNumber: 2,
          image: '/images/Powered Zombie.png'
        }
      ];

      // Store wave 2 enemies in a custom field that IslandRaidBattle can check
      const battleRoomData: any = {
        id: gameId,
        gameId,
        lobbyId: null,
        players: [currentUser.uid],
        enemies: wave1Enemies,
        customWaves: {
          2: wave2Enemies // Store wave 2 enemies
        },
        waveNumber: 1,
        maxWaves: 2,
        status: 'active',
        difficulty: 'normal',
        isChapter2Battle: true, // Flag to indicate this is a Chapter 2 battle
        chapterId: 2,
        chapterName: 'Test, Allies, & Enemies',
        challengeId: 'ch2-rival-selection',
        challengeName: 'Find a Home',
        challengeNumber: 2,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
      await setDoc(battleRoomRef, battleRoomData);

      // Set up battle state and show battle UI
      setGameId(gameId);
      setShowBattle(true);
    } catch (error) {
      console.error('Error starting Island Raid battle:', error);
      alert('Error starting battle. Please try again.');
    }
  };

  // Set up real-time listener when battle starts
  useEffect(() => {
    if (!showBattle || !gameId || !currentUser) return;
    
    // Helper to check if error is a Firestore internal assertion error
    const isFirestoreInternalError = (error: any): boolean => {
      if (!error) return false;
      const errorString = String(error);
      const errorMessage = error?.message || '';
      return errorString.includes('INTERNAL ASSERTION FAILED') || 
             errorMessage.includes('INTERNAL ASSERTION FAILED') ||
             errorString.includes('ID: ca9') ||
             errorString.includes('ID: b815');
    };

    const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
    const unsubscribe = onSnapshot(battleRoomRef, async (docSnapshot) => {
      try {
        if (!docSnapshot.exists()) return;
        
        const data = docSnapshot.data();
      const enemies = (data.enemies || []).map((enemy: any) => ({
        ...enemy,
        spawnTime: enemy.spawnTime?.toDate ? enemy.spawnTime.toDate() : (enemy.spawnTime || new Date())
      }));
      
      setWaveNumber(data.waveNumber || 1);
      setOpponents(enemies.map((enemy: any) => ({
        id: enemy.id,
        name: enemy.name,
        avatar: enemy.image || '🧟',
        image: enemy.image || undefined, // Include image property for BattleEngine
        currentPP: enemy.health || enemy.maxHealth || 0,
        maxPP: enemy.maxHealth || 0,
        shieldStrength: enemy.shieldStrength || 0,
        maxShieldStrength: enemy.maxShieldStrength || 0,
        level: enemy.level || 1,
        vaultHealth: enemy.health || 0,
        maxVaultHealth: enemy.maxHealth || 0
      })));
      
      // Set up allies (all players in battle)
      const players = data.players || [];
      const alliesList = [];
      
      for (const playerId of players) {
        const studentRef = doc(db, 'students', playerId);
        const studentDoc = await getDoc(studentRef);
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          const playerLevel = getLevelFromXP(studentData.xp || 0);
          alliesList.push({
            id: playerId,
            name: studentData.displayName || 'Player',
            avatar: studentData.photoURL || '👤',
            currentPP: studentData.powerPoints || 0,
            maxPP: 1000,
            shieldStrength: 0,
            maxShieldStrength: 0,
            level: playerLevel,
            isPlayer: playerId === currentUser.uid,
            photoURL: studentData.photoURL
          });
        }
      }
      
      setAllies(alliesList);
      } catch (error) {
        if (isFirestoreInternalError(error)) {
          return; // Suppress Firestore internal errors
        }
        console.error('TimuIslandStoryModal: Error processing battle room snapshot:', error);
      }
    }, (error) => {
      if (isFirestoreInternalError(error)) {
        return; // Suppress Firestore internal errors
      }
      console.error('TimuIslandStoryModal: Error in battle room listener:', error);
    });
    
    return () => unsubscribe();
  }, [showBattle, gameId, currentUser]);

  const handleNext = () => {
    if (currentSlide < storySlides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      // Last slide - start the Island Raid battle
      startIslandRaidBattle();
    }
  };

  const handlePrevious = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleVideoEnd = () => {
    // Auto-advance to next slide when video ends
    if (currentSlide < storySlides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      // Last video - should not happen as videos are not the last slides
      // But if it does, start the battle
      startIslandRaidBattle();
    }
  };

  // Handle battle end
  const handleBattleEnd = async (result: 'victory' | 'defeat' | 'escape') => {
    if (result === 'victory' && gameId) {
      // Show video first, then victory modal
      setShowVideoModal(true);
    }
  };

  const handleVideoComplete = () => {
    // After video completes, show victory modal and set rewards
    if (gameId) {
      const xpReward = 100;
      const ppReward = 50;
      
      setVictoryRewards({
        pp: ppReward,
        xp: xpReward,
        truthMetal: 0
      });
      setShowVictoryModal(true);
      setShowVideoModal(false);
    }
  };

  const handleOpponentsUpdate = async (updatedOpponents: any[]) => {
    if (!gameId || isUpdatingEnemiesRef.current) return;
    
    isUpdatingEnemiesRef.current = true;
    try {
      const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
      const battleRoomDoc = await getDoc(battleRoomRef);
      
      if (battleRoomDoc.exists()) {
        const currentData = battleRoomDoc.data();
        const currentEnemies = currentData.enemies || [];
        
        const updatedEnemies = currentEnemies.map((enemy: any) => {
          const updated = updatedOpponents.find(opp => opp.id === enemy.id);
          if (updated) {
            return {
              ...enemy,
              health: updated.vaultHealth !== undefined ? updated.vaultHealth : updated.currentPP,
              vaultHealth: updated.vaultHealth,
              image: enemy.image || updated.image // Preserve image property
            };
          }
          return enemy;
        });
        
        await updateDoc(battleRoomRef, {
          enemies: updatedEnemies,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error updating opponents:', error);
    } finally {
      isUpdatingEnemiesRef.current = false;
    }
  };

  const handleAlliesUpdate = (updatedAllies: any[]) => {
    setAllies(updatedAllies);
  };

  // Check for wave progression
  useEffect(() => {
    if (!showBattle || !opponents.length || !gameId) return;
    
    const allEnemiesDefeated = opponents.every(opp => {
      const health = opp.vaultHealth !== undefined ? opp.vaultHealth : (opp.currentPP || 0);
      return health <= 0;
    });
    
    if (allEnemiesDefeated && waveNumber < 2) {
      const spawnNextWave = async () => {
        try {
          const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
          const battleRoomDoc = await getDoc(battleRoomRef);
          
          if (battleRoomDoc.exists()) {
            const data = battleRoomDoc.data();
            const customWaves = (data as any).customWaves;
            const nextWave = waveNumber + 1;
            
            let newEnemies;
            if (customWaves && customWaves[nextWave]) {
              newEnemies = customWaves[nextWave];
            } else {
              return;
            }
            
            await updateDoc(battleRoomRef, {
              waveNumber: nextWave,
              enemies: newEnemies,
              updatedAt: serverTimestamp()
            });
            
            setWaveNumber(nextWave);
            setBattleLog(prev => [...prev, `🎉 Wave ${waveNumber} complete!`, `🌊 WAVE ${nextWave} BEGINS!`]);
          }
        } catch (error) {
          console.error('Error spawning next wave:', error);
        }
      };
      
      setTimeout(spawnNextWave, 1500);
    } else if (allEnemiesDefeated && waveNumber >= 2) {
      // All waves complete
      handleBattleEnd('victory');
    }
  }, [opponents, waveNumber, showBattle, gameId]);

  if (!isOpen) return null;

  // If battle is active, show battle UI
  if (showBattle && gameId) {
    return (
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.95)',
          zIndex: 10000
        }}
        onClick={(e) => e.stopPropagation()}
      >
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
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>🏝️ Timu Island Battle</h2>
            <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>
              Wave {waveNumber} / 2
            </div>
          </div>
          <button
            onClick={() => {
              setShowBattle(false);
              onClose();
            }}
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
        
        {/* Video Modal - plays after battle victory */}
        {showVideoModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20000
          }}>
            <div style={{
              position: 'relative',
              width: '100%',
              maxWidth: '1200px',
              maxHeight: '90vh',
              backgroundColor: '#1a1a1a',
              borderRadius: '1rem',
              padding: '2rem',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <h2 style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: 'white',
                marginBottom: '1.5rem',
                textAlign: 'center'
              }}>
                Entering the Research Facility
              </h2>
              <div style={{
                marginBottom: '1.5rem',
                borderRadius: '0.75rem',
                overflow: 'hidden',
                background: '#000',
                flexShrink: 0
              }}>
                <video
                  src="/videos/Ch2-2_EntertheResearchFacility.mp4"
                  controls
                  autoPlay
                  style={{
                    width: '100%',
                    maxHeight: '600px',
                    display: 'block'
                  }}
                  onEnded={handleVideoComplete}
                />
              </div>
            </div>
          </div>
        )}

        {/* Victory Modal */}
        {showVictoryModal && victoryRewards && (
          <IslandRaidVictoryModal
            isOpen={showVictoryModal}
            onClose={() => {
              setShowVictoryModal(false);
              setShowBattle(false);
              onComplete(); // Complete the challenge
              onClose();
            }}
            waveNumber={waveNumber}
            difficulty="normal"
            rewards={victoryRewards}
            customTitle="🏠 HOME BASE SECURED!"
            customSubtitle="You've successfully captured the Research Facility!"
          />
        )}
      </div>
    );
  }

  const currentSlideData = storySlides[currentSlide];
  const isFirstSlide = currentSlide === 0;
  const isLastSlide = currentSlide === storySlides.length - 1;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.9)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '2rem'
    }}>
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '1400px',
        maxHeight: '90vh',
        backgroundColor: '#1a1a1a',
        borderRadius: '1rem',
        padding: '2rem',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            color: 'white',
            fontSize: '1.5rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          }}
        >
          ×
        </button>

        {/* Title */}
        {currentSlideData.title && (
          <h2 style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            color: 'white',
            marginBottom: '1.5rem',
            textAlign: 'center'
          }}>
            {currentSlideData.title}
          </h2>
        )}

        {/* Media Container */}
        <div style={{
          marginBottom: '1.5rem',
          borderRadius: '0.75rem',
          overflow: 'hidden',
          background: '#000',
          position: 'relative',
          flexShrink: 0
        }}>
          {currentSlideData.type === 'video' ? (
            <video
              ref={videoRef}
              key={currentSlide}
              src={currentSlideData.src}
              controls
              autoPlay
              style={{
                width: '100%',
                maxHeight: '400px',
                display: 'block'
              }}
              onEnded={handleVideoEnd}
            />
          ) : (
            <img
              src={currentSlideData.src}
              alt={currentSlideData.title || 'Story image'}
              style={{
                width: '100%',
                maxHeight: '400px',
                objectFit: 'contain',
                display: 'block'
              }}
              onError={(e) => {
                console.error('Error loading image:', currentSlideData.src);
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
        </div>

        {/* Description / Narrator Text */}
        {currentSlideData.description && (
          <div style={{
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '0.5rem',
            padding: '1rem',
            marginBottom: '1.5rem',
            flexShrink: 0
          }}>
            <p style={{
              fontSize: '1.1rem',
              lineHeight: '1.8',
              color: '#e0e7ff',
              textAlign: 'center',
              fontStyle: 'italic',
              margin: 0
            }}>
              "{currentSlideData.description}"
            </p>
            <p style={{
              fontSize: '0.875rem',
              color: '#93c5fd',
              textAlign: 'right',
              marginTop: '0.5rem',
              marginBottom: 0
            }}>
              — {currentSlideData.speaker || 'Narrator'}
            </p>
          </div>
        )}

        {/* Navigation Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexShrink: 0,
          marginTop: 'auto',
          paddingTop: '1rem'
        }}>
          {/* Previous Button */}
          <button
            onClick={handlePrevious}
            disabled={isFirstSlide}
            style={{
              background: isFirstSlide 
                ? 'rgba(107, 114, 128, 0.5)' 
                : 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
              color: 'white',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              border: 'none',
              fontWeight: 'bold',
              cursor: isFirstSlide ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              opacity: isFirstSlide ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <span>←</span>
            Previous
          </button>

          {/* Slide Indicator */}
          <div style={{
            color: '#cbd5e1',
            fontSize: '0.875rem'
          }}>
            {currentSlide + 1} / {storySlides.length}
          </div>

          {/* Next Button */}
          <button
            onClick={handleNext}
            style={{
              background: isLastSlide
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : currentSlide === 2 // Sonido's Transmission image slide
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' // Green for Play button
                : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              color: 'white',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              border: 'none',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {isLastSlide ? 'Jump into Action' : currentSlide === 2 ? 'Play' : 'Next'}
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimuIslandStoryModal;

