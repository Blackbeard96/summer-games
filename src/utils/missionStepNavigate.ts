/**
 * Allowlisted in-app routes for mission slide/video "Continue" redirects.
 * Stored on mission steps as `navigateTo`; never pass through arbitrary URLs.
 */

export const MISSION_STEP_NAVIGATE_OPTIONS: { path: string; label: string }[] = [
  { path: '', label: 'None (stay in mission)' },
  { path: '/home', label: 'Home' },
  { path: '/profile', label: 'Profile' },
  { path: '/skill-tree', label: 'Skill tree' },
  { path: '/battle', label: 'Battle' },
  { path: '/artifacts', label: 'Artifacts' },
  { path: '/marketplace', label: 'Marketplace' },
  { path: '/battle-pass', label: 'Battle pass' },
  { path: '/training-grounds', label: 'Training grounds' },
  { path: '/assessment-goals', label: 'Assessment goals' },
  { path: '/island-raid', label: 'Island raid' },
  { path: '/island-run', label: 'Island run' },
  { path: '/chapters', label: 'Chapters / journey' },
];

const ALLOWED_PATHS = new Set(
  MISSION_STEP_NAVIGATE_OPTIONS.map((o) => o.path).filter((p) => p.length > 0)
);

/** Returns a safe app path, or undefined if missing / not allowlisted. */
export function normalizeMissionNavigateTo(raw: unknown): string | undefined {
  if (raw == null || typeof raw !== 'string') return undefined;
  const t = raw.trim();
  if (!t) return undefined;
  if (!ALLOWED_PATHS.has(t)) return undefined;
  return t;
}
