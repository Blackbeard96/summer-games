/**
 * Deep-merge chapter progress from `users/{uid}` and `students/{uid}`.
 * Shallow spreads (`{ ...users, ...students }`) let one collection wipe the other's
 * `chapters` when snapshot listeners fire in different orders.
 */

import { coerceCandyChoiceToString } from './rrCandyUtils';

function preserveEp2CandyChoice(merged: any, a: any, b: any): any {
  if (!merged || typeof merged !== 'object') return merged;
  const pick =
    coerceCandyChoiceToString(merged.candyChoice) ||
    coerceCandyChoiceToString(a?.candyChoice) ||
    coerceCandyChoiceToString(b?.candyChoice);
  if (pick) merged.candyChoice = pick;
  return merged;
}

export function isMissingOrEmptyChapters(chapters: unknown): boolean {
  if (chapters == null) return true;
  if (typeof chapters !== 'object') return true;
  return Object.keys(chapters as object).length === 0;
}

function isChallengeDone(c: any): boolean {
  return c?.isCompleted === true || c?.status === 'approved';
}

function mergeChallengeEntry(a: any, b: any): any {
  if (a == null) return b ?? null;
  if (b == null) return a;
  const doneA = isChallengeDone(a);
  const doneB = isChallengeDone(b);
  if (doneA && !doneB) return preserveEp2CandyChoice({ ...b, ...a }, a, b);
  if (doneB && !doneA) return preserveEp2CandyChoice({ ...a, ...b }, a, b);
  const merged = { ...a, ...b };
  merged.isCompleted = doneA || doneB;
  if ((doneA || doneB) && (a?.status === 'approved' || b?.status === 'approved')) {
    merged.status = 'approved';
  }
  return preserveEp2CandyChoice(merged, a, b);
}

function mergeChapterEntry(a: any, b: any): any {
  if (a == null) return b ? { ...b } : undefined;
  if (b == null) return { ...a };

  const ca = a.challenges && typeof a.challenges === 'object' ? a.challenges : {};
  const cb = b.challenges && typeof b.challenges === 'object' ? b.challenges : {};
  const ids = Array.from(new Set([...Object.keys(ca), ...Object.keys(cb)]));
  const challenges: Record<string, any> = {};
  for (const id of ids) {
    challenges[id] = mergeChallengeEntry(ca[id], cb[id]);
  }

  return {
    ...a,
    ...b,
    isActive: !!(a.isActive || b.isActive),
    isCompleted: !!(a.isCompleted || b.isCompleted),
    unlockDate: a.unlockDate ?? b.unlockDate,
    challenges
  };
}

/**
 * Symmetric merge: neither map wins by position; per-chapter and per-challenge we take
 * the superset of completion flags and fields.
 */
export function mergeChaptersProgressMaps(
  chaptersA: Record<string, any> | undefined | null,
  chaptersB: Record<string, any> | undefined | null
): Record<string, any> | undefined {
  if (isMissingOrEmptyChapters(chaptersA) && isMissingOrEmptyChapters(chaptersB)) {
    return undefined;
  }
  if (isMissingOrEmptyChapters(chaptersA)) {
    return { ...(chaptersB as object) } as Record<string, any>;
  }
  if (isMissingOrEmptyChapters(chaptersB)) {
    return { ...(chaptersA as object) } as Record<string, any>;
  }

  const keys = Array.from(
    new Set([...Object.keys(chaptersA!), ...Object.keys(chaptersB!)])
  );
  const out: Record<string, any> = {};
  for (const k of keys) {
    const merged = mergeChapterEntry(chaptersA![k], chaptersB![k]);
    if (merged != null) out[k] = merged;
  }
  return out;
}

export function countCompletedChallengesGlobally(chapters: any): number {
  if (isMissingOrEmptyChapters(chapters)) return 0;
  let n = 0;
  for (const ck of Object.keys(chapters)) {
    const ch = chapters[ck]?.challenges;
    if (!ch || typeof ch !== 'object') continue;
    for (const id of Object.keys(ch)) {
      if (isChallengeDone(ch[id])) n++;
    }
  }
  return n;
}

/**
 * Merge `users/{uid}` and `students/{uid}` for journey UI + Chapter 2 inference.
 * Squad / rival / artifacts often live only on `students`; chapters are deep-merged separately.
 */
function preferNonEmptyObject<T>(primary: T | undefined, fallback: T | undefined): T | undefined {
  if (
    primary != null &&
    typeof primary === 'object' &&
    !Array.isArray(primary) &&
    Object.keys(primary as object).length === 0
  ) {
    return fallback ?? primary;
  }
  return primary ?? fallback;
}

export function mergeUserAndStudentForJourney(
  userData?: any | null,
  studentData?: any | null
): any | null {
  if (userData == null && studentData == null) return null;
  const u = userData || {};
  const s = studentData || {};
  const uArt =
    u.artifacts && typeof u.artifacts === 'object' && !Array.isArray(u.artifacts)
      ? (u.artifacts as Record<string, unknown>)
      : {};
  const sArt =
    s.artifacts && typeof s.artifacts === 'object' && !Array.isArray(s.artifacts)
      ? (s.artifacts as Record<string, unknown>)
      : {};
  return {
    ...s,
    ...u,
    team: preferNonEmptyObject(u.team, s.team),
    squad: preferNonEmptyObject(u.squad, s.squad),
    rival: u.rival ?? s.rival,
    rivals: u.rivals ?? s.rivals,
    level: u.level ?? s.level,
    xp: u.xp ?? s.xp,
    powerPoints: u.powerPoints ?? s.powerPoints,
    artifacts: { ...sArt, ...uArt },
    chapters: mergeChaptersProgressMaps(u.chapters, s.chapters)
  };
}
