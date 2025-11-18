import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { db } from '../firebase';
import { collection, getDocs, doc, getDoc, updateDoc, addDoc } from 'firebase/firestore';
import { MOVE_DAMAGE_VALUES, ACTION_CARD_DAMAGE_VALUES, BATTLE_CONSTANTS } from '../types/battle';
import { getMoveDamageSync, getMoveNameSync, getMoveDescriptionSync } from '../utils/moveOverrides';
import { calculateDamageRange, formatDamageRange } from '../utils/damageCalculator';
import { trackMoveUsage } from '../utils/manifestTracking';

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
  overshield?: number;
}

const VaultSiegeModal = ({ isOpen, onClose, battleId, onAttackComplete }: VaultSiegeModalProps) => {
  console.log('VaultSiegeModal: Component rendered with isOpen:', isOpen);
  const { currentUser } = useAuth();
  const { vault, moves, actionCards, executeVaultSiegeAttack, syncVaultPP, syncStudentPP, refreshVaultData, getRemainingOfflineMoves, offlineMoves, attackHistory } = useBattle();
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('none'); // 'none', 'most-vulnerable', 'lowest-shield', 'highest-pp'
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

  // Debug attackResults changes
  useEffect(() => {
    console.log('🔄 attackResults state changed:', attackResults);
    if (attackResults) {
      console.log('✅ Attack results popup should be visible:', {
        success: attackResults.success,
        message: attackResults.message,
        hasPopup: !!attackResults,
        timestamp: new Date().toISOString()
      });
      // Log when popup should render
      setTimeout(() => {
        const popupElement = document.querySelector('[data-attack-results-popup]');
        console.log('🔍 Checking if popup DOM element exists:', !!popupElement);
        if (popupElement) {
          console.log('✅ Popup DOM element found!', popupElement);
        } else {
          console.log('❌ Popup DOM element NOT found in document!');
        }
      }, 100);
    } else {
      console.log('❌ Attack results cleared');
    }
  }, [attackResults]);

  // Helper to get "day" start time (8am EST) for a given date
  const getDayStartForDate = (date: Date): Date => {
    const estOffset = -5; // EST is UTC-5
    const estDate = new Date(date.getTime() + (estOffset * 60 - date.getTimezoneOffset()) * 60000);
    const dayStart = new Date(estDate);
    dayStart.setHours(8, 0, 0, 0);
    if (estDate < dayStart) {
      dayStart.setDate(dayStart.getDate() - 1);
    }
    return new Date(dayStart.getTime() - (estOffset * 60 - date.getTimezoneOffset()) * 60000);
  };

  const getCurrentDayStart = (): Date => {
    return getDayStartForDate(new Date());
  };

  // Calculate restore cost based on restores purchased today
  const calculateRestoreCost = (): number => {
    if (!currentUser || !offlineMoves) return 100;
    
    const today = getCurrentDayStart();
    const todayRestores = offlineMoves.filter(move => {
      if (!move.createdAt || move.type !== 'move_restore' || move.userId !== currentUser.uid) {
        return false;
      }
      
      try {
        let moveDate: Date;
        if (move.createdAt && typeof move.createdAt === 'object' && 'toDate' in move.createdAt) {
          moveDate = (move.createdAt as any).toDate();
        } else if (move.createdAt instanceof Date) {
          moveDate = move.createdAt;
        } else if (typeof move.createdAt === 'string') {
          moveDate = new Date(move.createdAt);
        } else {
          return false;
        }
        
        const moveDayStart = getDayStartForDate(moveDate);
        return moveDayStart.getTime() === today.getTime();
      } catch (error) {
        return false;
      }
    });
    
    return 100 + (todayRestores.length * 100);
  };

  // Function to restore a move (dynamic cost based on purchases today)
  const handleRestoreMove = async () => {
    console.log('VaultSiegeModal: handleRestoreMove function called!');
    
    if (!currentUser || !vault) return;
    
    const cost = calculateRestoreCost();
    
    if (vault.currentPP < cost) {
      setAttackResults({
        success: false,
        message: `Not enough PP! You need ${cost} PP to restore a move.`,
      });
      return;
    }

    try {
      setLoading(true);
      
      // Update vault PP
      const newPP = vault.currentPP - cost;
      console.log('VaultSiegeModal: PP deduction - current:', vault.currentPP, 'new:', newPP, 'cost:', cost);
      
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
        message: `Move restored! Spent ${cost} PP. You now have ${currentMovesRemaining} moves remaining.`,
        ppSpent: cost,
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

  // Reset selections when modal opens (but preserve attackResults if attack just completed)
  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    // Only reset if modal is transitioning from closed to open
    if (isOpen && !prevIsOpenRef.current) {
      setSelectedMoves([]);
      setSelectedActionCards([]);
      setSelectedTarget('');
      setSearchQuery('');
      setFilterType('none');
      // Only clear attackResults when modal FIRST opens (not on every render)
      setAttackResults(null);
      console.log('VaultSiegeModal: Modal opened, resetting state');
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  // Filter and sort players based on search query and filter type
  useEffect(() => {
    let filtered = [...players];
    
    // Apply search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(player => 
        player.displayName.toLowerCase().includes(query) ||
        player.uid.toLowerCase().includes(query) // This will match email if uid is email
      );
    }
    
    // Apply sorting/filtering based on filter type
    switch (filterType) {
      case 'most-vulnerable':
        // Most vulnerable = lowest shield percentage + lowest PP
        filtered.sort((a, b) => {
          const aShieldPercent = ((a.shieldStrength || 0) / (a.maxShieldStrength || 50)) * 100;
          const bShieldPercent = ((b.shieldStrength || 0) / (b.maxShieldStrength || 50)) * 100;
          const aVulnerability = aShieldPercent + (a.powerPoints || 0) / 1000; // Normalize PP
          const bVulnerability = bShieldPercent + (b.powerPoints || 0) / 1000;
          return aVulnerability - bVulnerability; // Lower = more vulnerable
        });
        break;
      case 'lowest-shield':
        // Sort by lowest shield percentage first
        filtered.sort((a, b) => {
          const aShieldPercent = ((a.shieldStrength || 0) / (a.maxShieldStrength || 50)) * 100;
          const bShieldPercent = ((b.shieldStrength || 0) / (b.maxShieldStrength || 50)) * 100;
          return aShieldPercent - bShieldPercent;
        });
        break;
      case 'highest-pp':
        // Sort by highest PP first
        filtered.sort((a, b) => {
          return (b.powerPoints || 0) - (a.powerPoints || 0);
        });
        break;
      default:
        // No additional sorting
        break;
    }
    
    setFilteredPlayers(filtered);
  }, [players, searchQuery, filterType]);

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
              player.overshield = vaultData.overshield || 0;
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
        setFilteredPlayers(availablePlayers);
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
          // Don't allow selecting more moves than available
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
          // Don't allow selecting more action cards than available
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
        console.log('Please select a target and at least one move or action card.');
        return;
      }

      // Prevent attacking yourself
      if (selectedTarget === currentUser?.uid) {
        console.log('You cannot attack yourself! Please select a different target.');
        return;
      }

      // Check if player has enough offline moves
      const totalMovesToUse = selectedMoves.length + selectedActionCards.length;
      const remainingOfflineMoves = getRemainingOfflineMoves();
      
      if (totalMovesToUse > remainingOfflineMoves) {
        console.log(`Not enough offline moves! You have ${remainingOfflineMoves} moves remaining today, but trying to use ${totalMovesToUse} moves.`);
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
        // Get move name before execution for tracking
        const move = moves.find(m => m.id === moveId);
        const moveName = move ? (getMoveNameSync(move.name) || move.name) : null;
        
        const result = await executeVaultSiegeAttack(moveId, selectedTarget);
        console.log('🔥 executeVaultSiegeAttack returned:', result);
        console.log('🔥 Processing move result:', {
          result,
          hasSuccess: !!result?.success,
          ppStolen: result?.ppStolen,
          xpGained: result?.xpGained,
          shieldDamage: result?.shieldDamage,
          message: result?.message
        });
        
        // Track move usage if we have a move name
        if (moveName && currentUser?.uid) {
          trackMoveUsage(currentUser.uid, moveName).catch(err => {
            console.error('Error tracking move usage:', err);
          });
        }
        
        if (result?.success) {
          totalPPStolen += result.ppStolen || 0;
          totalXP += result.xpGained || 0;
          totalShieldDamage += result.shieldDamage || 0;
          if (result.overshieldAbsorbed) {
            overshieldBlocked = true;
          }
          if (result.message) {
            allMessages.push(result.message);
            // Extract move name from the message (format: "Used MoveName - ...") as fallback
            const moveNameMatch = result.message.match(/Used ([^-]+) -/);
            if (moveNameMatch) {
              const extractedMoveName = moveNameMatch[1].trim();
              usedMoves.push(extractedMoveName);
            } else if (moveName) {
              usedMoves.push(moveName);
            }
          } else if (moveName) {
            usedMoves.push(moveName);
          }
        } else {
          console.warn('⚠️ Move execution returned non-success:', result);
          // Still record the attempt even if it failed, so user sees what happened
          if (result?.message) {
            allMessages.push(result.message || 'Move execution completed but no damage dealt');
            // Try to extract move name from message
            const moveNameMatch = result.message.match(/Used ([^-]+) -/);
            if (moveNameMatch) {
              usedMoves.push(moveNameMatch[1].trim());
            } else if (moveName) {
              usedMoves.push(moveName);
            }
          } else if (moveName) {
            allMessages.push(`Used ${moveName} - No effect`);
            usedMoves.push(moveName);
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

      // Always show results, even if no PP was stolen (could be shield damage only)
      const targetName = filteredPlayers.find(p => p.uid === selectedTarget)?.displayName || 
                        players.find(p => p.uid === selectedTarget)?.displayName || 'Unknown';
      
      console.log('📊 Attack summary:', {
        targetName,
        totalPPStolen,
        totalXP,
        totalShieldDamage,
        allMessages: allMessages.length,
        usedMoves: usedMoves.length,
        movesExecuted: selectedMoves.length
      });
      
      // Determine if attack was successful (any damage dealt or PP stolen or XP earned)
      const attackSuccessful = totalPPStolen > 0 || totalShieldDamage > 0 || totalXP > 0 || allMessages.length > 0;
      
      const successMessage = attackSuccessful
        ? (totalPPStolen > 0 
          ? `Attack successful! Stole ${totalPPStolen} PP and earned ${totalXP} XP from ${targetName}!`
          : totalShieldDamage > 0
          ? `Attack executed against ${targetName}! Dealt ${totalShieldDamage} shield damage.${totalXP > 0 ? ` Earned ${totalXP} XP.` : ''}`
          : totalXP > 0
          ? `Attack completed against ${targetName}! Earned ${totalXP} XP.`
          : `Attack executed against ${targetName}!`)
        : `Attack completed against ${targetName}.`;

      const results = {
        success: attackSuccessful || selectedMoves.length > 0 || selectedActionCards.length > 0, // Always true if moves were used
        message: successMessage,
        movesUsed: selectedMoves.length,
        cardsUsed: selectedActionCards.length,
        ppGained: totalPPStolen,
        xpGained: totalXP,
        shieldDamage: totalShieldDamage,
        details: allMessages.join(' • '),
        usedMoves: usedMoves
      };
      
      console.log('✅ Setting attack results:', results);
      console.log('✅ About to call setAttackResults with:', JSON.stringify(results, null, 2));
      
      // Set attackResults immediately - this will trigger the popup
      console.log('✅ Setting attackResults NOW:', results);
      setAttackResults(results);
      
      // Log after setting to verify
      console.log('✅ setAttackResults called. Current attackResults state should be:', results);
      
      // Ensure it persists even after async operations
      setTimeout(() => {
        console.log('✅ Verifying attackResults persistence after delay...');
        setAttackResults((prevResults: any) => {
          if (prevResults) {
            console.log('✅ attackResults persisted:', prevResults);
            return prevResults; // Keep existing results
          } else {
            console.log('⚠️ attackResults was cleared! Restoring...');
            return results; // Restore if somehow cleared
          }
        });
      }, 100);

      // Show notification for actual gains
      console.log('🎉 Vault Siege Results:', {
        ppStolen: totalPPStolen,
        xpGained: totalXP,
        shieldDamage: totalShieldDamage,
        targetName: targetName
      });
      
      // Results are already displayed in the custom modal via attackResults
      // No need for additional alerts
      console.log('Attack completed:', {
        overshieldBlocked,
        totalPPStolen,
        totalXP,
        totalShieldDamage,
        targetName
      });

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

      // Reset selections (but preserve attackResults for display)
      setSelectedMoves([]);
      setSelectedActionCards([]);
      // Keep selectedTarget temporarily so the success popup can show the target name
      // It will be cleared when starting a new attack or closing modal
      
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
  
  // Separate overlay popup for attack results - render even if modal is closed
  // This allows the popup to persist after attack even if user closes the modal
  const attackResultsPopup = attackResults ? (
    <div
      data-attack-results-popup="true"
      onClick={(e) => {
        // Close if clicking outside the popup
        if (e.target === e.currentTarget) {
          console.log('🎯 Clicked outside popup, closing...');
          setAttackResults(null);
        }
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999999,
        animation: 'fadeIn 0.2s ease-out'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: attackResults.success ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)' : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
          border: `4px solid ${attackResults.success ? '#10b981' : '#ef4444'}`,
          color: attackResults.success ? '#065f46' : '#991b1b',
          padding: '2rem',
          borderRadius: '16px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
          maxWidth: '600px',
          width: '90%',
          position: 'relative',
          animation: 'slideInUp 0.3s ease-out',
          transform: 'scale(1)'
        }}
      >
        {/* Close Button */}
        <button
          onClick={() => setAttackResults(null)}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'rgba(255, 255, 255, 0.8)',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            color: attackResults.success ? '#065f46' : '#991b1b',
            padding: '0.25rem',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
            fontWeight: 'bold'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 1)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ×
        </button>

        {/* Popup Content */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>
            {attackResults.success ? '🎉' : '❌'}
          </div>
          <h2 style={{ 
            fontSize: '1.75rem',
            fontWeight: 'bold',
            marginBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem'
          }}>
            {attackResults.success ? '✅ Attack Successful!' : '❌ Attack Failed'}
          </h2>
          <p style={{ fontSize: '1.1rem', marginBottom: '1.5rem', fontWeight: 500 }}>
            {attackResults.message}
          </p>
        </div>

        {attackResults.success && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.5)',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            <p style={{ marginBottom: '1rem', fontSize: '1rem' }}>
              Used <strong>{attackResults.movesUsed}</strong> moves and <strong>{attackResults.cardsUsed}</strong> action cards.
            </p>
            
            {attackResults.usedMoves && attackResults.usedMoves.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <p style={{ color: '#7c3aed', fontWeight: 'bold', fontSize: '1rem', marginBottom: '0.5rem' }}>
                  ⚔️ Moves Used:
                </p>
                <p style={{ color: '#7c3aed', fontSize: '0.95rem' }}>
                  {attackResults.usedMoves.join(', ')}
                </p>
              </div>
            )}
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
              {attackResults.ppGained > 0 && (
                <div style={{
                  background: 'rgba(5, 150, 105, 0.1)',
                  padding: '1rem',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>💰</div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#059669' }}>
                    {attackResults.ppGained} PP
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#065f46' }}>Stolen</div>
                </div>
              )}
              
              {attackResults.xpGained > 0 && (
                <div style={{
                  background: 'rgba(251, 191, 36, 0.1)',
                  padding: '1rem',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>⚡</div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#fbbf24' }}>
                    {attackResults.xpGained} XP
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#92400e' }}>Earned</div>
                </div>
              )}
              
              {attackResults.shieldDamage > 0 && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  padding: '1rem',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🛡️</div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#ef4444' }}>
                    {attackResults.shieldDamage}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#991b1b' }}>Shield Damage</div>
                </div>
              )}
            </div>

            {attackResults.details && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(0, 0, 0, 0.1)' }}>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', fontStyle: 'italic' }}>
                  {attackResults.details}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button
            onClick={() => setAttackResults(null)}
            style={{
              background: attackResults.success ? '#10b981' : '#ef4444',
              color: 'white',
              border: 'none',
              padding: '0.75rem 2rem',
              borderRadius: '8px',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 6px 8px rgba(0, 0, 0, 0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const modalContent = (
    <>
      <style>
        {`
          .vault-siege-scroll::-webkit-scrollbar {
            height: 8px;
          }
          .vault-siege-scroll::-webkit-scrollbar-track {
            background: #f1f5f9;
            border-radius: 4px;
          }
          .vault-siege-scroll::-webkit-scrollbar-thumb {
            background: #cbd5e1;
            border-radius: 4px;
          }
          .vault-siege-scroll::-webkit-scrollbar-thumb:hover {
            background: #94a3b8;
          }
        `}
      </style>
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
                  const cost = calculateRestoreCost();
                  console.log('VaultSiegeModal: Button disabled state:', loading || !vault || vault.currentPP < cost);
                  if (!loading && vault && vault.currentPP >= cost) {
                      handleRestoreMove();
                    } else {
                      console.log('VaultSiegeModal: Button is disabled or conditions not met');
                    }
                  }}
                disabled={loading || !vault || vault.currentPP < calculateRestoreCost()}
                style={{
                  background: vault && vault.currentPP >= calculateRestoreCost() ? '#10b981' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.5rem',
                  cursor: vault && vault.currentPP >= calculateRestoreCost() ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontWeight: 'bold',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  const cost = calculateRestoreCost();
                  if (vault && vault.currentPP >= cost) {
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  const cost = calculateRestoreCost();
                  if (vault && vault.currentPP >= cost) {
                    e.currentTarget.style.transform = 'scale(1)';
                  }
                }}
              >
                ⚡ Restore Move ({calculateRestoreCost()} PP)
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

        {/* Inline recap (still visible in modal) */}
        {attackResults && (
          <div 
            key={`attack-result-popup-${Date.now()}`}
            style={{
              background: attackResults.success ? '#d1fae5' : '#fee2e2',
              border: `3px solid ${attackResults.success ? '#10b981' : '#ef4444'}`,
              color: attackResults.success ? '#065f46' : '#991b1b',
              padding: '1.5rem',
              borderRadius: '12px',
              marginBottom: '1.5rem',
              marginTop: '1rem',
              boxShadow: '0 8px 16px rgba(0, 0, 0, 0.2)',
              position: 'relative',
              zIndex: 1000,
              animation: 'slideIn 0.3s ease-out'
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ 
                  marginBottom: '0.5rem', 
                  fontSize: '1.25rem',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  {attackResults.success ? '✅ Attack Successful!' : '❌ Attack Failed'}
                </h3>
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
              <button
                onClick={() => {
                  console.log('Closing attack results popup');
                  setAttackResults(null);
                }}
                style={{
                  position: 'absolute',
                  top: '0.75rem',
                  right: '0.75rem',
                  background: 'transparent',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: attackResults.success ? '#065f46' : '#991b1b',
                  padding: '0.25rem',
                  lineHeight: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                ×
              </button>
              {attackResults.success && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                  <button
                    onClick={handleRestoreMove}
                    disabled={loading || !vault || vault.currentPP < calculateRestoreCost()}
                    style={{
                      background: vault && vault.currentPP >= calculateRestoreCost() ? '#10b981' : '#9ca3af',
                      color: 'white',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '4px',
                      cursor: vault && vault.currentPP >= calculateRestoreCost() ? 'pointer' : 'not-allowed',
                      fontSize: '0.875rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    ⚡ Restore Move ({calculateRestoreCost()} PP)
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.1rem', color: '#374151' }}>Select Target Vault</h3>
            <div style={{ 
              fontSize: '0.875rem', 
              color: '#6b7280',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span>Players: {filteredPlayers.length}</span>
              {filterType !== 'none' && (
                <>
                  <span>•</span>
                  <span>
                    {filterType === 'most-vulnerable' && 'Most Vulnerable'}
                    {filterType === 'lowest-shield' && 'Lowest Shield'}
                    {filterType === 'highest-pp' && 'Highest PP'}
                  </span>
                </>
              )}
              {searchQuery && (
                <>
                  <span>•</span>
                  <span>Search: "{searchQuery}"</span>
                </>
              )}
            </div>
          </div>
          
          {/* Filter Buttons */}
          <div style={{ 
            display: 'flex', 
            gap: '0.5rem', 
            marginBottom: '1rem',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={() => setFilterType('none')}
              style={{
                padding: '0.5rem 1rem',
                border: '2px solid #e5e7eb',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                backgroundColor: filterType === 'none' ? '#4f46e5' : 'white',
                color: filterType === 'none' ? 'white' : '#374151',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              All Players
            </button>
            <button
              onClick={() => setFilterType('most-vulnerable')}
              style={{
                padding: '0.5rem 1rem',
                border: '2px solid #e5e7eb',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                backgroundColor: filterType === 'most-vulnerable' ? '#dc2626' : 'white',
                color: filterType === 'most-vulnerable' ? 'white' : '#374151',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              🛡️ Most Vulnerable
            </button>
            <button
              onClick={() => setFilterType('lowest-shield')}
              style={{
                padding: '0.5rem 1rem',
                border: '2px solid #e5e7eb',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                backgroundColor: filterType === 'lowest-shield' ? '#f59e0b' : 'white',
                color: filterType === 'lowest-shield' ? 'white' : '#374151',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              🛡️ Lowest Shield
            </button>
            <button
              onClick={() => setFilterType('highest-pp')}
              style={{
                padding: '0.5rem 1rem',
                border: '2px solid #e5e7eb',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: '500',
                backgroundColor: filterType === 'highest-pp' ? '#10b981' : 'white',
                color: filterType === 'highest-pp' ? 'white' : '#374151',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              ⚡ Highest PP
            </button>
          </div>

          {/* Search Input */}
          <div style={{ marginBottom: '1rem', position: 'relative' }}>
            <input
              type="text"
              placeholder="Search players by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                paddingRight: searchQuery ? '3rem' : '1rem',
                border: '2px solid #e5e7eb',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                backgroundColor: 'white',
                color: '#374151',
                outline: 'none',
                transition: 'border-color 0.2s ease',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#4f46e5';
                e.target.style.boxShadow = '0 0 0 3px rgba(79, 70, 229, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#e5e7eb';
                e.target.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#6b7280',
                  cursor: 'pointer',
                  padding: '0.25rem',
                  borderRadius: '0.25rem',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = '#374151';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = '#6b7280';
                }}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
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
          ) : filteredPlayers.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '2rem', 
              color: '#6b7280',
              background: '#f9fafb',
              borderRadius: '8px'
            }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                {searchQuery ? '🔍' : '👥'}
              </div>
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
                {searchQuery ? 'No Players Found' : 'No Players Available'}
              </div>
              <div style={{ fontSize: '0.875rem' }}>
                {searchQuery 
                  ? `No players match your search for "${searchQuery}". Try a different search term.`
                  : 'There are no other players in the system to attack.'
                }
              </div>
            </div>
          ) : (
            <div 
              className="vault-siege-scroll"
              style={{ 
                display: 'flex', 
                gap: '1rem',
                overflowX: 'auto',
                paddingBottom: '0.5rem',
                scrollbarWidth: 'thin',
                scrollbarColor: '#cbd5e1 #f1f5f9',
                scrollBehavior: 'smooth',
                WebkitOverflowScrolling: 'touch'
              }}>
              {filteredPlayers.map(player => {
                const isSelected = selectedTarget === player.uid;
                const shieldPercentage = ((player.shieldStrength || 0) / (player.maxShieldStrength || 50)) * 100;
                
                // Determine card background based on shield status and overshield
                const getCardBackground = () => {
                  if (isSelected) {
                    return 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)';
                  } else if ((player.overshield || 0) > 0) {
                    // Special golden background for overshield
                    return 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)';
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
                  if ((player.overshield || 0) > 0) return '✨';
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
                      minWidth: '280px',
                      maxWidth: '280px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      position: 'relative',
                      overflow: 'hidden',
                      flexShrink: 0
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
                          {(player.overshield || 0) > 0 && (
                            <div style={{ 
                              marginTop: '0.25rem',
                              padding: '0.125rem 0.375rem',
                              backgroundColor: '#fbbf24',
                              color: '#92400e',
                              borderRadius: '0.25rem',
                              fontSize: '0.625rem',
                              fontWeight: 'bold',
                              display: 'inline-block'
                            }}>
                              ✨ +{player.overshield} Overshield{(player.overshield || 0) > 1 ? 's' : ''}
                            </div>
                          )}
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
                {(targetVault.overshield || 0) > 0 && (
                  <div style={{ 
                    marginTop: '0.25rem',
                    padding: '0.125rem 0.375rem',
                    backgroundColor: '#fbbf24',
                    color: '#92400e',
                    borderRadius: '0.25rem',
                    fontSize: '0.625rem',
                    fontWeight: 'bold',
                    display: 'inline-block'
                  }}>
                    ✨ +{targetVault.overshield} Overshield{(targetVault.overshield || 0) > 1 ? 's' : ''}
                  </div>
                )}
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
          <div 
            className="vault-siege-scroll"
            style={{ 
              display: 'flex', 
              gap: '1rem',
              overflowX: 'auto',
              paddingBottom: '0.5rem',
              scrollbarWidth: 'thin',
              scrollbarColor: '#cbd5e1 #f1f5f9',
              scrollBehavior: 'smooth',
              WebkitOverflowScrolling: 'touch'
            }}>
            {unlockedMoves.map(move => {
              const isSelected = selectedMoves.includes(move.id);
              
              // Get move data and calculate damage range
              // Use the move's actual damage if it exists (from upgrades), otherwise use lookup
              let baseDamage: number;
              if (move.damage && move.damage > 0) {
                // Use the upgraded damage directly
                baseDamage = move.damage;
              } else {
                // Fall back to lookup for moves that haven't been upgraded yet
                const moveDamageValue = getMoveDamageSync(move.name);
                if (typeof moveDamageValue === 'object') {
                  baseDamage = moveDamageValue.max || moveDamageValue.min || 0;
                } else {
                  baseDamage = moveDamageValue || 0;
                }
              }
              
              let damageRange = null;
              let damageDisplay = null;
              
              if (baseDamage > 0) {
                // Calculate range based on the actual damage and mastery level
                damageRange = calculateDamageRange(baseDamage, move.level, move.masteryLevel);
                damageDisplay = formatDamageRange(damageRange);
              }
              
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
                    minWidth: '280px',
                    maxWidth: '280px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden',
                    opacity: move.unlocked ? 1 : 0.6,
                    flexShrink: 0
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
                      {move.name} [Level {move.masteryLevel}]
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
                    
                    {damageDisplay && (
                      <div style={{ 
                        display: 'grid',
                        gridTemplateColumns: '1fr',
                        gap: '0.75rem',
                        marginBottom: '0.75rem'
                      }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>DAMAGE RANGE</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#dc2626' }}>
                            {damageDisplay}
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
          <div 
            className="vault-siege-scroll"
            style={{ 
              display: 'flex', 
              gap: '1rem',
              overflowX: 'auto',
              paddingBottom: '0.5rem',
              scrollbarWidth: 'thin',
              scrollbarColor: '#cbd5e1 #f1f5f9',
              scrollBehavior: 'smooth',
              WebkitOverflowScrolling: 'touch'
            }}>
            {unlockedCards.map(card => {
              const isSelected = selectedActionCards.includes(card.id);
              
              // Get action card damage value
              const cardDamageValue = ACTION_CARD_DAMAGE_VALUES[card.name]?.damage || 0;
              let damageDisplay = null;
              
              if (cardDamageValue) {
                if (typeof cardDamageValue === 'object') {
                  // It's a range, create proper DamageRange object
                  const damageRange = {
                    min: cardDamageValue.min,
                    max: cardDamageValue.max,
                    average: Math.floor((cardDamageValue.min + cardDamageValue.max) / 2)
                  };
                  damageDisplay = formatDamageRange(damageRange);
                } else if (cardDamageValue > 0) {
                  // It's a single value
                  damageDisplay = cardDamageValue.toString();
                }
              }
              
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
                    minWidth: '280px',
                    maxWidth: '280px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                    overflow: 'hidden',
                    opacity: card.unlocked ? 1 : 0.6,
                    flexShrink: 0
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
                    
                    {damageDisplay && (
                      <div style={{ 
                        display: 'grid',
                        gridTemplateColumns: '1fr',
                        gap: '0.75rem',
                        marginBottom: '0.75rem'
                      }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>
                            {typeof cardDamageValue === 'object' ? 'DAMAGE RANGE' : 'DAMAGE'}
                          </div>
                          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#dc2626' }}>
                            {damageDisplay}
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
    </>
  );

  // Always render popup portal if attackResults exists, even if modal is closed
  // This ensures the popup shows even if the modal closes after attack
  const popupPortal = attackResults && attackResultsPopup ? createPortal(
    <>
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideInUp {
            from {
              opacity: 0;
              transform: translateY(30px) scale(0.95);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }
        `}
      </style>
      {attackResultsPopup}
    </>,
    document.body
  ) : null;

  // If modal is closed and no attack results, return null
  // Otherwise, render modal and/or popup
  if (!isOpen && !attackResults) {
    return null;
  }

  console.log('🎯 Rendering VaultSiegeModal:', {
    isOpen,
    hasAttackResults: !!attackResults,
    hasPopup: !!popupPortal
  });

  // Only render modal if isOpen is explicitly true
  if (!isOpen) {
    return popupPortal || null;
  }

  return (
    <>
      {createPortal(modalContent, document.body)}
      {popupPortal}
    </>
  );
};

export default VaultSiegeModal; 