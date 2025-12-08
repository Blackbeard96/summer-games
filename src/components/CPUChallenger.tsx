import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { Move, ActionCard } from '../types/battle';
import { trackMoveUsage } from '../utils/manifestTracking';
import { getMoveNameSync } from '../utils/moveOverrides';
import { getEffectiveMasteryLevel, getArtifactDamageMultiplier, getElementalRingLevel } from '../utils/artifactUtils';
import { calculateDamageRange, rollDamage } from '../utils/damageCalculator';
import { updateChallengeProgressByType } from '../utils/dailyChallengeTracker';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface CPUChallengerProps {
  isOpen: boolean;
  onBattleComplete: (victory: boolean, xpGained: number, ppGained: number) => void;
  onClose: () => void;
}

interface CPUStats {
  name: string;
  health: number;
  maxHealth: number;
  shieldStrength: number;
  maxShieldStrength: number;
  powerPoints: number;
  moves: Move[];
  actionCards: ActionCard[];
}

const CPUChallenger: React.FC<CPUChallengerProps> = ({ isOpen, onBattleComplete, onClose }) => {
  const { currentUser } = useAuth();
  const { moves, actionCards, vault } = useBattle();
  
  const [battleState, setBattleState] = useState<'preparing' | 'active' | 'completed'>('preparing');
  const [currentTurn, setCurrentTurn] = useState<'player' | 'cpu'>('player');
  const [battleLog, setBattleLog] = useState<string[]>([]);
  const [selectedMove, setSelectedMove] = useState<Move | null>(null);
  const [selectedActionCard, setSelectedActionCard] = useState<ActionCard | null>(null);
  
  // CPU Stats - Training Dummy
  const [cpuStats, setCpuStats] = useState<CPUStats>({
    name: 'Training Dummy',
    health: 100,
    maxHealth: 100,
    shieldStrength: 30,
    maxShieldStrength: 30,
    powerPoints: 50,
    moves: [],
    actionCards: []
  });
  
  // Player Stats
  const [playerStats, setPlayerStats] = useState({
    health: 100,
    maxHealth: 100,
    shieldStrength: vault?.shieldStrength || 50,
    maxShieldStrength: vault?.maxShieldStrength || 50,
    powerPoints: vault?.currentPP || 0
  });

  // Initialize CPU with basic moves
  useEffect(() => {
    const cpuMoves: Move[] = [
      {
        id: 'cpu-basic-attack',
        name: 'Basic Strike',
        description: 'A simple training attack',
        category: 'system',
        type: 'attack',
        level: 1,
        cost: 1,
        damage: 8,
        ppSteal: 0,
        cooldown: 1,
        currentCooldown: 0,
        unlocked: true,
        masteryLevel: 1,
        targetType: 'single'
      },
      {
        id: 'cpu-shield-bash',
        name: 'Shield Bash',
        description: 'A defensive counter-attack',
        category: 'system',
        type: 'defense',
        level: 1,
        cost: 1,
        damage: 5,
        ppSteal: 0,
        shieldBoost: 10,
        cooldown: 2,
        currentCooldown: 0,
        unlocked: true,
        masteryLevel: 1,
        targetType: 'single'
      }
    ];
    
    setCpuStats(prev => ({
      ...prev,
      moves: cpuMoves
    }));
  }, []);

  // Early return after all hooks
  if (!isOpen) {
    return null;
  }

  // Get player's unlocked moves
  const playerMoves = moves.filter(move => move.unlocked);
  const playerCards = actionCards.filter(card => card.unlocked);

  const addToBattleLog = (message: string) => {
    setBattleLog(prev => [...prev, message]);
  };

  const executePlayerMove = async () => {
    if (!selectedMove || !currentUser) return;
    
    // Track move usage for manifest progress
    const originalMoveName = selectedMove.name;
    const moveName = getMoveNameSync(selectedMove.name) || selectedMove.name;
    console.log(`[CPUChallenger] Tracking move usage - Original: "${originalMoveName}", Resolved: "${moveName}"`);
    
    // Track daily challenge: Use Elemental Move
    if (selectedMove.category === 'elemental' && currentUser) {
      updateChallengeProgressByType(currentUser.uid, 'use_elemental_move', 1).catch(err => 
        console.error('Error updating daily challenge progress:', err)
      );
    }
    
    if (currentUser.uid) {
      trackMoveUsage(currentUser.uid, moveName).catch(err => {
        console.error('[CPUChallenger] Error tracking move usage:', err);
      });
    } else {
      console.warn('[CPUChallenger] No currentUser.uid available for tracking');
    }
    
    addToBattleLog(`You used ${selectedMove.name}!`);
    
    // Get student data for equipped artifacts and player level
    const studentRef = doc(db, 'students', currentUser.uid);
    const studentDoc = await getDoc(studentRef);
    const studentData = studentDoc.exists() ? studentDoc.data() : null;
    const equippedArtifacts = studentData?.equippedArtifacts || null;
    const playerLevel = studentData?.level || 1;
    
    // Get effective mastery level (includes Blaze Ring bonus for elemental moves)
    const effectiveMasteryLevel = getEffectiveMasteryLevel(selectedMove, equippedArtifacts);
    
    let damage = 0;
    let shieldDamage = 0;
    let ppStolen = 0;
    
    // Calculate damage using proper damage calculation system with effective mastery level
    if (selectedMove.damage && selectedMove.damage > 0) {
      const baseDamage = selectedMove.damage;
      const damageRange = calculateDamageRange(baseDamage, selectedMove.level, effectiveMasteryLevel);
      const damageResult = rollDamage(damageRange, playerLevel, selectedMove.level, effectiveMasteryLevel);
      damage = damageResult.damage;
      
      // Apply artifact damage multiplier for elemental moves
      if (selectedMove.category === 'elemental' && equippedArtifacts) {
        const ringLevel = getElementalRingLevel(equippedArtifacts);
        const artifactMultiplier = getArtifactDamageMultiplier(ringLevel);
        if (artifactMultiplier > 1.0) {
          damage = Math.floor(damage * artifactMultiplier);
          addToBattleLog(`💍 Elemental Ring (Level ${ringLevel}) boosts ${selectedMove.name} damage by ${Math.round((artifactMultiplier - 1) * 100)}%!`);
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
            addToBattleLog(`🔥 Blaze Ring: ${selectedMove.name} effective mastery level ${effectiveMasteryLevel} (base: ${selectedMove.masteryLevel})`);
            break;
          }
          if ((ring.id === 'terra-ring' || (ring.name && ring.name.includes('Terra Ring'))) && moveElement === 'earth') {
            addToBattleLog(`🌍 Terra Ring: ${selectedMove.name} effective mastery level ${effectiveMasteryLevel} (base: ${selectedMove.masteryLevel})`);
            break;
          }
          if ((ring.id === 'aqua-ring' || (ring.name && ring.name.includes('Aqua Ring'))) && moveElement === 'water') {
            addToBattleLog(`💧 Aqua Ring: ${selectedMove.name} effective mastery level ${effectiveMasteryLevel} (base: ${selectedMove.masteryLevel})`);
            break;
          }
          if ((ring.id === 'air-ring' || (ring.name && ring.name.includes('Air Ring'))) && moveElement === 'air') {
            addToBattleLog(`💨 Air Ring: ${selectedMove.name} effective mastery level ${effectiveMasteryLevel} (base: ${selectedMove.masteryLevel})`);
            break;
          }
        }
      }
      
      shieldDamage = Math.min(damage, cpuStats.shieldStrength);
      const remainingDamage = Math.max(0, damage - cpuStats.shieldStrength);
      
      if (remainingDamage > 0) {
        ppStolen = Math.min(selectedMove.ppSteal || 0, cpuStats.powerPoints);
      }
    }
    
    // Apply damage to CPU
    const newCpuShield = Math.max(0, cpuStats.shieldStrength - shieldDamage);
    const newCpuHealth = Math.max(0, cpuStats.health - Math.max(0, damage - cpuStats.shieldStrength));
    const newCpuPP = Math.max(0, cpuStats.powerPoints - ppStolen);
    
    setCpuStats(prev => ({
      ...prev,
      shieldStrength: newCpuShield,
      health: newCpuHealth,
      powerPoints: newCpuPP
    }));
    
    // Add stolen PP to player
    if (ppStolen > 0) {
      setPlayerStats(prev => ({
        ...prev,
        powerPoints: prev.powerPoints + ppStolen
      }));
      addToBattleLog(`Stole ${ppStolen} PP from the training dummy!`);
    }
    
    if (shieldDamage > 0) {
      addToBattleLog(`Dealt ${shieldDamage} shield damage!`);
    }
    
    if (newCpuHealth <= 0) {
      addToBattleLog('Training dummy defeated!');
      setBattleState('completed');
      onBattleComplete(true, 25, 15); // XP and PP rewards
      return;
    }
    
    // CPU's turn
    setCurrentTurn('cpu');
    setTimeout(() => executeCPUMove(), 1500);
  };

  const executeCPUMove = () => {
    const availableMoves = cpuStats.moves.filter(move => move.currentCooldown === 0);
    if (availableMoves.length === 0) {
      addToBattleLog('Training dummy is recovering...');
      setCurrentTurn('player');
      return;
    }
    
    const randomMove = availableMoves[Math.floor(Math.random() * availableMoves.length)];
    addToBattleLog(`Training dummy used ${randomMove.name}!`);
    
    let damage = 0;
    let shieldDamage = 0;
    
    if (randomMove.damage) {
      damage = randomMove.damage;
      shieldDamage = Math.min(damage, playerStats.shieldStrength);
    }
    
    // Apply damage to player
    const newPlayerShield = Math.max(0, playerStats.shieldStrength - shieldDamage);
    const newPlayerHealth = Math.max(0, playerStats.health - Math.max(0, damage - playerStats.shieldStrength));
    
    setPlayerStats(prev => ({
      ...prev,
      shieldStrength: newPlayerShield,
      health: newPlayerHealth
    }));
    
    if (shieldDamage > 0) {
      addToBattleLog(`Dealt ${shieldDamage} shield damage to you!`);
    }
    
    if (newPlayerHealth <= 0) {
      addToBattleLog('You were defeated!');
      setBattleState('completed');
      onBattleComplete(false, 0, 0);
      return;
    }
    
    // Update move cooldowns
    setCpuStats(prev => ({
      ...prev,
      moves: prev.moves.map(move => ({
        ...move,
        currentCooldown: move.id === randomMove.id ? move.cooldown : Math.max(0, move.currentCooldown - 1)
      }))
    }));
    
    setCurrentTurn('player');
  };

  const startBattle = () => {
    setBattleState('active');
    addToBattleLog('Battle begins! You face the Training Dummy.');
    addToBattleLog('Use your Power Card moves to defeat it!');
  };

  if (battleState === 'preparing') {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto'
        }}>
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 'bold', 
            marginBottom: '1rem',
            textAlign: 'center',
            color: '#1f2937'
          }}>
            ⚔️ Test Your Awakened Abilities
          </h2>
          
          <div style={{
            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            border: '2px solid #f59e0b',
            borderRadius: '0.75rem',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#92400e' }}>
              🎯 Training Dummy Challenge
            </h3>
            <p style={{ color: '#92400e', fontSize: '0.875rem', lineHeight: '1.5' }}>
              Face off against a training dummy to test your awakened abilities. Use your Power Card moves 
              to defeat it and prove your readiness for the challenges ahead!
            </p>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{
              background: '#f0fdf4',
              border: '1px solid #22c55e',
              borderRadius: '0.5rem',
              padding: '1rem'
            }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#166534' }}>
                Your Stats
              </h4>
              <div style={{ fontSize: '0.875rem', color: '#166534' }}>
                <div>Health: {playerStats.health}/{playerStats.maxHealth}</div>
                <div>Shields: {playerStats.shieldStrength}/{playerStats.maxShieldStrength}</div>
                <div>Power Points: {playerStats.powerPoints}</div>
                <div>Available Moves: {playerMoves.length}</div>
              </div>
            </div>
            
            <div style={{
              background: '#fef2f2',
              border: '1px solid #ef4444',
              borderRadius: '0.5rem',
              padding: '1rem'
            }}>
              <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#dc2626' }}>
                Training Dummy
              </h4>
              <div style={{ fontSize: '0.875rem', color: '#dc2626' }}>
                <div>Health: {cpuStats.health}/{cpuStats.maxHealth}</div>
                <div>Shields: {cpuStats.shieldStrength}/{cpuStats.maxShieldStrength}</div>
                <div>Power Points: {cpuStats.powerPoints}</div>
                <div>Moves: Basic Strike, Shield Bash</div>
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button
              onClick={startBattle}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              ⚔️ Start Battle
            </button>
            
            <button
              onClick={onClose}
              style={{
                background: '#6b7280',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (battleState === 'completed') {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '500px',
          width: '90%',
          textAlign: 'center'
        }}>
          <h2 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 'bold', 
            marginBottom: '1rem',
            color: '#1f2937'
          }}>
            🎉 Battle Complete!
          </h2>
          
          <div style={{
            background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
            border: '2px solid #22c55e',
            borderRadius: '0.75rem',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <p style={{ color: '#166534', fontSize: '1rem', fontWeight: 'bold' }}>
              You have successfully tested your awakened abilities!
            </p>
            <p style={{ color: '#166534', fontSize: '0.875rem', marginTop: '0.5rem' }}>
              Challenge completed. You are ready for the trials ahead.
            </p>
          </div>
          
          <button
            onClick={onClose}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '1rem',
        padding: '1.5rem',
        maxWidth: '800px',
        width: '90%',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>
            ⚔️ Battle: Training Dummy
          </h2>
          <div style={{ 
            background: currentTurn === 'player' ? '#10b981' : '#ef4444',
            color: 'white',
            padding: '0.25rem 0.75rem',
            borderRadius: '1rem',
            fontSize: '0.875rem',
            fontWeight: 'bold'
          }}>
            {currentTurn === 'player' ? 'Your Turn' : 'CPU Turn'}
          </div>
        </div>
        
        {/* Battle Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{
            background: '#f0fdf4',
            border: '1px solid #22c55e',
            borderRadius: '0.5rem',
            padding: '1rem'
          }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#166534' }}>
              You
            </h4>
            <div style={{ fontSize: '0.875rem', color: '#166534' }}>
              <div>Health: {playerStats.health}/{playerStats.maxHealth}</div>
              <div>Shields: {playerStats.shieldStrength}/{playerStats.maxShieldStrength}</div>
              <div>Power Points: {playerStats.powerPoints}</div>
            </div>
          </div>
          
          <div style={{
            background: '#fef2f2',
            border: '1px solid #ef4444',
            borderRadius: '0.5rem',
            padding: '1rem'
          }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#dc2626' }}>
              Training Dummy
            </h4>
            <div style={{ fontSize: '0.875rem', color: '#dc2626' }}>
              <div>Health: {cpuStats.health}/{cpuStats.maxHealth}</div>
              <div>Shields: {cpuStats.shieldStrength}/{cpuStats.maxShieldStrength}</div>
              <div>Power Points: {cpuStats.powerPoints}</div>
            </div>
          </div>
        </div>
        
        {/* Battle Log */}
        <div style={{
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '0.5rem',
          padding: '1rem',
          marginBottom: '1rem',
          maxHeight: '200px',
          overflow: 'auto'
        }}>
          <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#374151' }}>
            Battle Log
          </h4>
          {battleLog.map((log, index) => (
            <div key={index} style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              {log}
            </div>
          ))}
        </div>
        
        {/* Player Moves */}
        {currentTurn === 'player' && (
          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#374151' }}>
              Select Your Move
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
              {playerMoves.map(move => (
                <button
                  key={move.id}
                  onClick={() => setSelectedMove(move)}
                  style={{
                    background: selectedMove?.id === move.id ? '#3b82f6' : '#f3f4f6',
                    color: selectedMove?.id === move.id ? 'white' : '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    padding: '0.75rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>{move.name} [Level {move.masteryLevel}]</div>
                  <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>{move.description}</div>
                  {(() => {
                    // Use the move's actual damage if it exists (from upgrades), which already includes boosts
                    const moveDamage = move.damage && move.damage > 0 ? move.damage : 0;
                    const totalDamage = moveDamage + (move.ppSteal || 0);
                    return totalDamage > 0 && (
                      <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Damage: {totalDamage}</div>
                    );
                  })()}
                </button>
              ))}
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={executePlayerMove}
                disabled={!selectedMove}
                style={{
                  background: selectedMove ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: selectedMove ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s'
                }}
              >
                Execute Move
              </button>
            </div>
          </div>
        )}
        
        {currentTurn === 'cpu' && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '1.125rem', color: '#6b7280' }}>
              Training dummy is thinking...
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CPUChallenger;
