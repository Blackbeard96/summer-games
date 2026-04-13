import type { BattlePassReward, BattlePassRewardChoiceGroup, BattlePassTierRewardEntry } from '../types/season1';
import { isBattlePassChoiceGroup } from '../types/season1';
import type { MissionTemplate } from '../types/missions';
import type { ChallengeReward } from '../types/chapters';
import { grantChallengeRewards } from './challengeRewards';
import { grantMissionExtraRewards } from './missionExtraRewards';

function qty(r: BattlePassReward): number {
  const q = r.quantity;
  if (q == null || !Number.isFinite(Number(q))) return 0;
  return Math.max(0, Math.floor(Number(q)));
}

/**
 * Convert a list of flat Battle Pass-style rewards into challenge grants + move/item extras.
 */
export function battlePassRewardsToChallengeAndExtras(rewards: BattlePassReward[]): {
  challengeRewards: ChallengeReward[];
  extras: { moves: string[]; items: string[] };
} {
  let totalXp = 0;
  let totalPp = 0;
  let totalTm = 0;
  const artifacts: string[] = [];
  const abilities: string[] = [];
  const moves: string[] = [];
  const items: string[] = [];

  for (const r of rewards) {
    switch (r.rewardType) {
      case 'xp':
        totalXp += qty(r);
        break;
      case 'pp':
        totalPp += qty(r);
        break;
      case 'truth_metal':
        totalTm += qty(r);
        break;
      case 'artifact': {
        const id = r.rewardRefId?.trim();
        if (id) artifacts.push(id);
        break;
      }
      case 'ability': {
        const id = r.rewardRefId?.trim();
        if (id) abilities.push(id);
        break;
      }
      case 'skill_card': {
        const id = r.rewardRefId?.trim();
        if (id) moves.push(id);
        break;
      }
      case 'item': {
        const id = r.rewardRefId?.trim();
        if (id) {
          const n = Math.max(1, qty(r) || 1);
          for (let i = 0; i < n; i++) items.push(id);
        }
        break;
      }
      default:
        break;
    }
  }

  const challengeRewards: ChallengeReward[] = [];
  if (totalXp > 0) {
    challengeRewards.push({ type: 'xp', value: totalXp, description: `${totalXp} XP` });
  }
  if (totalPp > 0) {
    challengeRewards.push({ type: 'pp', value: totalPp, description: `${totalPp} PP` });
  }
  if (totalTm > 0) {
    challengeRewards.push({
      type: 'truthMetal',
      value: totalTm,
      description: `${totalTm} Truth Metal`,
    });
  }
  for (const aid of artifacts) {
    challengeRewards.push({ type: 'artifact', value: aid, description: `Artifact: ${aid}` });
  }
  for (const ab of abilities) {
    challengeRewards.push({ type: 'ability', value: ab, description: `Ability: ${ab}` });
  }

  return { challengeRewards, extras: { moves, items } };
}

/** Legacy flat `rewards` → synthetic flat rewards (for admin display migration). */
export function legacyMissionRewardsToEntries(
  rewards: NonNullable<MissionTemplate['rewards']> | undefined
): BattlePassReward[] {
  if (!rewards) return [];
  const ts = Date.now();
  let i = 0;
  const nextId = () => `legacy_${ts}_${i++}`;
  const out: BattlePassReward[] = [];
  if (typeof rewards.xp === 'number' && rewards.xp > 0) {
    out.push({
      id: nextId(),
      rewardType: 'xp',
      displayName: `${rewards.xp} XP`,
      description: '',
      quantity: rewards.xp,
      rarity: 'common',
    });
  }
  if (typeof rewards.pp === 'number' && rewards.pp > 0) {
    out.push({
      id: nextId(),
      rewardType: 'pp',
      displayName: `${rewards.pp} PP`,
      description: '',
      quantity: rewards.pp,
      rarity: 'common',
    });
  }
  if (typeof rewards.truthMetal === 'number' && rewards.truthMetal > 0) {
    out.push({
      id: nextId(),
      rewardType: 'truth_metal',
      displayName: `${rewards.truthMetal} Truth Metal`,
      description: '',
      quantity: rewards.truthMetal,
      rarity: 'common',
    });
  }
  for (const aid of rewards.artifactIds || []) {
    const id = String(aid || '').trim();
    if (!id) continue;
    out.push({
      id: nextId(),
      rewardType: 'artifact',
      displayName: id,
      description: '',
      rewardRefId: id,
      rarity: 'common',
    });
  }
  for (const m of rewards.moves || []) {
    const id = String(m || '').trim();
    if (!id) continue;
    out.push({
      id: nextId(),
      rewardType: 'skill_card',
      displayName: id,
      description: '',
      rewardRefId: id,
      rarity: 'common',
    });
  }
  for (const it of rewards.items || []) {
    const id = String(it || '').trim();
    if (!id) continue;
    out.push({
      id: nextId(),
      rewardType: 'item',
      displayName: id,
      description: '',
      rewardRefId: id,
      quantity: 1,
      rarity: 'common',
    });
  }
  for (const ab of rewards.abilities || []) {
    const id = String(ab || '').trim();
    if (!id) continue;
    out.push({
      id: nextId(),
      rewardType: 'ability',
      displayName: id,
      description: '',
      rewardRefId: id,
      rarity: 'common',
    });
  }
  return out;
}

/** Flat rewards from every BATTLE sequence step (`battle.rewards`), for grant paths that only read top-level `mission.rewards`. */
export function mergeBattleStepRewardsIntoFlat(
  fixedFlat: BattlePassReward[],
  mission: MissionTemplate | null | undefined
): BattlePassReward[] {
  if (!mission?.sequence?.length) return fixedFlat;
  const extra: BattlePassReward[] = [];
  for (const step of mission.sequence) {
    if (step.type !== 'BATTLE') continue;
    const br = step.battle?.rewards;
    if (!br) continue;
    extra.push(
      ...legacyMissionRewardsToEntries(br as NonNullable<MissionTemplate['rewards']>)
    );
  }
  if (extra.length === 0) return fixedFlat;
  return [...fixedFlat, ...extra];
}

export function missionUsesRewardEntries(mission: MissionTemplate | null | undefined): boolean {
  const e = mission?.rewards?.entries;
  return Array.isArray(e) && e.length > 0;
}

export function partitionMissionRewardEntries(
  mission: MissionTemplate | null | undefined
): {
  fixedFlat: BattlePassReward[];
  choiceGroups: BattlePassRewardChoiceGroup[];
} {
  const fixedFlat: BattlePassReward[] = [];
  const choiceGroups: BattlePassRewardChoiceGroup[] = [];

  if (!mission) {
    return { fixedFlat: [], choiceGroups: [] };
  }

  if (missionUsesRewardEntries(mission)) {
    for (const entry of mission!.rewards!.entries!) {
      if (isBattlePassChoiceGroup(entry)) {
        choiceGroups.push(entry);
      } else {
        fixedFlat.push(entry);
      }
    }
    return { fixedFlat, choiceGroups };
  }

  const legacy = mission?.rewards;
  if (!legacy) return { fixedFlat: [], choiceGroups: [] };
  return { fixedFlat: legacyMissionRewardsToEntries(legacy), choiceGroups: [] };
}

/**
 * Grant packed rewards (idempotent via claimId). Returns total XP granted for battle pass season sync.
 */
export async function grantPackedBattlePassMissionRewards(
  userId: string,
  claimId: string,
  rewards: BattlePassReward[],
  challengeTitle?: string
): Promise<{ xpGranted: number; grantOk: boolean }> {
  if (rewards.length === 0) {
    return { xpGranted: 0, grantOk: true };
  }
  const { challengeRewards, extras } = battlePassRewardsToChallengeAndExtras(rewards);
  let xpGranted = 0;
  let grantOk = true;

  if (challengeRewards.length > 0) {
    const res = await grantChallengeRewards(userId, claimId, challengeRewards, challengeTitle);
    if (!res.success && !res.alreadyClaimed) {
      grantOk = false;
      console.error('[grantPackedBattlePassMissionRewards] grantChallengeRewards failed:', res.error);
    } else if (res.success && !res.alreadyClaimed) {
      xpGranted = res.rewardsGranted.xp || 0;
    }
  }

  const hasExtras = extras.moves.length > 0 || extras.items.length > 0;
  if (hasExtras) {
    await grantMissionExtraRewards(userId, `${claimId}_extras`, {
      moves: extras.moves,
      items: extras.items,
    });
  }

  return { xpGranted, grantOk };
}
