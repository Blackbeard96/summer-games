import { FieldValue } from 'firebase/firestore';

/**
 * Firestore rejects `undefined` anywhere in update/set payloads. Remove keys whose value is
 * undefined (deep), while preserving FieldValue sentinels (deleteField, serverTimestamp, etc.).
 */
export function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof FieldValue) return value;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item) => item !== undefined);
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const next = stripUndefinedDeep(v);
    if (next === undefined) continue;
    out[k] = next;
  }
  return out;
}
