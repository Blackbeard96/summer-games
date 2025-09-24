import React from 'react';
import { MANIFESTS, PlayerManifest } from '../types/manifest';

interface ManifestProgressProps {
  playerManifest: PlayerManifest;
  onVeilBreak?: (veilId: string) => void;
}

const ManifestProgress: React.FC<ManifestProgressProps> = ({ playerManifest, onVeilBreak }) => {
  const manifest = MANIFESTS.find(m => m.id === playerManifest.manifestId);
  
  if (!manifest) {
    return <div>Manifest not found</div>;
  }

  const currentLevel = manifest.levels.find(l => l.level === playerManifest.currentLevel);
  const nextLevel = manifest.levels.find(l => l.level === playerManifest.currentLevel + 1);
  const progressToNext = nextLevel ? (playerManifest.xp / nextLevel.xpRequired) * 100 : 100;

  return (
    <div style={{
      background: `linear-gradient(135deg, ${manifest.color}10 0%, ${manifest.color}05 100%)`,
      border: `2px solid ${manifest.color}`,
      borderRadius: '1rem',
      padding: '1.5rem',
      marginBottom: '1.5rem',
      color: 'white'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '1rem', 
        marginBottom: '1.5rem' 
      }}>
        <div style={{ fontSize: '3rem' }}>
          {manifest.icon}
        </div>
        <div>
          <h3 style={{ 
            fontSize: '1.5rem', 
            fontWeight: 'bold', 
            marginBottom: '0.25rem',
            color: manifest.color
          }}>
            {manifest.name}
          </h3>
          <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
            Level {playerManifest.currentLevel} • {currentLevel?.scale}
          </p>
        </div>
      </div>

      {/* Horizontal Scrollable Cards */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        overflowX: 'auto',
        paddingBottom: '0.5rem',
        scrollbarWidth: 'thin',
        scrollbarColor: `${manifest.color} rgba(255,255,255,0.2)`
      }}>
        {/* Current Level Card */}
        <div style={{
          minWidth: '280px',
          background: 'rgba(0,0,0,0.3)',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          border: `1px solid ${manifest.color}50`
        }}>
          <h4 style={{ 
            marginBottom: '1rem', 
            color: manifest.color,
            fontSize: '1.1rem',
            fontWeight: 'bold'
          }}>
            Current Power
          </h4>
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              {currentLevel?.scale}
            </div>
            <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: '1.4' }}>
              {currentLevel?.example}
            </p>
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
            <div>XP: {playerManifest.xp}</div>
            {nextLevel && (
              <div>Next Level: {nextLevel.xpRequired} XP</div>
            )}
          </div>
          {nextLevel && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                marginBottom: '0.5rem',
                fontSize: '0.8rem'
              }}>
                <span>Progress to Level {nextLevel.level}</span>
                <span>{Math.round(progressToNext)}%</span>
              </div>
              <div style={{
                width: '100%',
                height: '0.5rem',
                background: 'rgba(255,255,255,0.2)',
                borderRadius: '0.25rem',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${Math.min(progressToNext, 100)}%`,
                  height: '100%',
                  background: manifest.color,
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          )}
        </div>

        {/* Catalyst Card */}
        <div style={{
          minWidth: '200px',
          background: 'rgba(255,255,255,0.1)',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          border: '1px solid rgba(255,255,255,0.2)',
          textAlign: 'center'
        }}>
          <h4 style={{ 
            marginBottom: '1rem', 
            color: manifest.color,
            fontSize: '1.1rem',
            fontWeight: 'bold'
          }}>
            Catalyst
          </h4>
          <div style={{ fontSize: '1rem', fontWeight: 'bold', lineHeight: '1.4' }}>
            {playerManifest.catalyst}
          </div>
        </div>

        {/* Signature Move Card */}
        <div style={{
          minWidth: '200px',
          background: 'rgba(255,255,255,0.1)',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          border: '1px solid rgba(255,255,255,0.2)',
          textAlign: 'center'
        }}>
          <h4 style={{ 
            marginBottom: '1rem', 
            color: manifest.color,
            fontSize: '1.1rem',
            fontWeight: 'bold'
          }}>
            Signature Move
          </h4>
          <div style={{ fontSize: '1rem', fontWeight: 'bold', lineHeight: '1.4' }}>
            {playerManifest.signatureMove}
          </div>
        </div>

        {/* Veil Card */}
        <div style={{
          minWidth: '250px',
          background: 'rgba(220, 38, 38, 0.2)',
          border: '1px solid rgba(220, 38, 38, 0.5)',
          borderRadius: '0.75rem',
          padding: '1.5rem'
        }}>
          <h4 style={{ 
            marginBottom: '1rem', 
            color: '#DC2626',
            fontSize: '1.1rem',
            fontWeight: 'bold'
          }}>
            Veil to Break
          </h4>
          <p style={{ fontSize: '0.9rem', marginBottom: '1rem', lineHeight: '1.4' }}>
            {playerManifest.veil}
          </p>
          <button
            onClick={() => onVeilBreak && onVeilBreak('current-veil')}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#DC2626',
              border: 'none',
              borderRadius: '0.5rem',
              color: 'white',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 'bold',
              width: '100%'
            }}
          >
            Attempt Breakthrough
          </button>
        </div>

        {/* Ascension Path Card */}
        <div style={{
          minWidth: '300px',
          background: 'rgba(0,0,0,0.2)',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          border: `1px solid ${manifest.color}50`
        }}>
          <h4 style={{ 
            marginBottom: '1rem', 
            color: manifest.color,
            fontSize: '1.1rem',
            fontWeight: 'bold'
          }}>
            Ascension Path
          </h4>
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {manifest.levels.map((level) => (
              <div
                key={level.level}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem',
                  background: playerManifest.unlockedLevels.includes(level.level)
                    ? `rgba(${manifest.color.replace('#', '')}20, 0.3)`
                    : 'rgba(255,255,255,0.05)',
                  border: playerManifest.unlockedLevels.includes(level.level)
                    ? `1px solid ${manifest.color}`
                    : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '0.5rem',
                  opacity: playerManifest.unlockedLevels.includes(level.level) ? 1 : 0.6,
                  marginBottom: '0.5rem'
                }}
              >
                <div style={{
                  width: '1.5rem',
                  height: '1.5rem',
                  borderRadius: '50%',
                  background: playerManifest.unlockedLevels.includes(level.level)
                    ? manifest.color
                    : 'rgba(255,255,255,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 'bold'
                }}>
                  {playerManifest.unlockedLevels.includes(level.level) ? '✓' : level.level}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between',
                    marginBottom: '0.25rem'
                  }}>
                    <span style={{ fontWeight: 'bold', fontSize: '0.8rem' }}>
                      Level {level.level}: {level.scale}
                    </span>
                    <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>
                      {level.xpRequired} XP
                    </span>
                  </div>
                  <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                    {level.example}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManifestProgress;