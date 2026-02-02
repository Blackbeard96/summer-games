/**
 * Phase Presets for Test Accounts
 * 
 * Each preset defines a complete game state snapshot that can be applied
 * to create or reset a test account to a specific phase of gameplay.
 */

export interface PhasePreset {
  label: string;
  player: {
    level: number;
    xp: number;
    pp: number; // Power Points
  };
  chapters: {
    current: string; // e.g., "1-1", "2-1", "3-2"
    completed: string[]; // Array of completed challenge IDs
    activeChapters?: number[]; // Chapters that should be marked as active
  };
  unlocks: {
    marketplace?: boolean;
    battleArena?: boolean;
    raids?: boolean;
    artifacts?: boolean;
  };
  manifest?: {
    type?: string; // e.g., "reading", "writing", "math"
    element?: string; // e.g., "Fire", "Earth", "Water"
    rarity?: number;
  };
  inventory?: {
    artifacts?: string[]; // Array of artifact IDs
  };
  flags?: {
    [key: string]: any; // Additional flags for game features
  };
}

export const TEST_PHASE_PRESETS: Record<string, PhasePreset> = {
  phase_1_new: {
    label: "Phase 1 — New Player",
    player: {
      level: 1,
      xp: 0,
      pp: 0,
    },
    chapters: {
      current: "1-1",
      completed: [],
      activeChapters: [1],
    },
    unlocks: {
      marketplace: false,
      battleArena: false,
      raids: false,
      artifacts: false,
    },
    manifest: undefined,
    inventory: {
      artifacts: [],
    },
    flags: {},
  },
  phase_2_progressing: {
    label: "Phase 2 — Progressing",
    player: {
      level: 5,
      xp: 250,
      pp: 500,
    },
    chapters: {
      current: "2-1",
      completed: ["ep1-truth-metal-choice", "ep1-touch-truth-metal", "ep1-view-mst-ui", "ep1-power-card-intro"],
      activeChapters: [1, 2],
    },
    unlocks: {
      marketplace: true,
      battleArena: true,
      raids: false,
      artifacts: true,
    },
    manifest: {
      type: "reading",
      element: "Fire",
      rarity: 1,
    },
    inventory: {
      artifacts: [],
    },
    flags: {},
  },
  phase_3_midgame: {
    label: "Phase 3 — Midgame",
    player: {
      level: 12,
      xp: 1800,
      pp: 2500,
    },
    chapters: {
      current: "3-2",
      completed: [
        "ep1-truth-metal-choice",
        "ep1-touch-truth-metal",
        "ep1-view-mst-ui",
        "ep1-power-card-intro",
        "ep1-combat-drill",
        "ep1-update-profile",
        "ch2-team-formation",
        "ch2-rival-selection",
        "ch3-challenge-1",
      ],
      activeChapters: [1, 2, 3],
    },
    unlocks: {
      marketplace: true,
      battleArena: true,
      raids: true,
      artifacts: true,
    },
    manifest: {
      type: "reading",
      element: "Fire",
      rarity: 2,
    },
    inventory: {
      artifacts: ["artifact-1", "artifact-2"],
    },
    flags: {},
  },
  phase_4_endgame: {
    label: "Phase 4 — Late/Endgame",
    player: {
      level: 20,
      xp: 9000,
      pp: 9000,
    },
    chapters: {
      current: "5-1",
      completed: [
        "ep1-truth-metal-choice",
        "ep1-touch-truth-metal",
        "ep1-view-mst-ui",
        "ep1-power-card-intro",
        "ep1-combat-drill",
        "ep1-update-profile",
        "ch2-team-formation",
        "ch2-rival-selection",
        "ch3-challenge-1",
        "ch3-challenge-2",
        "ch4-challenge-1",
        "ch4-challenge-2",
      ],
      activeChapters: [1, 2, 3, 4, 5],
    },
    unlocks: {
      marketplace: true,
      battleArena: true,
      raids: true,
      artifacts: true,
    },
    manifest: {
      type: "reading",
      element: "Fire",
      rarity: 3,
    },
    inventory: {
      artifacts: ["artifact-1", "artifact-2", "artifact-3", "artifact-4"],
    },
    flags: {},
  },
};

/**
 * Get preset by key
 */
export function getPreset(phaseKey: string): PhasePreset | undefined {
  return TEST_PHASE_PRESETS[phaseKey];
}

/**
 * Get all preset keys
 */
export function getPresetKeys(): string[] {
  return Object.keys(TEST_PHASE_PRESETS);
}

/**
 * Get all presets
 */
export function getAllPresets(): Record<string, PhasePreset> {
  return TEST_PHASE_PRESETS;
}


