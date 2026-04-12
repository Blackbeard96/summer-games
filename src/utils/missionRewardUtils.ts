import { ChallengeReward } from '../types/chapters';
import { MissionTemplate } from '../types/missions';
import {
  battlePassRewardsToChallengeAndExtras,
  mergeBattleStepRewardsIntoFlat,
  partitionMissionRewardEntries,
} from './missionBattlePassRewards';

/**
 * Maps mission template rewards (Battle Pass entries and/or legacy fields) to ChallengeReward[]
 * for grantChallengeRewards. Moves/items are handled via grantMissionExtraRewards.
 */
export function buildMissionChallengeRewardsFromTemplate(
  mission: MissionTemplate | null | undefined
): ChallengeReward[] {
  if (!mission) return [];
  const { fixedFlat } = partitionMissionRewardEntries(mission);
  const merged = mergeBattleStepRewardsIntoFlat(fixedFlat, mission);
  return battlePassRewardsToChallengeAndExtras(merged).challengeRewards;
}
