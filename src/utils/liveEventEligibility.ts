export type LiveEventType = 'live_event' | 'universal_event';

export interface LiveEventEligibilityShape {
  classId?: string | null;
  classIds?: string[] | null;
  inviteAllClasses?: boolean | null;
  eventType?: LiveEventType | string | null;
}

export interface NormalizedLiveEventEligibility {
  eventType: LiveEventType;
  classId: string | null;
  classIds: string[];
  inviteAllClasses: boolean;
}

export function normalizeLiveEventEligibility(
  event: LiveEventEligibilityShape
): NormalizedLiveEventEligibility {
  const classId = typeof event.classId === 'string' && event.classId.trim() ? event.classId.trim() : null;
  const rawClassIds = Array.isArray(event.classIds) ? event.classIds : [];
  const classIds = Array.from(
    new Set(
      rawClassIds
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter((id) => id.length > 0)
    )
  );
  if (classId && !classIds.includes(classId)) {
    classIds.unshift(classId);
  }

  const inviteAllClasses = event.inviteAllClasses === true;
  const normalizedType: LiveEventType =
    event.eventType === 'universal_event' ? 'universal_event' : 'live_event';

  return {
    eventType: normalizedType,
    classId,
    classIds,
    inviteAllClasses,
  };
}

/**
 * Class a player represents in a Live Event: the invited class they are enrolled in (room's primary
 * class first). `students.classId` is a legacy field that is often missing or stale, so it is only a fallback.
 */
export function resolvePlayerClassIdForLiveEvent(
  userClassIds: string[],
  event: LiveEventEligibilityShape,
  legacyClassId?: string | null
): string | null {
  const normalized = normalizeLiveEventEligibility(event);
  const enrolled = (Array.isArray(userClassIds) ? userClassIds : [])
    .map((id) => (typeof id === 'string' ? id.trim() : ''))
    .filter((id) => id.length > 0);
  const enrolledSet = new Set(enrolled);
  if (normalized.classId && enrolledSet.has(normalized.classId)) return normalized.classId;
  const invited = normalized.classIds.find((id) => enrolledSet.has(id));
  if (invited) return invited;
  const legacy = typeof legacyClassId === 'string' ? legacyClassId.trim() : '';
  if (legacy && enrolledSet.has(legacy)) return legacy;
  return enrolled[0] || legacy || null;
}

export function canUserJoinLiveEvent(userClassIds: string[], event: LiveEventEligibilityShape): boolean {
  const normalized = normalizeLiveEventEligibility(event);
  if (normalized.inviteAllClasses) return true;
  if (!Array.isArray(userClassIds) || userClassIds.length === 0) return false;

  const userClassSet = new Set(
    userClassIds
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter((id) => id.length > 0)
  );

  if (normalized.classId && userClassSet.has(normalized.classId)) return true;
  return normalized.classIds.some((id) => userClassSet.has(id));
}

export function buildLiveEventTargeting({
  eventType,
  selectedClassId,
  selectedClassIds,
  inviteAllClasses,
}: {
  eventType: LiveEventType;
  selectedClassId?: string | null;
  selectedClassIds?: string[];
  inviteAllClasses?: boolean;
}): {
  eventType: LiveEventType;
  classId: string | null;
  classIds: string[];
  inviteAllClasses: boolean;
} {
  if (eventType === 'universal_event') {
    const classIds = Array.from(
      new Set((selectedClassIds || []).map((id) => id.trim()).filter((id) => id.length > 0))
    );
    return {
      eventType: 'universal_event',
      classId: null,
      classIds,
      inviteAllClasses: inviteAllClasses === true,
    };
  }

  const classId = (selectedClassId || '').trim();
  return {
    eventType: 'live_event',
    classId: classId || null,
    classIds: classId ? [classId] : [],
    inviteAllClasses: false,
  };
}
