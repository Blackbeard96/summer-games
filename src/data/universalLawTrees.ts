/**
 * Universal Law Skill Trees
 * 
 * Each Universal Law tree is unlocked by acquiring a specific RR Candy.
 * Trees are gated by Chapter 2-4 completion + RR Candy unlock.
 * 
 * FUTURE NODES:
 * To add more nodes to a tree, add entries to the `nodes` array in the tree definition.
 * Each node should have:
 * - unique nodeId (e.g., "vibration_node_02")
 * - skillId referencing a skill in universalLawSkills
 * - position: {col, row} for layout
 * - requiresNodeIds: array of nodeIds that must be learned first
 */

export type UniversalLawId = "divine_oneness" | "vibration" | "attraction" | "rhythm";
export type RRCandyType = "config" | "on_off" | "up_down";

export interface UniversalLawTreeDef {
  id: UniversalLawId;
  title: string;
  subtitle: string;
  description: string;
  rrCandyRequired?: RRCandyType; // undefined for divine_oneness (locked)
  availableAfterChapter?: "2-4";
  nodes: Array<{
    nodeId: string;
    skillId: string;
    position: { col: number; row: number };
    requiresNodeIds: string[];
  }>;
}

export interface UniversalLawSkillDefinition {
  id: string;
  name: string;
  icon: { type: "emoji" | "componentKey"; value: string };
  lawId: UniversalLawId;
  inGame: {
    summary: string;
    effectKey: string; // For battle engine integration
    params?: Record<string, any>;
  };
  irl: {
    summary: string;
    exampleUse: string;
  };
}

// ============================================================================
// SKILL DEFINITIONS
// ============================================================================

export const UNIVERSAL_LAW_SKILLS: Record<string, UniversalLawSkillDefinition> = {
  // Vibration (Config)
  "vibration_evasive_calibration": {
    id: "vibration_evasive_calibration",
    name: "Config: Evasive Calibration",
    icon: { type: "emoji", value: "⚡" },
    lawId: "vibration",
    inGame: {
      summary: "Automatically dodge the next attack that would damage shields or health.",
      effectKey: "AUTO_DODGE_NEXT_DAMAGE",
      params: {
        charges: 1,
        cooldown: 3 // turns
      }
    },
    irl: {
      summary: "Recognize when to step back and avoid negative energy or situations that drain you.",
      exampleUse: "When you feel overwhelmed by a task, take a moment to recalibrate your approach before diving in."
    }
  },
  
  // Attraction (On/Off)
  "attraction_priority_pull": {
    id: "attraction_priority_pull",
    name: "Attraction: Priority Pull",
    icon: { type: "emoji", value: "🧲" },
    lawId: "attraction",
    inGame: {
      summary: "Use 2 skills in a row without allowing enemies to act in between.",
      effectKey: "EXTRA_SKILL_CAST",
      params: {
        extraCasts: 1,
        duration: 1 // turn
      }
    },
    irl: {
      summary: "Focus your energy to accomplish multiple related tasks in sequence, building momentum.",
      exampleUse: "When working on a project, complete two related steps back-to-back to maintain flow and avoid interruptions."
    }
  },
  
  // Rhythm (Up/Down)
  "rhythm_stat_lift": {
    id: "rhythm_stat_lift",
    name: "Rhythm: Stat Lift",
    icon: { type: "emoji", value: "📈" },
    lawId: "rhythm",
    inGame: {
      summary: "Increase the power of any skill you choose (damage, healing, or shield boost).",
      effectKey: "BOOST_SELECTED_SKILL_POWER",
      params: {
        multiplier: 1.5, // 50% boost
        duration: 1 // turn
      }
    },
    irl: {
      summary: "Enhance your existing skills and habits by applying focused effort at the right moment.",
      exampleUse: "Before an important presentation, spend extra time practicing your key points to amplify their impact."
    }
  }
};

// ============================================================================
// TREE DEFINITIONS
// ============================================================================

export const UNIVERSAL_LAW_TREES: Record<UniversalLawId, UniversalLawTreeDef> = {
  divine_oneness: {
    id: "divine_oneness",
    title: "Law of Divine Oneness",
    subtitle: "Shares results",
    description: "The understanding that all things are connected and that your actions affect the whole.",
    // No RR Candy required - locked for future content
    nodes: []
  },
  
  vibration: {
    id: "vibration",
    title: "Law of Vibration",
    subtitle: "Increase/decrease vibrations based on participation",
    description: "Everything in the universe vibrates at a specific frequency. You can raise or lower your vibration through your actions and choices.",
    rrCandyRequired: "config",
    availableAfterChapter: "2-4",
    nodes: [
      {
        nodeId: "vibration_node_01",
        skillId: "vibration_evasive_calibration",
        position: { col: 0, row: 0 }, // Centered for single node
        requiresNodeIds: []
      }
    ]
  },
  
  attraction: {
    id: "attraction",
    title: "Law of Attraction",
    subtitle: "Gain priority by attracting results",
    description: "Like attracts like. By focusing on positive outcomes, you draw them toward you.",
    rrCandyRequired: "on_off",
    availableAfterChapter: "2-4",
    nodes: [
      {
        nodeId: "attraction_node_01",
        skillId: "attraction_priority_pull",
        position: { col: 0, row: 0 }, // Centered for single node
        requiresNodeIds: []
      }
    ]
  },
  
  rhythm: {
    id: "rhythm",
    title: "Law of Rhythm",
    subtitle: "Build momentum controlling flow",
    description: "Everything flows in cycles. Understanding these rhythms helps you time your actions for maximum impact.",
    rrCandyRequired: "up_down",
    availableAfterChapter: "2-4",
    nodes: [
      {
        nodeId: "rhythm_node_01",
        skillId: "rhythm_stat_lift",
        position: { col: 0, row: 0 }, // Centered for single node
        requiresNodeIds: []
      }
    ]
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getLawTreeById(lawId: UniversalLawId): UniversalLawTreeDef {
  return UNIVERSAL_LAW_TREES[lawId];
}

export function getAllLawTrees(): UniversalLawTreeDef[] {
  return Object.values(UNIVERSAL_LAW_TREES);
}

export function getSkillById(skillId: string): UniversalLawSkillDefinition | undefined {
  return UNIVERSAL_LAW_SKILLS[skillId];
}

export function getSkillsByLawId(lawId: UniversalLawId): UniversalLawSkillDefinition[] {
  return Object.values(UNIVERSAL_LAW_SKILLS).filter(skill => skill.lawId === lawId);
}

export function getNodeByNodeId(nodeId: string): { tree: UniversalLawTreeDef; node: UniversalLawTreeDef['nodes'][0] } | null {
  for (const tree of Object.values(UNIVERSAL_LAW_TREES)) {
    const node = tree.nodes.find(n => n.nodeId === nodeId);
    if (node) {
      return { tree, node };
    }
  }
  return null;
}

