import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  PlayerSkillMastery,
  SkillEvidenceEvent,
  SkillEvidenceMode,
  SkillInsight,
} from '../types/academicSkills';
import { TrainingAnswer, TrainingQuestion } from '../types/trainingGrounds';
import {
  computeMasteryFromEvidence,
  detectMasteryMilestones,
  getAttemptWeight,
} from './masteryCalculations';

function masteryDocRef(userId: string, skillId: string) {
  return doc(db, 'skillMastery', userId, 'skills', skillId);
}

function evidenceCol() {
  return collection(db, 'skillEvidence');
}

export async function getPlayerSkillMastery(userId: string): Promise<PlayerSkillMastery[]> {
  const snap = await getDocs(collection(db, 'skillMastery', userId, 'skills'));
  return snap.docs.map((d) => ({ ...(d.data() as PlayerSkillMastery), skillId: d.id, userId }));
}

export async function getPlayerSkillMasteryById(
  userId: string,
  skillId: string
): Promise<PlayerSkillMastery | null> {
  const all = await getPlayerSkillMastery(userId);
  return all.find((m) => m.skillId === skillId) || null;
}

async function countPriorQuestionAttempts(userId: string, questionId: string): Promise<number> {
  // Prefer evidence collection; fall back to scanning recent attempts is expensive — evidence is source of truth going forward
  const q = query(
    evidenceCol(),
    where('userId', '==', userId),
    where('questionId', '==', questionId)
  );
  const snap = await getDocs(q);
  return snap.size;
}

/**
 * After a CFU attempt is saved, write per-skill evidence and refresh mastery aggregates.
 * Safe no-op when answers have no skillIds.
 */
export async function recordSkillEvidenceFromAttempt(params: {
  userId: string;
  quizSetId: string;
  attemptId: string;
  answers: Array<
    TrainingAnswer & {
      skillIds?: string[];
      difficulty?: 'easy' | 'medium' | 'hard';
    }
  >;
  mode: SkillEvidenceMode;
}): Promise<void> {
  const { userId, quizSetId, attemptId, answers, mode } = params;
  const tagged = answers.filter((a) => Array.isArray(a.skillIds) && a.skillIds!.length > 0);
  if (tagged.length === 0) return;

  // Idempotent: same attemptId already recorded
  try {
    const priorAttempt = await getDocs(
      query(evidenceCol(), where('userId', '==', userId), where('attemptId', '==', attemptId), limit(1))
    );
    if (!priorAttempt.empty) return;
  } catch {
    /* proceed — index may be missing; duplicate risk is acceptable vs blocking */
  }

  const now = Date.now();
  const skillSampleMap = new Map<
    string,
    {
      correct: boolean;
      partialCredit: number;
      weight: number;
      difficulty?: 'easy' | 'medium' | 'hard';
      timestampMs: number;
    }[]
  >();

  // Load existing mastery for merge
  const existingMastery = await getPlayerSkillMastery(userId);
  const masteryById = new Map(existingMastery.map((m) => [m.skillId, m]));

  for (const answer of tagged) {
    const prior = await countPriorQuestionAttempts(userId, answer.questionId);
    const attemptNumber = prior + 1;
    const weight = getAttemptWeight(attemptNumber);
    const partial =
      answer.partialCredit != null ? answer.partialCredit : answer.isCorrect ? 1 : 0;

    for (const skillId of answer.skillIds!) {
      await addDoc(evidenceCol(), {
        userId,
        skillId,
        cfuId: quizSetId,
        questionId: answer.questionId,
        attemptId,
        correct: !!answer.isCorrect,
        partialCredit: partial,
        weight,
        difficulty: answer.difficulty || null,
        mode,
        attemptNumber,
        responseTimeMs: answer.timeSpentMs || 0,
        timestamp: serverTimestamp(),
        createdAtMs: now,
      } as Omit<SkillEvidenceEvent, 'id'> & { attemptId: string; createdAtMs: number; difficulty: string | null });

      if (!skillSampleMap.has(skillId)) skillSampleMap.set(skillId, []);
      skillSampleMap.get(skillId)!.push({
        correct: !!answer.isCorrect,
        partialCredit: partial,
        weight,
        difficulty: answer.difficulty,
        timestampMs: now,
      });
    }
  }

  // Rebuild mastery per touched skill from evidence (capped recent query)
  const batch = writeBatch(db);
  for (const skillId of Array.from(skillSampleMap.keys())) {
    const evidenceSnap = await getDocs(
      query(evidenceCol(), where('userId', '==', userId), where('skillId', '==', skillId))
    );
    const samples = evidenceSnap.docs.map((d) => {
      const data = d.data();
      return {
        correct: !!data.correct,
        partialCredit: typeof data.partialCredit === 'number' ? data.partialCredit : data.correct ? 1 : 0,
        weight: typeof data.weight === 'number' ? data.weight : 1,
        difficulty: data.difficulty as 'easy' | 'medium' | 'hard' | undefined,
        timestampMs:
          data.createdAtMs ||
          data.timestamp?.toMillis?.() ||
          (data.timestamp ? new Date(data.timestamp).getTime() : now),
      };
    });

    const previous = masteryById.get(skillId) || null;
    const next = computeMasteryFromEvidence(userId, skillId, samples, previous);
    const milestones = detectMasteryMilestones(
      previous?.masteryScore,
      previous?.totalAttempts || 0,
      next
    );
    if (milestones.length) {
      next.milestonesAwarded = [...(previous?.milestonesAwarded || []), ...milestones];
      for (const m of milestones) {
        await addDoc(collection(db, 'skillMasteryEvents'), {
          userId,
          skillId,
          milestone: m,
          masteryScore: next.masteryScore,
          timestamp: serverTimestamp(),
        });
      }
    }

    batch.set(
      masteryDocRef(userId, skillId),
      {
        ...next,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
  await batch.commit();
}

/** Stamp skillIds + difficulty onto answers from question bank before saving attempt */
export function enrichAnswersWithSkills(
  answers: TrainingAnswer[],
  questions: TrainingQuestion[]
): Array<TrainingAnswer & { skillIds: string[]; difficulty?: 'easy' | 'medium' | 'hard' }> {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return answers.map((a) => {
    const q = byId.get(a.questionId);
    return {
      ...a,
      skillIds: Array.isArray(q?.skillIds) ? [...q!.skillIds!] : [],
      difficulty: q?.difficulty,
    };
  });
}

export function buildSkillInsights(
  mastery: PlayerSkillMastery[],
  skillNames: Record<string, string>
): SkillInsight[] {
  const explored = mastery.filter((m) => m.totalAttempts > 0);
  if (explored.length === 0) return [];

  const insights: SkillInsight[] = [];
  const strongest = [...explored].sort((a, b) => b.masteryScore - a.masteryScore)[0];
  if (strongest) {
    insights.push({
      type: 'strongest',
      skillId: strongest.skillId,
      title: 'Strongest Skill',
      message: `${skillNames[strongest.skillId] || 'This skill'} is currently your strongest at ${strongest.masteryScore}% mastery.`,
    });
  }

  const withTrend = explored.filter((m) => (m.trend || []).length >= 2);
  let bestGrowth: { m: PlayerSkillMastery; delta: number } | null = null;
  for (const m of withTrend) {
    const t = m.trend!;
    const delta = t[t.length - 1] - t[0];
    if (!bestGrowth || delta > bestGrowth.delta) bestGrowth = { m, delta };
  }
  if (bestGrowth && bestGrowth.delta >= 5) {
    const t = bestGrowth.m.trend!;
    insights.push({
      type: 'growth',
      skillId: bestGrowth.m.skillId,
      title: 'Greatest Growth',
      message: `${skillNames[bestGrowth.m.skillId] || 'A skill'} increased from ${Math.round(t[0])}% to ${Math.round(t[t.length - 1])}%.`,
    });
  }

  const weakest = [...explored].sort((a, b) => a.masteryScore - b.masteryScore)[0];
  if (weakest && weakest.masteryScore < 60) {
    insights.push({
      type: 'needs_training',
      skillId: weakest.skillId,
      title: 'Needs Training',
      message: `${skillNames[weakest.skillId] || 'This skill'} is at ${weakest.masteryScore}% — prioritize practice here.`,
    });
  }

  const recentlyImproved = withTrend
    .map((m) => {
      const t = m.trend!;
      const delta = t[t.length - 1] - (t[t.length - 2] ?? t[0]);
      return { m, delta };
    })
    .filter((x) => x.delta >= 5)
    .sort((a, b) => b.delta - a.delta)[0];
  if (recentlyImproved) {
    insights.push({
      type: 'recently_improved',
      skillId: recentlyImproved.m.skillId,
      title: 'Recently Improved',
      message: `${skillNames[recentlyImproved.m.skillId] || 'A skill'} improved by ${Math.round(recentlyImproved.delta)}% on recent attempts.`,
    });
  }

  return insights.slice(0, 4);
}

export async function getClassSkillAnalytics(params: {
  classStudentIds: string[];
}): Promise<
  {
    skillId: string;
    classMastery: number;
    masteredStrong: number;
    developing: number;
    weakCritical: number;
    unexplored: number;
    attempts: number;
    studentCount: number;
  }[]
> {
  const { classStudentIds } = params;
  if (classStudentIds.length === 0) return [];

  const bySkill = new Map<
    string,
    {
      scores: number[];
      masteredStrong: number;
      developing: number;
      weakCritical: number;
      unexplored: number;
      attempts: number;
    }
  >();

  // Limit concurrency for cost control
  for (const uid of classStudentIds) {
    const rows = await getPlayerSkillMastery(uid);
    const seen = new Set(rows.map((r) => r.skillId));
    for (const row of rows) {
      if (!bySkill.has(row.skillId)) {
        bySkill.set(row.skillId, {
          scores: [],
          masteredStrong: 0,
          developing: 0,
          weakCritical: 0,
          unexplored: 0,
          attempts: 0,
        });
      }
      const bucket = bySkill.get(row.skillId)!;
      bucket.attempts += row.totalAttempts || 0;
      if (!row.totalAttempts) {
        bucket.unexplored += 1;
        continue;
      }
      bucket.scores.push(row.masteryScore);
      if (row.masteryBand === 'mastered' || row.masteryBand === 'strong') bucket.masteredStrong += 1;
      else if (row.masteryBand === 'developing') bucket.developing += 1;
      else bucket.weakCritical += 1;
    }
    // students with no mastery docs for a skill counted later when we know skill universe — skip for MVP
    void seen;
  }

  return Array.from(bySkill.entries()).map(([skillId, b]) => ({
    skillId,
    classMastery:
      b.scores.length > 0
        ? Math.round((b.scores.reduce((s, n) => s + n, 0) / b.scores.length) * 10) / 10
        : 0,
    masteredStrong: b.masteredStrong,
    developing: b.developing,
    weakCritical: b.weakCritical,
    unexplored: Math.max(0, classStudentIds.length - (b.masteredStrong + b.developing + b.weakCritical)),
    attempts: b.attempts,
    studentCount: classStudentIds.length,
  }));
}

export async function setPlayerSkillMasteryDoc(mastery: PlayerSkillMastery): Promise<void> {
  await setDoc(masteryDocRef(mastery.userId, mastery.skillId), {
    ...mastery,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
