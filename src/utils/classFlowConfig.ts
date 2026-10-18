/**
 * Class Flow Sprint Management — config defaults, parsing, and timer math (pure; no Firestore).
 */
import type {
  CfBonusConfig,
  CfConfig,
  CfDifficulty,
  CfSprintAssignment,
  CfSprintPlanItem,
  CfSubmissionMethod,
  CfWorkAssignment,
} from '../types/classFlowWork';

export const CF_SUBMISSION_METHODS: CfSubmissionMethod[] = ['facilitator', 'written', 'link', 'upload', 'confirm'];

export const CF_METHOD_LABELS: Record<CfSubmissionMethod, string> = {
  facilitator: 'Facilitator verification',
  written: 'Written response',
  link: 'Link submission',
  upload: 'File / image upload',
  confirm: 'Completion confirmation',
};

/** Every flag is off by default so existing Class Flow sessions behave exactly as before. */
export const DEFAULT_CF_CONFIG: CfConfig = {
  workAssignmentsEnabled: false,
  submissionApprovalRequired: true,
  teamModeEnabled: false,
  teamCreditSharingEnabled: false,
  extraCreditEnabled: false,
  expandedTimerEnabled: false,
  contributionRewardsEnabled: false,
  acceptLateSubmissions: false,
  grouping: 'squad',
  tagDisplay: 'alongside',
  distributionMode: 'hybrid',
  hybridTeamPercent: 100,
  payoutTiming: 'per_sprint',
  ppPerPoint: 0,
  xpPerPoint: 0,
  bonusLimits: {
    maxBonusPerPlayer: 100,
    allowStacking: false,
    maxMultiplier: 1.5,
    extraCountsToTeam: false,
  },
  sharing: {
    initiator: 'majority',
    options: [0, 10, 25],
    allowCustom: false,
    maxPercent: 25,
  },
  plan: [],
};

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const num = (v: unknown, d: number, min: number, max: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : d;
  return Math.max(min, Math.min(max, n));
};
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
function oneOf<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : d;
}

export function parseBonus(raw: unknown): CfBonusConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const type = oneOf(o.type, ['none', 'flat', 'multiplier'] as const, 'none');
  return {
    type,
    value: type === 'multiplier' ? num(o.value, 1, 1, 5) : num(o.value, 0, 0, 100000),
    targetAssignmentId: typeof o.targetAssignmentId === 'string' && o.targetAssignmentId ? o.targetAssignmentId : null,
  };
}

function parseMethods(raw: unknown): CfSubmissionMethod[] {
  const list = Array.isArray(raw)
    ? raw.filter((m): m is CfSubmissionMethod => CF_SUBMISSION_METHODS.includes(m as CfSubmissionMethod))
    : [];
  return list.length ? Array.from(new Set(list)) : ['confirm'];
}

export function parseSprintAssignment(raw: unknown): CfSprintAssignment | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const assignmentId = str(o.assignmentId);
  const title = str(o.title).trim();
  if (!assignmentId || !title) return null;
  return {
    assignmentId,
    title,
    description: str(o.description),
    instructions: str(o.instructions),
    submissionRequirements: str(o.submissionRequirements),
    workType: oneOf(o.workType, ['individual', 'team'] as const, 'individual'),
    points: Math.floor(num(o.points, 0, 0, 100000)),
    submissionMethods: parseMethods(o.submissionMethods),
    evidenceRequired: bool(o.evidenceRequired, false),
    isExtraCredit: bool(o.isExtraCredit, false),
    bonus: parseBonus(o.bonus),
  };
}

export function parseSprintAssignments(raw: unknown): CfSprintAssignment[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseSprintAssignment).filter((a): a is CfSprintAssignment => !!a);
}

function parsePlan(raw: unknown): CfSprintPlanItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CfSprintPlanItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const planId = str(o.planId);
    if (!planId) continue;
    out.push({
      planId,
      title: str(o.title, 'Sprint'),
      objective: str(o.objective),
      durationMinutes: Math.floor(num(o.durationMinutes, 10, 1, 120)),
      assignments: parseSprintAssignments(o.assignments),
    });
  }
  return out;
}

export function parseCfConfig(raw: unknown): CfConfig {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CF_CONFIG;
  const bl = (o.bonusLimits && typeof o.bonusLimits === 'object' ? o.bonusLimits : {}) as Record<string, unknown>;
  const sh = (o.sharing && typeof o.sharing === 'object' ? o.sharing : {}) as Record<string, unknown>;
  const maxPercent = num(sh.maxPercent, d.sharing.maxPercent, 0, 100);
  const options = Array.isArray(sh.options)
    ? sh.options
        .filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
        .map((x) => Math.max(0, Math.min(maxPercent, Math.floor(x))))
    : d.sharing.options;
  return {
    workAssignmentsEnabled: bool(o.workAssignmentsEnabled, d.workAssignmentsEnabled),
    submissionApprovalRequired: bool(o.submissionApprovalRequired, d.submissionApprovalRequired),
    teamModeEnabled: bool(o.teamModeEnabled, d.teamModeEnabled),
    teamCreditSharingEnabled: bool(o.teamCreditSharingEnabled, d.teamCreditSharingEnabled),
    extraCreditEnabled: bool(o.extraCreditEnabled, d.extraCreditEnabled),
    expandedTimerEnabled: bool(o.expandedTimerEnabled, d.expandedTimerEnabled),
    contributionRewardsEnabled: bool(o.contributionRewardsEnabled, d.contributionRewardsEnabled),
    acceptLateSubmissions: bool(o.acceptLateSubmissions, d.acceptLateSubmissions),
    grouping: oneOf(o.grouping, ['squad', 'table', 'manual'] as const, d.grouping),
    tagDisplay: oneOf(o.tagDisplay, ['replace', 'alongside'] as const, d.tagDisplay),
    distributionMode: oneOf(o.distributionMode, ['equal', 'contribution', 'hybrid'] as const, d.distributionMode),
    hybridTeamPercent: num(o.hybridTeamPercent, d.hybridTeamPercent, 0, 100),
    payoutTiming: oneOf(o.payoutTiming, ['per_sprint', 'end_of_event'] as const, d.payoutTiming),
    ppPerPoint: num(o.ppPerPoint, d.ppPerPoint, 0, 100),
    xpPerPoint: num(o.xpPerPoint, d.xpPerPoint, 0, 100),
    bonusLimits: {
      maxBonusPerPlayer: Math.floor(num(bl.maxBonusPerPlayer, d.bonusLimits.maxBonusPerPlayer, 0, 100000)),
      allowStacking: bool(bl.allowStacking, d.bonusLimits.allowStacking),
      maxMultiplier: num(bl.maxMultiplier, d.bonusLimits.maxMultiplier, 1, 5),
      extraCountsToTeam: bool(bl.extraCountsToTeam, d.bonusLimits.extraCountsToTeam),
    },
    sharing: {
      initiator: oneOf(sh.initiator, ['captain', 'majority', 'facilitator'] as const, d.sharing.initiator),
      options: Array.from(new Set([0, ...options])).sort((a, b) => a - b),
      allowCustom: bool(sh.allowCustom, d.sharing.allowCustom),
      maxPercent,
    },
    plan: parsePlan(o.plan),
  };
}

/**
 * Distribution actually used: with Team Mode off everyone is paid individually;
 * with Contribution-Based Rewards off, team mode falls back to equal shares.
 */
export function effectiveDistributionMode(config: CfConfig): 'individual' | CfConfig['distributionMode'] {
  if (!config.teamModeEnabled) return 'individual';
  if (!config.contributionRewardsEnabled) return 'equal';
  return config.distributionMode;
}

export function parseWorkAssignment(id: string, raw: unknown): CfWorkAssignment {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    id,
    title: str(o.title, 'Untitled work'),
    description: str(o.description),
    instructions: str(o.instructions),
    submissionRequirements: str(o.submissionRequirements),
    workType: oneOf(o.workType, ['individual', 'team'] as const, 'individual'),
    basePoints: Math.floor(num(o.basePoints, 0, 0, 100000)),
    estimatedMinutes: Math.floor(num(o.estimatedMinutes, 10, 0, 600)),
    difficulty: (['easy', 'medium', 'hard'] as const).includes(o.difficulty as CfDifficulty)
      ? (o.difficulty as CfDifficulty)
      : null,
    submissionMethods: parseMethods(o.submissionMethods),
    evidenceRequired: bool(o.evidenceRequired, false),
    extraCreditEligible: bool(o.extraCreditEligible, false),
    isExtraCredit: bool(o.isExtraCredit, false),
    bonus: parseBonus(o.bonus),
    classId: typeof o.classId === 'string' && o.classId ? o.classId : null,
    status: oneOf(o.status, ['draft', 'active', 'archived'] as const, 'draft'),
    createdBy: str(o.createdBy),
    createdAt: (o.createdAt as CfWorkAssignment['createdAt']) ?? null,
    updatedAt: (o.updatedAt as CfWorkAssignment['updatedAt']) ?? null,
  };
}

/** Library item → sprint copy. `points` overrides the library value for this sprint only. */
export function toSprintAssignment(w: CfWorkAssignment, points?: number): CfSprintAssignment {
  return {
    assignmentId: w.id,
    title: w.title,
    description: w.description,
    instructions: w.instructions,
    submissionRequirements: w.submissionRequirements,
    workType: w.workType,
    points: Math.max(0, Math.floor(points ?? w.basePoints)),
    submissionMethods: [...w.submissionMethods],
    evidenceRequired: w.evidenceRequired,
    isExtraCredit: w.isExtraCredit,
    bonus: { ...w.bonus },
  };
}

export function submissionDocId(sprintId: string, assignmentId: string, uid: string): string {
  return `${sprintId}__${assignmentId}__${uid}`;
}

export function allocationDocId(sprintId: string, uid: string): string {
  return `${sprintId}__${uid}`;
}

export function sharingDocId(sprintId: string, teamId: string): string {
  return `${sprintId}__${teamId}`;
}

/* ---------------------------------- Timer --------------------------------- */

export interface CfTimerInput {
  status: 'live' | 'closed';
  startedAtMs: number;
  endsAtMs: number;
  pausedAtMs: number | null;
}

/** Remaining ms from the shared timestamps. While paused the clock is frozen at `pausedAt`. */
export function sprintRemainingMs(t: CfTimerInput, nowMs: number): number {
  if (t.status !== 'live') return 0;
  const ref = t.pausedAtMs ?? nowMs;
  return Math.max(0, t.endsAtMs - ref);
}

export type CfTimerPhase = 'running' | 'paused' | 'expired' | 'closed';

export function sprintPhase(t: CfTimerInput, nowMs: number): CfTimerPhase {
  if (t.status !== 'live') return 'closed';
  if (t.pausedAtMs != null) return 'paused';
  return sprintRemainingMs(t, nowMs) > 0 ? 'running' : 'expired';
}

export function submissionsOpen(t: CfTimerInput | null, nowMs: number, acceptLate: boolean): boolean {
  if (!t) return false;
  const phase = sprintPhase(t, nowMs);
  if (phase === 'running' || phase === 'paused') return true;
  return acceptLate;
}

/** New `endsAt` when resuming: pushed forward by the time spent paused. */
export function resumedEndsAtMs(t: CfTimerInput, nowMs: number): { endsAtMs: number; pausedMs: number } {
  if (t.pausedAtMs == null) return { endsAtMs: t.endsAtMs, pausedMs: 0 };
  const pausedMs = Math.max(0, nowMs - t.pausedAtMs);
  return { endsAtMs: t.endsAtMs + pausedMs, pausedMs };
}

/** New `endsAt` when extending. An expired-but-live sprint restarts from now. */
export function extendedEndsAtMs(t: CfTimerInput, nowMs: number, addSeconds: number): number {
  const add = Math.max(0, Math.floor(addSeconds)) * 1000;
  const ref = t.pausedAtMs ?? nowMs;
  const base = t.endsAtMs > ref ? t.endsAtMs : ref;
  return base + add;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}
