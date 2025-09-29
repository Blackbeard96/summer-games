import React from 'react';
import { Move, MOVE_UPGRADE_TEMPLATES, MOVE_DAMAGE_VALUES } from '../types/battle';
import { 
  calculateDamageRange, 
  calculateShieldBoostRange, 
  calculateHealingRange,
  formatDamageRange 
} from '../utils/damageCalculator';

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
  canPurchaseMove?: (category: 'manifest' | 'elemental' | 'system') => boolean;
  getNextMilestone?: (manifestType: string) => any;
  manifestProgress?: any;
  canPurchaseElementalMove?: (elementalType: string) => boolean;
  getNextElementalMilestone?: (elementalType: string) => any;
  elementalProgress?: any;
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
  userElement,
  canPurchaseMove,
  getNextMilestone,
  manifestProgress,
  canPurchaseElementalMove,
  getNextElementalMilestone,
  elementalProgress,
}) => {
  console.log('MovesDisplay: movesRemaining:', movesRemaining, 'offlineMovesRemaining:', offlineMovesRemaining);
  console.log('MovesDisplay: Total moves loaded:', moves.length);

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

  const renderMoveCard = (move: Move) => {
    // Check if move can be upgraded
    const canUpgrade = move.masteryLevel < 5;
    const upgradeCost = 100; // Fixed cost per upgrade

    // Get current stats from upgrade template
    const upgradeTemplate = MOVE_UPGRADE_TEMPLATES[move.name];
    const currentLevelStats = upgradeTemplate ? upgradeTemplate[`level${move.masteryLevel}` as keyof typeof upgradeTemplate] : null;
    const nextLevelStats = upgradeTemplate && move.masteryLevel < 5 ? upgradeTemplate[`level${move.masteryLevel + 1}` as keyof typeof upgradeTemplate] : null;

    // Determine card background based on move category
    const getCardBackground = () => {
      if (move.category === 'manifest') {
        const manifestColor = getManifestColor(move.manifestType || 'reading');
        return `linear-gradient(135deg, ${manifestColor}15 0%, ${manifestColor}25 100%)`;
      } else if (move.category === 'elemental') {
        const elementalColor = getElementalColor(move.elementalAffinity || 'fire');
        return `linear-gradient(135deg, ${elementalColor}15 0%, ${elementalColor}25 100%)`;
      } else if (move.category === 'system') {
        return 'linear-gradient(135deg, #3b82f615 0%, #3b82f625 100%)';
      }
      return 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)';
    };

    // Get category icon
    const getCategoryIcon = () => {
      if (move.category === 'manifest') return '⭐';
      if (move.category === 'elemental') return '🔥';
      return '⚙️';
    };

    // Get border color based on category
    const getBorderColor = () => {
      if (move.category === 'manifest') {
        return getManifestColor(move.manifestType || 'reading');
      } else if (move.category === 'elemental') {
        return getElementalColor(move.elementalAffinity || 'fire');
      } else if (move.category === 'system') {
        return '#3b82f6';
      }
      return '#cbd5e1';
    };

    return (
      <div key={move.id} style={{
        background: getCardBackground(),
        border: `2px solid ${getBorderColor()}`,
        borderRadius: '1.5rem',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        position: 'relative',
        minHeight: '320px',
        transition: 'all 0.3s ease',
        cursor: 'pointer'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
        e.currentTarget.style.boxShadow = '0 20px 40px -10px rgba(0, 0, 0, 0.2)';
        e.currentTarget.style.borderColor = getBorderColor();
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(1)';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = getBorderColor();
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
            color: '#1f2937',
            margin: '0',
            textShadow: '0 2px 4px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            {move.name}
          </h3>
          {move.level > 1 && (
            <span style={{ 
              background: 'rgba(255,255,255,0.2)',
              color: '#1f2937',
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

        {/* Stats Grid */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(2, 1fr)', 
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
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f59e0b' }}>{move.cost}</div>
          </div>

          {/* Combined Damage Range */}
          {(() => {
            const moveDamage = MOVE_DAMAGE_VALUES[move.name];
            if (moveDamage && moveDamage.damage > 0) {
              const damageRange = calculateDamageRange(moveDamage.damage, move.level, move.masteryLevel);
              const rangeString = formatDamageRange(damageRange);
              return (
                <div style={{
                  background: 'rgba(255,255,255,0.9)',
                  padding: '0.75rem',
                  borderRadius: '0.75rem',
                  textAlign: 'center',
                  backdropFilter: 'blur(10px)',
                  gridColumn: 'span 2'
                }}>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>DAMAGE RANGE</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#dc2626' }}>{rangeString}</div>
                </div>
              );
            }
            return null;
          })()}

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

        {/* Upgrade Preview (if can upgrade) */}
        {canUpgrade && nextLevelStats && (
          <div style={{ 
            background: 'rgba(34, 197, 94, 0.1)',
            border: '1px solid rgba(34, 197, 94, 0.2)',
            padding: '0.75rem',
            borderRadius: '0.75rem',
            marginBottom: '1rem'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              ⬆️ Next Level Preview
            </div>
            <div style={{ fontSize: '0.75rem', color: '#059669', lineHeight: '1.3' }}>
              {(() => {
                const currentDamage = MOVE_DAMAGE_VALUES[move.name]?.damage || 0;
                const nextDamage = nextLevelStats.damage !== undefined ? nextLevelStats.damage : 0;
                if (currentDamage > 0 && nextDamage > 0) {
                  const currentRange = calculateDamageRange(currentDamage, move.level, move.masteryLevel);
                  const nextRange = calculateDamageRange(nextDamage, move.level + 1, move.masteryLevel);
                  return (
                    <div>Damage: {formatDamageRange(currentRange)} → {formatDamageRange(nextRange)}</div>
                  );
                }
                return null;
              })()}
              {nextLevelStats.debuffStrength !== undefined && (
                <div>Debuff: {move.debuffStrength || 0} → {nextLevelStats.debuffStrength}</div>
              )}
              {nextLevelStats.buffStrength !== undefined && (
                <div>Buff: {move.buffStrength || 0} → {nextLevelStats.buffStrength}</div>
              )}
              {nextLevelStats.shieldBoost !== undefined && (
                <div>Shield: {move.shieldBoost || 0} → {nextLevelStats.shieldBoost}</div>
              )}
              {nextLevelStats.healing !== undefined && (
                <div>Healing: {move.healing || 0} → {nextLevelStats.healing}</div>
              )}
            </div>
          </div>
        )}

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
    
    // Check if purchase is allowed
    const category = title.includes('Manifest') ? 'manifest' : 
                    title.includes('Elemental') ? 'elemental' : 'system';
    
    let canPurchase = true;
    let nextMilestone = null;
    
    if (title.includes('Manifest') && canPurchaseMove) {
      canPurchase = canPurchaseMove(category);
      nextMilestone = (getNextMilestone && manifestProgress) ? 
        getNextMilestone(manifestProgress.manifestType) : null;
    } else if (title.includes('Elemental') && canPurchaseElementalMove && elementalProgress) {
      // For Elemental moves, we need to check the specific element type
      const elementType = userElement?.toLowerCase();
      if (elementType) {
        try {
          canPurchase = canPurchaseElementalMove(elementType);
          nextMilestone = (getNextElementalMilestone) ? 
            getNextElementalMilestone(elementType) : null;
        } catch (error) {
          console.error('MovesDisplay: Error checking elemental move purchase:', error);
          canPurchase = false;
          nextMilestone = null;
        }
      }
    } else if (canPurchaseMove) {
      canPurchase = canPurchaseMove(category);
    }

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
              {canPurchase ? (
                <>
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
                </>
              ) : nextMilestone ? (
                <>
                  <p style={{ 
                    color: '#dc2626', 
                    fontSize: '0.875rem', 
                    lineHeight: '1.5',
                    margin: '0',
                    marginBottom: '1rem',
                    fontWeight: 'bold'
                  }}>
                    ⚠️ Milestone Required: {nextMilestone?.name || 'Unknown Milestone'}
                  </p>
                  
                  <div style={{
                    background: 'rgba(220, 38, 38, 0.1)',
                    padding: '0.75rem',
                    borderRadius: '0.75rem',
                    textAlign: 'center',
                    marginBottom: '1rem',
                    border: '1px solid rgba(220, 38, 38, 0.2)'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: '#dc2626', marginBottom: '0.25rem', fontWeight: 'bold' }}>REQUIREMENTS</div>
                    <div style={{ fontSize: '0.875rem', color: '#dc2626', marginBottom: '0.5rem' }}>
                      Level 1 Moves Used: {
                        title.includes('Manifest') ? 
                          (manifestProgress?.level1MovesUsed || 0) : 
                          (elementalProgress?.level1MovesUsed || 0)
                      }/{nextMilestone?.requirements?.level1MovesUsed || 9}<br/>
                      Mastery Level: {nextMilestone?.requirements?.masteryLevel || 1}<br/>
                      Moves Unlocked: {nextMilestone?.requirements?.movesUnlocked || 1}<br/>
                      Battles Won: {nextMilestone?.requirements?.battlesWon || 0}<br/>
                      PP Earned: {nextMilestone?.requirements?.ppEarned || 0}
                    </div>
                  </div>
                </>
              ) : (
                <p style={{ 
                  color: '#6b7280', 
                  fontSize: '0.875rem', 
                  lineHeight: '1.5',
                  margin: '0',
                  marginBottom: '1rem'
                }}>
                  Complete milestones to unlock more moves
                </p>
              )}
            </div>

            {/* Purchase Button */}
            <button
              disabled={!canPurchase}
              style={{
                background: canPurchase ? color : '#9ca3af',
                color: 'white',
                border: 'none',
                padding: '1rem 2rem',
                borderRadius: '1rem',
                cursor: canPurchase ? 'pointer' : 'not-allowed',
                fontSize: '1rem',
                fontWeight: 'bold',
                transition: 'all 0.2s',
                width: '100%',
                opacity: canPurchase ? 1 : 0.6
              }}
              onMouseEnter={(e) => {
                if (canPurchase) {
                  e.currentTarget.style.transform = 'scale(1.05)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {canPurchase ? '💰 Purchase Move' : '🔒 Milestone Required'}
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