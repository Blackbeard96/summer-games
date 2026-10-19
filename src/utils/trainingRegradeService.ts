/**
 * Applies a Training Grounds answer-key change to everything already scored against the old key:
 * saved attempts (answers, score, percent), solo PP/XP, trainingGroundsStats, skill evidence +
 * mastery (Skill Analytics) and quiz productivity logs.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import type { TrainingAnswer, TrainingAttempt, TrainingGroundsStats, TrainingQuestion } from '../types/trainingGrounds';
import { getQuizSetAttempts, getUserAttempts } from './trainingGroundsService';
import { applyPlayerPPDelta } from './playerPowerPoints';
import { getPlayerUniversalLawEffects } from './universalLawBoons';
import { awardBattlePassXpForDeployedSeason } from './awardBattlePassXp';
import { rebuildSkillMasteryFromEvidence } from './masteryService';
import { quizProductivityDocId, updateUserProductivityStats } from './productivityTracking';
import {
  AttemptRegrade,
  correctIndicesOf,
  isLiveAttempt,
  regradeAttempt,
  regradeRewardDelta,
} from './trainingRegrade';

export interface RegradeSummary {
  attemptsScanned: number;
  attemptsChanged: number;
  nowCorrect: number;
  nowIncorrect: number;
  playersAffected: number;
  ppAdjusted: number;
  xpAdjusted: number;
  /** Attempts whose score was fixed but whose PP/XP could not be adjusted (permissions). */
  rewardAdjustmentsSkipped: number;
  errors: number;
}

function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function questionAnswersFingerprint(answers: unknown, questionId: string): string {
  const list = Array.isArray(answers) ? (answers as TrainingAnswer[]) : [];
  return JSON.stringify(
    list
      .filter((a) => a?.questionId === questionId)
      .map((a) => [a.selectedIndices ?? null, a.selectedIndex ?? null, !!a.isCorrect, a.partialCredit ?? null])
  );
}

type PlayerTally = {
  percentDeltaSum: number;
  ppDelta: number;
  xpDelta: number;
  skillIds: Set<string>;
  productivityTouched: boolean;
};

async function updateSkillEvidence(
  attempt: TrainingAttempt,
  questionId: string,
  regrade: AttemptRegrade
): Promise<string[]> {
  const evidenceAttemptId =
    isLiveAttempt(attempt) && attempt.liveEventSourceSessionId
      ? `live_${attempt.liveEventSourceSessionId}_${attempt.userId}`
      : attempt.id;
  const snap = await getDocs(
    query(
      collection(db, 'skillEvidence'),
      where('userId', '==', attempt.userId),
      where('attemptId', '==', evidenceAttemptId),
      where('questionId', '==', questionId)
    )
  );
  if (snap.empty || regrade.changes.length === 0) return [];

  // One evidence row per answer × skill; match rows to answers by their old grade.
  const rowsBySkill = new Map<string, typeof snap.docs>();
  snap.docs.forEach((d) => {
    const skillId = String(d.data().skillId || '');
    if (!rowsBySkill.has(skillId)) rowsBySkill.set(skillId, []);
    rowsBySkill.get(skillId)!.push(d);
  });

  const batch = writeBatch(db);
  let writes = 0;
  rowsBySkill.forEach((rows) => {
    const pending = [...regrade.changes];
    rows.forEach((row) => {
      const data = row.data();
      const credit = typeof data.partialCredit === 'number' ? data.partialCredit : data.correct ? 1 : 0;
      const idx = pending.findIndex(
        (c) => c.before.isCorrect === !!data.correct && Math.abs(c.before.partialCredit - credit) < 1e-9
      );
      if (idx < 0) return;
      const [change] = pending.splice(idx, 1);
      batch.update(row.ref, {
        correct: change.after.isCorrect,
        partialCredit: change.after.partialCredit,
        regradedAt: serverTimestamp(),
      });
      writes += 1;
    });
  });
  if (writes > 0) await batch.commit();
  return Array.from(rowsBySkill.keys()).filter(Boolean);
}

async function applyAttemptUpdate(
  attempt: TrainingAttempt,
  questionId: string,
  regrade: AttemptRegrade,
  questions: TrainingQuestion[]
): Promise<{ applied: boolean; ppDelta: number; xpDelta: number; rewardSkipped: boolean }> {
  const attemptRef = doc(db, 'trainingAttempts', attempt.id);
  const baseUpdate: DocumentData = {
    answers: stripUndefined(regrade.answers),
    scoreCorrect: regrade.scoreCorrect,
    percent: regrade.percent,
    regradedAt: serverTimestamp(),
  };

  const delta = isLiveAttempt(attempt)
    ? { pp: 0, xp: 0, bonuses: [] as string[] }
    : regradeRewardDelta(questions, attempt.answers || [], regrade.answers);
  if (delta.pp === 0 && delta.xp === 0) {
    await updateDoc(attemptRef, baseUpdate);
    return { applied: true, ppDelta: 0, xpDelta: 0, rewardSkipped: false };
  }

  const oldRewards = attempt.rewards || { ppGained: 0, xpGained: 0, bonuses: [] };
  const newPP = Math.max(0, (Number(oldRewards.ppGained) || 0) + delta.pp);
  const newXP = Math.max(0, (Number(oldRewards.xpGained) || 0) + delta.xp);
  const ppDelta = newPP - (Number(oldRewards.ppGained) || 0);
  const xpDelta = newXP - (Number(oldRewards.xpGained) || 0);
  const rewardUpdate = {
    ...baseUpdate,
    rewards: { ppGained: newPP, xpGained: newXP, bonuses: delta.bonuses },
  };

  let multiplier = 1;
  try {
    const law = await getPlayerUniversalLawEffects(attempt.userId);
    multiplier = 1 + Math.max(0, Number(law.battleRewardPpMultiplierBonusFraction || 0));
  } catch {
    /* default multiplier */
  }
  const walletPP =
    Math.floor(newPP * multiplier) - Math.floor((Number(oldRewards.ppGained) || 0) * multiplier);
  const fingerprint = questionAnswersFingerprint(attempt.answers, questionId);

  try {
    const result = await applyPlayerPPDelta(attempt.userId, walletPP, {
      mode: walletPP > 0 ? 'earn' : 'award',
      meta: { sourceType: 'other', sourceId: attempt.id, notes: 'Training Grounds regrade' },
      ...(xpDelta !== 0 ? { extraStudentFields: { xp: increment(xpDelta) } } : {}),
      guard: {
        ref: attemptRef,
        isClaimable: (data: DocumentData | undefined) =>
          !!data && questionAnswersFingerprint(data.answers, questionId) === fingerprint,
        claimUpdate: rewardUpdate,
      },
    });
    if (result.skipped) return { applied: false, ppDelta: 0, xpDelta: 0, rewardSkipped: false };
  } catch (err) {
    console.warn('[regrade] reward adjustment failed; fixing score only', attempt.id, err);
    await updateDoc(attemptRef, baseUpdate);
    return { applied: true, ppDelta: 0, xpDelta: 0, rewardSkipped: true };
  }

  if (xpDelta !== 0) {
    try {
      await updateDoc(doc(db, 'users', attempt.userId), { xp: increment(xpDelta) });
    } catch (err) {
      console.warn('[regrade] users xp mirror failed', attempt.userId, err);
    }
    if (xpDelta > 0) {
      try {
        await awardBattlePassXpForDeployedSeason(attempt.userId, xpDelta);
      } catch (err) {
        console.warn('[regrade] battle pass xp failed', attempt.userId, err);
      }
    }
  }
  return { applied: true, ppDelta, xpDelta, rewardSkipped: false };
}

async function refreshTrainingStats(userId: string, tally: PlayerTally): Promise<void> {
  const userRef = doc(db, 'users', userId);
  const studentRef = doc(db, 'students', userId);
  const [userSnap, studentSnap, attempts] = await Promise.all([
    getDoc(userRef).catch(() => null),
    getDoc(studentRef).catch(() => null),
    getUserAttempts(userId).catch(() => [] as TrainingAttempt[]),
  ]);
  const current: TrainingGroundsStats | undefined =
    userSnap?.data()?.trainingGroundsStats || studentSnap?.data()?.trainingGroundsStats;
  if (!current) return;

  const total = Math.max(1, Number(current.totalAttempts) || 0);
  const percents = attempts.map((a) => Number(a.percent) || 0);
  const payload = {
    'trainingGroundsStats.avgScore': Math.min(
      100,
      Math.max(0, (Number(current.avgScore) || 0) + tally.percentDeltaSum / total)
    ),
    'trainingGroundsStats.bestScore': percents.length > 0 ? Math.max(...percents) : Number(current.bestScore) || 0,
    'trainingGroundsStats.totalPPFromTraining': Math.max(0, (Number(current.totalPPFromTraining) || 0) + tally.ppDelta),
    'trainingGroundsStats.totalXPFromTraining': Math.max(0, (Number(current.totalXPFromTraining) || 0) + tally.xpDelta),
  };
  if (userSnap?.data()?.trainingGroundsStats) {
    await updateDoc(userRef, payload).catch((e) => console.warn('[regrade] users stats', e));
  }
  if (studentSnap?.data()?.trainingGroundsStats) {
    await updateDoc(studentRef, payload).catch((e) => console.warn('[regrade] students stats', e));
  }
}

/**
 * Re-score every saved answer to `question` (already saved with its new key) across all attempts of
 * the quiz. Pass `optionRemap` when options were reordered/removed so old picks follow their text.
 * Safe to re-run: attempts already matching the current key are left alone.
 */
export async function regradeQuestionResponses(params: {
  quizSetId: string;
  question: TrainingQuestion;
  questions: TrainingQuestion[];
  optionRemap?: Array<number | null> | null;
  onProgress?: (done: number, total: number) => void;
}): Promise<RegradeSummary> {
  const { quizSetId, question, questions, optionRemap = null, onProgress } = params;
  const summary: RegradeSummary = {
    attemptsScanned: 0,
    attemptsChanged: 0,
    nowCorrect: 0,
    nowIncorrect: 0,
    playersAffected: 0,
    ppAdjusted: 0,
    xpAdjusted: 0,
    rewardAdjustmentsSkipped: 0,
    errors: 0,
  };
  const correctIndices = correctIndicesOf(question);
  if (correctIndices.length === 0) return summary;

  const attempts = await getQuizSetAttempts(quizSetId);
  const relevant = attempts.filter((a) => (a.answers || []).some((ans) => ans?.questionId === question.id));
  summary.attemptsScanned = relevant.length;
  const players = new Map<string, PlayerTally>();

  let done = 0;
  for (const attempt of relevant) {
    try {
      const regrade = regradeAttempt(attempt, question.id, correctIndices, optionRemap);
      if (regrade) {
        const outcome = await applyAttemptUpdate(attempt, question.id, regrade, questions);
        if (outcome.applied) {
          summary.attemptsChanged += 1;
          summary.nowCorrect += regrade.nowCorrect;
          summary.nowIncorrect += regrade.nowIncorrect;
          summary.ppAdjusted += outcome.ppDelta;
          summary.xpAdjusted += outcome.xpDelta;
          if (outcome.rewardSkipped) summary.rewardAdjustmentsSkipped += 1;

          if (!players.has(attempt.userId)) {
            players.set(attempt.userId, {
              percentDeltaSum: 0,
              ppDelta: 0,
              xpDelta: 0,
              skillIds: new Set(),
              productivityTouched: false,
            });
          }
          const tally = players.get(attempt.userId)!;
          tally.percentDeltaSum += regrade.percent - (Number(attempt.percent) || 0);
          tally.ppDelta += outcome.ppDelta;
          tally.xpDelta += outcome.xpDelta;

          try {
            const skills = await updateSkillEvidence(attempt, question.id, regrade);
            skills.forEach((s) => tally.skillIds.add(s));
          } catch (err) {
            console.warn('[regrade] skill evidence update failed', attempt.id, err);
          }

          try {
            await updateDoc(doc(db, 'quizProductivityLogs', quizProductivityDocId(attempt.userId, quizSetId, attempt.id)), {
              scorePercent: regrade.percent,
              correctAnswers: regrade.scoreCorrect,
              updatedAt: serverTimestamp(),
            });
            tally.productivityTouched = true;
          } catch {
            /* no productivity log for this attempt, or not permitted */
          }
        }
      }
    } catch (err) {
      summary.errors += 1;
      console.warn('[regrade] attempt failed', attempt.id, err);
    }
    done += 1;
    onProgress?.(done, relevant.length);
  }

  summary.playersAffected = players.size;
  for (const [userId, tally] of Array.from(players.entries())) {
    try {
      await refreshTrainingStats(userId, tally);
    } catch (err) {
      console.warn('[regrade] training stats refresh failed', userId, err);
    }
    try {
      await rebuildSkillMasteryFromEvidence(userId, Array.from(tally.skillIds));
    } catch (err) {
      console.warn('[regrade] mastery rebuild failed', userId, err);
    }
    if (tally.productivityTouched) {
      try {
        await updateUserProductivityStats(userId);
      } catch (err) {
        console.warn('[regrade] productivity stats refresh failed', userId, err);
      }
    }
  }
  return summary;
}

export function describeRegradeSummary(s: RegradeSummary): string {
  if (s.attemptsScanned === 0) return 'No students have answered this question yet.';
  if (s.attemptsChanged === 0) return `All ${s.attemptsScanned} saved attempt(s) already match this answer key.`;
  const lines = [
    `Regraded ${s.attemptsChanged} attempt(s) from ${s.playersAffected} student(s).`,
    `${s.nowCorrect} answer(s) now marked correct, ${s.nowIncorrect} now marked incorrect.`,
  ];
  if (s.ppAdjusted !== 0 || s.xpAdjusted !== 0) {
    const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
    lines.push(`Rewards adjusted: ${sign(s.ppAdjusted)} PP, ${sign(s.xpAdjusted)} XP.`);
  }
  if (s.rewardAdjustmentsSkipped > 0) {
    lines.push(`${s.rewardAdjustmentsSkipped} attempt(s) had scores fixed but PP/XP could not be adjusted from this account.`);
  }
  if (s.errors > 0) lines.push(`${s.errors} attempt(s) failed — see the console and try "Re-check answers" again.`);
  return lines.join('\n');
}
