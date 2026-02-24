# Mission to Player Journey Linking - Test Checklist

## Overview
This document provides a manual test checklist for verifying that missions can be linked to Player Journey steps and that completing a mission once satisfies both systems.

## Test Cases

### 1. Create Mission with HUB_NPC Only
**Steps:**
1. Go to Admin Panel → Mission Admin
2. Click "+ Create Mission"
3. Fill in:
   - Title: "Test Hub Mission"
   - Description: "A test mission for hub only"
   - Mission Category: SIDE
   - Delivery Channels: Check "HUB_NPC" only
   - NPC: Select "Sonido"
4. Click "Create Mission"

**Expected Results:**
- ✅ Mission is created successfully
- ✅ Mission appears in Sonido's NPC mission list
- ✅ Mission does NOT appear in Player Journey
- ✅ No journey step linking section is shown

---

### 2. Create Mission with PLAYER_JOURNEY Only
**Steps:**
1. Go to Admin Panel → Mission Admin
2. Click "+ Create Mission"
3. Fill in:
   - Title: "Test Journey Mission"
   - Description: "A test mission for journey only"
   - Mission Category: SIDE
   - Delivery Channels: Check "PLAYER_JOURNEY" only
   - Link to Player Journey Step: Select "Chapter 2: Find a Home" (or any available step)
4. Click "Create Mission"

**Expected Results:**
- ✅ Mission is created successfully
- ✅ Toast message: "Mission created and linked to Player Journey: Chapter 2 - Find a Home"
- ✅ Mission appears in Player Journey for the selected chapter
- ✅ Mission does NOT appear in NPC mission lists
- ✅ Journey step shows the mission as available/active

---

### 3. Create Mission with Both HUB_NPC + PLAYER_JOURNEY
**Steps:**
1. Go to Admin Panel → Mission Admin
2. Click "+ Create Mission"
3. Fill in:
   - Title: "Test Dual Mission"
   - Description: "A test mission for both systems"
   - Mission Category: SIDE
   - Delivery Channels: Check both "HUB_NPC" and "PLAYER_JOURNEY"
   - NPC: Select "Zeke"
   - Link to Player Journey Step: Select "Chapter 2: Squad Up" (or any available step)
4. Click "Create Mission"

**Expected Results:**
- ✅ Mission is created successfully
- ✅ Toast message: "Mission created and linked to Player Journey: Chapter 2 - Squad Up"
- ✅ Mission appears in Zeke's NPC mission list
- ✅ Mission appears in Player Journey for the selected chapter
- ✅ Both systems show the same mission

---

### 4. Complete Linked Mission - Verify Both Systems Update
**Steps:**
1. Create a mission linked to a Player Journey step (use Test Case 3)
2. Accept the mission from either:
   - NPC modal (Zeke)
   - Player Journey tab
3. Complete the mission (fulfill objectives)
4. Check both systems:
   - NPC mission list
   - Player Journey tab

**Expected Results:**
- ✅ Mission shows as "Completed" in NPC mission list
- ✅ Journey step shows as "Completed" in Player Journey
- ✅ Both updated from single completion
- ✅ Rewards granted once (no double rewards)
- ✅ Journey step rewards granted (if different from mission rewards)
- ✅ Mission rewards granted

---

### 5. Validation Tests

#### 5a. Required Field Validation
**Steps:**
1. Create Mission modal
2. Check "PLAYER_JOURNEY" delivery channel
3. Leave "Link to Player Journey Step" empty
4. Click "Create Mission"

**Expected Results:**
- ✅ Alert: "Please select a Player Journey step to link this mission to."
- ✅ Mission is NOT created

#### 5b. NPC Required Validation
**Steps:**
1. Create Mission modal
2. Check "HUB_NPC" delivery channel
3. Leave NPC as "None"
4. Click "Create Mission"

**Expected Results:**
- ✅ Alert: "Please select an NPC when HUB_NPC delivery channel is selected."
- ✅ Mission is NOT created

#### 5c. Journey Link Clears When Unchecking PLAYER_JOURNEY
**Steps:**
1. Create Mission modal
2. Check "PLAYER_JOURNEY"
3. Select a journey step
4. Uncheck "PLAYER_JOURNEY"

**Expected Results:**
- ✅ Journey step dropdown is hidden
- ✅ Selected journey step is cleared

---

### 6. Idempotency Tests

#### 6a. Double Completion Prevention
**Steps:**
1. Complete a linked mission
2. Try to complete it again (if possible)

**Expected Results:**
- ✅ Mission completion is idempotent
- ✅ Journey step completion is idempotent
- ✅ No duplicate rewards granted

#### 6b. Already Completed Journey Step
**Steps:**
1. Manually complete a journey step (via Player Journey UI)
2. Complete a mission linked to that step

**Expected Results:**
- ✅ Mission completes successfully
- ✅ Journey step remains completed (no error)
- ✅ No duplicate rewards

---

### 7. Edge Cases

#### 7a. Mission with No Rewards
**Steps:**
1. Create a mission linked to a journey step
2. Don't set any mission rewards
3. Complete the mission

**Expected Results:**
- ✅ Mission completes
- ✅ Journey step completes
- ✅ Journey step rewards are granted (if defined)
- ✅ No errors

#### 7b. Journey Step with No Rewards
**Steps:**
1. Create a mission linked to a journey step that has no rewards
2. Set mission rewards
3. Complete the mission

**Expected Results:**
- ✅ Mission completes
- ✅ Journey step completes
- ✅ Mission rewards are granted
- ✅ No errors

---

## Data Verification

### Firestore Checks

After completing Test Case 4, verify in Firestore:

1. **Mission Document** (`missions/{missionId}`):
   - ✅ `playerJourneyLink` exists with `{ chapterId: 2, challengeId: "ch2-find-home" }`
   - ✅ `deliveryChannels` includes both "HUB_NPC" and "PLAYER_JOURNEY"

2. **Player Mission** (`playerMissions/{playerMissionId}`):
   - ✅ `status` is "completed"
   - ✅ `completedAt` timestamp exists

3. **User Journey Progress** (`users/{userId}/chapters/{chapterId}/challenges/{challengeId}`):
   - ✅ `isCompleted` is `true`
   - ✅ `status` is "approved"
   - ✅ `completedAt` timestamp exists

4. **Rewards**:
   - ✅ User XP/PP increased by mission rewards
   - ✅ User XP/PP increased by journey step rewards (if different)
   - ✅ No duplicate rewards

---

## Notes

- The system grants both mission rewards AND journey step rewards when they differ
- If rewards are the same, both systems will grant them (reward system is idempotent)
- Mission completion automatically triggers journey step completion via `updateProgressOnChallengeComplete`
- Journey step completion is checked before attempting to complete to prevent double completion

