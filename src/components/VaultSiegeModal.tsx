import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { db } from '../firebase';
import { collection, doc, getDoc, updateDoc, addDoc } from 'firebase/firestore';
import { MOVE_DAMAGE_VALUES, ACTION_CARD_DAMAGE_VALUES, BATTLE_CONSTANTS } from '../types/battle';
import { getMoveDamageSync, getMoveNameSync, getMoveDescriptionSync, loadMoveOverrides } from '../utils/moveOverrides';
import { calculateDamageRange, formatDamageRange } from '../utils/damageCalculator';
import { getEffectiveMasteryLevel } from '../utils/artifactUtils';
import { trackMoveUsage } from '../utils/manifestTracking';
import { loadVaultSiegePlayerList, loadVaultSiegeClassmateIds } from '../utils/vaultSiegeTargets';
import type { ElementType } from '../types/elementTypes';
import { elementTypeEmoji, elementTypeLabel } from '../utils/elementTypeUi';
import { parseFirestoreDate, vaultHealthCooldownEnd } from '../utils/vaultDisplayNormalize';

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
  email?: string;
  shieldStrength?: number;
  maxShieldStrength?: number;
  overshield?: number;
  vaultHealth?: number;
  maxVaultHealth?: number;
  capacity?: number;
  onCooldown?: boolean;
  cooldownEndTime?: Date;
}

const VaultSiegeModal = ({ isOpen, onClose, battleId, onAttackComplete }: VaultSiegeModalProps) => {
  console.log('VaultSiegeModal: Component rendered with isOpen:', isOpen);
  const { currentUser } = useAuth();
  const { vault, moves, actionCards, executeVaultSiegeAttack, syncVaultPP, syncStudentPP, refreshVaultData, getRemainingOfflineMoves, offlineMoves, attackHistory } = useBattle();
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('none'); // 'none', 'my-class', 'most-vulnerable', 'lowest-shield', 'highest-pp'
  const [classmateIds, setClassmateIds] = useState<Set<string>>(() => new Set());
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [selectedMoves, setSelectedMoves] = useState<string[]>([]);
  const [selectedActionCards, setSelectedActionCards] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [playerListError, setPlayerListError] = useState<string | null>(null);
  
  // Debug loading state changes
  useEffect(() => {
    console.log('🔄 Loading state changed:', loading);
  }, [loading]);
  const [targetVault, setTargetVault] = useState<any>(null);
  const [targetVaultBefore, setTargetVaultBefore] = useState<any>(null); // Store initial stats
  const [attackResults, setAttackResults] = useState<any>(null);
  const [remainingMoves, setRemainingMoves] = useState<number>(0);
  const [equippedArtifacts, setEquippedArtifacts] = useState<any>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Load equipped artifacts when modal opens so skill levels match Skill Mastery (including ring bonuses)
  useEffect(() => {
    if (!isOpen || !currentUser) return;
    const loadEquippedArtifacts = async () => {
      try {
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        const studentData = studentDoc.exists() ? studentDoc.data() : {};
        setEquippedArtifacts(studentData?.equippedArtifacts || null);
      } catch (err) {
        console.error('VaultSiegeModal: Error loading equipped artifacts', err);
        setEquippedArtifacts(null);
      }
    };
    loadEquippedArtifacts();
  }, [isOpen, currentUser?.uid]);

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
      setClassmateIds(new Set());
      setPlayerListError(null);
      // Only clear attackResults when modal FIRST opens (not on every render)
      setAttackResults(null);
      console.log('VaultSiegeModal: Modal opened, resetting state');
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  // Filter and sort players based on search query and filter type - memoized for performance
  const filteredPlayers = useMemo(() => {
    let filtered = [...players];
    
    // Apply search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(player =>
        player.displayName.toLowerCase().includes(query) ||
        player.uid.toLowerCase().includes(query) ||
        (player.email && player.email.toLowerCase().includes(query))
      );
    }
    
    // Apply sorting/filtering based on filter type
    switch (filterType) {
      case 'my-class':
        filtered = filtered.filter((player) => classmateIds.has(player.uid));
        filtered.sort((a, b) => a.displayName.localeCompare(b.displayName));
        break;
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
    
    return filtered;
  }, [players, searchQuery, filterType, classmateIds]);

  // Load available players (excluding current user)
  useEffect(() => {
    if (!isOpen || !currentUser) return;

    const loadPlayers = async () => {
      setLoading(true);
      setPlayerListError(null);
      try {
        console.log('VaultSiegeModal: Loading players...');
        const [{ players: basePlayers, loadError }, classmateIdSet] = await Promise.all([
          loadVaultSiegePlayerList(currentUser.uid),
          loadVaultSiegeClassmateIds(currentUser.uid),
        ]);
        setClassmateIds(classmateIdSet);
        if (loadError && basePlayers.length === 0) {
          setPlayerListError(loadError);
        }
        const availablePlayers: Player[] = basePlayers.map((p) => ({
          uid: p.uid,
          displayName: p.displayName,
          powerPoints: p.powerPoints,
          level: p.level,
          email: p.email,
        }));

        console.log('VaultSiegeModal: Available players before vault loading:', availablePlayers.length);

        // Load vault data for each player to get shield and vault health information
        for (const player of availablePlayers) {
          try {
            const vaultDoc = await getDoc(doc(db, 'vaults', player.uid));
            if (vaultDoc.exists()) {
              const vaultData = vaultDoc.data();
              const maxS = Math.max(0, Math.floor(Number(vaultData.maxShieldStrength) || 50));
              let sh = Math.max(0, Math.floor(Number(vaultData.shieldStrength) || 0));
              if (maxS > 0) sh = Math.min(sh, maxS);
              player.shieldStrength = sh;
              player.maxShieldStrength = maxS;
              player.overshield = vaultData.overshield || 0;
              player.capacity = vaultData.capacity || 1000;
              // Max vault health is always 10% of max PP (capacity is the max PP)
              const maxPP = vaultData.capacity || 1000;
              player.maxVaultHealth = Math.floor(maxPP * 0.1);
              // Current vault health is capped at current PP if PP < max health
              const maxVaultHealth = player.maxVaultHealth;
              const currentVaultHealth = vaultData.vaultHealth !== undefined 
                ? Math.min(vaultData.vaultHealth, maxVaultHealth, vaultData.currentPP || 0)
                : Math.min(vaultData.currentPP || 0, maxVaultHealth);
              player.vaultHealth = currentVaultHealth;
              
              // Check if player is on cooldown (vault health is 0 and cooldown is active)
              if (vaultData.vaultHealthCooldown) {
                const cdStart = parseFirestoreDate(vaultData.vaultHealthCooldown);
                const cooldownEndTime = cdStart ? vaultHealthCooldownEnd(cdStart) : null;
                const now = new Date();
                if (cooldownEndTime && now < cooldownEndTime) {
                  // Player is on cooldown - mark them but don't exclude (we'll show them as unavailable)
                  (player as any).onCooldown = true;
                  (player as any).cooldownEndTime = cooldownEndTime;
                }
              }
              
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
        // filteredPlayers will automatically update via useMemo when players changes
      } catch (error) {
        console.error('Error loading players:', error);
        setPlayerListError('Failed to load players. Check your connection and try again.');
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
      setTargetVaultBefore(null);
      return;
    }

        const loadTargetVault = async () => {
      try {
        const vaultDoc = await getDoc(doc(db, 'vaults', selectedTarget));
        if (vaultDoc.exists()) {
          const vaultData = vaultDoc.data();
          setTargetVault(vaultData);
          // Always store initial stats when target is selected (reset for new target)
          const maxVaultHealth = Math.floor((vaultData.capacity || 1000) * 0.1);
          const currentVaultHealth = vaultData.vaultHealth !== undefined 
            ? Math.min(vaultData.vaultHealth, maxVaultHealth, vaultData.currentPP || 0)
            : Math.min(vaultData.currentPP || 0, maxVaultHealth);
          setTargetVaultBefore({
            shieldStrength: vaultData.shieldStrength || 0,
            maxShieldStrength: vaultData.maxShieldStrength || 50,
            currentPP: vaultData.currentPP || 0,
            capacity: vaultData.capacity || 1000,
            overshield: vaultData.overshield || 0,
            vaultHealth: currentVaultHealth,
            maxVaultHealth: maxVaultHealth
          });
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
      
      // Refresh target vault data after attack
      const refreshTargetData = async () => {
        try {
          // Refresh target vault
          const vaultDoc = await getDoc(doc(db, 'vaults', selectedTarget));
          if (vaultDoc.exists()) {
            const newVaultData = vaultDoc.data();
            setTargetVault(newVaultData);
          }
          
          // Refresh target player data in the list
          const studentDoc = await getDoc(doc(db, 'students', selectedTarget));
          if (studentDoc.exists()) {
            const studentData = studentDoc.data();
            setPlayers(prevPlayers => prevPlayers.map(player => {
              if (player.uid === selectedTarget) {
                // Reload vault for updated stats
                return {
                  ...player,
                  powerPoints: studentData.powerPoints || studentData.currentPP || 0,
                };
              }
              return player;
            }));
            
            // filteredPlayers will automatically update via useMemo when players changes
          }
          
          // Reload vault data for the target player in the list
          const vaultDocForList = await getDoc(doc(db, 'vaults', selectedTarget));
          if (vaultDocForList.exists()) {
            const vaultDataForList = vaultDocForList.data();
            const capacity = vaultDataForList.capacity || 1000;
            const maxVaultHealth = Math.floor(capacity * 0.1);
            const currentVaultHealth = vaultDataForList.vaultHealth !== undefined 
              ? Math.min(vaultDataForList.vaultHealth, maxVaultHealth, vaultDataForList.currentPP || 0)
              : Math.min(vaultDataForList.currentPP || 0, maxVaultHealth);
            
            setPlayers(prevPlayers => prevPlayers.map(player => {
              if (player.uid === selectedTarget) {
                return {
                  ...player,
                  shieldStrength: vaultDataForList.shieldStrength || 0,
                  maxShieldStrength: vaultDataForList.maxShieldStrength || 50,
                  overshield: vaultDataForList.overshield || 0,
                  capacity: capacity,
                  vaultHealth: currentVaultHealth,
                  maxVaultHealth: maxVaultHealth,
                };
              }
              return player;
            }));
            
            // filteredPlayers will automatically update via useMemo when players changes
          }
        } catch (error) {
          console.error('Error refreshing target data:', error);
        }
      };
      
      // Refresh target data after a short delay to allow database to update
      setTimeout(() => {
        refreshTargetData();
      }, 500);
      
      // Set attackResults immediately - this will trigger the popup
      console.log('✅ Setting attackResults NOW:', results);
      setAttackResults(results);
      
      // Clear selected moves after attack (user can select new ones for next attack)
      // Keep target selected for easy re-attack
      setSelectedMoves([]);
      setSelectedActionCards([]);
      
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

  // Show all unlocked moves (manifest, elemental, system) - no category filter
  const unlockedMoves = moves.filter(move => move.unlocked);
  const unlockedCards = actionCards.filter(card => card.unlocked);

  // Load move overrides when modal opens so names/descriptions display accurately
  useEffect(() => {
    if (isOpen) {
      loadMoveOverrides().catch(() => {});
    }
  }, [isOpen]);

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
      className="mst-siege-result-overlay"
      onClick={(e) => {
        // Close if clicking outside the popup
        if (e.target === e.currentTarget) {
          console.log('🎯 Clicked outside popup, closing...');
          setAttackResults(null);
        }
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`mst-siege-result-modal ${attackResults.success ? 'mst-siege-result-modal--success' : 'mst-siege-result-modal--fail'}`}
      >
        {/* Close Button */}
        <button
          onClick={() => setAttackResults(null)}
          className="mst-siege-result-close"
          style={{ top: '1rem', right: '1rem', width: '32px', height: '32px', fontSize: '1.5rem' }}
        >
          ×
        </button>

        {/* Popup Content */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div className="mst-siege-result-modal-icon">
            {attackResults.success ? '🎉' : '❌'}
          </div>
          <h2 className="mst-siege-result-modal-title">
            {attackResults.success ? '✅ Attack Successful!' : '❌ Attack Failed'}
          </h2>
          <p className="mst-siege-result-modal-message">
            {attackResults.message}
          </p>
        </div>

        {attackResults.success && (
          <div className="mst-siege-result-modal-body">
            <p style={{ marginBottom: '1rem', fontSize: '1rem' }}>
              Used <strong>{attackResults.movesUsed}</strong> moves and <strong>{attackResults.cardsUsed}</strong> action cards.
            </p>
            
            {attackResults.usedMoves && attackResults.usedMoves.length > 0 && (
              <div style={{ marginBottom: '1rem' }}>
                <p className="mst-siege-result-stat mst-siege-result-stat--moves" style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
                  ⚔️ Moves Used:
                </p>
                <p className="mst-siege-result-stat mst-siege-result-stat--moves" style={{ fontSize: '0.95rem', fontWeight: 500 }}>
                  {attackResults.usedMoves.join(', ')}
                </p>
              </div>
            )}
            
            <div className="mst-siege-result-stat-grid">
              {attackResults.ppGained > 0 && (
                <div className="mst-siege-result-stat-tile mst-siege-result-stat-tile--pp">
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>💰</div>
                  <div className="mst-siege-result-stat mst-siege-result-stat--pp" style={{ fontSize: '1.1rem' }}>
                    {attackResults.ppGained} PP
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--mst-text-muted)' }}>Stolen</div>
                </div>
              )}
              
              {attackResults.xpGained > 0 && (
                <div className="mst-siege-result-stat-tile mst-siege-result-stat-tile--xp">
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>⚡</div>
                  <div className="mst-siege-result-stat mst-siege-result-stat--xp" style={{ fontSize: '1.1rem' }}>
                    {attackResults.xpGained} XP
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--mst-text-muted)' }}>Earned</div>
                </div>
              )}
              
              {attackResults.shieldDamage > 0 && (
                <div className="mst-siege-result-stat-tile mst-siege-result-stat-tile--shield">
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🛡️</div>
                  <div className="mst-siege-result-stat mst-siege-result-stat--shield" style={{ fontSize: '1.1rem' }}>
                    {attackResults.shieldDamage}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--mst-text-muted)' }}>Shield Damage</div>
                </div>
              )}
            </div>

            {attackResults.details && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--mst-border)' }}>
                <p className="mst-siege-result-detail" style={{ fontStyle: 'italic' }}>
                  {attackResults.details}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="mst-siege-result-continue-row">
          <button
            onClick={() => setAttackResults(null)}
            className="mst-siege-result-continue"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const modalContent = (
    <>
      <div
        ref={modalRef}
        className="mst-siege-overlay"
      >
      <div className="mst-siege-modal">
        <div className="mst-siege-modal-inner">
        
        <div className="mst-siege-hero">
          <div className="mst-siege-hero-copy">
            <h2 className="mst-siege-hero-title">
              <span className="mst-siege-hero-icon" aria-hidden>🏰</span>
              VAULT SIEGE
            </h2>
            <p className="mst-siege-hero-subtitle">Strategy. Discipline. Take what matters.</p>
            <div className="mst-siege-hero-status-row">
              <div className="mst-siege-status">
                <span className="mst-siege-status-label">Offline Moves</span>
                <span className={`mst-siege-status-count ${getRemainingOfflineMoves() > 0 ? 'mst-siege-status-count--ok' : 'mst-siege-status-count--empty'}`}>
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
                className="mst-siege-restore-btn"
              >
                ⚡ Restore Move ({calculateRestoreCost()} PP)
              </button>

              </div>
              

            </div>
          </div>
          <button
            onClick={onClose}
            className="mst-siege-close"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Inline recap (still visible in modal) */}
        {attackResults && (
          <div 
            key={`attack-result-popup-${Date.now()}`}
            className={`mst-siege-result ${attackResults.success ? 'mst-siege-result--success' : 'mst-siege-result--fail'}`}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, paddingRight: '1.5rem' }}>
                <h3 className="mst-siege-result-title">
                  {attackResults.success ? '✅ Attack Successful!' : '❌ Attack Failed'}
                </h3>
                <p>{attackResults.message}</p>
                {attackResults.success && (
                  <div>
                    <p>Used {attackResults.movesUsed} moves and {attackResults.cardsUsed} action cards.</p>
                    {attackResults.usedMoves && attackResults.usedMoves.length > 0 && (
                      <p className="mst-siege-result-stat mst-siege-result-stat--moves" style={{ fontSize: '0.875rem' }}>
                        ⚔️ Moves Used: {attackResults.usedMoves.join(', ')}
                      </p>
                    )}
                    {attackResults.ppGained > 0 && (
                      <p className="mst-siege-result-stat mst-siege-result-stat--pp">
                        💰 Stole {attackResults.ppGained} PP!
                      </p>
                    )}
                    {attackResults.xpGained > 0 && (
                      <p className="mst-siege-result-stat mst-siege-result-stat--xp">
                        ⚡ Earned {attackResults.xpGained} XP!
                      </p>
                    )}
                    {attackResults.shieldDamage > 0 && (
                      <p className="mst-siege-result-stat mst-siege-result-stat--shield">
                        🛡️ Dealt {attackResults.shieldDamage} shield damage!
                      </p>
                    )}
                    {attackResults.details && (
                      <p className="mst-siege-result-detail">
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
                  // Update before stats to current stats for next attack comparison
                  if (targetVault) {
                    setTargetVaultBefore({
                      shieldStrength: targetVault.shieldStrength || 0,
                      maxShieldStrength: targetVault.maxShieldStrength || 50,
                      currentPP: targetVault.currentPP || 0,
                      capacity: targetVault.capacity || 1000,
                      overshield: targetVault.overshield || 0
                    });
                  }
                }}
                className="mst-siege-result-close"
              >
                ×
              </button>
            </div>
              {attackResults.success && (
                <div className="mst-siege-result-actions">
                  <button
                    onClick={handleRestoreMove}
                    disabled={loading || !vault || vault.currentPP < calculateRestoreCost()}
                    className="mst-siege-restore-btn"
                  >
                    ⚡ Restore Move ({calculateRestoreCost()} PP)
                  </button>
                  <button
                    onClick={syncVaultPP}
                    className="mst-siege-sync-btn"
                  >
                    🔄 Refresh PP
                  </button>
                </div>
              )}
          </div>
        )}

        {/* Target Selection */}
        <div className="mst-siege-section">
          <div className="mst-siege-section-head">
            <h3 className="mst-siege-section-title">
              <span className="mst-siege-section-title-icon" aria-hidden>⌖</span>
              Select Target Vault
            </h3>
            <div className="mst-siege-meta">
              <span>Players: {filteredPlayers.length}</span>
              {filterType !== 'none' && (
                <>
                  <span>•</span>
                  <span>
                    {filterType === 'my-class' && 'My Class(es)'}
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
          <div className="mst-siege-filters">
            <button
              onClick={() => setFilterType('none')}
              className={`mst-siege-filter${filterType === 'none' ? ' mst-siege-filter--active' : ''}`}
            >
              All Players
            </button>
            <button
              onClick={() => setFilterType('my-class')}
              className={`mst-siege-filter mst-siege-filter--class${filterType === 'my-class' ? ' mst-siege-filter--active' : ''}`}
            >
              🏫 My Class(es)
            </button>
            <button
              onClick={() => setFilterType('most-vulnerable')}
              className={`mst-siege-filter mst-siege-filter--vulnerable${filterType === 'most-vulnerable' ? ' mst-siege-filter--active' : ''}`}
            >
              🛡️ Most Vulnerable
            </button>
            <button
              onClick={() => setFilterType('lowest-shield')}
              className={`mst-siege-filter mst-siege-filter--shield${filterType === 'lowest-shield' ? ' mst-siege-filter--active' : ''}`}
            >
              🛡️ Lowest Shield
            </button>
            <button
              onClick={() => setFilterType('highest-pp')}
              className={`mst-siege-filter mst-siege-filter--pp${filterType === 'highest-pp' ? ' mst-siege-filter--active' : ''}`}
            >
              ⚡ Highest PP
            </button>
          </div>

          {/* Search Input */}
          <div className="mst-siege-search-wrap">
            <input
              type="text"
              placeholder="Search players by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mst-siege-search"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="mst-siege-search-clear"
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
          {loading ? (
            <div className="mst-siege-loading">
              <div className="mst-siege-loading-title">
                Scanning the Xiotein network for available players...
              </div>
              <div className="mst-siege-loading-sub">
                The universe is vast. Every vault leaves a signature.
              </div>
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="mst-siege-empty">
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                {searchQuery ? '🔍' : filterType === 'my-class' ? '🏫' : '👥'}
              </div>
              <div className="mst-siege-empty-title">
                {searchQuery
                  ? 'No Players Found'
                  : filterType === 'my-class'
                    ? 'No Classmates Found'
                    : 'No Players Available'}
              </div>
              <div className="mst-siege-empty-body">
                {searchQuery
                  ? `No players match your search for "${searchQuery}". Try a different search term.`
                  : filterType === 'my-class'
                    ? classmateIds.size === 0
                      ? 'You are not enrolled in any classes yet, or class rosters could not be loaded. Join a class to siege classmates.'
                      : 'None of the loaded players are in your class(es). Try All Players, or check that classmates have student profiles.'
                    : playerListError
                      ? playerListError
                      : 'There are no other players in the system to attack. If your class uses roster-based access, ensure your student profile has a class and that classmates have student documents.'}
              </div>
            </div>
          ) : (
            <div className="mst-siege-scroll">
              {filteredPlayers.map(player => {
                const isSelected = selectedTarget === player.uid;
                const shieldPercentage = ((player.shieldStrength || 0) / (player.maxShieldStrength || 50)) * 100;
                
                // Get shield status icon
                const getShieldIcon = () => {
                  if ((player.overshield || 0) > 0) return '✨';
                  if (shieldPercentage >= 80) return '🛡️';
                  if (shieldPercentage >= 50) return '⚠️';
                  return '💥';
                };

                const isOnCooldown = player.onCooldown === true;
                const cooldownRemaining = isOnCooldown && player.cooldownEndTime ? (() => {
                      const now = new Date();
                      const remainingMs = player.cooldownEndTime!.getTime() - now.getTime();
                      if (remainingMs > 0) {
                        const hours = Math.floor(remainingMs / (1000 * 60 * 60));
                        const minutes = Math.ceil((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
                        return { hours, minutes };
                      }
                      return null;
                    })() : null;

                const targetVariant =
                  (player.overshield || 0) > 0 ? 'overshield'
                  : shieldPercentage >= 80 ? 'safe'
                  : shieldPercentage >= 50 ? 'mid'
                  : 'vulnerable';

                return (
                  <div
                    key={player.uid}
                    onClick={() => {
                      if (isOnCooldown) {
                        alert(`This player is on cooldown and cannot be attacked. Cooldown expires in ${cooldownRemaining?.hours || 0}h ${cooldownRemaining?.minutes || 0}m.`);
                        return;
                      }
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
                    className={[
                      'mst-siege-target',
                      `mst-siege-target--${targetVariant}`,
                      isSelected ? 'mst-siege-target--selected' : '',
                      isOnCooldown ? 'mst-siege-target--cooldown' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    {/* Selection Badge */}
                    {isSelected && (
                      <div className="mst-siege-selected-badge">
                        ✓ SELECTED
                      </div>
                    )}
                    
                    {/* Cooldown Badge */}
                    {isOnCooldown && (
                      <div className="mst-siege-cooldown-badge">
                        ⏰ On Cooldown
                      </div>
                    )}

                    {/* Card Header */}
                    <div className="mst-siege-target-header">
                      <div className="mst-siege-target-icon">
                        {getShieldIcon()}
                      </div>
                      <div className="mst-siege-target-name">
                        {player.displayName}
                      </div>
                      <div className="mst-siege-target-level">
                        Level {player.level}
                      </div>
                    </div>

                    {/* Player Stats */}
                    <div className="mst-siege-target-stats">
                      <div className="mst-siege-stat-grid">
                        <div>
                          <div className="mst-siege-stat-label">VAULT HEALTH</div>
                          <div className="mst-siege-stat-value mst-siege-stat-value--health">
                            {player.vaultHealth !== undefined ? player.vaultHealth : Math.floor((player.capacity || 1000) * 0.1)}/{player.maxVaultHealth !== undefined ? player.maxVaultHealth : Math.floor((player.capacity || 1000) * 0.1)}
                          </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div className="mst-siege-stat-label">SHIELD STATUS</div>
                          <div className="mst-siege-stat-value mst-siege-stat-value--shield">
                            {player.shieldStrength || 0}/{player.maxShieldStrength || 50}
                          </div>
                          {(player.overshield || 0) > 0 && (
                            <div className="mst-siege-overshield-tag">
                              ✨ +1 Overshield
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Shield Bar */}
                      <div className="mst-siege-shield-bar">
                        <div
                          className={`mst-siege-shield-bar-fill ${shieldPercentage >= 80 ? 'mst-siege-shield-bar-fill--safe' : shieldPercentage >= 50 ? 'mst-siege-shield-bar-fill--mid' : ''}`}
                          style={{ width: `${shieldPercentage}%` }}
                        />
                      </div>

                      {/* Shield Status Text / Cooldown */}
                      <div className="mst-siege-shield-status-text">
                        {isOnCooldown && cooldownRemaining ? (
                          <span style={{ fontWeight: 'bold' }}>
                            ⏰ Cooldown: {cooldownRemaining.hours}h {cooldownRemaining.minutes}m
                          </span>
                        ) : shieldPercentage >= 80 ? '🛡️ Well Protected' : 
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
          <div className="mst-siege-vault-status">
            <h4 className="mst-siege-vault-status-title">Target Vault Status</h4>
            <div className="mst-siege-vault-status-grid">
              <div>
                <span className="mst-siege-vault-metric-label">Shield Strength</span>
                <div style={{ position: 'relative' }}>
                  {targetVaultBefore && targetVaultBefore.shieldStrength !== undefined && (
                    <div className="mst-siege-vault-metric-before">
                      Before: {targetVaultBefore.shieldStrength}
                    </div>
                  )}
                  <div className="mst-siege-vault-metric-value mst-siege-vault-metric-value--shield">
                    {targetVault.shieldStrength || 0} / {targetVault.maxShieldStrength || 50}
                    {targetVaultBefore && targetVaultBefore.shieldStrength !== undefined && targetVaultBefore.shieldStrength !== (targetVault.shieldStrength || 0) && (
                      <div className="mst-siege-vault-delta-bar" />
                    )}
                  </div>
                  {targetVaultBefore && targetVaultBefore.shieldStrength !== undefined && targetVaultBefore.shieldStrength !== (targetVault.shieldStrength || 0) && (
                    <div className="mst-siege-vault-delta">
                      {targetVaultBefore.shieldStrength > (targetVault.shieldStrength || 0) ? '↓' : '↑'} {Math.abs((targetVault.shieldStrength || 0) - targetVaultBefore.shieldStrength)}
                    </div>
                  )}
                </div>
                {(targetVault.overshield || 0) > 0 && (
                  <div className="mst-siege-overshield-tag">
                    ✨ +1 Overshield
                  </div>
                )}
              </div>
              <div>
                <span className="mst-siege-vault-metric-label">Generator</span>
                <div className="mst-siege-vault-metric-value mst-siege-vault-metric-value--generator">
                  Level {targetVault.generatorLevel || 1}
                </div>
              </div>
              <div>
                <span className="mst-siege-vault-metric-label">Vault Health</span>
                <div style={{ position: 'relative' }}>
                  {targetVaultBefore && targetVaultBefore.vaultHealth !== undefined && (
                    <div className="mst-siege-vault-metric-before">
                      Before: {targetVaultBefore.vaultHealth}
                    </div>
                  )}
                  <div className="mst-siege-vault-metric-value mst-siege-vault-metric-value--health">
                    {(() => {
                      const maxVaultHealth = Math.floor((targetVault.capacity || 1000) * 0.1);
                      const currentVaultHealth = targetVault.vaultHealth !== undefined 
                        ? Math.min(targetVault.vaultHealth, maxVaultHealth, targetVault.currentPP || 0)
                        : Math.min(targetVault.currentPP || 0, maxVaultHealth);
                      return `${currentVaultHealth} / ${maxVaultHealth}`;
                    })()}
                    {targetVaultBefore && targetVaultBefore.vaultHealth !== undefined && (() => {
                      const maxVaultHealth = Math.floor((targetVault.capacity || 1000) * 0.1);
                      const currentVaultHealth = targetVault.vaultHealth !== undefined 
                        ? Math.min(targetVault.vaultHealth, maxVaultHealth, targetVault.currentPP || 0)
                        : Math.min(targetVault.currentPP || 0, maxVaultHealth);
                      return currentVaultHealth !== targetVaultBefore.vaultHealth;
                    })() && (
                      <div className="mst-siege-vault-delta-bar" />
                    )}
                  </div>
                  {targetVaultBefore && targetVaultBefore.vaultHealth !== undefined && (() => {
                    const maxVaultHealth = Math.floor((targetVault.capacity || 1000) * 0.1);
                    const currentVaultHealth = targetVault.vaultHealth !== undefined 
                      ? Math.min(targetVault.vaultHealth, maxVaultHealth, targetVault.currentPP || 0)
                      : Math.min(targetVault.currentPP || 0, maxVaultHealth);
                    const change = currentVaultHealth - targetVaultBefore.vaultHealth;
                    return change !== 0;
                  })() && (
                    <div className="mst-siege-vault-delta">
                      ↓ {Math.abs((() => {
                        const maxVaultHealth = Math.floor((targetVault.capacity || 1000) * 0.1);
                        const currentVaultHealth = targetVault.vaultHealth !== undefined 
                          ? Math.min(targetVault.vaultHealth, maxVaultHealth, targetVault.currentPP || 0)
                          : Math.min(targetVault.currentPP || 0, maxVaultHealth);
                        return currentVaultHealth - (targetVaultBefore.vaultHealth || 0);
                      })())}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Move Selection */}
        <div className="mst-siege-section">
          <div className="mst-siege-section-head">
            <h3 className="mst-siege-section-title">
              <span className="mst-siege-section-title-icon" aria-hidden>⚔</span>
              Select Moves
            </h3>
            <div className="mst-siege-meta">
              <span>Selected: {selectedMoves.length}</span>
              <span>•</span>
                                <span>Available: {remainingMoves - selectedActionCards.length}</span>
            </div>
          </div>
          <div className="mst-siege-scroll">
            {unlockedMoves.map(move => {
              const isSelected = selectedMoves.includes(move.id);
              
              // Get move data and calculate damage range (use move.name for template lookup)
              const displayName = getMoveNameSync(move.name) || move.name;
              const displayDescription = getMoveDescriptionSync(move.name) || move.description || '';
              let baseDamage: number;
              if (move.damage && move.damage > 0) {
                baseDamage = move.damage;
              } else {
                const moveDamageValue = getMoveDamageSync(move.name);
                if (typeof moveDamageValue === 'object') {
                  baseDamage = moveDamageValue.max || moveDamageValue.min || 0;
                } else {
                  baseDamage = moveDamageValue || 0;
                }
              }
              
              let damageRange = null;
              let damageDisplay = null;
              
              // Use effective mastery level (matches Skill Mastery; includes e.g. Blaze Ring +1)
              const effectiveMasteryLevel = getEffectiveMasteryLevel(move, equippedArtifacts);
              if (baseDamage > 0) {
                damageRange = calculateDamageRange(baseDamage, move.level, effectiveMasteryLevel);
                damageDisplay = formatDamageRange(damageRange);
              }
              
              const elementKey = (move.elementalAffinity || '').toLowerCase();
              const moveVariant =
                move.category === 'manifest' ? 'manifest'
                : move.category === 'elemental'
                  ? (['fire', 'water', 'earth', 'air', 'lightning', 'light', 'shadow', 'metal'].includes(elementKey)
                      ? elementKey
                      : 'elemental')
                  : 'elemental';

              // Get move type icon
              const getMoveIcon = () => {
                if (move.category === 'manifest') return '⭐';
                if (move.category === 'elemental') {
                  // Return element-specific icon
                  const elementIcons: { [key: string]: string } = {
                    fire: '🔥',
                    water: '💧',
                    air: '💨',
                    earth: '🪨',
                    lightning: '⚡',
                    light: '✨',
                    shadow: '🌑',
                    metal: '⚙️'
                  };
                  return elementIcons[move.elementalAffinity?.toLowerCase() || ''] || '⚡';
                }
                return '⚙️';
              };

              return (
                <div
                  key={move.id}
                  onClick={() => handleMoveToggle(move.id)}
                  className={[
                    'mst-siege-move',
                    `mst-siege-move--${moveVariant}`,
                    isSelected ? 'mst-siege-move--selected' : '',
                    move.unlocked ? '' : 'mst-siege-move--muted',
                  ].filter(Boolean).join(' ')}
                >
                  {/* Selection Badge */}
                  {isSelected && (
                    <div className="mst-siege-selected-badge">
                      ✓ SELECTED
                    </div>
                  )}

                  {/* Card Header */}
                  <div className="mst-siege-move-header">
                    <div className="mst-siege-move-icon">
                      {getMoveIcon()}
                    </div>
                    <div className="mst-siege-move-name">
                      {displayName} [Level {effectiveMasteryLevel}]
                    </div>
                    <div className="mst-siege-move-type">
                      {move.category === 'manifest'
                        ? (move.manifestType ? `${move.manifestType.charAt(0).toUpperCase() + move.manifestType.slice(1)} Manifest` : 'Manifest')
                        : move.category === 'elemental'
                        ? (move.elementalAffinity ? `${move.elementalAffinity.charAt(0).toUpperCase() + move.elementalAffinity.slice(1)} Element` : 'Elemental')
                        : `${(move.category || 'system').charAt(0).toUpperCase() + (move.category || 'system').slice(1)} Move`
                      }
                    </div>
                  </div>

                  {/* Move Stats */}
                  <div className="mst-siege-move-body">
                    <div className="mst-siege-move-desc">
                      {displayDescription}
                    </div>
                    
                    {damageDisplay && (
                      <div>
                        <div className="mst-siege-move-damage-label">DAMAGE RANGE</div>
                        <div className="mst-siege-move-damage-value">
                          {damageDisplay}
                        </div>
                      </div>
                    )}

                    {/* Move Type Badge */}
                    <div className="mst-siege-move-meta">
                      {move.type} • {move.category === 'manifest'
                        ? (move.manifestType || 'MANIFEST').toUpperCase()
                        : move.category === 'elemental'
                        ? (move.elementalAffinity || 'ELEMENTAL').toUpperCase()
                        : (move.category || 'SYSTEM').toUpperCase()
                      }
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Card Selection */}
        <div className="mst-siege-section">
          <div className="mst-siege-section-head">
            <h3 className="mst-siege-section-title">
              <span className="mst-siege-section-title-icon" aria-hidden>🂠</span>
              Select Action Cards
            </h3>
            <div className="mst-siege-meta">
              <span>Selected: {selectedActionCards.length}</span>
              <span>•</span>
                                <span>Available: {remainingMoves - selectedMoves.length}</span>
            </div>
          </div>
          <div className="mst-siege-scroll">
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

              return (
                <div
                  key={card.id}
                  onClick={() => handleActionCardToggle(card.id)}
                  className={[
                    'mst-siege-action-card',
                    isSelected ? 'mst-siege-action-card--selected' : '',
                    card.unlocked ? '' : 'mst-siege-action-card--muted',
                  ].filter(Boolean).join(' ')}
                >
                  {/* Selection Badge */}
                  {isSelected && (
                    <div className="mst-siege-selected-badge">
                      ✓ SELECTED
                    </div>
                  )}

                  {/* Card Header */}
                  <div className="mst-siege-move-header">
                    <div className="mst-siege-move-icon">
                      🃏
                    </div>
                    <div className="mst-siege-move-name">
                      {card.name}
                    </div>
                    {card.elementalAffinity ? (
                      <div
                        className="mst-siege-action-affinity"
                        title={elementTypeLabel(card.elementalAffinity as ElementType)}
                      >
                        {elementTypeEmoji(card.elementalAffinity as ElementType)}{' '}
                        {elementTypeLabel(card.elementalAffinity as ElementType)}
                      </div>
                    ) : null}
                    <div className="mst-siege-move-type">
                      Action Card
                    </div>
                  </div>

                  {/* Card Stats */}
                  <div className="mst-siege-move-body">
                    <div className="mst-siege-move-desc">
                      {card.description}
                    </div>
                    
                    {damageDisplay && (
                      <div>
                        <div className="mst-siege-move-damage-label">
                          {typeof cardDamageValue === 'object' ? 'DAMAGE RANGE' : 'DAMAGE'}
                        </div>
                        <div className="mst-siege-move-damage-value">
                          {damageDisplay}
                        </div>
                      </div>
                    )}

                    {/* Card Info */}
                    <div className="mst-siege-move-meta">
                      Uses: {card.uses}/{card.maxUses} • {card.rarity}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sync and Attack Buttons */}
        <div className="mst-siege-footer">
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
            className="mst-siege-btn-sync"
          >
            🔄 Sync Target PP
          </button>
          <button
            onClick={onClose}
            className="mst-siege-btn-cancel"
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
            className="mst-siege-btn-confirm"
          >
                          {loading ? 'Executing Attack...' : remainingMoves === 0 ? 'No Offline Moves Remaining' : 'Launch Vault Siege!'}
          </button>
        </div>
        </div>
      </div>
    </div>
    </>
  );

  // Always render popup portal if attackResults exists, even if modal is closed
  // This ensures the popup shows even if the modal closes after attack
  const popupPortal = attackResults && attackResultsPopup ? createPortal(
    attackResultsPopup,
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