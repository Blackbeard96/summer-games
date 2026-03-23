/**
 * Legendary artifact skill derivation: catalog merge + equipped resolution.
 */

import {
  enrichEquippedArtifactsFromCatalog,
  findEquippableRow,
  getArtifactSkillsFromEquipped,
  mergeEquippableCatalogLayers,
  resolveArtifactSkillWithCatalog,
  skillPayloadFromEquippableCatalogForArtifact,
} from '../battleSkillsService';

describe('battleSkillsService artifact skills', () => {
  it('findEquippableRow matches catalog key when equipped id normalizes equal', () => {
    const catalog = {
      'blaze-ring-v2': {
        id: 'blaze-ring-v2',
        artifactSkill: { name: 'Inferno Tap', id: 'inferno-tap', cost: 1, cooldown: 0 },
      },
    };
    expect(findEquippableRow(catalog, 'Blaze-Ring-V2')).toEqual(catalog['blaze-ring-v2']);
    expect(findEquippableRow(catalog, 'blaze_ring_v2')).toEqual(catalog['blaze-ring-v2']);
  });

  it('enrichEquippedArtifactsFromCatalog attaches artifactSkill from catalog when slot lacks it', () => {
    const equipped = {
      ring1: { id: 'my-artifact', name: 'Ring' },
    };
    const rawDoc = {
      lastUpdated: {},
      myartifact: {
        id: 'my-artifact',
        artifactSkill: { name: 'Soul Strike', id: 'soul-strike', cost: 2 },
      },
    };
    const enriched = enrichEquippedArtifactsFromCatalog(equipped, rawDoc);
    expect(enriched.ring1.artifactSkill?.name).toBe('Soul Strike');
  });

  it('getArtifactSkillsFromEquipped returns one system Move per equipped legendary skill', () => {
    const moves = getArtifactSkillsFromEquipped({
      equippedArtifacts: {
        ring1: {
          id: 'r1',
          artifactSkill: { name: 'Test Skill', id: 'test-skill-1', cost: 1, cooldown: 0 },
        },
      },
      artifacts: {},
    });
    expect(moves).toHaveLength(1);
    expect(moves[0].name).toBe('Test Skill');
    expect(moves[0].id).toBe('test-skill-1');
    expect(moves[0].category).toBe('system');
    expect(moves[0].unlocked).toBe(true);
  });

  it('getArtifactSkillsFromEquipped returns empty when no equipment', () => {
    expect(
      getArtifactSkillsFromEquipped({ equippedArtifacts: {}, artifacts: {} })
    ).toEqual([]);
    expect(
      getArtifactSkillsFromEquipped({ equippedArtifacts: null, artifacts: {} } as any)
    ).toEqual([]);
  });

  it('resolves skill from students.artifacts *_purchase when equipped omits artifactSkill', () => {
    const moves = getArtifactSkillsFromEquipped({
      equippedArtifacts: { ring1: { id: 'ember-band' } },
      artifacts: {
        ember_band_purchase: {
          artifactSkill: { name: 'From Grant', id: 'from-grant' },
        },
      },
    });
    expect(moves).toHaveLength(1);
    expect(moves[0].name).toBe('From Grant');
  });

  it('enrich matches catalog row by equipped display name when id mismatches', () => {
    const equipped = { weapon: { id: 'wrong-id', name: 'Magical Paintbrush' } };
    const rawDoc = {
      pb: { id: 'magical-paintbrush', name: 'Magical Paintbrush', artifactSkill: { name: 'Stroke', id: 'stroke' } },
    };
    const enriched = enrichEquippedArtifactsFromCatalog(equipped, rawDoc);
    expect(enriched.weapon.artifactSkill?.name).toBe('Stroke');
  });

  it('resolves grantedSkill from _purchase payload', () => {
    const moves = getArtifactSkillsFromEquipped({
      equippedArtifacts: { ring1: { id: 'x' } },
      artifacts: { x_purchase: { grantedSkill: { name: 'Alt Field', id: 'alt' } } },
    });
    expect(moves[0].name).toBe('Alt Field');
  });

  it('enrich still merges when equipped has empty artifactSkill.name', () => {
    const enriched = enrichEquippedArtifactsFromCatalog(
      {
        weapon: {
          id: 'brush',
          name: 'Magical Paintbrush',
          artifactSkill: { name: '', description: 'x' },
        },
      },
      {
        brush: { name: 'Magical Paintbrush', artifactSkill: { name: 'Stroke', id: 'stroke-1' } },
      }
    );
    expect(enriched.weapon.artifactSkill?.name).toBe('Stroke');
  });

  it('getArtifactSkillsFromEquipped uses catalog when equip doc has no skill', () => {
    const moves = getArtifactSkillsFromEquipped(
      {
        equippedArtifacts: { weapon: { id: 'x', name: 'Magical Paintbrush' } },
        artifacts: {},
      },
      {
        'magical-paintbrush': {
          name: 'Magical Paintbrush',
          artifactSkill: { name: 'Stroke of Creation', id: 'soc' },
        },
      }
    );
    expect(moves).toHaveLength(1);
    expect(moves[0].name).toBe('Stroke of Creation');
    expect(moves[0].artifactGrant?.artifactLevel).toBe(1);
  });

  it('getArtifactSkillsFromEquipped sets artifactGrant level from equipped artifact', () => {
    const moves = getArtifactSkillsFromEquipped(
      {
        equippedArtifacts: {
          weapon: { id: 'brush', name: 'Magical Paintbrush', level: 6 },
        },
        artifacts: {},
      },
      {
        brush: {
          name: 'Magical Paintbrush',
          artifactSkill: {
            name: 'Stroke of Creation',
            id: 'soc',
            statusEffects: [
              { type: 'summon', duration: 2, summonElementalType: 'light', summonDamage: 100 },
            ],
          },
        },
      }
    );
    expect(moves[0].artifactGrant?.artifactLevel).toBe(6);
    expect(moves[0].artifactGrant?.artifactName).toBe('Magical Paintbrush');
  });

  it('resolveArtifactSkillWithCatalog matches fuzzy artifact name', () => {
    const sk = resolveArtifactSkillWithCatalog(
      { id: 'weird', name: 'Magical Paintbrush' },
      {},
      {
        mp: { name: 'Magical Paintbrush', artifactSkill: { name: 'Paint', id: 'p1' } },
      }
    );
    expect(sk?.name).toBe('Paint');
  });

  it('resolveArtifactSkillWithCatalog extracts nested skill shape', () => {
    const sk = resolveArtifactSkillWithCatalog(
      { id: 'weird', name: 'Magical Paintbrush' },
      {},
      {
        mp: {
          name: 'Magical Paintbrush',
          artifactSkill: { skill: { name: 'Nested Paint', id: 'np1' }, description: 'x' },
        },
      }
    );
    expect(sk?.name).toBe('Nested Paint');
  });

  it('extracts usable skill name when admin saved artifactSkill.name="" but id exists', () => {
    const sk = resolveArtifactSkillWithCatalog(
      { id: 'magic-brush', name: 'Magical Paintbrush' },
      {},
      {
        'magic-brush': {
          id: 'magic-brush',
          name: 'Magical Paintbrush',
          artifactSkill: { id: 'magic-brush-skill', name: '', description: 'desc' },
        },
      }
    );
    expect(sk?.name).toBe('magic-brush-skill');
  });

  it('skillPayloadFromEquippableCatalogForArtifact returns persistable skill', () => {
    const raw = {
      'magical-paintbrush': {
        id: 'magical-paintbrush',
        name: 'Magical Paintbrush',
        artifactSkill: { name: 'Paint Strike', id: 'paint-strike', description: 'Pow' },
      },
    };
    const p = skillPayloadFromEquippableCatalogForArtifact(raw, {
      id: 'magical-paintbrush',
      name: 'Magical Paintbrush',
    });
    expect(p?.name).toBe('Paint Strike');
    expect(p?.id).toBe('paint-strike');
  });

  it('mergeEquippableCatalogLayers flattens nested artifacts map for enrich', () => {
    expect(
      mergeEquippableCatalogLayers({
        lastUpdated: {},
        artifacts: { brush: { id: 'brush', artifactSkill: { name: 'Paint', id: 'p' } } },
      }).brush
    ).toBeDefined();
    const enriched = enrichEquippedArtifactsFromCatalog(
      { weapon: { id: 'brush' } },
      { lastUpdated: {}, artifacts: { brush: { id: 'brush', artifactSkill: { name: 'Paint', id: 'p' } } } }
    );
    expect(enriched.weapon.artifactSkill?.name).toBe('Paint');
  });
});
