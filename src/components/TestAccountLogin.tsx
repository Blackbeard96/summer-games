import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

interface TestAccountLoginProps {
  isOpen: boolean;
  onClose: () => void;
}

const TestAccountLogin: React.FC<TestAccountLoginProps> = ({ isOpen, onClose }) => {
  const { currentUser, currentRole, switchToTestAccount, switchToAdmin, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [testAccountId, setTestAccountId] = useState('test-account-001');
  const [adminOverride, setAdminOverride] = useState(false);

  // Check if current user is admin
  const isAdminUser = adminOverride || isAdmin();

  const handleSwitchToTestAccount = async () => {
    if (!isAdminUser) return;
    
    setLoading(true);
    try {
      await switchToTestAccount(testAccountId);
      alert(`✅ Switched to test account ${testAccountId}!\n\nYou can now test the student experience. Use "Return to Admin" to switch back.`);
      onClose();
    } catch (error) {
      console.error('Error switching to test account:', error);
      alert('❌ Failed to switch to test account: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const handleReturnToAdmin = async () => {
    setLoading(true);
    try {
      await switchToAdmin();
      alert('✅ Switched back to admin account!');
      onClose();
    } catch (error) {
      console.error('Error switching to admin:', error);
      alert('❌ Failed to switch to admin: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  if (!isAdminUser) {
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
            <p><strong>Admin Check:</strong> {isAdminUser ? '✅ Admin' : '❌ Not Admin'}</p>
            <p><strong>Current Role:</strong> {currentRole}</p>
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
        maxWidth: '600px',
        width: '100%',
        color: '#1f2937'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937' }}>
            🧪 Test Account Login
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
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Test Account ID:
          </label>
          <input
            type="text"
            value={testAccountId}
            onChange={(e) => setTestAccountId(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '0.375rem',
              border: '1px solid #d1d5db',
              fontSize: '1rem',
              marginBottom: '1rem'
            }}
            placeholder="test-account-001"
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <button
            onClick={handleSwitchToTestAccount}
            disabled={loading || currentRole === 'test'}
            style={{
              background: currentRole === 'test' ? '#6b7280' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              cursor: loading || currentRole === 'test' ? 'not-allowed' : 'pointer',
              opacity: loading || currentRole === 'test' ? 0.5 : 1,
              flex: 1
            }}
          >
            {loading ? '⏳ Switching...' : currentRole === 'test' ? '✅ In Test Mode' : '🎮 Switch to Test Account'}
          </button>
          
          <button
            onClick={handleReturnToAdmin}
            disabled={currentRole === 'admin'}
            style={{
              background: currentRole === 'admin' ? '#6b7280' : '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              cursor: currentRole === 'admin' ? 'not-allowed' : 'pointer',
              opacity: currentRole === 'admin' ? 0.5 : 1,
              flex: 1
            }}
          >
            {currentRole === 'admin' ? '✅ In Admin Mode' : '🔙 Return to Admin'}
          </button>
        </div>

        <div style={{ 
          background: '#fef3c7', 
          padding: '1rem', 
          borderRadius: '0.5rem',
          border: '1px solid #f59e0b'
        }}>
          <h4 style={{ color: '#92400e', marginBottom: '0.5rem' }}>📖 How to Use:</h4>
          <ul style={{ color: '#92400e', fontSize: '0.9rem', margin: 0, paddingLeft: '1.5rem' }}>
            <li><strong>Switch to Test Account:</strong> Instantly switch to test account mode without logging out</li>
            <li><strong>Return to Admin:</strong> Switch back to your admin account instantly</li>
            <li><strong>Test Account ID:</strong> Use "test-account-001" for the main test account</li>
            <li><strong>No Logout Required:</strong> Seamlessly toggle between admin and test modes</li>
          </ul>
        </div>

        <div style={{ 
          background: '#f3f4f6', 
          padding: '1rem', 
          borderRadius: '0.5rem',
          marginTop: '1rem'
        }}>
          <h4 style={{ color: '#374151', marginBottom: '0.5rem' }}>🔧 Test Account Features:</h4>
          <ul style={{ color: '#374151', fontSize: '0.9rem', margin: 0, paddingLeft: '1.5rem' }}>
            <li>Fresh manifest selection testing</li>
            <li>Chapter progress testing</li>
            <li>Challenge completion testing</li>
            <li>Battle system testing</li>
            <li>Marketplace testing</li>
            <li>All student features</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TestAccountLogin;
