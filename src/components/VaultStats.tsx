import React from 'react';
import { Vault, Move, ActionCard } from '../types/battle';

interface VaultStatsProps {
  vault: Vault | null;
  moves: Move[];
  actionCards: ActionCard[];
  remainingOfflineMoves: number;
  maxOfflineMoves: number;
  onSyncPP: () => void;
  onRestoreShields: (amount: number, cost: number) => void;
}

const VaultStats: React.FC<VaultStatsProps> = ({
  vault,
  moves,
  actionCards,
  remainingOfflineMoves,
  maxOfflineMoves,
  onSyncPP,
  onRestoreShields
}) => {
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
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#059669', marginBottom: '0.5rem' }}>
            {vault.currentPP.toLocaleString()} / {vault.capacity.toLocaleString()}
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
            {vault.movesRemaining} / {vault.maxMovesPerDay}
          </div>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ 
              background: '#f3f4f6', 
              height: '8px', 
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                background: `linear-gradient(90deg, ${getStatusColor((vault.movesRemaining / vault.maxMovesPerDay) * 100)} 0%, ${getStatusColor((vault.movesRemaining / vault.maxMovesPerDay) * 100)}80 100%)`,
                height: '100%',
                width: `${(vault.movesRemaining / vault.maxMovesPerDay) * 100}%`,
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
            <span>{getStatusIcon((vault.movesRemaining / vault.maxMovesPerDay) * 100)} Daily Remaining</span>
            <span>Resets Daily</span>
          </div>
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
          <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b', marginBottom: '0.5rem' }}>
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
            color: '#6b7280'
          }}>
            <span>{getStatusIcon(offlineMovesPercentage)} Daily Remaining</span>
            <span>Resets Daily</span>
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

      {/* Quick Actions */}
      <div style={{ 
        background: 'white', 
        padding: '1.5rem', 
        borderRadius: '0.75rem', 
        border: '1px solid #e5e7eb'
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
            Full Restore (30 PP)
          </button>
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