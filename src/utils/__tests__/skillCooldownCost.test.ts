import type { Move } from '../../types/battle';
import {
  getElementalSkillCooldownOrCostForLevel,
  getManifestSkillCooldownOrCostForLevel,
  getSkillCooldownOrCost,
  getSkillLevelForCooldownCost,
} from '../skillCooldownCost';

const move = (partial: Partial<Move>): Move =>
  ({
    id: 'test-skill',
    name: 'Test',
    description: '',
    category: 'manifest',
    type: 'attack',
    level: 1,
    cost: 9,
    cooldown: 9,
    currentCooldown: 0,
    unlocked: true,
    masteryLevel: 1,
    ...partial,
  }) as Move;

describe('getManifestSkillCooldownOrCostForLevel', () => {
  it('level 4 → 2', () => expect(getManifestSkillCooldownOrCostForLevel(4)).toBe(2));
  it('level 5 → 2', () => expect(getManifestSkillCooldownOrCostForLevel(5)).toBe(2));
  it('level 6 → 3', () => expect(getManifestSkillCooldownOrCostForLevel(6)).toBe(3));
  it('level 1 → 1', () => expect(getManifestSkillCooldownOrCostForLevel(1)).toBe(1));
  it('level 10 → 5', () => expect(getManifestSkillCooldownOrCostForLevel(10)).toBe(5));
});

describe('getElementalSkillCooldownOrCostForLevel', () => {
  it('level 1 → 1', () => expect(getElementalSkillCooldownOrCostForLevel(1)).toBe(1));
  it('level 2 → 1', () => expect(getElementalSkillCooldownOrCostForLevel(2)).toBe(1));
  it('level 3 → 2', () => expect(getElementalSkillCooldownOrCostForLevel(3)).toBe(2));
  it('level 5 → 2', () => expect(getElementalSkillCooldownOrCostForLevel(5)).toBe(2));
  it('level 6 → 3', () => expect(getElementalSkillCooldownOrCostForLevel(6)).toBe(3));
  it('level 8 → 3', () => expect(getElementalSkillCooldownOrCostForLevel(8)).toBe(3));
  it('level 9 → 4', () => expect(getElementalSkillCooldownOrCostForLevel(9)).toBe(4));
  it('level 10 → 4', () => expect(getElementalSkillCooldownOrCostForLevel(10)).toBe(4));
  it('level 11 caps at 4', () => expect(getElementalSkillCooldownOrCostForLevel(11)).toBe(4));
});

describe('getSkillCooldownOrCost (Move)', () => {
  it('manifest ignores legacy cost and uses level', () => {
    expect(getSkillCooldownOrCost(move({ category: 'manifest', level: 4, cost: 99, cooldown: 99 }))).toBe(2);
  });
  it('manifest level 10 → 5 PP / energy base', () => {
    expect(getSkillCooldownOrCost(move({ category: 'manifest', level: 10, cost: 99, cooldown: 99 }))).toBe(5);
  });
  it('manifest tier above 10 caps at tier 10 for pricing', () => {
    expect(getSkillCooldownOrCost(move({ category: 'manifest', level: 20, cost: 99, cooldown: 99 }))).toBe(5);
  });
  it('elemental ignores legacy cost and uses level', () => {
    expect(getSkillCooldownOrCost(move({ category: 'elemental', level: 3, cost: 99, cooldown: 99 }))).toBe(2);
  });
  it('RR Candy uses stored cost when positive', () => {
    expect(getSkillCooldownOrCost(move({ id: 'rr-candy-test', category: 'system', cost: 5, cooldown: 3 }))).toBe(5);
  });
});

describe('getSkillLevelForCooldownCost', () => {
  it('manifest uses move.level capped at 10', () => {
    expect(
      getSkillLevelForCooldownCost(
        move({ category: 'manifest', level: 10, id: 'm1' }) as Pick<Move, 'level' | 'id' | 'category' | 'effectKey'>
      )
    ).toBe(10);
    expect(
      getSkillLevelForCooldownCost(
        move({ category: 'manifest', level: 25, id: 'm2' }) as Pick<Move, 'level' | 'id' | 'category' | 'effectKey'>
      )
    ).toBe(10);
  });
});
