import { getMoveNameSync } from './moveOverrides';
import { emitSkillActivation, type SkillActivationSide } from './skillActivationQueue';
import type { SkillArtInput } from './skillArtworkDefaults';

type AnnounceSkill = SkillArtInput & { name?: string | null };

export interface AnnounceSkillActivationParams {
  skill: AnnounceSkill | null | undefined;
  actorName: string | null | undefined;
  actorUid?: string | null;
  side?: SkillActivationSide;
  targetName?: string | null;
  /** Explicit id from the confirmed action; defaults to a per-call unique id. */
  id?: string;
  /** CPU/NPC move names are shown as-is (admin renames apply to player skills only). */
  rawName?: boolean;
  details?: string[];
}

let seq = 0;

/** Visual-only announcement of a confirmed skill activation. Never throws. */
export const announceSkillActivation = (params: AnnounceSkillActivationParams): void => {
  try {
    const skill = params.skill;
    const name = (skill?.name || '').trim();
    if (!skill || !name) return;
    seq += 1;
    emitSkillActivation({
      id: params.id || `local:${Date.now()}:${seq}`,
      skill: {
        id: skill.id ?? null,
        name,
        category: skill.category ?? null,
        elementalAffinity: skill.elementalAffinity ?? null,
        manifestType: skill.manifestType ?? null,
        imageUrl: skill.imageUrl ?? null,
      },
      skillDisplayName: params.rawName ? name : getMoveNameSync(name) || name,
      actorName: (params.actorName || '').trim() || 'Unknown',
      actorUid: params.actorUid ?? null,
      side: params.side,
      targetName: params.targetName ?? null,
      ...(params.details?.length ? { details: params.details.slice(0, 3) } : {}),
    });
  } catch (error) {
    console.warn('[skillActivation] announce failed', error);
  }
};
