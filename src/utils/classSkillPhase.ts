/**
 * Post-sprint Class Skill Phase (pure; no Firestore).
 *
 * SPRINT ACTIVE → SPRINT ENDS → CLASS SKILL PHASE → NEXT SPRINT / RESUME.
 * Each real sprint expiry is one completion cycle, identified by `${sprintId}@${endsAtMs}`:
 * pausing never ends a cycle, extending moves `endsAt` (a new cycle), and ending a sprint early keeps
 * `endsAt`, so repeated End Sprint clicks and refreshes map to the same cycle and never open a second phase.
 */
import type { ClassSkillPhase, ClassSkillPhaseDecision, IrlActivation, IrlEventConfig } from '../types/classSkills';
import { sprintPhase, type CfTimerInput } from './classFlowConfig';
import { CLASS_SKILL_LIMITS, type PhaseGate } from './classSkillsConfig';

export interface PhaseSprint {
  id: string;
  title: string;
  classSkillsEnabled?: boolean;
  timer: CfTimerInput;
}

/** Server-time slack for requests made in the last moment of the phase. */
export const PHASE_REQUEST_GRACE_MS = 3000;
/** Completion cycles remembered on the room (prevents reopening old cycles). */
export const MAX_PHASE_CYCLES = 30;
/** Sprints that ended longer ago than this don't auto-open a phase (e.g. the facilitator joined late). */
export const AUTO_OPEN_STALE_MS = 15 * 60 * 1000;

export const completionCycleId = (sprintId: string, endsAtMs: number) => `${sprintId}@${Math.floor(endsAtMs)}`;

/** Live Event switch AND (sprint override ?? Live Event default). */
export function sprintClassSkillsEnabled(config: Pick<IrlEventConfig, 'enabled' | 'sprintPhaseDefault'>, sprint: Pick<PhaseSprint, 'classSkillsEnabled'> | null): boolean {
  if (!config.enabled || !sprint) return false;
  return sprint.classSkillsEnabled ?? config.sprintPhaseDefault;
}

/** The completion cycle a finished sprint belongs to; null while it is running or paused. */
export function completedCycleId(sprint: PhaseSprint, nowMs: number): string | null {
  const p = sprintPhase(sprint.timer, nowMs);
  if (p === 'running' || p === 'paused') return null;
  return completionCycleId(sprint.id, sprint.timer.endsAtMs);
}

/** Cycle id to open now, or null (already opened, still running, disabled, or stale). */
export function phaseToOpen(input: {
  config: Pick<IrlEventConfig, 'enabled' | 'sprintPhaseDefault'>;
  sprint: PhaseSprint | null;
  phase: ClassSkillPhase | null;
  cycles: readonly string[];
  nowMs: number;
}): string | null {
  const { sprint, phase, cycles, nowMs } = input;
  if (!sprint || !sprintClassSkillsEnabled(input.config, sprint)) return null;
  const id = completedCycleId(sprint, nowMs);
  if (!id || phase?.id === id || cycles.includes(id)) return null;
  if (sprint.timer.endsAtMs > 0 && nowMs - sprint.timer.endsAtMs > AUTO_OPEN_STALE_MS) return null;
  return id;
}

export function buildClassSkillPhase(input: {
  cycleId: string;
  sprint: Pick<PhaseSprint, 'id' | 'title'>;
  config: Pick<IrlEventConfig, 'phaseSeconds' | 'activationLimit' | 'classSkillCost'>;
  eligibleUids: string[];
  nowMs: number;
  openedBy: string;
}): ClassSkillPhase {
  const { config, nowMs } = input;
  return {
    id: input.cycleId,
    sprintId: input.sprint.id,
    sprintTitle: input.sprint.title.slice(0, 120),
    status: 'open',
    openedAtMs: nowMs,
    endsAtMs: nowMs + config.phaseSeconds * 1000,
    durationSeconds: config.phaseSeconds,
    closedAtMs: null,
    closeReason: null,
    openedBy: input.openedBy,
    activationLimit: config.activationLimit,
    cost: config.classSkillCost,
    eligibleUids: Array.from(new Set(input.eligibleUids)).slice(0, 200),
    decisions: {},
    activationCounts: {},
    ppSpent: 0,
  };
}

const numOr = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function parseClassSkillPhase(raw: unknown): ClassSkillPhase | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id || typeof o.sprintId !== 'string') return null;
  const decisions: Record<string, ClassSkillPhaseDecision> = {};
  if (o.decisions && typeof o.decisions === 'object') {
    Object.entries(o.decisions as Record<string, unknown>).forEach(([uid, d]) => {
      const c = (d && typeof d === 'object' ? (d as Record<string, unknown>).choice : null) as unknown;
      if (c === 'passed' || c === 'activated') decisions[uid] = { choice: c, atMs: numOr((d as Record<string, unknown>).atMs, 0) };
    });
  }
  const activationCounts: Record<string, number> = {};
  if (o.activationCounts && typeof o.activationCounts === 'object') {
    Object.entries(o.activationCounts as Record<string, unknown>).forEach(([uid, n]) => {
      if (typeof n === 'number' && n > 0) activationCounts[uid] = Math.floor(n);
    });
  }
  return {
    id: o.id,
    sprintId: o.sprintId,
    sprintTitle: typeof o.sprintTitle === 'string' ? o.sprintTitle : 'Sprint',
    status: o.status === 'open' ? 'open' : 'closed',
    openedAtMs: numOr(o.openedAtMs, 0),
    endsAtMs: numOr(o.endsAtMs, 0),
    durationSeconds: numOr(o.durationSeconds, CLASS_SKILL_LIMITS.defaultPhaseSeconds),
    closedAtMs: typeof o.closedAtMs === 'number' ? o.closedAtMs : null,
    closeReason: typeof o.closeReason === 'string' ? o.closeReason : null,
    openedBy: typeof o.openedBy === 'string' ? o.openedBy : '',
    activationLimit: Math.max(1, Math.floor(numOr(o.activationLimit, 1))),
    cost: Math.max(0, Math.floor(numOr(o.cost, CLASS_SKILL_LIMITS.defaultClassSkillCost))),
    eligibleUids: Array.isArray(o.eligibleUids) ? o.eligibleUids.filter((u): u is string => typeof u === 'string') : [],
    decisions,
    activationCounts,
    ppSpent: Math.max(0, numOr(o.ppSpent, 0)),
  };
}

export const phaseRemainingMs = (phase: Pick<ClassSkillPhase, 'endsAtMs'>, nowMs: number) => Math.max(0, phase.endsAtMs - nowMs);
export const phaseAcceptingRequests = (phase: ClassSkillPhase | null, nowMs: number): phase is ClassSkillPhase =>
  !!phase && phase.status === 'open' && nowMs < phase.endsAtMs;
const isEligible = (phase: ClassSkillPhase, uid: string) => phase.eligibleUids.length === 0 || phase.eligibleUids.includes(uid);
/** The player has made their choice for this phase (passed, or used every activation). */
export const playerDecided = (phase: ClassSkillPhase, uid: string) =>
  phase.decisions[uid]?.choice === 'passed' || (phase.activationCounts[uid] || 0) >= phase.activationLimit;

export type PlayerPhaseState = 'awaiting' | 'disabled' | 'open' | 'pending' | 'passed' | 'used' | 'closed' | 'not_eligible';

export interface PlayerPhaseStatus {
  state: PlayerPhaseState;
  message: string;
  gate: PhaseGate;
}

/** What one player may do right now. The same gate is enforced again inside the approval transaction. */
export function playerPhaseStatus(input: {
  config: Pick<IrlEventConfig, 'enabled' | 'sprintPhaseDefault'>;
  sprint: PhaseSprint | null;
  phase: ClassSkillPhase | null;
  uid: string;
  nowMs: number;
  /** This player's pending requests in the current phase. */
  pendingInPhase: number;
}): PlayerPhaseStatus {
  const { config, sprint, phase, uid, nowMs } = input;
  const no = (state: PlayerPhaseState, message: string): PlayerPhaseStatus => ({ state, message, gate: { ok: false, reason: message } });
  if (!config.enabled) return no('disabled', 'Class Skills are off for this Live Event.');
  if (phase && phase.status === 'open') {
    if (nowMs >= phase.endsAtMs) return no('closed', 'The Class Skill Phase has ended.');
    if (!isEligible(phase, uid)) return no('not_eligible', 'You joined after this Sprint ended. You can use Class Skills after the next Sprint.');
    if (phase.decisions[uid]?.choice === 'passed') return no('passed', 'You passed this Class Skill Phase.');
    const used = phase.activationCounts[uid] || 0;
    if (used >= phase.activationLimit) return no('used', 'You already used your Class Skill this phase.');
    if (used + input.pendingInPhase >= phase.activationLimit) return no('pending', 'Your Class Skill is waiting for approval.');
    return { state: 'open', message: 'The Class Skill Phase is open.', gate: { ok: true, phaseId: phase.id } };
  }
  if (!sprint) return no('awaiting', 'Available after the next Sprint ends.');
  if (!sprintClassSkillsEnabled(config, sprint)) return no('disabled', 'Class Skills are off for this Sprint.');
  const cycle = completedCycleId(sprint, nowMs);
  if (!cycle) return no('awaiting', 'Available after the Sprint ends.');
  if (phase && phase.id === cycle) return no('closed', 'The Class Skill Phase has ended. Use Class Skills after the next Sprint.');
  return no('awaiting', 'The Class Skill Phase is starting…');
}

/** Server-side window check for one request (run inside the approval transaction). */
export function phaseAcceptsRequest(
  phase: ClassSkillPhase | null,
  act: Pick<IrlActivation, 'phaseId' | 'requestedAtServerMs' | 'casterUid'>
): { ok: true } | { ok: false; reason: string } {
  if (!phase || !act.phaseId || act.phaseId !== phase.id) return { ok: false, reason: 'This request is not from the current Class Skill Phase.' };
  const at = act.requestedAtServerMs;
  if (at == null) return { ok: false, reason: 'The request has no server time yet. Try again.' };
  if (at < phase.openedAtMs - PHASE_REQUEST_GRACE_MS) return { ok: false, reason: 'Requested before the Class Skill Phase opened.' };
  const end = Math.min(phase.endsAtMs, phase.closedAtMs ?? Number.POSITIVE_INFINITY);
  if (at > end + PHASE_REQUEST_GRACE_MS) return { ok: false, reason: 'Requested after the Class Skill Phase ended.' };
  if (!isEligible(phase, act.casterUid)) return { ok: false, reason: 'The player was not part of this Sprint.' };
  if (phase.decisions[act.casterUid]?.choice === 'passed') return { ok: false, reason: 'The player passed this phase.' };
  if ((phase.activationCounts[act.casterUid] || 0) >= phase.activationLimit) return { ok: false, reason: 'Activation limit reached for this phase.' };
  return { ok: true };
}

/** Why an open phase should close now (null = keep it open). Never closes while requests are pending. */
export function phaseAutoCloseReason(phase: ClassSkillPhase | null, nowMs: number, pendingInPhase: number): 'time_up' | 'all_acted' | null {
  if (!phase || phase.status !== 'open' || pendingInPhase > 0) return null;
  if (nowMs >= phase.endsAtMs) return 'time_up';
  if (phase.eligibleUids.length > 0 && phase.eligibleUids.every((u) => playerDecided(phase, u))) return 'all_acted';
  return null;
}

/** Dot-path patch that closes an open phase (empty when there is nothing to close). */
export function closeOpenPhasePatch(rawPhase: unknown, nowMs: number, reason: string): Record<string, unknown> {
  const phase = parseClassSkillPhase(rawPhase);
  if (!phase || phase.status !== 'open') return {};
  return {
    'classSkillPhase.status': 'closed',
    'classSkillPhase.closedAtMs': nowMs,
    'classSkillPhase.closeReason': reason,
  };
}

export const PHASE_CLOSE_LABELS: Record<string, string> = {
  time_up: 'Time is up',
  all_acted: 'Everyone acted',
  facilitator: 'Ended by facilitator',
  next_sprint: 'Next sprint started',
  sprint_resumed: 'Sprint resumed',
  disabled: 'Class Skills disabled for this sprint',
};

export type PhasePlayerOutcome = 'activated' | 'passed' | 'pending' | 'no_response';

export interface PhasePlayerRow {
  uid: string;
  outcome: PhasePlayerOutcome;
  activations: IrlActivation[];
}

/** Facilitator view: one row per eligible player (plus anyone who requested). */
export function phaseSummary(phase: ClassSkillPhase, activations: readonly IrlActivation[]): PhasePlayerRow[] {
  const inPhase = activations.filter((a) => a.phaseId === phase.id && a.status !== 'cancelled');
  const uids = Array.from(new Set([...phase.eligibleUids, ...inPhase.map((a) => a.casterUid)]));
  return uids.map((uid) => {
    const mine = inPhase.filter((a) => a.casterUid === uid);
    const outcome: PhasePlayerOutcome = mine.some((a) => a.status === 'approved')
      ? 'activated'
      : mine.some((a) => a.status === 'pending')
        ? 'pending'
        : phase.decisions[uid]?.choice === 'passed'
          ? 'passed'
          : 'no_response';
    return { uid, outcome, activations: mine };
  });
}
