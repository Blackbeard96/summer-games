import React, { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, getDoc, collection, addDoc, serverTimestamp, getDocs, query, where, deleteField, onSnapshot, increment } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { useStory } from '../context/StoryContext';
import { Chapter, ChapterChallenge } from '../types/chapters';
import { STORY_EPISODES, StoryEpisode } from '../types/story';
import RivalSelectionModal from './RivalSelectionModal';
import CPUChallenger from './CPUChallenger';
import PortalTutorial from './PortalTutorial';
import LetterModal from './LetterModal';
import TruthMetalChoiceModal from './TruthMetalChoiceModal';
import TruthMetalTouchModal from './TruthMetalTouchModal';
import TruthBattle from './TruthBattle';
import TruthRevelationModal from './TruthRevelationModal';
import MSTInterfaceTutorial from './MSTInterfaceTutorial';
import HelaBattle from './HelaBattle';
import IcyDeathCutscene from './IcyDeathCutscene';
import ZekeEndsBattleCutscene from './ZekeEndsBattleCutscene';
import ChallengeRewardModal from './ChallengeRewardModal';
import PortalIntroModal from './PortalIntroModal';
import TimuIslandStoryModal from './TimuIslandStoryModal';
import SquadUpStoryModal from './SquadUpStoryModal';
import SonidoTransmissionModal from './SonidoTransmissionModal';
import { detectManifest, logManifestDetection } from '../utils/manifestDetection';

interface ChapterDetailProps {
  chapter: Chapter;
  onBack: () => void;
}

const ChapterDetail: React.FC<ChapterDetailProps> = ({ chapter, onBack }) => {
  const { currentUser, isAdmin } = useAuth();
  const { vault, moves, actionCards, unlockElementalMoves } = useBattle();
  const { storyProgress, getEpisodeStatus, isEpisodeUnlocked, startEpisode, isLoading: storyLoading, error: storyError } = useStory();
  const navigate = useNavigate();
  const [userProgress, setUserProgress] = useState<any>(null);
  const [studentData, setStudentData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [completingChallenge, setCompletingChallenge] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'challenges' | 'ethics'>('challenges');
  const [selectedEpisode, setSelectedEpisode] = useState<StoryEpisode | null>(null);
  const [showRivalSelectionModal, setShowRivalSelectionModal] = useState(false);
  const [showCPUBattleModal, setShowCPUBattleModal] = useState(false);
  const [showPortalTutorial, setShowPortalTutorial] = useState(false);
  const [showLetterModal, setShowLetterModal] = useState(false);
  const [showTruthMetalModal, setShowTruthMetalModal] = useState(false);
  const [showTruthMetalTouchModal, setShowTruthMetalTouchModal] = useState(false);
  const [showTruthBattle, setShowTruthBattle] = useState(false);
  const [showHelaBattle, setShowHelaBattle] = useState(false);
  const [showTruthRevelation, setShowTruthRevelation] = useState(false);
  const [truthRevealed, setTruthRevealed] = useState('');
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [chapterActivationInProgress, setChapterActivationInProgress] = useState(false);
  const [showMSTTutorial, setShowMSTTutorial] = useState(false);
  const [showIcyDeathCutscene, setShowIcyDeathCutscene] = useState(false);
  const [showZekeEndsBattleCutscene, setShowZekeEndsBattleCutscene] = useState(false);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [rewardModalData, setRewardModalData] = useState<{
    challengeTitle: string;
    rewards: any[];
    xpReward: number;
    ppReward: number;
  } | null>(null);
  const [showPortalIntroModal, setShowPortalIntroModal] = useState(false);
  const [showTimuIslandStoryModal, setShowTimuIslandStoryModal] = useState(false);
  const [showSquadUpStoryModal, setShowSquadUpStoryModal] = useState(false);
  const [showSonidoTransmissionModal, setShowSonidoTransmissionModal] = useState(false);
  const [expandedChallenges, setExpandedChallenges] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser) return;

    // Use real-time listener to automatically update when data changes
    const userRef = doc(db, 'users', currentUser.uid);
    const studentRef = doc(db, 'students', currentUser.uid);

    // Helper to check for Firestore internal errors
    const isFirestoreInternalError = (error: any): boolean => {
      if (!error) return false;
      const errorString = String(error);
      const errorMessage = error?.message || '';
      const errorStack = error?.stack || '';
      return (
        errorString.includes('INTERNAL ASSERTION FAILED') ||
        errorMessage.includes('INTERNAL ASSERTION FAILED') ||
        errorStack.includes('INTERNAL ASSERTION FAILED') ||
        errorString.includes('ID: ca9') ||
        errorString.includes('ID: b815') ||
        (errorString.includes('FIRESTORE') && errorString.includes('Unexpected state'))
      );
    };

    const unsubscribeUser = onSnapshot(userRef, (userDoc) => {
      try {
        if (userDoc.exists()) {
          const userData = userDoc.data();
          console.log('ChapterDetail: User data updated (real-time):', {
            chapterId: chapter.id,
            chapterData: userData.chapters?.[chapter.id],
            challengeData: userData.chapters?.[chapter.id]?.challenges?.['ep1-where-it-started']
          });
          setUserProgress(userData);
          setLoading(false);
        }
      } catch (error) {
        if (isFirestoreInternalError(error)) {
          return; // Ignore Firestore internal errors
        }
        console.error('ChapterDetail: Error processing user snapshot:', error);
        setLoading(false);
      }
    }, (error) => {
      if (isFirestoreInternalError(error)) {
        return; // Ignore Firestore internal errors
      }
      console.error('ChapterDetail: Error in user listener:', error);
      setLoading(false);
    });

    const unsubscribeStudent = onSnapshot(studentRef, (studentDoc) => {
      try {
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          console.log('ChapterDetail: Student data updated (real-time):', studentData);
          setStudentData(studentData);
        }
      } catch (error) {
        if (isFirestoreInternalError(error)) {
          return; // Ignore Firestore internal errors
        }
        console.error('ChapterDetail: Error processing student snapshot:', error);
      }
    }, (error) => {
      if (isFirestoreInternalError(error)) {
        return; // Ignore Firestore internal errors
      }
      console.error('ChapterDetail: Error in student listener:', error);
    });

    return () => {
      unsubscribeUser();
      unsubscribeStudent();
    };
  }, [currentUser, chapter.id]);

  // Check for battle join request from invitation acceptance
  // This runs when ChapterDetail is rendered (after chapter is selected)
  useEffect(() => {
    const joinBattleData = sessionStorage.getItem('joinBattle');
    if (joinBattleData) {
      try {
        const battleData = JSON.parse(joinBattleData);
        const { gameId, challengeId, chapterId } = battleData;
        
        // Only auto-open if this is the correct chapter
        if (chapterId === chapter.id) {
          console.log('ChapterDetail: Auto-opening battle for invited player:', battleData);
          
          // Small delay to ensure modal state is ready
          setTimeout(() => {
            // Determine which modal to open based on challengeId
            if (challengeId === 'ch2-rival-selection') {
              // Chapter 2-2: Timu Island Story Modal
              console.log('ChapterDetail: Opening TimuIslandStoryModal for battle:', gameId);
              setShowTimuIslandStoryModal(true);
              // The modal will detect the gameId and show the battle
              sessionStorage.setItem('timuIslandBattleGameId', gameId);
            } else if (challengeId === 'ch2-team-trial') {
              // Chapter 2-3: Squad Up Story Modal
              console.log('ChapterDetail: Opening SquadUpStoryModal for battle:', gameId);
              setShowSquadUpStoryModal(true);
              // The modal will detect the gameId and show the battle
              sessionStorage.setItem('squadUpBattleGameId', gameId);
            }
            
            // Clear the joinBattle flag after opening modal
            sessionStorage.removeItem('joinBattle');
          }, 100); // Small delay to ensure state is ready
        } else {
          console.warn('ChapterDetail: Battle join request for different chapter, ignoring:', {
            requestedChapter: chapterId,
            currentChapter: chapter.id
          });
          // Clear invalid joinBattle flag
          sessionStorage.removeItem('joinBattle');
        }
      } catch (error) {
        console.error('ChapterDetail: Error parsing joinBattle data:', error);
        sessionStorage.removeItem('joinBattle');
      }
    }
  }, [chapter.id]);

  const getRequirementStatus = (requirement: any) => {
    console.log('ChapterDetail: Checking requirement:', requirement.type, {
      studentData,
      userProgress,
      requirement
    });
    
    switch (requirement.type) {
      case 'manifest':
        // Use standardized manifest detection utility
        const manifestData = { studentData, userProgress };
        const hasManifest = detectManifest(manifestData);
        logManifestDetection(manifestData, 'ChapterDetail');
        return hasManifest;
      case 'artifact':
        return userProgress?.artifact?.identified;
      case 'team':
        return userProgress?.team;
      case 'rival':
        return userProgress?.rival;
      case 'veil':
        return userProgress?.veil?.isConfronted;
      case 'reflection':
        return userProgress?.reflectionEcho;
      case 'wisdom':
        return userProgress?.wisdomPoints && userProgress.wisdomPoints.length > 0;
      case 'ethics':
        return userProgress?.ethics && userProgress.ethics.length >= requirement.value;
      case 'leadership':
        return userProgress?.leadership?.role;
      case 'profile':
        return studentData?.displayName && studentData?.photoURL;
      default:
        return false;
    }
  };

  const getChallengeStatus = (challenge: ChapterChallenge) => {
    if (!userProgress) return 'locked';
    
    // CRITICAL: Verify we're checking the correct user's progress
    if (!currentUser) {
      console.warn('ChapterDetail: getChallengeStatus - No current user, returning locked');
      return 'locked';
    }
    
    // Ensure chapter.id is used as a string key (Firestore uses string keys)
    const chapterKey = String(chapter.id);
    const chapterProgress = userProgress.chapters?.[chapterKey];
    const challengeIndex = chapter.challenges.findIndex(c => c.id === challenge.id);
    
    // Special case: For Chapter 2, if it's the first challenge, it should be available if Chapter 2 is accessible
    // Chapter 2 is always available (per ChapterTracker logic), so Chapter 2-1 should always be available
    // This check happens BEFORE the chapterProgress check so it works even if progress doesn't exist yet
    if (chapter.id === 2 && challengeIndex === 0) {
      console.log(`ChapterDetail: Challenge ${challenge.id} is available - first challenge in Chapter 2 (Chapter 2 is always available)`);
      return 'available';
    }
    
    if (!chapterProgress) {
      console.log('ChapterDetail: getChallengeStatus - No chapter progress found:', {
        userId: currentUser.uid,
        chapterId: chapter.id,
        chapterKey: chapterKey,
        availableKeys: userProgress.chapters ? Object.keys(userProgress.chapters) : 'no chapters'
      });
      return 'locked';
    }
    
    const challengeProgress = chapterProgress.challenges?.[challenge.id];
    console.log('ChapterDetail: getChallengeStatus - Challenge progress:', {
      userId: currentUser.uid,
      challengeId: challenge.id,
      challengeProgress: challengeProgress,
      allChallenges: chapterProgress.challenges ? Object.keys(chapterProgress.challenges) : 'no challenges'
    });
    
    // Check if challenge is pending approval first
    if (pendingSubmissions[challenge.id]) return 'pending';
    
    // Check if challenge is completed
    // For Challenge 7 (Hela Awakened), only mark as completed if it was actually completed through battle
    // Don't mark as completed if it was auto-completed (which shouldn't happen anymore, but check anyway)
    if (challenge.id === 'ep1-update-profile') {
      // Challenge 7 requires actual battle completion - check for iceGolemsDefeated or helaDefeated flag
      const wasBattleCompleted = challengeProgress?.iceGolemsDefeated === true || 
                                 challengeProgress?.helaDefeated === true ||
                                 (challengeProgress?.isCompleted === true && challengeProgress?.autoCompleted !== true);
      if (wasBattleCompleted && (challengeProgress?.status === 'approved' || challengeProgress?.isCompleted)) {
        console.log('ChapterDetail: getChallengeStatus - Challenge completed (battle):', {
          userId: currentUser.uid,
          challengeId: challenge.id,
          completedBy: challengeProgress?.completedBy
        });
        return 'completed';
      }
    } else {
      // For other challenges, use standard completion check
      // CRITICAL: Verify completion is for the current user
      if (challengeProgress?.status === 'approved' || challengeProgress?.isCompleted === true) {
        // Log completion details for debugging
        console.log('ChapterDetail: getChallengeStatus - Challenge completed:', {
          userId: currentUser.uid,
          challengeId: challenge.id,
          completedBy: challengeProgress?.completedBy,
          completedAt: challengeProgress?.completedAt
        });
        return 'completed';
      }
    }
    
    // Check if previous challenge is completed (sequential unlocking)
    // This applies to ALL challenges except the first one
    let previousChallengeCompleted = true; // First challenge has no previous challenge
    if (challengeIndex > 0) {
      // Not the first challenge - check if previous challenge is completed
      const previousChallenge = chapter.challenges[challengeIndex - 1];
      const previousChallengeProgress = chapterProgress.challenges?.[previousChallenge.id];
      previousChallengeCompleted = previousChallengeProgress?.isCompleted || previousChallengeProgress?.status === 'approved';
      
      if (!previousChallengeCompleted) {
        console.log(`ChapterDetail: Challenge ${challenge.id} is locked - previous challenge ${previousChallenge.id} not completed`);
        return 'locked';
      }
    }
    
    // If previous challenge is completed, the challenge is available (unlocked)
    // Requirements are checked separately for auto-completion, but don't block availability
    if (previousChallengeCompleted && chapterProgress.isActive) {
      console.log(`ChapterDetail: Challenge ${challenge.id} is available - previous challenge completed`);
      return 'available';
    }
    
    // If no requirements and chapter is active, challenge is available
    if (!challenge.requirements || challenge.requirements.length === 0) {
      console.log(`ChapterDetail: Challenge ${challenge.id} has no requirements - available`);
      return chapterProgress.isActive ? 'available' : 'locked';
    }
    
    // Check if challenge requirements are met (for auto-completion purposes, but availability is already determined above)
    const requirementsMet = challenge.requirements.every(req => {
      console.log(`ChapterDetail: Checking requirement: ${req.type} = ${req.value}`);
      
      switch (req.type) {
        case 'artifact':
          // Handle specific artifact requirements
          if (req.value === 'letter_received') {
            const letterChallenge = userProgress?.chapters?.[1]?.challenges?.['ep1-get-letter'];
            return letterChallenge?.isCompleted && letterChallenge?.letterReceived;
          } else if (req.value === 'chose_truth_metal') {
            const truthMetalChoice = userProgress?.chapters?.[1]?.challenges?.['ep1-truth-metal-choice'];
            return truthMetalChoice?.isCompleted;
          } else if (req.value === 'truth_metal_currency') {
            const truthMetalTouch = userProgress?.chapters?.[1]?.challenges?.['ep1-touch-truth-metal'];
            return truthMetalTouch?.isCompleted;
          } else if (req.value === 'ui_explored') {
            const uiChallenge = userProgress?.chapters?.[1]?.challenges?.['ep1-view-mst-ui'];
            return uiChallenge?.isCompleted;
          } else if (req.value === 'first_combat') {
            const combatChallenge = userProgress?.chapters?.[1]?.challenges?.['ep1-combat-drill'];
            return combatChallenge?.isCompleted;
          } else if (req.value === 'giant_ice_golem_cutscene_seen') {
            // Check if the player has seen the Giant Ice Golem cutscene
            // Also check if Challenge 7 is completed as a fallback
            const challenge7Completed = userProgress?.chapters?.[1]?.challenges?.['ep1-update-profile']?.isCompleted;
            const cutsceneSeen = studentData?.artifacts?.giant_ice_golem_cutscene_seen === true;
            return cutsceneSeen || challenge7Completed === true;
          } else if (req.value === 'power_card_discovered') {
            const powerCardChallenge = userProgress?.chapters?.[1]?.challenges?.['ep1-power-card-intro'];
            return powerCardChallenge?.isCompleted;
          } else if (req.value === 'elemental_ring_level_1') {
            // Check if Challenge 8 is completed (which grants the Elemental Ring)
            // OR check if the artifact exists in student's artifacts
            const challenge8Completed = userProgress?.chapters?.[1]?.challenges?.['ep1-view-power-card']?.isCompleted;
            const hasElementalRing = studentData?.artifacts?.elemental_ring_level_1 === true;
            console.log('ChapterDetail: Checking elemental_ring_level_1 requirement:', {
              challenge8Completed,
              hasElementalRing,
              studentArtifacts: studentData?.artifacts
            });
            return challenge8Completed === true || hasElementalRing === true;
          } else {
            // Fallback to generic artifact check
            return userProgress.artifact?.identified;
          }
        case 'team':
          // For team requirements, we'll check squad membership in the auto-completion logic
          return true; // Let auto-completion handle this
        case 'rival':
          return userProgress.rival;
        case 'veil':
          return userProgress.veil?.isConfronted;
        case 'reflection':
          return userProgress.reflectionEcho;
        case 'wisdom':
          return userProgress.wisdomPoints && userProgress.wisdomPoints.length > 0;
        case 'ethics':
          return userProgress.ethics && userProgress.ethics.length >= req.value;
        case 'manifest':
          // Handle specific manifest requirements
          if (req.value === 'chosen') {
            const manifestChallenge = userProgress?.chapters?.[1]?.challenges?.['ep1-power-card-intro'];
            return manifestChallenge?.isCompleted;
          } else {
            // Check if player has chosen a manifest (from multiple possible locations)
            return studentData?.manifest?.manifestId || 
                   studentData?.manifestationType || 
                   studentData?.manifest ||
                   userProgress?.manifest ||
                   userProgress?.manifestationType;
          }
        case 'leadership':
          return userProgress.leadership?.role;
        case 'profile':
          // Handle specific profile requirements
          if (req.value === 'completed') {
            const profileChallenge = userProgress?.chapters?.[1]?.challenges?.['ep1-update-profile'];
            return profileChallenge?.isCompleted;
          } else if (req.value === 'power_card_viewed') {
            const powerCardChallenge = userProgress?.chapters?.[1]?.challenges?.['ep1-view-power-card'];
            return powerCardChallenge?.isCompleted;
          } else {
            return studentData?.displayName && studentData?.photoURL;
          }
        case 'ability':
          if (req.value === 'first_combat') {
            const combatChallenge = userProgress?.chapters?.[1]?.challenges?.['ep1-combat-drill'];
            return combatChallenge?.isCompleted;
          } else {
            console.warn(`ChapterDetail: Unknown ability requirement: ${req.value}`);
            return false;
          }
        case 'challenge':
          // Check if a specific challenge is completed
          // req.value should be the challenge ID (e.g., 'ch2-team-trial')
          const requiredChallengeId = req.value;
          const requiredChallenge = userProgress?.chapters?.[chapter.id]?.challenges?.[requiredChallengeId];
          const isCompleted = requiredChallenge?.isCompleted || requiredChallenge?.status === 'approved';
          console.log(`ChapterDetail: Checking challenge requirement ${requiredChallengeId}:`, {
            found: !!requiredChallenge,
            isCompleted,
            status: requiredChallenge?.status
          });
          return isCompleted;
        default:
          console.warn(`ChapterDetail: Unknown requirement type: ${req.type}`);
          return true;
      }
    });
    
    // Ensure chapter is active before allowing challenge completion
    if (!chapterProgress.isActive) {
      return 'locked';
    }
    
    return requirementsMet ? 'available' : 'locked';
  };

  // Add state to track pending submissions
  const [pendingSubmissions, setPendingSubmissions] = useState<{[key: string]: boolean}>({});

  // Function to check and auto-complete challenges
  // Function to auto-complete a challenge and unlock the next one
  const handleAutoCompleteChallenge = async (challenge: ChapterChallenge, showModal: boolean = true) => {
    if (!currentUser) return;

    try {
      // Use canonical progression engine to mark challenge as completed and unlock next content
      const { updateProgressOnChallengeComplete } = await import('../utils/chapterProgression');
      
      const progressionResult = await updateProgressOnChallengeComplete(
        currentUser.uid,
        chapter.id,
        challenge.id
      );
      
      if (progressionResult.alreadyCompleted) {
        if (showModal) {
          alert('This challenge has already been completed!');
        }
        return;
      }
      
      if (!progressionResult.success) {
        console.error('Failed to update progression:', progressionResult.error);
        if (showModal) {
          alert('Failed to save challenge completion. Please try again.');
        }
        return;
      }
      
      // Log progression results
      if (progressionResult.challengeUnlocked) {
        console.log(`✅ Next challenge unlocked: ${progressionResult.challengeUnlocked}`);
      }
      if (progressionResult.chapterUnlocked) {
        console.log(`🎉 Next chapter unlocked: ${progressionResult.chapterUnlocked}`);
      }

      // Get userRef for reward granting and refresh
      const userRef = doc(db, 'users', currentUser.uid);

      // SECURITY FIX: Use centralized idempotent reward granting service
      // This ensures rewards can only be granted once, even if challenge is reset and re-completed
      const { grantChallengeRewards } = await import('../utils/challengeRewards');
      
      const rewardResult = await grantChallengeRewards(
        currentUser.uid,
        challenge.id,
        challenge.rewards,
        challenge.title
      );

      if (rewardResult.success && !rewardResult.alreadyClaimed) {
        console.log(`✅ handleAutoCompleteChallenge: Rewards granted successfully:`, rewardResult.rewardsGranted);
        
        // Parse rewards for notification and modal
        const xpReward = challenge.rewards.find(r => r.type === 'xp')?.value || 0;
        const ppReward = challenge.rewards.find(r => r.type === 'pp')?.value || 0;
        const truthMetalReward = challenge.rewards.find(r => r.type === 'truthMetal')?.value || 0;

        // Add notification
        await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
          type: 'challenge_completed',
          message: `🎉 Challenge "${challenge.title}" completed! You earned ${xpReward} XP and ${ppReward} PP.`,
          challengeId: challenge.id,
          challengeName: challenge.title,
          xpReward: xpReward,
          ppReward: ppReward,
          timestamp: serverTimestamp(),
          read: false
        });
      } else if (rewardResult.alreadyClaimed) {
        console.log(`🎁 handleAutoCompleteChallenge: Rewards were already claimed for challenge ${challenge.id}`);
        if (showModal) {
          alert('This challenge has already been completed and rewards were already claimed!');
        }
        return;
      } else {
        console.error(`❌ handleAutoCompleteChallenge: Failed to grant rewards:`, rewardResult.error);
        if (showModal) {
          alert('Failed to grant rewards. Please contact support if this persists.');
        }
        return;
      }

      // Progression engine already handled unlocking next challenge/chapter (see progressionResult above)

      // Show reward modal only if requested and challenge wasn't already completed
      // The check at the top of the function already returns early if completed,
      // so if we reach here, the challenge was just completed for the first time
      if (showModal && rewardResult.success && !rewardResult.alreadyClaimed) {
        // Format rewards for the modal
        const artifactRewards = challenge.rewards.filter(r => r.type === 'artifact');
        const truthMetalReward = challenge.rewards.find(r => r.type === 'truthMetal')?.value || 0;
        const xpReward = challenge.rewards.find(r => r.type === 'xp')?.value || 0;
        const ppReward = challenge.rewards.find(r => r.type === 'pp')?.value || 0;
        
        const rewardModalRewards = [
          ...artifactRewards.map(r => ({
            type: r.type as 'artifact',
            value: r.value,
            name: r.description
          })),
          ...(truthMetalReward > 0 ? [{
            type: 'truthMetal' as const,
            value: truthMetalReward
          }] : [])
        ];

        setRewardModalData({
          challengeTitle: challenge.title,
          rewards: rewardModalRewards,
          xpReward: xpReward as number,
          ppReward: ppReward as number
        });
        setShowRewardModal(true);
      }
      
      // Refresh user progress to trigger requirement checks for next challenge
      const refreshedUserDoc = await getDoc(userRef);
      if (refreshedUserDoc.exists()) {
        setUserProgress(refreshedUserDoc.data());
      }
      
      // Trigger auto-completion check to unlock next challenge
      setTimeout(() => {
        checkAndAutoCompleteChallenges();
      }, 500);
    } catch (error) {
      console.error('Error auto-completing challenge:', error);
      if (showModal) {
        alert('Failed to complete challenge. Please try again.');
      }
    }
  };

  const checkAndAutoCompleteChallenges = async () => {
    console.log('ChapterDetail: checkAndAutoCompleteChallenges called', {
      currentUser: !!currentUser,
      userProgress: !!userProgress,
      chapterId: chapter.id
    });
    
    if (!currentUser || !userProgress) {
      console.log('ChapterDetail: Missing currentUser or userProgress, returning');
      return;
    }

    const chapterProgress = userProgress.chapters?.[chapter.id];
    console.log('ChapterDetail: Chapter progress:', chapterProgress);
    
    // If chapter is completed but not active, reactivate this chapter so challenges can be accessed
    if (chapterProgress?.isCompleted && !chapterProgress?.isActive && !chapterActivationInProgress) {
      console.log('ChapterDetail: Chapter completed but not active, reactivating this chapter...');
      
      setChapterActivationInProgress(true);
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const studentRef = doc(db, 'students', currentUser.uid);
        
        await updateDoc(userRef, {
          [`chapters.${chapter.id}.isActive`]: true
        });
        
        await updateDoc(studentRef, {
          [`chapters.${chapter.id}.isActive`]: true
        });
        
        console.log(`ChapterDetail: Chapter ${chapter.id} reactivated successfully!`);
        
        // Refresh user data
        const userDocRefresh = await getDoc(userRef);
        if (userDocRefresh.exists()) {
          const userDataRefresh = userDocRefresh.data();
          setUserProgress(userDataRefresh);
        }
        
        setChapterActivationInProgress(false);
        return;
      } catch (error) {
        console.error('ChapterDetail: Error reactivating chapter:', error);
        setChapterActivationInProgress(false);
      }
    }
    
    if (!chapterProgress?.isActive) {
      console.log('ChapterDetail: Chapter not active, returning');
      return;
    }

    // Check if user is in a squad
    let isInSquad = false;
    try {
      console.log('ChapterDetail: Checking squad membership for user:', currentUser.uid);
      const squadsSnapshot = await getDocs(collection(db, 'squads'));
      console.log('ChapterDetail: Found squads:', squadsSnapshot.docs.length);
      
      isInSquad = squadsSnapshot.docs.some(doc => {
        const squadData = doc.data();
        console.log('ChapterDetail: Squad data:', { id: doc.id, name: squadData.name, members: squadData.members?.length || 0 });
        const isMember = squadData.members && squadData.members.some((member: any) => member.uid === currentUser.uid);
        if (isMember) {
          console.log('ChapterDetail: User is member of squad:', squadData.name);
        }
        return isMember;
      });
      console.log('ChapterDetail: User squad membership check result:', { isInSquad, userId: currentUser.uid });
    } catch (error) {
      console.error('Error checking squad membership:', error);
    }

    for (const challenge of chapter.challenges) {
      console.log('ChapterDetail: Checking challenge:', challenge.id, challenge.title);
      const challengeProgress = chapterProgress.challenges?.[challenge.id];
      console.log('ChapterDetail: Challenge progress:', challengeProgress);
      
      // Skip if already completed or pending
      if (challengeProgress?.isCompleted || challengeProgress?.status === 'approved' || pendingSubmissions[challenge.id]) {
        console.log('ChapterDetail: Skipping challenge (already completed/pending):', challenge.id);
        continue;
      }

      // Store whether challenge was already completed (before auto-completing)
      const wasAlreadyCompleted = challengeProgress?.isCompleted || challengeProgress?.status === 'approved';

      // Check if challenge should be auto-completed
      let shouldAutoComplete = false;
      
      switch (challenge.id) {
        case 'ch2-team-formation':
          // Auto-complete if user is in a squad
          shouldAutoComplete = isInSquad;
          console.log('ChapterDetail: Team formation challenge auto-complete check:', { shouldAutoComplete, isInSquad });
          break;
        case 'ch2-rival-selection':
          // Auto-complete if user has chosen a rival
          shouldAutoComplete = !!userProgress.rival;
          console.log('ChapterDetail: Rival selection challenge auto-complete check:', { shouldAutoComplete, hasRival: !!userProgress.rival });
          break;
        case 'ep1-update-profile':
          // Challenge 7 "Hela Awakened" is now a battle challenge - cannot be auto-completed
          // Must be completed by winning the 4-on-1 battle against Ice Golems
          shouldAutoComplete = false;
          console.log('ChapterDetail: Hela Awakened challenge - battle required, cannot auto-complete');
          break;
        case 'ep1-power-card-intro':
          // Auto-complete if Power Card has been customized (description, background, or image)
          const hasPowerCardCustomization = !!(studentData?.powerCardDescription || 
                                               studentData?.powerCardBackground || 
                                               studentData?.powerCardImage ||
                                               studentData?.photoURL); // Profile picture counts as Power Card image
          shouldAutoComplete = hasPowerCardCustomization;
          console.log('ChapterDetail: Power Card discovery challenge auto-complete check:', { 
            shouldAutoComplete, 
            hasPowerCardDescription: !!studentData?.powerCardDescription,
            hasPowerCardBackground: !!studentData?.powerCardBackground,
            hasPowerCardImage: !!studentData?.powerCardImage,
            hasProfilePicture: !!studentData?.photoURL,
            studentDataKeys: studentData ? Object.keys(studentData) : 'no studentData',
            photoURLValue: studentData?.photoURL,
            displayNameValue: studentData?.displayName
          });
          break;
        default:
          // For other challenges, check if they have no requirements and are team-type
          shouldAutoComplete = challenge.type === 'team' && challenge.requirements.length === 0;
          console.log('ChapterDetail: Default challenge auto-complete check:', { shouldAutoComplete, challengeType: challenge.type, requirementsLength: challenge.requirements.length });
      }

      if (shouldAutoComplete) {
        // Double-check that challenge wasn't already completed (race condition protection)
        // Read from Firestore to get the latest state
        const userRef = doc(db, 'users', currentUser.uid);
        const userDocCheck = await getDoc(userRef);
        const userProgressCheck = userDocCheck.exists() ? userDocCheck.data() : {};
        const challengeProgressCheck = userProgressCheck.chapters?.[chapter.id]?.challenges?.[challenge.id];
        
        if (challengeProgressCheck?.isCompleted || challengeProgressCheck?.status === 'approved') {
          console.log(`ChapterDetail: Challenge ${challenge.id} was already completed in Firestore, skipping auto-complete`);
          continue;
        }
        
        console.log(`Auto-completing challenge: ${challenge.id}`);
        const studentRef = doc(db, 'students', currentUser.uid);
        
        // Update user progress
        const updatedChapters = {
          ...userProgress.chapters,
          [chapter.id]: {
            ...userProgress.chapters?.[chapter.id],
            challenges: {
              ...userProgress.chapters?.[chapter.id]?.challenges,
              [challenge.id]: {
                isCompleted: true,
                status: 'approved',
                completedAt: serverTimestamp()
              }
            }
          }
        };

        // Apply rewards
        const xpReward = challenge.rewards.find(r => r.type === 'xp')?.value || 0;
        const ppReward = challenge.rewards.find(r => r.type === 'pp')?.value || 0;
        const truthMetalReward = challenge.rewards.find(r => r.type === 'truthMetal')?.value || 0;
        const artifactRewards = challenge.rewards.filter(r => r.type === 'artifact');

        // Update user progress with rewards using atomic increments
        await updateDoc(userRef, {
          chapters: updatedChapters,
          xp: increment(xpReward),
          powerPoints: increment(ppReward),
          truthMetal: increment(truthMetalReward)
        });

        // Update student data (legacy system) using atomic increments
        const studentDoc = await getDoc(studentRef);
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          const updatedChallenges = {
            ...studentData.challenges,
            [challenge.id]: {
              completed: true,
              status: 'approved',
              completedAt: serverTimestamp()
            }
          };
          
          // Grant artifact rewards
          const currentArtifacts = studentData.artifacts || {};
          const updatedArtifacts = { ...currentArtifacts };
          
          artifactRewards.forEach(artifactReward => {
            updatedArtifacts[artifactReward.value] = true;
          });
          
          await updateDoc(studentRef, {
            challenges: updatedChallenges,
            xp: increment(xpReward),
            powerPoints: increment(ppReward),
            truthMetal: increment(truthMetalReward),
            artifacts: updatedArtifacts
          });
          
          // Elemental Ring is granted, but player will choose their element on the Artifacts page
          // No need to unlock moves here - the modal on Artifacts page will handle element selection
        }

        // Double-check that challenge wasn't already completed before showing modal
        // This prevents the modal from showing if the challenge was already completed
        const userDocAfterUpdate = await getDoc(userRef);
        const userProgressAfterUpdate = userDocAfterUpdate.exists() ? userDocAfterUpdate.data() : {};
        const challengeProgressAfterUpdate = userProgressAfterUpdate.chapters?.[chapter.id]?.challenges?.[challenge.id];
        
        // Only show reward modal if this was a new completion (not already completed)
        const wasNewlyCompleted = !wasAlreadyCompleted && 
                                  (challengeProgressAfterUpdate?.isCompleted || challengeProgressAfterUpdate?.status === 'approved');
        
        if (wasNewlyCompleted) {
          // Add notification
          await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
            type: 'challenge_completed',
            message: `🎉 Challenge "${challenge.title}" completed automatically! You earned ${xpReward} XP and ${ppReward} PP.`,
            challengeId: challenge.id,
            challengeName: challenge.title,
            xpReward: xpReward,
            ppReward: ppReward,
            timestamp: serverTimestamp(),
            read: false
          });

          // Show reward modal only on first completion
          setRewardModalData({
            challengeTitle: challenge.title,
            rewards: challenge.rewards,
            xpReward,
            ppReward
          });
          setShowRewardModal(true);
        }

        // Unlock the next challenge in the same chapter
        const currentChallengeIndex = chapter.challenges.findIndex(c => c.id === challenge.id);
        if (currentChallengeIndex >= 0 && currentChallengeIndex < chapter.challenges.length - 1) {
          const nextChallenge = chapter.challenges[currentChallengeIndex + 1];
          console.log('Auto-complete: Next challenge will be unlocked when requirements are checked:', nextChallenge.id);
          // Refresh user progress to trigger requirement checks for next challenge
          const refreshedUserDoc = await getDoc(userRef);
          if (refreshedUserDoc.exists()) {
            setUserProgress(refreshedUserDoc.data());
          }
        }

        // If this is Chapter 1 Challenge 7 (ep1-combat-drill), unlock elemental moves
        if (challenge.id === 'ep1-combat-drill') {
          try {
            // Get user's element from student data
            const studentDoc = await getDoc(doc(db, 'students', currentUser.uid));
            if (studentDoc.exists()) {
              const studentData = studentDoc.data();
              const userElement = studentData.elementalAffinity?.toLowerCase() || 
                                 studentData.manifestationType?.toLowerCase() || 
                                 'fire';
              
              console.log(`ChapterDetail: Unlocking elemental moves for element: ${userElement}`);
              await unlockElementalMoves(userElement);
              
              // Add notification about elemental moves unlock
              await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
                type: 'elemental_moves_unlocked',
                message: `⚡ Elemental moves unlocked! You can now use ${userElement} elemental moves in battle!`,
                timestamp: serverTimestamp(),
                read: false
              });
            }
          } catch (error) {
            console.error('Error unlocking elemental moves:', error);
          }
        }
      }
    }
  };

  // Fetch pending submissions and check auto-completion on component mount
  useEffect(() => {
    if (!currentUser) return;

    const fetchPendingSubmissions = async () => {
      try {
        const submissionsQuery = query(
          collection(db, 'challengeSubmissions'),
          where('userId', '==', currentUser.uid),
          where('chapterId', '==', chapter.id),
          where('status', '==', 'pending')
        );
        const submissionsSnapshot = await getDocs(submissionsQuery);
        
        const pending: {[key: string]: boolean} = {};
        submissionsSnapshot.forEach(doc => {
          const data = doc.data();
          pending[data.challengeId] = true;
        });
        
        setPendingSubmissions(pending);
      } catch (error) {
        console.error('Error fetching pending submissions:', error);
      }
    };

    fetchPendingSubmissions();
  }, [currentUser, chapter.id]);

  // Check for auto-completion when user progress changes
  useEffect(() => {
    if (userProgress && studentData) {
      console.log('ChapterDetail: Triggering auto-completion check...', {
        userProgress: !!userProgress,
        studentData: !!studentData,
        chapterId: chapter.id
      });
      
      // Check if any chapter is active, if not, activate Chapter 1
      const chapters = userProgress.chapters || {};
      let hasActiveChapter = false;
      for (let i = 1; i <= 9; i++) {
        if (chapters[i]?.isActive) {
          hasActiveChapter = true;
          break;
        }
      }
      
      if (!hasActiveChapter && !chapterActivationInProgress) {
        console.log('ChapterDetail: No active chapters found, activating Chapter 1...');
        setChapterActivationInProgress(true);
        const activateChapter1 = async () => {
          try {
            const userRef = doc(db, 'users', currentUser!.uid);
            const studentRef = doc(db, 'students', currentUser!.uid);
            
            await updateDoc(userRef, {
              'chapters.1.isActive': true,
              'chapters.1.unlockDate': new Date()
            });
            
            await updateDoc(studentRef, {
              'chapters.1.isActive': true,
              'chapters.1.unlockDate': new Date()
            });
            
            console.log('ChapterDetail: Chapter 1 activated successfully!');
            
            // Refresh user data
            const userDocRefresh = await getDoc(userRef);
            if (userDocRefresh.exists()) {
              const userDataRefresh = userDocRefresh.data();
              setUserProgress(userDataRefresh);
            }
            
            setChapterActivationInProgress(false);
          } catch (error) {
            console.error('ChapterDetail: Error activating Chapter 1:', error);
            setChapterActivationInProgress(false);
          }
        };
        activateChapter1();
      } else if (hasActiveChapter) {
        checkAndAutoCompleteChallenges();
      }
    }
  }, [userProgress, studentData]);

  // Also check for auto-completion on component mount
  useEffect(() => {
    if (userProgress && studentData) {
      console.log('ChapterDetail: Initial auto-completion check on mount...');
      checkAndAutoCompleteChallenges();
    }
  }, []);

  const handleRivalSelected = (rivalId: string, rivalName: string) => {
    // Refresh user data to show the selected rival
    if (currentUser) {
      const fetchUserData = async () => {
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) {
            setUserProgress(userDoc.data());
          }
        } catch (error) {
          console.error('Error refreshing user data:', error);
        }
      };
      fetchUserData();
    }
  };

  const handleCPUBattleComplete = async (victory: boolean, xpGained: number, ppGained: number) => {
    if (!currentUser) return;

    try {
      console.log('CPU Battle completed:', { victory, xpGained, ppGained, completingChallenge });
      
      // Determine which challenge is being completed
      const challengeId = completingChallenge || 'ep1-manifest-test'; // Default to manifest test if not set
      const challengeName = challengeId === 'ep1-combat-drill' ? '1st Combat Drill' : 'Test Awakened Abilities';
      
      if (victory) {
        if (!isReplayMode) {
          // Update user progress to mark the challenge as completed (only if not in replay mode)
          const userRef = doc(db, 'users', currentUser.uid);
          const currentData = userProgress || {};
          
          const updatedChapters = {
            ...currentData.chapters,
            [chapter.id]: {
              ...currentData.chapters?.[chapter.id],
              challenges: {
                ...currentData.chapters?.[chapter.id]?.challenges,
                [challengeId]: {
                  isCompleted: true,
                  completedAt: serverTimestamp(),
                  autoCompleted: true,
                  battleVictory: true,
                  xpGained: xpGained,
                  ppGained: ppGained
                }
              }
            }
          };

          await updateDoc(userRef, {
            chapters: updatedChapters
          });

          // Add to challenge submissions for tracking (auto-completed)
          await addDoc(collection(db, 'challengeSubmissions'), {
            userId: currentUser.uid,
            displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
            email: currentUser.email || '',
            photoURL: currentUser.photoURL || '',
            challengeId: challengeId,
            challengeName: challengeName,
            submissionType: 'auto_completed',
            status: 'approved',
            timestamp: serverTimestamp(),
            xpReward: xpGained,
            ppReward: ppGained,
            manifestationType: 'Chapter Challenge',
            character: 'CPU Challenger',
            autoCompleted: true,
            battleVictory: true
          });

          // Create notification for challenge completion
          await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
            type: 'challenge_completed',
            message: `🎉 Challenge "${challengeName}" completed! You defeated the CPU challenger and earned +${xpGained} XP and +${ppGained} PP!`,
            challengeId: challengeId,
            challengeName: challengeName,
            xpReward: xpGained,
            ppReward: ppGained,
            timestamp: serverTimestamp(),
            read: false
          });

          // Apply rewards to both collections
          const studentRef = doc(db, 'students', currentUser.uid);
          const userDocRewards = await getDoc(userRef);
          const userDataRewards = userDocRewards.exists() ? userDocRewards.data() : {};
          await updateDoc(userRef, {
            xp: (userDataRewards.xp || 0) + xpGained,
            powerPoints: (userDataRewards.powerPoints || 0) + ppGained
          });

          const studentDocRewards = await getDoc(studentRef);
          if (studentDocRewards.exists()) {
            const studentDataRewards = studentDocRewards.data();
            await updateDoc(studentRef, {
              xp: (studentDataRewards.xp || 0) + xpGained,
              powerPoints: (studentDataRewards.powerPoints || 0) + ppGained
            });
          }

          // If this is Chapter 1 Challenge 7 (ep1-combat-drill), unlock elemental moves
          if (challengeId === 'ep1-combat-drill') {
            try {
              // Get user's element from student data
              const studentDoc = await getDoc(studentRef);
              if (studentDoc.exists()) {
                const studentData = studentDoc.data();
                const userElement = studentData.elementalAffinity?.toLowerCase() || 
                                   studentData.manifestationType?.toLowerCase() || 
                                   'fire';
                
                console.log(`ChapterDetail: Unlocking elemental moves for element: ${userElement}`);
                await unlockElementalMoves(userElement);
                
                // Add notification about elemental moves unlock
                await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
                  type: 'elemental_moves_unlocked',
                  message: `⚡ Elemental moves unlocked! You can now use ${userElement} elemental moves in battle!`,
                  timestamp: serverTimestamp(),
                  read: false
                });
              }
            } catch (error) {
              console.error('Error unlocking elemental moves:', error);
            }
          }

          // Find challenge to get full rewards list
          const challenge = chapter.challenges.find(c => c.id === challengeId);
          if (challenge && !isReplayMode) {
            setRewardModalData({
              challengeTitle: challenge.title,
              rewards: challenge.rewards,
              xpReward: xpGained,
              ppReward: ppGained
            });
            setShowRewardModal(true);
          }
        }
        
        if (isReplayMode) {
          alert(`🎉 Battle completed! You defeated the CPU challenger again! This was a replay - no rewards earned.`);
        }
      } else {
        alert('💪 The CPU challenger proved too strong this time. Try again to test your awakened abilities!');
      }
      
      // Reset completing challenge state
      setCompletingChallenge(null);
      
      // Close the battle modal and reset replay mode
      setShowCPUBattleModal(false);
      setIsReplayMode(false);
      
    } catch (error) {
      console.error('Error handling CPU battle completion:', error);
      alert('Failed to process battle results. Please try again.');
    }
  };

  const handleTutorialComplete = async () => {
    if (!currentUser) return;

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const studentRef = doc(db, 'students', currentUser.uid);

      // Find challenge to get rewards
      const challenge = chapter.challenges.find(c => c.id === 'ep1-portal-sequence');
      const xpReward = challenge?.rewards.find(r => r.type === 'xp')?.value || 20;
      const ppReward = challenge?.rewards.find(r => r.type === 'pp')?.value || 10;

      // Apply rewards to both collections
      const userDocRewards = await getDoc(userRef);
      const userDataRewards = userDocRewards.exists() ? userDocRewards.data() : {};
      await updateDoc(userRef, {
        xp: (userDataRewards.xp || 0) + xpReward,
        powerPoints: (userDataRewards.powerPoints || 0) + ppReward
      });

      const studentDocRewards = await getDoc(studentRef);
      if (studentDocRewards.exists()) {
        const studentDataRewards = studentDocRewards.data();
        await updateDoc(studentRef, {
          xp: (studentDataRewards.xp || 0) + xpReward,
          powerPoints: (studentDataRewards.powerPoints || 0) + ppReward
        });
      }

      // Create notification for challenge completion
      await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
        type: 'challenge_completed',
        message: `🎉 Tutorial completed! You now understand how to navigate Xiotein School. You earned +${xpReward} XP and +${ppReward} PP!`,
        challengeId: 'ep1-portal-sequence',
        challengeName: 'Navigate the Portal',
        xpReward: xpReward,
        ppReward: ppReward,
        timestamp: serverTimestamp(),
        read: false
      });
      
      // Close the tutorial modal
      setShowPortalTutorial(false);

      // Show reward modal
      if (challenge) {
        setRewardModalData({
          challengeTitle: challenge.title,
          rewards: challenge.rewards,
          xpReward,
          ppReward
        });
        setShowRewardModal(true);
      }
      
    } catch (error) {
      console.error('Error handling tutorial completion:', error);
      alert('Failed to process tutorial completion. Please try again.');
    }
  };

  const handleMSTTutorialComplete = async () => {
    if (!currentUser) return;

    try {
      // Mark the MST UI challenge as completed
      const userRef = doc(db, 'users', currentUser.uid);
      const studentRef = doc(db, 'students', currentUser.uid);
      
      const updatedChapters = {
        ...userProgress.chapters,
        [chapter.id]: {
          ...userProgress.chapters[chapter.id],
          challenges: {
            ...userProgress.chapters[chapter.id]?.challenges,
            'ep1-view-mst-ui': {
              isCompleted: true,
              status: 'approved',
              completedAt: serverTimestamp(),
              tutorialCompleted: true
            }
          }
        }
      };
      
      await updateDoc(userRef, {
        chapters: updatedChapters
      });

      // Update local state to reflect the completion
      setUserProgress((prev: any) => ({
        ...prev,
        chapters: updatedChapters
      }));

      // Create notification for challenge completion
      await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
        type: 'challenge_completed',
        message: `🎉 MST Interface Tutorial completed! You now understand the four main areas of Xiotein School. You earned +25 XP and +10 PP!`,
        challengeId: 'ep1-view-mst-ui',
        challengeName: 'MST Interface Tutorial',
        xpReward: 25,
        ppReward: 10,
        timestamp: serverTimestamp(),
        read: false
      });
      
      // Find challenge to get rewards
      const challenge = chapter.challenges.find(c => c.id === 'ep1-view-mst-ui');
      const xpReward = challenge?.rewards.find(r => r.type === 'xp')?.value || 25;
      const ppReward = challenge?.rewards.find(r => r.type === 'pp')?.value || 10;

      // Apply rewards to both collections
      const userDocRewards = await getDoc(userRef);
      const userDataRewards = userDocRewards.exists() ? userDocRewards.data() : {};
      await updateDoc(userRef, {
        xp: (userDataRewards.xp || 0) + xpReward,
        powerPoints: (userDataRewards.powerPoints || 0) + ppReward
      });

      const studentDocRewards = await getDoc(studentRef);
      if (studentDocRewards.exists()) {
        const studentDataRewards = studentDocRewards.data();
        await updateDoc(studentRef, {
          xp: (studentDataRewards.xp || 0) + xpReward,
          powerPoints: (studentDataRewards.powerPoints || 0) + ppReward
        });
      }

      // Close the tutorial modal
      setShowMSTTutorial(false);

      // Show reward modal
      if (challenge) {
        setRewardModalData({
          challengeTitle: challenge.title,
          rewards: challenge.rewards,
          xpReward,
          ppReward
        });
        setShowRewardModal(true);
      }
      
    } catch (error) {
      console.error('Error handling MST tutorial completion:', error);
      alert('Failed to process tutorial completion. Please try again.');
    }
  };

  const handleTruthMetalChoice = async (choice: 'touch' | 'ignore', ordinaryWorld: string) => {
    if (!currentUser) return;

    try {
      // Update user's ordinary world description in both collections
      const userRef = doc(db, 'users', currentUser.uid);
      const studentRef = doc(db, 'students', currentUser.uid);
      
      // Update users collection
      await updateDoc(userRef, {
        ordinaryWorld: ordinaryWorld,
        truthMetalChoice: choice,
        lastUpdated: serverTimestamp()
      });

      // Update students collection (for profile display)
      await updateDoc(studentRef, {
        ordinaryWorld: ordinaryWorld,
        truthMetalChoice: choice,
        lastUpdated: serverTimestamp()
      });

      // Complete the Truth Metal Choice challenge
      const currentData = userProgress || {};
      
      const updatedChapters = {
        ...currentData.chapters,
        [chapter.id]: {
          ...currentData.chapters?.[chapter.id],
          challenges: {
            ...currentData.chapters?.[chapter.id]?.challenges,
            ['ep1-truth-metal-choice']: {
              isCompleted: true,
              choice: choice,
              ordinaryWorld: ordinaryWorld,
              completedAt: serverTimestamp()
            }
          }
        }
      };

      await updateDoc(userRef, {
        chapters: updatedChapters
      });

      // Update local state to reflect the completion
      setUserProgress((prev: any) => ({
        ...prev,
        chapters: updatedChapters
      }));

      // Add to challenge submissions
      await addDoc(collection(db, 'challengeSubmissions'), {
        userId: currentUser.uid,
        displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
        email: currentUser.email || '',
        photoURL: currentUser.photoURL || '',
        challengeId: 'ep1-truth-metal-choice',
        challengeName: 'The Truth Metal Choice',
        submissionType: 'interactive',
        timestamp: serverTimestamp(),
        status: 'approved',
        xpReward: 15,
        ppReward: 8,
        manifestationType: 'Chapter Challenge',
        character: 'Truth Metal',
        autoCompleted: true,
        choice: choice,
        ordinaryWorld: ordinaryWorld
      });

      // Create notification for challenge completion
      await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
        type: 'challenge_completed',
        message: `🎉 Truth Metal Choice completed! You chose to ${choice === 'touch' ? 'embrace change' : 'remain in your ordinary world'}. Your ordinary world description has been saved to your profile! You earned +15 XP and +8 PP!`,
        challengeId: 'ep1-truth-metal-choice',
        challengeName: 'The Truth Metal Choice',
        xpReward: 15,
        ppReward: 8,
        timestamp: serverTimestamp(),
        read: false
      });
      
      // Find challenge to get rewards
      const challenge = chapter.challenges.find(c => c.id === 'ep1-truth-metal-choice');
      const xpReward = challenge?.rewards.find(r => r.type === 'xp')?.value || 15;
      const ppReward = challenge?.rewards.find(r => r.type === 'pp')?.value || 8;

      // Apply rewards to both collections
      const userDocRewards = await getDoc(userRef);
      const userDataRewards = userDocRewards.exists() ? userDocRewards.data() : {};
      await updateDoc(userRef, {
        xp: (userDataRewards.xp || 0) + xpReward,
        powerPoints: (userDataRewards.powerPoints || 0) + ppReward
      });

      const studentDocRewards = await getDoc(studentRef);
      if (studentDocRewards.exists()) {
        const studentDataRewards = studentDocRewards.data();
        await updateDoc(studentRef, {
          xp: (studentDataRewards.xp || 0) + xpReward,
          powerPoints: (studentDataRewards.powerPoints || 0) + ppReward
        });
      }

      // Close the modal
      setShowTruthMetalModal(false);
      
      // Refresh user progress
      const userDocRefresh = await getDoc(userRef);
      if (userDocRefresh.exists()) {
        const userDataRefresh = userDocRefresh.data();
        setUserProgress(userDataRefresh);
      }

      // Show reward modal
      if (challenge) {
        setRewardModalData({
          challengeTitle: challenge.title,
          rewards: challenge.rewards,
          xpReward,
          ppReward
        });
        setShowRewardModal(true);
      }

      console.log('Truth Metal Choice completed:', { choice, ordinaryWorld });
    } catch (error) {
      console.error('Error completing Truth Metal Choice:', error);
      alert('Failed to complete the Truth Metal Choice. Please try again.');
    }
  };

  const handleTouchTruthMetal = () => {
    setShowTruthMetalTouchModal(false);
    setShowTruthBattle(true);
  };

  const handleTruthVictory = async (truthRevealed: string) => {
    if (!currentUser) return;

    try {
      if (!isReplayMode) {
        // Complete the Touch Truth Metal challenge (only if not in replay mode)
        const userRef = doc(db, 'users', currentUser.uid);
        const studentRef = doc(db, 'students', currentUser.uid);
        
        const currentData = userProgress || {};
        
        const updatedChapters = {
          ...currentData.chapters,
          [chapter.id]: {
            ...currentData.chapters?.[chapter.id],
            challenges: {
              ...currentData.chapters?.[chapter.id]?.challenges,
              ['ep1-touch-truth-metal']: {
                isCompleted: true,
                truthRevealed: truthRevealed,
                completedAt: serverTimestamp()
              }
            }
          }
        };

        await updateDoc(userRef, {
          chapters: updatedChapters
        });

        // Add to challenge submissions
        await addDoc(collection(db, 'challengeSubmissions'), {
          userId: currentUser.uid,
          displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
          email: currentUser.email || '',
          photoURL: currentUser.photoURL || '',
          challengeId: 'ep1-touch-truth-metal',
          challengeName: 'Touch Truth Metal',
          submissionType: 'battle',
          timestamp: serverTimestamp(),
          status: 'approved',
          xpReward: 25,
          ppReward: 15,
          manifestationType: 'Chapter Challenge',
          character: 'Truth',
          autoCompleted: true,
          truthRevealed: truthRevealed
        });

        // Create notification for challenge completion
        await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
          type: 'challenge_completed',
          message: `🎉 Truth Metal challenge completed! You defeated Truth and discovered: "${truthRevealed}". You earned +25 XP and +15 PP!`,
          challengeId: 'ep1-touch-truth-metal',
          challengeName: 'Touch Truth Metal',
          xpReward: 25,
          ppReward: 15,
          timestamp: serverTimestamp(),
          read: false
        });

        // Update student data with truth revelation
        await updateDoc(studentRef, {
          truthRevelation: truthRevealed,
          lastUpdated: serverTimestamp()
        });

        // Find challenge to get rewards
        const challenge = chapter.challenges.find(c => c.id === 'ep1-touch-truth-metal');
        const xpReward = challenge?.rewards.find(r => r.type === 'xp')?.value || 25;
        const ppReward = challenge?.rewards.find(r => r.type === 'pp')?.value || 15;
        const truthMetalReward = challenge?.rewards.find(r => r.type === 'truthMetal')?.value || 0;

        // Apply rewards to both collections
        const userDocRewards = await getDoc(userRef);
        const userDataRewards = userDocRewards.exists() ? userDocRewards.data() : {};
        await updateDoc(userRef, {
          xp: (userDataRewards.xp || 0) + xpReward,
          powerPoints: (userDataRewards.powerPoints || 0) + ppReward,
          truthMetal: (userDataRewards.truthMetal || 0) + truthMetalReward
        });

        const studentDocRewards = await getDoc(studentRef);
        if (studentDocRewards.exists()) {
          const studentDataRewards = studentDocRewards.data();
          await updateDoc(studentRef, {
            xp: (studentDataRewards.xp || 0) + xpReward,
            powerPoints: (studentDataRewards.powerPoints || 0) + ppReward,
            truthMetal: (studentDataRewards.truthMetal || 0) + truthMetalReward
          });
        }
        
        // Refresh user progress
        const userDocRefresh = await getDoc(userRef);
        if (userDocRefresh.exists()) {
          const userDataRefresh = userDocRefresh.data();
          setUserProgress(userDataRefresh);
        }

        // Show reward modal
        if (challenge) {
          setRewardModalData({
            challengeTitle: challenge.title,
            rewards: challenge.rewards,
            xpReward,
            ppReward
          });
          setShowRewardModal(true);
        }

        console.log('Touch Truth Metal completed:', { truthRevealed });
      }
      
      setTruthRevealed(truthRevealed);
      setShowTruthBattle(false);
      setShowTruthRevelation(true);
      
    } catch (error) {
      console.error('Error completing Touch Truth Metal:', error);
      alert('Failed to complete the Truth Metal challenge. Please try again.');
    }
  };

  const handleTruthDefeat = () => {
    setShowTruthBattle(false);
    alert('You were defeated by Truth, but this is just the beginning of your journey. Try again when you feel stronger!');
  };

  const handleTruthRevelationComplete = () => {
    setShowTruthRevelation(false);
    setIsReplayMode(false);
    if (isReplayMode) {
      alert('🎉 Battle completed! You have faced Truth again and discovered new insights about yourself!');
    } else {
      alert('🎉 Truth Metal challenge completed! You have discovered a profound truth about yourself and earned valuable rewards!');
    }
  };

  const handleLetterNameSubmit = async (name: string) => {
    if (!currentUser) return;

    try {
      // Update user's display name in both collections
      const userRef = doc(db, 'users', currentUser.uid);
      const studentRef = doc(db, 'students', currentUser.uid);
      
      // Update users collection
      await updateDoc(userRef, {
        displayName: name,
        lastUpdated: serverTimestamp()
      });

      // Update students collection (for profile display)
      await updateDoc(studentRef, {
        displayName: name,
        lastUpdated: serverTimestamp()
      });

      // Complete the Get Letter challenge
      const currentData = userProgress || {};
      
      const updatedChapters = {
        ...currentData.chapters,
        [chapter.id]: {
          ...currentData.chapters?.[chapter.id],
          challenges: {
            ...currentData.chapters?.[chapter.id]?.challenges,
            ['ep1-get-letter']: {
              isCompleted: true,
              playerName: name,
              letterReceived: true,
              completedAt: serverTimestamp()
            }
          }
        }
      };

      await updateDoc(userRef, {
        chapters: updatedChapters
      });

      // Add to challenge submissions
      await addDoc(collection(db, 'challengeSubmissions'), {
        userId: currentUser.uid,
        displayName: name,
        email: currentUser.email || '',
        photoURL: currentUser.photoURL || '',
        challengeId: 'ep1-get-letter',
        challengeName: 'Get Letter',
        submissionType: 'interactive',
        timestamp: serverTimestamp(),
        status: 'approved',
        xpReward: 10,
        ppReward: 5,
        manifestationType: 'Chapter Challenge',
        character: 'Xiotein Letter',
        autoCompleted: true,
        playerName: name
      });

      // Create notification for challenge completion
      await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
        type: 'challenge_completed',
        message: `🎉 Welcome to Xiotein, ${name}! Your journey as a Manifester begins now! You earned +10 XP and +5 PP!`,
        challengeId: 'ep1-get-letter',
        challengeName: 'Get Letter',
        xpReward: 10,
        ppReward: 5,
        timestamp: serverTimestamp(),
        read: false
      });
      
      // Find challenge to get rewards
      const challenge = chapter.challenges.find(c => c.id === 'ep1-get-letter');
      const xpReward = challenge?.rewards.find(r => r.type === 'xp')?.value || 10;
      const ppReward = challenge?.rewards.find(r => r.type === 'pp')?.value || 5;

      // Apply rewards to both collections
      const userDocRewards = await getDoc(userRef);
      const userDataRewards = userDocRewards.exists() ? userDocRewards.data() : {};
      await updateDoc(userRef, {
        xp: (userDataRewards.xp || 0) + xpReward,
        powerPoints: (userDataRewards.powerPoints || 0) + ppReward
      });

      const studentDocRewards = await getDoc(studentRef);
      if (studentDocRewards.exists()) {
        const studentDataRewards = studentDocRewards.data();
        await updateDoc(studentRef, {
          xp: (studentDataRewards.xp || 0) + xpReward,
          powerPoints: (studentDataRewards.powerPoints || 0) + ppReward
        });
      }

      // Close the letter modal
      setShowLetterModal(false);
      
      // Refresh user progress
      const userDocRefresh = await getDoc(userRef);
      if (userDocRefresh.exists()) {
        const userDataRefresh = userDocRefresh.data();
        setUserProgress(userDataRefresh);
      }

      // Show reward modal
      if (challenge) {
        setRewardModalData({
          challengeTitle: challenge.title,
          rewards: challenge.rewards,
          xpReward,
          ppReward
        });
        setShowRewardModal(true);
      }

      console.log('Letter challenge completed with name:', name);
      alert(`🎉 Welcome to Xiotein, ${name}! Your name has been updated in your profile and your journey as a Manifester begins now!`);
    } catch (error) {
      console.error('Error completing letter challenge:', error);
      alert('Failed to complete the letter challenge. Please try again.');
    }
  };

  // Hela Battle Handlers
  const handleHelaBattleVictory = async () => {
    if (!currentUser) return;

    // If in replay mode, just show victory message without updating database
    if (isReplayMode) {
      alert('🎉 Victory! You\'ve defeated Hela in this replay!');
      setIsReplayMode(false);
      return;
    }

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const currentData = await getDoc(userRef);
      
      if (currentData.exists()) {
        // Determine which challenge to complete based on completingChallenge state
        // If Ice Golems were defeated, complete Challenge 7 and unlock Challenge 8
        const challengeId = completingChallenge === 'ep1-update-profile' 
          ? 'ep1-update-profile' 
          : 'ep1-portal-sequence';
        
        // If this is the Ice Golem battle, also mark that we've seen the cutscene
        const iceGolemsDefeated = completingChallenge === 'ep1-update-profile';
        
        const updatedChapters = {
          ...currentData.data().chapters,
          [chapter.id]: {
            ...currentData.data().chapters?.[chapter.id],
            challenges: {
              ...currentData.data().chapters?.[chapter.id]?.challenges,
              [challengeId]: {
                isCompleted: true,
                status: 'approved',
                completedAt: serverTimestamp(),
                helaDefeated: true,
                iceGolemsDefeated: iceGolemsDefeated,
                giantGolemCutscene: iceGolemsDefeated // Mark that cutscene was shown
              }
            }
          }
        };

        await updateDoc(userRef, {
          chapters: updatedChapters
        });

        // Update local state
        setUserProgress((prev: any) => ({
          ...prev,
          chapters: updatedChapters
        }));

        console.log(`${challengeId} challenge completed - ${completingChallenge === 'ep1-update-profile' ? 'Ice Golems' : 'Hela'} defeated!`);
        
        // If Ice Golems were defeated, mark the artifact requirement for Challenge 8
        if (iceGolemsDefeated) {
          // Also update the student's artifacts to mark the cutscene as seen
          const studentRef = doc(db, 'students', currentUser.uid);
          const studentDoc = await getDoc(studentRef);
          
          if (studentDoc.exists()) {
            const studentData = studentDoc.data();
            const currentArtifacts = studentData.artifacts || {};
            
            await updateDoc(studentRef, {
              artifacts: {
                ...currentArtifacts,
                giant_ice_golem_cutscene_seen: true
              }
            });
          }
          
          // Navigate to Challenge 8 after a short delay
          setTimeout(() => {
            // Scroll to Challenge 8 (Artifacts and Elements) or show it
            const challenge8Element = document.getElementById(`challenge-ep1-view-power-card`);
            if (challenge8Element) {
              challenge8Element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 1000);
        }
        
        // Modal will be closed by the Continue button in HelaBattle component
      }
    } catch (error) {
      console.error('Error completing challenge:', error);
      alert('Failed to complete the challenge. Please try again.');
      setShowHelaBattle(false);
    }
  };

  const handleHelaBattleDefeat = () => {
    if (isReplayMode) {
      alert('💀 Hela has overpowered you in this replay! Try a different strategy!');
      setIsReplayMode(false);
    } else {
      alert('💀 Hela has overpowered you. Your journey ends here... Try again when you\'re stronger!');
    }
  };

  const handleHelaBattleEscape = () => {
    // Close the battle modal
    setShowHelaBattle(false);
    // Reset the completing challenge state (important: don't mark challenge as complete)
    setCompletingChallenge(null);
    
    if (isReplayMode) {
      alert('🏃 You chose to run away from Hela in this replay!');
      setIsReplayMode(false);
    } else {
      alert('🏃 You chose to run away from Hela. The portal remains closed, but you live to fight another day...');
    }
  };

  // Manual profile completion bypass - for students who say their profile is updated
  const manualCompleteProfileChallenge = async () => {
    if (!currentUser || !userProgress) return;

    try {
      console.log('ChapterDetail: Manual profile challenge completion - bypassing detection');
      
      // Confirm with user
      const confirmed = window.confirm(
        'Are you sure your profile is updated with your display name and avatar? This will mark the challenge as complete.'
      );
      
      if (!confirmed) return;

      // Manually complete the profile challenge
      const userRef = doc(db, 'users', currentUser.uid);
      const updatedChapters = {
        ...userProgress.chapters,
        [1]: {
          ...userProgress.chapters?.[1],
          challenges: {
            ...userProgress.chapters?.[1]?.challenges,
            'ep1-update-profile': {
              isCompleted: true,
              completedAt: serverTimestamp(),
              autoCompleted: false,
              manuallyCompleted: true,
              completedBy: 'user_manual_override'
            }
          }
        }
      };

      await updateDoc(userRef, {
        chapters: updatedChapters
      });

      // Add to challenge submissions for tracking
      await addDoc(collection(db, 'challengeSubmissions'), {
        userId: currentUser.uid,
        displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
        email: currentUser.email || '',
        photoURL: currentUser.photoURL || '',
        challengeId: 'ep1-update-profile',
        challengeName: 'Hela Awakened',
        submissionType: 'manual_override',
        status: 'approved',
        timestamp: serverTimestamp(),
        xpReward: 15,
        ppReward: 5,
        manifestationType: 'Chapter Challenge',
        character: 'Chapter System',
        autoCompleted: false,
        manuallyCompleted: true,
        notes: 'User manually completed - profile detection failed'
      });

      // Create notification for challenge completion
      await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
        type: 'challenge_completed',
        message: `🎉 Challenge "Update Your Profile" was manually completed! You earned +15 XP and +5 PP.`,
        challengeId: 'ep1-update-profile',
        challengeName: 'Hela Awakened',
        xpReward: 15,
        ppReward: 5,
        timestamp: serverTimestamp(),
        read: false,
        isAutoCompleted: false,
        manuallyCompleted: true
      });
      
      alert('✅ Profile challenge completed manually! You can now proceed to the next challenge.');
      
      // Refresh user data
      const userDocRefresh = await getDoc(userRef);
      if (userDocRefresh.exists()) {
        const userDataRefresh = userDocRefresh.data();
        setUserProgress(userDataRefresh);
      }
      
    } catch (error) {
      console.error('ChapterDetail: Error manually completing profile challenge:', error);
      alert('❌ Error completing profile challenge. Please try again.');
    }
  };

  // Reset Challenge 7 for testing (ADMIN ONLY)
  const resetChallenge7 = async () => {
    if (!currentUser) return;
    
    // SECURITY: Only admins can reset challenges
    if (!isAdmin()) {
      alert('❌ Only administrators can reset challenges.');
      return;
    }
    
    if (!window.confirm('Reset Challenge 7 "Hela Awakened" to incomplete for testing?')) {
      return;
    }
    
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        // Reconstruct challenge without status field
        const existingChallenge = userData.chapters?.[1]?.challenges?.['ep1-update-profile'] || {};
        const cleanChallenge: any = {
          isCompleted: false,
          completedAt: null
        };
        
        const updatedChapters = {
          ...(userData.chapters || {}),
          [1]: {
            ...(userData.chapters?.[1] || {}),
            challenges: {
              ...(userData.chapters?.[1]?.challenges || {}),
              'ep1-update-profile': cleanChallenge
            }
          }
        };
        
        await updateDoc(userRef, {
          chapters: updatedChapters,
          'chapters.1.challenges.ep1-update-profile.status': deleteField(),
          'chapters.1.challenges.ep1-update-profile.helaDefeated': deleteField(),
          'chapters.1.challenges.ep1-update-profile.iceGolemsDefeated': deleteField()
        });
      }
      
      // Reset in students collection
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      
      if (studentDoc.exists()) {
        const studentData = studentDoc.data();
        const cleanChallenge: any = {
          isCompleted: false,
          completedAt: null
        };
        
        const updatedStudentChapters = {
          ...(studentData.chapters || {}),
          [1]: {
            ...(studentData.chapters?.[1] || {}),
            challenges: {
              ...(studentData.chapters?.[1]?.challenges || {}),
              'ep1-update-profile': cleanChallenge
            }
          }
        };
        
        await updateDoc(studentRef, {
          chapters: updatedStudentChapters,
          'chapters.1.challenges.ep1-update-profile.status': deleteField(),
          'chapters.1.challenges.ep1-update-profile.helaDefeated': deleteField(),
          'chapters.1.challenges.ep1-update-profile.iceGolemsDefeated': deleteField()
        });
      }
      
      // Refresh user progress
      const refreshedUserDoc = await getDoc(userRef);
      if (refreshedUserDoc.exists()) {
        setUserProgress(refreshedUserDoc.data());
      }
      
      alert('✅ Challenge 7 reset! Refresh the page to see it as incomplete.');
    } catch (error) {
      console.error('Error resetting Challenge 7:', error);
      alert('Error resetting challenge. Check console for details.');
    }
  };

  const resetChallenge8 = async () => {
    if (!currentUser) return;
    
    // SECURITY: Only admins can reset challenges
    if (!isAdmin()) {
      alert('❌ Only administrators can reset challenges.');
      return;
    }
    
    if (!window.confirm('Reset Challenge 8 "Artifacts and Elements"?\n\nThis will allow you to redo the updated challenge. Your progress will be reset to incomplete.')) {
      return;
    }
    
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const cleanChallenge: any = {
          isCompleted: false,
          completedAt: null
        };
        
        const updatedChapters = {
          ...(userData.chapters || {}),
          [1]: {
            ...(userData.chapters?.[1] || {}),
            challenges: {
              ...(userData.chapters?.[1]?.challenges || {}),
              'ep1-view-power-card': cleanChallenge
            }
          }
        };
        
        await updateDoc(userRef, {
          chapters: updatedChapters,
          'chapters.1.challenges.ep1-view-power-card.status': deleteField()
        });
      }
      
      // Reset in students collection
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      
      if (studentDoc.exists()) {
        const studentData = studentDoc.data();
        const cleanChallenge: any = {
          isCompleted: false,
          completedAt: null
        };
        
        const updatedStudentChapters = {
          ...(studentData.chapters || {}),
          [1]: {
            ...(studentData.chapters?.[1] || {}),
            challenges: {
              ...(studentData.chapters?.[1]?.challenges || {}),
              'ep1-view-power-card': cleanChallenge
            }
          }
        };
        
        await updateDoc(studentRef, {
          chapters: updatedStudentChapters,
          'chapters.1.challenges.ep1-view-power-card.status': deleteField()
        });
      }
      
      // Refresh user progress - the onSnapshot listener will automatically update the UI
      const refreshedUserDoc = await getDoc(userRef);
      if (refreshedUserDoc.exists()) {
        setUserProgress(refreshedUserDoc.data());
      }
      
      // Also refresh student data
      const refreshedStudentDoc = await getDoc(studentRef);
      if (refreshedStudentDoc.exists()) {
        setStudentData(refreshedStudentDoc.data());
      }
      
      alert('✅ Challenge 8 has been reset! You can now redo the updated challenge.');
    } catch (error) {
      console.error('Error resetting Challenge 8:', error);
      alert('Error resetting challenge. Please try again.');
    }
  };

  // Reset Chapter 2-1 for current user (ADMIN ONLY)
  const resetChapter2Challenge1 = async (autoReset: boolean = false) => {
    if (!currentUser) return;
    
    // SECURITY: Only admins can reset challenges
    if (!autoReset && !isAdmin()) {
      alert('❌ Only administrators can reset challenges.');
      return;
    }
    
    if (!autoReset && !window.confirm('Reset Chapter 2-1 "Arrival on Timu Island" to incomplete?\n\nThis will clear your completion status for this challenge.')) {
      return;
    }
    
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        // Completely remove the challenge progress to reset it to available
        const updatedChapters = {
          ...(userData.chapters || {}),
          [2]: {
            ...(userData.chapters?.[2] || {}),
            challenges: {
              ...(userData.chapters?.[2]?.challenges || {}),
              'ch2-team-formation': {
                isCompleted: false
              }
            }
          }
        };
        
        await updateDoc(userRef, {
          chapters: updatedChapters,
          'chapters.2.challenges.ch2-team-formation.status': deleteField(),
          'chapters.2.challenges.ch2-team-formation.completedAt': deleteField()
        });
      }
      
      // Refresh user progress immediately
      const refreshedUserDoc = await getDoc(userRef);
      if (refreshedUserDoc.exists()) {
        const refreshedData = refreshedUserDoc.data();
        setUserProgress(refreshedData);
      }
      
      if (!autoReset) {
        alert('✅ Chapter 2-1 has been reset! The "Go through the Portal" button should now appear.');
      }
    } catch (error) {
      console.error('Error resetting Chapter 2-1:', error);
      if (!autoReset) {
        alert('Error resetting challenge. Please try again.');
      }
    }
  };

  // REMOVED: Auto-reset mechanism that was causing Chapter 2-1 to reset every time
  // This was causing the reward modal to appear repeatedly
  // If Chapter 2-1 needs to be reset, it should be done manually by admins

  const resetChapter2Challenge2 = async () => {
    if (!currentUser) return;
    
    // SECURITY: Only admins can reset challenges
    if (!isAdmin()) {
      alert('❌ Only administrators can reset challenges.');
      return;
    }
    
    if (!window.confirm('Reset Chapter 2-2 "Find a Home" to incomplete?\n\nThis will clear your completion status for this challenge.')) {
      return;
    }
    
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        // Completely remove the challenge progress to reset it to available
        const updatedChapters = {
          ...(userData.chapters || {}),
          [2]: {
            ...(userData.chapters?.[2] || {}),
            challenges: {
              ...(userData.chapters?.[2]?.challenges || {}),
              'ch2-rival-selection': {
                isCompleted: false
              }
            }
          }
        };
        
        await updateDoc(userRef, {
          chapters: updatedChapters,
          'chapters.2.challenges.ch2-rival-selection.status': deleteField(),
          'chapters.2.challenges.ch2-rival-selection.completedAt': deleteField()
        });
      }
      
      // Refresh user progress immediately
      const refreshedUserDoc = await getDoc(userRef);
      if (refreshedUserDoc.exists()) {
        const refreshedData = refreshedUserDoc.data();
        setUserProgress(refreshedData);
      }
      
      alert('✅ Chapter 2-2 has been reset! The "Find a Home" button should now appear.');
    } catch (error) {
      console.error('Error resetting Chapter 2-2:', error);
      alert('Error resetting challenge. Please try again.');
    }
  };

  const resetChapter2Challenge3 = async () => {
    if (!currentUser) return;
    
    // SECURITY: Only admins can reset challenges
    if (!isAdmin()) {
      alert('❌ Only administrators can reset challenges.');
      return;
    }
    
    if (!window.confirm('Reset Chapter 2-3 "Squad Up" to incomplete?\n\nThis will clear your completion status for this challenge.')) {
      return;
    }
    
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        // Completely remove the challenge progress to reset it to available
        const updatedChapters = {
          ...(userData.chapters || {}),
          [2]: {
            ...(userData.chapters?.[2] || {}),
            challenges: {
              ...(userData.chapters?.[2]?.challenges || {}),
              'ch2-team-trial': {
                isCompleted: false
              }
            }
          }
        };
        
        await updateDoc(userRef, {
          chapters: updatedChapters,
          'chapters.2.challenges.ch2-team-trial.status': deleteField(),
          'chapters.2.challenges.ch2-team-trial.completedAt': deleteField()
        });
      }
      
      // Refresh user progress immediately
      const refreshedUserDoc = await getDoc(userRef);
      if (refreshedUserDoc.exists()) {
        const refreshedData = refreshedUserDoc.data();
        setUserProgress(refreshedData);
      }
      
      alert('✅ Chapter 2-3 has been reset! The "Squad Up" button should now appear.');
    } catch (error) {
      console.error('Error resetting Chapter 2-3:', error);
      alert('Error resetting challenge. Please try again.');
    }
  };

  const handleIcyDeathCutsceneComplete = async () => {
    if (!currentUser) return;

    try {
      const challenge = chapter.challenges.find(c => c.id === 'ep1-view-power-card');
      if (!challenge) return;

      const userRef = doc(db, 'users', currentUser.uid);
      const studentRef = doc(db, 'students', currentUser.uid);
      const currentData = await getDoc(userRef);

      if (currentData.exists()) {
        // Mark Challenge 8 as complete
        const updatedChapters = {
          ...currentData.data().chapters,
          [chapter.id]: {
            ...currentData.data().chapters?.[chapter.id],
            challenges: {
              ...currentData.data().chapters?.[chapter.id]?.challenges,
              ['ep1-view-power-card']: {
                isCompleted: true,
                status: 'approved',
                completedAt: serverTimestamp()
              }
            }
          }
        };

        await updateDoc(userRef, {
          chapters: updatedChapters
        });

        // Apply rewards
        const xpReward = challenge.rewards.find(r => r.type === 'xp')?.value || 0;
        const ppReward = challenge.rewards.find(r => r.type === 'pp')?.value || 0;
        const artifactRewards = challenge.rewards.filter(r => r.type === 'artifact');

        // Update student data
        const studentDoc = await getDoc(studentRef);
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          const updatedChallenges = {
            ...studentData.challenges,
            ['ep1-view-power-card']: {
              completed: true,
              status: 'approved',
              completedAt: serverTimestamp()
            }
          };

          // Grant artifact rewards
          const currentArtifacts = studentData.artifacts || {};
          const updatedArtifacts = { ...currentArtifacts };

          artifactRewards.forEach(artifactReward => {
            updatedArtifacts[artifactReward.value] = true;
          });

          await updateDoc(studentRef, {
            challenges: updatedChallenges,
            xp: (studentData.xp || 0) + xpReward,
            powerPoints: (studentData.powerPoints || 0) + ppReward,
            artifacts: updatedArtifacts
          });

          // If Elemental Ring is granted, unlock elemental moves
          if (updatedArtifacts.elemental_ring_level_1) {
            try {
              const userElement = studentData.elementalAffinity?.toLowerCase() || 
                                 studentData.manifestationType?.toLowerCase() || 
                                 'fire';
              await unlockElementalMoves(userElement);
              console.log(`Elemental moves unlocked for ${userElement} element via Elemental Ring`);
            } catch (error) {
              console.error('Failed to unlock elemental moves:', error);
            }
          }
        }

        // Update local state
        setUserProgress((prev: any) => ({
          ...prev,
          chapters: updatedChapters
        }));

        // Add notification
        await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
          type: 'challenge_completed',
          message: `🎉 Challenge "${challenge.title}" completed! You earned ${xpReward} XP, ${ppReward} PP, and new artifacts!`,
          challengeId: challenge.id,
          challengeName: challenge.title,
          xpReward: xpReward,
          ppReward: ppReward,
          timestamp: serverTimestamp(),
          read: false
        });

        // Show reward modal
        setRewardModalData({
          challengeTitle: challenge.title,
          rewards: challenge.rewards,
          xpReward,
          ppReward
        });
        setShowRewardModal(true);
        
        // Navigate to Artifacts page
        setTimeout(() => {
          navigate('/artifacts');
        }, 500);
      }
    } catch (error) {
      console.error('Error completing Challenge 8:', error);
      alert('Failed to complete the challenge. Please try again.');
    } finally {
      setShowIcyDeathCutscene(false);
    }
  };

  const handleZekeEndsBattleCutsceneComplete = async () => {
    if (!currentUser) return;

    try {
      const challenge = chapter.challenges.find(c => c.id === 'ep1-where-it-started');
      if (!challenge) return;

      const userRef = doc(db, 'users', currentUser.uid);
      const studentRef = doc(db, 'students', currentUser.uid);
      const currentData = await getDoc(userRef);

      if (currentData.exists()) {
        const currentChapters = currentData.data().chapters || {};
        // Ensure chapter.id is used as a string key (Firestore uses string keys)
        const chapterKey = String(chapter.id);
        const currentChapterData = currentChapters[chapterKey] || {};
        const currentChallenges = currentChapterData.challenges || {};
        
        console.log('ChapterDetail: Completing Challenge 9 - Current data:', {
          chapterId: chapter.id,
          chapterKey: chapterKey,
          currentChapters,
          currentChapterData,
          currentChallenges,
          allChapterKeys: Object.keys(currentChapters)
        });
        
        // Mark Challenge 9 as complete
        const updatedChallenges = {
          ...currentChallenges,
          'ep1-where-it-started': {
            isCompleted: true,
            status: 'approved',
            completedAt: serverTimestamp()
          }
        };
        
        // Check if ALL Chapter 1 challenges are now completed before marking chapter as complete
        const allChapter1Challenges = chapter.challenges.map(c => c.id);
        const allChallengesCompleted = allChapter1Challenges.every(challengeId => 
          updatedChallenges[challengeId]?.isCompleted === true
        );
        
        console.log('ChapterDetail: Checking if all Chapter 1 challenges are completed:', {
          allChapter1Challenges,
          completedChallenges: allChapter1Challenges.filter(id => updatedChallenges[id]?.isCompleted),
          allChallengesCompleted,
          challengeStatuses: allChapter1Challenges.map(id => ({ id, completed: updatedChallenges[id]?.isCompleted }))
        });
        
        // Only mark chapter as complete if ALL challenges are completed
        const updatedChapters = {
          ...currentChapters,
          [chapterKey]: {
            ...currentChapterData,
            isCompleted: allChallengesCompleted, // Only true if all challenges are done
            completionDate: allChallengesCompleted ? serverTimestamp() : currentChapterData.completionDate,
            isActive: allChallengesCompleted ? false : currentChapterData.isActive, // Keep active if not all challenges done
            challenges: updatedChallenges
          }
          // Chapter 2 unlock disabled - will be enabled later
          // 2: {
          //   ...currentChapters[2],
          //   isActive: true,
          //   unlockDate: serverTimestamp()
          // }
        };

        console.log('ChapterDetail: Updating with:', {
          chapterId: chapter.id,
          chapterKey: chapterKey,
          updatedChapters: updatedChapters[chapterKey],
          challengeData: updatedChapters[chapterKey].challenges['ep1-where-it-started']
        });

        // Get reward values
        const xpReward = challenge.rewards.find(r => r.type === 'xp')?.value || 0;
        const ppReward = challenge.rewards.find(r => r.type === 'pp')?.value || 0;
        const truthMetalReward = challenge.rewards.find(r => r.type === 'truthMetal')?.value || 0;
        const artifactRewards = challenge.rewards.filter(r => r.type === 'artifact');

        // Grant rewards to users collection using increment for atomic updates
        await updateDoc(userRef, {
          chapters: updatedChapters,
          xp: increment(xpReward),
          powerPoints: increment(ppReward),
          truthMetal: increment(truthMetalReward)
        });
        
        console.log('ChapterDetail: Challenge 9 completion saved to users collection with rewards');

        // Grant rewards and update students collection
        const studentData = await getDoc(studentRef);
        if (studentData.exists()) {
          const studentDataObj = studentData.data();
          const studentChapters = studentDataObj.chapters || {};
          const chapterKey = String(chapter.id);
          const studentChapterData = studentChapters[chapterKey] || {};
          const studentChallenges = studentChapterData.challenges || {};
          
          console.log('ChapterDetail: Updating students collection - Current data:', {
            chapterId: chapter.id,
            chapterKey: chapterKey,
            studentChapters,
            studentChapterData,
            studentChallenges,
            allChapterKeys: Object.keys(studentChapters)
          });

          // Grant artifact rewards
          const currentArtifacts = studentDataObj.artifacts || {};
          const updatedArtifacts = { ...currentArtifacts };
          updatedArtifacts.chapter_1_completed = true;

          // Check if ALL Chapter 1 challenges are completed
          const allChapter1Challenges = chapter.challenges.map(c => c.id);
          const updatedStudentChallenges = {
            ...studentChallenges,
            'ep1-where-it-started': {
              isCompleted: true,
              status: 'approved',
              completedAt: serverTimestamp()
            }
          };
          const allChallengesCompleted = allChapter1Challenges.every(challengeId => 
            updatedStudentChallenges[challengeId]?.isCompleted === true
          );
          
          const updatedStudentChapters = {
            ...studentChapters,
            [chapterKey]: {
              ...studentChapterData,
              isCompleted: allChallengesCompleted, // Only true if all challenges are done
              completionDate: allChallengesCompleted ? serverTimestamp() : studentChapterData.completionDate,
              isActive: allChallengesCompleted ? false : studentChapterData.isActive, // Keep active if not all challenges done
              challenges: updatedStudentChallenges
            }
          };

          console.log('ChapterDetail: Updating students with:', {
            chapterId: chapter.id,
            chapterKey: chapterKey,
            updatedChapter: updatedStudentChapters[chapterKey],
            challengeData: updatedStudentChapters[chapterKey].challenges['ep1-where-it-started']
          });

          // Grant rewards to students collection using increment for atomic updates
          await updateDoc(studentRef, {
            powerPoints: increment(ppReward),
            xp: increment(xpReward),
            truthMetal: increment(truthMetalReward),
            artifacts: updatedArtifacts,
            chapters: updatedStudentChapters
            // storyChapter: 2 // Disabled for now
          });
          
          console.log('ChapterDetail: Challenge 9 completion saved to students collection with rewards');
        }

        // Wait a moment for Firestore to propagate the changes
        await new Promise(resolve => setTimeout(resolve, 500));

        // Refresh user progress from both collections
        const refreshedUserDoc = await getDoc(userRef);
        if (refreshedUserDoc.exists()) {
          const refreshedData = refreshedUserDoc.data();
          console.log('ChapterDetail: Refreshed user data:', {
            chapterId: chapter.id,
            chapterData: refreshedData.chapters?.[chapter.id],
            challengeData: refreshedData.chapters?.[chapter.id]?.challenges?.['ep1-where-it-started']
          });
          setUserProgress(refreshedData);
        }

        // Also refresh student data
        const refreshedStudentDoc = await getDoc(studentRef);
        if (refreshedStudentDoc.exists()) {
          const refreshedStudentData = refreshedStudentDoc.data();
          console.log('ChapterDetail: Refreshed student data:', {
            chapterId: chapter.id,
            chapterData: refreshedStudentData.chapters?.[chapter.id],
            challengeData: refreshedStudentData.chapters?.[chapter.id]?.challenges?.['ep1-where-it-started']
          });
          setStudentData(refreshedStudentData);
        }

        // Check if all challenges are completed using the refreshed data
        const refreshedChapterData = refreshedUserDoc.exists() ? refreshedUserDoc.data().chapters?.[chapter.id] : null;
        const isChapterComplete = refreshedChapterData?.isCompleted === true;
        
        // Prepare reward modal data
        const rewardModalRewards = [
          ...artifactRewards.map(r => ({
            type: r.type as 'artifact',
            value: r.value,
            name: r.description
          })),
          ...(truthMetalReward > 0 ? [{
            type: 'truthMetal' as const,
            value: truthMetalReward
          }] : [])
        ];

        // Show reward modal
        setRewardModalData({
          challengeTitle: challenge.title,
          rewards: rewardModalRewards,
          xpReward: xpReward as number,
          ppReward: ppReward as number
        });
        setShowRewardModal(true);
        
        console.log('ChapterDetail: Challenge 9 completed successfully with rewards:', {
          xpReward,
          ppReward,
          truthMetalReward,
          artifactRewards: artifactRewards.length,
          isChapterComplete
        });
      }
    } catch (error) {
      console.error('Error completing Challenge 9:', error);
      alert('❌ Failed to complete challenge. Please try again.');
    } finally {
      setShowZekeEndsBattleCutscene(false);
    }
  };

  const handlePortalIntroComplete = async () => {
    if (!currentUser) {
      console.error('ChapterDetail: handlePortalIntroComplete - No current user');
      return;
    }

    try {
      const challenge = chapter.challenges.find(c => c.id === 'ch2-team-formation');
      if (!challenge) {
        console.error('ChapterDetail: handlePortalIntroComplete - Challenge not found: ch2-team-formation');
        return;
      }

      // CRITICAL: Always use currentUser.uid to ensure user-specific updates
      const userRef = doc(db, 'users', currentUser.uid);
      console.log('ChapterDetail: handlePortalIntroComplete - User completed Chapter 2-1 by watching video:', {
        userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.email,
        challengeId: 'ch2-team-formation',
        challengeTitle: challenge.title
      });
      
      // Fetch fresh data from Firestore to ensure we have the latest state
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        console.error('ChapterDetail: handlePortalIntroComplete - User document does not exist:', currentUser.uid);
        alert('Error: User document not found. Please try again.');
        return;
      }
      
      const currentData = userDoc.data();
      const chapterKey = String(chapter.id);
      
      // Check if challenge was already completed - use fresh data from Firestore
      const challengeProgress = currentData.chapters?.[chapterKey]?.challenges?.['ch2-team-formation'];
      const wasAlreadyCompleted = challengeProgress?.isCompleted === true || 
                                   challengeProgress?.status === 'approved';
      
      if (wasAlreadyCompleted) {
        console.log('ChapterDetail: handlePortalIntroComplete - Challenge already completed for user:', currentUser.uid);
        // Don't show rewards again, just return
        return;
      }
      
      console.log('ChapterDetail: handlePortalIntroComplete - Marking challenge as complete for user:', currentUser.uid);
      
      // Build updated chapters object, preserving all existing data
      const updatedChapters = {
        ...currentData.chapters,
        [chapterKey]: {
          ...currentData.chapters?.[chapterKey],
          challenges: {
            ...currentData.chapters?.[chapterKey]?.challenges,
            'ch2-team-formation': {
              ...challengeProgress, // Preserve any existing challenge data
              isCompleted: true,
              completedAt: serverTimestamp(),
              status: 'approved',
              completedBy: currentUser.uid, // Track who completed it
              completedByName: currentUser.displayName || currentUser.email || 'Unknown'
            }
          }
        }
      };

      // Update Firestore with user-specific document
      await updateDoc(userRef, {
        chapters: updatedChapters
      });
      
      console.log('ChapterDetail: handlePortalIntroComplete - Successfully updated challenge completion for user:', currentUser.uid);

      // Apply rewards (only if not already completed)
      const xpReward = challenge.rewards.find(r => r.type === 'xp')?.value || 0;
      const ppReward = challenge.rewards.find(r => r.type === 'pp')?.value || 0;

      if (xpReward > 0 || ppReward > 0) {
        // CRITICAL: Always use currentUser.uid for user-specific updates
        const studentRef = doc(db, 'students', currentUser.uid);
        const userRefForRewards = doc(db, 'users', currentUser.uid);
        
        console.log('ChapterDetail: handlePortalIntroComplete - Granting rewards to user:', currentUser.uid, { xpReward, ppReward });
        
        // Update both collections with atomic increments
        await updateDoc(studentRef, {
          xp: increment(xpReward),
          powerPoints: increment(ppReward)
        });
        
        await updateDoc(userRefForRewards, {
          xp: increment(xpReward),
          powerPoints: increment(ppReward)
        });
        
        console.log('ChapterDetail: handlePortalIntroComplete - Rewards granted successfully');
      }

      // Show reward modal only on first completion
      setRewardModalData({
        challengeTitle: challenge.title,
        rewards: challenge.rewards,
        xpReward: xpReward,
        ppReward: ppReward
      });
      setShowRewardModal(true);

      // Refresh user progress to trigger re-render and unlock next challenge
      const refreshedUserDoc = await getDoc(userRef);
      if (refreshedUserDoc.exists()) {
        const refreshedData = refreshedUserDoc.data();
        setUserProgress(refreshedData);
        
        // Force a small delay to ensure Firestore has propagated the changes
        setTimeout(() => {
          // Re-check user progress to ensure next challenge unlocks
          getDoc(userRef).then(doc => {
            if (doc.exists()) {
              setUserProgress(doc.data());
            }
          });
        }, 500);
      }
    } catch (error) {
      console.error('Error completing portal intro challenge:', error);
      alert('Error completing challenge. Please try again.');
    }
  };

  const handleSquadUpStoryComplete = async () => {
    if (!currentUser) return;

    try {
      const challenge = chapter.challenges.find(c => c.id === 'ch2-team-trial');
      if (!challenge) return;

      const userRef = doc(db, 'users', currentUser.uid);
      const currentData = userProgress || {};
      
      // Check if challenge was already completed
      const wasAlreadyCompleted = currentData.chapters?.[chapter.id]?.challenges?.['ch2-team-trial']?.isCompleted || 
                                   currentData.chapters?.[chapter.id]?.challenges?.['ch2-team-trial']?.status === 'approved';
      
      const updatedChapters = {
        ...currentData.chapters,
        [chapter.id]: {
          ...currentData.chapters?.[chapter.id],
          challenges: {
            ...currentData.chapters?.[chapter.id]?.challenges,
            'ch2-team-trial': {
              isCompleted: true,
              completedAt: serverTimestamp(),
              status: 'approved'
            }
          }
        }
      };

      await updateDoc(userRef, {
        chapters: updatedChapters
      });

      // Only apply rewards and show modal if challenge wasn't already completed
      if (!wasAlreadyCompleted) {
        // Use centralized reward granting service
        const { grantChallengeRewards } = await import('../utils/challengeRewards');
        
        console.log('🎁 ChapterDetail: Granting rewards for Squad Up challenge:', {
          challengeId: 'ch2-team-trial',
          rewards: challenge.rewards
        });
        
        const rewardResult = await grantChallengeRewards(
          currentUser.uid,
          'ch2-team-trial',
          challenge.rewards,
          challenge.title
        );

        if (rewardResult.success) {
          if (rewardResult.alreadyClaimed) {
            console.log('🎁 ChapterDetail: Rewards were already claimed previously');
            // Still show modal but indicate rewards were already granted
            setRewardModalData({
              challengeTitle: challenge.title,
              rewards: challenge.rewards,
              xpReward: rewardResult.rewardsGranted.xp,
              ppReward: rewardResult.rewardsGranted.pp
            });
            setShowRewardModal(true);
          } else {
            console.log('✅ ChapterDetail: Rewards granted successfully:', rewardResult.rewardsGranted);
            
            // Show reward modal with granted rewards
            setRewardModalData({
              challengeTitle: challenge.title,
              rewards: challenge.rewards,
              xpReward: rewardResult.rewardsGranted.xp,
              ppReward: rewardResult.rewardsGranted.pp
            });
            setShowRewardModal(true);
          }
        } else {
          console.error('❌ ChapterDetail: Failed to grant rewards:', rewardResult.error);
          alert(`Error granting rewards: ${rewardResult.error}. Please try again.`);
        }
      }

      // Refresh user progress to trigger re-render and unlock next challenge
      const refreshedUserDoc = await getDoc(userRef);
      if (refreshedUserDoc.exists()) {
        const refreshedData = refreshedUserDoc.data();
        setUserProgress(refreshedData);
        
        // Force a small delay to ensure Firestore has propagated the changes
        setTimeout(() => {
          // Re-check user progress to ensure next challenge unlocks
          getDoc(userRef).then(doc => {
            if (doc.exists()) {
              setUserProgress(doc.data());
            }
          });
        }, 500);
      }
    } catch (error) {
      console.error('Error completing Squad Up story challenge:', error);
      alert('Error completing challenge. Please try again.');
    }
  };

  const handleSonidoTransmissionComplete = async () => {
    if (!currentUser) {
      console.error('❌ ChapterDetail: handleSonidoTransmissionComplete called but currentUser is null');
      return;
    }

    console.log('🎯 ChapterDetail: handleSonidoTransmissionComplete called', {
      userId: currentUser.uid,
      chapterId: chapter.id,
      challengeId: 'ep2-its-all-a-game'
    });

    try {
      const challenge = chapter.challenges.find(c => c.id === 'ep2-its-all-a-game');
      if (!challenge) {
        console.error('❌ ChapterDetail: Challenge ep2-its-all-a-game not found in chapter challenges');
        return;
      }

      // Verify that a battle was actually won by checking for a recent victory battle room
      // Look for battle rooms with challengeId 'ep2-its-all-a-game' and status 'victory'
      console.log('🔍 ChapterDetail: Querying for battle victory...', {
        challengeId: 'ep2-its-all-a-game',
        userId: currentUser.uid
      });
      
      const battleRoomsRef = collection(db, 'islandRaidBattleRooms');
      const battleRoomsQuery = query(
        battleRoomsRef,
        where('challengeId', '==', 'ep2-its-all-a-game'),
        where('players', 'array-contains', currentUser.uid),
        where('status', '==', 'victory')
      );
      const battleRoomsSnapshot = await getDocs(battleRoomsQuery);
      
      console.log('📊 ChapterDetail: Found battle rooms:', battleRoomsSnapshot.docs.length);
      
      // Check if there's a recent victory (within last 24 hours) with all 4 waves completed
      // AND all enemies in the final wave are actually defeated (final boss defeated)
      const recentVictory = battleRoomsSnapshot.docs.find(doc => {
        const data = doc.data();
        const waveNumber = data.waveNumber || 0;
        const maxWaves = data.maxWaves || 4;
        const createdAt = data.createdAt?.toDate();
        const isRecent = createdAt && (Date.now() - createdAt.getTime()) < 24 * 60 * 60 * 1000; // 24 hours
        
        console.log('🔍 ChapterDetail: Checking battle room:', {
          docId: doc.id,
          waveNumber,
          maxWaves,
          isRecent,
          createdAt: createdAt?.toISOString()
        });
        
        // Must be on or past the final wave
        if (waveNumber < maxWaves || !isRecent) {
          return false;
        }
        
        // CRITICAL: Verify that all enemies in the final wave are actually defeated
        // The final boss must be defeated, not just Wave 4 started
        const enemies = data.enemies || [];
        const allEnemiesDefeated = enemies.length === 0 || enemies.every((enemy: any) => {
          // Check health (vaultHealth for Island Raid, or health/currentPP as fallback)
          const health = enemy.vaultHealth !== undefined 
            ? Math.max(0, Number(enemy.vaultHealth))
            : (enemy.health !== undefined 
              ? Math.max(0, Number(enemy.health))
              : (enemy.currentPP !== undefined ? Math.max(0, Number(enemy.currentPP)) : 0));
          // Check shield
          const shield = enemy.shieldStrength !== undefined 
            ? Math.max(0, Number(enemy.shieldStrength))
            : 0;
          // Enemy is defeated if both health and shield are 0
          return health <= 0 && shield <= 0;
        });
        
        console.log('🔍 ChapterDetail: Battle room check result:', {
          docId: doc.id,
          waveNumber,
          maxWaves,
          allEnemiesDefeated,
          enemiesCount: enemies.length
        });
        
        // Only return true if we're on the final wave AND all enemies are defeated
        return waveNumber >= maxWaves && allEnemiesDefeated;
      });

      // Only complete if there's a verified victory
      if (!recentVictory) {
        console.warn('⚠️ ChapterDetail: No verified battle victory found for ep2-its-all-a-game. Challenge will not be marked as complete.', {
          totalBattleRooms: battleRoomsSnapshot.docs.length,
          checkedRooms: battleRoomsSnapshot.docs.map(d => ({
            id: d.id,
            waveNumber: d.data().waveNumber,
            maxWaves: d.data().maxWaves,
            status: d.data().status
          }))
        });
        return; // Don't complete the challenge if battle wasn't actually won
      }

      console.log('✅ ChapterDetail: Verified battle victory found!', {
        battleRoomId: recentVictory.id,
        waveNumber: recentVictory.data().waveNumber,
        maxWaves: recentVictory.data().maxWaves
      });

      // Get the candy choice from the battle room
      const battleRoomData = recentVictory.data();
      const candyChoice = battleRoomData.candyChoice || 'on-off'; // Default to on-off if not found

      console.log('📝 ChapterDetail: Writing completion to Firestore...', {
        userId: currentUser.uid,
        chapterId: chapter.id,
        challengeId: 'ep2-its-all-a-game',
        candyChoice
      });

      const userRef = doc(db, 'users', currentUser.uid);
      const currentData = userProgress || {};
      
      // Check if challenge was already completed
      const wasAlreadyCompleted = currentData.chapters?.[chapter.id]?.challenges?.['ep2-its-all-a-game']?.isCompleted || 
                                   currentData.chapters?.[chapter.id]?.challenges?.['ep2-its-all-a-game']?.status === 'approved';
      
      console.log('📊 ChapterDetail: Current completion status:', {
        wasAlreadyCompleted,
        currentChallengeData: currentData.chapters?.[chapter.id]?.challenges?.['ep2-its-all-a-game']
      });
      
      const updatedChapters = {
        ...currentData.chapters,
        [chapter.id]: {
          ...currentData.chapters?.[chapter.id],
          challenges: {
            ...currentData.chapters?.[chapter.id]?.challenges,
            'ep2-its-all-a-game': {
              isCompleted: true,
              completedAt: serverTimestamp(),
              status: 'approved',
              candyChoice: candyChoice // Store the candy choice
            }
          }
        }
      };

      await updateDoc(userRef, {
        chapters: updatedChapters
      });
      
      // Verify the write succeeded
      const verifyDoc = await getDoc(userRef);
      if (verifyDoc.exists()) {
        const verifyData = verifyDoc.data();
        const verifyChallenge = verifyData.chapters?.[chapter.id]?.challenges?.['ep2-its-all-a-game'];
        console.log('✅ ChapterDetail: Completion write verified!', {
          isCompleted: verifyChallenge?.isCompleted,
          status: verifyChallenge?.status,
          candyChoice: verifyChallenge?.candyChoice
        });
      } else {
        console.error('❌ ChapterDetail: User document not found after write!');
      }

      // Only apply rewards and show modal if challenge wasn't already completed
      if (!wasAlreadyCompleted) {
        // Use centralized reward granting service
        const { grantChallengeRewards } = await import('../utils/challengeRewards');
        
        console.log('🎁 ChapterDetail: Granting rewards for Sonido Transmission challenge:', {
          challengeId: 'ep2-its-all-a-game',
          rewards: challenge.rewards
        });
        
        const rewardResult = await grantChallengeRewards(
          currentUser.uid,
          'ep2-its-all-a-game',
          challenge.rewards,
          challenge.title
        );

        if (rewardResult.success) {
          if (rewardResult.alreadyClaimed) {
            console.log('🎁 ChapterDetail: Rewards were already claimed previously');
            setRewardModalData({
              challengeTitle: challenge.title,
              rewards: challenge.rewards,
              xpReward: rewardResult.rewardsGranted.xp,
              ppReward: rewardResult.rewardsGranted.pp
            });
            setShowRewardModal(true);
          } else {
            console.log('✅ ChapterDetail: Rewards granted successfully:', rewardResult.rewardsGranted);
            
            // Handle ability rewards separately (not in centralized service yet)
            const abilityRewards = challenge.rewards.filter(r => r.type === 'ability');
            if (abilityRewards.length > 0) {
              const userRefForRewards = doc(db, 'users', currentUser.uid);
              const currentAbilities = currentData.abilities || {};
              const updatedAbilities = { ...currentAbilities };
              abilityRewards.forEach(abilityReward => {
                const abilityId = abilityReward.value;
                updatedAbilities[abilityId] = true;
              });
              
              await updateDoc(userRefForRewards, {
                abilities: updatedAbilities
              });
            }
            
            // Show reward modal with granted rewards
            setRewardModalData({
              challengeTitle: challenge.title,
              rewards: challenge.rewards,
              xpReward: rewardResult.rewardsGranted.xp,
              ppReward: rewardResult.rewardsGranted.pp
            });
            setShowRewardModal(true);
          }
        } else {
          console.error('❌ ChapterDetail: Failed to grant rewards:', rewardResult.error);
          alert(`Error granting rewards: ${rewardResult.error}. Please try again.`);
        }
      }

      // Refresh user progress to trigger re-render and unlock next challenge
      const refreshedUserDoc = await getDoc(userRef);
      if (refreshedUserDoc.exists()) {
        const refreshedData = refreshedUserDoc.data();
        setUserProgress(refreshedData);
        
        // Force a small delay to ensure Firestore has propagated the changes
        setTimeout(() => {
          // Re-check user progress to ensure next challenge unlocks
          getDoc(userRef).then(doc => {
            if (doc.exists()) {
              setUserProgress(doc.data());
            }
          });
        }, 500);
      }
    } catch (error) {
      console.error('Error completing Sonido transmission challenge:', error);
      alert('Error completing challenge. Please try again.');
    }
  };

  const handleResetChapter24 = async () => {
    if (!currentUser) return;
    
    // SECURITY: Only admins can reset challenges
    if (!isAdmin()) {
      alert('❌ Only administrators can reset challenges.');
      return;
    }
    
    if (!window.confirm('Are you sure you want to reset Chapter 2-4? This will mark it as incomplete.')) {
      return;
    }

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        // Reset the challenge progress
        const updatedChapters = {
          ...(userData.chapters || {}),
          [chapter.id]: {
            ...(userData.chapters?.[chapter.id] || {}),
            challenges: {
              ...(userData.chapters?.[chapter.id]?.challenges || {}),
              'ep2-its-all-a-game': {
                isCompleted: false
              }
            }
          }
        };

        await updateDoc(userRef, {
          chapters: updatedChapters,
          // Use dot notation to delete specific fields
          'chapters.2.challenges.ep2-its-all-a-game.status': deleteField(),
          'chapters.2.challenges.ep2-its-all-a-game.completedAt': deleteField(),
          'chapters.2.challenges.ep2-its-all-a-game.completedBy': deleteField()
        });
      }

      // Refresh user progress immediately
      const refreshedUserDoc = await getDoc(userRef);
      if (refreshedUserDoc.exists()) {
        const refreshedData = refreshedUserDoc.data();
        setUserProgress(refreshedData);
      }

      alert('✅ Chapter 2-4 has been reset! The challenge should now appear as incomplete.');
    } catch (error) {
      console.error('Error resetting Chapter 2-4:', error);
      alert('Error resetting challenge. Please try again.');
    }
  };

  const handleTimuIslandStoryComplete = async () => {
    if (!currentUser) return;

    try {
      const challenge = chapter.challenges.find(c => c.id === 'ch2-rival-selection');
      if (!challenge) return;

      const userRef = doc(db, 'users', currentUser.uid);
      const currentData = userProgress || {};
      
      // Check if challenge was already completed
      const wasAlreadyCompleted = currentData.chapters?.[chapter.id]?.challenges?.['ch2-rival-selection']?.isCompleted || 
                                   currentData.chapters?.[chapter.id]?.challenges?.['ch2-rival-selection']?.status === 'approved';
      
      const updatedChapters = {
        ...currentData.chapters,
        [chapter.id]: {
          ...currentData.chapters?.[chapter.id],
          challenges: {
            ...currentData.chapters?.[chapter.id]?.challenges,
            'ch2-rival-selection': {
              isCompleted: true,
              completedAt: serverTimestamp(),
              status: 'approved'
            }
          }
        }
      };

      await updateDoc(userRef, {
        chapters: updatedChapters
      });

      // Only apply rewards and show modal if challenge wasn't already completed
      if (!wasAlreadyCompleted) {
        // Apply rewards
        const xpReward = challenge.rewards.find(r => r.type === 'xp')?.value || 0;
        const ppReward = challenge.rewards.find(r => r.type === 'pp')?.value || 0;

        if (xpReward > 0 || ppReward > 0) {
          const studentRef = doc(db, 'students', currentUser.uid);
          const userRefForRewards = doc(db, 'users', currentUser.uid);
          
          // Update both collections with atomic increments
          await updateDoc(studentRef, {
            xp: increment(xpReward),
            powerPoints: increment(ppReward)
          });
          
          await updateDoc(userRefForRewards, {
            xp: increment(xpReward),
            powerPoints: increment(ppReward)
          });
        }

        // Show reward modal only on first completion
        setRewardModalData({
          challengeTitle: challenge.title,
          rewards: challenge.rewards,
          xpReward: xpReward,
          ppReward: ppReward
        });
        setShowRewardModal(true);
      }

      // Refresh user progress to trigger re-render and unlock next challenge
      const refreshedUserDoc = await getDoc(userRef);
      if (refreshedUserDoc.exists()) {
        const refreshedData = refreshedUserDoc.data();
        setUserProgress(refreshedData);
        
        // Force a small delay to ensure Firestore has propagated the changes
        setTimeout(() => {
          // Re-check user progress to ensure next challenge unlocks
          getDoc(userRef).then(doc => {
            if (doc.exists()) {
              setUserProgress(doc.data());
            }
          });
        }, 500);
      }
    } catch (error) {
      console.error('Error completing Timu Island story challenge:', error);
      alert('Error completing challenge. Please try again.');
    }
  };

  const handleChallengeComplete = async (challenge: ChapterChallenge) => {
    if (!currentUser) return;

    // Check if this is an auto-completable challenge
    const isAutoCompletable = challenge.type === 'team' && challenge.requirements.length === 0;
    
    if (isAutoCompletable) {
      alert('This challenge will be completed automatically when you meet the requirements. No manual submission needed.');
      return;
    }

    // Special handling for profile update challenge - now it's a Hela battle with Ice Golems
    if (challenge.id === 'ep1-update-profile') {
      setCompletingChallenge('ep1-update-profile');
      setShowHelaBattle(true);
      return;
    }

    // Special handling for manifest declaration challenge
    if (challenge.id === 'ch1-declare-manifest') {
      const hasManifest = studentData?.manifest?.manifestId || studentData?.manifestationType;
      
      if (!hasManifest) {
        alert('Please choose your manifestation type first. You can do this from your profile or dashboard.');
        return;
      }
    }

    // Special handling for rival selection challenge
    if (challenge.id === 'ch2-rival-selection') {
      setShowRivalSelectionModal(true);
      setCompletingChallenge(null);
      return;
    }

    // Special handling for Truth Metal Choice challenge
    if (challenge.id === 'ep1-truth-metal-choice') {
      setShowTruthMetalModal(true);
      setCompletingChallenge(null);
      return;
    }

    // Special handling for Challenge 5 (Power Card Intro) - auto-complete on click
    if (challenge.id === 'ep1-power-card-intro') {
      await handleAutoCompleteChallenge(challenge);
      return;
    }

    setCompletingChallenge(challenge.id);

    try {
      // Check if challenge is already submitted or completed
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      const userProgress = userDoc.exists() ? userDoc.data() : {};
      
      if (userProgress.chapters?.[chapter.id]?.challenges?.[challenge.id]?.isCompleted) {
        alert('This challenge has already been completed!');
        setCompletingChallenge(null);
        return;
      }

      // Check if already submitted for approval
      const submissionsQuery = query(
        collection(db, 'challengeSubmissions'),
        where('userId', '==', currentUser.uid),
        where('chapterId', '==', chapter.id),
        where('challengeId', '==', challenge.id),
        where('status', 'in', ['pending', 'approved'])
      );
      const submissionsSnapshot = await getDocs(submissionsQuery);
      
      if (!submissionsSnapshot.empty) {
        alert('This challenge has already been submitted for approval!');
        setCompletingChallenge(null);
        return;
      }

      // Update both the legacy system (students collection) and new system (users collection)
      const studentRefSubmit = doc(db, 'students', currentUser.uid);
      const userRefSubmit = doc(db, 'users', currentUser.uid);
      
      // Update legacy challenges field for compatibility
      const studentDocSubmit = await getDoc(studentRefSubmit);
      if (studentDocSubmit.exists()) {
        const studentData = studentDocSubmit.data();
        const updatedChallenges = {
          ...studentData.challenges,
          [challenge.id]: {
            ...(studentData.challenges?.[challenge.id] || {}),
            submitted: true,
            status: 'pending',
            completed: false
          }
        };
        
        await updateDoc(studentRefSubmit, {
          challenges: updatedChallenges
        });
      }
      
      // Update new chapter system for ChallengeTracker display
      const userDocSubmit = await getDoc(userRefSubmit);
      if (userDocSubmit.exists()) {
        const userData = userDocSubmit.data();
        
        // Debug logging
        console.log('ChapterDetail: Updating user chapters system:', {
          chapterId: chapter.id,
          chapterIdType: typeof chapter.id,
          challengeId: challenge.id,
          challengeIdType: typeof challenge.id,
          currentChapters: userData.chapters,
          currentChapterData: userData.chapters?.[chapter.id],
          chapterKeys: Object.keys(userData.chapters || {})
        });
        
        const updatedChapters = {
          ...userData.chapters,
          [chapter.id]: {
            ...userData.chapters?.[chapter.id],
            challenges: {
              ...userData.chapters?.[chapter.id]?.challenges,
              [challenge.id]: {
                submitted: true,
                status: 'pending',
                isCompleted: false
              }
            }
          }
        };
        
        console.log('ChapterDetail: Updated chapters data:', updatedChapters);
        
        await updateDoc(userRefSubmit, {
          chapters: updatedChapters
        });
      }

      // Submit challenge for admin approval
      const submissionData = {
        userId: currentUser.uid,
        userEmail: currentUser.email || '',
        displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
        photoURL: currentUser.photoURL || '',
        chapterId: chapter.id,
        challengeId: challenge.id,
        challengeName: challenge.title,
        challengeDescription: challenge.description,
        submissionType: 'chapter_challenge',
        status: 'pending',
        submittedAt: serverTimestamp(),
        xpReward: challenge.rewards.find(r => r.type === 'xp')?.value || 0,
        ppReward: challenge.rewards.find(r => r.type === 'pp')?.value || 0,
        rewards: challenge.rewards
      };

      console.log('Creating challenge submission:', submissionData);
      
      const submissionRef = await addDoc(collection(db, 'challengeSubmissions'), submissionData);
      console.log('Submission created with ID:', submissionRef.id);

      alert(`🎉 Challenge "${challenge.title}" submitted for admin approval! You'll be notified when it's reviewed.`);
      
      // Update pending submissions list
      setPendingSubmissions(prev => ({ ...prev, [challenge.id]: true }));
      
    } catch (error) {
      console.error('Error submitting challenge:', error);
      alert('Failed to submit challenge. Please try again.');
    } finally {
      setCompletingChallenge(null);
    }
  };

  const toggleChallenge = (challengeId: string) => {
    setExpandedChallenges(prev => {
      const newSet = new Set(prev);
      if (newSet.has(challengeId)) {
        newSet.delete(challengeId);
      } else {
        newSet.add(challengeId);
      }
      return newSet;
    });
  };

  const renderChallenges = () => {
    return (
      <div className="space-y-6">
        <h2 style={{ 
          fontSize: '2rem', 
          fontWeight: 'bold', 
          color: '#1f2937',
          marginBottom: '1rem'
        }}>
          Chapter {chapter.id} Challenges
        </h2>
        
        <div style={{
          marginBottom: '2rem',
          padding: '1rem',
          backgroundColor: '#f9fafb',
          borderRadius: '0.5rem',
          border: '1px solid #e5e7eb'
        }}>
          <h3 style={{ 
            fontSize: '1rem', 
            fontWeight: '600',
            color: '#6b7280',
            marginBottom: '0.5rem'
          }}>
            Description
          </h3>
          <p style={{ 
            fontSize: '0.875rem', 
            color: '#374151',
            lineHeight: '1.6'
          }}>
            {chapter.description}
          </p>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {chapter.challenges.map((challenge, index) => {
            const status = getChallengeStatus(challenge);
            const challengeNumber = index + 1;
            const isExpanded = expandedChallenges.has(challenge.id);
            const isLocked = status === 'locked';
            const isCompleted = status === 'completed';
            
            // Get XP and PP rewards
            const xpReward = challenge.rewards.find(r => r.type === 'xp')?.value || 0;
            const ppReward = challenge.rewards.find(r => r.type === 'pp')?.value || 0;
            
            return (
              <div
                key={challenge.id}
                style={{
                  background: isLocked ? '#f3f4f6' : isCompleted ? '#f0fdf4' : '#ffffff',
                  border: `2px solid ${isLocked ? '#d1d5db' : isCompleted ? '#86efac' : '#e5e7eb'}`,
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  boxShadow: isCompleted ? '0 2px 8px rgba(16, 185, 129, 0.15)' : '0 2px 4px rgba(0,0,0,0.05)',
                  transition: 'all 0.2s ease',
                  cursor: isLocked ? 'not-allowed' : 'pointer',
                  position: 'relative'
                }}
                onClick={() => !isLocked && toggleChallenge(challenge.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1 }}>
                    <h4 style={{ 
                      fontSize: '1.125rem', 
                      fontWeight: 'bold', 
                      color: isLocked ? '#9ca3af' : isCompleted ? '#047857' : '#1f2937',
                      margin: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      {isCompleted && (
                        <span style={{
                          fontSize: '1rem',
                          color: '#10b981'
                        }}>
                          ✓
                        </span>
                      )}
                      Chapter {chapter.id}-{challengeNumber}: {challenge.title}
                    </h4>
                    {isLocked && (
                      <span style={{
                        fontSize: '0.875rem',
                        color: '#9ca3af',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}>
                        🔒 Locked
                      </span>
                    )}
                  </div>
                  {!isLocked && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem'
                    }}>
                      {/* Rewards Preview */}
                      {xpReward > 0 && (
                        <div style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#dbeafe',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#1e40af'
                        }}>
                          {xpReward}XP
                        </div>
                      )}
                      {ppReward > 0 && (
                        <div style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#fef3c7',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          color: '#92400e'
                        }}>
                          {ppReward}PP
                        </div>
                      )}
                      <span style={{
                        fontSize: '1.25rem',
                        transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease'
                      }}>
                        ▼
                      </span>
                    </div>
                  )}
                </div>
                
                {/* Completion Status Bar */}
                {isCompleted && (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem',
                    backgroundColor: '#d1fae5',
                    borderRadius: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.875rem',
                    color: '#047857',
                    fontWeight: '500'
                  }}>
                    <span style={{ fontSize: '1rem' }}>✓</span>
                    <span>Completed</span>
                    {(() => {
                      const chapterProgress = userProgress?.chapters?.[chapter.id];
                      const challengeProgress = chapterProgress?.challenges?.[challenge.id];
                      const completedAt = challengeProgress?.completedAt;
                      if (completedAt) {
                        const date = completedAt.toDate ? completedAt.toDate() : new Date(completedAt);
                        return (
                          <span style={{ marginLeft: 'auto', fontSize: '0.75rem', opacity: 0.8 }}>
                            on {date.toLocaleDateString()}
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )}
                
                {/* Expanded Content */}
                {isExpanded && !isLocked && (
                  <div style={{
                    marginTop: '1rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid #e5e7eb',
                    display: 'flex',
                    gap: '1.5rem'
                  }}>
                    {/* Challenge Details */}
                    <div style={{ flex: 1 }}>
                      <p style={{ 
                        fontSize: '0.875rem', 
                        color: '#374151',
                        lineHeight: '1.6',
                        marginBottom: '1rem'
                      }}>
                        {challenge.description}
                      </p>
                      
                      {/* All Rewards */}
                      {challenge.rewards && challenge.rewards.length > 0 && (
                        <div style={{
                          marginTop: '1rem',
                          padding: '0.75rem',
                          backgroundColor: '#f0f9ff',
                          border: '1px solid #0ea5e9',
                          borderRadius: '0.5rem'
                        }}>
                          <div style={{
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            color: '#0c4a6e',
                            marginBottom: '0.5rem'
                          }}>
                            Rewards:
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                            {challenge.rewards.map((reward, rewardIndex) => {
                              if (reward.type === 'xp') {
                                return (
                                  <div key={rewardIndex} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.25rem 0.5rem',
                                    backgroundColor: '#dbeafe',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    color: '#1e40af'
                                  }}>
                                    <span>⭐</span>
                                    <span>{reward.value} XP</span>
                                  </div>
                                );
                              } else if (reward.type === 'pp') {
                                return (
                                  <div key={rewardIndex} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.25rem 0.5rem',
                                    backgroundColor: '#fef3c7',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    color: '#92400e'
                                  }}>
                                    <span>💰</span>
                                    <span>{reward.value} PP</span>
                                  </div>
                                );
                              } else if (reward.type === 'truthMetal') {
                                return (
                                  <div key={rewardIndex} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.25rem 0.5rem',
                                    backgroundColor: '#fef2f2',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    color: '#991b1b'
                                  }}>
                                    <span>💎</span>
                                    <span>{reward.value} Truth Metal</span>
                                  </div>
                                );
                              } else if (reward.type === 'artifact') {
                                const artifactName = reward.description || reward.value;
                                const artifactId = String(reward.value || '').toLowerCase();
                                const artifactNameLower = String(artifactName || '').toLowerCase();
                                // Use hat icon for Captain's Helmet, ring icon for other artifacts
                                const artifactIcon = (artifactId.includes('captain') || artifactId.includes('helmet') || 
                                                     artifactNameLower.includes('captain') || artifactNameLower.includes('helmet')) 
                                                     ? '🪖' : '💍';
                                return (
                                  <div key={rewardIndex} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    padding: '0.25rem 0.5rem',
                                    backgroundColor: '#f3e8ff',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    color: '#7c3aed'
                                  }}>
                                    <span>{artifactIcon}</span>
                                    <span>{artifactName}</span>
                                  </div>
                                );
                              }
                              return null;
                            })}
                          </div>
                        </div>
                      )}
                      
                      {/* Challenge Action Buttons */}
                      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {/* CPU Battle for manifest test */}
                        {status === 'available' && challenge.id === 'ep1-manifest-test' && (
                          <button
                            type="button"
                            style={{ 
                              padding: '0.75rem 1.5rem', 
                              background: '#dc2626', 
                              color: 'white', 
                              border: 'none', 
                              borderRadius: '0.5rem', 
                              cursor: 'pointer',
                              fontWeight: 'bold',
                              fontSize: '0.875rem',
                              transition: 'all 0.2s ease'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setCompletingChallenge('ep1-manifest-test');
                              setIsReplayMode(false);
                              setShowCPUBattleModal(true);
                            }}
                          >
                            ⚔️ Battle CPU Challenger
                          </button>
                        )}
                        
                        {/* Get Letter challenge */}
                        {status === 'available' && challenge.id === 'ep1-get-letter' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowLetterModal(true);
                            }}
                            style={{
                              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                              color: 'white',
                              padding: '0.75rem 1.5rem',
                              borderRadius: '0.5rem',
                              border: 'none',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              boxShadow: '0 2px 4px rgba(139, 92, 246, 0.3)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '100%'
                            }}
                          >
                            <span style={{ marginRight: '0.5rem' }}>📬</span>
                            View Letter
                          </button>
                        )}
                        
                        {/* Timu Island Story for Chapter 2-2 */}
                        {challenge.id === 'ch2-rival-selection' && (
                          <>
                            {(status === 'available' || (isAdmin() && status === 'completed')) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowTimuIslandStoryModal(true);
                                }}
                                style={{
                                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                  color: 'white',
                                  padding: '0.75rem 1.5rem',
                                  borderRadius: '0.5rem',
                                  border: 'none',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                  boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '100%',
                                  marginBottom: status === 'completed' ? '0.5rem' : '0'
                                }}
                              >
                                <span style={{ marginRight: '0.5rem' }}>👥</span>
                                Find a Home
                              </button>
                            )}
                            {isAdmin() && status === 'completed' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  resetChapter2Challenge2();
                                }}
                                style={{
                                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                  color: 'white',
                                  padding: '0.5rem 1rem',
                                  borderRadius: '0.5rem',
                                  border: 'none',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                  boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '100%',
                                  fontSize: '0.875rem'
                                }}
                              >
                                <span style={{ marginRight: '0.5rem' }}>🔄</span>
                                Reset Challenge (Admin)
                              </button>
                            )}
                          </>
                        )}

                        {/* Squad Up Story for Chapter 2-3 */}
                        {challenge.id === 'ch2-team-trial' && (
                          <>
                            {(status === 'available' || (isAdmin() && status === 'completed')) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowSquadUpStoryModal(true);
                                }}
                                style={{
                                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                  color: 'white',
                                  padding: '0.75rem 1.5rem',
                                  borderRadius: '0.5rem',
                                  border: 'none',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                  boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '100%',
                                  marginBottom: status === 'completed' ? '0.5rem' : '0'
                                }}
                              >
                                <span style={{ marginRight: '0.5rem' }}>👥</span>
                                Squad Up
                              </button>
                            )}
                            {isAdmin() && status === 'completed' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  resetChapter2Challenge3();
                                }}
                                style={{
                                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                  color: 'white',
                                  padding: '0.5rem 1rem',
                                  borderRadius: '0.5rem',
                                  border: 'none',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                  boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '100%',
                                  fontSize: '0.875rem'
                                }}
                              >
                                <span style={{ marginRight: '0.5rem' }}>🔄</span>
                                Reset Challenge (Admin)
                              </button>
                            )}
                          </>
                        )}

                        {/* Portal Intro Video for Chapter 2-1 */}
                        {challenge.id === 'ch2-team-formation' && (
                          <>
                            {(status === 'available' || (isAdmin() && status === 'completed')) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowPortalIntroModal(true);
                                }}
                                style={{
                                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                  color: 'white',
                                  padding: '0.75rem 1.5rem',
                                  borderRadius: '0.5rem',
                                  border: 'none',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                  boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '100%',
                                  marginBottom: status === 'completed' ? '0.5rem' : '0'
                                }}
                              >
                                <span style={{ marginRight: '0.5rem' }}>🌀</span>
                                Go through the Portal
                              </button>
                            )}
                            {/* Reset button for testing (admin only) */}
                            {isAdmin() && status === 'completed' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  resetChapter2Challenge1(false);
                                }}
                                style={{
                                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                  color: 'white',
                                  padding: '0.5rem 1rem',
                                  borderRadius: '0.5rem',
                                  border: 'none',
                                  fontWeight: 'bold',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                  boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '100%',
                                  fontSize: '0.875rem'
                                }}
                              >
                                <span style={{ marginRight: '0.5rem' }}>🔄</span>
                                Reset Challenge (Admin)
                              </button>
                            )}
                          </>
                        )}
                        
                        {/* Zeke Ends Battle Cutscene for Chapter 1-9 */}
                        {status === 'available' && challenge.id === 'ep1-where-it-started' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowZekeEndsBattleCutscene(true);
                            }}
                            style={{
                              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                              color: 'white',
                              padding: '0.75rem 1.5rem',
                              borderRadius: '0.5rem',
                              border: 'none',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              boxShadow: '0 2px 4px rgba(139, 92, 246, 0.3)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '100%'
                            }}
                          >
                            <span style={{ marginRight: '0.5rem' }}>🚇</span>
                            Escape the Abandoned Subway
                          </button>
                        )}
                        
                        {/* Special button for "It's All a Game" challenge */}
                        {status === 'available' && challenge.id === 'ep2-its-all-a-game' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowSonidoTransmissionModal(true);
                            }}
                            style={{
                              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                              color: 'white',
                              padding: '0.75rem 1.5rem',
                              borderRadius: '0.5rem',
                              border: 'none',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)',
                              width: '100%'
                            }}
                          >
                            <span style={{ marginRight: '0.5rem' }}>📡</span>
                            Listen to transmission
                          </button>
                        )}
                        
                        {/* Reset button for Chapter 2-4 (ADMIN ONLY) */}
                        {status === 'completed' && challenge.id === 'ep2-its-all-a-game' && isAdmin() && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResetChapter24();
                            }}
                            style={{
                              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                              color: 'white',
                              padding: '0.5rem 1rem',
                              borderRadius: '0.5rem',
                              border: 'none',
                              fontWeight: 'bold',
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                              boxShadow: '0 2px 4px rgba(239, 68, 68, 0.3)',
                              width: '100%',
                              marginTop: '0.5rem',
                              fontSize: '0.875rem'
                            }}
                          >
                            <span style={{ marginRight: '0.5rem' }}>🔄</span>
                            Reset Challenge (Testing)
                          </button>
                        )}

                        {/* Regular submit button for other challenges */}
                        {/* Exclude all Chapter 2 challenges from showing "Submit for Approval" */}
                        {status === 'available' && 
                         challenge.id !== 'ep1-manifest-test' && 
                         challenge.id !== 'ep1-get-letter' && 
                         challenge.id !== 'ep1-truth-metal-choice' && 
                         challenge.id !== 'ep1-touch-truth-metal' && 
                         challenge.id !== 'ep1-view-mst-ui' && 
                         challenge.id !== 'ep1-power-card-intro' && 
                         challenge.id !== 'ep1-combat-drill' && 
                         challenge.id !== 'ep1-update-profile' && 
                         challenge.id !== 'ep1-view-power-card' && 
                         challenge.id !== 'ep1-where-it-started' && 
                         challenge.id !== 'ep1-portal-sequence' &&
                         challenge.id !== 'ch2-team-formation' &&
                         challenge.id !== 'ch2-rival-selection' &&
                         challenge.id !== 'ep2-its-all-a-game' &&
                         !challenge.id.startsWith('ch2-') &&
                         !(challenge.type === 'team' && challenge.requirements.length === 0) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleChallengeComplete(challenge);
                            }}
                            disabled={completingChallenge === challenge.id}
                            style={{
                              background: completingChallenge === challenge.id 
                                ? 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)'
                                : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                              color: 'white',
                              padding: '0.75rem 1.5rem',
                              borderRadius: '0.5rem',
                              border: 'none',
                              fontWeight: 'bold',
                              cursor: completingChallenge === challenge.id ? 'not-allowed' : 'pointer',
                              transition: 'all 0.2s ease',
                              boxShadow: '0 2px 4px rgba(59, 130, 246, 0.3)',
                              opacity: completingChallenge === challenge.id ? 0.7 : 1,
                              width: '100%'
                            }}
                          >
                            {completingChallenge === challenge.id ? (
                              <>
                                <span style={{ marginRight: '0.5rem' }}>⏳</span>
                                Submitting...
                              </>
                            ) : (
                              <>
                                <span style={{ marginRight: '0.5rem' }}>🎯</span>
                                Submit for Approval
                              </>
                            )}
                          </button>
                        )}
                        
                        {/* Team challenge auto-complete message */}
                        {status === 'available' && challenge.type === 'team' && challenge.requirements.length === 0 && (
                          <div style={{
                            background: 'rgba(59, 130, 246, 0.1)',
                            border: '1px solid #3b82f6',
                            borderRadius: '0.5rem',
                            padding: '0.75rem',
                            color: '#1e40af',
                            fontSize: '0.875rem',
                            fontWeight: 'bold'
                          }}>
                            🔄 This challenge will be completed automatically when you join a team.
                          </div>
                        )}
                        
                        {/* Pending status */}
                        {status === 'pending' && (
                          <div style={{
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid #f59e0b',
                            borderRadius: '0.5rem',
                            padding: '0.75rem',
                            color: '#92400e',
                            fontSize: '0.875rem',
                            fontWeight: 'bold'
                          }}>
                            ⏳ Submitted for admin approval. You'll be notified when it's reviewed.
                          </div>
                        )}
                        
                        {/* Completed status */}
                        {status === 'completed' && (
                          <div style={{
                            background: 'rgba(34, 197, 94, 0.1)',
                            border: '1px solid #22c55e',
                            borderRadius: '0.5rem',
                            padding: '0.75rem',
                            color: '#166534',
                            fontSize: '0.875rem',
                            fontWeight: 'bold'
                          }}>
                            ✅ Completed on {userProgress?.chapters?.[chapter.id]?.challenges?.[challenge.id]?.completedAt?.toDate?.()?.toLocaleDateString() || 'Unknown date'}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* Image Preview */}
                    <div style={{
                      width: '200px',
                      height: '150px',
                      backgroundColor: '#f3f4f6',
                      border: '2px dashed #d1d5db',
                      borderRadius: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      overflow: 'hidden'
                    }}>
                      {challenge.id === 'ch2-team-formation' ? (
                        <img 
                          src="/images/Ch2-1 _ Preview_Timu Island.png" 
                          alt="Timu Island Preview"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            borderRadius: '0.5rem'
                          }}
                        />
                      ) : challenge.id === 'ch2-rival-selection' ? (
                        <img 
                          src="/images/Ch2-2_Preview_Home.png" 
                          alt="Find a Home Preview"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            borderRadius: '0.5rem'
                          }}
                        />
                      ) : challenge.id === 'ch2-team-trial' ? (
                        <img 
                          src="/images/Ch2-3_Preview_SquadUp.png" 
                          alt="Squad Up Preview"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            borderRadius: '0.5rem'
                          }}
                        />
                      ) : challenge.id === 'ep2-its-all-a-game' ? (
                        <img 
                          src="/images/Ch2-4_Preview_RRCandy.png" 
                          alt="It's All a Game Preview"
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            borderRadius: '0.5rem'
                          }}
                        />
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                          Image Preview
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTeamSection = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white mb-4">Team Formation</h3>
      {chapter.teamSize > 1 ? (
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-gray-700 mb-4">
            This chapter requires a team of {chapter.teamSize} players. 
            {!userProgress?.team ? ' You need to form a team to proceed.' : ' Your team is ready.'}
          </p>
          
          {!userProgress?.team ? (
            <button className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors">
              Form Team
            </button>
          ) : (
            <div className="text-green-700">
              ✓ Team formed: {userProgress.team.name}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-gray-50 p-4 rounded-lg">
          <p className="text-gray-600">This is a solo chapter. No team formation required.</p>
        </div>
      )}
    </div>
  );

  const renderRivalSection = () => {
    // Check for rival in both legacy and new chapter system
    const rival = userProgress?.rival || userProgress?.chapters?.[chapter.id]?.rival;
    
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white mb-4">Rival Selection</h3>
        {!rival ? (
          <div className="bg-white p-4 rounded-lg border">
            <p className="text-gray-700 mb-4">
              Choose your rival - an enemy or internalized foe to overcome in this chapter.
            </p>
            <button 
              onClick={() => setShowRivalSelectionModal(true)}
              className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition-colors"
            >
              Select Rival
            </button>
          </div>
        ) : (
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-gray-700 mb-2">
              <strong>Current Rival:</strong> {rival.name}
            </div>
            <p className="text-sm text-gray-600 mb-2">{rival.description}</p>
            {rival.isDefeated ? (
              <div className="text-green-700">✓ Rival defeated</div>
            ) : (
              <div className="text-red-700">⚠ Rival not yet defeated</div>
            )}
            <button 
              onClick={() => setShowRivalSelectionModal(true)}
              className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600 transition-colors mt-2"
            >
              Change Rival
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderVeilSection = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white mb-4">The Veil</h3>
      {!userProgress?.veil ? (
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-gray-700 mb-4">
            Enter the inmost cave to confront your greatest fear or internal block.
          </p>
          <button className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600 transition-colors">
            Confront the Veil
          </button>
        </div>
      ) : (
        <div className="bg-white p-4 rounded-lg border">
          <div className="text-gray-700 mb-2">
            <strong>Your Veil:</strong> {userProgress.veil.name}
          </div>
          <p className="text-sm text-gray-600 mb-2">{userProgress.veil.description}</p>
          {userProgress.veil.isConfronted ? (
            <div className="text-green-700">✓ Veil confronted</div>
          ) : (
            <div className="text-purple-700">⚠ Veil not yet confronted</div>
          )}
        </div>
      )}
    </div>
  );

  const renderEthicsSection = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white mb-4">The Ethics of Life</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {['Believe', 'Listen', 'Speak', 'Grow', 'Let Go', 'Give'].map((ethic) => (
          <div key={ethic} className="bg-white p-4 rounded-lg border">
            <h4 className="font-semibold text-gray-800 mb-2">{ethic}</h4>
            <p className="text-sm text-gray-600 mb-3">
              {ethic === 'Believe' && 'Blind Devotion vs. Discernment'}
              {ethic === 'Listen' && 'Silencing vs. Hearing Truth'}
              {ethic === 'Speak' && 'Lies vs. Responsibility'}
              {ethic === 'Grow' && 'Comfort vs. Discomfort'}
              {ethic === 'Let Go' && 'Grasping vs. Surrender'}
              {ethic === 'Give' && 'Selfishness vs. Service'}
            </p>
            <button className="bg-indigo-500 text-white px-3 py-1 rounded text-sm hover:bg-indigo-600 transition-colors">
              Face {ethic}
            </button>
          </div>
        ))}
      </div>
    </div>
  );

  // Calculate player power level
  const calculatePlayerPower = () => {
    if (!vault || !moves || !actionCards) return 0;
    
    const unlockedMoves = moves.filter(move => move.unlocked).length;
    const unlockedCards = actionCards.filter(card => card.unlocked).length;
    const vaultStrength = vault.shieldStrength + (vault.generatorLevel || 1) * 5; // Use generator level instead of firewall
    const level = Math.floor((vault.currentPP / vault.capacity) * 10);
    
    return unlockedMoves * 10 + unlockedCards * 15 + vaultStrength + level;
  };

  const playerPower = calculatePlayerPower();

  // Check if episode is unlocked (with power level check)
  const isEpisodeUnlockedWithPower = (episode: StoryEpisode) => {
    if (episode.id === 'ep_01_xiotein_letter') return true;
    
    const requiredEpisodes = episode.gates.requires;
    const hasRequiredEpisodes = requiredEpisodes.every(req => 
      storyProgress.completedEpisodes.includes(req)
    );
    
    const hasMinLevel = playerPower >= episode.gates.minPower;
    
    return hasRequiredEpisodes && hasMinLevel;
  };

  // Get episode status (with power level check)
  const getEpisodeStatusWithPower = (episode: StoryEpisode) => {
    if (storyProgress.completedEpisodes.includes(episode.id)) {
      return 'completed';
    } else if (isEpisodeUnlockedWithPower(episode)) {
      return 'unlocked';
    } else {
      return 'locked';
    }
  };

  // Get difficulty color
  const getDifficultyColor = (power: number) => {
    if (playerPower >= power) return '#10b981'; // Green - Easy
    if (playerPower >= power * 0.8) return '#f59e0b'; // Yellow - Medium
    return '#ef4444'; // Red - Hard
  };

  // Handle episode selection
  const handleEpisodeClick = (episode: StoryEpisode) => {
    const status = getEpisodeStatusWithPower(episode);
    if (status === 'locked') return;
    
    setSelectedEpisode(episode);
  };

  // Start episode
  const handleStartEpisode = async (episode: StoryEpisode) => {
    try {
      await startEpisode(episode.id);
      // Navigate to episode battle
      navigate(`/story/${episode.id}/battle`);
    } catch (error) {
      console.error('Error starting episode:', error);
    }
  };

  const renderStoryEpisodes = () => (
    <div style={{ padding: '1.5rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ 
          fontSize: '1.5rem', 
          fontWeight: 'bold', 
          marginBottom: '1rem',
          color: '#1f2937'
        }}>
          📖 Story Episodes
        </h3>
        
        {/* Progress Bar */}
        <div style={{
          background: '#f3f4f6',
          borderRadius: '0.5rem',
          padding: '1rem',
          marginBottom: '2rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>Season Progress</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#374151' }}>
              {storyProgress.completedEpisodes.length}/9 Episodes
            </span>
          </div>
          <div style={{
            background: '#e5e7eb',
            height: '8px',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <div style={{
              background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
              height: '100%',
              width: `${(storyProgress.completedEpisodes.length / 9) * 100}%`,
              transition: 'width 0.3s ease'
            }} />
          </div>
        </div>

        {/* Player Power */}
        <div style={{
          background: '#f8fafc',
          borderRadius: '0.5rem',
          padding: '1rem',
          display: 'inline-block',
          marginBottom: '2rem'
        }}>
          <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
            Your Power Level
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937' }}>
            {playerPower}
          </div>
        </div>
      </div>

      {/* Episode Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '1.5rem'
      }}>
        {STORY_EPISODES.map(episode => {
          const status = getEpisodeStatusWithPower(episode);
          const isUnlocked = status !== 'locked';
          const isCompleted = status === 'completed';
          
          return (
            <div
              key={episode.id}
              onClick={() => handleEpisodeClick(episode)}
              style={{
                background: isUnlocked 
                  ? 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
                  : 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
                borderRadius: '1rem',
                padding: '1.5rem',
                cursor: isUnlocked ? 'pointer' : 'not-allowed',
                boxShadow: isUnlocked 
                  ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  : '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                transition: 'all 0.3s ease',
                opacity: isUnlocked ? 1 : 0.7,
                position: 'relative',
                border: '1px solid #e5e7eb'
              }}
              onMouseEnter={(e) => {
                if (isUnlocked) {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.1)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = isUnlocked 
                  ? '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  : '0 1px 3px 0 rgba(0, 0, 0, 0.1)';
              }}
            >
              {/* Status Badge */}
              <div style={{
                position: 'absolute',
                top: '0.75rem',
                right: '0.75rem',
                background: isCompleted ? '#10b981' : isUnlocked ? '#3b82f6' : '#6b7280',
                color: 'white',
                padding: '0.25rem 0.75rem',
                borderRadius: '0.75rem',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                textTransform: 'uppercase'
              }}>
                {isCompleted ? '✓' : isUnlocked ? 'Unlocked' : 'Locked'}
              </div>

              {/* Chapter Number */}
              <div style={{
                position: 'absolute',
                top: '0.75rem',
                left: '0.75rem',
                background: 'rgba(0,0,0,0.1)',
                color: isUnlocked ? '#374151' : '#9ca3af',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1rem',
                fontWeight: 'bold'
              }}>
                {episode.chapter}
              </div>

              {/* Episode Content */}
              <div style={{ marginTop: '2.5rem' }}>
                <h4 style={{
                  fontSize: '1.125rem',
                  fontWeight: 'bold',
                  color: isUnlocked ? '#1f2937' : '#9ca3af',
                  marginBottom: '0.75rem',
                  textAlign: 'center'
                }}>
                  {episode.title}
                </h4>

                <p style={{
                  color: isUnlocked ? '#6b7280' : '#9ca3af',
                  fontSize: '0.875rem',
                  lineHeight: '1.5',
                  marginBottom: '1rem',
                  textAlign: 'center'
                }}>
                  {episode.summary}
                </p>

                {/* Difficulty */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '1rem',
                  gap: '0.5rem'
                }}>
                  <span style={{ fontSize: '0.75rem', color: isUnlocked ? '#6b7280' : '#9ca3af' }}>
                    Power:
                  </span>
                  <span style={{
                    fontSize: '0.875rem',
                    fontWeight: 'bold',
                    color: getDifficultyColor(episode.recommendedPower)
                  }}>
                    {episode.recommendedPower}
                  </span>
                </div>

                {/* Rewards Preview */}
                <div style={{
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: '0.5rem',
                  padding: '0.75rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{
                    fontSize: '0.75rem',
                    fontWeight: 'bold',
                    color: '#065f46',
                    marginBottom: '0.25rem'
                  }}>
                    Rewards:
                  </div>
                  <div style={{
                    fontSize: '0.75rem',
                    color: '#065f46',
                    lineHeight: '1.4'
                  }}>
                    {episode.rewards.fixed.slice(0, 2).join(', ')}
                    {episode.rewards.fixed.length > 2 && '...'}
                  </div>
                </div>

                {/* Start Button */}
                {isUnlocked && !isCompleted && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEpisode(episode);
                    }}
                    style={{
                      background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                      color: 'white',
                      border: 'none',
                      padding: '0.75rem 1rem',
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      width: '100%',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 8px rgba(59, 130, 246, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    🚀 Start Episode
                  </button>
                )}

                {isCompleted && (
                  <div style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: 'white',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    textAlign: 'center',
                    fontSize: '0.875rem',
                    fontWeight: 'bold'
                  }}>
                    ✅ Complete
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Episode Detail Modal */}
      {selectedEpisode && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '2rem'
        }}
        onClick={() => setSelectedEpisode(null)}
        >
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '80vh',
            overflow: 'auto'
          }}
          onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{
              fontSize: '1.5rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
              textAlign: 'center'
            }}>
              {selectedEpisode.title}
            </h2>

            <p style={{
              color: '#6b7280',
              fontSize: '1rem',
              lineHeight: '1.6',
              marginBottom: '2rem',
              textAlign: 'center'
            }}>
              {selectedEpisode.summary}
            </p>

            {/* Objectives */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                🎯 Objectives
              </h3>
              {selectedEpisode.objectives.map((objective, index) => (
                <div key={index} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  marginBottom: '0.5rem'
                }}>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: objective.required ? '#ef4444' : '#f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    color: 'white',
                    fontWeight: 'bold'
                  }}>
                    {objective.required ? '!' : '?'}
                  </div>
                  <span style={{ color: '#374151' }}>
                    {objective.text}
                  </span>
                </div>
              ))}
            </div>

            {/* Rewards */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                🎁 Rewards
              </h3>
              <div style={{
                background: '#f8fafc',
                padding: '1rem',
                borderRadius: '0.5rem',
                border: '1px solid #e5e7eb'
              }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Fixed Rewards:</strong>
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
                  {selectedEpisode.rewards.fixed.join(', ')}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Choice Rewards:</strong>
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                  {selectedEpisode.rewards.choices.join(', ')}
                </div>
              </div>
            </div>

            {/* Start Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleStartEpisode(selectedEpisode);
              }}
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                color: 'white',
                border: 'none',
                padding: '1rem 2rem',
                borderRadius: '0.75rem',
                fontSize: '1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                width: '100%',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 8px rgba(59, 130, 246, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              🚀 Start Episode
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-xl p-8">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-600 rounded-full flex items-center justify-center mb-4">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-white border-t-transparent"></div>
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Loading Chapter Details</h3>
          <p className="text-gray-500 text-center">Preparing your chapter information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-xl p-8">
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={onBack}
          style={{
            color: '#3b82f6',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            fontWeight: '500',
            fontSize: '1rem',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            transition: 'color 0.2s ease'
          }}
          onMouseOver={(e) => e.currentTarget.style.color = '#1d4ed8'}
          onMouseOut={(e) => e.currentTarget.style.color = '#3b82f6'}
        >
          <span style={{ marginRight: '0.5rem', fontSize: '1.25rem' }}>←</span>
          Back to Player's Journey
        </button>
        
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: '2rem',
          borderRadius: '1rem',
          color: 'white',
          boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: '4rem',
              height: '4rem',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '3px solid rgba(255,255,255,0.3)'
            }}>
              <span style={{ 
                color: 'white', 
                fontSize: '1.5rem', 
                fontWeight: 'bold' 
              }}>
                {chapter.id}
              </span>
            </div>
            <div>
              <h2 style={{ 
                fontSize: '2rem', 
                fontWeight: 'bold',
                marginBottom: '0.5rem',
                textShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                Chapter {chapter.id}: {chapter.title}
              </h2>
              <p style={{ 
                fontSize: '1.125rem', 
                fontStyle: 'italic',
                opacity: 0.9
              }}>
                {chapter.subtitle}
              </p>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ 
              fontSize: '0.875rem', 
              opacity: 0.8, 
              marginBottom: '0.25rem' 
            }}>
              Story Arc
            </div>
            <div style={{
              fontWeight: 'bold',
              background: 'rgba(255,255,255,0.2)',
              padding: '0.5rem 1rem',
              borderRadius: '9999px',
              border: '1px solid rgba(255,255,255,0.3)'
            }}>
              {chapter.storyArc}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ 
        borderBottom: '2px solid #e5e7eb', 
        marginBottom: '2rem',
        background: '#f9fafb',
        borderRadius: '0.75rem 0.75rem 0 0',
        padding: '0.5rem 0.5rem 0 0.5rem'
      }}>
        <nav style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { id: 'challenges', label: 'Challenges', icon: '⚔️' },
            ...(chapter.id === 8 ? [{ id: 'ethics', label: 'Ethics', icon: '⚖️' }] : [])
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                padding: '0.75rem 1rem',
                borderBottom: `3px solid ${activeTab === tab.id ? '#3b82f6' : 'transparent'}`,
                fontWeight: '500',
                fontSize: '0.875rem',
                borderRadius: '0.5rem 0.5rem 0 0',
                transition: 'all 0.2s ease',
                background: activeTab === tab.id ? 'white' : 'transparent',
                color: activeTab === tab.id ? '#3b82f6' : '#6b7280',
                border: 'none',
                cursor: 'pointer',
                boxShadow: activeTab === tab.id ? '0 -2px 4px rgba(0,0,0,0.1)' : 'none'
              }}
              onMouseOver={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.color = '#374151';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.5)';
                }
              }}
              onMouseOut={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.color = '#6b7280';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <span style={{ marginRight: '0.5rem' }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'challenges' && renderChallenges()}
        {activeTab === 'ethics' && renderEthicsSection()}
      </div>

      {/* Rival Selection Modal */}
      <RivalSelectionModal
        isOpen={showRivalSelectionModal}
        onClose={() => setShowRivalSelectionModal(false)}
        onRivalSelected={handleRivalSelected}
      />

      {/* CPU Battle Modal */}
      <CPUChallenger
        isOpen={showCPUBattleModal}
        onClose={() => setShowCPUBattleModal(false)}
        onBattleComplete={handleCPUBattleComplete}
      />

      {/* Portal Tutorial Modal */}
      <PortalTutorial
        isOpen={showPortalTutorial}
        onComplete={handleTutorialComplete}
        onClose={() => setShowPortalTutorial(false)}
      />

      {/* Letter Modal */}
      <LetterModal
        isOpen={showLetterModal}
        onClose={() => setShowLetterModal(false)}
        onNameSubmit={handleLetterNameSubmit}
      />

          {/* Truth Metal Choice Modal */}
          <TruthMetalChoiceModal
            isOpen={showTruthMetalModal}
            onClose={() => setShowTruthMetalModal(false)}
            onChoiceSubmit={handleTruthMetalChoice}
            existingOrdinaryWorld={studentData?.ordinaryWorld}
          />

          {/* Truth Metal Touch Modal */}
          <TruthMetalTouchModal
            isOpen={showTruthMetalTouchModal}
            onClose={() => {
              setShowTruthMetalTouchModal(false);
              setIsReplayMode(false);
            }}
            onTouchTruthMetal={handleTouchTruthMetal}
          />

          {/* Truth Battle */}
          <TruthBattle
            isOpen={showTruthBattle}
            onVictory={handleTruthVictory}
            onDefeat={handleTruthDefeat}
            onClose={() => {
              setShowTruthBattle(false);
              setIsReplayMode(false);
            }}
          />

          {/* Truth Revelation Modal */}
          <TruthRevelationModal
            isOpen={showTruthRevelation}
            onClose={() => setShowTruthRevelation(false)}
            truthRevealed={truthRevealed}
            onComplete={handleTruthRevelationComplete}
          />

          {/* MST Interface Tutorial Modal */}
          <MSTInterfaceTutorial
            isOpen={showMSTTutorial}
            onComplete={handleMSTTutorialComplete}
            onClose={() => setShowMSTTutorial(false)}
          />

          {/* Hela Battle Modal */}
          <HelaBattle
            isOpen={showHelaBattle}
            onClose={() => setShowHelaBattle(false)}
            onVictory={handleHelaBattleVictory}
            onDefeat={handleHelaBattleDefeat}
            onEscape={handleHelaBattleEscape}
            isIceGolemBattle={completingChallenge === 'ep1-update-profile'}
          />

          {/* Icy Death Cutscene */}
          <IcyDeathCutscene
            isOpen={showIcyDeathCutscene}
            onComplete={handleIcyDeathCutsceneComplete}
          />

          {/* Zeke Ends Battle Cutscene */}
          <ZekeEndsBattleCutscene
            isOpen={showZekeEndsBattleCutscene}
            onComplete={handleZekeEndsBattleCutsceneComplete}
          />

          {/* Portal Intro Modal */}
          <PortalIntroModal
            isOpen={showPortalIntroModal}
            onClose={() => setShowPortalIntroModal(false)}
            onComplete={handlePortalIntroComplete}
          />

          {/* Timu Island Story Modal */}
          <TimuIslandStoryModal
            isOpen={showTimuIslandStoryModal}
            onClose={() => setShowTimuIslandStoryModal(false)}
            onComplete={handleTimuIslandStoryComplete}
          />

          {/* Squad Up Story Modal */}
          <SquadUpStoryModal
            isOpen={showSquadUpStoryModal}
            onClose={() => setShowSquadUpStoryModal(false)}
            onComplete={handleSquadUpStoryComplete}
          />

          {/* Sonido Transmission Modal */}
          <SonidoTransmissionModal
            isOpen={showSonidoTransmissionModal}
            onClose={() => setShowSonidoTransmissionModal(false)}
            onComplete={handleSonidoTransmissionComplete}
          />

          {/* Challenge Reward Modal */}
          {rewardModalData && (
            <ChallengeRewardModal
              isOpen={showRewardModal}
              onClose={async () => {
                setShowRewardModal(false);
                setRewardModalData(null);
                
                // Refresh user progress after modal closes to ensure next challenge unlocks
                if (currentUser) {
                  const userRef = doc(db, 'users', currentUser.uid);
                  const refreshedUserDoc = await getDoc(userRef);
                  if (refreshedUserDoc.exists()) {
                    setUserProgress(refreshedUserDoc.data());
                  }
                }
              }}
              challengeTitle={rewardModalData.challengeTitle}
              rewards={rewardModalData.rewards}
              xpReward={rewardModalData.xpReward}
              ppReward={rewardModalData.ppReward}
            />
          )}
        </div>
      );
};

export default ChapterDetail; 