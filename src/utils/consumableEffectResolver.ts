/**
 * Applies admin-defined consumable effects to vault (out-of-session) or Live Event session rows.
 * No per-item-id branching — dispatch on effectType only.
 */

import type { ConsumableEffect } from '../types/consumableEffects';

export interface VaultSnapshotForConsumable {
  vaultHealth: number;
  maxVaultHealth: number;
  shieldStrength: number;
  maxShieldStrength: number;
}

export interface VaultApplyResult {
  success: boolean;
  vaultHealth?: number;
  shieldStrength?: number;
  deltaHp?: number;
  deltaShield?: number;
  /** User-visible outcome */
  message: string;
  /** If true, do not consume the item */
  noop?: boolean;
}

export interface SessionPlayerMutable {
  userId: string;
  displayName?: string;
  eliminated?: boolean;
  eliminatedBy?: string;
  hp?: number;
  maxHp?: number;
  level?: number;
  shield?: number;
  maxShield?: number;
  powerPoints?: number;
}

export interface SessionApplyResult {
  ok: boolean;
  error?: string;
  player: SessionPlayerMutable;
  logLine: string;
  hpAfter?: number;
  shieldAfter?: number;
  /** Session stats subdoc should clear elimination flags */
  needsEliminationClear?: boolean;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Vault / Marketplace / Battle bag: restore_health & restore_shields only (no revive). */
export function applyConsumableEffectToVault(
  vault: VaultSnapshotForConsumable,
  effect: ConsumableEffect,
  itemName: string
): VaultApplyResult {
  if (effect.targetScope && effect.targetScope !== 'self') {
    return {
      success: false,
      message: 'This consumable requires a target scope not supported outside Live Events yet.',
      noop: true,
    };
  }

  if (effect.effectType === 'revive_eliminated_self') {
    return {
      success: false,
      message: 'Revive consumables only work during a Live Event.',
      noop: true,
    };
  }

  if (effect.effectType === 'restore_health') {
    const maxH = Math.max(1, vault.maxVaultHealth);
    const cur = clamp(vault.vaultHealth, 0, maxH);
    if (cur >= maxH) {
      return {
        success: true,
        noop: true,
        message: `Your vault health is already at maximum (${maxH}/${maxH}).`,
      };
    }
    const gain = Math.min(effect.amount, maxH - cur);
    const next = cur + gain;
    return {
      success: true,
      vaultHealth: next,
      deltaHp: gain,
      message: `${itemName} restored ${gain} Health. Vault Health: ${next}/${maxH}.`,
    };
  }

  if (effect.effectType === 'restore_shields') {
    const maxS = Math.max(0, vault.maxShieldStrength);
    const cur = clamp(vault.shieldStrength, 0, maxS);
    if (maxS <= 0) {
      return { success: false, message: 'No shield capacity on your vault.', noop: true };
    }
    if (cur >= maxS) {
      return {
        success: true,
        noop: true,
        message: `Your shields are already at maximum (${maxS}/${maxS}).`,
      };
    }
    const gain = Math.min(effect.amount, maxS - cur);
    const next = cur + gain;
    return {
      success: true,
      shieldStrength: next,
      deltaShield: gain,
      message: `${itemName} restored ${gain} Shields. Shields: ${next}/${maxS}.`,
    };
  }

  return { success: false, message: `Unsupported effect: ${(effect as ConsumableEffect).effectType}`, noop: true };
}

/**
 * Live Event session player row. Phase 1: self only for restore_*; revive when eliminated.
 */
export function applyConsumableEffectToSessionPlayer(params: {
  player: SessionPlayerMutable;
  effect: ConsumableEffect;
  buyerDisplayName: string;
  itemName: string;
}): SessionApplyResult {
  const { effect, buyerDisplayName, itemName } = params;
  let row = { ...params.player };

  if (effect.targetScope && effect.targetScope !== 'self') {
    return {
      ok: false,
      error: 'Ally/team targeting for MST consumables is not implemented yet (use Self).',
      player: row,
      logLine: '',
    };
  }

  const eliminated = row.eliminated === true;

  if (effect.effectType === 'revive_eliminated_self') {
    if (!eliminated) {
      return {
        ok: true,
        player: row,
        logLine: `🛒 ${buyerDisplayName} bought ${itemName} at MST MKT (saved for elimination — no combat change yet).`,
      };
    }
    const maxHp = row.maxHp ?? Math.max(100, (row.level || 1) * 10);
    const pct = clamp(effect.amount, 1, 100);
    const newHp = Math.max(1, Math.floor((maxHp * pct) / 100));
    row.eliminated = false;
    delete row.eliminatedBy;
    row.maxHp = maxHp;
    row.hp = newHp;
    const maxShield = row.maxShield ?? 100;
    row.shield = 0;
    row.maxShield = maxShield;
    return {
      ok: true,
      player: row,
      logLine: `🛒 ${buyerDisplayName} used ${itemName} from MST MKT and returned at ${newHp}/${maxHp} HP!`,
      hpAfter: newHp,
      shieldAfter: 0,
      needsEliminationClear: true,
    };
  }

  if (eliminated) {
    return {
      ok: false,
      error: 'Eliminated players can only use a Revive consumable here.',
      player: row,
      logLine: '',
    };
  }

  const maxHp = row.maxHp ?? Math.max(100, (row.level || 1) * 10);
  const maxShield = row.maxShield ?? 100;
  let hp = row.hp ?? maxHp;
  let shield = row.shield ?? 0;

  if (effect.effectType === 'restore_health') {
    const before = hp;
    hp = clamp(hp + effect.amount, 0, maxHp);
    const healed = hp - before;
    row = { ...row, hp, maxHp, maxShield, shield };
    return {
      ok: true,
      player: row,
      logLine: `🛒 ${buyerDisplayName} bought ${itemName} at MST MKT (+${healed} HP).`,
      hpAfter: hp,
      shieldAfter: shield,
    };
  }

  if (effect.effectType === 'restore_shields') {
    const before = shield;
    shield = clamp(shield + effect.amount, 0, maxShield);
    const gained = shield - before;
    row = { ...row, hp, maxHp, maxShield, shield };
    return {
      ok: true,
      player: row,
      logLine: `🛒 ${buyerDisplayName} bought ${itemName} at MST MKT (+${gained} Shields).`,
      hpAfter: hp,
      shieldAfter: shield,
    };
  }

  return {
    ok: false,
    error: `Unknown effect: ${(effect as ConsumableEffect).effectType}`,
    player: row,
    logLine: '',
  };
}
