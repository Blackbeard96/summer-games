import React, { useState, useEffect, useRef } from 'react';

interface HoldToUnlockButtonProps {
  onUnlock: () => void;
  disabled?: boolean;
  holdDuration?: number; // in milliseconds
}

export const HoldToUnlockButton: React.FC<HoldToUnlockButtonProps> = ({
  onUnlock,
  disabled = false,
  holdDuration = 800
}) => {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isHolding && !disabled) {
      startTimeRef.current = Date.now();
      
      const interval = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Date.now() - startTimeRef.current;
          const newProgress = Math.min((elapsed / holdDuration) * 100, 100);
          setProgress(newProgress);
          
          if (newProgress >= 100) {
            // Unlock!
            setIsHolding(false);
            setProgress(0);
            onUnlock();
          }
        }
      }, 16); // ~60fps update
      
      holdIntervalRef.current = interval as any;
    } else {
      if (holdIntervalRef.current) {
        clearInterval(holdIntervalRef.current);
        holdIntervalRef.current = null;
      }
      if (!isHolding) {
        setProgress(0);
        startTimeRef.current = null;
      }
    }

    return () => {
      if (holdIntervalRef.current) {
        clearInterval(holdIntervalRef.current);
      }
    };
  }, [isHolding, disabled, holdDuration, onUnlock]);

  const handleMouseDown = () => {
    if (!disabled) {
      setIsHolding(true);
    }
  };

  const handleMouseUp = () => {
    setIsHolding(false);
  };

  const handleMouseLeave = () => {
    setIsHolding(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
      e.preventDefault();
      setIsHolding(true);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      setIsHolding(false);
    }
  };

  return (
    <button
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      disabled={disabled}
      style={{
        position: 'relative',
        width: '100%',
        padding: '1rem',
        background: disabled 
          ? 'rgba(107, 114, 128, 0.3)' 
          : isHolding 
            ? 'rgba(234, 179, 8, 0.3)' 
            : 'rgba(234, 179, 8, 0.2)',
        border: `2px solid ${disabled ? 'rgba(107, 114, 128, 0.5)' : '#eab308'}`,
        borderRadius: '0.5rem',
        color: '#fff',
        fontSize: '1rem',
        fontWeight: 'bold',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
        overflow: 'hidden',
        textTransform: 'uppercase',
        letterSpacing: '0.1em'
      }}
    >
      {/* Progress bar overlay */}
      {progress > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${progress}%`,
            background: 'rgba(234, 179, 8, 0.4)',
            transition: 'width 0.05s linear'
          }}
        />
      )}
      <span style={{ position: 'relative', zIndex: 1 }}>
        {disabled ? 'Requirements Not Met' : isHolding ? 'HOLD TO UNLOCK...' : 'HOLD TO UNLOCK'}
      </span>
    </button>
  );
};

