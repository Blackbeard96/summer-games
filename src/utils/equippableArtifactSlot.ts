const LEGACY_RING_SLOTS = new Set(['ring1', 'ring2', 'ring3', 'ring4']);

export type NonRingEquippableSlot = 'head' | 'chest' | 'legs' | 'shoes' | 'jacket' | 'weapon';
export type EquippableCatalogSlot = NonRingEquippableSlot | 'ring';

const NON_RING: readonly NonRingEquippableSlot[] = ['head', 'chest', 'legs', 'shoes', 'jacket', 'weapon'];

/** True for canonical `ring` or legacy `ring1`–`ring4` catalog values. */
export function isRingCatalogSlot(slot: string | undefined | null): boolean {
  if (!slot || typeof slot !== 'string') return false;
  return slot === 'ring' || LEGACY_RING_SLOTS.has(slot);
}

/**
 * Single ring type for equippable definitions: any legacy ring slot becomes `ring`.
 * Unknown non-ring strings default to `ring` (matches previous default of ring1).
 */
export function normalizeEquippableCatalogSlot(raw: unknown): EquippableCatalogSlot {
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (isRingCatalogSlot(s)) return 'ring';
  if ((NON_RING as readonly string[]).includes(s)) return s as NonRingEquippableSlot;
  return 'ring';
}

export function formatEquippableCatalogSlotLabel(slot: string | undefined | null): string {
  if (isRingCatalogSlot(slot)) return 'Ring';
  const s = typeof slot === 'string' ? slot : '';
  if ((NON_RING as readonly string[]).includes(s)) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return s || '—';
}
