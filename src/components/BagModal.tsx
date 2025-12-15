import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';

interface BagModalProps {
  isOpen: boolean;
  onClose: () => void;
  onArtifactUsed?: () => void; // Callback when an artifact is used (e.g., Health Potion ends turn)
}

// Items that can be used during battle
const BATTLE_USABLE_ITEMS = ['Health Potion (25)', 'Double PP Boost'];

// Mapping of artifact names to their images
const artifactImages: Record<string, string> = {
  'Health Potion (25)': '/images/Health Potion - 25.png',
  'Double PP Boost': '/images/Double PP.png',
};

const BagModal: React.FC<BagModalProps> = ({ isOpen, onClose, onArtifactUsed }) => {
  const { currentUser } = useAuth();
  const { inventory, artifacts, activateArtifact, loading } = useBattle();

  if (!isOpen) return null;

  // Filter inventory to only show battle-usable items and count them
  const artifactCounts: Record<string, number> = {};
  inventory.forEach((item) => {
    if (BATTLE_USABLE_ITEMS.includes(item)) {
      artifactCounts[item] = (artifactCounts[item] || 0) + 1;
    }
  });

  const handleUseArtifact = async (artifactName: string) => {
    if (window.confirm(`Use ${artifactName}? This will count as your move and end your turn.`)) {
      // Pass the callback to activateArtifact - ALL items end the turn
      await activateArtifact(artifactName, onArtifactUsed);
      // Close modal after using any item (all items end the turn)
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#1a1a2e',
          border: '3px solid #4f46e5',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '600px',
          maxHeight: '80vh',
          overflow: 'auto',
          width: '90%',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: '1.5rem' }}>🎒 Your Bag</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.5rem',
            }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ color: '#fff', textAlign: 'center', padding: '2rem' }}>Loading...</div>
        ) : Object.keys(artifactCounts).length === 0 ? (
          <div style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🎒</div>
            <div style={{ marginBottom: '0.5rem' }}>No battle-usable items in your bag.</div>
            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
              Only Health Potions and Double PP Boost can be used during battle.
              <br />
              Other items are available from your Profile.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {Object.entries(artifactCounts).map(([artifactName, count]) => {
              const imageUrl = artifactImages[artifactName];
              return (
                <div
                  key={artifactName}
                  style={{
                    backgroundColor: '#16213e',
                    border: '2px solid #4f46e5',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                    {/* Item Image */}
                    {imageUrl ? (
                      <div style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '0.5rem',
                        overflow: 'hidden',
                        border: '2px solid #4f46e5',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#0f172a',
                      }}>
                        <img
                          src={imageUrl}
                          alt={artifactName}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                          onError={(e) => {
                            // Fallback to a placeholder if image fails to load
                            e.currentTarget.style.display = 'none';
                            const parent = e.currentTarget.parentElement;
                            if (parent) {
                              parent.innerHTML = '<span style="font-size: 2rem;">📦</span>';
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '0.5rem',
                        border: '2px solid #4f46e5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#0f172a',
                        fontSize: '2rem',
                        flexShrink: 0,
                      }}>
                        📦
                      </div>
                    )}
                    {/* Item Info */}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                        {artifactName}
                      </div>
                      <div style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
                        Quantity: {count}
                      </div>
                    </div>
                  </div>
                  {/* Use Button */}
                  <button
                    onClick={() => handleUseArtifact(artifactName)}
                    disabled={loading}
                    style={{
                      backgroundColor: '#4f46e5',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      padding: '0.5rem 1rem',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontWeight: 'bold',
                      opacity: loading ? 0.5 : 1,
                      transition: 'all 0.2s',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      if (!loading) {
                        e.currentTarget.style.backgroundColor = '#6366f1';
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!loading) {
                        e.currentTarget.style.backgroundColor = '#4f46e5';
                        e.currentTarget.style.transform = 'scale(1)';
                      }
                    }}
                  >
                    Use
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default BagModal;

