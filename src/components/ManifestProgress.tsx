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
        marginBottom: '1rem' 
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

      {/* Description */}
      <p style={{ 
        fontSize: '0.9rem', 
        marginBottom: '1rem',
        opacity: 0.9,
        lineHeight: '1.4'
      }}>
        {manifest.description}
      </p>

      {/* Current Level Info */}
      <div style={{
        background: 'rgba(0,0,0,0.3)',
        padding: '1rem',
        borderRadius: '0.5rem',
        marginBottom: '1rem'
      }}>
        <h4 style={{ 
          marginBottom: '0.5rem', 
          color: manifest.color,
          fontSize: '1rem'
        }}>
          Current Power: {currentLevel?.scale}
        </h4>
        <p style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: '0.5rem' }}>
          {currentLevel?.example}
        </p>
        <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
          <span>XP: {playerManifest.xp}</span>
          {nextLevel && (
            <span style={{ marginLeft: '1rem' }}>
              Next Level: {nextLevel.xpRequired} XP
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {nextLevel && (
        <div style={{ marginBottom: '1rem' }}>
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

      {/* Catalyst and Signature Move */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1rem',
        marginBottom: '1rem'
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem' }}>
            Catalyst
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
            {playerManifest.catalyst}
          </div>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '0.25rem' }}>
            Signature Move
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>
            {playerManifest.signatureMove}
          </div>
        </div>
      </div>

      {/* Veil */}
      <div style={{
        background: 'rgba(220, 38, 38, 0.2)',
        border: '1px solid rgba(220, 38, 38, 0.5)',
        borderRadius: '0.5rem',
        padding: '1rem',
        marginBottom: '1rem'
      }}>
        <h4 style={{ 
          marginBottom: '0.5rem', 
          color: '#DC2626',
          fontSize: '1rem'
        }}>
          Veil to Break
        </h4>
        <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
          {playerManifest.veil}
        </p>
        <button
          onClick={() => onVeilBreak && onVeilBreak('current-veil')}
          style={{
            padding: '0.5rem 1rem',
            background: '#DC2626',
            border: 'none',
            borderRadius: '0.25rem',
            color: 'white',
            cursor: 'pointer',
            fontSize: '0.8rem'
          }}
        >
          Attempt Breakthrough
        </button>
      </div>

      {/* Ascension Levels */}
      <div>
        <h4 style={{ 
          marginBottom: '1rem', 
          color: manifest.color,
          fontSize: '1rem'
        }}>
          Ascension Path
        </h4>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
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
                opacity: playerManifest.unlockedLevels.includes(level.level) ? 1 : 0.6
              }}
            >
              <div style={{
                width: '2rem',
                height: '2rem',
                borderRadius: '50%',
                background: playerManifest.unlockedLevels.includes(level.level)
                  ? manifest.color
                  : 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
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
                  <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                    Level {level.level}: {level.scale}
                  </span>
                  <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                    {level.xpRequired} XP
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                  {level.example}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Last Ascension */}
      <div style={{
        marginTop: '1rem',
        padding: '0.75rem',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '0.5rem',
        fontSize: '0.8rem',
        opacity: 0.7,
        textAlign: 'center'
      }}>
        Last Ascension: {playerManifest.lastAscension?.toDate ? 
          playerManifest.lastAscension.toDate().toLocaleDateString() : 
          new Date(playerManifest.lastAscension).toLocaleDateString()}
      </div>
    </div>
  );
};

export default ManifestProgress; 