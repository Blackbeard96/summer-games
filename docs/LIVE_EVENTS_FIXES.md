# Live Events Skills & CTA Fixes

## Root Cause Analysis

### Problem 1: Skills Not Firing

**Root Cause**: The execution trigger in `BattleEngine.tsx` was blocking In-Session mode from executing moves. The `useEffect` that triggers `executePlayerMove()` was checking for multiplayer mode and returning early, preventing In-Session moves from executing.

**Files Changed**:
- `src/components/BattleEngine.tsx`
  - Added `isInSession` check in execution trigger to allow immediate execution
  - Added `isInSession` check in `handleTargetSelect` to set phase to 'execution' immediately
  - Added comprehensive debug logging throughout skill execution pipeline
  - Added error handling with user-facing alerts for failed moves

- `src/components/InSessionBattle.tsx`
  - Added debug logging for skill clicks and target selection
  - Enhanced event dispatch logging

- `src/utils/inSessionMoveService.ts`
  - Added debug logging for Firestore write attempts and results
  - Enhanced error logging with error codes

### Problem 2: Flickering "Rejoin Live Event" CTA

**Root Cause**: The membership check was updating state on every snapshot change, even when the membership status hadn't actually changed. This caused the CTA to flicker on/off rapidly.

**Files Changed**:
- `src/components/InSessionNotification.tsx`
  - Added `previousMembershipRef` to track previous membership state
  - Implemented stable update logic that only updates when:
    1. Session ID changes, OR
    2. Membership status changes AND is stable (not flickering)
  - Enhanced debug logging to track state changes

## Data Flow Diagram

```
UI Skill Click
  ↓
[InSessionBattle] setSelectedMove() + debug log
  ↓
User clicks target
  ↓
[InSessionBattle] dispatchEvent('inSessionMoveSelect') + debug log
  ↓
[BattleEngine] handleExternalMoveSelect() receives event + debug log
  ↓
[BattleEngine] handleMoveSelect() + handleTargetSelect()
  ↓
[BattleEngine] Phase set to 'execution' (immediate for In-Session)
  ↓
[BattleEngine] useEffect triggers executePlayerMove()
  ↓
[BattleEngine] handleAnimationComplete() → applyInSessionMove() + debug log
  ↓
[inSessionMoveService] applyInSessionMove() + Firestore transaction
  ↓
[Firestore] Write to inSessionRooms/{sessionId}
  ↓
[InSessionBattle] Session listener receives update
  ↓
UI updates with new player states + battle log
```

## Firestore Paths

- **Session Document**: `inSessionRooms/{sessionId}`
  - Fields: `players[]`, `battleLog[]`, `status`, `classId`, `className`
  
- **Player Presence**: `inSessionRooms/{sessionId}/players/{userId}`
  - Fields: `connected`, `lastSeenAt`, `joinedAt`

- **Action Resolution**: Actions are applied directly via transaction (no separate actions collection)

## Debug Mode

Enable comprehensive debug logging by setting:
```bash
REACT_APP_DEBUG_LIVE_EVENTS=true
```

Or enable all debug logging:
```bash
REACT_APP_DEBUG=true
```

## Testing Checklist

### Skills Execution
- [ ] Player not in event sees CTA (stable)
- [ ] Player joins → CTA disappears
- [ ] Player selects skill → debug log shows skill clicked
- [ ] Player selects target → debug log shows target clicked
- [ ] Event dispatched → debug log shows event received
- [ ] Phase set to 'execution' → debug log shows phase change
- [ ] executePlayerMove called → debug log shows execution start
- [ ] applyInSessionMove called → debug log shows Firestore write attempt
- [ ] Firestore write succeeds → debug log shows success
- [ ] Opponent state updates → HP/shield/PP changes visible
- [ ] Battle log entry appears → log message visible
- [ ] Refresh while joined → stays joined, no flicker

### CTA Stability
- [ ] CTA appears when user not in session
- [ ] CTA disappears immediately when user joins
- [ ] CTA does not flicker on/off
- [ ] CTA reappears if user leaves event (if event still active)
- [ ] CTA disappears if event ends

## Key Fixes Applied

1. **Execution Trigger**: Added `isInSession` check to allow immediate execution
2. **Phase Setting**: In-Session mode always sets phase to 'execution' immediately
3. **Error Handling**: Added user-facing error messages for failed moves
4. **Debug Logging**: Comprehensive logging at every step of the pipeline
5. **CTA Stability**: Membership ref tracking prevents unnecessary state updates

