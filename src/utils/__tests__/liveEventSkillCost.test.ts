import type { Move } from '../../types/battle';
import {
  computeLiveEventParticipationSkillCost,
  getLiveEventCanonicalParticipationBaseCost,
  getLiveEventElementalMoveTier,
  getLiveEventSkillCostCategory,
  getLiveEventSkillCost,
} from '../liveEventSkillCost';
import { getSkillCooldownOrCost } from '../skillCooldownCost';

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
  it('RR Candy = 2 (classroom Live Event pricing)', () => {
    expect(getLiveEventCanonicalParticipationBaseCost(baseMove({ id: 'rr-candy-x', category: 'system' }))).toBe(2);
  });
  it('Manifest / Elemental / OTHER = 1 (one answer ≈ one skill)', () => {
    expect(getLiveEventCanonicalParticipationBaseCost(baseMove({ category: 'manifest', level: 1 }))).toBe(1);
    expect(getLiveEventCanonicalParticipationBaseCost(baseMove({ category: 'manifest', level: 10 }))).toBe(1);
    expect(getLiveEventCanonicalParticipationBaseCost(baseMove({ category: 'elemental', level: 1 }))).toBe(1);
    expect(getLiveEventCanonicalParticipationBaseCost(baseMove({ category: 'elemental', level: 11 }))).toBe(1);
    expect(getLiveEventCanonicalParticipationBaseCost(baseMove({ category: 'system', id: 'construct-skill::x' }))).toBe(
      1
    );
  });
});

describe('computeLiveEventParticipationSkillCost', () => {
  it('ignores legacy move.cost for category pricing', () => {
    const m = baseMove({ category: 'manifest', cost: 99, level: 1 });
    const b = computeLiveEventParticipationSkillCost(m, null, null, 0, null);
    expect(b.baseCost).toBe(1);
    expect(b.finalCost).toBe(1);
  });

  it('RR Candy returns cost 2 with no equipment', () => {
    const m = baseMove({ id: 'rr-candy-test', category: 'system', cost: 1 });
    const b = computeLiveEventParticipationSkillCost(m, null, null, 0, null);
    expect(b.finalCost).toBe(2);
  });

  it('Manifest any level returns 1 PP in Live Events', () => {
    const m = baseMove({ category: 'manifest', level: 4, cost: 1 });
    expect(computeLiveEventParticipationSkillCost(m, null, null, 0, null).finalCost).toBe(1);
  });

  it('Elemental any level returns 1 PP in Live Events', () => {
    const m = baseMove({ category: 'elemental', level: 9, cost: 1 });
    expect(computeLiveEventParticipationSkillCost(m, null, null, 0, null).finalCost).toBe(1);
  });

  it('getLiveEventSkillCost matches breakdown.finalCost', () => {
    const m = baseMove({ category: 'elemental', level: 4 });
    expect(getLiveEventSkillCost(m, null, null, 0, null)).toBe(
      computeLiveEventParticipationSkillCost(m, null, null, 0, null).finalCost
    );
  });
});

describe('Live Event cost vs participation (integration-style)', () => {
  it('player with 2 PP can afford RR Candy (final cost 2)', () => {
    const m = baseMove({ id: 'rr-candy-z', category: 'system' });
    const b = computeLiveEventParticipationSkillCost(m, null, null, 0, null);
    expect(2 >= b.finalCost).toBe(true);
  });
  it('player with 1 PP cannot afford RR Candy (final cost 2)', () => {
    const m = baseMove({ id: 'rr-candy-z', category: 'system' });
    const b = computeLiveEventParticipationSkillCost(m, null, null, 0, null);
    expect(1 >= b.finalCost).toBe(false);
  });
  it('player with 1 PP can afford any manifest skill', () => {
    const m = baseMove({ category: 'manifest', level: 10 });
    const b = computeLiveEventParticipationSkillCost(m, null, null, 0, null);
    expect(1 >= b.finalCost).toBe(true);
  });
  it('player with 1 PP can afford high-level elemental', () => {
    const m = baseMove({ category: 'elemental', level: 10 });
    const b = computeLiveEventParticipationSkillCost(m, null, null, 0, null);
    expect(1 >= b.finalCost).toBe(true);
  });
});

describe('Live Event base vs shared cooldown/cost helper', () => {
  it('Live Event participation base is flat 1 (vault cooldown/cost helpers stay separate)', () => {
    const manifest = baseMove({ category: 'manifest', level: 5 });
    expect(getLiveEventCanonicalParticipationBaseCost(manifest)).toBe(1);
    expect(getSkillCooldownOrCost(manifest)).toBeGreaterThanOrEqual(1);
    const el = baseMove({ category: 'elemental', level: 7 });
    expect(getLiveEventCanonicalParticipationBaseCost(el)).toBe(1);
  });
});
