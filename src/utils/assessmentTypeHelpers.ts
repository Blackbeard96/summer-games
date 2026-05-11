import type { Assessment, AssessmentType, ReflectionQuestionConfig } from '../types/assessmentGoals';

/** Canonical numeric written goals (new + legacy Firestore). */
export function isWrittenAssessmentType(t: AssessmentType | string | undefined): boolean {
  return t === 'written_assessment' || t === 'test' || t === 'exam' || t === 'quiz';
}

export function isReflectionAssessmentType(t: AssessmentType | string | undefined): boolean {
  return t === 'reflection' || t === 'live_reflection';
}

export function isWeeklyDeliverableAssessmentType(t: AssessmentType | string | undefined): boolean {
  return t === 'weekly_deliverable';
}

/** True when a reflection assessment has at least one configured prompt (structured student UI). */
export function hasStructuredReflectionQuestions(a: Pick<Assessment, 'type' | 'reflectionConfig'>): boolean {
  if (!isReflectionAssessmentType(a.type)) return false;
  const qs = a.reflectionConfig?.questions;
  return Array.isArray(qs) && qs.length > 0;
}

/** Normalize legacy types to the admin form value. */
export function normalizeAssessmentFormType(t: AssessmentType | string | undefined): AssessmentType {
  if (t === 'test' || t === 'exam' || t === 'quiz') return 'written_assessment';
  if (t === 'live_reflection') return 'reflection';
  return (t || 'written_assessment') as AssessmentType;
}

export function writtenKindFromAssessment(a: Pick<Assessment, 'type' | 'writtenAssessmentKind'>): 'test' | 'exam' | 'quiz' {
  if (a.writtenAssessmentKind === 'test' || a.writtenAssessmentKind === 'exam' || a.writtenAssessmentKind === 'quiz') {
    return a.writtenAssessmentKind;
  }
  if (a.type === 'test' || a.type === 'exam' || a.type === 'quiz') return a.type;
  return 'test';
}

export function newReflectionQuestionId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Human-readable block for goal evidence / live-event append. */
export function formatReflectionResponsesAsEvidence(
  questions: ReflectionQuestionConfig[],
  answers: Record<string, string>
): string {
  return questions
    .map((q) => {
      const a = (answers[q.id] || '').trim();
      return `Q: ${q.prompt.trim()}\nA: ${a || '(no answer)'}`;
    })
    .join('\n\n');
}

export function formatAssessmentTypeLabel(a: Pick<Assessment, 'type' | 'writtenAssessmentKind'>): string {
  if (a.type === 'habits') return 'Habit Goals';
  if (isReflectionAssessmentType(a.type)) return 'Reflection';
  if (isWrittenAssessmentType(a.type)) {
    const k = writtenKindFromAssessment(a);
    return `Written Assessment (${k.charAt(0).toUpperCase() + k.slice(1)})`;
  }
  if (a.type === 'story-goal') return 'Story Goal';
  if (a.type === 'weekly_deliverable') return 'Weekly Deliverable';
  return a.type.replace(/_/g, ' ');
}
