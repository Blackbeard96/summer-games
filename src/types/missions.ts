/**
 * Mission System Types
 * 
 * Story Missions integrate with Home Hub NPCs and Player Journey tab
 */

export type MissionCategory = 'SIDE' | 'STORY';
export type DeliveryChannel = 'HUB_NPC' | 'PLAYER_JOURNEY';
export type MissionStatus = 'available' | 'active' | 'completed' | 'locked';
export type MissionSource = 'HUB_NPC' | 'PLAYER_JOURNEY';

export interface StoryMetadata {
  chapterId: string;           // e.g. "chapter_1", "chapter_2"
  order: number;               // order within chapter (1..n)
  required: boolean;           // default true for STORY
  prerequisites?: string[];    // optional missionIds required first
}

export interface MissionGating {
  minPlayerLevel?: number;
  requiresChapterUnlocked?: boolean;
  chapterId?: string;         // chapter that must be unlocked
}

export interface PlayerJourneyLink {
  chapterId: number;         // Chapter ID (e.g., 1, 2)
  challengeId: string;       // Challenge ID (e.g., "ep1-get-letter", "ch2-team-formation")
}

export interface MissionTemplate {
  id: string;
  title: string;
  description: string;
  npc?: string;               // "sonido" | "zeke" | "luz" | "kon" | undefined
  missionCategory: MissionCategory;  // "SIDE" | "STORY"
  deliveryChannels: DeliveryChannel[]; // ["HUB_NPC"] | ["PLAYER_JOURNEY"] | both
  story?: StoryMetadata;      // only for STORY missions
  playerJourneyLink?: PlayerJourneyLink; // Link to Player Journey step
  gating?: MissionGating;
  rewards?: {
    xp?: number;
    pp?: number;
    items?: string[];
    moves?: string[];
  };
  objectives?: {
    type: string;
    description: string;
    target?: number;
  }[];
  sequence?: MissionSequenceStep[];  // Optional sequence of steps
  sequenceVersion?: number;           // Version counter for sequence edits
  createdAt?: any;
  updatedAt?: any;
}

export interface PlayerMission {
  id: string;
  userId: string;
  missionId: string;          // reference to MissionTemplate.id
  status: MissionStatus;
  source: MissionSource;      // where it was accepted from
  acceptedAt: any;
  completedAt?: any;
  progress?: {
    [objectiveId: string]: number;
  };
}

export interface PlayerStoryProgress {
  userId: string;
  currentChapterId: string;   // e.g. "chapter_1"
  unlockedChapterIds: string[];
  updatedAt: any;
}

// Mission Sequence Step Types
export type MissionSequenceStep =
  | {
      id: string;                 // uuid
      type: "STORY_SLIDE";
      order: number;              // computed at save, but store for safety
      title?: string;             // optional per slide
      bodyText: string;           // caption text under image
      image: {
        storagePath?: string;     // gs:// path if uploaded
        url: string;              // public/download URL
        width?: number;
        height?: number;
        alt?: string;
      };
    }
  | {
      id: string;
      type: "VIDEO";
      order: number;
      title?: string;
      video: {
        sourceType: "URL" | "UPLOAD";
        url: string;              // direct mp4 url OR storage download URL
        storagePath?: string;     // if uploaded
        posterUrl?: string;       // optional
        autoplay?: boolean;       // default false
        muted?: boolean;          // default false
        controls?: boolean;       // default true
      };
      bodyText?: string;          // optional description under video
    }
  | {
      id: string;
      type: "BATTLE";
      order: number;
      title?: string;
      battle: {
        mode: "ISLAND_RAID";      // reserved for future modes
        difficulty: "EASY" | "MEDIUM" | "HARD" | "BOSS";
        /** Legacy: used when waveConfigs is absent. */
        enemySet: ("ZOMBIE" | "APPRENTICE" | "SOVEREIGN" | "UNVEILED")[];
        waves?: number;           // default 3
        maxEnemiesPerWave?: number;
        /** Per-wave config. opponentIds = CPU Opponents List ids; when set, used instead of enemySet for that wave. */
        waveConfigs?: {
          enemySet: ("ZOMBIE" | "APPRENTICE" | "SOVEREIGN" | "UNVEILED")[];
          opponentIds?: string[];  // IDs from CPU Opponent Moves Admin (e.g. 'cpu-easy-1', 'powered-zombie')
        }[];
        rewards: {
          xp: number;
          pp: number;
          drops?: Array<{ type: "ARTIFACT" | "STS_SHARD" | "ITEM"; refId?: string; qty?: number }>;
        };
        battleConfigRef?: string; // optional pointer to an existing config doc
      };
      bodyText?: string;          // optional briefing text
    };

