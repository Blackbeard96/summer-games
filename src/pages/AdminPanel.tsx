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
import { useAuth } from '../context/AuthContext';
import ClassroomManagement from '../components/ClassroomManagement';
import ManifestDiagnostic from '../components/ManifestDiagnostic';
import TestAccountManager from '../components/TestAccountManager';
import TestAccountLogin from '../components/TestAccountLogin';
import FirebaseRulesChecker from '../components/FirebaseRulesChecker';
import RoleManager from '../components/RoleManager';
import ScorekeeperInterface from '../components/ScorekeeperInterface';
import PPChangeApproval from '../components/PPChangeApproval';
import RoleSystemSetup from '../components/RoleSystemSetup';
import ManifestAdmin from '../components/ManifestAdmin';

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
  chapters?: { [chapterId: string]: any };
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
  const { currentUser } = useAuth();
  const [students, setStudents] = useState<Student[]>([]);
  const [editingStudent, setEditingStudent] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ displayName: '', email: '' });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ studentId: string; challenge: string } | null>(null);
  const [ppAmount, setPPAmount] = useState<{ [studentId: string]: number | undefined }>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [batchPP, setBatchPP] = useState(1);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [showManifestDiagnostic, setShowManifestDiagnostic] = useState(false);
  const [showTestAccountManager, setShowTestAccountManager] = useState(false);
  const [showTestAccountLogin, setShowTestAccountLogin] = useState(false);
  const [showFirebaseRulesChecker, setShowFirebaseRulesChecker] = useState(false);
  const [showManifestAdmin, setShowManifestAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState<'students' | 'badges' | 'setup' | 'submissions' | 'assignments' | 'classroom' | 'classroom-management' | 'manifests' | 'story-progress' | 'roles' | 'scorekeeper' | 'pp-approval' | 'role-setup'>('students');
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
  
  // Story Progress Management
  const [storyProgressData, setStoryProgressData] = useState<{ [studentId: string]: any }>({});
  const [storyProgressLoading, setStoryProgressLoading] = useState(false);

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
      const challengeData = challenges[challenge.id] || {};
      const isCompleted = challengeData.status === 'approved' || challengeData.completed || false;
      const isSubmitted = challengeData.submitted || false;
      const status = challengeData.status || 'not_started';
      
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

  // Story Progress Management Functions
  const fetchStoryProgress = async () => {
    setStoryProgressLoading(true);
    try {
      const progressData: { [studentId: string]: any } = {};
      
      console.log('Fetching story progress for students:', students.length);
      
      for (const student of students) {
        // Use the actual chapter progress from student data
        const chapters = student.chapters || {};
        const storyChapter = student.storyChapter || 1;
        
        console.log(`Student ${student.displayName} (${student.id}):`, {
          storyChapter,
          chapters: Object.keys(chapters),
          chaptersData: chapters
        });
        
        // Calculate completed chapters
        const completedChapters = Object.values(chapters).filter((chapter: any) => 
          chapter?.isCompleted || chapter?.status === 'approved'
        ).length;
        
        // Get current chapter info
        const currentChapter = CHAPTERS.find(ch => ch.id === storyChapter);
        const currentChapterTitle = currentChapter ? currentChapter.title : `Chapter ${storyChapter}`;
        
        progressData[student.id] = {
          currentEpisode: `Chapter ${storyChapter}`,
          currentChapterTitle: currentChapterTitle,
          completedEpisodes: completedChapters,
          totalProgress: Math.round((completedChapters / CHAPTERS.length) * 100),
          seasonRewards: [],
          chapters: chapters,
          storyChapter: storyChapter
        };
        
        console.log(`Progress for ${student.displayName}:`, progressData[student.id]);
      }
      
      setStoryProgressData(progressData);
      console.log('Story progress data set:', progressData);
    } catch (error) {
      console.error('Error fetching story progress:', error);
    } finally {
      setStoryProgressLoading(false);
    }
  };

  const resetStoryProgress = async (studentId: string) => {
    setRowLoading(prev => ({ ...prev, [studentId]: true }));
    setRowError(prev => ({ ...prev, [studentId]: '' }));
    
    try {
      // Reset chapter progress in the students collection
      await updateDoc(doc(db, 'students', studentId), {
        storyChapter: 1,
        chapters: {},
        resetAt: new Date(),
        resetBy: 'admin'
      });
      
      // Also reset the corresponding user document
      try {
        await updateDoc(doc(db, 'users', studentId), {
          chapters: {},
          storyChapter: 1,
          resetAt: new Date(),
          resetBy: 'admin'
        });
        console.log(`Successfully reset user document for student ${studentId}`);
      } catch (userError) {
        console.log(`User document not found for student ${studentId}, skipping user reset`);
      }
      
      // Refresh students data from Firestore
      const studentsSnapshot = await getDocs(collection(db, 'students'));
      const updatedStudents = studentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Student[];
      
      setStudents(updatedStudents);
      
      // Update local state
      setStoryProgressData(prev => ({
        ...prev,
        [studentId]: {
          currentEpisode: 'Chapter 1',
          currentChapterTitle: 'Leaving the Ordinary World',
          completedEpisodes: 0,
          totalProgress: 0,
          seasonRewards: [],
          chapters: {},
          storyChapter: 1
        }
      }));
      
      console.log(`Chapter progress reset for student ${studentId}`);
    } catch (error) {
      console.error(`Error resetting chapter progress for ${studentId}:`, error);
      setRowError(prev => ({ ...prev, [studentId]: 'Failed to reset chapter progress' }));
    } finally {
      setRowLoading(prev => ({ ...prev, [studentId]: false }));
    }
  };

  const resetAllStoryProgress = async () => {
    if (!window.confirm('Are you sure you want to reset chapter progress for ALL students? This action cannot be undone.')) {
      return;
    }
    
    setStoryProgressLoading(true);
    try {
      console.log('Starting reset for all students...');
      console.log('Students to reset:', students.map(s => ({ id: s.id, name: s.displayName, currentChapter: s.storyChapter })));
      
      // Use individual updates instead of batch for better error handling
      const updatePromises = students.map(async (student) => {
        try {
          console.log(`Resetting student ${student.displayName} (${student.id}) from chapter ${student.storyChapter} to chapter 1`);
          
          // Reset student document
          await updateDoc(doc(db, 'students', student.id), {
            storyChapter: 1,
            chapters: {},
            resetAt: new Date(),
            resetBy: 'admin'
          });
          
          // Also reset the corresponding user document
          try {
            await updateDoc(doc(db, 'users', student.id), {
              chapters: {},
              storyChapter: 1,
              resetAt: new Date(),
              resetBy: 'admin'
            });
            console.log(`Successfully reset user document for ${student.displayName} (${student.id})`);
          } catch (userError) {
            console.log(`User document not found for ${student.displayName} (${student.id}), skipping user reset`);
          }
          
          console.log(`Successfully reset student ${student.displayName} (${student.id})`);
          return { success: true, studentId: student.id };
        } catch (error) {
          console.error(`Failed to reset student ${student.displayName} (${student.id}):`, error);
          return { success: false, studentId: student.id, error };
        }
      });
      
      const results = await Promise.all(updatePromises);
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      console.log(`Reset completed. Successful: ${successful.length}, Failed: ${failed.length}`);
      if (failed.length > 0) {
        console.error('Failed resets:', failed);
      }
      
      // Refresh students data from Firestore
      console.log('Refreshing students data from Firestore...');
      const studentsSnapshot = await getDocs(collection(db, 'students'));
      const updatedStudents = studentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Student[];
      
      console.log('Updated students data:', updatedStudents.map(s => ({ 
        id: s.id, 
        name: s.displayName, 
        storyChapter: s.storyChapter,
        chapters: Object.keys(s.chapters || {})
      })));
      
      setStudents(updatedStudents);
      
      // Update local state
      const resetData = {
        currentEpisode: 'Chapter 1',
        currentChapterTitle: 'Leaving the Ordinary World',
        completedEpisodes: 0,
        totalProgress: 0,
        seasonRewards: [],
        chapters: {},
        storyChapter: 1
      };
      
      const newProgressData: { [studentId: string]: any } = {};
      updatedStudents.forEach(student => {
        newProgressData[student.id] = resetData;
      });
      
      setStoryProgressData(newProgressData);
      console.log('Chapter progress reset for all students completed');
    } catch (error) {
      console.error('Error resetting all chapter progress:', error);
    } finally {
      setStoryProgressLoading(false);
    }
  };

  // Fetch story progress when tab is active
  useEffect(() => {
    if (activeTab === 'story-progress') {
      fetchStoryProgress();
    }
  }, [activeTab, students]);

  // Add a function to refresh students data
  const refreshStudentsData = async () => {
    try {
      const studentsSnapshot = await getDocs(collection(db, 'students'));
      const updatedStudents = studentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Student[];
      
      setStudents(updatedStudents);
      console.log('Students data refreshed from Firestore');
    } catch (error) {
      console.error('Error refreshing students data:', error);
    }
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
        
        console.log('Admin Panel - Fetched pending submissions:', {
          totalSubmissions: snapshot.docs.length,
          submissions: list.map((s: any) => ({
            id: s.id,
            userId: s.userId,
            displayName: s.displayName,
            challengeId: s.challengeId,
            challengeName: s.challengeName,
            status: s.status,
            submittedAt: s.submittedAt
          }))
        });
        
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

  // Set Power Points to absolute value
  const setPowerPoints = async (studentId: string, amount: number) => {
    const student = students.find(s => s.id === studentId);
    if (!student) return;
    const newPP = Math.max(0, amount);
    const studentRef = doc(db, 'students', studentId);
    await updateDoc(studentRef, { powerPoints: newPP });
    setStudents(prev =>
      prev.map(s =>
        s.id === studentId ? { ...s, powerPoints: newPP } : s
      )
    );
    
    // Show success message
    const studentName = student.displayName || student.id;
    setBatchMessage(`Successfully set ${studentName}'s Power Points to ${newPP}!`);
    setShowBatchSuccess(true);
    setTimeout(() => setShowBatchSuccess(false), 3000);
  };

  // Batch Power Points adjustment
  const adjustBatchPowerPoints = async (multiplier: number) => {
    if (selected.length === 0) {
      alert('Please select at least one student first.');
      return;
    }
    
    const actualDelta = batchPP * multiplier; // Use batchPP value with multiplier
    console.log(`Batch PP Update: ${actualDelta} PP to ${selected.length} students`);
    
    try {
      // Use writeBatch for atomic updates
      const batch = writeBatch(db);
      const updatedStudents: { id: string; newPP: number; oldPP: number }[] = [];
      
      for (const studentId of selected) {
        const student = students.find(s => s.id === studentId);
        if (!student) {
          console.warn(`Student ${studentId} not found in local data`);
          continue;
        }
        
        const oldPP = student.powerPoints || 0;
        const newPP = oldPP + actualDelta; // Allow negative values
        
        console.log(`Updating ${student.displayName}: ${oldPP} → ${newPP} PP`);
        
        const studentRef = doc(db, 'students', studentId);
        batch.update(studentRef, { powerPoints: newPP });
        
        updatedStudents.push({ id: studentId, newPP, oldPP });
      }
      
      if (updatedStudents.length === 0) {
        alert('No valid students found to update.');
        return;
      }
      
      console.log('Committing batch update...');
      await batch.commit();
      console.log('Batch update successful!');
      
      // Update local state
      setStudents(prev =>
        prev.map(s => {
          const found = updatedStudents.find(u => u.id === s.id);
          return found ? { ...s, powerPoints: found.newPP } : s;
        })
      );
      
      // Show success message
      const action = actualDelta > 0 ? 'added' : 'removed';
      const absDelta = Math.abs(actualDelta);
      setBatchMessage(`Successfully ${action} ${absDelta} Power Points to ${updatedStudents.length} student${updatedStudents.length !== 1 ? 's' : ''}!`);
      setShowBatchSuccess(true);
      
      // Auto-hide after 3 seconds
      setTimeout(() => setShowBatchSuccess(false), 3000);
      
      setSelected([]);
      
      // Log final results
      console.log('PP Update Results:', updatedStudents.map(u => 
        `${students.find(s => s.id === u.id)?.displayName}: ${u.oldPP} → ${u.newPP}`
      ));
      
    } catch (error: any) {
      console.error('Error updating batch power points:', error);
      console.error('Error details:', error);
      
      // More specific error message
      if (error?.code === 'permission-denied') {
        alert('Permission denied. Please check Firestore security rules.');
      } else if (error?.code === 'not-found') {
        alert('Some student records were not found. Please refresh and try again.');
      } else {
        alert(`Failed to update power points: ${error?.message || error}`);
      }
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

  const bulkDeleteStudents = async () => {
    if (selected.length === 0) return;
    
    try {
      console.log('Starting bulk delete for students:', selected);
      
      // Process deletions one by one to avoid overwhelming Firebase
      const deletedStudents: string[] = [];
      const failedStudents: { id: string; error: string }[] = [];
      
      for (const studentId of selected) {
        try {
          console.log(`Deleting student: ${studentId}`);
          
          // Delete from students collection
          const studentRef = doc(db, 'students', studentId);
          await deleteDoc(studentRef);
          console.log(`Deleted from students collection: ${studentId}`);
          
          // Delete from users collection
          const userRef = doc(db, 'users', studentId);
          await deleteDoc(userRef);
          console.log(`Deleted from users collection: ${studentId}`);
          
          // Delete any challenge submissions
          const submissionsQuery = query(
            collection(db, 'challengeSubmissions'),
            where('userId', '==', studentId)
          );
          const submissionsSnapshot = await getDocs(submissionsQuery);
          console.log(`Found ${submissionsSnapshot.docs.length} submissions for ${studentId}`);
          
          for (const submissionDoc of submissionsSnapshot.docs) {
            await deleteDoc(submissionDoc.ref);
          }
          
          // Delete any notifications (if the subcollection exists)
          try {
            const notificationsQuery = query(
              collection(db, 'students', studentId, 'notifications')
            );
            const notificationsSnapshot = await getDocs(notificationsQuery);
            console.log(`Found ${notificationsSnapshot.docs.length} notifications for ${studentId}`);
            
            for (const notificationDoc of notificationsSnapshot.docs) {
              await deleteDoc(notificationDoc.ref);
            }
          } catch (notifError) {
            console.log(`No notifications subcollection for ${studentId} or error accessing it:`, notifError);
            // Continue - this is not critical
          }
          
          deletedStudents.push(studentId);
          console.log(`Successfully deleted student: ${studentId}`);
          
        } catch (studentError) {
          console.error(`Failed to delete student ${studentId}:`, studentError);
          const errorMessage = studentError instanceof Error ? studentError.message : 'Unknown error';
          failedStudents.push({ id: studentId, error: errorMessage });
        }
      }
      
      // Update local state to remove successfully deleted students
      setStudents(prev => prev.filter(s => !deletedStudents.includes(s.id)));
      setSelected([]);
      setShowBulkDeleteConfirm(false);
      
      // Show appropriate message
      if (deletedStudents.length > 0) {
        setBatchMessage(`Successfully deleted ${deletedStudents.length} student account(s)!`);
        setShowBatchSuccess(true);
        setTimeout(() => setShowBatchSuccess(false), 3000);
      }
      
      if (failedStudents.length > 0) {
        console.error('Failed to delete some students:', failedStudents);
        alert(`Failed to delete ${failedStudents.length} student(s). Check console for details.`);
      }
      
    } catch (error: unknown) {
      console.error('Error in bulk delete process:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to delete students: ${errorMessage}`);
    }
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

  // Utility function to manually fix chapter progression
  const fixChapterProgression = async (studentId: string) => {
    try {
      const student = students.find(s => s.id === studentId);
      if (!student) {
        alert('Student not found!');
        return;
      }

      const studentRef = doc(db, 'students', studentId);
      const userRef = doc(db, 'users', studentId);
      
      // Get current data
      const studentDoc = await getDoc(studentRef);
      const userDoc = await getDoc(userRef);
      const studentData = studentDoc.exists() ? studentDoc.data() : {};
      const userData = userDoc.exists() ? userDoc.data() : {};

      // Calculate which chapter they should be on based on completed challenges
      const challenges = studentData.challenges || {};
      let targetChapter = 1;

      console.log('Analyzing challenges for chapter progression:', {
        studentName: student.displayName,
        allChallenges: Object.keys(challenges),
        completedChallenges: Object.keys(challenges).filter(k => challenges[k]?.completed),
        challengeDetails: Object.entries(challenges).map(([k, v]: [string, any]) => ({ id: k, completed: v?.completed, submitted: v?.submitted, status: v?.status }))
      });

      // Check if they have completed Chapter 1 challenges
      const chapter1Challenges = ['ch1-update-profile', 'ch1-declare-manifest', 'ch1-artifact-challenge'];
      const chapter1Completed = chapter1Challenges.every(challengeId => 
        challenges[challengeId]?.completed
      );

      console.log('Chapter 1 completion check:', {
        chapter1Challenges,
        chapter1Completed,
        individualStatus: chapter1Challenges.map(id => ({ id, completed: challenges[id]?.completed }))
      });

      if (chapter1Completed) {
        targetChapter = 2;
        
        // Check Chapter 2 challenges
        const chapter2Challenges = ['ch2-team-formation', 'ch2-rival-identification'];
        const chapter2Completed = chapter2Challenges.every(challengeId => 
          challenges[challengeId]?.completed
        );
        
        if (chapter2Completed) {
          targetChapter = 3;
        }
      }

      // Special case: If they have high XP/Level but are stuck in Chapter 1, 
      // and have completed at least 2 out of 3 Chapter 1 challenges, advance them
      if (targetChapter === 1 && (studentData.xp || 0) > 50) {
        const completedChapter1Count = chapter1Challenges.filter(id => challenges[id]?.completed).length;
        if (completedChapter1Count >= 2) {
          console.log('Special case: High XP student with most Chapter 1 challenges completed, advancing to Chapter 2');
          targetChapter = 2;
        }
      }

      console.log(`Fixing chapter progression for ${student.displayName}:`, {
        currentChapter: studentData.storyChapter || 1,
        targetChapter,
        challenges: Object.keys(challenges).filter(k => challenges[k]?.completed)
      });

      // Update both collections
      await updateDoc(studentRef, {
        storyChapter: targetChapter
      });

      // Also update the users collection chapters structure
      const updatedChapters = {
        ...userData.chapters,
        [targetChapter]: {
          ...userData.chapters?.[targetChapter],
          isActive: true,
          unlockDate: new Date()
        }
      };

      await updateDoc(userRef, {
        chapters: updatedChapters
      });

      alert(`✅ Fixed chapter progression for ${student.displayName}! Advanced to Chapter ${targetChapter}.`);
      
      // Refresh the students list
      window.location.reload();
    } catch (error) {
      console.error('Error fixing chapter progression:', error);
      alert('Failed to fix chapter progression. Please try again.');
    }
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
            onClick={() => setShowManifestDiagnostic(true)}
            style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            🔍 Manifest Diagnostic
          </button>
          <button
            onClick={() => setShowTestAccountManager(true)}
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
            🧪 Test Account Manager
          </button>
          <button
            onClick={() => setShowTestAccountLogin(true)}
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
            🎮 Test Account Login
          </button>
          <button
            onClick={() => setShowFirebaseRulesChecker(true)}
            style={{
              backgroundColor: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            🔐 Firebase Rules Checker
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
          <button
            onClick={() => {
              const yondaime = students.find(s => s.displayName === 'Yondaime');
              if (yondaime) {
                fixChapterProgression(yondaime.id);
              } else {
                alert('Yondaime not found in the students list!');
              }
            }}
            style={{
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Fix Yondaime's Chapter
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        marginBottom: '2rem',
        overflowX: 'auto',
        paddingBottom: '0.5rem',
        scrollbarWidth: 'thin',
        scrollbarColor: '#cbd5e1 #f1f5f9'
      }}>
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
            fontSize: '0.875rem',
            flexShrink: 0,
            whiteSpace: 'nowrap'
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
            fontSize: '0.875rem',
            flexShrink: 0,
            whiteSpace: 'nowrap'
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
            fontSize: '0.875rem',
            flexShrink: 0,
            whiteSpace: 'nowrap'
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
            position: 'relative',
            flexShrink: 0,
            whiteSpace: 'nowrap'
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
            fontSize: '0.875rem',
            flexShrink: 0,
            whiteSpace: 'nowrap'
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
            fontSize: '0.875rem',
            flexShrink: 0,
            whiteSpace: 'nowrap'
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
            fontSize: '0.875rem',
            flexShrink: 0,
            whiteSpace: 'nowrap'
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
            fontSize: '0.875rem',
            flexShrink: 0,
            whiteSpace: 'nowrap'
          }}
        >
          Manifests
        </button>
        <button
          onClick={() => setActiveTab('story-progress')}
          style={{
            backgroundColor: activeTab === 'story-progress' ? '#4f46e5' : '#e5e7eb',
            color: activeTab === 'story-progress' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '0.875rem',
            flexShrink: 0,
            whiteSpace: 'nowrap'
          }}
        >
          📖 Story Progress
        </button>
        <button
          onClick={() => setActiveTab('roles')}
          style={{
            backgroundColor: activeTab === 'roles' ? '#4f46e5' : '#e5e7eb',
            color: activeTab === 'roles' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '0.875rem',
            flexShrink: 0,
            whiteSpace: 'nowrap'
          }}
        >
          👥 Role Manager
        </button>
        <button
          onClick={() => {
            console.log('🔍 AdminPanel: Scorekeeper button clicked, setting activeTab to scorekeeper');
            setActiveTab('scorekeeper');
          }}
          style={{
            backgroundColor: activeTab === 'scorekeeper' ? '#4f46e5' : '#e5e7eb',
            color: activeTab === 'scorekeeper' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '0.875rem',
            flexShrink: 0,
            whiteSpace: 'nowrap'
          }}
        >
          📊 Scorekeeper
        </button>
        <button
          onClick={() => setActiveTab('pp-approval')}
          style={{
            backgroundColor: activeTab === 'pp-approval' ? '#4f46e5' : '#e5e7eb',
            color: activeTab === 'pp-approval' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '0.875rem',
            flexShrink: 0,
            whiteSpace: 'nowrap'
          }}
        >
          🔍 PP Approval
        </button>
        <button
          onClick={() => setActiveTab('role-setup')}
          style={{
            backgroundColor: activeTab === 'role-setup' ? '#4f46e5' : '#e5e7eb',
            color: activeTab === 'role-setup' ? 'white' : '#374151',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.75rem 1.5rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            fontSize: '0.875rem',
            flexShrink: 0,
            whiteSpace: 'nowrap'
          }}
        >
          🚀 Role Setup
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
      ) : activeTab === 'roles' ? (
        <RoleManager />
      ) : activeTab === 'scorekeeper' ? (
        <>
          {console.log('🔍 AdminPanel: Rendering ScorekeeperInterface, activeTab:', activeTab)}
          <ScorekeeperInterface />
        </>
      ) : activeTab === 'pp-approval' ? (
        <PPChangeApproval />
      ) : activeTab === 'role-setup' ? (
        <RoleSystemSetup />
      ) : activeTab === 'manifests' ? (
        <div style={{
          background: '#f8fafc',
          borderRadius: '0.75rem',
          padding: '2rem',
          minHeight: '300px',
          color: '#374151',
          border: '1px solid #e5e7eb',
          marginBottom: '2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem', textAlign: 'center' }}>
            Manifest Administration
          </h2>
          <p style={{ fontSize: '1.25rem', color: '#6b7280', textAlign: 'center', marginBottom: '2rem', maxWidth: '600px' }}>
            Manage manifests, edit move names and damage values, and configure the Nine Knowings Universe manifest system.
          </p>
          
          <button
            onClick={() => setShowManifestAdmin(true)}
            style={{
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.75rem',
              padding: '1rem 2rem',
              fontSize: '1.125rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 12px rgba(79, 70, 229, 0.3)'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(79, 70, 229, 0.4)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(79, 70, 229, 0.3)';
            }}
          >
            🎯 Open Manifest Admin Panel
          </button>
          
          <div style={{ 
            marginTop: '2rem', 
            padding: '1.5rem', 
            background: 'rgba(79, 70, 229, 0.05)', 
            borderRadius: '0.5rem',
            border: '1px solid rgba(79, 70, 229, 0.1)',
            maxWidth: '500px'
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '0.75rem', color: '#4f46e5' }}>
              Admin Features:
            </h3>
            <ul style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: '1.6', margin: 0, paddingLeft: '1.25rem' }}>
              <li>View all manifests in an interactive grid layout</li>
              <li>Edit move names and damage values</li>
              <li>Configure manifest details and descriptions</li>
              <li>Manage ascension levels and XP requirements</li>
              <li>Preview changes before saving</li>
            </ul>
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
      ) : activeTab === 'story-progress' ? (
        <div>
          {/* Story Progress Management */}
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
              📖 Story Progress Management
            </h2>
            <p style={{ fontSize: '1.125rem', color: '#6b7280', textAlign: 'center', marginBottom: '2rem' }}>
              Manage student chapter progress. Reset individual or all students' chapter progress for debugging.
            </p>

            {/* Global Actions */}
            <div style={{
              background: 'white',
              borderRadius: '0.75rem',
              border: '1px solid #e5e7eb',
              padding: '1.5rem',
              marginBottom: '2rem'
            }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem', color: '#374151' }}>
                ⚠️ Global Actions
              </h3>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <button
                  onClick={resetAllStoryProgress}
                  disabled={storyProgressLoading}
                  style={{
                    background: storyProgressLoading ? '#9ca3af' : '#dc2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.75rem 1.5rem',
                    fontWeight: 'bold',
                    cursor: storyProgressLoading ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  {storyProgressLoading ? '🔄 Processing...' : '🗑️ Reset All Chapter Progress'}
                </button>
                <button
                  onClick={fetchStoryProgress}
                  disabled={storyProgressLoading}
                  style={{
                    background: storyProgressLoading ? '#9ca3af' : '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.75rem 1.5rem',
                    fontWeight: 'bold',
                    cursor: storyProgressLoading ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  {storyProgressLoading ? '🔄 Loading...' : '🔄 Refresh Chapter Data'}
                </button>
                <button
                  onClick={refreshStudentsData}
                  disabled={storyProgressLoading}
                  style={{
                    background: storyProgressLoading ? '#9ca3af' : '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.75rem 1.5rem',
                    fontWeight: 'bold',
                    cursor: storyProgressLoading ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  {storyProgressLoading ? '🔄 Loading...' : '🔄 Refresh Students Data'}
                </button>
                <button
                  onClick={async () => {
                    if (students.length > 0) {
                      const testStudent = students[0];
                      console.log('Testing database write for student:', testStudent.displayName);
                      try {
                        await updateDoc(doc(db, 'students', testStudent.id), {
                          testField: new Date().toISOString(),
                          testBy: 'admin'
                        });
                        console.log('Database write test successful');
                        alert('Database write test successful! Check console for details.');
                      } catch (error) {
                        console.error('Database write test failed:', error);
                        alert('Database write test failed! Check console for details.');
                      }
                    }
                  }}
                  style={{
                    background: '#f59e0b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.75rem 1.5rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  🧪 Test DB Write
                </button>
                <button
                  onClick={async () => {
                    if (!currentUser) {
                      alert('No current user found');
                      return;
                    }
                    if (!window.confirm('Reset YOUR OWN chapter progress? This will clear all your chapter completions.')) {
                      return;
                    }
                    try {
                      console.log('Resetting current user progress:', currentUser.uid);
                      
                      // Reset user document
                      await updateDoc(doc(db, 'users', currentUser.uid), {
                        chapters: {},
                        storyChapter: 1,
                        resetAt: new Date(),
                        resetBy: 'self'
                      });
                      
                      // Also reset student document if it exists
                      try {
                        await updateDoc(doc(db, 'students', currentUser.uid), {
                          chapters: {},
                          storyChapter: 1,
                          resetAt: new Date(),
                          resetBy: 'self'
                        });
                      } catch (studentError) {
                        console.log('Student document not found, skipping');
                      }
                      
                      console.log('Current user progress reset successfully');
                      alert('Your chapter progress has been reset! Refresh the page to see changes.');
                    } catch (error) {
                      console.error('Error resetting current user progress:', error);
                      alert('Failed to reset progress. Check console for details.');
                    }
                  }}
                  style={{
                    background: '#8b5cf6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.375rem',
                    padding: '0.75rem 1.5rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  🔄 Reset My Progress
                </button>
              </div>
              <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '1rem', fontStyle: 'italic' }}>
                ⚠️ Resetting chapter progress will clear all chapter completions and return students to Chapter 1.
              </p>
            </div>

            {/* Student Chapter Progress Table */}
            <div style={{
              background: 'white',
              borderRadius: '0.75rem',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{
                background: '#f9fafb',
                padding: '1rem 1.5rem',
                borderBottom: '1px solid #e5e7eb'
              }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', margin: 0, color: '#374151' }}>
                  Student Chapter Progress ({students.length} students)
                </h3>
              </div>
              
              {storyProgressLoading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                  🔄 Loading chapter progress data...
                </div>
              ) : (
                <div style={{ maxHeight: '600px', overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.875rem', fontWeight: 'bold', color: '#374151' }}>
                          Student
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.875rem', fontWeight: 'bold', color: '#374151' }}>
                          Current Chapter
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.875rem', fontWeight: 'bold', color: '#374151' }}>
                          Completed Chapters
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb', fontSize: '0.875rem', fontWeight: 'bold', color: '#374151' }}>
                          Progress
                        </th>
                        <th style={{ padding: '0.75rem', textAlign: 'center', borderBottom: '1px solid #e5e7eb', fontSize: '0.875rem', fontWeight: 'bold', color: '#374151' }}>
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student) => {
                        const progress = storyProgressData[student.id] || {
                          currentEpisode: 'Chapter 1',
                          currentChapterTitle: 'Leaving the Ordinary World',
                          completedEpisodes: 0,
                          totalProgress: 0
                        };
                        
                        const completedCount = progress.completedEpisodes || 0;
                        const progressPercentage = progress.totalProgress || 0;
                        
                        return (
                          <tr key={student.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                {student.photoURL && (
                                  <img 
                                    src={student.photoURL} 
                                    alt={student.displayName || 'Student'} 
                                    style={{ 
                                      width: '32px', 
                                      height: '32px', 
                                      borderRadius: '50%',
                                      objectFit: 'cover'
                                    }} 
                                  />
                                )}
                                <div>
                                  <div style={{ fontWeight: 'bold', color: '#374151', fontSize: '0.875rem' }}>
                                    {student.displayName || 'Unnamed Student'}
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                    {student.email}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6' }}>
                              <div style={{ fontSize: '0.875rem', color: '#374151' }}>
                                {progress.currentEpisode || 'Chapter 1'}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                {progress.currentChapterTitle || 'Leaving the Ordinary World'}
                              </div>
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6' }}>
                              <div style={{ fontSize: '0.875rem', color: '#374151' }}>
                                {completedCount}/{CHAPTERS.length} chapters
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                {completedCount > 0 ? `${completedCount} completed` : 'None completed'}
                              </div>
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <div style={{
                                  width: '100px',
                                  height: '8px',
                                  backgroundColor: '#e5e7eb',
                                  borderRadius: '4px',
                                  overflow: 'hidden'
                                }}>
                                  <div style={{
                                    width: `${progressPercentage}%`,
                                    height: '100%',
                                    backgroundColor: '#10b981',
                                    transition: 'width 0.3s ease'
                                  }} />
                                </div>
                                <span style={{ fontSize: '0.75rem', color: '#6b7280', minWidth: '30px' }}>
                                  {progressPercentage}%
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '0.75rem', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>
                              <button
                                onClick={() => resetStoryProgress(student.id)}
                                disabled={rowLoading[student.id]}
                                style={{
                                  background: rowLoading[student.id] ? '#9ca3af' : '#dc2626',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '0.375rem',
                                  padding: '0.5rem 1rem',
                                  fontWeight: 'bold',
                                  cursor: rowLoading[student.id] ? 'not-allowed' : 'pointer',
                                  fontSize: '0.75rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}
                              >
                                {rowLoading[student.id] ? '🔄' : '🗑️'} Reset
                              </button>
                              {rowError[student.id] && (
                                <div style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: '0.25rem' }}>
                                  {rowError[student.id]}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
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
                      placeholder="Amount"
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
                    <button
                      onClick={async () => {
                        console.log('=== DEBUG: Testing single student update ===');
                        if (selected.length > 0) {
                          const testStudentId = selected[0];
                          const testStudent = students.find(s => s.id === testStudentId);
                          console.log('Test student:', testStudent);
                          
                          try {
                            const studentRef = doc(db, 'students', testStudentId);
                            const testPP = (testStudent?.powerPoints || 0) - 1;
                            console.log(`Testing update: ${testStudent?.powerPoints || 0} → ${testPP}`);
                            
                            await updateDoc(studentRef, { powerPoints: testPP });
                            console.log('✅ Single update successful!');
                            alert('✅ Single update test passed! Batch should work now.');
                            
                            // Refresh students data
                            const studentsSnapshot = await getDocs(collection(db, 'students'));
                            const updatedStudents = studentsSnapshot.docs.map(doc => ({
                              id: doc.id,
                              ...doc.data()
                            })) as Student[];
                            setStudents(updatedStudents);
                            
                          } catch (testError: any) {
                            console.error('❌ Single update failed:', testError);
                            alert(`❌ Test failed: ${testError?.message || testError}`);
                          }
                        } else {
                          alert('Please select at least one student to test.');
                        }
                      }}
                      style={{
                        backgroundColor: '#f59e0b',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}
                    >
                      🔍 Test Update
                    </button>
                    <button
                      onClick={() => setShowBulkDeleteConfirm(true)}
                      style={{
                        backgroundColor: '#dc2626',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.375rem',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                        marginLeft: '1rem'
                      }}
                    >
                      🗑️ Delete Selected
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
                    <th style={{ padding: '1rem', textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                      Power Points
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 'normal', marginTop: '0.25rem' }}>
                        Type amount + Enter or click Set
                      </div>
                    </th>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginLeft: '0.5rem' }}>
                            <input
                              type="number"
                              placeholder="PP"
                              value={ppAmount[student.id] || ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setPPAmount(prev => ({
                                  ...prev,
                                  [student.id]: value === '' ? undefined : parseInt(value) || 0
                                }));
                              }}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                  const amount = ppAmount[student.id];
                                  if (amount !== undefined && amount !== 0) {
                                    setPowerPoints(student.id, amount);
                                    setPPAmount(prev => ({ ...prev, [student.id]: undefined }));
                                  }
                                }
                              }}
                              style={{
                                width: '60px',
                                padding: '0.25rem 0.5rem',
                                border: '1px solid #d1d5db',
                                borderRadius: '0.25rem',
                                fontSize: '0.75rem',
                                textAlign: 'center'
                              }}
                            />
                            <button
                              onClick={() => {
                                const amount = ppAmount[student.id];
                                if (amount !== undefined && amount !== 0) {
                                  setPowerPoints(student.id, amount);
                                  setPPAmount(prev => ({ ...prev, [student.id]: undefined }));
                                }
                              }}
                              disabled={!ppAmount[student.id] || ppAmount[student.id] === 0}
                              style={{
                                backgroundColor: ppAmount[student.id] && ppAmount[student.id] !== 0 ? '#3b82f6' : '#9ca3af',
                                color: 'white',
                                border: 'none',
                                borderRadius: '0.25rem',
                                padding: '0.25rem 0.5rem',
                                cursor: ppAmount[student.id] && ppAmount[student.id] !== 0 ? 'pointer' : 'not-allowed',
                                fontSize: '0.75rem',
                                fontWeight: '500'
                              }}
                            >
                              Set
                            </button>
                            {ppAmount[student.id] !== undefined && (
                              <button
                                onClick={() => setPPAmount(prev => ({ ...prev, [student.id]: undefined }))}
                                style={{
                                  backgroundColor: '#6b7280',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '0.25rem',
                                  padding: '0.25rem 0.5rem',
                                  cursor: 'pointer',
                                  fontSize: '0.75rem',
                                  fontWeight: '500'
                                }}
                              >
                                ×
                              </button>
                            )}
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

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
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
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            textAlign: 'center'
          }}>
            <h2 style={{ 
              fontSize: '1.5rem', 
              fontWeight: 'bold', 
              marginBottom: '1rem',
              color: '#dc2626'
            }}>
              ⚠️ Confirm Bulk Delete
            </h2>
            
            <div style={{
              background: '#fef2f2',
              border: '2px solid #fecaca',
              borderRadius: '0.75rem',
              padding: '1rem',
              marginBottom: '1.5rem'
            }}>
              <p style={{ color: '#dc2626', fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                Are you sure you want to delete {selected.length} student account(s)?
              </p>
              <p style={{ color: '#dc2626', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                This action will permanently delete:
              </p>
              <ul style={{ color: '#dc2626', fontSize: '0.875rem', textAlign: 'left', margin: '0.5rem 0' }}>
                <li>Student profiles and progress</li>
                <li>All challenge submissions</li>
                <li>All notifications and data</li>
                <li>User authentication records</li>
              </ul>
              <p style={{ color: '#dc2626', fontSize: '0.875rem', fontWeight: 'bold' }}>
                Deleted students will be able to create new accounts and start over.
              </p>
            </div>
            
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={bulkDeleteStudents}
                style={{
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                🗑️ Delete {selected.length} Account(s)
              </button>
              
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                style={{
                  background: '#6b7280',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manifest Diagnostic Modal */}
      <ManifestDiagnostic
        isOpen={showManifestDiagnostic}
        onClose={() => setShowManifestDiagnostic(false)}
      />

      {/* Manifest Admin Modal */}
      <ManifestAdmin
        isOpen={showManifestAdmin}
        onClose={() => setShowManifestAdmin(false)}
      />

      {/* Test Account Manager Modal */}
      <TestAccountManager
        isOpen={showTestAccountManager}
        onClose={() => setShowTestAccountManager(false)}
      />

      {/* Test Account Login Modal */}
      <TestAccountLogin
        isOpen={showTestAccountLogin}
        onClose={() => setShowTestAccountLogin(false)}
      />

      {/* Firebase Rules Checker Modal */}
      <FirebaseRulesChecker
        isOpen={showFirebaseRulesChecker}
        onClose={() => setShowFirebaseRulesChecker(false)}
      />
    </div>
  );
};

export default AdminPanel; 