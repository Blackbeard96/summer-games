import {
  applyElementalDamage,
  attackElementFromActionCard,
  attackElementFromCpuStrike,
  attackElementFromMove,
  elementEffectivenessBattleLogLine,
  getElementEffectiveness,
  getElementMultiplier,
} from '../elementAdvantages';

/** Minimal move shape for attackElementFromMove tests (untyped so Jest/Babel accepts this .ts file). */
function atk(partial) {
  return partial;
}

describe('elementAdvantages', () => {
  describe('getElementMultiplier', () => {
    it('Water vs Fire = 1.5', () => {
      expect(getElementMultiplier('water', 'fire')).toBe(1.5);
    });
    it('Fire vs Water = 0.5', () => {
      expect(getElementMultiplier('fire', 'water')).toBe(0.5);
    });
    it('Fire vs Earth = 1.5', () => {
      expect(getElementMultiplier('fire', 'earth')).toBe(1.5);
    });
    it('Earth vs Fire = 0.5', () => {
      expect(getElementMultiplier('earth', 'fire')).toBe(0.5);
    });
    it('Air vs Lightning = 1.5', () => {
      expect(getElementMultiplier('air', 'lightning')).toBe(1.5);
    });
    it('Lightning vs Air = 0.5', () => {
      expect(getElementMultiplier('lightning', 'air')).toBe(0.5);
    });
    it('Lightning vs Metal = 1.5', () => {
      expect(getElementMultiplier('lightning', 'metal')).toBe(1.5);
    });
    it('Metal vs Lightning = 0.5', () => {
      expect(getElementMultiplier('metal', 'lightning')).toBe(0.5);
    });
    it('Metal vs Air = 1.5', () => {
      expect(getElementMultiplier('metal', 'air')).toBe(1.5);
    });
    it('Air vs Metal = 0.5', () => {
      expect(getElementMultiplier('air', 'metal')).toBe(0.5);
    });
    it('Light vs Dark = 1.5', () => {
      expect(getElementMultiplier('light', 'dark')).toBe(1.5);
    });
    it('Dark vs Light = 1.5', () => {
      expect(getElementMultiplier('dark', 'light')).toBe(1.5);
    });
    it('Light vs Light = 1.0', () => {
      expect(getElementMultiplier('light', 'light')).toBe(1);
    });
    it('missing attack or target type = 1.0', () => {
      expect(getElementMultiplier(null, 'fire')).toBe(1);
      expect(getElementMultiplier('water', null)).toBe(1);
      expect(getElementMultiplier(undefined, 'fire')).toBe(1);
    });
  });

  describe('getElementEffectiveness', () => {
    it('labels advantage / disadvantage / neutral', () => {
      expect(getElementEffectiveness('water', 'fire')).toBe('advantage');
      expect(getElementEffectiveness('fire', 'water')).toBe('disadvantage');
      expect(getElementEffectiveness('water', 'air')).toBe('neutral');
    });
  });

  describe('elementEffectivenessBattleLogLine', () => {
    it('maps multipliers to log lines', () => {
      expect(elementEffectivenessBattleLogLine(1.5)).toBe(
        '✨ Type advantage — deals extra damage! (Advantage)'
      );
      expect(elementEffectivenessBattleLogLine(0.5)).toBe(
        '📉 Type disadvantage — deals reduced damage. (Disadvantage)'
      );
      expect(elementEffectivenessBattleLogLine(1)).toBe(null);
    });
  });

  describe('attackElementFromCpuStrike', () => {
    it('uses move affinity first, then fallback', () => {
      expect(attackElementFromCpuStrike({ type: 'attack', elementalAffinity: 'dark' }, 'light')).toBe(
        'dark'
      );
      expect(attackElementFromCpuStrike({ type: 'attack' }, 'light')).toBe('light');
      expect(attackElementFromCpuStrike({ type: 'heal' }, 'light')).toBe(null);
    });
  });

  describe('attackElementFromMove', () => {
    it('only elemental-category attacks yield an element', () => {
      expect(
        attackElementFromMove(
          atk({ type: 'attack', category: 'elemental', elementalAffinity: 'water' })
        )
      ).toBe('water');
      expect(
        attackElementFromMove(
          atk({ type: 'attack', category: 'manifest', elementalAffinity: 'fire' })
        )
      ).toBe(null);
      expect(attackElementFromMove(atk({ type: 'attack', category: 'elemental' }))).toBe(null);
      expect(
        attackElementFromMove(atk({ type: 'utility', category: 'elemental', elementalAffinity: 'fire' }))
      ).toBe(null);
    });
    it('construct-skill ids use affinity for type chart', () => {
      expect(
        attackElementFromMove(
          atk({
            id: 'construct-skill::summon1::strike',
            type: 'attack',
            category: 'system',
            elementalAffinity: 'light',
          })
        )
      ).toBe('light');
    });
    it('normalizes shadow to dark', () => {
      expect(
        attackElementFromMove(
          atk({ type: 'attack', category: 'elemental', elementalAffinity: 'shadow' })
        )
      ).toBe('dark');
    });
  });

  describe('attackElementFromActionCard', () => {
    const freezeCard = (partial) => ({
      type: 'attack',
      elementalAffinity: 'water',
      effect: { type: 'freeze', strength: 20 },
      ...partial,
    });

    it('returns element for attack + freeze + affinity', () => {
      expect(attackElementFromActionCard(freezeCard({}))).toBe('water');
    });
    it('returns null for utility teleport_pp even with affinity', () => {
      expect(
        attackElementFromActionCard(
          freezeCard({
            type: 'utility',
            effect: { type: 'teleport_pp', strength: 25 },
          })
        )
      ).toBe(null);
    });
    it('returns element for shield_breach attack cards', () => {
      expect(
        attackElementFromActionCard(
          freezeCard({
            elementalAffinity: 'metal',
            effect: { type: 'shield_breach', strength: 22 },
          })
        )
      ).toBe('metal');
    });
  });

  /**
   * Characterization tests: these pin the exact arithmetic the six inlined copies in
   * BattleEngine performed before they were replaced by applyElementalDamage —
   * `Math.max(0, Math.floor(damage * mult))` plus the matching log line. If a change
   * here makes one of these fail, battle damage has shifted.
   */
  describe('applyElementalDamage', () => {
    it('multiplies by 1.5 and floors on advantage', () => {
      // 25 * 1.5 = 37.5 -> 37, not 38
      expect(applyElementalDamage(25, 'water', 'fire')).toEqual({
        damage: 37,
        multiplier: 1.5,
        logLine: '✨ Type advantage — deals extra damage! (Advantage)',
      });
    });

    it('multiplies by 0.5 and floors on disadvantage', () => {
      // 25 * 0.5 = 12.5 -> 12
      expect(applyElementalDamage(25, 'fire', 'water')).toEqual({
        damage: 12,
        multiplier: 0.5,
        logLine: '📉 Type disadvantage — deals reduced damage. (Disadvantage)',
      });
    });

    it('leaves damage untouched and logs nothing on a neutral matchup', () => {
      expect(applyElementalDamage(40, 'fire', 'lightning')).toEqual({
        damage: 40,
        multiplier: 1,
        logLine: null,
      });
    });

    it('treats a missing attack or defender element as neutral', () => {
      expect(applyElementalDamage(40, null, 'fire')).toEqual({
        damage: 40,
        multiplier: 1,
        logLine: null,
      });
      expect(applyElementalDamage(40, 'water', null)).toEqual({
        damage: 40,
        multiplier: 1,
        logLine: null,
      });
      expect(applyElementalDamage(40, undefined, undefined).damage).toBe(40);
    });

    it('clamps to 0 rather than returning negative damage', () => {
      expect(applyElementalDamage(-10, 'water', 'fire').damage).toBe(0);
      expect(applyElementalDamage(0, 'water', 'fire').damage).toBe(0);
    });

    it('floors a disadvantaged 1-damage hit to 0', () => {
      // 1 * 0.5 = 0.5 -> 0; matches the pre-refactor inline behavior exactly
      expect(applyElementalDamage(1, 'fire', 'water').damage).toBe(0);
    });

    it('agrees with getElementMultiplier across the whole chart', () => {
      /** Untyped so Jest/Babel accepts this .ts file, matching the helpers above. */
      const elements = ['water', 'fire', 'earth', 'air', 'lightning', 'metal', 'light', 'dark'] as any[];
      const base = 100;
      elements.forEach((atk) => {
        elements.forEach((def) => {
          const expected = getElementMultiplier(atk, def);
          const result = applyElementalDamage(base, atk, def);
          expect(result.multiplier).toBe(expected);
          expect(result.damage).toBe(Math.max(0, Math.floor(base * expected)));
          expect(result.logLine).toBe(elementEffectivenessBattleLogLine(expected));
        });
      });
    });
  });
});
