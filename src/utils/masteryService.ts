import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
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

type HistoryEvidenceSample = {
  correct: boolean;
  partialCredit: number;
  weight: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  timestampMs: number;
};

type QuestionTag = { skillIds: string[]; difficulty?: 'easy' | 'medium' | 'hard' };

export interface SkillHistorySyncResult {
  studentsScanned: number;
  attemptsScanned: number;
  evidenceAdded: number;
  skillsUpdated: number;
  errors: number;
}

function anyToMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  const t = value as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  const n = new Date(value as string).getTime();
  return Number.isFinite(n) ? n : 0;
}

function masteryWithReplayedTrend(
  userId: string,
  skillId: string,
  samples: HistoryEvidenceSample[],
  previous: PlayerSkillMastery | null
): PlayerSkillMastery {
  const sorted = [...samples].sort((a, b) => a.timestampMs - b.timestampMs);
  const checkpoints = Array.from(new Set(sorted.map((s) => s.timestampMs))).slice(-8);
  const trend = checkpoints.map(
    (cp) =>
      computeMasteryFromEvidence(
        userId,
        skillId,
        sorted.filter((s) => s.timestampMs <= cp),
        null
      ).masteryScore
  );
  const next = computeMasteryFromEvidence(userId, skillId, sorted, previous);
  next.trend = trend;
  return next;
}

async function syncUserSkillHistory(
  userId: string,
  loadQuestionTags: (quizSetId: string) => Promise<Map<string, QuestionTag>>,
  result: SkillHistorySyncResult
): Promise<void> {
  const attemptsSnap = await getDocs(
    query(collection(db, 'trainingAttempts'), where('userId', '==', userId))
  );
  result.studentsScanned += 1;
  if (attemptsSnap.empty) return;

  const attempts = attemptsSnap.docs
    .map((d) => {
      const data = d.data();
      const isLive = data.mode === 'live';
      return {
        quizSetId: typeof data.quizSetId === 'string' ? data.quizSetId : '',
        completedMs: anyToMillis(data.completedAt) || anyToMillis(data.startedAt),
        mode: (isLive ? 'live-event' : 'training-grounds') as SkillEvidenceMode,
        // Must match the attemptId used by the live-event and solo evidence writers so re-syncs never duplicate.
        evidenceAttemptId:
          isLive && data.liveEventSourceSessionId
            ? `live_${data.liveEventSourceSessionId}_${userId}`
            : d.id,
        answers: (Array.isArray(data.answers) ? data.answers : []) as Array<
          TrainingAnswer & { skillIds?: string[]; difficulty?: 'easy' | 'medium' | 'hard' }
        >,
      };
    })
    .filter((a) => a.quizSetId)
    .sort((a, b) => a.completedMs - b.completedMs);
  result.attemptsScanned += attempts.length;

  const samplesBySkill = new Map<string, HistoryEvidenceSample[]>();
  const pushSample = (skillId: string, sample: HistoryEvidenceSample) => {
    if (!samplesBySkill.has(skillId)) samplesBySkill.set(skillId, []);
    samplesBySkill.get(skillId)!.push(sample);
  };

  const evidenceSnap = await getDocs(query(evidenceCol(), where('userId', '==', userId)));
  const existingKeys = new Set<string>();
  evidenceSnap.docs.forEach((d) => {
    const e = d.data();
    if (!e.skillId) return;
    existingKeys.add(`${e.attemptId}|${e.questionId}|${e.skillId}`);
    pushSample(e.skillId, {
      correct: !!e.correct,
      partialCredit: typeof e.partialCredit === 'number' ? e.partialCredit : e.correct ? 1 : 0,
      weight: typeof e.weight === 'number' ? e.weight : 1,
      difficulty: e.difficulty || undefined,
      timestampMs: e.createdAtMs || anyToMillis(e.timestamp) || Date.now(),
    });
  });

  const questionAttemptCount = new Map<string, number>();
  const touched = new Set<string>();
  const newEvidence: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const attempt of attempts) {
    const tags = await loadQuestionTags(attempt.quizSetId);
    const ms = attempt.completedMs || Date.now();
    for (const answer of attempt.answers) {
      const questionId = answer?.questionId;
      if (!questionId) continue;
      const attemptNumber = (questionAttemptCount.get(questionId) || 0) + 1;
      questionAttemptCount.set(questionId, attemptNumber);

      const bank = tags.get(questionId);
      const skillIds =
        bank && bank.skillIds.length > 0
          ? bank.skillIds
          : Array.isArray(answer.skillIds)
            ? answer.skillIds.filter((s) => typeof s === 'string' && s)
            : [];
      if (skillIds.length === 0) continue;

      const weight = getAttemptWeight(attemptNumber);
      const partial =
        typeof answer.partialCredit === 'number' ? answer.partialCredit : answer.isCorrect ? 1 : 0;
      const difficulty = bank?.difficulty || answer.difficulty;

      for (const skillId of skillIds) {
        const key = `${attempt.evidenceAttemptId}|${questionId}|${skillId}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        newEvidence.push({
          id: `hist_${attempt.evidenceAttemptId}_${questionId}_${skillId}`,
          data: {
            userId,
            skillId,
            cfuId: attempt.quizSetId,
            questionId,
            attemptId: attempt.evidenceAttemptId,
            correct: !!answer.isCorrect,
            partialCredit: partial,
            weight,
            difficulty: difficulty || null,
            mode: attempt.mode,
            attemptNumber,
            responseTimeMs: Number(answer.timeSpentMs) || 0,
            timestamp: Timestamp.fromMillis(ms),
            createdAtMs: ms,
            source: 'history-sync',
          },
        });
        pushSample(skillId, { correct: !!answer.isCorrect, partialCredit: partial, weight, difficulty, timestampMs: ms });
        touched.add(skillId);
      }
    }
  }

  for (let i = 0; i < newEvidence.length; i += 400) {
    const batch = writeBatch(db);
    newEvidence.slice(i, i + 400).forEach(({ id, data }) => batch.set(doc(evidenceCol(), id), data));
    await batch.commit();
  }
  result.evidenceAdded += newEvidence.length;

  const existingMastery = await getPlayerSkillMastery(userId);
  const masteryById = new Map(existingMastery.map((m) => [m.skillId, m]));
  samplesBySkill.forEach((_, skillId) => {
    if (!masteryById.has(skillId)) touched.add(skillId);
  });
  if (touched.size === 0) return;

  const batch = writeBatch(db);
  touched.forEach((skillId) => {
    const samples = samplesBySkill.get(skillId) || [];
    if (samples.length === 0) return;
    const next = masteryWithReplayedTrend(userId, skillId, samples, masteryById.get(skillId) || null);
    const clean = Object.fromEntries(Object.entries(next).filter(([, v]) => v !== undefined));
    batch.set(masteryDocRef(userId, skillId), { ...clean, updatedAt: serverTimestamp() }, { merge: true });
  });
  await batch.commit();
  result.skillsUpdated += touched.size;
}

/**
 * Backfill skill evidence + mastery from saved CFU attempts (solo and Live Event) using the
 * questions' current skill tags. Idempotent: only evidence not already recorded is added.
 */
export async function syncSkillMasteryFromAttemptHistory(
  userIds: string[],
  onProgress?: (done: number, total: number) => void
): Promise<SkillHistorySyncResult> {
  const result: SkillHistorySyncResult = {
    studentsScanned: 0,
    attemptsScanned: 0,
    evidenceAdded: 0,
    skillsUpdated: 0,
    errors: 0,
  };
  const questionCache = new Map<string, Promise<Map<string, QuestionTag>>>();
  const loadQuestionTags = (quizSetId: string) => {
    if (!questionCache.has(quizSetId)) {
      questionCache.set(
        quizSetId,
        getDocs(collection(db, 'trainingQuizSets', quizSetId, 'questions'))
          .then(
            (snap) =>
              new Map(
                snap.docs.map((d) => {
                  const data = d.data();
                  return [
                    d.id,
                    {
                      skillIds: Array.isArray(data.skillIds)
                        ? data.skillIds.filter((s: unknown) => typeof s === 'string' && s)
                        : [],
                      difficulty: data.difficulty,
                    },
                  ] as [string, QuestionTag];
                })
              )
          )
          .catch(() => new Map<string, QuestionTag>())
      );
    }
    return questionCache.get(quizSetId)!;
  };

  let done = 0;
  for (const userId of userIds) {
    try {
      await syncUserSkillHistory(userId, loadQuestionTags, result);
    } catch (e) {
      result.errors += 1;
      console.warn('[mastery] history sync failed for', userId, e);
    }
    done += 1;
    onProgress?.(done, userIds.length);
  }
  return result;
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
