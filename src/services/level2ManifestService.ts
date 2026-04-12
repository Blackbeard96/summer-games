import { doc, getDoc, serverTimestamp, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import type {
  Level2ManifestImpact,
  Level2ManifestImpactArea,
  Level2ManifestPlayerState,
  Level2ManifestResult,
  Level2ManifestSkillRecord,
  Level2ManifestTarget,
  Level2ManifestTypeCategory,
  Level2ManifestUnlockSource,
} from '../types/level2Manifest';
import { DEFAULT_LEVEL2_MANIFEST_PLAYER_STATE } from '../types/level2Manifest';
import { mergeSeason1FromStudentData } from '../utils/season1PlayerHydration';
import {
  basePpAndCooldown,
  basePpAndCooldownLevel2,
  inferLegacyLevel2ResultMagnitude,
  normalizeLevel2ManifestTarget,
} from '../data/level2ManifestSkillConfig';
import { applyLevel2PerkModifiers } from '../utils/level2ManifestModifiers';
import { buildLevel2SkillDescription } from '../utils/level2ManifestSkillCodec';
import type { Move } from '../types/battle';
const COL = 'students';

/** Firestore rejects `undefined` anywhere in the payload (merge included). */
function omitUndefinedFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function sanitizeLevel2ManifestForWrite(
  state: Level2ManifestPlayerState,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...(state as unknown as Record<string, unknown>), ...patch };
  const rawSkills = Array.isArray(merged.skills) ? merged.skills : [];
  const skills = rawSkills.map((s) =>
    omitUndefinedFields({ ...(typeof s === 'object' && s !== null ? s : {}) } as Record<string, unknown>)
  );
  return omitUndefinedFields({ ...merged, skills });
}

function normalizeSkillRecord(s: Level2ManifestSkillRecord): Level2ManifestSkillRecord {
  const target = normalizeLevel2ManifestTarget(s.target);
  const impactArea: Level2ManifestImpactArea | undefined =
    s.impactArea === 'player_skills' || s.impactArea === 'pp' || s.impactArea === 'cooldowns'
      ? s.impactArea
      : 'pp';
  const area = impactArea ?? 'pp';
  const resultMagnitude =
    typeof s.resultMagnitude === 'number' && Number.isFinite(s.resultMagnitude)
      ? s.resultMagnitude
      : inferLegacyLevel2ResultMagnitude(s.result || 'small', area);
  return { ...s, target, impactArea, resultMagnitude };
}

function coerceState(raw: unknown): Level2ManifestPlayerState {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_LEVEL2_MANIFEST_PLAYER_STATE };
  }
  const r = raw as Record<string, unknown>;
  const rawSkills = Array.isArray(r.skills) ? (r.skills as Level2ManifestSkillRecord[]) : [];
  const skills = rawSkills.map((x) => normalizeSkillRecord(x));
  return {
    hasEnteredMetaFlowOnce: r.hasEnteredMetaFlowOnce === true,
    builderUnlocked: r.builderUnlocked === true,
    pendingUnlockCelebration: r.pendingUnlockCelebration === true,
    skills,
    activeSkillId: typeof r.activeSkillId === 'string' ? r.activeSkillId : null,
    lastSkillUseAt:
      r.lastSkillUseAt && typeof r.lastSkillUseAt === 'object'
        ? (r.lastSkillUseAt as Record<string, number>)
        : undefined,
  };
}

/** Read + one-time migration from season1.flowState.awakenedFlow */
export async function getLevel2ManifestState(userId: string): Promise<Level2ManifestPlayerState> {
  const ref = doc(db, COL, userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { ...DEFAULT_LEVEL2_MANIFEST_PLAYER_STATE };
  }
  const data = snap.data() as Record<string, unknown>;
  let state = coerceState(data.level2Manifest);

  const season1 = mergeSeason1FromStudentData(data.season1 as Record<string, unknown> | undefined);
  const legacyFlow = season1.flowState?.awakenedFlow === true;
  if (legacyFlow && !state.builderUnlocked) {
    state = {
      ...state,
      hasEnteredMetaFlowOnce: true,
      builderUnlocked: true,
    };
    await setDoc(
      ref,
      {
        level2Manifest: sanitizeLevel2ManifestForWrite(state, { updatedAt: serverTimestamp() }),
      },
      { merge: true }
    );
  }

  return state;
}

export async function unlockLevel2BuilderFromLiveFlow(userId: string): Promise<Level2ManifestPlayerState> {
  const ref = doc(db, COL, userId);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? coerceState((snap.data() as Record<string, unknown>).level2Manifest) : { ...DEFAULT_LEVEL2_MANIFEST_PLAYER_STATE };
  if (prev.builderUnlocked) {
    return prev;
  }
  const next: Level2ManifestPlayerState = {
    ...prev,
    hasEnteredMetaFlowOnce: true,
    builderUnlocked: true,
    pendingUnlockCelebration: true,
  };
  await setDoc(
    ref,
    {
      level2Manifest: sanitizeLevel2ManifestForWrite(next, { updatedAt: serverTimestamp() }),
    },
    { merge: true }
  );
  return next;
}

export async function grantMissionAutoUnlock(userId: string): Promise<void> {
  const ref = doc(db, COL, userId);
  await setDoc(
    ref,
    {
      level2Manifest: {
        builderUnlocked: true,
        updatedAt: serverTimestamp(),
      },
    },
    { merge: true }
  );
}

export async function consumeUnlockCelebrationFlag(userId: string): Promise<void> {
  await updateDoc(doc(db, COL, userId), {
    'level2Manifest.pendingUnlockCelebration': false,
  });
}

export interface SaveLevel2SkillDraft {
  skillName: string;
  manifestId: string;
  manifestType: Level2ManifestTypeCategory;
  target: Level2ManifestTarget;
  impact: Level2ManifestImpact;
  impactArea: Level2ManifestImpactArea;
  /** PP amount or turn count from level-scaled builder options. */
  resultMagnitude: number;
  /** Legacy enum; new saves use `small` while magnitude carries the effect scale. */
  result: Level2ManifestResult;
  unlockSource: Level2ManifestUnlockSource;
  missionStepId?: string;
  unlockedSkillNodeIds: string[];
}

export async function saveLevel2ManifestSkill(userId: string, draft: SaveLevel2SkillDraft): Promise<Level2ManifestSkillRecord> {
  const base =
    typeof draft.resultMagnitude === 'number' && Number.isFinite(draft.resultMagnitude)
      ? basePpAndCooldownLevel2(draft.impact, draft.impactArea, draft.resultMagnitude)
      : basePpAndCooldown(draft.impact, draft.result);
  const mod = applyLevel2PerkModifiers({
    basePp: base.pp,
    baseCooldown: base.cooldown,
    unlockedSkillNodeIds: draft.unlockedSkillNodeIds,
  });
  const id = `l2_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const description = buildLevel2SkillDescription({
    skillName: draft.skillName.trim(),
    manifestType: draft.manifestType,
    target: draft.target,
    impact: draft.impact,
    impactArea: draft.impactArea,
    result: draft.result,
    resultMagnitude: draft.resultMagnitude,
  });
  // Firestore forbids FieldValue.serverTimestamp() inside array elements (skills[]).
  const skillTimestamps = Timestamp.now();
  const record: Level2ManifestSkillRecord = {
    id,
    playerId: userId,
    manifestId: draft.manifestId,
    unlockSource: draft.unlockSource,
    liveEventOnly: true,
    skillName: draft.skillName.trim(),
    manifestType: draft.manifestType,
    target: draft.target,
    impact: draft.impact,
    impactArea: draft.impactArea,
    resultMagnitude: draft.resultMagnitude,
    result: draft.result,
    description,
    ppCost: mod.ppCost,
    cooldownTurns: mod.cooldownTurns,
    perkModifierNotes: mod.perkModifierNotes,
    createdAt: skillTimestamps,
    updatedAt: skillTimestamps,
    missionStepId: draft.missionStepId,
  };

  const ref = doc(db, COL, userId);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? coerceState((snap.data() as Record<string, unknown>).level2Manifest) : { ...DEFAULT_LEVEL2_MANIFEST_PLAYER_STATE };
  const skills = [...prev.skills.filter((s) => s.id !== id), record];

  await setDoc(
    ref,
    {
      level2Manifest: sanitizeLevel2ManifestForWrite(prev, {
        skills,
        activeSkillId: id,
        updatedAt: serverTimestamp(),
      }),
    },
    { merge: true }
  );

  return record;
}

export async function setActiveLevel2Skill(userId: string, skillId: string | null): Promise<void> {
  await setDoc(
    doc(db, COL, userId),
    { level2Manifest: { activeSkillId: skillId, updatedAt: serverTimestamp() } },
    { merge: true }
  );
}

/** Active Level 2 custom skill as a manifest Move (Live Events), or null if none saved. */
export async function getActiveLevel2ManifestMove(userId: string): Promise<Move | null> {
  try {
    const l2 = await getLevel2ManifestState(userId);
    const sk = l2.skills?.find((s) => s.id === l2.activeSkillId);
    if (!sk) return null;
    return level2SkillToMove(sk, sk.manifestId);
  } catch {
    return null;
  }
}

export function level2SkillToMove(skill: Level2ManifestSkillRecord, manifestType?: string): Move {
  const mapType = (): Move['type'] => {
    switch (skill.manifestType) {
      case 'offensive':
        return 'attack';
      case 'defensive':
        return 'defense';
      case 'utility':
        return 'utility';
      case 'enhance':
        return 'support';
      default:
        return 'utility';
    }
  };
  const mt = (manifestType || skill.manifestId) as Move['manifestType'];
  const liveLine = buildLevel2SkillDescription({
    skillName: skill.skillName,
    manifestType: skill.manifestType,
    target: skill.target,
    impact: skill.impact,
    impactArea: skill.impactArea ?? 'pp',
    result: skill.result,
    resultMagnitude: skill.resultMagnitude,
  });
  return {
    id: `l2-manifest::${skill.id}`,
    name: `${skill.skillName} · L2 Meta`,
    description: `${liveLine}\n\n🛰️ Live Event only · Level 2 Manifest`,
    category: 'manifest',
    type: mapType(),
    manifestType: mt,
    level: 2,
    cost: skill.ppCost,
    cooldown: skill.cooldownTurns,
    currentCooldown: 0,
    unlocked: true,
    masteryLevel: 1,
    targetType: 'single',
    effectKey: 'level2_manifest',
    useSessionPowerPoints: true,
  };
}
