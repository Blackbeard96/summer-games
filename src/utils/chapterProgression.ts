/**
 * Canonical Chapter Progression Engine
 * 
 * This module provides a centralized, transactional system for managing chapter and challenge progression.
 * All challenge completions should use this module to ensure consistent unlocking behavior.
 * 
 * Key Features:
 * - Transactional operations (prevents race conditions)
 * - Idempotent (safe to call multiple times)
 * - Automatic next challenge/chapter unlocking
 * - Proper status tracking
 */

import { doc, getDoc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { CHAPTERS, ChapterChallenge } from '../types/chapters';

export interface ProgressionResult {
  success: boolean;
  challengeUnlocked?: string; // Next challenge ID that was unlocked
  chapterUnlocked?: number; // Next chapter ID that was unlocked
  error?: string;
  alreadyCompleted?: boolean;
}

/**
 * Get the ordered list of challenges for a chapter
 */
export function getOrderedChallenges(chapterId: number): ChapterChallenge[] {
  const chapter = CHAPTERS.find(c => c.id === chapterId);
  if (!chapter) return [];
  return chapter.challenges; // Already ordered in CHAPTERS array
}

/**
 * Get the next challenge ID in the same chapter
 */
export function getNextChallengeId(chapterId: number, challengeId: string): string | null {
  const challenges = getOrderedChallenges(chapterId);
  const currentIndex = challenges.findIndex(c => c.id === challengeId);
  
  if (currentIndex < 0 || currentIndex >= challenges.length - 1) {
    return null; // Challenge not found or is the last one
  }
  
  return challenges[currentIndex + 1].id;
}

/**
 * Get the first challenge ID of a chapter
 */
export function getFirstChallengeId(chapterId: number): string | null {
  const challenges = getOrderedChallenges(chapterId);
  return challenges.length > 0 ? challenges[0].id : null;
}

/**
 * Check if all challenges in a chapter are completed
 */
function areAllChallengesCompleted(chapterId: number, chapterProgress: any): boolean {
  const challenges = getOrderedChallenges(chapterId);
  if (challenges.length === 0) return false;
  
  return challenges.every(challenge => {
    const challengeProgress = chapterProgress.challenges?.[challenge.id];
    return challengeProgress?.isCompleted === true || challengeProgress?.status === 'approved';
  });
}

/**
 * Canonical progression engine: Marks a challenge as completed and unlocks the next content
 * 
 * This function:
 * 1. Marks the current challenge as completed (idempotent)
 * 2. Unlocks the next challenge in the same chapter (if exists)
 * 3. If this was the last challenge, marks chapter as completed and unlocks next chapter's first challenge
 * 
 * @param userId - User ID
 * @param chapterId - Chapter ID containing the completed challenge
 * @param challengeId - Challenge ID that was just completed
 * @returns Progression result with unlocked content info
 */
export async function updateProgressOnChallengeComplete(
  userId: string,
  chapterId: number,
  challengeId: string
): Promise<ProgressionResult> {
  const DEBUG_PROGRESS = process.env.REACT_APP_DEBUG_PROGRESS === 'true';
  const DEBUG_CH2_1 = process.env.REACT_APP_DEBUG_CH2_1 === 'true';
  
  // Move DEBUG_CH2_1 declaration to top level to avoid "used before declaration" errors
  
  if (DEBUG_PROGRESS) {
    console.log(`[Progression] updateProgressOnChallengeComplete called:`, {
      userId,
      chapterId,
      challengeId,
      timestamp: new Date().toISOString()
    });
  }

  try {
    const userRef = doc(db, 'users', userId);
    
    const result = await runTransaction(db, async (transaction) => {
      // Read current user data
      const userDoc = await transaction.get(userRef);
      
      if (!userDoc.exists()) {
        throw new Error(`User document does not exist: ${userId}`);
      }
      
      const userData = userDoc.data();
      const chapters = userData.chapters || {};
      const chapterKey = String(chapterId);
      const chapterProgress = chapters[chapterKey] || {};
      const challengeProgress = chapterProgress.challenges?.[challengeId] || {};
      
      // Idempotency check: If challenge already completed, do nothing
      if (challengeProgress.isCompleted === true || challengeProgress.status === 'approved') {
        if (DEBUG_PROGRESS) {
          console.log(`[Progression] Challenge ${challengeId} already completed, skipping`);
        }
        return {
          success: true,
          alreadyCompleted: true
        } as ProgressionResult;
      }
      
      // Mark current challenge as completed
      // CRITICAL: Ensure chapter is active when completing any challenge
      // Chapters 1 and 2 are always available, so they should always be active
      const isAlwaysActiveChapter = chapterId === 1 || chapterId === 2;
      const shouldActivateChapter = isAlwaysActiveChapter && !chapterProgress.isActive;
      
      const updatedChapters = {
        ...chapters,
        [chapterKey]: {
          ...chapterProgress,
          // Always set to true for chapters 1 and 2, otherwise preserve existing state
          isActive: isAlwaysActiveChapter ? true : (chapterProgress.isActive ?? false),
          challenges: {
            ...chapterProgress.challenges,
            [challengeId]: {
              ...challengeProgress,
              isCompleted: true,
              status: 'approved',
              completedAt: serverTimestamp()
            }
          }
        }
      };
      
      if (shouldActivateChapter && DEBUG_PROGRESS) {
        console.log(`[Progression] Activating chapter ${chapterId} because it's Chapter 1 or 2 and should always be active`);
      }
      
      if (DEBUG_PROGRESS) {
        console.log(`[Progression] Marking challenge ${challengeId} as completed`);
      }
      
      const progressionResult: ProgressionResult = {
        success: true
      };
      
      // Check if there's a next challenge in the same chapter
      const nextChallengeId = getNextChallengeId(chapterId, challengeId);
      
      if (nextChallengeId) {
        // Unlock next challenge in same chapter
        const nextChallengeProgress = chapterProgress.challenges?.[nextChallengeId] || {};
        
        // Only unlock if not already unlocked/completed
        if (!nextChallengeProgress.isCompleted && nextChallengeProgress.status !== 'approved') {
          // Ensure challenges object exists
          if (!updatedChapters[chapterKey].challenges) {
            updatedChapters[chapterKey].challenges = {};
          }
          
          // Create next challenge entry - this marks it as "unlocked" by ensuring it exists in the structure
          // The UI unlock logic (getChallengeStatus) will check if previous challenge is completed
          // CRITICAL: Create a minimal entry that indicates the challenge exists and can be checked
          updatedChapters[chapterKey].challenges[nextChallengeId] = {
            ...nextChallengeProgress,
            // Don't set isCompleted or status - those remain undefined/empty until challenge is actually completed
            // The existence of this entry allows the UI to check if it should be available
            // Explicitly ensure the entry exists even if nextChallengeProgress was empty
          };
          
          // CRITICAL FIX: Ensure chapter remains active when unlocking next challenge
          // This is especially important for Chapter 2
          if (!updatedChapters[chapterKey].isActive && (chapterId === 1 || chapterId === 2)) {
            updatedChapters[chapterKey].isActive = true;
            if (DEBUG_PROGRESS) {
              console.log(`[Progression] Ensuring chapter ${chapterId} is active when unlocking next challenge`);
            }
          }
          
          progressionResult.challengeUnlocked = nextChallengeId;
          
          if (DEBUG_PROGRESS || DEBUG_CH2_1) {
            console.log(`[Progression] Next challenge ${nextChallengeId} will be unlocked (sequential unlock)`, {
              chapterId,
              currentChallengeId: challengeId,
              nextChallengeId,
              nextChallengeExists: !!chapterProgress.challenges?.[nextChallengeId],
              chapterKey,
              chapterIsActive: updatedChapters[chapterKey].isActive,
              allChallenges: Object.keys(updatedChapters[chapterKey].challenges || {})
            });
          }
        } else {
          if (DEBUG_PROGRESS) {
            console.log(`[Progression] Next challenge ${nextChallengeId} already unlocked/completed, skipping`, {
              isCompleted: nextChallengeProgress.isCompleted,
              status: nextChallengeProgress.status
            });
          }
        }
      } else {
        if (DEBUG_PROGRESS) {
          console.log(`[Progression] No next challenge found for ${challengeId} in chapter ${chapterId}`);
        }
      }
      
      // CRITICAL FIX: Always check if chapter is complete after ANY challenge completion
      // This ensures chapters are marked complete and next chapters unlocked reliably,
      // regardless of which challenge was completed last
      const allCompleted = areAllChallengesCompleted(chapterId, {
        ...chapterProgress,
        challenges: updatedChapters[chapterKey].challenges
      });
      
      if (allCompleted && !chapterProgress.isCompleted) {
        // Mark chapter as completed
        updatedChapters[chapterKey] = {
          ...updatedChapters[chapterKey],
          isCompleted: true,
          completionDate: serverTimestamp(),
          isActive: false // Deactivate current chapter
        };
        
        if (DEBUG_PROGRESS) {
          console.log(`[Progression] Chapter ${chapterId} is now complete (all challenges done)`);
        }
        
        // Unlock next chapter
        const nextChapterId = chapterId + 1;
        const nextChapter = CHAPTERS.find(c => c.id === nextChapterId);
        
        if (nextChapter) {
          const nextChapterKey = String(nextChapterId);
          const nextChapterProgress = chapters[nextChapterKey] || {};
          const firstChallengeId = getFirstChallengeId(nextChapterId);
          
          // Initialize next chapter if it doesn't exist
          if (!chapters[nextChapterKey]) {
            updatedChapters[nextChapterKey] = {
              isActive: true,
              isCompleted: false,
              unlockDate: serverTimestamp(),
              challenges: {}
            };
          } else {
            updatedChapters[nextChapterKey] = {
              ...nextChapterProgress,
              isActive: true,
              unlockDate: nextChapterProgress.unlockDate || serverTimestamp()
            };
          }
          
          // Initialize first challenge of next chapter if needed
          if (firstChallengeId) {
            if (!updatedChapters[nextChapterKey].challenges) {
              updatedChapters[nextChapterKey].challenges = {};
            }
            
            const firstChallengeProgress = updatedChapters[nextChapterKey].challenges[firstChallengeId] || {};
            
            // First challenge is automatically unlocked when chapter is unlocked
            // (UI logic handles this, but we ensure the challenge exists in structure)
            if (!firstChallengeProgress.isCompleted && firstChallengeProgress.status !== 'approved') {
              updatedChapters[nextChapterKey].challenges[firstChallengeId] = {
                ...firstChallengeProgress,
                // Status will be determined by UI unlock logic (previous challenge completion or chapter active status)
              };
            }
          }
          
          progressionResult.chapterUnlocked = nextChapterId;
          
          if (DEBUG_PROGRESS) {
            console.log(`[Progression] Next chapter ${nextChapterId} unlocked with first challenge ${firstChallengeId}`);
          }
        }
      }
      
      // Write updates
      // DEBUG_CH2_1 is already declared at the top of the function
      
      if (DEBUG_CH2_1 || DEBUG_PROGRESS) {
        const challengeData = updatedChapters[chapterKey]?.challenges?.[challengeId];
        console.log(`[Progression] About to commit transaction for ${challengeId}:`, {
          chapterId,
          chapterKey,
          challengeId,
          challengeData: {
            isCompleted: challengeData?.isCompleted,
            status: challengeData?.status,
            completedAt: challengeData?.completedAt ? 'present' : 'missing'
          },
          fullPath: `users/${userId}/chapters/${chapterKey}/challenges/${challengeId}`,
          challengeUnlocked: progressionResult.challengeUnlocked,
          allChallengesInChapter: Object.keys(updatedChapters[chapterKey]?.challenges || {})
        });
      }
      
      transaction.update(userRef, {
        chapters: updatedChapters
      });
      
      if (DEBUG_PROGRESS || DEBUG_CH2_1) {
        console.log(`[Progression] Transaction update called for ${challengeId}:`, {
          challengeUnlocked: progressionResult.challengeUnlocked,
          chapterUnlocked: progressionResult.chapterUnlocked
        });
      }
      
      return progressionResult;
    });
    
    if (DEBUG_CH2_1 || DEBUG_PROGRESS) {
      console.log(`[Progression] Transaction completed for ${challengeId}:`, {
        success: result.success,
        alreadyCompleted: result.alreadyCompleted,
        challengeUnlocked: result.challengeUnlocked,
        chapterUnlocked: result.chapterUnlocked,
        error: result.error
      });
    }
    
    return result;
  } catch (error: any) {
    console.error(`[Progression] Error updating progress:`, error);
    return {
      success: false,
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Repair/Recalculate progression for a user
 * Useful for fixing stuck players or migrating data
 * 
 * This function:
 * 1. Scans all completed challenges
 * 2. Ensures next challenges are properly unlocked
 * 3. Ensures completed chapters unlock next chapters
 * 4. Detects unlock-without-completion gaps (next available but previous incomplete)
 * 5. Backfills missing isCompleted/status when later challenges are already done
 * Does NOT claw back rewards — only marks completion / unlocks.
 */
export async function repairUserProgression(userId: string): Promise<{
  success: boolean;
  challengesRepaired: number;
  chaptersRepaired: number;
  completionRecordsRepaired: number;
  unlockGapsFixed: number;
  errors: string[];
  findings: string[];
}> {
  const DEBUG_PROGRESS = process.env.REACT_APP_DEBUG_PROGRESS === 'true';
  
  if (DEBUG_PROGRESS) {
    console.log(`[Progression] Repairing progression for user:`, userId);
  }
  
  const errors: string[] = [];
  const findings: string[] = [];
  let challengesRepaired = 0;
  let chaptersRepaired = 0;
  let completionRecordsRepaired = 0;
  let unlockGapsFixed = 0;
  
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return {
        success: false,
        challengesRepaired: 0,
        chaptersRepaired: 0,
        completionRecordsRepaired: 0,
        unlockGapsFixed: 0,
        errors: ['User document does not exist'],
        findings: [],
      };
    }
    
    const userData = userDoc.data();
    const chapters = userData.chapters || {};
    const updatedChapters = { ...chapters };
    let needsUpdate = false;
    
    // Process each chapter
    for (const chapter of CHAPTERS) {
      const chapterKey = String(chapter.id);
      const chapterProgress = chapters[chapterKey] || chapters[chapter.id] || {};
      const challenges = { ...(chapterProgress.challenges || {}) };
      
      // Gap repair: if a later challenge is completed, mark earlier ones complete when missing
      let sawIncomplete = false;
      for (let i = 0; i < chapter.challenges.length; i++) {
        const challenge = chapter.challenges[i];
        const challengeProgress = challenges[challenge.id] || {};
        const isCompleted = challengeProgress.isCompleted === true || challengeProgress.status === 'approved';

        if (!isCompleted) {
          // Look ahead: if any later challenge is completed, backfill this one
          const laterComplete = chapter.challenges.slice(i + 1).some((later) => {
            const p = challenges[later.id];
            return p?.isCompleted === true || p?.status === 'approved';
          });
          if (laterComplete) {
            findings.push(
              `Ch${chapter.id}: ${challenge.id} missing completion but later mission complete — backfilling completion record (rewards NOT re-granted)`
            );
            challenges[challenge.id] = {
              ...challengeProgress,
              isCompleted: true,
              status: 'approved',
              completedAt: challengeProgress.completedAt || serverTimestamp(),
              repairedCompletion: true,
            };
            completionRecordsRepaired++;
            unlockGapsFixed++;
            needsUpdate = true;
          } else {
            sawIncomplete = true;
          }
        } else if (
          challengeProgress.isCompleted === true &&
          challengeProgress.status !== 'approved'
        ) {
          // Normalize status so UI never treats completed as merely available
          challenges[challenge.id] = {
            ...challengeProgress,
            status: 'approved',
          };
          completionRecordsRepaired++;
          needsUpdate = true;
          findings.push(`Ch${chapter.id}: ${challenge.id} had isCompleted without status=approved — normalized`);
        }
      }

      // Ensure next challenge slots exist after completed ones
      for (let i = 0; i < chapter.challenges.length; i++) {
        const challenge = chapter.challenges[i];
        const challengeProgress = challenges[challenge.id] || {};
        const isCompleted = challengeProgress.isCompleted === true || challengeProgress.status === 'approved';
        
        if (isCompleted) {
          if (i < chapter.challenges.length - 1) {
            const nextChallenge = chapter.challenges[i + 1];
            if (!challenges[nextChallenge.id]) {
              challenges[nextChallenge.id] = {};
              challengesRepaired++;
              needsUpdate = true;
              findings.push(`Ch${chapter.id}: ensured next slot for ${nextChallenge.id}`);
            }
          } else {
            const allCompleted = chapter.challenges.every((c) => {
              const p = challenges[c.id];
              return p?.isCompleted === true || p?.status === 'approved';
            });
            
            if (allCompleted && !chapterProgress.isCompleted) {
              updatedChapters[chapterKey] = {
                ...chapterProgress,
                challenges,
                isCompleted: true,
                completionDate: chapterProgress.completionDate || serverTimestamp(),
                isActive: false,
              };
              needsUpdate = true;
              
              const nextChapterId = chapter.id + 1;
              const nextChapter = CHAPTERS.find(c => c.id === nextChapterId);
              
              if (nextChapter) {
                const nextChapterKey = String(nextChapterId);
                if (!updatedChapters[nextChapterKey]) {
                  updatedChapters[nextChapterKey] = {
                    isActive: true,
                    isCompleted: false,
                    unlockDate: serverTimestamp(),
                    challenges: {}
                  };
                  chaptersRepaired++;
                  needsUpdate = true;
                } else if (!updatedChapters[nextChapterKey].isActive) {
                  updatedChapters[nextChapterKey] = {
                    ...updatedChapters[nextChapterKey],
                    isActive: true,
                    unlockDate: updatedChapters[nextChapterKey].unlockDate || serverTimestamp(),
                  };
                  chaptersRepaired++;
                  needsUpdate = true;
                }
              }
            }
          }
        }
      }

      if (!updatedChapters[chapterKey] || updatedChapters[chapterKey].challenges !== challenges) {
        updatedChapters[chapterKey] = {
          ...(updatedChapters[chapterKey] || chapterProgress),
          challenges,
          // Ch1/Ch2 stay active for journey access
          isActive: chapter.id === 1 || chapter.id === 2
            ? true
            : (updatedChapters[chapterKey]?.isActive ?? chapterProgress.isActive ?? false),
        };
      }

      if (sawIncomplete && DEBUG_PROGRESS) {
        console.log(`[Progression] Chapter ${chapter.id} still has incomplete challenges`);
      }
    }
    
    if (needsUpdate) {
      await runTransaction(db, async (transaction) => {
        const currentDoc = await transaction.get(userRef);
        if (currentDoc.exists()) {
          transaction.update(userRef, {
            chapters: updatedChapters
          });
        }
      });
      
      if (DEBUG_PROGRESS) {
        console.log(`[Progression] Repair complete:`, {
          challengesRepaired,
          chaptersRepaired,
          completionRecordsRepaired,
          unlockGapsFixed,
        });
      }
    }
    
    return {
      success: true,
      challengesRepaired,
      chaptersRepaired,
      completionRecordsRepaired,
      unlockGapsFixed,
      errors,
      findings,
    };
  } catch (error: any) {
    console.error(`[Progression] Error repairing progression:`, error);
    errors.push(error.message || 'Unknown error');
    return {
      success: false,
      challengesRepaired,
      chaptersRepaired,
      completionRecordsRepaired,
      unlockGapsFixed,
      errors,
      findings,
    };
  }
}
