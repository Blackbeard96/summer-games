/**
 * Canonical rules for skill cooldown vs Participation Power across battle modes.
 *
 * Turn cooldown model (standard / PvP / Mindforge / Island Raid when not in live session):
 * - On use: remainingCooldown = effectiveCooldownTurns (perks/laws applied).
 * - Counters tick down once when battle `turnCount` advances and the owner is back in
 *   selection with the player turn — not on arbitrary phase flips (fixes Live Event
 *   same-turnCount decrements).
 *
 * Live Events (`isInSession`): Participation Power (and Season1 costs when applicable)
 * gate usage. Turn-based battle cooldowns are off by default so they do not fight PP.
 * Set LIVE_SESSION_USE_TURN_SKILL_COOLDOWNS to true to enable hybrid (PP + turn CD).
 */

export interface BattleSkillRuntimePolicy {
  /** Decrement battle-local turn cooldown map when `turnCount` advances at the tick boundary. */
  applyTurnSkillCooldownTicks: boolean;
  /** After using a skill, store remaining turn cooldown in battle-local state (BattleEngine Map). */
  applyTurnSkillCooldownOnUse: boolean;
  /** Live Events: skills primarily gated by Participation Power / Season1 energy. */
  participationPowerGatesSkills: boolean;
}

/**
 * When false (default): Live / In-Session battles do not apply turn-based skill cooldown
 * ticks or on-use cooldown storage in BattleEngine; validation skips CD in inSessionSkillsService.
 * When true: hybrid mode — PP (or Season1) AND turn cooldowns both apply.
 */
export const LIVE_SESSION_USE_TURN_SKILL_COOLDOWNS = false;

export function getBattleSkillRuntimePolicy(params: {
  isInSession: boolean;
  mindforgeMode?: boolean;
  isPvP?: boolean;
}): BattleSkillRuntimePolicy {
  const { isInSession } = params;
  if (isInSession && !LIVE_SESSION_USE_TURN_SKILL_COOLDOWNS) {
    return {
      applyTurnSkillCooldownTicks: false,
      applyTurnSkillCooldownOnUse: false,
      participationPowerGatesSkills: true,
    };
  }
  if (isInSession && LIVE_SESSION_USE_TURN_SKILL_COOLDOWNS) {
    return {
      applyTurnSkillCooldownTicks: true,
      applyTurnSkillCooldownOnUse: true,
      participationPowerGatesSkills: true,
    };
  }
  return {
    applyTurnSkillCooldownTicks: true,
    applyTurnSkillCooldownOnUse: true,
    participationPowerGatesSkills: false,
  };
}

export function shouldEnforceTurnSkillCooldownsInLiveSession(): boolean {
  return LIVE_SESSION_USE_TURN_SKILL_COOLDOWNS;
}
