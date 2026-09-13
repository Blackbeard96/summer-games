/**
 * CPU awaken combat helpers — phase-1 kill must not count as raid/mission victory
 * until the awakened phase has been entered with a fightable pool, then emptied.
 */

export type AwakenCombatant = {
  vaultHealth?: number;
  health?: number;
  currentPP?: number;
  maxVaultHealth?: number;
  maxHealth?: number;
  maxPP?: number;
  shieldStrength?: number;
  maxShieldStrength?: number;
  isDefeated?: boolean;
  awakenedModeEnabled?: boolean;
  isAwakened?: boolean;
  awakenedPhaseEntered?: boolean;
  /** Sticky: true once phase-2 current HP/shields were > 0 at least once. Never clear on death. */
  awakenedPhaseReady?: boolean;
  awakeningAnimation?: unknown[] | unknown;
  awakenedHealth?: number;
  awakenedShields?: number;
  awakenedMoves?: unknown[];
};

export function hasCpuAwakenConfig(opp: AwakenCombatant): boolean {
  return (
    opp.awakenedModeEnabled === true ||
    (Array.isArray(opp.awakeningAnimation) && opp.awakeningAnimation.length > 0) ||
    (opp.awakenedHealth != null && Number(opp.awakenedHealth) > 0) ||
    (Array.isArray(opp.awakenedMoves) && opp.awakenedMoves.length > 0)
  );
}

/** True when this combatant still owes a phase-2 awaken before it can be counted defeated. */
export function cpuMustAwakenBeforeDefeat(opp: AwakenCombatant): boolean {
  if (!hasCpuAwakenConfig(opp)) return false;
  // Ready means phase 2 was already fightable — even if isAwakened was stripped by a sync merge.
  if (
    opp.isAwakened === true ||
    opp.awakenedPhaseEntered === true ||
    opp.awakenedPhaseReady === true
  ) {
    return false;
  }
  return true;
}

export function primaryCombatantHealth(opp: AwakenCombatant): number {
  if (opp.vaultHealth !== undefined && opp.vaultHealth !== null) {
    return Math.max(0, Math.floor(Number(opp.vaultHealth)));
  }
  if (opp.health !== undefined && opp.health !== null) {
    return Math.max(0, Math.floor(Number(opp.health)));
  }
  return Math.max(0, Math.floor(Number(opp.currentPP ?? 0)));
}

export function primaryCombatantShield(opp: AwakenCombatant): number {
  return Math.max(0, Math.floor(Number(opp.shieldStrength ?? 0)));
}

export function resolveAwakenedHealthPool(opp: AwakenCombatant): number {
  if (opp.awakenedHealth != null && Number.isFinite(Number(opp.awakenedHealth)) && Number(opp.awakenedHealth) > 0) {
    return Math.max(1, Math.floor(Number(opp.awakenedHealth)));
  }
  const maxH = Math.max(
    Math.floor(Number(opp.maxVaultHealth ?? 0)),
    Math.floor(Number(opp.maxHealth ?? 0)),
    Math.floor(Number(opp.maxPP ?? 0))
  );
  return Math.max(1, maxH || 1);
}

export function resolveAwakenedShieldPool(opp: AwakenCombatant): number {
  if (opp.awakenedShields != null && Number.isFinite(Number(opp.awakenedShields)) && Number(opp.awakenedShields) >= 0) {
    return Math.max(0, Math.floor(Number(opp.awakenedShields)));
  }
  return Math.max(0, Math.floor(Number(opp.maxShieldStrength ?? 0)));
}

function applyAwakenedPool<T extends AwakenCombatant>(opp: T): T {
  const ah = resolveAwakenedHealthPool(opp);
  const ash = resolveAwakenedShieldPool(opp);
  const maxShieldOut = Math.max(ash, Math.floor(Number(opp.maxShieldStrength ?? 0)));
  return {
    ...opp,
    isAwakened: true,
    awakenedPhaseEntered: true,
    awakenedPhaseReady: true,
    isDefeated: false,
    defeatedAt: undefined,
    currentPP: ah,
    maxPP: ah,
    vaultHealth: ah,
    maxVaultHealth: ah,
    health: ah,
    maxHealth: ah,
    shieldStrength: ash,
    maxShieldStrength: maxShieldOut,
  };
}

/**
 * After a hit on an already-fightable awakened CPU, keep phase-2 ready sticky so refill
 * cannot restore full HP/shields and erase damage.
 */
export function preserveAwakenedReadyAfterDamage<T extends AwakenCombatant>(before: T, after: T): T {
  if (!hasCpuAwakenConfig(before) && !hasCpuAwakenConfig(after)) return after;
  const wasAwakened =
    before.isAwakened === true ||
    before.awakenedPhaseEntered === true ||
    after.isAwakened === true ||
    after.awakenedPhaseEntered === true;
  if (!wasAwakened) return after;
  const wasFightable =
    before.awakenedPhaseReady === true ||
    primaryCombatantHealth(before) > 0 ||
    primaryCombatantShield(before) > 0;
  if (!wasFightable) return after;
  return {
    ...after,
    isAwakened: true,
    awakenedPhaseEntered: true,
    awakenedPhaseReady: true,
  };
}

/**
 * Repair awaken rows stuck at 0/max ONLY when phase-2 pool never successfully applied
 * (`awakenedPhaseReady` still false). Once ready, empty HP means real combat damage/death —
 * never restore the full pool (that made attacks appear to do no damage).
 */
export function refillAwakenedCombatPoolIfNeeded<T extends AwakenCombatant>(opp: T): T {
  if (!hasCpuAwakenConfig(opp)) return opp;
  if (opp.isAwakened !== true && opp.awakenedPhaseEntered !== true) return opp;

  const h = primaryCombatantHealth(opp);
  const s = primaryCombatantShield(opp);
  if (h > 0 || s > 0) {
    return opp.awakenedPhaseReady === true ? opp : { ...opp, awakenedPhaseReady: true };
  }

  if (opp.isDefeated === true && opp.awakenedPhaseReady === true) return opp;
  // Already fightable in phase 2 — do not re-fill after damage or a lethal hit.
  if (opp.awakenedPhaseReady === true) return opp;

  return applyAwakenedPool(opp);
}

/**
 * Progress defeat: awaken owed → not defeated.
 * Awakened but pool never fightable (!ready, 0/0) → not defeated (refill first).
 * Awaken bosses require awakenedPhaseReady before an empty bar counts as a clear —
 * never trust a stale isDefeated from the phase-1 KO alone (that ended missions early).
 */
export function isEnemyDefeatedForBattleProgression(opp: AwakenCombatant): boolean {
  if (cpuMustAwakenBeforeDefeat(opp)) return false;

  const h = primaryCombatantHealth(opp);
  const s = primaryCombatantShield(opp);
  if (h > 0 || s > 0) return false;

  if (hasCpuAwakenConfig(opp)) {
    // Phase-2 must have been fightable at least once; empty bars alone are not enough.
    if (opp.awakenedPhaseReady !== true) return false;
  }

  return true;
}

/** Normalize before victory/wave checks. */
export function normalizeAwakenCombatantForProgression<T extends AwakenCombatant>(opp: T): T {
  let next = refillAwakenedCombatPoolIfNeeded(opp);
  // Only awaken-capable CPUs may promote ready → isAwakened (never plain zombies).
  if (!hasCpuAwakenConfig(next)) {
    if (
      next.isAwakened === true ||
      next.awakenedPhaseEntered === true ||
      next.awakenedPhaseReady === true ||
      next.awakenedModeEnabled === true
    ) {
      return {
        ...next,
        isAwakened: false,
        awakenedPhaseEntered: false,
        awakenedPhaseReady: false,
        awakenedModeEnabled: false,
      };
    }
    return next;
  }
  // Ready alone must NOT invent phase 2 from base-form HP. Only restore display flags when
  // phase 2 was already entered and a sibling flag was stripped in a sync.
  if (
    next.awakenedPhaseReady === true &&
    (next.isAwakened === true || next.awakenedPhaseEntered === true) &&
    (next.isAwakened !== true || next.awakenedPhaseEntered !== true)
  ) {
    next = {
      ...next,
      isAwakened: true,
      awakenedPhaseEntered: true,
      awakenedModeEnabled: true,
    };
  }
  return next;
}

export function mergeCombatResourceMostDamaged(
  a: number,
  b: number,
  cap?: number
): number {
  const x = Math.max(0, Math.floor(Number(a) || 0));
  const y = Math.max(0, Math.floor(Number(b) || 0));
  const merged = Math.min(x, y);
  if (cap != null && Number.isFinite(cap) && cap > 0) {
    return Math.min(merged, Math.floor(cap));
  }
  return merged;
}
