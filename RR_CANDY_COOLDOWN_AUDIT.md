# RR Candy Cooldown Enforcement - Audit Results

## Step 0: Audit Complete

### Files Identified

#### 1. RR Candy Skill Definitions
- **File**: `src/utils/rrCandyMoves.ts`
- **Current State**:
  - Skills have `cooldown: 3` (Shield OFF) and `cooldown: 4` (Shield ON)
  - Skills have `currentCooldown: 0` in definitions (this is per-move, not per-player-per-battle)
  - Field names: `cooldown` (max), `currentCooldown` (remaining)

#### 2. Battle State Storage
Two battle systems exist:

**A. Simple BattleState** (`src/types/battle.ts`)
- Used for: Battle Arena (PvP), Vault Siege
- Structure: `BattleState` interface
- Fields: `id`, `type`, `status`, `participants`, `currentTurn`, `moves`, etc.
- Location: Firestore collection `battleLobbies`
- **No cooldown tracking currently**

**B. BattleSession** (`src/types/battleSession.ts`)
- Used for: In-Session, Island Raid
- Structure: `BattleSession` interface
- Fields: `battleId`, `status`, `participants`, `allies`, `enemies`, `turnCount`, `currentTurnIndex`, `pendingMoves`, `battleLog`, `phase`
- Location: Firestore collection `battleSessions`
- **No cooldown tracking currently**

#### 3. Action Processing / Validation

**A. BattleEngine Component** (`src/components/BattleEngine.tsx`)
- Main battle execution component
- `executePlayerMove`: Executes player moves (line ~2982)
- `handleMoveSelect`: Handles move selection (line ~4712)
- Validates: PP/cost, move availability, target validity
- **No cooldown validation currently**

**B. BattleEngine Utility** (`src/utils/battleEngine.ts`)
- `processMove`: Processes moves and checks `move.currentCooldown > 0`
- **Issue**: This checks `move.currentCooldown` which is on the Move object itself, not per-player-per-battle
- Used by some battle modes but not all

#### 4. Turn Advancement

**A. BattleEngine Component**
- `battleState.turnCount`: Increments after each turn
- `applyTurnEffects`: Called after move execution
- Turn advancement happens in multiple places depending on battle mode

**B. BattleSession**
- `turnCount`: Global turn counter
- `currentTurnIndex`: Index in turn queue
- `updateTurnQueue`: Updates turn order

### Key Findings

1. **Cooldown Field Names**: Skills use `cooldown` (max) and `currentCooldown` (remaining) in Move definitions
2. **No Per-Player-Per-Battle Cooldown Tracking**: Cooldowns are not stored in battle state
3. **No Cooldown Enforcement**: Actions are not validated against cooldowns before execution
4. **Multiple Battle Systems**: Need to support both `BattleState` and `BattleSession`
5. **Turn System**: Different turn systems across battle modes (per-player vs global rounds)

### Next Steps

1. Add cooldown tracking to battle state (both systems)
2. Standardize cooldown field names (`cooldownTurns` for max, store `cooldowns` per player in battle state)
3. Enforce cooldown in action validation
4. Decrement cooldowns on turn advancement
5. Update UI to show cooldown state

