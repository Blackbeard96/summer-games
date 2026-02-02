# Spaces Mode Implementation

## Overview
Spaces Mode is a new 1v1 PvP battle mode inspired by Clash Royale-style tower objectives. Players must destroy opponent's spaces (2 Sub Spaces + 1 Main Space) to win.

## Battle Mode Architecture

### Current Battle Modes
- **PvP 1v1**: Uses Spaces Mode (new)
- **Island Raid**: 2v2-4v4, raids, live events (existing)
- **SquadUp**: Story battles (existing)
- **InSession**: Classroom battles (existing)

### Key Files
- `src/types/battleSession.ts`: Battle mode type definitions
- `src/components/PvPBattle.tsx`: PvP 1v1 matchmaking and room creation
- `src/components/BattleEngine.tsx`: Core battle logic and turn resolution
- `src/components/IslandRaidBattle.tsx`: Island Raid battle implementation
- `src/utils/battleSessionManager.ts`: Battle session creation/management

### Victory Conditions
- **Instant Win**: Destroy opponent's Main Space
- **Time Expiry**: Player with more spaces destroyed wins
  - Sub Space destroyed = 1 point each
  - Main Space destroyed = 3 points
- **Tiebreaker** (if spaces destroyed are equal):
  1. Higher remaining total integrity% across all spaces
  2. If still tied: Declare draw

## Data Model

### Space Types
```typescript
type SpaceId = 'subLeft' | 'main' | 'subRight';

type SpaceState = {
  id: SpaceId;
  ownerUid: string;
  maxIntegrity: number;
  integrity: number;
  maxShield: number;
  shield: number;
  destroyed: boolean;
  locked: boolean; // only applies to main
};
```

### Player Spaces
```typescript
type PlayerSpaces = {
  ownerUid: string;
  spaces: Record<SpaceId, SpaceState>;
  destroyedCount: number; // computed
};
```

### Spaces Mode State
```typescript
type SpacesModeState = {
  mode: 'PVP_SPACES_1V1';
  startedAt: number;
  endsAt: number;
  durationSec: number; // e.g., 240 or 300
  players: Record<string, PlayerSpaces>;
  winnerUid?: string;
  winReason?: 'MAIN_DESTROYED' | 'SPACE_ADVANTAGE' | 'TIEBREAK' | 'FORFEIT';
};
```

## Configuration Constants

Located in `src/utils/spacesModeConfig.ts`:
- `SPACES_MODE_DURATION_SEC`: 240 (4 minutes)
- `SUB_SPACE_BASE_INTEGRITY`: 100
- `MAIN_SPACE_BASE_INTEGRITY`: 300
- `SUB_SPACE_INTEGRITY_PER_LEVEL`: 10
- `MAIN_SPACE_INTEGRITY_PER_LEVEL`: 30
- `BASE_SHIELD`: 0 (or small value)

## Targeting Rules

### Valid Targets
- **Sub Spaces** (subLeft, subRight): Always targetable (unless destroyed)
- **Main Space**: Only targetable if at least one opponent sub space is destroyed

### Invalid Actions
- Targeting locked main space → Show error toast: "Main Space is locked! Destroy a Sub Space first."

## Damage Resolution

1. Damage applies to shield first, then integrity
2. When integrity <= 0:
   - Mark `destroyed = true`
   - Set `integrity = 0`, `shield = 0`
   - If destroyed is a sub space:
     - Unlock the owner's main space (`locked = false`)
     - Log: "Main Space unlocked!"
   - If destroyed is main:
     - End match immediately
     - Set `winnerUid` and `winReason = 'MAIN_DESTROYED'`

## Timer Logic

- Battle starts with `startedAt` timestamp
- Ends at `endsAt = startedAt + durationSec`
- When time expires:
  1. Calculate scores (sub=1pt, main=3pts)
  2. If tied, use tiebreaker (remaining integrity%)
  3. If still tied, declare draw

## UI Components

### Spaces Panel
- Three rectangles per player: Sub (L), Main, Sub (R)
- Show integrity/shield bars
- Lock icon overlay on Main when locked
- Destroyed state (cracked/greyed out)

### Targeting UI
- User selects skill
- User taps target space rectangle
- Confirm and execute

### Match Timer
- Countdown display at top of battle screen

## Implementation Status

### ✅ Completed
1. **Data Models**: Types defined in `src/types/battleSession.ts`
   - `SpaceId`, `SpaceState`, `PlayerSpaces`, `SpacesModeState`
   - Added `PVP_SPACES_1V1` to `BattleMode` type

2. **Configuration**: `src/utils/spacesModeConfig.ts`
   - All constants defined (duration, integrity values, scaling)

3. **Helper Functions**: `src/utils/spacesModeHelpers.ts`
   - `createSpacesForPlayer()` - Initialize spaces for a player
   - `isMainUnlocked()` - Check if main is unlocked
   - `unlockMainSpace()` - Unlock main when sub destroyed
   - `computeSpaceScore()` - Calculate score
   - `calculateRemainingIntegrityPercent()` - For tiebreaker
   - `applyDamageToSpace()` - Apply damage with shield/integrity logic
   - `isValidTarget()` - Validate targeting rules
   - `determineWinnerOnTimeExpiry()` - Calculate winner on timeout

4. **Battle Integration**: `src/utils/spacesModeBattle.ts`
   - `initializeSpacesModeBattle()` - Create new battle
   - `applyDamageToSpaceInBattle()` - Apply damage and handle destruction
   - `checkBattleEndCondition()` - Check win conditions
   - `validateSpacesModeTarget()` - Validate targets

5. **UI Component**: `src/components/SpacesModeUI.tsx`
   - Spaces panel with 3 rectangles per player
   - Integrity/shield bars
   - Lock icon on main
   - Destroyed state visualization
   - Click targeting support

### 🔄 In Progress / TODO
1. **PvPBattle Integration** (`src/components/PvPBattle.tsx`)
   - Initialize Spaces Mode state when battle starts (line ~585)
   - Store spaces state in Firestore battle room
   - Pass spaces state to BattleEngine

2. **BattleEngine Integration** (`src/components/BattleEngine.tsx`)
   - Add `spacesModeState` prop
   - Add `isSpacesMode` flag
   - Update targeting UI to show spaces
   - Integrate SpacesModeUI component
   - Update damage resolution to use spaces
   - Add timer display
   - Handle victory conditions
   - Update battle log for space events

3. **Timer Component**
   - Create countdown timer component
   - Display at top of battle screen
   - Handle time expiry

4. **Firestore Integration**
   - Update battle room schema to include `spacesModeState`
   - Sync spaces state between players
   - Handle real-time updates

## Testing Checklist

- [ ] Can start a PvP 1v1 Spaces Mode match
- [ ] Main Space is locked at start
- [ ] Can damage sub spaces; shield absorbs first
- [ ] Destroying one sub unlocks main
- [ ] Can't target locked main (blocked with error)
- [ ] Destroying main ends match instantly
- [ ] Timer ends match and calculates winner correctly
- [ ] Battle log records space events
- [ ] Island Raid mode unchanged for 2v2-4v4
- [ ] Forfeit button works correctly
- [ ] Tiebreaker logic works correctly

## Implementation Notes

- All Spaces Mode logic isolated behind `mode === 'PVP_SPACES_1V1'` checks
- Prefer pure functions for battle resolution (easy to test)
- Firestore updates use transactions where needed
- Extend battle engine with "spaces adapter" layer (avoid rewriting)
- Ensure backward compatibility for non-spaces battles

