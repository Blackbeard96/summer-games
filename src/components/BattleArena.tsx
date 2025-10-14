import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { Move, MOVE_DAMAGE_VALUES } from '../types/battle';
import { 
  calculateDamageRange, 
  calculateShieldBoostRange, 
  calculateHealingRange,
  formatDamageRange 
} from '../utils/damageCalculator';
import { getLevelFromXP } from '../utils/leveling';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { loadMoveOverrides } from '../utils/moveOverrides';

interface BattleArenaProps {
  onMoveSelect: (move: Move) => void;
  onTargetSelect: (targetId: string) => void;
  onEscape?: () => void;
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
  onEscape,
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
  const [userLevel, setUserLevel] = useState(1);
  const [userPhotoURL, setUserPhotoURL] = useState<string | null>(null);
  const [moveOverrides, setMoveOverrides] = useState<{[key: string]: any}>({});

  // Load move overrides when component mounts
  useEffect(() => {
    const loadOverrides = async () => {
      try {
        console.log('BattleArena: Loading move overrides...');
        const overrides = await loadMoveOverrides();
        setMoveOverrides(overrides);
        console.log('BattleArena: Move overrides loaded:', overrides);
      } catch (error) {
        console.error('BattleArena: Error loading move overrides:', error);
      }
    };

    loadOverrides();
  }, []);

  // Fetch user level and photo
  useEffect(() => {
    const fetchUserData = async () => {
      if (!currentUser) {
        console.log('BattleArena: No currentUser available');
        return;
      }
      
      console.log('BattleArena: Fetching data for user:', currentUser.uid, currentUser.email);
      
      try {
        const userDoc = await getDoc(doc(db, 'students', currentUser.uid));
        console.log('BattleArena: User document exists:', userDoc.exists());
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const calculatedLevel = getLevelFromXP(userData.xp || 0);
          console.log('BattleArena: Full user data from Firestore:', userData);
          console.log('BattleArena: User XP from Firestore:', userData.xp);
          console.log('BattleArena: Calculated level from XP:', calculatedLevel);
          console.log('BattleArena: User photoURL from Firestore:', userData.photoURL);
          console.log('BattleArena: Current user photoURL:', currentUser.photoURL);
          console.log('BattleArena: User displayName from Firestore:', userData.displayName);
          console.log('BattleArena: Current user displayName:', currentUser.displayName);
          
          const finalPhotoURL = userData.photoURL || currentUser.photoURL || null;
          console.log('BattleArena: Final photoURL being set:', finalPhotoURL);
          
          setUserLevel(calculatedLevel);
          setUserPhotoURL(finalPhotoURL);
        } else {
          console.log('BattleArena: No user document found in students collection');
          // Try users collection as fallback
          const userDoc2 = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc2.exists()) {
            const userData2 = userDoc2.data();
            console.log('BattleArena: Found user data in users collection:', userData2);
            const finalPhotoURL = userData2.photoURL || currentUser.photoURL || null;
            setUserPhotoURL(finalPhotoURL);
          }
        }
      } catch (error) {
        console.error('BattleArena: Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, [currentUser]);

  // Helper function to get move data with overrides applied
  const getMoveDataWithOverrides = (moveName: string) => {
    const override = moveOverrides[moveName];
    const defaultMove = MOVE_DAMAGE_VALUES[moveName];
    
    return {
      name: override?.name || moveName,
      damage: override?.damage || defaultMove?.damage || 0,
      description: override?.description || ''
    };
  };

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

  const handleEscape = () => {
    if (onEscape) {
      onEscape();
    }
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

  const getOpponentImage = (opponentName: string) => {
    // Return opponent-specific images based on name
    if (opponentName.toLowerCase().includes('hela')) {
      return '/images/Hela.png';
    }
    // Add more opponent images as needed
    return null; // Default fallback
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


      {/* Player Profile Picture */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        width: '140px',
        height: '140px',
        borderRadius: '50%',
        border: '4px solid #fbbf24',
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
        background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '4rem',
        animation: isPlayerTurn ? 'pulse 1s infinite' : 'none'
      }}>
        {(() => {
          console.log('BattleArena: Rendering player profile - userPhotoURL:', userPhotoURL);
          console.log('BattleArena: userPhotoURL type:', typeof userPhotoURL);
          console.log('BattleArena: userPhotoURL length:', userPhotoURL?.length);
          return userPhotoURL && userPhotoURL.trim() !== '';
        })() ? (
          <img 
            key={userPhotoURL}
            src={userPhotoURL || undefined} 
            alt="Player Avatar"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '50%'
            }}
            onLoad={() => {
              console.log('BattleArena: Player image loaded successfully:', userPhotoURL);
            }}
            onError={(e) => {
              console.log('BattleArena: Player image failed to load:', userPhotoURL);
              e.currentTarget.style.display = 'none';
              const fallbackElement = e.currentTarget.nextElementSibling as HTMLElement;
              if (fallbackElement) {
                fallbackElement.style.display = 'flex';
              }
            }}
          />
        ) : (
          <div 
            key={`fallback-${currentUser?.displayName || 'player'}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              fontSize: '3rem',
              color: 'white',
              fontWeight: 'bold'
            }}
          >
            {currentUser?.displayName?.[0]?.toUpperCase() || 'P'}
          </div>
        )}
      </div>

      {/* Player Status Box */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '180px',
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
          Lv.{userLevel}
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

      {/* Opponent Profile Picture - Always visible */}
      {availableTargets.length > 0 && (
        <>

          {/* Opponent Profile Picture */}
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            width: '140px',
            height: '140px',
            borderRadius: '50%',
            border: '4px solid #ef4444',
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '4rem',
            animation: !isPlayerTurn ? 'pulse 1s infinite' : 'none'
          }}>
            {(() => {
              const opponentImage = getOpponentImage(availableTargets[0]?.name || '');
              return opponentImage ? (
                <img 
                  src={opponentImage} 
                  alt="Opponent Avatar"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: '55% -20%',
                    borderRadius: '50%',
                    transform: 'scale(2.5)'
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const fallbackElement = e.currentTarget.nextElementSibling as HTMLElement;
                    if (fallbackElement) {
                      fallbackElement.style.display = 'flex';
                    }
                  }}
                />
              ) : null;
            })()}
            <div 
              style={{
                display: getOpponentImage(availableTargets[0]?.name || '') ? 'none' : 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                fontSize: '3rem',
                color: 'white',
                fontWeight: 'bold'
              }}
            >
              {availableTargets[0]?.name?.[0]?.toUpperCase() || 'O'}
            </div>
          </div>

          {/* Opponent Status Box */}
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '180px',
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
                  <span>{getMoveDataWithOverrides(move.name).name}</span>
                </div>
                <div style={{ fontSize: '0.625rem', opacity: 0.8 }}>
                  {move.type.toUpperCase()}
                </div>
                {(() => {
                  // Use actual user level for range calculation
                  const playerLevel = userLevel;
                  
                  // Show damage range for offensive moves
                  const moveData = getMoveDataWithOverrides(move.name);
                  if (moveData.damage && (typeof moveData.damage === 'number' ? moveData.damage > 0 : moveData.damage.min > 0 || moveData.damage.max > 0)) {
                    // Handle both single damage values and damage ranges
                    let damageRange;
                    if (typeof moveData.damage === 'object') {
                      // It's already a range, use it directly
                      damageRange = moveData.damage;
                    } else {
                      // It's a single value, calculate range based on mastery level
                      damageRange = calculateDamageRange(moveData.damage, move.level, move.masteryLevel);
                    }
                    
                    const rangeString = formatDamageRange(damageRange);
                    console.log('BattleArena: Rendering damage range for', move.name, ':', rangeString, '(from override:', moveOverrides[move.name] ? 'YES' : 'NO', ')');
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
                        Damage: {rangeString}
                        {moveOverrides[move.name] && (
                          <span style={{ color: '#10B981', marginLeft: '4px' }}>⭐</span>
                        )}
                      </div>
                    );
                  }
                  
                  // Show shield boost range for defensive moves
                  if (move.shieldBoost && move.shieldBoost > 0) {
                    const shieldRange = calculateShieldBoostRange(move.shieldBoost, move.level, move.masteryLevel);
                    const rangeString = formatDamageRange(shieldRange);
                    console.log('BattleArena: Rendering shield boost range for', move.name, ':', rangeString);
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
                        Shield: +{rangeString}
                      </div>
                    );
                  }
                  
                  // Show healing range for support moves
                  if (move.healing && move.healing > 0) {
                    const healingRange = calculateHealingRange(move.healing, move.level, move.masteryLevel);
                    const rangeString = formatDamageRange(healingRange);
                    console.log('BattleArena: Rendering healing range for', move.name, ':', rangeString);
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
                        Heal: +{rangeString}
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
            onClick={handleEscape}
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
