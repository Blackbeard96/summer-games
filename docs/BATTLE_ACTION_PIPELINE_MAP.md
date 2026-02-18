# Battle Action Pipeline Map

## Overview
This document maps the battle action pipeline for each battle mode to identify shared root causes of skills not executing.

## Pipeline Stages

### Stage A: Skill Click Handler
**Location:** `BattleEngine.handleMoveSelect()`
- **Live Events:** ✅ Instrumented
- **Island Raid:** ✅ Uses BattleEngine (shared)
- **Player Journey:** ✅ Uses BattleEngine (shared)

### Stage B: Target Selection
**Location:** `BattleEngine.handleTargetSelect()`
- **Live Events:** ✅ Instrumented
- **Island Raid:** ✅ Uses BattleEngine (shared)
- **Player Journey:** ✅ Uses BattleEngine (shared)

### Stage C: Action Submit
**Location:** `BattleEngine.executePlayerMove()` → `handleAnimationComplete()`
- **Live Events:** ✅ Instrumented, calls `applyInSessionMove()`
- **Island Raid:** ✅ Uses BattleEngine (shared)
- **Player Journey:** ✅ Uses BattleEngine (shared)

### Stage D: Firestore Write
**Location:** Mode-specific services
- **Live Events:** `inSessionMoveService.applyInSessionMove()` → `inSessionRooms/{sessionId}` ✅ Instrumented
- **Island Raid:** `BattleEngine` → Updates `islandRaidBattleRooms/{gameId}/enemies` (via `handleOpponentsUpdate`)
- **Player Journey:** `BattleEngine` → Local state only (no Firestore)

### Stage E: Resolver/State Update
**Location:** Mode-specific
- **Live Events:** Transaction in `applyInSessionMove()` updates session document ✅ Instrumented
- **Island Raid:** `handleOpponentsUpdate()` updates Firestore, listener updates local state
- **Player Journey:** Local state update only

### Stage F: UI Subscription
**Location:** Component listeners
- **Live Events:** `InSessionBattle` subscribes to `inSessionRooms/{sessionId}` ✅
- **Island Raid:** `IslandRaidBattle` subscribes to `islandRaidBattleRooms/{gameId}` ✅
- **Player Journey:** Local state only ✅

## Key Findings

### 1. Mode Gating in BattleEngine
**Location:** `BattleEngine.executePlayerMove()` line ~3414
```typescript
if (isMultiplayer && !isInSession && !isSinglePlayerWithAI) {
  // Just store the move - execution will happen when turn order is calculated
  return; // ⚠️ POTENTIAL ISSUE: Returns early without executing
}
```

**Issue:** This check may be preventing execution in some modes. Need to verify:
- Is `isInSession` correctly set for Live Events?
- Is `isMultiplayer` correctly set for Island Raid?
- Does turn order calculation actually trigger execution?

### 2. Firestore Path Consistency
- **Live Events:** ✅ Uses `inSessionRooms/{sessionId}` (instrumented)
- **Island Raid:** Uses `islandRaidBattleRooms/{gameId}` (not instrumented yet)
- **Player Journey:** No Firestore writes (local only)

### 3. Error Handling
**Location:** `inSessionMoveService.applyInSessionMove()`
- ✅ Errors are caught and returned as `{ success: false, message }`
- ✅ Permission errors are explicitly checked
- ✅ Errors are logged via `battleError()`

### 4. Transaction Conflicts
**Location:** `inSessionMoveService.applyInSessionMove()`
- Uses `runTransaction()` which handles conflicts automatically
- May fail with `failed-precondition` if multiple players act simultaneously

## Next Steps

1. ✅ Instrument skill click, target select, action submit
2. ✅ Instrument Firestore write attempts and errors
3. ⏳ Instrument Island Raid battle actions
4. ⏳ Check Firestore security rules for all paths
5. ⏳ Verify `isInSession` flag is set correctly
6. ⏳ Check if turn order calculation blocks execution


