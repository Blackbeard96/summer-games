import {
  SKILL_UPGRADE_COSTS,
  getSkillUpgradeCost,
  getSkillUpgradeCostFromLevel,
  getSkillAscensionKind,
  isSkillAtMaxMastery,
  getSkillUpgradeButtonLabel,
  getSkillUpgradeSuccessMessage,
} from '../skillUpgradeCosts';

describe('skillUpgradeCosts', () => {
  it('uses the fixed progression table', () => {
    expect(SKILL_UPGRADE_COSTS).toEqual({
      2: 150,
      3: 300,
      4: 500,
      5: 800,
      6: 1000,
      7: 1300,
      8: 1700,
      9: 2200,
      10: 3000,
    });
  });

  it('returns costs by current and target level', () => {
    expect(getSkillUpgradeCostFromLevel(1)).toBe(150);
    expect(getSkillUpgradeCostFromLevel(2)).toBe(300);
    expect(getSkillUpgradeCostFromLevel(3)).toBe(500);
    expect(getSkillUpgradeCostFromLevel(4)).toBe(800);
    expect(getSkillUpgradeCostFromLevel(5)).toBe(1000);
    expect(getSkillUpgradeCostFromLevel(6)).toBe(1300);
    expect(getSkillUpgradeCostFromLevel(7)).toBe(1700);
    expect(getSkillUpgradeCostFromLevel(8)).toBe(2200);
    expect(getSkillUpgradeCostFromLevel(9)).toBe(3000);
    expect(getSkillUpgradeCostFromLevel(10)).toBeNull();
    expect(getSkillUpgradeCost(5)).toBe(800);
    expect(getSkillUpgradeCost(11)).toBeNull();
  });

  it('detects only Level 5 and Level 10 ascensions', () => {
    expect(getSkillAscensionKind(5)).toBe('first');
    expect(getSkillAscensionKind(10)).toBe('final');
    expect(getSkillAscensionKind(6)).toBeNull();
    expect(getSkillAscensionKind(9)).toBeNull();
    expect(isSkillAtMaxMastery(10)).toBe(true);
    expect(isSkillAtMaxMastery(9)).toBe(false);
  });

  it('builds milestone button and success copy', () => {
    expect(getSkillUpgradeButtonLabel(5)).toContain('First Ascension');
    expect(getSkillUpgradeButtonLabel(6)).toBe('Upgrade to Level 6 (1,000 PP)');
    expect(getSkillUpgradeButtonLabel(10)).toContain('Final Ascension');
    expect(getSkillUpgradeSuccessMessage('Flame Burst', 5)).toBe(
      'Successfully Ascended Flame Burst to Level 5!'
    );
    expect(getSkillUpgradeSuccessMessage('Flame Burst', 10)).toBe(
      'Successfully completed Final Ascension for Flame Burst!'
    );
    expect(getSkillUpgradeSuccessMessage('Flame Burst', 6)).toBe(
      'Successfully upgraded Flame Burst to Level 6!'
    );
  });
});
