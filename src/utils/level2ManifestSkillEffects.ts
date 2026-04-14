import { inferLegacyLevel2ResultMagnitude } from '../data/level2ManifestSkillConfig';
import type { Move } from '../types/battle';
import type {
  Level2ManifestImpact,
  Level2ManifestResult,
  Level2ManifestSkillRecord,
} from '../types/level2Manifest';
import type { SkillEffectPayload } from '../types/skillEffects';

/**
 * Legacy Move fields used by BattleEngine / applyInSessionMove for Live Events.
 * Level 2 rows without these produced no damage/healing/shield (only metadata).
 */
export function level2RecordToLiveEventLegacyFields(skill: Level2ManifestSkillRecord): Partial<Move> {
  const area = skill.impactArea ?? 'pp';
  const mag =
    skill.resultMagnitude ??
    inferLegacyLevel2ResultMagnitude((skill.result ?? 'small') as Level2ManifestResult, area);
  const dur = Math.max(1, Math.floor(mag));

  switch (skill.impact) {
    case 'heal':
      return { healing: Math.max(5, mag), targetType: 'self', type: 'defense' };
    case 'shield':
      return { shieldBoost: Math.max(5, mag), targetType: 'self', type: 'defense' };
    case 'offensive_add':
      return { damage: Math.max(10, Math.floor(mag * 2.5)), type: 'attack', targetType: 'single' };
    case 'offensive_remove':
      return { damage: Math.max(8, Math.floor(mag * 2)), type: 'attack', targetType: 'single' };
    case 'offensive_stun_freeze':
      return {
        damage: Math.max(6, Math.floor(mag * 1.5)),
        type: 'attack',
        targetType: 'single',
        debuffType: 'stun',
        duration: Math.min(3, Math.max(1, dur)),
      };
    case 'enhance_increase':
      return { shieldBoost: Math.max(5, Math.floor(mag * 0.8)), targetType: 'self', type: 'defense' };
    case 'enhance_decrease':
      return { damage: Math.max(8, Math.floor(mag * 2)), type: 'attack', targetType: 'single' };
    case 'damage':
      return { damage: Math.max(10, Math.floor(mag * 2)), type: 'attack', targetType: 'single' };
    case 'predict_move':
    case 'copy_last_move':
    case 'add_element_tag':
    case 'buff_attack':
    case 'buff_defense':
    case 'buff_speed':
    case 'reduce_cooldown':
      return { shieldBoost: Math.max(3, Math.floor(mag * 0.5)), targetType: 'self', type: 'defense' };
    case 'utility_confuse':
    case 'silence':
    case 'root':
    case 'delay':
    case 'reveal':
    case 'mark_target':
    case 'remove_buff':
    case 'transfer_debuff':
      return { damage: Math.max(5, Math.floor(mag)), type: 'attack', targetType: 'single' };
    default:
      return { damage: Math.max(5, Math.floor(mag)), type: 'attack', targetType: 'single' };
  }
}

/**
 * Derives standardized skill-effect payloads for resolver / future engine use.
 * Heal/shield magnitudes live on `level2RecordToLiveEventLegacyFields` for Live Events to avoid double application.
 */
export function level2RecordToSkillEffectPayloads(skill: Level2ManifestSkillRecord): SkillEffectPayload[] {
  const area = skill.impactArea ?? 'pp';
  const mag =
    skill.resultMagnitude ??
    inferLegacyLevel2ResultMagnitude((skill.result ?? 'small') as Level2ManifestResult, area);
  const dur = Math.max(1, Math.floor(mag));

  const base = (partial: SkillEffectPayload): SkillEffectPayload => ({
    chance: 100,
    ...partial,
  });

  const map: Partial<Record<Level2ManifestImpact, SkillEffectPayload[]>> = {
    // heal / shield: applied via level2RecordToLiveEventLegacyFields + BattleEngine legacy path (avoid double apply)
    silence: [base({ type: 'silence', duration: dur, targetScope: 'enemy' })],
    root: [base({ type: 'root', duration: dur, targetScope: 'enemy' })],
    delay: [base({ type: 'delay', targetScope: 'enemy', metadata: { loseNextAction: true } })],
    reveal: [base({ type: 'reveal', targetScope: 'enemy' })],
    mark_target: [base({ type: 'mark_target', value: Math.max(5, mag), duration: dur, targetScope: 'enemy' })],
    predict_move: [base({ type: 'predict_move', value: Math.min(90, Math.max(5, mag)), targetScope: 'self' })],
    remove_buff: [base({ type: 'remove_buff', targetScope: 'enemy', metadata: { removeOne: true } })],
    transfer_debuff: [
      base({ type: 'transfer_debuff', targetScope: 'enemy', secondaryValue: Math.max(1, Math.floor(mag)) }),
    ],
    copy_last_move: [base({ type: 'copy_last_move', targetScope: 'self' })],
    add_element_tag: [
      base({
        type: 'add_element_tag',
        elementTag: 'neutral',
        duration: 1,
        targetScope: 'self',
      }),
    ],
    buff_attack: [base({ type: 'buff_attack', value: Math.min(100, Math.max(5, mag)), duration: dur, targetScope: 'self' })],
    buff_defense: [base({ type: 'buff_defense', value: Math.min(90, Math.max(5, mag)), duration: dur, targetScope: 'self' })],
    buff_speed: [base({ type: 'buff_speed', value: Math.min(100, Math.max(5, mag)), duration: dur, targetScope: 'self' })],
    reduce_cooldown: [
      base({
        type: 'reduce_cooldown',
        value: Math.max(1, Math.floor(mag)),
        targetScope: 'self',
        metadata: { scope: 'all_equipped' },
      }),
    ],
    utility_confuse: [base({ type: 'confuse', duration: dur, targetScope: 'enemy' })],
  };

  return map[skill.impact] ?? [];
}
