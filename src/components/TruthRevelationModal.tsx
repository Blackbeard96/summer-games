import React, { useState, useEffect } from 'react';

interface TruthRevelationModalProps {
  isOpen: boolean;
  onClose: () => void;
  truthRevealed: string;
  onComplete: () => void;
}

const TruthRevelationModal: React.FC<TruthRevelationModalProps> = ({ 
  isOpen, 
  onClose, 
  truthRevealed, 
  onComplete 
}) => {
  const [view, setView] = useState<'revealing' | 'reflecting' | 'complete'>('revealing');

  useEffect(() => {
    if (isOpen) {
      setView('revealing');
      // Auto-advance through views
      setTimeout(() => setView('reflecting'), 3000);
      setTimeout(() => setView('complete'), 6000);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes slideInUp {
            from { transform: translateY(20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          @keyframes glow {
            0%, 100% { box-shadow: 0 0 5px #10b981; }
            50% { box-shadow: 0 0 20px #10b981, 0 0 30px #10b981; }
          }
          @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
          @keyframes typewriter {
            from { width: 0; }
            to { width: 100%; }
          }
          @keyframes blink {
            0%, 50% { border-color: transparent; }
            51%, 100% { border-color: #10b981; }
          }
        `}
      </style>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        animation: 'fadeIn 0.5s ease-out'
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '1rem',
          padding: '3rem',
          maxWidth: '700px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          animation: 'slideInUp 0.6s ease-out',
          background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
          border: '3px solid #10b981'
        }}>
          {view === 'revealing' && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <h2 style={{
                fontSize: '2.5rem',
                fontWeight: 'bold',
                color: '#065f46',
                marginBottom: '2rem',
                background: 'linear-gradient(45deg, #10b981, #059669)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                ✨ Your Truth Revealed ✨
              </h2>
              
              <div style={{
                width: '150px',
                height: '150px',
                backgroundColor: '#10b981',
                borderRadius: '50%',
                margin: '0 auto 2rem auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '4rem',
                color: 'white',
                animation: 'glow 2s infinite, pulse 2s infinite'
              }}>
                👁️
              </div>

              <p style={{
                fontSize: '1.2rem',
                color: '#374151',
                marginBottom: '2rem',
                lineHeight: '1.6',
                fontWeight: '500'
              }}>
                The Truth Metal's energy has revealed a profound insight about yourself...
              </p>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '1rem',
                color: '#059669'
              }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  border: '2px solid #10b981',
                  borderTop: '2px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                <span>Channeling the truth...</span>
              </div>
            </div>
          )}

          {view === 'reflecting' && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <h2 style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: '#065f46',
                marginBottom: '2rem'
              }}>
                The Truth About You
              </h2>
              
              <div style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                borderRadius: '1rem',
                padding: '2rem',
                marginBottom: '2rem',
                color: 'white',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <div style={{
                  position: 'absolute',
                  top: '-50%',
                  left: '-50%',
                  width: '200%',
                  height: '200%',
                  background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
                  animation: 'pulse 3s ease-in-out infinite'
                }}></div>
                
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{
                    fontSize: '3rem',
                    marginBottom: '1rem'
                  }}>
                    💎
                  </div>
                  <p style={{
                    fontSize: '1.3rem',
                    lineHeight: '1.8',
                    fontStyle: 'italic',
                    fontWeight: '500',
                    textShadow: '0 2px 4px rgba(0,0,0,0.3)'
                  }}>
                    "{truthRevealed}"
                  </p>
                </div>
              </div>

              <p style={{
                fontSize: '1.1rem',
                color: '#374151',
                marginBottom: '2rem',
                lineHeight: '1.6'
              }}>
                This truth has always been within you, waiting to be acknowledged and embraced.
              </p>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '1rem',
                color: '#059669'
              }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  border: '2px solid #10b981',
                  borderTop: '2px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                <span>Reflecting on this revelation...</span>
              </div>
            </div>
          )}

          {view === 'complete' && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <h2 style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: '#065f46',
                marginBottom: '2rem'
              }}>
                🎉 Truth Integration Complete
              </h2>
              
              <div style={{
                width: '120px',
                height: '120px',
                backgroundColor: '#10b981',
                borderRadius: '50%',
                margin: '0 auto 2rem auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '3rem',
                color: 'white',
                animation: 'pulse 2s infinite'
              }}>
                ✨
              </div>

              <div style={{
                background: '#f0fdf4',
                border: '2px solid #10b981',
                borderRadius: '1rem',
                padding: '1.5rem',
                marginBottom: '2rem'
              }}>
                <p style={{
                  fontSize: '1.1rem',
                  color: '#065f46',
                  marginBottom: '1rem',
                  fontWeight: '600'
                }}>
                  You have successfully confronted Truth and emerged stronger.
                </p>
                <p style={{
                  fontSize: '1rem',
                  color: '#374151',
                  lineHeight: '1.6'
                }}>
                  This revelation will guide your future growth and help you navigate challenges 
                  with greater wisdom and self-awareness.
                </p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                marginBottom: '2rem'
              }}>
                <div style={{
                  background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  border: '2px solid #f59e0b'
                }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⭐</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#92400e', marginBottom: '0.25rem' }}>+25 XP</div>
                  <div style={{ fontSize: '0.9rem', color: '#92400e' }}>Truth Discovery</div>
                </div>
                
                <div style={{
                  background: 'linear-gradient(135deg, #dbeafe 0%, #c7d2fe 100%)',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  border: '2px solid #3b82f6'
                }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>💎</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#1e40af', marginBottom: '0.25rem' }}>+15 PP</div>
                  <div style={{ fontSize: '0.9rem', color: '#1e40af' }}>Power Points</div>
                </div>
                
                <div style={{
                  background: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  border: '2px solid #8b5cf6'
                }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🔮</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#7c3aed', marginBottom: '0.25rem' }}>Truth Metal</div>
                  <div style={{ fontSize: '0.9rem', color: '#7c3aed' }}>Currency Unlocked</div>
                </div>
              </div>

              <button
                onClick={() => {
                  onComplete();
                  onClose();
                }}
                style={{
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '1rem 2.5rem',
                  fontSize: '1.1rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
                  boxShadow: '0 4px 8px rgba(16, 185, 129, 0.2)'
                }}
                onMouseOver={(e) => { 
                  e.currentTarget.style.backgroundColor = '#059669'; 
                  e.currentTarget.style.transform = 'translateY(-3px)'; 
                  e.currentTarget.style.boxShadow = '0 6px 12px rgba(16, 185, 129, 0.3)'; 
                }}
                onMouseOut={(e) => { 
                  e.currentTarget.style.backgroundColor = '#10b981'; 
                  e.currentTarget.style.transform = 'translateY(0)'; 
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(16, 185, 129, 0.2)'; 
                }}
              >
                🌟 Embrace Your Truth
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default TruthRevelationModal;
