import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { Move, MOVE_DAMAGE_VALUES } from '../types/battle';

interface BattleArenaProps {
  onMoveSelect: (move: Move) => void;
  onTargetSelect: (targetId: string) => void;
  selectedMove: Move | null;
  selectedTarget: string | null;
  availableMoves: Move[];
  availableTargets: Array<{ id: string; name: string; avatar: string; currentPP: number; shieldStrength: number; maxPP?: number; maxShieldStrength?: number }>;
  isPlayerTurn: boolean;
  battleLog: string[];
}

const BattleArena: React.FC<BattleArenaProps> = ({
  onMoveSelect,
  onTargetSelect,
  selectedMove,
  selectedTarget,
  availableMoves,
  availableTargets,
  isPlayerTurn,
  battleLog
}) => {
  const { currentUser } = useAuth();
  const { vault } = useBattle();
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showTargetMenu, setShowTargetMenu] = useState(false);
  const [currentLogIndex, setCurrentLogIndex] = useState(0);

  // Auto-advance battle log
  useEffect(() => {
    if (battleLog.length > 0 && currentLogIndex < battleLog.length - 1) {
      const timer = setTimeout(() => {
        setCurrentLogIndex(prev => prev + 1);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [battleLog, currentLogIndex]);

  const handleMoveClick = (move: Move) => {
    onMoveSelect(move);
    setShowMoveMenu(false);
    if (move.targetType === 'single' || move.targetType === 'enemy') {
      setShowTargetMenu(true);
    } else if (move.targetType === 'self') {
      // For self-targeting moves, automatically select self as target
      onTargetSelect('self');
    }
  };

  const handleTargetClick = (targetId: string) => {
    onTargetSelect(targetId);
    setShowTargetMenu(false);
  };


  const getMoveTypeColor = (move: Move) => {
    const colors = {
      attack: '#ef4444',
      defense: '#3b82f6',
      utility: '#8b5cf6',
      support: '#10b981',
      control: '#f59e0b',
      mobility: '#06b6d4',
      stealth: '#6b7280',
      reveal: '#f97316',
      cleanse: '#84cc16'
    };
    return colors[move.type] || '#6b7280';
  };

  const getElementalIcon = (element?: string) => {
    const icons = {
      fire: '🔥',
      water: '💧',
      air: '💨',
      earth: '🌱',
      lightning: '⚡',
      light: '✨',
      shadow: '🌑',
      metal: '⚙️'
    };
    return icons[element as keyof typeof icons] || '⭐';
  };

  return (
    <div style={{
      width: '100%',
      height: '600px',
      background: 'linear-gradient(135deg, #87CEEB 0%, #98FB98 50%, #F0E68C 100%)',
      borderRadius: '1rem',
      position: 'relative',
      overflow: 'hidden',
      border: '3px solid #8B4513',
      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
    }}>
      {/* Battle Arena Background Elements */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: '2rem',
        opacity: 0.3
      }}>
        ⚔️ MST BATTLE ARENA ⚔️
      </div>

      {/* Player's Vault (Bottom Left) */}
      <div style={{
        position: 'absolute',
        bottom: '80px',
        left: '80px',
        width: '120px',
        height: '120px',
        background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
        borderRadius: '50%',
        border: '4px solid #92400e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '3rem',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        animation: isPlayerTurn ? 'pulse 1s infinite' : 'none'
      }}>
        🏦
      </div>

      {/* Player Status Box */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        width: '200px',
        background: 'rgba(255, 255, 255, 0.95)',
        border: '3px solid #8B4513',
        borderRadius: '0.5rem',
        padding: '0.75rem',
        fontFamily: 'monospace'
      }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
          {currentUser?.displayName || 'PLAYER'} VAULT
        </div>
        <div style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>
          Lv.{vault?.capacity ? Math.floor(vault.capacity / 100) + 1 : 1}
        </div>
        <div style={{ marginBottom: '0.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>PP</span>
          <div style={{
            width: '100%',
            height: '12px',
            background: '#e5e7eb',
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${vault ? (vault.currentPP / vault.capacity) * 100 : 0}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #dc2626 0%, #ef4444 100%)',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ fontSize: '0.75rem', textAlign: 'right', marginTop: '0.125rem' }}>
            {vault?.currentPP || 0}/{vault?.capacity || 100}
          </div>
        </div>
        <div>
          <span style={{ fontSize: '0.75rem', color: '#3b82f6' }}>SHIELD</span>
          <div style={{
            width: '100%',
            height: '12px',
            background: '#e5e7eb',
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${vault ? (vault.shieldStrength / vault.maxShieldStrength) * 100 : 0}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ fontSize: '0.75rem', textAlign: 'right', marginTop: '0.125rem' }}>
            {vault?.shieldStrength || 0}/{vault?.maxShieldStrength || 100}
          </div>
        </div>
      </div>

      {/* Opponent Vault (Top Right) - Always visible */}
      {availableTargets.length > 0 && (
        <>
          <div style={{
            position: 'absolute',
            top: '80px',
            right: '80px',
            width: '120px',
            height: '120px',
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            borderRadius: '50%',
            border: '4px solid #991b1b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '3rem',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
            animation: !isPlayerTurn ? 'pulse 1s infinite' : 'none'
          }}>
            🏰
          </div>

          {/* Opponent Status Box */}
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            width: '200px',
            background: 'rgba(255, 255, 255, 0.95)',
            border: '3px solid #8B4513',
            borderRadius: '0.5rem',
            padding: '0.75rem',
            fontFamily: 'monospace'
          }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>
              {availableTargets[0]?.name || 'OPPONENT'} VAULT
            </div>
            <div style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>
              Lv.{Math.floor((availableTargets[0]?.currentPP || 0) / 100) + 1}
            </div>
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#dc2626' }}>PP</span>
              <div style={{
                width: '100%',
                height: '12px',
                background: '#e5e7eb',
                borderRadius: '6px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${availableTargets[0] ? (availableTargets[0].currentPP / (availableTargets[0].maxPP || 1000)) * 100 : 0}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #dc2626 0%, #ef4444 100%)',
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <div style={{ fontSize: '0.75rem', textAlign: 'right', marginTop: '0.125rem' }}>
                {availableTargets[0]?.currentPP || 0}/{availableTargets[0]?.maxPP || 1000}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#3b82f6' }}>SHIELD</span>
              <div style={{
                width: '100%',
                height: '12px',
                background: '#e5e7eb',
                borderRadius: '6px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${availableTargets[0] ? (availableTargets[0].shieldStrength / (availableTargets[0].maxShieldStrength || 100)) * 100 : 0}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <div style={{ fontSize: '0.75rem', textAlign: 'right', marginTop: '0.125rem' }}>
                {availableTargets[0]?.shieldStrength || 0}/{availableTargets[0]?.maxShieldStrength || 100}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Battle Log Display */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '1rem',
        borderRadius: '0.5rem',
        maxWidth: '400px',
        textAlign: 'center',
        fontSize: '0.875rem',
        fontFamily: 'monospace',
        border: '2px solid #fbbf24'
      }}>
        {battleLog[currentLogIndex] || 'Select a move to begin battle!'}
      </div>

      {/* Move Selection Menu */}
      {showMoveMenu && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          width: '300px',
          background: 'rgba(255, 255, 255, 0.95)',
          border: '3px solid #8B4513',
          borderRadius: '0.5rem',
          padding: '1rem',
          maxHeight: '300px',
          overflowY: 'auto'
        }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem', textAlign: 'center' }}>
            SELECT MOVE
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {availableMoves.map((move, index) => (
              <button
                key={move.id}
                onClick={() => handleMoveClick(move)}
                style={{
                  background: getMoveTypeColor(move),
                  color: 'white',
                  border: '2px solid #8B4513',
                  borderRadius: '0.25rem',
                  padding: '0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.25rem',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  {getElementalIcon(move.elementalAffinity)}
                  <span>{move.name}</span>
                </div>
                <div style={{ fontSize: '0.625rem', opacity: 0.8 }}>
                  {move.type.toUpperCase()}
                </div>
                {(() => {
                  const moveDamage = MOVE_DAMAGE_VALUES[move.name];
                  console.log('BattleArena: Move:', move.name, 'Damage lookup:', moveDamage, 'Move object:', move);
                  
                  // Show damage for offensive moves
                  if (moveDamage && moveDamage.damage > 0) {
                    console.log('BattleArena: Rendering damage for', move.name, ':', moveDamage.damage);
                    return (
                      <div style={{ 
                        fontSize: '0.625rem', 
                        color: '#ef4444', 
                        fontWeight: 'bold',
                        backgroundColor: 'rgba(255,255,255,0.8)',
                        padding: '2px 4px',
                        borderRadius: '4px',
                        marginTop: '2px'
                      }}>
                        Damage: {moveDamage.damage}
                      </div>
                    );
                  }
                  
                  // Show shield boost for defensive moves
                  if (move.shieldBoost && move.shieldBoost > 0) {
                    console.log('BattleArena: Rendering shield boost for', move.name, ':', move.shieldBoost);
                    return (
                      <div style={{ 
                        fontSize: '0.625rem', 
                        color: '#3b82f6', 
                        fontWeight: 'bold',
                        backgroundColor: 'rgba(255,255,255,0.8)',
                        padding: '2px 4px',
                        borderRadius: '4px',
                        marginTop: '2px'
                      }}>
                        Shield: +{move.shieldBoost}
                      </div>
                    );
                  }
                  
                  // Show healing for support moves
                  if (move.healing && move.healing > 0) {
                    console.log('BattleArena: Rendering healing for', move.name, ':', move.healing);
                    return (
                      <div style={{ 
                        fontSize: '0.625rem', 
                        color: '#10b981', 
                        fontWeight: 'bold',
                        backgroundColor: 'rgba(255,255,255,0.8)',
                        padding: '2px 4px',
                        borderRadius: '4px',
                        marginTop: '2px'
                      }}>
                        Heal: +{move.healing}
                      </div>
                    );
                  }
                  
                  console.log('BattleArena: No effect to render for', move.name);
                  return null;
                })()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Target Selection Menu */}
      {showTargetMenu && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '400px',
          background: 'rgba(255, 255, 255, 0.95)',
          border: '3px solid #8B4513',
          borderRadius: '0.5rem',
          padding: '1rem',
          maxHeight: '400px',
          overflowY: 'auto'
        }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.5rem', textAlign: 'center' }}>
            SELECT TARGET
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {availableTargets.map((target) => (
              <button
                key={target.id}
                onClick={() => handleTargetClick(target.id)}
                style={{
                  background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                  border: '2px solid #8B4513',
                  borderRadius: '0.25rem',
                  padding: '0.75rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)';
                  e.currentTarget.style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <div style={{ fontSize: '1.5rem' }}>🏦</div>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>
                    {target.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    PP: {target.currentPP} | Shield: {target.shieldStrength}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {!showMoveMenu && !showTargetMenu && isPlayerTurn && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          right: '20px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.5rem',
          width: '200px'
        }}>
          <button
            onClick={() => setShowMoveMenu(true)}
            style={{
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              color: 'white',
              border: '3px solid #8B4513',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            ⚔️ FIGHT
          </button>
          <button
            onClick={() => {/* TODO: Implement bag/items */}}
            style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: 'white',
              border: '3px solid #8B4513',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            🎒 BAG
          </button>
          <button
            onClick={() => {/* TODO: Implement vault management */}}
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              border: '3px solid #8B4513',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            🏦 VAULT
          </button>
          <button
            onClick={() => {/* TODO: Implement run/escape */}}
            style={{
              background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
              color: 'white',
              border: '3px solid #8B4513',
              borderRadius: '0.5rem',
              padding: '0.75rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            🏃 RUN
          </button>
        </div>
      )}


      {/* CSS Animations */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
          }
        `}
      </style>
    </div>
  );
};

export default BattleArena;
