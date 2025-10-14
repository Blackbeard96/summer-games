 import ModelPreview from './ModelPreview';
import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp, getDocs, query, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';
import ManifestSelection from './ManifestSelection';
import { PlayerManifest, MANIFESTS } from '../types/manifest';
import { CHAPTERS } from '../types/chapters';
import RivalSelectionModal from './RivalSelectionModal';

interface Badge {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  criteria?: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  category: 'challenge' | 'achievement' | 'special' | 'admin';
}

// Badge awarding utility function
const awardBadgeForChallenge = async (userId: string, challengeName: string) => {
  try {
    // Get all badges from the badges collection
    const badgesSnapshot = await getDocs(collection(db, 'badges'));
    const badges = badgesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Badge[];

    // Find badges that match the challenge criteria
    const matchingBadges = badges.filter(badge => {
      if (badge.category === 'challenge' && badge.criteria) {
        return badge.criteria.toLowerCase().includes(challengeName.toLowerCase()) ||
               challengeName.toLowerCase().includes(badge.criteria.toLowerCase());
      }
      return false;
    });

    if (matchingBadges.length > 0) {
      // Get current student data
      const studentRef = doc(db, 'students', userId);
      const studentSnap = await getDoc(studentRef);
      
      if (studentSnap.exists()) {
        const studentData = studentSnap.data();
        const currentBadges = studentData.badges || [];
        
        // Award each matching badge if not already earned
        for (const badge of matchingBadges) {
          const alreadyEarned = currentBadges.some((b: any) => b.id === badge.id);
          if (!alreadyEarned) {
            const newBadgeEntry = {
              id: badge.id,
              name: badge.name,
              imageUrl: badge.imageUrl,
              description: badge.description,
              earnedAt: new Date()
            };
            
            await updateDoc(studentRef, {
              badges: [...currentBadges, newBadgeEntry]
            });
            
            // Badge awarded successfully
          }
        }
      }
    }
  } catch (error) {
    console.error('Error awarding badge:', error);
  }
};

interface ChallengeData {
  completed?: boolean;
  file?: string;
}



interface ElementalType {
  name: string;
  description: string;
  color: string;
  icon: string;
  character: string;
}

interface GoogleClassroomAssignment {
  id: string;
  title: string;
  description?: string;
  dueDate?: {
    year: number;
    month: number;
    day: number;
  };
  courseId: string;
  courseName?: string;
}

const ChallengeTracker = () => {
  const { currentUser } = useAuth();
  
  // Helper function to update the new chapter system after legacy challenge submission
  const updateChapterSystem = async (challengeName: string, submitted: boolean, completed: boolean = false) => {
    if (!currentUser) return;
    
    const currentChapter = getCurrentChapter();
    if (!currentChapter) return;
    
    const userRef = doc(db, 'users', currentUser.uid);
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const updatedChapters = {
        ...userData.chapters,
        [currentChapter.id]: {
          ...userData.chapters?.[currentChapter.id],
          challenges: {
            ...userData.chapters?.[currentChapter.id]?.challenges,
            [challengeName]: {
              submitted: submitted,
              status: submitted && !completed ? 'pending' : completed ? 'completed' : 'not_started',
              isCompleted: completed
            }
          }
        }
      };
      
      await updateDoc(userRef, {
        chapters: updatedChapters
      });
    }
  };
  
  // One-time sync function to fix existing submissions
  const syncExistingSubmissions = async () => {
    if (!currentUser || !userProgress) {
      return;
    }
    
    // Check if ch1-artifact-challenge is submitted in legacy but not in new system
    const legacyChallenge = userProgress.challenges?.['ch1-artifact-challenge'];
    const newChallenge = userProgress.chapters?.[1]?.challenges?.['ch1-artifact-challenge'];
    
    console.log('Legacy ch1-artifact-challenge:', legacyChallenge);
    console.log('New ch1-artifact-challenge:', newChallenge);
    
    if (legacyChallenge?.submitted && !newChallenge?.submitted) {
      console.log('Syncing ch1-artifact-challenge to new chapter system...');
      await updateChapterSystem('ch1-artifact-challenge', true, legacyChallenge.completed || false);
    } else {
      console.log('No sync needed or already synced');
    }
  };

  // Function to check and auto-complete challenges
  const checkAndAutoCompleteChallenges = async () => {
    // Auto-complete challenges based on user progress
    
    if (!currentUser || !userProgress) {
      // Missing required data
      return;
    }

    const currentChapter = getCurrentChapter();
    if (!currentChapter) {
      // No current chapter
      return;
    }

    const chapterProgress = userProgress.chapters?.[currentChapter.id];
    console.log('ChallengeTracker: Chapter progress:', chapterProgress);
    
    if (!chapterProgress?.isActive) {
      console.log('ChallengeTracker: Chapter not active, returning');
      return;
    }

    // Check if user is in a squad
    let isInSquad = false;
    try {
      console.log('ChallengeTracker: Checking squad membership for user:', currentUser.uid);
      const squadsSnapshot = await getDocs(collection(db, 'squads'));
      console.log('ChallengeTracker: Found squads:', squadsSnapshot.docs.length);
      
      isInSquad = squadsSnapshot.docs.some(doc => {
        const squadData = doc.data();
        console.log('ChallengeTracker: Squad data:', { id: doc.id, name: squadData.name, members: squadData.members?.length || 0 });
        const isMember = squadData.members && squadData.members.some((member: any) => member.uid === currentUser.uid);
        if (isMember) {
          console.log('ChallengeTracker: User is member of squad:', squadData.name);
        }
        return isMember;
      });
      console.log('ChallengeTracker: User squad membership check result:', { isInSquad, userId: currentUser.uid });
    } catch (error) {
      console.error('Error checking squad membership:', error);
    }

    for (const challenge of currentChapter.challenges) {
      console.log('ChallengeTracker: Checking challenge:', challenge.id, challenge.title);
      const challengeProgress = chapterProgress.challenges?.[challenge.id];
      console.log('ChallengeTracker: Challenge progress:', challengeProgress);
      
      // Skip if already completed or pending
      if (challengeProgress?.isCompleted || challengeProgress?.status === 'approved') {
        console.log('ChallengeTracker: Skipping challenge (already completed):', challenge.id);
        continue;
      }

      // Check if challenge should be auto-completed
      let shouldAutoComplete = false;
      
      switch (challenge.id) {
        case 'ch2-team-formation':
          // Auto-complete if user is in a squad
          shouldAutoComplete = isInSquad;
          console.log('ChallengeTracker: Team formation challenge auto-complete check:', { shouldAutoComplete, isInSquad });
          break;
        case 'ch2-rival-selection':
          // Auto-complete if user has chosen a rival (check both legacy and new chapter system)
          const rival = userProgress.rival || userProgress.chapters?.[currentChapter.id]?.rival;
          shouldAutoComplete = !!rival;
          console.log('ChallengeTracker: Rival selection challenge auto-complete check:', { shouldAutoComplete, hasRival: !!rival });
          break;
        case 'ep1-update-profile':
          // Auto-complete if profile is complete
          shouldAutoComplete = !!(userProgress.displayName && userProgress.photoURL);
          console.log('ChallengeTracker: Profile update challenge auto-complete check:', { shouldAutoComplete, hasDisplayName: !!userProgress.displayName, hasPhotoURL: !!userProgress.photoURL });
          break;
        case 'ep1-power-card-intro':
          // Auto-complete if Power Card has been customized (description, background, or image)
          const hasPowerCardCustomization = !!(userProgress?.powerCardDescription || 
                                               userProgress?.powerCardBackground || 
                                               userProgress?.powerCardImage ||
                                               userProgress?.photoURL); // Profile picture counts as Power Card image
          shouldAutoComplete = hasPowerCardCustomization;
          console.log('ChallengeTracker: Power Card discovery challenge auto-complete check:', { 
            shouldAutoComplete, 
            hasPowerCardDescription: !!userProgress?.powerCardDescription,
            hasPowerCardBackground: !!userProgress?.powerCardBackground,
            hasPowerCardImage: !!userProgress?.powerCardImage,
            hasProfilePicture: !!userProgress?.photoURL
          });
          break;
        default:
          // For other challenges, check if they have no requirements and are team-type
          shouldAutoComplete = challenge.type === 'team' && challenge.requirements.length === 0;
          console.log('ChallengeTracker: Default challenge auto-complete check:', { shouldAutoComplete, challengeType: challenge.type, requirementsLength: challenge.requirements.length });
      }

      if (shouldAutoComplete) {
        console.log(`ChallengeTracker: Auto-completing challenge: ${challenge.id}`);
        
        const userRef = doc(db, 'users', currentUser.uid);
        const studentRef = doc(db, 'students', currentUser.uid);
        
        const updatedChapters = {
          ...userProgress.chapters,
          [currentChapter.id]: {
            ...userProgress.chapters[currentChapter.id],
            challenges: {
              ...userProgress.chapters[currentChapter.id]?.challenges,
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
  


  const [challenges, setChallenges] = useState<{[key: string]: ChallengeData}>({});
  const [xp, setXP] = useState(0);
  const [level, setLevel] = useState(1);
  const [unlocks, setUnlocks] = useState<string[]>([]);
  const [powerPoints, setPowerPoints] = useState(0);
  const [manifestationType, setManifestationType] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<{ [challenge: string]: File | null }>({});
  const [showElementSelection, setShowElementSelection] = useState(false);
  const [showManifestSelection, setShowManifestSelection] = useState(false);
  const [showRivalSelectionModal, setShowRivalSelectionModal] = useState(false);
  const [chapterClassroomAssignments, setChapterClassroomAssignments] = useState<{ [challengeId: string]: GoogleClassroomAssignment }>({});
  const [playerManifest, setPlayerManifest] = useState<PlayerManifest | null>(null);
  const [userProgress, setUserProgress] = useState<any>(null);
  
  // Run sync when userProgress loads
  React.useEffect(() => {
    if (userProgress) {
      syncExistingSubmissions();
    }
  }, [userProgress]);

  // Check for auto-completion when user progress changes
  React.useEffect(() => {
    if (userProgress) {
      console.log('ChallengeTracker: Triggering auto-completion check...', {
        userProgress: !!userProgress
      });
      checkAndAutoCompleteChallenges();
    }
  }, [userProgress]);

  // Also check for auto-completion on component mount
  React.useEffect(() => {
    if (userProgress) {
      console.log('ChallengeTracker: Initial auto-completion check on mount...');
      checkAndAutoCompleteChallenges();
    }
  }, []);

  // Elemental manifestation types for new students
  const elementalTypes: ElementalType[] = [
    {
      name: 'Fire',
      description: 'Passionate and intense. You manifest through heat, light, and transformation.',
      color: '#dc2626',
      icon: '🔥',
      character: 'Allen'
    },
    {
      name: 'Water',
      description: 'Adaptive and flowing. You manifest through fluidity, reflection, and change.',
      color: '#2563eb',
      icon: '💧',
      character: 'Alejandra'
    },
    {
      name: 'Earth',
      description: 'Stable and grounded. You manifest through solidity, growth, and foundation.',
      color: '#16a34a',
      icon: '🌍',
      character: 'Greg'
    },
    {
      name: 'Air',
      description: 'Free and boundless. You manifest through movement, clarity, and freedom.',
      color: '#7c3aed',
      icon: '💨',
      character: 'Sage'
    }
  ];



  useEffect(() => {
    const fetchChallenges = async () => {
      if (!currentUser) return;
      
      const userRef = doc(db, 'students', currentUser.uid);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setChallenges(data.challenges || {});
        const xpVal = data.xp || 0;
        const ppVal = data.powerPoints || 0;
        setXP(xpVal);
        setPowerPoints(ppVal);
        const lvl = Math.floor(xpVal / 50) + 1;
        setLevel(lvl);
        setManifestationType(data.manifestationType || '');
        updateUnlocks(lvl);
        
        // Load manifest data
        const manifestData = data.manifest;
        if (manifestData) {
          // Convert Firestore timestamp to Date if needed
          const processedManifest = {
            ...manifestData,
            lastAscension: manifestData.lastAscension?.toDate ? 
              manifestData.lastAscension.toDate() : 
              new Date(manifestData.lastAscension)
          };
          setPlayerManifest(processedManifest);
        }
      } else {
        // Show element selection for new students
        setShowElementSelection(true);
      }
    };



    const fetchChapterClassroomAssignments = async () => {
      try {
        const mappingsQuery = query(collection(db, 'chapterClassroomMap'));
        const mappingsSnapshot = await getDocs(mappingsQuery);
        const assignments: { [challengeId: string]: GoogleClassroomAssignment } = {};
        
        for (const mappingDoc of mappingsSnapshot.docs) {
          const mappingData = mappingDoc.data();
          const challengeId = mappingData.challengeId;
          const assignmentId = mappingDoc.id;
          
          assignments[challengeId] = {
            id: assignmentId,
            title: mappingData.title || 'Google Classroom Assignment',
            description: mappingData.description || '',
            dueDate: mappingData.dueDate,
            courseId: mappingData.courseId,
            courseName: mappingData.courseName || ''
          };
        }
        
        setChapterClassroomAssignments(assignments);
      } catch (error) {
        console.error('Error fetching chapter classroom assignments:', error);
      }
    };

    if (currentUser) {
      fetchChallenges();
      fetchChapterClassroomAssignments();
    }
  }, [currentUser]);

  // Fetch user progress for chapters
  useEffect(() => {
    if (!currentUser) return;

    const userRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        setUserProgress(doc.data());
      }
    });

    return () => unsubscribe();
  }, [currentUser]);

  const selectElement = async (elementName: string) => {
    if (!currentUser) return;
    
    try {
      const userRef = doc(db, 'students', currentUser.uid);
      
      // Get existing user data to preserve progress
      const userSnap = await getDoc(userRef);
      const existingData = userSnap.exists() ? userSnap.data() : {};
      
      // Only update the manifestation type, preserve all other data
      await updateDoc(userRef, { 
        manifestationType: elementName,
        // Only reset XP/PP if this is a new user (no existing data)
        ...(userSnap.exists() ? {} : { xp: 0, powerPoints: 0, challenges: {} })
      });
      
      setManifestationType(elementName);
      setShowElementSelection(false);
      
      // Award Element Master badge for selecting an element
      await awardBadgeForChallenge(currentUser.uid, 'element selection');
    } catch (error) {
      console.error('Error setting manifestation type:', error);
      alert('Failed to set your elemental type. Please try again.');
    }
  };

  const updateUnlocks = (lvl: number) => {
    const unlockMap: {[key: number]: string} = {
      2: "🔓 Enhanced Sight - See through digital illusions",
      3: "🔓 Tool Mastery - Advanced 3D modeling techniques",
      4: "🔓 Flow State - Unlock creative potential",
      5: "🔓 Imposition - Bend reality to your will",
      6: "🔓 Dimensional Awareness - Navigate complex spaces",
      7: "🔓 Truth Sight - Recognize patterns in data",
      8: "🔓 Creation Mastery - Build worlds from nothing"
    };
    const newUnlocks = Object.entries(unlockMap)
      .filter(([key]) => lvl >= parseInt(key))
      .map(([, val]) => val);
    setUnlocks(newUnlocks);
  };



  const toggleChallenge = async (id: string) => {
    if (!currentUser) return;
    const challenge = challenges[id] || {};
    const alreadyCompleted = challenge.completed;
    const hasFile = !!challenge.file;
    
    if (alreadyCompleted) {
      const updated = {
        ...challenges,
        [id]: {
          ...challenge,
          completed: false
        }
      };
      
      // For now, we'll use default values since we're moving to Chapter system
      const xpLoss = 10;
      const ppLoss = 5;
      const newXP = Math.max(0, xp - xpLoss);
      const newPP = Math.max(0, powerPoints - ppLoss);
      
      setChallenges(updated);
      setXP(newXP);
      setPowerPoints(newPP);
      setLevel(Math.floor(newXP / 50) + 1);
      updateUnlocks(Math.floor(newXP / 50) + 1);
      const userRef = doc(db, 'students', currentUser.uid);
      await updateDoc(userRef, { challenges: updated, xp: newXP, powerPoints: newPP });
      return;
    }
  };

  const handleFileSelect = (challengeName: string, file: File | null) => {
    setSelectedFiles(prev => ({ ...prev, [challengeName]: file }));
  };

  const handleFileUpload = async (challengeName: string) => {
    if (!currentUser) return;
    const file = selectedFiles[challengeName];
    if (!file) {
      alert('No file selected!');
      return;
    }

    // For now, we'll use default values since we're moving to Chapter system
    const xpReward = 15;
    const ppReward = 8;

    try {
      const storageRef = ref(storage, `manifestation_submissions/${currentUser.uid}/${challengeName}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      
      const challenge = challenges[challengeName] || {};
      const updated = {
        ...challenges,
        [challengeName]: {
          ...challenge,
          file: downloadURL,
          submitted: true,
          status: 'pending',
          completed: false
        }
      };
      
      setChallenges(updated);
      // Don't award XP/PP until challenge is approved by admin
      // const newXP = challenge.completed ? xp : xp + xpReward;
      // const newPP = challenge.completed ? powerPoints : powerPoints + ppReward;
      // setXP(newXP);
      // setPowerPoints(newPP);
      // const newLevel = Math.floor(newXP / 50) + 1;
      // setLevel(newLevel);
      // updateUnlocks(newLevel);
      
      const userRef = doc(db, 'students', currentUser.uid);
      await updateDoc(userRef, { 
        challenges: updated
        // xp: newXP, 
        // powerPoints: newPP
      });

      // Only add to challengeSubmissions if not already completed
      if (!challenge.completed) {
        await addDoc(collection(db, 'challengeSubmissions'), {
          userId: currentUser.uid,
          displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
          email: currentUser.email || '',
          photoURL: currentUser.photoURL || '',
          challengeId: challengeName,
          challengeName: challengeName,
          fileUrl: downloadURL,
          timestamp: serverTimestamp(),
          status: 'pending',
          xpReward: xpReward,
          ppReward: ppReward,
          manifestationType: 'Chapter Challenge',
          character: 'Chapter System',
          submissionType: 'chapter_challenge',
          chapterId: 1 // Default to Chapter 1 for legacy challenges
        });
      }

      // Award badges for challenge completion
      if (!challenge.completed) {
        await awardBadgeForChallenge(currentUser.uid, challengeName);
      }

      setTimeout(async () => {
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setChallenges(data.challenges || {});
        }
      }, 500);
      
      setSelectedFiles(prev => ({ ...prev, [challengeName]: null }));
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload manifestation. Please try again.');
    }
  };

  const handleRemoveSubmission = async (challengeName: string) => {
    if (!currentUser) return;
    const challenge = challenges[challengeName];
    if (!challenge || !challenge.file) return;

    try {
      const storageRef = ref(storage, `manifestation_submissions/${currentUser.uid}/${challengeName}`);
      await deleteObject(storageRef);
      
      // Use default values for XP/PP loss
      const xpLoss = 10;
      const ppLoss = 5;
      
      const updated = {
        ...challenges,
        [challengeName]: {
          ...challenge,
          file: undefined,
          completed: false
        }
      };
      
      setChallenges(updated);
      const newXP = Math.max(0, xp - xpLoss);
      const newPP = Math.max(0, powerPoints - ppLoss);
      setXP(newXP);
      setPowerPoints(newPP);
      setLevel(Math.floor(newXP / 50) + 1);

      const userRef = doc(db, 'students', currentUser.uid);
      await updateDoc(userRef, { challenges: updated, xp: newXP, powerPoints: newPP });
      
      setTimeout(async () => {
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setChallenges(data.challenges || {});
        }
      }, 500);
    } catch (error) {
      console.error('Error removing submission:', error);
      alert('Failed to remove manifestation. Please try again.');
    }
  };

  const getCharacterQuote = (character: string) => {
    const quotes: {[key: string]: string} = {
      'Sage': '"The world bends to those who know its true nature."',
      'Alejandra': '"Every creation tells a story. What\'s yours?"',
      'Greg': '"Strength comes from understanding. Power comes from practice."',
      'Allen': '"Burn bright, but don\'t burn out."',
      'Khalil': '"Truth is what you make it. Make it yours."'
    };
    return quotes[character] || '"Manifest your potential."';
  };

  const handleManifestSelect = async (manifestId: string) => {
    if (!currentUser) return;

    const manifest = MANIFESTS.find(m => m.id === manifestId);
    if (!manifest) return;

    const newPlayerManifest: PlayerManifest = {
      manifestId,
      currentLevel: 1,
      xp: 0,
      catalyst: manifest.catalyst,
      veil: 'Fear of inadequacy',
      signatureMove: manifest.signatureMove,
      unlockedLevels: [1],
      lastAscension: serverTimestamp()
    };

    try {
      const userRef = doc(db, 'students', currentUser.uid);
      await updateDoc(userRef, { manifest: newPlayerManifest });
      setPlayerManifest(newPlayerManifest);
      setShowManifestSelection(false);
    } catch (error) {
      console.error('Error setting manifest:', error);
      alert('Failed to set manifest. Please try again.');
    }
  };

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

  // Chapter progress functions
  const getCurrentChapter = () => {
    if (!userProgress?.chapters) return null;
    
    return CHAPTERS.find(chapter => 
      userProgress.chapters[chapter.id]?.isActive
    );
  };

  const getChapterProgress = (chapterId: number) => {
    if (!userProgress?.chapters?.[chapterId]) return 0;
    
    const chapter = CHAPTERS.find(c => c.id === chapterId);
    if (!chapter) return 0;
    
    const chapterProgress = userProgress.chapters[chapterId];
    const completedChallenges = chapter.challenges.filter(challenge => 
      chapterProgress.challenges?.[challenge.id]?.isCompleted
    ).length;
    
    return (completedChallenges / chapter.challenges.length) * 100;
  };

  const getCompletedChapters = () => {
    if (!userProgress?.chapters) return 0;
    
    return Object.values(userProgress.chapters).filter((chapter: any) => 
      chapter.isCompleted
    ).length;
  };

  // Element Selection Modal
  if (showElementSelection) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '2rem'
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          padding: '2rem',
          borderRadius: '1rem',
          maxWidth: '800px',
          width: '100%',
          textAlign: 'center',
          color: 'white',
          border: '1px solid rgba(255,255,255,0.2)'
        }}>
          <h1 style={{ 
            fontSize: '2rem', 
            fontWeight: 'bold', 
            marginBottom: '1rem',
            background: 'linear-gradient(135deg, #fbbf24 0%, #a78bfa 50%, #34d399 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            Choose Your Element
          </h1>
          <p style={{ 
            fontSize: '1.1rem', 
            marginBottom: '2rem',
            opacity: 0.9
          }}>
            Welcome to Xiotein School. Your elemental affinity will guide your manifestation journey.
          </p>
          
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1.5rem',
            marginBottom: '2rem'
          }}>
            {elementalTypes.map((element) => (
              <div
                key={element.name}
                onClick={() => selectElement(element.name)}
                style={{
                  padding: '1.5rem',
                  background: `linear-gradient(135deg, ${element.color}20 0%, ${element.color}10 100%)`,
                  border: `2px solid ${element.color}`,
                  borderRadius: '0.75rem',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  textAlign: 'center'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-5px)';
                  e.currentTarget.style.boxShadow = `0 10px 25px ${element.color}40`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                  {element.icon}
                </div>
                <h3 style={{ 
                  fontSize: '1.5rem', 
                  fontWeight: 'bold', 
                  marginBottom: '0.5rem',
                  color: element.color
                }}>
                  {element.name}
                </h3>
                <p style={{ 
                  fontSize: '0.9rem', 
                  opacity: 0.8,
                  lineHeight: '1.5'
                }}>
                  {element.description}
                </p>
                <div style={{ 
                  marginTop: '1rem',
                  fontSize: '0.8rem',
                  opacity: 0.7
                }}>
                  Mentor: {element.character}
                </div>
              </div>
            ))}
          </div>
          
          <p style={{ 
            fontSize: '0.9rem', 
            opacity: 0.7,
            fontStyle: 'italic'
          }}>
            Your choice will influence your learning path and the challenges you encounter.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      backgroundColor: 'white', 
      borderRadius: '0.75rem', 
      padding: '1.5rem', 
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', 
      border: '1px solid #e5e7eb'
    }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ 
          fontSize: '1.25rem', 
          fontWeight: 'bold', 
          marginBottom: '0.5rem', 
          color: '#1f2937'
        }}>
          🏛️ Xiotein School - The Player's Journey
        </h2>
        
        {/* Chapter Progress Card */}
        {(() => {
          const currentChapter = getCurrentChapter();
          const completedChapters = getCompletedChapters();
          const totalChapters = CHAPTERS.length;
          
          return currentChapter ? (
            <div style={{ 
              padding: '1rem', 
              backgroundColor: '#f0fdf4', 
              border: '1px solid #22c55e',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              transition: 'all 0.3s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' }}>
                <div style={{ 
                  width: '20px', 
                  height: '20px', 
                  backgroundColor: '#22c55e', 
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  ✓
                </div>
                <div style={{ flex: 1 }}>
                  <h3 style={{ 
                    fontSize: '1.125rem', 
                    fontWeight: 'bold', 
                    marginBottom: '0.5rem',
                    color: '#22c55e'
                  }}>
                    Chapter {currentChapter.id}: {currentChapter.title}
                  </h3>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    color: '#6b7280', 
                    marginBottom: '0.5rem',
                    fontStyle: 'italic'
                  }}>
                    {currentChapter.subtitle}
                  </p>
                  <div style={{ 
                    padding: '0.5rem', 
                    backgroundColor: '#f3f4f6', 
                    borderRadius: '0.25rem',
                    fontSize: '0.8rem',
                    marginBottom: '0.5rem',
                    color: '#374151'
                  }}>
                    <strong>Story:</strong> {currentChapter.description}
                  </div>
                  
                  {/* Progress Bar */}
                  <div style={{ marginBottom: '0.5rem' }}>
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      fontSize: '0.75rem', 
                      color: '#6b7280',
                      marginBottom: '0.25rem'
                    }}>
                      <span>Chapter Progress</span>
                      <span>{Math.round(getChapterProgress(currentChapter.id))}%</span>
                    </div>
                    <div style={{
                      width: '100%',
                      backgroundColor: '#e5e7eb',
                      borderRadius: '9999px',
                      height: '0.5rem'
                    }}>
                      <div style={{
                        backgroundColor: '#22c55e',
                        borderRadius: '9999px',
                        height: '100%',
                        transition: 'width 0.3s ease',
                        width: `${getChapterProgress(currentChapter.id)}%`
                      }}></div>
                    </div>
                  </div>
                  
                  <div style={{ 
                    display: 'flex', 
                    gap: '0.5rem', 
                    fontSize: '0.75rem',
                    marginBottom: '0.5rem'
                  }}>
                    <span style={{ 
                      padding: '0.25rem 0.5rem', 
                      backgroundColor: '#22c55e', 
                      color: 'white',
                      borderRadius: '0.25rem',
                      fontWeight: 'bold'
                    }}>
                      Active
                    </span>
                    <span style={{ 
                      padding: '0.25rem 0.5rem', 
                      backgroundColor: '#f59e0b', 
                      color: 'white',
                      borderRadius: '0.25rem',
                      fontWeight: 'bold'
                    }}>
                      {completedChapters}/{totalChapters} Chapters
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ 
              padding: '1rem', 
              backgroundColor: '#fef3c7', 
              border: '1px solid #f59e0b',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              textAlign: 'center'
            }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                marginBottom: '0.5rem'
              }}>
                <span style={{ marginRight: '0.5rem' }}>🚀</span>
                <p style={{ 
                  fontSize: '0.875rem', 
                  fontWeight: '500', 
                  color: '#92400e'
                }}>
                  Ready to Begin Your Journey
                </p>
              </div>
              <p style={{ 
                fontSize: '0.75rem', 
                color: '#a16207',
                marginBottom: '0.75rem'
              }}>
                Choose your manifest to unlock Chapter 1
              </p>
            </div>
          );
        })()}
        
        {/* Player Stats */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '1rem', 
          marginBottom: '1rem'
        }}>
          <div style={{ 
            textAlign: 'center',
            backgroundColor: '#f9fafb',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#f59e0b' }}>{xp}</div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Manifestation XP</div>
          </div>
          <div style={{ 
            textAlign: 'center',
            backgroundColor: '#f9fafb',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#8b5cf6' }}>{level}</div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Power Level</div>
          </div>
          <div style={{ 
            textAlign: 'center',
            backgroundColor: '#f9fafb',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#10b981' }}>{powerPoints}</div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>Power Points</div>
          </div>
        </div>
      </div>

      {unlocks.length > 0 && (
        <div style={{ 
          marginBottom: '1.5rem', 
          padding: '1rem', 
          backgroundColor: '#fef3c7', 
          borderRadius: '0.5rem',
          border: '1px solid #f59e0b'
        }}>
          <p style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#92400e' }}>🔓 Manifestation Unlocks:</p>
          <ul style={{ paddingLeft: '1.2em', margin: 0, color: '#a16207' }}>
            {unlocks.map((u, i) => <li key={i} style={{ marginBottom: '0.25rem' }}>{u}</li>)}
          </ul>
        </div>
      )}

      {/* Manifest Selection Prompt - Only show if player doesn't have a manifest */}
      {!playerManifest && (
        <div style={{ 
          marginBottom: '1.5rem', 
          padding: '1.5rem', 
          backgroundColor: '#f3f4f6', 
          borderRadius: '0.75rem',
          border: '2px solid #d1d5db',
          textAlign: 'center'
        }}>
          <h3 style={{ 
            fontSize: '1.25rem', 
            fontWeight: 'bold', 
            marginBottom: '0.75rem',
            color: '#374151'
          }}>
            🌟 Choose Your Manifest
          </h3>
          <p style={{ 
            fontSize: '1rem', 
            marginBottom: '1rem',
            color: '#6b7280',
            lineHeight: '1.5'
          }}>
            In the Nine Knowings Universe, ordinary skills become extraordinary through mastery, intent, and will. 
            Your manifest will guide your ascension path and unlock unique abilities.
          </p>
          <button
            onClick={() => setShowManifestSelection(true)}
            style={{
              backgroundColor: '#8b5cf6',
              color: 'white',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1rem',
              fontWeight: 'bold',
              transition: 'all 0.3s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#7c3aed';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#8b5cf6';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Begin Your Manifestation Journey
          </button>
        </div>
      )}

      {/* Chapter Challenges Section */}
      {(() => {
        const currentChapter = getCurrentChapter();
        if (!currentChapter) return null;
        
        // Debug current chapter
        console.log('ChallengeTracker: Current chapter:', currentChapter);
        
        return (
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ 
              fontSize: '1.125rem', 
              fontWeight: 'bold', 
              marginBottom: '1rem',
              color: '#1f2937',
              borderBottom: '2px solid #e5e7eb',
              paddingBottom: '0.5rem',
              backgroundColor: '#f8fafc',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid #e2e8f0'
            }}>
              📖 Chapter {currentChapter.id} Challenges
            </h3>
            <div style={{ display: 'grid', gap: '1rem' }}>
              {currentChapter.challenges.map((challenge) => {
                const challengeData = userProgress?.chapters?.[currentChapter.id]?.challenges?.[challenge.id] || {};
                const isCompleted = challengeData.status === 'approved' || challengeData.isCompleted;
                const isSubmitted = challengeData.submitted && !isCompleted;
                
                // Debug logging for challenge status
                if (challenge.id === 'ch1-artifact-challenge') {
                  console.log(`ChallengeTracker: ${challenge.id} status:`, {
                    challengeData,
                    isCompleted,
                    isSubmitted,
                    chapterData: userProgress?.chapters?.[currentChapter.id]?.challenges?.[challenge.id]
                  });
                }
                const hasFile = !!challengeData.file;
                const classroomAssignment = chapterClassroomAssignments[challenge.id];
                
                return (
                  <div key={challenge.id} style={{ 
                    padding: '1rem', 
                    backgroundColor: isCompleted ? '#f0fdf4' : isSubmitted ? '#fef3c7' : '#f9fafb',
                    border: isCompleted ? '1px solid #22c55e' : isSubmitted ? '1px solid #f59e0b' : '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    transition: 'all 0.3s ease'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' }}>
                      <div style={{ 
                        width: '20px', 
                        height: '20px', 
                        backgroundColor: isCompleted ? '#22c55e' : isSubmitted ? '#f59e0b' : '#e5e7eb', 
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        {isCompleted ? '✓' : isSubmitted ? '⏳' : '○'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <h4 style={{ 
                          fontSize: '1rem', 
                          fontWeight: 'bold', 
                          marginBottom: '0.5rem',
                          color: isCompleted ? '#22c55e' : isSubmitted ? '#d97706' : '#1f2937'
                        }}>
                          {challenge.title}
                        </h4>
                        <p style={{ 
                          fontSize: '0.875rem', 
                          color: '#6b7280', 
                          marginBottom: '0.5rem',
                          fontStyle: 'italic'
                        }}>
                          {challenge.description}
                        </p>
                        
                        {/* Status Badge */}
                        {isSubmitted && (
                          <div style={{ 
                            display: 'inline-block',
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#f59e0b',
                            color: 'white',
                            borderRadius: '0.25rem',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            marginBottom: '0.5rem'
                          }}>
                            ⏳ Submitted for Review
                          </div>
                        )}
                        
                        {/* Google Classroom Assignment Information */}
                        {classroomAssignment && (
                          <div style={{ 
                            padding: '0.75rem', 
                            backgroundColor: '#dbeafe', 
                            border: '1px solid #3b82f6',
                            borderRadius: '0.25rem',
                            fontSize: '0.8rem',
                            marginBottom: '0.5rem'
                          }}>
                            <div style={{ 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.5rem', 
                              marginBottom: '0.25rem',
                              color: '#1e40af',
                              fontWeight: 'bold'
                            }}>
                              📚 Google Classroom Assignment
                            </div>
                            <div style={{ marginBottom: '0.25rem', color: '#1e40af' }}>
                              <strong>Title:</strong> {classroomAssignment.title}
                            </div>
                            {classroomAssignment.description && (
                              <div style={{ marginBottom: '0.25rem', fontSize: '0.75rem', color: '#1e40af' }}>
                                {classroomAssignment.description}
                              </div>
                            )}
                            {classroomAssignment.courseName && (
                              <div style={{ marginBottom: '0.25rem', fontSize: '0.75rem', color: '#1e40af' }}>
                                <strong>Course:</strong> {classroomAssignment.courseName}
                              </div>
                            )}
                            {classroomAssignment.dueDate && (
                              <div style={{ fontSize: '0.75rem', color: '#dc2626' }}>
                                <strong>Due:</strong> {classroomAssignment.dueDate?.month}/{classroomAssignment.dueDate?.day}/{classroomAssignment.dueDate?.year}
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Challenge Type */}
                        <div style={{ 
                          display: 'flex', 
                          gap: '0.5rem', 
                          fontSize: '0.75rem',
                          marginBottom: '0.5rem',
                          flexWrap: 'wrap'
                        }}>
                          <span style={{ 
                            padding: '0.25rem 0.5rem', 
                            background: '#34d399', 
                            color: 'white',
                            borderRadius: '0.25rem',
                            fontWeight: 'bold',
                            textTransform: 'capitalize'
                          }}>
                            {challenge.type}
                          </span>
                        </div>
                        
                        {/* Challenge Rewards */}
                        {challenge.rewards.length > 0 && (
                          <div style={{ 
                            display: 'flex', 
                            gap: '0.5rem', 
                            fontSize: '0.75rem',
                            marginBottom: '0.5rem',
                            flexWrap: 'wrap'
                          }}>
                            {challenge.rewards.map((reward, index) => {
                              let bgColor = '#fbbf24';
                              let textColor = 'black';
                              
                              // Color coding for different reward types
                              if (reward.type === 'xp') {
                                bgColor = '#fbbf24';
                                textColor = 'black';
                              } else if (reward.type === 'pp') {
                                bgColor = '#a78bfa';
                                textColor = 'white';
                              } else if (reward.type === 'level') {
                                bgColor = '#8b5cf6';
                                textColor = 'white';
                              } else if (reward.type === 'artifact') {
                                bgColor = '#34d399';
                                textColor = 'white';
                              } else if (reward.type === 'manifest') {
                                bgColor = '#f59e0b';
                                textColor = 'white';
                              } else if (reward.type === 'reflection') {
                                bgColor = '#06b6d4';
                                textColor = 'white';
                              } else if (reward.type === 'wisdom') {
                                bgColor = '#10b981';
                                textColor = 'white';
                              } else if (reward.type === 'blessing') {
                                bgColor = '#ec4899';
                                textColor = 'white';
                              } else if (reward.type === 'ability') {
                                bgColor = '#6366f1';
                                textColor = 'white';
                              } else if (reward.type === 'title') {
                                bgColor = '#84cc16';
                                textColor = 'white';
                              } else if (reward.type === 'team') {
                                bgColor = '#f97316';
                                textColor = 'white';
                              } else if (reward.type === 'rival') {
                                bgColor = '#dc2626';
                                textColor = 'white';
                              } else if (reward.type === 'veil') {
                                bgColor = '#7c3aed';
                                textColor = 'white';
                              } else if (reward.type === 'leadership') {
                                bgColor = '#059669';
                                textColor = 'white';
                              } else if (reward.type === 'ethics') {
                                bgColor = '#be185d';
                                textColor = 'white';
                              } else if (reward.type === 'ninth') {
                                bgColor = '#1e40af';
                                textColor = 'white';
                              }
                              
                              return (
                                <span key={index} style={{ 
                                  padding: '0.25rem 0.5rem', 
                                  background: bgColor,
                                  color: textColor,
                                  borderRadius: '0.25rem',
                                  fontWeight: 'bold'
                                }}>
                                  +{reward.value} {reward.type.toUpperCase()}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                                        {!isCompleted && !isSubmitted && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {challenge.id === 'ch2-rival-selection' ? (
                          // Special handling for rival selection challenge
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
                            onClick={() => setShowRivalSelectionModal(true)}
                            onMouseOver={(e) => {
                              e.currentTarget.style.background = '#b91c1c';
                              e.currentTarget.style.transform = 'translateY(-2px)';
                            }}
                            onMouseOut={(e) => {
                              e.currentTarget.style.background = '#dc2626';
                              e.currentTarget.style.transform = 'translateY(0)';
                            }}
                          >
                            🏆 Select Rival
                          </button>
                        ) : (
                          // Regular file upload for other challenges
                          <>
                            <input
                              type="file"
                              accept=".stl,.obj,.jpg,.jpeg,.png,.pdf"
                              style={{ 
                                padding: '0.5rem',
                                background: 'white',
                                border: '1px solid #d1d5db',
                                borderRadius: '0.25rem',
                                color: '#374151',
                                fontSize: '0.875rem'
                              }}
                              onChange={e => {
                                handleFileSelect(challenge.id, e.target.files && e.target.files[0] ? e.target.files[0] : null);
                              }}
                            />
                            {selectedFiles[challenge.id] ? (
                              <ModelPreview file={selectedFiles[challenge.id] as File} />
                            ) : null}
                            <button
                              type="button"
                              style={{ 
                                padding: '0.5rem 1rem', 
                                background: selectedFiles[challenge.id] ? '#22c55e' : '#6b7280', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '0.25rem', 
                                cursor: selectedFiles[challenge.id] ? 'pointer' : 'not-allowed',
                                opacity: selectedFiles[challenge.id] ? 1 : 0.5,
                                fontWeight: 'bold',
                                fontSize: '0.875rem'
                              }}
                              disabled={!selectedFiles[challenge.id]}
                              onClick={() => handleFileUpload(challenge.id)}
                            >
                              Submit
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {(hasFile && (isCompleted || isSubmitted)) && (
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem', 
                        marginTop: '0.5rem',
                        flexWrap: 'wrap'
                      }}>
                        <a
                          href={challengeData.file}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ 
                            color: '#60a5fa', 
                            fontSize: '0.875rem',
                            textDecoration: 'none',
                            padding: '0.25rem 0.5rem',
                            background: 'rgba(96, 165, 250, 0.2)',
                            borderRadius: '0.25rem',
                            fontWeight: 'bold'
                          }}
                        >
                          View Manifestation
                        </a>
                        {!isCompleted && (
                          <button
                            type="button"
                            style={{ 
                              padding: '0.25rem 0.5rem', 
                              background: '#dc2626', 
                              color: 'white', 
                              border: 'none', 
                              borderRadius: '0.25rem', 
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              fontWeight: 'bold'
                            }}
                            onClick={() => handleRemoveSubmission(challenge.id)}
                          >
                            Remove
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
      })()}



      {(() => {
        const currentChapter = getCurrentChapter();
        if (!currentChapter || currentChapter.id >= 9) return null;
        
        return (
          <div style={{ 
            marginTop: '1.5rem', 
            padding: '1rem', 
            background: 'rgba(251, 191, 36, 0.2)', 
            borderRadius: '0.5rem',
            border: '1px solid rgba(251, 191, 36, 0.5)',
            textAlign: 'center'
          }}>
            <p style={{ fontWeight: 'bold', color: '#fbbf24' }}>
              Complete all Challenges in Chapter {currentChapter.id} to unlock the next chapter of your story!
            </p>
          </div>
        );
      })()}

      {/* Manifest Selection Modal */}
      {showManifestSelection && (
        <ManifestSelection
          onManifestSelect={handleManifestSelect}
          onClose={() => setShowManifestSelection(false)}
        />
      )}

      {/* Rival Selection Modal */}
      <RivalSelectionModal
        isOpen={showRivalSelectionModal}
        onClose={() => setShowRivalSelectionModal(false)}
        onRivalSelected={handleRivalSelected}
      />
    </div>
  );
};

export default ChallengeTracker; 