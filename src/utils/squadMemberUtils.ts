/**
 * Squad member objects in Firestore may use `uid` or legacy `userId`.
 * Squad docs also store `memberUids` for rules — prefer that for membership checks.
 */

export function squadMemberUid(member: any): string | undefined {
  const id = member?.uid ?? member?.userId;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/** True if `uid` is in this squad (memberUids array and/or members list). */
export function isUidInSquad(squad: any, uid: string | undefined | null): boolean {
  if (!uid) return false;
  if (Array.isArray(squad?.memberUids) && squad.memberUids.includes(uid)) {
    return true;
  }
  const members = squad?.members || [];
  return members.some((m: any) => squadMemberUid(m) === uid);
}
