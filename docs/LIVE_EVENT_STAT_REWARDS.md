# Live Event → Power stat XP (manual verification)

## Where it runs

| Trigger | File / function | Stat |
|--------|------------------|------|
| Host ends live session | `inSessionService.endSession` → `finalizeSessionStats` | Per `liveEventMode` + performance (see `computeSessionEndPowerXp`) |
| Student submits live reflection | `assessmentGoalsFirestore.submitLiveEventReflectionToAssessment` → `awardPowerXpForReflectionSubmission` | Emotional (min 20 XP) |
| Habit / assessment / story goal milestones | `assessmentGoalsFirestore` → `awardPowerXpForGoalAchievement` | Spiritual (min 35 XP) |
| Optional mid-event drip | `liveQuizService` → `awardPowerXpForLiveQuizCorrectAnswer` / `awardPowerXpForElimination` | Only if `REACT_APP_LIVE_EVENT_POWER_DRIP=true` |

Persistence: `students/{uid}.stats.{physical,mental,emotional,spiritual}` via `awardPowerStatXp` (transaction + `normalizePlayerPowerStats`).

## Console

Successful writes log: `[STAT REWARD] +N <branch> Power XP → <uid> (source)`.

## Manual checks

1. **Battle Royale** — Create session `liveEventMode: battle_royale`, play briefly, end session. Profile Power stats: Physical XP increased by ≥ 25 (session-end floor).
2. **Quiz** — `liveEventMode: quiz`, end session with no correct answers. Mental XP increased by ≥ 25.
3. **Reflection** — Submit a valid reflection in a reflection session; Emotional XP increased by ≥ 20 (submit path). Session-end emotional grant is participation-only (no duplicate floor).
4. **Goals** — Finalize a habit with reward applied; Spiritual XP increased by ≥ 35.
5. **Roster edge** — Player in `participantRecords` but missing `stats/{uid}` subdoc still receives session-end Power XP after host ends session.
6. **Firestore** — Confirm `students.stats` object: all four branches present after first award (normalization).

## Follow-ups

- Revisit `class_flow` / `neutral_flow` defaulting to Physical in `getPowerTypeForEvent` if product wants a different mapping.
- Consider extracting pure `computeSessionEndPowerXp` to a Firebase-free module for unit tests without mocking `firebase.ts`.
