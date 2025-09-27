import React, { useState, useEffect } from 'react';
import { Move } from '../types/battle';

interface BattleAnimationsProps {
  move: Move | null;
  isPlayerMove: boolean;
  onAnimationComplete: () => void;
}

const BattleAnimations: React.FC<BattleAnimationsProps> = ({
  move,
  isPlayerMove,
  onAnimationComplete
}) => {
  const [showAnimation, setShowAnimation] = useState(false);
  const [animationType, setAnimationType] = useState<string>('');

  useEffect(() => {
    if (move) {
      setShowAnimation(true);
      setAnimationType(getAnimationType(move));
      
      // Auto-complete animation after duration
      const duration = getAnimationDuration(move);
      const timer = setTimeout(() => {
        setShowAnimation(false);
        onAnimationComplete();
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [move, onAnimationComplete]);

  const getAnimationType = (move: Move): string => {
    // Determine animation type based on move properties
    if (move.type === 'attack') {
      if (move.elementalAffinity === 'fire') return 'fire_blast';
      if (move.elementalAffinity === 'water') return 'water_splash';
      if (move.elementalAffinity === 'lightning') return 'lightning_strike';
      if (move.elementalAffinity === 'earth') return 'earth_quake';
      return 'basic_attack';
    }
    if (move.type === 'defense') return 'shield_up';
    if (move.type === 'utility') return 'utility_effect';
    if (move.type === 'support') return 'healing_light';
    return 'default';
  };

  const getAnimationDuration = (move: Move): number => {
    // Return animation duration in milliseconds
    if (move.type === 'attack') return 1500;
    if (move.type === 'defense') return 1000;
    if (move.type === 'utility') return 1200;
    if (move.type === 'support') return 2000;
    return 1000;
  };

  const getMoveColor = (move: Move): string => {
    const colors = {
      fire: '#ff6b35',
      water: '#4fc3f7',
      lightning: '#ffeb3b',
      earth: '#8bc34a',
      light: '#ffffff',
      shadow: '#424242',
      metal: '#9e9e9e',
      air: '#e1f5fe'
    };
    return colors[move.elementalAffinity as keyof typeof colors] || '#6b7280';
  };

  if (!showAnimation || !move) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      pointerEvents: 'none',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {/* Screen Flash Effect */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: getMoveColor(move),
        opacity: 0.3,
        animation: 'flash 0.3s ease-out'
      }} />

      {/* Move Name Display */}
      <div style={{
        position: 'absolute',
        top: '20%',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '1rem 2rem',
        borderRadius: '0.5rem',
        fontSize: '1.5rem',
        fontWeight: 'bold',
        fontFamily: 'monospace',
        border: `3px solid ${getMoveColor(move)}`,
        animation: 'slideInDown 0.5s ease-out'
      }}>
        {move.name.toUpperCase()}!
      </div>

      {/* Elemental Effects */}
      {animationType === 'fire_blast' && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: isPlayerMove ? '20%' : '80%',
          transform: 'translate(-50%, -50%)',
          fontSize: '4rem',
          animation: 'fireBlast 1.5s ease-out'
        }}>
          🔥
        </div>
      )}

      {animationType === 'water_splash' && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: isPlayerMove ? '20%' : '80%',
          transform: 'translate(-50%, -50%)',
          fontSize: '4rem',
          animation: 'waterSplash 1.5s ease-out'
        }}>
          💧
        </div>
      )}

      {animationType === 'lightning_strike' && (
        <div style={{
          position: 'absolute',
          top: '30%',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '3rem',
          animation: 'lightningStrike 1.5s ease-out'
        }}>
          ⚡
        </div>
      )}

      {animationType === 'earth_quake' && (
        <div style={{
          position: 'absolute',
          bottom: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '3rem',
          animation: 'earthQuake 1.5s ease-out'
        }}>
          🌍
        </div>
      )}

      {animationType === 'shield_up' && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: isPlayerMove ? '20%' : '80%',
          transform: 'translate(-50%, -50%)',
          fontSize: '4rem',
          animation: 'shieldUp 1s ease-out'
        }}>
          🛡️
        </div>
      )}

      {animationType === 'healing_light' && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: isPlayerMove ? '20%' : '80%',
          transform: 'translate(-50%, -50%)',
          fontSize: '4rem',
          animation: 'healingLight 2s ease-out'
        }}>
          ✨
        </div>
      )}

      {/* Damage Numbers */}
      {move.damage && (
        <div style={{
          position: 'absolute',
          top: isPlayerMove ? '30%' : '60%',
          left: isPlayerMove ? '70%' : '30%',
          fontSize: '2rem',
          fontWeight: 'bold',
          color: '#ef4444',
          fontFamily: 'monospace',
          animation: 'damageNumber 1.5s ease-out',
          textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)'
        }}>
          -{move.damage}
        </div>
      )}

      {/* PP Steal Effect */}
      {move.ppSteal && (
        <div style={{
          position: 'absolute',
          top: isPlayerMove ? '40%' : '50%',
          left: isPlayerMove ? '70%' : '30%',
          fontSize: '1.5rem',
          fontWeight: 'bold',
          color: '#fbbf24',
          fontFamily: 'monospace',
          animation: 'ppSteal 1.5s ease-out',
          textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)'
        }}>
          +{move.ppSteal} PP
        </div>
      )}

      {/* CSS Animations */}
      <style>
        {`
          @keyframes flash {
            0% { opacity: 0; }
            50% { opacity: 0.3; }
            100% { opacity: 0; }
          }
          
          @keyframes slideInDown {
            0% { transform: translateX(-50%) translateY(-100px); opacity: 0; }
            100% { transform: translateX(-50%) translateY(0); opacity: 1; }
          }
          
          @keyframes fireBlast {
            0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
            50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(1) translateX(${isPlayerMove ? '200px' : '-200px'}); opacity: 0; }
          }
          
          @keyframes waterSplash {
            0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
            50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(1) translateX(${isPlayerMove ? '200px' : '-200px'}); opacity: 0; }
          }
          
          @keyframes lightningStrike {
            0% { transform: translateX(-50%) translateY(-100px); opacity: 0; }
            20% { transform: translateX(-50%) translateY(0); opacity: 1; }
            80% { transform: translateX(-50%) translateY(0); opacity: 1; }
            100% { transform: translateX(-50%) translateY(100px); opacity: 0; }
          }
          
          @keyframes earthQuake {
            0% { transform: translateX(-50%) scale(0.5); opacity: 0; }
            50% { transform: translateX(-50%) scale(1.2); opacity: 1; }
            100% { transform: translateX(-50%) scale(1); opacity: 0; }
          }
          
          @keyframes shieldUp {
            0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
            50% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
          }
          
          @keyframes healingLight {
            0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; }
            25% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; }
            75% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
          }
          
          @keyframes damageNumber {
            0% { transform: translateY(0) scale(1); opacity: 1; }
            50% { transform: translateY(-20px) scale(1.2); opacity: 1; }
            100% { transform: translateY(-40px) scale(1); opacity: 0; }
          }
          
          @keyframes ppSteal {
            0% { transform: translateY(0) scale(1); opacity: 1; }
            50% { transform: translateY(-15px) scale(1.1); opacity: 1; }
            100% { transform: translateY(-30px) scale(1); opacity: 0; }
          }
        `}
      </style>
    </div>
  );
};

export default BattleAnimations;
