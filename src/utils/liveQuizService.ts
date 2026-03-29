/**
 * Live Event Quiz Mode — Firestore service.
 * Session state: inSessionRooms/{sessionId}/quizSession/current
 * Player responses: inSessionRooms/{sessionId}/quizSession/current/responses/{uid}
 */

import { db } from '../firebase';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  increment,
  arrayUnion,
} from 'firebase/firestore';
import type { UpdateData, DocumentData } from 'firebase/firestore';
import type {
  LiveQuizSession,
  LiveQuizStatus,
  LiveQuizResponse,
  LiveQuizRewardConfig,
  LiveQuizPlacementReward,
  LiveQuizGameMode,
  BattleRoyaleHostConfig,
  TeamBattleRoyaleHostConfig,
  TeamBattleRoyaleRuntimeState,
  BattleRoyaleRuntimeState,
  LiveQuizPerQuestionResultEntry,
} from '../types/liveQuiz';
import { getQuizSet, getQuestions } from './trainingGroundsService';
import { calculateLiveQuizPoints, computeBattleRoyaleStreakRewards } from './liveQuizScoring';
import { trackParticipation, trackElimination, breakParticipationStreak } from './inSessionStatsService';
import { awardPowerXpForLiveQuizCorrectAnswer } from './liveEventPowerStatsService';
import { computeDamageAfterShield } from './liveEventCombatMath';
import { grantArtifactToPlayer, getArtifactDetails } from './artifactCompensation';

const DEBUG = process.env.REACT_APP_DEBUG_LIVE_QUIZ === 'true';

function log(...args: unknown[]) {
  if (DEBUG) console.log('[LiveQuiz]', ...args);
}

/** Firestore rejects `undefined` anywhere in document data (invalid-argument). */
function omitUndefinedFields<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

const QUIZ_SESSION_CURRENT = 'current';

function sessionRef(sessionId: string) {
  return doc(db, 'inSessionRooms', sessionId, 'quizSession', QUIZ_SESSION_CURRENT);
}

function responsesRef(sessionId: string) {
  return collection(db, 'inSessionRooms', sessionId, 'quizSession', QUIZ_SESSION_CURRENT, 'responses');
}

function responseDocRef(sessionId: string, uid: string) {
  return doc(db, 'inSessionRooms', sessionId, 'quizSession', QUIZ_SESSION_CURRENT, 'responses', uid);
}

function roomRef(sessionId: string) {
  return doc(db, 'inSessionRooms', sessionId);
}

export const DEFAULT_BATTLE_ROYALE_HOST_CONFIG: BattleRoyaleHostConfig = {
  finalSurvivorsTarget: 1,
  shuffleAnswers: true,
  autoRepeatQuestions: true,
  spectatorsOnElimination: true,
  allowEliminatedQuizAnswering: false,
  autoAdvanceDelayMs: 5000,
};

export const DEFAULT_TEAM_BATTLE_ROYALE_HOST_CONFIG: TeamBattleRoyaleHostConfig = {
  teamCount: 2,
  teams: [
    { id: 'team-1', name: 'Team 1', color: '#dc2626' },
    { id: 'team-2', name: 'Team 2', color: '#2563eb' },
  ],
  autoBalanceTeams: true,
  supportAlliesEnabled: true,
  sharedTeamHealth: false,
  shuffleAnswers: true,
  autoRepeatQuestions: true,
  spectatorsOnElimination: true,
  allowEliminatedQuizAnswering: false,
  autoAdvanceDelayMs: 5000,
};

export type StartQuizSessionOptions = {
  gameMode?: LiveQuizGameMode;
  battleRoyale?: BattleRoyaleHostConfig;
  teamBattleRoyale?: TeamBattleRoyaleHostConfig;
  roomPlayerUids?: string[];
};

export function isBattleQuizMode(mode?: LiveQuizGameMode): boolean {
  return mode === 'battle_royale' || mode === 'team_battle_royale';
}

function shuffleUids<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildTeamAssignments(
  cfg: TeamBattleRoyaleHostConfig,
  roomPlayerUids: string[]
): TeamBattleRoyaleRuntimeState {
  const n = Math.max(1, cfg.teamCount || 2);
  const teams: TeamBattleRoyaleHostConfig['teams'] =
    cfg.teams?.length >= n
      ? cfg.teams.slice(0, n)
      : Array.from({ length: n }, (_, i) => ({
          id: `team-${i + 1}`,
          name: `Team ${i + 1}`,
          color: ['#dc2626', '#2563eb', '#16a34a', '#ca8a04', '#9333ea', '#db2777'][i % 6],
        }));
  const teamIds = teams.map((t) => t.id);
  const uids = cfg.autoBalanceTeams ? shuffleUids(roomPlayerUids) : [...roomPlayerUids];
  const playerTeamId: Record<string, string> = {};
  uids.forEach((uid, i) => {
    playerTeamId[uid] = teamIds[i % teamIds.length];
  });
  return { teams, playerTeamId };
}

/** Get current quiz session (null if none or idle). */
export async function getQuizSession(sessionId: string): Promise<LiveQuizSession | null> {
  const snap = await getDoc(sessionRef(sessionId));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data?.status === 'idle' || !data?.status) return null;
  return data as LiveQuizSession;
}

/** Subscribe to quiz session changes. */
export function subscribeQuizSession(
  sessionId: string,
  onSession: (session: LiveQuizSession | null) => void
): () => void {
  return onSnapshot(
    sessionRef(sessionId),
    (snap) => {
      if (!snap.exists()) {
        onSession(null);
        return;
      }
      const data = snap.data();
      if (data?.status === 'idle' || !data?.status) {
        onSession(null);
        return;
      }
      onSession(data as LiveQuizSession);
    },
    (err) => {
      console.error('LiveQuiz subscribe error:', err);
      onSession(null);
    }
  );
}

/** Start a quiz session (host only). Uses first N questions from the quiz. */
export async function startQuizSession(
  sessionId: string,
  hostUid: string,
  quizId: string,
  numQuestions?: number,
  timeLimitSeconds: number = 20,
  rewardConfig?: LiveQuizRewardConfig,
  options?: StartQuizSessionOptions
): Promise<{ ok: boolean; error?: string }> {
  try {
    const quiz = await getQuizSet(quizId);
    if (!quiz) {
      return { ok: false, error: 'Quiz not found' };
    }
    const questions = await getQuestions(quizId);
    if (questions.length === 0) {
      return { ok: false, error: 'Quiz has no questions' };
    }
    const count = numQuestions ? Math.min(numQuestions, questions.length) : questions.length;
    const questionOrder = questions.slice(0, count).map((q) => q.id);

    const gameMode: LiveQuizGameMode = options?.gameMode ?? 'regular';
    const emptyBr: BattleRoyaleRuntimeState = { streaks: {}, energy: {}, strongUnlocked: {} };

    let teamBattleState: TeamBattleRoyaleRuntimeState | undefined;
    if (gameMode === 'team_battle_royale' && options?.teamBattleRoyale) {
      teamBattleState = buildTeamAssignments(
        options.teamBattleRoyale,
        options.roomPlayerUids ?? []
      );
    }

    const session: LiveQuizSession = {
      status: 'lobby',
      quizId,
      quizTitle: quiz.title,
      questionIndex: -1,
      questionOrder,
      currentQuestionId: null,
      quizRoundIndex: 0,
      questionStartedAt: null,
      questionEndsAt: null,
      timeLimitSeconds,
      hostUid,
      gameMode,
      battleRoyaleConfig: gameMode === 'battle_royale' ? options?.battleRoyale : undefined,
      teamBattleRoyaleConfig: gameMode === 'team_battle_royale' ? options?.teamBattleRoyale : undefined,
      teamBattleState,
      battleRoyaleState: isBattleQuizMode(gameMode) ? emptyBr : undefined,
      leaderboard: {},
      correctCount: {},
      rewardConfig: rewardConfig ?? undefined,
      updatedAt: serverTimestamp(),
    };

    await setDoc(sessionRef(sessionId), omitUndefinedFields(session as unknown as Record<string, unknown>) as DocumentData);
    log('Quiz session created', {
      sessionId,
      quizId,
      questionCount: questionOrder.length,
      rewardConfig: !!rewardConfig,
      gameMode,
    });
    return { ok: true };
  } catch (e) {
    log('startQuizSession error', e);
    return { ok: false, error: String(e) };
  }
}

/** Get placement reward for a 1-based rank. first=1, second=2, third=3, top5=4-5, top10=6-10. Exported for UI to show PP earned per player. */
export function getPlacementRewardForRank(
  placements: LiveQuizRewardConfig['placements'],
  rank: number
): LiveQuizPlacementReward | null {
  let key: keyof typeof placements;
  if (rank === 1) key = 'first';
  else if (rank === 2) key = 'second';
  else if (rank === 3) key = 'third';
  else if (rank === 4 || rank === 5) key = 'top5';
  else if (rank >= 6 && rank <= 10) key = 'top10';
  else return null;
  const p = placements[key];
  if (!p) return null;
  const hasReward = (p.pp > 0 || p.xp > 0 || !!(p.artifactId || p.artifactName));
  return hasReward ? p : null;
}

/** Legacy reward config (old UI shape) for backward compatibility with existing Firestore docs. */
interface LegacyRewardConfig {
  rewardTypes: { pp: boolean; xp: boolean; artifacts: boolean };
  whoReceives: { first: boolean; second: boolean; third: boolean; top5: boolean; top10: boolean };
  ppAmount: number;
  xpAmount: number;
  artifactId?: string;
  artifactName?: string;
}

function isLegacyConfig(config: LiveQuizRewardConfig | LegacyRewardConfig | undefined): config is LegacyRewardConfig {
  return !!config && 'rewardTypes' in config && 'whoReceives' in config;
}

/** Grant PP/XP/artifacts to players based on final leaderboard and session rewardConfig. Called when quiz completes. */
export async function grantLiveQuizRewards(sessionId: string): Promise<{ granted: number; error?: string }> {
  try {
    const snap = await getDoc(sessionRef(sessionId));
    if (!snap.exists()) return { granted: 0 };
    const session = snap.data() as LiveQuizSession;
    const config = session.rewardConfig as LiveQuizRewardConfig | LegacyRewardConfig | undefined;
    if (!config) return { granted: 0 };

    const leaderboard = session.leaderboard ?? {};
    const sorted = Object.entries(leaderboard)
      .map(([uid, score]) => ({ uid, score }))
      .sort((a, b) => b.score - a.score);

    let grantedCount = 0;

    if (isLegacyConfig(config)) {
      if (!config.rewardTypes.pp && !config.rewardTypes.xp && !config.rewardTypes.artifacts) return { granted: 0 };
      const rewardRanks = new Set<number>();
      if (config.whoReceives.first) rewardRanks.add(1);
      if (config.whoReceives.second) rewardRanks.add(2);
      if (config.whoReceives.third) rewardRanks.add(3);
      if (config.whoReceives.top5) for (let i = 1; i <= 5; i++) rewardRanks.add(i);
      if (config.whoReceives.top10) for (let i = 1; i <= 10; i++) rewardRanks.add(i);
      for (let i = 0; i < sorted.length; i++) {
        const rank = i + 1;
        if (!rewardRanks.has(rank)) continue;
        const { uid } = sorted[i];
        const studentRef = doc(db, 'students', uid);
        const userRef = doc(db, 'users', uid);
        const vaultRef = doc(db, 'vaults', uid);
        let didGrant = false;
        const studentUpdates: UpdateData<DocumentData> = {};
        const userUpdates: UpdateData<DocumentData> = {};
        if (config.rewardTypes.pp && config.ppAmount > 0) {
          studentUpdates.powerPoints = increment(config.ppAmount);
          userUpdates.powerPoints = increment(config.ppAmount);
          didGrant = true;
        }
        if (config.rewardTypes.xp && config.xpAmount > 0) {
          studentUpdates.xp = increment(config.xpAmount);
          userUpdates.xp = increment(config.xpAmount);
          didGrant = true;
        }
        if (config.rewardTypes.artifacts && (config.artifactId || config.artifactName)) {
          studentUpdates.inventory = arrayUnion(config.artifactName || config.artifactId || '');
          didGrant = true;
        }
        if (Object.keys(studentUpdates).length > 0) {
          const studentDoc = await getDoc(studentRef);
          if (studentDoc.exists()) await updateDoc(studentRef, studentUpdates);
        }
        if (Object.keys(userUpdates).length > 0) {
          const userDoc = await getDoc(userRef);
          if (userDoc.exists()) await updateDoc(userRef, userUpdates);
        }
        if (config.rewardTypes.pp && config.ppAmount > 0) {
          const vaultDoc = await getDoc(vaultRef);
          if (vaultDoc.exists()) {
            const v = vaultDoc.data();
            const cur = v?.currentPP ?? 0;
            const cap = v?.capacity ?? 1000;
            await updateDoc(vaultRef, { currentPP: Math.min(cap, cur + config.ppAmount) });
          }
        }
        if (didGrant) grantedCount++;
      }
      log('Live quiz rewards granted (legacy)', { sessionId, grantedCount });
      return { granted: grantedCount };
    }

    if (!('placements' in config) || !config.placements) return { granted: 0 };
    const placements = (config as LiveQuizRewardConfig).placements;

    for (let i = 0; i < sorted.length; i++) {
      const rank = i + 1;
      const reward = getPlacementRewardForRank(placements, rank);
      if (!reward) continue;
      const { uid } = sorted[i];
      const studentRef = doc(db, 'students', uid);
      const userRef = doc(db, 'users', uid);
      const vaultRef = doc(db, 'vaults', uid);
      let didGrant = false;
      const studentUpdates: UpdateData<DocumentData> = {};
      const userUpdates: UpdateData<DocumentData> = {};
      const ppAmount = reward.pp ?? 0;
      const xpAmount = reward.xp ?? 0;
      if (ppAmount > 0) {
        studentUpdates.powerPoints = increment(ppAmount);
        userUpdates.powerPoints = increment(ppAmount);
        didGrant = true;
      }
      if (xpAmount > 0) {
        studentUpdates.xp = increment(xpAmount);
        userUpdates.xp = increment(xpAmount);
        didGrant = true;
      }
      if (reward.artifactId || reward.artifactName) {
        const rawId = reward.artifactId || reward.artifactName!;
        try {
          const details = await getArtifactDetails(rawId);
          if (details.isEquippable) {
            const grantRes = await grantArtifactToPlayer(
              uid,
              details.id,
              session.hostUid,
              'Live Event quiz placement'
            );
            if (!grantRes.success) {
              log('grantLiveQuiz equippable grant failed', { uid, id: details.id, err: grantRes.error });
            }
          } else {
            const label = details.name || reward.artifactName || reward.artifactId || '';
            if (label) {
              studentUpdates.inventory = arrayUnion(label);
            }
          }
        } catch (artErr) {
          log('grantLiveQuiz artifact resolve failed', artErr);
          const fallback = reward.artifactName || reward.artifactId;
          if (fallback) {
            studentUpdates.inventory = arrayUnion(fallback);
          }
        }
        didGrant = true;
      }
      if (Object.keys(studentUpdates).length > 0) {
        const studentDoc = await getDoc(studentRef);
        if (studentDoc.exists()) await updateDoc(studentRef, studentUpdates);
      }
      if (Object.keys(userUpdates).length > 0) {
        const userDoc = await getDoc(userRef);
        if (userDoc.exists()) await updateDoc(userRef, userUpdates);
      }
      if (ppAmount > 0) {
        const vaultDoc = await getDoc(vaultRef);
        if (vaultDoc.exists()) {
          const v = vaultDoc.data();
          const cur = v?.currentPP ?? 0;
          const cap = v?.capacity ?? 1000;
          await updateDoc(vaultRef, { currentPP: Math.min(cap, cur + ppAmount) });
        }
      }
      if (didGrant) grantedCount++;
    }
    log('Live quiz rewards granted', { sessionId, grantedCount });
    return { granted: grantedCount };
  } catch (e) {
    log('grantLiveQuizRewards error', e);
    return { granted: 0, error: String(e) };
  }
}

/** Launch first question (host). */
export async function launchFirstQuestion(sessionId: string, hostUid: string): Promise<{ ok: boolean; error?: string }> {
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(sessionRef(sessionId));
    if (!snap.exists()) return { ok: false, error: 'No quiz session' };
    const session = snap.data() as LiveQuizSession;
    if (session.hostUid !== hostUid) return { ok: false, error: 'Only host can start' };
    if (session.questionOrder.length === 0) return { ok: false, error: 'No questions' };

    const questionId = session.questionOrder[0];
    const now = Date.now();
    const endsAt = now + session.timeLimitSeconds * 1000;

    tx.update(sessionRef(sessionId), {
      status: 'question_live',
      questionIndex: 0,
      currentQuestionId: questionId,
      quizRoundIndex: 1,
      questionStartedAt: now,
      questionEndsAt: endsAt,
      updatedAt: serverTimestamp(),
    });
    log('First question launched', { sessionId, questionId });
    return { ok: true };
  });
}

/** Advance to next question or finish (host). Aggregates points from current question responses into leaderboard. */
export async function advanceQuiz(
  sessionId: string,
  hostUid: string
): Promise<{ ok: boolean; error?: string; completed?: boolean }> {
  const responsesSnap = await getDocs(responsesRef(sessionId));
  const responsesForCurrentQuestion: { uid: string; data: LiveQuizResponse }[] = [];
  responsesSnap.docs.forEach((d) => {
    const r = d.data() as LiveQuizResponse;
    responsesForCurrentQuestion.push({ uid: d.id, data: r });
  });

  return runTransaction(db, async (tx) => {
    const sessionSnap = await tx.get(sessionRef(sessionId));
    const roomSnap = await tx.get(roomRef(sessionId));
    if (!sessionSnap.exists()) return { ok: false, error: 'No quiz session' };
    const session = sessionSnap.data() as LiveQuizSession;
    if (session.hostUid !== hostUid) return { ok: false, error: 'Only host can advance' };

    const mode = session.gameMode ?? 'regular';
    const battleMode = isBattleQuizMode(mode);

    const currentQId = session.currentQuestionId;
    const activeRound =
      session.quizRoundIndex ?? (session.status === 'question_live' ? 1 : 0);

    const newLeaderboard = { ...session.leaderboard };
    const newCorrectCount = { ...(session.correctCount || {}) };
    const newPerQuestionResults: { [uid: string]: LiveQuizPerQuestionResultEntry[] } = {
      ...((session.perQuestionResults as { [uid: string]: LiveQuizPerQuestionResultEntry[] } | undefined) ?? {}),
    };

    let brState: BattleRoyaleRuntimeState | undefined = session.battleRoyaleState
      ? {
          streaks: { ...session.battleRoyaleState.streaks },
          energy: { ...session.battleRoyaleState.energy },
          strongUnlocked: { ...session.battleRoyaleState.strongUnlocked },
        }
      : undefined;

    const responseMatchesRound = (r: LiveQuizResponse) => {
      if (r.currentQuestionId !== currentQId) return false;
      if (r.quizRoundIndex != null) return r.quizRoundIndex === activeRound;
      return activeRound === 1;
    };

    if (currentQId && activeRound > 0) {
      const MAX_REGULAR = 100;
      const MAX_BR = 25;
      const correctUids = new Set<string>();

      responsesForCurrentQuestion.forEach(({ uid, data: r }) => {
        if (!responseMatchesRound(r)) return;
        const existing = newPerQuestionResults[uid] || [];
        const already = existing.some((e) => {
          if (e.quizRoundIndex != null) return e.quizRoundIndex === activeRound;
          return e.questionId === currentQId;
        });
        if (already) return;

        const cap = battleMode ? MAX_BR : MAX_REGULAR;
        const points =
          typeof r.pointsAwarded === 'number' && Number.isFinite(r.pointsAwarded)
            ? Math.max(0, Math.min(cap, r.pointsAwarded))
            : 0;
        newLeaderboard[uid] = (newLeaderboard[uid] || 0) + points;
        if (r.isCorrect) {
          newCorrectCount[uid] = (newCorrectCount[uid] || 0) + 1;
          correctUids.add(uid);
        }
        newPerQuestionResults[uid] = [
          ...existing,
          {
            questionId: currentQId,
            quizRoundIndex: activeRound,
            isCorrect: r.isCorrect,
            pointsAwarded: points,
          },
        ];
      });

      if (battleMode && brState && roomSnap.exists()) {
        const players: { userId: string }[] = roomSnap.data()?.players || [];
        const inSessionUids = new Set(players.map((p) => p.userId));
        inSessionUids.forEach((uid) => {
          if (correctUids.has(uid)) return;
          brState!.streaks[uid] = 0;
        });
      }
    }

    const checkBattleEnd = (): boolean => {
      if (!battleMode || !roomSnap.exists()) return false;
      const players = (roomSnap.data()?.players || []) as Array<{ userId: string; eliminated?: boolean }>;
      const alive = players.filter((p) => !p.eliminated);
      if (mode === 'battle_royale') {
        const target = session.battleRoyaleConfig?.finalSurvivorsTarget ?? 1;
        if (alive.length <= target) return true;
      }
      if (mode === 'team_battle_royale' && session.teamBattleState?.playerTeamId) {
        const map = session.teamBattleState.playerTeamId;
        const aliveTeams = new Set(alive.map((p) => map[p.userId]).filter(Boolean));
        if (aliveTeams.size <= 1) return true;
      }
      return false;
    };

    const baseUpdate: Record<string, unknown> = {
      leaderboard: newLeaderboard,
      correctCount: newCorrectCount,
      perQuestionResults: newPerQuestionResults,
      updatedAt: serverTimestamp(),
    };
    if (battleMode && brState) {
      baseUpdate.battleRoyaleState = brState;
    }

    if (battleMode && checkBattleEnd()) {
      tx.update(sessionRef(sessionId), {
        ...baseUpdate,
        status: 'completed',
        currentQuestionId: null,
        questionStartedAt: null,
        questionEndsAt: null,
        battleEndReason: mode === 'team_battle_royale' ? 'team_elimination' : 'survivor_threshold',
      });
      log('Battle quiz completed (threshold)', { sessionId, mode });
      return { ok: true, completed: true };
    }

    const nextIndex = session.questionIndex + 1;
    const orderLen = session.questionOrder.length;
    let nextQuestionIndex: number;

    if (nextIndex >= orderLen) {
      const repeat =
        (mode === 'battle_royale' && session.battleRoyaleConfig?.autoRepeatQuestions) ||
        (mode === 'team_battle_royale' && session.teamBattleRoyaleConfig?.autoRepeatQuestions);
      if (repeat) {
        nextQuestionIndex = 0;
      } else {
        tx.update(sessionRef(sessionId), {
          ...baseUpdate,
          status: 'completed',
          questionIndex: nextIndex - 1,
          currentQuestionId: null,
          questionStartedAt: null,
          questionEndsAt: null,
          ...(battleMode ? { battleEndReason: 'manual_complete' as const } : {}),
        });
        log('Quiz completed', { sessionId });
        return { ok: true, completed: true };
      }
    } else {
      nextQuestionIndex = nextIndex;
    }

    const nextQuestionId = session.questionOrder[nextQuestionIndex];
    const now = Date.now();
    const endsAt = now + session.timeLimitSeconds * 1000;
    const nextRound = activeRound + 1;

    tx.update(sessionRef(sessionId), {
      ...baseUpdate,
      status: 'question_live',
      questionIndex: nextQuestionIndex,
      currentQuestionId: nextQuestionId,
      quizRoundIndex: nextRound,
      questionStartedAt: now,
      questionEndsAt: endsAt,
    });
    log('Advanced to question', { sessionId, nextQuestionIndex, nextQuestionId, nextRound });
    return { ok: true, completed: false };
  });
}

/** Set status to answer_reveal or leaderboard (host). */
export async function setQuizStatus(
  sessionId: string,
  hostUid: string,
  status: LiveQuizStatus
): Promise<{ ok: boolean; error?: string }> {
  try {
    const snap = await getDoc(sessionRef(sessionId));
    if (!snap.exists()) return { ok: false, error: 'No quiz session' };
    const session = snap.data() as LiveQuizSession;
    if (session.hostUid !== hostUid) return { ok: false, error: 'Only host can change status' };
    await updateDoc(sessionRef(sessionId), { status, updatedAt: serverTimestamp() });
    log('Status set', { sessionId, status });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

type SubmitQuizTxResult = {
  ok: boolean;
  error?: string;
  pointsAwarded?: number;
  isCorrect?: boolean;
  gameMode?: LiveQuizGameMode;
};

/** Submit answer (player). First answer locks; late answers rejected. Pass quizRoundIndex from the live session doc. */
export async function submitQuizResponse(
  sessionId: string,
  uid: string,
  questionId: string,
  selectedIndices: number[],
  correctIndices: number[],
  quizRoundIndexFromClient: number
): Promise<{ ok: boolean; error?: string; pointsAwarded?: number; isCorrect?: boolean }> {
  return runTransaction(db, async (tx): Promise<SubmitQuizTxResult> => {
    const sessionSnap = await tx.get(sessionRef(sessionId));
    const roomSnap = await tx.get(roomRef(sessionId));
    if (!sessionSnap.exists()) return { ok: false, error: 'No quiz session' };
    const session = sessionSnap.data() as LiveQuizSession;
    const mode = session.gameMode ?? 'regular';
    if (session.currentQuestionId !== questionId) return { ok: false, error: 'Wrong question' };
    const now = Date.now();
    const endsAt = session.questionEndsAt ?? 0;
    if (now > endsAt) return { ok: false, error: 'Time expired' };

    const activeRound = session.quizRoundIndex ?? (session.status === 'question_live' ? 1 : 0);
    if (quizRoundIndexFromClient !== activeRound) {
      return { ok: false, error: 'Stale question round' };
    }

    if (isBattleQuizMode(mode) && roomSnap.exists()) {
      const playersRoom = (roomSnap.data()?.players || []) as Array<{ userId: string; eliminated?: boolean }>;
      const pl = playersRoom.find((p) => p.userId === uid);
      if (pl?.eliminated) {
        const allow =
          mode === 'battle_royale'
            ? session.battleRoyaleConfig?.allowEliminatedQuizAnswering
            : session.teamBattleRoyaleConfig?.allowEliminatedQuizAnswering;
        if (!allow) return { ok: false, error: 'Eliminated players cannot answer' };
      }
    }

    const responseSnap = await tx.get(responseDocRef(sessionId, uid));
    if (responseSnap.exists()) {
      const existing = responseSnap.data() as LiveQuizResponse;
      if (existing.currentQuestionId === questionId) {
        const er = existing.quizRoundIndex ?? 1;
        if (er === activeRound) return { ok: false, error: 'Already answered' };
      }
    }

    const correctSet = new Set(correctIndices);
    const selectedSet = new Set(selectedIndices);
    const allCorrect =
      correctIndices.length === selectedIndices.length &&
      correctIndices.every((i) => selectedSet.has(i)) &&
      selectedIndices.every((i) => correctSet.has(i));
    const startedAt = session.questionStartedAt ?? now;

    let pointsAwarded: number;
    let brPatch: { battleRoyaleState: BattleRoyaleRuntimeState } | null = null;

    if (isBattleQuizMode(mode)) {
      const br: BattleRoyaleRuntimeState = {
        streaks: { ...(session.battleRoyaleState?.streaks || {}) },
        energy: { ...(session.battleRoyaleState?.energy || {}) },
        strongUnlocked: { ...(session.battleRoyaleState?.strongUnlocked || {}) },
      };
      const prev = br.streaks[uid] || 0;
      if (!allCorrect) {
        br.streaks[uid] = 0;
        pointsAwarded = 0;
        brPatch = { battleRoyaleState: br };
      } else {
        const { newStreak, ppAwarded, energyDelta, strongUnlockedNow } = computeBattleRoyaleStreakRewards(prev);
        br.streaks[uid] = newStreak;
        if (energyDelta) br.energy[uid] = (br.energy[uid] || 0) + energyDelta;
        if (strongUnlockedNow) br.strongUnlocked[uid] = true;
        pointsAwarded = ppAwarded;
        brPatch = { battleRoyaleState: br };
      }
    } else {
      pointsAwarded = calculateLiveQuizPoints({
        isCorrect: allCorrect,
        submittedAt: now,
        questionStartedAt: startedAt,
        questionEndsAt: endsAt,
      });
    }

    const response: LiveQuizResponse = {
      currentQuestionId: questionId,
      quizRoundIndex: activeRound,
      selectedIndices,
      submittedAt: now,
      isCorrect: allCorrect,
      pointsAwarded,
    };
    tx.set(responseDocRef(sessionId, uid), response);
    if (brPatch) {
      tx.update(sessionRef(sessionId), { ...brPatch, updatedAt: serverTimestamp() });
    }
    log('Response submitted', { sessionId, uid, questionId, isCorrect: allCorrect, pointsAwarded, mode });
    return { ok: true, pointsAwarded, isCorrect: allCorrect, gameMode: mode };
  }).then(async (result) => {
    if (!result.ok) return result;
    if (!result.isCorrect) {
      try {
        const rref = roomRef(sessionId);
        const roomSnap = await getDoc(rref);
        let displayName: string | undefined;
        if (roomSnap.exists()) {
          const players = (roomSnap.data()?.players || []) as Array<{ userId: string; displayName?: string }>;
          displayName = players.find((p) => p.userId === uid)?.displayName;
        }
        await breakParticipationStreak(sessionId, uid, displayName);
      } catch (e) {
        log('breakParticipationStreak failed', e);
      }
      return result;
    }
    const mode = result.gameMode ?? 'regular';
    const isBattle = isBattleQuizMode(mode);
    const ppDelta = isBattle ? (result.pointsAwarded ?? 0) : 1;
    let displayName: string | undefined;
    try {
      const rref = roomRef(sessionId);
      const roomSnap = await getDoc(rref);
      if (roomSnap.exists()) {
        const players = (roomSnap.data()?.players || []) as Array<{ userId: string; displayName?: string }>;
        displayName = players.find((p) => p.userId === uid)?.displayName;
      }
    } catch {
      /* ignore */
    }
    await trackParticipation(sessionId, uid, ppDelta, { playerDisplayName: displayName });
    try {
      const rref = roomRef(sessionId);
      const roomSnap = await getDoc(rref);
      const qSnap = await getDoc(sessionRef(sessionId));
      const energy =
        isBattle && qSnap.exists()
          ? (qSnap.data() as LiveQuizSession).battleRoyaleState?.energy?.[uid]
          : undefined;
      if (roomSnap.exists()) {
        const data = roomSnap.data();
        const players: Array<{
          userId: string;
          participationCount?: number;
          movesEarned?: number;
          brEnergy?: number;
          [k: string]: unknown;
        }> = data?.players ?? [];
        const idx = players.findIndex((p) => p.userId === uid);
        if (idx >= 0) {
          const p = players[idx];
          const updatedPlayers = [...players];
          updatedPlayers[idx] = {
            ...p,
            participationCount: (p.participationCount ?? 0) + ppDelta,
            movesEarned: (p.movesEarned ?? 0) + ppDelta,
            ...(typeof energy === 'number' ? { brEnergy: energy } : {}),
          };
          await updateDoc(rref, {
            players: updatedPlayers,
            updatedAt: serverTimestamp(),
          });
          log('Session player PP from quiz', { sessionId, uid, ppDelta, isBattle });
        }
      }
    } catch (err) {
      log('Failed to update session player participation for quiz correct', err);
    }
    try {
      const qSnap = await getDoc(sessionRef(sessionId));
      const sess = qSnap.exists() ? qSnap.data() : null;
      const end = sess?.questionEndsAt ?? Date.now();
      const start = sess?.questionStartedAt ?? Date.now();
      const span = Math.max(1, end - start);
      const speedRatio = 1 - Math.min(1, Math.max(0, (Date.now() - start) / span));
      await awardPowerXpForLiveQuizCorrectAnswer(sessionId, uid, {
        gameMode: mode,
        pointsAwarded: result.pointsAwarded ?? 0,
        speedRatio,
      });
    } catch (e) {
      log('Power XP drip (quiz) skipped', e);
    }
    return result;
  });
}

/** Get current response for a player (for their own display). */
export async function getMyResponse(sessionId: string, uid: string): Promise<LiveQuizResponse | null> {
  const snap = await getDoc(responseDocRef(sessionId, uid));
  if (!snap.exists()) return null;
  return snap.data() as LiveQuizResponse;
}

/** Subscribe to response count for host (how many answered current question). */
export function subscribeResponseCount(
  sessionId: string,
  currentQuestionId: string | null,
  onCount: (count: number) => void,
  quizRoundIndex?: number | null
): () => void {
  if (!currentQuestionId) {
    onCount(0);
    return () => {};
  }
  return onSnapshot(responsesRef(sessionId), (snap) => {
    let count = 0;
    snap.docs.forEach((d) => {
      const r = d.data() as LiveQuizResponse;
      if (r.currentQuestionId !== currentQuestionId) return;
      if (quizRoundIndex != null && quizRoundIndex > 0) {
        const rr = r.quizRoundIndex ?? 1;
        if (rr !== quizRoundIndex) return;
      }
      count++;
    });
    onCount(count);
  });
}

export type BrQuickActionId = 'attack' | 'shield' | 'heal' | 'control' | 'strong';

const BR_PP_COST: Record<BrQuickActionId, number> = {
  attack: 1,
  shield: 1,
  heal: 2,
  control: 2,
  strong: 3,
};

/**
 * Lightweight BR / Team BR combat using Participation Points (movesEarned) and optional Energy / streak unlock for strong.
 */
export async function submitBattleRoyaleQuickAction(
  sessionId: string,
  actorUid: string,
  actorName: string,
  action: BrQuickActionId,
  targetUid: string,
  targetName: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    return await runTransaction(db, async (tx) => {
      const qRef = sessionRef(sessionId);
      const rRef = roomRef(sessionId);
      const qSnap = await tx.get(qRef);
      const roomSnap = await tx.get(rRef);
      if (!qSnap.exists() || !roomSnap.exists()) return { ok: false, error: 'Session not found' };
      const quiz = qSnap.data() as LiveQuizSession;
      const mode = quiz.gameMode ?? 'regular';
      if (!isBattleQuizMode(mode)) return { ok: false, error: 'Not a battle quiz mode' };

      const roomData = roomSnap.data();
      const players = [...((roomData?.players || []) as Record<string, unknown>[])];
      const battleLog: string[] = [...(roomData?.battleLog || [])];

      const aIdx = players.findIndex((p) => (p as { userId: string }).userId === actorUid);
      const tIdx = players.findIndex((p) => (p as { userId: string }).userId === targetUid);
      if (aIdx < 0) return { ok: false, error: 'Actor not in session' };
      if (tIdx < 0) return { ok: false, error: 'Target not in session' };

      const actor = { ...(players[aIdx] as Record<string, unknown>) } as {
        userId: string;
        eliminated?: boolean;
        movesEarned?: number;
        hp?: number;
        maxHp?: number;
        shield?: number;
        maxShield?: number;
        level?: number;
      };
      const target = { ...(players[tIdx] as Record<string, unknown>) } as typeof actor & {
        eliminatedBy?: string;
      };

      if (actor.eliminated) return { ok: false, error: 'You are eliminated' };
      if (target.eliminated && action !== 'heal') return { ok: false, error: 'Target eliminated' };

      if (action === 'heal' && mode === 'team_battle_royale' && quiz.teamBattleRoyaleConfig?.supportAlliesEnabled) {
        const map = quiz.teamBattleState?.playerTeamId || {};
        const same = map[actorUid] && map[actorUid] === map[targetUid];
        const self = actorUid === targetUid;
        if (!same && !self) return { ok: false, error: 'Heal only yourself or allies' };
      }

      const cost = BR_PP_COST[action];
      if ((actor.movesEarned ?? 0) < cost) return { ok: false, error: 'Not enough Participation Points' };

      const br: BattleRoyaleRuntimeState = {
        streaks: { ...(quiz.battleRoyaleState?.streaks || {}) },
        energy: { ...(quiz.battleRoyaleState?.energy || {}) },
        strongUnlocked: { ...(quiz.battleRoyaleState?.strongUnlocked || {}) },
      };

      if (action === 'strong') {
        const e = br.energy[actorUid] || 0;
        if (e >= 1) {
          br.energy[actorUid] = e - 1;
        } else if (br.strongUnlocked[actorUid]) {
          br.strongUnlocked[actorUid] = false;
        } else {
          return { ok: false, error: 'Strong move needs 1 Energy or a 7-streak unlock' };
        }
      }

      const initP = (p: typeof actor) => {
        if (p.maxHp == null) p.maxHp = Math.max(100, (p.level || 1) * 10);
        if (p.hp == null) p.hp = p.maxHp;
        if (p.maxShield == null) p.maxShield = 100;
        if (p.shield == null) p.shield = p.maxShield;
      };
      initP(actor);
      initP(target);

      actor.movesEarned = Math.max(0, (actor.movesEarned ?? 0) - cost);

      let msg = '';
      if (action === 'attack') {
        const d = computeDamageAfterShield(target.hp || 0, target.shield || 0, 26);
        target.hp = d.hp;
        target.shield = d.shield;
        msg = `⚔️ ${actorName} struck ${targetName} (BR Attack)`;
      } else if (action === 'control') {
        const d = computeDamageAfterShield(target.hp || 0, target.shield || 0, 18);
        target.hp = d.hp;
        target.shield = d.shield;
        msg = `🌀 ${actorName} disrupted ${targetName} (Control)`;
      } else if (action === 'strong') {
        const d = computeDamageAfterShield(target.hp || 0, target.shield || 0, 44);
        target.hp = d.hp;
        target.shield = d.shield;
        msg = `💥 ${actorName} hit ${targetName} with a STRONG move!`;
      } else if (action === 'shield') {
        if (targetUid !== actorUid) return { ok: false, error: 'Shield targets yourself' };
        actor.shield = Math.min(actor.maxShield || 100, (actor.shield || 0) + 38);
        msg = `🛡️ ${actorName} reinforced shields`;
      } else if (action === 'heal') {
        target.hp = Math.min(target.maxHp || 100, (target.hp || 0) + 28);
        msg = `💚 ${actorName} healed ${targetName}`;
      }

      const targetTotal = (target.hp || 0) + (target.shield || 0);
      if (targetTotal <= 0 && !target.eliminated) {
        target.eliminated = true;
        target.eliminatedBy = actorUid;
        battleLog.push(
          actorUid !== targetUid
            ? `☠️ ${targetName} eliminated by ${actorName}!`
            : `☠️ ${targetName} has been ELIMINATED!`
        );
        Promise.resolve().then(() => {
          trackElimination(sessionId, actorUid, targetUid).catch(() => {});
        });
      }

      players[aIdx] = actor as Record<string, unknown>;
      players[tIdx] = target as Record<string, unknown>;
      battleLog.push(msg);

      tx.update(rRef, {
        players,
        battleLog,
        updatedAt: serverTimestamp(),
      });
      tx.update(qRef, {
        battleRoyaleState: br,
        updatedAt: serverTimestamp(),
      });

      return { ok: true };
    });
  } catch (e) {
    log('submitBattleRoyaleQuickAction error', e);
    return { ok: false, error: String(e) };
  }
}

/** End quiz early (host). */
export async function endQuizSession(sessionId: string, hostUid: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const snap = await getDoc(sessionRef(sessionId));
    if (!snap.exists()) return { ok: false, error: 'No quiz session' };
    const session = snap.data() as LiveQuizSession;
    if (session.hostUid !== hostUid) return { ok: false, error: 'Only host can end quiz' };
    const mode = session.gameMode ?? 'regular';
    const patch: UpdateData<DocumentData> = {
      status: 'completed',
      currentQuestionId: null,
      questionStartedAt: null,
      questionEndsAt: null,
      updatedAt: serverTimestamp(),
      ...(isBattleQuizMode(mode) ? { battleEndReason: 'host' as const } : {}),
    };
    await updateDoc(sessionRef(sessionId), patch);
    log('Quiz ended by host', { sessionId });
    await grantLiveQuizRewards(sessionId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Clear quiz session (set to idle) so UI returns to battle mode. Host only. */
export async function clearQuizSession(sessionId: string, hostUid: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const snap = await getDoc(sessionRef(sessionId));
    if (!snap.exists()) return { ok: true };
    const session = snap.data() as LiveQuizSession;
    if (session.hostUid !== hostUid) return { ok: false, error: 'Only host can clear' };
    await updateDoc(sessionRef(sessionId), {
      status: 'idle',
      updatedAt: serverTimestamp(),
    });
    log('Quiz session cleared', { sessionId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
