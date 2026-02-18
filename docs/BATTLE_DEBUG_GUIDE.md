# Battle Debug Guide

## Overview
Comprehensive logging system for debugging battle actions across all modes (Live Events, Island Raid, Player Journey).

## Always-On Logging

The following logs are **ALWAYS** visible (no debug flag needed):

### Skill Selection
```
🎯 [BattleEngine] SKILL SELECTED:
  - moveId, moveName, moveType, moveCategory
  - cost, cooldown
  - isInSession, sessionId, gameId
  - actorUid
  - timestamp
```

### Target Selection
```
🎯 [BattleEngine] TARGET SELECTED:
  - targetId
  - selectedMove, selectedMoveId
  - isInSession, sessionId, gameId
  - phase
  - timestamp
```

### Execution Trigger
```
🚀 [BattleEngine] EXECUTION TRIGGERED:
  - phase
  - selectedMove, selectedMoveId
  - selectedTarget
  - isInSession, sessionId, gameId
  - isMultiplayer
  - timestamp
```

### Animation Complete
```
🎬 [BattleEngine] ANIMATION COMPLETE:
  - hasSelectedMove, selectedMove, selectedMoveId
  - hasSelectedTarget, selectedTarget
  - hasVault
  - isInSession, sessionId, gameId
  - timestamp
```

### Move Execution (In-Session)
```
🚀 [In-Session Move] EXECUTING MOVE:
  - sessionId, actorUid, actorName
  - targetUid, targetName
  - moveId, moveName
  - damage, shieldDamage, healing, shieldBoost, ppStolen, ppCost
  - battleLogMessage
  - timestamp
```

### Firestore Transaction
```
🔄 [applyInSessionMove] STARTING TRANSACTION:
  - sessionId, actorUid, targetUid
  - moveId, moveName
  - timestamp

📖 [applyInSessionMove] READ FROM FIRESTORE:
  - sessionId
  - playersCount, battleLogLength
  - actorInPlayers, targetInPlayers

💾 [applyInSessionMove] WRITING TO FIRESTORE:
  - sessionId
  - actorHp/shield/PP (before → after)
  - targetHp/shield/PP (before → after)
  - battleLogLength (before → after)
  - damageApplied, shieldDamageApplied, etc.
  - newBattleLogEntry

✅ [applyInSessionMove] TRANSACTION COMPLETED:
  - sessionId, success, message
  - battleLogEntry
  - timestamp
```

### Move Result
```
📥 [In-Session Move] RESULT RECEIVED:
  - success, message
  - battleLogEntry
  - damage, shieldDamage, healing, shieldBoost, ppStolen, ppCost
  - timestamp
```

### Session Listener Updates
```
📝 [Session Update] BATTLE LOG UPDATED:
  - oldLength, newLength
  - newEntries (array of new log messages)
  - sessionId, timestamp

🔄 [Session Update] PLAYER STATE CHANGED:
  - playerName, playerId
  - hp (before → after)
  - shield (before → after)
  - pp (before → after)
  - sessionId, timestamp
```

### Errors
```
❌ [In-Session Move] FAILED TO APPLY MOVE:
  - error message
  - sessionId, actorUid, targetUid
  - moveId, moveName
  - damage, shieldDamage
  - timestamp

❌ [In-Session Move] EXCEPTION CAUGHT:
  - error message, errorCode
  - errorStack
  - sessionId, actorUid, targetUid
  - moveId, moveName
  - timestamp, fullError
```

## Debug Flag Logging

With `REACT_APP_DEBUG_BATTLE=true` or `REACT_APP_DEBUG_LIVE_EVENTS=true`, you'll also see:

- `[BattleDebug:skill-click]` - Skill selection details
- `[BattleDebug:target-click]` - Target selection details
- `[BattleDebug:action-submit]` - Action submission
- `[BattleDebug:firestore-write]` - Firestore write attempts
- `[BattleDebug:state-updated]` - State updates
- `[BattleDebug:battle-log-written]` - Battle log entries

## Debugging Workflow

1. **Open browser console** (F12 → Console tab)

2. **Filter logs** by searching for:
   - `[BattleEngine]` - All BattleEngine logs
   - `[In-Session Move]` - All In-Session move logs
   - `[applyInSessionMove]` - All Firestore transaction logs
   - `[Session Update]` - All session listener updates

3. **Trace the flow:**
   - Skill selected → `🎯 [BattleEngine] SKILL SELECTED`
   - Target selected → `🎯 [BattleEngine] TARGET SELECTED`
   - Execution triggered → `🚀 [BattleEngine] EXECUTION TRIGGERED`
   - Animation complete → `🎬 [BattleEngine] ANIMATION COMPLETE`
   - Move executing → `🚀 [In-Session Move] EXECUTING MOVE`
   - Transaction starting → `🔄 [applyInSessionMove] STARTING TRANSACTION`
   - Firestore read → `📖 [applyInSessionMove] READ FROM FIRESTORE`
   - Firestore write → `💾 [applyInSessionMove] WRITING TO FIRESTORE`
   - Transaction complete → `✅ [applyInSessionMove] TRANSACTION COMPLETED`
   - Result received → `📥 [In-Session Move] RESULT RECEIVED`
   - Session update → `📝 [Session Update] BATTLE LOG UPDATED` / `🔄 [Session Update] PLAYER STATE CHANGED`

4. **Identify failure point:**
   - If you see "SKILL SELECTED" but not "TARGET SELECTED" → Target selection is failing
   - If you see "TARGET SELECTED" but not "EXECUTION TRIGGERED" → Phase transition is failing
   - If you see "EXECUTION TRIGGERED" but not "ANIMATION COMPLETE" → Animation is not completing
   - If you see "ANIMATION COMPLETE" but not "EXECUTING MOVE" → Move execution is not being called
   - If you see "EXECUTING MOVE" but not "TRANSACTION COMPLETED" → Firestore write is failing
   - If you see "TRANSACTION COMPLETED" but not "SESSION UPDATE" → Session listener is not picking up changes

## Common Issues

### Moves Activate But No Effect
**Check for:**
1. `💾 [applyInSessionMove] WRITING TO FIRESTORE` - Are values being written?
2. `✅ [applyInSessionMove] TRANSACTION COMPLETED` - Did transaction succeed?
3. `🔄 [Session Update] PLAYER STATE CHANGED` - Is listener picking up changes?
4. `📝 [Session Update] BATTLE LOG UPDATED` - Is battle log updating?

**If transaction fails:**
- Look for `❌ [In-Session Move] FAILED TO APPLY MOVE` or `❌ [In-Session Move] EXCEPTION CAUGHT`
- Check for permission errors (`permission-denied`)
- Check for transaction conflicts (`failed-precondition`)

### Battle Log Not Updating
**Check for:**
1. `💾 [applyInSessionMove] WRITING TO FIRESTORE` - Is `newBattleLogEntry` present?
2. `✅ [applyInSessionMove] TRANSACTION COMPLETED` - Is `battleLogEntry` in result?
3. `📝 [Session Update] BATTLE LOG UPDATED` - Is listener receiving updates?

**If battle log entry is missing:**
- Check `🚀 [In-Session Move] EXECUTING MOVE` - Is `battleLogMessage` present?
- Check for `⚠️ Using fallback battle log message` warning

### Player Stats Not Updating
**Check for:**
1. `💾 [applyInSessionMove] WRITING TO FIRESTORE` - Are HP/shield/PP values changing?
2. `🔄 [Session Update] PLAYER STATE CHANGED` - Is listener detecting changes?
3. Check if `opponents`/`allies` arrays are being recomputed from `sessionPlayers`

## Quick Debug Checklist

When a move doesn't work, check console for:

- [ ] `🎯 [BattleEngine] SKILL SELECTED` - Skill was clicked
- [ ] `🎯 [BattleEngine] TARGET SELECTED` - Target was clicked
- [ ] `🚀 [BattleEngine] EXECUTION TRIGGERED` - Execution was triggered
- [ ] `🎬 [BattleEngine] ANIMATION COMPLETE` - Animation completed
- [ ] `🚀 [In-Session Move] EXECUTING MOVE` - Move execution started
- [ ] `🔄 [applyInSessionMove] STARTING TRANSACTION` - Transaction started
- [ ] `📖 [applyInSessionMove] READ FROM FIRESTORE` - Firestore read succeeded
- [ ] `💾 [applyInSessionMove] WRITING TO FIRESTORE` - Firestore write attempted
- [ ] `✅ [applyInSessionMove] TRANSACTION COMPLETED` - Transaction succeeded
- [ ] `📥 [In-Session Move] RESULT RECEIVED` - Result received
- [ ] `📝 [Session Update] BATTLE LOG UPDATED` - Battle log updated
- [ ] `🔄 [Session Update] PLAYER STATE CHANGED` - Player stats updated

If any step is missing, that's where the issue is!


