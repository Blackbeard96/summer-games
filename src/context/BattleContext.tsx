import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { db } from '../firebase';
import { 
  doc, 
  collection, 
  getDoc, 
  getDocs,
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
  unlockElementalMoves: (elementalAffinity: string) => Promise<void>;
  forceUnlockAllMoves: (userElement?: string) => Promise<void>;
  resetMovesWithElementFilter: (userElement?: string) => Promise<void>;
  applyElementFilterToExistingMoves: (userElement?: string) => Promise<void>;
  forceMigration: () => Promise<void>;
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
  executeVaultSiegeAttack: (moveId: string | null, targetUserId: string, actionCardId?: string) => Promise<void>;
  executePPRestore: () => Promise<{ success: boolean; restored?: number; totalStolen?: number; message?: string }>;
  
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
        // Get player's current PP and manifest from student data
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        const playerPP = studentDoc.exists() ? (studentDoc.data().powerPoints || 0) : 0;
        const userManifest = studentDoc.exists() ? (studentDoc.data().manifest?.manifestId || studentDoc.data().manifestationType || 'reading') : 'reading';
        
        console.log('BattleContext: Player PP from student data:', playerPP);
        console.log('BattleContext: User manifest for move filtering:', userManifest);
        
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
            movesRemaining: BATTLE_CONSTANTS.MOVE_SLOTS_BASE,
            maxMovesPerDay: BATTLE_CONSTANTS.MOVE_SLOTS_BASE,
            lastMoveReset: new Date(),
          };
          console.log('BattleContext: Creating new vault with PP:', playerPP);
          await setDoc(vaultRef, newVault);
          setVault(newVault);
        } else {
          const existingVaultData = vaultDoc.data();
          console.log('BattleContext: Existing vault PP:', existingVaultData.currentPP, 'Player PP:', playerPP);
          
          // Migrate existing vault to include new move tracking fields
          const existingVault: Vault = {
            ...existingVaultData,
            movesRemaining: existingVaultData.movesRemaining || BATTLE_CONSTANTS.MOVE_SLOTS_BASE,
            maxMovesPerDay: existingVaultData.maxMovesPerDay || BATTLE_CONSTANTS.MOVE_SLOTS_BASE,
            lastMoveReset: existingVaultData.lastMoveReset || new Date(),
          } as Vault;
          
          // Check and reset daily moves if needed
          const updatedVault = checkAndResetDailyMoves(existingVault);
          
          // Always update vault PP to match player's current PP
          if (existingVault.currentPP !== playerPP || updatedVault.movesRemaining !== existingVault.movesRemaining) {
            console.log('BattleContext: Syncing vault PP from', existingVault.currentPP, 'to', playerPP);
            await updateDoc(vaultRef, { 
              currentPP: playerPP,
              movesRemaining: updatedVault.movesRemaining,
              lastMoveReset: updatedVault.lastMoveReset
            });
            setVault({ ...updatedVault, currentPP: playerPP });
          } else {
            setVault(updatedVault);
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
            unlocked: template.category === 'system' || 
                      (template.category === 'elemental' && template.level === 1 && template.elementalAffinity === 'fire') || // Only unlock user's element
                      (template.category === 'manifest' && template.manifestType === userManifest), // Only unlock user's manifest
            currentCooldown: 0,
            masteryLevel: 1,
          }));
          console.log('BattleContext: Creating initial moves:', initialMoves);
          await setDoc(movesRef, { moves: initialMoves });
          setMoves(initialMoves);
        } else {
          const movesData = movesDoc.data().moves || [];
          console.log('BattleContext: Loading existing moves:', movesData);
          
          // Check if we need to migrate to new move system
          const hasNewMoves = movesData.some((move: Move) => move.category && move.category !== 'manifest');
          const hasOldGenericMoves = movesData.some((move: Move) => move.name === 'Manifest Strike' || move.name === 'Manifest Shield');
          
          if (!hasNewMoves || hasOldGenericMoves) {
            console.log('BattleContext: Migrating to new move system for existing user');
            console.log('BattleContext: User manifest for migration:', userManifest);
            
            // Create new moves with the updated system
            const newMoves: Move[] = MOVE_TEMPLATES.map((template, index) => {
              const isUnlocked = template.category === 'system' || 
                (template.category === 'elemental' && template.level === 1 && template.elementalAffinity === 'fire') || // Only unlock user's element
                (template.category === 'manifest' && template.manifestType === userManifest); // Only unlock user's manifest
              
              if (template.category === 'manifest') {
                console.log(`BattleContext: Creating manifest move ${template.name} (${template.manifestType}) - unlocked: ${isUnlocked}`);
              }
              
              return {
                ...template,
                id: `move_${index + 1}`,
                unlocked: isUnlocked,
                currentCooldown: 0,
                masteryLevel: 1,
              };
            });
            
            // Update the database with new moves
            await updateDoc(movesRef, { moves: newMoves });
            setMoves(newMoves);
          } else {
            // Apply element-specific filtering to existing moves
            console.log('BattleContext: Applying element-specific filtering to existing moves');
            
            // Get user's element from student data
            const studentRef = doc(db, 'students', currentUser.uid);
            const studentDoc = await getDoc(studentRef);
            const userElement = studentDoc.exists() ? 
              (studentDoc.data().manifestationType?.toLowerCase() || 'fire') : 'fire';
            
            console.log('BattleContext: User element for move filtering:', userElement);
            
            // Update moves with correct element and manifest filtering
            const updatedMoves = movesData.map((move: Move) => {
              if (move.category === 'elemental' && move.level === 1) {
                // Only unlock if it matches user's element
                const shouldUnlock = move.elementalAffinity === userElement;
                console.log(`BattleContext: Move ${move.name} (${move.elementalAffinity}) - should unlock: ${shouldUnlock}`);
                return { ...move, unlocked: shouldUnlock };
              } else if (move.category === 'manifest') {
                // Only unlock if it matches user's manifest
                const shouldUnlock = move.manifestType === userManifest;
                console.log(`BattleContext: Move ${move.name} (${move.manifestType}) - should unlock: ${shouldUnlock}`);
                return { ...move, unlocked: shouldUnlock };
              }
              return move;
            });
            
            // Update the database with filtered moves
            await updateDoc(movesRef, { moves: updatedMoves });
            setMoves(updatedMoves);
          }
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
        setError('Failed to initialize battle data. Please refresh the page or try again later.');
        
        // Set default values to prevent complete failure
        const defaultVault: Vault = {
          id: currentUser.uid,
          ownerId: currentUser.uid,
          capacity: 1000,
          currentPP: 0,
          shieldStrength: BATTLE_CONSTANTS.BASE_SHIELD_STRENGTH,
          maxShieldStrength: BATTLE_CONSTANTS.BASE_SHIELD_STRENGTH,
          firewall: 10,
          lastUpgrade: new Date(),
          debtStatus: false,
          debtAmount: 0,
          lastDuesPaid: new Date(),
          movesRemaining: BATTLE_CONSTANTS.MOVE_SLOTS_BASE,
          maxMovesPerDay: BATTLE_CONSTANTS.MOVE_SLOTS_BASE,
          lastMoveReset: new Date(),
        };
        setVault(defaultVault);
        setMoves(MOVE_TEMPLATES.map((template, index) => ({
          ...template,
          id: `move_${index + 1}`,
          unlocked: template.category === 'system' || 
                    (template.category === 'elemental' && template.level === 1 && template.elementalAffinity === 'fire') || 
                    (template.category === 'manifest' && template.manifestType === 'reading'), // Default to reading for fallback
          currentCooldown: 0,
          masteryLevel: 1,
        })));
        setActionCards(ACTION_CARD_TEMPLATES.map((template, index) => ({
          ...template,
          id: `card_${index + 1}`,
          unlocked: index < 2,
        })));
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

  // Check and reset daily moves if needed
  const checkAndResetDailyMoves = (vaultData: Vault): Vault => {
    const now = new Date();
    const lastReset = vaultData.lastMoveReset instanceof Date ? vaultData.lastMoveReset : new Date(vaultData.lastMoveReset);
    const daysSinceReset = Math.floor((now.getTime() - lastReset.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceReset >= 1) {
      // Reset moves for new day
      return {
        ...vaultData,
        movesRemaining: vaultData.maxMovesPerDay,
        lastMoveReset: now,
      };
    }
    return vaultData;
  };

  // Move Management
  const unlockMove = async (moveId: string) => {
    if (!currentUser) return;
    
    try {
      const movesRef = doc(db, 'battleMoves', currentUser.uid);
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

  // Unlock elemental moves based on user's element
  const unlockElementalMoves = async (elementalAffinity: string) => {
    if (!currentUser) return;
    
    try {
      console.log(`Unlocking ${elementalAffinity} elemental moves for user`);
      
      const movesRef = doc(db, 'battleMoves', currentUser.uid);
      const updatedMoves = moves.map(move => {
        // Unlock level 1 moves for the user's element
        if (move.category === 'elemental' && 
            move.elementalAffinity === elementalAffinity && 
            move.level === 1) {
          return { ...move, unlocked: true };
        }
        return move;
      });
      
      await updateDoc(movesRef, { moves: updatedMoves });
      setMoves(updatedMoves);
      
      console.log(`Successfully unlocked ${elementalAffinity} elemental moves`);
    } catch (err) {
      console.error('Error unlocking elemental moves:', err);
      setError('Failed to unlock elemental moves');
    }
  };

  // Force unlock all basic moves (for debugging)
  const forceUnlockAllMoves = async (userElement: string = 'fire') => {
    if (!currentUser) return;
    
    try {
      console.log('Force unlocking all basic moves for user element:', userElement);
      
      const movesRef = doc(db, 'battleMoves', currentUser.uid);
      const updatedMoves = moves.map(move => {
        // Unlock manifest, system, and level 1 elemental moves for user's element only
        if (move.category === 'manifest' || 
            move.category === 'system' || 
            (move.category === 'elemental' && move.level === 1 && move.elementalAffinity === userElement)) {
          return { ...move, unlocked: true };
        } else if (move.category === 'elemental' && move.level === 1) {
          // Lock all other elemental moves
          return { ...move, unlocked: false };
        }
        return move;
      });
      
      await updateDoc(movesRef, { moves: updatedMoves });
      setMoves(updatedMoves);
      
      console.log('Successfully unlocked all basic moves for user element:', userElement);
    } catch (err) {
      console.error('Error force unlocking moves:', err);
      setError('Failed to unlock moves');
    }
  };

  // Reset and recreate moves with correct element-specific unlocking
  const resetMovesWithElementFilter = async (userElement: string = 'fire') => {
    if (!currentUser) return;
    
    try {
      console.log('Resetting moves with element-specific filtering for element:', userElement);
      
      const movesRef = doc(db, 'battleMoves', currentUser.uid);
      
      // Create new moves with correct element filtering
      const newMoves: Move[] = MOVE_TEMPLATES.map((template, index) => ({
        ...template,
        id: `move_${index + 1}`,
        unlocked: template.category === 'system' || 
                  (template.category === 'elemental' && template.level === 1 && template.elementalAffinity === userElement) || 
                  (template.category === 'manifest' && template.manifestType === 'reading'), // Default to reading for fallback
        currentCooldown: 0,
        masteryLevel: 1,
      }));
      
      await setDoc(movesRef, { moves: newMoves });
      setMoves(newMoves);
      
      console.log('Successfully reset moves with element-specific filtering for element:', userElement);
    } catch (err) {
      console.error('Error resetting moves:', err);
      setError('Failed to reset moves');
    }
  };

  // Apply element filtering to existing moves without recreating them
  const applyElementFilterToExistingMoves = async (userElement: string = 'fire') => {
    if (!currentUser) return;
    
    try {
      console.log('Applying element filter to existing moves for element:', userElement);
      
      // Get user's manifest from student data
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      const userManifest = studentDoc.exists() ? 
        (studentDoc.data().manifest?.manifestId || studentDoc.data().manifestationType || 'reading') : 'reading';
      
      console.log('BattleContext: User manifest for filtering:', userManifest);
      
      const movesRef = doc(db, 'battleMoves', currentUser.uid);
      
      // Update existing moves with correct element and manifest filtering
      const updatedMoves = moves.map((move: Move) => {
        if (move.category === 'elemental' && move.level === 1) {
          // Only unlock if it matches user's element
          const shouldUnlock = move.elementalAffinity === userElement;
          console.log(`BattleContext: Move ${move.name} (${move.elementalAffinity}) - should unlock: ${shouldUnlock}`);
          return { ...move, unlocked: shouldUnlock };
        } else if (move.category === 'manifest') {
          // Only unlock if it matches user's manifest
          const shouldUnlock = move.manifestType === userManifest;
          console.log(`BattleContext: Move ${move.name} (${move.manifestType}) - should unlock: ${shouldUnlock}`);
          return { ...move, unlocked: shouldUnlock };
        }
        return move;
      });
      
      await updateDoc(movesRef, { moves: updatedMoves });
      setMoves(updatedMoves);
      
      console.log('Successfully applied element filter to existing moves for element:', userElement);
    } catch (err) {
      console.error('Error applying element filter to moves:', err);
      setError('Failed to apply element filter');
    }
  };

  const forceMigration = async () => {
    if (!currentUser) return;
    
    try {
      console.log('BattleContext: Force migration triggered');
      
      // Get user's manifest from student data
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      const userManifest = studentDoc.exists() ? 
        (studentDoc.data().manifest?.manifestId || studentDoc.data().manifestationType || 'reading') : 'reading';
      
      console.log('BattleContext: Force migration - User manifest:', userManifest);
      
      const movesRef = doc(db, 'battleMoves', currentUser.uid);
      
      // Create new moves with the updated system
      const newMoves: Move[] = MOVE_TEMPLATES.map((template, index) => {
        const isUnlocked = template.category === 'system' || 
          (template.category === 'elemental' && template.level === 1 && template.elementalAffinity === 'fire') || 
          (template.category === 'manifest' && template.manifestType === userManifest);
        
        if (template.category === 'manifest') {
          console.log(`BattleContext: Force migration - Creating manifest move ${template.name} (${template.manifestType}) - unlocked: ${isUnlocked}`);
        }
        
        return {
          ...template,
          id: `move_${index + 1}`,
          unlocked: isUnlocked,
          currentCooldown: 0,
          masteryLevel: 1,
        };
      });
      
      // Overwrite the database with new moves
      await setDoc(movesRef, { moves: newMoves });
      setMoves(newMoves);
      
      console.log('BattleContext: Force migration completed successfully');
    } catch (err) {
      console.error('BattleContext: Error in force migration:', err);
      setError('Failed to force migration');
    }
  };

  const upgradeMove = async (moveId: string) => {
    if (!currentUser || !vault) return;
    
    try {
      const move = moves.find(m => m.id === moveId);
      if (!move || move.masteryLevel >= 5) {
        setError('Move cannot be upgraded');
        return;
      }

      // Calculate upgrade cost
      const upgradeCost = (() => {
        switch (move.masteryLevel) {
          case 1: return 50;
          case 2: return 100;
          case 3: return 200;
          case 4: return 400;
          default: return 0;
        }
      })();

      // Check if player has enough PP
      if (vault.currentPP < upgradeCost) {
        setError(`Not enough PP. Need ${upgradeCost} PP to upgrade.`);
        return;
      }

      // Update moves in database
      const movesRef = doc(db, 'battleMoves', currentUser.uid);
      const updatedMoves = moves.map(m => 
        m.id === moveId 
          ? { ...m, masteryLevel: m.masteryLevel + 1 } 
          : m
      );
      await updateDoc(movesRef, { moves: updatedMoves });
      setMoves(updatedMoves);

      // Deduct PP from vault
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      await updateDoc(vaultRef, { 
        currentPP: vault.currentPP - upgradeCost 
      });

      console.log(`Upgraded ${move.name} to level ${move.masteryLevel + 1} for ${upgradeCost} PP`);
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

  // Consume a move from the vault
  const consumeMove = async () => {
    if (!currentUser || !vault) return false;
    
    if (vault.movesRemaining <= 0) {
      setError('No moves remaining for today');
      return false;
    }
    
    try {
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      const newMovesRemaining = vault.movesRemaining - 1;
      
      await updateDoc(vaultRef, { movesRemaining: newMovesRemaining });
      setVault({ ...vault, movesRemaining: newMovesRemaining });
      
      console.log('BattleContext: Consumed move. Remaining:', newMovesRemaining);
      return true;
    } catch (err) {
      console.error('Error consuming move:', err);
      setError('Failed to consume move');
      return false;
    }
  };

  const submitMove = async (moveId: string, targetUserId?: string, actionCardId?: string) => {
    if (!currentUser || !currentBattle) return;
    
    // Consume a move first
    const moveConsumed = await consumeMove();
    if (!moveConsumed) return;
    
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

  // Function to handle PP Restore action card
  const executePPRestore = async () => {
    if (!currentUser || !vault) {
      return {
        success: false,
        message: 'User not authenticated or vault not found'
      };
    }
    
    try {
      // Get today's date (start of day)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Get all attacks where this user was the target and PP was stolen today
      const attacksRef = collection(db, 'vaultSiegeAttacks');
      const q = query(
        attacksRef,
        where('targetId', '==', currentUser.uid),
        where('ppStolenFromTarget', '>', 0),
        where('ppStolenDate', '>=', today)
      );
      
      const querySnapshot = await getDocs(q);
      let totalPPStolenToday = 0;
      
      querySnapshot.forEach((docSnapshot) => {
        const attackData = docSnapshot.data();
        totalPPStolenToday += attackData.ppStolenFromTarget || 0;
      });
      
      // Calculate restoration amount (restore all PP stolen today)
      const restorationAmount = Math.min(totalPPStolenToday, vault.maxShieldStrength - vault.currentPP);
      
      if (restorationAmount > 0) {
        // Update vault with restored PP
        const newPP = Math.min(vault.maxShieldStrength, vault.currentPP + restorationAmount);
        
        await updateDoc(doc(db, 'vaults', currentUser.uid), {
          currentPP: newPP
        });
        
        // Update student document
        await updateDoc(doc(db, 'students', currentUser.uid), {
          powerPoints: newPP
        });
        
        console.log(`PP Restore: Restored ${restorationAmount} PP (${totalPPStolenToday} stolen today)`);
        
        // Record the PP restore action
        const restoreData = {
          userId: currentUser.uid,
          userName: currentUser.displayName || 'Unknown',
          restorationAmount,
          totalStolenToday: totalPPStolenToday,
          timestamp: serverTimestamp(),
          type: 'pp_restore'
        };
        
        await addDoc(collection(db, 'ppRestoreActions'), restoreData);
        
        return {
          success: true,
          restored: restorationAmount,
          totalStolen: totalPPStolenToday
        };
      } else {
        console.log('PP Restore: No PP stolen today to restore');
        return {
          success: false,
          message: 'No PP was stolen today'
        };
      }
    } catch (err) {
      console.error('Error executing PP restore:', err);
      throw err;
    }
  };

  const executeVaultSiegeAttack = async (moveId: string | null, targetUserId: string, actionCardId?: string) => {
    if (!currentUser || !vault) return;
    
    // Consume a move first
    const moveConsumed = await consumeMove();
    if (!moveConsumed) return;
    
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
      const selectedMove = moveId ? moves.find(m => m.id === moveId) : null;
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
        // Check if this is a defensive move that boosts attacker's shields
        if (selectedMove.type === 'defense' && selectedMove.shieldBoost) {
          // This is a defensive move that boosts the attacker's shields
          const shieldBoostAmount = selectedMove.shieldBoost;
          const newShieldStrength = Math.min(vault.maxShieldStrength, vault.shieldStrength + shieldBoostAmount);
          const actualShieldBoost = newShieldStrength - vault.shieldStrength;
          
          // Update attacker's vault with shield boost
          await updateDoc(doc(db, 'vaults', currentUser.uid), {
            shieldStrength: newShieldStrength
          });
          
          // Update attacker's student document
          await updateDoc(doc(db, 'students', currentUser.uid), {
            shieldStrength: newShieldStrength
          });
          
          console.log(`Defensive move ${selectedMove.name} boosted attacker shields: ${vault.shieldStrength} → ${newShieldStrength} (+${actualShieldBoost})`);
          message = `Used ${selectedMove.name} - Boosted shields by ${actualShieldBoost}`;
          
          // For defensive moves, we don't damage the target or steal PP
          shieldDamage = 0;
          ppStolen = 0;
        } else {
          // This is an offensive move
          const moveDamage = MOVE_DAMAGE_VALUES[selectedMove.name];
          if (moveDamage) {
            shieldDamage = moveDamage.shieldDamage;
            console.log(`Move ${selectedMove.name} shield damage: ${shieldDamage}`);
            
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
              // Shields still up, check if we'll break them
              if (shieldDamage >= targetVaultData.shieldStrength) {
                // Will break shields, can steal PP
                const basePPStolen = Math.min(moveDamage.ppSteal, targetVaultData.currentPP);
                const excessDamage = shieldDamage - targetVaultData.shieldStrength;
                const additionalPPStolen = Math.min(excessDamage, targetVaultData.currentPP - basePPStolen);
                ppStolen = basePPStolen + additionalPPStolen;
                
                if (additionalPPStolen > 0) {
                  message = `Used ${selectedMove.name} - Broke shields and stole ${ppStolen} PP (${additionalPPStolen} from excess damage)`;
                } else {
                  message = `Used ${selectedMove.name} - Broke shields and stole ${ppStolen} PP`;
                }
              } else {
                // Shields still up, only damage shields
                message = `Used ${selectedMove.name} - Damaged shields by ${shieldDamage}`;
              }
            }
          } else {
            message = `Used ${selectedMove.name} against target vault`;
          }
        }
      }
      
      if (selectedCard) {
        // Process action card
        switch (selectedCard.effect.type) {
          case 'shield_breach':
            const cardShieldDamage = selectedCard.effect.strength;
            shieldDamage += cardShieldDamage; // Add to existing shield damage
            console.log(`Action card ${selectedCard.name} shield damage: ${cardShieldDamage}, total shield damage: ${shieldDamage}`);
            message += ` • Used ${selectedCard.name} to breach shields (+${cardShieldDamage} shield damage)`;
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
        const originalShieldStrength = targetVaultData.shieldStrength;
        const newShieldStrength = Math.max(0, targetVaultData.shieldStrength - shieldDamage);
        updates.shieldStrength = newShieldStrength;
        
        // Calculate excess damage that converts to PP theft
        const excessDamage = Math.max(0, shieldDamage - originalShieldStrength);
        if (excessDamage > 0) {
          // Convert excess shield damage to PP theft
          const additionalPPStolen = Math.min(excessDamage, targetVaultData.currentPP);
          ppStolen += additionalPPStolen;
          
          console.log(`Shield damage calculation: ${originalShieldStrength} - ${shieldDamage} = ${newShieldStrength}`);
          console.log(`Excess damage: ${excessDamage} → Additional PP stolen: ${additionalPPStolen}`);
          console.log(`Total PP stolen: ${ppStolen}`);
          
          // Update message to reflect the conversion
          if (selectedMove) {
            message = message.replace(
              `Used ${selectedMove.name} - Broke shields and stole ${ppStolen - additionalPPStolen} PP`,
              `Used ${selectedMove.name} - Broke shields and stole ${ppStolen} PP (${additionalPPStolen} from excess damage)`
            );
          }
        } else {
          console.log(`Shield damage calculation: ${originalShieldStrength} - ${shieldDamage} = ${newShieldStrength}`);
        }
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
        
        console.log('=== PP TRANSFER COMPLETED ===');
        console.log('Attacker vault updated:', newAttackerPP);
        console.log('Attacker student doc updated:', newAttackerPP);
        console.log('Target student doc updated:', updates.currentPP);
      }
      
      // Update target vault
      if (Object.keys(updates).length > 0) {
        console.log('Updating target vault with:', updates);
        await updateDoc(targetVaultRef, updates);
        console.log('Target vault updated successfully');
        
        // Verify the update by reading the vault again
        const updatedVaultDoc = await getDoc(targetVaultRef);
        if (updatedVaultDoc.exists()) {
          const updatedVaultData = updatedVaultDoc.data() as Vault;
          console.log('Verified vault update - new shield strength:', updatedVaultData.shieldStrength);
        }
      }
      
      // Get player names for the attack record
      const attackerName = currentUser.displayName || 'Unknown';
      const targetStudentDoc = await getDoc(doc(db, 'students', targetUserId));
      const targetName = targetStudentDoc.exists() ? targetStudentDoc.data().displayName || 'Unknown' : 'Unknown';
      
      // Log PP transfer details if PP was stolen
      if (ppStolen > 0) {
        console.log('=== PP TRANSFER DETAILS ===');
        console.log('Attacker (Eddy Mosley):', {
          uid: currentUser.uid,
          name: attackerName,
          currentPP: vault.currentPP,
          ppStolen: ppStolen,
          newPP: vault.currentPP + ppStolen,
          change: `+${ppStolen}`
        });
        console.log('Target (Blackbeard):', {
          uid: targetUserId,
          name: targetName,
          currentPP: targetVaultData.currentPP,
          ppStolen: ppStolen,
          newPP: targetVaultData.currentPP - ppStolen,
          change: `-${ppStolen}`
        });
      }
      
              // Record the attack with detailed information
        const attackData: any = {
          attackerId: currentUser.uid,
          attackerName,
          targetId: targetUserId,
          targetName,
          moveId: moveId || null,
          moveName: selectedMove?.name || null,
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
          ppStolenFromTarget: ppStolen,
          ppStolenDate: serverTimestamp(),
        };
      
      // Only add actionCardId if it has a value
      if (actionCardId) {
        attackData.actionCardId = actionCardId;
        attackData.actionCardName = selectedCard?.name || null;
      }
      
      const attackDocRef = await addDoc(collection(db, 'vaultSiegeAttacks'), attackData);
      
      console.log('Vault siege attack completed:', {
        attackId: attackDocRef.id,
        attackData: attackData
      });
      
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
    unlockElementalMoves,
    forceUnlockAllMoves,
    resetMovesWithElementFilter,
    applyElementFilterToExistingMoves,
    forceMigration,
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
    executePPRestore,
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