# Live Events Full Audit - Architecture Map

## Step 0: Current Architecture Analysis

### Firestore Schema

#### Current Structure (Legacy)
**Primary Collection: `inSessionRooms/{sessionId}`**
```typescript
{
  id: string
  classId: string
  className: string
  teacherId: string  // Legacy field
  hostUid: string
  status: 'open' | 'active' | 'closed' | 'live' | 'ended'
  mode: 'in_session'
  createdAt: Timestamp
  startedAt?: Timestamp
  endedAt?: Timestamp
  updatedAt?: Timestamp
  
  // Players stored as ARRAY (not subcollection)
  players: SessionPlayer[]  // Array of player objects
  // SessionPlayer: { userId, displayName, photoURL, level, powerPoints, 
  //                  participationCount, movesEarned, eliminated?, hp?, maxHp?, 
  //                  shield?, maxShield? }
  
  // Battle log stored as ARRAY
  battleLog: string[]  // Array of log strings
  
  // Legacy fields
  activeViewers?: string[]  // Array of user IDs
}
```

**Subcollection: `inSessionRooms/{sessionId}/players/{uid}`**
```typescript
{
  connected: boolean
  lastSeenAt: Timestamp
  joinedAt: Timestamp
}
```

**Subcollection: `inSessionRooms/{sessionId}/actions/{actionId}`**
```typescript
{
  type: 'ATTACK' | 'SKILL' | 'ITEM' | 'VAULT' | 'SYSTEM'
  actorUid: string
  targetUid?: string
  skillId?: string
  payload: {
    damage?: number
    healing?: number
    shieldDamage?: number
    shieldBoost?: number
    ppCost?: number
    [key: string]: any
  }
  createdAt: Timestamp
  clientNonce: string
  resolved: boolean
  resolvedAt?: Timestamp
  resolvedBy?: string
  result?: {
    success: boolean
    message: string
    [key: string]: any
  }
}
```

**Note:** There is NO dedicated `battleLog` subcollection - logs are stored in the session doc's `battleLog` array.

### File Structure

#### Routes/Pages
- **`/live-events`** → `src/pages/LiveEvents.tsx` (Main listing page)
- **`/live-events/:eventId`** → `src/components/InSessionBattleView.tsx` (Battle view)
- **`/in-session/:sessionId`** → `src/components/InSessionBattleView.tsx` (Backward compatibility)

#### Components
- **`src/pages/LiveEvents.tsx`** - Lists active events, handles join
- **`src/components/InSessionBattleView.tsx`** - Wrapper that loads session and renders InSessionBattle
- **`src/components/InSessionBattle.tsx`** - Main battle component (2696 lines)
- **`src/components/InSessionRoom.tsx`** - Legacy room component
- **`src/components/InSessionCreate.tsx`** - Legacy create component
- **`src/components/InSessionNotification.tsx`** - Notification component

#### Service Files
- **`src/utils/inSessionService.ts`** - Session CRUD (create, join, end, subscribe)
- **`src/utils/inSessionPresenceService.ts`** - Presence/heartbeat tracking
- **`src/utils/inSessionActionsService.ts`** - Action pipeline (submit, resolve, subscribe)
- **`src/utils/inSessionMoveService.ts`** - Authoritative move application (transaction-based)
- **`src/utils/inSessionSkillsService.ts`** - Skill validation and loadout
- **`src/utils/inSessionStatsService.ts`** - Stats tracking
- **`src/utils/inSessionDebug.ts`** - Debug utilities

### Join/Rejoin Flow

#### Event Discovery (`LiveEvents.tsx`)
1. Query: `inSessionRooms` collection
2. Filter: `where('status', 'in', ['open', 'active', 'live'])`
3. Client-side filter: Only show events where `classId` matches user's classrooms
4. **ISSUE**: Query doesn't filter by `classId` in Firestore - does client-side filtering

#### Join Flow (`inSessionService.ts::joinSession`)
1. Read session doc
2. Check if player exists in `players` array
3. If exists: Update player in array
4. If new: Add to array, add log entry, initialize stats
5. Create/update presence doc in `players/{uid}` subcollection
6. **ISSUE**: Not transactional - race conditions possible
7. **ISSUE**: `playerCount` not tracked - computed from array length

#### Rejoin Flow
- Same as join (idempotent by design)
- **ISSUE**: No explicit rejoin detection - just updates existing player

### Move Execution Flow

#### Current Flow (`BattleEngine.tsx` → `inSessionMoveService.ts`)
1. Player selects move in `BattleEngine`
2. `executePlayerMove` calls `applyInSessionMove` (transaction-based)
3. `applyInSessionMove`:
   - Reads session doc in transaction
   - Finds actor/target in `players` array
   - Applies damage/healing/shield changes
   - Updates `players` array
   - Adds entry to `battleLog` array
   - Commits transaction
4. **ISSUE**: Battle log updates happen in multiple places:
   - `applyInSessionMove` adds entry
   - `handleBattleLogUpdate` in `InSessionBattle.tsx` also updates
   - `handleMoveConsumption` may add entries
   - Race conditions possible

#### Action Pipeline (`inSessionActionsService.ts`)
- Actions can be submitted to `actions` subcollection
- Actions can be resolved by host
- **ISSUE**: Not currently used by move execution - moves go directly to `applyInSessionMove`
- **ISSUE**: No resolver running - actions stay pending

### Battle Log Flow

#### Current Implementation
1. **Storage**: `inSessionRooms/{sessionId}.battleLog` (string array)
2. **Writes**:
   - `applyInSessionMove` adds entry during move transaction
   - `handleBattleLogUpdate` in `InSessionBattle.tsx` updates entire array
   - `handleMoveConsumption` adds entries
   - `joinSession` adds join message
3. **Reads**:
   - `subscribeToSession` callback receives `session.battleLog`
   - Updates local state: `setBattleLog(session.battleLog)`
4. **ISSUES**:
   - Multiple writers can cause race conditions
   - Array updates can overwrite concurrent changes
   - No ordering guarantee (array order depends on write order)
   - No serverTimestamp() for ordering (uses client timestamps)
   - Missing entries if multiple clients write simultaneously

### Presence/Connectivity

#### Current Implementation (`inSessionPresenceService.ts`)
1. **Heartbeat**: Updates `players/{uid}.lastSeenAt` every 15s
2. **Stale Detection**: Marks offline if `lastSeenAt` > 45s old
3. **Subscription**: `subscribeToPresence` reads all player presence docs
4. **ISSUES**:
   - Presence subscription does individual `getDoc` calls for each player (N+1 queries)
   - No collection group query optimization
   - Presence updates can fail silently if doc doesn't exist

### Identified Issues Summary

#### Connectivity Issues
1. ❌ Join not transactional - race conditions with concurrent joins
2. ❌ Query doesn't filter by `classId` in Firestore (client-side only)
3. ❌ No `playerCount` field - computed from array length (can be wrong)
4. ❌ Presence subscription inefficient (N+1 queries)
5. ❌ Rejoin doesn't explicitly reset presence state

#### Gameplay Issues
1. ❌ Move execution writes directly to session doc (no action pipeline)
2. ❌ Battle log updates happen in multiple places (race conditions)
3. ❌ No action resolver running (actions subcollection unused)
4. ❌ State updates not always transactional (some use `updateDoc` directly)
5. ❌ Multiple clients can write battle log simultaneously

#### Battle Log Issues
1. ❌ Log stored as array in session doc (no ordering guarantee)
2. ❌ Multiple writers can overwrite each other
3. ❌ No serverTimestamp() for proper ordering
4. ❌ Missing entries on concurrent writes
5. ❌ No dedicated subcollection for logs

### Recommended New Structure

#### Proposed: `classrooms/{classId}/liveEvents/{eventId}`
```typescript
{
  id: string
  classId: string
  className: string
  hostUid: string
  status: 'waiting' | 'live' | 'ended'
  maxPlayers?: number
  playerCount: number  // Tracked field
  createdAt: Timestamp
  startedAt?: Timestamp
  endedAt?: Timestamp
  lastActivityAt: Timestamp
}
```

#### Proposed: `classrooms/{classId}/liveEvents/{eventId}/players/{uid}`
```typescript
{
  uid: string
  displayName: string
  photoURL?: string
  level: number
  powerPoints: number
  participationCount: number
  movesEarned: number
  eliminated: boolean
  hp?: number
  maxHp?: number
  shield?: number
  maxShield?: number
  joinedAt: Timestamp
  connected: boolean
  lastSeenAt: Timestamp
}
```

#### Proposed: `classrooms/{classId}/liveEvents/{eventId}/actions/{actionId}`
```typescript
{
  type: 'SKILL' | 'ATTACK' | 'ITEM' | 'SYSTEM'
  actorUid: string
  targetUid?: string
  skillId?: string
  clientNonce: string
  createdAt: serverTimestamp()
  status: 'pending' | 'resolved' | 'rejected'
  result?: {
    damage?: number
    healing?: number
    shieldDamage?: number
    shieldBoost?: number
    ppCost?: number
    success: boolean
    message: string
  }
}
```

#### Proposed: `classrooms/{classId}/liveEvents/{eventId}/battleLog/{logId}`
```typescript
{
  createdAt: serverTimestamp()
  text: string
  type: 'system' | 'action' | 'reward'
  actorUid?: string
  targetUid?: string
  actionId?: string  // Link to action if applicable
}
```

### Next Steps

1. **Step 1**: Fix connectivity (join/rejoin with transactions)
2. **Step 2**: Implement action pipeline with resolver
3. **Step 3**: Migrate battle log to subcollection
4. **Step 4**: Add diagnostics panel

