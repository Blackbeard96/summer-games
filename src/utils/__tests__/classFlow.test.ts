import {
  DEFAULT_CF_CONFIG,
  effectiveDistributionMode,
  extendedEndsAtMs,
  formatClock,
  parseCfConfig,
  resumedEndsAtMs,
  sprintPhase,
  sprintRemainingMs,
  submissionsOpen,
} from '../classFlowConfig';
import { computeSprintRewards, majorityShareVote, splitEvenly, UNASSIGNED_TEAM_ID } from '../classFlowRewards';
import { buildTeams, formatTeamTag } from '../classFlowTeams';
import { computeClassFlowAnalytics } from '../classFlowAnalytics';
import type { CfConfig, CfSprintAssignment, CfSubmission } from '../../types/classFlowWork';

const cfg = (over: Partial<CfConfig> = {}): CfConfig => ({
  ...DEFAULT_CF_CONFIG,
  workAssignmentsEnabled: true,
  ...over,
  bonusLimits: { ...DEFAULT_CF_CONFIG.bonusLimits, ...(over.bonusLimits || {}) },
  sharing: { ...DEFAULT_CF_CONFIG.sharing, ...(over.sharing || {}) },
});

const asg = (id: string, points: number, over: Partial<CfSprintAssignment> = {}): CfSprintAssignment => ({
  assignmentId: id,
  title: id,
  description: '',
  instructions: '',
  submissionRequirements: '',
  workType: 'individual',
  points,
  submissionMethods: ['confirm'],
  evidenceRequired: false,
  isExtraCredit: false,
  bonus: { type: 'none', value: 0, targetAssignmentId: null },
  ...over,
});

let seq = 0;
const sub = (playerId: string, assignmentId: string, approvedPoints: number, over: Partial<CfSubmission> = {}): CfSubmission => ({
  id: `s${++seq}`,
  sprintId: 'sp1',
  assignmentId,
  assignmentTitle: assignmentId,
  playerId,
  playerName: playerId,
  teamId: null,
  teamName: null,
  workType: 'individual',
  isExtraCredit: false,
  method: 'confirm',
  evidence: {},
  contributorIds: [playerId],
  requestedPoints: approvedPoints,
  status: 'approved',
  approvedPoints,
  reviewedBy: 'host',
  reviewedAt: 2000,
  feedback: null,
  submittedAt: 1000,
  revisionCount: 0,
  history: [],
  ...over,
});

describe('Class Flow timer math', () => {
  const t = { status: 'live' as const, startedAtMs: 0, endsAtMs: 60_000, pausedAtMs: null };

  it('counts down from shared timestamps', () => {
    expect(sprintRemainingMs(t, 15_000)).toBe(45_000);
    expect(sprintPhase(t, 15_000)).toBe('running');
    expect(sprintPhase(t, 61_000)).toBe('expired');
    expect(sprintRemainingMs(t, 61_000)).toBe(0);
  });

  it('freezes while paused and pushes endsAt forward on resume', () => {
    const paused = { ...t, pausedAtMs: 20_000 };
    expect(sprintRemainingMs(paused, 50_000)).toBe(40_000);
    expect(sprintPhase(paused, 50_000)).toBe('paused');
    const r = resumedEndsAtMs(paused, 50_000);
    expect(r).toEqual({ endsAtMs: 90_000, pausedMs: 30_000 });
    expect(sprintRemainingMs({ ...t, endsAtMs: r.endsAtMs }, 50_000)).toBe(40_000);
  });

  it('extends from endsAt, or from now if already expired', () => {
    expect(extendedEndsAtMs(t, 10_000, 120)).toBe(180_000);
    expect(extendedEndsAtMs(t, 100_000, 60)).toBe(160_000);
  });

  it('opens submissions only while live unless late submissions are accepted', () => {
    expect(submissionsOpen(t, 10_000, false)).toBe(true);
    expect(submissionsOpen(t, 70_000, false)).toBe(false);
    expect(submissionsOpen(t, 70_000, true)).toBe(true);
    expect(submissionsOpen({ ...t, status: 'closed' }, 10_000, false)).toBe(false);
    expect(submissionsOpen(null, 0, true)).toBe(false);
  });

  it('formats clocks', () => {
    expect(formatClock(65_000)).toBe('1:05');
    expect(formatClock(3_725_000)).toBe('1:02:05');
    expect(formatClock(-5)).toBe('0:00');
  });
});

describe('Class Flow config', () => {
  it('defaults every feature flag off so old sessions are unchanged', () => {
    const c = parseCfConfig(undefined);
    expect(c.workAssignmentsEnabled).toBe(false);
    expect(c.teamModeEnabled).toBe(false);
    expect(c.teamCreditSharingEnabled).toBe(false);
    expect(c.extraCreditEnabled).toBe(false);
    expect(c.expandedTimerEnabled).toBe(false);
    expect(c.contributionRewardsEnabled).toBe(false);
    expect(c.ppPerPoint).toBe(0);
    expect(c.xpPerPoint).toBe(0);
  });

  it('clamps unsafe values and caps share options at maxPercent', () => {
    const c = parseCfConfig({ ppPerPoint: 9999, sharing: { maxPercent: 25, options: [10, 50] }, hybridTeamPercent: -4 });
    expect(c.ppPerPoint).toBe(100);
    expect(c.hybridTeamPercent).toBe(0);
    expect(c.sharing.options).toEqual([0, 10, 25]);
  });

  it('resolves the effective distribution mode', () => {
    expect(effectiveDistributionMode(cfg())).toBe('individual');
    expect(effectiveDistributionMode(cfg({ teamModeEnabled: true }))).toBe('equal');
    expect(effectiveDistributionMode(cfg({ teamModeEnabled: true, contributionRewardsEnabled: true }))).toBe('hybrid');
  });
});

describe('Class Flow rewards', () => {
  const teams = [{ id: 't1', memberIds: ['a', 'b', 'c', 'd', 'e'] }];

  it('splitEvenly conserves the total exactly', () => {
    const s = splitEvenly(10, ['x', 'y', 'z']);
    expect(Object.values(s).reduce((n, v) => n + v, 0)).toBe(10);
    expect(s).toEqual({ x: 4, y: 3, z: 3 });
  });

  it('pays individual credit only when team mode is off', () => {
    const r = computeSprintRewards({
      config: cfg(),
      assignments: [asg('w1', 100), asg('w2', 50)],
      submissions: [sub('a', 'w1', 100), sub('a', 'w2', 50), sub('b', 'w1', 100)],
      participantIds: ['a', 'b', 'c'],
      teams: [],
    });
    expect(r.players.a.totalPoints).toBe(150);
    expect(r.players.b.totalPoints).toBe(100);
    expect(r.players.c.totalPoints).toBe(0);
    expect(r.pool.totalBase).toBe(450);
    expect(r.pool.approvedBase).toBe(250);
    expect(r.pool.remainingBase).toBe(200);
  });

  it('ignores pending, rejected and revision submissions', () => {
    const r = computeSprintRewards({
      config: cfg(),
      assignments: [asg('w1', 100)],
      submissions: [
        sub('a', 'w1', 100, { status: 'submitted' }),
        sub('b', 'w1', 100, { status: 'rejected' }),
        sub('c', 'w1', 100, { status: 'revision_requested' }),
      ],
      participantIds: ['a', 'b', 'c'],
      teams: [],
    });
    expect(r.pool.approvedBase).toBe(0);
    expect(r.pool.finalDistributed).toBe(0);
  });

  it('matches the spec example in hybrid mode (individual +200, team +150)', () => {
    const r = computeSprintRewards({
      config: cfg({ teamModeEnabled: true, contributionRewardsEnabled: true, distributionMode: 'hybrid', hybridTeamPercent: 100 }),
      assignments: [asg('w1', 200), asg('w2', 150), asg('w3', 100)],
      submissions: [sub('a', 'w1', 200), sub('b', 'w1', 200), sub('c', 'w2', 150), sub('d', 'w3', 100), sub('e', 'w3', 100)],
      participantIds: ['a', 'b', 'c', 'd', 'e'],
      teams,
    });
    expect(r.teams.t1.teamTotal).toBe(750);
    expect(r.players.a.individualReward).toBe(200);
    expect(r.players.a.teamReward).toBe(150);
    expect(r.players.a.totalPoints).toBe(350);
  });

  it('equal mode splits the team total evenly and does not also pay contribution', () => {
    const r = computeSprintRewards({
      config: cfg({ teamModeEnabled: true, contributionRewardsEnabled: false }),
      assignments: [asg('w1', 300)],
      submissions: [sub('a', 'w1', 300)],
      participantIds: ['a', 'b', 'c'],
      teams: [{ id: 't1', memberIds: ['a', 'b', 'c'] }],
    });
    expect(r.players.a.totalPoints).toBe(100);
    expect(r.players.b.totalPoints).toBe(100);
    expect(r.pool.finalDistributed).toBe(300);
  });

  it('contribution mode pays only what each player earned', () => {
    const r = computeSprintRewards({
      config: cfg({ teamModeEnabled: true, contributionRewardsEnabled: true, distributionMode: 'contribution' }),
      assignments: [asg('w1', 300)],
      submissions: [sub('a', 'w1', 300)],
      participantIds: ['a', 'b'],
      teams: [{ id: 't1', memberIds: ['a', 'b'] }],
    });
    expect(r.players.a.totalPoints).toBe(300);
    expect(r.players.b.totalPoints).toBe(0);
  });

  it('counts a team assignment once per team and splits it across contributors', () => {
    const team = asg('tw', 90, { workType: 'team' });
    const r = computeSprintRewards({
      config: cfg({ teamModeEnabled: true, contributionRewardsEnabled: true, distributionMode: 'contribution' }),
      assignments: [team],
      submissions: [
        sub('a', 'tw', 90, { workType: 'team', contributorIds: ['a', 'b', 'c'] }),
        sub('b', 'tw', 60, { workType: 'team', contributorIds: ['b'] }),
      ],
      participantIds: ['a', 'b', 'c'],
      teams: [{ id: 't1', memberIds: ['a', 'b', 'c'] }],
    });
    expect(r.pool.approvedBase).toBe(90);
    expect(r.duplicateTeamSubmissionIds).toHaveLength(1);
    expect(r.players.a.individualContribution + r.players.b.individualContribution + r.players.c.individualContribution).toBe(90);
    expect(r.teams.t1.teamTotal).toBe(90);
  });

  it('applies flat extra credit non-stacking by default and caps it', () => {
    const r = computeSprintRewards({
      config: cfg({ extraCreditEnabled: true, bonusLimits: { maxBonusPerPlayer: 60, allowStacking: false, maxMultiplier: 1.5, extraCountsToTeam: false } }),
      assignments: [asg('w1', 100), asg('x1', 40, { isExtraCredit: true }), asg('x2', 50, { isExtraCredit: true })],
      submissions: [sub('a', 'w1', 100), sub('a', 'x1', 40, { isExtraCredit: true }), sub('a', 'x2', 50, { isExtraCredit: true })],
      participantIds: ['a'],
      teams: [],
    });
    expect(r.players.a.extraPoints).toBe(50);
    expect(r.players.a.totalPoints).toBe(150);

    const stacked = computeSprintRewards({
      config: cfg({ extraCreditEnabled: true, bonusLimits: { maxBonusPerPlayer: 60, allowStacking: true, maxMultiplier: 1.5, extraCountsToTeam: false } }),
      assignments: [asg('w1', 100), asg('x1', 40, { isExtraCredit: true }), asg('x2', 50, { isExtraCredit: true })],
      submissions: [sub('a', 'w1', 100), sub('a', 'x1', 40, { isExtraCredit: true }), sub('a', 'x2', 50, { isExtraCredit: true })],
      participantIds: ['a'],
      teams: [],
    });
    expect(stacked.players.a.extraPoints).toBe(60);
  });

  it('applies a multiplier only to the targeted assignment and caps it', () => {
    const r = computeSprintRewards({
      config: cfg({ extraCreditEnabled: true, bonusLimits: { maxBonusPerPlayer: 0, allowStacking: false, maxMultiplier: 1.5, extraCountsToTeam: false } }),
      assignments: [
        asg('w1', 100),
        asg('w2', 200),
        asg('x1', 0, { isExtraCredit: true, bonus: { type: 'multiplier', value: 3, targetAssignmentId: 'w1' } }),
      ],
      submissions: [sub('a', 'w1', 100), sub('a', 'w2', 200), sub('a', 'x1', 0, { isExtraCredit: true, approvedPoints: 0 })],
      participantIds: ['a'],
      teams: [],
    });
    // 100 × (1.5 − 1); w2 is untouched and the 3× request is capped at 1.5×
    expect(r.players.a.extraPoints).toBe(50);

    const r2 = computeSprintRewards({
      config: cfg({ extraCreditEnabled: true, bonusLimits: { maxBonusPerPlayer: 0, allowStacking: false, maxMultiplier: 1.5, extraCountsToTeam: false } }),
      assignments: [
        asg('w1', 100),
        asg('w2', 200),
        asg('x1', 1, { isExtraCredit: true, bonus: { type: 'multiplier', value: 3, targetAssignmentId: 'w1' } }),
      ],
      submissions: [sub('a', 'w1', 100), sub('a', 'w2', 200), sub('a', 'x1', 1, { isExtraCredit: true })],
      participantIds: ['a'],
      teams: [],
    });
    // max(flat 1, 100 × (1.5 − 1) = 50) with non-stacking
    expect(r2.players.a.extraPoints).toBe(50);
  });

  it('ignores extra credit when the flag is off', () => {
    const r = computeSprintRewards({
      config: cfg({ extraCreditEnabled: false }),
      assignments: [asg('x1', 40, { isExtraCredit: true })],
      submissions: [sub('a', 'x1', 40, { isExtraCredit: true })],
      participantIds: ['a'],
      teams: [],
    });
    expect(r.players.a.totalPoints).toBe(0);
  });

  it('shares only the transferable portion, conserves points, and never touches team rewards', () => {
    const base = {
      config: cfg({
        teamModeEnabled: true,
        contributionRewardsEnabled: true,
        distributionMode: 'hybrid' as const,
        hybridTeamPercent: 50,
        teamCreditSharingEnabled: true,
      }),
      assignments: [asg('w1', 200)],
      submissions: [sub('a', 'w1', 200), sub('b', 'w1', 200)],
      participantIds: ['a', 'b', 'c', 'd'],
      teams: [{ id: 't1', memberIds: ['a', 'b', 'c', 'd'] }],
    };
    const none = computeSprintRewards(base);
    const shared = computeSprintRewards({ ...base, sharingPercentByTeam: { t1: 25 } });
    expect(shared.players.a.sharedOut).toBe(50);
    expect(shared.players.c.sharedIn + shared.players.d.sharedIn).toBe(100);
    expect(shared.players.c.teamReward).toBe(none.players.c.teamReward);
    expect(shared.pool.finalDistributed).toBe(none.pool.finalDistributed);
    // Shared credit is not completion credit
    expect(shared.players.c.approvedWorkPoints).toBe(0);
  });

  it('caps sharing at maxPercent and skips excluded players', () => {
    const r = computeSprintRewards({
      config: cfg({ teamModeEnabled: true, contributionRewardsEnabled: true, distributionMode: 'contribution', teamCreditSharingEnabled: true }),
      assignments: [asg('w1', 100)],
      submissions: [sub('a', 'w1', 100)],
      participantIds: ['a', 'b', 'c'],
      teams: [{ id: 't1', memberIds: ['a', 'b', 'c'] }],
      excludedIds: ['c'],
      sharingPercentByTeam: { t1: 90 },
    });
    expect(r.players.a.sharedOut).toBe(25);
    expect(r.players.b.sharedIn).toBe(25);
    expect(r.players.c.sharedIn).toBe(0);
  });

  it('pays unassigned players individually without a team reward', () => {
    const r = computeSprintRewards({
      config: cfg({ teamModeEnabled: true }),
      assignments: [asg('w1', 100)],
      submissions: [sub('z', 'w1', 100)],
      participantIds: ['z'],
      teams: [],
    });
    expect(r.players.z.teamId).toBe(UNASSIGNED_TEAM_ID);
    expect(r.players.z.totalPoints).toBe(100);
    expect(r.players.z.teamReward).toBe(0);
  });

  it('converts to PP/XP only when configured', () => {
    const off = computeSprintRewards({ config: cfg(), assignments: [asg('w1', 100)], submissions: [sub('a', 'w1', 100)], participantIds: ['a'], teams: [] });
    expect(off.players.a.pp).toBe(0);
    expect(off.players.a.xp).toBe(0);
    const on = computeSprintRewards({ config: cfg({ ppPerPoint: 0.5, xpPerPoint: 2 }), assignments: [asg('w1', 100)], submissions: [sub('a', 'w1', 100)], participantIds: ['a'], teams: [] });
    expect(on.players.a.pp).toBe(50);
    expect(on.players.a.xp).toBe(200);
  });

  it('majority vote requires more than half of the eligible voters', () => {
    expect(majorityShareVote({ a: 10, b: 10, c: 25 }, ['a', 'b', 'c'])).toBe(10);
    expect(majorityShareVote({ a: 10, b: 25 }, ['a', 'b', 'c'])).toBeNull();
    expect(majorityShareVote({ a: 10, b: 10, x: 10 }, ['a', 'b', 'c', 'd'])).toBeNull();
  });
});

describe('Class Flow teams', () => {
  const players = [
    { uid: 'a', name: 'A', squadId: 's1', squadName: 'The Architects', squadTag: 'ARC' },
    { uid: 'b', name: 'B', squadId: 's1', squadName: 'The Architects', squadTag: 'ARC' },
    { uid: 'c', name: 'C', squadId: null },
  ];

  it('groups by squad without renaming the squad, with an Unassigned group', () => {
    const t = buildTeams('squad', players, {}, { squad_s1: { displayName: 'Night Owls' } });
    expect(t[0].defaultName).toBe('The Architects');
    expect(t[0].displayName).toBe('Night Owls');
    expect(t[t.length - 1].id).toBe(UNASSIGNED_TEAM_ID);
    expect(t[t.length - 1].memberIds).toEqual(['c']);
  });

  it('groups by table number', () => {
    const t = buildTeams('table', players, { a: 1, c: 1, b: 2 }, {});
    expect(t.map((x) => x.id)).toEqual(['table_1', 'table_2']);
    expect(t[0].memberIds).toEqual(['a', 'c']);
  });

  it('uses manual teams and leaves unplaced players unassigned', () => {
    const t = buildTeams('manual', players, {}, { m1: { groupingType: 'manual', memberIds: ['a', 'c'] } });
    expect(t[0].memberIds).toEqual(['a', 'c']);
    expect(t[1].memberIds).toEqual(['b']);
  });

  it('formats team tags for replace vs alongside', () => {
    const [team] = buildTeams('squad', players.slice(0, 2), {}, {});
    expect(formatTeamTag(team, 'replace', 1)).toBe('THE ARCHITECTS / Table 1 | 2 Players');
    expect(formatTeamTag(team, 'alongside', 1)).toBe('THE ARCHITECTS [ARC] / Table 1 | 2 Players');
  });
});

describe('Class Flow analytics', () => {
  it('keeps completion metrics separate from reward metrics', () => {
    const a = computeClassFlowAnalytics({
      participantIds: ['a', 'b'],
      assignments: [asg('w1', 100)],
      submissions: [
        sub('a', 'w1', 100, { submittedAt: 1000, reviewedAt: 11_000 }),
        sub('b', 'w1', 0, { status: 'revision_requested', approvedPoints: 0, revisionCount: 1 }),
      ],
      allocations: [],
      teamCount: 0,
    });
    expect(a.participationRate).toBe(100);
    expect(a.completionRate).toBe(50);
    expect(a.approvalRate).toBe(50);
    expect(a.revisionRate).toBe(50);
    expect(a.avgApprovalTurnaroundSec).toBe(10);
    expect(a.rewards.pointsAllocated).toBe(0);
  });
});
