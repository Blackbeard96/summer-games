import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBattle } from '../context/BattleContext';
import { db } from '../firebase';
import { doc, getDoc, updateDoc, onSnapshot, serverTimestamp, collection, query, where, getDocs, arrayUnion, arrayRemove } from 'firebase/firestore';
import BattleEngine from './BattleEngine';
import BagModal from './BagModal';
import VaultModal from './VaultModal';
import { getLevelFromXP } from '../utils/leveling';
import { getUserSquadAbbreviations } from '../utils/squadUtils';
import { isUserScorekeeper, isUserAdmin, canEndLiveEventSession } from '../utils/roleManagement';
import { calculateDamageRange, calculateShieldBoostRange, calculateHealingRange } from '../utils/damageCalculator';
import { getEffectiveMasteryLevel, getArtifactDamageMultiplier } from '../utils/artifactUtils';
import { getMoveDamageSync } from '../utils/moveOverrides';
import { getEquippedSkillsForBattle, mergeEquippableCatalogLayers } from '../utils/battleSkillsService';
import { getRRCandyDisplayName } from '../utils/rrCandyMoves';
import { getUserRRCandySkills } from '../utils/rrCandyService';
// New service imports
import { 
  subscribeToSession, 
  joinSession, 
  endSession, 
  leaveSession,
  getSession,
  canHostSession,
  isGlobalHost,
  type SessionPlayer as ServiceSessionPlayer
} from '../utils/inSessionService';
import { 
  startPresence, 
  stopPresence, 
  subscribeToPresence,
  isPlayerOnline,
  type PlayerPresence
} from '../utils/inSessionPresenceService';
import { 
  getAvailableSkillsForSession,
  createSessionLoadout,
  type SessionLoadout
} from '../utils/inSessionSkillsService';
import { 
  submitAction,
  subscribeToActions,
  generateClientNonce,
  checkDuplicateAction,
  type ActionType
} from '../utils/inSessionActionsService';
import { 
  trackSkillUsage,
  trackDamage,
  trackElimination,
  trackParticipation,
  getSessionSummary,
  LIVE_EVENT_PP_PER_PARTICIPATION_POINT,
} from '../utils/inSessionStatsService';
import { debug, debugError, debugThrottle } from '../utils/inSessionDebug';
import SessionSummaryModal from './SessionSummaryModal';
import { SessionSummary } from '../types/inSessionStats';
import LiveEventDebugOverlay from './LiveEventDebugOverlay';
import {
  subscribeQuizSession,
  startQuizSession,
  launchFirstQuestion,
  advanceQuiz,
  endQuizSession,
  clearQuizSession,
  grantLiveQuizRewards,
  getPlacementRewardForRank,
  submitQuizResponse,
  getMyResponse,
  subscribeResponseCount,
  submitBattleRoyaleQuickAction,
  getQuizSession,
  DEFAULT_BATTLE_ROYALE_HOST_CONFIG,
  DEFAULT_TEAM_BATTLE_ROYALE_HOST_CONFIG,
  isBattleQuizMode,
  type BrQuickActionId,
} from '../utils/liveQuizService';
import { getPublishedQuizSets, getQuestions, syncLiveEventQuizToTrainingAttempt } from '../utils/trainingGroundsService';
import type {
  LiveQuizSession as LiveQuizSessionType,
  LiveQuizRewardConfig,
  LiveQuizPlacementKey,
  BattleRoyaleHostConfig,
  TeamBattleRoyaleHostConfig,
} from '../types/liveQuiz';
import type { TrainingQuestion } from '../types/trainingGrounds';
import type { LiveEventModeType } from '../types/season1';
import type { Assessment } from '../types/assessmentGoals';
import { getEnergyTypeForMode } from '../utils/season1Energy';
import { getAssessmentsByClass } from '../utils/assessmentGoalsFirestore';
import { LiveQuizQuestionCard, LiveQuizAnswerOptions, LiveQuizLeaderboard, type LeaderboardEntry } from './liveQuiz';
import LiveEventReflectionPanel from './LiveEventReflectionPanel';
import LiveEventSprintPanel from './LiveEventSprintPanel';
import LiveEventMstMktModal from './LiveEventMstMktModal';
import { setLiveEventMstMktOpen } from '../utils/liveEventMktService';
import { parseClassFlowSprint } from '../utils/liveEventSprintService';
import type { ClassFlowSprintState } from '../types/season1';
import type { Move as BattleMove } from '../types/battle';
import { computeLiveEventParticipationSkillCost } from '../utils/liveEventSkillCost';
import { ARTIFACT_PERK_OPTIONS } from '../constants/artifactPerks';
import { getPlayerSkillState } from '../utils/skillStateService';

/** Pause after each question’s timer ends before the next question (Battle / Team BR). */
const BR_INTER_QUESTION_GAP_MS_OPTIONS: { label: string; value: number }[] = [
  { label: 'Manual — host clicks Next', value: 0 },
  { label: '3 seconds', value: 3000 },
  { label: '5 seconds', value: 5000 },
  { label: '10 seconds', value: 10000 },
  { label: '15 seconds', value: 15000 },
  { label: '20 seconds', value: 20000 },
  { label: '30 seconds', value: 30000 },
];

interface Student {
  id: string;
  displayName: string;
  email: string;
  powerPoints: number;
  photoURL?: string;
  level?: number;
  xp?: number;
  /** Power Level (PL) — from students doc when roster loads */
  powerLevel?: number | null;
}

interface InSessionBattleProps {
  sessionId: string;
  classId: string;
  className: string;
  students: Student[];
  onEndSession: () => void;
}

interface SessionPlayer {
  userId: string;
  displayName: string;
  photoURL?: string;
  level: number;
  powerLevel?: number | null; // Power Level (PL)
  powerPoints: number;
  participationCount: number;
  movesEarned: number;
  /** Mirrored from quiz battleRoyaleState.energy for UI */
  brEnergy?: number;
  hp?: number;
  maxHp?: number;
  shield?: number;
  maxShield?: number;
  eliminated?: boolean;
  eliminatedBy?: string;
}

type PlayerInspectTab = 'loadout' | 'artifacts';
type InspectArtifactEntry = {
  slot: string;
  name: string;
  image?: string | null;
  level?: number | null;
  rarity?: string | null;
  perks: Array<{ id: string; label: string; description: string }>;
};

type PlayerInspectData = {
  userId: string;
  displayName: string;
  photoURL?: string;
  powerLevel?: number | null;
  loadout: SessionLoadout | null;
  artifacts: InspectArtifactEntry[];
  skillLevelsById: Record<string, number>;
};

/** Coerce Firestore / session values to an integer PL, or null if missing/invalid */
function finitePowerLevel(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : null;
}

const InSessionBattle: React.FC<InSessionBattleProps> = ({
  sessionId,
  classId,
  className,
  students,
  onEndSession
}) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { vault, refreshVaultData, moves, refreshInventory } = useBattle();
  const [sessionPlayers, setSessionPlayers] = useState<SessionPlayer[]>([]);
  const [battleLog, setBattleLog] = useState<string[]>(['📚 In Session Battle Started!']);
  const [selectedStudentForPP, setSelectedStudentForPP] = useState<string | null>(null);
  const [ppAdjustment, setPPAdjustment] = useState<number>(0);
  const [ppQuickAdjust, setPPQuickAdjust] = useState<{ [userId: string]: number }>({});
  const [showBagModal, setShowBagModal] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [selectedMove, setSelectedMove] = useState<any>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [equippedBattleSkills, setEquippedBattleSkills] = useState<any[]>([]);
  const [sessionSummons, setSessionSummons] = useState<Array<{
    id: string;
    summonerId: string;
    name: string;
    hp: number;
    maxHp: number;
    shield: number;
    maxShield: number;
    image?: string;
    summonElementalType?: string;
  }>>([]);
  /** Same shape as BattleEngine: adminSettings/cpuOpponentMoves → data.opponents */
  const [cpuOpponentMoves, setCpuOpponentMoves] = useState<any[] | null>(null);
  const [currentTraceId, setCurrentTraceId] = useState<string | null>(null);
  const [activeViewers, setActiveViewers] = useState<string[]>([]);
  const [presenceMap, setPresenceMap] = useState<Map<string, { connected: boolean; lastSeenAt: any }>>(new Map());
  const battleEngineRef = useRef<{ selectMove: (move: any) => void; selectTarget: (targetId: string) => void } | null>(null);
  const [squadAbbreviations, setSquadAbbreviations] = useState<Map<string, string | null>>(new Map());
  // CRITICAL: Initialize all permission states as false - button is HIDDEN by default
  const [isScorekeeper, setIsScorekeeper] = useState<boolean>(false);
  const [isAdminUser, setIsAdminUser] = useState<boolean>(false);
  const [permissionsChecked, setPermissionsChecked] = useState<boolean>(false);
  const [isSessionHost, setIsSessionHost] = useState<boolean>(false);
  const [mstMktOpen, setMstMktOpen] = useState(false);
  const [roomSessionStatus, setRoomSessionStatus] = useState<string | undefined>(undefined);
  const [showMstMktModal, setShowMstMktModal] = useState(false);
  const [mstMktToggleLoading, setMstMktToggleLoading] = useState(false);

  // Log initial state
  console.log('[InSessionBattle] Component initialized with permissions:', {
    isAdminUser,
    isScorekeeper,
    permissionsChecked,
    currentUserId: currentUser?.uid
  });
  const [userLevel, setUserLevel] = useState(1);
  const [equippedArtifacts, setEquippedArtifacts] = useState<any>(null);
  const [userProfiles, setUserProfiles] = useState<Map<string, { displayName: string; photoURL?: string }>>(new Map());
  /** Keep latest profile/roster data without re-subscribing the session doc (rapid teardown causes Firestore ca9 errors). */
  const userProfilesRef = useRef(userProfiles);
  const studentsRef = useRef(students);
  userProfilesRef.current = userProfiles;
  studentsRef.current = students;
  const isUpdatingViewersRef = useRef(false); // Prevent concurrent updates
  
  // Session summary modal state (ref ensures host sees summary when they end session - avoids stale closure)
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const hasShownSummaryForEndedRef = useRef(false);

  useEffect(() => {
    hasShownSummaryForEndedRef.current = false;
  }, [sessionId]);

  /**
   * When status becomes `ended`, show the Live Event summary for everyone (including host).
   * Do not set hasShownSummaryForEndedRef until we actually open the modal — the first snapshot
   * can have status ended before `sessionSummary` is readable, which previously blocked the modal forever.
   */
  const showLiveEventSummaryIfEnded = useCallback(
    async (sessionFromSnapshot: { status?: string; sessionSummary?: SessionSummary } | null) => {
      if (hasShownSummaryForEndedRef.current) return;
      const status = sessionFromSnapshot?.status;
      const embedded = sessionFromSnapshot?.sessionSummary;
      if (status === 'ended' && embedded) {
        setSessionSummary(embedded);
        setShowSessionSummary(true);
        hasShownSummaryForEndedRef.current = true;
        return;
      }
      if (
        sessionFromSnapshot != null &&
        sessionFromSnapshot.status != null &&
        sessionFromSnapshot.status !== 'ended'
      ) {
        return;
      }

      for (let attempt = 0; attempt < 15; attempt++) {
        if (hasShownSummaryForEndedRef.current) return;
        if (attempt > 0) await new Promise(r => setTimeout(r, 280 * Math.min(attempt, 4)));

        let summary: SessionSummary | null = await getSessionSummary(sessionId);
        if (!summary) {
          const room = await getSession(sessionId);
          if (room?.status === 'ended') {
            const fromDoc = (room as { sessionSummary?: SessionSummary }).sessionSummary;
            if (fromDoc) summary = fromDoc;
            else {
              summary = {
                sessionId,
                classId: room.classId,
                className: room.className,
                startedAt: room.startedAt || room.createdAt,
                endedAt: room.endedAt,
                duration: 0,
                totalPlayers: room.players?.length ?? 0,
                stats: {}
              };
            }
          }
        }
        if (summary) {
          setSessionSummary(summary);
          setShowSessionSummary(true);
          hasShownSummaryForEndedRef.current = true;
          return;
        }
      }
    },
    [sessionId]
  );

  // Live Quiz Mode state
  const [quizSession, setQuizSession] = useState<LiveQuizSessionType | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<TrainingQuestion[]>([]);
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [quizList, setQuizList] = useState<{ id: string; title: string; questionCount: number }[]>([]);
  const [quizStartLoading, setQuizStartLoading] = useState(false);
  const [selectedQuizId, setSelectedQuizId] = useState<string>('');
  const [quizNumQuestions, setQuizNumQuestions] = useState<number>(0);
  const [quizTimeLimit, setQuizTimeLimit] = useState<number>(20);
  /** Season 1 live activity: four host-facing modes (team BR is a sub-option under Battle Royale). */
  const [liveEventLaunchMode, setLiveEventLaunchMode] = useState<LiveEventModeType>('class_flow');
  const [battleRoyaleTeamFormat, setBattleRoyaleTeamFormat] = useState(false);
  /** Room doc Season 1 / reflection linking (from subscribeToSession). */
  const [roomReflectionMeta, setRoomReflectionMeta] = useState<{
    liveEventMode?: string;
    reflectionAssessmentId?: string;
    reflectionPrompt?: string;
  }>({});
  const [roomClassFlowSprint, setRoomClassFlowSprint] = useState<ClassFlowSprintState | null>(null);
  const [reflectionPickAssessmentId, setReflectionPickAssessmentId] = useState('');
  const [reflectionPickPrompt, setReflectionPickPrompt] = useState('');
  const [reflectionModalAssessments, setReflectionModalAssessments] = useState<Assessment[]>([]);
  const [brHostConfig, setBrHostConfig] = useState<BattleRoyaleHostConfig>(() => ({
    ...DEFAULT_BATTLE_ROYALE_HOST_CONFIG,
  }));
  const [teamBrHostConfig, setTeamBrHostConfig] = useState<TeamBattleRoyaleHostConfig>(() => ({
    ...DEFAULT_TEAM_BATTLE_ROYALE_HOST_CONFIG,
  }));
  const [brSurvivorPreset, setBrSurvivorPreset] = useState<'1' | '3' | '5' | '10' | 'custom'>('1');
  const [brCustomSurvivorTarget, setBrCustomSurvivorTarget] = useState(2);
  const [brQuickTargetUid, setBrQuickTargetUid] = useState<string | null>(null);
  /** Dedupe auto-advance per question round (`quizRoundIndex:questionId`). */
  const brAutoAdvanceDedupeRef = useRef<string | null>(null);
  /** Host-only: seconds until auto-advance after the answer timer ends (Battle Royale modes). */
  const [brInterQuestionSecondsLeft, setBrInterQuestionSecondsLeft] = useState<number | null>(null);
  const [quizSelectedIndices, setQuizSelectedIndices] = useState<number[]>([]);
  const [quizAnswerSubmitted, setQuizAnswerSubmitted] = useState(false);
  const [quizMyResponse, setQuizMyResponse] = useState<{ selectedIndices: number[]; isCorrect: boolean; pointsAwarded: number } | null>(null);
  const [quizResponseCount, setQuizResponseCount] = useState(0);
  const [showEliminatedQuizOverlay, setShowEliminatedQuizOverlay] = useState(false);
  const [showPlayerInspectModal, setShowPlayerInspectModal] = useState(false);
  const [playerInspectTab, setPlayerInspectTab] = useState<PlayerInspectTab>('loadout');
  const [selectedInspectPlayerId, setSelectedInspectPlayerId] = useState<string | null>(null);
  const [playerInspectLoading, setPlayerInspectLoading] = useState(false);
  const [playerInspectError, setPlayerInspectError] = useState<string | null>(null);
  const [playerInspectData, setPlayerInspectData] = useState<PlayerInspectData | null>(null);
  const [quizCountdown, setQuizCountdown] = useState<number | null>(null);
  const quizCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const eliminationOverlayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasCurrentPlayerEliminatedRef = useRef(false);
  /** When a quiz is active, players/host can swap between Quiz view and Battle Log view. Persist in sessionStorage so it survives remounts and toggling works reliably. */
  const [centerView, setCenterViewState] = useState<'quiz' | 'battleLog'>('battleLog');

  useEffect(() => {
    if (!quizModalOpen || liveEventLaunchMode !== 'reflection' || !classId) return;
    let cancelled = false;
    getAssessmentsByClass(classId)
      .then((list) => {
        if (cancelled) return;
        setReflectionModalAssessments(
          list.filter((a) => a.gradingStatus === 'open' || a.gradingStatus === 'draft')
        );
      })
      .catch((e) => console.error('Reflection modal: failed to load assessments', e));
    return () => {
      cancelled = true;
    };
  }, [quizModalOpen, liveEventLaunchMode, classId]);

  // Use canonical equipped battle skills for Live Event UI so RR Candy/artifact skills match BattleEngine.
  useEffect(() => {
    let cancelled = false;
    const loadEquippedBattleSkills = async () => {
      if (!currentUser) return;
      try {
        const studentDoc = await getDoc(doc(db, 'students', currentUser.uid));
        const studentData = studentDoc.exists() ? studentDoc.data() : {};
        const userElement = studentData.elementalAffinity || studentData.manifestationType || undefined;
        setEquippedArtifacts(studentData.equippedArtifacts || null);
        const equipped = await getEquippedSkillsForBattle(currentUser.uid, userElement);
        if (!cancelled) {
          // Defensive fallback: if RR Candy exists in unlocked context but canonical list is missing it,
          // merge them so Live Event still shows equipped candy skills.
          const equippedHasRRCandy = equipped.some((m: any) => m.id?.includes('rr-candy'));
          const supplementalRRCandy = equippedHasRRCandy
            ? []
            : moves.filter((m: any) => m.unlocked && m.id?.includes('rr-candy'));
          const merged = [...equipped, ...supplementalRRCandy].filter(
            (m: any, idx: number, arr: any[]) => arr.findIndex((x: any) => x.id === m.id) === idx
          );
          setEquippedBattleSkills(merged);
        }
      } catch (error) {
        console.error('InSessionBattle: Failed to load equipped battle skills', error);
        if (!cancelled) setEquippedBattleSkills(moves.filter((m: any) => m.unlocked));
      }
    };
    loadEquippedBattleSkills();
    return () => {
      cancelled = true;
    };
  }, [currentUser, moves]);

  // CPU opponent definitions (Light Construct moves, etc.) — matches BattleEngine Firestore path
  useEffect(() => {
    const cpuMovesRef = doc(db, 'adminSettings', 'cpuOpponentMoves');
    const unsubscribe = onSnapshot(cpuMovesRef, (docSnapshot) => {
      try {
        if (docSnapshot.exists()) {
          const data = docSnapshot.data();
          if (data.opponents && Array.isArray(data.opponents)) {
            setCpuOpponentMoves(data.opponents);
          } else {
            setCpuOpponentMoves([]);
          }
        } else {
          setCpuOpponentMoves([]);
        }
      } catch (e) {
        console.error('InSessionBattle: cpuOpponentMoves snapshot error', e);
        setCpuOpponentMoves([]);
      }
    }, (err) => {
      console.error('InSessionBattle: cpuOpponentMoves listener error', err);
      setCpuOpponentMoves([]);
    });
    return () => unsubscribe();
  }, []);

  const setCenterView = useCallback((next: 'quiz' | 'battleLog' | ((prev: 'quiz' | 'battleLog') => 'quiz' | 'battleLog')) => {
    setCenterViewState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(`liveEventCenterView_${sessionId}`, value);
      return value;
    });
  }, [sessionId]);
  // Restore tab choice from sessionStorage when sessionId or quiz appears (so toggling back to Quiz works after remount/navigation)
  useEffect(() => {
    if (typeof sessionStorage === 'undefined' || !sessionId) return;
    const saved = sessionStorage.getItem(`liveEventCenterView_${sessionId}`);
    if (saved === 'quiz' || saved === 'battleLog') setCenterViewState(saved);
  }, [sessionId, quizSession?.status]);
  const defaultPlacement = () => ({ pp: 0, xp: 0 });
  const [quizRewardConfig, setQuizRewardConfig] = useState<LiveQuizRewardConfig>({
    placements: {
      first: { pp: 50, xp: 25 },
      second: { pp: 30, xp: 15 },
      third: { pp: 20, xp: 10 },
      top5: defaultPlacement(),
      top10: defaultPlacement(),
    },
  });
  const QUIZ_REWARD_ARTIFACTS: { id: string; name: string }[] = [
    { id: 'uxp-credit-1', name: '+1 UXP Credit' },
    { id: 'uxp-credit', name: '+2 UXP Credit' },
    { id: 'uxp-credit-4', name: '+4 UXP Credit' },
    { id: 'shield', name: 'Shield' },
    { id: 'health-potion-25', name: 'Health Potion (25)' },
    { id: 'checkin-free', name: 'Get Out of Check-in Free' },
    { id: 'skip-the-line', name: 'Skip the Line' },
    { id: 'double-pp', name: 'Double PP Boost' },
  ];

  const [quizEquippableRewardOptions, setQuizEquippableRewardOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!quizModalOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'adminSettings', 'equippableArtifacts'));
        const raw = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
        const merged = mergeEquippableCatalogLayers(raw);
        const opts = Object.entries(merged)
          .filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v))
          .map(([key, v]) => {
            const art = v as { id?: string; name?: string };
            const id = typeof art.id === 'string' && art.id.trim() ? art.id.trim() : key;
            return { id, name: typeof art.name === 'string' && art.name.trim() ? art.name.trim() : id };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setQuizEquippableRewardOptions(opts);
      } catch {
        if (!cancelled) setQuizEquippableRewardOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quizModalOpen]);

  // Track player presence using presence service
  useEffect(() => {
    if (!sessionId || !currentUser) return;

    debug('inSessionBattle', `Starting presence tracking for ${currentUser.uid}`);
    
    // Start presence tracking
    const cleanupPresence = startPresence(sessionId, currentUser.uid);

    // Subscribe to presence updates for all players
    const unsubscribePresence = subscribeToPresence(sessionId, (newPresenceMap) => {
      debugThrottle('presence-update', 2000, 'inSessionBattle', 
        `Presence update: ${newPresenceMap.size} players`, 
        Array.from(newPresenceMap.entries()).map(([uid, p]) => ({ uid, connected: p.connected }))
      );
      
      // Store presence map in state for UI to use
      setPresenceMap(newPresenceMap);
      
      // Update session players with presence data
      setSessionPlayers(prev => prev.map(player => {
        const presence = newPresenceMap.get(player.userId);
        return {
          ...player,
          // Presence data can be used to show online/offline status
        };
      }));
    });

    return () => {
      debug('inSessionBattle', `Stopping presence tracking for ${currentUser.uid}`);
      cleanupPresence();
      unsubscribePresence();
      stopPresence(sessionId, currentUser.uid);
    };
  }, [sessionId, currentUser]);

  // Load session data and listen for updates using session service
  useEffect(() => {
    if (!sessionId || !currentUser) return;

    debug('inSessionBattle', `Setting up session subscription for ${sessionId}`);
    
    // Track if join is in progress to prevent duplicate attempts
    let joinInProgress = false;
    
    // Auto-join the session if user is not already in it (idempotent)
    const autoJoinSession = async () => {
      // Prevent duplicate join attempts
      if (joinInProgress) {
        debug('inSessionBattle', 'Join already in progress, skipping duplicate attempt');
        return;
      }
      
      try {
        joinInProgress = true;
        
        // Quick check: Is user already in session?
        const sessionRef = doc(db, 'inSessionRooms', sessionId);
        const sessionDoc = await getDoc(sessionRef);
        if (sessionDoc.exists()) {
          const sessionData = sessionDoc.data();
          const alreadyInSession = sessionData.players?.some((p: any) => p.userId === currentUser.uid) || false;
          if (alreadyInSession) {
            debug('inSessionBattle', `User ${currentUser.uid} already in session, skipping join`);
            joinInProgress = false;
            return;
          }
        }
        
        // Get user and vault data for join (use vault for accurate max HP/shield from upgrades)
        const studentDoc = await getDoc(doc(db, 'students', currentUser.uid));
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const vaultRef = doc(db, 'vaults', currentUser.uid);
        const vaultDoc = await getDoc(vaultRef);
        
        const studentData = studentDoc.exists() ? studentDoc.data() : {};
        const userData = userDoc.exists() ? userDoc.data() : {};
        const vaultData = vaultDoc.exists() ? vaultDoc.data() : {};
        
        const playerLevel = studentData.level || getLevelFromXP(studentData.xp || 0) || 1;
        const capacity = vaultData.capacity || studentData.powerPoints || 1000;
        // Max HP: vault uses 10% of capacity; minimum 100, or level * 10
        const maxHp = Math.max(100, Math.floor(Number(capacity) * 0.1), playerLevel * 10);
        // Current HP: use vault's current vault health so session matches Vault Management / Battle Arena
        const currentVaultHp = vaultData.vaultHealth !== undefined
          ? Math.min(vaultData.vaultHealth, maxHp, vaultData.currentPP ?? maxHp)
          : maxHp;
        const hp = currentVaultHp;
        // Max Shield: from vault upgrades (maxShieldStrength) so it reflects player upgrades
        const maxShield = Math.max(100, Number(vaultData.maxShieldStrength) || 100);
        // Current Shield: use vault's current shield so session matches Vault Management / Battle Arena
        const shield = (vaultData.shieldStrength !== undefined && vaultData.shieldStrength !== null)
          ? Math.min(vaultData.shieldStrength, maxShield)
          : maxShield;
        // PP from vault so it matches Vault Management
        const powerPoints = vaultData.currentPP ?? studentData.powerPoints ?? 0;

        const plRaw = studentData.powerLevel;
        const powerLevel =
          typeof plRaw === 'number' && Number.isFinite(plRaw) ? Math.floor(plRaw) : null;

        const newPlayer: ServiceSessionPlayer = {
          userId: currentUser.uid,
          displayName: userData.displayName || studentData.displayName || currentUser.displayName || 'Unknown',
          photoURL: userData.photoURL || studentData.photoURL || currentUser.photoURL,
          level: playerLevel,
          powerLevel,
          powerPoints,
          participationCount: 0,
          movesEarned: 0,
          hp,
          maxHp,
          shield,
          maxShield
        };
        
        // Join session (idempotent - safe to call multiple times)
        const result = await joinSession(sessionId, newPlayer);
        if (result.success) {
          debug('inSessionBattle', `User ${currentUser.uid} joined session ${sessionId}`);
          
          // Create session loadout snapshot
          const userElement = studentData.elementalAffinity;
          await createSessionLoadout(sessionId, currentUser.uid, userElement);
        } else {
          debugError('inSessionBattle', `Failed to join session: ${result.error}`);
        }
      } catch (error) {
        debugError('inSessionBattle', `Error auto-joining session`, error);
      } finally {
        joinInProgress = false;
      }
    };
    
    // Auto-join on mount
    autoJoinSession();
    
      // Subscribe to session updates
      // CRITICAL: Ensure only one subscription per sessionId to prevent duplication
      const unsubscribe = subscribeToSession(sessionId, (session) => {
        // Dispatch subscription health update
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('liveEventSubscriptionUpdate', {
            detail: { 
              type: 'session', 
              connected: true, 
              lastUpdate: new Date().toISOString() 
            }
          }));
        }
      if (!session) {
        debug('inSessionBattle', `Session ${sessionId} does not exist`);
        setRoomClassFlowSprint(null);
        return;
      }

      const rawRoom = session as unknown as Record<string, unknown>;
      setRoomReflectionMeta({
        liveEventMode: typeof rawRoom.liveEventMode === 'string' ? rawRoom.liveEventMode : undefined,
        reflectionAssessmentId:
          typeof rawRoom.reflectionAssessmentId === 'string' ? rawRoom.reflectionAssessmentId : undefined,
        reflectionPrompt: typeof rawRoom.reflectionPrompt === 'string' ? rawRoom.reflectionPrompt : undefined,
      });
      setRoomSessionStatus(typeof session.status === 'string' ? session.status : undefined);
      setMstMktOpen(rawRoom.mstMktOpen === true);
      setRoomClassFlowSprint(parseClassFlowSprint(rawRoom.classFlowSprint));
      
      const DEBUG_LIVE_EVENTS = process.env.REACT_APP_DEBUG_LIVE_EVENTS === 'true' || 
                                 process.env.REACT_APP_DEBUG === 'true';
      
      // Throttle session update logs to reduce noise (only log every 5 seconds)
      debugThrottle('session-update', 5000, 'inSessionBattle', `Session update received`, {
        sessionId,
        playersCount: session.players?.length || 0,
        battleLogLength: session.battleLog?.length || 0,
        lastLogEntry: session.battleLog?.[session.battleLog.length - 1] || 'none'
      });
      
      const players: SessionPlayer[] = session.players || [];
      
      // CRITICAL: Log raw players array from Firestore to verify transaction wrote correctly
      if (DEBUG_LIVE_EVENTS) {
        console.log('📥 [Session Update] Raw players from Firestore:', players.map(p => ({
          userId: p.userId.substring(0, 8) + '...',
          name: p.displayName,
          hp: p.hp,
          shield: p.shield,
          pp: p.powerPoints
        })));
      }
      
      // Update player names from userProfiles; merge Power Level from roster when session row omits it
      const updatedPlayers = players.map((player) => {
        let next: SessionPlayer = { ...player };
        const latestProfile = userProfilesRef.current.get(player.userId);
        if (latestProfile && latestProfile.displayName !== player.displayName) {
          next = {
            ...next,
            displayName: latestProfile.displayName,
            photoURL: latestProfile.photoURL || player.photoURL
          };
        }
        const rosterPl = studentsRef.current.find((s) => s.id === player.userId)?.powerLevel;
        if (
          (next.powerLevel === undefined || next.powerLevel === null) &&
          rosterPl !== undefined &&
          rosterPl !== null
        ) {
          next = { ...next, powerLevel: rosterPl };
        }
        return next;
      });
      
      // ALWAYS log player state changes (critical for debugging) - enhanced
      updatedPlayers.forEach(player => {
        const oldPlayer = sessionPlayers.find(p => p.userId === player.userId);
        if (oldPlayer) {
          const changes = [];
          const oldHp = oldPlayer.hp ?? 0;
          const newHp = player.hp ?? 0;
          const oldShield = oldPlayer.shield ?? 0;
          const newShield = player.shield ?? 0;
          const oldPp = oldPlayer.powerPoints ?? 0;
          const newPp = player.powerPoints ?? 0;
          
          if (oldHp !== newHp) changes.push(`HP: ${oldHp} → ${newHp} (Δ${newHp - oldHp})`);
          if (oldShield !== newShield) changes.push(`Shield: ${oldShield} → ${newShield} (Δ${newShield - oldShield})`);
          if (oldPp !== newPp) changes.push(`PP: ${oldPp} → ${newPp} (Δ${newPp - oldPp})`);
          
          if (changes.length > 0) {
            console.log(`🔄 [Session Update] ⚡ STATE CHANGED ⚡`, player.displayName, '|', changes.join(' | '));
            
            // Dispatch state update event for debug overlay
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('liveEventStateUpdate', {
                detail: { playerId: player.userId }
              }));
            }
          } else if (DEBUG_LIVE_EVENTS) {
            // Log even when no changes to verify subscription is working
            console.log(`📊 [Session Update] No changes for ${player.displayName}:`, {
              hp: player.hp,
              shield: player.shield,
              pp: player.powerPoints
            });
          }
        } else {
          // New player joined
          if (DEBUG_LIVE_EVENTS) {
            console.log(`🆕 [Session Update] New player detected: ${player.displayName}`, {
              hp: player.hp,
              shield: player.shield,
              pp: player.powerPoints
            });
          }
        }
      });
      
      // CRITICAL: Update React state - this triggers UI re-render
      setSessionPlayers(updatedPlayers);
      
      // Update battle log
      if (session.battleLog && Array.isArray(session.battleLog)) {
        const oldLogLength = battleLog.length;
        const newLogLength = session.battleLog.length;
        // ALWAYS log battle log updates (critical for debugging)
        if (newLogLength > oldLogLength) {
          console.log(`📝 [Session Update] BATTLE LOG UPDATED:`, {
            oldLength: oldLogLength,
            newLength: newLogLength,
            newEntries: session.battleLog.slice(oldLogLength),
            sessionId,
            timestamp: new Date().toISOString()
          });
        } else if (newLogLength < oldLogLength) {
          console.warn(`⚠️ [Session Update] Battle log length DECREASED: ${oldLogLength} → ${newLogLength}`);
        }
        setBattleLog(session.battleLog);
      } else {
        console.warn('⚠️ [Session Update] Battle log missing or invalid:', {
          hasBattleLog: !!session.battleLog,
          isArray: Array.isArray(session.battleLog),
          sessionId
        });
      }
      
      // Update active viewers (if still using array for backward compatibility)
      // Note: activeViewers is optional and may not be in the type
      const activeViewersArray = (session as any).activeViewers;
      if (activeViewersArray && Array.isArray(activeViewersArray)) {
        setActiveViewers(activeViewersArray);
      }
      
      // Check if current user is the session host
      if (currentUser) {
        const isHost = session.hostUid === currentUser.uid || 
                       isGlobalHost(currentUser.uid, currentUser.email || undefined, currentUser.displayName || undefined);
        setIsSessionHost(isHost);
      }
      
      if (session.status === 'ended') {
        debug('inSessionBattle', `Session ${sessionId} ended, opening summary if needed...`);
        void showLiveEventSummaryIfEnded(session as { status?: string; sessionSummary?: SessionSummary });
      }
    });

    return () => {
      unsubscribe();
    };
    // Intentionally omit userProfiles & students: including them re-subscribes on every profile snapshot and triggers Firestore INTERNAL ASSERTION (ca9).
  }, [sessionId, currentUser, showLiveEventSummaryIfEnded]);

  // Append entry to Live Event battle log
  const appendBattleLog = useCallback(async (entry: string) => {
    try {
      const sessionRef = doc(db, 'inSessionRooms', sessionId);
      await updateDoc(sessionRef, {
        battleLog: arrayUnion(entry),
        updatedAt: serverTimestamp(),
      });
      setBattleLog((prev) => [...prev, entry]);
    } catch (e) {
      debugError('inSessionBattle', 'appendBattleLog error', e);
    }
  }, [sessionId]);

  /** Grants placement rewards, battle log, and room snapshot when a live quiz completes (manual Next or auto-advance). */
  const runHostQuizCompletedFollowUp = useCallback(async () => {
    await grantLiveQuizRewards(sessionId);
    await appendBattleLog('📋 Quiz completed! Rewards have been applied.');
    const latest = await getQuizSession(sessionId);
    if (!latest) return;
    const config = latest.rewardConfig;
    if (!config?.placements) return;
    const placementsConfig = config.placements as LiveQuizRewardConfig['placements'];
    const placements = (
      [
        { key: 'first' as const, label: '1st' },
        { key: 'second' as const, label: '2nd' },
        { key: 'third' as const, label: '3rd' },
        { key: 'top5' as const, label: 'Top 5' },
        { key: 'top10' as const, label: 'Top 10' },
      ] as const
    )
      .map(({ key, label }) => {
        const p = placementsConfig[key];
        if (!p || (p.pp <= 0 && p.xp <= 0 && !p.artifactId && !p.artifactName)) return null;
        return {
          place: label,
          pp: p.pp ?? 0,
          xp: p.xp ?? 0,
          artifactName: (p.artifactName ?? p.artifactId ?? null) as string | null,
        };
      })
      .filter(Boolean) as { place: string; pp: number; xp: number; artifactName: string | null }[];
    if (placements.length === 0) return;
    const roomSnap = await getDoc(doc(db, 'inSessionRooms', sessionId));
    const players = (roomSnap.data()?.players || []) as Array<{ userId: string }>;
    const entriesWithScores = players.map((p) => ({
      uid: p.userId,
      score: latest.leaderboard?.[p.userId] ?? 0,
    }));
    const sortedByScore = [...entriesWithScores].sort((a, b) => b.score - a.score);
    const quizPpByPlayer: Record<string, number> = {};
    sortedByScore.forEach((entry, idx) => {
      const rank = idx + 1;
      const reward = getPlacementRewardForRank(placementsConfig, rank);
      quizPpByPlayer[entry.uid] = reward?.pp ?? 0;
    });
    await updateDoc(doc(db, 'inSessionRooms', sessionId), {
      lastQuizAwardsSnapshot: {
        quizTitle: latest.quizTitle ?? null,
        placements,
      },
      lastQuizPpByPlayer: quizPpByPlayer,
      updatedAt: serverTimestamp(),
    });
  }, [sessionId, appendBattleLog]);

  // Subscribe to Live Quiz session (only switch to Quiz view when a quiz first appears, not on every update)
  const hadQuizSessionRef = useRef(false);
  useEffect(() => {
    if (!sessionId) return;
    const unsub = subscribeQuizSession(sessionId, (session) => {
      const hadQuiz = hadQuizSessionRef.current;
      setQuizSession(session);
      if (session && !hadQuiz) {
        hadQuizSessionRef.current = true;
        setCenterView('quiz'); // when a quiz first appears, show Quiz tab; don't override user's choice on later updates
      }
      if (!session) hadQuizSessionRef.current = false;
      if (!session || session.status !== 'question_live') {
        setQuizCountdown(null);
        if (quizCountdownRef.current) {
          clearInterval(quizCountdownRef.current);
          quizCountdownRef.current = null;
        }
      }
    });
    return () => unsub();
  }, [sessionId]);

  // When a live quiz completes, mirror results to Training Grounds for this user (solo-style history/stats).
  const liveTrainingSyncKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!quizSession) {
      liveTrainingSyncKeyRef.current = null;
      return;
    }
    if (quizSession.status !== 'completed') {
      liveTrainingSyncKeyRef.current = null;
      return;
    }
    if (!sessionId || !currentUser || !quizSession.quizId) return;
    const key = `${sessionId}:${quizSession.quizId}`;
    if (liveTrainingSyncKeyRef.current === key) return;
    liveTrainingSyncKeyRef.current = key;
    let cancelled = false;
    syncLiveEventQuizToTrainingAttempt(sessionId, currentUser.uid, quizSession).then((res) => {
      if (cancelled || res.skipped) return;
      if (!res.ok) debugError('inSessionBattle', 'Training Grounds sync failed', res.error);
      else debug('inSessionBattle', 'Live quiz synced to Training Grounds', { sessionId, quizId: quizSession.quizId });
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, currentUser, quizSession]);

  // Load quiz questions when session has quizId
  useEffect(() => {
    if (!quizSession?.quizId) {
      setQuizQuestions([]);
      return;
    }
    getQuestions(quizSession.quizId).then(setQuizQuestions);
  }, [quizSession?.quizId]);

  // Countdown timer when question is live
  useEffect(() => {
    if (!quizSession || quizSession.status !== 'question_live' || !quizSession.questionEndsAt) {
      setQuizCountdown(null);
      return;
    }
    const update = () => {
      const now = Date.now();
      const end = quizSession.questionEndsAt ?? 0;
      const sec = Math.max(0, Math.ceil((end - now) / 1000));
      setQuizCountdown(sec);
      if (sec <= 0 && quizCountdownRef.current) {
        clearInterval(quizCountdownRef.current);
        quizCountdownRef.current = null;
      }
    };
    update();
    const t = setInterval(update, 500);
    quizCountdownRef.current = t;
    return () => {
      if (quizCountdownRef.current) clearInterval(quizCountdownRef.current);
      quizCountdownRef.current = null;
    };
  }, [quizSession?.status, quizSession?.questionEndsAt, quizSession?.currentQuestionId]);

  // Reset player answer state when new question goes live
  useEffect(() => {
    if (quizSession?.status === 'question_live' && quizSession.currentQuestionId) {
      setQuizAnswerSubmitted(false);
      setQuizMyResponse(null);
      setQuizSelectedIndices([]);
      const round = quizSession.quizRoundIndex ?? 1;
      getMyResponse(sessionId, currentUser?.uid ?? '').then((r) => {
        if (
          r &&
          r.currentQuestionId === quizSession.currentQuestionId &&
          (r.quizRoundIndex ?? 1) === round
        ) {
          setQuizAnswerSubmitted(true);
          setQuizMyResponse({ selectedIndices: r.selectedIndices, isCorrect: r.isCorrect, pointsAwarded: r.pointsAwarded });
        }
      });
    }
  }, [sessionId, currentUser?.uid, quizSession?.status, quizSession?.currentQuestionId, quizSession?.quizRoundIndex]);

  // Subscribe to response count (host)
  useEffect(() => {
    if (!quizSession || !isSessionHost || !quizSession.currentQuestionId) return;
    return subscribeResponseCount(
      sessionId,
      quizSession.currentQuestionId,
      setQuizResponseCount,
      quizSession.quizRoundIndex ?? null
    );
  }, [sessionId, isSessionHost, quizSession?.currentQuestionId, quizSession?.quizRoundIndex]);

  // Battle modes: host client auto-advances after question timer + configured gap (no Next click).
  useEffect(() => {
    if (!isSessionHost || !currentUser || !quizSession || !isBattleQuizMode(quizSession.gameMode)) return;
    const delay =
      quizSession.gameMode === 'battle_royale'
        ? quizSession.battleRoyaleConfig?.autoAdvanceDelayMs
        : quizSession.teamBattleRoyaleConfig?.autoAdvanceDelayMs;
    if (delay == null || delay <= 0) return;
    if (quizSession.status !== 'question_live' || !quizSession.currentQuestionId) return;
    const ends = quizSession.questionEndsAt ?? 0;
    if (!ends || Date.now() <= ends) return;
    const round = quizSession.quizRoundIndex ?? 1;
    const dedupeKey = `${round}:${quizSession.currentQuestionId}`;
    if (brAutoAdvanceDedupeRef.current === dedupeKey) return;
    const prevIdx = quizSession.questionIndex ?? 0;
    const total = quizSession.questionOrder?.length ?? 0;
    const timer = window.setTimeout(async () => {
      if (brAutoAdvanceDedupeRef.current === dedupeKey) return;
      brAutoAdvanceDedupeRef.current = dedupeKey;
      try {
        const res = await advanceQuiz(sessionId, currentUser.uid);
        if (res.ok) {
          if (res.completed) {
            await runHostQuizCompletedFollowUp();
          } else {
            await appendBattleLog(`📋 Next question (${prevIdx + 2}/${total})`);
          }
        } else {
          brAutoAdvanceDedupeRef.current = null;
        }
        if (res.error) console.warn('auto advance quiz:', res.error);
      } catch (e) {
        console.error('auto advance quiz', e);
        brAutoAdvanceDedupeRef.current = null;
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [
    isSessionHost,
    currentUser,
    sessionId,
    quizSession?.gameMode,
    quizSession?.status,
    quizSession?.currentQuestionId,
    quizSession?.questionEndsAt,
    quizSession?.quizRoundIndex,
    quizSession?.questionIndex,
    quizSession?.questionOrder?.length,
    quizSession?.battleRoyaleConfig?.autoAdvanceDelayMs,
    quizSession?.teamBattleRoyaleConfig?.autoAdvanceDelayMs,
    runHostQuizCompletedFollowUp,
    appendBattleLog,
  ]);

  // Host UI: countdown between end of answer timer and auto-advance
  useEffect(() => {
    if (!isSessionHost || !quizSession || !isBattleQuizMode(quizSession.gameMode)) {
      setBrInterQuestionSecondsLeft(null);
      return;
    }
    const delay =
      quizSession.gameMode === 'battle_royale'
        ? quizSession.battleRoyaleConfig?.autoAdvanceDelayMs
        : quizSession.teamBattleRoyaleConfig?.autoAdvanceDelayMs;
    if (delay == null || delay <= 0) {
      setBrInterQuestionSecondsLeft(null);
      return;
    }
    if (quizSession.status !== 'question_live') {
      setBrInterQuestionSecondsLeft(null);
      return;
    }
    const ends = quizSession.questionEndsAt ?? 0;
    if (!ends) {
      setBrInterQuestionSecondsLeft(null);
      return;
    }
    const tick = () => {
      const now = Date.now();
      if (now <= ends) {
        setBrInterQuestionSecondsLeft(null);
        return;
      }
      const target = ends + delay;
      setBrInterQuestionSecondsLeft(Math.max(0, Math.ceil((target - now) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 400);
    return () => clearInterval(id);
  }, [
    isSessionHost,
    quizSession?.gameMode,
    quizSession?.status,
    quizSession?.questionEndsAt,
    quizSession?.battleRoyaleConfig?.autoAdvanceDelayMs,
    quizSession?.teamBattleRoyaleConfig?.autoAdvanceDelayMs,
  ]);

  // Load vault data for all players
  const [playerVaultData, setPlayerVaultData] = useState<Record<string, {
    vaultHealth: number;
    maxVaultHealth: number;
    shieldStrength: number;
    maxShieldStrength: number;
    currentPP: number;
    maxPP: number;
  }>>({});

  useEffect(() => {
    const loadVaultData = async () => {
      const vaultDataMap: Record<string, any> = {};
      
      for (const player of sessionPlayers) {
        try {
          const vaultRef = doc(db, 'vaults', player.userId);
          const vaultDoc = await getDoc(vaultRef);
          
          if (vaultDoc.exists()) {
            const vaultData = vaultDoc.data();
            const student = students.find(s => s.id === player.userId);
            // Use vault document as source of truth (match Vault Management / Battle Arena)
            const maxPP = vaultData.capacity || 1000; // Capacity is the max PP
            const currentPP = vaultData.currentPP ?? student?.powerPoints ?? player.powerPoints ?? 0;
            const maxVaultHealth = Math.floor(maxPP * 0.1); // Health is 10% of max PP
            const vaultHealth = vaultData.vaultHealth !== undefined
              ? Math.min(vaultData.vaultHealth, maxVaultHealth, vaultData.currentPP ?? currentPP)
              : Math.min(currentPP, maxVaultHealth);

            vaultDataMap[player.userId] = {
              vaultHealth,
              maxVaultHealth,
              shieldStrength: vaultData.shieldStrength ?? 0,
              maxShieldStrength: vaultData.maxShieldStrength ?? 100,
              currentPP,
              maxPP
            };
          } else {
            // Default values if no vault exists
            const student = students.find(s => s.id === player.userId);
            const currentPP = student?.powerPoints || player.powerPoints;
            vaultDataMap[player.userId] = {
              vaultHealth: Math.floor(currentPP * 0.1),
              maxVaultHealth: Math.floor(currentPP * 0.1),
              shieldStrength: 100,
              maxShieldStrength: 100,
              currentPP,
              maxPP: currentPP
            };
          }
        } catch (error) {
          console.error(`Error loading vault for ${player.userId}:`, error);
        }
      }
      
      setPlayerVaultData(vaultDataMap);
    };

    if (sessionPlayers.length > 0) {
      loadVaultData();
    }
  }, [sessionPlayers, students]);

  // Fetch squad abbreviations for all students
  useEffect(() => {
    const fetchSquadAbbreviations = async () => {
      const studentIds = students.map(s => s.id).filter(id => id);
      
      if (studentIds.length > 0) {
        const abbreviations = await getUserSquadAbbreviations(studentIds);
        setSquadAbbreviations(abbreviations);
      }
    };
    
    fetchSquadAbbreviations();
  }, [students]);

  // Listen to user profile updates in real-time to ensure consistent display across all game modes
  useEffect(() => {
    if (students.length === 0) return;

    const unsubscribes: (() => void)[] = [];
    const profilesMap = new Map<string, { displayName: string; photoURL?: string }>();

    // Set initial profiles from students array
    students.forEach(student => {
      profilesMap.set(student.id, {
        displayName: student.displayName,
        photoURL: student.photoURL
      });
    });
    setUserProfiles(profilesMap);

    // Set up real-time listeners for each user's profile
    students.forEach(student => {
      const userRef = doc(db, 'users', student.id);
      const unsubscribe = onSnapshot(userRef, (userDoc) => {
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setUserProfiles(prev => {
            const updated = new Map(prev);
            updated.set(student.id, {
              displayName: userData.displayName || student.displayName || 'Unknown',
              photoURL: userData.photoURL || student.photoURL
            });
            return updated;
          });
        }
      }, (error) => {
        // Suppress Firestore internal assertion errors
        if (error instanceof Error && 
            (error.message?.includes('INTERNAL ASSERTION FAILED') || 
             error.message?.includes('Unexpected state'))) {
          return;
        }
        console.error(`Error listening to user profile ${student.id}:`, error);
      });
      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach(unsubscribe => unsubscribe());
    };
  }, [students]);

  // Keep sessionPlayers displayName/photoURL in sync with userProfiles (profile is source of truth)
  // Important: do NOT write back to Firestore here (avoid feedback loops). We only normalize for UI/BattleEngine rendering.
  useEffect(() => {
    if (sessionPlayers.length === 0 || userProfiles.size === 0) return;

    setSessionPlayers(prev => {
      let changed = false;
      const next = prev.map(p => {
        const profile = userProfiles.get(p.userId);
        if (!profile) return p;

        const nextDisplayName = profile.displayName || p.displayName;
        const nextPhotoURL = profile.photoURL || p.photoURL;

        if (nextDisplayName !== p.displayName || nextPhotoURL !== p.photoURL) {
          changed = true;
          return { ...p, displayName: nextDisplayName, photoURL: nextPhotoURL };
        }
        return p;
      });

      return changed ? next : prev;
    });
  }, [userProfiles, sessionPlayers.length]);

  // Check if current user is admin or scorekeeper
  useEffect(() => {
    console.log('[InSessionBattle] Permission check useEffect triggered', { currentUserId: currentUser?.uid, currentUserEmail: currentUser?.email });
    
    const checkUserPermissions = async () => {
      // Always start with false values and reset permissionsChecked
      setIsAdminUser(false);
      setIsScorekeeper(false);
      setPermissionsChecked(false);
      
      console.log('[InSessionBattle] Starting permission check...');
      
      if (!currentUser) {
        setPermissionsChecked(true);
        console.log('[InSessionBattle] No current user - permissions denied');
        return;
      }

      try {
        // Check admin status - check userRoles collection first, then fallback to email
        const hasAdminRole = await isUserAdmin(currentUser.uid, currentUser.email);
        
        console.log('[InSessionBattle] Admin check result:', {
          userId: currentUser.uid,
          email: currentUser.email,
          hasAdminRole,
          note: 'Only exact email matches or userRoles collection grant admin status'
        });
        
        // Check scorekeeper role - verify it's actually in the database
        const roleDoc = await getDoc(doc(db, 'userRoles', currentUser.uid));
        let isScorekeeperUser = false;
        
        if (roleDoc.exists()) {
          const roleData = roleDoc.data();
          const role = roleData.role;
          const rolesArray = roleData.roles;
          
          // STRICT CHECK: Only true if:
          // 1. role field is explicitly 'scorekeeper' (not 'student' or anything else)
          // OR
          // 2. roles array exists, is an array, and explicitly contains 'scorekeeper'
          const hasScorekeeperRole = role === 'scorekeeper';
          const hasScorekeeperInArray = Array.isArray(rolesArray) && rolesArray.includes('scorekeeper');
          
          // If role is 'student', user is NOT a scorekeeper unless explicitly in roles array
          if (role === 'student') {
            isScorekeeperUser = hasScorekeeperInArray; // Only true if in roles array
          } else {
            isScorekeeperUser = hasScorekeeperRole || hasScorekeeperInArray;
          }
          
          console.log('[InSessionBattle] Scorekeeper role check:', {
            role,
            rolesArray,
            hasScorekeeperRole,
            hasScorekeeperInArray,
            isScorekeeperUser
          });
        } else {
          // No role document = not a scorekeeper
          isScorekeeperUser = false;
          console.log('[InSessionBattle] No role document found - not a scorekeeper');
        }
        
        // Final validation: explicitly deny if role is 'student' without scorekeeper in array
        if (roleDoc.exists()) {
          const roleData = roleDoc.data();
          if (roleData.role === 'student' && !(Array.isArray(roleData.roles) && roleData.roles.includes('scorekeeper'))) {
            isScorekeeperUser = false;
            console.log('[InSessionBattle] Explicitly denying scorekeeper access - user is student without scorekeeper in roles array');
          }
        }
        
        // CRITICAL: Only set to true if explicitly confirmed - default is false
        // Use strict boolean checks to ensure no truthy/falsy issues
        const finalIsAdmin = Boolean(hasAdminRole === true);
        const finalIsScorekeeper = Boolean(isScorekeeperUser === true);
        
        // CRITICAL: Explicitly set to false if not confirmed
        setIsAdminUser(finalIsAdmin);
        setIsScorekeeper(finalIsScorekeeper);
        
        console.log('[InSessionBattle] Setting permission states:', {
          finalIsAdmin,
          finalIsScorekeeper,
          willShowButton: finalIsAdmin || finalIsScorekeeper,
          permissionsChecked: true
        });
        
        // Debug logging with explicit values
        console.log('[InSessionBattle] User permissions check COMPLETE:', {
          userId: currentUser.uid,
          email: currentUser.email,
          hasAdminRole: hasAdminRole,
          isScorekeeperUser: isScorekeeperUser,
          roleDocExists: roleDoc.exists(),
          roleData: roleDoc.exists() ? roleDoc.data() : null,
          settingIsAdminUser: finalIsAdmin,
          settingIsScorekeeper: finalIsScorekeeper,
          willShowButton: finalIsAdmin || finalIsScorekeeper,
          typeOfIsAdmin: typeof finalIsAdmin,
          typeOfIsScorekeeper: typeof finalIsScorekeeper
        });
      } catch (error) {
        console.error('[InSessionBattle] Error checking user permissions:', error);
        // On error, explicitly set to false - user is NOT admin or scorekeeper
        setIsAdminUser(false);
        setIsScorekeeper(false);
        setPermissionsChecked(true); // Set checked to true so UI doesn't wait forever
        console.log('[InSessionBattle] Error occurred - permissions denied, buttons will be hidden');
      } finally {
        // Always set permissionsChecked to true after check completes (whether success or error)
        // This ensures UI doesn't wait forever, but buttons will only show if isAdminUser or isScorekeeper is true
        setPermissionsChecked(true);
      }
    };

    checkUserPermissions();
  }, [currentUser]);

  // Convert students to opponents format for BattleEngine
  const opponents = sessionPlayers
    .filter(p => p.userId !== currentUser?.uid)
    .map(player => {
      const student = students.find(s => s.id === player.userId);
      const profile = userProfiles.get(player.userId);
      
      // In-Session mode: Use hp/shield from session player if available
      // Otherwise fall back to vault data
      const useSessionHealth = (player.hp !== undefined || player.shield !== undefined);
      
      let health, maxHealth, shield, maxShield, pp, maxPP;
      
      if (useSessionHealth) {
        health = player.hp ?? 100;
        shield = player.shield ?? 100;
        pp = player.powerPoints ?? 0;
        maxPP = student?.powerPoints || player.powerPoints || 1000;
        // Use vault max when available so display reflects upgrades; otherwise session max
        const vaultForMax = playerVaultData[player.userId];
        maxHealth = vaultForMax?.maxVaultHealth ?? player.maxHp ?? 100;
        maxShield = vaultForMax?.maxShieldStrength ?? player.maxShield ?? 100;
      } else {
        const vaultData = playerVaultData[player.userId] || {
          vaultHealth: Math.floor((student?.powerPoints || player.powerPoints) * 0.1),
          maxVaultHealth: Math.floor((student?.powerPoints || player.powerPoints) * 0.1),
          shieldStrength: 100,
          maxShieldStrength: 100,
          currentPP: student?.powerPoints || player.powerPoints,
          maxPP: student?.powerPoints || player.powerPoints
        };
        health = vaultData.vaultHealth;
        maxHealth = vaultData.maxVaultHealth;
        shield = vaultData.shieldStrength;
        maxShield = vaultData.maxShieldStrength;
        pp = vaultData.currentPP;
        maxPP = vaultData.maxPP;
      }
      
      return {
        id: player.userId,
        name: profile?.displayName || player.displayName,
        currentPP: pp,
        maxPP: maxPP,
        vaultHealth: health,
        maxVaultHealth: maxHealth,
        shieldStrength: shield,
        maxShieldStrength: maxShield,
        level: player.level,
        photoURL: profile?.photoURL || player.photoURL,
        speed: 50
      };
    });

  const allies = useMemo(
    () =>
      sessionPlayers
        .filter(p => p.userId === currentUser?.uid)
        .map(player => {
          const student = students.find(s => s.id === player.userId);
          const profile = userProfiles.get(player.userId);

          // In-Session mode: Use hp/shield from session player if available
          // Otherwise fall back to vault data
          const useSessionHealth = player.hp !== undefined || player.shield !== undefined;

          let health, maxHealth, shield, maxShield, pp, maxPP;

          if (useSessionHealth) {
            health = player.hp ?? 100;
            shield = player.shield ?? 100;
            pp = player.powerPoints ?? 0;
            maxPP = vault?.capacity || student?.powerPoints || player.powerPoints || 1000;
            const vaultForMax = playerVaultData[player.userId];
            maxHealth = vaultForMax?.maxVaultHealth ?? player.maxHp ?? 100;
            maxShield = vaultForMax?.maxShieldStrength ?? player.maxShield ?? 100;
          } else {
            const vaultData =
              playerVaultData[player.userId] ||
              (vault
                ? {
                    vaultHealth: Math.floor(vault.currentPP * 0.1),
                    maxVaultHealth: Math.floor((vault.capacity || vault.currentPP) * 0.1),
                    shieldStrength: vault.shieldStrength || 100,
                    maxShieldStrength: vault.maxShieldStrength || 100,
                    currentPP: vault.currentPP,
                    maxPP: vault.capacity || 1000
                  }
                : {
                    vaultHealth: 100,
                    maxVaultHealth: 100,
                    shieldStrength: 100,
                    maxShieldStrength: 100,
                    currentPP: student?.powerPoints || player.powerPoints,
                    maxPP: student?.powerPoints || player.powerPoints
                  });
            health = vaultData.vaultHealth;
            maxHealth = vaultData.maxVaultHealth;
            shield = vaultData.shieldStrength;
            maxShield = vaultData.maxShieldStrength;
            pp = vaultData.currentPP;
            maxPP = vaultData.maxPP;
          }

          return {
            id: player.userId,
            name: profile?.displayName || player.displayName,
            currentPP: pp,
            maxPP: maxPP,
            vaultHealth: health,
            maxVaultHealth: maxHealth,
            shieldStrength: shield,
            maxShieldStrength: maxShield,
            level: player.level,
            photoURL: profile?.photoURL || player.photoURL,
            isPlayer: true,
            speed: 50,
            movesEarned: player.movesEarned ?? 0
          };
        }),
    [sessionPlayers, currentUser?.uid, students, userProfiles, playerVaultData, vault]
  );

  /** Active construct attack skills — same IDs as BattleEngine (`construct-skill::…`). */
  const constructSkillMoves = useMemo(() => {
    if (!currentUser || !Array.isArray(cpuOpponentMoves) || cpuOpponentMoves.length === 0) return [] as any[];
    const summons = sessionSummons.filter(s => s.summonerId === currentUser.uid);
    if (summons.length === 0) return [];

    const normalize = (s?: string) => (s || '').toLowerCase().trim();
    const out: any[] = [];

    summons.forEach(summon => {
      const summonName = normalize(summon.name);
      const summonElem = normalize(summon.summonElementalType);
      const source = cpuOpponentMoves.find((opp: any) => {
        const oppId = normalize(opp?.id);
        const oppName = normalize(opp?.name);
        if (summonName && oppName === summonName) return true;
        if (summonName && oppId === summonName.replace(/\s+/g, '-')) return true;
        if (summonElem === 'light' && (oppId === 'light-construct' || oppName === 'light construct')) return true;
        return false;
      });

      const sourceMoves = Array.isArray(source?.moves) ? source.moves : [];
      sourceMoves.forEach((m: any, idx: number) => {
        if ((m?.type || 'attack') !== 'attack') return;
        const min = typeof m?.damageRange?.min === 'number' ? m.damageRange.min : undefined;
        const max = typeof m?.damageRange?.max === 'number' ? m.damageRange.max : undefined;
        const baseDamage =
          typeof m?.baseDamage === 'number'
            ? m.baseDamage
            : min !== undefined && max !== undefined
              ? Math.floor((min + max) / 2)
              : 0;
        const constructMoveId = `construct-skill::${summon.id}::${m?.id || idx}`;
        out.push({
          id: constructMoveId,
          name: `${summon.name}: ${m?.name || 'Construct Attack'}`,
          description: m?.description || `${summon.name} attacks the enemy.`,
          category: 'system',
          type: 'attack',
          level: 1,
          cost: 0,
          damage: baseDamage,
          cooldown: 0,
          currentCooldown: 0,
          unlocked: true,
          masteryLevel: 1,
          targetType: 'single'
        });
      });
    });

    return out;
  }, [currentUser, cpuOpponentMoves, sessionSummons]);

  const alliesForBattleEngine = useMemo(() => {
    const summonOps = sessionSummons.map(s => ({
      id: s.id,
      name: s.name,
      isSummon: true,
      summonerId: s.summonerId,
      summonElementalType: (s.summonElementalType || 'light') as any,
      vaultHealth: s.hp,
      maxVaultHealth: s.maxHp,
      shieldStrength: s.shield,
      maxShieldStrength: s.maxShield,
      currentPP: 100,
      maxPP: 100,
      level: 1,
      isAI: true,
      controller: 'ai' as const,
      photoURL: s.image,
      image: s.image
    }));
    return [...allies, ...summonOps];
  }, [allies, sessionSummons]);

  const handleAlliesUpdateFromBattle = useCallback((updated: any[]) => {
    const summons = updated.filter((a: any) => a.isSummon && a.summonerId);
    setSessionSummons(
      summons.map(s => ({
        id: s.id,
        summonerId: s.summonerId,
        name: s.name,
        hp: s.vaultHealth ?? 100,
        maxHp: s.maxVaultHealth ?? 100,
        shield: s.shieldStrength ?? 0,
        maxShield: s.maxShieldStrength ?? 0,
        summonElementalType: s.summonElementalType,
        image: s.photoURL || s.image
      }))
    );
  }, []);

  // Handle participation tracking
  const handleAddParticipation = async (userId: string) => {
    // Security check: Only admins and scorekeepers can add participation
    if (!currentUser) {
      console.error('Unauthorized: No user logged in');
      return;
    }

    // Verify user has permission - only Yondaime can add participation
    const isYondaime = currentUser?.email === 'edm21179@gmail.com' || 
                       currentUser?.displayName === 'Yondaime' || 
                       currentUser?.displayName?.toLowerCase() === 'yondaime';
    
    if (!isYondaime) {
      console.error('[InSessionBattle] Unauthorized: Only Yondaime can add participation');
      return;
    }

    try {
      const sessionRef = doc(db, 'inSessionRooms', sessionId);
      const sessionDoc = await getDoc(sessionRef);

      if (!sessionDoc.exists()) return;

      const data = sessionDoc.data();
      const players: SessionPlayer[] = data.players || [];
      const existingPlayer = players.find(p => p.userId === userId);
      const playerName =
        existingPlayer?.displayName ||
        students.find(s => s.id === userId)?.displayName ||
        'Player';

      // Track participation first (+ session powerPoints for MST MKT) so our follow-up merge does not overwrite PP.
      await trackParticipation(sessionId, userId, 1, { playerDisplayName: playerName });

      const freshSnap = await getDoc(sessionRef);
      if (!freshSnap.exists()) return;
      const freshData = freshSnap.data();
      const freshPlayers: SessionPlayer[] = freshData.players || [];

      let updatedPlayers: SessionPlayer[];

      if (existingPlayer) {
        updatedPlayers = freshPlayers.map(p => {
          if (p.userId === userId) {
            const newParticipationCount = (p.participationCount || 0) + 1;
            const newMovesEarned = Math.floor(newParticipationCount / 1);
            return {
              ...p,
              participationCount: newParticipationCount,
              movesEarned: newMovesEarned,
            };
          }
          return p;
        });
      } else {
        const student = students.find(s => s.id === userId);
        if (!student) return;

        const userDoc = await getDoc(doc(db, 'users', userId));
        const userData = userDoc.exists() ? userDoc.data() : {};
        const latestProfile = userProfiles.get(userId);

        const displayName = latestProfile?.displayName || userData.displayName || student.displayName;
        const photoURL = latestProfile?.photoURL || userData.photoURL || student.photoURL;

        const basePp = student.powerPoints || 0;
        const newPlayer: SessionPlayer = {
          userId: student.id,
          displayName,
          photoURL,
          level: student.level || getLevelFromXP(student.xp || 0) || 1,
          powerPoints: basePp + LIVE_EVENT_PP_PER_PARTICIPATION_POINT,
          participationCount: 1,
          movesEarned: 1,
        };

        updatedPlayers = [...freshPlayers, newPlayer];
      }

      const updatedPlayer = updatedPlayers.find(p => p.userId === userId);
      const newLogEntry = `✨ ${updatedPlayer?.displayName || playerName} participated! (+1 participation, ${updatedPlayer?.movesEarned || 0} moves earned)`;
      const updatedLog = [...(freshData.battleLog || []), newLogEntry];

      await updateDoc(sessionRef, {
        players: updatedPlayers,
        battleLog: updatedLog,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('Error adding participation:', error);
    }
  };

  // Handle adding participation points (directly adds 1 move)
  const handleAddParticipationPoint = async (userId: string) => {
    // Security check: Only admins and scorekeepers can add participation points
    if (!currentUser) {
      console.error('Unauthorized: No user logged in');
      return;
    }

    // Verify user has permission - only Yondaime can add participation points
    const isYondaime = currentUser?.email === 'edm21179@gmail.com' || 
                       currentUser?.displayName === 'Yondaime' || 
                       currentUser?.displayName?.toLowerCase() === 'yondaime';
    
    if (!isYondaime) {
      console.error('[InSessionBattle] Unauthorized: Only Yondaime can add participation points');
      return;
    }

    try {
      const sessionRef = doc(db, 'inSessionRooms', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) return;

      const data = sessionDoc.data();
      const players: SessionPlayer[] = data.players || [];
      const updatedPlayers = players.map(p => {
        if (p.userId === userId) {
          return {
            ...p,
            movesEarned: (p.movesEarned || 0) + 1,
            powerPoints: (p.powerPoints ?? 0) + LIVE_EVENT_PP_PER_PARTICIPATION_POINT,
          };
        }
        return p;
      });

      // Update battle log
      const player = players.find(p => p.userId === userId);
      const newLogEntry = `✨ ${player?.displayName || 'Player'} earned +1 Par. Pt. (+${LIVE_EVENT_PP_PER_PARTICIPATION_POINT} PP for MST MKT, ${updatedPlayers.find(p => p.userId === userId)?.movesEarned || 0} moves available)`;
      const updatedLog = [...(data.battleLog || []), newLogEntry];

      await updateDoc(sessionRef, {
        players: updatedPlayers,
        battleLog: updatedLog,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error adding participation point:', error);
    }
  };

  // Handle PP adjustment
  const handleAdjustPP = async (userId: string, amount: number) => {
    // Security check: Only admins and scorekeepers can adjust PP
    if (!currentUser) {
      console.error('[InSessionBattle] Unauthorized: No user logged in');
      return;
    }

    // Verify user has permission - only Yondaime can adjust PP
    const isYondaime = currentUser?.email === 'edm21179@gmail.com' || 
                       currentUser?.displayName === 'Yondaime' || 
                       currentUser?.displayName?.toLowerCase() === 'yondaime';
    
    if (!isYondaime) {
      console.error('[InSessionBattle] Unauthorized: Only Yondaime can adjust PP');
      return;
    }

    try {
      // Update student document
      const studentRef = doc(db, 'students', userId);
      const studentDoc = await getDoc(studentRef);
      
      if (!studentDoc.exists()) return;

      const currentPP = studentDoc.data().powerPoints || 0;
      const newPP = Math.max(0, currentPP + amount);

      await updateDoc(studentRef, {
        powerPoints: newPP
      });

      // Update vault if it exists
      const vaultRef = doc(db, 'vaults', userId);
      const vaultDoc = await getDoc(vaultRef);
      if (vaultDoc.exists()) {
        await updateDoc(vaultRef, {
          currentPP: newPP
        });
      }

      // Update session players
      const sessionRef = doc(db, 'inSessionRooms', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      if (sessionDoc.exists()) {
        const data = sessionDoc.data();
        const players: SessionPlayer[] = data.players || [];
        const updatedPlayers = players.map(p => {
          if (p.userId === userId) {
            return { ...p, powerPoints: newPP };
          }
          return p;
        });

        const player = players.find(p => p.userId === userId);
        const student = students.find(s => s.id === userId);
        const playerName = player?.displayName || student?.displayName || 'Player';
        const newLogEntry = amount > 0 
          ? `💰 ${playerName} gained ${amount} PP!`
          : `💰 ${playerName} lost ${Math.abs(amount)} PP!`;
        const updatedLog = [...(data.battleLog || []), newLogEntry];

        await updateDoc(sessionRef, {
          players: updatedPlayers,
          battleLog: updatedLog,
          updatedAt: serverTimestamp()
        });
      }

      // Refresh vault data for current user if they're the one being updated
      if (userId === currentUser?.uid) {
        await refreshVaultData();
      }
    } catch (error) {
      console.error('Error adjusting PP:', error);
    }
  };

  // Custom move consumption - check participation instead of offline moves
  const handleMoveConsumption = useCallback(async (): Promise<boolean> => {
    if (!currentUser) return false;

    try {
      const sessionRef = doc(db, 'inSessionRooms', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) return false;

      const data = sessionDoc.data();
      const players: SessionPlayer[] = data.players || [];
      const player = players.find(p => p.userId === currentUser.uid);

      if (!player) return false;

      // Check if player has moves available from participation
      if (player.movesEarned > 0) {
        // Consume a move
        const updatedPlayers = players.map(p => {
          if (p.userId === currentUser.uid) {
            return {
              ...p,
              movesEarned: Math.max(0, p.movesEarned - 1)
            };
          }
          return p;
        });

        await updateDoc(sessionRef, {
          players: updatedPlayers,
          updatedAt: serverTimestamp()
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error checking move consumption:', error);
      return false;
    }
  }, [currentUser, sessionId]);

  // Handle battle log updates from BattleEngine
  const handleBattleLogUpdate = useCallback(async (newLog: string[]) => {
    try {
      const sessionRef = doc(db, 'inSessionRooms', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) return;
      
      const sessionData = sessionDoc.data();
      const currentLog = sessionData.battleLog || [];
      
      // Only update if there are new log entries (prevent redundant updates)
      if (newLog.length > currentLog.length) {
        const newEntries = newLog.slice(currentLog.length);
        debug('inSessionBattle', `Adding ${newEntries.length} new battle log entries`, newEntries);
        
        await updateDoc(sessionRef, {
          battleLog: newLog,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      debugError('inSessionBattle', 'Error updating battle log', error);
    }
  }, [sessionId]);

  // Handle battle end
  const handleBattleEnd = async (result: 'victory' | 'defeat' | 'escape', winnerId?: string, loserId?: string) => {
    // Update battle log
    try {
      const sessionRef = doc(db, 'inSessionRooms', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (sessionDoc.exists()) {
        const data = sessionDoc.data();
        const updatedLog = [...(data.battleLog || []), `🏁 Battle ended: ${result}`];
        await updateDoc(sessionRef, {
          battleLog: updatedLog,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error updating battle log:', error);
    }
  };

  const currentPlayer = sessionPlayers.find(p => p.userId === currentUser?.uid);

  /** Battle / Team BR: eliminated players and eliminator names for the center column */
  const battleRoyaleEliminations = useMemo(() => {
    if (!quizSession || !isBattleQuizMode(quizSession.gameMode)) return [];
    const nameFor = (uid: string) =>
      userProfiles.get(uid)?.displayName ||
      sessionPlayers.find((p) => p.userId === uid)?.displayName ||
      students.find((s) => s.id === uid)?.displayName ||
      'Unknown';
    return sessionPlayers
      .filter((p) => p.eliminated)
      .map((p) => ({
        victimId: p.userId,
        victimName: p.displayName || 'Player',
        eliminatorId: p.eliminatedBy,
        eliminatorName: p.eliminatedBy ? nameFor(p.eliminatedBy) : null,
      }))
      .sort((a, b) => a.victimName.localeCompare(b.victimName, undefined, { sensitivity: 'base' }));
  }, [quizSession, sessionPlayers, userProfiles, students]);

  const normalizeEquippedArtifacts = (raw: any): InspectArtifactEntry[] => {
    if (!raw) return [];
    const entries: InspectArtifactEntry[] = [];
    const perkById = new Map(ARTIFACT_PERK_OPTIONS.map((p) => [p.id, p]));
    const perkByLabel = new Map(ARTIFACT_PERK_OPTIONS.map((p) => [p.label.toLowerCase(), p]));
    const readArtifactLevel = (value: any): number | null => {
      const candidates = [value?.level, value?.artifactLevel, value?.upgradeLevel, value?.currentLevel];
      for (const c of candidates) {
        const n = Number(c);
        if (Number.isFinite(n) && n > 0) return Math.floor(n);
      }
      return null;
    };
    const pushArtifact = (slot: string, value: any) => {
      if (!value) return;
      const name =
        value.name ||
        value.label ||
        value.artifactName ||
        value.id ||
        value.artifactId ||
        'Unknown Artifact';
      const rawPerks = Array.isArray(value.perks)
        ? value.perks
        : (typeof value.perk === 'string' ? [value.perk] : []);
      const perks = rawPerks
        .filter((p: unknown): p is string => typeof p === 'string' && p.trim().length > 0)
        .map((p: string) => {
          const byId = perkById.get(p);
          if (byId) return byId;
          const byLabel = perkByLabel.get(p.toLowerCase());
          if (byLabel) return byLabel;
          return { id: p, label: p, description: '' };
        })
        .map((p: { id: string; label: string; description?: string }) => ({ id: p.id, label: p.label, description: p.description || '' }));
      entries.push({
        slot,
        name: String(name),
        image: typeof value.image === 'string' ? value.image : null,
        level: readArtifactLevel(value),
        rarity: value.rarity ?? null,
        perks
      });
    };

    if (Array.isArray(raw)) {
      raw.forEach((artifact, idx) => pushArtifact(`slot-${idx + 1}`, artifact));
      return entries;
    }

    if (typeof raw === 'object') {
      Object.entries(raw).forEach(([slot, artifact]) => pushArtifact(slot, artifact));
    }

    return entries;
  };

  const applySkillUpgradeLevelsToLoadout = (
    loadout: SessionLoadout,
    skillLevelsById: Record<string, number>
  ): SessionLoadout => {
    const apply = (moves: any[] = []) =>
      moves.map((m: any) => {
        const upgraded = Number(skillLevelsById[m?.id]);
        const artifactGranted = Number(m?.artifactGrant?.artifactLevel);
        const fromMove = Number(m?.level);
        const resolved = Number.isFinite(upgraded) && upgraded > 0
          ? upgraded
          : Number.isFinite(artifactGranted) && artifactGranted > 0
            ? artifactGranted
            : Number.isFinite(fromMove) && fromMove > 0
              ? fromMove
              : 1;
        return { ...m, level: Math.floor(resolved) };
      });

    return {
      ...loadout,
      manifest: apply(loadout.manifest || []),
      elemental: apply(loadout.elemental || []),
      rrCandy: apply(loadout.rrCandy || []),
      artifact: apply(loadout.artifact || []),
    };
  };

  const isRRCandyMoveLike = (move: any): boolean => {
    const id = String(move?.id || '').toLowerCase();
    const name = String(move?.name || '').toLowerCase();
    return (
      id.includes('rr-candy') ||
      name === 'shield off' ||
      name === 'shield on' ||
      name === 'vault hack' ||
      name === 'shield restoration'
    );
  };

  const normalizeLoadoutBuckets = (loadout: SessionLoadout): SessionLoadout => {
    const all = [
      ...(loadout.manifest || []),
      ...(loadout.elemental || []),
      ...(loadout.rrCandy || []),
      ...(loadout.artifact || []),
    ];
    const dedup = new Map<string, any>();
    all.forEach((m: any, idx: number) => dedup.set(String(m?.id || `${m?.name || 'move'}-${idx}`), m));
    const merged = Array.from(dedup.values());
    return {
      ...loadout,
      manifest: merged.filter((m: any) => m?.category === 'manifest'),
      elemental: merged.filter((m: any) => m?.category === 'elemental'),
      rrCandy: merged.filter((m: any) => isRRCandyMoveLike(m)),
      artifact: merged.filter((m: any) => m?.category === 'system' && !isRRCandyMoveLike(m)),
    };
  };

  const openPlayerInspectModal = async (playerId: string) => {
    const selectedStudent = allClassStudents.find((s) => s.id === playerId);
    const selectedSessionPlayer = sessionPlayers.find((p) => p.userId === playerId);
    const selectedProfile = userProfiles.get(playerId);
    const displayName =
      selectedProfile?.displayName ||
      selectedSessionPlayer?.displayName ||
      selectedStudent?.displayName ||
      'Player';
    const photoURL = selectedProfile?.photoURL || selectedSessionPlayer?.photoURL || selectedStudent?.photoURL;

    setSelectedInspectPlayerId(playerId);
    setPlayerInspectTab('loadout');
    setShowPlayerInspectModal(true);
    setPlayerInspectLoading(true);
    setPlayerInspectError(null);
    setPlayerInspectData({
      userId: playerId,
      displayName,
      photoURL,
      powerLevel:
        finitePowerLevel(selectedSessionPlayer?.powerLevel) ??
        finitePowerLevel(selectedStudent?.powerLevel),
      loadout: null,
      artifacts: [],
      skillLevelsById: {}
    });

    try {
      const studentRef = doc(db, 'students', playerId);
      const playerRef = doc(db, 'inSessionRooms', sessionId, 'players', playerId);
      const battleMovesRef = doc(db, 'battleMoves', playerId);
      const [studentSnap, playerSnap, skillState, battleMovesSnap] = await Promise.all([
        getDoc(studentRef),
        getDoc(playerRef),
        getPlayerSkillState(playerId),
        getDoc(battleMovesRef)
      ]);

      const studentData = studentSnap.exists() ? studentSnap.data() : {};
      const playerData = playerSnap.exists() ? playerSnap.data() : {};
      const battleMoves = battleMovesSnap.exists() ? ((battleMovesSnap.data().moves || []) as any[]) : [];
      const skillLevelsById = Object.entries(skillState?.skillUpgrades || {}).reduce((acc, [skillId, data]: [string, any]) => {
        const lvl = Number(data?.level);
        if (Number.isFinite(lvl) && lvl > 0) acc[skillId] = Math.floor(lvl);
        return acc;
      }, {} as Record<string, number>);
      battleMoves.forEach((m: any) => {
        const id = String(m?.id || '');
        if (!id) return;
        const fromLevel = Number(m?.level);
        const fromMastery = Number(m?.masteryLevel);
        const best = Math.max(
          Number.isFinite(fromLevel) ? fromLevel : 0,
          Number.isFinite(fromMastery) ? fromMastery : 0,
          Number(skillLevelsById[id] || 0)
        );
        if (best > 0) skillLevelsById[id] = Math.floor(best);
      });
      let activeLoadout = (playerData.activeLoadout || null) as SessionLoadout | null;
      if (!activeLoadout) {
        // Fallback so players can still be inspected even when no session snapshot exists.
        const userElement = studentData.elementalAffinity || studentData.manifestationType || undefined;
        const equippedSkills = await getEquippedSkillsForBattle(playerId, userElement);
        activeLoadout = {
          manifest: equippedSkills.filter((s) => s.category === 'manifest'),
          elemental: equippedSkills.filter((s) => s.category === 'elemental'),
          rrCandy: equippedSkills.filter((s) => isRRCandyMoveLike(s)),
          artifact: equippedSkills.filter((s) => s.category === 'system' && !isRRCandyMoveLike(s)),
          snapshotAt: null
        };
      }
      if (activeLoadout) {
        activeLoadout = normalizeLoadoutBuckets(
          applySkillUpgradeLevelsToLoadout(activeLoadout, skillLevelsById)
        );
        // Always prefer canonical RR Candy payload so the inspector shows ON/OFF accurately.
        const rrCandyFromService = await getUserRRCandySkills(playerId, battleMoves as any[]);
        if (rrCandyFromService.length > 0) {
          const rrWithLevels = rrCandyFromService.map((m: any) => ({
            ...m,
            level: Math.max(
              1,
              Number(skillLevelsById[m?.id]) ||
                Number(m?.masteryLevel) ||
                Number(m?.level) ||
                1
            )
          }));
          activeLoadout = normalizeLoadoutBuckets({
            ...activeLoadout,
            rrCandy: rrWithLevels,
            artifact: [...(activeLoadout.artifact || [])]
          });
        }
      }
      const artifacts = normalizeEquippedArtifacts(studentData.equippedArtifacts);

      setPlayerInspectData({
        userId: playerId,
        displayName,
        photoURL,
        powerLevel:
          finitePowerLevel((studentData as Record<string, unknown>)?.powerLevel) ??
          finitePowerLevel(selectedSessionPlayer?.powerLevel) ??
          finitePowerLevel(selectedStudent?.powerLevel),
        loadout: activeLoadout,
        artifacts,
        skillLevelsById
      });
    } catch (error) {
      console.error('Failed to load player inspect data:', error);
      setPlayerInspectError('Could not load this player\'s loadout/artifacts right now.');
    } finally {
      setPlayerInspectLoading(false);
    }
  };

  useEffect(() => {
    const isEliminatedNow = currentPlayer?.eliminated === true;
    const becameEliminated = isEliminatedNow && !wasCurrentPlayerEliminatedRef.current;
    wasCurrentPlayerEliminatedRef.current = isEliminatedNow;

    if (!becameEliminated) return;

    setShowEliminatedQuizOverlay(true);
    if (eliminationOverlayTimeoutRef.current) {
      clearTimeout(eliminationOverlayTimeoutRef.current);
    }
    eliminationOverlayTimeoutRef.current = setTimeout(() => {
      setShowEliminatedQuizOverlay(false);
      eliminationOverlayTimeoutRef.current = null;
    }, 1800);
  }, [currentPlayer?.eliminated]);

  useEffect(() => {
    return () => {
      if (eliminationOverlayTimeoutRef.current) {
        clearTimeout(eliminationOverlayTimeoutRef.current);
      }
    };
  }, []);

  // Get all students in the class (not just those in session)
  // Create a combined list with session players and non-session students
  // Always use the latest profile data from userProfiles to ensure consistency
  const classStudentById = new Map(students.map((s) => [s.id, s]));
  const allKnownIds = new Set<string>([
    ...students.map((s) => s.id),
    ...sessionPlayers.map((p) => p.userId),
  ]);
  const allClassStudents = Array.from(allKnownIds).map((id) => {
    const classStudent = classStudentById.get(id);
    const sessionPlayer = sessionPlayers.find((p) => p.userId === id) || null;
    const latestProfile = userProfiles.get(id);

    // Build a resilient base row: class roster data when available, otherwise fall back to in-session data.
    const base: Student = classStudent || {
      id,
      displayName: sessionPlayer?.displayName || latestProfile?.displayName || 'Unknown',
      email: '',
      powerPoints: sessionPlayer?.powerPoints ?? 0,
      photoURL: sessionPlayer?.photoURL || latestProfile?.photoURL,
      level: sessionPlayer?.level,
      xp: undefined,
    };

    // Use latest profile data if available, otherwise fall back to row/session data
    const displayName = latestProfile?.displayName || sessionPlayer?.displayName || base.displayName;
    const photoURL = latestProfile?.photoURL || sessionPlayer?.photoURL || base.photoURL;

    return {
      ...base,
      displayName,
      photoURL,
      isInSession: !!sessionPlayer,
      sessionData: sessionPlayer,
    };
  });

  // Split all students evenly between left and right
  const midPoint = Math.ceil(allClassStudents.length / 2);
  const leftStudents = allClassStudents.slice(0, midPoint);
  const rightStudents = allClassStudents.slice(midPoint);

  const renderSummonCard = (summon: {
    id: string;
    name: string;
    hp: number;
    maxHp: number;
    shield: number;
    maxShield: number;
    image?: string;
  }) => (
    <div
      key={summon.id}
      style={{
        marginTop: '-0.25rem',
        marginLeft: '1.5rem',
        background: '#f8fafc',
        border: '1px solid #dbeafe',
        borderLeft: '4px solid #a78bfa',
        borderRadius: '0.5rem',
        padding: '0.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {summon.image ? (
          <img
            src={summon.image}
            alt={summon.name}
            style={{ width: '28px', height: '28px', borderRadius: '6px', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #c4b5fd 0%, #8b5cf6 100%)',
          }} />
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4c1d95' }}>{summon.name}</div>
          <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
            HP {summon.hp}/{summon.maxHp} · SH {summon.shield}/{summon.maxShield}
          </div>
        </div>
      </div>
    </div>
  );

  // Helper function to render a player card
  const renderPlayerCard = (student: Student & { isInSession: boolean; sessionData: SessionPlayer | null }, isLeft: boolean) => {
    const player = student.sessionData;
    
    const DEBUG_LIVE_EVENTS = process.env.REACT_APP_DEBUG_LIVE_EVENTS === 'true' || 
                               process.env.REACT_APP_DEBUG === 'true';
    
    // CRITICAL: For players in session, use session player data (hp/shield from session document)
    // This is the source of truth that gets updated by applyInSessionMove
    // Only fall back to vault data for players not in session
    let vaultData: {
      vaultHealth: number;
      maxVaultHealth: number;
      shieldStrength: number;
      maxShieldStrength: number;
      currentPP: number;
      maxPP: number;
    };
    
    if (player && (player.hp !== undefined || player.shield !== undefined)) {
      // Session player: current hp/shield from session; max and PP from vault when available (match Vault Management / Battle Arena)
      let hp = player.hp ?? 100;
      let shield = player.shield ?? 100;
      const vaultForMax = playerVaultData[student.id];
      const maxHp = vaultForMax?.maxVaultHealth ?? player.maxHp ?? 100;
      const maxShield = vaultForMax?.maxShieldStrength ?? player.maxShield ?? 100;
      // When session still shows "full" (never took damage), prefer vault current so display matches Vault Management
      if (vaultForMax && hp >= maxHp && shield >= maxShield) {
        hp = vaultForMax.vaultHealth;
        shield = vaultForMax.shieldStrength;
      }
      // Prefer vault currentPP so displayed PP matches Vault Management
      const pp = vaultForMax?.currentPP ?? player.powerPoints ?? (student.powerPoints || 0);
      const maxPP = vaultForMax?.maxPP ?? 1000;
      vaultData = {
        vaultHealth: hp,
        maxVaultHealth: maxHp,
        shieldStrength: shield,
        maxShieldStrength: maxShield,
        currentPP: pp,
        maxPP
      };
      
      if (DEBUG_LIVE_EVENTS) {
        console.log(`📊 [renderPlayerCard] Using session data for ${player.displayName}:`, {
          hp,
          maxHp,
          shield,
          maxShield,
          pp
        });
      }
    } else if (player && playerVaultData[student.id]) {
      // Player is in session but no hp/shield yet - use vault data as fallback
      vaultData = playerVaultData[student.id];
    } else if (player) {
      // Player is in session but no vault data yet - use player's PP
      const pp = student.powerPoints || player.powerPoints || 0;
      vaultData = {
        vaultHealth: Math.floor(pp * 0.1),
        maxVaultHealth: Math.floor(pp * 0.1),
        shieldStrength: 100,
        maxShieldStrength: 100,
        currentPP: pp,
        maxPP: pp
      };
    } else {
      // Player not in session - use student's PP
      const pp = student.powerPoints || 0;
      vaultData = {
        vaultHealth: Math.floor(pp * 0.1),
        maxVaultHealth: Math.floor(pp * 0.1),
        shieldStrength: 100,
        maxShieldStrength: 100,
        currentPP: pp,
        maxPP: pp
      };
    }
    
    // Ensure all values are numbers and have defaults
    vaultData = {
      vaultHealth: vaultData?.vaultHealth ?? Math.floor((student.powerPoints || 0) * 0.1),
      maxVaultHealth: vaultData?.maxVaultHealth ?? Math.floor((student.powerPoints || 0) * 0.1),
      shieldStrength: vaultData?.shieldStrength ?? 100,
      maxShieldStrength: vaultData?.maxShieldStrength ?? 100,
      currentPP: vaultData?.currentPP ?? (student.powerPoints || 0),
      maxPP: vaultData?.maxPP ?? (student.powerPoints || 0)
    };
    
    const isCurrentPlayer = student.id === currentUser?.uid;
    const isActiveInSession = student.isInSession;
    // Check if player is present (actively viewing the session)
    // Use presence service data (connected: true) or fallback to activeViewers array
    const playerPresence = presenceMap.get(student.id);
    const isPresentInPresenceService = playerPresence?.connected === true;
    const isPresentInActiveViewers = activeViewers.includes(student.id);
    const isPresent = isActiveInSession && (isPresentInPresenceService || isPresentInActiveViewers);
    // Eliminated: from session flag or inferred when in session with 0 health and 0 shield
    const isEliminated = player?.eliminated === true || (isActiveInSession && vaultData.vaultHealth === 0 && vaultData.shieldStrength === 0);

    const effectivePowerLevel =
      finitePowerLevel(player?.powerLevel) ?? finitePowerLevel(student.powerLevel);

    return (
      <div
        key={student.id}
        onClick={async (e) => {
          // If a move is selected, use this player as target
          // Allow targeting ALL players (including those not in session)
          if (selectedMove && student.id !== currentUser?.uid) {
            // ALWAYS log target click (critical - must see this)
            console.log('🎯 [InSessionBattle] ⚡ TARGET CLICKED ⚡', student.displayName, '| Move:', selectedMove?.name, '| TraceId:', currentTraceId || 'NEW');
            
            e.stopPropagation(); // Prevent event bubbling
            
            const DEBUG_LIVE_EVENTS = process.env.REACT_APP_DEBUG_LIVE_EVENT_SKILLS === 'true' ||
                                     process.env.REACT_APP_DEBUG_LIVE_EVENTS === 'true' || 
                                     process.env.REACT_APP_DEBUG === 'true';
            
            // Stage B: Target clicked - Use existing traceId or generate new one
            const { generateTraceId, traceStage, writeDebugAction } = await import('../utils/liveEventDebug');
            const traceId = currentTraceId || generateTraceId();
            if (!currentTraceId) {
              setCurrentTraceId(traceId);
            }
            
            console.log('🎯 [InSessionBattle] Using traceId:', traceId);
            
            traceStage('targeted', traceId, 'Target clicked', {
              targetId: student.id,
              targetName: student.displayName,
              selectedMove: {
                id: selectedMove.id,
                name: selectedMove.name,
                type: selectedMove.type,
                cost: selectedMove.cost,
                category: selectedMove.category
              },
              actorUid: currentUser?.uid,
              sessionId: sessionId
            }, { file: 'InSessionBattle.tsx', line: 1158 });
            
            // Write debug mirror
            if (classId && sessionId) {
              await writeDebugAction(classId, sessionId, traceId, 'targeted', {
                actorUid: currentUser?.uid || '',
                targetUid: student.id,
                skillId: selectedMove.id,
                skillName: selectedMove.name,
                metadata: {
                  targetName: student.displayName
                }
              });
            }
            
            // ALWAYS log target click (critical - must see this)
            console.log('🎯 [InSessionBattle] ⚡ TARGET CLICKED ⚡', student.displayName, '| Move:', selectedMove?.name, '| TraceId:', traceId);
            console.log('🎯 [InSessionBattle] Target click details:', {
              traceId: traceId || 'NONE',
              targetId: student.id,
              targetName: student.displayName,
              selectedMove: selectedMove ? {
                id: selectedMove.id,
                name: selectedMove.name,
                type: selectedMove.type,
                cost: selectedMove.cost,
                category: selectedMove.category
              } : null,
              actorUid: currentUser?.uid,
              sessionId: sessionId,
              hasClassId: !!classId
            });
            
            // CRITICAL: Verify we have all required data before dispatching
            if (!selectedMove || !selectedMove.id) {
              console.error('❌ [InSessionBattle] Cannot dispatch - invalid selectedMove!', selectedMove);
              alert('Error: No move selected. Please select a move first.');
              return;
            }
            
            if (!student.id) {
              console.error('❌ [InSessionBattle] Cannot dispatch - invalid target!', student);
              alert('Error: Invalid target selected.');
              return;
            }
            
            if (!currentUser || !currentUser.uid) {
              console.error('❌ [InSessionBattle] Cannot dispatch - no current user!');
              alert('Error: Not logged in.');
              return;
            }
            
            if (!sessionId) {
              console.error('❌ [InSessionBattle] Cannot dispatch - no sessionId!');
              alert('Error: No session ID.');
              return;
            }
            
            setSelectedTarget(student.id);
            // Dispatch custom event to trigger BattleEngine move execution
            // Include traceId, classId, and eventId in event detail
            const eventDetail = { 
              move: selectedMove, 
              targetId: student.id, 
              traceId,
              classId,
              eventId: sessionId // Using sessionId as eventId for now
            };

            // ALWAYS log event dispatch (critical - must see this)
            console.log('📤 [InSessionBattle] ⚡ DISPATCHING EVENT ⚡', selectedMove?.name, '→', student.displayName, '| TraceId:', traceId);
            console.log('📤 [InSessionBattle] Event detail:', eventDetail);
            
            try {
              window.dispatchEvent(new CustomEvent('inSessionMoveSelect', {
                detail: eventDetail
              }));
              console.log('✅ [InSessionBattle] Event dispatched successfully');
            } catch (error) {
              console.error('❌ [InSessionBattle] Failed to dispatch event:', error);
              alert('Error: Failed to dispatch move event. Check console for details.');
              return;
            }
            
            // Clear selection after dispatching
            setSelectedMove(null);
            setSelectedTarget(null);
            setCurrentTraceId(null);
          }
        }}
        style={{
          background: isActiveInSession ? 'white' : '#f9fafb',
          borderRadius: '0.5rem',
          padding: '0.75rem',
          border: selectedMove && student.id !== currentUser?.uid
            ? '3px solid #fbbf24'
            : (isCurrentPlayer ? '2px solid #3b82f6' : (isPresent ? '2px solid #10b981' : (isActiveInSession ? '2px solid #ef4444' : '1px solid #e5e7eb'))),
          boxShadow: selectedMove && student.id !== currentUser?.uid
            ? '0 0 20px rgba(251, 191, 36, 0.8), 0 4px 12px rgba(0, 0, 0, 0.2)'
            : (isCurrentPlayer ? '0 2px 8px rgba(59, 130, 246, 0.2)' : (isPresent ? '0 2px 8px rgba(16, 185, 129, 0.2)' : (isActiveInSession ? '0 2px 8px rgba(239, 68, 68, 0.2)' : '0 1px 3px rgba(0, 0, 0, 0.1)'))),
          opacity: isActiveInSession ? 1 : (selectedMove ? 1 : 0.7), // Full opacity when move is selected
          position: 'relative',
          cursor: selectedMove && student.id !== currentUser?.uid ? 'pointer' : 'default',
          transform: selectedMove && student.id !== currentUser?.uid ? 'scale(1.05)' : 'scale(1)',
          transition: 'all 0.2s',
          zIndex: selectedMove && student.id !== currentUser?.uid ? 1000 : 'auto'
        }}
        onMouseEnter={(e) => {
          if (selectedMove && student.id !== currentUser?.uid) {
            e.currentTarget.style.transform = 'scale(1.08)';
            e.currentTarget.style.boxShadow = '0 0 25px rgba(251, 191, 36, 1), 0 6px 16px rgba(0, 0, 0, 0.3)';
          }
        }}
        onMouseLeave={(e) => {
          if (selectedMove && student.id !== currentUser?.uid) {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(251, 191, 36, 0.8), 0 4px 12px rgba(0, 0, 0, 0.2)';
          } else {
            e.currentTarget.style.transform = 'scale(1)';
          }
        }}
      >
        {/* Active/Inactive Indicator */}
        <div style={{
          position: 'absolute',
          top: '0.375rem',
          right: '0.375rem',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: isPresent ? '#10b981' : (isActiveInSession ? '#ef4444' : '#9ca3af'),
          border: '2px solid white',
          boxShadow: '0 0 0 1px ' + (isPresent ? '#10b981' : (isActiveInSession ? '#ef4444' : '#9ca3af'))
        }} title={isPresent ? 'Present in Session' : (isActiveInSession ? 'Not Present' : 'Not in Session')} />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {(student.photoURL || player?.photoURL) ? (
            <img
              src={student.photoURL || player?.photoURL}
              alt={student.displayName}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: isCurrentPlayer ? '2px solid #3b82f6' : (isPresent ? '2px solid #10b981' : (isActiveInSession ? '2px solid #ef4444' : '1px solid #e5e7eb')),
                objectFit: 'cover',
                flexShrink: 0
              }}
            />
          ) : (
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: isCurrentPlayer ? '#3b82f6' : (isPresent ? '#10b981' : (isActiveInSession ? '#ef4444' : '#8b5cf6')),
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '1rem',
              flexShrink: 0
            }}>
              {student.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ fontWeight: '600', fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span>{student.displayName}</span>
                {squadAbbreviations.get(student.id) && (
                  <span style={{
                    fontSize: '0.7rem',
                    color: '#4f46e5',
                    fontWeight: '600'
                  }}>
                    [{squadAbbreviations.get(student.id)}]
                  </span>
                )}
              </div>
              {isActiveInSession ? (
                <span style={{
                  fontSize: '0.65rem',
                  background: isPresent ? '#10b981' : '#ef4444',
                  color: 'white',
                  padding: '0.125rem 0.375rem',
                  borderRadius: '0.25rem',
                  fontWeight: '600'
                }}>
                  {isPresent ? 'IN SESSION' : 'NOT PRESENT'}
                </span>
              ) : (
                <span style={{
                  fontSize: '0.65rem',
                  background: '#9ca3af',
                  color: 'white',
                  padding: '0.125rem 0.375rem',
                  borderRadius: '0.25rem',
                  fontWeight: '600'
                }}>
                  NOT JOINED
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>Level {player?.level || student.level || 1}</span>
              {effectivePowerLevel != null && (
                <span
                  title={`Power Level = ${effectivePowerLevel}`}
                  style={{ 
                  color: '#8b5cf6', 
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px'
                }}
                >
                  ⚡ PL {effectivePowerLevel}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openPlayerInspectModal(student.id);
              }}
              style={{
                marginTop: '0.25rem',
                fontSize: '0.68rem',
                padding: '0.2rem 0.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #cbd5e1',
                background: '#f8fafc',
                color: '#1e3a8a',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              View Build
            </button>
          </div>
        </div>
        
        {/* Health Bar */}
        <div style={{ marginBottom: '0.375rem' }}>
          <div style={{ fontSize: '0.65rem', marginBottom: '0.125rem', color: '#dc2626', fontWeight: '600' }}>
            HEALTH
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            background: '#e5e7eb',
            borderRadius: '4px',
            overflow: 'hidden',
            position: 'relative'
          }}>
            <div style={{
              width: `${Math.min(100, Math.max(0, vaultData.maxVaultHealth > 0 ? (vaultData.vaultHealth / vaultData.maxVaultHealth) * 100 : 0))}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #10b981 0%, #34d399 100%)',
              transition: 'width 0.3s ease'
            }} />
            <div style={{ 
              position: 'absolute', 
              right: '3px', 
              top: '50%', 
              transform: 'translateY(-50%)',
              fontSize: '0.6rem',
              color: '#6b7280',
              fontWeight: '600'
            }}>
              {vaultData.vaultHealth}
            </div>
          </div>
          <div style={{ fontSize: '0.6rem', textAlign: 'right', marginTop: '0.05rem', color: '#6b7280' }}>
            {vaultData.vaultHealth}/{vaultData.maxVaultHealth}
          </div>
        </div>

        {/* Shield Bar */}
        <div style={{ marginBottom: '0.375rem' }}>
          <div style={{ fontSize: '0.65rem', marginBottom: '0.125rem', color: '#3b82f6', fontWeight: '600' }}>
            SHIELD
          </div>
          <div style={{
            width: '100%',
            height: '8px',
            background: '#e5e7eb',
            borderRadius: '4px',
            overflow: 'hidden',
            position: 'relative'
          }}>
            <div style={{
              width: `${Math.min(100, Math.max(0, vaultData.maxShieldStrength > 0 ? (vaultData.shieldStrength / vaultData.maxShieldStrength) * 100 : 0))}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)',
              transition: 'width 0.3s ease'
            }} />
            <div style={{ 
              position: 'absolute', 
              right: '3px', 
              top: '50%', 
              transform: 'translateY(-50%)',
              fontSize: '0.6rem',
              color: '#6b7280',
              fontWeight: '600'
            }}>
              {vaultData.shieldStrength}
            </div>
          </div>
          <div style={{ fontSize: '0.6rem', textAlign: 'right', marginTop: '0.05rem', color: '#6b7280' }}>
            {vaultData.shieldStrength}/{vaultData.maxShieldStrength}
          </div>
        </div>

        {/* Participation Tracking - Show for ALL players (in session or not) */}
        <div style={{ marginBottom: '0.375rem' }}>
          <div style={{ fontSize: '0.65rem', marginBottom: '0.125rem', color: '#8b5cf6', fontWeight: '600' }}>
            PARTICIPATION
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.2rem',
            background: '#f3f4f6',
            borderRadius: '0.25rem',
            padding: '0.25rem 0.5rem',
            border: '1px solid #e5e7eb'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: '500' }}>
                Points: <span style={{ color: '#8b5cf6', fontWeight: '600' }}>{player?.participationCount || 0}</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: '500' }}>
                Times: <span style={{ color: '#8b5cf6', fontWeight: '600' }}>{player?.participationCount || 0}</span>
              </div>
            </div>
            <div style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: '500' }}>
              Moves Available: <span style={{ color: '#10b981', fontWeight: '600' }}>{player?.movesEarned || 0}</span>
            </div>
          </div>
        </div>

        {/* PP Display - use vaultData so it matches Vault Management / Battle Arena */}
        <div style={{ marginBottom: '0.375rem' }}>
          <div style={{ fontSize: '0.65rem', color: '#6b7280' }}>
            {vaultData.currentPP} PP
          </div>
        </div>

        {/* Admin/Scorekeeper Controls - COMPLETELY HIDDEN for all non-admin and non-scorekeeper users */}
        {/* ALL PP controls (Participation, -10/+10, PP Tools) are REMOVED from DOM unless user is explicitly confirmed as admin OR scorekeeper */}
        {/* Only show buttons if permissions are checked AND user is explicitly admin OR scorekeeper */}
        {/* For non-admin and non-scorekeeper users, these buttons should NEVER appear */}
        {(() => {
          // HARDCODED: Only Yondaime (the admin) can see buttons on ALL player cards
          // Check if the current user (viewer) is Yondaime by email or displayName
          // Yondaime's email is edm21179@gmail.com
          const isYondaimeByEmail = currentUser?.email === 'edm21179@gmail.com';
          const isYondaimeByDisplayName = currentUser?.displayName === 'Yondaime' || 
                                         currentUser?.displayName?.toLowerCase() === 'yondaime';
          const isYondaimeViewer = isYondaimeByEmail || isYondaimeByDisplayName;
          
          // STRICT CHECK: Only show buttons if permissions are checked AND current user is Yondaime
          // Yondaime can see buttons on ALL player cards to manage participation and PP
          const hasPermissions = permissionsChecked === true;
          const isAuthorized = isYondaimeViewer === true;
          const shouldShowButtons = hasPermissions && isAuthorized;
          
          // Always log for debugging (not just in development) to help track down issues
          console.log('[InSessionBattle] Button visibility check for student:', {
            studentId: student.id,
            studentName: student.displayName,
            currentUserId: currentUser?.uid,
            currentUserEmail: currentUser?.email,
            currentUserDisplayName: currentUser?.displayName,
            isYondaimeByEmail,
            isYondaimeByDisplayName,
            isYondaimeViewer,
            permissionsChecked,
            isAdminUser,
            isScorekeeper,
            hasPermissions,
            isAuthorized,
            shouldShowButtons,
            willRenderButtons: shouldShowButtons === true,
            note: 'Buttons only show when Yondaime is signed in - Yondaime can manage all players'
          });
          
          // CRITICAL: Only return true if current user is Yondaime (can see buttons on all cards)
          return shouldShowButtons === true;
        })() ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginTop: '0.375rem' }}>
            <button
              onClick={() => handleAddParticipation(student.id)}
              style={{
                width: '100%',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                padding: '0.375rem',
                fontSize: '0.7rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              + Participation
            </button>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.2rem',
              background: '#f3f4f6',
              borderRadius: '0.25rem',
              padding: '0.2rem',
              border: '1px solid #d1d5db'
            }}>
              <button
                onClick={() => {
                  const currentValue = ppQuickAdjust[student.id] || 0;
                  setPPQuickAdjust({ ...ppQuickAdjust, [student.id]: currentValue - 10 });
                }}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.2rem',
                  padding: '0.2rem 0.4rem',
                  fontSize: '0.65rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  minWidth: '28px'
                }}
                title="Subtract 10 PP"
              >
                -10
              </button>
              <input
                type="number"
                value={ppQuickAdjust[student.id] || ''}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  setPPQuickAdjust({ ...ppQuickAdjust, [student.id]: value });
                }}
                placeholder="PP"
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  textAlign: 'center',
                  fontSize: '0.7rem',
                  padding: '0.2rem',
                  minWidth: '40px',
                  maxWidth: '60px'
                }}
              />
              <button
                onClick={() => {
                  const currentValue = ppQuickAdjust[student.id] || 0;
                  setPPQuickAdjust({ ...ppQuickAdjust, [student.id]: currentValue + 10 });
                }}
                style={{
                  background: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.2rem',
                  padding: '0.2rem 0.4rem',
                  fontSize: '0.65rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  minWidth: '28px'
                }}
                title="Add 10 PP"
              >
                +10
              </button>
              <button
                onClick={() => {
                  const amount = ppQuickAdjust[student.id] || 0;
                  if (amount !== 0) {
                    handleAdjustPP(student.id, amount);
                    setPPQuickAdjust({ ...ppQuickAdjust, [student.id]: 0 });
                  }
                }}
                disabled={!ppQuickAdjust[student.id] || ppQuickAdjust[student.id] === 0}
                style={{
                  background: (ppQuickAdjust[student.id] && ppQuickAdjust[student.id] !== 0) ? '#3b82f6' : '#9ca3af',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.2rem',
                  padding: '0.2rem 0.4rem',
                  fontSize: '0.65rem',
                  fontWeight: '600',
                  cursor: (ppQuickAdjust[student.id] && ppQuickAdjust[student.id] !== 0) ? 'pointer' : 'not-allowed',
                  opacity: (ppQuickAdjust[student.id] && ppQuickAdjust[student.id] !== 0) ? 1 : 0.6
                }}
                title="Apply PP change"
              >
                ✓
              </button>
            </div>
            <button
              onClick={() => {
                setSelectedStudentForPP(student.id);
                setPPAdjustment(0);
              }}
              style={{
                width: '100%',
                background: '#8b5cf6',
                color: 'white',
                border: 'none',
                borderRadius: '0.25rem',
                padding: '0.375rem',
                fontSize: '0.7rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              PP Tools
            </button>
          </div>
        ) : (
          // Explicitly render nothing for non-admin/non-scorekeeper users
          // This ensures buttons are completely removed from DOM
          null
        )}
        
        {/* Show message if not in session or not present */}
        {!isActiveInSession && (
          <div style={{
            marginTop: '0.375rem',
            padding: '0.375rem',
            background: '#fef3c7',
            borderRadius: '0.25rem',
            fontSize: '0.65rem',
            color: '#92400e',
            textAlign: 'center',
            fontWeight: '500'
          }}>
            Not in session
          </div>
        )}
        {isActiveInSession && !isPresent && (
          <div style={{
            marginTop: '0.375rem',
            padding: '0.375rem',
            background: '#fee2e2',
            borderRadius: '0.25rem',
            fontSize: '0.65rem',
            color: '#991b1b',
            textAlign: 'center',
            fontWeight: '500'
          }}>
            Not Present
          </div>
        )}

        {/* Eliminated overlay - shows over card when player is eliminated */}
        {isEliminated && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '0.5rem',
              background: 'rgba(0, 0, 0, 0.65)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              zIndex: 10
            }}
          >
            <span style={{
              fontSize: '1.25rem',
              fontWeight: '800',
              color: '#fef2f2',
              textShadow: '0 2px 4px rgba(0,0,0,0.5)',
              letterSpacing: '0.05em'
            }}>
              Eliminated
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <LiveEventDebugOverlay
        sessionId={sessionId}
        classId={classId}
        eventId={sessionId}
        selectedSkillId={selectedMove?.id}
        selectedTargetUid={selectedTarget || undefined}
      />
      <style>{`
        @keyframes liveEventEliminatedOverlay {
          0% { opacity: 0; transform: scale(0.9); }
          30% { opacity: 1; transform: scale(1.02); }
          100% { opacity: 0; transform: scale(1); }
        }
      `}</style>
      <div style={{ 
        padding: '1rem',
        maxWidth: '1600px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
        color: 'white',
        padding: '1.5rem',
        borderRadius: '0.75rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <h1 style={{ fontSize: '2rem', margin: 0, marginBottom: '0.5rem' }}>📚 In Session: {className}</h1>
          <p style={{ fontSize: '1rem', opacity: 0.9, margin: 0 }}>
            {sessionPlayers.length} players • {currentPlayer ? `${currentPlayer.movesEarned} moves available` : 'Loading...'}
          </p>
        </div>
        {/* Leave Live Event: all players. End Session: only designated session-ender. Quiz Mode: host only. Disabled while summary is open. */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {permissionsChecked &&
            (isSessionHost || isAdminUser) &&
            !showSessionSummary &&
            (roomSessionStatus === 'live' || roomSessionStatus === 'active') && (
              <button
                type="button"
                disabled={mstMktToggleLoading}
                onClick={async () => {
                  const next = !mstMktOpen;
                  setMstMktToggleLoading(true);
                  try {
                    const res = await setLiveEventMstMktOpen(sessionId, next);
                    if (!res.ok) {
                      alert(res.error || 'Could not update MST MKT');
                      return;
                    }
                    await appendBattleLog(next ? '🛒 MST MKT is now OPEN — spend PP on heals & gear!' : '🛒 MST MKT closed by host.');
                  } finally {
                    setMstMktToggleLoading(false);
                  }
                }}
                style={{
                  background: mstMktOpen ? 'rgba(16, 185, 129, 0.95)' : 'rgba(245, 158, 11, 0.95)',
                  color: 'white',
                  border: '2px solid white',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1.25rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: mstMktToggleLoading ? 'wait' : 'pointer',
                  opacity: mstMktToggleLoading ? 0.75 : 1,
                }}
                title={mstMktOpen ? 'Close the in-event shop' : 'Let players spend Participation PP on survival items'}
              >
                {mstMktToggleLoading ? '…' : mstMktOpen ? '🛒 Close MST MKT' : '🛒 Open MST MKT'}
              </button>
            )}
          {isSessionHost && !quizSession && (
            <button
              onClick={() => {
                setQuizModalOpen(true);
                getPublishedQuizSets()
                  .then((sets) => {
                    setQuizList(sets.map((s) => ({ id: s.id, title: s.title, questionCount: s.questionCount || 0 })));
                    if (sets.length > 0 && !selectedQuizId) setSelectedQuizId(sets[0].id);
                    if (sets.length > 0 && quizNumQuestions === 0) setQuizNumQuestions(Math.min(10, sets[0].questionCount || 10));
                  })
                  .catch((err) => {
                    console.error('Failed to load quiz list:', err);
                    alert('Could not load quizzes. If this persists, ensure Firestore rules allow reads on published trainingQuizSets.');
                  });
              }}
              style={{
                background: 'rgba(139, 92, 246, 0.9)',
                color: 'white',
                border: '2px solid white',
                borderRadius: '0.5rem',
                padding: '0.75rem 1.25rem',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              📋 Start Live Event
            </button>
          )}
          <button
            onClick={async () => {
              if (!currentUser || showSessionSummary) return;
              try {
                const left = await leaveSession(sessionId, currentUser.uid, currentUser.displayName || undefined);
                if (left) {
                  debug('inSessionBattle', `User ${currentUser.uid} left session ${sessionId}`);
                  navigate('/live-events');
                } else {
                  alert('Failed to leave session. Please try again.');
                }
              } catch (error) {
                debugError('inSessionBattle', 'Error leaving session', error);
                alert('Error leaving session. Please try again.');
              }
            }}
            disabled={showSessionSummary}
            title={showSessionSummary ? 'Close the Live Event summary first' : undefined}
            style={{
              background: showSessionSummary ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.2)',
              color: 'white',
              border: '2px solid white',
              borderRadius: '0.5rem',
              padding: '0.75rem 1.5rem',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: showSessionSummary ? 'not-allowed' : 'pointer',
              opacity: showSessionSummary ? 0.7 : 1
            }}
          >
            Leave Live Event
          </button>
          {permissionsChecked && (canEndLiveEventSession(currentUser?.email ?? null) || isSessionHost) && (
            <button
              onClick={async () => {
                if (!currentUser || showSessionSummary) return;
                try {
                  const ended = await endSession(sessionId, currentUser.uid, currentUser.email || undefined);
                  if (ended) {
                    debug('inSessionBattle', `Session ${sessionId} ended by ${currentUser.uid}`);
                    const room = await getSession(sessionId);
                    await showLiveEventSummaryIfEnded(
                      room
                        ? { status: room.status, sessionSummary: (room as { sessionSummary?: SessionSummary }).sessionSummary }
                        : { status: 'ended' }
                    );
                  } else {
                    debugError('inSessionBattle', `Failed to end session ${sessionId}`);
                    alert('Failed to end session. Only the designated host can end the session.');
                  }
                } catch (error) {
                  debugError('inSessionBattle', `Error ending session`, error);
                  alert('Error ending session. Please try again.');
                }
              }}
              disabled={showSessionSummary}
              title={showSessionSummary ? 'Close the Live Event summary first' : undefined}
              style={{
                background: showSessionSummary ? 'rgba(239, 68, 68, 0.5)' : 'rgba(239, 68, 68, 0.9)',
                color: 'white',
                border: '2px solid white',
                borderRadius: '0.5rem',
                padding: '0.75rem 1.5rem',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: showSessionSummary ? 'not-allowed' : 'pointer',
                opacity: showSessionSummary ? 0.7 : 1
              }}
            >
              End Session
            </button>
          )}
        </div>
      </div>

      {!showSessionSummary &&
        mstMktOpen &&
        (roomSessionStatus === 'live' || roomSessionStatus === 'active') &&
        currentUser && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              borderRadius: '0.65rem',
              background: 'linear-gradient(90deg, #422006 0%, #713f12 50%, #1c1917 100%)',
              border: '1px solid rgba(251, 191, 36, 0.5)',
              color: '#fef3c7',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
              🛒 <strong>MST MKT</strong> is open — spend Participation PP on consumables configured in Artifacts Admin.
            </span>
            <button
              type="button"
              onClick={() => setShowMstMktModal(true)}
              style={{
                padding: '0.5rem 1.1rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                color: '#1c1917',
                fontWeight: 800,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              Open shop
            </button>
          </div>
        )}

      {!quizSession && (isSessionHost || roomClassFlowSprint) && currentUser && (
        <LiveEventSprintPanel
          sessionId={sessionId}
          sprint={roomClassFlowSprint}
          sessionPlayers={sessionPlayers.map((p) => ({ userId: p.userId, displayName: p.displayName }))}
          isSessionHost={isSessionHost}
          currentUserId={currentUser.uid}
          userEmail={currentUser.email}
          userDisplayName={currentUser.displayName}
        />
      )}

      {/* Quiz setup modal (host only) */}
      {quizModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setQuizModalOpen(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '1rem',
              padding: '1.5rem',
              maxWidth: '560px',
              width: '92%',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>📋 Live Event</h3>
            <p style={{ marginBottom: '1rem', color: '#64748b', fontSize: '0.9rem' }}>
              Pick a mode for this session. <strong>Class Flow</strong> is for timed sprints and participation (use the Sprint panel in the room).
              <strong> Quiz</strong> and <strong>Battle Royale</strong> use a Training Grounds question bank.
              <strong> Reflection</strong> and <strong>Goal setting</strong> activate the room for prompts and goals (no quiz launch).
            </p>
            <div style={{ marginBottom: '1rem' }}>
              <span style={{ fontWeight: 600, display: 'block', marginBottom: '0.5rem' }}>Mode</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {([
                  { id: 'class_flow' as const, label: 'Class Flow' },
                  { id: 'battle_royale' as const, label: 'Battle Royale' },
                  { id: 'quiz' as const, label: 'Quiz' },
                  { id: 'reflection' as const, label: 'Reflection' },
                  { id: 'goal_setting' as const, label: 'Goal setting' },
                ]).map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setLiveEventLaunchMode(id);
                      if (id !== 'battle_royale') setBattleRoyaleTeamFormat(false);
                    }}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: '0.5rem',
                      border: liveEventLaunchMode === id ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                      background: liveEventLaunchMode === id ? '#eef2ff' : '#fff',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {liveEventLaunchMode === 'battle_royale' && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.75rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                <input
                  type="checkbox"
                  checked={battleRoyaleTeamFormat}
                  onChange={(e) => setBattleRoyaleTeamFormat(e.target.checked)}
                />
                Team format (squads — same rules as former &quot;Team Battle Royale&quot;)
              </label>
            )}

            {liveEventLaunchMode === 'battle_royale' && !battleRoyaleTeamFormat && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Battle Royale host settings</div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>End when survivors ≤</label>
                <select
                  value={brSurvivorPreset}
                  onChange={(e) => setBrSurvivorPreset(e.target.value as typeof brSurvivorPreset)}
                  style={{ width: '100%', marginBottom: '0.5rem', padding: '0.35rem', borderRadius: '0.35rem' }}
                >
                  <option value="1">Top 1</option>
                  <option value="3">Top 3</option>
                  <option value="5">Top 5</option>
                  <option value="10">Top 10</option>
                  <option value="custom">Custom</option>
                </select>
                {brSurvivorPreset === 'custom' && (
                  <input
                    type="number"
                    min={1}
                    value={brCustomSurvivorTarget}
                    onChange={(e) => setBrCustomSurvivorTarget(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{ width: '100%', marginBottom: '0.5rem', padding: '0.35rem', borderRadius: '0.35rem' }}
                  />
                )}
                {(
                  [
                    ['shuffleAnswers', 'Shuffle answer choices'],
                    ['autoRepeatQuestions', 'Loop question bank until match ends'],
                    ['spectatorsOnElimination', 'Eliminated players cannot use combat'],
                    ['allowEliminatedQuizAnswering', 'Eliminated may still answer for PP'],
                  ] as const
                ).map(([key, lab]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
                    <input
                      type="checkbox"
                      checked={!!brHostConfig[key]}
                      onChange={(e) => setBrHostConfig((c) => ({ ...c, [key]: e.target.checked }))}
                    />
                    {lab}
                  </label>
                ))}
                <label style={{ display: 'block', marginTop: '0.5rem', fontWeight: 600 }}>
                  Time between questions (after each answer timer ends)
                </label>
                <p style={{ margin: '0 0 0.35rem', fontSize: '0.8rem', color: '#64748b' }}>
                  Next question starts automatically on your device — keep this tab open, or use Manual to click Next yourself.
                </p>
                <select
                  value={brHostConfig.autoAdvanceDelayMs}
                  onChange={(e) =>
                    setBrHostConfig((c) => ({ ...c, autoAdvanceDelayMs: parseInt(e.target.value, 10) || 0 }))
                  }
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '0.35rem' }}
                >
                  {(BR_INTER_QUESTION_GAP_MS_OPTIONS.some((o) => o.value === brHostConfig.autoAdvanceDelayMs)
                    ? BR_INTER_QUESTION_GAP_MS_OPTIONS
                    : [
                        ...BR_INTER_QUESTION_GAP_MS_OPTIONS,
                        {
                          label: `Other (${Math.round(brHostConfig.autoAdvanceDelayMs / 1000)}s)`,
                          value: brHostConfig.autoAdvanceDelayMs,
                        },
                      ].sort((a, b) => a.value - b.value)
                  ).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {liveEventLaunchMode === 'battle_royale' && battleRoyaleTeamFormat && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f0fdf4', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Team Battle Royale host settings</div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontWeight: 600 }}>Number of teams</label>
                <input
                  type="number"
                  min={2}
                  max={6}
                  value={teamBrHostConfig.teamCount}
                  onChange={(e) => {
                    const n = Math.min(6, Math.max(2, parseInt(e.target.value, 10) || 2));
                    setTeamBrHostConfig((c) => {
                      const colors = ['#dc2626', '#2563eb', '#16a34a', '#ca8a04', '#9333ea', '#db2777'];
                      let teams = [...c.teams];
                      if (teams.length > n) teams = teams.slice(0, n);
                      while (teams.length < n) {
                        const i = teams.length;
                        teams.push({
                          id: `team-${i + 1}`,
                          name: `Team ${i + 1}`,
                          color: colors[i % colors.length],
                        });
                      }
                      return { ...c, teamCount: n, teams };
                    });
                  }}
                  style={{ width: '100%', marginBottom: '0.75rem', padding: '0.35rem', borderRadius: '0.35rem' }}
                />
                {teamBrHostConfig.teams.map((tm, idx) => (
                  <div key={tm.id} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.35rem', alignItems: 'center' }}>
                    <input
                      type="color"
                      value={tm.color}
                      onChange={(e) =>
                        setTeamBrHostConfig((c) => ({
                          ...c,
                          teams: c.teams.map((t, i) => (i === idx ? { ...t, color: e.target.value } : t)),
                        }))
                      }
                      title="Team color"
                      style={{ width: 36, height: 28, padding: 0, border: 'none' }}
                    />
                    <input
                      type="text"
                      value={tm.name}
                      onChange={(e) =>
                        setTeamBrHostConfig((c) => ({
                          ...c,
                          teams: c.teams.map((t, i) => (i === idx ? { ...t, name: e.target.value } : t)),
                        }))
                      }
                      style={{ flex: 1, padding: '0.35rem', borderRadius: '0.35rem' }}
                    />
                  </div>
                ))}
                {(
                  [
                    ['autoBalanceTeams', 'Auto-balance teams'],
                    ['supportAlliesEnabled', 'Support allies (heal rules)'],
                    ['sharedTeamHealth', 'Shared team health (UI flag; MVP uses per-player HP)'],
                    ['shuffleAnswers', 'Shuffle answer choices'],
                    ['autoRepeatQuestions', 'Loop question bank'],
                    ['spectatorsOnElimination', 'Eliminated cannot use combat'],
                    ['allowEliminatedQuizAnswering', 'Eliminated may still answer for PP'],
                  ] as const
                ).map(([key, lab]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.25rem' }}>
                    <input
                      type="checkbox"
                      checked={!!teamBrHostConfig[key]}
                      onChange={(e) => setTeamBrHostConfig((c) => ({ ...c, [key]: e.target.checked }))}
                    />
                    {lab}
                  </label>
                ))}
                <label style={{ display: 'block', marginTop: '0.5rem', fontWeight: 600 }}>
                  Time between questions (after each answer timer ends)
                </label>
                <p style={{ margin: '0 0 0.35rem', fontSize: '0.8rem', color: '#166534' }}>
                  Questions advance automatically after the gap — keep the host tab open, or choose Manual to click Next.
                </p>
                <select
                  value={teamBrHostConfig.autoAdvanceDelayMs}
                  onChange={(e) =>
                    setTeamBrHostConfig((c) => ({ ...c, autoAdvanceDelayMs: parseInt(e.target.value, 10) || 0 }))
                  }
                  style={{ width: '100%', padding: '0.35rem', borderRadius: '0.35rem' }}
                >
                  {(BR_INTER_QUESTION_GAP_MS_OPTIONS.some((o) => o.value === teamBrHostConfig.autoAdvanceDelayMs)
                    ? BR_INTER_QUESTION_GAP_MS_OPTIONS
                    : [
                        ...BR_INTER_QUESTION_GAP_MS_OPTIONS,
                        {
                          label: `Other (${Math.round(teamBrHostConfig.autoAdvanceDelayMs / 1000)}s)`,
                          value: teamBrHostConfig.autoAdvanceDelayMs,
                        },
                      ].sort((a, b) => a.value - b.value)
                  ).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {liveEventLaunchMode === 'reflection' && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.85rem',
                  background: '#f0fdf4',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  color: '#166534',
                  lineHeight: 1.5,
                }}
              >
                <strong>Reflection</strong> — student writing is saved to the linked assessment&apos;s{' '}
                <strong>Evidence</strong> column (Assessment Goals → Dashboard) for you to verify.
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>Link assessment *</label>
                  <select
                    value={reflectionPickAssessmentId}
                    onChange={(e) => setReflectionPickAssessmentId(e.target.value)}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: 8, marginBottom: 10 }}
                  >
                    <option value="">Select assessment…</option>
                    {reflectionModalAssessments.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} ({a.type})
                      </option>
                    ))}
                  </select>
                  <label style={{ display: 'block', fontWeight: 700, marginBottom: 6 }}>Class prompt (optional)</label>
                  <textarea
                    value={reflectionPickPrompt}
                    onChange={(e) => setReflectionPickPrompt(e.target.value)}
                    rows={2}
                    placeholder="Shown to students above the evidence box"
                    style={{ width: '100%', padding: '0.45rem', borderRadius: 8, resize: 'vertical' }}
                  />
                </div>
              </div>
            )}
            {liveEventLaunchMode === 'goal_setting' && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.85rem',
                  background: '#f0fdf4',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  color: '#166534',
                  lineHeight: 1.5,
                }}
              >
                <strong>Goal setting</strong> — spiritual-energy focus. Students set or update timeframe goals in Assessment
                Goals; Season 1 linking remains on for this session.
              </div>
            )}
            {liveEventLaunchMode === 'class_flow' && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.85rem',
                  background: '#ecfdf5',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  color: '#065f46',
                  lineHeight: 1.5,
                }}
              >
                <strong>Class Flow</strong> — kinetic energy. After you activate, use the <strong>Class Flow Sprint</strong> panel
                below the header to run timed goals, check off finishers, and grant participation power plus optional vault PP/XP.
              </div>
            )}

            {(liveEventLaunchMode === 'quiz' || liveEventLaunchMode === 'battle_royale') && (
              <>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Quiz</label>
            <select
              value={selectedQuizId}
              onChange={(e) => {
                setSelectedQuizId(e.target.value);
                const q = quizList.find((x) => x.id === e.target.value);
                if (q) setQuizNumQuestions(Math.min(10, q.questionCount || 10));
              }}
              style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem', borderRadius: '0.5rem' }}
            >
              {quizList.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title} ({q.questionCount} questions)
                </option>
              ))}
            </select>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Number of questions</label>
            <input
              type="number"
              min={1}
              max={quizList.find((q) => q.id === selectedQuizId)?.questionCount || 10}
              value={quizNumQuestions}
              onChange={(e) => setQuizNumQuestions(Math.max(1, parseInt(e.target.value, 10) || 1))}
              style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem', borderRadius: '0.5rem' }}
            />
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Time per question (seconds)</label>
            <input
              type="number"
              min={5}
              max={60}
              value={quizTimeLimit}
              onChange={(e) => setQuizTimeLimit(Math.max(5, Math.min(60, parseInt(e.target.value, 10) || 20)))}
              style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem', borderRadius: '0.5rem' }}
            />

            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: 600 }}>Rewards</h4>
              <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.75rem' }}>
                Set PP, XP, and artifact for each placement (1st, 2nd, 3rd, Top 5, Top 10). Leave 0 or empty for no reward.
                <strong> Equippable artifacts</strong> (from Artifacts Admin) grant like marketplace equips; MST items still go to
                inventory by name.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                {(['first', 'second', 'third', 'top5', 'top10'] as LiveQuizPlacementKey[]).map((key) => {
                  const label = key === 'first' ? '1st' : key === 'second' ? '2nd' : key === 'third' ? '3rd' : key === 'top5' ? 'Top 5 (4th–5th)' : 'Top 10 (6th–10th)';
                  const p = quizRewardConfig.placements[key] ?? { pp: 0, xp: 0 };
                  return (
                    <div key={key} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem 1rem', padding: '0.5rem', background: '#f8fafc', borderRadius: '0.5rem' }}>
                      <span style={{ minWidth: '100px', fontSize: '0.875rem', fontWeight: 600 }}>{label}</span>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}>
                        PP
                        <input
                          type="number"
                          min={0}
                          value={p.pp}
                          onChange={(e) => setQuizRewardConfig((c) => ({
                            ...c,
                            placements: {
                              ...c.placements,
                              [key]: { ...(c.placements[key] ?? { pp: 0, xp: 0 }), pp: Math.max(0, parseInt(e.target.value, 10) || 0) },
                            },
                          }))}
                          style={{ width: '64px', padding: '0.35rem', borderRadius: '0.35rem' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}>
                        XP
                        <input
                          type="number"
                          min={0}
                          value={p.xp}
                          onChange={(e) => setQuizRewardConfig((c) => ({
                            ...c,
                            placements: {
                              ...c.placements,
                              [key]: { ...(c.placements[key] ?? { pp: 0, xp: 0 }), xp: Math.max(0, parseInt(e.target.value, 10) || 0) },
                            },
                          }))}
                          style={{ width: '64px', padding: '0.35rem', borderRadius: '0.35rem' }}
                        />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}>
                        Artifact
                        <select
                          value={p.artifactId ?? ''}
                          onChange={(e) => {
                            const v = e.target.value;
                            const mst = QUIZ_REWARD_ARTIFACTS.find((a) => a.id === v);
                            const eq = quizEquippableRewardOptions.find((a) => a.id === v);
                            const opt = mst || eq;
                            setQuizRewardConfig((c) => ({
                              ...c,
                              placements: {
                                ...c.placements,
                                [key]: {
                                  ...(c.placements[key] ?? { pp: 0, xp: 0 }),
                                  artifactId: opt?.id,
                                  artifactName: opt?.name,
                                },
                              },
                            }));
                          }}
                          style={{ padding: '0.35rem', borderRadius: '0.35rem', minWidth: '160px' }}
                        >
                          <option value="">None</option>
                          <optgroup label="MST store items">
                            {QUIZ_REWARD_ARTIFACTS.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </optgroup>
                          {quizEquippableRewardOptions.length > 0 ? (
                            <optgroup label="Equippable artifacts">
                              {quizEquippableRewardOptions.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                        </select>
                      </label>
                    </div>
                  );
                })}
              </div>
            </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button
                onClick={() => setQuizModalOpen(false)}
                style={{ padding: '0.5rem 1rem', borderRadius: '0.5rem', border: '1px solid #ccc', background: '#f1f5f9' }}
              >
                Cancel
              </button>
              <button
                disabled={
                  quizStartLoading ||
                  ((liveEventLaunchMode === 'quiz' || liveEventLaunchMode === 'battle_royale') && !selectedQuizId) ||
                  (liveEventLaunchMode === 'reflection' && !reflectionPickAssessmentId.trim())
                }
                onClick={async () => {
                  if (!currentUser) return;
                  if (
                    liveEventLaunchMode === 'reflection' ||
                    liveEventLaunchMode === 'goal_setting' ||
                    liveEventLaunchMode === 'class_flow'
                  ) {
                    setQuizStartLoading(true);
                    try {
                      const mode = liveEventLaunchMode;
                      if (mode === 'reflection' && !reflectionPickAssessmentId.trim()) {
                        alert('Choose an assessment — reflections will write to Evidence on that dashboard.');
                        setQuizStartLoading(false);
                        return;
                      }
                      const energyTypeAwarded = getEnergyTypeForMode(mode);
                      await updateDoc(doc(db, 'inSessionRooms', sessionId), {
                        liveEventMode: mode,
                        goalLinkingEnabled: true,
                        energyTypeAwarded,
                        ...(mode === 'reflection'
                          ? {
                              reflectionAssessmentId: reflectionPickAssessmentId.trim(),
                              reflectionPrompt: reflectionPickPrompt.trim() || null,
                            }
                          : {}),
                        updatedAt: serverTimestamp(),
                      });
                      const label =
                        mode === 'reflection' ? 'Reflection' : mode === 'goal_setting' ? 'Goal setting' : 'Class Flow';
                      await appendBattleLog(
                        mode === 'class_flow'
                          ? '🏃 Class Flow mode active — use the Sprint panel for timed goals and participation rewards.'
                          : `🌊 ${label} mode active — responses can link to player goals.`
                      );
                      if (mode === 'reflection') {
                        const linked = reflectionModalAssessments.find((a) => a.id === reflectionPickAssessmentId.trim());
                        await appendBattleLog(
                          `🪞 Reflection evidence → Assessment: ${linked?.title ?? reflectionPickAssessmentId.trim()}`
                        );
                      }
                      setQuizModalOpen(false);
                    } catch (e) {
                      console.error(e);
                      alert('Failed to update session mode. Check permissions and try again.');
                    } finally {
                      setQuizStartLoading(false);
                    }
                    return;
                  }
                  if (!selectedQuizId) return;
                  setQuizStartLoading(true);
                  const hasRewards = Object.values(quizRewardConfig.placements).some(
                    (p) => (p.pp > 0 || p.xp > 0 || !!(p.artifactId || p.artifactName))
                  );
                  const rewardConfigToSave = hasRewards ? { ...quizRewardConfig } : undefined;
                  const finalSurvivors =
                    brSurvivorPreset === 'custom'
                      ? Math.max(1, brCustomSurvivorTarget)
                      : parseInt(brSurvivorPreset, 10);
                  const useTeamBr = liveEventLaunchMode === 'battle_royale' && battleRoyaleTeamFormat;
                  const startOptions =
                    liveEventLaunchMode === 'quiz'
                      ? undefined
                      : useTeamBr
                        ? {
                            gameMode: 'team_battle_royale' as const,
                            teamBattleRoyale: { ...teamBrHostConfig },
                            roomPlayerUids: sessionPlayers.map((p) => p.userId),
                          }
                        : {
                            gameMode: 'battle_royale' as const,
                            battleRoyale: { ...brHostConfig, finalSurvivorsTarget: finalSurvivors },
                            roomPlayerUids: sessionPlayers.map((p) => p.userId),
                          };
                  const res = await startQuizSession(
                    sessionId,
                    currentUser.uid,
                    selectedQuizId,
                    quizNumQuestions,
                    quizTimeLimit,
                    rewardConfigToSave,
                    startOptions
                  );
                  if (!res.ok) {
                    alert(res.error || 'Failed to start quiz');
                    setQuizStartLoading(false);
                    return;
                  }
                  const launch = await launchFirstQuestion(sessionId, currentUser.uid);
                  if (!launch.ok) {
                    alert(launch.error || 'Failed to launch first question');
                    setQuizStartLoading(false);
                    return;
                  }
                  try {
                    const roomMode: LiveEventModeType =
                      liveEventLaunchMode === 'quiz' ? 'quiz' : 'battle_royale';
                    await updateDoc(doc(db, 'inSessionRooms', sessionId), {
                      liveEventMode: roomMode,
                      goalLinkingEnabled: true,
                      energyTypeAwarded: getEnergyTypeForMode(roomMode),
                      updatedAt: serverTimestamp(),
                    });
                  } catch (e) {
                    console.warn('Live Event room metadata update failed (quiz still started):', e);
                  }
                  const modeLabel =
                    liveEventLaunchMode === 'quiz'
                      ? 'Quiz'
                      : useTeamBr
                        ? 'Team Battle Royale'
                        : 'Battle Royale';
                  await appendBattleLog(
                    `📋 ${modeLabel} started: ${quizList.find((q) => q.id === selectedQuizId)?.title ?? 'Quiz'} (${quizNumQuestions} in bank, ${quizTimeLimit}s each)`
                  );
                  setQuizStartLoading(false);
                  setQuizModalOpen(false);
                }}
                style={{
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.5rem',
                  background: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  fontWeight: 600,
                  cursor: quizStartLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {quizStartLoading
                  ? 'Starting...'
                  : liveEventLaunchMode === 'reflection' || liveEventLaunchMode === 'goal_setting'
                    ? 'Activate mode'
                    : 'Start'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', height: 'calc(100vh - 200px)', minHeight: '600px' }}>
        {/* Left Side - Players (Scrollable) */}
        <div style={{
          background: 'white',
          borderRadius: '0.75rem',
          padding: '1rem',
          border: '1px solid #e5e7eb',
          width: '280px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem', color: '#1f2937', fontWeight: '600' }}>Players</h2>
          <div style={{ 
            flex: 1, 
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            paddingRight: '0.5rem'
          }}>
            {leftStudents.map((student) => (
              <React.Fragment key={student.id}>
                {renderPlayerCard(student, true)}
                {sessionSummons
                  .filter(summon => summon.summonerId === student.id)
                  .map(summon => renderSummonCard(summon))}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Center - Quiz Mode or Battle Log + Action Buttons + BattleEngine */}
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1rem',
          minWidth: 0,
          position: 'relative'
        }}>
          {currentUser && (
            <LiveEventReflectionPanel
              sessionId={sessionId}
              classId={classId}
              reflectionAssessmentId={roomReflectionMeta.reflectionAssessmentId}
              reflectionPrompt={roomReflectionMeta.reflectionPrompt}
              liveEventMode={roomReflectionMeta.liveEventMode}
              isSessionHost={isSessionHost}
              currentUserId={currentUser.uid}
              displayName={currentUser.displayName || currentUser.email?.split('@')[0] || 'Player'}
              onAppendBattleLog={appendBattleLog}
            />
          )}
          {/* Tab to swap between Quiz and Battle Log when a quiz is active - sticky, high z-index so always clickable */}
          {quizSession && (
            <div
              role="tablist"
              aria-label="Switch between Quiz and Battle Log"
              style={{
                display: 'flex',
                gap: '0.25rem',
                flexShrink: 0,
                position: 'sticky',
                top: 0,
                zIndex: 50,
                background: '#1f2937',
                paddingBottom: '0.25rem',
                pointerEvents: 'auto',
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={centerView === 'quiz'}
                aria-label="Show Quiz"
                tabIndex={centerView === 'quiz' ? -1 : 0}
                onClick={() => setCenterView('quiz')}
                style={{
                  padding: '0.5rem 1rem',
                  fontWeight: 600,
                  borderRadius: '0.5rem',
                  border: '2px solid #4f46e5',
                  background: centerView === 'quiz' ? '#4f46e5' : 'transparent',
                  color: centerView === 'quiz' ? 'white' : '#4f46e5',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  pointerEvents: 'auto',
                }}
              >
                📋 Quiz
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={centerView === 'battleLog'}
                aria-label="Show Battle Log"
                tabIndex={centerView === 'battleLog' ? -1 : 0}
                onClick={() => setCenterView('battleLog')}
                style={{
                  padding: '0.5rem 1rem',
                  fontWeight: 600,
                  borderRadius: '0.5rem',
                  border: '2px solid #374151',
                  background: centerView === 'battleLog' ? '#374151' : 'transparent',
                  color: centerView === 'battleLog' ? 'white' : '#374151',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  pointerEvents: 'auto',
                }}
              >
                📜 Battle Log
              </button>
              {mstMktOpen &&
                !showSessionSummary &&
                (roomSessionStatus === 'live' || roomSessionStatus === 'active') && (
                  <button
                    type="button"
                    onClick={() => setShowMstMktModal(true)}
                    style={{
                      padding: '0.5rem 1rem',
                      fontWeight: 700,
                      borderRadius: '0.5rem',
                      border: '2px solid #ca8a04',
                      background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
                      color: '#1c1917',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      pointerEvents: 'auto',
                    }}
                    title="MST MKT — spend Participation PP"
                  >
                    🛒 MKT
                  </button>
                )}
            </div>
          )}
          {quizSession && isBattleQuizMode(quizSession.gameMode) && (
            <div
              style={{
                flexShrink: 0,
                background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
                borderRadius: '0.75rem',
                padding: '0.75rem 1rem',
                border: '1px solid #4b5563',
                maxHeight: '180px',
                overflowY: 'auto',
              }}
            >
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#fca5a5',
                  marginBottom: '0.5rem',
                  letterSpacing: '0.06em',
                }}
              >
                ☠️ ELIMINATIONS
              </div>
              {battleRoyaleEliminations.length === 0 ? (
                <div style={{ color: '#9ca3af', fontSize: '0.8rem', fontStyle: 'italic' }}>No eliminations yet.</div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#e5e7eb', fontSize: '0.82rem', lineHeight: 1.5 }}>
                  {battleRoyaleEliminations.map((row) => (
                    <li key={row.victimId} style={{ marginBottom: '0.25rem' }}>
                      <span style={{ fontWeight: 600 }}>{row.victimName}</span>
                      {row.eliminatorName ? (
                        <>
                          {' '}
                          <span style={{ color: '#9ca3af' }}>— eliminated by</span>{' '}
                          <span style={{ color: '#fde68a', fontWeight: 600 }}>{row.eliminatorName}</span>
                        </>
                      ) : (
                        <span style={{ color: '#9ca3af' }}> — eliminated</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <>
          {quizSession && centerView === 'quiz' && (
            /* Live Quiz Mode panel - full area when Quiz tab is selected */
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative' }}>
              {showEliminatedQuizOverlay && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 60,
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '0.75rem',
                    background: 'rgba(17, 24, 39, 0.3)',
                    animation: 'liveEventEliminatedOverlay 1.8s ease-out forwards',
                  }}
                >
                  <div
                    style={{
                      padding: '1rem 1.5rem',
                      borderRadius: '0.75rem',
                      background: 'linear-gradient(135deg, #7f1d1d 0%, #ef4444 100%)',
                      color: 'white',
                      fontWeight: 800,
                      fontSize: '1.25rem',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      boxShadow: '0 12px 30px rgba(127, 29, 29, 0.45)',
                    }}
                  >
                    Eliminated
                  </div>
                </div>
              )}
              {quizSession.status === 'lobby' && (
                <div style={{ background: '#f0f9ff', padding: '1.5rem', borderRadius: '1rem', textAlign: 'center' }}>
                  <p style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0369a1' }}>Quiz starting soon...</p>
                  <p style={{ color: '#64748b', marginTop: '0.5rem' }}>{quizSession.quizTitle} — {quizSession.questionOrder.length} questions</p>
                  {isSessionHost && (
                    <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#64748b' }}>Click &quot;Start First Question&quot; above when ready (or it may start automatically).</p>
                  )}
                </div>
              )}
              {(quizSession.status === 'question_live' || (quizSession.questionEndsAt && Date.now() > quizSession.questionEndsAt && quizSession.status !== 'completed')) && quizSession.currentQuestionId && (() => {
                const currentQ = quizQuestions.find((q) => q.id === quizSession.currentQuestionId);
                const timeExpired = quizSession.questionEndsAt != null && Date.now() > quizSession.questionEndsAt;
                const correctIndices = currentQ?.correctIndices ?? (currentQ?.correctIndex !== undefined ? [currentQ.correctIndex] : []);
                const isBattle = isBattleQuizMode(quizSession.gameMode);
                const shuffleOn =
                  (quizSession.gameMode === 'battle_royale' && quizSession.battleRoyaleConfig?.shuffleAnswers) ||
                  (quizSession.gameMode === 'team_battle_royale' && quizSession.teamBattleRoyaleConfig?.shuffleAnswers);
                const brRepeat =
                  (quizSession.gameMode === 'battle_royale' && quizSession.battleRoyaleConfig?.autoRepeatQuestions) ||
                  (quizSession.gameMode === 'team_battle_royale' && quizSession.teamBattleRoyaleConfig?.autoRepeatQuestions);
                const atBankEnd = (quizSession.questionIndex ?? 0) + 1 >= (quizSession.questionOrder?.length ?? 0);
                const nextBtnLabel = isBattle && brRepeat ? 'Next Question →' : atBankEnd ? 'Finish Quiz' : 'Next Question →';
                const myStreak = quizSession.battleRoyaleState?.streaks?.[currentUser?.uid ?? ''] ?? 0;
                const myEnergy = quizSession.battleRoyaleState?.energy?.[currentUser?.uid ?? ''] ?? 0;
                const myStrong = quizSession.battleRoyaleState?.strongUnlocked?.[currentUser?.uid ?? ''] ?? false;
                const canBrCombat = isBattle && currentUser && !currentPlayer?.eliminated;
                const runBrAction = async (action: BrQuickActionId) => {
                  if (!currentUser || !brQuickTargetUid) {
                    alert('Select a target player first (or yourself for Shield).');
                    return;
                  }
                  const targetP = sessionPlayers.find((p) => p.userId === brQuickTargetUid);
                  const res = await submitBattleRoyaleQuickAction(
                    sessionId,
                    currentUser.uid,
                    currentUser.displayName || 'Player',
                    action,
                    brQuickTargetUid,
                    targetP?.displayName || 'Target'
                  );
                  if (!res.ok) alert(res.error || 'Action failed');
                };
                return currentQ ? (
                  <div key={`${quizSession.currentQuestionId}-${quizSession.quizRoundIndex ?? 0}`}>
                    {isBattle && (
                      <div style={{ padding: '0.5rem 0.75rem', background: '#1e293b', color: '#e2e8f0', borderRadius: '0.5rem', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                        <strong>
                          {quizSession.gameMode === 'battle_royale' ? 'Battle Royale' : 'Team Battle Royale'}
                        </strong>
                        {' · '}
                        Streak {myStreak} · Energy {myEnergy}
                        {myStrong ? ' · Strong ready' : ''}
                      </div>
                    )}
                    <LiveQuizQuestionCard
                      question={currentQ}
                      questionNumber={(quizSession.questionIndex ?? 0) + 1}
                      totalQuestions={quizSession.questionOrder?.length ?? 0}
                      countdownSeconds={quizCountdown}
                      timeExpired={timeExpired}
                    />
                    <LiveQuizAnswerOptions
                      question={currentQ}
                      selectedIndices={quizSelectedIndices}
                      onSelect={(idx) => {
                        if (quizAnswerSubmitted) return;
                        const next = quizSelectedIndices.includes(idx)
                          ? quizSelectedIndices.filter((i) => i !== idx)
                          : [...quizSelectedIndices, idx];
                        setQuizSelectedIndices(next);
                      }}
                      disabled={quizAnswerSubmitted || timeExpired}
                      reveal={timeExpired || !!quizMyResponse}
                      submittedIndices={quizMyResponse?.selectedIndices}
                      shuffle={!!shuffleOn}
                      shuffleKey={String(quizSession.quizRoundIndex ?? 0)}
                    />
                    {!quizAnswerSubmitted && !timeExpired && (
                      <button
                        onClick={async () => {
                          if (!currentUser || !currentQ || quizAnswerSubmitted) return;
                          const res = await submitQuizResponse(
                            sessionId,
                            currentUser.uid,
                            quizSession.currentQuestionId!,
                            quizSelectedIndices.length ? quizSelectedIndices : [0],
                            correctIndices,
                            quizSession.quizRoundIndex ?? 1
                          );
                          if (res.ok) {
                            setQuizAnswerSubmitted(true);
                            setQuizMyResponse({
                              selectedIndices: quizSelectedIndices.length ? quizSelectedIndices : [0],
                              isCorrect: res.isCorrect === true,
                              pointsAwarded: res.pointsAwarded ?? 0,
                            });
                          } else if (res.error) alert(res.error);
                        }}
                        disabled={quizSelectedIndices.length === 0}
                        style={{
                          marginTop: '1rem',
                          padding: '0.75rem 1.5rem',
                          background: quizSelectedIndices.length > 0 ? '#10b981' : '#9ca3af',
                          color: 'white',
                          border: 'none',
                          borderRadius: '0.5rem',
                          fontWeight: 600,
                          cursor: quizSelectedIndices.length > 0 ? 'pointer' : 'not-allowed',
                        }}
                      >
                        Submit Answer
                      </button>
                    )}
                    {(timeExpired || quizMyResponse) && quizMyResponse && (
                      <div style={{
                        marginTop: '1rem',
                        padding: '1.25rem 1rem',
                        background: quizMyResponse.isCorrect ? '#ecfdf5' : '#fef2f2',
                        borderRadius: '0.75rem',
                        border: `2px solid ${quizMyResponse.isCorrect ? '#10b981' : '#ef4444'}`,
                        textAlign: 'left',
                      }}>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: quizMyResponse.isCorrect ? '#047857' : '#b91c1c', marginBottom: quizMyResponse.isCorrect ? '0.5rem' : 0 }}>
                          {quizMyResponse.isCorrect ? '✓ Correct!' : '✗ Incorrect'}
                        </div>
                        <div style={{ color: '#374151', fontSize: '0.95rem' }}>
                          {isBattle ? (
                            <>
                              +{quizMyResponse.pointsAwarded} PP (Participation)
                              {quizMyResponse.isCorrect && (
                                <span style={{ marginLeft: '0.35rem', color: '#64748b' }}>(streak bonuses at 3 / 5 / 7)</span>
                              )}
                            </>
                          ) : (
                            <>
                              {quizMyResponse.pointsAwarded} pts
                              {quizMyResponse.isCorrect && (
                                <>
                                  <span style={{ margin: '0 0.35rem' }}>•</span>
                                  <strong style={{ color: '#059669' }}>+1 Participation Point</strong>
                                </>
                              )}
                            </>
                          )}
                        </div>
                        {quizMyResponse.isCorrect && !isBattle && (
                          <div style={{
                            marginTop: '0.75rem',
                            padding: '0.6rem 0.75rem',
                            background: 'rgba(5, 150, 105, 0.15)',
                            borderRadius: '0.5rem',
                            fontSize: '0.9rem',
                            color: '#065f46',
                            fontWeight: 600,
                          }}>
                            🗡️ You can now use <strong>Skills</strong> to attack other players and spend points — try the FIGHT button!
                          </div>
                        )}
                        {quizMyResponse.isCorrect && isBattle && (
                          <div style={{
                            marginTop: '0.75rem',
                            padding: '0.6rem 0.75rem',
                            background: 'rgba(5, 150, 105, 0.15)',
                            borderRadius: '0.5rem',
                            fontSize: '0.9rem',
                            color: '#065f46',
                            fontWeight: 600,
                          }}>
                            ⚔️ Spend PP on <strong>quick actions</strong> below or use <strong>Fight</strong> for full skills.
                          </div>
                        )}
                      </div>
                    )}
                    {canBrCombat && (
                      <div style={{ marginTop: '1rem', padding: '1rem', background: '#0f172a', borderRadius: '0.75rem', color: '#e2e8f0' }}>
                        <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>BR quick actions (cost PP)</div>
                        <label style={{ fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>Target</label>
                        <select
                          value={brQuickTargetUid ?? ''}
                          onChange={(e) => setBrQuickTargetUid(e.target.value || null)}
                          style={{ width: '100%', marginBottom: '0.75rem', padding: '0.4rem', borderRadius: '0.35rem' }}
                        >
                          <option value="">Select player…</option>
                          {sessionPlayers
                            .filter((p) => !p.eliminated || p.userId === currentUser?.uid)
                            .map((p) => (
                              <option key={p.userId} value={p.userId}>
                                {p.displayName}
                                {p.userId === currentUser?.uid ? ' (you)' : ''}
                              </option>
                            ))}
                        </select>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                          {(
                            [
                              ['attack', 'Attack (1)'],
                              ['shield', 'Shield (1)'],
                              ['heal', 'Heal (2)'],
                              ['control', 'Control (2)'],
                              ['strong', 'Strong (3+E)'],
                            ] as const
                          ).map(([id, label]) => (
                            <button
                              key={id}
                              type="button"
                              onClick={() => runBrAction(id)}
                              style={{
                                padding: '0.4rem 0.6rem',
                                borderRadius: '0.35rem',
                                border: '1px solid #475569',
                                background: '#334155',
                                color: '#fff',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                              }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.5rem', marginBottom: 0 }}>
                          Shield targets yourself. Strong needs 1 Energy (streak ×5) or 7-streak unlock.
                        </p>
                      </div>
                    )}
                    {isSessionHost && (
                      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Answers: {quizResponseCount} / {sessionPlayers.length}</span>
                        {(() => {
                          const gapMs =
                            quizSession.gameMode === 'battle_royale'
                              ? quizSession.battleRoyaleConfig?.autoAdvanceDelayMs
                              : quizSession.teamBattleRoyaleConfig?.autoAdvanceDelayMs;
                          if (
                            !isBattle ||
                            gapMs == null ||
                            gapMs <= 0 ||
                            brInterQuestionSecondsLeft == null ||
                            brInterQuestionSecondsLeft <= 0
                          ) {
                            return null;
                          }
                          return (
                            <span style={{ fontSize: '0.9rem', color: '#059669', fontWeight: 700 }}>
                              Next question auto in {brInterQuestionSecondsLeft}s
                            </span>
                          );
                        })()}
                        <button
                          onClick={async () => {
                            if (!currentUser) return;
                            const prevIdx = quizSession.questionIndex ?? 0;
                            const total = quizSession.questionOrder?.length ?? 0;
                            const res = await advanceQuiz(sessionId, currentUser.uid);
                            if (res.ok && res.completed) {
                              await runHostQuizCompletedFollowUp();
                            } else if (res.ok) {
                              await appendBattleLog(`📋 Next question (${prevIdx + 2}/${total})`);
                            }
                            if (res.error) alert(res.error);
                          }}
                          style={{ padding: '0.5rem 1rem', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '0.5rem', fontWeight: 600, cursor: 'pointer' }}
                          title={atBankEnd && !brRepeat ? 'Complete the quiz and show final standings' : 'Show the next question'}
                        >
                          {(() => {
                            const gap =
                              quizSession.gameMode === 'battle_royale'
                                ? quizSession.battleRoyaleConfig?.autoAdvanceDelayMs
                                : quizSession.gameMode === 'team_battle_royale'
                                  ? quizSession.teamBattleRoyaleConfig?.autoAdvanceDelayMs
                                  : 0;
                            if (isBattle && gap != null && gap > 0) {
                              return `${nextBtnLabel} (or wait for auto)`;
                            }
                            return nextBtnLabel;
                          })()}
                        </button>
                        <button
                          onClick={async () => {
                            if (!currentUser) return;
                            const res = await endQuizSession(sessionId, currentUser.uid);
                            if (res.ok) await appendBattleLog('📋 Quiz ended by host.');
                            if (res.error) alert(res.error);
                          }}
                          style={{ padding: '0.5rem 1rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
                          title="End the quiz early (no more questions)"
                        >
                          End Quiz
                        </button>
                      </div>
                    )}
                  </div>
                ) : null;
              })()}
              {quizSession.status === 'completed' && (() => {
                const placements = (quizSession.rewardConfig?.placements ?? {}) as LiveQuizRewardConfig['placements'];
                const entriesWithScores = sessionPlayers.map((p) => ({
                  uid: p.userId,
                  displayName: p.displayName,
                  score: quizSession.leaderboard?.[p.userId] ?? 0,
                  correctCount: quizSession.correctCount?.[p.userId],
                }));
                const sortedByScore = [...entriesWithScores].sort((a, b) => b.score - a.score);
                const entriesWithPP = entriesWithScores.map((entry) => {
                  const rank = sortedByScore.findIndex((e) => e.uid === entry.uid) + 1;
                  const reward = rank > 0 ? getPlacementRewardForRank(placements, rank) : null;
                  const ppEarned = reward?.pp ?? 0;
                  return { ...entry, ppEarned: ppEarned > 0 ? ppEarned : undefined };
                });
                return (
                <div>
                  <div style={{ marginBottom: '1rem', padding: '1rem', background: '#ecfdf5', borderRadius: '0.5rem', border: '2px solid #10b981', textAlign: 'center' }}>
                    <strong>{isBattleQuizMode(quizSession.gameMode) ? 'Match complete!' : 'Quiz complete!'}</strong>
                    {quizSession.battleEndReason && (
                      <div style={{ marginTop: '0.35rem', fontSize: '0.9rem', color: '#047857' }}>
                        End reason: {quizSession.battleEndReason.replace(/_/g, ' ')}
                      </div>
                    )}
                  </div>
                  <LiveQuizLeaderboard
                    entries={entriesWithPP}
                    title="Final standings"
                  />
                  {/* Host only: how every player did — per-player breakdown */}
                  {isSessionHost && (() => {
                    const totalQuestions = quizSession.questionOrder?.length ?? 0;
                    const questionMap = new Map(quizQuestions.map((q) => [q.id, q]));
                    const truncate = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max) + '…');
                    return (
                      <div style={{
                        marginTop: '1.25rem',
                        padding: '1.25rem',
                        background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
                        borderRadius: '1rem',
                        border: '2px solid #93c5fd',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      }}>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1e40af', marginBottom: '0.5rem' }}>
                          👥 How every player did
                        </h3>
                        <p style={{ fontSize: '0.9rem', color: '#1e3a8a', marginBottom: '1rem' }}>
                          Breakdown of each player&apos;s performance on this quiz.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {entriesWithPP.map((entry) => {
                            const perQuestion = quizSession.perQuestionResults?.[entry.uid] ?? [];
                            const correctItems = perQuestion.filter((r: { isCorrect: boolean }) => r.isCorrect).map((r: { questionId: string }) => questionMap.get(r.questionId)?.prompt || `Q ${r.questionId}`);
                            const wrongItems = perQuestion.filter((r: { isCorrect: boolean }) => !r.isCorrect).map((r: { questionId: string }) => questionMap.get(r.questionId)?.prompt || `Q ${r.questionId}`);
                            const correctCount = quizSession.correctCount?.[entry.uid] ?? correctItems.length;
                            const passPct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
                            const participationPP = correctCount * LIVE_EVENT_PP_PER_PARTICIPATION_POINT;
                            const totalPP = (entry.ppEarned ?? 0) + participationPP;
                            return (
                              <div
                                key={entry.uid}
                                style={{
                                  padding: '1rem',
                                  background: 'white',
                                  borderRadius: '0.75rem',
                                  border: '1px solid #bfdbfe',
                                  fontSize: '0.9rem',
                                }}
                              >
                                <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                                  {entry.displayName}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.5rem', color: '#475569' }}>
                                  <span>{entry.score} pts</span>
                                  <span>{correctCount}/{totalQuestions} correct</span>
                                  <span style={{ fontWeight: 600, color: passPct >= 70 ? '#059669' : passPct >= 50 ? '#d97706' : '#dc2626' }}>
                                    Pass: {passPct}%
                                  </span>
                                  <span>+{totalPP} PP</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                                  <div style={{ padding: '0.5rem', background: '#ecfdf5', borderRadius: '0.375rem', border: '1px solid #a7f3d0' }}>
                                    <div style={{ fontWeight: 600, color: '#047857', fontSize: '0.8rem' }}>✓ Correct ({correctItems.length})</div>
                                    {correctItems.length === 0 ? <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>—</div> : (
                                      <ul style={{ margin: 0, paddingLeft: '1rem', color: '#065f46', fontSize: '0.85rem' }}>
                                        {correctItems.slice(0, 5).map((text: string, i: number) => <li key={i}>{truncate(text, 50)}</li>)}
                                        {correctItems.length > 5 && <li style={{ color: '#6b7280' }}>+{correctItems.length - 5} more</li>}
                                      </ul>
                                    )}
                                  </div>
                                  <div style={{ padding: '0.5rem', background: '#fef2f2', borderRadius: '0.375rem', border: '1px solid #fecaca' }}>
                                    <div style={{ fontWeight: 600, color: '#b91c1c', fontSize: '0.8rem' }}>✗ Wrong ({wrongItems.length})</div>
                                    {wrongItems.length === 0 ? <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>—</div> : (
                                      <ul style={{ margin: 0, paddingLeft: '1rem', color: '#991b1b', fontSize: '0.85rem' }}>
                                        {wrongItems.slice(0, 5).map((text: string, i: number) => <li key={i}>{truncate(text, 50)}</li>)}
                                        {wrongItems.length > 5 && <li style={{ color: '#6b7280' }}>+{wrongItems.length - 5} more</li>}
                                      </ul>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  {/* Each player sees their own performance breakdown */}
                  {currentUser && (() => {
                    const uid = currentUser.uid;
                    const myCorrect = quizSession.correctCount?.[uid] ?? 0;
                    const totalQuestions = quizSession.questionOrder?.length ?? 0;
                    const myWrong = totalQuestions - myCorrect;
                    const passPct = totalQuestions > 0 ? Math.round((myCorrect / totalQuestions) * 100) : 0;
                    const myEntry = entriesWithPP.find((e) => e.uid === uid);
                    const placementPP = myEntry?.ppEarned ?? 0;
                    const participationPP = myCorrect * LIVE_EVENT_PP_PER_PARTICIPATION_POINT;
                    const totalPP = placementPP + participationPP;
                    const perQuestion = quizSession.perQuestionResults?.[uid] ?? [];
                    const questionMap = new Map(quizQuestions.map((q) => [q.id, q]));
                    const correctItems = perQuestion.filter((r) => r.isCorrect).map((r) => questionMap.get(r.questionId)?.prompt || `Question ${r.questionId}`);
                    const wrongItems = perQuestion.filter((r) => !r.isCorrect).map((r) => questionMap.get(r.questionId)?.prompt || `Question ${r.questionId}`);
                    const truncate = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max) + '…');
                    return (
                      <div style={{
                        marginTop: '1.25rem',
                        padding: '1.25rem',
                        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                        borderRadius: '1rem',
                        border: '2px solid #e2e8f0',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                      }}>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.35rem' }}>
                          📋 Your performance breakdown
                        </h3>
                        <p style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '1rem' }}>
                          How you did on each question and what you earned.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.95rem' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <div style={{ padding: '0.75rem', background: '#ecfdf5', borderRadius: '0.5rem', border: '1px solid #a7f3d0' }}>
                              <div style={{ fontWeight: 600, color: '#047857', marginBottom: '0.35rem' }}>✓ Correct ({correctItems.length})</div>
                              {correctItems.length === 0 ? <div style={{ color: '#6b7280' }}>None</div> : (
                                <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#065f46' }}>
                                  {correctItems.map((text, i) => <li key={i}>{truncate(text, 60)}</li>)}
                                </ul>
                              )}
                            </div>
                            <div style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: '0.5rem', border: '1px solid #fecaca' }}>
                              <div style={{ fontWeight: 600, color: '#b91c1c', marginBottom: '0.35rem' }}>✗ Wrong ({wrongItems.length})</div>
                              {wrongItems.length === 0 ? <div style={{ color: '#6b7280' }}>None</div> : (
                                <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#991b1b' }}>
                                  {wrongItems.map((text, i) => <li key={i}>{truncate(text, 60)}</li>)}
                                </ul>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, color: '#374151' }}>Overall:</span>
                            <span>{myCorrect}/{totalQuestions} correct</span>
                            <span style={{ fontWeight: 600, color: passPct >= 70 ? '#059669' : passPct >= 50 ? '#d97706' : '#dc2626' }}>
                              Pass: {passPct}%
                            </span>
                          </div>
                          <div style={{ padding: '0.75rem', background: '#fef3c7', borderRadius: '0.5rem', border: '1px solid #fcd34d' }}>
                            <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '0.25rem' }}>💰 PP earned this quiz</div>
                            <div style={{ color: '#78350f' }}>
                              {placementPP > 0 && <span>Placement: +{placementPP} PP</span>}
                              {placementPP > 0 && participationPP > 0 && <span> · </span>}
                              {participationPP > 0 && <span>Participation ({myCorrect} correct): +{participationPP} PP</span>}
                              {(placementPP === 0 && participationPP === 0) && <span>0 PP</span>}
                              {(placementPP > 0 || participationPP > 0) && <strong style={{ marginLeft: '0.5rem' }}>Total: +{totalPP} PP</strong>}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {isSessionHost && (
                    <button
                      onClick={async () => {
                        if (!currentUser) return;
                        const res = await clearQuizSession(sessionId, currentUser.uid);
                        if (res.ok) setQuizSession(null);
                        if (res.error) alert(res.error);
                      }}
                      style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
                    >
                      Close
                    </button>
                  )}
                </div>
                );
              })()}
              {/* Mini leaderboard during quiz (right side or below) */}
              {quizSession.status === 'question_live' && Object.keys(quizSession.leaderboard ?? {}).length > 0 && (
                <LiveQuizLeaderboard
                  entries={sessionPlayers.map((p) => ({
                    uid: p.userId,
                    displayName: p.displayName,
                    score: quizSession.leaderboard?.[p.userId] ?? 0,
                    correctCount: quizSession.correctCount?.[p.userId],
                  }))}
                  title="Standings"
                  maxEntries={5}
                />
              )}
            </div>
          )}
          {/* Battle Log and Skills - show when no quiz or when Battle Log tab is selected */}
          {(!quizSession || centerView === 'battleLog') && (
          <>
          {/* Battle Log */}
          <div style={{
            background: '#374151',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            border: '2px solid #1f2937',
            flex: 1,
            minHeight: '200px',
            maxHeight: '400px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 2
          }}>
            <h3 style={{ 
              fontSize: '1rem', 
              marginBottom: '1rem', 
              color: 'white',
              fontWeight: 'bold',
              textAlign: 'center'
            }}>
              📜 BATTLE LOG
            </h3>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              color: 'white'
            }}>
              {battleLog.length === 0 ? (
                <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>
                  Welcome to the MST Battle Arena! Select a move to begin your attack!
                </div>
              ) : (
                [...battleLog].reverse().map((log, revIndex) => (
                  <div key={battleLog.length - 1 - revIndex} style={{ color: 'white', padding: '0.25rem 0' }}>
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            zIndex: 2
          }}>
            <button
              onClick={() => {
                console.log('⚔️ [InSessionBattle] FIGHT button clicked', {
                  hasCurrentPlayer: !!currentPlayer,
                  movesEarned: currentPlayer?.movesEarned || 0,
                  willOpenMenu: !!(currentPlayer && (currentPlayer.movesEarned || 0) > 0)
                });
                if (currentPlayer && (currentPlayer.movesEarned || 0) > 0) {
                  setShowMoveMenu(true);
                  console.log('✅ [InSessionBattle] Move menu opened');
                } else {
                  console.warn('⚠️ [InSessionBattle] Cannot open menu - no moves available');
                }
              }}
              disabled={!currentPlayer || (currentPlayer.movesEarned || 0) === 0}
              style={{
                width: '100%',
                background: (currentPlayer && (currentPlayer.movesEarned || 0) > 0) 
                  ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' 
                  : '#9ca3af',
                color: 'white',
                border: '3px solid #8B4513',
                borderRadius: '0.5rem',
                padding: '1rem',
                fontSize: '1.125rem',
                fontWeight: 'bold',
                cursor: (currentPlayer && (currentPlayer.movesEarned || 0) > 0) ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                boxShadow: (currentPlayer && (currentPlayer.movesEarned || 0) > 0) 
                  ? '0 4px 12px rgba(239, 68, 68, 0.3)' 
                  : 'none',
                opacity: (currentPlayer && (currentPlayer.movesEarned || 0) > 0) ? 1 : 0.6
              }}
              onMouseEnter={(e) => {
                if (currentPlayer && (currentPlayer.movesEarned || 0) > 0) {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (currentPlayer && (currentPlayer.movesEarned || 0) > 0) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.3)';
                }
              }}
              title={(currentPlayer && (currentPlayer.movesEarned || 0) === 0) ? 'No moves available. Earn Par. Pt. to make moves!' : 'Select a move to attack'}
            >
              ⚔️ FIGHT {(!currentPlayer || (currentPlayer.movesEarned || 0) === 0) && '(No Moves)'}
            </button>
            <button
              onClick={() => {
                if (currentPlayer && (currentPlayer.movesEarned || 0) > 0) {
                  setShowBagModal(true);
                }
              }}
              disabled={!currentPlayer || (currentPlayer.movesEarned || 0) === 0}
              style={{
                width: '100%',
                background: (currentPlayer && (currentPlayer.movesEarned || 0) > 0) 
                  ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' 
                  : '#9ca3af',
                color: 'white',
                border: '3px solid #8B4513',
                borderRadius: '0.5rem',
                padding: '1rem',
                fontSize: '1.125rem',
                fontWeight: 'bold',
                cursor: (currentPlayer && (currentPlayer.movesEarned || 0) > 0) ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                boxShadow: (currentPlayer && (currentPlayer.movesEarned || 0) > 0) 
                  ? '0 4px 12px rgba(245, 158, 11, 0.3)' 
                  : 'none',
                opacity: (currentPlayer && (currentPlayer.movesEarned || 0) > 0) ? 1 : 0.6
              }}
              onMouseEnter={(e) => {
                if (currentPlayer && (currentPlayer.movesEarned || 0) > 0) {
                  e.currentTarget.style.transform = 'scale(1.02)';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(245, 158, 11, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (currentPlayer && (currentPlayer.movesEarned || 0) > 0) {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(245, 158, 11, 0.3)';
                }
              }}
              title={(currentPlayer && (currentPlayer.movesEarned || 0) === 0) ? 'No moves available. Earn Par. Pt. to use items!' : 'Use items from your bag'}
            >
              🎒 BAG {(!currentPlayer || (currentPlayer.movesEarned || 0) === 0) && '(No Moves)'}
            </button>
            <button
              type="button"
              onClick={() => setShowMstMktModal(true)}
              disabled={
                !currentUser ||
                showSessionSummary ||
                !mstMktOpen ||
                (roomSessionStatus !== 'live' && roomSessionStatus !== 'active')
              }
              style={{
                width: '100%',
                background:
                  currentUser &&
                  !showSessionSummary &&
                  mstMktOpen &&
                  (roomSessionStatus === 'live' || roomSessionStatus === 'active')
                    ? 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)'
                    : '#9ca3af',
                color: 'white',
                border: '3px solid #8B4513',
                borderRadius: '0.5rem',
                padding: '1rem',
                fontSize: '1.125rem',
                fontWeight: 'bold',
                cursor:
                  currentUser &&
                  !showSessionSummary &&
                  mstMktOpen &&
                  (roomSessionStatus === 'live' || roomSessionStatus === 'active')
                    ? 'pointer'
                    : 'not-allowed',
                transition: 'all 0.2s',
                boxShadow:
                  currentUser &&
                  !showSessionSummary &&
                  mstMktOpen &&
                  (roomSessionStatus === 'live' || roomSessionStatus === 'active')
                    ? '0 4px 12px rgba(234, 179, 8, 0.35)'
                    : 'none',
                opacity:
                  currentUser &&
                  !showSessionSummary &&
                  mstMktOpen &&
                  (roomSessionStatus === 'live' || roomSessionStatus === 'active')
                    ? 1
                    : 0.55,
              }}
              title={
                !mstMktOpen
                  ? 'Host must open MST MKT'
                  : showSessionSummary
                    ? 'Session ended'
                    : 'Spend Participation PP on survival items'
              }
            >
              🛒 MST MKT
            </button>
            <button
              onClick={() => {
                setShowVaultModal(true);
              }}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: 'white',
                border: '3px solid #8B4513',
                borderRadius: '0.5rem',
                padding: '1rem',
                fontSize: '1.125rem',
                fontWeight: 'bold',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(16, 185, 129, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
              }}
            >
              🏰 VAULT
            </button>
          </div>

          {/* BattleEngine - Hidden UI but functional for battle logic */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1,
            overflow: 'hidden',
            pointerEvents: 'none'
          }}>
            <style>
              {`
                /* Hide the main battle arena container with ALLIES/ENEMIES */
                div[style*="width: 100%"][style*="height: 700px"] {
                  display: none !important;
                }
                /* Show only the move selection menu when it appears */
                div[style*="position: absolute"][style*="bottom: 120px"][style*="left: 50%"] {
                  display: block !important;
                  pointer-events: auto !important;
                  z-index: 10000 !important;
                  position: fixed !important;
                }
              `}
            </style>
            <div style={{ pointerEvents: 'auto', width: '100%', height: '100%' }}>
              <BattleEngine
                onBattleEnd={handleBattleEnd}
                onMoveConsumption={handleMoveConsumption}
                onBattleLogUpdate={handleBattleLogUpdate}
                opponents={opponents}
                allies={alliesForBattleEngine}
                onAlliesUpdate={handleAlliesUpdateFromBattle}
                isMultiplayer={true}
                isPvP={true}
                isInSession={true}
                sessionId={sessionId}
                onArtifactUsed={() => {
                  // Handle artifact used - end turn
                  setShowBagModal(false);
                }}
              />
            </div>
          </div>
          </>
          )}
          </>
        </div>

        {/* Right Side - Players (Scrollable) */}
        <div style={{
          background: 'white',
          borderRadius: '0.75rem',
          padding: '1rem',
          border: '1px solid #e5e7eb',
          width: '280px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem', color: '#1f2937', fontWeight: '600' }}>Players</h2>
          <div style={{ 
            flex: 1, 
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            paddingRight: '0.5rem'
          }}>
            {rightStudents.map((student) => (
              <React.Fragment key={student.id}>
                {renderPlayerCard(student, false)}
                {sessionSummons
                  .filter(summon => summon.summonerId === student.id)
                  .map(summon => renderSummonCard(summon))}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>


      {/* Modals */}
      <BagModal 
        isOpen={showBagModal} 
        onClose={() => setShowBagModal(false)}
        liveSessionId={sessionId}
        sessionPlayers={sessionPlayers}
        onArtifactUsed={async (opts) => {
          setShowBagModal(false);
          if (!opts?.skipParticipationMove) {
            await handleMoveConsumption();
          }
        }}
      />
      {currentUser && (
        <LiveEventMstMktModal
          isOpen={showMstMktModal}
          onClose={() => setShowMstMktModal(false)}
          sessionId={sessionId}
          currentPlayer={currentPlayer ? ({ ...currentPlayer } as ServiceSessionPlayer) : null}
          currentUserId={currentUser.uid}
          displayName={currentUser.displayName || currentUser.email?.split('@')[0] || 'Player'}
          sessionPlayers={sessionPlayers as ServiceSessionPlayer[]}
          onPurchaseComplete={() => {
            void refreshInventory();
          }}
        />
      )}
      <VaultModal 
        isOpen={showVaultModal} 
        onClose={() => setShowVaultModal(false)}
      />
      {showPlayerInspectModal && (
        <div
          onClick={() => setShowPlayerInspectModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            zIndex: 10001,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '720px',
              maxHeight: '85vh',
              overflowY: 'auto',
              background: '#ffffff',
              borderRadius: '0.75rem',
              border: '1px solid #e5e7eb',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)',
              padding: '1rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                {playerInspectData?.photoURL ? (
                  <img
                    src={playerInspectData.photoURL}
                    alt={playerInspectData.displayName}
                    style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                    {(playerInspectData?.displayName || 'P').charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>{playerInspectData?.displayName || 'Player'}</div>
                  <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>Live Event Build Viewer</div>
                  {playerInspectData?.powerLevel != null && (
                    <div
                      title={`Power Level = ${playerInspectData.powerLevel}`}
                      style={{ fontSize: '0.78rem', color: '#8b5cf6', fontWeight: 600, marginTop: '0.15rem' }}
                    >
                      ⚡ PL {playerInspectData.powerLevel}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPlayerInspectModal(false)}
                style={{ border: 'none', background: 'transparent', fontSize: '1rem', cursor: 'pointer', color: '#6b7280', fontWeight: 700 }}
              >
                Close
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <button
                type="button"
                onClick={() => setPlayerInspectTab('loadout')}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: '0.45rem',
                  border: '1px solid #cbd5e1',
                  background: playerInspectTab === 'loadout' ? '#e0e7ff' : '#f8fafc',
                  color: playerInspectTab === 'loadout' ? '#312e81' : '#334155',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Loadout
              </button>
              <button
                type="button"
                onClick={() => setPlayerInspectTab('artifacts')}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: '0.45rem',
                  border: '1px solid #cbd5e1',
                  background: playerInspectTab === 'artifacts' ? '#dcfce7' : '#f8fafc',
                  color: playerInspectTab === 'artifacts' ? '#14532d' : '#334155',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Artifacts
              </button>
            </div>

            {playerInspectLoading && <div style={{ color: '#475569', fontSize: '0.9rem' }}>Loading player build...</div>}
            {!playerInspectLoading && playerInspectError && (
              <div style={{ color: '#b91c1c', fontSize: '0.9rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', padding: '0.6rem' }}>
                {playerInspectError}
              </div>
            )}

            {!playerInspectLoading && !playerInspectError && playerInspectTab === 'loadout' && (
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                {(() => {
                  const grouped = playerInspectData?.loadout
                    ? [
                        { title: 'Manifest', skills: playerInspectData.loadout.manifest || [] },
                        { title: 'Elemental', skills: playerInspectData.loadout.elemental || [] },
                        { title: 'RR Candy', skills: playerInspectData.loadout.rrCandy || [] },
                        { title: 'Artifact Skills', skills: playerInspectData.loadout.artifact || [] }
                      ]
                    : [];
                  if (!playerInspectData?.loadout) {
                    return <div style={{ fontSize: '0.88rem', color: '#6b7280' }}>No session loadout snapshot found for this player yet.</div>;
                  }
                  return grouped.map((group) => (
                    <div key={group.title} style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.6rem' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1f2937', marginBottom: '0.35rem' }}>{group.title}</div>
                      {group.skills.length === 0 ? (
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>None equipped</div>
                      ) : (
                        <div style={{ display: 'grid', gap: '0.35rem' }}>
                          {group.skills.map((skill: any) => (
                            <div key={skill.id || `${group.title}-${skill.name}`} style={{ fontSize: '0.8rem', color: '#334155', display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                              <span>{group.title === 'RR Candy' ? getRRCandyDisplayName(skill as any) : (skill.name || skill.id || 'Unknown Move')}</span>
                              <span style={{ color: '#64748b' }}>
                                Lv.{Math.max(
                                  1,
                                  Number(playerInspectData?.skillLevelsById?.[skill.id]) ||
                                    Number(skill?.artifactGrant?.artifactLevel) ||
                                    Number(skill?.masteryLevel) ||
                                    Number(skill?.level) ||
                                    1
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ));
                })()}
              </div>
            )}

            {!playerInspectLoading && !playerInspectError && playerInspectTab === 'artifacts' && (
              <div style={{ display: 'grid', gap: '0.45rem' }}>
                {!playerInspectData || playerInspectData.artifacts.length === 0 ? (
                  <div style={{ fontSize: '0.88rem', color: '#6b7280' }}>No equipped artifacts found.</div>
                ) : (
                  playerInspectData.artifacts.map((artifact) => (
                    <div key={`${artifact.slot}-${artifact.name}`} style={{ border: '1px solid #dcfce7', borderRadius: '0.5rem', padding: '0.55rem', background: '#f0fdf4' }}>
                      <div style={{ display: 'flex', gap: '0.65rem' }}>
                        {artifact.image ? (
                          <img
                            src={artifact.image}
                            alt={artifact.name}
                            style={{
                              width: '56px',
                              height: '56px',
                              borderRadius: '0.5rem',
                              objectFit: 'cover',
                              border: '1px solid #bbf7d0',
                              background: 'white',
                              flexShrink: 0
                            }}
                          />
                        ) : (
                          <div style={{ width: '56px', height: '56px', borderRadius: '0.5rem', border: '1px dashed #86efac', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#166534', fontSize: '1.1rem', background: 'white' }}>
                            🧩
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.78rem', color: '#166534', textTransform: 'uppercase', fontWeight: 700 }}>{artifact.slot}</div>
                          <div style={{ fontSize: '0.92rem', color: '#14532d', fontWeight: 700 }}>{artifact.name}</div>
                          <div style={{ fontSize: '0.78rem', color: '#15803d' }}>
                            Level: {artifact.level ?? '-'} {artifact.rarity ? `• ${artifact.rarity}` : ''}
                          </div>
                        </div>
                      </div>
                      <div style={{ marginTop: '0.45rem', display: 'grid', gap: '0.35rem' }}>
                        {artifact.perks.length === 0 ? (
                          <div style={{ fontSize: '0.76rem', color: '#64748b' }}>Perks: None listed</div>
                        ) : (
                          artifact.perks.map((perk) => (
                            <div key={`${artifact.slot}-${perk.id}`} style={{ background: 'white', border: '1px solid #dcfce7', borderRadius: '0.45rem', padding: '0.4rem' }}>
                              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#166534' }}>{perk.label}</div>
                              {perk.description && (
                                <div style={{ fontSize: '0.74rem', color: '#334155', marginTop: '0.2rem' }}>{perk.description}</div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Target Selection Banner - Show when move is selected */}
      {selectedMove && !showMoveMenu && (
        <div style={{
          position: 'fixed',
          bottom: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
          color: 'white',
          padding: '1rem 2rem',
          borderRadius: '0.75rem',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          fontSize: '1.125rem',
          fontWeight: 'bold',
          border: '3px solid #f59e0b'
        }}>
          <span>🎯</span>
          <span>Selected: {selectedMove.name} - Click on a player card to select target</span>
          <button
            onClick={() => {
              setSelectedMove(null);
              setShowMoveMenu(true);
            }}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '2px solid white',
              color: 'white',
              borderRadius: '0.5rem',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            Change Move
          </button>
        </div>
      )}

      {/* Move Selection Modal - Only show when selecting a move, not when a move is selected */}
      {showMoveMenu && !selectedMove && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowMoveMenu(false);
            setSelectedMove(null);
          }
        }}
        >
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            border: '3px solid #8B4513'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginBottom: '1rem' 
            }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>
                Select Move
              </h3>
              <button
                onClick={() => {
                  setShowMoveMenu(false);
                  setSelectedMove(null);
                }}
                style={{
                  background: '#ef4444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  padding: '0.5rem 1rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 'bold'
                }}
              >
                ✕ Close
              </button>
            </div>
            
            {selectedMove ? (
              <div>
                <div style={{ 
                  marginBottom: '1rem', 
                  padding: '1rem', 
                  background: '#f3f4f6', 
                  borderRadius: '0.5rem' 
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1.125rem' }}>
                    Selected: {selectedMove.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ 
                      background: '#e5e7eb', 
                      padding: '0.125rem 0.375rem', 
                      borderRadius: '0.25rem',
                      fontWeight: 'bold'
                    }}>
                      {selectedMove.type.toUpperCase()}
                    </span>
                    {selectedMove.category === 'elemental' && selectedMove.elementalAffinity && (
                      <span style={{ 
                        background: '#e5e7eb', 
                        padding: '0.125rem 0.375rem', 
                        borderRadius: '0.25rem',
                        fontSize: '0.7rem'
                      }}>
                        {selectedMove.elementalAffinity.toUpperCase()}
                      </span>
                    )}
                    {(() => {
                      const selLe = computeLiveEventParticipationSkillCost(selectedMove as BattleMove, equippedArtifacts, null, 0);
                      return (
                        <span style={{ fontSize: '0.7rem' }}>
                          Lv.{selectedMove.level} • Mastery {getEffectiveMasteryLevel(selectedMove, equippedArtifacts)} • Skill Cost (PP): {selLe.finalCost} (base {selLe.baseCost}, reduction {selLe.reductionFromArtifacts + selLe.reductionFromEffects})
                        </span>
                      );
                    })()}
                  </div>
                  {(() => {
                    const effectiveMasteryLevel = getEffectiveMasteryLevel(selectedMove, equippedArtifacts);
                    const getMoveDamageValue = (m: any): number => {
                      if (m.damage && m.damage > 0) return m.damage;
                      const moveDamage = getMoveDamageSync(m.name);
                      if (moveDamage) {
                        return typeof moveDamage === 'object' ? moveDamage.max : moveDamage;
                      }
                      return 0;
                    };
                    
                    let damageRange = null;
                    let shieldRange = null;
                    let healingRange = null;
                    let artifactMultiplier = 1.0;
                    
                    if (selectedMove.type === 'attack') {
                      const baseDamage = getMoveDamageValue(selectedMove);
                      if (baseDamage > 0) {
                        damageRange = calculateDamageRange(baseDamage, selectedMove.level, effectiveMasteryLevel);
                        if (selectedMove.category === 'elemental' && equippedArtifacts) {
                          const ringSlots = ['ring1', 'ring2', 'ring3', 'ring4'];
                          for (const slot of ringSlots) {
                            const ring = equippedArtifacts[slot];
                            if (ring && 
                                (ring.id === 'elemental-ring-level-1' || 
                                 (ring.name && ring.name.includes('Elemental Ring')))) {
                              const elementalRingLevel = ring.level || 1;
                              artifactMultiplier = getArtifactDamageMultiplier(elementalRingLevel);
                              damageRange = {
                                min: Math.floor(damageRange.min * artifactMultiplier),
                                max: Math.floor(damageRange.max * artifactMultiplier),
                                average: Math.floor(damageRange.average * artifactMultiplier)
                              };
                              break;
                            }
                          }
                        }
                      }
                    }
                    
                    if (selectedMove.shieldBoost && selectedMove.shieldBoost > 0) {
                      shieldRange = calculateShieldBoostRange(selectedMove.shieldBoost, selectedMove.level, effectiveMasteryLevel);
                    }
                    
                    if (selectedMove.healing && selectedMove.healing > 0) {
                      healingRange = calculateHealingRange(selectedMove.healing, selectedMove.level, effectiveMasteryLevel);
                    }
                    
                    return (
                      <div style={{ fontSize: '0.875rem', color: '#1f2937', marginBottom: '0.75rem' }}>
                        {damageRange && (
                          <div style={{ color: '#dc2626', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                            ⚔️ Damage: {damageRange.min}-{damageRange.max} (Avg: {damageRange.average})
                            {artifactMultiplier > 1.0 && (
                              <span style={{ color: '#f59e0b', marginLeft: '0.25rem' }}>
                                💍 +{Math.round((artifactMultiplier - 1) * 100)}%
                              </span>
                            )}
                          </div>
                        )}
                        {shieldRange && (
                          <div style={{ color: '#3b82f6', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                            🛡️ Shield Boost: +{shieldRange.min}-{shieldRange.max} (Avg: +{shieldRange.average})
                          </div>
                        )}
                        {healingRange && (
                          <div style={{ color: '#10b981', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                            💚 Healing: {healingRange.min}-{healingRange.max} (Avg: {healingRange.average})
                          </div>
                        )}
                        {selectedMove.ppSteal && selectedMove.ppSteal > 0 && (
                          <div style={{ color: '#f59e0b', fontWeight: 'bold', marginBottom: '0.25rem' }}>
                            💰 PP Steal: {selectedMove.ppSteal}
                          </div>
                        )}
                        {selectedMove.description && (
                          <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.5rem', fontStyle: 'italic' }}>
                            {selectedMove.description}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <button
                    onClick={() => setSelectedMove(null)}
                    style={{
                      marginTop: '0.5rem',
                      background: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      padding: '0.5rem 1rem',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: 'bold'
                    }}
                  >
                    Change Move
                  </button>
                </div>
                <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fef3c7', borderRadius: '0.5rem', border: '2px solid #fbbf24' }}>
                  <div style={{ fontSize: '0.875rem', color: '#92400e', fontWeight: 'bold', textAlign: 'center' }}>
                    🎯 Click on a player card to select target
                  </div>
                </div>
              </div>
            ) : (
              <div>
                {/* Filter available moves - unlocked and not on cooldown */}
                {(() => {
                  const sourceMoves = (equippedBattleSkills.length > 0 ? equippedBattleSkills : moves);
                  const baseAvailable = sourceMoves.filter(move =>
                    move.unlocked &&
                    (move.currentCooldown === 0 || move.currentCooldown === undefined)
                  );
                  const availableMoves = [...baseAvailable, ...constructSkillMoves];

                  const ppLive = (m: BattleMove) =>
                    computeLiveEventParticipationSkillCost(m, equippedArtifacts, null, 0);
                  const participationMe = currentPlayer?.movesEarned ?? 0;

                  const constructMoves = availableMoves.filter(move => move.id?.startsWith('construct-skill::'));
                  const manifestMoves = availableMoves.filter(move => move.category === 'manifest');
                  const elementalMoves = availableMoves.filter(move => move.category === 'elemental');
                  const rrCandyMoves = availableMoves.filter(move => move.id?.includes('rr-candy'));
                  const artifactMoves = availableMoves.filter(
                    move =>
                      move.category === 'system' &&
                      !move.id?.includes('rr-candy') &&
                      !move.id?.startsWith('construct-skill::')
                  );
                  const manifestAndArtifactMoves = [...manifestMoves, ...artifactMoves];
                  
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {manifestAndArtifactMoves.length > 0 && (
                        <div>
                          <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#8b5cf6' }}>
                            ✨ Manifest + Artifact Skills
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {manifestAndArtifactMoves.map((move) => {
                              // Calculate move stats
                              const effectiveMasteryLevel = getEffectiveMasteryLevel(move, equippedArtifacts);
                              const effectiveMoveLevel = effectiveMasteryLevel > move.masteryLevel ? effectiveMasteryLevel : move.level;
                              
                              // Helper to get move damage value
                              const getMoveDamageValue = (m: any): number => {
                                if (m.damage && m.damage > 0) return m.damage;
                                const moveDamage = getMoveDamageSync(m.name);
                                if (moveDamage) {
                                  return typeof moveDamage === 'object' ? moveDamage.max : moveDamage;
                                }
                                return 0;
                              };
                              
                              // Calculate stats
                              let damageRange = null;
                              let shieldRange = null;
                              let healingRange = null;
                              
                              if (move.type === 'attack') {
                                const baseDamage = getMoveDamageValue(move);
                                if (baseDamage > 0) {
                                  damageRange = calculateDamageRange(baseDamage, move.level, effectiveMasteryLevel);
                                }
                              }
                              
                              if (move.shieldBoost && move.shieldBoost > 0) {
                                shieldRange = calculateShieldBoostRange(move.shieldBoost, move.level, effectiveMasteryLevel);
                              }
                              
                              if (move.healing && move.healing > 0) {
                                healingRange = calculateHealingRange(move.healing, move.level, effectiveMasteryLevel);
                              }

                              const le = ppLive(move as BattleMove);
                              const isConstructSkill = move.id?.startsWith('construct-skill::');
                              const canAffordSkill = isConstructSkill || participationMe >= le.finalCost;
                              
                              return (
                                <button
                                  key={move.id}
                                  onClick={async (e) => {
                                    if (!canAffordSkill) return;
                                    // ALWAYS log skill click (critical - must see this)
                                    console.log('🎮 [InSessionBattle] ⚡ SKILL CLICKED ⚡', move.name, '| PP Cost:', le.finalCost, '| Actor:', currentUser?.uid?.substring(0, 8));
                                    console.log('🎮 [InSessionBattle] Click event details:', {
                                      buttonClicked: true,
                                      moveId: move.id,
                                      moveName: move.name,
                                      moveType: move.type,
                                      category: move.category,
                                      hasCurrentUser: !!currentUser,
                                      hasSessionId: !!sessionId,
                                      hasClassId: !!classId
                                    });
                                    
                                    setSelectedMove(move);
                                    setShowMoveMenu(false); // Close modal but keep move selected
                                  }}
                                  disabled={!canAffordSkill}
                                  title={
                                    !canAffordSkill
                                      ? `Need ${le.finalCost} Participation Points to use this skill (have ${participationMe}, short by ${Math.max(0, le.finalCost - participationMe)})`
                                      : `Base ${le.baseCost} · Reduction ${le.reductionFromArtifacts + le.reductionFromEffects} · Final ${le.finalCost} PP`
                                  }
                                  style={{
                                    background: selectedMove?.id === move.id 
                                      ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                                      : 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    padding: '0.75rem',
                                    cursor: canAffordSkill ? 'pointer' : 'not-allowed',
                                    textAlign: 'left',
                                    fontSize: '0.875rem',
                                    fontWeight: 'bold',
                                    transition: 'all 0.2s',
                                    opacity: canAffordSkill ? 1 : 0.55
                                  }}
                                  onMouseEnter={(e) => {
                                    if (selectedMove?.id !== move.id && canAffordSkill) {
                                      e.currentTarget.style.transform = 'scale(1.02)';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontWeight: 'bold', marginBottom: '0.125rem' }}>
                                        {move.name}
                                      </div>
                                      <div style={{ fontSize: '0.7rem', opacity: 0.9, display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <span style={{ 
                                          background: 'rgba(255, 255, 255, 0.3)', 
                                          padding: '0.125rem 0.375rem', 
                                          borderRadius: '0.25rem',
                                          fontWeight: 'bold'
                                        }}>
                                          {move.type.toUpperCase()}
                                        </span>
                                        <span style={{ fontSize: '0.65rem' }}>
                                          Lv.{effectiveMoveLevel} • Mastery {effectiveMasteryLevel}
                                        </span>
                                        <span style={{ fontSize: '0.65rem' }}>
                                          PP Cost: {le.finalCost} (base {le.baseCost}, −{le.reductionFromArtifacts + le.reductionFromEffects})
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  {/* Stats */}
                                  <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                                    {damageRange && (
                                      <div style={{ color: '#fecaca', fontWeight: 'bold' }}>
                                        ⚔️ Damage: {damageRange.min}-{damageRange.max} (Avg: {damageRange.average})
                                      </div>
                                    )}
                                    {shieldRange && (
                                      <div style={{ color: '#bfdbfe', fontWeight: 'bold' }}>
                                        🛡️ Shield: +{shieldRange.min}-{shieldRange.max} (Avg: +{shieldRange.average})
                                      </div>
                                    )}
                                    {healingRange && (
                                      <div style={{ color: '#bbf7d0', fontWeight: 'bold' }}>
                                        💚 Heal: {healingRange.min}-{healingRange.max} (Avg: {healingRange.average})
                                      </div>
                                    )}
                                    {move.ppSteal && move.ppSteal > 0 && (
                                      <div style={{ color: '#fde68a', fontWeight: 'bold' }}>
                                        💰 PP Steal: {move.ppSteal}
                                      </div>
                                    )}
                                    {move.description && (
                                      <div style={{ fontSize: '0.65rem', opacity: 0.9, marginTop: '0.25rem', fontStyle: 'italic' }}>
                                        {move.description}
                                      </div>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {elementalMoves.length > 0 && (
                        <div>
                          <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#f59e0b' }}>
                            ⚡ Elemental Moves
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {elementalMoves.map((move) => {
                              // Calculate move stats
                              const effectiveMasteryLevel = getEffectiveMasteryLevel(move, equippedArtifacts);
                              const effectiveMoveLevel = effectiveMasteryLevel > move.masteryLevel ? effectiveMasteryLevel : move.level;
                              
                              // Helper to get move damage value
                              const getMoveDamageValue = (m: any): number => {
                                if (m.damage && m.damage > 0) return m.damage;
                                const moveDamage = getMoveDamageSync(m.name);
                                if (moveDamage) {
                                  return typeof moveDamage === 'object' ? moveDamage.max : moveDamage;
                                }
                                return 0;
                              };
                              
                              // Calculate stats
                              let damageRange = null;
                              let shieldRange = null;
                              let healingRange = null;
                              let artifactMultiplier = 1.0;
                              
                              if (move.type === 'attack') {
                                const baseDamage = getMoveDamageValue(move);
                                if (baseDamage > 0) {
                                  damageRange = calculateDamageRange(baseDamage, move.level, effectiveMasteryLevel);
                                  // Apply artifact multiplier for elemental moves
                                  if (equippedArtifacts) {
                                    const ringSlots = ['ring1', 'ring2', 'ring3', 'ring4'];
                                    for (const slot of ringSlots) {
                                      const ring = equippedArtifacts[slot];
                                      if (ring && 
                                          (ring.id === 'elemental-ring-level-1' || 
                                           (ring.name && ring.name.includes('Elemental Ring')))) {
                                        const elementalRingLevel = ring.level || 1;
                                        artifactMultiplier = getArtifactDamageMultiplier(elementalRingLevel);
                                        damageRange = {
                                          min: Math.floor(damageRange.min * artifactMultiplier),
                                          max: Math.floor(damageRange.max * artifactMultiplier),
                                          average: Math.floor(damageRange.average * artifactMultiplier)
                                        };
                                        break;
                                      }
                                    }
                                  }
                                }
                              }
                              
                              if (move.shieldBoost && move.shieldBoost > 0) {
                                shieldRange = calculateShieldBoostRange(move.shieldBoost, move.level, effectiveMasteryLevel);
                              }
                              
                              if (move.healing && move.healing > 0) {
                                healingRange = calculateHealingRange(move.healing, move.level, effectiveMasteryLevel);
                              }

                              const leEl = ppLive(move as BattleMove);
                              const canAffordEl = participationMe >= leEl.finalCost;
                              
                              return (
                                <button
                                  key={move.id}
                                  onClick={() => {
                                    if (!canAffordEl) return;
                                    const DEBUG_LIVE_EVENTS = process.env.REACT_APP_DEBUG_LIVE_EVENTS === 'true' || 
                                                             process.env.REACT_APP_DEBUG === 'true';
                                    
                                    if (DEBUG_LIVE_EVENTS) {
                                      console.log('[InSessionBattle] 🎮 SKILL CLICKED (Elemental):', {
                                        skillId: move.id,
                                        skillName: move.name,
                                        skillType: move.type,
                                        category: move.category,
                                        ppCost: leEl.finalCost,
                                        cooldown: move.cooldown,
                                        actorUid: currentUser?.uid,
                                        sessionId: sessionId
                                      });
                                    }
                                    
                                    setSelectedMove(move);
                                    setShowMoveMenu(false); // Close modal but keep move selected
                                  }}
                                  disabled={!canAffordEl}
                                  title={
                                    !canAffordEl
                                      ? `Need ${leEl.finalCost} Participation Points to use this skill (have ${participationMe})`
                                      : `Base ${leEl.baseCost} · Reduction ${leEl.reductionFromArtifacts + leEl.reductionFromEffects} · Final ${leEl.finalCost} PP`
                                  }
                                  style={{
                                    background: selectedMove?.id === move.id 
                                      ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                                      : 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    padding: '0.75rem',
                                    cursor: canAffordEl ? 'pointer' : 'not-allowed',
                                    textAlign: 'left',
                                    fontSize: '0.875rem',
                                    fontWeight: 'bold',
                                    transition: 'all 0.2s',
                                    opacity: canAffordEl ? 1 : 0.55
                                  }}
                                  onMouseEnter={(e) => {
                                    if (selectedMove?.id !== move.id && canAffordEl) {
                                      e.currentTarget.style.transform = 'scale(1.02)';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontWeight: 'bold', marginBottom: '0.125rem' }}>
                                        {move.name}
                                      </div>
                                      <div style={{ fontSize: '0.7rem', opacity: 0.9, display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <span style={{ 
                                          background: 'rgba(255, 255, 255, 0.3)', 
                                          padding: '0.125rem 0.375rem', 
                                          borderRadius: '0.25rem',
                                          fontWeight: 'bold'
                                        }}>
                                          {move.type.toUpperCase()}
                                        </span>
                                        {move.elementalAffinity && (
                                          <span style={{ 
                                            background: 'rgba(255, 255, 255, 0.3)', 
                                            padding: '0.125rem 0.375rem', 
                                            borderRadius: '0.25rem',
                                            fontSize: '0.65rem'
                                          }}>
                                            {move.elementalAffinity.toUpperCase()}
                                          </span>
                                        )}
                                        <span style={{ fontSize: '0.65rem' }}>
                                          Lv.{effectiveMoveLevel} • Mastery {effectiveMasteryLevel}
                                        </span>
                                        <span style={{ fontSize: '0.65rem' }}>
                                          PP Cost: {leEl.finalCost} (base {leEl.baseCost}, −{leEl.reductionFromArtifacts + leEl.reductionFromEffects})
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  {/* Stats */}
                                  <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                                    {damageRange && (
                                      <div style={{ color: '#fecaca', fontWeight: 'bold' }}>
                                        ⚔️ Damage: {damageRange.min}-{damageRange.max} (Avg: {damageRange.average})
                                        {artifactMultiplier > 1.0 && (
                                          <span style={{ color: '#fde68a', marginLeft: '0.25rem', fontSize: '0.65rem' }}>
                                            💍 +{Math.round((artifactMultiplier - 1) * 100)}%
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    {shieldRange && (
                                      <div style={{ color: '#bfdbfe', fontWeight: 'bold' }}>
                                        🛡️ Shield: +{shieldRange.min}-{shieldRange.max} (Avg: +{shieldRange.average})
                                      </div>
                                    )}
                                    {healingRange && (
                                      <div style={{ color: '#bbf7d0', fontWeight: 'bold' }}>
                                        💚 Heal: {healingRange.min}-{healingRange.max} (Avg: {healingRange.average})
                                      </div>
                                    )}
                                    {move.ppSteal && move.ppSteal > 0 && (
                                      <div style={{ color: '#fde68a', fontWeight: 'bold' }}>
                                        💰 PP Steal: {move.ppSteal}
                                      </div>
                                    )}
                                    {move.description && (
                                      <div style={{ fontSize: '0.65rem', opacity: 0.9, marginTop: '0.25rem', fontStyle: 'italic' }}>
                                        {move.description}
                                      </div>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {constructMoves.length > 0 && (
                        <div>
                          <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#0d9488' }}>
                            🧱 Construct Skills
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {constructMoves.map((move) => {
                              const effectiveMasteryLevel = getEffectiveMasteryLevel(move, equippedArtifacts);
                              const baseDamage = typeof move.damage === 'number' && move.damage > 0 ? move.damage : 0;
                              const damageRange =
                                move.type === 'attack' && baseDamage > 0
                                  ? calculateDamageRange(baseDamage, move.level, effectiveMasteryLevel)
                                  : null;
                              return (
                                <button
                                  key={move.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedMove(move);
                                    setShowMoveMenu(false);
                                  }}
                                  style={{
                                    background:
                                      selectedMove?.id === move.id
                                        ? 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)'
                                        : 'linear-gradient(135deg, #2dd4bf 0%, #14b8a6 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    padding: '0.75rem',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    fontSize: '0.875rem',
                                    fontWeight: 'bold',
                                    transition: 'all 0.2s'
                                  }}
                                >
                                  <div style={{ fontWeight: 'bold', marginBottom: '0.125rem' }}>{move.name}</div>
                                  <div style={{ fontSize: '0.7rem', opacity: 0.95, marginBottom: '0.25rem' }}>
                                    <span
                                      style={{
                                        background: 'rgba(255, 255, 255, 0.25)',
                                        padding: '0.125rem 0.375rem',
                                        borderRadius: '0.25rem',
                                        fontWeight: 'bold'
                                      }}
                                    >
                                      {String(move.type || 'attack').toUpperCase()}
                                    </span>{' '}
                                    <span style={{ fontSize: '0.65rem' }}>PP Cost: 0 (construct)</span>
                                  </div>
                                  {damageRange && (
                                    <div style={{ fontSize: '0.7rem', color: '#ccfbf1', fontWeight: 'bold' }}>
                                      ⚔️ Damage: {damageRange.min}-{damageRange.max} (Avg: {damageRange.average})
                                    </div>
                                  )}
                                  {move.description && (
                                    <div
                                      style={{
                                        fontSize: '0.65rem',
                                        opacity: 0.95,
                                        marginTop: '0.25rem',
                                        fontStyle: 'italic'
                                      }}
                                    >
                                      {move.description}
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {rrCandyMoves.length > 0 && (
                        <div>
                          <h4 style={{ fontSize: '1rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#f59e0b' }}>
                            🍬 RR Candy Skills
                          </h4>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {rrCandyMoves.map((move) => {
                              const rrCandyDisplayName = getRRCandyDisplayName(move as any);
                              // Calculate move stats
                              const effectiveMasteryLevel = getEffectiveMasteryLevel(move, equippedArtifacts);
                              const effectiveMoveLevel = effectiveMasteryLevel > move.masteryLevel ? effectiveMasteryLevel : move.level;
                              
                              // Helper to get move damage value
                              const getMoveDamageValue = (m: any): number => {
                                if (m.damage && m.damage > 0) return m.damage;
                                const moveDamage = getMoveDamageSync(m.name);
                                if (moveDamage) {
                                  return typeof moveDamage === 'object' ? moveDamage.max : moveDamage;
                                }
                                return 0;
                              };
                              
                              // Calculate stats
                              let damageRange = null;
                              let shieldRange = null;
                              let healingRange = null;
                              
                              if (move.type === 'attack') {
                                const baseDamage = getMoveDamageValue(move);
                                if (baseDamage > 0) {
                                  damageRange = calculateDamageRange(baseDamage, move.level, effectiveMasteryLevel);
                                }
                              }
                              
                              if (move.shieldBoost && move.shieldBoost > 0) {
                                shieldRange = calculateShieldBoostRange(move.shieldBoost, move.level, effectiveMasteryLevel);
                              }
                              
                              if (move.healing && move.healing > 0) {
                                healingRange = calculateHealingRange(move.healing, move.level, effectiveMasteryLevel);
                              }

                              const leRr = ppLive(move as BattleMove);
                              const canAffordRr = participationMe >= leRr.finalCost;
                              
                              return (
                                <button
                                  key={move.id}
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (!canAffordRr) return;
                                    
                                    // ALWAYS log skill click (critical - must see this)
                                    console.log('🎮 [InSessionBattle] ⚡ SKILL CLICKED ⚡', rrCandyDisplayName, '| PP Cost:', leRr.finalCost, '| Actor:', currentUser?.uid?.substring(0, 8));
                                    console.log('🎮 [InSessionBattle] Click event details:', {
                                      buttonClicked: true,
                                      moveId: move.id,
                                      moveName: rrCandyDisplayName,
                                      hasCurrentUser: !!currentUser,
                                      hasSessionId: !!sessionId,
                                      hasClassId: !!classId,
                                      timestamp: new Date().toISOString()
                                    });
                                    
                                    // CRITICAL: Verify the move object is valid
                                    if (!move || !move.id) {
                                      console.error('❌ [InSessionBattle] Invalid move object!', move);
                                      return;
                                    }
                                    
                                    // CRITICAL: Verify we have required context
                                    if (!currentUser || !sessionId) {
                                      console.error('❌ [InSessionBattle] Missing required context!', {
                                        hasCurrentUser: !!currentUser,
                                        hasSessionId: !!sessionId
                                      });
                                      return;
                                    }
                                    console.log('🎮 [InSessionBattle] Context check:', {
                                      hasCurrentUser: !!currentUser,
                                      userId: currentUser?.uid?.substring(0, 8),
                                      sessionId: sessionId || 'MISSING',
                                      classId: classId || 'MISSING',
                                      moveId: move.id,
                                      moveName: move.name
                                    });
                                    
                                    const DEBUG_LIVE_EVENTS = process.env.REACT_APP_DEBUG_LIVE_EVENT_SKILLS === 'true' ||
                                                             process.env.REACT_APP_DEBUG_LIVE_EVENTS === 'true' || 
                                                             process.env.REACT_APP_DEBUG === 'true';
                                    
                                    // Stage A: Skill selected - Generate traceId
                                    const { generateTraceId, traceStage, writeDebugAction } = await import('../utils/liveEventDebug');
                                    const traceId = generateTraceId();
                                    setCurrentTraceId(traceId);
                                    
                                    console.log('🎮 [InSessionBattle] TraceId generated:', traceId);
                                    
                                    traceStage('selected', traceId, 'Skill selected', {
                                      skillId: move.id,
                                      skillName: rrCandyDisplayName,
                                      skillType: move.type,
                                      category: move.category,
                                      cost: leRr.finalCost,
                                      cooldown: move.cooldown,
                                      actorUid: currentUser?.uid,
                                      sessionId: sessionId
                                    }, { file: 'InSessionBattle.tsx', line: 2629 });
                                    
                                    // Write debug mirror
                                    if (classId && sessionId) {
                                      await writeDebugAction(classId, sessionId, traceId, 'selected', {
                                        actorUid: currentUser?.uid || '',
                                        targetUid: '', // Not selected yet
                                        skillId: move.id,
                                        skillName: rrCandyDisplayName,
                                        metadata: {
                                          skillType: move.type,
                                          category: move.category,
                                          cost: leRr.finalCost,
                                          cooldown: move.cooldown
                                        }
                                      });
                                    }
                                    
                                    if (DEBUG_LIVE_EVENTS) {
                                      console.log('[InSessionBattle] 🎮 SKILL CLICKED (RR Candy):', {
                                        traceId,
                                        skillId: move.id,
                                        skillName: move.name,
                                        skillType: move.type,
                                        category: move.category,
                                        cost: leRr.finalCost,
                                        cooldown: move.cooldown,
                                        actorUid: currentUser?.uid,
                                        sessionId: sessionId
                                      });
                                    }
                                    
                                    setSelectedMove(move);
                                    setShowMoveMenu(false); // Close modal but keep move selected
                                  }}
                                  disabled={!canAffordRr}
                                  title={
                                    !canAffordRr
                                      ? `Need ${leRr.finalCost} Participation Points to use this skill (have ${participationMe})`
                                      : `Base ${leRr.baseCost} · Reduction ${leRr.reductionFromArtifacts + leRr.reductionFromEffects} · Final ${leRr.finalCost} PP`
                                  }
                                  style={{
                                    background: selectedMove?.id === move.id 
                                      ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                                      : 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    padding: '0.75rem',
                                    cursor: canAffordRr ? 'pointer' : 'not-allowed',
                                    textAlign: 'left',
                                    fontSize: '0.875rem',
                                    fontWeight: 'bold',
                                    transition: 'all 0.2s',
                                    opacity: canAffordRr ? 1 : 0.55
                                  }}
                                  onMouseEnter={(e) => {
                                    if (selectedMove?.id !== move.id && canAffordRr) {
                                      e.currentTarget.style.transform = 'scale(1.02)';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                  }}
                                >
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontWeight: 'bold', marginBottom: '0.125rem' }}>
                                        {rrCandyDisplayName}
                                      </div>
                                      <div style={{ fontSize: '0.7rem', opacity: 0.9, display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <span style={{ 
                                          background: 'rgba(255, 255, 255, 0.3)', 
                                          padding: '0.125rem 0.375rem', 
                                          borderRadius: '0.25rem',
                                          fontWeight: 'bold'
                                        }}>
                                          {move.type.toUpperCase()}
                                        </span>
                                        <span style={{ fontSize: '0.65rem' }}>
                                          Lv.{effectiveMoveLevel} • Mastery {effectiveMasteryLevel}
                                        </span>
                                        <span style={{ fontSize: '0.65rem' }}>
                                          PP Cost: {leRr.finalCost} (base {leRr.baseCost}, −{leRr.reductionFromArtifacts + leRr.reductionFromEffects})
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  {/* Stats */}
                                  <div style={{ fontSize: '0.7rem', marginTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                                    {damageRange && (
                                      <div style={{ color: '#fecaca', fontWeight: 'bold' }}>
                                        ⚔️ Damage: {damageRange.min}-{damageRange.max} (Avg: {damageRange.average})
                                      </div>
                                    )}
                                    {shieldRange && (
                                      <div style={{ color: '#bfdbfe', fontWeight: 'bold' }}>
                                        🛡️ Shield: +{shieldRange.min}-{shieldRange.max} (Avg: +{shieldRange.average})
                                      </div>
                                    )}
                                    {healingRange && (
                                      <div style={{ color: '#bbf7d0', fontWeight: 'bold' }}>
                                        💚 Heal: {healingRange.min}-{healingRange.max} (Avg: {healingRange.average})
                                      </div>
                                    )}
                                    {move.ppSteal && move.ppSteal > 0 && (
                                      <div style={{ color: '#fde68a', fontWeight: 'bold' }}>
                                        💰 PP Steal: {move.ppSteal}
                                      </div>
                                    )}
                                    {move.description && (
                                      <div style={{ fontSize: '0.65rem', opacity: 0.9, marginTop: '0.25rem', fontStyle: 'italic' }}>
                                        {move.description}
                                      </div>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      
                      {availableMoves.length === 0 && (
                        <div style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
                          No moves available. All moves are on cooldown or locked.
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PP Management Modal (shown when PP Tools is clicked) - Only for admins and scorekeepers */}
      {selectedStudentForPP && (isAdminUser === true || isScorekeeper === true) && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            background: 'white',
            borderRadius: '0.75rem',
            padding: '2rem',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
          }}>
            <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: '#1f2937' }}>
              PP Management
            </h3>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                Adjusting PP for: {sessionPlayers.find(p => p.userId === selectedStudentForPP)?.displayName}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <input
                  type="number"
                  placeholder="Amount (negative to subtract)"
                  value={ppAdjustment || ''}
                  onChange={(e) => setPPAdjustment(parseInt(e.target.value) || 0)}
                  style={{
                    padding: '0.75rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem'
                  }}
                />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => {
                      if (ppAdjustment !== 0) {
                        handleAdjustPP(selectedStudentForPP, ppAdjustment);
                        setSelectedStudentForPP(null);
                        setPPAdjustment(0);
                      }
                    }}
                    style={{
                      flex: 1,
                      background: ppAdjustment !== 0 ? '#8b5cf6' : '#9ca3af',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      padding: '0.75rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: ppAdjustment !== 0 ? 'pointer' : 'not-allowed'
                    }}
                  >
                    Apply
                  </button>
                  <button
                    onClick={() => {
                      setSelectedStudentForPP(null);
                      setPPAdjustment(0);
                    }}
                    style={{
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      padding: '0.75rem',
                      fontSize: '0.875rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* Session Summary Modal */}
        {currentUser && (
          <SessionSummaryModal
            isOpen={showSessionSummary}
            onClose={() => setShowSessionSummary(false)}
            summary={sessionSummary}
            currentPlayerId={currentUser.uid}
            roomPlayers={sessionPlayers}
          />
        )}
    </div>
    </>
  );
};

export default InSessionBattle;

