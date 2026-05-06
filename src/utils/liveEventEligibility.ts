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
