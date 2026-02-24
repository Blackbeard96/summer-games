/**
 * Power Card Overlay Component
 * 
 * Main interaction layer positioned over the holo card in the background
 * Contains tabs: Live Feed (default), Daily Challenges, Battle Pass
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LiveFeedCompact from './LiveFeedCompact';
import DailyChallengesCompact from './DailyChallengesCompact';
import BattlePassCompactCard from './BattlePassCompactCard';
import BattlePass from './BattlePass';
import LiveFeedPrivacySettings from './LiveFeedPrivacySettings';

type TabId = 'live' | 'daily' | 'battlepass' | 'battle' | 'journey' | 'market';

interface PowerCardOverlayProps {
  battlePassTier: number;
  maxTier: number;
  battlePassXP: number;
  onBattlePassRefresh: () => void;
}

const PowerCardOverlay: React.FC<PowerCardOverlayProps> = ({
  battlePassTier,
  maxTier,
  battlePassXP,
  onBattlePassRefresh
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('live');
  const [showBattlePassModal, setShowBattlePassModal] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    // Load last selected tab from localStorage
    const savedTab = localStorage.getItem('powerCardActiveTab') as TabId | null;
    if (savedTab && ['live', 'daily', 'battlepass', 'battle', 'journey', 'market'].includes(savedTab)) {
      setActiveTab(savedTab);
    }

    // Check if mobile
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleTabChange = (tab: TabId, path?: string) => {
    setActiveTab(tab);
    localStorage.setItem('powerCardActiveTab', tab);
    // If tab has a path, navigate to it
    if (path) {
      navigate(path);
    }
  };

  const tabs: Array<{ id: TabId; label: string; icon: string; path?: string }> = [
    { id: 'live', label: 'Live', icon: '💬' },
    { id: 'daily', label: 'Daily', icon: '📋' },
    { id: 'battlepass', label: 'Battle Pass', icon: '🛡️' },
    { id: 'battle', label: 'Battle Arena', icon: '⚔️', path: '/battle' },
    { id: 'journey', label: "Player's Journey", icon: '📖', path: '/chapters' },
    { id: 'market', label: 'Market', icon: '🛒', path: '/marketplace' }
  ];

  // Mobile: bottom sheet style
  if (isMobile) {
    return (
      <>
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            height: isCollapsed ? '60px' : '60vh',
            background: 'rgba(31, 41, 55, 0.95)',
            backdropFilter: 'blur(20px)',
            borderTop: '2px solid rgba(59, 130, 246, 0.5)',
            borderTopLeftRadius: '1.5rem',
            borderTopRightRadius: '1.5rem',
            zIndex: 1000,
            transition: 'height 0.3s ease',
            boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.4)',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header with tabs and collapse button */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          >
            <div style={{ display: 'flex', gap: '0.5rem', flex: 1, overflowX: 'auto', scrollbarWidth: 'none' }}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    handleTabChange(tab.id, tab.path);
                    if (isCollapsed) setIsCollapsed(false);
                  }}
                  style={{
                    flexShrink: 0,
                    padding: '0.5rem 0.75rem',
                    background: activeTab === tab.id
                      ? 'rgba(59, 130, 246, 0.3)'
                      : 'transparent',
                    border: `1px solid ${activeTab === tab.id ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)'}`,
                    borderRadius: '0.5rem',
                    color: 'white',
                    fontSize: '0.75rem',
                    fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.25rem',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              style={{
                marginLeft: '0.5rem',
                padding: '0.5rem',
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                borderRadius: '0.5rem',
                color: 'white',
                cursor: 'pointer',
                fontSize: '1.25rem'
              }}
            >
              {isCollapsed ? '▲' : '▼'}
            </button>
          </div>

          {/* Content */}
          {!isCollapsed && (
            <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
            {activeTab === 'live' && (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <LiveFeedCompact />
              </div>
            )}
              {activeTab === 'daily' && (
                <div style={{ height: '100%', overflow: 'auto' }}>
                  <DailyChallengesCompact />
                </div>
              )}
              {activeTab === 'battlepass' && (
                <div style={{ height: '100%', overflow: 'auto' }}>
                  <BattlePassCompactCard
                    currentTier={battlePassTier}
                    maxTier={maxTier}
                    totalXP={battlePassXP}
                    onViewRewards={() => setShowBattlePassModal(true)}
                  />
                </div>
              )}
              {/* Navigation tabs - show simple message or navigate directly */}
              {(activeTab === 'battle' || activeTab === 'journey' || activeTab === 'market') && (
                <div style={{ 
                  height: '100%', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  color: 'rgba(255, 255, 255, 0.7)',
                  padding: '2rem',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                    {tabs.find(t => t.id === activeTab)?.icon}
                  </div>
                  <p style={{ margin: 0, fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    {tabs.find(t => t.id === activeTab)?.label}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.8 }}>
                    Click the tab again or use navigation to visit this page
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Battle Pass Modal */}
        {showBattlePassModal && (
          <BattlePass
            isOpen={showBattlePassModal}
            onClose={() => {
              setShowBattlePassModal(false);
              onBattlePassRefresh();
            }}
            season={0}
          />
        )}
      </>
    );
  }

  // Desktop: floating card over holo card
  return (
    <>
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'clamp(320px, 50vw, 720px)',
          maxHeight: isCollapsed ? '60px' : '280px', // Reduced height to take up less space
          background: 'rgba(31, 41, 55, 0.85)',
          backdropFilter: 'blur(20px)',
          border: '2px solid rgba(59, 130, 246, 0.4)',
          borderRadius: '1rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) inset',
          zIndex: 100,
          transition: 'max-height 0.3s ease',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header with tabs */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.75rem 1rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(0, 0, 0, 0.2)'
          }}
        >
          <div style={{ 
            display: 'flex', 
            gap: '0.5rem', 
            flex: 1, 
            overflowX: 'auto',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}>
            <style>{`
              div::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  handleTabChange(tab.id, tab.path);
                  if (isCollapsed) setIsCollapsed(false);
                }}
                style={{
                  flexShrink: 0,
                  padding: '0.5rem 0.75rem',
                  background: activeTab === tab.id
                    ? 'rgba(59, 130, 246, 0.3)'
                    : 'transparent',
                  border: `1px solid ${activeTab === tab.id ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)'}`,
                  borderRadius: '0.5rem',
                  color: 'white',
                  fontSize: '0.75rem',
                  fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.id) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            style={{
              marginLeft: '0.5rem',
              padding: '0.5rem',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '0.5rem',
              color: 'white',
              cursor: 'pointer',
              fontSize: '1rem',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isCollapsed ? '▲' : '▼'}
          </button>
        </div>

        {/* Content */}
        {!isCollapsed && (
          <div
            style={{
              flex: 1,
              overflow: 'auto',
              padding: '1rem',
              minHeight: 0
            }}
          >
            {activeTab === 'live' && (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <LiveFeedCompact />
                <div style={{ marginTop: '0.5rem' }}>
                  <LiveFeedPrivacySettings />
                </div>
              </div>
            )}
            {activeTab === 'daily' && (
              <div style={{ height: '100%', overflow: 'auto' }}>
                <DailyChallengesCompact />
              </div>
            )}
            {activeTab === 'battlepass' && (
              <div style={{ height: '100%', overflow: 'auto' }}>
                <BattlePassCompactCard
                  currentTier={battlePassTier}
                  maxTier={maxTier}
                  totalXP={battlePassXP}
                  onViewRewards={() => setShowBattlePassModal(true)}
                />
              </div>
            )}
              {/* Navigation tabs - show simple message or navigate directly */}
              {(activeTab === 'battle' || activeTab === 'journey' || activeTab === 'market') && (
              <div style={{ 
                height: '100%', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: 'rgba(255, 255, 255, 0.7)',
                padding: '2rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                  {tabs.find(t => t.id === activeTab)?.icon}
                </div>
                <p style={{ margin: 0, fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  {tabs.find(t => t.id === activeTab)?.label}
                </p>
                <p style={{ margin: 0, fontSize: '0.875rem', opacity: 0.8 }}>
                  Click the tab again or use navigation to visit this page
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Battle Pass Modal */}
      {showBattlePassModal && (
        <BattlePass
          isOpen={showBattlePassModal}
          onClose={() => {
            setShowBattlePassModal(false);
            onBattlePassRefresh();
          }}
          season={0}
        />
      )}
    </>
  );
};

export default PowerCardOverlay;

