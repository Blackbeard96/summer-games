/**
 * Per-combatant, per-skill turn cooldown storage for a single battle instance.
 *
 * Timing model (matches BattleEngine):
 * - On skill use: remaining = effectiveCooldownTurns(base CD, perks/laws).
 * - Ticks down when that combatant’s turn-boundary runs (player: after opponent / round
 *   advance when `turnCount` increases; CPU: at start of that CPU’s `executeOpponentTurn`).
 * - Cooldowns persist across waves unless explicitly cleared (wave advance does not reset).
 */

export type SkillCooldownsByCombatant = {
  [combatantId: string]: {
    [skillId: string]: number;
  };
};

export function initializeCombatantCooldowns(): SkillCooldownsByCombatant {
  return {};
}

export function cloneCooldowns(state: SkillCooldownsByCombatant): SkillCooldownsByCombatant {
  const out: SkillCooldownsByCombatant = {};
  for (const cid of Object.keys(state)) {
    out[cid] = { ...state[cid] };
  }
  return out;
}

export function getRemainingCooldown(
  actorId: string,
  skillId: string,
  cooldowns: SkillCooldownsByCombatant
): number {
  const row = cooldowns[actorId];
  if (!row) return 0;
  return Math.max(0, Math.floor(Number(row[skillId]) || 0));
}

/** Returns new cooldown map (immutable). */
export function setSkillOnCooldown(
  actorId: string,
  skillId: string,
  cooldownTurns: number,
  cooldowns: SkillCooldownsByCombatant
): SkillCooldownsByCombatant {
  const cd = Math.max(0, Math.floor(Number(cooldownTurns) || 0));
  if (cd <= 0) return cooldowns;
  const next = cloneCooldowns(cooldowns);
  if (!next[actorId]) next[actorId] = {};
  next[actorId][skillId] = cd;
  return next;
}

/**
 * Decrement every skill cooldown for one combatant by 1 (floor at 0; remove zero entries).
 */
export function decrementCooldownsForCombatant(
  actorId: string,
  cooldowns: SkillCooldownsByCombatant
): SkillCooldownsByCombatant {
  const row = cooldowns[actorId];
  if (!row || Object.keys(row).length === 0) return cooldowns;
  const next = cloneCooldowns(cooldowns);
  const newRow: Record<string, number> = {};
  for (const skillId of Object.keys(row)) {
    const v = Math.max(0, Math.floor(Number(row[skillId]) || 0));
    if (v <= 0) continue;
    const n = v - 1;
    if (n > 0) newRow[skillId] = n;
  }
  if (Object.keys(newRow).length === 0) {
    delete next[actorId];
  } else {
    next[actorId] = newRow;
  }
  return next;
}

/** Map from legacy BattleEngine `Map<skillId, turns>` → nested under one actor. */
export function migrateMapToByCombatant(
  actorId: string,
  legacy: Map<string, number>
): SkillCooldownsByCombatant {
  const out: SkillCooldownsByCombatant = {};
  const row: Record<string, number> = {};
  legacy.forEach((v, k) => {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    if (n > 0) row[k] = n;
  });
  if (Object.keys(row).length > 0) out[actorId] = row;
  return out;
}
