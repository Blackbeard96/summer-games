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
        No battle history yet. Launch your first vault siege to see battle records!
      </div>
    );
  }

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'Unknown time';
    const date = (timestamp as any).toDate ? (timestamp as any).toDate() : new Date(timestamp);
    return date.toLocaleString();
  };

  const sortedAttacks = [...attacks].sort((a, b) => {
    // Handle null timestamps by providing fallback dates
    const aTime = a.timestamp ? 
      ((a.timestamp as any).toDate ? (a.timestamp as any).toDate() : new Date(a.timestamp)) : 
      new Date(0);
    const bTime = b.timestamp ? 
      ((b.timestamp as any).toDate ? (b.timestamp as any).toDate() : new Date(b.timestamp)) : 
      new Date(0);
    return bTime.getTime() - aTime.getTime();
  });

  return (
    <div>
      <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#1f2937' }}>
        ⚔️ Battle History
      </h3>
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
        gap: '1rem' 
      }}>
        {sortedAttacks.slice(0, 6).map((attack) => {
          const isAttacker = attack.attackerId === currentUser?.uid;
          const isTarget = attack.targetId === currentUser?.uid;
          
          // Determine card background based on attack type
          const getCardBackground = () => {
            if (isAttacker) {
              return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
            } else if (isTarget) {
              return 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
            } else {
              return 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
            }
          };

          // Get attack type icon
          const getAttackIcon = () => {
            if (isAttacker) return '⚔️';
            if (isTarget) return '🛡️';
            return '⚡';
          };

          return (
            <div
              key={attack.id}
              style={{
                background: getCardBackground(),
                border: '2px solid #ffffff',
                borderRadius: '12px',
                padding: '1rem',
                position: 'relative',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                minHeight: '200px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)';
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
              }}
            >
              {/* Card Header */}
              <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
                <div style={{ 
                  fontSize: '1.5rem', 
                  marginBottom: '0.25rem',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                }}>
                  {getAttackIcon()}
                </div>
                <div style={{ 
                  fontWeight: 'bold', 
                  color: 'white',
                  fontSize: '0.875rem',
                  textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                }}>
                  {isAttacker ? 'ATTACK' : isTarget ? 'DEFENDED' : 'BATTLE'}
                </div>
              </div>

              {/* Attack Type Badge */}
              <div style={{
                position: 'absolute',
                top: '0.75rem',
                right: '0.75rem',
                background: 'rgba(255,255,255,0.9)',
                padding: '0.25rem 0.5rem',
                borderRadius: '0.5rem',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                color: '#374151',
                backdropFilter: 'blur(10px)'
              }}>
                {attack.moveName ? 'MOVE' : attack.actionCardName ? 'CARD' : 'ATTACK'}
              </div>

              {/* Attack Description */}
              <div style={{ 
                background: 'rgba(255,255,255,0.95)',
                padding: '0.75rem',
                borderRadius: '0.75rem',
                marginBottom: '0.75rem',
                backdropFilter: 'blur(10px)'
              }}>
                <div style={{ 
                  color: '#374151', 
                  fontSize: '0.875rem', 
                  lineHeight: '1.4',
                  margin: '0',
                  textAlign: 'center',
                  fontWeight: '500'
                }}>
                  {isAttacker ? (
                    <>Attacked <span style={{ color: '#dc2626', fontWeight: 'bold' }}>{attack.targetName}</span></>
                  ) : (
                    <>Attacked by <span style={{ color: '#059669', fontWeight: 'bold' }}>{attack.attackerName}</span></>
                  )}
                </div>
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: '#6b7280',
                  textAlign: 'center',
                  marginTop: '0.25rem'
                }}>
                  {formatTimestamp(attack.timestamp)}
                </div>
              </div>

              {/* Before/After Stats */}
              {attack.targetVaultBefore && attack.targetVaultAfter && (
                <div style={{ 
                  background: 'rgba(255,255,255,0.95)',
                  padding: '0.75rem',
                  borderRadius: '0.75rem',
                  marginBottom: '0.75rem',
                  backdropFilter: 'blur(10px)',
                  border: (() => {
                    // Check for discrepancies between calculated damage and actual changes
                    const expectedShieldChange = attack.shieldDamage;
                    const actualShieldChange = attack.targetVaultBefore.shieldStrength - attack.targetVaultAfter.shieldStrength;
                    const expectedPPChange = attack.ppStolen;
                    const actualPPChange = attack.targetVaultBefore.currentPP - attack.targetVaultAfter.currentPP;
                    
                    if (Math.abs(expectedShieldChange - actualShieldChange) > 0.1 || Math.abs(expectedPPChange - actualPPChange) > 0.1) {
                      return '2px solid #ef4444'; // Red border for discrepancies
                    }
                    return 'none';
                  })()
                }}>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    fontWeight: 'bold', 
                    color: '#374151', 
                    marginBottom: '0.5rem',
                    textAlign: 'center'
                  }}>
                    Target Vault Status
                    {(() => {
                      // Check for discrepancies and show warning
                      const expectedShieldChange = attack.shieldDamage;
                      const actualShieldChange = attack.targetVaultBefore.shieldStrength - attack.targetVaultAfter.shieldStrength;
                      const expectedPPChange = attack.ppStolen;
                      const actualPPChange = attack.targetVaultBefore.currentPP - attack.targetVaultAfter.currentPP;
                      
                      if (Math.abs(expectedShieldChange - actualShieldChange) > 0.1 || Math.abs(expectedPPChange - actualPPChange) > 0.1) {
                        return (
                          <div style={{ 
                            fontSize: '0.625rem', 
                            color: '#ef4444', 
                            fontWeight: 'bold',
                            marginTop: '0.25rem'
                          }}>
                            ⚠️ DISCREPANCY DETECTED
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div style={{ 
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.5rem'
                  }}>
                    {/* Shield Before/After */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>SHIELD</div>
                      <div style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 'bold' }}>
                        {attack.targetVaultBefore.shieldStrength} → {attack.targetVaultAfter.shieldStrength}
                      </div>
                      <div style={{ 
                        fontSize: '0.625rem', 
                        color: attack.targetVaultAfter.shieldStrength < attack.targetVaultBefore.shieldStrength ? '#dc2626' : '#10b981',
                        fontWeight: '500'
                      }}>
                        {attack.targetVaultAfter.shieldStrength < attack.targetVaultBefore.shieldStrength ? 
                          `-${attack.targetVaultBefore.shieldStrength - attack.targetVaultAfter.shieldStrength}` : 
                          attack.targetVaultAfter.shieldStrength > attack.targetVaultBefore.shieldStrength ? 
                          `+${attack.targetVaultAfter.shieldStrength - attack.targetVaultBefore.shieldStrength}` : 
                          'No change'
                        }
                      </div>
                    </div>
                    
                    {/* PP Before/After */}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>POWER POINTS</div>
                      <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontWeight: 'bold' }}>
                        {attack.targetVaultBefore.currentPP} → {attack.targetVaultAfter.currentPP}
                      </div>
                      <div style={{ 
                        fontSize: '0.625rem', 
                        color: attack.targetVaultAfter.currentPP < attack.targetVaultBefore.currentPP ? '#dc2626' : '#10b981',
                        fontWeight: '500'
                      }}>
                        {attack.targetVaultAfter.currentPP < attack.targetVaultBefore.currentPP ? 
                          `-${attack.targetVaultBefore.currentPP - attack.targetVaultAfter.currentPP}` : 
                          attack.targetVaultAfter.currentPP > attack.targetVaultBefore.currentPP ? 
                          `+${attack.targetVaultAfter.currentPP - attack.targetVaultBefore.currentPP}` : 
                          'No change'
                        }
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Attack Stats Grid */}
              <div style={{ 
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: '0.5rem',
                marginBottom: '0.75rem'
              }}>
                {(() => {
                  const totalDamage = (attack.shieldDamage || 0) + (attack.ppStolen || 0);
                  return totalDamage > 0 && (
                    <div style={{
                      background: 'rgba(255,255,255,0.9)',
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      textAlign: 'center',
                      backdropFilter: 'blur(10px)'
                    }}>
                      <div style={{ fontSize: '0.625rem', color: '#6b7280', marginBottom: '0.125rem' }}>DAMAGE</div>
                      <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#dc2626' }}>{totalDamage}</div>
                    </div>
                  );
                })()}
              </div>

              {/* Weapons Used */}
              <div style={{ 
                background: 'rgba(255,255,255,0.9)',
                padding: '0.75rem',
                borderRadius: '0.75rem',
                backdropFilter: 'blur(10px)'
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#374151', marginBottom: '0.25rem' }}>
                  Weapons Used
                </div>
                <div style={{ fontSize: '0.75rem', color: '#6b7280', lineHeight: '1.3' }}>
                  {attack.moveName && (
                    <div style={{ marginBottom: '0.125rem' }}>
                      <span style={{ color: '#059669', fontWeight: '500' }}>Move:</span> {attack.moveName}
                    </div>
                  )}
                  {attack.actionCardName && (
                    <div>
                      <span style={{ color: '#7c3aed', fontWeight: '500' }}>Card:</span> {attack.actionCardName}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {sortedAttacks.length > 6 && (
        <div style={{ 
          textAlign: 'center', 
          marginTop: '1rem',
          color: '#6b7280',
          fontSize: '0.875rem'
        }}>
          Showing 6 most recent attacks. {sortedAttacks.length - 6} more attacks in history.
        </div>
      )}
    </div>
  );
};

export default AttackHistory; 