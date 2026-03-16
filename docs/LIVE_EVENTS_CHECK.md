# Live Events – Pre-Test Check

Summary of how the four areas you asked about are implemented and what to verify during testing.

---

## 1. Player connections

### How it works
- **Join:** From `/live-events`, a player taps “Join” on an event. `LiveEvents.tsx` calls `joinSession(event.id, newPlayer)` from `inSessionService.ts`. The join is **transaction-based**: the session doc is updated with the new player, and a **presence doc** is created/updated at `inSessionRooms/{sessionId}/players/{userId}` with `connected: true`, `lastSeenAt`, `joinedAt`.
- **Presence:** When a player is on the event battle page (`InSessionBattle`), `startPresence(sessionId, currentUser.uid)` runs (`inSessionPresenceService.ts`). It:
  - Writes a heartbeat to `inSessionRooms/{sessionId}/players/{userId}` every 15s.
  - Sets `connected: false` when the tab is hidden or the user leaves the page.
- **Subscription:** `subscribeToPresence(sessionId, callback)` listens to the session doc, then for each player in `session.players` fetches that player’s presence from the `players/{userId}` subcollection and builds a `presenceMap`. The UI uses this to show who is “present” (e.g. green border in `renderPlayerCard`: `isPresentInPresenceService`).

### What to verify
- [ ] From `/live-events`, joining an event adds you to the list and navigates to `/live-events/{eventId}`.
- [ ] Other players see you in the “Players” list and your presence (e.g. green border) when you’re on the battle screen.
- [ ] If you switch tab or minimize, you are eventually shown as disconnected; when you come back, you show as connected again (heartbeat ~15s).
- [ ] Rejoining the same event (e.g. refresh then join again) is idempotent and does not duplicate you in the list.

---

## 2. Training Grounds integration

### How it works
- **Quiz in Live Event:** The host can start a **Live Quiz** from the battle screen. “Start Quiz” uses Training Grounds quiz sets: the host picks a quiz (from `trainingQuizSets`) and options (number of questions, time limit, rewards). `liveQuizService.startQuizSession(sessionId, hostUid, quizId, numQuestions, timeLimitSeconds, rewardConfig)` is called.
- **Data source:** `liveQuizService` uses `getQuizSet(quizId)` and `getQuestions(quizId)` from `trainingGroundsService.ts`, so questions and quiz metadata come from the same Training Grounds data as the standalone Training Grounds quiz.
- **Flow:** When the host starts a quiz, `inSessionRooms/{sessionId}/quizSession/current` is updated with `quizId`, question order, `status: 'question_live'`, `currentQuestionId`, `questionEndsAt`, etc. All clients subscribe via `subscribeQuizSession(sessionId, ...)`. When `quizSession?.quizId` is set, `InSessionBattle` loads questions with `getQuestions(quizSession.quizId)` and shows the Live Quiz UI (question, countdown, answer options). Player responses are written to `quizSession/current/responses/{uid}`; scoring uses `liveQuizScoring` and can award PP. When the quiz ends, awards can be stored in the session (e.g. `lastQuizAwardsSnapshot`) and included in the session summary.

### What to verify
- [ ] As host, “Start Quiz” (or equivalent) opens a way to choose a **Training Grounds** quiz set (same sets as on the Training Grounds page).
- [ ] After you start a quiz, all players in the event see the same question and countdown.
- [ ] Players can submit answers; after time or host advance, the next question appears and results/awards are consistent.
- [ ] If the session has a quiz, the end-of-session summary can include quiz-related awards (e.g. `quizAwardsSnapshot` in the summary).

---

## 3. Showing results to all players and the host at the end

### How it works
- **Ending the session:** Only the host (or admin/global host) can end the session. The “End Session” button in `InSessionBattle` calls `endSession(sessionId, currentUser.uid, currentUser.email)` (`inSessionService.ts`).
- **Summary computation:** `endSession` calls `finalizeSessionStats(sessionId, playerIds)` (`inSessionStatsService.ts`). That:
  - Reads each player’s stats from `inSessionRooms/{sessionId}/stats/{playerId}`.
  - Computes duration, net PP, MVP badges (most PP, eliminations, participation, damage, survivor).
  - Builds a `SessionSummary` (sessionId, classId, className, startedAt, endedAt, duration, totalPlayers, stats, mvpPlayerId, optional quizAwardsSnapshot).
  - Writes the summary into the **session document**: `updateDoc(sessionRef, { sessionSummary: summary, status: 'ended', endedAt: sessionEndTime })`.
- **Then** `endSession` does a second update: `updateDoc(sessionRef, { status: 'ended', endedAt, battleLog: [...updatedBattleLog] })`. So the session doc ends up with both `sessionSummary` and the final `battleLog`.
- **Who sees it:** Every client (including host and all players) is subscribed to the session via `subscribeToSession(sessionId, callback)` in `InSessionBattle`. When the doc updates with `status: 'ended'` and `sessionSummary`, the subscription callback runs. The effect that depends on `session` checks `session.status === 'ended'` and then:
  - Prefers `(session as any).sessionSummary`; if missing, falls back to `getSessionSummary(sessionId)`.
  - Calls `setSessionSummary(summaryData)` and `setShowSessionSummary(true)`.
- **Modal:** `SessionSummaryModal` is rendered when `showSessionSummary` is true and receives `summary` and `currentPlayerId`. It shows stats for all players, MVP badges, duration, and PP breakdown. It only closes via the “Close” button (not Escape or backdrop).

### What to verify
- [ ] When the host clicks “End Session”, the session status becomes “ended” and the session document gets `sessionSummary` and updated `battleLog`.
- [ ] **Host** sees the summary modal immediately (or after a short delay) with full stats and can close it with “Close”.
- [ ] **All other players** (still on the event page) see the same summary modal without refreshing; they can close it with “Close”.
- [ ] Summary content is consistent for everyone (same players, same MVP, same duration and PP info). If a quiz was run, quiz-related awards appear where implemented.

---

## 4. Players being able to use skills

### How it works
- **Move list:** `InSessionBattle` gets moves from `BattleContext` (e.g. `moves` / battle loadout). The move menu and “FIGHT” flow use these moves; only unlocked moves are available.
- **Selection:** Player selects a move from the move menu (e.g. “Select Move” → choose skill). Then they choose a **target** by clicking another player’s card (not themselves). So: **Select move → Click target.**
- **Dispatch:** On target click, `InSessionBattle` checks `selectedMove` and target validity, then dispatches a custom event:  
  `window.dispatchEvent(new CustomEvent('inSessionMoveSelect', { detail: { move: selectedMove, targetId: student.id, traceId, classId, eventId: sessionId } }))`.
- **Execution:** `BattleEngine` (used inside `InSessionBattle` with `isInSession={true}`, `sessionId={sessionId}`) listens for `inSessionMoveSelect`. On receipt it:
  - Resolves the skill (damage, shield damage, healing, shield boost, PP stolen/cost, log message) using the same resolver used elsewhere.
  - Calls `applyInSessionMove(...)` from `inSessionMoveService.ts` with sessionId, actor, target, move, and resolved values (or `resolvedAction`).
- **Authoritative write:** `applyInSessionMove` runs a **Firestore transaction**: reads the session doc, finds actor and target in `players`, applies HP/shield/PP changes, updates `players` and `battleLog`, and writes back. So the session doc is the single source of truth.
- **Sync:** All clients are subscribed to the same session doc. When the transaction updates `players` and `battleLog`, every subscriber (including the actor and others) gets the new state and the UI updates (e.g. HP/shield/PP and battle log).

### What to verify
- [ ] Every player in the event (with unlocked moves) can open the move menu and select a skill.
- [ ] After selecting a skill, clicking another player’s card (target) applies the move: you see the move go through (e.g. battle log entry, target HP/shield/PP update).
- [ ] All other players see the same update (same log line, same target state) without refresh.
- [ ] You cannot target yourself for attacks (or the UI prevents it). Defensive/self-target moves should still be usable on self if the design allows.
- [ ] Cost and cooldowns are respected (PP cost, cooldown turns); invalid moves are rejected or disabled.

---

## Quick reference – key files

| Area              | Main files |
|-------------------|------------|
| Player connections| `pages/LiveEvents.tsx`, `utils/inSessionService.ts` (joinSession), `utils/inSessionPresenceService.ts`, `components/InSessionBattle.tsx` (startPresence, subscribeToPresence, presenceMap in renderPlayerCard) |
| Training Grounds | `utils/liveQuizService.ts` (getQuizSet, getQuestions from trainingGroundsService), `utils/trainingGroundsService.ts`, `components/InSessionBattle.tsx` (quiz UI, startQuizSession, subscribeQuizSession, getQuestions(quizSession.quizId)) |
| End results       | `utils/inSessionService.ts` (endSession), `utils/inSessionStatsService.ts` (finalizeSessionStats, getSessionSummary), `components/InSessionBattle.tsx` (session subscription, sessionSummary state, SessionSummaryModal), `components/SessionSummaryModal.tsx` |
| Using skills      | `components/InSessionBattle.tsx` (move menu, target click, inSessionMoveSelect dispatch), `components/BattleEngine.tsx` (inSessionMoveSelect listener, applyInSessionMove), `utils/inSessionMoveService.ts` (applyInSessionMove transaction) |

---

## Optional debug flags

- `REACT_APP_DEBUG_LIVE_EVENTS=true` – more logging for Live Event join, session updates, and move flow.
- `REACT_APP_DEBUG_LIVE_EVENT_SKILLS=true` – extra logging around skill/move application.
- `REACT_APP_DEBUG_LIVE_QUIZ=true` – Live Quiz service logging.
- `REACT_APP_DEBUG_IN_SESSION_MOVES=true` – in-session move application logging.

Set in `.env` or `.env.local` and restart the dev server.
