import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { getActivePPBoost, getPPBoostStatus } from '../utils/ppBoost';


interface PlayerCardProps {
  name: string;
  photoURL: string;
  powerPoints: number;
  manifest: string;
  level: number;
  rarity: number; // 1-5
  style: string; // e.g. 'Fire', 'Water', etc.
  description: string;
  cardBgColor?: string;
  moves?: Array<{ name: string; description: string; icon: string }>;
  badges?: Array<{ id: string; name: string; imageUrl: string; description: string; earnedAt: Date }>;
  xp?: number; // <-- Add xp prop
  userId?: string; // <-- Add userId for PP boost checking
  onManifestReselect?: () => void; // <-- Add manifest re-selection callback
}

const styleIcons: Record<string, string> = {
  Fire: '🔥',
  Water: '💧',
  Earth: '🌱',
  Air: '💨',
  // Add more as needed
};

const manifestIcons: Record<string, string> = {
  Reading: '📖',
  Writing: '✍️',
  Drawing: '🎨',
  Athletics: '🏃',
  Music: '🎵',
  Math: '🔢',
  Science: '🔬',
  History: '📚',
  Language: '🗣️',
  Art: '🎭',
  // Legacy manifests
  Imposition: '🌀',
  Memory: '🧠',
  Intelligence: '🤖',
  Dimensional: '🌌',
  Truth: '🔍',
  Creation: '✨',
};

// Helper to get XP needed for next level
function getXPProgress(xp: number) {
  let level = 1;
  let required = 100;
  let total = 0;
  while (xp >= total + required) {
    total += required;
    required = required * 1.25;
    level++;
  }
  const currentLevelXP = xp - total;
  const nextLevelXP = required;
  return { currentLevelXP, nextLevelXP, percent: Math.min(100, (currentLevelXP / nextLevelXP) * 100) };
}

const PlayerCard: React.FC<PlayerCardProps> = React.memo(({
  name,
  photoURL,
  powerPoints,
  manifest,
  level,
  rarity,
  style,
  description,
  cardBgColor = 'linear-gradient(135deg, #e0e7ff 0%, #fbbf24 100%)',
  moves = [],
  badges = [],
  xp = 0,
  userId,
  onManifestReselect,
}) => {
  const [flipped, setFlipped] = useState(false);
  const [ppBoostStatus, setPPBoostStatus] = useState<{ isActive: boolean; timeRemaining: string; multiplier: number }>({
    isActive: false,
    timeRemaining: '',
    multiplier: 1
  });

  // Check for active PP boost
  useEffect(() => {
    const checkPPBoost = async () => {
      if (!userId) return;
      
      try {
        const activeBoost = await getActivePPBoost(userId);
        const status = getPPBoostStatus(activeBoost);
        setPPBoostStatus(status);
      } catch (error) {
        console.error('Error checking PP boost:', error);
      }
    };
    
    checkPPBoost();
    
    // Check every minute for updates
    const interval = setInterval(checkPPBoost, 60000);
    return () => clearInterval(interval);
  }, [userId]);

  const background = useMemo(() => {
    return cardBgColor.startsWith('linear') ? cardBgColor : `linear-gradient(135deg, ${cardBgColor} 0%, #fbbf24 100%)`;
  }, [cardBgColor]);

  const xpProgress = useMemo(() => {
    if (typeof xp === 'number') {
      return getXPProgress(xp);
    }
    return null;
  }, [xp]);

  const handleFlip = useCallback(() => {
    setFlipped(f => !f);
  }, []);

  const handleManifestReselect = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onManifestReselect?.();
  }, [onManifestReselect]);

  return (
    <>
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.1); }
          }
        `}
      </style>
      <div
        style={{
          perspective: 1200,
          width: 320,
          height: 480,
          margin: '0 auto',
          cursor: 'pointer',
        }}
        onClick={handleFlip}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleFlip();
          }
        }}
        tabIndex={0}
        role="button"
        aria-label={`Player card for ${name}. Press Enter or Space to flip and view ${flipped ? 'front' : 'back'}.`}
        aria-pressed={flipped}
      >
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          transition: 'transform 0.7s cubic-bezier(.4,2,.6,1)',
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'none',
        }}
      >
        {/* Front */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            backfaceVisibility: 'hidden',
            background: background,
            border: '4px solid #4f46e5',
            borderRadius: 24,
            boxShadow: '0 8px 32px 0 rgba(31,41,55,0.25)',
            display: 'flex',
            flexDirection: 'column',
            padding: 24,
            zIndex: 2,
          }}
        >
          {/* Top Row: Name (left), Level/PP/Stars (right) */}
          <div style={{ display: 'flex', width: '100%', alignItems: 'center', marginBottom: 8 }}>
            {/* Name top left */}
            <div style={{ flex: 1, fontSize: 20, fontWeight: 'bold', color: '#1f2937', textAlign: 'left', lineHeight: 1.1, display: 'flex', alignItems: 'center', gap: '8px' }}>
              {name}
              {ppBoostStatus.isActive && (
                <span 
                  style={{ 
                    fontSize: '16px',
                    color: '#f59e0b',
                    fontWeight: 'bold',
                    textShadow: '0 0 4px rgba(245, 158, 11, 0.5)',
                    animation: 'pulse 2s infinite'
                  }}
                  title={`⚡ Double PP Boost Active! (${ppBoostStatus.timeRemaining} remaining)`}
                >
                  ⚡
                </span>
              )}
            </div>
            {/* Level, PP, Stars top right */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ background: '#4f46e5', color: 'white', borderRadius: 8, padding: '2px 10px', fontWeight: 'bold', fontSize: 14 }}>Lv. {level}</span>
              <span style={{ background: '#fbbf24', color: '#1f2937', borderRadius: 8, padding: '2px 10px', fontWeight: 'bold', fontSize: 14 }}>PP: {powerPoints}</span>
              <span>{Array.from({ length: rarity }).map((_, i) => (
                <span key={i} style={{ color: '#fbbf24', fontSize: 18, marginLeft: 1 }}>★</span>
              ))}</span>
            </div>
          </div>
          {/* Level Progress Bar */}
          {xpProgress && (
            <div style={{ margin: '8px 0 12px 0', width: '100%' }}>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 2 }}>
                Level Progress: {xpProgress.currentLevelXP} / {Math.round(xpProgress.nextLevelXP)} XP
              </div>
              <div style={{ background: '#e5e7eb', borderRadius: 8, height: 10, width: '100%', overflow: 'hidden' }}>
                <div style={{ width: `${xpProgress.percent}%`, background: '#4f46e5', height: '100%', borderRadius: 8, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}
          {/* Profile Image */}
          <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
            <img
              src={photoURL}
              alt={`Profile picture of ${name}`}
              style={{
                width: 120,
                height: 120,
                borderRadius: '50%',
                objectFit: 'cover',
                border: '4px solid #a78bfa',
                marginBottom: 16,
                background: '#fff',
              }}
            />
          </div>
          {/* Manifest and Element */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>{manifestIcons[manifest] || '✨'}</span>
              <span style={{ fontWeight: 'bold', color: '#4f46e5', fontSize: 14 }}>Manifest: {manifest}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 20 }}>{styleIcons[style] || '🔮'}</span>
              <span style={{ fontWeight: 'bold', color: '#10b981', fontSize: 14 }}>Element: {style}</span>
            </div>
          </div>
          {/* Re-select Manifest Button */}
          {onManifestReselect && manifest !== 'None' && (
            <div style={{ marginBottom: 12, textAlign: 'center' }}>
              <button
                onClick={handleManifestReselect}
                style={{
                  backgroundColor: '#8b5cf6',
                  color: 'white',
                  padding: '0.375rem 0.75rem',
                  borderRadius: '0.25rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  margin: '0 auto'
                }}
              >
                🔄 Re-select
              </button>
            </div>
          )}
          {/* Divider */}
          <div style={{ width: '80%', height: 2, background: '#e5e7eb', margin: '12px auto' }} />
          {/* Moves Section */}
          {moves && moves.length > 0 && (
            <div style={{ margin: '12px 0', textAlign: 'center' }}>
              <div style={{ fontWeight: 'bold', color: '#4f46e5', marginBottom: 4 }}>Moves</div>
              {moves.map((move, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 18 }}>{move.icon}</span>
                  <span style={{ fontWeight: 'bold' }}>{move.name}</span>
                  <span style={{ color: '#6b7280', fontSize: 14 }}>{move.description}</span>
                </div>
              ))}
            </div>
          )}
          {/* Flip hint */}
          <div style={{ color: '#6b7280', fontSize: 14, marginTop: 'auto', textAlign: 'center' }}>Click to view description</div>
        </div>
        {/* Back */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            backfaceVisibility: 'hidden',
            background: 'linear-gradient(135deg, #fbbf24 0%, #a78bfa 100%)',
            border: '4px solid #4f46e5',
            borderRadius: 24,
            boxShadow: '0 8px 32px 0 rgba(31,41,55,0.25)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: 24,
            transform: 'rotateY(180deg)',
            zIndex: 1,
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 'bold', color: '#1f2937', marginBottom: 16 }}>Description</div>
          <div style={{
            background: '#fff',
            color: '#1f2937',
            borderRadius: 12,
            padding: 16,
            fontSize: 16,
            minHeight: 120,
            boxShadow: '0 1px 3px 0 rgba(0,0,0,0.07)',
            width: '100%',
            textAlign: 'center',
            marginBottom: 16,
          }}>{description || 'No description provided.'}</div>
          
          {/* Badges Section */}
          {badges && badges.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 'bold', color: '#1f2937', marginBottom: 12 }}>Badges Earned</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {badges.map((badge) => (
                  <div
                    key={badge.id}
                    style={{
                      position: 'relative',
                      cursor: 'pointer',
                    }}
                    title={`${badge.name}: ${badge.description}`}
                  >
                    <img
                      src={badge.imageUrl}
                      alt={`${badge.name} badge: ${badge.description}`}
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        border: '3px solid #fbbf24',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        objectFit: 'cover',
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div style={{ color: '#6b7280', fontSize: 14, marginTop: 'auto' }}>Click to return</div>
        </div>
      </div>
    </div>
    </>
  );
});

PlayerCard.displayName = 'PlayerCard';

export default PlayerCard; 