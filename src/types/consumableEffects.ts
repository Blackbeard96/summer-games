/**
 * Configurable consumable effects for MST MKT / marketplace items (admin-defined).
 * Phase 1: restore_health, restore_shields. Extended: revive_eliminated_self (Live Event only).
 */

export type ConsumableEffectTargetScope = 'self' | 'ally' | 'team';

/** Effect kinds the resolver implements today (expand over time). */
export const CONSUMABLE_EFFECT_TYPES = [
  'restore_health',
  'restore_shields',
  'revive_eliminated_self',
] as const;

export type ConsumableEffectType = (typeof CONSUMABLE_EFFECT_TYPES)[number];

export function isConsumableEffectType(v: string): v is ConsumableEffectType {
  return (CONSUMABLE_EFFECT_TYPES as readonly string[]).includes(v);
}

export interface ConsumableEffect {
  effectType: ConsumableEffectType;
  amount: number;
  targetScope?: ConsumableEffectTargetScope;
  durationTurns?: number | null;
  metadata?: Record<string, unknown>;
}

export type MarketplaceItemType = 'consumable' | 'equippable_grant' | 'currency' | 'unlock' | 'other';

export interface LiveEventMktListing {
  enabled: boolean;
  /** Participation PP price while host has MST MKT open */
  pricePp: number;
}

export function consumableEffectLabel(effectType: string): string {
  switch (effectType) {
    case 'restore_health':
      return 'Restore Health';
    case 'restore_shields':
      return 'Restore Shields';
    case 'revive_eliminated_self':
      return 'Revive (self, Live Event)';
    default:
      return effectType;
  }
}

export function previewConsumableEffectSentence(effect: ConsumableEffect): string {
  switch (effect.effectType) {
    case 'restore_health':
      return `Restores up to ${effect.amount} Health (clamped to max).`;
    case 'restore_shields':
      return `Restores up to ${effect.amount} Shields (clamped to max).`;
    case 'revive_eliminated_self':
      return `When eliminated, returns you at ${effect.amount}% max HP (shields reset). You can buy early; effect applies once eliminated.`;
    default:
      return 'Custom effect';
  }
}

export type ConsumableEffectParseResult =
  | { ok: true; value: ConsumableEffect }
  | { ok: false; error: string };

/**
 * Parse and validate Firestore / admin payload.
 * revive_eliminated_self: `amount` is percent of max HP (1–100), default 50 if invalid.
 */
export function parseConsumableEffect(raw: unknown): ConsumableEffectParseResult {
  if (raw === null || raw === undefined) {
    return { ok: false, error: 'Consumable effect is missing' };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Consumable effect must be an object' };
  }
  const o = raw as Record<string, unknown>;
  const effectType = typeof o.effectType === 'string' ? o.effectType.trim() : '';
  if (!isConsumableEffectType(effectType)) {
    return { ok: false, error: `Unsupported effect type: ${effectType || '(empty)'}` };
  }

  const amountNum = Number(o.amount);
  if (effectType === 'revive_eliminated_self') {
    const pct = Number.isFinite(amountNum) && amountNum > 0 ? Math.min(100, Math.floor(amountNum)) : 50;
    const scope =
      o.targetScope === 'ally' || o.targetScope === 'team' || o.targetScope === 'self' ? o.targetScope : 'self';
    return {
      ok: true,
      value: {
        effectType,
        amount: pct,
        targetScope: scope,
        durationTurns: o.durationTurns === null || o.durationTurns === undefined ? undefined : Number(o.durationTurns),
        metadata: typeof o.metadata === 'object' && o.metadata !== null && !Array.isArray(o.metadata) ? (o.metadata as Record<string, unknown>) : undefined,
      },
    };
  }

  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return { ok: false, error: 'Effect amount must be a positive number' };
  }

  const scope =
    o.targetScope === 'ally' || o.targetScope === 'team' || o.targetScope === 'self' ? o.targetScope : 'self';

  return {
    ok: true,
    value: {
      effectType,
      amount: Math.floor(amountNum),
      targetScope: scope,
      durationTurns: o.durationTurns === null || o.durationTurns === undefined ? undefined : Number(o.durationTurns),
      metadata: typeof o.metadata === 'object' && o.metadata !== null && !Array.isArray(o.metadata) ? (o.metadata as Record<string, unknown>) : undefined,
    },
  };
}

export function validateConsumableItemRow(params: {
  itemType?: MarketplaceItemType | string;
  consumableEffect?: unknown;
  equippableArtifactId?: string;
}): { ok: true } | { ok: false; error: string } {
  const { itemType, consumableEffect, equippableArtifactId } = params;
  if (itemType === 'consumable') {
    const p = parseConsumableEffect(consumableEffect);
    if (!p.ok) return p;
    return { ok: true };
  }
  if (consumableEffect != null && typeof consumableEffect === 'object') {
    const keys = Object.keys(consumableEffect as object);
    if (keys.length > 0 && itemType !== 'consumable') {
      return { ok: false, error: 'consumableEffect is only valid when Item Type is Consumable' };
    }
  }
  if (equippableArtifactId && itemType === 'consumable' && consumableEffect) {
    // Hybrid: allowed (e.g. bundle) — admin explicitly set both
  }
  return { ok: true };
}
