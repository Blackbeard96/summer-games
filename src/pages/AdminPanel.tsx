import React, { useEffect, useState } from 'react';
import { db, storage } from '../firebase';
import { collection, getDocs, doc, updateDoc, deleteDoc, setDoc, getDoc, query, where, writeBatch, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import BadgeManager from '../components/BadgeManager';
import BadgeSetup from '../components/BadgeSetup';
import PlayerCard from '../components/PlayerCard';
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
  const [activeTab, setActiveTab] = useState<'students' | 'badges' | 'setup' | 'submissions'>('students');
  const [viewingProfile, setViewingProfile] = useState<string | null>(null);
  const [showBatchSuccess, setShowBatchSuccess] = useState(false);
  const [batchMessage, setBatchMessage] = useState('');
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [submissionsError, setSubmissionsError] = useState<string | null>(null);
  const [rowLoading, setRowLoading] = useState<{ [id: string]: boolean }>({});
  const [rowError, setRowError] = useState<{ [id: string]: string }>({});

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
      } catch (err: any) {
        setSubmissionsError('Failed to load submissions.');
      } finally {
        setSubmissionsLoading(false);
      }
    };
    fetchSubmissions();
  }, [activeTab]);

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
      // 2. Award XP/PP and mark challenge as completed for the student
      const studentRef = doc(db, 'students', sub.userId);
      const studentSnap = await getDoc(studentRef);
      if (studentSnap.exists()) {
        const studentData = studentSnap.data();
        const challenges = { ...studentData.challenges };
        // Mark challenge as completed and attach file if not already
        challenges[sub.challengeId] = {
          ...(challenges[sub.challengeId] || {}),
          completed: true,
          file: sub.fileUrl
        };
        // Award XP/PP (default fallback if not provided)
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
            fontSize: '0.875rem'
          }}
        >
          Submissions
        </button>
      </div>

      {activeTab === 'badges' ? (
        <BadgeManager />
      ) : activeTab === 'setup' ? (
        <BadgeSetup />
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
                      <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: 'bold', color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Submission File</th>
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
                              {sub.displayName || 'Unnamed Student'} <span style={{ color: '#4f46e5', fontWeight: 'normal', fontSize: '0.95em' }}>(Lv. {typeof sub.xp === 'number' ? getLevelFromXP(sub.xp) : '?'})</span>
                            </div>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>{sub.email || ''}</div>
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>{sub.challengeName || sub.challengeId || 'Unknown'}</td>
                        <td style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>
                          {sub.fileUrl ? (
                            <a href={sub.fileUrl} style={{ color: '#2563eb', textDecoration: 'underline' }} target="_blank" rel="noopener noreferrer">View File</a>
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
      
      {/* Batch Power Points Action Bar */}
      {selected.length > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
          color: '#1f2937',
          padding: '1.5rem',
          borderRadius: '0.75rem',
          marginBottom: '1.5rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          border: '2px solid #f59e0b'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontWeight: 'bold', fontSize: '1.125rem' }}>
                🎯 {selected.length} Student{selected.length !== 1 ? 's' : ''} Selected
              </span>
              <span style={{ fontSize: '0.875rem', opacity: 0.8 }}>
                Ready for batch update
              </span>
            </div>
            <button
              onClick={deselectAll}
              style={{ 
                backgroundColor: '#6b7280', 
                color: 'white', 
                border: 'none', 
                borderRadius: '0.5rem', 
                padding: '0.5rem 1rem', 
                fontWeight: 'bold', 
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Clear Selection
            </button>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>Power Points:</label>
              <input
                type="number"
                min={1}
                max={1000}
                value={batchPP}
                onChange={e => setBatchPP(Math.max(1, Math.min(1000, Number(e.target.value))))}
                style={{ 
                  width: 80, 
                  padding: '0.5rem', 
                  border: '2px solid #d1d5db', 
                  borderRadius: '0.375rem',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  textAlign: 'center'
                }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => adjustBatchPowerPoints(batchPP)}
                style={{ 
                  backgroundColor: '#10b981', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '0.5rem', 
                  padding: '0.75rem 1.5rem', 
                  fontWeight: 'bold', 
                  cursor: 'pointer',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)'
                }}
              >
                ➕ Add {batchPP} PP
              </button>
              <button
                onClick={() => adjustBatchPowerPoints(-batchPP)}
                style={{ 
                  backgroundColor: '#dc2626', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '0.5rem', 
                  padding: '0.75rem 1.5rem', 
                  fontWeight: 'bold', 
                  cursor: 'pointer',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 2px 4px rgba(220, 38, 38, 0.3)'
                }}
              >
                ➖ Remove {batchPP} PP
              </button>
            </div>
          </div>
          
          <div style={{ marginTop: '1rem', fontSize: '0.875rem', opacity: 0.8 }}>
            💡 Tip: Use "Select All" to update all students at once, or select specific students for targeted updates
          </div>
        </div>
      )}
      <div style={{ 
        marginBottom: '1.5rem', 
        padding: '1rem', 
        backgroundColor: '#f8fafc', 
        borderRadius: '0.5rem',
        border: '1px solid #e2e8f0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontWeight: 'bold', color: '#374151' }}>Batch Selection Controls</span>
          <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            {selected.length} of {students.length} selected
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={selectAll}
            style={{ 
              backgroundColor: '#3b82f6', 
              color: 'white', 
              border: 'none', 
              borderRadius: '0.375rem', 
              padding: '0.5rem 1rem', 
              fontWeight: 'bold', 
              cursor: 'pointer',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
          >
            ☑️ Select All Students
          </button>
          <button
            onClick={deselectAll}
            style={{ 
              backgroundColor: '#6b7280', 
              color: 'white', 
              border: 'none', 
              borderRadius: '0.375rem', 
              padding: '0.5rem 1rem', 
              fontWeight: 'bold', 
              cursor: 'pointer',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
          >
            ☐ Clear Selection
          </button>
          {selected.length > 0 && (
            <button
              onClick={() => setSelected(students.filter(s => s.xp && s.xp > 0).map(s => s.id))}
              style={{ 
                backgroundColor: '#8b5cf6', 
                color: 'white', 
                border: 'none', 
                borderRadius: '0.375rem', 
                padding: '0.5rem 1rem', 
                fontWeight: 'bold', 
                cursor: 'pointer',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              🎯 Select Active Students
            </button>
          )}
        </div>
      </div>
      
      {students.map(student => (
        <div key={student.id} style={{ 
          marginBottom: '2rem', 
          border: selected.includes(student.id) ? '2px solid #3b82f6' : '1px solid #e5e7eb', 
          borderRadius: '0.5rem',
          padding: '1.5rem',
          backgroundColor: selected.includes(student.id) ? '#f0f9ff' : 'white',
          boxShadow: selected.includes(student.id) ? '0 4px 6px -1px rgba(59, 130, 246, 0.1)' : '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
          transition: 'all 0.2s ease-in-out'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <input
                type="checkbox"
                checked={selected.includes(student.id)}
                onChange={() => toggleSelect(student.id)}
                style={{ 
                  width: 20, 
                  height: 20, 
                  cursor: 'pointer',
                  accentColor: '#3b82f6'
                }}
              />
              <img
                src={student.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.displayName || student.email || 'Student')}&background=4f46e5&color=fff&size=48`}
                alt="Avatar"
                style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '2px solid #e5e7eb' }}
              />
              {editingStudent === student.id ? (
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={editForm.displayName}
                    onChange={(e) => setEditForm(prev => ({ ...prev, displayName: e.target.value }))}
                    style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
                    placeholder="Display Name"
                  />
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                    style={{ padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.25rem' }}
                    placeholder="Email"
                  />
                  <button
                    onClick={() => saveEdit(student.id)}
                    style={{
                      backgroundColor: '#10b981',
                      color: 'white',
                      padding: '0.5rem 1rem',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer'
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    style={{
                      backgroundColor: '#6b7280',
                      color: 'white',
                      padding: '0.5rem 1rem',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
                    {student.displayName || 'Unnamed Student'}
                  </h2>
                  <p style={{ color: '#6b7280', marginBottom: '0.5rem' }}>
                    {student.email || 'No email'}
                  </p>
                  <p style={{ fontWeight: 'bold' }}>
                    XP: {student.xp || 0} | Power Points: {student.powerPoints || 0}
                    <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="number"
                        min={1}
                        value={ppAmount[student.id] ?? 1}
                        onChange={e => setPPAmount(prev => ({ ...prev, [student.id]: Math.max(1, Number(e.target.value)) }))}
                        style={{ width: 40, marginLeft: 8, marginRight: 4, padding: '2px 4px', border: '1px solid #d1d5db', borderRadius: 4 }}
                      />
                      <button
                        onClick={() => adjustPowerPoints(student.id, (ppAmount[student.id] ?? 1))}
                        style={{ backgroundColor: '#10b981', color: 'white', border: 'none', borderRadius: 4, padding: '2px 8px', marginRight: 2, cursor: 'pointer', fontWeight: 'bold' }}
                        title="Add Power Points"
                      >
                        +
                      </button>
                      <button
                        onClick={() => adjustPowerPoints(student.id, -(ppAmount[student.id] ?? 1))}
                        style={{ backgroundColor: '#dc2626', color: 'white', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontWeight: 'bold' }}
                        title="Subtract Power Points"
                      >
                        –
                      </button>
                    </span>
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      onClick={() => startEditing(student)}
                      style={{
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        padding: '0.25rem 0.75rem',
                        border: 'none',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      Edit Info
                    </button>
                    <button
                      onClick={() => viewStudentProfile(student.id)}
                      style={{
                        backgroundColor: '#10b981',
                        color: 'white',
                        padding: '0.25rem 0.75rem',
                        border: 'none',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      View Profile
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: '1rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem' }}>Challenges</h3>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {student.challenges && Object.entries(student.challenges).map(([name, data]) => (
                <div key={name} style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '1rem',
                  padding: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.25rem',
                  backgroundColor: data.completed ? '#f0fdf4' : '#fefefe'
                }}>
                  <input
                    type="checkbox"
                    checked={!!data.completed}
                    onChange={() => toggleChallengeCompletion(student.id, name)}
                    disabled={!data.file} // Only allow completion if file is uploaded
                  />
                  <span style={{ flex: 1, fontWeight: data.completed ? 'bold' : 'normal' }}>
                    {name}
                  </span>
                  {data.file && (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <a
                        href={data.file}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ 
                          color: '#2563eb', 
                          fontSize: '0.875rem',
                          textDecoration: 'none',
                          padding: '0.25rem 0.5rem',
                          backgroundColor: '#eff6ff',
                          borderRadius: '0.25rem'
                        }}
                      >
                        View Submission
                      </a>
                      <button
                        onClick={() => setShowDeleteConfirm({ studentId: student.id, challenge: name })}
                        style={{
                          backgroundColor: '#dc2626',
                          color: 'white',
                          padding: '0.25rem 0.5rem',
                          border: 'none',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.875rem'
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
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
            padding: '2rem',
            borderRadius: '0.5rem',
            maxWidth: '400px',
            textAlign: 'center'
          }}>
            <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem', fontWeight: 'bold' }}>
              Confirm Deletion
            </h3>
            <p style={{ marginBottom: '1.5rem', color: '#6b7280' }}>
              Are you sure you want to delete this challenge submission? This action cannot be undone and will remove the associated points.
            </p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
              <button
                onClick={() => deleteSubmission(showDeleteConfirm.studentId, showDeleteConfirm.challenge)}
                style={{
                  backgroundColor: '#dc2626',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
              >
                Delete
              </button>
              <button
                onClick={() => setShowDeleteConfirm(null)}
                style={{
                  backgroundColor: '#6b7280',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Profile View Modal */}
      {viewingProfile && (
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
          zIndex: 1000,
          padding: '2rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '0.75rem',
            padding: '2rem',
            maxWidth: '600px',
            maxHeight: '90vh',
            overflow: 'auto',
            position: 'relative'
          }}>
            <button
              onClick={closeProfileView}
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                backgroundColor: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '50%',
                width: '2rem',
                height: '2rem',
                cursor: 'pointer',
                fontSize: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              ×
            </button>
            
            {(() => {
              const student = students.find(s => s.id === viewingProfile);
              if (!student) return <div>Student not found</div>;
              
              const level = Math.floor((student.xp || 0) / 50) + 1;
              const avatarUrl = student.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(student.displayName || 'Student')}&background=4f46e5&color=fff&size=128`;
              
              return (
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#1f2937' }}>
                    {student.displayName || 'Unnamed Student'}'s Profile
                  </h2>
                  
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '2rem' }}>
                    <PlayerCard
                      name={student.displayName || 'Unnamed Student'}
                      photoURL={avatarUrl}
                      powerPoints={student.powerPoints || 0}
                      manifest={level >= 5 ? (student.manifest || 'Imposition') : 'None'}
                      level={level}
                      rarity={student.rarity || 3}
                      style={student.manifestationType || 'Fire'}
                      description={student.bio || 'No description provided.'}
                      cardBgColor={student.cardBgColor || '#e0e7ff'}
                      moves={student.moves || []}
                      badges={student.badges || []}
                      xp={student.xp || 0}
                    />
                  </div>
                  
                  <div style={{ backgroundColor: '#f9fafb', borderRadius: '0.5rem', padding: '1.5rem', marginBottom: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#374151' }}>
                      Student Information
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div>
                        <strong>Email:</strong> {student.email || 'No email'}
                      </div>
                      <div>
                        <strong>Level:</strong> {level}
                      </div>
                      <div>
                        <strong>XP:</strong> {student.xp || 0}
                      </div>
                      <div>
                        <strong>Power Points:</strong> {student.powerPoints || 0}
                      </div>
                      <div>
                        <strong>Element:</strong> {student.manifestationType || 'None'}
                      </div>
                      <div>
                        <strong>Manifestation:</strong> {level >= 5 ? (student.manifest || 'Imposition') : 'None'}
                      </div>
                      <div>
                        <strong>Story Chapter:</strong> {student.storyChapter || 1}
                      </div>
                      <div>
                        <strong>Badges Earned:</strong> {(student.badges || []).length}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ backgroundColor: '#f9fafb', borderRadius: '0.5rem', padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '1rem', color: '#374151' }}>
                      Challenge Progress
                    </h3>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {student.challenges && Object.entries(student.challenges).map(([name, data]) => (
                        <div key={name} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          padding: '0.75rem',
                          border: '1px solid #e5e7eb',
                          borderRadius: '0.25rem',
                          backgroundColor: data.completed ? '#f0fdf4' : '#fefefe'
                        }}>
                          <span style={{ fontSize: '1.25rem' }}>
                            {data.completed ? '✅' : '⏳'}
                          </span>
                          <span style={{ flex: 1, fontWeight: data.completed ? 'bold' : 'normal' }}>
                            {name}
                          </span>
                          {data.file && (
                            <a
                              href={data.file}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                color: '#2563eb',
                                fontSize: '0.875rem',
                                textDecoration: 'none',
                                padding: '0.25rem 0.5rem',
                                backgroundColor: '#eff6ff',
                                borderRadius: '0.25rem'
                              }}
                            >
                              View Submission
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Batch Success Notification */}
      {showBatchSuccess && (
        <div style={{
          position: 'fixed',
          top: '2rem',
          right: '2rem',
          backgroundColor: '#10b981',
          color: 'white',
          padding: '1rem 1.5rem',
          borderRadius: '0.5rem',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
          zIndex: 1001,
          maxWidth: '400px',
          animation: 'slideIn 0.3s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>✅</span>
            <div>
              <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>Batch Update Complete!</div>
              <div style={{ fontSize: '0.875rem', opacity: 0.9 }}>{batchMessage}</div>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default AdminPanel; 