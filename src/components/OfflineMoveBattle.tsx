import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { doc, getDoc, updateDoc, addDoc, collection, query, where, orderBy, limit, serverTimestamp, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import BattleEngine from './BattleEngine';

interface Student {
  id: string;
  displayName: string;
  email: string;
  powerPoints: number;
  level: number;
  vault?: {
    currentPP: number;
    shieldStrength: number;
    capacity: number;
  };
}

interface OfflineMoveBattleProps {
  onBack: () => void;
}

const OfflineMoveBattle: React.FC<OfflineMoveBattleProps> = ({ onBack }) => {
  const { currentUser } = useAuth();
  const { vault, moves, getRemainingOfflineMoves, submitOfflineMove } = useBattle();
  const [availableTargets, setAvailableTargets] = useState<Student[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<Student | null>(null);
  const [showBattleEngine, setShowBattleEngine] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remainingMoves, setRemainingMoves] = useState(0);

  useEffect(() => {
    const moves = getRemainingOfflineMoves();
    setRemainingMoves(moves);
  }, [getRemainingOfflineMoves]);

  // Fetch available targets (other students with vaults)
  useEffect(() => {
    const fetchTargets = async () => {
      if (!currentUser) return;

      try {
        const q = query(
          collection(db, 'students'),
          where('powerPoints', '>', 0),
          orderBy('powerPoints', 'desc'),
          limit(20)
        );

        const snapshot = await getDocs(q);
        const targets = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Student))
          .filter(student => student.id !== currentUser.uid && student.powerPoints > 0);

        setAvailableTargets(targets);
      } catch (error) {
        console.error('Error fetching targets:', error);
      }
    };

    fetchTargets();
  }, [currentUser]);

  const handleTargetSelect = (target: Student) => {
    if (remainingMoves <= 0) {
      alert('You have no offline moves remaining for today!');
      return;
    }
    setSelectedTarget(target);
    setShowBattleEngine(true);
  };

  const handleBattleEnd = async (result: 'victory' | 'defeat' | 'escape') => {
    setShowBattleEngine(false);
    
    if (result === 'victory' && selectedTarget) {
      try {
        // Submit offline move
        await submitOfflineMove('vault_attack', selectedTarget.id);
        
        // Update remaining moves
        const newMoves = getRemainingOfflineMoves();
        setRemainingMoves(newMoves);
        
        alert('🎉 Victory! You successfully raided the vault! Medium PP + XP boost earned!');
      } catch (error) {
        console.error('Error submitting offline move:', error);
        alert('Failed to record victory. Please try again.');
      }
    } else if (result === 'defeat') {
      try {
        // Submit offline move
        await submitOfflineMove('vault_attack', selectedTarget?.id || '');
        
        // Update remaining moves
        const newMoves = getRemainingOfflineMoves();
        setRemainingMoves(newMoves);
        
        alert('💀 Defeat! The vault was too strong!');
      } catch (error) {
        console.error('Error submitting offline move:', error);
        alert('Failed to record defeat. Please try again.');
      }
    } else {
      alert('🏃 You escaped from the vault!');
    }
    
    setSelectedTarget(null);
  };

  if (showBattleEngine && selectedTarget) {
    return (
      <div>
        <div style={{
          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          color: 'white',
          padding: '1rem',
          borderRadius: '0.75rem',
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>🏦 Offline Vault Attack</h3>
            <p style={{ margin: '0.25rem 0 0 0', opacity: 0.9 }}>
              Target: {selectedTarget.displayName} (Lv. {selectedTarget.level}) • {remainingMoves} moves remaining
            </p>
          </div>
          <button
            onClick={() => {
              setShowBattleEngine(false);
              setSelectedTarget(null);
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Cancel Attack
          </button>
        </div>
        
        <BattleEngine 
          onBattleEnd={handleBattleEnd}
          opponent={{
            id: selectedTarget.id,
            name: selectedTarget.displayName,
            currentPP: selectedTarget.powerPoints,
            maxPP: selectedTarget.powerPoints,
            shieldStrength: selectedTarget.vault?.shieldStrength || 50,
            maxShieldStrength: selectedTarget.vault?.shieldStrength || 50,
            level: selectedTarget.level
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
      }}>
        <div>
          <h2 style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>
            🏦 Offline Vault Attacks
          </h2>
          <p style={{ color: '#6b7280', fontSize: '1rem' }}>
            Attack player vaults when they're offline - Limited to 3 moves per day
          </p>
        </div>
        <button
          onClick={onBack}
          style={{
            background: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
            color: 'white',
            border: 'none',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: '500'
          }}
        >
          ← Back to Modes
        </button>
      </div>

      {/* Moves Remaining */}
      <div style={{
        background: remainingMoves > 0 
          ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
          : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        color: 'white',
        padding: '1.5rem',
        borderRadius: '0.75rem',
        marginBottom: '2rem',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
          {remainingMoves > 0 ? '⚡' : '🔒'}
        </div>
        <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
          {remainingMoves > 0 ? 'Moves Available' : 'No Moves Remaining'}
        </h3>
        <p style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>
          {remainingMoves} / 3 moves remaining today
        </p>
        {remainingMoves === 0 && (
          <p style={{ fontSize: '0.875rem', opacity: 0.9, marginTop: '0.5rem' }}>
            Purchase additional moves in the marketplace to continue attacking
          </p>
        )}
      </div>

      {/* Available Targets */}
      {remainingMoves > 0 && (
        <div>
          <h3 style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            marginBottom: '1rem',
            color: '#374151'
          }}>
            Available Vault Targets
          </h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1rem'
          }}>
            {availableTargets.map((target) => (
              <div
                key={target.id}
                style={{
                  background: 'white',
                  border: '2px solid #e5e7eb',
                  borderRadius: '0.75rem',
                  padding: '1.5rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
                onClick={() => handleTargetSelect(target)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#f59e0b';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.15)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e5e7eb';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {/* Vault Level Indicator */}
                <div style={{
                  position: 'absolute',
                  top: '1rem',
                  right: '1rem',
                  background: target.powerPoints >= 1000 
                    ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                    : target.powerPoints >= 500
                      ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                      : target.powerPoints >= 200
                        ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                        : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: 'white',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '1rem',
                  fontSize: '0.75rem',
                  fontWeight: 'bold'
                }}>
                  {target.powerPoints >= 1000 ? 'Fortress' : 
                   target.powerPoints >= 500 ? 'Castle' : 
                   target.powerPoints >= 200 ? 'Bank' : 'Basic'}
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{
                    width: '60px',
                    height: '60px',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    color: 'white',
                    fontWeight: 'bold'
                  }}>
                    🏦
                  </div>
                  <div>
                    <h4 style={{
                      fontSize: '1.125rem',
                      fontWeight: 'bold',
                      margin: 0,
                      color: '#374151'
                    }}>
                      {target.displayName}
                    </h4>
                    <p style={{
                      fontSize: '0.875rem',
                      color: '#6b7280',
                      margin: 0
                    }}>
                      Level {target.level}
                    </p>
                  </div>
                </div>

                <div style={{
                  background: '#f9fafb',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem'
                  }}>
                    <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Power Points</span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#374151' }}>
                      {target.powerPoints.toLocaleString()}
                    </span>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '8px',
                    background: '#e5e7eb',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${Math.min(100, (target.powerPoints / 1000) * 100)}%`,
                      height: '100%',
                      background: target.powerPoints >= 1000 
                        ? 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)'
                        : target.powerPoints >= 500
                          ? 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)'
                          : target.powerPoints >= 200
                            ? 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)'
                            : 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>

                <div style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: 'white',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  textAlign: 'center',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}>
                  🎯 Click to Attack
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {remainingMoves === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          background: '#f9fafb',
          borderRadius: '0.75rem',
          border: '2px dashed #d1d5db'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
          <h3 style={{
            fontSize: '1.25rem',
            fontWeight: 'bold',
            color: '#374151',
            marginBottom: '0.5rem'
          }}>
            No Moves Remaining
          </h3>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
            You've used all your offline moves for today. Visit the marketplace to purchase more!
          </p>
          <button
            onClick={() => window.location.href = '/marketplace'}
            style={{
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: 'white',
              border: 'none',
              padding: '0.75rem 2rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            Visit Marketplace
          </button>
        </div>
      )}
    </div>
  );
};

export default OfflineMoveBattle;
