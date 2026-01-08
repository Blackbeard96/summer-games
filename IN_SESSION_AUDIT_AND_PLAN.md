# In Session Mode - Current System Audit & Implementation Plan

## Step 0: Current System Map

### Current Data Model

**Firestore Collections:**
1. **`inSessionRooms/{sessionId}`** - Main session document
   - Fields: `classId`, `className`, `teacherId`, `status` ('open' | 'active' | 'closed')
   - `players[]` - Array of `SessionPlayer` objects (NOT a subcollection)
   - `activeViewers[]` - Array of user IDs currently viewing
   - `battleLog[]` - Array of log strings
   - `createdAt`, `startedAt`, `endedAt` timestamps

2. **`classrooms/{classId}`** - Classroom documents
   - `students[]` - Array of student IDs
   - No direct session reference

3. **`vaults/{uid}`** - Player vault data (used for battle stats)
4. **`students/{uid}`** - Student data
5. **`users/{uid}`** - User profile data (displayName, photoURL)

### Current Join Flow

1. **Admin creates session** (`ClassroomManagement.tsx:1042-1097`)
   - Creates `inSessionRooms` doc with `status: 'active'`
   - Initializes empty `players[]` array
   - Sets `activeViewers: [adminUid]`

2. **Student joins** (`InSessionNotification.tsx:326-382` or `InSessionBattle.tsx:236-288`)
   - Uses `arrayUnion()` to add player to `players[]` array
   - Adds user to `activeViewers[]`
   - Updates `battleLog` with join message

3. **Auto-join on page load** (`InSessionBattle.tsx:236-288`)
   - Checks if user is in `players[]`
   - If not, automatically adds them

### Current Presence Tracking

**Method:** Firestore heartbeat + `activeViewers` array
- **Heartbeat:** Every 30 seconds, user writes to `activeViewers` array (`InSessionBattle.tsx:199-201`)
- **Page visibility:** Removes from `activeViewers` on `visibilitychange` hidden
- **Page unload:** Removes from `activeViewers` on `beforeunload`
- **No Realtime Database presence** - Only Firestore

**Issues:**
- No reliable disconnect detection (45s stale threshold not enforced)
- `activeViewers` array can have duplicates
- No `connected` boolean per player
- No `lastSeenAt` timestamp per player

### Current Battle Actions

**No dedicated actions collection** - Actions are executed directly:
- Move selection triggers `BattleEngine.executePlayerMove()` immediately
- No action queue or resolution pipeline
- Battle log is updated in session doc directly
- No server-authoritative validation

**Issues:**
- Actions can be lost on refresh
- No deduplication (clientNonce missing)
- No validation of PP costs before execution
- No deterministic turn order

### Current Skills/Moves Available

**Source:** `BattleContext.moves` array (from `battleMoves/{uid}/moves[]`)
- Filtered by `unlocked: true`
- No session-specific loadout snapshot
- No unified selector for Manifest + Elemental + RR Candy
- PP gating uses `movesEarned` (participation points) not actual PP

**Issues:**
- Skills may not appear if not in `battleMoves` collection
- No guarantee all unlocked skills are available
- PP gating inconsistent (uses `movesEarned` not vault PP)

### Current Battle Options UI

**Location:** `InSessionBattle.tsx:1645-1762`
- Shows: **FIGHT**, **BAG**, **VAULT**
- **No RUN button** (already correct!)
- Buttons disabled when `movesEarned === 0`

**Issues:**
- Uses `movesEarned` (participation) not actual PP for gating
- No check for actual skill PP costs

### Current Admin Hosting

**Location:** `ClassroomManagement.tsx:1042-1097`
- Only admins can start sessions (checked via `isAdmin`)
- Creates session with `teacherId: currentUser.uid`
- No special Yondaime global host logic
- No session ending logic (only status change to 'closed')

**Issues:**
- No Yondaime global host permission
- No proper session ending (finalize results, stats)
- No check for existing active session before creating

### Current Security Rules

**Location:** `firestore.rules`
- **No rules for `inSessionRooms` collection** (default deny)
- Classroom rules exist but don't cover sessions
- Students can't write to sessions (only admins via client code)

**Issues:**
- Missing security rules for sessions
- No validation of player writes
- No protection against unauthorized action writes

---

## Root Cause Analysis

### 1. Connectivity Issues
- **Problem:** Players appear disconnected, roster desyncs
- **Root Cause:**
  - No reliable presence system (heartbeat only, no disconnect detection)
  - `players[]` array in single doc causes contention
  - No `connected` field per player
  - `activeViewers` is separate from `players`, causing confusion

### 2. Join/Rejoin Issues
- **Problem:** Joining/rejoining unreliable, duplicate entries
- **Root Cause:**
  - `arrayUnion()` can fail silently on Firestore errors
  - No idempotent join logic (checks exist but race conditions)
  - No rejoin detection (just auto-joins if not in array)

### 3. Action Desync
- **Problem:** Moves/skills don't show, state desyncs
- **Root Cause:**
  - No action pipeline (direct execution)
  - No action queue or resolution
  - Battle log updates can be lost
  - No cooldown tracking in session state

### 4. Skills Missing
- **Problem:** RR Candy and other skills don't appear
- **Root Cause:**
  - Skills loaded from `battleMoves` collection, not unified service
  - No session loadout snapshot
  - No guarantee all unlocked skills are fetched

### 5. PP Gating Issues
- **Problem:** PP gating inconsistent
- **Root Cause:**
  - Uses `movesEarned` (participation) not actual vault PP
  - No validation of skill PP costs before execution
  - No unified PP calculation

---

## Implementation Plan

### Files to Create/Modify

#### NEW FILES:
1. **`src/utils/inSessionService.ts`** - Canonical session management
   - `createSession()`, `joinSession()`, `endSession()`
   - `updatePlayerPresence()`, `getSessionPlayers()`
   - `subscribeToSession()`

2. **`src/utils/inSessionActionsService.ts`** - Action pipeline
   - `submitAction()`, `resolveAction()`, `getPendingActions()`
   - `subscribeToActions()`

3. **`src/utils/inSessionSkillsService.ts`** - Unified skills for session
   - `getSessionLoadout()`, `validateSkillUsage()`
   - `getAvailableSkillsForSession()`

4. **`src/utils/inSessionPresenceService.ts`** - Presence management
   - `startPresence()`, `stopPresence()`, `getConnectedPlayers()`
   - Heartbeat management

5. **`src/utils/inSessionDebug.ts`** - Debug logging utility
   - `debug()`, `throttle()`, `group()`
   - Toggle via `REACT_APP_DEBUG_SESSION`

#### MODIFY FILES:
1. **`src/components/InSessionBattle.tsx`**
   - Replace direct Firestore calls with service functions
   - Use presence service for connectivity
   - Use actions service for move execution
   - Use skills service for available moves
   - Remove RUN button (already done, verify)

2. **`src/components/InSessionNotification.tsx`**
   - Use session service for join logic
   - Use presence service for rejoin detection

3. **`src/components/ClassroomManagement.tsx`**
   - Use session service for create/end session
   - Add Yondaime global host check
   - Add session ending logic

4. **`src/components/BattleEngine.tsx`**
   - Check `isInSession` mode and hide RUN button
   - Use actions service for move submission in session mode

5. **`firestore.rules`**
   - Add rules for `inSessionRooms` collection
   - Add rules for `inSessionRooms/{id}/players/{uid}` subcollection
   - Add rules for `inSessionRooms/{id}/actions/{actionId}` subcollection

6. **`src/types/inSession.ts`**
   - Update `InSessionRoom` interface
   - Add `SessionAction` interface
   - Add `SessionPlayerPresence` interface

---

## Step-by-Step Implementation

### Step 1: Fix Roster + Presence

**Data Model Changes:**
- Migrate `players[]` array to `players/{uid}` subcollection
- Add `connected: boolean`, `lastSeenAt: timestamp` to each player doc
- Keep `activeViewers[]` for quick lookup, but use subcollection as source of truth

**Implementation:**
1. Create `inSessionPresenceService.ts` with heartbeat (15s interval)
2. Update `InSessionBattle.tsx` to use presence service
3. Add `onSnapshot` listener for `players` subcollection
4. Mark offline if `lastSeenAt` > 45s ago

### Step 2: Realtime Actions

**Data Model:**
- Create `inSessionRooms/{sessionId}/actions/{actionId}` subcollection
- Each action: `type`, `actorUid`, `targetUid`, `skillId`, `payload`, `createdAt`, `clientNonce`, `resolved: boolean`

**Implementation:**
1. Create `inSessionActionsService.ts`
2. Modify `BattleEngine` to submit actions instead of executing directly
3. Host resolves actions (or Cloud Function if available)
4. All clients subscribe to actions and update UI

### Step 3: Unified Skills

**Implementation:**
1. Create `inSessionSkillsService.ts`
2. On join, snapshot user's unlocked skills (Manifest + Elemental + RR Candy)
3. Store in `players/{uid}/activeLoadout` field
4. Use `getUserUnlockedSkillsForBattle()` from `battleSkillsService.ts`
5. Validate PP costs before allowing skill usage

### Step 4: UI Restrictions

**Implementation:**
1. Verify `BattleEngine` hides RUN when `isInSession={true}` (already done)
2. Ensure `InSessionBattle` only shows Fight/Bag/Vault (already done)
3. Add check to prevent RUN via hotkeys

### Step 5: Admin Hosting

**Implementation:**
1. Create `isGlobalHost(uid)` helper (checks for Yondaime UID)
2. Update `ClassroomManagement` to check `isAdmin || isGlobalHost`
3. Add session ending logic (finalize stats, set `endedAt`)
4. Prevent duplicate active sessions per class

### Step 6: Security Rules

**Implementation:**
1. Add rules for `inSessionRooms` read (students in class)
2. Add rules for `players/{uid}` write (own doc only)
3. Add rules for `actions/{actionId}` create (students in class)
4. Add rules for actions resolve (host/admin only)

---

## Test Plan

### Local Testing (2-3 Browser Windows)

1. **Host Session**
   - Admin opens Classroom Management
   - Clicks "Start In Session" for a class
   - Verify session created, status = 'active'

2. **Join with 2 Users**
   - User 1: Click "Join Session" notification
   - User 2: Click "Join Session" notification
   - Verify both appear in roster within 1-2 seconds
   - Verify both show as "connected"

3. **Use Skills**
   - User 1: Select skill, target User 2
   - Verify both clients see HP/shield change
   - Verify battle log updates on both
   - Verify PP deducted correctly

4. **Refresh/Rejoin**
   - User 1: Refresh browser
   - Verify User 1 stays in roster
   - Verify User 1 shows as "connected" after refresh
   - User 2: Close tab, reopen
   - Verify User 2 can rejoin and see current state

5. **Eliminate Player**
   - User 1: Attack User 2 until HP = 0
   - Verify User 2 marked as eliminated
   - Verify User 2 stays in roster
   - Verify User 2 can't use skills but can view

---

## Deliverables Checklist

- [ ] Root-cause report (this document)
- [ ] `inSessionService.ts` - Session management
- [ ] `inSessionPresenceService.ts` - Presence tracking
- [ ] `inSessionActionsService.ts` - Action pipeline
- [ ] `inSessionSkillsService.ts` - Unified skills
- [ ] `inSessionDebug.ts` - Debug utility
- [ ] Updated `InSessionBattle.tsx`
- [ ] Updated `InSessionNotification.tsx`
- [ ] Updated `ClassroomManagement.tsx`
- [ ] Updated `BattleEngine.tsx` (verify RUN hidden)
- [ ] Updated `firestore.rules`
- [ ] Updated `types/inSession.ts`
- [ ] Test plan document

---

## Next Steps

1. Review this audit with user
2. Get approval to proceed
3. Implement Step 1 (Roster + Presence) first
4. Test Step 1 before proceeding
5. Continue with Steps 2-6 incrementally




