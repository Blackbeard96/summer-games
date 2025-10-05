import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import Tutorial from './Tutorial';
import TutorialReviewModal from './TutorialReviewModal';

interface TutorialState {
  [key: string]: {
    completed: boolean;
    skipped?: boolean;
    completedAt?: Date;
  };
}

const TutorialManager: React.FC = () => {
  const { currentUser } = useAuth();
  const location = useLocation();
  const [tutorialState, setTutorialState] = useState<TutorialState>({});
  const [currentTutorial, setCurrentTutorial] = useState<string | null>(null);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isTutorialStateLoaded, setIsTutorialStateLoaded] = useState(false);
  const [hasTriggeredTutorial, setHasTriggeredTutorial] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Listen to tutorial state changes
  useEffect(() => {
    if (!currentUser) return;

    const userRef = doc(db, 'users', currentUser.uid);
    const unsubscribe = onSnapshot(userRef, (doc) => {
      if (doc.exists()) {
        const userData = doc.data();
        const tutorials = userData.tutorials || {};
        console.log('Tutorial state loaded:', tutorials);
        
        // Check if this is the first load and if any tutorials are completed
        if (isInitialLoad) {
          const hasCompletedTutorials = Object.values(tutorials).some(
            (tutorial: any) => tutorial.completed || tutorial.skipped
          );
          
          if (hasCompletedTutorials) {
            // User has seen tutorials before, mark as triggered to prevent auto-showing
            setHasTriggeredTutorial(true);
            console.log('User has completed tutorials before, preventing auto-trigger');
          }
          setIsInitialLoad(false);
        }
        
        setTutorialState(tutorials);
        setIsTutorialStateLoaded(true);
      } else {
        // If user document doesn't exist, create it with empty tutorial state
        console.log('Creating new user document with empty tutorial state');
        setTutorialState({});
        setIsTutorialStateLoaded(true);
        setIsInitialLoad(false);
      }
    });

    return () => unsubscribe();
  }, [currentUser, isInitialLoad]);

    // Check if tutorial should be triggered based on current page and state
  useEffect(() => {
    if (!currentUser || !tutorialState || !isTutorialStateLoaded) {
      console.log('Tutorial trigger blocked:', { 
        hasUser: !!currentUser, 
        hasTutorialState: !!tutorialState, 
        isLoaded: isTutorialStateLoaded 
      });
      return;
    }

    // Prevent multiple tutorial triggers in the same session
    if (hasTriggeredTutorial) {
      console.log('Tutorial trigger blocked - already triggered in this session');
      return;
    }

    const path = location.pathname;
    console.log('Checking tutorial triggers for path:', path, 'tutorialState:', tutorialState);
    
    // Only trigger tutorials if no tutorial is currently open and no review modal is open
    if (currentTutorial || isReviewModalOpen) {
      console.log('Tutorial trigger blocked - tutorial or modal already open');
      return;
    }

    // Debug: Log the state of each tutorial
    Object.entries(tutorialState).forEach(([tutorialId, state]) => {
      console.log(`Tutorial ${tutorialId}:`, {
        completed: state.completed,
        skipped: state.skipped,
        completedAt: state.completedAt
      });
    });

    // Check if user has any completed tutorials - if so, don't auto-trigger any tutorials
    const hasAnyCompletedTutorials = Object.values(tutorialState).some(
      (tutorial: any) => tutorial.completed || tutorial.skipped
    );
    
    if (hasAnyCompletedTutorials) {
      console.log('Tutorial auto-trigger blocked - user has completed tutorials before');
      return;
    }

    // Welcome tutorial (first time users only)
    if (path === '/' && !tutorialState.welcome?.completed && !tutorialState.welcome?.skipped) {
      // Additional check: only trigger if user has no completed tutorials at all
      const hasAnyCompletedTutorials = Object.values(tutorialState).some(
        (tutorial: any) => tutorial.completed || tutorial.skipped
      );
      
      if (!hasAnyCompletedTutorials) {
        console.log('Triggering welcome tutorial - truly new user');
        setHasTriggeredTutorial(true);
        // Add a small delay to ensure the page is fully loaded
        setTimeout(() => triggerTutorial('welcome'), 1500);
        return;
      } else {
        console.log('Welcome tutorial blocked - user has completed other tutorials');
      }
    }

    // Navigation tutorial (after welcome, only if not completed)
    if (path === '/' && tutorialState.welcome?.completed && !tutorialState.navigation?.completed && !tutorialState.navigation?.skipped) {
      console.log('Triggering navigation tutorial');
      setHasTriggeredTutorial(true);
      setTimeout(() => triggerTutorial('navigation'), 1000);
      return;
    }

    // Profile tutorial (when on profile page and not completed)
    if (path === '/profile' && !tutorialState.profile?.completed && !tutorialState.profile?.skipped) {
      console.log('Triggering profile tutorial');
      setHasTriggeredTutorial(true);
      setTimeout(() => triggerTutorial('profile'), 500);
      return;
    }

    // Manifest tutorial (when manifest selection is available and not completed)
    if (path === '/' && !tutorialState.manifest?.completed && !tutorialState.manifest?.skipped) {
      // Check if user has a manifest - if not, trigger tutorial
      const hasManifest = (currentUser as any)?.manifest || tutorialState.manifest?.completed;
      if (!hasManifest) {
        console.log('Triggering manifest tutorial');
        setHasTriggeredTutorial(true);
        setTimeout(() => triggerTutorial('manifest'), 1000);
        return;
      }
    }

    // Chapter 1 tutorial (when in chapters and not completed)
    if (path === '/chapters' && !tutorialState.chapter1?.completed && !tutorialState.chapter1?.skipped) {
      console.log('Triggering chapter1 tutorial');
      setHasTriggeredTutorial(true);
      setTimeout(() => triggerTutorial('chapter1'), 500);
      return;
    }

    // Marketplace tutorial (first time visiting marketplace and not completed)
    if (path === '/marketplace' && !tutorialState.marketplace?.completed && !tutorialState.marketplace?.skipped) {
      console.log('Triggering marketplace tutorial');
      setHasTriggeredTutorial(true);
      setTimeout(() => triggerTutorial('marketplace'), 500);
      return;
    }

    console.log('No tutorial triggered for current path and state');
  }, [location.pathname, tutorialState, currentUser, currentTutorial, isReviewModalOpen, isTutorialStateLoaded]);

  const triggerTutorial = (tutorialId: string) => {
    setCurrentTutorial(tutorialId);
    setIsTutorialOpen(true);
    setHasTriggeredTutorial(true);
  };

  const manualTriggerTutorial = (tutorialId: string) => {
    // For manual triggers, reset the trigger state to allow showing
    setHasTriggeredTutorial(false);
    triggerTutorial(tutorialId);
  };

  const closeTutorial = () => {
    setIsTutorialOpen(false);
    setCurrentTutorial(null);
  };

  const resetTutorialTrigger = () => {
    setHasTriggeredTutorial(false);
  };

  const openReviewModal = () => {
    setIsReviewModalOpen(true);
  };

  const closeReviewModal = () => {
    setIsReviewModalOpen(false);
  };

  const handleTutorialSelect = (tutorialId: string) => {
    closeReviewModal();
    manualTriggerTutorial(tutorialId);
  };

  // Manual tutorial trigger functions (for testing)
  const triggerWelcomeTutorial = () => manualTriggerTutorial('welcome');
  const triggerNavigationTutorial = () => manualTriggerTutorial('navigation');
  const triggerProfileTutorial = () => manualTriggerTutorial('profile');
  const triggerManifestTutorial = () => manualTriggerTutorial('manifest');
  const triggerChapter1Tutorial = () => manualTriggerTutorial('chapter1');
  const triggerMarketplaceTutorial = () => manualTriggerTutorial('marketplace');

  // Function to reset all tutorials for testing
  const resetAllTutorials = async () => {
    if (!currentUser) return;
    
    try {
      console.log('Resetting all tutorials...');
      const userRef = doc(db, 'users', currentUser.uid);
      
      const resetData: any = {};
      ['welcome', 'navigation', 'profile', 'manifest', 'chapter1', 'marketplace'].forEach(tutorialId => {
        resetData[`tutorials.${tutorialId}.completed`] = false;
        resetData[`tutorials.${tutorialId}.skipped`] = false;
        resetData[`tutorials.${tutorialId}.completedAt`] = null;
      });
      
      await updateDoc(userRef, resetData);
      console.log('All tutorials reset successfully!');
      alert('✅ All tutorials have been reset! Refresh the page to see them again.');
    } catch (error) {
      console.error('Error resetting tutorials:', error);
      alert('❌ Error resetting tutorials. Check console for details.');
    }
  };

  // Add tutorial trigger functions to window for testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).tutorialTriggers = {
        welcome: triggerWelcomeTutorial,
        navigation: triggerNavigationTutorial,
        profile: triggerProfileTutorial,
        manifest: triggerManifestTutorial,
        chapter1: triggerChapter1Tutorial,
        marketplace: triggerMarketplaceTutorial,
        showReviewModal: openReviewModal,
        resetAllTutorials: resetAllTutorials, // Add the new function to the window object
        resetTutorialTrigger: resetTutorialTrigger // Add reset function for manual triggers
      };
    }
  }, []);

  return (
    <>
      {currentTutorial && (
        <Tutorial
          isOpen={isTutorialOpen}
          onClose={closeTutorial}
          tutorialId={currentTutorial}
        />
      )}

      <TutorialReviewModal
        isOpen={isReviewModalOpen}
        onClose={closeReviewModal}
        onTutorialSelect={handleTutorialSelect}
        tutorialState={tutorialState}
      />

      {/* Tutorial Progress Indicator (disabled to prevent interference with constellation tree) */}
      {false && process.env.NODE_ENV === 'development' && (
        <div style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '0.5rem',
          borderRadius: '0.25rem',
          fontSize: '0.75rem',
          zIndex: 1000,
          maxWidth: '200px'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
            Tutorial Status
          </div>
          {Object.entries(tutorialState).map(([key, value]) => (
            <div key={key} style={{ fontSize: '0.7rem' }}>
              {key}: {value.completed ? '✅' : '❌'}
            </div>
          ))}
          <div style={{ marginTop: '0.5rem', fontSize: '0.7rem' }}>
            Current: {currentTutorial || 'None'}
          </div>
        </div>
      )}
    </>
  );
};

export default TutorialManager; 