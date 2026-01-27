# Live Events Rebrand - Complete Inventory

## Step A0: Current System Map

### Firestore Collections/Paths
**Current (to maintain backward compatibility):**
- `inSessionRooms/{sessionId}` - Main session document
  - Fields: `classId`, `className`, `teacherId`, `hostUid`, `status` ('open' | 'active' | 'closed' | 'live' | 'ended')
  - `players[]` - Array of `SessionPlayer` objects (NOT a subcollection currently)
  - `activeViewers[]` - Array of user IDs
  - `battleLog[]` - Array of log strings
  - `createdAt`, `startedAt`, `endedAt` timestamps

**New Structure (for scalability):**
- `classrooms/{classId}/liveEvents/{eventId}` (recommended for new events)
- `classrooms/{classId}/liveEvents/{eventId}/players/{uid}` (subcollection for presence)
- Keep `inSessionRooms` as legacy alias for now

### Components to Update
1. `src/components/InSessionNotification.tsx` → `LiveEventNotification.tsx`
2. `src/components/InSessionBattle.tsx` → Keep name, update strings
3. `src/components/InSessionRoom.tsx` → Keep name, update strings
4. `src/components/InSessionCreate.tsx` → Keep name, update strings
5. `src/components/InSessionBattleView.tsx` → Keep name, update strings
6. `src/components/SessionSummaryModal.tsx` → Keep name, update strings
7. `src/pages/InSession.tsx` → `LiveEvents.tsx` (new main page)

### Routes to Update
**Current:**
- `/in-session` → `/live-events` (new main page)
- `/in-session/:sessionId` → `/live-events/:eventId` (alias redirects)
- `/in-session/room/:roomId` → `/live-events/room/:roomId` (alias redirects)
- `/in-session/create` → `/live-events/create` (alias redirects)

**New:**
- `/live-events` - Main Live Events listing page
- `/live-events/:eventId` - Event battle view
- Keep `/in-session/*` routes as backward-compatible redirects

### User-Facing Strings to Update
- "In-Session" → "Live Event"
- "In session" → "Live Event"
- "Rejoin Session" → "Rejoin Live Event"
- "Join Session" → "Join Live Event"
- "End Session" → "End Live Event"
- "Session" → "Event" (context-dependent)
- "Active Session" → "Active Event"

### Service Files
1. `src/utils/inSessionService.ts` - Add aliases, update function names where appropriate
2. `src/utils/inSessionPresenceService.ts` - Update comments/strings
3. `src/utils/inSessionActionsService.ts` - Update comments/strings
4. `src/utils/inSessionSkillsService.ts` - Update comments/strings
5. `src/utils/inSessionStatsService.ts` - Update comments/strings

### Internal Identifiers (Keep for Backward Compatibility)
- Collection name: `inSessionRooms` (keep, but alias with `liveEvents`)
- Type names: `InSessionRoom`, `SessionPlayer` (can add aliases)
- Function names: `joinSession`, `createSession`, `endSession` (keep, add aliases if needed)


