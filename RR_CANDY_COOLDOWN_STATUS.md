# RR Candy Cooldown Enforcement - Implementation Status

## ✅ Completed Steps

### Step 0: Audit ✅
- Identified RR Candy skill definitions (`src/utils/rrCandyMoves.ts`)
- Identified battle state types (`BattleState`, `BattleSession`)
- Identified action processing locations (`BattleEngine.tsx`)
- Documented current cooldown field structure

### Step 1: Standardize Cooldown Fields ✅
- RR Candy skills already have `cooldown: number` field (3 for Shield OFF, 4 for Shield ON)
- No changes needed - field names are consistent

### Step 2: Add Cooldown Tracking to Battle State ✅
- ✅ Added `cooldowns?: { [userId: string]: { [skillId: string]: number } }` to `BattleState` interface (`src/types/battle.ts`)
- ✅ Added `cooldowns?: { [participantId: string]: { [skillId: string]: number } }` to `BattleSession` interface (`src/types/battleSession.ts`)
- ✅ Added `cooldowns?: { [userId: string]: { [skillId: string]: number } }` to `BattleState` interface in `BattleEngine.tsx`
- ✅ Initialized `cooldowns: {}` in BattleEngine state

## ⏳ Remaining Steps

### Step 3: Enforce Cooldown in Action Resolver (CRITICAL)
**Files to modify:**
- `src/components/BattleEngine.tsx`:
  - `handleMoveSelect` (line ~4712): Add cooldown check before allowing move selection
  - `handleAnimationComplete` (line ~3003): Add cooldown validation before move execution
  - Set cooldown when RR Candy skill is used
  
**For BattleSession (In-Session, Island Raid):**
- `src/utils/battleSessionManager.ts`: Add cooldown validation in move submission
- `src/components/InSessionBattle.tsx`: Add cooldown checks

**Implementation:**
1. Create helper function `isSkillOnCooldown(userId, skillId, cooldowns)` 
2. In move validation, check if RR Candy skill (`move.id.startsWith('rr-candy-')`) is on cooldown
3. If on cooldown, show toast/error and prevent execution
4. After successful execution, set `cooldowns[userId][skillId] = move.cooldown`

### Step 4: Decrement Cooldowns on Turn Advancement
**Files to modify:**
- `src/components/BattleEngine.tsx`:
  - `applyTurnEffects` (line ~268): Decrement cooldowns for the active player
  - When `turnCount` increases, decrement all cooldowns for the active player
  
**For BattleSession:**
- `src/utils/battleSessionManager.ts`: Add cooldown decrement when turn advances
- `src/components/SquadUpStoryModal.tsx` / Island Raid: Decrement cooldowns on turn advance

**Implementation:**
1. Create helper function `decrementCooldowns(cooldowns, userId)` that decrements all cooldowns by 1 (min 0)
2. Call this when turn advances (in `applyTurnEffects` or when `turnCount` increments)
3. Update battle state with new cooldown values

### Step 5: Update UI to Show/Disable Cooldown
**Files to modify:**
- `src/components/BattleEngine.tsx`: Skill selection UI
- `src/components/InSessionBattle.tsx`: Skill selection UI  
- Any component that renders skill buttons/cards

**Implementation:**
1. Read `cooldowns[currentUser.uid]?.[move.id]` 
2. If cooldown > 0:
   - Disable button/card
   - Show "Cooldown: X turns remaining"
3. If cooldown === 0 or undefined:
   - Enable button
   - Show normal cooldown info if applicable

**Toast Implementation:**
- Use existing toast system (`ToastContext`) or create simple alert
- Show toast when user tries to use skill on cooldown: "Skill on cooldown — X turns remaining."

### Step 6: Logging + Tests
**Debug Logging:**
- Add `REACT_APP_DEBUG_COOLDOWNS=true` checks
- Log cooldown set, decrement, validation failures

**Test Plan:**
1. Use Shield OFF (cooldown 3) in battle
2. Try to use again immediately → should be blocked
3. Advance 3 turns → should be usable again
4. Refresh page mid-cooldown → cooldown should persist
5. Test in Battle Arena + In-Session modes

## Implementation Priority

1. **HIGH**: Step 3 (Enforce cooldown) - Prevents exploits
2. **HIGH**: Step 4 (Decrement cooldowns) - Makes cooldowns functional
3. **MEDIUM**: Step 5 (UI feedback) - User experience
4. **LOW**: Step 6 (Logging/tests) - Validation and debugging

## Notes

- Cooldowns are per-player-per-battle (stored in battle state)
- Only RR Candy skills (`move.id.startsWith('rr-candy-')`) should enforce cooldowns
- Cooldowns decrement at the start of each player's turn
- Cooldowns must persist across page refreshes (stored in Firestore for BattleSession)
- For BattleEngine (client-side state), cooldowns are in component state but should also be persisted if battle state is stored in Firestore

