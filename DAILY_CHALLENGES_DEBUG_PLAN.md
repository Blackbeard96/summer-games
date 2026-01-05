# Daily Challenges Tracking Debug & Fix Plan

## Root Cause Analysis

### Critical Issue #1: Date Key Mismatch ⚠️
**Problem**: `getTodayDateString()` uses **local time** but reset timer uses **8am Eastern Time**
- Tracker uses: `new Date().getMonth()` (local time)
- UI reset timer uses: `getDayStartForDate()` (8am Eastern)
- **Result**: Date keys don't match, progress tracking fails silently

**Fix**: Created `dailyChallengeDateUtils.ts` with unified Eastern Time date functions

### Critical Issue #2: Race Condition in Reward Granting ⚠️
**Problem**: `autoGrantRewards()` is not idempotent
- Uses two separate `updateDoc` calls (not atomic)
- No check if already claimed before granting
- Snapshot listener can fire multiple times quickly
- **Result**: Rewards can be granted multiple times

**Fix Needed**: Use Firestore transaction to check `claimed` flag before granting

### Issue #3: Type Matching Problems
**Problem**: Challenge type matching relies on stored type + details fetch
- If type not stored in progress object, must fetch details
- Normalization (lowercase/trim) can still mismatch
- **Result**: Some challenges don't match event types

**Status**: Already has repair function, but needs better logging

### Issue #4: Debug Logging
**Problem**: Too much logging in production, not enough structure
- No flag to enable/disable verbose logging
- Hard to trace events end-to-end

**Fix**: Added `DEBUG_DAILY` flag (REACT_APP_DEBUG_DAILY=true)

## Files Modified

1. ✅ `src/utils/dailyChallengeDateUtils.ts` - NEW: Unified Eastern Time date utilities
2. 🔄 `src/utils/dailyChallengeTracker.ts` - Update to use Eastern Time dates, add debug flag
3. 🔄 `src/components/DailyChallenges.tsx` - Update to use Eastern Time dates, fix reward idempotency
4. ⏳ Debug panel component (dev-only)

## Implementation Status

- [x] Step 0: Audit complete
- [x] Step 2: Date utility created (Eastern Time)
- [ ] Step 2: Update tracker to use Eastern Time dates
- [ ] Step 2: Update UI to use Eastern Time dates  
- [ ] Step 4: Fix reward idempotency (transaction-based)
- [ ] Step 1: Add debug logging with flag
- [ ] Step 6: Create debug panel

## Next Steps

1. Update `dailyChallengeTracker.ts` to use `getTodayDateStringEastern()`
2. Update `DailyChallenges.tsx` to use Eastern Time dates
3. Fix `autoGrantRewards()` to be idempotent using transactions
4. Add debug panel component
5. Test all event types

