import type { BattlePassReward, BattlePassTierRewardEntry } from './season1';
import type { MissionBattleCoopConfig } from './coopBattle';

/**
 * Mission System Types
 * 
 * Story Missions integrate with Home Hub NPCs and Player Journey tab.
 * Sovereign Missions are optional hub lore for Home Page heroes in The Sovereign (background, not main story).
 * Profile Missions add information directly into the Player's Journey on their Power Card.
 * Demo Missions showcase what the MST Game can do — for demos, onboarding tours, and feature previews.
 * 
 * Extended for universal Challenge/Feat system (Ghost of Tsushima-style):
 * Event-driven missions can trigger from practice battles, skills, Mindforge, etc.
 */

export type MissionCategory = 'SIDE' | 'STORY' | 'PROFILE' | 'SOVEREIGN' | 'DEMO';

/**
 * UI / filter alias for Player's Journey vs Side vs Demo missions.
 * Maps onto existing MissionCategory: journey → STORY (+ PLAYER_JOURNEY), side → SIDE, demo → DEMO.
 */
export type MissionCategoryAlias = 'journey' | 'side' | 'demo';

/** Journey-specific interactive type (STORY missions in Mission Admin). */
export type JourneyMissionType =
  | 'story'
  | 'reflection'
  | 'choice'
  | 'battle'
  | 'tutorial'
  | 'submission'
  | 'element-selection'
  | 'manifest-selection';

export const JOURNEY_MISSION_TYPES: JourneyMissionType[] = [
  'story',
  'reflection',
  'choice',
  'battle',
  'tutorial',
  'submission',
  'element-selection',
  'manifest-selection',
];

/** Maps Firestore `missionCategory` to `MissionCategory` (accepts legacy typo `SOVERIGN`). */
export function normalizeMissionCategory(raw: unknown): MissionCategory {
  if (raw === 'SOVERIGN') return 'SOVEREIGN';
  if (
    raw === 'SIDE' ||
    raw === 'STORY' ||
    raw === 'PROFILE' ||
    raw === 'SOVEREIGN' ||
    raw === 'DEMO'
  ) {
    return raw;
  }
  // Accept friendly aliases from Mission Admin filters
  if (raw === 'journey') return 'STORY';
  if (raw === 'side') return 'SIDE';
  if (raw === 'demo') return 'DEMO';
  return 'SIDE';
}

export function isJourneyMissionCategory(category: MissionCategory): boolean {
  return category === 'STORY';
}

export function isDemoMissionCategory(category: MissionCategory): boolean {
  return category === 'DEMO';
}

export function missionCategoryToAlias(category: MissionCategory): MissionCategoryAlias | null {
  if (category === 'STORY') return 'journey';
  if (category === 'SIDE') return 'side';
  if (category === 'DEMO') return 'demo';
  return null;
}

export type DeliveryChannel = 'HUB_NPC' | 'PLAYER_JOURNEY';
export type MissionStatus = 'available' | 'active' | 'completed' | 'locked';
export type MissionSource = 'HUB_NPC' | 'PLAYER_JOURNEY';

/** Mission type for challenge/feat system - defines overall category */
export type MissionType =
  | 'journey'
  | 'home'
  | 'practice'
  | 'battle'
  | 'skill'
  | 'mindforge'
  | 'feat'
  | 'daily'
  | 'weekly'
  | 'special';

/** Event that increments mission progress */
export type MissionTriggerType =
  | 'practice_battle_completed'
  | 'enemy_defeated'
  | 'practice_difficulty_cleared'
  | 'battle_won'
  | 'skill_used'
  | 'specific_skill_used'
  | 'manifest_skill_used'
  | 'elemental_skill_used'
  | 'artifact_equipped'
  | 'home_action_completed'
  | 'mindforge_action_completed'
  | 'pp_earned'
  | 'xp_earned'
  | 'truth_metal_earned'
  | 'login'
  | 'streak'
  | 'custom_event';

/** How progress is calculated */
export type MissionProgressType = 'count' | 'boolean' | 'cumulative_value' | 'unique_targets';

/** Source area where mission applies */
export type MissionSourceArea =
  | 'home'
  | 'practice'
  | 'mindforge'
  | 'battle_arena'
  | 'player_journey'
  | 'global';

/** Difficulty tier for display */
export type MissionDifficultyTier = 'easy' | 'medium' | 'hard' | 'legendary';

/** Repeat interval for repeatable missions */
export type MissionRepeatInterval = 'daily' | 'weekly' | 'none';

export interface StoryMetadata {
  chapterId: string;           // e.g. "chapter_1", "chapter_2"
  order: number;               // order within chapter (1..n)
  required: boolean;           // default true for STORY
  prerequisites?: string[];    // optional missionIds required first
}

/** Journey stage IDs shown in the Player's Journey on the Power Card (Profile) */
export type ProfileJourneyStageId =
  | 'ordinary-world'
  | 'call-to-adventure'
  | 'meeting-mentor'
  | 'tests-allies-enemies'
  | 'approaching-cave'
  | 'ordeal'
  | 'road-back'
  | 'resurrection';

export interface ProfileMetadata {
  journeyStageId: ProfileJourneyStageId;  // which stage this mission adds content to
  order?: number;                         // order when multiple Profile missions target the same stage (1..n)
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
  /** Short blurb for Journey cards (falls back to description). */
  shortDescription?: string;
  /** Longer story / full description for modals. */
  fullDescription?: string;
  lesson?: string;
  storyText?: string;
  npc?: string;               // "sonido" | "zeke" | "luz" | "kon" | undefined
  missionCategory: MissionCategory;  // "SIDE" | "STORY" | "PROFILE" | "SOVEREIGN" | "DEMO"
  deliveryChannels: DeliveryChannel[]; // ["HUB_NPC"] | ["PLAYER_JOURNEY"] | both
  story?: StoryMetadata;      // only for STORY missions
  profile?: ProfileMetadata;  // only for PROFILE missions — which journey stage to add content to
  playerJourneyLink?: PlayerJourneyLink; // Link to Player Journey step
  /** Journey interactive type (STORY / Player's Journey missions). */
  journeyMissionType?: JourneyMissionType;
  /** Chapter number for Journey listing (mirrors story.chapterId when numeric). */
  chapterNumber?: number;
  missionNumber?: number;
  xpReward?: number;
  ppReward?: number;
  prerequisiteMissionIds?: string[];
  unlocksMissionIds?: string[];
  battleConfigId?: string;
  /** Preview thumbnail for Journey cards / Mission Admin. */
  previewImageUrl?: string;
  previewImageStoragePath?: string;
  /** Larger image for mission modal / story. */
  modalImageUrl?: string;
  modalImageStoragePath?: string;
  /** When false, treated as draft. Existing missions without the field are treated as published. */
  isPublished?: boolean;
  /** Explicit sort order within chapter (falls back to story.order). */
  sortOrder?: number;
  gating?: MissionGating;
  rewards?: {
    /** Battle Pass–style list: fixed rewards + optional choice groups (same shape as season tier rewards). */
    entries?: BattlePassTierRewardEntry[];
    xp?: number;
    pp?: number;
    truthMetal?: number;
    artifactIds?: string[];
    items?: string[];
    moves?: string[];
    /** Challenge-style ability unlock IDs (stored on user/student challengeAbilityGrants). */
    abilities?: string[];
  };
  objectives?: {
    type: string;
    description: string;
    target?: number;
  }[];
  sequence?: MissionSequenceStep[];  // Optional sequence of steps
  sequenceVersion?: number;           // Version counter for sequence edits
  /** Lower numbers appear first in NPC hub Side / Sovereign lists; omit for automatic order (oldest created first). */
  hubDisplayOrder?: number;
  createdAt?: any;
  updatedAt?: any;

  // --- Challenge/Feat extension (event-driven missions) ---
  missionType?: MissionType;
  triggerType?: MissionTriggerType;
  progressType?: MissionProgressType;
  targetValue?: number;
  sourceArea?: MissionSourceArea;
  difficultyTier?: MissionDifficultyTier;
  isRepeatable?: boolean;
  repeatInterval?: MissionRepeatInterval;
  isHidden?: boolean;
  metadata?: Record<string, unknown>;  // custom rules, e.g. { skillType: 'manifest', opponentId: 'cpu-master-guardian' }
}

/** Serialized choice group on player mission after completion (until player claims). */
export interface MissionRewardChoicePendingGroup {
  groupId: string;
  pickCount: number;
  displayName?: string;
  description: string;
  options: BattlePassReward[];
}

export interface MissionRewardChoicesPendingState {
  groups: MissionRewardChoicePendingGroup[];
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
    [objectiveId: string]: number;  // objectiveId or 'main' for event-driven progress
  };
  /** Dotted keys in Firestore: `sequenceStepCompletion.{stepId}` — merged at runtime */
  sequenceStepCompletion?: Record<
    string,
    {
      completedAt?: unknown;
      skillId?: string;
      manifestId?: string;
      /** Element awakened on an ELEMENTAL_SKILLS step (fire/water/earth/air). */
      element?: string;
      /** PP from a SKILLS_MASTERY / ARTIFACTS / POWER_CARD step (idempotent grant). */
      ppGranted?: number;
      visited?: boolean;
    }
  >;
  /**
   * Saved step index (0-based) while a sequenced mission is active — used so leaving the runner
   * (e.g. optional slide redirect) can resume on the correct step.
   */
  sequencePlayheadIndex?: number;
  /** For event-driven missions: auto-accepted when first event matches */
  autoAccepted?: boolean;
  /** Player must pick rewards (Battle Pass–style choice groups) before this is cleared. */
  missionRewardChoicesPending?: MissionRewardChoicesPendingState;
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
      /** After Continue, open this in-app route (allowlisted). Optional. */
      navigateTo?: string;
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
      /** After Continue, open this in-app route (allowlisted). Optional. */
      navigateTo?: string;
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
        enemySet: ("ZOMBIE" | "APPRENTICE" | "SOVEREIGN" | "UNVEILED" | "AHINTA_TUMI")[];
        waves?: number;           // default 3
        maxEnemiesPerWave?: number;
        /** Per-wave config. opponentIds = CPU Opponents List ids; when set, used instead of enemySet for that wave. */
        waveConfigs?: {
          enemySet: ("ZOMBIE" | "APPRENTICE" | "SOVEREIGN" | "UNVEILED" | "AHINTA_TUMI")[];
          /** How many of each legacy type to spawn (default 1 per type in enemySet if omitted). */
          enemyTypeCounts?: Partial<Record<'ZOMBIE' | 'APPRENTICE' | 'SOVEREIGN' | 'UNVEILED' | 'AHINTA_TUMI', number>>;
          opponentIds?: string[];  // IDs from CPU Opponent Moves Admin (e.g. 'cpu-easy-1', 'powered-zombie')
          /** Spawn count per CPU opponent id (default 1 if id listed but omitted). */
          opponentCounts?: Record<string, number>;
        }[];
        rewards: {
          xp: number;
          pp: number;
          drops?: Array<{ type: "ARTIFACT" | "STS_SHARD" | "ITEM"; refId?: string; qty?: number }>;
        };
        battleConfigRef?: string; // optional pointer to an existing config doc
        /**
         * Optional arena backdrop for this mission battle (URL and/or Storage path).
         * When set, MissionRunner writes it onto the islandRaidBattleRooms doc and BattleEngine uses it.
         */
        backgroundImage?: {
          url: string;
          storagePath?: string;
          alt?: string;
        };
        /**
         * Mid-battle join / NPC allies (optional). When `allowPlayerJoinMidBattle` is true, MissionRunner
         * writes `joinableMidBattle` + `requireExplicitJoin` on `islandRaidBattleRooms` for this step.
         */
        coop?: MissionBattleCoopConfig;
      };
      bodyText?: string;          // optional briefing text
    }
  | {
      id: string;
      type: 'TRAINING_ASSIGNMENT';
      order: number;
      title?: string;
      bodyText?: string;
      training: {
        /** Firestore `trainingQuizSets` document id */
        quizSetId: string;
        /** Player must score at least this percent on a completed solo attempt to unlock Next (0 = any completed attempt). */
        minimumPassPercent: number;
      };
    }
  | {
      id: string;
      type: 'REFLECTION';
      order: number;
      title?: string;
      /** Shown above the reflection prompt */
      bodyText?: string;
      /** Main question / prompt for the player */
      prompt: string;
      textareaPlaceholder?: string;
      /**
       * Optional `assessments/{id}` link. When set, saves into Assessment Goals like the Set Goal flow:
       * - `habits`: habit text, duration, Area of Consistency (+ optional extra reflection → evidence).
       * - `story-goal`: goal text + optional evidence (+ optional extra reflection).
       * - Other types: response text merged into goal evidence when a goal doc exists.
       */
      linkedAssessmentId?: string;
      /** When true, Next is disabled until the player enters non-whitespace text (default true). */
      requireResponse?: boolean;
    }
  | {
      id: string;
      type: 'LEVEL2_MANIFEST';
      order: number;
      title?: string;
      /** Instructions shown above Sonido dialogue */
      description?: string;
      /** Mentor voice — Sonido / Meta State framing */
      sonidoDialogue?: string;
      /** If true, player must have unlocked the L2 builder (Flow first or prior unlock) before continuing. */
      requireMetaStateFirst?: boolean;
      /** When true, grant builder access when this step is shown (for guided rollout / testing). */
      autoUnlockBuilderOnEntry?: boolean;
      /** Require saving a Level 2 skill from the builder to complete the step. */
      requireSkillCreation?: boolean;
      /** Require active skill to match the one created in this mission (v1: any saved skill counts if only one). */
      requireSkillEquip?: boolean;
    }
  | {
      id: string;
      type: 'CHOICE';
      order: number;
      title?: string;
      /** Optional intro above the prompt */
      bodyText?: string;
      /** Question / decision prompt shown to the player */
      prompt: string;
      /** At least two options; each has its own result after selection */
      choices: MissionChoiceOption[];
    }
  | {
      id: string;
      type: 'CHOOSE_MANIFEST';
      order: number;
      title?: string;
      /** Intro copy above the picker CTA */
      bodyText?: string;
      /** Short prompt under the title (optional) */
      prompt?: string;
      /**
       * When true (default), Next is blocked until the player confirms a manifest
       * in this step (tracked via sequenceStepCompletion).
       */
      requireSelection?: boolean;
      /**
       * When true (default), players who already finished this step can reopen the picker.
       * Useful for Demo Missions showcasing the Choose Manifest experience.
       */
      allowReselect?: boolean;
    }
  | {
      id: string;
      type: 'SKILLS_MASTERY';
      order: number;
      title?: string;
      /**
       * Instructional captions shown on the step (admin can add multiple).
       * Rendered in order above the Open Skills & Mastery CTA.
       */
      captions: string[];
      /** Power Points granted once when the player opens Skills & Mastery (0 = no grant). */
      grantPP: number;
      /**
       * When true (default), Next is blocked until the player has opened Skills & Mastery
       * at least once for this step (sequenceStepCompletion).
       */
      requireVisit?: boolean;
    }
  | {
      id: string;
      type: 'ARTIFACTS';
      order: number;
      title?: string;
      /**
       * Instructional captions shown on the step (admin can add multiple).
       * Rendered in order above the Open Artifacts CTA.
       */
      captions: string[];
      /** Power Points granted once when the player opens Artifacts (0 = no grant). */
      grantPP: number;
      /**
       * When true (default), Next is blocked until the player has opened Artifacts
       * at least once for this step (sequenceStepCompletion).
       */
      requireVisit?: boolean;
    }
  | {
      id: string;
      type: 'ELEMENTAL_SKILLS';
      order: number;
      title?: string;
      /** Intro copy above the element picker */
      bodyText?: string;
      /** Prompt shown above Fire / Water / Earth / Air (optional) */
      prompt?: string;
      /**
       * When true (default), Next is blocked until the player awakens an Element
       * (or confirms an already-awakened Element) for this step.
       */
      requireSelection?: boolean;
      /**
       * When true, players who finished this step can change Element again
       * (calls selectPlayerElement with allowOverwrite). Default false — affinity is sticky.
       */
      allowReselect?: boolean;
    }
  | {
      id: string;
      type: 'POWER_CARD';
      order: number;
      title?: string;
      /**
       * Instructional captions shown on the step (admin can add multiple).
       * Rendered in order above the Open Power Card CTA.
       */
      captions: string[];
      /** Power Points granted once when the player opens Power Card / Profile (0 = no grant). */
      grantPP: number;
      /**
       * When true (default), Next is blocked until the player has opened Power Card
       * at least once for this step (sequenceStepCompletion).
       */
      requireVisit?: boolean;
    };

/** One selectable branch on a CHOICE mission step. */
export interface MissionChoiceOption {
  id: string;
  /** Button / option label */
  label: string;
  /** Short hint under the label (optional) */
  description?: string;
  /** Distinct outcome shown after this option is picked */
  result: {
    title?: string;
    bodyText: string;
    /** Public download URL (upload or pasted link) */
    imageUrl?: string;
    /** Firebase Storage path when uploaded via Mission Control */
    imageStoragePath?: string;
    /**
     * Artifact catalog ids to grant when the player confirms this choice
     * (Continue / Next after the result). Empty / omitted = no grant.
     */
    grantArtifactIds?: string[];
  };
  /**
   * After the player acknowledges the result, jump to this step id.
   * Omit to continue with the next step in sequence order.
   */
  goToStepId?: string;
}

/** Story slide + video steps only — used for battle pass season intro (same shape as mission sequence). */
export type BattlePassIntroStep = Extract<
  MissionSequenceStep,
  { type: 'STORY_SLIDE' } | { type: 'VIDEO' }
>;

/** Same as {@link BattlePassIntroStep} — mission-style slides/videos for CPU awakening cutscenes. */
export type MissionMediaSequenceStep = BattlePassIntroStep;

/** Keep only slide/video steps from admin or Firestore JSON (ignores invalid entries). */
export function filterCpuAwakeningAnimationSteps(raw: unknown): MissionMediaSequenceStep[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is MissionMediaSequenceStep => {
    if (!s || typeof s !== 'object') return false;
    const typeRaw = (s as { type?: unknown }).type;
    const t = typeof typeRaw === 'string' ? typeRaw.trim().toUpperCase() : '';
    return t === 'STORY_SLIDE' || t === 'VIDEO';
  });
}

