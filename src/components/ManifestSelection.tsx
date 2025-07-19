import React, { useState } from 'react';
import { MANIFESTS } from '../types/manifest';

interface ManifestSelectionProps {
  onManifestSelect: (manifestId: string) => void;
  onClose: () => void;
}

const ManifestSelection: React.FC<ManifestSelectionProps> = ({ onManifestSelect, onClose }) => {
  const [selectedManifest, setSelectedManifest] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<string | null>(null);

  const handleManifestSelect = (manifestId: string) => {
    setSelectedManifest(manifestId);
  };

  const handleConfirm = () => {
    if (selectedManifest) {
      onManifestSelect(selectedManifest);
    }
  };

  const getManifestById = (id: string) => {
    return MANIFESTS.find(m => m.id === id);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '2rem'
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.1)',
        backdropFilter: 'blur(10px)',
        padding: '2rem',
        borderRadius: '1rem',
        maxWidth: '1200px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        color: 'white',
        border: '1px solid rgba(255,255,255,0.2)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ 
            fontSize: '2.5rem', 
            fontWeight: 'bold', 
            marginBottom: '1rem',
            background: 'linear-gradient(135deg, #fbbf24 0%, #a78bfa 50%, #34d399 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            Choose Your Manifest
          </h1>
          <p style={{ 
            fontSize: '1.2rem', 
            marginBottom: '1rem',
            opacity: 0.9
          }}>
            In the Nine Knowings Universe, ordinary skills become extraordinary through mastery, intent, and will.
          </p>
          <p style={{ 
            fontSize: '1rem', 
            opacity: 0.8,
            fontStyle: 'italic'
          }}>
            Select the manifest that resonates with your inner truth. This choice will guide your ascension path.
          </p>
        </div>

        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem'
        }}>
          {MANIFESTS.map((manifest) => (
            <div
              key={manifest.id}
              onClick={() => handleManifestSelect(manifest.id)}
              style={{
                padding: '1.5rem',
                background: selectedManifest === manifest.id 
                  ? `linear-gradient(135deg, ${manifest.color}20 0%, ${manifest.color}10 100%)`
                  : 'rgba(255,255,255,0.05)',
                border: selectedManifest === manifest.id 
                  ? `2px solid ${manifest.color}` 
                  : '2px solid rgba(255,255,255,0.2)',
                borderRadius: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                textAlign: 'center',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                if (selectedManifest !== manifest.id) {
                  e.currentTarget.style.transform = 'translateY(-5px)';
                  e.currentTarget.style.boxShadow = `0 10px 25px ${manifest.color}40`;
                }
              }}
              onMouseLeave={(e) => {
                if (selectedManifest !== manifest.id) {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }
              }}
            >
              <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>
                {manifest.icon}
              </div>
              <h3 style={{ 
                fontSize: '1.5rem', 
                fontWeight: 'bold', 
                marginBottom: '0.5rem',
                color: selectedManifest === manifest.id ? manifest.color : 'white'
              }}>
                {manifest.name}
              </h3>
              <p style={{ 
                fontSize: '0.9rem', 
                marginBottom: '1rem',
                opacity: 0.8,
                lineHeight: '1.4'
              }}>
                {manifest.description}
              </p>
              
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                fontSize: '0.8rem',
                opacity: 0.7
              }}>
                <span>Catalyst: {manifest.catalyst}</span>
                <span>Move: {manifest.signatureMove}</span>
              </div>

              {selectedManifest === manifest.id && (
                <div style={{
                  position: 'absolute',
                  top: '0.5rem',
                  right: '0.5rem',
                  background: manifest.color,
                  color: 'white',
                  borderRadius: '50%',
                  width: '2rem',
                  height: '2rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem'
                }}>
                  ✓
                </div>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDetails(showDetails === manifest.id ? null : manifest.id);
                }}
                style={{
                  marginTop: '1rem',
                  padding: '0.5rem 1rem',
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: '0.25rem',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                {showDetails === manifest.id ? 'Hide Details' : 'View Ascension Path'}
              </button>

              {showDetails === manifest.id && (
                <div style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '0.5rem',
                  textAlign: 'left'
                }}>
                  <h4 style={{ marginBottom: '0.5rem', color: manifest.color }}>Ascension Levels:</h4>
                  {manifest.levels.map((level) => (
                    <div key={level.level} style={{ marginBottom: '0.5rem' }}>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        fontWeight: 'bold',
                        fontSize: '0.8rem'
                      }}>
                        <span>Level {level.level}: {level.scale}</span>
                        <span>{level.xpRequired} XP</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', opacity: 0.8 }}>
                        {level.example}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          gap: '1rem',
          marginTop: '2rem'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '0.5rem',
              color: 'white',
              cursor: 'pointer',
              fontSize: '1rem'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedManifest}
            style={{
              padding: '0.75rem 1.5rem',
              background: selectedManifest ? '#10B981' : '#6B7280',
              border: 'none',
              borderRadius: '0.5rem',
              color: 'white',
              cursor: selectedManifest ? 'pointer' : 'not-allowed',
              fontSize: '1rem',
              opacity: selectedManifest ? 1 : 0.5
            }}
          >
            Confirm Manifest
          </button>
        </div>

        {selectedManifest && (
          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            background: 'rgba(16, 185, 129, 0.2)',
            border: '1px solid rgba(16, 185, 129, 0.5)',
            borderRadius: '0.5rem',
            textAlign: 'center'
          }}>
            <p style={{ color: '#10B981', fontWeight: 'bold' }}>
              Selected: {getManifestById(selectedManifest)?.name}
            </p>
            <p style={{ fontSize: '0.9rem', opacity: 0.8 }}>
              Catalyst: {getManifestById(selectedManifest)?.catalyst}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManifestSelection; 