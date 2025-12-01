# Move Tracking System Guide

## Overview
The move tracking system records every time a player uses a move in battle, storing the usage count in the player's manifest data. This allows the system to track progress toward milestones (20, 50, 100 uses) and display usage statistics in the Profile page.

## How Move Tracking Works

### 1. **Move Name Resolution**
Before tracking, the system resolves the move name using `getMoveNameSync()` from `utils/moveOverrides.ts`. This ensures that:
- Override names (if set by admins) are used for tracking
- Original move names are used as fallback
- Consistent naming across all battle modes

### 2. **Tracking Function**
The core tracking function is `trackMoveUsage()` in `utils/manifestTracking.ts`:
- Takes `userId` and `moveName` as parameters
- Updates the `moveUsage` object in the player's manifest
- Increments the count for the specific move
- Awards milestone rewards (20, 50, 100 uses)
- Saves to Firestore `students/{userId}` collection

### 3. **Battle Modes That Track Moves**

#### ✅ Practice Mode
- **Component**: `PracticeModeBattle.tsx` → uses `BattleEngine`
- **Tracking Location**: `BattleEngine.tsx` line 417
- **How it works**: When a move is executed, `trackMoveUsage()` is called

#### ✅ CPU Challenger (Training Dummy)
- **Component**: `CPUChallenger.tsx`
- **Tracking Location**: Line 121
- **How it works**: Tracks moves when player executes them against the training dummy

#### ✅ Vault Siege (Offline Attacks)
- **Component**: `VaultSiegeModal.tsx`
- **Tracking Location**: Line 455
- **How it works**: Tracks each move used in a vault siege attack

#### ✅ PvP Battles
- **Component**: `BattleEngine.tsx` (used by battle rooms)
- **Tracking Location**: Line 417
- **How it works**: Tracks moves in live player vs player battles

#### ✅ Story Battles
- **Component**: `StoryEpisodeBattle.tsx`
- **Tracking Location**: Line 105
- **How it works**: Tracks moves used in story mode battles

### 4. **Data Structure**
Moves are tracked in the player's manifest:
```typescript
{
  manifest: {
    manifestId: "reading",
    moveUsage: {
      "Read the Room": 15,
      "Pattern Shield": 8,
      "Emotional Read": 3
    },
    abilityUsage: {
      1: 15,  // Level 1 ability used 15 times
      2: 8    // Level 2 ability used 8 times
    }
  }
}
```

### 5. **Display in Profile**
The `ManifestProgress` component displays:
- **Move names** (e.g., "Level 1: Read the Room") instead of manifest names
- **Usage counts** for each move
- **Milestone progress** (20, 50, 100 uses)
- **Next milestone** indicator

### 6. **Troubleshooting**

#### Moves Not Tracking
1. Check browser console for errors from `trackMoveUsage`
2. Verify `currentUser.uid` is available
3. Check Firestore rules allow writes to `students/{userId}`
4. Verify move name resolution is working (check console logs)

#### Usage Counts Not Updating
1. Ensure `onAbilityUsed` callback is called after tracking
2. Check that `fetchUserData()` is called to refresh the UI
3. Verify Firestore updates are successful (check console logs)

#### Move Names Not Displaying Correctly
1. Check `getMoveForLevel()` function matches moves correctly
2. Verify move names in player's `moves` array match manifest patterns
3. Check that `getMoveNameSync()` is resolving names correctly

## Testing Move Tracking

1. **Use a move in Practice Mode**
   - Go to Battle Arena → Practice Mode
   - Select an opponent and use a move
   - Check console for `[BattleEngine] Tracking move usage` log
   - Verify count updates in Profile → Manifest Progress

2. **Use a move in Vault Siege**
   - Go to Battle Arena → Vault Siege
   - Select a target and use moves
   - Check console for tracking logs
   - Verify counts update

3. **Check Profile Display**
   - Go to Profile page
   - Scroll to Manifest Progress section
   - Verify move names show as "Level 1: [Move Name]"
   - Verify usage counts are accurate

## Key Files

- `src/utils/manifestTracking.ts` - Core tracking functions
- `src/components/ManifestProgress.tsx` - Display component
- `src/components/BattleEngine.tsx` - Main battle logic
- `src/components/CPUChallenger.tsx` - Training dummy battles
- `src/components/VaultSiegeModal.tsx` - Vault siege attacks
- `src/utils/moveOverrides.ts` - Move name resolution

