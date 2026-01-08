import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getLevelFromXP } from '../utils/leveling';
import BattlePass from '../components/BattlePass';
import Season0IntroModal from '../components/Season0IntroModal';
import DailyChallenges from '../components/DailyChallenges';
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
        marginBottom: '2rem',
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

      {/* Daily Challenges Section */}
      <div style={{
        background: 'white',
        border: '2px solid #e5e7eb',
        borderRadius: '1rem',
        padding: '1.5rem',
        marginBottom: '2rem'
      }}>
        <DailyChallenges />
      </div>

      {/* Main Action Buttons - Big Rectangular Billboards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '2rem',
        marginBottom: '2rem'
      }}>
        {/* Battle Pass Button */}
        <div
          onClick={() => setShowBattlePass(true)}
          style={{
            background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
            border: '3px solid #a78bfa',
            borderRadius: '1rem',
            padding: '3rem 2rem',
            cursor: 'pointer',
            transition: 'all 0.3s',
            position: 'relative',
            overflow: 'hidden',
            minHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            boxShadow: '0 10px 30px rgba(139, 92, 246, 0.3)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-5px)';
            e.currentTarget.style.boxShadow = '0 15px 40px rgba(139, 92, 246, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 10px 30px rgba(139, 92, 246, 0.3)';
          }}
        >
          <div style={{ textAlign: 'center', width: '100%' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎁</div>
            <h2 style={{
              color: 'white',
              fontSize: '2.5rem',
              fontWeight: 'bold',
              marginBottom: '0.5rem',
              textShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)',
              textTransform: 'uppercase',
              letterSpacing: '2px'
            }}>
              BATTLE PASS
            </h2>
            <p style={{
              color: 'white',
              fontSize: '1.125rem',
              textShadow: '1px 1px 2px rgba(0, 0, 0, 0.3)',
              opacity: 0.95,
              marginBottom: '1rem'
            }}>
              Season 0 - Unlock Rewards
            </p>
            
            {/* Progress Bar */}
            {(() => {
              const currentTier = battlePassTier;
              const nextTier = currentTier < season0Tiers.length ? currentTier + 1 : season0Tiers.length;
              const currentTierXP = currentTier > 0 ? season0Tiers[currentTier - 1].requiredXP : 0;
              const nextTierXP = nextTier <= season0Tiers.length ? season0Tiers[nextTier - 1].requiredXP : season0Tiers[season0Tiers.length - 1].requiredXP;
              const xpInCurrentTier = battlePassXP - currentTierXP;
              const xpNeededForNextTier = nextTierXP - currentTierXP;
              const progressPercent = xpNeededForNextTier > 0 ? Math.min(100, (xpInCurrentTier / xpNeededForNextTier) * 100) : 100;
              
              return (
                <div style={{ width: '100%', maxWidth: '300px', margin: '0 auto' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                    fontSize: '0.875rem',
                    color: 'white',
                    textShadow: '1px 1px 2px rgba(0, 0, 0, 0.5)'
                  }}>
                    <span>Tier {currentTier} / {season0Tiers.length}</span>
                    <span>{xpInCurrentTier} / {xpNeededForNextTier} XP</span>
                  </div>
                  <div style={{
                    width: '100%',
                    height: '8px',
                    background: 'rgba(255, 255, 255, 0.3)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    border: '1px solid rgba(255, 255, 255, 0.5)'
                  }}>
                    <div style={{
                      width: `${progressPercent}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)',
                      borderRadius: '4px',
                      transition: 'width 0.3s ease',
                      boxShadow: '0 0 10px rgba(251, 191, 36, 0.5)'
                    }} />
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Player's Journey Button */}
        <div
          style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            border: '3px solid #60a5fa',
            borderRadius: '1rem',
            padding: '3rem 2rem',
            transition: 'all 0.3s',
            position: 'relative',
            overflow: 'hidden',
            minHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            boxShadow: '0 10px 30px rgba(59, 130, 246, 0.3)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-5px)';
            e.currentTarget.style.boxShadow = '0 15px 40px rgba(59, 130, 246, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 10px 30px rgba(59, 130, 246, 0.3)';
          }}
        >
          <div style={{ textAlign: 'center', width: '100%' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📖</div>
            <h2 style={{
              color: 'white',
              fontSize: '2.5rem',
              fontWeight: 'bold',
              marginBottom: '0.5rem',
              textShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)',
              textTransform: 'uppercase',
              letterSpacing: '2px'
            }}>
              PLAYER'S JOURNEY
            </h2>
            <p style={{
              color: 'white',
              fontSize: '1.125rem',
              textShadow: '1px 1px 2px rgba(0, 0, 0, 0.3)',
              opacity: 0.95,
              marginBottom: '1rem'
            }}>
              {journeyStatus.isCaughtUp ? 'You\'re caught up — more coming soon!' : 'Begin Your Story'}
            </p>
            
            {/* Progress Display */}
            {journeyStatus.currentChapterNumber !== null && (
              <div style={{ width: '100%', maxWidth: '300px', margin: '0 auto', marginBottom: '1rem' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                  fontSize: '0.875rem',
                  color: 'white',
                  textShadow: '1px 1px 2px rgba(0, 0, 0, 0.5)'
                }}>
                  <span>
                    Chapter {journeyStatus.currentChapterNumber}
                    {journeyStatus.nextChallenge && ` - ${journeyStatus.nextChallenge.title}`}
                  </span>
                  <span>{Math.round(journeyStatus.chapterProgressPercent)}%</span>
                </div>
                <div style={{
                  width: '100%',
                  height: '8px',
                  background: 'rgba(255, 255, 255, 0.3)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  border: '1px solid rgba(255, 255, 255, 0.5)'
                }}>
                  <div style={{
                    width: `${journeyStatus.chapterProgressPercent}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #60a5fa 0%, #3b82f6 100%)',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease',
                    boxShadow: '0 0 10px rgba(96, 165, 250, 0.5)'
                  }} />
                </div>
                {journeyStatus.nextChallenge && (
                  <div style={{
                    fontSize: '0.75rem',
                    color: 'white',
                    textShadow: '1px 1px 2px rgba(0, 0, 0, 0.5)',
                    marginTop: '0.5rem',
                    opacity: 0.9
                  }}>
                    Next: {journeyStatus.nextChallenge.title}
                  </div>
                )}
              </div>
            )}
            
            {/* Continue Journey Button */}
            <button
              onClick={() => {
                if (journeyStatus.nextChallenge) {
                  // Deep-link to next challenge
                  navigate(`/chapters?focus=${journeyStatus.nextChallenge.challengeId}&chapter=${journeyStatus.nextChallenge.chapterId}`);
                } else {
                  // No next challenge - just go to chapters page
                  navigate('/chapters');
                }
              }}
              disabled={journeyStatus.isCaughtUp}
              style={{
                padding: '0.75rem 1.5rem',
                background: journeyStatus.isCaughtUp ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.9)',
                color: journeyStatus.isCaughtUp ? 'rgba(255, 255, 255, 0.7)' : '#3b82f6',
                border: '2px solid rgba(255, 255, 255, 0.5)',
                borderRadius: '0.5rem',
                cursor: journeyStatus.isCaughtUp ? 'not-allowed' : 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold',
                textShadow: journeyStatus.isCaughtUp ? 'none' : '1px 1px 2px rgba(0, 0, 0, 0.2)',
                transition: 'all 0.2s',
                marginTop: '0.5rem'
              }}
              onMouseEnter={(e) => {
                if (!journeyStatus.isCaughtUp) {
                  e.currentTarget.style.background = 'white';
                  e.currentTarget.style.transform = 'scale(1.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (!journeyStatus.isCaughtUp) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.9)';
                  e.currentTarget.style.transform = 'scale(1)';
                }
              }}
            >
              {journeyStatus.isCaughtUp ? 'View Journey' : 'Continue Journey'}
            </button>
          </div>
        </div>

        {/* Battle Arena Button */}
        <div
          onClick={() => navigate('/battle')}
          style={{
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            border: '3px solid #f59e0b',
            borderRadius: '1rem',
            padding: '3rem 2rem',
            cursor: 'pointer',
            transition: 'all 0.3s',
            position: 'relative',
            overflow: 'hidden',
            minHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            boxShadow: '0 10px 30px rgba(239, 68, 68, 0.3)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-5px)';
            e.currentTarget.style.boxShadow = '0 15px 40px rgba(239, 68, 68, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 10px 30px rgba(239, 68, 68, 0.3)';
          }}
        >
          <div style={{ textAlign: 'center', width: '100%' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⚔️</div>
            <h2 style={{
              color: 'white',
              fontSize: '2.5rem',
              fontWeight: 'bold',
              marginBottom: '0.5rem',
              textShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)',
              textTransform: 'uppercase',
              letterSpacing: '2px'
            }}>
              BATTLE ARENA
            </h2>
            <p style={{
              color: 'white',
              fontSize: '1.125rem',
              textShadow: '1px 1px 2px rgba(0, 0, 0, 0.3)',
              opacity: 0.95
            }}>
              Enter the Arena
            </p>
          </div>
        </div>

        {/* MST MKT Button */}
        <div
          onClick={() => navigate('/marketplace')}
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            border: '3px solid #fbbf24',
            borderRadius: '1rem',
            padding: '3rem 2rem',
            cursor: 'pointer',
            transition: 'all 0.3s',
            position: 'relative',
            overflow: 'hidden',
            minHeight: '200px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            boxShadow: '0 10px 30px rgba(245, 158, 11, 0.3)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-5px)';
            e.currentTarget.style.boxShadow = '0 15px 40px rgba(245, 158, 11, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 10px 30px rgba(245, 158, 11, 0.3)';
          }}
        >
          <div style={{ textAlign: 'center', width: '100%' }}>
            <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🛒</div>
            <h2 style={{
              color: 'white',
              fontSize: '2.5rem',
              fontWeight: 'bold',
              marginBottom: '0.5rem',
              textShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)',
              textTransform: 'uppercase',
              letterSpacing: '2px'
            }}>
              MST MKT
            </h2>
            <p style={{
              color: 'white',
              fontSize: '1.125rem',
              textShadow: '1px 1px 2px rgba(0, 0, 0, 0.3)',
              opacity: 0.95
            }}>
              Artifact Marketplace
            </p>
          </div>
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
  );
};

export default Home;

