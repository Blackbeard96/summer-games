import React, { useState, useEffect } from 'react';
import { doc, updateDoc, getDoc, collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Chapter, ChapterChallenge } from '../types/chapters';
import RivalSelectionModal from './RivalSelectionModal';
import CPUChallenger from './CPUChallenger';
import PortalTutorial from './PortalTutorial';
import LetterModal from './LetterModal';

interface ChapterDetailProps {
  chapter: Chapter;
  onBack: () => void;
}

const ChapterDetail: React.FC<ChapterDetailProps> = ({ chapter, onBack }) => {
  const { currentUser } = useAuth();
  const [userProgress, setUserProgress] = useState<any>(null);
  const [studentData, setStudentData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [completingChallenge, setCompletingChallenge] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'challenges' | 'team' | 'rival' | 'veil' | 'ethics'>('overview');
  const [showRivalSelectionModal, setShowRivalSelectionModal] = useState(false);
  const [showCPUBattleModal, setShowCPUBattleModal] = useState(false);
  const [showPortalTutorial, setShowPortalTutorial] = useState(false);
  const [showLetterModal, setShowLetterModal] = useState(false);

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
        // Check multiple possible manifest data locations
        const hasManifest = studentData?.manifest?.manifestId || 
                          studentData?.manifestationType || 
                          studentData?.manifest ||
                          userProgress?.manifest ||
                          userProgress?.manifestationType;
        console.log('ChapterDetail: Manifest check result:', hasManifest, {
          studentDataManifest: studentData?.manifest,
          studentDataManifestationType: studentData?.manifestationType,
          userProgressManifest: userProgress?.manifest,
          userProgressManifestationType: userProgress?.manifestationType
        });
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
    
    // Check if challenge requirements are met
    const requirementsMet = challenge.requirements.every(req => {
      switch (req.type) {
        case 'artifact':
          return userProgress.artifact?.identified;
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
          // Check if player has chosen a manifest (from multiple possible locations)
          return studentData?.manifest?.manifestId || 
                 studentData?.manifestationType || 
                 studentData?.manifest ||
                 userProgress?.manifest ||
                 userProgress?.manifestationType;
        case 'leadership':
          return userProgress.leadership?.role;
        case 'profile':
          return studentData?.displayName && studentData?.photoURL;
        default:
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
        case 'ch1-update-profile':
          // Auto-complete if profile is complete
          shouldAutoComplete = !!(studentData?.displayName && studentData?.photoURL);
          console.log('ChapterDetail: Profile update challenge auto-complete check:', { shouldAutoComplete, hasDisplayName: !!studentData?.displayName, hasPhotoURL: !!studentData?.photoURL });
          break;
        case 'ch1-declare-manifest':
          // Auto-complete if manifest is chosen
          shouldAutoComplete = !!(studentData?.manifest?.manifestId || studentData?.manifestationType);
          console.log('ChapterDetail: Manifest declaration challenge auto-complete check:', { shouldAutoComplete, hasManifest: !!(studentData?.manifest?.manifestId || studentData?.manifestationType) });
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
                completionDate: new Date()
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
              completionDate: new Date()
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
      checkAndAutoCompleteChallenges();
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
        // Update user progress to mark the challenge as completed
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
        
        alert(`🎉 Challenge "Test Awakened Abilities" completed! You defeated the CPU challenger and earned +${xpGained} XP and +${ppGained} PP!`);
      } else {
        alert('💪 The CPU challenger proved too strong this time. Try again to test your awakened abilities!');
      }
      
      // Close the battle modal
      setShowCPUBattleModal(false);
      
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

  const handleLetterNameSubmit = async (name: string) => {
    if (!currentUser) return;

    try {
      // Update user's display name
      await updateDoc(doc(db, 'users', currentUser.uid), {
        displayName: name,
        lastUpdated: serverTimestamp()
      });

      // Complete the Get Letter challenge
      const userRef = doc(db, 'users', currentUser.uid);
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
      alert(`🎉 Welcome to Xiotein, ${name}! Your journey as a Manifester begins now!`);
    } catch (error) {
      console.error('Error completing letter challenge:', error);
      alert('Failed to complete the letter challenge. Please try again.');
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

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Chapter Info Card */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '2rem',
        borderRadius: '1rem',
        color: 'white',
        boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
      }}>
        <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          {chapter.title}
        </h3>
        <p style={{ fontSize: '1.125rem', fontStyle: 'italic', marginBottom: '1rem', opacity: 0.9 }}>
          {chapter.subtitle}
        </p>
        <p style={{ lineHeight: '1.6', marginBottom: '1.5rem' }}>
          {chapter.description}
        </p>
        
        {/* Chapter Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div style={{ 
            background: 'rgba(255,255,255,0.1)', 
            padding: '1rem', 
            borderRadius: '0.5rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.25rem' }}>Story Arc</div>
            <div style={{ fontWeight: 'bold' }}>{chapter.storyArc}</div>
          </div>
          <div style={{ 
            background: 'rgba(255,255,255,0.1)', 
            padding: '1rem', 
            borderRadius: '0.5rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '0.25rem' }}>Team Size</div>
            <div style={{ fontWeight: 'bold' }}>{chapter.teamSize} player{chapter.teamSize > 1 ? 's' : ''}</div>
          </div>
        </div>
      </div>

      {/* Requirements & Rewards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {/* Requirements Card */}
        <div style={{
          background: 'white',
          border: '2px solid #e5e7eb',
          borderRadius: '1rem',
          padding: '1.5rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
        }}>
          <h4 style={{ 
            fontSize: '1.25rem', 
            fontWeight: 'bold', 
            color: '#374151',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: '1.5rem' }}>🔑</span>
            Requirements
          </h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {chapter.requirements.map((req, index) => {
              const isMet = getRequirementStatus(req);
              return (
                <li key={index} style={{
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  background: isMet ? '#f0fdf4' : '#f9fafb',
                  borderRadius: '0.5rem',
                  borderLeft: `4px solid ${isMet ? '#22c55e' : '#3b82f6'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}>
                  <span style={{ 
                    color: isMet ? '#22c55e' : '#3b82f6', 
                    fontWeight: 'bold',
                    fontSize: '1.125rem'
                  }}>
                    {isMet ? '✅' : '⏳'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      color: '#374151',
                      fontWeight: isMet ? 'bold' : 'normal'
                    }}>
                      {req.description}
                    </div>
                    {!isMet && (
                      <div style={{ 
                        fontSize: '0.75rem',
                        color: '#6b7280',
                        marginTop: '0.25rem'
                      }}>
                        Requirement not met
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Rewards Card */}
        <div style={{
          background: 'white',
          border: '2px solid #10b981',
          borderRadius: '1rem',
          padding: '1.5rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
        }}>
          <h4 style={{ 
            fontSize: '1.25rem', 
            fontWeight: 'bold', 
            color: '#374151',
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: '1.5rem' }}>🏆</span>
            Rewards
          </h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {chapter.rewards.map((reward, index) => (
              <li key={index} style={{
                padding: '0.75rem',
                marginBottom: '0.5rem',
                background: '#f0fdf4',
                borderRadius: '0.5rem',
                borderLeft: '4px solid #10b981',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span style={{ color: '#10b981', fontWeight: 'bold' }}>⭐</span>
                {reward.description}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );

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
        {chapter.challenges.map((challenge) => {
          const status = getChallengeStatus(challenge);
          
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
                    color: '#374151',
                    marginBottom: '0.5rem'
                  }}>
                    {challenge.title}
                  </h4>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    color: '#6b7280',
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

                          {/* Tutorial section for Navigate the Portal challenge */}
                          {status === 'available' && challenge.id === 'ep1-portal-sequence' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                style={{ 
                                  padding: '0.75rem 1.5rem', 
                                  background: '#3b82f6', 
                                  color: 'white', 
                                  border: 'none', 
                                  borderRadius: '0.5rem', 
                                  cursor: 'pointer',
                                  fontWeight: 'bold',
                                  fontSize: '0.875rem',
                                  transition: 'all 0.2s ease'
                                }}
                                onClick={() => setShowPortalTutorial(true)}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.background = '#2563eb';
                                  e.currentTarget.style.transform = 'translateY(-2px)';
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.background = '#3b82f6';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                }}
                              >
                                🎓 Start Tutorial
                              </button>
                              <div style={{
                                padding: '0.75rem',
                                backgroundColor: '#dbeafe',
                                border: '1px solid #3b82f6',
                                borderRadius: '0.25rem',
                                fontSize: '0.8rem',
                                color: '#1e40af',
                                maxWidth: '300px'
                              }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                                  💡 Tutorial Instructions
                                </div>
                                <div>
                                  Take a guided tour of Xiotein School to learn about all the features and areas. Completing the tutorial will finish this challenge!
                                </div>
                              </div>
                            </div>
                          )}

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

                          {/* Regular submit button for other challenges */}
                          {status === 'available' && challenge.id !== 'ep1-portal-sequence' && challenge.id !== 'ep1-manifest-test' && challenge.id !== 'ep1-get-letter' && !(challenge.type === 'team' && challenge.requirements.length === 0) && (
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
          );
        })}
      </div>
    </div>
  );

  const renderTeamSection = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4">Team Formation</h3>
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
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Rival Selection</h3>
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
      <h3 className="text-lg font-semibold text-gray-800 mb-4">The Veil</h3>
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
      <h3 className="text-lg font-semibold text-gray-800 mb-4">The Ethics of Life</h3>
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
            { id: 'overview', label: 'Overview', icon: '📋' },
            { id: 'challenges', label: 'Challenges', icon: '⚔️' },
            ...(chapter.teamSize > 1 ? [{ id: 'team', label: 'Team', icon: '👥' }] : []),
            { id: 'rival', label: 'Rival', icon: '⚡' },
            { id: 'veil', label: 'Veil', icon: '🕯️' },
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
        {activeTab === 'overview' && renderOverview()}
        {activeTab === 'challenges' && renderChallenges()}
        {activeTab === 'team' && renderTeamSection()}
        {activeTab === 'rival' && renderRivalSection()}
        {activeTab === 'veil' && renderVeilSection()}
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
    </div>
  );
};

export default ChapterDetail; 