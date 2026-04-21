import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../firebase';
import type { BattlePassReward } from '../types/season1';
import { grantPackedBattlePassMissionRewards } from './missionBattlePassRewards';

function safeId(s: string): string {
  return String(s || '').replace(/\//g, '_').replace(/\s+/g, '_');
}

/** Firestore-safe idempotency key for `users/{uid}/rewardClaims/{claimId}` + `season1.battlePass.claimedRewardIds`. */
export function deployedBattlePassFlatClaimKey(seasonId: string, tierNumber: number, rewardId: string): string {
  return `deployedBp_${safeId(seasonId)}_${tierNumber}_${safeId(rewardId)}`;
}

export function deployedBattlePassChoiceClaimKey(
  seasonId: string,
  tierNumber: number,
  groupId: string,
  optionRewardId: string
): string {
  return `deployedBp_${safeId(seasonId)}_${tierNumber}_g${safeId(groupId)}_r${safeId(optionRewardId)}`;
}

/** How many rewards were claimed from this choice group (prefix match on claim ids). */
export function countDeployedBattlePassClaimsInChoiceGroup(
  claimedRewardIds: readonly string[],
  seasonId: string,
  tierNumber: number,
  groupId: string
): number {
  const prefix = `deployedBp_${safeId(seasonId)}_${tierNumber}_g${safeId(groupId)}_`;
  return claimedRewardIds.filter((k) => String(k).startsWith(prefix)).length;
}

function qty(r: BattlePassReward): number {
  const q = r.quantity;
  if (q == null || !Number.isFinite(Number(q))) return 0;
  return Math.max(0, Math.floor(Number(q)));
}

function validateRewardForGrant(r: BattlePassReward): string | null {
  switch (r.rewardType) {
    case 'xp':
    case 'pp':
    case 'truth_metal':
      if (qty(r) <= 0) return 'This reward has no quantity configured. Ask an admin to fix the tier.';
      return null;
    case 'artifact':
    case 'skill_card':
    case 'item':
    case 'ability':
      if (!r.rewardRefId?.trim()) return 'This reward is missing a reference ID. Ask an admin to fix the tier.';
      return null;
    default:
      return 'Unsupported reward type.';
  }
}

export type ClaimDeployedBattlePassRewardResult =
  | { ok: true; alreadyClaimed: boolean }
  | { ok: false; error: string };

/**
 * Grants one admin-configured battle pass reward and records it on `season1.battlePass.claimedRewardIds`.
 * Granting uses the same idempotent path as mission BP rewards (`grantPackedBattlePassMissionRewards`).
 */
export async function claimDeployedBattlePassReward(params: {
  userId: string;
  seasonId: string;
  tierNumber: number;
  playerTier: number;
  reward: BattlePassReward;
  claimId: string;
  /** Current `season1.battlePass.claimedRewardIds` from the client (for pick-one choice groups). */
  claimedRewardIds: string[];
  /** When set, caps how many distinct options in the group may be claimed (from admin `pickCount`). */
  choiceGroupId?: string;
  choiceGroupPickCount?: number;
}): Promise<ClaimDeployedBattlePassRewardResult> {
  const { userId, seasonId, tierNumber, playerTier, reward, claimId, claimedRewardIds, choiceGroupId, choiceGroupPickCount } =
    params;
  if (!userId || !seasonId || !claimId) return { ok: false, error: 'Missing player or season.' };
  if (tierNumber > playerTier) return { ok: false, error: 'Reach this tier on the battle pass before claiming.' };

  if (choiceGroupId && (choiceGroupPickCount ?? 0) > 0) {
    const n = countDeployedBattlePassClaimsInChoiceGroup(claimedRewardIds, seasonId, tierNumber, choiceGroupId);
    if (n >= (choiceGroupPickCount as number) && !claimedRewardIds.includes(claimId)) {
      return {
        ok: false,
        error: 'You already claimed the maximum number of rewards from this choice group.',
      };
    }
  }

  const bad = validateRewardForGrant(reward);
  if (bad) return { ok: false, error: bad };

  const { grantOk, alreadyClaimed } = await grantPackedBattlePassMissionRewards(
    userId,
    claimId,
    [reward],
    `Battle Pass tier ${tierNumber}`
  );

  if (!grantOk) {
    return { ok: false, error: 'Could not grant reward. Try again or contact support if this persists.' };
  }

  const studentRef = doc(db, 'students', userId);
  try {
    await updateDoc(studentRef, {
      'season1.battlePass.claimedRewardIds': arrayUnion(claimId),
    });
  } catch (e) {
    console.error('[deployedBattlePassClaim] Failed to record claimedRewardIds', e);
    return {
      ok: false,
      error: 'Reward was granted but we could not update your battle pass record. Refresh the page.',
    };
  }

  return { ok: true, alreadyClaimed: !!alreadyClaimed };
}
