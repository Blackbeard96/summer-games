import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, serverTimestamp, onSnapshot, updateDoc, getDoc, arrayUnion, deleteField } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import BattleEngine from './BattleEngine';
import BattleInviteModal from './BattleInviteModal';
import BattleInvitationManager from './BattleInvitationManager';
import { getLevelFromXP } from '../utils/leveling';
import { createBattleSession, subscribeToBattleSession, joinBattleSession } from '../utils/battleSessionManager';
import { BattleCombatant } from '../types/battleSession';

interface SquadUpStoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

interface StorySlide {
  type: 'image';
  src: string;
  title?: string;
  description?: string;
  speaker?: string;
}

const SquadUpStoryModal: React.FC<SquadUpStoryModalProps> = ({ isOpen, onClose, onComplete }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showBattle, setShowBattle] = useState(false);
  const [gameId, setGameId] = useState<string | null>(null);
  const [allies, setAllies] = useState<any[]>([]);
  const [opponents, setOpponents] = useState<any[]>([]);
  const [waveNumber, setWaveNumber] = useState(1);
  const [maxWaves, setMaxWaves] = useState(2); // Track max waves for display
  const [battleLog, setBattleLog] = useState<string[]>(['Welcome to the Jungle!']);
  const [customWaves, setCustomWaves] = useState<Record<string, any[]>>({});
  const [showVictoryModal, setShowVictoryModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [victoryRewards, setVictoryRewards] = useState<{
    pp: number;
    xp: number;
    truthMetal: number;
    captainHelmet?: boolean;
  } | null>(null);
  const [battleEndedInVictory, setBattleEndedInVictory] = useState(false); // Track if battle ended in victory
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { vault, moves } = useBattle();
  const isUpdatingEnemiesRef = useRef(false);
  const isProcessingWaveTransitionRef = useRef(false);
  const victoryTriggeredRef = useRef(false); // Track if victory has already been triggered
  const completionTriggeredRef = useRef(false); // Track if challenge completion has been triggered
  const lastWaveCheckRef = useRef<number>(0); // Track last time we checked for wave completion (timestamp)

  // AUTHORITATIVE: Check if all enemies in the current wave are defeated
  const areAllEnemiesDefeated = useCallback((enemiesForWave: any[]): boolean => {
    if (!enemiesForWave || enemiesForWave.length === 0) {
      console.log('🏝️ SquadUpStoryModal: areAllEnemiesDefeated - No enemies provided');
      return false;
    }

    const aliveCount = enemiesForWave.filter(opp => {
      // Check multiple health sources - prioritize vaultHealth, then health, then currentPP
      let health = 0;
      if (opp.vaultHealth !== undefined && opp.vaultHealth !== null) {
        health = Math.max(0, Number(opp.vaultHealth));
      } else if (opp.health !== undefined && opp.health !== null) {
        health = Math.max(0, Number(opp.health));
      } else if (opp.currentPP !== undefined && opp.currentPP !== null) {
        health = Math.max(0, Number(opp.currentPP));
      }
      
      // Also check shield strength as a secondary health indicator
      const shield = opp.shieldStrength !== undefined && opp.shieldStrength !== null 
        ? Math.max(0, Number(opp.shieldStrength))
        : 0;
      
      // Enemy is alive if they have health > 0 OR shield > 0, AND not explicitly marked as defeated
      const isAlive = (health > 0 || shield > 0) && !opp.isDefeated;
      
      if (!isAlive) {
        console.log(`🏝️ SquadUpStoryModal: Enemy ${opp.name} (${opp.id}) is defeated - health=${health}, shield=${shield}, isDefeated=${opp.isDefeated}`);
      }
      
      return isAlive;
    }).length;

    const allDefeated = aliveCount === 0;
    
    console.log(`🏝️ SquadUpStoryModal: areAllEnemiesDefeated check:`, {
      totalEnemies: enemiesForWave.length,
      aliveCount,
      allDefeated,
      enemyDetails: enemiesForWave.map(opp => ({
        name: opp.name,
        id: opp.id,
        vaultHealth: opp.vaultHealth,
        health: opp.health,
        currentPP: opp.currentPP,
        isDefeated: opp.isDefeated,
        calculatedHealth: opp.vaultHealth !== undefined ? Math.max(0, opp.vaultHealth) : (opp.health !== undefined ? Math.max(0, opp.health) : (opp.currentPP !== undefined ? Math.max(0, opp.currentPP) : 0))
      }))
    });

    return allDefeated;
  }, []);

  // SAFE: Advance wave if all enemies are defeated and conditions are met
  const advanceWaveIfNeeded = useCallback(async (
    currentWaveIndex: number,
    maxWavesCount: number,
    enemiesForWave: any[],
    customWaves: any,
    gameIdParam: string
  ): Promise<boolean> => {
    console.log(`🏝️ SquadUpStoryModal: advanceWaveIfNeeded - CALLED with:`, {
      currentWaveIndex,
      maxWavesCount,
      enemiesCount: enemiesForWave.length,
      gameIdParam,
      hasCustomWaves: !!customWaves && Object.keys(customWaves).length > 0
    });
    
    const now = Date.now();
    
    // Throttle: Don't check more than once per second
    if (now - lastWaveCheckRef.current < 1000) {
      console.log('🏝️ SquadUpStoryModal: advanceWaveIfNeeded - Throttled (checked too recently)', {
        timeSinceLastCheck: now - lastWaveCheckRef.current
      });
      return false;
    }
    lastWaveCheckRef.current = now;

    // Guard: Prevent multiple simultaneous transitions
    if (isProcessingWaveTransitionRef.current) {
      console.log('🏝️ SquadUpStoryModal: advanceWaveIfNeeded - Already processing wave transition');
      return false;
    }

    // Guard: Prevent if victory already triggered
    if (victoryTriggeredRef.current) {
      console.log('🏝️ SquadUpStoryModal: advanceWaveIfNeeded - Victory already triggered');
      return false;
    }

    // Guard: Check if battle is active
    if (!gameIdParam || !showBattle) {
      console.log('🏝️ SquadUpStoryModal: advanceWaveIfNeeded - Battle not active');
      return false;
    }

    // Check if all enemies are defeated
    if (!areAllEnemiesDefeated(enemiesForWave)) {
      console.log('🏝️ SquadUpStoryModal: advanceWaveIfNeeded - Not all enemies defeated');
      return false;
    }

    console.log(`✅ SquadUpStoryModal: advanceWaveIfNeeded - All enemies defeated! Current wave: ${currentWaveIndex}/${maxWavesCount}`);

    // Set transition flag immediately to prevent race conditions
    isProcessingWaveTransitionRef.current = true;

    try {
      const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameIdParam);
      const battleSessionRef = doc(db, 'battleSessions', gameIdParam);
      
      // Read current state from Firestore to ensure accuracy
      const [battleRoomDoc, battleSessionDoc] = await Promise.all([
        getDoc(battleRoomRef),
        getDoc(battleSessionRef)
      ]);

      if (!battleRoomDoc.exists() && !battleSessionDoc.exists()) {
        console.error('🏝️ SquadUpStoryModal: advanceWaveIfNeeded - Battle document not found');
        isProcessingWaveTransitionRef.current = false;
        return false;
      }

      // Prefer battleSessions over islandRaidBattleRooms
      const data = battleSessionDoc.exists() 
        ? (battleSessionDoc.data() || {}) 
        : (battleRoomDoc.exists() ? (battleRoomDoc.data() || {}) : {});
      
      if (!data || Object.keys(data).length === 0) {
        console.error('🏝️ SquadUpStoryModal: advanceWaveIfNeeded - Battle data is empty');
        isProcessingWaveTransitionRef.current = false;
        return false;
      }
      
      const battleStatus = data.status || 'active';
      const firestoreWave = data.wave || data.waveNumber || currentWaveIndex;
      const firestoreMaxWaves = data.maxWaves || maxWavesCount;
      const firestoreCustomWaves = (data as any).customWaves || customWaves || {};

      console.log(`🏝️ SquadUpStoryModal: advanceWaveIfNeeded - Firestore state:`, {
        status: battleStatus,
        wave: firestoreWave,
        maxWaves: firestoreMaxWaves,
        hasCustomWaves: !!firestoreCustomWaves
      });

      // Guard: Don't process if battle is already complete
      if (battleStatus === 'victory' || battleStatus === 'complete' || battleStatus === 'defeated') {
        console.log(`🏝️ SquadUpStoryModal: advanceWaveIfNeeded - Battle already ${battleStatus}`);
        if (battleStatus === 'victory' || battleStatus === 'complete') {
          if (!victoryTriggeredRef.current) {
            victoryTriggeredRef.current = true;
            setVictoryRewards({ pp: 100, xp: 100, truthMetal: 0, captainHelmet: true });
            setBattleEndedInVictory(true);
            setShowVictoryModal(true);
          }
        }
        isProcessingWaveTransitionRef.current = false;
        return false;
      }

      // Check if this is the final wave
      const isFinalWave = firestoreWave >= firestoreMaxWaves;
      console.log(`🏝️ SquadUpStoryModal: advanceWaveIfNeeded - Wave check: current=${firestoreWave}, max=${firestoreMaxWaves}, isFinal=${isFinalWave}`);

      if (isFinalWave) {
        // Final wave complete - end battle
        console.log(`🏝️ SquadUpStoryModal: advanceWaveIfNeeded - Final wave complete! Ending battle`);
        victoryTriggeredRef.current = true;

        setVictoryRewards({
          pp: 100,
          xp: 100,
          truthMetal: 0,
          captainHelmet: true
        });
        setBattleEndedInVictory(true);
        setShowVictoryModal(true);
        setBattleLog(prev => [...prev, 
          `🎉 Wave ${firestoreWave} complete!`, 
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 
          `🏆 ALL WAVES COMPLETE!`, 
          `🏆 VICTORY!`, 
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        ]);

        // Update Firestore
        const updateRef = battleSessionDoc.exists() ? battleSessionRef : battleRoomRef;
        await updateDoc(updateRef, {
          status: 'complete',
          updatedAt: serverTimestamp()
        });

        isProcessingWaveTransitionRef.current = false;
        return true;
      } else if (firestoreWave < firestoreMaxWaves) {
        // Advance to next wave
        const nextWave = firestoreWave + 1;
        let newEnemies;

        if (firestoreCustomWaves[nextWave]) {
          newEnemies = firestoreCustomWaves[nextWave];
          console.log(`🏝️ SquadUpStoryModal: advanceWaveIfNeeded - Spawning Wave ${nextWave} with ${newEnemies.length} enemies`);
        } else {
          console.warn(`🏝️ SquadUpStoryModal: advanceWaveIfNeeded - No custom enemies found for Wave ${nextWave}`);
          isProcessingWaveTransitionRef.current = false;
          return false;
        }

        // Clear player moves for the new wave
        const clearPlayerMoves: any = {};
        const players = data.players || data.participants || [];
        players.forEach((player: any) => {
          // Handle both string IDs and object with id property
          const playerId = typeof player === 'string' ? player : (player.id || player.userId || player.uid);
          if (playerId) {
            clearPlayerMoves[`playerMoves.${playerId}`] = deleteField();
            clearPlayerMoves[`pendingMoves.${playerId}`] = deleteField();
          }
        });

        // Update Firestore atomically
        const updateRef = battleSessionDoc.exists() ? battleSessionRef : battleRoomRef;
        await updateDoc(updateRef, {
          wave: nextWave,
          waveNumber: nextWave, // Support both field names
          enemies: newEnemies,
          status: 'active',
          updatedAt: serverTimestamp(),
          ...clearPlayerMoves
        });

        // Update local state
        setWaveNumber(nextWave);
        setBattleLog(prev => [...prev, 
          `🎉 Wave ${firestoreWave} complete!`, 
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 
          `🌊 WAVE ${nextWave} BEGINS!`, 
          `Enemies: ${newEnemies.length}`, 
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
        ]);

        console.log(`✅ SquadUpStoryModal: advanceWaveIfNeeded - Wave ${nextWave} spawned successfully`);

        // Clear transition flag after a delay to allow Firestore listener to process
        setTimeout(() => {
          isProcessingWaveTransitionRef.current = false;
          console.log('🏝️ SquadUpStoryModal: advanceWaveIfNeeded - Cleared transition flag');
        }, 1500);

        return true;
      } else {
        console.warn(`🏝️ SquadUpStoryModal: advanceWaveIfNeeded - Unexpected wave state: ${firestoreWave} >= ${firestoreMaxWaves}`);
        isProcessingWaveTransitionRef.current = false;
        return false;
      }
    } catch (error) {
      console.error('🏝️ SquadUpStoryModal: advanceWaveIfNeeded - Error:', error);
      isProcessingWaveTransitionRef.current = false;
      return false;
    }
  }, [areAllEnemiesDefeated, showBattle]);

  // Check if joining an existing battle from invitation
  useEffect(() => {
    if (!isOpen || !currentUser) return;

    const joinGameId = sessionStorage.getItem('squadUpBattleGameId');
    if (joinGameId) {
      console.log('SquadUpStoryModal: Joining existing battle from invitation:', joinGameId);
      // Immediately set up the battle - no story slides
      setGameId(joinGameId);
      setShowBattle(true);
      setCurrentSlide(999); // Set to a high number to skip all slides
      sessionStorage.removeItem('squadUpBattleGameId');
      console.log('SquadUpStoryModal: Battle should now be visible for invited player');
    }
  }, [isOpen, currentUser]);

  const storySlides: StorySlide[] = [
    {
      type: 'image',
      src: '/images/Ch2-3_ZekeAddress.png',
      title: 'Zeke Addresses the Group',
      description: 'As much as it sucks, we\'re stuck here. We need to figure out a way off this island.',
      speaker: 'Zeke'
    },
    {
      type: 'image',
      src: '/images/Ch2-3_ZekeAddress.png',
      title: 'Zeke\'s Plan',
      description: 'Sonido was right. Our best chance is to team up and level up. Take some time to find partners to Squad up with.',
      speaker: 'Zeke'
    },
    {
      type: 'image',
      src: '/images/Ch2-3_ArtifactLocations.png',
      title: 'Your First Mission',
      description: 'Zeke shows you the position of some artifacts you should be able to obtain that will help you get stronger.',
      speaker: 'Zeke'
    },
    {
      type: 'image',
      src: '/images/Ch2-3_ArtifactLocations.png',
      title: 'Mission Briefing',
      description: 'Now go with your squads and let\'s see what we can find out about this island while we collect some artifacts',
      speaker: 'Zeke'
    }
  ];

  // Check if returning from squads page or joining existing battle
  useEffect(() => {
    if (isOpen) {
      // Check if joining an existing battle from invitation
      const joinGameId = sessionStorage.getItem('squadUpBattleGameId');
      if (joinGameId && currentUser) {
        console.log('SquadUpStoryModal: Joining existing battle:', joinGameId);
        setGameId(joinGameId);
        setShowBattle(true);
        // Skip story slides and go straight to battle
        setCurrentSlide(999); // Set to a high number to skip all slides
        sessionStorage.removeItem('squadUpBattleGameId');
      } else {
        // Check if returning from squads page
        const returning = sessionStorage.getItem('squadUpReturning');
        if (returning === 'true') {
          // Show the artifact locations slide (slide 3, index 2)
          setCurrentSlide(2);
          sessionStorage.removeItem('squadUpReturning');
        } else {
          // Reset to first slide when opening normally
          setCurrentSlide(0);
        }
      }
    }
  }, [isOpen, currentUser]);

  const handleNext = () => {
    if (currentSlide < storySlides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const handlePrevious = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleFormTeam = () => {
    // Store that we're going to squads, so when they return we can show the artifact locations
    sessionStorage.setItem('squadUpReturning', 'true');
    onClose();
    navigate('/squads');
  };

  const handleContinue = () => {
    // Advance to the artifact locations slide instead of completing immediately
    if (currentSlide < storySlides.length - 1) {
      setCurrentSlide(currentSlide + 1);
    } else {
      // If we're already on the last slide, complete the challenge
      onComplete();
      onClose();
    }
  };

  const startJungleBattle = async () => {
    if (!currentUser || !vault) return;

    try {
      // Generate unique battle ID
      const battleId = `chapter2-3-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Get host's student data
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      const studentData = studentDoc.exists() ? studentDoc.data() : {};
      const playerLevel = getLevelFromXP(studentData.xp || 0);

      // Create host ally
      const hostAlly: BattleCombatant = {
        id: currentUser.uid,
        name: studentData.displayName || currentUser.displayName || 'Player',
        currentPP: vault.currentPP || 0,
        maxPP: vault.capacity || 1000,
        shieldStrength: vault.shieldStrength || 0,
        maxShieldStrength: vault.maxShieldStrength || 0,
        level: playerLevel,
        currentVaultHealth: vault.vaultHealth || 0,
        maxVaultHealth: Math.floor((vault.capacity || 1000) * 0.1),
        isPlayer: true,
        avatar: studentData.photoURL || currentUser.photoURL || '👤',
        photoURL: studentData.photoURL || currentUser.photoURL
      };

      // Define Wave 1: 3 Unpowered Zombies
      const wave1Enemies: BattleCombatant[] = [];
      for (let i = 0; i < 3; i++) {
        wave1Enemies.push({
          id: `enemy_1_${i}`,
          type: 'zombie',
          name: `Unpowered Zombie ${i + 1}`,
          currentPP: 150,
          maxPP: 150,
          shieldStrength: 0,
          maxShieldStrength: 0,
          level: 5,
          damage: 30,
          position: { x: Math.random() * 100, y: Math.random() * 100 },
          // Note: spawnTime removed - Firestore doesn't accept Date objects directly
          waveNumber: 1,
          image: '/images/Unpowered Zombie.png'
        });
      }

      // Define Wave 2: 2 Powered Zombies + 1 Zombie Captain
      const wave2Enemies: BattleCombatant[] = [];
      
      // Add 2 Powered Zombies
      for (let i = 0; i < 2; i++) {
        wave2Enemies.push({
          id: `enemy_2_${i}`,
          type: 'powered_zombie',
          name: `Powered Zombie ${i + 1}`,
          currentPP: 250,
          maxPP: 250,
          shieldStrength: 250,
          maxShieldStrength: 250,
          level: 8,
          damage: 50,
          position: { x: Math.random() * 100, y: Math.random() * 100 },
          // Note: spawnTime removed - Firestore doesn't accept Date objects directly
          waveNumber: 2,
          image: '/images/Powered Zombie.png'
        });
      }
      
      // Add Zombie Captain (boss)
      wave2Enemies.push({
        id: 'enemy_2_captain',
        type: 'zombie_captain',
        name: 'Zombie Captain',
        currentPP: 500,
        maxPP: 500,
        shieldStrength: 200,
        maxShieldStrength: 200,
        level: 10,
        damage: 80,
        position: { x: 50, y: 50 }, // Center position for boss
        // Note: spawnTime removed - Firestore doesn't accept Date objects directly
        waveNumber: 2,
        image: '/images/Zombie Captain.png'
      });

      // Store customWaves in state for BattleEngine
      const wavesConfig = {
        '2': wave2Enemies // Store wave 2 enemies
      };
      setCustomWaves(wavesConfig);
      
      // Create battle session in Firestore
      await createBattleSession(battleId, currentUser.uid, {
        mode: 'squadUp',
        allies: [hostAlly],
        enemies: wave1Enemies,
        wave: 1,
        maxWaves: 2,
        difficulty: 'normal',
        chapterId: 2,
        chapterName: 'Test, Allies, & Enemies',
        challengeId: 'ch2-team-trial',
        challengeName: 'Squad Up',
        challengeNumber: 3,
        customWaves: wavesConfig,
        rngSeed: Date.now()
      });

      // Also create islandRaidBattleRooms entry for backward compatibility with invitations
      const battleRoomData: any = {
        id: battleId,
        gameId: battleId,
        battleSessionId: battleId, // Link to battle session
        lobbyId: null,
        players: [currentUser.uid],
        enemies: wave1Enemies.map(e => ({
          ...e,
          health: e.currentPP,
          maxHealth: e.maxPP
        })),
        customWaves: {
          2: wave2Enemies.map(e => ({
            ...e,
            health: e.currentPP,
            maxHealth: e.maxPP
          }))
        },
        waveNumber: 1,
        maxWaves: 2,
        status: 'active',
        difficulty: 'normal',
        isChapter2Battle: true,
        chapterId: 2,
        chapterName: 'Test, Allies, & Enemies',
        challengeId: 'ch2-team-trial',
        challengeName: 'Squad Up',
        challengeNumber: 3,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const battleRoomRef = doc(db, 'islandRaidBattleRooms', battleId);
      await setDoc(battleRoomRef, battleRoomData);

      console.log(`✅ Created battle session and room: ${battleId}`);

      // Set up battle state and show battle UI
      setGameId(battleId);
      setShowBattle(true);
      setWaveNumber(1);
      setMaxWaves(2); // Initialize max waves
      victoryTriggeredRef.current = false; // Reset victory trigger for new battle
      isProcessingWaveTransitionRef.current = false; // Reset wave transition for new battle
    } catch (error: any) {
      console.error('❌ Error starting Jungle battle:', error);
      console.error('Error details:', {
        message: error?.message,
        code: error?.code,
        stack: error?.stack
      });
      alert(`Error starting battle: ${error?.message || 'Unknown error'}. Please try again.`);
    }
  };

  // Set up real-time listener when battle starts - subscribe to battle session
  useEffect(() => {
    if (!showBattle || !gameId || !currentUser) return;
    
    console.log(`📡 SquadUpStoryModal: Subscribing to battle session: ${gameId}`);
    
    // Subscribe to battle session (primary source of truth)
    // Note: Callback must be synchronous - async work is handled via setTimeout
    const unsubscribe = subscribeToBattleSession(gameId, (battleSession) => {
      // Use setTimeout to handle async operations outside the listener callback
      setTimeout(async () => {
        try {
          if (!battleSession) {
            console.warn(`⚠️ SquadUpStoryModal: Battle session ${gameId} does not exist`);
            return;
          }
          
          console.log(`📡 SquadUpStoryModal: Battle session update received`, {
            status: battleSession.status,
            phase: battleSession.phase,
            participants: battleSession.participants.length,
            allies: battleSession.allies.length,
            enemies: battleSession.enemies.length,
            wave: battleSession.wave
          });
          
          const data = battleSession;
        const enemies = (data.enemies || []).map((enemy: any) => ({
          ...enemy,
          spawnTime: enemy.spawnTime?.toDate ? enemy.spawnTime.toDate() : (enemy.spawnTime || new Date())
        }));
      
      const newWaveNumber = data.wave || 1;
      const newMaxWaves = data.maxWaves || 2;
      const newCustomWaves = (data as any).customWaves || {};
      
      if (newWaveNumber !== waveNumber) {
        console.log(`🏝️ SquadUpStoryModal: Wave number changed from ${waveNumber} to ${newWaveNumber}`);
        setWaveNumber(newWaveNumber);
      }
      if (newMaxWaves !== maxWaves) {
        console.log(`🏝️ SquadUpStoryModal: Max waves changed from ${maxWaves} to ${newMaxWaves}`);
        setMaxWaves(newMaxWaves);
      }
      if (Object.keys(newCustomWaves).length > 0 && JSON.stringify(newCustomWaves) !== JSON.stringify(customWaves)) {
        setCustomWaves(newCustomWaves);
      }
      
      const newOpponents = enemies.map((enemy: BattleCombatant) => {
        const health = enemy.currentPP || 0;
        const shield = enemy.shieldStrength || 0;
        const isDefeated = health <= 0 && shield <= 0;
        
        return {
          id: enemy.id,
          name: enemy.name,
          avatar: enemy.image || '🧟',
          image: enemy.image || undefined,
          currentPP: health,
          maxPP: enemy.maxPP || 0,
          shieldStrength: shield,
          maxShieldStrength: enemy.maxShieldStrength || 0,
          level: enemy.level || 1,
          vaultHealth: health,
          maxVaultHealth: enemy.maxPP || 0,
          isDefeated: isDefeated, // Explicitly set isDefeated based on health/shield
          defeatedAt: isDefeated ? new Date() : undefined
        };
      });
      
      // Log enemy health changes for debugging
      console.log(`🏝️ SquadUpStoryModal: onSnapshot - Enemies updated:`, newOpponents.map((opp: any) => ({
        name: opp.name,
        id: opp.id,
        vaultHealth: opp.vaultHealth,
        health: opp.health,
        currentPP: opp.currentPP
      })));
      
      setOpponents(newOpponents);
      
      // Check if battle is already complete - if so, trigger victory modal and don't process wave progression
      const battleStatus = data.status || 'active';
      if (battleStatus === 'complete' || battleStatus === 'defeated') {
        if (battleStatus === 'complete' && !victoryTriggeredRef.current) {
          // Battle was marked as victory in Firestore, trigger victory modal
          console.log('🏝️ SquadUpStoryModal: onSnapshot - Battle status is victory, showing victory modal');
          victoryTriggeredRef.current = true; // Set this FIRST to prevent duplicate triggers
          setVictoryRewards({ pp: 100, xp: 100, truthMetal: 0, captainHelmet: true });
          setBattleEndedInVictory(true);
          setShowVictoryModal(true);
          console.log('✅ SquadUpStoryModal: Victory modal state set - showVictoryModal=true, battleEndedInVictory=true');
        }
        return; // Don't process wave progression if battle is already complete
      }

      // Check for wave progression after updating opponents
      // Use the authoritative function to check if all enemies are defeated
      if (newOpponents.length > 0) {
        const currentWave = data.wave || newWaveNumber || 1;
        const maxWaves = data.maxWaves || 2;
        const customWaves = (data as any).customWaves || {};
        
        console.log(`🏝️ SquadUpStoryModal: onSnapshot - Checking wave progression:`, {
          currentWave,
          maxWaves,
          opponentsCount: newOpponents.length,
          isProcessing: isProcessingWaveTransitionRef.current,
          victoryTriggered: victoryTriggeredRef.current,
          opponents: newOpponents.map((opp: any) => ({
            name: opp.name,
            vaultHealth: opp.vaultHealth,
            health: opp.health,
            currentPP: opp.currentPP
          }))
        });
        
        // First check if all enemies are defeated using the authoritative function
        const allDefeated = areAllEnemiesDefeated(newOpponents);
        console.log(`🏝️ SquadUpStoryModal: onSnapshot - All enemies defeated check result: ${allDefeated}`, {
          opponentsCount: newOpponents.length,
          opponents: newOpponents.map(opp => ({
            name: opp.name,
            id: opp.id,
            vaultHealth: opp.vaultHealth,
            health: (opp as any).health,
            currentPP: opp.currentPP,
            shieldStrength: opp.shieldStrength,
            isDefeated: (opp as any).isDefeated
          }))
        });
        
        if (allDefeated) {
          // Use the safe wave advancement function
          // Small delay to ensure state is settled
          console.log(`🏝️ SquadUpStoryModal: onSnapshot - All enemies defeated, calling advanceWaveIfNeeded in 500ms`);
          setTimeout(() => {
            console.log(`🏝️ SquadUpStoryModal: onSnapshot - Now calling advanceWaveIfNeeded`);
            advanceWaveIfNeeded(currentWave, maxWaves, newOpponents, customWaves, gameId).catch(err => {
              console.error('🏝️ SquadUpStoryModal: onSnapshot - Error in advanceWaveIfNeeded:', err);
            });
          }, 500);
        } else {
          console.log(`🏝️ SquadUpStoryModal: onSnapshot - Not all enemies defeated yet, skipping wave advancement`, {
            aliveEnemies: newOpponents.filter(opp => {
              let health = 0;
              if (opp.vaultHealth !== undefined && opp.vaultHealth !== null) {
                health = Math.max(0, Number(opp.vaultHealth));
              } else if ((opp as any).health !== undefined && (opp as any).health !== null) {
                health = Math.max(0, Number((opp as any).health));
              } else if (opp.currentPP !== undefined && opp.currentPP !== null) {
                health = Math.max(0, Number(opp.currentPP));
              }
              const shield = opp.shieldStrength !== undefined && opp.shieldStrength !== null 
                ? Math.max(0, Number(opp.shieldStrength))
                : 0;
              return (health > 0 || shield > 0) && !(opp as any).isDefeated;
            }).map(opp => ({ 
              name: opp.name, 
              vaultHealth: opp.vaultHealth, 
              health: (opp as any).health, 
              currentPP: opp.currentPP,
              shieldStrength: opp.shieldStrength
            }))
          });
        }
      }
      
      // Set up allies from battle session
      const alliesList = (data.allies || []).map((ally: BattleCombatant) => ({
        id: ally.id,
        name: ally.name,
        avatar: ally.avatar || ally.image || '👤',
        currentPP: ally.currentPP || 0,
        maxPP: ally.maxPP || 0,
        shieldStrength: ally.shieldStrength || 0,
        maxShieldStrength: ally.maxShieldStrength || 0,
        level: ally.level || 1,
        isPlayer: ally.isPlayer || ally.id === currentUser.uid,
        photoURL: ally.photoURL || ally.avatar,
        vaultHealth: ally.currentVaultHealth,
        maxVaultHealth: ally.maxVaultHealth
      }));
      
      setAllies(alliesList);
      
      // Update battle log from session
      if (data.battleLog && data.battleLog.length > 0) {
        const logEntries = data.battleLog.map((entry: any) => entry.text);
        setBattleLog(logEntries);
      }
        } catch (error: any) {
          // Suppress known Firestore internal assertion errors
          const isFirestoreInternalError = (err: any): boolean => {
            if (!err) return false;
            const errorString = String(err);
            const errorMessage = err?.message || '';
            const errorCode = err?.code || '';
            return errorString.includes('INTERNAL ASSERTION FAILED') || 
                   errorMessage.includes('INTERNAL ASSERTION FAILED') ||
                   errorString.includes('ID: ca9') ||
                   errorString.includes('ID: b815') ||
                   errorCode === 'failed-precondition';
          };
          
          if (isFirestoreInternalError(error)) {
            console.warn('⚠️ SquadUpStoryModal: Firestore internal assertion error (suppressed):', error);
            return;
          }
          console.error('SquadUpStoryModal: Error processing battle session snapshot:', error);
        }
      }, 0); // Execute async work on next tick
    });
    
    return () => unsubscribe();
  }, [showBattle, gameId, currentUser]);

  const handleCompleteChallenge = () => {
    // Start the battle instead of completing immediately
    startJungleBattle();
  };

  // Handle battle end
  const handleBattleEnd = async (result: 'victory' | 'defeat' | 'escape') => {
    console.log('SquadUpStoryModal: handleBattleEnd called with result:', result);
    
    if (result === 'escape') {
      // On escape, just close the battle and return to story - DO NOT complete challenge
      console.log('SquadUpStoryModal: Player escaped - closing battle without completing challenge');
      setBattleEndedInVictory(false); // Mark that battle did NOT end in victory
      setShowBattle(false);
      setGameId(null);
      setShowVictoryModal(false); // Ensure victory modal is not shown
      setVictoryRewards(null); // Clear any rewards
      return; // Exit early - do not proceed with any completion logic
    }
    
    if (result === 'defeat') {
      // On defeat, just close the battle
      console.log('SquadUpStoryModal: Player defeated - closing battle without completing challenge');
      setBattleEndedInVictory(false); // Mark that battle did NOT end in victory
      setShowBattle(false);
      setGameId(null);
      setShowVictoryModal(false); // Ensure victory modal is not shown
      setVictoryRewards(null); // Clear any rewards
      return; // Exit early - do not proceed with any completion logic
    }
    
    if (result === 'victory' && gameId) {
      setBattleEndedInVictory(true); // Mark that battle ended in victory
      // Check if there are more waves
      const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
      const battleRoomDoc = await getDoc(battleRoomRef);
      
      if (battleRoomDoc.exists()) {
        const data = battleRoomDoc.data();
        const currentWave = data.waveNumber || 1;
        const maxWaves = data.maxWaves || 2;
        const customWaves = (data as any).customWaves || {};
        
        if (currentWave < maxWaves) {
          // Advance to next wave
          const nextWave = currentWave + 1;
          let newEnemies;
          
          if (customWaves[nextWave]) {
            // Use custom enemies for this wave
            newEnemies = customWaves[nextWave];
          } else {
            // Fallback: generate enemies (shouldn't happen for Chapter 2-3)
            newEnemies = [];
          }
          
          // Update Firestore with next wave
          await updateDoc(battleRoomRef, {
            waveNumber: nextWave,
            enemies: newEnemies,
            status: 'active',
            updatedAt: serverTimestamp()
          });
          
          // Update local state - the onSnapshot listener will pick up the changes
          setWaveNumber(nextWave);
        } else {
          // All waves complete - show victory modal
          console.log('SquadUpStoryModal: All waves complete - showing victory modal');
          const xpReward = 100;
          const ppReward = 100;
          
          setVictoryRewards({
            pp: ppReward,
            xp: xpReward,
            truthMetal: 0,
            captainHelmet: true
          });
          setShowVictoryModal(true);
        }
      }
    }
  };

  const handleOpponentsUpdate = useCallback(async (updatedOpponents: any[]) => {
    if (!gameId || isUpdatingEnemiesRef.current) return;
    
    isUpdatingEnemiesRef.current = true;
    try {
      const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
      const battleRoomDoc = await getDoc(battleRoomRef);
      
      if (battleRoomDoc.exists()) {
        const currentData = battleRoomDoc.data();
        const currentEnemies = currentData.enemies || [];
        
        console.log('🏝️ SquadUpStoryModal: handleOpponentsUpdate called with', updatedOpponents.length, 'opponents');
        console.log('🏝️ SquadUpStoryModal: Updated opponents data:', updatedOpponents.map(opp => ({
          id: opp.id,
          name: opp.name,
          vaultHealth: opp.vaultHealth,
          maxVaultHealth: opp.maxVaultHealth,
          shieldStrength: opp.shieldStrength,
          health: opp.health,
          currentPP: opp.currentPP
        })));
        
        const updatedEnemies = currentEnemies.map((enemy: any) => {
          const updated = updatedOpponents.find((o: any) => o.id === enemy.id);
          if (updated) {
            // Priority: vaultHealth (Island Raid) > health > currentPP > original health
            // CRITICAL: vaultHealth can be 0, so we must check !== undefined, not truthy
            const updatedHealth = updated.vaultHealth !== undefined 
              ? updated.vaultHealth 
              : (updated.health !== undefined 
                ? updated.health 
                : (updated.currentPP !== undefined ? updated.currentPP : enemy.health));
            const updatedMaxHealth = updated.maxVaultHealth !== undefined 
              ? updated.maxVaultHealth 
              : (updated.maxHealth !== undefined 
                ? updated.maxHealth 
                : enemy.maxHealth);
            const updatedShield = updated.shieldStrength !== undefined 
              ? updated.shieldStrength 
              : enemy.shieldStrength;
            const updatedMaxShield = updated.maxShieldStrength !== undefined 
              ? updated.maxShieldStrength 
              : enemy.maxShieldStrength;
            
            console.log(`🏝️ SquadUpStoryModal: Updating enemy ${enemy.name} (${enemy.id}): health ${enemy.health} → ${updatedHealth}, shield ${enemy.shieldStrength} → ${updatedShield}`);
            
            return {
              ...enemy,
              health: updatedHealth,
              maxHealth: updatedMaxHealth,
              shieldStrength: updatedShield,
              maxShieldStrength: updatedMaxShield
            };
          }
          return enemy;
        });
        
        console.log('🏝️ SquadUpStoryModal: Saving enemies to Firestore:', updatedEnemies.map((e: any) => ({ 
          id: e.id, 
          name: e.name, 
          health: e.health, 
          maxHealth: e.maxHealth, 
          shieldStrength: e.shieldStrength
        })));
        
        await updateDoc(battleRoomRef, {
          enemies: updatedEnemies,
          updatedAt: serverTimestamp()
        });
        
        console.log('✅ SquadUpStoryModal: Successfully saved enemies to Firestore');
        
        // Update local opponents state immediately to reflect the changes
        setOpponents(prev => {
          const updated = prev.map(opp => {
            const updatedOpp = updatedOpponents.find(u => u.id === opp.id);
            if (updatedOpp) {
              const newOpp = {
                ...opp,
                vaultHealth: updatedOpp.vaultHealth !== undefined ? updatedOpp.vaultHealth : opp.vaultHealth,
                maxVaultHealth: updatedOpp.maxVaultHealth !== undefined ? updatedOpp.maxVaultHealth : opp.maxVaultHealth,
                shieldStrength: updatedOpp.shieldStrength !== undefined ? updatedOpp.shieldStrength : opp.shieldStrength,
                maxShieldStrength: updatedOpp.maxShieldStrength !== undefined ? updatedOpp.maxShieldStrength : opp.maxShieldStrength,
                // Also update health for compatibility
                health: updatedOpp.vaultHealth !== undefined ? updatedOpp.vaultHealth : (updatedOpp.health !== undefined ? updatedOpp.health : opp.health),
                maxHealth: updatedOpp.maxVaultHealth !== undefined ? updatedOpp.maxVaultHealth : (updatedOpp.maxHealth !== undefined ? updatedOpp.maxHealth : opp.maxHealth)
              };
              console.log(`🔄 SquadUpStoryModal: Updated local opponent ${opp.name}: vaultHealth ${opp.vaultHealth} → ${newOpp.vaultHealth}`);
              return newOpp;
            }
            return opp;
          });
          
          // Check if all enemies are defeated immediately after state update
          const allDefeated = updated.length > 0 && updated.every(opp => {
            let health = 0;
            if (opp.vaultHealth !== undefined && opp.vaultHealth !== null) {
              health = Math.max(0, Number(opp.vaultHealth));
            } else if ((opp as any).health !== undefined && (opp as any).health !== null) {
              health = Math.max(0, Number((opp as any).health));
            } else if (opp.currentPP !== undefined && opp.currentPP !== null) {
              health = Math.max(0, Number(opp.currentPP));
            }
            
            const shield = opp.shieldStrength !== undefined && opp.shieldStrength !== null 
              ? Math.max(0, Number(opp.shieldStrength))
              : 0;
            
            // Enemy is defeated if both health and shield are 0
            return health <= 0 && shield <= 0;
          });
          
          if (allDefeated && updated.length > 0) {
            console.log(`✅ SquadUpStoryModal: All enemies defeated detected in setOpponents! Triggering wave check...`);
            // Trigger wave check after a short delay to ensure state is set
            setTimeout(() => {
              // Get current wave info from Firestore
              const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
              const battleSessionRef = doc(db, 'battleSessions', gameId);
              Promise.all([getDoc(battleRoomRef), getDoc(battleSessionRef)]).then(([battleRoomDoc, battleSessionDoc]) => {
                const data = battleSessionDoc.exists() 
                  ? (battleSessionDoc.data() || {}) 
                  : (battleRoomDoc.exists() ? (battleRoomDoc.data() || {}) : {});
                const currentWave = data.wave || data.waveNumber || waveNumber;
                const maxWavesValue = data.maxWaves || maxWaves;
                const customWaves = (data as any).customWaves || {};
                
                console.log(`🏝️ SquadUpStoryModal: setOpponents callback - Calling advanceWaveIfNeeded:`, {
                  currentWave,
                  maxWaves: maxWavesValue,
                  enemiesCount: updated.length
                });
                
                advanceWaveIfNeeded(currentWave, maxWavesValue, updated, customWaves, gameId).catch(err => {
                  console.error('🏝️ SquadUpStoryModal: setOpponents callback - Error in advanceWaveIfNeeded:', err);
                });
              }).catch(err => {
                console.error('🏝️ SquadUpStoryModal: setOpponents callback - Error reading Firestore:', err);
              });
            }, 500);
          }
          
          return updated;
        });
      }
    } catch (error) {
      console.error('❌ SquadUpStoryModal: Error updating enemies in Firestore:', error);
    } finally {
      // Clear flag after a delay to allow Firestore write to complete and listener to process
      setTimeout(() => {
        isUpdatingEnemiesRef.current = false;
        console.log('🏝️ SquadUpStoryModal: Cleared isUpdatingEnemiesRef flag');
      }, 500);
    }
  }, [gameId, waveNumber, maxWaves, advanceWaveIfNeeded]);

  const handleAlliesUpdate = useCallback((updatedAllies: any[]) => {
    setAllies(updatedAllies);
  }, []);

  // Automatically detect when all enemies are defeated and spawn next wave
  // This useEffect serves as a backup check in case onSnapshot misses the update
  useEffect(() => {
    console.log(`🏝️ SquadUpStoryModal: Wave progression useEffect triggered:`, {
      showBattle,
      gameId,
      opponentsCount: opponents.length,
      waveNumber,
      maxWaves,
      isProcessing: isProcessingWaveTransitionRef.current,
      victoryTriggered: victoryTriggeredRef.current
    });
    
    if (!showBattle || !gameId) {
      console.log(`🏝️ SquadUpStoryModal: Wave progression useEffect returning early - showBattle: ${showBattle}, gameId: ${gameId}`);
      return;
    }
    
    if (!opponents.length) {
      console.log(`🏝️ SquadUpStoryModal: Wave progression useEffect returning early - no opponents`);
      return;
    }

    // Use the authoritative function to check if all enemies are defeated
    // Small delay to ensure state is settled
    console.log(`🏝️ SquadUpStoryModal: useEffect - About to check enemies:`, opponents.map(opp => ({
      name: opp.name,
      vaultHealth: opp.vaultHealth,
      health: opp.health,
      currentPP: opp.currentPP
    })));
    
    const allDefeated = areAllEnemiesDefeated(opponents);
    console.log(`🏝️ SquadUpStoryModal: useEffect - All enemies defeated check result: ${allDefeated}`);
    
    if (!allDefeated) {
      console.log(`🏝️ SquadUpStoryModal: useEffect - Not all enemies defeated, skipping wave advancement`);
      return;
    }
    
    const timer = setTimeout(() => {
      console.log(`🏝️ SquadUpStoryModal: useEffect - Calling advanceWaveIfNeeded after delay`);
      // customWaves will be read from Firestore in advanceWaveIfNeeded
      advanceWaveIfNeeded(waveNumber, maxWaves, opponents, {}, gameId).catch(err => {
        console.error('🏝️ SquadUpStoryModal: useEffect - Error in advanceWaveIfNeeded:', err);
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [opponents, waveNumber, maxWaves, showBattle, gameId, advanceWaveIfNeeded, areAllEnemiesDefeated]);

  // Periodic wave check - runs every 2 seconds to catch any missed transitions
  useEffect(() => {
    if (!showBattle || !gameId || !opponents.length || isProcessingWaveTransitionRef.current || victoryTriggeredRef.current) {
      return;
    }

    const interval = setInterval(() => {
      const allDefeated = areAllEnemiesDefeated(opponents);
      if (allDefeated) {
        console.log(`🏝️ SquadUpStoryModal: Periodic check (every 2s) - All enemies defeated, triggering wave check`);
        advanceWaveIfNeeded(waveNumber, maxWaves, opponents, {}, gameId).catch(err => {
          console.error('🏝️ SquadUpStoryModal: Periodic check - Error in advanceWaveIfNeeded:', err);
        });
      }
    }, 2000); // Check every 2 seconds

    return () => clearInterval(interval);
  }, [opponents, waveNumber, maxWaves, showBattle, gameId, advanceWaveIfNeeded, areAllEnemiesDefeated]);

  // Reset states when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setShowBattle(false);
      setGameId(null);
      setShowVictoryModal(false);
      setVictoryRewards(null);
      setCurrentSlide(0);
      setBattleEndedInVictory(false); // Reset victory flag when modal closes
      victoryTriggeredRef.current = false; // Reset victory trigger ref
      isProcessingWaveTransitionRef.current = false; // Reset wave transition ref
      completionTriggeredRef.current = false; // Reset completion trigger ref
    }
  }, [isOpen]);

  // Debug: Track victory modal state changes
  useEffect(() => {
    if (showVictoryModal || victoryRewards || battleEndedInVictory) {
      console.log('🏝️ SquadUpStoryModal: Victory modal state changed:', {
        showVictoryModal,
        hasVictoryRewards: !!victoryRewards,
        battleEndedInVictory,
        victoryRewards,
        shouldRender: showVictoryModal && victoryRewards && battleEndedInVictory
      });
    }
  }, [showVictoryModal, victoryRewards, battleEndedInVictory]);

  // When battle completes, automatically trigger challenge completion (shows ChallengeRewardModal)
  useEffect(() => {
    if (showVictoryModal && victoryRewards && battleEndedInVictory && !completionTriggeredRef.current) {
      completionTriggeredRef.current = true;
      console.log('🏝️ SquadUpStoryModal: Battle completed - triggering challenge completion');
      
      // Close battle UI and modal, then trigger completion
      // This will call handleSquadUpStoryComplete which shows the ChallengeRewardModal
      setShowVictoryModal(false);
      setShowBattle(false);
      setBattleEndedInVictory(false);
      
      // Small delay to ensure state updates, then complete challenge
      setTimeout(() => {
        onComplete(); // This triggers handleSquadUpStoryComplete and shows ChallengeRewardModal
        onClose();
      }, 100);
    }
  }, [showVictoryModal, victoryRewards, battleEndedInVictory, onComplete, onClose]);

  if (!isOpen) return null;

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
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 20000,
      animation: 'fadeIn 0.3s ease-in'
    }}
    onClick={onClose}
    >
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '1.5rem',
        padding: '2rem',
        maxWidth: '900px',
        width: '90%',
        maxHeight: '90vh',
        border: '3px solid #fbbf24',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        animation: 'slideUp 0.3s ease-out',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto'
      }}
      onClick={(e) => e.stopPropagation()}
      >
        {/* Story Content */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          flex: 1,
          minHeight: 0
        }}>
          {/* Image */}
          {currentSlideData.type === 'image' && (
            <div style={{
              width: '100%',
              maxHeight: '400px',
              borderRadius: '0.5rem',
              overflow: 'hidden',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: '#0f172a'
            }}>
              <img
                src={currentSlideData.src}
                alt={currentSlideData.title || 'Story Image'}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  maxHeight: '400px'
                }}
              />
            </div>
          )}

          {/* Title and Description */}
          <div style={{
            textAlign: 'center',
            padding: '0 1rem'
          }}>
            {currentSlideData.title && (
              <h3 style={{
                fontSize: '1.5rem',
                fontWeight: 'bold',
                color: '#fbbf24',
                marginBottom: '1rem',
                marginTop: 0
              }}>
                {currentSlideData.title}
              </h3>
            )}
            {currentSlideData.description && (
              <div style={{
                background: 'rgba(251, 191, 36, 0.1)',
                border: '2px solid rgba(251, 191, 36, 0.3)',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                marginTop: '1rem'
              }}>
                <p style={{
                  fontSize: '1.125rem',
                  color: '#fbbf24',
                  margin: 0,
                  lineHeight: '1.6',
                  fontStyle: 'italic'
                }}>
                  "{currentSlideData.description}"
                </p>
                {currentSlideData.speaker && (
                  <p style={{
                    fontSize: '0.875rem',
                    color: '#cbd5e1',
                    marginTop: '0.75rem',
                    marginBottom: 0,
                    textAlign: 'right'
                  }}>
                    — {currentSlideData.speaker}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

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

          {/* Action Buttons - Show choice buttons on second slide, Next on third slide, Complete on last slide */}
          {currentSlide === storySlides.length - 3 ? (
            // Second slide: Show Form Team and Continue options
            <div style={{
              display: 'flex',
              gap: '1rem'
            }}>
              <button
                onClick={handleFormTeam}
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
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
                <span>👥</span>
                Form a Team
              </button>
              <button
                onClick={handleContinue}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
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
                Continue
                <span>→</span>
              </button>
            </div>
          ) : isLastSlide ? (
            // Last slide (mission briefing): Show Enter the Jungle button
            <button
              onClick={handleCompleteChallenge}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
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
              Enter the Jungle
              <span>→</span>
            </button>
          ) : (
            <button
              onClick={handleNext}
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
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
              Next
              <span>→</span>
            </button>
          )}
        </div>
      </div>

      {/* Battle UI - Hide when victory modal is showing */}
      {showBattle && gameId && !showVictoryModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 30000,
            backgroundColor: '#0a0a0a'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Battle Header with Wave Number */}
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
              <h2 style={{ margin: 0, fontSize: '1.5rem' }}>🏝️ Squad Up Battle</h2>
              <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>
                Wave {waveNumber} / {maxWaves}
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
          <BattleEngine
            gameId={gameId}
            allies={allies}
            opponents={opponents}
            onBattleEnd={handleBattleEnd}
            onMoveConsumption={async () => true}
            onBattleLogUpdate={(log) => setBattleLog(log)}
            onOpponentsUpdate={handleOpponentsUpdate}
            onAlliesUpdate={handleAlliesUpdate}
            isMultiplayer={true}
            initialBattleLog={battleLog}
            battleName="Jungle Battle"
            onInviteClick={() => {
              console.log('Invite button clicked, opening invite modal');
              setShowInviteModal(true);
            }}
            allowInvites={true}
            currentWave={waveNumber}
            maxWaves={maxWaves}
            customWaves={customWaves}
            onWaveAdvance={async (newWave, newEnemies) => {
              console.log(`🌊 SquadUpStoryModal: Wave advanced to ${newWave} by BattleEngine`);
              setWaveNumber(newWave);
              setOpponents(newEnemies);
              
              // Update Firestore with new wave
              if (gameId) {
                try {
                  const battleSessionRef = doc(db, 'battleSessions', gameId);
                  const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
                  
                  await updateDoc(battleSessionRef, {
                    wave: newWave,
                    enemies: newEnemies,
                    updatedAt: serverTimestamp()
                  });
                  
                  await updateDoc(battleRoomRef, {
                    waveNumber: newWave,
                    enemies: newEnemies.map((e: any) => ({
                      ...e,
                      health: e.vaultHealth || e.currentPP,
                      maxHealth: e.maxVaultHealth || e.maxPP
                    })),
                    updatedAt: serverTimestamp()
                  });
                  
                  console.log(`✅ SquadUpStoryModal: Updated Firestore with wave ${newWave}`);
                } catch (error) {
                  console.error('❌ SquadUpStoryModal: Error updating Firestore for wave advance:', error);
                }
              }
            }}
          />
        </div>
      )}


      {/* Battle Invite Modal */}
      {gameId && showInviteModal && (
        <BattleInviteModal
          isOpen={showInviteModal}
          onClose={() => {
            console.log('Closing invite modal');
            setShowInviteModal(false);
          }}
          gameId={gameId}
          battleName="Jungle Battle"
          currentPlayers={allies.map(ally => ally.id)}
          chapterId={2}
          chapterName="Test, Allies, & Enemies"
          challengeId="ch2-team-trial"
          challengeName="Squad Up"
          challengeNumber={3}
        />
      )}

      {/* Battle Invitation Manager */}
      <BattleInvitationManager />

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

export default SquadUpStoryModal;

