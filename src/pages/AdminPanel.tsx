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

interface ChallengeData {
  completed?: boolean;
  file?: string;
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
  manifest?: string;
  rarity?: number;
  bio?: string;
  cardBgColor?: string;
  moves?: Array<{ name: string; description: string; icon: string }>;
  badges?: Array<{ id: string; name: string; imageUrl: string; description: string; earnedAt: Date }>;
  storyChapter?: number;
}

const AdminPanel: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [editingStudent, setEditingStudent] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ displayName: '', email: '' });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{ studentId: string; challenge: string } | null>(null);
  const [ppAmount, setPPAmount] = useState<{ [studentId: string]: number }>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [batchPP, setBatchPP] = useState(1);
  const [activeTab, setActiveTab] = useState<'students' | 'badges' | 'setup' | 'submissions' | 'assignments' | 'classroom'>('students');
  const [viewingProfile, setViewingProfile] = useState<string | null>(null);
  const [showBatchSuccess, setShowBatchSuccess] = useState(false);
  const [batchMessage, setBatchMessage] = useState('');
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [rowLoading, setRowLoading] = useState<{ [id: string]: boolean }>({});
  const [rowError, setRowError] = useState<{ [id: string]: string }>({});
  const [pendingSubmissionCount, setPendingSubmissionCount] = useState(0);

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
    
    // Open file in new tab to avoid CORS issues
    window.open(fileUrl, '_blank', 'noopener,noreferrer');
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
        
        await updateDoc(studentRef, {
          xp: (studentData.xp || 0) + (sub.xpReward || 0),
          powerPoints: (studentData.powerPoints || 0) + (sub.ppReward || 0)
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
            file: sub.fileUrl
          };
          const xpReward = sub.xpReward || 10;
          const ppReward = sub.ppReward || 5;
          const newXP = (studentData.xp || 0) + xpReward;
          const newPP = (studentData.powerPoints || 0) + ppReward;
          await updateDoc(studentRef, {
            challenges,
            xp: newXP,
            powerPoints: newPP
          });
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
      </div>

      {activeTab === 'badges' ? (
        <BadgeManager />
      ) : activeTab === 'setup' ? (
        <BadgeSetup />
      ) : activeTab === 'assignments' ? (
        <ChapterAssignmentManager />
      ) : activeTab === 'classroom' ? (
        <GoogleClassroomIntegration />
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
                            <a
                              href={sub.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={sub.fileName || 'submitted-file'}
                              onClick={async (e) => {
                                // Force download for binary files like .STL
                                console.log('=== DOWNLOAD DEBUG START ===');
                                console.log('Button clicked, fileUrl:', sub.fileUrl);
                                
                                // Extract filename from URL if not available
                                let fileName = sub.fileName;
                                if (!fileName && sub.fileUrl) {
                                  // Try to extract filename from the URL path
                                  const urlPath = sub.fileUrl.split('?')[0]; // Remove query parameters
                                  const pathParts = urlPath.split('/');
                                  fileName = pathParts[pathParts.length - 1];
                                  
                                  // If it's still not a proper filename, use the challenge ID
                                  if (!fileName || fileName.includes('%')) {
                                    fileName = `${sub.challengeId || sub.challengeName || 'submission'}.stl`;
                                  }
                                }
                                
                                console.log('Final filename:', fileName);
                                
                                e.preventDefault();
                                
                                // Show helpful message to user with copy-to-clipboard option
                                const message = `📁 DOWNLOADING 3D MODEL FILE

✅ The file is downloading now...
⚠️  IMPORTANT: Due to browser security, it may download without the .stl extension.

📝 AFTER DOWNLOAD:
1. Find the downloaded file (usually in Downloads folder)
2. Rename it to: "${fileName}"
3. Open it in your 3D modeling software

💡 TIP: The filename "${fileName}" has been copied to your clipboard for easy pasting!`;
                                
                                // Copy filename to clipboard
                                try {
                                  await navigator.clipboard.writeText(fileName);
                                  console.log('Filename copied to clipboard:', fileName);
                                } catch (err) {
                                  console.log('Could not copy to clipboard, but that\'s okay');
                                }
                                
                                alert(message);
                                
                                // Try multiple download methods
                                console.log('Method 1: Direct download...');
                                const link = document.createElement('a');
                                link.href = sub.fileUrl;
                                link.download = fileName || 'submitted-file.stl';
                                link.target = '_blank';
                                link.rel = 'noopener noreferrer';
                                
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                
                                // Also try window.open as backup
                                setTimeout(() => {
                                  console.log('Method 2: Window.open backup...');
                                  window.open(sub.fileUrl, '_blank');
                                }, 100);
                                
                                console.log('=== DOWNLOAD DEBUG END ===');
                              }}
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
                                fontWeight: '500',
                                display: 'inline-block'
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.backgroundColor = '#e5e7eb';
                                e.currentTarget.style.borderColor = '#9ca3af';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.backgroundColor = '#f8fafc';
                                e.currentTarget.style.borderColor = '#d1d5db';
                              }}
                            >
                              📁 Download File
                            </a>
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
      ) : (
        <>
          {/* Student Management Content */}
          {/* ... existing student management code ... */}
        </>
      )}
    </div>
  );
};

export default AdminPanel; 