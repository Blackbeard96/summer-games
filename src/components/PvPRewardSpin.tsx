import React, { useState, useEffect } from 'react';
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

  if (!isOpen) return null;

  const spin = () => {
    if (spinning) return;

    setSpinning(true);
    setSpinResult(null);
    setFinalReward(null);

    // Generate random multiplier
    let multiplier: number;
    if (isWinner) {
      // Winner: 10% to 50% multiplier
      multiplier = 0.10 + Math.random() * 0.40; // 0.10 to 0.50
    } else {
      // Loser: 10% to 100% recovery
      multiplier = 0.10 + Math.random() * 0.90; // 0.10 to 1.00
    }

    // Simulate spin animation (2-3 seconds)
    const spinDuration = 2000 + Math.random() * 1000;
    const startTime = Date.now();

    const animateSpin = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / spinDuration, 1);
      
      // Easing function for smooth deceleration
      const easeOut = 1 - Math.pow(1 - progress, 3);
      
      if (progress < 1) {
        requestAnimationFrame(animateSpin);
      } else {
        // Spin complete
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
                Spin for a <strong>10% - 50%</strong> bonus multiplier on top!
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>
                Points Lost: <strong>{baseReward.toLocaleString()} PP</strong>
              </div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>
                Spin to recover <strong>10% - 100%</strong> of your lost points!
              </div>
            </>
          )}
        </div>

        {!spinResult ? (
          <>
            <div style={{
              width: '200px',
              height: '200px',
              margin: '0 auto 1.5rem',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '3rem',
              border: '4px solid rgba(255, 255, 255, 0.3)',
              animation: spinning ? 'spin 2s linear infinite' : 'none'
            }}>
              🎰
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
                  ? `+${(spinResult * 100).toFixed(0)}% Multiplier`
                  : `${(spinResult * 100).toFixed(0)}% Recovered`
                }
              </div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', marginTop: '1rem' }}>
                {isWinner 
                  ? `+${finalReward?.toLocaleString()} PP Bonus`
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

