import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { Move } from '../types/battle';
import { getMoveDamage, getMoveName, getMoveNameSync } from '../utils/moveOverrides';
import { trackMoveUsage } from '../utils/manifestTracking';
import { getElementalRingLevel, getArtifactDamageMultiplier, getEffectiveMasteryLevel, getManifestDamageBoost } from '../utils/artifactUtils';
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, query, where, orderBy, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { debug } from '../utils/debug';
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
import { formatOpponentName, getBaseOpponentName } from '../utils/opponentNameFormatter';
import { getUserUnlockedSkillsForBattle } from '../utils/battleSkillsService';

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
  isDefeated?: boolean; // Explicit flag for defeated state (true when health <= 0 and shield <= 0)
  defeatedAt?: Date; // Timestamp when enemy was defeated
  waveNumber?: number; // Wave number for Island Raid multi-wave battles
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
  candyChoice?: string; // RR Candy choice for Ch2-4 battles ('on-off' | 'up-down' | 'config')
  onArtifactUsed?: () => void; // Callback when an artifact is used (e.g., Health Potion ends turn)
  isInSession?: boolean; // Whether this is an In Session battle (no CPU moves, no turn order)
  battleName?: string; // Battle name for invitations
  onInviteClick?: () => void; // Callback when invite button is clicked
  allowInvites?: boolean; // Whether to show invite buttons (for Chapter 2-3+)
  currentWave?: number; // Current wave number (for multi-wave battles)
  maxWaves?: number; // Maximum number of waves (for multi-wave battles)
  customWaves?: Record<string, any[]>; // Wave definitions (e.g., { '2': [enemy1, enemy2] })
  onWaveAdvance?: (newWave: number, newEnemies: Opponent[]) => void; // Callback when wave advances
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
  // Cooldown tracking: [userId][skillId] = turns remaining
  cooldowns?: { [userId: string]: { [skillId: string]: number } };
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
  gameId,
  candyChoice,
  onArtifactUsed,
  isInSession = false,
  battleName,
  onInviteClick,
  allowInvites = false,
  currentWave: propCurrentWave,
  maxWaves: propMaxWaves,
  customWaves,
  onWaveAdvance
}) => {
  const { currentUser } = useAuth();
  const { vault, moves, updateVault, refreshVaultData } = useBattle();
  const [userLevel, setUserLevel] = useState(1);
  const [userPhotoURL, setUserPhotoURL] = useState<string | null>(null);
  const [equippedArtifacts, setEquippedArtifacts] = useState<any>(null);
  const [battleSkills, setBattleSkills] = useState<Move[]>([]); // Canonical battle skills (all unlocked)
  const [userElement, setUserElement] = useState<string | undefined>(undefined); // User's elemental affinity
  const [skillCooldowns, setSkillCooldowns] = useState<Map<string, number>>(new Map()); // Track cooldowns in battle state
  
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
    currentTurnIndex: undefined,
    cooldowns: {} // Initialize cooldowns tracking
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
  
  // Wave progression state
  const [currentWaveIndex, setCurrentWaveIndex] = useState(propCurrentWave || 0);
  const [maxWaves, setMaxWaves] = useState(propMaxWaves || 1);
  const [waveTransitioning, setWaveTransitioning] = useState(false);
  const waveTransitioningRef = useRef(false);
  
  // Update wave state from props
  useEffect(() => {
    if (propCurrentWave !== undefined) {
      setCurrentWaveIndex(propCurrentWave);
    }
    if (propMaxWaves !== undefined) {
      setMaxWaves(propMaxWaves);
    }
  }, [propCurrentWave, propMaxWaves]);
  
  // Helper: Get alive enemies (not defeated)
  const getAliveEnemies = useCallback((enemies: Opponent[]): Opponent[] => {
    return enemies.filter(opp => {
      const health = opp.vaultHealth !== undefined 
        ? Math.max(0, Number(opp.vaultHealth)) 
        : Math.max(0, Number(opp.currentPP || 0));
      const shield = Math.max(0, Number(opp.shieldStrength || 0));
      const isDefeated = opp.isDefeated === true;
      
      // Enemy is alive if they have health > 0 OR shield > 0, AND not explicitly marked as defeated
      // If isDefeated is undefined but health and shield are both 0, treat as defeated
      const hasHealthOrShield = health > 0 || shield > 0;
      const explicitlyDefeated = isDefeated === true;
      
      // Enemy is alive only if they have health/shield AND are not explicitly defeated
      return hasHealthOrShield && !explicitlyDefeated;
    });
  }, []);
  
  // Helper: Check if all enemies are defeated
  const areAllEnemiesDefeated = useCallback((enemies: Opponent[]): boolean => {
    const alive = getAliveEnemies(enemies);
    const result = alive.length === 0;
    console.log(`🔍 [BattleEngine] areAllEnemiesDefeated: ${result} (${alive.length}/${enemies.length} alive)`, {
      enemies: enemies.map(opp => ({
        id: opp.id,
        name: opp.name,
        health: opp.vaultHealth !== undefined ? opp.vaultHealth : opp.currentPP,
        shield: opp.shieldStrength,
        isDefeated: opp.isDefeated
      }))
    });
    return result;
  }, [getAliveEnemies]);
  
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
        
        const newVaultHealth = Math.max(0, (vault.vaultHealth || vault.maxVaultHealth || 0) - healthDamage);
        await updateVault({
          shieldStrength: Math.max(0, vault.shieldStrength - shieldDamage),
          vaultHealth: newVaultHealth
        });
        await refreshVaultData();
        
        // Check for defeat immediately after health update
        if (newVaultHealth <= 0) {
          newLog.push('💀 Your vault health has been completely depleted!');
          if (isPvP && opponent) {
            newLog.push(`💀 Defeat! ${opponent.name} won the PvP battle!`);
          } else {
            const opponentName = opponent?.name || opponents?.[0]?.name || 'your opponent';
            newLog.push(`💀 Defeat! ${opponentName} has successfully defeated you!`);
          }
          
          setBattleState(prev => ({
            ...prev,
            phase: 'defeat',
            battleLog: newLog,
            isPlayerTurn: false
          }));
          
          // End battle immediately
          if (isPvP && opponent && currentUser) {
            onBattleEnd('defeat', opponent.id, currentUser.uid);
          } else {
            onBattleEnd('defeat');
          }
          return { newLog, skipTurn: true };
        }
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
        // Max vault health is always 10% of max PP (capacity is the max PP)
        const maxPP = vault.capacity || 1000;
        const maxHealth = Math.floor(maxPP * 0.1);
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

  // Load CPU opponent moves from Firestore with real-time listener
  useEffect(() => {
        const cpuMovesRef = doc(db, 'adminSettings', 'cpuOpponentMoves');
    
    // Use onSnapshot for real-time updates when admin changes moves
    const unsubscribe = onSnapshot(cpuMovesRef, (docSnapshot) => {
      try {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          if (data.opponents && Array.isArray(data.opponents)) {
            console.log('📥 Loaded CPU opponent moves from Firestore:', data.opponents.length, 'opponents');
            const zombieOpponent = data.opponents.find((opp: any) => 
              opp.id === 'zombie' || 
              opp.name?.toLowerCase() === 'zombie' || 
              opp.name?.toLowerCase() === 'unpowered zombie'
            );
            if (zombieOpponent) {
              console.log('📥 Unpowered Zombie moves from Firestore:', {
                id: zombieOpponent.id,
                name: zombieOpponent.name,
                moveCount: zombieOpponent.moves?.length || 0,
                moveNames: zombieOpponent.moves?.map((m: any) => m.name) || []
              });
            } else {
              console.warn('⚠️ Unpowered Zombie not found in Firestore! Available opponents:', data.opponents.map((o: any) => `${o.name} (${o.id})`));
            }
            setCpuOpponentMoves(data.opponents);
          } else {
            console.warn('⚠️ CPU opponent moves data structure invalid:', data);
            setCpuOpponentMoves([]);
          }
        } else {
          console.warn('⚠️ CPU opponent moves document does not exist in Firestore');
          setCpuOpponentMoves([]);
        }
      } catch (error) {
        console.error('Error loading CPU opponent moves:', error);
        setCpuOpponentMoves([]);
      }
    }, (error) => {
      console.error('Error in CPU opponent moves listener:', error);
    });

    return () => unsubscribe();
  }, []);

  // Update parent component with battle log changes (for Mindforge mode and In Session)
  useEffect(() => {
    if (onBattleLogUpdate && (mindforgeMode || isMultiplayer)) {
      onBattleLogUpdate(battleState.battleLog);
    }
  }, [battleState.battleLog, mindforgeMode, isMultiplayer, onBattleLogUpdate]);

  // Notify parent of opponents updates via useEffect (prevents React error from setState during render)
  useEffect(() => {
    if (isMultiplayer && onOpponentsUpdate && opponents.length > 0) {
      onOpponentsUpdate(opponents);
    }
  }, [opponents, isMultiplayer, onOpponentsUpdate]);

  // Wave progression: Check if all enemies are defeated and advance wave
  useEffect(() => {
    // Only check in multiplayer mode with wave support
    if (!isMultiplayer || !propMaxWaves || propMaxWaves <= 1) return;
    if (waveTransitioningRef.current || battleState.phase === 'victory' || battleState.phase === 'defeat') return;
    if (opponents.length === 0) return;
    
    // Check if all enemies are defeated
    if (areAllEnemiesDefeated(opponents)) {
      console.log(`🌊 [BattleEngine] All enemies defeated in wave ${currentWaveIndex}/${maxWaves}`);
      
      // Prevent multiple triggers
      if (waveTransitioningRef.current) return;
      waveTransitioningRef.current = true;
      setWaveTransitioning(true);
      
      // Check if this is the final wave (wave numbers are 1-based)
      if (currentWaveIndex >= maxWaves) {
        console.log(`🏆 [BattleEngine] Final wave complete! Ending battle with victory.`);
        waveTransitioningRef.current = false;
        setWaveTransitioning(false);
        // Battle victory will be handled by parent component
        return;
      }
      
      // Advance to next wave (wave numbers are 1-based)
      const nextWave = currentWaveIndex + 1;
      console.log(`🌊 [BattleEngine] Advancing to wave ${nextWave}/${maxWaves}`);
      
      // Get next wave enemies from customWaves
      if (customWaves && customWaves[String(nextWave)]) {
        const newEnemies = customWaves[String(nextWave)].map((enemy: any) => ({
          id: enemy.id,
          name: enemy.name,
          currentPP: enemy.currentPP || enemy.health || 0,
          maxPP: enemy.maxPP || enemy.maxHealth || 100,
          vaultHealth: enemy.currentPP || enemy.health || 0,
          maxVaultHealth: enemy.maxPP || enemy.maxHealth || 100,
          shieldStrength: enemy.shieldStrength || 0,
          maxShieldStrength: enemy.maxShieldStrength || 100,
          level: enemy.level || 1,
          image: enemy.image,
          isDefeated: false
        }));
        
        // Update opponents to new wave
        setOpponents(newEnemies);
        setCurrentWaveIndex(nextWave);
        
        // Notify parent component
        if (onWaveAdvance) {
          try {
            onWaveAdvance(nextWave, newEnemies);
          } catch (error) {
            console.error('Error calling onWaveAdvance:', error);
          }
        }
        
        // Add battle log entry
        setBattleState(prev => {
          const newLog = [...prev.battleLog, `🌊 WAVE ${nextWave} BEGINS!`];
          if (onBattleLogUpdate) {
            onBattleLogUpdate(newLog);
          }
          return {
            ...prev,
            battleLog: newLog
          };
        });
        
        // Clear transition flag after a delay
        setTimeout(() => {
          waveTransitioningRef.current = false;
          setWaveTransitioning(false);
        }, 1000);
      } else {
        console.warn(`⚠️ [BattleEngine] No enemies found for wave ${nextWave} in customWaves`);
        waveTransitioningRef.current = false;
        setWaveTransitioning(false);
      }
    }
  }, [opponents, currentWaveIndex, maxWaves, battleState.phase, isMultiplayer, areAllEnemiesDefeated, customWaves, onWaveAdvance, onBattleLogUpdate, propMaxWaves]);
  
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
  // CRITICAL: For Island Raid multi-wave battles, we need to update when new waves start
  // but preserve damage for enemies that still exist across waves
  useEffect(() => {
    if (propOpponents && isMultiplayer && propOpponents.length > 0) {
      setOpponents(prev => {
        // If opponents haven't been set yet, use props
        if (prev.length === 0) {
          console.log('📥 [BattleEngine] Initializing opponents from props:', propOpponents.length, propOpponents.map(o => ({ id: o.id, name: o.name, waveNumber: o.waveNumber })));
          return propOpponents;
        }
        
        // Check if this is a new wave (different opponent IDs)
        const prevIds = prev.map(opp => opp.id).sort().join(',');
        const propIds = propOpponents.map(opp => opp.id).sort().join(',');
        
        // If IDs are different, it's a new wave - replace with new opponents
        if (prevIds !== propIds) {
          console.log('🌊 [BattleEngine] New wave detected - replacing opponents:', {
            prevCount: prev.length,
            prevIds: prev.map(o => ({ id: o.id, name: o.name, waveNumber: o.waveNumber })),
            newCount: propOpponents.length,
            newIds: propOpponents.map(o => ({ id: o.id, name: o.name, waveNumber: o.waveNumber }))
          });
          return propOpponents;
        }
        
        // If IDs are the same, check if we need to update health/shield from props
        // This handles cases where Firestore updates come through
        // BUT: Only update if props have different health/shield values (Firestore is authoritative)
        const needsUpdate = propOpponents.some(propOpp => {
          const existing = prev.find(p => p.id === propOpp.id);
          if (!existing) return true; // New opponent
          
          // Check if health/shield differ significantly (more than 1 to account for rounding)
          const propHealth = propOpp.vaultHealth !== undefined ? propOpp.vaultHealth : propOpp.currentPP;
          const existingHealth = existing.vaultHealth !== undefined ? existing.vaultHealth : existing.currentPP;
          const propShield = propOpp.shieldStrength || 0;
          const existingShield = existing.shieldStrength || 0;
          
          return Math.abs(propHealth - existingHealth) > 1 || Math.abs(propShield - existingShield) > 1;
        });
        
        if (needsUpdate) {
          console.log('🔄 [BattleEngine] Updating opponents from props (health/shield changed)');
          // Merge to update health/shield from props (Firestore is authoritative)
          const merged = propOpponents.map(propOpp => {
            const existing = prev.find(p => p.id === propOpp.id);
            if (existing) {
              // Use props for health/shield (Firestore is authoritative), but preserve other battle state
              return {
                ...propOpp,
                isDefeated: existing.isDefeated,
                defeatedAt: existing.defeatedAt
              };
            }
            return propOpp;
          });
          
          // Also add any new opponents from props that weren't in prev
          const newOpponents = propOpponents.filter(propOpp => !prev.some(p => p.id === propOpp.id));
          if (newOpponents.length > 0) {
            console.log('➕ [BattleEngine] Adding new opponents:', newOpponents.map(o => o.id));
            return [...merged, ...newOpponents];
          }
          
          return merged;
        }
        
        // No update needed - keep existing opponents (they have damage applied)
        return prev;
      });
    }
  }, [propOpponents, isMultiplayer]);

  // Update allies when prop changes (for multiplayer mode)
  useEffect(() => {
    if (propAllies && isMultiplayer) {
      const previousAlliesCount = allies.length;
      const newAlliesCount = propAllies.length;
      
      console.log('BattleEngine: Updating allies from props:', newAlliesCount, propAllies.map(a => a.name));
      setAllies(propAllies);
      
      // If a new player joined (allies count increased), reset to selection phase
      // This ensures the new player can select moves and existing players can still select/change moves
      if (newAlliesCount > previousAlliesCount && previousAlliesCount > 0) {
        console.log('BattleEngine: New player joined! Resetting to selection phase to allow move selection');
        // Clear participant moves so turn order recalculates with all players
        setParticipantMoves(new Map());
        setBattleState(prev => {
          // Only reset if we're not in victory/defeat phase
          if (prev.phase !== 'victory' && prev.phase !== 'defeat') {
            // Validate selected target still exists in current opponents/allies
            let validSelectedTarget = prev.selectedTarget;
            if (validSelectedTarget) {
              const isValidTarget = propAllies.some(ally => ally.id === validSelectedTarget) || 
                                    opponents.some(opp => opp.id === validSelectedTarget);
              if (!isValidTarget) {
                console.warn('BattleEngine: Clearing invalid target selection after player join', {
                  selectedTarget: validSelectedTarget,
                  availableOpponents: opponents.map(opp => ({ id: opp.id, name: opp.name })),
                  availableAllies: propAllies.map(ally => ({ id: ally.id, name: ally.name }))
                });
                validSelectedTarget = null;
              }
            }
            
            return {
              ...prev,
              phase: 'selection',
              isPlayerTurn: true, // Ensure players can select moves
              turnOrder: undefined, // Clear turn order so it recalculates with new player
              currentTurnIndex: undefined,
              selectedMove: null, // Clear selected move so player can select again
              selectedTarget: validSelectedTarget // Keep target if still valid, otherwise clear
            };
          }
          return prev;
        });
      }
    }
  }, [propAllies, isMultiplayer, allies.length]);

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
      const formattedOpponentName = formatOpponentName(opponent.name);
      if (shieldDamage > 0) {
        newLog.push(`⚔️ ${formattedOpponentName} attacked you with ${moveName} for ${shieldDamage} damage to shields!`);
      }
      if (damage > 0) {
        newLog.push(`💥 ${formattedOpponentName} dealt ${damage} damage to your vault health!`);
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
          // Max vault health is always 10% of max PP (capacity is the max PP)
          const maxPP = opponentVaultData.capacity || 1000;
          const maxVaultHealth = Math.floor(maxPP * 0.1);
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
          // Max vault health is always 10% of max PP (capacity is the max PP)
          const maxPP = updatedVaultData.capacity || 1000;
          const maxVaultHealth = Math.floor(maxPP * 0.1);
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

  // Load canonical battle skills (all unlocked: Manifest + Elemental + RR Candy)
  useEffect(() => {
    const loadBattleSkills = async () => {
      if (!currentUser) return;
      
      try {
        // Get user element from student data
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        const studentData = studentDoc.exists() ? studentDoc.data() : {};
        const element = studentData.artifacts?.chosen_element || 
                       studentData.elementalAffinity || 
                       studentData.manifestationType || 
                       undefined;
        
        setUserElement(element);
        
        // Load canonical battle skills using shared service
        const skills = await getUserUnlockedSkillsForBattle(currentUser.uid, element, moves);
        setBattleSkills(skills);
        
        console.log('🎯 BattleEngine: Battle skills loaded:', {
          count: skills.length,
          manifest: skills.filter(s => s.category === 'manifest').length,
          elemental: skills.filter(s => s.category === 'elemental').length,
          rrCandy: skills.filter(s => s.id?.startsWith('rr-candy-')).length,
          skillIds: skills.map(s => s.id)
        });
      } catch (error) {
        console.error('BattleEngine: Error loading battle skills:', error);
        // Fallback to moves array if service fails
        setBattleSkills(moves.filter(m => m.unlocked));
      }
    };

    loadBattleSkills();
  }, [currentUser, moves]); // Reload when moves array changes (from BattleContext listener)

  // Decrement skill cooldowns each turn
  useEffect(() => {
    // Only decrement cooldowns when it's the player's turn (after opponent turn completes)
    if (battleState.isPlayerTurn && battleState.phase === 'selection') {
      setSkillCooldowns(prev => {
        const updated = new Map(prev);
        let hasChanges = false;
        
        updated.forEach((cooldown, skillId) => {
          if (cooldown > 0) {
            updated.set(skillId, cooldown - 1);
            hasChanges = true;
            if (cooldown - 1 === 0) {
              console.log(`⏱️ [BattleEngine] Cooldown expired for skill ${skillId}`);
            }
          }
        });
        
        // Remove cooldowns that reached 0
        if (hasChanges) {
          updated.forEach((cooldown, skillId) => {
            if (cooldown === 0) {
              updated.delete(skillId);
            }
          });
        }
        
        return hasChanges ? updated : prev;
      });
    }
  }, [battleState.isPlayerTurn, battleState.phase, battleState.turnCount]);

  // Filter available moves: unlocked AND not on cooldown
  // Use battleSkills (canonical) if available, otherwise fallback to moves array
  const availableMoves = useMemo(() => {
    const skillsToUse = battleSkills.length > 0 ? battleSkills : moves.filter(m => m.unlocked);
    
    return skillsToUse.filter(skill => {
      // Check cooldown from battle state (not from skill library)
      const cooldown = skillCooldowns.get(skill.id) || 0;
      return skill.unlocked && cooldown === 0;
    });
  }, [battleSkills, moves, skillCooldowns]);
  
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
      // CRITICAL: In multiplayer, allow move storage during 'selection' phase OR 'execution' phase if turn order hasn't been calculated yet
      // This handles the case where the phase changes to 'execution' when target is selected, but we still need to store the move
      const canStoreMove = battleState.isPlayerTurn && (
        battleState.phase === 'selection' || 
        (battleState.phase === 'execution' && !battleState.turnOrder) // Allow storage during execution if turn order not calculated yet
      );
      
      if (!canStoreMove) {
        console.warn('BattleEngine: Attempted to store move selection but conditions not met', {
          phase: battleState.phase,
          isPlayerTurn: battleState.isPlayerTurn,
          hasTurnOrder: !!battleState.turnOrder,
          currentUser: currentUser.uid,
          selectedMove: battleState.selectedMove?.name,
          selectedTarget: battleState.selectedTarget
        });
        return;
      }
      
        console.log(`🎯 [Skill Storage] Storing skill for ${currentUser.uid}: ${battleState.selectedMove?.name} on ${battleState.selectedTarget}`, {
        phase: battleState.phase,
        isPlayerTurn: battleState.isPlayerTurn,
        moveId: battleState.selectedMove?.id,
        gameId: gameId
      });
      
      // Store locally
      setParticipantMoves(prev => {
        const newMap = new Map(prev);
        newMap.set(currentUser.uid, {
          move: battleState.selectedMove,
          targetId: battleState.selectedTarget
        });
        console.log(`✅ Stored local skill selection for ${currentUser.uid}: ${battleState.selectedMove?.name} on ${battleState.selectedTarget}`);
        return newMap;
      });
      
      // Also store in Firestore for Island Raid battles (so other players can see it)
      // Check if we're in an Island Raid by checking if opponents have vaultHealth (Island Raid enemies use vaultHealth)
      const isIslandRaid = opponents.length > 0 && opponents[0].vaultHealth !== undefined;
      if (isIslandRaid && gameId) {
        const storeMoveInFirestore = async () => {
          try {
            const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
            const moveData = {
              moveId: battleState.selectedMove?.id || '',
              moveName: battleState.selectedMove?.name || '',
              targetId: battleState.selectedTarget,
              timestamp: serverTimestamp()
            };
            console.log(`💾 [Move Storage] Storing move in Firestore for ${currentUser.uid}:`, moveData);
            await updateDoc(battleRoomRef, {
              [`playerMoves.${currentUser.uid}`]: moveData,
              updatedAt: serverTimestamp()
            });
            console.log(`✅ [Move Storage] Successfully stored move in Firestore for ${currentUser.uid}`);
          } catch (error) {
            console.error('❌ [Move Storage] Error storing move in Firestore:', error);
          }
        };
        storeMoveInFirestore();
      } else {
        console.warn(`⚠️ [Move Storage] Not storing in Firestore - isIslandRaid: ${isIslandRaid}, gameId: ${gameId}`);
      }
    }
  }, [battleState.selectedMove, battleState.selectedTarget, battleState.phase, battleState.isPlayerTurn, isMultiplayer, currentUser, opponents, gameId]);

  // Listen for other players' move selections from Firestore (for Island Raid)
  useEffect(() => {
    if (!isMultiplayer || !gameId || !currentUser) return;

    const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
    
    // Helper function to check if error is a Firestore internal assertion error
    const isFirestoreInternalError = (error: any): boolean => {
      if (!error) return false;
      const errorString = String(error);
      const errorMessage = error?.message || '';
      const errorCode = error?.code || '';
      return errorString.includes('INTERNAL ASSERTION FAILED') || 
             errorMessage.includes('INTERNAL ASSERTION FAILED') ||
             errorString.includes('ID: ca9') ||
             errorString.includes('ID: b815') ||
             errorCode === 'failed-precondition';
    };
    
    const unsubscribe = onSnapshot(battleRoomRef, (docSnapshot) => {
      try {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          const playerMoves = data.playerMoves || {};
          
          // Update firestorePlayerMoves with ALL players' moves (including current user for consistency)
          // But we'll still check currentUser.uid separately in turn order calculation
          const newFirestoreMoves = new Map<string, { moveId: string; moveName: string; targetId: string }>();
          Object.keys(playerMoves).forEach((userId) => {
            if (playerMoves[userId]) {
              newFirestoreMoves.set(userId, playerMoves[userId]);
              if (userId !== currentUser.uid) {
                console.log(`📡 Received Firestore move for player ${userId}: ${playerMoves[userId].moveName} on ${playerMoves[userId].targetId}`);
              }
            }
          });
          setFirestorePlayerMoves(newFirestoreMoves);
          
          if (newFirestoreMoves.size > 0) {
            const otherPlayersMoves = Array.from(newFirestoreMoves.entries())
              .filter(([id]) => id !== currentUser.uid)
              .map(([id, move]) => `${id}: ${move.moveName}`);
            if (otherPlayersMoves.length > 0) {
              console.log('📡 Updated Firestore player moves (other players):', otherPlayersMoves);
            }
          }
        }
      } catch (error) {
        if (isFirestoreInternalError(error)) {
          console.warn('⚠️ BattleEngine: Firestore internal assertion error in player moves listener (suppressed)');
          return;
        }
        console.error('Error processing player moves snapshot:', error);
      }
    }, (error) => {
      if (isFirestoreInternalError(error)) {
        console.warn('⚠️ BattleEngine: Firestore internal assertion error in player moves listener (suppressed)');
        return;
      }
      console.error('Error listening to player moves:', error);
    });

    return () => unsubscribe();
  }, [isMultiplayer, gameId, currentUser]);

  // Automatically select moves for CPU opponents in multiplayer mode
  // Skip this in In Session mode (all players are human-controlled)
  useEffect(() => {
    if (isInSession) return; // No CPU moves in In Session mode
    if (!isMultiplayer || !allies.length || !opponents.length || !vault) return;
    if (battleState.turnOrder) return; // Don't select if turn order already calculated

    // Check if player has selected a move (trigger CPU selection)
    const playerHasMove = currentUser && participantMoves.has(currentUser.uid);
    if (!playerHasMove) return;

    // CRITICAL: Wait for cpuOpponentMoves to load before selecting moves
    // This ensures we use Firestore moves instead of fallback moves
    if (cpuOpponentMoves === null) {
      console.log(`⏳ Waiting for cpuOpponentMoves to load before selecting moves for CPU opponents...`);
      return; // Don't select moves yet - wait for Firestore data to load
    }

    if (!Array.isArray(cpuOpponentMoves) || cpuOpponentMoves.length === 0) {
      console.warn(`⚠️ cpuOpponentMoves is not loaded or empty. Available: ${cpuOpponentMoves ? 'empty array' : 'null'}. Will wait for data to load.`);
      return; // Wait for data to load
    }

    // Select moves for CPU opponents that haven't selected yet
    opponents.forEach((opponent) => {
      if (participantMoves.has(opponent.id)) return; // Already selected

      // Get CPU opponent moves from Firestore or default
      let opponentMoves: any[] = [];
      
      // Define these variables in outer scope so they're available for error logging
        const opponentId = opponent.id || opponent.name?.toLowerCase().replace(/\s+/g, '-');
        const opponentName = opponent.name?.toLowerCase() || '';
      // CRITICAL: Use getBaseOpponentName to consistently extract base name (strips trailing numbers)
      // This ensures "Unpowered Zombie 1", "Unpowered Zombie 2", "Unpowered Zombie 3" all map to "Unpowered Zombie"
      const baseOpponentName = getBaseOpponentName(opponent.name || '');
      const normalizedOpponentName = baseOpponentName.toLowerCase().trim();
      
      // CRITICAL: cpuOpponentMoves should be loaded at this point
      if (!Array.isArray(cpuOpponentMoves) || cpuOpponentMoves.length === 0) {
        console.warn(`⚠️ cpuOpponentMoves is not an array or is empty for ${opponent.name}.`);
        console.warn(`⚠️ cpuOpponentMoves is not an array for ${opponent.name}. Type:`, typeof cpuOpponentMoves);
      } else if (cpuOpponentMoves.length === 0) {
        console.warn(`⚠️ cpuOpponentMoves array is empty for ${opponent.name}. Will use fallback moves.`);
      }
      
      if (cpuOpponentMoves && Array.isArray(cpuOpponentMoves) && cpuOpponentMoves.length > 0) {
        
        console.log(`🔍 Looking for moves for ${opponent.name} (ID: ${opponentId}, Name: ${opponentName})`);
        console.log(`🔍 Available opponents in Firestore:`, cpuOpponentMoves.map((opp: any) => ({ 
          id: opp.id, 
          name: opp.name,
          moveCount: opp.moves?.length || 0
        })));
        
        // Try to find opponent by ID or name
        // CRITICAL: Check for specific zombie types FIRST before general matching
        let opponentData: any = null;
        
        // First, check if this is an Unpowered Zombie (must come before Powered Zombie check)
        // CRITICAL: normalizedOpponentName is already the base name (from getBaseOpponentName) in lowercase
        // This ensures "Unpowered Zombie 1", "Unpowered Zombie 2", "Unpowered Zombie 3" all normalize to "unpowered zombie"
        const normalizedOpponentNameClean = normalizedOpponentName; // Already normalized and lowercased above
        
        // CRITICAL: The simplest and most reliable check - if it starts with "unpowered" and contains "zombie", it's an Unpowered Zombie
        // This avoids the issue where "unpowered" contains "powered" as a substring
        const hasUnpoweredPrefix = normalizedOpponentNameClean.startsWith('unpowered');
        const hasZombie = normalizedOpponentNameClean.includes('zombie');
        const hasCaptain = normalizedOpponentNameClean.includes('captain');
        
        // PRIORITY CHECK: If it starts with "unpowered" and has "zombie", it's definitely an Unpowered Zombie (regardless of other checks)
        // This is the most reliable check and should be checked first
        // Fallback: If it contains "zombie" but NOT "powered zombie" as a phrase AND NOT "captain" AND NOT start with "powered"
        const hasPoweredZombiePhrase = normalizedOpponentNameClean.includes('powered zombie');
        const startsWithPowered = normalizedOpponentNameClean.startsWith('powered');
        
        // CRITICAL: Simplified check - if it starts with "unpowered" and contains "zombie", it's definitely an Unpowered Zombie
        const isUnpoweredZombie = hasUnpoweredPrefix && hasZombie && !hasCaptain;
        
        console.log(`🔍 isUnpoweredZombie check for ${opponent.name}:`, {
          originalName: opponent.name,
          baseName: baseOpponentName,
          normalizedOpponentName,
          normalizedOpponentNameClean,
          hasUnpoweredPrefix,
          hasZombie,
          hasCaptain,
          isUnpoweredZombie
        });
        if (isUnpoweredZombie) {
          console.log(`🔍 Checking for Unpowered Zombie match: ${opponent.name} (${opponentName} -> normalized: ${normalizedOpponentName})`);
          
          // First, log all available Firestore opponents with their normalized values for debugging
          console.log(`📋 Firestore opponents table:`, cpuOpponentMoves.map((opp: any) => {
            const oppId = opp.id?.toLowerCase() || '';
            const oppName = opp.name?.toLowerCase() || '';
            const oppNameNormalized = oppName.replace(/\s*\d+\s*$/, '').trim();
            return {
              rawName: opp.name,
              normalizedName: oppNameNormalized,
              rawId: opp.id,
              normalizedId: oppId,
              hasMoves: !!opp.moves?.length
            };
          }));
          console.log(`🔍 Searching for: normalizedOpponentName="${normalizedOpponentName}", normalizedOpponentNameClean="${normalizedOpponentNameClean}"`);
          console.log(`🔍 Testing direct match: "${normalizedOpponentNameClean}" === "unpowered zombie" = ${normalizedOpponentNameClean === 'unpowered zombie'}`);
          
          // Look for "Unpowered Zombie" in Firestore
          // PRIMARY MATCH: Compare normalized base names directly
          // CRITICAL: Both sides use getBaseOpponentName to ensure consistent matching
          opponentData = cpuOpponentMoves.find((opp: any) => {
            const oppId = opp.id?.toLowerCase() || '';
            const oppName = opp.name || '';
            // CRITICAL: Use getBaseOpponentName to extract base name from Firestore opponent
            // This ensures "Unpowered Zombie" in Firestore matches "Unpowered Zombie 1", "Unpowered Zombie 2", etc.
            const oppBaseName = getBaseOpponentName(oppName);
            const oppNameNormalized = oppBaseName.toLowerCase().trim();
            // normalizedOpponentNameClean is already the base name in lowercase (from getBaseOpponentName above)
            const normalizedOpponentNameTrimmed = normalizedOpponentNameClean;
            
            // PRIMARY MATCH STRATEGY: Normalized name comparison (case-insensitive, trimmed)
            // This is the most reliable - "unpowered zombie" should match "unpowered zombie"
            // CRITICAL: Ensure both are trimmed and lowercased for exact comparison
            const searchName: string = normalizedOpponentNameTrimmed.trim().toLowerCase();
            const firestoreName: string = oppNameNormalized.trim().toLowerCase();
            const normalizedNameMatch = searchName === firestoreName;
            
            // FALLBACK 1: Exact name match (without normalization, but trimmed)
            const exactNameMatch = searchName === oppName.trim().toLowerCase();
            
            // FALLBACK 2: Legacy ID match (for backward compatibility)
            const legacyIdMatch = oppId === 'zombie' && searchName.includes('unpowered zombie');
            
            // FALLBACK 3: Contains match (for cases where Firestore name might have extra words)
            // Only use contains match if both strings are similar length (within 5 chars) to avoid false positives
            const lengthDiff = Math.abs(firestoreName.length - searchName.length);
            const containsMatch = lengthDiff <= 5 && (
              firestoreName.includes(searchName) || 
              searchName.includes(firestoreName)
            );
            
            // EXCLUSION: Must NOT match "Powered Zombie" or "Zombie Captain"
            const isPoweredZombie = oppName.includes('powered zombie') || oppId === 'powered-zombie';
            const isZombieCaptain = oppName.includes('zombie captain') || oppName.includes('captain');
            
            // Match if any of the positive conditions are true AND exclusions are false
            const isMatch = (normalizedNameMatch || exactNameMatch || legacyIdMatch || containsMatch) && 
                          !isPoweredZombie && 
                          !isZombieCaptain;
            
            // Detailed logging for debugging
            if (normalizedOpponentNameClean.includes('zombie') && !normalizedOpponentNameClean.includes('powered') && !normalizedOpponentNameClean.includes('captain')) {
              console.log(`  🔍 Checking opponent "${opp.name}":`, {
                rawName: opp.name,
                oppName,
                oppNameNormalized,
                firestoreName,
                oppId,
                normalizedOpponentName,
                normalizedOpponentNameClean,
                searchName,
                normalizedNameMatch: `"${searchName}" === "${firestoreName}" = ${normalizedNameMatch}`,
                exactNameMatch: `"${searchName}" === "${oppName.trim().toLowerCase()}" = ${exactNameMatch}`,
                legacyIdMatch,
                containsMatch,
                lengthDiff,
                isPoweredZombie,
                isZombieCaptain,
                isMatch
              });
            }
            
            if (isMatch) {
              console.log(`  ✅✅✅ MATCH FOUND: ${opp.name} (normalized: "${firestoreName}" matches "${searchName}") ✅✅✅`);
            } else {
              // Log exact character codes to detect hidden whitespace issues
              const searchChars = searchName.split('').map((c: string) => `${c}(${c.charCodeAt(0)})`).join('');
              const oppChars = firestoreName.split('').map((c: string) => `${c}(${c.charCodeAt(0)})`).join('');
              console.log(`  ✗ No match: ${opp.name} (normalized: "${firestoreName}") vs searching: "${searchName}"`);
              console.log(`  🔍 Character analysis - Search: [${searchChars}], Opponent: [${oppChars}]`);
              console.log(`  🔍 Length comparison - Search: ${searchName.length}, Opponent: ${firestoreName.length}`);
            }
            
            return isMatch;
          });
          if (opponentData) {
            console.log(`✅✅✅ MATCHED ${opponent.name} (${opponentName}) to Unpowered Zombie opponent in Firestore ✅✅✅`);
            console.log(`📋 Found opponent data:`, {
              id: opponentData.id,
              name: opponentData.name,
              moveCount: opponentData.moves?.length || 0,
              moveNames: opponentData.moves?.map((m: any) => m.name) || [],
              movesSource: 'FIRESTORE'
            });
            console.log(`📋 Full moves array:`, opponentData.moves?.map((m: any) => ({
              id: m.id,
              name: m.name,
              type: m.type,
              baseDamage: m.baseDamage
            })));
          } else {
            console.log(`❌ No Unpowered Zombie match found for ${opponent.name} (normalized: ${normalizedOpponentName}).`);
            console.log(`🔍 Available opponents in Firestore:`, cpuOpponentMoves.map((o: any) => ({
              id: o.id,
              name: o.name,
              nameLower: o.name?.toLowerCase(),
              idLower: o.id?.toLowerCase(),
              moveCount: o.moves?.length || 0
            })));
            console.log(`🔍 Looking for: normalizedOpponentName="${normalizedOpponentName}", opponentName="${opponentName}", opponentId="${opponentId}"`);
          }
        }
        
        // If not found, check if this is a Powered Zombie
        // CRITICAL: Must check for "powered zombie" as a complete phrase, not just "zombie"
        // "unpowered zombie" should NOT match this condition
        // Use normalized name to strip numbers
        const normalizedForPowered = normalizedOpponentName || opponentName.replace(/\s*\d+\s*$/, '').trim();
        const hasPoweredZombie = normalizedForPowered.includes('powered zombie');
        const isPoweredZombie = hasPoweredZombie && !normalizedForPowered.includes('unpowered');
        console.log(`🔍 Powered Zombie check for ${opponent.name}: hasPoweredZombie=${hasPoweredZombie}, isPoweredZombie=${isPoweredZombie}, opponentData=${!!opponentData}, opponentName="${opponentName}"`);
        if (!opponentData && isPoweredZombie) {
          console.log(`🔍 Checking for Powered Zombie match: ${opponent.name} (${opponentName})`);
          opponentData = cpuOpponentMoves.find((opp: any) => {
            const oppId = opp.id?.toLowerCase() || '';
            const oppName = opp.name?.toLowerCase() || '';
            return oppName === 'powered zombie' || oppId === 'powered-zombie';
          });
          if (opponentData) {
            console.log(`✅ Matched ${opponent.name} (${opponentName}) to Powered Zombie opponent in Firestore`);
          }
        } else if (!opponentData && !isPoweredZombie) {
          console.log(`🔍 NOT checking Powered Zombie - isPoweredZombie=${isPoweredZombie}, opponentData=${!!opponentData}`);
        }
        
        // If not found, check if this is a Zombie Captain
        // Use normalized name to strip numbers
        const normalizedForCaptain = normalizedOpponentName || opponentName.replace(/\s*\d+\s*$/, '').trim();
        if (!opponentData && normalizedForCaptain.includes('zombie captain')) {
          opponentData = cpuOpponentMoves.find((opp: any) => {
            const oppId = opp.id?.toLowerCase() || '';
            const oppName = opp.name?.toLowerCase() || '';
            return oppName === 'zombie captain' || oppId === 'zombie-captain';
          });
          if (opponentData) {
            console.log(`✅ Matched ${opponent.name} (${opponentName}) to Zombie Captain opponent in Firestore`);
          }
        }
        
        // If still not found, try exact ID or name match or Ice Golem
        // Also check for Unpowered Zombie as a fallback (in case the earlier check didn't run)
        if (!opponentData) {
          // Fallback: Check if this is an Unpowered Zombie (normalized name should match)
          // CRITICAL: Check for "powered zombie" as a phrase, not just "powered" (since "unpowered" contains "powered")
          const hasPoweredZombiePhraseFallback = normalizedOpponentName.includes('powered zombie');
          const hasUnpoweredPrefixFallback = normalizedOpponentName.startsWith('unpowered');
          const isUnpoweredZombieFallback = normalizedOpponentName.includes('zombie') && 
                                           !hasPoweredZombiePhraseFallback && 
                                           !normalizedOpponentName.includes('captain') &&
                                           (hasUnpoweredPrefixFallback || !normalizedOpponentName.includes('powered zombie'));
          if (isUnpoweredZombieFallback) {
            console.log(`🔍 Fallback: Checking for Unpowered Zombie match: ${opponent.name} (${opponentName} -> normalized: ${normalizedOpponentName})`);
            opponentData = cpuOpponentMoves.find((opp: any) => {
              const oppId = opp.id?.toLowerCase() || '';
              const oppName = opp.name || '';
              // CRITICAL: Use getBaseOpponentName to extract base name from Firestore opponent
              const oppBaseName = getBaseOpponentName(oppName);
              const oppNameNormalized = oppBaseName.toLowerCase().trim();
              // normalizedOpponentNameClean is already the base name in lowercase
              const normalizedOpponentNameTrimmed = normalizedOpponentNameClean;
              
              // PRIMARY MATCH: Normalized base name comparison (case-insensitive, trimmed)
              // Both sides use getBaseOpponentName to ensure consistent matching
              const searchName: string = normalizedOpponentNameTrimmed;
              const firestoreName: string = oppNameNormalized;
              const normalizedNameMatch = searchName === firestoreName;
              
              // FALLBACK: Exact name match (trimmed)
              const exactNameMatch = searchName === oppName.trim().toLowerCase();
              
              // FALLBACK: Legacy ID match
              const legacyIdMatch = oppId === 'zombie' && searchName.includes('unpowered zombie');
              
              // FALLBACK: Contains match (only if similar length to avoid false positives)
              const lengthDiff = Math.abs(firestoreName.length - searchName.length);
              const containsMatch = lengthDiff <= 5 && (
                firestoreName.includes(searchName) || 
                searchName.includes(firestoreName)
              );
              
              // EXCLUSION: Must NOT match "Powered Zombie" or "Zombie Captain"
              const isPoweredZombie = oppName.includes('powered zombie') || oppId === 'powered-zombie';
              const isZombieCaptain = oppName.includes('zombie captain') || oppName.includes('captain');
              
              const isMatch = (normalizedNameMatch || exactNameMatch || legacyIdMatch || containsMatch) && 
                            !isPoweredZombie && 
                            !isZombieCaptain;
              
              if (isMatch) {
                console.log(`  ✅ Fallback match found: ${opp.name} (normalized: "${oppNameNormalized}" matches "${normalizedOpponentName}")`);
              }
              return isMatch;
            });
            if (opponentData) {
              console.log(`✅ Fallback: Matched ${opponent.name} to Unpowered Zombie in Firestore`);
            }
          }
          
          // If still not found, try exact ID or name match or Ice Golem
          if (!opponentData) {
            opponentData = cpuOpponentMoves.find((opp: any) => {
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
          
              return false;
            });
          }
        }
        
        if (opponentData && opponentData.moves) {
          // Map moves to ensure all fields are properly formatted
          opponentMoves = opponentData.moves.map((move: any) => {
            // Support both damageRange (min/max) and baseDamage formats
            let baseDamage = move.baseDamage || 0;
            let damageRange = move.damageRange;
            
            // If damageRange exists, use it; otherwise create from baseDamage
            if (damageRange && damageRange.min !== undefined && damageRange.max !== undefined) {
              // Use damageRange as-is
            } else if (baseDamage > 0) {
              // Create damageRange from baseDamage
              damageRange = { min: baseDamage, max: baseDamage };
            }
            
          // CRITICAL: Preserve the exact move name from admin config - do not override or transform
          const moveName = move.name || 'Unknown Move';
          
          // Log move name preservation for debugging
          if (!move.name) {
            console.warn(`⚠️ [Moveset Loaded] Move missing name field:`, { id: move.id, move });
          } else {
            console.debug(`✅ [Moveset Loaded] Move name preserved:`, { id: move.id, name: move.name });
          }
          
          return {
            id: move.id || moveName.toLowerCase().replace(/\s+/g, '-'),
            name: moveName, // CRITICAL: Use the exact name from admin config - NEVER apply getMoveNameSync to CPU moves
              type: move.type || 'attack',
              baseDamage: baseDamage,
              damageRange: damageRange,
              healingRange: move.healingRange,
              shieldBoost: move.shieldBoost,
              ppSteal: move.ppSteal,
              statusEffects: move.statusEffects || (move.statusEffect ? [move.statusEffect] : []),
              priority: move.priority,
              level: move.level || 1,
              masteryLevel: move.masteryLevel || 1,
              description: move.description || ''
            };
          });
          console.log(`✅ Found moves for ${opponent.name} from Firestore:`, opponentMoves.map((m: any) => `${m.name} (${m.damageRange ? `${m.damageRange.min}-${m.damageRange.max}` : m.baseDamage} damage)`));
          console.log(`📋 Full opponent data from Firestore:`, {
            opponentId: opponentData.id,
            opponentName: opponentData.name,
            moves: opponentData.moves.map((m: any) => ({ id: m.id, name: m.name, baseDamage: m.baseDamage, damageRange: m.damageRange }))
          });
          console.log(`🎯 Mapped moves for battle (will be used):`, opponentMoves.map((m: any) => ({
            id: m.id,
            name: m.name,
            type: m.type,
            damageRange: m.damageRange,
            baseDamage: m.baseDamage
          })));
          
          // CRITICAL: Log all move names to verify they're preserved
          console.debug(`[Moveset Loaded] Opponent: ${opponent.name}`, opponentMoves.map((m: any) => ({ id: m.id, name: m.name })));
          
          // Assert that all moves have names
          opponentMoves.forEach((m: any) => {
            if (!m.name || m.name === 'Unknown Move') {
              console.warn(`⚠️ Move missing name:`, { id: m.id, move: m });
            }
          });
        } else {
          console.error(`❌❌❌ NO MOVES FOUND IN FIRESTORE FOR ${opponent.name} ❌❌❌`);
          console.error(`❌ Opponent ID: ${opponentId}`);
          console.error(`❌ Opponent Name: ${opponentName}`);
          console.error(`❌ Normalized Name: ${normalizedOpponentName}`);
          console.error(`🔍 Available opponents in Firestore:`, cpuOpponentMoves.map((opp: any) => ({ 
            id: opp.id, 
            name: opp.name,
            nameLower: opp.name?.toLowerCase(),
            idLower: opp.id?.toLowerCase(),
            moveCount: opp.moves?.length || 0,
            moveNames: opp.moves?.map((m: any) => m.name) || []
          })));
          console.error(`🔍 Attempting to match:`, {
            opponentId,
            opponentName,
            normalizedOpponentName,
            tryingToMatch: 'zombie (unpowered)',
            isUnpoweredZombie: normalizedOpponentName.includes('zombie') && !normalizedOpponentName.includes('powered') && !normalizedOpponentName.includes('captain')
          });
        }
      }

      // Fallback to default moves if not found
      if (opponentMoves.length === 0) {
        console.error(`❌❌❌ FALLBACK MOVES BEING USED FOR ${opponent.name} ❌❌❌`);
        console.error(`❌ This means the admin configuration is NOT being used!`);
        console.error(`❌ Check Firestore for cpuOpponentMoves - opponent should be saved there`);
        console.error(`❌ Opponent details:`, {
          id: opponentId,
          name: opponentName,
          normalizedName: normalizedOpponentName,
          cpuOpponentMovesLoaded: !!cpuOpponentMoves,
          cpuOpponentMovesIsArray: Array.isArray(cpuOpponentMoves),
          cpuOpponentMovesLength: cpuOpponentMoves?.length || 0
        });
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
          id: move.id || move.name?.toLowerCase().replace(/\s+/g, '-'),
          name: move.name, // CRITICAL: Use the exact name from admin config
          type: move.type || 'attack',
          baseDamage: move.baseDamage,
          damageRange: move.damageRange,
          healingRange: move.healingRange,
          shieldBoost: move.shieldBoost,
          ppSteal: move.ppSteal,
          statusEffects: move.statusEffects || (move.statusEffect ? [move.statusEffect] : []),
          priority: move.priority,
          level: move.level || 1,
          masteryLevel: move.masteryLevel || 1,
          description: move.description || ''
        }))
      };

      // Select optimal move
      const selectedMove = selectOptimalCPUMove(situation, targetId);
      if (selectedMove) {
        // CRITICAL: Ensure the move name is preserved from the original move object
        const selectedMoveName = selectedMove.move.name;
        console.log(`🤖 ${opponent.name} selected move: "${selectedMoveName}" from available moves:`, opponentMoves.map((m: any) => m.name));
        console.log(`🤖 ${opponent.name} FULL move selection details:`, {
          selectedMoveName,
          selectedMoveId: (selectedMove.move as any).id || 'no-id',
          allAvailableMoves: opponentMoves.map((m: any) => ({ id: m.id, name: m.name, type: m.type })),
          movesSource: opponentMoves.length > 0 && opponentMoves[0].name !== 'Energy Strike' ? 'Firestore' : 'FALLBACK (check matching!)',
          cpuOpponentMovesLoaded: !!cpuOpponentMoves,
          cpuOpponentMovesLength: cpuOpponentMoves?.length || 0
        });
        
        setParticipantMoves(prev => {
          const newMap = new Map(prev);
          // CRITICAL: Store the move with the exact name from admin config
          newMap.set(opponent.id, {
            move: {
              ...selectedMove.move,
              name: selectedMoveName // Ensure name is preserved
            } as any, // Convert to Move type
            targetId: selectedMove.targetId
          });
          return newMap;
        });

        // Log CPU move selection (optional, for debugging)
        console.log(`🤖 ${opponent.name} selected: ${selectedMoveName} on ${target.name} - ${selectedMove.reason}`);
        console.log(`🤖 ${opponent.name} move details:`, selectedMove.move);
        console.log(`🤖 Available moves for ${opponent.name}:`, opponentMoves.map((m: any) => ({ name: m.name, type: m.type })));
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
  }, [isMultiplayer, allies, opponents, participantMoves, currentUser, vault, cpuOpponentMoves, battleState.turnOrder, isInSession]);

  // Calculate turn order when all participants have selected moves (multiplayer only)
  // Skip this in In Session mode (no turn order, moves execute immediately)
  useEffect(() => {
    if (isInSession) return; // No turn order in In Session mode
    if (!isMultiplayer || !allies.length || !opponents.length) return;

    // Check if all participants have selected moves
    const allParticipants = [...allies, ...opponents];
    const allHaveMoves = allParticipants.every(participant => {
      // Check local participantMoves first (for current player and CPU opponents)
      let moveData = participantMoves.get(participant.id);
      
      // If not found locally and this is a player (ally, including invited players), check Firestore
      const isAlly = allies.some(a => a.id === participant.id);
      if (!moveData && isAlly) {
        // For current user, we already have the move locally, so skip Firestore check
        if (participant.id === currentUser?.uid) {
          // Current user's move should already be in participantMoves
          // If not, it means they haven't selected yet
        } else {
          // For invited players, check Firestore for their move selection
          const firestoreMove = firestorePlayerMoves.get(participant.id);
          if (firestoreMove) {
            console.log(`📡 Found Firestore move for invited player ${participant.name}: ${firestoreMove.moveName} on ${firestoreMove.targetId}`);
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
              console.log(`✅ Stored invited player ${participant.name}'s move locally: ${actualMove.name}`);
            } else {
              // If we can't find the move, create a minimal move object from Firestore data
              console.warn(`⚠️ Could not find move ${firestoreMove.moveName} in available moves for ${participant.name}, creating minimal move object`);
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
          } else {
            console.log(`⏳ Waiting for invited player ${participant.name} (${participant.id}) to select move in Firestore`);
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
      console.log('📊 Participant moves summary:', Array.from(participantMoves.entries()).map(([id, data]) => `${id}: ${data.move?.name || 'none'}`));
      
      // Filter out defeated enemies and allies before calculating turn order
      const activeParticipants = allParticipants.filter(participant => {
        // Check if this is an opponent (enemy)
        const isOpponent = opponents.some(opp => opp.id === participant.id);
        if (isOpponent) {
          // For opponents, check health (vaultHealth for Island Raid, currentPP for CPU)
          const opponent = opponents.find(opp => opp.id === participant.id);
          if (opponent) {
            const health = opponent.vaultHealth !== undefined ? opponent.vaultHealth : (opponent.currentPP || 0);
            if (health <= 0) {
              console.log(`🚫 Excluding defeated enemy ${participant.name} from turn order`);
              return false;
            }
          }
        }
        // Check if this is an ally (player)
        const isAlly = allies.some(ally => ally.id === participant.id);
        if (isAlly) {
          // For allies, check vault health
          const ally = allies.find(ally => ally.id === participant.id);
          if (ally) {
            const health = ally.vaultHealth !== undefined ? ally.vaultHealth : (ally.currentPP || 0);
            if (health <= 0) {
              console.log(`🚫 Excluding defeated ally ${participant.name} from turn order`);
              return false;
            }
          }
        }
        return true;
      });
      
      console.log(`📊 Active participants: ${activeParticipants.length} (filtered from ${allParticipants.length})`);
      
      // Calculate turn order
      const participants: TurnOrderParticipant[] = activeParticipants.map(participant => {
        // Get move data - should already be in participantMoves from the check above
        let moveData = participantMoves.get(participant.id);
        
        // Double-check: if still not found and this is an invited player, try Firestore again
        if (!moveData) {
          const isAlly = allies.some(a => a.id === participant.id);
          if (isAlly && participant.id !== currentUser?.uid) {
            const firestoreMove = firestorePlayerMoves.get(participant.id);
            if (firestoreMove) {
              const availableMoves = moves || [];
              const actualMove = availableMoves.find(m => m.id === firestoreMove.moveId || m.name === firestoreMove.moveName);
              if (actualMove) {
                moveData = {
                  move: actualMove,
                  targetId: firestoreMove.targetId
                };
                console.log(`🔄 [Turn Order] Found move for ${participant.name} from Firestore: ${actualMove.name}`);
              }
            }
          }
        }
        
        const isPlayer = allies.some(a => a.id === participant.id); // All allies are players (including invited players)
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
        const participant = activeParticipants.find(p => p.id === result.participantId);
        const moveData = participantMoves.get(result.participantId);
        // CRITICAL: Use the exact move name from the move object (preserved from admin config)
        const moveName = moveData?.move?.name || 'Unknown Move';
        // Use formatted participant name (e.g., "Unpowered Zombie | 1" instead of "Unpowered Zombie 1")
        const formattedParticipantName = participant?.name ? formatOpponentName(participant.name) : 'Unknown';
        const priorityText = result.priority > 0 
          ? ` (Priority +${result.priority})`
          : result.priority < 0
          ? ` (Priority ${result.priority})`
          : '';
        const fullMoveName = `${formattedParticipantName}'s ${moveName}${priorityText}`;
        console.log(`📋 Turn order ${index + 1}: ${fullMoveName} - Move data:`, moveData?.move);
        return `${index + 1}. ${fullMoveName} (Speed: ${result.speed}, Random: ${result.random}, Score: ${result.orderScore})`;
      });

      setBattleState(prev => {
        const turnOrderLogEntries = [...prev.battleLog, '⚡ Turn Order Calculated:', ...turnOrderLog];
        // Notify parent component of battle log update (for Island Raid)
        if (onBattleLogUpdate) {
          onBattleLogUpdate(turnOrderLogEntries);
        }
        return {
          ...prev,
          phase: 'execution', // Set phase to execution when turn order is calculated
          turnOrder: turnOrderResults.map(r => ({ participantId: r.participantId, orderScore: r.orderScore })),
          currentTurnIndex: 0,
          isPlayerTurn: false, // Disable player input during execution
          battleLog: turnOrderLogEntries
        };
      });

      // Start executing moves in turn order (use active participants only)
      executeTurnOrderMoves(turnOrderResults, activeParticipants);
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
        const roundStartLog = [...prev.battleLog, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, `🔄 ROUND ${roundNumber} ─ ${allParticipants.length} participants`, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`];
        // Notify parent component of battle log update (for Island Raid)
        if (onBattleLogUpdate) {
          onBattleLogUpdate(roundStartLog);
        }
        return {
          ...prev,
          phase: 'execution', // Ensure phase is set to execution
          turnCount: roundNumber,
          isPlayerTurn: false, // Disable player input during execution
          battleLog: roundStartLog
        };
      });
    
    // Small delay before starting round (reduced for better responsiveness)
    await new Promise(resolve => setTimeout(resolve, 100));
    
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
      
      const formattedParticipantName = formatOpponentName(participant.name);
      console.log(`⚔️ [${i + 1}/${turnOrderResults.length}] ${formattedParticipantName} → ${moveData.move.name} on ${moveData.targetId}`);

      const isCurrentPlayer = participant.id === currentUser?.uid;
      // Check if this participant is an ally (player) or opponent (CPU)
      const isAlly = allies.some(ally => ally.id === participant.id);
      const isPlayerMove = isAlly; // All allies are players (including invited players)
      const targetId = moveData.targetId;
      
      // Find target - validate targetId exists in current opponents/allies
      let target: Opponent | undefined;
      if (isPlayerMove) {
        // Player (current user or invited player) targeting an opponent
        target = opponents.find(opp => opp.id === targetId);
        if (!target) {
          console.warn(`⚠️ Player ${participant.name} selected invalid target: ${targetId}`, {
            availableOpponentIds: opponents.map(opp => ({ id: opp.id, name: opp.name })),
            availableAllyIds: allies.map(ally => ({ id: ally.id, name: ally.name }))
          });
          // Try to find a valid target as fallback (first available opponent)
          if (opponents.length > 0) {
            target = opponents[0];
            console.log(`🔄 Using fallback target for ${participant.name}: ${target.name} (${target.id})`);
          } else {
            continue; // No valid targets available
          }
        }
      } else {
        // CPU opponent - find the target
        if (targetId) {
          // Target was selected by CPU AI
          target = allies.find(ally => ally.id === targetId) || opponents.find(opp => opp.id === targetId);
          if (!target) {
            console.warn(`⚠️ CPU ${participant.name} selected invalid target: ${targetId}`, {
              availableOpponentIds: opponents.map(opp => ({ id: opp.id, name: opp.name })),
              availableAllyIds: allies.map(ally => ({ id: ally.id, name: ally.name }))
            });
            // Fallback: target the first ally or first opponent
            target = allies[0] || opponents[0];
            if (target) {
              console.log(`🔄 Using fallback target for CPU ${participant.name}: ${target.name} (${target.id})`);
            }
          }
        } else {
          // Fallback: target the current player
          target = allies.find(ally => ally.id === currentUser?.uid) || opponents[0];
        }
      }

      if (!target) {
        console.error(`❌ No valid target found for ${participant.name}. Skipping move.`);
        continue;
      }

      // Execute the move
      if (isPlayerMove) {
        // Player move execution in multiplayer mode (for both current user and invited players)
        const playerMove = moveData.move;
        // Get player name from participant (which comes from allies with correct profile data)
        // For invited players, participant.name should be their displayName from Firestore
        // Fallback to currentUser displayName, then to 'Player'
        const playerName = participant.name || currentUser?.displayName || 'Player';
        console.log(`🎮 Executing player move for ${playerName} (${participant.id}): ${playerMove.name} on target ${targetId}`);
        
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
          
          // Log target info for debugging
          const targetInOpponents = opponents.some(opp => opp.id === targetId);
          console.log(`🎯 [BattleEngine] Applying damage to target:`, {
            targetId,
            targetName,
            targetInOpponents,
            targetWaveNumber: target.waveNumber,
            currentOpponents: opponents.map(o => ({ id: o.id, name: o.name, waveNumber: o.waveNumber })),
            opponentsCount: opponents.length
          });
          
          if (!targetInOpponents) {
            console.error(`❌ [BattleEngine] Target ${targetName} (${targetId}) not found in opponents array!`, {
              targetId,
              targetName,
              targetWaveNumber: target.waveNumber,
              availableOpponentIds: opponents.map(o => o.id),
              availableOpponentNames: opponents.map(o => o.name)
            });
          }
          
          if (targetId && targetInOpponents) {
            // For Ice Golems and other CPU opponents, use currentPP as health
            // For Island Raid enemies, use vaultHealth
            const updatedOpponent = {
              ...target,
              shieldStrength: newTargetShield
            };
            
            if (target.vaultHealth !== undefined) {
              // Island Raid enemy - use vaultHealth
              updatedOpponent.vaultHealth = newTargetHealth;
              updatedOpponent.maxVaultHealth = targetMaxHealth;
            } else {
              // CPU opponent (like Ice Golems) - use currentPP as health
              updatedOpponent.currentPP = newTargetHealth;
            }
            
            // Set isDefeated flag when health and shield reach 0
            const finalHealth = updatedOpponent.vaultHealth !== undefined 
              ? updatedOpponent.vaultHealth 
              : updatedOpponent.currentPP;
            const finalShield = updatedOpponent.shieldStrength;
            
            if (finalHealth <= 0 && finalShield <= 0) {
              // Check if enemy was just defeated (wasn't defeated before)
              const wasAlreadyDefeated = target.isDefeated === true;
              updatedOpponent.isDefeated = true;
              updatedOpponent.defeatedAt = new Date();
              console.log(`💀 [BattleEngine] Enemy ${targetName} (${targetId}) is now defeated - health=${finalHealth}, shield=${finalShield}`);
              
              // Track daily challenge: Defeat Enemies (only if enemy wasn't already defeated)
              // This works for both single-wave and multi-wave battles (Island Raid)
              if (!wasAlreadyDefeated && currentUser) {
                console.log(`🎯 [Daily Challenge] Tracking enemy defeat: ${targetName}`);
                updateChallengeProgressByType(currentUser.uid, 'defeat_enemies', 1).catch(err => 
                  console.error('Error updating daily challenge progress for enemy defeat:', err)
                );
              }
            } else {
              // Clear defeat flag if enemy is healed
              updatedOpponent.isDefeated = false;
              updatedOpponent.defeatedAt = undefined;
            }
            
            console.log(`📝 [Player Move] Updated opponent ${targetName} (${targetId}): health ${targetHealth} → ${newTargetHealth}, shield ${target.shieldStrength} → ${newTargetShield}, isDefeated=${updatedOpponent.isDefeated}`);
            
            // Update opponents state
            setOpponents(prev => {
              // Check if target exists in prev array
              const targetExists = prev.some(opp => opp.id === targetId);
              if (!targetExists) {
                console.error(`❌ [BattleEngine] Target ${targetName} (${targetId}) not in opponents array when updating!`, {
                  targetId,
                  targetName,
                  prevOpponents: prev.map(o => ({ id: o.id, name: o.name, waveNumber: o.waveNumber }))
                });
                // Still return prev to avoid breaking state, but log the error
                return prev;
              }
              
              const updated = prev.map(opp => 
                opp.id === targetId ? updatedOpponent : opp
              );
              
              console.log(`✅ [BattleEngine] Opponents updated. Target ${targetName} health: ${targetHealth} → ${newTargetHealth}`);
              
              // CRITICAL: Immediately notify parent of opponent updates for Island Raid battles
              // This ensures damage is reflected immediately, especially for Wave 3+ enemies
              // Call after state update completes to avoid React warnings
              if (onOpponentsUpdate && isMultiplayer) {
                // Use requestAnimationFrame to ensure state update completes first
                requestAnimationFrame(() => {
                  setTimeout(() => {
                    console.log(`📤 [BattleEngine] Calling onOpponentsUpdate with ${updated.length} opponents after damage to ${targetName}`, {
                      updatedOpponent: {
                        id: updatedOpponent.id,
                        name: updatedOpponent.name,
                        vaultHealth: updatedOpponent.vaultHealth,
                        shieldStrength: updatedOpponent.shieldStrength
                      }
                    });
                    onOpponentsUpdate(updated);
                  }, 0);
                });
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
              const defeatLog = `💀 ${targetName} has been defeated!`;
              setBattleState(prev => {
                const newLog = [...prev.battleLog, defeatLog];
                // Notify parent of battle log update immediately
                if (onBattleLogUpdate) {
                  onBattleLogUpdate(newLog);
                }
                return {
                  ...prev,
                  battleLog: newLog,
                  phase: 'defeat' // Pause battle
                };
              });
              
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
            logMessage = `⚔️ ${playerName} used skill ${playerMove.name} on ${target.name}!`;
          }
          
          console.log(`📝 [Player Move] Adding to battle log: ${logMessage}`);
          
          // Update battle log (callback will be called via useEffect to avoid React error)
          setBattleState(prev => ({
            ...prev,
            battleLog: [...prev.battleLog, logMessage]
          }));
        } else {
          // Non-damage move (heal, shield boost, etc.)
          if (target) {
            // Check what type of move this is for better logging
            let logMessage = '';
            if (playerMove.healing) {
              logMessage = `💚 ${playerName} used skill ${playerMove.name} to heal ${target.name}!`;
            } else if (playerMove.shieldBoost) {
              logMessage = `🛡️ ${playerName} used skill ${playerMove.name} to boost ${target.name}'s shields!`;
            } else if (playerMove.ppSteal) {
              logMessage = `⚡ ${playerName} used skill ${playerMove.name} to steal PP from ${target.name}!`;
            } else {
              logMessage = `⚔️ ${playerName} used skill ${playerMove.name} on ${target.name}!`;
            }
            
            console.log(`📝 [Player Move] Adding to battle log: ${logMessage}`);
            
            setBattleState(prev => {
              const newLog = [...prev.battleLog, logMessage];
              // Notify parent component of battle log update immediately (for Island Raid)
              if (onBattleLogUpdate) {
                onBattleLogUpdate(newLog);
              }
              return {
                ...prev,
                battleLog: newLog
              };
            });
          }
        }
      } else {
        // Execute CPU/opponent move - CPU moves have a different structure (from selectOptimalCPUMove)
        // Skip CPU moves in In Session mode (all players are human-controlled)
        if (isInSession) {
          console.log(`⏭️ Skipping CPU move execution in In Session mode for ${participant.name}`);
          continue;
        }
        
        const cpuMove = moveData.move as any; // CPU moves have damageRange/baseDamage which aren't in Move interface
        const cpuOpponent = participant;
        
        // CRITICAL: Preserve the original move name from admin config
        // The move name should come directly from the move object stored in participantMoves
        const moveName = cpuMove.name || 'Unknown Move';
        console.log(`⚔️ Executing CPU move: ${cpuOpponent.name} using ${moveName}`, cpuMove);
        
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
            // Store target name before the callback to avoid TypeScript errors
            const targetName = target?.name || 'Unknown Target';
            setOpponents(prev => {
              const updated = prev.map(opp => {
                if (opp.id === targetId) {
                  // For Ice Golems and other CPU opponents, use currentPP as health
                  // For Island Raid enemies, use vaultHealth
                  const updatedOpponent = {
                    ...opp,
                    shieldStrength: newTargetShield
                  };
                  
                  if (opp.vaultHealth !== undefined) {
                    // Island Raid enemy - use vaultHealth
                    updatedOpponent.vaultHealth = newTargetHealth;
                    updatedOpponent.maxVaultHealth = targetMaxHealth;
                  } else {
                    // CPU opponent (like Ice Golems) - use currentPP as health
                    updatedOpponent.currentPP = newTargetHealth;
                  }
                  
                  // Set isDefeated flag when health and shield reach 0
                  const finalHealth = updatedOpponent.vaultHealth !== undefined 
                    ? updatedOpponent.vaultHealth 
                    : updatedOpponent.currentPP;
                  const finalShield = updatedOpponent.shieldStrength;
                  
                  if (finalHealth <= 0 && finalShield <= 0) {
                    // Check if enemy was just defeated (wasn't defeated before)
                    const wasAlreadyDefeated = opp.isDefeated === true;
                    updatedOpponent.isDefeated = true;
                    updatedOpponent.defeatedAt = new Date();
                    console.log(`💀 [BattleEngine] Enemy ${opp.name} (${opp.id}) is now defeated - health=${finalHealth}, shield=${finalShield}`);
                    
                    // Track daily challenge: Defeat Enemies (only if enemy wasn't already defeated)
                    // This works for both single-wave and multi-wave battles (Island Raid)
                    if (!wasAlreadyDefeated && currentUser) {
                      console.log(`🎯 [Daily Challenge] Tracking enemy defeat: ${opp.name}`);
                      updateChallengeProgressByType(currentUser.uid, 'defeat_enemies', 1).catch(err => 
                        console.error('Error updating daily challenge progress for enemy defeat:', err)
                      );
                    }
                  } else {
                    // Clear defeat flag if enemy is healed
                    updatedOpponent.isDefeated = false;
                    updatedOpponent.defeatedAt = undefined;
                  }
                  
                  console.log(`📝 [CPU Move] Updated opponent ${opp.name} (${opp.id}): health ${targetHealth} → ${newTargetHealth}, shield ${opp.shieldStrength} → ${newTargetShield}`);
                  return updatedOpponent;
                }
                return opp;
              });
              // State update (callback will be called via useEffect to avoid React error)
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
              // Max vault health is always 10% of max PP (capacity is the max PP)
              const maxPP = vault.capacity || 1000;
              const maxVaultHealth = Math.floor(maxPP * 0.1);
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
          // CRITICAL: Use the move name from the move object (preserved from admin config)
          // Use formatted opponent name (e.g., "Unpowered Zombie | 1" instead of "Unpowered Zombie 1")
          const formattedOpponentName = formatOpponentName(cpuOpponent.name);
          const formattedTargetName = formatOpponentName(target.name);
          
          let logMessage = '';
          if (targetShieldDamage > 0 && targetHealthDamage > 0) {
            logMessage = `⚔️ ${formattedOpponentName} attacked ${formattedTargetName} with ${moveName} for ${totalDamage} damage (${targetShieldDamage} to shields, ${targetHealthDamage} to health)!`;
          } else if (targetShieldDamage > 0) {
            logMessage = `⚔️ ${formattedOpponentName} attacked ${formattedTargetName} with ${moveName} for ${targetShieldDamage} damage to shields!`;
          } else if (targetHealthDamage > 0) {
            logMessage = `⚔️ ${formattedOpponentName} attacked ${formattedTargetName} with ${moveName} for ${targetHealthDamage} damage to health!`;
          } else {
            logMessage = `⚔️ ${formattedOpponentName} used skill ${moveName} on ${formattedTargetName}!`;
          }
          
          console.log(`📝 [CPU Move] Adding to battle log: ${logMessage}`);
          
          // Update battle log immediately using functional state update
          setBattleState(prev => {
            const updatedLog = [...prev.battleLog, logMessage];
            console.log(`📝 Battle log updated. New length: ${updatedLog.length}, Last entry: ${updatedLog[updatedLog.length - 1]}`);
            // Notify parent component of battle log update immediately (for Island Raid)
            if (onBattleLogUpdate) {
              onBattleLogUpdate(updatedLog);
            }
            return {
              ...prev,
              battleLog: updatedLog
            };
          });
        } else {
          // Non-damage move (heal, shield boost, etc.)
          if (target) {
            // Check what type of move this is for better logging
            // CRITICAL: Use the move name from the move object (preserved from admin config)
            // Use formatted opponent name
            const formattedOpponentName = formatOpponentName(cpuOpponent.name);
            const formattedTargetName = formatOpponentName(target.name);
            
            let logMessage = '';
            if ((cpuMove as any).healing) {
              logMessage = `💚 ${formattedOpponentName} used skill ${moveName} to heal ${formattedTargetName}!`;
            } else if ((cpuMove as any).shieldBoost) {
              logMessage = `🛡️ ${formattedOpponentName} used skill ${moveName} to boost ${formattedTargetName}'s shields!`;
            } else if ((cpuMove as any).ppSteal) {
              logMessage = `⚡ ${formattedOpponentName} used skill ${moveName} to steal PP from ${formattedTargetName}!`;
            } else {
              logMessage = `⚔️ ${formattedOpponentName} used skill ${moveName} on ${formattedTargetName}!`;
            }
            
            console.log(`📝 [CPU Move] Adding to battle log: ${logMessage}`);
            
            setBattleState(prev => {
              const newLog = [...prev.battleLog, logMessage];
              // Notify parent component of battle log update immediately (for Island Raid)
              if (onBattleLogUpdate) {
                onBattleLogUpdate(newLog);
              }
              return {
                ...prev,
                battleLog: newLog
              };
            });
          }
        }
      }

      // Small delay between moves for visual clarity (reduced for better responsiveness)
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Add round end separator
    setBattleState(prev => {
      const roundEndLog = [...prev.battleLog, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, `✓ Round ${prev.turnCount || 1} Complete`, `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`];
      // Notify parent component of battle log update (for Island Raid)
      if (onBattleLogUpdate) {
        onBattleLogUpdate(roundEndLog);
      }
      return {
        ...prev,
        battleLog: roundEndLog
      };
    });

    // Small delay before clearing for next round (reduced for better responsiveness)
    await new Promise(resolve => setTimeout(resolve, 200));

    // Clear participant moves and reset for next round
    setParticipantMoves(new Map());
    setBattleState(prev => ({
      ...prev,
      turnOrder: undefined,
      currentTurnIndex: undefined,
      phase: 'selection',
      isPlayerTurn: true, // CRITICAL: In multiplayer, ALL players can select moves during selection phase
      selectedMove: null,
      selectedTarget: null
      // Keep the battle log - don't reset it
    }));
  }, [vault, participantMoves, currentUser, opponents, allies, updateVault, battleState.turnCount, onIceGolemDefeated, isMultiplayer, equippedArtifacts, onOpponentsUpdate, onBattleLogUpdate]);

  // CRITICAL FIX: Ensure isPlayerTurn is true during selection phase in multiplayer
  // This allows ALL players (including invited players) to select moves
  // Also reset phase to selection if we're in execution but turn order hasn't been calculated yet
  useEffect(() => {
    if (isMultiplayer) {
      // If we're in selection phase, ensure isPlayerTurn is true
      if (battleState.phase === 'selection' && !battleState.isPlayerTurn) {
      console.log('BattleEngine: Fixing isPlayerTurn - setting to true for selection phase in multiplayer', {
        currentUser: currentUser?.uid,
        phase: battleState.phase,
        isPlayerTurn: battleState.isPlayerTurn,
        allies: allies.map(a => ({ id: a.id, name: a.name, isPlayer: a.id === currentUser?.uid }))
      });
      setBattleState(prev => ({
        ...prev,
        isPlayerTurn: true
      }));
    }
      
      // If we're in execution phase but turn order hasn't been calculated yet, reset to selection
      // This can happen when a player joins mid-battle
      if (battleState.phase === 'execution' && !battleState.turnOrder && allies.length > 0) {
        console.log('BattleEngine: In execution phase without turn order, resetting to selection phase', {
          phase: battleState.phase,
          hasTurnOrder: !!battleState.turnOrder,
          alliesCount: allies.length
        });
        setBattleState(prev => ({
          ...prev,
          phase: 'selection',
          isPlayerTurn: true,
          selectedMove: null, // Clear selected move
          selectedTarget: null // Clear selected target
        }));
      }
      
      // Validate selected target still exists in opponents/allies
      if (battleState.selectedTarget) {
        const isValidTarget = opponents.some(opp => opp.id === battleState.selectedTarget) || 
                              allies.some(ally => ally.id === battleState.selectedTarget);
        if (!isValidTarget) {
          console.warn('BattleEngine: Selected target no longer exists, clearing selection', {
            selectedTarget: battleState.selectedTarget,
            availableOpponents: opponents.map(opp => ({ id: opp.id, name: opp.name })),
            availableAllies: allies.map(ally => ({ id: ally.id, name: ally.name }))
          });
          setBattleState(prev => ({
            ...prev,
            selectedTarget: null,
            selectedMove: null // Also clear move if target is invalid
          }));
        }
      }
    }
  }, [isMultiplayer, battleState.phase, battleState.isPlayerTurn, battleState.turnOrder, battleState.selectedTarget, currentUser, allies, opponents]);

  const executePlayerMove = useCallback(async () => {
    if (!battleState.selectedMove || !battleState.selectedTarget || !vault) return;

    const move = battleState.selectedMove;
    
    // In multiplayer, wait for all participants to select moves before executing
    // EXCEPT in In Session mode, where moves execute immediately
    if (isMultiplayer && !isInSession) {
      // Just store the move - execution will happen when turn order is calculated
      return;
    }
    
    // In In Session mode or single player mode, execute immediately
    // Start animation
    setBattleState(prev => ({
      ...prev,
      currentAnimation: move,
      isAnimating: true
    }));
  }, [battleState.selectedMove, battleState.selectedTarget, vault, isMultiplayer, isInSession]);

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
      // Player is stunned or defeated, skip their turn
      // Check if defeat occurred (skipTurn will be true if health reached 0)
      if (battleState.phase === 'defeat') {
        // Defeat already handled in applyTurnEffects
        return;
      }
      
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
    
    // Double-check vault health after effects (in case it was updated)
    // The defeat check in applyTurnEffects should have caught it, but verify here too
    if (battleState.phase === 'defeat') {
      // Defeat already handled in applyTurnEffects
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
    // Get player name from allies array (which has correct profile data from session)
    // Find the current player in allies to get their correct name
    const currentPlayerInAllies = allies.find(a => a.id === currentUser?.uid);
    const playerName = currentPlayerInAllies?.name || currentUser?.displayName || 'Player';
    
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
    
    // SPECIAL HANDLING FOR RR CANDY MOVES - Must happen BEFORE normal damage calculation
    // This ensures these moves work correctly and don't get overwritten by normal damage logic
    if (move.id === 'rr-candy-on-off-shields-on') {
      // Shield ON - Restore 50% of max shields
      const maxShields = vault.maxShieldStrength || 100;
      const shieldRestoreAmount = Math.floor(maxShields * 0.5);
      const currentShields = vault.shieldStrength || 0;
      const actualRestore = Math.min(shieldRestoreAmount, maxShields - currentShields);
      playerShieldBoost = actualRestore;
      wasShieldAttacked = false; // This is a defensive move, not an attack
      damage = 0; // No damage from this move
      shieldDamage = 0; // No shield damage from this move
      wasAttacked = false;
      newLog.push(`🔋 ${playerName} used ${overriddenMoveName} to restore ${actualRestore} shields (50% of max)!`);
      console.log('🔋 [Shield ON] Shield restore calculation:', {
        maxShields,
        shieldRestoreAmount,
        currentShields,
        actualRestore,
        vault: {
          shieldStrength: vault.shieldStrength,
          maxShieldStrength: vault.maxShieldStrength
        }
      });
    } else if (move.id === 'rr-candy-on-off-shields-off') {
      // Shield OFF - Remove 25% of opponent's MAX shields (not current shields)
      // This is a percentage-based shield removal that bypasses normal damage calculation
      const opponentMaxShields = targetOpponent.maxShieldStrength || 100;
      const shieldRemoveAmount = Math.floor(opponentMaxShields * 0.25); // 25% of MAX shields
      const currentOpponentShields = targetOpponent.shieldStrength || 0;
      // Remove the calculated amount, but don't go below 0
      const actualRemove = Math.min(shieldRemoveAmount, currentOpponentShields);
      shieldDamage = actualRemove;
      damage = 0; // No health damage from this move
      wasShieldAttacked = true;
      wasAttacked = false; // This is shield-only damage, not a health attack
      newLog.push(`🛡️ ${playerName} used ${overriddenMoveName} to remove ${actualRemove} shields from ${targetOpponent.name} (25% of max shields: ${opponentMaxShields})!`);
      console.log('🛡️ [Shield OFF] Shield removal calculation:', {
        opponentMaxShields,
        shieldRemoveAmount,
        currentOpponentShields,
        actualRemove,
        targetOpponent: {
          id: targetOpponent.id,
          name: targetOpponent.name,
          shieldStrength: targetOpponent.shieldStrength,
          maxShieldStrength: targetOpponent.maxShieldStrength
        }
      });
    }
    
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
    // Skip normal damage calculation for RR Candy moves that have already been handled
    if (move.id !== 'rr-candy-on-off-shields-off' && move.id !== 'rr-candy-on-off-shields-on' && move.damage) {
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
      
      // Apply artifact damage multipliers
      let artifactMultiplier = 1.0;
      
      // Apply manifest damage boost for manifest moves (Captain's Helmet)
      if (move.category === 'manifest' && equippedArtifacts) {
        const manifestBoost = getManifestDamageBoost(equippedArtifacts);
        if (manifestBoost > 1.0) {
          artifactMultiplier *= manifestBoost;
          newLog.push(`🪖 Captain's Helmet boosts ${overriddenMoveName} damage by ${Math.round((manifestBoost - 1) * 100)}%!`);
        }
      }
      
      // Apply elemental ring multiplier for elemental moves
      if (move.category === 'elemental' && equippedArtifacts) {
        const ringLevel = getElementalRingLevel(equippedArtifacts);
        const ringMultiplier = getArtifactDamageMultiplier(ringLevel);
        if (ringMultiplier > 1.0) {
          artifactMultiplier *= ringMultiplier;
          newLog.push(`💍 Elemental Ring (Level ${ringLevel}) boosts ${overriddenMoveName} damage by ${Math.round((ringMultiplier - 1) * 100)}%!`);
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
      // BUT: Skip this if it's a special RR Candy move that already set shieldDamage
      let remainingDamage = 0;
      if (move.id !== 'rr-candy-on-off-shields-off') {
        shieldDamage = Math.min(damage, targetOpponent.shieldStrength);
        remainingDamage = Math.max(0, damage - targetOpponent.shieldStrength);
      } else {
        // For "Turn Shields Off", shieldDamage was already set in special handling above
        // Just calculate remaining damage (should be 0 for this move)
        remainingDamage = Math.max(0, damage - shieldDamage);
      }
      
      // Track attack flags for counter conditions (after calculating shield damage)
      // Don't override if already set by special move handling
      if (move.id !== 'rr-candy-on-off-shields-off' && move.id !== 'rr-candy-on-off-shields-on') {
        wasAttacked = damage > 0;
        wasShieldAttacked = shieldDamage > 0;
      }
      
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
      let playerLogMessage = '';
      if (shieldDamage > 0 && remainingDamage > 0) {
        playerLogMessage = `⚔️ ${playerName} attacked ${targetOpponent.name} with ${overriddenMoveName} for ${damage} damage (${shieldDamage} to shields, ${remainingDamage} to ${healthLabel})${rangeInfo}!`;
      } else if (shieldDamage > 0) {
        playerLogMessage = `⚔️ ${playerName} attacked ${targetOpponent.name} with ${overriddenMoveName} for ${shieldDamage} damage to shields${rangeInfo}!`;
      } else if (remainingDamage > 0) {
        playerLogMessage = `⚔️ ${playerName} attacked ${targetOpponent.name} with ${overriddenMoveName} for ${remainingDamage} damage to ${healthLabel}${rangeInfo}!`;
      } else {
        playerLogMessage = `⚔️ ${playerName} used ${overriddenMoveName} on ${targetOpponent.name}${rangeInfo}!`;
      }
      newLog.push(playerLogMessage);
      console.log(`📝 [Player Move] Adding to battle log: ${playerLogMessage}`);
      
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
    
    // Special handling for RR Candy moves
    // IMPORTANT: These must be handled BEFORE normal damage/shield calculations to ensure they work correctly
    if (move.id === 'rr-candy-on-off-shields-on') {
      // Shield ON - Restore 50% of max shields
      const maxShields = vault.maxShieldStrength || 100;
      const shieldRestoreAmount = Math.floor(maxShields * 0.5);
      const currentShields = vault.shieldStrength || 0;
      const actualRestore = Math.min(shieldRestoreAmount, maxShields - currentShields);
      playerShieldBoost = actualRestore;
      wasShieldAttacked = false; // This is a defensive move, not an attack
      damage = 0; // No damage from this move
      shieldDamage = 0; // No shield damage from this move
      newLog.push(`🔋 ${playerName} used ${overriddenMoveName} to restore ${actualRestore} shields (50% of max)!`);
    } else if (move.id === 'rr-candy-on-off-shields-off') {
      // Shield OFF - Remove 25% of opponent's MAX shields (not current shields)
      // This is a percentage-based shield removal that bypasses normal damage calculation
      const opponentMaxShields = targetOpponent.maxShieldStrength || 100;
      const shieldRemoveAmount = Math.floor(opponentMaxShields * 0.25); // 25% of MAX shields
      const currentOpponentShields = targetOpponent.shieldStrength || 0;
      // Remove the calculated amount, but don't go below 0
      const actualRemove = Math.min(shieldRemoveAmount, currentOpponentShields);
      shieldDamage = actualRemove;
      damage = 0; // No health damage from this move
      wasShieldAttacked = true;
      wasAttacked = false; // This is shield-only damage, not a health attack
      newLog.push(`🛡️ ${playerName} used ${overriddenMoveName} to remove ${actualRemove} shields from ${targetOpponent.name} (25% of max shields: ${opponentMaxShields})!`);
      console.log('🛡️ [Shield OFF] Shield removal calculation:', {
        opponentMaxShields,
        shieldRemoveAmount,
        currentOpponentShields,
        actualRemove,
        targetOpponent: {
          id: targetOpponent.id,
          name: targetOpponent.name,
          shieldStrength: targetOpponent.shieldStrength,
          maxShieldStrength: targetOpponent.maxShieldStrength
        }
      });
    }
    
    // Defensive moves (shield boost) - use shield boost range system
    if (move.shieldBoost && move.id !== 'rr-candy-on-off-shields-on') {
      let shieldRange = calculateShieldBoostRange(move.shieldBoost, move.level, move.masteryLevel);
      
      // Apply manifest damage boost for manifest moves (Captain's Helmet)
      // This also boosts shield values for manifest defensive moves
      if (move.category === 'manifest' && equippedArtifacts) {
        const manifestBoost = getManifestDamageBoost(equippedArtifacts);
        if (manifestBoost > 1.0) {
          shieldRange = {
            min: Math.floor(shieldRange.min * manifestBoost),
            max: Math.floor(shieldRange.max * manifestBoost),
            average: Math.floor(shieldRange.average * manifestBoost)
          };
          newLog.push(`🪖 Captain's Helmet boosts ${overriddenMoveName} shield boost by ${Math.round((manifestBoost - 1) * 100)}%!`);
        }
      }
      
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
      // Max vault health is always 10% of max PP
      const maxPP = targetOpponent.maxPP || 1000;
      const maxVaultHealth = Math.floor(maxPP * 0.1);
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
          // Max vault health is always 10% of max PP
          const maxPP = targetOpponent.maxPP || 1000;
          const maxVaultHealth = Math.floor(maxPP * 0.1);
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
    
    // Set skill cooldown in battle state (not in skill library)
    if (move.cooldown && move.cooldown > 0) {
      setSkillCooldowns(prev => {
        const updated = new Map(prev);
        updated.set(move.id, move.cooldown);
        console.log(`⏱️ [BattleEngine] Set cooldown for skill ${move.name} (${move.id}): ${move.cooldown} turns`);
        return updated;
      });
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
      
      // Calculate XP reward (if applicable)
      let xpReward = 0;
      if (isPvP && currentUser) {
        // Calculate XP based on PP stolen (similar to vault siege)
        if (totalPPReward >= 35) {
          xpReward = 5;
        } else if (totalPPReward >= 20) {
          xpReward = 3;
        } else if (totalPPReward >= 10) {
          xpReward = 2;
        } else if (totalPPReward > 0) {
          xpReward = 1;
        }
      }
      
      // Apply rival bonus if opponent is a rival
      let finalPPReward = totalPPReward;
      let finalXPReward = xpReward;
      let isRivalBonus = false;
      
      if (currentUser && targetOpponent.id && !checkIsCPUOpponent(targetOpponent)) {
        try {
          const { applyRivalBonus } = await import('../utils/rivalBonus');
          const bonusResult = await applyRivalBonus(
            currentUser.uid,
            targetOpponent.id,
            totalPPReward,
            xpReward
          );
          finalPPReward = bonusResult.ppEarned;
          finalXPReward = bonusResult.xpEarned;
          isRivalBonus = bonusResult.isRivalBonus;
        } catch (error) {
          console.error('Error applying rival bonus:', error);
        }
      }
      
      if (finalPPReward > 0) {
        // Add accumulated PP + defeated opponent's remaining PP
        const vaultCapacity = vault.capacity || 1000;
        const newPP = Math.min(vaultCapacity, vault.currentPP + finalPPReward);
        
        try {
          await updateVault({
            currentPP: newPP
          });
          
          let rewardMessage = `💰 You gained ${finalPPReward} PP from the battle!`;
          if (totalPPReward !== finalPPReward) {
            rewardMessage += ` (${battleState.accumulatedPPStolen} stolen + ${defeatedOpponentPP} from defeated opponent)`;
          }
          if (isRivalBonus) {
            rewardMessage += `\n⚔️ Rival defeated! PP and XP doubled.`;
          }
          newLog.push(rewardMessage);
          
          // Track daily challenge: Earn PP
          if (currentUser) {
            updateChallengeProgressByType(currentUser.uid, 'earn_pp', finalPPReward).catch(err => 
              console.error('Error updating daily challenge progress:', err)
            );
          }
        } catch (error) {
          console.error('❌ Failed to add PP reward:', error);
        }
      }
      
      // Award XP if applicable
      if (finalXPReward > 0 && currentUser) {
        try {
          const studentRef = doc(db, 'students', currentUser.uid);
          const studentDoc = await getDoc(studentRef);
          
          if (studentDoc.exists()) {
            const studentData = studentDoc.data();
            const currentXP = studentData.xp || 0;
            const newXP = currentXP + finalXPReward;
            
            await updateDoc(studentRef, {
              xp: newXP
            });
            
            if (isRivalBonus) {
              newLog.push(`⚔️ Rival defeated! XP doubled (+${finalXPReward} XP).`);
            }
          }
        } catch (error) {
          console.error('Error awarding XP:', error);
        }
      }
      
      // Note: Enemy defeats are now tracked individually when each enemy is defeated
      // (see lines 2362-2370 and 2547-2561), so we don't need to track here to avoid double-counting
      
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
      
      // Check if this is a multi-wave battle (Island Raid)
      const isIslandRaid = gameId && opponents.length > 0 && (opponents[0].vaultHealth !== undefined || maxWaves > 1);
      const isMultiWaveBattle = maxWaves && maxWaves > 1;
      
      // For multi-wave battles (Island Raid), don't call onBattleEnd when a single enemy is defeated
      // Let the wave progression logic handle it - only call onBattleEnd when ALL waves are complete
      if (isIslandRaid || isMultiWaveBattle) {
        console.log('🏝️ [BattleEngine] Enemy defeated in multi-wave battle - NOT calling onBattleEnd. Wave progression will handle it.');
        // Just update the opponent state - the wave progression logic in IslandRaidBattle will handle the rest
        return;
      }
      
      // For single-wave battles or PvP, call onBattleEnd as normal
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
    console.log(`📝 [Player Move] Updating battle state with ${newLog.length} log entries. Last entry: ${newLog[newLog.length - 1]}`);
    console.log(`📝 [Player Move] Full battle log:`, newLog);
    setBattleState(prev => {
      const updatedState: BattleState = {
        ...prev,
        phase: mindforgeMode ? 'execution' : 'opponent_turn', // Keep in execution phase for Mindforge so animation plays
        battleLog: newLog,
        isPlayerTurn: mindforgeMode ? true : false,
        selectedMove: null, // Clear selected move but keep animation
        selectedTarget: null, // Clear selected target but keep animation
        // Keep currentAnimation and isAnimating so BattleAnimations component can display
      };
      console.log(`📝 [Player Move] Battle state updated. New log length: ${updatedState.battleLog.length}`);
      return updatedState;
    });
    
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
      const opponentName = opponent.name?.toLowerCase() || '';
      // Normalize opponent name by stripping trailing numbers (e.g., "Unpowered Zombie 1" -> "unpowered zombie")
      const normalizedOpponentName = opponentName.replace(/\s*\d+\s*$/, '').trim();
      
      console.log(`🔍 executeOpponentTurn: Looking for moves for ${opponent.name} (ID: ${opponentId}, Name: ${opponentName}, Normalized: ${normalizedOpponentName})`);
      console.log(`🔍 executeOpponentTurn: Available opponents in Firestore:`, cpuOpponentMoves.map((opp: any) => ({ 
        id: opp.id, 
        name: opp.name,
        nameLower: opp.name?.toLowerCase(),
        idLower: opp.id?.toLowerCase(),
        moveCount: opp.moves?.length || 0,
        moveNames: opp.moves?.map((m: any) => m.name) || []
      })));
      
      // Enhanced matching logic to find opponent in Firestore
      const opponentData = cpuOpponentMoves.find((opp: any) => {
        const oppId = opp.id?.toLowerCase() || '';
        const oppName = opp.name?.toLowerCase() || '';
        
        // Exact ID match
        if (oppId === opponentId) return true;
        
        // Exact name match
        if (oppName === opponentName) return true;
        
        // Normalized name match (for numbered enemies like "Unpowered Zombie 1")
        if (oppName === normalizedOpponentName) return true;
        
        // For zombies, match "Unpowered Zombie 1", "Zombie 1", etc. to "Unpowered Zombie" or "Zombie"
        if (normalizedOpponentName.includes('zombie') && !normalizedOpponentName.includes('powered') && !normalizedOpponentName.includes('captain')) {
          // Check multiple variations to ensure we catch all cases
          const nameMatches = oppName === 'unpowered zombie' || 
                             oppName === 'zombie' || 
                             normalizedOpponentName === oppName ||
                             normalizedOpponentName === oppName.trim() ||
                             (normalizedOpponentName.includes('zombie') && oppName.includes('zombie') && !oppName.includes('powered') && !oppName.includes('captain'));
          const idMatches = oppId === 'zombie';
          if (nameMatches || idMatches) return true;
        }
        
        // For powered zombies
        if (normalizedOpponentName.includes('powered zombie') && (oppName === 'powered zombie' || oppId === 'powered-zombie')) {
          return true;
        }
        
        // For zombie captain
        if (normalizedOpponentName.includes('zombie captain') && (oppName === 'zombie captain' || oppId === 'zombie-captain')) {
          return true;
        }
        
        // Master Guardian / Flame Keeper matching
        if (opp.name?.toLowerCase().includes('master guardian') && (opponent.name?.toLowerCase().includes('flame keeper') || opponent.name?.toLowerCase().includes('flame thrower'))) {
          return true;
        }
        if ((opp.name?.toLowerCase().includes('flame keeper') || opp.name?.toLowerCase().includes('flame thrower')) && opponent.name?.toLowerCase().includes('master guardian')) {
          return true;
        }
        
        return false;
      });
      
      if (opponentData) {
        console.log(`✅ executeOpponentTurn: Matched ${opponent.name} to opponent in Firestore:`, {
          id: opponentData.id,
          name: opponentData.name,
          moveCount: opponentData.moves?.length || 0,
          moveNames: opponentData.moves?.map((m: any) => m.name) || []
        });
      } else {
        console.log(`❌ executeOpponentTurn: No match found for ${opponent.name} (normalized: ${normalizedOpponentName})`);
        console.log(`🔍 executeOpponentTurn: Looking for: normalizedOpponentName="${normalizedOpponentName}", opponentName="${opponentName}", opponentId="${opponentId}"`);
      }
      
      if (opponentData && opponentData.moves && opponentData.moves.length > 0) {
        
        // Map moves to ensure all fields are properly formatted
        opponentMoves = opponentData.moves.map((move: any) => {
          // Support both damageRange (min/max) and baseDamage formats
          let baseDamage = move.baseDamage || 0;
          let damageRange = move.damageRange;
          
          // If damageRange exists, use it; otherwise create from baseDamage
          if (damageRange && damageRange.min !== undefined && damageRange.max !== undefined) {
            // Use damageRange as-is
            // Calculate average baseDamage from range if not provided
            if (!baseDamage) {
              baseDamage = Math.floor((damageRange.min + damageRange.max) / 2);
            }
          } else if (baseDamage > 0) {
            // Create damageRange from baseDamage
            damageRange = { min: baseDamage, max: baseDamage };
          }
          
          // CRITICAL: Preserve the exact move name from admin config
          const moveName = move.name || 'Unknown Move';
          
          // Log move name preservation for debugging
          if (!move.name) {
            console.warn(`⚠️ [Moveset Loaded] Move missing name field in executeOpponentTurn:`, { id: move.id, move });
          } else {
            console.debug(`✅ [Moveset Loaded] Move name preserved in executeOpponentTurn:`, { id: move.id, name: move.name });
          }
          
          return {
            id: move.id || moveName.toLowerCase().replace(/\s+/g, '-'),
            name: moveName, // CRITICAL: Use the exact name from admin config - NEVER apply getMoveNameSync to CPU moves
            baseDamage: baseDamage,
            level: move.level || 1,
            masteryLevel: move.masteryLevel || 1,
          type: move.type || 'attack',
            damageRange: damageRange,
          healingRange: move.healingRange,
          damageReduction: move.damageReduction,
          counterMove: move.counterMove,
            duration: move.duration,
            statusEffects: move.statusEffects || (move.statusEffect ? [move.statusEffect] : []),
            description: move.description || ''
          };
        });
        console.log(`✅ Loaded moves for ${opponent.name} from Firestore:`, opponentMoves.map((m: any) => `${m.name} (${m.damageRange ? `${m.damageRange.min}-${m.damageRange.max}` : m.baseDamage} damage)`));
        
        // CRITICAL: Log all move names to verify they're preserved
        console.debug(`[Moveset Loaded] Opponent: ${opponent.name} (executeOpponentTurn)`, opponentMoves.map((m: any) => ({ id: m.id, name: m.name })));
        
        // Assert that all moves have names
        opponentMoves.forEach((m: any) => {
          if (!m.name || m.name === 'Unknown Move') {
            console.warn(`⚠️ Move missing name in executeOpponentTurn:`, { id: m.id, move: m });
          }
        });
      } else {
        console.warn(`⚠️ No moves found in Firestore for ${opponent.name} (ID: ${opponentId}, Name: ${opponentName})`);
        console.log(`🔍 Available opponents in Firestore:`, cpuOpponentMoves.map((opp: any) => ({ id: opp.id, name: opp.name })));
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
    
    // CRITICAL: Log the selected move name to verify it's from Firestore
    console.log(`🎲 [CPU Move Selection - executeOpponentTurn] ${opponent.name} selected move: "${opponentMove.name}" (ID: ${opponentMove.id})`);
    if (!opponentMove.name || opponentMove.name === 'Unknown Move') {
      console.error(`❌ [CPU Move Selection - executeOpponentTurn] Selected move is missing name!`, opponentMove);
    }
    
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
    
    // Use formatted opponent name for battle log
    const formattedOpponentName = formatOpponentName(opponent.name);
    
    // Special handling for Hela's Ice Wall move
    if (opponent.id === 'hela' && opponentMove.name === 'Ice Wall') {
      // Ice Wall restores 5-10 shields for Hela
      const shieldRange = { min: 5, max: 10 };
      opponentShieldRestore = Math.floor(Math.random() * (shieldRange.max - shieldRange.min + 1)) + shieldRange.min;
      newLog.push(`🧊 ${formattedOpponentName} used ${opponentMove.name} and restored ${opponentShieldRestore} shields!`);
    } else if (opponentMove.type === 'heal' && healingAmount > 0) {
      // Phoenix Regeneration - heal the opponent
      opponentHealing = healingAmount;
      const maxHealth = opponent.maxPP || opponent.currentPP;
      const newHealth = Math.min(maxHealth, opponent.currentPP + opponentHealing);
      opponentHealing = newHealth - opponent.currentPP; // Actual healing applied (capped at max)
      newLog.push(`🔥 ${formattedOpponentName} used ${opponentMove.name} and restored ${opponentHealing} health!`);
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
      // Use formatted opponent name (e.g., "Unpowered Zombie | 1" instead of "Unpowered Zombie 1")
      const formattedOpponentName = formatOpponentName(opponent.name);
      const rangeInfo = damageResult?.isMaxDamage ? ' (MAX DAMAGE!)' : '';
      let cpuLogMessage = '';
      if (shieldDamage > 0 && ppStolen > 0) {
        cpuLogMessage = `⚔️ ${formattedOpponentName} attacked you with ${opponentMove.name} for ${totalDamage} damage (${shieldDamage} to shields, ${ppStolen} to vault health)${rangeInfo}!`;
      } else if (shieldDamage > 0) {
        cpuLogMessage = `⚔️ ${formattedOpponentName} attacked you with ${opponentMove.name} for ${shieldDamage} damage to shields${rangeInfo}!`;
      } else if (ppStolen > 0) {
        cpuLogMessage = `⚔️ ${formattedOpponentName} attacked you with ${opponentMove.name} for ${ppStolen} damage to vault health${rangeInfo}!`;
      } else {
        cpuLogMessage = `⚔️ ${formattedOpponentName} used ${opponentMove.name} on you${rangeInfo}!`;
      }
      newLog.push(cpuLogMessage);
      console.log(`📝 [CPU Move] Adding to battle log: ${cpuLogMessage}`);
      }
    } else {
      const formattedOpponentName = formatOpponentName(opponent.name);
      const cpuLogMessage = `⚔️ ${formattedOpponentName} used ${opponentMove.name}!`;
      newLog.push(cpuLogMessage);
      console.log(`📝 [CPU Move] Adding to battle log: ${cpuLogMessage}`);
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
    
    console.log(`📝 [CPU Move] Updating battle state with ${newLog.length} log entries. Last entry: ${newLog[newLog.length - 1]}`);
    console.log(`📝 [CPU Move] Full battle log:`, newLog);
    setBattleState(prev => {
      const updatedState: BattleState = {
        ...prev,
        phase: 'selection' as const,
        battleLog: newLog,
        isPlayerTurn: true,
        turnCount: prev.turnCount + 1,
        currentAnimation: null, // Ensure animation is cleared
        isAnimating: false // Ensure animation flag is cleared
      };
      console.log(`📝 [CPU Move] Battle state updated. New log length: ${updatedState.battleLog.length}`);
      return updatedState;
    });
    
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
    // Validate target ID exists in current opponents or allies
    // In single player mode, check single opponent. In multiplayer mode, check opponents array.
    const isValidTarget = isMultiplayer
      ? (opponents.some(opp => opp.id === targetId) || allies.some(ally => ally.id === targetId))
      : (opponent.id === targetId || opponents.some(opp => opp.id === targetId) || allies.some(ally => ally.id === targetId));
    
    if (!isValidTarget) {
      console.warn(`⚠️ [Target Select] Invalid target ID: ${targetId}. Available targets:`, {
        isMultiplayer,
        singleOpponent: !isMultiplayer ? { id: opponent.id, name: opponent.name } : null,
        opponents: opponents.map(opp => ({ id: opp.id, name: opp.name })),
        allies: allies.map(ally => ({ id: ally.id, name: ally.name }))
      });
      return; // Don't set invalid target
    }
    
    setBattleState(prev => {
      // In multiplayer mode, keep phase as 'selection' until turn order is calculated
      // This ensures moves can be stored properly before execution begins
      const newPhase = isMultiplayer && !prev.turnOrder ? 'selection' : 'execution';
      console.log(`🎯 [Target Select] Setting target ${targetId}, phase: ${newPhase} (multiplayer: ${isMultiplayer}, hasTurnOrder: ${!!prev.turnOrder})`);
      return {
        ...prev,
        selectedTarget: targetId,
        phase: newPhase
      };
    });
  };

  // Execute move when both move and target are selected
  // In multiplayer mode, don't execute immediately - wait for turn order calculation
  useEffect(() => {
    if (battleState.phase === 'execution' && battleState.selectedMove && battleState.selectedTarget) {
      // In multiplayer mode, moves are executed via turn order, not immediately
      if (isMultiplayer) {
        console.log('⏸️ [Move Execution] Multiplayer mode - move will be executed via turn order, not immediately');
        return;
      }
      executePlayerMove();
    }
  }, [battleState.phase, battleState.selectedMove, battleState.selectedTarget, executePlayerMove, isMultiplayer]);

  // Listen for external move selection events (for In Session mode)
  useEffect(() => {
    const handleExternalMoveSelect = (event: CustomEvent) => {
      const { move, targetId } = event.detail;
      if (move && targetId) {
        handleMoveSelect(move);
        // Small delay to ensure move is set before selecting target
        setTimeout(() => {
          handleTargetSelect(targetId);
        }, 100);
      }
    };

    window.addEventListener('inSessionMoveSelect', handleExternalMoveSelect as EventListener);
    return () => {
      window.removeEventListener('inSessionMoveSelect', handleExternalMoveSelect as EventListener);
    };
  }, [handleMoveSelect, handleTargetSelect]);

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

  // Handle artifact used (e.g., Health Potion ends turn)
  // Using an item from the bag counts as a move and ends the player's turn
  const handleArtifactUsed = useCallback(async () => {
    console.log('📦 [Artifact Used] Item used from bag - consuming move and ending turn');
    
    // Consume a move (same as using a regular move)
    if (onMoveConsumption) {
      try {
        const moveConsumed = await onMoveConsumption();
        if (!moveConsumed) {
          console.warn('⚠️ [Artifact Used] No moves available to consume');
          // Still end turn even if move consumption fails (item was used)
        }
      } catch (error) {
        console.error('❌ [Artifact Used] Failed to consume move:', error);
        // Still end turn even if move consumption fails (item was used)
      }
    }
    
    // End the player's turn - switch to opponent turn
    // In multiplayer mode, this will wait for other participants
    // In single player mode, this will immediately trigger opponent turn
    if (isMultiplayer && !isInSession) {
      // In multiplayer mode with turn order, just mark that player has acted
      // The turn order system will handle execution
      setBattleState(prev => ({
        ...prev,
        phase: 'selection',
        isPlayerTurn: false, // Player has used their action
        selectedMove: null,
        selectedTarget: null
      }));
    } else {
      // In single player or In Session mode, immediately end turn and trigger opponent
      let currentLog: string[] = [];
      setBattleState(prev => {
        const newLog = [...prev.battleLog];
        newLog.push('📦 Item used! Turn ended.');
        currentLog = newLog; // Capture log for executeOpponentTurn
        
        return {
          ...prev,
          phase: 'opponent_turn',
          isPlayerTurn: false,
          battleLog: newLog,
          selectedMove: null,
          selectedTarget: null,
          currentAnimation: null,
          isAnimating: false
        };
      });
      
      // Execute opponent turn after a delay (for single player mode)
      if (!isMultiplayer && opponent) {
        setTimeout(() => {
          executeOpponentTurn(currentLog, opponent, 1.0);
        }, 1000);
      }
    }
    
    // Call the original callback if provided
    if (onArtifactUsed) {
      onArtifactUsed();
    }
  }, [onMoveConsumption, isMultiplayer, isInSession, opponent, onArtifactUsed, executeOpponentTurn]);

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
      // Also check for Chapter 2 battles by gameId pattern (rr-candy, ch2-2-battle, chapter2-3, etc.)
      const isChapter2Battle = gameId && (
        gameId.includes('rr-candy') || 
        gameId.includes('ch2-') || 
        gameId.includes('chapter2-') ||
        gameId.includes('chapter-2')
      );
      
      // Check for Config candy choice - use Config background
      if ((isIslandRaid || isChapter2Battle) && candyChoice === 'config') {
        return '/images/Ch2-4_Config_BKG.png';
      }
      
      if (isIslandRaid || isChapter2Battle) return '/images/Island Raid BKG.png';
      
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
          onArtifactUsed={handleArtifactUsed}
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
          gameId={gameId}
          battleName={battleName}
          onInviteClick={onInviteClick}
          allowInvites={allowInvites}
        />
      ) : (
      <BattleArena
        onMoveSelect={handleMoveSelect}
        onTargetSelect={handleTargetSelect}
        onEscape={handleEscape}
        selectedMove={battleState.selectedMove}
        selectedTarget={battleState.selectedTarget}
        availableMoves={availableMoves}
        isInSession={isInSession}
        availableTargets={availableTargets}
        isPlayerTurn={battleState.isPlayerTurn}
        battleLog={battleState.battleLog}
          customBackground={getCustomBackground()}
        hideCenterPrompt={mindforgeMode} // Hide center prompt in Mindforge mode
          playerEffects={playerEffects}
          opponentEffects={opponentEffects}
          isTerraAwakened={isTerraAwakened}
        onArtifactUsed={handleArtifactUsed}
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

      {/* Defeat Overlay - Show when player health reaches 0 */}
      {battleState.phase === 'defeat' && !isPvP && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          animation: 'fadeIn 0.5s ease-in'
        }}>
          <div style={{
            background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
            color: 'white',
            padding: '2.5rem',
            borderRadius: '1rem',
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            border: '3px solid #fbbf24',
            maxWidth: '500px',
            animation: 'defeatPulse 2s infinite'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>💀</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem' }}>
              DEFEAT
            </div>
            <div style={{ fontSize: '1.1rem', opacity: 0.95, lineHeight: '1.6', marginBottom: '1.5rem' }}>
              {(() => {
                // Check if this is a Hela battle (opponent name contains "Hela" or "Ice Golem")
                const opponentName = opponent?.name?.toLowerCase() || '';
                const hasHelaOpponent = opponentName.includes('hela');
                const hasIceGolemOpponents = opponents?.some(opp => {
                  const oppName = opp.name?.toLowerCase() || '';
                  return oppName.includes('hela') || oppName.includes('ice golem');
                });
                const isHelaBattle = hasHelaOpponent || hasIceGolemOpponents;
                
                if (isHelaBattle) {
                  return "You were crushed by Hela's Overwhelming Might. Level up and try again.";
                } else {
                  // Generic defeat message for other battles
                  const defeatedBy = opponent?.name || opponents?.[0]?.name || 'your opponent';
                  return `You were defeated by ${defeatedBy}! Level up and try again.`;
                }
              })()}
            </div>
            <button
              onClick={() => {
                // Close the modal and end the battle
                onBattleEnd('defeat');
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '0.5rem',
                padding: '0.75rem 2rem',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginTop: '1rem'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              Continue
            </button>
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
          
          @keyframes defeatPulse {
            0%, 100% { transform: scale(1); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); }
            50% { transform: scale(1.02); box-shadow: 0 12px 40px rgba(220, 38, 38, 0.6); }
          }
        `}
      </style>
    </div>
  );
};

export default BattleEngine;
