# Skill System Refactor - Audit Summary

## Current Architecture

### Data Storage
- **Primary Collection**: `battleMoves/{userId}`
  - Document structure: `{ moves: Move[] }`
  - Contains all player's skills/moves (manifest, elemental, RR Candy)
  - Real-time listener in BattleContext updates moves array
  
- **Legacy Collections** (still referenced):
  - `moves/{userId}` - Older collection, still used in some places
  - Both collections store same structure: `{ moves: Move[] }`

### Skill/Move Data Model
- **Type**: `Move` (defined in `src/types/battle.ts`)
  - Key fields: `id`, `name`, `description`, `category`, `type`, `cost`, `cooldown`, `unlocked`, `masteryLevel` (1-10)
  - Categories: `'manifest' | 'elemental' | 'system'`
  - Also converted to `Skill` type (in `src/types/skill.ts`) for compatibility

### Current Skill Management Locations

1. **Profile Page** (`src/pages/Profile.tsx`)
   - Shows RR Candy skills in Power Card section
   - **Has upgrade functionality** (lines 1150-1230)
   - Shows skill tree with unlock/upgrade buttons
   - Uses `upgradeMove` from BattleContext

2. **Battle Arena** (`src/pages/Battle.tsx` → `MovesDisplay` component)
   - **Primary skill management interface**
   - Shows all skills (Manifest, Elemental, RR Candy, System)
   - Has upgrade functionality (via `onUpgradeMove` prop)
   - Handles skill unlocking/upgrading
   - Located at `/battle#moves` route

3. **PlayerCard Component** (`src/components/PlayerCard.tsx`)
   - Shows Skill Tree view when `hasSkillTreeAccess` is true
   - Has in-game/IRL toggle
   - **Currently shows hardcoded RR Candy tree** (lines 990-1300)
   - Does NOT have upgrade functionality (read-only display)

### Battle Engine Integration
- **Service**: `src/utils/battleSkillsService.ts`
  - `getUserUnlockedSkillsForBattle()` - Canonical function for fetching battle skills
  - Reads from `battleMoves/{userId}` collection
  - Filters by unlocked status, manifest type, element type, RR Candy status
  - Used by: BattleEngine, Battle UI, Multiplayer battle validation

- **Battle Engine**: `src/components/BattleEngine.tsx`
  - Loads skills via `getUserUnlockedSkillsForBattle()`
  - Uses moves array from BattleContext

### Key Services
- `src/utils/skillService.ts` - Skill management utilities (fetchUserSkills, updateSkillLevel, updateSkillMastery)
- `src/context/BattleContext.tsx` - Manages moves state, provides upgradeMove function
- `src/utils/battleSkillsService.ts` - Battle-specific skill filtering

### Current Issues Identified
1. **Duplication**: Skills managed in both Profile and Battle Arena
2. **No clear separation**: Unlock state, equip state, and upgrade state all mixed together
3. **Hardcoded tree**: PlayerCard has hardcoded Skill Tree (not data-driven)
4. **No global skill definitions**: Skills are stored per-player, no central definition
5. **No inGame/irlVersion separation**: Skills only have single description field

## Proposed Architecture

### New Data Model

1. **skillDefinitions** (Global, static)
   - Collection: `skill_definitions` (or keep in code as constants)
   - Contains: id, name, branchId, categoryId, icon, tags, inGame, irl

2. **skillTreeDefinition** (Global)
   - Collection: `system_config`
   - Document: `skill_tree_v1`
   - Contains: branches, categories, nodes, starterNodes

3. **playerSkillState** (Per-player)
   - Collection: `players/{userId}/skill_state`
   - Document: `main`
   - Contains: unlockedNodeIds, equippedSkillIds, skillUpgrades

### UI Changes

1. **Profile Skill Tree** → READ-ONLY
   - Show tree structure (3 branches)
   - Allow unlocking nodes (if requirements met)
   - NO equip/upgrade functionality
   - Display both inGame and irl versions

2. **Battle Arena** → ONLY place for equip/upgrade
   - Available Skills list (from unlocked nodes)
   - Equipped Skills (3 slots, drag/drop)
   - Upgrade UI for selected skill
   - Details panel (inGame + irl)

3. **Battle Engine** → Use equipped skills
   - Read from playerSkillState.equippedSkillIds
   - Apply skillUpgrades for scaling

