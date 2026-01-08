# RR Candy Unlock Fix - Skill Mastery Integration

## Problem
RR Candy skills were not appearing as unlocked in Skill Mastery, even though they showed as unlocked in Profile's Skill Tree Settings. The unlock state existed in Firestore, but Skill Mastery wasn't reading it correctly.

## Root Cause
- **Inconsistent unlock detection**: Profile and Skill Mastery were using slightly different logic to check RR Candy unlock status
- **Filtering too strict**: Skill Mastery required both global RR Candy unlock AND individual `move.unlocked === true`, but some moves had `unlocked: false` even when RR Candy was unlocked
- **No single source of truth**: Multiple places checked unlock status with slightly different conditions

## Solution

### 1. Created Unified Helper (`src/utils/rrCandyUtils.ts`)
**Single Source of Truth for RR Candy Unlock:**
```typescript
getRRCandyStatus(userData) => {
  unlocked: boolean,
  candyType: 'on-off' | 'up-down' | 'config' | null
}
```

**Firestore Path:**
- `users/{uid}/chapters/2/challenges/ep2-its-all-a-game/isCompleted === true`
- OR `users/{uid}/chapters/2/challenges/ep2-its-all-a-game/status === 'approved'`
- AND `users/{uid}/chapters/2/challenges/ep2-its-all-a-game/candyChoice` exists

This matches Profile's logic exactly.

### 2. Updated Skill Mastery (`src/components/MovesDisplay.tsx`)
- Uses `getRRCandyStatusAsync()` to check unlock status
- **Key Fix**: Shows RR Candy moves when `rrCandyStatus.unlocked === true`, even if individual `move.unlocked === false`
- Displays section header with candy type: "RR Candy Skills (Unlocked: On/Off)"
- Automatically unlocks existing RR Candy moves in Firestore if they're not already unlocked

### 3. Updated BattleContext (`src/context/BattleContext.tsx`)
- Uses `getRRCandyStatus()` helper instead of inline logic
- Ensures RR Candy moves are unlocked when detected
- Syncs RR Candy moves to `battleMoves/{uid}/moves[]` collection

### 4. Upgrade Function (Already Working)
- `upgradeMove()` in BattleContext already handles RR Candy skills correctly
- Uses 1000 PP base cost (10x regular skills)
- Persists upgrades to Firestore atomically
- Works from both Profile and Skill Mastery

## Files Changed

1. **`src/utils/rrCandyUtils.ts`** (NEW)
   - `getRRCandyStatus(userData)`: Synchronous helper
   - `getRRCandyStatusAsync(userId)`: Async Firestore query version
   - Comprehensive documentation of source of truth

2. **`src/components/MovesDisplay.tsx`**
   - Added `rrCandyStatus` state tracking
   - Updated filtering logic to use global unlock status
   - Enhanced section header to show candy type
   - Auto-unlocks RR Candy moves in Firestore when detected

3. **`src/context/BattleContext.tsx`**
   - Uses unified `getRRCandyStatus()` helper
   - Ensures RR Candy moves are unlocked when syncing

## How It Works Now

1. **Unlock Detection**: Both Profile and Skill Mastery use `getRRCandyStatus()` - single source of truth
2. **Display Logic**: If `rrCandyStatus.unlocked === true`, show ALL RR Candy moves (overrides individual `move.unlocked` flags)
3. **Auto-Unlock**: When RR Candy is detected as unlocked, ensure all RR Candy moves in Firestore have `unlocked: true`
4. **Upgrades**: Use existing `upgradeMove()` function - works for all skills including RR Candy

## Testing Checklist

- [ ] Complete Chapter 2-4 and choose RR Candy (On/Off, Up/Down, or Config)
- [ ] Verify RR Candy Skills section appears in Skill Mastery
- [ ] Verify section header shows correct candy type
- [ ] Verify RR Candy skills are listed and show upgrade buttons
- [ ] Verify upgrade costs are correct (1000 PP base for RR Candy)
- [ ] Verify upgrades persist and reflect immediately
- [ ] Verify Profile Skill Tree Settings still works correctly
- [ ] Verify both pages show the same unlock status

## Notes

- RR Candy unlock is stored in: `users/{uid}/chapters/2/challenges/ep2-its-all-a-game/`
- RR Candy skills are stored in: `battleMoves/{uid}/moves[]` (filtered by `id.startsWith('rr-candy-')`)
- When RR Candy is unlocked, all RR Candy moves should have `unlocked: true` in Firestore
- The filtering logic in Skill Mastery now prioritizes global unlock status over individual move flags





