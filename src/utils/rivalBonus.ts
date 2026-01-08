/**
 * Rival Bonus Utility - Applies double rewards when defeating rivals
 */

import { isRival } from './rivalService';

export interface RivalBonusResult {
  ppEarned: number;
  xpEarned: number;
  isRivalBonus: boolean;
}

/**
 * Apply rival bonus to battle rewards
 * Doubles PP and XP if the defeated opponent is a rival
 */
export async function applyRivalBonus(
  winnerUid: string,
  loserUid: string,
  ppEarned: number,
  xpEarned: number
): Promise<RivalBonusResult> {
  if (winnerUid === loserUid) {
    return { ppEarned, xpEarned, isRivalBonus: false };
  }
  
  const isRivalDefeated = await isRival(winnerUid, loserUid);
  
  if (isRivalDefeated) {
    return {
      ppEarned: ppEarned * 2,
      xpEarned: xpEarned * 2,
      isRivalBonus: true
    };
  }
  
  return {
    ppEarned,
    xpEarned,
    isRivalBonus: false
  };
}



