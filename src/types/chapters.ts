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
  type: 'level' | 'manifest' | 'artifact' | 'team' | 'previousChapter' | 'rival' | 'veil' | 'reflection' | 'wisdom' | 'ethics' | 'leadership' | 'ability' | 'profile';
  value: any;
  description: string;
}

export interface ChapterReward {
  type: 'xp' | 'pp' | 'level' | 'artifact' | 'manifest' | 'reflection' | 'wisdom' | 'blessing' | 'ability' | 'title' | 'team' | 'rival' | 'veil' | 'leadership' | 'ethics' | 'ninth' | 'truthMetal';
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
  type: 'artifact' | 'team' | 'rival' | 'veil' | 'reflection' | 'wisdom' | 'ethics' | 'manifest' | 'leadership' | 'profile' | 'ability' | 'challenge';
  value: any;
  description: string;
}

export interface ChallengeReward {
  type: 'xp' | 'pp' | 'level' | 'artifact' | 'manifest' | 'reflection' | 'wisdom' | 'blessing' | 'ability' | 'title' | 'team' | 'rival' | 'veil' | 'leadership' | 'ethics' | 'ninth' | 'truthMetal';
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
    description: "Players create their profile, choose their Manifest, identify their Artifact, and complete their first personal mission to unlock Level 1. Then embark on the story adventure by receiving the Xiotein Letter and awakening your powers.",
    storyArc: "Call to Adventure + Story Mode - Episode 1",
    requirements: [
      // Chapter 1 is automatically available to all players - no requirements
    ],
    rewards: [
      { type: 'artifact', value: 'artifacts_unlocked', description: 'Unlock Artifacts' },
      { type: 'artifact', value: 'elemental_moves_unlocked', description: 'Unlock Elemental Moves' }
    ],
    challenges: [
      {
        id: 'ep1-get-letter',
        title: 'Get Letter',
        description: 'Describe your Ordinary World and receive the mysterious Xiotein letter that will change your life forever',
        type: 'personal',
        requirements: [],
        rewards: [
          { type: 'xp', value: 10, description: 'Letter received XP' },
          { type: 'pp', value: 100, description: 'Letter received PP' }
        ],
        isCompleted: false
      },
      {
        id: 'ep1-truth-metal-choice',
        title: 'The Truth Metal Choice',
        description: 'Choose whether to touch the Truth Metal (and change your life forever) or ignore it and forget it ever happened',
        type: 'personal',
        requirements: [{ type: 'artifact', value: 'letter_received', description: 'Must have received the letter' }],
        rewards: [
          { type: 'xp', value: 20, description: 'Choice made XP' },
          { type: 'pp', value: 100, description: 'Choice made PP' }
        ],
        isCompleted: false
      },
      {
        id: 'ep1-touch-truth-metal',
        title: 'Touch Truth Metal',
        description: 'Touch the Truth Metal to reveal core truths and unlock important in-game currency',
        type: 'personal',
        requirements: [{ type: 'artifact', value: 'chose_truth_metal', description: 'Must have chosen to touch Truth Metal' }],
        rewards: [
          { type: 'xp', value: 30, description: 'Truth Metal touched XP' },
          { type: 'pp', value: 100, description: 'Truth Metal touched PP' },
          { type: 'truthMetal', value: 1, description: '1 Truth Metal currency' },
          { type: 'artifact', value: 'truth_metal_currency', description: 'Truth Metal currency unlocked' }
        ],
        isCompleted: false
      },
      {
        id: 'ep1-view-mst-ui',
        title: 'MST Interface Tutorial',
        description: 'Take a guided tour of the MST (Masters of Space and Time) interface. Learn about My Profile, MST MKT, Hall of Fame, and Battle Arena.',
        type: 'personal',
        requirements: [{ type: 'artifact', value: 'truth_metal_currency', description: 'Must have touched Truth Metal' }],
        rewards: [
          { type: 'xp', value: 40, description: 'MST Tutorial completion XP' },
          { type: 'pp', value: 100, description: 'MST Tutorial completion PP' }
        ],
        isCompleted: false
      },
      {
        id: 'ep1-power-card-intro',
        title: 'Discover Your Power Card',
        description: 'The Truth Metal transforms into a card - a visual and physical manifestation of your power. Explore your Power Card to understand yourself, your manifests, and your potential. The more you strengthen your manifest on your journey, the more your Power Card will reveal.',
        type: 'personal',
        requirements: [{ type: 'artifact', value: 'ui_explored', description: 'Must have explored MST UI' }],
        rewards: [
          { type: 'xp', value: 50, description: 'Power Card discovery XP' },
          { type: 'pp', value: 100, description: 'Power Card understanding PP' },
          { type: 'artifact', value: 'power_card_discovered', description: 'Power Card discovered' }
        ],
        isCompleted: false
      },
      {
        id: 'ep1-portal-sequence',
        title: 'Journey to Xiotein',
        description: 'You travel to the abandoned subway station and meet other manifesters. There you face your first true test: the villain Hela appears, threatening to take your power cards or end your journey before it begins. Stand your ground and face Hela before the portal to Xiotein can open.',
        type: 'personal',
        requirements: [{ type: 'artifact', value: 'power_card_discovered', description: 'Must have discovered your Power Card' }],
        rewards: [
          { type: 'xp', value: 60, description: 'Face Hela completion XP' },
          { type: 'pp', value: 100, description: 'First villain encounter PP' },
          { type: 'artifact', value: 'hela_encountered', description: 'Encountered Hela' }
        ],
        isCompleted: false
      },
      {
        id: 'ep1-update-profile',
        title: 'Hela Awakened',
        description: 'Face Hela\'s awakened power as she summons four Ice Golems to test your strength',
        type: 'personal',
        requirements: [{ type: 'manifest', value: 'chosen', description: 'Must have chosen a manifest' }],
        rewards: [
          { type: 'xp', value: 70, description: 'Hela Awakened completion XP' },
          { type: 'pp', value: 100, description: 'Hela Awakened completion PP' }
        ],
        isCompleted: false
      },
      {
        id: 'ep1-view-power-card',
        title: 'Artifacts and Elements',
        description: 'After the Giant Ice Golem\'s devastating attack, discover the power of Artifacts and Elements',
        type: 'personal',
        requirements: [{ type: 'artifact', value: 'giant_ice_golem_cutscene_seen', description: 'Must have seen the Giant Ice Golem cutscene' }],
        rewards: [
          { type: 'xp', value: 80, description: 'Artifacts and Elements discovery XP' },
          { type: 'pp', value: 100, description: 'Artifacts and Elements discovery PP' },
          { type: 'artifact', value: 'artifacts_unlocked', description: 'Artifacts system unlocked' },
          { type: 'artifact', value: 'elemental_ring_level_1', description: 'Elemental Ring: Level 1 - Grants access to elemental moves' }
        ],
        isCompleted: false
      },
      {
        id: 'ep1-where-it-started',
        title: 'Where it all started',
        description: 'Zeke intervenes to end the battle between you and Hela, bringing the first chapter of your journey to a close',
        type: 'final',
        requirements: [{ type: 'artifact', value: 'elemental_ring_level_1', description: 'Must have received the Elemental Ring from Zeke' }],
        rewards: [
          { type: 'xp', value: 100, description: 'Chapter 1 completion XP' },
          { type: 'pp', value: 150, description: 'Chapter 1 completion PP' },
          { type: 'truthMetal', value: 1, description: '1 Truth Metal shard' },
          { type: 'artifact', value: 'chapter_1_completed', description: 'Chapter 1 completed' }
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
    subtitle: "Surviving Timu Island",
    description: "Form a 4-person team, choose a rival, and complete a team trial focusing on coordination and emotional synergy. Then arrive at Xiotein school and meet your rivals, completing orientation and sparring drills. Finally, face the ultimate test: learning Imposition—the power to command reality, not just react to it. With Kon as your ally, survive waves of Unveiled forces and escape the collapsing research facility.",
    storyArc: "Meeting the Mentor + Story Mode - Episode 2",
    requirements: [
      // Chapter 2 is now available to all players - no requirements
    ],
    rewards: [
      { type: 'team', value: 'formed', description: 'Team formation' },
      { type: 'rival', value: 'chosen', description: 'Rival identified' },
      { type: 'ability', value: 'action_card_slot', description: 'Action Card Slot' },
      { type: 'artifact', value: 'countermeasure_card', description: 'Starter Card: Countermeasure' },
      { type: 'ability', value: 'shield_restoration', description: 'System Move: Shield Restoration' }
    ],
    challenges: [
      {
        id: 'ch2-team-formation',
        title: 'Arrival on Timu Island',
        description: 'You thought the portal you took with Zeke would lead to Xiotein, but Sonido changed the destination somehow. Now you\'ve ended up on Timu Island - a place filled with a dangerous jungle, animals, hostile rebels, and is loaded with Zombies.',
        type: 'team',
        requirements: [],
        rewards: [
          { type: 'xp', value: 100, description: 'Arrival on Timu Island XP' },
          { type: 'pp', value: 100, description: 'Arrival on Timu Island PP' },
          { type: 'team', value: 'formed', description: 'Team formed' }
        ],
        isCompleted: false
      },
      {
        id: 'ch2-rival-selection',
        title: 'Find a Home',
        description: 'Players will be forming squads to have a better chance against the dangers of Timu Island',
        type: 'personal',
        requirements: [{ type: 'team', value: 'formed', description: 'Must have formed team' }],
        rewards: [
          { type: 'xp', value: 50, description: 'Find a Home XP' },
          { type: 'pp', value: 50, description: 'Find a Home PP' },
          { type: 'rival', value: 'chosen', description: 'Rival chosen' }
        ],
        isCompleted: false
      },
      {
        id: 'ch2-team-trial',
        title: 'Squad Up',
        description: 'Face a challenge requiring coordination and emotional synergy',
        type: 'team',
        requirements: [
          { type: 'team', value: 'formed', description: 'Must have formed team' },
          { type: 'rival', value: 'chosen', description: 'Must have chosen rival' }
        ],
        rewards: [
          { type: 'xp', value: 100, description: 'Squad Up XP' },
          { type: 'pp', value: 100, description: 'Squad Up PP' },
          { type: 'artifact', value: 'captains-helmet', description: 'Captain\'s Helmet' }
        ],
        isCompleted: false
      },
      {
        id: 'ep2-its-all-a-game',
        title: 'It\'s All a Game',
        description: 'Now that there is power in the Research Facility, Sonido\'s transmissions can come through. His first transmission is about to come through. Sonido reveals that life, power, and manifests operate like a game. Most people never see the UI, but some learn to listen to the system. He hints that Ascension isn\'t just Manifest mastery—what if you could change the settings?',
        type: 'team',
        requirements: [
          { type: 'team', value: 'formed', description: 'Must have formed team' },
          { type: 'rival', value: 'chosen', description: 'Must have chosen rival' },
          { type: 'challenge', value: 'ch2-team-trial', description: 'Must complete Squad Up' }
        ],
        rewards: [
          { type: 'xp', value: 300, description: 'It\'s All a Game XP' },
          { type: 'pp', value: 300, description: 'It\'s All a Game PP' },
          { type: 'ability', value: 'reality_layer_ui', description: 'Reality Layer UI Unlock' },
          { type: 'artifact', value: 'rr_candy', description: 'RR Candy' },
          { type: 'ability', value: 'manifest_configuration', description: 'Manifest Configuration Tab' },
          { type: 'ability', value: 'candy_skill_tree', description: 'Candy Skill Tree Unlock' }
        ],
        isCompleted: false
      },
      {
        id: 'ch2-5-imposition-test',
        title: 'Tests, Allies, and Enemies',
        description: 'The underground research facility hums violently. The Unveiled Higher ups are on their way to retrieve the power they lost. Kon stands calm amid the chaos—this power is familiar to him. He teaches you about Imposition: forcing your intent onto the system. Most people react to power. Very few command it. Escape the facility—but first, survive what this power attracts.',
        type: 'team',
        requirements: [
          { type: 'challenge', value: 'ep2-its-all-a-game', description: 'Must have received RR Candy' },
          { type: 'artifact', value: 'rr_candy', description: 'Must have RR Candy' }
        ],
        rewards: [
          { type: 'xp', value: 500, description: 'Imposition Test completion XP' },
          { type: 'pp', value: 400, description: 'Imposition Test completion PP' },
          { type: 'ability', value: 'imposition_mastery', description: 'Imposition Mastery: Learn to command power, not react to it' },
          { type: 'ability', value: 'rr_candy_override', description: 'RR Candy Override: Override reality systems, not just enemies' },
          { type: 'truthMetal', value: 2, description: '2 Truth Metal shards' }
        ],
        isCompleted: false
      },
      {
        id: 'ep2-orientation',
        title: 'Complete Orientation',
        description: 'Learn the basics of Xiotein',
        type: 'personal',
        requirements: [
          { type: 'challenge', value: 'ch2-5-imposition-test', description: 'Must complete Tests, Allies, and Enemies' }
        ],
        rewards: [
          { type: 'xp', value: 30, description: 'Orientation XP' },
          { type: 'pp', value: 15, description: 'Orientation PP' }
        ],
        isCompleted: false
      }
    ],
    teamSize: 4,
    isActive: true,
    isCompleted: false
  },
  {
    id: 3,
    title: "Approach the Inmost Cave",
    subtitle: "Confronting the Veil",
    description: "Each player enters a solo trial space reflecting their greatest fear or internal block. Must confront a memory, trauma, or illusion rooted in their Manifest. Then face yourself in the enchanted forest, surviving illusion trials and revealing your personal Veils.",
    storyArc: "Crossing the Threshold + Story Mode - Episode 3",
    requirements: [
      { type: 'level', value: 1, description: 'Must be Level 1' },
      { type: 'previousChapter', value: 2, description: 'Must complete Chapter 2' }
    ],
    rewards: [
      { type: 'level', value: 2, description: 'Unlock Level 2' },
      { type: 'veil', value: 'confronted', description: 'Veil confronted' },
      { type: 'artifact', value: 'rune_of_clarity', description: 'Rune of Clarity' },
      { type: 'ability', value: 'elemental_move_l1', description: 'Elemental Move Level 1' }
    ],
    challenges: [
      {
        id: 'ch3-solo-trial',
        title: 'Enter the Inmost Cave',
        description: 'Face your greatest fear or internal block in a solo trial',
        type: 'solo',
        requirements: [],
        rewards: [
          { type: 'veil', value: 'confronted', description: 'Veil confronted' }
        ],
        isCompleted: false
      },
      {
        id: 'ep3-illusion-trials',
        title: 'Survive Illusion Trials',
        description: 'Face your deepest fears',
        type: 'personal',
        requirements: [],
        rewards: [
          { type: 'xp', value: 50, description: 'Illusion trial XP' },
          { type: 'pp', value: 25, description: 'Illusion trial PP' }
        ],
        isCompleted: false
      },
      {
        id: 'ep3-veil-revelation',
        title: 'Reveal Personal Veils',
        description: 'Discover your emotional barriers',
        type: 'personal',
        requirements: [],
        rewards: [
          { type: 'xp', value: 25, description: 'Veil revelation XP' },
          { type: 'pp', value: 50, description: 'Veil revelation PP' }
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
    description: "Group reassembles to face a trial that mirrors a core flaw in the team dynamic. Upon surviving, each member receives a Reflection Echo. Then survive waves of illusions and corrupted beasts, fighting corrupted forest creatures and resisting internal corruption.",
    storyArc: "Tests, Allies, Enemies + Story Mode - Episode 4",
    requirements: [
      { type: 'level', value: 2, description: 'Must be Level 2' },
      { type: 'previousChapter', value: 3, description: 'Must complete Chapter 3' }
    ],
    rewards: [
      { type: 'reflection', value: 'echo', description: 'Reflection Echo received' },
      { type: 'level', value: 3, description: 'One member ascends to Level 3' },
      { type: 'ability', value: 'manifest_move_l2', description: 'Manifest Move Level 2' },
      { type: 'artifact', value: 'shield_core', description: 'Vault Materials: Shield Core' }
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
      },
      {
        id: 'ep4-corrupted-beasts',
        title: 'Fight Corrupted Beasts',
        description: 'Fight corrupted forest creatures',
        type: 'personal',
        requirements: [],
        rewards: [
          { type: 'xp', value: 75, description: 'Beast fight XP' },
          { type: 'pp', value: 50, description: 'Beast fight PP' }
        ],
        isCompleted: false
      },
      {
        id: 'ep4-internal-visions',
        title: 'Resist Internal Corruption',
        description: 'Resist internal corruption',
        type: 'personal',
        requirements: [],
        rewards: [
          { type: 'xp', value: 50, description: 'Corruption resistance XP' },
          { type: 'pp', value: 50, description: 'Corruption resistance PP' }
        ],
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
    description: "The world begins reacting to their changes. Players must take leadership roles and hold each other accountable. Then navigate an ever-shifting course that punishes mistimed moves, navigating shifting platforms and facing mirror illusions.",
    storyArc: "The Road Back + Story Mode - Episode 5",
    requirements: [
      { type: 'level', value: 2, description: 'Must be Level 2' },
      { type: 'previousChapter', value: 4, description: 'Must complete Chapter 4' }
    ],
    rewards: [
      { type: 'leadership', value: 'role', description: 'Leadership role' },
      { type: 'xp', value: 200, description: 'Leadership XP' },
      { type: 'artifact', value: 'bond_token', description: 'Bond Token' },
      { type: 'ability', value: 'elemental_move_l2', description: 'Elemental Move Level 2' }
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
    description: "A simulated death sequence where each player faces a version of themselves who never awakened. Must choose to reintegrate or reject aspects of self. Then defend monoliths against summoned constructs, fighting waves of constructs and protecting the ancient monoliths.",
    storyArc: "Resurrection + Story Mode - Episode 6",
    requirements: [
      { type: 'level', value: 2, description: 'Must be Level 2' },
      { type: 'previousChapter', value: 5, description: 'Must complete Chapter 5' }
    ],
    rewards: [
      { type: 'level', value: 3, description: 'Unlock Level 3 abilities' },
      { type: 'manifest', value: 'full', description: 'Full Manifest potential' },
      { type: 'ability', value: 'scout_perk', description: 'System Perk: Scout' },
      { type: 'ability', value: 'action_card_draw_plus_one', description: 'Action Card Draw +1' }
    ],
    challenges: [
      {
        id: 'ch6-death-sequence',
        title: 'Face the Death Sequence',
        description: 'Confront a version of yourself who never awakened',
        type: 'solo',
        requirements: [],
        rewards: [
          { type: 'manifest', value: 'full', description: 'Full Manifest potential' }
        ],
        isCompleted: false
      },
      {
        id: 'ep6-construct-horde',
        title: 'Fight Construct Horde',
        description: 'Fight waves of constructs',
        type: 'personal',
        requirements: [],
        rewards: [
          { type: 'xp', value: 100, description: 'Construct fight XP' },
          { type: 'pp', value: 75, description: 'Construct fight PP' }
        ],
        isCompleted: false
      },
      {
        id: 'ep6-monolith-defense',
        title: 'Protect Ancient Monoliths',
        description: 'Protect the ancient monoliths',
        type: 'personal',
        requirements: [],
        rewards: [
          { type: 'xp', value: 75, description: 'Monolith defense XP' },
          { type: 'pp', value: 75, description: 'Monolith defense PP' }
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
    description: "Players return to Xiotein with new insights and unlock the ability to mentor new initiates. Help guide a new player/team through their first challenge. Then survivors meet the Top 12, learning of higher stakes through intellectual debate and combat precision.",
    storyArc: "Return with the Elixir + Story Mode - Episode 7",
    requirements: [
      { type: 'level', value: 3, description: 'Must be Level 3' },
      { type: 'previousChapter', value: 6, description: 'Must complete Chapter 6' }
    ],
    rewards: [
      { type: 'wisdom', value: 'points', description: 'Wisdom Points' },
      { type: 'blessing', value: 'artifact', description: 'Artifact Blessing' },
      { type: 'ability', value: 'truth_metal_card_slot', description: 'Truth Metal Card Slot' },
      { type: 'artifact', value: 'rare_card_choice', description: 'Rare Card Choice' }
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
      },
      {
        id: 'ep7-debate-challenge',
        title: 'Engage in Intellectual Debate',
        description: 'Engage in intellectual debate',
        type: 'personal',
        requirements: [],
        rewards: [
          { type: 'xp', value: 100, description: 'Debate XP' },
          { type: 'pp', value: 75, description: 'Debate PP' }
        ],
        isCompleted: false
      },
      {
        id: 'ep7-precision-spar',
        title: 'Demonstrate Combat Precision',
        description: 'Demonstrate combat precision',
        type: 'personal',
        requirements: [],
        rewards: [
          { type: 'xp', value: 100, description: 'Precision spar XP' },
          { type: 'pp', value: 100, description: 'Precision spar PP' }
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
    description: "The Ethics manifest as sentient Archetypes. Players must defeat or learn from each, depending on alignment. Then students attend advanced classes as rivalries escalate, participating in advanced training and facing escalating rival challenges.",
    storyArc: "The Final Ordeal + Story Mode - Episode 8",
    requirements: [
      { type: 'level', value: 3, description: 'Must be Level 3' },
      { type: 'previousChapter', value: 7, description: 'Must complete Chapter 7' }
    ],
    rewards: [
      { type: 'ethics', value: 'mastered', description: 'Ethics mastery' },
      { type: 'xp', value: 500, description: 'Ethics completion XP' },
      { type: 'ability', value: 'manifest_move_l3', description: 'Manifest Move Level 3' },
      { type: 'artifact', value: 'firewall_module_v1', description: 'Firewall Module v1' }
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
      },
      {
        id: 'ep8-advanced-classes',
        title: 'Attend Advanced Classes',
        description: 'Participate in advanced training',
        type: 'personal',
        requirements: [],
        rewards: [
          { type: 'xp', value: 125, description: 'Advanced class XP' },
          { type: 'pp', value: 100, description: 'Advanced class PP' }
        ],
        isCompleted: false
      },
      {
        id: 'ep8-rivalry-combat',
        title: 'Face Escalating Rival Challenges',
        description: 'Face escalating rival challenges',
        type: 'personal',
        requirements: [],
        rewards: [
          { type: 'xp', value: 100, description: 'Rivalry combat XP' },
          { type: 'pp', value: 100, description: 'Rivalry combat PP' }
        ],
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
    description: "The Ethics reunite under The Veil King. Victory triggers the emergence of the Ninth Knowing. Then Deklan is tested before the Top 12 as rivals challenge him, requiring strategic thinking and facing the final challenger.",
    storyArc: "The Return + Story Mode - Episode 9",
    requirements: [
      { type: 'level', value: 3, description: 'Must be Level 3' },
      { type: 'previousChapter', value: 8, description: 'Must complete Chapter 8' },
      { type: 'ethics', value: 'all', description: 'Must master all 6 Ethics' }
    ],
    rewards: [
      { type: 'ninth', value: 'knowing', description: 'Ninth Knowing unlocked' },
      { type: 'title', value: 'Master', description: 'Master title' },
      { type: 'ability', value: 'ascension_level_3', description: 'Ascension to Level 3' },
      { type: 'artifact', value: 'rare_artifact_choice', description: 'Rare Artifact Choice' }
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
      },
      {
        id: 'ep9-strategy-test',
        title: 'Demonstrate Strategic Thinking',
        description: 'Demonstrate strategic thinking',
        type: 'personal',
        requirements: [],
        rewards: [
          { type: 'xp', value: 150, description: 'Strategy test XP' },
          { type: 'pp', value: 125, description: 'Strategy test PP' }
        ],
        isCompleted: false
      },
      {
        id: 'ep9-final-duel',
        title: 'Face Final Challenger',
        description: 'Face your final challenger',
        type: 'personal',
        requirements: [],
        rewards: [
          { type: 'xp', value: 150, description: 'Final duel XP' },
          { type: 'pp', value: 125, description: 'Final duel PP' }
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