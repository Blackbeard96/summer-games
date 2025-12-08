import React, { useEffect, useState } from 'react';
import { getLevelFromXP } from '../utils/leveling';

interface LevelUpNotificationProps {
  currentXP: number;
  previousXP: number;
  onClose: () => void;
}

const LevelUpNotification: React.FC<LevelUpNotificationProps> = ({ 
  currentXP, 
  previousXP, 
  onClose 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const currentLevel = getLevelFromXP(currentXP);
  const previousLevel = getLevelFromXP(previousXP);

  useEffect(() => {
    if (currentLevel > previousLevel) {
      setIsVisible(true);
      setShowConfetti(true);
      
      // Auto-hide after 5 seconds
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onClose, 500); // Wait for fade out animation
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [currentLevel, previousLevel, onClose]);

  if (!isVisible) return null;

  return (
    <>
      {/* Confetti effect */}
      {showConfetti && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 9998
        }}>
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: '10px',
                height: '10px',
                background: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff'][i % 7],
                left: `${Math.random() * 100}%`,
                top: '-10px',
                animationName: 'fall',
                animationDuration: `${2 + Math.random() * 3}s`,
                animationTimingFunction: 'linear',
                animationFillMode: 'forwards',
                animationDelay: `${Math.random() * 2}s`
              }}
            />
          ))}
        </div>
      )}

      {/* Level Up Modal */}
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
        zIndex: 9999,
        animation: 'fadeIn 0.3s ease-out'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '1rem',
          padding: '2rem',
          textAlign: 'center',
          color: 'white',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          animation: 'slideIn 0.5s ease-out',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Sparkle effects */}
          <div style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            fontSize: '1.5rem',
            animation: 'spin 2s linear infinite'
          }}>
            ✨
          </div>
          <div style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            fontSize: '1.5rem',
            animation: 'spin 2s linear infinite reverse'
          }}>
            ⭐
          </div>

          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>
            🎉
          </div>
          
          <h2 style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            marginBottom: '0.5rem',
            textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
          }}>
            LEVEL UP!
          </h2>
          
          <div style={{
            fontSize: '3rem',
            fontWeight: 'bold',
            marginBottom: '1rem',
            color: '#fbbf24',
            textShadow: '0 0 20px rgba(251, 191, 36, 0.8), 0 0 40px rgba(251, 191, 36, 0.6)',
            animation: 'pulse 1s ease-in-out infinite',
            transform: 'scale(1.1)'
          }}>
            Level {currentLevel}
          </div>
          {previousLevel > 0 && (
            <div style={{
              fontSize: '1.25rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
              color: 'rgba(255, 255, 255, 0.8)',
              textDecoration: 'line-through',
              opacity: 0.7
            }}>
              Level {previousLevel}
            </div>
          )}
          
          <p style={{
            fontSize: '1.125rem',
            marginBottom: '1.5rem',
            opacity: 0.9
          }}>
            Congratulations! You've reached Level {currentLevel} with {currentXP} XP!
          </p>
          
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '0.5rem',
            padding: '1rem',
            marginBottom: '1.5rem'
          }}>
            <div style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
              <strong>New Abilities Unlocked:</strong>
            </div>
            <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>
              {currentLevel === 2 && "🔓 Enhanced Sight - See through digital illusions"}
              {currentLevel === 3 && "🔓 Tool Mastery - Advanced 3D modeling techniques"}
              {currentLevel === 4 && "🔓 Flow State - Unlock creative potential"}
              {currentLevel === 5 && "🔓 Imposition - Bend reality to your will"}
              {currentLevel === 6 && "🔓 Dimensional Awareness - Navigate complex spaces"}
              {currentLevel === 7 && "🔓 Truth Seeking - Uncover hidden knowledge"}
              {currentLevel === 8 && "🔓 Creation Mastery - Build worlds from nothing"}
              {currentLevel > 8 && "🔓 Master of All - You've reached the pinnacle!"}
            </div>
          </div>
          
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(onClose, 500);
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '2px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              backdropFilter: 'blur(10px)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            }}
          >
            Continue Your Journey
          </button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          
          @keyframes slideIn {
            from { 
              transform: translateY(-50px) scale(0.9);
              opacity: 0;
            }
            to { 
              transform: translateY(0) scale(1);
              opacity: 1;
            }
          }
          
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          
          @keyframes pulse {
            0%, 100% { 
              transform: scale(1.1);
              text-shadow: 0 0 20px rgba(251, 191, 36, 0.8), 0 0 40px rgba(251, 191, 36, 0.6);
            }
            50% { 
              transform: scale(1.2);
              text-shadow: 0 0 30px rgba(251, 191, 36, 1), 0 0 60px rgba(251, 191, 36, 0.8);
            }
          }
          
          @keyframes fall {
            to {
              transform: translateY(100vh) rotate(360deg);
              opacity: 0;
            }
          }
        `
      }} />
    </>
  );
};

export default LevelUpNotification; 