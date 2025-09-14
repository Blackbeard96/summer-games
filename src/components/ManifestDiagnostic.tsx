import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { MANIFESTS, PlayerManifest } from '../types/manifest';

interface ManifestDiagnosticProps {
  isOpen: boolean;
  onClose: () => void;
}

const ManifestDiagnostic: React.FC<ManifestDiagnosticProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const [diagnosticData, setDiagnosticData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState<any>(null);

  useEffect(() => {
    if (isOpen && currentUser) {
      runDiagnostic();
    }
  }, [isOpen, currentUser]);

  const runDiagnostic = async () => {
    if (!currentUser) return;

    setLoading(true);
    const results: any = {
      timestamp: new Date().toISOString(),
      userId: currentUser.uid,
      userEmail: currentUser.email,
      tests: {}
    };

    try {
      // Test 1: Check if user document exists in users collection
      console.log('🔍 Testing users collection...');
      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.exists() ? userDoc.data() : null;
      console.log('🔍 Users collection data:', userData);
      results.tests.usersCollection = {
        exists: userDoc.exists(),
        hasData: userDoc.exists() ? Object.keys(userData || {}).length > 0 : false,
        manifest: userData?.manifest || null,
        data: userData
      };

      // Test 2: Check if student document exists in students collection
      console.log('🔍 Testing students collection...');
      const studentRef = doc(db, 'students', currentUser.uid);
      const studentDoc = await getDoc(studentRef);
      const studentData = studentDoc.exists() ? studentDoc.data() : null;
      console.log('🔍 Students collection data:', studentData);
      results.tests.studentsCollection = {
        exists: studentDoc.exists(),
        hasData: studentDoc.exists() ? Object.keys(studentData || {}).length > 0 : false,
        manifest: studentData?.manifest || null,
        data: studentData
      };

      // Test 3: Check manifest data consistency
      console.log('🔍 Testing manifest consistency...');
      const userManifest = results.tests.usersCollection.manifest;
      const studentManifest = results.tests.studentsCollection.manifest;
      
      results.tests.manifestConsistency = {
        userHasManifest: !!userManifest,
        studentHasManifest: !!studentManifest,
        manifestsMatch: JSON.stringify(userManifest) === JSON.stringify(studentManifest),
        userManifest,
        studentManifest
      };

      // Test 4: Check if manifest is valid
      console.log('🔍 Testing manifest validity...');
      const manifestToCheck = userManifest || studentManifest;
      console.log('🔍 Manifest to check:', manifestToCheck);
      if (manifestToCheck) {
        console.log('🔍 Looking for manifest ID:', manifestToCheck.manifestId);
        const validManifest = MANIFESTS.find(m => m.id === manifestToCheck.manifestId);
        console.log('🔍 Found valid manifest:', validManifest);
        results.tests.manifestValidity = {
          isValid: !!validManifest,
          manifestId: manifestToCheck.manifestId,
          manifestExists: !!validManifest,
          manifestData: validManifest
        };
      } else {
        console.log('🔍 No manifest found to check');
        results.tests.manifestValidity = {
          isValid: false,
          manifestId: null,
          manifestExists: false,
          manifestData: null
        };
      }

      // Test 5: Check authentication state
      console.log('🔍 Testing authentication...');
      results.tests.authentication = {
        isAuthenticated: !!currentUser,
        uid: currentUser?.uid,
        email: currentUser?.email,
        emailVerified: currentUser?.emailVerified,
        displayName: currentUser?.displayName
      };

      // Test 6: Check browser compatibility
      console.log('🔍 Testing browser compatibility...');
      results.tests.browserCompatibility = {
        userAgent: navigator.userAgent,
        localStorage: typeof Storage !== 'undefined',
        sessionStorage: typeof sessionStorage !== 'undefined',
        indexedDB: 'indexedDB' in window,
        webGL: !!document.createElement('canvas').getContext('webgl'),
        touchSupport: 'ontouchstart' in window,
        screenSize: {
          width: window.screen.width,
          height: window.screen.height,
          availWidth: window.screen.availWidth,
          availHeight: window.screen.availHeight
        },
        viewportSize: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      };

      setDiagnosticData(results);
      setTestResults(results);

    } catch (error) {
      console.error('❌ Diagnostic error:', error);
      results.error = error instanceof Error ? error.message : 'Unknown error occurred';
      setDiagnosticData(results);
      setTestResults(results);
    } finally {
      setLoading(false);
    }
  };

  const testManifestSelection = async () => {
    if (!currentUser) return;

    setLoading(true);
    try {
      // Test manifest selection by temporarily setting a test manifest
      const testManifest: PlayerManifest = {
        manifestId: 'reading',
        currentLevel: 1,
        xp: 0,
        catalyst: 'Golden Letter',
        veil: 'Fear of inadequacy',
        signatureMove: 'Future-read during team combat',
        unlockedLevels: [1],
        lastAscension: serverTimestamp()
      };

      // Save to both collections using setDoc with merge to handle missing documents
      const userRef = doc(db, 'users', currentUser.uid);
      const studentRef = doc(db, 'students', currentUser.uid);
      
      await setDoc(userRef, { manifest: testManifest }, { merge: true });
      await setDoc(studentRef, { manifest: testManifest }, { merge: true });

      alert('✅ Test manifest set successfully! Check if it appears in the app.');
      
      // Re-run diagnostic
      await runDiagnostic();
      
    } catch (error) {
      console.error('❌ Test manifest selection error:', error);
      alert('❌ Failed to set test manifest: ' + (error instanceof Error ? error.message : 'Unknown error occurred'));
    } finally {
      setLoading(false);
    }
  };

  const clearManifest = async () => {
    if (!currentUser) return;

    setLoading(true);
    try {
      // Clear manifest from both collections using setDoc with merge
      const userRef = doc(db, 'users', currentUser.uid);
      const studentRef = doc(db, 'students', currentUser.uid);
      
      await setDoc(userRef, { manifest: null }, { merge: true });
      await setDoc(studentRef, { manifest: null }, { merge: true });

      alert('✅ Manifest cleared successfully! The selection screen should appear.');
      
      // Re-run diagnostic
      await runDiagnostic();
      
    } catch (error) {
      console.error('❌ Clear manifest error:', error);
      alert('❌ Failed to clear manifest: ' + (error instanceof Error ? error.message : 'Unknown error occurred'));
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: boolean) => status ? '✅' : '❌';
  const getStatusColor = (status: boolean) => status ? '#10B981' : '#EF4444';

  if (!isOpen) return null;

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
            🔍 Manifest Selection Diagnostic
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
            <p>Running diagnostic tests...</p>
          </div>
        )}

        {testResults && (
          <div>
            {/* Test Results Summary */}
            <div style={{ 
              background: '#f3f4f6', 
              padding: '1rem', 
              borderRadius: '0.5rem', 
              marginBottom: '2rem' 
            }}>
              <h3 style={{ marginBottom: '1rem', color: '#1f2937' }}>📊 Test Summary</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <strong>Authentication:</strong> {getStatusIcon(testResults.tests.authentication?.isAuthenticated)}
                </div>
                <div>
                  <strong>Users Collection:</strong> {getStatusIcon(testResults.tests.usersCollection?.exists)}
                </div>
                <div>
                  <strong>Students Collection:</strong> {getStatusIcon(testResults.tests.studentsCollection?.exists)}
                </div>
                <div>
                  <strong>Manifest Valid:</strong> {getStatusIcon(testResults.tests.manifestValidity?.isValid)}
                </div>
                <div>
                  <strong>Manifests Match:</strong> {getStatusIcon(testResults.tests.manifestConsistency?.manifestsMatch)}
                </div>
              </div>
            </div>

            {/* Detailed Test Results */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', color: '#1f2937' }}>🔬 Detailed Results</h3>
              
              {/* Authentication Test */}
              <div style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
                <h4 style={{ color: getStatusColor(testResults.tests.authentication?.isAuthenticated), marginBottom: '0.5rem' }}>
                  {getStatusIcon(testResults.tests.authentication?.isAuthenticated)} Authentication
                </h4>
                <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                  <p><strong>User ID:</strong> {testResults.tests.authentication?.uid}</p>
                  <p><strong>Email:</strong> {testResults.tests.authentication?.email}</p>
                  <p><strong>Email Verified:</strong> {testResults.tests.authentication?.emailVerified ? 'Yes' : 'No'}</p>
                </div>
              </div>

              {/* Collections Test */}
              <div style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
                <h4 style={{ color: '#1f2937', marginBottom: '0.5rem' }}>📁 Database Collections</h4>
                <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                  <p><strong>Users Collection:</strong> {testResults.tests.usersCollection?.exists ? '✅ Exists' : '❌ Missing'}</p>
                  <p><strong>Students Collection:</strong> {testResults.tests.studentsCollection?.exists ? '✅ Exists' : '❌ Missing'}</p>
                  <p><strong>User Has Manifest:</strong> {testResults.tests.usersCollection?.manifest ? '✅ Yes' : '❌ No'}</p>
                  <p><strong>Student Has Manifest:</strong> {testResults.tests.studentsCollection?.manifest ? '✅ Yes' : '❌ No'}</p>
                </div>
              </div>

              {/* Manifest Test */}
              <div style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
                <h4 style={{ color: getStatusColor(testResults.tests.manifestValidity?.isValid), marginBottom: '0.5rem' }}>
                  {getStatusIcon(testResults.tests.manifestValidity?.isValid)} Manifest Validity
                </h4>
                <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                  <p><strong>Manifest ID:</strong> {testResults.tests.manifestValidity?.manifestId || 'None'}</p>
                  <p><strong>Valid Manifest:</strong> {testResults.tests.manifestValidity?.isValid ? '✅ Yes' : '❌ No'}</p>
                  {testResults.tests.manifestValidity?.manifestData && (
                    <p><strong>Manifest Name:</strong> {testResults.tests.manifestValidity.manifestData.name}</p>
                  )}
                </div>
              </div>

              {/* Browser Compatibility */}
              <div style={{ marginBottom: '1rem', padding: '1rem', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}>
                <h4 style={{ color: '#1f2937', marginBottom: '0.5rem' }}>🌐 Browser Compatibility</h4>
                <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                  <p><strong>Screen Size:</strong> {testResults.tests.browserCompatibility?.screenSize?.width}x{testResults.tests.browserCompatibility?.screenSize?.height}</p>
                  <p><strong>Viewport Size:</strong> {testResults.tests.browserCompatibility?.viewportSize?.width}x{testResults.tests.browserCompatibility?.viewportSize?.height}</p>
                  <p><strong>Touch Support:</strong> {testResults.tests.browserCompatibility?.touchSupport ? '✅ Yes' : '❌ No'}</p>
                  <p><strong>Local Storage:</strong> {testResults.tests.browserCompatibility?.localStorage ? '✅ Yes' : '❌ No'}</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button
                onClick={runDiagnostic}
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
                🔄 Re-run Tests
              </button>
              
              <button
                onClick={testManifestSelection}
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
                🧪 Test Manifest Selection
              </button>
              
              <button
                onClick={clearManifest}
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
                🗑️ Clear Manifest
              </button>
            </div>

            {/* Raw Data */}
            <details style={{ marginTop: '2rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '1rem' }}>
                📋 Raw Diagnostic Data
              </summary>
              <pre style={{ 
                background: '#f3f4f6', 
                padding: '1rem', 
                borderRadius: '0.5rem', 
                overflow: 'auto',
                fontSize: '0.8rem',
                maxHeight: '300px'
              }}>
                {JSON.stringify(testResults, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManifestDiagnostic;
