import { inferLegacyLevel2ResultMagnitude } from '../data/level2ManifestSkillConfig';
import type {
  Level2ManifestImpact,
  Level2ManifestResult,
  Level2ManifestSkillRecord,
} from '../types/level2Manifest';
import type { SkillEffectPayload } from '../types/skillEffects';

/**
 * Derives standardized battle payloads from a Level 2 manifest row so Live Event
 * resolution can use the same effect engine as catalog moves when `skillEffects` is set on the Move.
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
    heal: [base({ type: 'heal', value: Math.max(5, mag), targetScope: 'self' })],
    shield: [base({ type: 'shield', value: Math.max(5, mag), duration: dur, targetScope: 'self', stackable: true })],
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
