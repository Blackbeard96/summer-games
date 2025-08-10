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
  VaultSiegeAttack,
  BATTLE_CONSTANTS,
  MOVE_TEMPLATES,
  ACTION_CARD_TEMPLATES,
  MOVE_DAMAGE_VALUES
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
  attackHistory: VaultSiegeAttack[];
  createBattle: (type: 'live' | 'vault_siege', settings?: any) => Promise<string>;
  joinBattle: (battleId: string) => Promise<void>;
  leaveBattle: (battleId: string) => Promise<void>;
  submitMove: (moveId: string, targetUserId?: string, actionCardId?: string) => Promise<void>;
  executeVaultSiegeAttack: (moveId: string, targetUserId: string, actionCardId?: string) => Promise<void>;
  
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
  const [attackHistory, setAttackHistory] = useState<VaultSiegeAttack[]>([]);
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

        // Initialize or fetch moves - use a simpler approach
        const movesRef = doc(db, 'battleMoves', currentUser.uid);
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
          console.log('BattleContext: Creating initial moves:', initialMoves);
          await setDoc(movesRef, { moves: initialMoves });
          setMoves(initialMoves);
        } else {
          const movesData = movesDoc.data().moves || [];
          console.log('BattleContext: Loading existing moves:', movesData);
          setMoves(movesData);
        }

        // Initialize or fetch action cards - use a simpler approach
        const cardsRef = doc(db, 'battleActionCards', currentUser.uid);
        const cardsDoc = await getDoc(cardsRef);
        
        if (!cardsDoc.exists()) {
          // Create initial action cards
          const initialCards: ActionCard[] = ACTION_CARD_TEMPLATES.map((template, index) => ({
            ...template,
            id: `card_${index + 1}`,
            unlocked: index < 2, // First 2 cards unlocked by default
          }));
          console.log('BattleContext: Creating initial action cards:', initialCards);
          await setDoc(cardsRef, { cards: initialCards });
          setActionCards(initialCards);
        } else {
          const cardsData = cardsDoc.data().cards || [];
          console.log('BattleContext: Loading existing action cards:', cardsData);
          setActionCards(cardsData);
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

  // Listen for battle lobbies - simplified to avoid index requirements
  useEffect(() => {
    if (!currentUser) return;

    console.log('BattleContext: Setting up battle lobbies listener');
    
    const lobbiesQuery = query(
      collection(db, 'battleLobbies'),
      where('status', 'in', ['waiting', 'starting'])
    );
    
    const unsubscribe = onSnapshot(lobbiesQuery, (snapshot) => {
      const lobbies: BattleLobby[] = [];
      snapshot.forEach((doc) => {
        const lobbyData = { id: doc.id, ...doc.data() } as BattleLobby;
        console.log('BattleContext: Found battle lobby:', lobbyData);
        lobbies.push(lobbyData);
      });
      console.log('BattleContext: Setting battle lobbies:', lobbies);
      setBattleLobbies(lobbies);
    }, (error) => {
      console.error('BattleContext: Error listening to battle lobbies:', error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Listen for offline moves - simplified to avoid index requirements
  useEffect(() => {
    if (!currentUser) return;

    console.log('BattleContext: Setting up offline moves listener');
    
    const movesQuery = query(
      collection(db, 'offlineMoves'),
      where('userId', '==', currentUser.uid),
      where('status', '==', 'pending')
    );
    
    const unsubscribe = onSnapshot(movesQuery, (snapshot) => {
      const moves: OfflineMove[] = [];
      snapshot.forEach((doc) => {
        const moveData = { id: doc.id, ...doc.data() } as OfflineMove;
        console.log('BattleContext: Found offline move:', moveData);
        moves.push(moveData);
      });
      console.log('BattleContext: Setting offline moves:', moves);
      setOfflineMoves(moves);
    }, (error) => {
      console.error('BattleContext: Error listening to offline moves:', error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Listen for attack history (attacks by or against current user)
  useEffect(() => {
    if (!currentUser) return;

    console.log('BattleContext: Setting up attack history listener');
    
    const attacksQuery = query(
      collection(db, 'vaultSiegeAttacks'),
      where('attackerId', '==', currentUser.uid)
    );
    
    const targetAttacksQuery = query(
      collection(db, 'vaultSiegeAttacks'),
      where('targetId', '==', currentUser.uid)
    );
    
    const unsubscribeAttacks = onSnapshot(attacksQuery, (snapshot) => {
      const attacks: VaultSiegeAttack[] = [];
      snapshot.forEach((doc) => {
        const attackData = { id: doc.id, ...doc.data() } as VaultSiegeAttack;
        console.log('BattleContext: Found attack by user:', attackData);
        attacks.push(attackData);
      });
      console.log('BattleContext: Setting attacks by user:', attacks);
      setAttackHistory(prev => [...prev.filter(a => a.attackerId === currentUser.uid), ...attacks]);
    });

    const unsubscribeTargetAttacks = onSnapshot(targetAttacksQuery, (snapshot) => {
      const attacks: VaultSiegeAttack[] = [];
      snapshot.forEach((doc) => {
        const attackData = { id: doc.id, ...doc.data() } as VaultSiegeAttack;
        console.log('BattleContext: Found attack against user:', attackData);
        attacks.push(attackData);
      });
      console.log('BattleContext: Setting attacks against user:', attacks);
      setAttackHistory(prev => [...prev.filter(a => a.targetId === currentUser.uid), ...attacks]);
    });

    return () => {
      unsubscribeAttacks();
      unsubscribeTargetAttacks();
    };
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
      console.log('Creating battle with type:', type);
      console.log('Current user:', currentUser.uid, currentUser.displayName);
      
      const battleData = {
        name: `${currentUser.displayName || 'Unknown'}'s ${type === 'live' ? 'Battle' : 'Siege'}`,
        type,
        hostId: currentUser.uid,
        hostName: currentUser.displayName || 'Unknown',
        participants: [currentUser.uid],
        maxParticipants: type === 'live' ? 2 : 1,
        settings: {
          allowActionCards: true,
          allowSpectators: false,
          ...settings,
        },
        status: 'waiting',
        createdAt: serverTimestamp(),
      };
      
      // Add conditional fields to avoid undefined values
      if (type === 'live') {
        battleData.settings.timeLimit = 300; // 5 minutes for live battles
      } else if (type === 'vault_siege') {
        battleData.settings.maxTurns = 10;
      }
      
      console.log('Battle data to save:', battleData);
      
      const docRef = await addDoc(collection(db, 'battleLobbies'), battleData);
      console.log('Battle created successfully with ID:', docRef.id);
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

  const executeVaultSiegeAttack = async (moveId: string, targetUserId: string, actionCardId?: string) => {
    if (!currentUser || !vault) return;
    
    try {
      console.log('Executing vault siege attack:', { moveId, targetUserId, actionCardId });
      
      // Get target vault
      const targetVaultRef = doc(db, 'vaults', targetUserId);
      const targetVaultDoc = await getDoc(targetVaultRef);
      
      if (!targetVaultDoc.exists()) {
        throw new Error('Target vault not found');
      }
      
      const targetVaultData = targetVaultDoc.data() as Vault;
      
      // Get the move data
      const selectedMove = moves.find(m => m.id === moveId);
      const selectedCard = actionCardId ? actionCards.find(c => c.id === actionCardId) : null;
      
      if (!selectedMove && !selectedCard) {
        throw new Error('No move or action card selected');
      }
      
      // Calculate attack results
      let damage = 0;
      let ppStolen = 0;
      let shieldDamage = 0;
      let message = '';
      
      if (selectedMove) {
        // Get move damage values
        const moveDamage = MOVE_DAMAGE_VALUES[selectedMove.name];
        if (moveDamage) {
          shieldDamage = moveDamage.shieldDamage;
          
          // Check if shields are down or if this attack will break them
          const remainingShieldAfterAttack = Math.max(0, targetVaultData.shieldStrength - shieldDamage);
          
          if (remainingShieldAfterAttack === 0 && targetVaultData.shieldStrength > 0) {
            // Shields will be broken, can steal PP
            const excessDamage = shieldDamage - targetVaultData.shieldStrength;
            if (excessDamage > 0) {
              // Some damage goes to PP after breaking shields
              ppStolen = Math.min(moveDamage.ppSteal, targetVaultData.currentPP);
            } else {
              // Just broke shields, can steal PP
              ppStolen = Math.min(moveDamage.ppSteal, targetVaultData.currentPP);
            }
            message = `Used ${selectedMove.name} - Broke shields and stole ${ppStolen} PP`;
          } else if (targetVaultData.shieldStrength === 0) {
            // No shields, can steal PP directly
            ppStolen = Math.min(moveDamage.ppSteal, targetVaultData.currentPP);
            message = `Used ${selectedMove.name} - Stole ${ppStolen} PP (no shields)`;
          } else {
            // Shields still up, only damage shields
            message = `Used ${selectedMove.name} - Damaged shields by ${shieldDamage}`;
          }
        } else {
          message = `Used ${selectedMove.name} against target vault`;
        }
      }
      
      if (selectedCard) {
        // Process action card
        switch (selectedCard.effect.type) {
          case 'shield_breach':
            shieldDamage += selectedCard.effect.strength; // Add to existing shield damage
            message += ` • Used ${selectedCard.name} to breach shields (+${selectedCard.effect.strength} shield damage)`;
            break;
          case 'teleport_pp':
            ppStolen = Math.min(selectedCard.effect.strength, targetVaultData.currentPP);
            message += ` • Used ${selectedCard.name} to steal PP`;
            break;
          default:
            message += ` • Used ${selectedCard.name}`;
        }
      }
      
      // Apply damage to target vault
      const updates: Partial<Vault> = {};
      
      if (shieldDamage > 0) {
        updates.shieldStrength = Math.max(0, targetVaultData.shieldStrength - shieldDamage);
      }
      
      if (ppStolen > 0) {
        updates.currentPP = Math.max(0, targetVaultData.currentPP - ppStolen);
        // Add stolen PP to attacker's vault
        const newAttackerPP = vault.currentPP + ppStolen;
        await updateDoc(doc(db, 'vaults', currentUser.uid), {
          currentPP: newAttackerPP
        });
        
        // Also update the student document to sync PP
        await updateDoc(doc(db, 'students', currentUser.uid), {
          powerPoints: newAttackerPP
        });
        
        // Update target's student document to reflect PP loss
        await updateDoc(doc(db, 'students', targetUserId), {
          powerPoints: updates.currentPP
        });
        
        console.log('Updated attacker PP from', vault.currentPP, 'to', newAttackerPP);
        console.log('Updated target PP from', targetVaultData.currentPP, 'to', updates.currentPP);
      }
      
      // Update target vault
      if (Object.keys(updates).length > 0) {
        await updateDoc(targetVaultRef, updates);
      }
      
      // Get player names for the attack record
      const attackerName = currentUser.displayName || 'Unknown';
      const targetStudentDoc = await getDoc(doc(db, 'students', targetUserId));
      const targetName = targetStudentDoc.exists() ? targetStudentDoc.data().displayName || 'Unknown' : 'Unknown';
      
      // Record the attack with detailed information
      const attackData: any = {
        attackerId: currentUser.uid,
        attackerName,
        targetId: targetUserId,
        targetName,
        moveId,
        moveName: selectedMove?.name,
        damage,
        ppStolen,
        shieldDamage,
        message,
        timestamp: serverTimestamp(),
        targetVaultBefore: {
          currentPP: targetVaultData.currentPP,
          shieldStrength: targetVaultData.shieldStrength,
        },
        targetVaultAfter: {
          currentPP: updates.currentPP !== undefined ? updates.currentPP : targetVaultData.currentPP,
          shieldStrength: updates.shieldStrength !== undefined ? updates.shieldStrength : targetVaultData.shieldStrength,
        },
      };
      
      // Only add actionCardId if it has a value
      if (actionCardId) {
        attackData.actionCardId = actionCardId;
        attackData.actionCardName = selectedCard?.name;
      }
      
      await addDoc(collection(db, 'vaultSiegeAttacks'), attackData);
      
      console.log('Vault siege attack completed:', attackData);
      
    } catch (err) {
      console.error('Error executing vault siege attack:', err);
      throw err;
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
    
    // Count offline moves
    const todayOfflineMoves = offlineMoves.filter(move => {
      const moveDate = new Date(move.createdAt);
      moveDate.setHours(0, 0, 0, 0);
      return moveDate.getTime() === today.getTime();
    });
    
    // Count vault siege attacks (these also consume offline moves)
    const todayVaultSiegeAttacks = attackHistory.filter(attack => {
      if (!attack.timestamp) return false; // Skip attacks without timestamps
      
      try {
        const attackDate = new Date((attack.timestamp as any).toDate ? (attack.timestamp as any).toDate() : attack.timestamp);
        attackDate.setHours(0, 0, 0, 0);
        return attackDate.getTime() === today.getTime() && attack.attackerId === currentUser.uid;
      } catch (error) {
        console.error('Error processing attack timestamp:', error, attack);
        return false; // Skip attacks with invalid timestamps
      }
    });
    
    const totalMovesUsed = todayOfflineMoves.length + todayVaultSiegeAttacks.length;
    
    return Math.max(0, BATTLE_CONSTANTS.DAILY_OFFLINE_MOVES - totalMovesUsed);
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
    attackHistory,
    createBattle,
    joinBattle,
    leaveBattle,
    submitMove,
    executeVaultSiegeAttack,
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