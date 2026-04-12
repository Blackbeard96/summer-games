import type { Move } from '../../types/battle';
import type { SkillEffectInstance } from '../../types/skillEffects';
import type { ActorState, ResolvedSkillAction, TargetState } from '../battleSkillResolver';
import type { ValidatedSkillEffect } from './validate';
import { validateSkillEffectPayloadList } from './validate';

function newInstanceId(): string {
  return `se_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function rollChance(chance: number, rng: () => number): boolean {
  return rng() * 100 < chance;
}

/** Who receives the effect in a 1:1 actor vs target resolution (MVP). */
function effectRecipientIsActor(
  actor: ActorState,
  target: TargetState,
  p: Pick<ValidatedSkillEffect, 'targetScope'>
): boolean {
  const s = p.targetScope ?? 'single';
  if (s === 'self' || s === 'all_allies') return true;
  if (s === 'enemy' || s === 'all_enemies') return false;
  return actor.uid === target.uid;
}

function computeHealAmount(
  actor: ActorState,
  target: TargetState,
  amount: number,
  onActor: boolean
): { key: 'actor' | 'target'; healed: number } {
  const maxHp = onActor ? actor.maxHp ?? actor.hp ?? 99999 : target.maxHp ?? target.hp ?? 99999;
  const cur = onActor ? actor.hp ?? 0 : target.hp ?? 0;
  const cap = Math.max(0, maxHp - cur);
  const healed = Math.min(cap, Math.max(0, Math.floor(amount)));
  return { key: onActor ? 'actor' : 'target', healed };
}

function appendHealLogs(
  result: ResolvedSkillAction,
  actor: ActorState,
  target: TargetState,
  skill: Move,
  healed: number,
  recipientLabel: string
): void {
  if (healed > 0) {
    result.logMessages.push(`💚 ${actor.name} used ${skill.name} — ${recipientLabel} recovered ${healed} HP.`);
  }
}

/**
 * Merges explicit `skill.skillEffects` into the unified resolver result.
 * Legacy moves without `skillEffects` are unchanged.
 */
export function mergeSkillEffectsIntoResolvedSkillAction(
  actor: ActorState,
  target: TargetState,
  skill: Move,
  result: ResolvedSkillAction
): void {
  const raw = skill.skillEffects;
  if (!raw?.length) return;

  const payloads = validateSkillEffectPayloadList(raw);
  if (!payloads.length) return;

  const rng = Math.random;
  if (!result.proposedSkillEffectInstances) {
    result.proposedSkillEffectInstances = {};
  }

  for (const p of payloads) {
    if (!rollChance(p.chance ?? 100, rng)) {
      result.logMessages.push(
        `✨ ${skill.name}: ${p.type.replace(/_/g, ' ')} failed to apply (${p.chance ?? 100}% chance).`
      );
      continue;
    }

    const onActor = effectRecipientIsActor(actor, target, p);

    if (p.type === 'heal') {
      const { key, healed } = computeHealAmount(actor, target, p.value ?? 0, onActor);
      if (key === 'actor') {
        result.healing += healed;
        result.actorDelta.hp = (result.actorDelta.hp || 0) + healed;
      } else {
        result.healing += healed;
        result.targetDelta.hp = (result.targetDelta.hp || 0) + healed;
      }
      appendHealLogs(result, actor, target, skill, healed, key === 'actor' ? actor.name : target.name);
      continue;
    }

    if (p.type === 'shield') {
      const amt = Math.max(0, Math.floor(p.value ?? 0));
      if (onActor) {
        result.shieldBoost += amt;
        result.actorDelta.shield = (result.actorDelta.shield || 0) + amt;
        result.logMessages.push(`🛡️ ${actor.name} gained ${amt} shield from ${skill.name}.`);
      } else {
        result.shieldBoost += amt;
        result.targetDelta.shield = (result.targetDelta.shield || 0) + amt;
        result.logMessages.push(`🛡️ ${target.name} gained ${amt} shield from ${skill.name}.`);
      }
      continue;
    }

    result.logMessages.push(...formatStandardEffectLogs(actor, target, skill, p));

    const inst: SkillEffectInstance = {
      id: newInstanceId(),
      payload: p,
      remainingTurns:
        p.duration === null || p.duration === undefined ? null : Math.max(0, Math.floor(p.duration)),
      sourceId: actor.uid,
      stacks: 1,
    };
    if (onActor) {
      result.proposedSkillEffectInstances.actor = [...(result.proposedSkillEffectInstances.actor ?? []), inst];
    } else {
      result.proposedSkillEffectInstances.target = [...(result.proposedSkillEffectInstances.target ?? []), inst];
    }
  }
}

function formatStandardEffectLogs(
  actor: ActorState,
  target: TargetState,
  skill: Move,
  p: ValidatedSkillEffect
): string[] {
  const t = p.type;
  const lines: string[] = [];
  const victim = effectRecipientIsActor(actor, target, p) ? actor.name : target.name;
  switch (t) {
    case 'silence':
      lines.push(`🔇 ${victim} is Silenced for ${p.duration ?? 1} turn(s) (${skill.name}).`);
      break;
    case 'root':
      lines.push(`🪢 ${victim} is Rooted for ${p.duration ?? 1} turn(s) (${skill.name}).`);
      break;
    case 'confuse':
      lines.push(`😵 ${victim} is Confused for ${p.duration ?? 2} turn(s) (${skill.name}).`);
      break;
    case 'mark_target':
      lines.push(
        `🎯 ${victim} is Marked — takes ${p.value ?? 0}% bonus damage for ${p.duration ?? 1} turn(s) (${skill.name}).`
      );
      break;
    case 'predict_move':
      lines.push(`🔮 ${actor.name} used ${skill.name} and gained prediction for the next attack (-${p.value ?? 0}% damage).`);
      break;
    case 'reveal':
      lines.push(`👁️ ${victim} was revealed (${skill.name}).`);
      break;
    case 'delay':
      lines.push(`⏳ ${target.name} is delayed (${skill.name}).`);
      break;
    case 'remove_buff':
      lines.push(`🧹 ${skill.name} attempts to cleanse buffs on ${victim}.`);
      break;
    case 'transfer_debuff':
      lines.push(`↔️ ${skill.name} attempts to move debuffs onto ${target.name}.`);
      break;
    case 'copy_last_move':
      lines.push(`📎 ${actor.name} prepares to copy a prior move (${skill.name}).`);
      break;
    case 'add_element_tag':
      lines.push(`✨ ${actor.name}'s next attack is tagged ${p.elementTag ?? 'neutral'} (${skill.name}).`);
      break;
    case 'buff_attack':
    case 'buff_defense':
    case 'buff_speed':
      lines.push(`⬆️ ${victim} gains ${t.replace(/_/g, ' ')} ${p.value ?? 0}% (${p.duration ?? 1}t, ${skill.name}).`);
      break;
    case 'reduce_cooldown':
      lines.push(`⏱️ ${skill.name} reduces cooldowns by ${p.value ?? 1}.`);
      break;
    default:
      lines.push(`✨ ${skill.name} applies ${String(t).replace(/_/g, ' ')}.`);
  }
  return lines;
}
