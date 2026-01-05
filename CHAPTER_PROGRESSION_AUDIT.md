# Chapter Progression System Audit

## Step 0: Audit Results

### Challenge Definitions
- **Location**: `src/types/chapters.ts`
- **Structure**: Hardcoded `CHAPTERS` array with chapter objects containing:
  - `id`: number
  - `challenges`: Array of `ChapterChallenge` objects (ordered)
  - Each challenge has: `id`, `title`, `description`, `requirements[]`, `rewards[]`

### Firestore Schema
- **Path**: `users/{uid}/chapters/{chapterId}`
- **Fields**:
  - `isActive`: boolean (chapter is currently active/unlocked)
  - `isCompleted`: boolean (all challenges in chapter completed)
  - `unlockDate`: Date (when chapter was unlocked)
  - `completionDate`: Date (when chapter was completed)
  - `challenges/{challengeId}`:
    - `isCompleted`: boolean
    - `status`: string ('approved', 'pending', etc.)
    - `completedAt`: Timestamp

### Challenge Status Computation
- **Location**: `src/components/ChapterDetail.tsx` - `getChallengeStatus()`
- **Logic**: 
  - Checks if challenge is completed (`isCompleted` or `status === 'approved'`)
  - Checks if previous challenge is completed (sequential unlocking)
  - Special case: Chapter 2-1 unlocks if Chapter 1 is completed
  - Returns: 'locked' | 'available' | 'completed' | 'pending'

### Challenge Completion Points
1. **`handleAutoCompleteChallenge`** (ChapterDetail.tsx:463)
   - Used for auto-completable challenges
   - **STATUS**: ✅ Now uses `updateProgressOnChallengeComplete` (FIXED)
   
2. **`handleZekeEndsBattleCutsceneComplete`** (ChapterDetail.tsx:2366)
   - Completes Chapter 1 final challenge ('ep1-where-it-started')
   - **ISSUE**: Chapter 2 unlock is COMMENTED OUT (line 2426)
   - **STATUS**: ❌ Needs to use progression engine (TO FIX)
   
3. **`checkAndProgressChapter`** (StoryChallenges.tsx:1509)
   - Checks if all challenges completed, then unlocks next chapter
   - **STATUS**: ⚠️ Redundant with new progression engine (CAN REFACTOR)
   
4. **`checkAndAutoCompleteChallenges`** (ChallengeTracker.tsx:164)
   - Auto-completes challenges based on progress
   - **STATUS**: ⚠️ Needs to use progression engine (TO FIX)
   
5. **Admin approval** (AdminPanel.tsx:1801)
   - `handleApprove` marks challenges as completed
   - **STATUS**: ⚠️ Needs to use progression engine (TO FIX)

### Root Cause Analysis

**Primary Issue**: Chapter 2 unlock is explicitly disabled in `handleZekeEndsBattleCutsceneComplete` (line 2426)

**Secondary Issues**:
1. No centralized progression engine (multiple places handle completion differently)
2. Manual progression logic scattered across components
3. No transactional guarantees (race conditions possible)
4. Inconsistent unlock logic

## Solution Implemented

### 1. Created Canonical Progression Engine
- **File**: `src/utils/chapterProgression.ts`
- **Function**: `updateProgressOnChallengeComplete(userId, chapterId, challengeId)`
- **Features**:
  - Transactional (Firestore transaction)
  - Idempotent (safe to call multiple times)
  - Automatically unlocks next challenge in same chapter
  - Automatically unlocks next chapter's first challenge when current chapter completes
  - Helper functions: `getNextChallengeId()`, `getFirstChallengeId()`, `getOrderedChallenges()`

### 2. Updated `handleAutoCompleteChallenge`
- ✅ Now uses `updateProgressOnChallengeComplete`
- ✅ Removed manual unlock logic
- ✅ Keeps reward granting separate (uses `grantChallengeRewards`)

### 3. Repair Function
- **Function**: `repairUserProgression(userId)`
- Scans all completed challenges and fixes unlock states
- Useful for fixing stuck players

## Next Steps

1. ✅ Update `handleAutoCompleteChallenge` (DONE)
2. ❌ Update `handleZekeEndsBattleCutsceneComplete` (CRITICAL - has disabled Chapter 2 unlock)
3. ❌ Update `checkAndAutoCompleteChallenges` in ChallengeTracker
4. ❌ Update admin approval handler
5. ❌ Add admin repair tool to AdminPanel
6. ❌ Add automatic repair on load for stuck users

## Files Modified

1. `src/utils/chapterProgression.ts` (NEW) - Canonical progression engine
2. `src/components/ChapterDetail.tsx` - Updated `handleAutoCompleteChallenge`

## Files Needing Updates

1. `src/components/ChapterDetail.tsx` - `handleZekeEndsBattleCutsceneComplete` (CRITICAL)
2. `src/components/ChallengeTracker.tsx` - `checkAndAutoCompleteChallenges`
3. `src/pages/AdminPanel.tsx` - `handleApprove` and add repair tool
4. `src/components/StoryChallenges.tsx` - `checkAndProgressChapter` (can refactor/remove)
