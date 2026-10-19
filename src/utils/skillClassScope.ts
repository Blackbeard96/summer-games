/**
 * Which classes an academic skill is tracked for (pure). A skill with no classes attached applies
 * to every class, so skills created before class scoping keep working unchanged.
 */

import type { AcademicSkill } from '../types/academicSkills';

type ScopedSkill = Pick<AcademicSkill, 'classIds'> | null | undefined;

export function skillClassIds(skill: ScopedSkill): string[] {
  return Array.isArray(skill?.classIds) ? skill!.classIds!.filter((id) => typeof id === 'string' && id) : [];
}

export function isSkillClassRestricted(skill: ScopedSkill): boolean {
  return skillClassIds(skill).length > 0;
}

export function skillAppliesToClass(skill: ScopedSkill, classId: string): boolean {
  const ids = skillClassIds(skill);
  return ids.length === 0 || ids.includes(classId);
}

export function skillAppliesToAnyClass(skill: ScopedSkill, classIds: string[]): boolean {
  const ids = skillClassIds(skill);
  return ids.length === 0 || ids.some((id) => classIds.includes(id));
}

/**
 * Skill ids worth recording for a student. Unknown skills are kept (they may be archived or not
 * loaded); when the student's classes are unknown (null) nothing is filtered.
 */
export function filterSkillIdsForStudent(
  skillIds: string[],
  skillsById: Map<string, ScopedSkill>,
  studentClassIds: string[] | null
): string[] {
  if (studentClassIds === null) return skillIds;
  return skillIds.filter((id) => {
    const skill = skillsById.get(id);
    return !skill || skillAppliesToAnyClass(skill, studentClassIds);
  });
}
