import React, { useEffect } from 'react';

export interface VaultUpgradeData {
  type: 'capacity' | 'shields' | 'generator';
  oldLevel: number;
  newLevel: number;
  oldValue: number;
  newValue: number;
  oldValueSecondary?: number; // For generator: old shields/day
  newValueSecondary?: number; // For generator: new shields/day
  cost: number;
  unit?: string; // 'PP' or 'Shields' - defaults to 'PP' for capacity, 'Shields' for shields
  unitSecondary?: string; // For generator: 'Shields/day'
}

interface VaultUpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  upgradeData: VaultUpgradeData | null;
}

const VaultUpgradeModal: React.FC<VaultUpgradeModalProps> = ({
  isOpen,
  onClose,
  upgradeData
}) => {
  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !upgradeData) return null;

  const delta = upgradeData.newValue - upgradeData.oldValue;
  const deltaSecondary = upgradeData.newValueSecondary && upgradeData.oldValueSecondary
    ? upgradeData.newValueSecondary - upgradeData.oldValueSecondary
    : null;

  const getTypeConfig = () => {
    switch (upgradeData.type) {
      case 'capacity':
        return {
          icon: '💰',
          title: 'Vault Capacity Upgraded!',
          color: '#059669',
          gradient: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
          bgGradient: 'linear-gradient(135deg, rgba(5, 150, 105, 0.1) 0%, rgba(4, 120, 87, 0.1) 100%)',
          label: 'Capacity',
          unit: upgradeData.unit || 'PP'
        };
      case 'shields':
        return {
          icon: '🛡️',
          title: 'Shield Enhancement Upgraded!',
          color: '#2563eb',
          gradient: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
          bgGradient: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, rgba(29, 78, 216, 0.1) 100%)',
          label: 'Max Shields',
          unit: upgradeData.unit || 'Shields'
        };
      case 'generator':
        return {
          icon: '⚡',
          title: 'Generator Upgraded!',
          color: '#f59e0b',
          gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          bgGradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(217, 119, 6, 0.1) 100%)',
          label: 'Generator',
          unit: upgradeData.unit || 'PP/day'
        };
    }
  };

  const config = getTypeConfig();

  return (
    <>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100000,
          padding: '1rem',
          animation: 'fadeIn 0.3s ease-out'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div
          style={{
            background: config.gradient,
            borderRadius: '1.5rem',
            padding: '2.5rem',
            maxWidth: '500px',
            width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            animation: 'slideUp 0.4s ease-out',
            position: 'relative'
          }}
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'rgba(255, 255, 255, 0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '2rem',
              height: '2rem',
              color: 'white',
              fontSize: '1.25rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            ×
          </button>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              fontSize: '4rem',
              marginBottom: '1rem',
              animation: 'pulse 2s ease-in-out infinite'
            }}>
              {config.icon}
            </div>
            <h2 style={{
              fontSize: '1.75rem',
              fontWeight: 'bold',
              color: 'white',
              marginBottom: '0.5rem',
              textShadow: '0 2px 10px rgba(0,0,0,0.3)'
            }}>
              {config.title}
            </h2>
            <p style={{
              fontSize: '1rem',
              color: 'rgba(255, 255, 255, 0.9)',
              margin: 0
            }}>
              Level {upgradeData.oldLevel} → Level {upgradeData.newLevel}
            </p>
          </div>

          {/* Upgrade Details */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.15)',
            backdropFilter: 'blur(10px)',
            borderRadius: '1rem',
            padding: '1.5rem',
            marginBottom: '1.5rem'
          }}>
            {/* Before/After Comparison */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              gap: '1rem',
              alignItems: 'center',
              marginBottom: upgradeData.type === 'generator' ? '1rem' : 0
            }}>
              {/* Before */}
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '0.875rem',
                  color: 'rgba(255, 255, 255, 0.8)',
                  marginBottom: '0.5rem'
                }}>
                  Before
                </div>
                <div style={{
                  fontSize: '1.75rem',
                  fontWeight: 'bold',
                  color: 'white',
                  marginBottom: '0.25rem'
                }}>
                  {upgradeData.oldValue.toLocaleString()} {config.unit}
                </div>
                {upgradeData.type === 'generator' && upgradeData.oldValueSecondary && (
                  <div style={{
                    fontSize: '1rem',
                    color: 'rgba(255, 255, 255, 0.9)',
                    marginTop: '0.25rem'
                  }}>
                    {upgradeData.oldValueSecondary.toLocaleString()} {upgradeData.unitSecondary || 'Shields/day'}
                  </div>
                )}
              </div>

              {/* Arrow */}
              <div style={{
                fontSize: '2rem',
                color: 'white'
              }}>
                →
              </div>

              {/* After */}
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '0.875rem',
                  color: 'rgba(255, 255, 255, 0.8)',
                  marginBottom: '0.5rem'
                }}>
                  After
                </div>
                <div style={{
                  fontSize: '1.75rem',
                  fontWeight: 'bold',
                  color: 'white',
                  marginBottom: '0.25rem'
                }}>
                  {upgradeData.newValue.toLocaleString()} {config.unit}
                </div>
                {upgradeData.type === 'generator' && upgradeData.newValueSecondary && (
                  <div style={{
                    fontSize: '1rem',
                    color: 'rgba(255, 255, 255, 0.9)',
                    marginTop: '0.25rem'
                  }}>
                    {upgradeData.newValueSecondary.toLocaleString()} {upgradeData.unitSecondary || 'Shields/day'}
                  </div>
                )}
              </div>
            </div>

            {/* Delta Display */}
            <div style={{
              textAlign: 'center',
              marginTop: '1rem',
              paddingTop: '1rem',
              borderTop: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <div style={{
                fontSize: '0.875rem',
                color: 'rgba(255, 255, 255, 0.8)',
                marginBottom: '0.5rem'
              }}>
                Improvement
              </div>
              <div style={{
                fontSize: '1.5rem',
                fontWeight: 'bold',
                color: 'white'
              }}>
                +{delta.toLocaleString()} {config.unit}
              </div>
              {deltaSecondary !== null && (
                <div style={{
                  fontSize: '1rem',
                  color: 'rgba(255, 255, 255, 0.9)',
                  marginTop: '0.25rem'
                }}>
                  +{deltaSecondary.toLocaleString()} {upgradeData.unitSecondary || 'Shields/day'}
                </div>
              )}
            </div>
          </div>

          {/* Cost Display */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '0.75rem',
            padding: '1rem',
            textAlign: 'center',
            marginBottom: '1.5rem'
          }}>
            <div style={{
              fontSize: '0.875rem',
              color: 'rgba(255, 255, 255, 0.8)',
              marginBottom: '0.25rem'
            }}>
              Cost
            </div>
            <div style={{
              fontSize: '1.25rem',
              fontWeight: 'bold',
              color: 'white'
            }}>
              {upgradeData.cost.toLocaleString()} PP
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            style={{
              width: '100%',
              background: 'rgba(255, 255, 255, 0.9)',
              color: config.color,
              border: 'none',
              padding: '1rem',
              borderRadius: '0.75rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'white';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 12px -1px rgba(0, 0, 0, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.2)';
            }}
          >
            Awesome!
          </button>
        </div>
      </div>
    </>
  );
};

export default VaultUpgradeModal;


