import type { Move } from '../../types/battle';
import { resolveSkillAction } from '../battleSkillResolver';
import {
  applyHealFlat,
  applyShieldAbsorption,
  applyEffectToCombatant,
  canReposition,
  canUseSkill,
  createEmptyEffectCombatant,
  modifyIncomingDamage,
  modifyOutgoingDamage,
  processTurnStartEffects,
  recordBattleAction,
  resolveCopyLastMove,
  tickEffectDurations,
  transferDebuffsBetweenCombatants,
} from '../skillEffectEngine/core';
import { validateSkillEffectPayload, validateSkillEffectPayloadList } from '../skillEffectEngine/validate';
import { mergeSkillEffectsIntoResolvedSkillAction } from '../skillEffectEngine/resolverBridge';
import { legacyMoveToSkillEffects } from '../skillEffectEngine/legacyAdapter';
import { level2RecordToSkillEffectPayloads } from '../level2ManifestSkillEffects';

const rngAlways = () => 0.01;

describe('skillEffectEngine validate', () => {
  it('rejects unknown types', () => {
    expect(validateSkillEffectPayload({ type: 'not_real' })).toBeNull();
  });
  it('fills defaults for heal', () => {
    const v = validateSkillEffectPayload({ type: 'heal', value: 12 });
    expect(v?.type).toBe('heal');
    expect(v?.value).toBe(12);
    expect(v?.chance).toBe(100);
  });
  it('validateSkillEffectPayloadList drops invalid', () => {
    const list = validateSkillEffectPayloadList([{ type: 'heal', value: 5 }, { type: 'bad' }]);
    expect(list).toHaveLength(1);
  });
});

describe('skillEffectEngine core', () => {
  it('heal does not exceed max HP', () => {
    const c = createEmptyEffectCombatant('1', 'A', 100);
    c.hp = 95;
    const { healed } = applyHealFlat(c, 100);
    expect(healed).toBe(5);
    expect(c.hp).toBe(100);
  });

  it('shield absorbs before HP path', () => {
    const c = createEmptyEffectCombatant('1', 'A', 100);
    c.shieldPoints = 40;
    const { damageToShield, damageToHp } = applyShieldAbsorption(55, c);
    expect(damageToShield).toBe(40);
    expect(damageToHp).toBe(15);
    expect(c.shieldPoints).toBe(0);
  });

  it('silence prevents non-basic skills', () => {
    const c = createEmptyEffectCombatant('1', 'A', 100);
    applyEffectToCombatant(
      c,
      validateSkillEffectPayload({ type: 'silence', duration: 1, targetScope: 'self' })!,
      'src',
      rngAlways
    );
    expect(canUseSkill(c, { cost: 1, category: 'manifest' }).allowed).toBe(false);
    expect(canUseSkill(c, { cost: 0, category: 'manifest', tags: ['basic_attack'] }).allowed).toBe(true);
  });

  it('root blocks reposition', () => {
    const c = createEmptyEffectCombatant('1', 'A', 100);
    applyEffectToCombatant(
      c,
      validateSkillEffectPayload({ type: 'root', duration: 1, targetScope: 'self' })!,
      'src',
      rngAlways
    );
    expect(canReposition(c).allowed).toBe(false);
  });

  it('delay applies skip next action', () => {
    const c = createEmptyEffectCombatant('1', 'A', 100);
    applyEffectToCombatant(
      c,
      validateSkillEffectPayload({
        type: 'delay',
        targetScope: 'self',
        metadata: { loseNextAction: true },
      })!,
      'src',
      rngAlways
    );
    const start = processTurnStartEffects(c, rngAlways);
    expect(start.canAct).toBe(false);
    expect(c.skipNextAction).toBe(0);
  });

  it('reveal clears hidden', () => {
    const c = createEmptyEffectCombatant('1', 'A', 100, { isHidden: true });
    applyEffectToCombatant(
      c,
      validateSkillEffectPayload({ type: 'reveal', targetScope: 'self' })!,
      'src',
      rngAlways
    );
    expect(c.isHidden).toBe(false);
  });

  it('mark_target increases incoming damage', () => {
    const def = createEmptyEffectCombatant('d', 'Def', 100);
    applyEffectToCombatant(
      def,
      validateSkillEffectPayload({ type: 'mark_target', value: 25, duration: 2, targetScope: 'self' })!,
      'atk',
      rngAlways
    );
    const { effectiveDamage } = modifyIncomingDamage(100, def);
    expect(effectiveDamage).toBe(125);
  });

  it('remove_buff removes only buffs', () => {
    const c = createEmptyEffectCombatant('1', 'A', 100);
    c.buffs = [
      { id: 'b1', type: 'crit', strength: 1, duration: 2, remainingTurns: 2, source: 'x' },
      { id: 'b2', type: 'dodge', strength: 1, duration: 1, remainingTurns: 1, source: 'x' },
    ];
    applyEffectToCombatant(
      c,
      validateSkillEffectPayload({
        type: 'remove_buff',
        targetScope: 'self',
        metadata: { removeOne: true },
      })!,
      'src',
      rngAlways
    );
    expect(c.buffs).toHaveLength(1);
  });

  it('transfer_debuff moves debuffs', () => {
    const from = createEmptyEffectCombatant('1', 'A', 100);
    const to = createEmptyEffectCombatant('2', 'B', 100);
    from.debuffs = [
      { id: 'd1', type: 'burn', strength: 2, duration: 2, remainingTurns: 2, source: 'x' },
    ];
    const { moved } = transferDebuffsBetweenCombatants(from, to, 1, rngAlways);
    expect(moved).toHaveLength(1);
    expect(from.debuffs).toHaveLength(0);
    expect(to.debuffs).toHaveLength(1);
  });

  it('copy_last_move finds last actor action', () => {
    const c = createEmptyEffectCombatant('1', 'A', 100);
    recordBattleAction(c, '2', 'm1', 'Move1', 1);
    recordBattleAction(c, '1', 'm2', 'Move2', 2);
    const r = resolveCopyLastMove(c, { rng: rngAlways });
    expect(r.moveId).toBe('m2');
  });

  it('add_element_tag interacts with type chart on next outgoing damage', () => {
    const atk = createEmptyEffectCombatant('1', 'A', 100);
    applyEffectToCombatant(
      atk,
      validateSkillEffectPayload({
        type: 'add_element_tag',
        elementTag: 'water',
        duration: 1,
        targetScope: 'self',
      })!,
      'self',
      rngAlways
    );
    const { damage, logs } = modifyOutgoingDamage(100, atk, {
      defenderElement: 'fire',
      moveElement: null,
    });
    expect(damage).toBe(150);
    expect(logs.some((l) => l.includes('Tagged'))).toBe(true);
  });

  it('reduce_cooldown lowers cooldown map', () => {
    const c = createEmptyEffectCombatant('1', 'A', 100);
    c.cooldowns = { a: 3, b: 0 };
    applyEffectToCombatant(
      c,
      validateSkillEffectPayload({
        type: 'reduce_cooldown',
        value: 1,
        targetScope: 'self',
        metadata: { scope: 'all_equipped' },
      })!,
      'src',
      rngAlways
    );
    expect(c.cooldowns.a).toBe(2);
  });

  it('tickEffectDurations removes expired silence', () => {
    const c = createEmptyEffectCombatant('1', 'A', 100);
    applyEffectToCombatant(
      c,
      validateSkillEffectPayload({ type: 'silence', duration: 1, targetScope: 'self' })!,
      'src',
      rngAlways
    );
    expect(c.activeEffects).toHaveLength(1);
    tickEffectDurations(c);
    expect(c.activeEffects.filter((e) => e.payload.type === 'silence')).toHaveLength(0);
  });
});

describe('resolverBridge + battleSkillResolver integration', () => {
  it('merge applies heal to correct delta', () => {
    const actor = { uid: 'a', name: 'A', level: 5, hp: 50, maxHp: 100 };
    const target = { uid: 'b', name: 'B', level: 5, hp: 40, maxHp: 100 };
    const skill = {
      id: 'x',
      name: 'HealBeam',
      category: 'manifest',
      type: 'support',
      level: 1,
      cost: 0,
      cooldown: 0,
      currentCooldown: 0,
      unlocked: true,
      masteryLevel: 1,
      skillEffects: [{ type: 'heal' as const, value: 30, chance: 100, targetScope: 'enemy' as const }],
    } as unknown as Move;
    const result = {
      damage: 0,
      shieldDamage: 0,
      healthDamage: 0,
      healing: 0,
      shieldBoost: 0,
      ppStolen: 0,
      ppCost: 0,
      actorDelta: {},
      targetDelta: {},
      logMessages: [],
      wasMaxDamage: false,
      wasMaxHealing: false,
      wasMaxShieldBoost: false,
    };
    mergeSkillEffectsIntoResolvedSkillAction(actor, target, skill, result);
    expect(result.targetDelta.hp).toBe(30);
    expect(result.healing).toBe(30);
  });

  it('resolveSkillAction skips legacy heal when engine heal present', async () => {
    const actor = { uid: 'a', name: 'A', level: 5, hp: 50, maxHp: 100, equippedArtifacts: null };
    const target = { uid: 'a', name: 'A', level: 5, hp: 50, maxHp: 100 };
    const skill = {
      id: 'x',
      name: 'Dual',
      description: '',
      category: 'manifest',
      type: 'support',
      level: 1,
      cost: 0,
      cooldown: 0,
      currentCooldown: 0,
      unlocked: true,
      masteryLevel: 1,
      healing: 999,
      skillEffects: [{ type: 'heal' as const, value: 10, chance: 100, targetScope: 'self' as const }],
    } as unknown as Move;
    const ctx = { mode: 'live_event' as const, playerLevel: 5 };
    const res = await resolveSkillAction(actor, target, skill, ctx);
    expect(res.healing).toBe(10);
    expect(res.actorDelta.hp).toBe(10);
  });
});

describe('legacyMoveToSkillEffects', () => {
  it('returns empty when skillEffects already set', () => {
    const m = {
      skillEffects: [{ type: 'heal' as const, value: 1 }],
      healing: 5,
    } as unknown as Move;
    expect(legacyMoveToSkillEffects(m)).toEqual([]);
  });
});

describe('level2RecordToSkillEffectPayloads', () => {
  it('maps utility_confuse to confuse', () => {
    const payloads = level2RecordToSkillEffectPayloads({
      id: '1',
      playerId: 'p',
      manifestId: 'reading',
      unlockSource: 'admin',
      liveEventOnly: true,
      skillName: 'S',
      manifestType: 'utility',
      target: 'single_ally_or_enemy',
      impact: 'utility_confuse',
      impactArea: 'player_skills',
      resultMagnitude: 2,
      result: 'duration_2',
      description: '',
      ppCost: 1,
      cooldownTurns: 1,
      perkModifierNotes: [],
      createdAt: null,
      updatedAt: null,
    });
    expect(payloads[0]?.type).toBe('confuse');
  });
});
