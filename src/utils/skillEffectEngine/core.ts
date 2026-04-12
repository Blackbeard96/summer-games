/**
 * MST Skill Effects Engine — pure combatant mutations and hooks.
 *
 * Adding a new effect type:
 * 1. Add to `SKILL_EFFECT_TYPES` in `src/types/skillEffects.ts`
 * 2. Add registry row in `src/data/skillEffectRegistry.ts` (labels + form fields + defaults)
 * 3. Implement handling in `applyEffectToCombatant` and any of:
 *    `modifyIncomingDamage`, `modifyOutgoingDamage`, `canUseSkill`, `tickEffectDurations`,
 *    `processTurnStartEffects`, `processReactiveEffects` (incoming damage path)
 * 4. If the resolver should stamp numeric deltas, extend `resolverBridge.ts`
 * 5. Add unit tests in `src/utils/__tests__/skillEffectEngine.test.ts`
 */

import type { Buff, Debuff } from '../../types/battle';
import type {
  ReactiveEffect,
  SkillEffectInstance,
  SkillEffectPayload,
  SkillEffectType,
} from '../../types/skillEffects';
import { getElementMultiplier } from '../elementAdvantages';
import type { ElementType } from '../../types/elementTypes';
import { normalizeElementType } from '../../types/elementTypes';
import type { ValidatedSkillEffect } from './validate';

export interface EffectCombatantState {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  shieldPoints: number;
  isHidden: boolean;
  /** Delay / stun-style: skip the next full action when > 0 */
  skipNextAction: number;
  activeEffects: SkillEffectInstance[];
  reactiveEffects: ReactiveEffect[];
  buffs: Buff[];
  debuffs: Debuff[];
  cooldowns: Record<string, number>;
  lastAction: { moveId: string; moveName: string; tags?: string[] } | null;
  battleHistory: Array<{ turn: number; actorId: string; moveId: string; moveName?: string }>;
  currentTurn: number;
}

export function createEmptyEffectCombatant(
  id: string,
  name: string,
  maxHp: number,
  partial?: Partial<Pick<EffectCombatantState, 'shieldPoints' | 'isHidden'>>
): EffectCombatantState {
  return {
    id,
    name,
    hp: maxHp,
    maxHp,
    shieldPoints: partial?.shieldPoints ?? 0,
    isHidden: partial?.isHidden ?? false,
    skipNextAction: 0,
    activeEffects: [],
    reactiveEffects: [],
    buffs: [],
    debuffs: [],
    cooldowns: {},
    lastAction: null,
    battleHistory: [],
    currentTurn: 0,
  };
}

function newInstanceId(): string {
  return `se_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function rollChance(chance: number, rng: () => number): boolean {
  return rng() * 100 < chance;
}

export function hasEffectType(c: EffectCombatantState, t: SkillEffectType): boolean {
  return c.activeEffects.some((e) => e.payload.type === t);
}

export function sumMarkDamageBonusPercent(c: EffectCombatantState): number {
  let sum = 0;
  for (const inst of c.activeEffects) {
    if (inst.payload.type === 'mark_target' && typeof inst.payload.value === 'number') {
      sum += inst.payload.value * Math.max(1, inst.stacks);
    }
  }
  return sum;
}

export function sumBuffDefensePercent(c: EffectCombatantState): number {
  let sum = 0;
  for (const inst of c.activeEffects) {
    if (inst.payload.type === 'buff_defense' && typeof inst.payload.value === 'number') {
      sum += inst.payload.value * Math.max(1, inst.stacks);
    }
  }
  return Math.min(95, sum);
}

export function sumBuffAttackPercent(c: EffectCombatantState): number {
  let sum = 0;
  for (const inst of c.activeEffects) {
    if (inst.payload.type === 'buff_attack' && typeof inst.payload.value === 'number') {
      sum += inst.payload.value * Math.max(1, inst.stacks);
    }
  }
  return sum;
}

export interface ApplyEffectResult {
  logs: string[];
}

export function applyHealFlat(target: EffectCombatantState, amount: number): { healed: number; log: string } {
  const cap = Math.max(0, target.maxHp - target.hp);
  const healed = Math.min(cap, Math.max(0, Math.floor(amount)));
  target.hp += healed;
  return {
    healed,
    log: healed > 0 ? `${target.name} recovered ${healed} HP.` : `${target.name} is already at full health.`,
  };
}

function pushInstance(
  c: EffectCombatantState,
  payload: ValidatedSkillEffect,
  sourceId: string,
  stacks = 1
): SkillEffectInstance {
  const duration =
    payload.duration === null || payload.duration === undefined ? null : Math.max(0, payload.duration);
  const inst: SkillEffectInstance = {
    id: newInstanceId(),
    payload: { ...payload },
    remainingTurns: duration,
    sourceId,
    stacks,
  };

  if (!payload.stackable) {
    c.activeEffects = c.activeEffects.filter((e) => e.payload.type !== payload.type || e.sourceId !== sourceId);
  } else {
    const existing = c.activeEffects.find((e) => e.payload.type === payload.type && e.sourceId === sourceId);
    const max = payload.maxStacks ?? 3;
    if (existing) {
      if (existing.stacks < max) {
        existing.stacks += 1;
        if (duration !== null) existing.remainingTurns = Math.max(existing.remainingTurns ?? 0, duration);
        return existing;
      }
      return existing;
    }
  }

  c.activeEffects.push(inst);
  return inst;
}

/** Apply one validated payload onto a recipient combatant (mutates). */
export function applyEffectToCombatant(
  recipient: EffectCombatantState,
  payload: ValidatedSkillEffect,
  sourceId: string,
  rng: () => number,
  logCtx?: { actorName?: string; skillName?: string }
): ApplyEffectResult {
  const logs: string[] = [];
  const actorN = logCtx?.actorName ?? 'Actor';
  const sk = logCtx?.skillName ?? 'skill';

  if (!rollChance(payload.chance ?? 100, rng)) {
    logs.push(`${actorN}'s ${sk} effect (${payload.type}) failed to apply (${payload.chance ?? 100}% chance).`);
    return { logs };
  }

  switch (payload.type) {
    case 'heal': {
      const { healed, log } = applyHealFlat(recipient, payload.value ?? 0);
      logs.push(log);
      break;
    }
    case 'shield': {
      const amt = Math.max(0, Math.floor(payload.value ?? 0));
      recipient.shieldPoints += amt;
      logs.push(`${recipient.name} gained ${amt} shield${payload.duration ? ` for ${payload.duration} turn(s).` : '.'}`);
      pushInstance(recipient, payload, sourceId);
      break;
    }
    case 'silence':
      pushInstance(recipient, payload, sourceId);
      logs.push(`${recipient.name} is Silenced${payload.duration ? ` for ${payload.duration} turn(s).` : '.'}`);
      break;
    case 'root':
      pushInstance(recipient, payload, sourceId);
      logs.push(`${recipient.name} is Rooted${payload.duration ? ` for ${payload.duration} turn(s).` : '.'}`);
      break;
    case 'confuse':
      pushInstance(recipient, payload, sourceId);
      logs.push(`${recipient.name} is Confused${payload.duration ? ` for ${payload.duration} turn(s).` : '.'}`);
      break;
    case 'mark_target':
      pushInstance(recipient, payload, sourceId);
      logs.push(
        `${recipient.name} was Marked${payload.duration ? ` (${payload.duration}t)` : ''} — takes ${payload.value ?? 0}% more damage from attacks.`
      );
      break;
    case 'reveal':
      recipient.isHidden = false;
      logs.push(`${recipient.name} was revealed.`);
      break;
    case 'delay': {
      const lose = payload.metadata?.loseNextAction !== false;
      if (lose) {
        recipient.skipNextAction += 1;
        logs.push(`${recipient.name} loses their next action (Delay).`);
      }
      break;
    }
    case 'predict_move': {
      recipient.reactiveEffects.push({
        kind: 'predict_move',
        reductionPercent: Math.min(95, Math.max(0, payload.value ?? 0)),
        remainingTriggers: 1,
        sourceId,
      });
      logs.push(`${recipient.name} gained prediction for the next incoming attack (-${payload.value ?? 0}% damage).`);
      break;
    }
    case 'buff_attack':
    case 'buff_defense':
    case 'buff_speed':
      pushInstance(recipient, payload, sourceId);
      logs.push(`${recipient.name} gained ${payload.type.replace(/_/g, ' ')} (${payload.value ?? 0}%)${payload.duration ? ` for ${payload.duration}t.` : '.'}`);
      break;
    case 'add_element_tag':
      pushInstance(recipient, payload, sourceId);
      logs.push(`${recipient.name}'s next attack is tagged with element: ${payload.elementTag ?? 'neutral'}.`);
      break;
    case 'remove_buff': {
      const removeAll = Boolean(payload.metadata?.removeAll);
      const before = recipient.buffs.length;
      if (removeAll) {
        recipient.buffs = [];
      } else if (recipient.buffs.length > 0) {
        recipient.buffs = recipient.buffs.slice(1);
      }
      const removed = before - recipient.buffs.length;
      logs.push(removed > 0 ? `${removed} buff(s) stripped from ${recipient.name}.` : `No buffs to remove on ${recipient.name}.`);
      break;
    }
    case 'reduce_cooldown': {
      const scope = payload.metadata?.scope;
      const amt = Math.max(0, Math.floor(payload.value ?? 1));
      if (scope === 'selected_skill' && typeof payload.metadata?.skillId === 'string') {
        const id = payload.metadata.skillId as string;
        if (recipient.cooldowns[id] !== undefined) {
          recipient.cooldowns[id] = Math.max(0, recipient.cooldowns[id] - amt);
          logs.push(`Cooldown on ${id} reduced by ${amt}.`);
        }
      } else {
        let any = false;
        for (const k of Object.keys(recipient.cooldowns)) {
          if (recipient.cooldowns[k] > 0) {
            recipient.cooldowns[k] = Math.max(0, recipient.cooldowns[k] - amt);
            any = true;
          }
        }
        logs.push(any ? `Cooldowns reduced by ${amt} (all skills).` : `No active cooldowns on ${recipient.name}.`);
      }
      break;
    }
    case 'transfer_debuff': {
      logs.push(`transfer_debuff: use transferDebuffsBetweenCombatants() with caster + enemy.`);
      break;
    }
    case 'copy_last_move': {
      logs.push(`copy_last_move: resolved via resolveCopyLastMove().`);
      break;
    }
    default:
      logs.push(`Effect "${payload.type}" has no apply handler yet.`);
  }

  return { logs };
}

export function transferDebuffsBetweenCombatants(
  from: EffectCombatantState,
  to: EffectCombatantState,
  maxCount: number,
  rng: () => number
): { moved: Debuff[]; logs: string[] } {
  const logs: string[] = [];
  const moved: Debuff[] = [];
  let n = Math.max(1, Math.floor(maxCount));
  while (n > 0 && from.debuffs.length > 0) {
    const [d, ...rest] = from.debuffs;
    from.debuffs = rest;
    to.debuffs = [...to.debuffs, d];
    moved.push(d);
    n -= 1;
  }
  if (moved.length) {
    logs.push(`Moved ${moved.length} debuff(s) from ${from.name} to ${to.name}.`);
  } else {
    logs.push(`No debuffs to transfer from ${from.name}.`);
  }
  return { moved, logs };
}

export function resolveCopyLastMove(
  actor: EffectCombatantState,
  opts: { blockedTags?: string[]; rng: () => number }
): { moveId: string | null; log: string } {
  void opts;
  for (let i = actor.battleHistory.length - 1; i >= 0; i--) {
    const h = actor.battleHistory[i];
    if (h.actorId !== actor.id) continue;
    if (h.moveId.startsWith('system::')) continue;
    return { moveId: h.moveId, log: `${actor.name} copies ${h.moveName ?? h.moveId} from battle history.` };
  }
  return { moveId: null, log: `${actor.name} found no prior move to copy.` };
}

export function tickEffectDurations(c: EffectCombatantState): string[] {
  const logs: string[] = [];
  const next: SkillEffectInstance[] = [];
  for (const inst of c.activeEffects) {
    if (inst.remainingTurns === null) {
      next.push(inst);
      continue;
    }
    const rt = (inst.remainingTurns ?? 0) - 1;
    if (rt <= 0) {
      if (inst.payload.type === 'shield' && typeof inst.payload.value === 'number') {
        const drop = Math.min(c.shieldPoints, inst.payload.value * inst.stacks);
        c.shieldPoints -= drop;
        if (drop > 0) logs.push(`${c.name}'s shield faded (${drop} removed).`);
      } else {
        logs.push(`${c.name}'s ${inst.payload.type.replace(/_/g, ' ')} expired.`);
      }
    } else {
      next.push({ ...inst, remainingTurns: rt });
    }
  }
  c.activeEffects = next;
  return logs;
}

export function canUseSkill(
  actor: EffectCombatantState,
  skill: { cost: number; category?: string; tags?: string[] }
): { allowed: boolean; reason?: string } {
  if (hasEffectType(actor, 'silence')) {
    if (skill.tags?.includes('basic_attack')) return { allowed: true };
    if (skill.category === 'system') return { allowed: true };
    return { allowed: false, reason: 'Silenced' };
  }
  return { allowed: true };
}

export function canReposition(actor: EffectCombatantState): { allowed: boolean; reason?: string } {
  if (hasEffectType(actor, 'root')) {
    return { allowed: false, reason: 'Rooted' };
  }
  return { allowed: true };
}

export function modifyOutgoingDamage(
  raw: number,
  attacker: EffectCombatantState,
  ctx: { defenderElement: ElementType | null; moveElement: ElementType | null }
): { damage: number; logs: string[] } {
  const logs: string[] = [];
  let damage = Math.max(0, raw);
  const atkBonus = sumBuffAttackPercent(attacker) / 100;
  damage *= 1 + atkBonus;

  const tagIdx = attacker.activeEffects.findIndex((e) => e.payload.type === 'add_element_tag');
  if (tagIdx >= 0) {
    const tag = normalizeElementType(attacker.activeEffects[tagIdx].payload.elementTag);
    const mult = getElementMultiplier(tag, ctx.defenderElement);
    if (mult !== 1) {
      damage *= mult;
      logs.push(`Tagged element ${tag ?? 'neutral'} modifies damage (×${mult}).`);
    }
    const inst = attacker.activeEffects[tagIdx];
    const rt = inst.remainingTurns;
    if (rt === null) {
      attacker.activeEffects.splice(tagIdx, 1);
    } else if (rt <= 1) {
      attacker.activeEffects.splice(tagIdx, 1);
    } else {
      attacker.activeEffects[tagIdx] = { ...inst, remainingTurns: rt - 1 };
    }
  } else {
    const mult = getElementMultiplier(ctx.moveElement, ctx.defenderElement);
    if (mult !== 1) damage *= mult;
  }

  return { damage: Math.round(damage), logs };
}

export interface IncomingDamageResult {
  damageToShield: number;
  damageToHp: number;
  logs: string[];
}

export function modifyIncomingDamage(
  rawDamage: number,
  defender: EffectCombatantState
): { effectiveDamage: number; logs: string[] } {
  const logs: string[] = [];
  let d = Math.max(0, rawDamage);

  const predIdx = defender.reactiveEffects.findIndex((r) => r.kind === 'predict_move' && r.remainingTriggers > 0);
  if (predIdx >= 0) {
    const p = defender.reactiveEffects[predIdx] as Extract<ReactiveEffect, { kind: 'predict_move' }>;
    const red = Math.min(95, Math.max(0, p.reductionPercent)) / 100;
    d *= 1 - red;
    p.remainingTriggers -= 1;
    if (p.remainingTriggers <= 0) {
      defender.reactiveEffects.splice(predIdx, 1);
    }
    logs.push(`Predicted strike — incoming damage reduced by ${Math.round(red * 100)}%.`);
  }

  const markPct = sumMarkDamageBonusPercent(defender) / 100;
  if (markPct > 0) {
    d *= 1 + markPct;
    logs.push(`Marked target takes ${Math.round(markPct * 100)}% bonus damage.`);
  }

  const defPct = sumBuffDefensePercent(defender) / 100;
  if (defPct > 0) {
    d *= 1 - defPct;
    logs.push(`Defense buff reduces damage by ${Math.round(defPct * 100)}%.`);
  }

  return { effectiveDamage: Math.max(0, Math.round(d)), logs };
}

export function applyShieldAbsorption(
  effectiveDamage: number,
  defender: EffectCombatantState
): IncomingDamageResult {
  const logs: string[] = [];
  const shield = defender.shieldPoints;
  const toShield = Math.min(shield, effectiveDamage);
  const remainder = Math.max(0, effectiveDamage - toShield);
  defender.shieldPoints = Math.max(0, shield - toShield);
  if (toShield > 0) {
    logs.push(`Shield absorbs ${toShield} damage (${defender.shieldPoints} shield remaining).`);
  }
  return { damageToShield: toShield, damageToHp: remainder, logs };
}

export function processTurnStartEffects(
  actor: EffectCombatantState,
  rng: () => number
): { canAct: boolean; logs: string[]; confuse?: 'wrong_target' | 'lose_action' | 'normal' } {
  const logs: string[] = [];
  if (actor.skipNextAction > 0) {
    actor.skipNextAction -= 1;
    logs.push(`${actor.name} is delayed and skips this turn.`);
    return { canAct: false, logs };
  }
  if (hasEffectType(actor, 'confuse')) {
    const r = rng() * 100;
    let confuse: 'wrong_target' | 'lose_action' | 'normal';
    if (r < 40) confuse = 'wrong_target';
    else if (r < 60) confuse = 'lose_action';
    else confuse = 'normal';
    if (confuse === 'lose_action') {
      logs.push(`${actor.name} is too confused to act!`);
      return { canAct: false, logs, confuse };
    }
    if (confuse === 'wrong_target') {
      logs.push(`${actor.name} is confused and may strike the wrong target.`);
      return { canAct: true, logs, confuse };
    }
    return { canAct: true, logs, confuse: 'normal' };
  }
  return { canAct: true, logs };
}

export function processTurnEndEffects(actor: EffectCombatantState): string[] {
  return tickEffectDurations(actor);
}

export function processReactiveEffects(
  defender: EffectCombatantState,
  incomingDamage: number
): { damage: number; logs: string[] } {
  const { effectiveDamage, logs } = modifyIncomingDamage(incomingDamage, defender);
  return { damage: effectiveDamage, logs };
}

export function removeEffectById(c: EffectCombatantState, id: string): boolean {
  const i = c.activeEffects.findIndex((e) => e.id === id);
  if (i < 0) return false;
  c.activeEffects.splice(i, 1);
  return true;
}

export function recordBattleAction(
  state: EffectCombatantState,
  actorId: string,
  moveId: string,
  moveName: string,
  turn: number
): void {
  state.battleHistory.push({ turn, actorId, moveId, moveName });
  if (actorId === state.id) {
    state.lastAction = { moveId, moveName };
  }
}
