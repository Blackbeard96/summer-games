import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../firebase';
import { 
  doc, 
  collection, 
  getDoc, 
  setDoc, 
  updateDoc, 
  addDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Vault, 
  Move, 
  ActionCard, 
  BattleState, 
  BattleParticipant, 
  BattleMove, 
  BattleLobby, 
  OfflineMove,
  BATTLE_CONSTANTS,
  MOVE_TEMPLATES,
  ACTION_CARD_TEMPLATES
} from '../types/battle';

interface BattleContextType {
  // Vault Management
  vault: Vault | null;
  updateVault: (updates: Partial<Vault>) => Promise<void>;
  payDues: () => Promise<void>;
  syncVaultPP: () => Promise<void>;
  
  // Move Management
  moves: Move[];
  unlockMove: (moveId: string) => Promise<void>;
  upgradeMove: (moveId: string) => Promise<void>;
  
  // Action Card Management
  actionCards: ActionCard[];
  unlockActionCard: (cardId: string) => Promise<void>;
  useActionCard: (cardId: string) => Promise<void>;
  
  // Battle Management
  currentBattle: BattleState | null;
  battleLobbies: BattleLobby[];
  offlineMoves: OfflineMove[];
  createBattle: (type: 'live' | 'vault_siege', settings?: any) => Promise<string>;
  joinBattle: (battleId: string) => Promise<void>;
  leaveBattle: (battleId: string) => Promise<void>;
  submitMove: (moveId: string, targetUserId?: string, actionCardId?: string) => Promise<void>;
  
  // Offline Moves
  submitOfflineMove: (type: OfflineMove['type'], targetUserId?: string, moveId?: string) => Promise<void>;
  getRemainingOfflineMoves: () => number;
  
  // Loading States
  loading: boolean;
  error: string | null;
}

const BattleContext = createContext<BattleContextType | undefined>(undefined);

export const useBattle = () => {
  const context = useContext(BattleContext);
  if (context === undefined) {
    throw new Error('useBattle must be used within a BattleProvider');
  }
  return context;
};

export const BattleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [vault, setVault] = useState<Vault | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [actionCards, setActionCards] = useState<ActionCard[]>([]);
  const [currentBattle, setCurrentBattle] = useState<BattleState | null>(null);
  const [battleLobbies, setBattleLobbies] = useState<BattleLobby[]>([]);
  const [offlineMoves, setOfflineMoves] = useState<OfflineMove[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize user's battle data
  useEffect(() => {
    if (!currentUser) return;

    const initializeBattleData = async () => {
      setLoading(true);
      try {
        // Get player's current PP from student data
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        const playerPP = studentDoc.exists() ? (studentDoc.data().powerPoints || 0) : 0;
        
        console.log('BattleContext: Player PP from student data:', playerPP);
        
        // Initialize or fetch vault
        const vaultRef = doc(db, 'vaults', currentUser.uid);
        const vaultDoc = await getDoc(vaultRef);
        
        if (!vaultDoc.exists()) {
          // Create new vault with player's current PP
          const newVault: Vault = {
            id: currentUser.uid,
            ownerId: currentUser.uid,
            capacity: 1000,
            currentPP: playerPP,
            shieldStrength: BATTLE_CONSTANTS.BASE_SHIELD_STRENGTH,
            maxShieldStrength: BATTLE_CONSTANTS.BASE_SHIELD_STRENGTH,
            firewall: 10,
            lastUpgrade: new Date(),
            debtStatus: false,
            debtAmount: 0,
            lastDuesPaid: new Date(),
          };
          console.log('BattleContext: Creating new vault with PP:', playerPP);
          await setDoc(vaultRef, newVault);
          setVault(newVault);
        } else {
          const existingVault = vaultDoc.data() as Vault;
          console.log('BattleContext: Existing vault PP:', existingVault.currentPP, 'Player PP:', playerPP);
          
          // Always update vault PP to match player's current PP
          if (existingVault.currentPP !== playerPP) {
            console.log('BattleContext: Syncing vault PP from', existingVault.currentPP, 'to', playerPP);
            await updateDoc(vaultRef, { currentPP: playerPP });
            setVault({ ...existingVault, currentPP: playerPP });
          } else {
            setVault(existingVault);
          }
        }

        // Initialize or fetch moves
        const movesRef = doc(db, 'users', currentUser.uid, 'battle', 'moves');
        const movesDoc = await getDoc(movesRef);
        
        if (!movesDoc.exists()) {
          // Create initial moves
          const initialMoves: Move[] = MOVE_TEMPLATES.map((template, index) => ({
            ...template,
            id: `move_${index + 1}`,
            unlocked: index < 2, // First 2 moves unlocked by default
            currentCooldown: 0,
            masteryLevel: 1,
          }));
          await setDoc(movesRef, { moves: initialMoves });
          setMoves(initialMoves);
        } else {
          setMoves(movesDoc.data().moves || []);
        }

        // Initialize or fetch action cards
        const cardsRef = doc(db, 'users', currentUser.uid, 'battle', 'actionCards');
        const cardsDoc = await getDoc(cardsRef);
        
        if (!cardsDoc.exists()) {
          // Create initial action cards
          const initialCards: ActionCard[] = ACTION_CARD_TEMPLATES.map((template, index) => ({
            ...template,
            id: `card_${index + 1}`,
            unlocked: index < 2, // First 2 cards unlocked by default
          }));
          await setDoc(cardsRef, { cards: initialCards });
          setActionCards(initialCards);
        } else {
          setActionCards(cardsDoc.data().cards || []);
        }

      } catch (err) {
        console.error('Error initializing battle data:', err);
        setError('Failed to initialize battle data');
      } finally {
        setLoading(false);
      }
    };

    initializeBattleData();
  }, [currentUser]);

  // Listen for vault updates and sync with player PP
  useEffect(() => {
    if (!currentUser) return;

    const vaultRef = doc(db, 'vaults', currentUser.uid);
    const studentRef = doc(db, 'students', currentUser.uid);
    
    const unsubscribeVault = onSnapshot(vaultRef, (vaultDoc) => {
      if (vaultDoc.exists()) {
        setVault(vaultDoc.data() as Vault);
      }
    });

    const unsubscribeStudent = onSnapshot(studentRef, (studentDoc) => {
      if (studentDoc.exists() && vault) {
        const playerPP = studentDoc.data().powerPoints || 0;
        const vaultPP = vault.currentPP;
        
        // Sync vault PP with player PP if they differ
        if (playerPP !== vaultPP) {
          updateDoc(vaultRef, { currentPP: playerPP });
        }
      }
    });

    return () => {
      unsubscribeVault();
      unsubscribeStudent();
    };
  }, [currentUser, vault]);

  // Listen for battle lobbies
  useEffect(() => {
    if (!currentUser) return;

    const lobbiesQuery = query(
      collection(db, 'battleLobbies'),
      where('status', 'in', ['waiting', 'starting']),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(lobbiesQuery, (snapshot) => {
      const lobbies: BattleLobby[] = [];
      snapshot.forEach((doc) => {
        lobbies.push({ id: doc.id, ...doc.data() } as BattleLobby);
      });
      setBattleLobbies(lobbies);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Listen for offline moves
  useEffect(() => {
    if (!currentUser) return;

    const movesQuery = query(
      collection(db, 'offlineMoves'),
      where('userId', '==', currentUser.uid),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );
    
    const unsubscribe = onSnapshot(movesQuery, (snapshot) => {
      const moves: OfflineMove[] = [];
      snapshot.forEach((doc) => {
        moves.push({ id: doc.id, ...doc.data() } as OfflineMove);
      });
      setOfflineMoves(moves);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Vault Management
  const updateVault = async (updates: Partial<Vault>) => {
    if (!currentUser || !vault) return;
    
    try {
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      await updateDoc(vaultRef, updates);
      
      // If PP is being updated, also update the player's PP in student data
      if (updates.currentPP !== undefined) {
        const studentRef = doc(db, 'students', currentUser.uid);
        await updateDoc(studentRef, { powerPoints: updates.currentPP });
      }
    } catch (err) {
      console.error('Error updating vault:', err);
      setError('Failed to update vault');
    }
  };

  const payDues = async () => {
    if (!currentUser || !vault) return;
    
    try {
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      await updateDoc(vaultRef, {
        debtStatus: false,
        debtAmount: 0,
        lastDuesPaid: new Date(),
      });
    } catch (err) {
      console.error('Error paying dues:', err);
      setError('Failed to pay dues');
    }
  };

  const syncVaultPP = async () => {
    if (!currentUser) return;
    
    try {
      // Get current player PP
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      const playerPP = studentDoc.exists() ? (studentDoc.data().powerPoints || 0) : 0;
      
      console.log('BattleContext: Manual sync - Player PP:', playerPP, 'Vault PP:', vault?.currentPP);
      
      // Update vault PP to match player PP
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      await updateDoc(vaultRef, { currentPP: playerPP });
      
      console.log('BattleContext: Vault PP synced to:', playerPP);
    } catch (err) {
      console.error('Error syncing vault PP:', err);
      setError('Failed to sync vault PP');
    }
  };

  // Move Management
  const unlockMove = async (moveId: string) => {
    if (!currentUser) return;
    
    try {
      const movesRef = doc(db, 'users', currentUser.uid, 'battle', 'moves');
      const updatedMoves = moves.map(move => 
        move.id === moveId ? { ...move, unlocked: true } : move
      );
      await updateDoc(movesRef, { moves: updatedMoves });
      setMoves(updatedMoves);
    } catch (err) {
      console.error('Error unlocking move:', err);
      setError('Failed to unlock move');
    }
  };

  const upgradeMove = async (moveId: string) => {
    if (!currentUser) return;
    
    try {
      const movesRef = doc(db, 'users', currentUser.uid, 'battle', 'moves');
      const updatedMoves = moves.map(move => 
        move.id === moveId && move.masteryLevel < 5 
          ? { ...move, masteryLevel: move.masteryLevel + 1 } 
          : move
      );
      await updateDoc(movesRef, { moves: updatedMoves });
      setMoves(updatedMoves);
    } catch (err) {
      console.error('Error upgrading move:', err);
      setError('Failed to upgrade move');
    }
  };

  // Action Card Management
  const unlockActionCard = async (cardId: string) => {
    if (!currentUser) return;
    
    try {
      const cardsRef = doc(db, 'users', currentUser.uid, 'battle', 'actionCards');
      const updatedCards = actionCards.map(card => 
        card.id === cardId ? { ...card, unlocked: true } : card
      );
      await updateDoc(cardsRef, { cards: updatedCards });
      setActionCards(updatedCards);
    } catch (err) {
      console.error('Error unlocking action card:', err);
      setError('Failed to unlock action card');
    }
  };

  const useActionCard = async (cardId: string) => {
    if (!currentUser) return;
    
    try {
      const cardsRef = doc(db, 'users', currentUser.uid, 'battle', 'actionCards');
      const updatedCards = actionCards.map(card => 
        card.id === cardId && card.uses > 0 
          ? { ...card, uses: card.uses - 1 } 
          : card
      );
      await updateDoc(cardsRef, { cards: updatedCards });
      setActionCards(updatedCards);
    } catch (err) {
      console.error('Error using action card:', err);
      setError('Failed to use action card');
    }
  };

  // Battle Management
  const createBattle = async (type: 'live' | 'vault_siege', settings?: any): Promise<string> => {
    if (!currentUser) throw new Error('User not authenticated');
    
    try {
      const battleData: Omit<BattleLobby, 'id'> = {
        name: `${currentUser.displayName}'s ${type === 'live' ? 'Battle' : 'Siege'}`,
        type,
        hostId: currentUser.uid,
        hostName: currentUser.displayName || 'Unknown',
        participants: [currentUser.uid],
        maxParticipants: type === 'live' ? 2 : 1,
        settings: {
          timeLimit: type === 'live' ? 300 : undefined, // 5 minutes for live battles
          maxTurns: type === 'vault_siege' ? 10 : undefined,
          allowActionCards: true,
          allowSpectators: false,
          ...settings,
        },
        status: 'waiting',
        createdAt: new Date(),
      };
      
      const docRef = await addDoc(collection(db, 'battleLobbies'), battleData);
      return docRef.id;
    } catch (err) {
      console.error('Error creating battle:', err);
      setError('Failed to create battle');
      throw err;
    }
  };

  const joinBattle = async (battleId: string) => {
    if (!currentUser) return;
    
    try {
      const lobbyRef = doc(db, 'battleLobbies', battleId);
      const lobbyDoc = await getDoc(lobbyRef);
      
      if (!lobbyDoc.exists()) {
        throw new Error('Battle not found');
      }
      
      const lobby = lobbyDoc.data() as BattleLobby;
      if (lobby.participants.includes(currentUser.uid)) {
        throw new Error('Already in this battle');
      }
      
      if (lobby.participants.length >= lobby.maxParticipants) {
        throw new Error('Battle is full');
      }
      
      await updateDoc(lobbyRef, {
        participants: [...lobby.participants, currentUser.uid],
      });
    } catch (err) {
      console.error('Error joining battle:', err);
      setError('Failed to join battle');
    }
  };

  const leaveBattle = async (battleId: string) => {
    if (!currentUser) return;
    
    try {
      const lobbyRef = doc(db, 'battleLobbies', battleId);
      const lobbyDoc = await getDoc(lobbyRef);
      
      if (!lobbyDoc.exists()) return;
      
      const lobby = lobbyDoc.data() as BattleLobby;
      const updatedParticipants = lobby.participants.filter(id => id !== currentUser.uid);
      
      if (updatedParticipants.length === 0) {
        // Delete the lobby if no participants remain
        await updateDoc(lobbyRef, { status: 'cancelled' });
      } else {
        await updateDoc(lobbyRef, { participants: updatedParticipants });
      }
    } catch (err) {
      console.error('Error leaving battle:', err);
      setError('Failed to leave battle');
    }
  };

  const submitMove = async (moveId: string, targetUserId?: string, actionCardId?: string) => {
    if (!currentUser || !currentBattle) return;
    
    try {
      const moveData: Omit<BattleMove, 'id'> = {
        battleId: currentBattle.id,
        userId: currentUser.uid,
        moveId,
        actionCardId,
        targetUserId,
        turnNumber: currentBattle.currentTurn,
        timestamp: new Date(),
        result: {
          success: false,
          message: 'Move processing...',
        },
      };
      
      await addDoc(collection(db, 'battleMoves'), moveData);
    } catch (err) {
      console.error('Error submitting move:', err);
      setError('Failed to submit move');
    }
  };

  // Offline Moves
  const submitOfflineMove = async (type: OfflineMove['type'], targetUserId?: string, moveId?: string) => {
    if (!currentUser) return;
    
    try {
      const moveData: Omit<OfflineMove, 'id'> = {
        userId: currentUser.uid,
        type,
        targetUserId,
        moveId,
        status: 'pending',
        createdAt: new Date(),
      };
      
      await addDoc(collection(db, 'offlineMoves'), moveData);
    } catch (err) {
      console.error('Error submitting offline move:', err);
      setError('Failed to submit offline move');
    }
  };

  const getRemainingOfflineMoves = (): number => {
    if (!currentUser) return 0;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayMoves = offlineMoves.filter(move => {
      const moveDate = new Date(move.createdAt);
      moveDate.setHours(0, 0, 0, 0);
      return moveDate.getTime() === today.getTime();
    });
    
    return Math.max(0, BATTLE_CONSTANTS.DAILY_OFFLINE_MOVES - todayMoves.length);
  };

  const value: BattleContextType = {
    vault,
    updateVault,
    payDues,
    syncVaultPP,
    moves,
    unlockMove,
    upgradeMove,
    actionCards,
    unlockActionCard,
    useActionCard,
    currentBattle,
    battleLobbies,
    offlineMoves,
    createBattle,
    joinBattle,
    leaveBattle,
    submitMove,
    submitOfflineMove,
    getRemainingOfflineMoves,
    loading,
    error,
  };

  return (
    <BattleContext.Provider value={value}>
      {children}
    </BattleContext.Provider>
  );
}; 