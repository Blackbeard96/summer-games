import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp, onSnapshot, query, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';
import { CHAPTERS } from '../types/chapters';
import ModelPreview from './ModelPreview';
import RivalSelectionModal from './RivalSelectionModal';

interface ChallengeData {
  completed?: boolean;
  file?: string;
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

const StoryChallenges = () => {
  const { currentUser } = useAuth();
  const [userProgress, setUserProgress] = useState<any>(null);
  const [selectedFiles, setSelectedFiles] = useState<{ [challenge: string]: File | null }>({});
  const [chapterClassroomAssignments, setChapterClassroomAssignments] = useState<{ [challengeId: string]: GoogleClassroomAssignment }>({});
  const [showRivalSelectionModal, setShowRivalSelectionModal] = useState(false);

  useEffect(() => {
    if (!currentUser) return;

    const userRef = doc(db, 'users', currentUser.uid);
    const studentRef = doc(db, 'students', currentUser.uid);
    
    // Listen to both collections for manifest data
    const unsubscribeUsers = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        setUserProgress(userData);
        
        // Check and auto-complete profile update challenge
        checkAndCompleteProfileChallenge(userData);
        // Check and auto-complete manifest declaration challenge
        checkAndCompleteManifestChallenge(userData);
        // Check and auto-complete rival selection challenge
        checkAndCompleteRivalChallenge(userData);
        
        // Chapter progression is now handled by a dedicated useEffect
      }
    });

    const unsubscribeStudents = onSnapshot(studentRef, (doc) => {
      if (doc.exists()) {
        const studentData = doc.data();
        // Merge student data with user data, prioritizing student data for manifest
        setUserProgress((prev: any) => ({
          ...prev,
          ...studentData,
          manifest: studentData.manifest || prev?.manifest
        }));
        
        // Check manifest completion with merged data
        if (studentData.manifest) {
          checkAndCompleteManifestChallenge({
            ...userProgress,
            ...studentData,
            manifest: studentData.manifest
          });
        }
        
        // Chapter progression is now handled by a dedicated useEffect
      }
    });

    return () => {
      unsubscribeUsers();
      unsubscribeStudents();
    };
  }, [currentUser]);

  // Additional effect to check profile and manifest completion on mount
  useEffect(() => {
    if (!currentUser || !userProgress) return;

    // Check if profile is complete and challenge should be auto-completed
    const hasDisplayName = userProgress.displayName && userProgress.displayName.trim() !== '';
    const hasAvatar = (userProgress.photoURL && userProgress.photoURL.trim() !== '') || 
                     (currentUser?.photoURL && currentUser.photoURL.trim() !== '') ||
                     (userProgress.avatar && userProgress.avatar.trim() !== '');
    const isProfileComplete = hasDisplayName && hasAvatar;
    
    // Check if manifest is chosen and challenge should be auto-completed - check multiple possible formats
    const hasManifest = (userProgress.manifest && 
                        userProgress.manifest.manifestId && 
                        userProgress.manifest.manifestId !== 'None' &&
                        userProgress.manifest.manifestId !== '') ||
                       (userProgress.manifest && 
                        userProgress.manifest.manifestId && 
                        userProgress.manifest.manifestId !== 'None') ||
                       (userProgress.manifest && 
                        typeof userProgress.manifest === 'object' && 
                        Object.keys(userProgress.manifest).length > 0) ||
                       (userProgress.manifest && 
                        typeof userProgress.manifest === 'string' && 
                        userProgress.manifest !== 'None' && 
                        userProgress.manifest !== '') ||
                       (userProgress.manifestationType && 
                        userProgress.manifestationType !== 'None' && 
                        userProgress.manifestationType !== '');
    
    // Check if we're in Chapter 1 and challenges are not completed
    const isChapter1Active = userProgress.chapters?.[1]?.isActive;
    const isProfileChallengeCompleted = userProgress.chapters?.[1]?.challenges?.['ch1-update-profile']?.isCompleted;
    const isManifestChallengeCompleted = userProgress.chapters?.[1]?.challenges?.['ch1-declare-manifest']?.isCompleted;
    
    if (isProfileComplete && isChapter1Active && !isProfileChallengeCompleted) {
      console.log('Profile is complete, auto-completing challenge...');
      checkAndCompleteProfileChallenge(userProgress);
    }
    
    if (hasManifest && isChapter1Active && !isManifestChallengeCompleted) {
      console.log('Manifest is chosen, auto-completing challenge...');
      checkAndCompleteManifestChallenge(userProgress);
    }
  }, [currentUser, userProgress]);

  // Effect to check chapter progression when userProgress changes
  useEffect(() => {
    if (!currentUser || !userProgress || !userProgress.chapters) return;

    console.log('User progress updated, checking chapter progression...');
    
    // Check all chapters for progression
    Object.keys(userProgress.chapters).forEach(chapterId => {
      const chapterNum = parseInt(chapterId);
      if (!isNaN(chapterNum)) {
        // Use setTimeout to ensure this runs after the state is fully updated
        setTimeout(() => {
          checkAndProgressChapter(chapterNum);
        }, 200);
      }
    });
  }, [userProgress]);

  // Function to check and auto-complete profile update challenge
  const checkAndCompleteProfileChallenge = async (userData: any) => {
    if (!currentUser) return;

    try {
      // Check if we're in Chapter 1 (since getCurrentChapter might not be available yet)
      if (!userData.chapters?.[1]?.isActive) return;

      // Check if challenge is already completed
      const isAlreadyCompleted = userData.chapters?.[1]?.challenges?.['ch1-update-profile']?.isCompleted;
      if (isAlreadyCompleted) {
        console.log('Profile challenge already completed');
        return;
      }

      // Check if profile is complete (has display name and avatar)
      const hasDisplayName = userData.displayName && userData.displayName.trim() !== '';
      // Check for avatar in multiple possible fields
      const hasAvatar = (userData.photoURL && userData.photoURL.trim() !== '') || 
                       (currentUser.photoURL && currentUser.photoURL.trim() !== '') ||
                       (userData.avatar && userData.avatar.trim() !== '');
      
      console.log('Profile completion check:', { 
        hasDisplayName, 
        hasAvatar, 
        displayName: userData.displayName, 
        photoURL: userData.photoURL,
        currentUserPhotoURL: currentUser.photoURL,
        userDataAvatar: userData.avatar
      });
      
      if (hasDisplayName && hasAvatar) {
        console.log('Profile is complete, auto-completing challenge...');
        
        // Auto-complete the profile challenge
        const userRef = doc(db, 'users', currentUser.uid);
        const updatedChapters = {
          ...userData.chapters,
          [1]: {
            ...userData.chapters?.[1],
            challenges: {
              ...userData.chapters?.[1]?.challenges,
              'ch1-update-profile': {
                isCompleted: true,
                completedAt: serverTimestamp(),
                autoCompleted: true
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
          challengeId: 'ch1-update-profile',
          challengeName: 'Update Your Profile',
          submissionType: 'auto_completed',
          status: 'approved',
          timestamp: serverTimestamp(),
          xpReward: 15,
          ppReward: 5,
          manifestationType: 'Chapter Challenge',
          character: 'Chapter System',
          autoCompleted: true
        });

        console.log('Profile challenge auto-completed!');
        
        // Create notification instead of alert
        await createChallengeNotification('Update Your Profile', 15, 5, true);
        
        // Check if Chapter 1 is now complete and progress to Chapter 2
        await checkAndProgressChapter(1);
        
        // Show a brief success message only once per session
        if (!sessionStorage.getItem('profileAutoCompleteAlertShown')) {
          alert('✅ Profile challenge auto-completed! Check your notifications for details.');
          sessionStorage.setItem('profileAutoCompleteAlertShown', 'true');
        }
      } else {
        console.log('Profile not complete yet:', { hasDisplayName, hasAvatar });
      }
    } catch (error) {
      console.error('Error auto-completing profile challenge:', error);
    }
  };

  // Function to check and auto-complete manifest declaration challenge
  const checkAndCompleteManifestChallenge = async (userData: any) => {
    if (!currentUser) return;

    try {
      // Check if we're in Chapter 1
      if (!userData.chapters?.[1]?.isActive) return;

      // Check if challenge is already completed
      const isAlreadyCompleted = userData.chapters?.[1]?.challenges?.['ch1-declare-manifest']?.isCompleted;
      if (isAlreadyCompleted) {
        console.log('Manifest challenge already completed');
        return;
      }

      // Check if manifest is chosen (has manifest data) - check multiple possible formats
      const hasManifest = (userData.manifest && 
                          userData.manifest.manifestId && 
                          userData.manifest.manifestId !== 'None' &&
                          userData.manifest.manifestId !== '') ||
                         (userData.manifest && 
                          typeof userData.manifest === 'object' && 
                          Object.keys(userData.manifest).length > 0) ||
                         (userData.manifest && 
                          typeof userData.manifest === 'string' && 
                          userData.manifest !== 'None' && 
                          userData.manifest !== '') ||
                         (userData.manifestationType && 
                          userData.manifestationType !== 'None' && 
                          userData.manifestationType !== '');
      
      console.log('Manifest completion check:', { 
        hasManifest, 
        manifest: userData.manifest,
        manifestId: userData.manifest?.manifestId,
        manifestationType: userData.manifestationType
      });
      
      if (hasManifest) {
        console.log('Manifest is chosen, auto-completing challenge...');
        
        // Auto-complete the manifest challenge
        const userRef = doc(db, 'users', currentUser.uid);
        const updatedChapters = {
          ...userData.chapters,
          [1]: {
            ...userData.chapters?.[1],
            challenges: {
              ...userData.chapters?.[1]?.challenges,
              'ch1-declare-manifest': {
                isCompleted: true,
                completedAt: serverTimestamp(),
                autoCompleted: true
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
          challengeId: 'ch1-declare-manifest',
          challengeName: 'Declare Your Manifest',
          submissionType: 'auto_completed',
          status: 'approved',
          timestamp: serverTimestamp(),
          xpReward: 20,
          ppReward: 8,
          manifestationType: 'Chapter Challenge',
          character: 'Chapter System',
          autoCompleted: true
        });

        console.log('Manifest challenge auto-completed!');
        
        // Create notification instead of alert
        await createChallengeNotification('Declare Your Manifest', 20, 8, true);
        
        // Check if Chapter 1 is now complete and progress to Chapter 2
        await checkAndProgressChapter(1);
        
        // Show a brief success message only once per session
        if (!sessionStorage.getItem('manifestAutoCompleteAlertShown')) {
          alert('✅ Manifest challenge auto-completed! Check your notifications for details.');
          sessionStorage.setItem('manifestAutoCompleteAlertShown', 'true');
        }
      } else {
        console.log('Manifest not chosen yet:', { hasManifest });
      }
    } catch (error) {
      console.error('Error auto-completing manifest challenge:', error);
    }
  };

  // Function to check and auto-complete rival selection challenge
  const checkAndCompleteRivalChallenge = async (userData: any) => {
    if (!currentUser) return;

    try {
      // Check if we're in Chapter 2
      if (!userData.chapters?.[2]?.isActive) return;

      // Check if challenge is already completed
      const isAlreadyCompleted = userData.chapters?.[2]?.challenges?.['ch2-rival-selection']?.isCompleted;
      if (isAlreadyCompleted) {
        console.log('Rival selection challenge already completed');
        return;
      }

      // Check if rival is chosen
      const hasRival = userData.rival || userData.chapters?.[2]?.rival;
      
      console.log('Rival completion check:', { 
        hasRival, 
        rival: userData.rival,
        chapterRival: userData.chapters?.[2]?.rival
      });
      
      if (hasRival) {
        console.log('Rival is chosen, auto-completing challenge...');
        
        // Auto-complete the rival selection challenge
        const userRef = doc(db, 'users', currentUser.uid);
        const updatedChapters = {
          ...userData.chapters,
          [2]: {
            ...userData.chapters?.[2],
            challenges: {
              ...userData.chapters?.[2]?.challenges,
              'ch2-rival-selection': {
                isCompleted: true,
                completedAt: serverTimestamp(),
                autoCompleted: true
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
          challengeId: 'ch2-rival-selection',
          challengeName: 'Choose Your Rival',
          submissionType: 'auto_completed',
          status: 'approved',
          timestamp: serverTimestamp(),
          xpReward: 20,
          ppReward: 10,
          manifestationType: 'Chapter Challenge',
          character: 'Chapter System',
          autoCompleted: true
        });

        console.log('Rival selection challenge auto-completed!');
        
        // Create notification
        await createChallengeNotification('Choose Your Rival', 20, 10, true);
        
        // Check if Chapter 2 is now complete and progress to Chapter 3
        await checkAndProgressChapter(2);
      } else {
        console.log('Rival not chosen yet:', { hasRival });
      }
    } catch (error) {
      console.error('Error auto-completing rival challenge:', error);
    }
  };

  // Manual trigger function for testing
  const manualCheckProfileCompletion = async () => {
    if (userProgress) {
      console.log('Manual profile completion check triggered');
      await checkAndCompleteProfileChallenge(userProgress);
      // Check for chapter progression after manual completion
      await checkAndProgressChapter(1);
    }
  };

  // Manual trigger function for manifest testing
  const manualCheckManifestCompletion = async () => {
    if (userProgress) {
      console.log('Manual manifest completion check triggered');
      console.log('Current userProgress:', userProgress);
      console.log('Manifest data:', userProgress.manifest);
      await checkAndCompleteManifestChallenge(userProgress);
      // Check for chapter progression after manual completion
      await checkAndProgressChapter(1);
    }
  };

  // Debug function to check manifest data
  const debugManifestData = () => {
    console.log('=== MANIFEST DEBUG INFO ===');
    console.log('userProgress:', userProgress);
    console.log('userProgress.manifest:', userProgress?.manifest);
    console.log('userProgress.manifest.manifestId:', userProgress?.manifest?.manifestId);
    console.log('userProgress.manifestationType:', userProgress?.manifestationType);
    
    const hasManifest = (userProgress?.manifest && 
                        userProgress?.manifest.manifestId && 
                        userProgress?.manifest.manifestId !== 'None' &&
                        userProgress?.manifest.manifestId !== '') ||
                       (userProgress?.manifest && 
                        typeof userProgress?.manifest === 'object' && 
                        Object.keys(userProgress?.manifest).length > 0) ||
                       (userProgress?.manifest && 
                        typeof userProgress?.manifest === 'string' && 
                        userProgress?.manifest !== 'None' && 
                        userProgress?.manifest !== '') ||
                       (userProgress?.manifestationType && 
                        userProgress?.manifestationType !== 'None' && 
                        userProgress?.manifestationType !== '');
    
    console.log('hasManifest:', hasManifest);
    console.log('=== END DEBUG INFO ===');
  };

  // Function to manually complete all Chapter 1 challenges for testing
  const completeAllChapter1Challenges = async () => {
    if (!currentUser || !userProgress) return;
    
    console.log('=== COMPLETING ALL CHAPTER 1 CHALLENGES ===');
    
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const currentData = userProgress || {};
      
      // Complete all Chapter 1 challenges
      const updatedChapters = {
        ...currentData.chapters,
        [1]: {
          ...currentData.chapters?.[1],
          challenges: {
            ...currentData.chapters?.[1]?.challenges,
            'ch1-update-profile': {
              isCompleted: true,
              completedAt: serverTimestamp(),
              autoCompleted: true
            },
            'ch1-declare-manifest': {
              isCompleted: true,
              completedAt: serverTimestamp(),
              autoCompleted: true
            },
            'ch1-artifact-identification': {
              isCompleted: true,
              completedAt: serverTimestamp(),
              autoCompleted: true
            },
            'ch1-artifact-challenge': {
              isCompleted: true,
              completedAt: serverTimestamp(),
              autoCompleted: true
            }
          }
        }
      };

      await updateDoc(userRef, {
        chapters: updatedChapters
      });

      console.log('All Chapter 1 challenges completed!');
      alert('✅ All Chapter 1 challenges have been completed! Check if Chapter 2 activates.');
      
      // Check for chapter progression
      await checkAndProgressChapter(1);
      
    } catch (error) {
      console.error('Error completing Chapter 1 challenges:', error);
      alert('❌ Error completing challenges. Check console for details.');
    }
  };

  // Function to create notifications for challenge completion
  const createChallengeNotification = async (challengeName: string, xpReward: number, ppReward: number, isAutoCompleted: boolean = false) => {
    if (!currentUser) return;

    try {
      await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
        type: isAutoCompleted ? 'challenge_auto_completed' : 'challenge_submitted',
        message: isAutoCompleted 
          ? `Challenge "${challengeName}" was automatically completed! You earned +${xpReward} XP and +${ppReward} PP.`
          : `Challenge "${challengeName}" has been submitted for approval! You'll be notified when it's reviewed.`,
        challengeName: challengeName,
        xpReward: xpReward,
        ppReward: ppReward,
        timestamp: serverTimestamp(),
        read: false,
        isAutoCompleted: isAutoCompleted
      });
    } catch (error) {
      console.error('Error creating challenge notification:', error);
    }
  };

  useEffect(() => {
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
      fetchChapterClassroomAssignments();
    }
  }, [currentUser]);

  const handleFileSelect = (challengeName: string, file: File | null) => {
    setSelectedFiles(prev => ({ ...prev, [challengeName]: file }));
  };

  const handleFileUpload = async (challengeName: string) => {
    if (!currentUser || !selectedFiles[challengeName]) return;

    try {
      const file = selectedFiles[challengeName];
      if (!file) return; // Additional null check
      
      const storageRef = ref(storage, `manifestation_submissions/${currentUser.uid}/${challengeName}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      // Update user progress
      const userRef = doc(db, 'users', currentUser.uid);
      const currentData = userProgress || {};
      const currentChapter = getCurrentChapter();
      
      if (currentChapter) {
        const updatedChapters = {
          ...currentData.chapters,
          [currentChapter.id]: {
            ...currentData.chapters?.[currentChapter.id],
            challenges: {
              ...currentData.chapters?.[currentChapter.id]?.challenges,
              [challengeName]: {
                isCompleted: true,
                file: downloadURL,
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
          challengeId: challengeName,
          challengeName: challengeName,
          fileUrl: downloadURL,
          timestamp: serverTimestamp(),
          status: 'pending',
          xpReward: 15,
          ppReward: 8,
          manifestationType: 'Chapter Challenge',
          character: 'Chapter System'
        });

        // Create notification for challenge submission
        await createChallengeNotification(challengeName, 15, 8, false);
        
        // Check if current chapter is now complete and progress to next chapter
        if (currentChapter) {
          await checkAndProgressChapter(currentChapter.id);
        }
      }

      setSelectedFiles(prev => ({ ...prev, [challengeName]: null }));
      alert(`🎉 Challenge "${challengeName}" submitted for approval! Check your notifications for updates.`);
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to upload manifestation. Please try again.');
    }
  };

  const handleRemoveSubmission = async (challengeName: string) => {
    if (!currentUser) return;

    try {
      const storageRef = ref(storage, `manifestation_submissions/${currentUser.uid}/${challengeName}`);
      await deleteObject(storageRef);
      
      // Update user progress
      const userRef = doc(db, 'users', currentUser.uid);
      const currentData = userProgress || {};
      const currentChapter = getCurrentChapter();
      
      if (currentChapter) {
        const updatedChapters = {
          ...currentData.chapters,
          [currentChapter.id]: {
            ...currentData.chapters?.[currentChapter.id],
            challenges: {
              ...currentData.chapters?.[currentChapter.id]?.challenges,
              [challengeName]: {
                isCompleted: false,
                file: null
              }
            }
          }
        };

        await updateDoc(userRef, {
          chapters: updatedChapters
        });
      }
    } catch (error) {
      console.error('Error removing submission:', error);
      alert('Failed to remove manifestation. Please try again.');
    }
  };

  const handleRivalSelected = async (rivalId: string, rivalName: string) => {
    if (!currentUser) return;

    try {
      console.log('StoryChallenges: Rival selected:', { rivalId, rivalName });
      
      // Update user's rival in the database
      const userRef = doc(db, 'users', currentUser.uid);
      const studentRef = doc(db, 'students', currentUser.uid);
      
      // Update new chapter system
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const currentChapter = getCurrentChapter();
        
        if (currentChapter) {
          const updatedChapters = {
            ...userData.chapters,
            [currentChapter.id]: {
              ...userData.chapters?.[currentChapter.id],
              rival: {
                id: rivalId,
                name: rivalName,
                type: 'external',
                description: `Your rival ${rivalName} - a worthy opponent to overcome`,
                challenge: `Defeat ${rivalName} in battle or prove your superiority`,
                isDefeated: false
              },
              challenges: {
                ...userData.chapters?.[currentChapter.id]?.challenges,
                'ch2-rival-selection': {
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
        }
      }

      // Also update the legacy system
      const studentDoc = await getDoc(studentRef);
      if (studentDoc.exists()) {
        const studentData = studentDoc.data();
        await updateDoc(studentRef, {
          rival: {
            id: rivalId,
            name: rivalName,
            type: 'external',
            description: `Your rival ${rivalName} - a worthy opponent to overcome`,
            challenge: `Defeat ${rivalName} in battle or prove your superiority`,
            isDefeated: false
          },
          challenges: {
            ...studentData.challenges,
            'ch2-rival-selection': {
              completed: true,
              status: 'approved',
              completionDate: new Date()
            }
          },
          xp: (studentData.xp || 0) + 20,
          powerPoints: (studentData.powerPoints || 0) + 10
        });
      }

      // Add notification
      await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
        type: 'challenge_completed',
        message: `🏆 Challenge "Choose Your Rival" completed! You selected ${rivalName} as your rival. You earned 20 XP and 10 PP.`,
        challengeId: 'ch2-rival-selection',
        challengeName: 'Choose Your Rival',
        xpReward: 20,
        ppReward: 10,
        timestamp: serverTimestamp(),
        read: false
      });

      // Refresh user data to show the selected rival
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

      console.log('StoryChallenges: Rival selection completed successfully');
      
    } catch (error) {
      console.error('Error selecting rival:', error);
      alert('Failed to select rival. Please try again.');
    }
  };

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

  // Function to check if a chapter is complete and automatically progress to next chapter
  const checkAndProgressChapter = async (chapterId: number) => {
    console.log(`=== CHECKING CHAPTER ${chapterId} PROGRESSION ===`);
    console.log('Current user:', currentUser?.uid);
    console.log('User progress:', userProgress);
    console.log('Chapters data:', userProgress?.chapters);
    
    if (!currentUser || !userProgress?.chapters) {
      console.log('Missing currentUser or userProgress.chapters');
      return;
    }
    
    const chapterProgress = userProgress.chapters[chapterId];
    console.log(`Chapter ${chapterId} progress:`, chapterProgress);
    
    if (!chapterProgress || chapterProgress.isCompleted) {
      console.log(`Chapter ${chapterId} not found or already completed`);
      return;
    }
    
    const chapter = CHAPTERS.find(c => c.id === chapterId);
    console.log(`Chapter ${chapterId} definition:`, chapter);
    
    if (!chapter) {
      console.log(`Chapter ${chapterId} not found in CHAPTERS`);
      return;
    }
    
    // Check if all challenges in the chapter are completed
    const completedChallenges = chapter.challenges.filter(challenge => 
      chapterProgress.challenges?.[challenge.id]?.isCompleted
    );
    const allChallengesCompleted = completedChallenges.length === chapter.challenges.length;
    
    console.log(`Chapter ${chapterId} challenges:`, chapter.challenges);
    console.log(`Chapter ${chapterId} completed challenges:`, completedChallenges);
    console.log(`All challenges completed:`, allChallengesCompleted);
    console.log(`Chapter already completed:`, chapterProgress.isCompleted);
    
    if (allChallengesCompleted && !chapterProgress.isCompleted) {
      console.log(`Chapter ${chapterId} is complete! Progressing to next chapter...`);
      
      const userRef = doc(db, 'users', currentUser.uid);
      
      try {
        // Mark current chapter as completed
        await updateDoc(userRef, {
          [`chapters.${chapterId}.isCompleted`]: true,
          [`chapters.${chapterId}.completionDate`]: new Date(),
          [`chapters.${chapterId}.isActive`]: false
        });
        
        // Activate next chapter if available
        const nextChapterId = chapterId + 1;
        const nextChapter = CHAPTERS.find(c => c.id === nextChapterId);
        
        if (nextChapter) {
          await updateDoc(userRef, {
            [`chapters.${nextChapterId}.isActive`]: true,
            [`chapters.${nextChapterId}.unlockDate`]: new Date()
          });
          
          console.log(`Chapter ${nextChapterId} activated!`);
          
          // Create notification for chapter completion
          await createChallengeNotification(
            `Chapter ${chapterId} Complete!`,
            0,
            0,
            true
          );
          
          // Add specific chapter unlock notification
          await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
            type: 'chapter_unlocked',
            message: `🎉 Chapter ${chapterId} Complete! Chapter ${nextChapterId} is now unlocked!`,
            chapterId: nextChapterId,
            timestamp: serverTimestamp(),
            read: false
          });
          
          // Show success message to user
          alert(`🎉 Chapter ${chapterId} Complete! Chapter ${nextChapterId} is now unlocked!`);
        } else {
          console.log(`No next chapter available. Chapter ${chapterId} is the final chapter.`);
        }
      } catch (error) {
        console.error('Error progressing to next chapter:', error);
      }
    } else {
      console.log(`Chapter ${chapterId} not complete yet. Progress: ${chapter.challenges.filter(challenge => 
        chapterProgress.challenges?.[challenge.id]?.isCompleted
      ).length}/${chapter.challenges.length} challenges completed.`);
    }
  };

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
          📖 Story Challenges
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
      </div>

      {/* Chapter Challenges Section */}
      {(() => {
        const currentChapter = getCurrentChapter();
        if (!currentChapter) return null;
        
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
                const isCompleted = challengeData.isCompleted;
                const hasFile = !!challengeData.file;
                const classroomAssignment = chapterClassroomAssignments[challenge.id];
                
                return (
                  <div key={challenge.id} className={`challenge-${challenge.id.replace('ch1-', '')}`} style={{ 
                    padding: '1rem', 
                    backgroundColor: isCompleted ? '#f0fdf4' : '#f9fafb',
                    border: isCompleted ? '1px solid #22c55e' : '1px solid #e5e7eb',
                    borderRadius: '0.5rem',
                    transition: 'all 0.3s ease'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.75rem' }}>
                      <div style={{ 
                        width: '20px', 
                        height: '20px', 
                        backgroundColor: isCompleted ? '#22c55e' : '#e5e7eb', 
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        {isCompleted ? '✓' : ''}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <h3 style={{ 
                            fontSize: '1.125rem', 
                            fontWeight: 'bold',
                            color: isCompleted ? '#22c55e' : '#1f2937'
                          }}>
                            {challenge.title}
                          </h3>
                          {challenge.id === 'ch1-update-profile' && isCompleted && challengeData.autoCompleted && (
                            <span style={{
                              padding: '0.25rem 0.5rem',
                              background: '#10b981',
                              color: 'white',
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: 'bold'
                            }}>
                              Auto-Completed
                            </span>
                          )}
                        </div>
                        <p style={{ 
                          fontSize: '0.875rem', 
                          color: '#6b7280', 
                          marginBottom: '0.5rem',
                          fontStyle: 'italic'
                        }}>
                          {challenge.description}
                        </p>
                        {challenge.id === 'ch1-update-profile' && !isCompleted && (
                          <div className="challenge-profile" style={{
                            padding: '0.75rem',
                            backgroundColor: '#dbeafe',
                            border: '1px solid #3b82f6',
                            borderRadius: '0.25rem',
                            fontSize: '0.8rem',
                            marginBottom: '0.5rem',
                            color: '#1e40af'
                          }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                              💡 Auto-Completion
                            </div>
                            <div style={{ marginBottom: '0.5rem' }}>
                              This challenge will be automatically completed when you update your profile with a display name and avatar image.
                            </div>
                            <button
                              onClick={manualCheckProfileCompletion}
                              style={{
                                padding: '0.5rem 1rem',
                                backgroundColor: '#3b82f6',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.25rem',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 'bold'
                              }}
                            >
                              Check Profile Completion
                            </button>
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
                        
                        {/* Rewards */}
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

                    {/* File upload section - EXCLUDES profile, manifest, and rival selection challenges */}
                    {!isCompleted && challenge.id !== 'ch1-update-profile' && challenge.id !== 'ch1-declare-manifest' && challenge.id !== 'ch2-rival-selection' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
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
                      </div>
                    )}

                    {/* Rival selection challenge - special handling */}
                    {!isCompleted && challenge.id === 'ch2-rival-selection' && (
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
                      </div>
                    )}

                    {/* Profile challenge - NO file upload, only status tracking */}
                    {!isCompleted && challenge.id === 'ch1-update-profile' && (
                      <div style={{
                        padding: '1rem',
                        backgroundColor: '#f0fdf4',
                        border: '1px solid #22c55e',
                        borderRadius: '0.5rem',
                        marginTop: '0.5rem'
                      }}>
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.5rem', 
                          marginBottom: '0.5rem',
                          color: '#166534'
                        }}>
                          <span style={{ fontSize: '1.25rem' }}>📊</span>
                          <span style={{ fontWeight: 'bold' }}>Profile Status Check</span>
                        </div>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '1fr 1fr', 
                          gap: '0.5rem',
                          marginBottom: '0.75rem'
                        }}>
                          <div style={{
                            padding: '0.5rem',
                            backgroundColor: userProgress?.displayName ? '#dcfce7' : '#fef2f2',
                            border: `1px solid ${userProgress?.displayName ? '#22c55e' : '#ef4444'}`,
                            borderRadius: '0.25rem',
                            textAlign: 'center'
                          }}>
                            <div style={{ 
                              fontSize: '0.75rem', 
                              fontWeight: 'bold',
                              color: userProgress?.displayName ? '#166534' : '#dc2626'
                            }}>
                              Display Name
                            </div>
                            <div style={{ 
                              fontSize: '0.875rem',
                              color: userProgress?.displayName ? '#166534' : '#dc2626'
                            }}>
                              {userProgress?.displayName ? '✅ Set' : '❌ Missing'}
                            </div>
                          </div>
                          <div style={{
                            padding: '0.5rem',
                            backgroundColor: (userProgress?.photoURL || currentUser?.photoURL || userProgress?.avatar) ? '#dcfce7' : '#fef2f2',
                            border: `1px solid ${(userProgress?.photoURL || currentUser?.photoURL || userProgress?.avatar) ? '#22c55e' : '#ef4444'}`,
                            borderRadius: '0.25rem',
                            textAlign: 'center'
                          }}>
                            <div style={{ 
                              fontSize: '0.75rem', 
                              fontWeight: 'bold',
                              color: (userProgress?.photoURL || currentUser?.photoURL || userProgress?.avatar) ? '#166534' : '#dc2626'
                            }}>
                              Avatar
                            </div>
                            <div style={{ 
                              fontSize: '0.875rem',
                              color: (userProgress?.photoURL || currentUser?.photoURL || userProgress?.avatar) ? '#166534' : '#dc2626'
                            }}>
                              {(userProgress?.photoURL || currentUser?.photoURL || userProgress?.avatar) ? '✅ Set' : '❌ Missing'}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={manualCheckProfileCompletion}
                          style={{
                            padding: '0.75rem 1.5rem',
                            backgroundColor: '#22c55e',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 'bold',
                            width: '100%'
                          }}
                        >
                          Check & Complete Profile Challenge
                        </button>
                      </div>
                    )}

                    {/* Manifest challenge - NO file upload, only status tracking */}
                    {!isCompleted && challenge.id === 'ch1-declare-manifest' && (
                      <div className="challenge-manifest" style={{
                        padding: '1rem',
                        backgroundColor: '#f0fdf4',
                        border: '1px solid #22c55e',
                        borderRadius: '0.5rem',
                        marginTop: '0.5rem'
                      }}>
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.5rem', 
                          marginBottom: '0.5rem',
                          color: '#166534'
                        }}>
                          <span style={{ fontSize: '1.25rem' }}>⚡</span>
                          <span style={{ fontWeight: 'bold' }}>Manifest Status Check</span>
                        </div>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '1fr', 
                          gap: '0.5rem',
                          marginBottom: '0.75rem'
                        }}>
                          <div style={{
                            padding: '0.5rem',
                            backgroundColor: (() => {
                              // Check for manifest in multiple possible locations and formats
                              const hasManifest = 
                                (userProgress?.manifest?.manifestId && userProgress?.manifest?.manifestId !== 'None' && userProgress?.manifest?.manifestId !== '') ||
                                (userProgress?.manifest && typeof userProgress?.manifest === 'object' && Object.keys(userProgress?.manifest).length > 0) ||
                                (userProgress?.manifest && typeof userProgress?.manifest === 'string' && userProgress?.manifest !== 'None' && userProgress?.manifest !== '') ||
                                (userProgress?.manifestationType && userProgress?.manifestationType !== 'None' && userProgress?.manifestationType !== '');
                              return hasManifest ? '#dcfce7' : '#fef2f2';
                            })(),
                            border: `1px solid ${(() => {
                              const hasManifest = 
                                (userProgress?.manifest?.manifestId && userProgress?.manifest?.manifestId !== 'None' && userProgress?.manifest?.manifestId !== '') ||
                                (userProgress?.manifest && typeof userProgress?.manifest === 'object' && Object.keys(userProgress?.manifest).length > 0) ||
                                (userProgress?.manifest && typeof userProgress?.manifest === 'string' && userProgress?.manifest !== 'None' && userProgress?.manifest !== '') ||
                                (userProgress?.manifestationType && userProgress?.manifestationType !== 'None' && userProgress?.manifestationType !== '');
                              return hasManifest ? '#22c55e' : '#ef4444';
                            })()}`,
                            borderRadius: '0.25rem',
                            textAlign: 'center'
                          }}>
                            <div style={{ 
                              fontSize: '0.75rem', 
                              fontWeight: 'bold',
                              color: (() => {
                                const hasManifest = 
                                  (userProgress?.manifest?.manifestId && userProgress?.manifest?.manifestId !== 'None' && userProgress?.manifest?.manifestId !== '') ||
                                  (userProgress?.manifest && typeof userProgress?.manifest === 'object' && Object.keys(userProgress?.manifest).length > 0) ||
                                  (userProgress?.manifest && typeof userProgress?.manifest === 'string' && userProgress?.manifest !== 'None' && userProgress?.manifest !== '') ||
                                  (userProgress?.manifestationType && userProgress?.manifestationType !== 'None' && userProgress?.manifestationType !== '');
                                return hasManifest ? '#166534' : '#dc2626';
                              })()
                            }}>
                              Manifest Chosen
                            </div>
                            <div style={{ 
                              fontSize: '0.875rem',
                              color: (() => {
                                const hasManifest = 
                                  (userProgress?.manifest?.manifestId && userProgress?.manifest?.manifestId !== 'None' && userProgress?.manifest?.manifestId !== '') ||
                                  (userProgress?.manifest && typeof userProgress?.manifest === 'object' && Object.keys(userProgress?.manifest).length > 0) ||
                                  (userProgress?.manifest && typeof userProgress?.manifest === 'string' && userProgress?.manifest !== 'None' && userProgress?.manifest !== '') ||
                                  (userProgress?.manifestationType && userProgress?.manifestationType !== 'None' && userProgress?.manifestationType !== '');
                                return hasManifest ? '#166534' : '#dc2626';
                              })()
                            }}>
                              {(() => {
                                // Get manifest name from various possible formats
                                const manifestName = userProgress?.manifest?.manifestId || 
                                                   (userProgress?.manifest && typeof userProgress?.manifest === 'string' ? userProgress?.manifest : null) ||
                                                   userProgress?.manifestationType ||
                                                   (userProgress?.manifest && typeof userProgress?.manifest === 'object' ? 'Object' : null);
                                
                                const hasManifest = 
                                  (userProgress?.manifest?.manifestId && userProgress?.manifest?.manifestId !== 'None' && userProgress?.manifest?.manifestId !== '') ||
                                  (userProgress?.manifest && typeof userProgress?.manifest === 'object' && Object.keys(userProgress?.manifest).length > 0) ||
                                  (userProgress?.manifest && typeof userProgress?.manifest === 'string' && userProgress?.manifest !== 'None' && userProgress?.manifest !== '') ||
                                  (userProgress?.manifestationType && userProgress?.manifestationType !== 'None' && userProgress?.manifestationType !== '');
                                
                                return hasManifest 
                                  ? `✅ ${manifestName}` 
                                  : '❌ Not Chosen';
                              })()}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={manualCheckManifestCompletion}
                          style={{
                            padding: '0.75rem 1.5rem',
                            backgroundColor: '#22c55e',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.5rem',
                            cursor: 'pointer',
                            fontSize: '0.875rem',
                            fontWeight: 'bold',
                            width: '100%',
                            marginBottom: '0.5rem'
                          }}
                        >
                          Check & Complete Manifest Challenge
                        </button>
                        <button
                          onClick={debugManifestData}
                          style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: '#6b7280',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            width: '100%',
                            marginBottom: '0.5rem'
                          }}
                        >
                          🔍 Debug Manifest Data (Check Console)
                        </button>
                        <button
                          onClick={() => checkAndProgressChapter(1)}
                          style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: '#8b5cf6',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            width: '100%',
                            marginBottom: '0.5rem'
                          }}
                        >
                          🚀 Test Chapter 1 Progression (Check Console)
                        </button>
                        <button
                          onClick={completeAllChapter1Challenges}
                          style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: '#dc2626',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                            fontWeight: '500',
                            width: '100%'
                          }}
                        >
                          ⚡ Complete All Chapter 1 Challenges (TEST)
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
                            borderRadius: '0.25rem',
                            fontWeight: 'bold'
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
                            fontSize: '0.875rem',
                            fontWeight: 'bold'
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
          </div>
        );
      })()}

      {/* Progress Message */}
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
              Complete all manifestations in Chapter {currentChapter.id} to unlock the next chapter of your story!
            </p>
          </div>
        );
      })()}

      {/* Rival Selection Modal */}
      <RivalSelectionModal
        isOpen={showRivalSelectionModal}
        onClose={() => setShowRivalSelectionModal(false)}
        onRivalSelected={handleRivalSelected}
      />
    </div>
  );
};

export default StoryChallenges; 