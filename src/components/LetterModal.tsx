import React, { useState } from 'react';

interface LetterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNameSubmit: (name: string) => void;
}

const LetterModal: React.FC<LetterModalProps> = ({ isOpen, onClose, onNameSubmit }) => {
  const [view, setView] = useState<'room' | 'letter' | 'name'>('room');
  const [playerName, setPlayerName] = useState('');

  if (!isOpen) return null;

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (playerName.trim()) {
      onNameSubmit(playerName.trim());
      onClose();
    }
  };

  return (
    <>
      <style>
        {`
          @keyframes pulse {
            0% { transform: translateX(-50%) scale(1); }
            50% { transform: translateX(-50%) scale(1.05); }
            100% { transform: translateX(-50%) scale(1); }
          }
        `}
      </style>
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '1rem',
        padding: '2rem',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto',
        position: 'relative'
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
            color: '#6b7280'
          }}
        >
          ×
        </button>

        {view === 'room' && (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ 
              fontSize: '1.5rem', 
              fontWeight: 'bold', 
              color: '#1f2937',
              marginBottom: '1rem'
            }}>
              Your Ordinary World
            </h2>
            
            {/* Room Image */}
            <div style={{
              width: '100%',
              height: '300px',
              borderRadius: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <img 
                src="/images/Letter in Room.png"
                alt="Cozy bedroom at night with a glowing letter on the bed, bedside lamp, and window view"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: '0.5rem',
                  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)'
                }}
              />
            </div>

            <p style={{ 
              fontSize: '1rem', 
              color: '#6b7280',
              marginBottom: '1.5rem',
              lineHeight: '1.6'
            }}>
              You're in your room, going about your ordinary day, when you notice something unusual on your bed...
            </p>

            <button
              onClick={() => setView('letter')}
              style={{
                backgroundColor: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.75rem 2rem',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease'
              }}
            >
              🔍 Examine the Letter
            </button>
          </div>
        )}

        {view === 'letter' && (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ 
              fontSize: '1.5rem', 
              fontWeight: 'bold', 
              color: '#1f2937',
              marginBottom: '1rem'
            }}>
              The Xiotein Letter
            </h2>
            
            {/* Letter Image */}
            <div style={{
              width: '100%',
              height: '400px',
              borderRadius: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <img 
                src="/images/Call Letter.png"
                alt="Xiotein School invitation letter with mystical call to adventure"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  borderRadius: '0.5rem',
                  boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)'
                }}
              />
            </div>

            <p style={{ 
              fontSize: '1rem', 
              color: '#6b7280',
              marginBottom: '1.5rem',
              lineHeight: '1.6'
            }}>
              The letter speaks of unlocking your true potential and becoming a Manifester. Your heart races with possibility...
            </p>

            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={() => setView('room')}
                style={{
                  backgroundColor: '#6b7280',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                ← Back
              </button>
              <button
                onClick={() => setView('name')}
                style={{
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 2rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Accept the Call →
              </button>
            </div>
          </div>
        )}

        {view === 'name' && (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ 
              fontSize: '1.5rem', 
              fontWeight: 'bold', 
              color: '#1f2937',
              marginBottom: '1rem'
            }}>
              Choose Your Name
            </h2>
            
            <div style={{
              width: '100%',
              height: '200px',
              backgroundColor: '#f0f9ff',
              borderRadius: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1.5rem',
              border: '2px solid #0ea5e9'
            }}>
              <div style={{ 
                fontSize: '3rem',
                color: '#0ea5e9'
              }}>
                ✨
              </div>
            </div>

            <p style={{ 
              fontSize: '1rem', 
              color: '#6b7280',
              marginBottom: '1.5rem',
              lineHeight: '1.6'
            }}>
              As you accept the call to adventure, the letter asks for your name - the name that will be known throughout Xiotein School.
            </p>

            <form onSubmit={handleNameSubmit} style={{ marginBottom: '1.5rem' }}>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name..."
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  border: '2px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  marginBottom: '1rem',
                  textAlign: 'center'
                }}
                maxLength={20}
                required
              />
              <button
                type="submit"
                disabled={!playerName.trim()}
                style={{
                  backgroundColor: playerName.trim() ? '#8b5cf6' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 2rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: playerName.trim() ? 'pointer' : 'not-allowed',
                  width: '100%'
                }}
              >
                Begin Your Journey
              </button>
            </form>

            <button
              onClick={() => setView('letter')}
              style={{
                backgroundColor: 'transparent',
                color: '#6b7280',
                border: '1px solid #d1d5db',
                borderRadius: '0.5rem',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                cursor: 'pointer'
              }}
            >
              ← Back to Letter
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
};

export default LetterModal;
