import React from 'react';
import ManifestProgress from './ManifestProgress';
import { PlayerManifest } from '../types/manifest';

interface ManifestChallengesProps {
  playerManifest: PlayerManifest | null;
}

const ManifestChallenges: React.FC<ManifestChallengesProps> = ({ playerManifest }) => {
  const handleVeilBreak = (veilId: string) => {
    // Handle veil breaking
    alert('Veil breaking feature coming soon!');
  };

  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '0.75rem', 
      padding: '1.5rem', 
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', 
      border: '1px solid #e5e7eb'
    }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ 
          fontSize: '1.25rem', 
          fontWeight: 'bold', 
          marginBottom: '0.5rem', 
          color: '#1f2937'
        }}>
          ⚡ Manifest Challenges
        </h2>
        <p style={{ 
          fontSize: '0.875rem', 
          color: '#6b7280', 
          marginBottom: '1rem'
        }}>
          Master your chosen manifestation path and unlock your true potential.
        </p>
      </div>

      {playerManifest ? (
        <ManifestProgress 
          playerManifest={playerManifest} 
          onVeilBreak={handleVeilBreak}
        />
      ) : (
        <div style={{ 
          padding: '2rem', 
          backgroundColor: '#f3f4f6', 
          borderRadius: '0.5rem',
          border: '2px solid #d1d5db',
          textAlign: 'center'
        }}>
          <h3 style={{ 
            fontSize: '1.25rem', 
            fontWeight: 'bold', 
            marginBottom: '0.75rem',
            color: '#374151'
          }}>
            🌟 Choose Your Manifest
          </h3>
          <p style={{ 
            fontSize: '1rem', 
            marginBottom: '1rem',
            color: '#6b7280',
            lineHeight: '1.5'
          }}>
            In the Nine Knowings Universe, ordinary skills become extraordinary through mastery, intent, and will. 
            Your manifest will guide your ascension path and unlock unique abilities.
          </p>
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#fef3c7', 
            borderRadius: '0.5rem',
            border: '1px solid #f59e0b',
            marginTop: '1rem'
          }}>
            <p style={{ 
              fontSize: '0.875rem', 
              color: '#92400e',
              fontStyle: 'italic'
            }}>
              Manifest selection will be available once you complete your initial setup.
            </p>
          </div>
        </div>
      )}

      {/* Additional Manifest Challenges Section */}
      {playerManifest && (
        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ 
            fontSize: '1.125rem', 
            fontWeight: 'bold', 
            marginBottom: '1rem',
            color: '#1f2937',
            borderBottom: '2px solid #e5e7eb',
            paddingBottom: '0.5rem'
          }}>
            🎯 Manifestation Training
          </h3>
          
          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#f0fdf4', 
            border: '1px solid #22c55e',
            borderRadius: '0.5rem',
            marginBottom: '1rem'
          }}>
            <h4 style={{ 
              fontSize: '1rem', 
              fontWeight: 'bold', 
              marginBottom: '0.5rem',
              color: '#22c55e'
            }}>
              Daily Practice
            </h4>
            <p style={{ 
              fontSize: '0.875rem', 
              color: '#6b7280', 
              marginBottom: '0.75rem'
            }}>
              Complete daily manifestation exercises to strengthen your connection to your chosen path.
            </p>
            <button
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#22c55e',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 'bold'
              }}
              onClick={() => alert('Daily practice feature coming soon!')}
            >
              Start Practice
            </button>
          </div>

          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#fef3c7', 
            border: '1px solid #f59e0b',
            borderRadius: '0.5rem',
            marginBottom: '1rem'
          }}>
            <h4 style={{ 
              fontSize: '1rem', 
              fontWeight: 'bold', 
              marginBottom: '0.5rem',
              color: '#92400e'
            }}>
              Advanced Techniques
            </h4>
            <p style={{ 
              fontSize: '0.875rem', 
              color: '#6b7280', 
              marginBottom: '0.75rem'
            }}>
              Unlock advanced manifestation techniques as you progress through your ascension path.
            </p>
            <div style={{ 
              fontSize: '0.75rem', 
              color: '#a16207',
              fontStyle: 'italic'
            }}>
              Available at Level 5
            </div>
          </div>

          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#f3f4f6', 
            border: '1px solid #d1d5db',
            borderRadius: '0.5rem'
          }}>
            <h4 style={{ 
              fontSize: '1rem', 
              fontWeight: 'bold', 
              marginBottom: '0.5rem',
              color: '#374151'
            }}>
              Mastery Challenges
            </h4>
            <p style={{ 
              fontSize: '0.875rem', 
              color: '#6b7280', 
              marginBottom: '0.75rem'
            }}>
              Test your mastery with specialized challenges that push your manifestation abilities to the limit.
            </p>
            <div style={{ 
              fontSize: '0.75rem', 
              color: '#6b7280',
              fontStyle: 'italic'
            }}>
              Unlock by completing all chapters
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManifestChallenges; 