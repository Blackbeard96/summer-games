import { buildBattleMovesForManifest, getManifestSkillsFromTemplates } from '../battleMovesManifestSync';

describe('battleMovesManifestSync', () => {
  it('builds unlocked Manifest skills for reading', () => {
    const moves = getManifestSkillsFromTemplates('reading');
    expect(moves.length).toBeGreaterThanOrEqual(2);
    expect(moves.every((m) => m.category === 'manifest')).toBe(true);
    expect(moves.every((m) => m.unlocked)).toBe(true);
    expect(moves.every((m) => m.manifestType === 'reading')).toBe(true);
  });

  it('normalizes case and unlocks system + manifest', () => {
    const moves = buildBattleMovesForManifest('Reading');
    const manifest = moves.filter((m) => m.category === 'manifest' && m.unlocked);
    const system = moves.filter((m) => m.category === 'system' && m.unlocked);
    expect(manifest.length).toBeGreaterThanOrEqual(2);
    expect(system.length).toBeGreaterThanOrEqual(2);
  });

  it('never emits undefined fields (Firestore rejects them)', () => {
    const moves = buildBattleMovesForManifest('creating', {
      canUseElemental: true,
      userElement: 'water',
    });
    const offenders = moves.flatMap((m) =>
      Object.entries(m)
        .filter(([, v]) => v === undefined)
        .map(([k]) => `${m.id}.${k}`)
    );
    expect(offenders).toEqual([]);
  });

  it('unlocks L1 elemental skills when Element access is granted', () => {
    const locked = buildBattleMovesForManifest('creating', {
      canUseElemental: false,
      userElement: 'fire',
    });
    expect(locked.filter((m) => m.category === 'elemental' && m.unlocked)).toHaveLength(0);

    const unlocked = buildBattleMovesForManifest('creating', {
      canUseElemental: true,
      userElement: 'fire',
    });
    const fireL1 = unlocked.filter(
      (m) =>
        m.category === 'elemental' &&
        m.unlocked &&
        m.level === 1 &&
        (m.elementalAffinity || '').toString().toLowerCase() === 'fire'
    );
    expect(fireL1.length).toBeGreaterThanOrEqual(1);
    expect(
      unlocked.some(
        (m) =>
          m.category === 'elemental' &&
          m.unlocked &&
          (m.elementalAffinity || '').toString().toLowerCase() === 'water'
      )
    ).toBe(false);
  });
});
