# Battle Action Pipeline Analysis

## Step 0: Action Pipeline Map

### Mode Comparison Table

| Mode | Action Submit Function | State Update Location | Log Write Function | Storage Root | Resolver |
|------|----------------------|----------------------|-------------------|--------------|----------|
| **Battle Arena (PvP)** | `BattleEngine.executePlayerMove()` → `handleAnimationComplete()` | Local state + Firestore `battleRooms/{id}/moves` | `newLog.push()` → `setBattleState()` | `battleRooms/{battleRoomId}` | Client-side in `handleAnimationComplete()` |
| **Battle Arena (CPU)** | `BattleEngine.executePlayerMove()` → `handleAnimationComplete()` | Local state only | `newLog.push()` → `setBattleState()` | Local React state | Client-side in `handleAnimationComplete()` |
| **Live Events** | `BattleEngine.executePlayerMove()` → `handleAnimationComplete()` → `applyInSessionMove()` | Firestore transaction `inSessionRooms/{sessionId}` | `applyInSessionMove()` writes to `session.battleLog` array | `inSessionRooms/{sessionId}` | Transaction in `applyInSessionMove()` |
| **Island Raid** | `BattleEngine.executePlayerMove()` → `handleAnimationComplete()` | Firestore `islandRaidBattleRooms/{gameId}` | `newLog.push()` → `setBattleState()` | `islandRaidBattleRooms/{gameId}` | Client-side + Firestore listeners |
| **Player Journey** | `BattleEngine.executePlayerMove()` → `handleAnimationComplete()` | Local state only | `newLog.push()` → `setBattleState()` | Local React state | Client-side in `handleAnimationComplete()` |
| **Story Episode** | Custom `executeMove()` in `StoryEpisodeBattle.tsx` | Local state only | `addToBattleLog()` → local state | Local React state | Client-side in `executeMove()` |

## Step 1: Canonical Pipeline (Battle Arena CPU Mode)

**Why this is canonical:**
- ✅ Skills execute correctly
- ✅ Battle logs show consistently
- ✅ HP/Shield updates work
- ✅ Simple, direct execution path
- ✅ Used by most battle modes

### Canonical Flow:

```
1. Skill Click → handleMoveSelect()
2. Target Click → handleTargetSelect()
3. Phase → 'execution'
4. executePlayerMove() → triggers animation
5. handleAnimationComplete():
   a. Calculate damage/shield/healing/ppCost
   b. Apply to local state (vault, opponent)
   c. newLog.push(battleLogMessage)
   d. setBattleState({ battleLog: newLog, ... })
6. UI re-renders with updated state
```

### Key Functions:
- **Skill Resolution**: `handleAnimationComplete()` lines ~3600-4300
- **Log Writing**: `newLog.push()` → `setBattleState({ battleLog: newLog })`
- **State Update**: Direct React state updates

## Step 2: Live Events Divergence Analysis

### Current Live Events Flow:

```
1. Skill Click → InSessionBattle → dispatchEvent('inSessionMoveSelect')
2. BattleEngine.handleExternalMoveSelect() receives event
3. handleMoveSelect() + handleTargetSelect()
4. Phase → 'execution'
5. executePlayerMove() → triggers animation
6. handleAnimationComplete():
   a. Calculate damage/shield/healing/ppCost (SAME as canonical)
   b. Call applyInSessionMove() with calculated values
   c. applyInSessionMove() writes to Firestore transaction
   d. Transaction updates session.players[uid] and session.battleLog
7. InSessionBattle subscribes to session document
8. UI updates from Firestore snapshot
```

### Divergence Points:

1. **State Update**: Live Events uses Firestore transaction instead of local state
   - ✅ This is CORRECT for multiplayer
   - ❌ BUT: Transaction may fail silently or not trigger subscriptions

2. **Log Writing**: Live Events writes to `session.battleLog` array in transaction
   - ✅ This is CORRECT
   - ❌ BUT: May not be subscribed to correctly

3. **Skill Resolution**: Live Events calculates damage in `handleAnimationComplete()` then passes to `applyInSessionMove()`
   - ✅ This is CORRECT
   - ❌ BUT: If transaction fails, no error is shown to user

### Root Cause Hypothesis:

**The issue is NOT the pipeline structure - it's that:**
1. The Firestore transaction in `applyInSessionMove()` may be failing silently
2. The `InSessionBattle` component may not be subscribing to the correct Firestore path
3. The battle log subscription may not be updating the UI

## Step 3: Verification Needed

1. Check if `applyInSessionMove()` transaction is actually completing
2. Check if `InSessionBattle` is subscribing to `inSessionRooms/{sessionId}`
3. Check if battle log updates are being received
4. Check if state updates (HP/Shield) are being received

## Step 4: Proposed Solution

**Unify to use a single skill resolution function that:**
1. Takes actor state, target state, skill definition
2. Returns resolved action (damage, shield, healing, pp, log message)
3. Is called by ALL modes (canonical and Live Events)

**Unify log writing to:**
1. Single `formatBattleLogEntry()` function
2. Mode-specific adapters write to their storage (local state or Firestore)
3. All modes use same log format

**Unify state updates to:**
1. Single `applyBattleAction()` function
2. Mode-specific adapters apply to their storage
3. All modes use same state update logic


