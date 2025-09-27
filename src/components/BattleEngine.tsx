import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { Move } from '../types/battle';
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


const BattleEngine: React.FC<BattleEngineProps> = ({ onBattleEnd, opponent: propOpponent }) => {
  const { currentUser } = useAuth();
  const { vault, moves } = useBattle();
  
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

  // Update opponent when prop changes
  useEffect(() => {
    if (propOpponent) {
      setOpponent(propOpponent);
    }
  }, [propOpponent]);

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

  const handleAnimationComplete = () => {
    if (!battleState.selectedMove || !battleState.selectedTarget || !vault) return;

    const move = battleState.selectedMove;
    
    // Add move execution to battle log
    const newLog = [...battleState.battleLog];
    newLog.push(`${currentUser?.displayName || 'Player'} used ${move.name}!`);
    
    // Calculate move effects
    let damage = 0;
    let ppStolen = 0;
    let shieldDamage = 0;
    
    if (move.damage) {
      damage = move.damage + (move.masteryLevel - 1) * 5; // Mastery bonus
      shieldDamage = Math.min(damage, opponent.shieldStrength);
      const remainingDamage = Math.max(0, damage - opponent.shieldStrength);
      
      if (shieldDamage > 0) {
        newLog.push(`${opponent.name}'s shield took ${shieldDamage} damage!`);
      }
      if (remainingDamage > 0) {
        newLog.push(`${opponent.name} took ${remainingDamage} damage!`);
      }
    }
    
    if (move.ppSteal) {
      ppStolen = move.ppSteal + (move.masteryLevel - 1) * 2; // Mastery bonus
      newLog.push(`${ppStolen} PP was stolen from ${opponent.name}!`);
    }
    
    // Update opponent stats
    const newOpponent = { ...opponent };
    newOpponent.shieldStrength = Math.max(0, opponent.shieldStrength - shieldDamage);
    newOpponent.currentPP = Math.max(0, opponent.currentPP - (damage - shieldDamage) - ppStolen);
    
    // Update player vault (add stolen PP)
    if (ppStolen > 0) {
      // This would need to be implemented in the battle context
      newLog.push(`You gained ${ppStolen} PP!`);
    }
    
    // Check for victory
    if (newOpponent.currentPP <= 0) {
      newLog.push(`${opponent.name} has been defeated!`);
      newLog.push('Victory! You have successfully raided the vault!');
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
      executeOpponentTurn();
    }, 2000);
  };

  const executeOpponentTurn = () => {
    if (!vault) return;
    
    const newLog = [...battleState.battleLog];
    // Simple opponent AI - random move selection
    const opponentMoves = [
      { name: 'Vault Breach', damage: 25, ppSteal: 0 },
      { name: 'PP Drain', damage: 10, ppSteal: 15 },
      { name: 'Shield Bash', damage: 20, ppSteal: 0 },
      { name: 'Energy Strike', damage: 15, ppSteal: 10 }
    ];
    
    const opponentMove = opponentMoves[Math.floor(Math.random() * opponentMoves.length)];
    
    newLog.push(`${opponent.name} used ${opponentMove.name}!`);
    
    // Calculate opponent move effects
    let damage = 0;
    let ppStolen = 0;
    let shieldDamage = 0;
    
    if (opponentMove.damage) {
      damage = opponentMove.damage;
      shieldDamage = Math.min(damage, vault.shieldStrength);
      const remainingDamage = Math.max(0, damage - vault.shieldStrength);
      
      if (shieldDamage > 0) {
        newLog.push(`Your shield took ${shieldDamage} damage!`);
      }
      if (remainingDamage > 0) {
        newLog.push(`You took ${remainingDamage} damage!`);
      }
    }
    
    if (opponentMove.ppSteal) {
      ppStolen = opponentMove.ppSteal;
      newLog.push(`${ppStolen} PP was stolen from you!`);
    }
    
    // Update player vault
    const newVault = { ...vault };
    newVault.shieldStrength = Math.max(0, vault.shieldStrength - shieldDamage);
    newVault.currentPP = Math.max(0, vault.currentPP - (damage - shieldDamage) - ppStolen);
    
    // Check for defeat
    if (newVault.currentPP <= 0) {
      newLog.push('Your vault has been completely drained!');
      newLog.push('Defeat! Your vault has been raided!');
      setBattleState(prev => ({
        ...prev,
        phase: 'defeat',
        battleLog: newLog,
        isPlayerTurn: false
      }));
      return;
    }
    
    // Update vault in context (this would need to be implemented)
    newLog.push(`Turn ${battleState.turnCount + 1} begins!`);
    
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
        selectedMove={battleState.selectedMove}
        selectedTarget={battleState.selectedTarget}
        availableMoves={availableMoves}
        availableTargets={availableTargets}
        isPlayerTurn={battleState.isPlayerTurn}
        battleLog={battleState.battleLog}
      />
      
      {/* Battle Status */}
      <div style={{
        marginTop: '1rem',
        padding: '1rem',
        background: 'rgba(255, 255, 255, 0.9)',
        borderRadius: '0.5rem',
        border: '2px solid #8B4513'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontWeight: 'bold' }}>Turn: {battleState.turnCount}</span>
            <span style={{ marginLeft: '1rem', color: battleState.isPlayerTurn ? '#10b981' : '#ef4444' }}>
              {battleState.isPlayerTurn ? 'Your Turn' : 'Opponent Turn'}
            </span>
          </div>
          <div>
            <span style={{ fontWeight: 'bold' }}>Phase: {battleState.phase.toUpperCase()}</span>
          </div>
        </div>
        
        {battleState.selectedMove && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
            Selected Move: <span style={{ fontWeight: 'bold' }}>{battleState.selectedMove.name}</span>
            {battleState.selectedTarget && (
              <span> → Target: <span style={{ fontWeight: 'bold' }}>{availableTargets.find(t => t.id === battleState.selectedTarget)?.name}</span></span>
            )}
          </div>
        )}
      </div>

      {/* Battle Animations */}
      {battleState.isAnimating && battleState.currentAnimation && (
        <BattleAnimations
          move={battleState.currentAnimation}
          isPlayerMove={battleState.isPlayerTurn}
          onAnimationComplete={handleAnimationComplete}
        />
      )}
    </div>
  );
};

export default BattleEngine;
