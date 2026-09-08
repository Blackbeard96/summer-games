# MST Design System (Phase 1)

Foundation for the Masters of Space & Time visual redesign.

## Tokens
- `src/styles/mst-tokens.css` — CSS custom properties
- `src/theme/mstTokens.ts` — JS helpers for legacy inline styles

## Base chrome
- `src/styles/mst-base.css` — cosmic shell, typography helpers, navbar HUD classes

## Components (`src/components/mst/`)
Import from `../components/mst` or `./mst`:

- `MSTPage`, `MSTPanel`, `MSTCard`, `MSTButton`
- `MSTSectionHeader`, `MSTStatCard`, `MSTBadge` / `MSTStatusBadge`
- `MSTProgressBar`, `MSTNavTile`, `MSTEmptyState`
- `CinematicHero` — swappable hero imagery via `/assets/mst/backgrounds/`

## Rollout order
1. Global theme + shell + nav (done)
2. Home
3. Admin
4. Profile
5. Journey
6. Battle HUD
7. Artifacts / Market / Battle Pass
8. Skill & Mastery
9. Polish / responsive / motion

Do not change game logic, Firebase, or data models when adopting these components.
