import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import BattleEngine from './BattleEngine';

interface CPUOpponent {
  id: string;
  name: string;
  level: number;
  powerPoints: number;
  shieldStrength: number;
  difficulty: 'easy' | 'medium' | 'hard';
  description: string;
  rewards: {
    pp: number;
    xp: number;
  };
}

interface PracticeModeBattleProps {
  onBack: () => void;
}

const PracticeModeBattle: React.FC<PracticeModeBattleProps> = ({ onBack }) => {
  const { currentUser } = useAuth();
  const { vault, moves } = useBattle();
  const [selectedOpponent, setSelectedOpponent] = useState<CPUOpponent | null>(null);
  const [showBattleEngine, setShowBattleEngine] = useState(false);
  const [battleHistory, setBattleHistory] = useState<any[]>([]);

  const cpuOpponents: CPUOpponent[] = [
    {
      id: 'cpu-easy-1',
      name: 'Training Dummy',
      level: 5,
      powerPoints: 100,
      shieldStrength: 20,
      difficulty: 'easy',
      description: 'A basic training opponent perfect for learning the basics',
      rewards: { pp: 10, xp: 25 }
    },
    {
      id: 'cpu-easy-2',
      name: 'Novice Guard',
      level: 8,
      powerPoints: 150,
      shieldStrength: 30,
      difficulty: 'easy',
      description: 'A beginner guard with basic defensive capabilities',
      rewards: { pp: 15, xp: 35 }
    },
    {
      id: 'cpu-medium-1',
      name: 'Elite Soldier',
      level: 12,
      powerPoints: 250,
      shieldStrength: 50,
      difficulty: 'medium',
      description: 'A skilled soldier with balanced offense and defense',
      rewards: { pp: 25, xp: 50 }
    },
    {
      id: 'cpu-medium-2',
      name: 'Vault Keeper',
      level: 15,
      powerPoints: 300,
      shieldStrength: 60,
      difficulty: 'medium',
      description: 'An experienced vault keeper with strong defensive tactics',
      rewards: { pp: 30, xp: 60 }
    },
    {
      id: 'cpu-hard-1',
      name: 'Master Guardian',
      level: 20,
      powerPoints: 500,
      shieldStrength: 100,
      difficulty: 'hard',
      description: 'A master-level guardian with formidable power',
      rewards: { pp: 50, xp: 100 }
    },
    {
      id: 'cpu-hard-2',
      name: 'Legendary Protector',
      level: 25,
      powerPoints: 750,
      shieldStrength: 150,
      difficulty: 'hard',
      description: 'A legendary protector with immense strength and wisdom',
      rewards: { pp: 75, xp: 150 }
    }
  ];

  const handleOpponentSelect = (opponent: CPUOpponent) => {
    setSelectedOpponent(opponent);
    setShowBattleEngine(true);
  };

  const handleBattleEnd = async (result: 'victory' | 'defeat' | 'escape') => {
    setShowBattleEngine(false);
    
    if (selectedOpponent) {
      try {
        // Record battle result
        await addDoc(collection(db, 'practiceBattles'), {
          userId: currentUser?.uid,
          opponentId: selectedOpponent.id,
          opponentName: selectedOpponent.name,
          result: result,
          rewards: result === 'victory' ? selectedOpponent.rewards : { pp: 0, xp: 0 },
          timestamp: serverTimestamp()
        });

        if (result === 'victory') {
          // Award rewards
          if (currentUser) {
            const userRef = doc(db, 'students', currentUser.uid);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists()) {
              const userData = userDoc.data();
              const newPP = (userData.powerPoints || 0) + selectedOpponent.rewards.pp;
              const newXP = (userData.xp || 0) + selectedOpponent.rewards.xp;
              
              await updateDoc(userRef, {
                powerPoints: newPP,
                xp: newXP,
                lastUpdated: serverTimestamp()
              });
            }
          }
          
          alert(`🎉 Victory! You defeated ${selectedOpponent.name}! +${selectedOpponent.rewards.pp} PP, +${selectedOpponent.rewards.xp} XP earned!`);
        } else if (result === 'defeat') {
          alert(`💀 Defeat! ${selectedOpponent.name} was too strong! Try a different strategy.`);
        } else {
          alert('🏃 You escaped from battle!');
        }
      } catch (error) {
        console.error('Error recording battle result:', error);
        alert('Failed to record battle result. Please try again.');
      }
    }
    
    setSelectedOpponent(null);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      case 'medium': return 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
      case 'hard': return 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
      default: return 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
    }
  };

  const getDifficultyIcon = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return '🟢';
      case 'medium': return '🟡';
      case 'hard': return '🔴';
      default: return '⚪';
    }
  };

  if (showBattleEngine && selectedOpponent) {
    return (
      <div>
        <div style={{
          background: getDifficultyColor(selectedOpponent.difficulty),
          color: 'white',
          padding: '1rem',
          borderRadius: '0.75rem',
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>🤖 Practice Battle</h3>
            <p style={{ margin: '0.25rem 0 0 0', opacity: 0.9 }}>
              Opponent: {selectedOpponent.name} (Lv. {selectedOpponent.level}) • {selectedOpponent.difficulty.toUpperCase()}
            </p>
          </div>
          <button
            onClick={() => {
              setShowBattleEngine(false);
              setSelectedOpponent(null);
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
            Cancel Battle
          </button>
        </div>
        
        <BattleEngine 
          onBattleEnd={handleBattleEnd}
          opponent={{
            id: selectedOpponent.id,
            name: selectedOpponent.name,
            currentPP: selectedOpponent.powerPoints,
            maxPP: selectedOpponent.powerPoints,
            shieldStrength: selectedOpponent.shieldStrength,
            maxShieldStrength: selectedOpponent.shieldStrength,
            level: selectedOpponent.level
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
            background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '0.5rem'
          }}>
            🤖 Practice Mode
          </h2>
          <p style={{ color: '#6b7280', fontSize: '1rem' }}>
            Battle against AI opponents to practice your strategies and earn rewards
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

      {/* Practice Mode Info */}
      <div style={{
        background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        color: 'white',
        padding: '1.5rem',
        borderRadius: '0.75rem',
        marginBottom: '2rem',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎯</div>
        <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
          Perfect Your Battle Skills
        </h3>
        <p style={{ fontSize: '1rem', opacity: 0.9, margin: 0 }}>
          Practice against AI opponents of varying difficulty levels. No move limits, just pure strategy!
        </p>
      </div>

      {/* CPU Opponents */}
      <div>
        <h3 style={{
          fontSize: '1.5rem',
          fontWeight: 'bold',
          marginBottom: '1rem',
          color: '#374151'
        }}>
          Available Opponents
        </h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
          gap: '1.5rem'
        }}>
          {cpuOpponents.map((opponent) => (
            <div
              key={opponent.id}
              style={{
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
              onClick={() => handleOpponentSelect(opponent)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#8b5cf6';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.15)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {/* Difficulty Badge */}
              <div style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: getDifficultyColor(opponent.difficulty),
                color: 'white',
                padding: '0.25rem 0.75rem',
                borderRadius: '1rem',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                {getDifficultyIcon(opponent.difficulty)} {opponent.difficulty.toUpperCase()}
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
                  background: getDifficultyColor(opponent.difficulty),
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  color: 'white',
                  fontWeight: 'bold'
                }}>
                  🤖
                </div>
                <div>
                  <h4 style={{
                    fontSize: '1.125rem',
                    fontWeight: 'bold',
                    margin: 0,
                    color: '#374151'
                  }}>
                    {opponent.name}
                  </h4>
                  <p style={{
                    fontSize: '0.875rem',
                    color: '#6b7280',
                    margin: 0
                  }}>
                    Level {opponent.level}
                  </p>
                </div>
              </div>

              <p style={{
                fontSize: '0.875rem',
                color: '#6b7280',
                marginBottom: '1rem',
                lineHeight: '1.5'
              }}>
                {opponent.description}
              </p>

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
                    {opponent.powerPoints}
                  </span>
                </div>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem'
                }}>
                  <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Shield Strength</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#374151' }}>
                    {opponent.shieldStrength}
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
                    width: `${Math.min(100, (opponent.powerPoints / 1000) * 100)}%`,
                    height: '100%',
                    background: getDifficultyColor(opponent.difficulty),
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>

              <div style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                textAlign: 'center',
                fontSize: '0.875rem',
                fontWeight: '500',
                marginBottom: '0.5rem'
              }}>
                💰 Rewards: +{opponent.rewards.pp} PP, +{opponent.rewards.xp} XP
              </div>

              <div style={{
                background: getDifficultyColor(opponent.difficulty),
                color: 'white',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                textAlign: 'center',
                fontSize: '0.875rem',
                fontWeight: '500'
              }}>
                🎯 Click to Battle
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PracticeModeBattle;
