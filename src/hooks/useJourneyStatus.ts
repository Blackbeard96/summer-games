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
import { mergeChaptersProgressMaps, mergeUserAndStudentForJourney } from '../utils/mergeChapterProgress';

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
    const studentRef = doc(db, 'students', userId);
    let userData: any = null;
    let studentData: any = null;

    const applyMerged = () => {
      if (!userData && !studentData) return;

      if (!userData) {
        const chaptersOnly = mergeChaptersProgressMaps(undefined, studentData?.chapters);
        if (!chaptersOnly) {
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
        const userProgress =
          mergeUserAndStudentForJourney({ chapters: chaptersOnly }, studentData) || {
            chapters: chaptersOnly
          };
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
        const progressPercent = calculateChapterProgress(currentChapter, userProgress, studentData);
        const nextChallenge = findNextChallenge(userProgress, studentData);
        const caughtUp = isCaughtUp(userProgress);
        setJourneyStatus({
          currentChapterNumber: currentChapter.id,
          currentChapterId: String(currentChapter.id),
          currentChapter: currentChapter,
          chapterProgressPercent: progressPercent,
          nextChallenge: nextChallenge,
          isCaughtUp: caughtUp
        });
        return;
      }

      const userProgress = mergeUserAndStudentForJourney(userData, studentData);
      if (!userProgress) return;

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

      const progressPercent = calculateChapterProgress(currentChapter, userProgress, studentData);
      const nextChallenge = findNextChallenge(userProgress, studentData);
      const caughtUp = isCaughtUp(userProgress);

      setJourneyStatus({
        currentChapterNumber: currentChapter.id,
        currentChapterId: String(currentChapter.id),
        currentChapter: currentChapter,
        chapterProgressPercent: progressPercent,
        nextChallenge: nextChallenge,
        isCaughtUp: caughtUp
      });
    };

    const unsubscribeUser = onSnapshot(
      userRef,
      docSnapshot => {
        userData = docSnapshot.exists() ? docSnapshot.data() : null;
        applyMerged();
      },
      error => {
        console.error('Error in useJourneyStatus (users):', error);
      }
    );

    const unsubscribeStudent = onSnapshot(
      studentRef,
      docSnapshot => {
        studentData = docSnapshot.exists() ? docSnapshot.data() : null;
        applyMerged();
      },
      error => {
        console.error('Error in useJourneyStatus (students):', error);
      }
    );

    return () => {
      unsubscribeUser();
      unsubscribeStudent();
    };
  }, [userId]);

  return journeyStatus;
}
