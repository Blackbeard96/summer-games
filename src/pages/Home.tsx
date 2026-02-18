import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getLevelFromXP } from '../utils/leveling';
import BattlePass from '../components/BattlePass';
import Season0IntroModal from '../components/Season0IntroModal';
import DailyChallengesCompact from '../components/DailyChallengesCompact';
import LiveFeedCard from '../components/LiveFeedCard';
import LiveFeedPrivacySettings from '../components/LiveFeedPrivacySettings';
import BattlePassCompactCard from '../components/BattlePassCompactCard';
import QuickLinksRow from '../components/QuickLinksRow';
import { useJourneyStatus } from '../hooks/useJourneyStatus';

// Season 0 Battle Pass Tiers - Each tier requires 1000 XP more than the previous
const season0Tiers = [
  { tier: 1, requiredXP: 1000 },
  { tier: 2, requiredXP: 2000 },
  { tier: 3, requiredXP: 3000 },
  { tier: 4, requiredXP: 4000 },
  { tier: 5, requiredXP: 5000 },
  { tier: 6, requiredXP: 6000 },
  { tier: 7, requiredXP: 7000 },
  { tier: 8, requiredXP: 8000 },
  { tier: 9, requiredXP: 9000 },
  { tier: 10, requiredXP: 10000 },
  { tier: 11, requiredXP: 11000 },
  { tier: 12, requiredXP: 12000 },
  { tier: 13, requiredXP: 13000 },
  { tier: 14, requiredXP: 14000 },
  { tier: 15, requiredXP: 15000 },
];

const calculateTier = (xp: number): number => {
  for (let i = season0Tiers.length - 1; i >= 0; i--) {
    if (xp >= season0Tiers[i].requiredXP) {
      return season0Tiers[i].tier;
    }
  }
  return 0;
};

const Home: React.FC = () => {
  const { currentUser } = useAuth();
  const { vault } = useBattle();
  const navigate = useNavigate();
  const [userLevel, setUserLevel] = useState(1);
  const [showBattlePass, setShowBattlePass] = useState(false);
  const [showSeason0Intro, setShowSeason0Intro] = useState(false);
  const [showVideoReplay, setShowVideoReplay] = useState(false);
  const [battlePassXP, setBattlePassXP] = useState(0);
  const [battlePassTier, setBattlePassTier] = useState(0);
  
  // Use shared journey status hook
  const journeyStatus = useJourneyStatus(currentUser?.uid || null);

  // Fetch user level, Battle Pass progress, and check if Season 0 intro should be shown
  useEffect(() => {
    const fetchUserData = async () => {
      if (!currentUser) return;
      
      try {
        const userDoc = await getDoc(doc(db, 'students', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const calculatedLevel = getLevelFromXP(userData.xp || 0);
          setUserLevel(calculatedLevel);
          
          // Only show intro if user has NOT seen it (explicitly check for false or undefined)
          // Once season0IntroSeen is true, it will never show again
          if (userData.season0IntroSeen !== true) {
            setShowSeason0Intro(true);
          }
          
          // Check if video has been auto-played (for showing replay button)
          // Video replay button will always be available after first login
          
          // Fetch Battle Pass progress - use player's actual XP
          const playerXP = userData.xp || 0;
          setBattlePassXP(playerXP);
          setBattlePassTier(calculateTier(playerXP));
        } else {
          // New user - show intro
          setShowSeason0Intro(true);
          setBattlePassXP(0);
          setBattlePassTier(0);
        }
        
        // Also ensure Battle Pass document exists for claim tracking
        const battlePassRef = doc(db, 'battlePass', `${currentUser.uid}_season0`);
        const battlePassDoc = await getDoc(battlePassRef);
        if (!battlePassDoc.exists()) {
          const playerXP = userDoc.exists() ? (userDoc.data().xp || 0) : 0;
          const initialData = {
            userId: currentUser.uid,
            season: 0,
            totalXP: playerXP, // Use player's actual XP
            currentTier: calculateTier(playerXP),
            claimedTiers: [],
            isPremium: false,
            createdAt: serverTimestamp()
          };
          await setDoc(battlePassRef, initialData);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, [currentUser]);

  // Journey status is now handled by useJourneyStatus hook
  // No need for separate fetchJourneyProgress useEffect


  return (
    <>
      <style>{`
        /* Desktop: 3 columns (25% / 50% / 25%) */
        @media (min-width: 1024px) {
          .home-main-grid {
            grid-template-columns: 1fr 2fr 1fr !important;
          }
        }
        
        /* Tablet: Live Feed full width on top, Daily Challenges + Battle Pass side-by-side below */
        @media (min-width: 768px) and (max-width: 1023px) {
          .home-main-grid {
            grid-template-columns: 1fr 1fr !important;
          }
          .home-live-feed {
            grid-column: 1 / -1 !important;
            margin-bottom: 1.5rem;
          }
        }
        
        /* Mobile: Stacked vertically */
        @media (max-width: 767px) {
          .home-main-grid {
            grid-template-columns: 1fr !important;
          }
          .home-daily-challenges,
          .home-live-feed,
          .home-battle-pass {
            margin-bottom: 1.5rem;
          }
        }
      `}</style>
      <div style={{ 
        minHeight: '100vh',
        width: '100%',
        backgroundImage: 'url(/images/MST%20BKG.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        backgroundRepeat: 'no-repeat',
        position: 'relative',
        paddingTop: '2rem',
        paddingBottom: '2rem'
      }}>
      <div style={{ 
        maxWidth: '1200px', 
        margin: '0 auto', 
        padding: '0 2rem',
        position: 'relative',
        zIndex: 1
      }}>
      {/* Header Section - Matching Battle page style */}
      <div style={{ 
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '2rem',
        borderRadius: '1rem',
        marginBottom: '1.5rem',
        textAlign: 'center',
        position: 'relative'
      }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🏠 MST Home</h1>
        <p style={{ fontSize: '1.1rem', opacity: 0.9, margin: 0 }}>
          "Master Space & Time" — Your journey begins here
        </p>
        {/* Video Replay Button */}
        <button
          onClick={() => setShowVideoReplay(true)}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'rgba(255, 255, 255, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '0.5rem',
            padding: '0.5rem 1rem',
            color: 'white',
            fontSize: '0.875rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
          }}
        >
          <span>▶️</span>
          <span>Watch Season 0 Intro</span>
        </button>
      </div>

      {/* Quick Links Row */}
      <QuickLinksRow />

      {/* Main 3-Column Grid */}
      <div 
        className="home-main-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '1.5rem',
          marginBottom: '2rem'
        }}
      >
        {/* Left Column: Daily Challenges */}
        <div className="home-daily-challenges">
          <DailyChallengesCompact />
        </div>

        {/* Center Column: Live Feed + Privacy Settings */}
        <div className="home-live-feed" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <LiveFeedCard />
          <LiveFeedPrivacySettings />
        </div>

        {/* Right Column: Battle Pass */}
        <div className="home-battle-pass">
          <BattlePassCompactCard
            currentTier={battlePassTier}
            maxTier={season0Tiers.length}
            totalXP={battlePassXP}
            onViewRewards={() => setShowBattlePass(true)}
          />
        </div>
      </div>

      {/* Battle Pass Modal */}
      {showBattlePass && (
        <BattlePass
          isOpen={showBattlePass}
          onClose={async () => {
            setShowBattlePass(false);
            // Refresh Battle Pass progress after closing modal - use player's actual XP
            if (currentUser) {
              try {
                const userDoc = await getDoc(doc(db, 'students', currentUser.uid));
                if (userDoc.exists()) {
                  const userData = userDoc.data();
                  const playerXP = userData.xp || 0;
                  setBattlePassXP(playerXP);
                  setBattlePassTier(calculateTier(playerXP));
                }
              } catch (error) {
                console.error('Error refreshing Battle Pass progress:', error);
              }
            }
          }}
          season={0}
        />
      )}

      {/* Season 0 Introduction Modal (auto-play on first login) */}
      <Season0IntroModal
        isOpen={showSeason0Intro}
        onClose={() => setShowSeason0Intro(false)}
        autoPlayVideo={true}
      />
      
      {/* Season 0 Video Replay Modal */}
      <Season0IntroModal
        isOpen={showVideoReplay}
        onClose={() => setShowVideoReplay(false)}
        autoPlayVideo={false}
      />
      </div>
    </div>
    </>
  );
};

export default Home;

