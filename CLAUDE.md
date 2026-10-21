# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start                 # dev server on :3000 (CRA; eslint react-app runs inline)
npm run build             # production build to build/
npx tsc --noEmit          # typecheck only (tsconfig sets noEmit)
npm test                  # jest in watch mode
CI=true npm test                                    # one-shot, all tests
CI=true npm test -- --testPathPattern=elementAdvantages   # one-shot, single test file
```

Deploy (Firebase project `summer-games-99fba`, hosted at https://summer-games-99fba.web.app):

```bash
npm run deploy                              # builds, then deploys hosting only
firebase deploy --only firestore:rules      # firestore.rules
firebase deploy --only firestore:indexes    # firestore.indexes.json
firebase deploy --only storage              # storage.rules
```

Cloud Functions live in `functions/` with their own package.json and Node 22 runtime:

```bash
cd functions && npm run build    # tsc -> functions/lib
cd functions && npm run serve    # build + emulator
cd functions && npm run deploy
```

There is no lint script. Firebase config comes from `REACT_APP_FIREBASE_*` vars in `.env` / `.env.production` (both committed; `.env.local` is gitignored).

## Architecture

Create React App + React 19 + TypeScript 4.9, talking directly to Firebase from the browser. There is effectively no backend: `functions/src/index.ts` is a single small file of callable admin auth actions. **All game logic runs client-side against Firestore, so `firestore.rules` (~1600 lines) is the real authorization boundary** — a UI guard like `RequireAdmin` is decoration, not enforcement.

### Routing and providers

Every route is declared in `src/App.tsx` and lazily loaded through `withRouteSplitting()` (`src/utils/routing.tsx`), wrapped in `ProtectedRoute` or `RequireAdmin`. Provider stack, outermost first: `AuthProvider` → `LevelUpProvider` → `BattleProvider` → `StoryProvider` → `MilestoneProvider` → `ToastProvider`.

### Identity: always resolve the *active* user

Admins can impersonate test accounts. `useAuth()` exposes both `currentUser` (the real Firebase auth user) and `getActiveUserId()`, which returns the impersonated test-account id when in test mode. Player reads/writes must use `getActiveUserId()`, never `auth.currentUser.uid` directly. `isSwitchingIdentity` is set mid-swap so `onSnapshot` listeners don't remount against a stale uid; `loadingRole` deliberately stops flipping once known, because remounting the Admin tree wipes in-progress forms.

### Player state is mirrored across collections

One player spans `students/{uid}` (primary doc; readable by any authed user so Vault Siege can list targets), `users/{uid}`, `profiles/{uid}`, `vaults/{uid}` (battle HP / shield / PP), and `userRoles/{uid}`.

Power Points are mirrored in three places (`vaults.currentPP`, `students.powerPoints`, `users.powerPoints`). Always go through `src/utils/playerPowerPoints.ts` (`getPlayerPowerPoints` / `setPlayerPowerPoints` / `adjustPlayerPowerPoints`). The vault is canonical whenever a vault doc exists, **even at 0** — reconciling with `Math.max` silently reverts Marketplace and skill spends that only hit one store.

Other economy primitives: XP → level in `leveling.ts` (100 XP for L2, ×1.25 each level), Power Level in `powerLevel.ts` (level×10 + skills + artifacts + ascension), Truth Metal in `truthMetalPlayerBalance.ts`, normalized read model in `playerData.ts`.

### Battle: one resolver, many storage backends

`resolveSkillAction()` in `src/utils/battleSkillResolver.ts` is the single source of truth for damage, healing, shield, and PP math in **every** mode; `formatBattleLogEntry()` is the single source for log text. `src/components/BattleEngine.tsx` (~10k lines) is the shared turn driver and UI, switched between modes by props: `isInSession`/`sessionId` (Live Events), `isMultiplayer`/`gameId` (Island Raid), `mindforgeMode`, `spacesModeState`, `storyBattleRestrictions`, `customWaves`.

Modes differ only in where resolved deltas are persisted:

| Mode | Storage |
|---|---|
| Live Events | `inSessionMoveService.applyInSessionMove()` → transaction on `inSessionRooms/{sessionId}` |
| Island Raid | `islandRaidBattleRooms/{gameId}`, via `onOpponentsUpdate` |
| Journey / Story / Practice | local React state only |

`src/utils/battleAdapters.ts` defines the `BattleAdapter` interface formalizing that split. When adding a mode or changing combat math, change the resolver — never recompute damage in a component. See `docs/UNIFIED_BATTLE_SYSTEM.md` and `docs/BATTLE_ACTION_PIPELINE_MAP.md`.

### Content is catalog-in-code, overridden by Firestore

Skills, artifacts, marketplace items, and moves are defined as TypeScript constants in `src/data/*`, then overridden per-id at runtime by admin-edited Firestore docs (mostly under `adminSettings/*`). The merge/normalize helpers are the contract: `moveOverrides.ts` (5-minute cache), `marketplaceStoreMerge.ts`, `actionCardAdminMerge.ts`, `battleMovesManifestSync.ts`. Changing an item's shape means updating **both** the catalog type and its normalize function, or admin-authored values silently drop.

Admin editors for the Firestore side live in `src/components/*Admin.tsx` and `src/pages/admin/`.

### Skill effects engine

`src/utils/skillEffectEngine/` (core / validate / legacyAdapter / resolverBridge) is the newer declarative effect system. Effects are `SkillEffectPayload` rows described by `src/data/skillEffectRegistry.ts` (which also drives the admin form fields) and folded into resolved actions by `mergeSkillEffectsIntoResolvedSkillAction`. Legacy single `statusEffect` / `statusEffects` still arrive through `moveOverrides.ts`; both paths are live.

## Naming drift — do not "fix" it

The UI has been rebranded several times without migrating data. Renaming Firestore collections or fields to match current wording will break existing player data:

- UI **"Skills"** → Firestore `moves` collection and the `Move` type (`SKILLS_REFACTOR_SUMMARY.md`)
- UI **"Live Events"** → `inSessionRooms` collection, `InSession*` components, `inSession*` services (`LIVE_EVENTS_REBRAND_INVENTORY.md`)
- UI **"Island Raid"** → `islandRunLobbies` for lobbies but `islandRaidGames` / `islandRaidBattleRooms` for play
- UI **"Journey"** → `/chapters` route, `chapterProgression.ts`

## Firestore conventions

- Strip `undefined` before any write — `stripUndefinedDeep()` in `firestoreSanitize.ts`. Firestore rejects undefined anywhere in a payload.
- Use `runTransaction` for anything contended: lobby joins, PP changes, reward grants, session moves.
- Reward grants must be idempotent. The established pattern is a `rewardClaims/{challengeId}` subcollection written inside the transaction; deletion is admin-only so the claim record survives (see `challengeRewards.ts`, `SECURITY_FIX_SUMMARY.md`).
- Composite indexes go in `firestore.indexes.json`, which is what `firebase deploy` reads. `firestore-simplified.rules` is a reference document, not deployed.
- Roles are `admin | scorekeeper | student`, canonically in `userRoles/{uid}`. Fallbacks differ by caller: `AuthContext` falls back to `users/{uid}.role`, while the Cloud Function `assertIsAdmin` falls back to `students/{uid}.role`. Scorekeepers cannot mutate PP directly — they file `ppChangeRequests` for admin approval. Admin emails are hardcoded in both `functions/src/index.ts` and `firestore.rules`.

## Debugging

`src/firestoreErrorSuppression.ts` is imported *first* in `index.tsx` and **monkey-patches `console.error`** plus the window `error`/`unhandledrejection` handlers to swallow Firestore internal-assertion noise (ca9 / b815). App.tsx installs a second copy. If errors seem to vanish, that's why.

Three logging utilities, each with a distinct purpose:

- `utils/debug.ts` — component-filtered logging with `throttle` / `once` / `group`; toggle at runtime with `window.toggleDebug(bool)` and `window.toggleComponent(name, bool)`. See `DEBUG_UTILITY_GUIDE.md`.
- `utils/battleDebug.ts` — battle-pipeline tracing, gated on `REACT_APP_DEBUG_BATTLE` / `REACT_APP_DEBUG` / `REACT_APP_DEBUG_LIVE_EVENTS`.
- `utils/logger.ts` and `utils/debugLogger.ts` — dev-only passthrough and category logging (`ROSTER`, `BATTLE`, `AUTH`, …).

`utils/consoleCommands.ts` is imported by App.tsx purely for side effects; it registers browser-console helpers (`debugHelp()`, `debugAll()`, `checkMyRole()`, `setMyRole()`, …).

## Styling

MST design tokens in `src/styles/mst-tokens.css` plus per-surface sheets (`mst-vault`, `mst-siege`, `mst-journey`, `mst-profile`, `mst-mission`, `mst-contrast`), all imported in `index.tsx`. `src/theme/mstTokens.ts` mirrors them as JS strings for components still using inline `style={{}}`. Prefer `var(--mst-*)` over hard-coded hex in new UI. Tailwind is configured but used in only a handful of files — the codebase is overwhelmingly inline styles and plain CSS.

## Tests

Jest via react-scripts. The suite is pure game-math unit tests under `src/utils/__tests__/` (damage, skill costs, cooldowns, rewards, artifact rarity, weekly goals) plus a few colocated `*.test.ts`. There are no Firestore emulator or integration tests, so logic worth testing belongs in a `utils/` module rather than inside a component. Some existing test files deliberately omit TS annotations on fixture helpers to keep Babel happy.

## Documentation

`docs/` holds the durable architecture notes (battle pipeline, unification, spaces mode, Season 1). The ~50 uppercase `.md` files at the repo root are per-feature implementation and audit logs written as work landed — useful as history for a specific subsystem, but they describe intent at time of writing and some list unfinished TODOs. Trust the code over them.
