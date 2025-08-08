import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import StoryChallenges from '../components/StoryChallenges';
import ManifestChallenges from '../components/ManifestChallenges';
import RecentCompletions from '../components/RecentCompletions';
import ManifestSelection from '../components/ManifestSelection';
import { PlayerManifest, MANIFESTS } from '../types/manifest';

const Dashboard = () => {
  const { currentUser } = useAuth();
  const [playerManifest, setPlayerManifest] = useState<PlayerManifest | null>(null);
  const [showManifestSelection, setShowManifestSelection] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // Check if device is mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const fetchManifest = async () => {
      if (!currentUser) {
        console.log('Dashboard: No current user, setting loading to false');
        setLoading(false);
        return;
      }

      console.log('Dashboard: Fetching manifest for user:', currentUser.uid);
      
      // Add a timeout to prevent infinite loading
      const timeoutId = setTimeout(() => {
        console.log('Dashboard: Loading timeout reached, forcing completion');
        setLoading(false);
        setShowManifestSelection(true);
      }, 10000); // 10 second timeout
      
      try {
        // Try to get manifest from students collection first
        const studentRef = doc(db, 'students', currentUser.uid);
        const studentDoc = await getDoc(studentRef);
        
        console.log('Dashboard: Student document exists:', studentDoc.exists());
        
        if (studentDoc.exists()) {
          const studentData = studentDoc.data();
          console.log('Dashboard: Student data:', studentData);
          
          const manifestData = studentData.manifest;
          if (manifestData) {
            console.log('Dashboard: Found manifest in students collection');
            // Convert Firestore timestamp to Date if needed
            const processedManifest = {
              ...manifestData,
              lastAscension: manifestData.lastAscension?.toDate ? 
                manifestData.lastAscension.toDate() : 
                new Date(manifestData.lastAscension)
            };
            setPlayerManifest(processedManifest);
          } else {
            console.log('Dashboard: No manifest found in students collection, checking users collection');
            // Try users collection as fallback
            const userRef = doc(db, 'users', currentUser.uid);
            const userDoc = await getDoc(userRef);
            
            if (userDoc.exists()) {
              const userData = userDoc.data();
              console.log('Dashboard: User data:', userData);
              
              if (userData.manifest) {
                console.log('Dashboard: Found manifest in users collection');
                setPlayerManifest(userData.manifest);
              } else {
                console.log('Dashboard: No manifest found in either collection, showing selection');
                setShowManifestSelection(true);
              }
            } else {
              console.log('Dashboard: No user document found, showing manifest selection');
              setShowManifestSelection(true);
            }
          }
        } else {
          console.log('Dashboard: No student document found, checking users collection');
          // Try users collection as fallback
          const userRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            console.log('Dashboard: User data:', userData);
            
            if (userData.manifest) {
              console.log('Dashboard: Found manifest in users collection');
              setPlayerManifest(userData.manifest);
            } else {
              console.log('Dashboard: No manifest found in users collection, showing selection');
              setShowManifestSelection(true);
            }
          } else {
            console.log('Dashboard: No documents found, showing manifest selection');
            setShowManifestSelection(true);
          }
        }
      } catch (error) {
        console.error('Dashboard: Error fetching manifest:', error);
        // Even if there's an error, don't leave the user in loading state
        setShowManifestSelection(true);
      } finally {
        console.log('Dashboard: Setting loading to false');
        clearTimeout(timeoutId);
        setLoading(false);
      }
    };

    fetchManifest();
  }, [currentUser]);

  const handleManifestSelect = async (manifestId: string) => {
    if (!currentUser) return;

    const manifest = MANIFESTS.find(m => m.id === manifestId);
    if (!manifest) return;

    const newPlayerManifest: PlayerManifest = {
      manifestId,
      currentLevel: 1,
      xp: 0,
      catalyst: manifest.catalyst,
      veil: 'Fear of inadequacy',
      signatureMove: manifest.signatureMove,
      unlockedLevels: [1],
      lastAscension: serverTimestamp()
    };

    try {
      // Save to students collection (primary)
      const studentRef = doc(db, 'students', currentUser.uid);
      await updateDoc(studentRef, { manifest: newPlayerManifest });
      
      // Also save to users collection for consistency with challenge system
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, { manifest: newPlayerManifest });
      
      setPlayerManifest(newPlayerManifest);
      setShowManifestSelection(false);
    } catch (error) {
      console.error('Error setting manifest:', error);
      alert('Failed to set manifest. Please try again.');
    }
  };

  if (loading) {
    console.log('Dashboard: Rendering loading screen');
    return (
      <div style={{ 
        padding: isMobile ? '1rem' : '1.5rem', 
        textAlign: 'center',
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚡</div>
          <p style={{ fontSize: isMobile ? '1rem' : '1.1rem' }}>Loading your manifestation journey...</p>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
            User: {currentUser ? currentUser.uid : 'Not authenticated'}
          </p>
          {currentUser && (
            <button 
              onClick={() => {
                console.log('Dashboard: Force loading completion');
                setLoading(false);
                setShowManifestSelection(true);
              }}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1rem',
                backgroundColor: '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Continue Anyway
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: isMobile ? '1rem' : '1.5rem', 
      maxWidth: '1200px', 
      margin: '0 auto' 
    }}>
      {/* Welcome Message */}
      <div style={{ 
        textAlign: 'center', 
        marginBottom: isMobile ? '1.5rem' : '2rem' 
      }}>
        <h1 style={{ 
          fontSize: isMobile ? '1.875rem' : '2.5rem', 
          fontWeight: 'bold', 
          marginBottom: isMobile ? '0.75rem' : '1rem',
          background: 'linear-gradient(135deg, #fbbf24 0%, #a78bfa 50%, #34d399 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          lineHeight: 1.2
        }}>
          Welcome to Xiotein School
        </h1>
        <p style={{ 
          fontSize: isMobile ? '1rem' : '1.1rem', 
          color: '#6b7280', 
          maxWidth: '600px', 
          margin: '0 auto',
          lineHeight: '1.6',
          padding: isMobile ? '0 0.5rem' : '0'
        }}>
          You have been chosen to manifest your truth. Complete challenges to unlock your potential and advance through the chapters of your story.
        </p>
      </div>
      
      {/* Manifest Selection Prompt */}
      {!playerManifest && (
        <div className="manifest-selection" style={{ 
          backgroundColor: 'white', 
          borderRadius: '0.75rem', 
          padding: isMobile ? '1.5rem' : '2rem', 
          marginBottom: isMobile ? '1.5rem' : '2rem', 
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', 
          border: '1px solid #e5e7eb',
          textAlign: 'center'
        }}>
          <h2 style={{ 
            fontSize: isMobile ? '1.25rem' : '1.5rem', 
            fontWeight: 'bold', 
            marginBottom: isMobile ? '0.75rem' : '1rem', 
            color: '#4f46e5' 
          }}>
            Choose Your Manifest
          </h2>
          <p style={{ 
            color: '#6b7280', 
            marginBottom: isMobile ? '1rem' : '1.5rem', 
            fontSize: isMobile ? '1rem' : '1.1rem',
            lineHeight: '1.5'
          }}>
            In the Nine Knowings Universe, ordinary skills become extraordinary through mastery, intent, and will.
          </p>
          <button
            className="manifest-confirm"
            onClick={() => setShowManifestSelection(true)}
            style={{
              backgroundColor: '#4f46e5',
              color: 'white',
              padding: isMobile ? '0.75rem 1.5rem' : '1rem 2rem',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
              fontSize: isMobile ? '1rem' : '1.1rem',
              fontWeight: 'bold',
              minWidth: isMobile ? '200px' : 'auto',
              minHeight: isMobile ? '44px' : 'auto'
            }}
          >
            Begin Your Manifestation Journey
          </button>
        </div>
      )}

      {/* Responsive Grid Layout: Story Challenges and Manifest Challenges */}
      <div style={{ 
        display: 'grid', 
        gap: isMobile ? '1.5rem' : '2rem', 
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr' 
      }}>
        {/* Story Challenges */}
        <div>
          <StoryChallenges />
        </div>
        
        {/* Manifest Challenges */}
        <div>
          <ManifestChallenges playerManifest={playerManifest} />
        </div>
      </div>

      {/* Recent Completions Section */}
      <div style={{ marginTop: isMobile ? '1.5rem' : '2rem' }}>
        <RecentCompletions />
      </div>

      {/* Manifest Selection Modal */}
      {showManifestSelection && (
        <ManifestSelection
          onManifestSelect={handleManifestSelect}
          onClose={() => setShowManifestSelection(false)}
        />
      )}
    </div>
  );
};

export default Dashboard; 