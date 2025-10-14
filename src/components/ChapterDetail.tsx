import React, { useState, useEffect } from 'react';
import { doc, updateDoc, getDoc, collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
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
import { detectManifest, logManifestDetection } from '../utils/manifestDetection';

interface ChapterDetailProps {
  chapter: Chapter;
  onBack: () => void;
}

const ChapterDetail: React.FC<ChapterDetailProps> = ({ chapter, onBack }) => {
  const { currentUser } = useAuth();
  const { vault, moves, actionCards } = useBattle();
  const { storyProgress, getEpisodeStatus, isEpisodeUnlocked, startEpisode, isLoading: storyLoading, error: storyError } = useStory();
  const navigate = useNavigate();
  const [userProgress, setUserProgress] = useState<any>(null);
  const [studentData, setStudentData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [completingChallenge, setCompletingChallenge] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'challenges' | 'team' | 'ethics' | 'story'>('challenges');
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

  useEffect(() => {
    if (!currentUser) return;

    const fetchUserData = async () => {
      try {
        // Fetch user progress from 'users' collection
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) {
          const userData = userDoc.data();
          console.log('ChapterDetail: User data loaded:', userData);
          setUserProgress(userData);
        }

        // Fetch student data from 'students' collection (for manifest, etc.)
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          console.log('ChapterDetail: Student data loaded:', studentData);
          setStudentData(studentData);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [currentUser]);

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
    
    const chapterProgress = userProgress.chapters?.[chapter.id];
    if (!chapterProgress) return 'locked';
    
    const challengeProgress = chapterProgress.challenges?.[challenge.id];
    
    // Check if challenge is pending approval first
    if (pendingSubmissions[challenge.id]) return 'pending';
    
    // Check if challenge is completed (only after admin approval)
    if (challengeProgress?.status === 'approved' || challengeProgress?.isCompleted) return 'completed';
    
    // If no requirements, challenge is available
    if (!challenge.requirements || challenge.requirements.length === 0) {
      console.log(`ChapterDetail: Challenge ${challenge.id} has no requirements - available`);
      return chapterProgress.isActive ? 'available' : 'locked';
    }
    
    // Check if challenge requirements are met
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
          } else if (req.value === 'power_card_discovered') {
            const powerCardChallenge = userProgress?.chapters?.[1]?.challenges?.['ep1-power-card-intro'];
            return powerCardChallenge?.isCompleted;
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
          // Auto-complete if profile is complete
          shouldAutoComplete = !!(studentData?.displayName && studentData?.photoURL);
          console.log('ChapterDetail: Profile update challenge auto-complete check:', { shouldAutoComplete, hasDisplayName: !!studentData?.displayName, hasPhotoURL: !!studentData?.photoURL });
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
        console.log(`Auto-completing challenge: ${challenge.id}`);
        
        // Update both collections
        const userRef = doc(db, 'users', currentUser.uid);
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

        await updateDoc(userRef, {
          chapters: updatedChapters
        });

        // Apply rewards
        const xpReward = challenge.rewards.find(r => r.type === 'xp')?.value || 0;
        const ppReward = challenge.rewards.find(r => r.type === 'pp')?.value || 0;

        // Update student data (legacy system)
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
          
          await updateDoc(studentRef, {
            challenges: updatedChallenges,
            xp: (studentData.xp || 0) + xpReward,
            powerPoints: (studentData.powerPoints || 0) + ppReward
          });
        }

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
      console.log('CPU Battle completed:', { victory, xpGained, ppGained });
      
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
                'ep1-manifest-test': {
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
            challengeId: 'ep1-manifest-test',
            challengeName: 'Test Awakened Abilities',
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
            message: `🎉 Challenge "Test Awakened Abilities" completed! You defeated the CPU challenger and earned +${xpGained} XP and +${ppGained} PP!`,
            challengeId: 'ep1-manifest-test',
            challengeName: 'Test Awakened Abilities',
            xpReward: xpGained,
            ppReward: ppGained,
            timestamp: serverTimestamp(),
            read: false
          });
        }
        
        if (isReplayMode) {
          alert(`🎉 Battle completed! You defeated the CPU challenger again! This was a replay - no rewards earned.`);
        } else {
          alert(`🎉 Challenge "Test Awakened Abilities" completed! You defeated the CPU challenger and earned +${xpGained} XP and +${ppGained} PP!`);
        }
      } else {
        alert('💪 The CPU challenger proved too strong this time. Try again to test your awakened abilities!');
      }
      
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
      // Create notification for challenge completion
      await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
        type: 'challenge_completed',
        message: `🎉 Tutorial completed! You now understand how to navigate Xiotein School. You earned +20 XP and +10 PP!`,
        challengeId: 'ep1-portal-sequence',
        challengeName: 'Navigate the Portal',
        xpReward: 20,
        ppReward: 10,
        timestamp: serverTimestamp(),
        read: false
      });
      
      // Close the tutorial modal
      setShowPortalTutorial(false);
      
      alert('🎉 Tutorial completed! You now understand how to navigate Xiotein School. You earned +20 XP and +10 PP!');
      
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
      
      // Close the tutorial modal
      setShowMSTTutorial(false);
      
      alert('🎉 MST Interface Tutorial completed! You now understand the four main areas of Xiotein School. You earned +25 XP and +10 PP!');
      
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
      
      // Close the modal
      setShowTruthMetalModal(false);
      
      // Refresh user progress
      const userDocRefresh = await getDoc(userRef);
      if (userDocRefresh.exists()) {
        const userDataRefresh = userDocRefresh.data();
        setUserProgress(userDataRefresh);
      }

      console.log('Truth Metal Choice completed:', { choice, ordinaryWorld });
      alert(`🎉 Truth Metal Choice completed! You chose to ${choice === 'touch' ? 'embrace change and unlock your potential' : 'return to your ordinary world'}. Your ordinary world description has been saved to your profile!`);
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
        
        // Refresh user progress
        const userDocRefresh = await getDoc(userRef);
        if (userDocRefresh.exists()) {
          const userDataRefresh = userDocRefresh.data();
          setUserProgress(userDataRefresh);
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
      
      // Close the letter modal
      setShowLetterModal(false);
      
      // Refresh user progress
      const userDocRefresh = await getDoc(userRef);
      if (userDocRefresh.exists()) {
        const userDataRefresh = userDocRefresh.data();
        setUserProgress(userDataRefresh);
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
        const updatedChapters = {
          ...currentData.data().chapters,
          [chapter.id]: {
            ...currentData.data().chapters?.[chapter.id],
            challenges: {
              ...currentData.data().chapters?.[chapter.id]?.challenges,
              ['ep1-portal-sequence']: {
                isCompleted: true,
                status: 'approved',
                completedAt: serverTimestamp(),
                helaDefeated: true
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

        console.log('Portal sequence challenge completed - Hela defeated!');
        alert('🎉 Victory! You\'ve defeated Hela and can now continue to Xiotein School!');
      }
    } catch (error) {
      console.error('Error completing portal sequence challenge:', error);
      alert('Failed to complete the portal sequence challenge. Please try again.');
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
    if (isReplayMode) {
      alert('🏃 You chose to run away from Hela in this replay!');
      setIsReplayMode(false);
    } else {
      alert('🏃 You chose to run away from Hela. The portal remains closed, but you live to fight another day...');
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

    // Special handling for profile update challenge
    if (challenge.id === 'ch1-update-profile') {
      const hasDisplayName = studentData?.displayName;
      const hasPhotoURL = studentData?.photoURL;
      
      if (!hasDisplayName || !hasPhotoURL) {
        alert('Please complete your profile first by adding a display name and uploading an avatar image.');
        return;
      }
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


  const renderChallenges = () => (
    <div className="space-y-6">
      <h3 style={{ 
        fontSize: '1.5rem', 
        fontWeight: 'bold', 
        color: '#374151',
        marginBottom: '1.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
      }}>
        <span style={{ fontSize: '1.75rem' }}>⚔️</span>
        Chapter Challenges
      </h3>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
        {chapter.challenges.map((challenge, index) => {
          const status = getChallengeStatus(challenge);
          const challengeNumber = index + 1;
          
          const getStatusColor = () => {
            switch (status) {
              case 'completed': return { bg: '#dcfce7', border: '#22c55e', text: '#166534' };
              case 'pending': return { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' };
              case 'available': return { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' };
              default: return { bg: '#f3f4f6', border: '#d1d5db', text: '#6b7280' };
            }
          };
          
          const colors = getStatusColor();
          
          return (
            <div
              key={challenge.id}
              style={{
                background: colors.bg,
                border: `2px solid ${colors.border}`,
                borderRadius: '1rem',
                padding: '1.5rem',
                boxShadow: '0 4px 6px rgba(0,0,0,0.05)',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ 
                    fontSize: '1.125rem', 
                    fontWeight: 'bold', 
                    color: '#000000',
                    marginBottom: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}>
                    <span style={{
                      backgroundColor: colors.border,
                      color: 'white',
                      borderRadius: '50%',
                      width: '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.875rem',
                      fontWeight: 'bold'
                    }}>
                      {challengeNumber}
                    </span>
                    {challenge.title}
                  </h4>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    color: '#374151',
                    lineHeight: '1.5'
                  }}>
                    {challenge.description}
                  </p>
                </div>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  background: colors.border,
                  color: 'white',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap'
                }}>
                  {status === 'completed' ? '✅ Completed' : 
                   status === 'pending' ? '⏳ Pending' : 
                   status === 'available' ? '🔓 Available' : '🔒 Locked'}
                </span>
              </div>


                          {/* CPU Battle section for Test Awakened Abilities challenge */}
                          {status === 'available' && challenge.id === 'ep1-manifest-test' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
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
                                onClick={() => setShowCPUBattleModal(true)}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.background = '#b91c1c';
                                  e.currentTarget.style.transform = 'translateY(-2px)';
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.background = '#dc2626';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                }}
                              >
                                ⚔️ Battle CPU Challenger
                              </button>
                              <div style={{
                                padding: '0.75rem',
                                backgroundColor: '#fef3c7',
                                border: '1px solid #f59e0b',
                                borderRadius: '0.25rem',
                                fontSize: '0.8rem',
                                color: '#92400e',
                                maxWidth: '300px'
                              }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                                  💡 Battle Instructions
                                </div>
                                <div>
                                  Test your awakened abilities against a CPU challenger using your Power Card moves. Victory will complete this challenge!
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Special case for Get Letter challenge */}
                          {status === 'available' && challenge.id === 'ep1-get-letter' && (
                            <button
                              onClick={() => setShowLetterModal(true)}
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
                              onMouseOver={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 4px 8px rgba(139, 92, 246, 0.4)';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 2px 4px rgba(139, 92, 246, 0.3)';
                              }}
                            >
                              <span style={{ marginRight: '0.5rem' }}>📬</span>
                              View Letter
                            </button>
                          )}

                          {/* Truth Metal Choice special button */}
                          {status === 'available' && challenge.id === 'ep1-truth-metal-choice' && (
                            <button
                              onClick={() => setShowTruthMetalModal(true)}
                              style={{
                                background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                                color: 'white',
                                padding: '0.75rem 1.5rem',
                                borderRadius: '0.5rem',
                                border: 'none',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: '0 2px 4px rgba(220, 38, 38, 0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '100%'
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 4px 8px rgba(220, 38, 38, 0.4)';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 2px 4px rgba(220, 38, 38, 0.3)';
                              }}
                            >
                              <span style={{ marginRight: '0.5rem' }}>⚡</span>
                              Face the Truth Metal Choice
                            </button>
                          )}

                          {/* Touch Truth Metal Challenge Button */}
                          {status === 'available' && challenge.id === 'ep1-touch-truth-metal' && (
                            <button
                              onClick={() => setShowTruthMetalTouchModal(true)}
                              style={{
                                background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                                color: 'white',
                                padding: '0.75rem 1.5rem',
                                borderRadius: '0.5rem',
                                border: 'none',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease',
                                boxShadow: '0 2px 4px rgba(220, 38, 38, 0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '100%'
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 4px 8px rgba(220, 38, 38, 0.4)';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 2px 4px rgba(220, 38, 38, 0.3)';
                              }}
                            >
                              <span style={{ marginRight: '0.5rem' }}>⚡</span>
                              Face Your Truth
                            </button>
                          )}

                          {/* MST Interface Tutorial Challenge Button */}
                          {status === 'available' && challenge.id === 'ep1-view-mst-ui' && (
                            <button
                              onClick={() => setShowMSTTutorial(true)}
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
                              onMouseOver={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 4px 8px rgba(139, 92, 246, 0.4)';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 2px 4px rgba(139, 92, 246, 0.3)';
                              }}
                            >
                              <span style={{ marginRight: '0.5rem' }}>🎓</span>
                              Start MST Tutorial
                            </button>
                          )}

                          {/* Power Card Discovery Challenge Button */}
                          {status === 'available' && challenge.id === 'ep1-power-card-intro' && (
                            <button
                              onClick={() => navigate('/profile')}
                              style={{
                                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                                color: 'white',
                                border: '3px solid #d97706',
                                borderRadius: '0.75rem',
                                padding: '1rem',
                                fontSize: '1rem',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '100%'
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 4px 8px rgba(251, 191, 36, 0.4)';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 2px 4px rgba(251, 191, 36, 0.3)';
                              }}
                            >
                              <span style={{ marginRight: '0.5rem' }}>🎴</span>
                              Update Your Power Card
                            </button>
                          )}

                          {/* Portal Sequence Challenge Button */}
                          {status === 'available' && challenge.id === 'ep1-portal-sequence' && (
                            <button
                              onClick={() => setShowHelaBattle(true)}
                              style={{
                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                color: 'white',
                                border: '3px solid #5a67d8',
                                borderRadius: '0.75rem',
                                padding: '1rem',
                                fontSize: '1rem',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '100%'
                              }}
                              onMouseOver={(e) => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 4px 8px rgba(102, 126, 234, 0.4)';
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = '0 2px 4px rgba(102, 126, 234, 0.3)';
                              }}
                            >
                              <span style={{ marginRight: '0.5rem' }}>🚇</span>
                              Journey to Xiotein
                            </button>
                          )}

                          {/* Regular submit button for other challenges */}
                          {status === 'available' && challenge.id !== 'ep1-portal-sequence' && challenge.id !== 'ep1-manifest-test' && challenge.id !== 'ep1-get-letter' && challenge.id !== 'ep1-truth-metal-choice' && challenge.id !== 'ep1-touch-truth-metal' && challenge.id !== 'ep1-view-mst-ui' && challenge.id !== 'ep1-power-card-intro' && !(challenge.type === 'team' && challenge.requirements.length === 0) && (
              <button
                onClick={() => handleChallengeComplete(challenge)}
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
                  opacity: completingChallenge === challenge.id ? 0.7 : 1
                }}
                onMouseOver={(e) => {
                  if (completingChallenge !== challenge.id) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 8px rgba(59, 130, 246, 0.4)';
                  }
                }}
                onMouseOut={(e) => {
                  if (completingChallenge !== challenge.id) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(59, 130, 246, 0.3)';
                  }
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

              {status === 'completed' && (
                <div>
                  <div style={{
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid #22c55e',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    color: '#166534',
                    fontSize: '0.875rem',
                    fontWeight: 'bold',
                    marginBottom: '0.5rem'
                  }}>
                    ✅ Completed on {userProgress?.chapters?.[chapter.id]?.challenges?.[challenge.id]?.completedAt?.toDate?.()?.toLocaleDateString() || 'Unknown date'}
                  </div>
                  
                  {/* Replay Button for Battle Challenges */}
                  {(challenge.id === 'ep1-touch-truth-metal' || challenge.id === 'ep1-manifest-test' || challenge.id === 'ep1-portal-sequence' || challenge.id === 'ep1-combat-drill') && (
                    <button
                      onClick={() => {
                        setIsReplayMode(true);
                        if (challenge.id === 'ep1-touch-truth-metal') {
                          setShowTruthMetalTouchModal(true);
                        } else if (challenge.id === 'ep1-manifest-test') {
                          setShowCPUBattleModal(true);
                        } else if (challenge.id === 'ep1-portal-sequence') {
                          setShowHelaBattle(true);
                        } else if (challenge.id === 'ep1-combat-drill') {
                          setShowCPUBattleModal(true);
                        }
                      }}
                      style={{
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.5rem',
                        border: 'none',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 2px 4px rgba(139, 92, 246, 0.3)',
                        fontSize: '0.875rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        width: '100%'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 8px rgba(139, 92, 246, 0.4)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(139, 92, 246, 0.3)';
                      }}
                    >
                      <span>🔄</span>
                      Replay Battle
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

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
    const vaultStrength = vault.shieldStrength + vault.firewall;
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
            ...(chapter.teamSize > 1 ? [{ id: 'team', label: 'Team', icon: '👥' }] : []),
            ...(chapter.id === 8 ? [{ id: 'ethics', label: 'Ethics', icon: '⚖️' }] : []),
            { id: 'story', label: 'Story Episodes', icon: '📖' }
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
        {activeTab === 'team' && renderTeamSection()}
        {activeTab === 'ethics' && renderEthicsSection()}
        {activeTab === 'story' && renderStoryEpisodes()}
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
          />
        </div>
      );
    };

export default ChapterDetail; 