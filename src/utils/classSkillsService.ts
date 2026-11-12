/**
 * Class Skills (IRL) — Firestore services.
 *
 * Trust model: players may only create a pending activation request (or a non-binding report).
 * Everything that spends resources, applies rules, or moves PP runs in a facilitator transaction,
 * and the security rules only let facilitators write rules, decisions and player state.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import type {
  ClassSkill,
  IrlActivation,
  IrlActiveRule,
  IrlEventConfig,
  IrlPlayerState,
  IrlResolvedEffect,
  IrlTargetType,
  IrlViolation,
} from '../types/classSkills';
import {
  CLASS_SKILL_LIMITS,
  CLASS_SKILL_TEMPLATES,
  checkActivation,
  computeRewardPP,
  consequencePP,
  describeConsequence,
  describeDuration,
  describeEffect,
  effectiveClassSkillLoadout,
  effectiveCost,
  elementalLevelFromMoves,
  isDirectEffectType,
  isRuleEnforceable,
  parseClassSkillEquipped,
  parseClassSkillLoadout,
  parseActivation,
  parseActiveRule,
  parseClassSkill,
  parseIrlEventConfig,
  parsePlayerState,
  parseViolation,
  protectionActive,
  resolveRuleExpiry,
  serializeClassSkill,
  type RuleClock,
} from './classSkillsConfig';
import { appendSkillActivationRecord, buildSkillActivationRecord } from './skillActivationSync';
import { DEFAULT_VAULT_CAPACITY, applyPlayerPPDelta } from './playerPowerPoints';
import { recordPPChange } from './ppLedgerService';
import { computeSiegeProtectionFloor } from './liveEventGameTimeService';
import { describeResolvedEffect, resolveDirectEffects, type DirectEffectOutput, type DirectVault } from './classSkillDirectEffects';
import { parseClassSkillPhase, phaseAcceptsRequest } from './classSkillPhase';
import { getClassSkillCapacity } from './classSkillPhaseService';

type Result<T = void> = { ok: true; value?: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

const skillsCol = () => collection(db, 'classSkills');
const room = (sid: string) => doc(db, 'inSessionRooms', sid);
const sub = (sid: string, name: string) => collection(db, 'inSessionRooms', sid, name);
const subDoc = (sid: string, name: string, id: string) => doc(db, 'inSessionRooms', sid, name, id);

/** Art key shared with the Skill Card artwork store (adminSettings/skillArtwork). */
export const classSkillArtKey = (skillId: string) => `irl_${skillId}`;

/* ------------------------------- Skill library ------------------------------- */

export function subscribeClassSkills(cb: (skills: ClassSkill[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(
    skillsCol(),
    (snap) => {
      const list = snap.docs.map((d) => parseClassSkill(d.id, d.data()));
      list.sort((a, b) => a.element.localeCompare(b.element) || a.level - b.level || a.name.localeCompare(b.name));
      cb(list);
    },
    (e) => {
      onError?.(e);
      cb([]);
    }
  );
}

/* ------------------------------ Player loadout ------------------------------- */

const studentRef = (uid: string) => doc(db, 'students', uid);

export async function getClassSkillLoadout(uid: string): Promise<string[]> {
  if (!uid) return [];
  try {
    const snap = await getDoc(studentRef(uid));
    return parseClassSkillLoadout(snap.exists() ? snap.data()?.classSkillLoadout : null);
  } catch {
    return [];
  }
}

export function subscribeClassSkillLoadout(uid: string, cb: (loadout: string[]) => void) {
  return onSnapshot(
    studentRef(uid),
    (snap) => cb(parseClassSkillLoadout(snap.exists() ? snap.data()?.classSkillLoadout : null)),
    () => cb([])
  );
}

/** Player's own pick from a mission step: drops `replace` (their previous pick on that step), then adds `add`. */
export async function chooseClassSkills(uid: string, add: string[], replace: string[] = []): Promise<Result<string[]>> {
  try {
    const next = await runTransaction(db, async (tx) => {
      const snap = await tx.get(studentRef(uid));
      const current = parseClassSkillLoadout(snap.exists() ? snap.data()?.classSkillLoadout : null);
      const merged = Array.from(new Set([...current.filter((id) => !replace.includes(id)), ...add]));
      tx.set(studentRef(uid), { classSkillLoadout: merged }, { merge: true });
      return merged;
    });
    return { ok: true, value: next };
  } catch (e) {
    return fail(e);
  }
}

/** Reserves a doc id locally so artwork can be uploaded before the skill's first save. */
export const newClassSkillId = (): string => doc(skillsCol()).id;

export async function saveClassSkill(skill: ClassSkill, updatedBy: string): Promise<Result<string>> {
  try {
    const ref = skill.id ? doc(db, 'classSkills', skill.id) : doc(skillsCol());
    await setDoc(ref, serializeClassSkill({ ...skill, id: ref.id }, updatedBy, Date.now()));
    return { ok: true, value: ref.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteClassSkill(id: string): Promise<Result> {
  try {
    await deleteDoc(doc(db, 'classSkills', id));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Adds the example skills as drafts (never active); skips any template already installed. */
export async function installClassSkillTemplates(existing: ClassSkill[], updatedBy: string): Promise<Result<number>> {
  try {
    const have = new Set(existing.map((s) => s.templateKey).filter(Boolean));
    const batch = writeBatch(db);
    let n = 0;
    const now = Date.now();
    CLASS_SKILL_TEMPLATES.filter((t) => !have.has(t.templateKey)).forEach((t) => {
      const ref = doc(skillsCol());
      batch.set(ref, serializeClassSkill({ ...t, id: ref.id, status: 'draft' }, updatedBy, now));
      n += 1;
    });
    if (n) await batch.commit();
    return { ok: true, value: n };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------- Event config -------------------------------- */

export async function updateIrlEventConfig(sessionId: string, patch: Partial<IrlEventConfig>): Promise<Result> {
  try {
    const update: Record<string, unknown> = {};
    Object.entries(patch).forEach(([k, v]) => {
      update[`irlSkillsConfig.${k}`] = v;
    });
    await updateDoc(room(sessionId), update as DocumentData);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------- Subscriptions ------------------------------- */

export function subscribeIrlActivations(sessionId: string, cb: (rows: IrlActivation[]) => void) {
  return onSnapshot(
    sub(sessionId, 'irlActivations'),
    (snap) => cb(snap.docs.map((d) => parseActivation(d.id, d.data())).sort((a, b) => a.requestedAtMs - b.requestedAtMs)),
    () => cb([])
  );
}

export function subscribeIrlRules(sessionId: string, cb: (rows: IrlActiveRule[]) => void) {
  return onSnapshot(
    sub(sessionId, 'irlRules'),
    (snap) => cb(snap.docs.map((d) => parseActiveRule(d.id, d.data())).sort((a, b) => b.activatedAtMs - a.activatedAtMs)),
    () => cb([])
  );
}

/** Facilitators see every report; players pass their uid and only see reports they filed. */
export function subscribeIrlViolations(sessionId: string, cb: (rows: IrlViolation[]) => void, reporterUid?: string) {
  const col = sub(sessionId, 'irlViolations');
  return onSnapshot(
    reporterUid ? query(col, where('reporterUid', '==', reporterUid)) : col,
    (snap) => cb(snap.docs.map((d) => parseViolation(d.id, d.data())).sort((a, b) => a.createdAtMs - b.createdAtMs)),
    () => cb([])
  );
}

export function subscribeIrlPlayerStates(sessionId: string, cb: (rows: Record<string, IrlPlayerState>) => void) {
  return onSnapshot(
    sub(sessionId, 'irlPlayerState'),
    (snap) => {
      const out: Record<string, IrlPlayerState> = {};
      snap.docs.forEach((d) => (out[d.id] = parsePlayerState(d.id, d.data())));
      cb(out);
    },
    () => cb({})
  );
}

/* --------------------------------- Player ----------------------------------- */

export interface ActivationRequestInput {
  sessionId: string;
  skill: ClassSkill;
  casterUid: string;
  casterName: string;
  targetType: IrlTargetType;
  targetUids: string[];
  targetLabel: string;
  /** Open Class Skill Phase; the approval rejects requests from any other phase. */
  phaseId: string;
}

/**
 * Player: request an activation. Nothing is charged until a facilitator transaction approves it.
 * `requestedAt` is the server's clock (enforced by the rules), so the phase window can't be faked.
 */
export async function requestClassSkillActivation(input: ActivationRequestInput): Promise<Result<string>> {
  try {
    const ref = await addDoc(sub(input.sessionId, 'irlActivations'), {
      phaseId: input.phaseId,
      requestedAt: serverTimestamp(),
      skillId: input.skill.id,
      skillName: input.skill.name,
      element: input.skill.element,
      casterUid: input.casterUid,
      casterName: input.casterName.slice(0, 80) || 'Player',
      targetType: input.targetType,
      targetUids: input.targetUids.slice(0, CLASS_SKILL_LIMITS.maxTargets),
      targetLabel: input.targetLabel.slice(0, 120),
      requestedAtMs: Date.now(),
      status: 'pending',
    });
    return { ok: true, value: ref.id };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelClassSkillActivation(sessionId: string, activationId: string): Promise<Result> {
  try {
    await updateDoc(subDoc(sessionId, 'irlActivations', activationId), { status: 'cancelled', decidedAtMs: Date.now() });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Player: flag a possible violation. Never applies a consequence on its own. */
export async function reportPossibleViolation(
  sessionId: string,
  rule: IrlActiveRule,
  reporterUid: string,
  reporterName: string,
  note: string,
  asFacilitator: boolean
): Promise<Result<string>> {
  try {
    const ref = await addDoc(sub(sessionId, 'irlViolations'), {
      ruleId: rule.id,
      targetUid: rule.targetUid,
      reporterUid,
      reporterName: reporterName.slice(0, 80) || 'Player',
      note: note.slice(0, 500),
      status: asFacilitator ? 'reported' : 'player_report',
      createdAtMs: Date.now(),
      decidedBy: null,
      decidedAtMs: null,
      consequenceApplied: null,
    });
    return { ok: true, value: ref.id };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------- Facilitator --------------------------------- */

export interface FacilitatorCtx {
  sessionId: string;
  facilitatorUid: string;
  /** Server-corrected now. */
  nowMs: number;
}

const liveSprintIdOf = (roomData: DocumentData | undefined): string | null => {
  const s = roomData?.classFlowSprint as { id?: unknown; status?: unknown } | undefined;
  return s && typeof s.id === 'string' && s.status === 'live' ? s.id : null;
};

export type ApprovalOutcome = { approved: boolean; reason?: string; blockedUids: string[]; resolvedEffects?: IrlResolvedEffect[]; cost?: number };

/**
 * Approves (or auto-rejects with a reason) a pending activation in one transaction, in this order:
 * validate (phase window, per-phase limit, equipped, unlocked, Participation Points, cooldown, targets)
 * → deduct Participation Points → resolve direct Vault effects and IRL rules → record → publish the skill card.
 * Any failure aborts the whole transaction, so nothing is charged and no cooldown starts.
 */
export async function approveClassSkillActivation(
  ctx: FacilitatorCtx,
  activationId: string,
  targetNames: Record<string, string>
): Promise<Result<ApprovalOutcome>> {
  const actRef = subDoc(ctx.sessionId, 'irlActivations', activationId);
  try {
    // Elemental level comes from the player's existing unlocked moves (no separate leveling system).
    // Read outside the transaction: it only changes through progression, never during an approval.
    let casterMoves: unknown = undefined;
    let casterLoadout: string[] = [];
    let casterEquipped: string[] = [];
    let ledger: { uid: string; amount: number; next: number }[] = [];
    const pre = await getDoc(actRef);
    if (pre.exists()) {
      const casterUid = String(pre.data().casterUid || '');
      try {
        const movesSnap = await getDoc(doc(db, 'battleMoves', casterUid));
        casterMoves = movesSnap.exists() ? movesSnap.data()?.moves ?? null : null;
      } catch {
        casterMoves = undefined;
      }
      const [studentSnap, capacity] = await Promise.all([getDoc(studentRef(casterUid)).catch(() => null), getClassSkillCapacity()]);
      const student = studentSnap?.exists() ? studentSnap.data() : null;
      casterLoadout = parseClassSkillLoadout(student?.classSkillLoadout);
      casterEquipped = parseClassSkillEquipped(student?.classSkillEquipped, capacity);
      if (casterLoadout.length) {
        const all = await getDocs(skillsCol());
        casterLoadout = effectiveClassSkillLoadout(casterLoadout, all.docs.map((d) => ({ id: d.id })));
      }
    }
    const out = await runTransaction(db, async (tx): Promise<ApprovalOutcome> => {
      ledger = [];
      const actSnap = await tx.get(actRef);
      if (!actSnap.exists()) throw new Error('Activation not found');
      const act = parseActivation(actSnap.id, actSnap.data());
      if (act.status !== 'pending') return { approved: act.status === 'approved', reason: `Already ${act.status}`, blockedUids: act.blockedUids };

      const [skillSnap, roomSnap, casterSnap] = await Promise.all([
        tx.get(doc(db, 'classSkills', act.skillId)),
        tx.get(room(ctx.sessionId)),
        tx.get(subDoc(ctx.sessionId, 'irlPlayerState', act.casterUid)),
      ]);
      const targetUids = Array.from(new Set(act.targetUids)).slice(0, CLASS_SKILL_LIMITS.maxTargets);
      const targetSnaps = await Promise.all(
        targetUids.filter((u) => u !== act.casterUid).map((u) => tx.get(subDoc(ctx.sessionId, 'irlPlayerState', u)))
      );
      // Authoritative Vault balances for direct effects (all reads happen before any write).
      const skillEffects = skillSnap.exists() ? parseClassSkill(skillSnap.id, skillSnap.data()).effects : [];
      const hasDirect = skillEffects.some((e) => isDirectEffectType(e.type));
      const vaultUids = hasDirect ? Array.from(new Set([act.casterUid, ...targetUids])) : [];
      const vaultSnaps = await Promise.all(vaultUids.map((u) => tx.get(doc(db, 'vaults', u))));

      const reject = (reason: string) => {
        tx.update(actRef, { status: 'rejected', reason, decidedBy: ctx.facilitatorUid, decidedAtMs: ctx.nowMs });
        tx.set(
          subDoc(ctx.sessionId, 'irlPlayerState', act.casterUid),
          { stats: { activations: increment(1), rejected: increment(1) } },
          { merge: true }
        );
        return { approved: false, reason, blockedUids: [] as string[] };
      };

      if (!skillSnap.exists() || !roomSnap.exists()) return reject('Skill or Live Event not found.');
      const roomData = roomSnap.data();
      if (roomData.status === 'ended') return reject('The Live Event has ended.');
      const skill = parseClassSkill(skillSnap.id, skillSnap.data());
      const config = parseIrlEventConfig(roomData.irlSkillsConfig, typeof roomData.liveEventMode === 'string' ? roomData.liveEventMode : null);
      const players: Record<string, unknown>[] = Array.isArray(roomData.players) ? roomData.players : [];
      const casterIdx = players.findIndex((p) => p?.userId === act.casterUid);
      const participation = casterIdx >= 0 ? Number(players[casterIdx].movesEarned) || 0 : 0;
      const liveSprintId = liveSprintIdOf(roomData);
      const casterState = casterSnap.exists() ? parsePlayerState(act.casterUid, casterSnap.data()) : null;
      const phase = parseClassSkillPhase(roomData.classSkillPhase);

      if (skill.targetType !== act.targetType) return reject('The skill changed after the request. Try again.');
      if (casterIdx < 0) return reject('The player is not in this Live Event.');
      // Timing can't be bypassed: the request must carry this phase's id and a server time inside its window.
      const window = phaseAcceptsRequest(phase, act);
      if (!window.ok) return reject(window.reason);
      if (casterMoves === undefined) throw new Error("Couldn't verify the player's elemental level from this account. An admin account can approve this request.");
      const check = checkActivation({
        skill,
        loadout: casterLoadout,
        equipped: casterEquipped,
        phase: { ok: true, phaseId: phase!.id },
        config,
        casterUid: act.casterUid,
        casterLevel: elementalLevelFromMoves(casterMoves, skill.element),
        casterState,
        participationPoints: participation,
        targetUids,
        nowMs: ctx.nowMs,
        sprintLive: !!liveSprintId,
      });
      if (!check.ok) return reject(check.reason);
      const cost = effectiveCost(skill, config);

      const clock: RuleClock = { nowMs: ctx.nowMs, liveSprintId, eventEnded: false };
      // "Until end of sprint" effects from a phase wait for the next sprint (bound when it starts).
      const expiry = resolveRuleExpiry(skill, ctx.nowMs, null);
      const ruleEffects = skill.effects.filter((e) => !isDirectEffectType(e.type));
      const isRestriction = ruleEffects.some((e) => e.type === 'restriction');
      const locksSkills = ruleEffects.some((e) => e.type === 'restriction' && e.blocksIrlSkills);
      const protectionBlocks = ruleEffects.find((e) => e.type === 'protection')?.blocksRestrictions || 0;
      const stateByUid = new Map<string, IrlPlayerState | null>();
      targetSnaps.forEach((s) => stateByUid.set(s.id, s.exists() ? parsePlayerState(s.id, s.data()) : null));
      stateByUid.set(act.casterUid, casterState);

      const targetStateWrites = new Map<string, Record<string, unknown>>();
      const mergeStateWrite = (uid: string, w: Record<string, unknown>) => targetStateWrites.set(uid, { ...(targetStateWrites.get(uid) || {}), ...w });

      // Direct effects resolve against Vault balances read in this transaction.
      let direct: DirectEffectOutput | null = null;
      if (hasDirect) {
        const vaults: Record<string, DirectVault> = {};
        const floors: Record<string, number> = {};
        const shields: Record<string, number> = {};
        const states: Record<string, IrlPlayerState | null> = {};
        vaultSnaps.forEach((s, i) => {
          const uid = vaultUids[i];
          const d = s.exists() ? s.data() : null;
          vaults[uid] = { exists: !!d, currentPP: Number(d?.currentPP) || 0, capacity: Number(d?.capacity) || DEFAULT_VAULT_CAPACITY };
          const row = players.find((p) => p?.userId === uid);
          const siege = row && (row.participationMode === 'offline' || row.joinedViaSiege === true);
          const siegeFloor = siege ? computeSiegeProtectionFloor(Number(row?.liveEventStartingPP ?? row?.powerPoints) || 0) : 0;
          floors[uid] = Math.max(config.vaultFloorPP, siegeFloor);
          shields[uid] = Math.max(0, Number(row?.shield) || 0);
          states[uid] = stateByUid.get(uid) ?? null;
        });
        direct = resolveDirectEffects({
          activationId,
          effects: skill.effects,
          casterUid: act.casterUid,
          targetUids,
          vaults,
          shields,
          floors,
          states,
          clock,
          expiry: resolveRuleExpiry({ durationKind: skill.durationKind === 'instant' ? 'end_of_event' : skill.durationKind, durationSeconds: skill.durationSeconds }, ctx.nowMs, null),
        });
        Object.entries(direct.stateWrites).forEach(([uid, w]) => mergeStateWrite(uid, w as Record<string, unknown>));
      }

      const ruleIds: string[] = [];
      const blockedUids: string[] = [];
      for (const uid of ruleEffects.length ? targetUids : []) {
        const ruleId = `${activationId}__${uid}`;
        ruleIds.push(ruleId);
        const state = stateByUid.get(uid) ?? null;
        const blocked = isRestriction && uid !== act.casterUid && protectionActive(state, clock);
        if (blocked && state?.protection) {
          blockedUids.push(uid);
          const remaining = state.protection.remaining - 1;
          mergeStateWrite(uid, { protection: remaining > 0 ? { ...state.protection, remaining } : null });
        } else {
          const w: Record<string, unknown> = {};
          if (locksSkills) w.skillLockUntilMs = Math.max(state?.skillLockUntilMs || 0, expiry.expiresAtMs ?? ctx.nowMs + CLASS_SKILL_LIMITS.maxDurationSeconds * 1000);
          if (protectionBlocks) w.protection = { ruleId, remaining: protectionBlocks, expiresAtMs: expiry.expiresAtMs, sprintId: expiry.sprintId };
          if (Object.keys(w).length) mergeStateWrite(uid, w);
        }
        tx.set(subDoc(ctx.sessionId, 'irlRules', ruleId), {
          activationId,
          skillId: skill.id,
          skillName: skill.name,
          element: skill.element,
          casterUid: act.casterUid,
          casterName: act.casterName,
          targetUid: uid,
          targetName: targetNames[uid] || (uid === act.casterUid ? act.casterName : 'Player'),
          effects: ruleEffects,
          irlEffect: skill.irlEffect,
          violationConditions: skill.violationConditions,
          consequence: skill.consequence,
          reward: skill.reward,
          verification: skill.verification,
          durationKind: skill.durationKind,
          activatedAtMs: ctx.nowMs,
          expiresAtMs: expiry.expiresAtMs,
          sprintId: expiry.sprintId,
          status: blocked ? 'blocked' : 'active',
          resolvedBy: blocked ? ctx.facilitatorUid : null,
          resolvedAtMs: blocked ? ctx.nowMs : null,
          resolution: blocked ? 'Blocked by a protection effect' : null,
          ppDelta: 0,
        });
      }

      targetStateWrites.forEach((w, uid) => {
        if (uid !== act.casterUid) tx.set(subDoc(ctx.sessionId, 'irlPlayerState', uid), w, { merge: true });
      });
      tx.set(
        subDoc(ctx.sessionId, 'irlPlayerState', act.casterUid),
        {
          ...(targetStateWrites.get(act.casterUid) || {}),
          cooldowns: { [skill.id]: ctx.nowMs + skill.cooldownSeconds * 1000 },
          stats: { activations: increment(1), approved: increment(1) },
        },
        { merge: true }
      );

      const nameOf = (uid: string) => targetNames[uid] || (uid === act.casterUid ? act.casterName : 'Player');
      const resolvedEffects = direct?.resolved ?? [];
      const resultLines = resolvedEffects.filter((r) => r.kind !== 'protection' && r.kind !== 'modifier').map((r) => describeResolvedEffect(r, nameOf));
      const roomUpdate: Record<string, unknown> = {
        recentSkillActivations: appendSkillActivationRecord(
          roomData.recentSkillActivations,
          {
            ...buildSkillActivationRecord({
              actorUid: act.casterUid,
              actorName: act.casterName,
              sourceUid: ctx.facilitatorUid,
              targetName: act.targetLabel || null,
              move: { id: classSkillArtKey(skill.id), name: skill.name, category: 'elemental', elementalAffinity: skill.element },
              now: ctx.nowMs,
            }),
            details: [
              skill.irlEffect || (skill.effects[0] ? describeEffect(skill.effects[0]) : ''),
              ...resultLines.slice(0, 2),
              resultLines.length > 2 ? `+${resultLines.length - 2} more` : '',
              ruleEffects.length ? `Duration: ${describeDuration(skill)}` : '',
              blockedUids.length ? `Blocked by protection: ${blockedUids.length}` : '',
              `Cost: ${cost} Participation Point${cost === 1 ? '' : 's'}`,
            ]
              .filter(Boolean)
              .slice(0, 5),
          }
        ),
        [`classSkillPhase.activationCounts.${act.casterUid}`]: (phase!.activationCounts[act.casterUid] || 0) + 1,
        [`classSkillPhase.decisions.${act.casterUid}`]: { choice: 'activated', atMs: ctx.nowMs },
        'classSkillPhase.ppSpent': increment(cost),
      };
      const shieldChanges = direct?.shields ?? {};
      if (cost > 0 || Object.keys(shieldChanges).length) {
        roomUpdate.players = players.map((p, i) => {
          const uid = typeof p?.userId === 'string' ? p.userId : '';
          let row = p;
          if (i === casterIdx && cost > 0) row = { ...row, movesEarned: participation - cost };
          if (uid in shieldChanges) row = { ...row, shield: shieldChanges[uid] };
          return row;
        });
      }
      tx.update(room(ctx.sessionId), roomUpdate as DocumentData);
      Object.entries(direct?.vaultPP ?? {}).forEach(([uid, next]) => {
        tx.update(doc(db, 'vaults', uid), { currentPP: next });
        ledger.push({ uid, amount: direct!.ppDelta[uid] || 0, next });
      });
      tx.update(actRef, {
        status: 'approved',
        decidedBy: ctx.facilitatorUid,
        decidedAtMs: ctx.nowMs,
        costCharged: cost,
        ruleIds,
        blockedUids,
        resolvedEffects,
        reason: null,
      });
      return { approved: true, blockedUids, resolvedEffects, cost };
    });
    // Vault is the source of truth; students/users are display mirrors that a facilitator account may not be allowed to write.
    if (out.approved) {
      await Promise.all(
        ledger.map(async ({ uid, amount, next }) => {
          await updateDoc(studentRef(uid), { powerPoints: next }).catch(() => undefined);
          await setDoc(doc(db, 'users', uid), { powerPoints: next }, { merge: true }).catch(() => undefined);
          if (amount) void recordPPChange({ studentId: uid, amount, sourceType: 'classSkill', sourceId: `${ctx.sessionId}:${activationId}`, notes: 'Class Skill Vault effect' }).catch(() => undefined);
        })
      );
    }
    return { ok: true, value: out };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectClassSkillActivation(ctx: FacilitatorCtx, activationId: string, reason: string): Promise<Result> {
  const actRef = subDoc(ctx.sessionId, 'irlActivations', activationId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(actRef);
      if (!snap.exists()) throw new Error('Activation not found');
      const act = parseActivation(snap.id, snap.data());
      if (act.status !== 'pending') return;
      tx.update(actRef, { status: 'rejected', reason: reason.slice(0, 300) || 'Rejected by facilitator', decidedBy: ctx.facilitatorUid, decidedAtMs: ctx.nowMs });
      tx.set(
        subDoc(ctx.sessionId, 'irlPlayerState', act.casterUid),
        { stats: { activations: increment(1), rejected: increment(1) } },
        { merge: true }
      );
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Clears locks / protections that belong to a rule that is no longer active. */
function releaseRuleState(rule: IrlActiveRule, state: IrlPlayerState | null): Record<string, unknown> {
  const w: Record<string, unknown> = {};
  if (rule.effects.some((e) => e.type === 'restriction' && e.blocksIrlSkills)) w.skillLockUntilMs = 0;
  if (state?.protection?.ruleId === rule.id) w.protection = null;
  return w;
}

/** Facilitator override: end any active effect immediately. */
export async function endClassSkillRule(ctx: FacilitatorCtx, ruleId: string, reason = 'Ended by facilitator'): Promise<Result> {
  const ruleRef = subDoc(ctx.sessionId, 'irlRules', ruleId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ruleRef);
      if (!snap.exists()) throw new Error('Rule not found');
      const rule = parseActiveRule(snap.id, snap.data());
      if (rule.status !== 'active') return;
      const stateRef = subDoc(ctx.sessionId, 'irlPlayerState', rule.targetUid);
      const stateSnap = await tx.get(stateRef);
      const state = stateSnap.exists() ? parsePlayerState(rule.targetUid, stateSnap.data()) : null;
      tx.update(ruleRef, { status: 'ended', resolvedBy: ctx.facilitatorUid, resolvedAtMs: ctx.nowMs, resolution: reason.slice(0, 200) });
      tx.set(stateRef, { ...releaseRuleState(rule, state), stats: { overrides: increment(1) } }, { merge: true });
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Facilitator confirms a rule was completed (challenge done, privilege used, bonus earned).
 * Reward PP moves through applyPlayerPPDelta with the rule as the idempotency guard, so the
 * reward is paid exactly once and never for an expired rule.
 */
export async function completeClassSkillRule(
  ctx: FacilitatorCtx,
  rule: IrlActiveRule,
  clock: RuleClock,
  approvedCredit = 0
): Promise<Result<{ rewardPP: number }>> {
  const ruleRef = subDoc(ctx.sessionId, 'irlRules', rule.id);
  const rewardPP = computeRewardPP(rule.reward, approvedCredit);
  const claim = {
    status: 'completed',
    resolvedBy: ctx.facilitatorUid,
    resolvedAtMs: ctx.nowMs,
    resolution: rewardPP > 0 ? `Completed · +${rewardPP} PP` : 'Completed',
    ppDelta: rewardPP,
  };
  const claimable = (d: DocumentData | undefined) => !!d && isRuleEnforceable(parseActiveRule(rule.id, d), clock);
  try {
    if (rewardPP > 0) {
      const res = await applyPlayerPPDelta(rule.targetUid, rewardPP, {
        mode: 'award',
        meta: { sourceType: 'classSkill', sourceId: `${ctx.sessionId}:${rule.id}:reward`, notes: `Class Skill reward — ${rule.skillName}` },
        guard: { ref: ruleRef, isClaimable: claimable, claimUpdate: claim },
      });
      if (res.skipped) return { ok: false, error: 'This effect is no longer active (already resolved or expired).' };
    } else {
      const done = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ruleRef);
        if (!claimable(snap.exists() ? snap.data() : undefined)) return false;
        tx.update(ruleRef, claim);
        return true;
      });
      if (!done) return { ok: false, error: 'This effect is no longer active (already resolved or expired).' };
    }
    await setDoc(
      subDoc(ctx.sessionId, 'irlPlayerState', rule.targetUid),
      { ...releaseRuleState(rule, null), stats: { rulesCompleted: increment(1), rewardsPP: increment(rewardPP) } },
      { merge: true }
    );
    return { ok: true, value: { rewardPP } };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Facilitator confirms a violation. The rule itself is the idempotency key: it moves from
 * `active` to `violated` exactly once, and only while it is still enforceable, so the bounded
 * consequence can never be applied twice or after the rule expired.
 */
export async function confirmClassSkillViolation(
  ctx: FacilitatorCtx,
  violation: IrlViolation,
  rule: IrlActiveRule,
  clock: RuleClock
): Promise<Result<{ applied: string }>> {
  const ruleRef = subDoc(ctx.sessionId, 'irlRules', rule.id);
  const violationRef = subDoc(ctx.sessionId, 'irlViolations', violation.id);
  const stateRef = subDoc(ctx.sessionId, 'irlPlayerState', rule.targetUid);
  const c = rule.consequence;
  const penalty = consequencePP(c);
  const applied = describeConsequence(c);
  const claim = {
    status: 'violated',
    resolvedBy: ctx.facilitatorUid,
    resolvedAtMs: ctx.nowMs,
    resolution: `Violation confirmed · ${applied}`,
    ppDelta: -penalty,
  };
  const claimable = (d: DocumentData | undefined) => !!d && isRuleEnforceable(parseActiveRule(rule.id, d), clock);
  try {
    let bonusRuleIds: string[] = [];
    if (c.type === 'end_active_bonus') {
      const snap = await getDocs(query(sub(ctx.sessionId, 'irlRules'), where('targetUid', '==', rule.targetUid), where('status', '==', 'active')));
      bonusRuleIds = snap.docs
        .map((d) => parseActiveRule(d.id, d.data()))
        .filter((r) => r.id !== rule.id && r.effects.some((e) => e.type === 'privilege' || e.type === 'reward_modifier' || e.type === 'protection'))
        .map((r) => r.id);
    }

    if (penalty > 0) {
      const res = await applyPlayerPPDelta(rule.targetUid, -penalty, {
        mode: 'award',
        meta: { sourceType: 'classSkill', sourceId: `${ctx.sessionId}:${rule.id}:violation`, notes: `Class Skill consequence — ${rule.skillName}` },
        guard: { ref: ruleRef, isClaimable: claimable, claimUpdate: claim },
      });
      if (res.skipped) return { ok: false, error: 'This effect is no longer active, so no consequence can be applied.' };
      await updateDoc(violationRef, { status: 'confirmed', decidedBy: ctx.facilitatorUid, decidedAtMs: ctx.nowMs, consequenceApplied: applied });
      await setDoc(stateRef, { ...releaseRuleState(rule, null), stats: { violations: increment(1), penaltiesPP: increment(Math.abs(res.applied)) } }, { merge: true });
      return { ok: true, value: { applied } };
    }

    const done = await runTransaction(db, async (tx) => {
      const [ruleSnap, stateSnap] = await Promise.all([tx.get(ruleRef), tx.get(stateRef)]);
      if (!claimable(ruleSnap.exists() ? ruleSnap.data() : undefined)) return false;
      const state = stateSnap.exists() ? parsePlayerState(rule.targetUid, stateSnap.data()) : null;
      const stateWrite: Record<string, unknown> = { ...releaseRuleState(rule, state), stats: { violations: increment(1) } };
      if (c.type === 'warning') stateWrite.warnings = increment(1);
      if (c.type === 'disable_irl_skills' && c.amount > 0) {
        stateWrite.disabledUntilMs = Math.max(state?.disabledUntilMs || 0, ctx.nowMs + c.amount * 60_000);
      }
      if (c.type === 'end_active_bonus') {
        bonusRuleIds.forEach((id) =>
          tx.update(subDoc(ctx.sessionId, 'irlRules', id), {
            status: 'ended',
            resolvedBy: ctx.facilitatorUid,
            resolvedAtMs: ctx.nowMs,
            resolution: `Ended by a confirmed violation of ${rule.skillName}`,
          })
        );
        if (state?.protection && bonusRuleIds.includes(state.protection.ruleId)) stateWrite.protection = null;
      }
      tx.update(ruleRef, claim);
      tx.update(violationRef, { status: 'confirmed', decidedBy: ctx.facilitatorUid, decidedAtMs: ctx.nowMs, consequenceApplied: applied });
      tx.set(stateRef, stateWrite, { merge: true });
      return true;
    });
    if (!done) return { ok: false, error: 'This effect is no longer active, so no consequence can be applied.' };
    return { ok: true, value: { applied } };
  } catch (e) {
    return fail(e);
  }
}

export async function dismissClassSkillViolation(ctx: FacilitatorCtx, violationId: string): Promise<Result> {
  try {
    await updateDoc(subDoc(ctx.sessionId, 'irlViolations', violationId), {
      status: 'dismissed',
      decidedBy: ctx.facilitatorUid,
      decidedAtMs: ctx.nowMs,
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Marks a rule whose window closed (time, sprint end, event end) as expired and frees its locks.
 * Sprint and event state are read from the room inside the transaction, never from the caller.
 */
export async function expireClassSkillRule(ctx: FacilitatorCtx, ruleId: string): Promise<Result> {
  const ruleRef = subDoc(ctx.sessionId, 'irlRules', ruleId);
  try {
    await runTransaction(db, async (tx) => {
      const [snap, roomSnap] = await Promise.all([tx.get(ruleRef), tx.get(room(ctx.sessionId))]);
      if (!snap.exists()) return;
      const roomData = roomSnap.exists() ? roomSnap.data() : undefined;
      const clock: RuleClock = { nowMs: ctx.nowMs, liveSprintId: liveSprintIdOf(roomData), eventEnded: !roomData || roomData.status === 'ended' };
      const rule = parseActiveRule(snap.id, snap.data());
      if (rule.status !== 'active' || isRuleEnforceable(rule, clock)) return;
      const stateRef = subDoc(ctx.sessionId, 'irlPlayerState', rule.targetUid);
      const stateSnap = await tx.get(stateRef);
      const state = stateSnap.exists() ? parsePlayerState(rule.targetUid, stateSnap.data()) : null;
      const release = releaseRuleState(rule, state);
      // A timed lock already lapses on its own; only clear it when it was held open by this rule.
      if (rule.expiresAtMs != null) delete release.skillLockUntilMs;
      tx.update(ruleRef, { status: 'expired', resolvedAtMs: clock.nowMs, resolution: 'Expired' });
      if (Object.keys(release).length) tx.set(stateRef, release, { merge: true });
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
