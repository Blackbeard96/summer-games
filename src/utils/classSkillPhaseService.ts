/**
 * Class Skill Phase + equipped Class Skills — Firestore services.
 *
 * The phase lives on the room (`inSessionRooms/{id}.classSkillPhase`) so every client gets it from the
 * existing room listener. Only facilitators open, close, extend or disable it (security rules); a player can
 * only record their own "Pass". Activations are still validated and charged in the approval transaction.
 */
import { arrayUnion, doc, getDoc, onSnapshot, runTransaction, setDoc, writeBatch, type DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import type { IrlEventConfig } from '../types/classSkills';
import { CLASS_SKILL_LIMITS, parseClassSkillCapacity, parseClassSkillEquipped, parseIrlEventConfig } from './classSkillsConfig';
import {
  MAX_PHASE_CYCLES,
  buildClassSkillPhase,
  closeOpenPhasePatch,
  completedCycleId,
  parseClassSkillPhase,
  phaseToOpen,
  type PhaseSprint,
} from './classSkillPhase';
import { parseClassFlowSprint, sprintTimerInput } from './liveEventSprintService';

type Result<T = void> = { ok: true; value?: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const room = (sid: string) => doc(db, 'inSessionRooms', sid);

export interface PhaseCtx {
  sessionId: string;
  facilitatorUid: string;
  /** Server-corrected now. */
  nowMs: number;
}

const roomConfig = (data: DocumentData): IrlEventConfig =>
  parseIrlEventConfig(data.irlSkillsConfig, typeof data.liveEventMode === 'string' ? data.liveEventMode : null);

export function phaseSprintFromRoom(data: DocumentData | undefined): PhaseSprint | null {
  const sprint = parseClassFlowSprint(data?.classFlowSprint);
  if (!sprint) return null;
  return { id: sprint.id, title: sprint.title, classSkillsEnabled: sprint.classSkillsEnabled, timer: sprintTimerInput(sprint) };
}

const cyclesOf = (data: DocumentData): string[] =>
  Array.isArray(data.classSkillPhaseCycles) ? data.classSkillPhaseCycles.filter((c: unknown): c is string => typeof c === 'string') : [];

/**
 * Opens the phase for the sprint that just ended. Idempotent: the cycle id is checked inside the
 * transaction, so simultaneous facilitator screens, refreshes and repeated clicks open it once.
 * `manual` lets a facilitator open a phase without an automatic trigger (stale sprint or no sprint).
 */
export async function openClassSkillPhase(ctx: PhaseCtx, opts: { manual?: boolean } = {}): Promise<Result<{ opened: boolean; phaseId: string | null }>> {
  try {
    const out = await runTransaction(db, async (tx) => {
      const snap = await tx.get(room(ctx.sessionId));
      if (!snap.exists()) throw new Error('Live Event not found');
      const data = snap.data();
      if (data.status === 'ended') return { opened: false, phaseId: null };
      const config = roomConfig(data);
      if (!config.enabled) throw new Error('Class Skills are off for this Live Event.');
      const sprint = phaseSprintFromRoom(data);
      const current = parseClassSkillPhase(data.classSkillPhase);
      const cycles = cyclesOf(data);
      if (current?.status === 'open' && ctx.nowMs < current.endsAtMs) return { opened: false, phaseId: current.id };

      let cycleId = phaseToOpen({ config, sprint, phase: current, cycles, nowMs: ctx.nowMs });
      if (!cycleId && opts.manual) {
        const finished = sprint ? completedCycleId(sprint, ctx.nowMs) : null;
        if (sprint && !finished) throw new Error('The Sprint is still running. The phase opens when it ends.');
        cycleId = finished && !cycles.includes(finished) && current?.id !== finished ? finished : `manual@${Math.floor(ctx.nowMs)}`;
      }
      if (!cycleId) return { opened: false, phaseId: current?.id ?? null };

      const players: { userId?: unknown }[] = Array.isArray(data.players) ? data.players : [];
      const phase = buildClassSkillPhase({
        cycleId,
        sprint: sprint ?? { id: 'manual', title: 'Class Skill Phase' },
        config,
        eligibleUids: players.map((p) => p?.userId).filter((u): u is string => typeof u === 'string' && !!u),
        nowMs: ctx.nowMs,
        openedBy: ctx.facilitatorUid,
      });
      tx.update(room(ctx.sessionId), {
        classSkillPhase: phase,
        classSkillPhaseCycles: [...cycles.filter((c) => c !== cycleId), cycleId].slice(-MAX_PHASE_CYCLES),
        battleLog: arrayUnion(`✨ Class Skill Phase opened${sprint ? ` after "${sprint.title}"` : ''} — ${phase.durationSeconds}s to choose a Class Skill.`),
      } as DocumentData);
      return { opened: true, phaseId: cycleId };
    });
    return { ok: true, value: out };
  } catch (e) {
    return fail(e);
  }
}

export async function closeClassSkillPhase(ctx: PhaseCtx, phaseId: string, reason: string): Promise<Result<boolean>> {
  try {
    const closed = await runTransaction(db, async (tx) => {
      const snap = await tx.get(room(ctx.sessionId));
      if (!snap.exists()) throw new Error('Live Event not found');
      const phase = parseClassSkillPhase(snap.data().classSkillPhase);
      if (!phase || phase.id !== phaseId || phase.status !== 'open') return false;
      tx.update(room(ctx.sessionId), {
        ...closeOpenPhasePatch(snap.data().classSkillPhase, ctx.nowMs, reason),
        'classSkillPhase.closedBy': ctx.facilitatorUid,
      } as DocumentData);
      return true;
    });
    return { ok: true, value: closed };
  } catch (e) {
    return fail(e);
  }
}

export async function extendClassSkillPhase(ctx: PhaseCtx, phaseId: string, seconds: number): Promise<Result> {
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(room(ctx.sessionId));
      if (!snap.exists()) throw new Error('Live Event not found');
      const phase = parseClassSkillPhase(snap.data().classSkillPhase);
      if (!phase || phase.id !== phaseId || phase.status !== 'open') throw new Error('The Class Skill Phase is not open.');
      const add = Math.max(5, Math.min(CLASS_SKILL_LIMITS.maxPhaseSeconds, Math.floor(seconds)));
      tx.update(room(ctx.sessionId), {
        'classSkillPhase.endsAtMs': Math.max(phase.endsAtMs, ctx.nowMs) + add * 1000,
        'classSkillPhase.durationSeconds': phase.durationSeconds + add,
      } as DocumentData);
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Player: skip this phase. The rules only allow writing their own decision while the phase is open. */
export async function passClassSkillPhase(sessionId: string, phaseId: string, uid: string, nowMs: number): Promise<Result> {
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(room(sessionId));
      if (!snap.exists()) throw new Error('Live Event not found');
      const phase = parseClassSkillPhase(snap.data().classSkillPhase);
      if (!phase || phase.id !== phaseId || phase.status !== 'open') throw new Error('The Class Skill Phase has ended.');
      if (phase.decisions[uid]) return;
      tx.update(room(sessionId), { [`classSkillPhase.decisions.${uid}`]: { choice: 'passed', atMs: Math.floor(nowMs) } } as DocumentData);
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Per-sprint override. Turning it off also closes an open phase for that sprint. */
export async function setSprintClassSkillsEnabled(ctx: PhaseCtx, sprintId: string, enabled: boolean): Promise<Result> {
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(room(ctx.sessionId));
      if (!snap.exists()) throw new Error('Live Event not found');
      const data = snap.data();
      const sprint = parseClassFlowSprint(data.classFlowSprint);
      if (!sprint || sprint.id !== sprintId) throw new Error('That sprint is no longer current.');
      const phase = parseClassSkillPhase(data.classSkillPhase);
      const patch: Record<string, unknown> = { 'classFlowSprint.classSkillsEnabled': enabled };
      if (!enabled && phase?.sprintId === sprintId) Object.assign(patch, closeOpenPhasePatch(data.classSkillPhase, ctx.nowMs, 'disabled'));
      tx.update(room(ctx.sessionId), patch as DocumentData);
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** "Until end of sprint" rules activated in a phase start counting once the next sprint is live. */
export async function bindPhaseRulesToSprint(sessionId: string, ruleIds: string[], sprintId: string): Promise<Result> {
  if (!ruleIds.length) return { ok: true };
  try {
    const batch = writeBatch(db);
    ruleIds.slice(0, 400).forEach((id) => batch.update(doc(db, 'inSessionRooms', sessionId, 'irlRules', id), { sprintId }));
    await batch.commit();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ----------------------------- Equipped Class Skills ----------------------------- */

const capacityRef = () => doc(db, 'adminSettings', 'classSkills');
const studentRef = (uid: string) => doc(db, 'students', uid);

export async function getClassSkillCapacity(): Promise<number> {
  try {
    const snap = await getDoc(capacityRef());
    return parseClassSkillCapacity(snap.exists() ? snap.data() : null);
  } catch {
    return CLASS_SKILL_LIMITS.defaultCapacity;
  }
}

export function subscribeClassSkillCapacity(cb: (capacity: number) => void) {
  return onSnapshot(
    capacityRef(),
    (snap) => cb(parseClassSkillCapacity(snap.exists() ? snap.data() : null)),
    () => cb(CLASS_SKILL_LIMITS.defaultCapacity)
  );
}

export async function setClassSkillCapacity(capacity: number): Promise<Result> {
  try {
    await setDoc(capacityRef(), { capacity: parseClassSkillCapacity({ capacity }) }, { merge: true });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Raw equipped ids (callers trim to capacity with parseClassSkillEquipped). */
export function subscribeClassSkillEquipped(uid: string, cb: (ids: string[]) => void) {
  return onSnapshot(
    studentRef(uid),
    (snap) => cb(parseClassSkillEquipped(snap.exists() ? snap.data()?.classSkillEquipped : null, CLASS_SKILL_LIMITS.maxCapacity)),
    () => cb([])
  );
}

/** Player equips/unequips their own Class Skills. Unlock checks run again when an activation is approved. */
export async function setClassSkillEquipped(uid: string, ids: string[], capacity: number): Promise<Result<string[]>> {
  try {
    const next = parseClassSkillEquipped(ids, capacity);
    await setDoc(studentRef(uid), { classSkillEquipped: next }, { merge: true });
    return { ok: true, value: next };
  } catch (e) {
    return fail(e);
  }
}
