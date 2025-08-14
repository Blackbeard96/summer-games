import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { Move, ActionCard, MOVE_PP_RANGES, MOVE_DAMAGE_VALUES, ACTION_CARD_DAMAGE_VALUES } from '../types/battle';

interface VaultSiegeModalProps {
  isOpen: boolean;
  onClose: () => void;
  battleId?: string;
}

interface Player {
  uid: string;
  displayName: string;
  powerPoints: number;
  level: number;
  shieldStrength?: number;
  maxShieldStrength?: number;
}

const VaultSiegeModal: React.FC<VaultSiegeModalProps> = ({ isOpen, onClose, battleId }) => {
  const { currentUser } = useAuth();
  const { vault, moves, actionCards, executeVaultSiegeAttack, syncVaultPP, getRemainingOfflineMoves } = useBattle();
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [selectedMoves, setSelectedMoves] = useState<string[]>([]);
  const [selectedActionCards, setSelectedActionCards] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [targetVault, setTargetVault] = useState<any>(null);
  const [attackResults, setAttackResults] = useState<any>(null);

  // Function to restore a move for 20 PP
  const handleRestoreMove = async () => {
    if (!currentUser || !vault) return;
    
    if (vault.currentPP < 20) {
      setAttackResults({
        success: false,
        message: 'Not enough PP! You need 20 PP to restore a move.',
      });
      return;
    }

    try {
      setLoading(true);
      
      // Update vault PP
      const newPP = vault.currentPP - 20;
      const newMovesRemaining = Math.min(vault.movesRemaining + 1, vault.maxMovesPerDay);
      
      // Update vault in Firestore
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      await updateDoc(vaultRef, {
        currentPP: newPP,
        movesRemaining: newMovesRemaining,
      });

      // Update local state
      await syncVaultPP();
      
      setAttackResults({
        success: true,
        message: `Move restored! Spent 20 PP. You now have ${newMovesRemaining} moves remaining.`,
        ppSpent: 20,
        movesRestored: 1,
      });
    } catch (error) {
      console.error('Error restoring move:', error);
      setAttackResults({
        success: false,
        message: 'Failed to restore move. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  // Reset selections when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedMoves([]);
      setSelectedActionCards([]);
      setSelectedTarget('');
      setAttackResults(null);
    }
  }, [isOpen]);

  // Load available players (excluding current user)
  useEffect(() => {
    if (!isOpen || !currentUser) return;

    const loadPlayers = async () => {
      setLoading(true);
      try {
        console.log('VaultSiegeModal: Loading players...');
        const studentsSnapshot = await getDocs(collection(db, 'students'));
        const availablePlayers: Player[] = [];
        
        console.log('VaultSiegeModal: Found', studentsSnapshot.size, 'students');
        
        studentsSnapshot.forEach((doc) => {
          const data = doc.data();
          console.log('VaultSiegeModal: Student data:', doc.id, data);
          if (doc.id !== currentUser.uid) {
            availablePlayers.push({
              uid: doc.id,
              displayName: data.displayName || data.name || 'Unknown Player',
              powerPoints: data.powerPoints || data.currentPP || 0,
              level: data.level || 1,
            });
          }
        });

        console.log('VaultSiegeModal: Available players before vault loading:', availablePlayers.length);

        // Load vault data for each player to get shield information
        for (const player of availablePlayers) {
          try {
            const vaultDoc = await getDoc(doc(db, 'vaults', player.uid));
            if (vaultDoc.exists()) {
              const vaultData = vaultDoc.data();
              player.shieldStrength = vaultData.shieldStrength || 0;
              player.maxShieldStrength = vaultData.maxShieldStrength || 50;
              console.log('VaultSiegeModal: Loaded vault for', player.displayName, vaultData);
            } else {
              console.log('VaultSiegeModal: No vault found for', player.displayName);
            }
          } catch (error) {
            console.error('Error loading vault for player:', player.uid, error);
          }
        }
        
        console.log('VaultSiegeModal: Final players list:', availablePlayers);
        setPlayers(availablePlayers);
      } catch (error) {
        console.error('Error loading players:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPlayers();
  }, [isOpen, currentUser]);

  // Load target vault when selected
  useEffect(() => {
    if (!selectedTarget) {
      setTargetVault(null);
      return;
    }

    const loadTargetVault = async () => {
      try {
        const vaultDoc = await getDoc(doc(db, 'vaults', selectedTarget));
        if (vaultDoc.exists()) {
          setTargetVault(vaultDoc.data());
        }
      } catch (error) {
        console.error('Error loading target vault:', error);
      }
    };

    loadTargetVault();
  }, [selectedTarget]);

  const handleMoveToggle = (moveId: string) => {
    setSelectedMoves(prev => {
      if (prev.includes(moveId)) {
        // Deselecting a move
        return prev.filter(id => id !== moveId);
      } else {
        // Selecting a move - check if we have offline moves remaining
        const totalSelected = prev.length + selectedActionCards.length;
        const remainingOfflineMoves = getRemainingOfflineMoves();
        if (totalSelected >= remainingOfflineMoves) {
          alert(`You only have ${remainingOfflineMoves} offline moves remaining today.`);
          return prev;
        }
        return [...prev, moveId];
      }
    });
  };

  const handleActionCardToggle = (cardId: string) => {
    setSelectedActionCards(prev => {
      if (prev.includes(cardId)) {
        // Deselecting an action card
        return prev.filter(id => id !== cardId);
      } else {
        // Selecting an action card - check if we have offline moves remaining
        const totalSelected = selectedMoves.length + prev.length;
        const remainingOfflineMoves = getRemainingOfflineMoves();
        if (totalSelected >= remainingOfflineMoves) {
          alert(`You only have ${remainingOfflineMoves} offline moves remaining today.`);
          return prev;
        }
        return [...prev, cardId];
      }
    });
  };

  const handleAttack = async () => {
    if (!selectedTarget || (!selectedMoves.length && !selectedActionCards.length)) {
      alert('Please select a target and at least one move or action card.');
      return;
    }

    // Check if player has enough offline moves
    const totalMovesToUse = selectedMoves.length + selectedActionCards.length;
    const remainingOfflineMoves = getRemainingOfflineMoves();
    
    if (totalMovesToUse > remainingOfflineMoves) {
      alert(`Not enough offline moves! You have ${remainingOfflineMoves} moves remaining today, but trying to use ${totalMovesToUse} moves.`);
      return;
    }

    setLoading(true);
    try {
      // Execute each selected move
      for (const moveId of selectedMoves) {
        await executeVaultSiegeAttack(moveId, selectedTarget);
      }

      // Execute each selected action card
      for (const cardId of selectedActionCards) {
        await executeVaultSiegeAttack(null, selectedTarget, cardId);
      }

      // Calculate total PP gained from the attack
      let totalPPGained = 0;
      for (const moveId of selectedMoves) {
        const move = moves.find(m => m.id === moveId);
        if (move) {
          const moveDamage = MOVE_DAMAGE_VALUES[move.name];
          if (moveDamage) {
            totalPPGained += moveDamage.ppSteal;
          }
        }
      }

      setAttackResults({
        success: true,
        message: `Attack executed against ${players.find(p => p.uid === selectedTarget)?.displayName}!`,
        movesUsed: selectedMoves.length,
        cardsUsed: selectedActionCards.length,
        ppGained: totalPPGained,
      });

      // Refresh vault data to show updated PP
      await syncVaultPP();

      // Reset selections
      setSelectedMoves([]);
      setSelectedActionCards([]);
      setSelectedTarget('');
    } catch (error) {
      console.error('Error executing attack:', error);
      setAttackResults({
        success: false,
        message: 'Attack failed. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const unlockedMoves = moves.filter(move => move.unlocked);
  const unlockedCards = actionCards.filter(card => card.unlocked);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '2rem',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'auto',
        width: '90%',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.5rem' }}>🏰 Vault Siege</h2>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '1rem',
              fontSize: '0.875rem'
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                color: getRemainingOfflineMoves() > 0 ? '#059669' : '#dc2626'
              }}>
                <span style={{ fontWeight: 'bold' }}>Offline Moves:</span>
                <span style={{ 
                  background: getRemainingOfflineMoves() > 0 ? '#d1fae5' : '#fee2e2',
                  color: getRemainingOfflineMoves() > 0 ? '#065f46' : '#991b1b',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '0.25rem',
                  fontWeight: 'bold'
                }}>
                  {getRemainingOfflineMoves()}/3
                </span>
              </div>
              
              {/* Restore Move Button */}
              <button
                onClick={handleRestoreMove}
                disabled={loading || !vault || vault.currentPP < 20}
                style={{
                  background: vault && vault.currentPP >= 20 ? '#10b981' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  cursor: vault && vault.currentPP >= 20 ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontWeight: 'bold',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (vault && vault.currentPP >= 20) {
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (vault && vault.currentPP >= 20) {
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
              >
                ⚡ Restore Move (20 PP)
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
            }}
          >
            ×
          </button>
        </div>

        {attackResults && (
          <div style={{
            background: attackResults.success ? '#d1fae5' : '#fee2e2',
            border: `1px solid ${attackResults.success ? '#10b981' : '#ef4444'}`,
            color: attackResults.success ? '#065f46' : '#991b1b',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ marginBottom: '0.5rem' }}>{attackResults.success ? '✅ Attack Successful!' : '❌ Attack Failed'}</h3>
                <p>{attackResults.message}</p>
                {attackResults.success && (
                  <div>
                    <p>Used {attackResults.movesUsed} moves and {attackResults.cardsUsed} action cards.</p>
                    {attackResults.ppGained > 0 && (
                      <p style={{ color: '#059669', fontWeight: 'bold' }}>
                        💰 Gained {attackResults.ppGained} PP!
                      </p>
                    )}
                  </div>
                )}
              </div>
              {attackResults.success && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={handleRestoreMove}
                    disabled={loading || !vault || vault.currentPP < 20}
                    style={{
                      background: vault && vault.currentPP >= 20 ? '#10b981' : '#9ca3af',
                      color: 'white',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '4px',
                      cursor: vault && vault.currentPP >= 20 ? 'pointer' : 'not-allowed',
                      fontSize: '0.875rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    ⚡ Restore Move (20 PP)
                  </button>
                  <button
                    onClick={syncVaultPP}
                    style={{
                      background: '#3b82f6',
                      color: 'white',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                    }}
                  >
                    🔄 Refresh PP
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Target Selection */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#374151' }}>Select Target Vault</h3>
          {loading ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '2rem', 
              color: '#6b7280',
              background: '#f9fafb',
              borderRadius: '8px'
            }}>
              🔄 Loading available players...
            </div>
          ) : players.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '2rem', 
              color: '#6b7280',
              background: '#f9fafb',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>👥</div>
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>No Players Available</div>
              <div style={{ fontSize: '0.875rem' }}>
                There are no other players in the system to attack.
              </div>
            </div>
          ) : (
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
              gap: '1rem' 
            }}>
              {players.map(player => {
                const isSelected = selectedTarget === player.uid;
                const shieldPercentage = ((player.shieldStrength || 0) / (player.maxShieldStrength || 50)) * 100;
                
                // Determine card background based on shield status
                const getCardBackground = () => {
                  if (isSelected) {
                    return 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)';
                  } else if (shieldPercentage >= 80) {
                    return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                  } else if (shieldPercentage >= 50) {
                    return 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
                  } else {
                    return 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
                  }
                };

                // Get shield status icon
                const getShieldIcon = () => {
                  if (shieldPercentage >= 80) return '🛡️';
                  if (shieldPercentage >= 50) return '⚠️';
                  return '💥';
                };

                return (
                  <div
                    key={player.uid}
                    onClick={() => setSelectedTarget(player.uid)}
                    style={{
                      background: getCardBackground(),
                      border: `2px solid ${isSelected ? '#ffffff' : 'rgba(255,255,255,0.2)'}`,
                      borderRadius: '12px',
                      padding: '1.25rem',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      boxShadow: isSelected ? '0 8px 25px rgba(79, 70, 229, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.15)',
                      minHeight: '160px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
                        e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.25)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.transform = 'translateY(0) scale(1)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                      }
                    }}
                  >
                    {/* Selection Badge */}
                    {isSelected && (
                      <div style={{
                        position: 'absolute',
                        top: '0.75rem',
                        right: '0.75rem',
                        background: 'rgba(255,255,255,0.95)',
                        color: '#4f46e5',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.5rem',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        backdropFilter: 'blur(10px)',
                        zIndex: 2
                      }}>
                        ✓ SELECTED
                      </div>
                    )}

                    {/* Card Header */}
                    <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                      <div style={{ 
                        fontSize: '2rem', 
                        marginBottom: '0.5rem',
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                      }}>
                        {getShieldIcon()}
                      </div>
                      <div style={{ 
                        fontWeight: 'bold', 
                        color: 'white',
                        fontSize: '1.1rem',
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                        marginBottom: '0.25rem'
                      }}>
                        {player.displayName}
                      </div>
                      <div style={{ 
                        color: 'rgba(255,255,255,0.9)',
                        fontSize: '0.875rem',
                        textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                      }}>
                        Level {player.level}
                      </div>
                    </div>

                    {/* Player Stats */}
                    <div style={{ 
                      background: 'rgba(255,255,255,0.95)',
                      padding: '1rem',
                      borderRadius: '0.75rem',
                      backdropFilter: 'blur(10px)'
                    }}>
                      <div style={{ 
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '0.75rem',
                        marginBottom: '0.75rem'
                      }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>POWER POINTS</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#f59e0b' }}>
                            {player.powerPoints.toLocaleString()}
                          </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>SHIELD STATUS</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#059669' }}>
                            {player.shieldStrength || 0}/{player.maxShieldStrength || 50}
                          </div>
                        </div>
                      </div>

                      {/* Shield Bar */}
                      <div style={{ 
                        background: 'rgba(0,0,0,0.1)',
                        borderRadius: '0.5rem',
                        height: '0.5rem',
                        overflow: 'hidden',
                        marginBottom: '0.5rem'
                      }}>
                        <div style={{
                          background: shieldPercentage >= 80 ? '#10b981' : shieldPercentage >= 50 ? '#f59e0b' : '#ef4444',
                          height: '100%',
                          width: `${shieldPercentage}%`,
                          transition: 'width 0.3s ease',
                          borderRadius: '0.5rem'
                        }} />
                      </div>

                      {/* Shield Status Text */}
                      <div style={{ 
                        textAlign: 'center',
                        fontSize: '0.75rem',
                        color: '#6b7280',
                        fontWeight: '500'
                      }}>
                        {shieldPercentage >= 80 ? '🛡️ Well Protected' : 
                         shieldPercentage >= 50 ? '⚠️ Moderate Defense' : 
                         '💥 Vulnerable Target'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Target Vault Info */}
        {targetVault && (
          <div style={{ marginBottom: '2rem', padding: '1rem', background: '#f9fafb', borderRadius: '8px' }}>
            <h4 style={{ marginBottom: '0.5rem', color: '#374151' }}>Target Vault Status</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Shield Strength</span>
                <div style={{ fontWeight: 'bold', color: '#2563eb' }}>
                  {targetVault.shieldStrength} / {targetVault.maxShieldStrength}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Firewall</span>
                <div style={{ fontWeight: 'bold', color: '#7c3aed' }}>
                  {targetVault.firewall}%
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Current PP</span>
                <div style={{ fontWeight: 'bold', color: '#059669' }}>
                  {targetVault.currentPP} / {targetVault.capacity}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Move Selection */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', color: '#374151' }}>Select Moves</h3>
            <div style={{ 
              fontSize: '0.875rem', 
              color: '#6b7280',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span>Selected: {selectedMoves.length}</span>
              <span>•</span>
              <span>Available: {getRemainingOfflineMoves() - selectedActionCards.length}</span>
            </div>
          </div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
            gap: '1rem' 
          }}>
            {unlockedMoves.map(move => {
              const isSelected = selectedMoves.includes(move.id);
              const shieldDamage = MOVE_DAMAGE_VALUES[move.name]?.shieldDamage || 0;
              const ppSteal = MOVE_DAMAGE_VALUES[move.name]?.ppSteal || 0;
              
              // Determine card background based on move category and selection
              const getCardBackground = () => {
                if (isSelected) {
                  return 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)';
                } else if (move.category === 'manifest') {
                  return 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)';
                } else if (move.category === 'elemental') {
                  return 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)';
                } else {
                  return 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
                }
              };

              // Get move type icon
              const getMoveIcon = () => {
                if (move.category === 'manifest') return '⭐';
                if (move.category === 'elemental') return '🔥';
                return '⚙️';
              };

              return (
                <div
                  key={move.id}
                  onClick={() => handleMoveToggle(move.id)}
                  style={{
                    background: getCardBackground(),
                    border: `2px solid ${isSelected ? '#ffffff' : 'rgba(255,255,255,0.2)'}`,
                    borderRadius: '12px',
                    padding: '1.25rem',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: isSelected ? '0 8px 25px rgba(79, 70, 229, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.15)',
                    minHeight: '160px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden',
                    opacity: move.unlocked ? 1 : 0.6,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
                      e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.25)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.transform = 'translateY(0) scale(1)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                    }
                  }}
                >
                  {/* Selection Badge */}
                  {isSelected && (
                    <div style={{
                      position: 'absolute',
                      top: '0.75rem',
                      right: '0.75rem',
                      background: 'rgba(255,255,255,0.95)',
                      color: '#4f46e5',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      backdropFilter: 'blur(10px)',
                      zIndex: 2
                    }}>
                      ✓ SELECTED
                    </div>
                  )}

                  {/* Card Header */}
                  <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                    <div style={{ 
                      fontSize: '2rem', 
                      marginBottom: '0.5rem',
                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                    }}>
                      {getMoveIcon()}
                    </div>
                    <div style={{ 
                      fontWeight: 'bold', 
                      color: 'white',
                      fontSize: '1.1rem',
                      textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                      marginBottom: '0.25rem'
                    }}>
                      {move.name}
                    </div>
                    <div style={{ 
                      color: 'rgba(255,255,255,0.9)',
                      fontSize: '0.875rem',
                      textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                      textTransform: 'uppercase'
                    }}>
                      {move.category === 'manifest' && move.manifestType ? 
                        `${move.manifestType.charAt(0).toUpperCase() + move.manifestType.slice(1)} Manifest` :
                        move.category === 'elemental' && move.elementalAffinity ? 
                        `${move.elementalAffinity.charAt(0).toUpperCase() + move.elementalAffinity.slice(1)} Element` :
                        `${move.category} Move`
                      }
                    </div>
                  </div>

                  {/* Move Stats */}
                  <div style={{ 
                    background: 'rgba(255,255,255,0.95)',
                    padding: '1rem',
                    borderRadius: '0.75rem',
                    backdropFilter: 'blur(10px)'
                  }}>
                    <div style={{ 
                      fontSize: '0.875rem',
                      color: '#374151',
                      lineHeight: '1.4',
                      marginBottom: '0.75rem',
                      textAlign: 'center'
                    }}>
                      {move.description}
                    </div>
                    
                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '0.75rem',
                      marginBottom: '0.75rem'
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>SHIELD DMG</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#dc2626' }}>
                          {shieldDamage}
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>PP STEAL</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#f59e0b' }}>
                          {ppSteal}
                        </div>
                      </div>
                    </div>

                    {/* Move Type Badge */}
                    <div style={{ 
                      textAlign: 'center',
                      fontSize: '0.75rem',
                      color: '#6b7280',
                      fontWeight: '500',
                      textTransform: 'uppercase'
                    }}>
                      {move.type} • {move.category === 'manifest' && move.manifestType ? 
                        move.manifestType.toUpperCase() :
                        move.category === 'elemental' && move.elementalAffinity ? 
                        move.elementalAffinity.toUpperCase() :
                        move.category.toUpperCase()
                      }
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Card Selection */}
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', color: '#374151' }}>Select Action Cards</h3>
            <div style={{ 
              fontSize: '0.875rem', 
              color: '#6b7280',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span>Selected: {selectedActionCards.length}</span>
              <span>•</span>
              <span>Available: {getRemainingOfflineMoves() - selectedMoves.length}</span>
            </div>
          </div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
            gap: '1rem' 
          }}>
            {unlockedCards.map(card => {
              const isSelected = selectedActionCards.includes(card.id);
              const shieldDamage = ACTION_CARD_DAMAGE_VALUES[card.name]?.shieldDamage || 0;
              const ppSteal = ACTION_CARD_DAMAGE_VALUES[card.name]?.ppSteal || 0;
              
              // Determine card background based on selection
              const getCardBackground = () => {
                if (isSelected) {
                  return 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)';
                } else {
                  return 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)';
                }
              };

              return (
                <div
                  key={card.id}
                  onClick={() => handleActionCardToggle(card.id)}
                  style={{
                    background: getCardBackground(),
                    border: `2px solid ${isSelected ? '#ffffff' : 'rgba(255,255,255,0.2)'}`,
                    borderRadius: '12px',
                    padding: '1.25rem',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    boxShadow: isSelected ? '0 8px 25px rgba(79, 70, 229, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.15)',
                    minHeight: '160px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden',
                    opacity: card.unlocked ? 1 : 0.6,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
                      e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.25)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.transform = 'translateY(0) scale(1)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                    }
                  }}
                >
                  {/* Selection Badge */}
                  {isSelected && (
                    <div style={{
                      position: 'absolute',
                      top: '0.75rem',
                      right: '0.75rem',
                      background: 'rgba(255,255,255,0.95)',
                      color: '#4f46e5',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      backdropFilter: 'blur(10px)',
                      zIndex: 2
                    }}>
                      ✓ SELECTED
                    </div>
                  )}

                  {/* Card Header */}
                  <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                    <div style={{ 
                      fontSize: '2rem', 
                      marginBottom: '0.5rem',
                      filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                    }}>
                      🃏
                    </div>
                    <div style={{ 
                      fontWeight: 'bold', 
                      color: 'white',
                      fontSize: '1.1rem',
                      textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                      marginBottom: '0.25rem'
                    }}>
                      {card.name}
                    </div>
                    <div style={{ 
                      color: 'rgba(255,255,255,0.9)',
                      fontSize: '0.875rem',
                      textShadow: '0 1px 2px rgba(0,0,0,0.5)',
                      textTransform: 'uppercase'
                    }}>
                      Action Card
                    </div>
                  </div>

                  {/* Card Stats */}
                  <div style={{ 
                    background: 'rgba(255,255,255,0.95)',
                    padding: '1rem',
                    borderRadius: '0.75rem',
                    backdropFilter: 'blur(10px)'
                  }}>
                    <div style={{ 
                      fontSize: '0.875rem',
                      color: '#374151',
                      lineHeight: '1.4',
                      marginBottom: '0.75rem',
                      textAlign: 'center'
                    }}>
                      {card.description}
                    </div>
                    
                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '0.75rem',
                      marginBottom: '0.75rem'
                    }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>SHIELD DMG</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#dc2626' }}>
                          {shieldDamage}
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>PP STEAL</div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#f59e0b' }}>
                          {ppSteal}
                        </div>
                      </div>
                    </div>

                    {/* Card Info */}
                    <div style={{ 
                      textAlign: 'center',
                      fontSize: '0.75rem',
                      color: '#6b7280',
                      fontWeight: '500',
                      textTransform: 'uppercase'
                    }}>
                      Uses: {card.uses}/{card.maxUses} • {card.rarity}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Attack Button */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: '#6b7280',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleAttack}
            disabled={!selectedTarget || (!selectedMoves.length && !selectedActionCards.length) || loading || getRemainingOfflineMoves() === 0}
            style={{
              background: !selectedTarget || (!selectedMoves.length && !selectedActionCards.length) || loading || getRemainingOfflineMoves() === 0 ? '#9ca3af' : '#dc2626',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '6px',
              cursor: !selectedTarget || (!selectedMoves.length && !selectedActionCards.length) || loading || getRemainingOfflineMoves() === 0 ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
            }}
          >
            {loading ? 'Executing Attack...' : getRemainingOfflineMoves() === 0 ? 'No Offline Moves Remaining' : 'Launch Vault Siege!'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VaultSiegeModal; 