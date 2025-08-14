import React from 'react';
import { Move, MOVE_DAMAGE_VALUES } from '../types/battle';

interface MovesDisplayProps {
  moves: Move[];
  movesRemaining: number;
  offlineMovesRemaining: number;
  maxOfflineMoves: number;
  onUpgradeMove: (moveId: string) => void;
  onUnlockElementalMoves?: (elementalAffinity: string) => void;
  onForceUnlockAllMoves?: () => void;
  onResetMovesWithElementFilter?: () => void;
  onApplyElementFilterToExistingMoves?: () => void;
  onForceMigration?: () => void;
  userElement?: string;
}

const MovesDisplay: React.FC<MovesDisplayProps> = ({ 
  moves, 
  movesRemaining, 
  offlineMovesRemaining, 
  maxOfflineMoves, 
  onUpgradeMove,
  onUnlockElementalMoves,
  onForceUnlockAllMoves,
  onResetMovesWithElementFilter,
  onApplyElementFilterToExistingMoves,
  onForceMigration,
  userElement
}) => {
  console.log('MovesDisplay: movesRemaining:', movesRemaining, 'offlineMovesRemaining:', offlineMovesRemaining);
  console.log('MovesDisplay: Total moves loaded:', moves.length);
  console.log('MovesDisplay: All moves:', moves.map(m => ({ name: m.name, category: m.category, unlocked: m.unlocked })));

  // Filter moves by category and unlocked status
  const manifestMoves = moves.filter(move => move.category === 'manifest' && move.unlocked);
  const elementalMoves = moves.filter(move => move.category === 'elemental' && move.unlocked);
  const systemMoves = moves.filter(move => move.category === 'system' && move.unlocked);
  
  console.log('MovesDisplay: Filtered moves - Manifest:', manifestMoves.length, 'Elemental:', elementalMoves.length, 'System:', systemMoves.length);

  const getMasteryLabel = (level: number) => {
    switch (level) {
      case 1: return 'Novice';
      case 2: return 'Apprentice';
      case 3: return 'Adept';
      case 4: return 'Master';
      case 5: return 'Grandmaster';
      default: return 'Unknown';
    }
  };

  const getMasteryColor = (level: number) => {
    switch (level) {
      case 1: return '#6b7280';
      case 2: return '#059669';
      case 3: return '#2563eb';
      case 4: return '#7c3aed';
      case 5: return '#dc2626';
      default: return '#6b7280';
    }
  };

  const getElementalColor = (affinity: string) => {
    switch (affinity) {
      case 'fire': return '#dc2626';
      case 'water': return '#2563eb';
      case 'air': return '#7c3aed';
      case 'earth': return '#059669';
      case 'lightning': return '#f59e0b';
      case 'light': return '#fbbf24';
      case 'shadow': return '#6b7280';
      case 'metal': return '#9ca3af';
      default: return '#6b7280';
    }
  };

  const getManifestColor = (manifestType: string) => {
    switch (manifestType) {
      case 'reading': return '#8B5CF6';
      case 'writing': return '#3B82F6';
      case 'drawing': return '#EC4899';
      case 'athletics': return '#10B981';
      case 'singing': return '#F59E0B';
      case 'gaming': return '#EF4444';
      case 'observation': return '#6366F1';
      case 'empathy': return '#8B5CF6';
      case 'creating': return '#F97316';
      case 'cooking': return '#84CC16';
      default: return '#6b7280';
    }
  };

  const getCooldownStatus = (move: Move) => {
    // For manifest and elemental moves, check battle moves remaining
    if (move.category === 'manifest' || move.category === 'elemental') {
      if (movesRemaining <= 0) {
        return {
          status: 'no_moves',
          text: `No battle moves remaining (${movesRemaining}/${movesRemaining + 1})`,
          color: '#9ca3af'
        };
      }
    }
    
    // For system moves, check offline moves remaining
    if (move.category === 'system') {
      if (offlineMovesRemaining <= 0) {
        return {
          status: 'no_moves',
          text: `No offline moves remaining (${offlineMovesRemaining}/${maxOfflineMoves})`,
          color: '#9ca3af'
        };
      }
    }
    
    if (move.currentCooldown > 0) {
      return {
        status: 'cooldown',
        text: `${move.currentCooldown} turns remaining`,
        color: '#dc2626'
      };
    }
    
    // Show available moves count for ready moves
    if (move.category === 'system') {
      return {
        status: 'ready',
        text: `Ready to use (${offlineMovesRemaining} offline moves left)`,
        color: '#059669'
      };
    } else {
      return {
        status: 'ready',
        text: `Ready to use (${movesRemaining} battle moves left)`,
        color: '#059669'
      };
    }
  };

  const getUpgradeCost = (currentLevel: number) => {
    switch (currentLevel) {
      case 1: return 50;
      case 2: return 100;
      case 3: return 200;
      case 4: return 400;
      default: return 0;
    }
  };

  const renderMoveCard = (move: Move) => {
    const cooldownStatus = getCooldownStatus(move);
    const upgradeCost = getUpgradeCost(move.masteryLevel);
    const canUpgrade = move.masteryLevel < 5 && cooldownStatus.status === 'ready';

    // Get move damage values
    const moveDamage = MOVE_DAMAGE_VALUES[move.name];
    const shieldDamage = moveDamage?.shieldDamage || 0;
    const ppSteal = moveDamage?.ppSteal || 0;

    // Determine card background based on move category
    const getCardBackground = () => {
      if (move.category === 'manifest') {
        return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      } else if (move.category === 'elemental') {
        return 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
      } else {
        return 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)';
      }
    };

    // Get category icon
    const getCategoryIcon = () => {
      if (move.category === 'manifest') return '⭐';
      if (move.category === 'elemental') return '🔥';
      return '⚙️';
    };

    return (
      <div key={move.id} style={{
        background: getCardBackground(),
        border: '3px solid #ffffff',
        borderRadius: '1.5rem',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        position: 'relative',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
        transition: 'all 0.3s ease',
        cursor: 'pointer',
        minHeight: '320px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
        e.currentTarget.style.boxShadow = '0 20px 40px -10px rgba(0, 0, 0, 0.4)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
        e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.3)';
      }}>
        
        {/* Card Header */}
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <div style={{ 
            fontSize: '2rem', 
            marginBottom: '0.5rem',
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
          }}>
            {getCategoryIcon()}
          </div>
          <h3 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 'bold', 
            color: 'white',
            margin: '0',
            textShadow: '0 2px 4px rgba(0,0,0,0.5)',
            textAlign: 'center'
          }}>
            {move.name}
          </h3>
          {move.level > 1 && (
            <span style={{ 
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              padding: '0.25rem 0.75rem',
              borderRadius: '1rem',
              fontSize: '0.75rem',
              marginTop: '0.5rem',
              display: 'inline-block',
              backdropFilter: 'blur(10px)'
            }}>
              Level {move.level}
            </span>
          )}
        </div>

        {/* Move Type Badge */}
        <div style={{ 
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          background: 'rgba(255,255,255,0.9)',
          padding: '0.5rem 1rem',
          borderRadius: '1rem',
          fontSize: '0.75rem',
          fontWeight: 'bold',
          color: '#374151',
          backdropFilter: 'blur(10px)'
        }}>
          {move.type.toUpperCase()}
        </div>



        {/* Status Indicator */}
        <div style={{
          position: 'absolute',
          top: '1rem',
          left: '1rem',
          background: cooldownStatus.color,
          color: 'white',
          padding: '0.25rem 0.75rem',
          borderRadius: '1rem',
          fontSize: '0.75rem',
          fontWeight: 'bold',
          backdropFilter: 'blur(10px)'
        }}>
          {cooldownStatus.status === 'cooldown' ? '⏳' : cooldownStatus.status === 'no_moves' ? '🚫' : '✅'} {cooldownStatus.text}
        </div>

        {/* Move Description */}
        <div style={{ 
          background: 'rgba(255,255,255,0.95)',
          padding: '1rem',
          borderRadius: '1rem',
          marginBottom: '1rem',
          backdropFilter: 'blur(10px)'
        }}>
          <p style={{ 
            color: '#374151', 
            fontSize: '0.875rem', 
            lineHeight: '1.5',
            margin: '0',
            textAlign: 'center',
            marginBottom: '0.75rem'
          }}>
            {move.description}
          </p>
          
          {/* Power Type Information */}
          <div style={{ 
            display: 'flex', 
            gap: '0.5rem', 
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            {move.manifestType && (
              <div style={{
                background: getManifestColor(move.manifestType),
                padding: '0.5rem 1rem',
                borderRadius: '0.75rem',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                <span>⭐</span>
                {move.manifestType.charAt(0).toUpperCase() + move.manifestType.slice(1)}
              </div>
            )}
            {move.elementalAffinity && (
              <div style={{
                background: getElementalColor(move.elementalAffinity),
                padding: '0.5rem 1rem',
                borderRadius: '0.75rem',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                <span>🔥</span>
                {move.elementalAffinity.charAt(0).toUpperCase() + move.elementalAffinity.slice(1)}
              </div>
            )}
          </div>
        </div>

        {/* Move Stats Grid */}
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
          marginBottom: '1rem'
        }}>
          {/* Move Cost */}
          <div style={{
            background: 'rgba(255,255,255,0.9)',
            padding: '0.75rem',
            borderRadius: '0.75rem',
            textAlign: 'center',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>MOVE COST</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f59e0b' }}>1</div>
          </div>

          {/* Shield Damage */}
          <div style={{
            background: 'rgba(255,255,255,0.9)',
            padding: '0.75rem',
            borderRadius: '0.75rem',
            textAlign: 'center',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>SHIELD DMG</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#dc2626' }}>{shieldDamage}</div>
          </div>

          {/* PP Steal */}
          {ppSteal > 0 && (
            <div style={{
              background: 'rgba(255,255,255,0.9)',
              padding: '0.75rem',
              borderRadius: '0.75rem',
              textAlign: 'center',
              backdropFilter: 'blur(10px)',
              gridColumn: 'span 2'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>PP STEAL</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#fbbf24' }}>{ppSteal}</div>
            </div>
          )}

          {/* Healing */}
          {move.healing && (
            <div style={{
              background: 'rgba(255,255,255,0.9)',
              padding: '0.75rem',
              borderRadius: '0.75rem',
              textAlign: 'center',
              backdropFilter: 'blur(10px)',
              gridColumn: 'span 2'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>HEALING</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#10b981' }}>{move.healing}</div>
            </div>
          )}

          {/* Shield Boost */}
          {move.shieldBoost && (
            <div style={{
              background: 'rgba(255,255,255,0.9)',
              padding: '0.75rem',
              borderRadius: '0.75rem',
              textAlign: 'center',
              backdropFilter: 'blur(10px)',
              gridColumn: 'span 2'
            }}>
              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>SHIELD BOOST</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#3b82f6' }}>{move.shieldBoost}</div>
            </div>
          )}
        </div>

        {/* Effects Section */}
        {(move.debuffType || move.buffType) && (
          <div style={{ 
            background: 'rgba(255,255,255,0.9)',
            padding: '1rem',
            borderRadius: '0.75rem',
            marginBottom: '1rem',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.5rem' }}>
              Effects
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', lineHeight: '1.4' }}>
              {move.debuffType && (
                <div>• <strong>Debuff:</strong> {move.debuffType} ({move.debuffStrength || 0} strength, {move.duration || 1} turns)</div>
              )}
              {move.buffType && (
                <div>• <strong>Buff:</strong> {move.buffType} ({move.buffStrength || 0} strength, {move.duration || 1} turns)</div>
              )}
            </div>
          </div>
        )}

        {/* Mastery Level */}
        <div style={{ 
          background: 'rgba(255,255,255,0.9)',
          padding: '1rem',
          borderRadius: '0.75rem',
          marginBottom: '1rem',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Mastery Level</span>
            <span style={{ fontSize: '0.875rem', color: getMasteryColor(move.masteryLevel), fontWeight: 'bold' }}>
              {getMasteryLabel(move.masteryLevel)} ({move.masteryLevel}/5)
            </span>
          </div>
          <div style={{ 
            background: '#e5e7eb', 
            borderRadius: '0.5rem', 
            height: '0.5rem', 
            width: '100%',
            overflow: 'hidden'
          }}>
            <div style={{ 
              width: `${(move.masteryLevel / 5) * 100}%`, 
              background: getMasteryColor(move.masteryLevel), 
              height: '100%', 
              borderRadius: '0.5rem',
              transition: 'width 0.3s'
            }} />
          </div>
        </div>

        {/* Upgrade Button */}
        {move.masteryLevel < 5 && (
          <button
            onClick={() => onUpgradeMove(move.id)}
            disabled={!canUpgrade}
            style={{
              background: canUpgrade ? 'rgba(255,255,255,0.95)' : 'rgba(156,163,175,0.8)',
              color: canUpgrade ? '#374151' : '#6b7280',
              border: 'none',
              padding: '1rem',
              borderRadius: '0.75rem',
              cursor: canUpgrade ? 'pointer' : 'not-allowed',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              width: '100%',
              transition: 'all 0.2s',
              backdropFilter: 'blur(10px)'
            }}
            onMouseEnter={(e) => {
              if (canUpgrade) {
                e.currentTarget.style.background = 'rgba(255,255,255,1)';
                e.currentTarget.style.transform = 'scale(1.02)';
              }
            }}
            onMouseLeave={(e) => {
              if (canUpgrade) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.95)';
                e.currentTarget.style.transform = 'scale(1)';
              }
            }}
          >
            {canUpgrade ? `Upgrade to Level ${move.masteryLevel + 1} (${upgradeCost} PP)` : 'Cannot Upgrade'}
          </button>
        )}
      </div>
    );
  };

  const renderMoveSection = (title: string, moves: Move[], icon: string, color: string) => {
    if (moves.length === 0) return null;

    // Determine purchase cost based on category
    const getPurchaseCost = () => {
      if (title.includes('Manifest')) return 300;
      if (title.includes('Elemental')) return 300;
      if (title.includes('System')) return 300;
      return 300;
    };

    const purchaseCost = getPurchaseCost();

    return (
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          marginBottom: '1rem',
          padding: '0.75rem 1rem',
          background: color,
          borderRadius: '0.5rem'
        }}>
          <span style={{ fontSize: '1.25rem', marginRight: '0.75rem' }}>{icon}</span>
          <h4 style={{ 
            fontSize: '1.125rem', 
            fontWeight: 'bold',
            color: 'white',
            margin: 0
          }}>
            {title} ({moves.length} Available)
          </h4>
        </div>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, 380px)', 
          gap: '2rem',
          justifyContent: 'center'
        }}>
          {moves.map(renderMoveCard)}
          
          {/* Purchase Card */}
          <div style={{
            background: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
            border: '3px dashed #9ca3af',
            borderRadius: '1.5rem',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            position: 'relative',
            minHeight: '320px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
            e.currentTarget.style.boxShadow = '0 20px 40px -10px rgba(0, 0, 0, 0.2)';
            e.currentTarget.style.borderColor = '#6b7280';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0) scale(1)';
            e.currentTarget.style.boxShadow = 'none';
            e.currentTarget.style.borderColor = '#9ca3af';
          }}>
            
            {/* Card Header */}
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <div style={{ 
                fontSize: '3rem', 
                marginBottom: '1rem',
                opacity: 0.6
              }}>
                ➕
              </div>
              <h3 style={{ 
                fontSize: '1.25rem', 
                fontWeight: 'bold', 
                color: '#6b7280',
                margin: '0',
                textAlign: 'center'
              }}>
                Purchase New Move
              </h3>
            </div>

            {/* Purchase Info */}
            <div style={{ 
              background: 'rgba(255,255,255,0.8)',
              padding: '1rem',
              borderRadius: '1rem',
              marginBottom: '1rem',
              textAlign: 'center',
              width: '100%'
            }}>
              <p style={{ 
                color: '#6b7280', 
                fontSize: '0.875rem', 
                lineHeight: '1.5',
                margin: '0',
                marginBottom: '1rem'
              }}>
                Unlock a new {title.toLowerCase().replace(' moves', '')} move to expand your arsenal
              </p>
              
              <div style={{
                background: 'rgba(255,255,255,0.9)',
                padding: '0.75rem',
                borderRadius: '0.75rem',
                textAlign: 'center',
                marginBottom: '1rem'
              }}>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>COST</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>{purchaseCost} PP</div>
              </div>
            </div>

            {/* Purchase Button */}
            <button
              style={{
                background: color,
                color: 'white',
                border: 'none',
                padding: '1rem 2rem',
                borderRadius: '1rem',
                cursor: 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold',
                transition: 'all 0.2s',
                width: '100%'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              💰 Purchase Move
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ 
      background: 'white', 
      border: '1px solid #e5e7eb',
      borderRadius: '1rem',
      padding: '2rem'
    }}>
      <h3 style={{ 
        fontSize: '1.5rem', 
        marginBottom: '1.5rem', 
        color: '#1f2937',
        textAlign: 'center'
      }}>
        ⚔️ Your Battle Arsenal ({manifestMoves.length + elementalMoves.length + systemMoves.length} Moves Unlocked)
      </h3>

      {/* Move Availability Summary */}
      <div style={{ 
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '0.75rem',
        padding: '1rem',
        marginBottom: '2rem'
      }}>
        <h4 style={{ fontSize: '1rem', marginBottom: '0.75rem', color: '#374151' }}>Move Availability</h4>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ 
            background: '#dbeafe',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid #93c5fd'
          }}>
            <span style={{ fontSize: '0.875rem', color: '#1e40af', fontWeight: '500' }}>
              ⚔️ Battle Moves: {movesRemaining} remaining
            </span>
          </div>
          <div style={{ 
            background: '#fef3c7',
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid #fcd34d'
          }}>
            <span style={{ fontSize: '0.875rem', color: '#92400e', fontWeight: '500' }}>
              ⏰ Offline Moves: {offlineMovesRemaining}/{maxOfflineMoves}
            </span>
          </div>
        </div>
      </div>

      {/* Manifest Moves Section */}
      {renderMoveSection('Manifest Moves', manifestMoves, '🌟', '#8b5cf6')}

      {/* Elemental Moves Section */}
      {renderMoveSection('Elemental Moves', elementalMoves, '🔥', '#dc2626')}
      
      {/* Unlock Elemental Moves Button */}
      {elementalMoves.length === 0 && onUnlockElementalMoves && userElement && (
        <div style={{ 
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          textAlign: 'center',
          marginBottom: '2rem'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔥</div>
          <h4 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#dc2626' }}>
            Unlock Your {userElement.charAt(0).toUpperCase() + userElement.slice(1)} Elemental Moves
          </h4>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            As a {userElement} element user, you can unlock powerful {userElement} moves to enhance your battle capabilities!
          </p>
          <button
            onClick={() => onUnlockElementalMoves(userElement)}
            style={{
              background: '#dc2626',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}
          >
            🔥 Unlock {userElement.charAt(0).toUpperCase() + userElement.slice(1)} Moves
          </button>
        </div>
      )}

      {/* System Moves Section */}
      {renderMoveSection('System Moves', systemMoves, '⚙️', '#059669')}

      {/* No Moves Message */}
      {manifestMoves.length === 0 && elementalMoves.length === 0 && systemMoves.length === 0 && (
        <div style={{ 
          textAlign: 'center', 
          padding: '3rem',
          color: '#6b7280'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
          <h4 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>No Moves Unlocked</h4>
          <p>Complete challenges and level up to unlock powerful moves!</p>
          
          {/* Debug button to force unlock all moves */}
          {onForceUnlockAllMoves && (
            <div style={{ marginTop: '2rem' }}>
              <button
                onClick={onForceUnlockAllMoves}
                style={{
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 2rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
              >
                🔧 Debug: Force Unlock All Moves
              </button>
            </div>
          )}
          
          {/* Debug button to reset moves with element filter */}
          {onResetMovesWithElementFilter && (
            <div style={{ marginTop: '1rem' }}>
              <button
                onClick={onResetMovesWithElementFilter}
                style={{
                  background: '#059669',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 2rem',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
              >
                🔄 Reset Moves (Element Filter)
              </button>
            </div>
          )}
          
          {/* Debug button to apply element filter to existing moves */}
                      {onApplyElementFilterToExistingMoves && (
              <div style={{ marginTop: '1rem' }}>
                <button
                  onClick={onApplyElementFilterToExistingMoves}
                  style={{
                    background: '#7c3aed',
                    color: 'white',
                    border: 'none',
                    padding: '1rem 2rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    transition: 'all 0.2s'
                  }}
                >
                  🎯 Apply Element Filter to Existing Moves
                </button>
              </div>
            )}
            
            {/* Debug: Force Migration Button */}
            {onForceMigration && (
              <div style={{ marginTop: '1rem' }}>
                <button
                  onClick={onForceMigration}
                  style={{
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    padding: '1rem 2rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    transition: 'all 0.2s'
                  }}
                >
                    🔄 Force Migration (Debug)
                </button>
              </div>
            )}
        </div>
      )}
    </div>
  );
};

export default MovesDisplay; 