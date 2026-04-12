import type { Move } from '../types/battle';
import type { BattleSkillRuntimePolicy } from './battleModeSkillRules';
import { getRemainingCooldown, type SkillCooldownsByCombatant } from './battleCooldownState';

/** Set `REACT_APP_DEBUG_SKILL_COOLDOWNS=true` for verbose cooldown / PP trace logs. */
export const DEBUG_SKILL_COOLDOWNS = process.env.REACT_APP_DEBUG_SKILL_COOLDOWNS === 'true';

export interface SkillAvailabilityActor {
  id: string;
}

export interface SkillAvailabilityBattleContext {
  policy: BattleSkillRuntimePolicy;
  /** Standard / raid / PvP / live / mindforge — for logs only */
  battleModeLabel: string;
  waveNumber?: number;
  turnOwnerId?: string;
  /** Live Events: current participation points (movesEarned) for the actor */
  participationPointsAvailable?: number;
  /** Pre-computed final PP cost for this skill in live session (optional) */
  liveEventFinalCost?: number;
  /** When true, actor cannot use skills (turn skip handled elsewhere; this blocks UI/execution). */
  isActorStunned?: boolean;
  /** When true, show shield break as blocking offensive skill use (defensive may still be allowed). */
  hasShieldBreak?: boolean;
}

export interface SkillAvailabilityCurrentState {
  cooldowns: SkillCooldownsByCombatant;
}

export interface SkillAvailabilityResult {
  canUse: boolean;
  reasons: string[];
  remainingCooldown: number;
  missingPP?: number;
}

function logDebug(payload: Record<string, unknown>) {
  if (!DEBUG_SKILL_COOLDOWNS) return;
  // eslint-disable-next-line no-console
  console.log('[skillAvailability]', payload);
}

/**
 * Pure availability check for one skill on one actor. Does not mutate state.
 * Call before executing a skill; merge reasons into battle log / UI as needed.
 */
export function getSkillAvailability(params: {
  actor: SkillAvailabilityActor;
  skill: Move;
  battleContext: SkillAvailabilityBattleContext;
  currentState: SkillAvailabilityCurrentState;
  target?: { id: string } | null;
}): SkillAvailabilityResult {
  const { actor, skill, battleContext, currentState } = params;
  const reasons: string[] = [];
  const remainingCooldown = getRemainingCooldown(actor.id, skill.id, currentState.cooldowns);

  if (!skill.unlocked) {
    reasons.push('Skill is locked');
    return { canUse: false, reasons, remainingCooldown };
  }

  if (battleContext.isActorStunned) {
    reasons.push('Stunned');
  }

  if (battleContext.hasShieldBreak && skill.type === 'attack') {
    reasons.push('Shield Break active');
  }

  if (battleContext.policy.applyTurnSkillCooldownOnUse && remainingCooldown > 0) {
    reasons.push(`Cooldown: ${remainingCooldown} turn${remainingCooldown === 1 ? '' : 's'} remaining`);
  }

  let missingPP: number | undefined;
  if (battleContext.policy.participationPowerGatesSkills) {
    const cost =
      typeof battleContext.liveEventFinalCost === 'number'
        ? battleContext.liveEventFinalCost
        : Math.max(0, Math.floor(Number(skill.cost) || 0));
    const have = Math.max(0, Math.floor(Number(battleContext.participationPointsAvailable) || 0));
    if (cost > 0 && have < cost) {
      missingPP = cost - have;
      reasons.push(`Need ${missingPP} more Participation Point${missingPP === 1 ? '' : 's'} (cost ${cost}, have ${have})`);
    }
  }

  const canUse = reasons.length === 0;

  logDebug({
    actorId: actor.id,
    skillId: skill.id,
    baseCooldown: skill.cooldown,
    remainingCooldownBeforeUse: remainingCooldown,
    turnOwnerId: battleContext.turnOwnerId,
    battleMode: battleContext.battleModeLabel,
    waveNumber: battleContext.waveNumber,
    participationPoints: battleContext.participationPointsAvailable,
    canUse,
    reasons,
  });

  return { canUse, reasons, remainingCooldown, missingPP };
}

export function getSkillAvailabilityLabel(result: SkillAvailabilityResult): string {
  if (result.canUse) return 'Ready';
  if (result.reasons.length > 0) return result.reasons.join(' · ');
  return 'Unavailable';
}

/** @deprecated use getSkillAvailability */
export function canUseSkill(
  actor: SkillAvailabilityActor,
  skill: Move,
  battleContext: SkillAvailabilityBattleContext,
  currentState: SkillAvailabilityCurrentState
): boolean {
  return getSkillAvailability({ actor, skill, battleContext, currentState }).canUse;
}
