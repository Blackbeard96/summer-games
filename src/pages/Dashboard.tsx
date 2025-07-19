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

  useEffect(() => {
    const fetchManifest = async () => {
      if (!currentUser) return;

      try {
        const userRef = doc(db, 'students', currentUser.uid);
        const docSnap = await getDoc(userRef);
        
        if (docSnap.exists()) {
          const manifestData = docSnap.data().manifest;
          if (manifestData) {
            // Convert Firestore timestamp to Date if needed
            const processedManifest = {
              ...manifestData,
              lastAscension: manifestData.lastAscension?.toDate ? 
                manifestData.lastAscension.toDate() : 
                new Date(manifestData.lastAscension)
            };
            setPlayerManifest(processedManifest);
          } else {
            // No manifest found - automatically show selection
            setShowManifestSelection(true);
          }
        } else {
          // User document doesn't exist - show manifest selection
          setShowManifestSelection(true);
        }
      } catch (error) {
        console.error('Error fetching manifest:', error);
      } finally {
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
      const userRef = doc(db, 'students', currentUser.uid);
      await updateDoc(userRef, { manifest: newPlayerManifest });
      setPlayerManifest(newPlayerManifest);
      setShowManifestSelection(false);
    } catch (error) {
      console.error('Error setting manifest:', error);
      alert('Failed to set manifest. Please try again.');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '1.5rem', textAlign: 'center' }}>
        <p>Loading your manifestation journey...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ 
          fontSize: '2.5rem', 
          fontWeight: 'bold', 
          marginBottom: '1rem',
          background: 'linear-gradient(135deg, #fbbf24 0%, #a78bfa 50%, #34d399 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          Welcome to Xiotein School
        </h1>
        <p style={{ 
          fontSize: '1.1rem', 
          color: '#6b7280', 
          maxWidth: '600px', 
          margin: '0 auto',
          lineHeight: '1.6'
        }}>
          You have been chosen to manifest your truth. Complete challenges to unlock your potential and advance through the chapters of your story.
        </p>
      </div>
      
      {/* Manifest Selection Prompt */}
      {!playerManifest && (
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '0.75rem', 
          padding: '2rem', 
          marginBottom: '2rem', 
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', 
          border: '1px solid #e5e7eb',
          textAlign: 'center'
        }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1rem', color: '#4f46e5' }}>
            Choose Your Manifest
          </h2>
          <p style={{ color: '#6b7280', marginBottom: '1.5rem', fontSize: '1.1rem' }}>
            In the Nine Knowings Universe, ordinary skills become extraordinary through mastery, intent, and will.
          </p>
          <button
            onClick={() => setShowManifestSelection(true)}
            style={{
              backgroundColor: '#4f46e5',
              color: 'white',
              padding: '1rem 2rem',
              borderRadius: '0.5rem',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.1rem',
              fontWeight: 'bold'
            }}
          >
            Begin Your Manifestation Journey
          </button>
        </div>
      )}

      {/* 2-Column Layout: Story Challenges (Left) and Manifest Challenges (Right) */}
      <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr 1fr' }}>
        {/* Left Column - Story Challenges */}
        <div>
          <StoryChallenges />
        </div>
        
        {/* Right Column - Manifest Challenges */}
        <div>
          <ManifestChallenges playerManifest={playerManifest} />
        </div>
      </div>

      {/* Recent Completions Section */}
      <div style={{ marginTop: '2rem' }}>
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