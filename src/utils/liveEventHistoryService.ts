/**
 * Live Event History — persist completed sessions for Admin analytics.
 * Captures existing finalize/quiz/room state; does not re-run reward math.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { SessionStats, SessionSummary } from '../types/inSessionStats';
import type { LiveQuizSession } from '../types/liveQuiz';
import type {
  LiveEventHistoryListFilters,
  LiveEventMoveUsageAggregate,
  LiveEventOverviewMetrics,
  LiveEventParticipantRecord,
  LiveEventQuestionRecord,
  LiveEventSessionRecord,
  LiveEventSettingsSnapshot,
  LiveEventSkillAggregate,
  LiveEventTimelineEntry,
} from '../types/liveEventHistory';
import { getQuestions } from './trainingGroundsService';
import { enrichAnswersWithSkills, recordSkillEvidenceFromAttempt } from './masteryService';
import { listAcademicSkills } from './academicSkillService';
import type { TrainingAnswer } from '../types/trainingGrounds';

const COLLECTION = 'liveEventSessions';
const HIGH_MISS_MIN_RESPONSES = 8;
const HIGH_MISS_ACCURACY = 0.4;
const TIMELINE_PREVIEW_MAX = 40;
const TIMELINE_STORE_MAX = 400;
const BATCH_LIMIT = 400;

function sessionRef(sessionId: string) {
  return doc(db, COLLECTION, sessionId);
}

function participantsCol(sessionId: string) {
  return collection(db, COLLECTION, sessionId, 'participants');
}

function questionsCol(sessionId: string) {
  return collection(db, COLLECTION, sessionId, 'questions');
}

function timelineCol(sessionId: string) {
  return collection(db, COLLECTION, sessionId, 'timeline');
}

function toMs(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' || value instanceof Date) {
    const n = new Date(value).getTime();
    return Number.isFinite(n) ? n : null;
  }
  const t = value as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === 'function') {
    try {
      return t.toMillis();
    } catch {
      return null;
    }
  }
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  return null;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && typeof (v as { toMillis?: unknown }).toMillis !== 'function') {
      const nested = stripUndefined(v as Record<string, unknown>);
      if (Object.keys(nested).length > 0) out[k] = nested;
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export function resolveLiveEventHistoryType(
  room: Record<string, unknown>,
  quizSession: LiveQuizSession | null
): string {
  const gameMode = quizSession?.gameMode;
  if (gameMode === 'battle_royale') return 'battle_royale';
  if (gameMode === 'team_battle_royale') return 'team_battle_royale';
  if (gameMode === 'regular') return 'quiz';

  const mode = String(room.liveEventMode || room.mode || '').toLowerCase();
  if (mode.includes('exam')) return 'exam';
  if (mode.includes('reflect')) return 'reflection';
  if (mode.includes('goal')) return 'goals';
  if (mode.includes('neutral')) return 'neutral_flow';
  if (mode.includes('class_flow') || mode === 'class-flow') return 'class_flow';
  if (quizSession?.quizId) return 'quiz';
  return mode || 'unknown';
}

function eventDisplayName(
  eventType: string,
  room: Record<string, unknown>,
  quizSession: LiveQuizSession | null
): string {
  const quizTitle =
    quizSession?.quizTitle ||
    (room.lastQuizAwardsSnapshot as { quizTitle?: string } | undefined)?.quizTitle;
  const className = String(room.className || 'Class');
  const typeLabel = eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  if (quizTitle) return `${typeLabel} — ${quizTitle}`;
  return `${typeLabel} — ${className}`;
}

function buildSettingsSnapshot(
  room: Record<string, unknown>,
  quizSession: LiveQuizSession | null
): LiveEventSettingsSnapshot {
  return stripUndefined({
    liveEventMode: room.liveEventMode as string | undefined,
    neutralFlowEnergyType: room.neutralFlowEnergyType as string | undefined,
    gameMode: quizSession?.gameMode,
    quizId: quizSession?.quizId,
    quizTitle: quizSession?.quizTitle,
    timeLimitSeconds: quizSession?.timeLimitSeconds,
    battleRoyaleConfig: quizSession?.battleRoyaleConfig as Record<string, unknown> | undefined,
    teamBattleRoyaleConfig: quizSession?.teamBattleRoyaleConfig as Record<string, unknown> | undefined,
    rewardConfig: quizSession?.rewardConfig as Record<string, unknown> | undefined,
    inviteAllClasses: room.inviteAllClasses as boolean | undefined,
    classIds: Array.isArray(room.classIds) ? (room.classIds as string[]) : undefined,
    examConfig: room.examConfig as Record<string, unknown> | undefined,
  });
}

function parseBattleLogTimeline(battleLog: unknown, startedAtMs: number | null): LiveEventTimelineEntry[] {
  if (!Array.isArray(battleLog)) return [];
  const entries: LiveEventTimelineEntry[] = [];
  let i = 0;
  for (const raw of battleLog) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const label = raw.trim().slice(0, 240);
    let category: LiveEventTimelineEntry['category'] = 'other';
    const lower = label.toLowerCase();
    if (lower.includes('joined') || lower.includes('join')) category = 'join';
    else if (lower.includes('question') || lower.includes('quiz')) category = 'question';
    else if (lower.includes('eliminat') || lower.includes('damage') || lower.includes('used ') || lower.includes('cast'))
      category = 'battle';
    else if (lower.includes('pp') || lower.includes('reward') || lower.includes('xp')) category = 'reward';
    else if (lower.includes('disconnect') || lower.includes('reconnect')) category = 'tech';
    else if (lower.includes('live event') || lower.includes('started') || lower.includes('ended')) category = 'system';

    entries.push({
      id: `bl_${i}`,
      atMs: startedAtMs != null ? startedAtMs + i * 1000 : i,
      label,
      category,
    });
    i += 1;
    if (entries.length >= TIMELINE_STORE_MAX) break;
  }
  return entries;
}

function aggregateSkillsFromUsage(statsMap: Record<string, SessionStats>): LiveEventMoveUsageAggregate[] {
  const map = new Map<string, LiveEventMoveUsageAggregate>();
  for (const stats of Object.values(statsMap)) {
    for (const s of stats.skillsUsed || []) {
      const key = s.skillId || s.skillName;
      if (!key) continue;
      const cur = map.get(key) || {
        moveId: s.skillId || key,
        moveName: s.skillName || key,
        moveType: s.energyType,
        uses: 0,
        totalDamage: 0,
        totalHealing: 0,
      };
      cur.uses += s.count || 0;
      cur.totalDamage = (cur.totalDamage || 0) + (s.totalDamage || 0);
      cur.totalHealing = (cur.totalHealing || 0) + (s.totalHealing || 0);
      map.set(key, cur);
    }
  }
  return Array.from(map.values())
    .map((m) => {
      const value = (m.totalDamage || 0) + (m.totalHealing || 0) + (m.totalShield || 0);
      return {
        ...m,
        effectivenessPerUse: m.uses > 0 ? Math.round((value / m.uses) * 10) / 10 : undefined,
      };
    })
    .sort((a, b) => b.uses - a.uses);
}

function isBattleEventType(eventType: string): boolean {
  return eventType === 'battle_royale' || eventType === 'team_battle_royale' || eventType === 'class_flow';
}

async function loadQuizSession(sessionId: string): Promise<LiveQuizSession | null> {
  try {
    const snap = await getDoc(doc(db, 'inSessionRooms', sessionId, 'quizSession', 'current'));
    if (!snap.exists()) return null;
    return snap.data() as LiveQuizSession;
  } catch {
    return null;
  }
}

async function buildQuestionAndSkillAnalytics(
  quizSession: LiveQuizSession | null,
  participantCount: number
): Promise<{
  questions: LiveEventQuestionRecord[];
  skills: LiveEventSkillAggregate[];
  skillNameById: Record<string, string>;
}> {
  const empty = { questions: [] as LiveEventQuestionRecord[], skills: [] as LiveEventSkillAggregate[], skillNameById: {} as Record<string, string> };
  if (!quizSession?.quizId || !Array.isArray(quizSession.questionOrder) || quizSession.questionOrder.length === 0) {
    return empty;
  }

  let bankQuestions: Awaited<ReturnType<typeof getQuestions>> = [];
  let skillNameById: Record<string, string> = {};
  try {
    bankQuestions = await getQuestions(quizSession.quizId);
  } catch {
    bankQuestions = [];
  }
  try {
    const skills = await listAcademicSkills({ activeOnly: false });
    skillNameById = Object.fromEntries(skills.map((s) => [s.id, s.name]));
  } catch {
    skillNameById = {};
  }

  const byId = new Map(bankQuestions.map((q) => [q.id, q]));
  const per = quizSession.perQuestionResults || {};
  const allResults = Object.values(per).flat();

  const qAgg = new Map<
    string,
    { correct: number; incorrect: number; answered: number; orderIndex: number }
  >();

  quizSession.questionOrder.forEach((qid, idx) => {
    qAgg.set(qid, { correct: 0, incorrect: 0, answered: 0, orderIndex: idx });
  });

  for (const row of allResults) {
    const cur = qAgg.get(row.questionId) || {
      correct: 0,
      incorrect: 0,
      answered: 0,
      orderIndex: quizSession.questionOrder.indexOf(row.questionId),
    };
    cur.answered += 1;
    if (row.isCorrect) cur.correct += 1;
    else cur.incorrect += 1;
    qAgg.set(row.questionId, cur);
  }

  const questions: LiveEventQuestionRecord[] = Array.from(qAgg.entries()).map(([questionId, agg]) => {
    const q = byId.get(questionId);
    const unanswered = Math.max(0, participantCount - agg.answered);
    const accuracy = agg.answered > 0 ? agg.correct / agg.answered : 0;
    const skillIds = Array.isArray(q?.skillIds) ? [...q!.skillIds!] : [];
    return stripUndefined({
      questionId,
      prompt: q?.prompt?.slice(0, 200),
      difficulty: q?.difficulty,
      skillIds,
      skillNames: skillIds.map((id) => skillNameById[id] || id),
      orderIndex: agg.orderIndex,
      studentsAnswered: agg.answered,
      correct: agg.correct,
      incorrect: agg.incorrect,
      unanswered,
      accuracy: Math.round(accuracy * 1000) / 10,
      highMiss: agg.answered >= HIGH_MISS_MIN_RESPONSES && accuracy < HIGH_MISS_ACCURACY,
    }) as LiveEventQuestionRecord;
  });

  const skillAgg = new Map<string, { correct: number; incorrect: number; responses: number }>();
  for (const qr of questions) {
    for (const sid of qr.skillIds || []) {
      const cur = skillAgg.get(sid) || { correct: 0, incorrect: 0, responses: 0 };
      cur.correct += qr.correct;
      cur.incorrect += qr.incorrect;
      cur.responses += qr.studentsAnswered;
      skillAgg.set(sid, cur);
    }
  }

  const skills: LiveEventSkillAggregate[] = Array.from(skillAgg.entries())
    .map(([skillId, a]) => ({
      skillId,
      skillName: skillNameById[skillId],
      correct: a.correct,
      incorrect: a.incorrect,
      responses: a.responses,
      accuracy: a.responses > 0 ? Math.round((a.correct / a.responses) * 1000) / 10 : 0,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);

  return { questions, skills, skillNameById };
}

function buildParticipantRecords(
  summary: SessionSummary,
  quizSession: LiveQuizSession | null,
  room: Record<string, unknown>,
  eventType: string
): LiveEventParticipantRecord[] {
  const players = (Array.isArray(room.players) ? room.players : []) as Array<{
    userId?: string;
    displayName?: string;
    level?: number;
    teamId?: string;
  }>;
  const playerById = new Map(players.map((p) => [p.userId || '', p]));
  const ranks = summary.liveEventQuizRankByPlayer || {};
  const quizPp = summary.quizPpByPlayer || {};
  const powerGains = summary.liveEventPowerGains || {};
  const quizPlayers = summary.sessionActivity?.quiz?.players || [];
  const quizById = new Map(quizPlayers.map((p) => [p.playerId, p]));
  const correctCount = quizSession?.correctCount || {};
  const leaderboard = quizSession?.leaderboard || {};
  const perQ = quizSession?.perQuestionResults || {};
  const questionTotal = quizSession?.questionOrder?.length || 0;
  const battle = isBattleEventType(eventType) || Object.values(summary.stats).some((s) => (s.eliminations || 0) > 0 || (s.damageDealt || 0) > 0);

  return Object.entries(summary.stats).map(([userId, stats]) => {
    const p = playerById.get(userId);
    const qp = quizById.get(userId);
    const rows = perQ[userId] || [];
    const questionsCorrect =
      correctCount[userId] ??
      qp?.correctAnswers ??
      rows.filter((r) => r.isCorrect).length;
    const questionsAnswered = rows.length > 0 ? rows.length : questionsCorrect > 0 ? questionTotal : undefined;
    const questionsSeen = questionTotal > 0 ? questionTotal : questionsAnswered;
    const questionsIncorrect =
      questionsAnswered != null ? Math.max(0, questionsAnswered - questionsCorrect) : undefined;
    const questionsUnanswered =
      questionsSeen != null && questionsAnswered != null
        ? Math.max(0, questionsSeen - questionsAnswered)
        : undefined;
    const accuracy =
      questionsAnswered && questionsAnswered > 0
        ? Math.round((questionsCorrect / questionsAnswered) * 1000) / 10
        : undefined;

    const bpPending = Math.max(0, Math.floor(Number(stats.sessionEndBattlePassXpPending) || 0));
    const power = powerGains[userId];
    const xpFromPower = power
      ? Object.values(power).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0)
      : undefined;

    const elemental = (stats.skillsUsed || [])
      .filter((s) => {
        const e = (s.energyType || '').toLowerCase();
        return e && !e.includes('manifest');
      })
      .reduce((n, s) => n + (s.count || 0), 0);
    const manifest = (stats.skillsUsed || [])
      .filter((s) => (s.energyType || '').toLowerCase().includes('manifest'))
      .reduce((n, s) => n + (s.count || 0), 0);

    const base: LiveEventParticipantRecord = stripUndefined({
      userId,
      playerName: stats.playerName || p?.displayName || userId,
      levelSnapshot: typeof p?.level === 'number' ? p.level : undefined,
      teamId: p?.teamId,
      placement: ranks[userId] ?? qp?.rankByScore,
      score: leaderboard[userId] ?? qp?.leaderboardScore,
      questionsSeen,
      questionsAnswered,
      questionsCorrect: questionsAnswered != null || questionsCorrect > 0 ? questionsCorrect : undefined,
      questionsIncorrect,
      questionsUnanswered,
      accuracy,
      ppEarned: typeof stats.ppEarned === 'number' ? stats.ppEarned : undefined,
      quizPp: quizPp[userId],
      xpEarned: xpFromPower,
      battlePassXpEarned: bpPending > 0 ? bpPending : undefined,
      completedEvent: !stats.isEliminated || questionsAnswered != null,
      rewardsAudit: stripUndefined({
        pp:
          (stats.ppEarned || 0) + (quizPp[userId] || 0) > 0
            ? (stats.ppEarned || 0) + (quizPp[userId] || 0)
            : undefined,
        xp: xpFromPower,
        battlePassXp: bpPending > 0 ? bpPending : undefined,
      }),
    }) as LiveEventParticipantRecord;

    if (battle) {
      Object.assign(
        base,
        stripUndefined({
          damageDealt: stats.damageDealt || undefined,
          damageTaken: stats.damageTaken || undefined,
          healingDone: stats.healingGiven || undefined,
          healingReceived: stats.healingReceived || undefined,
          eliminations: stats.eliminations || undefined,
          isEliminated: stats.isEliminated || undefined,
          timesEliminated: stats.isEliminated ? 1 : undefined,
          skillsUsed: stats.skillsUsed?.length ? stats.skillsUsed : undefined,
          totalSkillsUsed: stats.totalSkillsUsed || undefined,
          elementalMovesUsed: elemental || undefined,
          manifestMovesUsed: manifest || undefined,
          longestStreak: stats.consecutiveParticipationAwards || undefined,
        })
      );
    }

    return base;
  });
}

function buildOverview(
  participants: LiveEventParticipantRecord[],
  summary: SessionSummary,
  skills: LiveEventSkillAggregate[],
  eventType: string,
  assignedCount: number
): LiveEventOverviewMetrics {
  const withAcc = participants.filter((p) => typeof p.accuracy === 'number');
  const avgAcc =
    withAcc.length > 0
      ? Math.round((withAcc.reduce((s, p) => s + (p.accuracy || 0), 0) / withAcc.length) * 10) / 10
      : undefined;
  const completed = participants.filter((p) => p.completedEvent !== false).length;
  const joined = participants.length;
  const battle = isBattleEventType(eventType);

  const strongest = [...skills].sort((a, b) => b.accuracy - a.accuracy)[0];
  const weakest = [...skills].sort((a, b) => a.accuracy - b.accuracy)[0];

  return stripUndefined({
    averageAccuracy: avgAcc,
    completionRate: joined > 0 ? Math.round((completed / joined) * 1000) / 10 : undefined,
    participationRate:
      assignedCount > 0 ? Math.round((joined / assignedCount) * 1000) / 10 : undefined,
    questionCount: undefined,
    totalDamage: battle
      ? participants.reduce((s, p) => s + (p.damageDealt || 0), 0) || undefined
      : undefined,
    totalDamageTaken: battle
      ? participants.reduce((s, p) => s + (p.damageTaken || 0), 0) || undefined
      : undefined,
    totalHealing: battle
      ? participants.reduce((s, p) => s + (p.healingDone || 0), 0) || undefined
      : undefined,
    totalEliminations: battle
      ? participants.reduce((s, p) => s + (p.eliminations || 0), 0) || undefined
      : undefined,
    totalMovesUsed: battle
      ? participants.reduce((s, p) => s + (p.totalSkillsUsed || 0), 0) || undefined
      : undefined,
    totalPpSpent: battle
      ? Object.values(summary.stats).reduce((s, st) => s + (st.ppSpent || 0), 0) || undefined
      : undefined,
    totalPpAwarded:
      participants.reduce((s, p) => s + (p.ppEarned || 0) + (p.quizPp || 0), 0) || undefined,
    totalXpAwarded: participants.reduce((s, p) => s + (p.xpEarned || 0), 0) || undefined,
    totalBattlePassXp: participants.reduce((s, p) => s + (p.battlePassXpEarned || 0), 0) || undefined,
    studentsAssigned: assignedCount || undefined,
    studentsJoined: joined || undefined,
    studentsCompleted: completed || undefined,
    studentsNeverJoined: assignedCount > 0 ? Math.max(0, assignedCount - joined) : undefined,
    strongestSkillId: strongest?.skillId,
    strongestSkillName: strongest?.skillName,
    strongestSkillAccuracy: strongest?.accuracy,
    weakestSkillId: weakest?.skillId,
    weakestSkillName: weakest?.skillName,
    weakestSkillAccuracy: weakest?.accuracy,
  }) as LiveEventOverviewMetrics;
}

export function buildLiveEventInsights(
  record: Pick<LiveEventSessionRecord, 'overview' | 'eventType' | 'participantCount'>,
  questions: LiveEventQuestionRecord[],
  skills: LiveEventSkillAggregate[]
): string[] {
  const insights: string[] = [];
  const o = record.overview || {};

  if (typeof o.studentsAssigned === 'number' && typeof o.studentsJoined === 'number') {
    insights.push(
      `${o.studentsJoined} of ${o.studentsAssigned} assigned students joined (${o.participationRate ?? '—'}% participation).`
    );
  }
  if (typeof o.averageAccuracy === 'number') {
    insights.push(`Class average accuracy was ${o.averageAccuracy}%.`);
  }
  if (o.weakestSkillName && typeof o.weakestSkillAccuracy === 'number') {
    insights.push(
      `${o.weakestSkillName} was the lowest-performing skill at ${o.weakestSkillAccuracy}%.`
    );
  }
  const highMiss = questions.filter((q) => q.highMiss).sort((a, b) => a.accuracy - b.accuracy)[0];
  if (highMiss) {
    const label = highMiss.prompt ? highMiss.prompt.slice(0, 60) : highMiss.questionId;
    insights.push(
      `Question "${label}" had the lowest accuracy at ${highMiss.accuracy}% (${highMiss.studentsAnswered} responses).`
    );
  }
  if (typeof o.studentsLeftEarly === 'number' && o.studentsLeftEarly > 0) {
    insights.push(`${o.studentsLeftEarly} participants left before completing the event.`);
  }
  if (isBattleEventType(record.eventType)) {
    const elem = skills; // placeholder not used
    void elem;
    if (typeof o.totalMovesUsed === 'number') {
      insights.push(`Players used ${o.totalMovesUsed} battle moves with ${o.totalEliminations ?? 0} eliminations.`);
    }
  }
  if (typeof o.disconnectEvents === 'number' && o.disconnectEvents > 0) {
    insights.push(
      `${o.disconnectEvents} disconnect events affected ${o.affectedPlayersByDisconnect ?? 0} players.`
    );
  }
  if (skills.length >= 2) {
    const best = [...skills].sort((a, b) => b.accuracy - a.accuracy)[0];
    const worst = [...skills].sort((a, b) => a.accuracy - b.accuracy)[0];
    if (best && worst && best.skillId !== worst.skillId) {
      const gap = Math.round((best.accuracy - worst.accuracy) * 10) / 10;
      insights.push(
        `Largest skill gap: ${best.skillName || best.skillId} (${best.accuracy}%) vs ${worst.skillName || worst.skillId} (${worst.accuracy}%) — ${gap} percentage points.`
      );
    }
  }
  return insights.slice(0, 12);
}

/**
 * Create or refresh a live stub when a room starts (optional).
 */
export async function upsertLiveEventSessionStub(
  sessionId: string,
  room: Record<string, unknown>
): Promise<void> {
  const classIds = Array.isArray(room.classIds)
    ? (room.classIds as string[]).filter(Boolean)
    : room.classId
      ? [String(room.classId)]
      : [];
  const eventType = resolveLiveEventHistoryType(room, null);
  const payload = stripUndefined({
    eventSessionId: sessionId,
    eventId: sessionId,
    eventType,
    eventName: eventDisplayName(eventType, room, null),
    hostId: String(room.hostUid || room.teacherId || ''),
    hostName: undefined,
    classId: String(room.classId || classIds[0] || ''),
    classIds,
    className: String(room.className || ''),
    startedAt: room.startedAt || room.createdAt || serverTimestamp(),
    participantCount: Array.isArray(room.players) ? room.players.length : 0,
    status: 'live' as const,
    settingsSnapshot: buildSettingsSnapshot(room, null),
    overview: {},
    sourceRoomId: sessionId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(sessionRef(sessionId), payload, { merge: true });
}

/**
 * Archive a completed Live Event from finalize output + room/quiz state.
 * Idempotent for mastery via masteryAppliedAt.
 */
export async function archiveLiveEventSession(
  sessionId: string,
  summary: SessionSummary,
  roomData?: Record<string, unknown>
): Promise<LiveEventSessionRecord | null> {
  try {
    const roomSnap = roomData
      ? null
      : await getDoc(doc(db, 'inSessionRooms', sessionId));
    const room = (roomData || (roomSnap?.exists() ? roomSnap.data() : {}) || {}) as Record<string, unknown>;

    const quizSession = await loadQuizSession(sessionId);
    const eventType = resolveLiveEventHistoryType(room, quizSession);
    const classIds = Array.isArray(room.classIds)
      ? (room.classIds as string[]).filter(Boolean)
      : summary.classId
        ? [summary.classId]
        : room.classId
          ? [String(room.classId)]
          : [];

    let assignedCount = 0;
    try {
      if (classIds.length === 1) {
        const c = await getDoc(doc(db, 'classrooms', classIds[0]));
        if (c.exists()) {
          const students = (c.data().students as string[]) || [];
          assignedCount = students.filter(Boolean).length;
        }
      } else if (classIds.length > 1) {
        const ids = new Set<string>();
        for (const cid of classIds.slice(0, 8)) {
          const c = await getDoc(doc(db, 'classrooms', cid));
          if (c.exists()) {
            for (const s of ((c.data().students as string[]) || []).filter(Boolean)) ids.add(s);
          }
        }
        assignedCount = ids.size;
      }
    } catch {
      assignedCount = 0;
    }

    const participants = buildParticipantRecords(summary, quizSession, room, eventType);
    const { questions, skills } = await buildQuestionAndSkillAnalytics(
      quizSession,
      participants.length
    );

    const overview = buildOverview(participants, summary, skills, eventType, assignedCount);
    if (quizSession?.questionOrder?.length) {
      overview.questionCount = quizSession.questionOrder.length;
    }

    const startedAtMs = toMs(summary.startedAt) ?? toMs(room.startedAt) ?? toMs(room.createdAt);
    const timeline = parseBattleLogTimeline(room.battleLog, startedAtMs);
    const timelinePreview = [
      ...timeline.slice(0, Math.floor(TIMELINE_PREVIEW_MAX / 2)),
      ...timeline.slice(-Math.ceil(TIMELINE_PREVIEW_MAX / 2)),
    ];

    const moveUsage = aggregateSkillsFromUsage(summary.stats);
    const winnerIds = Object.entries(summary.liveEventQuizRankByPlayer || {})
      .filter(([, r]) => Number(r) === 1)
      .map(([id]) => id);
    if (winnerIds.length === 0 && summary.mvpPlayerId) winnerIds.push(summary.mvpPlayerId);
    const winnerNames = winnerIds
      .map((id) => participants.find((p) => p.userId === id)?.playerName)
      .filter(Boolean) as string[];

    const draft: LiveEventSessionRecord = {
      eventSessionId: sessionId,
      eventId: sessionId,
      eventType,
      eventName: eventDisplayName(eventType, room, quizSession),
      hostId: String(room.hostUid || room.teacherId || ''),
      classId: summary.classId || String(room.classId || classIds[0] || ''),
      classIds,
      className: summary.className || String(room.className || ''),
      quizId: quizSession?.quizId,
      cfuId: quizSession?.quizId,
      quizTitle: quizSession?.quizTitle,
      startedAt: summary.startedAt || room.startedAt || room.createdAt,
      endedAt: summary.endedAt || serverTimestamp(),
      duration: summary.duration,
      participantCount: participants.length,
      questionCount: overview.questionCount,
      status: 'completed',
      winnerIds: winnerIds.length ? winnerIds : undefined,
      winnerNames: winnerNames.length ? winnerNames : undefined,
      mvpPlayerId: summary.mvpPlayerId,
      settingsSnapshot: buildSettingsSnapshot(room, quizSession),
      overview,
      skillPerformance: skills.length ? skills : undefined,
      moveUsage: moveUsage.length ? moveUsage : undefined,
      insights: [],
      timelinePreview,
      timelineCount: timeline.length,
      archived: false,
      sourceRoomId: sessionId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    draft.insights = buildLiveEventInsights(draft, questions, skills);

    const existing = await getDoc(sessionRef(sessionId));
    const alreadyMastery = existing.exists() && !!(existing.data() as LiveEventSessionRecord).masteryAppliedAt;

    await setDoc(
      sessionRef(sessionId),
      stripUndefined({
        ...draft,
        createdAt: existing.exists() ? existing.data()?.createdAt || serverTimestamp() : serverTimestamp(),
      } as unknown as DocumentData),
      { merge: true }
    );

    // Participants
    let batch = writeBatch(db);
    let ops = 0;
    const flush = async () => {
      if (ops === 0) return;
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    };
    for (const p of participants) {
      batch.set(doc(participantsCol(sessionId), p.userId), stripUndefined(p as unknown as DocumentData), {
        merge: true,
      });
      ops += 1;
      if (ops >= BATCH_LIMIT) await flush();
    }
    for (const q of questions) {
      batch.set(doc(questionsCol(sessionId), q.questionId), stripUndefined(q as unknown as DocumentData), {
        merge: true,
      });
      ops += 1;
      if (ops >= BATCH_LIMIT) await flush();
    }
    // Timeline (capped) — only write if not already stored heavily
    const existingTimelineCount = Number((existing.data() as LiveEventSessionRecord | undefined)?.timelineCount || 0);
    if (existingTimelineCount < timeline.length) {
      for (const entry of timeline) {
        batch.set(doc(timelineCol(sessionId), entry.id), stripUndefined(entry as unknown as DocumentData), {
          merge: true,
        });
        ops += 1;
        if (ops >= BATCH_LIMIT) await flush();
      }
    }
    await flush();

    // Skill mastery — student-owned writes may fail for host; still try as staff if rules allow
    if (!alreadyMastery && quizSession?.quizId && quizSession.perQuestionResults) {
      try {
        await applyLiveEventSkillMastery(sessionId, quizSession);
        await updateDoc(sessionRef(sessionId), { masteryAppliedAt: serverTimestamp(), updatedAt: serverTimestamp() });
      } catch (e) {
        console.warn('[liveEventHistory] mastery apply failed (non-fatal)', e);
      }
    }

    return draft;
  } catch (e) {
    console.error('[liveEventHistory] archiveLiveEventSession failed', e);
    return null;
  }
}

/**
 * Feed Live Event answers into centralized Skill Mastery (mode: live-event).
 * Best-effort; idempotent via attemptId = live_{sessionId}_{userId}.
 */
export async function applyLiveEventSkillMastery(
  sessionId: string,
  quizSession: LiveQuizSession
): Promise<void> {
  if (!quizSession.quizId) return;
  const questions = await getQuestions(quizSession.quizId);
  const per = quizSession.perQuestionResults || {};

  for (const [userId, rows] of Object.entries(per)) {
    if (!rows?.length) continue;
    const answers: TrainingAnswer[] = rows.map((r) => ({
      questionId: r.questionId,
      selectedIndices: [],
      isCorrect: r.isCorrect,
      partialCredit: r.isCorrect ? 1 : 0,
      timeSpentMs: 0,
    }));
    const enriched = enrichAnswersWithSkills(answers, questions);
    if (!enriched.some((a) => a.skillIds?.length)) continue;
    try {
      await recordSkillEvidenceFromAttempt({
        userId,
        quizSetId: quizSession.quizId,
        attemptId: `live_${sessionId}_${userId}`,
        answers: enriched,
        mode: 'live-event',
      });
    } catch (err) {
      console.warn('[liveEventHistory] mastery for', userId, err);
    }
  }
}

export async function listLiveEventSessions(
  filters: LiveEventHistoryListFilters = {}
): Promise<LiveEventSessionRecord[]> {
  const lim = Math.min(filters.limit || 80, 200);
  const q = query(collection(db, COLLECTION), orderBy('endedAt', 'desc'), limit(lim));
  const snap = await getDocs(q);
  let rows = snap.docs.map((d) => ({ ...(d.data() as LiveEventSessionRecord), eventSessionId: d.id }));

  if (!filters.includeArchived) {
    rows = rows.filter((r) => r.status !== 'archived' && !r.archived);
  }
  if (filters.status && filters.status !== 'all') {
    rows = rows.filter((r) => r.status === filters.status);
  }
  if (filters.classId) {
    rows = rows.filter(
      (r) => r.classId === filters.classId || (r.classIds || []).includes(filters.classId!)
    );
  }
  if (filters.eventType) {
    rows = rows.filter((r) => r.eventType === filters.eventType);
  }
  if (filters.hostId) {
    rows = rows.filter((r) => r.hostId === filters.hostId);
  }
  if (filters.quizId) {
    rows = rows.filter((r) => r.quizId === filters.quizId || r.cfuId === filters.quizId);
  }
  if (filters.dateFromMs) {
    rows = rows.filter((r) => {
      const ms = toMs(r.endedAt) ?? toMs(r.startedAt);
      return ms != null && ms >= filters.dateFromMs!;
    });
  }
  if (filters.dateToMs) {
    rows = rows.filter((r) => {
      const ms = toMs(r.endedAt) ?? toMs(r.startedAt);
      return ms != null && ms <= filters.dateToMs!;
    });
  }
  if (filters.search?.trim()) {
    const s = filters.search.trim().toLowerCase();
    rows = rows.filter(
      (r) =>
        r.eventName?.toLowerCase().includes(s) ||
        r.className?.toLowerCase().includes(s) ||
        r.quizTitle?.toLowerCase().includes(s) ||
        r.eventType?.toLowerCase().includes(s) ||
        r.hostName?.toLowerCase().includes(s)
    );
  }
  return rows;
}

export async function getLiveEventSession(
  sessionId: string
): Promise<LiveEventSessionRecord | null> {
  const snap = await getDoc(sessionRef(sessionId));
  if (!snap.exists()) return null;
  return { ...(snap.data() as LiveEventSessionRecord), eventSessionId: snap.id };
}

export async function getLiveEventParticipants(
  sessionId: string
): Promise<LiveEventParticipantRecord[]> {
  const snap = await getDocs(participantsCol(sessionId));
  return snap.docs
    .map((d) => ({ ...(d.data() as LiveEventParticipantRecord), userId: d.id }))
    .sort((a, b) => (a.placement || 999) - (b.placement || 999));
}

export async function getLiveEventQuestions(
  sessionId: string
): Promise<LiveEventQuestionRecord[]> {
  const snap = await getDocs(questionsCol(sessionId));
  return snap.docs
    .map((d) => ({ ...(d.data() as LiveEventQuestionRecord), questionId: d.id }))
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
}

export async function getLiveEventTimelinePage(
  sessionId: string,
  pageSize = 50,
  afterId?: string
): Promise<LiveEventTimelineEntry[]> {
  const snap = await getDocs(query(timelineCol(sessionId), orderBy('atMs', 'asc'), limit(500)));
  let rows = snap.docs.map((d) => ({ ...(d.data() as LiveEventTimelineEntry), id: d.id }));
  if (afterId) {
    const idx = rows.findIndex((r) => r.id === afterId);
    if (idx >= 0) rows = rows.slice(idx + 1);
  }
  return rows.slice(0, pageSize);
}

export async function archiveLiveEventHistorySession(
  sessionId: string,
  archivedBy?: string
): Promise<void> {
  await updateDoc(sessionRef(sessionId), {
    status: 'archived',
    archived: true,
    archivedAt: serverTimestamp(),
    archivedBy: archivedBy || null,
    updatedAt: serverTimestamp(),
  });
}

export async function unarchiveLiveEventHistorySession(sessionId: string): Promise<void> {
  await updateDoc(sessionRef(sessionId), {
    status: 'completed',
    archived: false,
    updatedAt: serverTimestamp(),
  });
}

function csvEscape(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportParticipantsCsv(
  session: LiveEventSessionRecord,
  participants: LiveEventParticipantRecord[]
): string {
  const battle = isBattleEventType(session.eventType);
  const headers = [
    'Student',
    'UserId',
    'Class',
    'Placement',
    'Score',
    'Questions Correct',
    'Questions Incorrect',
    'Questions Unanswered',
    'Accuracy',
    'Average Response Time Ms',
    ...(battle
      ? ['Damage Dealt', 'Damage Taken', 'Healing', 'Eliminations', 'Moves Used']
      : []),
    'PP',
    'XP',
    'Battle Pass XP',
    'Disconnects',
    'Completed',
  ];
  const lines = [headers.join(',')];
  for (const p of participants) {
    const row = [
      p.playerName,
      p.userId,
      session.className,
      p.placement,
      p.score,
      p.questionsCorrect,
      p.questionsIncorrect,
      p.questionsUnanswered,
      p.accuracy,
      p.averageResponseTimeMs,
      ...(battle
        ? [p.damageDealt, p.damageTaken, p.healingDone, p.eliminations, p.totalSkillsUsed]
        : []),
      (p.ppEarned || 0) + (p.quizPp || 0) || '',
      p.xpEarned,
      p.battlePassXpEarned,
      p.disconnectCount,
      p.completedEvent === false ? 'no' : 'yes',
    ];
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n');
}

export function exportQuestionsCsv(questions: LiveEventQuestionRecord[]): string {
  const headers = [
    'Order',
    'QuestionId',
    'Prompt',
    'Difficulty',
    'Skills',
    'Answered',
    'Correct',
    'Incorrect',
    'Unanswered',
    'Accuracy',
    'HighMiss',
  ];
  const lines = [headers.join(',')];
  for (const q of questions) {
    lines.push(
      [
        q.orderIndex,
        q.questionId,
        q.prompt,
        q.difficulty,
        (q.skillNames || q.skillIds || []).join('; '),
        q.studentsAnswered,
        q.correct,
        q.incorrect,
        q.unanswered,
        q.accuracy,
        q.highMiss ? 'yes' : 'no',
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  return lines.join('\n');
}

export function exportSkillsCsv(skills: LiveEventSkillAggregate[]): string {
  const headers = ['SkillId', 'Skill', 'Responses', 'Correct', 'Incorrect', 'Accuracy'];
  const lines = [headers.join(',')];
  for (const s of skills) {
    lines.push(
      [s.skillId, s.skillName, s.responses, s.correct, s.incorrect, s.accuracy].map(csvEscape).join(',')
    );
  }
  return lines.join('\n');
}

export function downloadTextFile(filename: string, content: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function formatDuration(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

export function formatEventDate(value: unknown): string {
  const ms = toMs(value);
  if (ms == null) return '—';
  return new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Backfill history from an ended room that already has sessionSummary. */
export async function backfillLiveEventHistoryFromRoom(
  sessionId: string
): Promise<LiveEventSessionRecord | null> {
  const roomSnap = await getDoc(doc(db, 'inSessionRooms', sessionId));
  if (!roomSnap.exists()) return null;
  const room = roomSnap.data() as Record<string, unknown>;
  const summary = room.sessionSummary as SessionSummary | undefined;
  if (!summary) return null;
  return archiveLiveEventSession(sessionId, summary, room);
}
