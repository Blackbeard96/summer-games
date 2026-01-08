import React from 'react';

interface GeneratorEarningsModalProps {
  isOpen: boolean;
  onClose: () => void;
  daysAway: number;
  ppEarned: number;
  shieldsEarned: number;
  generatorLevel: number;
  ppPerDay: number;
  shieldsPerDay: number;
  previousPP: number;
  previousShields: number;
  newPP: number;
  newShields: number;
}

const GeneratorEarningsModal: React.FC<GeneratorEarningsModalProps> = ({
  isOpen,
  onClose,
  daysAway,
  ppEarned,
  shieldsEarned,
  generatorLevel,
  ppPerDay,
  shieldsPerDay,
  previousPP,
  previousShields,
  newPP,
  newShields
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '500px',
          width: '100%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          border: '2px solid #10b981'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>⚡</div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.5rem' }}>
            Generator Earnings
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Your Generator earned you while away!
          </p>
        </div>

        <div
          style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            border: '1px solid #d1d5db'
          }}
        >
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              Time Away
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>
              {daysAway} {daysAway === 1 ? 'Day' : 'Days'}
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
              Generator Level
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f59e0b' }}>
              Level {generatorLevel}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
              ⚡ {ppPerDay} PP/day • 🛡️ {shieldsPerDay} Shields/day
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', marginTop: '1rem' }}>
            {/* Power Points Section */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: '600' }}>
                Power Points
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Before:</span>
                <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#6b7280' }}>
                  {previousPP} PP
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.875rem', color: '#10b981', fontWeight: '600' }}>Earned:</span>
                <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#10b981' }}>
                  +{ppEarned} PP
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid #e5e7eb' }}>
                <span style={{ fontSize: '0.875rem', color: '#1f2937', fontWeight: 'bold' }}>New Total:</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#10b981' }}>
                  {newPP} PP
                </span>
              </div>
            </div>

            {/* Shields Section */}
            <div>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem', fontWeight: '600' }}>
                Shields
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Before:</span>
                <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#6b7280' }}>
                  {previousShields} Shields
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.875rem', color: '#10b981', fontWeight: '600' }}>Earned:</span>
                <span style={{ fontSize: '1rem', fontWeight: 'bold', color: '#10b981' }}>
                  +{shieldsEarned} Shields
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid #e5e7eb' }}>
                <span style={{ fontSize: '0.875rem', color: '#1f2937', fontWeight: 'bold' }}>New Total:</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#10b981' }}>
                  {newShields} Shields
                </span>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: 'white',
            border: 'none',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          Collect
        </button>
      </div>
    </div>
  );
};

export default GeneratorEarningsModal;







