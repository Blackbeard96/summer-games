/**
 * Elemental skill access — gated by Chapter 1-8 Elemental Ring reward.
 * Do not use getElementalRingLevel() for access checks (it defaults to 1 for damage math).
 */

export function hasElementalMoveAccess(
  studentData: Record<string, unknown> | null | undefined
): boolean {
  if (!studentData || typeof studentData !== 'object') return false;
  const artifacts = studentData.artifacts as Record<string, unknown> | undefined;
  return artifacts?.elemental_ring_level_1 === true;
}
