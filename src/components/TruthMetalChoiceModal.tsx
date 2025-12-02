import React, { useState, useEffect } from 'react';

interface TruthMetalChoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChoiceSubmit: (choice: 'touch' | 'ignore', ordinaryWorld: string) => void;
  existingOrdinaryWorld?: string;
}

const TruthMetalChoiceModal: React.FC<TruthMetalChoiceModalProps> = ({ 
  isOpen, 
  onClose, 
  onChoiceSubmit,
  existingOrdinaryWorld
}) => {
  const [view, setView] = useState<'flashback' | 'choice' | 'ordinary-world'>('flashback');
  const [playerChoice, setPlayerChoice] = useState<'touch' | 'ignore' | null>(null);
  const [ordinaryWorld, setOrdinaryWorld] = useState(existingOrdinaryWorld || '');

  // Update ordinaryWorld when existingOrdinaryWorld changes
  useEffect(() => {
    if (existingOrdinaryWorld && !ordinaryWorld) {
      setOrdinaryWorld(existingOrdinaryWorld);
    }
  }, [existingOrdinaryWorld]);

  if (!isOpen) return null;

  const handleChoiceSubmit = () => {
    if (playerChoice && ordinaryWorld.trim()) {
      onChoiceSubmit(playerChoice, ordinaryWorld.trim());
      onClose();
    }
  };

  const handleSkip = () => {
    if (existingOrdinaryWorld && existingOrdinaryWorld.trim()) {
      setOrdinaryWorld(existingOrdinaryWorld);
      setView('choice');
    }
  };

  return (
    <>
      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          
          @keyframes pulse {
            0% { transform: scale(1); }
            50% { transform: scale(1.05); }
            100% { transform: scale(1); }
          }
          
          @keyframes glow {
            0% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.5); }
            50% { box-shadow: 0 0 40px rgba(139, 92, 246, 0.8); }
            100% { box-shadow: 0 0 20px rgba(139, 92, 246, 0.5); }
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
        zIndex: 1000
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '700px',
          width: '90%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative',
          animation: 'fadeIn 0.5s ease-out'
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

          {/* Flashback Memory View */}
          {view === 'flashback' && (
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ 
                fontSize: '1.75rem', 
                fontWeight: 'bold', 
                color: '#1f2937',
                marginBottom: '1rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                🌟 Flashback Memory 🌟
              </h2>
              
              {/* Memory Visualization */}
              <div style={{
                width: '100%',
                height: '300px',
                background: 'linear-gradient(135deg, #f0f9ff 0%, #e0e7ff 100%)',
                borderRadius: '1rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '2rem',
                border: '3px solid #8b5cf6',
                position: 'relative',
                overflow: 'hidden'
              }}>
                {/* Floating memory fragments */}
                <div style={{
                  position: 'absolute',
                  top: '20%',
                  left: '10%',
                  width: '60px',
                  height: '60px',
                  background: 'rgba(139, 92, 246, 0.3)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  animation: 'pulse 2s infinite'
                }}>
                  🏠
                </div>
                <div style={{
                  position: 'absolute',
                  top: '30%',
                  right: '15%',
                  width: '50px',
                  height: '50px',
                  background: 'rgba(139, 92, 246, 0.3)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem',
                  animation: 'pulse 2s infinite 0.5s'
                }}>
                  👥
                </div>
                <div style={{
                  position: 'absolute',
                  bottom: '25%',
                  left: '20%',
                  width: '45px',
                  height: '45px',
                  background: 'rgba(139, 92, 246, 0.3)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.1rem',
                  animation: 'pulse 2s infinite 1s'
                }}>
                  💭
                </div>
                <div style={{
                  position: 'absolute',
                  bottom: '20%',
                  right: '25%',
                  width: '55px',
                  height: '55px',
                  background: 'rgba(139, 92, 246, 0.3)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.3rem',
                  animation: 'pulse 2s infinite 1.5s'
                }}>
                  🌅
                </div>
                
                {/* Central memory core */}
                <div style={{
                  width: '100px',
                  height: '100px',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2.5rem',
                  animation: 'glow 3s infinite',
                  border: '4px solid white',
                  boxShadow: '0 0 30px rgba(139, 92, 246, 0.6)'
                }}>
                  💎
                </div>
              </div>

              <p style={{ 
                fontSize: '1.1rem', 
                color: '#4b5563',
                marginBottom: '2rem',
                lineHeight: '1.7',
                fontStyle: 'italic'
              }}>
                As you approach the Truth Metal, memories of your current life flood your consciousness. 
                You see glimpses of your ordinary world - the familiar places, people, and routines that 
                define your existence before this moment of awakening...
              </p>

              <button
                onClick={() => setView('ordinary-world')}
                style={{
                  backgroundColor: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.75rem',
                  padding: '1rem 2rem',
                  fontSize: '1.1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  boxShadow: '0 4px 15px rgba(139, 92, 246, 0.3)'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(139, 92, 246, 0.4)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 15px rgba(139, 92, 246, 0.3)';
                }}
              >
                🌍 Describe Your Ordinary World
              </button>
            </div>
          )}

          {/* Ordinary World Input View */}
          {view === 'ordinary-world' && (
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ 
                fontSize: '1.75rem', 
                fontWeight: 'bold', 
                color: '#1f2937',
                marginBottom: '1rem'
              }}>
                🌍 What Does Your Ordinary World Look Like?
              </h2>
              
              <div style={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                borderRadius: '1rem',
                padding: '1.5rem',
                marginBottom: '2rem',
                border: '2px solid #f59e0b'
              }}>
                <p style={{ 
                  fontSize: '1rem', 
                  color: '#92400e',
                  marginBottom: '0',
                  lineHeight: '1.6'
                }}>
                  <strong>💭 Your memories show:</strong><br/>
                  Think about your daily life, your home, your relationships, your routines, 
                  your dreams, your struggles, and what makes your world feel "ordinary" to you. 
                  This will help you make your choice about the Truth Metal.
                </p>
              </div>

              {/* Show existing data message if available */}
              {existingOrdinaryWorld && existingOrdinaryWorld.trim() && (
                <div style={{
                  background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  marginBottom: '1rem',
                  border: '2px solid #3b82f6'
                }}>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    color: '#1e40af',
                    marginBottom: '0.5rem',
                    fontWeight: '600'
                  }}>
                    ℹ️ You already have an Ordinary World description saved.
                  </p>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    color: '#1e3a8a',
                    marginBottom: '0'
                  }}>
                    You can edit it below or skip to continue with your existing description.
                  </p>
                </div>
              )}

              <div style={{ marginBottom: '2rem' }}>
                <textarea
                  value={ordinaryWorld}
                  onChange={(e) => setOrdinaryWorld(e.target.value)}
                  placeholder="Describe your ordinary world... What does your daily life look like? Where do you live? Who are the important people in your life? What are your routines, dreams, and challenges?"
                  style={{
                    width: '100%',
                    minHeight: '200px',
                    padding: '1rem',
                    border: '2px solid #d1d5db',
                    borderRadius: '0.75rem',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    lineHeight: '1.6'
                  }}
                  maxLength={1000}
                />
                <div style={{
                  textAlign: 'right',
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  marginTop: '0.5rem'
                }}>
                  {ordinaryWorld.length}/1000 characters
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setView('flashback')}
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
                  ← Back to Memory
                </button>
                {existingOrdinaryWorld && existingOrdinaryWorld.trim() && (
                  <button
                    onClick={handleSkip}
                    style={{
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      padding: '0.75rem 1.5rem',
                      fontSize: '1rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    ⏭️ Skip (Use Existing)
                  </button>
                )}
                <button
                  onClick={() => setView('choice')}
                  disabled={!ordinaryWorld.trim()}
                  style={{
                    backgroundColor: ordinaryWorld.trim() ? '#8b5cf6' : '#9ca3af',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    padding: '0.75rem 2rem',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: ordinaryWorld.trim() ? 'pointer' : 'not-allowed'
                  }}
                >
                  Continue to Choice →
                </button>
              </div>
            </div>
          )}

          {/* Choice View */}
          {view === 'choice' && (
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ 
                fontSize: '1.75rem', 
                fontWeight: 'bold', 
                color: '#1f2937',
                marginBottom: '1rem'
              }}>
                ⚡ The Truth Metal Choice ⚡
              </h2>
              
              {/* Truth Metal Visualization */}
              <div style={{
                width: '100%',
                height: '250px',
                background: 'linear-gradient(135deg, #1f2937 0%, #374151 100%)',
                borderRadius: '1rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '2rem',
                border: '3px solid #dc2626',
                position: 'relative',
                overflow: 'hidden'
              }}>
                {/* Lightning effects */}
                <div style={{
                  position: 'absolute',
                  top: '10%',
                  left: '20%',
                  width: '4px',
                  height: '60px',
                  background: 'linear-gradient(to bottom, #fbbf24, transparent)',
                  borderRadius: '2px',
                  animation: 'pulse 1s infinite'
                }}></div>
                <div style={{
                  position: 'absolute',
                  top: '15%',
                  right: '30%',
                  width: '3px',
                  height: '45px',
                  background: 'linear-gradient(to bottom, #fbbf24, transparent)',
                  borderRadius: '2px',
                  animation: 'pulse 1s infinite 0.3s'
                }}></div>
                
                {/* Truth Metal */}
                <div style={{
                  width: '120px',
                  height: '120px',
                  background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '3rem',
                  animation: 'glow 2s infinite',
                  border: '4px solid #fbbf24',
                  boxShadow: '0 0 40px rgba(220, 38, 38, 0.8)'
                }}>
                  ⚡
                </div>
                
                <div style={{
                  position: 'absolute',
                  bottom: '15%',
                  color: '#fbbf24',
                  fontSize: '1.1rem',
                  fontWeight: 'bold',
                  textShadow: '0 0 10px rgba(251, 191, 36, 0.8)'
                }}>
                  The Truth Metal
                </div>
              </div>

              <p style={{ 
                fontSize: '1.1rem', 
                color: '#4b5563',
                marginBottom: '2rem',
                lineHeight: '1.7'
              }}>
                Now that you've reflected on your ordinary world, you must make a choice. 
                The Truth Metal pulses with raw power, offering to reveal core truths about yourself and your world.
              </p>

              {/* Choice Buttons */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '1.5rem',
                marginBottom: '2rem'
              }}>
                <button
                  onClick={() => setPlayerChoice('touch')}
                  style={{
                    padding: '1.5rem',
                    border: `3px solid ${playerChoice === 'touch' ? '#dc2626' : '#d1d5db'}`,
                    borderRadius: '1rem',
                    background: playerChoice === 'touch' ? '#fef2f2' : 'white',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚡</div>
                  <div style={{ 
                    fontWeight: 'bold', 
                    fontSize: '1.1rem',
                    color: playerChoice === 'touch' ? '#dc2626' : '#374151'
                  }}>
                    Touch the Truth Metal
                  </div>
                  <div style={{ 
                    fontSize: '0.9rem',
                    color: '#6b7280',
                    marginTop: '0.5rem'
                  }}>
                    Embrace change and unlock your true potential
                  </div>
                </button>

                <button
                  onClick={() => setPlayerChoice('ignore')}
                  style={{
                    padding: '1.5rem',
                    border: `3px solid ${playerChoice === 'ignore' ? '#6b7280' : '#d1d5db'}`,
                    borderRadius: '1rem',
                    background: playerChoice === 'ignore' ? '#f9fafb' : 'white',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🚪</div>
                  <div style={{ 
                    fontWeight: 'bold', 
                    fontSize: '1.1rem',
                    color: playerChoice === 'ignore' ? '#6b7280' : '#374151'
                  }}>
                    Ignore and Return
                  </div>
                  <div style={{ 
                    fontSize: '0.9rem',
                    color: '#6b7280',
                    marginTop: '0.5rem'
                  }}>
                    Return to your ordinary world unchanged
                  </div>
                </button>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button
                  onClick={() => setView('ordinary-world')}
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
                  ← Back to Description
                </button>
                <button
                  onClick={handleChoiceSubmit}
                  disabled={!playerChoice || !ordinaryWorld.trim()}
                  style={{
                    backgroundColor: (playerChoice && ordinaryWorld.trim()) ? '#dc2626' : '#9ca3af',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    padding: '0.75rem 2rem',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: (playerChoice && ordinaryWorld.trim()) ? 'pointer' : 'not-allowed'
                  }}
                >
                  Make Your Choice
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default TruthMetalChoiceModal;
