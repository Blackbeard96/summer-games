import { mergeUserActionCardsWithAdmin } from '../actionCardAdminMerge';
import type { ActionCard } from '../../types/battle';

const baseUser = (overrides: Partial<ActionCard> = {}): ActionCard =>
  ({
    id: 'card_1',
    name: 'Shield Restore',
    description: 'user desc',
    type: 'defensive',
    cost: 0,
    cooldown: 0,
    unlocked: true,
    uses: 3,
    masteryLevel: 3,
    effect: { type: 'shield_restore', strength: 42, duration: 0 },
    upgradeCost: 500,
    ...overrides,
  }) as ActionCard;

const baseAdmin = (overrides: Partial<ActionCard> = {}): ActionCard =>
  ({
    id: 'admin_ignored',
    name: 'Shield Restore',
    description: 'admin desc',
    type: 'defensive',
    cost: 1,
    cooldown: 2,
    unlocked: false,
    uses: 99,
    masteryLevel: 1,
    effect: { type: 'shield_restore', strength: 10, duration: 0 },
    upgradeCost: 150,
    ...overrides,
  }) as ActionCard;

describe('mergeUserActionCardsWithAdmin', () => {
  it('preserves mastery-upgraded effect strength', () => {
    const merged = mergeUserActionCardsWithAdmin(
      [baseUser()],
      [baseAdmin()]
    );
    expect(merged[0].effect.strength).toBe(42);
    expect(merged[0].masteryLevel).toBe(3);
    expect(merged[0].uses).toBe(3);
    expect(merged[0].id).toBe('card_1');
    expect(merged[0].description).toBe('admin desc');
  });

  it('takes admin effect for unmastered cards (level 1)', () => {
    const merged = mergeUserActionCardsWithAdmin(
      [baseUser({ masteryLevel: 1, effect: { type: 'shield_restore', strength: 10, duration: 0 } })],
      [baseAdmin({ effect: { type: 'shield_restore', strength: 15, duration: 1 } })]
    );
    expect(merged[0].effect.strength).toBe(15);
    expect(merged[0].effect.duration).toBe(1);
  });
});
