export interface Manifest {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  levels: ManifestLevel[];
  catalyst: string;
  signatureMove: string;
}

export interface ManifestLevel {
  level: number;
  scale: 'Self' | 'One Other' | 'Team' | 'Environment';
  description: string;
  example: string;
  xpRequired: number;
  unlocked: boolean;
}

export interface PlayerManifest {
  manifestId: string;
  currentLevel: number;
  xp: number;
  catalyst: string;
  veil: string;
  signatureMove: string;
  unlockedLevels: number[];
  lastAscension: Date | any; // Firestore timestamp or Date
}

export interface Veil {
  id: string;
  name: string;
  description: string;
  type: 'emotional' | 'social' | 'strategic';
  difficulty: number;
  breakthrough: string;
  isBroken: boolean;
}

export interface AscensionTest {
  id: string;
  manifestId: string;
  level: number;
  description: string;
  requirements: {
    xp: number;
    innerClarity: number;
    teamSynergy?: string[];
  };
  completed: boolean;
}

export interface TeamSynergy {
  manifests: string[];
  bonus: string;
  description: string;
  unlocked: boolean;
}

// All 10 Manifests from the Nine Knowings Universe
export const MANIFESTS: Manifest[] = [
  {
    id: 'reading',
    name: 'Reading',
    description: 'The power to read emotions, patterns, and hidden truths',
    icon: '📖',
    color: '#8B5CF6',
    catalyst: 'Golden Letter',
    signatureMove: 'Future-read during team combat',
    levels: [
      {
        level: 1,
        scale: 'Self',
        description: 'Ability impacts only the user',
        example: 'Reads himself, self-analysis, clarity',
        xpRequired: 0,
        unlocked: true
      },
      {
        level: 2,
        scale: 'One Other',
        description: 'Affects one person',
        example: 'Reads one person\'s mood, movement, motive',
        xpRequired: 100,
        unlocked: false
      },
      {
        level: 3,
        scale: 'Team',
        description: 'Impacts small group',
        example: 'Reads team\'s patterns, syncs strategies',
        xpRequired: 300,
        unlocked: false
      },
      {
        level: 4,
        scale: 'Environment',
        description: 'Alters entire classroom-sized group',
        example: 'Reads room instantly, decodes hidden truths',
        xpRequired: 600,
        unlocked: false
      }
    ]
  },
  {
    id: 'writing',
    name: 'Writing',
    description: 'The power to influence thoughts and rewrite reality through words',
    icon: '✍️',
    color: '#3B82F6',
    catalyst: 'Sacred Pen',
    signatureMove: 'Reality Rewrite',
    levels: [
      {
        level: 1,
        scale: 'Self',
        description: 'Ability impacts only the user',
        example: 'Journaling empowers user\'s focus & memory',
        xpRequired: 0,
        unlocked: true
      },
      {
        level: 2,
        scale: 'One Other',
        description: 'Affects one person',
        example: 'Writes something that affects one reader\'s thinking',
        xpRequired: 100,
        unlocked: false
      },
      {
        level: 3,
        scale: 'Team',
        description: 'Impacts small group',
        example: 'Strategic influence — influences group morale or logic',
        xpRequired: 300,
        unlocked: false
      },
      {
        level: 4,
        scale: 'Environment',
        description: 'Alters entire classroom-sized group',
        example: 'Rewrites perception of reality for a whole audience',
        xpRequired: 600,
        unlocked: false
      }
    ]
  },
  {
    id: 'drawing',
    name: 'Drawing',
    description: 'The power to create visual illusions and alter perception',
    icon: '🎨',
    color: '#EC4899',
    catalyst: 'Mystic Brush',
    signatureMove: 'Shared Vision',
    levels: [
      {
        level: 1,
        scale: 'Self',
        description: 'Ability impacts only the user',
        example: 'Sketches for self-protection or illusions',
        xpRequired: 0,
        unlocked: true
      },
      {
        level: 2,
        scale: 'One Other',
        description: 'Affects one person',
        example: 'Draws tools that others can use',
        xpRequired: 100,
        unlocked: false
      },
      {
        level: 3,
        scale: 'Team',
        description: 'Impacts small group',
        example: 'Shared vision for team coordination',
        xpRequired: 300,
        unlocked: false
      },
      {
        level: 4,
        scale: 'Environment',
        description: 'Alters entire classroom-sized group',
        example: 'Alters visual perception of environment',
        xpRequired: 600,
        unlocked: false
      }
    ]
  },
  {
    id: 'athletics',
    name: 'Athletics',
    description: 'The power to control movement, rhythm, and physical flow',
    icon: '🏃',
    color: '#10B981',
    catalyst: 'Flow Shoes',
    signatureMove: 'Ground Quake Palm',
    levels: [
      {
        level: 1,
        scale: 'Self',
        description: 'Ability impacts only the user',
        example: 'Enhanced self-reflexes, balance, reaction',
        xpRequired: 0,
        unlocked: true
      },
      {
        level: 2,
        scale: 'One Other',
        description: 'Affects one person',
        example: 'Matches rhythm of one opponent',
        xpRequired: 100,
        unlocked: false
      },
      {
        level: 3,
        scale: 'Team',
        description: 'Impacts small group',
        example: 'Leads team flow like a dance captain',
        xpRequired: 300,
        unlocked: false
      },
      {
        level: 4,
        scale: 'Environment',
        description: 'Alters entire classroom-sized group',
        example: 'Controls fight terrain like a living field',
        xpRequired: 600,
        unlocked: false
      }
    ]
  },
  {
    id: 'singing',
    name: 'Singing',
    description: 'The power to control emotions and energy through voice',
    icon: '🎤',
    color: '#F59E0B',
    catalyst: 'Harmony Mic',
    signatureMove: 'Emotional Resonance',
    levels: [
      {
        level: 1,
        scale: 'Self',
        description: 'Ability impacts only the user',
        example: 'Modulates self-emotion with voice',
        xpRequired: 0,
        unlocked: true
      },
      {
        level: 2,
        scale: 'One Other',
        description: 'Affects one person',
        example: 'Affects one person\'s mood',
        xpRequired: 100,
        unlocked: false
      },
      {
        level: 3,
        scale: 'Team',
        description: 'Impacts small group',
        example: 'Synchs team emotions like a performance group',
        xpRequired: 300,
        unlocked: false
      },
      {
        level: 4,
        scale: 'Environment',
        description: 'Alters entire classroom-sized group',
        example: 'Commands energy of a space with tone',
        xpRequired: 600,
        unlocked: false
      }
    ]
  },
  {
    id: 'gaming',
    name: 'Gaming',
    description: 'The power to recognize patterns and rewrite reality rules',
    icon: '🎮',
    color: '#EF4444',
    catalyst: 'Strategy Controller',
    signatureMove: 'Reality Glitch',
    levels: [
      {
        level: 1,
        scale: 'Self',
        description: 'Ability impacts only the user',
        example: 'Pattern recognition; mental maps',
        xpRequired: 0,
        unlocked: true
      },
      {
        level: 2,
        scale: 'One Other',
        description: 'Affects one person',
        example: 'Predicts one player\'s next three moves',
        xpRequired: 100,
        unlocked: false
      },
      {
        level: 3,
        scale: 'Team',
        description: 'Impacts small group',
        example: 'Guides team like a strategy game leader',
        xpRequired: 300,
        unlocked: false
      },
      {
        level: 4,
        scale: 'Environment',
        description: 'Alters entire classroom-sized group',
        example: 'Rewrites environment "rules" like a glitcher',
        xpRequired: 600,
        unlocked: false
      }
    ]
  },
  {
    id: 'observation',
    name: 'Observation',
    description: 'The power to read environments and access perfect recall',
    icon: '👁️',
    color: '#6366F1',
    catalyst: 'Memory Lens',
    signatureMove: 'Echoes of Space',
    levels: [
      {
        level: 1,
        scale: 'Self',
        description: 'Ability impacts only the user',
        example: 'Perfect recall; environmental mapping',
        xpRequired: 0,
        unlocked: true
      },
      {
        level: 2,
        scale: 'One Other',
        description: 'Affects one person',
        example: 'Reads one person\'s movement/history',
        xpRequired: 100,
        unlocked: false
      },
      {
        level: 3,
        scale: 'Team',
        description: 'Impacts small group',
        example: 'Team replay — shared memory coordination',
        xpRequired: 300,
        unlocked: false
      },
      {
        level: 4,
        scale: 'Environment',
        description: 'Alters entire classroom-sized group',
        example: 'Echoes of space; reads room\'s emotional past',
        xpRequired: 600,
        unlocked: false
      }
    ]
  },
  {
    id: 'empathy',
    name: 'Empathy',
    description: 'The power to control and harmonize emotional states',
    icon: '💝',
    color: '#8B5CF6',
    catalyst: 'Heart Crystal',
    signatureMove: 'Emotional Harmony',
    levels: [
      {
        level: 1,
        scale: 'Self',
        description: 'Ability impacts only the user',
        example: 'Emotionally regulates self',
        xpRequired: 0,
        unlocked: true
      },
      {
        level: 2,
        scale: 'One Other',
        description: 'Affects one person',
        example: 'Mirrors one person to de-escalate/help',
        xpRequired: 100,
        unlocked: false
      },
      {
        level: 3,
        scale: 'Team',
        description: 'Impacts small group',
        example: 'Harmonizes group emotional state',
        xpRequired: 300,
        unlocked: false
      },
      {
        level: 4,
        scale: 'Environment',
        description: 'Alters entire classroom-sized group',
        example: 'Controls emotional atmosphere of space',
        xpRequired: 600,
        unlocked: false
      }
    ]
  },
  {
    id: 'creating',
    name: 'Creating',
    description: 'The power to craft tools and alter environments instantly',
    icon: '🔨',
    color: '#F97316',
    catalyst: 'Master Toolbox',
    signatureMove: 'Instant Build',
    levels: [
      {
        level: 1,
        scale: 'Self',
        description: 'Ability impacts only the user',
        example: 'Instinctively creates tools for self',
        xpRequired: 0,
        unlocked: true
      },
      {
        level: 2,
        scale: 'One Other',
        description: 'Affects one person',
        example: 'Custom tools for one person\'s need',
        xpRequired: 100,
        unlocked: false
      },
      {
        level: 3,
        scale: 'Team',
        description: 'Impacts small group',
        example: 'Team-based synergy crafting',
        xpRequired: 300,
        unlocked: false
      },
      {
        level: 4,
        scale: 'Environment',
        description: 'Alters entire classroom-sized group',
        example: 'Alters environment with instant builds',
        xpRequired: 600,
        unlocked: false
      }
    ]
  },
  {
    id: 'cooking',
    name: 'Cooking',
    description: 'The power to transform energy and perception through food',
    icon: '🍳',
    color: '#84CC16',
    catalyst: 'Sacred Spatula',
    signatureMove: 'Feast of Transformation',
    levels: [
      {
        level: 1,
        scale: 'Self',
        description: 'Ability impacts only the user',
        example: 'Uses food to alter personal energy',
        xpRequired: 0,
        unlocked: true
      },
      {
        level: 2,
        scale: 'One Other',
        description: 'Affects one person',
        example: 'Heals or boosts one person with a meal',
        xpRequired: 100,
        unlocked: false
      },
      {
        level: 3,
        scale: 'Team',
        description: 'Impacts small group',
        example: 'Shared meal that boosts all team stats',
        xpRequired: 300,
        unlocked: false
      },
      {
        level: 4,
        scale: 'Environment',
        description: 'Alters entire classroom-sized group',
        example: 'Feast that transforms group mindset/perception',
        xpRequired: 600,
        unlocked: false
      }
    ]
  }
];

// Team Synergies
export const TEAM_SYNERGIES: TeamSynergy[] = [
  {
    manifests: ['reading', 'drawing'],
    bonus: 'Mapping System',
    description: 'Reading + Drawing creates shared visual strategy maps',
    unlocked: false
  },
  {
    manifests: ['writing', 'singing'],
    bonus: 'Resonance Amplification',
    description: 'Writing + Singing amplifies emotional impact',
    unlocked: false
  },
  {
    manifests: ['gaming', 'observation'],
    bonus: 'Predictive Analysis',
    description: 'Gaming + Observation provides perfect battlefield awareness',
    unlocked: false
  },
  {
    manifests: ['empathy', 'cooking'],
    bonus: 'Healing Harmony',
    description: 'Empathy + Cooking creates powerful healing effects',
    unlocked: false
  },
  {
    manifests: ['athletics', 'creating'],
    bonus: 'Flow Crafting',
    description: 'Athletics + Creating allows instant weapon creation',
    unlocked: false
  }
];

// Character templates from the Nine Knowings Universe
export const CHARACTER_TEMPLATES = [
  {
    name: 'Deklan',
    manifest: 'reading',
    catalyst: 'Golden Letter',
    veil: 'Self-doubt about ability',
    level: 3,
    signatureMove: 'Future-read during team combat'
  },
  {
    name: 'Allen',
    manifest: 'fire', // Note: This would need to be mapped to an existing manifest
    catalyst: 'Gloves',
    veil: 'Fear of loss / control',
    level: 2,
    signatureMove: 'Raging Flame Arc'
  },
  {
    name: 'Alejandra',
    manifest: 'observation', // Mapped to observation for discovery
    catalyst: 'Compass',
    veil: 'Fear of failure',
    level: 2,
    signatureMove: 'Echo Path – retrace event through aura'
  },
  {
    name: 'Khalil',
    manifest: 'writing', // Mapped to writing for lies/manipulation
    catalyst: 'Serpent Ring',
    veil: 'Jealousy of connection',
    level: 3,
    signatureMove: 'Whisper Coil'
  },
  {
    name: 'Greg',
    manifest: 'athletics',
    catalyst: 'Braces',
    veil: 'Need for validation',
    level: 3,
    signatureMove: 'Ground Quake Palm'
  }
]; 