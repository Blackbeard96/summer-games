import {
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
});
