# Island Raid Connectivity Audit & Debug Plan

**Date:** 2024
**Status:** 🔴 CRITICAL - Multiple connectivity issues preventing reliable 4-player raids

## Executive Summary

Island Raid mode has **connectivity and reliability issues** preventing groups from consistently joining lobbies, starting raids together, and completing raids together. Root causes include:

1. **Array-based player storage** (not subcollection) makes presence tracking difficult
2. **No per-player presence/heartbeat** (only lobby-level `lastActivityAt`)
3. **Race conditions** in join/leave (partially fixed with transactions, but array-based)
4. **No action log pattern** for gameplay state sync (risk of desync)
5. **Missing Firestore rules** for security

## Current Firestore Schema

### `islandRunLobbies/{lobbyId}`
```typescript
{
  name: string
  hostId: string
  maxPlayers: 4
  currentPlayers: number  // Cached count
  difficulty: 'easy' | 'normal' | 'hard' | 'nightmare'
  status: 'waiting' | 'starting' | 'in_progress' | 'expired'
  players: Array<IslandRunPlayer>  // ❌ PROBLEM: Array, not subcollection
  createdAt: Timestamp
  updatedAt: Timestamp
  lastActivityAt: Timestamp  // ❌ Lobby-level only, not per-player
  gameId?: string
}
```

### `islandRunLobbies/{lobbyId}/members/{uid}` 
**❌ DOES NOT EXIST** - This is the problem. Current implementation uses `players` array.

### `islandRaidGames/{gameId}`
```typescript
{
  lobbyId: string
  hostId: string
  difficulty: string
  status: 'in_progress'
  players: string[]  // Array of UIDs
  waveNumber: number
  maxWaves: number
  createdAt: Timestamp
}
```

### `islandRaidBattleRooms/{gameId}`
```typescript
{
  gameId: string
  lobbyId: string
  players: string[]  // Array of UIDs
  enemies: Enemy[]
  waveNumber: number
  maxWaves: number
  status: 'active'
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

## Current Implementation Files

### Join/Leave Logic
- **File:** `src/utils/raidLobbyService.ts`
- **Functions:**
  - `joinRaidLobby()` - ✅ Uses transactions
  - `leaveRaidLobby()` - ✅ Uses transactions
  - `touchRaidLobby()` - ⚠️ Updates lobby-level `lastActivityAt` only
- **Problem:** Array-based `players` field makes presence tracking per-player difficult

### Lobby UI
- **File:** `src/components/IslandRunLobby.tsx`
- **Features:**
  - Join on mount (transactional)
  - Heartbeat every 15s (lobby-level)
  - Ready toggle
  - Start game (host only)
- **Problems:**
  - Heartbeat doesn't track per-player presence
  - No cleanup of stale members

### Battle State
- **File:** `src/components/IslandRaidBattle.tsx`
- **Features:**
  - Joins battle room on mount
  - Syncs enemies state via `onSnapshot`
- **Problems:**
  - No action log pattern
  - Direct state writes (risk of race conditions)

## Root Cause Analysis

### Issue 1: Array-Based Player Storage ❌
**Problem:** Players stored in array makes it hard to:
- Track per-player `connected` status
- Track per-player `lastSeenAt`
- Clean up stale members efficiently

**Impact:** Ghost slots when users close tabs, no way to detect disconnected players

### Issue 2: Lobby-Level Heartbeat Only ❌
**Problem:** `touchRaidLobby()` updates `lastActivityAt` at lobby level, not per-player

**Impact:** Can't distinguish which player is active/inactive

### Issue 3: No Member Subcollection ❌
**Problem:** No `members/{uid}` subcollection means:
- Can't easily query "who is connected"
- Can't atomically update one member's status
- Hard to implement per-player heartbeat

**Impact:** Presence tracking impossible, ghost slots persist

### Issue 4: No Action Log for Battle State ⚠️
**Problem:** Battle state updates go directly to `islandRaidBattleRooms/{gameId}`
- Multiple clients can write simultaneously
- No idempotency keys
- Risk of lost updates or duplicates

**Impact:** Desync during gameplay, inconsistent state

### Issue 5: Missing Firestore Rules ❌
**Problem:** No security rules found for `islandRunLobbies`
- Anyone authenticated can write
- Risk of malicious state changes

## Current Join Flow (Step-by-Step)

1. **User navigates to `/island-raid/lobby/{lobbyId}`**
2. **`IslandRunLobby.tsx` mounts**
3. **`useEffect` calls `joinRaidLobby()`** (transactional)
4. **Transaction:**
   - Read `islandRunLobbies/{lobbyId}`
   - Check `status === 'waiting'` and `players.length < maxPlayers`
   - Check if user already in `players` array
   - If new: append to `players` array, increment `currentPlayers`
   - Update `lastActivityAt` (lobby-level)
5. **Heartbeat starts** (15s interval, updates lobby-level `lastActivityAt`)
6. **User toggles ready**
7. **Host starts game** → creates `islandRaidGames/{gameId}` and `islandRaidBattleRooms/{gameId}`
8. **All players route to `/island-raid/game/{gameId}`**

**Failure Points:**
- Step 4: Array append in transaction (works but not ideal for presence)
- Step 5: Heartbeat at lobby-level only
- Step 7: No locking/transaction for "start game"
- Step 8: Players may not all route simultaneously

## Current Leave Flow

1. **User clicks "Leave" or closes tab**
2. **`leaveRaidLobby()` transaction:**
   - Read lobby
   - Remove user from `players` array
   - Decrement `currentPlayers`
   - If host leaves → mark `status: 'expired'`
3. **Cleanup on unmount** (calls `leaveRaidLobby()`)

**Failure Points:**
- Tab close: `beforeunload` may not fire reliably
- No member subcollection means no `connected: false` flag
- Ghost slot if cleanup fails

## Debugging Strategy

### Enable Debug Logging
```bash
REACT_APP_DEBUG_RAID=true npm start
```

**Log Points:**
- ✅ `joinRaidLobby()` - logs join attempts, transaction results
- ✅ `leaveRaidLobby()` - logs leave attempts
- ⚠️ Need to add: Snapshot updates, Firestore errors, state changes

### Test Scenarios

1. **4 Users Join Same Lobby**
   - Expected: All 4 join successfully, count = 4
   - Actual: ? (need to test)

2. **5th User Attempts Join**
   - Expected: Blocked with "Lobby is full"
   - Actual: ? (need to test)

3. **User Refreshes Page**
   - Expected: Rejoins (idempotent), no duplicate
   - Actual: ? (need to test)

4. **User Closes Tab**
   - Expected: Removed from lobby (or marked disconnected)
   - Actual: Ghost slot remains

5. **All Players Ready → Host Starts**
   - Expected: All route to same game, game state synced
   - Actual: ? (need to test)

## Proposed Solution Architecture

### Step 1: Migrate to Member Subcollection
**Change:** Add `islandRunLobbies/{lobbyId}/members/{uid}` subcollection

**Benefits:**
- Per-player `connected` and `lastSeenAt`
- Atomic updates per player
- Easy to query active members

**Migration Strategy:**
- Keep `players` array for backward compatibility (read from both)
- Write to both `players` array AND `members/{uid}` subcollection
- Gradually migrate UI to read from `members` subcollection

### Step 2: Per-Player Heartbeat
**Change:** Update `members/{uid}.lastSeenAt` every 10-15s

**Benefits:**
- Detect disconnected players
- Auto-cleanup stale members (>45s inactive)

### Step 3: Action Log Pattern
**Change:** Use `islandRaidBattleRooms/{gameId}/actions/{actionId}` for state updates

**Benefits:**
- Idempotent actions (clientNonce)
- Single resolver (host or Cloud Function)
- No race conditions

### Step 4: Firestore Rules
**Add rules:**
- Users can only write their own `members/{uid}` doc
- Host can start game (update lobby status)
- Only authorized clients can write actions

## Implementation Plan

1. ✅ **Audit** (this document)
2. ⏳ **Step 1:** Migrate to member subcollection (keep array for now)
3. ⏳ **Step 2:** Add per-player heartbeat
4. ⏳ **Step 3:** Fix ready/start flow
5. ⏳ **Step 4:** Add action log pattern
6. ⏳ **Step 5:** Add Firestore rules
7. ⏳ **Testing:** 4 browsers → join → ready → start → complete

## Acceptance Criteria

- [ ] 4 unique users can join the same lobby
- [ ] 5th user is blocked with clear error
- [ ] Refresh doesn't create duplicate membership
- [ ] Closing tab removes user (or marks disconnected within 45s)
- [ ] All players can see ready status in real-time
- [ ] Host can start when all ready (or at least 1 player)
- [ ] All players route to same game instance
- [ ] Game state stays synced (enemy HP, player HP, actions)
- [ ] Raid can be completed together
- [ ] Rewards applied once per player

## Next Steps

1. Implement member subcollection (keep array for backward compat)
2. Add per-player heartbeat
3. Fix start flow (transactional, snapshot roster)
4. Add action log pattern for battle state
5. Add Firestore rules
6. Test with 4 browsers


