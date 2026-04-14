/**
 * Power stat progression (Physical / Mental / Emotional / Spiritual) from Live Events.
 *
 * ## Dev: where rewards run (Live Events / In Session)
 *
 * - **Session end** (`endSession` → `finalizeSessionStats` in `inSessionStatsService.ts`):
 *   For each participant, calls `computeSessionEndPowerXp` then `awardLiveEventPowerGain` →
 *   `awardPowerStatXp` (writes `students/{uid}.stats` via transaction). Also credits battle pass XP.
 * - **Reflection submit** (`submitLiveEventReflectionToAssessment` in `assessmentGoalsFirestore.ts`):
 *   `awardPowerXpForReflectionSubmission` → Emotional Power XP + same amount to deployed battle pass (`battlePassXP`).
 * - **Goal / habit milestones** (`assessmentGoalsFirestore.ts`): `awardPowerXpForGoalAchievement` → Spiritual + battle pass.
 * - **Mid-battle drip** (`awardPowerXpForLiveQuizCorrectAnswer`, `awardPowerXpForElimination`): gated by
 *   `REACT_APP_LIVE_EVENT_POWER_DRIP === 'true'` to avoid double-counting with session-end totals.
 *
 * Event → stat mapping: `getPowerTypeForEvent` / `liveModeToPowerSource` (battle_royale → physical,
 * quiz → mental, reflection → emotional, goal_setting / goal_completion → spiritual).
 */

import { db } from '../firebase';
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { awardBattlePassXpForDeployedSeason } from './awardBattlePassXp';
import type { SessionStats } from '../types/inSessionStats';
import type {
  PowerStatBranch,
  LiveEventPowerSourceType,
  PlayerPowerStatsMap,
  PowerStatBranchState,
  LiveEventPowerGain,
} from '../types/playerPowerStats';

export const POWER_STAT_MAX_LEVEL = 99;

/** Minimum Power XP applied at **session end** per branch (rebalance here + in `computeSessionEndPowerXp`). */
export const LIVE_EVENT_MIN_STAT_XP_AT_SESSION_END: Record<PowerStatBranch, number> = {
  physical: 25,
  mental: 25,
  emotional: 20,
  spiritual: 35,
};

/** Re-export: pure level-up / XP merge for tests and callers. */
export { applyPowerXpToBranchPure as maybeLevelUpPowerStat };

/** 0–100 fill for XP progress toward the next level (for UI bars). */
export function getPowerStatBarFillPercent(st: PowerStatBranchState): number {
  if (st.level >= POWER_STAT_MAX_LEVEL) return 100;
  const denom = Math.max(1, st.xpToNextLevel);
  return Math.min(100, Math.max(0, (st.xp / denom) * 100));
}

/** Bar track + fill gradient endpoints per Power stat branch. */
export const POWER_STAT_BAR_THEME: Record<
  PowerStatBranch,
  { fill: string; fillSoft: string; track: string }
> = {
  physical: { fill: '#15803d', fillSoft: '#4ade80', track: '#e2e8f0' },
  mental: { fill: '#1d4ed8', fillSoft: '#60a5fa', track: '#e2e8f0' },
  emotional: { fill: '#7e22ce', fillSoft: '#d8b4fe', track: '#e2e8f0' },
  spiritual: { fill: '#b45309', fillSoft: '#fbbf24', track: '#e2e8f0' },
};

/** XP needed to go from `level` to `level + 1` */
export function powerStatXpRequiredForLevel(level: number): number {
  const L = Math.max(1, Math.min(POWER_STAT_MAX_LEVEL, Math.floor(level)));
  return 100 + (L - 1) * 75;
}

export function createDefaultPowerStatBranch(): PowerStatBranchState {
  const xpToNextLevel = powerStatXpRequiredForLevel(1);
  return {
    level: 1,
    xp: 0,
    xpToNextLevel,
    totalEarned: 0,
    bonusesUnlocked: [],
  };
}

export function createDefaultPlayerPowerStats(): PlayerPowerStatsMap {
  return {
    physical: createDefaultPowerStatBranch(),
    mental: createDefaultPowerStatBranch(),
    emotional: createDefaultPowerStatBranch(),
    spiritual: createDefaultPowerStatBranch(),
  };
}

function mergeBranch(raw: unknown, fallback: PowerStatBranchState): PowerStatBranchState {
  if (!raw || typeof raw !== 'object') return { ...fallback };
  const o = raw as Record<string, unknown>;
  const level = typeof o.level === 'number' && o.level >= 1 ? Math.min(POWER_STAT_MAX_LEVEL, Math.floor(o.level)) : fallback.level;
  const totalEarned = typeof o.totalEarned === 'number' && o.totalEarned >= 0 ? Math.floor(o.totalEarned) : fallback.totalEarned;
  const xp = typeof o.xp === 'number' && o.xp >= 0 ? Math.floor(o.xp) : fallback.xp;
  const xpToNextLevel =
    typeof o.xpToNextLevel === 'number' && o.xpToNextLevel > 0
      ? Math.floor(o.xpToNextLevel)
      : powerStatXpRequiredForLevel(level);
  const bonusesUnlocked = Array.isArray(o.bonusesUnlocked)
    ? o.bonusesUnlocked.filter((x): x is string => typeof x === 'string')
    : [...fallback.bonusesUnlocked];
  return { level, xp, xpToNextLevel, totalEarned, bonusesUnlocked };
}

/** Merge Firestore `students.stats` with safe defaults for all four branches. */
export function normalizePlayerPowerStats(raw: unknown): PlayerPowerStatsMap {
  const base = createDefaultPlayerPowerStats();
  if (!raw || typeof raw !== 'object') return base;
  const s = raw as Record<string, unknown>;
  return {
    physical: mergeBranch(s.physical, base.physical),
    mental: mergeBranch(s.mental, base.mental),
    emotional: mergeBranch(s.emotional, base.emotional),
    spiritual: mergeBranch(s.spiritual, base.spiritual),
  };
}

function bonusIdsReached(branch: PowerStatBranch, newLevel: number): string[] {
  const ids: string[] = [];
  const tiers: { need: number; tag: string }[] = [
    { need: 2, tag: 'tier_2' },
    { need: 5, tag: 'tier_5' },
    { need: 10, tag: 'tier_10' },
    { need: 15, tag: 'tier_15' },
    { need: 20, tag: 'tier_20' },
  ];
  for (const { need, tag } of tiers) {
    if (newLevel >= need) ids.push(`${branch}_${tag}`);
  }
  return ids;
}

export function applyPowerXpToBranchPure(branch: PowerStatBranchState, amount: number, statKey: PowerStatBranch): PowerStatBranchState {
  if (amount <= 0) return { ...branch };
  let level = branch.level;
  let xp = branch.xp + amount;
  let totalEarned = branch.totalEarned + amount;
  let xpToNext = branch.xpToNextLevel > 0 ? branch.xpToNextLevel : powerStatXpRequiredForLevel(level);
  const bonusSet = new Set(branch.bonusesUnlocked);

  while (level < POWER_STAT_MAX_LEVEL && xp >= xpToNext) {
    xp -= xpToNext;
    level += 1;
    xpToNext = powerStatXpRequiredForLevel(level);
    for (const id of bonusIdsReached(statKey, level)) bonusSet.add(id);
  }

  return {
    level,
    xp,
    xpToNextLevel: xpToNext,
    totalEarned,
    bonusesUnlocked: Array.from(bonusSet).sort(),
  };
}

/**
 * Map Live Event / activity type to the Power stat that should receive XP.
 * Battle Royale → Physical, Quiz → Mental, Reflection → Emotional, Goals → Spiritual.
 */
/** Maps a live event / activity key to the Power stat it progresses. Unknown values default to Physical. */
export function getPowerTypeForEvent(eventType: string): PowerStatBranch {
  switch (eventType as LiveEventPowerSourceType) {
    case 'battle_royale':
    case 'team_battle_royale':
      return 'physical';
    case 'quiz':
      return 'mental';
    case 'reflection':
      return 'emotional';
    case 'goal_setting':
    case 'goal_completion':
      return 'spiritual';
    case 'class_flow':
    case 'neutral_flow':
    default:
      return 'physical';
  }
}

function liveModeToPowerSource(mode: string | undefined): LiveEventPowerSourceType {
  switch (mode) {
    case 'battle_royale':
      return 'battle_royale';
    case 'quiz':
      return 'quiz';
    case 'reflection':
      return 'reflection';
    case 'goal_setting':
      return 'goal_setting';
    case 'goal_completion':
      return 'goal_completion';
    case 'class_flow':
      return 'class_flow';
    case 'neutral_flow':
      return 'neutral_flow';
    default:
      return 'neutral_flow';
  }
}

export interface SessionPowerXpComputationInput {
  liveEventMode: string | undefined;
  stats: SessionStats;
  correctAnswers: number;
  leaderboardScore: number;
  rankByScore: number;
  totalRanked: number;
  quizPlacementPp: number;
  quizGameMode?: string;
}

export function computeSessionEndPowerXp(input: SessionPowerXpComputationInput): { branch: PowerStatBranch; amount: number } {
  const mode = liveModeToPowerSource(input.liveEventMode);
  const branch = getPowerTypeForEvent(mode);
  const s = input.stats;
  const elim = s.eliminations || 0;
  const part = s.participationEarned || 0;
  const correct = Math.max(0, input.correctAnswers);
  const survivor = !s.isEliminated;
  const streak = Math.min(s.consecutiveParticipationAwards ?? 0, 12);
  const score = Math.max(0, input.leaderboardScore);
  const rank = input.rankByScore > 0 ? input.rankByScore : 999;
  const isBattleQuiz =
    input.quizGameMode === 'battle_royale' || input.quizGameMode === 'team_battle_royale';

  let amount = 0;

  if (branch === 'physical') {
    amount += correct * 8;
    amount += elim * 18;
    amount += Math.floor(part * 4);
    if (survivor && (isBattleQuiz || input.liveEventMode === 'battle_royale')) amount += 22;
    amount += streak * 3;
    if (isBattleQuiz && rank === 1) amount += 40;
    else if (isBattleQuiz && rank <= 3) amount += 24;
    else if (isBattleQuiz && rank <= 5) amount += 12;
  } else if (branch === 'mental') {
    amount += correct * 12;
    amount += Math.min(80, Math.floor(score / 8));
    amount += Math.floor(part * 3);
    if (rank === 1) amount += 45;
    else if (rank <= 3) amount += 30;
    else if (rank <= 5) amount += 20;
    else if (rank <= 10) amount += 12;
    if (input.quizPlacementPp > 0) amount += 18;
  } else if (branch === 'emotional') {
    // Emotional bulk XP is granted on reflection submit. Session end adds participation-only slice.
    amount += Math.floor(part * 10);
  } else {
    amount += 24;
    amount += Math.floor(part * 8);
  }

  amount = Math.max(0, Math.min(500, Math.round(amount)));
  const modeNorm = liveModeToPowerSource(input.liveEventMode);
  const skipSessionMinForReflectionEmotional =
    branch === 'emotional' && (modeNorm === 'reflection' || input.liveEventMode === 'reflection');
  if (!skipSessionMinForReflectionEmotional) {
    const floorXp = LIVE_EVENT_MIN_STAT_XP_AT_SESSION_END[branch];
    amount = Math.max(amount, floorXp);
  }
  amount = Math.min(500, amount);
  return { branch, amount };
}

/**
 * High-level reward hint. Prefer `computeSessionEndPowerXp` inside `finalizeSessionStats` for live sessions.
 */
export function calculateLiveEventStatReward(params: {
  eventType: string;
  success: boolean;
  performanceData?: SessionPowerXpComputationInput;
}): { powerType: PowerStatBranch | null; amount: number } {
  if (!params.success) return { powerType: null, amount: 0 };
  if (!params.performanceData) {
    const src = liveModeToPowerSource(params.eventType);
    const branch = getPowerTypeForEvent(src);
    return { powerType: branch, amount: LIVE_EVENT_MIN_STAT_XP_AT_SESSION_END[branch] };
  }
  const { branch, amount } = computeSessionEndPowerXp(params.performanceData);
  return { powerType: branch, amount };
}

/** Persist XP to students/{uid}.stats — returns amount actually applied (same as input if success). */
export async function awardPowerStatXp(
  uid: string,
  branch: PowerStatBranch,
  amount: number,
  source?: string,
  metadata?: Record<string, unknown>
): Promise<number> {
  if (!uid || amount <= 0) return 0;
  const studentRef = doc(db, 'students', uid);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(studentRef);
      if (!snap.exists()) {
        console.warn(`[STAT REWARD] skipped — students/${uid} does not exist (${branch} +${amount})`);
        return;
      }
      const data = snap.data();
      const statsRoot = normalizePlayerPowerStats(data?.stats);
      const prev = statsRoot[branch];
      const next = applyPowerXpToBranchPure(prev, amount, branch);
      statsRoot[branch] = next;
      tx.update(studentRef, {
        stats: statsRoot,
        updatedAt: serverTimestamp(),
      });
    });
    const meta = metadata && Object.keys(metadata).length ? ` ${JSON.stringify(metadata)}` : '';
    console.info(
      `[STAT REWARD] +${amount} ${branch} Power XP → ${uid}${source ? ` (${source})` : ''}${meta}`
    );
    return amount;
  } catch (e) {
    console.warn(`[STAT REWARD] FAILED +${amount} ${branch} for ${uid}:`, e);
    return 0;
  }
}

/** Award XP split across branches (e.g. session summary). */
export async function awardLiveEventPowerGain(uid: string, gain: LiveEventPowerGain): Promise<void> {
  const entries: [PowerStatBranch, number][] = [
    ['physical', gain.physical ?? 0],
    ['mental', gain.mental ?? 0],
    ['emotional', gain.emotional ?? 0],
    ['spiritual', gain.spiritual ?? 0],
  ];
  for (const [b, amt] of entries) {
    if (amt > 0) await awardPowerStatXp(uid, b, amt, 'live_event_session_gain');
  }
}

/** Quiz correct-answer drip XP (during event). */
/** Optional mid-event drip (disabled by default — session end grants aggregate XP to avoid double-counting). */
export async function awardPowerXpForLiveQuizCorrectAnswer(
  sessionId: string,
  uid: string,
  opts: { gameMode: string; pointsAwarded: number; speedRatio: number }
): Promise<void> {
  if (process.env.REACT_APP_LIVE_EVENT_POWER_DRIP !== 'true') return;
  const roomRef = doc(db, 'inSessionRooms', sessionId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) return;
  const liveEventMode = roomSnap.data()?.liveEventMode as string | undefined;
  const isBattle = opts.gameMode === 'battle_royale' || opts.gameMode === 'team_battle_royale';
  let branch: PowerStatBranch;
  if (liveEventMode === 'quiz' && !isBattle) branch = 'mental';
  else if (liveEventMode === 'battle_royale' || isBattle) branch = 'physical';
  else branch = getPowerTypeForEvent(liveModeToPowerSource(liveEventMode));

  let amount = 6;
  if (opts.speedRatio >= 0.85) amount += 4;
  if (opts.speedRatio >= 0.95) amount += 3;
  if (isBattle && opts.pointsAwarded > 0) amount += Math.min(8, Math.floor(opts.pointsAwarded / 15));
  amount = Math.min(35, amount);
  await awardPowerStatXp(uid, branch, amount, 'live_quiz_correct_drip', {
    sessionId,
    gameMode: opts.gameMode,
  });
}

export async function awardPowerXpForElimination(eliminatorId: string, sessionId: string): Promise<void> {
  if (process.env.REACT_APP_LIVE_EVENT_POWER_DRIP !== 'true') return;
  const roomRef = doc(db, 'inSessionRooms', sessionId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) return;
  const mode = roomSnap.data()?.liveEventMode as string | undefined;
  if (mode !== 'battle_royale') return;
  await awardPowerStatXp(eliminatorId, 'physical', 14, 'live_event_elimination_drip', { sessionId });
}

export async function awardPowerXpForReflectionSubmission(
  uid: string,
  textLength: number,
  opts?: { goalLinked?: boolean; qualityBonus?: boolean }
): Promise<void> {
  let amount = 15 + Math.min(40, Math.floor(textLength / 80));
  if (opts?.goalLinked) amount += 12;
  if (opts?.qualityBonus) amount += 18;
  amount = Math.min(120, amount);
  amount = Math.max(20, amount);
  const applied = await awardPowerStatXp(uid, 'emotional', amount, 'live_event_reflection_submit', {
    textLength,
    goalLinked: !!opts?.goalLinked,
  });
  if (applied > 0) {
    await awardBattlePassXpForDeployedSeason(uid, applied);
  }
}

export async function awardPowerXpForGoalAchievement(
  uid: string,
  kind: 'habit_completed' | 'assessment_applied' | 'story_goal',
  tier: 'class' | 'day' | 'three_day' | 'week' | 'default' = 'default'
): Promise<void> {
  const tierBonus =
    tier === 'week' ? 40 : tier === 'three_day' ? 28 : tier === 'day' ? 18 : tier === 'class' ? 12 : 0;
  const base =
    kind === 'habit_completed' ? 35 : kind === 'assessment_applied' ? 45 : kind === 'story_goal' ? 38 : 30;
  const amt = Math.min(200, Math.max(35, base + tierBonus));
  const applied = await awardPowerStatXp(uid, 'spiritual', amt, 'goal_completion', { kind, tier });
  if (applied > 0) {
    await awardBattlePassXpForDeployedSeason(uid, applied);
  }
}
