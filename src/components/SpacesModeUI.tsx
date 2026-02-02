/**
 * Spaces Mode UI Component
 * 
 * Displays the spaces panel for each player showing:
 * - Three rectangles: Sub (L), Main, Sub (R)
 * - Integrity/shield bars
 * - Lock icon on Main when locked
 * - Destroyed state
 */

import React from 'react';
import { SpaceId, SpaceState, PlayerSpaces, SpacesModeState } from '../types/battleSession';

interface SpacesModeUIProps {
  spacesModeState: SpacesModeState;
  currentUserId: string;
  opponentUserId: string;
  onSpaceClick?: (spaceId: SpaceId, ownerUid: string) => void;
  selectedTarget?: { spaceId: SpaceId; ownerUid: string } | null;
}

const SpacesModeUI: React.FC<SpacesModeUIProps> = ({
  spacesModeState,
  currentUserId,
  opponentUserId,
  onSpaceClick,
  selectedTarget
}) => {
  const currentPlayerSpaces = spacesModeState.players[currentUserId];
  const opponentPlayerSpaces = spacesModeState.players[opponentUserId];

  if (!currentPlayerSpaces || !opponentPlayerSpaces) {
    return null;
  }

  const renderSpace = (
    space: SpaceState,
    spaceId: SpaceId,
    ownerUid: string,
    isOpponent: boolean
  ) => {
    const isSelected = selectedTarget?.spaceId === spaceId && selectedTarget?.ownerUid === ownerUid;
    const canClick = onSpaceClick && !space.destroyed && (spaceId !== 'main' || !space.locked);

    const spaceLabel = spaceId === 'main' ? 'Main' : spaceId === 'subLeft' ? 'Sub (L)' : 'Sub (R)';

    return (
      <div
        key={spaceId}
        onClick={() => canClick && onSpaceClick(spaceId, ownerUid)}
        style={{
          position: 'relative',
          width: '120px',
          height: '140px',
          background: space.destroyed
            ? 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)'
            : isSelected
            ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
            : canClick
            ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
            : 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)',
          borderRadius: '0.5rem',
          padding: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          cursor: canClick ? 'pointer' : 'not-allowed',
          opacity: space.destroyed ? 0.6 : 1,
          border: isSelected ? '3px solid #fbbf24' : '2px solid rgba(255,255,255,0.3)',
          boxShadow: isSelected ? '0 0 20px rgba(251, 191, 36, 0.5)' : '0 4px 6px rgba(0,0,0,0.1)',
          transition: 'all 0.2s',
          transform: isSelected ? 'scale(1.05)' : 'scale(1)'
        }}
        onMouseEnter={(e) => {
          if (canClick && !isSelected) {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 6px 12px rgba(59, 130, 246, 0.4)';
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
          }
        }}
      >
        {/* Lock Icon Overlay */}
        {space.locked && !space.destroyed && (
          <div
            style={{
              position: 'absolute',
              top: '0.5rem',
              right: '0.5rem',
              fontSize: '1.5rem',
              zIndex: 10
            }}
            title="Locked - Destroy a Sub Space first"
          >
            🔒
          </div>
        )}

        {/* Destroyed Overlay */}
        {space.destroyed && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontSize: '2rem',
              opacity: 0.8,
              zIndex: 10
            }}
          >
            💥
          </div>
        )}

        {/* Space Label */}
        <div
          style={{
            fontSize: '0.75rem',
            fontWeight: 'bold',
            color: 'white',
            marginBottom: '0.5rem',
            textAlign: 'center',
            textShadow: '0 1px 2px rgba(0,0,0,0.3)'
          }}
        >
          {spaceLabel}
        </div>

        {/* Integrity Bar */}
        <div style={{ marginBottom: '0.5rem' }}>
          <div
            style={{
              fontSize: '0.65rem',
              color: 'white',
              marginBottom: '0.25rem',
              textAlign: 'center',
              textShadow: '0 1px 2px rgba(0,0,0,0.3)'
            }}
          >
            HP: {space.integrity}/{space.maxIntegrity}
          </div>
          <div
            style={{
              width: '100%',
              height: '12px',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '0.25rem',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                width: `${(space.integrity / space.maxIntegrity) * 100}%`,
                height: '100%',
                background: space.integrity / space.maxIntegrity > 0.5
                  ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)'
                  : space.integrity / space.maxIntegrity > 0.25
                  ? 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)'
                  : 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)',
                transition: 'width 0.3s ease'
              }}
            />
          </div>
        </div>

        {/* Shield Bar */}
        {space.shield > 0 && (
          <div>
            <div
              style={{
                fontSize: '0.65rem',
                color: 'white',
                marginBottom: '0.25rem',
                textAlign: 'center',
                textShadow: '0 1px 2px rgba(0,0,0,0.3)'
              }}
            >
              🛡️ {space.shield}/{space.maxShield}
            </div>
            <div
              style={{
                width: '100%',
                height: '8px',
                background: 'rgba(0,0,0,0.3)',
                borderRadius: '0.25rem',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  width: `${(space.shield / space.maxShield) * 100}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #60a5fa 0%, #3b82f6 100%)',
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: '2rem',
        padding: '1rem',
        background: 'rgba(0,0,0,0.05)',
        borderRadius: '0.75rem',
        marginBottom: '1rem'
      }}
    >
      {/* Current Player Spaces */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: '0.875rem',
            fontWeight: 'bold',
            marginBottom: '0.5rem',
            color: '#3b82f6',
            textAlign: 'center'
          }}
        >
          Your Spaces
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
          {renderSpace(currentPlayerSpaces.spaces.subLeft, 'subLeft', currentUserId, false)}
          {renderSpace(currentPlayerSpaces.spaces.main, 'main', currentUserId, false)}
          {renderSpace(currentPlayerSpaces.spaces.subRight, 'subRight', currentUserId, false)}
        </div>
      </div>

      {/* Opponent Spaces */}
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: '0.875rem',
            fontWeight: 'bold',
            marginBottom: '0.5rem',
            color: '#ef4444',
            textAlign: 'center'
          }}
        >
          Opponent Spaces
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center' }}>
          {renderSpace(opponentPlayerSpaces.spaces.subLeft, 'subLeft', opponentUserId, true)}
          {renderSpace(opponentPlayerSpaces.spaces.main, 'main', opponentUserId, true)}
          {renderSpace(opponentPlayerSpaces.spaces.subRight, 'subRight', opponentUserId, true)}
        </div>
      </div>
    </div>
  );
};

export default SpacesModeUI;

