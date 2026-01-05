import React from 'react';

interface BattleModeSelectorProps {
  onModeSelect: (mode: 'single' | 'multiplayer') => void;
  selectedMode?: 'single' | 'multiplayer' | null;
  multiplayerDescription?: string; // Optional custom description for multiplayer mode
}

const BattleModeSelector: React.FC<BattleModeSelectorProps> = ({ onModeSelect, selectedMode, multiplayerDescription }) => {
  return (
    <div style={{
      display: 'flex',
      gap: '1rem',
      justifyContent: 'center',
      marginBottom: '2rem',
      flexWrap: 'wrap'
    }}>
      <button
        onClick={() => onModeSelect('single')}
        style={{
          padding: '1rem 2rem',
          fontSize: '1.125rem',
          fontWeight: 'bold',
          background: selectedMode === 'single'
            ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
            : 'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)',
          color: selectedMode === 'single' ? 'white' : '#374151',
          border: selectedMode === 'single' ? '3px solid #2563eb' : '3px solid #9ca3af',
          borderRadius: '0.75rem',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: selectedMode === 'single' 
            ? '0 4px 12px rgba(59, 130, 246, 0.4)' 
            : '0 2px 8px rgba(0, 0, 0, 0.1)',
          minWidth: '200px'
        }}
        onMouseEnter={(e) => {
          if (selectedMode !== 'single') {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
          }
        }}
        onMouseLeave={(e) => {
          if (selectedMode !== 'single') {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
          }
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚔️</div>
        <div>Single Player</div>
        <div style={{ 
          fontSize: '0.875rem', 
          opacity: 0.9, 
          marginTop: '0.25rem',
          fontWeight: 'normal'
        }}>
          1v1 or 1vCPU
        </div>
      </button>

      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        disabled
        title="Coming soon"
        style={{
          padding: '1rem 2rem',
          fontSize: '1.125rem',
          fontWeight: 'bold',
          background: 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)',
          color: '#ffffff',
          border: '3px solid #6b7280',
          borderRadius: '0.75rem',
          cursor: 'not-allowed',
          transition: 'all 0.2s ease',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          minWidth: '200px',
          opacity: 0.6,
          position: 'relative'
        }}
      >
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>👥</div>
        <div>Multiplayer</div>
        <div style={{ 
          fontSize: '0.875rem', 
          opacity: 0.9, 
          marginTop: '0.25rem',
          fontWeight: 'normal'
        }}>
          {multiplayerDescription || '2-8 Players (4v4 Max)'}
        </div>
      </button>
    </div>
  );
};

export default BattleModeSelector;
