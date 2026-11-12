/**
 * Direct Class Skill effects on Vaults (pure; the approval transaction feeds it authoritative balances).
 *
 * Kept apart from the battle engine: Vault Siege and In-Game Skills never call this, and `bypassShields`
 * only changes how these Class Skill effects resolve. Amounts come from the stored skill, never the client.
 * - Transfers conserve PP: the target loses exactly what the caster gains (limited by the caster's capacity).
 * - Damage and penalties remove PP; rewards create PP up to the recipient's Vault capacity.
 * - Balances never go below the protected minimum (or 0); shields absorb first unless the effect bypasses them.
 */
import type { DirectEffectType, IrlPlayerState, IrlResolvedEffect, IrlRuleEffect } from '../types/classSkills';
import { CLASS_SKILL_LIMITS, isDirectEffectType, type RuleClock } from './classSkillsConfig';

export interface DirectVault {
  exists: boolean;
  currentPP: number;
  capacity: number;
}

export interface DirectEffectInput {
  activationId: string;
  effects: IrlRuleEffect[];
  casterUid: string;
  targetUids: string[];
  vaults: Record<string, DirectVault>;
  /** In-event shield (Live Event room row); used only when an effect doesn't bypass shields. */
  shields: Record<string, number>;
  /** Protected minimum Vault PP per player. */
  floors: Record<string, number>;
  states: Record<string, IrlPlayerState | null>;
  clock: RuleClock;
  /** Duration of protections / modifiers created by this activation. */
  expiry: { expiresAtMs: number | null; sprintId: string | null };
}

export interface DirectStateWrite {
  vaultProtection?: IrlPlayerState['vaultProtection'];
  vaultModifier?: IrlPlayerState['vaultModifier'];
}

export interface DirectEffectOutput {
  /** New Vault balance for every player whose balance changed. */
  vaultPP: Record<string, number>;
  /** New in-event shield for every player whose shield changed. */
  shields: Record<string, number>;
  stateWrites: Record<string, DirectStateWrite>;
  resolved: IrlResolvedEffect[];
  /** Net PP change per player. */
  ppDelta: Record<string, number>;
}

const windowOpen = (w: { expiresAtMs: number | null; sprintId: string | null }, clock: RuleClock) =>
  !clock.eventEnded && (w.expiresAtMs == null || clock.nowMs < w.expiresAtMs) && (!w.sprintId || w.sprintId === clock.liveSprintId);

export function vaultProtectionActive(state: IrlPlayerState | null | undefined, clock: RuleClock): boolean {
  const p = state?.vaultProtection;
  return !!p && p.remaining > 0 && windowOpen(p, clock);
}

export function vaultMultiplier(state: IrlPlayerState | null | undefined, clock: RuleClock): number {
  const m = state?.vaultModifier;
  return m && windowOpen(m, clock) ? m.multiplier : 1;
}

const whole = (n: unknown) => Math.max(0, Math.floor(Number(n) || 0));

export function resolveDirectEffects(input: DirectEffectInput): DirectEffectOutput {
  const { casterUid, clock } = input;
  const pp: Record<string, number> = {};
  const startPP: Record<string, number> = {};
  const shields: Record<string, number> = {};
  const startShield: Record<string, number> = {};
  const states: Record<string, IrlPlayerState | null> = { ...input.states };
  const stateWrites: Record<string, DirectStateWrite> = {};
  const resolved: IrlResolvedEffect[] = [];
  /** Targets whose Vault protection already blocked this activation (one block per activation). */
  const shielded = new Set<string>();
  const exposed = new Set<string>();

  const vault = (uid: string) => input.vaults[uid];
  const balance = (uid: string) => {
    if (!(uid in pp)) pp[uid] = startPP[uid] = whole(vault(uid)?.currentPP);
    return pp[uid];
  };
  const shieldOf = (uid: string) => {
    if (!(uid in shields)) shields[uid] = startShield[uid] = whole(input.shields[uid]);
    return shields[uid];
  };
  const floor = (uid: string) => whole(input.floors[uid]);
  const capacity = (uid: string) => Math.max(0, Math.floor(Number(vault(uid)?.capacity) || 1000));
  const roomFor = (uid: string) => Math.max(0, capacity(uid) - balance(uid));
  const push = (r: Omit<IrlResolvedEffect, 'toUid'> & { toUid?: string | null }) => resolved.push({ toUid: null, ...r });

  /** True when the target's Vault protection stops this activation (consumes one block the first time). */
  const blockedBy = (uid: string): boolean => {
    if (shielded.has(uid)) return true;
    if (exposed.has(uid)) return false;
    const state = states[uid];
    if (!vaultProtectionActive(state, clock) || !state?.vaultProtection) {
      exposed.add(uid);
      return false;
    }
    const remaining = state.vaultProtection.remaining - 1;
    const next = remaining > 0 ? { ...state.vaultProtection, remaining } : null;
    states[uid] = { ...state, vaultProtection: next };
    stateWrites[uid] = { ...stateWrites[uid], vaultProtection: next };
    shielded.add(uid);
    return true;
  };

  const effects = input.effects.filter((e) => isDirectEffectType(e.type)).slice(0, CLASS_SKILL_LIMITS.maxEffects);
  const targets = Array.from(new Set(input.targetUids)).slice(0, CLASS_SKILL_LIMITS.maxTargets);

  for (const e of effects) {
    const type = e.type as DirectEffectType;
    const base = Math.min(CLASS_SKILL_LIMITS.maxDirectPP, whole(e.amount));
    const scaled = (uid: string) => Math.min(CLASS_SKILL_LIMITS.maxDirectPP * CLASS_SKILL_LIMITS.maxVaultMultiplier, Math.floor(base * vaultMultiplier(states[uid], clock)));

    /**
     * Takes PP from `uid` (shield first unless bypassing), never below the protected minimum and never more than `cap`.
     * Records the outcome; `toUid` receives the PP for transfers.
     */
    const takeFrom = (uid: string, requested: number, opts: { bypass: boolean; kind: 'removal' | 'transfer'; toUid?: string; protectable: boolean }) => {
      const rec = { effectId: e.id, type, targetUid: uid, requested, kind: opts.kind, toUid: opts.toUid ?? null };
      if (!vault(uid)?.exists) return push({ ...rec, amount: 0, shieldAbsorbed: 0, note: 'No Vault' });
      if (opts.protectable && blockedBy(uid)) return push({ ...rec, amount: 0, shieldAbsorbed: 0, note: 'Blocked by Vault protection' });
      const absorbed = opts.bypass ? 0 : Math.min(shieldOf(uid), requested);
      if (absorbed) shields[uid] = shieldOf(uid) - absorbed;
      const want = requested - absorbed;
      const available = Math.max(0, balance(uid) - floor(uid));
      const cap = opts.toUid ? roomFor(opts.toUid) : Number.POSITIVE_INFINITY;
      const take = Math.min(want, available, cap);
      pp[uid] = balance(uid) - take;
      if (opts.toUid) pp[opts.toUid] = balance(opts.toUid) + take;
      const notes: string[] = [];
      if (opts.bypass && type !== 'player_penalty') notes.push('Bypassed shields');
      if (absorbed) notes.push(`Shield absorbed ${absorbed}`);
      if (take < want) notes.push(available < want ? 'Limited by the protected minimum' : "Limited by the caster's Vault capacity");
      return push({ ...rec, amount: take, shieldAbsorbed: absorbed, note: notes.join(' · ') });
    };

    if (type === 'vault_damage' || type === 'vault_transfer') {
      for (const uid of targets) {
        if (uid === casterUid) continue;
        const requested = scaled(uid);
        if (type === 'vault_transfer' && !vault(casterUid)?.exists) {
          push({ effectId: e.id, type, targetUid: uid, amount: 0, requested, shieldAbsorbed: 0, kind: 'transfer', toUid: casterUid, note: 'Caster has no Vault' });
          continue;
        }
        takeFrom(uid, requested, {
          bypass: e.bypassShields === true,
          kind: type === 'vault_transfer' ? 'transfer' : 'removal',
          toUid: type === 'vault_transfer' ? casterUid : undefined,
          protectable: true,
        });
      }
    } else if (type === 'player_penalty') {
      // Penalties are not attacks: shields never absorb them. A caster-paid penalty (a skill's drawback) can't be blocked.
      if (e.recipient === 'caster') takeFrom(casterUid, base, { bypass: true, kind: 'removal', protectable: false });
      else targets.filter((u) => u !== casterUid).forEach((uid) => takeFrom(uid, scaled(uid), { bypass: true, kind: 'removal', protectable: true }));
    } else if (type === 'player_reward') {
      const recipients = e.recipient === 'target' ? targets : [casterUid];
      for (const uid of recipients) {
        if (!vault(uid)?.exists) {
          push({ effectId: e.id, type, targetUid: uid, amount: 0, requested: base, shieldAbsorbed: 0, kind: 'award', note: 'No Vault' });
          continue;
        }
        const give = Math.min(base, roomFor(uid));
        pp[uid] = balance(uid) + give;
        push({ effectId: e.id, type, targetUid: uid, amount: give, requested: base, shieldAbsorbed: 0, kind: 'award', note: give < base ? 'Limited by Vault capacity' : '' });
      }
    } else if (type === 'vault_protection' || type === 'vault_modifier') {
      for (const uid of targets) {
        const state = states[uid] ?? null;
        if (type === 'vault_protection') {
          const vp = { activationId: input.activationId, remaining: e.blocksVaultEffects || 1, ...input.expiry };
          states[uid] = state ? { ...state, vaultProtection: vp } : state;
          exposed.delete(uid);
          stateWrites[uid] = { ...stateWrites[uid], vaultProtection: vp };
          push({ effectId: e.id, type, targetUid: uid, amount: 0, requested: 0, shieldAbsorbed: 0, kind: 'protection', note: `Blocks ${vp.remaining} Vault effect${vp.remaining === 1 ? '' : 's'}` });
        } else {
          const vm = { activationId: input.activationId, multiplier: e.multiplier ?? 1, ...input.expiry };
          states[uid] = state ? { ...state, vaultModifier: vm } : state;
          stateWrites[uid] = { ...stateWrites[uid], vaultModifier: vm };
          push({ effectId: e.id, type, targetUid: uid, amount: 0, requested: 0, shieldAbsorbed: 0, kind: 'modifier', note: `Incoming Vault effects ×${vm.multiplier}` });
        }
      }
    }
  }

  const vaultPP: Record<string, number> = {};
  const ppDelta: Record<string, number> = {};
  Object.keys(pp).forEach((uid) => {
    if (pp[uid] !== startPP[uid]) {
      vaultPP[uid] = pp[uid];
      ppDelta[uid] = pp[uid] - startPP[uid];
    }
  });
  const shieldOut: Record<string, number> = {};
  Object.keys(shields).forEach((uid) => {
    if (shields[uid] !== startShield[uid]) shieldOut[uid] = shields[uid];
  });
  return { vaultPP, shields: shieldOut, stateWrites, resolved, ppDelta };
}

/** One short line per resolved effect, for the skill card and history. */
export function describeResolvedEffect(r: IrlResolvedEffect, nameOf: (uid: string) => string): string {
  const who = nameOf(r.targetUid);
  switch (r.kind) {
    case 'transfer':
      return r.amount ? `${who} → ${nameOf(r.toUid || '')}: ${r.amount} PP transferred` : `${who}: no PP transferred${r.note ? ` (${r.note})` : ''}`;
    case 'removal':
      return `${who}: −${r.amount} Vault PP${r.shieldAbsorbed ? ` (shield absorbed ${r.shieldAbsorbed})` : ''}${r.amount === 0 && r.note ? ` (${r.note})` : ''}`;
    case 'award':
      return `${who}: +${r.amount} Vault PP${r.amount === 0 && r.note ? ` (${r.note})` : ''}`;
    default:
      return `${who}: ${r.note}`;
  }
}
