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
  ordinaryWorld?: string; // <-- Add ordinary world description
  journeyData?: {
    ordinaryWorld?: string;
    callToAdventure?: string;
    meetingMentor?: string;
    testsAlliesEnemies?: string;
    approachingCave?: string;
    ordeal?: string;
    roadBack?: string;
    resurrection?: string;
    returnWithElixir?: string;
  };
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
  ordinaryWorld,
  journeyData,
}) => {
  const [flipped, setFlipped] = useState(false);
  const [showOrdinaryWorldModal, setShowOrdinaryWorldModal] = useState(false);
  const [showJourneyModal, setShowJourneyModal] = useState(false);
  const [selectedJourneyStage, setSelectedJourneyStage] = useState<{ title: string; content: string; stage: string } | null>(null);
  const [activeJourneyTab, setActiveJourneyTab] = useState<string | null>(null);
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

  const handleJourneyStageClick = useCallback((stage: string, title: string, content: string | undefined, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation(); // Prevent card flip
    }
    setActiveJourneyTab(stage);
    setFlipped(true); // Flip to back to show journey content
  }, []);


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
            border: '4px solid #4f46e5',
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
          {/* Journey Content or Default Description */}
          {activeJourneyTab ? (
            <>
              <div style={{ 
                fontSize: 22, 
                fontWeight: 'bold', 
                color: '#1f2937', 
                marginBottom: 16,
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%'
              }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveJourneyTab(null);
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.2)',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: '#1f2937',
                    fontSize: '18px'
                  }}
                >
                  ←
                </button>
                <span>
                  {activeJourneyTab === 'ordinaryWorld' && '🌍 Ordinary World'}
                  {activeJourneyTab === 'callToAdventure' && '📜 Call to Adventure'}
                  {activeJourneyTab === 'meetingMentor' && '👨‍🏫 Meeting the Mentor'}
                  {activeJourneyTab === 'testsAlliesEnemies' && '⚔️ Tests, Allies, Enemies'}
                  {activeJourneyTab === 'approachingCave' && '🏔️ Approaching the Inmost Cave'}
                  {activeJourneyTab === 'ordeal' && '🔥 The Ordeal'}
                  {activeJourneyTab === 'roadBack' && '🏆 The Reward'}
                  {activeJourneyTab === 'resurrection' && '💫 Resurrection / Apotheosis'}
                  {activeJourneyTab === 'returnWithElixir' && '🌟 Return w/ the Elixir'}
                </span>
                <div style={{ width: '32px' }}></div>
              </div>
              <div style={{
                background: 'rgba(255, 255, 255, 0.95)',
                color: '#1f2937',
                borderRadius: 12,
                padding: 16,
                fontSize: 14,
                maxHeight: 150,
                overflowY: 'auto',
                boxShadow: '0 4px 12px 0 rgba(0,0,0,0.1)',
                width: '100%',
                textAlign: 'left',
                lineHeight: 1.5,
                fontStyle: 'italic'
              }}>
                {activeJourneyTab === 'ordinaryWorld' && (journeyData?.ordinaryWorld || ordinaryWorld || "Your ordinary world is where your journey begins. This is your everyday life before the call to adventure changes everything. Complete the Truth Metal Choice challenge to define what your ordinary world looks like.")}
                {activeJourneyTab === 'callToAdventure' && (journeyData?.callToAdventure || "The call to adventure is the moment when your ordinary world is disrupted by something extraordinary. This could be receiving a mysterious letter, meeting a mentor, or discovering your true potential. Complete the Get Letter challenge to begin your adventure.")}
                {activeJourneyTab === 'meetingMentor' && (journeyData?.meetingMentor || "Meeting the mentor is when you encounter someone who provides guidance, training, or wisdom to help you on your journey. This could be a teacher, a wise elder, or even a fellow traveler with experience. Complete team formation challenges to meet your mentors.")}
                {activeJourneyTab === 'testsAlliesEnemies' && (journeyData?.testsAlliesEnemies || "This is where you face trials, make allies, and encounter enemies. You'll be tested in various ways, form important relationships, and confront those who stand in your way. Complete team formation and rival selection challenges to navigate this stage.")}
                {activeJourneyTab === 'approachingCave' && (journeyData?.approachingCave || "Approaching the inmost cave is when you prepare to face your greatest fear or challenge. This is the point of no return where you must summon all your courage and resources. Complete solo trial challenges to prepare for your greatest test.")}
                {activeJourneyTab === 'ordeal' && (journeyData?.ordeal || "The ordeal is your greatest challenge yet - the moment when you face your deepest fear or most difficult trial. This is where you prove yourself and gain the strength to continue. Complete team ordeal challenges to overcome this crucial stage.")}
                {activeJourneyTab === 'roadBack' && (journeyData?.roadBack || "The road back is when you begin your return journey, but now you're changed. You may face new challenges or resistance from those who don't understand your transformation. Complete world reaction challenges to navigate your return.")}
                {activeJourneyTab === 'resurrection' && (journeyData?.resurrection || "Resurrection is your final test - a moment of death and rebirth where you must prove you've truly changed. This is where you face a version of yourself who never took the journey and realize how far you've come. Complete death sequence challenges to experience resurrection.")}
                {activeJourneyTab === 'returnWithElixir' && (journeyData?.returnWithElixir || "Return with the elixir is when you come back to your ordinary world, but now you're transformed. You bring back wisdom, healing, or knowledge that can help others. This is where you become a mentor yourself. Complete mentorship challenges to return with your elixir.")}
              </div>
              <div style={{ 
                marginTop: '12px',
                fontSize: '12px',
                color: '#6b7280',
                textAlign: 'center',
                fontStyle: 'italic'
              }}>
                This is your personal reflection for this stage of your hero's journey
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
                minHeight: 120,
                boxShadow: '0 1px 3px 0 rgba(0,0,0,0.07)',
                width: '100%',
                textAlign: 'center',
                marginBottom: 16,
              }}>{description || 'No description provided.'}</div>
            </>
          )}
          
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
              <div 
                onClick={(e) => handleJourneyStageClick('ordinaryWorld', 'Ordinary World', journeyData?.ordinaryWorld || ordinaryWorld, e)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '6px 10px',
                  background: (journeyData?.ordinaryWorld || ordinaryWorld) ? '#f0f9ff' : '#f3f4f6',
                  borderRadius: 8,
                  border: (journeyData?.ordinaryWorld || ordinaryWorld) ? '2px solid #0ea5e9' : '2px solid #e5e7eb',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = (journeyData?.ordinaryWorld || ordinaryWorld) ? '#e0f2fe' : '#e5e7eb';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = (journeyData?.ordinaryWorld || ordinaryWorld) ? '#f0f9ff' : '#f3f4f6';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ 
                  width: 20, 
                  height: 20, 
                  borderRadius: '50%', 
                  background: (journeyData?.ordinaryWorld || ordinaryWorld) ? '#0ea5e9' : '#6b7280',
                  marginRight: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 'bold'
                }}>1</div>
                <div style={{ 
                  fontSize: 14, 
                  fontWeight: '500', 
                  color: (journeyData?.ordinaryWorld || ordinaryWorld) ? '#0369a1' : '#374151',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  Ordinary World
                  {(journeyData?.ordinaryWorld || ordinaryWorld) && <span style={{ fontSize: '12px' }}>📖</span>}
                </div>
              </div>
              
              <div 
                onClick={(e) => handleJourneyStageClick('callToAdventure', 'Call to Adventure', journeyData?.callToAdventure, e)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '6px 10px',
                  background: journeyData?.callToAdventure ? '#fef3c7' : '#f3f4f6',
                  borderRadius: 8,
                  border: journeyData?.callToAdventure ? '2px solid #f59e0b' : '2px solid #e5e7eb',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = journeyData?.callToAdventure ? '#fde68a' : '#e5e7eb';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = journeyData?.callToAdventure ? '#fef3c7' : '#f3f4f6';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ 
                  width: 20, 
                  height: 20, 
                  borderRadius: '50%', 
                  background: journeyData?.callToAdventure ? '#f59e0b' : '#6b7280',
                  marginRight: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 'bold'
                }}>2</div>
                <div style={{ 
                  fontSize: 14, 
                  fontWeight: '500', 
                  color: journeyData?.callToAdventure ? '#92400e' : '#374151',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  Call to Adventure
                  {journeyData?.callToAdventure && <span style={{ fontSize: '12px' }}>📖</span>}
                </div>
              </div>
              
              <div 
                onClick={(e) => handleJourneyStageClick('meetingMentor', 'Meeting the Mentor', journeyData?.meetingMentor, e)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '6px 10px',
                  background: journeyData?.meetingMentor ? '#f3e8ff' : '#f3f4f6',
                  borderRadius: 8,
                  border: journeyData?.meetingMentor ? '2px solid #8b5cf6' : '2px solid #e5e7eb',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = journeyData?.meetingMentor ? '#e9d5ff' : '#e5e7eb';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = journeyData?.meetingMentor ? '#f3e8ff' : '#f3f4f6';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ 
                  width: 20, 
                  height: 20, 
                  borderRadius: '50%', 
                  background: journeyData?.meetingMentor ? '#8b5cf6' : '#6b7280',
                  marginRight: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 'bold'
                }}>3</div>
                <div style={{ 
                  fontSize: 14, 
                  fontWeight: '500', 
                  color: journeyData?.meetingMentor ? '#7c3aed' : '#374151',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  Meeting the Mentor
                  {journeyData?.meetingMentor && <span style={{ fontSize: '12px' }}>📖</span>}
                </div>
              </div>
              
              <div 
                onClick={(e) => handleJourneyStageClick('testsAlliesEnemies', 'Tests, Allies, Enemies', journeyData?.testsAlliesEnemies, e)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '6px 10px',
                  background: journeyData?.testsAlliesEnemies ? '#fef2f2' : '#f3f4f6',
                  borderRadius: 8,
                  border: journeyData?.testsAlliesEnemies ? '2px solid #ef4444' : '2px solid #e5e7eb',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = journeyData?.testsAlliesEnemies ? '#fecaca' : '#e5e7eb';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = journeyData?.testsAlliesEnemies ? '#fef2f2' : '#f3f4f6';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ 
                  width: 20, 
                  height: 20, 
                  borderRadius: '50%', 
                  background: journeyData?.testsAlliesEnemies ? '#ef4444' : '#6b7280',
                  marginRight: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 'bold'
                }}>4</div>
                <div style={{ 
                  fontSize: 14, 
                  fontWeight: '500', 
                  color: journeyData?.testsAlliesEnemies ? '#dc2626' : '#374151',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  Tests, Allies, Enemies
                  {journeyData?.testsAlliesEnemies && <span style={{ fontSize: '12px' }}>📖</span>}
                </div>
              </div>
              
              <div 
                onClick={(e) => handleJourneyStageClick('approachingCave', 'Approaching the Inmost Cave', journeyData?.approachingCave, e)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '6px 10px',
                  background: journeyData?.approachingCave ? '#f0fdf4' : '#f3f4f6',
                  borderRadius: 8,
                  border: journeyData?.approachingCave ? '2px solid #22c55e' : '2px solid #e5e7eb',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = journeyData?.approachingCave ? '#dcfce7' : '#e5e7eb';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = journeyData?.approachingCave ? '#f0fdf4' : '#f3f4f6';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ 
                  width: 20, 
                  height: 20, 
                  borderRadius: '50%', 
                  background: journeyData?.approachingCave ? '#22c55e' : '#6b7280',
                  marginRight: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 'bold'
                }}>5</div>
                <div style={{ 
                  fontSize: 14, 
                  fontWeight: '500', 
                  color: journeyData?.approachingCave ? '#16a34a' : '#374151',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  Approaching the Inmost Cave
                  {journeyData?.approachingCave && <span style={{ fontSize: '12px' }}>📖</span>}
                </div>
              </div>
              
              <div 
                onClick={(e) => handleJourneyStageClick('ordeal', 'The Ordeal', journeyData?.ordeal, e)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '6px 10px',
                  background: journeyData?.ordeal ? '#fef7ff' : '#f3f4f6',
                  borderRadius: 8,
                  border: journeyData?.ordeal ? '2px solid #a855f7' : '2px solid #e5e7eb',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = journeyData?.ordeal ? '#f3e8ff' : '#e5e7eb';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = journeyData?.ordeal ? '#fef7ff' : '#f3f4f6';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ 
                  width: 20, 
                  height: 20, 
                  borderRadius: '50%', 
                  background: journeyData?.ordeal ? '#a855f7' : '#6b7280',
                  marginRight: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 'bold'
                }}>6</div>
                <div style={{ 
                  fontSize: 14, 
                  fontWeight: '500', 
                  color: journeyData?.ordeal ? '#9333ea' : '#374151',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  The Ordeal
                  {journeyData?.ordeal && <span style={{ fontSize: '12px' }}>📖</span>}
                </div>
              </div>
              
              <div 
                onClick={(e) => handleJourneyStageClick('roadBack', 'The Reward', journeyData?.roadBack, e)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '6px 10px',
                  background: journeyData?.roadBack ? '#fffbeb' : '#f3f4f6',
                  borderRadius: 8,
                  border: journeyData?.roadBack ? '2px solid #f97316' : '2px solid #e5e7eb',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = journeyData?.roadBack ? '#fed7aa' : '#e5e7eb';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = journeyData?.roadBack ? '#fffbeb' : '#f3f4f6';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ 
                  width: 20, 
                  height: 20, 
                  borderRadius: '50%', 
                  background: journeyData?.roadBack ? '#f97316' : '#6b7280',
                  marginRight: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 'bold'
                }}>7</div>
                <div style={{ 
                  fontSize: 14, 
                  fontWeight: '500', 
                  color: journeyData?.roadBack ? '#ea580c' : '#374151',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  The Reward
                  {journeyData?.roadBack && <span style={{ fontSize: '12px' }}>📖</span>}
                </div>
              </div>
              
              <div 
                onClick={(e) => handleJourneyStageClick('resurrection', 'Resurrection / Apotheosis', journeyData?.resurrection, e)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '6px 10px',
                  background: journeyData?.resurrection ? '#fdf2f8' : '#f3f4f6',
                  borderRadius: 8,
                  border: journeyData?.resurrection ? '2px solid #ec4899' : '2px solid #e5e7eb',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = journeyData?.resurrection ? '#fce7f3' : '#e5e7eb';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = journeyData?.resurrection ? '#fdf2f8' : '#f3f4f6';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ 
                  width: 20, 
                  height: 20, 
                  borderRadius: '50%', 
                  background: journeyData?.resurrection ? '#ec4899' : '#6b7280',
                  marginRight: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 'bold'
                }}>8</div>
                <div style={{ 
                  fontSize: 14, 
                  fontWeight: '500', 
                  color: journeyData?.resurrection ? '#db2777' : '#374151',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  Resurrection / Apotheosis
                  {journeyData?.resurrection && <span style={{ fontSize: '12px' }}>📖</span>}
                </div>
              </div>
              
              <div 
                onClick={(e) => handleJourneyStageClick('returnWithElixir', 'Return w/ the Elixir', journeyData?.returnWithElixir, e)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  padding: '6px 10px',
                  background: journeyData?.returnWithElixir ? '#f0fdfa' : '#f3f4f6',
                  borderRadius: 8,
                  border: journeyData?.returnWithElixir ? '2px solid #14b8a6' : '2px solid #e5e7eb',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = journeyData?.returnWithElixir ? '#ccfbf1' : '#e5e7eb';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = journeyData?.returnWithElixir ? '#f0fdfa' : '#f3f4f6';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ 
                  width: 20, 
                  height: 20, 
                  borderRadius: '50%', 
                  background: journeyData?.returnWithElixir ? '#14b8a6' : '#6b7280',
                  marginRight: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 'bold'
                }}>9</div>
                <div style={{ 
                  fontSize: 14, 
                  fontWeight: '500', 
                  color: journeyData?.returnWithElixir ? '#0f766e' : '#374151',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  Return w/ the Elixir
                  {journeyData?.returnWithElixir && <span style={{ fontSize: '12px' }}>📖</span>}
                </div>
              </div>
            </div>
          </div>
          
          <div style={{ color: '#6b7280', fontSize: 14, marginTop: 'auto', textAlign: 'center' }}>
            {activeJourneyTab ? 'Click to return to journey list' : 'Click to return to front'}
          </div>
        </div>
      </div>

      {/* Ordinary World Modal */}
      {showOrdinaryWorldModal && ordinaryWorld && (
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
            position: 'relative',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            {/* Close Button */}
            <button
              onClick={() => setShowOrdinaryWorldModal(false)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'none',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                color: '#6b7280',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
                e.currentTarget.style.color = '#374151';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#6b7280';
              }}
            >
              ×
            </button>

            <div style={{ textAlign: 'center', paddingRight: '2rem' }}>
              <h2 style={{ 
                fontSize: '1.75rem', 
                fontWeight: 'bold', 
                color: '#1f2937',
                marginBottom: '1rem',
                background: 'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
                backgroundClip: 'text',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent'
              }}>
                🌍 Your Ordinary World
              </h2>
              
              <div style={{
                background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                borderRadius: '1rem',
                padding: '1.5rem',
                marginBottom: '1.5rem',
                border: '2px solid #0ea5e9',
                textAlign: 'left'
              }}>
                <p style={{ 
                  fontSize: '1rem', 
                  color: '#0369a1',
                  lineHeight: '1.7',
                  margin: 0,
                  fontStyle: 'italic'
                }}>
                  "{ordinaryWorld}"
                </p>
              </div>

              <p style={{ 
                fontSize: '0.9rem', 
                color: '#6b7280',
                marginBottom: '1.5rem',
                lineHeight: '1.6'
              }}>
                This is the world you described before making your Truth Metal Choice. 
                It represents your life before the call to adventure, your familiar routines, 
                and the place where your hero's journey began.
              </p>

              <button
                onClick={() => setShowOrdinaryWorldModal(false)}
                style={{
                  backgroundColor: '#0ea5e9',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 2rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#0284c7';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#0ea5e9';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Journey Stage Modal */}
      {showJourneyModal && selectedJourneyStage && (
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
            position: 'relative',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            {/* Close Button */}
            <button
              onClick={() => setShowJourneyModal(false)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'none',
                border: 'none',
                fontSize: '1.5rem',
                cursor: 'pointer',
                color: '#6b7280',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = '#f3f4f6';
                e.currentTarget.style.color = '#374151';
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#6b7280';
              }}
            >
              ×
            </button>

            <div style={{ textAlign: 'center', paddingRight: '2rem' }}>
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
                🌟 {selectedJourneyStage.title}
              </h2>
              
              <div style={{
                background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
                borderRadius: '1rem',
                padding: '1.5rem',
                marginBottom: '1.5rem',
                border: '2px solid #cbd5e1',
                textAlign: 'left'
              }}>
                <p style={{ 
                  fontSize: '1rem', 
                  color: '#334155',
                  lineHeight: '1.7',
                  margin: 0,
                  fontStyle: 'italic'
                }}>
                  "{selectedJourneyStage.content}"
                </p>
              </div>

              <p style={{ 
                fontSize: '0.9rem', 
                color: '#6b7280',
                marginBottom: '1.5rem',
                lineHeight: '1.6'
              }}>
                This is your personal reflection for the <strong>{selectedJourneyStage.title}</strong> stage of your hero's journey. 
                Each stage represents a different phase of growth and transformation in your adventure.
              </p>

              <button
                onClick={() => setShowJourneyModal(false)}
                style={{
                  backgroundColor: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 2rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = '#5a67d8';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = '#667eea';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
});

PlayerCard.displayName = 'PlayerCard';

export default PlayerCard; 