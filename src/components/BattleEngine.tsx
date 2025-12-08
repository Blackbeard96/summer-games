import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { Move } from '../types/battle';
import { getMoveDamage, getMoveName, getMoveNameSync } from '../utils/moveOverrides';
import { trackMoveUsage } from '../utils/manifestTracking';
import { getElementalRingLevel, getArtifactDamageMultiplier, getEffectiveMasteryLevel } from '../utils/artifactUtils';
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  calculateDamageRange, 
  calculateShieldBoostRange, 
  calculateHealingRange,
  rollDamage, 
  rollShieldBoost, 
  rollHealing
} from '../utils/damageCalculator';
import { getLevelFromXP } from '../utils/leveling';
import BattleArena from './BattleArena';
import MultiplayerBattleArena from './MultiplayerBattleArena';
import BattleAnimations from './BattleAnimations';
import { calculateTurnOrder, getMovePriority, getDefaultSpeed, TurnOrderParticipant } from '../utils/turnOrder';
import { selectOptimalCPUMove, selectOptimalCPUTarget, BattleSituation } from '../utils/cpuMoveSelection';
import { updateChallengeProgressByType } from '../utils/dailyChallengeTracker';

interface Opponent {
  id: string;
  name: string;
  currentPP: number; // For CPU opponents, this is their health. For PvP, this is their PP (not used for damage)
  maxPP: number;
  vaultHealth?: number; // For PvP opponents, this is their vault health (what gets damaged)
  maxVaultHealth?: number; // For PvP opponents, this is their max vault health
  shieldStrength: number;
  maxShieldStrength: number;
  level: number;
  speed?: number; // Speed stat for turn order (default 50)
  photoURL?: string; // Profile picture URL for players
  image?: string; // Image URL for CPU opponents
}

interface BattleEngineProps {
  onBattleEnd: (result: 'victory' | 'defeat' | 'escape', winnerId?: string, loserId?: string) => void;
  onMoveConsumption?: () => Promise<boolean>;
  onExecuteVaultSiegeAttack?: (moveId: string, targetUserId: string) => Promise<{ success: boolean; message: string; ppStolen?: number; xpGained?: number; shieldDamage?: number; overshieldAbsorbed?: boolean } | undefined>;
  opponent?: Opponent; // Single opponent (for single player mode)
  opponents?: Opponent[]; // Multiple opponents (for multiplayer mode)
  allies?: Opponent[]; // Allies (for multiplayer mode, includes current player)
  isPvP?: boolean;
  battleRoom?: any; // BattleRoom type from PvPBattle
  mindforgeMode?: boolean; // Enable Mindforge question-based mode
  questionCorrect?: boolean; // Whether the current question was answered correctly
  onMoveExecuted?: () => void; // Callback when move is executed (for Mindforge)
  onOpponentUpdate?: (opponent: Opponent) => void; // Callback when opponent state changes (for Mindforge)
  onOpponentsUpdate?: (opponents: Opponent[]) => void; // Callback when opponents array changes (for multiplayer)
  onAlliesUpdate?: (allies: Opponent[]) => void; // Callback when allies array changes (for multiplayer)
  onBattleLogUpdate?: (battleLog: string[]) => void; // Callback when battle log updates (for Mindforge)
  initialBattleLog?: string[]; // Initial battle log to continue from (for Mindforge)
  onTerraAwakened?: () => void; // Callback when Terra reaches 50% health
  isTerraAwakened?: boolean; // Whether Terra is in awakened state
  isForestStageActive?: boolean; // Whether the forest stage is active (for field bonus)
  isMultiplayer?: boolean; // Whether this is a multiplayer battle (2-8 players)
  onIceGolemDefeated?: () => void; // Callback when an Ice Golem is defeated (triggers cutscene)
  gameId?: string; // Game ID for Island Raid battles (to sync move selections)
}

interface BattleState {
  phase: 'selection' | 'execution' | 'opponent_turn' | 'victory' | 'defeat';
  selectedMove: Move | null;
  selectedTarget: string | null;
  battleLog: string[];
  turnCount: number;
  isPlayerTurn: boolean;
  accumulatedPPStolen: number; // Track PP stolen during battle
  currentAnimation: Move | null;
  isAnimating: boolean;
  turnOrder?: Array<{ participantId: string; orderScore: number }>; // Turn order for multiplayer battles
  currentTurnIndex?: number; // Current position in turn order
}


const BattleEngine: React.FC<BattleEngineProps> = ({ 
  onBattleEnd, 
  onMoveConsumption, 
  onExecuteVaultSiegeAttack,
  opponent: propOpponent,
  opponents: propOpponents,
  allies: propAllies,
  isPvP = false,
  battleRoom,
  mindforgeMode = false,
  questionCorrect = true,
  onMoveExecuted,
  onOpponentUpdate,
  onOpponentsUpdate,
  onAlliesUpdate,
  onBattleLogUpdate,
  initialBattleLog,
  onTerraAwakened,
  isTerraAwakened = false,
  isForestStageActive = false,
  isMultiplayer = false,
  onIceGolemDefeated,
  gameId
}) => {
  const { currentUser } = useAuth();
  const { vault, moves, updateVault, refreshVaultData } = useBattle();
  const [userLevel, setUserLevel] = useState(1);
  const [userPhotoURL, setUserPhotoURL] = useState<string | null>(null);
  const [equippedArtifacts, setEquippedArtifacts] = useState<any>(null);
  
  // Use initialBattleLog if provided (for Mindforge), otherwise use default
  const defaultLog = mindforgeMode 
    ? (initialBattleLog || ['Welcome to Mindforge Battle!'])
    : ['Welcome to the MST Battle Arena!', 'Select a move to begin your attack!'];
  
  const [battleState, setBattleState] = useState<BattleState>({
    phase: 'selection',
    selectedMove: null,
    selectedTarget: null,
    battleLog: defaultLog,
    turnCount: 1,
    isPlayerTurn: true,
    accumulatedPPStolen: 0, // Initialize accumulated PP stolen
    currentAnimation: null,
    isAnimating: false,
    turnOrder: undefined,
    currentTurnIndex: undefined
  });

  // Single opponent state (for single player mode)
  const [opponent, setOpponent] = useState<Opponent>(propOpponent || {
    id: 'opponent_1',
    name: 'Rival Vault',
    currentPP: 500,
    maxPP: 500,
    shieldStrength: 100,
    maxShieldStrength: 100,
    level: 5
  });

  // Multiple opponents state (for multiplayer mode)
  const [opponents, setOpponents] = useState<Opponent[]>(propOpponents || []);
  
  // Allies state (for multiplayer mode, includes current player)
  const [allies, setAllies] = useState<Opponent[]>(propAllies || []);
  
  // Track selected moves for all participants in multiplayer mode
  // Key: participantId, Value: { move: Move | null, targetId: string | null }
  const [participantMoves, setParticipantMoves] = useState<Map<string, { move: Move | null; targetId: string | null }>>(new Map());
  
  // Track other players' move selections from Firestore (for Island Raid)
  const [firestorePlayerMoves, setFirestorePlayerMoves] = useState<Map<string, { moveId: string; moveName: string; targetId: string }>>(new Map());

  const [cpuOpponentMoves, setCpuOpponentMoves] = useState<any>(null);
  const [activeDefensiveMoves, setActiveDefensiveMoves] = useState<Array<{
    moveName: string;
    damageReduction?: { amount?: number; percentage?: number };
    counterMove?: any;
    remainingTurns: number;
  }>>([]);

  // Active status effects on player and opponent
  interface ActiveEffect {
    type: 'burn' | 'stun' | 'bleed' | 'poison' | 'confuse' | 'drain' | 'cleanse' | 'freeze' | 'reduce';
    duration: number;
    damagePerTurn?: number;
    ppLossPerTurn?: number;
    ppStealPerTurn?: number;
    healPerTurn?: number;
    chance?: number; // For confuse
    intensity?: number; // Legacy support
    damageReduction?: number; // For reduce effect - percentage of damage to reduce (0-100)
  }

  const [playerEffects, setPlayerEffects] = useState<ActiveEffect[]>([]);
  const [opponentEffects, setOpponentEffects] = useState<ActiveEffect[]>([]);
  
  // Track if Terra awakened callback has been called (to prevent multiple triggers)
  const terraAwakenedTriggeredRef = useRef(false);
  
  // Reset Terra awakened trigger when opponent changes
  useEffect(() => {
    terraAwakenedTriggeredRef.current = false;
  }, [propOpponent?.id]);

  // Apply status effects at the start of a turn
  const applyTurnEffects = useCallback(async (target: 'player' | 'opponent', log: string[]) => {
    const effects = target === 'player' ? playerEffects : opponentEffects;
    const setEffects = target === 'player' ? setPlayerEffects : setOpponentEffects;
    const isPlayer = target === 'player';
    const targetName = isPlayer ? (currentUser?.displayName || 'Player') : opponent.name;
    
    if (effects.length === 0) return { skipTurn: false, newLog: log };
    
    let skipTurn = false;
    const newLog = [...log];
    const updatedEffects: ActiveEffect[] = [];
    let totalDamage = 0;
    let totalPPLoss = 0;
    let totalPPStolen = 0;
    let totalHealing = 0;
    
    for (const effect of effects) {
      const newDuration = effect.duration - 1;
      
      // Apply effect based on type
      switch (effect.type) {
        case 'stun':
          if (effect.duration > 0) {
            skipTurn = true;
            newLog.push(`⚡ ${targetName} is stunned and cannot act!`);
          }
          break;
          
        case 'freeze':
          if (effect.duration > 0) {
            skipTurn = true;
            newLog.push(`❄️ ${targetName} is frozen and cannot act!`);
          }
          break;
          
        case 'burn':
        case 'poison':
          const damage = effect.damagePerTurn || effect.intensity || 0;
          if (damage > 0) {
            totalDamage += damage;
            // Log will be updated after we know shield vs health breakdown
          }
          break;
          
        case 'bleed':
          const ppLoss = effect.ppLossPerTurn || effect.intensity || 0;
          if (ppLoss > 0) {
            totalPPLoss += ppLoss;
            // Log will show actual PP lost after application
          }
          break;
          
        case 'drain':
          const ppSteal = effect.ppStealPerTurn || effect.intensity || 0;
          const heal = effect.healPerTurn || 0;
          if (ppSteal > 0) {
            totalPPStolen += ppSteal;
            // Log will show actual PP stolen after application
          }
          if (heal > 0) {
            totalHealing += heal;
            // Log will show actual healing after application
          }
          break;
      }
      
      // Keep effect if it has remaining duration
      if (newDuration > 0) {
        updatedEffects.push({ ...effect, duration: newDuration });
      } else {
        newLog.push(`✨ ${targetName}'s ${effect.type} effect has worn off!`);
      }
    }
    
    // Apply forest stage field bonus for Terra (opponent healing)
    if (!isPlayer && isForestStageActive && opponent.name?.toLowerCase().includes('terra')) {
      const fieldBonusHealing = 10;
      const currentOpponentHealth = opponent.currentPP;
      const currentOpponentShield = opponent.shieldStrength;
      const actualHealthHealed = Math.min(opponent.maxPP - currentOpponentHealth, fieldBonusHealing);
      const actualShieldHealed = Math.min(opponent.maxShieldStrength - currentOpponentShield, Math.floor(fieldBonusHealing * 0.5));
      
      if (actualHealthHealed > 0 || actualShieldHealed > 0) {
        totalHealing += fieldBonusHealing;
        if (actualHealthHealed > 0 && actualShieldHealed > 0) {
          newLog.push(`🌳 ${targetName} receives ${fieldBonusHealing} healing from the Forest Stage (${actualHealthHealed} health, ${actualShieldHealed} shields)!`);
        } else if (actualHealthHealed > 0) {
          newLog.push(`🌳 ${targetName} receives ${fieldBonusHealing} healing from the Forest Stage (${actualHealthHealed} health)!`);
        } else if (actualShieldHealed > 0) {
          newLog.push(`🌳 ${targetName} receives ${fieldBonusHealing} healing from the Forest Stage (${actualShieldHealed} shields)!`);
        }
      }
    }
    
    // Apply damage/healing/PP changes
    if (isPlayer && vault) {
      if (totalDamage > 0) {
        // Apply damage to shields first, then health
        const shieldDamage = Math.min(totalDamage, vault.shieldStrength);
        const healthDamage = Math.max(0, totalDamage - vault.shieldStrength);
        
        // Log detailed damage breakdown for each effect
        for (const effect of effects) {
          if ((effect.type === 'burn' || effect.type === 'poison') && effect.damagePerTurn) {
            const effectDamage = effect.damagePerTurn || effect.intensity || 0;
            if (effectDamage > 0) {
              const effectShieldDamage = Math.min(effectDamage, vault.shieldStrength);
              const effectHealthDamage = Math.max(0, effectDamage - vault.shieldStrength);
              if (effectShieldDamage > 0 && effectHealthDamage > 0) {
                newLog.push(`🔥 ${targetName} takes ${effectDamage} ${effect.type} damage (${effectShieldDamage} to shields, ${effectHealthDamage} to health)!`);
              } else if (effectShieldDamage > 0) {
                newLog.push(`🔥 ${targetName} takes ${effectDamage} ${effect.type} damage (${effectShieldDamage} to shields)!`);
              } else if (effectHealthDamage > 0) {
                newLog.push(`🔥 ${targetName} takes ${effectDamage} ${effect.type} damage (${effectHealthDamage} to health)!`);
              }
            }
          }
        }
        
        await updateVault({
          shieldStrength: Math.max(0, vault.shieldStrength - shieldDamage),
          vaultHealth: Math.max(0, (vault.vaultHealth || vault.maxVaultHealth || 0) - healthDamage)
        });
        await refreshVaultData();
      }
      
      if (totalPPLoss > 0) {
        const actualPPLost = Math.min(totalPPLoss, vault.currentPP);
        await updateVault({
          currentPP: Math.max(0, vault.currentPP - totalPPLoss)
        });
        await refreshVaultData();
        // Log bleed effects with actual impact
        for (const effect of effects) {
          if (effect.type === 'bleed' && effect.ppLossPerTurn) {
            const effectPPLoss = effect.ppLossPerTurn || effect.intensity || 0;
            if (effectPPLoss > 0) {
              const actualEffectLoss = Math.min(effectPPLoss, vault.currentPP);
              newLog.push(`🩸 ${targetName} loses ${actualEffectLoss} PP from bleeding!`);
            }
          }
        }
      }
      
      if (totalPPStolen > 0) {
        // PP is stolen from player, opponent gains it (handled in opponent update)
        const actualPPStolen = Math.min(totalPPStolen, vault.currentPP);
        await updateVault({
          currentPP: Math.max(0, vault.currentPP - totalPPStolen)
        });
        await refreshVaultData();
        // Log drain effects with actual impact
        for (const effect of effects) {
          if (effect.type === 'drain' && effect.ppStealPerTurn) {
            const effectPPSteal = effect.ppStealPerTurn || effect.intensity || 0;
            if (effectPPSteal > 0) {
              const actualEffectSteal = Math.min(effectPPSteal, vault.currentPP);
              newLog.push(`💉 ${targetName} has ${actualEffectSteal} PP drained!`);
            }
          }
        }
      }
      
      if (totalHealing > 0) {
        const currentHealth = vault.vaultHealth || vault.maxVaultHealth || 0;
        // Max vault health is always 10% of vault capacity
        const maxHealth = Math.floor((vault.capacity || 1000) * 0.1);
        const actualHealthHealed = Math.min(maxHealth - currentHealth, totalHealing);
        const actualShieldHealed = Math.min((vault.maxShieldStrength || 100) - vault.shieldStrength, Math.floor(totalHealing * 0.5));
        await updateVault({
          vaultHealth: Math.min(maxHealth, currentHealth + totalHealing),
          shieldStrength: Math.min(vault.maxShieldStrength || 100, vault.shieldStrength + Math.floor(totalHealing * 0.5))
        });
        await refreshVaultData();
        // Log drain healing with actual impact
        for (const effect of effects) {
          if (effect.type === 'drain' && effect.healPerTurn) {
            const effectHeal = effect.healPerTurn || 0;
            if (effectHeal > 0) {
              const effectHealthHealed = Math.min(maxHealth - currentHealth, effectHeal);
              const effectShieldHealed = Math.min((vault.maxShieldStrength || 100) - vault.shieldStrength, Math.floor(effectHeal * 0.5));
              if (effectHealthHealed > 0 && effectShieldHealed > 0) {
                newLog.push(`💚 ${targetName} heals ${effectHeal} from drain effect (${effectHealthHealed} health, ${effectShieldHealed} shields)!`);
              } else if (effectHealthHealed > 0) {
                newLog.push(`💚 ${targetName} heals ${effectHeal} from drain effect (${effectHealthHealed} health)!`);
              } else if (effectShieldHealed > 0) {
                newLog.push(`💚 ${targetName} heals ${effectHeal} from drain effect (${effectShieldHealed} shields)!`);
              }
            }
          }
        }
      }
    } else {
      // Apply to opponent
      if (totalDamage > 0) {
        const shieldDamage = Math.min(totalDamage, opponent.shieldStrength);
        const healthDamage = Math.max(0, totalDamage - opponent.shieldStrength);
        
        // Log detailed damage breakdown for each effect
        for (const effect of effects) {
          if ((effect.type === 'burn' || effect.type === 'poison') && effect.damagePerTurn) {
            const effectDamage = effect.damagePerTurn || effect.intensity || 0;
            if (effectDamage > 0) {
              const effectShieldDamage = Math.min(effectDamage, opponent.shieldStrength);
              const effectHealthDamage = Math.max(0, effectDamage - opponent.shieldStrength);
              if (effectShieldDamage > 0 && effectHealthDamage > 0) {
                newLog.push(`🔥 ${targetName} takes ${effectDamage} ${effect.type} damage (${effectShieldDamage} to shields, ${effectHealthDamage} to health)!`);
              } else if (effectShieldDamage > 0) {
                newLog.push(`🔥 ${targetName} takes ${effectDamage} ${effect.type} damage (${effectShieldDamage} to shields)!`);
              } else if (effectHealthDamage > 0) {
                newLog.push(`🔥 ${targetName} takes ${effectDamage} ${effect.type} damage (${effectHealthDamage} to health)!`);
              }
            }
          }
        }
        
        setOpponent(prev => ({
          ...prev,
          shieldStrength: Math.max(0, prev.shieldStrength - shieldDamage),
          currentPP: Math.max(0, prev.currentPP - healthDamage)
        }));
      }
      
      if (totalPPLoss > 0) {
        const actualPPLost = Math.min(totalPPLoss, opponent.currentPP);
        setOpponent(prev => ({
          ...prev,
          currentPP: Math.max(0, prev.currentPP - totalPPLoss)
        }));
        // Log bleed effects with actual impact
        for (const effect of effects) {
          if (effect.type === 'bleed' && effect.ppLossPerTurn) {
            const effectPPLoss = effect.ppLossPerTurn || effect.intensity || 0;
            if (effectPPLoss > 0) {
              const actualEffectLoss = Math.min(effectPPLoss, opponent.currentPP);
              newLog.push(`🩸 ${targetName} loses ${actualEffectLoss} PP from bleeding!`);
            }
          }
        }
      }
      
      if (totalPPStolen > 0) {
        // Opponent loses PP, player gains it
        const actualPPStolen = Math.min(totalPPStolen, opponent.currentPP);
        setOpponent(prev => ({
          ...prev,
          currentPP: Math.max(0, prev.currentPP - totalPPStolen)
        }));
        if (vault) {
          const playerGained = Math.min(vault.capacity || 1000 - vault.currentPP, totalPPStolen);
          await updateVault({
            currentPP: Math.min(vault.capacity || 1000, vault.currentPP + totalPPStolen)
          });
          await refreshVaultData();
        }
        // Log drain effects with actual impact
        for (const effect of effects) {
          if (effect.type === 'drain' && effect.ppStealPerTurn) {
            const effectPPSteal = effect.ppStealPerTurn || effect.intensity || 0;
            if (effectPPSteal > 0) {
              const actualEffectSteal = Math.min(effectPPSteal, opponent.currentPP);
              newLog.push(`💉 ${targetName} has ${actualEffectSteal} PP drained!`);
            }
          }
        }
      }
      
      if (totalHealing > 0) {
        const currentOpponentHealth = opponent.currentPP;
        const currentOpponentShield = opponent.shieldStrength;
        const actualHealthHealed = Math.min(opponent.maxPP - currentOpponentHealth, totalHealing);
        const actualShieldHealed = Math.min(opponent.maxShieldStrength - currentOpponentShield, Math.floor(totalHealing * 0.5));
        setOpponent(prev => ({
          ...prev,
          currentPP: Math.min(prev.maxPP, prev.currentPP + totalHealing),
          shieldStrength: Math.min(prev.maxShieldStrength, prev.shieldStrength + Math.floor(totalHealing * 0.5))
        }));
        // Log drain healing with actual impact
        for (const effect of effects) {
          if (effect.type === 'drain' && effect.healPerTurn) {
            const effectHeal = effect.healPerTurn || 0;
            if (effectHeal > 0) {
              const effectHealthHealed = Math.min(opponent.maxPP - currentOpponentHealth, effectHeal);
              const effectShieldHealed = Math.min(opponent.maxShieldStrength - currentOpponentShield, Math.floor(effectHeal * 0.5));
              if (effectHealthHealed > 0 && effectShieldHealed > 0) {
                newLog.push(`💚 ${targetName} heals ${effectHeal} from drain effect (${effectHealthHealed} health, ${effectShieldHealed} shields)!`);
              } else if (effectHealthHealed > 0) {
                newLog.push(`💚 ${targetName} heals ${effectHeal} from drain effect (${effectHealthHealed} health)!`);
              } else if (effectShieldHealed > 0) {
                newLog.push(`💚 ${targetName} heals ${effectHeal} from drain effect (${effectShieldHealed} shields)!`);
              }
            }
          }
        }
      }
    }
    
    setEffects(updatedEffects);
    return { skipTurn, newLog };
  }, [playerEffects, opponentEffects, vault, opponent, currentUser, updateVault, refreshVaultData]);

  // Add status effect from a move
  const addStatusEffect = useCallback((target: 'player' | 'opponent', effect: ActiveEffect, successChance: number = 100) => {
    const setEffects = target === 'player' ? setPlayerEffects : setOpponentEffects;
    const effects = target === 'player' ? playerEffects : opponentEffects;
    
    // Check if effect successfully applies based on success chance
    const roll = Math.random() * 100;
    if (roll > successChance) {
      // Effect failed to apply
      return false;
    }
    
    setEffects(prev => {
      // Cleanse removes all negative effects
      if (effect.type === 'cleanse') {
        // Remove all negative effects (keep only positive ones if any, but currently we don't have positive effects)
        return [];
      }
      
      // For poison, stack effects. For others, replace if same type
      if (effect.type === 'poison') {
        return [...prev, effect];
      } else {
        // Remove existing effect of same type and add new one
        const filtered = prev.filter(e => e.type !== effect.type);
        return [...filtered, effect];
      }
    });
    return true;
  }, [playerEffects, opponentEffects]);

  // Fetch user level and photo
  useEffect(() => {
    const fetchUserData = async () => {
      if (!currentUser) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'students', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const calculatedLevel = getLevelFromXP(userData.xp || 0);
          const finalPhotoURL = userData.photoURL || currentUser.photoURL || null;
          console.log('BattleEngine: User data from Firestore:', userData);
          console.log('BattleEngine: User XP from Firestore:', userData.xp);
          console.log('BattleEngine: Calculated level from XP:', calculatedLevel);
          console.log('BattleEngine: Final photoURL:', finalPhotoURL);
          setUserLevel(calculatedLevel);
          setUserPhotoURL(finalPhotoURL);
          // Load equipped artifacts for artifact damage multiplier
          setEquippedArtifacts(userData.equippedArtifacts || null);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, [currentUser]);

  // Load CPU opponent moves from Firestore
  useEffect(() => {
    const loadCpuOpponentMoves = async () => {
      try {
        const cpuMovesRef = doc(db, 'adminSettings', 'cpuOpponentMoves');
        const cpuMovesDoc = await getDoc(cpuMovesRef);
        
        if (cpuMovesDoc.exists()) {
          const data = cpuMovesDoc.data();
          if (data.opponents && Array.isArray(data.opponents)) {
            setCpuOpponentMoves(data.opponents);
          }
        }
      } catch (error) {
        console.error('Error loading CPU opponent moves:', error);
      }
    };

    loadCpuOpponentMoves();
  }, []);

  // Update parent component with battle log changes (for Mindforge mode)
  useEffect(() => {
    if (mindforgeMode && onBattleLogUpdate) {
      onBattleLogUpdate(battleState.battleLog);
    }
  }, [battleState.battleLog, mindforgeMode, onBattleLogUpdate]);
  
  // Initialize battle log from prop when it changes (for Mindforge and Island Raid continuity across rounds)
  useEffect(() => {
    if (initialBattleLog && initialBattleLog.length > 0) {
      setBattleState(prev => {
        // Only update if the initial log has more entries than current (to avoid resetting)
        if (initialBattleLog.length > prev.battleLog.length) {
          // Merge: keep existing entries, add new ones from initialBattleLog
          // Use the last N entries from initialBattleLog where N is the difference
          const newEntries = initialBattleLog.slice(prev.battleLog.length);
          const merged = [...prev.battleLog, ...newEntries];
          console.log('📝 BattleEngine: Merged battle log entries:', newEntries);
          return {
            ...prev,
            battleLog: merged
          };
        }
        return prev;
      });
    }
  }, [initialBattleLog]);
  
  // Note: Animation clearing is now handled by BattleAnimations component calling handleAnimationComplete
  // No need for separate auto-clear effect - the animation component handles its own lifecycle

  // Update opponent when prop changes
  // In Mindforge mode, sync with prop to maintain state between questions (but only if actually different)
  // In other modes, only update if ID or name changes to prevent resetting during battle
  useEffect(() => {
    if (propOpponent) {
      setOpponent(prev => {
        if (mindforgeMode) {
          // In Mindforge mode, sync with prop if stats are different (maintains state between questions)
          // This ensures state persists when BattleEngine unmounts/remounts between questions
          if (prev.id !== propOpponent.id || 
              prev.name !== propOpponent.name ||
              prev.currentPP !== propOpponent.currentPP ||
              prev.shieldStrength !== propOpponent.shieldStrength ||
              prev.maxPP !== propOpponent.maxPP ||
              prev.maxShieldStrength !== propOpponent.maxShieldStrength) {
            return propOpponent;
          }
          return prev;
        } else {
          // Only update if the prop is actually different (prevent resetting during battle)
          if (prev.id !== propOpponent.id || prev.name !== propOpponent.name) {
            // Reset accumulated PP when starting a new battle
            setBattleState(prevState => ({
              ...prevState,
              accumulatedPPStolen: 0
            }));
            // Reset active defensive moves when starting a new battle
            setActiveDefensiveMoves([]);
            return propOpponent;
          }
          return prev;
        }
      });
    }
  }, [propOpponent, mindforgeMode]);

  // Update opponents when prop changes (for multiplayer mode)
  useEffect(() => {
    if (propOpponents && isMultiplayer) {
      setOpponents(propOpponents);
    }
  }, [propOpponents, isMultiplayer]);

  // Update allies when prop changes (for multiplayer mode)
  useEffect(() => {
    if (propAllies && isMultiplayer) {
      console.log('BattleEngine: Updating allies from props:', propAllies.length, propAllies.map(a => a.name));
      setAllies(propAllies);
    }
  }, [propAllies, isMultiplayer]);

  // Apply opponent move from Firestore
  const applyOpponentMove = useCallback(async (moveData: any) => {
    if (!vault) return;
    
    // Don't apply if we're in victory or defeat phase
    if (battleState.phase === 'victory' || battleState.phase === 'defeat') return;

    console.log('PvP: Applying opponent move:', moveData);
    
    const newLog = [...battleState.battleLog];
    
    // Add ALL opponent's move log messages to ensure both players see the same logs
    if (moveData.battleLog) {
      if (Array.isArray(moveData.battleLog)) {
        // If battleLog is an array, add all messages in order
        moveData.battleLog.forEach((logMessage: string) => {
          if (logMessage && typeof logMessage === 'string') {
            // Check if message already exists to avoid duplicates
            if (!newLog.includes(logMessage)) {
              newLog.push(logMessage);
            }
          }
        });
        console.log('PvP: Added opponent move log messages:', moveData.battleLog);
      } else {
        // If battleLog is a single string, add it
        if (typeof moveData.battleLog === 'string' && !newLog.includes(moveData.battleLog)) {
          newLog.push(moveData.battleLog);
          console.log('PvP: Added opponent move log message:', moveData.battleLog);
        }
      }
    } else {
      // Fallback: create a log message from move data
      const moveName = moveData.moveName || 'Unknown Move';
      const damage = moveData.damage || 0;
      const shieldDamage = moveData.shieldDamage || 0;
      if (shieldDamage > 0) {
        newLog.push(`⚔️ ${opponent.name} attacked you with ${moveName} for ${shieldDamage} damage to shields!`);
      }
      if (damage > 0) {
        newLog.push(`💥 ${opponent.name} dealt ${damage} damage to your vault health!`);
      }
    }
    
    // Update opponent stats from the move data (opponent's stats after their move)
    // moveData.playerStats contains the opponent's stats (they're the player who made the move)
    // Note: For PvP, we need to fetch opponent's vault health from Firestore
    if (moveData.playerStats && isPvP && opponent.id) {
      try {
        // Fetch opponent's updated vault data to get vault health
        const opponentVaultRef = doc(db, 'vaults', opponent.id);
        const opponentVaultDoc = await getDoc(opponentVaultRef);
        
        if (opponentVaultDoc.exists()) {
          const opponentVaultData = opponentVaultDoc.data();
          // Max vault health is always 10% of vault capacity
          const maxVaultHealth = Math.floor((opponentVaultData.capacity || 1000) * 0.1);
          const vaultHealth = opponentVaultData.vaultHealth !== undefined 
            ? opponentVaultData.vaultHealth 
            : Math.min(opponentVaultData.currentPP || 0, maxVaultHealth);
          
          setOpponent(prev => {
            const updatedOpponent = {
              ...prev,
              shieldStrength: moveData.playerStats.shieldStrength ?? prev.shieldStrength,
              vaultHealth: vaultHealth,
              maxVaultHealth: maxVaultHealth
            };
            
            // In Mindforge mode, notify parent of opponent update
            if (mindforgeMode && onOpponentUpdate) {
              onOpponentUpdate(updatedOpponent);
            }
            
            return updatedOpponent;
          });
        }
      } catch (error) {
        console.error('Error fetching opponent vault health:', error);
        // Fallback to basic update
        setOpponent(prev => {
          const updatedOpponent = {
            ...prev,
            shieldStrength: moveData.playerStats.shieldStrength ?? prev.shieldStrength
          };
          return updatedOpponent;
        });
      }
    } else if (moveData.playerStats) {
      // For non-PvP (CPU opponents), update normally
      setOpponent(prev => {
        const updatedOpponent = {
          ...prev,
          shieldStrength: moveData.playerStats.shieldStrength ?? prev.shieldStrength,
          currentPP: moveData.playerStats.currentPP ?? prev.currentPP
        };
        
        // In Mindforge mode, notify parent of opponent update
        if (mindforgeMode && onOpponentUpdate) {
          onOpponentUpdate(updatedOpponent);
        }
        
        return updatedOpponent;
      });
    }
    
    // Apply damage/effects to player (current user)
    // Note: In PvP, opponent attacks damage vault health, not PP
    // The vault health is updated via executeVaultSiegeAttack which handles vault health correctly
    // We just need to update shields and refresh vault state to get updated health
    if (moveData.opponentStats) {
      const newShieldStrength = moveData.opponentStats.shieldStrength ?? vault.shieldStrength;
      
      console.log('PvP: Updating player stats after opponent move:', {
        oldShield: vault.shieldStrength,
        newShield: newShieldStrength
      });
      
      // Update vault shields (vault health is updated by executeVaultSiegeAttack)
      try {
        await updateVault({
          shieldStrength: newShieldStrength
        });
        
        console.log('PvP: Player vault shields updated after opponent move');
        
        // Refresh vault to get updated health and check for defeat
        if (!currentUser) return;
        const updatedVaultRef = doc(db, 'vaults', currentUser.uid);
        const updatedVaultDoc = await getDoc(updatedVaultRef);
        if (updatedVaultDoc.exists()) {
          const updatedVaultData = updatedVaultDoc.data();
          // Max vault health is always 10% of vault capacity
          const maxVaultHealth = Math.floor((updatedVaultData.capacity || 1000) * 0.1);
          const updatedVaultHealth = updatedVaultData.vaultHealth !== undefined 
            ? updatedVaultData.vaultHealth 
            : maxVaultHealth;
          
          // Refresh vault data to update local state
          await refreshVaultData();
          
          if (updatedVaultHealth <= 0) {
            newLog.push('💀 Your vault health has been completely depleted!');
          newLog.push(`💀 Defeat! ${opponent.name} won the PvP battle!`);
          setBattleState(prev => ({
            ...prev,
            phase: 'defeat',
            battleLog: newLog,
            isPlayerTurn: false
          }));
          
          if (isPvP && currentUser) {
            onBattleEnd('defeat', opponent.id, currentUser.uid);
          }
          return;
          }
        }
      } catch (error) {
        console.error('Error updating vault after opponent move:', error);
      }
    }
    
    // Update battle state to player's turn
    // Add turn messages only if they're not already in the log (to avoid duplicates)
    const turnMessage = `🔄 Turn ${battleState.turnCount + 1} begins!`;
    const yourTurnMessage = `✅ It's your turn! Select a move to attack ${opponent.name}!`;
    
    // Add "Waiting" message if not already present (shows that opponent just made their move)
    const waitingMessage = `⏳ Waiting for ${opponent.name} to make their move...`;
    if (newLog.includes(waitingMessage)) {
      // Remove waiting message since opponent just made their move
      const waitingIndex = newLog.indexOf(waitingMessage);
      if (waitingIndex !== -1) {
        newLog.splice(waitingIndex, 1);
      }
    }
    
    if (!newLog.includes(turnMessage)) {
      newLog.push(turnMessage);
    }
    if (!newLog.includes(yourTurnMessage)) {
      newLog.push(yourTurnMessage);
    }
    
    setBattleState(prev => ({
      ...prev,
      phase: 'selection',
      battleLog: newLog,
      isPlayerTurn: true,
      turnCount: prev.turnCount + 1
    }));
  }, [vault, battleState.phase, battleState.battleLog, battleState.turnCount, opponent, isPvP, currentUser, updateVault, onBattleEnd]);

  // Poll for opponent moves in PvP battles (instead of onSnapshot to avoid Firestore internal errors)
  useEffect(() => {
    // Don't set up polling if battle is ending or not properly initialized
    if (!isPvP || !battleRoom || !currentUser || !vault || !opponent?.id) return;
    if (!battleRoom.id || battleState.phase === 'victory' || battleState.phase === 'defeat') {
      return;
    }

    let isMounted = true;
    let pollInterval: NodeJS.Timeout | null = null;

    const pollForOpponentMoves = async () => {
      if (!isMounted || !battleRoom || !currentUser || !opponent?.id) return;
      
      // Get current phase from state to avoid stale closure
      const currentPhase = battleState.phase;
      if (currentPhase === 'victory' || currentPhase === 'defeat') {
        return;
      }

      try {
        const movesCollectionRef = collection(db, 'battleRooms', battleRoom.id, 'moves');
        // Query without orderBy to avoid index requirement - we'll sort client-side
        const q = query(
          movesCollectionRef,
          where('userId', '==', opponent.id)
        );

        const snapshot = await getDocs(q);
        
        // Sort by timestamp client-side (newest first)
        const sortedDocs = snapshot.docs.sort((a, b) => {
          const aTime = a.data().timestamp?.toMillis?.() || 0;
          const bTime = b.data().timestamp?.toMillis?.() || 0;
          return bTime - aTime; // Descending order
        });
        
        // Process moves in order (oldest first to maintain battle log sequence)
        const movesToProcess = sortedDocs
          .filter(docSnapshot => {
            const moveData = docSnapshot.data();
            return !moveData.processedBy?.includes(currentUser.uid);
          })
          .reverse(); // Reverse to process oldest first
        
        for (const docSnapshot of movesToProcess) {
          const moveData = docSnapshot.data();
          
          // Double-check phase hasn't changed
          if (battleState.phase === 'victory' || battleState.phase === 'defeat') {
            break;
          }
          
          console.log('[BattleEngine] PvP: Processing opponent move:', {
            moveName: moveData.moveName,
            turnNumber: moveData.turnNumber,
            currentPhase: battleState.phase,
            isPlayerTurn: battleState.isPlayerTurn
          });
          
          // Apply the opponent's move (will check phase internally and switch to player's turn)
          await applyOpponentMove(moveData);
          
          // Mark this move as processed by current user
          try {
            await updateDoc(doc(db, 'battleRooms', battleRoom.id, 'moves', docSnapshot.id), {
              processedBy: [...(moveData.processedBy || []), currentUser.uid]
            });
            console.log('[BattleEngine] PvP: Marked move as processed');
          } catch (error) {
            console.error('[BattleEngine] Error marking move as processed:', error);
          }
        }
      } catch (error: any) {
        // Silently handle Firestore errors - they're often transient
        if (error?.code === 'failed-precondition' || error?.code === 'unimplemented') {
          console.warn('[BattleEngine] Firestore index may be missing for battle moves query');
        } else if (error?.code === 'internal' || error?.message?.includes('INTERNAL ASSERTION')) {
          // Silently ignore Firestore internal assertion errors
          return;
        } else {
          console.error('[BattleEngine] Error polling for opponent moves:', error);
        }
      }
    };

    // Poll every 500ms for opponent moves (faster for better real-time feel)
    pollInterval = setInterval(pollForOpponentMoves, 500);

    return () => {
      isMounted = false;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [isPvP, battleRoom?.id, opponent?.id, currentUser?.uid, vault, battleState.phase, applyOpponentMove]);

  const availableMoves = moves.filter(move => move.unlocked && move.currentCooldown === 0);
  
  // Create availableTargets from current opponent state - this will update when opponent changes
  // For single player mode, use single opponent. For multiplayer, use opponents array.
  const availableTargets = useMemo(() => {
    if (isMultiplayer && opponents.length > 0) {
      return opponents.map(opp => ({
        id: opp.id,
        name: opp.name,
        avatar: '🏰',
        currentPP: opp.currentPP,
        shieldStrength: opp.shieldStrength,
        maxPP: opp.maxPP,
        maxShieldStrength: opp.maxShieldStrength,
        level: opp.level,
        vaultHealth: opp.vaultHealth,
        maxVaultHealth: opp.maxVaultHealth
      }));
    } else {
      return [
    {
      id: opponent.id,
      name: opponent.name,
      avatar: '🏰',
      currentPP: opponent.currentPP,
      shieldStrength: opponent.shieldStrength,
      maxPP: opponent.maxPP,
          maxShieldStrength: opponent.maxShieldStrength,
          level: opponent.level
        }
      ];
    }
  }, [
    isMultiplayer,
    opponent.id, opponent.name, opponent.currentPP, opponent.shieldStrength, opponent.maxPP, opponent.maxShieldStrength, opponent.level,
    opponents
  ]);

  // Store player's move selection for multiplayer turn order
  useEffect(() => {
    if (isMultiplayer && battleState.selectedMove && battleState.selectedTarget && currentUser) {
      // Store locally
      setParticipantMoves(prev => {
        const newMap = new Map(prev);
        newMap.set(currentUser.uid, {
          move: battleState.selectedMove,
          targetId: battleState.selectedTarget
        });
        console.log(`✅ Stored local move selection: ${battleState.selectedMove?.name} on ${battleState.selectedTarget}`);
        return newMap;
      });
      
      // Also store in Firestore for Island Raid battles (so other players can see it)
      // Check if we're in an Island Raid by checking if opponents have vaultHealth (Island Raid enemies use vaultHealth)
      const isIslandRaid = opponents.length > 0 && opponents[0].vaultHealth !== undefined;
      if (isIslandRaid && gameId) {
        const storeMoveInFirestore = async () => {
          try {
            const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
            await updateDoc(battleRoomRef, {
              [`playerMoves.${currentUser.uid}`]: {
                moveId: battleState.selectedMove?.id,
                moveName: battleState.selectedMove?.name,
                targetId: battleState.selectedTarget,
                timestamp: serverTimestamp()
              },
              updatedAt: serverTimestamp()
            });
            console.log(`💾 Stored move selection in Firestore for ${currentUser.uid}`);
          } catch (error) {
            console.error('Error storing move in Firestore:', error);
          }
        };
        storeMoveInFirestore();
      }
    }
  }, [battleState.selectedMove, battleState.selectedTarget, isMultiplayer, currentUser, opponents, gameId]);

  // Listen for other players' move selections from Firestore (for Island Raid)
  useEffect(() => {
    if (!isMultiplayer || !gameId || !currentUser) return;

    const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
    const unsubscribe = onSnapshot(battleRoomRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        const playerMoves = data.playerMoves || {};
        
        // Update firestorePlayerMoves with other players' moves (not current user)
        const newFirestoreMoves = new Map<string, { moveId: string; moveName: string; targetId: string }>();
        Object.keys(playerMoves).forEach((userId) => {
          if (userId !== currentUser.uid && playerMoves[userId]) {
            newFirestoreMoves.set(userId, playerMoves[userId]);
          }
        });
        setFirestorePlayerMoves(newFirestoreMoves);
        
        if (newFirestoreMoves.size > 0) {
          console.log('📡 Updated Firestore player moves:', Array.from(newFirestoreMoves.entries()).map(([id, move]) => `${id}: ${move.moveName}`));
        }
      }
    }, (error) => {
      // Suppress known Firefox Firestore errors
      if (error?.code === 'failed-precondition' || error?.message?.includes('INTERNAL ASSERTION')) {
        return;
      }
      console.error('Error listening to player moves:', error);
    });

    return () => unsubscribe();
  }, [isMultiplayer, gameId, currentUser]);

  // Automatically select moves for CPU opponents in multiplayer mode
  useEffect(() => {
    if (!isMultiplayer || !allies.length || !opponents.length || !vault) return;
    if (battleState.turnOrder) return; // Don't select if turn order already calculated

    // Check if player has selected a move (trigger CPU selection)
    const playerHasMove = currentUser && participantMoves.has(currentUser.uid);
    if (!playerHasMove) return;

    // Select moves for CPU opponents that haven't selected yet
    opponents.forEach((opponent) => {
      if (participantMoves.has(opponent.id)) return; // Already selected

      // Get CPU opponent moves from Firestore or default
      let opponentMoves: any[] = [];
      if (cpuOpponentMoves && Array.isArray(cpuOpponentMoves)) {
        const opponentId = opponent.id || opponent.name?.toLowerCase().replace(/\s+/g, '-');
        const opponentName = opponent.name?.toLowerCase() || '';
        
        // Try to find opponent by ID or name
        // For Ice Golems and Powered Zombies, match by name since IDs might vary
        const opponentData = cpuOpponentMoves.find((opp: any) => {
          const oppId = opp.id?.toLowerCase() || '';
          const oppName = opp.name?.toLowerCase() || '';
          
          // Exact ID match
          if (oppId === opponentId) return true;
          
          // Exact name match
          if (oppName === opponentName) return true;
          
          // For Ice Golems, check if ID starts with "ice-golem" or name contains "ice golem"
          if ((opponentId.startsWith('ice-golem') || opponentName.includes('ice golem')) &&
              (oppId === 'ice-golem' || oppName.includes('ice golem'))) {
            return true;
          }
          
          // For Powered Zombies, match by name (e.g., "Powered Zombie 1" matches "Powered Zombie")
          if (opponentName.includes('powered zombie') && oppName === 'powered zombie') {
            return true;
          }
          
          // For Unpowered Zombies, match by name (e.g., "Zombie 1" matches "Zombie")
          if (opponentName.includes('zombie') && !opponentName.includes('powered') && !opponentName.includes('captain') && 
              (oppName === 'zombie' || oppName.includes('zombie'))) {
            return true;
          }
          
          // For Zombie Captain, match by name
          if ((opponentName.includes('zombie captain') || opponentName === 'zombie captain') && 
              (oppName === 'zombie captain' || oppName.includes('zombie captain'))) {
            return true;
          }
          
          return false;
        });
        
        if (opponentData && opponentData.moves) {
          opponentMoves = opponentData.moves;
          console.log(`✅ Found moves for ${opponent.name} from Firestore:`, opponentMoves.map((m: any) => m.name));
          console.log(`📋 Full opponent data:`, opponentData);
        } else {
          console.warn(`⚠️ No moves found in Firestore for ${opponent.name} (ID: ${opponentId}, Name: ${opponentName})`);
          console.log(`🔍 Available opponents in Firestore:`, cpuOpponentMoves.map((opp: any) => ({ id: opp.id, name: opp.name })));
        }
      }

      // Fallback to default moves if not found
      if (opponentMoves.length === 0) {
        console.warn(`⚠️ No moves found for ${opponent.name}, using fallback moves`);
        // Check if this is an Ice Golem
        if (opponent.name?.toLowerCase().includes('ice golem') || opponent.id?.toLowerCase().includes('ice-golem')) {
          opponentMoves = [
            { name: 'Ice Shard', damageRange: { min: 20, max: 50 }, type: 'attack', level: 1, masteryLevel: 1 },
            { name: 'Ice Punch', damageRange: { min: 25, max: 40 }, type: 'attack', level: 1, masteryLevel: 1 }
          ];
        } else if (opponent.name?.toLowerCase().includes('powered zombie')) {
          // Fallback for Powered Zombie if not found in Firestore
          opponentMoves = [
            { name: 'Energy Strike', baseDamage: 9, type: 'attack', level: 1, masteryLevel: 1 },
            { name: 'Vault Breach', baseDamage: 8, type: 'attack', level: 1, masteryLevel: 1 },
            { name: 'PP Drain', baseDamage: 6, type: 'attack', level: 1, masteryLevel: 1 },
            { name: 'Shield Bash', baseDamage: 7, type: 'attack', level: 1, masteryLevel: 1 }
          ];
        } else if (opponent.name?.toLowerCase().includes('zombie') && !opponent.name?.toLowerCase().includes('powered') && !opponent.name?.toLowerCase().includes('captain')) {
          // Fallback for Unpowered Zombie if not found in Firestore
          opponentMoves = [
            { name: 'Energy Strike', baseDamage: 9, type: 'attack', level: 1, masteryLevel: 1 },
            { name: 'Vault Breach', baseDamage: 8, type: 'attack', level: 1, masteryLevel: 1 },
            { name: 'PP Drain', baseDamage: 6, type: 'attack', level: 1, masteryLevel: 1 },
            { name: 'Shield Bash', baseDamage: 7, type: 'attack', level: 1, masteryLevel: 1 }
          ];
        } else {
          // Default training dummy moves
          opponentMoves = [
            { name: 'Vault Breach', baseDamage: 8, type: 'attack', level: 1, masteryLevel: 1 },
            { name: 'PP Drain', baseDamage: 6, type: 'attack', level: 1, masteryLevel: 1 },
            { name: 'Shield Bash', baseDamage: 7, type: 'attack', level: 1, masteryLevel: 1 },
            { name: 'Energy Strike', baseDamage: 9, type: 'attack', level: 1, masteryLevel: 1 }
          ];
        }
      }

      // Select best target - CPU opponents should target allies (players), not other opponents
      // For Ice Golems and other CPU enemies, they should attack the player(s)
      const targetId = selectOptimalCPUTarget(opponents, allies, opponent.id);
      if (!targetId) {
        console.warn(`⚠️ No target found for ${opponent.name}. Available allies: ${allies.length}, opponents: ${opponents.length}`);
        // Fallback: target the first ally (player) if available
        if (allies.length > 0) {
          const fallbackTargetId = allies[0].id;
          console.log(`🔄 Using fallback target for ${opponent.name}: ${allies[0].name} (${fallbackTargetId})`);
          
          // Still try to select a move with the fallback target
          const target = allies[0];
          const situation: BattleSituation = {
            cpuHealth: opponent.currentPP,
            cpuMaxHealth: opponent.maxPP,
            cpuShield: opponent.shieldStrength,
            cpuMaxShield: opponent.maxShieldStrength,
            cpuLevel: opponent.level,
            targetHealth: target.currentPP,
            targetMaxHealth: target.maxPP,
            targetShield: target.shieldStrength,
            targetMaxShield: target.maxShieldStrength,
            targetLevel: target.level,
            availableMoves: opponentMoves.map((move: any) => ({
              name: move.name,
              type: move.type || 'attack',
              baseDamage: move.baseDamage,
              damageRange: move.damageRange,
              healingRange: move.healingRange,
              shieldBoost: move.shieldBoost,
              ppSteal: move.ppSteal,
              statusEffects: move.statusEffects || (move.statusEffect ? [move.statusEffect] : []),
              priority: move.priority,
              level: move.level || 1,
              masteryLevel: move.masteryLevel || 1
            }))
          };
          
          const selectedMove = selectOptimalCPUMove(situation, fallbackTargetId);
          if (selectedMove) {
            setParticipantMoves(prev => {
              const newMap = new Map(prev);
              newMap.set(opponent.id, {
                move: selectedMove.move as any,
                targetId: fallbackTargetId
              });
              return newMap;
            });
            console.log(`🤖 ${opponent.name} selected (fallback): ${selectedMove.move.name} on ${target.name}`);
          }
        }
        return;
      }

      // Since we swapped parameters, targetId is from the allies array (player)
      const target = allies.find(ally => ally.id === targetId) || opponents.find(opp => opp.id === targetId);
      if (!target) {
        console.error(`❌ Target not found for ${opponent.name}. targetId: ${targetId}, allies: ${allies.map(a => a.id)}, opponents: ${opponents.map(o => o.id)}`);
        return;
      }

      // Create battle situation for move selection
      const situation: BattleSituation = {
        cpuHealth: opponent.currentPP,
        cpuMaxHealth: opponent.maxPP,
        cpuShield: opponent.shieldStrength,
        cpuMaxShield: opponent.maxShieldStrength,
        cpuLevel: opponent.level,
        targetHealth: target.currentPP,
        targetMaxHealth: target.maxPP,
        targetShield: target.shieldStrength,
        targetMaxShield: target.maxShieldStrength,
        targetLevel: target.level,
        availableMoves: opponentMoves.map((move: any) => ({
          name: move.name,
          type: move.type || 'attack',
          baseDamage: move.baseDamage,
          damageRange: move.damageRange,
          healingRange: move.healingRange,
          shieldBoost: move.shieldBoost,
          ppSteal: move.ppSteal,
          statusEffects: move.statusEffects || (move.statusEffect ? [move.statusEffect] : []),
          priority: move.priority,
          level: move.level || 1,
          masteryLevel: move.masteryLevel || 1
        }))
      };

      // Select optimal move
      const selectedMove = selectOptimalCPUMove(situation, targetId);
      if (selectedMove) {
        setParticipantMoves(prev => {
          const newMap = new Map(prev);
          newMap.set(opponent.id, {
            move: selectedMove.move as any, // Convert to Move type
            targetId: selectedMove.targetId
          });
          return newMap;
        });

        // Log CPU move selection (optional, for debugging)
        console.log(`🤖 ${opponent.name} selected: ${selectedMove.move.name} on ${target.name} - ${selectedMove.reason}`);
        console.log(`🤖 ${opponent.name} move details:`, selectedMove.move);
        console.log(`🤖 Available moves for ${opponent.name}:`, opponentMoves);
      } else {
        console.error(`❌ Failed to select move for ${opponent.name}. Situation:`, situation);
        // Fallback: use first available move
        if (opponentMoves.length > 0 && target) {
          const fallbackMove = opponentMoves[0];
          console.log(`🔄 Using fallback move for ${opponent.name}: ${fallbackMove.name}`);
          setParticipantMoves(prev => {
            const newMap = new Map(prev);
            newMap.set(opponent.id, {
              move: fallbackMove as any,
              targetId: target.id
            });
            return newMap;
          });
        } else {
          console.error(`❌ No fallback available for ${opponent.name}. Moves: ${opponentMoves.length}, Target: ${target ? target.name : 'none'}`);
        }
      }
    });
  }, [isMultiplayer, allies, opponents, participantMoves, currentUser, vault, cpuOpponentMoves, battleState.turnOrder]);

  // Calculate turn order when all participants have selected moves (multiplayer only)
  useEffect(() => {
    if (!isMultiplayer || !allies.length || !opponents.length) return;

    // Check if all participants have selected moves
    const allParticipants = [...allies, ...opponents];
    const allHaveMoves = allParticipants.every(participant => {
      // Check local participantMoves first (for current player and CPU opponents)
      let moveData = participantMoves.get(participant.id);
      
      // If not found locally and this is a player (not CPU), check Firestore
      if (!moveData && participant.id !== currentUser?.uid && allies.some(a => a.id === participant.id)) {
        const firestoreMove = firestorePlayerMoves.get(participant.id);
        if (firestoreMove) {
          // Convert Firestore move data to local format
          // We need to find the actual Move object from available moves
          const availableMoves = moves || [];
          const actualMove = availableMoves.find(m => m.id === firestoreMove.moveId || m.name === firestoreMove.moveName);
          if (actualMove) {
            moveData = {
              move: actualMove,
              targetId: firestoreMove.targetId
            };
            // Also store it locally for consistency
            setParticipantMoves(prev => {
              const newMap = new Map(prev);
              newMap.set(participant.id, moveData!);
              return newMap;
            });
          } else {
            // If we can't find the move, create a minimal move object from Firestore data
            moveData = {
              move: { id: firestoreMove.moveId, name: firestoreMove.moveName } as Move,
              targetId: firestoreMove.targetId
            };
            setParticipantMoves(prev => {
              const newMap = new Map(prev);
              newMap.set(participant.id, moveData!);
              return newMap;
            });
          }
        }
      }
      
      const hasMove = moveData && moveData.move !== null && moveData.targetId !== null;
      if (!hasMove) {
        console.log(`⏳ Waiting for ${participant.name} (${participant.id}) to select move`);
      }
      return hasMove;
    });

    if (allHaveMoves && !battleState.turnOrder) {
      console.log('✅ All participants have selected moves. Calculating turn order...');
      // Calculate turn order
      const participants: TurnOrderParticipant[] = allParticipants.map(participant => {
        const moveData = participantMoves.get(participant.id);
        const isPlayer = participant.id === currentUser?.uid;
        const speed = getDefaultSpeed(participant.speed, participant.level, isPlayer);
        
        return {
          id: participant.id,
          name: participant.name,
          speed,
          selectedMove: moveData?.move || null,
          isPlayer
        };
      });

      const turnOrderResults = calculateTurnOrder(participants);
      
      // Log turn order to battle log
      const turnOrderLog = turnOrderResults.map((result, index) => {
        const participant = allParticipants.find(p => p.id === result.participantId);
        const moveName = result.priority > 0 
          ? `${participant?.name}'s ${participantMoves.get(result.participantId)?.move?.name} (Priority +${result.priority})`
          : result.priority < 0
          ? `${participant?.name}'s ${participantMoves.get(result.participantId)?.move?.name} (Priority ${result.priority})`
          : `${participant?.name}'s ${participantMoves.get(result.participantId)?.move?.name}`;
        return `${index + 1}. ${moveName} (Speed: ${result.speed}, Random: ${result.random}, Score: ${result.orderScore})`;
      });

      setBattleState(prev => ({
        ...prev,
        phase: 'execution', // Set phase to execution when turn order is calculated
        turnOrder: turnOrderResults.map(r => ({ participantId: r.participantId, orderScore: r.orderScore })),
        currentTurnIndex: 0,
        isPlayerTurn: false, // Disable player input during execution
        battleLog: [...prev.battleLog, '⚡ Turn Order Calculated:', ...turnOrderLog]
      }));

      // Start executing moves in turn order
      executeTurnOrderMoves(turnOrderResults, allParticipants);
    }
  }, [participantMoves, allies, opponents, isMultiplayer, currentUser, battleState.turnOrder, firestorePlayerMoves, moves]);

  // Execute moves in turn order for multiplayer battles
  const executeTurnOrderMoves = useCallback(async (
    turnOrderResults: Array<{ participantId: string; participantName: string; orderScore: number; priority: number; speed: number; random: number }>,
    allParticipants: Opponent[]
  ) => {
    if (!vault) {
      console.warn('⚠️ Cannot execute moves: vault is null');
      return;
    }
    
    console.log(`🎯 Starting turn order execution: ${turnOrderResults.length} moves to execute`);
    
    // Add round separator at the start
    setBattleState(prev => {
      const roundNumber = (prev.turnCount || 0) + 1;
      return {
        ...prev,
        phase: 'execution', // Ensure phase is set to execution
        turnCount: roundNumber,
        isPlayerTurn: false, // Disable player input during execution
        battleLog: [...prev.battleLog, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, `🔄 ROUND ${roundNumber} ─ ${allParticipants.length} participants`, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`]
      };
    });
    
    // Small delay before starting round
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Execute each move in turn order
    for (let i = 0; i < turnOrderResults.length; i++) {
      const turnResult = turnOrderResults[i];
      const participant = allParticipants.find(p => p.id === turnResult.participantId);
      const moveData = participantMoves.get(turnResult.participantId);
      
      if (!participant || !moveData || !moveData.move) {
        console.warn(`⚠️ Skipping move ${i + 1}/${turnOrderResults.length}: missing data`, { 
          participant: participant?.name, 
          hasMoveData: !!moveData,
          hasMove: !!moveData?.move 
        });
        continue;
      }
      
      console.log(`⚔️ [${i + 1}/${turnOrderResults.length}] ${participant.name} → ${moveData.move.name} on ${moveData.targetId}`);

      const isCurrentPlayer = participant.id === currentUser?.uid;
      const targetId = moveData.targetId;
      
      // Find target
      let target: Opponent | undefined;
      if (isCurrentPlayer) {
        // Player targeting an opponent
        target = opponents.find(opp => opp.id === targetId);
      } else {
        // CPU opponent - find the target
        if (targetId) {
          // Target was selected by CPU AI
          target = allies.find(ally => ally.id === targetId) || opponents.find(opp => opp.id === targetId);
        } else {
          // Fallback: target the current player
          target = allies.find(ally => ally.id === currentUser?.uid) || opponents[0];
        }
      }

      if (!target) continue;

      // Execute the move
      if (isCurrentPlayer) {
        // Player move execution in multiplayer mode
        const playerMove = moveData.move;
        const playerName = currentUser?.displayName || 'Player';
        
        // Calculate damage using proper damage calculation system
        let totalDamage = 0;
        if (playerMove.damage && playerMove.damage > 0) {
          // Use the move's actual damage property if it exists (from upgrades)
          const baseDamage = playerMove.damage;
          const playerLevel = participant.level || 1;
          
          // Use equipped artifacts from state (fetched earlier)
          const effectiveMasteryLevel = getEffectiveMasteryLevel(playerMove, equippedArtifacts);
          const damageRange = calculateDamageRange(baseDamage, playerMove.level, effectiveMasteryLevel);
          const damageResult = rollDamage(damageRange, playerLevel, playerMove.level, effectiveMasteryLevel);
          totalDamage = damageResult.damage;
          
          // Apply artifact damage multiplier for elemental moves
          if (playerMove.category === 'elemental' && equippedArtifacts) {
            const ringLevel = equippedArtifacts.elementalRing?.level || 0;
            const artifactMultiplier = getArtifactDamageMultiplier(ringLevel);
            if (artifactMultiplier > 1.0) {
              totalDamage = Math.floor(totalDamage * artifactMultiplier);
            }
          }
          
          console.log(`🎯 Player move damage calculation: ${playerMove.name}, baseDamage: ${baseDamage}, level: ${playerMove.level}, mastery: ${effectiveMasteryLevel}, finalDamage: ${totalDamage}`);
        } else {
          console.warn(`⚠️ Player move ${playerMove.name} has no damage (damage: ${playerMove.damage})`);
        }
        
        // Apply damage to target
        if (totalDamage > 0 && target) {
          // For Island Raid enemies, use vaultHealth instead of currentPP
          const targetHealth = target.vaultHealth !== undefined ? target.vaultHealth : (target.currentPP || 0);
          const targetMaxHealth = target.maxVaultHealth !== undefined ? target.maxVaultHealth : (target.maxPP || 100);
          
          const targetShieldDamage = Math.min(totalDamage, target.shieldStrength || 0);
          const remainingDamage = totalDamage - targetShieldDamage;
          const targetHealthDamage = Math.min(remainingDamage, targetHealth);
          
          // Update target stats
          const newTargetShield = Math.max(0, (target.shieldStrength || 0) - targetShieldDamage);
          const newTargetHealth = Math.max(0, targetHealth - targetHealthDamage);
          
          // Update opponents array if target is an opponent
          const targetId = target.id;
          const targetName = target.name || 'Unknown';
          if (targetId && opponents.some(opp => opp.id === targetId)) {
            const updatedOpponent = {
              ...target,
              shieldStrength: newTargetShield,
              currentPP: target.vaultHealth !== undefined ? newTargetHealth : newTargetHealth, // Keep currentPP for compatibility
              vaultHealth: target.vaultHealth !== undefined ? newTargetHealth : undefined, // Update vaultHealth if it exists
              maxVaultHealth: target.maxVaultHealth !== undefined ? targetMaxHealth : undefined
            };
            
            setOpponents(prev => {
              const updated = prev.map(opp => 
                opp.id === targetId ? updatedOpponent : opp
              );
              // Notify parent component of opponents update (for Island Raid)
              if (isMultiplayer && onOpponentsUpdate) {
                onOpponentsUpdate(updated);
              }
              return updated;
            });
            
            // Check if Ice Golem is defeated
            const isIceGolem = (targetName.toLowerCase().includes('ice golem') || 
                               targetId.toLowerCase().includes('ice-golem')) &&
                               isMultiplayer;
            
            if (isIceGolem && newTargetHealth <= 0 && onIceGolemDefeated) {
              console.log('❄️ Ice Golem defeated in multiplayer! Triggering cutscene...');
              
              // Log defeat
              setBattleState(prev => ({
                ...prev,
                battleLog: [...prev.battleLog, `💀 ${targetName} has been defeated!`],
                phase: 'defeat' // Pause battle
              }));
              
              // Trigger cutscene
              onIceGolemDefeated();
              return; // Exit early to prevent further moves
            }
          }
          
          // Log the attack using functional state update
          let logMessage = '';
          if (targetShieldDamage > 0 && targetHealthDamage > 0) {
            logMessage = `⚔️ ${playerName} attacked ${target.name} with ${playerMove.name} for ${totalDamage} damage (${targetShieldDamage} to shields, ${targetHealthDamage} to health)!`;
          } else if (targetShieldDamage > 0) {
            logMessage = `⚔️ ${playerName} attacked ${target.name} with ${playerMove.name} for ${targetShieldDamage} damage to shields!`;
          } else if (targetHealthDamage > 0) {
            logMessage = `⚔️ ${playerName} attacked ${target.name} with ${playerMove.name} for ${targetHealthDamage} damage to health!`;
          } else {
            logMessage = `⚔️ ${playerName} used ${playerMove.name} on ${target.name}!`;
          }
          
          // Update battle log immediately
          setBattleState(prev => ({
            ...prev,
            battleLog: [...prev.battleLog, logMessage]
          }));
        } else {
          // Non-damage move (heal, shield boost, etc.)
          if (target) {
            const logMessage = `⚔️ ${playerName} used ${playerMove.name} on ${target.name}!`;
            setBattleState(prev => ({
              ...prev,
              battleLog: [...prev.battleLog, logMessage]
            }));
          }
        }
      } else {
        // Execute CPU/opponent move - CPU moves have a different structure (from selectOptimalCPUMove)
        const cpuMove = moveData.move as any; // CPU moves have damageRange/baseDamage which aren't in Move interface
        const cpuOpponent = participant;
        
        console.log(`⚔️ Executing CPU move: ${cpuOpponent.name} using ${cpuMove.name}`, cpuMove);
        
        // Calculate damage - CPU moves can have damageRange or baseDamage
        let totalDamage = 0;
        if ((cpuMove as any).damageRange) {
          const { min, max } = (cpuMove as any).damageRange;
          totalDamage = Math.floor(Math.random() * (max - min + 1)) + min;
          console.log(`⚔️ ${cpuOpponent.name} damage range: ${min}-${max}, rolled: ${totalDamage}`);
        } else if ((cpuMove as any).baseDamage) {
          totalDamage = (cpuMove as any).baseDamage;
          console.log(`⚔️ ${cpuOpponent.name} base damage: ${totalDamage}`);
        } else if (cpuMove.damage) {
          // Fallback to standard Move damage property
          totalDamage = cpuMove.damage;
          console.log(`⚔️ ${cpuOpponent.name} move damage: ${totalDamage}`);
        }
        
        // Apply damage to target
        if (totalDamage > 0 && target) {
          // For Island Raid enemies, use vaultHealth instead of currentPP
          const targetHealth = target.vaultHealth !== undefined ? target.vaultHealth : (target.currentPP || 0);
          const targetMaxHealth = target.maxVaultHealth !== undefined ? target.maxVaultHealth : (target.maxPP || 100);
          
          const targetShieldDamage = Math.min(totalDamage, target.shieldStrength || 0);
          const remainingDamage = totalDamage - targetShieldDamage;
          const targetHealthDamage = Math.min(remainingDamage, targetHealth);
          
          // Update target stats
          const newTargetShield = Math.max(0, (target.shieldStrength || 0) - targetShieldDamage);
          const newTargetHealth = Math.max(0, targetHealth - targetHealthDamage);
          
          // Store target ID for use in closures
          const targetId = target.id;
          
          // Update opponents array if target is an opponent
          if (targetId && opponents.some(opp => opp.id === targetId)) {
            setOpponents(prev => {
              const updated = prev.map(opp => {
                if (opp.id === targetId) {
                  return {
                    ...opp,
                    shieldStrength: newTargetShield,
                    currentPP: opp.vaultHealth !== undefined ? newTargetHealth : newTargetHealth, // Keep currentPP for compatibility
                    vaultHealth: opp.vaultHealth !== undefined ? newTargetHealth : newTargetHealth, // Always update vaultHealth for enemies (Island Raid)
                    maxVaultHealth: opp.maxVaultHealth !== undefined ? targetMaxHealth : (opp.maxVaultHealth || targetMaxHealth) // Preserve or set maxVaultHealth
                  };
                }
                return opp;
              });
              // Notify parent component of opponents update (for Island Raid)
              if (isMultiplayer && onOpponentsUpdate) {
                onOpponentsUpdate(updated);
              }
              return updated;
            });
          }
          
          // Update allies array if target is an ally (player)
          if (targetId && allies.some(ally => ally.id === targetId)) {
            setAllies(prev => prev.map(ally => {
              if (ally.id === targetId) {
                return {
                  ...ally,
                  shieldStrength: newTargetShield,
                  maxShieldStrength: ally.maxShieldStrength || 100,
                  currentPP: ally.vaultHealth !== undefined ? newTargetHealth : newTargetHealth, // Keep currentPP for compatibility
                  vaultHealth: ally.vaultHealth !== undefined ? newTargetHealth : undefined, // Update vaultHealth if it exists
                  maxVaultHealth: ally.maxVaultHealth !== undefined ? targetMaxHealth : undefined
                };
              }
              return ally;
            }));
            
            // If targeting the player, also update vault in Firestore
            if (targetId === currentUser?.uid) {
              const newShieldStrength = Math.max(0, vault.shieldStrength - targetShieldDamage);
              const maxVaultHealth = Math.floor(vault.capacity * 0.1);
              const currentVaultHealth = vault.vaultHealth !== undefined ? vault.vaultHealth : maxVaultHealth;
              const newVaultHealth = Math.max(0, currentVaultHealth - targetHealthDamage);
              
              try {
                await updateVault({
                  shieldStrength: newShieldStrength,
                  vaultHealth: newVaultHealth
                });
                console.log(`💥 Updated player vault: Health ${currentVaultHealth} → ${newVaultHealth}, Shield ${vault.shieldStrength} → ${newShieldStrength}`);
              } catch (error) {
                console.error('Failed to update vault after CPU attack:', error);
              }
            } else {
              // For other players, update their vault in Firestore via IslandRaidBattle
              // This will be handled by the onAlliesUpdate callback if provided
              if (onAlliesUpdate) {
                const updatedAllies = allies.map(ally => {
                  if (ally.id === targetId) {
                    return {
                      ...ally,
                      shieldStrength: newTargetShield,
                      vaultHealth: ally.vaultHealth !== undefined ? newTargetHealth : undefined,
                      maxVaultHealth: ally.maxVaultHealth !== undefined ? targetMaxHealth : undefined
                    };
                  }
                  return ally;
                });
                onAlliesUpdate(updatedAllies);
              }
            }
          }
          
          // Log the attack - use functional state update to ensure it's added
          let logMessage = '';
          if (targetShieldDamage > 0 && targetHealthDamage > 0) {
            logMessage = `⚔️ ${cpuOpponent.name} attacked ${target.name} with ${cpuMove.name} for ${totalDamage} damage (${targetShieldDamage} to shields, ${targetHealthDamage} to health)!`;
          } else if (targetShieldDamage > 0) {
            logMessage = `⚔️ ${cpuOpponent.name} attacked ${target.name} with ${cpuMove.name} for ${targetShieldDamage} damage to shields!`;
          } else if (targetHealthDamage > 0) {
            logMessage = `⚔️ ${cpuOpponent.name} attacked ${target.name} with ${cpuMove.name} for ${targetHealthDamage} damage to health!`;
          } else {
            logMessage = `⚔️ ${cpuOpponent.name} used ${cpuMove.name} on ${target.name}!`;
          }
          
          console.log(`📝 Adding to battle log: ${logMessage}`);
          
          // Update battle log immediately using functional state update
          setBattleState(prev => {
            const updatedLog = [...prev.battleLog, logMessage];
            console.log(`📝 Battle log updated. New length: ${updatedLog.length}, Last entry: ${updatedLog[updatedLog.length - 1]}`);
            return {
              ...prev,
              battleLog: updatedLog
            };
          });
        } else {
          // Non-damage move (heal, shield boost, etc.)
          if (target) {
            const logMessage = `⚔️ ${cpuOpponent.name} used ${cpuMove.name} on ${target.name}!`;
            console.log(`📝 Adding to battle log: ${logMessage}`);
            setBattleState(prev => ({
              ...prev,
              battleLog: [...prev.battleLog, logMessage]
            }));
          }
        }
      }

      // Small delay between moves for visual clarity
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    // Add round end separator
    setBattleState(prev => ({
      ...prev,
      battleLog: [...prev.battleLog, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, `✓ Round ${prev.turnCount || 1} Complete`, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`]
    }));

    // Small delay before clearing for next round
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Clear participant moves and reset for next round
    setParticipantMoves(new Map());
    setBattleState(prev => ({
      ...prev,
      turnOrder: undefined,
      currentTurnIndex: undefined,
      phase: 'selection',
      isPlayerTurn: true,
      selectedMove: null,
      selectedTarget: null
      // Keep the battle log - don't reset it
    }));
  }, [vault, participantMoves, currentUser, opponents, allies, updateVault, battleState.turnCount, onIceGolemDefeated, isMultiplayer, equippedArtifacts, onOpponentsUpdate]);

  const executePlayerMove = useCallback(async () => {
    if (!battleState.selectedMove || !battleState.selectedTarget || !vault) return;

    const move = battleState.selectedMove;
    
    // In multiplayer, wait for all participants to select moves before executing
    if (isMultiplayer) {
      // Just store the move - execution will happen when turn order is calculated
      return;
    }
    
    // Start animation (single player mode)
    setBattleState(prev => ({
      ...prev,
      currentAnimation: move,
      isAnimating: true
    }));
  }, [battleState.selectedMove, battleState.selectedTarget, vault, isMultiplayer]);

  const handleAnimationComplete = async () => {
    if (!battleState.selectedMove || !battleState.selectedTarget || !vault) return;

    // Find the target opponent based on selectedTarget ID
    // For multiplayer, search in opponents array. For single player, use opponent.
    let targetOpponent: Opponent;
    if (isMultiplayer && opponents.length > 0) {
      const found = opponents.find(opp => opp.id === battleState.selectedTarget);
      if (!found) {
        console.error('Target opponent not found:', battleState.selectedTarget);
        return;
      }
      targetOpponent = found;
    } else {
      // Single player mode - check if target matches opponent
      if (opponent.id !== battleState.selectedTarget && battleState.selectedTarget !== 'self') {
        console.error('Target mismatch in single player mode');
        return;
      }
      targetOpponent = opponent;
    }

    // Apply turn effects for player (before move execution)
    const playerEffectResult = await applyTurnEffects('player', battleState.battleLog);
    if (playerEffectResult.skipTurn) {
      // Player is stunned, skip their turn
      setBattleState(prev => ({
        ...prev,
        phase: 'opponent_turn',
        battleLog: playerEffectResult.newLog,
        selectedMove: null,
        selectedTarget: null,
        currentAnimation: null,
        isAnimating: false
      }));
      // Execute opponent turn after a delay
      setTimeout(() => {
        executeOpponentTurn(playerEffectResult.newLog, targetOpponent, 1.0);
      }, 1000);
      return;
    }

    // Check if offline moves are available before executing the move
    if (onMoveConsumption) {
      try {
        // First, try to consume a move to validate availability
        const moveConsumed = await onMoveConsumption();
        if (!moveConsumed) {
          // No moves available, prevent move execution
          const newLog = [...battleState.battleLog];
          newLog.push('❌ No offline moves remaining! Purchase more moves to continue attacking.');
          setBattleState(prev => ({
            ...prev,
            battleLog: newLog,
            phase: 'selection',
            selectedMove: null,
            selectedTarget: null,
            currentAnimation: null,
            isAnimating: false
          }));
          return;
        }
      } catch (error) {
        console.error('❌ Failed to validate move availability:', error);
        return;
      }
    }

    const move = battleState.selectedMove;
    console.log('Move Execution Debug:', {
      moveName: move.name,
      moveType: move.type,
      hasShieldBoost: !!move.shieldBoost,
      shieldBoostValue: move.shieldBoost,
      moveObject: move
    });
    
    // Track move usage for manifest progress
    const originalMoveName = move.name;
    const moveName = getMoveNameSync(move.name) || move.name;
    console.log(`[BattleEngine] Tracking move usage - Original: "${originalMoveName}", Resolved: "${moveName}"`);
    
    // Track daily challenge: Use Elemental Move
    if (move.category === 'elemental' && currentUser) {
      updateChallengeProgressByType(currentUser.uid, 'use_elemental_move', 1).catch(err => 
        console.error('Error updating daily challenge progress:', err)
      );
    }
    
    // Track daily challenge: Use Manifest Ability
    // Check if move is a manifest ability by checking move category or if it matches manifest patterns
    if (currentUser && move.category === 'manifest') {
      updateChallengeProgressByType(currentUser.uid, 'use_manifest_ability', 1).catch(err => 
        console.error('Error updating daily challenge progress for manifest ability:', err)
      );
    } else if (currentUser && moveName) {
      // Also check by move name patterns (in case category isn't set)
      // This is a fallback to catch manifest moves that might not have the category set
      const manifestMovePatterns = [
        'read the room', 'emotional read', 'pattern shield', 'team read', 'environment read',
        'reality rewrite', 'narrative barrier', 'story weave', 'world rewrite',
        'illusion strike', 'mirage shield', 'visual deception', 'reality illusion',
        'flow strike', 'rhythm guard', 'team flow', 'athletic mastery',
        'harmonic blast', 'melody shield', 'chorus power', 'song of power',
        'pattern break', 'strategy matrix', 'game mastery', 'ultimate strategy',
        'precision strike', 'memory shield', 'perfect observation', 'omniscient view',
        'emotional resonance', 'empathic barrier', 'group empathy', 'universal connection',
        'tool strike', 'construct shield', 'creative mastery', 'divine creation',
        'energy feast', 'nourishing barrier', 'feast of power', 'divine nourishment'
      ];
      const moveNameLower = moveName.toLowerCase();
      const isManifestMove = manifestMovePatterns.some(pattern => moveNameLower.includes(pattern));
      if (isManifestMove) {
        updateChallengeProgressByType(currentUser.uid, 'use_manifest_ability', 1).catch(err => 
          console.error('Error updating daily challenge progress for manifest ability:', err)
        );
      }
    }
    
    if (currentUser?.uid) {
      trackMoveUsage(currentUser.uid, moveName).catch(err => {
        console.error('[BattleEngine] Error tracking move usage:', err);
      });
    } else {
      console.warn('[BattleEngine] No currentUser.uid available for tracking');
    }
    
    // Add move execution to battle log
    // Track the starting length to identify new messages later
    const startingLogLength = battleState.battleLog.length;
    const newLog = [...battleState.battleLog];
    const playerName = currentUser?.displayName || 'Player';
    
    // Helper function to check if opponent is CPU (defined at function scope)
    const checkIsCPUOpponent = (opp: Opponent) => {
      return opp.id?.startsWith('cpu-') || 
             opp.name?.toLowerCase().includes('training dummy') ||
             opp.name?.toLowerCase().includes('novice guard') ||
             opp.name?.toLowerCase().includes('elite soldier') ||
             opp.name?.toLowerCase().includes('vault keeper') ||
             opp.name?.toLowerCase().includes('master guardian') ||
             opp.name?.toLowerCase().includes('legendary protector') ||
             opp.name?.toLowerCase().includes('mindforge');
    };
    
    // Use actual user level
    const playerLevel = userLevel;
    
    // Calculate move effects using new damage range system
    let damage = 0;
    let ppStolen = 0;
    let shieldDamage = 0;
    let playerShieldBoost = 0;
    let playerHealing = 0;
    let wasAttacked = false;
    let wasPPStolen = false;
    let wasShieldAttacked = false;
    
    // Get the overridden move name for battle log messages
    const overriddenMoveName = await getMoveName(move.name);
    
    // In Mindforge mode, apply damage multipliers based on answer correctness
    let playerDamageMultiplier = 1.0;
    let opponentDamageMultiplier = 1.0;
    
    if (mindforgeMode) {
      if (!questionCorrect) {
        // Wrong answer: Player's moves are less effective (50% damage), opponent's moves are more effective (1.75x damage)
        playerDamageMultiplier = 0.5;
        opponentDamageMultiplier = 1.75;
      } else {
        // Correct answer: Player's moves work normally, opponent's moves are less effective (65% damage)
        playerDamageMultiplier = 1.0;
        opponentDamageMultiplier = 0.65;
      }
    }
    
    // Offensive moves - use damage range system
    if (move.damage) {
      // Use the move's actual damage property if it exists (from upgrades), otherwise use lookup
      let baseDamage: number;
      if (move.damage > 0) {
        // Use the upgraded damage directly (already includes boost multiplier)
        baseDamage = move.damage;
      } else {
        // Fall back to lookup for moves that haven't been upgraded yet
        const moveDamageValue = await getMoveDamage(move.name);
        // Handle both single damage values and damage ranges
        if (typeof moveDamageValue === 'object') {
          // It's a range, use the max value for damage calculation
          baseDamage = moveDamageValue.max;
        } else {
          // It's a single value
          baseDamage = moveDamageValue;
        }
      }
      
      // Get effective mastery level (includes Blaze Ring bonus)
      const effectiveMasteryLevel = getEffectiveMasteryLevel(move, equippedArtifacts);
      
      const damageRange = calculateDamageRange(baseDamage, move.level, effectiveMasteryLevel);
      const damageResult = rollDamage(damageRange, playerLevel, move.level, effectiveMasteryLevel);
      
      // Apply artifact damage multiplier for elemental moves
      let artifactMultiplier = 1.0;
      if (move.category === 'elemental' && equippedArtifacts) {
        const ringLevel = getElementalRingLevel(equippedArtifacts);
        artifactMultiplier = getArtifactDamageMultiplier(ringLevel);
        if (artifactMultiplier > 1.0) {
          newLog.push(`💍 Elemental Ring (Level ${ringLevel}) boosts ${overriddenMoveName} damage by ${Math.round((artifactMultiplier - 1) * 100)}%!`);
        }
      }
      
      // Apply Mindforge damage multiplier
      damage = Math.floor(damageResult.damage * playerDamageMultiplier * artifactMultiplier);
      
      // Log damage reduction/increase for Mindforge mode
      if (mindforgeMode && !questionCorrect) {
        const originalDamage = damageResult.damage;
        newLog.push(`❌ ${playerName} tried to use ${overriddenMoveName}, but the answer was wrong! Power reduced by ${Math.round((1 - playerDamageMultiplier) * 100)}%!`);
      }
      
      // Apply defensive move damage reduction
      let originalDamage = damage;
      let damageReductionApplied = 0;
      
      // First pass: Apply damage reduction from active defensive moves
      for (const defensiveMove of activeDefensiveMoves) {
        if (defensiveMove.damageReduction) {
          let reduction = 0;
          
          // Apply flat reduction
          if (defensiveMove.damageReduction.amount) {
            reduction += defensiveMove.damageReduction.amount;
          }
          
          // Apply percentage reduction
          if (defensiveMove.damageReduction.percentage) {
            const percentageReduction = Math.floor(damage * (defensiveMove.damageReduction.percentage / 100));
            reduction += percentageReduction;
          }
          
          damage = Math.max(0, damage - reduction);
          damageReductionApplied += reduction;
        }
      }
      
      if (damageReductionApplied > 0) {
        newLog.push(`🛡️ ${opponent.name}'s defensive move reduced incoming damage by ${damageReductionApplied}!`);
      }
      
      // Apply "reduce" status effect damage reduction
      // Check if the target (opponent) has a "reduce" status effect active
      const targetEffects = isPvP ? [] : opponentEffects; // For single-player, check opponent effects
      const reduceEffect = targetEffects.find(effect => effect.type === 'reduce');
      if (reduceEffect && reduceEffect.damageReduction) {
        const reductionPercentage = reduceEffect.damageReduction;
        const reductionAmount = Math.floor(damage * (reductionPercentage / 100));
        damage = Math.max(0, damage - reductionAmount);
        damageReductionApplied += reductionAmount;
        if (reductionAmount > 0) {
          newLog.push(`🛡️ ${opponent.name}'s Reduce effect reduced incoming damage by ${reductionAmount} (${reductionPercentage}%)!`);
        }
      }
      
      // Calculate shield damage and remaining damage after reduction
      shieldDamage = Math.min(damage, opponent.shieldStrength);
      const remainingDamage = Math.max(0, damage - opponent.shieldStrength);
      
      // Track attack flags for counter conditions (after calculating shield damage)
      wasAttacked = damage > 0;
      wasShieldAttacked = shieldDamage > 0;
      
      // Second pass: Check for counter move conditions (now that we have all attack info)
      let counterDamage = 0;
      let counterMoveName = '';
      
      for (const defensiveMove of activeDefensiveMoves) {
        if (defensiveMove.counterMove) {
          const counter = defensiveMove.counterMove;
          let shouldCounter = false;
          
          if (counter.condition === 'always' || counter.condition === 'on_attack') {
            shouldCounter = true;
          } else if (counter.condition === 'if_attacked' && wasAttacked) {
            shouldCounter = true;
          } else if (counter.condition === 'if_pp_stolen' && wasPPStolen) {
            shouldCounter = true;
          } else if (counter.condition === 'if_shield_attacked' && wasShieldAttacked) {
            shouldCounter = true;
          } else if (counter.condition === 'on_critical' && damageResult.isMaxDamage) {
            shouldCounter = true;
          } else if (counter.condition === 'on_shield_break' && targetOpponent.shieldStrength <= damage) {
            shouldCounter = true;
          } else if (counter.condition === 'on_low_health') {
            const healthPercentage = (targetOpponent.currentPP / targetOpponent.maxPP) * 100;
            const threshold = counter.threshold || 50;
            if (healthPercentage <= threshold) {
              shouldCounter = true;
            }
          } else if (counter.condition === 'if_rival' && counter.rivalName) {
            // Check if the player (attacker) is the specified rival
            const playerDisplayName = currentUser?.displayName || '';
            const playerEmail = currentUser?.email || '';
            const playerUid = currentUser?.uid || '';
            const rivalNameLower = counter.rivalName.toLowerCase();
            
            // Check if player name/email/uid matches the rival name
            let isRival = false;
            if (playerDisplayName.toLowerCase().includes(rivalNameLower) || 
                playerEmail.toLowerCase().includes(rivalNameLower)) {
              isRival = true;
            }
            
            // Also check if opponent has a rival set and player matches it (for PvP battles)
            if (!isRival && !isPvP && opponent.id && opponent.id.startsWith('cpu-') === false) {
              // For non-CPU opponents, check their rival data
              try {
                const opponentRef = doc(db, 'students', opponent.id);
                const opponentDoc = await getDoc(opponentRef);
                if (opponentDoc.exists()) {
                  const opponentData = opponentDoc.data();
                  const opponentRival = opponentData.rival;
                  if (opponentRival) {
                    if (opponentRival.id === playerUid ||
                        (opponentRival.name && (
                          playerDisplayName.toLowerCase().includes(opponentRival.name.toLowerCase()) || 
                          playerEmail.toLowerCase().includes(opponentRival.name.toLowerCase())
                        ))) {
                      isRival = true;
                    }
                  }
                }
              } catch (error) {
                console.error('Error checking opponent rival status:', error);
              }
            }
            
            if (isRival) {
              shouldCounter = true;
            }
          }
          
          if (shouldCounter) {
            // Calculate counter damage
            if (counter.damageRange) {
              counterDamage = Math.floor(Math.random() * (counter.damageRange.max - counter.damageRange.min + 1)) + counter.damageRange.min;
            } else if (counter.damage) {
              counterDamage = counter.damage;
            }
            counterMoveName = defensiveMove.moveName;
            break; // Only use the first matching counter
          }
        }
      }
      
      if (counterDamage > 0 && counterMoveName) {
        newLog.push(`⚔️ ${opponent.name} countered with ${counterMoveName} for ${counterDamage} damage!`);
        // Apply counter damage to player
        const counterShieldDamage = Math.min(counterDamage, vault.shieldStrength);
        const counterRemainingDamage = Math.max(0, counterDamage - vault.shieldStrength);
        
        if (counterRemainingDamage > 0) {
          // Max vault health is always 10% of vault capacity
          const maxVaultHealth = Math.floor(vault.capacity * 0.1);
          const currentVaultHealth = vault.vaultHealth !== undefined ? vault.vaultHealth : maxVaultHealth;
          const counterVaultDamage = Math.min(counterRemainingDamage, currentVaultHealth);
          
          // Update vault with counter damage
          try {
            await updateVault({
              shieldStrength: Math.max(0, vault.shieldStrength - counterShieldDamage),
              vaultHealth: Math.max(0, currentVaultHealth - counterVaultDamage)
            });
          } catch (error) {
            console.error('Failed to apply counter damage:', error);
          }
        } else {
          // Only shield damage
          try {
            await updateVault({
              shieldStrength: Math.max(0, vault.shieldStrength - counterShieldDamage)
            });
          } catch (error) {
            console.error('Failed to apply counter shield damage:', error);
          }
        }
      }
      
      // Log attack with damage breakdown and range info
      const rangeInfo = damageResult.isMaxDamage ? ' (MAX DAMAGE!)' : '';
      // Check if this is a CPU opponent (they use currentPP as health)
      const isCPUOpponentForLabel = checkIsCPUOpponent(targetOpponent);
      const healthLabel = isCPUOpponentForLabel ? 'health' : 'vault health';
      if (shieldDamage > 0 && remainingDamage > 0) {
        newLog.push(`⚔️ ${playerName} attacked ${targetOpponent.name} with ${overriddenMoveName} for ${damage} damage (${shieldDamage} to shields, ${remainingDamage} to ${healthLabel})${rangeInfo}!`);
      } else if (shieldDamage > 0) {
        newLog.push(`⚔️ ${playerName} attacked ${targetOpponent.name} with ${overriddenMoveName} for ${shieldDamage} damage to shields${rangeInfo}!`);
      } else if (remainingDamage > 0) {
        newLog.push(`⚔️ ${playerName} attacked ${targetOpponent.name} with ${overriddenMoveName} for ${remainingDamage} damage to ${healthLabel}${rangeInfo}!`);
      } else {
        newLog.push(`⚔️ ${playerName} used ${overriddenMoveName} on ${targetOpponent.name}${rangeInfo}!`);
      }
      
      console.log('Damage Roll Debug:', {
        moveName: move.name,
        baseDamage,
        damageRange,
        damageResult,
        playerLevel,
        moveLevel: move.level,
        masteryLevel: move.masteryLevel
      });
    }
    
    if (move.ppSteal) {
      // PP steal also uses damage range system
      const moveDamageValue = await getMoveDamage(move.name);
      // Handle both single damage values and damage ranges
      let baseDamage: number;
      if (typeof moveDamageValue === 'object') {
        // It's a range, use the max value for damage calculation
        baseDamage = moveDamageValue.max;
      } else {
        // It's a single value
        baseDamage = moveDamageValue;
      }
      
      const damageRange = calculateDamageRange(baseDamage, move.level, move.masteryLevel);
      const damageResult = rollDamage(damageRange, playerLevel, move.level, move.masteryLevel);
      
      // PP steal is a portion of total damage, apply Mindforge multiplier
      ppStolen = Math.floor(damageResult.damage * 0.6 * playerDamageMultiplier); // 60% of damage becomes PP steal
      
      // Track PP stolen flag for counter conditions
      wasPPStolen = ppStolen > 0;
      
      // Log PP steal reduction for Mindforge mode
      if (mindforgeMode && !questionCorrect) {
        const originalSteal = Math.floor(damageResult.damage * 0.6);
        newLog.push(`💔 PP steal reduced due to wrong answer: ${originalSteal} → ${ppStolen}`);
      }
      const rangeInfo = damageResult.isMaxDamage ? ' (MAX STEAL!)' : '';
      newLog.push(`💰 ${playerName} stole ${ppStolen} PP from ${targetOpponent.name}${rangeInfo}!`);
    }
    
    // Defensive moves (shield boost) - use shield boost range system
    if (move.shieldBoost) {
      const shieldRange = calculateShieldBoostRange(move.shieldBoost, move.level, move.masteryLevel);
      const shieldResult = rollShieldBoost(shieldRange, playerLevel, move.level, move.masteryLevel);
      
      playerShieldBoost = shieldResult.damage; // Using damage field for shield boost amount
      const rangeInfo = shieldResult.isMaxDamage ? ' (MAX BOOST!)' : '';
      newLog.push(`🛡️ ${playerName} used ${overriddenMoveName} to boost shields by ${playerShieldBoost}${rangeInfo}!`);
      
      console.log('Shield Boost Debug:', {
        moveName: move.name,
        baseShieldBoost: move.shieldBoost,
        shieldRange,
        shieldResult,
        playerLevel,
        moveLevel: move.level,
        masteryLevel: move.masteryLevel,
        currentShield: vault.shieldStrength
      });
    }
    
    // Support moves (healing) - use healing range system
    if (move.healing) {
      const healingRange = calculateHealingRange(move.healing, move.level, move.masteryLevel);
      const healingResult = rollHealing(healingRange, playerLevel, move.level, move.masteryLevel);
      
      playerHealing = healingResult.damage; // Using damage field for healing amount
      const rangeInfo = healingResult.isMaxDamage ? ' (MAX HEAL!)' : '';
      newLog.push(`💚 ${playerName} used ${overriddenMoveName} to heal for ${playerHealing} PP${rangeInfo}!`);
    }
    
    // Apply status effects from move (check move overrides for statusEffect/statusEffects)
    const { getMoveStatusEffectSync } = await import('../utils/moveOverrides');
    const moveStatusEffect = getMoveStatusEffectSync(moveName);
    
    // Support both single effect (legacy) and multiple effects (new)
    const effectsToApply = moveStatusEffect?.statusEffects || (moveStatusEffect?.statusEffect && moveStatusEffect.statusEffect.type !== 'none' ? [moveStatusEffect.statusEffect] : []);
    
    // Apply all effects
    for (const statusEffect of effectsToApply) {
      if (statusEffect && statusEffect.type !== 'none') {
        const effect: ActiveEffect = {
          type: statusEffect.type,
          duration: statusEffect.duration || 1,
          damagePerTurn: statusEffect.damagePerTurn || statusEffect.intensity,
          ppLossPerTurn: statusEffect.ppLossPerTurn || statusEffect.intensity,
          ppStealPerTurn: statusEffect.ppStealPerTurn || statusEffect.intensity,
          healPerTurn: statusEffect.healPerTurn,
          chance: statusEffect.chance || statusEffect.intensity,
          intensity: statusEffect.intensity,
          damageReduction: statusEffect.damageReduction // For reduce effect
        };
        const successChance = statusEffect.successChance !== undefined ? statusEffect.successChance : 100;
        const applied = addStatusEffect('opponent', effect, successChance);
        if (applied) {
          if (effect.type === 'cleanse') {
            newLog.push(`✨ ${targetOpponent.name} has been cleansed! All negative effects removed!`);
          } else {
            newLog.push(`✨ ${targetOpponent.name} is now affected by ${effect.type}!`);
          }
        } else {
          newLog.push(`❌ ${targetOpponent.name} resisted the ${effect.type} effect!`);
        }
      }
    }
    
    // Skip legacy debuffType for "Read the Room" and "Emotional Read" - they should never have effects
    // Also skip non-status-effect debuffTypes like 'accuracy', 'dodge', etc.
    if (effectsToApply.length === 0 && move.debuffType && move.duration && moveName !== 'Read the Room' && moveName !== 'Emotional Read') {
      // Only apply legacy debuffType if it's an actual status effect type
      // Skip debuffTypes that are stat modifiers (accuracy, dodge, etc.)
      const statusEffectDebuffTypes: Array<'burn' | 'stun' | 'bleed' | 'poison' | 'confuse' | 'drain'> = ['burn', 'stun', 'bleed', 'poison', 'confuse', 'drain'];
      if (statusEffectDebuffTypes.includes(move.debuffType as any)) {
        // Map debuffType to status effect type (legacy support)
        const effectTypeMap: Record<string, 'burn' | 'stun' | 'bleed' | 'poison' | 'confuse' | 'drain'> = {
          'burn': 'burn',
          'stun': 'stun',
          'bleed': 'bleed',
          'poison': 'poison',
          'confuse': 'confuse',
          'confusion': 'confuse', // Handle 'confusion' as alias for 'confuse'
          'drain': 'drain'
        };
        const effectType = effectTypeMap[move.debuffType] || 'burn';
        const effect: ActiveEffect = {
          type: effectType,
          duration: move.duration,
          intensity: move.debuffStrength || 5,
          damagePerTurn: move.debuffStrength || 5
        };
        addStatusEffect('opponent', effect);
        newLog.push(`✨ ${targetOpponent.name} is now affected by ${effectType}!`);
      }
      // If debuffType is 'accuracy', 'dodge', etc., these are stat modifiers, not status effects
      // They should be handled separately and not converted to status effects
    }
    
    // Update target opponent stats IMMEDIATELY for real-time display
    const newTargetOpponent = { ...targetOpponent };
    newTargetOpponent.shieldStrength = Math.max(0, targetOpponent.shieldStrength - shieldDamage);
    
    // Check if this is a CPU opponent (they use currentPP as health)
    const isCPUOpponent = checkIsCPUOpponent(targetOpponent);
    
    if (isCPUOpponent) {
      // For CPU opponents, currentPP is their health
      const healthDamage = Math.max(0, (damage - shieldDamage) + ppStolen);
      newTargetOpponent.currentPP = Math.max(0, targetOpponent.currentPP - healthDamage);
    } else {
      // For PvP opponents, damage vault health, not PP
      // Max vault health is always 10% of maxPP (vault capacity)
      const maxVaultHealth = Math.floor((targetOpponent.maxPP || 1000) * 0.1);
      const currentVaultHealth = targetOpponent.vaultHealth !== undefined ? targetOpponent.vaultHealth : maxVaultHealth;
      const healthDamage = Math.max(0, (damage - shieldDamage) + ppStolen);
      const newVaultHealth = Math.max(0, currentVaultHealth - healthDamage);
      newTargetOpponent.vaultHealth = newVaultHealth;
      newTargetOpponent.maxVaultHealth = maxVaultHealth; // Always 10% of maxPP
      // Set cooldown if vault health reaches 0
      if (newVaultHealth === 0 && currentVaultHealth > 0) {
        // Note: We'll need to update this in Firestore separately
      }
    }
    
    // Update opponent state based on mode
    if (isMultiplayer) {
      // Update the target opponent in the opponents array
      setOpponents(prev => prev.map(opp => 
        opp.id === targetOpponent.id ? newTargetOpponent : opp
      ));
      // Also update callbacks if provided
      if (onOpponentsUpdate) {
        const updatedOpponents = opponents.map(opp => 
          opp.id === targetOpponent.id ? newTargetOpponent : opp
        );
        onOpponentsUpdate(updatedOpponents);
      }
    } else {
      // Single player mode - update single opponent
      setOpponent(newTargetOpponent);
    }
    
    // Check if Terra reaches 50% health and trigger awakened state
    if (onTerraAwakened && !isTerraAwakened && !terraAwakenedTriggeredRef.current && targetOpponent.name?.toLowerCase().includes('terra')) {
      const healthPercentage = (newTargetOpponent.currentPP / newTargetOpponent.maxPP) * 100;
      if (healthPercentage <= 50) {
        terraAwakenedTriggeredRef.current = true;
        onTerraAwakened();
      }
    }
    
    // In Mindforge mode, notify parent component of opponent update
    if (mindforgeMode && onOpponentUpdate) {
      onOpponentUpdate(newTargetOpponent);
    }
    
    // Update opponent's vault and student documents in Firestore immediately
    if (isPvP && targetOpponent.id) {
      try {
        const opponentVaultRef = doc(db, 'vaults', targetOpponent.id);
        const opponentVaultDoc = await getDoc(opponentVaultRef);
        
        if (opponentVaultDoc.exists()) {
          const vaultData = opponentVaultDoc.data();
          // Max vault health is always 10% of maxPP (vault capacity)
          const maxVaultHealth = Math.floor((targetOpponent.maxPP || 1000) * 0.1);
          const currentVaultHealth = targetOpponent.vaultHealth !== undefined ? targetOpponent.vaultHealth : (vaultData.vaultHealth || maxVaultHealth);
          const healthDamage = Math.max(0, (damage - shieldDamage) + ppStolen);
          const newVaultHealth = Math.max(0, currentVaultHealth - healthDamage);
          
          const updateData: any = {
            shieldStrength: newTargetOpponent.shieldStrength,
            vaultHealth: newVaultHealth
          };
          
          // Set cooldown if vault health reaches 0
          if (newVaultHealth === 0 && currentVaultHealth > 0) {
            updateData.vaultHealthCooldown = new Date();
          }
          
          await updateDoc(opponentVaultRef, updateData);
          
          console.log('✅ Opponent vault health and shields updated in Firestore:', {
          opponentId: targetOpponent.id,
            newVaultHealth: newVaultHealth,
          newShield: newTargetOpponent.shieldStrength
        });
        }
      } catch (error) {
        console.error('❌ Error updating opponent vault health in Firestore:', error);
      }
    }
    
    // Update player vault
    const newVault = { ...vault };
    const vaultCapacity = vault.capacity || 1000;
    // Don't add PP immediately - accumulate it for end of battle
    if (ppStolen > 0) {
      // Accumulate PP stolen instead of adding immediately
      setBattleState(prev => ({
        ...prev,
        accumulatedPPStolen: prev.accumulatedPPStolen + ppStolen
      }));
      // Still show the message but don't add PP yet
      newLog.push(`💰 ${playerName} stole ${ppStolen} PP from ${targetOpponent.name}!`);
    }
    if (playerShieldBoost > 0) {
      const oldShield = vault.shieldStrength;
      newVault.shieldStrength = Math.min(vault.maxShieldStrength, vault.shieldStrength + playerShieldBoost);
      console.log('Shield Boost Applied:', {
        oldShield,
        boostAmount: playerShieldBoost,
        newShield: newVault.shieldStrength,
        maxShield: vault.maxShieldStrength
      });
    }
    if (playerHealing > 0) {
      newVault.currentPP = Math.min(vaultCapacity, vault.currentPP + playerHealing);
    }
    
    // Execute the actual vault siege attack in the database
    if (onExecuteVaultSiegeAttack && targetOpponent && move) {
      try {
        console.log('🔥 Executing actual vault siege attack in database...');
        const attackResult = await onExecuteVaultSiegeAttack(move.id, targetOpponent.id);
        console.log('🔥 Vault siege attack result:', attackResult);
        
        if (attackResult?.success) {
          console.log('✅ Database vault siege attack successful');
          // The database has been updated, so we can trust the local state
        } else {
          console.error('❌ Database vault siege attack failed:', attackResult?.message);
          // If database attack failed, we should revert local changes
          return;
        }
      } catch (error) {
        console.error('❌ Error executing vault siege attack:', error);
        return;
      }
    } else {
      // Fallback: Update vault in context (for non-offline battles)
      try {
        await updateVault({
          currentPP: newVault.currentPP,
          shieldStrength: newVault.shieldStrength
        });
        console.log('✅ Vault updated successfully after player move');
      } catch (error) {
        console.error('❌ Failed to update vault after player move:', error);
      }
    }
    
    // Check for victory (health depleted)
    const opponentHealthDepleted = checkIsCPUOpponent(targetOpponent) 
      ? newTargetOpponent.currentPP <= 0 
      : (newTargetOpponent.vaultHealth !== undefined ? newTargetOpponent.vaultHealth <= 0 : false);
    
    if (opponentHealthDepleted) {
      newLog.push(`💀 ${targetOpponent.name} has been defeated!`);
      
      // Check if this is an Ice Golem being defeated in multiplayer mode
      const isIceGolem = (targetOpponent.name?.toLowerCase().includes('ice golem') || 
                         targetOpponent.id?.toLowerCase().includes('ice-golem')) &&
                         isMultiplayer;
      
      if (isIceGolem && onIceGolemDefeated) {
        // Trigger cutscene instead of normal victory
        console.log('❄️ Ice Golem defeated! Triggering cutscene...');
        setBattleState(prev => ({
          ...prev,
          phase: 'defeat', // Set to defeat to pause battle
          battleLog: newLog,
          isPlayerTurn: false,
          currentAnimation: null,
          isAnimating: false
        }));
        
        // Update opponent state
        if (isMultiplayer) {
          setOpponents(prev => prev.map(opp => 
            opp.id === targetOpponent.id ? newTargetOpponent : opp
          ));
        }
        
        // Trigger cutscene callback
        onIceGolemDefeated();
        return;
      }
      
      // Calculate final PP reward based on defeated opponent's remaining PP
      const defeatedOpponentPP = checkIsCPUOpponent(targetOpponent) 
        ? Math.max(0, newTargetOpponent.currentPP) // For CPU, use currentPP (health)
        : (newTargetOpponent.vaultHealth !== undefined ? Math.max(0, newTargetOpponent.vaultHealth) : 0); // For PvP, use vaultHealth
      
      // Get accumulated PP stolen during battle
      const totalPPReward = battleState.accumulatedPPStolen + defeatedOpponentPP;
      
      if (totalPPReward > 0) {
        // Add accumulated PP + defeated opponent's remaining PP
        const vaultCapacity = vault.capacity || 1000;
        const newPP = Math.min(vaultCapacity, vault.currentPP + totalPPReward);
        
        try {
          await updateVault({
            currentPP: newPP
          });
          newLog.push(`💰 You gained ${totalPPReward} PP from the battle! (${battleState.accumulatedPPStolen} stolen + ${defeatedOpponentPP} from defeated opponent)`);
          
          // Track daily challenge: Earn PP
          if (currentUser) {
            updateChallengeProgressByType(currentUser.uid, 'earn_pp', totalPPReward).catch(err => 
              console.error('Error updating daily challenge progress:', err)
            );
          }
        } catch (error) {
          console.error('❌ Failed to add PP reward:', error);
        }
      }
      
      // Track daily challenge: Defeat Enemies
      if (currentUser) {
        updateChallengeProgressByType(currentUser.uid, 'defeat_enemies', 1).catch(err => 
          console.error('Error updating daily challenge progress:', err)
        );
      }
      
      // Track daily challenge: Win Battle
      if (currentUser) {
        updateChallengeProgressByType(currentUser.uid, 'win_battle', 1).catch(err => 
          console.error('Error updating daily challenge progress:', err)
        );
      }
      
      if (isPvP) {
        newLog.push(`💸 ${targetOpponent.name}'s vault health has been depleted!`);
        newLog.push(`🏆 Victory! You won the PvP battle!`);
      } else {
        newLog.push(`🎉 Victory! You have successfully defeated ${targetOpponent.name}!`);
      }
      setBattleState(prev => ({
        ...prev,
        phase: 'victory',
        battleLog: newLog,
        isPlayerTurn: false,
        currentAnimation: null,
        isAnimating: false
      }));
      
      // Update opponent state based on mode
      if (isMultiplayer) {
        setOpponents(prev => prev.map(opp => 
          opp.id === targetOpponent.id ? newTargetOpponent : opp
        ));
      } else {
        setOpponent(newTargetOpponent);
      }
      
      // In Mindforge mode, notify parent of opponent update
      if (mindforgeMode && onOpponentUpdate) {
        onOpponentUpdate(newTargetOpponent);
      }
      
      // For PvP, pass winner/loser IDs
      if (isPvP && currentUser) {
        onBattleEnd('victory', currentUser.uid, targetOpponent.id);
      } else {
        onBattleEnd('victory');
      }
      return;
    }
    
    // Update battle state - keep animation state so BattleAnimations can play
    // The animation will be cleared when handleAnimationComplete is called by BattleAnimations
    setBattleState(prev => ({
      ...prev,
      phase: mindforgeMode ? 'execution' : 'opponent_turn', // Keep in execution phase for Mindforge so animation plays
      battleLog: newLog,
      isPlayerTurn: mindforgeMode ? true : false,
      selectedMove: null, // Clear selected move but keep animation
      selectedTarget: null, // Clear selected target but keep animation
      // Keep currentAnimation and isAnimating so BattleAnimations component can display
    }));
    
    // In Mindforge mode, execute opponent turn after animation completes
    if (mindforgeMode) {
      // Clear animation state now that animation is complete
      setBattleState(prev => ({
        ...prev,
        currentAnimation: null,
        isAnimating: false,
        phase: 'selection'
      }));
      
      // Decrement remaining turns for active defensive moves and remove expired ones (after player's turn)
      setActiveDefensiveMoves(prev => {
        return prev.map(move => ({
          ...move,
          remainingTurns: move.remainingTurns - 1
        })).filter(move => move.remainingTurns > 0);
      });
      
      // Execute opponent turn after a short delay to show damage
      setTimeout(() => {
        executeOpponentTurn(newLog, newTargetOpponent, opponentDamageMultiplier);
      }, 500);
      
      // Exit early - opponent turn will handle the rest
      return;
    }
    
    // For PvP battles, store the move in Firestore and wait for opponent
    // For CPU battles, execute opponent turn automatically
    if (isPvP && battleRoom && currentUser) {
      // Store player move in Firestore
      try {
        // Store all new log messages from this turn (not just the last one)
        // Get only the messages that were added during this move execution
        const newLogMessages = newLog.slice(startingLogLength);
        
        const moveData = {
          userId: currentUser.uid,
          moveId: move.id,
          moveName: move.name,
          damage: damage - shieldDamage, // Actual PP damage (after shield absorption)
          shieldDamage: shieldDamage,
          ppStolen: ppStolen,
          playerShieldBoost: playerShieldBoost,
          playerHealing: playerHealing,
          targetId: targetOpponent.id,
          turnNumber: battleState.turnCount,
          timestamp: serverTimestamp(),
          battleLog: newLogMessages, // Store ALL new log messages from this move
          opponentStats: {
            shieldStrength: newTargetOpponent.shieldStrength,
            currentPP: newTargetOpponent.currentPP
          },
          playerStats: {
            shieldStrength: newVault.shieldStrength,
            currentPP: newVault.currentPP
          },
          processedBy: []
        };

        await addDoc(collection(db, 'battleRooms', battleRoom.id, 'moves'), moveData);
        console.log('PvP: Player move stored in Firestore with log messages:', newLogMessages);
        
        // PvP: Wait for opponent's move
        // Don't add "Waiting" message here - it will be added when opponent's move is received
        // This ensures both players see the same sequence of messages
        setBattleState(prev => ({
          ...prev,
          battleLog: newLog,
          phase: 'opponent_turn',
          isPlayerTurn: false
        }));
      } catch (error) {
        console.error('Error storing player move:', error);
      }
    } else {
      // Decrement remaining turns for active defensive moves and remove expired ones (after player's turn)
      setActiveDefensiveMoves(prev => {
        return prev.map(move => ({
          ...move,
          remainingTurns: move.remainingTurns - 1
        })).filter(move => move.remainingTurns > 0);
      });
      
      // CPU: Start opponent turn after a delay (non-Mindforge mode uses default multiplier of 1.0)
      setTimeout(() => {
        executeOpponentTurn(newLog, newTargetOpponent, 1.0);
      }, 2000);
    }
  };

  const executeOpponentTurn = async (currentLog: string[], currentOpponent: any, damageMultiplier: number = 1.0) => {
    if (!vault) {
      console.error('❌ Cannot execute opponent turn - vault is null');
      return;
    }
    
    console.log('🔍 Starting opponent turn with vault state:', {
      shieldStrength: vault.shieldStrength,
      vaultHealth: vault.vaultHealth,
      overshield: vault.overshield
    });
    
    // Apply turn effects for opponent (before move execution)
    const opponentEffectResult = await applyTurnEffects('opponent', currentLog);
    const newLog = [...opponentEffectResult.newLog];
    
    // Check if opponent is stunned
    const isStunned = opponentEffects.some(e => e.type === 'stun' && e.duration > 0);
    if (isStunned) {
      newLog.push(`⚡ ${opponent.name} is stunned and cannot act!`);
      // Update battle state to player's turn
      setBattleState(prev => ({
        ...prev,
        phase: 'selection',
        battleLog: newLog,
        isPlayerTurn: true,
        turnCount: prev.turnCount + 1
      }));
      return;
    }
    // Opponent AI - different moves for different opponents
    let opponentMoves;
    
    // Try to load moves from Firestore first
    if (cpuOpponentMoves && Array.isArray(cpuOpponentMoves)) {
      const opponentId = opponent.id || opponent.name?.toLowerCase().replace(/\s+/g, '-');
      const opponentData = cpuOpponentMoves.find((opp: any) => 
        opp.id === opponentId || 
        opp.name?.toLowerCase() === opponent.name?.toLowerCase() ||
        (opp.name?.toLowerCase().includes('master guardian') && (opponent.name?.toLowerCase().includes('flame keeper') || opponent.name?.toLowerCase().includes('flame thrower'))) ||
        ((opp.name?.toLowerCase().includes('flame keeper') || opp.name?.toLowerCase().includes('flame thrower')) && opponent.name?.toLowerCase().includes('master guardian'))
      );
      
      if (opponentData && opponentData.moves && opponentData.moves.length > 0) {
        opponentMoves = opponentData.moves.map((move: any) => ({
          name: move.name,
          baseDamage: move.baseDamage || (move.damageRange ? Math.floor((move.damageRange.min + move.damageRange.max) / 2) : 0),
          level: 1,
          masteryLevel: 1,
          type: move.type || 'attack',
          damageRange: move.damageRange,
          healingRange: move.healingRange,
          damageReduction: move.damageReduction,
          counterMove: move.counterMove,
          duration: move.duration
        }));
      }
    }
    
    // Fallback to hardcoded moves if Firestore data not available
    if (!opponentMoves || opponentMoves.length === 0) {
    if (opponent.id === 'hela') {
      // Hela's ice-based moves
      opponentMoves = [
        { name: 'Ice Shard', baseDamage: 7, level: 1, masteryLevel: 1, type: 'attack' },
        { name: 'Ice Wall', baseDamage: 0, level: 1, masteryLevel: 1, type: 'defense' }
      ];
      } else if (opponent.name?.toLowerCase().includes('ice golem') || opponent.id?.toLowerCase().includes('ice-golem')) {
        // Ice Golem's moves
        opponentMoves = [
          { name: 'Ice Shard', damageRange: { min: 20, max: 50 }, level: 1, masteryLevel: 1, type: 'attack' },
          { name: 'Ice Punch', damageRange: { min: 25, max: 40 }, level: 1, masteryLevel: 1, type: 'attack' }
        ];
      } else if (opponent.name?.toLowerCase().includes('flame keeper') || opponent.name?.toLowerCase().includes('flame thrower') || opponent.name?.toLowerCase().includes('master guardian')) {
        // Flame Keeper's fire-based moves
        opponentMoves = [
          { name: 'Flameburst', baseDamage: 32, level: 1, masteryLevel: 1, type: 'attack', damageRange: { min: 28, max: 36 } },
          { name: 'Inferno Breaker', baseDamage: 52, level: 1, masteryLevel: 1, type: 'attack', damageRange: { min: 45, max: 60 } },
          { name: 'Phoenix Regeneration', baseDamage: 0, level: 1, masteryLevel: 1, type: 'heal', healingRange: { min: 30, max: 45 } }
      ];
    } else {
      // Default training dummy moves
      opponentMoves = [
        { name: 'Vault Breach', baseDamage: 8, level: 1, masteryLevel: 1 },
        { name: 'PP Drain', baseDamage: 6, level: 1, masteryLevel: 1 },
        { name: 'Shield Bash', baseDamage: 7, level: 1, masteryLevel: 1 },
        { name: 'Energy Strike', baseDamage: 9, level: 1, masteryLevel: 1 }
      ];
      }
    }
    
    const opponentMove = opponentMoves[Math.floor(Math.random() * opponentMoves.length)];
    
    // Activate defensive move if opponent uses one
    if (opponentMove.type === 'defense' && (opponentMove.damageReduction || opponentMove.counterMove)) {
      const defensiveMoveData = {
        moveName: opponentMove.name,
        damageReduction: opponentMove.damageReduction,
        counterMove: opponentMove.counterMove,
        remainingTurns: opponentMove.duration || 1
      };
      setActiveDefensiveMoves(prev => [...prev, defensiveMoveData]);
      newLog.push(`🛡️ ${opponent.name} activated ${opponentMove.name}!`);
      if (opponentMove.duration && opponentMove.duration > 1) {
        newLog.push(`   Effect lasts for ${opponentMove.duration} turn${opponentMove.duration !== 1 ? 's' : ''}.`);
      }
    }
    
    // Calculate opponent move effects using damage range system
    let damageRange;
    let damageResult;
    let totalDamage = 0;
    let healingAmount = 0;
    
    // Special handling for Master Guardian moves with custom damage ranges
    if (opponentMove.damageRange) {
      // Use custom damage range for Master Guardian moves
      const { min, max } = opponentMove.damageRange;
      totalDamage = Math.floor(Math.random() * (max - min + 1)) + min;
    } else {
      // Use standard damage calculation for other moves
      damageRange = calculateDamageRange(opponentMove.baseDamage, opponentMove.level, opponentMove.masteryLevel);
      damageResult = rollDamage(damageRange, opponent.level, opponentMove.level, opponentMove.masteryLevel);
      totalDamage = damageResult.damage;
    }
    
    // Handle healing moves (Phoenix Regeneration)
    if (opponentMove.type === 'heal' && opponentMove.healingRange) {
      const { min, max } = opponentMove.healingRange;
      healingAmount = Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    let shieldDamage = 0;
    let ppStolen = 0;
    let opponentShieldRestore = 0;
    let opponentHealing = 0;
    let overshieldAbsorbed = false;
    
    // Special handling for Hela's Ice Wall move
    if (opponent.id === 'hela' && opponentMove.name === 'Ice Wall') {
      // Ice Wall restores 5-10 shields for Hela
      const shieldRange = { min: 5, max: 10 };
      opponentShieldRestore = Math.floor(Math.random() * (shieldRange.max - shieldRange.min + 1)) + shieldRange.min;
      newLog.push(`🧊 ${opponent.name} used ${opponentMove.name} and restored ${opponentShieldRestore} shields!`);
    } else if (opponentMove.type === 'heal' && healingAmount > 0) {
      // Phoenix Regeneration - heal the opponent
      opponentHealing = healingAmount;
      const maxHealth = opponent.maxPP || opponent.currentPP;
      const newHealth = Math.min(maxHealth, opponent.currentPP + opponentHealing);
      opponentHealing = newHealth - opponent.currentPP; // Actual healing applied (capped at max)
      newLog.push(`🔥 ${opponent.name} used ${opponentMove.name} and restored ${opponentHealing} health!`);
    }
    
    // Apply status effects from CPU move (support both single and multiple effects)
    const cpuEffectsToApply = opponentMove.statusEffects || (opponentMove.statusEffect && opponentMove.statusEffect.type !== 'none' ? [opponentMove.statusEffect] : []);
    
    for (const statusEffect of cpuEffectsToApply) {
      if (statusEffect && statusEffect.type !== 'none') {
        const effect: ActiveEffect = {
          type: statusEffect.type,
          duration: statusEffect.duration || 1,
          damagePerTurn: statusEffect.damagePerTurn || statusEffect.intensity,
          ppLossPerTurn: statusEffect.ppLossPerTurn || statusEffect.intensity,
          ppStealPerTurn: statusEffect.ppStealPerTurn || statusEffect.intensity,
          healPerTurn: statusEffect.healPerTurn,
          chance: statusEffect.chance || statusEffect.intensity,
          intensity: statusEffect.intensity,
          damageReduction: statusEffect.damageReduction // For reduce effect
        };
        const successChance = statusEffect.successChance !== undefined ? statusEffect.successChance : 100;
        const applied = addStatusEffect('player', effect, successChance);
        if (applied) {
          if (effect.type === 'cleanse') {
            newLog.push(`✨ ${currentUser?.displayName || 'Player'} has been cleansed! All negative effects removed!`);
          } else {
            newLog.push(`✨ ${currentUser?.displayName || 'Player'} is now affected by ${effect.type}!`);
          }
        } else {
          newLog.push(`❌ ${currentUser?.displayName || 'Player'} resisted the ${effect.type} effect!`);
        }
      }
    }
    
    if (totalDamage > 0) {
      // Apply "reduce" status effect damage reduction
      // Check if the player has a "reduce" status effect active
      const reduceEffect = playerEffects.find(effect => effect.type === 'reduce');
      if (reduceEffect && reduceEffect.damageReduction) {
        const reductionPercentage = reduceEffect.damageReduction;
        const reductionAmount = Math.floor(totalDamage * (reductionPercentage / 100));
        totalDamage = Math.max(0, totalDamage - reductionAmount);
        if (reductionAmount > 0) {
          newLog.push(`🛡️ Your Reduce effect reduced incoming damage by ${reductionAmount} (${reductionPercentage}%)!`);
        }
      }
      
      // Check for overshield first (from Shield artifact)
      let remainingDamage = totalDamage;
      
      if (vault.overshield && vault.overshield > 0) {
        // Overshield absorbs the entire attack
        overshieldAbsorbed = true;
        remainingDamage = 0;
        shieldDamage = 0;
        ppStolen = 0;
        
        // Overshield is consumed (set to 0) after absorbing an attack
        newLog.push(`✨ Your overshield absorbed ${opponent.name}'s ${opponentMove.name} attack! (0 overshields remaining)`);
        
        // Update vault with overshield consumed
        try {
          await updateVault({
            overshield: 0
          });
        } catch (error) {
          console.error('❌ Failed to update overshield:', error);
        }
      } else {
        // Apply damage to shields first, then vault health
        // Ensure shield damage is calculated correctly
        const currentShieldStrength = vault.shieldStrength || 0;
        shieldDamage = Math.min(totalDamage, currentShieldStrength);
        remainingDamage = totalDamage - shieldDamage;
        
        console.log('Shield Damage Calculation:', {
          totalDamage,
          currentShieldStrength,
          calculatedShieldDamage: shieldDamage,
          remainingDamage
        });
      
      if (remainingDamage > 0) {
          // Max vault health is always 10% of vault capacity
          const maxVaultHealth = Math.floor(vault.capacity * 0.1);
          const currentVaultHealth = vault.vaultHealth !== undefined ? vault.vaultHealth : maxVaultHealth;
          ppStolen = Math.min(remainingDamage, currentVaultHealth);
      }
      
      // Log attack with damage breakdown and range info
        const rangeInfo = damageResult?.isMaxDamage ? ' (MAX DAMAGE!)' : '';
      if (shieldDamage > 0 && ppStolen > 0) {
          newLog.push(`⚔️ ${opponent.name} attacked you with ${opponentMove.name} for ${totalDamage} damage (${shieldDamage} to shields, ${ppStolen} to vault health)${rangeInfo}!`);
      } else if (shieldDamage > 0) {
        newLog.push(`⚔️ ${opponent.name} attacked you with ${opponentMove.name} for ${shieldDamage} damage to shields${rangeInfo}!`);
      } else if (ppStolen > 0) {
          newLog.push(`⚔️ ${opponent.name} attacked you with ${opponentMove.name} for ${ppStolen} damage to vault health${rangeInfo}!`);
      } else {
        newLog.push(`⚔️ ${opponent.name} used ${opponentMove.name} on you${rangeInfo}!`);
        }
      }
    } else {
      newLog.push(`⚔️ ${opponent.name} used ${opponentMove.name}!`);
    }
    
    // Update player vault (only if overshield didn't absorb the attack)
    const currentShieldStrength = vault.shieldStrength || 0;
    const newShieldStrength = overshieldAbsorbed ? currentShieldStrength : Math.max(0, currentShieldStrength - shieldDamage);
    // Max vault health is always 10% of vault capacity
    const maxVaultHealth = Math.floor(vault.capacity * 0.1);
    const currentVaultHealth = vault.vaultHealth !== undefined ? vault.vaultHealth : maxVaultHealth;
    const newVaultHealth = Math.max(0, currentVaultHealth - ppStolen);
    // Set cooldown if vault health reaches 0
    const newVaultHealthCooldown = newVaultHealth === 0 && currentVaultHealth > 0 ? new Date() : vault.vaultHealthCooldown;
    
    console.log('CPU Attack Debug:', {
      opponentMove: opponentMove.name,
      baseDamage: opponentMove.baseDamage,
      damageRange: damageRange || (opponentMove.damageRange ? `${opponentMove.damageRange.min}-${opponentMove.damageRange.max}` : 'N/A'),
      damageResult: damageResult || 'N/A',
      totalDamage,
      healingAmount,
      shieldDamage,
      vaultHealthDamage: ppStolen,
      oldShield: currentShieldStrength,
      newShield: newShieldStrength,
      shieldDamageApplied: currentShieldStrength - newShieldStrength,
      oldVaultHealth: currentVaultHealth,
      newVaultHealth: newVaultHealth,
      overshieldAbsorbed
    });
    
    // Update vault in context (only if overshield didn't absorb the attack)
    if (!overshieldAbsorbed) {
      try {
        const updateData: any = {
        shieldStrength: newShieldStrength,
          vaultHealth: newVaultHealth
        };
        if (newVaultHealthCooldown !== undefined) {
          updateData.vaultHealthCooldown = newVaultHealthCooldown;
        }
        await updateVault(updateData);
        console.log('✅ Vault updated successfully after CPU attack:', {
          shieldStrength: `${currentShieldStrength} → ${newShieldStrength}`,
          vaultHealth: `${currentVaultHealth} → ${newVaultHealth}`
        });
    } catch (error) {
      console.error('❌ Failed to update vault after CPU attack:', error);
      }
    } else {
      console.log('⏭️ Skipping vault update - overshield absorbed attack');
    }
    
    // Update opponent shields if Ice Wall was used
    if (opponentShieldRestore > 0) {
      setOpponent(prev => {
        const newOpponentShieldStrength = Math.min(prev.maxShieldStrength, prev.shieldStrength + opponentShieldRestore);
        console.log(`✅ ${opponent.name}'s shields restored: ${prev.shieldStrength} → ${newOpponentShieldStrength}`);
        const updatedOpponent = {
          ...prev,
          shieldStrength: newOpponentShieldStrength
        };
        
        // In Mindforge mode, notify parent of opponent update
        if (mindforgeMode && onOpponentUpdate) {
          onOpponentUpdate(updatedOpponent);
        }
        
        return updatedOpponent;
      });
    }
    
    // Update opponent health if Phoenix Regeneration was used
    if (opponentHealing > 0) {
      setOpponent(prev => {
        const maxHealth = prev.maxPP || prev.currentPP;
        const newHealth = Math.min(maxHealth, prev.currentPP + opponentHealing);
        console.log(`✅ ${opponent.name}'s health restored: ${prev.currentPP} → ${newHealth}`);
        const updatedOpponent = {
          ...prev,
          currentPP: newHealth
        };
        
        // In Mindforge mode, notify parent of opponent update
        if (mindforgeMode && onOpponentUpdate) {
          onOpponentUpdate(updatedOpponent);
        }
        
        return updatedOpponent;
      });
    }
    
    // Check for defeat (vault health depleted)
    if (newVaultHealth <= 0) {
      newLog.push('💀 Your vault health has been completely depleted!');
      if (isPvP) {
        newLog.push(`💸 Your vault has been bankrupted!`);
        newLog.push(`💀 Defeat! ${opponent.name} won the PvP battle!`);
      } else {
        newLog.push(`💀 Defeat! ${opponent.name} has successfully raided your vault!`);
      }
      setBattleState(prev => ({
        ...prev,
        phase: 'defeat',
        battleLog: newLog,
        isPlayerTurn: false
      }));
      
      // For PvP, pass winner/loser IDs
      if (isPvP && currentUser) {
        onBattleEnd('defeat', opponent.id, currentUser.uid);
      } else {
        onBattleEnd('defeat');
      }
      return;
    }
    
    // In Mindforge mode, don't add turn counter message (each question is like a turn)
    if (!mindforgeMode) {
      newLog.push(`🔄 Turn ${battleState.turnCount + 1} begins!`);
    }
    
    // Update opponent state to reflect any damage from player's previous turn
    setOpponent(currentOpponent);
    
    // In Mindforge mode, notify parent of opponent update
    if (mindforgeMode && onOpponentUpdate) {
      onOpponentUpdate(currentOpponent);
    }
    
    setBattleState(prev => ({
      ...prev,
      phase: 'selection',
      battleLog: newLog,
      isPlayerTurn: true,
      turnCount: prev.turnCount + 1,
      currentAnimation: null, // Ensure animation is cleared
      isAnimating: false // Ensure animation flag is cleared
    }));
    
    // In Mindforge mode, call onMoveExecuted callback after opponent turn completes
    if (mindforgeMode && onMoveExecuted) {
      // Clear any remaining animation state before calling callback
      requestAnimationFrame(() => {
        setBattleState(prev => ({
          ...prev,
          currentAnimation: null,
          isAnimating: false
        }));
        
        // Call the callback after ensuring state is cleared
        setTimeout(() => {
          onMoveExecuted();
        }, 300); // Small delay to ensure battle log is visible
      });
    }
  };

  const handleMoveSelect = (move: Move | null) => {
    setBattleState(prev => ({
      ...prev,
      selectedMove: move,
      selectedTarget: move ? prev.selectedTarget : null, // Clear target if move is cleared
      phase: move ? prev.phase : 'selection' // Return to selection phase if move is cleared
    }));
  };

  const handleTargetSelect = (targetId: string) => {
    setBattleState(prev => ({
      ...prev,
      selectedTarget: targetId,
      phase: 'execution'
    }));
  };

  // Execute move when both move and target are selected
  useEffect(() => {
    if (battleState.phase === 'execution' && battleState.selectedMove && battleState.selectedTarget) {
      executePlayerMove();
    }
  }, [battleState.phase, battleState.selectedMove, battleState.selectedTarget, executePlayerMove]);

  // Handle battle end (non-PvP battles only - PvP battles call onBattleEnd immediately)
  useEffect(() => {
    if (!isPvP) {
      if (battleState.phase === 'victory') {
        setTimeout(() => onBattleEnd('victory'), 3000);
      } else if (battleState.phase === 'defeat') {
        setTimeout(() => onBattleEnd('defeat'), 3000);
      }
    }
  }, [battleState.phase, onBattleEnd, isPvP]);

  // Handle escape
  const handleEscape = () => {
    console.log('BattleEngine: handleEscape called');
    
    // Immediately call onBattleEnd - don't wait
    onBattleEnd('escape');
  };

  if (!vault) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '400px',
        fontSize: '1.2rem',
        color: '#6b7280'
      }}>
        Loading battle system...
      </div>
    );
  }

  // Determine custom background
  const getCustomBackground = () => {
    if (mindforgeMode) return '/images/Mind Forge BKG.png';
    if (isMultiplayer) {
      // Check for Island Raid battle (opponents have vaultHealth and we have gameId)
      const isIslandRaid = gameId && opponents.length > 0 && opponents[0].vaultHealth !== undefined;
      if (isIslandRaid) return '/images/Island Raid BKG.png';
      
      // Check for Ice Golem battle (Chapter 1 - Challenge 7)
      const hasIceGolem = opponents.some(opp => 
        opp.name?.toLowerCase().includes('ice golem') || 
        opp.id?.toLowerCase().includes('ice-golem')
      );
      if (hasIceGolem) return '/images/Frozen train Station.png';
      
      // For multiplayer, check if any opponent is Terra
      const hasTerra = opponents.some(opp => opp.name?.toLowerCase().includes('terra'));
      if (hasTerra && isTerraAwakened) return '/images/Forest Stage.png';
    } else {
      // Check for Truth opponent (Chapter 1 - Challenge 1)
      if (opponent.id === 'truth' || opponent.name?.toLowerCase() === 'truth') {
        return '/images/Frozen train Station.png';
      }
      if (isTerraAwakened && opponent.name?.toLowerCase().includes('terra')) {
        return '/images/Forest Stage.png';
      }
      if (opponent.name?.toLowerCase().includes('flame keeper') || 
          opponent.name?.toLowerCase().includes('flame thrower') || 
          opponent.name?.toLowerCase().includes('master guardian')) {
        return '/images/Fire Stage.png';
      }
    }
    return undefined;
  };

  return (
    <div style={{ width: '100%', maxWidth: isMultiplayer ? '1400px' : '800px', margin: '0 auto' }}>
      {isMultiplayer ? (
        <MultiplayerBattleArena
          onMoveSelect={handleMoveSelect}
          onTargetSelect={handleTargetSelect}
          onEscape={handleEscape}
          selectedMove={battleState.selectedMove}
          selectedTarget={battleState.selectedTarget}
          availableMoves={availableMoves}
          allies={allies.map(ally => ({
            id: ally.id,
            name: ally.name,
            avatar: ally.id === currentUser?.uid 
              ? (userPhotoURL || ally.photoURL || '🏰')
              : (ally.photoURL || '🏰'),
            currentPP: ally.currentPP,
            shieldStrength: ally.shieldStrength,
            maxPP: ally.maxPP,
            maxShieldStrength: ally.maxShieldStrength,
            level: ally.level,
            vaultHealth: ally.vaultHealth,
            maxVaultHealth: ally.maxVaultHealth !== undefined 
              ? ally.maxVaultHealth 
              : Math.floor((ally.maxPP || 1000) * 0.1), // Use provided maxVaultHealth or calculate from maxPP
            isPlayer: ally.id === currentUser?.uid
          }))}
          enemies={opponents.map(opp => {
            // For Island Raid enemies, vaultHealth and maxVaultHealth are set in IslandRaidBattle.tsx
            // For other enemies, use vaultHealth if available, otherwise calculate from maxPP
            return {
              id: opp.id,
              name: opp.name,
              avatar: opp.image || '🏰',
              currentPP: opp.currentPP,
              shieldStrength: opp.shieldStrength,
              maxPP: opp.maxPP,
              maxShieldStrength: opp.maxShieldStrength,
              level: opp.level,
              vaultHealth: opp.vaultHealth,
              maxVaultHealth: opp.maxVaultHealth !== undefined ? opp.maxVaultHealth : Math.floor((opp.maxPP || 1000) * 0.1)
            };
          })}
          isPlayerTurn={battleState.isPlayerTurn}
          battleLog={battleState.battleLog}
          customBackground={getCustomBackground()}
          hideCenterPrompt={mindforgeMode}
          playerEffects={playerEffects}
          opponentEffects={opponentEffects}
        />
      ) : (
      <BattleArena
        onMoveSelect={handleMoveSelect}
        onTargetSelect={handleTargetSelect}
        onEscape={handleEscape}
        selectedMove={battleState.selectedMove}
        selectedTarget={battleState.selectedTarget}
        availableMoves={availableMoves}
        availableTargets={availableTargets}
        isPlayerTurn={battleState.isPlayerTurn}
        battleLog={battleState.battleLog}
          customBackground={getCustomBackground()}
        hideCenterPrompt={mindforgeMode} // Hide center prompt in Mindforge mode
          playerEffects={playerEffects}
          opponentEffects={opponentEffects}
          isTerraAwakened={isTerraAwakened}
      />
      )}
      
      {/* Battle Status */}
      {/* Battle Log - Hide in Mindforge mode (Mindforge has its own log) and Multiplayer mode (MultiplayerBattleArena has its own log) */}
      {!mindforgeMode && !isMultiplayer && (
      <div style={{
        marginTop: '1rem',
        padding: '1rem',
        background: 'rgba(0, 0, 0, 0.8)',
        borderRadius: '0.5rem',
        border: '2px solid #8B4513',
        maxHeight: '200px',
        overflowY: 'auto',
        fontFamily: 'monospace',
        fontSize: '0.75rem',
        color: '#ffffff'
      }}>
        <div style={{ 
          fontSize: '0.875rem', 
          fontWeight: 'bold', 
          marginBottom: '0.5rem', 
          textAlign: 'center',
          color: '#fbbf24'
        }}>
          📜 BATTLE LOG
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {battleState.battleLog.map((logEntry, index) => (
            <div 
              key={index}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '0.25rem',
                backgroundColor: logEntry.includes('used') ? 'rgba(59, 130, 246, 0.2)' : 
                               logEntry.includes('Dealt') ? 'rgba(239, 68, 68, 0.2)' :
                               logEntry.includes('Turn') ? 'rgba(34, 197, 94, 0.2)' :
                               'rgba(107, 114, 128, 0.2)',
                borderLeft: logEntry.includes('used') ? '3px solid #3b82f6' :
                           logEntry.includes('Dealt') ? '3px solid #ef4444' :
                           logEntry.includes('Turn') ? '3px solid #22c55e' :
                           '3px solid #6b7280',
                wordWrap: 'break-word'
              }}
            >
              {logEntry}
            </div>
          ))}
          {battleState.battleLog.length === 0 && (
            <div style={{ 
              textAlign: 'center', 
              color: '#9ca3af', 
              fontStyle: 'italic',
              padding: '1rem'
            }}>
              Battle log will appear here...
            </div>
          )}
        </div>
      </div>
      )}

      {/* Victory Overlay - Only show for non-PvP battles (PvP uses reward spin modal) */}
      {battleState.phase === 'victory' && !isPvP && (
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
          zIndex: 1000,
          animation: 'fadeIn 0.5s ease-in'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: 'white',
            padding: '2rem',
            borderRadius: '1rem',
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            border: '3px solid #fbbf24',
            animation: 'victoryPulse 2s infinite'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              VICTORY!
            </div>
            <div style={{ fontSize: '1rem', opacity: 0.9 }}>
              You defeated {opponent.name}!
            </div>
            <div style={{ fontSize: '0.875rem', marginTop: '0.5rem', opacity: 0.8 }}>
              {opponent.name} defeated! Great job!
            </div>
          </div>
        </div>
      )}

      {/* Battle Animations - Re-enabled for Mindforge mode with proper completion handling */}
      {battleState.isAnimating && battleState.currentAnimation && (
        <BattleAnimations
          move={battleState.currentAnimation}
          isPlayerMove={battleState.isPlayerTurn}
          onAnimationComplete={handleAnimationComplete}
        />
      )}

      {/* CSS Animations */}
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          
          @keyframes victoryPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
        `}
      </style>
    </div>
  );
};

export default BattleEngine;
