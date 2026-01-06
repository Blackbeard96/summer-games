# Island Raid Mode Audit Report

## Current Firestore Schema

### Collection: `islandRunLobbies`
**Path:** `islandRunLobbies/{lobbyId}`

**Fields:**
- `name`: string
- `hostId`: string (userId)
- `maxPlayers`: number (4)
- `currentPlayers`: number
- `difficulty`: 'easy' | 'normal' | 'hard' | 'nightmare'
- `status`: 'waiting' | 'starting' | 'in_progress'
- `players`: Array<IslandRunPlayer> (stored as array in doc, NOT subcollection)
- `createdAt`: Timestamp
- `updatedAt`: Timestamp
- `gameId`: string (optional, reference to islandRaidGames)

**IslandRunPlayer Interface:**
```typescript
{
  userId: string;
  displayName: string;
  photoURL?: string;
  level: number;
  xp: number;
  health: number;
  maxHealth: number;
  shieldStrength: number;
  maxShieldStrength: number;
  equippedArtifacts: any;
  moves: any[];
  actionCards: any[];
  isReady: boolean;
  isLeader: boolean;
}
```

### Related Collections:
- `islandRaidGames/{gameId}` - Game state
- `islandRaidBattleRooms/{gameId}` - Battle room state

## Current Join Flow Issues

### 1. **Race Conditions (CRITICAL)**
- **Location:** `src/components/IslandRunLobby.tsx` → `addPlayerToLobby()`
- **Problem:** Uses `updateDoc` without transactions
- **Race Scenario:** Two players join simultaneously → both read `currentPlayers: 2`, both write `currentPlayers: 3` → count becomes 3 instead of 4, or exceeds maxPlayers
- **Evidence:** Lines 58-63: Direct `updateDoc` after checking `players.length >= 4`

### 2. **Multiple Join Attempts**
- **Location:** `src/components/IslandRunLobby.tsx` → `useEffect` (lines 73-162)
- **Problem:** Complex retry logic with `hasJoinedRef` can cause duplicate joins
- **Evidence:** Lines 84-125 have multiple retry paths that can execute concurrently

### 3. **No Leave Cleanup**
- **Problem:** No `handleLeaveLobby` function
- **Problem:** No cleanup on component unmount or page close
- **Result:** Ghost slots when users close tabs

### 4. **No Presence/Heartbeat**
- **Problem:** No connection tracking
- **Problem:** No `lastSeenAt` or `connected` fields
- **Result:** Cannot detect disconnected players

### 5. **No Rejoin Support**
- **Problem:** No stored `activeRaidLobbyId` in user doc
- **Problem:** No query to find user's active lobbies

## Max Players Enforcement

**Current:** Client-side check only (line 53: `if (players.length >= 4)`)
**Problem:** Not atomic, can be bypassed by race conditions
**Missing:** Transaction-level enforcement, Firestore rules

## Auto-Expire Issues

**Missing:**
- No `lastActivityAt` field
- No cleanup mechanism (Cloud Functions or client-side)
- Stale lobbies persist indefinitely

## Skills in Island Raid

**Current:** `BattleEngine.tsx` uses `getUserUnlockedSkillsForBattle()` (lines 1276-1313)
**Service:** `src/utils/battleSkillsService.ts` → `getUserUnlockedSkillsForBattle()`
**Skills Included:** Manifest + Elemental + RR Candy + System
**Status:** ✅ Appears to work correctly, but needs verification for Island Raid context

## Gameplay State Sync

**Current:**
- Battle state stored in `islandRaidBattleRooms/{gameId}`
- Uses `onSnapshot` for real-time updates
- Moves stored in Firestore (line 1436-1460 in BattleEngine.tsx)

**Potential Issues:**
- No idempotency keys for actions
- No transaction-based state updates
- Risk of duplicate action processing on reconnect

## Firestore Rules

**Status:** ❌ NO RULES FOUND for `islandRunLobbies` collection
**Risk:** Anyone can create/delete/modify lobbies if authenticated

## Root Cause Summary

1. **Join Failures:** Race conditions from non-transactional updates
2. **Ghost Slots:** No presence/heartbeat, no cleanup on disconnect
3. **Stale Lobbies:** No auto-expire mechanism
4. **Security:** Missing Firestore rules
5. **State Sync:** No idempotency/transaction protection for battle actions

