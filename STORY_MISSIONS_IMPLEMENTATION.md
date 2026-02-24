# Story Missions Implementation Summary

## ✅ Implementation Complete

The Story Missions system has been successfully implemented, integrating with both Home Hub NPCs and the Player's Journey tab.

---

## 📁 Files Created/Modified

### New Files
1. **`src/types/missions.ts`** - TypeScript types for mission system
2. **`src/utils/missionsService.ts`** - Centralized mission service (accept, track, complete)
3. **`src/components/NPCMissionModal.tsx`** - NPC modal showing missions
4. **`src/components/StoryMissionsSection.tsx`** - Story missions display for Player Journey
5. **`src/components/MissionAdmin.tsx`** - Admin UI for creating/editing missions
6. **`STORY_MISSIONS_TEST_CHECKLIST.md`** - Comprehensive test checklist

### Modified Files
1. **`src/pages/Home.tsx`**
   - Added NPC hotspots section (Sonido, Zeke, Luz, Kon)
   - Updated background image to `Home_BKG_V2.png`
   - Integrated NPC mission modals

2. **`src/components/ChapterDetail.tsx`**
   - Added StoryMissionsSection component
   - Shows story missions at top of challenges tab

3. **`src/pages/AdminPanel.tsx`**
   - Added "Mission Admin" tab
   - Integrated MissionAdmin component

4. **`src/services/liveFeed.ts`**
   - Added support for `mission_accept`, `mission_complete`, `chapter_complete` events

---

## 🗄️ Firestore Schema

### Collections

#### `missions/{missionId}` (Mission Templates)
```typescript
{
  id: string;
  title: string;
  description: string;
  npc?: "sonido" | "zeke" | "luz" | "kon" | null;
  missionCategory: "SIDE" | "STORY";  // Default: "SIDE"
  deliveryChannels: ("HUB_NPC" | "PLAYER_JOURNEY")[];  // Default: ["HUB_NPC"]
  story?: {
    chapterId: string;        // e.g. "chapter_1"
    order: number;            // Order within chapter
    required: boolean;        // Default: true for STORY
    prerequisites?: string[]; // Mission IDs required first
  };
  gating?: {
    minPlayerLevel?: number;
    requiresChapterUnlocked?: boolean;
    chapterId?: string;
  };
  rewards?: {
    xp?: number;
    pp?: number;
    items?: string[];
    moves?: string[];
  };
  objectives?: Array<{
    type: string;
    description: string;
    target?: number;
  }>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### `playerMissions/{playerMissionId}` (Player Mission Instances)
```typescript
{
  id: string;
  userId: string;
  missionId: string;  // Reference to missions/{missionId}
  status: "available" | "active" | "completed" | "locked";
  source: "HUB_NPC" | "PLAYER_JOURNEY";
  acceptedAt: Timestamp;
  completedAt?: Timestamp;
  progress?: {
    [objectiveId: string]: number;
  };
}
```

#### `playerStoryProgress/{userId}` (Player Story Progress)
```typescript
{
  userId: string;
  currentChapterId: string;      // e.g. "chapter_1"
  unlockedChapterIds: string[];  // e.g. ["chapter_1", "chapter_2"]
  updatedAt: Timestamp;
}
```

---

## 🔧 Key Features

### 1. Mission Classification
- **SIDE missions**: Optional hub loop missions (existing behavior preserved)
- **STORY missions**: Required for chapter progression

### 2. Dual Access Points
- **Home Hub NPCs**: Click NPC hotspots to see missions
- **Player Journey Tab**: Canonical story progression view

### 3. Story Mission Rules
- Only one active STORY mission per chapter allowed
- Prerequisites gating (must complete previous missions)
- Chapter completion unlocks next chapter
- Required vs optional missions

### 4. Admin Controls
- Create/edit missions via Admin Panel
- Toggle between SIDE and STORY
- Set chapter metadata (chapterId, order, required)
- Assign NPCs and delivery channels
- Set prerequisites and gating requirements

### 5. Live Feed Integration
- Mission accept events logged (respects privacy)
- Mission complete events logged
- Chapter completion events logged

---

## 🎯 Usage Guide

### For Admins

1. **Create a Story Mission:**
   - Go to Admin Panel → Mission Admin tab
   - Click "Create Mission"
   - Set Mission Category to "STORY"
   - Fill in chapterId, order, required status
   - Select delivery channels (HUB_NPC, PLAYER_JOURNEY, or both)
   - Assign NPC if mission should appear in hub
   - Save

2. **Convert SIDE to STORY:**
   - Edit existing mission
   - Change Mission Category to "STORY"
   - Add story metadata (chapterId, order)
   - Save

### For Players

1. **Accept from Home Hub:**
   - Click NPC hotspot on Home page
   - View missions (STORY pinned at top)
   - Click "Accept Mission"

2. **Accept from Player Journey:**
   - Navigate to `/chapters`
   - Select current chapter
   - View Story Missions section
   - Click "Accept Mission"

3. **Track Progress:**
   - Active missions show in both locations
   - Completed missions marked with checkmark
   - Chapter completion unlocks next chapter

---

## 🔒 Backward Compatibility

- Existing missions without new fields default to:
  - `missionCategory: "SIDE"`
  - `deliveryChannels: ["HUB_NPC"]`
  - `story: undefined`
- No breaking changes to existing SIDE missions
- All UI handles missing fields gracefully

---

## 📊 Migration Notes

When deploying:
1. Existing missions in Firestore will work with defaults
2. No migration script needed (defaults applied at read time)
3. Admins can gradually convert missions to STORY as needed

---

## 🐛 Known Limitations (MVP)

1. **Single Active Story Mission Per Chapter**: MVP rule - only one active STORY mission per chapter. Can be relaxed later if needed.

2. **Simple Chapter Unlock**: Chapters unlock sequentially. No complex branching logic yet.

3. **Basic Prerequisites**: Only mission ID prerequisites supported. No complex condition chains.

4. **Rewards**: Basic XP/PP rewards implemented. Full reward system (items, moves) can be expanded.

---

## 🚀 Future Enhancements

- Multiple active STORY missions per chapter
- Complex prerequisite chains
- Mission objectives tracking UI
- Mission progress indicators
- Mission rewards UI
- Mission history/archive
- Mission analytics for admins

---

## 📝 Testing

See `STORY_MISSIONS_TEST_CHECKLIST.md` for comprehensive test plan.

---

## 🎉 Summary

The Story Missions system is now fully integrated:
- ✅ Home Hub NPC hotspots with mission modals
- ✅ Player Journey tab showing story missions
- ✅ Admin UI for mission management
- ✅ Chapter completion and unlock logic
- ✅ Live feed integration
- ✅ Backward compatible with existing missions
- ✅ No breaking changes

Ready for testing and deployment! 🚀

