import {
  extractElementOrNull,
  formatElementDisplayLabel,
  hasElementSelected,
  isValidSelectableElement,
  ELEMENT_UNAWAKENED_LABEL,
} from '../elementDisplay';
import {
  filterMovesForStoryBattle,
  TRUTH_METAL_BATTLE_RESTRICTIONS,
} from '../storyBattleRestrictions';
import {
  filterMissionsForAdmin,
  isMissionPublished,
  missionXpReward,
} from '../missionAdminHelpers';
import {
  isChallengeProgressCompleted,
  formatMissionCompletionDate,
} from '../journeyMissionProgress';
import { hasElementalMoveAccess } from '../elementalAccess';
import { validateMissionPreviewImage } from '../missionStorage';
import type { MissionTemplate } from '../../types/missions';

describe('elementDisplay — new accounts without Element', () => {
  it('treats null/empty as no Element selected', () => {
    expect(hasElementSelected(null)).toBe(false);
    expect(hasElementSelected(undefined)).toBe(false);
    expect(hasElementSelected('')).toBe(false);
    expect(hasElementSelected('Unawakened')).toBe(false);
  });

  it('does not invent Fire when profiles lack Element', () => {
    expect(extractElementOrNull({}, {})).toBeNull();
    expect(extractElementOrNull({ manifestationType: 'Creating' }, {})).toBeNull();
  });

  it('preserves existing Element affinities', () => {
    expect(extractElementOrNull({}, { elementalAffinity: 'water' })).toBe('water');
    expect(
      extractElementOrNull({}, { artifacts: { chosen_element: 'earth' } })
    ).toBe('earth');
    expect(hasElementSelected('Fire')).toBe(true);
  });

  it('renders Unawakened safely for empty Element', () => {
    expect(formatElementDisplayLabel(null)).toBe(ELEMENT_UNAWAKENED_LABEL);
    expect(formatElementDisplayLabel('')).toBe(ELEMENT_UNAWAKENED_LABEL);
    expect(formatElementDisplayLabel('fire')).toBe('Fire');
  });

  it('rejects invalid Element values for selection', () => {
    expect(isValidSelectableElement('plasma')).toBe(false);
    expect(isValidSelectableElement('fire')).toBe(true);
    expect(isValidSelectableElement('lightning')).toBe(false); // not in onboarding set
  });
});

describe('storyBattleRestrictions — first Truth Metal fight', () => {
  const moves = [
    { id: '1', name: 'Tool Strike', category: 'manifest', level: 1, unlocked: true, damage: 15 },
    { id: '2', name: 'Ember Jab', category: 'elemental', level: 1, unlocked: true, damage: 8, elementalAffinity: 'fire' },
    { id: '3', name: 'Construct Shield', category: 'manifest', level: 1, unlocked: true, damage: 0 },
    { id: '4', name: 'Wildfire', category: 'elemental', level: 3, unlocked: true, damage: 12 },
  ];

  it('shows Manifest moves only (no elemental)', () => {
    const filtered = filterMovesForStoryBattle(moves, TRUTH_METAL_BATTLE_RESTRICTIONS);
    expect(filtered.every((m) => m.category === 'manifest')).toBe(true);
    expect(filtered.some((m) => m.name === 'Ember Jab')).toBe(false);
  });

  it('prefers damaging Manifest moves so the fight is winnable', () => {
    const filtered = filterMovesForStoryBattle(moves, TRUTH_METAL_BATTLE_RESTRICTIONS);
    expect(filtered.some((m) => (m.damage ?? 0) > 0)).toBe(true);
    expect(filtered.map((m) => m.name)).toContain('Tool Strike');
  });

  it('allows player with no Element to enter with Manifest loadout', () => {
    const noElementMoves = moves.filter((m) => m.category === 'manifest');
    const filtered = filterMovesForStoryBattle(noElementMoves, TRUTH_METAL_BATTLE_RESTRICTIONS);
    expect(filtered.length).toBeGreaterThan(0);
  });
});

describe('missionAdminHelpers', () => {
  const missions: MissionTemplate[] = [
    {
      id: 'j1',
      title: 'Journey A',
      description: 'd',
      missionCategory: 'STORY',
      deliveryChannels: ['PLAYER_JOURNEY'],
      isPublished: true,
      xpReward: 10,
      chapterNumber: 1,
      missionNumber: 1,
    },
    {
      id: 's1',
      title: 'Side A',
      description: 'd',
      missionCategory: 'SIDE',
      deliveryChannels: ['HUB_NPC'],
      isPublished: false,
    },
    {
      id: 'j2',
      title: 'Journey Draft',
      description: 'd',
      missionCategory: 'STORY',
      deliveryChannels: ['PLAYER_JOURNEY'],
      isPublished: false,
    },
    {
      id: 'd1',
      title: 'Demo Battle Showcase',
      description: 'Show what MST battles feel like',
      missionCategory: 'DEMO',
      deliveryChannels: ['HUB_NPC'],
      isPublished: true,
    },
  ];

  it('filters Player Journey vs Side vs Demo vs drafts/published', () => {
    expect(filterMissionsForAdmin(missions, 'journey').map((m) => m.id)).toEqual(['j1', 'j2']);
    expect(filterMissionsForAdmin(missions, 'side').map((m) => m.id)).toEqual(['s1']);
    expect(filterMissionsForAdmin(missions, 'demo').map((m) => m.id)).toEqual(['d1']);
    expect(filterMissionsForAdmin(missions, 'drafts').map((m) => m.id)).toEqual(['s1', 'j2']);
    expect(filterMissionsForAdmin(missions, 'published').map((m) => m.id)).toEqual(['j1', 'd1']);
  });

  it('treats missing isPublished as published (legacy)', () => {
    expect(isMissionPublished({ isPublished: undefined })).toBe(true);
    expect(isMissionPublished({ isPublished: false })).toBe(false);
  });

  it('reads xp reward from journey fields', () => {
    expect(missionXpReward(missions[0])).toBe(10);
  });

  it('includes hardcoded CHAPTERS challenges in Player Journey merge', () => {
    const {
      mergeJourneyMissionsForAdmin,
      isHardcodedJourneyMissionId,
    } = require('../missionAdminHelpers') as typeof import('../missionAdminHelpers');
    const merged = mergeJourneyMissionsForAdmin(missions);
    expect(merged.some((m) => m.title === 'Get Letter')).toBe(true);
    expect(merged.some((m) => m.title === 'The Truth Metal Choice')).toBe(true);
    expect(merged.some((m) => m.title === 'The Next Level' || m.id === 'j1')).toBe(true);
    expect(merged.filter((m) => isHardcodedJourneyMissionId(m.id)).length).toBeGreaterThan(5);
  });

  it('surfaces bundled Chapter 2 preview images on core Journey rows', () => {
    const { mergeJourneyMissionsForAdmin } = require('../missionAdminHelpers') as typeof import('../missionAdminHelpers');
    const merged = mergeJourneyMissionsForAdmin([]);
    const squadUp = merged.find((m) => m.title === 'Squad Up');
    expect(squadUp?.previewImageUrl).toContain('Ch2-3_Preview_SquadUp');
    const findHome = merged.find((m) => m.title === 'Find a Home');
    expect(findHome?.previewImageUrl).toContain('Ch2-2_Preview_Home');
  });
});

describe('journeyMissionProgress — completion display', () => {
  it('detects completed progress consistently', () => {
    expect(isChallengeProgressCompleted({ isCompleted: true })).toBe(true);
    expect(isChallengeProgressCompleted({ status: 'approved' })).toBe(true);
    expect(isChallengeProgressCompleted({ isCompleted: false })).toBe(false);
    expect(isChallengeProgressCompleted(null)).toBe(false);
  });

  it('formats completion dates', () => {
    expect(formatMissionCompletionDate(new Date('2026-07-13T12:00:00Z'))).toMatch(/7\/13\/2026|13\/7\/2026/);
    expect(formatMissionCompletionDate(null)).toBeNull();
  });
});

describe('mission preview image validation', () => {
  it('rejects non-image files', () => {
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    expect(validateMissionPreviewImage(file)).toMatch(/Invalid file type/);
  });

  it('accepts png under size limit', () => {
    const file = new File([new Uint8Array(10)], 'preview.png', { type: 'image/png' });
    expect(validateMissionPreviewImage(file)).toBeNull();
  });
});

describe('element selection plan — idempotent L1 unlock', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const {
    planElementalMoveUnlocks,
    wouldCreateDuplicateElementalUnlocks,
  } = require('../elementSelectionPlan') as typeof import('../elementSelectionPlan');

  const moves = [
    { id: 'e1', name: 'Ember Jab', category: 'elemental' as const, elementalAffinity: 'fire', level: 1, unlocked: false },
    { id: 'e2', name: 'Ripple', category: 'elemental' as const, elementalAffinity: 'water', level: 1, unlocked: false },
    { id: 'm1', name: 'Tool Strike', category: 'manifest' as const, level: 1, unlocked: true },
  ];

  it('grants only the chosen Element L1 move', () => {
    const plan = planElementalMoveUnlocks(moves as any, 'fire');
    expect(plan.valid).toBe(true);
    expect(plan.unlockIds).toEqual(['e1']);
  });

  it('rejects invalid Element', () => {
    expect(planElementalMoveUnlocks(moves as any, 'banana').valid).toBe(false);
  });

  it('does not create duplicate unlocks on retry', () => {
    expect(wouldCreateDuplicateElementalUnlocks(moves as any, 'fire')).toBe(false);
  });
});

describe('elementalAccess — Chapter 1-8 Elemental Ring gate', () => {
  it('denies elemental skills without elemental_ring_level_1', () => {
    expect(hasElementalMoveAccess(null)).toBe(false);
    expect(hasElementalMoveAccess({})).toBe(false);
    expect(hasElementalMoveAccess({ artifacts: {} })).toBe(false);
    expect(hasElementalMoveAccess({ elementalAffinity: 'fire' })).toBe(false);
  });

  it('allows elemental skills after Chapter 1-8 ring reward', () => {
    expect(
      hasElementalMoveAccess({ artifacts: { elemental_ring_level_1: true, chosen_element: 'fire' } })
    ).toBe(true);
  });
});
