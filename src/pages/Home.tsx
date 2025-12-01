import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getLevelFromXP } from '../utils/leveling';
import BattlePass from '../components/BattlePass';
import Season0IntroModal from '../components/Season0IntroModal';

const Home: React.FC = () => {
  const { currentUser } = useAuth();
  const { vault } = useBattle();
  const navigate = useNavigate();
  const [userLevel, setUserLevel] = useState(1);
  const [showBattlePass, setShowBattlePass] = useState(false);
  const [showSeason0Intro, setShowSeason0Intro] = useState(false);

  // Fetch user level and check if Season 0 intro should be shown
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
        } else {
          // New user - show intro
          setShowSeason0Intro(true);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, [currentUser]);


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
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🏠 MST Home</h1>
        <p style={{ fontSize: '1.1rem', opacity: 0.9, margin: 0 }}>
          "Master Space & Time" — Your journey begins here
        </p>
      </div>

      {/* Main Action Buttons - Big Rectangular Billboards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '2rem',
        marginBottom: '2rem'
      }}>
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

        {/* Player's Journey Button */}
        <div
          onClick={() => navigate('/chapters')}
          style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            border: '3px solid #60a5fa',
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
              opacity: 0.95
            }}>
              Begin Your Story
            </p>
          </div>
        </div>

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
              opacity: 0.95
            }}>
              Season 0 - Unlock Rewards
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
          onClose={() => setShowBattlePass(false)}
          season={0}
        />
      )}

      {/* Season 0 Introduction Modal */}
      <Season0IntroModal
        isOpen={showSeason0Intro}
        onClose={() => setShowSeason0Intro(false)}
      />
      </div>
    </div>
  );
};

export default Home;

