import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { useNavigate } from 'react-router-dom';
import { BATTLE_CONSTANTS } from '../types/battle';

const Battle: React.FC = () => {
  const { currentUser } = useAuth();
  const { 
    vault, 
    moves, 
    actionCards, 
    battleLobbies, 
    offlineMoves,
    getRemainingOfflineMoves,
    createBattle,
    joinBattle,
    submitOfflineMove,
    syncVaultPP,
    loading,
    error 
  } = useBattle();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState<'lobby' | 'vault' | 'moves' | 'cards' | 'offline'>('lobby');
  const [selectedTarget, setSelectedTarget] = useState<string>('');

  if (!currentUser) {
    navigate('/login');
    return null;
  }

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '50vh',
        fontSize: '1.2rem',
        color: '#6b7280'
      }}>
        Loading Battle System...
      </div>
    );
  }

  const remainingOfflineMoves = getRemainingOfflineMoves();
  const unlockedMoves = moves.filter(move => move.unlocked);
  const unlockedCards = actionCards.filter(card => card.unlocked);

  const handleCreateBattle = async (type: 'live' | 'vault_siege') => {
    try {
      const battleId = await createBattle(type);
      alert(`Battle created! ID: ${battleId}`);
    } catch (err) {
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
        <p style={{ fontSize: '1.1rem', opacity: 0.9 }}>
          "Master Space & Time" — Fight with your Manifest in the Now
        </p>
      </div>

      {error && (
        <div style={{ 
          background: '#fee2e2', 
          border: '1px solid #f87171', 
          color: '#dc2626',
          padding: '1rem',
          borderRadius: '0.5rem',
          marginBottom: '1rem'
        }}>
          {error}
        </div>
      )}

      {/* Vault Status */}
      {vault && (
        <div style={{ 
          background: '#f8fafc', 
          border: '1px solid #e2e8f0',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          marginBottom: '2rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.5rem', color: '#1f2937' }}>🏦 Your Vault</h2>
            <button
              onClick={syncVaultPP}
              style={{
                background: '#4f46e5',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                cursor: 'pointer'
              }}
            >
              🔄 Sync PP
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div style={{ background: 'white', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Power Points</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#059669' }}>
                {vault.currentPP} / {vault.capacity}
              </div>
            </div>
            <div style={{ background: 'white', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Shield Strength</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#2563eb' }}>
                {vault.shieldStrength} / {vault.maxShieldStrength}
              </div>
            </div>
            <div style={{ background: 'white', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Firewall</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#7c3aed' }}>
                {vault.firewall}%
              </div>
            </div>
            <div style={{ background: 'white', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>Offline Moves</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#f59e0b' }}>
                {remainingOfflineMoves} / {BATTLE_CONSTANTS.DAILY_OFFLINE_MOVES}
              </div>
            </div>
          </div>
          {vault.debtStatus && (
            <div style={{ 
              background: '#fef2f2', 
              border: '1px solid #fecaca',
              color: '#dc2626',
              padding: '1rem',
              borderRadius: '0.5rem',
              marginTop: '1rem'
            }}>
              ⚠️ Debt Status: You owe {vault.debtAmount} PP. Your vault is vulnerable to attacks!
            </div>
          )}
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

      {/* Tab Content */}
      <div style={{ minHeight: '400px' }}>
        {activeTab === 'lobby' && (
          <div>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
              <button
                onClick={() => handleCreateBattle('live')}
                style={{
                  background: '#059669',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 2rem',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                🚀 Create Live Battle
              </button>
              <button
                onClick={() => handleCreateBattle('vault_siege')}
                style={{
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  padding: '1rem 2rem',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                🏰 Create Vault Siege
              </button>
            </div>

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
          </div>
        )}

        {activeTab === 'vault' && (
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#1f2937' }}>Vault Upgrades</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
              <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1.5rem' }}>
                <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#1f2937' }}>Capacity Upgrade</h4>
                <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
                  Increase your vault's PP storage capacity
                </p>
                <button style={{
                  background: '#059669',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.375rem',
                  cursor: 'pointer'
                }}>
                  Upgrade (100 PP)
                </button>
              </div>
              <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1.5rem' }}>
                <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#1f2937' }}>Shield Enhancement</h4>
                <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
                  Strengthen your vault's defensive shields
                </p>
                <button style={{
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.375rem',
                  cursor: 'pointer'
                }}>
                  Upgrade (75 PP)
                </button>
              </div>
              <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '1.5rem' }}>
                <h4 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#1f2937' }}>Firewall Boost</h4>
                <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
                  Improve your vault's attack resistance
                </p>
                <button style={{
                  background: '#7c3aed',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.375rem',
                  cursor: 'pointer'
                }}>
                  Upgrade (50 PP)
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'moves' && (
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#1f2937' }}>Your Moves</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
              {moves.map(move => (
                <div key={move.id} style={{ 
                  background: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  padding: '1.5rem',
                  opacity: move.unlocked ? 1 : 0.6
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <h4 style={{ fontSize: '1.1rem', color: '#1f2937' }}>{move.name}</h4>
                    <span style={{ 
                      background: move.unlocked ? '#059669' : '#9ca3af',
                      color: 'white',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem'
                    }}>
                      {move.unlocked ? 'Unlocked' : 'Locked'}
                    </span>
                  </div>
                  <p style={{ color: '#6b7280', marginBottom: '1rem', fontSize: '0.875rem' }}>
                    {move.description}
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    <span style={{ 
                      background: '#f3f4f6',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      color: '#374151'
                    }}>
                      Cost: {move.cost} PP
                    </span>
                    <span style={{ 
                      background: '#f3f4f6',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      color: '#374151'
                    }}>
                      Mastery: {move.masteryLevel}/5
                    </span>
                  </div>
                  {move.unlocked && move.masteryLevel < 5 && (
                    <button style={{
                      background: '#f59e0b',
                      color: 'white',
                      border: 'none',
                      padding: '0.5rem 1rem',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}>
                      Upgrade Mastery
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'cards' && (
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#1f2937' }}>Action Cards</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
              {actionCards.map(card => (
                <div key={card.id} style={{ 
                  background: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  padding: '1.5rem',
                  opacity: card.unlocked ? 1 : 0.6
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <h4 style={{ fontSize: '1.1rem', color: '#1f2937' }}>{card.name}</h4>
                    <span style={{ 
                      background: card.unlocked ? '#059669' : '#9ca3af',
                      color: 'white',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem'
                    }}>
                      {card.unlocked ? 'Unlocked' : 'Locked'}
                    </span>
                  </div>
                  <p style={{ color: '#6b7280', marginBottom: '1rem', fontSize: '0.875rem' }}>
                    {card.description}
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    <span style={{ 
                      background: '#f3f4f6',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      color: '#374151'
                    }}>
                      Uses: {card.uses}/{card.maxUses}
                    </span>
                    <span style={{ 
                      background: '#f3f4f6',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      color: '#374151'
                    }}>
                      {card.rarity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'offline' && (
          <div>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#1f2937' }}>Offline Moves</h3>
            <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
              You have {remainingOfflineMoves} offline moves remaining today. These moves are processed at set intervals.
            </p>
            
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
    </div>
  );
};

export default Battle; 