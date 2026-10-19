import {
  filterSkillIdsForStudent,
  skillAppliesToAnyClass,
  skillAppliesToClass,
} from '../skillClassScope';

describe('skill class scope', () => {
  const everywhere = { classIds: [] };
  const legacy = {};
  const gd11 = { classIds: ['gd11'] };

  it('treats skills without classes as tracked for every class', () => {
    expect(skillAppliesToClass(everywhere, 'any')).toBe(true);
    expect(skillAppliesToClass(legacy, 'any')).toBe(true);
    expect(skillAppliesToClass(undefined, 'any')).toBe(true);
  });

  it('limits attached skills to their classes', () => {
    expect(skillAppliesToClass(gd11, 'gd11')).toBe(true);
    expect(skillAppliesToClass(gd11, 'cs9')).toBe(false);
    expect(skillAppliesToAnyClass(gd11, ['cs9', 'gd11'])).toBe(true);
    expect(skillAppliesToAnyClass(gd11, [])).toBe(false);
  });

  it('filters skills recorded for a student by their classes', () => {
    const byId = new Map([
      ['contrast', gd11],
      ['loops', { classIds: ['cs9'] }],
      ['teamwork', everywhere],
    ]);
    const ids = ['contrast', 'loops', 'teamwork', 'archived-skill'];
    expect(filterSkillIdsForStudent(ids, byId, ['gd11'])).toEqual(['contrast', 'teamwork', 'archived-skill']);
    expect(filterSkillIdsForStudent(ids, byId, [])).toEqual(['teamwork', 'archived-skill']);
    expect(filterSkillIdsForStudent(ids, byId, null)).toEqual(ids);
  });
});
