import { SKILL_EFFECT_REGISTRY } from '../../data/skillEffectRegistry';
import { SKILL_EFFECT_TYPES, type SkillEffectPayload, type SkillEffectType } from '../../types/skillEffects';

const DEV =
  (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'development') ||
  false;

function devWarn(msg: string, detail?: unknown): void {
  if (DEV && typeof console !== 'undefined') {
    console.warn(`[skillEffectEngine] ${msg}`, detail ?? '');
  }
}

export interface ValidatedSkillEffect extends SkillEffectPayload {
  type: SkillEffectType;
}

/** Coerce unknown JSON into a safe payload; never throws. */
export function validateSkillEffectPayload(raw: unknown): ValidatedSkillEffect | null {
  if (!raw || typeof raw !== 'object') {
    devWarn('Invalid effect: not an object', raw);
    return null;
  }
  const o = raw as Record<string, unknown>;
  const typeStr = typeof o.type === 'string' ? o.type : '';
  if (!SKILL_EFFECT_TYPES.includes(typeStr as SkillEffectType)) {
    devWarn('Unknown skill effect type', typeStr);
    return null;
  }
  const type = typeStr as SkillEffectType;
  const reg = SKILL_EFFECT_REGISTRY[type];
  const d = reg.defaults;

  const value = typeof o.value === 'number' && Number.isFinite(o.value) ? o.value : d.value ?? 0;
  const secondaryValue =
    typeof o.secondaryValue === 'number' && Number.isFinite(o.secondaryValue)
      ? o.secondaryValue
      : d.secondaryValue ?? undefined;
  const duration =
    o.duration === null || o.duration === undefined
      ? d.duration ?? null
      : typeof o.duration === 'number' && Number.isFinite(o.duration)
        ? Math.max(0, Math.floor(o.duration))
        : d.duration ?? null;
  const chance =
    typeof o.chance === 'number' && Number.isFinite(o.chance)
      ? Math.min(100, Math.max(0, o.chance))
      : d.chance ?? 100;
  const targetScope =
    typeof o.targetScope === 'string' && o.targetScope.length > 0
      ? (o.targetScope as SkillEffectPayload['targetScope'])
      : d.targetScope;
  const stackable = typeof o.stackable === 'boolean' ? o.stackable : d.stackable ?? false;
  const maxStacks =
    typeof o.maxStacks === 'number' && Number.isFinite(o.maxStacks)
      ? Math.max(1, Math.floor(o.maxStacks))
      : d.maxStacks ?? 1;
  const elementTag =
    o.elementTag === null || o.elementTag === undefined
      ? d.elementTag ?? null
      : String(o.elementTag);
  let metadata: Record<string, unknown> | undefined;
  if (o.metadata && typeof o.metadata === 'object' && !Array.isArray(o.metadata)) {
    metadata = { ...(d.metadata as Record<string, unknown>), ...(o.metadata as Record<string, unknown>) };
  } else if (d.metadata && typeof d.metadata === 'object') {
    metadata = { ...(d.metadata as Record<string, unknown>) };
  }

  return {
    type,
    value,
    secondaryValue,
    duration,
    chance,
    targetScope,
    stackable,
    maxStacks,
    elementTag,
    metadata,
  };
}

export function validateSkillEffectPayloadList(raw: unknown): ValidatedSkillEffect[] {
  if (!Array.isArray(raw)) return [];
  const out: ValidatedSkillEffect[] = [];
  for (const item of raw) {
    const v = validateSkillEffectPayload(item);
    if (v) out.push(v);
  }
  return out;
}
