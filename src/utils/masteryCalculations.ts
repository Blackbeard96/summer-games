import {
  ATTEMPT_WEIGHTS,
  MASTERY_BANDS,
  MASTERY_FORMULA,
  SkillMasteryBand,
  PlayerSkillMastery,
} from '../types/academicSkills';

/** Weight for the Nth attempt at a skill/question (1-indexed). Configurable via ATTEMPT_WEIGHTS. */
export function getAttemptWeight(attemptNumber: number): number {
  if (attemptNumber <= 1) return ATTEMPT_WEIGHTS.first;
  if (attemptNumber === 2) return ATTEMPT_WEIGHTS.second;
  return ATTEMPT_WEIGHTS.thirdPlus;
}

export function getMasteryBand(score: number | null | undefined, attempts: number): SkillMasteryBand {
  if (!attempts || attempts <= 0 || score == null || Number.isNaN(score)) {
    return 'unexplored';
  }
  const s = Math.max(0, Math.min(100, score));
  if (s >= 90) return 'mastered';
  if (s >= 75) return 'strong';
  if (s >= 60) return 'developing';
  if (s >= 40) return 'weak';
  return 'critical';
}

export function getMasteryBandMeta(band: SkillMasteryBand) {
  return MASTERY_BANDS.find((b) => b.id === band) || MASTERY_BANDS[MASTERY_BANDS.length - 1];
}

export function slugifySkillName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

type EvidenceSample = {
  correct: boolean;
  partialCredit: number;
  weight: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  timestampMs: number;
};

/**
 * Compute mastery fields from evidence samples (oldest → newest preferred but not required).
 */
export function computeMasteryFromEvidence(
  userId: string,
  skillId: string,
  samples: EvidenceSample[],
  previous?: Partial<PlayerSkillMastery> | null
): PlayerSkillMastery {
  const totalAttempts = samples.length;
  if (totalAttempts === 0) {
    return {
      userId,
      skillId,
      totalAttempts: 0,
      correctAttempts: 0,
      incorrectAttempts: 0,
      rawAccuracy: 0,
      weightedAccuracy: 0,
      recentAccuracy: 0,
      masteryScore: 0,
      masteryBand: 'unexplored',
      trend: previous?.trend || [],
      milestonesAwarded: previous?.milestonesAwarded || [],
    };
  }

  const sorted = [...samples].sort((a, b) => a.timestampMs - b.timestampMs);
  let correctAttempts = 0;
  let weightedSum = 0;
  let weightTotal = 0;
  const difficultyCorrect: PlayerSkillMastery['difficultyCorrect'] = {};
  const difficultyAttempts: PlayerSkillMastery['difficultyAttempts'] = {};

  for (const s of sorted) {
    const credit = s.partialCredit != null ? s.partialCredit : s.correct ? 1 : 0;
    if (credit >= 0.999) correctAttempts += 1;
    const w = s.weight > 0 ? s.weight : 1;
    weightedSum += credit * w;
    weightTotal += w;
    if (s.difficulty) {
      difficultyAttempts![s.difficulty] = (difficultyAttempts![s.difficulty] || 0) + 1;
      difficultyCorrect![s.difficulty] =
        (difficultyCorrect![s.difficulty] || 0) + credit;
    }
  }

  const incorrectAttempts = totalAttempts - correctAttempts;
  const rawAccuracy = (correctAttempts / totalAttempts) * 100;
  const weightedAccuracy = weightTotal > 0 ? (weightedSum / weightTotal) * 100 : rawAccuracy;

  const recent = sorted.slice(-MASTERY_FORMULA.recentWindow);
  const recentAccuracy =
    recent.length > 0
      ? (recent.reduce((sum, s) => sum + (s.partialCredit != null ? s.partialCredit : s.correct ? 1 : 0), 0) /
          recent.length) *
        100
      : weightedAccuracy;

  const hasDifficulty = Object.values(difficultyAttempts || {}).some((n) => (n || 0) > 0);
  let difficultyPerformance = weightedAccuracy;
  if (hasDifficulty) {
    // Weight harder questions slightly more when scoring difficulty performance
    const weights = { easy: 0.8, medium: 1, hard: 1.25 } as const;
    let dSum = 0;
    let dTot = 0;
    (['easy', 'medium', 'hard'] as const).forEach((d) => {
      const att = difficultyAttempts?.[d] || 0;
      if (att <= 0) return;
      const rate = (difficultyCorrect?.[d] || 0) / att;
      dSum += rate * weights[d] * att;
      dTot += weights[d] * att;
    });
    if (dTot > 0) difficultyPerformance = (dSum / dTot) * 100;
  }

  let masteryScore: number;
  if (hasDifficulty) {
    const f = MASTERY_FORMULA.withDifficulty;
    masteryScore =
      weightedAccuracy * f.weighted + recentAccuracy * f.recent + difficultyPerformance * f.difficulty;
  } else {
    const f = MASTERY_FORMULA.withoutDifficulty;
    masteryScore = weightedAccuracy * f.weighted + recentAccuracy * f.recent;
  }
  masteryScore = Math.round(Math.max(0, Math.min(100, masteryScore)) * 10) / 10;

  const lastPracticed = sorted[sorted.length - 1]?.timestampMs
    ? new Date(sorted[sorted.length - 1].timestampMs)
    : undefined;

  const prevTrend = Array.isArray(previous?.trend) ? previous!.trend!.slice(-7) : [];
  const trend = [...prevTrend, masteryScore].slice(-8);

  return {
    userId,
    skillId,
    totalAttempts,
    correctAttempts,
    incorrectAttempts,
    rawAccuracy: Math.round(rawAccuracy * 10) / 10,
    weightedAccuracy: Math.round(weightedAccuracy * 10) / 10,
    recentAccuracy: Math.round(recentAccuracy * 10) / 10,
    masteryScore,
    masteryBand: getMasteryBand(masteryScore, totalAttempts),
    lastPracticed,
    trend,
    difficultyCorrect,
    difficultyAttempts,
    milestonesAwarded: previous?.milestonesAwarded || [],
  };
}

export function detectMasteryMilestones(
  previousScore: number | null | undefined,
  previousAttempts: number,
  next: PlayerSkillMastery
): string[] {
  if (next.totalAttempts <= 0) return [];
  const awarded = new Set(next.milestonesAwarded || []);
  const crossed: string[] = [];
  const thresholds = [
    { id: 'developing_60', score: 60 },
    { id: 'strong_75', score: 75 },
    { id: 'mastered_90', score: 90 },
  ];
  const prev = previousAttempts > 0 ? previousScore ?? 0 : -1;
  for (const t of thresholds) {
    if (prev < t.score && next.masteryScore >= t.score && !awarded.has(t.id)) {
      crossed.push(t.id);
    }
  }
  return crossed;
}
