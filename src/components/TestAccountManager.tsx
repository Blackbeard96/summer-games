import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  collection, 
  getDocs, 
  query, 
  where, 
  serverTimestamp,
  writeBatch 
} from 'firebase/firestore';
import { MANIFESTS } from '../types/manifest';
import { CHAPTERS } from '../types/chapters';

interface TestAccountManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const TestAccountManager: React.FC<TestAccountManagerProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [testAccountData, setTestAccountData] = useState<any>(null);
  const [selectedManifest, setSelectedManifest] = useState<string>('reading');
  const [selectedChapter, setSelectedChapter] = useState<number>(1);
  const [testResults, setTestResults] = useState<any>(null);
  const [adminOverride, setAdminOverride] = useState(false);

  // Check if current user is admin
  const isAdmin = adminOverride || 
                  currentUser?.email === 'eddymosley@compscihigh.org' || 
                  currentUser?.email === 'admin@mstgames.net' ||
                  currentUser?.email === 'edm21179@gmail.com' ||
                  currentUser?.email?.includes('eddymosley') ||
                  currentUser?.email?.includes('admin') ||
                  currentUser?.email?.includes('mstgames');

  useEffect(() => {
    if (isOpen && isAdmin) {
      loadTestAccountData();
    }
  }, [isOpen, isAdmin]);

  const loadTestAccountData = async () => {
    setLoading(true);
    try {
      const testUserId = 'test-account-001';
      const userRef = doc(db, 'users', testUserId);
      const studentRef = doc(db, 'students', testUserId);
      
      const [userDoc, studentDoc] = await Promise.all([
        getDoc(userRef),
        getDoc(studentRef)
      ]);

      const userData = userDoc.exists() ? userDoc.data() : null;
      const studentData = studentDoc.exists() ? studentDoc.data() : null;

      setTestAccountData({
        userId: testUserId,
        userData,
        studentData,
        userExists: userDoc.exists(),
        studentExists: studentDoc.exists()
      });

    } catch (error) {
      console.error('Error loading test account data:', error);
    } finally {
      setLoading(false);
    }
  };

  const createTestAccount = async () => {
    if (!isAdmin) return;
    
    setLoading(true);
    try {
      const testUserId = 'test-account-001';
      const testEmail = 'test@mstgames.net';
      const testDisplayName = 'Test Student';

      // Create test user document
      const userRef = doc(db, 'users', testUserId);
      await setDoc(userRef, {
        uid: testUserId,
        email: testEmail,
        displayName: testDisplayName,
        emailVerified: true,
        createdAt: serverTimestamp(),
        isTestAccount: true,
        manifest: null,
        chapters: {},
        xp: 0,
        powerPoints: 0,
        level: 1
      });

      // Create test student document
      const studentRef = doc(db, 'students', testUserId);
      await setDoc(studentRef, {
        uid: testUserId,
        email: testEmail,
        displayName: testDisplayName,
        emailVerified: true,
        createdAt: serverTimestamp(),
        isTestAccount: true,
        manifest: null,
        chapters: {},
        xp: 0,
        powerPoints: 0,
        level: 1,
        photoURL: null,
        manifestationType: null,
        style: null,
        rarity: null,
        bio: null,
        cardBgColor: null,
        moves: [],
        badges: [],
        storyChapter: 1
      });

      await loadTestAccountData();
      alert('✅ Test account created successfully!');
      
    } catch (error) {
      console.error('Error creating test account:', error);
      alert('❌ Failed to create test account: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const resetTestAccount = async () => {
    if (!isAdmin) return;
    
    setLoading(true);
    try {
      const testUserId = 'test-account-001';
      
      // Reset user document
      const userRef = doc(db, 'users', testUserId);
      await setDoc(userRef, {
        uid: testUserId,
        email: 'test@mstgames.net',
        displayName: 'Test Student',
        emailVerified: true,
        createdAt: serverTimestamp(),
        isTestAccount: true,
        manifest: null,
        chapters: {},
        xp: 0,
        powerPoints: 0,
        level: 1
      });

      // Reset student document
      const studentRef = doc(db, 'students', testUserId);
      await setDoc(studentRef, {
        uid: testUserId,
        email: 'test@mstgames.net',
        displayName: 'Test Student',
        emailVerified: true,
        createdAt: serverTimestamp(),
        isTestAccount: true,
        manifest: null,
        chapters: {},
        xp: 0,
        powerPoints: 0,
        level: 1,
        photoURL: null,
        manifestationType: null,
        style: null,
        rarity: null,
        bio: null,
        cardBgColor: null,
        moves: [],
        badges: [],
        storyChapter: 1
      });

      // Clear all related data
      await clearTestAccountData(testUserId);
      
      await loadTestAccountData();
      alert('✅ Test account reset successfully!');
      
    } catch (error) {
      console.error('Error resetting test account:', error);
      alert('❌ Failed to reset test account: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const clearTestAccountData = async (testUserId: string) => {
    try {
      // Clear challenge submissions
      const submissionsQuery = query(
        collection(db, 'challengeSubmissions'),
        where('userId', '==', testUserId)
      );
      const submissionsSnapshot = await getDocs(submissionsQuery);
      const batch = writeBatch(db);
      
      submissionsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      // Clear notifications
      const notificationsQuery = query(
        collection(db, 'notifications'),
        where('userId', '==', testUserId)
      );
      const notificationsSnapshot = await getDocs(notificationsQuery);
      
      notificationsSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
    } catch (error) {
      console.error('Error clearing test account data:', error);
    }
  };

  const setTestManifest = async () => {
    if (!isAdmin) return;
    
    setLoading(true);
    try {
      const testUserId = 'test-account-001';
      const manifest = MANIFESTS.find(m => m.id === selectedManifest);
      
      if (!manifest) {
        alert('❌ Invalid manifest selected');
        return;
      }

      const playerManifest = {
        manifestId: selectedManifest,
        currentLevel: 1,
        xp: 0,
        catalyst: manifest.catalyst,
        veil: 'Fear of inadequacy',
        signatureMove: manifest.signatureMove,
        unlockedLevels: [1],
        lastAscension: serverTimestamp()
      };

      // Update both collections
      const userRef = doc(db, 'users', testUserId);
      const studentRef = doc(db, 'students', testUserId);
      
      await setDoc(userRef, { manifest: playerManifest }, { merge: true });
      await setDoc(studentRef, { manifest: playerManifest }, { merge: true });
      
      await loadTestAccountData();
      alert(`✅ Test manifest set to: ${manifest.name}`);
      
    } catch (error) {
      console.error('Error setting test manifest:', error);
      alert('❌ Failed to set test manifest: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const setTestChapterProgress = async () => {
    if (!isAdmin) return;
    
    setLoading(true);
    try {
      const testUserId = 'test-account-001';
      const chapter = CHAPTERS.find(c => c.id === selectedChapter);
      
      if (!chapter) {
        alert('❌ Invalid chapter selected');
        return;
      }

      // Initialize chapter progress
      const chapterProgress = {
        id: chapter.id,
        title: chapter.title,
        isUnlocked: true,
        isCompleted: false,
        completedAt: null,
        challenges: chapter.challenges.map(challenge => ({
          ...challenge,
          isCompleted: false,
          completedAt: null,
          submittedAt: null,
          status: 'pending',
          file: null,
          autoCompleted: false
        }))
      };

      // Update both collections
      const userRef = doc(db, 'users', testUserId);
      const studentRef = doc(db, 'students', testUserId);
      
      await setDoc(userRef, { 
        [`chapters.${selectedChapter}`]: chapterProgress 
      }, { merge: true });
      
      await setDoc(studentRef, { 
        [`chapters.${selectedChapter}`]: chapterProgress 
      }, { merge: true });
      
      await loadTestAccountData();
      alert(`✅ Test chapter progress set to: Chapter ${selectedChapter}`);
      
    } catch (error) {
      console.error('Error setting test chapter progress:', error);
      alert('❌ Failed to set test chapter progress: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const runComprehensiveTest = async () => {
    if (!isAdmin) return;
    
    setLoading(true);
    try {
      const testUserId = 'test-account-001';
      const results: any = {
        timestamp: new Date().toISOString(),
        testUserId,
        tests: {}
      };

      // Test 1: Check if test account exists
      const userRef = doc(db, 'users', testUserId);
      const studentRef = doc(db, 'students', testUserId);
      const [userDoc, studentDoc] = await Promise.all([
        getDoc(userRef),
        getDoc(studentRef)
      ]);

      results.tests.accountExists = {
        userExists: userDoc.exists(),
        studentExists: studentDoc.exists(),
        userData: userDoc.exists() ? userDoc.data() : null,
        studentData: studentDoc.exists() ? studentDoc.data() : null
      };

      // Test 2: Check manifest functionality
      const userData = userDoc.exists() ? userDoc.data() : null;
      const studentData = studentDoc.exists() ? studentDoc.data() : null;
      const manifest = userData?.manifest || studentData?.manifest;
      
      results.tests.manifestTest = {
        hasManifest: !!manifest,
        manifestId: manifest?.manifestId || null,
        manifestValid: manifest ? MANIFESTS.find(m => m.id === manifest.manifestId) : null
      };

      // Test 3: Check chapter progress
      results.tests.chapterTest = {
        hasChapters: !!(userData?.chapters || studentData?.chapters),
        chapterCount: Object.keys(userData?.chapters || studentData?.chapters || {}).length
      };

      // Test 4: Check related collections
      const submissionsQuery = query(
        collection(db, 'challengeSubmissions'),
        where('userId', '==', testUserId)
      );
      const notificationsQuery = query(
        collection(db, 'notifications'),
        where('userId', '==', testUserId)
      );
      
      const [submissionsSnapshot, notificationsSnapshot] = await Promise.all([
        getDocs(submissionsQuery),
        getDocs(notificationsQuery)
      ]);

      results.tests.relatedData = {
        submissionsCount: submissionsSnapshot.docs.length,
        notificationsCount: notificationsSnapshot.docs.length
      };

      setTestResults(results);
      alert('✅ Comprehensive test completed! Check results below.');
      
    } catch (error) {
      console.error('Error running comprehensive test:', error);
      alert('❌ Failed to run comprehensive test: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  if (!isAdmin) {
    return (
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
        zIndex: 2000,
        padding: '1rem'
      }}>
        <div style={{
          background: 'white',
          padding: '2rem',
          borderRadius: '1rem',
          maxWidth: '500px',
          width: '100%',
          textAlign: 'center'
        }}>
          <h2 style={{ color: '#dc2626', marginBottom: '1rem' }}>🚫 Access Denied</h2>
          <p>This feature is only available to administrators.</p>
          <div style={{ 
            background: '#f3f4f6', 
            padding: '1rem', 
            borderRadius: '0.5rem', 
            margin: '1rem 0',
            fontSize: '0.9rem',
            color: '#6b7280'
          }}>
            <p><strong>Current User:</strong> {currentUser?.email || 'Not logged in'}</p>
            <p><strong>User ID:</strong> {currentUser?.uid || 'N/A'}</p>
            <p><strong>Admin Check:</strong> {isAdmin ? '✅ Admin' : '❌ Not Admin'}</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button
              onClick={() => setAdminOverride(true)}
              style={{
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.75rem 1.5rem',
                cursor: 'pointer'
              }}
            >
              🔓 Override Admin Check
            </button>
            <button
              onClick={onClose}
              style={{
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.75rem 1.5rem',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
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
      zIndex: 2000,
      padding: '1rem'
    }}>
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '1rem',
        maxWidth: '1000px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        color: '#1f2937'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937' }}>
            🧪 Test Account Manager
          </h2>
          <button
            onClick={onClose}
            style={{
              background: '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.5rem 1rem',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
            <p>Processing...</p>
          </div>
        )}

        {/* Test Account Status */}
        <div style={{ 
          background: '#f3f4f6', 
          padding: '1rem', 
          borderRadius: '0.5rem', 
          marginBottom: '2rem' 
        }}>
          <h3 style={{ marginBottom: '1rem', color: '#1f2937' }}>📊 Test Account Status</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <strong>User Document:</strong> {testAccountData?.userExists ? '✅ Exists' : '❌ Missing'}
            </div>
            <div>
              <strong>Student Document:</strong> {testAccountData?.studentExists ? '✅ Exists' : '❌ Missing'}
            </div>
            <div>
              <strong>Has Manifest:</strong> {testAccountData?.userData?.manifest ? '✅ Yes' : '❌ No'}
            </div>
            <div>
              <strong>Has Chapters:</strong> {testAccountData?.userData?.chapters ? '✅ Yes' : '❌ No'}
            </div>
          </div>
        </div>

        {/* Account Management */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '1rem', color: '#1f2937' }}>🔧 Account Management</h3>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              onClick={createTestAccount}
              disabled={loading}
              style={{
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.75rem 1.5rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1
              }}
            >
              🆕 Create Test Account
            </button>
            
            <button
              onClick={resetTestAccount}
              disabled={loading}
              style={{
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.75rem 1.5rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1
              }}
            >
              🔄 Reset Test Account
            </button>
            
            <button
              onClick={runComprehensiveTest}
              disabled={loading}
              style={{
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '0.75rem 1.5rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.5 : 1
              }}
            >
              🧪 Run Comprehensive Test
            </button>
          </div>
        </div>

        {/* Test Configuration */}
        <div style={{ marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '1rem', color: '#1f2937' }}>⚙️ Test Configuration</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
            {/* Manifest Selection */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Select Test Manifest:
              </label>
              <select
                value={selectedManifest}
                onChange={(e) => setSelectedManifest(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem'
                }}
              >
                {MANIFESTS.map(manifest => (
                  <option key={manifest.id} value={manifest.id}>
                    {manifest.icon} {manifest.name}
                  </option>
                ))}
              </select>
              <button
                onClick={setTestManifest}
                disabled={loading}
                style={{
                  background: '#8b5cf6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.5rem 1rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                  marginTop: '0.5rem',
                  width: '100%'
                }}
              >
                Set Test Manifest
              </button>
            </div>

            {/* Chapter Selection */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Select Test Chapter:
              </label>
              <select
                value={selectedChapter}
                onChange={(e) => setSelectedChapter(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem'
                }}
              >
                {CHAPTERS.map(chapter => (
                  <option key={chapter.id} value={chapter.id}>
                    Chapter {chapter.id}: {chapter.title}
                  </option>
                ))}
              </select>
              <button
                onClick={setTestChapterProgress}
                disabled={loading}
                style={{
                  background: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.5rem 1rem',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                  marginTop: '0.5rem',
                  width: '100%'
                }}
              >
                Set Chapter Progress
              </button>
            </div>
          </div>
        </div>

        {/* Test Results */}
        {testResults && (
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1rem', color: '#1f2937' }}>📋 Test Results</h3>
            <div style={{ 
              background: '#f3f4f6', 
              padding: '1rem', 
              borderRadius: '0.5rem',
              maxHeight: '300px',
              overflow: 'auto'
            }}>
              <pre style={{ fontSize: '0.8rem', margin: 0 }}>
                {JSON.stringify(testResults, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Instructions */}
        <div style={{ 
          background: '#fef3c7', 
          padding: '1rem', 
          borderRadius: '0.5rem',
          border: '1px solid #f59e0b'
        }}>
          <h4 style={{ color: '#92400e', marginBottom: '0.5rem' }}>📖 How to Use:</h4>
          <ul style={{ color: '#92400e', fontSize: '0.9rem', margin: 0, paddingLeft: '1.5rem' }}>
            <li><strong>Create Test Account:</strong> Sets up a fresh test account with ID "test-account-001"</li>
            <li><strong>Reset Test Account:</strong> Clears all progress and returns to initial state</li>
            <li><strong>Set Test Manifest:</strong> Assigns a specific manifest to the test account</li>
            <li><strong>Set Chapter Progress:</strong> Initializes chapter progress for testing</li>
            <li><strong>Run Comprehensive Test:</strong> Tests all account features and data integrity</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TestAccountManager;
