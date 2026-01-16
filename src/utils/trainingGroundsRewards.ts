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
 * Rewards are proportional to the percentage score (0-100%)
 */
export function calculateQuizRewards(
  questions: TrainingQuestion[],
  answers: TrainingAnswer[]
): RewardResult {
  // First, calculate the overall percentage score based on partial credit
  let totalPartialCredit = 0;
  answers.forEach((answer) => {
    const partialCredit = answer.partialCredit !== undefined ? answer.partialCredit : (answer.isCorrect ? 1.0 : 0.0);
    totalPartialCredit += partialCredit;
  });
  const totalQuestions = questions.length;
  const scorePercentage = totalQuestions > 0 ? totalPartialCredit / totalQuestions : 0; // 0.0 to 1.0
  
  // Calculate what rewards would be at 100% (perfect score)
  let maxPossiblePP = 0;
  let maxPossibleXP = 0;
  let streakBonusPP = 0;
  let perfectScoreBonusPP = 0;
  let perfectScoreBonusXP = 0;
  
  // Calculate base rewards (what they'd get if all questions were 100% correct)
  questions.forEach((question, index) => {
    maxPossiblePP += question.pointsPP;
    maxPossibleXP += question.pointsXP;
    
    // Calculate streak bonuses (only for perfect runs)
    const rewardConfig = DEFAULT_REWARDS[question.difficulty] || DEFAULT_REWARDS.medium;
    if (rewardConfig.streakBonusThreshold && rewardConfig.streakBonusPP) {
      // Check if this would trigger a streak bonus in a perfect run
      const streakPosition = index + 1;
      if (streakPosition % rewardConfig.streakBonusThreshold === 0) {
        streakBonusPP += rewardConfig.streakBonusPP;
      }
    }
  });
  
  // Add perfect score bonuses (only at 100%)
  if (scorePercentage >= 1.0) {
    const perfectBonusConfig = DEFAULT_REWARDS.medium;
    perfectScoreBonusPP = perfectBonusConfig.perfectScoreBonusPP || 0;
    perfectScoreBonusXP = perfectBonusConfig.perfectScoreBonusXP || 0;
  }
  
  const maxTotalPP = maxPossiblePP + streakBonusPP + perfectScoreBonusPP;
  const maxTotalXP = maxPossibleXP + perfectScoreBonusXP;
  
  // Apply percentage score to rewards (proportional rewards)
  const totalPP = Math.round(maxTotalPP * scorePercentage);
  const totalXP = Math.round(maxTotalXP * scorePercentage);
  
  // Track bonuses (only show if score is high enough)
  const bonuses: string[] = [];
  const actualStreakBonus = Math.round(streakBonusPP * scorePercentage);
  const actualPerfectPP = Math.round(perfectScoreBonusPP * scorePercentage);
  const actualPerfectXP = Math.round(perfectScoreBonusXP * scorePercentage);
  
  if (actualStreakBonus > 0) {
    bonuses.push(`Streak Bonus`);
  }
  if (scorePercentage >= 1.0) {
    bonuses.push('Perfect Score');
  }
  
  const breakdown = {
    basePP: Math.round(maxPossiblePP * scorePercentage),
    baseXP: Math.round(maxPossibleXP * scorePercentage),
    streakBonusPP: actualStreakBonus > 0 ? actualStreakBonus : undefined,
    perfectScoreBonusPP: actualPerfectPP > 0 ? actualPerfectPP : undefined,
    perfectScoreBonusXP: actualPerfectXP > 0 ? actualPerfectXP : undefined,
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
  const vaultRef = doc(db, 'vaults', userId);
  
  await runTransaction(db, async (transaction) => {
    const userDoc = await transaction.get(userRef);
    const studentDoc = await transaction.get(studentRef);
    const vaultDoc = await transaction.get(vaultRef);
    
    // Update users collection
    if (userDoc.exists()) {
      transaction.update(userRef, {
        powerPoints: increment(rewards.ppGained),
        xp: increment(rewards.xpGained),
      });
    }
    
    // Update students collection
    if (studentDoc.exists()) {
      transaction.update(studentRef, {
        powerPoints: increment(rewards.ppGained),
        xp: increment(rewards.xpGained),
      });
    }
    
    // Update vault collection (primary source of truth for PP)
    if (vaultDoc.exists()) {
      const vaultData = vaultDoc.data();
      const vaultCapacity = vaultData.capacity || 1000;
      const currentVaultPP = vaultData.currentPP || 0;
      const newVaultPP = Math.min(vaultCapacity, currentVaultPP + rewards.ppGained);
      
      transaction.update(vaultRef, {
        currentPP: newVaultPP,
      });
    }
  });
}

