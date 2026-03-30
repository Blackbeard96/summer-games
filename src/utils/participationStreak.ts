/**
 * Live Event participation streak / Flow State (Season 1).
 * Flow State enters at 3 consecutive successful participation awards (quiz, objectives, host PP).
 */

export interface ParticipationStreakState {
  /** Consecutive participation awards (each successful earn increments). */
  consecutiveAwards: number;
}

export function initialParticipationStreakState(): ParticipationStreakState {
  return { consecutiveAwards: 0 };
}

export interface StreakUpdateResult {
  next: ParticipationStreakState;
  battleLogLine: string | null;
}

/**
 * @param playerName display name for battle log
 * @param amount participation amount from this award (>0)
 */
export function applyParticipationStreakAward(
  prev: ParticipationStreakState,
  playerName: string,
  amount: number
): StreakUpdateResult {
  if (amount <= 0) {
    return { next: prev, battleLogLine: null };
  }
  const consecutiveAwards = prev.consecutiveAwards + 1;
  const next = { consecutiveAwards };
  let battleLogLine: string | null = null;
  if (consecutiveAwards === 3) {
    battleLogLine = `✨ ${playerName} entered Flow State! (${consecutiveAwards} successes in a row)`;
  } else if (consecutiveAwards > 3) {
    battleLogLine = `🔥 ${playerName} is on a ${consecutiveAwards}-success streak (Flow State active)`;
  }
  return { next, battleLogLine };
}

export function breakParticipationStreakMessage(playerName: string, hadStreak: boolean): string | null {
  if (!hadStreak) return null;
  return `⚡ ${playerName}'s Flow State ended (streak broken).`;
}
