import type { Move } from '../../types/battle';
import type { SkillEffectPayload } from '../../types/skillEffects';

/**
 * Maps legacy Move fields into standardized effects when explicit `skillEffects` is absent.
 * Used for previews and optional unified pipelines. The battle resolver still applies legacy
 * `healing` / `shieldBoost` / damage paths directly — do not stack the same numeric heal twice.
 */
export function legacyMoveToSkillEffects(move: Move): SkillEffectPayload[] {
  if (move.skillEffects?.length) return [];

  const out: SkillEffectPayload[] = [];

  if (move.healing && move.healing > 0) {
    out.push({
      type: 'heal',
      value: move.healing,
      chance: 100,
      targetScope: move.targetType === 'self' ? 'self' : 'single',
    });
  }
  if (move.shieldBoost && move.shieldBoost > 0) {
    out.push({
      type: 'shield',
      value: move.shieldBoost,
      duration: move.duration ?? 2,
      chance: 100,
      targetScope: move.targetType === 'self' ? 'self' : 'single',
      stackable: true,
    });
  }
  const dt = move.debuffType;
  if (dt === 'silence') {
    out.push({
      type: 'silence',
      duration: move.duration ?? 1,
      chance: 100,
      targetScope: 'enemy',
    });
  }
  if (dt === 'root' || dt === 'move_lock') {
    out.push({
      type: 'root',
      duration: move.duration ?? 1,
      chance: 100,
      targetScope: 'enemy',
    });
  }
  if (dt === 'confuse' || dt === 'confusion') {
    out.push({
      type: 'confuse',
      duration: move.duration ?? 2,
      chance: 100,
      targetScope: 'enemy',
    });
  }

  return out;
}
