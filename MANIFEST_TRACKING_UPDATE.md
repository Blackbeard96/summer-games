# Manifest Tracking Update - Connecting Move Usage to Manifest Levels

## Overview
Updated the move tracking system to automatically track manifest ability usage when moves are used in battles. Now when a player uses "Read the Room" (or any manifest move), it will:
1. Track the move usage (as before)
2. **Automatically track it as manifest ability usage for the corresponding level**
3. Update the Profile's Manifest tracker in real-time

## Changes Made

### 1. Enhanced `trackMoveUsage` Function
**File**: `src/utils/manifestTracking.ts`

- Added `getManifestLevelForMove()` helper function that determines which manifest level (1-4) a move corresponds to based on move name patterns
- Updated `trackMoveUsage()` to automatically track manifest ability usage when a manifest move is used
- When a move like "Read the Room" is used, it now:
  - Tracks move usage: `moveUsage["Read the Room"]++`
  - Tracks ability usage: `abilityUsage[1]++` (for Level 1 Reading manifest)

### 2. How It Works

#### Move to Level Mapping
The system uses pattern matching to determine which manifest level a move belongs to:

**Reading Manifest:**
- Level 1: Moves containing "read the room", "emotional read", or "read"
- Level 2: Moves containing "pattern shield" or "shield"
- Level 3: Moves containing "read" and "pattern"
- Level 4: Moves containing "read" and "environment"

Similar patterns exist for all 10 manifest types.

#### Tracking Flow
```
Player uses "Read the Room" in battle
    ↓
trackMoveUsage(userId, "Read the Room")
    ↓
1. Increment moveUsage["Read the Room"]
2. Detect it's a Level 1 Reading move
3. Increment abilityUsage[1]
4. Update Firestore
    ↓
Profile automatically updates (real-time listener)
```

## Battle Modes Covered

All battle modes already call `trackMoveUsage`, so they now automatically track manifest ability usage:

✅ **Practice Mode** (`BattleEngine.tsx`)
- Uses `trackMoveUsage()` when moves are executed
- Now also tracks manifest ability usage

✅ **CPU Challenger** (`CPUChallenger.tsx`)
- Tracks moves when used against training dummy
- Now also tracks manifest ability usage

✅ **Vault Siege** (`VaultSiegeModal.tsx`)
- Tracks moves used in vault attacks
- Now also tracks manifest ability usage

✅ **PvP Battles** (`BattleEngine.tsx`)
- Tracks moves in live battles
- Now also tracks manifest ability usage

✅ **Story Battles** (`StoryEpisodeBattle.tsx`)
- Tracks moves in story mode
- Now also tracks manifest ability usage

## Profile Display

The Profile page (`Profile.tsx`) displays usage counts from:
- `playerManifest.moveUsage[moveName]` - Individual move usage
- `playerManifest.abilityUsage[level]` - Manifest level usage

The Profile uses a real-time listener (`onSnapshot`) that automatically updates when the manifest changes in Firestore, so usage counts update immediately after battles.

## Testing

To verify the tracking works:

1. **Use a Level 1 manifest move in any battle mode**
   - Go to Battle Arena → Practice Mode
   - Use "Read the Room" (or your Level 1 move)
   - Check browser console for logs:
     - `[trackMoveUsage] Move "Read the Room" usage: X -> Y`
     - `[trackMoveUsage] Also tracking as manifest ability: Level 1 of reading used Z times`

2. **Check Profile**
   - Go to Profile page
   - Scroll to Manifest Progress section
   - Verify "Level 1: Read the Room" shows updated usage count
   - Verify the counter increments each time you use the move

3. **Test across battle modes**
   - Practice Mode
   - Vault Siege
   - PvP Battle
   - All should track and update the Profile

## Key Files Modified

- `src/utils/manifestTracking.ts` - Added manifest level detection and dual tracking
- No changes needed to battle components (they already call `trackMoveUsage`)

## Notes

- The system only tracks manifest moves (moves that match manifest patterns)
- Elemental and system moves won't trigger manifest ability tracking
- If a move doesn't match any manifest level pattern, it will only track move usage (not ability usage)
- The Profile automatically refreshes via Firestore real-time listener

