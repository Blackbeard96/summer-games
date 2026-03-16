# Live Event Quiz Mode — Audit (Step 0)

## Current Live Events Schema and Files

### Firestore
- **Collection:** `inSessionRooms` (root)
- **Document:** `inSessionRooms/{sessionId}`
  - `classId`, `className`, `hostUid`, `teacherId`
  - `status`: `'open' | 'active' | 'closed' | 'live' | 'ended'`
  - `mode`: `'in_session'`
  - `players`: array of `{ userId, displayName, photoURL, level, powerPoints, participationCount, movesEarned, eliminated?, ... }`
  - `battleLog`: string[]
  - `createdAt`, `startedAt`, `endedAt`, `updatedAt`
  - `sessionSummary` (when ended)
- **Subcollections:**
  - `inSessionRooms/{sessionId}/stats/{playerId}` — per-player session stats (inSessionStatsService)
  - `inSessionRooms/{sessionId}/players/{userId}` — presence/loadout (inSessionPresenceService, inSessionSkillsService)

### Key Files
- **Pages:** `src/pages/LiveEvents.tsx` (list/join), `src/pages/InSession.tsx` (legacy room list)
- **Views:** `src/components/InSessionBattleView.tsx` (wrapper that resolves sessionId and renders InSessionBattle), `src/components/InSessionBattle.tsx` (main Live Event room UI)
- **Services:** `src/utils/inSessionService.ts`, `inSessionPresenceService.ts`, `inSessionActionsService.ts`, `inSessionStatsService.ts`, `inSessionSkillsService.ts`
- **Types:** `src/types/inSession.ts`, `src/types/battleSession.ts`

### Routes
- `/live-events` → LiveEvents (list)
- `/live-events/session/:sessionId` → InSessionBattleView → InSessionBattle

---

## Current Training Grounds Quiz Schema and Files

### Firestore
- **Quiz sets:** `trainingQuizSets/{quizSetId}`
  - `title`, `description`, `createdBy`, `classIds?`, `groupIds?`, `isPublished`, `questionCount`, `tags?`, `createdAt`, `updatedAt`
- **Questions:** `trainingQuizSets/{quizSetId}/questions/{questionId}`
  - `prompt`, `imageUrl?`, `options` (string[]), `correctIndices` (number[]), `correctIndex?` (deprecated), `explanation?`, `difficulty`, `pointsPP`, `pointsXP`, `artifactRewards?`, `order`, `createdAt`, `updatedAt`
- **Attempts:** `trainingAttempts/{attemptId}` — solo attempts (userId, quizSetId, startedAt, completedAt, scoreCorrect, scoreTotal, percent, answers[], rewards, mode: 'solo' | 'live')

### Key Files
- **Pages:** `src/pages/TrainingGrounds.tsx` (list quizzes), `src/pages/QuizPlayer.tsx` (play quiz), `src/pages/QuizResults.tsx` (results)
- **Admin:** `src/components/TrainingGroundsAdmin.tsx`
- **Service:** `src/utils/trainingGroundsService.ts` — getQuizSet, getQuestions, getPublishedQuizSets, createAttempt, etc.
- **Types:** `src/types/trainingGrounds.ts` — TrainingQuestion, TrainingQuizSet, TrainingAttempt, TrainingAnswer

### Question model (TrainingQuestion)
- Already normalized: `options[]`, `correctIndices[]`, `imageUrl`, `prompt`, `difficulty`. Single/multi select inferred from `correctIndices.length`.
- No `questionType` field; no `timeLimitSeconds` (optional override can be added).
- **Reusable:** Yes. Live Events can call `getQuestions(quizSetId)` and use the same question docs.

---

## Existing Timed Question / MCQ / Results Components

- **QuizPlayer.tsx:** Full quiz flow — progress bar, question card (prompt + image), answer options (single/multi), feedback (correct/incorrect + explanation), Next/Submit. No per-question timer; uses `questionStartTime` for timeSpentMs only.
- **QuizResults.tsx:** Results page after solo attempt (score, rewards, etc.).
- No existing **countdown timer** component; no **live** multi-player question flow.

---

## Existing Leaderboard Component

- **Leaderboard.tsx:** Global XP/powerLevel leaderboard (students collection). Not in-session. Can reuse pattern (rank, name, score) for live quiz leaderboard.

---

## Recommended Integration Points

1. **Question source of truth:** Use `trainingQuizSets` and `trainingQuizSets/{id}/questions` only. Add optional `isLiveEventCompatible: boolean` and `timeLimitSeconds?: number` on **quiz set** if needed (default true, default 20s).
2. **Live Event quiz state:** Store under Live Event session:
   - `inSessionRooms/{sessionId}/quizSession/current` — single doc: status, quizId, questionIndex, questionOrder[], currentQuestionId, questionStartedAt, questionEndsAt, timeLimitSeconds, hostUid, leaderboard { [uid]: number }.
   - `inSessionRooms/{sessionId}/quizSession/current/responses/{uid}` — one doc per player for current question: currentQuestionId, selectedIndices, submittedAt, isCorrect, pointsAwarded. (Or per-question responses: `questions/{questionId}/responses/{uid}`; single doc per player is simpler for “current question only” and avoids duplication when advancing.)
3. **Reuse from Training Grounds:** Extract or reuse from QuizPlayer: question card (prompt + image), answer option list. Add new: countdown timer, “answer locked” state, live leaderboard.
4. **InSessionBattle:** Add a host-only “Quiz Mode” tab/section: choose quiz, set timer, start quiz. When `quizSession.status` is not idle, show quiz UI for all (host: control panel + live answer counts; players: question + answers + timer). Battle Log can show quiz events (e.g. “Question 1 started”, “Correct answers: 5/10”).
5. **Scoring:** New util `calculateLiveQuizPoints({ isCorrect, submittedAt, questionStartedAt, questionEndsAt })` — base 100 + speed bonus up to 50. Write to `responses/{uid}` and aggregate into `quizSession/current.leaderboard`.
6. **Security:** Host-only writes to `quizSession/current` (start/advance/end). Players write only to `responses/{uid}`. Server/transaction: reject submissions after `questionEndsAt` and enforce one submission per player per question (first answer locks).

---

## Summary

| Area              | Current state                                                                 | Recommendation                                              |
|-------------------|-------------------------------------------------------------------------------|-------------------------------------------------------------|
| Live Events schema| `inSessionRooms` + stats/players subcollections                              | Add `quizSession/current` + `quizSession/current/responses/{uid}` |
| Training Grounds  | Normalized questions, no timer, solo only                                     | Reuse as-is; add optional quiz-level `timeLimitSeconds`    |
| Reusability       | QuizPlayer has full question/answer UI                                        | Extract shared QuestionCard + AnswerOptions; add timer + leaderboard |
| Leaderboard       | Global Leaderboard page only                                                  | New LiveQuizLeaderboard component for in-session quiz       |

---

## Security (Firestore rules)

- **quizSession/current:** Only host (session.hostUid) can create/update (start, advance, set status, end, clear). Players must not write here.
- **quizSession/current/responses/{uid}:** Only the authenticated user with uid === {uid} can create/update their own response doc. Reject writes after questionEndsAt (enforced in app via transaction; rules can optionally validate request.time).
- **Late answers:** Rejected in submitQuizResponse transaction (questionEndsAt < now). First answer per player per question enforced (one doc per uid, overwritten per question; duplicate submission for same questionId rejected).
