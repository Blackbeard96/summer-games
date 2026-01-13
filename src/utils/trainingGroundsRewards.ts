/**
 * Training Grounds Reward Service
 * Handles PP/XP reward calculation and granting for quiz attempts
 */

import { doc, getDoc, updateDoc, increment, runTransaction } from 'firebase/firestore';
import { db } from '../firebase';
import { TrainingAttempt, TrainingAnswer, TrainingQuestion, DEFAULT_REWARDS } from '../types/trainingGrounds';

export interface RewardResult {
  ppGained: number;
  xpGained: number;
  bonuses: string[];
  breakdown: {
    basePP: number;
    baseXP: number;
    streakBonusPP?: number;
    perfectScoreBonusPP?: number;
    perfectScoreBonusXP?: number;
  };
}

/**
 * Calculate rewards for a quiz attempt
 */
export function calculateQuizRewards(
  questions: TrainingQuestion[],
  answers: TrainingAnswer[]
): RewardResult {
  let totalPP = 0;
  let totalXP = 0;
  const bonuses: string[] = [];
  
  let streakCount = 0;
  let maxStreak = 0;
  
  // Calculate base rewards and track streaks
  answers.forEach((answer, index) => {
    const question = questions.find(q => q.id === answer.questionId);
    if (!question) return;
    
    if (answer.isCorrect) {
      // Add base rewards
      totalPP += question.pointsPP;
      totalXP += question.pointsXP;
      
      // Track streak
      streakCount++;
      maxStreak = Math.max(maxStreak, streakCount);
      
      // Check for streak bonus
      const rewardConfig = DEFAULT_REWARDS[question.difficulty] || DEFAULT_REWARDS.medium;
      if (rewardConfig.streakBonusThreshold && rewardConfig.streakBonusPP) {
        if (streakCount % rewardConfig.streakBonusThreshold === 0) {
          totalPP += rewardConfig.streakBonusPP;
          bonuses.push(`Streak of ${streakCount}`);
        }
      }
    } else {
      streakCount = 0; // Reset streak on incorrect answer
    }
  });
  
  // Check for perfect score bonus
  const correctCount = answers.filter(a => a.isCorrect).length;
  const totalQuestions = questions.length;
  if (correctCount === totalQuestions && totalQuestions > 0) {
    const perfectBonusConfig = DEFAULT_REWARDS.medium; // Use medium as default for perfect score
    if (perfectBonusConfig.perfectScoreBonusPP) {
      totalPP += perfectBonusConfig.perfectScoreBonusPP;
      bonuses.push('Perfect Score');
    }
    if (perfectBonusConfig.perfectScoreBonusXP) {
      totalXP += perfectBonusConfig.perfectScoreBonusXP;
    }
  }
  
  const breakdown = {
    basePP: totalPP - (bonuses.includes('Perfect Score') ? DEFAULT_REWARDS.medium.perfectScoreBonusPP! : 0) - 
      (bonuses.filter(b => b.startsWith('Streak')).length * (DEFAULT_REWARDS.medium.streakBonusPP || 0)),
    baseXP: totalXP - (bonuses.includes('Perfect Score') ? DEFAULT_REWARDS.medium.perfectScoreBonusXP! : 0),
    streakBonusPP: bonuses.filter(b => b.startsWith('Streak')).length > 0 ? 
      bonuses.filter(b => b.startsWith('Streak')).length * (DEFAULT_REWARDS.medium.streakBonusPP || 0) : undefined,
    perfectScoreBonusPP: bonuses.includes('Perfect Score') ? DEFAULT_REWARDS.medium.perfectScoreBonusPP : undefined,
    perfectScoreBonusXP: bonuses.includes('Perfect Score') ? DEFAULT_REWARDS.medium.perfectScoreBonusXP : undefined,
  };
  
  return {
    ppGained: totalPP,
    xpGained: totalXP,
    bonuses,
    breakdown,
  };
}

/**
 * Grant rewards to player (atomic transaction)
 */
export async function grantQuizRewards(
  userId: string,
  rewards: RewardResult
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const studentRef = doc(db, 'students', userId);
  
  await runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    const studentDoc = await transaction.get(studentRef);
    
    if (userDoc.exists()) {
      transaction.update(userRef, {
        powerPoints: increment(rewards.ppGained),
        xp: increment(rewards.xpGained),
      });
    }
    
    if (studentDoc.exists()) {
      transaction.update(studentRef, {
        powerPoints: increment(rewards.ppGained),
        xp: increment(rewards.xpGained),
      });
    }
  });
}

