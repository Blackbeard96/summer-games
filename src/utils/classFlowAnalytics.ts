/**
 * Class Flow analytics (pure). Completion metrics come only from submissions;
 * reward metrics come only from allocations/payouts — the two are never mixed.
 */
import type { CfAllocation, CfSprintAssignment, CfSubmission } from '../types/classFlowWork';

export interface CfAssignmentStats {
  assignmentId: string;
  title: string;
  submitted: number;
  approved: number;
  revisions: number;
  rejected: number;
}

export interface CfAnalytics {
  participants: number;
  activePlayers: number;
  participationRate: number;
  submissions: number;
  submissionRate: number;
  approved: number;
  approvalRate: number;
  revisionRate: number;
  rejected: number;
  pending: number;
  completionRate: number;
  extraCreditApproved: number;
  avgApprovalTurnaroundSec: number | null;
  approvedPointsByPlayer: Record<string, number>;
  approvedPointsByTeam: Record<string, number>;
  byAssignment: CfAssignmentStats[];
  bySprint: Record<string, { submissions: number; approved: number }>;
  rewards: {
    pointsAllocated: number;
    ppAllocated: number;
    xpAllocated: number;
    paidOutPlayers: number;
    sharedCredit: number;
  };
}

const ratio = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

export function computeClassFlowAnalytics(args: {
  participantIds: string[];
  assignments: CfSprintAssignment[];
  submissions: CfSubmission[];
  allocations: CfAllocation[];
  teamCount: number;
}): CfAnalytics {
  const { submissions, assignments, allocations } = args;
  const participants = new Set(args.participantIds);
  const standard = assignments.filter((a) => !a.isExtraCredit);
  const expected = standard.reduce(
    (n, a) => n + (a.workType === 'team' ? Math.max(1, args.teamCount) : participants.size),
    0
  );

  const active = new Set<string>();
  const byPlayer: Record<string, number> = {};
  const byTeam: Record<string, number> = {};
  const bySprint: CfAnalytics['bySprint'] = {};
  const byAssignment = new Map<string, CfAssignmentStats>();
  let approved = 0;
  let rejected = 0;
  let pending = 0;
  let revised = 0;
  let extraApproved = 0;
  let turnaroundSum = 0;
  let turnaroundN = 0;
  let standardApproved = 0;

  for (const s of submissions) {
    active.add(s.playerId);
    (s.contributorIds || []).forEach((uid) => active.add(uid));
    const sp = (bySprint[s.sprintId] = bySprint[s.sprintId] || { submissions: 0, approved: 0 });
    sp.submissions += 1;
    const a =
      byAssignment.get(s.assignmentId) ||
      ({ assignmentId: s.assignmentId, title: s.assignmentTitle, submitted: 0, approved: 0, revisions: 0, rejected: 0 } as CfAssignmentStats);
    a.submitted += 1;
    if (s.revisionCount > 0 || s.status === 'revision_requested') {
      revised += 1;
      a.revisions += 1;
    }
    if (s.status === 'approved') {
      approved += 1;
      a.approved += 1;
      sp.approved += 1;
      if (s.isExtraCredit) extraApproved += 1;
      else standardApproved += 1;
      byPlayer[s.playerId] = (byPlayer[s.playerId] || 0) + s.approvedPoints;
      if (s.teamId) byTeam[s.teamId] = (byTeam[s.teamId] || 0) + s.approvedPoints;
      if (s.reviewedAt && s.submittedAt) {
        turnaroundSum += Math.max(0, s.reviewedAt - s.submittedAt);
        turnaroundN += 1;
      }
    } else if (s.status === 'rejected') {
      rejected += 1;
      a.rejected += 1;
    } else if (s.status === 'submitted' || s.status === 'awaiting_approval') {
      pending += 1;
    }
    byAssignment.set(s.assignmentId, a);
  }

  const reviewed = approved + rejected + submissions.filter((s) => s.status === 'revision_requested').length;
  const activeParticipants = Array.from(active).filter((uid) => participants.has(uid)).length;

  return {
    participants: participants.size,
    activePlayers: activeParticipants,
    participationRate: ratio(activeParticipants, participants.size),
    submissions: submissions.length,
    submissionRate: ratio(submissions.filter((s) => !s.isExtraCredit).length, expected),
    approved,
    approvalRate: ratio(approved, reviewed),
    revisionRate: ratio(revised, submissions.length),
    rejected,
    pending,
    completionRate: ratio(standardApproved, expected),
    extraCreditApproved: extraApproved,
    avgApprovalTurnaroundSec: turnaroundN ? Math.round(turnaroundSum / turnaroundN / 1000) : null,
    approvedPointsByPlayer: byPlayer,
    approvedPointsByTeam: byTeam,
    byAssignment: Array.from(byAssignment.values()),
    bySprint,
    rewards: {
      pointsAllocated: allocations.reduce((n, a) => n + a.totalPoints, 0),
      ppAllocated: allocations.reduce((n, a) => n + a.pp, 0),
      xpAllocated: allocations.reduce((n, a) => n + a.xp, 0),
      paidOutPlayers: new Set(allocations.filter((a) => a.status === 'paid_out').map((a) => a.playerId)).size,
      sharedCredit: allocations.reduce((n, a) => n + a.sharedIn, 0),
    },
  };
}
