import React, { useState, useEffect } from 'react';
import { Move, MOVE_UPGRADE_TEMPLATES, MOVE_DAMAGE_VALUES } from '../types/battle';
import { 
  calculateDamageRange, 
  calculateShieldBoostRange, 
  calculateHealingRange,
  formatDamageRange 
} from '../utils/damageCalculator';
import { loadMoveOverrides, getMoveDamage, getMoveName, getMoveDescription, getMoveNameSync, getMoveDescriptionSync } from '../utils/moveOverrides';

interface MovesDisplayProps {
  moves: Move[];
  movesRemaining: number;
  offlineMovesRemaining: number;
  maxOfflineMoves: number;
  onUpgradeMove: (moveId: string) => Promise<void> | void;
  onResetMoveLevel?: (moveId: string) => void;
  onUnlockElementalMoves?: (elementalAffinity: string) => void;
  onForceUnlockAllMoves?: () => void;
  onResetMovesWithElementFilter?: () => void;
  onApplyElementFilterToExistingMoves?: () => void;
  onForceMigration?: (resetLevels?: boolean) => void;
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
  onResetMoveLevel,
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
  const [moveOverrides, setMoveOverrides] = useState<{[key: string]: any}>({});
  const [overridesLoaded, setOverridesLoaded] = useState(false);
  const [ascendConfirm, setAscendConfirm] = useState<{moveId: string, moveName: string} | null>(null);

  // Load move overrides when component mounts and periodically refresh
  useEffect(() => {
    const loadOverrides = async () => {
      try {
        console.log('MovesDisplay: Loading move overrides...');
        const overrides = await loadMoveOverrides();
        setMoveOverrides(overrides);
        setOverridesLoaded(true);
        console.log('MovesDisplay: Move overrides loaded:', overrides);
      } catch (error) {
        console.error('MovesDisplay: Error loading move overrides:', error);
        setOverridesLoaded(true); // Set to true even on error to prevent infinite loading
      }
    };

    loadOverrides();
    
    // Refresh overrides every 30 seconds to pick up admin changes
    const refreshInterval = setInterval(() => {
      loadOverrides();
    }, 30000);
    
    return () => clearInterval(refreshInterval);
  }, []);

  console.log('MovesDisplay: movesRemaining:', movesRemaining, 'offlineMovesRemaining:', offlineMovesRemaining);
  console.log('MovesDisplay: Total moves loaded:', moves.length);
  console.log('MovesDisplay: Move overrides loaded:', overridesLoaded, 'overrides:', moveOverrides);

  // Helper function to get move data with overrides applied
  // Uses synchronous functions that access the global cache, which is updated when admin saves changes
  const getMoveDataWithOverrides = (moveName: string) => {
    // Use synchronous functions that access the global cache
    // This ensures we get the latest overrides even if local state hasn't updated
    // The cache is invalidated when admin saves, and will be refreshed on next loadMoveOverrides call
    const overrideName = getMoveNameSync(moveName);
    const overrideDescription = getMoveDescriptionSync(moveName);
    
    // Find the original template name if moveName is an overridden name
    // This is needed because overrides are keyed by original template names
    let originalTemplateName = moveName;
    if (moveOverrides) {
      // Check if moveName is already an overridden name by searching for it
      for (const [templateName, override] of Object.entries(moveOverrides)) {
        if (override.name === moveName) {
          originalTemplateName = templateName;
          break;
        }
      }
    }
    
    // For damage, check local state using original template name, then fall back to cache, then default
    const override = moveOverrides[originalTemplateName] || moveOverrides[moveName];
    const defaultMove = MOVE_DAMAGE_VALUES[originalTemplateName] || MOVE_DAMAGE_VALUES[moveName];
    
    // Prioritize cache-based name (from getMoveNameSync) over local state
    // This ensures we always get the latest admin updates
    return {
      name: overrideName, // Always use the cache-based name
      damage: override?.damage || defaultMove?.damage || 0,
      description: overrideDescription || override?.description || ''
    };
  };

  // Filter moves by category and unlocked status
  const manifestMoves = moves.filter(move => move.category === 'manifest' && move.unlocked);
  // Filter elemental moves by player's chosen element
  const elementalMoves = moves.filter(move => {
    if (move.category !== 'elemental' || !move.unlocked) return false;
    // If userElement is provided, ONLY show moves matching that element (strict filtering)
    if (userElement) {
      const moveElement = move.elementalAffinity?.toLowerCase();
      const userElementLower = userElement.toLowerCase();
      const matches = moveElement === userElementLower;
      if (matches) {
        console.log(`MovesDisplay: ✅ Move ${move.name} matches user element ${userElementLower}`);
      }
      return matches;
    }
    // If no userElement provided, don't show any elemental moves (user must choose element first)
    console.log('MovesDisplay: ⚠️ No userElement provided - hiding all elemental moves');
    return false;
  });
  const systemMoves = moves.filter(move => move.category === 'system' && move.unlocked);
  
  console.log('MovesDisplay: Filtered moves - Manifest:', manifestMoves.length, 'Elemental:', elementalMoves.length, 'System:', systemMoves.length);
  console.log('MovesDisplay: userElement prop:', userElement);
  if (elementalMoves.length > 0) {
    console.log('MovesDisplay: Elemental moves found:', elementalMoves.map(m => `${m.name} (${m.elementalAffinity})`));
  } else {
    console.log('MovesDisplay: No elemental moves found for element:', userElement);
    console.log('MovesDisplay: All unlocked elemental moves:', moves.filter(m => m.category === 'elemental' && m.unlocked).map(m => `${m.name} (${m.elementalAffinity})`));
  }

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
    switch (affinity?.toLowerCase()) {
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

  const getElementalIcon = (affinity: string) => {
    switch (affinity?.toLowerCase()) {
      case 'fire': return '🔥';
      case 'water': return '💧';
      case 'air': return '💨';
      case 'earth': return '🪨';
      case 'lightning': return '⚡';
      case 'light': return '✨';
      case 'shadow': return '🌑';
      case 'metal': return '⚙️';
      default: return '⚡';
    }
  };

  const getElementalBackgroundColor = (affinity: string) => {
    switch (affinity?.toLowerCase()) {
      case 'fire': return '#fef2f2';
      case 'water': return '#eff6ff';
      case 'air': return '#f5f3ff';
      case 'earth': return '#f0fdf4';
      case 'lightning': return '#fffbeb';
      case 'light': return '#fffbeb';
      case 'shadow': return '#f3f4f6';
      case 'metal': return '#f9fafb';
      default: return '#f3f4f6';
    }
  };

  const getElementalBorderColor = (affinity: string) => {
    switch (affinity?.toLowerCase()) {
      case 'fire': return '#fecaca';
      case 'water': return '#bfdbfe';
      case 'air': return '#c4b5fd';
      case 'earth': return '#bbf7d0';
      case 'lightning': return '#fde68a';
      case 'light': return '#fde68a';
      case 'shadow': return '#d1d5db';
      case 'metal': return '#e5e7eb';
      default: return '#d1d5db';
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
    // Check if move can be upgraded (up to level 10)
    const canUpgrade = move.masteryLevel < 10;
    const canAscend = move.masteryLevel === 5;
    
    // Calculate exponential upgrade cost based on current level
    // Base price: 100 PP for Level 1 → Level 2
    // Then multiplied by the respective multiplier for each level
    const getUpgradeCost = () => {
      const basePrice = 100;
      const nextLevel = move.masteryLevel + 1;
      if (nextLevel === 2) return basePrice; // Level 1 → Level 2: 100 PP
      if (nextLevel === 3) return basePrice * 2; // Level 2 → Level 3: 200 PP
      if (nextLevel === 4) return basePrice * 4; // Level 3 → Level 4: 400 PP
      if (nextLevel === 5) return basePrice * 8; // Level 4 → Level 5: 800 PP
      if (nextLevel === 6) return basePrice * 16; // Level 5 → Level 6 (Ascend): 1600 PP
      if (nextLevel === 7) return basePrice * 32; // Level 6 → Level 7: 3200 PP
      if (nextLevel === 8) return basePrice * 64; // Level 7 → Level 8: 6400 PP
      if (nextLevel === 9) return basePrice * 128; // Level 8 → Level 9: 12800 PP
      if (nextLevel === 10) return basePrice * 256; // Level 9 → Level 10: 25600 PP
      return basePrice;
    };
    const upgradeCost = getUpgradeCost();

    // Get current stats from upgrade template (only relevant for levels 1-5)
    const upgradeTemplate = MOVE_UPGRADE_TEMPLATES[move.name];
    const currentLevelStats = upgradeTemplate && move.masteryLevel <= 5 ? upgradeTemplate[`level${move.masteryLevel}` as keyof typeof upgradeTemplate] : null;
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
      if (move.category === 'elemental') {
        return getElementalIcon(move.elementalAffinity || '');
      }
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
            {getMoveDataWithOverrides(move.name).name} [Level {move.masteryLevel}]
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
            {getMoveDataWithOverrides(move.name).description || move.description}
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
            // Use the move's actual damage if it exists (from upgrades), otherwise use lookup
            let baseDamage: number;
            if (move.damage && move.damage > 0) {
              // Use the upgraded damage directly
              baseDamage = move.damage;
            } else {
              // Fall back to lookup for moves that haven't been upgraded yet
              const moveData = getMoveDataWithOverrides(move.name);
              if (typeof moveData.damage === 'object') {
                baseDamage = moveData.damage.max || moveData.damage.min || 0;
              } else {
                baseDamage = moveData.damage || 0;
              }
            }
            
            if (baseDamage > 0) {
              // Calculate range based on the actual damage and mastery level
              let damageRange = calculateDamageRange(baseDamage, move.level, move.masteryLevel);
              
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
                  {moveOverrides[move.name] && (
                    <div style={{ fontSize: '0.6rem', color: '#10B981', marginTop: '0.25rem' }}>
                      ⭐ CUSTOM VALUE
                    </div>
                  )}
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
              {getMasteryLabel(move.masteryLevel)} ({move.masteryLevel}/{move.masteryLevel <= 5 ? 5 : 10})
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
              width: `${(move.masteryLevel / (move.masteryLevel <= 5 ? 5 : 10)) * 100}%`, 
              background: getMasteryColor(move.masteryLevel), 
              height: '100%', 
              borderRadius: '0.5rem',
              transition: 'width 0.3s'
            }} />
          </div>
        </div>

        {/* Upgrade Preview (if can upgrade and below level 5, or if ascended) */}
        {canUpgrade && (move.masteryLevel < 5 ? nextLevelStats : true) && (
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
                // Use the move's actual current damage
                let currentBaseDamage: number;
                if (move.damage && move.damage > 0) {
                  currentBaseDamage = move.damage;
                } else {
                  // Fall back to lookup for moves that haven't been upgraded yet
                  const moveData = getMoveDataWithOverrides(move.name);
                  if (typeof moveData.damage === 'object') {
                    currentBaseDamage = moveData.damage.max || moveData.damage.min || 0;
                  } else {
                    currentBaseDamage = moveData.damage || 0;
                  }
                }
                
                if (currentBaseDamage > 0) {
                  // Calculate current damage range
                  const currentRange = calculateDamageRange(currentBaseDamage, move.level, move.masteryLevel);
                  
                  // Calculate next level damage based on boost multipliers
                  const nextLevel = move.masteryLevel + 1;
                  let minBoost: number, maxBoost: number;
                  
                  switch (nextLevel) {
                    case 2:
                      minBoost = 2.0;
                      maxBoost = 2.3;
                      break;
                    case 3:
                      minBoost = 1.25;
                      maxBoost = 1.5;
                      break;
                    case 4:
                      minBoost = 1.3;
                      maxBoost = 1.6;
                      break;
                    case 5:
                      minBoost = 2.0;
                      maxBoost = 2.5;
                      break;
                    case 6:
                      minBoost = 2.0;
                      maxBoost = 2.3;
                      break;
                    case 7:
                      minBoost = 1.25;
                      maxBoost = 1.5;
                      break;
                    case 8:
                      minBoost = 1.3;
                      maxBoost = 1.6;
                      break;
                    case 9:
                      minBoost = 2.0;
                      maxBoost = 2.5;
                      break;
                    case 10:
                      minBoost = 3.0;
                      maxBoost = 3.5;
                      break;
                    default:
                      minBoost = 1.0;
                      maxBoost = 1.0;
                  }
                  
                  // Calculate next level damage range (using min and max multipliers)
                  // For preview, we'll show a range based on min and max possible boosts
                  const nextMinDamage = Math.floor(currentBaseDamage * minBoost);
                  const nextMaxDamage = Math.floor(currentBaseDamage * maxBoost);
                  
                  // Calculate damage ranges for both min and max boost scenarios
                  const nextRangeMin = calculateDamageRange(nextMinDamage, move.level, nextLevel);
                  const nextRangeMax = calculateDamageRange(nextMaxDamage, move.level, nextLevel);
                  
                  // Combine into a range showing the potential span
                  const nextRange = {
                    min: nextRangeMin.min,
                    max: nextRangeMax.max,
                    average: Math.floor((nextRangeMin.average + nextRangeMax.average) / 2)
                  };
                  
                  return (
                    <div>Damage: {formatDamageRange(currentRange)} → {formatDamageRange(nextRange)}</div>
                  );
                }
                return null;
              })()}
              {(() => {
                // Calculate next level shield boost based on current shield boost and multiplier
                if (move.shieldBoost && move.shieldBoost > 0) {
                  const nextLevel = move.masteryLevel + 1;
                  let minBoost: number, maxBoost: number;
                  
                  switch (nextLevel) {
                    case 2:
                      minBoost = 2.0;
                      maxBoost = 2.3;
                      break;
                    case 3:
                      minBoost = 1.25;
                      maxBoost = 1.5;
                      break;
                    case 4:
                      minBoost = 1.3;
                      maxBoost = 1.6;
                      break;
                    case 5:
                      minBoost = 2.0;
                      maxBoost = 2.5;
                      break;
                    case 6:
                      minBoost = 2.0;
                      maxBoost = 2.3;
                      break;
                    case 7:
                      minBoost = 1.25;
                      maxBoost = 1.5;
                      break;
                    case 8:
                      minBoost = 1.3;
                      maxBoost = 1.6;
                      break;
                    case 9:
                      minBoost = 2.0;
                      maxBoost = 2.5;
                      break;
                    case 10:
                      minBoost = 3.0;
                      maxBoost = 3.5;
                      break;
                    default:
                      minBoost = 1.0;
                      maxBoost = 1.0;
                  }
                  
                  const currentShield = move.shieldBoost;
                  const nextMinShield = Math.floor(currentShield * minBoost);
                  const nextMaxShield = Math.floor(currentShield * maxBoost);
                  
                  return (
                    <div>Shield: {currentShield} → {nextMinShield}-{nextMaxShield}</div>
                  );
                }
                return null;
              })()}
              {(() => {
                // Calculate next level healing based on current healing and multiplier
                if (move.healing && move.healing > 0) {
                  const nextLevel = move.masteryLevel + 1;
                  let minBoost: number, maxBoost: number;
                  
                  switch (nextLevel) {
                    case 2:
                      minBoost = 2.0;
                      maxBoost = 2.3;
                      break;
                    case 3:
                      minBoost = 1.25;
                      maxBoost = 1.5;
                      break;
                    case 4:
                      minBoost = 1.3;
                      maxBoost = 1.6;
                      break;
                    case 5:
                      minBoost = 2.0;
                      maxBoost = 2.5;
                      break;
                    case 6:
                      minBoost = 2.0;
                      maxBoost = 2.3;
                      break;
                    case 7:
                      minBoost = 1.25;
                      maxBoost = 1.5;
                      break;
                    case 8:
                      minBoost = 1.3;
                      maxBoost = 1.6;
                      break;
                    case 9:
                      minBoost = 2.0;
                      maxBoost = 2.5;
                      break;
                    case 10:
                      minBoost = 3.0;
                      maxBoost = 3.5;
                      break;
                    default:
                      minBoost = 1.0;
                      maxBoost = 1.0;
                  }
                  
                  const currentHealing = move.healing;
                  const nextMinHealing = Math.floor(currentHealing * minBoost);
                  const nextMaxHealing = Math.floor(currentHealing * maxBoost);
                  
                  return (
                    <div>Healing: {currentHealing} → {nextMinHealing}-{nextMaxHealing}</div>
                  );
                }
                return null;
              })()}
              {nextLevelStats && nextLevelStats.debuffStrength !== undefined && (
                <div>Debuff: {move.debuffStrength || 0} → {nextLevelStats.debuffStrength}</div>
              )}
              {nextLevelStats && nextLevelStats.buffStrength !== undefined && (
                <div>Buff: {move.buffStrength || 0} → {nextLevelStats.buffStrength}</div>
              )}
            </div>
          </div>
        )}

        {/* Ascend Button - Show if level is exactly 5 */}
        {canAscend && onUpgradeMove && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              
              console.log('🔄 Ascend button clicked!', {
                moveId: move.id,
                moveName: move.name,
                masteryLevel: move.masteryLevel,
                canAscend,
                onUpgradeMove: !!onUpgradeMove,
                timestamp: new Date().toISOString()
              });
              
              // Show custom confirmation modal instead of window.confirm (works better in Firefox)
              const moveName = getMoveDataWithOverrides(move.name).name;
              setAscendConfirm({ moveId: move.id, moveName });
            }}
            style={{
              background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
              color: 'white',
              border: '3px solid #f59e0b',
              padding: '0.75rem',
              borderRadius: '0.75rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              width: '100%',
              marginBottom: '0.5rem',
              transition: 'all 0.2s',
              backdropFilter: 'blur(10px)',
              boxShadow: '0 0 15px rgba(245, 158, 11, 0.5)',
              position: 'relative',
              zIndex: 10,
              pointerEvents: 'auto'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)';
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.boxShadow = '0 0 25px rgba(245, 158, 11, 0.8)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)';
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 0 15px rgba(245, 158, 11, 0.5)';
            }}
          >
            ⬆️ Ascend (1600 PP)
          </button>
        )}

        {/* Upgrade Button - Show for levels 1-4 and 6-9 */}
        {canUpgrade && move.masteryLevel !== 5 && (
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
              ⚔️ Battle Moves: {offlineMovesRemaining} remaining
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
      {elementalMoves.length > 0 && userElement && (
        renderMoveSection(
          `Elemental Moves (${elementalMoves.length} Available)`, 
          elementalMoves, 
          getElementalIcon(userElement), 
          getElementalColor(userElement)
        )
      )}
      
      {/* Unlock Elemental Moves Button */}
      {elementalMoves.length === 0 && onUnlockElementalMoves && userElement && (
        <div style={{ 
          background: getElementalBackgroundColor(userElement),
          border: `1px solid ${getElementalBorderColor(userElement)}`,
          borderRadius: '0.75rem',
          padding: '1.5rem',
          textAlign: 'center',
          marginBottom: '2rem'
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>{getElementalIcon(userElement)}</div>
          <h4 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: getElementalColor(userElement) }}>
            Unlock Your {userElement.charAt(0).toUpperCase() + userElement.slice(1)} Elemental Moves
          </h4>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            As a {userElement} element user, you can unlock powerful {userElement} moves to enhance your battle capabilities!
          </p>
          <button
            onClick={() => onUnlockElementalMoves(userElement)}
            style={{
              background: getElementalColor(userElement),
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.opacity = '0.9';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.opacity = '1';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {getElementalIcon(userElement)} Unlock {userElement.charAt(0).toUpperCase() + userElement.slice(1)} Moves
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
            
            {/* Debug: Force Migration Buttons */}
            {onForceMigration && (
              <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => onForceMigration(false)}
                  style={{
                    background: '#10b981',
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
                  🔄 Force Migration (Keep Levels)
                </button>
                <button
                  onClick={() => {
                    if (window.confirm('⚠️ This will reset all move mastery levels to 1 while keeping updated move names. Continue?')) {
                      onForceMigration(true);
                    }
                  }}
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
                  🔄 Force Migration (Reset Levels)
                </button>
              </div>
            )}
        </div>
      )}

      {/* Ascend Confirmation Modal */}
      {ascendConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}
        onClick={() => setAscendConfirm(null)}
        >
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            zIndex: 10000
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
              color: '#1f2937'
            }}>
              ⬆️ Ascend Move?
            </h3>
            <p style={{
              fontSize: '1rem',
              marginBottom: '1.5rem',
              color: '#6b7280',
              lineHeight: '1.5'
            }}>
              Ascend <strong>{ascendConfirm.moveName}</strong> beyond Level 5?
            </p>
            <p style={{
              fontSize: '0.875rem',
              marginBottom: '1rem',
              color: '#9ca3af'
            }}>
              This will unlock the Ascension path to Level 10!
            </p>
            <div style={{
              background: '#fef3c7',
              border: '1px solid #fbbf24',
              borderRadius: '0.5rem',
              padding: '1rem',
              marginBottom: '1.5rem'
            }}>
              <p style={{
                fontSize: '0.875rem',
                color: '#92400e',
                margin: 0,
                fontWeight: 'bold'
              }}>
                ⚡ Cost: 1600 PP
              </p>
            </div>
            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setAscendConfirm(null)}
                style={{
                  background: '#e5e7eb',
                  color: '#374151',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    console.log(`✅ Proceeding with ascend for move: ${ascendConfirm.moveId} (${ascendConfirm.moveName})`);
                    
                    if (!onUpgradeMove) {
                      throw new Error('onUpgradeMove function is not available');
                    }
                    
                    await onUpgradeMove(ascendConfirm.moveId);
                    console.log(`✅ Ascend completed for: ${ascendConfirm.moveId}`);
                    
                    setAscendConfirm(null);
                  } catch (error) {
                    console.error('❌ Error ascending move:', error);
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    alert(`Failed to ascend move: ${errorMessage}`);
                    setAscendConfirm(null);
                  }
                }}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 4px 6px rgba(245, 158, 11, 0.3)'
                }}
              >
                ⬆️ Ascend (1600 PP)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MovesDisplay; 