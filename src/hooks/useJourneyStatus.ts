/**
 * useJourneyStatus Hook
 * 
 * Single source of truth for Player Journey status across the app.
 * Used by Home page, Player Journey page, and any other components
 * that need to display journey progress.
 */

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { CHAPTERS, Chapter, ChapterChallenge } from '../types/chapters';

export interface NextChallenge {
  chapterId: number;
  challengeId: string;
  title: string;
  status: 'unlocked' | 'active';
}

export interface JourneyStatus {
  currentChapterNumber: number | null;
  currentChapterId: string | null;
  currentChapter: Chapter | null;
  chapterProgressPercent: number;
  nextChallenge: NextChallenge | null;
  isCaughtUp: boolean;
}

/**
 * Check if a challenge's requirements are met
 */
function isChallengeUnlocked(challenge: ChapterChallenge, userProgress: any): boolean {
  // Always unlock challenges with no requirements
  if (!challenge.requirements || challenge.requirements.length === 0) {
    return true;
  }

  // Special case: Chapter 1 Challenge 1 should ALWAYS be unlocked for new players
  if (challenge.id === 'ep1-get-letter') {
    return true;
  }

  // Check each requirement
  for (const requirement of challenge.requirements) {
    let requirementMet = false;

    // Type assertion to handle requirement types that may not be in the strict type
    const reqType = requirement.type as string;
    
    switch (reqType) {
      case 'artifact':
        // Check if artifact exists in user progress
        const artifactValue = requirement.value;
        if (typeof artifactValue === 'string') {
          requirementMet = userProgress?.artifacts?.[artifactValue] === true ||
                           userProgress?.artifacts?.includes?.(artifactValue) ||
                           false;
        }
        break;

      case 'team':
        // Check if team requirement is met
        const teamValue = requirement.value;
        if (teamValue === 'formed') {
          requirementMet = !!userProgress?.team?.id || !!userProgress?.squad?.id;
        }
        break;

      case 'rival':
        // Check if rival requirement is met
        const rivalValue = requirement.value;
        if (rivalValue === 'chosen') {
          requirementMet = !!userProgress?.rivals?.chosen || !!userProgress?.rival;
        }
        break;

      case 'challenge':
        // Check if a specific challenge is completed
        const requiredChallengeId = requirement.value;
        // Find which chapter contains this challenge
        let challengeFound = false;
        for (const chapterId in userProgress?.chapters || {}) {
          const chapterChallenges = userProgress?.chapters?.[chapterId]?.challenges || {};
          if (chapterChallenges[requiredChallengeId]) {
            const requiredChallenge = chapterChallenges[requiredChallengeId];
            requirementMet = requiredChallenge?.isCompleted || requiredChallenge?.status === 'approved';
            challengeFound = true;
            break;
          }
        }
        if (!challengeFound) {
          requirementMet = false;
        }
        break;

      case 'previousChapter':
        // Check if previous chapter is completed
        const prevChapterId = requirement.value;
        const prevChapterProgress = userProgress?.chapters?.[prevChapterId];
        requirementMet = prevChapterProgress?.isCompleted === true;
        break;

      case 'level':
        // Check if user has reached required level
        const requiredLevel = requirement.value;
        const userLevel = userProgress?.level || 1;
        requirementMet = userLevel >= requiredLevel;
        break;

      case 'manifest':
        // Check if manifest is chosen
        if (requirement.value === 'chosen') {
          requirementMet = !!userProgress?.manifest || !!userProgress?.manifestId;
        }
        break;

      default:
        requirementMet = false;
    }

    if (!requirementMet) {
      return false;
    }
  }

  return true;
}

/**
 * Get the current chapter based on user progress
 */
function getCurrentChapter(userProgress: any): Chapter | null {
  // Chapter 1 is always available to all players - no requirements
  // If no chapters exist or no chapter is active, default to Chapter 1
  if (!userProgress?.chapters) {
    return CHAPTERS.find(chapter => chapter.id === 1) || null;
  }

  // Find active chapter
  const activeChapter = CHAPTERS.find(chapter => 
    userProgress.chapters[chapter.id]?.isActive
  );

  // If no active chapter, find the first incomplete chapter
  if (!activeChapter) {
    // Find the first chapter that is not fully completed
    const firstIncompleteChapter = CHAPTERS.find(chapter => {
      const chapterProgress = userProgress.chapters[chapter.id];
      if (!chapterProgress) {
        // Chapter hasn't been started - Chapter 1 and 2 are always available
        return chapter.id === 1 || chapter.id === 2;
      }
      return !chapterProgress.isCompleted;
    });

    if (firstIncompleteChapter) {
      return firstIncompleteChapter;
    }

    // All chapters completed - return the last chapter
    return CHAPTERS[CHAPTERS.length - 1] || null;
  }

  return activeChapter;
}

/**
 * Calculate chapter progress percentage
 */
function calculateChapterProgress(chapter: Chapter, userProgress: any): number {
  if (!userProgress?.chapters?.[chapter.id]) {
    return 0;
  }

  const chapterProgress = userProgress.chapters[chapter.id];
  const completedChallenges = chapter.challenges.filter(challenge => 
    chapterProgress?.challenges?.[challenge.id]?.isCompleted
  ).length;
  const totalChallenges = chapter.challenges.length;

  return totalChallenges > 0 ? (completedChallenges / totalChallenges) * 100 : 0;
}

/**
 * Find the next challenge that should be worked on
 */
function findNextChallenge(userProgress: any): NextChallenge | null {
  if (!userProgress?.chapters) {
    // No progress - return first challenge of Chapter 1
    const chapter1 = CHAPTERS.find(c => c.id === 1);
    if (chapter1 && chapter1.challenges.length > 0) {
      return {
        chapterId: 1,
        challengeId: chapter1.challenges[0].id,
        title: chapter1.challenges[0].title,
        status: 'unlocked'
      };
    }
    return null;
  }

  // Find current chapter
  const currentChapter = getCurrentChapter(userProgress);
  if (!currentChapter) {
    return null;
  }

  // First, check current chapter for next challenge
  for (const challenge of currentChapter.challenges) {
    const challengeProgress = userProgress.chapters[currentChapter.id]?.challenges?.[challenge.id];
    
    // Skip if already completed
    if (challengeProgress?.isCompleted) {
      continue;
    }

    // Check if challenge is unlocked
    if (isChallengeUnlocked(challenge, userProgress)) {
      return {
        chapterId: currentChapter.id,
        challengeId: challenge.id,
        title: challenge.title,
        status: challengeProgress?.isActive ? 'active' : 'unlocked'
      };
    }
  }

  // If current chapter is complete, check next chapter
  const currentChapterIndex = CHAPTERS.findIndex(c => c.id === currentChapter.id);
  if (currentChapterIndex >= 0 && currentChapterIndex < CHAPTERS.length - 1) {
    const nextChapter = CHAPTERS[currentChapterIndex + 1];
    const nextChapterProgress = userProgress.chapters[nextChapter.id];

    // Check if next chapter is unlocked (requirements met)
    const chapterUnlocked = nextChapter.requirements.every(req => {
      if (req.type === 'previousChapter') {
        return userProgress.chapters[req.value]?.isCompleted === true;
      }
      // Add other requirement checks as needed
      return true;
    });

    if (chapterUnlocked && nextChapter.challenges.length > 0) {
      // Return first challenge of next chapter
      return {
        chapterId: nextChapter.id,
        challengeId: nextChapter.challenges[0].id,
        title: nextChapter.challenges[0].title,
        status: 'unlocked'
      };
    }
  }

  return null;
}

/**
 * Check if player is caught up (all available content completed)
 */
function isCaughtUp(userProgress: any): boolean {
  if (!userProgress?.chapters) {
    return false;
  }

  // Check if all available chapters are completed
  for (const chapter of CHAPTERS) {
    const chapterProgress = userProgress.chapters[chapter.id];
    if (!chapterProgress?.isCompleted) {
      return false;
    }
  }

  return true;
}

/**
 * useJourneyStatus Hook
 * 
 * Returns the current journey status including:
 * - Current chapter number and ID
 * - Chapter progress percentage
 * - Next challenge to work on
 * - Whether player is caught up
 */
export function useJourneyStatus(userId: string | null): JourneyStatus {
  const [journeyStatus, setJourneyStatus] = useState<JourneyStatus>({
    currentChapterNumber: null,
    currentChapterId: null,
    currentChapter: null,
    chapterProgressPercent: 0,
    nextChallenge: null,
    isCaughtUp: false
  });

  useEffect(() => {
    if (!userId) {
      setJourneyStatus({
        currentChapterNumber: null,
        currentChapterId: null,
        currentChapter: null,
        chapterProgressPercent: 0,
        nextChallenge: null,
        isCaughtUp: false
      });
      return;
    }

    const userRef = doc(db, 'users', userId);
    const unsubscribe = onSnapshot(userRef, (docSnapshot) => {
      if (!docSnapshot.exists()) {
        // New user - default to Chapter 1
        const chapter1 = CHAPTERS.find(c => c.id === 1);
        if (chapter1 && chapter1.challenges.length > 0) {
          setJourneyStatus({
            currentChapterNumber: 1,
            currentChapterId: '1',
            currentChapter: chapter1,
            chapterProgressPercent: 0,
            nextChallenge: {
              chapterId: 1,
              challengeId: chapter1.challenges[0].id,
              title: chapter1.challenges[0].title,
              status: 'unlocked'
            },
            isCaughtUp: false
          });
        }
        return;
      }

      const userProgress = docSnapshot.data();
      const currentChapter = getCurrentChapter(userProgress);
      
      if (!currentChapter) {
        setJourneyStatus({
          currentChapterNumber: null,
          currentChapterId: null,
          currentChapter: null,
          chapterProgressPercent: 0,
          nextChallenge: null,
          isCaughtUp: false
        });
        return;
      }

      const progressPercent = calculateChapterProgress(currentChapter, userProgress);
      const nextChallenge = findNextChallenge(userProgress);
      const caughtUp = isCaughtUp(userProgress);

      setJourneyStatus({
        currentChapterNumber: currentChapter.id,
        currentChapterId: String(currentChapter.id),
        currentChapter: currentChapter,
        chapterProgressPercent: progressPercent,
        nextChallenge: nextChallenge,
        isCaughtUp: caughtUp
      });
    }, (error) => {
      console.error('Error in useJourneyStatus:', error);
    });

    return () => unsubscribe();
  }, [userId]);

  return journeyStatus;
}

