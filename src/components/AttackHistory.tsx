import React from 'react';
import { useAuth } from '../context/AuthContext';
import { VaultSiegeAttack } from '../types/battle';

interface AttackHistoryProps {
  attacks: VaultSiegeAttack[];
}

const AttackHistory: React.FC<AttackHistoryProps> = ({ attacks }) => {
  const { currentUser } = useAuth();

  if (!attacks || attacks.length === 0) {
    return (
      <div style={{ 
        textAlign: 'center', 
        padding: '2rem', 
        color: '#6b7280',
        background: '#f9fafb',
        borderRadius: '8px'
      }}>
        No attack history yet. Launch your first vault siege to see battle records!
      </div>
    );
  }

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'Unknown time';
    const date = (timestamp as any).toDate ? (timestamp as any).toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  const sortedAttacks = [...attacks].sort((a, b) => {
    const aTime = (a.timestamp as any).toDate ? (a.timestamp as any).toDate() : new Date(a.timestamp);
    const bTime = (b.timestamp as any).toDate ? (b.timestamp as any).toDate() : new Date(b.timestamp);
    return bTime.getTime() - aTime.getTime();
  });

  return (
    <div>
      <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#1f2937' }}>
        ⚔️ Attack History
      </h3>
      <div style={{ display: 'grid', gap: '1rem' }}>
        {sortedAttacks.map((attack) => {
          const isAttacker = attack.attackerId === currentUser?.uid;
          const isTarget = attack.targetId === currentUser?.uid;
          
          return (
            <div
              key={attack.id}
              style={{
                background: 'white',
                border: `2px solid ${isAttacker ? '#10b981' : isTarget ? '#ef4444' : '#e5e7eb'}`,
                borderRadius: '8px',
                padding: '1rem',
                position: 'relative',
              }}
            >
              {/* Attack Type Badge */}
              <div style={{
                position: 'absolute',
                top: '0.5rem',
                right: '0.5rem',
                background: isAttacker ? '#10b981' : '#ef4444',
                color: 'white',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 'bold',
              }}>
                {isAttacker ? 'ATTACK' : 'DEFENDED'}
              </div>

              {/* Attack Details */}
              <div style={{ marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: 'bold', color: '#1f2937', marginBottom: '0.25rem' }}>
                  {isAttacker ? (
                    <>You attacked <span style={{ color: '#ef4444' }}>{attack.targetName}</span></>
                  ) : (
                    <>You were attacked by <span style={{ color: '#10b981' }}>{attack.attackerName}</span></>
                  )}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {formatTimestamp(attack.timestamp)}
                </div>
              </div>

              {/* Attack Results */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem', marginBottom: '0.5rem' }}>
                {attack.ppStolen > 0 && (
                  <div style={{ background: '#fef3c7', padding: '0.5rem', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#92400e', fontWeight: 'bold' }}>PP Stolen</div>
                    <div style={{ fontSize: '1rem', color: '#92400e' }}>{attack.ppStolen}</div>
                  </div>
                )}
                {attack.shieldDamage > 0 && (
                  <div style={{ background: '#dbeafe', padding: '0.5rem', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 'bold' }}>Shield Damage</div>
                    <div style={{ fontSize: '1rem', color: '#1e40af' }}>{attack.shieldDamage}</div>
                  </div>
                )}
                {attack.damage > 0 && (
                  <div style={{ background: '#fee2e2', padding: '0.5rem', borderRadius: '4px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 'bold' }}>Damage</div>
                    <div style={{ fontSize: '1rem', color: '#991b1b' }}>{attack.damage}</div>
                  </div>
                )}
              </div>

              {/* Weapons Used */}
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                {attack.moveName && (
                  <span style={{ background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '4px', marginRight: '0.5rem' }}>
                    Move: {attack.moveName}
                  </span>
                )}
                {attack.actionCardName && (
                  <span style={{ background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                    Card: {attack.actionCardName}
                  </span>
                )}
              </div>

              {/* Target Vault Impact */}
              <div style={{ 
                background: '#f9fafb', 
                padding: '0.75rem', 
                borderRadius: '4px',
                fontSize: '0.875rem'
              }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem', color: '#374151' }}>
                  Target Vault Impact:
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div>
                    <span style={{ color: '#6b7280' }}>PP: </span>
                    <span style={{ 
                      color: attack.targetVaultAfter?.currentPP < attack.targetVaultBefore?.currentPP ? '#ef4444' : '#10b981',
                      fontWeight: 'bold'
                    }}>
                      {attack.targetVaultBefore?.currentPP || 'N/A'} → {attack.targetVaultAfter?.currentPP || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280' }}>Shields: </span>
                    <span style={{ 
                      color: attack.targetVaultAfter?.shieldStrength < attack.targetVaultBefore?.shieldStrength ? '#ef4444' : '#10b981',
                      fontWeight: 'bold'
                    }}>
                      {attack.targetVaultBefore?.shieldStrength || 'N/A'} → {attack.targetVaultAfter?.shieldStrength || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AttackHistory; 