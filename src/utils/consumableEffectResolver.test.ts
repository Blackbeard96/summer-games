import { applyConsumableEffectToVault, applyConsumableEffectToSessionPlayer } from './consumableEffectResolver';
import type { ConsumableEffect } from '../types/consumableEffects';

describe('applyConsumableEffectToVault', () => {
  const baseVault = {
    vaultHealth: 50,
    maxVaultHealth: 100,
    shieldStrength: 20,
    maxShieldStrength: 80,
  };

  it('restore_health adds amount and clamps at max', () => {
    const effect: ConsumableEffect = { effectType: 'restore_health', amount: 40, targetScope: 'self' };
    const r = applyConsumableEffectToVault(baseVault, effect, 'Potion');
    expect(r.success).toBe(true);
    expect(r.vaultHealth).toBe(90);
    expect(r.noop).toBeFalsy();
  });

  it('restore_health noop at full', () => {
    const effect: ConsumableEffect = { effectType: 'restore_health', amount: 40, targetScope: 'self' };
    const r = applyConsumableEffectToVault({ ...baseVault, vaultHealth: 100 }, effect, 'Potion');
    expect(r.noop).toBe(true);
  });

  it('restore_shields adds amount and clamps at max', () => {
    const effect: ConsumableEffect = { effectType: 'restore_shields', amount: 30, targetScope: 'self' };
    const r = applyConsumableEffectToVault(baseVault, effect, 'Cell');
    expect(r.success).toBe(true);
    expect(r.shieldStrength).toBe(50);
  });

  it('restore_shields noop at full shields', () => {
    const effect: ConsumableEffect = { effectType: 'restore_shields', amount: 30, targetScope: 'self' };
    const r = applyConsumableEffectToVault({ ...baseVault, shieldStrength: 80 }, effect, 'Cell');
    expect(r.noop).toBe(true);
  });
});

describe('applyConsumableEffectToSessionPlayer', () => {
  const alive = {
    userId: 'u1',
    hp: 40,
    maxHp: 100,
    shield: 10,
    maxShield: 60,
    level: 5,
    eliminated: false,
  };

  it('restore_health on session player', () => {
    const effect: ConsumableEffect = { effectType: 'restore_health', amount: 25, targetScope: 'self' };
    const r = applyConsumableEffectToSessionPlayer({
      player: alive,
      effect,
      buyerDisplayName: 'A',
      itemName: 'Potion',
    });
    expect(r.ok).toBe(true);
    expect(r.player.hp).toBe(65);
  });

  it('restore_shields on session player', () => {
    const effect: ConsumableEffect = { effectType: 'restore_shields', amount: 100, targetScope: 'self' };
    const r = applyConsumableEffectToSessionPlayer({
      player: alive,
      effect,
      buyerDisplayName: 'A',
      itemName: 'Cell',
    });
    expect(r.ok).toBe(true);
    expect(r.player.shield).toBe(60);
  });

  it('revive_eliminated_self when eliminated', () => {
    const effect: ConsumableEffect = { effectType: 'revive_eliminated_self', amount: 50, targetScope: 'self' };
    const r = applyConsumableEffectToSessionPlayer({
      player: { ...alive, eliminated: true, hp: 0, shield: 0 },
      effect,
      buyerDisplayName: 'A',
      itemName: 'Revive',
    });
    expect(r.ok).toBe(true);
    expect(r.player.eliminated).toBe(false);
    expect(r.needsEliminationClear).toBe(true);
    expect(r.player.hp).toBe(50);
  });

  it('revive_eliminated_self when not eliminated: purchase allowed, no combat change', () => {
    const effect: ConsumableEffect = { effectType: 'revive_eliminated_self', amount: 50, targetScope: 'self' };
    const r = applyConsumableEffectToSessionPlayer({
      player: alive,
      effect,
      buyerDisplayName: 'A',
      itemName: 'Revive',
    });
    expect(r.ok).toBe(true);
    expect(r.player.eliminated).not.toBe(true);
    expect(r.player.hp).toBe(alive.hp);
    expect(r.logLine).toContain('saved for elimination');
  });
});
