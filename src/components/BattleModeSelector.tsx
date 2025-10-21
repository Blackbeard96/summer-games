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
      title: 'Vault Siege',
      subtitle: 'Attack Vaults',
      icon: '🏰',
      description: 'Launch strategic attacks on player vaults to steal PP and break shields',
      rewards: 'Medium PP + XP Boost',
      color: '#dc2626',
      gradient: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
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
          marginBottom: '0.5rem'
        }}>
          Choose your battle mode and engage in epic vault-to-vault combat!
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1.5rem',
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        {battleModes.map((mode) => (
          <div
            key={mode.id}
            onClick={() => handleModeClick(mode.id)}
            style={{
              background: mode.gradient,
              borderRadius: '1rem',
              padding: '2rem',
              cursor: mode.available ? 'pointer' : 'not-allowed',
              opacity: mode.available ? 1 : 0.6,
              transform: mode.available ? 'scale(1)' : 'scale(0.98)',
              transition: 'all 0.3s ease',
              boxShadow: mode.available 
                ? '0 10px 25px rgba(0, 0, 0, 0.2)' 
                : '0 5px 15px rgba(0, 0, 0, 0.1)',
              border: '2px solid transparent',
              position: 'relative',
              overflow: 'hidden'
            }}
            onMouseEnter={(e) => {
              if (mode.available) {
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.boxShadow = '0 15px 35px rgba(0, 0, 0, 0.3)';
              }
            }}
            onMouseLeave={(e) => {
              if (mode.available) {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.2)';
              }
            }}
          >
            {/* Moves Remaining Badge */}
            {mode.movesRemaining !== undefined && (
              <div style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '1rem',
                fontSize: '0.875rem',
                fontWeight: 'bold',
                backdropFilter: 'blur(10px)'
              }}>
                {mode.movesRemaining} moves left
              </div>
            )}

            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              color: 'white'
            }}>
              <div style={{
                fontSize: '3rem',
                marginBottom: '1rem',
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))'
              }}>
                {mode.icon}
              </div>
              
              <h2 style={{
                fontSize: '1.5rem',
                fontWeight: 'bold',
                marginBottom: '0.5rem',
                textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
              }}>
                {mode.title}
              </h2>
              
              <p style={{
                fontSize: '1rem',
                marginBottom: '1rem',
                opacity: 0.9,
                fontWeight: '500'
              }}>
                {mode.subtitle}
              </p>
              
              <p style={{
                fontSize: '0.875rem',
                marginBottom: '1.5rem',
                opacity: 0.8,
                lineHeight: '1.4'
              }}>
                {mode.description}
              </p>
              
              <div style={{
                background: 'rgba(255, 255, 255, 0.2)',
                padding: '0.75rem 1.5rem',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
                backdropFilter: 'blur(10px)'
              }}>
                <p style={{
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  margin: 0
                }}>
                  Rewards: {mode.rewards}
                </p>
              </div>
              
              <p style={{
                fontSize: '0.75rem',
                opacity: 0.7,
                marginBottom: '1.5rem',
                fontStyle: 'italic'
              }}>
                {mode.details}
              </p>
              
              <button
                style={{
                  background: mode.available 
                    ? 'rgba(255, 255, 255, 0.2)' 
                    : 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  padding: '0.75rem 2rem',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: mode.available ? 'pointer' : 'not-allowed',
                  transition: 'all 0.3s ease',
                  backdropFilter: 'blur(10px)',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
                }}
                onMouseEnter={(e) => {
                  if (mode.available) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (mode.available) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                  }
                }}
              >
                {mode.available ? 'Click to Start' : 'Unavailable'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BattleModeSelector;


