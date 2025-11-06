import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { doc, getDoc, getDocs, updateDoc, addDoc, collection, onSnapshot, query, where, orderBy, serverTimestamp, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import BattleEngine from './BattleEngine';
import { getLevelFromXP } from '../utils/leveling';
import PvPRewardSpin from './PvPRewardSpin';
import WaitingRoomModal from './WaitingRoomModal';

export type RiskLevel = 'easy' | 'medium' | 'high';

export interface BattleRoom {
  id: string;
  hostId: string;
  hostName: string;
  hostLevel: number;
  status: 'waiting' | 'in-progress' | 'completed' | 'left';
  createdAt: any;
  participants: string[];
  maxParticipants: number;
  hostPhotoURL?: string;
  riskLevel?: RiskLevel;
  riskPercentage?: number; // 10, 20, or 25
  leftBy?: string; // User ID who left
  leftAt?: any; // Timestamp when left
}

interface OpponentData {
  id: string;
  name: string;
  currentPP: number;
  maxPP: number;
  shieldStrength: number;
  maxShieldStrength: number;
  level: number;
  photoURL?: string;
}

interface RoomWithOpponent extends BattleRoom {
  opponent?: OpponentData;
  hostVault?: {
    currentPP: number;
    capacity: number;
    shieldStrength: number;
    maxShieldStrength: number;
  };
}

interface PvPBattleProps {
  onBack: () => void;
}

const PvPBattle: React.FC<PvPBattleProps> = ({ onBack }) => {
  const { currentUser } = useAuth();
  const { vault, moves, syncVaultPP } = useBattle();
  const [userLevel, setUserLevel] = useState(1);
  const [battleRooms, setBattleRooms] = useState<RoomWithOpponent[]>([]);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showBattleEngine, setShowBattleEngine] = useState(false);
  const [currentRoom, setCurrentRoom] = useState<BattleRoom | null>(null);
  const [opponent, setOpponent] = useState<OpponentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRiskSelection, setShowRiskSelection] = useState(false);
  const [selectedRiskLevel, setSelectedRiskLevel] = useState<RiskLevel | null>(null);
  const [showRewardSpin, setShowRewardSpin] = useState(false);
  const [isWinner, setIsWinner] = useState(false);
  const [rewardAmount, setRewardAmount] = useState(0);
  const [showWaitingRoom, setShowWaitingRoom] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [hasIntentionallyLeft, setHasIntentionallyLeft] = useState(false);

  // Fetch user level and restore battle if user is in one
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

    // Check if user is in an active battle room and restore it
    const restoreActiveBattle = async () => {
      if (!currentUser || hasIntentionallyLeft) return;

      try {
        // Query for rooms where user is a participant and status is in-progress
        const activeBattleQuery = query(
          collection(db, 'battleRooms'),
          where('participants', 'array-contains', currentUser.uid),
          where('status', '==', 'in-progress')
        );

        const snapshot = await getDocs(activeBattleQuery);
        
        if (!snapshot.empty) {
          // User has an active battle - restore it
          const activeRoom = snapshot.docs[0];
          const roomData = { id: activeRoom.id, ...activeRoom.data() } as BattleRoom;
          
          // Don't restore if opponent left (status would be 'left')
          if (roomData.status !== 'left') {
            console.log('PvP Battle: Restoring active battle on mount', roomData.id);
            // Sync vault PP from student PP before restoring battle
            try {
              await syncVaultPP();
              console.log('PvP Battle: Synced vault PP from student PP before restoring battle on mount');
            } catch (error) {
              console.error('Error syncing vault PP before restoring battle on mount:', error);
            }
            setCurrentRoom(roomData);
            await fetchOpponentData(roomData);
            setShowBattleEngine(true);
          } else {
            console.log('PvP Battle: Not restoring battle - opponent left');
          }
        }
      } catch (error) {
        console.error('Error restoring active battle:', error);
      }
    };

    restoreActiveBattle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, hasIntentionallyLeft]);

  // Fetch opponent and vault data for rooms
  useEffect(() => {
    const fetchRoomData = async () => {
      if (!currentUser || battleRooms.length === 0) return;

      // Only fetch if rooms don't already have opponent data
      const roomsNeedingData = battleRooms.filter(room => {
        // Need data if room has participants other than host and no opponent data yet
        const hasOpponent = room.hostId === currentUser.uid
          ? room.participants.some(p => p !== currentUser.uid)
          : room.hostId !== currentUser.uid;
        return hasOpponent && !room.opponent;
      });
      
      if (roomsNeedingData.length === 0) return;

      const roomsWithData = await Promise.all(
        battleRooms.map(async (room) => {
          // Skip if already has opponent data
          if (room.opponent) return room;
          
          const roomData: RoomWithOpponent = { ...room };
          
          // Get opponent (host if current user is not host, otherwise first participant who isn't current user)
          const opponentId = room.hostId === currentUser.uid
            ? room.participants.find(p => p !== currentUser.uid)
            : room.hostId;

          if (opponentId) {
            try {
              const [opponentStudent, opponentVault] = await Promise.all([
                getDoc(doc(db, 'students', opponentId)),
                getDoc(doc(db, 'vaults', opponentId))
              ]);

              if (opponentStudent.exists()) {
                const studentData = opponentStudent.data();
                const vaultData = opponentVault.exists() ? opponentVault.data() : null;
                const opponentLevel = getLevelFromXP(studentData.xp || 0);

                roomData.opponent = {
                  id: opponentId,
                  name: studentData.displayName || studentData.name || 'Unknown Player',
                  currentPP: vaultData?.currentPP || 0,
                  maxPP: vaultData?.capacity || 1000,
                  shieldStrength: vaultData?.shieldStrength || 0,
                  maxShieldStrength: vaultData?.maxShieldStrength || 100,
                  level: opponentLevel,
                  photoURL: studentData.photoURL || null
                };
              }

              if (room.hostId === currentUser.uid && opponentVault.exists()) {
                const vaultData = opponentVault.data();
                roomData.hostVault = {
                  currentPP: vaultData.currentPP || 0,
                  capacity: vaultData.capacity || 1000,
                  shieldStrength: vaultData.shieldStrength || 0,
                  maxShieldStrength: vaultData.maxShieldStrength || 100
                };
              }
            } catch (error) {
              console.error(`Error fetching data for opponent ${opponentId}:`, error);
            }
          }

          return roomData;
        })
      );

      // Only update if we actually added opponent data
      const hasNewData = roomsWithData.some((room, idx) => 
        room.opponent && !battleRooms[idx]?.opponent
      );
      
      if (hasNewData) {
        setBattleRooms(roomsWithData);
      }
    };

    fetchRoomData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleRooms.map(r => `${r.id}-${r.participants.join(',')}`).join('|'), currentUser]);

  // Listen for battle rooms - use polling instead of real-time to avoid Firestore assertion errors
  useEffect(() => {
    if (!currentUser) return;

    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const fetchRooms = async () => {
      if (!isMounted || !currentUser) return;

      try {
        // Fetch both waiting rooms (to join) and in-progress rooms (to rejoin)
        const waitingQuery = query(
          collection(db, 'battleRooms'),
          where('status', '==', 'waiting')
        );

        const inProgressQuery = query(
          collection(db, 'battleRooms'),
          where('status', '==', 'in-progress')
        );

        const [waitingSnapshot, inProgressSnapshot] = await Promise.all([
          getDocs(waitingQuery),
          getDocs(inProgressQuery)
        ]);
        
        const waitingRooms = waitingSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as BattleRoom[];

        const inProgressRooms = inProgressSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as BattleRoom[];

        // Combine both lists
        const rooms = [...waitingRooms, ...inProgressRooms];

        console.log('PvP Battle: Fetched rooms:', { waiting: waitingRooms.length, inProgress: inProgressRooms.length, total: rooms.length });

        // Clean up old completed rooms (older than 1 hour) - but keep in-progress rooms
        const now = Date.now();
        const oneHourAgo = now - (60 * 60 * 1000); // 1 hour in milliseconds
        
        const oldCompletedRoomsToDelete = rooms.filter(room => {
          // Only delete completed rooms, not in-progress ones (users might rejoin)
          if (room.status !== 'completed' && room.status !== 'waiting') {
            return false;
          }
          
          if (!room.createdAt) return false;
          
          // Handle both Firestore Timestamp and regular date
          let roomTimestamp: number;
          if (room.createdAt?.toMillis) {
            // Firestore Timestamp
            roomTimestamp = room.createdAt.toMillis();
          } else if (room.createdAt?.seconds) {
            // Firestore Timestamp as object with seconds
            roomTimestamp = room.createdAt.seconds * 1000;
          } else if (room.createdAt instanceof Date) {
            // Regular Date object
            roomTimestamp = room.createdAt.getTime();
          } else if (typeof room.createdAt === 'number') {
            // Already a timestamp
            roomTimestamp = room.createdAt;
          } else {
            return false; // Can't determine age, skip
          }
          
          return roomTimestamp < oneHourAgo;
        });

        // Delete old completed/waiting rooms (but preserve in-progress rooms)
        if (oldCompletedRoomsToDelete.length > 0) {
          console.log(`PvP Battle: Deleting ${oldCompletedRoomsToDelete.length} old completed/waiting rooms`);
          await Promise.all(
            oldCompletedRoomsToDelete.map(async (room) => {
              try {
                await deleteDoc(doc(db, 'battleRooms', room.id));
                console.log(`PvP Battle: Deleted old room ${room.id}`);
              } catch (error) {
                console.error(`Error deleting old room ${room.id}:`, error);
              }
            })
          );
          
          // Remove deleted rooms from the list
          const remainingRooms = rooms.filter(room => 
            !oldCompletedRoomsToDelete.some(oldRoom => oldRoom.id === room.id)
          );
          
          // Continue processing with remaining rooms
          rooms.splice(0, rooms.length, ...remainingRooms);
        }

        // Separate rooms into: rooms user can rejoin (they're a participant) and rooms they can join (new)
        const roomsUserIsIn = rooms.filter(room => 
          room.participants && room.participants.includes(currentUser.uid)
        );

        const roomsUserCanJoin = rooms.filter(room => {
          // Don't show rooms where user is already a participant (those go to rejoin list)
          if (room.participants && room.participants.includes(currentUser.uid)) {
            return false;
          }
          // Only show waiting rooms that aren't full
          if (room.status !== 'waiting') {
            return false;
          }
          if (room.participants && room.participants.length >= (room.maxParticipants || 2)) {
            return false;
          }
          return true;
        });

        // For rooms user is in, check if battle should be restored
        // Only restore if not already showing a battle
        if (roomsUserIsIn.length > 0 && !showBattleEngine && !currentRoom) {
          const inProgressRoom = roomsUserIsIn.find(room => room.status === 'in-progress');
          if (inProgressRoom) {
            // User is in an in-progress battle - restore it
            // But don't restore if opponent left (status would be 'left')
            if (inProgressRoom.status !== 'left') {
              console.log('PvP Battle: Restoring battle room from polling', inProgressRoom.id);
              // Sync vault PP from student PP before restoring battle
              try {
                await syncVaultPP();
                console.log('PvP Battle: Synced vault PP from student PP before restoring battle');
              } catch (error) {
                console.error('Error syncing vault PP before restoring battle:', error);
              }
              setCurrentRoom({ ...inProgressRoom, id: inProgressRoom.id } as BattleRoom);
              await fetchOpponentData(inProgressRoom);
              setShowBattleEngine(true);
            } else {
              console.log('PvP Battle: Not restoring battle - opponent left');
            }
          }
        }

        // Show both lists: available rooms to join + rooms user can rejoin
        const availableRooms = [...roomsUserCanJoin, ...roomsUserIsIn];

        console.log('PvP Battle: Available rooms after filtering:', availableRooms.length);

        // Fetch host photo URLs for all available rooms (search filtering happens in render)
        const roomsWithPhotos = await Promise.all(
          availableRooms.map(async (room) => {
            try {
              const hostDoc = await getDoc(doc(db, 'students', room.hostId));
              if (hostDoc.exists()) {
                room.hostPhotoURL = hostDoc.data().photoURL || null;
              }
            } catch (error) {
              console.error('Error fetching host photo:', error);
            }
            return room;
          })
        );

        if (isMounted) {
          setBattleRooms(roomsWithPhotos);
        }
      } catch (error: any) {
        console.error('Error fetching battle rooms:', error);
        if (error.code === 'permission-denied') {
          console.error('Permission denied - check Firestore security rules');
        } else if (error.code === 'failed-precondition' || error.code === 'unimplemented') {
          console.warn('Index error detected - room query may need a Firestore index');
        }
        if (isMounted) {
          setBattleRooms([]);
        }
      }
    };

    // Fetch immediately
    fetchRooms();

    // Poll every 2 seconds to get updates
    intervalId = setInterval(fetchRooms, 2000);

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [currentUser]);

  // Listen for room status changes to detect when opponent leaves
  useEffect(() => {
    if (!currentRoom || !currentUser || !showBattleEngine) return;
    if (hasIntentionallyLeft) return; // Don't check if we intentionally left

    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    const setupListener = async () => {
      try {
        const roomRef = doc(db, 'battleRooms', currentRoom.id);
        
        unsubscribe = onSnapshot(roomRef, (docSnapshot) => {
          if (!isMounted || !docSnapshot.exists()) return;
          
          const updatedRoom = { id: docSnapshot.id, ...docSnapshot.data() } as BattleRoom;
          
          // Check if room status changed to 'left' and it wasn't us who left
          if (updatedRoom.status === 'left' && updatedRoom.leftBy !== currentUser.uid) {
            console.log('PvP Battle: Opponent left the battle, ending battle for current player');
            
            // End the battle for the current player
            setShowBattleEngine(false);
            setShowWaitingRoom(false);
            setOpponent(null);
            setCurrentRoom(null);
            setHasIntentionallyLeft(true); // Prevent restore
            
            // Show a message that opponent left
            alert(`${opponent?.name || 'Your opponent'} left the battle. The battle has ended.`);
          }
        }, (error) => {
          console.error('Error listening to room status:', error);
        });
      } catch (error) {
        console.error('Error setting up room status listener:', error);
      }
    };

    setupListener();

    return () => {
      isMounted = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentRoom, currentUser, showBattleEngine, hasIntentionallyLeft, opponent]);

  const createBattleRoom = async (riskLevel: RiskLevel) => {
    if (!currentUser || !vault) return;

    setLoading(true);
    try {
      const riskPercentages = {
        easy: 10,
        medium: 20,
        high: 25
      };

      const roomData = {
        hostId: currentUser.uid,
        hostName: currentUser.displayName || currentUser.email || 'Anonymous',
        hostLevel: userLevel,
        status: 'waiting',
        createdAt: serverTimestamp(),
        participants: [currentUser.uid],
        maxParticipants: 2,
        riskLevel: riskLevel,
        riskPercentage: riskPercentages[riskLevel]
      };

      const docRef = await addDoc(collection(db, 'battleRooms'), roomData);
      
      // Get the created room
      const roomDoc = await getDoc(docRef);
      if (roomDoc.exists()) {
        const room = { id: docRef.id, ...roomDoc.data() } as BattleRoom;
        setHasIntentionallyLeft(false); // Reset flag when creating new room
        setCurrentRoom(room);
        setShowRiskSelection(false);
        setSelectedRiskLevel(null);
        setShowWaitingRoom(true); // Show waiting room after creating room
      }
    } catch (error) {
      console.error('Error creating battle room:', error);
      alert('Failed to create battle room. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const joinBattleRoom = async (roomId: string) => {
    if (!currentUser || !vault) return;

    setLoading(true);
    try {
      const roomRef = doc(db, 'battleRooms', roomId);
      const roomDoc = await getDoc(roomRef);
      
      if (!roomDoc.exists()) {
        alert('Battle room not found.');
        return;
      }

      const room = roomDoc.data() as BattleRoom;
      
      if (room.participants.includes(currentUser.uid)) {
        // User is already in room, restore battle state
        setHasIntentionallyLeft(false); // Reset flag when rejoining
        // Sync vault PP from student PP before restoring battle
        if (room.status === 'in-progress') {
          try {
            await syncVaultPP();
            console.log('PvP Battle: Synced vault PP from student PP before rejoining battle');
          } catch (error) {
            console.error('Error syncing vault PP before rejoining battle:', error);
          }
        }
        setCurrentRoom(room);
        await fetchOpponentData(room);
        if (room.status === 'in-progress') {
          setShowBattleEngine(true);
          setShowWaitingRoom(false);
        } else {
          setShowWaitingRoom(true);
        }
        setLoading(false);
        return;
      }

      // Allow rejoining even if room is full (user is a participant)
      if (room.participants.length >= room.maxParticipants && !room.participants.includes(currentUser.uid)) {
        alert('This battle room is full.');
        setLoading(false);
        return;
      }

      // Add user to room
      const updatedParticipants = [...room.participants, currentUser.uid];
      const isRoomFull = updatedParticipants.length >= room.maxParticipants;
      
      await updateDoc(roomRef, {
        participants: updatedParticipants,
        status: isRoomFull ? 'in-progress' : 'waiting'
      });

      // Set current room and fetch opponent data
      const updatedRoom: BattleRoom = { 
        ...room, 
        participants: updatedParticipants, 
        status: (isRoomFull ? 'in-progress' : 'waiting') as 'waiting' | 'in-progress' | 'completed'
      };
      setHasIntentionallyLeft(false); // Reset flag when joining new room
      setCurrentRoom(updatedRoom);
      await fetchOpponentData(updatedRoom);
      
      // If room is now full (2 participants), start battle immediately
      if (isRoomFull) {
        // Sync vault PP from student PP before starting battle
        try {
          await syncVaultPP();
          console.log('PvP Battle: Synced vault PP from student PP before battle start');
        } catch (error) {
          console.error('Error syncing vault PP before battle:', error);
        }
        setShowBattleEngine(true);
        setShowWaitingRoom(false);
        // Notify the room creator that opponent joined (triggers battle for them too)
        // The WaitingRoomModal listener will handle this for the creator
      } else {
        // Show waiting room while waiting for more players (if maxParticipants > 2)
        setShowWaitingRoom(true);
      }
    } catch (error: any) {
      console.error('Error joining battle room:', error);
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

  const fetchOpponentData = async (room: BattleRoom) => {
    if (!currentUser) return;

    // Determine opponent ID
    const opponentId = room.hostId === currentUser.uid
      ? room.participants.find(p => p !== currentUser.uid)
      : room.hostId;

    if (!opponentId) {
      console.warn('No opponent found in room');
      return;
    }

    try {
      const [opponentStudent, opponentVault] = await Promise.all([
        getDoc(doc(db, 'students', opponentId)),
        getDoc(doc(db, 'vaults', opponentId))
      ]);

      if (opponentStudent.exists() && opponentVault.exists()) {
        const studentData = opponentStudent.data();
        const vaultData = opponentVault.data();
        const opponentLevel = getLevelFromXP(studentData.xp || 0);

        setOpponent({
          id: opponentId,
          name: studentData.displayName || studentData.name || 'Unknown Player',
          currentPP: vaultData.currentPP || 0,
          maxPP: vaultData.capacity || 1000,
          shieldStrength: vaultData.shieldStrength || 0,
          maxShieldStrength: vaultData.maxShieldStrength || 100,
          level: opponentLevel,
          photoURL: studentData.photoURL || null
        });
      }
    } catch (error) {
      console.error('Error fetching opponent data:', error);
    }
  };

  const leaveBattleRoom = async () => {
    console.log('PvP Battle: leaveBattleRoom called', { currentUser: !!currentUser, currentRoom: !!currentRoom });
    
    // Immediately exit without confirmation - user wants to leave
    const roomId = currentRoom?.id;
    
    // Mark that user intentionally left to prevent restore
    setHasIntentionallyLeft(true);
    
    // Update room status to indicate user left
    if (roomId && currentUser) {
      try {
        await updateDoc(doc(db, 'battleRooms', roomId), {
          status: 'left',
          leftBy: currentUser.uid,
          leftAt: serverTimestamp()
        }).catch(error => {
          console.error('Error updating room status:', error);
        });
      } catch (updateError) {
        console.error('Error updating room status:', updateError);
      }
    }
    
    // Immediately clear all state - don't wait
    setShowBattleEngine(false);
    setShowWaitingRoom(false);
    setOpponent(null);
    setCurrentRoom(null);
    setShowLeaveConfirm(false);
    
    console.log('PvP Battle: Exited battle immediately');
  };

  const confirmLeaveBattle = async () => {
    if (!currentUser || !currentRoom) {
      setShowLeaveConfirm(false);
      return;
    }

    console.log('PvP Battle: confirmLeaveBattle called', currentRoom.id);
    const roomId = currentRoom.id;

    try {
      // Mark that user intentionally left to prevent restore
      setHasIntentionallyLeft(true);
      
      // Update room status to indicate user left
      try {
        await updateDoc(doc(db, 'battleRooms', roomId), {
          status: 'left',
          leftBy: currentUser.uid,
          leftAt: serverTimestamp()
        });
      } catch (updateError) {
        console.error('Error updating room status:', updateError);
        // Continue anyway - we'll still clear the UI
      }
      
      // Immediately clear all state - don't wait
      setShowBattleEngine(false);
      setShowWaitingRoom(false);
      setOpponent(null);
      setCurrentRoom(null);
      setShowLeaveConfirm(false);
      
      console.log('PvP Battle: Left room (can rejoin)', roomId);
    } catch (error) {
      console.error('Error leaving battle room:', error);
      // Even on error, clear the UI
      setHasIntentionallyLeft(true);
      setShowBattleEngine(false);
      setShowWaitingRoom(false);
      setOpponent(null);
      setCurrentRoom(null);
      setShowLeaveConfirm(false);
    }
  };

  const handleOpponentJoined = async (opponentData: OpponentData) => {
    // Opponent joined! Set opponent and transition to battle
    setOpponent(opponentData);
    setShowWaitingRoom(false);
    setShowBattleEngine(true);
    
    // Update room status to in-progress if needed
    if (currentRoom && currentRoom.participants.length < 2) {
      try {
        const roomRef = doc(db, 'battleRooms', currentRoom.id);
        await updateDoc(roomRef, {
          status: 'in-progress',
          participants: [...currentRoom.participants, opponentData.id]
        });
        
        // Update local currentRoom state
        setCurrentRoom({
          ...currentRoom,
          status: 'in-progress',
          participants: [...currentRoom.participants, opponentData.id]
        });
      } catch (error) {
        console.error('Error updating room status:', error);
      }
    }
  };

  const handleBattleEnd = async (result: 'victory' | 'defeat' | 'escape', winnerId?: string, loserId?: string) => {
    console.log('PvP Battle: handleBattleEnd called', { result, winnerId, loserId });
    
    // Immediately clear battle engine to stop listeners
    setShowBattleEngine(false);
    
    if (result === 'escape') {
      // Clear all battle state immediately when escaping
      console.log('PvP Battle: Handling escape - clearing all state');
      const roomId = currentRoom?.id;
      
      // Mark that user intentionally left to prevent restore
      setHasIntentionallyLeft(true);
      
      // Update room status to indicate user escaped
      if (roomId && currentUser) {
        try {
          await updateDoc(doc(db, 'battleRooms', roomId), {
            status: 'left',
            leftBy: currentUser.uid,
            leftAt: serverTimestamp()
          }).catch(error => {
            console.error('Error updating room status on escape:', error);
          });
        } catch (updateError) {
          console.error('Error updating room status on escape:', updateError);
        }
      }
      
      // Immediately clear all state - don't wait
      setShowBattleEngine(false);
      setShowWaitingRoom(false);
      setOpponent(null);
      setCurrentRoom(null);
      setShowLeaveConfirm(false);
      
      console.log('🏃 You escaped from battle!');
      return;
    }

    if (!currentRoom || !winnerId || !loserId || !currentUser) {
      setCurrentRoom(null);
      return;
    }

    // Calculate PP transfer based on risk level
    const riskPercentage = currentRoom.riskPercentage || 10;
    
    // Fetch both players' vaults to calculate transfers
    try {
      const [winnerVaultDoc, loserVaultDoc] = await Promise.all([
        getDoc(doc(db, 'vaults', winnerId)),
        getDoc(doc(db, 'vaults', loserId))
      ]);

      if (winnerVaultDoc.exists() && loserVaultDoc.exists()) {
        const loserVault = loserVaultDoc.data();
        const winnerVault = winnerVaultDoc.data();
        const loserTotalPP = loserVault.capacity || 1000;
        
        // Amount at risk (percentage of loser's total PP)
        const ppAtRisk = Math.floor(loserTotalPP * (riskPercentage / 100));
        
        // Calculate actual loss (loser's current PP or PP at risk, whichever is less)
        const actualLoss = Math.min(ppAtRisk, loserVault.currentPP || 0);
        
        // Transfer PP from loser to winner immediately (base amount)
        const loserRef = doc(db, 'vaults', loserId);
        const winnerRef = doc(db, 'vaults', winnerId);
        
        const newLoserPP = Math.max(0, (loserVault.currentPP || 0) - actualLoss);
        const winnerCurrentPP = winnerVault.currentPP || 0;
        const winnerCapacity = winnerVault.capacity || 1000;
        const newWinnerPP = Math.min(winnerCapacity, winnerCurrentPP + actualLoss);
        
        // Update both vaults
        await Promise.all([
          updateDoc(loserRef, { currentPP: newLoserPP }),
          updateDoc(winnerRef, { currentPP: newWinnerPP })
        ]);
        
        // Update student documents
        await Promise.all([
          updateDoc(doc(db, 'students', loserId), { currentPP: newLoserPP }),
          updateDoc(doc(db, 'students', winnerId), { currentPP: newWinnerPP })
        ]);
        
        // Show reward spin for winner or loser
        if (winnerId === currentUser.uid) {
          // Player won - show winner spin for bonus multiplier
          setIsWinner(true);
          setRewardAmount(actualLoss);
          setShowBattleEngine(false);
          setShowRewardSpin(true);
        } else {
          // Player lost - show recovery spin
          setIsWinner(false);
          setRewardAmount(actualLoss);
          setShowBattleEngine(false);
          setShowRewardSpin(true);
        }
      }
    } catch (error) {
      console.error('Error calculating battle rewards:', error);
      alert('Error processing battle rewards. Please try again.');
    }
    
    setCurrentRoom(null);
  };

  if (showBattleEngine && currentRoom) {
    return (
      <div>
        <div style={{
          background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
          color: 'white',
          padding: '1rem',
          borderRadius: '0.75rem',
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem' }}>⚔️ PvP Battle in Progress</h3>
              <p style={{ margin: '0.25rem 0 0 0', opacity: 0.9 }}>
                {opponent ? `vs. ${opponent.name} (Lv. ${opponent.level})` : `Room: ${currentRoom.hostName} (Lv. ${currentRoom.hostLevel})`}
              </p>
            </div>
            {opponent && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'rgba(255, 255, 255, 0.1)',
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem'
              }}>
                {opponent.photoURL ? (
                  <img 
                    src={opponent.photoURL} 
                    alt={opponent.name}
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid white'
                    }}
                  />
                ) : (
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: 'rgba(255, 255, 255, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1rem',
                    fontWeight: 'bold'
                  }}>
                    {opponent.name[0]?.toUpperCase() || 'O'}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>PP: {opponent.currentPP}/{opponent.maxPP}</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>🛡️ {opponent.shieldStrength}/{opponent.maxShieldStrength}</div>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.nativeEvent?.stopImmediatePropagation?.();
              console.log('PvP Battle: Leave Battle button clicked - exiting immediately');
              leaveBattleRoom();
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              zIndex: 10000,
              position: 'relative',
              pointerEvents: 'auto'
            }}
          >
            Leave Battle
          </button>
        </div>
        
        <BattleEngine 
          onBattleEnd={(result, winnerId, loserId) => {
            handleBattleEnd(result, winnerId, loserId);
          }}
          opponent={opponent || undefined}
          isPvP={true}
          battleRoom={currentRoom}
        />
      </div>
    );
  }

  return (
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
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>
            ⚔️ PvP Battle Arena
          </h2>
          <p style={{ color: '#6b7280', fontSize: '1rem' }}>
            Challenge other players in real-time turn-based combat
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

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '2rem',
        marginBottom: '2rem'
      }}>
        {/* Create Room */}
        <div style={{
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          color: 'white',
          padding: '2rem',
          borderRadius: '1rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏠</div>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Create Battle Room</h3>
          <p style={{ opacity: 0.9, marginBottom: '1.5rem' }}>
            Choose your risk level and battle for PP!
          </p>
          {!showRiskSelection ? (
            <button
              onClick={() => setShowRiskSelection(true)}
              disabled={loading}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: 'white',
                padding: '0.75rem 2rem',
                borderRadius: '0.5rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '1rem',
                fontWeight: '500',
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? 'Creating...' : 'Select Risk Level'}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontSize: '0.875rem', opacity: 0.9, marginBottom: '0.5rem' }}>
                Choose your risk level:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {(['easy', 'medium', 'high'] as RiskLevel[]).map((risk) => (
                  <button
                    key={risk}
                    onClick={() => createBattleRoom(risk)}
                    disabled={loading}
                    style={{
                      background: risk === 'easy' ? 'rgba(34, 197, 94, 0.3)' : risk === 'medium' ? 'rgba(251, 191, 36, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                      border: `2px solid ${risk === 'easy' ? '#22c55e' : risk === 'medium' ? '#fbbf24' : '#ef4444'}`,
                      color: 'white',
                      padding: '0.75rem 1rem',
                      borderRadius: '0.5rem',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      opacity: loading ? 0.6 : 1,
                      textTransform: 'capitalize'
                    }}
                  >
                    {risk === 'easy' ? '🟢 Easy (10% at risk)' : risk === 'medium' ? '🟡 Medium (20% at risk)' : '🔴 High (25% at risk)'}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  setShowRiskSelection(false);
                  setSelectedRiskLevel(null);
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  marginTop: '0.5rem'
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Join Room */}
        <div style={{
          background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
          color: 'white',
          padding: '2rem',
          borderRadius: '1rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚪</div>
          <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Join Battle Room</h3>
          <p style={{ opacity: 0.9, marginBottom: '1.5rem' }}>
            Join an existing battle room to challenge other players
          </p>
          <div style={{ 
            fontSize: '1.125rem', 
            fontWeight: 'bold',
            padding: '0.75rem',
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '0.5rem',
            marginBottom: '0.5rem'
          }}>
            {(() => {
              const filteredCount = searchQuery.trim() 
                ? battleRooms.filter(room => 
                    (room.hostName || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
                  ).length
                : battleRooms.length;
              
              return filteredCount > 0 ? (
                <>
                  {filteredCount} {filteredCount === 1 ? 'room' : 'rooms'} available
                  {searchQuery && ` matching "${searchQuery}"`}
                </>
              ) : (
                searchQuery ? `No rooms match "${searchQuery}"` : 'No rooms available yet'
              );
            })()}
          </div>
          {battleRooms.length === 0 && (
            <p style={{ fontSize: '0.875rem', opacity: 0.8, marginTop: '0.5rem' }}>
              Create a room or wait for others to join
            </p>
          )}
        </div>
      </div>

      {/* Available Rooms */}
      {battleRooms.length > 0 && battleRooms.filter(room => {
        if (!searchQuery.trim()) return true;
        const queryLower = searchQuery.toLowerCase().trim();
        const hostName = (room.hostName || '').toLowerCase();
        return hostName.includes(queryLower);
      }).length > 0 && (
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            gap: '1rem',
            flexWrap: 'wrap'
          }}>
            <h3 style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              color: '#374151',
              margin: 0
            }}>
              Available Battle Rooms
            </h3>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flex: 1,
              maxWidth: '400px',
              minWidth: '250px'
            }}>
              <input
                type="text"
                placeholder="🔍 Search by player name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  border: '2px solid #e5e7eb',
                  fontSize: '0.875rem',
                  outline: 'none',
                  transition: 'all 0.2s',
                  background: 'white'
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#3b82f6';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    padding: '0.5rem 0.75rem',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#dc2626';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#ef4444';
                  }}
                >
                  ✕ Clear
                </button>
              )}
            </div>
          </div>
          {searchQuery && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              background: '#f3f4f6',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              color: '#6b7280'
            }}>
              {battleRooms.filter(room => 
                (room.hostName || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
              ).length > 0 ? (
                <>
                  Found <strong>{battleRooms.filter(room => 
                    (room.hostName || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
                  ).length}</strong> room(s) matching "<strong>{searchQuery}</strong>"
                </>
              ) : (
                <>
                  No rooms found matching "<strong>{searchQuery}</strong>"
                </>
              )}
            </div>
          )}
          <div style={{
            display: 'grid',
            gap: '1rem'
          }}>
            {battleRooms
              .filter(room => {
                if (!searchQuery.trim()) return true;
                const queryLower = searchQuery.toLowerCase().trim();
                const hostName = (room.hostName || '').toLowerCase();
                return hostName.includes(queryLower);
              })
              .map((room) => (
              <div
                key={room.id}
                style={{
                  background: 'white',
                  border: '2px solid #e5e7eb',
                  borderRadius: '0.75rem',
                  padding: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#3b82f6';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginBottom: '0.75rem'
                  }}>
                    {room.hostPhotoURL ? (
                      <img 
                        src={room.hostPhotoURL} 
                        alt={room.hostName}
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: '2px solid #e5e7eb'
                        }}
                      />
                    ) : (
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.5rem',
                        fontWeight: 'bold',
                        color: '#6b7280'
                      }}>
                        {room.hostName[0]?.toUpperCase() || 'H'}
                      </div>
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: '0.25rem'
                      }}>
                        <h4 style={{
                          fontSize: '1.125rem',
                          fontWeight: 'bold',
                          margin: 0,
                          color: '#374151'
                        }}>
                          {room.hostName}
                        </h4>
                        <span style={{
                          background: '#f3f4f6',
                          color: '#6b7280',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: '500'
                        }}>
                          Lv. {room.hostLevel}
                        </span>
                      </div>
                      <div style={{
                        fontSize: '0.875rem',
                        color: '#6b7280',
                        marginBottom: '0.5rem'
                      }}>
                        {room.participants.length}/{room.maxParticipants} players • 
                        Status: <span style={{
                          color: room.status === 'waiting' ? '#10b981' : '#f59e0b',
                          fontWeight: '500'
                        }}>
                          {room.status === 'waiting' ? 'Waiting' : 'In Progress'}
                        </span>
                        {room.participants.includes(currentUser?.uid || '') && (
                          <span style={{
                            marginLeft: '0.5rem',
                            padding: '0.25rem 0.5rem',
                            background: '#10b981',
                            color: 'white',
                            borderRadius: '0.25rem',
                            fontSize: '0.75rem',
                            fontWeight: '600'
                          }}>
                            🔄 You're in this battle
                          </span>
                        )}
                        {room.riskLevel && (
                          <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>
                            • Risk: <span style={{ 
                              color: room.riskLevel === 'easy' ? '#22c55e' : room.riskLevel === 'medium' ? '#fbbf24' : '#ef4444',
                              fontWeight: 'bold'
                            }}>
                              {room.riskLevel.toUpperCase()} ({room.riskPercentage}%)
                            </span>
                          </span>
                        )}
                      </div>
                      {room.opponent && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          fontSize: '0.875rem',
                          color: '#6b7280',
                          background: '#f9fafb',
                          padding: '0.5rem',
                          borderRadius: '0.5rem'
                        }}>
                          <span>⚔️</span>
                          <span>Opponent: {room.opponent.name} (Lv. {room.opponent.level})</span>
                          <span style={{ marginLeft: 'auto' }}>
                            PP: {room.opponent.currentPP}/{room.opponent.maxPP} • 
                            🛡️ {room.opponent.shieldStrength}/{room.opponent.maxShieldStrength}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => joinBattleRoom(room.id)}
                  disabled={loading}
                  style={{
                    background: room.participants.includes(currentUser?.uid || '')
                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                      : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.5rem',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    opacity: loading ? 0.6 : 1
                  }}
                >
                  {loading ? 'Joining...' : 
                    room.participants.includes(currentUser?.uid || '') 
                      ? '🔄 Rejoin Battle' 
                      : room.status === 'in-progress' 
                        ? '❌ Battle Full' 
                        : 'Join Battle'
                  }
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(battleRooms.length === 0 || (searchQuery && battleRooms.filter(room => 
        (room.hostName || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
      ).length === 0)) && !showWaitingRoom && (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          background: 'linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)',
          borderRadius: '0.75rem',
          border: '2px dashed #d1d5db',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ 
            fontSize: '4rem', 
            marginBottom: '1rem',
            animation: 'pulse 2s infinite'
          }}>🏟️</div>
          <h3 style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#374151',
            marginBottom: '0.75rem'
          }}>
            {searchQuery ? `No rooms found matching "${searchQuery}"` : 'No Battle Rooms Available'}
          </h3>
          <p style={{ 
            color: '#6b7280', 
            marginBottom: '1.5rem',
            fontSize: '1.125rem'
          }}>
            {searchQuery 
              ? 'Try a different search term or create your own battle room!'
              : 'Be the first to create a battle room and challenge other players!'
            }
          </p>
          {!searchQuery && (
            <div style={{
              display: 'inline-block',
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '1rem',
              transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
            }}
            onClick={() => setShowRiskSelection(true)}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
            }}
            >
              ➕ Create Your First Room
            </div>
          )}
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '1rem',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                marginTop: '0.5rem'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(59, 130, 246, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.3)';
              }}
            >
              🔄 Clear Search
            </button>
          )}
          <style>{`
            @keyframes pulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.1); opacity: 0.8; }
            }
          `}</style>
        </div>
      )}

      {/* Waiting Room Modal */}
      {showWaitingRoom && currentRoom && (
        <WaitingRoomModal
          isOpen={showWaitingRoom}
          onLeaveRoom={leaveBattleRoom}
          currentRoom={currentRoom}
          onOpponentJoined={handleOpponentJoined}
          currentUserPhotoURL={currentUser?.photoURL || null}
          currentUserName={currentUser?.displayName || currentUser?.email || 'You'}
          currentUserLevel={userLevel}
        />
      )}

      {/* Reward Spin Modal */}
      <PvPRewardSpin
        isOpen={showRewardSpin}
        onClose={() => {
          setShowRewardSpin(false);
          setCurrentRoom(null);
        }}
        isWinner={isWinner}
        baseReward={rewardAmount}
        riskPercentage={currentRoom?.riskPercentage || 10}
      />

      {/* Leave Battle Confirmation Modal */}
      {showLeaveConfirm && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999999,
            animation: 'fadeIn 0.2s ease-in'
          }}
          onClick={() => {
            console.log('PvP Battle: Modal backdrop clicked, closing modal');
            setShowLeaveConfirm(false);
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '1rem',
              padding: '2rem',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
              zIndex: 10000000,
              animation: 'slideInUp 0.3s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
              color: '#1f2937'
            }}>
              🚪 Leave Battle?
            </h3>
            <p style={{
              fontSize: '1rem',
              marginBottom: '1.5rem',
              color: '#6b7280',
              lineHeight: '1.5'
            }}>
              Are you sure you want to leave the battle? You can rejoin later, but your opponent may continue.
            </p>
            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setShowLeaveConfirm(false)}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: '#f3f4f6',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  color: '#374151',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#e5e7eb';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f3f4f6';
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmLeaveBattle}
                style={{
                  padding: '0.75rem 1.5rem',
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  border: 'none',
                  borderRadius: '0.5rem',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  transition: 'all 0.2s',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.4)';
                  e.currentTarget.style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                Leave Battle
              </button>
            </div>
          </div>
          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideInUp {
              from { transform: translateY(20px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
            }
          `}</style>
        </div>,
        document.body
      )}
    </div>
  );
};

export default PvPBattle;
