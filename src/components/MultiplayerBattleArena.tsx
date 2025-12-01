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

interface Participant {
  id: string;
  name: string;
  avatar?: string;
  currentPP: number;
  shieldStrength: number;
  maxPP?: number;
  maxShieldStrength?: number;
  level?: number;
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
  allies: Participant[]; // Players on the left side (up to 4, including current player)
  enemies: Participant[]; // Opponents on the right side (up to 4)
  isPlayerTurn: boolean;
  battleLog: string[];
  customBackground?: string;
  hideCenterPrompt?: boolean;
  playerEffects?: Array<{ type: string; duration: number }>;
  opponentEffects?: Array<{ type: string; duration: number }>;
}

const MultiplayerBattleArena: React.FC<MultiplayerBattleArenaProps> = ({
  onMoveSelect,
  onTargetSelect,
  onEscape,
  selectedMove,
  selectedTarget,
  availableMoves,
  allies,
  enemies,
  isPlayerTurn,
  battleLog,
  customBackground,
  hideCenterPrompt = false,
  playerEffects = [],
  opponentEffects = []
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

  // Fetch user level
  useEffect(() => {
    const fetchUserData = async () => {
      if (!currentUser) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'students', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const calculatedLevel = getLevelFromXP(userData.xp || 0);
          setUserLevel(calculatedLevel);
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

  // Render participant card (for both allies and enemies)
  const renderParticipantCard = (participant: Participant, isAlly: boolean, index: number) => {
    const isSelected = selectedTarget === participant.id;
    const isCurrentPlayer = participant.isPlayer;
    const canClick = selectedMove && isPlayerTurn && (!isAlly || isCurrentPlayer);
    
    return (
      <div
        key={participant.id}
        onClick={() => {
          if (canClick) {
            // Can only target enemies or self, and only when a move is selected
            onTargetSelect(participant.id);
          }
        }}
        style={{
          width: '100%',
          minHeight: '120px',
          background: isSelected 
            ? 'rgba(59, 130, 246, 0.2)' 
            : isCurrentPlayer 
              ? 'rgba(251, 191, 36, 0.1)' 
              : 'rgba(255, 255, 255, 0.9)',
          border: isSelected 
            ? '3px solid #3b82f6' 
            : (canClick && !isAlly)
              ? '3px solid #fbbf24'
              : isCurrentPlayer 
                ? '3px solid #fbbf24' 
                : '2px solid #8B4513',
          borderRadius: '0.5rem',
          padding: '0.75rem',
          marginBottom: '0.5rem',
          cursor: canClick ? 'pointer' : 'default',
          transition: 'all 0.2s ease',
          position: 'relative',
          boxShadow: isSelected 
            ? '0 4px 12px rgba(59, 130, 246, 0.4)' 
            : (canClick && !isAlly)
              ? '0 0 15px rgba(251, 191, 36, 0.6)'
              : '0 2px 8px rgba(0, 0, 0, 0.1)',
          transform: canClick && !isAlly ? 'scale(1.05)' : 'scale(1)'
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {/* Avatar */}
          <div style={{
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            border: isCurrentPlayer ? '3px solid #fbbf24' : '2px solid #8B4513',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            flexShrink: 0
          }}>
            {participant.avatar ? (
              <img 
                src={participant.avatar} 
                alt={participant.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ color: 'white', fontWeight: 'bold' }}>
                {participant.name[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>
          
          {/* Name and Level */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ 
              fontSize: '0.875rem', 
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {participant.name}
              {isCurrentPlayer && ' (You)'}
            </div>
            {participant.level && (
              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                Lv.{participant.level}
              </div>
            )}
          </div>
        </div>

        {/* Health/PP Bar */}
        <div style={{ marginBottom: '0.25rem' }}>
          <div style={{ fontSize: '0.7rem', marginBottom: '0.125rem', color: '#dc2626' }}>
            {participant.vaultHealth !== undefined ? 'HEALTH' : 'PP'}
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            background: '#e5e7eb',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${(() => {
                const max = participant.vaultHealth !== undefined 
                  ? (participant.maxVaultHealth || participant.maxPP || 100)
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
          <div style={{ fontSize: '0.65rem', textAlign: 'right', marginTop: '0.125rem', color: '#6b7280' }}>
            {participant.vaultHealth !== undefined 
              ? `${participant.vaultHealth}/${participant.maxVaultHealth || participant.maxPP || 100}`
              : `${participant.currentPP}/${participant.maxPP || 100}`}
          </div>
        </div>

        {/* Shield Bar */}
        <div>
          <div style={{ fontSize: '0.7rem', marginBottom: '0.125rem', color: '#3b82f6' }}>
            SHIELD
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            background: '#e5e7eb',
            borderRadius: '4px',
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
          <div style={{ fontSize: '0.65rem', textAlign: 'right', marginTop: '0.125rem', color: '#6b7280' }}>
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

      {/* Main Battle Layout */}
      <div style={{
        display: 'flex',
        height: '100%',
        padding: '1rem',
        paddingTop: '80px',
        gap: '1rem',
        zIndex: 2,
        position: 'relative'
      }}>
        {/* Left Side - Allies (up to 4) */}
        <div style={{
          flex: '0 0 200px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          overflowY: 'auto',
          paddingRight: '0.5rem'
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
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
              fontSize: '0.75rem'
            }}>
              Empty Slot
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
              maxHeight: '200px',
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
                <div style={{ color: '#fbbf24', fontWeight: 'bold' }}>
                  Selected: {selectedMove.name} - Click an enemy to attack!
                </div>
              ) : battleLog.length > 0 ? (
                <div>
                  {battleLog[battleLog.length - 1]}
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
                onClick={() => setShowMoveMenu(!showMoveMenu)}
                disabled={!isPlayerTurn}
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
                {selectedMove ? `✓ ${selectedMove.name}` : '⚔️ FIGHT'}
              </button>

              <button
                onClick={() => setShowVaultModal(true)}
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

              {onEscape && (
                <button
                  onClick={onEscape}
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
              zIndex: 10,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
            }}>
              <div style={{ 
                fontSize: '1rem', 
                fontWeight: 'bold', 
                marginBottom: '0.75rem',
                textAlign: 'center'
              }}>
                Select Move
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {availableMoves.map((move) => (
                  <button
                    key={move.id}
                    onClick={() => {
                      onMoveSelect(move);
                      setShowMoveMenu(false);
                      setShowTargetMenu(true);
                    }}
                    style={{
                      padding: '0.75rem',
                      background: selectedMove?.id === move.id 
                        ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' 
                        : 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                      color: selectedMove?.id === move.id ? 'white' : '#1f2937',
                      border: selectedMove?.id === move.id 
                        ? '2px solid #2563eb' 
                        : '2px solid #d1d5db',
                      borderRadius: '0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      textAlign: 'left',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (selectedMove?.id !== move.id) {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedMove?.id !== move.id) {
                        e.currentTarget.style.background = 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)';
                      }
                    }}
                  >
                    {move.name}
                  </button>
                ))}
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
        <div style={{
          flex: '0 0 200px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          overflowY: 'auto',
          paddingLeft: '0.5rem'
        }}>
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

