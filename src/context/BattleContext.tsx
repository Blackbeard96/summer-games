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
  serverTimestamp,
  deleteField
} from 'firebase/firestore';
import { logger } from '../utils/debugLogger';
import { updateChallengeProgressByType } from '../utils/dailyChallengeTracker';
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
import { getActivePPBoost, applyPPBoost } from '../utils/ppBoost';
import { getElementalRingLevel, getArtifactDamageMultiplier, getEffectiveMasteryLevel } from '../utils/artifactUtils';
import { calculateDamageRange, rollDamage } from '../utils/damageCalculator';

interface BattleContextType {
  // Vault Management
  vault: Vault | null;
  updateVault: (updates: Partial<Vault>) => Promise<void>;
  upgradeVaultCapacity: () => Promise<void>;
  upgradeVaultShields: () => Promise<void>;
  upgradeGenerator: () => Promise<void>;
  collectGeneratorPP: () => Promise<void>;
  getGeneratorRates: (level: number) => { ppPerDay: number; shieldsPerDay: number };
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
  forceMigration: (resetLevels?: boolean) => Promise<void>;
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
  
  // Inventory Management
  inventory: string[];
  artifacts: any[];
  activateArtifact: (artifactName: string) => Promise<void>;
  refreshInventory: () => Promise<void>;
  
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

// Helper function to calculate max vault health (always 10% of capacity)
const calculateMaxVaultHealth = (capacity: number): number => {
  return Math.floor(capacity * 0.1);
};

// Helper function to calculate current vault health (capped at current PP if PP < max health)
const calculateCurrentVaultHealth = (capacity: number, currentPP: number, storedVaultHealth?: number): number => {
  const maxVaultHealth = calculateMaxVaultHealth(capacity);
  if (storedVaultHealth !== undefined) {
    // If we have a stored value, cap it at both max health and current PP
    return Math.min(storedVaultHealth, maxVaultHealth, currentPP);
  }
  // Default: min of current PP and max health
  return Math.min(currentPP, maxVaultHealth);
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
  const [inventory, setInventory] = useState<string[]>([]);
  const [artifacts, setArtifacts] = useState<any[]>([]);
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
        // Get player's current PP, manifest, and inventory from student data
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        const studentData = studentDoc.exists() ? studentDoc.data() : {};
        const playerPP = studentData.powerPoints || 0;
        const userManifest = studentData.manifest?.manifestId || studentData.manifestationType || 'reading';
        const studentInventory = studentData.inventory || [];
        const studentArtifacts = studentData.artifacts || [];
        
        // Set inventory and artifacts
        setInventory(studentInventory);
        setArtifacts(studentArtifacts);
        
        logger.battle.debug('Player PP from student data:', playerPP);
        logger.battle.debug('User manifest for move filtering:', userManifest);
        logger.battle.debug('Player inventory:', studentInventory);
        
        // Initialize or fetch vault
        const vaultRef = doc(db, 'vaults', currentUser.uid);
        const vaultDoc = await getDoc(vaultRef);
        
        if (!vaultDoc.exists()) {
          // Create new vault with player's current PP
          const initialCapacity = 1000;
          const maxVaultHealth = Math.floor(initialCapacity * 0.1); // 10% of capacity
          // Vault health is the minimum of current PP and max vault health
          const initialVaultHealth = Math.min(playerPP, maxVaultHealth);
          const newVault: Vault = {
            id: currentUser.uid,
            ownerId: currentUser.uid,
            capacity: initialCapacity,
            currentPP: playerPP,
            vaultHealth: initialVaultHealth,
            maxVaultHealth: maxVaultHealth,
            shieldStrength: BATTLE_CONSTANTS.BASE_SHIELD_STRENGTH,
            maxShieldStrength: BATTLE_CONSTANTS.BASE_SHIELD_STRENGTH,
            overshield: 0,
            generatorLevel: 1,
            generatorPendingPP: 0,
            generatorLastReset: new Date(),
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
          
          // Migrate existing vault to include new move tracking fields and generator
          // Max vault health is always 10% of capacity
          const currentPP = existingVaultData.currentPP || playerPP;
          const maxVaultHealth = existingVaultData.maxVaultHealth || calculateMaxVaultHealth(existingVaultData.capacity || 1000);
          // Current vault health is capped at current PP if PP < max health
          const vaultHealth = calculateCurrentVaultHealth(existingVaultData.capacity || 1000, currentPP, existingVaultData.vaultHealth);
          
          const existingVault: Vault = {
            ...existingVaultData,
            vaultHealth: vaultHealth,
            maxVaultHealth: maxVaultHealth,
            movesRemaining: existingVaultData.movesRemaining || BATTLE_CONSTANTS.MOVE_SLOTS_BASE,
            maxMovesPerDay: existingVaultData.maxMovesPerDay || BATTLE_CONSTANTS.MOVE_SLOTS_BASE,
            lastMoveReset: existingVaultData.lastMoveReset || new Date(),
            // Migrate from firewall to generator if needed
            generatorLevel: existingVaultData.generatorLevel || 1,
            generatorPendingPP: existingVaultData.generatorPendingPP || 0,
            generatorLastReset: existingVaultData.generatorLastReset || existingVaultData.lastMoveReset || new Date(),
            generatorUpgrades: existingVaultData.generatorUpgrades || 0,
          } as Vault;
          
          // Check and reset daily moves if needed
          let updatedVault = checkAndResetDailyMoves(existingVault);
          
          // Check and reset vault health cooldown if expired
          updatedVault = checkAndResetVaultHealthCooldown(updatedVault);
          
          // Check and generate generator resources if needed
          updatedVault = checkAndGenerateGeneratorResources(updatedVault);
          
          // Always update vault PP to match player's current PP
          // Max vault health is always 10% of capacity (already set in updatedVault)
          // Current vault health is capped at current PP if PP < max health
          const correctVaultHealth = calculateCurrentVaultHealth(updatedVault.capacity, playerPP, updatedVault.vaultHealth);
          if (existingVault.currentPP !== playerPP || updatedVault.vaultHealth !== correctVaultHealth ||
              updatedVault.movesRemaining !== existingVault.movesRemaining || 
              updatedVault.generatorPendingPP !== existingVault.generatorPendingPP || 
              updatedVault.shieldStrength !== existingVault.shieldStrength) {
            console.log('BattleContext: Syncing vault PP from', existingVault.currentPP, 'to', playerPP);
            console.log(`BattleContext: Updating vault health to ${correctVaultHealth}/${updatedVault.maxVaultHealth} (capped at current PP: ${playerPP})`);
            await updateDoc(vaultRef, { 
              currentPP: playerPP,
              vaultHealth: correctVaultHealth,
              movesRemaining: updatedVault.movesRemaining,
              lastMoveReset: updatedVault.lastMoveReset,
              generatorPendingPP: updatedVault.generatorPendingPP,
              generatorLastReset: updatedVault.generatorLastReset,
              shieldStrength: updatedVault.shieldStrength,
              vaultHealthCooldown: updatedVault.vaultHealthCooldown // Persist cooldown if active
            });
            setVault({ 
              ...updatedVault, 
              currentPP: playerPP,
              vaultHealth: correctVaultHealth // Update local state
            });
          } else {
            setVault(updatedVault);
          }
        }

        // Initialize or fetch moves - use a simpler approach
        const movesRef = doc(db, 'battleMoves', currentUser.uid);
        const movesDoc = await getDoc(movesRef);
        
        if (!movesDoc.exists()) {
          // Create initial moves - NO elemental moves unlocked initially
          // Elemental moves will be unlocked when player completes Chapter 1 - Challenge 7
          const initialMoves: Move[] = MOVE_TEMPLATES.map((template, index) => ({
            ...template,
            id: `move_${index + 1}`,
            unlocked: template.category === 'system' || 
                      // Elemental moves are NOT unlocked initially - must complete Chapter 1 Challenge 7
                      (template.category === 'manifest' && template.manifestType === userManifest), // Only unlock user's manifest
            currentCooldown: 0,
            masteryLevel: 1,
          }));
          console.log('BattleContext: Creating initial moves (elemental moves locked until Challenge 7):', initialMoves);
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
            
            // Create new moves with the updated system - NO elemental moves unlocked initially
            // Elemental moves will be unlocked when player completes Chapter 1 - Challenge 7
            // Load move overrides to get updated names
            const { getMoveNameSync, loadMoveOverrides } = await import('../utils/moveOverrides');
            // Ensure cache is loaded before using sync functions
            await loadMoveOverrides();
            
            // Preserve existing mastery levels when migrating
            const newMoves: Move[] = MOVE_TEMPLATES.map((template, index) => {
              const isUnlocked = template.category === 'system' || 
                // Elemental moves are NOT unlocked initially - must complete Chapter 1 Challenge 7
                (template.category === 'manifest' && template.manifestType === userManifest); // Only unlock user's manifest
              
              if (template.category === 'manifest') {
                console.log(`BattleContext: Creating manifest move ${template.name} (${template.manifestType}) - unlocked: ${isUnlocked}`);
              }
              
              // Get the overridden name (from admin panel) for this move
              // Always use the original template.name as the key to look up overrides
              const overriddenName = getMoveNameSync(template.name);
              
              // Match existing move by ID first (most reliable), then by original template name
              // Don't match by overridden name since it might have changed
              const moveId = `move_${index + 1}`;
              const existingMove = movesData.find((m: Move) => 
                m.id === moveId || 
                m.name === template.name
              );
              
              return {
                ...template,
                name: overriddenName, // Use the overridden name from admin panel
                id: moveId,
                unlocked: isUnlocked,
                currentCooldown: 0,
                // Preserve mastery level if move exists, otherwise default to 1
                masteryLevel: existingMove?.masteryLevel || 1,
                // Preserve other properties that might have been upgraded
                damage: existingMove?.damage || template.damage,
                shieldBoost: existingMove?.shieldBoost || template.shieldBoost,
                healing: existingMove?.healing || template.healing,
                ppSteal: existingMove?.ppSteal || template.ppSteal,
                debuffStrength: existingMove?.debuffStrength || template.debuffStrength,
                buffStrength: existingMove?.buffStrength || template.buffStrength,
              };
            });
            
            // Update the database with new moves
            await updateDoc(movesRef, { moves: newMoves });
            setMoves(newMoves);
          } else {
            // Apply element-specific filtering to existing moves
            console.log('BattleContext: Applying element-specific filtering to existing moves');
            
            // Load move overrides to get updated names
            const { getMoveNameSync, loadMoveOverrides } = await import('../utils/moveOverrides');
            // Ensure cache is loaded before using sync functions
            await loadMoveOverrides();
            
            // Get user's element from student data
            const studentRef = doc(db, 'students', currentUser.uid);
            const studentDoc = await getDoc(studentRef);
            const userElement = studentDoc.exists() ? 
              (studentDoc.data().manifestationType?.toLowerCase() || 'fire') : 'fire';
            
            console.log('BattleContext: User element for move filtering:', userElement);
            
            // Update moves with correct element and manifest filtering
            // Also apply overridden names from admin panel
            // Elemental moves should remain locked unless player has completed Chapter 1 Challenge 7
            const updatedMoves = movesData.map((move: Move) => {
              // Find the original template name for this move
              // First, try to find it by matching the move's ID to the template index
              let template = null;
              const moveIndex = parseInt(move.id.replace('move_', '')) - 1;
              if (moveIndex >= 0 && moveIndex < MOVE_TEMPLATES.length) {
                template = MOVE_TEMPLATES[moveIndex];
              }
              
              // If ID lookup failed, try to find template by matching other properties
              if (!template) {
                template = MOVE_TEMPLATES.find(t => 
                  t.category === move.category &&
                  t.manifestType === move.manifestType &&
                  t.elementalAffinity === move.elementalAffinity &&
                  t.level === move.level
                );
              }
              
              // Get the overridden name using the original template name
              // If we can't find the template, try reverse lookup on the move's current name
              let overriddenName = move.name;
              if (template) {
                overriddenName = getMoveNameSync(template.name);
              } else {
                // Fallback: try to find if current name is an override by checking all templates
                for (const t of MOVE_TEMPLATES) {
                  const overrideName = getMoveNameSync(t.name);
                  if (overrideName === move.name) {
                    // Current name matches an override, get the latest override
                    overriddenName = getMoveNameSync(t.name);
                    break;
                  }
                }
              }
              
              // Apply overridden name if it's different from the stored name
              const updatedMove = {
                ...move,
                name: overriddenName
              };
              
              if (move.category === 'elemental' && move.level === 1) {
                // CRITICAL: Preserve the unlocked state from the database PERMANENTLY
                // Elemental moves are unlocked when the player chooses their element in the Artifacts page
                // Once unlocked (unlocked === true), they should ALWAYS remain unlocked
                // If already unlocked, keep it unlocked. Otherwise, unlock if it matches user's element.
                const shouldRemainUnlocked = move.unlocked === true ? true : 
                  (move.elementalAffinity === userElement);
                console.log(`BattleContext: Move ${updatedMove.name} (${move.elementalAffinity}) - unlocked state: ${move.unlocked}, preserving: ${shouldRemainUnlocked}`);
                return { ...updatedMove, unlocked: shouldRemainUnlocked };
              } else if (move.category === 'manifest') {
                // Only unlock if it matches user's manifest
                const shouldUnlock = move.manifestType === userManifest;
                console.log(`BattleContext: Move ${updatedMove.name} (${move.manifestType}) - should unlock: ${shouldUnlock}`);
                return { ...updatedMove, unlocked: shouldUnlock };
              }
              return updatedMove;
            });
            
            // Check if any move names were updated
            const hasNameUpdates = updatedMoves.some((move: Move, index: number) => {
              const originalMove = movesData[index];
              return originalMove && move.name !== originalMove.name;
            });
            
            // Only update database if names changed
            if (hasNameUpdates) {
              console.log('BattleContext: Move names updated, saving to database');
              await updateDoc(movesRef, { moves: updatedMoves });
            }
            
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
          const maxVaultHealth = Math.floor(1000 * 0.1);
          const defaultVault: Vault = {
            id: currentUser.uid,
            ownerId: currentUser.uid,
            capacity: 1000,
            currentPP: 0,
            vaultHealth: Math.min(0, maxVaultHealth), // 0 PP means 0 vault health
            maxVaultHealth: maxVaultHealth,
            shieldStrength: BATTLE_CONSTANTS.BASE_SHIELD_STRENGTH,
            maxShieldStrength: BATTLE_CONSTANTS.BASE_SHIELD_STRENGTH,
            overshield: 0,
            generatorLevel: 1,
            generatorPendingPP: 0,
            generatorLastReset: new Date(),
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
        const maxVaultHealth = Math.floor(1000 * 0.1);
        const defaultVault: Vault = {
          id: currentUser.uid,
          ownerId: currentUser.uid,
          capacity: 1000,
          currentPP: 0,
          vaultHealth: Math.min(0, maxVaultHealth), // 0 PP means 0 vault health
          maxVaultHealth: maxVaultHealth,
          shieldStrength: BATTLE_CONSTANTS.BASE_SHIELD_STRENGTH,
          maxShieldStrength: BATTLE_CONSTANTS.BASE_SHIELD_STRENGTH,
          overshield: 0,
          generatorLevel: 1,
          generatorPendingPP: 0,
          generatorLastReset: new Date(),
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
    
    // Helper function to check if error is a Firestore internal assertion error
    const isFirestoreInternalError = (error: any): boolean => {
      if (!error) return false;
      const errorString = String(error);
      const errorMessage = error?.message || '';
      return errorString.includes('INTERNAL ASSERTION FAILED') || 
             errorMessage.includes('INTERNAL ASSERTION FAILED') ||
             errorString.includes('ID: ca9') ||
             errorString.includes('ID: b815');
    };
    
    // Debounce timer for vault PP sync
    let vaultSyncTimeout: NodeJS.Timeout | null = null;
    
    const unsubscribeVault = onSnapshot(vaultRef, (vaultDoc) => {
      try {
        if (vaultDoc.exists()) {
          setVault(vaultDoc.data() as Vault);
        }
      } catch (error) {
        if (isFirestoreInternalError(error)) {
          console.warn('BattleContext: Firestore internal assertion error in vault listener callback - ignoring');
          return;
        }
        console.error('BattleContext: Error processing vault snapshot:', error);
      }
    }, (error) => {
      if (isFirestoreInternalError(error)) {
        console.warn('BattleContext: Firestore internal assertion error in vault listener - ignoring');
        return;
      }
      console.error('BattleContext: Error in vault listener:', error);
    });

    const unsubscribeStudent = onSnapshot(studentRef, async (studentDoc) => {
      try {
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          const studentPP = studentData.powerPoints || 0;
          
          // Update inventory and artifacts in real-time
          setInventory(studentData.inventory || []);
          setArtifacts(studentData.artifacts || []);
          
          // Sync vault PP with student PP in real-time
          // Use a debounce to prevent circular updates
          // Clear any pending sync
          if (vaultSyncTimeout) {
            clearTimeout(vaultSyncTimeout);
          }
          
          // Only sync if there's a difference
          const vaultRef = doc(db, 'vaults', currentUser.uid);
          const vaultDoc = await getDoc(vaultRef);
          
          if (vaultDoc.exists()) {
            const vaultData = vaultDoc.data();
            const currentVaultPP = vaultData.currentPP || 0;
            
            // Only update if they differ to avoid unnecessary writes
            if (currentVaultPP !== studentPP) {
              // Use setTimeout to debounce and prevent circular updates
              vaultSyncTimeout = setTimeout(async () => {
                try {
                  await updateDoc(vaultRef, {
                    currentPP: studentPP,
                    lastUpdated: serverTimestamp()
                  });
                  console.log('[BattleContext] Synced vault PP with student PP:', studentPP);
                } catch (updateError) {
                  if (isFirestoreInternalError(updateError)) {
                    console.warn('[BattleContext] Firestore internal assertion error during vault sync - ignoring');
                    return;
                  }
                  console.error('[BattleContext] Error syncing vault PP:', updateError);
                }
              }, 500); // Increased debounce time to 500ms
            }
          }
        }
      } catch (error) {
        if (isFirestoreInternalError(error)) {
          console.warn('[BattleContext] Firestore internal assertion error in student listener callback - ignoring');
          return;
        }
        console.error('[BattleContext] Error processing student snapshot:', error);
      }
    }, (error) => {
      if (isFirestoreInternalError(error)) {
        console.warn('BattleContext: Firestore internal assertion error in student listener - ignoring');
        return;
      }
      console.error('BattleContext: Error in student listener:', error);
    });

    return () => {
      if (vaultSyncTimeout) {
        clearTimeout(vaultSyncTimeout);
      }
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
    
    // Helper function to check if error is a Firestore internal assertion error
    const isFirestoreInternalError = (error: any): boolean => {
      if (!error) return false;
      const errorString = String(error);
      const errorMessage = error?.message || '';
      return errorString.includes('INTERNAL ASSERTION FAILED') || 
             errorMessage.includes('INTERNAL ASSERTION FAILED') ||
             errorString.includes('ID: ca9') ||
             errorString.includes('ID: b815');
    };
    
    const unsubscribeLobbies = onSnapshot(lobbiesQuery, (snapshot) => {
      try {
        const lobbies: BattleLobby[] = [];
        snapshot.forEach((doc) => {
          const lobbyData = { id: doc.id, ...doc.data() } as BattleLobby;
          logger.battle.debug('Found battle lobby:', lobbyData);
          lobbies.push(lobbyData);
        });
        logger.battle.debug('Setting battle lobbies:', lobbies);
        setBattleLobbies(lobbies);
      } catch (error) {
        if (isFirestoreInternalError(error)) {
          console.warn('BattleContext: Firestore internal assertion error in lobbies listener callback - ignoring');
          return;
        }
        logger.battle.error('Error processing battle lobbies snapshot:', error);
      }
    }, (error) => {
      if (isFirestoreInternalError(error)) {
        console.warn('BattleContext: Firestore internal assertion error in lobbies listener - ignoring');
        return;
      }
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
    
    // Helper function to check if error is a Firestore internal assertion error
    const isFirestoreInternalError = (error: any): boolean => {
      if (!error) return false;
      const errorString = String(error);
      const errorMessage = error?.message || '';
      return errorString.includes('INTERNAL ASSERTION FAILED') || 
             errorMessage.includes('INTERNAL ASSERTION FAILED') ||
             errorString.includes('ID: ca9') ||
             errorString.includes('ID: b815');
    };
    
    const unsubscribeMoves = onSnapshot(movesQuery, (snapshot) => {
      try {
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
      } catch (error) {
        if (isFirestoreInternalError(error)) {
          console.warn('BattleContext: Firestore internal assertion error in offline moves listener callback - ignoring');
          return;
        }
        logger.battle.error('Error processing offline moves snapshot:', error);
      }
    }, (error) => {
      if (isFirestoreInternalError(error)) {
        console.warn('BattleContext: Firestore internal assertion error in offline moves listener - ignoring');
        return;
      }
      logger.battle.error('Error listening to offline moves:', error);
    });

    return () => unsubscribeMoves();
  }, [currentUser]); // Removed offlineMoves from dependencies to prevent listener recreation

  // Listen for attack history (attacks by or against current user)
  useEffect(() => {
    if (!currentUser) return;

    logger.battle.debug('Setting up attack history listener');
    
    // Helper function to check if error is a Firestore internal assertion error
    const isFirestoreInternalError = (error: any): boolean => {
      if (!error) return false;
      const errorString = String(error);
      const errorMessage = error?.message || '';
      return errorString.includes('INTERNAL ASSERTION FAILED') || 
             errorMessage.includes('INTERNAL ASSERTION FAILED') ||
             errorString.includes('ID: ca9') ||
             errorString.includes('ID: b815');
    };
    
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
      try {
        outgoingAttacks = [];
        snapshot.forEach((doc) => {
          const attackData = { id: doc.id, ...doc.data() } as VaultSiegeAttack;
          logger.battle.debug('Found outgoing attack by user:', attackData);
          outgoingAttacks.push(attackData);
        });
        updateAttackHistory();
      } catch (error) {
        if (isFirestoreInternalError(error)) {
          console.warn('BattleContext: Firestore internal assertion error in outgoing attacks listener callback - ignoring');
          return;
        }
        logger.battle.error('Error processing outgoing attacks snapshot:', error);
      }
    }, (error) => {
      if (isFirestoreInternalError(error)) {
        console.warn('BattleContext: Firestore internal assertion error in outgoing attacks listener - ignoring');
        return;
      }
      logger.battle.error('Error listening to outgoing attack history:', error);
    });
    
    const unsubscribeIncomingAttacks = onSnapshot(incomingAttacksQuery, (snapshot) => {
      try {
        incomingAttacks = [];
        snapshot.forEach((doc) => {
          const attackData = { id: doc.id, ...doc.data() } as VaultSiegeAttack;
          logger.battle.debug('Found incoming attack to user:', attackData);
          incomingAttacks.push(attackData);
        });
        updateAttackHistory();
      } catch (error) {
        if (isFirestoreInternalError(error)) {
          console.warn('BattleContext: Firestore internal assertion error in incoming attacks listener callback - ignoring');
          return;
        }
        logger.battle.error('Error processing incoming attacks snapshot:', error);
      }
    }, (error) => {
      if (isFirestoreInternalError(error)) {
        console.warn('BattleContext: Firestore internal assertion error in incoming attacks listener - ignoring');
        return;
      }
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
      // Cap overshield at 1 to prevent more than 1 overshield
      if (updates.overshield !== undefined) {
        updates.overshield = Math.min(1, Math.max(0, updates.overshield));
      }
      
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
  // Helper function to check and reset vault health cooldown
  const checkAndResetVaultHealthCooldown = (vaultData: Vault): Vault => {
    if (!vaultData.vaultHealthCooldown) {
      // Even if no cooldown, ensure vault health doesn't exceed PP if PP is below threshold
      // Max vault health is always 10% of vault capacity
      const maxVaultHealth = Math.floor(vaultData.capacity * 0.1);
      const correctVaultHealth = Math.min(vaultData.currentPP, maxVaultHealth);
      if (vaultData.vaultHealth !== correctVaultHealth) {
        return {
          ...vaultData,
          vaultHealth: correctVaultHealth
        };
      }
      return vaultData; // No cooldown active and health is correct
    }
    
    const cooldownEndTime = new Date(vaultData.vaultHealthCooldown);
    cooldownEndTime.setHours(cooldownEndTime.getHours() + 4); // 4-hour cooldown
    const now = new Date();
    
    // If cooldown has expired, reset vault health to min of PP and max
    if (now >= cooldownEndTime) {
      // Max vault health is always 10% of vault capacity
      const maxVaultHealth = Math.floor(vaultData.capacity * 0.1);
      const resetVaultHealth = Math.min(vaultData.currentPP, maxVaultHealth);
      return {
        ...vaultData,
        vaultHealth: resetVaultHealth,
        vaultHealthCooldown: undefined
      };
    }
    
    return vaultData; // Cooldown still active
  };

  const upgradeVaultCapacity = async () => {
    if (!currentUser || !vault) return;
    
    // Calculate upgrade count (default to 0 if not set)
    const upgradeCount = vault.capacityUpgrades || 0;
    // Base price is 200, doubles for each upgrade: 200 * (2 ^ upgradeCount)
    const basePrice = 200;
    const upgradeCost = basePrice * Math.pow(2, upgradeCount);
    
    if (vault.currentPP < upgradeCost) {
      setError(`Insufficient PP for capacity upgrade. Need ${upgradeCost} PP.`);
      return;
    }
    
    try {
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      const newCapacity = vault.capacity + 200;
      const newPP = vault.currentPP - upgradeCost;
      const newUpgradeCount = upgradeCount + 1;
      const newMaxVaultHealth = Math.floor(newCapacity * 0.1); // 10% of new capacity
      // Vault health should be min of current PP and new max vault health
      const newVaultHealth = Math.min(newPP, newMaxVaultHealth);
      
      await updateDoc(vaultRef, {
        capacity: newCapacity,
        currentPP: newPP,
        maxVaultHealth: newMaxVaultHealth,
        vaultHealth: newVaultHealth,
        capacityUpgrades: newUpgradeCount
      });
      
      // Also update student PP
      const studentRef = doc(db, 'students', currentUser.uid);
      await updateDoc(studentRef, { powerPoints: newPP });
      
      setVault(prevVault => prevVault ? { 
        ...prevVault, 
        capacity: newCapacity,
        currentPP: newPP,
        maxVaultHealth: newMaxVaultHealth,
        vaultHealth: newVaultHealth,
        capacityUpgrades: newUpgradeCount
      } : null);
      
      setSuccess(`Vault capacity upgraded! +200 PP capacity (Cost: ${upgradeCost} PP)`);
    } catch (error) {
      console.error('Error upgrading vault capacity:', error);
      setError('Failed to upgrade vault capacity');
    }
  };

  const upgradeVaultShields = async () => {
    if (!currentUser || !vault) return;
    
    // Calculate upgrade count (default to 0 if not set)
    const upgradeCount = vault.shieldUpgrades || 0;
    // Base price is 75, doubles for each upgrade: 75 * (2 ^ upgradeCount)
    const basePrice = 75;
    const upgradeCost = basePrice * Math.pow(2, upgradeCount);
    
    if (vault.currentPP < upgradeCost) {
      setError(`Insufficient PP for shield upgrade. Need ${upgradeCost} PP.`);
      return;
    }
    
    try {
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      const newMaxShields = vault.maxShieldStrength + 25;
      const newPP = vault.currentPP - upgradeCost;
      const newUpgradeCount = upgradeCount + 1;
      
      await updateDoc(vaultRef, {
        maxShieldStrength: newMaxShields,
        currentPP: newPP,
        shieldUpgrades: newUpgradeCount
      });
      
      // Also update student PP
      const studentRef = doc(db, 'students', currentUser.uid);
      await updateDoc(studentRef, { powerPoints: newPP });
      
      setVault(prevVault => prevVault ? { 
        ...prevVault, 
        maxShieldStrength: newMaxShields,
        currentPP: newPP,
        shieldUpgrades: newUpgradeCount
      } : null);
      
      setSuccess(`Vault shields upgraded! +25 max shield strength (Cost: ${upgradeCost} PP)`);
    } catch (error) {
      console.error('Error upgrading vault shields:', error);
      setError('Failed to upgrade vault shields');
    }
  };

  // Calculate generator production rates based on level
  const getGeneratorRates = (level: number) => {
    // Level 1: 10 PP/day, 10 Shields/day
    // Each level increases by 5 PP and 5 Shields
    const basePP = 10;
    const baseShields = 10;
    const ppPerLevel = 5;
    const shieldsPerLevel = 5;
    
    return {
      ppPerDay: basePP + (level - 1) * ppPerLevel,
      shieldsPerDay: baseShields + (level - 1) * shieldsPerLevel
    };
  };

  const upgradeGenerator = async () => {
    if (!currentUser || !vault) return;
    
    // Calculate upgrade count (default to 0 if not set)
    const upgradeCount = vault.generatorUpgrades || 0;
    // Base price is 250, adds 250 for each upgrade: 250 + (250 * upgradeCount)
    const basePrice = 250;
    const upgradeCost = basePrice + (basePrice * upgradeCount);
    
    if (vault.currentPP < upgradeCost) {
      setError(`Insufficient PP for generator upgrade. Need ${upgradeCost} PP.`);
      return;
    }
    
    try {
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      const newGeneratorLevel = (vault.generatorLevel || 1) + 1;
      const newPP = vault.currentPP - upgradeCost;
      const newUpgradeCount = upgradeCount + 1;
      const rates = getGeneratorRates(newGeneratorLevel);
      
      await updateDoc(vaultRef, {
        generatorLevel: newGeneratorLevel,
        currentPP: newPP,
        generatorUpgrades: newUpgradeCount
      });
      
      // Also update student PP
      const studentRef = doc(db, 'students', currentUser.uid);
      await updateDoc(studentRef, { powerPoints: newPP });
      
      setVault(prevVault => prevVault ? { 
        ...prevVault, 
        generatorLevel: newGeneratorLevel,
        currentPP: newPP,
        generatorUpgrades: newUpgradeCount
      } : null);
      
      setSuccess(`Generator upgraded to Level ${newGeneratorLevel}! Now generates ${rates.ppPerDay} PP/day and ${rates.shieldsPerDay} Shields/day (Cost: ${upgradeCost} PP)`);
    } catch (error) {
      console.error('Error upgrading generator:', error);
      setError('Failed to upgrade generator');
    }
  };

  // Collect generated PP
  const collectGeneratorPP = async () => {
    if (!currentUser || !vault) return;
    
    const pendingPP = vault.generatorPendingPP || 0;
    if (pendingPP <= 0) {
      setError('No PP available to collect');
      return;
    }
    
    try {
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      const studentRef = doc(db, 'students', currentUser.uid);
      
      // Get current PP from student document to ensure accuracy
      const studentDoc = await getDoc(studentRef);
      const currentStudentPP = studentDoc.exists() ? (studentDoc.data().powerPoints || 0) : 0;
      const newPP = Math.min(vault.capacity, currentStudentPP + pendingPP);
      
      await updateDoc(vaultRef, {
        currentPP: newPP,
        generatorPendingPP: 0
      });
      
      await updateDoc(studentRef, {
        powerPoints: newPP
      });
      
      setVault(prevVault => prevVault ? { 
        ...prevVault, 
        currentPP: newPP,
        generatorPendingPP: 0
      } : null);
      
      setSuccess(`Collected ${pendingPP} PP from Generator!`);
    } catch (error) {
      console.error('Error collecting generator PP:', error);
      setError('Failed to collect generator PP');
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
      
      // Max vault health is always 10% of capacity
      const maxVaultHealth = vault.maxVaultHealth || calculateMaxVaultHealth(vault.capacity);
      
      // Current vault health is capped at current PP if PP < max health
      // Otherwise, it can be up to max health
      const correctVaultHealth = calculateCurrentVaultHealth(vault.capacity, playerPP, vault.vaultHealth);
      
      if (playerPP !== vault.currentPP || vault.vaultHealth !== correctVaultHealth) {
        // Update vault PP to match player PP and adjust vault health
        const vaultRef = doc(db, 'vaults', currentUser.uid);
        await updateDoc(vaultRef, { 
          currentPP: playerPP,
          vaultHealth: correctVaultHealth
        });
        
        // Update local vault state
        setVault(prevVault => prevVault ? {
          ...prevVault,
          currentPP: playerPP,
          vaultHealth: correctVaultHealth
        } : null);
        
        console.log('✅ Vault PP synced to player PP:', playerPP);
        console.log(`✅ Vault health updated to ${correctVaultHealth}/${maxVaultHealth} (capped at current PP: ${playerPP})`);
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
        let processedVault = checkAndResetDailyMoves(vaultData);
        processedVault = checkAndGenerateGeneratorResources(processedVault);
        
        // Get current player PP to check if vault health should be reset to max
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        const playerPP = studentDoc.exists() ? (studentDoc.data().powerPoints || 0) : processedVault.currentPP;
        
        // Max vault health is always 10% of capacity
        const maxVaultHealth = processedVault.maxVaultHealth || calculateMaxVaultHealth(processedVault.capacity);
        if (processedVault.maxVaultHealth !== maxVaultHealth) {
          processedVault.maxVaultHealth = maxVaultHealth;
          await updateDoc(vaultRef, {
            maxVaultHealth: maxVaultHealth
          });
          console.log(`✅ Updated max vault health to ${maxVaultHealth} (10% of capacity)`);
        }
        
        // Current vault health is capped at current PP if PP < max health
        const correctVaultHealth = calculateCurrentVaultHealth(processedVault.capacity, playerPP, processedVault.vaultHealth);
        if (processedVault.vaultHealth !== correctVaultHealth) {
          processedVault.vaultHealth = correctVaultHealth;
          await updateDoc(vaultRef, {
            vaultHealth: correctVaultHealth
          });
          console.log(`✅ Updated vault health to ${correctVaultHealth}/${maxVaultHealth} (capped at current PP: ${playerPP})`);
        }
        
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

  // Helper to get "day" start time (8am Eastern Time) for a given date
  // Properly handles EST (UTC-5) and EDT (UTC-4) automatically using America/New_York timezone
  const getDayStartForDate = (date: Date): Date => {
    // Get current date/time in Eastern Time
    const easternNow = date.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    // Parse the Eastern Time string
    const parts = easternNow.split(', ');
    const datePart = parts[0];
    const timePart = parts[1];
    const [month, day, year] = datePart.split('/');
    const [hour] = timePart.split(':');
    
    const yearNum = parseInt(year);
    const monthNum = parseInt(month) - 1; // JS months are 0-indexed
    const dayNum = parseInt(day);
    const currentHour = parseInt(hour);
    
    // Determine which day's 8am to use
    let targetYear = yearNum;
    let targetMonth = monthNum;
    let targetDay = dayNum;
    
    // If current Eastern time is before 8am, use previous day's 8am
    if (currentHour < 8) {
      const prevDate = new Date(yearNum, monthNum, dayNum - 1);
      targetYear = prevDate.getFullYear();
      targetMonth = prevDate.getMonth();
      targetDay = prevDate.getDate();
    }
    
    // Find what UTC time corresponds to 8am Eastern on the target date
    // Test both EST (13:00 UTC) and EDT (12:00 UTC) possibilities
    // EST: 8am Eastern = 13:00 UTC (UTC-5)
    // EDT: 8am Eastern = 12:00 UTC (UTC-4)
    
    // Try 13:00 UTC first (EST)
    let testUTC = new Date(Date.UTC(targetYear, targetMonth, targetDay, 13, 0, 0));
    let easternTimeStr = testUTC.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false
    });
    let easternHour = parseInt(easternTimeStr.split(', ')[1]?.split(':')[0] || '0');
    
    if (easternHour === 8) {
      // EST: 8am Eastern = 13:00 UTC
      return testUTC;
    }
    
    // Try 12:00 UTC (EDT)
    testUTC = new Date(Date.UTC(targetYear, targetMonth, targetDay, 12, 0, 0));
    easternTimeStr = testUTC.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false
    });
    easternHour = parseInt(easternTimeStr.split(', ')[1]?.split(':')[0] || '0');
    
    if (easternHour === 8) {
      // EDT: 8am Eastern = 12:00 UTC
      return testUTC;
    }
    
    // Fallback: if neither works, calculate dynamically
    // Find the UTC hour that gives us 8am Eastern
    for (let utcHour = 11; utcHour <= 14; utcHour++) {
      testUTC = new Date(Date.UTC(targetYear, targetMonth, targetDay, utcHour, 0, 0));
      easternTimeStr = testUTC.toLocaleString('en-US', { 
        timeZone: 'America/New_York',
        hour: '2-digit',
        hour12: false
      });
      easternHour = parseInt(easternTimeStr.split(', ')[1]?.split(':')[0] || '0');
      if (easternHour === 8) {
        return testUTC;
      }
    }
    
    // Ultimate fallback: use 13:00 UTC (EST)
    return new Date(Date.UTC(targetYear, targetMonth, targetDay, 13, 0, 0));
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

  // Check and generate generator resources if needed (generates at 8am EST, same as offline moves)
  const checkAndGenerateGeneratorResources = (vaultData: Vault): Vault => {
    const generatorLevel = vaultData.generatorLevel || 1;
    const rates = getGeneratorRates(generatorLevel);
    
    const lastGeneratorReset = vaultData.generatorLastReset instanceof Date 
      ? vaultData.generatorLastReset 
      : new Date(vaultData.generatorLastReset || vaultData.lastMoveReset || new Date());
    
    // Get current day start (8am EST)
    const currentDayStart = getCurrentDayStart();
    
    // If last generator reset was before current day start, generate resources
    if (lastGeneratorReset < currentDayStart) {
      const pendingPP = (vaultData.generatorPendingPP || 0) + rates.ppPerDay;
      
      // Auto-add shields to shield strength (capped at max)
      const newShieldStrength = Math.min(
        vaultData.maxShieldStrength,
        (vaultData.shieldStrength || 0) + rates.shieldsPerDay
      );
      
      // Update Firestore asynchronously if shields were added
      if (newShieldStrength !== vaultData.shieldStrength && currentUser) {
        const vaultRef = doc(db, 'vaults', currentUser.uid);
        updateDoc(vaultRef, {
          shieldStrength: newShieldStrength,
          generatorPendingPP: pendingPP,
          generatorLastReset: currentDayStart
        }).catch(err => console.error('Error updating generator resources:', err));
      } else if (pendingPP !== vaultData.generatorPendingPP && currentUser) {
        // Only update pending PP if shields didn't change
        const vaultRef = doc(db, 'vaults', currentUser.uid);
        updateDoc(vaultRef, {
          generatorPendingPP: pendingPP,
          generatorLastReset: currentDayStart
        }).catch(err => console.error('Error updating generator PP:', err));
      }
      
      return {
        ...vaultData,
        generatorPendingPP: pendingPP,
        generatorLastReset: currentDayStart,
        shieldStrength: newShieldStrength,
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
  // IMPORTANT: Once unlocked, these moves should stay unlocked permanently
  const unlockElementalMoves = async (elementalAffinity: string) => {
    if (!currentUser) return;
    
    try {
      console.log(`Unlocking ${elementalAffinity} elemental moves for user`);
      
      const movesRef = doc(db, 'battleMoves', currentUser.uid);
      
      // Get current moves from database to ensure we have the latest state
      const movesDoc = await getDoc(movesRef);
      const currentMoves = movesDoc.exists() ? (movesDoc.data().moves || []) : moves;
      
      const updatedMoves = currentMoves.map((move: Move) => {
        // Unlock level 1 moves for the user's element
        // IMPORTANT: Set unlocked to true explicitly - this will persist
        if (move.category === 'elemental' && 
            move.elementalAffinity === elementalAffinity && 
            move.level === 1) {
          console.log(`BattleContext: Permanently unlocking ${move.name} (${move.elementalAffinity})`);
          return { ...move, unlocked: true };
        }
        // Preserve unlocked state for all other moves
        return move;
      });
      
      await updateDoc(movesRef, { moves: updatedMoves });
      setMoves(updatedMoves);
      
      console.log(`Successfully unlocked ${elementalAffinity} elemental moves - these will remain unlocked`);
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
      // IMPORTANT: Preserve unlocked state - if a move is already unlocked, keep it unlocked PERMANENTLY
      const updatedMoves = moves.map((move: Move) => {
        if (move.category === 'elemental' && move.level === 1) {
          // CRITICAL: If already unlocked (unlocked === true), ALWAYS keep it unlocked (preserve state permanently)
          // Only unlock if it matches user's element AND hasn't been unlocked yet
          const shouldUnlock = move.unlocked === true ? true : 
            (move.elementalAffinity === userElement);
          console.log(`BattleContext: Move ${move.name} (${move.elementalAffinity}) - already unlocked: ${move.unlocked}, preserving unlock: ${shouldUnlock}`);
          return { ...move, unlocked: shouldUnlock };
        } else if (move.category === 'manifest') {
          // If already unlocked, keep it unlocked (preserve state)
          // Otherwise, unlock if it matches user's manifest
          const shouldUnlock = move.unlocked || move.manifestType === userManifest;
          console.log(`BattleContext: Move ${move.name} (${move.manifestType}) - already unlocked: ${move.unlocked}, should unlock: ${shouldUnlock}`);
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

  const forceMigration = async (resetLevels: boolean = false) => {
    if (!currentUser) return;
    
    try {
      console.log('BattleContext: Force migration triggered', resetLevels ? '(resetting levels)' : '(preserving levels)');
      
      // Get user's manifest from student data
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      const userManifest = studentDoc.exists() ? 
        (studentDoc.data().manifest?.manifestId || studentDoc.data().manifestationType || 'reading') : 'reading';
      
      console.log('BattleContext: Force migration - User manifest:', userManifest);
      
      // Load move overrides to get updated names
      const { getMoveNameSync, loadMoveOverrides } = await import('../utils/moveOverrides');
      // Ensure cache is loaded before using sync functions
      await loadMoveOverrides();
      
      const movesRef = doc(db, 'battleMoves', currentUser.uid);
      const movesDoc = await getDoc(movesRef);
      
      // Get existing moves to preserve mastery levels (if not resetting)
      const existingMoves = movesDoc.exists() ? (movesDoc.data().moves || []) : [];
      
      // Create new moves with the updated system
      const newMoves: Move[] = MOVE_TEMPLATES.map((template, index) => {
        const isUnlocked = template.category === 'system' || 
          (template.category === 'elemental' && template.level === 1 && template.elementalAffinity === 'fire') || 
          (template.category === 'manifest' && template.manifestType === userManifest);
        
        if (template.category === 'manifest') {
          console.log(`BattleContext: Force migration - Creating manifest move ${template.name} (${template.manifestType}) - unlocked: ${isUnlocked}`);
        }
        
        // Get the overridden name (from admin panel) for this move
        // Always use the original template.name as the key to look up overrides
        const overriddenName = getMoveNameSync(template.name);
        
        // Match existing move by ID first (most reliable), then by original template name
        // Don't match by overridden name since it might have changed
        const moveId = `move_${index + 1}`;
        const existingMove = existingMoves.find((m: Move) => 
          m.id === moveId || 
          m.name === template.name
        );
        
        console.log(`BattleContext: Force migration - Move ${moveId}: template="${template.name}", override="${overriddenName}", existing=${existingMove ? `found (level ${existingMove.masteryLevel})` : 'not found'}`);
        
        return {
          ...template,
          name: overriddenName, // Use the overridden name from admin panel
          id: moveId,
          unlocked: isUnlocked,
          currentCooldown: 0,
          // Reset mastery level if requested, otherwise preserve it
          masteryLevel: resetLevels ? 1 : (existingMove?.masteryLevel || 1),
          // Reset upgraded properties if resetting levels, otherwise preserve them
          damage: resetLevels ? template.damage : (existingMove?.damage || template.damage),
          shieldBoost: resetLevels ? template.shieldBoost : (existingMove?.shieldBoost || template.shieldBoost),
          healing: resetLevels ? template.healing : (existingMove?.healing || template.healing),
          ppSteal: resetLevels ? template.ppSteal : (existingMove?.ppSteal || template.ppSteal),
          debuffStrength: resetLevels ? template.debuffStrength : (existingMove?.debuffStrength || template.debuffStrength),
          buffStrength: resetLevels ? template.buffStrength : (existingMove?.buffStrength || template.buffStrength),
        };
      });
      
      // Overwrite the database with new moves (preserving mastery levels)
      await setDoc(movesRef, { moves: newMoves });
      setMoves(newMoves);
      
      // Force refresh action cards from templates, preserving mastery levels
      const cardsRef = doc(db, 'battleActionCards', currentUser.uid);
      const cardsDoc = await getDoc(cardsRef);
      const existingCards = cardsDoc.exists() ? (cardsDoc.data().cards || []) : [];
      
      const updatedActionCards = ACTION_CARD_TEMPLATES.map((template, index) => {
        // Try to find existing card by name to preserve mastery level
        const existingCard = existingCards.find((c: ActionCard) => 
          c.name === template.name || 
          (c.id === `card_${index + 1}`)
        );
        
        return {
          ...template,
          id: `card_${index + 1}`,
          unlocked: index < 2, // First 2 cards unlocked by default
          // Preserve mastery level if card exists, otherwise default to 1
          masteryLevel: existingCard?.masteryLevel || 1,
          upgradeCost: template.upgradeCost || 100, // Default upgrade cost
        };
      });
      
      await setDoc(cardsRef, { cards: updatedActionCards });
      setActionCards(updatedActionCards);
      
      console.log(`BattleContext: Force migration completed successfully - moves and action cards updated${resetLevels ? ' (levels reset)' : ' (levels preserved)'}`);
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
      // IMPORTANT: Use the CURRENT values (which may already be upgraded) as the base for the new multiplier
      // This allows upgrades to compound correctly
      const updatedMoves = moves.map(m => {
        if (m.id === moveId) {
          const updatedMove = { 
            ...m, 
            masteryLevel: newLevel
          };
          
          // Apply boost to damage - use current damage as base (may already be upgraded)
          let baseDamage = m.damage;
          if (!baseDamage || baseDamage === 0) {
            // If no damage set, get base from MOVE_DAMAGE_VALUES
            const moveDamageValue = MOVE_DAMAGE_VALUES[m.name];
            baseDamage = moveDamageValue?.damage || 0;
          }
          if (baseDamage > 0) {
            updatedMove.damage = Math.floor(baseDamage * damageBoostMultiplier);
          }
          
          // Apply boost to shieldBoost - use current value as base
          if (m.shieldBoost && m.shieldBoost > 0) {
            updatedMove.shieldBoost = Math.floor(m.shieldBoost * damageBoostMultiplier);
          }
          
          // Apply boost to healing - use current value as base
          if (m.healing && m.healing > 0) {
            updatedMove.healing = Math.floor(m.healing * damageBoostMultiplier);
          }
          
          // Apply boost to ppSteal - use current value as base
          if (m.ppSteal && m.ppSteal > 0) {
            updatedMove.ppSteal = Math.floor(m.ppSteal * damageBoostMultiplier);
          }
          
          // Apply boost to debuffStrength - use current value as base
          if (m.debuffStrength && m.debuffStrength > 0) {
            updatedMove.debuffStrength = Math.floor(m.debuffStrength * damageBoostMultiplier);
          }
          
          // Apply boost to buffStrength - use current value as base
          if (m.buffStrength && m.buffStrength > 0) {
            updatedMove.buffStrength = Math.floor(m.buffStrength * damageBoostMultiplier);
          }
          
          console.log(`Upgrading ${m.name} from level ${m.masteryLevel} to ${newLevel}:`, {
            oldDamage: m.damage,
            newDamage: updatedMove.damage,
            multiplier: damageBoostMultiplier,
            oldShieldBoost: m.shieldBoost,
            newShieldBoost: updatedMove.shieldBoost
          });
          
          return updatedMove;
        }
        return m;
      });

      // Update moves in database FIRST, then update local state
      const movesRef = doc(db, 'battleMoves', currentUser.uid);
      await updateDoc(movesRef, { 
        moves: updatedMoves,
        lastUpdated: serverTimestamp()
      });
      
      // Update local state AFTER Firestore update completes
      setMoves([...updatedMoves]); // Create new array to trigger React re-render
      
      console.log('Move upgrade saved to Firestore:', {
        moveId,
        moveName: move.name,
        newLevel,
        updatedMoves: updatedMoves.find(m => m.id === moveId)
      });

      // Deduct PP from vault
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      const newPP = vault.currentPP - upgradeCost;
      await updateDoc(vaultRef, { 
        currentPP: newPP
      });

      // Update vault state AFTER Firestore update
      setVault({ ...vault, currentPP: newPP });
      
      // Force a refresh of moves data to ensure UI is in sync
      // This helps catch any cases where the UI might not have updated
      setTimeout(async () => {
        try {
          const movesDoc = await getDoc(movesRef);
          if (movesDoc.exists()) {
            const movesData = movesDoc.data();
            if (movesData.moves) {
              console.log('Refreshing moves after upgrade to ensure sync');
              setMoves([...movesData.moves]);
            }
          }
        } catch (refreshError) {
          console.error('Error refreshing moves after upgrade:', refreshError);
        }
      }, 500);

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
      
      let targetVaultData = targetVaultDoc.data() as Vault;
      
      // Check and reset vault health cooldown if expired
      targetVaultData = checkAndResetVaultHealthCooldown(targetVaultData);
      
      // If vault health was reset, update Firestore
      if (targetVaultData.vaultHealthCooldown === undefined && targetVaultDoc.data().vaultHealthCooldown) {
        await updateDoc(targetVaultRef, {
          vaultHealth: targetVaultData.vaultHealth,
          vaultHealthCooldown: undefined
        });
      }
      
      // Check if target vault is on cooldown
      if (targetVaultData.vaultHealthCooldown) {
        const cooldownEndTime = new Date(targetVaultData.vaultHealthCooldown);
        cooldownEndTime.setHours(cooldownEndTime.getHours() + 4); // 4-hour cooldown
        const now = new Date();
        
        if (now < cooldownEndTime) {
          const remainingHours = Math.floor((cooldownEndTime.getTime() - now.getTime()) / (1000 * 60 * 60));
          const remainingMinutes = Math.ceil(((cooldownEndTime.getTime() - now.getTime()) % (1000 * 60 * 60)) / (1000 * 60));
          return { 
            success: false, 
            message: `Target vault is on cooldown. Cannot attack for another ${remainingHours}h ${remainingMinutes}m.` 
          };
        }
      }
      
      // Reset attacker's cooldown when they attack someone (they're no longer protected)
      if (vault.vaultHealthCooldown) {
        const attackerVaultRef = doc(db, 'vaults', currentUser.uid);
        await updateDoc(attackerVaultRef, { vaultHealthCooldown: deleteField() });
        console.log('✅ Reset attacker cooldown - player attacked someone');
      }
      
      // Get target student data to sync vault PP from student PP (student PP is the source of truth)
      const targetStudentRef = doc(db, 'students', targetUserId);
      const targetStudentDoc = await getDoc(targetStudentRef);
      const targetStudentPP = targetStudentDoc.exists() ? (targetStudentDoc.data().powerPoints || 0) : 0;
      
      // Initialize vault health if not set (migration for existing vaults)
      if (targetVaultData.vaultHealth === undefined) {
        const maxVaultHealth = Math.floor(targetVaultData.capacity * 0.1);
        targetVaultData.vaultHealth = maxVaultHealth;
        targetVaultData.maxVaultHealth = maxVaultHealth;
      }
      
      console.log('🔥 Target data before sync:', { 
        vaultPP: targetVaultData.currentPP,
        vaultHealth: targetVaultData.vaultHealth,
        maxVaultHealth: targetVaultData.maxVaultHealth,
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
          // Get student data for equipped artifacts and player level
          const studentRef = doc(db, 'students', currentUser.uid);
          const studentDoc = await getDoc(studentRef);
          const studentData = studentDoc.exists() ? studentDoc.data() : null;
          const equippedArtifacts = studentData?.equippedArtifacts || null;
          const playerLevel = studentData?.level || 1;
          
          // Get effective mastery level (includes Blaze Ring bonus for elemental moves)
          const effectiveMasteryLevel = getEffectiveMasteryLevel(selectedMove, equippedArtifacts);
          
          // Use the move's actual damage property if it exists (from upgrades), otherwise use lookup
          let baseDamage: number;
          if (selectedMove.damage && selectedMove.damage > 0) {
            // Use the upgraded damage directly (already includes boost multiplier)
            baseDamage = selectedMove.damage;
            console.log(`🔍 Using upgraded damage for ${selectedMove.name}:`, baseDamage);
          } else {
            // Fall back to lookup for moves that haven't been upgraded yet
            const moveDamageValue = await getMoveDamage(selectedMove.name);
            console.log(`🔍 Move damage lookup for ${selectedMove.name}:`, moveDamageValue);
            
            if (moveDamageValue) {
              // Handle both single damage values and damage ranges
              if (typeof moveDamageValue === 'object') {
                // It's a range, use the max value for damage calculation
                baseDamage = moveDamageValue.max;
              } else {
                // It's a single value
                baseDamage = moveDamageValue;
              }
            } else {
              baseDamage = 0;
            }
          }
          
          // Calculate damage using proper damage range system with effective mastery level
          let totalDamage = 0;
          if (baseDamage > 0) {
            const damageRange = calculateDamageRange(baseDamage, selectedMove.level, effectiveMasteryLevel);
            const damageResult = rollDamage(damageRange, playerLevel, selectedMove.level, effectiveMasteryLevel);
            totalDamage = damageResult.damage;
            
            // Apply artifact damage multiplier for elemental moves
            let artifactMultiplier = 1.0;
            if (selectedMove.category === 'elemental' && equippedArtifacts) {
              const ringLevel = getElementalRingLevel(equippedArtifacts);
              artifactMultiplier = getArtifactDamageMultiplier(ringLevel);
              if (artifactMultiplier > 1.0) {
                totalDamage = Math.floor(totalDamage * artifactMultiplier);
                console.log(`💍 Elemental Ring (Level ${ringLevel}) boosts ${selectedMove.name} damage by ${Math.round((artifactMultiplier - 1) * 100)}%`);
              }
            }
            
            // Log ring boost if applicable
            if (effectiveMasteryLevel > selectedMove.masteryLevel && equippedArtifacts) {
              const ringSlots = ['ring1', 'ring2', 'ring3', 'ring4'];
              const moveElement = selectedMove.elementalAffinity?.toLowerCase();
              for (const slot of ringSlots) {
                const ring = equippedArtifacts[slot];
                if (!ring) continue;
                if ((ring.id === 'blaze-ring' || (ring.name && ring.name.includes('Blaze Ring'))) && moveElement === 'fire') {
                  console.log(`🔥 Blaze Ring: ${selectedMove.name} effective mastery level ${effectiveMasteryLevel} (base: ${selectedMove.masteryLevel})`);
                  break;
                }
                if ((ring.id === 'terra-ring' || (ring.name && ring.name.includes('Terra Ring'))) && moveElement === 'earth') {
                  console.log(`🌍 Terra Ring: ${selectedMove.name} effective mastery level ${effectiveMasteryLevel} (base: ${selectedMove.masteryLevel})`);
                  break;
                }
                if ((ring.id === 'aqua-ring' || (ring.name && ring.name.includes('Aqua Ring'))) && moveElement === 'water') {
                  console.log(`💧 Aqua Ring: ${selectedMove.name} effective mastery level ${effectiveMasteryLevel} (base: ${selectedMove.masteryLevel})`);
                  break;
                }
                if ((ring.id === 'air-ring' || (ring.name && ring.name.includes('Air Ring'))) && moveElement === 'air') {
                  console.log(`💨 Air Ring: ${selectedMove.name} effective mastery level ${effectiveMasteryLevel} (base: ${selectedMove.masteryLevel})`);
                  break;
                }
              }
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
            console.log(`❤️ Target vault health: ${targetVaultData.vaultHealth}/${targetVaultData.maxVaultHealth}`);
            console.log(`💰 Direct PP steal from move property: ${directPPSteal}`);
            
            // Apply damage to shields first, then to vault health
            if (targetVaultData.shieldStrength > 0) {
              // Damage shields first
              shieldDamage = Math.min(totalDamage, targetVaultData.shieldStrength);
              const remainingDamage = totalDamage - shieldDamage;
              
              // Remaining damage goes to vault health (not PP)
              let vaultHealthDamage = 0;
              if (remainingDamage > 0) {
                vaultHealthDamage = Math.min(remainingDamage, targetVaultData.vaultHealth);
              }
              
              // Vault health damage is what gets stolen (converted to PP for attacker)
              ppStolen = vaultHealthDamage;
              
              if (ppStolen > 0 || shieldDamage > 0) {
                message = `Used ${selectedMove.name} - Dealt ${totalDamage} damage (${shieldDamage} to shields${ppStolen > 0 ? `, ${ppStolen} to vault health` : ''})`;
              } else {
                message = `Used ${selectedMove.name} - Dealt ${shieldDamage} damage to shields`;
              }
            } else {
              // No shields, all damage goes to vault health
              ppStolen = Math.min(totalDamage, targetVaultData.vaultHealth);
              
              if (ppStolen > 0) {
                message = `Used ${selectedMove.name} - Dealt ${ppStolen} damage to vault health (no shields)`;
              } else {
                message = `Used ${selectedMove.name} - Dealt 0 damage (vault health depleted)`;
              }
              
              console.log(`❤️ No shields - Damage: ${totalDamage}, Vault health damage: ${ppStolen}`);
            }
          } else {
            // No damage value found, but check if move has ppSteal property
            if (directPPSteal > 0) {
              // Move has direct PP steal but no damage - apply to vault health
              if (targetVaultData.shieldStrength > 0) {
                // Can still damage vault health even if target has shields (but reduced)
                ppStolen = Math.min(Math.floor(directPPSteal / 2), targetVaultData.vaultHealth);
                message = `Used ${selectedMove.name} - Dealt ${ppStolen} vault health damage (reduced by shields)`;
              } else {
                // No shields, full vault health damage
                ppStolen = Math.min(directPPSteal, targetVaultData.vaultHealth);
                message = `Used ${selectedMove.name} - Dealt ${ppStolen} vault health damage (no shields)`;
              }
              console.log(`❤️ Using direct vault health damage (no damage value): ${ppStolen}`);
            } else {
              console.log(`⚠️ No damage value found for move ${selectedMove.name}, using fallback damage`);
              // Give a small amount of damage for moves that don't have damage values
              const fallbackDamage = 5; // Minimum damage for any offensive move
              
              // Apply damage to shields first, then to vault health
              if (targetVaultData.shieldStrength > 0) {
                shieldDamage = Math.min(fallbackDamage, targetVaultData.shieldStrength);
                const remainingDamage = fallbackDamage - shieldDamage;
                
                if (remainingDamage > 0) {
                  ppStolen = Math.min(remainingDamage, targetVaultData.vaultHealth);
                  message = `Used ${selectedMove.name} - Dealt ${fallbackDamage} damage (${shieldDamage} to shields, ${ppStolen} to vault health) [fallback]`;
                } else {
                  message = `Used ${selectedMove.name} - Dealt ${shieldDamage} damage to shields [fallback]`;
                }
              } else {
                ppStolen = Math.min(fallbackDamage, targetVaultData.vaultHealth);
                message = `Used ${selectedMove.name} - Dealt ${ppStolen} vault health damage (no shields) [fallback]`;
              }
            }
          }
          
          // Ensure ppStolen is set even if totalDamage was 0 but directPPSteal exists
          // (This handles cases where damage lookup returns 0 but move has ppSteal)
          if (ppStolen === 0 && directPPSteal > 0 && targetVaultData.shieldStrength === 0) {
            ppStolen = Math.min(directPPSteal, targetVaultData.vaultHealth);
            message = `Used ${selectedMove.name} - Dealt ${ppStolen} vault health damage (no shields, direct steal)`;
            console.log(`❤️ Applied direct vault health damage after damage calculation: ${ppStolen}`);
          }
        }
      }
      
      if (selectedCard) {
        // Track daily challenge: Use Action Card
        if (currentUser) {
          updateChallengeProgressByType(currentUser.uid, 'use_action_card', 1).catch(err => 
            console.error('Error updating daily challenge progress:', err)
          );
        }
        
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
            ppStolen = Math.min(selectedCard.effect.strength, targetVaultData.vaultHealth);
            message += ` • Used ${selectedCard.name} to damage vault health`;
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
        
        // Overshield is consumed (set to 0) after absorbing an attack
        updates.overshield = 0;
        
        console.log(`✨ Overshield absorbed attack! Original overshield: ${targetVaultData.overshield}, New overshield: 0`);
        console.log(`🔍 Updates object:`, updates);
        message = `Attack absorbed by overshield! (0 overshields remaining)`;
        
        // Create notification for the target player about overshield usage
        try {
          await addDoc(collection(db, 'students', targetUserId, 'notifications'), {
            type: 'overshield_used',
            title: '🛡️ Overshield Activated!',
            message: `Your overshield blocked an attack from ${attackerName}! (0 overshields remaining)`,
            attackerName: attackerName,
            attackerId: currentUser.uid,
            overshieldRemaining: 0,
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
        console.log('❤️ Vault health will be damaged, updating attacker PP and target vault health');
        
        // Damage target's vault health (not PP)
        const newVaultHealth = Math.max(0, targetVaultData.vaultHealth - ppStolen);
        updates.vaultHealth = newVaultHealth;
        
        // Check if vault health reached 0 - set cooldown
        if (newVaultHealth === 0 && targetVaultData.vaultHealth > 0) {
          updates.vaultHealthCooldown = new Date();
          console.log('⏰ Vault health depleted! Setting 4-hour cooldown.');
        }
        
        // Apply PP boost if active before adding to attacker's vault
        let finalPPStolen = ppStolen;
        try {
          const activeBoost = await getActivePPBoost(currentUser.uid);
          if (activeBoost) {
            finalPPStolen = applyPPBoost(ppStolen, currentUser.uid, activeBoost);
            console.log(`⚡ PP Boost applied to vault attack: ${ppStolen} → ${finalPPStolen}`);
          }
        } catch (error) {
          console.error('Error applying PP boost to vault attack:', error);
        }

        // Add stolen PP to attacker's vault (with boost if active)
        // This is the actual PP the attacker gains, converted from vault health damage
        const newAttackerPP = vault.currentPP + finalPPStolen;
        
        await updateDoc(doc(db, 'vaults', currentUser.uid), {
          currentPP: newAttackerPP
        });
        
        // Also update the student document to sync PP
        await updateDoc(doc(db, 'students', currentUser.uid), {
          powerPoints: newAttackerPP
        });
        
        // Note: We don't update target's student PP - only vault health is affected
        // The target's PP (currentPP) remains unchanged
        
        // Update local vault state to reflect PP gain
        setVault(prevVault => prevVault ? {
          ...prevVault,
          currentPP: newAttackerPP
        } : null);
        
        // Create notification for PP gain (show boosted amount)
        try {
          await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
            type: 'pp_gain',
            title: 'PP Stolen!',
            message: `+${finalPPStolen} PP stolen from vault attack${finalPPStolen > ppStolen ? ' (Double PP Boost active!)' : ''}`,
            ppAmount: finalPPStolen,
            timestamp: serverTimestamp(),
            read: false
          });
        } catch (notificationError) {
          console.error('Error creating PP notification:', notificationError);
        }
        
        console.log('=== VAULT HEALTH DAMAGE COMPLETED ===');
        console.log('Attacker vault updated:', newAttackerPP);
        console.log('Attacker student doc updated:', newAttackerPP);
        console.log('Target vault health updated:', updates.vaultHealth);
        if (updates.vaultHealthCooldown) {
          console.log('Target vault cooldown set:', updates.vaultHealthCooldown);
        }
        console.log('Local vault state updated with new PP:', newAttackerPP);
      } else {
        console.log('❤️ No vault health damage, skipping updates');
      }
      
      // Update target vault
      if (Object.keys(updates).length > 0) {
        // Cap overshield at 1 to prevent more than 1 overshield
        if (updates.overshield !== undefined) {
          updates.overshield = Math.min(1, Math.max(0, updates.overshield));
        }
        console.log('Updating target vault with:', updates);
        await updateDoc(targetVaultRef, updates);
        console.log('Target vault updated successfully');
        
        // Note: We don't update target student PP - only vault health is affected
        
        // Verify the update by reading the vault again
        const updatedVaultDoc = await getDoc(targetVaultRef);
        if (updatedVaultDoc.exists()) {
          const updatedVaultData = updatedVaultDoc.data() as Vault;
          console.log('Verified vault update - new shield strength:', updatedVaultData.shieldStrength);
          console.log('Verified vault update - new vault health:', updatedVaultData.vaultHealth);
          console.log('Verified vault update - new overshield:', updatedVaultData.overshield);
          if (updatedVaultData.vaultHealthCooldown) {
            console.log('Verified vault update - cooldown active:', updatedVaultData.vaultHealthCooldown);
          }
        }
      }
      
      // Player names already retrieved above for notifications
      
      // Log vault health damage details if damage was done
      if (ppStolen > 0) {
        // Calculate final PP stolen (with boost if active) for logging
        let finalPPStolenForLog = ppStolen;
        try {
          const activeBoost = await getActivePPBoost(currentUser.uid);
          if (activeBoost) {
            finalPPStolenForLog = applyPPBoost(ppStolen, currentUser.uid, activeBoost);
          }
        } catch (error) {
          console.error('Error applying PP boost for logging:', error);
        }
        
        console.log('=== VAULT HEALTH DAMAGE DETAILS ===');
        console.log('Attacker:', {
          uid: currentUser.uid,
          name: attackerName,
          currentPP: vault.currentPP,
          vaultHealthDamage: ppStolen,
          ppGained: finalPPStolenForLog,
          newPP: vault.currentPP + finalPPStolenForLog,
          change: `+${finalPPStolenForLog}`
        });
        console.log('Target:', {
          uid: targetUserId,
          name: targetName,
          vaultHealth: targetVaultData.vaultHealth,
          vaultHealthDamage: ppStolen,
          newVaultHealth: updates.vaultHealth || targetVaultData.vaultHealth - ppStolen,
          change: `-${ppStolen}`,
          cooldownSet: !!updates.vaultHealthCooldown
        });
        
        // Award XP for damaging vault health (use original amount for XP calculation)
        if (ppStolen > 0) {
          const xpReward = calculateXpReward(ppStolen);
          if (xpReward > 0) {
            await awardBattleXp(xpReward, `Dealt ${ppStolen} vault health damage to ${targetName}`);
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

      // Track daily challenge: Attack Vault (if any damage was done or attack was attempted)
      if (currentUser && (ppStolen > 0 || shieldDamage > 0 || (selectedMove || selectedCard))) {
        updateChallengeProgressByType(currentUser.uid, 'attack_vault', 1).catch(err => 
          console.error('Error updating daily challenge progress:', err)
        );
      }
      
      // Track daily challenge: Earn PP (if PP was stolen)
      if (currentUser && ppStolen > 0) {
        updateChallengeProgressByType(currentUser.uid, 'earn_pp', ppStolen).catch(err => 
          console.error('Error updating daily challenge progress:', err)
        );
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
          vaultHealth: targetVaultData.vaultHealth || Math.floor(targetVaultData.capacity * 0.1),
          shieldStrength: targetVaultData.shieldStrength,
          overshield: targetVaultData.overshield || 0,
        },
        targetVaultAfter: {
          currentPP: targetVaultData.currentPP, // PP doesn't change from attacks
          vaultHealth: updates.vaultHealth !== undefined ? updates.vaultHealth : (targetVaultData.vaultHealth || Math.floor(targetVaultData.capacity * 0.1)),
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

  // Refresh inventory from Firestore
  const refreshInventory = async () => {
    if (!currentUser) return;
    
    try {
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      if (studentDoc.exists()) {
        const studentData = studentDoc.data();
        setInventory(studentData.inventory || []);
        setArtifacts(studentData.artifacts || []);
      }
    } catch (error) {
      console.error('Error refreshing inventory:', error);
    }
  };

  // Use an artifact during battle
  const activateArtifact = async (artifactName: string) => {
    if (!currentUser || !vault) return;

    try {
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      if (!studentDoc.exists()) {
        throw new Error('Student data not found');
      }

      const studentData = studentDoc.data();
      const currentInventory = studentData.inventory || [];
      
      // Check if artifact exists in inventory
      if (!currentInventory.includes(artifactName)) {
        throw new Error(`You don't have ${artifactName} in your inventory`);
      }

      // Handle specific artifacts - check if they can be used before consuming
      if (artifactName === 'Health Potion (25)') {
        // Restore 25 HP to vault health
        const maxVaultHealth = vault.maxVaultHealth || Math.floor(vault.capacity * 0.1);
        const currentVaultHealth = vault.vaultHealth !== undefined ? vault.vaultHealth : Math.min(vault.currentPP, maxVaultHealth);
        
        // Check if vault health is already at max
        if (currentVaultHealth >= maxVaultHealth) {
          setSuccess(`🧪 Your vault health is already at maximum (${maxVaultHealth}/${maxVaultHealth})!`);
          // Don't consume the potion if it can't be used
          return;
        }
        
        // Calculate how much health can be restored
        const healthToRestore = Math.min(25, maxVaultHealth - currentVaultHealth);
        const newVaultHealth = currentVaultHealth + healthToRestore;
        
        // Remove artifact from inventory (only if it can be used)
        const updatedInventory = [...currentInventory];
        const artifactIndex = updatedInventory.indexOf(artifactName);
        if (artifactIndex > -1) {
          updatedInventory.splice(artifactIndex, 1);
        }
        
        // Update vault health
        const vaultRef = doc(db, 'vaults', currentUser.uid);
        await updateDoc(vaultRef, {
          vaultHealth: newVaultHealth
        });
        setVault({ ...vault, vaultHealth: newVaultHealth });
        
        // Update inventory
        await updateDoc(studentRef, {
          inventory: updatedInventory
        });
        setInventory(updatedInventory);
        
        // Update artifacts array in users collection
        const usersRef = doc(db, 'users', currentUser.uid);
        const usersSnap = await getDoc(usersRef);
        if (usersSnap.exists()) {
          const usersData = usersSnap.data();
          const currentArtifacts = usersData.artifacts || [];
          let foundOne = false;
          const updatedArtifacts = currentArtifacts.map((artifact: any) => {
            if (foundOne) return artifact;
            
            if (typeof artifact === 'string') {
              if (artifact === artifactName) {
                foundOne = true;
                return { 
                  id: artifactName.toLowerCase().replace(/\s+/g, '-'),
                  name: artifactName,
                  used: true,
                  usedAt: new Date(),
                  isLegacy: true
                };
              }
              return artifact;
            } else {
              const isNotUsed = artifact.used === false || artifact.used === undefined || artifact.used === null;
              if (artifact.name === artifactName && isNotUsed) {
                foundOne = true;
                return { ...artifact, used: true, usedAt: new Date() };
              }
              return artifact;
            }
          });
          
          await updateDoc(usersRef, {
            artifacts: updatedArtifacts
          });
        }
        
        setSuccess(`🧪 Health Potion used! Restored ${healthToRestore} HP to your vault health.\n\nVault Health: ${newVaultHealth}/${maxVaultHealth}`);
        return; // Exit early since we've handled everything
      }

      // Remove artifact from inventory for other artifacts
      const updatedInventory = [...currentInventory];
      const artifactIndex = updatedInventory.indexOf(artifactName);
      if (artifactIndex > -1) {
        updatedInventory.splice(artifactIndex, 1);
      }

      // Handle other specific artifacts
      if (artifactName === 'Shield') {
        // Check if player already has an active overshield
        if ((vault.overshield || 0) > 0) {
          setSuccess('❌ You already have an active overshield! You can only have 1 overshield at a time.');
          return;
        }
        
        // Add overshield to vault (capped at 1)
        const vaultRef = doc(db, 'vaults', currentUser.uid);
        await updateDoc(vaultRef, {
          overshield: 1
        });
        setVault({ ...vault, overshield: 1 });
        setSuccess('🛡️ Shield activated! Your next attack will be blocked.');
      } else if (artifactName === 'Double PP Boost') {
        // Activate PP boost immediately (no admin approval needed)
        const { activatePPBoost } = await import('../utils/ppBoost');
        const success = await activatePPBoost(currentUser.uid, artifactName);
        if (success) {
          const { getActivePPBoost, getPPBoostStatus } = await import('../utils/ppBoost');
          const activeBoost = await getActivePPBoost(currentUser.uid);
          const boostStatus = getPPBoostStatus(activeBoost);
          const timeRemaining = boostStatus.isActive ? boostStatus.timeRemaining : '4:00';
          setSuccess(`⚡ Double PP Boost activated! You'll receive double PP for the next 4 hours!\n\nTime remaining: ${timeRemaining}`);
        } else {
          setSuccess('Failed to activate PP boost. Please try again.');
          return;
        }
      } else {
        // For other artifacts, create admin notification
        await addDoc(collection(db, 'adminNotifications'), {
          type: 'artifact_usage',
          title: 'Artifact Used in Battle',
          message: `${currentUser.displayName || currentUser.email} used ${artifactName} during battle`,
          data: {
            userId: currentUser.uid,
            userName: currentUser.displayName || currentUser.email,
            artifactName: artifactName,
            usageTime: new Date(),
            location: 'Battle'
          },
          timestamp: serverTimestamp()
        });
        setSuccess(`✨ ${artifactName} used!`);
      }

      // Update inventory
      await updateDoc(studentRef, {
        inventory: updatedInventory
      });

      // Update local state
      setInventory(updatedInventory);
      
      // Also update artifacts array in users collection
      // IMPORTANT: Only mark ONE instance as used, not all of them
      const usersRef = doc(db, 'users', currentUser.uid);
      const usersSnap = await getDoc(usersRef);
      if (usersSnap.exists()) {
        const usersData = usersSnap.data();
        const currentArtifacts = usersData.artifacts || [];
        let foundOne = false;
        const updatedArtifacts = currentArtifacts.map((artifact: any) => {
          if (foundOne) return artifact;
          
          if (typeof artifact === 'string') {
            if (artifact === artifactName) {
              foundOne = true;
              return { 
                id: artifactName.toLowerCase().replace(/\s+/g, '-'),
                name: artifactName,
                used: true,
                usedAt: new Date(),
                isLegacy: true
              };
            }
            return artifact;
          } else {
            // Only mark as used if it's not already used (check for used property explicitly)
            const isNotUsed = artifact.used === false || artifact.used === undefined || artifact.used === null;
            if (artifact.name === artifactName && isNotUsed) {
              foundOne = true;
              return { ...artifact, used: true, usedAt: new Date() };
            }
            return artifact;
          }
        });
        await updateDoc(usersRef, {
          artifacts: updatedArtifacts
        });
      }
    } catch (error: any) {
      console.error('Error using artifact:', error);
      setError(error.message || 'Failed to use artifact');
    }
  };

  const value: BattleContextType = {
    vault,
    updateVault,
    upgradeVaultCapacity,
    upgradeVaultShields,
    upgradeGenerator,
    collectGeneratorPP,
    getGeneratorRates,
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
    inventory,
    artifacts,
    activateArtifact,
    refreshInventory,
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