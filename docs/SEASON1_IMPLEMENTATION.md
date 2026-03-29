# Season 1 — Flow State expansion (implementation notes)

## Audit summary (existing systems reused)

| Area | Existing | Reuse |
|------|----------|--------|
| Live events | `inSessionRooms`, `LiveEvents.tsx`, `InSessionCreate`, `InSessionBattle`, `liveQuizService` | Extended room doc with `liveEventMode`, `goalLinkingEnabled`, `energyTypeAwarded` |
| Battle log (live) | `inSessionRooms.battleLog` + `InSessionBattle` listener | `arrayUnion` streak / energy lines from `inSessionStatsService` |
| Participation / PP skills | `trackParticipation`, `movesEarned`, `inSessionSkillsService`, `liveEventSkillCost.ts` | Streak + `season1SkillCost` for energy / awakened flow |
| Battle pass | `BattlePass.tsx`, `Home.tsx` season0 tiers, `battlePass/{uid}_seasonN` | New full-page `BattlePassSeasonPage` + `season1` student subdocument for Season 1 XP |
| Profile / stats | `Profile.tsx`, `students` collection | Links to Energy Mastery + Manifest evolution; `season1` hydration |
| Admin | `AdminPanel.tsx` | `Season1AdminPanel` tab for tuning docs |
| Types | `types/battle.ts` Move | Optional `season1Cost` on Move |

## New files

- `src/types/season1.ts` — Firestore-oriented models + defaults
- `src/utils/season1Energy.ts` — mode → energy, XP curve, bonuses, award helpers
- `src/utils/season1PlayerHydration.ts` — merge `students.season1` safely
- `src/utils/goalOutcome.ts` — `evaluateGoalOutcome`
- `src/utils/participationStreak.ts` — streak messages (pure)
- `src/utils/season1SkillCost.ts` — participation + energy + awakened resolution
- `src/utils/season1FirestoreWrites.ts` — `awardEnergy` (throttled student doc update)
- `src/data/manifestSkillEvolution.ts` — PP costs, max targets per level
- `src/data/skillCardsCatalog.ts` — seed skill card definitions
- `src/pages/BattlePassSeasonPage.tsx`
- `src/pages/EnergyMasteryPage.tsx`
- `src/pages/ManifestSkillEvolutionPage.tsx`
- `src/components/admin/Season1AdminPanel.tsx`
- `src/components/admin/BattlePassSeasonAdmin.tsx` — CRUD UI for `seasons/{id}` (tiers, rewards, deploy active)
- `src/utils/seasonFirestoreService.ts` — list/save/delete seasons, exclusive activate + `adminSettings/season1.activeBattlePassSeasonId`

## Refactors

- `inSessionStatsService.trackParticipation` — optional battle-log streak lines; stats fields `consecutiveParticipationAwards`, `displayParticipationStreak`
- `liveQuizService` — on incorrect answer, `breakParticipationStreak`
- `inSessionSkillsService.validateSkillUsage` — optional Season 1 resource resolution
- `types/battle.ts` — optional `season1Cost` on Move

## Firestore (new / extended)

**`students/{uid}`**

- `season1` (map, optional): energies, energyLevels, energyXP, flowState, streaks (global profile), manifest progression, skill cards, battlePass, activeGoalIds

**`inSessionRooms/{id}`**

- `liveEventMode`, `goalLinkingEnabled`, `energyTypeAwarded`, `neutralFlowEnergyType` (optional)
- `battleLog` (existing array) — appended streak messages
- `season1Config` (optional) — awakened flow testing flags

**`seasonGoals/{goalId}`** (recommended path for goals)

- Documents matching `Goal` type in `types/season1.ts`

**`goalLinkedResponses/{id}`** or subcollection under goal

- `GoalLinkedResponse` records

**`seasons/{seasonId}`** + **`skillCards/{id}`**

- Admin-managed via **Admin → Season 1 → Battle Pass seasons** (`BattlePassSeasonAdmin` + `seasonFirestoreService`)
- Optional pointer: **`adminSettings/season1.activeBattlePassSeasonId`** set when using **Deploy as active season**

## Manual setup

1. Deploy Firestore rules to allow new fields on `students`, `inSessionRooms`, and admin collections as needed.
2. Create initial `seasons/season_1` document (or use Admin → Season 1 to seed).
3. Existing players: no migration required — client uses `defaultSeason1PlayerSlice()`.

## Follow-ups

- Wire `GoalLinkedResponse` writes from each live mode UI (reflection prompts, goal-setting flow, neutral flow timers).
- Server-side validation for manifest customization and skill card effects.
- Battle pass XP from dedicated `season1.battlePass.battlePassXP` with Cloud Function accrual if anti-cheat needed.
