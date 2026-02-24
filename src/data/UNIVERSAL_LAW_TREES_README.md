# Universal Law Skill Trees - Developer Guide

## Overview

The Universal Law Skill Tree system replaces the old Manifest/Elemental/System branches with a new structure tied to Universal Laws and RR Candy unlocks.

## Architecture

### Data Definitions
- **Location**: `src/data/universalLawTrees.ts`
- **Tree Definitions**: `UNIVERSAL_LAW_TREES` - Maps law IDs to tree configurations
- **Skill Definitions**: `UNIVERSAL_LAW_SKILLS` - Maps skill IDs to skill data

### Player State
- **Firestore Path**: `players/{userId}/skill_state/main`
- **Field**: `learnedNodeIds: string[]` - Array of learned Universal Law node IDs
- **Service**: `src/utils/skillStateService.ts` - `getLearnedNodeIds()`, `learnUniversalLawNode()`

### Gating Logic
- **Location**: `src/utils/universalLawGating.ts`
- **Functions**: `getLawTreeAccess()`, `getAllLawTreeAccess()`, `canLearnNode()`
- **Gating Rules**:
  - Divine Oneness: Always locked (future content)
  - Vibration: Requires Chapter 2-4 completed + Config RR Candy
  - Attraction: Requires Chapter 2-4 completed + On/Off RR Candy
  - Rhythm: Requires Chapter 2-4 completed + Up/Down RR Candy

## Adding New Nodes

To add more nodes to an existing Universal Law tree:

1. **Add Skill Definition** in `src/data/universalLawTrees.ts`:
```typescript
export const UNIVERSAL_LAW_SKILLS: Record<string, UniversalLawSkillDefinition> = {
  // ... existing skills
  "vibration_new_skill": {
    id: "vibration_new_skill",
    name: "New Skill Name",
    icon: { type: "emoji", value: "✨" },
    lawId: "vibration",
    inGame: {
      summary: "Skill description",
      effectKey: "EFFECT_KEY_NAME",
      params: { /* effect parameters */ }
    },
    irl: {
      summary: "Real-world application",
      exampleUse: "Example usage"
    }
  }
};
```

2. **Add Node to Tree** in `UNIVERSAL_LAW_TREES`:
```typescript
vibration: {
  // ... existing tree config
  nodes: [
    // ... existing nodes
    {
      nodeId: "vibration_node_02", // Increment number
      skillId: "vibration_new_skill",
      position: { col: 1, row: 0 }, // Adjust for layout
      requiresNodeIds: ["vibration_node_01"] // Dependencies
    }
  ]
}
```

3. **Update UI Layout** if needed:
   - Node positions use `{col, row}` coordinates
   - For v1, nodes are centered; future versions can use grid layout
   - Update `UniversalLawSkillTreePage.tsx` if layout changes needed

## Battle Integration

### Effect Keys

Each skill has an `effectKey` that the battle engine can interpret:

- **`AUTO_DODGE_NEXT_DAMAGE`** (Config: Evasive Calibration)
  - Effect: Player automatically dodges the next attack
  - Params: `{ charges: 1, cooldown: 3 }`

- **`EXTRA_SKILL_CAST`** (Attraction: Priority Pull)
  - Effect: Player can use 2 skills in a row
  - Params: `{ extraCasts: 1, duration: 1 }`

- **`BOOST_SELECTED_SKILL_POWER`** (Rhythm: Stat Lift)
  - Effect: Increases power of selected skill
  - Params: `{ multiplier: 1.5, duration: 1 }`

### Implementation Status

**Current**: Effect keys are defined but not yet wired into battle engine.

**To Wire Effects**:
1. Check if player has learned node: `learnedNodeIds.includes(nodeId)`
2. Get skill definition: `getSkillById(skillId)` from `universalLawTrees.ts`
3. Read `effectKey` and `params` from skill definition
4. Apply effect in battle engine (damage calculation, turn order, etc.)

**Battle Arena Integration**:
- Learned skills should appear in "available skills" list for loadout selection
- Check `learnedNodeIds` to determine which Universal Law skills are available
- Skills are learned in Profile, equipped/upgraded in Battle Arena (as per requirements)

## UI Components

- **Main Component**: `src/components/skillTree/UniversalLawSkillTreePage.tsx`
  - Left: Law selector (tabs)
  - Middle: Node cluster (diamond nodes)
  - Right: Detail panel with "Hold to Learn" button

- **Reused Components**:
  - `HoldToUnlockButton` - Hold-to-confirm unlock interaction

## Testing Checklist

- [ ] Profile shows 4 Universal Laws (1 locked, 3 conditionally available)
- [ ] Trees unlock correctly based on Chapter 2-4 + RR Candy
- [ ] Hold-to-learn unlocks node and persists to Firestore
- [ ] Learned nodes show checkmark after refresh
- [ ] No equip/upgrade in Profile (only learn/unlock)
- [ ] Learned skills appear in Battle Arena skill selection (when wired)

## Future Enhancements

- Add more nodes to each tree (currently 1 node per tree)
- Implement connector lines between nodes (SVG overlay)
- Wire battle effects into battle engine
- Add skill upgrade system (separate from learn/unlock)
- Add skill equip system in Battle Arena

