import type { Vault } from '../types/battle';

/**
 * Parse Firestore Timestamp / ISO string / millis into a valid Date.
 * `new Date(timestampObject)` is Invalid Date → NaN timers in UI.
 */
export function parseFirestoreDate(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }
  if (typeof raw === 'object' && raw !== null) {
    const o = raw as Record<string, unknown>;
    if (typeof o.toDate === 'function') {
      try {
        const d = (o.toDate as () => Date)();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
      } catch {
        return null;
      }
    }
    if (typeof o.seconds === 'number') {
      const nanos = typeof o.nanoseconds === 'number' ? o.nanoseconds : 0;
      const d = new Date(o.seconds * 1000 + nanos / 1e6);
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  if (typeof raw === 'string' || typeof raw === 'number') {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Cooldown ends 4 hours after the stored start instant. */
export function vaultHealthCooldownEnd(start: Date): Date {
  return new Date(start.getTime() + 4 * 60 * 60 * 1000);
}

/**
 * Current shield must never exceed max (generator / legacy writes could drift).
 */
export function normalizeVaultShieldFields(v: Vault): Vault {
  const cap = Math.max(0, Math.floor(Number(v.maxShieldStrength) || 0));
  const raw = Math.max(0, Math.floor(Number(v.shieldStrength) || 0));
  const sh = cap > 0 ? Math.min(raw, cap) : raw;
  if (sh === raw) return v;
  return { ...v, shieldStrength: sh };
}
