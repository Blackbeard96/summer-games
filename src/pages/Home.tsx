import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { getLevelFromXP } from '../utils/leveling';
import Season0IntroModal from '../components/Season0IntroModal';
import { useJourneyStatus } from '../hooks/useJourneyStatus';
import NPCMissionModal from '../components/NPCMissionModal';
import NpcHotspots from '../components/NpcHotspots';
import PowerCardOverlay from '../components/PowerCardOverlay';
import { fetchActiveBattlePassSeason } from '../utils/activeBattlePassClient';
import { computeHomeBattlePassDisplay, type HomeBattlePassDisplay } from '../utils/homeBattlePassDisplay';
import { season0CompactSegment } from '../utils/battlePassTierMath';
import {
  fetchHubNpcMissionAttentionMap,
  DEFAULT_HUB_NPC_MISSION_ATTENTION,
  type HubNpcMissionAttentionMap,
} from '../utils/missionsService';
import WaysToEarnPowerPointsModal from '../components/WaysToEarnPowerPointsModal';
import { consumeHomeHubMissionsHighlight } from '../utils/earnPowerPointsHomeIntent';
import { mergeSeason1FromStudentData } from '../utils/season1PlayerHydration';
import { markBattlePassIntroSeenForSeason } from '../utils/awardBattlePassXp';

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
  const [searchParams, setSearchParams] = useSearchParams();
  // Season 1: Flow State hub — battle pass + energy (see docs/SEASON1_IMPLEMENTATION.md)
  const [userLevel, setUserLevel] = useState(1);
  const [showSeason0Intro, setShowSeason0Intro] = useState(false);
  const [showVideoReplay, setShowVideoReplay] = useState(false);
  const [bpDisplay, setBpDisplay] = useState<HomeBattlePassDisplay>(() => {
    const seg = season0CompactSegment(0, season0Tiers.length, 0);
    return {
      deployedActive: false,
      seasonSubtitle: 'Season 0 Battle Pass',
      battlePassTier: 0,
      maxTier: season0Tiers.length,
      battlePassXP: 0,
      progressPercentOverride: seg.progressPercent,
      battlePassXpInSegment: seg.xpInSegment,
      battlePassXpSegmentSpan: seg.xpSegmentSpan,
      battlePassXpSegmentComplete: seg.isComplete,
      battlePassIntroAvailable: false,
    };
  });
  const [selectedNPC, setSelectedNPC] = useState<'sonido' | 'zeke' | 'luz' | 'kon' | null>(null);
  const [npcMissionAttention, setNpcMissionAttention] = useState<HubNpcMissionAttentionMap>(
    DEFAULT_HUB_NPC_MISSION_ATTENTION
  );
  const [showWaysToEarnPp, setShowWaysToEarnPp] = useState(false);
  const [highlightHomeHubMissions, setHighlightHomeHubMissions] = useState(false);
  const [bpIntroSeasonId, setBpIntroSeasonId] = useState<string | null>(null);
  const [bpIntroSeen, setBpIntroSeen] = useState(false);
  const [bpIntroStateReady, setBpIntroStateReady] = useState(false);

  // Use shared journey status hook
  const journeyStatus = useJourneyStatus(currentUser?.uid || null);

  useEffect(() => {
    if (!currentUser) {
      setNpcMissionAttention(DEFAULT_HUB_NPC_MISSION_ATTENTION);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const map = await fetchHubNpcMissionAttentionMap(currentUser.uid);
        if (!cancelled) setNpcMissionAttention(map);
      } catch (e) {
        console.error('Error loading hub NPC mission indicators:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const refreshNpcMissionAttention = () => {
    if (!currentUser) return;
    fetchHubNpcMissionAttentionMap(currentUser.uid)
      .then(setNpcMissionAttention)
      .catch((e) => console.error('Error refreshing hub NPC mission indicators:', e));
  };

  const closeNpcModal = () => {
    setSelectedNPC(null);
    refreshNpcMissionAttention();
  };

  useEffect(() => {
    if (!consumeHomeHubMissionsHighlight()) return;
    setHighlightHomeHubMissions(true);
    const t = window.setTimeout(() => setHighlightHomeHubMissions(false), 5000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const replay = () => {
      setHighlightHomeHubMissions(false);
      window.requestAnimationFrame(() => {
        setHighlightHomeHubMissions(true);
        window.setTimeout(() => setHighlightHomeHubMissions(false), 5000);
      });
    };
    window.addEventListener('xiotein:replayHomeHubHighlight', replay);
    return () => window.removeEventListener('xiotein:replayHomeHubHighlight', replay);
  }, []);

  useEffect(() => {
    if (searchParams.get('earnPP') !== '1') return;
    setShowWaysToEarnPp(true);
    try {
      localStorage.setItem('powerCardActiveTab', 'daily');
    } catch {
      /* ignore */
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('earnPP');
        return next;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams]);

  // Fetch user level, active deployed battle pass (seasons/), Season 0 claim doc, intro flags
  useEffect(() => {
    const fetchUserData = async () => {
      if (!currentUser) {
        setBpIntroStateReady(false);
        return;
      }

      setBpIntroStateReady(false);

      try {
        const [userDoc, activeSeason] = await Promise.all([
          getDoc(doc(db, 'students', currentUser.uid)),
          fetchActiveBattlePassSeason(),
        ]);

        const seasonId = activeSeason?.id?.trim() || null;
        const syncBpIntro = (userData: Record<string, unknown> | undefined) => {
          const s1 = mergeSeason1FromStudentData(userData?.season1 as Record<string, unknown> | undefined);
          setBpIntroSeasonId(seasonId);
          setBpIntroSeen(!!(seasonId && s1.battlePass.introSeenSeasonId === seasonId));
        };

        if (userDoc.exists()) {
          const userData = userDoc.data();
          const calculatedLevel = getLevelFromXP(userData.xp || 0);
          setUserLevel(calculatedLevel);

          if (userData.season0IntroSeen !== true) {
            setShowSeason0Intro(true);
          }

          const disp = computeHomeBattlePassDisplay(
            userData as Record<string, unknown>,
            activeSeason,
            season0Tiers.length,
            calculateTier
          );
          setBpDisplay(disp);
          syncBpIntro(userData as Record<string, unknown>);
        } else {
          setShowSeason0Intro(true);
          setBpDisplay(
            computeHomeBattlePassDisplay(undefined, activeSeason, season0Tiers.length, calculateTier)
          );
          syncBpIntro(undefined);
        }

        const battlePassRef = doc(db, 'battlePass', `${currentUser.uid}_season0`);
        const battlePassDoc = await getDoc(battlePassRef);
        if (!battlePassDoc.exists()) {
          const playerXP = userDoc.exists() ? (userDoc.data().xp || 0) : 0;
          const initialData = {
            userId: currentUser.uid,
            season: 0,
            totalXP: playerXP,
            currentTier: calculateTier(playerXP),
            claimedTiers: [],
            isPremium: false,
            createdAt: serverTimestamp(),
          };
          await setDoc(battlePassRef, initialData);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setBpIntroStateReady(true);
      }
    };

    fetchUserData();
  }, [currentUser]);

  // Journey status is now handled by useJourneyStatus hook
  // No need for separate fetchJourneyProgress useEffect


  const handleBattlePassRefresh = async () => {
    if (!currentUser) return;
    try {
      const [userDoc, activeSeason] = await Promise.all([
        getDoc(doc(db, 'students', currentUser.uid)),
        fetchActiveBattlePassSeason(),
      ]);
      const userData = userDoc.exists() ? userDoc.data() : undefined;
      setBpDisplay(
        computeHomeBattlePassDisplay(
          userData as Record<string, unknown> | undefined,
          activeSeason,
          season0Tiers.length,
          calculateTier
        )
      );
      const sid = activeSeason?.id?.trim() || null;
      const s1 = mergeSeason1FromStudentData(userData?.season1 as Record<string, unknown> | undefined);
      setBpIntroSeasonId(sid);
      setBpIntroSeen(!!(sid && s1.battlePass.introSeenSeasonId === sid));
    } catch (error) {
      console.error('Error refreshing Battle Pass progress:', error);
    }
  };

  const handleBattlePassIntroDismissed = useCallback(async () => {
    if (!currentUser || !bpIntroSeasonId) return;
    await markBattlePassIntroSeenForSeason(currentUser.uid, bpIntroSeasonId);
    setBpIntroSeen(true);
  }, [currentUser, bpIntroSeasonId]);

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
        <div
          id="home-hub-missions"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1,
            transition: 'box-shadow 0.35s ease',
            boxShadow: highlightHomeHubMissions
              ? 'inset 0 0 0 5px rgba(251, 191, 36, 0.95), inset 0 0 80px 20px rgba(251, 191, 36, 0.2)'
              : 'none',
          }}
        >
          {/* NPC Hotspots - positioned absolutely over background */}
          <NpcHotspots
            onNpcClick={setSelectedNPC}
            npcMissionAttention={npcMissionAttention}
          />
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
          battlePassTier={bpDisplay.battlePassTier}
          maxTier={bpDisplay.maxTier}
          battlePassXP={bpDisplay.battlePassXP}
          battlePassSeasonSubtitle={bpDisplay.seasonSubtitle}
          battlePassProgressPercent={bpDisplay.progressPercentOverride}
          battlePassXpInSegment={bpDisplay.battlePassXpInSegment}
          battlePassXpSegmentSpan={bpDisplay.battlePassXpSegmentSpan}
          battlePassXpSegmentComplete={bpDisplay.battlePassXpSegmentComplete}
          deployedBattlePassActive={bpDisplay.deployedActive}
          battlePassIntroAvailable={bpDisplay.battlePassIntroAvailable}
          battlePassIntroVideoUrl={bpDisplay.battlePassIntroVideoUrl}
          battlePassIntroSequence={bpDisplay.battlePassIntroSequence}
          battlePassFlowEyebrow={bpDisplay.deployedActive ? 'Live battle pass' : 'Season 1 — Flow State'}
          battlePassFlowTagline="Become a conduit."
          battlePassFlowDescription="Redirect energy with intention, purpose, and focus — the way Kon teaches. Survive the Unveiled."
          onEnergyMastery={() => navigate('/energy-mastery')}
          onBattlePassRefresh={handleBattlePassRefresh}
          deployedBattlePassSeasonId={bpIntroSeasonId}
          battlePassIntroAlreadySeen={bpIntroSeen}
          deferBattlePassIntroAuto={showSeason0Intro}
          onBattlePassIntroDismissed={handleBattlePassIntroDismissed}
          battlePassIntroStateReady={bpIntroStateReady}
        />

        {/* NPC Mission Modals */}
        {selectedNPC === 'sonido' && (
          <NPCMissionModal
            isOpen={true}
            onClose={closeNpcModal}
            npc="sonido"
            npcName="Sonido"
          />
        )}
        {selectedNPC === 'zeke' && (
          <NPCMissionModal
            isOpen={true}
            onClose={closeNpcModal}
            npc="zeke"
            npcName="Zeke"
          />
        )}
        {selectedNPC === 'luz' && (
          <NPCMissionModal
            isOpen={true}
            onClose={closeNpcModal}
            npc="luz"
            npcName="Luz"
          />
        )}
        {selectedNPC === 'kon' && (
          <NPCMissionModal
            isOpen={true}
            onClose={closeNpcModal}
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

        <WaysToEarnPowerPointsModal open={showWaysToEarnPp} onClose={() => setShowWaysToEarnPp(false)} />
      </div>
    </>
  );
};

export default Home;

