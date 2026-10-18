/**
 * Class Flow Sprint Points — pure calculation engine (no Firestore).
 *
 * Ledger separation (never double counted):
 *  - credit earned        : approved points per submission (completion data)
 *  - individual contribution : credit attributed to a player (team work split across contributors)
 *  - team total           : sum of member contributions (team work counted once per team)
 *  - rewards paid         : what the distribution mode pays out (individual reward + team reward ± sharing)
 */
import type {
  CfConfig,
  CfSprintAssignment,
  CfSubmission,
} from '../types/classFlowWork';
import { effectiveDistributionMode } from './classFlowConfig';

export const UNASSIGNED_TEAM_ID = '__unassigned';

export interface CfRewardTeam {
  id: string;
  memberIds: string[];
}

export interface CfRewardInput {
  config: CfConfig;
  assignments: CfSprintAssignment[];
  submissions: CfSubmission[];
  /** Players present for this sprint (eligible for team rewards unless excluded). */
  participantIds: string[];
  teams: CfRewardTeam[];
  /** Facilitator exclusions from team rewards / sharing (e.g. absent). */
  excludedIds?: string[];
  /** Approved share percentage per team id (0–100, already validated by the facilitator). */
  sharingPercentByTeam?: Record<string, number>;
}

export interface CfPlayerRewardBreakdown {
  playerId: string;
  teamId: string | null;
  approvedWorkPoints: number;
  extraPoints: number;
  individualContribution: number;
  teamTotal: number;
  individualReward: number;
  teamReward: number;
  sharedIn: number;
  sharedOut: number;
  totalPoints: number;
  pp: number;
  xp: number;
}

export interface CfTeamRewardSummary {
  teamId: string;
  memberIds: string[];
  eligibleIds: string[];
  teamTotal: number;
  teamRewardPerMember: number;
  sharingPercent: number;
  sharedPool: number;
  shareRecipients: string[];
}

export interface CfPoolStats {
  totalBase: number;
  approvedBase: number;
  remainingBase: number;
  extraApproved: number;
  finalDistributed: number;
}

export interface CfRewardResult {
  players: Record<string, CfPlayerRewardBreakdown>;
  teams: Record<string, CfTeamRewardSummary>;
  pool: CfPoolStats;
  /** Submission ids ignored because a teammate's copy of the same team assignment already counted. */
  duplicateTeamSubmissionIds: string[];
}

/** Split `total` across ids; remainder goes one point at a time in id order. Sum is exact. */
export function splitEvenly(total: number, ids: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  const sorted = Array.from(new Set(ids)).sort();
  if (!sorted.length || total <= 0) return out;
  const t = Math.floor(total);
  const base = Math.floor(t / sorted.length);
  let rem = t - base * sorted.length;
  for (const id of sorted) {
    out[id] = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem -= 1;
  }
  return out;
}

function teamIndex(teams: CfRewardTeam[], participants: Set<string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of teams) {
    if (t.id === UNASSIGNED_TEAM_ID) continue;
    for (const uid of t.memberIds) if (participants.has(uid) && !m.has(uid)) m.set(uid, t.id);
  }
  return m;
}

/** Effective multiplier for one player given their approved multiplier tasks. */
function combinedMultiplier(values: number[], allowStacking: boolean, cap: number): number {
  if (!values.length) return 1;
  const m = allowStacking ? values.reduce((a, v) => a * v, 1) : Math.max(...values);
  return Math.max(1, Math.min(cap, m));
}

export function computeSprintRewards(input: CfRewardInput): CfRewardResult {
  const { config, assignments, submissions } = input;
  const participants = new Set(input.participantIds);
  const excluded = new Set(input.excludedIds || []);
  const teamMode = config.teamModeEnabled;
  const mode = effectiveDistributionMode(config);
  const byAssignment = new Map(assignments.map((a) => [a.assignmentId, a]));
  const teamOf = teamMode ? teamIndex(input.teams, participants) : new Map<string, string>();
  const groupKey = (uid: string) => (teamMode ? teamOf.get(uid) ?? `${UNASSIGNED_TEAM_ID}:${uid}` : `solo:${uid}`);

  const approved = submissions.filter((s) => {
    if (s.status !== 'approved') return false;
    const a = byAssignment.get(s.assignmentId);
    if (!a) return false;
    return s.approvedPoints > 0 || (a.isExtraCredit && a.bonus.type === 'multiplier');
  });

  const base: Record<string, number> = {};
  const baseByAssignment: Record<string, Record<string, number>> = {};
  const addBase = (uid: string, assignmentId: string, pts: number) => {
    base[uid] = (base[uid] || 0) + pts;
    baseByAssignment[uid] = baseByAssignment[uid] || {};
    baseByAssignment[uid][assignmentId] = (baseByAssignment[uid][assignmentId] || 0) + pts;
  };

  // Team work counts once per group: keep the highest approved copy, flag the rest.
  const duplicateTeamSubmissionIds: string[] = [];
  const teamBest = new Map<string, CfSubmission>();
  let approvedBase = 0;
  let extraApproved = 0;

  for (const s of approved) {
    const a = byAssignment.get(s.assignmentId)!;
    if (a.isExtraCredit) continue;
    if (a.workType === 'team') {
      const key = `${groupKey(s.playerId)}|${s.assignmentId}`;
      const prev = teamBest.get(key);
      if (!prev || s.approvedPoints > prev.approvedPoints) {
        if (prev) duplicateTeamSubmissionIds.push(prev.id);
        teamBest.set(key, s);
      } else {
        duplicateTeamSubmissionIds.push(s.id);
      }
    } else {
      addBase(s.playerId, s.assignmentId, s.approvedPoints);
      approvedBase += s.approvedPoints;
    }
  }
  teamBest.forEach((s) => {
    const group = groupKey(s.playerId);
    const contributors = (s.contributorIds?.length ? s.contributorIds : [s.playerId]).filter(
      (uid) => uid === s.playerId || (teamMode && groupKey(uid) === group)
    );
    const split = splitEvenly(s.approvedPoints, contributors.length ? contributors : [s.playerId]);
    Object.entries(split).forEach(([uid, pts]) => addBase(uid, s.assignmentId, pts));
    approvedBase += s.approvedPoints;
  });

  // Extra credit — individual scope only.
  const extra: Record<string, number> = {};
  const { maxBonusPerPlayer, allowStacking, maxMultiplier } = config.bonusLimits;
  if (config.extraCreditEnabled) {
    const perPlayer = new Map<string, { flats: number[]; multipliers: Map<string, number[]> }>();
    for (const s of approved) {
      const a = byAssignment.get(s.assignmentId)!;
      if (!a.isExtraCredit) continue;
      const rec = perPlayer.get(s.playerId) || { flats: [] as number[], multipliers: new Map<string, number[]>() };
      if (s.approvedPoints > 0) rec.flats.push(s.approvedPoints);
      if (a.bonus.type === 'multiplier' && a.bonus.value > 1) {
        const target = a.bonus.targetAssignmentId || '*';
        rec.multipliers.set(target, [...(rec.multipliers.get(target) || []), a.bonus.value]);
      }
      perPlayer.set(s.playerId, rec);
    }
    perPlayer.forEach((rec, uid) => {
      const bonuses: number[] = [...rec.flats];
      rec.multipliers.forEach((values, target) => {
        const m = combinedMultiplier(values, allowStacking, maxMultiplier);
        const scoped = target === '*' ? base[uid] || 0 : baseByAssignment[uid]?.[target] || 0;
        const gain = Math.floor(scoped * (m - 1));
        if (gain > 0) bonuses.push(gain);
      });
      let total = allowStacking ? bonuses.reduce((x, y) => x + y, 0) : bonuses.length ? Math.max(...bonuses) : 0;
      if (maxBonusPerPlayer > 0) total = Math.min(total, maxBonusPerPlayer);
      if (total > 0) {
        extra[uid] = total;
        extraApproved += total;
      }
    });
  }

  // Everyone who either participated or earned credit gets a row.
  const everyone = new Set<string>([...Array.from(participants), ...Object.keys(base), ...Object.keys(extra)]);
  const players: Record<string, CfPlayerRewardBreakdown> = {};
  everyone.forEach((uid) => {
    const contribution = base[uid] || 0;
    players[uid] = {
      playerId: uid,
      teamId: teamMode ? teamOf.get(uid) ?? UNASSIGNED_TEAM_ID : null,
      approvedWorkPoints: contribution,
      extraPoints: extra[uid] || 0,
      individualContribution: contribution,
      teamTotal: 0,
      individualReward: 0,
      teamReward: 0,
      sharedIn: 0,
      sharedOut: 0,
      totalPoints: 0,
      pp: 0,
      xp: 0,
    };
  });

  const teams: Record<string, CfTeamRewardSummary> = {};
  if (teamMode) {
    for (const t of input.teams) {
      if (t.id === UNASSIGNED_TEAM_ID) continue;
      const members = t.memberIds.filter((uid) => players[uid] && teamOf.get(uid) === t.id);
      const eligible = members.filter((uid) => participants.has(uid) && !excluded.has(uid));
      const teamTotal = members.reduce(
        (sum, uid) =>
          sum + players[uid].individualContribution + (config.bonusLimits.extraCountsToTeam ? players[uid].extraPoints : 0),
        0
      );
      let perMember = 0;
      if (eligible.length && teamTotal > 0) {
        if (mode === 'equal') perMember = Math.floor(teamTotal / eligible.length);
        else if (mode === 'hybrid')
          perMember = Math.floor((teamTotal * config.hybridTeamPercent) / 100 / eligible.length);
      }
      teams[t.id] = {
        teamId: t.id,
        memberIds: members,
        eligibleIds: eligible,
        teamTotal,
        teamRewardPerMember: perMember,
        sharingPercent: 0,
        sharedPool: 0,
        shareRecipients: [],
      };
      for (const uid of members) {
        players[uid].teamTotal = teamTotal;
        if (eligible.includes(uid)) players[uid].teamReward = perMember;
      }
    }
  }

  // Contribution is paid individually except in equal mode. In equal mode, extra that already
  // flows into the team total is not paid a second time individually.
  Object.values(players).forEach((p) => {
    if (mode === 'equal' && p.teamId === UNASSIGNED_TEAM_ID) {
      p.individualReward = p.individualContribution + p.extraPoints;
    } else if (mode === 'equal') {
      p.individualReward = config.bonusLimits.extraCountsToTeam ? 0 : p.extraPoints;
    } else {
      p.individualReward = p.individualContribution + p.extraPoints;
    }
  });

  // Credit sharing: only the transferable contribution portion moves; team rewards are untouched.
  if (teamMode && config.teamCreditSharingEnabled && mode !== 'equal') {
    const maxPct = config.sharing.maxPercent;
    Object.values(teams).forEach((t) => {
      const pct = Math.max(0, Math.min(maxPct, Math.floor(input.sharingPercentByTeam?.[t.teamId] ?? 0)));
      if (pct <= 0) return;
      const recipients = t.eligibleIds.filter((uid) => players[uid].approvedWorkPoints === 0);
      const givers = t.memberIds.filter((uid) => players[uid].individualContribution > 0);
      if (!recipients.length || !givers.length) return;
      let pool = 0;
      for (const uid of givers) {
        const give = Math.floor((players[uid].individualContribution * pct) / 100);
        if (give <= 0) continue;
        players[uid].sharedOut += give;
        players[uid].individualReward -= give;
        pool += give;
      }
      const split = splitEvenly(pool, recipients);
      Object.entries(split).forEach(([uid, pts]) => {
        players[uid].sharedIn += pts;
        players[uid].individualReward += pts;
      });
      t.sharingPercent = pct;
      t.sharedPool = pool;
      t.shareRecipients = Object.keys(split);
    });
  }

  let finalDistributed = 0;
  Object.values(players).forEach((p) => {
    p.totalPoints = Math.max(0, p.individualReward + p.teamReward);
    p.pp = Math.floor(p.totalPoints * config.ppPerPoint);
    p.xp = Math.floor(p.totalPoints * config.xpPerPoint);
    finalDistributed += p.totalPoints;
  });

  // Pool: individual work available to each participant; team work once per group.
  const groups = new Set(Array.from(participants).map(groupKey));
  let totalBase = 0;
  for (const a of assignments) {
    if (a.isExtraCredit) continue;
    totalBase += a.points * (a.workType === 'team' ? groups.size : participants.size);
  }

  return {
    players,
    teams,
    pool: {
      totalBase,
      approvedBase,
      remainingBase: Math.max(0, totalBase - approvedBase),
      extraApproved,
      finalDistributed,
    },
    duplicateTeamSubmissionIds,
  };
}

/** Majority vote: the most-voted percentage once more than half of the voters agree; else null. */
export function majorityShareVote(votes: Record<string, number>, voterIds: string[]): number | null {
  const eligible = new Set(voterIds);
  const counts = new Map<number, number>();
  Object.entries(votes).forEach(([uid, pct]) => {
    if (!eligible.has(uid)) return;
    counts.set(pct, (counts.get(pct) || 0) + 1);
  });
  const needed = Math.floor(eligible.size / 2) + 1;
  let winner: number | null = null;
  counts.forEach((c, pct) => {
    if (c >= needed && (winner == null || pct < winner)) winner = pct;
  });
  return winner;
}
