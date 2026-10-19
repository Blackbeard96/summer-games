import { buildPlayerSkillSummaries, sortPlayerSummaries } from '../skillPlayerView';
import type { PlayerSkillMastery } from '../../types/academicSkills';

const m = (userId: string, skillId: string, masteryScore: number, totalAttempts = 3): PlayerSkillMastery => ({
  userId,
  skillId,
  totalAttempts,
  correctAttempts: 0,
  incorrectAttempts: 0,
  rawAccuracy: 0,
  weightedAccuracy: 0,
  recentAccuracy: 0,
  masteryScore,
  masteryBand: 'developing',
  trend: [],
});

describe('buildPlayerSkillSummaries', () => {
  const mastery = new Map([
    ['ava', [m('ava', 'fractions', 95), m('ava', 'ratios', 50), m('ava', 'graphs', 0, 0)]],
    ['ben', [m('ben', 'fractions', 70)]],
  ]);
  const names = new Map([
    ['ava', 'Ava'],
    ['ben', 'Ben'],
  ]);

  it('summarizes each player across explored skills, strongest first', () => {
    const [ava, ben, cara] = buildPlayerSkillSummaries(['ava', 'ben', 'cara1234567'], names, mastery);
    expect(ava.skills.map((s) => s.skillId)).toEqual(['fractions', 'ratios']);
    expect(ava).toMatchObject({ explored: 2, masteredStrong: 1, weakCritical: 1, developing: 0, avgMastery: 72.5, attempts: 6 });
    expect(ben).toMatchObject({ explored: 1, developing: 1, avgMastery: 70 });
    expect(cara).toMatchObject({ name: 'cara1234', explored: 0, avgMastery: null });
  });

  it('respects the category filter', () => {
    const [ava] = buildPlayerSkillSummaries(['ava'], names, mastery, (id) => id === 'ratios');
    expect(ava).toMatchObject({ explored: 1, avgMastery: 50 });
  });

  it('sorts by mastery with unexplored players last', () => {
    const rows = buildPlayerSkillSummaries(['cara1234567', 'ben', 'ava'], names, mastery);
    expect(sortPlayerSummaries(rows, 'mastery-desc').map((r) => r.userId)).toEqual(['ava', 'ben', 'cara1234567']);
    expect(sortPlayerSummaries(rows, 'mastery-asc').map((r) => r.userId)).toEqual(['ben', 'ava', 'cara1234567']);
    expect(sortPlayerSummaries(rows, 'name').map((r) => r.name)).toEqual(['Ava', 'Ben', 'cara1234']);
  });
});
