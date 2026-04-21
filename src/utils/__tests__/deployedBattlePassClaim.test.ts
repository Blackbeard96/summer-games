import {
  countDeployedBattlePassClaimsInChoiceGroup,
  deployedBattlePassChoiceClaimKey,
  deployedBattlePassFlatClaimKey,
} from '../deployedBattlePassClaim';

describe('deployedBattlePassClaim keys', () => {
  test('flat claim key is stable', () => {
    expect(deployedBattlePassFlatClaimKey('season-1', 3, 'r42')).toBe('deployedBp_season-1_3_r42');
  });

  test('choice claim key includes group and reward', () => {
    expect(deployedBattlePassChoiceClaimKey('s1', 2, 'grp', 'optA')).toBe('deployedBp_s1_2_ggrp_roptA');
  });

  test('countDeployedBattlePassClaimsInChoiceGroup', () => {
    const claimed = ['deployedBp_s1_2_gg1_ra', 'deployedBp_s1_2_gg1_rb', 'other'];
    expect(countDeployedBattlePassClaimsInChoiceGroup(claimed, 's1', 2, 'g1')).toBe(2);
    expect(countDeployedBattlePassClaimsInChoiceGroup(claimed, 's1', 2, 'g2')).toBe(0);
  });
});
