/**
 * Perk / skill-tree modifier pipeline for Level 2 Manifest skills.
 * Extend PERK_KEYWORD_RULES with new entries instead of scattering conditionals.
 */

export interface Level2ModifierInput {
  basePp: number;
  baseCooldown: number;
  unlockedSkillNodeIds: string[];
}

export interface Level2ModifierOutput {
  ppCost: number;
  cooldownTurns: number;
  perkModifierNotes: string[];
}

type ModifierRule = {
  id: string;
  /** True if any unlocked node id matches */
  test: (nodeIdsLower: string[]) => boolean;
  apply: (draft: { pp: number; cd: number; notes: string[] }) => void;
};

const rules: ModifierRule[] = [
  {
    id: 'efficiency',
    test: (ids) => ids.some((i) => i.includes('efficien') || i.includes('economy') || i.includes('conserve')),
    apply: (d) => {
      if (d.pp > 1) {
        d.pp -= 1;
        d.notes.push('Efficiency-style perk: -1 PP');
      }
    },
  },
  {
    id: 'precision',
    test: (ids) => ids.some((i) => i.includes('precis') || i.includes('focus') || i.includes('read-the-flow')),
    apply: (d) => {
      d.notes.push('Precision / focus perk: stronger single-target scaling (narrative)');
    },
  },
  {
    id: 'reflection_meta',
    test: (ids) => ids.some((i) => i.includes('reflect') || i.includes('meta') || i.includes('aware')),
    apply: (d) => {
      d.notes.push('Reflection perk: improved bonus while in Flow State (narrative)');
    },
  },
  {
    id: 'guardian',
    test: (ids) => ids.some((i) => i.includes('guard') || i.includes('fortif') || i.includes('shield')),
    apply: (d) => {
      d.cd = Math.max(2, d.cd - 1);
      d.notes.push('Guardian perk: -1 cooldown on protective skills');
    },
  },
  {
    id: 'catalyst_element',
    test: (ids) => ids.some((i) => i.includes('catalyst') || i.includes('element')),
    apply: (d) => {
      d.notes.push('Catalyst perk: favors elemental tagging / setup (narrative)');
    },
  },
  {
    id: 'momentum_streak',
    test: (ids) => ids.some((i) => i.includes('momentum') || i.includes('streak') || i.includes('tempo')),
    apply: (d) => {
      d.notes.push('Momentum perk: streak synergies (narrative)');
    },
  },
  {
    id: 'echo_repeat',
    test: (ids) => ids.some((i) => i.includes('echo') || i.includes('repeat') || i.includes('chain')),
    apply: (d) => {
      d.notes.push('Echo perk: repeat-use synergy (narrative)');
    },
  },
];

export function applyLevel2PerkModifiers(input: Level2ModifierInput): Level2ModifierOutput {
  const nodeLower = input.unlockedSkillNodeIds.map((id) => id.toLowerCase());
  let pp = input.basePp;
  let cd = input.baseCooldown;
  const notes: string[] = [];

  const draft = { pp, cd, notes };
  for (const r of rules) {
    if (r.test(nodeLower)) {
      r.apply(draft);
    }
  }

  return {
    ppCost: Math.min(5, Math.max(1, draft.pp)),
    cooldownTurns: Math.min(8, Math.max(2, draft.cd)),
    perkModifierNotes: draft.notes,
  };
}
