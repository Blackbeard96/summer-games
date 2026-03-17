/**
 * Tests for Artifact Rarity & Power Level
 * - Rarity maps to correct power level bonus
 * - Invalid rarity fallback works safely
 */

import {
  getPowerLevelBonusForRarity,
  normalizeArtifactRarity,
  isValidArtifactRarity,
  RARITY_POWER_LEVEL_BONUS,
  ARTIFACT_RARITIES,
} from '../../constants/artifactRarity';
import { getArtifactPower } from '../powerLevel';

describe('Artifact Rarity', () => {
  describe('getPowerLevelBonusForRarity', () => {
    it('maps common to +150', () => {
      expect(getPowerLevelBonusForRarity('common')).toBe(150);
    });
    it('maps uncommon to +300', () => {
      expect(getPowerLevelBonusForRarity('uncommon')).toBe(300);
    });
    it('maps rare to +500', () => {
      expect(getPowerLevelBonusForRarity('rare')).toBe(500);
    });
    it('maps epic to +700', () => {
      expect(getPowerLevelBonusForRarity('epic')).toBe(700);
    });
    it('maps legendary to +900', () => {
      expect(getPowerLevelBonusForRarity('legendary')).toBe(900);
    });
    it('returns common bonus for null/undefined/empty', () => {
      expect(getPowerLevelBonusForRarity(null)).toBe(150);
      expect(getPowerLevelBonusForRarity(undefined)).toBe(150);
      expect(getPowerLevelBonusForRarity('')).toBe(150);
    });
    it('returns common bonus for invalid rarity', () => {
      expect(getPowerLevelBonusForRarity('mythic')).toBe(150);
      expect(getPowerLevelBonusForRarity('invalid')).toBe(150);
    });
    it('is case insensitive', () => {
      expect(getPowerLevelBonusForRarity('LEGENDARY')).toBe(900);
      expect(getPowerLevelBonusForRarity('Rare')).toBe(500);
    });
  });

  describe('normalizeArtifactRarity', () => {
    it('returns valid rarity for known values', () => {
      expect(normalizeArtifactRarity('legendary')).toBe('legendary');
      expect(normalizeArtifactRarity('common')).toBe('common');
    });
    it('returns common for null/undefined/empty/invalid', () => {
      expect(normalizeArtifactRarity(null)).toBe('common');
      expect(normalizeArtifactRarity(undefined)).toBe('common');
      expect(normalizeArtifactRarity('')).toBe('common');
      expect(normalizeArtifactRarity('unknown')).toBe('common');
    });
  });

  describe('isValidArtifactRarity', () => {
    ARTIFACT_RARITIES.forEach((r) => {
      it(`accepts ${r}`, () => {
        expect(isValidArtifactRarity(r)).toBe(true);
      });
    });
    it('rejects invalid values', () => {
      expect(isValidArtifactRarity('mythic')).toBe(false);
      expect(isValidArtifactRarity('')).toBe(false);
    });
  });
});

describe('getArtifactPower (powerLevel.ts)', () => {
  it('uses powerLevelBonus when set', () => {
    expect(getArtifactPower({ id: 'x', powerLevelBonus: 900 })).toBe(900);
    expect(getArtifactPower({ id: 'x', rarity: 'common', powerLevelBonus: 500 })).toBe(500);
  });
  it('derives from rarity when powerLevelBonus missing', () => {
    expect(getArtifactPower({ id: 'x', rarity: 'legendary' })).toBe(900);
    expect(getArtifactPower({ id: 'x', rarity: 'common' })).toBe(150);
    expect(getArtifactPower({ id: 'x', rarity: 'rare' })).toBe(500);
  });
  it('returns 0 for null/undefined', () => {
    expect(getArtifactPower(null)).toBe(0);
    expect(getArtifactPower(undefined)).toBe(0);
  });
  it('fallback for missing rarity uses common', () => {
    expect(getArtifactPower({ id: 'x' })).toBe(150);
  });
});
