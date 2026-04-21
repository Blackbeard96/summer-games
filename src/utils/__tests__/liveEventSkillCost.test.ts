import type { Move } from '../../types/battle';
import {
  computeLiveEventParticipationSkillCost,
  getLiveEventCanonicalParticipationBaseCost,
  getLiveEventElementalMoveTier,
  getLiveEventSkillCostCategory,
  getLiveEventSkillCost,
} from '../liveEventSkillCost';

const baseMove = (partial: Partial<Move>): Move =>
  ({
    id: 'test-move',
    name: 'Test',
    description: '',
    category: 'manifest',
    type: 'attack',
    level: 1,
    cost: 1,
    cooldown: 0,
    currentCooldown: 0,
    unlocked: true,
    masteryLevel: 5,
    ...partial,
  }) as Move;

describe('getLiveEventSkillCostCategory', () => {
  it('classifies RR Candy by id prefix', () => {
    expect(getLiveEventSkillCostCategory(baseMove({ id: 'rr-candy-on-off-shields-on' }))).toBe('RR_CANDY');
  });
  it('classifies RR Candy by rrCandyNodeId', () => {
    expect(getLiveEventSkillCostCategory(baseMove({ id: 'x', rrCandyNodeId: 'n1' }))).toBe('RR_CANDY');
  });
  it('classifies manifest', () => {
    expect(getLiveEventSkillCostCategory(baseMove({ category: 'manifest' }))).toBe('MANIFEST');
  });
  it('classifies Level 2 manifest hook', () => {
    expect(getLiveEventSkillCostCategory(baseMove({ category: 'system', effectKey: 'level2_manifest' }))).toBe(
      'MANIFEST'
    );
  });
  it('classifies elemental', () => {
    expect(getLiveEventSkillCostCategory(baseMove({ category: 'elemental' }))).toBe('ELEMENTAL');
  });
  it('classifies other', () => {
    expect(getLiveEventSkillCostCategory(baseMove({ category: 'system', id: 'artifact-skill' }))).toBe('OTHER');
  });
});

describe('getLiveEventElementalMoveTier', () => {
  it('clamps to 1–4', () => {
    expect(getLiveEventElementalMoveTier({ level: 0 })).toBe(1);
    expect(getLiveEventElementalMoveTier({ level: 1 })).toBe(1);
    expect(getLiveEventElementalMoveTier({ level: 4 })).toBe(4);
    expect(getLiveEventElementalMoveTier({ level: 99 })).toBe(4);
  });
});

describe('getLiveEventCanonicalParticipationBaseCost', () => {
  it('RR Candy = 4', () => {
    expect(getLiveEventCanonicalParticipationBaseCost(baseMove({ id: 'rr-candy-x', category: 'system' }))).toBe(4);
  });
  it('Manifest = 2', () => {
    expect(getLiveEventCanonicalParticipationBaseCost(baseMove({ category: 'manifest' }))).toBe(2);
  });
  it('Elemental L1–L4', () => {
    expect(getLiveEventCanonicalParticipationBaseCost(baseMove({ category: 'elemental', level: 1 }))).toBe(1);
    expect(getLiveEventCanonicalParticipationBaseCost(baseMove({ category: 'elemental', level: 2 }))).toBe(2);
    expect(getLiveEventCanonicalParticipationBaseCost(baseMove({ category: 'elemental', level: 3 }))).toBe(3);
    expect(getLiveEventCanonicalParticipationBaseCost(baseMove({ category: 'elemental', level: 4 }))).toBe(4);
  });
  it('does not use mastery as elemental tier (high mastery, level 2 → 2 PP)', () => {
    expect(
      getLiveEventCanonicalParticipationBaseCost(
        baseMove({ category: 'elemental', level: 2, masteryLevel: 5 })
      )
    ).toBe(2);
  });
  it('OTHER = 1', () => {
    expect(getLiveEventCanonicalParticipationBaseCost(baseMove({ category: 'system', id: 'construct-skill::x' }))).toBe(
      1
    );
  });
});

describe('computeLiveEventParticipationSkillCost', () => {
  it('ignores legacy move.cost for category pricing', () => {
    const m = baseMove({ category: 'manifest', cost: 99 });
    const b = computeLiveEventParticipationSkillCost(m, null, null, 0, null);
    expect(b.baseCost).toBe(2);
    expect(b.finalCost).toBe(2);
  });

  it('RR Candy returns cost 4 with no equipment', () => {
    const m = baseMove({ id: 'rr-candy-test', category: 'system', cost: 1 });
    const b = computeLiveEventParticipationSkillCost(m, null, null, 0, null);
    expect(b.finalCost).toBe(4);
  });

  it('Manifest returns 2 PP', () => {
    const m = baseMove({ category: 'manifest', cost: 1 });
    expect(computeLiveEventParticipationSkillCost(m, null, null, 0, null).finalCost).toBe(2);
  });

  it('Elemental L3 returns 3 PP', () => {
    const m = baseMove({ category: 'elemental', level: 3, cost: 1 });
    expect(computeLiveEventParticipationSkillCost(m, null, null, 0, null).finalCost).toBe(3);
  });

  it('getLiveEventSkillCost matches breakdown.finalCost', () => {
    const m = baseMove({ category: 'elemental', level: 4 });
    expect(getLiveEventSkillCost(m, null, null, 0, null)).toBe(
      computeLiveEventParticipationSkillCost(m, null, null, 0, null).finalCost
    );
  });
});

describe('Live Event cost vs participation (integration-style)', () => {
  it('player with 4 PP can afford RR Candy (final cost 4)', () => {
    const m = baseMove({ id: 'rr-candy-z', category: 'system' });
    const b = computeLiveEventParticipationSkillCost(m, null, null, 0, null);
    expect(4 >= b.finalCost).toBe(true);
  });
  it('player with 3 PP cannot afford RR Candy (final cost 4)', () => {
    const m = baseMove({ id: 'rr-candy-z', category: 'system' });
    const b = computeLiveEventParticipationSkillCost(m, null, null, 0, null);
    expect(3 >= b.finalCost).toBe(false);
  });
  it('player with 2 PP can afford manifest', () => {
    const m = baseMove({ category: 'manifest' });
    const b = computeLiveEventParticipationSkillCost(m, null, null, 0, null);
    expect(2 >= b.finalCost).toBe(true);
  });
  it('player with 1 PP cannot afford manifest', () => {
    const m = baseMove({ category: 'manifest' });
    const b = computeLiveEventParticipationSkillCost(m, null, null, 0, null);
    expect(1 >= b.finalCost).toBe(false);
  });
  it('elemental L3: 3 PP sufficient, 2 PP not', () => {
    const m = baseMove({ category: 'elemental', level: 3 });
    const b = computeLiveEventParticipationSkillCost(m, null, null, 0, null);
    expect(3 >= b.finalCost).toBe(true);
    expect(2 >= b.finalCost).toBe(false);
  });
});
