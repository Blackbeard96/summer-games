import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { getActivePPBoost, getPPBoostStatus } from '../utils/ppBoost';

interface PlayerCardProps {
  name: string;
  photoURL: string;
  powerPoints: number;
  truthMetal?: number;
  manifest: string;
  level: number;
  rarity: number; // 1-5
  style: string; // e.g. 'Fire', 'Water', etc.
  description: string;
  cardBgColor?: string;
  cardFrameShape?: 'circular' | 'rectangular';
  cardBorderColor?: string;
  cardImageBorderColor?: string;
  moves?: Array<{ name: string; description: string; icon: string }>;
  badges?: Array<{ id: string; name: string; imageUrl: string; description: string; earnedAt: Date | any }>;
  xp?: number;
  userId?: string;
  onManifestReselect?: () => void;
  ordinaryWorld?: string;
}

const styleIcons: Record<string, string> = {
  Fire: '🔥',
  Water: '💧',
  Earth: '🌱',
  Air: '💨',
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
  truthMetal = 0,
  manifest,
  level,
  rarity,
  style,
  description,
  cardBgColor = 'linear-gradient(135deg, #e0e7ff 0%, #fbbf24 100%)',
  cardFrameShape = 'circular',
  cardBorderColor = '#a78bfa',
  cardImageBorderColor = '#a78bfa',
  moves = [],
  badges = [],
  xp = 0,
  userId,
  onManifestReselect,
  ordinaryWorld,
}) => {
  const [flipped, setFlipped] = useState(false);
  const [showBadges, setShowBadges] = useState(false);
  const [selectedJourneyStage, setSelectedJourneyStage] = useState<string | null>(null);
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

  // Function to get manifest color
  const getManifestColor = (manifestName: string) => {
    const manifestColors: { [key: string]: string } = {
      'Reading': '#3B82F6',
      'Writing': '#10B981',
      'Drawing': '#F59E0B',
      'Athletics': '#EF4444',
      'Music': '#8B5CF6',
      'Math': '#06B6D4',
      'Science': '#84CC16',
      'History': '#F97316',
      'Language': '#EC4899',
      'Art': '#6366F1',
    };
    return manifestColors[manifestName] || '#6b7280';
  };

  // Function to get element color
  const getElementColor = (elementName: string) => {
    const elementColors: { [key: string]: string } = {
      'Fire': '#EF4444',
      'Water': '#3B82F6', 
      'Air': '#10B981',
      'Earth': '#F59E0B',
      'Lightning': '#8B5CF6',
      'Light': '#FBBF24',
      'Shadow': '#6B7280',
      'Metal': '#9CA3AF'
    };
    return elementColors[elementName] || '#6b7280';
  };

  const handleFlip = useCallback(() => {
    if (showBadges) {
      setShowBadges(false);
      setFlipped(false);
    } else {
      setFlipped(f => !f);
    }
  }, [showBadges]);

  const handleBadgeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowBadges(true);
    setFlipped(true);
  }, []);

  const handleJourneyStageClick = useCallback((stage: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedJourneyStage(stage);
    setShowBadges(false);
    setFlipped(true);
  }, []);

  const handleReturnToJourneyList = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedJourneyStage(null);
  }, []);

  // Journey stage data - this would typically come from user's profile data
  const journeyStages = {
    'ordinary-world': {
      title: 'Ordinary World',
      icon: '🌍',
      description: ordinaryWorld || 'You haven\'t written your Ordinary World reflection yet. Complete the Chapter 1 challenge to add your personal story!',
      content: 'This is your personal reflection for the Ordinary World stage of your hero\'s journey. Here you describe your life before the call to adventure - your familiar routines, your world as you knew it, and the place where your transformation began.'
    },
    'call-to-adventure': {
      title: 'Call to Adventure',
      icon: '📢',
      description: 'You haven\'t written your Call to Adventure reflection yet. Complete more challenges to unlock this stage!',
      content: 'This is your personal reflection for the Call to Adventure stage. Here you describe the moment when everything changed - the call that pulled you from your ordinary world into something extraordinary.'
    },
    'meeting-mentor': {
      title: 'Meeting the Mentor',
      icon: '🧙',
      description: 'You haven\'t written your Meeting the Mentor reflection yet. Complete more challenges to unlock this stage!',
      content: 'This is your personal reflection for the Meeting the Mentor stage. Here you describe the wise guide who helped you understand your new world and prepared you for the challenges ahead.'
    },
    'tests-allies-enemies': {
      title: 'Tests, Allies, Enemies',
      icon: '⚔️',
      description: 'You haven\'t written your Tests, Allies, Enemies reflection yet. Complete more challenges to unlock this stage!',
      content: 'This is your personal reflection for the Tests, Allies, Enemies stage. Here you describe the trials that tested your resolve, the allies who joined your cause, and the enemies who stood in your way.'
    },
    'approaching-cave': {
      title: 'Approaching the Cave',
      icon: '🏰',
      description: 'You haven\'t written your Approaching the Cave reflection yet. Complete more challenges to unlock this stage!',
      content: 'This is your personal reflection for the Approaching the Cave stage. Here you describe the approach to your greatest challenge - the moment when you stepped into the unknown.'
    },
    'ordeal': {
      title: 'The Ordeal',
      icon: '🔥',
      description: 'You haven\'t written your Ordeal reflection yet. Complete more challenges to unlock this stage!',
      content: 'This is your personal reflection for the Ordeal stage. Here you describe your greatest trial - the moment when you faced your deepest fears and emerged transformed.'
    },
    'road-back': {
      title: 'The Road Back',
      icon: '🏃',
      description: 'You haven\'t written your Road Back reflection yet. Complete more challenges to unlock this stage!',
      content: 'This is your personal reflection for the Road Back stage. Here you describe the journey home - carrying your new wisdom and power back to your ordinary world.'
    },
    'resurrection': {
      title: 'Resurrection',
      icon: '⚡',
      description: 'You haven\'t written your Resurrection reflection yet. Complete more challenges to unlock this stage!',
      content: 'This is your personal reflection for the Resurrection stage. Here you describe your final transformation - the moment when you became truly who you were meant to be.'
    },
    'return-elixir': {
      title: 'Return with Elixir',
      icon: '🏆',
      description: 'You haven\'t written your Return with Elixir reflection yet. Complete more challenges to unlock this stage!',
      content: 'This is your personal reflection for the Return with Elixir stage. Here you describe how you brought your transformation back to help others - sharing the gift of your journey.'
    }
  };

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
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
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
              border: `4px solid ${cardBorderColor}`,
              borderRadius: 24,
              boxShadow: '0 8px 32px 0 rgba(31,41,55,0.25)',
              display: 'flex',
              flexDirection: 'column',
              padding: 24,
              zIndex: 2,
              transform: 'rotateY(0deg)',
            }}
          >
            {/* Top Row: Name, PP, TM, Level all aligned */}
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginBottom: 4 }}>
              {/* First row: Name, PP, TM, Level all on same line */}
              <div style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                {/* Player Name */}
                <div style={{ fontSize: 20, fontWeight: 'bold', color: '#1f2937', textAlign: 'left', lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                {/* PP and TM badges */}
                <span 
                  style={{ background: '#fbbf24', color: '#1f2937', borderRadius: 8, padding: '2px 10px', fontWeight: 'bold', fontSize: 14, display: 'flex', alignItems: 'center', gap: '4px' }} 
                  title="Power Points"
                >
                  PP: {powerPoints}
                  {ppBoostStatus.isActive && (
                    <span 
                      style={{ 
                        fontSize: '12px',
                        color: '#f59e0b',
                        fontWeight: 'bold',
                        textShadow: '0 0 4px rgba(245, 158, 11, 0.5)',
                        animation: 'pulse 2s infinite'
                      }}
                      title={`⚡ Double PP Boost Active! (${ppBoostStatus.timeRemaining} remaining)`}
                    >
                      ×2
                    </span>
                  )}
                </span>
                <span 
                  style={{ background: '#9ca3af', color: '#ffffff', borderRadius: 8, padding: '2px 10px', fontWeight: 'bold', fontSize: 14, border: '1px solid #6b7280', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }}
                  title="Truth Metal Shards"
                >
                  TM: {truthMetal}
                </span>
                {/* Level badge */}
                <span style={{ background: '#4f46e5', color: 'white', borderRadius: 8, padding: '2px 10px', fontWeight: 'bold', fontSize: 14, marginLeft: 'auto' }}>Lv. {level}</span>
              </div>
              {/* Second row: Rarity stars under name */}
              <div style={{ display: 'flex', alignItems: 'center', marginTop: -4 }}>
                {Array.from({ length: rarity }).map((_, i) => (
                  <span key={i} style={{ color: '#fbbf24', fontSize: 16, marginRight: 2 }}>★</span>
                ))}
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
              {photoURL && photoURL.trim() !== '' ? (
                <img
                  key={photoURL} // Force re-render when photoURL changes
                  src={photoURL}
                  alt={`Profile picture of ${name}`}
                  style={{
                    width: 120,
                    height: 120,
                    borderRadius: cardFrameShape === 'circular' ? '50%' : '0.75rem',
                    objectFit: 'cover',
                    border: `4px solid ${cardImageBorderColor}`,
                    marginBottom: 16,
                    background: '#fff',
                  }}
                  onLoad={(e) => {
                    console.log('Profile image loaded successfully:', photoURL);
                    // Hide fallback when image loads successfully
                    const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'none';
                    e.currentTarget.style.display = 'block';
                  }}
                  onError={(e) => {
                    console.log('Profile image failed to load:', photoURL);
                    // Hide the broken image and show fallback
                    e.currentTarget.style.display = 'none';
                    const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
              ) : null}
              {/* Fallback profile picture */}
              <div
                key={`fallback-${name}`} // Force re-render when name changes
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: cardFrameShape === 'circular' ? '50%' : '0.75rem',
                  border: `4px solid ${cardImageBorderColor}`,
                  marginBottom: 16,
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
                  display: (photoURL && photoURL.trim() !== '') ? 'none' : 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 48,
                  color: 'white',
                  fontWeight: 'bold',
                }}
              >
                {name.charAt(0).toUpperCase()}
              </div>
            </div>

            {/* Manifest and Element */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{manifestIcons[manifest] || '✨'}</span>
                <span style={{ fontWeight: 'bold', color: getManifestColor(manifest), fontSize: 14 }}>Manifest: {manifest}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>{styleIcons[style] || '🔮'}</span>
                <span style={{ fontWeight: 'bold', color: getElementColor(style), fontSize: 14 }}>Element: {style}</span>
              </div>
            </div>

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
            
            {/* Badges Button */}
            <div style={{ margin: '12px 0', textAlign: 'center' }}>
              <button
                onClick={handleBadgeClick}
                style={{
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px 20px',
                  fontWeight: 'bold',
                  fontSize: 14,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  margin: '0 auto'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(139, 92, 246, 0.4)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.3)';
                }}
              >
                <span>🏆</span>
                Badges ({badges.length})
              </button>
            </div>
            
            {/* Flip hint */}
            <div style={{ color: '#6b7280', fontSize: 14, marginTop: 'auto', textAlign: 'center' }}>
              Click to view journey details
            </div>
          </div>

          {/* Back */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backfaceVisibility: 'hidden',
              background: 'linear-gradient(135deg, #fbbf24 0%, #a78bfa 100%)',
              border: `4px solid ${cardBorderColor}`,
              borderRadius: 24,
              boxShadow: '0 8px 32px 0 rgba(31,41,55,0.25)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: 24,
              transform: 'rotateY(180deg)',
              zIndex: 1,
              overflowY: 'auto',
            }}
          >
            {/* Journey Stage Detail View */}
            {selectedJourneyStage ? (
              <>
                <div style={{ 
                  fontSize: 24, 
                  fontWeight: 'bold', 
                  color: '#1f2937', 
                  marginBottom: 20,
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{journeyStages[selectedJourneyStage as keyof typeof journeyStages]?.icon}</span>
                    {journeyStages[selectedJourneyStage as keyof typeof journeyStages]?.title}
                  </span>
                  <button
                    onClick={handleReturnToJourneyList}
                    style={{
                      background: 'rgba(255, 255, 255, 0.2)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '36px',
                      height: '36px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                      color: '#1f2937',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                    }}
                  >
                    ←
                  </button>
                </div>
                
                <div style={{
                  background: '#fff',
                  borderRadius: 12,
                  padding: 16,
                  boxShadow: '0 1px 3px 0 rgba(0,0,0,0.07)',
                  width: '100%',
                  maxHeight: 300,
                  overflowY: 'auto',
                  marginBottom: 16,
                  flex: '1 1 auto',
                }}>
                  <div style={{
                    fontSize: 16,
                    color: '#1f2937',
                    lineHeight: '1.6',
                    marginBottom: 16,
                    fontStyle: 'italic'
                  }}>
                    "{journeyStages[selectedJourneyStage as keyof typeof journeyStages]?.description}"
                  </div>
                  
                  <div style={{
                    fontSize: 14,
                    color: '#6b7280',
                    lineHeight: '1.5'
                  }}>
                    {journeyStages[selectedJourneyStage as keyof typeof journeyStages]?.content}
                  </div>
                </div>
                
                <div style={{ color: '#6b7280', fontSize: 14, marginTop: 'auto', textAlign: 'center' }}>
                  Click to return to journey list
                </div>
              </>
            ) : showBadges ? (
              <>
                <div style={{ 
                  fontSize: 24, 
                  fontWeight: 'bold', 
                  color: '#1f2937', 
                  marginBottom: 20,
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%'
                }}>
                  <span>🏆 Your Badges</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowBadges(false);
                      setFlipped(false);
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.2)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '36px',
                      height: '36px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                      color: '#1f2937',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                    }}
                  >
                    ←
                  </button>
                </div>
                
                <div style={{
                  background: '#fff',
                  borderRadius: 12,
                  padding: 12,
                  boxShadow: '0 1px 3px 0 rgba(0,0,0,0.07)',
                  width: '100%',
                  maxHeight: 320,
                  overflowY: 'auto',
                  marginBottom: 16,
                  flex: '1 1 auto',
                }}>
                  {badges.length === 0 ? (
                    <div style={{
                      textAlign: 'center',
                      padding: '2rem 1rem',
                      color: '#6b7280'
                    }}>
                      <div style={{ fontSize: '48px', marginBottom: '1rem' }}>🏆</div>
                      <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: '#374151' }}>
                        No Badges Yet
                      </h3>
                      <p style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                        Complete challenges and achievements to earn your first badges!
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {badges.map((badge) => (
                        <div
                          key={badge.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '12px',
                            background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
                            borderRadius: 12,
                            border: '2px solid #cbd5e1',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.background = 'linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.background = 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)';
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '24px',
                            marginRight: '12px',
                            flexShrink: 0
                          }}>
                            {badge.imageUrl ? (
                              <img 
                                src={badge.imageUrl} 
                                alt={badge.name}
                                style={{
                                  width: '36px',
                                  height: '36px',
                                  borderRadius: '50%',
                                  objectFit: 'cover'
                                }}
                              />
                            ) : (
                              '🏆'
                            )}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: '14px',
                              fontWeight: 'bold',
                              color: '#1f2937',
                              marginBottom: '2px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {badge.name}
                            </div>
                            <div style={{
                              fontSize: '12px',
                              color: '#6b7280',
                              lineHeight: '1.3',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical'
                            }}>
                              {badge.description}
                            </div>
                            <div style={{
                              fontSize: '10px',
                              color: '#9ca3af',
                              marginTop: '4px',
                              fontStyle: 'italic'
                            }}>
                              {(() => {
                                try {
                                  if (!badge.earnedAt) return 'Unknown date';
                                  // Handle Firestore Timestamp
                                  if (badge.earnedAt.toDate && typeof badge.earnedAt.toDate === 'function') {
                                    return badge.earnedAt.toDate().toLocaleDateString();
                                  }
                                  // Handle regular Date object
                                  if (badge.earnedAt instanceof Date) {
                                    return badge.earnedAt.toLocaleDateString();
                                  }
                                  // Handle string dates
                                  if (typeof badge.earnedAt === 'string') {
                                    return new Date(badge.earnedAt).toLocaleDateString();
                                  }
                                  return 'Unknown date';
                                } catch (error) {
                                  return 'Unknown date';
                                }
                              })()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                <div style={{ color: '#6b7280', fontSize: 14, marginTop: 'auto', textAlign: 'center' }}>
                  Click to return to front
                </div>
              </>
            ) : (
              <>
                <div style={{ 
                  fontSize: 22, 
                  fontWeight: 'bold', 
                  color: '#1f2937', 
                  marginBottom: 16,
                  textAlign: 'center'
                }}>
                  Description
                </div>
                <div style={{
                  background: '#fff',
                  color: '#1f2937',
                  borderRadius: 12,
                  padding: 16,
                  fontSize: 16,
                  minHeight: 80,
                  boxShadow: '0 1px 3px 0 rgba(0,0,0,0.07)',
                  width: '100%',
                  textAlign: 'center',
                  marginBottom: 16,
                }}>
                  {description || 'No description provided.'}
                </div>

                {/* Player's Journey Section */}
                <div style={{
                  fontSize: 22,
                  fontWeight: 'bold',
                  color: '#1f2937',
                  marginBottom: 16,
                  textAlign: 'center'
                }}>
                  {name}'s Journey
                </div>

                {/* Scrollable Journey Content */}
                <div style={{
                  background: '#fff',
                  borderRadius: 12,
                  padding: 12,
                  boxShadow: '0 1px 3px 0 rgba(0,0,0,0.07)',
                  width: '100%',
                  maxHeight: 180,
                  overflowY: 'auto',
                  marginBottom: 16,
                  flex: '1 1 auto',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Hero's Journey Stages */}
                    {Object.entries(journeyStages).map(([key, stage], index) => (
                      <div
                        key={key}
                        onClick={(e) => handleJourneyStageClick(key, e)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '8px 12px',
                          background: key === 'ordinary-world' ? 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)' : '#f3f4f6',
                          borderRadius: 8,
                          border: key === 'ordinary-world' ? '2px solid #3b82f6' : '2px solid transparent',
                          color: key === 'ordinary-world' ? '#1e40af' : '#6b7280',
                          fontWeight: 'bold',
                          fontSize: 14,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => {
                          if (key !== 'ordinary-world') {
                            e.currentTarget.style.background = '#e5e7eb';
                            e.currentTarget.style.color = '#374151';
                          }
                        }}
                        onMouseOut={(e) => {
                          if (key !== 'ordinary-world') {
                            e.currentTarget.style.background = '#f3f4f6';
                            e.currentTarget.style.color = '#6b7280';
                          }
                        }}
                      >
                        <span style={{ marginRight: 8 }}>{stage.icon}</span>
                        <span>{index + 1}. {stage.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div style={{ color: '#6b7280', fontSize: 14, marginTop: 'auto', textAlign: 'center' }}>
                  Click to return to front
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
});

PlayerCard.displayName = 'PlayerCard';

export default PlayerCard;