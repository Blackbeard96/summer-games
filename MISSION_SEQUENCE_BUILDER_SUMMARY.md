# Mission Sequence Builder Implementation Summary

## Overview
Implemented a complete "Mission Builder: Story Sequence" system that allows admins to create missions with playable sequences of Story Slides, Videos, and Battles.

## Files Changed/Created

### 1. Type Definitions
**File:** `src/types/missions.ts`
- Added `MissionSequenceStep` discriminated union type with three variants:
  - `STORY_SLIDE`: Image + caption text
  - `VIDEO`: Video URL/upload + optional poster + playback controls
  - `BATTLE`: Island Raid battle configuration (difficulty, enemy sets, waves, rewards)
- Updated `MissionTemplate` interface to include:
  - `sequence?: MissionSequenceStep[]` - Optional array of sequence steps
  - `sequenceVersion?: number` - Version counter for sequence edits

### 2. Storage Utilities
**File:** `src/utils/missionStorage.ts` (NEW)
- `uploadMissionImage()` - Uploads images to `missions/{missionId}/slides/{stepId}.{ext}`
- `uploadMissionVideo()` - Uploads videos to `missions/{missionId}/videos/{stepId}.{ext}`
- `uploadMissionPoster()` - Uploads poster images to `missions/{missionId}/posters/{stepId}.{ext}`
- `deleteMissionMedia()` - Optional cleanup utility

### 3. Sequence Builder Component
**File:** `src/components/MissionSequenceBuilder.tsx` (NEW)
- Main builder UI with:
  - Add buttons for each step type
  - List view of steps with badges, summaries, and controls
  - Up/Down buttons for reordering
  - Edit/Delete buttons for each step
- Step Editor Modals:
  - **Story Slide Editor**: Image upload/URL, caption text, optional title
  - **Video Editor**: Source type (URL/Upload), video file/URL, poster image, playback controls (autoplay/muted/controls), optional description
  - **Battle Editor**: Difficulty dropdown, enemy set multi-select, waves/maxEnemies inputs, rewards (XP/PP), optional briefing text
- Features:
  - UUID generation for step IDs
  - Order normalization on save
  - Validation for required fields
  - Upload handling (with fallback to URL input during creation)

### 4. Mission Admin Integration
**File:** `src/components/MissionAdmin.tsx`
- Updated `MissionCreateModal`:
  - Added `sequence` state
  - Integrated `MissionSequenceBuilder` component
  - Updated `handleSubmit` to validate and include sequence
  - Updated `handleCreateMission` to accept and save sequence
- Updated `MissionEditModal`:
  - Added `sequence` state initialized from mission
  - Integrated `MissionSequenceBuilder` with existing mission ID
  - Updated save logic to normalize order and increment `sequenceVersion`
- Updated `loadMissions()` to include `sequence` and `sequenceVersion` fields

### 5. Mission Runner (Player Playback)
**File:** `src/pages/MissionRunner.tsx` (NEW)
- Full-screen playback component for mission sequences
- Features:
  - Step-by-step navigation (Back/Next buttons)
  - **Story Slide**: Displays image + caption text
  - **Video**: HTML5 video player with configured controls
  - **Battle**: Shows battle config + "Start Battle" button that:
    - Creates Island Raid battle room with configured enemies
    - Navigates to battle component
    - Auto-advances to next step on battle completion
  - Progress indicator (Step X of Y)
  - Mission completion on final step
  - Exit button to return home

### 6. Routing
**File:** `src/App.tsx`
- Added lazy-loaded `MissionRunner` component
- Added route: `/mission/:missionId/play` (protected)

## Data Model (Firestore)

### Mission Document Structure
```typescript
{
  // ... existing fields ...
  sequence?: MissionSequenceStep[];  // Optional array
  sequenceVersion?: number;          // Starts at 1, increments on edit
}
```

### Storage Paths
- Images: `missions/{missionId}/slides/{stepId}.{ext}`
- Videos: `missions/{missionId}/videos/{stepId}.{ext}`
- Posters: `missions/{missionId}/posters/{stepId}.{ext}`

## Key Features

### Admin Features
1. **Create Sequence**: Add Story Slides, Videos, and Battles in any order
2. **Reorder Steps**: Up/Down buttons to change step order
3. **Edit Steps**: Inline modals for editing each step type
4. **Delete Steps**: Remove steps from sequence
5. **Media Upload**: Upload images/videos to Firebase Storage (requires mission to be saved first)
6. **Validation**: Required fields enforced, max 20 steps limit

### Player Features
1. **Playback**: Navigate through sequence steps
2. **Story Slides**: View images with captions
3. **Videos**: Watch videos with configured playback options
4. **Battles**: Launch Island Raid battles with configured enemies/rewards
5. **Completion**: Mission auto-completes after final step

## Backwards Compatibility

- **Existing missions** without `sequence` field continue to work as before
- **Mission loading** safely handles missing `sequence` field
- **Mission completion** works for both sequence and non-sequence missions

## Validation Rules

1. **Sequence Steps**:
   - Story Slide: Requires `bodyText` and `image.url`
   - Video: Requires `video.url`
   - Battle: Requires at least one enemy type in `enemySet`
2. **Sequence Limits**:
   - Maximum 20 steps per sequence
   - At least one step required if sequence exists
3. **Mission Requirements**:
   - Title and description still required
   - Category and delivery channels still required

## Testing Checklist

1. ✅ Create mission with 2 Story Slides + 1 Video + 1 Battle
2. ✅ Reorder steps and verify order persists
3. ✅ Edit existing step and save
4. ✅ Delete step from sequence
5. ✅ Upload image/video to Firebase Storage
6. ✅ Open MissionRunner and progress through steps
7. ✅ Battle step launches Island Raid with correct config
8. ✅ Mission completion after final step
9. ✅ Old missions (no sequence) still work

## Notes

- **Upload Limitation**: Media uploads require mission to be saved first (missionId needed for storage path). During creation, admins can use URL input as fallback.
- **Battle Integration**: Battle steps create Island Raid battle rooms with simplified enemy generation. Can be enhanced to use existing battle configs.
- **Order Normalization**: Step order is recomputed on every save to prevent drift (0..n-1 based on array index).
- **Version Tracking**: `sequenceVersion` increments on each sequence edit for potential future use (rollback, history, etc.).

## Future Enhancements

- Drag-and-drop reordering (using @dnd-kit)
- Battle config templates/references
- Step preview in builder
- Auto-save drafts
- Sequence templates
- Analytics on step completion times

