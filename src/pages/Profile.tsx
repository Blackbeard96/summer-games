import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db, storage } from '../firebase';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile, getAuth } from 'firebase/auth';
import PlayerCard from '../components/PlayerCard';
import ManifestProgress from '../components/ManifestProgress';
import ManifestSelection from '../components/ManifestSelection';
import { SketchPicker } from 'react-color';
import { getLevelFromXP } from '../utils/leveling';
import { PlayerManifest, MANIFESTS } from '../types/manifest';
import { CHAPTERS } from '../types/chapters';
import { getActivePPBoost, getPPBoostStatus } from '../utils/ppBoost';
import { getUserSquadAbbreviation } from '../utils/squadUtils';
import { getRRCandyMoves } from '../utils/rrCandyMoves';
import { normalizePlayerData } from '../utils/playerData';
import EditRivalModal from '../components/EditRivalModal';
import { getRivals } from '../utils/rivalService';

// Import marketplace items to match legacy items
const marketplaceItems = [
  { 
    id: 'checkin-free',
    name: 'Get Out of Check-in Free', 
    description: 'Skip the next check-in requirement', 
    price: 50, 
    icon: '🎫', 
    image: '/images/Get-Out-of-Check-in-Free.png',
    category: 'protection',
    rarity: 'common'
  },
  { 
    id: 'shield',
    name: 'Shield', 
    description: 'Block the next incoming attack on your vault', 
    price: 25, 
    icon: '🛡️', 
    image: '/images/Shield Item.jpeg',
    category: 'protection',
    rarity: 'common'
  }
  // Add more items as needed
];

// Function to enhance legacy items with marketplace data
const enhanceLegacyItem = (item: any) => {
  if (typeof item === 'string') {
    const marketplaceItem = marketplaceItems.find(mi => mi.name === item);
    if (marketplaceItem) {
      return {
        id: marketplaceItem.id,
        name: marketplaceItem.name,
        description: marketplaceItem.description,
        icon: marketplaceItem.icon,
        image: marketplaceItem.image,
        category: marketplaceItem.category,
        rarity: marketplaceItem.rarity,
        purchasedAt: null,
        used: false,
        isLegacy: true
      };
    }
  }
  return item;
};

// Helper function to determine if an artifact is equippable (should be shown on Artifacts page, not Profile)
const isEquippableArtifact = (artifact: any): boolean => {
  if (!artifact) return false;
  
  const enhanced = enhanceLegacyItem(artifact);
  const artifactId = enhanced.id || (typeof artifact === 'string' ? artifact : '');
  const artifactName = (enhanced.name || '').toLowerCase();
  const category = enhanced.category || '';
  
  // Check by category
  if (category === 'armor' || category === 'accessory') {
    return true;
  }
  
  // Check by ID patterns (helmets, rings)
  const equippablePatterns = [
    'helmet',
    'ring',
    'captain',
    'blaze-ring',
    'terra-ring',
    'aqua-ring',
    'air-ring',
    'elemental-ring'
  ];
  
  if (equippablePatterns.some(pattern => artifactId.toLowerCase().includes(pattern))) {
    return true;
  }
  
  // Check by name patterns
  if (equippablePatterns.some(pattern => artifactName.includes(pattern))) {
    return true;
  }
  
  // Check if description mentions "Equip"
  const description = (enhanced.description || '').toLowerCase();
  if (description.includes('equip') || description.includes('equip to')) {
    return true;
  }
  
  return false;
};



const Profile = () => {
  const { currentUser } = useAuth();
  const { syncVaultPP, vault, moves: battleMoves, upgradeMove, refreshVaultData } = useBattle();
  const navigate = useNavigate();
  const [userData, setUserData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ppBoostStatus, setPpBoostStatus] = useState<{ isActive: boolean; timeRemaining: string; multiplier: number }>({ isActive: false, timeRemaining: '', multiplier: 1 });
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  // Add state for manifest, style, and rarity
  const [manifest, setManifest] = useState(userData?.manifest || 'None');
  const [style, setStyle] = useState(userData?.manifestationType || 'Fire');
  const [rarity, setRarity] = useState(userData?.rarity || 1);
  const [cardBgColor, setCardBgColor] = useState(userData?.cardBgColor || '#e0e7ff');
  const [cardFrameShape, setCardFrameShape] = useState<'circular' | 'rectangular'>('circular');
  const [cardBorderColor, setCardBorderColor] = useState(userData?.cardBorderColor || '#a78bfa');
  const [cardImageBorderColor, setCardImageBorderColor] = useState(userData?.cardImageBorderColor || '#a78bfa');
  const [moves, setMoves] = useState(userData?.moves || []);
  const [newMove, setNewMove] = useState({ name: '', description: '', icon: '' });
  const [badges, setBadges] = useState(userData?.badges || []);
  const [playerManifest, setPlayerManifest] = useState<PlayerManifest | null>(null);
  const [showManifestSelection, setShowManifestSelection] = useState(false);
  const [nextChallenge, setNextChallenge] = useState<any>(null);
  const [showPPEarningModal, setShowPPEarningModal] = useState(false);
  const [squadAbbreviation, setSquadAbbreviation] = useState<string | null>(null);
  const [isSkillTreeShowing, setIsSkillTreeShowing] = useState(false);
  const [showEditRivalModal, setShowEditRivalModal] = useState(false);
  const [rivals, setRivals] = useState<{ chosen?: any; inbound?: any }>({});

  // Function to get manifest color
  const getManifestColor = (manifestName: string) => {
    const manifest = MANIFESTS.find(m => m.name === manifestName);
    return manifest ? manifest.color : '#6b7280'; // Default gray if not found
  };

  // Function to get element color
  const getElementColor = (elementName: string) => {
    const elementColors: { [key: string]: string } = {
      'Fire': '#EF4444',
      'Water': '#3B82F6', 
      'Air': '#10B981',
      'Earth': '#F59E0B',
      'Lightning': '#8B5CF6',
      'Light': '#FBBF24',
      'Shadow': '#6B7280',
      'Metal': '#9CA3AF'
    };
    return elementColors[elementName] || '#6b7280'; // Default gray if not found
  };

  // Function to check if a challenge's requirements are met
  const isChallengeUnlocked = (challenge: any, userProgress: any) => {
    // Always unlock challenges with no requirements
    if (!challenge.requirements || challenge.requirements.length === 0) {
      return true;
    }

    // Special case: Chapter 1 Challenge 1 should ALWAYS be unlocked for new players
    if (challenge.id === 'ep1-get-letter') {
      return true;
    }

    // Check each requirement
    for (const requirement of challenge.requirements) {
      let requirementMet = false;
      
      switch (requirement.type) {
        case 'artifact':
          if (requirement.value === 'letter_received') {
            const letterChallenge = userProgress?.chapters?.[1]?.challenges?.['ep1-get-letter'];
            requirementMet = letterChallenge?.isCompleted && letterChallenge?.letterReceived;
          } else if (requirement.value === 'chose_truth_metal') {
            const truthMetalChoice = userProgress?.chapters?.[1]?.challenges?.['ep1-truth-metal-choice'];
            requirementMet = truthMetalChoice?.isCompleted;
          } else if (requirement.value === 'truth_metal_currency') {
            const truthMetalTouch = userProgress?.chapters?.[1]?.challenges?.['ep1-touch-truth-metal'];
            requirementMet = truthMetalTouch?.isCompleted;
          } else if (requirement.value === 'ui_explored') {
            const uiChallenge = userProgress?.chapters?.[1]?.challenges?.['ep1-view-mst-ui'];
            requirementMet = uiChallenge?.isCompleted;
          } else if (requirement.value === 'first_combat') {
            const combatChallenge = userProgress?.chapters?.[1]?.challenges?.['ep1-combat-drill'];
            requirementMet = combatChallenge?.isCompleted;
          } else if (requirement.value === 'power_card_discovered') {
            const powerCardChallenge = userProgress?.chapters?.[1]?.challenges?.['ep1-power-card-intro'];
            requirementMet = powerCardChallenge?.isCompleted;
          } else if (requirement.value === 'elemental_ring_level_1') {
            // Check if Challenge 8 is completed (which grants the Elemental Ring)
            const challenge8Completed = userProgress?.chapters?.[1]?.challenges?.['ep1-view-power-card']?.isCompleted;
            requirementMet = challenge8Completed === true;
          }
          break;
        case 'manifest':
          if (requirement.value === 'chosen') {
            requirementMet = !!userProgress?.manifest || !!userProgress?.manifestationType;
          }
          break;
        case 'profile':
          if (requirement.value === 'completed') {
            const profileChallenge = userProgress?.chapters?.[1]?.challenges?.['ep1-update-profile'];
            requirementMet = profileChallenge?.isCompleted;
          } else if (requirement.value === 'power_card_viewed') {
            const powerCardChallenge = userProgress?.chapters?.[1]?.challenges?.['ep1-view-power-card'];
            requirementMet = powerCardChallenge?.isCompleted;
          }
          break;
        case 'team':
          if (requirement.value === 'formed') {
            const teamChallenge = userProgress?.chapters?.[2]?.challenges?.['ch2-team-formation'];
            requirementMet = teamChallenge?.isCompleted;
          }
          break;
        case 'rival':
          if (requirement.value === 'chosen') {
            const rivalChallenge = userProgress?.chapters?.[2]?.challenges?.['ch2-rival-selection'];
            requirementMet = rivalChallenge?.isCompleted;
          }
          break;
        case 'level':
          const userLevel = getLevelFromXP(userProgress?.xp || 0);
          requirementMet = userLevel >= requirement.value;
          break;
        case 'previousChapter':
          const prevChapter = userProgress?.chapters?.[requirement.value];
          requirementMet = prevChapter?.isCompleted;
          break;
        case 'challenge':
          // Check if a specific challenge is completed
          // requirement.value should be the challenge ID (e.g., 'ch2-team-trial')
          const requiredChallengeId = requirement.value;
          // Find which chapter contains this challenge
          let challengeFound = false;
          for (const chapterId in userProgress?.chapters || {}) {
            const chapterChallenges = userProgress?.chapters?.[chapterId]?.challenges || {};
            if (chapterChallenges[requiredChallengeId]) {
              const requiredChallenge = chapterChallenges[requiredChallengeId];
              requirementMet = requiredChallenge?.isCompleted || requiredChallenge?.status === 'approved';
              challengeFound = true;
              break;
            }
          }
          if (!challengeFound) {
            requirementMet = false;
          }
          break;
      }
      
      if (!requirementMet) {
        return false;
      }
    }
    
    return true;
  };

  // Function to find the next available challenge
  const findNextChallenge = (userProgress: any) => {
    if (!userProgress?.chapters) return null;

    // Find the first active chapter
    const activeChapter = CHAPTERS.find(chapter => 
      userProgress.chapters[chapter.id]?.isActive
    );

    if (!activeChapter) return null;

    // Find the first unlocked but not completed challenge in the active chapter
    for (const challenge of activeChapter.challenges) {
      const challengeProgress = userProgress.chapters[activeChapter.id]?.challenges?.[challenge.id];
      
      // Skip if already completed
      if (challengeProgress?.isCompleted) {
        continue;
      }

      // Check if challenge is unlocked
      if (isChallengeUnlocked(challenge, userProgress)) {
        return {
          ...challenge,
          chapter: activeChapter
        };
      }
    }

    return null;
  };

  const fetchUserData = async () => {
    if (!currentUser) return;
    
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
    
    try {
      // Fetch from both collections
      const studentsRef = doc(db, 'students', currentUser.uid);
      const usersRef = doc(db, 'users', currentUser.uid);
      
      const [studentsSnap, usersSnap] = await Promise.all([
        getDoc(studentsRef),
        getDoc(usersRef)
      ]);
      
      if (studentsSnap.exists()) {
        const userDataFromDB = studentsSnap.data();
        
        // Migrate rarity from old default (3) to new default (1)
        let rarityValue = userDataFromDB.rarity;
        if (rarityValue === 3 || rarityValue === undefined) {
          rarityValue = 1;
          // Update the database with the new rarity value
          const userRef = doc(db, 'students', currentUser.uid);
          updateDoc(userRef, { rarity: 1 }).catch(error => {
            if (isFirestoreInternalError(error)) {
              console.warn('Profile: Firestore internal assertion error during rarity update - ignoring');
              return;
            }
            console.error('Error updating rarity:', error);
          });
        }
        
        // Get artifacts from users collection
        let artifacts = [];
        if (usersSnap.exists()) {
          try {
            const usersData = usersSnap.data();
            artifacts = usersData.artifacts || [];
            console.log('Profile: Loaded artifacts from users collection:', artifacts);
          } catch (artifactError) {
            if (isFirestoreInternalError(artifactError)) {
              console.warn('Profile: Firestore internal assertion error when reading artifacts - using empty array');
              artifacts = [];
            } else {
              console.error('Profile: Error reading artifacts:', artifactError);
              artifacts = [];
            }
          }
        }
        
        // Merge students data with users artifacts and chapters
        const mergedUserData = {
          ...userDataFromDB,
          artifacts: artifacts,
          chapters: usersSnap.exists() ? usersSnap.data().chapters : userDataFromDB.chapters
        };
        
        // Determine element: prioritize chosen_element from artifacts (in students collection), then elementalAffinity, then manifestationType
        // Check both students collection artifacts and the direct field
        const chosenElement = userDataFromDB.artifacts?.chosen_element || 
                              userDataFromDB.elementalAffinity || 
                              userDataFromDB.manifestationType || 
                              'Fire';
        // Capitalize the first letter for display
        const displayElement = chosenElement.charAt(0).toUpperCase() + chosenElement.slice(1);
        
        setUserData(mergedUserData);
        setDisplayName(userDataFromDB.displayName || currentUser.displayName || '');
        setBio(userDataFromDB.bio || '');
        setManifest(userDataFromDB.manifest || 'None');
        setStyle(displayElement);
        setRarity(rarityValue);
        setCardBgColor(userDataFromDB.cardBgColor || '#e0e7ff');
        // Validate cardFrameShape to ensure it's either 'circular' or 'rectangular'
        const frameShape = userDataFromDB.cardFrameShape;
        setCardFrameShape(
          frameShape === 'circular' || frameShape === 'rectangular' 
            ? frameShape 
            : 'circular'
        );
        setCardBorderColor(userDataFromDB.cardBorderColor || '#a78bfa');
        setCardImageBorderColor(userDataFromDB.cardImageBorderColor || '#a78bfa');
        setMoves(userDataFromDB.moves || []);
        setBadges(userDataFromDB.badges || []);
        
        // Find the next available challenge
        const nextChallengeData = findNextChallenge(mergedUserData);
        setNextChallenge(nextChallengeData);
        
        // Load manifest data
        const manifestData = studentsSnap.data().manifest;
        if (manifestData) {
          // Convert Firestore timestamp to Date if needed
          const processedManifest = {
            ...manifestData,
            lastAscension: manifestData.lastAscension?.toDate ? 
              manifestData.lastAscension.toDate() : 
              new Date(manifestData.lastAscension)
          };
          setPlayerManifest(processedManifest);
        } else {
          // No manifest found - automatically show selection
          setShowManifestSelection(true);
        }
        
        // Fetch squad abbreviation
        const abbreviation = await getUserSquadAbbreviation(currentUser.uid);
        setSquadAbbreviation(abbreviation);
        
        // Fetch rivals
        const rivalsData = await getRivals(currentUser.uid);
        setRivals(rivalsData);
      } else {
        // Create user document if it doesn't exist
        setUserData({ xp: 0, powerPoints: 0, truthMetal: 0, challenges: {}, level: 1, rarity: 1, artifacts: [] });
      }
    } catch (error) {
      if (isFirestoreInternalError(error)) {
        console.warn('Profile: Firestore internal assertion error when fetching user data - ignoring');
        // Still set loading to false so UI doesn't hang
        setLoading(false);
        return;
      }
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load and update PP boost status
  useEffect(() => {
    if (!currentUser) return;
    
    const loadPPBoostStatus = async () => {
      try {
        const activeBoost = await getActivePPBoost(currentUser.uid);
        const status = getPPBoostStatus(activeBoost);
        setPpBoostStatus(status);
      } catch (error) {
        console.error('Error loading PP boost status:', error);
      }
    };
    
    loadPPBoostStatus();
    
    // Update countdown every second for real-time display
    const interval = setInterval(() => {
      loadPPBoostStatus();
    }, 1000); // Update every second
    
    return () => clearInterval(interval);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    const userId = currentUser.uid; // Store in variable for TypeScript
    fetchUserData();
    
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

      // Set up real-time listener for rivals in users collection
      // Use getRivals to fetch latest displayNames
      const usersRef = doc(db, 'users', userId);
      const unsubscribeRivals = onSnapshot(usersRef, async (docSnapshot) => {
        try {
          if (docSnapshot.exists()) {
            // Use getRivals to fetch latest displayNames from Firestore
            const rivalsData = await getRivals(userId);
            setRivals(rivalsData);
          }
        } catch (error) {
          console.error('Error updating rivals from real-time listener:', error);
        }
      });

    // Set up real-time listener for manifest and element updates
    const studentsRef = doc(db, 'students', userId);
    const unsubscribe = onSnapshot(studentsRef, (docSnapshot) => {
      try {
        if (docSnapshot.exists()) {
          const userData = docSnapshot.data();
          const manifestData = userData.manifest;
          if (manifestData) {
            // Convert Firestore timestamp to Date if needed
            const processedManifest = {
              ...manifestData,
              lastAscension: manifestData.lastAscension?.toDate ? 
                manifestData.lastAscension.toDate() : 
                (manifestData.lastAscension ? new Date(manifestData.lastAscension) : new Date())
            };
            console.log('Profile: Manifest updated via real-time listener:', processedManifest);
            setPlayerManifest(processedManifest);
          }
          
          // Update element if it changed
          const chosenElement = userData.artifacts?.chosen_element || 
                                userData.elementalAffinity || 
                                userData.manifestationType || 
                                'Fire';
          const displayElement = chosenElement.charAt(0).toUpperCase() + chosenElement.slice(1);
          setStyle(displayElement);
        }
      } catch (error) {
        if (isFirestoreInternalError(error)) {
          return; // Ignore Firestore internal errors
        }
        console.error('Profile: Error processing manifest snapshot:', error);
      }
    }, (error) => {
      if (isFirestoreInternalError(error)) {
        return; // Ignore Firestore internal errors
      }
      console.error('Profile: Error listening to manifest updates:', error);
    });
    
    return () => {
      unsubscribe();
      unsubscribeRivals();
    };
  }, [currentUser, navigate]);

  // Handle query parameters for skill tree view
  const [searchParams] = useSearchParams();
  const skillTreeView = searchParams.get('view');
  const skillTreeModeParam = searchParams.get('mode');

  useEffect(() => {
    // If query params indicate skill tree view, show it
    if (skillTreeView === 'skill-tree') {
      setIsSkillTreeShowing(true);
    }
  }, [skillTreeView]);

  // Ensure RR Candy moves are added to Firestore when skill tree is shown
  useEffect(() => {
    if (!isSkillTreeShowing || !currentUser || !userData) return;

    const ensureRRCandyMoves = async () => {
      try {
        const chapter2 = userData?.chapters?.[2] || userData?.chapters?.['2'];
        const challenge = chapter2?.challenges?.['ep2-its-all-a-game'];
        const candyType = challenge?.candyChoice;
        const isCompleted = challenge?.isCompleted || challenge?.status === 'approved';
        
        if (!isCompleted || !candyType) return;

        // Check if moves are in Firestore
        const movesRef = doc(db, 'battleMoves', currentUser.uid);
        const movesDoc = await getDoc(movesRef);
        const existingMoves = movesDoc.exists() ? (movesDoc.data().moves || []) : [];
        const hasRRCandyMoves = existingMoves.some((m: any) => m.id?.startsWith('rr-candy-'));
        
        if (!hasRRCandyMoves) {
          // Add RR Candy moves to Firestore
          const rrCandyMoves = getRRCandyMoves(candyType);
          const updatedMoves = [...existingMoves, ...rrCandyMoves];
          
          if (movesDoc.exists()) {
            await updateDoc(movesRef, { moves: updatedMoves });
          } else {
            await setDoc(movesRef, { moves: updatedMoves });
          }
          
          // Refresh moves from context
          if (refreshVaultData) {
            await refreshVaultData();
          }
        }
      } catch (error) {
        console.error('Error ensuring RR Candy moves:', error);
      }
    };

    ensureRRCandyMoves();
  }, [isSkillTreeShowing, currentUser, userData, refreshVaultData]);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !currentUser) {
      console.log('No file selected or no user');
      return;
    }

    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size too large. Please select an image smaller than 5MB.');
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, GIF, etc.)');
      return;
    }

    console.log('Starting upload for file:', file.name, 'Size:', file.size, 'Type:', file.type);
    setUploading(true);
    
    try {
      // Add timestamp to filename to avoid conflicts
      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop() || 'jpg';
      const fileName = `avatar_${timestamp}.${fileExtension}`;
      
      const storageRef = ref(storage, `profile_pictures/${currentUser.uid}/${fileName}`);
      console.log('Uploading to storage reference:', storageRef.fullPath);
      
      // Upload with metadata
      const uploadResult = await uploadBytes(storageRef, file, {
        contentType: file.type,
        customMetadata: {
          uploadedBy: currentUser.uid,
          uploadedAt: new Date().toISOString()
        }
      });
      console.log('Upload successful:', uploadResult);
      
      const downloadURL = await getDownloadURL(storageRef);
      console.log('Download URL:', downloadURL);
      
      // Update Firebase Auth profile
      await updateProfile(currentUser, { photoURL: downloadURL });
      console.log('Firebase Auth profile updated');
      
      // Update Firestore
      const userRef = doc(db, 'students', currentUser.uid);
      await updateDoc(userRef, { photoURL: downloadURL });
      console.log('Firestore updated');
      
      // Update local state instead of reloading
      setUserData((prev: any) => ({ ...prev, photoURL: downloadURL }));
      
      // Force a small delay to ensure state updates, then show success
      setTimeout(() => {
        alert('Avatar updated successfully! If you have a display name set, the "Update Your Profile" challenge will be automatically completed.');
      }, 100);
      
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      console.error('Error code:', error.code);
      console.error('Error details:', error.details);
      
      let errorMessage = 'Upload failed: ';
      if (error.code === 'storage/unauthorized') {
        errorMessage += 'You are not authorized to upload files. Please make sure you are logged in.';
      } else if (error.code === 'storage/canceled') {
        errorMessage += 'Upload was canceled.';
      } else if (error.code === 'storage/unknown') {
        errorMessage += 'An unknown error occurred. This might be a network issue or server problem. Please try again.';
      } else if (error.code === 'storage/invalid-format') {
        errorMessage += 'Invalid file format. Please select a valid image file.';
      } else if (error.code === 'storage/invalid-checksum') {
        errorMessage += 'File corruption detected. Please try uploading the file again.';
      } else {
        errorMessage += error.message || 'Unknown error occurred';
      }
      
      alert(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!currentUser) {
      alert('❌ Error: No user logged in. Please log in and try again.');
      return;
    }

    try {
      setUploading(true);
      
      // Get fresh auth user reference to avoid stale user object issues
      const auth = getAuth();
      const authUser = auth.currentUser;
      
      // Update Firebase Auth profile (only if we have a valid auth user and display name)
      if (authUser && displayName && displayName.trim() !== '') {
        try {
          await updateProfile(authUser, { displayName });
        } catch (authError) {
          // If auth update fails, log but continue with Firestore update
          console.warn('Failed to update Firebase Auth profile:', authError);
        }
      }
      
      // Prepare update data
      const updateData: any = {
        displayName: displayName || currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
        bio: bio || '',
        manifest: manifest || 'None',
        manifestationType: style || 'Fire', // Save style as manifestationType to keep it consistent
        rarity: rarity || 1,
        cardBgColor: cardBgColor || '#e0e7ff',
        cardFrameShape: cardFrameShape || 'circular',
        cardBorderColor: cardBorderColor || '#a78bfa',
        cardImageBorderColor: cardImageBorderColor || '#a78bfa',
        moves: moves || [],
        updatedAt: new Date()
      };
      
      // Update both Firestore collections to keep them in sync
      const studentRef = doc(db, 'students', currentUser.uid);
      const userRef = doc(db, 'users', currentUser.uid);
      
      // Update students collection
      await updateDoc(studentRef, updateData);
      
      // Update users collection
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        await updateDoc(userRef, updateData);
      } else {
        // Create user document if it doesn't exist
        await setDoc(userRef, {
          ...updateData,
          email: currentUser.email || '',
          photoURL: currentUser.photoURL || null,
          createdAt: new Date()
        });
      }
      
      // Update local state
      setEditing(false);
      setUserData((prev: any) => ({ 
        ...prev, 
        displayName: updateData.displayName, 
        bio: updateData.bio, 
        manifest: updateData.manifest, 
        manifestationType: updateData.manifestationType, 
        rarity: updateData.rarity, 
        cardBgColor: updateData.cardBgColor, 
        cardFrameShape: updateData.cardFrameShape, 
        cardBorderColor: updateData.cardBorderColor, 
        cardImageBorderColor: updateData.cardImageBorderColor, 
        moves: updateData.moves 
      }));
      
      // Refresh user data from Firestore to ensure UI is up to date
      const refreshedStudentDoc = await getDoc(studentRef);
      if (refreshedStudentDoc.exists()) {
        const refreshedData = refreshedStudentDoc.data();
        setUserData((prev: any) => ({ ...prev, ...refreshedData }));
      }
      
      // Check if profile is now complete for auto-completion
      const hasDisplayName = displayName && displayName.trim() !== '';
      const hasAvatar = userData?.photoURL && userData.photoURL.trim() !== '';
      
      if (hasDisplayName && hasAvatar) {
        alert('✅ Profile updated successfully! If you have Chapter 1 active, the "Update Your Profile" challenge will be automatically completed.');
      } else {
        alert('✅ Profile updated successfully! Complete your profile with a display name and avatar to auto-complete the profile challenge.');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      alert(`❌ Error updating profile: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`);
    } finally {
      setUploading(false);
    }
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
      veil: 'Fear of inadequacy', // Default veil
      signatureMove: manifest.signatureMove,
      unlockedLevels: [1],
      lastAscension: serverTimestamp()
    };

    try {
      const userRef = doc(db, 'students', currentUser.uid);
      await updateDoc(userRef, { manifest: newPlayerManifest });
      setPlayerManifest(newPlayerManifest);
      setUserData((prev: any) => ({ ...prev, manifest: newPlayerManifest }));
      setShowManifestSelection(false);
    } catch (error) {
      console.error('Error setting manifest:', error);
      alert('Failed to set manifest. Please try again.');
    }
  };

  const handleVeilBreak = async (veilId: string) => {
    if (!currentUser || !playerManifest) return;

    // Simple veil breaking logic - could be expanded
    const newVeil = 'Need for validation'; // Next veil
    const updatedManifest = {
      ...playerManifest,
      veil: newVeil
    };

    try {
      const userRef = doc(db, 'students', currentUser.uid);
      await updateDoc(userRef, { manifest: updatedManifest });
      setPlayerManifest(updatedManifest);
      alert('Veil broken! New challenge awaits.');
    } catch (error) {
      console.error('Error breaking veil:', error);
      alert('Failed to break veil. Please try again.');
    }
  };

  // Helper function to check if an artifact is a UXP credit artifact
  // UXP credits require admin approval before being applied to assignments
  const isUXPArtifact = (artifact: any): boolean => {
    if (!artifact) return false;
    const name = artifact.name || '';
    const id = artifact.id || '';
    // Check by name (contains "UXP") or by ID (starts with "uxp-credit")
    return name.includes('UXP') || id.startsWith('uxp-credit');
  };

  // Function to handle admin approval/rejection of UXP artifacts
  // UXP credits are ONLY applied after admin approval - they are marked as "pending" when used
  const handleAdminResponse = async (artifactName: string, approved: boolean) => {
    if (!currentUser) return;
    
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const updatedArtifacts = Array.isArray(userData?.artifacts) ? userData.artifacts.map((artifact: any) => {
          if (artifact.name === artifactName && artifact.pending) {
            if (approved) {
              // Mark as used and remove from inventory
              return { ...artifact, used: true, pending: false, approvedAt: new Date() };
            } else {
              // Reject - remove pending status
              return { ...artifact, pending: false, rejectedAt: new Date() };
            }
          }
          return artifact;
        }) : [];
        
        await updateDoc(userRef, {
          artifacts: updatedArtifacts
        });
        
        // If approved, also remove from students inventory
        if (approved) {
          const studentsRef = doc(db, 'students', currentUser.uid);
          const studentsSnap = await getDoc(studentsRef);
          if (studentsSnap.exists()) {
            const studentsData = studentsSnap.data();
            const currentInventory = studentsData.inventory || [];
            const updatedInventory = currentInventory.filter((item: string) => item !== artifactName);
            
            await updateDoc(studentsRef, {
              inventory: updatedInventory
            });
          }
        }
        
        // Refresh user data
        const updatedUserSnap = await getDoc(userRef);
        if (updatedUserSnap.exists()) {
          const updatedUserData = updatedUserSnap.data();
          setUserData(updatedUserData);
        }
        
        console.log(`✅ UXP artifact ${approved ? 'approved' : 'rejected'}:`, artifactName);
      }
    } catch (error) {
      console.error('Error handling admin response:', error);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center' }}>
        <p>Loading profile...</p>
      </div>
    );
  }

  if (!currentUser) {
    return null;
  }

  const level = userData ? getLevelFromXP(userData.xp || 0) : 1;
  const avatarUrl = userData?.photoURL || currentUser.photoURL || `https://ui-avatars.com/api/?name=${currentUser.displayName || currentUser.email}&background=4f46e5&color=fff&size=128`;
  
  // Debug logging for avatar URL
  console.log('Profile: Avatar URL debug:', {
    userDataPhotoURL: userData?.photoURL,
    currentUserPhotoURL: currentUser.photoURL,
    finalAvatarUrl: avatarUrl,
    displayName: displayName || currentUser.displayName,
    email: currentUser.email
  });

  // Get the current manifest name from playerManifest state
  const currentManifest = playerManifest ? 
    MANIFESTS.find(m => m.id === playerManifest.manifestId)?.name || 'None' : 
    'None';

  // Helper function to convert rarity number to stars
  const getRarityStars = (rarityLevel: number) => {
    return Array.from({ length: rarityLevel }, (_, i) => (
      <span key={i} style={{ color: '#fbbf24', fontSize: '16px' }}>★</span>
    ));
  };

  // Add the same items array as in Marketplace for reference
  const items = [
    { name: 'Sleep - In 30 min', image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=facearea&w=256&h=256&facepad=2' },
    { name: 'Sleep - In 1 hr', image: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=facearea&w=256&h=256&facepad=2' },
    { name: 'Shield', image: 'https://images.unsplash.com/photo-1465101046530-73398c7f28ca?auto=format&fit=facearea&w=256&h=256&facepad=2' },
    { name: 'Lunch Extension (+15)', image: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?auto=format&fit=facearea&w=256&h=256&facepad=2' },
  ];

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <h1 style={{
        fontSize: '1.875rem',
        fontWeight: 'bold',
        marginBottom: '1.5rem',
        textAlign: 'center'
      }}>
        Your Profile
      </h1>
      
      {/* Two-column layout: Left (Player Card + Journey) and Right (Profile Settings) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '2rem', marginBottom: '2rem' }}>
        {/* Left Column - Player Card */}
        <div>
          {/* Player Card on top */}
          <div style={{ marginBottom: '2rem' }}>
            <PlayerCard
              key={`${userData?.photoURL}-${displayName}`} // Force re-render when avatar or name changes
              name={displayName || currentUser.displayName || currentUser.email?.split('@')[0] || 'User'}
              photoURL={userData?.photoURL || currentUser.photoURL || avatarUrl}
              powerPoints={userData?.powerPoints || 0}
              truthMetal={userData?.truthMetal || 0}
              manifest={currentManifest}
              level={level}
              rarity={rarity}
              style={style}
              description={bio}
              cardBgColor={cardBgColor}
              cardFrameShape={cardFrameShape}
              cardBorderColor={cardBorderColor}
              cardImageBorderColor={cardImageBorderColor}
              moves={moves}
              badges={badges}
              xp={userData?.xp || 0}
              userId={currentUser?.uid}
              onManifestReselect={() => setShowManifestSelection(true)}
              ordinaryWorld={userData?.ordinaryWorld}
              squadAbbreviation={squadAbbreviation}
              hasSkillTreeAccess={!!userData?.chapters?.[2]?.challenges?.['ep2-its-all-a-game']?.isCompleted}
              candyType={userData?.chapters?.[2]?.challenges?.['ep2-its-all-a-game']?.candyChoice || 'on-off'} // Get from challenge data or default to on-off
              onSkillTreeToggle={setIsSkillTreeShowing}
              initialSkillTreeMode={(skillTreeModeParam === 'irl' ? 'irl' : 'in-game') as 'in-game' | 'irl'}
            />
          </div>
        </div>

        {/* Right Column - Profile Settings or Skill Tree Settings */}
        <div>
          {isSkillTreeShowing ? (
            /* Skill Tree Settings */
            <div className="skill-tree-settings" style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '2rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', border: '1px solid #e5e7eb', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#10b981' }}>
                🌳 Skill Tree Settings
              </h2>
              
              {/* RR Candy Moves Management */}
              <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#1f2937' }}>
                  RR Candy Abilities
                </h3>
                
                {/* Get RR Candy moves - generate if not in battleMoves */}
                {(() => {
                  // Check if user has completed Chapter 2-4 - try multiple paths
                  const chapter2 = userData?.chapters?.[2] || userData?.chapters?.['2'];
                  const challenge = chapter2?.challenges?.['ep2-its-all-a-game'];
                  const candyType = challenge?.candyChoice || 'on-off'; // Default to 'on-off' if missing
                  const isCompleted = challenge?.isCompleted || challenge?.status === 'approved';
                  
                  // Debug logging
                  console.log('[Skill Tree Settings] Debug:', {
                    hasUserData: !!userData,
                    hasChapter2: !!chapter2,
                    hasChallenge: !!challenge,
                    challengeData: challenge,
                    candyType,
                    isCompleted,
                    battleMovesCount: battleMoves?.length || 0
                  });
                  
                  // Get RR Candy moves from battleMoves
                  let rrCandyMoves = (battleMoves || []).filter((move: any) => move.id?.startsWith('rr-candy-'));
                  console.log('[Skill Tree Settings] RR Candy moves found:', rrCandyMoves.length);
                  
                  // If no moves found but user has completed Chapter 2-4, generate them
                  if (rrCandyMoves.length === 0 && isCompleted) {
                    console.log('[Skill Tree Settings] Generating RR Candy moves for:', candyType);
                    const generatedMoves = getRRCandyMoves(candyType as 'on-off' | 'up-down' | 'config');
                    console.log('[Skill Tree Settings] Generated moves:', generatedMoves.length);
                    // Try to find matching moves in battleMoves by name, merge with generated data
                    rrCandyMoves = generatedMoves.map((genMove) => {
                      const existingMove = (battleMoves || []).find((m: any) => 
                        m.name === genMove.name || m.id === genMove.id
                      );
                      // If found, merge: use existing move data but ensure unlocked is true
                      if (existingMove) {
                        return { ...existingMove, unlocked: true };
                      }
                      // Otherwise use generated move
                      return genMove;
                    });
                    console.log('[Skill Tree Settings] Final RR Candy moves after generation:', rrCandyMoves.length);
                  }
                  
                  // If not completed, show unlock message
                  if (!isCompleted) {
                    return (
                      <div style={{
                        backgroundColor: '#f3f4f6',
                        borderRadius: '0.5rem',
                        padding: '2rem',
                        textAlign: 'center',
                        color: '#6b7280'
                      }}>
                        <p>No RR Candy abilities unlocked yet.</p>
                        <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                          Complete Chapter 2-4 to unlock your first RR Candy ability!
                        </p>
                      </div>
                    );
                  }
                  
                  // Render moves
                  return (
                    <>
                      {rrCandyMoves.map((move: any) => (
                        <div
                          key={move.id}
                          style={{
                            backgroundColor: '#f9fafb',
                            borderRadius: '0.5rem',
                            padding: '1rem',
                            marginBottom: '1rem',
                            border: '1px solid #e5e7eb'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                            <div>
                              <h4 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '0.25rem' }}>
                                {move.name}
                              </h4>
                              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                                {move.description}
                              </p>
                            </div>
                            <div style={{
                              backgroundColor: move.unlocked ? '#10b981' : '#9ca3af',
                              color: 'white',
                              padding: '0.25rem 0.75rem',
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: 'bold'
                            }}>
                              {move.unlocked ? 'Unlocked' : 'Locked'}
                            </div>
                          </div>
                          
                          {/* Move Stats */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem', fontSize: '0.875rem' }}>
                            <div>
                              <span style={{ color: '#6b7280' }}>Level:</span>{' '}
                              <span style={{ fontWeight: 'bold', color: '#1f2937' }}>{move.level}</span>
                            </div>
                            <div>
                              <span style={{ color: '#6b7280' }}>Mastery:</span>{' '}
                              <span style={{ fontWeight: 'bold', color: '#1f2937' }}>{move.masteryLevel}/5</span>
                            </div>
                            <div>
                              <span style={{ color: '#6b7280' }}>Cost:</span>{' '}
                              <span style={{ fontWeight: 'bold', color: '#1f2937' }}>
                                {move.id.startsWith('rr-candy-') ? '1 Move' : `${move.cost} PP`}
                              </span>
                            </div>
                            <div>
                              <span style={{ color: '#6b7280' }}>Cooldown:</span>{' '}
                              <span style={{ fontWeight: 'bold', color: '#1f2937' }}>{move.cooldown} turns</span>
                            </div>
                          </div>
                          
                          {/* Level Up Button */}
                          {move.unlocked && move.masteryLevel < 5 && (() => {
                            // Calculate upgrade cost - 1000 PP for first skill level-up
                            const nextLevel = move.masteryLevel + 1;
                            let upgradeCost = 1000; // 1000 PP for first skill level-up
                            if (nextLevel === 3) {
                              upgradeCost = 200; // 200 PP
                            } else if (nextLevel === 4) {
                              upgradeCost = 400; // 400 PP
                            } else if (nextLevel === 5) {
                              upgradeCost = 800; // 800 PP
                            }
                            
                            const hasEnoughPP = vault && vault.currentPP >= upgradeCost;
                            
                            return (
                              <button
                                onClick={async () => {
                                  if (upgradeMove && hasEnoughPP) {
                                    try {
                                      await upgradeMove(move.id);
                                      // Refresh user data to show updated moves
                                      if (currentUser?.uid) {
                                        const userRef = doc(db, 'users', currentUser.uid);
                                        const userDoc = await getDoc(userRef);
                                        if (userDoc.exists()) {
                                          setUserData(userDoc.data());
                                        }
                                      }
                                      // Refresh vault data to update PP
                                      if (refreshVaultData) {
                                        await refreshVaultData();
                                      }
                                    } catch (error) {
                                      console.error('Error upgrading move:', error);
                                      alert('Failed to upgrade ability. Please try again.');
                                    }
                                  } else if (!hasEnoughPP) {
                                    alert(`Not enough PP. Need ${upgradeCost} PP to upgrade.`);
                                  }
                                }}
                                disabled={!hasEnoughPP}
                                style={{
                                  backgroundColor: hasEnoughPP ? '#10b981' : '#9ca3af',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '0.375rem',
                                  padding: '0.5rem 1rem',
                                  fontSize: '0.875rem',
                                  fontWeight: 'bold',
                                  cursor: hasEnoughPP ? 'pointer' : 'not-allowed',
                                  transition: 'all 0.2s ease',
                                  width: '100%',
                                  opacity: hasEnoughPP ? 1 : 0.7
                                }}
                                onMouseOver={(e) => {
                                  if (hasEnoughPP) {
                                    e.currentTarget.style.backgroundColor = '#059669';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                  }
                                }}
                                onMouseOut={(e) => {
                                  if (hasEnoughPP) {
                                    e.currentTarget.style.backgroundColor = '#10b981';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                  }
                                }}
                              >
                                ⬆️ Level Up (Cost: {upgradeCost} PP)
                                {!hasEnoughPP && ` - Need ${upgradeCost - (vault?.currentPP || 0)} more PP`}
                              </button>
                            );
                          })()}
                          
                          {/* Preview of next level stats */}
                          {move.unlocked && move.masteryLevel < 5 && (() => {
                            const nextLevel = move.masteryLevel + 1;
                            
                            // Calculate damage boost multiplier range based on next level
                            let minMultiplier: number;
                            let maxMultiplier: number;
                            
                            switch (nextLevel) {
                              case 2:
                                minMultiplier = 2.0;
                                maxMultiplier = 2.3;
                                break;
                              case 3:
                                minMultiplier = 1.25;
                                maxMultiplier = 1.5;
                                break;
                              case 4:
                                minMultiplier = 1.3;
                                maxMultiplier = 1.6;
                                break;
                              case 5:
                                minMultiplier = 2.0;
                                maxMultiplier = 2.5;
                                break;
                              default:
                                minMultiplier = 1.0;
                                maxMultiplier = 1.0;
                            }
                            
                            // Calculate preview stats
                            const currentDebuffStrength = move.debuffStrength || 0;
                            const currentShieldBoost = move.shieldBoost || 0;
                            
                            const minDebuffStrength = currentDebuffStrength > 0 ? Math.floor(currentDebuffStrength * minMultiplier) : 0;
                            const maxDebuffStrength = currentDebuffStrength > 0 ? Math.floor(currentDebuffStrength * maxMultiplier) : 0;
                            const minShieldBoost = currentShieldBoost > 0 ? Math.floor(currentShieldBoost * minMultiplier) : 0;
                            const maxShieldBoost = currentShieldBoost > 0 ? Math.floor(currentShieldBoost * maxMultiplier) : 0;
                            
                            // Calculate cooldown reduction (typically -1 per level, minimum 1)
                            const newCooldown = Math.max(1, (move.cooldown || 3) - 1);
                            
                            return (
                              <div style={{
                                backgroundColor: '#f0fdf4',
                                borderRadius: '0.375rem',
                                padding: '0.75rem',
                                marginTop: '0.75rem',
                                border: '1px solid #86efac'
                              }}>
                                <div style={{
                                  fontSize: '0.75rem',
                                  fontWeight: 'bold',
                                  color: '#166534',
                                  marginBottom: '0.5rem'
                                }}>
                                  📊 Preview: Level {nextLevel} Stats
                                </div>
                                
                                <div style={{
                                  display: 'grid',
                                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                                  gap: '0.5rem',
                                  fontSize: '0.75rem'
                                }}>
                                  <div>
                                    <span style={{ color: '#6b7280' }}>Mastery:</span>{' '}
                                    <span style={{ fontWeight: 'bold', color: '#166534' }}>{nextLevel}/5</span>
                                  </div>
                                  
                                  {currentDebuffStrength > 0 && (
                                    <div>
                                      <span style={{ color: '#6b7280' }}>Shield Removal:</span>{' '}
                                      <span style={{ fontWeight: 'bold', color: '#166534' }}>
                                        {minDebuffStrength}% - {maxDebuffStrength}%
                                      </span>
                                      <span style={{ color: '#10b981', fontSize: '0.7rem', marginLeft: '0.25rem' }}>
                                        (↑ {Math.floor((minMultiplier - 1) * 100)}% - {Math.floor((maxMultiplier - 1) * 100)}%)
                                      </span>
                                    </div>
                                  )}
                                  
                                  {currentShieldBoost > 0 && (
                                    <div>
                                      <span style={{ color: '#6b7280' }}>Shield Restoration:</span>{' '}
                                      <span style={{ fontWeight: 'bold', color: '#166534' }}>
                                        {minShieldBoost}% - {maxShieldBoost}%
                                      </span>
                                      <span style={{ color: '#10b981', fontSize: '0.7rem', marginLeft: '0.25rem' }}>
                                        (↑ {Math.floor((minMultiplier - 1) * 100)}% - {Math.floor((maxMultiplier - 1) * 100)}%)
                                      </span>
                                    </div>
                                  )}
                                  
                                  {(move.cooldown || 3) > 1 && (
                                    <div>
                                      <span style={{ color: '#6b7280' }}>Cooldown:</span>{' '}
                                      <span style={{ fontWeight: 'bold', color: '#166534' }}>{newCooldown} turns</span>
                                      <span style={{ color: '#10b981', fontSize: '0.7rem', marginLeft: '0.25rem' }}>
                                        (↓ -1)
                                      </span>
                                    </div>
                                  )}
                                </div>
                                
                                <div style={{
                                  fontSize: '0.7rem',
                                  color: '#6b7280',
                                  marginTop: '0.5rem',
                                  fontStyle: 'italic'
                                }}>
                                  * Stats shown are ranges. Actual values will be randomly determined on upgrade.
                                </div>
                              </div>
                            );
                          })()}
                          
                          {move.masteryLevel >= 5 && (
                            <div style={{
                              backgroundColor: '#fef3c7',
                              color: '#92400e',
                              padding: '0.5rem',
                              borderRadius: '0.375rem',
                              textAlign: 'center',
                              fontSize: '0.875rem',
                              fontWeight: 'bold'
                            }}>
                              ⭐ Max Level Reached
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  );
                })()}
              </div>
              
              {/* Skill Tree Info */}
              <div style={{
                backgroundColor: '#eff6ff',
                borderRadius: '0.5rem',
                padding: '1rem',
                border: '1px solid #bfdbfe',
                marginBottom: '1rem'
              }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#1e40af' }}>
                  💡 About Skill Trees
                </h4>
                <p style={{ fontSize: '0.875rem', color: '#1e40af', lineHeight: '1.5', marginBottom: '1rem' }}>
                  Level up your RR Candy abilities to increase their power and effectiveness. Each level increases the ability's impact and reduces cooldown time. Master abilities reach their maximum potential at Level 5.
                </p>
                <button
                  onClick={() => navigate('/battle#moves')}
                  style={{
                    backgroundColor: '#4f46e5',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.75rem 1.5rem',
                    fontSize: '0.875rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    width: '100%'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.backgroundColor = '#4338ca';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor = '#4f46e5';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  🎯 Manage / Upgrade RR Candy Skills in Skill Mastery
                </button>
              </div>
            </div>
          ) : (
            /* Profile Settings */
          <div className="profile-settings" style={{ backgroundColor: 'white', borderRadius: '0.75rem', padding: '2rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', border: '1px solid #e5e7eb', marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#4f46e5' }}>
              👤 Profile Settings
            </h2>
            <div className="profile-card" style={{ marginBottom: '2rem' }}>
              {/* User Info Section - Avatar, Name, and Bio */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.5rem', marginBottom: '2rem' }}>
                {/* Avatar Section */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <img
                    key={avatarUrl} // Force re-render when avatar changes
                    src={avatarUrl}
                    alt="Profile"
                    style={{ width: '120px', height: '120px', borderRadius: '50%', objectFit: 'cover', border: '4px solid #4f46e5' }}
                  />
                  <label style={{ position: 'absolute', bottom: '0', right: '0', backgroundColor: uploading ? '#9ca3af' : '#4f46e5', color: 'white', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: uploading ? 'not-allowed' : 'pointer', fontSize: '14px', opacity: uploading ? 0.7 : 1 }}>
                    {uploading ? '⏳' : '📷'}
                    <input type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} disabled={uploading} />
                  </label>
                </div>
                {/* User Info Edit Controls */}
                <div style={{ flex: 1 }}>
                  {editing ? (
                    <div>
                      <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} style={{ fontSize: '1.5rem', fontWeight: 'bold', border: '1px solid #d1d5db', borderRadius: '0.375rem', padding: '0.5rem', marginBottom: '0.5rem', width: '100%' }} placeholder="Display Name" />
                      <textarea value={bio} onChange={e => setBio(e.target.value)} style={{ border: '1px solid #d1d5db', borderRadius: '0.375rem', padding: '0.5rem', width: '100%', minHeight: '80px', resize: 'vertical' }} placeholder="Tell us about yourself..." />
                    </div>
                  ) : (
                    <div>
                      <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{displayName || currentUser.displayName || currentUser.email?.split('@')[0] || 'User'}</h2>
                      <p style={{ color: '#6b7280', marginBottom: '1rem' }}>{bio || 'No bio yet. Click edit to add one!'}</p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Rest of Profile Settings */}
              {editing ? (
                <div>
                    <div style={{ margin: '0.5rem 0' }}>
                      <span style={{ marginRight: 16 }}><b>Manifest:</b> <span style={{ color: getManifestColor(currentManifest), fontWeight: 'bold' }}>{currentManifest}</span></span>
                      <span style={{ marginRight: 16 }}><b>Element:</b> <span style={{ color: getElementColor(style), fontWeight: 'bold' }}>{style || 'None'}</span></span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <b>Rarity:</b> {getRarityStars(rarity)}
                      </span>
                    </div>
                    <div style={{ margin: '1rem 0' }}>
                      <label style={{ display: 'block', marginBottom: '1rem' }}><b>Card Customization:</b></label>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem' }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem' }}><b>Card Background Color:</b></label>
                          <div style={{ marginTop: 8 }}>
                            <SketchPicker color={cardBgColor} onChange={(color: any) => setCardBgColor(color.hex)} width="100%" />
                          </div>
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem' }}><b>Card Border Color:</b></label>
                          <div style={{ marginTop: 8 }}>
                            <SketchPicker color={cardBorderColor} onChange={(color: any) => setCardBorderColor(color.hex)} width="100%" />
                          </div>
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: '0.5rem' }}><b>Card Image Border Color:</b></label>
                          <div style={{ marginTop: 8 }}>
                            <SketchPicker color={cardImageBorderColor} onChange={(color: any) => setCardImageBorderColor(color.hex)} width="100%" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div style={{ margin: '1rem 0' }}>
                      <label><b>Card Image Frame Shape:</b></label>
                      <div style={{ marginTop: 8, display: 'flex', gap: '1rem' }}>
                        <button
                          onClick={() => setCardFrameShape('circular')}
                          style={{
                            backgroundColor: cardFrameShape === 'circular' ? '#4f46e5' : '#e5e7eb',
                            color: cardFrameShape === 'circular' ? 'white' : '#374151',
                            border: '2px solid',
                            borderColor: cardFrameShape === 'circular' ? '#4f46e5' : '#d1d5db',
                            borderRadius: '50%',
                            width: '60px',
                            height: '60px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.5rem',
                            fontWeight: 'bold',
                            transition: 'all 0.2s'
                          }}
                          title="Circular Frame"
                        >
                          ⭕
                        </button>
                        <button
                          onClick={() => setCardFrameShape('rectangular')}
                          style={{
                            backgroundColor: cardFrameShape === 'rectangular' ? '#4f46e5' : '#e5e7eb',
                            color: cardFrameShape === 'rectangular' ? 'white' : '#374151',
                            border: '2px solid',
                            borderColor: cardFrameShape === 'rectangular' ? '#4f46e5' : '#d1d5db',
                            borderRadius: '0.5rem',
                            width: '60px',
                            height: '60px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.5rem',
                            fontWeight: 'bold',
                            transition: 'all 0.2s'
                          }}
                          title="Rectangular Frame"
                        >
                          ▭
                        </button>
                      </div>
                      <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                        Current: {cardFrameShape === 'circular' ? 'Circular' : 'Rectangular'}
                      </div>
                    </div>
                    {level >= 3 && (
                      <div style={{ margin: '1.5rem 0' }}>
                        <label><b>Design Your Moves</b></label>
                        <div style={{ margin: '0.5rem 0' }}>
                          {moves.map((move: any, idx: number) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                              <span style={{ fontSize: 20 }}>{move.icon}</span>
                              <span style={{ fontWeight: 'bold' }}>{move.name}</span>
                              <span style={{ color: '#6b7280' }}>{move.description}</span>
                              <button onClick={() => setMoves(moves.filter((_: any, i: number) => i !== idx))} style={{ marginLeft: 8, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>Remove</button>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                          <input type="text" value={newMove.icon} onChange={e => setNewMove({ ...newMove, icon: e.target.value })} placeholder="Icon (e.g. ⚡)" style={{ width: 50 }} />
                          <input type="text" value={newMove.name} onChange={e => setNewMove({ ...newMove, name: e.target.value })} placeholder="Move Name" style={{ flex: 1 }} />
                          <input type="text" value={newMove.description} onChange={e => setNewMove({ ...newMove, description: e.target.value })} placeholder="Description" style={{ flex: 2 }} />
                          <button onClick={() => {
                            if (newMove.name && newMove.icon) {
                              setMoves([...moves, newMove]);
                              setNewMove({ name: '', description: '', icon: '' });
                            }
                          }} style={{ backgroundColor: '#4f46e5', color: 'white', border: 'none', borderRadius: 4, padding: '0.5rem 1rem', cursor: 'pointer' }}>Add</button>
                        </div>
                      </div>
                    )}
                    <div style={{ marginTop: '1rem' }}>
                      <button onClick={handleSaveProfile} style={{ backgroundColor: '#10b981', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', marginRight: '0.5rem', cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditing(false)} style={{ backgroundColor: '#6b7280', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>{displayName || currentUser.displayName || currentUser.email?.split('@')[0] || 'User'}</h2>
                    <p style={{ color: '#6b7280', marginBottom: '1rem' }}>{bio || 'No bio yet. Click edit to add one!'}</p>
                    <div style={{ margin: '0.5rem 0' }}>
                      <span style={{ marginRight: 16 }}><b>Manifest:</b> <span style={{ color: getManifestColor(currentManifest), fontWeight: 'bold' }}>{currentManifest}</span></span>
                      <span style={{ marginRight: 16 }}><b>Element:</b> <span style={{ color: getElementColor(style), fontWeight: 'bold' }}>{style || 'None'}</span></span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <b>Rarity:</b> {getRarityStars(rarity)}
                      </span>
                    </div>
                    {currentManifest !== 'None' && (
                      <div style={{ margin: '0.5rem 0' }}>
                        <button
                          onClick={() => setShowManifestSelection(true)}
                          style={{
                            backgroundColor: '#8b5cf6',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            borderRadius: '0.375rem',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: '500',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}
                        >
                          🔄 Re-select Manifest
                        </button>
                      </div>
                    )}
                    {/* Rivals Section */}
                    {(rivals.chosen || rivals.inbound) && (
                      <div style={{ 
                        margin: '0.5rem 0', 
                        padding: '0.75rem', 
                        backgroundColor: '#fef2f2', 
                        border: '1px solid #fecaca', 
                        borderRadius: '0.5rem',
                        borderLeft: '4px solid #dc2626'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '1.25rem' }}>⚔️</span>
                            <span style={{ fontWeight: 'bold', color: '#dc2626' }}>Rivals</span>
                          </div>
                          <button
                            onClick={() => setShowEditRivalModal(true)}
                            style={{
                              padding: '0.375rem 0.75rem',
                              backgroundColor: '#dc2626',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              fontWeight: '500'
                            }}
                          >
                            Edit Rival
                          </button>
                        </div>
                        {rivals.chosen && (
                          <div style={{ marginBottom: '0.5rem' }}>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                              Chosen Rival:
                            </div>
                            <div style={{ fontWeight: 'bold', color: '#1f2937' }}>
                              {rivals.chosen.displayName}
                            </div>
                          </div>
                        )}
                        {rivals.inbound && (
                          <div>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                              Inbound Rival:
                            </div>
                            <div style={{ fontWeight: 'bold', color: '#1f2937' }}>
                              {rivals.inbound.displayName}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {!(rivals.chosen || rivals.inbound) && (
                      <div style={{ 
                        margin: '0.5rem 0', 
                        padding: '0.75rem', 
                        backgroundColor: '#fef2f2', 
                        border: '1px solid #fecaca', 
                        borderRadius: '0.5rem',
                        borderLeft: '4px solid #dc2626'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                              <span style={{ fontSize: '1.25rem' }}>⚔️</span>
                              <span style={{ fontWeight: 'bold', color: '#dc2626' }}>No Rivals Set</span>
                            </div>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                              Set a rival to earn double rewards when you defeat them!
                            </div>
                          </div>
                          <button
                            onClick={() => setShowEditRivalModal(true)}
                            style={{
                              padding: '0.5rem 1rem',
                              backgroundColor: '#dc2626',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.375rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              fontWeight: '500'
                            }}
                          >
                            Set Rival
                          </button>
                        </div>
                      </div>
                    )}
                    <button onClick={() => setEditing(true)} style={{ backgroundColor: '#4f46e5', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer' }}>Edit Profile</button>
                  </div>
                )}
            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
              <div style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4f46e5' }}>{userData?.xp || 0}</div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Total XP</div>
              </div>
              <div style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4f46e5' }}>{level}</div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Level</div>
              </div>
              <div style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4f46e5' }}>{userData?.powerPoints || 0}</div>
                  {ppBoostStatus.isActive && (
                    <span 
                      style={{ 
                        fontSize: '1rem',
                        color: '#7c3aed',
                        fontWeight: 'bold',
                        textShadow: '0 0 2px rgba(124, 58, 237, 0.3)',
                        animation: 'pulse 2s infinite'
                      }}
                      title={`⚡ Double PP Boost Active! (${ppBoostStatus.timeRemaining} remaining)`}
                    >
                      ×2
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.75rem' }}>Power Points</div>
                {/* Want more PP? Button */}
                <button
                  onClick={() => setShowPPEarningModal(true)}
                  style={{
                    background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                    color: '#1f2937',
                    border: 'none',
                    borderRadius: '0.5rem',
                    padding: '0.5rem 1rem',
                    fontSize: '0.875rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(251, 191, 36, 0.3)',
                    transition: 'all 0.2s',
                    width: '100%',
                    marginTop: '0.5rem'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(251, 191, 36, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 8px rgba(251, 191, 36, 0.3)';
                  }}
                >
                  💰 Want more PP?
                </button>
              </div>
              <div style={{ 
                background: 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)', 
                padding: '1rem', 
                borderRadius: '0.5rem', 
                textAlign: 'center',
                border: '1px solid #4b5563',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
              }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#ffffff' }}>{Math.floor(userData?.truthMetal || 0)}</div>
                <div style={{ fontSize: '0.875rem', color: '#e5e7eb', fontWeight: '500' }}>Truth Metal Shards</div>
              </div>
              <div style={{ backgroundColor: '#f3f4f6', padding: '1rem', borderRadius: '0.5rem', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4f46e5' }}>{Object.values(userData?.challenges || {}).filter(Boolean).length}</div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Challenges Completed</div>
              </div>
            </div>
          </div>
        </div>
          )}
        </div>
      </div>

      {/* Artifacts and Manifest Progress Side by Side */}
      <div style={{ 
        display: 'flex', 
        gap: '2rem', 
        marginBottom: '2rem',
        alignItems: 'stretch' // Changed from flex-start to stretch for equal height
      }}>
        {/* Artifacts Section - Left Side with Vertical Scrolling */}
        <div style={{ 
          flex: '1', 
          backgroundColor: 'white', 
          borderRadius: '0.75rem', 
          padding: '2rem', 
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', 
          border: '1px solid #e5e7eb',
          maxHeight: '800px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexShrink: 0 }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4f46e5', margin: 0, lineHeight: '1.5rem' }}>🛒 Purchased Artifacts</h2>
              {Array.isArray(userData?.artifacts) && userData.artifacts.length > 0 && (
                <div style={{ 
                  background: '#f3f4f6', 
                  padding: '0.5rem 1rem', 
                  borderRadius: '1rem', 
                  fontSize: '0.875rem',
                  color: '#6b7280'
                }}>
                  {userData.artifacts.filter((a: any) => !a.used && !a.pending && !isEquippableArtifact(a)).length} Available • {userData.artifacts.filter((a: any) => a.pending).length} In Use • {userData.artifacts.filter((a: any) => a.used).length} Used
                </div>
              )}
            </div>
            
            {Array.isArray(userData?.artifacts) && userData.artifacts.length > 0 ? (
              <div>
              {/* Available Artifacts - 2 columns with vertical scroll (only consumable artifacts, equippable ones are on Artifacts page) */}
                {Array.isArray(userData?.artifacts) && userData.artifacts.filter((artifact: any) => !artifact.used && !isEquippableArtifact(artifact)).length > 0 && (
                  <div style={{ marginBottom: '2rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#1f2937' }}>
                      Available Artifacts ({userData.artifacts.filter((a: any) => !a.used && !isEquippableArtifact(a)).length})
                    </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                      {userData.artifacts.filter((artifact: any) => !artifact.used && !isEquippableArtifact(artifact)).map((artifact: any, index: number) => {
                        const enhancedArtifact = enhanceLegacyItem(artifact);
                        const getRarityColor = (rarity: string) => {
                          switch (rarity) {
                            case 'common': return '#6b7280';
                            case 'rare': return '#3b82f6';
                            case 'epic': return '#8b5cf6';
                            case 'legendary': return '#f59e0b';
                            default: return '#6b7280';
                          }
                        };

                        return (
                          <div key={`${enhancedArtifact.id || artifact}-${index}`} style={{ 
                            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', 
                            borderRadius: '0.75rem', 
                            padding: '1rem', 
                            textAlign: 'center', 
                            boxShadow: '0 2px 4px 0 rgba(0,0,0,0.1)', 
                            border: `2px solid ${getRarityColor(enhancedArtifact.rarity || 'common')}`,
                            transition: 'all 0.2s ease',
                            cursor: 'pointer'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 8px 0 rgba(0,0,0,0.15)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 4px 0 rgba(0,0,0,0.1)';
                          }}>
                            <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                              {enhancedArtifact.image ? (
                                <img 
                                  src={enhancedArtifact.image} 
                                  alt={enhancedArtifact.name || 'Artifact'} 
                                  style={{ 
                                    width: '100%', 
                                    height: '100px', 
                                    objectFit: 'cover', 
                                    borderRadius: '0.5rem',
                                    border: `1px solid ${getRarityColor(enhancedArtifact.rarity || 'common')}20`
                                  }} 
                                />
                              ) : (
                                <div style={{ 
                                  width: '100%', 
                                  height: '100px', 
                                  background: '#f3f4f6', 
                                  borderRadius: '0.5rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '2rem',
                                  color: '#9ca3af'
                                }}>
                                  {enhancedArtifact.icon || '📦'}
                                </div>
                              )}
                              {enhancedArtifact.rarity && (
                                <div style={{ 
                                  position: 'absolute',
                                  top: '0.5rem',
                                  right: '0.5rem',
                                  background: getRarityColor(enhancedArtifact.rarity),
                                  color: 'white',
                                  padding: '0.25rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.7rem',
                                  fontWeight: 'bold',
                                  textTransform: 'uppercase'
                                }}>
                                  {enhancedArtifact.rarity}
                                </div>
                              )}
                            </div>
                            
                            <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: '#1f2937', marginBottom: '0.25rem', lineHeight: '1.2' }}>
                              {enhancedArtifact.name || 'Unknown Item'}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.75rem', lineHeight: '1.3' }}>
                              {enhancedArtifact.description || 'No description available'}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginBottom: '0.75rem' }}>
                              {enhancedArtifact.purchasedAt ? new Date(enhancedArtifact.purchasedAt.seconds * 1000).toLocaleDateString() : (enhancedArtifact.isLegacy ? 'Legacy Item' : 'Unknown')}
                            </div>
                            
                            {/* PP Boost Countdown Display - Only show on the artifact that was actually used */}
                            {enhancedArtifact.name === 'Double PP Boost' && ppBoostStatus.isActive && artifact.used && (
                              <div style={{
                                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                                color: 'white',
                                padding: '0.5rem',
                                borderRadius: '0.375rem',
                                marginBottom: '0.75rem',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                textAlign: 'center',
                                boxShadow: '0 2px 4px rgba(251, 191, 36, 0.3)'
                              }}>
                                ⚡ Active: {ppBoostStatus.timeRemaining} remaining
                              </div>
                            )}
                            
                            <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                            <button 
                              style={{ 
                                backgroundColor: artifact.pending ? '#f59e0b' : '#4f46e5', 
                                color: 'white', 
                                border: 'none', 
                                borderRadius: '0.375rem', 
                                padding: '0.5rem 0.75rem', 
                                cursor: artifact.pending ? 'not-allowed' : 'pointer', 
                                fontWeight: 'bold',
                                fontSize: '0.8rem',
                                flex: 1,
                                transition: 'background-color 0.2s ease',
                                opacity: artifact.pending ? 0.7 : 1
                              }} 
                              onMouseEnter={(e) => {
                                if (!artifact.pending) {
                                  e.currentTarget.style.backgroundColor = '#3730a3';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!artifact.pending) {
                                  e.currentTarget.style.backgroundColor = '#4f46e5';
                                }
                              }}
                              disabled={artifact.pending}
                              onClick={async () => {
                                if (!currentUser) return;
                                
                                // Handle Instant A - show ERROR 1001 and don't consume the item
                                if (enhancedArtifact.name === 'Instant A') {
                                  const showError1001 = () => {
                                    const modal = document.createElement('div');
                                    modal.style.cssText = `
                                      position: fixed;
                                      top: 0;
                                      left: 0;
                                      right: 0;
                                      bottom: 0;
                                      background: rgba(0, 0, 0, 0.9);
                                      display: flex;
                                      align-items: center;
                                      justify-content: center;
                                      z-index: 10000;
                                      font-family: 'Courier New', monospace;
                                    `;
                                    
                                    const content = document.createElement('div');
                                    content.style.cssText = `
                                      background: #000;
                                      border: 2px solid #ff0000;
                                      padding: 2rem;
                                      border-radius: 0.5rem;
                                      color: #00ff00;
                                      text-align: center;
                                      box-shadow: 0 0 20px rgba(255, 0, 0, 0.5);
                                      max-width: 500px;
                                      position: relative;
                                    `;
                                    
                                    const errorTitle = document.createElement('div');
                                    errorTitle.style.cssText = `
                                      font-size: 1.5rem;
                                      color: #ff0000;
                                      margin-bottom: 1rem;
                                      font-weight: bold;
                                    `;
                                    errorTitle.textContent = 'ERROR 1001';
                                    
                                    const binaryText = document.createElement('pre');
                                    binaryText.style.cssText = `
                                      font-size: 1rem;
                                      color: #00ff00;
                                      margin: 1rem 0;
                                      white-space: pre;
                                      line-height: 1.2;
                                      text-align: center;
                                      font-family: 'Courier New', monospace;
                                    `;
                                    binaryText.textContent = `    0 1 0 1 0
  0 1     0 1     0 1
0 1         1         1 0
  0   0 0 0   0 0 0   0
    0         0`;
                                    
                                    const closeButton = document.createElement('button');
                                    closeButton.textContent = 'CLOSE';
                                    closeButton.style.cssText = `
                                      background: #ff0000;
                                      color: #000;
                                      border: none;
                                      padding: 0.5rem 1.5rem;
                                      border-radius: 0.25rem;
                                      cursor: pointer;
                                      font-weight: bold;
                                      margin-top: 1rem;
                                      font-family: 'Courier New', monospace;
                                    `;
                                    closeButton.onclick = () => document.body.removeChild(modal);
                                    
                                    content.appendChild(errorTitle);
                                    content.appendChild(binaryText);
                                    content.appendChild(closeButton);
                                    modal.appendChild(content);
                                    document.body.appendChild(modal);
                                  };
                                  
                                  showError1001();
                                  return;
                                }
                                
                                // Handle Shield artifact specifically
                                if (enhancedArtifact.name === 'Shield') {
                                  try {
                                    // Get current vault data
                                    const vaultRef = doc(db, 'vaults', currentUser.uid);
                                    const vaultSnap = await getDoc(vaultRef);
                                    
                                    if (vaultSnap.exists()) {
                                      const vaultData = vaultSnap.data();
                                      
                                      // Check if player already has an active overshield
                                      if ((vaultData.overshield || 0) > 0) {
                                        alert('You already have an active overshield! You can only have 1 overshield at a time.');
                                        return;
                                      }
                                      
                                      // Add overshield (absorbs next attack) - capped at 1
                                      await updateDoc(vaultRef, {
                                        overshield: 1
                                      });
                                      
                                      // Mark artifact as used
                                      const userRef = doc(db, 'users', currentUser.uid);
                                      const userSnap = await getDoc(userRef);
                                      if (userSnap.exists()) {
                                        const userData = userSnap.data();
                                        // Only mark ONE instance as used, not all of them
                                        let foundOne = false;
                                        const updatedArtifacts = Array.isArray(userData?.artifacts) ? userData.artifacts.map((artifact: any) => {
                                          if (foundOne) return artifact;
                                          
                                          // Handle both legacy artifacts (strings) and new artifacts (objects)
                                          if (typeof artifact === 'string') {
                                            // Legacy artifact stored as string - match by name
                                            if (artifact === enhancedArtifact.name) {
                                              foundOne = true;
                                              return { 
                                                id: enhancedArtifact.id,
                                                name: enhancedArtifact.name,
                                                description: enhancedArtifact.description,
                                                icon: enhancedArtifact.icon,
                                                image: enhancedArtifact.image,
                                                category: enhancedArtifact.category,
                                                rarity: enhancedArtifact.rarity,
                                                purchasedAt: null,
                                                used: true,
                                                isLegacy: true
                                              };
                                            }
                                            return artifact;
                                          } else {
                                            // New artifact stored as object - match by ID or name and check if not already used
                                            // Only mark as used if it's not already used (check for used property explicitly)
                                            const isNotUsed = artifact.used === false || artifact.used === undefined || artifact.used === null;
                                            if ((artifact.id === enhancedArtifact.id || artifact.name === enhancedArtifact.name) && isNotUsed) {
                                              foundOne = true;
                                              return { ...artifact, used: true };
                                            }
                                            return artifact;
                                          }
                                        }) : [];
                                        
                                        await updateDoc(userRef, {
                                          artifacts: updatedArtifacts
                                        });
                                        
                                        // Also update the students collection inventory to keep both in sync
                                        const studentsRef = doc(db, 'students', currentUser.uid);
                                        const studentsSnap = await getDoc(studentsRef);
                                        if (studentsSnap.exists()) {
                                        const studentsData = studentsSnap.data();
                                        const currentInventory = studentsData.inventory || [];
                                        // Remove only ONE instance of the artifact from inventory
                                        const artifactIndex = currentInventory.indexOf(enhancedArtifact.name);
                                        const updatedInventory = artifactIndex > -1 
                                          ? currentInventory.filter((item: string, index: number) => index !== artifactIndex)
                                          : currentInventory;
                                          
                                          await updateDoc(studentsRef, {
                                            inventory: updatedInventory
                                          });
                                          
                                          console.log('✅ Students inventory updated:', updatedInventory);
                                        }
                                        
                                        console.log('✅ Shield artifact marked as used:', updatedArtifacts);
                                      }
                                      
                                      // Force a refresh of the user data to update the UI
                                      // Trigger a re-fetch of user data
                                      const updatedUserSnap = await getDoc(userRef);
                                      if (updatedUserSnap.exists()) {
                                        const updatedUserData = updatedUserSnap.data();
                                        setUserData(updatedUserData);
                                      }
                                      
                                      alert('🛡️ Shield artifact activated! Your vault now has an overshield that will absorb the next attack.');
                                    } else {
                                      alert('Error: Vault not found. Please try again.');
                                    }
                                  } catch (error) {
                                    console.error('Error using Shield artifact:', error);
                                    alert('Error using Shield artifact. Please try again.');
                                  }
                                } else if (enhancedArtifact.name === 'Double PP Boost') {
                                  // Handle Double PP Boost - no admin approval needed
                                  try {
                                    const { activatePPBoost, getActivePPBoost, getPPBoostStatus } = await import('../utils/ppBoost');
                                    const success = await activatePPBoost(currentUser.uid, enhancedArtifact.name);
                                    if (success) {
                                      // Get the active boost to show countdown
                                      const activeBoost = await getActivePPBoost(currentUser.uid);
                                      const boostStatus = getPPBoostStatus(activeBoost);
                                      const timeRemaining = boostStatus.isActive ? boostStatus.timeRemaining : '4:00';
                                      alert(`⚡ Double PP Boost activated! You'll receive double PP for the next 4 hours!\n\nTime remaining: ${timeRemaining}`);
                                      
                                      // Mark only ONE artifact as used
                                      const userRef = doc(db, 'users', currentUser.uid);
                                      const userSnap = await getDoc(userRef);
                                      if (userSnap.exists()) {
                                        const userData = userSnap.data();
                                        const currentArtifacts = userData.artifacts || [];
                                        
                                        // Find the FIRST unused artifact with this name and mark only that one
                                        let foundOne = false;
                                        const updatedArtifacts = currentArtifacts.map((artifact: any) => {
                                          if (foundOne) return artifact;
                                          
                                          if (typeof artifact === 'string') {
                                            if (artifact === enhancedArtifact.name) {
                                              foundOne = true;
                                              return { 
                                                id: enhancedArtifact.id,
                                                name: enhancedArtifact.name,
                                                description: enhancedArtifact.description,
                                                icon: enhancedArtifact.icon,
                                                image: enhancedArtifact.image,
                                                category: enhancedArtifact.category,
                                                rarity: enhancedArtifact.rarity,
                                                purchasedAt: null,
                                                used: true,
                                                usedAt: new Date(),
                                                isLegacy: true
                                              };
                                            }
                                            return artifact;
                                          } else {
                                            // Only mark as used if it's not already used (check for used property explicitly)
                                            const isNotUsed = artifact.used === false || artifact.used === undefined || artifact.used === null;
                                            if ((artifact.id === enhancedArtifact.id || artifact.name === enhancedArtifact.name) && isNotUsed) {
                                              foundOne = true;
                                              return { ...artifact, used: true, usedAt: new Date() };
                                            }
                                            return artifact;
                                          }
                                        });
                                        
                                        await updateDoc(userRef, {
                                          artifacts: updatedArtifacts
                                        });
                                        
                                        // Remove ONE instance from students inventory
                                        const studentsRef = doc(db, 'students', currentUser.uid);
                                        const studentsSnap = await getDoc(studentsRef);
                                        if (studentsSnap.exists()) {
                                          const studentsData = studentsSnap.data();
                                          const currentInventory = studentsData.inventory || [];
                                          const artifactIndex = currentInventory.indexOf(enhancedArtifact.name);
                                          if (artifactIndex > -1) {
                                            const updatedInventory = [...currentInventory];
                                            updatedInventory.splice(artifactIndex, 1);
                                            await updateDoc(studentsRef, {
                                              inventory: updatedInventory
                                            });
                                          }
                                        }
                                        
                                        // Refresh user data
                                        const updatedUserSnap = await getDoc(userRef);
                                        if (updatedUserSnap.exists()) {
                                          setUserData(updatedUserSnap.data());
                                        }
                                      }
                                    } else {
                                      alert('Failed to activate PP boost. Please try again.');
                                    }
                                  } catch (error) {
                                    console.error('Error using Double PP Boost:', error);
                                    alert('Error using Double PP Boost. Please try again.');
                                  }
                                } else {
                                  // Handle other artifacts - use immediately without admin approval
                                  // Mark artifact as used directly
                                  const userRef = doc(db, 'users', currentUser.uid);
                                  const userSnap = await getDoc(userRef);
                                  if (userSnap.exists()) {
                                    const userData = userSnap.data();
                                    // Only mark ONE instance as used, not all of them
                                    let foundOne = false;
                                    const updatedArtifacts = Array.isArray(userData?.artifacts) ? userData.artifacts.map((artifact: any) => {
                                      if (foundOne) return artifact;
                                      
                                      if (typeof artifact === 'string') {
                                        if (artifact === enhancedArtifact.name) {
                                          foundOne = true;
                                          return { 
                                            id: enhancedArtifact.id,
                                            name: enhancedArtifact.name,
                                            description: enhancedArtifact.description,
                                            icon: enhancedArtifact.icon,
                                            image: enhancedArtifact.image,
                                            category: enhancedArtifact.category,
                                            rarity: enhancedArtifact.rarity,
                                            purchasedAt: null,
                                            used: true,
                                            isLegacy: true
                                          };
                                        }
                                        return artifact;
                                      } else {
                                        // Only mark as used if it's not already used (check for used property explicitly)
                                        const isNotUsed = artifact.used === false || artifact.used === undefined || artifact.used === null;
                                        if ((artifact.id === enhancedArtifact.id || artifact.name === enhancedArtifact.name) && isNotUsed) {
                                          foundOne = true;
                                          return { ...artifact, used: true, usedAt: new Date() };
                                        }
                                        return artifact;
                                      }
                                    }) : [];
                                    
                                    // CRITICAL: For UXP artifacts, mark as "pending" instead of "used"
                                    // UXP credits require admin approval before being applied to assignments
                                    // They are NOT applied automatically - they must be approved by an admin first
                                    const isUXPArtifactCheck = isUXPArtifact(enhancedArtifact);
                                    const artifactStatus = isUXPArtifactCheck ? 'pending' : 'used';
                                    
                                    const finalUpdatedArtifacts = updatedArtifacts.map((artifact: any) => {
                                      // Handle both legacy artifacts (strings) and new artifacts (objects)
                                      if (typeof artifact === 'string') {
                                        // Legacy artifact stored as string - match by name
                                        if (artifact === enhancedArtifact.name) {
                                          return { 
                                            id: enhancedArtifact.id,
                                            name: enhancedArtifact.name,
                                            description: enhancedArtifact.description,
                                            icon: enhancedArtifact.icon,
                                            image: enhancedArtifact.image,
                                            category: enhancedArtifact.category,
                                            rarity: enhancedArtifact.rarity,
                                            purchasedAt: null,
                                            used: artifactStatus === 'used',
                                            pending: artifactStatus === 'pending',
                                            submittedAt: new Date(),
                                            isLegacy: true
                                          };
                                        }
                                        return artifact;
                                      } else {
                                        // New artifact stored as object - match by ID or name
                                        if (artifact.id === enhancedArtifact.id || artifact.name === enhancedArtifact.name) {
                                          return { 
                                            ...artifact, 
                                            used: artifactStatus === 'used',
                                            pending: artifactStatus === 'pending',
                                            submittedAt: new Date()
                                          };
                                        }
                                        return artifact;
                                      }
                                    });
                                    
                                    await updateDoc(userRef, {
                                      artifacts: finalUpdatedArtifacts
                                    });
                                    
                                    // For UXP artifacts, don't remove from students inventory yet (wait for admin approval)
                                    // UXP credits are only removed from inventory after admin approval
                                    if (!isUXPArtifactCheck) {
                                      // Also update the students collection inventory for non-UXP artifacts
                                      const studentsRef = doc(db, 'students', currentUser.uid);
                                      const studentsSnap = await getDoc(studentsRef);
                                      if (studentsSnap.exists()) {
                                        const studentsData = studentsSnap.data();
                                        const currentInventory = studentsData.inventory || [];
                                        const updatedInventory = currentInventory.filter((item: string) => item !== enhancedArtifact.name);
                                        
                                        await updateDoc(studentsRef, {
                                          inventory: updatedInventory
                                        });
                                        
                                        console.log('✅ Students inventory updated for non-UXP artifact:', updatedInventory);
                                      }
                                    }
                                    
                                    console.log(`✅ Artifact marked as ${artifactStatus} for admin request:`, finalUpdatedArtifacts);
                                    
                                    // Show appropriate message based on artifact type
                                    if (isUXPArtifactCheck) {
                                      alert('Your UXP Credit request has been sent to the admin for approval. The credit will be applied to your assignment after approval.');
                                    } else {
                                      alert('Your request to use this artifact has been sent to the admin!');
                                    }
                                  }
                                }
                              }}
                            >
                              {artifact.pending ? 'In Use' : 'Use Artifact'}
                            </button>
                            
                            {/* Return Artifact Button */}
                            {(() => {
                              // Get the original price - check multiple sources
                              let artifactPrice = 0;
                              
                              // First, check if artifact object has price property
                              if (typeof artifact === 'object' && artifact.price) {
                                artifactPrice = artifact.price;
                              } 
                              // Second, check if enhanced artifact has price
                              else if (enhancedArtifact.price) {
                                artifactPrice = enhancedArtifact.price;
                              }
                              // Third, try to find price from marketplace items
                              else {
                                const marketplaceItem = marketplaceItems.find(mi => 
                                  mi.name === enhancedArtifact.name || mi.id === enhancedArtifact.id
                                );
                                if (marketplaceItem) {
                                  artifactPrice = marketplaceItem.price;
                                }
                              }
                              
                              // Only show return button if artifact has a price (was purchased from MST MKT)
                              if (artifactPrice > 0 && !artifact.used && !artifact.pending) {
                                const returnPrice = Math.floor(artifactPrice * 0.5);
                                
                                return (
                                  <button
                                    style={{
                                      backgroundColor: '#10b981',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '0.375rem',
                                      padding: '0.5rem 0.75rem',
                                      cursor: 'pointer',
                                      fontWeight: 'bold',
                                      fontSize: '0.8rem',
                                      flex: 1,
                                      transition: 'background-color 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.backgroundColor = '#059669';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.backgroundColor = '#10b981';
                                    }}
                                    onClick={async () => {
                                      if (!currentUser) return;
                                      
                                      if (!window.confirm(`Return ${enhancedArtifact.name} for ${returnPrice} PP (50% of original ${artifactPrice} PP)?`)) {
                                        return;
                                      }
                                      
                                      try {
                                        // Get current user data
                                        const userRef = doc(db, 'users', currentUser.uid);
                                        const userSnap = await getDoc(userRef);
                                        const studentsRef = doc(db, 'students', currentUser.uid);
                                        const studentsSnap = await getDoc(studentsRef);
                                        
                                        if (!userSnap.exists() || !studentsSnap.exists()) {
                                          alert('Error: User data not found.');
                                          return;
                                        }
                                        
                                        const userData = userSnap.data();
                                        const studentsData = studentsSnap.data();
                                        
                                        // Remove ONE instance of the artifact from users collection
                                        let foundOne = false;
                                        const updatedArtifacts = Array.isArray(userData?.artifacts) ? userData.artifacts.filter((art: any) => {
                                          if (foundOne) return true;
                                          
                                          if (typeof art === 'string') {
                                            if (art === enhancedArtifact.name) {
                                              foundOne = true;
                                              return false; // Remove this artifact
                                            }
                                            return true;
                                          } else {
                                            // Match by ID or name, and ensure it's not used
                                            const isNotUsed = art.used === false || art.used === undefined || art.used === null;
                                            if ((art.id === enhancedArtifact.id || art.name === enhancedArtifact.name) && isNotUsed) {
                                              foundOne = true;
                                              return false; // Remove this artifact
                                            }
                                            return true;
                                          }
                                        }) : [];
                                        
                                        // Remove ONE instance from students inventory
                                        const currentInventory = studentsData.inventory || [];
                                        const artifactIndex = currentInventory.indexOf(enhancedArtifact.name);
                                        const updatedInventory = artifactIndex > -1 
                                          ? currentInventory.filter((item: string, index: number) => index !== artifactIndex)
                                          : currentInventory;
                                        
                                        // Calculate new PP (add 50% of original price)
                                        const currentPP = studentsData.powerPoints || 0;
                                        const newPP = currentPP + returnPrice;
                                        
                                        console.log('[Profile] Returning artifact:', {
                                          artifactName: enhancedArtifact.name,
                                          currentPP,
                                          returnPrice,
                                          newPP
                                        });
                                        
                                        // Update both collections
                                        await updateDoc(userRef, {
                                          artifacts: updatedArtifacts
                                        });
                                        
                                        // Update students collection with new PP
                                        await updateDoc(studentsRef, {
                                          inventory: updatedInventory,
                                          powerPoints: newPP
                                        });
                                        
                                        // Also update vault directly to ensure consistency
                                        const vaultRef = doc(db, 'vaults', currentUser.uid);
                                        const vaultSnap = await getDoc(vaultRef);
                                        if (vaultSnap.exists()) {
                                          const vaultData = vaultSnap.data();
                                          const maxVaultHealth = vaultData.maxVaultHealth || Math.floor((vaultData.capacity || 1000) * 0.1);
                                          const correctVaultHealth = newPP >= maxVaultHealth
                                            ? maxVaultHealth
                                            : Math.min(newPP, maxVaultHealth);
                                          
                                          await updateDoc(vaultRef, {
                                            currentPP: newPP,
                                            vaultHealth: correctVaultHealth
                                          });
                                          
                                          console.log('[Profile] Updated vault:', {
                                            currentPP: newPP,
                                            vaultHealth: correctVaultHealth,
                                            maxVaultHealth
                                          });
                                        } else {
                                          console.error('[Profile] Vault not found for user:', currentUser.uid);
                                        }
                                        
                                        // Don't call syncVaultPP here - we've already updated both collections directly
                                        // Calling syncVaultPP might read stale data and overwrite our update
                                        
                                        // Refresh user data from both collections to ensure UI updates
                                        const updatedUserSnap = await getDoc(userRef);
                                        const updatedStudentsSnap = await getDoc(studentsRef);
                                        
                                        if (updatedUserSnap.exists() && updatedStudentsSnap.exists()) {
                                          const userData = updatedUserSnap.data();
                                          const studentsData = updatedStudentsSnap.data();
                                          
                                          // Merge the data to ensure we have the latest PP
                                          setUserData({
                                            ...userData,
                                            powerPoints: studentsData.powerPoints || 0,
                                            inventory: studentsData.inventory || []
                                          });
                                          
                                          console.log('[Profile] Refreshed user data after return:', {
                                            powerPoints: studentsData.powerPoints,
                                            inventory: studentsData.inventory
                                          });
                                        }
                                        
                                        alert(`✅ ${enhancedArtifact.name} returned! You received ${returnPrice} PP (50% of original ${artifactPrice} PP).`);
                                      } catch (error) {
                                        console.error('Error returning artifact:', error);
                                        alert('Error returning artifact. Please try again.');
                                      }
                                    }}
                                  >
                                    💰 Return ({returnPrice} PP)
                                  </button>
                                );
                              }
                              return null;
                            })()}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Used Artifacts */}
                {Array.isArray(userData?.artifacts) && userData.artifacts.filter((artifact: any) => artifact.used).length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#1f2937' }}>
                      Used Artifacts ({userData.artifacts.filter((a: any) => a.used).length})
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }}>
                      {userData.artifacts.filter((artifact: any) => artifact.used).map((artifact: any, index: number) => {
                        const enhancedArtifact = enhanceLegacyItem(artifact);
                        const getRarityColor = (rarity: string) => {
                          switch (rarity) {
                            case 'common': return '#6b7280';
                            case 'rare': return '#3b82f6';
                            case 'epic': return '#8b5cf6';
                            case 'legendary': return '#f59e0b';
                            default: return '#6b7280';
                          }
                        };

                        return (
                          <div key={`${enhancedArtifact.id || artifact.name || 'artifact'}-used-${index}`} style={{ 
                            background: '#f9fafb', 
                            borderRadius: '0.5rem', 
                            padding: '0.75rem', 
                            textAlign: 'center', 
                            border: '1px solid #e5e7eb',
                            opacity: 0.7
                          }}>
                            <div style={{ marginBottom: '0.5rem' }}>
                              {typeof artifact === 'object' && artifact.image ? (
                                <img 
                                  src={artifact.image} 
                                  alt={enhancedArtifact.name || 'Artifact'} 
                                  style={{ 
                                    width: '100%', 
                                    height: '60px', 
                                    objectFit: 'cover', 
                                    borderRadius: '0.25rem',
                                    filter: 'grayscale(100%)'
                                  }} 
                                />
                              ) : (
                                <div style={{ 
                                  width: '100%', 
                                  height: '60px', 
                                  background: '#e5e7eb', 
                                  borderRadius: '0.25rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '1.5rem',
                                  color: '#9ca3af'
                                }}>
                                  {typeof artifact === 'object' ? (artifact.icon || '📦') : '📦'}
                                </div>
                              )}
                            </div>
                            <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                              {enhancedArtifact.name || 'Unknown Item'}
                            </div>
                            
                            {/* PP Boost Countdown Display - Only show on the artifact that was actually used */}
                            {enhancedArtifact.name === 'Double PP Boost' && ppBoostStatus.isActive && artifact.used && (
                              <div style={{
                                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                                color: 'white',
                                padding: '0.5rem',
                                borderRadius: '0.375rem',
                                marginBottom: '0.5rem',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                textAlign: 'center',
                                boxShadow: '0 2px 4px rgba(251, 191, 36, 0.3)'
                              }}>
                                ⚡ Active: {ppBoostStatus.timeRemaining} remaining
                              </div>
                            )}
                            {typeof artifact === 'object' && artifact.rarity && (
                              <div style={{ 
                                fontSize: '0.7rem', 
                                color: getRarityColor(artifact.rarity), 
                                fontWeight: 'bold',
                                textTransform: 'uppercase'
                              }}>
                                {artifact.rarity}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ 
                textAlign: 'center', 
                padding: '3rem 1rem',
                color: '#6b7280'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛒</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  No Artifacts Yet
                </div>
                <div style={{ fontSize: '0.9rem' }}>
                  Visit the MST MKT to purchase your first artifact!
                </div>
              </div>
            )}
          </div>
      
        {/* Manifest Progress Section - Right Side with Horizontal Scrolling */}
        <div style={{ 
          flex: '1', 
          backgroundColor: 'white', 
          borderRadius: '0.75rem', 
          padding: '2rem', 
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', 
          border: '1px solid #e5e7eb',
          overflowX: 'auto',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column'
        }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#4f46e5', margin: 0, lineHeight: '1.5rem', flexShrink: 0 }}>
          ⚡ Manifest Progress
        </h2>
        {playerManifest ? (
            <div style={{ minWidth: '600px' }}>
          <ManifestProgress 
            playerManifest={playerManifest} 
            onVeilBreak={handleVeilBreak}
            userId={currentUser?.uid}
            moves={moves}
            onAbilityUsed={() => {
              // Refresh user data to show updated usage counts
              if (currentUser?.uid) {
                fetchUserData();
              }
            }}
          />
            </div>
        ) : (
          <div style={{ 
            padding: '2rem', 
            textAlign: 'center',
            backgroundColor: '#f8fafc',
            borderRadius: '0.5rem',
              border: '1px solid #e2e8f0',
              minWidth: '400px'
            }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#4f46e5' }}>
                Choose Your Manifest
              </h3>
              <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
                In the Nine Knowings Universe, ordinary skills become extraordinary through mastery, intent, and will.
              </p>
              <button
                onClick={() => setShowManifestSelection(true)}
                style={{
                  backgroundColor: '#4f46e5',
                  color: 'white',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  fontWeight: 'bold'
                }}
              >
                Select Your Manifest
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Admin Debug Section for UXP Artifact Management */}
      {(() => {
        const artifacts = userData?.artifacts;
        if (!Array.isArray(artifacts)) return false;
        return artifacts.some((artifact: any) => artifact.pending);
      })() && (
        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: '#fef3c7',
          border: '1px solid #f59e0b',
          borderRadius: '0.5rem'
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '1rem', color: '#92400e' }}>
            🔧 Admin Debug: Pending UXP Artifacts
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Array.isArray(userData?.artifacts) && userData.artifacts.filter((artifact: any) => artifact.pending).map((artifact: any, index: number) => (
              <div key={`${artifact.id || artifact.name || 'artifact'}-pending-${index}`} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem',
                backgroundColor: 'white',
                borderRadius: '0.25rem',
                border: '1px solid #d1d5db'
              }}>
                <span style={{ fontWeight: 'bold', color: '#374151' }}>
                  {artifact.name} (Submitted: {artifact.submittedAt ? new Date(artifact.submittedAt).toLocaleString() : 'Unknown'})
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleAdminResponse(artifact.name, true)}
                    style={{
                      backgroundColor: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    ✅ Approve
                  </button>
                  <button
                    onClick={() => handleAdminResponse(artifact.name, false)}
                    style={{
                      backgroundColor: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    ❌ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manifest Selection Modal */}
      {/* Edit Rival Modal */}
      <EditRivalModal
        isOpen={showEditRivalModal}
        onClose={() => setShowEditRivalModal(false)}
        onRivalUpdated={async () => {
          if (currentUser) {
            const userId = currentUser.uid;
            // Refresh rivals data
            const rivalsData = await getRivals(userId);
            setRivals(rivalsData);
            // Also refresh userData to ensure profile updates
            await fetchUserData();
          }
        }}
      />

      {showManifestSelection && (
        <ManifestSelection
          onManifestSelect={handleManifestSelect}
          onClose={() => setShowManifestSelection(false)}
        />
      )}

      {/* PP Earning Methods Modal */}
      {showPPEarningModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 10000,
            padding: '2rem'
          }}
          onClick={() => setShowPPEarningModal(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '1rem',
              padding: '2rem',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowPPEarningModal(false)}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                borderRadius: '50%',
                width: '40px',
                height: '40px',
                color: '#ef4444',
                cursor: 'pointer',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ×
            </button>

            <h2 style={{
              fontSize: '2rem',
              fontWeight: 'bold',
              marginBottom: '1rem',
              color: '#1f2937',
              textAlign: 'center'
            }}>
              💰 Ways to Earn Power Points
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Battle Arena */}
              <div
                style={{
                  padding: '1rem',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  borderRadius: '0.75rem',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'transform 0.2s'
                }}
                onClick={() => {
                  setShowPPEarningModal(false);
                  navigate('/battle');
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '2rem' }}>⚔️</span>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>Battle Arena</h3>
                    <p style={{ margin: '0.5rem 0 0 0', opacity: 0.9, fontSize: '0.875rem' }}>
                      Fight other players and win PP from their vaults. Practice mode also rewards PP!
                    </p>
                  </div>
                </div>
              </div>

              {/* Island Raid */}
              <div
                style={{
                  padding: '1rem',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  borderRadius: '0.75rem',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'transform 0.2s'
                }}
                onClick={() => {
                  setShowPPEarningModal(false);
                  navigate('/island-raid');
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '2rem' }}>🏝️</span>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>Island Raid</h3>
                    <p style={{ margin: '0.5rem 0 0 0', opacity: 0.9, fontSize: '0.875rem' }}>
                      Complete Island Raids to earn PP rewards. Easy mode: 150 PP, Normal mode: 300 PP!
                    </p>
                  </div>
                </div>
              </div>

              {/* Daily Challenges */}
              <div
                style={{
                  padding: '1rem',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  borderRadius: '0.75rem',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'transform 0.2s'
                }}
                onClick={() => {
                  setShowPPEarningModal(false);
                  navigate('/home');
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '2rem' }}>📅</span>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>Daily Challenges</h3>
                    <p style={{ margin: '0.5rem 0 0 0', opacity: 0.9, fontSize: '0.875rem' }}>
                      Complete daily challenges to earn PP rewards. New challenges refresh every day!
                    </p>
                  </div>
                </div>
              </div>

              {/* Story Mode */}
              <div
                style={{
                  padding: '1rem',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                  borderRadius: '0.75rem',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'transform 0.2s'
                }}
                onClick={() => {
                  setShowPPEarningModal(false);
                  navigate('/story');
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '2rem' }}>📖</span>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>Story Mode</h3>
                    <p style={{ margin: '0.5rem 0 0 0', opacity: 0.9, fontSize: '0.875rem' }}>
                      Complete story episodes to earn PP and other rewards as you progress through the story!
                    </p>
                  </div>
                </div>
              </div>

              {/* Player's Journey */}
              <div
                style={{
                  padding: '1rem',
                  background: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                  borderRadius: '0.75rem',
                  color: 'white',
                  cursor: 'pointer',
                  transition: 'transform 0.2s'
                }}
                onClick={() => {
                  setShowPPEarningModal(false);
                  navigate('/chapters');
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '2rem' }}>🗺️</span>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>Player's Journey</h3>
                    <p style={{ margin: '0.5rem 0 0 0', opacity: 0.9, fontSize: '0.875rem' }}>
                      Complete chapter challenges to earn PP and unlock new content!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Profile; 