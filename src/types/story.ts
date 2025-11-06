// Story Mode Types for Nine Knowings MST

export interface StoryEpisode {
  id: string;
  title: string;
  chapter: number;
  summary: string;
  lore: LoreEntry[];
  objectives: StoryObjective[];
  encounters: StoryEncounter[];
  boss: BossData;
  recommendedPower: number;
  rewards: EpisodeRewards;
  gates: EpisodeGates;
  isUnlocked: boolean;
  isCompleted: boolean;
  completionDate?: Date;
}

export interface LoreEntry {
  speaker: string;
  text: string;
  avatar?: string;
}

export interface StoryObjective {
  id: string;
  text: string;
  required: boolean;
  isCompleted: boolean;
}

export interface StoryEncounter {
  id: string;
  type: 'mechanic' | 'debuff' | 'combat' | 'puzzle';
  tags: string[];
  description: string;
}

export interface BossData {
  id: string;
  name: string;
  kit: string[];
  phases: number;
  health: number;
  moves: BossMove[];
  mechanics: BossMechanic[];
}

export interface BossMove {
  id: string;
  name: string;
  type: 'attack' | 'defense' | 'utility';
  damage?: number;
  effects: BossEffect[];
  cooldown: number;
  phase: number;
}

export interface BossEffect {
  type: 'debuff' | 'buff' | 'summon' | 'mechanic';
  target: 'player' | 'boss' | 'all';
  value: number;
  duration?: number;
}

export interface BossMechanic {
  id: string;
  name: string;
  description: string;
  trigger: 'phase' | 'health' | 'turn';
  triggerValue: number;
  effects: BossEffect[];
}

export interface EpisodeRewards {
  fixed: string[];
  choices: string[];
  pp: number;
  xp: number;
}

export interface EpisodeGates {
  requires: string[];
  minLevel: number;
  minPower: number;
}

export interface StoryProgress {
  currentEpisode: string;
  completedEpisodes: string[];
  totalProgress: number;
  seasonRewards: string[];
}

// Episode Data - All 9 Episodes
export const STORY_EPISODES: StoryEpisode[] = [
  {
    id: 'ep_01_xiotein_letter',
    title: 'The Xiotein Letter',
    chapter: 1,
    summary: 'The Call to Adventure - Receive your Manifest invitation and awaken your powers.',
    lore: [
      { speaker: 'Sage', text: 'Welcome, young one. Your journey begins with a single step into the unknown.' },
      { speaker: 'System', text: 'Manifest invitation detected. Portal activation in progress...' }
    ],
    objectives: [
      { id: 'create_profile', text: 'Create your player profile', required: true, isCompleted: false },
      { id: 'first_manifest', text: 'Awaken your first Manifest move', required: true, isCompleted: false }
    ],
    encounters: [
      { id: 'portal_sequence', type: 'mechanic', tags: ['tutorial', 'awakening'], description: 'Navigate the portal to Xiotein' },
      { id: 'manifest_test', type: 'combat', tags: ['training', 'first_move'], description: 'Test your awakened abilities' }
    ],
    boss: {
      id: 'training_dummy',
      name: 'Training Dummy',
      kit: ['basic_attack', 'defense_test'],
      phases: 1,
      health: 50,
      moves: [
        {
          id: 'basic_attack',
          name: 'Basic Strike',
          type: 'attack',
          damage: 10,
          effects: [],
          cooldown: 2,
          phase: 1
        }
      ],
      mechanics: []
    },
    recommendedPower: 50,
    rewards: {
      fixed: ['player_card', 'starter_artifact', 'system_move_shield_restoration'],
      choices: [],
      pp: 25,
      xp: 50
    },
    gates: {
      requires: [],
      minLevel: 1,
      minPower: 0
    },
    isUnlocked: true,
    isCompleted: false
  },
  {
    id: 'ep_02_welcome_xiotein',
    title: 'Welcome to Xiotein',
    chapter: 2,
    summary: 'Crossing the Threshold - Arrive at the school and meet your rivals.',
    lore: [
      { speaker: 'Sage', text: 'You stand at the threshold of greatness. Your rivals await.' },
      { speaker: 'Allen', text: 'Another newbie? Let\'s see what you\'ve got.' }
    ],
    objectives: [
      { id: 'orientation_puzzle', text: 'Complete the orientation puzzle', required: true, isCompleted: false },
      { id: 'sparring_drills', text: 'Participate in sparring drills', required: true, isCompleted: false },
      { id: 'meet_rivals', text: 'Meet your rivals (Allen, Khalil, Greg, Alejandra)', required: false, isCompleted: false }
    ],
    encounters: [
      { id: 'orientation', type: 'puzzle', tags: ['school', 'introduction'], description: 'Learn the basics of Xiotein' },
      { id: 'sparring', type: 'combat', tags: ['training', 'rivals'], description: 'First combat with rivals' }
    ],
    boss: {
      id: 'arcadium_projection',
      name: 'Arcadium Projection',
      kit: ['system_test', 'pressure_attack'],
      phases: 1,
      health: 100,
      moves: [
        {
          id: 'system_test',
          name: 'System Pressure',
          type: 'utility',
          effects: [{ type: 'debuff', target: 'player', value: 5, duration: 3 }],
          cooldown: 3,
          phase: 1
        }
      ],
      mechanics: []
    },
    recommendedPower: 75,
    rewards: {
      fixed: ['action_card_slot', 'starter_card_countermeasure'],
      choices: [],
      pp: 50,
      xp: 75
    },
    gates: {
      requires: ['ep_01_xiotein_letter'],
      minLevel: 2,
      minPower: 50
    },
    isUnlocked: false,
    isCompleted: false
  },
  {
    id: 'ep_03_overnight',
    title: 'The Overnight',
    chapter: 3,
    summary: 'Trial by Illusion - Face yourself to find yourself in the enchanted forest.',
    lore: [
      { speaker: 'Sage', text: 'The forest will show you what you fear most. Face it, or be consumed.' },
      { speaker: 'Forest Voice', text: 'Face yourself to find yourself...' }
    ],
    objectives: [
      { id: 'survive_illusions', text: 'Survive the illusion trials', required: true, isCompleted: false },
      { id: 'reveal_veils', text: 'Reveal your personal Veils', required: true, isCompleted: false },
      { id: 'maintain_resolve', text: 'Maintain resolve throughout', required: false, isCompleted: false }
    ],
    encounters: [
      { id: 'illusion_trials', type: 'debuff', tags: ['fear', 'self-reflection'], description: 'Face your deepest fears' },
      { id: 'veil_revelation', type: 'mechanic', tags: ['personal', 'growth'], description: 'Discover your emotional barriers' }
    ],
    boss: {
      id: 'forest_eye',
      name: 'The Forest Eye',
      kit: ['hallucination_pulse', 'dread_aura', 'blind_attack'],
      phases: 2,
      health: 150,
      moves: [
        {
          id: 'hallucination_pulse',
          name: 'Hallucination Pulse',
          type: 'utility',
          effects: [
            { type: 'debuff', target: 'player', value: 3, duration: 2 },
            { type: 'debuff', target: 'player', value: 2, duration: 3 }
          ],
          cooldown: 4,
          phase: 1
        }
      ],
      mechanics: [
        {
          id: 'dread_aura',
          name: 'Dread Aura',
          description: 'Creates an aura of fear that reduces player effectiveness',
          trigger: 'phase',
          triggerValue: 2,
          effects: [{ type: 'debuff', target: 'player', value: 4, duration: 5 }]
        }
      ]
    },
    recommendedPower: 100,
    rewards: {
      fixed: ['rune_of_clarity', 'elemental_move_l1'],
      choices: ['light_radiance', 'empathy_coregulate'],
      pp: 75,
      xp: 100
    },
    gates: {
      requires: ['ep_02_welcome_xiotein'],
      minLevel: 3,
      minPower: 75
    },
    isUnlocked: false,
    isCompleted: false
  },
  {
    id: 'ep_04_first_bloodroot',
    title: 'First Bloodroot',
    chapter: 4,
    summary: 'The First Victory - Survive waves of illusions and corrupted beasts.',
    lore: [
      { speaker: 'Sage', text: 'Your first true test. The Bloodroot Guardian awaits.' },
      { speaker: 'Bloodroot Voice', text: 'You will face the corruption within...' }
    ],
    objectives: [
      { id: 'survive_waves', text: 'Survive waves of corrupted beasts', required: true, isCompleted: false },
      { id: 'avoid_corrode', text: 'Avoid stackable Corrode effects', required: true, isCompleted: false },
      { id: 'kill_adds', text: 'Defeat all corrupted minions', required: false, isCompleted: false }
    ],
    encounters: [
      { id: 'corrupted_beasts', type: 'combat', tags: ['waves', 'corruption'], description: 'Fight corrupted forest creatures' },
      { id: 'internal_visions', type: 'debuff', tags: ['corruption', 'resistance'], description: 'Resist internal corruption' }
    ],
    boss: {
      id: 'bloodroot_guardian',
      name: 'Bloodroot Guardian',
      kit: ['thorn_growth', 'acrid_sap', 'vine_whip'],
      phases: 2,
      health: 200,
      moves: [
        {
          id: 'thorn_growth',
          name: 'Thorn Growth',
          type: 'utility',
          effects: [{ type: 'debuff', target: 'player', value: 3, duration: 4 }],
          cooldown: 3,
          phase: 1
        },
        {
          id: 'acrid_sap',
          name: 'Acrid Sap',
          type: 'attack',
          damage: 15,
          effects: [{ type: 'debuff', target: 'player', value: 2, duration: 5 }],
          cooldown: 4,
          phase: 1
        }
      ],
      mechanics: []
    },
    recommendedPower: 125,
    rewards: {
      fixed: ['manifest_move_l2', 'vault_materials_shield_core'],
      choices: ['earth_bulwark', 'crafting_hardening'],
      pp: 100,
      xp: 125
    },
    gates: {
      requires: ['ep_03_overnight'],
      minLevel: 4,
      minPower: 100
    },
    isUnlocked: false,
    isCompleted: false
  },
  {
    id: 'ep_05_thread_rift',
    title: 'Thread the Rift',
    chapter: 5,
    summary: 'The Trial of Trust - An ever-shifting course that punishes mistimed moves.',
    lore: [
      { speaker: 'Sage', text: 'Trust doesn\'t come easy. Move as one or fall alone.' },
      { speaker: 'Tatiana', text: 'Discipline is the foundation of power.' }
    ],
    objectives: [
      { id: 'timing_checks', text: 'Hit 3 timing prompts with Perfect or higher', required: true, isCompleted: false },
      { id: 'no_falls', text: 'No ally gets KO\'d', required: false, isCompleted: false },
      { id: 'coordination', text: 'Coordinate moves with allies', required: true, isCompleted: false }
    ],
    encounters: [
      { id: 'shift_platforms', type: 'mechanic', tags: ['timing', 'movement'], description: 'Navigate shifting platforms' },
      { id: 'mirror_illusions', type: 'debuff', tags: ['blind', 'dread'], description: 'Face mirror illusions' }
    ],
    boss: {
      id: 'tatiana_avatar',
      name: 'Tatiana Avatar',
      kit: ['punish_mistime', 'parry_window', 'silence_on_whiff'],
      phases: 2,
      health: 250,
      moves: [
        {
          id: 'punish_mistime',
          name: 'Discipline Check',
          type: 'attack',
          damage: 20,
          effects: [{ type: 'debuff', target: 'player', value: 4, duration: 3 }],
          cooldown: 3,
          phase: 1
        }
      ],
      mechanics: [
        {
          id: 'parry_window',
          name: 'Parry Window',
          description: 'Opens brief windows for counter-attacks',
          trigger: 'turn',
          triggerValue: 3,
          effects: [{ type: 'buff', target: 'boss', value: -2, duration: 1 }]
        }
      ]
    },
    recommendedPower: 150,
    rewards: {
      fixed: ['bond_token', 'elemental_move_l2'],
      choices: ['card_timing_beacon', 'rune_focus'],
      pp: 125,
      xp: 150
    },
    gates: {
      requires: ['ep_04_first_bloodroot'],
      minLevel: 5,
      minPower: 125
    },
    isUnlocked: false,
    isCompleted: false
  },
  {
    id: 'ep_06_trial_force',
    title: 'Trial by Force',
    chapter: 6,
    summary: 'Holding the Circle - Defend monoliths against summoned constructs.',
    lore: [
      { speaker: 'Sage', text: 'Endurance is the test of true strength. Hold the circle.' },
      { speaker: 'Sentinel', text: 'The weak will be culled...' }
    ],
    objectives: [
      { id: 'defend_monoliths', text: 'Defend all monoliths from destruction', required: true, isCompleted: false },
      { id: 'survive_waves', text: 'Survive the construct horde', required: true, isCompleted: false },
      { id: 'defeat_sentinel', text: 'Defeat the Final Sentinel', required: true, isCompleted: false }
    ],
    encounters: [
      { id: 'construct_horde', type: 'combat', tags: ['waves', 'endurance'], description: 'Fight waves of constructs' },
      { id: 'monolith_defense', type: 'mechanic', tags: ['defense', 'positioning'], description: 'Protect the ancient monoliths' }
    ],
    boss: {
      id: 'sentinel_ring',
      name: 'Sentinel of the Ring',
      kit: ['wave_summons', 'shield_shatter', 'aoe_attack'],
      phases: 3,
      health: 300,
      moves: [
        {
          id: 'wave_summons',
          name: 'Wave Summons',
          type: 'utility',
          effects: [{ type: 'summon', target: 'boss', value: 2, duration: 3 }],
          cooldown: 5,
          phase: 1
        },
        {
          id: 'shield_shatter',
          name: 'Shield Shatter',
          type: 'attack',
          damage: 25,
          effects: [{ type: 'debuff', target: 'player', value: 5, duration: 2 }],
          cooldown: 4,
          phase: 2
        }
      ],
      mechanics: []
    },
    recommendedPower: 175,
    rewards: {
      fixed: ['system_perk_scout', 'action_card_draw_plus_one'],
      choices: ['athletics_pace_sync', 'writing_publish_rally'],
      pp: 150,
      xp: 175
    },
    gates: {
      requires: ['ep_05_thread_rift'],
      minLevel: 6,
      minPower: 150
    },
    isUnlocked: false,
    isCompleted: false
  },
  {
    id: 'ep_07_morning_after',
    title: 'The Morning After',
    chapter: 7,
    summary: 'Facing the Twelve - Survivors meet the Top 12, learn of higher stakes.',
    lore: [
      { speaker: 'Sage', text: 'The Top 12 await. They will test your worth.' },
      { speaker: 'Isabel', text: 'Show me what you\'re made of, newcomer.' }
    ],
    objectives: [
      { id: 'debate_upperclassmen', text: 'Participate in debate with upperclassmen', required: true, isCompleted: false },
      { id: 'spar_precision', text: 'Demonstrate precision in sparring', required: true, isCompleted: false },
      { id: 'prove_worth', text: 'Prove your worth to the Top 12', required: false, isCompleted: false }
    ],
    encounters: [
      { id: 'debate_challenge', type: 'puzzle', tags: ['intellectual', 'pressure'], description: 'Engage in intellectual debate' },
      { id: 'precision_spar', type: 'combat', tags: ['precision', 'technique'], description: 'Demonstrate combat precision' }
    ],
    boss: {
      id: 'isabel_reyes',
      name: 'Isabel Reyes (#2)',
      kit: ['line_pressure', 'perfect_guard', 'precision_strike'],
      phases: 2,
      health: 350,
      moves: [
        {
          id: 'line_pressure',
          name: 'Line Pressure',
          type: 'utility',
          effects: [{ type: 'debuff', target: 'player', value: 3, duration: 4 }],
          cooldown: 3,
          phase: 1
        },
        {
          id: 'perfect_guard',
          name: 'Perfect Guard',
          type: 'defense',
          effects: [{ type: 'buff', target: 'boss', value: 5, duration: 2 }],
          cooldown: 4,
          phase: 1
        }
      ],
      mechanics: []
    },
    recommendedPower: 200,
    rewards: {
      fixed: ['truth_metal_card_slot', 'rare_card_choice'],
      choices: ['light_beacon', 'shadow_veilstep', 'metal_refraction'],
      pp: 175,
      xp: 200
    },
    gates: {
      requires: ['ep_06_trial_force'],
      minLevel: 7,
      minPower: 175
    },
    isUnlocked: false,
    isCompleted: false
  },
  {
    id: 'ep_08_new_normal',
    title: 'The New Normal',
    chapter: 8,
    summary: 'Classes Begin - Students attend advanced classes, rivalries escalate.',
    lore: [
      { speaker: 'Sage', text: 'Advanced classes begin. Your rivalries will be tested.' },
      { speaker: 'Greg', text: 'Time to see if you can handle the real pressure.' }
    ],
    objectives: [
      { id: 'attend_classes', text: 'Attend advanced classes', required: true, isCompleted: false },
      { id: 'escalate_combat', text: 'Handle escalating combat situations', required: true, isCompleted: false },
      { id: 'prove_growth', text: 'Demonstrate significant growth', required: false, isCompleted: false }
    ],
    encounters: [
      { id: 'advanced_classes', type: 'mechanic', tags: ['learning', 'growth'], description: 'Participate in advanced training' },
      { id: 'rivalry_combat', type: 'combat', tags: ['rivalry', 'escalation'], description: 'Face escalating rival challenges' }
    ],
    boss: {
      id: 'greg_weighted',
      name: 'Greg Weighted',
      kit: ['slow_power', 'explosive_speed', 'momentum_build'],
      phases: 2,
      health: 400,
      moves: [
        {
          id: 'slow_power',
          name: 'Slow Power',
          type: 'attack',
          damage: 30,
          effects: [],
          cooldown: 3,
          phase: 1
        },
        {
          id: 'explosive_speed',
          name: 'Explosive Speed',
          type: 'attack',
          damage: 25,
          effects: [{ type: 'buff', target: 'boss', value: 3, duration: 2 }],
          cooldown: 2,
          phase: 2
        }
      ],
      mechanics: [
        {
          id: 'momentum_build',
          name: 'Momentum Build',
          description: 'Gains strength as the battle progresses',
          trigger: 'turn',
          triggerValue: 5,
          effects: [{ type: 'buff', target: 'boss', value: 2, duration: 3 }]
        }
      ]
    },
    recommendedPower: 225,
    rewards: {
      fixed: ['manifest_move_l3', 'firewall_module_v1'],
      choices: ['reading_team_margin', 'earth_pebbleguard'],
      pp: 200,
      xp: 225
    },
    gates: {
      requires: ['ep_07_morning_after'],
      minLevel: 8,
      minPower: 200
    },
    isUnlocked: false,
    isCompleted: false
  },
  {
    id: 'ep_09_pressure_points',
    title: 'Pressure Points',
    chapter: 9,
    summary: 'Top 12 Trial - Deklan tested before the Top 12; rivals challenge him.',
    lore: [
      { speaker: 'Sage', text: 'The final trial. Prove your worth before the Top 12.' },
      { speaker: 'Top 12 Council', text: 'We will judge your readiness for ascension.' }
    ],
    objectives: [
      { id: 'prove_strategy', text: 'Demonstrate strategy over brute force', required: true, isCompleted: false },
      { id: 'defeat_challenger', text: 'Defeat your chosen challenger', required: true, isCompleted: false },
      { id: 'ascension_trial', text: 'Complete the ascension trial', required: true, isCompleted: false }
    ],
    encounters: [
      { id: 'strategy_test', type: 'puzzle', tags: ['strategy', 'planning'], description: 'Demonstrate strategic thinking' },
      { id: 'final_duel', type: 'combat', tags: ['final', 'ascension'], description: 'Face your final challenger' }
    ],
    boss: {
      id: 'final_challenger',
      name: 'Final Challenger',
      kit: ['momentum_lock', 'finesse_fan', 'ascension_test'],
      phases: 3,
      health: 500,
      moves: [
        {
          id: 'momentum_lock',
          name: 'Momentum Lock',
          type: 'utility',
          effects: [{ type: 'debuff', target: 'player', value: 4, duration: 3 }],
          cooldown: 4,
          phase: 1
        },
        {
          id: 'finesse_fan',
          name: 'Finesse Fan',
          type: 'attack',
          damage: 20,
          effects: [{ type: 'debuff', target: 'player', value: 3, duration: 2 }],
          cooldown: 3,
          phase: 2
        }
      ],
      mechanics: [
        {
          id: 'ascension_test',
          name: 'Ascension Test',
          description: 'Tests the player\'s readiness for ascension',
          trigger: 'phase',
          triggerValue: 3,
          effects: [{ type: 'buff', target: 'boss', value: 5, duration: 5 }]
        }
      ]
    },
    recommendedPower: 250,
    rewards: {
      fixed: ['ascension_level_3', 'rare_artifact_choice'],
      choices: ['path_power', 'path_tempo', 'path_control'],
      pp: 250,
      xp: 300
    },
    gates: {
      requires: ['ep_08_new_normal'],
      minLevel: 9,
      minPower: 225
    },
    isUnlocked: false,
    isCompleted: false
  }
];

// Story Mode State Management
export interface StoryState {
  currentEpisode: string | null;
  completedEpisodes: string[];
  episodeProgress: Record<string, EpisodeProgress>;
  seasonRewards: string[];
  totalProgress: number;
}

export interface EpisodeProgress {
  isStarted: boolean;
  isCompleted: boolean;
  objectivesCompleted: string[];
  encountersCompleted: string[];
  bossDefeated: boolean;
  rewardsClaimed: boolean;
  completionDate?: Date;
}

// Story Mode Actions
export interface StoryAction {
  type: 'START_EPISODE' | 'COMPLETE_OBJECTIVE' | 'COMPLETE_ENCOUNTER' | 'DEFEAT_BOSS' | 'CLAIM_REWARDS' | 'UNLOCK_EPISODE';
  payload: any;
}

// Reward Types
export interface StoryReward {
  id: string;
  type: 'move' | 'item' | 'artifact' | 'card' | 'pp' | 'xp' | 'vault_upgrade';
  name: string;
  description: string;
  value: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

// Path Choices for Episode 9
export const PATH_CHOICES = {
  path_power: {
    name: 'Path of Power',
    description: 'Increase Shield Max and Vault Fortify uptime',
    rewards: ['shield_max_boost', 'vault_fortify_uptime']
  },
  path_tempo: {
    name: 'Path of Tempo', 
    description: 'Energy cap +1, cooldown -1 on 1 skill',
    rewards: ['energy_cap_plus_one', 'cooldown_reduction']
  },
  path_control: {
    name: 'Path of Control',
    description: 'Increase status duration and resistance',
    rewards: ['status_duration_boost', 'status_resistance_boost']
  }
};




















