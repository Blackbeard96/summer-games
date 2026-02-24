# Story Missions Test Checklist

## Overview
This checklist verifies that the Story Missions system is working correctly across all integration points.

## Prerequisites
- Admin access to create/edit missions
- Test user account
- At least one NPC (Sonido/Zeke/Luz/Kon) configured

---

## Test 1: Existing SIDE Missions Still Work
- [ ] Navigate to Home page
- [ ] Click on an NPC hotspot (e.g., Sonido)
- [ ] Verify SIDE missions appear in the NPC modal
- [ ] Accept a SIDE mission
- [ ] Verify mission appears as "Active" in the modal
- [ ] Complete the mission (if applicable)
- [ ] Verify mission shows as "Completed"

**Expected Result:** SIDE missions continue to work as before, no breaking changes.

---

## Test 2: Story Mission Appears on Player Journey Tab
- [ ] As Admin, create a STORY mission:
  - Set `missionCategory: "STORY"`
  - Set `story.chapterId: "chapter_1"`
  - Set `story.order: 1`
  - Set `deliveryChannels: ["PLAYER_JOURNEY"]`
  - Set `story.required: true`
- [ ] Navigate to `/chapters` (Player Journey tab)
- [ ] Select Chapter 1
- [ ] Verify STORY mission appears in the Story Missions section
- [ ] Verify mission shows correct title, description, and "Required" badge
- [ ] Verify mission status is "Available"

**Expected Result:** STORY mission appears in Player Journey tab for the correct chapter.

---

## Test 3: Story Mission Can Be Accepted from Player Journey
- [ ] In Player Journey tab, click "Accept Mission" on a STORY mission
- [ ] Verify mission status changes to "Active"
- [ ] Navigate to Home page
- [ ] Click on the NPC assigned to the mission (if any)
- [ ] Verify the STORY mission appears as "Active" in the NPC modal
- [ ] Verify it shows "📜 STORY — Active Objective" badge

**Expected Result:** Accepting from Player Journey makes mission active everywhere.

---

## Test 4: Story Mission Can Be Accepted from Hub NPC
- [ ] Create a STORY mission with `deliveryChannels: ["HUB_NPC"]` and assign an NPC
- [ ] Navigate to Home page
- [ ] Click on the assigned NPC hotspot
- [ ] Verify STORY mission appears pinned at top with "📜 STORY — Main Objective" badge
- [ ] Click "Accept Mission"
- [ ] Navigate to Player Journey tab (`/chapters`)
- [ ] Select the chapter for the mission
- [ ] Verify the STORY mission appears as "Active" in Player Journey

**Expected Result:** Accepting from Hub NPC makes mission active everywhere.

---

## Test 5: Completing a Story Mission
- [ ] Accept a STORY mission (from either location)
- [ ] Complete the mission objectives (or manually mark as complete via Admin)
- [ ] Verify mission shows as "Completed" in Player Journey
- [ ] Verify mission shows as "Completed" in NPC modal
- [ ] Check Live Feed - verify mission completion event appears (if privacy allows)

**Expected Result:** Mission completion is reflected everywhere, live feed logs event.

---

## Test 6: Chapter Completion Unlocks Next Chapter
- [ ] Create multiple STORY missions for Chapter 1, all with `story.required: true`
- [ ] Accept and complete all required STORY missions for Chapter 1
- [ ] Verify "Chapter Complete!" message appears in Player Journey
- [ ] Verify Chapter 2 is unlocked (check `playerStoryProgress.unlockedChapterIds`)
- [ ] Verify Chapter 2 missions become available
- [ ] Check Live Feed - verify chapter completion event appears (if privacy allows)

**Expected Result:** Completing all required missions unlocks next chapter.

---

## Test 7: Admin Can Designate Story Missions
- [ ] Navigate to Admin Panel
- [ ] Click "Mission Admin" tab
- [ ] Click "Create Mission"
- [ ] Fill in mission details:
  - Title: "Test Story Mission"
  - Description: "Test description"
  - Mission Category: "STORY"
  - Chapter ID: "chapter_1"
  - Order: 1
  - Required: checked
  - Delivery Channels: Both "HUB_NPC" and "PLAYER_JOURNEY" checked
  - NPC: Select one (e.g., "Sonido")
- [ ] Click "Create Mission"
- [ ] Verify mission appears in the list
- [ ] Click on the mission to edit
- [ ] Change Mission Category to "SIDE"
- [ ] Save
- [ ] Verify mission is now SIDE (can convert STORY ↔ SIDE)

**Expected Result:** Admin can create/edit missions and toggle between STORY and SIDE.

---

## Test 8: No Crashes When Missions Missing New Fields
- [ ] Create a mission with only basic fields (no `missionCategory`, `deliveryChannels`, `story`)
- [ ] Navigate to Home page
- [ ] Click on NPC modal
- [ ] Verify no crashes, mission appears with defaults (SIDE, HUB_NPC)
- [ ] Navigate to Player Journey
- [ ] Verify no crashes, mission doesn't appear (if STORY fields missing)

**Expected Result:** System handles missing fields gracefully with safe defaults.

---

## Test 9: Prerequisites Gating
- [ ] Create STORY mission A (no prerequisites)
- [ ] Create STORY mission B with `story.prerequisites: ["mission_A_id"]`
- [ ] Accept and complete mission A
- [ ] Verify mission B becomes available (unlocked)
- [ ] Before completing A, verify mission B shows as "Locked"

**Expected Result:** Prerequisites correctly gate mission availability.

---

## Test 10: Only One Active Story Mission Per Chapter
- [ ] Create two STORY missions for the same chapter
- [ ] Accept the first STORY mission
- [ ] Try to accept the second STORY mission
- [ ] Verify error message: "Finish your current story objective first."
- [ ] Complete the first mission
- [ ] Verify second mission can now be accepted

**Expected Result:** Only one active STORY mission per chapter allowed.

---

## Test 11: Home Background Image Updated
- [ ] Navigate to Home page
- [ ] Verify background image is `Home_BKG_V2.png` (not `MST BKG.png`)
- [ ] Check browser DevTools Network tab to confirm correct image loads

**Expected Result:** Home page uses new background image.

---

## Test 12: Live Feed Integration
- [ ] Accept a mission (with privacy settings allowing sharing)
- [ ] Check Live Feed - verify "accepted mission" event appears
- [ ] Complete a mission
- [ ] Check Live Feed - verify "completed mission" event appears
- [ ] Complete all required missions for a chapter
- [ ] Check Live Feed - verify "completed chapter" event appears

**Expected Result:** Mission events appear in live feed (respecting privacy settings).

---

## Edge Cases & Error Handling

### Test 13: Mission Already Active
- [ ] Accept a mission
- [ ] Try to accept the same mission again
- [ ] Verify error: "Mission already active"

### Test 14: Mission Already Completed
- [ ] Complete a mission
- [ ] Try to accept it again
- [ ] Verify error: "Mission already completed"

### Test 15: Invalid Chapter ID
- [ ] Create STORY mission with invalid `chapterId` (e.g., "chapter_999")
- [ ] Verify mission doesn't crash Player Journey
- [ ] Verify mission doesn't appear for that chapter

### Test 16: Multiple Delivery Channels
- [ ] Create mission with both `HUB_NPC` and `PLAYER_JOURNEY`
- [ ] Verify mission appears in both places
- [ ] Accept from one location
- [ ] Verify it's active in both locations

---

## Performance Tests

### Test 17: Large Mission Lists
- [ ] Create 20+ missions for a chapter
- [ ] Navigate to Player Journey
- [ ] Verify missions load without significant delay
- [ ] Verify UI remains responsive

### Test 18: Concurrent Accepts
- [ ] Open two browser windows with same user
- [ ] Try to accept same mission from both windows simultaneously
- [ ] Verify only one succeeds (idempotent behavior)

---

## Regression Tests

### Test 19: Existing Chapter Challenges Still Work
- [ ] Navigate to Player Journey
- [ ] Verify existing chapter challenges still appear
- [ ] Complete a chapter challenge
- [ ] Verify it still works as before

### Test 20: No Breaking Changes to Other Systems
- [ ] Verify Battle Arena still works
- [ ] Verify Island Raid still works
- [ ] Verify Profile page still works
- [ ] Verify Marketplace still works

---

## Sign-off
- [ ] All tests passed
- [ ] No console errors
- [ ] No Firestore errors
- [ ] UI is responsive and polished
- [ ] Documentation updated (if needed)

**Tested by:** _______________  
**Date:** _______________  
**Notes:** _______________

