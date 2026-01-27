import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { Move } from '../types/battle';
import { getLevelFromXP } from '../utils/leveling';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import BagModal from './BagModal';
import VaultModal from './VaultModal';
import { getActivePPBoost, getPPBoostStatus } from '../utils/ppBoost';
import { calculateDamageRange, calculateShieldBoostRange, calculateHealingRange } from '../utils/damageCalculator';
import { getEffectiveMasteryLevel, getArtifactDamageMultiplier, getManifestDamageBoost } from '../utils/artifactUtils';
import { MOVE_DAMAGE_VALUES } from '../types/battle';
import { getUserSquadAbbreviations } from '../utils/squadUtils';
import { formatOpponentName } from '../utils/opponentNameFormatter';

interface Participant {
  id: string;
  name: string;
  avatar?: string;
  currentPP: number;
  shieldStrength: number;
  maxPP?: number;
  maxShieldStrength?: number;
  level?: number;
  powerLevel?: number | null; // Power Level (PL)
  vaultHealth?: number;
  maxVaultHealth?: number;
  isPlayer?: boolean; // True if this is the current player
}

interface MultiplayerBattleArenaProps {
  onMoveSelect: (move: Move | null) => void;
  onTargetSelect: (targetId: string) => void;
  onEscape?: () => void;
  selectedMove: Move | null;
  selectedTarget: string | null;
  availableMoves: Move[];
  isInSession?: boolean; // Hide RUN button in session mode
  allies: Participant[]; // Players on the left side (up to 4, including current player)
  enemies: Participant[]; // Opponents on the right side (up to 4)
  isPlayerTurn: boolean;
  battleLog: string[];
  customBackground?: string;
  hideCenterPrompt?: boolean;
  playerEffects?: Array<{ type: string; duration: number }>;
  opponentEffects?: Array<{ type: string; duration: number }>;
  onArtifactUsed?: () => void; // Callback when an artifact is used (e.g., Health Potion ends turn)
  gameId?: string; // Game ID for battle invitations
  battleName?: string; // Battle name for invitations
  onInviteClick?: () => void; // Callback when invite button is clicked
  allowInvites?: boolean; // Whether to show invite buttons (for Chapter 2-3+)
  currentWave?: number; // Current wave number (for multi-wave battles)
  maxWaves?: number; // Maximum number of waves (for multi-wave battles)
}

const MultiplayerBattleArena: React.FC<MultiplayerBattleArenaProps> = ({
  onMoveSelect,
  onTargetSelect,
  onEscape,
  selectedMove,
  selectedTarget,
  isInSession = false,
  currentWave,
  maxWaves,
  availableMoves,
  allies,
  enemies,
  isPlayerTurn,
  battleLog,
  customBackground,
  hideCenterPrompt = false,
  gameId,
  battleName,
  onInviteClick,
  allowInvites = false,
  playerEffects = [],
  opponentEffects = [],
  onArtifactUsed
}) => {
  const { currentUser } = useAuth();
  const { vault } = useBattle();
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showTargetMenu, setShowTargetMenu] = useState(false);
  const [currentLogIndex, setCurrentLogIndex] = useState(0);
  const [userLevel, setUserLevel] = useState(1);
  const [ppBoostStatus, setPpBoostStatus] = useState<{ isActive: boolean; timeRemaining: string }>({ isActive: false, timeRemaining: '' });
  const [showBagModal, setShowBagModal] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [equippedArtifacts, setEquippedArtifacts] = useState<any>(null);
  const [squadAbbreviations, setSquadAbbreviations] = useState<Map<string, string | null>>(new Map());

  // Fetch user level and equipped artifacts
  useEffect(() => {
    const fetchUserData = async () => {
      if (!currentUser) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'students', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const calculatedLevel = getLevelFromXP(userData.xp || 0);
          setUserLevel(calculatedLevel);
          setEquippedArtifacts(userData.equippedArtifacts || null);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, [currentUser]);

  // Fetch PP boost status
  useEffect(() => {
    const fetchPPBoost = async () => {
      if (!currentUser) return;
      const status = await getPPBoostStatus(currentUser.uid);
      setPpBoostStatus(status);
    };
    fetchPPBoost();
  }, [currentUser]);

  // Fetch squad abbreviations for all participants
  useEffect(() => {
    const fetchSquadAbbreviations = async () => {
      const allParticipantIds = [
        ...allies.map(p => p.id),
        ...enemies.map(p => p.id)
      ].filter(id => id); // Remove any undefined/null IDs
      
      if (allParticipantIds.length > 0) {
        const abbreviations = await getUserSquadAbbreviations(allParticipantIds);
        setSquadAbbreviations(abbreviations);
      }
    };
    
    fetchSquadAbbreviations();
  }, [allies, enemies]);

  // Get move type color
  const getMoveTypeColor = (move: Move): string => {
    // Color by move type
    const typeColors: Record<string, string> = {
      'attack': '#ef4444', // Red
      'defense': '#3b82f6', // Blue
      'utility': '#8b5cf6', // Purple
      'support': '#10b981', // Green
      'control': '#f59e0b', // Orange
      'mobility': '#06b6d4', // Cyan
      'stealth': '#6366f1', // Indigo
      'reveal': '#ec4899', // Pink
      'cleanse': '#14b8a6' // Teal
    };
    
    // If elemental, add element-based tint
    if (move.category === 'elemental' && move.elementalAffinity) {
      const elementColors: Record<string, string> = {
        'fire': '#dc2626',
        'water': '#2563eb',
        'air': '#7c3aed',
        'earth': '#16a34a',
        'lightning': '#fbbf24',
        'light': '#fbbf24',
        'shadow': '#4b5563',
        'metal': '#6b7280'
      };
      return elementColors[move.elementalAffinity] || typeColors[move.type] || '#6b7280';
    }
    
    return typeColors[move.type] || '#6b7280';
  };

  // Get move background color (lighter version for card)
  const getMoveBackgroundColor = (move: Move, isSelected: boolean): string => {
    if (isSelected) {
      return getMoveTypeColor(move);
    }
    
    const baseColor = getMoveTypeColor(move);
    // Convert hex to rgba with opacity
    const hex = baseColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return `rgba(${r}, ${g}, ${b}, 0.1)`;
  };

  // Helper to get move damage (synchronous, similar to BattleArena)
  const getMoveDamageValue = (move: Move): number => {
    // Use the move's actual damage if it exists (from upgrades)
    if (move.damage && move.damage > 0) {
      return move.damage;
    }
    
    // Fall back to MOVE_DAMAGE_VALUES lookup
    const moveData = MOVE_DAMAGE_VALUES[move.name];
    if (moveData && moveData.damage) {
      return moveData.damage;
    }
    
    return 0;
  };

  // Render participant card (for both allies and enemies)
  const renderParticipantCard = (participant: Participant, isAlly: boolean, index: number) => {
    const isSelected = selectedTarget === participant.id;
    const isCurrentPlayer = participant.isPlayer === true; // Explicitly check for true
    // Enemies can always be clicked when a move is selected and it's player's turn
    // Allies can only be clicked if it's the current player (self-targeting)
    // For enemies (isAlly = false), canClick = selectedMove && isPlayerTurn && (!false || false) = selectedMove && isPlayerTurn && true
    const canClick = selectedMove && isPlayerTurn && (!isAlly || isCurrentPlayer);
    
    // Always log when a move is selected to help debug
    if (selectedMove && !isAlly) {
      console.log(`🎯 [MultiplayerBattleArena] Enemy ${participant.name} (${participant.id}) - canClick: ${canClick}`, {
        selectedMove: selectedMove?.name,
        selectedMoveId: selectedMove?.id,
        isPlayerTurn,
        isAlly,
        isCurrentPlayer,
        participantIsPlayer: participant.isPlayer,
        hasSelectedMove: !!selectedMove
      });
    }
    
    return (
      <div
        key={participant.id}
        onClick={(e) => {
          console.log(`🖱️ [MultiplayerBattleArena] onClick FIRED on ${isAlly ? 'ally' : 'enemy'}: ${participant.name}`);
          e.preventDefault();
          e.stopPropagation();
          
          if (canClick) {
            console.log(`✅ [MultiplayerBattleArena] Valid click - selecting target: ${participant.id}`);
            onTargetSelect(participant.id);
          } else {
            console.warn(`⚠️ [MultiplayerBattleArena] Click blocked - canClick: ${canClick}`, {
              selectedMove: selectedMove?.name,
              isPlayerTurn,
              isAlly,
              isCurrentPlayer
            });
          }
        }}
        onMouseDown={(e) => {
          console.log(`🖱️ [MultiplayerBattleArena] MouseDown FIRED on ${isAlly ? 'ally' : 'enemy'}: ${participant.name}`);
          
          if (canClick) {
            e.preventDefault();
            e.stopPropagation();
            console.log(`✅ [MultiplayerBattleArena] MouseDown - selecting target: ${participant.id}`);
            onTargetSelect(participant.id);
          }
        }}
        style={{
          width: '100%',
          minHeight: '140px',
          maxWidth: '100%',
          background: 'rgba(255, 255, 255, 1)', // White background for all cards for better visibility
          border: isSelected 
            ? '3px solid #3b82f6' 
            : (canClick && !isAlly)
              ? '3px solid #fbbf24'
              : isCurrentPlayer 
                ? '3px solid #fbbf24' 
                : '2px solid #8B4513',
          borderRadius: '0.5rem',
          padding: '0.6rem',
          marginBottom: '0.5rem',
          cursor: canClick ? 'pointer' : (selectedMove && !isAlly ? 'not-allowed' : 'default'),
          transition: 'all 0.2s ease',
          position: 'relative',
          boxShadow: isSelected 
            ? '0 4px 12px rgba(59, 130, 246, 0.4)' 
            : (canClick && !isAlly)
              ? '0 0 15px rgba(251, 191, 36, 0.6)'
              : (selectedMove && !isAlly && !canClick)
                ? '0 0 10px rgba(239, 68, 68, 0.4)'
                : '0 2px 8px rgba(0, 0, 0, 0.1)',
          transform: canClick && !isAlly ? 'scale(1.05)' : 'scale(1)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          pointerEvents: 'auto', // Ensure clicks are not blocked
          zIndex: canClick ? 100 : (selectedMove && !isAlly ? 50 : 1), // Much higher z-index when clickable
          opacity: selectedMove && !isAlly && !canClick ? 0.7 : 1, // Dim if move selected but can't click
          userSelect: 'none', // Prevent text selection on click
          WebkitUserSelect: 'none',
          MozUserSelect: 'none',
          msUserSelect: 'none'
        }}
        onMouseEnter={(e) => {
          if (canClick) {
            e.currentTarget.style.transform = 'scale(1.08)';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(251, 191, 36, 0.8), 0 4px 12px rgba(0, 0, 0, 0.2)';
            e.currentTarget.style.borderColor = '#fbbf24';
          } else if (!isAlly || isCurrentPlayer) {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
          }
        }}
        onMouseLeave={(e) => {
          if (canClick) {
            e.currentTarget.style.transform = isSelected ? 'scale(1.05)' : 'scale(1.05)';
            e.currentTarget.style.boxShadow = isSelected 
              ? '0 4px 12px rgba(59, 130, 246, 0.4)' 
              : '0 0 15px rgba(251, 191, 36, 0.6)';
            e.currentTarget.style.borderColor = isSelected ? '#3b82f6' : '#fbbf24';
          } else {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = isSelected ? '0 4px 12px rgba(59, 130, 246, 0.4)' : '0 2px 8px rgba(0, 0, 0, 0.1)';
          }
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
          {/* Avatar */}
          <div style={{
            width: '45px',
            height: '45px',
            borderRadius: '50%',
            border: isCurrentPlayer ? '3px solid #fbbf24' : '2px solid #8B4513',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.3rem',
            flexShrink: 0
          }}>
            {participant.avatar && (participant.avatar.startsWith('http') || participant.avatar.startsWith('/')) ? (
              <img 
                src={participant.avatar} 
                alt={participant.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={(e) => {
                  // Fallback to initial if image fails to load
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const parent = target.parentElement;
                  if (parent) {
                    const fallback = document.createElement('div');
                    fallback.style.color = 'white';
                    fallback.style.fontWeight = 'bold';
                    fallback.textContent = participant.name[0]?.toUpperCase() || '?';
                    parent.appendChild(fallback);
                  }
                }}
              />
            ) : participant.avatar ? (
              <div style={{ color: 'white', fontWeight: 'bold', fontSize: '1.5rem' }}>
                {participant.avatar}
              </div>
            ) : (
              <div style={{ color: 'white', fontWeight: 'bold' }}>
                {participant.name[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          
          {/* Name and Level */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ 
              fontSize: '0.9rem', 
              fontWeight: 'bold',
              color: '#1f2937',
              lineHeight: '1.3',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexWrap: 'wrap',
              marginBottom: '0.2rem'
            }}>
              <span style={{ 
                overflow: 'visible',
                wordBreak: 'break-word',
                display: 'block',
                width: '100%'
              }}>
                {formatOpponentName(participant.name || 'Unknown')}
              </span>
              {squadAbbreviations.get(participant.id) && (
                <span style={{
                  fontSize: '0.75rem',
                  color: '#4f46e5',
                  fontWeight: '600',
                  flexShrink: 0
                }}>
                  [{squadAbbreviations.get(participant.id)}]
                </span>
              )}
              {isCurrentPlayer && (
                <span style={{ 
                  flexShrink: 0,
                  fontSize: '0.75rem',
                  color: '#f59e0b',
                  fontWeight: '600'
                }}> (You)</span>
              )}
            </div>
            {(participant.level || participant.powerLevel !== null) && (
              <div style={{ fontSize: '0.75rem', color: '#6b7280', lineHeight: '1.2', display: 'flex', alignItems: 'center', gap: '0.25rem', flexWrap: 'wrap' }}>
                {participant.level && <span>Lv.{participant.level}</span>}
                {participant.powerLevel !== null && participant.powerLevel !== undefined && (
                  <span style={{ 
                    color: '#8b5cf6', 
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px'
                  }}>
                    ⚡ PL {participant.powerLevel}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Health/PP Bar */}
        <div style={{ marginBottom: '0.2rem' }}>
          <div style={{ fontSize: '0.65rem', marginBottom: '0.1rem', color: '#dc2626', lineHeight: '1.1' }}>
            {participant.vaultHealth !== undefined ? 'HEALTH' : 'PP'}
          </div>
          <div style={{
            width: '100%',
            height: '7px',
            background: '#e5e7eb',
            borderRadius: '3.5px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${(() => {
                const max = participant.vaultHealth !== undefined 
                  ? (participant.maxVaultHealth || Math.floor((participant.maxPP || 1000) * 0.1))
                  : (participant.maxPP || 100);
                const current = participant.vaultHealth !== undefined 
                  ? participant.vaultHealth 
                  : participant.currentPP;
                return Math.min(100, (current / max) * 100);
              })()}%`,
              height: '100%',
              background: participant.vaultHealth !== undefined
                ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)'
                : 'linear-gradient(90deg, #dc2626 0%, #ef4444 100%)',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ fontSize: '0.6rem', textAlign: 'right', marginTop: '0.1rem', color: '#6b7280', lineHeight: '1.1' }}>
            {participant.vaultHealth !== undefined 
              ? `${participant.vaultHealth}/${participant.maxVaultHealth || Math.floor((participant.maxPP || 1000) * 0.1)}`
              : `${participant.currentPP}/${participant.maxPP || 100}`}
          </div>
        </div>

        {/* Shield Bar */}
        <div>
          <div style={{ fontSize: '0.65rem', marginBottom: '0.1rem', color: '#3b82f6', lineHeight: '1.1' }}>
            SHIELD
          </div>
          <div style={{
            width: '100%',
            height: '7px',
            background: '#e5e7eb',
            borderRadius: '3.5px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${(() => {
                const max = participant.maxShieldStrength || 100;
                return Math.min(100, (participant.shieldStrength / max) * 100);
              })()}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ fontSize: '0.6rem', textAlign: 'right', marginTop: '0.1rem', color: '#6b7280', lineHeight: '1.1' }}>
            {participant.shieldStrength}/{participant.maxShieldStrength || 100}
          </div>
        </div>

        {/* Status Effects */}
        {(isAlly ? playerEffects : opponentEffects).length > 0 && (
          <div style={{ 
            marginTop: '0.25rem', 
            display: 'flex', 
            gap: '0.25rem', 
            flexWrap: 'wrap' 
          }}>
            {(isAlly ? playerEffects : opponentEffects).map((effect, idx) => (
              <span 
                key={idx}
                style={{
                  fontSize: '0.65rem',
                  padding: '0.125rem 0.25rem',
                  background: '#f3f4f6',
                  borderRadius: '0.25rem',
                  border: '1px solid #d1d5db'
                }}
              >
                {effect.type.toUpperCase()} ({effect.duration})
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      width: '100%',
      height: '700px',
      background: customBackground 
        ? `url("${customBackground}")` 
        : 'linear-gradient(135deg, #87CEEB 0%, #98FB98 50%, #F0E68C 100%)',
      backgroundSize: customBackground ? 'cover' : 'auto',
      backgroundPosition: customBackground ? 'center' : 'center',
      backgroundRepeat: customBackground ? 'no-repeat' : 'repeat',
      borderRadius: customBackground ? '0' : '1rem',
      position: 'relative',
      overflow: 'hidden',
      border: customBackground ? 'none' : '3px solid #8B4513',
      boxShadow: customBackground ? 'none' : '0 8px 32px rgba(0, 0, 0, 0.3)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Semi-transparent overlay for custom backgrounds */}
      {customBackground && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.2)',
          zIndex: 0,
          pointerEvents: 'none'
        }} />
      )}

      {/* Battle Arena Title */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: '2rem',
        opacity: customBackground ? 0.1 : 0.3,
        zIndex: 1,
        fontWeight: 'bold',
        color: '#8B4513'
      }}>
        ⚔️ MST BATTLE ARENA ⚔️
      </div>

      {/* Wave Information */}
      {currentWave !== undefined && maxWaves !== undefined && maxWaves > 1 && (
        <div style={{
          position: 'absolute',
          top: '60px',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '1.25rem',
          fontWeight: 'bold',
          color: customBackground ? '#ffffff' : '#8B4513',
          textShadow: customBackground ? '2px 2px 4px rgba(0, 0, 0, 0.8)' : 'none',
          zIndex: 1,
          backgroundColor: customBackground ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.8)',
          padding: '0.5rem 1rem',
          borderRadius: '0.5rem',
          border: customBackground ? '2px solid rgba(255, 255, 255, 0.3)' : '2px solid #8B4513'
        }}>
          Wave {currentWave} of {maxWaves}
        </div>
      )}

      {/* Main Battle Layout */}
      <div style={{
        display: 'flex',
        height: '100%',
        padding: '1rem',
        paddingTop: '80px',
        gap: '1.5rem',
        zIndex: 2,
        position: 'relative',
        overflow: 'visible',
        boxSizing: 'border-box'
      }}>
        {/* Left Side - Allies (up to 4) */}
        <div style={{
          flex: '0 0 300px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          overflowY: 'auto',
          overflowX: 'visible',
          paddingRight: '1.5rem',
          paddingLeft: '1.5rem',
          boxSizing: 'border-box'
        }}>
          <div style={{
            fontSize: '0.875rem',
            fontWeight: 'bold',
            color: '#10b981',
            marginBottom: '0.5rem',
            textAlign: 'center'
          }}>
            ALLIES
          </div>
          {allies.slice(0, 4).map((ally, index) => renderParticipantCard(ally, true, index))}
          {/* Fill empty slots */}
          {Array.from({ length: Math.max(0, 4 - allies.length) }).map((_, index) => (
            <div key={`empty-ally-${index}`} style={{
              minHeight: '120px',
              border: '2px dashed #d1d5db',
              borderRadius: '0.5rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
              fontSize: '0.75rem',
              gap: '0.5rem',
              padding: '0.5rem'
            }}>
              <div>Empty Slot</div>
              {allowInvites && onInviteClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Invite button clicked in MultiplayerBattleArena');
                    onInviteClick();
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#2563eb';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#3b82f6';
                  }}
                >
                  + Invite Player
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Center - Battle Controls */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          minWidth: 0
        }}>
          {/* Battle Log */}
          {!hideCenterPrompt && (
            <div style={{
              width: '100%',
              maxWidth: '500px',
              maxHeight: '300px',
              background: 'rgba(0, 0, 0, 0.7)',
              border: '2px solid #8B4513',
              borderRadius: '0.5rem',
              padding: '1rem',
              overflowY: 'auto',
              color: '#fff',
              fontSize: '0.875rem',
              fontFamily: 'monospace'
            }}>
              {selectedMove && isPlayerTurn && !selectedTarget ? (
                <div style={{ 
                  color: '#fbbf24', 
                  fontWeight: 'bold',
                  padding: '0.5rem',
                  background: 'rgba(251, 191, 36, 0.1)',
                  borderRadius: '0.25rem',
                  border: '2px solid #fbbf24'
                }}>
                  ✅ Selected: <strong>{selectedMove.name}</strong>
                  <div style={{ fontSize: '0.875rem', marginTop: '0.5rem', color: '#fff' }}>
                    🎯 <strong>Click an enemy card on the right to attack!</strong>
                  </div>
                  <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.8 }}>
                    (Click FIGHT button again to change move)
                  </div>
                </div>
              ) : battleLog.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: 'bold', 
                    color: '#fbbf24', 
                    marginBottom: '0.5rem',
                    textAlign: 'center',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.3)',
                    paddingBottom: '0.5rem'
                  }}>
                    📜 BATTLE LOG
                  </div>
                  {battleLog.map((logEntry, index) => {
                    // Check if this is a round separator
                    const isRoundSeparator = logEntry.includes('━━━━') || logEntry.includes('ROUND') || logEntry.includes('Round') && logEntry.includes('Complete');
                    const isRoundHeader = logEntry.includes('ROUND') && !logEntry.includes('Complete');
                    const isRoundEnd = logEntry.includes('Round') && logEntry.includes('Complete');
                    
                    return (
                      <div 
                        key={index}
                        style={{
                          padding: isRoundSeparator ? '0.5rem' : '0.25rem 0.5rem',
                          borderRadius: '0.25rem',
                          backgroundColor: isRoundSeparator 
                            ? 'rgba(59, 130, 246, 0.3)' 
                            : isRoundHeader || isRoundEnd
                            ? 'rgba(34, 197, 94, 0.2)'
                            : index === battleLog.length - 1 
                            ? 'rgba(251, 191, 36, 0.2)' 
                            : 'rgba(255, 255, 255, 0.05)',
                          borderLeft: isRoundSeparator 
                            ? 'none'
                            : isRoundHeader || isRoundEnd
                            ? '3px solid #22c55e'
                            : index === battleLog.length - 1 
                            ? '3px solid #fbbf24' 
                            : '1px solid rgba(255, 255, 255, 0.2)',
                          fontSize: isRoundHeader || isRoundEnd ? '0.875rem' : '0.875rem',
                          fontWeight: isRoundHeader || isRoundEnd ? 'bold' : 'normal',
                          lineHeight: '1.4',
                          wordWrap: 'break-word',
                          textAlign: isRoundSeparator ? 'center' : 'left',
                          color: isRoundHeader || isRoundEnd ? '#22c55e' : '#fff',
                          marginTop: isRoundHeader ? '0.5rem' : '0',
                          marginBottom: isRoundEnd ? '0.5rem' : '0'
                        }}
                      >
                        {logEntry}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ opacity: 0.7 }}>Battle log will appear here...</div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          {isPlayerTurn && (
            <div style={{
              display: 'flex',
              gap: '0.75rem',
              flexWrap: 'wrap',
              justifyContent: 'center'
            }}>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (selectedMove) {
                    // If a move is selected, deselect it
                    onMoveSelect(null);
                    onTargetSelect('');
                  } else {
                    // Otherwise, toggle the move menu
                    setShowMoveMenu(!showMoveMenu);
                  }
                }}
                disabled={!isPlayerTurn}
                type="button"
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  background: selectedMove 
                    ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
                    : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: isPlayerTurn ? 'pointer' : 'not-allowed',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                  transition: 'all 0.2s ease',
                  opacity: isPlayerTurn ? 1 : 0.5
                }}
                onMouseEnter={(e) => {
                  if (isPlayerTurn) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
                }}
              >
                {selectedMove ? `✕ Cancel: ${selectedMove.name}` : '⚔️ FIGHT'}
              </button>

              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowVaultModal(true);
                }}
                type="button"
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
                }}
              >
                🏰 VAULT
              </button>

              <button
                onClick={() => setShowBagModal(true)}
                style={{
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
                }}
              >
                🎒 BAG
              </button>

              {onEscape && !isInSession && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onEscape();
                  }}
                  type="button"
                  style={{
                    padding: '0.75rem 1.5rem',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
                  }}
                >
                  🏃 RUN
                </button>
              )}
            </div>
          )}

          {/* Move Selection Menu */}
          {showMoveMenu && isPlayerTurn && (
            <div style={{
              position: 'absolute',
              bottom: '120px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '90%',
              maxWidth: '400px',
              maxHeight: '300px',
              background: 'rgba(255, 255, 255, 0.95)',
              border: '3px solid #8B4513',
              borderRadius: '0.5rem',
              padding: '1rem',
              overflowY: 'auto',
              zIndex: 200, // High z-index for menu, but it should close when move is selected
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
              pointerEvents: 'auto' // Ensure menu is clickable
            }}>
              <div style={{ 
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem'
              }}>
                <div style={{ 
                  fontSize: '1rem', 
                  fontWeight: 'bold',
                  textAlign: 'center',
                  flex: 1
                }}>
                  Select Move
                </div>
                <button
                  onClick={() => {
                    setShowMoveMenu(false);
                    if (selectedMove) {
                      onMoveSelect(null);
                      onTargetSelect('');
                    }
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
                    color: 'white',
                    border: '2px solid #8B4513',
                    borderRadius: '0.25rem',
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: 'bold',
                    transition: 'all 0.2s ease',
                    marginLeft: '0.5rem'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #4b5563 0%, #374151 100%)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  ← Back
                </button>
              </div>
              {selectedMove && (
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: '#6b7280', 
                  marginBottom: '0.5rem', 
                  textAlign: 'center',
                  fontStyle: 'italic',
                  padding: '0.25rem',
                  background: 'rgba(59, 130, 246, 0.1)',
                  borderRadius: '0.25rem'
                }}>
                  Currently selected: {selectedMove.name}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {availableMoves.map((move) => {
                  const isSelected = selectedMove?.id === move.id;
                  const moveColor = getMoveTypeColor(move);
                  const effectiveMasteryLevel = getEffectiveMasteryLevel(move, equippedArtifacts);
                  // Effective move level should match effective mastery level when artifacts boost it
                  const effectiveMoveLevel = effectiveMasteryLevel > move.masteryLevel ? effectiveMasteryLevel : move.level;
                  
                  // Calculate stats
                  let damageRange = null;
                  let shieldRange = null;
                  let healingRange = null;
                  
                      // Calculate damage for attack moves
                      let artifactMultiplier = 1.0;
                      let elementalRingLevel = 1;
                      if (move.type === 'attack') {
                        const baseDamage = getMoveDamageValue(move);
                        if (baseDamage > 0) {
                          damageRange = calculateDamageRange(baseDamage, move.level, effectiveMasteryLevel);
                          // Apply artifact multiplier for elemental moves
                          if (move.category === 'elemental' && equippedArtifacts) {
                            // Check all ring slots for Elemental Ring
                            const ringSlots = ['ring1', 'ring2', 'ring3', 'ring4'];
                            for (const slot of ringSlots) {
                              const ring = equippedArtifacts[slot];
                              if (ring && 
                                  (ring.id === 'elemental-ring-level-1' || 
                                   (ring.name && ring.name.includes('Elemental Ring')))) {
                                elementalRingLevel = ring.level || 1;
                                artifactMultiplier = getArtifactDamageMultiplier(elementalRingLevel);
                                damageRange = {
                                  min: Math.floor(damageRange.min * artifactMultiplier),
                                  max: Math.floor(damageRange.max * artifactMultiplier),
                                  average: Math.floor(damageRange.average * artifactMultiplier)
                                };
                                break; // Only apply once
                              }
                            }
                          }
                        }
                      }
                  
                  if (move.shieldBoost && move.shieldBoost > 0) {
                    shieldRange = calculateShieldBoostRange(move.shieldBoost, move.level, effectiveMasteryLevel);
                  }
                  
                  if (move.healing && move.healing > 0) {
                    healingRange = calculateHealingRange(move.healing, move.level, effectiveMasteryLevel);
                  }
                  
                  return (
                    <button
                      key={move.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log(`🎯 [MultiplayerBattleArena] Move selected: ${move.name} (${move.id})`);
                        onMoveSelect(move);
                        setShowMoveMenu(false);
                        console.log(`✅ [MultiplayerBattleArena] Move menu closed. Enemies should now be clickable.`);
                        // Don't show target menu - enemies are clickable directly when move is selected
                        // setShowTargetMenu(true);
                      }}
                      style={{
                        padding: '0.75rem',
                        background: isSelected 
                          ? moveColor
                          : getMoveBackgroundColor(move, false),
                        color: isSelected ? 'white' : '#1f2937',
                        border: `2px solid ${isSelected ? moveColor : moveColor}`,
                        borderRadius: '0.5rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        textAlign: 'left',
                        transition: 'all 0.2s ease',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = getMoveBackgroundColor(move, true);
                          e.currentTarget.style.borderColor = moveColor;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) {
                          e.currentTarget.style.background = getMoveBackgroundColor(move, false);
                          e.currentTarget.style.borderColor = moveColor;
                        }
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 'bold', marginBottom: '0.125rem' }}>
                            {move.name}
                          </div>
                          <div style={{ fontSize: '0.7rem', opacity: 0.8, display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ 
                              background: moveColor, 
                              color: 'white', 
                              padding: '0.125rem 0.375rem', 
                              borderRadius: '0.25rem',
                              fontWeight: 'bold'
                            }}>
                              {move.type.toUpperCase()}
                            </span>
                            {move.category === 'elemental' && move.elementalAffinity && (
                              <span style={{ 
                                background: '#6b7280', 
                                color: 'white', 
                                padding: '0.125rem 0.375rem', 
                                borderRadius: '0.25rem',
                                fontSize: '0.65rem'
                              }}>
                                {move.elementalAffinity.toUpperCase()}
                              </span>
                            )}
                            <span style={{ fontSize: '0.65rem' }}>
                              Lv.{effectiveMoveLevel} • Mastery {effectiveMasteryLevel}
                            </span>
                            <span style={{ fontSize: '0.65rem' }}>
                              Cost: {move.cost} PP
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* Stats */}
                      <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                        {damageRange && (
                          <div style={{ color: '#dc2626', fontWeight: 'bold' }}>
                            ⚔️ Damage: {damageRange.min}-{damageRange.max} (Avg: {damageRange.average})
                            {artifactMultiplier > 1.0 && move.category === 'elemental' && (
                              <span style={{ color: '#f59e0b', marginLeft: '0.25rem', fontSize: '0.65rem' }}>
                                💍 +{Math.round((artifactMultiplier - 1) * 100)}%
                              </span>
                            )}
                            {move.category === 'manifest' && equippedArtifacts && (() => {
                              const manifestBoost = getManifestDamageBoost(equippedArtifacts);
                              if (manifestBoost > 1.0) {
                                return (
                                  <span style={{ color: '#8b5cf6', marginLeft: '0.25rem', fontSize: '0.65rem' }}>
                                    🪖 +{Math.round((manifestBoost - 1) * 100)}%
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        )}
                        {shieldRange && (
                          <div style={{ color: '#3b82f6', fontWeight: 'bold' }}>
                            🛡️ Shield: +{shieldRange.min}-{shieldRange.max} (Avg: +{shieldRange.average})
                          </div>
                        )}
                        {healingRange && (
                          <div style={{ color: '#10b981', fontWeight: 'bold' }}>
                            💚 Heal: {healingRange.min}-{healingRange.max} (Avg: {healingRange.average})
                          </div>
                        )}
                        {move.ppSteal && move.ppSteal > 0 && (
                          <div style={{ color: '#f59e0b', fontWeight: 'bold' }}>
                            💰 PP Steal: {move.ppSteal}
                          </div>
                        )}
                        {move.cooldown > 0 && (
                          <div style={{ color: '#8b5cf6', fontWeight: 'bold', fontSize: '0.65rem' }}>
                            ⏱️ Cooldown: {move.cooldown} {move.cooldown === 1 ? 'turn' : 'turns'}
                            {move.currentCooldown > 0 && ` (${move.currentCooldown} remaining)`}
                          </div>
                        )}
                        {move.priority !== undefined && move.priority !== 0 && (
                          <div style={{ 
                            color: move.priority > 0 ? '#10b981' : '#dc2626', 
                            fontWeight: 'bold',
                            fontSize: '0.65rem'
                          }}>
                            ⚡ Priority: {move.priority > 0 ? '+' : ''}{move.priority}
                          </div>
                        )}
                        {move.targetType && (
                          <div style={{ color: '#6b7280', fontWeight: 'bold', fontSize: '0.65rem', textTransform: 'capitalize' }}>
                            🎯 Target: {move.targetType.replace('_', ' ')}
                          </div>
                        )}
                        {effectiveMasteryLevel > move.masteryLevel && move.category === 'elemental' && equippedArtifacts && (() => {
                          const ringSlots = ['ring1', 'ring2', 'ring3', 'ring4'];
                          const moveElement = move.elementalAffinity?.toLowerCase();
                          for (const slot of ringSlots) {
                            const ring = equippedArtifacts[slot];
                            if (!ring) continue;
                            if ((ring.id === 'blaze-ring' || (ring.name && ring.name.includes('Blaze Ring'))) && moveElement === 'fire') {
                              return (
                                <div style={{ color: '#8b5cf6', fontWeight: 'bold', fontSize: '0.65rem' }}>
                                  🔥 Blaze Ring: +1 Level
                                </div>
                              );
                            }
                            if ((ring.id === 'terra-ring' || (ring.name && ring.name.includes('Terra Ring'))) && moveElement === 'earth') {
                              return (
                                <div style={{ color: '#8b5cf6', fontWeight: 'bold', fontSize: '0.65rem' }}>
                                  🌍 Terra Ring: +1 Level
                                </div>
                              );
                            }
                            if ((ring.id === 'aqua-ring' || (ring.name && ring.name.includes('Aqua Ring'))) && moveElement === 'water') {
                              return (
                                <div style={{ color: '#8b5cf6', fontWeight: 'bold', fontSize: '0.65rem' }}>
                                  💧 Aqua Ring: +1 Level
                                </div>
                              );
                            }
                            if ((ring.id === 'air-ring' || (ring.name && ring.name.includes('Air Ring'))) && moveElement === 'air') {
                              return (
                                <div style={{ color: '#8b5cf6', fontWeight: 'bold', fontSize: '0.65rem' }}>
                                  💨 Air Ring: +1 Level
                                </div>
                              );
                            }
                          }
                          return null;
                        })()}
                        {move.debuffType && (
                          <div style={{ color: '#8b5cf6', fontSize: '0.65rem' }}>
                            ⚠️ Debuff: {move.debuffType.replace('_', ' ').toUpperCase()}
                          </div>
                        )}
                        {move.buffType && (
                          <div style={{ color: '#10b981', fontSize: '0.65rem' }}>
                            ✨ Buff: {move.buffType.toUpperCase()}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Target Selection Menu - Hidden, targets are now selected by clicking their cards */}
          {false && showTargetMenu && selectedMove && isPlayerTurn && (
            <div style={{
              position: 'absolute',
              bottom: '120px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '90%',
              maxWidth: '400px',
              maxHeight: '300px',
              background: 'rgba(255, 255, 255, 0.95)',
              border: '3px solid #8B4513',
              borderRadius: '0.5rem',
              padding: '1rem',
              overflowY: 'auto',
              zIndex: 10,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
            }}>
              <div style={{ 
                fontSize: '1rem', 
                fontWeight: 'bold', 
                marginBottom: '0.75rem',
                textAlign: 'center'
              }}>
                Select Target
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {/* Enemies */}
                {enemies.map((enemy) => (
                  <button
                    key={enemy.id}
                    onClick={() => {
                      onTargetSelect(enemy.id);
                      setShowTargetMenu(false);
                    }}
                    style={{
                      padding: '0.75rem',
                      background: selectedTarget === enemy.id 
                        ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
                        : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                      color: selectedTarget === enemy.id ? 'white' : '#991b1b',
                      border: selectedTarget === enemy.id 
                        ? '2px solid #dc2626' 
                        : '2px solid #fca5a5',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      textAlign: 'left',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    {enemy.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Side - Enemies (up to 4) */}
        <div 
          style={{
            flex: '0 0 300px',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            overflowY: 'auto',
            overflowX: 'visible',
            paddingLeft: '1.5rem',
            paddingRight: '1.5rem',
            boxSizing: 'border-box',
            position: 'relative',
            zIndex: selectedMove && isPlayerTurn ? 50 : 2 // Higher z-index when move is selected
          }}
          onClick={(e) => {
            // Debug: log if clicks reach the container
            if (selectedMove && isPlayerTurn) {
              console.log('🖱️ [MultiplayerBattleArena] Click detected on enemies container', e.target);
            }
          }}
        >
          <div style={{
            fontSize: '0.875rem',
            fontWeight: 'bold',
            color: '#ef4444',
            marginBottom: '0.5rem',
            textAlign: 'center'
          }}>
            ENEMIES
          </div>
          {enemies.slice(0, 4).map((enemy, index) => renderParticipantCard(enemy, false, index))}
          {/* Fill empty slots */}
          {Array.from({ length: Math.max(0, 4 - enemies.length) }).map((_, index) => (
            <div key={`empty-enemy-${index}`} style={{
              minHeight: '120px',
              border: '2px dashed #d1d5db',
              borderRadius: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
              fontSize: '0.75rem'
            }}>
              Empty Slot
            </div>
          ))}
        </div>
      </div>

      {/* Modals */}
      {showBagModal && (
        <BagModal
          isOpen={showBagModal}
          onClose={() => setShowBagModal(false)}
          onArtifactUsed={onArtifactUsed}
        />
      )}

      {showVaultModal && (
        <VaultModal
          isOpen={showVaultModal}
          onClose={() => setShowVaultModal(false)}
        />
      )}
    </div>
  );
};

export default MultiplayerBattleArena;

