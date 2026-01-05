# Security Fix: Stop PP Farming via Challenge Resets

## Summary

Fixed a security exploit where students could reset challenges infinitely in Chapter 1 and Chapter 2 to re-earn PP/rewards repeatedly. All reset functionality is now admin-only, and reward granting is idempotent.

## Root Cause

The exploit worked because:
1. Reset buttons were visible to all users (not just admins)
2. Reset functions didn't check admin status
3. Reward granting in `handleAutoCompleteChallenge` bypassed the idempotency check
4. Firestore rules didn't prevent reset operations at the data layer

## Fixes Implemented

### 1. UI-Level Protection ✅
- **File**: `src/components/ChapterDetail.tsx`
- Added `isAdmin()` checks to all reset functions:
  - `resetChallenge7()` (Chapter 1)
  - `resetChallenge8()` (Chapter 1)
  - `resetChapter2Challenge1()`
  - `resetChapter2Challenge2()`
  - `resetChapter2Challenge3()`
  - `handleResetChapter24()`
- Updated UI buttons to only show reset options for admins
- All reset buttons now check `isAdmin() && status === 'completed'` before displaying

### 2. Reward Idempotency ✅
- **File**: `src/components/ChapterDetail.tsx`
- **Function**: `handleAutoCompleteChallenge()`
- **Fix**: Replaced direct PP/XP increment with centralized `grantChallengeRewards()` function
- This ensures rewards can only be granted once per challenge, even if challenge state is manipulated
- Uses Firestore transactions with `rewardClaims` subcollection for idempotency tracking

### 3. Firestore Security Rules ✅
- **File**: `firestore.rules`
- Added `isAdmin()` helper function
- Protected `rewardClaims` subcollection (prevents deletion by non-admins)
- Added security documentation noting that nested field validation has limitations
- Primary protection is at application level; rules provide secondary defense

### 4. PP Anomaly Detection ✅
- **File**: `src/utils/challengeRewards.ts`
- Added logging to detect suspicious PP gains (>100 PP from single challenge)
- Dev-only logging for monitoring PP reward patterns
- Warning logs help identify potential exploits

## Files Modified

1. `src/components/ChapterDetail.tsx`
   - Added admin checks to all reset functions
   - Fixed `handleAutoCompleteChallenge` to use idempotent reward system
   - Updated UI button visibility conditions

2. `firestore.rules`
   - Added `isAdmin()` helper function
   - Added `rewardClaims` subcollection protection
   - Added security documentation

3. `src/utils/challengeRewards.ts`
   - Added PP anomaly detection logging

## Testing Checklist

- [ ] Non-admin completes a challenge → PP increases once
- [ ] Non-admin tries to reset (UI hidden) → cannot see reset buttons
- [ ] Non-admin tries to call reset function directly → blocked by admin check
- [ ] Non-admin tries to reset via Firestore direct write → blocked by rules (if possible)
- [ ] Admin can reset challenge and re-run for testing
- [ ] Non-admin cannot earn reward again if challenge state is manipulated
- [ ] Reward claims are properly recorded in `users/{uid}/rewardClaims/{challengeId}`
- [ ] PP anomaly detection logs warnings for large rewards

## Data Model

### Challenge Progress Structure
```
users/{uid}/chapters/{chapterId}/challenges/{challengeId}:
  - isCompleted: boolean
  - status: string
  - completedAt: Timestamp
```

### Reward Claims (Idempotency)
```
users/{uid}/rewardClaims/{challengeId}:
  - claimed: boolean
  - claimedAt: Timestamp
  - challengeId: string
  - challengeTitle: string
  - rewardsSnapshot: { xp, pp, artifacts }
  - userId: string
```

## Security Notes

1. **Application-Level Protection**: Primary security is enforced in application code (UI + function-level checks)
2. **Firestore Rules Limitations**: Firestore rules have limitations validating nested field changes (e.g., `chapters.{id}.challenges.{id}`), so reset prevention relies on UI/function-level checks
3. **Idempotency**: Reward granting uses transactions with claim records to ensure rewards can only be granted once
4. **Admin Access**: Admins can reset challenges for testing/debugging purposes

## Future Improvements

- Consider Cloud Functions for reward granting (server-side validation)
- Add rate limiting for challenge completions
- Implement more sophisticated PP anomaly detection with time-window analysis
- Add audit logging for all challenge resets (who, when, which challenge)

