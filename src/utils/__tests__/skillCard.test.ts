import {
  getDefaultSkillArt,
  getDefaultSkillArtKey,
  normalizeSkillArtKey,
  resolveSkillArtwork,
  validateSkillArtFile,
  SKILL_ART_MAX_BYTES,
} from '../skillArtworkDefaults';
import {
  acceptActivation,
  createDedupeState,
  enqueuePending,
  getCardDuration,
  SKILL_CARD_ACCELERATED_MS,
  SKILL_CARD_DURATION_MS,
  SKILL_CARD_MAX_PENDING,
  SKILL_CARD_SOFT_DEDUPE_MS,
  emitSkillActivation,
  subscribeSkillActivations,
  markSkillActivationsSeen,
  clearSkillActivations,
  type SkillActivationEvent,
} from '../skillActivationQueue';
import {
  appendSkillActivationRecord,
  buildSkillActivationRecord,
  takeUnseenSkillActivations,
  SKILL_ACTIVATION_HISTORY_CAP,
} from '../skillActivationSync';

const ev = (id: string, over: Partial<SkillActivationEvent> = {}): SkillActivationEvent => ({
  id,
  skill: { id: 'fireball', name: 'Fireball', category: 'elemental', elementalAffinity: 'fire' },
  actorName: 'Ava',
  actorUid: 'u1',
  ...over,
});

describe('skill artwork resolution', () => {
  it('normalizes keys to Firestore-safe field names', () => {
    expect(normalizeSkillArtKey('Flame Burst!')).toBe('flame_burst');
    expect(normalizeSkillArtKey('  Écho--Strike ')).toBe('echo_strike');
    expect(normalizeSkillArtKey('')).toBe('');
    expect(normalizeSkillArtKey('a.b/c')).toBe('a_b_c');
  });

  it('prefers the skill imageUrl, then admin entry, then category, then universal', () => {
    const entries = { flame_burst: { imageUrl: 'https://cdn.example/flame.png' } };
    expect(resolveSkillArtwork({ name: 'X', imageUrl: 'https://cdn.example/own.png' }, entries).src).toBe(
      'https://cdn.example/own.png'
    );
    const custom = resolveSkillArtwork({ name: 'Flame Burst', category: 'elemental', elementalAffinity: 'fire' }, entries);
    expect(custom.source).toBe('custom');
    expect(custom.src).toBe('https://cdn.example/flame.png');
    expect(custom.fallbackSrc).toBe(getDefaultSkillArt('elemental_fire'));

    const elemental = resolveSkillArtwork({ name: 'Unknown', category: 'elemental', elementalAffinity: 'water' }, entries);
    expect(elemental.source).toBe('category');
    expect(elemental.src).toBe(getDefaultSkillArt('elemental_water'));

    const manifest = resolveSkillArtwork({ name: 'Read the Room', category: 'manifest' }, {});
    expect(manifest.src).toBe(getDefaultSkillArt('manifest'));

    const universal = resolveSkillArtwork({ name: 'Shield Bash' }, null);
    expect(universal.source).toBe('universal');
    expect(universal.src.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('finds artwork through the template name when a skill was renamed', () => {
    const entries = { fire_ball: { imageUrl: 'https://cdn.example/fb.png' } };
    const r = resolveSkillArtwork({ name: 'Inferno Orb', category: 'elemental' }, entries, ['Fire Ball']);
    expect(r.src).toBe('https://cdn.example/fb.png');
  });

  it('ignores unusable urls instead of rendering a broken image', () => {
    const r = resolveSkillArtwork({ name: 'Zap', imageUrl: 'javascript:alert(1)', category: 'manifest' }, {
      zap: { imageUrl: '' },
    });
    expect(r.source).toBe('category');
  });

  it('picks element defaults for elemental and CPU skills only', () => {
    expect(getDefaultSkillArtKey({ category: 'elemental', elementalAffinity: 'lightning' })).toBe('elemental_lightning');
    expect(getDefaultSkillArtKey({ category: 'cpu', elementalAffinity: 'earth' })).toBe('elemental_earth');
    expect(getDefaultSkillArtKey({ category: 'manifest', elementalAffinity: 'fire' })).toBe('manifest');
    expect(getDefaultSkillArtKey({ category: 'system' })).toBe('universal');
  });

  it('validates artwork uploads', () => {
    expect(validateSkillArtFile({ type: 'image/png', size: 1000 })).toBeNull();
    expect(validateSkillArtFile({ type: 'image/webp', size: 1000 })).toBeNull();
    expect(validateSkillArtFile({ type: 'image/gif', size: 1000 })).toMatch(/PNG, JPG, or WebP/);
    expect(validateSkillArtFile({ type: 'image/svg+xml', size: 1000 })).toMatch(/PNG, JPG, or WebP/);
    expect(validateSkillArtFile({ type: 'image/jpeg', size: SKILL_ART_MAX_BYTES + 1 })).toMatch(/MB or smaller/);
    expect(validateSkillArtFile({ type: 'image/jpeg', size: 0 })).toMatch(/empty/);
  });
});

describe('skill activation queue', () => {
  it('dedupes by id and by actor+skill within the soft window', () => {
    const s = createDedupeState();
    expect(acceptActivation(s, ev('a'), 1000)).toBe(true);
    expect(acceptActivation(s, ev('a'), 5000)).toBe(false);
    expect(acceptActivation(s, ev('b'), 1000 + SKILL_CARD_SOFT_DEDUPE_MS - 1)).toBe(false);
    expect(acceptActivation(s, ev('c'), 1000 + SKILL_CARD_SOFT_DEDUPE_MS * 3)).toBe(true);
    expect(acceptActivation(s, ev('d', { actorUid: 'u2' }), 1000 + SKILL_CARD_SOFT_DEDUPE_MS * 3)).toBe(true);
  });

  it('rejects malformed events', () => {
    const s = createDedupeState();
    expect(acceptActivation(s, ev(''), 1)).toBe(false);
    expect(acceptActivation(s, ev('x', { skill: { name: '' } }), 1)).toBe(false);
  });

  it('keeps confirmed order and caps waiting cards', () => {
    let q: SkillActivationEvent[] = [];
    for (let i = 0; i < SKILL_CARD_MAX_PENDING + 2; i++) q = enqueuePending(q, ev(`e${i}`));
    expect(q).toHaveLength(SKILL_CARD_MAX_PENDING);
    expect(q.map((e) => e.id)).toEqual(['e2', 'e3', 'e4']);
  });

  it('uses 2.5s normally and accelerates when cards are waiting', () => {
    expect(getCardDuration(0, false)).toBe(SKILL_CARD_DURATION_MS);
    expect(SKILL_CARD_DURATION_MS).toBe(2500);
    expect(getCardDuration(2, false)).toBe(SKILL_CARD_ACCELERATED_MS);
    expect(getCardDuration(0, true)).toBeLessThan(SKILL_CARD_DURATION_MS);
  });

  it('bus delivers once, honors pre-seen ids, and broadcasts clear', () => {
    const got: string[] = [];
    const unsub = subscribeSkillActivations((m) => got.push(m.kind === 'show' ? m.event.id : 'clear'));
    markSkillActivationsSeen(['bus-seen']);
    expect(emitSkillActivation(ev('bus-seen', { actorUid: 'z1' }))).toBe(false);
    expect(emitSkillActivation(ev('bus-1', { actorUid: 'z2' }))).toBe(true);
    expect(emitSkillActivation(ev('bus-1', { actorUid: 'z2' }))).toBe(false);
    clearSkillActivations();
    unsub();
    expect(got).toEqual(['bus-1', 'clear']);
  });
});

describe('live event skill activation sync', () => {
  it('builds Firestore-safe records (no undefined) and drops self target', () => {
    const r = buildSkillActivationRecord({
      actorUid: 'abc123456789',
      actorName: 'Ava',
      targetUid: 'abc123456789',
      targetName: 'Ava',
      move: { id: 'm1', name: 'Shield Up', category: 'manifest' },
      now: 1700000000000,
    });
    expect(r.targetName).toBeNull();
    expect(r.elementalAffinity).toBeNull();
    expect(Object.values(r).some((v) => v === undefined)).toBe(false);
    expect(r.id.startsWith('sa_')).toBe(true);
  });

  it('caps history and ignores junk rows', () => {
    let list: unknown = [{ bogus: true }, null];
    for (let i = 0; i < SKILL_ACTIVATION_HISTORY_CAP + 3; i++) {
      list = appendSkillActivationRecord(list, buildSkillActivationRecord({ actorUid: `u${i}`, actorName: 'P', move: { name: `S${i}` }, now: i }));
    }
    expect((list as unknown[]).length).toBe(SKILL_ACTIVATION_HISTORY_CAP);
  });

  it('returns only unseen records, oldest first, and never replays', () => {
    const a = buildSkillActivationRecord({ actorUid: 'u1', actorName: 'A', move: { name: 'X' }, now: 20 });
    const b = buildSkillActivationRecord({ actorUid: 'u2', actorName: 'B', move: { name: 'Y' }, now: 10 });
    const seen = new Set<string>();
    expect(takeUnseenSkillActivations([a, b], seen).map((r) => r.moveName)).toEqual(['Y', 'X']);
    expect(takeUnseenSkillActivations([a, b], seen)).toEqual([]);
    expect(takeUnseenSkillActivations(undefined, seen)).toEqual([]);
  });
});
