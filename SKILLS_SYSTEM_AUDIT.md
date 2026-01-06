# Skills System Audit - System Abilities Removal & RR Candy Name Restoration

## Step 0: Audit Results

### Files That Render System Skills

1. **`src/components/MovesDisplay.tsx`**
   - Line 285-292: `systemMoves` filter (excludes RR Candy and Power Card)
   - Renders "System Skills" section in UI
   - Console log at line 294 shows System skills count

2. **`src/components/InSessionBattle.tsx`**
   - Line 2009: Filters `systemMoves` from `availableMoves`
   - Line 2306: Conditionally renders system moves section

3. **`src/utils/battleSkillsService.ts`**
   - Line 100-109: `systemSkills` filter (excludes RR Candy and Power Card)
   - Line 116: Includes `systemSkills` in combined battle skills array
   - This is the source of truth for battle skill loading

### RR Candy Skill Definitions

**File: `src/utils/rrCandyMoves.ts`**
- Current names:
  - `rr-candy-on-off-shields-off`: "Turn Shields Off"
  - `rr-candy-on-off-shields-on`: "Turn Shields On"
- Need to change to:
  - `rr-candy-on-off-shields-off`: "Shield OFF"
  - `rr-candy-on-off-shields-on`: "Shield ON"

### Battle Skill Loading

**Canonical Function: `getUserUnlockedSkillsForBattle()` in `src/utils/battleSkillsService.ts`**
- Used by:
  - `BattleEngine.tsx` (line 1294)
  - `InSessionBattle.tsx` via `inSessionSkillsService.ts`
  - All battle modes

**Current Behavior:**
- Combines: Manifest + Elemental + RR Candy + System Skills
- System Skills filter excludes RR Candy and Power Card
- System Skills are included in final battle skills array

### System Skills Data

**What are "System Skills"?**
- Any skill with `category === 'system'` 
- Excludes: RR Candy (`id.startsWith('rr-candy-')`) and Power Card (`id.startsWith('power-card-')`)
- Currently there appear to be no actual system skills (only RR Candy uses category='system')

**Action Required:**
- Remove System Skills filter and combination
- Any remaining system skills should be reclassified as RR Candy (if they exist)
- Update UI to remove "System Skills" sections

### RR Candy Name Mapping

**Current IDs and Names:**
- `rr-candy-on-off-shields-off`: "Turn Shields Off" → "Shield OFF"
- `rr-candy-on-off-shields-on`: "Turn Shields On" → "Shield ON"

**Backwards Compatibility:**
- IDs remain unchanged (no migration needed)
- Only display names change
- Firestore unlock data uses IDs, so no data migration needed

## Implementation Plan

1. **Remove System Skills from `battleSkillsService.ts`**
2. **Update RR Candy names in `rrCandyMoves.ts`**
3. **Remove System Skills UI from `MovesDisplay.tsx`**
4. **Remove System Skills from `InSessionBattle.tsx`**
5. **Verify all battle modes use canonical function (already done)**

