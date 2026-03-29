import { parseConsumableEffect, validateConsumableItemRow } from './consumableEffects';

describe('parseConsumableEffect', () => {
  it('accepts restore_health with positive amount', () => {
    const p = parseConsumableEffect({ effectType: 'restore_health', amount: 40 });
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.value.amount).toBe(40);
  });

  it('rejects unknown effect type', () => {
    const p = parseConsumableEffect({ effectType: 'bogus', amount: 1 });
    expect(p.ok).toBe(false);
  });

  it('rejects non-positive amount for restore_health', () => {
    expect(parseConsumableEffect({ effectType: 'restore_health', amount: 0 }).ok).toBe(false);
    expect(parseConsumableEffect({ effectType: 'restore_health', amount: -3 }).ok).toBe(false);
  });

  it('revive uses percent default', () => {
    const p = parseConsumableEffect({ effectType: 'revive_eliminated_self', amount: 50 });
    expect(p.ok).toBe(true);
    if (p.ok) expect(p.value.amount).toBe(50);
  });
});

describe('validateConsumableItemRow', () => {
  it('requires valid consumable when itemType consumable', () => {
    expect(
      validateConsumableItemRow({ itemType: 'consumable', consumableEffect: { effectType: 'restore_health', amount: 10 } })
        .ok
    ).toBe(true);
    expect(validateConsumableItemRow({ itemType: 'consumable', consumableEffect: {} }).ok).toBe(false);
  });

  it('rejects consumableEffect on non-consumable', () => {
    const r = validateConsumableItemRow({
      itemType: 'other',
      consumableEffect: { effectType: 'restore_health', amount: 5 },
    });
    expect(r.ok).toBe(false);
  });
});
