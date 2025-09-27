import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, updateDoc, addDoc } from 'firebase/firestore';
import { MOVE_DAMAGE_VALUES, ACTION_CARD_DAMAGE_VALUES, BATTLE_CONSTANTS } from '../types/battle';

interface VaultSiegeModalProps {
  isOpen: boolean;
  onClose: () => void;
  battleId?: string;
  onAttackComplete?: () => void;
}

interface Player {
  uid: string;
  displayName: string;
  powerPoints: number;
  level: number;
  shieldStrength?: number;
  maxShieldStrength?: number;
}

const VaultSiegeModal = ({ isOpen, onClose, battleId, onAttackComplete }: VaultSiegeModalProps) => {
  console.log('VaultSiegeModal: Component rendered with isOpen:', isOpen);
  const { currentUser } = useAuth();
  const { vault, moves, actionCards, executeVaultSiegeAttack, syncVaultPP, syncStudentPP, refreshVaultData, getRemainingOfflineMoves, offlineMoves, attackHistory } = useBattle();
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [selectedMoves, setSelectedMoves] = useState<string[]>([]);
  const [selectedActionCards, setSelectedActionCards] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Debug loading state changes
  useEffect(() => {
    console.log('🔄 Loading state changed:', loading);
  }, [loading]);
  const [targetVault, setTargetVault] = useState<any>(null);
  const [attackResults, setAttackResults] = useState<any>(null);
  const [remainingMoves, setRemainingMoves] = useState<number>(0);
  const modalRef = useRef<HTMLDivElement>(null);

  // Debug effect to check if modal is rendered
  useEffect(() => {
    if (isOpen && modalRef.current) {
      console.log('VaultSiegeModal: Modal element found in DOM:', modalRef.current);
      console.log('VaultSiegeModal: Modal element styles:', window.getComputedStyle(modalRef.current));
      console.log('VaultSiegeModal: Modal element rect:', modalRef.current.getBoundingClientRect());
    }
  }, [isOpen]);

  // Update remaining moves when offline moves or attack history changes
  useEffect(() => {
    const moves = getRemainingOfflineMoves();
    setRemainingMoves(moves);
    console.log('VaultSiegeModal: Updated remaining moves:', moves);
  }, [offlineMoves, attackHistory, getRemainingOfflineMoves]);

  // Function to restore a move for 20 PP
  const handleRestoreMove = async () => {
    console.log('VaultSiegeModal: handleRestoreMove function called!');
    
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
      console.log('VaultSiegeModal: PP deduction - current:', vault.currentPP, 'new:', newPP);
      
      // Create a move_restore record to track the restoration
      const restoreMoveData = {
        userId: currentUser.uid,
        type: 'move_restore' as const,
        status: 'completed' as const,
        createdAt: new Date(),
      };
      
      console.log('VaultSiegeModal: Creating restore record:', restoreMoveData);
      await addDoc(collection(db, 'offlineMoves'), restoreMoveData);
      
      // Update vault in Firestore
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      console.log('VaultSiegeModal: Updating vault PP in Firestore to:', newPP);
      await updateDoc(vaultRef, {
        currentPP: newPP,
      });

      // Update local state
      console.log('VaultSiegeModal: Syncing vault PP...');
      await syncVaultPP();
      
      // Force refresh of vault data
      await refreshVaultData();
      
      // Recalculate remaining moves
      const currentMovesRemaining = getRemainingOfflineMoves();
      console.log('VaultSiegeModal: Recalculated remaining moves:', currentMovesRemaining);
      
      // Update local state
      setRemainingMoves(currentMovesRemaining);
      
      setAttackResults({
        success: true,
        message: `Move restored! Spent 20 PP. You now have ${currentMovesRemaining} moves remaining.`,
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
    try {
      console.log('🚀 handleAttack called!', {
        selectedTarget,
        currentUserId: currentUser?.uid,
        isAttackingSelf: selectedTarget === currentUser?.uid,
        selectedMoves,
        selectedActionCards,
        remainingOfflineMoves: getRemainingOfflineMoves()
      });
      
      if (!selectedTarget || (!selectedMoves.length && !selectedActionCards.length)) {
        alert('Please select a target and at least one move or action card.');
        return;
      }

      // Prevent attacking yourself
      if (selectedTarget === currentUser?.uid) {
        alert('You cannot attack yourself! Please select a different target.');
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
      console.log('⚔️ Starting attack execution...');
      let totalPPStolen = 0;
      let totalXP = 0;
      let totalShieldDamage = 0;
      let allMessages: string[] = [];
      let usedMoves: string[] = [];
      let overshieldBlocked = false;

      console.log('⚔️ Executing moves:', selectedMoves);
      console.log('🚨 VAULT SIEGE ATTACK STARTING - This should appear in console!');
      // Execute each selected move
      for (const moveId of selectedMoves) {
        console.log('🔥 About to call executeVaultSiegeAttack with:', { moveId, selectedTarget });
        const result = await executeVaultSiegeAttack(moveId, selectedTarget);
        console.log('🔥 executeVaultSiegeAttack returned:', result);
        if (result?.success) {
          totalPPStolen += result.ppStolen || 0;
          totalXP += result.xpGained || 0;
          totalShieldDamage += result.shieldDamage || 0;
          if (result.overshieldAbsorbed) {
            overshieldBlocked = true;
          }
          if (result.message) {
            allMessages.push(result.message);
            // Extract move name from the message (format: "Used MoveName - ...")
            const moveNameMatch = result.message.match(/Used ([^-]+) -/);
            if (moveNameMatch) {
              usedMoves.push(moveNameMatch[1].trim());
            }
          }
        }
      }

      // Execute each selected action card
      for (const cardId of selectedActionCards) {
        const result = await executeVaultSiegeAttack(null, selectedTarget, cardId);
        if (result?.success) {
          totalPPStolen += result.ppStolen || 0;
          totalXP += result.xpGained || 0;
          totalShieldDamage += result.shieldDamage || 0;
          if (result.overshieldAbsorbed) {
            overshieldBlocked = true;
          }
          if (result.message) {
            allMessages.push(result.message);
            // Extract action card name from the message (format: "Used CardName - ...")
            const cardNameMatch = result.message.match(/Used ([^-]+) -/);
            if (cardNameMatch) {
              usedMoves.push(cardNameMatch[1].trim());
            }
          }
        }
      }

      // Show success message with actual PP and XP gains
      const targetName = players.find(p => p.uid === selectedTarget)?.displayName || 'Unknown';
      const successMessage = totalPPStolen > 0 
        ? `Attack successful! Stole ${totalPPStolen} PP and earned ${totalXP} XP from ${targetName}!`
        : `Attack executed against ${targetName}! ${totalShieldDamage > 0 ? `Dealt ${totalShieldDamage} shield damage.` : ''}`;

      setAttackResults({
        success: true,
        message: successMessage,
        movesUsed: selectedMoves.length,
        cardsUsed: selectedActionCards.length,
        ppGained: totalPPStolen,
        xpGained: totalXP,
        shieldDamage: totalShieldDamage,
        details: allMessages.join(' • '),
        usedMoves: usedMoves
      });

      // Show notification for actual gains
      console.log('🎉 Vault Siege Results:', {
        ppStolen: totalPPStolen,
        xpGained: totalXP,
        shieldDamage: totalShieldDamage,
        targetName: targetName
      });
      
      if (overshieldBlocked) {
        // Show overshield blocking message
        const movesUsedText = usedMoves.length > 0 ? `\n⚔️ Move Used: ${usedMoves.join(', ')}` : '';
        alert(`✨ Attack blocked by overshield!\n\n🛡️ Shield Damage: ${totalShieldDamage}\n💰 PP Stolen: ${totalPPStolen}\n⚡ XP Earned: ${totalXP}\n🎯 Target: ${targetName}${movesUsedText}`);
      } else if (totalPPStolen > 0 || totalXP > 0) {
        // Show detailed results with move names
        const movesUsedText = usedMoves.length > 0 ? `\n⚔️ Move Used: ${usedMoves.join(', ')}` : '';
        const resultMessage = `🎉 Attack Results:\n\n💰 PP Stolen: ${totalPPStolen}\n⚡ XP Earned: ${totalXP}\n🛡️ Shield Damage: ${totalShieldDamage}\n🎯 Target: ${targetName}${movesUsedText}`;
        alert(resultMessage);
      } else {
        console.log('⚠️ Vault Siege completed but no gains - this might be because target has no PP to steal or attack was blocked');
        const movesUsedText = usedMoves.length > 0 ? `\n⚔️ Move Used: ${usedMoves.join(', ')}` : '';
        
        // Determine the reason for no gains
        let reasonText = '';
        if (overshieldBlocked) {
          reasonText = '(blocked by overshield)';
        } else if (totalPPStolen === 0) {
          reasonText = '(target had no PP)';
        } else {
          reasonText = '(no damage dealt)';
        }
        
        alert(`⚠️ Attack completed against ${targetName}!\n\n🛡️ Shield Damage: ${totalShieldDamage}\n💰 PP Stolen: ${totalPPStolen} ${reasonText}\n⚡ XP Earned: ${totalXP}${movesUsedText}`);
      }

      // Refresh vault data to show updated PP and XP
      await refreshVaultData();
      
      // Wait a moment for the Firestore listener to update the offlineMoves state
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Automatically trigger debug update after attack to ensure UI consistency
      const currentMovesRemaining = getRemainingOfflineMoves();
      console.log('VaultSiegeModal: Auto-triggering debug update after attack');
      console.log('VaultSiegeModal: Current offline moves:', offlineMoves);
      console.log('VaultSiegeModal: Current attack history:', attackHistory);
      console.log('VaultSiegeModal: Remaining moves after attack:', currentMovesRemaining);
      
      // Update local state to reflect the new remaining moves
      setRemainingMoves(currentMovesRemaining);
      
      // Sync vault PP to ensure it matches student PP
      await syncVaultPP();
      
      // Force a manual refresh of the student data
      if (currentUser) {
        console.log('🔄 Forcing manual refresh of student data...');
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          console.log('📊 Manual refresh - Current student data:', studentData);
        }
      }

      // Reset selections
      setSelectedMoves([]);
      setSelectedActionCards([]);
      setSelectedTarget('');
      
      // Notify parent component that attack is completed
      if (onAttackComplete) {
        console.log('VaultSiegeModal: Calling onAttackComplete callback');
        onAttackComplete();
      }
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

  // Only log when modal state changes to avoid excessive logging
  useEffect(() => {
    if (isOpen) {
      console.log('VaultSiegeModal: Modal opened');
    }
  }, [isOpen]);

  // Debug button state
  useEffect(() => {
    if (isOpen) {
      console.log('🔘 Button state debug:', {
        selectedTarget,
        currentUserId: currentUser?.uid,
        isAttackingSelf: selectedTarget === currentUser?.uid,
        selectedMoves: selectedMoves.length,
        selectedActionCards: selectedActionCards.length,
        loading,
        remainingOfflineMoves: getRemainingOfflineMoves(),
        buttonDisabled: !selectedTarget || (!selectedMoves.length && !selectedActionCards.length) || loading || getRemainingOfflineMoves() === 0
      });
    }
  }, [isOpen, selectedTarget, selectedMoves, selectedActionCards, loading, currentUser]);
  
  if (!isOpen) return null;

  const modalContent = (
    <div 
      ref={modalRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(255, 0, 0, 0.8)', // Changed to bright red background
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 999999,
        pointerEvents: 'auto',
        width: '100vw',
        height: '100vh',
        border: '10px solid yellow', // Added bright yellow border
      }}>
      <div style={{
        background: 'lime', // Changed to bright lime background
        borderRadius: '12px',
        padding: '2rem',
        maxWidth: '800px',
        maxHeight: '90vh',
        overflow: 'auto',
        width: '90%',
        border: '10px solid blue', // Changed to bright blue border
        boxShadow: '0 0 100px rgba(0, 255, 0, 1)', // Bright green shadow
        position: 'relative',
        zIndex: 1000000,
        color: 'black', // Ensure text is visible
        fontSize: '16px', // Ensure text size is readable
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
                  {remainingMoves}/3
                </span>
                
                {/* Restore Move Button */}
                <button
                  onClick={() => {
                    console.log('VaultSiegeModal: Restore Move button clicked!');
                    console.log('VaultSiegeModal: Current vault PP:', vault?.currentPP);
                    console.log('VaultSiegeModal: Loading state:', loading);
                    console.log('VaultSiegeModal: Button disabled state:', loading || !vault || vault.currentPP < 20);
                    if (!loading && vault && vault.currentPP >= 20) {
                      handleRestoreMove();
                    } else {
                      console.log('VaultSiegeModal: Button is disabled or conditions not met');
                    }
                  }}
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
                    {attackResults.usedMoves && attackResults.usedMoves.length > 0 && (
                      <p style={{ color: '#7c3aed', fontWeight: 'bold', fontSize: '0.875rem' }}>
                        ⚔️ Moves Used: {attackResults.usedMoves.join(', ')}
                      </p>
                    )}
                    {attackResults.ppGained > 0 && (
                      <p style={{ color: '#059669', fontWeight: 'bold' }}>
                        💰 Stole {attackResults.ppGained} PP!
                      </p>
                    )}
                    {attackResults.xpGained > 0 && (
                      <p style={{ color: '#fbbf24', fontWeight: 'bold' }}>
                        ⚡ Earned {attackResults.xpGained} XP!
                      </p>
                    )}
                    {attackResults.shieldDamage > 0 && (
                      <p style={{ color: '#ef4444', fontWeight: 'bold' }}>
                        🛡️ Dealt {attackResults.shieldDamage} shield damage!
                      </p>
                    )}
                    {attackResults.details && (
                      <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
                        {attackResults.details}
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
                    onClick={() => {
                      console.log('VaultSiegeModal: Player clicked:', {
                        playerUid: player.uid,
                        playerName: player.displayName,
                        currentSelectedTarget: selectedTarget,
                        willSetTo: player.uid
                      });
                      setSelectedTarget(player.uid);
                    }}
                    onMouseDown={() => {
                      console.log('VaultSiegeModal: Player mousedown:', player.displayName);
                    }}
                    onMouseUp={() => {
                      console.log('VaultSiegeModal: Player mouseup:', player.displayName);
                    }}
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
                                <span>Available: {remainingMoves - selectedActionCards.length}</span>
            </div>
          </div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
            gap: '1rem' 
          }}>
            {unlockedMoves.map(move => {
              const isSelected = selectedMoves.includes(move.id);
              const totalDamage = MOVE_DAMAGE_VALUES[move.name]?.damage || 0;
              
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
                    
                    {totalDamage > 0 && (
                      <div style={{ 
                        display: 'grid',
                        gridTemplateColumns: '1fr',
                        gap: '0.75rem',
                        marginBottom: '0.75rem'
                      }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>DAMAGE</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#dc2626' }}>
                            {totalDamage}
                          </div>
                        </div>
                      </div>
                    )}

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
                                <span>Available: {remainingMoves - selectedMoves.length}</span>
            </div>
          </div>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
            gap: '1rem' 
          }}>
            {unlockedCards.map(card => {
              const isSelected = selectedActionCards.includes(card.id);
              const totalDamage = ACTION_CARD_DAMAGE_VALUES[card.name]?.damage || 0;
              
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
                    
                    {totalDamage > 0 && (
                      <div style={{ 
                        display: 'grid',
                        gridTemplateColumns: '1fr',
                        gap: '0.75rem',
                        marginBottom: '0.75rem'
                      }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>DAMAGE</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#dc2626' }}>
                            {totalDamage}
                          </div>
                        </div>
                      </div>
                    )}

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

        {/* Sync and Attack Buttons */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            onClick={async () => {
              console.log('🔄 Manual sync button clicked');
              if (selectedTarget) {
                // Get target's vault data before sync
                const targetVaultRef = doc(db, 'vaults', selectedTarget);
                const targetVaultDoc = await getDoc(targetVaultRef);
                const targetVaultPP = targetVaultDoc.exists() ? (targetVaultDoc.data().currentPP || 0) : 0;
                
                // Get target's student data before sync
                const targetStudentRef = doc(db, 'students', selectedTarget);
                const targetStudentDoc = await getDoc(targetStudentRef);
                const targetStudentPP = targetStudentDoc.exists() ? (targetStudentDoc.data().powerPoints || 0) : 0;
                
                console.log('🔍 Target data BEFORE sync:', {
                  targetId: selectedTarget,
                  vaultPP: targetVaultPP,
                  studentPP: targetStudentPP
                });
                
                await syncStudentPP(selectedTarget);
                console.log('✅ Target PP synced');
                
                // Get target's vault data after sync
                const targetVaultDocAfter = await getDoc(targetVaultRef);
                const targetVaultPPAfter = targetVaultDocAfter.exists() ? (targetVaultDocAfter.data().currentPP || 0) : 0;
                
                console.log('🔍 Target data AFTER sync:', {
                  targetId: selectedTarget,
                  vaultPP: targetVaultPPAfter
                });
              }
            }}
            style={{
              background: '#10b981',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            🔄 Sync Target PP
          </button>
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
            onClick={(e) => {
              console.log('🔘 Attack button clicked!', {
                selectedTarget,
                selectedMoves,
                selectedActionCards,
                loading,
                remainingOfflineMoves: getRemainingOfflineMoves(),
                disabled: !selectedTarget || (!selectedMoves.length && !selectedActionCards.length) || loading || getRemainingOfflineMoves() === 0
              });
              console.log('🔘 Button state check:', {
                hasTarget: !!selectedTarget,
                hasMoves: selectedMoves.length > 0,
                hasActionCards: selectedActionCards.length > 0,
                hasAnySelection: selectedMoves.length > 0 || selectedActionCards.length > 0,
                isLoading: loading,
                offlineMoves: getRemainingOfflineMoves()
              });
              handleAttack();
            }}
                              disabled={!selectedTarget || (!selectedMoves.length && !selectedActionCards.length) || loading || remainingMoves === 0}
            style={{
                              background: !selectedTarget || (!selectedMoves.length && !selectedActionCards.length) || loading || remainingMoves === 0 ? '#9ca3af' : '#dc2626',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '6px',
                              cursor: !selectedTarget || (!selectedMoves.length && !selectedActionCards.length) || loading || remainingMoves === 0 ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
            }}
          >
                          {loading ? 'Executing Attack...' : remainingMoves === 0 ? 'No Offline Moves Remaining' : 'Launch Vault Siege!'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default VaultSiegeModal; 