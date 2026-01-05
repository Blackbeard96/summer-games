# Skills System Refactor Summary

## Overview
This refactor rebrands the "Moves" system to a unified "Skills" system throughout the MST web app, consolidating all skill management into a single Skill Mastery hub.

## Key Changes

### 1. Unified Skill Type (`src/types/skill.ts`)
- Created `Skill` interface that encompasses:
  - Manifest Skills (core skill set)
  - Element Skills (elemental affinity)
  - RR Candy Skills (reality-rewrite skills)
- Added `moveToSkill()` and `skillToMove()` conversion functions for backward compatibility
- Added `groupSkillsBySource()` helper for organizing skills by source type

### 2. Skill Service Layer (`src/utils/skillService.ts`)
- `fetchUserSkills()`: Aggregates all skills from Firestore (still using "moves" collection for backward compatibility)
- `updateSkillLevel()`: Updates skill level in Firestore
- `updateSkillMastery()`: Updates skill mastery level
- `getRRCandySkillsForUser()`: Fetches RR Candy skills based on user's candy choice
- `getElementSkillsForUser()`: Fetches element skills based on user's elemental affinity

### 3. UI Updates

#### Battle.tsx
- Updated route handling to support both `#moves` and `#skills` routes (backward compatible)
- Changed section title from "Battle Arsenal" to "Skill Mastery"
- Updated description to mention Manifest, Elemental, and RR Candy skills
- Updated tip text to reference "skills" instead of "moves"

#### NavBar.tsx
- Changed "Move Mastery" to "Skill Mastery" in Battle Arena submenu

#### MovesDisplay.tsx
- Separated RR Candy skills from other system moves
- Updated section titles:
  - "Manifest Moves" → "Manifest Skills"
  - "Elemental Moves" → "Element Skills"
  - Added "RR Candy Skills" section
  - "System Moves" → "System Skills" (for non-RR Candy system moves)
- Updated terminology:
  - "MOVE COST" → "SKILL COST"
  - "Moves Unlocked" → "Skills Unlocked"
  - "Move Availability" → "Skill Availability"
  - "Battle Moves" → "Battle Skills"
  - "Offline Moves" → "Offline Skills"
- Updated unlock button text to reference "Skills"

#### BattleEngine.tsx
- Updated battle log messages to say "used skill" instead of "used"
- Updated console logs to say "Skill Storage" instead of "Move Storage"
- Note: Internal state still uses `selectedMove` for backward compatibility with existing Move type

### 4. Route Compatibility
- `/battle#moves` still works (shows Skill Mastery)
- `/battle#skills` redirects to `/battle#moves`
- `/battle#skillMastery` redirects to `/battle#moves`

## Backward Compatibility Strategy

**Option A (Current Implementation)**: Keep Firestore field names as "moves" but map in code:
- UI shows "Skills" everywhere
- Data layer still uses "moves" collection
- Conversion happens at runtime via `moveToSkill()` and `skillToMove()`

This approach:
- ✅ Requires minimal risky changes
- ✅ No data migration needed
- ✅ Existing data continues working
- ✅ Can migrate Firestore later if needed

## Remaining Work

### High Priority
1. **Profile Page**: Add "Manage / Upgrade RR Candy Skills in Skill Mastery" CTA
2. **BattleEngine**: Consider renaming `selectedMove` to `selectedSkill` in battle state (requires careful refactoring)
3. **BattleContext**: Update terminology in comments and logs

### Medium Priority
1. **Element Skills Integration**: Ensure element skills are properly displayed in Skill Mastery
2. **Search/Filter**: Add filtering by sourceType in Skill Mastery
3. **Tutorials**: Update any tutorial text that references "moves"

### Low Priority
1. **Firestore Migration**: Consider migrating "moves" collection to "skills" in the future
2. **Type Cleanup**: Eventually remove Move type in favor of Skill type

## Files Changed

### New Files
- `src/types/skill.ts` - Unified Skill type and conversion utilities
- `src/utils/skillService.ts` - Skill service layer for fetching/updating skills

### Modified Files
- `src/pages/Battle.tsx` - Route handling and UI terminology
- `src/components/NavBar.tsx` - Navigation menu text
- `src/components/MovesDisplay.tsx` - Skill grouping and terminology
- `src/components/BattleEngine.tsx` - Battle log messages

## Testing Checklist

- [ ] Skill Mastery page loads correctly
- [ ] Manifest Skills section displays correctly
- [ ] Element Skills section displays correctly (when element is chosen)
- [ ] RR Candy Skills section displays correctly (when Chapter 2-4 is completed)
- [ ] Skill upgrades work correctly
- [ ] Battle log shows "used skill" messages
- [ ] Old routes (`#moves`) still work
- [ ] New routes (`#skills`, `#skillMastery`) redirect correctly
- [ ] Existing user data continues working

## Notes

- The internal codebase still uses "Move" type in many places for backward compatibility
- Firestore still uses "moves" collection - no migration performed
- UI consistently shows "Skills" to users
- All skill management is now centralized in Skill Mastery (Battle Arena → Skill Mastery)




