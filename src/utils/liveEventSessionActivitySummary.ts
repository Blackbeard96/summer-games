/**
 * Builds {@link SessionActivitySummary} for Live Event end-of-session UI.
 * Sprints: parsed from room battleLog (Class Flow sprint messages).
 * Quiz: from quiz session doc + placement maps at finalize time.
 */

import type {
  SessionActivitySummary,
  SessionQuizActivitySummary,
  SessionQuizPlayerResultSummary,
  SessionSprintActivitySummary,
  SessionStats,
} from '../types/inSessionStats';
import { parseClassFlowSprint } from './liveEventSprintService';

const RE_SPRINT_STARTED = /^🏃 Sprint started: "([^"]+)"/;
const RE_SPRINT_CLOSED = /^🏁 Sprint window closed: "([^"]+)"/;
const RE_SPRINT_INDIVIDUAL = /^🏃 (.+?) earned sprint rewards for "([^"]+)"/;
const RE_SPRINT_BULK = /^🏃 Sprint rewards granted: (\d+) player\(s\) earned "([^"]+)"/;
const RE_SPRINT_PENALTY = /Incomplete sprint penalty:.*?for (\d+) player\(s\) on "([^"]+)"/;

function formatGameModeLabel(mode?: string): string | undefined {
  if (!mode) return undefined;
  if (mode === 'regular') return 'Standard quiz';
  if (mode === 'battle_royale') return 'Battle royale quiz';
  if (mode === 'team_battle_royale') return 'Team battle royale quiz';
  return mode.replace(/_/g, ' ');
}

/** Short label for summary header (no dependency on LiveEvents roster fields). */
export function formatLiveEventModeForSummary(
  mode?: string,
  neutralFlowEnergyType?: string
): string {
  if (!mode || !String(mode).trim()) return 'Classic Live Event';
  const m = String(mode).replace(/_/g, ' ');
  if (mode === 'neutral_flow' && neutralFlowEnergyType) {
    return `${m} (${neutralFlowEnergyType})`;
  }
  return m;
}

type SprintBucket = {
  title: string;
  completedNames: string[];
  bulkCompletionsAnnounced?: number;
  incompletePenaltyPlayerCount?: number;
  closedWindow?: boolean;
};

function findLastBucketForTitle(buckets: SprintBucket[], title: string): SprintBucket | undefined {
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (buckets[i].title === title) return buckets[i];
  }
  return undefined;
}

/**
 * Parse Class Flow sprint-related lines from the session battle log (chronological array).
 */
export function parseSprintSummariesFromBattleLog(battleLog: string[]): SessionSprintActivitySummary[] {
  const buckets: SprintBucket[] = [];

  for (const line of battleLog) {
    if (typeof line !== 'string') continue;

    const started = line.match(RE_SPRINT_STARTED);
    if (started?.[1]) {
      buckets.push({ title: started[1], completedNames: [] });
      continue;
    }

    const closed = line.match(RE_SPRINT_CLOSED);
    if (closed?.[1]) {
      const b = findLastBucketForTitle(buckets, closed[1]);
      if (b) b.closedWindow = true;
      continue;
    }

    const ind = line.match(RE_SPRINT_INDIVIDUAL);
    if (ind?.[1] && ind[2]) {
      const name = ind[1].trim();
      const title = ind[2];
      const b = findLastBucketForTitle(buckets, title);
      if (b) {
        if (!b.completedNames.includes(name)) b.completedNames.push(name);
      } else {
        buckets.push({ title, completedNames: [name] });
      }
      continue;
    }

    const bulk = line.match(RE_SPRINT_BULK);
    if (bulk?.[1] && bulk[2]) {
      const n = Math.max(0, parseInt(bulk[1], 10) || 0);
      const title = bulk[2];
      const b = findLastBucketForTitle(buckets, title);
      if (b) b.bulkCompletionsAnnounced = n;
      else buckets.push({ title, completedNames: [], bulkCompletionsAnnounced: n });
      continue;
    }

    const pen = line.match(RE_SPRINT_PENALTY);
    if (pen?.[1] && pen[2]) {
      const n = Math.max(0, parseInt(pen[1], 10) || 0);
      const title = pen[2];
      const b = findLastBucketForTitle(buckets, title);
      if (b) b.incompletePenaltyPlayerCount = n;
      else buckets.push({ title, completedNames: [], incompletePenaltyPlayerCount: n });
    }
  }

  return buckets.map((b) => ({
    title: b.title,
    completedPlayerNames: [...b.completedNames],
    bulkCompletionsAnnounced: b.bulkCompletionsAnnounced,
    incompletePenaltyPlayerCount: b.incompletePenaltyPlayerCount,
    sprintWindowClosed: b.closedWindow,
  }));
}

function buildQuizActivitySummary(args: {
  statsMap: Record<string, SessionStats>;
  quizTitle?: string;
  gameMode?: string;
  correctByPlayer: Record<string, number>;
  leaderboard: Record<string, number>;
  quizPpByPlayer: Record<string, number>;
  liveEventQuizRankByPlayer?: Record<string, number>;
}): SessionQuizActivitySummary | null {
  const uids = new Set<string>();
  Object.keys(args.statsMap).forEach((u) => uids.add(u));
  Object.keys(args.leaderboard).forEach((u) => uids.add(u));
  Object.keys(args.quizPpByPlayer).forEach((u) => uids.add(u));
  Object.keys(args.correctByPlayer).forEach((u) => uids.add(u));

  const hasSignal =
    Object.keys(args.leaderboard).length > 0 ||
    Object.keys(args.quizPpByPlayer).length > 0 ||
    Object.keys(args.correctByPlayer).some((k) => (args.correctByPlayer[k] ?? 0) > 0);

  if (!hasSignal && !args.quizTitle) return null;

  const uidList = Array.from(uids);
  const scores = uidList.map((uid) => args.leaderboard[uid] ?? 0);
  const maxLeaderboardScore = scores.length > 0 ? Math.max(0, ...scores) : 0;

  const players: SessionQuizPlayerResultSummary[] = uidList
    .map((playerId) => {
      const st = args.statsMap[playerId];
      return {
        playerId,
        playerName: st?.playerName || 'Player',
        leaderboardScore: args.leaderboard[playerId] ?? 0,
        correctAnswers: args.correctByPlayer[playerId] ?? 0,
        rankByScore: args.liveEventQuizRankByPlayer?.[playerId],
        quizPp: args.quizPpByPlayer[playerId] ?? 0,
      };
    })
    .filter(
      (p) =>
        p.leaderboardScore > 0 ||
        p.correctAnswers > 0 ||
        p.quizPp > 0 ||
        (p.rankByScore !== undefined && p.rankByScore > 0)
    )
    .sort((a, b) => {
      const ra = a.rankByScore ?? 9999;
      const rb = b.rankByScore ?? 9999;
      if (ra !== rb) return ra - rb;
      return (b.leaderboardScore || 0) - (a.leaderboardScore || 0);
    });

  if (players.length === 0 && !args.quizTitle && maxLeaderboardScore === 0) return null;

  return {
    quizTitle: args.quizTitle,
    gameMode: args.gameMode,
    gameModeLabel: formatGameModeLabel(args.gameMode),
    maxLeaderboardScore: maxLeaderboardScore > 0 ? maxLeaderboardScore : undefined,
    players,
  };
}

export function buildSessionActivitySummary(args: {
  battleLog: unknown;
  liveEventMode?: string;
  neutralFlowEnergyType?: string;
  classFlowSprintRaw: unknown;
  sessionPlayerCount: number;
  statsMap: Record<string, SessionStats>;
  quizTitle?: string;
  quizGameMode?: string;
  correctByPlayer: Record<string, number>;
  leaderboard: Record<string, number>;
  quizPpByPlayer: Record<string, number>;
  liveEventQuizRankByPlayer?: Record<string, number>;
}): SessionActivitySummary {
  const lines = Array.isArray(args.battleLog) ? (args.battleLog as string[]).filter((x) => typeof x === 'string') : [];
  const sprints = parseSprintSummariesFromBattleLog(lines);

  const quiz = buildQuizActivitySummary({
    statsMap: args.statsMap,
    quizTitle: args.quizTitle,
    gameMode: args.quizGameMode,
    correctByPlayer: args.correctByPlayer,
    leaderboard: args.leaderboard,
    quizPpByPlayer: args.quizPpByPlayer,
    liveEventQuizRankByPlayer: args.liveEventQuizRankByPlayer,
  });

  const sprint = parseClassFlowSprint(args.classFlowSprintRaw);
  let pendingSprintAtEnd: SessionActivitySummary['pendingSprintAtEnd'];
  if (sprint) {
    pendingSprintAtEnd = {
      title: sprint.title,
      status: sprint.status,
      markedCompleteCount: (sprint.markedCompleteUids || []).length,
      rewardsGrantedCount: (sprint.rewardsGrantedUids || []).length,
      sessionPlayerCount: Math.max(0, args.sessionPlayerCount),
    };
  }

  return {
    sessionModeLabel: formatLiveEventModeForSummary(args.liveEventMode, args.neutralFlowEnergyType),
    sessionMode: args.liveEventMode,
    sprints,
    quiz,
    pendingSprintAtEnd,
  };
}
