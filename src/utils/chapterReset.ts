import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { CHAPTERS } from '../types/chapters';

export const resetUserToChapter1 = async (userId: string) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      console.log('User document does not exist');
      return;
    }

    const userData = userDoc.data();
    
    // Reset all chapters to inactive and not completed
    const chapterProgress: any = {};
    
    CHAPTERS.forEach(chapter => {
      chapterProgress[chapter.id] = {
        isActive: chapter.id === 1, // Only Chapter 1 is active
        isCompleted: false,
        unlockDate: chapter.id === 1 ? new Date() : null,
        completionDate: null,
        challenges: {}
      };

      // Reset all challenges to not completed
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

    console.log(`Reset user ${userId} to Chapter 1`);
  } catch (error) {
    console.error('Error resetting user to Chapter 1:', error);
  }
};

export const resetAllUsersToChapter1 = async () => {
  try {
    // This would require admin privileges and should be used carefully
    console.log('This function would reset all users to Chapter 1');
    console.log('Use with caution - this affects all users');
  } catch (error) {
    console.error('Error resetting all users to Chapter 1:', error);
  }
}; 