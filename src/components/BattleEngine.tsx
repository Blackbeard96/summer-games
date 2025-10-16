import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { Move } from '../types/battle';
import { getMoveDamage, getMoveName } from '../utils/moveOverrides';
import { 
  calculateDamageRange, 
  calculateShieldBoostRange, 
  calculateHealingRange,
  rollDamage, 
  rollShieldBoost, 
  rollHealing 
} from '../utils/damageCalculator';
import { getLevelFromXP } from '../utils/leveling';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import BattleArena from './BattleArena';
import BattleAnimations from './BattleAnimations';

interface Opponent {
  id: string;
  name: string;
  currentPP: number;
  maxPP: number;
  shieldStrength: number;
  maxShieldStrength: number;
  level: number;
}

interface BattleEngineProps {
  onBattleEnd: (result: 'victory' | 'defeat' | 'escape') => void;
  onMoveConsumption?: () => Promise<boolean>;
  onExecuteVaultSiegeAttack?: (moveId: string, targetUserId: string) => Promise<{ success: boolean; message: string; ppStolen?: number; xpGained?: number; shieldDamage?: number; overshieldAbsorbed?: boolean } | undefined>;
  opponent?: Opponent;
}

interface BattleState {
  phase: 'selection' | 'execution' | 'opponent_turn' | 'victory' | 'defeat';
  selectedMove: Move | null;
  selectedTarget: string | null;
  battleLog: string[];
  turnCount: number;
  isPlayerTurn: boolean;
  currentAnimation: Move | null;
  isAnimating: boolean;
}


const BattleEngine: React.FC<BattleEngineProps> = ({ onBattleEnd, onMoveConsumption, onExecuteVaultSiegeAttack, opponent: propOpponent }) => {
  const { currentUser } = useAuth();
  const { vault, moves, updateVault } = useBattle();
  const [userLevel, setUserLevel] = useState(1);
  
  const [battleState, setBattleState] = useState<BattleState>({
    phase: 'selection',
    selectedMove: null,
    selectedTarget: null,
    battleLog: ['Welcome to the MST Battle Arena!', 'Select a move to begin your attack!'],
    turnCount: 1,
    isPlayerTurn: true,
    currentAnimation: null,
    isAnimating: false
  });

  const [opponent, setOpponent] = useState<Opponent>(propOpponent || {
    id: 'opponent_1',
    name: 'Rival Vault',
    currentPP: 500,
    maxPP: 500,
    shieldStrength: 100,
    maxShieldStrength: 100,
    level: 5
  });

  // Fetch user level
  useEffect(() => {
    const fetchUserLevel = async () => {
      if (!currentUser) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'students', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const calculatedLevel = getLevelFromXP(userData.xp || 0);
          console.log('BattleEngine: User data from Firestore:', userData);
          console.log('BattleEngine: User XP from Firestore:', userData.xp);
          console.log('BattleEngine: Calculated level from XP:', calculatedLevel);
          setUserLevel(calculatedLevel);
        }
      } catch (error) {
        console.error('Error fetching user level:', error);
      }
    };

    fetchUserLevel();
  }, [currentUser]);

  // Update opponent when prop changes (only on initial mount or when prop actually changes)
  useEffect(() => {
    if (propOpponent) {
      setOpponent(prev => {
        // Only update if the prop is actually different (prevent resetting during battle)
        if (prev.id !== propOpponent.id || prev.name !== propOpponent.name) {
          return propOpponent;
        }
        return prev;
      });
    }
  }, [propOpponent?.id, propOpponent?.name]);

  const availableMoves = moves.filter(move => move.unlocked && move.currentCooldown === 0);
  const availableTargets = [
    {
      id: opponent.id,
      name: opponent.name,
      avatar: '🏰',
      currentPP: opponent.currentPP,
      shieldStrength: opponent.shieldStrength,
      maxPP: opponent.maxPP,
      maxShieldStrength: opponent.maxShieldStrength
    }
  ];

  const executePlayerMove = useCallback(async () => {
    if (!battleState.selectedMove || !battleState.selectedTarget || !vault) return;

    const move = battleState.selectedMove;
    
    // Start animation
    setBattleState(prev => ({
      ...prev,
      currentAnimation: move,
      isAnimating: true
    }));
  }, [battleState.selectedMove, battleState.selectedTarget, vault]);

  const handleAnimationComplete = async () => {
    if (!battleState.selectedMove || !battleState.selectedTarget || !vault) return;

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
    
    // Add move execution to battle log
    const newLog = [...battleState.battleLog];
    const playerName = currentUser?.displayName || 'Player';
    
    // Use actual user level
    const playerLevel = userLevel;
    
    // Calculate move effects using new damage range system
    let damage = 0;
    let ppStolen = 0;
    let shieldDamage = 0;
    let playerShieldBoost = 0;
    let playerHealing = 0;
    
    // Get the overridden move name for battle log messages
    const overriddenMoveName = await getMoveName(move.name);
    
    // Offensive moves - use damage range system
    if (move.damage) {
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
      
      damage = damageResult.damage;
      shieldDamage = Math.min(damage, opponent.shieldStrength);
      const remainingDamage = Math.max(0, damage - opponent.shieldStrength);
      
      // Log attack with damage breakdown and range info
      const rangeInfo = damageResult.isMaxDamage ? ' (MAX DAMAGE!)' : '';
      if (shieldDamage > 0 && remainingDamage > 0) {
        newLog.push(`⚔️ ${playerName} attacked ${opponent.name} with ${overriddenMoveName} for ${damage} damage (${shieldDamage} to shields, ${remainingDamage} to PP)${rangeInfo}!`);
      } else if (shieldDamage > 0) {
        newLog.push(`⚔️ ${playerName} attacked ${opponent.name} with ${overriddenMoveName} for ${shieldDamage} damage to shields${rangeInfo}!`);
      } else if (remainingDamage > 0) {
        newLog.push(`⚔️ ${playerName} attacked ${opponent.name} with ${overriddenMoveName} for ${remainingDamage} damage to PP${rangeInfo}!`);
      } else {
        newLog.push(`⚔️ ${playerName} used ${overriddenMoveName} on ${opponent.name}${rangeInfo}!`);
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
      
      // PP steal is a portion of total damage
      ppStolen = Math.floor(damageResult.damage * 0.6); // 60% of damage becomes PP steal
      const rangeInfo = damageResult.isMaxDamage ? ' (MAX STEAL!)' : '';
      newLog.push(`💰 ${playerName} stole ${ppStolen} PP from ${opponent.name}${rangeInfo}!`);
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
    
    // Update opponent stats
    const newOpponent = { ...opponent };
    newOpponent.shieldStrength = Math.max(0, opponent.shieldStrength - shieldDamage);
    newOpponent.currentPP = Math.max(0, opponent.currentPP - (damage - shieldDamage) - ppStolen);
    
    // Update player vault
    const newVault = { ...vault };
    if (ppStolen > 0) {
      newVault.currentPP = Math.min(1000, vault.currentPP + ppStolen);
      newLog.push(`You gained ${ppStolen} PP!`);
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
      newVault.currentPP = Math.min(1000, vault.currentPP + playerHealing);
    }
    
    // Execute the actual vault siege attack in the database
    if (onExecuteVaultSiegeAttack && opponent && move) {
      try {
        console.log('🔥 Executing actual vault siege attack in database...');
        const attackResult = await onExecuteVaultSiegeAttack(move.id, opponent.id);
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
    
    // Check for victory
    if (newOpponent.currentPP <= 0) {
      newLog.push(`💀 ${opponent.name} has been defeated!`);
      newLog.push(`🎉 Victory! You have successfully raided ${opponent.name}'s vault!`);
      newLog.push(`🏆 ${opponent.name} defeated! Great job!`);
      setBattleState(prev => ({
        ...prev,
        phase: 'victory',
        battleLog: newLog,
        isPlayerTurn: false,
        currentAnimation: null,
        isAnimating: false
      }));
      setOpponent(newOpponent);
      return;
    }
    
    setOpponent(newOpponent);
    setBattleState(prev => ({
      ...prev,
      phase: 'opponent_turn',
      battleLog: newLog,
      isPlayerTurn: false,
      selectedMove: null,
      selectedTarget: null,
      currentAnimation: null,
      isAnimating: false
    }));
    
    // Start opponent turn after a delay
    setTimeout(() => {
      executeOpponentTurn(newLog, newOpponent);
    }, 2000);
  };

  const executeOpponentTurn = async (currentLog: string[], currentOpponent: any) => {
    if (!vault) return;
    
    const newLog = [...currentLog];
    // Opponent AI - different moves for different opponents
    let opponentMoves;
    
    if (opponent.id === 'hela') {
      // Hela's ice-based moves
      opponentMoves = [
        { name: 'Ice Shard', baseDamage: 7, level: 1, masteryLevel: 1, type: 'attack' },
        { name: 'Ice Wall', baseDamage: 0, level: 1, masteryLevel: 1, type: 'defense' }
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
    
    const opponentMove = opponentMoves[Math.floor(Math.random() * opponentMoves.length)];
    
    // Calculate opponent move effects using damage range system
    const damageRange = calculateDamageRange(opponentMove.baseDamage, opponentMove.level, opponentMove.masteryLevel);
    const damageResult = rollDamage(damageRange, opponent.level, opponentMove.level, opponentMove.masteryLevel);
    
    const totalDamage = damageResult.damage;
    let shieldDamage = 0;
    let ppStolen = 0;
    let opponentShieldRestore = 0;
    
    // Special handling for Hela's Ice Wall move
    if (opponent.id === 'hela' && opponentMove.name === 'Ice Wall') {
      // Ice Wall restores 5-10 shields for Hela
      const shieldRange = { min: 5, max: 10 };
      opponentShieldRestore = Math.floor(Math.random() * (shieldRange.max - shieldRange.min + 1)) + shieldRange.min;
      newLog.push(`🧊 ${opponent.name} used ${opponentMove.name} and restored ${opponentShieldRestore} shields!`);
    } else if (totalDamage > 0) {
      // Apply damage to shields first, then PP
      shieldDamage = Math.min(totalDamage, vault.shieldStrength);
      const remainingDamage = totalDamage - shieldDamage;
      
      if (remainingDamage > 0) {
        ppStolen = Math.min(remainingDamage, vault.currentPP);
      }
      
      // Log attack with damage breakdown and range info
      const rangeInfo = damageResult.isMaxDamage ? ' (MAX DAMAGE!)' : '';
      if (shieldDamage > 0 && ppStolen > 0) {
        newLog.push(`⚔️ ${opponent.name} attacked you with ${opponentMove.name} for ${totalDamage} damage (${shieldDamage} to shields, ${ppStolen} to PP)${rangeInfo}!`);
      } else if (shieldDamage > 0) {
        newLog.push(`⚔️ ${opponent.name} attacked you with ${opponentMove.name} for ${shieldDamage} damage to shields${rangeInfo}!`);
      } else if (ppStolen > 0) {
        newLog.push(`⚔️ ${opponent.name} attacked you with ${opponentMove.name} for ${ppStolen} damage to PP${rangeInfo}!`);
      } else {
        newLog.push(`⚔️ ${opponent.name} used ${opponentMove.name} on you${rangeInfo}!`);
      }
    } else {
      newLog.push(`⚔️ ${opponent.name} used ${opponentMove.name}!`);
    }
    
    // Update player vault
    const newShieldStrength = Math.max(0, vault.shieldStrength - shieldDamage);
    const newCurrentPP = Math.max(0, vault.currentPP - ppStolen);
    
    console.log('CPU Attack Debug:', {
      opponentMove: opponentMove.name,
      baseDamage: opponentMove.baseDamage,
      damageRange,
      damageResult,
      totalDamage,
      shieldDamage,
      ppStolen,
      oldShield: vault.shieldStrength,
      newShield: newShieldStrength,
      oldPP: vault.currentPP,
      newPP: newCurrentPP
    });
    
    // Update vault in context
    try {
      await updateVault({
        shieldStrength: newShieldStrength,
        currentPP: newCurrentPP
      });
      console.log('✅ Vault updated successfully after CPU attack');
    } catch (error) {
      console.error('❌ Failed to update vault after CPU attack:', error);
    }
    
    // Update opponent shields if Ice Wall was used
    if (opponentShieldRestore > 0) {
      setOpponent(prev => {
        const newOpponentShieldStrength = Math.min(prev.maxShieldStrength, prev.shieldStrength + opponentShieldRestore);
        console.log(`✅ ${opponent.name}'s shields restored: ${prev.shieldStrength} → ${newOpponentShieldStrength}`);
        return {
          ...prev,
          shieldStrength: newOpponentShieldStrength
        };
      });
    }
    
    // Check for defeat
    if (newCurrentPP <= 0) {
      newLog.push('💀 Your vault has been completely drained!');
      newLog.push(`💀 Defeat! ${opponent.name} has successfully raided your vault!`);
      setBattleState(prev => ({
        ...prev,
        phase: 'defeat',
        battleLog: newLog,
        isPlayerTurn: false
      }));
      return;
    }
    
    newLog.push(`🔄 Turn ${battleState.turnCount + 1} begins!`);
    
    // Update opponent state to reflect any damage from player's previous turn
    setOpponent(currentOpponent);
    
    setBattleState(prev => ({
      ...prev,
      phase: 'selection',
      battleLog: newLog,
      isPlayerTurn: true,
      turnCount: prev.turnCount + 1
    }));
  };

  const handleMoveSelect = (move: Move) => {
    setBattleState(prev => ({
      ...prev,
      selectedMove: move
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

  // Handle battle end
  useEffect(() => {
    if (battleState.phase === 'victory') {
      setTimeout(() => onBattleEnd('victory'), 3000);
    } else if (battleState.phase === 'defeat') {
      setTimeout(() => onBattleEnd('defeat'), 3000);
    }
  }, [battleState.phase, onBattleEnd]);

  // Handle escape
  const handleEscape = () => {
    // Add escape message to battle log
    setBattleState(prev => ({
      ...prev,
      battleLog: [...prev.battleLog, 'You chose to run away from the battle!']
    }));
    
    // End battle with escape result after a short delay
    setTimeout(() => {
      onBattleEnd('escape');
    }, 1000);
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

  return (
    <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
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
      />
      
      {/* Battle Status */}
      {/* Battle Log */}
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

      {/* Victory Overlay */}
      {battleState.phase === 'victory' && (
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

      {/* Battle Animations */}
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
