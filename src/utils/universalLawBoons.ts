import { db } from '../firebase';
import { doc, getDoc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  getBoonNodeById,
  UNIVERSAL_LAW_BOON_NODES,
  type UniversalLawBoonNode,
  type UniversalLawEffectType,
  type UniversalLawId,
} from '../data/universalLawTrees';
import type { PlayerSkillState } from '../types/skillSystem';
import { MAX_EQUIPPED_SKILLS } from '../constants/loadout';

export interface PlayerUniversalLawProgress {
  unlockedNodeIds: string[];
  unlockedByLaw: Record<UniversalLawId, string[]>;
  lastUnlockedAt?: unknown;
  totalSpentPP: number;
  totalSpentTruthMetalShards: number;
}

export interface UniversalLawCurrencySnapshot {
  powerPoints: number;
  truthMetalShards: number;
}

export interface UniversalLawEligibility {
  canUnlock: boolean;
  reason?: string;
  missingPrerequisites: string[];
  insufficientPP: boolean;
  insufficientTruthMetal: boolean;
}

export interface UniversalLawBoonEffects {
  maxLoadoutSlotsBonus: number;
  artifactPerkMultiplierBonusFraction: number;
  artifactSkillCooldownReductionFraction: number;
  manifestSkillBonusFraction: number;
  elementalSkillBonusFraction: number;
  rrCandySkillBonusFraction: number;
  battleRewardPpMultiplierBonusFraction: number;
  critChanceBonusFraction: number;
  critDamageBonusFraction: number;
  comboDamageBonusFraction: number;
  shieldOnComboRestore: number;
  firstSkillDamageBonusFraction: number;
  cooldownReductionGlobalFraction: number;
  everyNthSkillBonus: { everyN: number; bonusFraction: number } | null;
  rareDropChanceBonusFraction: number;
  comboAltSourceBonusFraction: number;
  unlockedSpecificSkillIds: string[];
}

const EMPTY_BY_LAW: Record<UniversalLawId, string[]> = {
  divine_oneness: [],
  vibration: [],
  attraction: [],
  rhythm: [],
};

const EMPTY_EFFECTS: UniversalLawBoonEffects = {
  maxLoadoutSlotsBonus: 0,
  artifactPerkMultiplierBonusFraction: 0,
  artifactSkillCooldownReductionFraction: 0,
  manifestSkillBonusFraction: 0,
  elementalSkillBonusFraction: 0,
  rrCandySkillBonusFraction: 0,
  battleRewardPpMultiplierBonusFraction: 0,
  critChanceBonusFraction: 0,
  critDamageBonusFraction: 0,
  comboDamageBonusFraction: 0,
  shieldOnComboRestore: 0,
  firstSkillDamageBonusFraction: 0,
  cooldownReductionGlobalFraction: 0,
  everyNthSkillBonus: null,
  rareDropChanceBonusFraction: 0,
  comboAltSourceBonusFraction: 0,
  unlockedSpecificSkillIds: [],
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function asNumber(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function defaultProgressFromUnlocked(unlockedNodeIds: string[]): PlayerUniversalLawProgress {
  const unlockedByLaw: Record<UniversalLawId, string[]> = {
    divine_oneness: [],
    vibration: [],
    attraction: [],
    rhythm: [],
  };
  for (const id of unlockedNodeIds) {
    const node = getBoonNodeById(id);
    if (node) unlockedByLaw[node.law].push(id);
  }
  return {
    unlockedNodeIds,
    unlockedByLaw,
    totalSpentPP: 0,
    totalSpentTruthMetalShards: 0,
  };
}

export function sanitizeUniversalLawProgress(raw: unknown): PlayerUniversalLawProgress {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const unlocked = Array.isArray(obj.unlockedNodeIds)
    ? obj.unlockedNodeIds.filter((x): x is string => typeof x === 'string')
    : [];
  const byLawRaw =
    obj.unlockedByLaw && typeof obj.unlockedByLaw === 'object'
      ? (obj.unlockedByLaw as Record<string, unknown>)
      : {};
  const unlockedByLaw: Record<UniversalLawId, string[]> = {
    divine_oneness: Array.isArray(byLawRaw.divine_oneness)
      ? (byLawRaw.divine_oneness as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    vibration: Array.isArray(byLawRaw.vibration)
      ? (byLawRaw.vibration as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    attraction: Array.isArray(byLawRaw.attraction)
      ? (byLawRaw.attraction as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
    rhythm: Array.isArray(byLawRaw.rhythm)
      ? (byLawRaw.rhythm as unknown[]).filter((x): x is string => typeof x === 'string')
      : [],
  };
  return {
    unlockedNodeIds: unlocked,
    unlockedByLaw,
    lastUnlockedAt: obj.lastUnlockedAt,
    totalSpentPP: Math.max(0, Math.floor(asNumber(obj.totalSpentPP, 0))),
    totalSpentTruthMetalShards: Math.max(0, Math.floor(asNumber(obj.totalSpentTruthMetalShards, 0))),
  };
}

function computeUnlockedByLaw(unlockedNodeIds: string[]): Record<UniversalLawId, string[]> {
  const next = {
    divine_oneness: [] as string[],
    vibration: [] as string[],
    attraction: [] as string[],
    rhythm: [] as string[],
  };
  for (const id of unlockedNodeIds) {
    const node = getBoonNodeById(id);
    if (node) next[node.law].push(id);
  }
  return next;
}

export function resolveUniversalLawEffects(unlockedNodeIds: string[]): UniversalLawBoonEffects {
  const out: UniversalLawBoonEffects = { ...EMPTY_EFFECTS, unlockedSpecificSkillIds: [] };
  const apply = (node: UniversalLawBoonNode) => {
    const p = node.effectPayload || {};
    const effect = node.effectType as UniversalLawEffectType;
    switch (effect) {
      case 'max_loadout_slots_bonus':
        out.maxLoadoutSlotsBonus += Math.max(0, Math.floor(asNumber(p.bonusSlots, 0)));
        break;
      case 'artifact_perk_multiplier':
        out.artifactPerkMultiplierBonusFraction += clamp01(asNumber(p.multiplierBonus, 0));
        break;
      case 'artifact_skill_cooldown_reduction':
        out.artifactSkillCooldownReductionFraction += clamp01(asNumber(p.reductionFraction, 0));
        break;
      case 'manifest_skill_bonus':
        out.manifestSkillBonusFraction += clamp01(asNumber(p.bonusFraction, 0));
        out.elementalSkillBonusFraction += clamp01(asNumber(p.alsoElementalBonusFraction, 0));
        break;
      case 'elemental_skill_bonus':
        out.elementalSkillBonusFraction += clamp01(asNumber(p.bonusFraction, 0));
        break;
      case 'rr_candy_skill_bonus':
        out.rrCandySkillBonusFraction += clamp01(asNumber(p.bonusFraction, 0));
        break;
      case 'battle_reward_pp_multiplier':
        out.battleRewardPpMultiplierBonusFraction += clamp01(asNumber(p.multiplierBonus, 0));
        break;
      case 'crit_chance_bonus':
        out.critChanceBonusFraction += clamp01(asNumber(p.chanceBonus, 0));
        out.critDamageBonusFraction += clamp01(asNumber(p.critDamageBonus, 0));
        break;
      case 'crit_damage_bonus':
        out.critDamageBonusFraction += clamp01(asNumber(p.bonusFraction, 0));
        break;
      case 'combo_damage_bonus':
        out.comboDamageBonusFraction += clamp01(asNumber(p.bonusFraction, 0));
        break;
      case 'shield_on_combo_restore':
        out.shieldOnComboRestore += Math.max(0, Math.floor(asNumber(p.shieldRestore, 0)));
        break;
      case 'first_skill_damage_bonus':
        out.firstSkillDamageBonusFraction += clamp01(asNumber(p.bonusFraction, 0));
        break;
      case 'cooldown_reduction_global':
        out.cooldownReductionGlobalFraction += clamp01(asNumber(p.reductionFraction, 0));
        break;
      case 'every_nth_skill_bonus': {
        const everyN = Math.max(2, Math.floor(asNumber(p.everyN, 3)));
        const bonusFraction = clamp01(asNumber(p.bonusFraction, 0));
        if (!out.everyNthSkillBonus || bonusFraction > out.everyNthSkillBonus.bonusFraction) {
          out.everyNthSkillBonus = { everyN, bonusFraction };
        }
        break;
      }
      case 'rare_drop_chance_bonus':
        out.rareDropChanceBonusFraction += clamp01(asNumber(p.bonusFraction, 0));
        break;
      case 'combo_alt_source_bonus':
        out.comboAltSourceBonusFraction += clamp01(asNumber(p.bonusFraction, 0));
        break;
      case 'unlock_specific_skill': {
        const ids = Array.isArray(p.skillIds) ? p.skillIds : [];
        for (const id of ids) {
          if (typeof id === 'string' && id.trim()) out.unlockedSpecificSkillIds.push(id.trim());
        }
        break;
      }
      default:
        break;
    }
  };

  for (const id of unlockedNodeIds) {
    const node = getBoonNodeById(id);
    if (node?.isActive) apply(node);
  }
  out.unlockedSpecificSkillIds = Array.from(new Set(out.unlockedSpecificSkillIds));
  out.artifactPerkMultiplierBonusFraction = clamp01(out.artifactPerkMultiplierBonusFraction);
  out.artifactSkillCooldownReductionFraction = clamp01(out.artifactSkillCooldownReductionFraction);
  out.manifestSkillBonusFraction = clamp01(out.manifestSkillBonusFraction);
  out.elementalSkillBonusFraction = clamp01(out.elementalSkillBonusFraction);
  out.rrCandySkillBonusFraction = clamp01(out.rrCandySkillBonusFraction);
  out.battleRewardPpMultiplierBonusFraction = clamp01(out.battleRewardPpMultiplierBonusFraction);
  out.cooldownReductionGlobalFraction = clamp01(out.cooldownReductionGlobalFraction);
  out.comboDamageBonusFraction = clamp01(out.comboDamageBonusFraction);
  out.firstSkillDamageBonusFraction = clamp01(out.firstSkillDamageBonusFraction);
  out.comboAltSourceBonusFraction = clamp01(out.comboAltSourceBonusFraction);
  out.critChanceBonusFraction = clamp01(out.critChanceBonusFraction);
  out.critDamageBonusFraction = clamp01(out.critDamageBonusFraction);
  return out;
}

export function computeNodeEligibility(
  node: UniversalLawBoonNode,
  progress: PlayerUniversalLawProgress,
  currency: UniversalLawCurrencySnapshot
): UniversalLawEligibility {
  if (!node.isActive) {
    return {
      canUnlock: false,
      reason: 'Node is inactive',
      missingPrerequisites: [],
      insufficientPP: false,
      insufficientTruthMetal: false,
    };
  }
  if (progress.unlockedNodeIds.includes(node.id)) {
    return {
      canUnlock: false,
      reason: 'Already unlocked',
      missingPrerequisites: [],
      insufficientPP: false,
      insufficientTruthMetal: false,
    };
  }
  const missingPrerequisites = node.prerequisites.filter(
    (id) => !progress.unlockedNodeIds.includes(id)
  );
  const insufficientPP = currency.powerPoints < node.costPP;
  const insufficientTruthMetal = currency.truthMetalShards < node.costTruthMetalShards;
  const canUnlock =
    missingPrerequisites.length === 0 && !insufficientPP && !insufficientTruthMetal;
  let reason: string | undefined;
  if (!canUnlock) {
    if (missingPrerequisites.length > 0) reason = 'Missing prerequisite nodes';
    else if (insufficientPP && insufficientTruthMetal) reason = 'Need more PP and Truth Metal';
    else if (insufficientPP) reason = 'Not enough PP';
    else if (insufficientTruthMetal) reason = 'Not enough Truth Metal';
  }
  return {
    canUnlock,
    reason,
    missingPrerequisites,
    insufficientPP,
    insufficientTruthMetal,
  };
}

export function getMaxLoadoutSlotsFromEffects(effects: UniversalLawBoonEffects): number {
  return Math.max(MAX_EQUIPPED_SKILLS, MAX_EQUIPPED_SKILLS + effects.maxLoadoutSlotsBonus);
}

export async function getPlayerUniversalLawProgress(
  userId: string
): Promise<PlayerUniversalLawProgress> {
  const skillStateRef = doc(db, 'players', userId, 'skill_state', 'main');
  const snap = await getDoc(skillStateRef);
  if (!snap.exists()) return defaultProgressFromUnlocked([]);
  const state = snap.data() as PlayerSkillState & {
    universalLawProgress?: PlayerUniversalLawProgress;
  };
  const explicit = state.universalLawProgress;
  if (explicit) {
    const clean = sanitizeUniversalLawProgress(explicit);
    if (clean.unlockedNodeIds.length > 0) return clean;
  }
  const learned = Array.isArray(state.learnedNodeIds)
    ? state.learnedNodeIds.filter((x): x is string => typeof x === 'string')
    : [];
  return defaultProgressFromUnlocked(learned);
}

export async function getPlayerUniversalLawEffects(userId: string): Promise<UniversalLawBoonEffects> {
  const progress = await getPlayerUniversalLawProgress(userId);
  return resolveUniversalLawEffects(progress.unlockedNodeIds);
}

export async function unlockUniversalLawBoonNode(
  userId: string,
  nodeId: string
): Promise<{ ok: boolean; reason?: string; progress?: PlayerUniversalLawProgress }> {
  const node = getBoonNodeById(nodeId);
  if (!node) return { ok: false, reason: 'Node not found' };

  const studentRef = doc(db, 'students', userId);
  const usersRef = doc(db, 'users', userId);
  const vaultRef = doc(db, 'vaults', userId);
  const skillStateRef = doc(db, 'players', userId, 'skill_state', 'main');

  try {
    return await runTransaction(db, async (tx) => {
      const [studentSnap, usersSnap, vaultSnap, skillSnap] = await Promise.all([
        tx.get(studentRef),
        tx.get(usersRef),
        tx.get(vaultRef),
        tx.get(skillStateRef),
      ]);
      const studentsData = studentSnap.exists() ? studentSnap.data() : {};
      const usersData = usersSnap.exists() ? usersSnap.data() : {};
      const skillData = skillSnap.exists() ? (skillSnap.data() as PlayerSkillState & {
        universalLawProgress?: PlayerUniversalLawProgress;
      }) : null;

      const progress = skillData?.universalLawProgress
        ? sanitizeUniversalLawProgress(skillData.universalLawProgress)
        : defaultProgressFromUnlocked(
            Array.isArray(skillData?.learnedNodeIds)
              ? (skillData?.learnedNodeIds as string[])
              : []
          );
      const currency: UniversalLawCurrencySnapshot = {
        powerPoints: Math.floor(
          Math.max(
            0,
            asNumber(studentsData.powerPoints, asNumber(vaultSnap.data()?.currentPP, 0))
          )
        ),
        truthMetalShards: Math.floor(
          Math.max(
            0,
            asNumber(studentsData.truthMetal, asNumber(usersData.truthMetal, 0))
          )
        ),
      };

      const eligibility = computeNodeEligibility(node, progress, currency);
      if (!eligibility.canUnlock) return { ok: false, reason: eligibility.reason || 'Not eligible' };

      const nextUnlockedNodeIds = Array.from(new Set([...progress.unlockedNodeIds, node.id]));
      const nextProgress: PlayerUniversalLawProgress = {
        unlockedNodeIds: nextUnlockedNodeIds,
        unlockedByLaw: computeUnlockedByLaw(nextUnlockedNodeIds),
        lastUnlockedAt: serverTimestamp(),
        totalSpentPP: progress.totalSpentPP + node.costPP,
        totalSpentTruthMetalShards:
          progress.totalSpentTruthMetalShards + node.costTruthMetalShards,
      };

      const nextPP = Math.max(0, currency.powerPoints - node.costPP);
      const nextTM = Math.max(0, currency.truthMetalShards - node.costTruthMetalShards);

      tx.set(
        skillStateRef,
        {
          learnedNodeIds: nextUnlockedNodeIds,
          universalLawProgress: nextProgress,
          version: 'v2',
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(
        studentRef,
        {
          powerPoints: nextPP,
          truthMetal: nextTM,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(
        usersRef,
        {
          powerPoints: nextPP,
          truthMetal: nextTM,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      if (vaultSnap.exists()) {
        tx.set(vaultRef, { currentPP: nextPP, updatedAt: serverTimestamp() }, { merge: true });
      }
      return { ok: true, progress: nextProgress };
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unlock transaction failed';
    return { ok: false, reason };
  }
}

export async function ensureUniversalLawProgressInitialized(userId: string): Promise<void> {
  const skillStateRef = doc(db, 'players', userId, 'skill_state', 'main');
  const state = await getDoc(skillStateRef);
  if (!state.exists()) {
    await setDoc(
      skillStateRef,
      {
        unlockedNodeIds: [],
        equippedSkillIds: [],
        skillUpgrades: {},
        learnedNodeIds: [],
        universalLawProgress: {
          unlockedNodeIds: [],
          unlockedByLaw: EMPTY_BY_LAW,
          totalSpentPP: 0,
          totalSpentTruthMetalShards: 0,
        },
        version: 'v2',
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );
    return;
  }
  const current = state.data() as Record<string, unknown>;
  if (!current.universalLawProgress) {
    const learned = Array.isArray(current.learnedNodeIds)
      ? (current.learnedNodeIds as string[]).filter((x) => typeof x === 'string')
      : [];
    const progress = defaultProgressFromUnlocked(learned);
    await setDoc(
      skillStateRef,
      {
        learnedNodeIds: progress.unlockedNodeIds,
        universalLawProgress: progress,
        version: 'v2',
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );
  }
}

export function getAllUniversalLawNodes(): UniversalLawBoonNode[] {
  return [...UNIVERSAL_LAW_BOON_NODES];
}

/**
 * Human-readable lines for battle / arena UI (Skill Mastery, Battle Arena strip).
 * Omits zeros; artifact perk strength stacks with equipped artifact perks in combat math.
 */
export function formatUniversalLawBoonBattleSummary(
  effects: UniversalLawBoonEffects | null | undefined
): string[] {
  if (!effects) return [];
  const lines: string[] = [];
  const pct = (f: number) => Math.round(Math.max(0, f) * 100);
  if (effects.artifactPerkMultiplierBonusFraction > 0) {
    lines.push(
      `+${pct(effects.artifactPerkMultiplierBonusFraction)}% stronger artifact perks (Damage/Manifest/Elemental boosts, shields, healing regen, Cost Reduction skill bonus, PP Economy, Status Defense, Live Event PP discount, freeze chance)`
    );
  }
  if (effects.maxLoadoutSlotsBonus > 0) {
    lines.push(`+${effects.maxLoadoutSlotsBonus} skill loadout slot(s) from Universal Laws`);
  }
  if (effects.manifestSkillBonusFraction > 0) {
    lines.push(`+${pct(effects.manifestSkillBonusFraction)}% Manifest skill power (Universal Law)`);
  }
  if (effects.elementalSkillBonusFraction > 0) {
    lines.push(`+${pct(effects.elementalSkillBonusFraction)}% Elemental skill power (Universal Law)`);
  }
  if (effects.rrCandySkillBonusFraction > 0) {
    lines.push(`+${pct(effects.rrCandySkillBonusFraction)}% RR Candy / Cost Reduction damage effectiveness (Universal Law)`);
  }
  if (effects.artifactSkillCooldownReductionFraction > 0) {
    lines.push(
      `−${pct(effects.artifactSkillCooldownReductionFraction)}% cooldown on artifact-granted skills (Universal Law)`
    );
  }
  if (effects.cooldownReductionGlobalFraction > 0) {
    lines.push(`−${pct(effects.cooldownReductionGlobalFraction)}% global skill cooldowns (Universal Law)`);
  }
  if (effects.battleRewardPpMultiplierBonusFraction > 0) {
    lines.push(`+${pct(effects.battleRewardPpMultiplierBonusFraction)}% PP rewards from battles (Universal Law)`);
  }
  if (effects.critChanceBonusFraction > 0 || effects.critDamageBonusFraction > 0) {
    const parts: string[] = [];
    if (effects.critChanceBonusFraction > 0) parts.push(`+${pct(effects.critChanceBonusFraction)}% crit chance`);
    if (effects.critDamageBonusFraction > 0) parts.push(`+${pct(effects.critDamageBonusFraction)}% crit damage`);
    lines.push(`${parts.join(', ')} (Universal Law)`);
  }
  if (effects.comboDamageBonusFraction > 0) {
    lines.push(`+${pct(effects.comboDamageBonusFraction)}% combo damage (Universal Law)`);
  }
  if (effects.shieldOnComboRestore > 0) {
    lines.push(`+${effects.shieldOnComboRestore} shield on combo milestones (Universal Law)`);
  }
  if (effects.firstSkillDamageBonusFraction > 0) {
    lines.push(`+${pct(effects.firstSkillDamageBonusFraction)}% first skill each battle (Universal Law)`);
  }
  if (effects.everyNthSkillBonus) {
    const { everyN, bonusFraction } = effects.everyNthSkillBonus;
    lines.push(`Every ${everyN}th skill: +${pct(bonusFraction)}% damage (Universal Law)`);
  }
  if (effects.rareDropChanceBonusFraction > 0) {
    lines.push(`+${pct(effects.rareDropChanceBonusFraction)}% rare drop chance (Universal Law)`);
  }
  if (effects.comboAltSourceBonusFraction > 0) {
    lines.push(`+${pct(effects.comboAltSourceBonusFraction)}% combo from alt sources (Universal Law)`);
  }
  return lines;
}
