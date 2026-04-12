/**
 * Canonical combat element types for advantage chart (8 elements).
 * Stored on enemies as `enemyType`; skills use `Move.elementalAffinity` (includes legacy `shadow`).
 */

export type ElementType =
  | 'water'
  | 'fire'
  | 'earth'
  | 'air'
  | 'lightning'
  | 'metal'
  | 'light'
  | 'dark';

export const ALL_ELEMENT_TYPES: ElementType[] = [
  'water',
  'fire',
  'earth',
  'air',
  'lightning',
  'metal',
  'light',
  'dark',
];

/** Raw affinity strings that may appear on moves or summon data */
export type ElementAffinityRaw =
  | ElementType
  | 'shadow';

export function normalizeElementType(raw: string | null | undefined): ElementType | null {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const s = String(raw).toLowerCase().trim();
  if (s === 'shadow') return 'dark';
  const allowed: ElementType[] = [
    'water',
    'fire',
    'earth',
    'air',
    'lightning',
    'metal',
    'light',
    'dark',
  ];
  return (allowed as string[]).includes(s) ? (s as ElementType) : null;
}
