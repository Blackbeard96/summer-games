import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { detectManifest, getManifestInfo, logManifestDetection } from '../utils/manifestDetection';

interface ManifestDetectionDiagnosticProps {
  isOpen: boolean;
  onClose: () => void;
}

const ManifestDetectionDiagnostic: React.FC<ManifestDetectionDiagnosticProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const [diagnosticData, setDiagnosticData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && currentUser) {
      runDiagnostic();
    }
  }, [isOpen, currentUser]);

  const runDiagnostic = async () => {
    if (!currentUser) return;
    
    setLoading(true);
    try {
      // Fetch data from both collections
      const studentRef = doc(db, 'students', currentUser.uid);
      const userRef = doc(db, 'users', currentUser.uid);
      
      const [studentDoc, userDoc] = await Promise.all([
        getDoc(studentRef),
        getDoc(userRef)
      ]);
      
      const studentData = studentDoc.exists() ? studentDoc.data() : {};
      const userProgress = userDoc.exists() ? userDoc.data() : {};
      
      // Test manifest detection
      const manifestData = { studentData, userProgress };
      const hasManifest = detectManifest(manifestData);
      const manifestInfo = getManifestInfo(manifestData);
      
      setDiagnosticData({
        hasManifest,
        manifestInfo,
        studentData,
        userProgress,
        timestamp: new Date().toISOString()
      });
      
      // Log to console for debugging
      logManifestDetection(manifestData, 'ManifestDetectionDiagnostic');
      
    } catch (error) {
      console.error('Error running manifest diagnostic:', error);
      setDiagnosticData({
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
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
      zIndex: 1000,
      padding: '2rem'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '1rem',
        padding: '2rem',
        maxWidth: '800px',
        width: '100%',
        maxHeight: '90vh',
        overflow: 'auto',
        position: 'relative',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            cursor: 'pointer',
            color: '#6b7280',
            width: '32px',
            height: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = '#f3f4f6';
            e.currentTarget.style.color = '#374151';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#6b7280';
          }}
        >
          ×
        </button>

        <div style={{ textAlign: 'center', paddingRight: '2rem' }}>
          <h2 style={{ 
            fontSize: '1.75rem', 
            fontWeight: 'bold', 
            color: '#1f2937',
            marginBottom: '1rem'
          }}>
            🔍 Manifest Detection Diagnostic
          </h2>
          
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{
                width: '40px',
                height: '40px',
                border: '4px solid #e5e7eb',
                borderTop: '4px solid #3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 1rem auto'
              }}></div>
              <p>Running diagnostic...</p>
            </div>
          ) : diagnosticData ? (
            <div style={{ textAlign: 'left' }}>
              {/* Detection Result */}
              <div style={{
                padding: '1rem',
                borderRadius: '0.5rem',
                marginBottom: '1.5rem',
                backgroundColor: diagnosticData.hasManifest ? '#f0fdf4' : '#fef2f2',
                border: `2px solid ${diagnosticData.hasManifest ? '#22c55e' : '#ef4444'}`
              }}>
                <h3 style={{ 
                  color: diagnosticData.hasManifest ? '#16a34a' : '#dc2626',
                  marginBottom: '0.5rem'
                }}>
                  {diagnosticData.hasManifest ? '✅ Manifest Detected' : '❌ No Manifest Found'}
                </h3>
                {diagnosticData.manifestInfo && (
                  <div style={{ fontSize: '0.9rem', color: '#374151' }}>
                    <p><strong>Source:</strong> {diagnosticData.manifestInfo.source}</p>
                    {diagnosticData.manifestInfo.manifestId && (
                      <p><strong>Manifest ID:</strong> {diagnosticData.manifestInfo.manifestId}</p>
                    )}
                    {diagnosticData.manifestInfo.manifestationType && (
                      <p><strong>Manifestation Type:</strong> {diagnosticData.manifestInfo.manifestationType}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Raw Data */}
              <details style={{ marginBottom: '1.5rem' }}>
                <summary style={{ 
                  cursor: 'pointer', 
                  fontWeight: 'bold',
                  padding: '0.5rem',
                  backgroundColor: '#f3f4f6',
                  borderRadius: '0.25rem'
                }}>
                  📊 Raw Data (Click to Expand)
                </summary>
                <div style={{ 
                  marginTop: '0.5rem',
                  padding: '1rem',
                  backgroundColor: '#f9fafb',
                  borderRadius: '0.25rem',
                  fontSize: '0.8rem',
                  overflow: 'auto',
                  maxHeight: '300px'
                }}>
                  <pre>{JSON.stringify({
                    studentData: diagnosticData.studentData,
                    userProgress: diagnosticData.userProgress
                  }, null, 2)}</pre>
                </div>
              </details>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                <button
                  onClick={runDiagnostic}
                  style={{
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    padding: '0.75rem 1.5rem',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#2563eb'; }}
                  onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#3b82f6'; }}
                >
                  🔄 Refresh Diagnostic
                </button>
                <button
                  onClick={() => {
                    console.log('Manifest Detection Diagnostic Data:', diagnosticData);
                    alert('Diagnostic data logged to console');
                  }}
                  style={{
                    backgroundColor: '#6b7280',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    padding: '0.75rem 1.5rem',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease'
                  }}
                  onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#4b5563'; }}
                  onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#6b7280'; }}
                >
                  📋 Copy to Console
                </button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p>No diagnostic data available. Click "Run Diagnostic" to check your manifest status.</p>
              <button
                onClick={runDiagnostic}
                style={{
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1.5rem',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  marginTop: '1rem'
                }}
              >
                🔍 Run Diagnostic
              </button>
            </div>
          )}
        </div>
      </div>

      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  );
};

export default ManifestDetectionDiagnostic;
