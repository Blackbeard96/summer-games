import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { doc, onSnapshot, getDoc, updateDoc, runTransaction, getDocs, collection } from 'firebase/firestore';
import { getTodayDateStringEastern } from '../utils/dailyChallengeDateUtils';

interface PlayerChallengeProgress {
  challengeId: string;
  progress: number;
  completed: boolean;
  claimed: boolean;
  assignedDate: string;
  type?: string;
  target?: number;
}

interface DailyChallenge {
  id: string;
  title: string;
  description: string;
  type: string;
  target: number;
  rewardPP: number;
  rewardXP: number;
  rewardTruthMetal?: number;
}

/**
 * Global hook to detect daily challenge completions and show toast notifications
 * This hook subscribes to daily challenge progress and detects when challenges transition from incomplete to complete
 */
export const useDailyChallengeToasts = () => {
  const { currentUser } = useAuth();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const isInitialLoadRef = useRef(true);
  const previousProgressRef = useRef<{ [challengeId: string]: PlayerChallengeProgress }>({});
  const challengeDefinitionsRef = useRef<{ [challengeId: string]: DailyChallenge }>({});

  useEffect(() => {
    if (!currentUser) {
      isInitialLoadRef.current = true;
      previousProgressRef.current = {};
      return;
    }

    // Load challenge definitions once
    const loadChallengeDefinitions = async () => {
      try {
        const challengesRef = collection(db, 'adminSettings', 'dailyChallenges', 'challenges');
        const snapshot = await getDocs(challengesRef);
        const definitions: { [challengeId: string]: DailyChallenge } = {};
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          if (data.isActive) {
            definitions[doc.id] = {
              id: doc.id,
              title: data.title,
              description: data.description,
              type: data.type,
              target: data.target,
              rewardPP: data.rewardPP,
              rewardXP: data.rewardXP,
              rewardTruthMetal: data.rewardTruthMetal,
            };
          }
        });
        
        challengeDefinitionsRef.current = definitions;
      } catch (error) {
        console.error('[DailyChallengeToasts] Error loading challenge definitions:', error);
      }
    };

    loadChallengeDefinitions();

    // Subscribe to daily challenge progress
    const playerChallengesRef = doc(db, 'students', currentUser.uid, 'dailyChallenges', 'current');
    
    const unsubscribe = onSnapshot(
      playerChallengesRef,
      async (docSnapshot) => {
        if (!docSnapshot.exists()) {
          isInitialLoadRef.current = false;
          return;
        }

        const data = docSnapshot.data();
        const today = getTodayDateStringEastern();

        // Only process if challenges are for today
        if (data.assignedDate !== today || !data.challenges) {
          isInitialLoadRef.current = false;
          previousProgressRef.current = {};
          return;
        }

        const challenges: PlayerChallengeProgress[] = data.challenges || [];
        const currentProgress: { [challengeId: string]: PlayerChallengeProgress } = {};

        challenges.forEach((c) => {
          currentProgress[c.challengeId] = c;
        });

        // On initial load, just store the current state and skip toast notifications
        if (isInitialLoadRef.current) {
          previousProgressRef.current = currentProgress;
          isInitialLoadRef.current = false;
          return;
        }

        // Detect newly completed challenges
        const newlyCompleted: PlayerChallengeProgress[] = [];

        challenges.forEach((currentChallenge) => {
          const previousChallenge = previousProgressRef.current[currentChallenge.challengeId];
          
          // Detect transition: was not completed before, but is completed now
          const wasCompleted = previousChallenge?.completed === true;
          const isCompleted = currentChallenge.completed === true;
          
          if (!wasCompleted && isCompleted) {
            newlyCompleted.push(currentChallenge);
          }
        });

        // Check toastShown status and show toasts for newly completed challenges
        const toastShown = data.toastShown || {};
        
        for (const completedChallenge of newlyCompleted) {
          const challengeId = completedChallenge.challengeId;
          
          // Skip if toast was already shown (persisted dedupe)
          if (toastShown[challengeId]) {
            continue;
          }

          // Get challenge definition for title
          const challengeDef = challengeDefinitionsRef.current[challengeId];
          if (!challengeDef) {
            console.warn(`[DailyChallengeToasts] Challenge definition not found for ${challengeId}`);
            continue;
          }

          // Mark toast as shown in Firestore (persisted dedupe - Option B)
          try {
            await runTransaction(db, async (transaction) => {
              const currentDoc = await transaction.get(playerChallengesRef);
              if (!currentDoc.exists()) return;

              const currentData = currentDoc.data();
              const currentToastShown = currentData.toastShown || {};
              
              // Double-check within transaction (race condition protection)
              if (currentToastShown[challengeId]) {
                return; // Already shown
              }

              // Mark as shown
              transaction.update(playerChallengesRef, {
                toastShown: {
                  ...currentToastShown,
                  [challengeId]: true,
                },
              });
            });
          } catch (error) {
            console.error('[DailyChallengeToasts] Error marking toast as shown:', error);
            // Continue anyway - show toast even if marking fails
          }

          // Show toast notification
          pushToast({
            title: 'Daily Challenge Complete!',
            message: challengeDef.title,
            actionLabel: 'View',
            onAction: () => {
              navigate('/home#daily-challenges');
              // Scroll to daily challenges section after navigation
              setTimeout(() => {
                const element = document.getElementById('daily-challenges');
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }, 100);
            },
            duration: 5000,
          });
        }

        // Update previous progress for next comparison
        previousProgressRef.current = currentProgress;
      },
      (error) => {
        console.error('[DailyChallengeToasts] Error listening to daily challenges:', error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [currentUser, pushToast, navigate]);
};

