/**
 * Safe Element display helpers for players who have not chosen an Element yet.
 * New accounts start with no Element; existing players keep their affinity.
 */

import { ALL_ELEMENT_TYPES, normalizeElementType, type ElementType } from '../types/elementTypes';

/** Elements selectable during Chapter 1 / Artifacts onboarding (combat-relevant set). */
export const SELECTABLE_ONBOARDING_ELEMENTS: ElementType[] = [
  'fire',
  'water',
  'earth',
  'air',
];

export const ELEMENT_UNAWAKENED_LABEL = 'Unawakened';
export const ELEMENT_NOT_YET_CHOSEN_LABEL = 'Not Yet Chosen';

/** True when the player has a real combat Element stored. */
export function hasElementSelected(
  raw: string | null | undefined
): raw is string {
  const normalized = normalizeElementType(raw);
  if (normalized) return true;
  // Accept legacy display names (Fire, Water, …) that normalizeElementType already handles
  if (raw == null) return false;
  const s = String(raw).trim().toLowerCase();
  if (!s || s === 'none' || s === 'unawakened' || s === 'not yet chosen') {
    return false;
  }
  return ALL_ELEMENT_TYPES.includes(s as ElementType);
}

/**
 * Extract raw Element from profile-like sources without inventing a default.
 * Returns null when no Element has been chosen.
 */
export function extractElementOrNull(
  userData?: any,
  studentData?: any
): string | null {
  const candidates = [
    studentData?.artifacts?.chosen_element,
    userData?.artifacts?.chosen_element,
    userData?.elementalAffinity,
    studentData?.elementalAffinity,
  ];

  for (const c of candidates) {
    if (hasElementSelected(c)) {
      return String(c).toLowerCase();
    }
  }

  // manifestationType / style are legacy dual-use fields — only treat as Element
  // when they match a known Element type (not a Manifest name like "Creating").
  for (const c of [userData?.manifestationType, studentData?.manifestationType, userData?.style, studentData?.style]) {
    if (normalizeElementType(c)) {
      return String(c).toLowerCase();
    }
  }

  return null;
}

/** Display label for Element fields in Profile, Power Card, battle HUD, nav. */
export function formatElementDisplayLabel(
  raw: string | null | undefined,
  options?: { emptyLabel?: string }
): string {
  if (!hasElementSelected(raw)) {
    return options?.emptyLabel ?? ELEMENT_UNAWAKENED_LABEL;
  }
  const s = String(raw).trim();
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Soft color for Element badges; gray when unawakened. */
export function getElementDisplayColor(raw: string | null | undefined): string {
  if (!hasElementSelected(raw)) return '#6b7280';
  const key = String(raw).toLowerCase();
  const colors: Record<string, string> = {
    fire: '#EF4444',
    water: '#3B82F6',
    earth: '#10B981',
    air: '#F59E0B',
    lightning: '#EAB308',
    metal: '#64748B',
    light: '#FDE68A',
    dark: '#4B5563',
    shadow: '#4B5563',
  };
  return colors[key] || '#6b7280';
}

export function isValidSelectableElement(raw: string | null | undefined): boolean {
  const n = normalizeElementType(raw);
  return n != null && SELECTABLE_ONBOARDING_ELEMENTS.includes(n);
}
