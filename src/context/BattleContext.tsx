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
import { logger } from '../utils/debugLogger';
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
import { getMoveDamage } from '../utils/moveOverrides';

interface BattleContextType {
  // Vault Management
  vault: Vault | null;
  updateVault: (updates: Partial<Vault>) => Promise<void>;
  upgradeVaultCapacity: () => Promise<void>;
  upgradeVaultShields: () => Promise<void>;
  upgradeVaultFirewall: () => Promise<void>;
  restoreVaultShields: (amount: number, cost: number) => Promise<void>;
  payDues: () => Promise<void>;
  syncVaultPP: () => Promise<void>;
  syncStudentPP: (userId: string) => Promise<void>;
  refreshVaultData: () => Promise<void>;
  
  // Move Management
  moves: Move[];
  unlockMove: (moveId: string) => Promise<void>;
  unlockElementalMoves: (elementalAffinity: string) => Promise<void>;
  forceUnlockAllMoves: (userElement?: string) => Promise<void>;
  resetMovesWithElementFilter: (userElement?: string) => Promise<void>;
  applyElementFilterToExistingMoves: (userElement?: string) => Promise<void>;
  forceMigration: () => Promise<void>;
  upgradeMove: (moveId: string) => Promise<void>;
  resetMoveLevel: (moveId: string) => Promise<void>;
  
  // Action Card Management
  actionCards: ActionCard[];
  setActionCards: React.Dispatch<React.SetStateAction<ActionCard[]>>;
  unlockActionCard: (cardId: string) => Promise<void>;
  upgradeActionCard: (cardId: string) => Promise<void>;
  activateActionCard: (cardId: string) => Promise<void>;
  resetActionCards: () => Promise<void>;
  
  // Manifest Progress Management
  manifestProgress: any;
  checkManifestMilestones: (manifestType: string) => Promise<void>;
  canPurchaseMove: (category: 'manifest' | 'elemental' | 'system') => boolean;
  getNextMilestone: (manifestType: string) => any;
  
  // Elemental Progress Management
  elementalProgress: any;
  checkElementalMilestones: (elementalType: string) => Promise<void>;
  canPurchaseElementalMove: (elementalType: string) => boolean;
  getNextElementalMilestone: (elementalType: string) => any;
  
  // Battle Management
  currentBattle: BattleState | null;
  battleLobbies: BattleLobby[];
  offlineMoves: OfflineMove[];
  attackHistory: VaultSiegeAttack[];
  createBattle: (type: 'live' | 'vault_siege', settings?: any) => Promise<string>;
  joinBattle: (battleId: string) => Promise<void>;
  leaveBattle: (battleId: string) => Promise<void>;
  submitMove: (moveId: string, targetUserId?: string, actionCardId?: string) => Promise<void>;
  executeVaultSiegeAttack: (moveId: string | null, targetUserId: string, actionCardId?: string) => Promise<{ success: boolean; message: string; ppStolen?: number; xpGained?: number; shieldDamage?: number; overshieldAbsorbed?: boolean } | undefined>;
  executePPRestore: () => Promise<{ success: boolean; restored?: number; totalStolen?: number; message?: string }>;
  
  // Offline Moves
  submitOfflineMove: (type: OfflineMove['type'], targetUserId?: string, moveId?: string) => Promise<void>;
  getRemainingOfflineMoves: () => number;
  consumeOfflineMove: () => Promise<boolean>;
  debugOfflineMoves: () => void;
  
  // Loading States
  loading: boolean;
  error: string | null;
  success: string | null;
  setError: (error: string | null) => void;
  setSuccess: (success: string | null) => void;
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
  // logger.battle.debug('BattleProvider initialized!');
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
  const [success, setSuccess] = useState<string | null>(null);

  // Clear success message after 3 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

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
        
        logger.battle.debug('Player PP from student data:', playerPP);
        logger.battle.debug('User manifest for move filtering:', userManifest);
        
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
            overshield: 0,
            firewall: 10,
            lastUpgrade: new Date(),
            debtStatus: false,
            debtAmount: 0,
            lastDuesPaid: new Date(),
            movesRemaining: BATTLE_CONSTANTS.MOVE_SLOTS_BASE,
            maxMovesPerDay: BATTLE_CONSTANTS.MOVE_SLOTS_BASE,
            lastMoveReset: new Date(),
          };
          logger.battle.debug('Creating new vault with PP:', playerPP);
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
        
        // TEMPORARY FIX: Don't show error to user for Firestore assertion errors
        // These are internal Firebase issues, not user-facing problems
        if (err instanceof Error && err.message.includes('INTERNAL ASSERTION FAILED')) {
          console.warn('BattleContext: Firestore internal assertion error - using defaults');
          // Set default values silently
          const defaultVault: Vault = {
            id: currentUser.uid,
            ownerId: currentUser.uid,
            capacity: 1000,
            currentPP: 0,
            shieldStrength: BATTLE_CONSTANTS.BASE_SHIELD_STRENGTH,
            maxShieldStrength: BATTLE_CONSTANTS.BASE_SHIELD_STRENGTH,
            overshield: 0,
            firewall: 10,
            lastUpgrade: new Date(),
            debtStatus: false,
            debtAmount: 0,
            lastDuesPaid: new Date(),
            movesRemaining: 10,
            maxMovesPerDay: 10,
            lastMoveReset: new Date()
          };
          setVault(defaultVault);
          setActionCards([]);
          return; // Don't set error state
        }
        
        setError('Failed to initialize battle data. Please refresh the page or try again later.');
        
        // Set default values to prevent complete failure
        const defaultVault: Vault = {
          id: currentUser.uid,
          ownerId: currentUser.uid,
          capacity: 1000,
          currentPP: 0,
          shieldStrength: BATTLE_CONSTANTS.BASE_SHIELD_STRENGTH,
          maxShieldStrength: BATTLE_CONSTANTS.BASE_SHIELD_STRENGTH,
          overshield: 0,
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
      if (studentDoc.exists()) {
        // Just log the student data for debugging, don't sync
        const studentData = studentDoc.data();
        // logger.battle.debug('Student data updated:', {
        //   powerPoints: studentData.powerPoints,
        //   xp: studentData.xp,
        //   timestamp: new Date().toISOString()
        // });
      }
    });

    return () => {
      unsubscribeVault();
      unsubscribeStudent();
    };
  }, [currentUser]);

  // Listen for battle lobbies - simplified to avoid index requirements
  useEffect(() => {
    if (!currentUser) return;

    console.log('BattleContext: Setting up battle lobbies listener');
    
    const lobbiesQuery = query(
      collection(db, 'battleLobbies'),
      where('status', 'in', ['waiting', 'starting'])
    );
    
    const unsubscribeLobbies = onSnapshot(lobbiesQuery, (snapshot) => {
      const lobbies: BattleLobby[] = [];
      snapshot.forEach((doc) => {
        const lobbyData = { id: doc.id, ...doc.data() } as BattleLobby;
        logger.battle.debug('Found battle lobby:', lobbyData);
        lobbies.push(lobbyData);
      });
      logger.battle.debug('Setting battle lobbies:', lobbies);
      setBattleLobbies(lobbies);
    }, (error) => {
      logger.battle.error('Error listening to battle lobbies:', error);
    });

    return () => unsubscribeLobbies();
  }, [currentUser]);

  // Listen for offline moves - simplified to avoid index requirements
  useEffect(() => {
    if (!currentUser) return;

    // logger.battle.debug('Setting up offline moves listener');
    
    const movesQuery = query(
      collection(db, 'offlineMoves'),
      where('userId', '==', currentUser.uid)
    );
    
    const unsubscribeMoves = onSnapshot(movesQuery, (snapshot) => {
      const moves: OfflineMove[] = [];
      snapshot.forEach((doc) => {
        const moveData = { id: doc.id, ...doc.data() } as OfflineMove;
        // logger.battle.debug('Found offline move:', moveData);
        moves.push(moveData);
      });
      // logger.battle.debug('Setting offline moves:', moves);
      // logger.battle.debug('Total offline moves count:', moves.length);
      // logger.battle.debug('Vault attack moves count:', moves.filter(m => m.type === 'vault_attack').length);
      // logger.battle.debug('Move restore moves count:', moves.filter(m => m.type === 'move_restore').length);
      
      // Check if this is a new vault_attack record (indicating a move was just consumed)
      const newVaultAttacks = moves.filter(m => m.type === 'vault_attack');
      const previousVaultAttacks = offlineMoves.filter(m => m.type === 'vault_attack');
      const hasNewVaultAttack = newVaultAttacks.length > previousVaultAttacks.length;
      
      setOfflineMoves(moves);
      
      // Trigger a recalculation of remaining offline moves
      const remainingMoves = getRemainingOfflineMoves();
      // logger.battle.debug('Offline moves updated, remaining moves:', remainingMoves);
      
      // If a new vault_attack was added, this means a move was consumed
      if (hasNewVaultAttack) {
        logger.battle.info('New vault_attack detected - move was consumed!');
        logger.battle.debug('Previous vault attacks:', previousVaultAttacks.length);
        logger.battle.debug('New vault attacks:', newVaultAttacks.length);
        logger.battle.debug('Remaining moves after consumption:', remainingMoves);
      }
      
      // Automatically trigger debug update to ensure UI consistency
      // logger.battle.debug('Auto-triggering debug update after offline moves change');
      // logger.battle.debug('Current offline moves count:', moves.length);
      // logger.battle.debug('Current attack history count:', attackHistory.length);
      // logger.battle.debug('Calculated remaining moves:', remainingMoves);
    }, (error) => {
      logger.battle.error('Error listening to offline moves:', error);
    });

    return () => unsubscribeMoves();
  }, [currentUser]); // Removed offlineMoves from dependencies to prevent listener recreation

  // Listen for attack history (attacks by or against current user)
  useEffect(() => {
    if (!currentUser) return;

    logger.battle.debug('Setting up attack history listener');
    
    // Get all attacks where user is attacker (outgoing attacks)
    const outgoingAttacksQuery = query(
      collection(db, 'vaultSiegeAttacks'),
      where('attackerId', '==', currentUser.uid)
    );
    
    // Get all attacks where user is target (incoming attacks)
    const incomingAttacksQuery = query(
      collection(db, 'vaultSiegeAttacks'),
      where('targetId', '==', currentUser.uid)
    );
    
    let outgoingAttacks: VaultSiegeAttack[] = [];
    let incomingAttacks: VaultSiegeAttack[] = [];
    
    const updateAttackHistory = () => {
      const allAttacks = [...outgoingAttacks, ...incomingAttacks];
      logger.battle.debug('Setting combined attack history:', allAttacks);
      setAttackHistory(allAttacks);
      
      // Automatically trigger debug update to ensure UI consistency
      const remainingMoves = getRemainingOfflineMoves();
      // logger.battle.debug('Auto-triggering debug update after attack history change');
      // logger.battle.debug('Current offline moves count:', offlineMoves.length);
      // logger.battle.debug('Current attack history count:', allAttacks.length);
      // logger.battle.debug('Calculated remaining moves:', remainingMoves);
    };
    
    const unsubscribeOutgoingAttacks = onSnapshot(outgoingAttacksQuery, (snapshot) => {
      outgoingAttacks = [];
      snapshot.forEach((doc) => {
        const attackData = { id: doc.id, ...doc.data() } as VaultSiegeAttack;
        logger.battle.debug('Found outgoing attack by user:', attackData);
        outgoingAttacks.push(attackData);
      });
      updateAttackHistory();
    }, (error) => {
      logger.battle.error('Error listening to outgoing attack history:', error);
    });
    
    const unsubscribeIncomingAttacks = onSnapshot(incomingAttacksQuery, (snapshot) => {
      incomingAttacks = [];
      snapshot.forEach((doc) => {
        const attackData = { id: doc.id, ...doc.data() } as VaultSiegeAttack;
        logger.battle.debug('Found incoming attack to user:', attackData);
        incomingAttacks.push(attackData);
      });
      updateAttackHistory();
    }, (error) => {
      logger.battle.error('Error listening to incoming attack history:', error);
    });

    return () => {
      unsubscribeOutgoingAttacks();
      unsubscribeIncomingAttacks();
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

  // Vault upgrade functions
  const upgradeVaultCapacity = async () => {
    if (!currentUser || !vault) return;
    
    const upgradeCost = 200;
    if (vault.currentPP < upgradeCost) {
      setError('Insufficient PP for capacity upgrade');
      return;
    }
    
    try {
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      const newCapacity = vault.capacity + 200;
      const newPP = vault.currentPP - upgradeCost;
      
      await updateDoc(vaultRef, {
        capacity: newCapacity,
        currentPP: newPP
      });
      
      // Also update student PP
      const studentRef = doc(db, 'students', currentUser.uid);
      await updateDoc(studentRef, { powerPoints: newPP });
      
      setVault(prevVault => prevVault ? { 
        ...prevVault, 
        capacity: newCapacity,
        currentPP: newPP
      } : null);
      
      setSuccess('Vault capacity upgraded! +200 PP capacity');
    } catch (error) {
      console.error('Error upgrading vault capacity:', error);
      setError('Failed to upgrade vault capacity');
    }
  };

  const upgradeVaultShields = async () => {
    if (!currentUser || !vault) return;
    
    const upgradeCost = 75;
    if (vault.currentPP < upgradeCost) {
      setError('Insufficient PP for shield upgrade');
      return;
    }
    
    try {
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      const newMaxShields = vault.maxShieldStrength + 25;
      const newPP = vault.currentPP - upgradeCost;
      
      await updateDoc(vaultRef, {
        maxShieldStrength: newMaxShields,
        currentPP: newPP
      });
      
      // Also update student PP
      const studentRef = doc(db, 'students', currentUser.uid);
      await updateDoc(studentRef, { powerPoints: newPP });
      
      setVault(prevVault => prevVault ? { 
        ...prevVault, 
        maxShieldStrength: newMaxShields,
        currentPP: newPP
      } : null);
      
      setSuccess('Vault shields upgraded! +25 max shield strength');
    } catch (error) {
      console.error('Error upgrading vault shields:', error);
      setError('Failed to upgrade vault shields');
    }
  };

  const upgradeVaultFirewall = async () => {
    if (!currentUser || !vault) return;
    
    const upgradeCost = 50;
    if (vault.currentPP < upgradeCost) {
      setError('Insufficient PP for firewall upgrade');
      return;
    }
    
    try {
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      const newFirewall = Math.min(100, vault.firewall + 15); // Cap at 100%
      const newPP = vault.currentPP - upgradeCost;
      
      await updateDoc(vaultRef, {
        firewall: newFirewall,
        currentPP: newPP
      });
      
      // Also update student PP
      const studentRef = doc(db, 'students', currentUser.uid);
      await updateDoc(studentRef, { powerPoints: newPP });
      
      setVault(prevVault => prevVault ? { 
        ...prevVault, 
        firewall: newFirewall,
        currentPP: newPP
      } : null);
      
      setSuccess('Vault firewall upgraded! +15% attack resistance');
    } catch (error) {
      console.error('Error upgrading vault firewall:', error);
      setError('Failed to upgrade vault firewall');
    }
  };

  const restoreVaultShields = async (amount: number, cost: number) => {
    if (!currentUser || !vault) return;
    
    if (vault.currentPP < cost) {
      setError('Insufficient PP for shield restoration');
      return;
    }
    
    if (vault.shieldStrength >= vault.maxShieldStrength) {
      setError('Your shields are already at maximum strength');
      return;
    }
    
    try {
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      // Restore only the specified amount, but don't exceed maximum
      const newShieldStrength = Math.min(vault.maxShieldStrength, vault.shieldStrength + amount);
      const actualRestored = newShieldStrength - vault.shieldStrength;
      
      // Only charge for the actual shields restored, not the full cost
      const actualCost = Math.round((actualRestored / amount) * cost);
      const newPP = vault.currentPP - actualCost;
      
      await updateDoc(vaultRef, {
        shieldStrength: newShieldStrength,
        currentPP: newPP
      });
      
      // Also update student PP
      const studentRef = doc(db, 'students', currentUser.uid);
      await updateDoc(studentRef, { powerPoints: newPP });
      
      setVault(prevVault => prevVault ? { 
        ...prevVault, 
        shieldStrength: newShieldStrength,
        currentPP: newPP
      } : null);
      
      setSuccess(`Shields restored! +${actualRestored} shield strength`);
    } catch (error) {
      console.error('Error restoring vault shields:', error);
      setError('Failed to restore vault shields');
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
    if (!currentUser || !vault) return;
    
    try {
      // Get current player PP from student document
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      const playerPP = studentDoc.exists() ? (studentDoc.data().powerPoints || 0) : 0;
      
      console.log('🔄 Manual sync - Player PP:', playerPP, 'Vault PP:', vault.currentPP);
      
      if (playerPP !== vault.currentPP) {
        // Update vault PP to match player PP
        const vaultRef = doc(db, 'vaults', currentUser.uid);
        await updateDoc(vaultRef, { currentPP: playerPP });
        
        // Update local vault state
        setVault(prevVault => prevVault ? {
          ...prevVault,
          currentPP: playerPP
        } : null);
        
        console.log('✅ Vault PP synced to player PP:', playerPP);
      } else {
        console.log('✅ Vault PP already in sync with player PP');
      }
    } catch (err) {
      console.error('Error syncing vault PP:', err);
      setError('Failed to sync vault PP');
    }
  };

  // Sync student PP to match vault PP (for targets)
  const syncStudentPP = async (userId: string) => {
    try {
      // Get vault PP
      const vaultRef = doc(db, 'vaults', userId);
      const vaultDoc = await getDoc(vaultRef);
      const vaultPP = vaultDoc.exists() ? (vaultDoc.data().currentPP || 0) : 0;
      
      // Get student PP
      const studentRef = doc(db, 'students', userId);
      const studentDoc = await getDoc(studentRef);
      const studentPP = studentDoc.exists() ? (studentDoc.data().powerPoints || 0) : 0;
      
      console.log(`🔄 Syncing student PP for ${userId}:`, { vaultPP, studentPP });
      
      if (vaultPP !== studentPP) {
        // Update student PP to match vault PP
        await updateDoc(studentRef, { powerPoints: vaultPP });
        console.log(`✅ Student PP synced to vault PP for ${userId}:`, vaultPP);
      } else {
        console.log(`✅ Student PP already in sync with vault PP for ${userId}`);
      }
    } catch (err) {
      console.error(`Error syncing student PP for ${userId}:`, err);
    }
  };

  // Refresh vault data to ensure synchronization
  const refreshVaultData = async () => {
    if (!currentUser) return;
    
    try {
      console.log('Refreshing vault data...');
      
      // Get updated vault data
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      const vaultDoc = await getDoc(vaultRef);
      
      if (vaultDoc.exists()) {
        const vaultData = vaultDoc.data() as Vault;
        const processedVault = checkAndResetDailyMoves(vaultData);
        setVault(processedVault);
        console.log('Vault data refreshed:', processedVault);
      }
      
      // Also refresh student data to get updated XP
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      
      if (studentDoc.exists()) {
        const studentData = studentDoc.data();
        console.log('Student data refreshed - XP:', studentData.xp, 'PP:', studentData.powerPoints);
      }
      
    } catch (error) {
      console.error('Error refreshing vault data:', error);
    }
  };

  // Helper to get "day" start time (8am EST) for a given date
  const getDayStartForDate = (date: Date): Date => {
    // Convert to EST
    const estOffset = -5; // EST is UTC-5
    const estDate = new Date(date.getTime() + (estOffset * 60 - date.getTimezoneOffset()) * 60000);
    
    // Create 8am EST for that date
    const dayStart = new Date(estDate);
    dayStart.setHours(8, 0, 0, 0);
    
    // If time is before 8am EST, use previous day's 8am EST
    if (estDate < dayStart) {
      dayStart.setDate(dayStart.getDate() - 1);
    }
    
    // Convert back to local time
    return new Date(dayStart.getTime() - (estOffset * 60 - date.getTimezoneOffset()) * 60000);
  };

  // Helper to get current "day" start time (8am EST)
  const getCurrentDayStart = (): Date => {
    return getDayStartForDate(new Date());
  };

  // Check and reset daily moves if needed (resets at 8am EST)
  const checkAndResetDailyMoves = (vaultData: Vault): Vault => {
    const now = new Date();
    const lastReset = vaultData.lastMoveReset instanceof Date ? vaultData.lastMoveReset : new Date(vaultData.lastMoveReset);
    
    // Get current day start (8am EST)
    const currentDayStart = getCurrentDayStart();
    
    // If last reset was before current day start, reset moves
    if (lastReset < currentDayStart) {
      // Reset moves for new day
      return {
        ...vaultData,
        movesRemaining: vaultData.maxMovesPerDay,
        lastMoveReset: currentDayStart,
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
      
                  // Force refresh action cards from templates
            const updatedActionCards = ACTION_CARD_TEMPLATES.map((template, index) => ({
              ...template,
              id: `card_${index + 1}`,
              unlocked: index < 2, // First 2 cards unlocked by default
              masteryLevel: 1, // Start at level 1
              upgradeCost: template.upgradeCost || 100, // Default upgrade cost
            }));
      
      const cardsRef = doc(db, 'battleActionCards', currentUser.uid);
      await setDoc(cardsRef, { cards: updatedActionCards });
      setActionCards(updatedActionCards);
      
      console.log('BattleContext: Force migration completed successfully - moves and action cards updated');
    } catch (err) {
      console.error('BattleContext: Error in force migration:', err);
      setError('Failed to force migration');
    }
  };

  const upgradeMove = async (moveId: string) => {
    if (!currentUser || !vault) return;
    
    try {
      const move = moves.find(m => m.id === moveId);
      if (!move || move.masteryLevel >= 10) {
        setError('Move cannot be upgraded');
        return;
      }

      // Calculate exponential upgrade cost based on current level
      // Base price: 100 PP for Level 1 → Level 2
      // Then multiplied by the respective multiplier for each level
      const basePrice = 100;
      const nextLevel = move.masteryLevel + 1;
      let upgradeCost: number;
      if (nextLevel === 2) {
        // Level 1 → Level 2: base price
        upgradeCost = basePrice;
      } else if (nextLevel === 3) {
        // Level 2 → Level 3: base * 2
        upgradeCost = basePrice * 2;
      } else if (nextLevel === 4) {
        // Level 3 → Level 4: base * 4
        upgradeCost = basePrice * 4;
      } else if (nextLevel === 5) {
        // Level 4 → Level 5: base * 8
        upgradeCost = basePrice * 8;
      } else if (nextLevel === 6) {
        // Level 5 → Level 6 (Ascend): base * 16
        upgradeCost = basePrice * 16;
      } else if (nextLevel === 7) {
        // Level 6 → Level 7: base * 32
        upgradeCost = basePrice * 32;
      } else if (nextLevel === 8) {
        // Level 7 → Level 8: base * 64
        upgradeCost = basePrice * 64;
      } else if (nextLevel === 9) {
        // Level 8 → Level 9: base * 128
        upgradeCost = basePrice * 128;
      } else if (nextLevel === 10) {
        // Level 9 → Level 10: base * 256
        upgradeCost = basePrice * 256;
      } else {
        upgradeCost = basePrice;
      }

      // Check if player has enough PP
      if (vault.currentPP < upgradeCost) {
        setError(`Not enough PP. Need ${upgradeCost} PP to upgrade.`);
        return;
      }

      // Calculate random damage boost based on the new level (after upgrade)
      const newLevel = move.masteryLevel + 1;
      let damageBoostMultiplier: number;
      
      switch (newLevel) {
        case 2:
          // Level 2: x2.0 - x2.3 damage boost
          damageBoostMultiplier = 2.0 + Math.random() * 0.3; // Random between 2.0 and 2.3
          break;
        case 3:
          // Level 3: x1.25 - x1.5 damage boost
          damageBoostMultiplier = 1.25 + Math.random() * 0.25; // Random between 1.25 and 1.5
          break;
        case 4:
          // Level 4: x1.3 - x1.6 damage boost
          damageBoostMultiplier = 1.3 + Math.random() * 0.3; // Random between 1.3 and 1.6
          break;
        case 5:
          // Level 5: x2.0 - x2.5 damage boost
          damageBoostMultiplier = 2.0 + Math.random() * 0.5; // Random between 2.0 and 2.5
          break;
        case 6:
          // Level 6 (Ascended I): x2.0 - x2.3 damage boost
          damageBoostMultiplier = 2.0 + Math.random() * 0.3; // Random between 2.0 and 2.3
          break;
        case 7:
          // Level 7 (Ascended II): x1.25 - x1.5 damage boost
          damageBoostMultiplier = 1.25 + Math.random() * 0.25; // Random between 1.25 and 1.5
          break;
        case 8:
          // Level 8 (Ascended III): x1.3 - x1.6 damage boost
          damageBoostMultiplier = 1.3 + Math.random() * 0.3; // Random between 1.3 and 1.6
          break;
        case 9:
          // Level 9 (Ascended IV): x2.0 - x2.5 damage boost
          damageBoostMultiplier = 2.0 + Math.random() * 0.5; // Random between 2.0 and 2.5
          break;
        case 10:
          // Level 10 (Transcendent): x3.0 - x3.5 damage boost (special high boost)
          damageBoostMultiplier = 3.0 + Math.random() * 0.5; // Random between 3.0 and 3.5
          break;
        default:
          damageBoostMultiplier = 1.0;
      }

      // Apply boost multiplier to all numeric properties (damage, shieldBoost, healing, ppSteal, etc.)
      const updatedMoves = moves.map(m => {
        if (m.id === moveId) {
          const updatedMove = { 
            ...m, 
            masteryLevel: newLevel
          };
          
          // Apply boost to damage
          let baseDamage = m.damage;
          if (!baseDamage || baseDamage === 0) {
            const moveDamageValue = MOVE_DAMAGE_VALUES[m.name];
            baseDamage = moveDamageValue?.damage || 0;
          }
          if (baseDamage > 0) {
            updatedMove.damage = Math.floor(baseDamage * damageBoostMultiplier);
          }
          
          // Apply boost to shieldBoost
          if (m.shieldBoost && m.shieldBoost > 0) {
            updatedMove.shieldBoost = Math.floor(m.shieldBoost * damageBoostMultiplier);
          }
          
          // Apply boost to healing
          if (m.healing && m.healing > 0) {
            updatedMove.healing = Math.floor(m.healing * damageBoostMultiplier);
          }
          
          // Apply boost to ppSteal
          if (m.ppSteal && m.ppSteal > 0) {
            updatedMove.ppSteal = Math.floor(m.ppSteal * damageBoostMultiplier);
          }
          
          // Apply boost to debuffStrength
          if (m.debuffStrength && m.debuffStrength > 0) {
            updatedMove.debuffStrength = Math.floor(m.debuffStrength * damageBoostMultiplier);
          }
          
          // Apply boost to buffStrength
          if (m.buffStrength && m.buffStrength > 0) {
            updatedMove.buffStrength = Math.floor(m.buffStrength * damageBoostMultiplier);
          }
          
          return updatedMove;
        }
        return m;
      });

      // Update moves in database
      const movesRef = doc(db, 'battleMoves', currentUser.uid);
      await updateDoc(movesRef, { moves: updatedMoves });
      setMoves(updatedMoves);

      // Deduct PP from vault
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      await updateDoc(vaultRef, { 
        currentPP: vault.currentPP - upgradeCost 
      });

      // Update vault state
      setVault({ ...vault, currentPP: vault.currentPP - upgradeCost });

      // Collect all boosted properties for the alert message
      const boostedProperties: string[] = [];
      if (updatedMoves.find(m => m.id === moveId)?.damage) {
        const oldDamage = moves.find(m => m.id === moveId)?.damage || 0;
        const newDamage = updatedMoves.find(m => m.id === moveId)?.damage || 0;
        if (oldDamage > 0) {
          boostedProperties.push(`Damage: ${oldDamage} → ${newDamage}`);
        }
      }
      if (move.shieldBoost && move.shieldBoost > 0) {
        const oldShield = move.shieldBoost;
        const newShield = updatedMoves.find(m => m.id === moveId)?.shieldBoost || 0;
        boostedProperties.push(`Shield Boost: ${oldShield} → ${newShield}`);
      }
      if (move.healing && move.healing > 0) {
        const oldHealing = move.healing;
        const newHealing = updatedMoves.find(m => m.id === moveId)?.healing || 0;
        boostedProperties.push(`Healing: ${oldHealing} → ${newHealing}`);
      }
      if (move.debuffStrength && move.debuffStrength > 0) {
        const oldDebuff = move.debuffStrength;
        const newDebuff = updatedMoves.find(m => m.id === moveId)?.debuffStrength || 0;
        boostedProperties.push(`Debuff: ${oldDebuff} → ${newDebuff}`);
      }
      if (move.buffStrength && move.buffStrength > 0) {
        const oldBuff = move.buffStrength;
        const newBuff = updatedMoves.find(m => m.id === moveId)?.buffStrength || 0;
        boostedProperties.push(`Buff: ${oldBuff} → ${newBuff}`);
      }

      const boostPercent = ((damageBoostMultiplier - 1) * 100).toFixed(1);
      console.log(`Upgraded ${move.name} to level ${newLevel} for ${upgradeCost} PP with ${boostPercent}% boost`);
      
      // Show success message with boost info for all properties
      const boostInfo = boostedProperties.length > 0 
        ? `\n\nBoost: ${boostPercent}% (${damageBoostMultiplier.toFixed(2)}x multiplier)\n\n${boostedProperties.join('\n')}`
        : `\n\nBoost: ${boostPercent}% (${damageBoostMultiplier.toFixed(2)}x multiplier)`;
      alert(`✅ Successfully upgraded ${move.name} to Level ${newLevel}!${boostInfo}`);
    } catch (err) {
      console.error('Error upgrading move:', err);
      setError('Failed to upgrade move');
    }
  };

  const resetMoveLevel = async (moveId: string) => {
    if (!currentUser) return;
    
    try {
      const move = moves.find(m => m.id === moveId);
      if (!move) {
        setError('Move not found');
        return;
      }

      // Get original base values from MOVE_DAMAGE_VALUES and MOVE_TEMPLATES
      const moveDamageValue = MOVE_DAMAGE_VALUES[move.name];
      const originalDamage = moveDamageValue?.damage || 0;
      
      // Get base values from template
      const moveTemplate = MOVE_TEMPLATES.find(t => t.name === move.name);
      const originalShieldBoost = moveTemplate?.shieldBoost || 0;
      const originalHealing = moveTemplate?.healing || 0;
      const originalPpSteal = moveTemplate?.ppSteal || 0;
      const originalDebuffStrength = moveTemplate?.debuffStrength || 0;
      const originalBuffStrength = moveTemplate?.buffStrength || 0;

      // Reset move to level 1 with all original values
      const updatedMoves = moves.map(m => 
        m.id === moveId 
          ? { 
              ...m, 
              masteryLevel: 1,
              damage: originalDamage > 0 ? originalDamage : m.damage,
              shieldBoost: originalShieldBoost > 0 ? originalShieldBoost : m.shieldBoost,
              healing: originalHealing > 0 ? originalHealing : m.healing,
              ppSteal: originalPpSteal > 0 ? originalPpSteal : m.ppSteal,
              debuffStrength: originalDebuffStrength > 0 ? originalDebuffStrength : m.debuffStrength,
              buffStrength: originalBuffStrength > 0 ? originalBuffStrength : m.buffStrength
            } 
          : m
      );

      // Update moves in database
      const movesRef = doc(db, 'battleMoves', currentUser.uid);
      await updateDoc(movesRef, { moves: updatedMoves });
      setMoves(updatedMoves);

      // Collect reset properties for the alert message
      const resetProperties: string[] = [];
      if (originalDamage > 0) {
        resetProperties.push(`Damage: ${originalDamage}`);
      }
      if (originalShieldBoost > 0) {
        resetProperties.push(`Shield Boost: ${originalShieldBoost}`);
      }
      if (originalHealing > 0) {
        resetProperties.push(`Healing: ${originalHealing}`);
      }
      if (originalDebuffStrength > 0) {
        resetProperties.push(`Debuff: ${originalDebuffStrength}`);
      }
      if (originalBuffStrength > 0) {
        resetProperties.push(`Buff: ${originalBuffStrength}`);
      }

      const resetInfo = resetProperties.length > 0 
        ? `\n\nBase values restored:\n${resetProperties.join('\n')}`
        : `\n\nBase values restored.`;
      
      console.log(`Reset ${move.name} to level 1 with original values`);
      alert(`✅ Successfully reset ${move.name} to Level 1!${resetInfo}`);
    } catch (err) {
      console.error('Error resetting move:', err);
      setError('Failed to reset move');
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

  const upgradeActionCard = async (cardId: string) => {
    if (!currentUser || !vault) return;
    
    try {
      const card = actionCards.find(c => c.id === cardId);
      if (!card) {
        setError('Action card not found');
        return;
      }

      if (!card.unlocked) {
        setError('Action card must be unlocked before upgrading');
        return;
      }

      if (card.masteryLevel >= 5) {
        setError('Action card is already at maximum level');
        return;
      }

      // Calculate exponential upgrade cost based on current level
      // Base price: 100 PP for Level 1 → Level 2
      // Then multiplied by the respective multiplier for each level
      const basePrice = 100;
      const nextLevel = card.masteryLevel + 1;
      let upgradeCost: number;
      if (nextLevel === 2) {
        // Level 1 → Level 2: base price
        upgradeCost = basePrice;
      } else if (nextLevel === 3) {
        // Level 2 → Level 3: base * 2
        upgradeCost = basePrice * 2;
      } else if (nextLevel === 4) {
        // Level 3 → Level 4: base * 4
        upgradeCost = basePrice * 4;
      } else if (nextLevel === 5) {
        // Level 4 → Level 5: base * 8
        upgradeCost = basePrice * 8;
      } else {
        upgradeCost = basePrice;
      }

      // Check if player has enough PP
      if (vault.currentPP < upgradeCost) {
        setError(`Not enough PP. Need ${upgradeCost} PP to upgrade.`);
        return;
      }

      // Calculate random boost multiplier based on the new level (same as moves)
      let boostMultiplier: number;
      switch (nextLevel) {
        case 2:
          boostMultiplier = 2.0 + Math.random() * 0.3; // Random between 2.0 and 2.3
          break;
        case 3:
          boostMultiplier = 1.25 + Math.random() * 0.25; // Random between 1.25 and 1.5
          break;
        case 4:
          boostMultiplier = 1.3 + Math.random() * 0.3; // Random between 1.3 and 1.6
          break;
        case 5:
          boostMultiplier = 2.0 + Math.random() * 0.5; // Random between 2.0 and 2.5
          break;
        default:
          boostMultiplier = 1.0;
      }

      // Apply boost multiplier to effect strength
      const currentStrength = card.effect.strength;
      const newStrength = Math.floor(currentStrength * boostMultiplier);
      
      // Update action card in database
      const cardsRef = doc(db, 'battleActionCards', currentUser.uid);
      const updatedCards = actionCards.map(c => 
        c.id === cardId ? {
          ...c,
          masteryLevel: c.masteryLevel + 1,
          effect: {
            ...c.effect,
            strength: newStrength
          },
          upgradeCost: upgradeCost
        } : c
      );
      await updateDoc(cardsRef, { cards: updatedCards });
      setActionCards(updatedCards);

      // Deduct PP from vault
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      await updateDoc(vaultRef, { 
        currentPP: vault.currentPP - upgradeCost 
      });

      // Update vault state
      setVault({ ...vault, currentPP: vault.currentPP - upgradeCost });

      const boostPercent = ((boostMultiplier - 1) * 100).toFixed(1);
      console.log(`Upgraded ${card.name} to level ${nextLevel} for ${upgradeCost} PP with ${boostPercent}% boost`);
      
      // Show success message with boost info
      alert(`✅ Successfully upgraded ${card.name} to Level ${nextLevel}!\n\nEffect boost: ${boostPercent}% (${boostMultiplier.toFixed(2)}x multiplier)\n\nStrength: ${currentStrength} → ${newStrength}`);
    } catch (err) {
      console.error('Error upgrading action card:', err);
      setError('Failed to upgrade action card');
    }
  };

  const activateActionCard = async (cardId: string) => {
    if (!currentUser) return;
    
    try {
      const card = actionCards.find(c => c.id === cardId);
      if (!card) {
        setError('Action card not found');
        return;
      }

      if (!card.unlocked) {
        setError('Action card is not unlocked');
        return;
      }

      if (card.uses <= 0) {
        setError('No uses remaining for this action card');
        return;
      }

      // Handle different action card types
      switch (card.effect.type) {
        case 'shield_restore':
          await executeShieldRestore(card);
          break;
        default:
          // For other cards, just consume a use (battle-only cards)
          const cardsRef = doc(db, 'battleActionCards', currentUser.uid);
          const updatedCards = actionCards.map(c => 
            c.id === cardId ? { ...c, uses: c.uses - 1 } : c
          );
          await updateDoc(cardsRef, { cards: updatedCards });
          setActionCards(updatedCards);
          break;
      }
    } catch (err) {
      console.error('Error using action card:', err);
      setError('Failed to use action card');
    }
  };

  const executeShieldRestore = async (card: ActionCard) => {
    if (!currentUser || !vault) return;
    
    try {
      // Calculate shield restoration
      const shieldRestoreAmount = card.effect.strength;
      const newShieldStrength = Math.min(vault.maxShieldStrength, vault.shieldStrength + shieldRestoreAmount);
      const actualShieldRestored = newShieldStrength - vault.shieldStrength;

      if (actualShieldRestored <= 0) {
        setError('Your shields are already at maximum strength');
        return;
      }

      // Update vault shield strength
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      await updateDoc(vaultRef, {
        shieldStrength: newShieldStrength
      });

      // Update student document
      const studentRef = doc(db, 'students', currentUser.uid);
      await updateDoc(studentRef, {
        shieldStrength: newShieldStrength
      });

      // Update local vault state
      setVault(prevVault => prevVault ? {
        ...prevVault,
        shieldStrength: newShieldStrength
      } : null);

      // Consume a use from the action card
      const cardsRef = doc(db, 'battleActionCards', currentUser.uid);
      const updatedCards = actionCards.map(c => 
        c.id === card.id ? { ...c, uses: c.uses - 1 } : c
      );
      await updateDoc(cardsRef, { cards: updatedCards });
      setActionCards(updatedCards);

      console.log(`🛡️ Shield Restore used: ${vault.shieldStrength} → ${newShieldStrength} (+${actualShieldRestored})`);
      setError(null); // Clear any previous errors
    } catch (err) {
      console.error('Error executing shield restore:', err);
      setError('Failed to restore shields');
    }
  };

  const resetActionCards = async () => {
    if (!currentUser) return;
    
    try {
      console.log('🔄 Resetting action cards to template defaults...');
      
      // Reset action cards to template defaults
      const resetCards = ACTION_CARD_TEMPLATES.map((template, index) => ({
        ...template,
        id: `card_${index + 1}`,
        unlocked: index < 2, // First two cards unlocked by default
        uses: template.maxUses, // Reset uses to maximum
        masteryLevel: 1, // Reset to level 1
      }));
      
      // Update in database
      const cardsRef = doc(db, 'battleActionCards', currentUser.uid);
      await updateDoc(cardsRef, { cards: resetCards });
      
      // Update local state
      setActionCards(resetCards);
      
      console.log('✅ Action cards reset successfully');
      setError(null);
    } catch (err) {
      console.error('Error resetting action cards:', err);
      setError('Failed to reset action cards');
    }
  };

  // Manifest Progress Management
  const manifestProgress: any = {
    // This will be populated with actual data from Firestore
    // For now, it's a placeholder
    currentLevel: 1,
    currentXP: 0,
    nextLevelXP: 100,
    totalXP: 0,
    movesUnlocked: 0,
    lastManifestUpgrade: new Date(),
  };

  const checkManifestMilestones = async (manifestType: string) => {
    if (!currentUser) return;
    
    try {
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      const userManifest = studentDoc.exists() ? 
        (studentDoc.data().manifest?.manifestId || studentDoc.data().manifestationType || 'reading') : 'reading';

      if (userManifest !== manifestType) {
        console.warn(`User manifest is ${userManifest}, but milestone check requested for ${manifestType}`);
        return;
      }

      const milestonesRef = doc(db, 'manifestMilestones', manifestType);
      const milestonesDoc = await getDoc(milestonesRef);

      if (!milestonesDoc.exists()) {
        console.warn(`No milestone data found for manifest type: ${manifestType}`);
        return;
      }

      const milestones = milestonesDoc.data();
      const currentXP = manifestProgress.currentXP;
      const currentLevel = manifestProgress.currentLevel;

      if (currentXP >= milestones.nextLevelXP) {
        const newLevel = currentLevel + 1;
        const newXP = currentXP - milestones.nextLevelXP;

        await updateDoc(milestonesRef, {
          currentLevel: newLevel,
          currentXP: newXP,
          nextLevelXP: milestones.nextLevelXP * 2, // Double XP for next level
          totalXP: milestones.totalXP + milestones.nextLevelXP,
          movesUnlocked: milestones.movesUnlocked + 1,
        });

        console.log(`Manifest ${manifestType} leveled up to ${newLevel}!`);
        // Optionally, unlock a new move here if the milestone unlocks it
        // For now, just log the event
      }
    } catch (err) {
      console.error('Error checking manifest milestones:', err);
      setError('Failed to check manifest milestones');
    }
  };

  const canPurchaseMove = (category: 'manifest' | 'elemental' | 'system') => {
    if (!currentUser) return false;
    
    // For now, return true for all categories to avoid async issues
    // This can be enhanced later with proper async data fetching
    return true;
  };

  const getNextMilestone = (manifestType: string) => {
    if (!currentUser) return null;
    
    // For now, return a basic milestone structure
    // This can be enhanced later with proper async data fetching
    return {
      level: 2,
      xpNeeded: 100,
      description: `Reach level 2 in ${manifestType}`
    };
  };

  // Elemental Progress Management
  const elementalProgress: any = {
    // This will be populated with actual data from Firestore
    // For now, it's a placeholder
    currentLevel: 1,
    currentXP: 0,
    nextLevelXP: 100,
    totalXP: 0,
    movesUnlocked: 0,
    lastElementalUpgrade: new Date(),
  };

  const checkElementalMilestones = async (elementalType: string) => {
    if (!currentUser) return;
    
    try {
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      const userManifest = studentDoc.exists() ? 
        (studentDoc.data().manifestationType || 'fire') : 'fire';

      if (userManifest !== elementalType) {
        console.warn(`User elemental is ${userManifest}, but milestone check requested for ${elementalType}`);
        return;
      }

      const milestonesRef = doc(db, 'elementalMilestones', elementalType);
      const milestonesDoc = await getDoc(milestonesRef);

      if (!milestonesDoc.exists()) {
        console.warn(`No milestone data found for elemental type: ${elementalType}`);
        return;
      }

      const milestones = milestonesDoc.data();
      const currentXP = elementalProgress.currentXP;
      const currentLevel = elementalProgress.currentLevel;

      if (currentXP >= milestones.nextLevelXP) {
        const newLevel = currentLevel + 1;
        const newXP = currentXP - milestones.nextLevelXP;

        await updateDoc(milestonesRef, {
          currentLevel: newLevel,
          currentXP: newXP,
          nextLevelXP: milestones.nextLevelXP * 2, // Double XP for next level
          totalXP: milestones.totalXP + milestones.nextLevelXP,
          movesUnlocked: milestones.movesUnlocked + 1,
        });

        console.log(`Elemental ${elementalType} leveled up to ${newLevel}!`);
        // Optionally, unlock a new move here if the milestone unlocks it
        // For now, just log the event
      }
    } catch (err) {
      console.error('Error checking elemental milestones:', err);
      setError('Failed to check elemental milestones');
    }
  };

  const canPurchaseElementalMove = (elementalType: string) => {
    if (!currentUser) return false;
    
    // For now, return true for all elemental types to avoid async issues
    // This can be enhanced later with proper async data fetching
    return true;
  };

  const getNextElementalMilestone = (elementalType: string) => {
    if (!currentUser) return null;
    
    // For now, return a basic milestone structure
    // This can be enhanced later with proper async data fetching
    return {
      level: 2,
      xpNeeded: 100,
      description: `Reach level 2 in ${elementalType}`
    };
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

  // Helper function to calculate XP reward for PP stolen
  const calculateXpReward = (ppStolen: number): number => {
    if (ppStolen <= 0) return 0;
    
    // XP reward based on PP stolen: 1-5 XP depending on amount
    if (ppStolen <= 5) return 1;
    if (ppStolen <= 10) return 2;
    if (ppStolen <= 20) return 3;
    if (ppStolen <= 35) return 4;
    return 5; // 5 XP for 35+ PP stolen
  };

  // Helper function to award XP for battle actions
  const awardBattleXp = async (xpAmount: number, reason: string) => {
    if (!currentUser || xpAmount <= 0) return;
    
    try {
      console.log(`🎯 AWARDING XP: ${xpAmount} XP for: ${reason}`);
      
      // Update student document XP
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      
      if (studentDoc.exists()) {
        const studentData = studentDoc.data();
        const currentXP = studentData.xp || 0;
        const newXP = currentXP + xpAmount;
        
        console.log(`📊 XP UPDATE: ${currentXP} → ${newXP} (+${xpAmount})`);
        
        await updateDoc(studentRef, {
          xp: newXP
        });
        
        console.log('✅ Student document XP updated in database');
        
        // Verify the update by reading the document again
        const verifyDoc = await getDoc(studentRef);
        if (verifyDoc.exists()) {
          const verifyData = verifyDoc.data();
          console.log('🔍 Verification - XP in database after update:', verifyData.xp);
          console.log('🔍 Verification - Full student data after update:', verifyData);
        }
        
        // Create notification for XP gain
        try {
          await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
            type: 'xp_gain',
            title: 'XP Earned!',
            message: `+${xpAmount} XP for ${reason}`,
            xpAmount: xpAmount,
            reason: reason,
            timestamp: serverTimestamp(),
            read: false
          });
          console.log('📢 XP notification created');
        } catch (notificationError) {
          console.error('❌ Error creating XP notification:', notificationError);
        }
        
        console.log(`🎉 XP AWARD COMPLETE: ${currentXP} → ${newXP} (+${xpAmount})`);
      } else {
        console.error('❌ Student document not found for XP update');
      }
      
    } catch (error) {
      console.error('❌ Error awarding battle XP:', error);
    }
  };

  const executeVaultSiegeAttack = async (moveId: string | null, targetUserId: string, actionCardId?: string) => {
    console.log('🚨🚨🚨 EXECUTE VAULT SIEGE ATTACK CALLED - THIS MUST APPEAR! 🚨🚨🚨');
    console.log('🔥 NEW CODE - executeVaultSiegeAttack called!');
    console.log('🔥 Early validation check:', { currentUser: !!currentUser, vault: !!vault });
    console.log('🔥 Attack parameters:', { moveId, targetUserId, actionCardId });
    if (!currentUser || !vault) {
      console.log('🔥 Early return: No user or vault found');
      return { success: false, message: 'No user or vault found' };
    }
    
    // Note: Move consumption is now handled by BattleEngine before calling this function
    // No need to consume moves here to avoid double consumption
    
    try {
      console.log('Executing vault siege attack:', { moveId, targetUserId, actionCardId });
      
      // Get target vault first
      const targetVaultRef = doc(db, 'vaults', targetUserId);
      const targetVaultDoc = await getDoc(targetVaultRef);
      
      if (!targetVaultDoc.exists()) {
        throw new Error('Target vault not found');
      }
      
      const targetVaultData = targetVaultDoc.data() as Vault;
      
      // Get target student data to sync vault PP from student PP (student PP is the source of truth)
      const targetStudentRef = doc(db, 'students', targetUserId);
      const targetStudentDoc = await getDoc(targetStudentRef);
      const targetStudentPP = targetStudentDoc.exists() ? (targetStudentDoc.data().powerPoints || 0) : 0;
      
      console.log('🔥 Target data before sync:', { 
        vaultPP: targetVaultData.currentPP,
        studentPP: targetStudentPP,
        shieldStrength: targetVaultData.shieldStrength,
        overshield: targetVaultData.overshield
      });
      
      // Sync target vault PP FROM student PP (student PP is the source of truth)
      // If vault PP doesn't match student PP, update vault to match student
      if (targetVaultData.currentPP !== targetStudentPP) {
        console.log(`🔄 Syncing target vault PP from ${targetVaultData.currentPP} to ${targetStudentPP} (from student PP)`);
        await updateDoc(targetVaultRef, { currentPP: targetStudentPP });
        targetVaultData.currentPP = targetStudentPP; // Update local copy for calculations
      }
      
      console.log('🔍 COMPARISON - Target data sources:', {
        targetUserId,
        vaultPP: targetVaultData.currentPP,
        studentPP: targetStudentPP,
        vaultDocId: targetVaultDoc.id,
        studentDocId: targetStudentDoc.id,
        synced: targetVaultData.currentPP === targetStudentPP
      });
      
      console.log('🔍 Target vault data loaded:', {
        targetUserId,
        targetVaultData: {
          currentPP: targetVaultData.currentPP,
          shieldStrength: targetVaultData.shieldStrength,
          maxShieldStrength: targetVaultData.maxShieldStrength
        }
      });
      
      // Get the move data
      const selectedMove = moveId ? moves.find(m => m.id === moveId) : null;
      const selectedCard = actionCardId ? actionCards.find(c => c.id === actionCardId) : null;
      
      console.log('🔍 Move lookup:', { moveId, selectedMove: selectedMove?.name, selectedMoveType: selectedMove?.type });
      
      if (!selectedMove && !selectedCard) {
        throw new Error('No move or action card selected');
      }
      
      // Calculate attack results
      let damage = 0;
      let ppStolen = 0;
      let shieldDamage = 0;
      let message = '';
      
      if (selectedMove) {
        console.log(`🔍 Processing move: ${selectedMove.name}, type: ${selectedMove.type}, damage: ${selectedMove.damage}, shieldBoost: ${selectedMove.shieldBoost}`);
        
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
          
          // Update local vault state to reflect shield boost
          setVault(prevVault => prevVault ? {
            ...prevVault,
            shieldStrength: newShieldStrength
          } : null);
          
          console.log(`Defensive move ${selectedMove.name} boosted attacker shields: ${vault.shieldStrength} → ${newShieldStrength} (+${actualShieldBoost})`);
          console.log('Local vault state updated with new shield strength:', newShieldStrength);
          message = `Used ${selectedMove.name} - Boosted shields by ${actualShieldBoost}`;
          
          // For defensive moves, we don't damage the target or steal PP
          shieldDamage = 0;
          ppStolen = 0;
        } else {
          // This is an offensive move
          // Use the move's actual damage property if it exists (from upgrades), otherwise use lookup
          let totalDamage: number;
          if (selectedMove.damage && selectedMove.damage > 0) {
            // Use the upgraded damage directly (already includes boost multiplier)
            totalDamage = selectedMove.damage;
            console.log(`🔍 Using upgraded damage for ${selectedMove.name}:`, totalDamage);
          } else {
            // Fall back to lookup for moves that haven't been upgraded yet
            const moveDamageValue = await getMoveDamage(selectedMove.name);
            console.log(`🔍 Move damage lookup for ${selectedMove.name}:`, moveDamageValue);
            
            if (moveDamageValue) {
              // Handle both single damage values and damage ranges
              if (typeof moveDamageValue === 'object') {
                // It's a range, use the max value for damage calculation
                totalDamage = moveDamageValue.max;
              } else {
                // It's a single value
                totalDamage = moveDamageValue;
              }
            } else {
              totalDamage = 0;
            }
          }
          
          // Check for direct PP steal property on the move (e.g., Ember Jab has ppSteal: 7)
          let directPPSteal = 0;
          if (selectedMove.ppSteal && selectedMove.ppSteal > 0) {
            // Use ppSteal directly - it's already been upgraded with boost multipliers in upgradeMove
            // Don't apply mastery multiplier again here to avoid double-counting
            directPPSteal = selectedMove.ppSteal;
            console.log(`💰 Move ${selectedMove.name} has direct PP steal: ${directPPSteal} (already upgraded)`);
          }

          if (totalDamage > 0) {
            console.log(`⚔️ Move ${selectedMove.name} total damage: ${totalDamage}`);
            console.log(`🛡️ Target shield strength: ${targetVaultData.shieldStrength}`);
            console.log(`💰 Target current PP: ${targetVaultData.currentPP}`);
            console.log(`💰 Direct PP steal from move property: ${directPPSteal}`);
            
            // Apply damage to shields first, then to PP
            if (targetVaultData.shieldStrength > 0) {
              // Damage shields first
              shieldDamage = Math.min(totalDamage, targetVaultData.shieldStrength);
              const remainingDamage = totalDamage - shieldDamage;
              
              // Remaining damage goes to PP
              let damageBasedPPSteal = 0;
              if (remainingDamage > 0) {
                damageBasedPPSteal = Math.min(remainingDamage, targetVaultData.currentPP);
              }
              
              // Use remaining damage as PP steal (don't add directPPSteal here - it's already part of damage)
              ppStolen = damageBasedPPSteal;
              
              if (ppStolen > 0 || shieldDamage > 0) {
                message = `Used ${selectedMove.name} - Dealt ${totalDamage} damage (${shieldDamage} to shields${ppStolen > 0 ? `, ${ppStolen} to PP` : ''})`;
              } else {
                message = `Used ${selectedMove.name} - Dealt ${shieldDamage} damage to shields`;
              }
            } else {
              // No shields, all damage goes to PP
              // Use total damage as PP steal (don't use directPPSteal - it's already part of total damage)
              ppStolen = Math.min(totalDamage, targetVaultData.currentPP);
              
              if (ppStolen > 0) {
                message = `Used ${selectedMove.name} - Dealt ${ppStolen} damage to PP (no shields)`;
              } else {
                message = `Used ${selectedMove.name} - Dealt 0 damage to PP (target has no PP to steal)`;
              }
              
              console.log(`💰 No shields - Damage: ${totalDamage}, Final PP stolen: ${ppStolen}`);
            }
          } else {
            // No damage value found, but check if move has ppSteal property
            if (directPPSteal > 0) {
              // Move has direct PP steal but no damage - apply PP steal directly
              if (targetVaultData.shieldStrength > 0) {
                // Can still steal PP even if target has shields (but reduced)
                ppStolen = Math.min(Math.floor(directPPSteal / 2), targetVaultData.currentPP);
                message = `Used ${selectedMove.name} - Stole ${ppStolen} PP (reduced by shields)`;
              } else {
                // No shields, full PP steal
                ppStolen = Math.min(directPPSteal, targetVaultData.currentPP);
                message = `Used ${selectedMove.name} - Stole ${ppStolen} PP (no shields)`;
              }
              console.log(`💰 Using direct PP steal (no damage value): ${ppStolen}`);
            } else {
              console.log(`⚠️ No damage value found for move ${selectedMove.name}, using fallback damage`);
              // Give a small amount of damage for moves that don't have damage values
              const fallbackDamage = 5; // Minimum damage for any offensive move
              
              // Apply damage to shields first, then to PP
              if (targetVaultData.shieldStrength > 0) {
                shieldDamage = Math.min(fallbackDamage, targetVaultData.shieldStrength);
                const remainingDamage = fallbackDamage - shieldDamage;
                
                if (remainingDamage > 0) {
                  ppStolen = Math.min(remainingDamage, targetVaultData.currentPP);
                  message = `Used ${selectedMove.name} - Dealt ${fallbackDamage} damage (${shieldDamage} to shields, ${ppStolen} to PP) [fallback]`;
                } else {
                  message = `Used ${selectedMove.name} - Dealt ${shieldDamage} damage to shields [fallback]`;
                }
              } else {
                ppStolen = Math.min(fallbackDamage, targetVaultData.currentPP);
                message = `Used ${selectedMove.name} - Dealt ${ppStolen} damage to PP (no shields) [fallback]`;
              }
            }
          }
          
          // Ensure ppStolen is set even if totalDamage was 0 but directPPSteal exists
          // (This handles cases where damage lookup returns 0 but move has ppSteal)
          if (ppStolen === 0 && directPPSteal > 0 && targetVaultData.shieldStrength === 0) {
            ppStolen = Math.min(directPPSteal, targetVaultData.currentPP);
            message = `Used ${selectedMove.name} - Stole ${ppStolen} PP (no shields, direct steal)`;
            console.log(`💰 Applied direct PP steal after damage calculation: ${ppStolen}`);
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
          case 'shield_restore':
            // Restore attacker's shield strength
            const shieldRestoreAmount = selectedCard.effect.strength;
            const newShieldStrength = Math.min(vault.maxShieldStrength, vault.shieldStrength + shieldRestoreAmount);
            const actualShieldRestored = newShieldStrength - vault.shieldStrength;
            
            // Update attacker's vault with shield restoration
            await updateDoc(doc(db, 'vaults', currentUser.uid), {
              shieldStrength: newShieldStrength
            });
            
            // Update attacker's student document
            await updateDoc(doc(db, 'students', currentUser.uid), {
              shieldStrength: newShieldStrength
            });
            
            // Update local vault state to reflect shield restoration
            setVault(prevVault => prevVault ? {
              ...prevVault,
              shieldStrength: newShieldStrength
            } : null);
            
            console.log(`🛡️ Shield Restore: ${vault.shieldStrength} → ${newShieldStrength} (+${actualShieldRestored})`);
            message += ` • Used ${selectedCard.name} to restore shields (+${actualShieldRestored} shield strength)`;
            break;
          case 'teleport_pp':
            ppStolen = Math.min(selectedCard.effect.strength, targetVaultData.currentPP);
            message += ` • Used ${selectedCard.name} to steal PP`;
            break;
          default:
            message += ` • Used ${selectedCard.name}`;
        }
      }
      
      console.log(`🔍 Shield damage after move and card processing: ${shieldDamage}`);
      
      // Get player names for notifications and attack records
      const attackerName = currentUser.displayName || 'Unknown';
      // Reuse targetStudentDoc that was already fetched above for syncing
      const targetName = targetStudentDoc.exists() ? targetStudentDoc.data().displayName || 'Unknown' : 'Unknown';
      
      // Apply damage to target vault
      const updates: Partial<Vault> = {};
      let shieldsCracked = false;
      
      // Check for overshield first
      let overshieldAbsorbed = false;
      if (targetVaultData.overshield > 0) {
        // Overshield absorbs the entire attack
        overshieldAbsorbed = true;
        shieldDamage = 0; // No shield damage
        ppStolen = 0; // No PP stolen
        
        // Reduce overshield by 1
        const newOvershield = Math.max(0, targetVaultData.overshield - 1);
        updates.overshield = newOvershield;
        
        console.log(`✨ Overshield absorbed attack! Original overshield: ${targetVaultData.overshield}, New overshield: ${newOvershield}`);
        console.log(`🔍 Updates object:`, updates);
        message = `Attack absorbed by overshield! (${newOvershield} overshield${newOvershield !== 1 ? 's' : ''} remaining)`;
        
        // Create notification for the target player about overshield usage
        try {
          await addDoc(collection(db, 'students', targetUserId, 'notifications'), {
            type: 'overshield_used',
            title: '🛡️ Overshield Activated!',
            message: `Your overshield blocked an attack from ${attackerName}! (${newOvershield} overshield${newOvershield !== 1 ? 's' : ''} remaining)`,
            attackerName: attackerName,
            attackerId: currentUser.uid,
            overshieldRemaining: newOvershield,
            timestamp: serverTimestamp()
          });
          console.log(`📢 Created overshield notification for ${targetName}`);
        } catch (notificationError) {
          console.error('❌ Error creating overshield notification:', notificationError);
        }
      }
      
      if (shieldDamage > 0) {
        const originalShieldStrength = targetVaultData.shieldStrength;
        const newShieldStrength = Math.max(0, targetVaultData.shieldStrength - shieldDamage);
        updates.shieldStrength = newShieldStrength;
        
        // Check if shields were completely broken (went from >0 to 0)
        if (originalShieldStrength > 0 && newShieldStrength === 0) {
          shieldsCracked = true;
          console.log(`🛡️ Shields broken! Original: ${originalShieldStrength}, Damage: ${shieldDamage}, New: ${newShieldStrength}`);
        } else {
          console.log(`Shield damage calculation: ${originalShieldStrength} - ${shieldDamage} = ${newShieldStrength}`);
        }
      }
      
      if (ppStolen > 0) {
        console.log('💰 PP will be stolen, updating attacker and target PP');
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
        
        // Update local vault state to reflect PP gain
        setVault(prevVault => prevVault ? {
          ...prevVault,
          currentPP: newAttackerPP
        } : null);
        
        // Create notification for PP gain
        try {
          await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
            type: 'pp_gain',
            title: 'PP Stolen!',
            message: `+${ppStolen} PP stolen from vault attack`,
            ppAmount: ppStolen,
            timestamp: serverTimestamp(),
            read: false
          });
        } catch (notificationError) {
          console.error('Error creating PP notification:', notificationError);
        }
        
        console.log('=== PP TRANSFER COMPLETED ===');
        console.log('Attacker vault updated:', newAttackerPP);
        console.log('Attacker student doc updated:', newAttackerPP);
        console.log('Target student doc updated:', updates.currentPP);
        console.log('Local vault state updated with new PP:', newAttackerPP);
      } else {
        console.log('💰 No PP stolen, skipping PP updates');
      }
      
      // Update target vault
      if (Object.keys(updates).length > 0) {
        console.log('Updating target vault with:', updates);
        await updateDoc(targetVaultRef, updates);
        console.log('Target vault updated successfully');
        
        // After updating target vault, ensure target student PP matches vault PP
        // (vault PP is now the source after attack)
        if (updates.currentPP !== undefined) {
          await updateDoc(targetStudentRef, { powerPoints: updates.currentPP });
          console.log(`🔄 Synced target student PP to vault PP after attack: ${updates.currentPP}`);
        }
        
        // Verify the update by reading the vault again
        const updatedVaultDoc = await getDoc(targetVaultRef);
        if (updatedVaultDoc.exists()) {
          const updatedVaultData = updatedVaultDoc.data() as Vault;
          console.log('Verified vault update - new shield strength:', updatedVaultData.shieldStrength);
          console.log('Verified vault update - new PP:', updatedVaultData.currentPP);
          console.log('Verified vault update - new overshield:', updatedVaultData.overshield);
        }
      }
      
      // Player names already retrieved above for notifications
      
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
        
        // Award XP for stealing PP
        if (ppStolen > 0) {
          const xpReward = calculateXpReward(ppStolen);
          if (xpReward > 0) {
            await awardBattleXp(xpReward, `Stole ${ppStolen} PP from ${targetName}`);
          }
        }
      }
      
      // Award XP for shield damage (even if no PP was stolen)
      console.log(`🔍 Final shield damage value before XP check: ${shieldDamage}`);
      if (shieldDamage > 0 && !overshieldAbsorbed) {
        const shieldXpReward = Math.min(shieldDamage, 3); // 1-3 XP for shield damage
        console.log(`🛡️ Awarding ${shieldXpReward} XP for shield damage: ${shieldDamage}`);
        await awardBattleXp(shieldXpReward, `Dealt ${shieldDamage} shield damage to ${targetName}`);
      } else if (overshieldAbsorbed) {
        console.log('✨ Attack absorbed by overshield, no XP awarded');
      } else {
        console.log('⚠️ No shield damage dealt, no XP awarded for shield damage');
      }

      // Award minimum XP for any successful attack (even if no PP stolen and no shield damage)
      if (ppStolen === 0 && shieldDamage === 0 && !overshieldAbsorbed && (selectedMove || selectedCard)) {
        const minimumXpReward = 1; // Always give at least 1 XP for a successful attack
        console.log(`🎯 Awarding minimum ${minimumXpReward} XP for successful attack with no damage`);
        await awardBattleXp(minimumXpReward, `Successfully attacked ${targetName}`);
      }
      
      // Award XP for cracking shields (even if no PP was stolen)
      if (shieldsCracked) {
        const shieldXpReward = 2; // 2 XP for cracking shields
        await awardBattleXp(shieldXpReward, `Cracked shields of ${targetName}`);
      }
    
      // Record the attack with detailed information
      const attackData: any = {
        attackerId: currentUser.uid,
        attackerName,
        targetId: targetUserId,
        targetName,
        moveId: moveId || null,
        moveName: selectedMove?.name || null,
        damage: damage || 0,
        ppStolen: ppStolen || 0,
        shieldDamage: shieldDamage || 0,
        message: message || 'Attack completed',
        overshieldAbsorbed: overshieldAbsorbed || false,
        timestamp: serverTimestamp(),
        targetVaultBefore: {
          currentPP: targetVaultData.currentPP,
          shieldStrength: targetVaultData.shieldStrength,
          overshield: targetVaultData.overshield || 0,
        },
        targetVaultAfter: {
          currentPP: updates.currentPP !== undefined ? updates.currentPP : targetVaultData.currentPP,
          shieldStrength: updates.shieldStrength !== undefined ? updates.shieldStrength : targetVaultData.shieldStrength,
          overshield: updates.overshield !== undefined ? updates.overshield : (targetVaultData.overshield || 0),
        },
        ppStolenFromTarget: ppStolen || 0,
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
    
      // Refresh vault data to ensure everything is synchronized
      await refreshVaultData();
      
      // Calculate total XP gained
      let totalXpGained = 0;
      if (ppStolen > 0) {
        totalXpGained += calculateXpReward(ppStolen);
      }
      if (shieldDamage > 0 && !overshieldAbsorbed) {
        totalXpGained += Math.min(shieldDamage, 3);
      }
      if (shieldsCracked) {
        totalXpGained += 2;
      }
      // Add minimum XP for successful attacks with no damage
      if (ppStolen === 0 && shieldDamage === 0 && !overshieldAbsorbed && (selectedMove || selectedCard)) {
        totalXpGained += 1;
      }

      // Return the attack results
      return {
        success: true,
        message: message,
        ppStolen: ppStolen,
        xpGained: totalXpGained,
        shieldDamage: shieldDamage,
        overshieldAbsorbed: overshieldAbsorbed
      };
      
    } catch (err) {
      console.error('Error executing vault siege attack:', err);
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Unknown error occurred'
      };
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

  const consumeOfflineMove = async (): Promise<boolean> => {
    if (!currentUser) return false;
    
    const remainingMoves = getRemainingOfflineMoves();
    console.log('🔥 consumeOfflineMove: Current remaining moves before consumption:', remainingMoves);
    if (remainingMoves <= 0) {
      console.log('🔥 No offline moves remaining');
      return false;
    }
    
    try {
      // Create an offline move record to track the consumption
      const moveData: Omit<OfflineMove, 'id'> = {
        userId: currentUser.uid,
        type: 'vault_attack',
        status: 'completed',
        createdAt: new Date(),
      };
      
      console.log('🔥 consumeOfflineMove: Creating vault_attack record:', moveData);
      await addDoc(collection(db, 'offlineMoves'), moveData);
      console.log('🔥 Offline move consumed successfully');
      
      // Wait a bit for the Firestore listener to update the state
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Force an immediate recalculation after the listener has had time to update
      const newRemainingMoves = getRemainingOfflineMoves();
      console.log('🔥 consumeOfflineMove: Remaining moves after consumption (after delay):', newRemainingMoves);
      
      return true;
    } catch (err) {
      console.error('Error consuming offline move:', err);
      return false;
    }
  };

  const getRemainingOfflineMoves = (): number => {
    if (!currentUser) return 0;
    
    // Get current day start (8am EST) instead of midnight
    const today = getCurrentDayStart();
    
    // Count vault siege attacks from attackHistory (these consume offline moves)
    const todayVaultSiegeAttacks = attackHistory.filter(attack => {
      if (!attack.timestamp) return false; // Skip attacks without timestamps
      
      try {
        // Handle Firestore Timestamp objects and regular Date objects
        let attackDate: Date;
        if (attack.timestamp && typeof attack.timestamp === 'object' && 'toDate' in attack.timestamp) {
          // Firestore Timestamp
          attackDate = (attack.timestamp as any).toDate();
        } else if (attack.timestamp instanceof Date) {
          // Regular Date object
          attackDate = attack.timestamp;
        } else if (typeof attack.timestamp === 'string') {
          // String timestamp
          attackDate = new Date(attack.timestamp);
        } else {
          // Invalid timestamp
          console.log('🔥 Invalid attack timestamp:', attack.timestamp);
          return false;
        }
        
        // Compare dates using 8am EST day boundary
        const attackDayStart = getDayStartForDate(attackDate);
        return attackDayStart.getTime() === today.getTime() && attack.attackerId === currentUser.uid;
      } catch (error) {
        console.error('Error processing attack timestamp:', error, attack);
        return false; // Skip attacks with invalid timestamps
      }
    });

    // Also count vault_attack records from offlineMoves collection (these also consume offline moves)
    const todayOfflineMovesAttacks = offlineMoves.filter(move => {
      try {
        // Handle different timestamp formats
        let moveDate: Date;
        if (move.createdAt && typeof move.createdAt === 'object' && 'toDate' in move.createdAt) {
          // Firestore Timestamp
          moveDate = (move.createdAt as any).toDate();
        } else if (move.createdAt instanceof Date) {
          // Regular Date object
          moveDate = move.createdAt;
        } else if (typeof move.createdAt === 'string') {
          // String timestamp
          moveDate = new Date(move.createdAt);
        } else {
          // Invalid timestamp
          console.log('🔥 Invalid move timestamp:', move.createdAt);
          return false;
        }
        
        // Check if the date is valid
        if (isNaN(moveDate.getTime())) {
          console.log('🔥 Move Filter Debug: Invalid date for move:', {
            moveId: move.id,
            moveType: move.type,
            moveCreatedAt: move.createdAt,
            error: 'Invalid date'
          });
          return false;
        }
        
        // Compare dates using 8am EST day boundary
        const moveDayStart = getDayStartForDate(moveDate);
        const isToday = moveDayStart.getTime() === today.getTime();
        const isVaultAttack = move.type === 'vault_attack';
        const isCurrentUser = move.userId === currentUser.uid;
        
        return isToday && isVaultAttack && isCurrentUser;
      } catch (error) {
        console.log('🔥 Move Filter Debug: Error processing move:', {
          moveId: move.id,
          moveType: move.type,
          moveCreatedAt: move.createdAt,
          error: error instanceof Error ? error.message : String(error)
        });
        return false;
      }
    });
    
    // Count move restores (these restore offline moves)
    const todayMoveRestores = offlineMoves.filter(move => {
      try {
        // Handle different timestamp formats
        let moveDate: Date;
        if (move.createdAt && typeof move.createdAt === 'object' && 'toDate' in move.createdAt) {
          // Firestore Timestamp
          moveDate = (move.createdAt as any).toDate();
        } else if (move.createdAt instanceof Date) {
          // Regular Date object
          moveDate = move.createdAt;
        } else if (typeof move.createdAt === 'string') {
          // String timestamp
          moveDate = new Date(move.createdAt);
        } else {
          // Invalid timestamp
          console.log('🔥 Invalid move timestamp:', move.createdAt);
          return false;
        }
        
        // Check if the date is valid
        if (isNaN(moveDate.getTime())) {
          console.log('🔥 Move Filter Debug: Invalid date for move:', {
            moveId: move.id,
            moveType: move.type,
            moveCreatedAt: move.createdAt,
            error: 'Invalid date'
          });
          return false;
        }
        
        // Compare dates using 8am EST day boundary
        const moveDayStart = getDayStartForDate(moveDate);
        const isToday = moveDayStart.getTime() === today.getTime();
        const isMoveRestore = move.type === 'move_restore';
        
        // Debug logging commented out to reduce console noise
        // logger.battle.debug('Move Filter Debug:', {
        //   moveId: move.id,
        //   moveType: move.type,
        //   moveCreatedAt: move.createdAt,
        //   moveDate: moveDate.toISOString(),
        //   today: today.toISOString(),
        //   isToday,
        //   isMoveRestore,
        //   shouldInclude: isToday && isMoveRestore
        // });
        
        return isToday && isMoveRestore;
      } catch (error) {
        console.log('🔥 Move Filter Debug: Error processing move:', {
          moveId: move.id,
          moveType: move.type,
          moveCreatedAt: move.createdAt,
          error: error instanceof Error ? error.message : String(error)
        });
        return false;
      }
    });
    
    // Calculate: start with daily limit, subtract attacks, add restores, but cap at daily limit
    const baseMoves = BATTLE_CONSTANTS.DAILY_OFFLINE_MOVES; // Start with 3 daily moves
    const movesUsed = todayVaultSiegeAttacks.length + todayOfflineMovesAttacks.length; // Attacks consume moves (from both sources)
    const movesRestored = todayMoveRestores.length; // Restores add moves back
    const remainingMoves = Math.min(
      BATTLE_CONSTANTS.DAILY_OFFLINE_MOVES, // Cap at daily limit
      Math.max(0, baseMoves - movesUsed + movesRestored) // Don't go below 0
    );
    
    // logger.battle.debug('Offline Moves Calculation:', {
    //   totalOfflineMoves: offlineMoves.length,
    //   baseMoves,
    //   todayVaultSiegeAttacks: todayVaultSiegeAttacks.length,
    //   todayOfflineMovesAttacks: todayOfflineMovesAttacks.length,
    //   todayMoveRestores: todayMoveRestores.length,
    //   movesUsed,
    //   movesRestored,
    //   dailyLimit: BATTLE_CONSTANTS.DAILY_OFFLINE_MOVES,
    //   remainingMoves,
    //   todayDate: today.toISOString(),
    //   attackDetails: todayVaultSiegeAttacks.map(attack => ({
    //     id: attack.id,
    //     timestamp: attack.timestamp,
    //     attackerId: attack.attackerId,
    //     targetId: attack.targetId
    //   })),
    //   offlineMovesAttackDetails: todayOfflineMovesAttacks.map(move => ({
    //     id: move.id,
    //     createdAt: move.createdAt,
    //     type: move.type,
    //     userId: move.userId
    //   })),
    //   restoreDetails: todayMoveRestores.map(move => ({
    //     id: move.id,
    //     createdAt: move.createdAt,
    //     status: move.status,
    //     type: move.type
    //   }))
    // });
    
    return remainingMoves;
  };

  const debugOfflineMoves = () => {
    if (!currentUser) {
      console.log('🔥 Debug: No current user');
      return;
    }
    
    const today = getCurrentDayStart(); // Use 8am EST day boundary
    
    console.log('🔥 Debug: Offline Moves Analysis');
    console.log('🔥 Debug: Today (8am EST):', today.toISOString());
    console.log('🔥 Debug: Current user:', currentUser.uid);
    console.log('🔥 Debug: Total offline moves:', offlineMoves.length);
    console.log('🔥 Debug: Total attack history:', attackHistory.length);
    
    // Show all offline moves for today
    const todayMoves = offlineMoves.filter(move => {
      try {
        let moveDate: Date;
        if (move.createdAt && typeof move.createdAt === 'object' && 'toDate' in move.createdAt) {
          moveDate = (move.createdAt as any).toDate();
        } else if (move.createdAt instanceof Date) {
          moveDate = move.createdAt;
        } else if (typeof move.createdAt === 'string') {
          moveDate = new Date(move.createdAt);
        } else {
          return false;
        }
        
        // Compare dates using 8am EST day boundary
        const moveDayStart = getDayStartForDate(moveDate);
        return moveDayStart.getTime() === today.getTime() && move.userId === currentUser.uid;
      } catch (error) {
        return false;
      }
    });
    
    console.log('🔥 Debug: Today\'s moves:', todayMoves.map(move => ({
      id: move.id,
      type: move.type,
      status: move.status,
      createdAt: move.createdAt
    })));
    
    // Show all attack history for today
    const todayAttacks = attackHistory.filter(attack => {
      try {
        let attackDate: Date;
        if (attack.timestamp && typeof attack.timestamp === 'object' && 'toDate' in attack.timestamp) {
          attackDate = (attack.timestamp as any).toDate();
        } else if (attack.timestamp instanceof Date) {
          attackDate = attack.timestamp;
        } else if (typeof attack.timestamp === 'string') {
          attackDate = new Date(attack.timestamp);
        } else {
          return false;
        }
        
        // Compare dates using 8am EST day boundary
        const attackDayStart = getDayStartForDate(attackDate);
        return attackDayStart.getTime() === today.getTime() && attack.attackerId === currentUser.uid;
      } catch (error) {
        return false;
      }
    });
    
    console.log('🔥 Debug: Today\'s attacks:', todayAttacks.map(attack => ({
      id: attack.id,
      attackerId: attack.attackerId,
      targetId: attack.targetId,
      timestamp: attack.timestamp
    })));
    
    const remainingMoves = getRemainingOfflineMoves();
    // logger.battle.debug('Debug: Calculated remaining moves:', remainingMoves);
  };

  const value: BattleContextType = {
    vault,
    updateVault,
    upgradeVaultCapacity,
    upgradeVaultShields,
    upgradeVaultFirewall,
    restoreVaultShields,
    payDues,
    syncVaultPP,
    syncStudentPP,
    refreshVaultData,
    moves,
    unlockMove,
    unlockElementalMoves,
    forceUnlockAllMoves,
    resetMovesWithElementFilter,
    applyElementFilterToExistingMoves,
    forceMigration,
    upgradeMove,
    resetMoveLevel,
    actionCards,
    setActionCards,
    unlockActionCard,
    upgradeActionCard,
    activateActionCard,
    resetActionCards,
    manifestProgress,
    checkManifestMilestones,
    canPurchaseMove,
    getNextMilestone,
    elementalProgress,
    checkElementalMilestones,
    canPurchaseElementalMove,
    getNextElementalMilestone,
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
    consumeOfflineMove,
    debugOfflineMoves,
    loading,
    error,
    success,
    setError,
    setSuccess,
  };

  return (
    <BattleContext.Provider value={value}>
      {children}
    </BattleContext.Provider>
  );
}; 