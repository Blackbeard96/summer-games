import { isSelfDirectedBattleMove, isValidLiveEventRosterTarget } from '../battleSkillTargetResolution';

describe('battleSkillTargetResolution', () => {
  it('treats Shield ON style moves as self-directed', () => {
    expect(
      isSelfDirectedBattleMove({
        id: 'rr-candy-on-off-shields-on',
        shieldBoost: 50,
        targetType: 'self',
      })
    ).toBe(true);
  });

  it('treats Level 2 manifest with targetType self as self-directed', () => {
    expect(
      isSelfDirectedBattleMove({
        id: 'l2-manifest::abc',
        effectKey: 'level2_manifest',
        targetType: 'self',
      })
    ).toBe(true);
  });

  it('does not treat offensive L2 as self-directed', () => {
    expect(
      isSelfDirectedBattleMove({
        id: 'l2-manifest::abc',
        effectKey: 'level2_manifest',
        targetType: 'single',
      })
    ).toBe(false);
  });

  it('isValidLiveEventRosterTarget allows actor card only for self-directed', () => {
    const move = { id: 'rr-candy-on-off-shields-on', shieldBoost: 50, targetType: 'self' };
    expect(isValidLiveEventRosterTarget({ actorUid: 'u1', candidateUid: 'u1', move })).toBe(true);
    expect(isValidLiveEventRosterTarget({ actorUid: 'u1', candidateUid: 'u2', move })).toBe(false);
  });

  it('isValidLiveEventRosterTarget blocks self for enemy-targeted moves', () => {
    const move = { id: 'rr-candy-on-off-shields-off', targetType: 'single' };
    expect(isValidLiveEventRosterTarget({ actorUid: 'u1', candidateUid: 'u1', move })).toBe(false);
    expect(isValidLiveEventRosterTarget({ actorUid: 'u1', candidateUid: 'u2', move })).toBe(true);
  });
});
