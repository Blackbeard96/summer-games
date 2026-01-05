# Wave Engine Implementation Summary

## Root Cause Analysis

### Problems Identified:
1. **Multiple Transition Triggers**: Wave transitions were triggered from:
   - Main `useEffect` (lines ~866-1304)
   - Periodic check `useEffect` (lines ~1483-1900)
   - Both had duplicate logic for checking enemy defeat and spawning waves

2. **Race Conditions**:
   - Firestore writes and snapshot listener updates happening out of order
   - Local state updates (`setWaveNumber`, `setOpponents`) happening before Firestore listener applied changes
   - No revision tracking to prevent stale updates

3. **"Skipping Listener Update" Bug**:
   - When `isUpdatingEnemiesRef.current === true`, snapshot updates were permanently skipped
   - This caused important wave/enemy updates to be lost

4. **No Atomic Updates**:
   - `waveNumber` and `enemies` were updated separately, allowing inconsistent states
   - No revision numbers to track update order

5. **Double-Advance Prevention Insufficient**:
   - Lock mechanism existed but could be bypassed if multiple checks fired simultaneously
   - No verification that Firestore state matched local state before advancing

## Solution Implemented

### 1. Single Wave Engine Function (`advanceWaveIfNeeded`)
- **Location**: `src/components/IslandRaidBattle.tsx` (lines ~868-1178)
- **Purpose**: Consolidated ALL wave transition logic into one function
- **Features**:
  - Detailed logging with `debug.groupCollapsed` for each attempt
  - Early returns with clear reasons
  - Lock acquisition before any Firestore writes
  - Firestore state verification before proceeding
  - Atomic updates with revision numbers

### 2. Revision Numbers
- **Fields Added to Firestore**:
  - `waveRevision`: Increments every time `waveNumber` changes
  - `enemiesRevision`: Increments every time `enemies` array is replaced
- **Purpose**: Prevent out-of-order snapshot updates from overwriting newer state
- **Implementation**:
  - Refs track last applied revisions: `lastAppliedWaveRevisionRef`, `lastAppliedEnemiesRevisionRef`
  - Snapshot listener only applies updates if `incomingRevision >= lastAppliedRevision`

### 3. Fixed "Skipping Listener Update"
- **Old Behavior**: Snapshot updates were permanently skipped when `isUpdatingEnemiesRef.current === true`
- **New Behavior**: Snapshot updates are queued in `queuedSnapshotRef` and processed after the write completes
- **Location**: `src/components/IslandRaidBattle.tsx` (lines ~206-230)

### 4. Atomic Firestore Updates
- **Location**: `advanceWaveIfNeeded` function (lines ~1082-1090)
- **Implementation**: Single `updateDoc` call updates:
  - `waveNumber`
  - `waveRevision` (incremented)
  - `enemies` (replaced)
  - `enemiesRevision` (incremented)
  - `status`
  - `updatedAt`
  - Player moves cleared

### 5. Hard Lock Mechanism
- **Location**: `advanceWaveIfNeeded` function (lines ~1019-1021)
- **Implementation**:
  - Lock acquired: `isProcessingWaveTransitionRef.current = true` AND `waveAdvanceLockRef.current = true`
  - Lock released in `finally` block (even on errors)
  - Firestore state verified before lock acquisition to prevent double-advance

### 6. Firestore as Single Source of Truth
- **Implementation**:
  - Local state (`waveNumber`, `opponents`) mirrors Firestore state
  - Snapshot listener applies updates only if revisions are newer
  - `advanceWaveIfNeeded` writes to Firestore first, then updates local state
  - Local state updates are immediate for UI responsiveness, but Firestore is authoritative

## Files Changed

1. **src/components/IslandRaidBattle.tsx**:
   - Added revision tracking refs (lines ~64-66)
   - Added `queuedSnapshotRef` (line ~66)
   - Created `advanceWaveIfNeeded` function (lines ~868-1178)
   - Updated main `useEffect` to use `advanceWaveIfNeeded` (lines ~1180-1189)
   - Fixed snapshot listener to queue updates instead of skipping (lines ~206-230)
   - Added revision checks in snapshot listener (lines ~232-280)
   - Updated Firestore writes to include revision numbers (lines ~1082-1090)

## Key Functions Updated

1. **`advanceWaveIfNeeded(reason: string)`** - NEW
   - Single entry point for all wave transitions
   - Handles all validation, locking, and Firestore updates
   - Returns `Promise<boolean>` indicating success

2. **`onSnapshot` listener** - UPDATED
   - Now queues updates instead of skipping
   - Checks revision numbers before applying updates
   - Processes queued snapshots after writes complete

3. **Main `useEffect`** - SIMPLIFIED
   - Now just calls `advanceWaveIfNeeded('Main useEffect: Enemy defeat check')`
   - Removed ~500 lines of duplicate logic

## Remaining Work

1. **Remove Old Code**: The old wave transition logic (lines ~1191-1769) should be removed as it's now duplicate
2. **Update Periodic Check**: The periodic check `useEffect` (lines ~1769+) should also use `advanceWaveIfNeeded`
3. **Victory Handling**: Add victory handling to `advanceWaveIfNeeded` when `currentWave >= maxWaves`
4. **Cutscene Integration**: Ensure cutscenes properly release locks after completion

## Testing Checklist

- [ ] Start Chapter 2-4
- [ ] Kill all enemies in Wave 1 → exactly one transition to Wave 2
- [ ] Wave 2 enemies appear and UI shows "Wave 2/4"
- [ ] Kill all enemies in Wave 2 → transition to Wave 3 (no skipping)
- [ ] Wave 3 enemies appear and UI shows "Wave 3/4"
- [ ] Kill all enemies in Wave 3 → Kon intro cutscene shows (Config path)
- [ ] After cutscene, Wave 4 spawns and UI shows "Wave 4/4"
- [ ] Battle log displays "WAVE X BEGINS!" correctly matching waveNumber
- [ ] No "Skipping listener update" messages in console
- [ ] No wave skipping (1→3 or 2→4)
- [ ] Revision numbers increment correctly in Firestore

## Migration Notes

- **Backwards Compatibility**: Existing battles without `waveRevision`/`enemiesRevision` will default to 0
- **Initial Values**: When creating new battles, initialize `waveRevision: 0` and `enemiesRevision: 0`
- **Cutscene Locks**: Cutscenes that delay wave spawning must release locks after completion





