import { CHAPTERS } from '../../types/chapters';
import type { MissionTemplate } from '../../types/missions';
import {
  applyJourneyChallengeOverride,
  buildJourneyChapter,
  journeyChallengeIdForMission,
  orderJourneyChapterEntries,
} from '../journeyChallengeConfig';
import { buildJourneyStepChoices, mergeJourneyMissionsForAdmin } from '../missionAdminHelpers';

const chapter1 = CHAPTERS.find((c) => c.id === 1)!;

function placedMission(id: string, afterChallengeId: string | null, extra: Partial<MissionTemplate> = {}): MissionTemplate {
  return {
    id,
    title: `Mission ${id}`,
    description: 'desc',
    missionCategory: 'STORY',
    deliveryChannels: ['PLAYER_JOURNEY'],
    journeyPlacement: { chapterId: 1, afterChallengeId },
    sequence: [],
    ...extra,
  } as MissionTemplate;
}

describe('orderJourneyChapterEntries', () => {
  it('inserts a placed mission right after its anchor challenge', () => {
    const anchor = chapter1.challenges[1].id;
    const entries = orderJourneyChapterEntries(chapter1.challenges, [placedMission('m1', anchor)]);
    expect(entries[2]).toEqual({ kind: 'mission', mission: expect.objectContaining({ id: 'm1' }) });
    expect(entries).toHaveLength(chapter1.challenges.length + 1);
  });

  it('chains missions placed after other placed missions and puts unanchored ones at the end', () => {
    const first = placedMission('m1', chapter1.challenges[0].id);
    const second = placedMission('m2', journeyChallengeIdForMission('m1'));
    const tail = placedMission('m3', null);
    const ids = orderJourneyChapterEntries(chapter1.challenges, [tail, second, first]).map((e) =>
      e.kind === 'core' ? e.challenge.id : e.mission.id
    );
    expect(ids.slice(0, 4)).toEqual([chapter1.challenges[0].id, 'm1', 'm2', chapter1.challenges[1].id]);
    expect(ids[ids.length - 1]).toBe('m3');
  });
});

describe('applyJourneyChallengeOverride', () => {
  const challenge = chapter1.challenges[0];

  it('replaces title and XP but keeps other rewards', () => {
    const edited = applyJourneyChallengeOverride(challenge, {
      challengeId: challenge.id,
      chapterId: 1,
      title: 'New Title',
      xpReward: 999,
    });
    expect(edited.title).toBe('New Title');
    expect(edited.description).toBe(challenge.description);
    expect(edited.rewards.find((r) => r.type === 'xp')?.value).toBe(999);
    expect(edited.rewards.filter((r) => r.type !== 'xp')).toEqual(challenge.rewards.filter((r) => r.type !== 'xp'));
  });

  it('returns the original challenge when the override is empty', () => {
    expect(applyJourneyChallengeOverride(challenge, { challengeId: challenge.id, chapterId: 1 })).toBe(challenge);
  });
});

describe('buildJourneyChapter', () => {
  it('turns placed missions into numbered challenges linked to the mission', () => {
    const built = buildJourneyChapter(chapter1, {}, [placedMission('m1', chapter1.challenges[0].id)]);
    expect(built.challenges[1]).toEqual(
      expect.objectContaining({ id: journeyChallengeIdForMission('m1'), linkedMissionId: 'm1' })
    );
  });

  it('ignores missions placed in other chapters', () => {
    const other = placedMission('m1', null, { journeyPlacement: { chapterId: 2, afterChallengeId: null } });
    expect(buildJourneyChapter(chapter1, {}, [other])).toBe(chapter1);
  });
});

describe('Mission Admin Journey helpers', () => {
  it('numbers step choices in Journey order with overrides and draft labels', () => {
    const choices = buildJourneyStepChoices(
      [placedMission('m1', chapter1.challenges[0].id, { isPublished: false })],
      { [chapter1.challenges[0].id]: { challengeId: chapter1.challenges[0].id, chapterId: 1, title: 'Renamed' } }
    );
    expect(choices[1][0]).toEqual({ id: chapter1.challenges[0].id, label: '1-1 Renamed' });
    expect(choices[1][1]).toEqual({
      id: journeyChallengeIdForMission('m1'),
      label: '1-2 Mission m1 (draft)',
      missionId: 'm1',
    });
    expect(choices[1][2].label.startsWith('1-3 ')).toBe(true);
  });

  it('lists placed missions in the admin Journey list at their chapter position', () => {
    const rows = mergeJourneyMissionsForAdmin([placedMission('m1', chapter1.challenges[0].id)]);
    const idx = rows.findIndex((m) => m.id === 'm1');
    expect(rows[idx]).toEqual(expect.objectContaining({ chapterNumber: 1, missionNumber: 2 }));
    expect(rows[idx - 1].id).toContain(chapter1.challenges[0].id);
  });
});
