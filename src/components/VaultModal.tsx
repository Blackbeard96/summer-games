import React from 'react';
import { useBattle } from '../context/BattleContext';

interface VaultModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const VaultModal: React.FC<VaultModalProps> = ({ isOpen, onClose }) => {
  const { vault, loading } = useBattle();

  if (!isOpen) return null;

  if (!vault) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}
        onClick={onClose}
      >
        <div
          style={{
            backgroundColor: '#1a1a2e',
            border: '3px solid #4f46e5',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ color: '#fff', textAlign: 'center' }}>Loading vault data...</div>
        </div>
      </div>
    );
  }

  const ppPercentage = (vault.currentPP / vault.capacity) * 100;
  const shieldPercentage = (vault.shieldStrength / vault.maxShieldStrength) * 100;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#1a1a2e',
          border: '3px solid #4f46e5',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '600px',
          width: '90%',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '1.5rem' }}>🏦 Vault Status</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.5rem',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Power Points */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: '#fff', fontWeight: 'bold' }}>💰 Power Points</span>
              <span style={{ color: '#4f46e5', fontWeight: 'bold' }}>
                {vault.currentPP.toLocaleString()} / {vault.capacity.toLocaleString()}
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: '1.5rem',
                backgroundColor: '#16213e',
                borderRadius: '0.5rem',
                overflow: 'hidden',
                border: '2px solid #4f46e5',
              }}
            >
              <div
                style={{
                  width: `${Math.min(ppPercentage, 100)}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #4f46e5 0%, #7c3aed 100%)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          {/* Shield Strength */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ color: '#fff', fontWeight: 'bold' }}>🛡️ Shield Strength</span>
              <span style={{ color: '#10b981', fontWeight: 'bold' }}>
                {vault.shieldStrength} / {vault.maxShieldStrength}
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: '1.5rem',
                backgroundColor: '#16213e',
                borderRadius: '0.5rem',
                overflow: 'hidden',
                border: '2px solid #10b981',
              }}
            >
              <div
                style={{
                  width: `${Math.min(shieldPercentage, 100)}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          {/* Overshield */}
          {vault.overshield > 0 && (
            <div
              style={{
                backgroundColor: '#16213e',
                border: '2px solid #f59e0b',
                borderRadius: '0.5rem',
                padding: '1rem',
                textAlign: 'center',
              }}
            >
              <div style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: '1.2rem' }}>
                🛡️ Overshield Active: 1
              </div>
              <div style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                Your next attack will be blocked
              </div>
            </div>
          )}

          {/* Generator Info */}
          <div
            style={{
              backgroundColor: '#16213e',
              border: '2px solid #4f46e5',
              borderRadius: '0.5rem',
              padding: '1rem',
            }}
          >
            <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              ⚡ Generator Level {vault.generatorLevel}
            </div>
            {vault.generatorPendingPP > 0 && (
              <div style={{ color: '#4f46e5', fontSize: '0.9rem' }}>
                Pending PP: {vault.generatorPendingPP}
              </div>
            )}
          </div>

          {/* Daily Moves */}
          <div
            style={{
              backgroundColor: '#16213e',
              border: '2px solid #4f46e5',
              borderRadius: '0.5rem',
              padding: '1rem',
            }}
          >
            <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              🎯 Daily Moves
            </div>
            <div style={{ color: '#4f46e5', fontSize: '0.9rem' }}>
              {vault.movesRemaining} / {vault.maxMovesPerDay} remaining
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '2px solid #16213e' }}>
          <p style={{ color: '#9ca3af', fontSize: '0.9rem', textAlign: 'center', margin: 0 }}>
            Visit the Battle page to manage your vault upgrades and collect generator PP
          </p>
        </div>
      </div>
    </div>
  );
};

export default VaultModal;



