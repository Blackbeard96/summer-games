/**
 * useJourneyStatus Hook
 *
 * Single source of truth for Player Journey status across the app.
 * Core logic lives in ../utils/journeyProgress.ts (aligned with ChapterDetail).
 */

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { CHAPTERS, Chapter } from '../types/chapters';
import {
  findNextChallenge,
  getCurrentChapter,
  calculateChapterProgress,
  isCaughtUp,
  type NextChallenge
} from '../utils/journeyProgress';

export type { NextChallenge };

export interface JourneyStatus {
  currentChapterNumber: number | null;
  currentChapterId: string | null;
  currentChapter: Chapter | null;
  chapterProgressPercent: number;
  nextChallenge: NextChallenge | null;
  isCaughtUp: boolean;
}

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
    const unsubscribe = onSnapshot(userRef, docSnapshot => {
      if (!docSnapshot.exists()) {
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
    }, error => {
      console.error('Error in useJourneyStatus:', error);
    });

    return () => unsubscribe();
  }, [userId]);

  return journeyStatus;
}
