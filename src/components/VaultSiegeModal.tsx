import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
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
        const studentsSnapshot = await getDocs(collection(db, 'students'));
        const availablePlayers: Player[] = [];
        
        studentsSnapshot.forEach((doc) => {
          const data = doc.data();
          if (doc.id !== currentUser.uid) {
            availablePlayers.push({
              uid: doc.id,
              displayName: data.displayName || 'Unknown Player',
              powerPoints: data.powerPoints || 0,
              level: data.level || 1,
            });
          }
        });

        // Load vault data for each player to get shield information
        for (const player of availablePlayers) {
          try {
            const vaultDoc = await getDoc(doc(db, 'vaults', player.uid));
            if (vaultDoc.exists()) {
              const vaultData = vaultDoc.data();
              player.shieldStrength = vaultData.shieldStrength || 0;
              player.maxShieldStrength = vaultData.maxShieldStrength || 50;
            }
          } catch (error) {
            console.error('Error loading vault for player:', player.uid, error);
          }
        }
        
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
        await executeVaultSiegeAttack('', selectedTarget, cardId);
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
              gap: '0.5rem',
              fontSize: '0.875rem',
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
                <button
                  onClick={syncVaultPP}
                  style={{
                    background: '#10b981',
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
              )}
            </div>
          </div>
        )}

        {/* Target Selection */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#374151' }}>Select Target Vault</h3>
          {loading ? (
            <div>Loading players...</div>
          ) : (
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              {players.map(player => (
                <div
                  key={player.uid}
                  onClick={() => setSelectedTarget(player.uid)}
                  style={{
                    padding: '1rem',
                    border: `2px solid ${selectedTarget === player.uid ? '#4f46e5' : '#e5e7eb'}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: selectedTarget === player.uid ? '#f3f4f6' : 'white',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', color: '#1f2937' }}>{player.displayName}</div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                        Level {player.level} • {player.powerPoints} PP
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#059669' }}>
                        🛡️ Shield: {player.shieldStrength || 0}/{player.maxShieldStrength || 50}
                      </div>
                    </div>
                    {selectedTarget === player.uid && (
                      <span style={{ color: '#4f46e5', fontWeight: 'bold' }}>✓ Selected</span>
                    )}
                  </div>
                </div>
              ))}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            {unlockedMoves.map(move => (
              <div
                key={move.id}
                onClick={() => handleMoveToggle(move.id)}
                style={{
                  padding: '1rem',
                  border: `2px solid ${selectedMoves.includes(move.id) ? '#4f46e5' : '#e5e7eb'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: selectedMoves.includes(move.id) ? '#f3f4f6' : 'white',
                  opacity: move.unlocked ? 1 : 0.6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 'bold', color: '#1f2937' }}>{move.name}</div>
                  {selectedMoves.includes(move.id) && (
                    <span style={{ color: '#4f46e5', fontWeight: 'bold' }}>✓</span>
                  )}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  {move.description}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#374151' }}>
                  Cost: 1 Move • Shield: {MOVE_DAMAGE_VALUES[move.name]?.shieldDamage || 0} • PP: {MOVE_DAMAGE_VALUES[move.name]?.ppSteal || 0}
                </div>
              </div>
            ))}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
            {unlockedCards.map(card => (
              <div
                key={card.id}
                onClick={() => handleActionCardToggle(card.id)}
                style={{
                  padding: '1rem',
                  border: `2px solid ${selectedActionCards.includes(card.id) ? '#4f46e5' : '#e5e7eb'}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: selectedActionCards.includes(card.id) ? '#f3f4f6' : 'white',
                  opacity: card.unlocked ? 1 : 0.6,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 'bold', color: '#1f2937' }}>{card.name}</div>
                  {selectedActionCards.includes(card.id) && (
                    <span style={{ color: '#4f46e5', fontWeight: 'bold' }}>✓</span>
                  )}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                  {card.description}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#374151' }}>
                  Uses: {card.uses}/{card.maxUses} • {card.rarity}
                  {ACTION_CARD_DAMAGE_VALUES[card.name] && (
                    <div style={{ marginTop: '0.25rem' }}>
                      Shield: {ACTION_CARD_DAMAGE_VALUES[card.name]?.shieldDamage || 0} • PP: {ACTION_CARD_DAMAGE_VALUES[card.name]?.ppSteal || 0}
                    </div>
                  )}
                </div>
              </div>
            ))}
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