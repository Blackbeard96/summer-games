import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';

interface BattleModeSelectorProps {
  onModeSelect: (mode: 'pvp' | 'offline' | 'practice') => void;
}

const BattleModeSelector: React.FC<BattleModeSelectorProps> = ({ onModeSelect }) => {
  const { currentUser } = useAuth();
  const { offlineMoves, getRemainingOfflineMoves } = useBattle();
  const [selectedMode, setSelectedMode] = useState<'pvp' | 'offline' | 'practice' | null>(null);

  const remainingOfflineMoves = getRemainingOfflineMoves();

  const battleModes = [
    {
      id: 'pvp' as const,
      title: 'PvP Battle',
      subtitle: 'Live Player vs Player',
      icon: '⚔️',
      description: 'Challenge other players in real-time turn-based combat',
      rewards: 'Large PP + XP Boost',
      color: '#ef4444',
      gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      available: true,
      details: 'Create or join battle rooms for epic vault-to-vault combat'
    },
    {
      id: 'offline' as const,
      title: 'Offline Move',
      subtitle: 'Attack Vaults',
      icon: '🏦',
      description: 'Attack player vaults when they\'re offline',
      rewards: 'Medium PP + XP Boost',
      color: '#f59e0b',
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      available: remainingOfflineMoves > 0,
      details: `Limited to 3 moves per day (${remainingOfflineMoves} remaining)`,
      movesRemaining: remainingOfflineMoves
    },
    {
      id: 'practice' as const,
      title: 'Practice Mode',
      subtitle: 'CPU Training',
      icon: '🤖',
      description: 'Battle against AI opponents to practice strategies',
      rewards: 'Small PP + XP Boost',
      color: '#8b5cf6',
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
      available: true,
      details: 'Perfect your moves against computer-controlled opponents'
    }
  ];

  const handleModeClick = (mode: 'pvp' | 'offline' | 'practice') => {
    if (!battleModes.find(m => m.id === mode)?.available) return;
    setSelectedMode(mode);
    onModeSelect(mode);
  };

  return (
    <div style={{ padding: '2rem' }}>
      <div style={{
        textAlign: 'center',
        marginBottom: '2rem'
      }}>
        <h1 style={{
          fontSize: '2.5rem',
          fontWeight: 'bold',
          background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '0.5rem'
        }}>
          🎮 Battle Arena
        </h1>
        <p style={{
          fontSize: '1.1rem',
          color: '#6b7280',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          Choose your battle mode and engage in epic vault-to-vault combat!
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
        gap: '1.5rem',
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        {battleModes.map((mode) => (
          <div
            key={mode.id}
            onClick={() => handleModeClick(mode.id)}
            style={{
              background: mode.available ? mode.gradient : 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
              borderRadius: '1rem',
              padding: '2rem',
              cursor: mode.available ? 'pointer' : 'not-allowed',
              transition: 'all 0.3s ease',
              opacity: mode.available ? 1 : 0.6,
              position: 'relative',
              overflow: 'hidden',
              border: selectedMode === mode.id ? '3px solid #fbbf24' : '2px solid transparent',
              boxShadow: mode.available 
                ? '0 10px 25px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.1)' 
                : '0 5px 15px rgba(0, 0, 0, 0.1)'
            }}
            onMouseEnter={(e) => {
              if (mode.available) {
                e.currentTarget.style.transform = 'translateY(-5px)';
                e.currentTarget.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.2)';
              }
            }}
            onMouseLeave={(e) => {
              if (mode.available) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.1)';
              }
            }}
          >
            {/* Background Pattern */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'radial-gradient(circle at 20% 80%, rgba(255, 255, 255, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.1) 0%, transparent 50%)',
              pointerEvents: 'none'
            }} />

            {/* Content */}
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem'
              }}>
                <div style={{
                  fontSize: '3rem',
                  filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))'
                }}>
                  {mode.icon}
                </div>
                {mode.movesRemaining !== undefined && (
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    padding: '0.5rem 1rem',
                    borderRadius: '2rem',
                    fontSize: '0.875rem',
                    fontWeight: 'bold',
                    backdropFilter: 'blur(10px)'
                  }}>
                    {mode.movesRemaining} moves left
                  </div>
                )}
              </div>

              <h3 style={{
                fontSize: '1.5rem',
                fontWeight: 'bold',
                color: 'white',
                marginBottom: '0.5rem',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
              }}>
                {mode.title}
              </h3>

              <p style={{
                fontSize: '1rem',
                color: 'rgba(255, 255, 255, 0.9)',
                marginBottom: '0.5rem',
                fontWeight: '500'
              }}>
                {mode.subtitle}
              </p>

              <p style={{
                fontSize: '0.875rem',
                color: 'rgba(255, 255, 255, 0.8)',
                marginBottom: '1rem',
                lineHeight: '1.5'
              }}>
                {mode.description}
              </p>

              <div style={{
                background: 'rgba(255, 255, 255, 0.15)',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
                backdropFilter: 'blur(10px)'
              }}>
                <div style={{
                  fontSize: '0.875rem',
                  color: 'rgba(255, 255, 255, 0.9)',
                  fontWeight: '500',
                  marginBottom: '0.25rem'
                }}>
                  💰 Rewards: {mode.rewards}
                </div>
                <div style={{
                  fontSize: '0.75rem',
                  color: 'rgba(255, 255, 255, 0.7)'
                }}>
                  {mode.details}
                </div>
              </div>

              {!mode.available && (
                <div style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  textAlign: 'center',
                  fontSize: '0.875rem',
                  color: 'rgba(255, 255, 255, 0.8)',
                  fontWeight: '500'
                }}>
                  🔒 Mode Unavailable
                </div>
              )}

              {mode.available && (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  textAlign: 'center',
                  fontSize: '0.875rem',
                  color: 'white',
                  fontWeight: 'bold',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.3)'
                }}>
                  🎯 Click to Start
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedMode && (
        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          background: 'linear-gradient(135deg, #1e40af 0%, #3b82f6 100%)',
          borderRadius: '0.75rem',
          textAlign: 'center',
          color: 'white'
        }}>
          <p style={{ fontSize: '1rem', margin: 0 }}>
            🎮 Selected: <strong>{battleModes.find(m => m.id === selectedMode)?.title}</strong>
          </p>
        </div>
      )}
    </div>
  );
};

export default BattleModeSelector;
