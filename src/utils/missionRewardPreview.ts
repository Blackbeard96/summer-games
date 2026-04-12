import type { BattlePassReward, BattlePassRewardChoiceGroup } from '../types/season1';
import type { MissionTemplate } from '../types/missions';
import { REWARD_TYPE_LABELS } from '../components/admin/battlePassAdminRewardUtils';
import { mergeBattleStepRewardsIntoFlat, partitionMissionRewardEntries } from './missionBattlePassRewards';

function qty(r: BattlePassReward): number {
  const q = r.quantity;
  if (q == null || !Number.isFinite(Number(q))) return 0;
  return Math.max(0, Math.floor(Number(q)));
}

/** Single-line label for hub / home mission cards. */
export function formatBattlePassRewardPreviewLine(r: BattlePassReward): string {
  const type = REWARD_TYPE_LABELS[r.rewardType];
  if (r.rewardType === 'xp' || r.rewardType === 'pp' || r.rewardType === 'truth_metal') {
    const n = qty(r);
    if (n > 0) return `${type} ×${n}`;
    if (r.displayName?.trim()) return `${type}: ${r.displayName.trim()}`;
    return type;
  }
  const ref = r.rewardRefId?.trim();
  if (ref) {
    const name = r.displayName?.trim();
    return name ? `${name} (${ref})` : `${type}: ${ref}`;
  }
  return r.displayName?.trim() || type;
}

function choiceGroupPreviewLine(g: BattlePassRewardChoiceGroup): string {
  const title = g.displayName?.trim() || 'Player choice';
  return `Pick ${g.pickCount} of ${g.options.length}: ${title}`;
}

/**
 * Lines to show under a mission on the Home hub (NPC modal). Caps length for small cards.
 */
export function getMissionRewardPreviewLines(mission: MissionTemplate, maxLines = 8): string[] {
  const { fixedFlat, choiceGroups } = partitionMissionRewardEntries(mission);
  const mergedFlat = mergeBattleStepRewardsIntoFlat(fixedFlat, mission);
  const lines: string[] = [];
  for (const r of mergedFlat) {
    lines.push(formatBattlePassRewardPreviewLine(r));
  }
  for (const g of choiceGroups) {
    lines.push(choiceGroupPreviewLine(g));
  }
  if (lines.length <= maxLines) return lines;
  const more = lines.length - maxLines + 1;
  return [...lines.slice(0, maxLines - 1), `+${more} more`];
}
