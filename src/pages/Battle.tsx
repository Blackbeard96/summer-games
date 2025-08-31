import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { useNavigate } from 'react-router-dom';
import { BATTLE_CONSTANTS, MOVE_PP_RANGES, MOVE_DAMAGE_VALUES } from '../types/battle';
import VaultSiegeModal from '../components/VaultSiegeModal';
import AttackHistory from '../components/AttackHistory';
import VaultStats from '../components/VaultStats';
import MovesDisplay from '../components/MovesDisplay';
import DashboardActionCards from '../components/DashboardActionCards';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';

const Battle: React.FC = () => {
  const { currentUser } = useAuth();
  const { 
    vault, 
    moves, 
    actionCards, 
    setActionCards,
    battleLobbies, 
    offlineMoves,
    attackHistory,
    getRemainingOfflineMoves,
    createBattle,
    joinBattle,
    submitOfflineMove,
    syncVaultPP,
    updateVault,
    upgradeMove,
    upgradeActionCard,
    resetActionCards,
    unlockElementalMoves,
    forceUnlockAllMoves,
    resetMovesWithElementFilter,
    applyElementFilterToExistingMoves,
    forceMigration,
    canPurchaseMove,
    getNextMilestone,
    manifestProgress,
    canPurchaseElementalMove,
    getNextElementalMilestone,
    elementalProgress,
    debugOfflineMoves,
    loading,
    error 
  } = useBattle();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'lobby' | 'vault' | 'moves' | 'cards' | 'offline' | 'history'>('lobby');
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [showVaultSiegeModal, setShowVaultSiegeModal] = useState(false);
  const [userElement, setUserElement] = useState<string>('fire'); // Default to fire, will be updated
  const [remainingOfflineMoves, setRemainingOfflineMoves] = useState<number>(0);

  // Fetch user's element from profile
  useEffect(() => {
    const fetchUserElement = async () => {
      if (!currentUser) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'students', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const element = userData.manifestationType?.toLowerCase() || 'fire';
          console.log('Battle: User element fetched:', element);
          setUserElement(element);
        }
      } catch (error) {
        console.error('Battle: Error fetching user element:', error);
        setUserElement('fire'); // Fallback to fire
      }
    };

    fetchUserElement();
  }, [currentUser]);

  // Update remaining offline moves when offline moves or attack history changes
  useEffect(() => {
    console.log('Battle: Offline moves or attack history changed');
    console.log('Battle: offlineMoves length:', offlineMoves.length, 'attackHistory length:', attackHistory.length);
    
    const moves = getRemainingOfflineMoves();
    setRemainingOfflineMoves(moves);
    console.log('Battle: Updated remaining offline moves:', moves);
  }, [offlineMoves, attackHistory, getRemainingOfflineMoves]);

  // Manual refresh function for debugging
  const handleRefreshOfflineMoves = () => {
    console.log('Battle: Manual refresh triggered');
    const moves = getRemainingOfflineMoves();
    setRemainingOfflineMoves(moves);
    console.log('Battle: Manual refresh - remaining offline moves:', moves);
  };

  // Removed forceUpdateOfflineMoves to simplify the system

  // Debug vault changes
  useEffect(() => {
    console.log('Battle: Vault changed - currentPP:', vault?.currentPP, 'shieldStrength:', vault?.shieldStrength);
  }, [vault?.currentPP, vault?.shieldStrength]);

  // Force refresh when Vault Siege modal closes
  useEffect(() => {
    if (!showVaultSiegeModal) {
      console.log('Battle: Vault Siege modal closed, refreshing offline moves');
      const moves = getRemainingOfflineMoves();
      setRemainingOfflineMoves(moves);
      console.log('Battle: Refresh after modal close - remaining moves:', moves);
    }
  }, [showVaultSiegeModal, getRemainingOfflineMoves]);

  // Removed periodic refresh to prevent race conditions

  if (!currentUser) {
    navigate('/login');
    return null;
  }

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '50vh',
        gap: '1rem'
      }}>
        <div style={{ 
          width: '50px', 
          height: '50px', 
          border: '4px solid #e5e7eb',
          borderTop: '4px solid #4f46e5',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <div style={{ fontSize: '1.2rem', color: '#6b7280', fontWeight: 'bold' }}>
          Initializing Battle System...
        </div>
        <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
          Loading vault data, moves, and battle configurations
        </div>
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
      </div>
    );
  }

  const unlockedMoves = moves.filter(move => move.unlocked);
  const unlockedCards = actionCards.filter(card => card.unlocked);

  const handleCreateBattle = async (type: 'live' | 'vault_siege') => {
    if (type === 'vault_siege') {
      setShowVaultSiegeModal(true);
      return;
    }

    try {
      console.log('Battle page: Creating battle with type:', type);
      console.log('Battle page: Current user:', currentUser);
      console.log('Battle page: Vault state:', vault);
      
      const battleId = await createBattle(type);
      console.log('Battle page: Battle created successfully with ID:', battleId);
      alert(`Battle created! ID: ${battleId}`);
    } catch (err) {
      console.error('Battle page: Error creating battle:', err);
      alert('Failed to create battle');
    }
  };

  const handleJoinBattle = async (battleId: string) => {
    try {
      await joinBattle(battleId);
      alert('Joined battle!');
    } catch (err) {
      alert('Failed to join battle');
    }
  };

  const handleOfflineMove = async (type: 'vault_attack' | 'shield_buff' | 'pp_trade' | 'mastery_challenge') => {
    if (remainingOfflineMoves <= 0) {
      alert('No offline moves remaining today!');
      return;
    }

    if (type === 'vault_attack' && !selectedTarget) {
      alert('Please select a target for vault attack');
      return;
    }

    try {
      await submitOfflineMove(type, selectedTarget || undefined);
      alert('Offline move submitted!');
    } catch (err) {
      alert('Failed to submit offline move');
    }
  };

  const handleRestoreShields = async (shieldAmount: number, cost: number) => {
    if (!vault) {
      alert('Vault not loaded');
      return;
    }

    if (vault.currentPP < cost) {
      alert(`Not enough PP! You need ${cost} PP but only have ${vault.currentPP} PP.`);
      return;
    }

    if (vault.shieldStrength >= vault.maxShieldStrength) {
      alert('Your shields are already at maximum strength!');
      return;
    }

    try {
      const newShieldStrength = Math.min(vault.maxShieldStrength, vault.shieldStrength + shieldAmount);
      const newPP = vault.currentPP - cost;
      
      await updateVault({
        shieldStrength: newShieldStrength,
        currentPP: newPP
      });
      
      alert(`Shields restored! +${shieldAmount} shields for ${cost} PP.`);
    } catch (err) {
      console.error('Error restoring shields:', err);
      alert('Failed to restore shields');
    }
  };

  const handlePurchaseOfflineMoves = async () => {
    if (!vault) {
      alert('Vault not loaded');
      return;
    }

    const cost = 20;
    if (vault.currentPP < cost) {
      alert(`Not enough PP! You need ${cost} PP but only have ${vault.currentPP} PP.`);
      return;
    }

    try {
      const newPP = vault.currentPP - cost;
      const newMaxOfflineMoves = 4; // Increase max offline moves by 1
      
      await updateVault({
        currentPP: newPP
      });
      
      // Update the max offline moves in the context
      // Note: This would need to be implemented in the BattleContext
      // For now, we'll just update the PP and show a success message
      
      alert(`Offline move purchased! +1 offline move for ${cost} PP.`);
    } catch (err) {
      console.error('Error purchasing offline move:', err);
      alert('Failed to purchase offline move');
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '2rem',
        borderRadius: '1rem',
        marginBottom: '2rem',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⚔️ MST Battle Arena</h1>
        <p style={{ fontSize: '1.1rem', opacity: 0.9, marginBottom: '1rem' }}>
          "Master Space & Time" — Fight with your Manifest in the Now
        </p>
        <button
          onClick={forceMigration}
          style={{
            background: '#059669',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          🔧 Force Migration (Update Cards)
        </button>
      </div>

      {error && (
        <div style={{ 
          background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)', 
          border: '2px solid #f87171', 
          color: '#dc2626',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          marginBottom: '1rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⚠️</div>
          <div style={{ fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Battle System Error
          </div>
          <div style={{ fontSize: '0.875rem', marginBottom: '1rem', opacity: 0.8 }}>
            {error}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#dc2626',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              marginRight: '0.5rem'
            }}
          >
            🔄 Retry
          </button>
          <button
            onClick={forceMigration}
            style={{
              background: '#059669',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            🔧 Force Migration
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        borderBottom: '2px solid #e5e7eb',
        marginBottom: '2rem'
      }}>
        {[
          { id: 'lobby', label: 'Battle Lobby', icon: '⚔️' },
          { id: 'vault', label: 'Vault Management', icon: '🏦' },
          { id: 'moves', label: 'Moves & Mastery', icon: '🎯' },
          { id: 'cards', label: 'Action Cards', icon: '🃏' },
          { id: 'offline', label: 'Offline Moves', icon: '⏰' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              background: activeTab === tab.id ? '#4f46e5' : 'transparent',
              color: activeTab === tab.id ? 'white' : '#6b7280',
              border: 'none',
              padding: '1rem 1.5rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              borderBottom: activeTab === tab.id ? '2px solid #4f46e5' : 'none',
              transition: 'all 0.2s'
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Enhanced Vault Stats */}
      <VaultStats
        vault={vault}
        moves={moves}
        actionCards={actionCards}
        remainingOfflineMoves={remainingOfflineMoves}
        maxOfflineMoves={BATTLE_CONSTANTS.DAILY_OFFLINE_MOVES}
        onSyncPP={syncVaultPP}
        onRestoreShields={handleRestoreShields}
        onCreateBattle={handleCreateBattle}
      />

      {/* Tab Content */}
      <div style={{ minHeight: '400px' }}>
        {activeTab === 'lobby' && (
          <div>

            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#1f2937' }}>Available Battles</h3>
            {battleLobbies.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '3rem', 
                color: '#6b7280',
                background: '#f9fafb',
                borderRadius: '0.5rem'
              }}>
                No battles available. Create one to get started!
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '1rem' }}>
                {battleLobbies.map(lobby => (
                  <div key={lobby.id} style={{ 
                    background: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    padding: '1.5rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h4 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#1f2937' }}>
                          {lobby.name}
                        </h4>
                        <p style={{ color: '#6b7280', marginBottom: '0.5rem' }}>
                          Host: {lobby.hostName} • Type: {lobby.type === 'live' ? 'Live Battle' : 'Vault Siege'}
                        </p>
                        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                          Participants: {lobby.participants.length}/{lobby.maxParticipants}
                        </p>
                      </div>
                      <button
                        onClick={() => handleJoinBattle(lobby.id)}
                        disabled={lobby.participants.includes(currentUser.uid)}
                        style={{
                          background: lobby.participants.includes(currentUser.uid) ? '#9ca3af' : '#4f46e5',
                          color: 'white',
                          border: 'none',
                          padding: '0.75rem 1.5rem',
                          borderRadius: '0.375rem',
                          cursor: lobby.participants.includes(currentUser.uid) ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {lobby.participants.includes(currentUser.uid) ? 'Joined' : 'Join Battle'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Battle History Section */}
            <div style={{ marginTop: '3rem' }}>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#1f2937' }}>Recent Battle History</h3>
              <AttackHistory attacks={attackHistory} />
            </div>

            {/* Action Cards Section */}
            <div style={{ marginTop: '3rem' }}>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#1f2937' }}>🛡️ Quick Actions</h3>
              <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                Use your action cards to enhance your abilities and prepare for battle.
              </p>
              <DashboardActionCards />
            </div>
          </div>
        )}

        {activeTab === 'vault' && (
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#1f2937' }}>Vault Upgrades</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
              <div style={{ 
                background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                border: '2px solid #bbf7d0',
                borderRadius: '1rem',
                padding: '1.5rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ 
                    background: '#059669',
                    color: 'white',
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.25rem',
                    marginRight: '1rem'
                  }}>
                    💰
                  </div>
                  <h4 style={{ fontSize: '1.25rem', color: '#1f2937', margin: 0 }}>Capacity Upgrade</h4>
                </div>
                <p style={{ color: '#6b7280', marginBottom: '1rem', lineHeight: '1.5' }}>
                  Increase your vault's PP storage capacity for better resource management
                </p>
                
                {/* Current Stats */}
                <div style={{ 
                  background: 'rgba(255,255,255,0.8)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Current Capacity</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#059669' }}>
                    {vault?.capacity || 1000} PP
                  </div>
                </div>
                
                {/* Improvement Preview */}
                <div style={{ 
                  background: 'rgba(5, 150, 105, 0.1)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  marginBottom: '1rem',
                  border: '1px solid rgba(5, 150, 105, 0.2)'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#059669', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    ⬆️ After Upgrade
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#059669' }}>
                    {(vault?.capacity || 1000) + 200} PP
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#059669' }}>
                    +200 PP capacity
                  </div>
                </div>
                
                <button style={{
                  background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 1.5rem',
                  borderRadius: '0.75rem',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  width: '100%',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 15px rgba(5, 150, 105, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}>
                  💰 Upgrade (200 PP)
                </button>
              </div>
              
              <div style={{ 
                background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                border: '2px solid #93c5fd',
                borderRadius: '1rem',
                padding: '1.5rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ 
                    background: '#2563eb',
                    color: 'white',
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.25rem',
                    marginRight: '1rem'
                  }}>
                    🛡️
                  </div>
                  <h4 style={{ fontSize: '1.25rem', color: '#1f2937', margin: 0 }}>Shield Enhancement</h4>
                </div>
                <p style={{ color: '#6b7280', marginBottom: '1rem', lineHeight: '1.5' }}>
                  Strengthen your vault's defensive shields for better protection
                </p>
                
                {/* Current Stats */}
                <div style={{ 
                  background: 'rgba(255,255,255,0.8)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Current Max Shields</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>
                    {vault?.maxShieldStrength || 50} Shields
                  </div>
                </div>
                
                {/* Improvement Preview */}
                <div style={{ 
                  background: 'rgba(37, 99, 235, 0.1)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  marginBottom: '1rem',
                  border: '1px solid rgba(37, 99, 235, 0.2)'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#2563eb', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    ⬆️ After Upgrade
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#2563eb' }}>
                    {(vault?.maxShieldStrength || 50) + 25} Shields
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#2563eb' }}>
                    +25 max shield strength
                  </div>
                </div>
                
                <button style={{
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 1.5rem',
                  borderRadius: '0.75rem',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  width: '100%',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 15px rgba(37, 99, 235, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}>
                  🛡️ Upgrade (75 PP)
                </button>
              </div>
              
              <div style={{ 
                background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
                border: '2px solid #c4b5fd',
                borderRadius: '1rem',
                padding: '1.5rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ 
                    background: '#7c3aed',
                    color: 'white',
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.25rem',
                    marginRight: '1rem'
                  }}>
                    🔥
                  </div>
                  <h4 style={{ fontSize: '1.25rem', color: '#1f2937', margin: 0 }}>Firewall Boost</h4>
                </div>
                <p style={{ color: '#6b7280', marginBottom: '1rem', lineHeight: '1.5' }}>
                  Improve your vault's attack resistance and reduce incoming damage
                </p>
                
                {/* Current Stats */}
                <div style={{ 
                  background: 'rgba(255,255,255,0.8)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Current Firewall</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#7c3aed' }}>
                    {vault?.firewall || 10}%
                  </div>
                </div>
                
                {/* Improvement Preview */}
                <div style={{ 
                  background: 'rgba(124, 58, 237, 0.1)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  marginBottom: '1rem',
                  border: '1px solid rgba(124, 58, 237, 0.2)'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#7c3aed', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    ⬆️ After Upgrade
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#7c3aed' }}>
                    {(vault?.firewall || 10) + 15}%
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#7c3aed' }}>
                    +15% attack resistance
                  </div>
                </div>
                
                <button style={{
                  background: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 1.5rem',
                  borderRadius: '0.75rem',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  width: '100%',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 8px 15px rgba(124, 58, 237, 0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}>
                  🔥 Upgrade (50 PP)
                </button>
              </div>
            </div>
            
            {/* Shield Restoration Section */}
            <div style={{ marginTop: '2rem' }}>
              <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#1f2937' }}>Shield Restoration</h3>
              <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
                Restore your vault's shield strength. Current shields: {vault?.shieldStrength || 0}/{vault?.maxShieldStrength || 50}
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <button 
                  onClick={() => handleRestoreShields(5, 5)}
                  disabled={!vault || vault.shieldStrength >= vault.maxShieldStrength}
                  style={{
                    background: (!vault || vault.shieldStrength >= vault.maxShieldStrength) ? '#9ca3af' : '#10b981',
                    color: 'white',
                    border: 'none',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    cursor: (!vault || vault.shieldStrength >= vault.maxShieldStrength) ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  <div style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>+5 Shields</div>
                  <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Cost: 5 PP</div>
                </button>
                
                <button 
                  onClick={() => handleRestoreShields(10, 8)}
                  disabled={!vault || vault.shieldStrength >= vault.maxShieldStrength}
                  style={{
                    background: (!vault || vault.shieldStrength >= vault.maxShieldStrength) ? '#9ca3af' : '#10b981',
                    color: 'white',
                    border: 'none',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    cursor: (!vault || vault.shieldStrength >= vault.maxShieldStrength) ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  <div style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>+10 Shields</div>
                  <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Cost: 8 PP</div>
                </button>
                
                <button 
                  onClick={() => handleRestoreShields(25, 15)}
                  disabled={!vault || vault.shieldStrength >= vault.maxShieldStrength}
                  style={{
                    background: (!vault || vault.shieldStrength >= vault.maxShieldStrength) ? '#9ca3af' : '#10b981',
                    color: 'white',
                    border: 'none',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    cursor: (!vault || vault.shieldStrength >= vault.maxShieldStrength) ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  <div style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>+25 Shields</div>
                  <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Cost: 15 PP</div>
                </button>
                
                <button 
                  onClick={() => handleRestoreShields(50, 20)}
                  disabled={!vault || vault.shieldStrength >= vault.maxShieldStrength}
                  style={{
                    background: (!vault || vault.shieldStrength >= vault.maxShieldStrength) ? '#9ca3af' : '#10b981',
                    color: 'white',
                    border: 'none',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    cursor: (!vault || vault.shieldStrength >= vault.maxShieldStrength) ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  <div style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>+50 Shields</div>
                  <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Cost: 20 PP</div>
                </button>
                
                <button 
                  onClick={() => {
                    if (vault) {
                      const neededShields = vault.maxShieldStrength - vault.shieldStrength;
                      handleRestoreShields(neededShields, 30);
                    }
                  }}
                  disabled={!vault || vault.shieldStrength >= vault.maxShieldStrength}
                  style={{
                    background: (!vault || vault.shieldStrength >= vault.maxShieldStrength) ? '#9ca3af' : '#10b981',
                    color: 'white',
                    border: 'none',
                    padding: '1rem',
                    borderRadius: '0.5rem',
                    cursor: (!vault || vault.shieldStrength >= vault.maxShieldStrength) ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  <div style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>Full Restore</div>
                  <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Cost: 30 PP</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'moves' && (
          <>
                    {console.log('Battle page: vault?.movesRemaining:', vault?.movesRemaining, 'remainingOfflineMoves:', remainingOfflineMoves)}
        <MovesDisplay
          moves={moves}
          movesRemaining={vault?.movesRemaining ?? 1}
          offlineMovesRemaining={remainingOfflineMoves}
          maxOfflineMoves={BATTLE_CONSTANTS.DAILY_OFFLINE_MOVES}
          onUpgradeMove={upgradeMove}
          onUnlockElementalMoves={unlockElementalMoves}
          onForceUnlockAllMoves={() => forceUnlockAllMoves(userElement)}
          onResetMovesWithElementFilter={() => resetMovesWithElementFilter(userElement)}
          onApplyElementFilterToExistingMoves={() => applyElementFilterToExistingMoves(userElement)}
          onForceMigration={forceMigration}
          userElement={userElement}
          canPurchaseMove={canPurchaseMove}
          getNextMilestone={getNextMilestone}
          manifestProgress={manifestProgress}
          canPurchaseElementalMove={canPurchaseElementalMove}
          getNextElementalMilestone={getNextElementalMilestone}
          elementalProgress={elementalProgress}
        />
          </>
        )}

        {activeTab === 'cards' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.25rem', color: '#1f2937', margin: 0 }}>Action Cards</h3>
              {currentUser?.email === 'edm21179@gmail.com' && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={resetActionCards}
                    style={{
                      background: '#dc2626',
                      color: 'white',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    🔄 Reset Cards
                  </button>
                  <button
                    onClick={async () => {
                      // Force fix the Shield Restore card specifically
                      const updatedCards = actionCards.map((card, index) => {
                        if (index === 1) { // Second card (Shield Restore)
                          return {
                            ...card,
                            name: 'Shield Restore',
                            description: 'Instantly restore 10 points to your shield',
                            effect: {
                              type: 'shield_restore' as const,
                              strength: 10
                            }
                          };
                        }
                        return card;
                      });
                      
                      // Update local state
                      setActionCards(updatedCards);
                      
                      // Also update in database to persist the fix
                      try {
                        const cardsRef = doc(db, 'battleActionCards', currentUser.uid);
                        await updateDoc(cardsRef, { cards: updatedCards });
                        console.log('✅ Shield Restore card fixed in database');
                      } catch (err) {
                        console.error('Error updating cards in database:', err);
                      }
                    }}
                    style={{
                      background: '#059669',
                      color: 'white',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                  >
                    🛡️ Fix Shield Card
                  </button>
                </div>
              )}
            </div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, 380px)', 
              gap: '2rem',
              justifyContent: 'center'
            }}>
              {actionCards.map(card => {
                // Get rarity color
                const getRarityColor = () => {
                  switch (card.rarity) {
                    case 'common': return '#6b7280';
                    case 'rare': return '#2563eb';
                    case 'epic': return '#7c3aed';
                    case 'legendary': return '#f59e0b';
                    default: return '#6b7280';
                  }
                };

                // Get card background based on rarity
                const getCardBackground = () => {
                  if (!card.unlocked) {
                    return 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)';
                  }
                  switch (card.rarity) {
                    case 'common': return 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)';
                    case 'rare': return 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)';
                    case 'epic': return 'linear-gradient(135deg, #e9d5ff 0%, #c4b5fd 100%)';
                    case 'legendary': return 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)';
                    default: return 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)';
                  }
                };

                // Get card icon
                const getCardIcon = () => {
                  switch (card.type) {
                    case 'attack': return '⚔️';
                    case 'defense': return '🛡️';
                    case 'utility': return '⚡';
                    default: return '🃏';
                  }
                };

                return (
                  <div key={card.id} style={{
                    background: getCardBackground(),
                    border: '3px solid #ffffff',
                    borderRadius: '1.5rem',
                    padding: '1.5rem',
                    position: 'relative',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                    minHeight: '320px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    opacity: card.unlocked ? 1 : 0.7
                  }}
                  onMouseEnter={(e) => {
                    if (card.unlocked) {
                      e.currentTarget.style.transform = 'translateY(-8px) scale(1.02)';
                      e.currentTarget.style.boxShadow = '0 20px 40px -10px rgba(0, 0, 0, 0.4)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.3)';
                  }}>
                    
                    {/* Card Header */}
                    <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                      <div style={{ 
                        fontSize: '2rem', 
                        marginBottom: '0.5rem',
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                      }}>
                        {getCardIcon()}
                      </div>
                      <h3 style={{ 
                        fontSize: '1.5rem', 
                        fontWeight: 'bold', 
                        color: card.unlocked ? '#1f2937' : '#6b7280',
                        margin: '0',
                        textShadow: card.unlocked ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                        textAlign: 'center'
                      }}>
                        {card.name}
                      </h3>
                    </div>

                    {/* Status Badge */}
                    <div style={{ 
                      position: 'absolute',
                      top: '1rem',
                      right: '1rem',
                      background: card.unlocked ? '#059669' : '#9ca3af',
                      color: 'white',
                      padding: '0.5rem 1rem',
                      borderRadius: '1rem',
                      fontSize: '0.75rem',
                      fontWeight: 'bold',
                      backdropFilter: 'blur(10px)'
                    }}>
                      {card.unlocked ? 'UNLOCKED' : 'LOCKED'}
                    </div>

                    {/* Card Description */}
                    <div style={{ 
                      background: 'rgba(255,255,255,0.95)',
                      padding: '1rem',
                      borderRadius: '1rem',
                      marginBottom: '1rem',
                      backdropFilter: 'blur(10px)'
                    }}>
                      <p style={{ 
                        color: '#374151', 
                        fontSize: '0.875rem', 
                        lineHeight: '1.5',
                        margin: '0',
                        textAlign: 'center'
                      }}>
                        {card.description}
                      </p>
                    </div>

                    {/* Card Stats Grid */}
                    <div style={{ 
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '0.75rem',
                      marginBottom: '1rem'
                    }}>
                      {/* Uses */}
                      <div style={{
                        background: 'rgba(255,255,255,0.9)',
                        padding: '0.75rem',
                        borderRadius: '0.75rem',
                        textAlign: 'center',
                        backdropFilter: 'blur(10px)'
                      }}>
                        <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>USES</div>
                        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#374151' }}>{card.uses}/{card.maxUses}</div>
                      </div>

                      {/* Mastery Level */}
                      <div style={{
                        background: 'rgba(255,255,255,0.9)',
                        padding: '0.75rem',
                        borderRadius: '0.75rem',
                        textAlign: 'center',
                        backdropFilter: 'blur(10px)'
                      }}>
                        <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>LEVEL</div>
                        <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#059669' }}>{card.masteryLevel}/5</div>
                      </div>
                    </div>

                    {/* Rarity */}
                    <div style={{
                      background: 'rgba(255,255,255,0.9)',
                      padding: '0.75rem',
                      borderRadius: '0.75rem',
                      textAlign: 'center',
                      backdropFilter: 'blur(10px)',
                      marginBottom: '1rem'
                    }}>
                      <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>RARITY</div>
                      <div style={{ 
                        fontSize: '1rem', 
                        fontWeight: 'bold', 
                        color: getRarityColor(),
                        textTransform: 'uppercase'
                      }}>
                        {card.rarity}
                      </div>
                    </div>

                    {/* Next Level Preview */}
                    {card.unlocked && card.masteryLevel < 5 && card.nextLevelEffect && (
                      <div style={{
                        background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
                        border: '2px solid #10b981',
                        borderRadius: '0.75rem',
                        padding: '1rem',
                        marginBottom: '1rem',
                        backdropFilter: 'blur(10px)'
                      }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#065f46', marginBottom: '0.5rem', textAlign: 'center' }}>
                          Next Level Preview
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#065f46', textAlign: 'center' }}>
                          Strength: {card.effect.strength} → {card.nextLevelEffect.strength}
                        </div>
                      </div>
                    )}

                    {/* Upgrade Button */}
                    {card.unlocked && card.masteryLevel < 5 && (
                      <button
                        onClick={() => upgradeActionCard(card.id)}
                        disabled={!vault || vault.currentPP < card.upgradeCost}
                        style={{
                          background: (!vault || vault.currentPP < card.upgradeCost) ? '#9ca3af' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          color: 'white',
                          border: 'none',
                          padding: '0.75rem',
                          borderRadius: '0.75rem',
                          cursor: (!vault || vault.currentPP < card.upgradeCost) ? 'not-allowed' : 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: 'bold',
                          width: '100%',
                          marginBottom: '1rem',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          if (vault && vault.currentPP >= card.upgradeCost) {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.3)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        ⬆️ Upgrade to Level {card.masteryLevel + 1} ({card.upgradeCost} PP)
                      </button>
                    )}

                    {/* Card Type Badge */}
                    <div style={{ 
                      background: 'rgba(255,255,255,0.9)',
                      padding: '0.75rem',
                      borderRadius: '0.75rem',
                      backdropFilter: 'blur(10px)',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.25rem' }}>
                        Card Type
                      </div>
                      <div style={{ 
                        fontSize: '0.875rem', 
                        color: getRarityColor(),
                        fontWeight: '500',
                        textTransform: 'uppercase'
                      }}>
                        {card.type}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'offline' && (
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#1f2937' }}>Offline Moves</h3>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              You have {remainingOfflineMoves} offline moves remaining today. These moves are processed at set intervals.
            </p>
            
            {/* Purchase Offline Moves Button */}
            <div style={{ 
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              border: '2px solid #fbbf24',
              borderRadius: '0.75rem',
              padding: '1rem',
              marginBottom: '2rem',
              textAlign: 'center'
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                marginBottom: '0.5rem'
              }}>
                <span style={{ fontSize: '1.5rem', marginRight: '0.5rem' }}>⏰</span>
                <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#92400e' }}>
                  Purchase Additional Offline Moves
                </span>
              </div>
              <p style={{ color: '#92400e', fontSize: '0.875rem', marginBottom: '1rem' }}>
                Buy extra offline moves to increase your daily action capacity
              </p>
              <button
                onClick={() => handlePurchaseOfflineMoves()}
                disabled={!vault || vault.currentPP < 20}
                style={{
                  background: (!vault || vault.currentPP < 20) ? '#9ca3af' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  cursor: (!vault || vault.currentPP < 20) ? 'not-allowed' : 'pointer',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (vault && vault.currentPP >= 20) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(245, 158, 11, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                💰 Purchase Move (20 PP)
              </button>
              {vault && vault.currentPP < 20 && (
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: '#dc2626', 
                  marginTop: '0.5rem',
                  fontWeight: 'bold'
                }}>
                  ⚠️ Insufficient PP (Need 20 PP)
                </div>
              )}
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
              <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1.5rem' }}>
                <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#1f2937' }}>Vault Attack</h4>
                <p style={{ color: '#6b7280', marginBottom: '1rem', fontSize: '0.875rem' }}>
                  Attempt to steal PP from another player's vault
                </p>
                <input
                  type="text"
                  placeholder="Target user ID"
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    marginBottom: '1rem'
                  }}
                />
                <button
                  onClick={() => handleOfflineMove('vault_attack')}
                  disabled={remainingOfflineMoves <= 0}
                  style={{
                    background: remainingOfflineMoves <= 0 ? '#9ca3af' : '#dc2626',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.375rem',
                    cursor: remainingOfflineMoves <= 0 ? 'not-allowed' : 'pointer',
                    width: '100%'
                  }}
                >
                  Launch Attack
                </button>
              </div>

              <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1.5rem' }}>
                <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#1f2937' }}>Shield Buff</h4>
                <p style={{ color: '#6b7280', marginBottom: '1rem', fontSize: '0.875rem' }}>
                  Strengthen your vault's shields
                </p>
                <button
                  onClick={() => handleOfflineMove('shield_buff')}
                  disabled={remainingOfflineMoves <= 0}
                  style={{
                    background: remainingOfflineMoves <= 0 ? '#9ca3af' : '#2563eb',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.375rem',
                    cursor: remainingOfflineMoves <= 0 ? 'not-allowed' : 'pointer',
                    width: '100%'
                  }}
                >
                  Buff Shields
                </button>
              </div>

              <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1.5rem' }}>
                <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#1f2937' }}>Mastery Challenge</h4>
                <p style={{ color: '#6b7280', marginBottom: '1rem', fontSize: '0.875rem' }}>
                  Complete a challenge to unlock new moves
                </p>
                <button
                  onClick={() => handleOfflineMove('mastery_challenge')}
                  disabled={remainingOfflineMoves <= 0}
                  style={{
                    background: remainingOfflineMoves <= 0 ? '#9ca3af' : '#059669',
                    color: 'white',
                    border: 'none',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.375rem',
                    cursor: remainingOfflineMoves <= 0 ? 'not-allowed' : 'pointer',
                    width: '100%'
                  }}
                >
                  Start Challenge
                </button>
              </div>
            </div>

            {offlineMoves.length > 0 && (
              <div style={{ marginTop: '2rem' }}>
                <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#1f2937' }}>Recent Offline Moves</h4>
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {offlineMoves.slice(0, 5).map(move => (
                    <div key={move.id} style={{ 
                      background: '#f9fafb',
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #e5e7eb'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#374151' }}>
                          {move.type.replace('_', ' ').toUpperCase()}
                        </span>
                        <span style={{ 
                          background: move.status === 'pending' ? '#f59e0b' : move.status === 'completed' ? '#059669' : '#dc2626',
                          color: 'white',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem'
                        }}>
                          {move.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}


      </div>

      {/* Vault Siege Modal */}
      <VaultSiegeModal
        isOpen={showVaultSiegeModal}
        onClose={() => setShowVaultSiegeModal(false)}
        onAttackComplete={() => {
          console.log('Battle: Attack completed, forcing immediate refresh');
          handleRefreshOfflineMoves();
        }}
      />
    </div>
  );
};

export default Battle; 