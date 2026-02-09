/**
 * Hero's Journey Progress Utilities
 * 
 * Functions for updating Hero's Journey progress when Story Goals are completed.
 */

import { db } from '../firebase';
import { doc, getDoc, runTransaction, Timestamp } from 'firebase/firestore';
import { Assessment } from '../types/assessmentGoals';
import { HERO_JOURNEY_STAGES, getJourneyStageById } from './heroJourneyStages';

export interface CompletedStoryGoal {
  assessmentId: string;
  stageId: string;
  milestoneTitle?: string;
  completedAt: Timestamp;
}

export interface HeroJourneyProgress {
  completedStages: string[]; // Array of stage IDs that have been completed
  completedStoryGoals: CompletedStoryGoal[]; // Audit trail of completed story goals
  lastUpdated?: Timestamp;
}

/**
 * Updates Hero's Journey progress when a Story Goal is completed.
 * This function is idempotent - completing the same Story Goal twice will not double-award.
 * 
 * @param userId - The user ID whose journey progress should be updated
 * @param assessment - The Story Goal assessment that was completed
 * @returns Promise that resolves when the update is complete
 */
export async function updateHeroJourneyProgress(
  userId: string,
  assessment: Assessment
): Promise<void> {
  if (assessment.type !== 'story-goal' || !assessment.storyGoal) {
    throw new Error('Assessment must be a Story Goal with storyGoal configuration');
  }

  const { stageId, milestoneTitle } = assessment.storyGoal;
  const assessmentId = assessment.id;

  // Validate stage ID
  const stage = getJourneyStageById(stageId);
  if (!stage) {
    throw new Error(`Invalid journey stage ID: ${stageId}`);
  }

  console.log(`[StoryGoal] completing { userId: ${userId}, assessmentId: ${assessmentId}, stageId: ${stageId} }`);

  // Use a transaction to ensure atomicity and idempotency
  await runTransaction(db, async (transaction) => {
    const userRef = doc(db, 'users', userId);
    const userDoc = await transaction.get(userRef);

    if (!userDoc.exists()) {
      throw new Error(`User document not found: ${userId}`);
    }

    const userData = userDoc.data();
    
    // Get existing journey progress or initialize
    const existingProgress: HeroJourneyProgress = userData.heroJourneyProgress || {
      completedStages: [],
      completedStoryGoals: []
    };

    // Check if this assessment has already been completed (idempotency check)
    const alreadyCompleted = existingProgress.completedStoryGoals.some(
      goal => goal.assessmentId === assessmentId
    );

    if (alreadyCompleted) {
      console.log(`[StoryGoal] Assessment ${assessmentId} already completed, skipping update`);
      return; // Idempotent - do nothing if already completed
    }

    // Add the stage to completed stages if not already there
    const updatedCompletedStages = [...existingProgress.completedStages];
    if (!updatedCompletedStages.includes(stageId)) {
      updatedCompletedStages.push(stageId);
    }

    // Add audit entry for this completed story goal
    const newCompletedGoal: CompletedStoryGoal = {
      assessmentId,
      stageId,
      milestoneTitle,
      completedAt: Timestamp.now()
    };

    const updatedCompletedStoryGoals = [
      ...existingProgress.completedStoryGoals,
      newCompletedGoal
    ];

    // Update the user document
    const updatedProgress: HeroJourneyProgress = {
      completedStages: updatedCompletedStages,
      completedStoryGoals: updatedCompletedStoryGoals,
      lastUpdated: Timestamp.now()
    };

    transaction.update(userRef, {
      heroJourneyProgress: updatedProgress
    });

    console.log(`[StoryGoal] journey updated { stageId: ${stageId}, wroteAudit: true }`);
  });
}

/**
 * Gets the Hero's Journey progress for a user.
 */
export async function getHeroJourneyProgress(
  userId: string
): Promise<HeroJourneyProgress | null> {
  const userRef = doc(db, 'users', userId);
  const userDoc = await getDoc(userRef);

  if (!userDoc.exists()) {
    return null;
  }

  const userData = userDoc.data();
  return userData.heroJourneyProgress || {
    completedStages: [],
    completedStoryGoals: []
  };
}

/**
 * Checks if a specific journey stage has been completed.
 */
export async function isJourneyStageCompleted(
  userId: string,
  stageId: string
): Promise<boolean> {
  const progress = await getHeroJourneyProgress(userId);
  if (!progress) {
    return false;
  }

  return progress.completedStages.includes(stageId);
}

