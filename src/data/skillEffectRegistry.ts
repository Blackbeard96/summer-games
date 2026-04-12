import type { SkillEffectPayload, SkillEffectType } from '../types/skillEffects';

export type SkillEffectFormField =
  | 'value'
  | 'secondaryValue'
  | 'duration'
  | 'chance'
  | 'targetScope'
  | 'stackable'
  | 'maxStacks'
  | 'elementTag'
  | 'metadata_remove_buff'
  | 'metadata_reduce_cooldown'
  | 'metadata_delay';

export interface SkillEffectRegistryEntry {
  type: SkillEffectType;
  label: string;
  description: string;
  formFields: SkillEffectFormField[];
  defaults: Partial<SkillEffectPayload>;
}

export const SKILL_EFFECT_REGISTRY: Record<SkillEffectType, SkillEffectRegistryEntry> = {
  heal: {
    type: 'heal',
    label: 'Heal',
    description: 'Restore flat HP to target (capped at max HP).',
    formFields: ['value', 'chance', 'targetScope'],
    defaults: { value: 0, chance: 100, targetScope: 'single' },
  },
  confuse: {
    type: 'confuse',
    label: 'Confuse',
    description: 'Chance to misfire on turns (wrong target / skip / normal).',
    formFields: ['duration', 'chance', 'targetScope', 'stackable', 'maxStacks'],
    defaults: { duration: 2, chance: 100, targetScope: 'enemy', stackable: false, maxStacks: 1 },
  },
  silence: {
    type: 'silence',
    label: 'Silence',
    description: 'Prevent skill use; basic attacks still allowed when not gated elsewhere.',
    formFields: ['duration', 'chance', 'targetScope', 'stackable', 'maxStacks'],
    defaults: { duration: 1, chance: 100, targetScope: 'enemy', stackable: false, maxStacks: 1 },
  },
  root: {
    type: 'root',
    label: 'Root',
    description: 'Prevent movement/repositioning for duration.',
    formFields: ['duration', 'chance', 'targetScope', 'stackable', 'maxStacks'],
    defaults: { duration: 1, chance: 100, targetScope: 'enemy', stackable: false, maxStacks: 1 },
  },
  delay: {
    type: 'delay',
    label: 'Delay',
    description: 'Delay turn order (MVP: lose next action via metadata).',
    formFields: ['chance', 'targetScope', 'metadata_delay'],
    defaults: { chance: 100, targetScope: 'enemy', metadata: { loseNextAction: true } },
  },
  reveal: {
    type: 'reveal',
    label: 'Reveal',
    description: 'Reveal hidden / stealthed targets.',
    formFields: ['chance', 'targetScope'],
    defaults: { chance: 100, targetScope: 'enemy' },
  },
  mark_target: {
    type: 'mark_target',
    label: 'Mark target',
    description: 'Target takes bonus % damage from incoming attacks.',
    formFields: ['value', 'duration', 'chance', 'targetScope', 'stackable', 'maxStacks'],
    defaults: { value: 25, duration: 2, chance: 100, targetScope: 'enemy', stackable: false, maxStacks: 1 },
  },
  predict_move: {
    type: 'predict_move',
    label: 'Predict move',
    description: 'Reduce damage from the next incoming attack by value%.',
    formFields: ['value', 'chance', 'targetScope'],
    defaults: { value: 30, chance: 100, targetScope: 'self' },
  },
  remove_buff: {
    type: 'remove_buff',
    label: 'Remove buff',
    description: 'Remove positive effects (metadata.removeOne / removeAll).',
    formFields: ['chance', 'targetScope', 'metadata_remove_buff'],
    defaults: { chance: 100, targetScope: 'enemy', metadata: { removeOne: true } },
  },
  transfer_debuff: {
    type: 'transfer_debuff',
    label: 'Transfer debuff',
    description: 'Move debuffs from caster/allied scope to enemy (MVP: one debuff).',
    formFields: ['chance', 'targetScope', 'secondaryValue'],
    defaults: { chance: 100, targetScope: 'enemy', secondaryValue: 1 },
  },
  shield: {
    type: 'shield',
    label: 'Shield',
    description: 'Temporary shield HP; absorbs before health. duration null = no expiry ticks.',
    formFields: ['value', 'duration', 'chance', 'targetScope', 'stackable', 'maxStacks'],
    defaults: { value: 40, duration: 2, chance: 100, targetScope: 'self', stackable: true, maxStacks: 3 },
  },
  copy_last_move: {
    type: 'copy_last_move',
    label: 'Copy last move',
    description: 'Copy last valid battle move (respects metadata block tags).',
    formFields: ['chance', 'targetScope'],
    defaults: { chance: 100, targetScope: 'self', metadata: {} },
  },
  add_element_tag: {
    type: 'add_element_tag',
    label: 'Add element tag',
    description: 'Tag next outgoing attack with element (MVP: instance on caster).',
    formFields: ['elementTag', 'duration', 'chance', 'targetScope'],
    defaults: { elementTag: 'neutral', duration: 1, chance: 100, targetScope: 'self' },
  },
  buff_attack: {
    type: 'buff_attack',
    label: 'Buff attack',
    description: 'Increase outgoing damage by value%.',
    formFields: ['value', 'duration', 'chance', 'targetScope', 'stackable', 'maxStacks'],
    defaults: { value: 15, duration: 2, chance: 100, targetScope: 'self', stackable: false, maxStacks: 1 },
  },
  buff_defense: {
    type: 'buff_defense',
    label: 'Buff defense',
    description: 'Reduce incoming damage by value% (MVP: percent reduction).',
    formFields: ['value', 'duration', 'chance', 'targetScope', 'stackable', 'maxStacks'],
    defaults: { value: 15, duration: 2, chance: 100, targetScope: 'self', stackable: false, maxStacks: 1 },
  },
  buff_speed: {
    type: 'buff_speed',
    label: 'Buff speed',
    description: 'Increase initiative / turn frequency (MVP: duration-based tag).',
    formFields: ['value', 'duration', 'chance', 'targetScope', 'stackable', 'maxStacks'],
    defaults: { value: 10, duration: 2, chance: 100, targetScope: 'self', stackable: false, maxStacks: 1 },
  },
  reduce_cooldown: {
    type: 'reduce_cooldown',
    label: 'Reduce cooldown',
    description: 'Reduce cooldowns by value turns (metadata scope).',
    formFields: ['value', 'chance', 'targetScope', 'metadata_reduce_cooldown'],
    defaults: { value: 1, chance: 100, targetScope: 'self', metadata: { scope: 'all_equipped' } },
  },
};

export function getSkillEffectRegistryEntry(type: string): SkillEffectRegistryEntry | undefined {
  return SKILL_EFFECT_REGISTRY[type as SkillEffectType];
}
