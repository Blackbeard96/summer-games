import React, { useState, useEffect } from 'react';

interface TruthMetalTouchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTouchTruthMetal: () => void;
}

const TruthMetalTouchModal: React.FC<TruthMetalTouchModalProps> = ({ isOpen, onClose, onTouchTruthMetal }) => {
  const [view, setView] = useState<'choice' | 'warning' | 'touching'>('choice');

  useEffect(() => {
    if (isOpen) {
      setView('choice'); // Reset view when modal opens
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTouch = () => {
    setView('warning');
  };

  const handleConfirmTouch = () => {
    setView('touching');
    // Add a brief delay for dramatic effect
    setTimeout(() => {
      onTouchTruthMetal();
    }, 2000);
  };

  const handleDecline = () => {
    onClose();
  };

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
          @keyframes pulseGlow {
            0% { box-shadow: 0 0 5px #dc2626, 0 0 10px #dc2626; }
            50% { box-shadow: 0 0 15px #ef4444, 0 0 25px #ef4444; }
            100% { box-shadow: 0 0 5px #dc2626, 0 0 10px #dc2626; }
          }
          @keyframes pulseGlowBlue {
            0% { box-shadow: 0 0 5px #2563eb, 0 0 10px #2563eb; }
            50% { box-shadow: 0 0 15px #3b82f6, 0 0 25px #3b82f6; }
            100% { box-shadow: 0 0 5px #2563eb, 0 0 10px #2563eb; }
          }
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        animation: 'fadeIn 0.3s ease-out'
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          animation: 'slideInUp 0.4s ease-out'
        }}>
          {/* Close Button */}
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              color: '#6b7280',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#f3f4f6';
              e.currentTarget.style.color = '#374151';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#6b7280';
            }}
          >
            ×
          </button>

          {view === 'choice' && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <h2 style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: '#1f2937',
                marginBottom: '1.5rem',
                background: 'linear-gradient(45deg, #dc2626, #ef4444)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                The Truth Metal Awaits
              </h2>
              
              <div style={{
                width: '120px',
                height: '120px',
                backgroundColor: '#dc2626',
                borderRadius: '50%',
                margin: '0 auto 2rem auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '3rem',
                color: 'white',
                boxShadow: '0 0 10px #dc2626',
                animation: 'pulseGlow 2s infinite',
                position: 'relative',
                overflow: 'hidden'
              }}>
                ⚡
              </div>

              <p style={{
                fontSize: '1.1rem',
                color: '#6b7280',
                marginBottom: '2rem',
                lineHeight: '1.6',
                maxWidth: '500px',
                margin: '0 auto 2rem auto'
              }}>
                Before you lies the Truth Metal - a pulsating, otherworldly substance that hums with ancient energy. 
                It promises to reveal the deepest truths about yourself, but at what cost?
              </p>

              <p style={{
                fontSize: '1rem',
                color: '#374151',
                marginBottom: '2rem',
                fontStyle: 'italic',
                fontWeight: '500'
              }}>
                "The Truth Metal will not give you what you want. It will give you what you need."
              </p>

              <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
                <button
                  onClick={handleTouch}
                  style={{
                    backgroundColor: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    padding: '1rem 2rem',
                    fontSize: '1.1rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
                    boxShadow: '0 4px 8px rgba(220, 38, 38, 0.2)'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#b91c1c'; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 6px 12px rgba(220, 38, 38, 0.3)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#dc2626'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 8px rgba(220, 38, 38, 0.2)'; }}
                >
                  ✨ Touch the Truth Metal
                </button>
                <button
                  onClick={handleDecline}
                  style={{
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    padding: '1rem 2rem',
                    fontSize: '1.1rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#4b5563'; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.2)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#6b7280'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)'; }}
                >
                  🚪 Decline and Return
                </button>
              </div>
            </div>
          )}

          {view === 'warning' && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <h2 style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: '#dc2626',
                marginBottom: '1.5rem',
                animation: 'shake 0.5s ease-in-out'
              }}>
                ⚠️ Final Warning
              </h2>
              
              <div style={{
                width: '100px',
                height: '100px',
                backgroundColor: '#fbbf24',
                borderRadius: '50%',
                margin: '0 auto 2rem auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.5rem',
                color: 'white',
                animation: 'pulseGlowBlue 1s infinite'
              }}>
                ⚡
              </div>

              <p style={{
                fontSize: '1.2rem',
                color: '#1f2937',
                marginBottom: '1.5rem',
                lineHeight: '1.6',
                fontWeight: '500'
              }}>
                The Truth Metal will force you to confront your deepest fears, your hidden desires, and the parts of yourself you've been avoiding.
              </p>

              <div style={{
                backgroundColor: '#fef2f2',
                border: '2px solid #fecaca',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                marginBottom: '2rem',
                textAlign: 'left'
              }}>
                <p style={{
                  fontSize: '1rem',
                  color: '#991b1b',
                  margin: 0,
                  fontWeight: '600',
                  marginBottom: '1rem'
                }}>
                  You will face "Truth" - a manifestation of your inner self that will challenge everything you believe about yourself.
                </p>
                <p style={{
                  fontSize: '0.9rem',
                  color: '#991b1b',
                  margin: 0,
                  lineHeight: '1.5'
                }}>
                  This battle will test your manifest abilities, your resolve, and your willingness to accept who you truly are. 
                  There is no turning back once you begin.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
                <button
                  onClick={handleConfirmTouch}
                  style={{
                    backgroundColor: '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    padding: '1rem 2rem',
                    fontSize: '1.1rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
                    boxShadow: '0 4px 8px rgba(220, 38, 38, 0.2)'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#b91c1c'; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 6px 12px rgba(220, 38, 38, 0.3)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#dc2626'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 8px rgba(220, 38, 38, 0.2)'; }}
                >
                  ⚔️ Face the Truth
                </button>
                <button
                  onClick={handleDecline}
                  style={{
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    padding: '1rem 2rem',
                    fontSize: '1.1rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.1)'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#4b5563'; e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 6px 12px rgba(0,0,0,0.2)'; }}
                  onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#6b7280'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)'; }}
                >
                  🚪 Turn Back
                </button>
              </div>
            </div>
          )}

          {view === 'touching' && (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <h2 style={{
                fontSize: '2rem',
                fontWeight: 'bold',
                color: '#1f2937',
                marginBottom: '1.5rem'
              }}>
                Embracing the Truth...
              </h2>
              
              <div style={{
                width: '120px',
                height: '120px',
                backgroundColor: '#dc2626',
                borderRadius: '50%',
                margin: '0 auto 2rem auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '3rem',
                color: 'white',
                boxShadow: '0 0 20px #dc2626',
                animation: 'spin 2s linear infinite, pulseGlow 1s infinite'
              }}>
                ⚡
              </div>

              <p style={{
                fontSize: '1.1rem',
                color: '#6b7280',
                marginBottom: '2rem',
                lineHeight: '1.6'
              }}>
                The Truth Metal's energy courses through you. You feel reality itself beginning to shift...
              </p>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                fontSize: '1rem',
                color: '#374151'
              }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  border: '2px solid #3b82f6',
                  borderTop: '2px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                <span>Preparing your internal battle...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default TruthMetalTouchModal;
