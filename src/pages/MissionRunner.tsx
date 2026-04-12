/**
 * Mission Runner Page
 * 
 * Plays through a mission sequence (Story Slides, Videos, Battles)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import {
  MissionTemplate,
  type MissionRewardChoicePendingGroup,
  type PlayerMission,
  filterCpuAwakeningAnimationSteps,
} from '../types/missions';
import type { BattlePassReward } from '../types/season1';
import { REWARD_TYPE_LABELS } from '../components/admin/battlePassAdminRewardUtils';
import type { HabitDuration } from '../types/assessmentGoals';
import { getMissionTemplate } from '../utils/missionsService';
import { claimMissionRewardChoices, completeMission, getPlayerMissions } from '../utils/missionsService';
import IslandRaidBattle from '../components/IslandRaidBattle';
import {
  estimateDamageFromCpuMoves,
  loadMergedCpuOpponents,
  scaleCpuOpponentMoves,
} from '../utils/cpuOpponentMovesService';
import type { ElementType } from '../types/elementTypes';
import { normalizeElementType } from '../types/elementTypes';
import { getQuizSet, userMetMissionTrainingRequirement } from '../utils/trainingGroundsService';
import {
  getAssessment,
  getAssessmentGoal,
  getHabitSubmission,
  saveMissionReflectionStandalone,
  submitMissionReflectionForSequence,
} from '../utils/assessmentGoalsFirestore';
import MissionLevel2ManifestStepPanel, {
  computeLevel2StepReady,
  fetchPlayerMissionCompletion,
} from '../components/mission/MissionLevel2ManifestStepPanel';
import { getLevel2ManifestState } from '../services/level2ManifestService';
import { DEFAULT_MAX_ALLIED_PARTICIPANTS } from '../constants/coopBattle';
import { stripUndefinedDeep } from '../utils/firestoreSanitize';

/**
 * Mission Admin difficulty scales enemy health, shields, and attack damage from a single baseline (EASY = 1×).
 * Stored island raid difficulty: easy / normal / hard / nightmare (BOSS).
 */
function summarizeMissionBattlePassReward(r: BattlePassReward): string {
  const label = REWARD_TYPE_LABELS[r.rewardType];
  if (
    r.quantity != null &&
    (r.rewardType === 'xp' || r.rewardType === 'pp' || r.rewardType === 'truth_metal')
  ) {
    return `${label}: ${r.quantity}${r.displayName ? ` — ${r.displayName}` : ''}`;
  }
  if (r.rewardRefId?.trim()) {
    return `${r.displayName || label} — ${r.rewardRefId}`;
  }
  return r.displayName || label;
}

function missionBattleStatMultiplier(islandDifficulty: 'easy' | 'normal' | 'hard' | 'nightmare'): number {
  switch (islandDifficulty) {
    case 'easy':
      return 1;
    case 'normal':
      return 1.5;
    case 'hard':
      return 2;
    case 'nightmare':
      return 2.5;
    default:
      return 1;
  }
}

// Note: Battle completion callback will be handled by IslandRaidBattle's onLeave
// For now, we'll detect completion by checking battle room status

const MissionRunner: React.FC = () => {
  const { missionId } = useParams<{ missionId: string }>();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [mission, setMission] = useState<MissionTemplate | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showBattle, setShowBattle] = useState(false);
  const [battleGameId, setBattleGameId] = useState<string | null>(null);
  const [playerMissionId, setPlayerMissionId] = useState<string | null>(null);
  const [trainingGate, setTrainingGate] = useState<{
    loading: boolean;
    met: boolean;
    bestPercent: number;
    requiredPercent: number;
  } | null>(null);
  const [trainingQuizTitle, setTrainingQuizTitle] = useState<string | null>(null);
  const [reflectionDraft, setReflectionDraft] = useState('');
  const [reflectionSaving, setReflectionSaving] = useState(false);
  const [reflectionHabitText, setReflectionHabitText] = useState('');
  const [reflectionDuration, setReflectionDuration] = useState<HabitDuration>('1_week');
  const [reflectionHabitEvidence, setReflectionHabitEvidence] = useState('');
  const [reflectionStoryTextGoal, setReflectionStoryTextGoal] = useState('');
  const [reflectionStoryEvidence, setReflectionStoryEvidence] = useState('');
  const [reflectionLinkCtx, setReflectionLinkCtx] = useState<{
    loading: boolean;
    assessmentTitle: string | null;
    goalHint: string | null;
    assessmentType: string | null;
    isLocked: boolean;
    defaultDuration: HabitDuration;
  } | null>(null);

  const [missionStepCompletion, setMissionStepCompletion] = useState<Record<string, boolean>>({});
  const [l2Progress, setL2Progress] = useState({
    builderUnlocked: false,
    hasSkill: false,
    activeOk: false,
  });

  const refreshMissionStepProgress = useCallback(async () => {
    if (!currentUser) return;
    try {
      const map = await fetchPlayerMissionCompletion(playerMissionId);
      const next: Record<string, boolean> = {};
      Object.keys(map).forEach((k) => {
        next[k] = true;
      });
      setMissionStepCompletion(next);
      const st = await getLevel2ManifestState(currentUser.uid);
      const skills = st.skills || [];
      setL2Progress({
        builderUnlocked: st.builderUnlocked,
        hasSkill: skills.length > 0,
        activeOk: !!(st.activeSkillId && skills.some((s) => s.id === st.activeSkillId)),
      });
    } catch (e) {
      console.error('refreshMissionStepProgress', e);
    }
  }, [currentUser, playerMissionId]);

  useEffect(() => {
    void refreshMissionStepProgress();
  }, [refreshMissionStepProgress, currentStepIndex]);

  const [pendingRewardChoiceGroups, setPendingRewardChoiceGroups] = useState<
    MissionRewardChoicePendingGroup[]
  >([]);
  const [rewardChoicePicks, setRewardChoicePicks] = useState<Record<string, string[]>>({});
  const [claimingMissionChoices, setClaimingMissionChoices] = useState(false);

  useEffect(() => {
    if (!missionId || !currentUser) return;

    const loadMission = async () => {
      try {
        const missionData = await getMissionTemplate(missionId);
        if (!missionData) {
          alert('Mission not found');
          navigate('/home');
          return;
        }

        if (!missionData.sequence || missionData.sequence.length === 0) {
          alert('This mission does not have a playable sequence.');
          navigate('/home');
          return;
        }

        setMission(missionData);

        // Find active player mission
        const playerMissions = await getPlayerMissions(currentUser.uid);
        const activeMission = playerMissions.find(
          pm => pm.missionId === missionId && pm.status === 'active'
        );
        if (activeMission) {
          setPlayerMissionId(activeMission.id);
        }

        setLoading(false);
      } catch (error) {
        console.error('Error loading mission:', error);
        alert('Failed to load mission');
        navigate('/home');
      }
    };

    loadMission();
  }, [missionId, currentUser, navigate]);

  const currentStep = mission?.sequence?.[currentStepIndex];
  const isLastStep = mission?.sequence ? currentStepIndex === mission.sequence.length - 1 : false;
  const reflectionAssessmentLinkId =
    currentStep?.type === 'REFLECTION' ? currentStep.linkedAssessmentId : undefined;

  const trainingQuizSetId =
    currentStep?.type === 'TRAINING_ASSIGNMENT' ? currentStep.training.quizSetId : null;
  const trainingMinPercent =
    currentStep?.type === 'TRAINING_ASSIGNMENT' ? currentStep.training.minimumPassPercent : null;

  useEffect(() => {
    if (!currentUser || !trainingQuizSetId || trainingMinPercent === null) {
      setTrainingGate(null);
      return;
    }
    let cancelled = false;
    setTrainingGate({
      loading: true,
      met: false,
      bestPercent: 0,
      requiredPercent: trainingMinPercent,
    });
    userMetMissionTrainingRequirement(currentUser.uid, trainingQuizSetId, trainingMinPercent).then((r) => {
      if (cancelled) return;
      setTrainingGate({
        loading: false,
        met: r.met,
        bestPercent: r.bestPercent,
        requiredPercent: trainingMinPercent,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser, currentStepIndex, trainingQuizSetId, trainingMinPercent]);

  useEffect(() => {
    if (!trainingQuizSetId) {
      setTrainingQuizTitle(null);
      return;
    }
    let cancelled = false;
    getQuizSet(trainingQuizSetId).then((q) => {
      if (!cancelled) setTrainingQuizTitle(q?.title ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [trainingQuizSetId]);

  useEffect(() => {
    if (!currentUser || !trainingQuizSetId || trainingMinPercent === null) return;

    const reload = () => {
      userMetMissionTrainingRequirement(currentUser.uid, trainingQuizSetId, trainingMinPercent).then((r) => {
        setTrainingGate({
          loading: false,
          met: r.met,
          bestPercent: r.bestPercent,
          requiredPercent: trainingMinPercent,
        });
      });
    };

    window.addEventListener('focus', reload);
    const onVis = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', reload);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [currentUser, trainingQuizSetId, trainingMinPercent]);

  useEffect(() => {
    if (currentStep?.type === 'REFLECTION') {
      setReflectionDraft('');
      setReflectionHabitText('');
      setReflectionDuration('1_week');
      setReflectionHabitEvidence('');
      setReflectionStoryTextGoal('');
      setReflectionStoryEvidence('');
    }
  }, [currentStepIndex, currentStep?.id, currentStep?.type]);

  useEffect(() => {
    if (!currentUser || currentStep?.type !== 'REFLECTION') {
      setReflectionLinkCtx(null);
      return;
    }
    const aid = currentStep.linkedAssessmentId?.trim();
    if (!aid) {
      setReflectionLinkCtx(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setReflectionLinkCtx({
        loading: true,
        assessmentTitle: null,
        goalHint: null,
        assessmentType: null,
        isLocked: false,
        defaultDuration: '1_week',
      });
      try {
        const a = await getAssessment(aid);
        if (cancelled) return;
        if (!a) {
          setReflectionLinkCtx({
            loading: false,
            assessmentTitle: null,
            goalHint: null,
            assessmentType: null,
            isLocked: false,
            defaultDuration: '1_week',
          });
          return;
        }
        const dur: HabitDuration = a.habitsConfig?.defaultDuration || '1_week';
        let goalHint: string | null = null;
        if (a.type === 'habits') {
          const sub = await getHabitSubmission(aid, currentUser.uid);
          if (sub?.habitText) goalHint = `Your habit commitment: ${sub.habitText}`;
          if (sub) {
            setReflectionHabitText(sub.habitText || '');
            setReflectionDuration((sub.duration as HabitDuration) || dur);
            setReflectionHabitEvidence(sub.evidence || '');
          } else {
            setReflectionHabitText('');
            setReflectionDuration(dur);
            setReflectionHabitEvidence('');
          }
        } else if (a.type === 'story-goal') {
          const g = await getAssessmentGoal(aid, currentUser.uid);
          if (g?.textGoal) goalHint = `Your goal: ${g.textGoal}`;
          if (g) {
            setReflectionStoryTextGoal(g.textGoal || '');
            setReflectionStoryEvidence(g.evidence || '');
          } else {
            setReflectionStoryTextGoal('');
            setReflectionStoryEvidence('');
          }
        } else {
          const g = await getAssessmentGoal(aid, currentUser.uid);
          if (g) {
            const parts: string[] = [];
            if (g.textGoal) parts.push(`Goal: ${g.textGoal}`);
            if (g.goalScore != null) parts.push(`Target score: ${g.goalScore}`);
            goalHint = parts.length ? parts.join(' · ') : null;
          }
        }
        setReflectionLinkCtx({
          loading: false,
          assessmentTitle: a.title,
          goalHint,
          assessmentType: a.type,
          isLocked: !!a.isLocked,
          defaultDuration: dur,
        });
      } catch {
        if (!cancelled) {
          setReflectionLinkCtx({
            loading: false,
            assessmentTitle: null,
            goalHint: null,
            assessmentType: null,
            isLocked: false,
            defaultDuration: '1_week',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser, currentStep?.type, currentStep?.id, reflectionAssessmentLinkId]);

  const trainingBlocksNext =
    currentStep?.type === 'TRAINING_ASSIGNMENT' &&
    (!trainingGate || trainingGate.loading || !trainingGate.met);

  const reflectionReq =
    currentStep?.type === 'REFLECTION' && currentStep.requireResponse !== false;
  const aidTrim =
    currentStep?.type === 'REFLECTION' ? currentStep.linkedAssessmentId?.trim() || '' : '';
  const habitsGoalForm =
    currentStep?.type === 'REFLECTION' &&
    !!aidTrim &&
    reflectionLinkCtx &&
    !reflectionLinkCtx.loading &&
    reflectionLinkCtx.assessmentType === 'habits';
  const storyGoalForm =
    currentStep?.type === 'REFLECTION' &&
    !!aidTrim &&
    reflectionLinkCtx &&
    !reflectionLinkCtx.loading &&
    reflectionLinkCtx.assessmentType === 'story-goal';

  const reflectionBlocksNext =
    currentStep?.type === 'REFLECTION' &&
    reflectionReq &&
    (habitsGoalForm
      ? (() => {
          const ht = reflectionHabitText.trim();
          return ht.length < 3 || ht.length > 180;
        })()
      : storyGoalForm
        ? reflectionStoryTextGoal.trim().length < 3
        : !reflectionDraft.trim());

  const l2StepReady = useMemo(() => {
    if (!currentStep || currentStep.type !== 'LEVEL2_MANIFEST') return true;
    return computeLevel2StepReady(currentStep, {
      stepAlreadyComplete: !!missionStepCompletion[currentStep.id],
      builderUnlocked: l2Progress.builderUnlocked,
      hasSkill: l2Progress.hasSkill,
      activeOk: l2Progress.activeOk,
    });
  }, [currentStep, missionStepCompletion, l2Progress]);

  const l2BlocksNext = currentStep?.type === 'LEVEL2_MANIFEST' && !l2StepReady;

  const handleNext = async () => {
    if (!mission?.sequence || !currentStep || !currentUser || !missionId) return;

    if (currentStep.type === 'TRAINING_ASSIGNMENT') {
      if (!trainingGate || trainingGate.loading || !trainingGate.met) return;
    }

    if (currentStep.type === 'REFLECTION') {
      const req = currentStep.requireResponse !== false;
      const text = reflectionDraft.trim();
      if (text.length > 4000) {
        alert('Reflection is too long (max 4000 characters).');
        return;
      }
      if (habitsGoalForm) {
        const ht = reflectionHabitText.trim();
        if (ht.length > 180) {
          alert('Habit description must be 180 characters or less.');
          return;
        }
        if (req && ht.length < 3) return;
      } else if (storyGoalForm) {
        const tg = reflectionStoryTextGoal.trim();
        if (tg.length > 500) {
          alert('Goal text must be 500 characters or less.');
          return;
        }
        if (req && tg.length < 3) return;
      } else {
        if (req && !text) return;
      }

      const habitReady = habitsGoalForm && reflectionHabitText.trim().length >= 3;
      const storyReady = storyGoalForm && reflectionStoryTextGoal.trim().length >= 3;
      const shouldSaveLinked = aidTrim && (habitReady || storyReady || !!text);
      const shouldSaveStandalone = !aidTrim && !!text;

      if (shouldSaveLinked || shouldSaveStandalone) {
        setReflectionSaving(true);
        try {
          if (aidTrim) {
            await submitMissionReflectionForSequence({
              assessmentId: aidTrim,
              studentId: currentUser.uid,
              missionId,
              stepId: currentStep.id,
              missionTitle: mission.title,
              reflectionText: text,
              ...(habitReady
                ? {
                    habitCommitment: {
                      habitText: reflectionHabitText.trim(),
                      duration: reflectionDuration,
                      evidence: reflectionHabitEvidence.trim() || null,
                    },
                  }
                : {}),
              ...(storyReady
                ? {
                    storyCommitment: {
                      textGoal: reflectionStoryTextGoal.trim(),
                      evidence: reflectionStoryEvidence.trim() || null,
                    },
                  }
                : {}),
            });
          } else if (text) {
            await saveMissionReflectionStandalone(currentUser.uid, {
              missionId,
              stepId: currentStep.id,
              text,
            });
          }
        } catch (e) {
          console.error('Mission reflection save failed', e);
          alert('Could not save your reflection. Please try again.');
          return;
        } finally {
          setReflectionSaving(false);
        }
      }
    }

    if (currentStep.type === 'LEVEL2_MANIFEST') {
      if (l2BlocksNext) return;
    }

    if (isLastStep) {
      await handleComplete();
    } else {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  const handleComplete = async () => {
    if (!currentUser || !playerMissionId) {
      alert('Cannot complete mission: no active mission found');
      return;
    }

    try {
      const result = await completeMission(currentUser.uid, playerMissionId);
      if (result.success) {
        if (result.pendingRewardChoices) {
          const snap = await getDoc(doc(db, 'playerMissions', playerMissionId));
          const groups = (snap.data() as PlayerMission | undefined)?.missionRewardChoicesPending?.groups;
          if (groups?.length) {
            const init: Record<string, string[]> = {};
            for (const g of groups) {
              init[g.groupId] = [];
            }
            setRewardChoicePicks(init);
            setPendingRewardChoiceGroups(groups);
            return;
          }
          console.error('completeMission reported pending choices but player mission has no groups');
          alert(
            'Mission completed, but reward choices could not be loaded. Try refreshing; contact support if this continues.'
          );
          navigate('/home');
          return;
        }
        alert('Mission completed!');
        navigate('/home');
      } else {
        alert(result.error || 'Failed to complete mission');
      }
    } catch (error) {
      console.error('Error completing mission:', error);
      alert('Failed to complete mission');
    }
  };

  const toggleMissionRewardPick = (groupId: string, optionId: string, pickCount: number) => {
    setRewardChoicePicks((prev) => {
      const cur = [...(prev[groupId] || [])];
      const idx = cur.indexOf(optionId);
      if (idx >= 0) {
        cur.splice(idx, 1);
        return { ...prev, [groupId]: cur };
      }
      if (cur.length >= pickCount) {
        if (pickCount === 1) {
          return { ...prev, [groupId]: [optionId] };
        }
        return prev;
      }
      return { ...prev, [groupId]: [...cur, optionId] };
    });
  };

  const handleClaimMissionRewardChoices = async () => {
    if (!currentUser || !playerMissionId || pendingRewardChoiceGroups.length === 0) return;
    for (const g of pendingRewardChoiceGroups) {
      const picks = rewardChoicePicks[g.groupId] || [];
      if (picks.length !== g.pickCount) {
        alert(
          `Choose exactly ${g.pickCount} reward(s) for "${g.displayName || 'this reward group'}".`
        );
        return;
      }
    }
    setClaimingMissionChoices(true);
    try {
      const r = await claimMissionRewardChoices(currentUser.uid, playerMissionId, rewardChoicePicks);
      if (r.success) {
        setPendingRewardChoiceGroups([]);
        setRewardChoicePicks({});
        alert('Mission completed!');
        navigate('/home');
      } else {
        alert(r.error || 'Failed to claim rewards');
      }
    } finally {
      setClaimingMissionChoices(false);
    }
  };

  const handleStartBattle = async () => {
    if (!currentUser || !currentStep || currentStep.type !== 'BATTLE') return;

    try {
      const mergedCpuOpponents = await loadMergedCpuOpponents();
      const opponentById = new Map(mergedCpuOpponents.map((o) => [o.id, o]));

      const gameId = `mission-battle-${missionId}-${currentStep.id}-${Date.now()}`;
      const battleConfig = currentStep.battle;
      if (!battleConfig) {
        alert('This mission step is missing battle configuration. Please contact support.');
        return;
      }
      const difficultyMap: Record<string, 'easy' | 'normal' | 'hard' | 'nightmare'> = {
        'EASY': 'easy',
        'MEDIUM': 'normal',
        'HARD': 'hard',
        'BOSS': 'nightmare'
      };
      const difficulty = difficultyMap[battleConfig.difficulty] || 'normal';
      const maxPerWave = battleConfig.maxEnemiesPerWave ?? 4;
      const statMult = missionBattleStatMultiplier(difficulty);
      const scaleStat = (base: number) => Math.max(0, Math.round(base * statMult));
      // EASY (1×): baseline HP / shield / attack; Medium ×1.5, Hard ×2, Boss ×2.5 (shield uses same mult as HP).
      const BASELINE_HEALTH = 100;
      const BASELINE_SHIELD = 50;
      const BASELINE_LEVEL = 1;
      const BASELINE_DAMAGE = BASELINE_LEVEL * 10;
      const health = scaleStat(BASELINE_HEALTH);
      const shield = scaleStat(BASELINE_SHIELD);
      const damage = scaleStat(BASELINE_DAMAGE);

      const clampSpawn = (n: number) => Math.max(0, Math.min(50, Math.floor(Number(n)) || 0));

      /** Expand legacy types with per-type counts; cap total at maxPerWave. */
      const expandLegacyEnemyTypes = (
        enemySet: string[],
        enemyTypeCounts?: Partial<Record<string, number>>
      ): string[] => {
        const out: string[] = [];
        const types = enemySet.length ? enemySet : battleConfig.enemySet;
        for (const t of types) {
          let n = clampSpawn(enemyTypeCounts?.[t] ?? 1);
          if (n < 1) n = 1;
          for (let k = 0; k < n; k++) {
            if (out.length >= maxPerWave) return out;
            out.push(t);
          }
        }
        return out;
      };

      /** Expand CPU spawns from opponentIds + opponentCounts; cap at maxPerWave. */
      const expandCpuSpawns = (opponentIds: string[], opponentCounts?: Record<string, number>): string[] => {
        const out: string[] = [];
        for (const id of opponentIds) {
          let n = clampSpawn(opponentCounts?.[id] ?? 1);
          if (n < 1) n = 1;
          for (let k = 0; k < n; k++) {
            if (out.length >= maxPerWave) return out;
            out.push(id);
          }
        }
        return out;
      };

      const generateEnemiesForWave = (waveNum: number, enemyTypes: string[]) => {
        const enemies: any[] = [];
        const count = Math.min(maxPerWave, Math.max(1, enemyTypes.length * 2));
        const types = enemyTypes.length ? enemyTypes : battleConfig.enemySet;
        for (let i = 0; i < count; i++) {
          const enemyType = types[i % types.length];
          enemies.push({
            id: `enemy_${waveNum}_${i}`,
            type: enemyType.toLowerCase(),
            name: `${enemyType} ${i + 1}`,
            health,
            maxHealth: health,
            shieldStrength: shield,
            maxShieldStrength: shield,
            level: BASELINE_LEVEL,
            damage,
            moves: [],
            position: { x: Math.random() * 100, y: Math.random() * 100 },
            spawnTime: new Date(),
            waveNumber: waveNum,
            image: `/images/${enemyType}.png`
          });
        }
        return enemies;
      };

      const generateEnemiesFromExpandedTypes = (waveNum: number, typeTokens: string[]) => {
        const enemies: any[] = [];
        for (let i = 0; i < typeTokens.length; i++) {
          const enemyType = typeTokens[i];
          enemies.push({
            id: `enemy_${waveNum}_${i}`,
            type: enemyType.toLowerCase(),
            name: `${enemyType} ${i + 1}`,
            health,
            maxHealth: health,
            shieldStrength: shield,
            maxShieldStrength: shield,
            level: BASELINE_LEVEL,
            damage,
            moves: [],
            position: { x: Math.random() * 100, y: Math.random() * 100 },
            spawnTime: new Date(),
            waveNumber: waveNum,
            image: `/images/${enemyType}.png`
          });
        }
        return enemies;
      };

      const generateEnemiesFromExpandedCpuIds = (waveNum: number, spawnIds: string[]) => {
        const enemies: any[] = [];
        for (let i = 0; i < spawnIds.length; i++) {
          const oppId = spawnIds[i];
          const source = opponentById.get(oppId);
          const nameBase = source?.name ?? oppId;
          const type = (source?.id ?? oppId).replace(/-/g, '_').toLowerCase();
          const baseHealth = typeof source?.health === 'number' && source.health > 0 ? source.health : 100;
          const baseShields = typeof source?.shields === 'number' && source.shields >= 0 ? source.shields : 0;
          const eh = Math.max(1, Math.round(baseHealth * statMult));
          const es = Math.max(0, Math.round(baseShields * statMult));
          const rawMoves = Array.isArray(source?.moves) ? source!.moves : [];
          const scaledMoves = scaleCpuOpponentMoves(rawMoves as unknown as Record<string, unknown>[], statMult);
          const rawAwakened = Array.isArray(source?.awakenedMoves) ? source!.awakenedMoves : [];
          const scaledAwakenedMoves = scaleCpuOpponentMoves(rawAwakened as unknown as Record<string, unknown>[], statMult);
          const dmg = estimateDamageFromCpuMoves(scaledMoves);
          const img =
            (source?.image && String(source.image).trim()) ||
            `/images/${nameBase.replace(/\s+/g, ' ')}.png`;
          let enemyTypeField: { enemyType?: ElementType | null } = {};
          if (source && Object.prototype.hasOwnProperty.call(source, 'enemyType')) {
            enemyTypeField = {
              enemyType: normalizeElementType(
                source.enemyType == null ? null : String(source.enemyType)
              ),
            };
          }
          const awakenedHealthScaled =
            source?.awakenedHealth != null && Number.isFinite(source.awakenedHealth)
              ? Math.max(1, Math.round(Number(source.awakenedHealth) * statMult))
              : undefined;
          const awakenedShieldsScaled =
            source?.awakenedShields != null && Number.isFinite(source.awakenedShields)
              ? Math.max(0, Math.round(Number(source.awakenedShields) * statMult))
              : undefined;
          const awakeningAnim = filterCpuAwakeningAnimationSteps(
            (source as { awakeningAnimation?: unknown }).awakeningAnimation
          );
          let awakenedEnemyTypeField: { awakenedEnemyType?: ElementType | null } = {};
          if (source && Object.prototype.hasOwnProperty.call(source, 'awakenedEnemyType')) {
            awakenedEnemyTypeField = {
              awakenedEnemyType: normalizeElementType(
                source!.awakenedEnemyType == null ? null : String(source!.awakenedEnemyType)
              ),
            };
          }
          enemies.push({
            id: `enemy_w${waveNum}_${i}`,
            type,
            name: `${nameBase} ${i + 1}`,
            health: eh,
            maxHealth: eh,
            shieldStrength: es,
            maxShieldStrength: es,
            level: BASELINE_LEVEL,
            damage: dmg,
            moves: scaledMoves,
            cpuSourceId: oppId,
            position: { x: Math.random() * 100, y: Math.random() * 100 },
            spawnTime: new Date(),
            waveNumber: waveNum,
            image: img,
            ...enemyTypeField,
            ...(source?.awakenedModeEnabled
              ? {
                  awakenedModeEnabled: true,
                  awakenAtHealthPercent:
                    typeof source?.awakenAtHealthPercent === 'number'
                      ? Math.min(100, Math.max(1, source.awakenAtHealthPercent))
                      : 50,
                  ...(source?.awakenedImage?.trim()
                    ? { awakenedImage: source.awakenedImage.trim() }
                    : {}),
                  ...(awakenedHealthScaled != null ? { awakenedHealth: awakenedHealthScaled } : {}),
                  ...(awakenedShieldsScaled != null ? { awakenedShields: awakenedShieldsScaled } : {}),
                  awakenedMoves: scaledAwakenedMoves,
                  ...awakenedEnemyTypeField,
                  ...(awakeningAnim.length ? { awakeningAnimation: awakeningAnim } : {}),
                }
              : {}),
          });
        }
        return enemies;
      };

      let initialEnemies: any[];
      let maxWaves: number;
      let customWaves: Record<number, any[]> | undefined;

      if (battleConfig.waveConfigs?.length) {
        maxWaves = battleConfig.waveConfigs.length;
        customWaves = {};
        for (let w = 0; w < battleConfig.waveConfigs.length; w++) {
          const waveNum = w + 1;
          const waveConfig = battleConfig.waveConfigs[w];
          const oc = waveConfig.opponentCounts;
          let cpuIds =
            waveConfig.opponentIds?.length
              ? [...waveConfig.opponentIds]
              : oc
                ? Object.keys(oc).filter((id) => (oc[id] ?? 0) > 0)
                : [];

          if (cpuIds.length > 0) {
            const spawnIds = expandCpuSpawns(cpuIds, waveConfig.opponentCounts);
            customWaves[waveNum] =
              spawnIds.length > 0
                ? generateEnemiesFromExpandedCpuIds(waveNum, spawnIds)
                : generateEnemiesForWave(waveNum, waveConfig.enemySet || battleConfig.enemySet);
          } else {
            const typeTokens = expandLegacyEnemyTypes(
              waveConfig.enemySet || [],
              waveConfig.enemyTypeCounts
            );
            customWaves[waveNum] =
              typeTokens.length > 0
                ? generateEnemiesFromExpandedTypes(waveNum, typeTokens)
                : generateEnemiesForWave(waveNum, waveConfig.enemySet || battleConfig.enemySet);
          }
        }
        initialEnemies = customWaves[1];
      } else {
        initialEnemies = generateEnemiesForWave(1, battleConfig.enemySet);
        maxWaves = battleConfig.waves ?? 3;
      }

      const rawRewards = battleConfig.rewards as { xp?: unknown; pp?: unknown; drops?: unknown } | undefined;
      const missionRewards =
        rawRewards && typeof rawRewards === 'object'
          ? {
              xp: Math.max(0, Math.floor(Number(rawRewards.xp)) || 0),
              pp: Math.max(0, Math.floor(Number(rawRewards.pp)) || 0),
              ...(Array.isArray(rawRewards.drops) && rawRewards.drops.length > 0
                ? { drops: rawRewards.drops }
                : {}),
            }
          : { xp: 0, pp: 0 };

      const battleRoomData: any = {
        id: gameId,
        gameId,
        lobbyId: null,
        players: [currentUser.uid],
        enemies: initialEnemies,
        waveNumber: 1,
        maxWaves,
        status: 'active',
        difficulty,
        isMissionBattle: true,
        missionId,
        stepId: currentStep.id,
        rewards: missionRewards,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        roundNumber: 1,
        hostPlayerId: currentUser.uid,
      };
      if (customWaves) {
        battleRoomData.customWaves = customWaves;
      }

      const coop = battleConfig.coop;
      if (coop?.allowPlayerJoinMidBattle) {
        battleRoomData.joinableMidBattle = true;
        battleRoomData.requireExplicitJoin = true;
        battleRoomData.participantCap =
          coop.maxAlliedParticipants && coop.maxAlliedParticipants > 0
            ? coop.maxAlliedParticipants
            : DEFAULT_MAX_ALLIED_PARTICIPANTS;
        battleRoomData.coopBattleMode = 'mission';
        battleRoomData.missionCoop = coop;
        battleRoomData.allowNpcAllies = coop.allowNpcAllies === true;
        battleRoomData.maxNpcAllies = 2;
        battleRoomData.participantRecords = {
          [currentUser.uid]: {
            participantId: currentUser.uid,
            type: 'player',
            userId: currentUser.uid,
            displayName: currentUser.displayName || 'Host',
            team: 'allies',
            status: 'active',
            joinedAtRound: 1,
            canReceiveRewards: true,
            contributed: false,
          },
        };
        battleRoomData.allyTurnOrderSnapshot = [currentUser.uid];
        battleRoomData.battleEventLog = ['[SYSTEM] Mission battle started — reinforcements may join.'];
      }

      const battleRoomRef = doc(db, 'islandRaidBattleRooms', gameId);
      const sanitized = stripUndefinedDeep(battleRoomData) as Record<string, unknown>;
      await setDoc(battleRoomRef, sanitized);

      setBattleGameId(gameId);
      setShowBattle(true);
    } catch (error) {
      console.error('Error starting battle:', error);
      const msg = error instanceof Error ? error.message : String(error);
      alert(`Failed to start battle: ${msg}`);
    }
  };

  const handleBattleComplete = () => {
    setShowBattle(false);
    setBattleGameId(null);
    void handleNext();
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Loading mission...</div>
      </div>
    );
  }

  if (!mission || !currentStep) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div>Mission not found or has no sequence.</div>
        <button onClick={() => navigate('/home')} style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}>
          Go Home
        </button>
      </div>
    );
  }

  // If battle is showing, render battle component
  if (showBattle && battleGameId) {
    return (
      <IslandRaidBattle
        gameId={battleGameId}
        lobbyId=""
        onLeave={() => {
          setShowBattle(false);
          setBattleGameId(null);
        }}
        onMissionVictoryDismiss={() => {
          setShowBattle(false);
          setBattleGameId(null);
          handleBattleComplete();
        }}
      />
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: '2rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        maxWidth: '800px',
        width: '100%',
        background: 'white',
        borderRadius: '1rem',
        padding: '2rem',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
      }}>
        {/* Mission Header */}
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <h1 style={{ margin: 0, marginBottom: '0.5rem' }}>{mission.title}</h1>
          <p style={{ color: '#6b7280', margin: 0 }}>Step {currentStepIndex + 1} of {mission.sequence?.length || 0}</p>
        </div>

        {/* Step Content */}
        {currentStep.type === 'STORY_SLIDE' && (
          <div>
            {currentStep.title && (
              <h2 style={{ marginBottom: '1rem' }}>{currentStep.title}</h2>
            )}
            {currentStep.image.url && (
              <img
                src={currentStep.image.url}
                alt={currentStep.image.alt || currentStep.title || 'Story slide'}
                style={{
                  width: '100%',
                  maxHeight: '400px',
                  objectFit: 'contain',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem'
                }}
              />
            )}
            <p style={{ fontSize: '1.1rem', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
              {currentStep.bodyText}
            </p>
          </div>
        )}

        {currentStep.type === 'VIDEO' && (
          <div>
            {currentStep.title && (
              <h2 style={{ marginBottom: '1rem' }}>{currentStep.title}</h2>
            )}
            {currentStep.video.url && (
              <video
                src={currentStep.video.url}
                poster={currentStep.video.posterUrl}
                controls={currentStep.video.controls !== false}
                autoPlay={currentStep.video.autoplay || false}
                muted={currentStep.video.muted || false}
                style={{
                  width: '100%',
                  maxHeight: '500px',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem'
                }}
                onEnded={() => {
                  // Auto-advance when video ends (optional)
                  // handleNext();
                }}
              />
            )}
            {currentStep.bodyText && (
              <p style={{ fontSize: '1.1rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', marginTop: '1rem' }}>
                {currentStep.bodyText}
              </p>
            )}
          </div>
        )}

        {currentStep.type === 'TRAINING_ASSIGNMENT' && (
          <div>
            {currentStep.title && <h2 style={{ marginBottom: '1rem' }}>{currentStep.title}</h2>}
            {currentStep.bodyText && (
              <p style={{ fontSize: '1.1rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', marginBottom: '1.5rem' }}>
                {currentStep.bodyText}
              </p>
            )}
            <div
              style={{
                padding: '1.5rem',
                background: '#f5f3ff',
                borderRadius: '0.5rem',
                marginBottom: '1.5rem',
                border: '1px solid #ddd6fe',
              }}
            >
              <h3 style={{ marginTop: 0 }}>Training Grounds assignment</h3>
              <p style={{ margin: '0.25rem 0' }}>
                <strong>Quiz:</strong> {trainingQuizTitle || currentStep.training.quizSetId}
              </p>
              <p style={{ margin: '0.25rem 0' }}>
                <strong>Required to continue:</strong>{' '}
                {currentStep.training.minimumPassPercent <= 0
                  ? 'Finish the quiz at least once.'
                  : `At least ${currentStep.training.minimumPassPercent}% on a completed run.`}
              </p>
              {trainingGate?.loading ? (
                <p style={{ marginTop: '1rem', color: '#6b7280' }}>Checking your progress…</p>
              ) : trainingGate?.met ? (
                <p style={{ marginTop: '1rem', color: '#059669', fontWeight: 600 }}>Requirement met — you can continue.</p>
              ) : (
                <p style={{ marginTop: '1rem', color: '#b45309' }}>
                  {currentStep.training.minimumPassPercent > 0
                    ? `Your best completed score so far: ${trainingGate?.bestPercent ?? 0}%. Keep practicing until you reach ${currentStep.training.minimumPassPercent}%.`
                    : 'Complete the quiz once to unlock the next step.'}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                if (!missionId) return;
                const returnPath = `/mission/${missionId}/play`;
                navigate(
                  `/training-grounds/quiz/${currentStep.training.quizSetId}?returnMission=${encodeURIComponent(returnPath)}`
                );
              }}
              style={{
                width: '100%',
                padding: '1rem',
                background: '#7c3aed',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Open quiz in Training Grounds
            </button>
          </div>
        )}

        {currentStep.type === 'BATTLE' && (
          <div>
            {currentStep.title && (
              <h2 style={{ marginBottom: '1rem' }}>{currentStep.title}</h2>
            )}
            {currentStep.bodyText && (
              <p style={{ fontSize: '1.1rem', lineHeight: '1.6', whiteSpace: 'pre-wrap', marginBottom: '1.5rem' }}>
                {currentStep.bodyText}
              </p>
            )}
            <div style={{
              padding: '1.5rem',
              background: '#f3f4f6',
              borderRadius: '0.5rem',
              marginBottom: '1.5rem'
            }}>
              <h3 style={{ marginTop: 0 }}>Battle Configuration</h3>
              <p><strong>Difficulty:</strong> {currentStep.battle.difficulty}</p>
              <p><strong>Enemy Types:</strong> {currentStep.battle.enemySet.join(', ')}</p>
              <p><strong>Waves:</strong> {currentStep.battle.waves || 3}</p>
              <p><strong>Rewards:</strong> {currentStep.battle.rewards.xp} XP, {currentStep.battle.rewards.pp} PP</p>
            </div>
            <button
              onClick={handleStartBattle}
              style={{
                width: '100%',
                padding: '1rem',
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontSize: '1.25rem',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Start Battle
            </button>
          </div>
        )}

        {currentStep.type === 'LEVEL2_MANIFEST' && currentUser && (
          <MissionLevel2ManifestStepPanel
            step={currentStep}
            userId={currentUser.uid}
            missionId={missionId!}
            playerMissionId={playerMissionId}
            stepAlreadyComplete={!!missionStepCompletion[currentStep.id]}
            onRefreshCompletion={() => void refreshMissionStepProgress()}
          />
        )}

        {currentStep.type === 'REFLECTION' && (
          <div>
            {currentStep.title && <h2 style={{ marginBottom: '1rem' }}>{currentStep.title}</h2>}
            {currentStep.bodyText && (
              <p
                style={{
                  fontSize: '1.05rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  marginBottom: '1.25rem',
                  color: '#374151',
                }}
              >
                {currentStep.bodyText}
              </p>
            )}
            <p style={{ fontWeight: 700, marginBottom: '0.35rem' }}>Reflection question</p>
            <p style={{ margin: '0 0 1rem', color: '#4b5563', fontSize: '1.02rem', lineHeight: 1.5 }}>
              {currentStep.prompt}
            </p>

            {aidTrim && reflectionLinkCtx?.loading && (
              <p style={{ color: '#6b7280', marginBottom: '1rem' }}>Loading linked assessment…</p>
            )}

            {aidTrim && reflectionLinkCtx && !reflectionLinkCtx.loading && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.75rem',
                  background: '#f0fdf4',
                  borderRadius: '0.5rem',
                  border: '1px solid #86efac',
                }}
              >
                <strong>Linked assessment:</strong>{' '}
                {reflectionLinkCtx.assessmentTitle || aidTrim}
                {reflectionLinkCtx.goalHint && (
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', color: '#166534' }}>
                    {reflectionLinkCtx.goalHint}
                  </p>
                )}
              </div>
            )}

            {aidTrim && reflectionLinkCtx?.isLocked && (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.75rem',
                  background: '#eff6ff',
                  border: '1px solid #93c5fd',
                  borderRadius: '0.5rem',
                  color: '#1e3a8a',
                }}
              >
                This assessment is locked in Assessment Goals (students can&apos;t edit goals there), but this mission
                is linked by your teacher — what you enter here still saves to the class dashboard for habits /
                story-goal, or merges into your goal evidence for other types.
              </div>
            )}

            {habitsGoalForm && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label
                    htmlFor="mission-reflection-habit"
                    style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}
                  >
                    What habit are you committing to?
                  </label>
                  <textarea
                    id="mission-reflection-habit"
                    value={reflectionHabitText}
                    onChange={(e) => setReflectionHabitText(e.target.value)}
                    disabled={reflectionSaving}
                    placeholder="e.g., Exercise for 30 minutes every day…"
                    minLength={3}
                    maxLength={180}
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #d1d5db',
                      fontSize: '1rem',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                  <p style={{ marginTop: '0.35rem', color: '#6b7280', fontSize: '0.875rem' }}>
                    {reflectionHabitText.length}/180 characters
                  </p>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <span style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Duration</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {(
                      [
                        ['1_class', '1 Class'],
                        ['1_day', '1 Day'],
                        ['3_days', '3 Days'],
                        ['1_week', '1 Week'],
                      ] as const
                    ).map(([val, label]) => (
                      <label
                        key={val}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                      >
                        <input
                          type="radio"
                          name="mission-habit-duration"
                          value={val}
                          checked={reflectionDuration === val}
                          onChange={() => setReflectionDuration(val)}
                          disabled={reflectionSaving}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    marginBottom: '1rem',
                    padding: '1rem',
                    background: '#f0f9ff',
                    borderRadius: '0.5rem',
                    border: '2px solid #3b82f6',
                  }}
                >
                  <label
                    htmlFor="mission-habit-evidence"
                    style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#1e40af' }}
                  >
                    Area of Consistency (optional)
                  </label>
                  <textarea
                    id="mission-habit-evidence"
                    value={reflectionHabitEvidence}
                    onChange={(e) => setReflectionHabitEvidence(e.target.value)}
                    disabled={reflectionSaving}
                    placeholder="Share evidence of how you've been maintaining your habit consistently."
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #3b82f6',
                      fontSize: '1rem',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                </div>
              </>
            )}

            {storyGoalForm && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label
                    htmlFor="mission-story-goal"
                    style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#92400e' }}
                  >
                    Describe your goal
                  </label>
                  <textarea
                    id="mission-story-goal"
                    value={reflectionStoryTextGoal}
                    onChange={(e) => setReflectionStoryTextGoal(e.target.value)}
                    disabled={reflectionSaving}
                    placeholder="What are you working toward?"
                    minLength={3}
                    maxLength={500}
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '2px solid #fbbf24',
                      fontSize: '1rem',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                  <p style={{ marginTop: '0.35rem', color: '#6b7280', fontSize: '0.875rem' }}>
                    {reflectionStoryTextGoal.length}/500 characters
                  </p>
                </div>
                <div
                  style={{
                    marginBottom: '1rem',
                    padding: '1rem',
                    background: '#f0f9ff',
                    borderRadius: '0.5rem',
                    border: '2px solid #3b82f6',
                  }}
                >
                  <label
                    htmlFor="mission-story-evidence"
                    style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#1e40af' }}
                  >
                    Area of Consistency (optional)
                  </label>
                  <textarea
                    id="mission-story-evidence"
                    value={reflectionStoryEvidence}
                    onChange={(e) => setReflectionStoryEvidence(e.target.value)}
                    disabled={reflectionSaving}
                    placeholder="Describe how you've been consistent toward your goal…"
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #3b82f6',
                      fontSize: '1rem',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                    }}
                  />
                </div>
              </>
            )}

            {(habitsGoalForm || storyGoalForm) && (
              <div style={{ marginBottom: '1rem' }}>
                <label
                  htmlFor="mission-reflection-extra"
                  style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600, color: '#4b5563' }}
                >
                  Additional reflection (optional)
                </label>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#6b7280' }}>
                  Appended to your evidence with a timestamp so teachers can see it with your goal.
                </p>
                <textarea
                  id="mission-reflection-extra"
                  value={reflectionDraft}
                  onChange={(e) => setReflectionDraft(e.target.value)}
                  disabled={reflectionSaving}
                  placeholder={currentStep.textareaPlaceholder || 'Optional notes…'}
                  maxLength={4000}
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                />
              </div>
            )}

            {!habitsGoalForm && !storyGoalForm && !(aidTrim && reflectionLinkCtx?.loading) && (
              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="mission-reflection-main" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>
                  {aidTrim && reflectionLinkCtx?.isLocked ? 'Your note (optional)' : 'Your response'}
                </label>
                <textarea
                  id="mission-reflection-main"
                  value={reflectionDraft}
                  onChange={(e) => setReflectionDraft(e.target.value)}
                  disabled={reflectionSaving || (!!aidTrim && reflectionLinkCtx?.loading)}
                  placeholder={currentStep.textareaPlaceholder || 'Write your reflection…'}
                  maxLength={4000}
                  rows={6}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '2rem',
          gap: '1rem'
        }}>
          <button
            onClick={handleBack}
            disabled={currentStepIndex === 0}
            style={{
              padding: '0.75rem 1.5rem',
              background: currentStepIndex === 0 ? '#e5e7eb' : '#6b7280',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: currentStepIndex === 0 ? 'not-allowed' : 'pointer',
              fontWeight: 'bold'
            }}
          >
            ← Back
          </button>
          <button
            onClick={() => navigate('/home')}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#9ca3af',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Exit
          </button>
          {currentStep.type !== 'BATTLE' && (
            <button
              onClick={() => void handleNext()}
              disabled={
                trainingBlocksNext || reflectionBlocksNext || reflectionSaving || l2BlocksNext
              }
              style={{
                padding: '0.75rem 1.5rem',
                background:
                  trainingBlocksNext || reflectionBlocksNext || reflectionSaving || l2BlocksNext
                    ? '#9ca3af'
                    : isLastStep
                      ? '#10b981'
                      : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor:
                  trainingBlocksNext || reflectionBlocksNext || reflectionSaving || l2BlocksNext
                    ? 'not-allowed'
                    : 'pointer',
                fontWeight: 'bold',
              }}
            >
              {reflectionSaving ? 'Saving…' : isLastStep ? 'Complete Mission ✓' : 'Next →'}
            </button>
          )}
        </div>
      </div>

      {pendingRewardChoiceGroups.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mission-reward-choice-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '1rem',
              maxWidth: '520px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
              padding: '1.5rem',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.25)',
            }}
          >
            <h2 id="mission-reward-choice-title" style={{ margin: '0 0 0.5rem' }}>
              Choose your rewards
            </h2>
            <p style={{ margin: '0 0 1.25rem', color: '#64748b', fontSize: '0.95rem' }}>
              This mission includes reward choices. Pick the options you want, then confirm to finish.
            </p>
            {pendingRewardChoiceGroups.map((g) => (
              <div key={g.groupId} style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.05rem' }}>
                  {g.displayName || 'Reward choice'}
                </h3>
                {g.description ? (
                  <p style={{ margin: '0 0 0.75rem', color: '#64748b', fontSize: '0.9rem' }}>
                    {g.description}
                  </p>
                ) : null}
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#94a3b8' }}>
                  Pick {g.pickCount} of {g.options.length}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {g.options.map((opt) => {
                    const selected = (rewardChoicePicks[g.groupId] || []).includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleMissionRewardPick(g.groupId, opt.id, g.pickCount)}
                        style={{
                          textAlign: 'left',
                          padding: '0.75rem 1rem',
                          borderRadius: '0.5rem',
                          border: selected ? '2px solid #4f46e5' : '2px solid #e2e8f0',
                          background: selected ? '#eef2ff' : '#f8fafc',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{opt.displayName}</div>
                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
                          {summarizeMissionBattlePassReward(opt)}
                        </div>
                        {opt.description ? (
                          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                            {opt.description}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <button
              type="button"
              disabled={claimingMissionChoices}
              onClick={() => void handleClaimMissionRewardChoices()}
              style={{
                marginTop: '0.5rem',
                width: '100%',
                padding: '0.85rem',
                background: claimingMissionChoices ? '#94a3b8' : '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                fontWeight: 'bold',
                cursor: claimingMissionChoices ? 'not-allowed' : 'pointer',
              }}
            >
              {claimingMissionChoices ? 'Claiming…' : 'Claim rewards & finish'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MissionRunner;

