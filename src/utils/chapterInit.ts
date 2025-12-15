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
    
    // If chapters already exist, ensure Chapter 1 is active
    if (userData.chapters) {
      console.log('User has chapter progress, checking Chapter 1 activation...');
      
      // Check if Chapter 1 is active, if not, activate it
      if (!userData.chapters[1]?.isActive) {
        console.log('Chapter 1 not active, activating it...');
        await updateDoc(userRef, {
          'chapters.1.isActive': true,
          'chapters.1.unlockDate': new Date()
        });
        console.log('Chapter 1 activated for existing user');
      }
      return;
    }

    // Initialize basic chapter structure
    const chapterProgress: any = {};
    
    CHAPTERS.forEach(chapter => {
      chapterProgress[chapter.id] = {
        isActive: chapter.id === 1, // Only Chapter 1 is active initially
        isCompleted: false,
        unlockDate: chapter.id === 1 ? new Date() : null,
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

    // Update user document
    await updateDoc(userRef, {
      chapters: chapterProgress
    });

    console.log(`Migrated user ${userId} to Chapter 1 - starting point`);
  } catch (error) {
    console.error('Error migrating user to chapters:', error);
  }
};

// Ensure Chapter 1 is always active for users (automatically available to all players)
export const ensureChapter1Active = async (userId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    const studentRef = doc(db, 'students', userId);
    const userDoc = await getDoc(userRef);
    const studentDoc = await getDoc(studentRef);
    
    if (!userDoc.exists()) {
      console.log('User document does not exist');
      return false;
    }

    const userData = userDoc.data();
    const studentData = studentDoc.exists() ? studentDoc.data() : null;
    
    // Check if chapters exist
    if (!userData.chapters) {
      console.log('No chapters found, initializing...');
      await initializeChapterProgress(userId);
      // Also initialize for students collection if it exists
      if (studentDoc.exists()) {
        await updateDoc(studentRef, {
          'chapters.1.isActive': true,
          'chapters.1.unlockDate': new Date()
        });
      }
      return true;
    }

    // Check if Chapter 1 is active - if not, activate it (Chapter 1 is always available)
    if (!userData.chapters[1]?.isActive) {
      console.log('Chapter 1 not active, activating it...');
      await updateDoc(userRef, {
        'chapters.1.isActive': true,
        'chapters.1.unlockDate': new Date()
      });
      console.log('Chapter 1 activated successfully in users collection');
      
      // Also update students collection
      if (studentDoc.exists()) {
        await updateDoc(studentRef, {
          'chapters.1.isActive': true,
          'chapters.1.unlockDate': new Date()
        });
        console.log('Chapter 1 activated successfully in students collection');
      }
      return true;
    }

    // Also ensure students collection is in sync
    if (studentDoc.exists() && (!studentData?.chapters || !studentData.chapters[1]?.isActive)) {
      await updateDoc(studentRef, {
        'chapters.1.isActive': true,
        'chapters.1.unlockDate': new Date()
      });
      console.log('Chapter 1 synced in students collection');
    }

    console.log('Chapter 1 is already active');
    return true;
  } catch (error) {
    console.error('Error ensuring Chapter 1 is active:', error);
    return false;
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