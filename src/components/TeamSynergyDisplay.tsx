import React from 'react';
import { TEAM_SYNERGIES, MANIFESTS } from '../types/manifest';

interface TeamSynergyDisplayProps {
  playerManifests: string[]; // Array of manifest IDs
  onSynergyActivate?: (synergyId: string) => void;
}

const TeamSynergyDisplay: React.FC<TeamSynergyDisplayProps> = ({ 
  playerManifests, 
  onSynergyActivate 
}) => {
  // Find active synergies
  const activeSynergies = TEAM_SYNERGIES.filter(synergy => {
    return synergy.manifests.every(manifestId => 
      playerManifests.includes(manifestId)
    );
  });

  if (activeSynergies.length === 0) {
    return null;
  }

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
      borderRadius: '1rem',
      padding: '1.5rem',
      marginBottom: '1.5rem',
      color: 'white',
      border: '2px solid #8B5CF6'
    }}>
      <h3 style={{ 
        fontSize: '1.25rem', 
        fontWeight: 'bold', 
        marginBottom: '1rem',
        color: '#8B5CF6',
        textAlign: 'center'
      }}>
        🌀 Team Synergies Active
      </h3>

      <div style={{ display: 'grid', gap: '1rem' }}>
        {activeSynergies.map((synergy, index) => {
          const manifestIcons = synergy.manifests.map(manifestId => {
            const manifest = MANIFESTS.find(m => m.id === manifestId);
            return manifest?.icon || '❓';
          });

          return (
            <div
              key={index}
              style={{
                background: 'rgba(139, 92, 246, 0.2)',
                border: '1px solid rgba(139, 92, 246, 0.5)',
                borderRadius: '0.75rem',
                padding: '1rem',
                textAlign: 'center'
              }}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                gap: '0.5rem', 
                marginBottom: '0.75rem',
                fontSize: '1.5rem'
              }}>
                {manifestIcons.map((icon, i) => (
                  <span key={i}>{icon}</span>
                ))}
              </div>
              
              <h4 style={{ 
                fontSize: '1.1rem', 
                fontWeight: 'bold', 
                marginBottom: '0.5rem',
                color: '#8B5CF6'
              }}>
                {synergy.bonus}
              </h4>
              
              <p style={{ 
                fontSize: '0.9rem', 
                opacity: 0.9,
                marginBottom: '0.75rem'
              }}>
                {synergy.description}
              </p>

              {onSynergyActivate && (
                <button
                  onClick={() => onSynergyActivate(synergy.bonus)}
                  style={{
                    background: '#8B5CF6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 'bold'
                  }}
                >
                  Activate Synergy
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: '1rem',
        padding: '0.75rem',
        background: 'rgba(255,255,255,0.1)',
        borderRadius: '0.5rem',
        fontSize: '0.8rem',
        opacity: 0.8,
        textAlign: 'center'
      }}>
        Team synergies unlock when players with compatible manifests work together.
      </div>
    </div>
  );
};

export default TeamSynergyDisplay; 