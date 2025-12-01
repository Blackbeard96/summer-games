import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp, onSnapshot, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import BattleEngine from './BattleEngine';
import BattleModeSelector from './BattleModeSelector';
import { getActivePPBoost, applyPPBoost } from '../utils/ppBoost';
import { getLevelFromXP } from '../utils/leveling';
import PracticeWaitingRoomModal from './PracticeWaitingRoomModal';

interface CPUOpponent {
  id: string;
  name: string;
  battleName?: string; // Name used during battle (if different from card name)
  displayName?: string; // Name displayed on the card (if different from name)
  level: number;
  powerPoints: number;
  shieldStrength: number;
  difficulty: 'easy' | 'medium' | 'hard';
  description: string;
  image?: string;
  rewards: {
    pp: number;
    xp: number;
    tmShards?: number;
  };
}

interface PracticeModeBattleProps {
  onBack: () => void;
}

// Define opponents outside component to avoid dependency issues
const cpuOpponents: CPUOpponent[] = [
    {
      id: 'cpu-easy-1',
      name: 'Training Dummy',
      level: 5,
      powerPoints: 100,
      shieldStrength: 20,
      difficulty: 'easy',
      description: 'A basic training opponent perfect for learning the basics',
      image: '/images/Training Dummy.png',
      rewards: { pp: 10, xp: 25 }
    },
    {
      id: 'cpu-easy-2',
      name: 'Novice Guard',
      level: 8,
      powerPoints: 150,
      shieldStrength: 30,
      difficulty: 'easy',
      description: 'A beginner guard with basic defensive capabilities',
      image: '/images/Novice Guard.png',
      rewards: { pp: 15, xp: 35 }
    },
    {
      id: 'cpu-medium-1',
      name: 'Elite Soldier',
      level: 12,
      powerPoints: 250,
      shieldStrength: 50,
      difficulty: 'medium',
      description: 'A skilled soldier with balanced offense and defense',
      image: '/images/Elite Soldier.png',
      rewards: { pp: 25, xp: 50 }
    },
    {
      id: 'cpu-medium-2',
      name: 'Vault Keeper',
      level: 15,
      powerPoints: 300,
      shieldStrength: 100,
      difficulty: 'medium',
      description: 'An experienced vault keeper with strong defensive tactics',
      image: '/images/Vault Keeper.png',
      rewards: { pp: 30, xp: 60, tmShards: 1 }
    },
    {
      id: 'cpu-hard-1',
      name: 'Master Guardian',
      battleName: 'Flame Keeper',
      level: 20,
      powerPoints: 500,
      shieldStrength: 150,
      difficulty: 'hard',
      description: 'A master-level guardian with formidable power',
      image: '/images/Master Guardian - Flame Thrower.png', // Ensure this matches the exact filename
      rewards: { pp: 50, xp: 100, tmShards: 2 }
    },
    {
      id: 'cpu-hard-2',
      name: 'Terra',
      displayName: 'Legendary Protector',
      level: 25,
      powerPoints: 750,
      shieldStrength: 250,
      difficulty: 'hard',
      description: 'A legendary protector with immense strength and wisdom',
      image: '/images/Terra.png',
      rewards: { pp: 75, xp: 150, tmShards: 3 }
    }
  ];

const PracticeModeBattle: React.FC<PracticeModeBattleProps> = ({ onBack }) => {
  const { currentUser } = useAuth();
  const { vault, moves, syncVaultPP } = useBattle();
  const [battleMode, setBattleMode] = useState<'single' | 'multiplayer' | null>(null);
  const [selectedOpponent, setSelectedOpponent] = useState<CPUOpponent | null>(null);
  const [selectedOpponents, setSelectedOpponents] = useState<CPUOpponent[]>([]); // For multiplayer
  const [showBattleEngine, setShowBattleEngine] = useState(false);
  
  // Practice Mode Room System
  const [practiceRooms, setPracticeRooms] = useState<any[]>([]);
  const [currentPracticeRoom, setCurrentPracticeRoom] = useState<any | null>(null);
  const [showPracticeWaitingRoom, setShowPracticeWaitingRoom] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [roomParticipants, setRoomParticipants] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [userLevel, setUserLevel] = useState(1);
  const [showRoomList, setShowRoomList] = useState(false);
  const [battleHistory, setBattleHistory] = useState<any[]>([]);
  const [defeatedOpponents, setDefeatedOpponents] = useState<{ [opponentId: string]: boolean }>({});
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [battleResults, setBattleResults] = useState<{
    result: 'victory' | 'defeat' | 'escape';
    opponent: CPUOpponent;
    rewards: { pp: number; xp: number; tmShards?: number; originalPP?: number };
    alreadyCollected?: boolean;
  } | null>(null);
  const [showMasterGuardianIntro, setShowMasterGuardianIntro] = useState(false);
  const [showMasterGuardianDialogue, setShowMasterGuardianDialogue] = useState(false);
  const [showMasterGuardianDialogue2, setShowMasterGuardianDialogue2] = useState(false);
  const [showMasterGuardianDialogue3, setShowMasterGuardianDialogue3] = useState(false);
  const [showTerraIntro, setShowTerraIntro] = useState(false);
  const [showTerraDialogue, setShowTerraDialogue] = useState(false);
  const [showTerraDialogue2, setShowTerraDialogue2] = useState(false);
  const [isTerraAwakened, setIsTerraAwakened] = useState(false);
  const [showTerraAwakenedCutscene, setShowTerraAwakenedCutscene] = useState(false);
  const [showTerraAwakenedDialogue, setShowTerraAwakenedDialogue] = useState(false);
  const [showTerraAwakenedFinalImage, setShowTerraAwakenedFinalImage] = useState(false);
  const [showDeepForestEmergence, setShowDeepForestEmergence] = useState(false);
  const [showGaiaDialogue, setShowGaiaDialogue] = useState(false);
  const [isForestStageActive, setIsForestStageActive] = useState(false);
  
  // Ref for battle container to enable auto-scroll
  const battleContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to battle when it starts
  useEffect(() => {
    if (showBattleEngine && battleContainerRef.current) {
      // Small delay to ensure DOM is updated
      setTimeout(() => {
        battleContainerRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }, 100);
    }
  }, [showBattleEngine]);

  // Fetch user level
  useEffect(() => {
    const fetchUserLevel = async () => {
      if (!currentUser) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'students', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const calculatedLevel = getLevelFromXP(userData.xp || 0);
          setUserLevel(calculatedLevel);
        }
      } catch (error) {
        console.error('Error fetching user level:', error);
      }
    };

    fetchUserLevel();
  }, [currentUser]);

  // Load defeated opponents data on mount
  useEffect(() => {
    const loadDefeatedOpponents = async () => {
      if (!currentUser) return;
      
      try {
        const userRef = doc(db, 'students', currentUser.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          // Load practice mode rewards collection status
          const practiceRewards = userData.practiceModeRewards || {};
          const defeated: { [opponentId: string]: boolean } = {};
          
          // Check which opponents have had rewards collected
          cpuOpponents.forEach(opponent => {
            defeated[opponent.id] = practiceRewards[opponent.id]?.collected === true;
          });
          
          setDefeatedOpponents(defeated);
          console.log('Practice Mode: Loaded defeated opponents:', defeated);
        }
      } catch (error) {
        console.error('Error loading defeated opponents:', error);
      }
    };
    
    loadDefeatedOpponents();
  }, [currentUser]);

  // Check if an opponent is unlocked (previous opponent must be defeated)
  const isOpponentUnlocked = (opponent: CPUOpponent): boolean => {
    // First opponent is always unlocked
    if (opponent.id === 'cpu-easy-1') {
      return true;
    }
    
    // Find the index of this opponent
    const currentIndex = cpuOpponents.findIndex(o => o.id === opponent.id);
    if (currentIndex === -1 || currentIndex === 0) {
      return currentIndex === 0; // First opponent is always unlocked
    }
    
    // Check if the previous opponent has been defeated
    const previousOpponent = cpuOpponents[currentIndex - 1];
    return defeatedOpponents[previousOpponent.id] === true;
  };

  const handleOpponentSelect = async (opponent: CPUOpponent) => {
    // Don't allow selection of locked opponents
    if (!isOpponentUnlocked(opponent)) {
      return;
    }
    
    // Reset vault health to max if PP >= max health when starting a new battle
    await syncVaultPP();
    
    setSelectedOpponent(opponent);
    
    // In multiplayer mode, create or show room list
    if (battleMode === 'multiplayer') {
      setShowRoomList(true);
      return;
    }
    
    // Single player mode - show intro modal for Master Guardian or Terra
    if (opponent.name === 'Master Guardian') {
      setShowMasterGuardianIntro(true);
    } else if (opponent.name === 'Terra') {
      setShowTerraIntro(true);
    } else {
      setShowBattleEngine(true);
    }
  };

  // Create a practice room
  const createPracticeRoom = async (opponent: CPUOpponent) => {
    if (!currentUser || !vault) return;

    setLoading(true);
    try {
      const roomData = {
        hostId: currentUser.uid,
        hostName: currentUser.displayName || currentUser.email || 'Anonymous',
        hostLevel: userLevel,
        status: 'waiting',
        createdAt: serverTimestamp(),
        participants: [currentUser.uid],
        maxParticipants: 4,
        hostPhotoURL: currentUser.photoURL || null,
        selectedOpponentId: opponent.id,
        selectedOpponentName: opponent.name
      };

      const docRef = await addDoc(collection(db, 'practiceRooms'), roomData);
      
      // Get the created room
      const roomDoc = await getDoc(docRef);
      if (roomDoc.exists()) {
        const room = { id: docRef.id, ...roomDoc.data() };
        setCurrentPracticeRoom(room);
        setShowRoomList(false);
        setShowPracticeWaitingRoom(true);
      }
    } catch (error) {
      console.error('Error creating practice room:', error);
      alert('Failed to create battle room. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Join a practice room
  const joinPracticeRoom = async (roomId: string) => {
    if (!currentUser || !vault) return;

    setLoading(true);
    try {
      const roomRef = doc(db, 'practiceRooms', roomId);
      const roomDoc = await getDoc(roomRef);
      
      if (!roomDoc.exists()) {
        alert('Battle room not found.');
        return;
      }

      const room = roomDoc.data();
      
      if (room.participants.includes(currentUser.uid)) {
        // User is already in room
        setCurrentPracticeRoom({ id: roomId, ...room });
        setShowRoomList(false);
        setShowPracticeWaitingRoom(true);
        setLoading(false);
        return;
      }

      if (room.participants.length >= room.maxParticipants) {
        alert('This battle room is full.');
        setLoading(false);
        return;
      }

      // Add user to room
      const updatedParticipants = [...room.participants, currentUser.uid];
      
      await updateDoc(roomRef, {
        participants: updatedParticipants
      });

      // Set current room
      const updatedRoom = { 
        id: roomId, 
        ...room, 
        participants: updatedParticipants
      };
      setCurrentPracticeRoom(updatedRoom);
      setShowRoomList(false);
      setShowPracticeWaitingRoom(true);
    } catch (error: any) {
      console.error('Error joining practice room:', error);
      let errorMessage = 'Failed to join battle room. Please try again.';
      
      if (error.code === 'permission-denied') {
        errorMessage = 'Permission denied. Please check your account status.';
      } else if (error.code === 'unavailable') {
        errorMessage = 'Service unavailable. Please try again in a moment.';
      } else if (error.message) {
        errorMessage = `Error: ${error.message}`;
      }
      
      alert(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Leave practice room
  const leavePracticeRoom = async () => {
    if (!currentPracticeRoom || !currentUser) return;

    try {
      const roomRef = doc(db, 'practiceRooms', currentPracticeRoom.id);
      const roomDoc = await getDoc(roomRef);
      
      if (roomDoc.exists()) {
        const room = roomDoc.data();
        const updatedParticipants = room.participants.filter((id: string) => id !== currentUser.uid);
        
        if (updatedParticipants.length === 0) {
          // Delete room if no participants left
          await deleteDoc(roomRef);
        } else {
          // Update room with remaining participants
          await updateDoc(roomRef, {
            participants: updatedParticipants,
            // If host left, assign new host
            hostId: updatedParticipants[0]
          });
        }
      }
    } catch (error) {
      console.error('Error leaving practice room:', error);
    } finally {
      setCurrentPracticeRoom(null);
      setShowPracticeWaitingRoom(false);
      setRoomParticipants([]);
    }
  };

  // Start battle from waiting room
  const startPracticeBattle = async () => {
    if (!currentPracticeRoom || !currentUser) return;

    try {
      const roomRef = doc(db, 'practiceRooms', currentPracticeRoom.id);
      await updateDoc(roomRef, {
        status: 'in-progress'
      });

      // Find the selected opponent
      const opponent = cpuOpponents.find(o => o.id === currentPracticeRoom.selectedOpponentId);
      if (opponent) {
        setSelectedOpponent(opponent);
        setShowPracticeWaitingRoom(false);
        
        // In multiplayer mode, we need to fetch participant data to pass as allies
        // For now, skip intro modals in multiplayer (they can be added later if needed)
        if (battleMode === 'multiplayer') {
          setShowBattleEngine(true);
        } else {
          // Show intro modal for Master Guardian or Terra (single player only)
          if (opponent.name === 'Master Guardian') {
            setShowMasterGuardianIntro(true);
          } else if (opponent.name === 'Terra') {
            setShowTerraIntro(true);
          } else {
            setShowBattleEngine(true);
          }
        }
      }
    } catch (error) {
      console.error('Error starting practice battle:', error);
      alert('Failed to start battle. Please try again.');
    }
  };

  // Handle participants update from waiting room
  const handleParticipantsUpdate = async (participants: any[]) => {
    // Fetch vault data for each participant to get accurate stats
    const participantsWithVaultData = await Promise.all(
      participants.map(async (p) => {
        try {
          const vaultDoc = await getDoc(doc(db, 'vaults', p.id));
          const vaultData = vaultDoc.exists() ? vaultDoc.data() : null;
          return {
            ...p,
            currentPP: vaultData?.currentPP || 0,
            maxPP: vaultData?.capacity || 1000,
            shieldStrength: vaultData?.shieldStrength || 0,
            maxShieldStrength: vaultData?.maxShieldStrength || 100,
            vaultHealth: vaultData?.currentPP || 0,
            maxVaultHealth: vaultData?.capacity || 1000
          };
        } catch (error) {
          console.error(`Error fetching vault data for participant ${p.id}:`, error);
          return {
            ...p,
            currentPP: 0,
            maxPP: 1000,
            shieldStrength: 0,
            maxShieldStrength: 100,
            vaultHealth: 0,
            maxVaultHealth: 1000
          };
        }
      })
    );
    setRoomParticipants(participantsWithVaultData);
  };

  // Fetch available practice rooms
  useEffect(() => {
    if (!currentUser || battleMode !== 'multiplayer' || !showRoomList) return;

    const roomsQuery = query(
      collection(db, 'practiceRooms'),
      where('status', '==', 'waiting')
    );

    const unsubscribe = onSnapshot(roomsQuery, (snapshot) => {
      const rooms = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPracticeRooms(rooms);
    });

    return () => unsubscribe();
  }, [currentUser, battleMode, showRoomList]);

  const handleMasterGuardianIntroComplete = async () => {
    // Reset vault health to max if PP >= max health when starting a new battle
    await syncVaultPP();
    
    setShowMasterGuardianIntro(false);
    setShowMasterGuardianDialogue(false);
    setShowMasterGuardianDialogue2(false);
    setShowMasterGuardianDialogue3(false);
    setShowBattleEngine(true);
  };

  const handleTerraIntroComplete = async () => {
    // Reset vault health to max if PP >= max health when starting a new battle
    await syncVaultPP();
    
    setShowTerraIntro(false);
    setShowTerraDialogue(false);
    setShowTerraDialogue2(false);
    setShowBattleEngine(true);
  };

  const handleTerraFirstDialogueClick = () => {
    setShowTerraDialogue(false);
    setShowTerraDialogue2(true);
  };

  const handleTerraAwakened = () => {
    setShowTerraAwakenedCutscene(true);
    setShowTerraAwakenedFinalImage(true); // Skip animation, go directly to full-body image
    setShowBattleEngine(false); // Pause battle during cut-scene
  };

  const handleTerraAwakenedCutsceneComplete = () => {
    setShowTerraAwakenedCutscene(false);
    setShowTerraAwakenedDialogue(false);
    setShowTerraAwakenedFinalImage(false);
    setShowDeepForestEmergence(false);
    setShowGaiaDialogue(false);
    setIsTerraAwakened(true);
    setIsForestStageActive(true); // Activate forest stage
    setShowBattleEngine(true); // Resume battle
  };

  const handleTerraAwakenedDialogueClick = () => {
    // Skip dialogue phase - go directly to final image
    setShowTerraAwakenedDialogue(false);
    setShowTerraAwakenedFinalImage(true);
  };

  const handleTerraAwakenedFinalImageClick = () => {
    setShowTerraAwakenedFinalImage(false);
    setShowDeepForestEmergence(true);
  };

  const handleGaiaDialogueClick = () => {
    setShowGaiaDialogue(false);
    handleTerraAwakenedCutsceneComplete(); // Complete cut-scene and activate forest stage
  };

  const handleFirstDialogueClick = () => {
    setShowMasterGuardianDialogue(false);
    setShowMasterGuardianDialogue2(true);
  };

  const handleSecondDialogueClick = () => {
    setShowMasterGuardianDialogue2(false);
    setShowMasterGuardianDialogue3(true);
  };

  const handleBattleEnd = async (result: 'victory' | 'defeat' | 'escape') => {
    setShowBattleEngine(false);
    
    if (selectedOpponent) {
      try {
        // Record battle result
        await addDoc(collection(db, 'practiceBattles'), {
          userId: currentUser?.uid,
          opponentId: selectedOpponent.id,
          opponentName: selectedOpponent.name,
          result: result,
          rewards: result === 'victory' ? selectedOpponent.rewards : { pp: 0, xp: 0 },
          timestamp: serverTimestamp()
        });

        if (result === 'victory') {
          console.log('Practice Mode Victory:', {
            opponent: selectedOpponent.name,
            rewards: selectedOpponent.rewards,
            currentUser: currentUser?.uid
          });
          
          // Check if rewards have already been collected - fetch fresh data to be sure
          if (currentUser) {
            const userRef = doc(db, 'students', currentUser.uid);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists()) {
              const userData = userDoc.data();
              
              // Check if rewards have already been collected (check fresh from DB)
              const existingPracticeRewards = userData.practiceModeRewards || {};
              const rewardsAlreadyCollected = existingPracticeRewards[selectedOpponent.id]?.collected === true;
              
              // Award rewards only if not already collected
              if (!rewardsAlreadyCollected) {
                const currentPP = userData.powerPoints || 0;
                const currentXP = userData.xp || 0;
                const currentTruthMetal = userData.truthMetal || 0;
                
                // Apply PP boost if active
                let finalPP = selectedOpponent.rewards.pp;
                try {
                  const activeBoost = await getActivePPBoost(currentUser.uid);
                  if (activeBoost) {
                    finalPP = applyPPBoost(selectedOpponent.rewards.pp, currentUser.uid, activeBoost);
                    console.log(`⚡ PP Boost applied to practice mode reward: ${selectedOpponent.rewards.pp} → ${finalPP}`);
                  }
                } catch (error) {
                  console.error('Error applying PP boost to practice mode reward:', error);
                }
                
                const newPP = currentPP + finalPP;
                const newXP = currentXP + selectedOpponent.rewards.xp;
                const tmShardsReward = selectedOpponent.rewards.tmShards || 0;
                const newTruthMetal = currentTruthMetal + tmShardsReward;
                
                console.log('[PracticeMode] Updating user stats:', {
                  currentPP,
                  currentXP,
                  currentTruthMetal,
                  rewardPP: selectedOpponent.rewards.pp,
                  rewardXP: selectedOpponent.rewards.xp,
                  rewardTMShards: tmShardsReward,
                  newPP,
                  newXP,
                  newTruthMetal
                });
                
                // Mark this opponent's rewards as collected
                const updatedPracticeRewards = {
                  ...existingPracticeRewards,
                  [selectedOpponent.id]: {
                    collected: true,
                    collectedAt: serverTimestamp(),
                    rewards: selectedOpponent.rewards
                  }
                };
                
                // Update Firestore with new stats and practice rewards
                const updateData: any = {
                  powerPoints: newPP,
                  xp: newXP,
                  practiceModeRewards: updatedPracticeRewards,
                  lastUpdated: serverTimestamp()
                };
                
                // Only update truthMetal if there are shards to add
                if (tmShardsReward > 0) {
                  updateData.truthMetal = newTruthMetal;
                }
                
                await updateDoc(userRef, updateData);
                
                // Verify the update was successful
                const verifyDoc = await getDoc(userRef);
                if (verifyDoc.exists()) {
                  const verifyData = verifyDoc.data();
                  console.log('[PracticeMode] ✅ Verification - PP in DB:', verifyData.powerPoints, '(expected:', newPP, ')');
                  console.log('[PracticeMode] ✅ Verification - XP in DB:', verifyData.xp, '(expected:', newXP, ')');
                  
                  if (verifyData.powerPoints === newPP && verifyData.xp === newXP) {
                    console.log('[PracticeMode] ✅ Stats successfully updated in Firestore!');
                  } else {
                    console.error('[PracticeMode] ❌ Stats mismatch! Expected PP:', newPP, 'Got:', verifyData.powerPoints);
                    console.error('[PracticeMode] ❌ Stats mismatch! Expected XP:', newXP, 'Got:', verifyData.xp);
                  }
                }
                
                // Update local state
                setDefeatedOpponents(prev => ({
                  ...prev,
                  [selectedOpponent.id]: true
                }));
                
                // Sync vault PP to ensure UI updates immediately
                try {
                  await syncVaultPP();
                  console.log('[PracticeMode] Synced vault PP after rewards');
                } catch (error) {
                  console.error('[PracticeMode] Error syncing vault PP:', error);
                }
                
                // Show results modal instead of alert
                setBattleResults({
                  result: 'victory',
                  opponent: selectedOpponent,
                  rewards: {
                    pp: finalPP,
                    xp: selectedOpponent.rewards.xp,
                    tmShards: tmShardsReward,
                    originalPP: selectedOpponent.rewards.pp
                  },
                  alreadyCollected: false
                });
                setShowResultsModal(true);
              } else {
                // Rewards already collected, but still check for PP boost to show in modal
                console.log('[PracticeMode] Rewards already collected for', selectedOpponent.name);
                
                // Check if PP boost is active to show in results modal
                const originalPP = selectedOpponent.rewards.pp;
                let finalPP = originalPP;
                try {
                  const activeBoost = await getActivePPBoost(currentUser.uid);
                  if (activeBoost) {
                    finalPP = applyPPBoost(originalPP, currentUser.uid, activeBoost);
                    console.log(`⚡ PP Boost active (already collected): ${originalPP} → ${finalPP}`);
                  }
                } catch (error) {
                  console.error('Error checking PP boost for already collected rewards:', error);
                }
                
                setBattleResults({
                  result: 'victory',
                  opponent: selectedOpponent,
                  rewards: {
                    pp: finalPP,
                    xp: selectedOpponent.rewards.xp,
                    tmShards: selectedOpponent.rewards.tmShards || 0,
                    originalPP: originalPP !== finalPP ? originalPP : undefined
                  },
                  alreadyCollected: true
                });
                setShowResultsModal(true);
              }
            } else {
              console.error('[PracticeMode] ❌ User document not found');
              setBattleResults({
                result: 'victory',
                opponent: selectedOpponent,
                rewards: {
                  pp: selectedOpponent.rewards.pp,
                  xp: selectedOpponent.rewards.xp
                }
              });
              setShowResultsModal(true);
            }
          } else {
            setBattleResults({
              result: 'victory',
              opponent: selectedOpponent,
              rewards: {
                pp: selectedOpponent.rewards.pp,
                xp: selectedOpponent.rewards.xp
              }
            });
            setShowResultsModal(true);
          }
        } else if (result === 'defeat') {
          setBattleResults({
            result: 'defeat',
            opponent: selectedOpponent,
            rewards: {
              pp: 0,
              xp: 0
            }
          });
          setShowResultsModal(true);
        } else {
          setBattleResults({
            result: 'escape',
            opponent: selectedOpponent,
            rewards: {
              pp: 0,
              xp: 0
            }
          });
          setShowResultsModal(true);
        }
      } catch (error) {
        console.error('Error recording battle result:', error);
        alert('Failed to record battle result. Please try again.');
      }
    }
    
    setSelectedOpponent(null);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      case 'medium': return 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
      case 'hard': return 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
      default: return 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
    }
  };

  const getDifficultyIcon = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return '🟢';
      case 'medium': return '🟡';
      case 'hard': return '🔴';
      default: return '⚪';
    }
  };

  if (showBattleEngine && selectedOpponent) {
    return (
      <div ref={battleContainerRef}>
        <div style={{
          background: getDifficultyColor(selectedOpponent.difficulty),
          color: 'white',
          padding: '1rem',
          borderRadius: '0.75rem',
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>🤖 Practice Battle</h3>
            <p style={{ margin: '0.25rem 0 0 0', opacity: 0.9 }}>
              Opponent: {selectedOpponent.name} (Lv. {selectedOpponent.level}) • {selectedOpponent.difficulty.toUpperCase()}
            </p>
          </div>
          <button
            onClick={() => {
              setShowBattleEngine(false);
              setSelectedOpponent(null);
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Cancel Battle
          </button>
        </div>
        
        <BattleEngine 
          onBattleEnd={handleBattleEnd}
          opponent={battleMode === 'multiplayer' ? undefined : {
            id: selectedOpponent.id,
            name: selectedOpponent.battleName || selectedOpponent.name,
            currentPP: selectedOpponent.powerPoints,
            maxPP: selectedOpponent.powerPoints,
            shieldStrength: selectedOpponent.shieldStrength,
            maxShieldStrength: selectedOpponent.shieldStrength,
            level: selectedOpponent.level
          }}
          opponents={battleMode === 'multiplayer' ? [{
            id: selectedOpponent.id,
            name: selectedOpponent.battleName || selectedOpponent.name,
            currentPP: selectedOpponent.powerPoints,
            maxPP: selectedOpponent.powerPoints,
            shieldStrength: selectedOpponent.shieldStrength,
            maxShieldStrength: selectedOpponent.shieldStrength,
            level: selectedOpponent.level
          }] : undefined}
          allies={battleMode === 'multiplayer' && roomParticipants.length > 0 ? roomParticipants.map(p => ({
            id: p.id,
            name: p.name,
            currentPP: p.currentPP || 0,
            maxPP: p.maxPP || 1000,
            shieldStrength: p.shieldStrength || 0,
            maxShieldStrength: p.maxShieldStrength || 100,
            level: p.level,
            photoURL: p.photoURL,
            isPlayer: p.id === currentUser?.uid,
            vaultHealth: p.vaultHealth,
            maxVaultHealth: p.maxVaultHealth
          })) : undefined}
          isMultiplayer={battleMode === 'multiplayer'}
          onTerraAwakened={selectedOpponent.name === 'Terra' ? handleTerraAwakened : undefined}
          isTerraAwakened={isTerraAwakened}
          isForestStageActive={isForestStageActive}
        />
      </div>
    );
  }

  return (
    <>
      {/* CSS for Master Guardian fiery aura animation and Terra green glow animation */}
      <style>{`
        @keyframes flicker {
          0%, 100% {
            opacity: 0.8;
            transform: scale(1);
          }
          25% {
            opacity: 1;
            transform: scale(1.05);
          }
          50% {
            opacity: 0.9;
            transform: scale(0.98);
          }
          75% {
            opacity: 1;
            transform: scale(1.02);
          }
        }
        @keyframes glow {
          0%, 100% {
            opacity: 0.8;
            transform: scale(1);
          }
          25% {
            opacity: 1;
            transform: scale(1.05);
          }
          50% {
            opacity: 0.9;
            transform: scale(0.98);
          }
          75% {
            opacity: 1;
            transform: scale(1.02);
          }
        }
      `}</style>
      <div style={{ padding: '2rem' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div>
          <h2 style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>
            🤖 Practice Mode
          </h2>
          <p style={{ color: '#6b7280', fontSize: '1rem' }}>
            Battle against AI opponents to practice your strategies and earn rewards
          </p>
        </div>
        <button
          onClick={onBack}
          style={{
            background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500'
          }}
        >
          ← Back to Modes
        </button>
      </div>

      {/* Practice Mode Info */}
      <div style={{
        background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        color: 'white',
        padding: '1.5rem',
        borderRadius: '0.75rem',
        marginBottom: '2rem',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎯</div>
        <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
          Perfect Your Battle Skills
        </h3>
        <p style={{ fontSize: '1rem', opacity: 0.9, margin: 0 }}>
          Practice against AI opponents of varying difficulty levels. No move limits, just pure strategy!
        </p>
      </div>

      {/* Battle Mode Selection */}
      {!battleMode && (
        <BattleModeSelector
          onModeSelect={(mode) => setBattleMode(mode)}
          selectedMode={battleMode}
          multiplayerDescription="Up to 4 Players vs CPU"
        />
      )}

      {battleMode && !showBattleEngine && (
        <div style={{
          background: '#f3f4f6',
          padding: '1rem',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <span style={{ fontWeight: 'bold' }}>Mode: </span>
            <span>{battleMode === 'single' ? 'Single Player' : 'Multiplayer'}</span>
          </div>
          <button
            onClick={() => {
              setBattleMode(null);
              setSelectedOpponent(null);
              setSelectedOpponents([]);
            }}
            style={{
              background: '#6b7280',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Change Mode
          </button>
        </div>
      )}

      {/* CPU Opponents */}
      <div>
        <h3 style={{
          fontSize: '1.5rem',
          fontWeight: 'bold',
          marginBottom: '1rem',
          color: '#374151'
        }}>
          Available Opponents
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
          gap: '1.5rem'
        }}>
          {cpuOpponents.map((opponent) => {
            const isUnlocked = isOpponentUnlocked(opponent);
            const isDefeated = defeatedOpponents[opponent.id] === true;
            
            return (
            <div
              key={opponent.id}
              style={{
                background: isUnlocked ? 'white' : '#f3f4f6',
                border: `2px solid ${isUnlocked ? '#e5e7eb' : '#d1d5db'}`,
                borderRadius: '0.75rem',
                padding: '1.5rem',
                cursor: isUnlocked ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease',
                position: 'relative',
                opacity: isUnlocked ? 1 : 0.6,
                overflow: 'hidden' // Ensure the aura doesn't overflow
              }}
              onClick={() => handleOpponentSelect(opponent)}
              onMouseEnter={(e) => {
                if (isUnlocked) {
                  if (opponent.name === 'Master Guardian') {
                    e.currentTarget.style.borderColor = '#ef4444';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(239, 68, 68, 0.4), 0 0 40px rgba(251, 146, 60, 0.3)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    // Show the aura and start animation
                    const aura = e.currentTarget.querySelector('.master-guardian-aura') as HTMLElement;
                    if (aura) {
                      aura.style.opacity = '1';
                      aura.style.animation = 'flicker 1.5s ease-in-out infinite';
                    }
                  } else if (opponent.name === 'Terra') {
                    e.currentTarget.style.borderColor = '#10b981';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(16, 185, 129, 0.4), 0 0 40px rgba(34, 197, 94, 0.3)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    // Show the green aura and start animation
                    const aura = e.currentTarget.querySelector('.terra-aura') as HTMLElement;
                    if (aura) {
                      aura.style.opacity = '1';
                      aura.style.animation = 'glow 1.5s ease-in-out infinite';
                    }
                  } else {
                    e.currentTarget.style.borderColor = '#8b5cf6';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.15)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = isUnlocked ? '#e5e7eb' : '#d1d5db';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'translateY(0)';
                // Hide the auras and stop animation
                const masterAura = e.currentTarget.querySelector('.master-guardian-aura') as HTMLElement;
                if (masterAura) {
                  masterAura.style.opacity = '0';
                  masterAura.style.animation = 'none';
                }
                const terraAura = e.currentTarget.querySelector('.terra-aura') as HTMLElement;
                if (terraAura) {
                  terraAura.style.opacity = '0';
                  terraAura.style.animation = 'none';
                }
              }}
            >
              {/* Fiery Aura Effect for Master Guardian on Hover */}
              {opponent.name === 'Master Guardian' && isUnlocked && (
                <div
                  className="master-guardian-aura"
                  style={{
                    position: 'absolute',
                    top: '-50%',
                    left: '-50%',
                    width: '200%',
                    height: '200%',
                    background: 'radial-gradient(circle, rgba(251, 146, 60, 0.4) 0%, rgba(239, 68, 68, 0.3) 25%, rgba(220, 38, 38, 0.2) 40%, rgba(185, 28, 28, 0.1) 55%, transparent 70%)',
                    borderRadius: '50%',
                    pointerEvents: 'none',
                    zIndex: 0,
                    opacity: 0,
                    transition: 'opacity 0.3s ease',
                    filter: 'blur(20px)',
                    transform: 'scale(1)',
                    animation: 'none' // Animation will be applied on hover
                  }}
                />
              )}
              {/* Green Aura Effect for Terra (Legendary Protector) on Hover */}
              {opponent.name === 'Terra' && isUnlocked && (
                <div
                  className="terra-aura"
                  style={{
                    position: 'absolute',
                    top: '-50%',
                    left: '-50%',
                    width: '200%',
                    height: '200%',
                    background: 'radial-gradient(circle, rgba(34, 197, 94, 0.4) 0%, rgba(16, 185, 129, 0.3) 25%, rgba(5, 150, 105, 0.2) 40%, rgba(4, 120, 87, 0.1) 55%, transparent 70%)',
                    borderRadius: '50%',
                    pointerEvents: 'none',
                    zIndex: 0,
                    opacity: 0,
                    transition: 'opacity 0.3s ease',
                    filter: 'blur(20px)',
                    transform: 'scale(1)',
                    animation: 'none' // Animation will be applied on hover
                  }}
                />
              )}
              {/* Difficulty Badge */}
              <div style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: getDifficultyColor(opponent.difficulty),
                color: 'white',
                padding: '0.25rem 0.75rem',
                borderRadius: '1rem',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                {getDifficultyIcon(opponent.difficulty)} {opponent.difficulty.toUpperCase()}
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                marginBottom: '1rem'
              }}>
                {opponent.image ? (
                  <div style={{ position: 'relative', width: '60px', height: '60px' }}>
                    <img
                      key={opponent.id} // Force re-render when opponent changes
                      src={opponent.image}
                      alt={opponent.name}
                      style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        objectPosition: opponent.name === 'Novice Guard' ? '50% -30%' : 
                                        opponent.name === 'Elite Soldier' ? '50% -30%' : 
                                        opponent.name === 'Vault Keeper' ? '50% 0%' :
                                        opponent.name === 'Master Guardian' ? '50% -30%' :
                                        opponent.name === 'Terra' ? '50% -30%' : '50% 50%', // Show upper half for Novice Guard, Elite Soldier, Vault Keeper, Master Guardian, and Terra
                        border: `3px solid ${opponent.difficulty === 'easy' ? '#10b981' : opponent.difficulty === 'medium' ? '#f59e0b' : '#ef4444'}`,
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
                        display: 'block',
                        opacity: !isUnlocked ? 0.3 : 1 // Dim the image when locked
                      }}
                      onError={(e) => {
                        // Fallback to emoji if image fails to load (except for Master Guardian)
                        console.error('Image failed to load:', opponent.image, 'for opponent:', opponent.name);
                        if (opponent.name === 'Master Guardian') {
                          // Don't show fallback for Master Guardian - keep trying to load the image
                          console.warn('Master Guardian image failed to load, but not showing fallback');
                          return;
                        }
                        const target = e.currentTarget;
                        target.style.display = 'none';
                        const fallback = target.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                      onLoad={() => {
                        console.log('Image loaded successfully:', opponent.image, 'for opponent:', opponent.name);
                      }}
                    />
                    {/* Lock overlay for locked opponents - positioned over the image */}
                    {!isUnlocked && (
                      <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: 'rgba(107, 114, 128, 0.95)',
                        color: 'white',
                        padding: '0.5rem',
                        borderRadius: '50%',
                        fontSize: '1.5rem',
                        zIndex: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '50px',
                        height: '50px',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                        border: '3px solid rgba(255, 255, 255, 0.3)'
                      }}>
                        🔒
                      </div>
                    )}
                  </div>
                ) : null}
                <div style={{
                  position: 'relative',
                  width: '60px',
                  height: '60px',
                  background: getDifficultyColor(opponent.difficulty),
                  borderRadius: '50%',
                  display: (opponent.image || opponent.name === 'Master Guardian') ? 'none' : 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  color: 'white',
                  fontWeight: 'bold',
                  opacity: !isUnlocked ? 0.3 : 1 // Dim the fallback when locked
                }}>
                  🤖
                  {/* Lock overlay for locked opponents without images */}
                  {!isUnlocked && (
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      background: 'rgba(107, 114, 128, 0.95)',
                      color: 'white',
                      padding: '0.5rem',
                      borderRadius: '50%',
                      fontSize: '1.5rem',
                      zIndex: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '50px',
                      height: '50px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                      border: '3px solid rgba(255, 255, 255, 0.3)'
                    }}>
                      🔒
                    </div>
                  )}
                </div>
                <div>
                  <h4 style={{
                    fontSize: '1.125rem',
                    fontWeight: 'bold',
                    margin: 0,
                    color: isUnlocked ? '#374151' : '#9ca3af'
                  }}>
                    {opponent.displayName || opponent.name}
                    {!isUnlocked && (
                      <span style={{
                        fontSize: '0.875rem',
                        color: '#6b7280',
                        marginLeft: '0.5rem',
                        fontWeight: 'normal'
                      }}>
                        (Locked)
                      </span>
                    )}
                  </h4>
                  <p style={{
                    fontSize: '0.875rem',
                    color: isUnlocked ? '#6b7280' : '#9ca3af',
                    margin: 0
                  }}>
                    Level {opponent.level}
                  </p>
                </div>
              </div>

              <p style={{
                fontSize: '0.875rem',
                color: isUnlocked ? '#6b7280' : '#9ca3af',
                marginBottom: '1rem',
                lineHeight: '1.5'
              }}>
                {isUnlocked ? opponent.description : 'Defeat the previous opponent to unlock this battle'}
              </p>

              <div style={{
                background: '#f9fafb',
                padding: '1rem',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
                opacity: isUnlocked ? 1 : 0.6
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Power Points</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#374151' }}>
                    {opponent.powerPoints}
                  </span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Shield Strength</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#374151' }}>
                    {opponent.shieldStrength}
                  </span>
                </div>
                <div style={{
                  width: '100%',
                  height: '8px',
                  background: '#e5e7eb',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${Math.min(100, (opponent.powerPoints / 1000) * 100)}%`,
                    height: '100%',
                    background: getDifficultyColor(opponent.difficulty),
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>

              <div style={{
                background: !isUnlocked
                  ? 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)'
                  : defeatedOpponents[opponent.id] 
                  ? 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)'
                  : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                textAlign: 'center',
                fontSize: '0.875rem',
                fontWeight: '500',
                marginBottom: '0.5rem',
                position: 'relative',
                cursor: isUnlocked ? 'pointer' : 'not-allowed'
              }}>
                {!isUnlocked ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem'
                  }}>
                    🔒 Locked - Defeat Previous Opponent
                  </div>
                ) : defeatedOpponents[opponent.id] ? (
                  <div style={{
                    position: 'absolute',
                    top: '0.25rem',
                    right: '0.25rem',
                    background: 'rgba(255, 255, 255, 0.9)',
                    color: '#059669',
                    padding: '0.125rem 0.5rem',
                    borderRadius: '0.25rem',
                    fontSize: '0.7rem',
                    fontWeight: 'bold',
                    textTransform: 'uppercase'
                  }}>
                    ✓ Collected
                  </div>
                ) : null}
                {isUnlocked && (
                  <span style={{ whiteSpace: 'nowrap' }}>
                    💰 Rewards: +{opponent.rewards.pp} PP, +{opponent.rewards.xp} XP{opponent.rewards.tmShards && opponent.rewards.tmShards > 0 && `, +${opponent.rewards.tmShards} Truth Metal Shards`}
                  </span>
                )}
              </div>

              <div style={{
                background: getDifficultyColor(opponent.difficulty),
                color: 'white',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                textAlign: 'center',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                🎯 Click to Battle
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {/* Battle Results Modal */}
      {showResultsModal && battleResults && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '2rem'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '800px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
            position: 'relative'
          }}>
            {/* Close button */}
            <button
              onClick={() => {
                setShowResultsModal(false);
                setBattleResults(null);
              }}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                fontSize: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold'
              }}
            >
              ×
            </button>

            <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
              {/* Opponent Info */}
              <div style={{ flex: '0 0 300px' }}>
                {battleResults.opponent.image ? (
                  <img
                    src={battleResults.opponent.image}
                    alt={battleResults.opponent.name}
                    style={{
                      width: '100%',
                      height: 'auto',
                      borderRadius: '0.5rem',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                      objectFit: 'cover',
                      objectPosition: battleResults.opponent.name === 'Elite Soldier' ? '50% 0%' : 
                                      battleResults.opponent.name === 'Novice Guard' ? '50% -30%' :
                                      battleResults.opponent.name === 'Training Dummy' ? '50% -40%' :
                                      battleResults.opponent.name === 'Vault Keeper' ? '50% 0%' :
                                      battleResults.opponent.name === 'Master Guardian' || battleResults.opponent.name === 'Flame Keeper' ? '50% -30%' :
                                      battleResults.opponent.name === 'Terra' ? '50% -30%' : '50% 50%',
                      aspectRatio: '1'
                    }}
                    onError={(e) => {
                      // Fallback to gradient background if image fails to load
                      const target = e.currentTarget;
                      target.style.display = 'none';
                      const fallback = target.nextElementSibling as HTMLElement;
                      if (fallback) fallback.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div style={{
                  width: '100%',
                  aspectRatio: '1',
                  background: getDifficultyColor(battleResults.opponent.difficulty),
                  borderRadius: '0.5rem',
                  display: battleResults.opponent.image ? 'none' : 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '4rem',
                  color: 'white',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                }}>
                  🤖
                </div>
                <div style={{
                  marginTop: '1rem',
                  textAlign: 'center',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  color: '#374151'
                }}>
                  {battleResults.opponent.name}
                </div>
                <div style={{
                  marginTop: '0.5rem',
                  textAlign: 'center',
                  fontSize: '0.875rem',
                  color: '#6b7280'
                }}>
                  Level {battleResults.opponent.level} • {battleResults.opponent.difficulty.charAt(0).toUpperCase() + battleResults.opponent.difficulty.slice(1)} Difficulty
                </div>
              </div>

              {/* Battle Results */}
              <div style={{ flex: 1 }}>
                <h2 style={{
                  fontSize: '2rem',
                  fontWeight: 'bold',
                  marginBottom: '1rem',
                  color: battleResults.result === 'victory' ? '#059669' : battleResults.result === 'defeat' ? '#dc2626' : '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  {battleResults.result === 'victory' ? '🎉 Victory!' : battleResults.result === 'defeat' ? '💀 Defeat' : '🏃 Escaped'}
                </h2>

                {battleResults.result === 'victory' && battleResults.alreadyCollected && (
                  <div style={{
                    background: '#fef3c7',
                    border: '2px solid #fbbf24',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    marginBottom: '1.5rem',
                    color: '#92400e'
                  }}>
                    ⚠️ Rewards already collected for this opponent
                  </div>
                )}

                {/* Opponent Stats */}
                <div style={{
                  background: '#f9fafb',
                  borderRadius: '0.5rem',
                  padding: '1.5rem',
                  marginBottom: '1.5rem'
                }}>
                  <h3 style={{
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    marginBottom: '1rem',
                    color: '#374151'
                  }}>
                    Opponent Stats
                  </h3>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '1rem'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Power Points</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937' }}>
                        {battleResults.opponent.powerPoints}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Shield Strength</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937' }}>
                        {battleResults.opponent.shieldStrength}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Level</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937' }}>
                        {battleResults.opponent.level}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Difficulty</div>
                      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937' }}>
                        {battleResults.opponent.difficulty.toUpperCase()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rewards */}
                {battleResults.result === 'victory' && (
                  <div style={{
                    background: battleResults.alreadyCollected
                      ? 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)'
                      : 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                    borderRadius: '0.5rem',
                    padding: '1.5rem',
                    marginBottom: '1.5rem',
                    border: `2px solid ${battleResults.alreadyCollected ? '#9ca3af' : '#059669'}`
                  }}>
                    <h3 style={{
                      fontSize: '1.25rem',
                      fontWeight: 'bold',
                      marginBottom: '1rem',
                      color: '#1f2937'
                    }}>
                      {battleResults.alreadyCollected ? 'Rewards (Already Collected)' : 'Rewards Earned'}
                    </h3>
                    <div style={{
                      display: 'flex',
                      gap: '1.5rem',
                      flexWrap: 'wrap'
                    }}>
                      <div style={{
                        background: '#fbbf24',
                        color: '#1f2937',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        minWidth: '120px',
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '0.875rem', marginBottom: '0.25rem', opacity: 0.8 }}>Power Points</div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                          {battleResults.rewards.originalPP && battleResults.rewards.originalPP !== battleResults.rewards.pp ? (
                            <>
                              <div style={{ fontSize: '0.875rem', opacity: 0.7, textDecoration: 'line-through' }}>
                                {battleResults.rewards.originalPP}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                <span>+{battleResults.rewards.pp}</span>
                                <span style={{ fontSize: '1rem', color: '#f59e0b', fontWeight: 'bold' }}>×2</span>
                              </div>
                              <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', color: '#059669', fontWeight: 'bold' }}>
                                ⚡ Double PP Boost!
                              </div>
                            </>
                          ) : (
                            <span>+{battleResults.rewards.pp}</span>
                          )}
                        </div>
                      </div>
                      <div style={{
                        background: '#3b82f6',
                        color: 'white',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        minWidth: '120px',
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '0.875rem', marginBottom: '0.25rem', opacity: 0.9 }}>Experience</div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 'bold' }}>+{battleResults.rewards.xp}</div>
                      </div>
                      {battleResults.rewards.tmShards && battleResults.rewards.tmShards > 0 && (
                        <div style={{
                          background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                          color: 'white',
                          padding: '1rem',
                          borderRadius: '0.5rem',
                          minWidth: '120px',
                          textAlign: 'center'
                        }}>
                          <div style={{ fontSize: '0.875rem', marginBottom: '0.25rem', opacity: 0.9 }}>Truth Metal Shards</div>
                          <div style={{ fontSize: '1.75rem', fontWeight: 'bold' }}>+{battleResults.rewards.tmShards}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {battleResults.result === 'defeat' && (
                  <div style={{
                    background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                    borderRadius: '0.5rem',
                    padding: '1.5rem',
                    marginBottom: '1.5rem',
                    border: '2px solid #dc2626'
                  }}>
                    <p style={{ color: '#991b1b', fontSize: '1rem', margin: 0 }}>
                      {battleResults.opponent.name} was too strong! Try a different strategy or practice against an easier opponent.
                    </p>
                  </div>
                )}

                {battleResults.result === 'escape' && (
                  <div style={{
                    background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                    borderRadius: '0.5rem',
                    padding: '1.5rem',
                    marginBottom: '1.5rem',
                    border: '2px solid #6b7280'
                  }}>
                    <p style={{ color: '#374151', fontSize: '1rem', margin: 0 }}>
                      You escaped from battle. No rewards earned.
                    </p>
                  </div>
                )}

                {/* Close Button */}
                <button
                  onClick={() => {
                    setShowResultsModal(false);
                    setBattleResults(null);
                  }}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: 'white',
                    border: 'none',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    fontSize: '1.125rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Master Guardian Intro Modal */}
      {showMasterGuardianIntro && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: showMasterGuardianDialogue3 
              ? 'radial-gradient(circle at center, #1a0000 0%, #000000 50%, #330000 100%)' 
              : '#000000',
            backgroundImage: showMasterGuardianDialogue3 
              ? 'url("/images/Fire Stage.png"), radial-gradient(circle at center, rgba(255, 69, 0, 0.4) 0%, rgba(139, 0, 0, 0.6) 50%, #000000 100%)'
              : 'none',
            backgroundSize: showMasterGuardianDialogue3 ? 'cover' : 'auto',
            backgroundPosition: showMasterGuardianDialogue3 ? 'center' : 'center',
            backgroundBlendMode: showMasterGuardianDialogue3 ? 'overlay' : 'normal',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            transition: 'background 1s ease, backgroundImage 1s ease'
          }}
          onClick={(e) => {
            // Only allow closing on background click during third dialogue
            if (e.target === e.currentTarget && showMasterGuardianDialogue3) {
              handleMasterGuardianIntroComplete();
            }
          }}
        >
          <style>{`
            @keyframes walkIn {
              0% {
                transform: translateX(-100%) scale(0.8);
                opacity: 0;
              }
              50% {
                opacity: 1;
              }
              100% {
                transform: translateX(0) scale(1);
                opacity: 1;
              }
            }
            @keyframes fadeInUp {
              0% {
                opacity: 0;
                transform: translateY(20px);
              }
              100% {
                opacity: 1;
                transform: translateY(0);
              }
            }
            .master-guardian-intro-image {
              animation: walkIn 2s ease-out forwards;
            }
            .master-guardian-dialogue {
              animation: fadeInUp 0.5s ease-out 2s forwards;
              opacity: 0;
            }
          `}</style>
          {/* First Screen: Walk-in Image */}
          {!showMasterGuardianDialogue2 && !showMasterGuardianDialogue3 && (
            <>
              <img
                src="/images/Master Guardian - Flame Thrower.png"
                alt="Flame Keeper"
                className="master-guardian-intro-image"
                style={{
                  maxWidth: '60%',
                  maxHeight: '60%',
                  objectFit: 'contain',
                  objectPosition: '50% -30%',
                  filter: 'drop-shadow(0 0 30px rgba(251, 146, 60, 0.5))',
                  marginBottom: '2rem'
                }}
                onAnimationEnd={() => {
                  // Show dialogue after walk-in animation completes
                  setTimeout(() => {
                    setShowMasterGuardianDialogue(true);
                  }, 200);
                }}
              />
              {showMasterGuardianDialogue && (
                <div
                  className="master-guardian-dialogue"
                  style={{
                    background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(185, 28, 28, 0.95) 100%)',
                    border: '3px solid rgba(251, 146, 60, 0.8)',
                    borderRadius: '1rem',
                    padding: '1.5rem 2rem',
                    maxWidth: '600px',
                    margin: '0 2rem',
                    boxShadow: '0 8px 32px rgba(251, 146, 60, 0.4), 0 0 40px rgba(239, 68, 68, 0.3)',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                  }}
                  onClick={handleFirstDialogueClick}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)';
                    e.currentTarget.style.boxShadow = '0 12px 40px rgba(251, 146, 60, 0.5), 0 0 50px rgba(239, 68, 68, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 8px 32px rgba(251, 146, 60, 0.4), 0 0 40px rgba(239, 68, 68, 0.3)';
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '2rem',
                    width: 0,
                    height: 0,
                    borderLeft: '15px solid transparent',
                    borderRight: '15px solid transparent',
                    borderBottom: '15px solid rgba(251, 146, 60, 0.8)'
                  }} />
                  <p style={{
                    color: '#ffffff',
                    fontSize: '1.25rem',
                    fontWeight: 'bold',
                    margin: 0,
                    textAlign: 'center',
                    textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)',
                    lineHeight: '1.6'
                  }}>
                    "Finally! I get to do more than just watch this stupid room!"
                  </p>
                  <p style={{
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: '0.875rem',
                    margin: '0.75rem 0 0 0',
                    textAlign: 'center',
                    fontStyle: 'italic'
                  }}>
                    — Flame Keeper
                  </p>
                </div>
              )}
            </>
          )}

          {/* Second Screen: Aggressive Image */}
          {showMasterGuardianDialogue2 && !showMasterGuardianDialogue3 && (
            <>
              <style>{`
                @keyframes fadeIn {
                  0% {
                    opacity: 0;
                  }
                  100% {
                    opacity: 1;
                  }
                }
                .master-guardian-aggressive-image {
                  animation: fadeIn 0.5s ease-out forwards;
                }
                .master-guardian-dialogue-2 {
                  animation: fadeInUp 0.5s ease-out 0.3s forwards;
                  opacity: 0;
                }
              `}</style>
              <img
                src="/images/Flame Thrower Aggressive.png"
                alt="The Flame Thrower Aggressive"
                className="master-guardian-aggressive-image"
                style={{
                  maxWidth: '60%',
                  maxHeight: '60%',
                  objectFit: 'contain',
                  objectPosition: '50% -30%',
                  filter: 'drop-shadow(0 0 30px rgba(251, 146, 60, 0.5))',
                  marginBottom: '2rem'
                }}
              />
              <div
                className="master-guardian-dialogue-2"
                style={{
                  background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.95) 0%, rgba(185, 28, 28, 0.95) 100%)',
                  border: '3px solid rgba(251, 146, 60, 0.8)',
                  borderRadius: '1rem',
                  padding: '1.5rem 2rem',
                  maxWidth: '600px',
                  margin: '0 2rem',
                  boxShadow: '0 8px 32px rgba(251, 146, 60, 0.4), 0 0 40px rgba(239, 68, 68, 0.3)',
                  cursor: 'pointer',
                  position: 'relative'
                }}
                onClick={handleSecondDialogueClick}
              >
                <div style={{
                  position: 'absolute',
                  top: '-10px',
                  left: '2rem',
                  width: 0,
                  height: 0,
                  borderLeft: '15px solid transparent',
                  borderRight: '15px solid transparent',
                  borderBottom: '15px solid rgba(251, 146, 60, 0.8)'
                }} />
                <p style={{
                  color: '#ffffff',
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                  margin: 0,
                  textAlign: 'center',
                  textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)',
                  lineHeight: '1.6'
                }}>
                  "Now I get a chance to prove why I should be in the Top 12!"
                </p>
                <p style={{
                  color: 'rgba(255, 255, 255, 0.8)',
                  fontSize: '0.875rem',
                  margin: '0.75rem 0 0 0',
                  textAlign: 'center',
                  fontStyle: 'italic'
                }}>
                  — The Flame Thrower
                </p>
              </div>
            </>
          )}

          {/* Third Dialogue Screen with Unleash Hell Image */}
          {showMasterGuardianDialogue3 && (
            <>
              <style>{`
                @keyframes fadeIn {
                  0% {
                    opacity: 0;
                  }
                  100% {
                    opacity: 1;
                  }
                }
                @keyframes hellscapeTransition {
                  0% {
                    opacity: 0;
                    filter: brightness(0.5);
                  }
                  100% {
                    opacity: 1;
                    filter: brightness(1);
                  }
                }
                .master-guardian-unleash-image {
                  animation: fadeIn 0.8s ease-out forwards;
                }
                .master-guardian-dialogue-3 {
                  animation: fadeInUp 0.5s ease-out 0.5s forwards;
                  opacity: 0;
                }
              `}</style>
              <img
                src="/images/Flamethrower - Unleash Hell.png"
                alt="The Flame Thrower Unleash Hell"
                className="master-guardian-unleash-image"
                style={{
                  maxWidth: '70%',
                  maxHeight: '70%',
                  objectFit: 'contain',
                  objectPosition: '50% -30%',
                  filter: 'drop-shadow(0 0 40px rgba(255, 69, 0, 0.8)) drop-shadow(0 0 60px rgba(255, 140, 0, 0.6))',
                  marginBottom: '2rem',
                  zIndex: 1
                }}
              />
              <div
                className="master-guardian-dialogue-3"
                style={{
                  background: 'linear-gradient(135deg, rgba(255, 69, 0, 0.95) 0%, rgba(139, 0, 0, 0.95) 100%)',
                  border: '4px solid rgba(255, 140, 0, 0.9)',
                  borderRadius: '1rem',
                  padding: '1.5rem 2rem',
                  maxWidth: '600px',
                  margin: '0 2rem',
                  boxShadow: '0 8px 32px rgba(255, 69, 0, 0.6), 0 0 60px rgba(255, 140, 0, 0.5), inset 0 0 20px rgba(255, 200, 0, 0.3)',
                  cursor: 'pointer',
                  position: 'relative',
                  zIndex: 2
                }}
                onClick={handleMasterGuardianIntroComplete}
              >
                <div style={{
                  position: 'absolute',
                  top: '-10px',
                  left: '2rem',
                  width: 0,
                  height: 0,
                  borderLeft: '15px solid transparent',
                  borderRight: '15px solid transparent',
                  borderBottom: '15px solid rgba(255, 140, 0, 0.9)'
                }} />
                <p style={{
                  color: '#ffffff',
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  margin: 0,
                  textAlign: 'center',
                  textShadow: '2px 2px 6px rgba(0, 0, 0, 0.8), 0 0 10px rgba(255, 200, 0, 0.5)',
                  lineHeight: '1.6'
                }}>
                  "Time to Unleash Hell!"
                </p>
                <p style={{
                  color: 'rgba(255, 255, 255, 0.9)',
                  fontSize: '0.875rem',
                  margin: '0.75rem 0 0 0',
                  textAlign: 'center',
                  fontStyle: 'italic',
                  textShadow: '1px 1px 3px rgba(0, 0, 0, 0.8)'
                }}>
                  — The Flame Thrower
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Terra (Legendary Protector) Intro Modal */}
      {showTerraIntro && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: '#000000',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
          }}
          onClick={(e) => {
            // Allow closing on background click when second dialogue is shown
            if (e.target === e.currentTarget && showTerraDialogue2) {
              handleTerraIntroComplete();
            }
          }}
        >
          <style>{`
            @keyframes approachFromAfar {
              0% {
                transform: scale(0.3) translateY(50%);
                opacity: 0;
                filter: blur(10px);
              }
              50% {
                opacity: 0.7;
                filter: blur(5px);
              }
              100% {
                transform: scale(1) translateY(0);
                opacity: 1;
                filter: blur(0px);
              }
            }
            @keyframes fadeInUp {
              0% {
                opacity: 0;
                transform: translateY(20px);
              }
              100% {
                opacity: 1;
                transform: translateY(0);
              }
            }
            .terra-intro-image {
              animation: approachFromAfar 3s ease-out forwards;
            }
            .terra-dialogue {
              animation: fadeInUp 0.5s ease-out 3s forwards;
              opacity: 0;
            }
          `}</style>
          {/* First Screen: Terra Approaching Image */}
          {!showTerraDialogue && !showTerraDialogue2 && (
            <>
              <img
                src="/images/Terra.png"
                alt="Terra"
                className="terra-intro-image"
                style={{
                  maxWidth: '70%',
                  maxHeight: '70%',
                  objectFit: 'contain',
                  objectPosition: '50% -30%',
                  filter: 'drop-shadow(0 0 30px rgba(16, 185, 129, 0.5))',
                  marginBottom: '2rem'
                }}
                onAnimationEnd={() => {
                  // Show dialogue after approach animation completes
                  setTimeout(() => {
                    setShowTerraDialogue(true);
                  }, 500);
                }}
              />
            </>
          )}

          {/* First Dialogue Screen */}
          {showTerraDialogue && !showTerraDialogue2 && (
            <>
              <img
                src="/images/Terra.png"
                alt="Terra"
                style={{
                  maxWidth: '60%',
                  maxHeight: '60%',
                  objectFit: 'contain',
                  objectPosition: '50% -30%',
                  filter: 'drop-shadow(0 0 30px rgba(16, 185, 129, 0.5))',
                  marginBottom: '2rem',
                  opacity: 0.9
                }}
              />
              <div
                className="terra-dialogue"
                style={{
                  background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.95) 0%, rgba(4, 120, 87, 0.95) 100%)',
                  border: '3px solid rgba(16, 185, 129, 0.8)',
                  borderRadius: '1rem',
                  padding: '1.5rem 2rem',
                  maxWidth: '600px',
                  margin: '0 2rem',
                  boxShadow: '0 8px 32px rgba(16, 185, 129, 0.4), 0 0 40px rgba(5, 150, 105, 0.3)',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                }}
                onClick={handleTerraFirstDialogueClick}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.boxShadow = '0 12px 40px rgba(16, 185, 129, 0.5), 0 0 50px rgba(5, 150, 105, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(16, 185, 129, 0.4), 0 0 40px rgba(5, 150, 105, 0.3)';
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '-10px',
                  left: '2rem',
                  width: 0,
                  height: 0,
                  borderLeft: '15px solid transparent',
                  borderRight: '15px solid transparent',
                  borderBottom: '15px solid rgba(16, 185, 129, 0.8)'
                }} />
                <p style={{
                  color: '#ffffff',
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                  margin: 0,
                  textAlign: 'center',
                  textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)',
                  lineHeight: '1.6'
                }}>
                  "You stand before the former leader of The 12. Know that your trespass will not be taken lightly."
                </p>
                <p style={{
                  color: 'rgba(255, 255, 255, 0.8)',
                  fontSize: '0.875rem',
                  margin: '0.75rem 0 0 0',
                  textAlign: 'center',
                  fontStyle: 'italic'
                }}>
                  — Terra
                </p>
              </div>
            </>
          )}

          {/* Second Screen: Terra Aggressive Image */}
          {showTerraDialogue2 && (
            <>
              <style>{`
                @keyframes fadeIn {
                  0% {
                    opacity: 0;
                  }
                  100% {
                    opacity: 1;
                  }
                }
                .terra-aggressive-image {
                  animation: fadeIn 0.8s ease-out forwards;
                }
                .terra-dialogue-2 {
                  animation: fadeInUp 0.5s ease-out 0.5s forwards;
                  opacity: 0;
                }
              `}</style>
              <img
                src="/images/Terra - Aggressive.png"
                alt="Terra Aggressive"
                className="terra-aggressive-image"
                style={{
                  maxWidth: '70%',
                  maxHeight: '70%',
                  objectFit: 'contain',
                  objectPosition: '50% -30%',
                  filter: 'drop-shadow(0 0 40px rgba(16, 185, 129, 0.8)) drop-shadow(0 0 60px rgba(34, 197, 94, 0.6))',
                  marginBottom: '2rem',
                  zIndex: 1
                }}
              />
              <div
                className="terra-dialogue-2"
                style={{
                  background: 'linear-gradient(135deg, rgba(5, 150, 105, 0.95) 0%, rgba(4, 120, 87, 0.95) 100%)',
                  border: '3px solid rgba(16, 185, 129, 0.8)',
                  borderRadius: '1rem',
                  padding: '1.5rem 2rem',
                  maxWidth: '600px',
                  margin: '0 2rem',
                  boxShadow: '0 8px 32px rgba(16, 185, 129, 0.4), 0 0 40px rgba(5, 150, 105, 0.3)',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                }}
                onClick={handleTerraIntroComplete}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.boxShadow = '0 12px 40px rgba(16, 185, 129, 0.5), 0 0 50px rgba(5, 150, 105, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 8px 32px rgba(16, 185, 129, 0.4), 0 0 40px rgba(5, 150, 105, 0.3)';
                }}
              >
                <div style={{
                  position: 'absolute',
                  top: '-10px',
                  left: '2rem',
                  width: 0,
                  height: 0,
                  borderLeft: '15px solid transparent',
                  borderRight: '15px solid transparent',
                  borderBottom: '15px solid rgba(16, 185, 129, 0.8)'
                }} />
                <p style={{
                  color: '#ffffff',
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                  margin: 0,
                  textAlign: 'center',
                  textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)',
                  lineHeight: '1.6'
                }}>
                  "Prepare yourself! You face the full power of the goddess of Earth!"
                </p>
                <p style={{
                  color: 'rgba(255, 255, 255, 0.8)',
                  fontSize: '0.875rem',
                  margin: '0.75rem 0 0 0',
                  textAlign: 'center',
                  fontStyle: 'italic'
                }}>
                  — Terra
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Terra Awakened Cut-scene Modal */}
      {showTerraAwakenedCutscene && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: '#000000',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden'
          }}
          onClick={(e) => {
            // Allow closing on background click when final image is shown
            if (e.target === e.currentTarget && showTerraAwakenedFinalImage) {
              handleTerraAwakenedCutsceneComplete();
            }
          }}
        >
          <style>{`
            @keyframes terraAwakening {
              0% {
                transform: scale(0.8) translateY(20%);
                opacity: 0;
                filter: blur(15px) brightness(0.7);
              }
              30% {
                opacity: 0.5;
                filter: blur(10px) brightness(0.8);
              }
              60% {
                opacity: 0.8;
                filter: blur(5px) brightness(1.1);
              }
              100% {
                transform: scale(1.1) translateY(0);
                opacity: 1;
                filter: blur(0px) brightness(1.3) drop-shadow(0 0 60px rgba(34, 197, 94, 0.9)) drop-shadow(0 0 100px rgba(16, 185, 129, 0.7));
              }
            }
            @keyframes fadeInUp {
              0% {
                opacity: 0;
                transform: translateY(20px);
              }
              100% {
                opacity: 1;
                transform: translateY(0);
              }
            }
            .terra-awakening-image {
              animation: terraAwakening 4s ease-out forwards;
            }
            .terra-awakened-dialogue {
              animation: fadeInUp 0.5s ease-out 4s forwards;
              opacity: 0;
            }
          `}</style>

          {/* Terra Awakened Final Image */}
          {showTerraAwakenedFinalImage && !showDeepForestEmergence && (
            <>
              <style>{`
                @keyframes fadeInFinal {
                  0% {
                    opacity: 0;
                  }
                  100% {
                    opacity: 1;
                  }
                }
                .terra-final-image {
                  animation: fadeInFinal 1s ease-out forwards;
                }
              `}</style>
              <img
                src="/images/Terra-Awakened.png"
                alt="Terra Awakened"
                className="terra-final-image"
                style={{
                  maxWidth: '90%',
                  maxHeight: '90%',
                  objectFit: 'contain',
                  objectPosition: '50% center',
                  filter: 'drop-shadow(0 0 60px rgba(34, 197, 94, 0.9)) drop-shadow(0 0 100px rgba(16, 185, 129, 0.7))',
                  cursor: 'pointer',
                  transition: 'transform 0.3s ease'
                }}
                onClick={handleTerraAwakenedFinalImageClick}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              />
            </>
          )}

          {/* Deep Forest Emergence Phase */}
          {showDeepForestEmergence && (
            <>
              <style>{`
                @keyframes deepForestEmergence {
                  0% {
                    opacity: 0;
                    transform: scale(0.9);
                    filter: blur(10px) brightness(0.8);
                  }
                  50% {
                    opacity: 0.7;
                    filter: blur(5px) brightness(1.1);
                  }
                  100% {
                    opacity: 1;
                    transform: scale(1);
                    filter: blur(0px) brightness(1.3) drop-shadow(0 0 80px rgba(34, 197, 94, 1)) drop-shadow(0 0 120px rgba(16, 185, 129, 0.8));
                  }
                }
                @keyframes fadeInUp {
                  0% {
                    opacity: 0;
                    transform: translateY(20px);
                  }
                  100% {
                    opacity: 1;
                    transform: translateY(0);
                  }
                }
                .deep-forest-image {
                  animation: deepForestEmergence 3s ease-out forwards;
                }
                .gaia-dialogue {
                  animation: fadeInUp 0.5s ease-out 3s forwards;
                  opacity: 0;
                }
              `}</style>
              <img
                src="/images/Terra - Deep Forest Emergence.png"
                alt="Deep Forest Emergence"
                className="deep-forest-image"
                style={{
                  maxWidth: '85%',
                  maxHeight: '85%',
                  objectFit: 'contain',
                  objectPosition: '50% center',
                  marginBottom: '2rem'
                }}
                onLoad={() => {
                  // Show dialogue after image loads
                  setTimeout(() => {
                    setShowGaiaDialogue(true);
                  }, 3000);
                }}
              />
              {showGaiaDialogue && (
                <div
                  className="gaia-dialogue"
                  style={{
                    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.95) 0%, rgba(16, 185, 129, 0.95) 100%)',
                    border: '3px solid rgba(34, 197, 94, 0.9)',
                    borderRadius: '1rem',
                    padding: '1.5rem 2rem',
                    maxWidth: '600px',
                    margin: '0 2rem',
                    boxShadow: '0 8px 32px rgba(34, 197, 94, 0.5), 0 0 50px rgba(16, 185, 129, 0.4)',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                  }}
                  onClick={handleGaiaDialogueClick}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.02)';
                    e.currentTarget.style.boxShadow = '0 12px 40px rgba(34, 197, 94, 0.6), 0 0 60px rgba(16, 185, 129, 0.5)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 8px 32px rgba(34, 197, 94, 0.5), 0 0 50px rgba(16, 185, 129, 0.4)';
                  }}
                >
                  <div style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '2rem',
                    width: 0,
                    height: 0,
                    borderLeft: '15px solid transparent',
                    borderRight: '15px solid transparent',
                    borderBottom: '15px solid rgba(34, 197, 94, 0.9)'
                  }} />
                  <p style={{
                    color: '#ffffff',
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    margin: 0,
                    textAlign: 'center',
                    textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)',
                    lineHeight: '1.6'
                  }}>
                    "Gaia's Awakening: Primeval Bloom"
                  </p>
                  <p style={{
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: '0.875rem',
                    margin: '0.75rem 0 0 0',
                    textAlign: 'center',
                    fontStyle: 'italic'
                  }}>
                    — Terra (Awakened)
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Room List Modal for Multiplayer */}
      {showRoomList && selectedOpponent && (
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
          zIndex: 10000,
          padding: '2rem'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            color: 'white',
            padding: '2rem',
            borderRadius: '1.5rem',
            maxWidth: '800px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
            border: '2px solid #334155'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '2rem', color: '#60a5fa', margin: 0 }}>
                🎮 Battle Rooms - {selectedOpponent.name}
              </h2>
              <button
                onClick={() => {
                  setShowRoomList(false);
                  setSelectedOpponent(null);
                }}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.5rem 1rem',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                ✕
              </button>
            </div>

            {/* Create Room Button */}
            <button
              onClick={() => createPracticeRoom(selectedOpponent)}
              disabled={loading}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                border: 'none',
                padding: '1rem',
                borderRadius: '0.75rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '1.125rem',
                fontWeight: 'bold',
                marginBottom: '2rem',
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? 'Creating...' : '➕ Create New Room'}
            </button>

            {/* Available Rooms */}
            <div>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#cbd5e0' }}>
                Available Rooms ({practiceRooms.filter(r => r.selectedOpponentId === selectedOpponent.id).length})
              </h3>
              {practiceRooms.filter(r => r.selectedOpponentId === selectedOpponent.id).length === 0 ? (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  padding: '2rem',
                  borderRadius: '0.75rem',
                  textAlign: 'center',
                  color: '#94a3b8'
                }}>
                  No rooms available. Create a new room to start!
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {practiceRooms
                    .filter(r => r.selectedOpponentId === selectedOpponent.id)
                    .map((room) => (
                      <div
                        key={room.id}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          padding: '1.5rem',
                          borderRadius: '0.75rem',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                            {room.hostName} (Level {room.hostLevel})
                          </div>
                          <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>
                            Players: {room.participants.length}/{room.maxParticipants}
                          </div>
                        </div>
                        <button
                          onClick={() => joinPracticeRoom(room.id)}
                          disabled={loading || room.participants.length >= room.maxParticipants || room.participants.includes(currentUser?.uid)}
                          style={{
                            background: room.participants.length >= room.maxParticipants || room.participants.includes(currentUser?.uid)
                              ? '#6b7280'
                              : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                            color: 'white',
                            border: 'none',
                            padding: '0.75rem 1.5rem',
                            borderRadius: '0.5rem',
                            cursor: room.participants.length >= room.maxParticipants || room.participants.includes(currentUser?.uid) ? 'not-allowed' : 'pointer',
                            fontSize: '1rem',
                            fontWeight: 'bold',
                            opacity: room.participants.length >= room.maxParticipants || room.participants.includes(currentUser?.uid) ? 0.6 : 1
                          }}
                        >
                          {room.participants.includes(currentUser?.uid) ? 'Joined' : room.participants.length >= room.maxParticipants ? 'Full' : 'Join'}
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Practice Waiting Room Modal */}
      {showPracticeWaitingRoom && currentPracticeRoom && (
        <PracticeWaitingRoomModal
          isOpen={showPracticeWaitingRoom}
          onLeaveRoom={leavePracticeRoom}
          currentRoom={currentPracticeRoom}
          onParticipantsUpdate={handleParticipantsUpdate}
          onBattleStart={startPracticeBattle}
          currentUserPhotoURL={currentUser?.photoURL || null}
          currentUserName={currentUser?.displayName || currentUser?.email || 'Anonymous'}
          currentUserLevel={userLevel}
        />
      )}
    </div>
    </>
  );
};

export default PracticeModeBattle;
