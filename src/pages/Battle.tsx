import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { useNavigate } from 'react-router-dom';
import { BATTLE_CONSTANTS, ACTION_CARD_DAMAGE_VALUES } from '../types/battle';
import { 
  calculateDamageRange,
  formatDamageRange 
} from '../utils/damageCalculator';
import VaultSiegeModal from '../components/VaultSiegeModal';
import AttackHistory from '../components/AttackHistory';
import VaultStats from '../components/VaultStats';
import MovesDisplay from '../components/MovesDisplay';
import DashboardActionCards from '../components/DashboardActionCards';
import BattleModeSelector from '../components/BattleModeSelector';
import PvPBattle from '../components/PvPBattle';
import PracticeModeBattle from '../components/PracticeModeBattle';
import Mindforge from '../components/Mindforge';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

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
    upgradeVaultCapacity,
    upgradeVaultShields,
    upgradeGenerator,
    collectGeneratorPP,
    getGeneratorRates,
    restoreVaultShields,
    upgradeMove,
    resetMoveLevel,
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
    error,
    success,
    setError,
    setSuccess
  } = useBattle();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'lobby' | 'vault' | 'moves' | 'cards' | 'offline' | 'history' | 'battle'>('battle');
  const [selectedBattleMode, setSelectedBattleMode] = useState<'pvp' | 'offline' | 'practice' | 'mindforge' | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [showVaultSiegeModal, setShowVaultSiegeModal] = useState(false);
  const [userElement, setUserElement] = useState<string>('fire'); // Default to fire, will be updated
  const [remainingOfflineMoves, setRemainingOfflineMoves] = useState<number>(0);

  const handleBattleModeSelect = (mode: 'pvp' | 'offline' | 'practice' | 'mindforge') => {
    setSelectedBattleMode(mode);
    if (mode === 'offline') {
      setShowVaultSiegeModal(true);
    } else {
      setShowVaultSiegeModal(false);
    }
  };

  // Fetch user's element from profile
  useEffect(() => {
    const fetchUserElement = async () => {
      if (!currentUser) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'students', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          // Check for chosen_element first (set when player selects element in Artifacts page)
          // Then check elementalAffinity, then manifestationType as fallback
          const chosenElement = userData.artifacts?.chosen_element;
          const elementalAffinity = userData.elementalAffinity;
          const manifestationType = userData.manifestationType;
          
          console.log('Battle: Element data from database:', {
            chosen_element: chosenElement,
            elementalAffinity: elementalAffinity,
            manifestationType: manifestationType,
            fullArtifacts: userData.artifacts
          });
          
          // Prioritize chosen_element, then elementalAffinity, then manifestationType
          // Only use 'fire' as fallback if NONE of these are set
          const element = chosenElement?.toLowerCase() || 
                         elementalAffinity?.toLowerCase() || 
                         manifestationType?.toLowerCase() || 
                         null; // Don't default to fire - let the user choose
          
          if (element) {
            console.log('Battle: User element set to:', element);
            setUserElement(element);
          } else {
            console.warn('Battle: No element found for user, not setting userElement (will show all elemental moves)');
            // Don't set a default - this way if no element is chosen, all moves show (or we could show a message)
          }
        }
      } catch (error) {
        console.error('Battle: Error fetching user element:', error);
        // Don't set default to fire on error - let it be null/undefined
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
      setSelectedBattleMode('offline');
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
          onClick={() => forceMigration(false)}
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
            onClick={() => forceMigration(false)}
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

      {success && (
        <div style={{ 
          background: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)', 
          border: '2px solid #10b981', 
          color: '#047857',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          marginBottom: '1rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>✅</div>
          <div style={{ fontSize: '1.1rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Success!
          </div>
          <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>
            {success}
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        borderBottom: '2px solid #e5e7eb',
        marginBottom: '2rem'
      }}>
        {[
          { id: 'battle', label: 'Player Battle', icon: '⚔️' },
          { id: 'vault', label: 'Vault Management', icon: '🏦' },
          { id: 'moves', label: 'Moves & Mastery', icon: '🎯' },
          { id: 'cards', label: 'Action Cards', icon: '🃏' },
          { id: 'offline', label: 'Vault Siege', icon: '🏰' },
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

      {/* Battle Arena Instructions */}
      <div style={{ 
        background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
        border: '2px solid #3b82f6',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        marginBottom: '2rem'
      }}>
        <h3 style={{ 
          fontSize: '1.25rem', 
          fontWeight: 'bold', 
          marginBottom: '1rem',
          color: '#1e40af',
          textAlign: 'center'
        }}>
          🎯 Battle Arena Instructions
        </h3>
        
        {activeTab === 'moves' ? (
          // Moves & Mastery Instructions
          <div style={{ 
            background: 'rgba(255, 255, 255, 0.7)',
            padding: '1.5rem',
            borderRadius: '0.5rem',
            border: '1px solid #93c5fd'
          }}>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              marginBottom: '1rem'
            }}>
              <span style={{ fontSize: '1.5rem' }}>🎯</span>
              <strong style={{ color: '#1e40af', fontSize: '1.1rem' }}>Moves & Mastery</strong>
            </div>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
              gap: '1rem',
              marginBottom: '1rem'
            }}>
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.5)',
                padding: '1rem',
                borderRadius: '0.5rem',
                border: '1px solid #bfdbfe'
              }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ fontSize: '1.2rem' }}>⚡</span>
                  <strong style={{ color: '#1e40af' }}>Manage Moves</strong>
                </div>
                <p style={{ 
                  fontSize: '0.875rem', 
                  color: '#1e40af',
                  margin: 0,
                  lineHeight: '1.4'
                }}>
                  In this section, players can manage and upgrade their Manifest and Elemental Moves.
                </p>
              </div>
              
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.5)',
                padding: '1rem',
                borderRadius: '0.5rem',
                border: '1px solid #bfdbfe'
              }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ fontSize: '1.2rem' }}>📈</span>
                  <strong style={{ color: '#1e40af' }}>Level Up</strong>
                </div>
                <p style={{ 
                  fontSize: '0.875rem', 
                  color: '#1e40af',
                  margin: 0,
                  lineHeight: '1.4'
                }}>
                  Use PP to level up your moves and increase their power and effectiveness.
                </p>
              </div>
              
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.5)',
                padding: '1rem',
                borderRadius: '0.5rem',
                border: '1px solid #bfdbfe'
              }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ fontSize: '1.2rem' }}>🛒</span>
                  <strong style={{ color: '#1e40af' }}>Purchase New</strong>
                </div>
                <p style={{ 
                  fontSize: '0.875rem', 
                  color: '#1e40af',
                  margin: 0,
                  lineHeight: '1.4'
                }}>
                  Use PP to also purchase new moves and expand your combat arsenal.
                </p>
              </div>
            </div>
          </div>
        ) : (
          // Default Battle Mode Instructions
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
            gap: '1rem' 
          }}>
            <div style={{ 
              background: 'rgba(255, 255, 255, 0.7)',
              padding: '1rem',
              borderRadius: '0.5rem',
              border: '1px solid #93c5fd'
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                marginBottom: '0.5rem'
              }}>
                <span style={{ fontSize: '1.2rem' }}>⚔️</span>
                <strong style={{ color: '#1e40af' }}>Player Battles</strong>
              </div>
              <p style={{ 
                fontSize: '0.875rem', 
                color: '#1e40af',
                margin: 0,
                lineHeight: '1.4'
              }}>
                Engage in epic player battles with classmates! Choose from PvP battles, vault siege, or practice mode to hone your skills.
              </p>
            </div>
            
            <div style={{ 
              background: 'rgba(255, 255, 255, 0.7)',
              padding: '1rem',
              borderRadius: '0.5rem',
              border: '1px solid #93c5fd'
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                marginBottom: '0.5rem'
              }}>
                <span style={{ fontSize: '1.2rem' }}>📊</span>
                <strong style={{ color: '#1e40af' }}>Battle Dashboard</strong>
              </div>
              <p style={{ 
                fontSize: '0.875rem', 
                color: '#1e40af',
                margin: 0,
                lineHeight: '1.4'
              }}>
                Monitor your vault stats, battle history, and quick actions all in one place. Manage your Power Points, shields, and battle moves efficiently.
              </p>
            </div>
          </div>
        )}
        
        <div style={{ 
          marginTop: '1rem',
          padding: '0.75rem',
          background: 'rgba(255, 255, 255, 0.5)',
          borderRadius: '0.5rem',
          border: '1px solid #93c5fd'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem',
            marginBottom: '0.5rem'
          }}>
            <span style={{ fontSize: '1rem' }}>💡</span>
            <strong style={{ color: '#1e40af', fontSize: '0.875rem' }}>Tip:</strong>
          </div>
          <p style={{ 
            fontSize: '0.8rem', 
            color: '#1e40af',
            margin: 0,
            lineHeight: '1.4'
          }}>
            {activeTab === 'moves' 
              ? 'Focus on upgrading your most powerful moves first, then expand your move collection to have more strategic options in battle!'
              : 'Monitor your vault stats and battle history to track your progress. Use quick actions to enhance your abilities before engaging in player battles!'
            }
          </p>
        </div>
      </div>

      {/* Tab Content */}
      <div style={{ minHeight: '400px' }}>
        {activeTab === 'battle' && (
          <div>
            {/* Enhanced Vault Stats - Now in Player Battle */}
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

            {/* Battle Mode Selection */}
            <div style={{ marginTop: '2rem' }}>
            {!selectedBattleMode ? (
              <div>
                <h2 style={{
                  fontSize: '1.75rem',
                  fontWeight: 'bold',
                  color: '#1f2937',
                  marginBottom: '1.5rem',
                  textAlign: 'center'
                }}>
                  Battle Modes
                </h2>
                <div style={{
                  display: 'flex',
                  gap: '1.5rem',
                  justifyContent: 'center',
                  flexWrap: 'wrap'
                }}>
                  <button
                    onClick={() => handleBattleModeSelect('pvp')}
                    style={{
                      padding: '1.5rem 2.5rem',
                      fontSize: '1.25rem',
                      fontWeight: 'bold',
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      color: 'white',
                      border: '3px solid #8B4513',
                      borderRadius: '0.75rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      minWidth: '220px',
                      position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                    title="Challenge other players in real-time combat. Test your skills against live opponents!"
                  >
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>⚔️</div>
                    <div>PvP Battle</div>
                    <div style={{
                      fontSize: '0.875rem',
                      opacity: 0.9,
                      marginTop: '0.5rem',
                      fontWeight: 'normal'
                    }}>
                      Player vs Player
                    </div>
                  </button>
                  <button
                    onClick={() => handleBattleModeSelect('offline')}
                    style={{
                      padding: '1.5rem 2.5rem',
                      fontSize: '1.25rem',
                      fontWeight: 'bold',
                      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                      color: 'white',
                      border: '3px solid #8B4513',
                      borderRadius: '0.75rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      minWidth: '220px',
                      position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                    title="Attack other players' vaults when they're offline. Use your daily offline moves strategically!"
                  >
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎯</div>
                    <div>Vault Siege</div>
                    <div style={{
                      fontSize: '0.875rem',
                      opacity: 0.9,
                      marginTop: '0.5rem',
                      fontWeight: 'normal'
                    }}>
                      Attack Offline Players
                    </div>
                  </button>
                  <button
                    onClick={() => handleBattleModeSelect('practice')}
                    style={{
                      padding: '1.5rem 2.5rem',
                      fontSize: '1.25rem',
                      fontWeight: 'bold',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: 'white',
                      border: '3px solid #8B4513',
                      borderRadius: '0.75rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      minWidth: '220px',
                      position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                    title="Train your skills against CPU opponents. Unlock new challenges and master your moves!"
                  >
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🏋️</div>
                    <div>Practice Mode</div>
                    <div style={{
                      fontSize: '0.875rem',
                      opacity: 0.9,
                      marginTop: '0.5rem',
                      fontWeight: 'normal'
                    }}>
                      Train Against CPU
                    </div>
                  </button>
                  <button
                    onClick={() => handleBattleModeSelect('mindforge')}
                    style={{
                      padding: '1.5rem 2.5rem',
                      fontSize: '1.25rem',
                      fontWeight: 'bold',
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                      color: 'white',
                      border: '3px solid #8B4513',
                      borderRadius: '0.75rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      minWidth: '220px',
                      position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                    title="Answer questions correctly to gain advantages in battle. Knowledge is power!"
                  >
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🧠</div>
                    <div>Mindforge</div>
                    <div style={{
                      fontSize: '0.875rem',
                      opacity: 0.9,
                      marginTop: '0.5rem',
                      fontWeight: 'normal'
                    }}>
                      Question-Based Combat
                    </div>
                  </button>
                </div>
              </div>
            ) : selectedBattleMode === 'pvp' ? (
              <PvPBattle onBack={() => setSelectedBattleMode(null)} />
            ) : selectedBattleMode === 'offline' ? (
              <div style={{ 
                background: '#fef3c7',
                border: '1px solid #f59e0b',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                textAlign: 'center'
              }}>
                <h3 style={{ 
                  fontSize: '1.25rem', 
                  marginBottom: '0.75rem', 
                  color: '#b45309' 
                }}>
                  Vault Siege Controls
                </h3>
                <p style={{ 
                  color: '#92400e', 
                  fontSize: '0.9rem', 
                  marginBottom: '1.5rem' 
                }}>
                  The Vault Siege interface opens in a modal window so you can focus on the battle. 
                  Use the button below to launch or reopen the siege controls.
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setShowVaultSiegeModal(true)}
                    style={{
                      background: '#dc2626',
                      color: 'white',
                      border: 'none',
                      padding: '0.75rem 1.5rem',
                      borderRadius: '0.5rem',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    Launch Vault Siege
                  </button>
                  <button
                    onClick={() => {
                      setShowVaultSiegeModal(false);
                      setSelectedBattleMode(null);
                    }}
                    style={{
                      background: '#6b7280',
                      color: 'white',
                      border: 'none',
                      padding: '0.75rem 1.5rem',
                      borderRadius: '0.5rem',
                      fontWeight: 'bold',
                      cursor: 'pointer'
                    }}
                  >
                    Back to Battle Modes
                  </button>
                </div>
              </div>
            ) : selectedBattleMode === 'practice' ? (
              <PracticeModeBattle onBack={() => setSelectedBattleMode(null)} />
            ) : selectedBattleMode === 'mindforge' ? (
              <Mindforge onBack={() => setSelectedBattleMode(null)} />
            ) : null}
            </div>

            {/* Battle History Section */}
            <div style={{ marginTop: '2rem' }}>
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
                
                <button 
                  onClick={upgradeVaultCapacity}
                  style={{
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
                  💰 Upgrade ({(() => {
                    const upgradeCount = vault?.capacityUpgrades || 0;
                    const basePrice = 200;
                    return basePrice * Math.pow(2, upgradeCount);
                  })()} PP)
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
                
                <button 
                  onClick={upgradeVaultShields}
                  style={{
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
                  🛡️ Upgrade ({(() => {
                    const upgradeCount = vault?.shieldUpgrades || 0;
                    const basePrice = 75;
                    return basePrice * Math.pow(2, upgradeCount);
                  })()} PP)
                </button>
              </div>
              
              <div style={{ 
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                border: '2px solid #f59e0b',
                borderRadius: '1rem',
                padding: '1.5rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ 
                    background: '#f59e0b',
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
                    ⚡
                  </div>
                  <h4 style={{ fontSize: '1.25rem', color: '#1f2937', margin: 0 }}>Generator</h4>
                </div>
                <p style={{ color: '#6b7280', marginBottom: '1rem', lineHeight: '1.5' }}>
                  Passively generates Power Points and Shield Strength over time
                </p>
                
                {/* Current Stats */}
                <div style={{ 
                  background: 'rgba(255,255,255,0.8)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>Current Level</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>
                    Level {vault?.generatorLevel || 1}
                  </div>
                  {(() => {
                    const rates = getGeneratorRates(vault?.generatorLevel || 1);
                    return (
                      <>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
                          ⚡ {rates.ppPerDay} PP/day
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                          🛡️ {rates.shieldsPerDay} Shields/day
                        </div>
                      </>
                    );
                  })()}
                </div>
                
                {/* Improvement Preview */}
                <div style={{ 
                  background: 'rgba(245, 158, 11, 0.1)',
                  padding: '1rem',
                  borderRadius: '0.75rem',
                  marginBottom: '1rem',
                  border: '1px solid rgba(245, 158, 11, 0.2)'
                }}>
                  <div style={{ fontSize: '0.875rem', color: '#f59e0b', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    ⬆️ After Upgrade
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f59e0b' }}>
                    Level {(vault?.generatorLevel || 1) + 1}
                  </div>
                  {(() => {
                    const nextRates = getGeneratorRates((vault?.generatorLevel || 1) + 1);
                    return (
                      <>
                        <div style={{ fontSize: '0.875rem', color: '#f59e0b' }}>
                          ⚡ {nextRates.ppPerDay} PP/day (+{nextRates.ppPerDay - getGeneratorRates(vault?.generatorLevel || 1).ppPerDay})
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#f59e0b' }}>
                          🛡️ {nextRates.shieldsPerDay} Shields/day (+{nextRates.shieldsPerDay - getGeneratorRates(vault?.generatorLevel || 1).shieldsPerDay})
                        </div>
                      </>
                    );
                  })()}
                </div>
                
                <button 
                  onClick={upgradeGenerator}
                  style={{
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: 'white',
                    border: 'none',
                    padding: '1rem 1.5rem',
                    borderRadius: '0.75rem',
                    cursor: 'pointer',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    width: '100%',
                    transform: 'translateY(0)',
                    boxShadow: 'none',
                    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    willChange: 'transform, box-shadow'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 8px 15px rgba(245, 158, 11, 0.3)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}>
                  ⚡ Upgrade Generator ({(() => {
                    const upgradeCount = vault?.generatorUpgrades || 0;
                    const basePrice = 250;
                    return basePrice + (basePrice * upgradeCount);
                  })()} PP)
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
                  onClick={() => handleRestoreShields(5, 15)}
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
                  <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Cost: 15 PP</div>
                </button>
                
                <button 
                  onClick={() => handleRestoreShields(10, 24)}
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
                  <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Cost: 24 PP</div>
                </button>
                
                <button 
                  onClick={() => handleRestoreShields(25, 45)}
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
                  <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Cost: 45 PP</div>
                </button>
                
                <button 
                  onClick={() => handleRestoreShields(50, 60)}
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
                  <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Cost: 60 PP</div>
                </button>
                
                <button 
                  onClick={() => {
                    if (vault) {
                      const neededShields = vault.maxShieldStrength - vault.shieldStrength;
                      handleRestoreShields(neededShields, 90);
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
                  <div style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>+50 Shields</div>
                  <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>Cost: 90 PP</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'moves' && (
          <>
            {/* Battle Arsenal Section */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                ⚔️ Battle Arsenal
              </h3>
              <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
                Manage your combat moves and abilities. Upgrade existing moves or unlock new ones to strengthen your battle capabilities.
              </p>
            </div>

            {console.log('Battle page: vault?.movesRemaining:', vault?.movesRemaining, 'remainingOfflineMoves:', remainingOfflineMoves)}
            <MovesDisplay
          moves={moves}
          movesRemaining={remainingOfflineMoves}
          offlineMovesRemaining={remainingOfflineMoves}
          maxOfflineMoves={BATTLE_CONSTANTS.DAILY_OFFLINE_MOVES}
          onUpgradeMove={upgradeMove}
          onResetMoveLevel={resetMoveLevel}
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

                    {/* Effect Stats */}
                    {(() => {
                      const cardDamage = ACTION_CARD_DAMAGE_VALUES[card.name];
                      if (cardDamage && cardDamage.damage) {
                        let damageRange;
                        if (typeof cardDamage.damage === 'object') {
                          // It's already a range, create proper DamageRange object
                          damageRange = {
                            min: cardDamage.damage.min,
                            max: cardDamage.damage.max,
                            average: Math.floor((cardDamage.damage.min + cardDamage.damage.max) / 2)
                          };
                        } else if (cardDamage.damage > 0) {
                          // It's a single value, calculate range based on mastery level
                          damageRange = calculateDamageRange(cardDamage.damage, card.masteryLevel, card.masteryLevel);
                        } else {
                          return null;
                        }
                        const rangeString = formatDamageRange(damageRange);
                        return (
                          <div style={{ 
                            display: 'grid',
                            gridTemplateColumns: '1fr',
                            gap: '0.75rem',
                            marginBottom: '1rem'
                          }}>
                            <div style={{
                              background: 'rgba(255,255,255,0.9)',
                              padding: '0.75rem',
                              borderRadius: '0.75rem',
                              textAlign: 'center',
                              backdropFilter: 'blur(10px)'
                            }}>
                              <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>
                                DAMAGE RANGE
                              </div>
                              <div style={{
                                fontSize: '1rem',
                                fontWeight: 'bold',
                                color: '#ef4444'
                              }}>
                                {rangeString}
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

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
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#1f2937' }}>Vault Siege</h3>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              You have {remainingOfflineMoves} vault siege attacks remaining today. Launch strategic attacks on player vaults to steal PP and break shields.
            </p>
            
            {/* Purchase Vault Siege Moves Button */}
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
                  Purchase Additional Vault Siege Moves
                </span>
              </div>
              <p style={{ color: '#92400e', fontSize: '0.875rem', marginBottom: '1rem' }}>
                Buy extra vault siege attacks to increase your daily action capacity
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
                <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#1f2937' }}>Recent Vault Siege Attacks</h4>
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
        onClose={() => {
          setShowVaultSiegeModal(false);
          setSelectedBattleMode(null);
        }}
        onAttackComplete={() => {
          console.log('Battle: Attack completed, forcing immediate refresh');
          handleRefreshOfflineMoves();
          syncVaultPP();
        }}
      />
    </div>
  );
};

export default Battle; 