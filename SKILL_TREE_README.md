# Skill Tree System Documentation

## Overview

The Profile Skill Tree is a system-wide unlock tree where players can unlock new skills by meeting requirements. This is **READ-ONLY** - players can only unlock nodes here. Equipping, upgrading, and managing skills happens in Battle Arena > Skill Mastery.

## Architecture

### Data Structure

#### Skill Definitions (`src/data/skillDefinitions.ts`)
- Global skill data (single source of truth)
- Each skill includes:
  - `inGame`: Battle description and mechanics
  - `irl`: Real-world application and reflection prompts
  - Icon (emoji or URL)
  - Branch and category assignments

#### Tree Definition (`src/data/skillTreeDefinition.ts`)
- Defines the tree structure:
  - **3 Branches**: Manifest Mastery, Elemental & Action, System & Strategy
  - **Categories**: Within each branch (e.g., Reading, Writing, Fire, Air, Strategy)
  - **Nodes**: Tree nodes mapping skills to positions
  - **Starter Nodes**: Default unlocked nodes for all players

#### Player State (Firestore: `players/{userId}/skill_state/main`)
```typescript
{
  unlockedNodeIds: string[];  // Which nodes are unlocked
  equippedSkillIds: string[]; // Managed in Battle Arena
  skillUpgrades: { [skillId]: { level, xp } }; // Managed in Battle Arena
  version: string;
  lastUpdated: Timestamp;
}
```

### UI Components

Located in `src/components/skillTree/`:

1. **SkillTreePage** - Main container component
2. **BranchSelector** - Select between 3 branches
3. **CategoryTabs** - Filter nodes by category within a branch
4. **SkillTreeCanvas** - Renders diamond nodes and connection lines
5. **SkillDetailPanel** - Shows skill details and unlock button
6. **HoldToUnlockButton** - Hold-to-confirm unlock interaction

## Visual Design

Inspired by Ghost of Tsushima's technique screen:
- **Cinematic layout**: Dark gradient background with subtle texture overlay
- **Diamond nodes**: Rotated squares with skill icons
- **Connection lines**: SVG lines between parent and child nodes
- **Color accents**: Purple (Manifest), Orange (Elemental), Teal (System)
- **Detail panel**: Large right-side panel with in-game and IRL descriptions

## Adding New Skills

### Step 1: Add Skill Definition

In `src/data/skillDefinitions.ts`:

```typescript
{
  id: 'my-new-skill',
  name: 'My New Skill',
  branchId: 'manifest', // or 'elemental', 'system'
  categoryId: 'reading', // optional category
  icon: { type: 'emoji', value: '🌟' },
  tags: ['manifest', 'reading'],
  inGame: {
    summary: 'Brief in-game description',
    effectText: 'Detailed battle effect',
    type: 'utility',
    baseCooldown: 3,
    baseCostPP: 15,
    targetType: 'enemy'
  },
  irl: {
    summary: 'Real-world summary',
    exampleUse: 'How to apply this skill IRL',
    reflectionPrompt: 'Optional reflection question'
  },
  rarity: 'rare'
}
```

### Step 2: Add Tree Node

In `src/data/skillTreeDefinition.ts`:

```typescript
{
  id: 'node-my-new-skill',
  branchId: 'manifest',
  categoryId: 'reading', // optional
  skillId: 'my-new-skill', // must match skill definition ID
  position: { row: 1, col: 2 }, // visual position
  requires: ['node-parent-skill'], // prerequisite node IDs
  unlockRules: {
    type: 'ppSpent', // or 'level', 'challengeComplete', 'always'
    value: 500 // required PP spent, level, etc.
  }
}
```

### Step 3: Update Starter Nodes (Optional)

If this should be unlocked by default, add to `starterNodes` array in `SKILL_TREE_DEFINITION`.

## Unlock Requirements

Nodes can require:
- **Dependencies**: Other nodes must be unlocked first (`requires` array)
- **PP Spent**: Player must have spent a minimum amount of PP
- **Level**: Player must reach a certain level
- **Challenge Complete**: Specific challenge must be completed (TODO: implement challenge checking)
- **Always**: No requirements (for starter nodes)

## Migration

On first load, if a player doesn't have skill state:
- Initializes with `starterNodes` from tree definition
- Saves to Firestore automatically
- Existing players are backfilled on first access

## Notes

- **No equip/upgrade in Profile**: These features are in Battle Arena > Skill Mastery
- **RR Candy skills**: Will appear as nodes in System & Strategy branch (to be added)
- **In-Game vs IRL**: Each skill has both versions displayed side-by-side
- **Hold-to-unlock**: Prevents accidental unlocks (800ms hold required)

