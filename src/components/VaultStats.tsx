import React, { useState, useEffect } from 'react';
import { Vault, Move, ActionCard } from '../types/battle';
import { doc, getDoc, onSnapshot, addDoc, collection, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { getActivePPBoost, getPPBoostStatus } from '../utils/ppBoost';

interface VaultStatsProps {
  vault: Vault | null;
  moves: Move[];
  actionCards: ActionCard[];
  remainingOfflineMoves: number;
  maxOfflineMoves: number;
  onSyncPP: () => void;
  onRestoreShields: (amount: number, cost: number) => void;
  onCreateBattle?: (type: 'live' | 'vault_siege') => void;
}

const VaultStats: React.FC<VaultStatsProps> = ({
  vault,
  moves,
  actionCards,
  remainingOfflineMoves,
  maxOfflineMoves,
  onSyncPP,
  onRestoreShields,
  onCreateBattle
}) => {
  console.log('VaultStats: Received remainingOfflineMoves:', remainingOfflineMoves, 'maxOfflineMoves:', maxOfflineMoves);
  const { currentUser } = useAuth();
  const { getRemainingOfflineMoves, syncVaultPP, refreshVaultData, offlineMoves, collectGeneratorPP, getGeneratorRates } = useBattle();
  const [userXP, setUserXP] = useState<number>(0);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreCost, setRestoreCost] = useState<number>(100);
  const [restoreHealthLoading, setRestoreHealthLoading] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState<{ hours: number; minutes: number; seconds: number } | null>(null);

  // Helper to get "day" start time (8am Eastern Time) for a given date
  // Properly handles EST (UTC-5) and EDT (UTC-4) automatically using America/New_York timezone
  const getDayStartForDate = (date: Date): Date => {
    // Get current date/time in Eastern Time
    const easternNow = date.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    // Parse the Eastern Time string
    const parts = easternNow.split(', ');
    const datePart = parts[0];
    const timePart = parts[1];
    const [month, day, year] = datePart.split('/');
    const [hour] = timePart.split(':');
    
    const yearNum = parseInt(year);
    const monthNum = parseInt(month) - 1; // JS months are 0-indexed
    const dayNum = parseInt(day);
    const currentHour = parseInt(hour);
    
    // Determine which day's 8am to use
    let targetYear = yearNum;
    let targetMonth = monthNum;
    let targetDay = dayNum;
    
    // If current Eastern time is before 8am, use previous day's 8am
    if (currentHour < 8) {
      const prevDate = new Date(yearNum, monthNum, dayNum - 1);
      targetYear = prevDate.getFullYear();
      targetMonth = prevDate.getMonth();
      targetDay = prevDate.getDate();
    }
    
    // Find what UTC time corresponds to 8am Eastern on the target date
    // Test both EST (13:00 UTC) and EDT (12:00 UTC) possibilities
    // EST: 8am Eastern = 13:00 UTC (UTC-5)
    // EDT: 8am Eastern = 12:00 UTC (UTC-4)
    
    // Try 13:00 UTC first (EST)
    let testUTC = new Date(Date.UTC(targetYear, targetMonth, targetDay, 13, 0, 0));
    let easternTimeStr = testUTC.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false
    });
    let easternHour = parseInt(easternTimeStr.split(', ')[1]?.split(':')[0] || '0');
    
    if (easternHour === 8) {
      // EST: 8am Eastern = 13:00 UTC
      return testUTC;
    }
    
    // Try 12:00 UTC (EDT)
    testUTC = new Date(Date.UTC(targetYear, targetMonth, targetDay, 12, 0, 0));
    easternTimeStr = testUTC.toLocaleString('en-US', { 
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false
    });
    easternHour = parseInt(easternTimeStr.split(', ')[1]?.split(':')[0] || '0');
    
    if (easternHour === 8) {
      // EDT: 8am Eastern = 12:00 UTC
      return testUTC;
    }
    
    // Fallback: if neither works, calculate dynamically
    // Find the UTC hour that gives us 8am Eastern
    for (let utcHour = 11; utcHour <= 14; utcHour++) {
      testUTC = new Date(Date.UTC(targetYear, targetMonth, targetDay, utcHour, 0, 0));
      easternTimeStr = testUTC.toLocaleString('en-US', { 
        timeZone: 'America/New_York',
        hour: '2-digit',
        hour12: false
      });
      easternHour = parseInt(easternTimeStr.split(', ')[1]?.split(':')[0] || '0');
      if (easternHour === 8) {
        return testUTC;
      }
    }
    
    // Ultimate fallback: use 13:00 UTC (EST)
    return new Date(Date.UTC(targetYear, targetMonth, targetDay, 13, 0, 0));
  };

  // Helper to get current "day" start time (8am EST)
  const getCurrentDayStart = (): Date => {
    return getDayStartForDate(new Date());
  };

  // Calculate restore cost based on restores purchased today
  const calculateRestoreCost = (): number => {
    if (!currentUser || !offlineMoves) return 100;
    
    // Get current day start (8am EST)
    const today = getCurrentDayStart();
    
    // Count move restores today (using 8am EST day boundary)
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
    
    // Cost starts at 100 PP and increases by 100 PP for each restore today
    const cost = 100 + (todayRestores.length * 100);
    return cost;
  };

  // Update restore cost when offline moves change
  useEffect(() => {
    const cost = calculateRestoreCost();
    setRestoreCost(cost);
  }, [offlineMoves, currentUser]);

  // Function to restore a move (dynamic cost based on purchases today)
  const handleRestoreMove = async () => {
    console.log('VaultStats: handleRestoreMove function called!');
    
    if (!currentUser || !vault) return;
    
    const cost = calculateRestoreCost();
    
    if (vault.currentPP < cost) {
      alert(`Not enough PP! You need ${cost} PP to restore a move.`);
      return;
    }

    try {
      setRestoreLoading(true);
      
      // Update vault PP
      const newPP = vault.currentPP - cost;
      console.log('VaultStats: PP deduction - current:', vault.currentPP, 'new:', newPP, 'cost:', cost);
      
      // Create a move_restore record to track the restoration
      const restoreMoveData = {
        userId: currentUser.uid,
        type: 'move_restore' as const,
        status: 'completed' as const,
        createdAt: new Date(),
      };
      
      console.log('VaultStats: Creating restore record:', restoreMoveData);
      await addDoc(collection(db, 'offlineMoves'), restoreMoveData);
      
      // Update vault in Firestore
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      console.log('VaultStats: Updating vault PP in Firestore to:', newPP);
      await updateDoc(vaultRef, {
        currentPP: newPP,
      });

      // Update local state
      console.log('VaultStats: Syncing vault PP...');
      await syncVaultPP();
      
      // Force refresh of vault data
      await refreshVaultData();
      
      alert(`Move restored! Spent ${cost} PP.`);
    } catch (error) {
      console.error('Error restoring move:', error);
      alert('Failed to restore move. Please try again.');
    } finally {
      setRestoreLoading(false);
    }
  };

  // Function to restore vault health to full using PP
  // If on cooldown, this will remove the cooldown and allow the player to be attacked again
  const handleRestoreVaultHealth = async () => {
    if (!currentUser || !vault) return;
    
    const maxVaultHealth = vault.maxVaultHealth || Math.floor(vault.capacity * 0.1);
    const currentVaultHealth = vault.vaultHealth || 0;
    const healthNeeded = maxVaultHealth - currentVaultHealth;
    
    // Check if health is already at max
    if (healthNeeded <= 0) {
      alert('Your vault health is already at maximum!');
      return;
    }
    
    // Check if player has enough PP
    if (vault.currentPP < healthNeeded) {
      alert(`Not enough PP! You need ${healthNeeded} PP to restore vault health to full.`);
      return;
    }

    // If on cooldown, warn the player that restoring health will remove the cooldown
    if (vault.vaultHealthCooldown) {
      const cooldownEnd = new Date(vault.vaultHealthCooldown);
      cooldownEnd.setHours(cooldownEnd.getHours() + 4);
      const now = new Date();
      const remainingMs = cooldownEnd.getTime() - now.getTime();
      
      if (remainingMs > 0) {
        const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
        const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        const remainingSeconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
        
        const confirmMessage = `⚠️ WARNING: You are currently on cooldown (${remainingHours}h ${remainingMinutes}m ${remainingSeconds}s remaining).\n\n` +
          `Restoring your health now will:\n` +
          `✅ Restore your vault health to full\n` +
          `❌ Remove the cooldown protection\n` +
          `⚠️ Make you vulnerable to attacks again\n\n` +
          `Cost: ${healthNeeded} PP\n\n` +
          `Do you want to restore health early and remove the cooldown?`;
        
        if (!window.confirm(confirmMessage)) {
          return;
        }
      }
    }
    
    try {
      setRestoreHealthLoading(true);
      
      // Calculate new PP (deduct health cost)
      const newPP = vault.currentPP - healthNeeded;
      
      // Update vault in Firestore: restore health to max, deduct PP, and REMOVE cooldown
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      const updateData: any = {
        vaultHealth: maxVaultHealth,
        currentPP: newPP
      };
      
      // Remove cooldown if it exists (using deleteField() to remove it from Firestore)
      if (vault.vaultHealthCooldown) {
        updateData.vaultHealthCooldown = deleteField();
      }
      
      await updateDoc(vaultRef, updateData);
      
      // Also update student PP to match
      const studentRef = doc(db, 'students', currentUser.uid);
      await updateDoc(studentRef, {
        powerPoints: newPP
      });
      
      // Sync vault PP to ensure consistency
      await syncVaultPP();
      
      // Force refresh of vault data
      await refreshVaultData();
      
      const cooldownMessage = vault.vaultHealthCooldown 
        ? `Vault health restored to full! Cooldown removed - you can now be attacked again. Spent ${healthNeeded} PP.`
        : `Vault health restored to full! Spent ${healthNeeded} PP.`;
      
      alert(cooldownMessage);
    } catch (error) {
      console.error('Error restoring vault health:', error);
      alert('Failed to restore vault health. Please try again.');
    } finally {
      setRestoreHealthLoading(false);
    }
  };
  const [userLevel, setUserLevel] = useState<number>(1);
  const [previousXP, setPreviousXP] = useState<number>(0);
  const [previousPP, setPreviousPP] = useState<number>(0);
  const [showXPNotification, setShowXPNotification] = useState(false);
  const [showPPNotification, setShowPPNotification] = useState(false);
  const [showOfflineMovesNotification, setShowOfflineMovesNotification] = useState(false);
  const [previousOfflineMoves, setPreviousOfflineMoves] = useState<number>(remainingOfflineMoves);
  const [resetTimer, setResetTimer] = useState<string>('');
  const [generatorTimer, setGeneratorTimer] = useState<string>('');
  const [generatorTimeProgress, setGeneratorTimeProgress] = useState<number>(0);
  const [ppBoostStatus, setPpBoostStatus] = useState<{ isActive: boolean; timeRemaining: string }>({ isActive: false, timeRemaining: '' });

  // Calculate next reset time (8am Eastern Time each day)
  // Properly handles EST (UTC-5) and EDT (UTC-4) automatically
  const getNextResetTime = (): Date => {
    const now = new Date();
    
    // Get today's 8am Eastern Time
    const today8amEastern = getDayStartForDate(now);
    
    // If current time is already past today's 8am Eastern, get tomorrow's 8am Eastern
    if (now >= today8amEastern) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return getDayStartForDate(tomorrow);
    }
    
    return today8amEastern;
  };

  // Update reset timer every second
  useEffect(() => {
    const updateTimer = () => {
      const nextReset = getNextResetTime();
      const now = new Date();
      const diff = nextReset.getTime() - now.getTime();
      
      if (diff <= 0) {
        setResetTimer('Resetting now...');
        return;
      }
      
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setResetTimer(`${hours}h ${minutes}m ${seconds}s`);
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Update cooldown timer every second
  useEffect(() => {
    if (!vault?.vaultHealthCooldown) {
      setCooldownRemaining(null);
      return;
    }

    const updateCooldownTimer = () => {
      const cooldownEnd = new Date(vault.vaultHealthCooldown!);
      cooldownEnd.setHours(cooldownEnd.getHours() + 4); // 4-hour cooldown
      const now = new Date();
      const remainingMs = cooldownEnd.getTime() - now.getTime();
      
      if (remainingMs <= 0) {
        setCooldownRemaining(null);
        return;
      }
      
      const hours = Math.floor(remainingMs / (1000 * 60 * 60));
      const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
      
      setCooldownRemaining({ hours, minutes, seconds });
    };
    
    updateCooldownTimer();
    const interval = setInterval(updateCooldownTimer, 1000);
    
    return () => clearInterval(interval);
  }, [vault?.vaultHealthCooldown]);

  // Check for active PP boost
  useEffect(() => {
    const checkPPBoost = async () => {
      if (!currentUser) return;
      
      try {
        const activeBoost = await getActivePPBoost(currentUser.uid);
        const status = getPPBoostStatus(activeBoost);
        setPpBoostStatus(status);
      } catch (error) {
        console.error('Error checking PP boost:', error);
      }
    };
    
    checkPPBoost();
    
    // Update every minute for countdown
    const interval = setInterval(checkPPBoost, 60000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Update generator timer and progress every second
  useEffect(() => {
    if (!vault) return;

    const updateGeneratorTimer = () => {
      const now = new Date();
      const nextReset = getNextResetTime();
      
      // Calculate time remaining until next reset (when generator will be full)
      const timeUntilFull = nextReset.getTime() - now.getTime();
      
      // Total time in a day (24 hours)
      const totalDayTime = 24 * 60 * 60 * 1000;
      
      // Calculate progress percentage based on time remaining
      // If 13 hours remain, then 11 hours have elapsed = 11/24 = 45.8%
      const progress = Math.min(100, Math.max(0, 100 - (timeUntilFull / totalDayTime * 100)));
      setGeneratorTimeProgress(progress);
      
      if (timeUntilFull <= 0) {
        setGeneratorTimer('Generator full!');
        setGeneratorTimeProgress(100);
        return;
      }
      
      const hours = Math.floor(timeUntilFull / (1000 * 60 * 60));
      const minutes = Math.floor((timeUntilFull % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeUntilFull % (1000 * 60)) / 1000);
      
      setGeneratorTimer(`${hours}h ${minutes}m ${seconds}s`);
    };
    
    updateGeneratorTimer();
    const interval = setInterval(updateGeneratorTimer, 1000);
    
    return () => clearInterval(interval);
  }, [vault]);

  // Check for offline moves changes and show notification
  useEffect(() => {
    console.log('VaultStats: Offline moves prop changed:', remainingOfflineMoves);
    
    // Check if offline moves increased (indicating a purchase)
    if (remainingOfflineMoves > previousOfflineMoves && previousOfflineMoves !== 0) {
      console.log('VaultStats: Offline moves increased!', { previous: previousOfflineMoves, current: remainingOfflineMoves });
      setShowOfflineMovesNotification(true);
      setTimeout(() => setShowOfflineMovesNotification(false), 3000);
    }
    
    setPreviousOfflineMoves(remainingOfflineMoves);
  }, [remainingOfflineMoves, previousOfflineMoves]);

  // Fetch user XP from student document
  useEffect(() => {
    const fetchUserXP = async () => {
      if (!currentUser) return;
      
      try {
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          const xp = studentData.xp || 0;
          const level = Math.floor(xp / 50) + 1; // Calculate level based on XP
          setUserXP(xp);
          setUserLevel(level);
        }
      } catch (error) {
        console.error('Error fetching user XP:', error);
      }
    };

    fetchUserXP();
    
    // Set up real-time listener for XP updates
    const studentRef = doc(db, 'students', currentUser?.uid || '');
    const unsubscribe = onSnapshot(studentRef, (doc) => {
      if (doc.exists()) {
        const studentData = doc.data();
        const xp = studentData.xp || 0;
        const pp = studentData.powerPoints || 0;
        const level = Math.floor(xp / 50) + 1;
        
        console.log('📊 VaultStats received update:', { xp, pp, level, previousXP, previousPP, hasChanged: xp !== previousXP || pp !== previousPP });
        
        // Check for XP changes
        if (xp !== previousXP && previousXP !== 0) {
          const xpChange = xp - previousXP;
          console.log('🎯 XP Updated:', { previous: previousXP, current: xp, change: xpChange });
          setShowXPNotification(true);
          setTimeout(() => setShowXPNotification(false), 3000);
        }
        
        // Check for PP changes
        if (pp !== previousPP && previousPP !== 0) {
          const ppChange = pp - previousPP;
          console.log('💰 PP Updated:', { previous: previousPP, current: pp, change: ppChange });
          setShowPPNotification(true);
          setTimeout(() => setShowPPNotification(false), 3000);
        }
        
        setPreviousXP(xp);
        setPreviousPP(pp);
        setUserXP(xp);
        setUserLevel(level);
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  if (!vault) {
    return (
      <div style={{ 
        background: '#fef2f2', 
        border: '1px solid #fecaca',
        color: '#dc2626',
        padding: '2rem',
        borderRadius: '0.75rem',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚠️</div>
        <div style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>Vault Not Loaded</div>
        <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>
          Your vault data is being initialized. Please wait a moment.
        </div>
      </div>
    );
  }

  const unlockedMoves = moves.filter(move => move.unlocked);
  const unlockedCards = actionCards.filter(card => card.unlocked);
  const ppPercentage = (vault.currentPP / vault.capacity) * 100;
  const shieldPercentage = (vault.shieldStrength / vault.maxShieldStrength) * 100;
  const offlineMovesPercentage = (remainingOfflineMoves / maxOfflineMoves) * 100;

  const getStatusColor = (percentage: number) => {
    if (percentage >= 80) return '#059669'; // Green
    if (percentage >= 50) return '#f59e0b'; // Yellow
    return '#dc2626'; // Red
  };

  const getStatusIcon = (percentage: number) => {
    if (percentage >= 80) return '🟢';
    if (percentage >= 50) return '🟡';
    return '🔴';
  };

  return (
    <div style={{ 
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      border: '2px solid #e2e8f0',
      borderRadius: '1rem',
      padding: '2rem',
      marginBottom: '2rem',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
    }}>
      <style>
        {`
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.1); }
            100% { transform: scale(1); }
          }
        `}
      </style>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem',
        paddingBottom: '1rem',
        borderBottom: '2px solid #e2e8f0'
      }}>
        <div>
          <h2 style={{ 
            fontSize: '2rem', 
            color: '#1f2937', 
            marginBottom: '0.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            🏦 Your Vault
          </h2>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
            Master Space & Time Battle System
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {/* Battle Creation Buttons */}
          {onCreateBattle && (
            <>
              <button
                onClick={() => {}} // Disabled - no action
                title="Under Construction"
                style={{
                  background: '#9ca3af',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  cursor: 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s',
                  opacity: 0.6
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.6';
                }}
              >
                🚀 Live Battle
              </button>
            </>
          )}
          
          {/* Sync PP Button - Admin Only */}
          {currentUser?.email === 'edm21179@gmail.com' && (
            <button
              onClick={onSyncPP}
              style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(79, 70, 229, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(79, 70, 229, 0.2)';
              }}
            >
              🔄 Sync PP
            </button>
          )}
        </div>
      </div>

      {/* Quick Actions Section */}
      <div style={{ 
        background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
        border: '2px solid #bbf7d0',
        borderRadius: '1rem',
        padding: '1.5rem',
        marginBottom: '2rem',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#1f2937' }}>Quick Actions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
          <button 
            onClick={() => onRestoreShields(5, 15)}
            disabled={vault.shieldStrength >= vault.maxShieldStrength}
            style={{
              background: vault.shieldStrength >= vault.maxShieldStrength ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              cursor: vault.shieldStrength >= vault.maxShieldStrength ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '0.875rem'
            }}
          >
            +5 Shields (15 PP)
          </button>
          
          <button 
            onClick={() => onRestoreShields(10, 24)}
            disabled={vault.shieldStrength >= vault.maxShieldStrength}
            style={{
              background: vault.shieldStrength >= vault.maxShieldStrength ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              cursor: vault.shieldStrength >= vault.maxShieldStrength ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '0.875rem'
            }}
          >
            +10 Shields (24 PP)
          </button>
          
          <button 
            onClick={() => onRestoreShields(25, 45)}
            disabled={vault.shieldStrength >= vault.maxShieldStrength}
            style={{
              background: vault.shieldStrength >= vault.maxShieldStrength ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              cursor: vault.shieldStrength >= vault.maxShieldStrength ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '0.875rem'
            }}
          >
            +25 Shields (45 PP)
          </button>
          
          <button 
            onClick={() => onRestoreShields(50, 90)}
            disabled={vault.shieldStrength >= vault.maxShieldStrength}
            style={{
              background: vault.shieldStrength >= vault.maxShieldStrength ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              cursor: vault.shieldStrength >= vault.maxShieldStrength ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              fontSize: '0.875rem'
            }}
          >
            +50 Shields (90 PP)
          </button>
        </div>
      </div>

      {/* Main Stats Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
        gap: '1.5rem',
        marginBottom: '2rem'
      }}>
        {/* Power Points */}
        <div style={{ 
          background: 'white', 
          padding: '1.5rem', 
          borderRadius: '0.75rem', 
          border: '2px solid #e5e7eb',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 'bold' }}>POWER POINTS</div>
            <span style={{ fontSize: '1.5rem' }}>⚡</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#059669', marginBottom: '0.5rem', position: 'relative', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>{vault.currentPP.toLocaleString()} / {vault.capacity.toLocaleString()}</span>
            {ppBoostStatus.isActive && (
              <span 
                style={{ 
                  fontSize: '1.25rem',
                  color: '#f59e0b',
                  fontWeight: 'bold',
                  background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  textShadow: '0 0 4px rgba(245, 158, 11, 0.5)',
                  animation: 'pulse 2s infinite'
                }}
                title={`⚡ Double PP Boost Active! (${ppBoostStatus.timeRemaining} remaining)`}
              >
                ×2
              </span>
            )}
            {showPPNotification && (
              <div style={{
                position: 'absolute',
                top: '-10px',
                right: '-10px',
                background: '#10b981',
                color: 'white',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                animation: 'pulse 1s infinite',
                zIndex: 10
              }}>
                💰 UPDATED!
              </div>
            )}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ 
              background: '#f3f4f6', 
              height: '8px', 
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                background: `linear-gradient(90deg, ${getStatusColor(ppPercentage)} 0%, ${getStatusColor(ppPercentage)}80 100%)`,
                height: '100%',
                width: `${Math.min(ppPercentage, 100)}%`,
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            fontSize: '0.875rem',
            color: '#6b7280'
          }}>
            <span>{getStatusIcon(ppPercentage)} {ppPercentage.toFixed(1)}% Full</span>
            <span>Capacity: {vault.capacity.toLocaleString()}</span>
          </div>
        </div>

        {/* Vault Health */}
        <div style={{ 
          background: 'white', 
          padding: '1.5rem', 
          borderRadius: '0.75rem', 
          border: '2px solid #e5e7eb',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 'bold' }}>VAULT HEALTH</div>
            <span style={{ fontSize: '1.5rem' }}>❤️</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: vault.vaultHealth === 0 ? '#6b7280' : '#10b981', marginBottom: '0.5rem', position: 'relative', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>{(vault.vaultHealth || vault.maxVaultHealth || Math.floor(vault.capacity * 0.1)).toLocaleString()} / {(vault.maxVaultHealth || Math.floor(vault.capacity * 0.1)).toLocaleString()}</span>
            </div>
            {cooldownRemaining && (
              <div style={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                border: '1px solid #f59e0b',
                borderRadius: '0.5rem',
                padding: '0.5rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 'bold',
                color: '#92400e'
              }}>
                <span style={{ fontSize: '1rem' }}>⏰</span>
                <span>Cooldown: {cooldownRemaining.hours}h {cooldownRemaining.minutes}m {cooldownRemaining.seconds}s</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.8, marginLeft: '0.5rem' }}>
                  (Protected from attacks)
                </span>
              </div>
            )}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ 
              background: '#f3f4f6', 
              height: '8px', 
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                background: vault.vaultHealth === 0 
                  ? 'linear-gradient(90deg, #6b7280 0%, #9ca3af 100%)'
                  : 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                height: '100%',
                width: `${vault.maxVaultHealth ? Math.min((vault.vaultHealth / vault.maxVaultHealth) * 100, 100) : 0}%`,
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            fontSize: '0.875rem',
            color: '#6b7280',
            marginBottom: '1rem'
          }}>
            <span>{vault.vaultHealth === 0 ? '⏰ On Cooldown' : '🛡️ Protection Active'}</span>
            <span>Max: {(vault.maxVaultHealth || Math.floor(vault.capacity * 0.1)).toLocaleString()}</span>
          </div>
          
          {/* Restore Health Button */}
          {(() => {
            const maxVaultHealth = vault.maxVaultHealth || Math.floor(vault.capacity * 0.1);
            const currentVaultHealth = vault.vaultHealth || 0;
            const healthNeeded = maxVaultHealth - currentVaultHealth;
            const hasCooldown = !!vault.vaultHealthCooldown;
            const canRestore = healthNeeded > 0 && vault.currentPP >= healthNeeded;
            const isOnCooldown = hasCooldown && cooldownRemaining;
            
            return (
              <div>
                <button
                  onClick={handleRestoreVaultHealth}
                  disabled={restoreHealthLoading || !canRestore}
                  style={{
                    width: '100%',
                    background: canRestore 
                      ? (isOnCooldown 
                          ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' 
                          : 'linear-gradient(135deg, #10b981 0%, #059669 100%)')
                      : '#9ca3af',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1rem',
                    borderRadius: '0.5rem',
                    cursor: canRestore ? 'pointer' : 'not-allowed',
                    fontSize: '0.875rem',
                    fontWeight: 'bold',
                    transition: 'all 0.2s ease',
                    boxShadow: canRestore ? '0 2px 4px rgba(16, 185, 129, 0.2)' : 'none'
                  }}
                  onMouseEnter={(e) => {
                    if (canRestore) {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = isOnCooldown 
                        ? '0 4px 8px rgba(245, 158, 11, 0.3)' 
                        : '0 4px 8px rgba(16, 185, 129, 0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (canRestore) {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 4px rgba(16, 185, 129, 0.2)';
                    }
                  }}
                >
                  {restoreHealthLoading 
                    ? 'Restoring...' 
                    : healthNeeded > 0 
                      ? (isOnCooldown 
                          ? `⚠️ Restore Health Early (${healthNeeded} PP) - Removes Cooldown`
                          : `❤️ Restore Health (${healthNeeded} PP)`)
                      : 'Health Full'
                  }
                </button>
                {isOnCooldown && (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem',
                    background: '#fef3c7',
                    border: '1px solid #f59e0b',
                    borderRadius: '0.375rem',
                    fontSize: '0.75rem',
                    color: '#92400e',
                    textAlign: 'center'
                  }}>
                    ⚠️ Restoring health now will remove your cooldown protection
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Shield Strength */}
        <div style={{ 
          background: 'white', 
          padding: '1.5rem', 
          borderRadius: '0.75rem', 
          border: '2px solid #e5e7eb',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 'bold' }}>SHIELD STRENGTH</div>
            <span style={{ fontSize: '1.5rem' }}>🛡️</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#2563eb', marginBottom: '0.5rem' }}>
            {vault.shieldStrength} / {vault.maxShieldStrength}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ 
              background: '#f3f4f6', 
              height: '8px', 
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                background: `linear-gradient(90deg, ${getStatusColor(shieldPercentage)} 0%, ${getStatusColor(shieldPercentage)}80 100%)`,
                height: '100%',
                width: `${Math.min(shieldPercentage, 100)}%`,
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            fontSize: '0.875rem',
            color: '#6b7280'
          }}>
            <span>{getStatusIcon(shieldPercentage)} {shieldPercentage.toFixed(1)}% Active</span>
            <span>Max: {vault.maxShieldStrength}</span>
          </div>
          
          {/* Overshield Display */}
          {vault.overshield > 0 && (
            <div style={{ 
              marginTop: '1rem', 
              padding: '0.75rem', 
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              border: '2px solid #f59e0b',
              borderRadius: '0.5rem',
              textAlign: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '1.2rem' }}>✨</span>
                <span style={{ fontWeight: 'bold', color: '#92400e' }}>Overshield Active</span>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#92400e', marginBottom: '0.25rem' }}>
                1 Attack Absorbed
              </div>
              <div style={{ fontSize: '0.8rem', color: '#92400e' }}>
                Next incoming attack will be completely blocked
              </div>
            </div>
          )}
        </div>

        {/* Generator */}
        <div style={{ 
          background: 'white', 
          padding: '1.5rem', 
          borderRadius: '0.75rem', 
          border: '2px solid #e5e7eb',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 'bold' }}>GENERATOR</div>
            <span style={{ fontSize: '1.5rem' }}>⚡</span>
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b', marginBottom: '0.5rem' }}>
            Level {vault.generatorLevel || 1}
          </div>
          {(() => {
            const rates = getGeneratorRates(vault.generatorLevel || 1);
            const pendingPP = vault.generatorPendingPP || 0;
            const isFull = pendingPP >= rates.ppPerDay;
            
            return (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                    Pending PP: {pendingPP} / {rates.ppPerDay}
                  </div>
                  <div style={{ 
                    background: '#f3f4f6', 
                    height: '8px', 
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      background: isFull 
                        ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)'
                        : 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)',
                      height: '100%',
                      width: `${Math.min(100, (pendingPP / rates.ppPerDay) * 100)}%`,
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  marginBottom: '0.75rem'
                }}>
                  <span>⚡ {rates.ppPerDay} PP/day</span>
                  <span>🛡️ {rates.shieldsPerDay} Shields/day</span>
                </div>
                
                {/* Generator Timer */}
                <div style={{
                  background: '#fef3c7',
                  border: '1px solid #f59e0b',
                  borderRadius: '0.5rem',
                  padding: '0.5rem',
                  marginBottom: '0.75rem',
                  textAlign: 'center',
                  fontSize: '0.875rem',
                  color: '#92400e',
                  fontWeight: '500'
                }}>
                  ⏰ Until Generator Full: {generatorTimer || 'Calculating...'}
                </div>
                
                {/* Time-based Progress Bar */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    fontSize: '0.75rem',
                    color: '#6b7280',
                    marginBottom: '0.25rem'
                  }}>
                    <span>Generation Progress</span>
                    <span>{Math.round(generatorTimeProgress)}%</span>
                  </div>
                  <div style={{ 
                    background: '#f3f4f6', 
                    height: '6px', 
                    borderRadius: '3px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      background: 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)',
                      height: '100%',
                      width: `${generatorTimeProgress}%`,
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
                
                {pendingPP > 0 && (
                  <button
                    onClick={collectGeneratorPP}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      background: isFull 
                        ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                        : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transform: 'scale(1)',
                      boxShadow: 'none',
                      transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      willChange: 'transform, box-shadow'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.02)';
                      e.currentTarget.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    {isFull ? '✓ Collect PP' : `Collect ${pendingPP} PP`}
                  </button>
                )}
              </>
            );
          })()}
        </div>

        {/* Battle Moves */}
        <div style={{ 
          background: 'white', 
          padding: '1.5rem', 
          borderRadius: '0.75rem', 
          border: '2px solid #e5e7eb',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 'bold' }}>BATTLE MOVES</div>
            <span style={{ fontSize: '1.5rem' }}>⚔️</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#dc2626', marginBottom: '0.5rem' }}>
            {remainingOfflineMoves} / {maxOfflineMoves}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ 
              background: '#f3f4f6', 
              height: '8px', 
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                background: `linear-gradient(90deg, ${getStatusColor((remainingOfflineMoves / maxOfflineMoves) * 100)} 0%, ${getStatusColor((remainingOfflineMoves / maxOfflineMoves) * 100)}80 100%)`,
                height: '100%',
                width: `${(remainingOfflineMoves / maxOfflineMoves) * 100}%`,
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            fontSize: '0.875rem',
            color: '#6b7280'
          }}>
            <span>{getStatusIcon((remainingOfflineMoves / maxOfflineMoves) * 100)} Daily Remaining</span>
            <span>Resets Daily</span>
          </div>
          
          {/* Debug button for fixing moves count */}
          {process.env.NODE_ENV === 'development' && currentUser && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <button
                onClick={async () => {
                  try {
                    console.log('VaultStats: Manual refresh triggered');
                    console.log('VaultStats: Current offline moves count:', remainingOfflineMoves);
                    
                    // Get the current calculated value
                    const calculatedMoves = getRemainingOfflineMoves();
                    console.log('VaultStats: Calculated remaining moves:', calculatedMoves);
                    console.log('VaultStats: Expected count should be 2/3');
                    
                    // Force a page refresh to sync all data
                    window.location.reload();
                  } catch (error) {
                    console.error('Error refreshing:', error);
                    alert('Error refreshing data');
                  }
                }}
                style={{
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 'bold'
                }}
              >
                🔄 Refresh All Data (Debug)
              </button>
            </div>
          )}
        </div>

        {/* Offline Moves */}
        <div style={{ 
          background: 'white', 
          padding: '1.5rem', 
          borderRadius: '0.75rem', 
          border: '2px solid #e5e7eb',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 'bold' }}>OFFLINE MOVES</div>
            <span style={{ fontSize: '1.5rem' }}>⏰</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b', marginBottom: '0.5rem', position: 'relative' }}>
            {(() => {
              console.log('VaultStats: Rendering display - remainingOfflineMoves prop:', remainingOfflineMoves, 'maxOfflineMoves:', maxOfflineMoves);
              return `${remainingOfflineMoves} / ${maxOfflineMoves}`;
            })()}
            {showOfflineMovesNotification && (
              <div style={{
                position: 'absolute',
                top: '-10px',
                right: '-10px',
                background: '#f59e0b',
                color: 'white',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                animation: 'pulse 1s infinite',
                zIndex: 10
              }}>
                ⏰ UPDATED!
              </div>
            )}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ 
              background: '#f3f4f6', 
              height: '8px', 
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                background: `linear-gradient(90deg, ${getStatusColor(offlineMovesPercentage)} 0%, ${getStatusColor(offlineMovesPercentage)}80 100%)`,
                height: '100%',
                width: `${Math.min(offlineMovesPercentage, 100)}%`,
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            fontSize: '0.875rem',
            color: '#6b7280',
            marginBottom: '0.5rem'
          }}>
            <span>{getStatusIcon(offlineMovesPercentage)} Daily Remaining</span>
            <span>Resets at 8:00 AM EST</span>
          </div>
          <div style={{
            fontSize: '0.875rem',
            color: '#f59e0b',
            fontWeight: '600',
            textAlign: 'center',
            padding: '0.5rem',
            background: '#fef3c7',
            borderRadius: '0.375rem',
            marginBottom: '1rem'
          }}>
            ⏰ Next Reset: {resetTimer || 'Calculating...'}
          </div>
          
          {/* Restore Move Button */}
          <button
            onClick={handleRestoreMove}
            disabled={restoreLoading || !vault || vault.currentPP < 20}
            style={{
              background: vault && vault.currentPP >= 20 ? '#dc2626' : '#9ca3af',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1rem',
              borderRadius: '0.5rem',
              cursor: vault && vault.currentPP >= 20 ? 'pointer' : 'not-allowed',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              width: '100%',
              transition: 'all 0.2s ease'
            }}
          >
            {restoreLoading ? 'Restoring...' : `⚡ Restore Move (${restoreCost} PP)`}
          </button>
        </div>

        {/* XP Card */}
        <div style={{ 
          background: 'white', 
          padding: '1.5rem', 
          borderRadius: '0.75rem', 
          border: '2px solid #e5e7eb',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 'bold' }}>EXPERIENCE POINTS</div>
            <span style={{ fontSize: '1.5rem' }}>⭐</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b', marginBottom: '0.5rem', position: 'relative' }}>
            {userXP} XP
            {showXPNotification && (
              <div style={{
                position: 'absolute',
                top: '-10px',
                right: '-10px',
                background: '#fbbf24',
                color: 'white',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.25rem',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                animation: 'pulse 1s infinite',
                zIndex: 10
              }}>
                ⚡ UPDATED!
              </div>
            )}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ 
              background: '#f3f4f6', 
              height: '8px', 
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                background: `linear-gradient(90deg, ${getStatusColor((userXP % 50) / 50 * 100)} 0%, ${getStatusColor((userXP % 50) / 50 * 100)}80 100%)`,
                height: '100%',
                width: `${(userXP % 50) / 50 * 100}%`,
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            fontSize: '0.875rem',
            color: '#6b7280'
          }}>
            <span>{getStatusIcon((userXP % 50) / 50 * 100)} Level {userLevel}</span>
            <span>Next: {userLevel * 50} XP</span>
          </div>
        </div>
      </div>

      {/* Combat Stats */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '1rem',
        marginBottom: '2rem'
      }}>
        <div style={{ 
          background: 'white', 
          padding: '1rem', 
          borderRadius: '0.5rem', 
          border: '1px solid #e5e7eb',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>⚔️</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>
            {unlockedMoves.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Unlocked Moves</div>
        </div>

        <div style={{ 
          background: 'white', 
          padding: '1rem', 
          borderRadius: '0.5rem', 
          border: '1px solid #e5e7eb',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🃏</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>
            {unlockedCards.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Action Cards</div>
        </div>

        <div style={{ 
          background: 'white', 
          padding: '1rem', 
          borderRadius: '0.5rem', 
          border: '1px solid #e5e7eb',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🎯</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>
            {moves.filter(m => m.masteryLevel > 1).length}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Mastered Moves</div>
        </div>

        <div style={{ 
          background: 'white', 
          padding: '1rem', 
          borderRadius: '0.5rem', 
          border: '1px solid #e5e7eb',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🏆</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>
            {vault.debtStatus ? '⚠️' : '✅'}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
            {vault.debtStatus ? 'In Debt' : 'Good Standing'}
          </div>
        </div>
      </div>

      {/* Debt Warning */}
      {vault.debtStatus && (
        <div style={{ 
          background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', 
          border: '2px solid #fecaca',
          color: '#dc2626',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          marginTop: '1rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚠️</div>
          <div style={{ fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Vault in Debt Status
          </div>
          <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>
            You owe {vault.debtAmount} PP. Your vault is vulnerable to attacks!
          </div>
        </div>
      )}
    </div>
  );
};

export default VaultStats; 