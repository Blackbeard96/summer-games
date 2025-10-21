import React, { useState, useEffect } from 'react';
import { Vault, Move, ActionCard } from '../types/battle';
import { doc, getDoc, onSnapshot, addDoc, collection, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';

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
  const { getRemainingOfflineMoves, syncVaultPP, refreshVaultData } = useBattle();
  const [userXP, setUserXP] = useState<number>(0);
  const [restoreLoading, setRestoreLoading] = useState(false);

  // Function to restore a move for 20 PP
  const handleRestoreMove = async () => {
    console.log('VaultStats: handleRestoreMove function called!');
    
    if (!currentUser || !vault) return;
    
    if (vault.currentPP < 20) {
      alert('Not enough PP! You need 20 PP to restore a move.');
      return;
    }

    try {
      setRestoreLoading(true);
      
      // Update vault PP
      const newPP = vault.currentPP - 20;
      console.log('VaultStats: PP deduction - current:', vault.currentPP, 'new:', newPP);
      
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
      
      alert('Move restored! Spent 20 PP.');
    } catch (error) {
      console.error('Error restoring move:', error);
      alert('Failed to restore move. Please try again.');
    } finally {
      setRestoreLoading(false);
    }
  };
  const [userLevel, setUserLevel] = useState<number>(1);
  const [previousXP, setPreviousXP] = useState<number>(0);
  const [previousPP, setPreviousPP] = useState<number>(0);
  const [showXPNotification, setShowXPNotification] = useState(false);
  const [showPPNotification, setShowPPNotification] = useState(false);
  const [showOfflineMovesNotification, setShowOfflineMovesNotification] = useState(false);
  const [previousOfflineMoves, setPreviousOfflineMoves] = useState<number>(remainingOfflineMoves);

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
            onClick={() => onRestoreShields(5, 5)}
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
            +5 Shields (5 PP)
          </button>
          
          <button 
            onClick={() => onRestoreShields(10, 8)}
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
            +10 Shields (8 PP)
          </button>
          
          <button 
            onClick={() => onRestoreShields(25, 15)}
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
            +25 Shields (15 PP)
          </button>
          
          <button 
            onClick={() => {
              const neededShields = vault.maxShieldStrength - vault.shieldStrength;
              onRestoreShields(neededShields, 30);
            }}
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
            +50 Shields (30 PP)
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
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#059669', marginBottom: '0.5rem', position: 'relative' }}>
            {vault.currentPP.toLocaleString()} / {vault.capacity.toLocaleString()}
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
                {vault.overshield} Attack{vault.overshield > 1 ? 's' : ''} Absorbed
              </div>
              <div style={{ fontSize: '0.8rem', color: '#92400e' }}>
                Next incoming attack will be completely blocked
              </div>
            </div>
          )}
        </div>

        {/* Firewall */}
        <div style={{ 
          background: 'white', 
          padding: '1.5rem', 
          borderRadius: '0.75rem', 
          border: '2px solid #e5e7eb',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', fontWeight: 'bold' }}>FIREWALL</div>
            <span style={{ fontSize: '1.5rem' }}>🔥</span>
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#7c3aed', marginBottom: '0.5rem' }}>
            {vault.firewall}%
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ 
              background: '#f3f4f6', 
              height: '8px', 
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                background: `linear-gradient(90deg, ${getStatusColor(vault.firewall)} 0%, ${getStatusColor(vault.firewall)}80 100%)`,
                height: '100%',
                width: `${vault.firewall}%`,
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
            <span>{getStatusIcon(vault.firewall)} Attack Resistance</span>
            <span>Max: 100%</span>
          </div>
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
            marginBottom: '1rem'
          }}>
            <span>{getStatusIcon(offlineMovesPercentage)} Daily Remaining</span>
            <span>Resets Daily</span>
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
            {restoreLoading ? 'Restoring...' : '⚡ Restore Move (20 PP)'}
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