import React, { useEffect, useState } from 'react';
import { db, storage } from '../firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, setDoc, getDoc, query, where, writeBatch, addDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { ref, deleteObject, getDownloadURL } from 'firebase/storage';
import BadgeManager from '../components/BadgeManager';
import BadgeSetup from '../components/BadgeSetup';
import PlayerCard from '../components/PlayerCard';
import ChapterAssignmentManager from '../components/ChapterAssignmentManager';
import GoogleClassroomIntegration from '../components/GoogleClassroomIntegration';
import { getLevelFromXP } from '../utils/leveling';
import { MANIFESTS } from '../types/manifest';
import { CHAPTERS } from '../types/chapters';
import { useLevelUp } from '../context/LevelUpContext';
import ClassroomManagement from '../components/ClassroomManagement';

interface ChallengeData {
  completed?: boolean;
  file?: string;
  submitted?: boolean;
  status?: string;
}

interface Student {
  id: string;
  displayName?: string;
  email?: string;
  xp?: number;
  powerPoints?: number;
  challenges?: { [name: string]: ChallengeData };
  photoURL?: string; // Added for profile pictures
  manifestationType?: string;
  manifest?: string | any; // Can be string or PlayerManifest object
  style?: string;
  rarity?: number;
  bio?: string;
  cardBgColor?: string;
  moves?: Array<{ name: string; description: string; icon: string }>;
  badges?: Array<{ id: string; name: string; imageUrl: string; description: string; earnedAt: Date }>;
  storyChapter?: number;
}

const AdminPanel: React.FC = () => {
  const { showLevelUpNotification } = useLevelUp();
  const [students, setStudents] = useState<Student[]>([]);
  const [editingStudent, setEditingStudent] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ displayName: '', email: '' });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ studentId: string; challenge: string } | null>(null);
  const [ppAmount, setPPAmount] = useState<{ [studentId: string]: number }>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [batchPP, setBatchPP] = useState(1);
  const [activeTab, setActiveTab] = useState<'students' | 'badges' | 'setup' | 'submissions' | 'assignments' | 'classroom' | 'classroom-management' | 'manifests'>('students');
  const [viewingProfile, setViewingProfile] = useState<string | null>(null);
  const [showBatchSuccess, setShowBatchSuccess] = useState(false);
  const [batchMessage, setBatchMessage] = useState('');
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [rowLoading, setRowLoading] = useState<{ [id: string]: boolean }>({});
  const [rowError, setRowError] = useState<{ [id: string]: string }>({});
  const [pendingSubmissionCount, setPendingSubmissionCount] = useState(0);
  const [viewingFile, setViewingFile] = useState<{ url: string; name: string; type: string } | null>(null);

  // Helper function to get manifest display name
  const getManifestDisplayName = (student: Student): string => {
    // If student.manifest is an object with manifestId, look it up
    if (student.manifest && typeof student.manifest === 'object' && 'manifestId' in student.manifest) {
      const manifest = MANIFESTS.find(m => m.id === (student.manifest as any).manifestId);
      return manifest ? manifest.name : 'Unknown Manifest';
    }
    
    // If student.manifest is a string, look it up directly
    if (typeof student.manifest === 'string') {
      const manifest = MANIFESTS.find(m => m.id === student.manifest || m.name === student.manifest);
      return manifest ? manifest.name : student.manifest;
    }
    
    // Fall back to other properties
    return student.manifestationType || student.style || 'None';
  };

  // Helper function to get chapter progress with pending submissions
  const getChapterProgress = (student: Student) => {
    const challenges = student.challenges || {};
    
    // Determine current chapter based on storyChapter property or completed challenges
    let currentChapter = student.storyChapter || 1;
    
    // Debug logging
    console.log(`Getting chapter progress for student ${student.id}:`, {
      storyChapter: student.storyChapter,
      currentChapter,
      totalChallenges: Object.keys(challenges).length,
      completedChallenges: Object.values(challenges).filter((ch: any) => ch?.completed).length
    });
    
    // Find the chapter data
    const chapter = CHAPTERS.find(ch => ch.id === currentChapter);
    if (!chapter) {
      console.warn(`Chapter ${currentChapter} not found for student ${student.id}`);
      return {
        currentChapter: 1,
        chapterTitle: "Unknown Chapter",
        completed: 0,
        total: 0,
        challenges: []
      };
    }
    
    // Calculate progress within the chapter
    const chapterChallenges = chapter.challenges.map(challenge => {
      const isCompleted = challenges[challenge.id]?.completed || false;
      const isSubmitted = challenges[challenge.id]?.submitted || false;
      const status = challenges[challenge.id]?.status || 'not_started';
      
      return {
        id: challenge.id,
        title: challenge.title,
        completed: isCompleted,
        submitted: isSubmitted,
        status: status,
        isPending: isSubmitted && !isCompleted && status === 'pending'
      };
    });
    
    const completedCount = chapterChallenges.filter(c => c.completed).length;
    
    console.log(`Chapter ${currentChapter} progress for student ${student.id}:`, {
      completed: completedCount,
      total: chapterChallenges.length,
      challengeStatus: chapterChallenges.map(ch => 
        `${ch.title}: ${ch.completed ? '✅' : ch.isPending ? '⏳' : '❌'}`
      ).join(', ')
    });
    
    return {
      currentChapter: chapter.id,
      chapterTitle: chapter.title,
      completed: completedCount,
      total: chapterChallenges.length,
      challenges: chapterChallenges
    };
  };

  useEffect(() => {
    const fetchStudents = async () => {
      console.log('Fetching students data...');
      
      // Force fresh data by using getDocs with no caching
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const studentsSnapshot = await getDocs(collection(db, 'students'));
      
      console.log('Users collection size:', usersSnapshot.docs.length);
      console.log('Students collection size:', studentsSnapshot.docs.length);
      
      // Create a map of user data from the 'users' collection
      const usersMap = new Map();
      usersSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        console.log('User data for', doc.id, ':', userData);
        usersMap.set(doc.id, {
          id: doc.id,
          displayName: userData.displayName || 'Unnamed Student',
          email: userData.email || 'No email',
          photoURL: userData.photoURL,
          createdAt: userData.createdAt,
          lastLogin: userData.lastLogin,
          ...userData
        });
      });
      
      // Merge with student data from 'students' collection
      const studentsMap = new Map();
      studentsSnapshot.docs.forEach(doc => {
        const studentData = doc.data();
        console.log('Student data for', doc.id, ':', studentData);
        const userId = doc.id;
        const userData = usersMap.get(userId) || {};
        
        const mergedData = {
          id: userId,
          ...userData,
          ...studentData,
          displayName: studentData.displayName || userData.displayName || 'Unnamed Student',
          email: studentData.email || userData.email || 'No email',
          photoURL: studentData.photoURL || userData.photoURL,
          xp: studentData.xp || 0,
          powerPoints: studentData.powerPoints || 0,
          challenges: studentData.challenges || {},
        };
        
        console.log('Merged data for', userId, ':', mergedData);
        studentsMap.set(userId, mergedData);
      });
      
      // Add any users that don't have student records yet
      usersMap.forEach((userData, userId) => {
        if (!studentsMap.has(userId)) {
          console.log('Adding user without student record:', userId, userData);
          studentsMap.set(userId, {
            ...userData,
            xp: 0,
            powerPoints: 0,
            challenges: {}
          });
        }
      });
      
      const list = Array.from(studentsMap.values()) as Student[];
      console.log('Final students list:', list);
      setStudents(list);
    };
    fetchStudents();
  }, []);

  // Fetch pending challenge submissions for admin review
  useEffect(() => {
    if (activeTab !== 'submissions') return;
    setSubmissionsLoading(true);
    setSubmissionsError(null);
    const fetchSubmissions = async () => {
      try {
        const q = query(
          collection(db, 'challengeSubmissions'),
          where('status', '==', 'pending')
        );
        const snapshot = await getDocs(q);
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setSubmissions(list);
        
        // Update pending submission count
        setPendingSubmissionCount(list.length);
      } catch (err: any) {
        setSubmissionsError('Failed to load submissions.');
      } finally {
        setSubmissionsLoading(false);
      }
    };
    fetchSubmissions();
  }, [activeTab]);

  // Real-time listener for pending submissions
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'challengeSubmissions'), where('status', '==', 'pending')),
      (snapshot: any) => {
        const list = snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
        setPendingSubmissionCount(list.length);
      }
    );

    return () => unsubscribe();
  }, []);



  // Function to handle file viewing
  const handleViewFile = (fileUrl: string, fileName: string = 'Submitted File') => {
    console.log('handleViewFile called with:', { fileUrl, fileName });
    
    // Detect file type based on URL and filename
    let fileType = 'unknown';
    
    // Check URL for MIME type hints
    if (fileUrl.includes('image/') || fileUrl.includes('image%2F')) {
      fileType = 'image';
    } else if (fileUrl.includes('application/pdf') || fileUrl.includes('application%2Fpdf')) {
      fileType = 'pdf';
    } else {
      // Check file extension
      const extension = fileName.split('.').pop()?.toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(extension || '')) {
        fileType = 'image';
      } else if (['pdf'].includes(extension || '')) {
        fileType = 'pdf';
      } else if (['txt', 'md', 'json', 'js', 'ts', 'jsx', 'tsx', 'html', 'css'].includes(extension || '')) {
        fileType = 'text';
      } else if (['stl', 'obj', 'fbx', 'dae'].includes(extension || '')) {
        fileType = '3d';
      } else {
        // Try to detect if it's an image by attempting to load it
        const img = new Image();
        img.onload = () => {
          setViewingFile({ url: fileUrl, name: fileName, type: 'image' });
        };
        img.onerror = () => {
          setViewingFile({ url: fileUrl, name: fileName, type: 'unknown' });
        };
        img.src = fileUrl;
        return; // Exit early, will set state in onload/onerror
      }
    }
    
    setViewingFile({ url: fileUrl, name: fileName, type: fileType });
  };

  const toggleChallengeCompletion = async (studentId: string, challenge: string) => {
    const studentRef = doc(db, 'students', studentId);
    const student = students.find(s => s.id === studentId);
    if (!student || !student.challenges) return;
    const completed = student.challenges[challenge]?.completed;
    const updatedChallenges = {
      ...student.challenges,
      [challenge]: {
        ...student.challenges[challenge],
        completed: !completed
      }
    };
    const xpChange = !completed ? 10 : -10;
    const ppChange = !completed ? 5 : -5;
    const newXP = (student.xp || 0) + xpChange;
    const newPP = (student.powerPoints || 0) + ppChange;

    await updateDoc(studentRef, {
      challenges: updatedChallenges,
      xp: newXP,
      powerPoints: newPP
    });

    setStudents(prev =>
      prev.map(s =>
        s.id === studentId
          ? { ...s, challenges: updatedChallenges, xp: newXP, powerPoints: newPP }
          : s
      )
    );
  };

  const deleteSubmission = async (studentId: string, challenge: string) => {
    const student = students.find(s => s.id === studentId);
    if (!student || !student.challenges || !student.challenges[challenge]?.file) return;

    try {
      // Delete file from Firebase Storage
      const fileUrl = student.challenges[challenge].file!;
      const fileRef = ref(storage, fileUrl);
      await deleteObject(fileRef);

      // Update Firestore document
      const studentRef = doc(db, 'students', studentId);
      const updatedChallenges = {
        ...student.challenges,
        [challenge]: {
          completed: false,
          file: undefined
        }
      };
      
      // Recalculate XP and Power Points
      const xpChange = -10; // Remove points for completed challenge
      const ppChange = -5;
      const newXP = Math.max(0, (student.xp || 0) + xpChange);
      const newPP = Math.max(0, (student.powerPoints || 0) + ppChange);

      await updateDoc(studentRef, {
        challenges: updatedChallenges,
        xp: newXP,
        powerPoints: newPP
      });

      // Update local state
      setStudents(prev =>
        prev.map(s =>
          s.id === studentId
            ? { ...s, challenges: updatedChallenges, xp: newXP, powerPoints: newPP }
            : s
        )
      );

      setShowDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting submission:', error);
      alert('Failed to delete submission. Please try again.');
    }
  };

  const startEditing = (student: Student) => {
    setEditingStudent(student.id);
    setEditForm({
      displayName: student.displayName || '',
      email: student.email || ''
    });
  };

  const saveEdit = async (studentId: string) => {
    try {
      // Update both 'students' and 'users' collections to keep them in sync
      const studentRef = doc(db, 'students', studentId);
      const userRef = doc(db, 'users', studentId);
      
      const updateData = {
        displayName: editForm.displayName,
        email: editForm.email
      };
      
      await updateDoc(studentRef, updateData);
      await updateDoc(userRef, updateData);

      setStudents(prev =>
        prev.map(s =>
          s.id === studentId
            ? { ...s, displayName: editForm.displayName, email: editForm.email }
            : s
        )
      );

      setEditingStudent(null);
      setEditForm({ displayName: '', email: '' });
    } catch (error) {
      console.error('Error updating student:', error);
      alert('Failed to update student info. Please try again.');
    }
  };

  const cancelEdit = () => {
    setEditingStudent(null);
    setEditForm({ displayName: '', email: '' });
  };

  // Add/subtract Power Points
  const adjustPowerPoints = async (studentId: string, delta: number) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const newPP = Math.max(0, (student.powerPoints || 0) + delta);
    const studentRef = doc(db, 'students', studentId);
    await updateDoc(studentRef, { powerPoints: newPP });
    setStudents(prev =>
      prev.map(s =>
        s.id === studentId ? { ...s, powerPoints: newPP } : s
      )
    );
  };

  // Batch Power Points adjustment
  const adjustBatchPowerPoints = async (delta: number) => {
    if (selected.length === 0) return;
    
    try {
      const updates = selected.map(async studentId => {
        const student = students.find(s => s.id === studentId);
        if (!student) return;
        const newPP = Math.max(0, (student.powerPoints || 0) + delta);
        const studentRef = doc(db, 'students', studentId);
        await updateDoc(studentRef, { powerPoints: newPP });
        return { id: studentId, newPP };
      });
      
      const results = await Promise.all(updates);
      setStudents(prev =>
        prev.map(s => {
          const found = results.find(r => r && r.id === s.id);
          return found ? { ...s, powerPoints: found.newPP } : s;
        })
      );
      
      // Show success message
      const action = delta > 0 ? 'added' : 'removed';
      const absDelta = Math.abs(delta);
      setBatchMessage(`Successfully ${action} ${absDelta} Power Points to ${selected.length} student${selected.length !== 1 ? 's' : ''}!`);
      setShowBatchSuccess(true);
      
      // Auto-hide after 3 seconds
      setTimeout(() => setShowBatchSuccess(false), 3000);
      
      setSelected([]);
    } catch (error) {
      console.error('Error updating batch power points:', error);
      alert('Failed to update power points. Please try again.');
    }
  };

  const toggleSelect = (studentId: string) => {
    setSelected(prev => prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]);
  };
  const selectAll = () => {
    setSelected(students.map(s => s.id));
  };
  const deselectAll = () => {
    setSelected([]);
  };

  const viewStudentProfile = (studentId: string) => {
    setViewingProfile(studentId);
  };

  const closeProfileView = () => {
    setViewingProfile(null);
  };

  // Force refresh function to get fresh data
  const forceRefresh = async () => {
    console.log('Force refreshing data...');
    const fetchStudents = async () => {
      console.log('Fetching students data...');
      
      // Force fresh data by using getDocs with no caching
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const studentsSnapshot = await getDocs(collection(db, 'students'));
      
      console.log('Users collection size:', usersSnapshot.docs.length);
      console.log('Students collection size:', studentsSnapshot.docs.length);
      
      // Create a map of user data from the 'users' collection
      const usersMap = new Map();
      usersSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        console.log('User data for', doc.id, ':', userData);
        usersMap.set(doc.id, {
          id: doc.id,
          displayName: userData.displayName || 'Unnamed Student',
          email: userData.email || 'No email',
          photoURL: userData.photoURL,
          createdAt: userData.createdAt,
          lastLogin: userData.lastLogin,
          ...userData
        });
      });
      
      // Merge with student data from 'students' collection
      const studentsMap = new Map();
      studentsSnapshot.docs.forEach(doc => {
        const studentData = doc.data();
        console.log('Student data for', doc.id, ':', studentData);
        const userId = doc.id;
        const userData = usersMap.get(userId) || {};
        
        const mergedData = {
          id: userId,
          ...userData,
          ...studentData,
          displayName: studentData.displayName || userData.displayName || 'Unnamed Student',
          email: studentData.email || userData.email || 'No email',
          photoURL: studentData.photoURL || userData.photoURL,
          xp: studentData.xp || 0,
          powerPoints: studentData.powerPoints || 0,
          challenges: studentData.challenges || {},
        };
        
        console.log('Merged data for', userId, ':', mergedData);
        studentsMap.set(userId, mergedData);
      });
      
      // Add any users that don't have student records yet
      usersMap.forEach((userData, userId) => {
        if (!studentsMap.has(userId)) {
          console.log('Adding user without student record:', userId, userData);
          studentsMap.set(userId, {
            ...userData,
            xp: 0,
            powerPoints: 0,
            challenges: {}
          });
        }
      });
      
      const list = Array.from(studentsMap.values()) as Student[];
      console.log('Final students list:', list);
      setStudents(list);
    };
    
    await fetchStudents();
    alert('Data refreshed! Check console for details.');
  };

  // Migration function to fix existing users without display names
  const migrateUserNames = async () => {
    try {
      console.log('Starting user name migration...');
      const studentsSnapshot = await getDocs(collection(db, 'students'));
      let migratedCount = 0;
      let skippedCount = 0;
      
      for (const studentDoc of studentsSnapshot.docs) {
        const studentData = studentDoc.data();
        const userId = studentDoc.id;
        
        // Skip if already has a display name
        if (studentData.displayName) {
          console.log(`Skipping student ${userId}: already has displayName "${studentData.displayName}"`);
          skippedCount++;
          continue;
        }
        
        let displayName = undefined;
        
        // Try to get name from student email first
        if (studentData.email) {
          displayName = studentData.email.split('@')[0];
          console.log(`Found email in student data for ${userId}: ${studentData.email}`);
        } else {
          // Try to get from users collection
          const userDoc = await getDoc(doc(db, 'users', userId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.email) {
              displayName = userData.email.split('@')[0];
              console.log(`Found email in user data for ${userId}: ${userData.email}`);
            } else {
              // Generate a name from the user ID if no email available
              displayName = `Student_${userId.substring(0, 8)}`;
              console.log(`No email found for ${userId}, generating name: ${displayName}`);
            }
          } else {
            // Generate a name from the user ID if no user document
            displayName = `Student_${userId.substring(0, 8)}`;
            console.log(`No user document for ${userId}, generating name: ${displayName}`);
          }
        }
        
        if (displayName) {
          console.log(`Migrating student ${userId}: setting displayName to "${displayName}"`);
          await updateDoc(doc(db, 'students', userId), { displayName });
          await updateDoc(doc(db, 'users', userId), { displayName });
          migratedCount++;
        }
      }
      
      console.log(`Migration completed: ${migratedCount} students migrated, ${skippedCount} skipped`);
      
      // Refresh the list after migration
      await forceRefresh();
      alert(`User names migration completed! ${migratedCount} students updated, ${skippedCount} skipped.`);
    } catch (error) {
      console.error('Error during migration:', error);
      alert('Migration failed. Please check console for details.');
    }
  };

  // Test level-up notification
  const testLevelUpNotification = () => {
    // Test level up from Level 1 to Level 2 (0 XP to 100 XP)
    showLevelUpNotification(100, 0);
  };

  // Approve submission handler
  const handleApprove = async (sub: any) => {
    setRowLoading(prev => ({ ...prev, [sub.id]: true }));
    setRowError(prev => ({ ...prev, [sub.id]: '' }));
    try {
      // 1. Update submission status
      await updateDoc(doc(db, 'challengeSubmissions', sub.id), { status: 'approved' });
      
      // 2. Handle different submission types
      if (sub.submissionType === 'chapter_challenge') {
        // Handle chapter challenge submissions
        const userRef = doc(db, 'users', sub.userId);
        const studentRef = doc(db, 'students', sub.userId);
        
        // Get current user progress
        const userDoc = await getDoc(userRef);
        const studentDoc = await getDoc(studentRef);
        const userProgress = userDoc.exists() ? userDoc.data() : {};
        const studentData = studentDoc.exists() ? studentDoc.data() : {};
        
        // Mark challenge as completed in user progress
        const updatedChapters = {
          ...userProgress.chapters,
          [sub.chapterId]: {
            ...userProgress.chapters?.[sub.chapterId],
            challenges: {
              ...userProgress.chapters?.[sub.chapterId]?.challenges,
              [sub.challengeId]: {
                isCompleted: true,
                completionDate: new Date()
              }
            }
          }
        };
        
        // Apply rewards
        let newXP = (userProgress.xp || 0) + (sub.xpReward || 0);
        let newPP = (userProgress.powerPoints || 0) + (sub.ppReward || 0);
        
        // Update both collections
        await updateDoc(userRef, {
          chapters: updatedChapters,
          xp: newXP,
          powerPoints: newPP
        });
        
        // Also update legacy challenges field for profile display compatibility
        const updatedLegacyChallenges = {
          ...studentData.challenges,
          [sub.challengeId]: {
            ...(studentData.challenges?.[sub.challengeId] || {}),
            completed: true,
            submitted: true,
            status: 'approved'
          }
        };
        
        await updateDoc(studentRef, {
          xp: (studentData.xp || 0) + (sub.xpReward || 0),
          powerPoints: (studentData.powerPoints || 0) + (sub.ppReward || 0),
          challenges: updatedLegacyChallenges
        });
        
        // Check if all challenges in chapter are completed
        const chapterProgress = updatedChapters[sub.chapterId];
        const allChallengesCompleted = chapterProgress?.challenges && 
          Object.values(chapterProgress.challenges).every((ch: any) => ch.isCompleted);
        
        if (allChallengesCompleted) {
          await updateDoc(userRef, {
            [`chapters.${sub.chapterId}.isCompleted`]: true,
            [`chapters.${sub.chapterId}.completionDate`]: new Date(),
            [`chapters.${sub.chapterId}.isActive`]: false
          });
          
          // Activate next chapter if available
          const nextChapter = sub.chapterId + 1;
          if (nextChapter <= 9) {
            await updateDoc(userRef, {
              [`chapters.${nextChapter}.isActive`]: true,
              [`chapters.${nextChapter}.unlockDate`]: new Date()
            });
            
            // Update storyChapter in students collection for profile display
            await updateDoc(studentRef, {
              storyChapter: nextChapter
            });
            
            // Add notification for chapter unlock
            await addDoc(collection(db, 'students', sub.userId, 'notifications'), {
              type: 'chapter_unlocked',
              message: `🎉 Chapter ${sub.chapterId} Complete! Chapter ${nextChapter} is now unlocked!`,
              chapterId: nextChapter,
              timestamp: serverTimestamp(),
              read: false
            });
          }
        }
      } else {
        // Handle legacy file-based submissions
        const studentRef = doc(db, 'students', sub.userId);
        const studentSnap = await getDoc(studentRef);
        if (studentSnap.exists()) {
          const studentData = studentSnap.data();
          const challenges = { ...studentData.challenges };
          challenges[sub.challengeId] = {
            ...(challenges[sub.challengeId] || {}),
            completed: true,
            submitted: true,
            status: 'approved',
            file: sub.fileUrl
          };
          const xpReward = sub.xpReward || 10;
          const ppReward = sub.ppReward || 5;
          const newXP = (studentData.xp || 0) + xpReward;
          const newPP = (studentData.powerPoints || 0) + ppReward;
          
          // Check if this challenge completion should advance to next chapter
          const currentChapter = studentData.storyChapter || 1;
          const chapter = CHAPTERS.find(ch => ch.id === currentChapter);
          let updateData: any = {
            challenges,
            xp: newXP,
            powerPoints: newPP
          };
          
          if (chapter) {
            // Check if all chapter challenges are now completed
            const chapterChallengeIds = chapter.challenges.map(ch => ch.id);
            const completedChapterChallenges = chapterChallengeIds.filter(id => 
              challenges[id]?.completed || id === sub.challengeId
            );
            
            // If all chapter challenges are completed, advance to next chapter
            if (completedChapterChallenges.length === chapterChallengeIds.length && currentChapter < 9) {
              updateData.storyChapter = currentChapter + 1;
              
              // Add notification for chapter completion
              await addDoc(collection(db, 'students', sub.userId, 'notifications'), {
                type: 'chapter_unlocked',
                message: `🎉 Chapter ${currentChapter} Complete! Chapter ${currentChapter + 1} is now unlocked!`,
                chapterId: currentChapter + 1,
                timestamp: serverTimestamp(),
                read: false
              });
            }
          }
          
          await updateDoc(studentRef, updateData);
        }
      }
      
      // 3. Add notification to notifications subcollection
      await addDoc(collection(db, 'students', sub.userId, 'notifications'), {
        type: 'challenge_approved',
        message: `Your submission for "${sub.challengeName}" was approved! You earned ${sub.xpReward || 10} XP and ${sub.ppReward || 5} PP.`,
        challengeId: sub.challengeId,
        challengeName: sub.challengeName,
        xpReward: sub.xpReward || 10,
        ppReward: sub.ppReward || 5,
        timestamp: serverTimestamp(),
        read: false
      });
      
      // 4. Remove from UI
      setSubmissions(prev => prev.filter(s => s.id !== sub.id));
    } catch (err: any) {
      setRowError(prev => ({ ...prev, [sub.id]: 'Failed to approve. Try again.' }));
    } finally {
      setRowLoading(prev => ({ ...prev, [sub.id]: false }));
    }
  };

  // Deny submission handler
  const handleDeny = async (sub: any) => {
    setRowLoading(prev => ({ ...prev, [sub.id]: true }));
    setRowError(prev => ({ ...prev, [sub.id]: '' }));
    try {
      // 1. Update submission status
      await updateDoc(doc(db, 'challengeSubmissions', sub.id), { status: 'denied' });
      // 2. Add notification to notifications subcollection
      await addDoc(collection(db, 'students', sub.userId, 'notifications'), {
        type: 'challenge_denied',
        message: `Your submission for "${sub.challengeName}" was denied. Please update your work and resubmit for review.`,
        challengeId: sub.challengeId,
        challengeName: sub.challengeName,
        timestamp: serverTimestamp(),
        read: false
      });
      // 3. Remove from UI
      setSubmissions(prev => prev.filter(s => s.id !== sub.id));
    } catch (err: any) {
      setRowError(prev => ({ ...prev, [sub.id]: 'Failed to deny. Try again.' }));
    } finally {
      setRowLoading(prev => ({ ...prev, [sub.id]: false }));
    }
  };

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937' }}>
          Admin Panel
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={forceRefresh}
            style={{
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Refresh Data
          </button>
          <button
            onClick={migrateUserNames}
            style={{
              backgroundColor: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Fix User Names
          </button>
          <button
            onClick={testLevelUpNotification}
            style={{
              backgroundColor: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Test Level Up
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
        <button
          onClick={() => setActiveTab('students')}
          style={{
            backgroundColor: activeTab === 'students' ? '#4f46e5' : '#e5e7eb',
            color: activeTab === 'students' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
        >
          Student Management
        </button>
        <button
          onClick={() => setActiveTab('badges')}
          style={{
            backgroundColor: activeTab === 'badges' ? '#4f46e5' : '#e5e7eb',
            color: activeTab === 'badges' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
        >
          Badge Manager
        </button>
        <button
          onClick={() => setActiveTab('setup')}
          style={{
            backgroundColor: activeTab === 'setup' ? '#4f46e5' : '#e5e7eb',
            color: activeTab === 'setup' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
        >
          Badge Setup
        </button>
        <button
          onClick={() => setActiveTab('submissions')}
          style={{
            backgroundColor: activeTab === 'submissions' ? '#4f46e5' : '#e5e7eb',
            color: activeTab === 'submissions' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '0.875rem',
            position: 'relative'
          }}
        >
          Submissions
          {pendingSubmissionCount > 0 && (
            <span style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
              background: '#ef4444',
              color: 'white',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold'
            }}>
              {pendingSubmissionCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('assignments')}
          style={{
            backgroundColor: activeTab === 'assignments' ? '#4f46e5' : '#e5e7eb',
            color: activeTab === 'assignments' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
        >
          Chapter Assignments
        </button>
        <button
          onClick={() => setActiveTab('classroom')}
          style={{
            backgroundColor: activeTab === 'classroom' ? '#4f46e5' : '#e5e7eb',
            color: activeTab === 'classroom' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
        >
          Google Classroom
        </button>
        <button
          onClick={() => setActiveTab('classroom-management')}
          style={{
            backgroundColor: activeTab === 'classroom-management' ? '#4f46e5' : '#e5e7eb',
            color: activeTab === 'classroom-management' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
        >
          Classroom Management
        </button>
        <button
          onClick={() => setActiveTab('manifests')}
          style={{
            backgroundColor: activeTab === 'manifests' ? '#4f46e5' : '#e5e7eb',
            color: activeTab === 'manifests' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '0.875rem'
          }}
        >
          Manifests
        </button>
      </div>

      {activeTab === 'badges' ? (
        <BadgeManager />
      ) : activeTab === 'setup' ? (
        <BadgeSetup />
      ) : activeTab === 'assignments' ? (
        <ChapterAssignmentManager />
      ) : activeTab === 'classroom' ? (
        <GoogleClassroomIntegration />
      ) : activeTab === 'classroom-management' ? (
        <ClassroomManagement />
      ) : activeTab === 'manifests' ? (
        <div style={{
          background: '#f8fafc',
          borderRadius: '0.75rem',
          padding: '2rem',
          minHeight: '300px',
          color: '#374151',
          border: '1px solid #e5e7eb',
          marginBottom: '2rem'
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', textAlign: 'center' }}>All Manifests</h2>
          <p style={{ fontSize: '1.125rem', color: '#6b7280', textAlign: 'center', marginBottom: '2rem' }}>
            View all available manifests in the Nine Knowings Universe and their details.
          </p>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {MANIFESTS.map((manifest) => (
              <div key={manifest.id} style={{
                background: 'white',
                borderRadius: '0.75rem',
                padding: '1.5rem',
                border: '1px solid #e5e7eb',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '2rem', marginRight: '0.75rem' }}>{manifest.icon}</span>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: manifest.color, margin: 0 }}>
                      {manifest.name}
                    </h3>
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: 0 }}>
                      ID: {manifest.id}
                    </p>
                  </div>
                </div>
                
                <p style={{ color: '#374151', marginBottom: '1rem', lineHeight: '1.5' }}>
                  {manifest.description}
                </p>
                
                <div style={{ marginBottom: '1rem' }}>
                  <strong style={{ color: '#374151' }}>Catalyst:</strong> {manifest.catalyst}
                </div>
                
                <div style={{ marginBottom: '1rem' }}>
                  <strong style={{ color: '#374151' }}>Signature Move:</strong> {manifest.signatureMove}
                </div>
                
                <div>
                  <strong style={{ color: '#374151' }}>Levels:</strong>
                  <div style={{ marginTop: '0.5rem' }}>
                    {manifest.levels.map((level) => (
                      <div key={level.level} style={{
                        background: level.unlocked ? '#f0f9ff' : '#f3f4f6',
                        border: `1px solid ${level.unlocked ? '#0ea5e9' : '#d1d5db'}`,
                        borderRadius: '0.375rem',
                        padding: '0.75rem',
                        marginBottom: '0.5rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                          <span style={{ fontWeight: 'bold', color: level.unlocked ? '#0ea5e9' : '#6b7280' }}>
                            Level {level.level}: {level.scale}
                          </span>
                          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                            {level.xpRequired} XP
                          </span>
                        </div>
                        <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0.25rem 0' }}>
                          {level.description}
                        </p>
                        <p style={{ fontSize: '0.875rem', color: '#059669', fontStyle: 'italic', margin: 0 }}>
                          Example: {level.example}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : activeTab === 'submissions' ? (
        <>
          <div style={{
            background: '#f8fafc',
            borderRadius: '0.75rem',
            padding: '2rem',
            minHeight: '300px',
            color: '#374151',
            border: '1px solid #e5e7eb',
            marginBottom: '2rem'
          }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', textAlign: 'center' }}>Challenge Submissions</h2>
            <p style={{ fontSize: '1.125rem', color: '#6b7280', textAlign: 'center', marginBottom: '2rem' }}>
              Review pending challenge submissions from students. Approve to award XP/PP, or deny to require resubmission.
            </p>
            {submissionsLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>Loading submissions...</div>
            ) : submissionsError ? (
              <div style={{ textAlign: 'center', color: '#dc2626', padding: '2rem' }}>{submissionsError}</div>
            ) : submissions.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>No pending submissions at this time.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 'bold', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Student</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 'bold', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Challenge</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 'bold', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Type</th>
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 'bold', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Submitted At</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 'bold', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {submissions.map(sub => (
                      <tr key={sub.id}>
                        <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <img src={sub.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(sub.displayName || 'Student')}&background=4f46e5&color=fff&size=48`} alt={sub.displayName || 'Student'} style={{ width: 36, height: 36, borderRadius: '50%' }} />
                          <div>
                            <div style={{ fontWeight: 'bold' }}>
                              {sub.displayName || 'Unnamed Student'} <span style={{ color: '#4f46e5', fontWeight: 'normal', fontSize: '0.95em' }}>(Lv. {(() => {
                                const student = students.find(s => s.id === sub.userId);
                                return student ? getLevelFromXP(student.xp || 0) : '?';
                              })()})</span>
                            </div>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{sub.email || ''}</div>
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                          <div>
                            <div style={{ fontWeight: 'bold' }}>{sub.challengeName || sub.challengeId || 'Unknown'}</div>
                            {sub.submissionType === 'chapter_challenge' && (
                              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                                Chapter {sub.chapterId} • {sub.challengeDescription || 'No description'}
                              </div>
                            )}
                            <div style={{ fontSize: '0.75rem', color: '#10b981', marginTop: '0.25rem' }}>
                              Reward: {sub.xpReward || 0} XP, {sub.ppReward || 0} PP
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                          {sub.submissionType === 'chapter_challenge' ? (
                            <span style={{ color: '#10b981', fontWeight: 'bold' }}>Chapter Challenge</span>
                          ) : sub.fileUrl ? (
                            <button
                              onClick={() => handleViewFile(sub.fileUrl, sub.fileName || 'Submitted File')}
                              style={{
                                color: '#2563eb',
                                textDecoration: 'underline',
                                background: '#f8fafc',
                                border: '1px solid #d1d5db',
                                cursor: 'pointer',
                                fontSize: 'inherit',
                                padding: '6px 12px',
                                borderRadius: '6px',
                                transition: 'all 0.2s',
                                fontWeight: '500'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = '#e5e7eb';
                                e.currentTarget.style.borderColor = '#9ca3af';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = '#f8fafc';
                                e.currentTarget.style.borderColor = '#d1d5db';
                              }}
                            >
                              📁 View File
                            </button>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>No file</span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>{sub.timestamp && sub.timestamp.toDate ? sub.timestamp.toDate().toLocaleString() : ''}</td>
                        <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb', textAlign: 'center' }}>
                          <button
                            style={{ background: '#10b981', color: 'white', border: 'none', borderRadius: '0.375rem', padding: '0.5rem 1rem', fontWeight: 'bold', marginRight: 8, cursor: rowLoading[sub.id] ? 'wait' : 'pointer', opacity: rowLoading[sub.id] ? 0.5 : 1 }}
                            disabled={rowLoading[sub.id]}
                            onClick={() => handleApprove(sub)}
                          >
                            {rowLoading[sub.id] ? 'Approving...' : 'Approve'}
                          </button>
                          <button
                            style={{ background: '#dc2626', color: 'white', border: 'none', borderRadius: '0.375rem', padding: '0.5rem 1rem', fontWeight: 'bold', cursor: rowLoading[sub.id] ? 'wait' : 'pointer', opacity: rowLoading[sub.id] ? 0.5 : 1 }}
                            disabled={rowLoading[sub.id]}
                            onClick={() => handleDeny(sub)}
                          >
                            {rowLoading[sub.id] ? 'Denying...' : 'Deny'}
                          </button>
                          {rowError[sub.id] && (
                            <div style={{ color: '#dc2626', fontSize: '0.875rem', marginTop: 4 }}>{rowError[sub.id]}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : activeTab === 'students' ? (
        <>
          {/* Student Management Content */}
          <div style={{
            background: '#f8fafc',
            borderRadius: '0.75rem',
            padding: '2rem',
            minHeight: '300px',
            color: '#374151',
            border: '1px solid #e5e7eb',
            marginBottom: '2rem'
          }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', textAlign: 'center' }}>
              👥 Student Management
            </h2>
            <p style={{ fontSize: '1.125rem', color: '#6b7280', textAlign: 'center', marginBottom: '2rem' }}>
              Manage student accounts, view progress, and adjust settings.
            </p>

            {/* Batch Operations */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>Batch Operations</h3>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <button
                  onClick={selectAll}
                  style={{
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}
                >
                  Select All
                </button>
                <button
                  onClick={deselectAll}
                  style={{
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500'
                  }}
                >
                  Deselect All
                </button>
              </div>
              
              {selected.length > 0 && (
                <div style={{
                  backgroundColor: '#f0f9ff',
                  border: '1px solid #0ea5e9',
                  borderRadius: '0.5rem',
                  padding: '1rem',
                  marginBottom: '1rem'
                }}>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: '#0ea5e9' }}>
                    Batch Operations ({selected.length} selected)
                  </h4>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <input
                      type="number"
                      value={batchPP}
                      onChange={(e) => setBatchPP(parseInt(e.target.value) || 1)}
                      style={{
                        width: '80px',
                        padding: '0.5rem',
                        border: '1px solid #d1d5db',
                        borderRadius: '0.375rem'
                      }}
                      min="1"
                    />
                    <button
                      onClick={() => adjustBatchPowerPoints(1)}
                      style={{
                        backgroundColor: '#10b981',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}
                    >
                      Add {batchPP} PP
                    </button>
                    <button
                      onClick={() => adjustBatchPowerPoints(-1)}
                      style={{
                        backgroundColor: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}
                    >
                      Remove {batchPP} PP
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Students Table */}
            <div style={{
              backgroundColor: 'white',
              borderRadius: '0.5rem',
              overflow: 'hidden',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f9fafb' }}>
                    <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      <input
                        type="checkbox"
                        checked={selected.length === students.length && students.length > 0}
                        onChange={() => selected.length === students.length ? deselectAll() : selectAll()}
                      />
                    </th>
                    <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Student</th>
                    <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Level</th>
                    <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>XP</th>
                    <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Power Points</th>
                    <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td style={{ padding: '1rem' }}>
                        <input
                          type="checkbox"
                          checked={selected.includes(student.id)}
                          onChange={() => toggleSelect(student.id)}
                        />
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <img
                            src={student.photoURL || `https://ui-avatars.com/api/?name=${student.displayName}&background=4f46e5&color=fff&size=32`}
                            alt={student.displayName}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              objectFit: 'cover'
                            }}
                          />
                          <div>
                            <div style={{ fontWeight: '600', color: '#1f2937' }}>
                              {student.displayName}
                            </div>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                              {student.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{
                          backgroundColor: '#f0f9ff',
                          color: '#0ea5e9',
                          padding: '0.25rem 0.75rem',
                          borderRadius: '1rem',
                          fontSize: '0.875rem',
                          fontWeight: '500'
                        }}>
                          Level {getLevelFromXP(student.xp || 0)}
                        </span>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <span style={{ fontWeight: '500', color: '#1f2937' }}>
                          {student.xp || 0} XP
                        </span>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontWeight: '500', color: '#1f2937' }}>
                            {student.powerPoints || 0} PP
                          </span>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button
                              onClick={() => adjustPowerPoints(student.id, 1)}
                              style={{
                                backgroundColor: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.25rem',
                                padding: '0.25rem 0.5rem',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: '500'
                              }}
                            >
                              +
                            </button>
                            <button
                              onClick={() => adjustPowerPoints(student.id, -1)}
                              style={{
                                backgroundColor: '#dc2626',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.25rem',
                                padding: '0.25rem 0.5rem',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: '500'
                              }}
                            >
                              -
                            </button>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            onClick={() => viewStudentProfile(student.id)}
                            style={{
                              backgroundColor: '#3b82f6',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.375rem',
                              padding: '0.5rem 0.75rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem',
                              fontWeight: '500'
                            }}
                          >
                            View Profile
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {students.length === 0 && (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#9ca3af' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  No Students Found
                </h3>
                <p style={{ fontSize: '1rem' }}>
                  Students will appear here once they register and start using the platform.
                </p>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Student Management Content */}
          {/* ... existing student management code ... */}
        </>
      )}

      {/* File Viewer Modal */}
      {viewingFile && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '2rem'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setViewingFile(null);
          }
        }}
        >
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'auto',
            position: 'relative',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem 1.5rem',
              borderBottom: '1px solid #e5e7eb',
              background: '#f8fafc'
            }}>
              <h3 style={{ margin: 0, fontWeight: 'bold', color: '#374151' }}>
                {viewingFile.name}
              </h3>
              <button
                onClick={() => setViewingFile(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#6b7280',
                  padding: '0.25rem'
                }}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '1.5rem' }}>
              {viewingFile.type === 'image' ? (
                <img
                  src={viewingFile.url}
                  alt={viewingFile.name}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '70vh',
                    objectFit: 'contain',
                    borderRadius: '0.5rem'
                  }}
                />
              ) : viewingFile.type === 'pdf' ? (
                <iframe
                  src={viewingFile.url}
                  style={{
                    width: '100%',
                    height: '70vh',
                    border: 'none',
                    borderRadius: '0.5rem'
                  }}
                  title={viewingFile.name}
                />
              ) : viewingFile.type === 'text' ? (
                <div style={{
                  background: '#f8fafc',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '70vh',
                  overflow: 'auto'
                }}>
                  <div style={{ color: '#6b7280', marginBottom: '0.5rem' }}>
                    Text content preview not available. Please download the file to view.
                  </div>
                </div>
              ) : viewingFile.type === '3d' ? (
                <div style={{
                  background: '#f8fafc',
                  padding: '2rem',
                  borderRadius: '0.5rem',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🗿</div>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    3D Model File
                  </div>
                  <div style={{ color: '#6b7280', marginBottom: '1rem' }}>
                    This is a 3D model file ({viewingFile.name.split('.').pop()?.toUpperCase()}). 
                    Please download it to view in your 3D modeling software.
                  </div>
                </div>
              ) : (
                <div style={{
                  background: '#f8fafc',
                  padding: '2rem',
                  borderRadius: '0.5rem',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📄</div>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    Unknown File Type
                  </div>
                  <div style={{ color: '#6b7280', marginBottom: '1rem' }}>
                    Unable to preview this file type. Please download to view.
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1rem 1.5rem',
              borderTop: '1px solid #e5e7eb',
              background: '#f8fafc'
            }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                File type: {viewingFile.type.toUpperCase()}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = viewingFile.url;
                    link.download = viewingFile.name;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  style={{
                    background: '#2563eb',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.5rem 1rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Download
                </button>
                <button
                  onClick={() => window.open(viewingFile.url, '_blank')}
                  style={{
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.5rem 1rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Open in New Tab
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Student Profile View Modal */}
      {viewingProfile && (() => {
        const student = students.find(s => s.id === viewingProfile);
        if (!student) return null;

        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '0.75rem',
              padding: '2rem',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>
                  Student Profile
                </h2>
                <button
                  onClick={closeProfileView}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.5rem',
                    cursor: 'pointer',
                    color: '#6b7280',
                    padding: '0.25rem'
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Student Info */}
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem' }}>
                <img
                  src={student.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.displayName || 'Student')}&background=4f46e5&color=fff&size=128`}
                  alt={student.displayName || 'Student'}
                  style={{
                    width: '128px',
                    height: '128px',
                    borderRadius: '50%',
                    objectFit: 'cover'
                  }}
                />
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937', margin: '0 0 0.5rem 0' }}>
                    {student.displayName || 'Unnamed Student'}
                  </h3>
                  <p style={{ color: '#6b7280', margin: '0 0 0.5rem 0' }}>
                    {student.email || 'No email'}
                  </p>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#4f46e5' }}>
                        Level {getLevelFromXP(student.xp || 0)}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Level</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#10b981' }}>
                        {student.xp || 0}
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>XP</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#f59e0b' }}>
                        {student.powerPoints || 0} PP
                      </div>
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Power Points</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bio */}
              {student.bio && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#1f2937', margin: '0 0 0.5rem 0' }}>
                    Bio
                  </h4>
                  <p style={{ color: '#6b7280', margin: 0 }}>
                    {student.bio}
                  </p>
                </div>
              )}

              {/* Character Card Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#1f2937', margin: '0 0 0.5rem 0' }}>
                    Manifestation Type
                  </h4>
                  <div style={{ 
                    backgroundColor: student.cardBgColor || '#e0e7ff',
                    padding: '0.5rem',
                    borderRadius: '0.375rem',
                    textAlign: 'center',
                    fontWeight: 'bold'
                  }}>
                    {getManifestDisplayName(student)}
                  </div>
                </div>
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#1f2937', margin: '0 0 0.5rem 0' }}>
                    Rarity
                  </h4>
                  <div style={{ 
                    backgroundColor: '#f3f4f6',
                    padding: '0.5rem',
                    borderRadius: '0.375rem',
                    textAlign: 'center',
                    fontWeight: 'bold'
                  }}>
                    {student.rarity ? '★'.repeat(student.rarity) : '☆'}
                  </div>
                </div>
              </div>

              {/* Moves */}
              {student.moves && student.moves.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#1f2937', margin: '0 0 0.5rem 0' }}>
                    Moves
                  </h4>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    {student.moves.map((move: any, index: number) => (
                      <div key={index} style={{
                        backgroundColor: '#f3f4f6',
                        padding: '0.75rem',
                        borderRadius: '0.375rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1.25rem' }}>{move.icon}</span>
                          <div>
                            <div style={{ fontWeight: 'bold' }}>{move.name}</div>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{move.description}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chapter Progress */}
              {(() => {
                const chapterProgress = getChapterProgress(student);
                return (
                  <div>
                    <h4 style={{ fontSize: '1rem', fontWeight: 'bold', color: '#1f2937', margin: '0 0 0.5rem 0' }}>
                      Chapter Progress
                    </h4>
                    
                    {/* Current Chapter Info */}
                    <div style={{ 
                      backgroundColor: '#f8fafc', 
                      padding: '1rem', 
                      borderRadius: '0.5rem', 
                      marginBottom: '1rem',
                      border: '1px solid #e2e8f0'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <h5 style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#4f46e5', margin: 0 }}>
                          Chapter {chapterProgress.currentChapter}
                        </h5>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          fontWeight: 'bold',
                          color: chapterProgress.completed === chapterProgress.total ? '#10b981' : '#f59e0b'
                        }}>
                          {chapterProgress.completed} / {chapterProgress.total} Complete
                        </span>
                      </div>
                      <h6 style={{ fontSize: '0.875rem', color: '#1f2937', margin: '0 0 0.5rem 0' }}>
                        {chapterProgress.chapterTitle}
                      </h6>
                      
                      {/* Progress Bar */}
                      <div style={{ 
                        backgroundColor: '#e2e8f0', 
                        borderRadius: '0.25rem', 
                        height: '0.5rem', 
                        width: '100%',
                        overflow: 'hidden'
                      }}>
                        <div style={{ 
                          width: `${chapterProgress.total > 0 ? (chapterProgress.completed / chapterProgress.total) * 100 : 0}%`,
                          backgroundColor: chapterProgress.completed === chapterProgress.total ? '#10b981' : '#4f46e5',
                          height: '100%',
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>

                    {/* Chapter Challenges */}
                    {chapterProgress.challenges.length > 0 && (
                      <div style={{ display: 'grid', gap: '0.5rem' }}>
                        {chapterProgress.challenges.map((challenge: any) => {
                          const getStatusColor = () => {
                            if (challenge.completed) return '#dcfce7';
                            if (challenge.isPending) return '#e0e7ff';
                            return '#fef3c7';
                          };
                          
                          const getBadgeColor = () => {
                            if (challenge.completed) return '#10b981';
                            if (challenge.isPending) return '#6366f1';
                            return '#f59e0b';
                          };
                          
                          const getStatusText = () => {
                            if (challenge.completed) return 'Completed';
                            if (challenge.isPending) return 'Pending Review';
                            return 'In Progress';
                          };
                          
                          return (
                            <div key={challenge.id} style={{
                              backgroundColor: getStatusColor(),
                              padding: '0.75rem',
                              borderRadius: '0.375rem',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center'
                            }}>
                              <span style={{ fontWeight: '500', fontSize: '0.875rem' }}>{challenge.title}</span>
                              <span style={{
                                backgroundColor: getBadgeColor(),
                                color: 'white',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.25rem',
                                fontSize: '0.75rem',
                                fontWeight: 'bold'
                              }}>
                                {getStatusText()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default AdminPanel; 