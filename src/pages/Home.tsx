import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getLevelFromXP } from '../utils/leveling';
import BattlePass from '../components/BattlePass';
import Season0IntroModal from '../components/Season0IntroModal';
import { useJourneyStatus } from '../hooks/useJourneyStatus';
import NPCMissionModal from '../components/NPCMissionModal';
import NpcHotspots from '../components/NpcHotspots';
import PowerCardOverlay from '../components/PowerCardOverlay';

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
  const [selectedNPC, setSelectedNPC] = useState<'sonido' | 'zeke' | 'luz' | 'kon' | null>(null);
  
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


  const handleBattlePassRefresh = async () => {
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
  };

  return (
    <>
      <div style={{ 
        height: '100vh',
        width: '100%',
        backgroundImage: 'url(/images/Home_BKG_V2.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
        backgroundRepeat: 'no-repeat',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Background Container - for NPC hotspots positioning */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1
        }}>
          {/* NPC Hotspots - positioned absolutely over background */}
          <NpcHotspots onNpcClick={setSelectedNPC} />
        </div>

        {/* Fixed Header - Top Center */}
        <div style={{
          position: 'fixed',
          top: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          width: 'clamp(300px, 90vw, 600px)'
        }}>
          <div style={{ 
            background: 'rgba(31, 41, 55, 0.85)',
            backdropFilter: 'blur(10px)',
            color: 'white',
            padding: '0.75rem 1rem',
            borderRadius: '0.75rem',
            textAlign: 'center',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
          }}>
            <h1 style={{ fontSize: '1.25rem', margin: 0, lineHeight: '1.2' }}>🏠 MST Home</h1>
            <p style={{ fontSize: '0.75rem', opacity: 0.9, margin: '0.25rem 0 0 0' }}>
              "Master Space & Time"
            </p>
            {/* Video Replay Button */}
            <button
              onClick={() => setShowVideoReplay(true)}
              style={{
                position: 'absolute',
                top: '0.5rem',
                right: '0.5rem',
                background: 'rgba(255, 255, 255, 0.15)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '0.375rem',
                padding: '0.25rem 0.5rem',
                color: 'white',
                fontSize: '0.625rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
              }}
            >
              <span>▶️</span>
            </button>
          </div>
        </div>


        {/* Power Card Overlay - fixed at bottom */}
        <PowerCardOverlay
          battlePassTier={battlePassTier}
          maxTier={season0Tiers.length}
          battlePassXP={battlePassXP}
          onBattlePassRefresh={handleBattlePassRefresh}
        />

        {/* NPC Mission Modals */}
        {selectedNPC === 'sonido' && (
          <NPCMissionModal
            isOpen={true}
            onClose={() => setSelectedNPC(null)}
            npc="sonido"
            npcName="Sonido"
          />
        )}
        {selectedNPC === 'zeke' && (
          <NPCMissionModal
            isOpen={true}
            onClose={() => setSelectedNPC(null)}
            npc="zeke"
            npcName="Zeke"
          />
        )}
        {selectedNPC === 'luz' && (
          <NPCMissionModal
            isOpen={true}
            onClose={() => setSelectedNPC(null)}
            npc="luz"
            npcName="Luz"
          />
        )}
        {selectedNPC === 'kon' && (
          <NPCMissionModal
            isOpen={true}
            onClose={() => setSelectedNPC(null)}
            npc="kon"
            npcName="Kon"
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
    </>
  );
};

export default Home;

