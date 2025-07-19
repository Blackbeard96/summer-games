 import ModelPreview from './ModelPreview';
import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';
import ManifestSelection from './ManifestSelection';
import { PlayerManifest, MANIFESTS } from '../types/manifest';

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
            
            console.log(`Awarded badge "${badge.name}" for completing challenge "${challengeName}"`);
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
  storyProgress?: number;
}

interface StoryChallenge {
  id: string;
  name: string;
  description: string;
  storyContext: string;
  character: string;
  manifestationType: string;
  xpReward: number;
  ppReward: number;
  requiredLevel: number;
  chapter: number;
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
  const [challenges, setChallenges] = useState<{[key: string]: ChallengeData}>({});
  const [xp, setXP] = useState(0);
  const [level, setLevel] = useState(1);
  const [unlocks, setUnlocks] = useState<string[]>([]);
  const [powerPoints, setPowerPoints] = useState(0);
  const [manifestationType, setManifestationType] = useState<string>('');
  const [storyChapter, setStoryChapter] = useState(1);
  const [selectedFiles, setSelectedFiles] = useState<{ [challenge: string]: File | null }>({});
  const [showElementSelection, setShowElementSelection] = useState(false);
  const [showManifestSelection, setShowManifestSelection] = useState(false);
  const [classroomAssignments, setClassroomAssignments] = useState<{ [challengeId: string]: GoogleClassroomAssignment }>({});
  const [playerManifest, setPlayerManifest] = useState<PlayerManifest | null>(null);

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

  // Story-driven challenges for 3D modeling and AI
  const storyChallenges: StoryChallenge[] = [
    {
      id: "reality-shaping-101",
      name: "Reality Shaping 101",
      description: "Create your first 3D model - a simple geometric shape that represents your manifestation potential",
      storyContext: "Sage watches as you attempt your first act of Imposition. 'Shape the world around you,' he whispers. 'Start with something simple - a cube, a sphere. Let your will become form.'",
      character: "Sage",
      manifestationType: "Imposition",
      xpReward: 15,
      ppReward: 8,
      requiredLevel: 1,
      chapter: 1
    },
    {
      id: "memory-forge",
      name: "Memory Forge",
      description: "Design a 3D environment that represents a significant memory or experience",
      storyContext: "Alejandra approaches you with a knowing smile. 'Memories are the foundation of manifestation,' she says. 'Create a space that holds meaning. Let your past shape your future.'",
      character: "Alejandra",
      manifestationType: "Memory",
      xpReward: 20,
      ppReward: 10,
      requiredLevel: 2,
      chapter: 1
    },
    {
      id: "intelligent-constructs",
      name: "Intelligent Constructs",
      description: "Develop an AI model or script that demonstrates basic pattern recognition",
      storyContext: "Greg observes from the shadows. 'Intelligence is the highest form of manifestation,' he explains. 'You're not just creating - you're giving life to thought itself.'",
      character: "Greg",
      manifestationType: "Intelligence",
      xpReward: 25,
      ppReward: 12,
      requiredLevel: 3,
      chapter: 2
    },
    {
      id: "dimensional-portal",
      name: "Dimensional Portal",
      description: "Create a 3D scene with multiple layers and depth that creates an immersive experience",
      storyContext: "Allen's fire flickers as he speaks. 'Portals aren't just doors - they're windows into possibility. Build something that makes people forget where they are.'",
      character: "Allen",
      manifestationType: "Dimensional",
      xpReward: 30,
      ppReward: 15,
      requiredLevel: 4,
      chapter: 2
    },
    {
      id: "truth-manifestation",
      name: "Truth Manifestation",
      description: "Develop an AI system that can analyze and categorize different types of data or information",
      storyContext: "Khalil's serpent ring glints as he smirks. 'Truth is relative,' he says. 'But patterns are absolute. Find the patterns others miss.'",
      character: "Khalil",
      manifestationType: "Truth",
      xpReward: 35,
      ppReward: 18,
      requiredLevel: 5,
      chapter: 3
    },
    {
      id: "reality-bending",
      name: "Reality Bending",
      description: "Create a 3D model that defies physics or creates impossible geometry",
      storyContext: "Sage's eyes glow with ancient wisdom. 'The rules of this world are suggestions, not laws. Bend them. Break them. Make the impossible possible.'",
      character: "Sage",
      manifestationType: "Imposition",
      xpReward: 40,
      ppReward: 20,
      requiredLevel: 6,
      chapter: 3
    },
    {
      id: "neural-networks",
      name: "Neural Networks",
      description: "Build a machine learning model that can learn and adapt to new information",
      storyContext: "Greg's nine shadows whisper in unison. 'The mind is a network of connections. Build one that grows stronger with each experience.'",
      character: "Greg",
      manifestationType: "Intelligence",
      xpReward: 45,
      ppReward: 22,
      requiredLevel: 7,
      chapter: 4
    },
    {
      id: "eternal-creation",
      name: "Eternal Creation",
      description: "Develop a complete 3D environment with AI integration that creates an interactive experience",
      storyContext: "Sage's voice echoes through the halls. 'You stand at the threshold of creation itself. Build a world that lives, breathes, and evolves.'",
      character: "Sage",
      manifestationType: "Creation",
      xpReward: 50,
      ppReward: 25,
      requiredLevel: 8,
      chapter: 4
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
        setStoryChapter(data.storyChapter || 1);
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

    const fetchClassroomAssignments = async () => {
      try {
        const mappingsQuery = query(collection(db, 'classroomChallengeMap'));
        const mappingsSnapshot = await getDocs(mappingsQuery);
        const assignments: { [challengeId: string]: GoogleClassroomAssignment } = {};
        
        for (const mappingDoc of mappingsSnapshot.docs) {
          const mappingData = mappingDoc.data();
          const challengeId = mappingData.challengeId;
          const assignmentId = mappingDoc.id;
          
          console.log('Mapping data for', assignmentId, ':', mappingData);
          console.log('Title from mapping:', mappingData.title);
          console.log('Will use title:', mappingData.title || 'Google Classroom Assignment');
          
          // Fetch assignment details from Google Classroom API
          // For now, we'll store basic info in the mapping
          assignments[challengeId] = {
            id: assignmentId,
            title: mappingData.title || 'Google Classroom Assignment',
            description: mappingData.description || '',
            dueDate: mappingData.dueDate,
            courseId: mappingData.courseId,
            courseName: mappingData.courseName || ''
          };
        }
        
        setClassroomAssignments(assignments);
      } catch (error) {
        console.error('Error fetching classroom assignments:', error);
      }
    };

    if (currentUser) {
      fetchChallenges();
      fetchClassroomAssignments();
    }
  }, [currentUser]);

  const selectElement = async (elementName: string) => {
    if (!currentUser) return;
    
    try {
      const userRef = doc(db, 'students', currentUser.uid);
      await setDoc(userRef, { 
        challenges: {}, 
        xp: 0, 
        powerPoints: 0, 
        manifestationType: elementName,
        storyChapter: 1
      });
      
      setManifestationType(elementName);
      setStoryChapter(1);
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

  const getAvailableChallenges = () => {
    return storyChallenges.filter(challenge => 
      challenge.requiredLevel <= level && challenge.chapter <= storyChapter
    );
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
      const storyChallenge = storyChallenges.find(c => c.id === id);
      const xpLoss = storyChallenge?.xpReward || 10;
      const ppLoss = storyChallenge?.ppReward || 5;
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

    const storyChallenge = storyChallenges.find(c => c.id === challengeName);
    if (!storyChallenge) return;

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
          completed: true,
          storyProgress: storyChallenge.chapter
        }
      };
      
      setChallenges(updated);
      const newXP = challenge.completed ? xp : xp + storyChallenge.xpReward;
      const newPP = challenge.completed ? powerPoints : powerPoints + storyChallenge.ppReward;
      setXP(newXP);
      setPowerPoints(newPP);
      const newLevel = Math.floor(newXP / 50) + 1;
    setLevel(newLevel);
    updateUnlocks(newLevel);

      // Check if we should advance story chapter
      const completedInChapter = Object.values(updated).filter(c => 
        c.storyProgress === storyChapter && c.completed
      ).length;
      const chapterChallenges = storyChallenges.filter(c => c.chapter === storyChapter);
      
      const userRef = doc(db, 'students', currentUser.uid);
      if (completedInChapter >= 1 && storyChapter < 4) {
        const newChapter = storyChapter + 1;
        setStoryChapter(newChapter);
        await updateDoc(doc(db, 'students', currentUser.uid), { 
          storyChapter: newChapter 
        });
        await updateDoc(userRef, { 
          challenges: updated, 
          xp: newXP, 
          powerPoints: newPP,
          storyChapter: newChapter
        });
      } else {
        await updateDoc(userRef, { 
          challenges: updated, 
          xp: newXP, 
          powerPoints: newPP,
          storyChapter: storyChapter
        });
      }

      // Only add to challengeSubmissions if not already completed
      if (!challenge.completed) {
        await addDoc(collection(db, 'challengeSubmissions'), {
          userId: currentUser.uid,
          displayName: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
          email: currentUser.email || '',
          photoURL: currentUser.photoURL || '',
          challengeId: storyChallenge.id,
          challengeName: storyChallenge.name,
          fileUrl: downloadURL,
          timestamp: serverTimestamp(),
          status: 'pending',
          xpReward: storyChallenge.xpReward,
          ppReward: storyChallenge.ppReward,
          manifestationType: storyChallenge.manifestationType,
          character: storyChallenge.character
        });
      }

      // Award badges for challenge completion
      if (!challenge.completed) {
        await awardBadgeForChallenge(currentUser.uid, storyChallenge.name);
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
      
      const storyChallenge = storyChallenges.find(c => c.id === challengeName);
      const xpLoss = storyChallenge?.xpReward || 10;
      const ppLoss = storyChallenge?.ppReward || 5;
      
      const updated = {
        ...challenges,
        [challengeName]: {
          ...challenge,
          file: undefined,
          completed: false,
          storyProgress: undefined
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
      padding: '1.5rem', 
      background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', 
      color: 'white',
      borderRadius: '1rem',
      boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: 'bold',
          marginBottom: '0.5rem',
          textAlign: 'center'
        }}>
          Xiotein School - Manifestation Training
        </h2>
        <div style={{
          fontSize: '1.125rem',
          fontWeight: 'normal',
          marginBottom: '1.5rem',
          textAlign: 'center',
          color: '#d1d5db'
        }}>
          Chapter 1: Path of Self
        </div>
        <p style={{ fontSize: '1.1rem', opacity: 0.9, marginBottom: '1rem' }}>
          Chapter {storyChapter}: The Path of {manifestationType}
        </p>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          gap: '2rem', 
          marginBottom: '1rem',
          flexWrap: 'wrap'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#fbbf24' }}>{xp}</div>
            <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>Manifestation XP</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#a78bfa' }}>{level}</div>
            <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>Power Level</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#34d399' }}>{powerPoints}</div>
            <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>Power Points</div>
          </div>
        </div>
      </div>

      {unlocks.length > 0 && (
        <div style={{ 
          marginBottom: '1.5rem', 
          padding: '1rem', 
          background: 'rgba(255,255,255,0.1)', 
          borderRadius: '0.5rem',
          border: '1px solid rgba(255,255,255,0.2)'
        }}>
          <p style={{ fontWeight: 'bold', marginBottom: '0.5rem', color: '#fbbf24' }}>🔓 Manifestation Unlocks:</p>
          <ul style={{ paddingLeft: '1.2em', margin: 0 }}>
            {unlocks.map((u, i) => <li key={i} style={{ marginBottom: '0.25rem' }}>{u}</li>)}
          </ul>
        </div>
      )}

      {/* Manifest Selection Prompt - Only show if player doesn't have a manifest */}
      {!playerManifest && (
        <div style={{ 
          marginBottom: '1.5rem', 
          padding: '1.5rem', 
          background: 'rgba(139, 92, 246, 0.2)', 
          borderRadius: '0.75rem',
          border: '2px solid rgba(139, 92, 246, 0.5)',
          textAlign: 'center'
        }}>
          <h3 style={{ 
            fontSize: '1.25rem', 
            fontWeight: 'bold', 
            marginBottom: '0.75rem',
            color: '#8B5CF6'
          }}>
            🌟 Choose Your Manifest
          </h3>
          <p style={{ 
            fontSize: '1rem', 
            marginBottom: '1rem',
            opacity: 0.9,
            lineHeight: '1.5'
          }}>
            In the Nine Knowings Universe, ordinary skills become extraordinary through mastery, intent, and will. 
            Your manifest will guide your ascension path and unlock unique abilities.
          </p>
          <button
            onClick={() => setShowManifestSelection(true)}
            style={{
              backgroundColor: '#8B5CF6',
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
              e.currentTarget.style.backgroundColor = '#7C3AED';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#8B5CF6';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Begin Your Manifestation Journey
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gap: '1rem' }}>
        {getAvailableChallenges().map((challenge) => {
          const challengeData = challenges[challenge.id] || {};
          const isCompleted = challengeData.completed;
          const hasFile = !!challengeData.file;
          
          return (
            <div key={challenge.id} style={{ 
              padding: '1rem', 
              background: isCompleted ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255,255,255,0.1)',
              border: isCompleted ? '1px solid rgba(34, 197, 94, 0.5)' : '1px solid rgba(255,255,255,0.2)',
              borderRadius: '0.5rem',
              transition: 'all 0.3s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' }}>
            <input
              type="checkbox"
                  checked={isCompleted}
                  onChange={() => toggleChallenge(challenge.id)}
                  disabled={!hasFile}
                  style={{ marginTop: '0.25rem' }}
                />
                <div style={{ flex: 1 }}>
                  <h3 style={{ 
                    fontSize: '1.125rem', 
                    fontWeight: 'bold', 
                    marginBottom: '0.5rem',
                    color: isCompleted ? '#22c55e' : 'white'
                  }}>
                    {challenge.name}
                  </h3>
                  <p style={{ 
                    fontSize: '0.875rem', 
                    opacity: 0.8, 
                    marginBottom: '0.5rem',
                    fontStyle: 'italic'
                  }}>
                    {challenge.description}
                  </p>
                  <div style={{ 
                    padding: '0.5rem', 
                    background: 'rgba(0,0,0,0.3)', 
                    borderRadius: '0.25rem',
                    fontSize: '0.8rem',
                    marginBottom: '0.5rem'
                  }}>
                    <strong>{challenge.character}:</strong> {challenge.storyContext}
                  </div>
                  
                  {/* Google Classroom Assignment Information */}
                  {classroomAssignments[challenge.id] && (
                    <div style={{ 
                      padding: '0.75rem', 
                      background: 'rgba(59, 130, 246, 0.2)', 
                      border: '1px solid rgba(59, 130, 246, 0.5)',
                      borderRadius: '0.25rem',
                      fontSize: '0.8rem',
                      marginBottom: '0.5rem'
                    }}>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.5rem', 
                        marginBottom: '0.25rem',
                        color: '#3b82f6',
                        fontWeight: 'bold'
                      }}>
                        📚 Google Classroom Assignment
                      </div>
                      <div style={{ marginBottom: '0.25rem' }}>
                        <strong>Title:</strong> {classroomAssignments[challenge.id].title}
                      </div>
                      {classroomAssignments[challenge.id].description && (
                        <div style={{ marginBottom: '0.25rem', fontSize: '0.75rem', opacity: 0.9 }}>
                          {classroomAssignments[challenge.id].description}
                        </div>
                      )}
                      {classroomAssignments[challenge.id].courseName && (
                        <div style={{ marginBottom: '0.25rem', fontSize: '0.75rem' }}>
                          <strong>Course:</strong> {classroomAssignments[challenge.id].courseName}
                        </div>
                      )}
                      {classroomAssignments[challenge.id].dueDate && (
                        <div style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                          <strong>Due:</strong> {classroomAssignments[challenge.id].dueDate?.month}/{classroomAssignments[challenge.id].dueDate?.day}/{classroomAssignments[challenge.id].dueDate?.year}
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ 
                    display: 'flex', 
                    gap: '0.5rem', 
                    fontSize: '0.75rem',
                    marginBottom: '0.5rem'
                  }}>
                    <span style={{ 
                      padding: '0.25rem 0.5rem', 
                      background: '#fbbf24', 
                      color: 'black',
                      borderRadius: '0.25rem',
                      fontWeight: 'bold'
                    }}>
                      +{challenge.xpReward} XP
                    </span>
                    <span style={{ 
                      padding: '0.25rem 0.5rem', 
                      background: '#a78bfa', 
                      color: 'white',
                      borderRadius: '0.25rem',
                      fontWeight: 'bold'
                    }}>
                      +{challenge.ppReward} PP
                    </span>
                    <span style={{ 
                      padding: '0.25rem 0.5rem', 
                      background: '#34d399', 
                      color: 'white',
                      borderRadius: '0.25rem',
                      fontWeight: 'bold'
                    }}>
                      {challenge.manifestationType}
                    </span>
                  </div>
                </div>
              </div>

              {!isCompleted && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input
                    type="file"
                    accept=".stl,.obj"
                    style={{ 
                      padding: '0.5rem',
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.3)',
                      borderRadius: '0.25rem',
                      color: 'white'
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
                      opacity: selectedFiles[challenge.id] ? 1 : 0.5
                    }}
                    disabled={!selectedFiles[challenge.id]}
                    onClick={() => handleFileUpload(challenge.id)}
                  >
                    Submit
                  </button>
                </div>
              )}

              {hasFile && (
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
                      borderRadius: '0.25rem'
                    }}
                  >
                    View Manifestation
                  </a>
                  <button
                    type="button"
                    style={{ 
                      padding: '0.25rem 0.5rem', 
                      background: '#dc2626', 
                      color: 'white', 
                      border: 'none', 
                      borderRadius: '0.25rem', 
                      cursor: 'pointer',
                      fontSize: '0.875rem'
                    }}
                    onClick={() => handleRemoveSubmission(challenge.id)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {storyChapter < 4 && (
        <div style={{ 
          marginTop: '1.5rem', 
          padding: '1rem', 
          background: 'rgba(251, 191, 36, 0.2)', 
          borderRadius: '0.5rem',
          border: '1px solid rgba(251, 191, 36, 0.5)',
          textAlign: 'center'
        }}>
          <p style={{ fontWeight: 'bold', color: '#fbbf24' }}>
            Complete all manifestations in Chapter {storyChapter} to unlock the next chapter of your story!
          </p>
        </div>
      )}

      {/* Manifest Selection Modal */}
      {showManifestSelection && (
        <ManifestSelection
          onManifestSelect={handleManifestSelect}
          onClose={() => setShowManifestSelection(false)}
        />
      )}
    </div>
  );
};

export default ChallengeTracker; 