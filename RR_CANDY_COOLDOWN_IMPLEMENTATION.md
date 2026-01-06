# RR Candy Cooldown Enforcement - Implementation Plan

## Key Files Identified

### 1. RR Candy Skill Definitions
- **File**: `src/utils/rrCandyMoves.ts`
- **Current**: `cooldown: 3/4`, `currentCooldown: 0` (default, not per-battle)

### 2. Battle State Types
- **File**: `src/types/battle.ts` - `BattleState` interface
- **File**: `src/types/battleSession.ts` - `BattleSession` interface
- **Both need cooldown tracking added**

### 3. Battle Execution
- **File**: `src/components/BattleEngine.tsx`
  - `handleMoveSelect` (line ~4712): Move selection
  - `executePlayerMove` (line ~2982): Move execution
  - `handleAnimationComplete` (line ~3003): After animation
  - `applyTurnEffects` (line ~268): Turn start effects

### 4. Battle UI
- **File**: `src/components/BattleEngine.tsx` - Skill selection UI
- **File**: Various battle mode components (InSessionBattle, etc.)

## Implementation Steps

1. ✅ Audit complete
2. ⏳ Standardize cooldown fields (ensure `cooldown` field exists, add `cooldownTurns` alias if needed)
3. ⏳ Add cooldown tracking to battle state (both BattleState and BattleSession)
4. ⏳ Enforce cooldown in action resolver
5. ⏳ Decrement cooldowns on turn advancement
6. ⏳ Update UI to show/disable cooldown
7. ⏳ Add logging and tests

