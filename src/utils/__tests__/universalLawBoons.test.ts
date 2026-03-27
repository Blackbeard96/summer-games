import {
  computeNodeEligibility,
  getMaxLoadoutSlotsFromEffects,
  resolveUniversalLawEffects,
  sanitizeUniversalLawProgress,
} from '../universalLawBoons';
import { getBoonNodeById } from '../../data/universalLawTrees';

describe('universalLawBoons', () => {
  it('allows unlock when prerequisites and currencies are met', () => {
    const node = getBoonNodeById('divine_unified_arsenal');
    expect(node).toBeDefined();
    if (!node) return;
    const result = computeNodeEligibility(
      node,
      {
        unlockedNodeIds: ['divine_shared_resonance'],
        unlockedByLaw: {
          divine_oneness: ['divine_shared_resonance'],
          vibration: [],
          attraction: [],
          rhythm: [],
        },
        totalSpentPP: 0,
        totalSpentTruthMetalShards: 0,
      },
      { powerPoints: 9999, truthMetalShards: 99 }
    );
    expect(result.canUnlock).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('blocks unlock when PP is insufficient', () => {
    const node = getBoonNodeById('divine_unified_arsenal');
    if (!node) return;
    const result = computeNodeEligibility(
      node,
      {
        unlockedNodeIds: ['divine_shared_resonance'],
        unlockedByLaw: {
          divine_oneness: ['divine_shared_resonance'],
          vibration: [],
          attraction: [],
          rhythm: [],
        },
        totalSpentPP: 0,
        totalSpentTruthMetalShards: 0,
      },
      { powerPoints: 100, truthMetalShards: 99 }
    );
    expect(result.canUnlock).toBe(false);
    expect(result.insufficientPP).toBe(true);
  });

  it('blocks unlock when Truth Metal is insufficient', () => {
    const node = getBoonNodeById('divine_unified_arsenal');
    if (!node) return;
    const result = computeNodeEligibility(
      node,
      {
        unlockedNodeIds: ['divine_shared_resonance'],
        unlockedByLaw: {
          divine_oneness: ['divine_shared_resonance'],
          vibration: [],
          attraction: [],
          rhythm: [],
        },
        totalSpentPP: 0,
        totalSpentTruthMetalShards: 0,
      },
      { powerPoints: 9999, truthMetalShards: 0 }
    );
    expect(result.canUnlock).toBe(false);
    expect(result.insufficientTruthMetal).toBe(true);
  });

  it('blocks unlock when prerequisites are missing', () => {
    const node = getBoonNodeById('divine_unified_arsenal');
    if (!node) return;
    const result = computeNodeEligibility(
      node,
      {
        unlockedNodeIds: [],
        unlockedByLaw: {
          divine_oneness: [],
          vibration: [],
          attraction: [],
          rhythm: [],
        },
        totalSpentPP: 0,
        totalSpentTruthMetalShards: 0,
      },
      { powerPoints: 9999, truthMetalShards: 99 }
    );
    expect(result.canUnlock).toBe(false);
    expect(result.missingPrerequisites).toContain('divine_shared_resonance');
  });

  it('resolves stacked effects from multiple unlocked nodes', () => {
    const effects = resolveUniversalLawEffects([
      'divine_unified_arsenal',
      'divine_shared_resonance',
      'attraction_power_magnet',
    ]);
    expect(effects.maxLoadoutSlotsBonus).toBe(1);
    expect(effects.artifactPerkMultiplierBonusFraction).toBeGreaterThan(0);
    expect(effects.battleRewardPpMultiplierBonusFraction).toBeGreaterThan(0);
  });

  it('applies loadout slot bonus on top of base max slots', () => {
    const effects = resolveUniversalLawEffects(['divine_unified_arsenal']);
    expect(getMaxLoadoutSlotsFromEffects(effects)).toBe(7);
  });

  it('handles legacy progress objects without crashing', () => {
    const progress = sanitizeUniversalLawProgress({});
    expect(progress.unlockedNodeIds).toEqual([]);
    expect(progress.totalSpentPP).toBe(0);
    expect(progress.totalSpentTruthMetalShards).toBe(0);
  });
});

