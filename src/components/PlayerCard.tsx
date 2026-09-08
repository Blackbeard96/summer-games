import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getActivePPBoost, getPPBoostStatus } from '../utils/ppBoost';
import BadgeDetailModal from './BadgeDetailModal';
import {
  POWER_STAT_EVENT_DESCRIPTION,
  type PlayerPowerStatsMap,
  type PowerStatBranch,
} from '../types/playerPowerStats';
import { createDefaultPlayerPowerStats } from '../utils/liveEventPowerStatsService';
import PowerStatProgressBar from './PowerStatProgressBar';

interface PlayerCardProps {
  name: string;
  photoURL: string;
  powerPoints: number;
  truthMetal?: number;
  manifest: string;
  level: number;
  powerLevel?: number | null; // Power Level (PL)
  powerBreakdown?: { base: number; skills: number; artifacts: number; ascension: number; total: number } | null; // Power Level breakdown
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
  /** Saved text per journey stage (from Profile missions); keys e.g. 'ordinary-world', 'call-to-adventure' */
  journeyStageContent?: Record<string, string>;
  squadAbbreviation?: string | null;
  hasSkillTreeAccess?: boolean;
  candyType?: 'on-off' | 'up-down' | 'config'; // RR Candy type the player has
  onSkillTreeToggle?: (isShowing: boolean) => void; // Callback when skill tree visibility changes
  initialSkillTreeMode?: 'in-game' | 'irl'; // Initial mode for skill tree
  /** Live Event Power stats (Physical / Mental / Emotional / Spiritual); defaults if omitted */
  powerStats?: PlayerPowerStatsMap | null;
}

const styleIcons: Record<string, string> = {
  Fire: '🔥',
  Water: '💧',
  Earth: '🪨',
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
  powerLevel = null,
  powerBreakdown = null,
  rarity,
  style,
  description,
  cardBgColor = '#0B1220',
  cardFrameShape = 'circular',
  cardBorderColor = '#D4AF37',
  cardImageBorderColor = '#D4AF37',
  moves = [],
  badges = [],
  xp = 0,
  userId,
  onManifestReselect,
  ordinaryWorld,
  journeyStageContent = {},
  squadAbbreviation,
  hasSkillTreeAccess = false,
  candyType = 'on-off', // Default to on-off for now
  onSkillTreeToggle,
  initialSkillTreeMode = 'in-game',
  powerStats: powerStatsProp = null,
}) => {
  const navigate = useNavigate();
  const [flipped, setFlipped] = useState(false);
  const [showBadges, setShowBadges] = useState(false);
  const [showSkillTree, setShowSkillTree] = useState(false);
  const [showPowerStats, setShowPowerStats] = useState(false);
  const [powerStatHover, setPowerStatHover] = useState<PowerStatBranch | null>(null);
  const [skillTreeMode, setSkillTreeMode] = useState<'in-game' | 'irl'>(initialSkillTreeMode);
  const [selectedJourneyStage, setSelectedJourneyStage] = useState<string | null>(null);
  const [selectedBadge, setSelectedBadge] = useState<{ id: string; name: string; imageUrl?: string; description?: string; earnedAt?: any } | null>(null);
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

  // Notify parent when skill tree visibility changes
  useEffect(() => {
    if (onSkillTreeToggle) {
      onSkillTreeToggle(showSkillTree);
    }
  }, [showSkillTree, onSkillTreeToggle]);

  const MST_GOLD = '#D4AF37';
  const LEGACY_BORDERS = new Set(['#a78bfa', '#A78BFA', '#8b5cf6', '#8B5CF6']);
  const LEGACY_BG = new Set([
    '#e0e7ff',
    '#E0E7FF',
    'linear-gradient(135deg, #e0e7ff 0%, #fbbf24 100%)',
    'linear-gradient(135deg, #E0E7FF 0%, #FBBF24 100%)',
  ]);

  const effectiveBorderColor = useMemo(() => {
    if (!cardBorderColor || LEGACY_BORDERS.has(cardBorderColor)) return MST_GOLD;
    return cardBorderColor;
  }, [cardBorderColor]);

  const effectiveImageBorderColor = useMemo(() => {
    if (!cardImageBorderColor || LEGACY_BORDERS.has(cardImageBorderColor)) return MST_GOLD;
    return cardImageBorderColor;
  }, [cardImageBorderColor]);

  const hasCustomAccent = useMemo(() => {
    if (!cardBgColor) return false;
    if (LEGACY_BG.has(cardBgColor)) return false;
    if (cardBgColor === '#0B1220' || cardBgColor === '#0b1220') return false;
    if (cardBgColor.startsWith('linear') && (cardBgColor.includes('#fbbf24') || cardBgColor.includes('#e0e7ff'))) {
      return false;
    }
    return true;
  }, [cardBgColor]);

  const customAccent = hasCustomAccent
    ? (cardBgColor.startsWith('linear') ? undefined : cardBgColor)
    : undefined;

  const xpProgress = useMemo(() => {
    if (typeof xp === 'number') {
      return getXPProgress(xp);
    }
    return null;
  }, [xp]);

  const powerStats = useMemo(
    () => powerStatsProp ?? createDefaultPlayerPowerStats(),
    [powerStatsProp]
  );

  // Function to get element CSS class for MST semantic colors
  const getElementClass = (elementName: string) => {
    const map: Record<string, string> = {
      Fire: 'mst-element-fire',
      Water: 'mst-element-water',
      Earth: 'mst-element-earth',
      Air: 'mst-element-air',
      Lightning: 'mst-element-lightning',
      Light: 'mst-element-light',
      Shadow: 'mst-element-shadow',
      Metal: 'mst-element-metal',
    };
    return map[elementName] || '';
  };

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
    return manifestColors[manifestName] || '#8B5CF6';
  };

  // Function to get element color (fallback when class not used)
  const getElementColor = (elementName: string) => {
    const elementColors: { [key: string]: string } = {
      'Fire': '#e85d3a',
      'Water': '#3aa8d4', 
      'Air': '#b8c5d6',
      'Earth': '#5a9e5a',
      'Lightning': '#e8c547',
      'Light': '#f5efd8',
      'Shadow': '#7c3aed',
      'Metal': '#c9b896'
    };
    return elementColors[elementName] || '#8e98a8';
  };

  const handleFlip = useCallback(() => {
    if (showBadges) {
      setShowBadges(false);
      setFlipped(false);
    } else if (showSkillTree) {
      setShowSkillTree(false);
      setSkillTreeMode('in-game'); // Reset to in-game mode when closing
      setFlipped(false);
    } else if (showPowerStats) {
      setShowPowerStats(false);
      setFlipped(false);
    } else {
      setFlipped(f => !f);
    }
  }, [showBadges, showSkillTree, showPowerStats]);

  const handleBadgeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowBadges(true);
    setShowSkillTree(false);
    setShowPowerStats(false);
    setFlipped(true);
  }, []);

  const handleSkillTreeClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowSkillTree(true);
    setShowBadges(false);
    setShowPowerStats(false);
    setSkillTreeMode('in-game'); // Reset to in-game mode when opening
    setFlipped(true);
  }, []);

  const handlePowerStatsClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPowerStats(true);
    setShowBadges(false);
    setShowSkillTree(false);
    setSelectedJourneyStage(null);
    setFlipped(true);
  }, []);

  const handleJourneyStageClick = useCallback((stage: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedJourneyStage(stage);
    setShowBadges(false);
    setShowPowerStats(false);
    setFlipped(true);
  }, []);

  const handleReturnToJourneyList = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedJourneyStage(null);
  }, []);

  // Journey stage data - merge saved content from Profile missions (journeyStageContent) with defaults
  const getStageText = (stageId: string, fallback: string) =>
    (journeyStageContent[stageId] || (stageId === 'ordinary-world' ? ordinaryWorld : null) || '').trim() || fallback;
  const journeyStages = {
    'ordinary-world': {
      title: 'Ordinary World',
      icon: '🌍',
      description: getStageText('ordinary-world', 'You haven\'t written your Ordinary World reflection yet. Complete the Chapter 1 challenge to add your personal story!'),
      content: getStageText('ordinary-world', 'This is your personal reflection for the Ordinary World stage of your hero\'s journey. Here you describe your life before the call to adventure - your familiar routines, your world as you knew it, and the place where your transformation began.')
    },
    'call-to-adventure': {
      title: 'Call to Adventure',
      icon: '📢',
      description: getStageText('call-to-adventure', 'You haven\'t written your Call to Adventure reflection yet. Complete more challenges to unlock this stage!'),
      content: getStageText('call-to-adventure', 'This is your personal reflection for the Call to Adventure stage. Here you describe the moment when everything changed - the call that pulled you from your ordinary world into something extraordinary.')
    },
    'meeting-mentor': {
      title: 'Meeting the Mentor',
      icon: '🧙',
      description: getStageText('meeting-mentor', 'You haven\'t written your Meeting the Mentor reflection yet. Complete more challenges to unlock this stage!'),
      content: getStageText('meeting-mentor', 'This is your personal reflection for the Meeting the Mentor stage. Here you describe the wise guide who helped you understand your new world and prepared you for the challenges ahead.')
    },
    'tests-allies-enemies': {
      title: 'Tests, Allies, Enemies',
      icon: '⚔️',
      description: getStageText('tests-allies-enemies', 'You haven\'t written your Tests, Allies, Enemies reflection yet. Complete more challenges to unlock this stage!'),
      content: getStageText('tests-allies-enemies', 'This is your personal reflection for the Tests, Allies, Enemies stage. Here you describe the trials that tested your resolve, the allies who joined your cause, and the enemies who stood in your way.')
    },
    'approaching-cave': {
      title: 'Approaching the Cave',
      icon: '🏰',
      description: getStageText('approaching-cave', 'You haven\'t written your Approaching the Cave reflection yet. Complete more challenges to unlock this stage!'),
      content: getStageText('approaching-cave', 'This is your personal reflection for the Approaching the Cave stage. Here you describe the approach to your greatest challenge - the moment when you stepped into the unknown.')
    },
    'ordeal': {
      title: 'The Ordeal',
      icon: '🔥',
      description: getStageText('ordeal', 'You haven\'t written your Ordeal reflection yet. Complete more challenges to unlock this stage!'),
      content: getStageText('ordeal', 'This is your personal reflection for the Ordeal stage. Here you describe your greatest trial - the moment when you faced your deepest fears and emerged transformed.')
    },
    'road-back': {
      title: 'The Road Back',
      icon: '🏃',
      description: getStageText('road-back', 'You haven\'t written your Road Back reflection yet. Complete more challenges to unlock this stage!'),
      content: getStageText('road-back', 'This is your personal reflection for the Road Back stage. Here you describe the journey home - carrying your new wisdom and power back to your ordinary world.')
    },
    'resurrection': {
      title: 'Resurrection',
      icon: '⚡',
      description: getStageText('resurrection', 'You haven\'t written your Resurrection reflection yet. Complete more challenges to unlock this stage!'),
      content: getStageText('resurrection', 'This is your personal reflection for the Resurrection stage. Here you describe your final transformation - the moment when you became truly who you were meant to be.')
    },
    'return-elixir': {
      title: 'Return with Elixir',
      icon: '🏆',
      description: getStageText('return-elixir', 'You haven\'t written your Return with Elixir reflection yet. Complete more challenges to unlock this stage!'),
      content: getStageText('return-elixir', 'This is your personal reflection for the Return with Elixir stage. Here you describe how you brought your transformation back to help others - sharing the gift of your journey.')
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
        className="mst-power-card"
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
          className={`mst-power-card-inner${flipped ? ' is-flipped' : ''}`}
        >
          {/* Front */}
          <div
            className={`mst-power-card-face mst-power-card-face--front${customAccent ? ' has-custom-accent' : ''}`}
            style={{
              borderColor: effectiveBorderColor,
              ...(customAccent
                ? ({ ['--mst-power-card-accent' as string]: customAccent } as React.CSSProperties)
                : {}),
            }}
          >
            {/* Top Row: Name, PP, TM, Level all aligned */}
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', marginBottom: 4 }}>
              {/* First row: Name, PP, TM, Lv badges */}
              <div style={{ display: 'flex', width: '100%', alignItems: 'center', marginBottom: 4 }}>
                {/* Player Name - full width */}
                <div className="mst-power-name">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  {ppBoostStatus.isActive && (
                    <span 
                      style={{ 
                        fontSize: '16px',
                        color: 'var(--mst-gold)',
                        fontWeight: 'bold',
                        textShadow: '0 0 4px rgba(245, 158, 11, 0.5)',
                        animation: 'pulse 2s infinite',
                        flexShrink: 0
                      }}
                      title={`⚡ Double PP Boost Active! (${ppBoostStatus.timeRemaining} remaining)`}
                    >
                      ⚡
                    </span>
                  )}
                </div>
                {/* PP, TM, Lv badges - on same row as name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0 }}>
                  <span 
                    className="mst-power-pill mst-power-pill--pp"
                    title="Power Points"
                  >
                    PP: {powerPoints}
                    {ppBoostStatus.isActive && (
                      <span 
                        style={{ 
                          fontSize: '10px',
                          color: 'var(--mst-gold-bright)',
                          fontWeight: 'bold',
                          animation: 'pulse 2s infinite'
                        }}
                        title={`⚡ Double PP Boost Active! (${ppBoostStatus.timeRemaining} remaining)`}
                      >
                        ×2
                      </span>
                    )}
                  </span>
                  <span 
                    className="mst-power-pill mst-power-pill--tm"
                    title="Truth Metal Shards"
                  >
                    TM: {truthMetal}
                  </span>
                  {/* Level badge */}
                  <span className="mst-power-pill mst-power-pill--level">Lv. {level}</span>
                </div>
              </div>
              {/* Second row: Rarity stars, Squad tag, and Power Level (aligned with PP above) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -4 }}>
                {/* Rarity stars */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  {Array.from({ length: rarity }).map((_, i) => (
                    <span key={i} className="mst-power-rarity">★</span>
                  ))}
                </div>
                {/* Squad tag */}
                {squadAbbreviation && (
                  <span className="mst-power-squad">
                    [{squadAbbreviation}]
                  </span>
                )}
                {/* Power Level badge - aligned with PP above (same column position) */}
                {powerLevel !== null && (
                  <span 
                    className="mst-power-pill mst-power-pill--pl"
                    title={powerBreakdown ? `Base: ${powerBreakdown.base} | Skills: ${powerBreakdown.skills} | Artifacts: ${powerBreakdown.artifacts} | Ascension: ${powerBreakdown.ascension}` : 'Power Level'}
                  >
                    ⚡ PL: {powerLevel}
                  </span>
                )}
              </div>
            </div>

            {/* Level Progress Bar */}
            {xpProgress && (
              <div style={{ margin: '8px 0 12px 0', width: '100%' }}>
                <div className="mst-power-xp-label">
                  Level Progress: {xpProgress.currentLevelXP} / {Math.round(xpProgress.nextLevelXP)} XP
                </div>
                <div className="mst-power-xp-track">
                  <div className="mst-power-xp-fill" style={{ width: `${xpProgress.percent}%` }} />
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
                  className="mst-power-avatar"
                  style={{
                    borderRadius: cardFrameShape === 'circular' ? '50%' : '0.75rem',
                    border: `3px solid ${effectiveImageBorderColor}`,
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
                className="mst-power-avatar-fallback"
                style={{
                  borderRadius: cardFrameShape === 'circular' ? '50%' : '0.75rem',
                  border: `3px solid ${effectiveImageBorderColor}`,
                  display: (photoURL && photoURL.trim() !== '') ? 'none' : 'flex',
                }}
              >
                {name.charAt(0).toUpperCase()}
              </div>
            </div>

            {/* Manifest and Element */}
            <div className="mst-power-meta-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{manifestIcons[manifest] || '✨'}</span>
                <span className="mst-power-manifest" style={{ color: getManifestColor(manifest) || undefined }}>Manifest: {manifest}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{styleIcons[style] || '🔮'}</span>
                <span className={`mst-power-element ${getElementClass(style)}`} style={!getElementClass(style) ? { color: getElementColor(style) } : undefined}>Element: {style}</span>
              </div>
            </div>

            {/* Divider */}
            <div className="mst-power-divider" />

            {/* Badges Button */}
            <div className="mst-power-action-wrap">
              <button
                onClick={handleBadgeClick}
                className="mst-power-action mst-power-action--badges"
                type="button"
              >
                <span>🏆</span>
                Badges ({badges.length})
              </button>
            </div>

            {/* Power stats (Live Events) */}
            <div className="mst-power-action-wrap">
              <button
                type="button"
                onClick={handlePowerStatsClick}
                className="mst-power-action mst-power-action--stats"
              >
                <span>📊</span>
                Player Stats
              </button>
            </div>

            {/* Skill Tree Button - Only show if Chapter 2-4 is completed */}
            {hasSkillTreeAccess && (
              <div className="mst-power-action-wrap">
                <button
                  onClick={handleSkillTreeClick}
                  className="mst-power-action mst-power-action--tree"
                  type="button"
                >
                  <span>🌳</span>
                  Skill Tree
                </button>
              </div>
            )}

            <div className="mst-power-footer-motto" aria-hidden="true">
              Ignite Your Purpose
            </div>
            
          </div>

          {/* Back */}
          <div
            className="mst-power-card-face mst-power-card-face--back"
            style={{
              borderColor: effectiveBorderColor,
            }}
          >
            {/* Journey Stage Detail View */}
            {selectedJourneyStage ? (
              <>
                <div className="mst-power-back-title">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>{journeyStages[selectedJourneyStage as keyof typeof journeyStages]?.icon}</span>
                    {journeyStages[selectedJourneyStage as keyof typeof journeyStages]?.title}
                  </span>
                  <button
                    onClick={handleReturnToJourneyList}
                    className="mst-power-back-close"
                  >
                    ←
                  </button>
                </div>
                
                <div className="mst-power-back-panel" style={{ maxHeight: 300, padding: 16 }}>
                  {(() => {
                    const stage = journeyStages[selectedJourneyStage as keyof typeof journeyStages];
                    const desc = stage?.description ?? '';
                    const content = stage?.content ?? '';
                    const isSameText = desc === content;
                    return (
                      <>
                        <div style={{
                          fontSize: 16,
                          color: 'var(--mst-text-primary)',
                          lineHeight: '1.6',
                          marginBottom: isSameText ? 0 : 16,
                          fontStyle: 'italic'
                        }}>
                          "{desc}"
                        </div>
                        {!isSameText && (
                          <div style={{
                            fontSize: 14,
                            color: 'var(--mst-text-muted)',
                            lineHeight: '1.5'
                          }}>
                            {content}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
                
                <div className="mst-power-back-hint">
                  Click to return to journey list
                </div>
              </>
            ) : showBadges ? (
              <>
                <div className="mst-power-back-title">
                  <span>🏆 Your Badges</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowBadges(false);
                      setFlipped(false);
                    }}
                    className="mst-power-back-close"
                  >
                    ←
                  </button>
                </div>
                
                <div className="mst-power-back-panel" style={{ maxHeight: 320 }}>
                  {badges.length === 0 ? (
                    <div className="mst-power-empty">
                      <div style={{ fontSize: '48px', marginBottom: '1rem' }}>🏆</div>
                      <h3>
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
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBadge(badge);
                          }}
                          className="mst-power-badge-item"
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
                            <div className="mst-power-badge-name" style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {badge.name}
                            </div>
                            <div className="mst-power-badge-desc" style={{
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
                
                <div className="mst-power-back-hint">
                  Click to return to front
                </div>
              </>
            ) : showSkillTree ? (
              <>
                <div className="mst-power-back-title">
                  <span>🌳 Skill Tree</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSkillTree(false);
                      setSkillTreeMode('in-game'); // Reset to in-game mode when closing
                      setFlipped(false);
                    }}
                    className="mst-power-back-close"
                  >
                    ×
                  </button>
                </div>

                {/* Skill Tree Mode Tabs */}
                <div className="mst-power-tabs">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSkillTreeMode('in-game');
                    }}
                    className={`mst-power-tab${skillTreeMode === 'in-game' ? ' is-active' : ''}`}
                  >
                    🎮 In Game
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSkillTreeMode('irl');
                    }}
                    className={`mst-power-tab${skillTreeMode === 'irl' ? ' is-active is-active--irl' : ''}`}
                  >
                    🌍 IRL
                  </button>
                </div>

                <div className="mst-power-back-panel" style={{ minHeight: 0, padding: 16, marginBottom: 12 }}>
                  {candyType === 'on-off' ? (
                    <div>
                      <div style={{
                        fontSize: 18,
                        fontWeight: 'bold',
                        color: 'var(--mst-text-primary)',
                        marginBottom: 16,
                        textAlign: 'center'
                      }}>
                        Off/On Power Skill Tree - {skillTreeMode === 'in-game' ? 'In Game' : 'IRL'}
                      </div>
                      
                      {skillTreeMode === 'in-game' ? (
                        <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 16
                      }}>
                        {/* Root Node */}
                        <div style={{
                          padding: '12px',
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          borderRadius: 8,
                          border: '2px solid #047857',
                          textAlign: 'center',
                          color: 'white',
                          fontWeight: 'bold'
                        }}>
                          <div style={{ fontSize: 20, marginBottom: 4 }}>⚡</div>
                          <div>Off/On Power</div>
                          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>Unlocked</div>
                        </div>

                        {/* Branch 1 - Shield Toggle (Unlocked) */}
                        <div style={{
                          padding: '12px',
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          borderRadius: 8,
                          border: '2px solid #047857',
                          textAlign: 'center',
                          color: 'white',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'scale(1.02)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                        >
                          <div style={{ fontSize: 18, marginBottom: 4 }}>🛡️</div>
                          <div>Turn Shields On/Off</div>
                          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>Level 1 - Remove 25% of opponent's shields</div>
                          <div style={{ fontSize: 10, opacity: 0.8, marginTop: 4, fontStyle: 'italic' }}>Unlocked • Can be leveled up</div>
                        </div>

                        {/* Branch 2 - Turn Shields On (Unlocked) */}
                        <div style={{
                          padding: '12px',
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          borderRadius: 8,
                          border: '2px solid #047857',
                          textAlign: 'center',
                          color: 'white',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.transform = 'scale(1.02)';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.transform = 'scale(1)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                        >
                          <div style={{ fontSize: 18, marginBottom: 4 }}>🔋</div>
                          <div>Turn Shields On</div>
                          <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>Restore 50% of max shields</div>
                          <div style={{ fontSize: 10, opacity: 0.8, marginTop: 4, fontStyle: 'italic' }}>Unlocked</div>
                        </div>

                        {/* Branch 3 */}
                        <div style={{
                          padding: '12px',
                          background: 'rgba(17, 24, 39, 0.85)',
                          borderRadius: 8,
                          border: '1px solid var(--mst-border)',
                          textAlign: 'center'
                        }}>
                          <div style={{ fontSize: 18, marginBottom: 4 }}>⚙️</div>
                          <div style={{ fontWeight: 'bold', color: 'var(--mst-text-primary)' }}>Enhanced Control</div>
                          <div style={{ fontSize: 12, color: 'var(--mst-text-muted)', marginTop: 4 }}>Level 2 - Improved power management</div>
                          <div style={{ fontSize: 10, color: 'var(--mst-text-muted)', marginTop: 4, fontStyle: 'italic' }}>Requires: Power Toggle</div>
                        </div>

                        {/* Branch 3 */}
                        <div style={{
                          padding: '12px',
                          background: 'rgba(17, 24, 39, 0.85)',
                          borderRadius: 8,
                          border: '1px solid var(--mst-border)',
                          textAlign: 'center'
                        }}>
                          <div style={{ fontSize: 18, marginBottom: 4 }}>🌟</div>
                          <div style={{ fontWeight: 'bold', color: 'var(--mst-text-primary)' }}>Master Switch</div>
                          <div style={{ fontSize: 12, color: 'var(--mst-text-muted)', marginTop: 4 }}>Level 3 - Ultimate power control</div>
                          <div style={{ fontSize: 10, color: 'var(--mst-text-muted)', marginTop: 4, fontStyle: 'italic' }}>Requires: Enhanced Control</div>
                        </div>
                      </div>
                      ) : (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 16
                        }}>
                          {/* Root Node */}
                          <div style={{
                            padding: '12px',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            borderRadius: 8,
                            border: '2px solid #047857',
                            textAlign: 'center',
                            color: 'white',
                            fontWeight: 'bold'
                          }}>
                            <div style={{ fontSize: 20, marginBottom: 4 }}>🧠</div>
                            <div>Off/On Power (IRL)</div>
                            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>Unlocked</div>
                          </div>

                          {/* Branch 1 - IRL - Turn on Focus (Unlocked) */}
                          <div style={{
                            padding: '12px',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            borderRadius: 8,
                            border: '2px solid #047857',
                            textAlign: 'center',
                            color: 'white',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseOver={(e) => {
                            e.currentTarget.style.transform = 'scale(1.02)';
                            e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
                          }}
                          onMouseOut={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                          >
                            <div style={{ fontSize: 18, marginBottom: 4 }}>🎯</div>
                            <div>Turn on Focus</div>
                            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>Doubles your PP when activated</div>
                            <div style={{ fontSize: 10, opacity: 0.8, marginTop: 4, fontStyle: 'italic' }}>Unlocked</div>
                          </div>

                          {/* Branch 2 - IRL */}
                          <div style={{
                            padding: '12px',
                            background: 'rgba(17, 24, 39, 0.85)',
                            borderRadius: 8,
                            border: '1px solid var(--mst-border)',
                            textAlign: 'center'
                          }}>
                            <div style={{ fontSize: 18, marginBottom: 4 }}>🧠</div>
                            <div style={{ fontWeight: 'bold', color: 'var(--mst-text-primary)' }}>Mindful Control</div>
                            <div style={{ fontSize: 12, color: 'var(--mst-text-muted)', marginTop: 4 }}>Level 2 - Improved real-world awareness management</div>
                            <div style={{ fontSize: 10, color: 'var(--mst-text-muted)', marginTop: 4, fontStyle: 'italic' }}>Requires: Awareness Toggle</div>
                          </div>

                          {/* Branch 3 - IRL */}
                          <div style={{
                            padding: '12px',
                            background: 'rgba(17, 24, 39, 0.85)',
                            borderRadius: 8,
                            border: '1px solid var(--mst-border)',
                            textAlign: 'center'
                          }}>
                            <div style={{ fontSize: 18, marginBottom: 4 }}>✨</div>
                            <div style={{ fontWeight: 'bold', color: 'var(--mst-text-primary)' }}>Reality Master</div>
                            <div style={{ fontSize: 12, color: 'var(--mst-text-muted)', marginTop: 4 }}>Level 3 - Ultimate real-world power control</div>
                            <div style={{ fontSize: 10, color: 'var(--mst-text-muted)', marginTop: 4, fontStyle: 'italic' }}>Requires: Mindful Control</div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : candyType === 'up-down' ? (
                    <div className="mst-power-empty" style={{ padding: '2rem' }}>
                      <div style={{ fontSize: 48, marginBottom: '1rem' }}>📈</div>
                      <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--mst-text-secondary)' }}>
                        Up/Down Power Skill Tree
                      </h3>
                      <p style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                        Coming soon! The Up/Down power skill tree will be available here.
                      </p>
                    </div>
                  ) : (
                    <div className="mst-power-empty" style={{ padding: '2rem' }}>
                      <div style={{ fontSize: 48, marginBottom: '1rem' }}>⚙️</div>
                      <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem', color: 'var(--mst-text-secondary)' }}>
                        Config Power Skill Tree
                      </h3>
                      <p style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                        Coming soon! The Config power skill tree will be available here.
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="mst-power-back-hint">
                  Click to return to front
                </div>
              </>
            ) : showPowerStats ? (
              <>
                <div className="mst-power-back-title" style={{ marginBottom: 12, fontSize: 20 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>📊</span>
                    Power stats
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowPowerStats(false);
                      setFlipped(false);
                    }}
                    className="mst-power-back-close"
                  >
                    ←
                  </button>
                </div>
                <div className="mst-power-back-panel" style={{ maxHeight: 380, overflow: 'visible' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 10,
                    }}
                  >
                    {(
                      [
                        { key: 'physical' as const, label: 'Physical', icon: '💪' },
                        { key: 'mental' as const, label: 'Mental', icon: '🧠' },
                        { key: 'emotional' as const, label: 'Emotional', icon: '💜' },
                        { key: 'spiritual' as const, label: 'Spiritual', icon: '✨' },
                      ] as const
                    ).map(({ key, label, icon }) => {
                      const st = powerStats[key];
                      const hovered = powerStatHover === key;
                      return (
                        <div
                          key={key}
                          role="group"
                          aria-label={label}
                          onMouseEnter={() => setPowerStatHover(key)}
                          onMouseLeave={() => setPowerStatHover(null)}
                          className={`mst-power-stat-tile${hovered ? ' is-hovered' : ''}`}
                        >
                          <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--mst-text-muted)' }}>{label}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--mst-gold)', marginTop: 4 }}>
                            Lv {st.level}
                          </div>
                          <PowerStatProgressBar branch={key} st={st} height={9} style={{ marginTop: 8 }} />
                          <div style={{ fontSize: 10, color: 'var(--mst-text-muted)', marginTop: 6 }}>
                            {st.xp} / {st.xpToNextLevel} XP
                          </div>
                          <div style={{ fontSize: 9, color: 'var(--mst-text-muted)', marginTop: 4 }}>Total {st.totalEarned}</div>
                          <div
                            style={{
                              marginTop: 'auto',
                              paddingTop: 6,
                              minHeight: 40,
                              fontSize: 9,
                              lineHeight: 1.35,
                              color: 'var(--mst-text-secondary)',
                              textAlign: 'center',
                              opacity: hovered ? 1 : 0,
                              transition: 'opacity 0.15s ease',
                            }}
                          >
                            {POWER_STAT_EVENT_DESCRIPTION[key]}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mst-power-back-hint">
                  Click card or ← to return
                </div>
              </>
            ) : (
              <>
                <div className="mst-power-back-title" style={{ justifyContent: 'center', marginBottom: 12 }}>
                  Description
                </div>
                <div className="mst-power-back-panel" style={{ color: 'var(--mst-text-primary)', fontSize: 15, minHeight: 80, textAlign: 'center', padding: 16 }}>
                  {description || 'No description provided.'}
                </div>

                {/* Player's Journey Section */}
                <div className="mst-power-back-title" style={{ justifyContent: 'center', marginBottom: 12 }}>
                  {name}'s Journey
                </div>

                {/* Scrollable Journey Content */}
                <div className="mst-power-back-panel" style={{ maxHeight: 180 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Hero's Journey Stages */}
                    {Object.entries(journeyStages).map(([key, stage], index) => (
                      <div
                        key={key}
                        onClick={(e) => handleJourneyStageClick(key, e)}
                        className={`mst-power-journey-item${key === 'ordinary-world' ? ' is-active' : ''}`}
                      >
                        <span style={{ marginRight: 8 }}>{stage.icon}</span>
                        <span>{index + 1}. {stage.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="mst-power-back-hint">
                  Click to return to front
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Badge Detail Modal */}
      <BadgeDetailModal
        isOpen={!!selectedBadge}
        onClose={() => setSelectedBadge(null)}
        badge={selectedBadge}
      />
    </>
  );
});

PlayerCard.displayName = 'PlayerCard';

export default PlayerCard;