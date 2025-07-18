export interface Chapter {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  storyArc: string;
  requirements: ChapterRequirement[];
  rewards: ChapterReward[];
  challenges: ChapterChallenge[];
  teamSize: number;
  isActive: boolean;
  isCompleted: boolean;
  unlockDate?: Date;
  completionDate?: Date;
}

export interface ChapterRequirement {
  type: 'level' | 'manifest' | 'artifact' | 'team' | 'previousChapter' | 'rival' | 'veil' | 'reflection' | 'wisdom' | 'ethics' | 'leadership';
  value: any;
  description: string;
}

export interface ChapterReward {
  type: 'xp' | 'pp' | 'level' | 'artifact' | 'manifest' | 'reflection' | 'wisdom' | 'blessing' | 'ability' | 'title' | 'team' | 'rival' | 'veil' | 'leadership' | 'ethics' | 'ninth';
  value: any;
  description: string;
}

export interface ChapterChallenge {
  id: string;
  title: string;
  description: string;
  type: 'personal' | 'team' | 'solo' | 'group' | 'leadership' | 'mentorship' | 'ethical' | 'final';
  requirements: ChallengeRequirement[];
  rewards: ChallengeReward[];
  isCompleted: boolean;
  completionDate?: Date;
  googleClassroomAssignment?: GoogleClassroomAssignment;
}

export interface GoogleClassroomAssignment {
  id: string;
  title: string;
  description?: string;
  dueDate?: {
    year: number;
    month: number;
    day: number;
  };
  courseId: string;
  courseName?: string;
}

export interface ChallengeRequirement {
  type: 'artifact' | 'team' | 'rival' | 'veil' | 'reflection' | 'wisdom' | 'ethics' | 'manifest' | 'leadership' | 'profile';
  value: any;
  description: string;
}

export interface ChallengeReward {
  type: 'xp' | 'pp' | 'level' | 'artifact' | 'manifest' | 'reflection' | 'wisdom' | 'blessing' | 'ability' | 'title' | 'team' | 'rival' | 'veil' | 'leadership' | 'ethics' | 'ninth';
  value: any;
  description: string;
}

export interface Team {
  id: string;
  name: string;
  members: string[]; // User IDs
  leader: string;
  rivals: string[]; // Rival team IDs
  formationDate: Date;
  isActive: boolean;
}

export interface Rival {
  id: string;
  name: string;
  type: 'external' | 'internal';
  description: string;
  challenge: string;
  isDefeated: boolean;
  defeatDate?: Date;
}

export interface Veil {
  id: string;
  name: string;
  description: string;
  manifestType: string;
  challenge: string;
  isConfronted: boolean;
  confrontationDate?: Date;
}

export interface ReflectionEcho {
  id: string;
  name: string;
  description: string;
  power: string;
  teamBond: number;
  isActive: boolean;
  activationDate?: Date;
}

export interface WisdomPoint {
  id: string;
  source: string;
  amount: number;
  description: string;
  earnedDate: Date;
}

export interface ArtifactBlessing {
  id: string;
  name: string;
  description: string;
  power: string;
  isActive: boolean;
  activationDate?: Date;
}

export interface EthicsArchetype {
  id: string;
  name: string;
  ethic: string;
  description: string;
  challenge: string;
  alignment: 'light' | 'dark' | 'neutral';
  isDefeated: boolean;
  defeatDate?: Date;
  lesson: string;
}

export interface VeilKing {
  id: string;
  name: string;
  description: string;
  challenge: string;
  ethicsRequired: string[];
  isDefeated: boolean;
  defeatDate?: Date;
}

export interface NinthKnowing {
  id: string;
  name: string;
  description: string;
  power: string;
  requirements: string[];
  isUnlocked: boolean;
  unlockDate?: Date;
}

// Chapter Data
export const CHAPTERS: Chapter[] = [
  {
    id: 1,
    title: "Leaving the Ordinary World",
    subtitle: "The Awakening Begins",
    description: "Players create their profile, choose their Manifest, identify their Artifact, and complete their first personal mission to unlock Level 1.",
    storyArc: "Call to Adventure",
    requirements: [
      { type: 'manifest', value: 'chosen', description: 'Must have chosen a Manifest' }
    ],
    rewards: [
      { type: 'level', value: 1, description: 'Unlock Level 1' },
      { type: 'artifact', value: 'personal', description: 'Personal Artifact' }
    ],
    challenges: [
      {
        id: 'ch1-update-profile',
        title: 'Update Your Profile',
        description: 'Complete your profile with your display name and basic information',
        type: 'personal',
        requirements: [],
        rewards: [
          { type: 'xp', value: 15, description: 'Profile completion XP' },
          { type: 'pp', value: 5, description: 'Profile completion PP' }
        ],
        isCompleted: false
      },
      {
        id: 'ch1-declare-manifest',
        title: 'Declare Your Manifest',
        description: 'Choose your manifestation type and declare your path',
        type: 'personal',
        requirements: [],
        rewards: [
          { type: 'xp', value: 20, description: 'Manifest declaration XP' },
          { type: 'pp', value: 8, description: 'Manifest declaration PP' },
          { type: 'manifest', value: 'chosen', description: 'Manifest chosen' }
        ],
        isCompleted: false
      },
      {
        id: 'ch1-artifact-identification',
        title: 'Identify Your Artifact',
        description: 'Discover the artifact linked to your inner truth',
        type: 'personal',
        requirements: [{ type: 'manifest', value: 'chosen', description: 'Must have chosen a manifest' }],
        rewards: [
          { type: 'xp', value: 25, description: 'Artifact identification XP' },
          { type: 'pp', value: 10, description: 'Artifact identification PP' },
          { type: 'artifact', value: 'identified', description: 'Artifact identified' }
        ],
        isCompleted: false
      },
      {
        id: 'ch1-artifact-challenge',
        title: 'Complete Artifact Challenge',
        description: 'Complete a personal mission related to your artifact',
        type: 'personal',
        requirements: [{ type: 'artifact', value: 'identified', description: 'Must have identified artifact' }],
        rewards: [
          { type: 'xp', value: 50, description: 'Artifact challenge completion XP' },
          { type: 'pp', value: 20, description: 'Artifact challenge completion PP' },
          { type: 'level', value: 1, description: 'Unlock Level 1' }
        ],
        isCompleted: false
      }
    ],
    teamSize: 1,
    isActive: true,
    isCompleted: false
  },
  {
    id: 2,
    title: "Test, Allies, & Enemies",
    subtitle: "The Team Forms",
    description: "Form a 4-person team, choose a rival, and complete a team trial focusing on coordination and emotional synergy.",
    storyArc: "Meeting the Mentor",
    requirements: [
      { type: 'level', value: 1, description: 'Must be Level 1' },
      { type: 'previousChapter', value: 1, description: 'Must complete Chapter 1' }
    ],
    rewards: [
      { type: 'team', value: 'formed', description: 'Team formation' },
      { type: 'rival', value: 'chosen', description: 'Rival identified' }
    ],
    challenges: [
      {
        id: 'ch2-team-formation',
        title: 'Form Your Team',
        description: 'Assemble a 4-person team with complementary manifests',
        type: 'team',
        requirements: [],
        rewards: [
          { type: 'xp', value: 30, description: 'Team formation XP' },
          { type: 'pp', value: 15, description: 'Team formation PP' },
          { type: 'team', value: 'formed', description: 'Team formed' }
        ],
        isCompleted: false
      },
      {
        id: 'ch2-rival-selection',
        title: 'Choose Your Rival',
        description: 'Identify an enemy or internalized foe to overcome',
        type: 'personal',
        requirements: [{ type: 'team', value: 'formed', description: 'Must have formed team' }],
        rewards: [
          { type: 'xp', value: 20, description: 'Rival selection XP' },
          { type: 'pp', value: 10, description: 'Rival selection PP' },
          { type: 'rival', value: 'chosen', description: 'Rival chosen' }
        ],
        isCompleted: false
      },
      {
        id: 'ch2-team-trial',
        title: 'Complete Team Trial',
        description: 'Face a challenge requiring coordination and emotional synergy',
        type: 'team',
        requirements: [
          { type: 'team', value: 'formed', description: 'Must have formed team' },
          { type: 'rival', value: 'chosen', description: 'Must have chosen rival' }
        ],
        rewards: [
          { type: 'xp', value: 150, description: 'Team trial completion XP' },
          { type: 'pp', value: 50, description: 'Team trial completion PP' },
          { type: 'wisdom', value: 1, description: 'Team wisdom gained' }
        ],
        isCompleted: false
      }
    ],
    teamSize: 4,
    isActive: false,
    isCompleted: false
  },
  {
    id: 3,
    title: "Approach the Inmost Cave",
    subtitle: "Confronting the Veil",
    description: "Each player enters a solo trial space reflecting their greatest fear or internal block. Must confront a memory, trauma, or illusion rooted in their Manifest.",
    storyArc: "Crossing the Threshold",
    requirements: [
      { type: 'level', value: 1, description: 'Must be Level 1' },
      { type: 'previousChapter', value: 2, description: 'Must complete Chapter 2' }
    ],
    rewards: [
      { type: 'level', value: 2, description: 'Unlock Level 2' },
      { type: 'veil', value: 'confronted', description: 'Veil confronted' }
    ],
    challenges: [
      {
        id: 'ch3-solo-trial',
        title: 'Enter the Inmost Cave',
        description: 'Face your greatest fear or internal block in a solo trial',
        type: 'solo',
        requirements: [],
        rewards: [
          { type: 'level', value: 2, description: 'Unlock Level 2' },
          { type: 'veil', value: 'confronted', description: 'Veil confronted' }
        ],
        isCompleted: false
      }
    ],
    teamSize: 1,
    isActive: false,
    isCompleted: false
  },
  {
    id: 4,
    title: "The Ordeal + Reward, Seizing the Sword",
    subtitle: "The Team's Trial",
    description: "Group reassembles to face a trial that mirrors a core flaw in the team dynamic. Upon surviving, each member receives a Reflection Echo.",
    storyArc: "Tests, Allies, Enemies",
    requirements: [
      { type: 'level', value: 2, description: 'Must be Level 2' },
      { type: 'previousChapter', value: 3, description: 'Must complete Chapter 3' }
    ],
    rewards: [
      { type: 'reflection', value: 'echo', description: 'Reflection Echo received' },
      { type: 'level', value: 3, description: 'One member ascends to Level 3' }
    ],
    challenges: [
      {
        id: 'ch4-team-ordeal',
        title: 'Face the Team Ordeal',
        description: 'Confront a core flaw in your team dynamic (trust, ego, silence)',
        type: 'group',
        requirements: [],
        rewards: [{ type: 'reflection', value: 'echo', description: 'Reflection Echo' }],
        isCompleted: false
      },
      {
        id: 'ch4-level-ascension',
        title: 'Temporary Ascension',
        description: 'One team member temporarily ascends to Level 3',
        type: 'team',
        requirements: [{ type: 'reflection', value: 'echo', description: 'Must have Reflection Echo' }],
        rewards: [{ type: 'level', value: 3, description: 'Temporary Level 3' }],
        isCompleted: false
      }
    ],
    teamSize: 4,
    isActive: false,
    isCompleted: false
  },
  {
    id: 5,
    title: "The Road Back",
    subtitle: "Consequences Unfold",
    description: "The world begins reacting to their changes. Players must take leadership roles and hold each other accountable.",
    storyArc: "The Road Back",
    requirements: [
      { type: 'level', value: 2, description: 'Must be Level 2' },
      { type: 'previousChapter', value: 4, description: 'Must complete Chapter 4' }
    ],
    rewards: [
      { type: 'leadership', value: 'role', description: 'Leadership role' },
      { type: 'xp', value: 200, description: 'Leadership XP' }
    ],
    challenges: [
      {
        id: 'ch5-world-reaction',
        title: 'Face World Reactions',
        description: 'Deal with consequences: rival sabotage, NPC injuries, mentor disappearances',
        type: 'leadership',
        requirements: [],
        rewards: [{ type: 'leadership', value: 'role', description: 'Leadership role' }],
        isCompleted: false
      },
      {
        id: 'ch5-accountability',
        title: 'Hold Each Other Accountable',
        description: 'Take leadership roles and ensure team accountability',
        type: 'leadership',
        requirements: [{ type: 'leadership', value: 'role', description: 'Must have leadership role' }],
        rewards: [{ type: 'xp', value: 200, description: 'Leadership XP' }],
        isCompleted: false
      }
    ],
    teamSize: 4,
    isActive: false,
    isCompleted: false
  },
  {
    id: 6,
    title: "Resurrection / Apotheosis",
    subtitle: "The Death Sequence",
    description: "A simulated death sequence where each player faces a version of themselves who never awakened. Must choose to reintegrate or reject aspects of self.",
    storyArc: "Resurrection",
    requirements: [
      { type: 'level', value: 2, description: 'Must be Level 2' },
      { type: 'previousChapter', value: 5, description: 'Must complete Chapter 5' }
    ],
    rewards: [
      { type: 'level', value: 3, description: 'Unlock Level 3 abilities' },
      { type: 'manifest', value: 'full', description: 'Full Manifest potential' }
    ],
    challenges: [
      {
        id: 'ch6-death-sequence',
        title: 'Face the Death Sequence',
        description: 'Confront a version of yourself who never awakened',
        type: 'solo',
        requirements: [],
        rewards: [
          { type: 'level', value: 3, description: 'Unlock Level 3' },
          { type: 'manifest', value: 'full', description: 'Full Manifest potential' }
        ],
        isCompleted: false
      }
    ],
    teamSize: 1,
    isActive: false,
    isCompleted: false
  },
  {
    id: 7,
    title: "Return with the Elixir",
    subtitle: "The Mentor's Path",
    description: "Players return to Xiotein with new insights and unlock the ability to mentor new initiates. Help guide a new player/team through their first challenge.",
    storyArc: "Return with the Elixir",
    requirements: [
      { type: 'level', value: 3, description: 'Must be Level 3' },
      { type: 'previousChapter', value: 6, description: 'Must complete Chapter 6' }
    ],
    rewards: [
      { type: 'wisdom', value: 'points', description: 'Wisdom Points' },
      { type: 'blessing', value: 'artifact', description: 'Artifact Blessing' }
    ],
    challenges: [
      {
        id: 'ch7-mentorship',
        title: 'Become a Mentor',
        description: 'Guide a new player/team through their first challenge',
        type: 'mentorship',
        requirements: [],
        rewards: [
          { type: 'wisdom', value: 'points', description: 'Wisdom Points' },
          { type: 'blessing', value: 'artifact', description: 'Artifact Blessing' }
        ],
        isCompleted: false
      }
    ],
    teamSize: 4,
    isActive: false,
    isCompleted: false
  },
  {
    id: 8,
    title: "Face the 6 Ethics of Life",
    subtitle: "The Archetype Trials",
    description: "The Ethics manifest as sentient Archetypes. Players must defeat or learn from each, depending on alignment.",
    storyArc: "The Final Ordeal",
    requirements: [
      { type: 'level', value: 3, description: 'Must be Level 3' },
      { type: 'previousChapter', value: 7, description: 'Must complete Chapter 7' }
    ],
    rewards: [
      { type: 'ethics', value: 'mastered', description: 'Ethics mastery' },
      { type: 'xp', value: 500, description: 'Ethics completion XP' }
    ],
    challenges: [
      {
        id: 'ch8-believe',
        title: 'Believe: Blind Devotion vs. Discernment',
        description: 'Face the Archetype of Belief',
        type: 'ethical',
        requirements: [],
        rewards: [{ type: 'ethics', value: 'believe', description: 'Believe ethic mastered' }],
        isCompleted: false
      },
      {
        id: 'ch8-listen',
        title: 'Listen: Silencing vs. Hearing Truth',
        description: 'Face the Archetype of Listening',
        type: 'ethical',
        requirements: [],
        rewards: [{ type: 'ethics', value: 'listen', description: 'Listen ethic mastered' }],
        isCompleted: false
      },
      {
        id: 'ch8-speak',
        title: 'Speak: Lies vs. Responsibility',
        description: 'Face the Archetype of Speech',
        type: 'ethical',
        requirements: [],
        rewards: [{ type: 'ethics', value: 'speak', description: 'Speak ethic mastered' }],
        isCompleted: false
      },
      {
        id: 'ch8-grow',
        title: 'Grow: Comfort vs. Discomfort',
        description: 'Face the Archetype of Growth',
        type: 'ethical',
        requirements: [],
        rewards: [{ type: 'ethics', value: 'grow', description: 'Grow ethic mastered' }],
        isCompleted: false
      },
      {
        id: 'ch8-letgo',
        title: 'Let Go: Grasping vs. Surrender',
        description: 'Face the Archetype of Release',
        type: 'ethical',
        requirements: [],
        rewards: [{ type: 'ethics', value: 'letgo', description: 'Let Go ethic mastered' }],
        isCompleted: false
      },
      {
        id: 'ch8-give',
        title: 'Give: Selfishness vs. Service',
        description: 'Face the Archetype of Giving',
        type: 'ethical',
        requirements: [],
        rewards: [{ type: 'ethics', value: 'give', description: 'Give ethic mastered' }],
        isCompleted: false
      }
    ],
    teamSize: 4,
    isActive: false,
    isCompleted: false
  },
  {
    id: 9,
    title: "Final Battle – Synthesis",
    subtitle: "The Veil King",
    description: "The Ethics reunite under The Veil King. Victory triggers the emergence of the Ninth Knowing.",
    storyArc: "The Return",
    requirements: [
      { type: 'level', value: 3, description: 'Must be Level 3' },
      { type: 'previousChapter', value: 8, description: 'Must complete Chapter 8' },
      { type: 'ethics', value: 'all', description: 'Must master all 6 Ethics' }
    ],
    rewards: [
      { type: 'ninth', value: 'knowing', description: 'Ninth Knowing unlocked' },
      { type: 'title', value: 'Master', description: 'Master title' }
    ],
    challenges: [
      {
        id: 'ch9-veil-king',
        title: 'Face The Veil King',
        description: 'Battle the distorted force that unites all Ethics',
        type: 'final',
        requirements: [{ type: 'ethics', value: 'all', description: 'Must master all Ethics' }],
        rewards: [
          { type: 'ninth', value: 'knowing', description: 'Ninth Knowing' },
          { type: 'title', value: 'Master', description: 'Master title' }
        ],
        isCompleted: false
      }
    ],
    teamSize: 4,
    isActive: false,
    isCompleted: false
  }
];

export const ETHICS_ARCHETYPES: EthicsArchetype[] = [
  {
    id: 'believe',
    name: 'The Blind Devotee',
    ethic: 'Believe',
    description: 'Represents the conflict between blind devotion and discernment',
    challenge: 'Choose between unquestioning faith and critical thinking',
    alignment: 'neutral',
    isDefeated: false,
    lesson: 'True belief requires both faith and wisdom'
  },
  {
    id: 'listen',
    name: 'The Silent One',
    ethic: 'Listen',
    description: 'Embodies the choice between silencing and hearing truth',
    challenge: 'Learn to hear beyond words and silence',
    alignment: 'neutral',
    isDefeated: false,
    lesson: 'Listening is an active choice, not passive reception'
  },
  {
    id: 'speak',
    name: 'The Deceiver',
    ethic: 'Speak',
    description: 'Represents the battle between lies and responsibility',
    challenge: 'Choose truth over convenience',
    alignment: 'dark',
    isDefeated: false,
    lesson: 'Words have power; use them with integrity'
  },
  {
    id: 'grow',
    name: 'The Comfort Seeker',
    ethic: 'Grow',
    description: 'Embodies the tension between comfort and discomfort',
    challenge: 'Embrace growth through discomfort',
    alignment: 'light',
    isDefeated: false,
    lesson: 'Growth requires stepping outside your comfort zone'
  },
  {
    id: 'letgo',
    name: 'The Grasper',
    ethic: 'Let Go',
    description: 'Represents the struggle between grasping and surrender',
    challenge: 'Learn to release what no longer serves',
    alignment: 'neutral',
    isDefeated: false,
    lesson: 'Freedom comes from letting go, not holding on'
  },
  {
    id: 'give',
    name: 'The Selfish One',
    ethic: 'Give',
    description: 'Embodies the choice between selfishness and service',
    challenge: 'Choose service over self-interest',
    alignment: 'dark',
    isDefeated: false,
    lesson: 'True abundance comes from giving, not taking'
  }
];

export const VEIL_KING: VeilKing = {
  id: 'veil-king',
  name: 'The Veil King',
  description: 'A distorted force that unites all Ethics under its corrupted banner',
  challenge: 'Use manifested metaphors, arguments, truth-pulses, and teamwork to defeat the ultimate challenge',
  ethicsRequired: ['believe', 'listen', 'speak', 'grow', 'letgo', 'give'],
  isDefeated: false
};

export const NINTH_KNOWING: NinthKnowing = {
  id: 'ninth-knowing',
  name: 'The Ninth Knowing',
  description: 'A power unlocked only by integrating the Ethics, not just defeating them',
  power: 'The ability to synthesize all previous knowings into a transcendent understanding',
  requirements: ['believe', 'listen', 'speak', 'grow', 'letgo', 'give', 'veil-king'],
  isUnlocked: false
}; 