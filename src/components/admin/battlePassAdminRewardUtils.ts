import type { BattlePassReward } from '../../types/season1';
import { SKILL_CARDS_CATALOG, getSkillCardById } from '../../data/skillCardsCatalog';
import type { ArtifactOption } from '../../utils/artifactCompensation';

export const REWARD_TYPE_OPTIONS: BattlePassReward['rewardType'][] = [
  'xp',
  'pp',
  'truth_metal',
  'artifact',
  'item',
  'skill_card',
  'ability',
];

export const REWARD_TYPE_LABELS: Record<BattlePassReward['rewardType'], string> = {
  xp: 'XP',
  pp: 'Power Points (PP)',
  truth_metal: 'Truth Metal',
  artifact: 'Artifact',
  item: 'Item (generic)',
  skill_card: 'Skill / action card (move ID)',
  ability: 'Ability unlock ID',
};

export const RARITY_OPTIONS: NonNullable<BattlePassReward['rarity']>[] = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

export const CUSTOM_ARTIFACT_REF = '__custom__';
export const CUSTOM_SKILL_CARD_REF = '__custom__';

export function findArtifactOptionByRefId(
  options: ArtifactOption[],
  refId: string | undefined | null
): ArtifactOption | undefined {
  const t = refId?.trim();
  if (!t) return undefined;
  const norm = (s: string) => s.replace(/[-_\s]/g, '').toLowerCase();
  return options.find((o) => o.id === t) || options.find((o) => norm(o.id) === norm(t));
}

export function artifactRefSelectValue(
  options: ArtifactOption[],
  refId: string | undefined | null,
  forceCustom: boolean
): string {
  if (forceCustom) return CUSTOM_ARTIFACT_REF;
  const t = refId?.trim();
  if (!t) return '';
  const found = findArtifactOptionByRefId(options, refId);
  return found ? found.id : CUSTOM_ARTIFACT_REF;
}

export function skillCardRefSelectValue(refId: string | undefined | null, forceCustom: boolean): string {
  if (forceCustom) return CUSTOM_SKILL_CARD_REF;
  const t = refId?.trim();
  if (!t) return '';
  const found = getSkillCardById(t);
  return found ? found.id : CUSTOM_SKILL_CARD_REF;
}

export function rewardRefPlaceholder(r: BattlePassReward): string {
  switch (r.rewardType) {
    case 'skill_card':
      return SKILL_CARDS_CATALOG[0]?.id ? `e.g. ${SKILL_CARDS_CATALOG[0].id}` : 'action card id';
    case 'artifact':
      return 'artifact id (match Artifacts / player inventory keys)';
    case 'item':
      return 'inventory or item key';
    case 'ability':
      return 'e.g. manifest_move_l2';
    case 'truth_metal':
      return 'optional — use quantity for Truth Metal amount';
    case 'xp':
    case 'pp':
    default:
      return 'optional unless grant logic requires it';
  }
}
