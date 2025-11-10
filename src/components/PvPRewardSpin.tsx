import React, { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';

interface PvPRewardSpinProps {
  isOpen: boolean;
  onClose: () => void;
  isWinner: boolean;
  baseReward: number; // PP won for winner, PP lost for loser
  riskPercentage: number;
}

const PvPRewardSpin: React.FC<PvPRewardSpinProps> = ({ 
  isOpen, 
  onClose, 
  isWinner, 
  baseReward,
  riskPercentage 
}) => {
  const { currentUser } = useAuth();
  const { vault, syncVaultPP } = useBattle();
  const [spinning, setSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<number | null>(null);
  const [finalReward, setFinalReward] = useState<number | null>(null);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [selectedMultiplier, setSelectedMultiplier] = useState<number | null>(null);

  // Multiplier options in 10% intervals (0% to 100%)
  // For winners: 10% to 100% bonus multiplier
  // For losers: 0% to 100% recovery percentage
  // Use useMemo to recalculate when isWinner changes
  const multiplierOptions = useMemo(() => {
    return isWinner 
      ? [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00] // Winners: 10-100%
      : [0.00, 0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00]; // Losers: 0-100%
  }, [isWinner]);

  if (!isOpen) return null;

  const spin = () => {
    if (spinning) return;

    setSpinning(true);
    setSpinResult(null);
    setFinalReward(null);

    // Generate random multiplier in 10% intervals
    const multiplier = multiplierOptions[Math.floor(Math.random() * multiplierOptions.length)];
    const selectedIndex = multiplierOptions.indexOf(multiplier);
    
    // Calculate rotation: each segment is 36 degrees (360 / 10), plus multiple full rotations
    const segmentAngle = 360 / multiplierOptions.length;
    const baseRotation = selectedIndex * segmentAngle;
    // Add multiple full rotations (5-8 full spins) plus a bit more for visual effect
    const fullRotations = 5 + Math.random() * 3; // 5-8 full rotations
    const finalRotation = wheelRotation + (fullRotations * 360) + (360 - baseRotation);
    
    setSelectedMultiplier(null);
    setWheelRotation(finalRotation);

    // Simulate spin animation (2-3 seconds)
    const spinDuration = 2000 + Math.random() * 1000;
    const startTime = Date.now();
    const startRotation = wheelRotation;

    const animateSpin = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / spinDuration, 1);
      
      // Easing function for smooth deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentRotation = startRotation + (finalRotation - startRotation) * easeOut;
      setWheelRotation(currentRotation);
      
      if (progress < 1) {
        requestAnimationFrame(animateSpin);
      } else {
        // Spin complete
        setWheelRotation(finalRotation);
        setSelectedMultiplier(multiplier);
        setSpinResult(multiplier);
        
        if (isWinner) {
          // Winner gets a bonus multiplier on top of the base reward
          const bonusReward = Math.floor(baseReward * multiplier);
          setFinalReward(bonusReward);
          applyWinnerReward(bonusReward);
        } else {
          // Loser gets recovery percentage of what they lost
          const recovered = Math.floor(baseReward * multiplier);
          setFinalReward(recovered);
          applyLoserRecovery(recovered);
        }
        
        setSpinning(false);
      }
    };

    animateSpin();
  };

  const applyWinnerReward = async (reward: number) => {
    if (!currentUser || !vault) return;

    try {
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      const currentPP = vault.currentPP || 0;
      const capacity = vault.capacity || 1000;
      const newPP = Math.min(currentPP + reward, capacity);

      await updateDoc(vaultRef, {
        currentPP: newPP
      });

      // Update student document
      const studentRef = doc(db, 'students', currentUser.uid);
      await updateDoc(studentRef, {
        currentPP: newPP
      });

      // Sync local state
      syncVaultPP();
    } catch (error) {
      console.error('Error applying winner reward:', error);
    }
  };

  const applyLoserRecovery = async (recovered: number) => {
    if (!currentUser || !vault) return;

    try {
      const vaultRef = doc(db, 'vaults', currentUser.uid);
      const currentPP = vault.currentPP || 0;
      const capacity = vault.capacity || 1000;
      const newPP = Math.min(currentPP + recovered, capacity);

      await updateDoc(vaultRef, {
        currentPP: newPP
      });

      // Update student document
      const studentRef = doc(db, 'students', currentUser.uid);
      await updateDoc(studentRef, {
        currentPP: newPP
      });

      // Sync local state
      syncVaultPP();
    } catch (error) {
      console.error('Error applying loser recovery:', error);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '2rem'
    }}>
      <div style={{
        background: isWinner ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        color: 'white',
        padding: '2rem',
        borderRadius: '1rem',
        maxWidth: '500px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
      }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '1rem', marginTop: 0 }}>
          {isWinner ? '🎉 Victory Reward!' : '💔 Recovery Chance!'}
        </h2>
        
        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          padding: '1.5rem',
          borderRadius: '0.5rem',
          marginBottom: '1.5rem'
        }}>
          {isWinner ? (
            <>
              <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
                Base Reward Received: <strong>{baseReward.toLocaleString()} PP</strong>
              </div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>
                Spin for a <strong>10% - 100%</strong> bonus multiplier on top of your base reward!
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.5rem', fontStyle: 'italic' }}>
                Example: {baseReward} PP base + 50% spin = +{Math.floor(baseReward * 0.5)} PP bonus
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
                Points Lost: <strong>{baseReward.toLocaleString()} PP</strong>
              </div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>
                Spin to recover <strong>0% - 100%</strong> of your lost points!
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.5rem', fontStyle: 'italic' }}>
                Example: {baseReward} PP lost + 50% spin = +{Math.floor(baseReward * 0.5)} PP recovered
              </div>
            </>
          )}
        </div>

        {!spinResult ? (
          <>
            <div style={{
              position: 'relative',
              width: '300px',
              height: '300px',
              margin: '0 auto 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {/* Pointer/Indicator - Fixed at top */}
              <div style={{
                position: 'absolute',
                top: '-10px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '15px solid transparent',
                borderRight: '15px solid transparent',
                borderTop: '30px solid rgba(255, 255, 255, 0.9)',
                zIndex: 30,
                filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.5))'
              }} />
              
              {/* Wheel Container */}
              <div style={{
                position: 'relative',
                width: '300px',
                height: '300px',
                borderRadius: '50%',
                background: 'conic-gradient(from 0deg, rgba(255, 255, 255, 0.3) 0deg 36deg, rgba(255, 255, 255, 0.1) 36deg 72deg, rgba(255, 255, 255, 0.3) 72deg 108deg, rgba(255, 255, 255, 0.1) 108deg 144deg, rgba(255, 255, 255, 0.3) 144deg 180deg, rgba(255, 255, 255, 0.1) 180deg 216deg, rgba(255, 255, 255, 0.3) 216deg 252deg, rgba(255, 255, 255, 0.1) 252deg 288deg, rgba(255, 255, 255, 0.3) 288deg 324deg, rgba(255, 255, 255, 0.1) 324deg 360deg)',
                border: '4px solid rgba(255, 255, 255, 0.3)',
                transform: `rotate(${wheelRotation}deg)`,
                transition: spinning ? 'none' : 'transform 0.1s ease-out',
                overflow: 'hidden'
              }}>
                {/* Multiplier Labels */}
                {multiplierOptions.map((multiplier, index) => {
                  const segmentAngle = 360 / multiplierOptions.length;
                  const rotation = index * segmentAngle;
                  const labelRadius = 110;
                  const labelX = Math.cos((rotation - 90) * Math.PI / 180) * labelRadius;
                  const labelY = Math.sin((rotation - 90) * Math.PI / 180) * labelRadius;
                  const isHighlighted = selectedMultiplier === multiplier;
                  
                  return (
                    <div
                      key={index}
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: `translate(${labelX}px, ${labelY}px) translate(-50%, -50%)`,
                        fontSize: isHighlighted ? '1.5rem' : '1.1rem',
                        fontWeight: isHighlighted ? 'bold' : 'bold',
                        color: isHighlighted ? '#ffeb3b' : 'white',
                        textShadow: isHighlighted 
                          ? '0 0 10px rgba(255, 235, 59, 0.8), 0 0 20px rgba(255, 235, 59, 0.6)' 
                          : '2px 2px 4px rgba(0, 0, 0, 0.8), 0 0 8px rgba(0, 0, 0, 0.5)',
                        zIndex: isHighlighted ? 10 : 1,
                        transition: 'all 0.3s ease',
                        pointerEvents: 'none'
                      }}
                    >
                      {Math.round(multiplier * 100)}%
                    </div>
                  );
                })}
                
                {/* Center Circle */}
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.3)',
                  border: '3px solid rgba(255, 255, 255, 0.5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  zIndex: 20,
                  pointerEvents: 'none'
                }}>
                  🎰
                </div>
              </div>
            </div>
            <button
              onClick={spin}
              disabled={spinning}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: '2px solid rgba(255, 255, 255, 0.4)',
                color: 'white',
                padding: '1rem 2rem',
                borderRadius: '0.5rem',
                fontSize: '1.125rem',
                fontWeight: 'bold',
                cursor: spinning ? 'not-allowed' : 'pointer',
                opacity: spinning ? 0.6 : 1,
                transition: 'all 0.2s'
              }}
            >
              {spinning ? 'Spinning...' : '🎰 Spin the Wheel!'}
            </button>
          </>
        ) : (
          <>
            <div style={{
              background: 'rgba(255, 255, 255, 0.2)',
              padding: '1.5rem',
              borderRadius: '0.5rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                {isWinner ? '✨ Bonus!' : '🔄 Recovery!'}
              </div>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                {isWinner 
                  ? `+${(spinResult * 100).toFixed(0)}% Bonus Multiplier`
                  : `${(spinResult * 100).toFixed(0)}% Recovered`
                }
              </div>
              <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem', opacity: 0.9 }}>
                {isWinner 
                  ? `Base: ${baseReward.toLocaleString()} PP + Bonus: ${finalReward?.toLocaleString()} PP`
                  : `Lost: ${baseReward.toLocaleString()} PP × ${(spinResult * 100).toFixed(0)}% = ${finalReward?.toLocaleString()} PP Recovered`
                }
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', marginTop: '1rem' }}>
                {isWinner 
                  ? `Total: ${(baseReward + (finalReward || 0)).toLocaleString()} PP`
                  : `+${finalReward?.toLocaleString()} PP Recovered`
                }
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: '2px solid rgba(255, 255, 255, 0.4)',
                color: 'white',
                padding: '1rem 2rem',
                borderRadius: '0.5rem',
                fontSize: '1.125rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Continue
            </button>
          </>
        )}

        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
};

export default PvPRewardSpin;

