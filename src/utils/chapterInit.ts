import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { CHAPTERS } from '../types/chapters';

export const initializeChapterProgress = async (userId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.log('User document does not exist, cannot initialize chapters');
      return;
    }

    const userData = userDoc.data();
    
    // Check if chapters already exist
    if (userData.chapters) {
      console.log('Chapter progress already exists for user');
      return;
    }

    // Initialize chapter structure
    const chapterProgress: any = {};
    
    CHAPTERS.forEach(chapter => {
      chapterProgress[chapter.id] = {
        isActive: chapter.id === 1, // Only Chapter 1 is active initially
        isCompleted: false,
        unlockDate: chapter.id === 1 ? new Date() : null,
        challenges: {}
      };

      // Initialize challenges for each chapter
      chapter.challenges.forEach(challenge => {
        chapterProgress[chapter.id].challenges[challenge.id] = {
          isCompleted: false,
          completionDate: null
        };
      });
    });

    // Update user document with chapter progress
    await updateDoc(userRef, {
      chapters: chapterProgress
    });

    console.log('Chapter progress initialized for user:', userId);
  } catch (error) {
    console.error('Error initializing chapter progress:', error);
  }
};

export const migrateExistingUserToChapters = async (userId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.log('User document does not exist');
      return;
    }

    const userData = userDoc.data();
    
    // If chapters already exist, no migration needed
    if (userData.chapters) {
      console.log('User already has chapter progress');
      return;
    }

    // Initialize basic chapter structure
    const chapterProgress: any = {};
    
    CHAPTERS.forEach(chapter => {
      chapterProgress[chapter.id] = {
        isActive: false,
        isCompleted: false,
        unlockDate: null,
        challenges: {}
      };

      // Initialize challenges
      chapter.challenges.forEach(challenge => {
        chapterProgress[chapter.id].challenges[challenge.id] = {
          isCompleted: false,
          completionDate: null
        };
      });
    });

    // All players start in Chapter 1 until they meet requirements
    // Only activate Chapter 1 initially
    chapterProgress[1].isActive = true;
    chapterProgress[1].unlockDate = new Date();

    // Update user document
    await updateDoc(userRef, {
      chapters: chapterProgress
    });

    console.log(`Migrated user ${userId} to Chapter 1 - starting point`);
  } catch (error) {
    console.error('Error migrating user to chapters:', error);
  }
};

export const checkAndActivateNextChapter = async (userId: string, currentChapterId: number) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) return;

    const userData = userDoc.data();
    const chapters = userData.chapters;
    
    if (!chapters) return;

    // Check if current chapter is completed
    const currentChapter = chapters[currentChapterId];
    if (!currentChapter || !currentChapter.isCompleted) return;

    // Activate next chapter if it exists
    const nextChapterId = currentChapterId + 1;
    if (nextChapterId <= 9 && chapters[nextChapterId]) {
      await updateDoc(userRef, {
        [`chapters.${nextChapterId}.isActive`]: true,
        [`chapters.${nextChapterId}.unlockDate`]: new Date()
      });
      
      console.log(`Activated Chapter ${nextChapterId} for user ${userId}`);
    }
  } catch (error) {
    console.error('Error activating next chapter:', error);
  }
}; 