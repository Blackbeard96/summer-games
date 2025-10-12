import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import StoryChallenges from '../components/StoryChallenges';
import ManifestChallenges from '../components/ManifestChallenges';
import RecentCompletions from '../components/RecentCompletions';
import ManifestSelection from '../components/ManifestSelection';
import ManifestDiagnostic from '../components/ManifestDiagnostic';

import { PlayerManifest, MANIFESTS } from '../types/manifest';
import { logger } from '../utils/debugLogger';
import { collection, addDoc } from 'firebase/firestore';

const Dashboard = () => {
  const { currentUser } = useAuth();
  const [playerManifest, setPlayerManifest] = useState<PlayerManifest | null>(null);
  const [showManifestSelection, setShowManifestSelection] = useState(false);
  const [showManifestDiagnostic, setShowManifestDiagnostic] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [showChapterFix, setShowChapterFix] = useState(false);

  // Firefox detection for compatibility measures
  const isFirefox = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('firefox');

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
        logger.debug('No current user, setting loading to false');
        setLoading(false);
        return;
      }

      logger.info('Fetching manifest for user:', currentUser.uid);
      if (isFirefox) {
        logger.debug('🦊 Firefox detected - applying compatibility measures for Dashboard');
      }
      
      // Add a timeout to prevent infinite loading (longer for Firefox)
      const timeoutMs = isFirefox ? 15000 : 10000;
      const timeoutId = setTimeout(() => {
        logger.warn('Loading timeout reached, forcing completion', { 
          timeoutMs, 
          isFirefox, 
          currentUser: currentUser?.uid 
        });
        setLoading(false);
        setShowManifestSelection(true);
      }, timeoutMs);
      
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
        // Check if it's a permission error
        if (error instanceof Error && error.message.includes('permission')) {
          console.log('Dashboard: Permission error detected, showing manifest selection');
          // For permission errors, show manifest selection to allow user to proceed
          setShowManifestSelection(true);
        } else {
          // For other errors, still show manifest selection as fallback
          setShowManifestSelection(true);
        }
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
      // Save to students collection (primary) using setDoc with merge to handle missing documents
      const studentRef = doc(db, 'students', currentUser.uid);
      await setDoc(studentRef, { manifest: newPlayerManifest }, { merge: true });
      
      // Also save to users collection for consistency with challenge system
      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, { manifest: newPlayerManifest }, { merge: true });
      
      setPlayerManifest(newPlayerManifest);
      setShowManifestSelection(false);
    } catch (error) {
      console.error('Error setting manifest:', error);
      if (error instanceof Error && error.message.includes('permission')) {
        alert('Permission error: Please check your Firebase security rules. Contact admin if this persists.');
      } else {
        alert('Failed to set manifest. Please try again.');
      }
    }
  };

  // Function to fix locked challenges by activating the next chapter
  const fixLockedChallenges = async () => {
    if (!currentUser) return;
    
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const studentRef = doc(db, 'students', currentUser.uid);
      
      // Get current user data to check chapter status
      const userDoc = await getDoc(userRef);
      const studentDoc = await getDoc(studentRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const chapters = userData.chapters || {};
        
        // Find completed chapters
        const completedChapters = Object.keys(chapters).filter(chapterId => 
          chapters[chapterId]?.isCompleted
        ).map(Number);
        
        // Find active chapter
        const activeChapter = Object.keys(chapters).find(chapterId => 
          chapters[chapterId]?.isActive
        );
        
        console.log('Chapter status:', { completedChapters, activeChapter, chapters });
        
        if (completedChapters.length > 0 && !activeChapter) {
          // Activate the next chapter after the highest completed chapter
          const nextChapterId = Math.max(...completedChapters) + 1;
          
          await updateDoc(userRef, {
            [`chapters.${nextChapterId}.isActive`]: true,
            [`chapters.${nextChapterId}.unlockDate`]: new Date()
          });
          
          if (studentDoc.exists()) {
            await updateDoc(studentRef, {
              [`chapters.${nextChapterId}.isActive`]: true,
              [`chapters.${nextChapterId}.unlockDate`]: new Date()
            });
          }
          
          console.log(`Chapter ${nextChapterId} activated!`);
          alert(`✅ Chapter ${nextChapterId} has been activated! Your challenges should now be unlocked. Please refresh the page.`);
          
          // Add notification
          await addDoc(collection(db, 'students', currentUser.uid, 'notifications'), {
            type: 'chapter_unlocked',
            message: `🎉 Chapter ${nextChapterId} is now unlocked!`,
            chapterId: nextChapterId,
            timestamp: serverTimestamp(),
            read: false
          });
          
        } else if (!activeChapter && completedChapters.length === 0) {
          // No chapters completed, activate Chapter 1
          await updateDoc(userRef, {
            'chapters.1.isActive': true,
            'chapters.1.unlockDate': new Date()
          });
          
          if (studentDoc.exists()) {
            await updateDoc(studentRef, {
              'chapters.1.isActive': true,
              'chapters.1.unlockDate': new Date()
            });
          }
          
          console.log('Chapter 1 activated!');
          alert('✅ Chapter 1 has been activated! Your challenges should now be unlocked. Please refresh the page.');
          
        } else {
          alert('✅ Chapter progression looks correct. If challenges are still locked, please refresh the page.');
        }
      }
    } catch (error) {
      console.error('Error fixing locked challenges:', error);
      alert('❌ Error fixing challenges. Check console for details.');
    }
  };

  if (loading) {
    return (
      <div style={{ 
        padding: isMobile ? '1rem' : '1.5rem', 
        textAlign: 'center',
        minHeight: '50vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ maxWidth: '400px' }}>
          <div style={{ 
            fontSize: '3rem', 
            marginBottom: '1.5rem',
            animation: 'pulse 2s infinite'
          }}>
            ⚡
          </div>
          <h2 style={{ 
            fontSize: isMobile ? '1.25rem' : '1.5rem',
            fontWeight: 'bold',
            marginBottom: '1rem',
            color: '#1f2937'
          }}>
            Loading Your Manifestation Journey
          </h2>
          <p style={{ 
            fontSize: isMobile ? '1rem' : '1.1rem',
            color: '#6b7280',
            marginBottom: '1.5rem',
            lineHeight: '1.6'
          }}>
            Connecting to Xiotein School and preparing your training grounds...
          </p>
          
          {/* Loading animation */}
          <div style={{
            width: '100%',
            height: '4px',
            backgroundColor: '#e5e7eb',
            borderRadius: '2px',
            marginBottom: '1.5rem',
            overflow: 'hidden'
          }}>
            <div style={{
              width: '100%',
              height: '100%',
              backgroundColor: '#4f46e5',
              borderRadius: '2px',
              animation: 'loading 2s ease-in-out infinite'
            }}></div>
          </div>
          
          {currentUser && (
            <div style={{ marginTop: '1.5rem' }}>
              <p style={{ 
                fontSize: '0.875rem', 
                color: '#9ca3af', 
                marginBottom: '1rem' 
              }}>
                Taking longer than expected?
              </p>
              <button 
                onClick={() => {
                  setLoading(false);
                  setShowManifestSelection(true);
                }}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#4338ca';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#4f46e5';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                Continue to Manifest Selection
              </button>
            </div>
          )}
        </div>
        
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          @keyframes loading {
            0% { transform: translateX(-100%); }
            50% { transform: translateX(0%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '0.75rem' : '1rem' }}>
          <h1 style={{ 
            fontSize: isMobile ? '1.875rem' : '2.5rem', 
            fontWeight: 'bold', 
            margin: 0,
            background: 'linear-gradient(135deg, #fbbf24 0%, #a78bfa 50%, #34d399 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            lineHeight: 1.2
          }}>
            Welcome to Xiotein School
          </h1>
          <button
            onClick={() => setShowManifestDiagnostic(true)}
            style={{
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              padding: isMobile ? '0.5rem 1rem' : '0.75rem 1.5rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              fontSize: isMobile ? '0.75rem' : '0.875rem'
            }}
          >
            🔍 Diagnostic
          </button>
        </div>
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
      
      {/* Current Manifest Info */}
      {playerManifest && (
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '0.75rem', 
          padding: isMobile ? '1rem' : '1.5rem', 
          marginBottom: isMobile ? '1.5rem' : '2rem', 
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)', 
          border: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ 
              fontSize: isMobile ? '1.125rem' : '1.25rem', 
              fontWeight: 'bold', 
              marginBottom: '0.5rem', 
              color: '#4f46e5' 
            }}>
              Current Manifest: {MANIFESTS.find(m => m.id === playerManifest.manifestId)?.name || 'Unknown'}
            </h3>
            <p style={{ 
              color: '#6b7280', 
              fontSize: isMobile ? '0.875rem' : '1rem',
              margin: 0
            }}>
              Level {playerManifest.currentLevel} • {playerManifest.xp} XP
            </p>
          </div>
          <button
            onClick={() => setShowManifestSelection(true)}
            style={{
              backgroundColor: '#8b5cf6',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            🔄 Re-select
          </button>
        </div>
      )}
      
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

      {/* Chapter Fix Button - Show when challenges might be locked */}
      <div style={{ 
        backgroundColor: '#fef3c7', 
        border: '1px solid #f59e0b',
        borderRadius: '0.5rem',
        padding: '1rem',
        marginBottom: '1.5rem',
        textAlign: 'center'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          marginBottom: '0.5rem'
        }}>
          <span style={{ marginRight: '0.5rem', fontSize: '1.25rem' }}>🔧</span>
          <h3 style={{ 
            fontSize: '1rem', 
            fontWeight: 'bold', 
            color: '#92400e',
            margin: 0
          }}>
            Challenges Locked?
          </h3>
        </div>
        <p style={{ 
          fontSize: '0.875rem', 
          color: '#a16207',
          marginBottom: '1rem',
          margin: '0 0 1rem 0'
        }}>
          If your challenges are showing as locked, click the button below to fix chapter progression.
        </p>
        <button
          onClick={fixLockedChallenges}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#059669',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 'bold'
          }}
        >
          🔧 Fix Locked Challenges
        </button>
        <button
          onClick={async () => {
            if (currentUser) {
              console.log('🧪 Testing auto-completion manually...');
              try {
                const userRef = doc(db, 'users', currentUser.uid);
                const userDoc = await getDoc(userRef);
                if (userDoc.exists()) {
                  const userData = userDoc.data();
                  console.log('User data:', userData);
                  
                  // Force auto-complete profile challenge
                  if (userData.displayName && userData.photoURL) {
                    await updateDoc(userRef, {
                      [`chapters.1.challenges.ep1-update-profile.isCompleted`]: true,
                      [`chapters.1.challenges.ep1-update-profile.completedAt`]: serverTimestamp()
                    });
                    console.log('✅ Profile challenge auto-completed');
                  }
                  
                  // Force auto-complete manifest challenge
                  if (userData.playerManifest || userData.manifest) {
                    await updateDoc(userRef, {
                      [`chapters.1.challenges.ep1-choose-manifests.isCompleted`]: true,
                      [`chapters.1.challenges.ep1-choose-manifests.completedAt`]: serverTimestamp()
                    });
                    console.log('✅ Manifest challenge auto-completed');
                  }
                  
                  alert('Auto-completion test completed! Check console for details.');
                }
              } catch (error) {
                console.error('Auto-completion test failed:', error);
                alert('Auto-completion test failed. Check console for details.');
              }
            }
          }}
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: 'white',
            padding: '0.75rem 1.5rem',
            borderRadius: '0.5rem',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.875rem',
            fontWeight: 'bold',
            marginLeft: '1rem'
          }}
        >
          🧪 Test Auto-Complete
        </button>
      </div>

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
          <ManifestChallenges 
            playerManifest={playerManifest} 
          />
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

      {/* Manifest Diagnostic Modal */}
      <ManifestDiagnostic
        isOpen={showManifestDiagnostic}
        onClose={() => setShowManifestDiagnostic(false)}
      />
    </div>
  );
};

export default Dashboard; 