/**
 * Live Event Skill Card sync: a small capped list of confirmed activations written in the same
 * transaction as the authoritative move (display only — never read by battle logic).
 */

export const SKILL_ACTIVATION_HISTORY_CAP = 8;

export interface SkillActivationRecord {
  id: string;
  actorUid: string;
  actorName: string;
  moveId: string | null;
  moveName: string;
  category: string | null;
  elementalAffinity: string | null;
  manifestType: string | null;
  targetName: string | null;
  at: number;
}

interface RecordSource {
  actorUid: string;
  actorName: string;
  targetUid?: string | null;
  targetName?: string | null;
  move: {
    id?: string | null;
    name?: string | null;
    category?: string | null;
    elementalAffinity?: string | null;
    manifestType?: string | null;
  };
  now?: number;
}

export const buildSkillActivationRecord = (src: RecordSource): SkillActivationRecord => {
  const at = src.now ?? Date.now();
  return {
    id: `sa_${at.toString(36)}_${src.actorUid.slice(0, 8)}_${Math.random().toString(36).slice(2, 8)}`,
    actorUid: src.actorUid,
    actorName: String(src.actorName || 'Player').slice(0, 60),
    moveId: src.move.id ?? null,
    moveName: String(src.move.name || 'Skill').slice(0, 80),
    category: src.move.category ?? null,
    elementalAffinity: src.move.elementalAffinity ?? null,
    manifestType: src.move.manifestType ?? null,
    targetName: src.targetUid && src.targetUid === src.actorUid ? null : (src.targetName ?? null),
    at,
  };
};

const isRecord = (r: unknown): r is SkillActivationRecord =>
  !!r && typeof r === 'object' && typeof (r as SkillActivationRecord).id === 'string' && typeof (r as SkillActivationRecord).moveName === 'string';

export const appendSkillActivationRecord = (
  prev: unknown,
  record: SkillActivationRecord,
  cap = SKILL_ACTIVATION_HISTORY_CAP
): SkillActivationRecord[] => {
  const list = Array.isArray(prev) ? prev.filter(isRecord) : [];
  return [...list, record].slice(-cap);
};

/** Records not yet seen, oldest first. Callers seed `seen` from the first snapshot so history never replays. */
export const takeUnseenSkillActivations = (records: unknown, seen: Set<string>): SkillActivationRecord[] => {
  if (!Array.isArray(records)) return [];
  const fresh = records.filter(isRecord).filter((r) => !seen.has(r.id));
  fresh.forEach((r) => seen.add(r.id));
  return fresh.sort((a, b) => a.at - b.at);
};
