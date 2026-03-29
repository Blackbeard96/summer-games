import type { SkillCard } from '../types/season1';

/** Seed catalog — admins can mirror in Firestore `skillCards` for runtime edits. */
export const SKILL_CARDS_CATALOG: SkillCard[] = [
  {
    id: 'card_kinetic_surge_s1',
    name: 'Kinetic Surge',
    description: 'Channel motion into a sharp vault strike.',
    rarity: 'rare',
    energyType: 'kinetic',
    skillType: 'attack',
    effectConfig: { effectId: 'vault_pressure', powerBand: 2 },
    participationCost: 2,
    energyCost: 3,
    cooldown: 2,
    active: true,
  },
  {
    id: 'card_mental_focus_s1',
    name: 'Mental Focus',
    description: 'Reduce skill cost pressure for one exchange.',
    rarity: 'uncommon',
    energyType: 'mental',
    skillType: 'utility',
    effectConfig: { effectId: 'skill_cost_reduction', durationTurns: 1, powerBand: 1 },
    participationCost: 1,
    energyCost: 4,
    cooldown: 3,
    active: true,
  },
  {
    id: 'card_emotional_aegis_s1',
    name: 'Emotional Aegis',
    description: 'Stabilize shields through empathic grounding.',
    rarity: 'epic',
    energyType: 'emotional',
    skillType: 'shield',
    effectConfig: { effectId: 'shield_restore', powerBand: 2 },
    participationCost: 3,
    energyCost: 5,
    cooldown: 2,
    active: true,
  },
  {
    id: 'card_spiritual_conduit_s1',
    name: "Spiritual Conduit (Kon's Lesson)",
    description: 'Brief Awakened Flow echo — next skill waives participation once.',
    rarity: 'legendary',
    energyType: 'spiritual',
    skillType: 'utility',
    effectConfig: { effectId: 'awakened_flow_pulse', durationTurns: 1 },
    participationCost: 4,
    energyCost: 8,
    cooldown: 4,
    active: true,
  },
];

export function getSkillCardById(id: string): SkillCard | undefined {
  return SKILL_CARDS_CATALOG.find((c) => c.id === id);
}
