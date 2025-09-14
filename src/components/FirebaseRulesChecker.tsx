import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';

interface FirebaseRulesCheckerProps {
  isOpen: boolean;
  onClose: () => void;
}

const FirebaseRulesChecker: React.FC<FirebaseRulesCheckerProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState<any>(null);

  const runPermissionTests = async () => {
    if (!currentUser) return;

    setLoading(true);
    const results: any = {
      timestamp: new Date().toISOString(),
      userId: currentUser.uid,
      userEmail: currentUser.email,
      tests: {}
    };

    try {
      // Test 1: Read from users collection
      console.log('🔍 Testing users collection read...');
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);
        results.tests.usersRead = {
          success: true,
          exists: userDoc.exists(),
          data: userDoc.exists() ? userDoc.data() : null
        };
      } catch (error) {
        results.tests.usersRead = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }

      // Test 2: Write to users collection
      console.log('🔍 Testing users collection write...');
      try {
        const userRef = doc(db, 'users', currentUser.uid);
        await setDoc(userRef, { 
          permissionTest: true,
          testTimestamp: serverTimestamp()
        }, { merge: true });
        results.tests.usersWrite = {
          success: true,
          message: 'Write successful'
        };
      } catch (error) {
        results.tests.usersWrite = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }

      // Test 3: Read from students collection
      console.log('🔍 Testing students collection read...');
      try {
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        results.tests.studentsRead = {
          success: true,
          exists: studentDoc.exists(),
          data: studentDoc.exists() ? studentDoc.data() : null
        };
      } catch (error) {
        results.tests.studentsRead = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }

      // Test 4: Write to students collection
      console.log('🔍 Testing students collection write...');
      try {
        const studentRef = doc(db, 'students', currentUser.uid);
        await setDoc(studentRef, { 
          permissionTest: true,
          testTimestamp: serverTimestamp()
        }, { merge: true });
        results.tests.studentsWrite = {
          success: true,
          message: 'Write successful'
        };
      } catch (error) {
        results.tests.studentsWrite = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }

      // Test 5: Read from challengeSubmissions collection
      console.log('🔍 Testing challengeSubmissions collection read...');
      try {
        const submissionsRef = collection(db, 'challengeSubmissions');
        const submissionsSnapshot = await getDocs(submissionsRef);
        results.tests.submissionsRead = {
          success: true,
          count: submissionsSnapshot.docs.length
        };
      } catch (error) {
        results.tests.submissionsRead = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }

      // Test 6: Read from notifications collection
      console.log('🔍 Testing notifications collection read...');
      try {
        const notificationsRef = collection(db, 'notifications');
        const notificationsSnapshot = await getDocs(notificationsRef);
        results.tests.notificationsRead = {
          success: true,
          count: notificationsSnapshot.docs.length
        };
      } catch (error) {
        results.tests.notificationsRead = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }

      // Test 7: Test account access
      console.log('🔍 Testing test account access...');
      try {
        const testUserRef = doc(db, 'users', 'test-account-001');
        const testUserDoc = await getDoc(testUserRef);
        results.tests.testAccountRead = {
          success: true,
          exists: testUserDoc.exists(),
          data: testUserDoc.exists() ? testUserDoc.data() : null
        };
      } catch (error) {
        results.tests.testAccountRead = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }

      setTestResults(results);

    } catch (error) {
      console.error('❌ Permission test error:', error);
      results.error = error instanceof Error ? error.message : 'Unknown error occurred';
      setTestResults(results);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (success: boolean) => success ? '✅' : '❌';
  const getStatusColor = (success: boolean) => success ? '#10B981' : '#EF4444';

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
        maxWidth: '800px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        color: '#1f2937'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937' }}>
            🔐 Firebase Rules Checker
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

        <div style={{ marginBottom: '2rem' }}>
          <button
            onClick={runPermissionTests}
            disabled={loading}
            style={{
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1,
              fontSize: '1rem',
              fontWeight: 'bold'
            }}
          >
            {loading ? '⏳ Testing...' : '🔍 Run Permission Tests'}
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
            <p>Running permission tests...</p>
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
              <h3 style={{ marginBottom: '1rem', color: '#1f2937' }}>📊 Permission Test Summary</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <strong>Users Read:</strong> {getStatusIcon(testResults.tests.usersRead?.success)}
                </div>
                <div>
                  <strong>Users Write:</strong> {getStatusIcon(testResults.tests.usersWrite?.success)}
                </div>
                <div>
                  <strong>Students Read:</strong> {getStatusIcon(testResults.tests.studentsRead?.success)}
                </div>
                <div>
                  <strong>Students Write:</strong> {getStatusIcon(testResults.tests.studentsWrite?.success)}
                </div>
                <div>
                  <strong>Submissions Read:</strong> {getStatusIcon(testResults.tests.submissionsRead?.success)}
                </div>
                <div>
                  <strong>Notifications Read:</strong> {getStatusIcon(testResults.tests.notificationsRead?.success)}
                </div>
                <div>
                  <strong>Test Account Read:</strong> {getStatusIcon(testResults.tests.testAccountRead?.success)}
                </div>
              </div>
            </div>

            {/* Detailed Test Results */}
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', color: '#1f2937' }}>🔬 Detailed Results</h3>
              
              {Object.entries(testResults.tests).map(([testName, testResult]: [string, any]) => (
                <div key={testName} style={{ 
                  marginBottom: '1rem', 
                  padding: '1rem', 
                  border: '1px solid #e5e7eb', 
                  borderRadius: '0.5rem' 
                }}>
                  <h4 style={{ 
                    color: getStatusColor(testResult.success), 
                    marginBottom: '0.5rem' 
                  }}>
                    {getStatusIcon(testResult.success)} {testName.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                  </h4>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                    {testResult.success ? (
                      <div>
                        {testResult.message && <p><strong>Message:</strong> {testResult.message}</p>}
                        {testResult.exists !== undefined && <p><strong>Exists:</strong> {testResult.exists ? 'Yes' : 'No'}</p>}
                        {testResult.count !== undefined && <p><strong>Count:</strong> {testResult.count}</p>}
                      </div>
                    ) : (
                      <p><strong>Error:</strong> {testResult.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Raw Data */}
            <details style={{ marginTop: '2rem' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '1rem' }}>
                📋 Raw Test Data
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

        {/* Instructions */}
        <div style={{ 
          background: '#fef3c7', 
          padding: '1rem', 
          borderRadius: '0.5rem',
          border: '1px solid #f59e0b',
          marginTop: '2rem'
        }}>
          <h4 style={{ color: '#92400e', marginBottom: '0.5rem' }}>📖 How to Use:</h4>
          <ul style={{ color: '#92400e', fontSize: '0.9rem', margin: 0, paddingLeft: '1.5rem' }}>
            <li><strong>Run Permission Tests:</strong> Tests all Firebase collection access permissions</li>
            <li><strong>Check Results:</strong> Look for ❌ marks to identify permission issues</li>
            <li><strong>Fix Rules:</strong> Update Firebase security rules based on failed tests</li>
            <li><strong>Test Account:</strong> Verifies access to the test account data</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default FirebaseRulesChecker;

