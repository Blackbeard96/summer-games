/**
 * Truth Metal for HUD: matches Profile / Artifacts (primary field on `students`),
 * falling back to `users` when students has no balance.
 */
export function truthMetalBalanceForHud(
  studentTruthMetal: unknown,
  userTruthMetal: unknown
): number {
  const s = Math.max(0, Math.floor(Number(studentTruthMetal) || 0));
  const u = Math.max(0, Math.floor(Number(userTruthMetal) || 0));
  if (s > 0) return s;
  return u;
}

/** Total shards across both docs (for spend checks when balance may be split). */
export function truthMetalTotalAcrossDocs(studentTruthMetal: unknown, userTruthMetal: unknown): number {
  const s = Math.max(0, Math.floor(Number(studentTruthMetal) || 0));
  const u = Math.max(0, Math.floor(Number(userTruthMetal) || 0));
  return s + u;
}
