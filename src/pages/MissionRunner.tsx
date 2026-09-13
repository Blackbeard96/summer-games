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
  type MissionSource,
  type PlayerMission,
  filterCpuAwakeningAnimationSteps,
} from '../types/missions';
import type { BattlePassReward } from '../types/season1';
import { REWARD_TYPE_LABELS } from '../components/admin/battlePassAdminRewardUtils';
import type { HabitDuration, HabitEvidenceType } from '../types/assessmentGoals';
import { getMissionTemplate } from '../utils/missionsService';
import {
  acceptMission,
  claimMissionRewardChoices,
  completeMission,
  getPlayerMissions,
  setPlayerMissionSequencePlayheadIndex,
} from '../utils/missionsService';
import { computeMissionFixedRewardTotals } from '../utils/missionBattlePassRewards';
import { isMissionPublished, isSkillMissionVisibleToStudentClasses } from '../utils/missionAdminHelpers';
import { getClassroomIdsForEnrolledStudent } from '../utils/classroomQueries';
import { MissionRichText } from '../utils/missionRichText';
import { normalizeMissionNavigateTo } from '../utils/missionStepNavigate';
import IslandRaidBattle from '../components/IslandRaidBattle';
import {
  estimateDamageFromCpuMoves,
  loadMergedCpuOpponents,
  scaleCpuOpponentMoves,
} from '../utils/cpuOpponentMovesService';
import type { ElementType } from '../types/elementTypes';
import { normalizeElementType } from '../types/elementTypes';
import {
  getQuizSet,
  userMetMissionTrainingRequirement,
  isTrainingQuizAcceptingSoloCompletions,
} from '../utils/trainingGroundsService';
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
import MissionChooseManifestStepPanel from '../components/mission/MissionChooseManifestStepPanel';
import MissionSkillsMasteryStepPanel from '../components/mission/MissionSkillsMasteryStepPanel';
import MissionArtifactsStepPanel from '../components/mission/MissionArtifactsStepPanel';
import MissionElementalSkillsStepPanel from '../components/mission/MissionElementalSkillsStepPanel';
import MissionPowerCardStepPanel from '../components/mission/MissionPowerCardStepPanel';
import { getLevel2ManifestState } from '../services/level2ManifestService';
import { DEFAULT_MAX_ALLIED_PARTICIPANTS } from '../constants/coopBattle';
import { stripUndefinedDeep } from '../utils/firestoreSanitize';
import {
  grantMissionChoiceArtifacts,
  resolveArtifactNames,
} from '../utils/missionChoiceArtifactGrant';

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
  const { currentUser, isAdmin } = useAuth();
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
  /** When false, mission step still shows the quiz but the student cannot open the CFU until staff reopens completions. */
  const [trainingQuizSoloOpen, setTrainingQuizSoloOpen] = useState(true);
  const [reflectionDraft, setReflectionDraft] = useState('');
  const [reflectionSaving, setReflectionSaving] = useState(false);
  const [reflectionHabitText, setReflectionHabitText] = useState('');
  const [reflectionDuration, setReflectionDuration] = useState<HabitDuration>('1_week');
  const [reflectionHabitEvidence, setReflectionHabitEvidence] = useState('');
  const [reflectionHabitEvidenceType, setReflectionHabitEvidenceType] = useState<HabitEvidenceType>('other');
  const [reflectionStoryTextGoal, setReflectionStoryTextGoal] = useState('');
  const [reflectionStoryEvidence, setReflectionStoryEvidence] = useState('');
  const [choiceSelectedId, setChoiceSelectedId] = useState<string | null>(null);
  const [choiceGrantBusy, setChoiceGrantBusy] = useState(false);
  const [choiceGrantPreviewNames, setChoiceGrantPreviewNames] = useState<Record<string, string>>({});

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

        if (missionData.missionCategory === 'SKILL') {
          if (!isMissionPublished(missionData) && !isAdmin) {
            alert('This Skill Mission is not published yet.');
            navigate('/home');
            return;
          }
          if (!isAdmin) {
            const enrolled = await getClassroomIdsForEnrolledStudent(currentUser.uid);
            if (!isSkillMissionVisibleToStudentClasses(missionData, enrolled)) {
              alert('This Skill Mission is not assigned to your class.');
              navigate('/home');
              return;
            }
          }
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

        const seqLen = missionData.sequence?.length ?? 0;
        let resumeIndex = 0;
        if (activeMission?.sequencePlayheadIndex != null && seqLen > 0) {
          const ph = Number(activeMission.sequencePlayheadIndex);
          if (Number.isFinite(ph)) {
            resumeIndex = Math.max(0, Math.min(Math.floor(ph), seqLen - 1));
          }
        }
        setCurrentStepIndex(resumeIndex);

        setLoading(false);
      } catch (error) {
        console.error('Error loading mission:', error);
        alert('Failed to load mission');
        navigate('/home');
      }
    };

    loadMission();
  }, [missionId, currentUser, navigate, isAdmin]);

  const currentStep = mission?.sequence?.[currentStepIndex];
  const isLastStep = mission?.sequence ? currentStepIndex === mission.sequence.length - 1 : false;

  const selectedChoice =
    currentStep?.type === 'CHOICE' && choiceSelectedId
      ? currentStep.choices.find((c) => c.id === choiceSelectedId) ?? null
      : null;
  const choiceBlocksNext = currentStep?.type === 'CHOICE' && !selectedChoice;

  useEffect(() => {
    setChoiceSelectedId(null);
    setChoiceGrantPreviewNames({});
  }, [currentStepIndex, currentStep?.id]);

  useEffect(() => {
    const ids = selectedChoice?.result?.grantArtifactIds?.filter((id) => id?.trim()) || [];
    if (ids.length === 0) {
      setChoiceGrantPreviewNames({});
      return;
    }
    let cancelled = false;
    void resolveArtifactNames(ids).then((names) => {
      if (!cancelled) setChoiceGrantPreviewNames(names);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedChoice?.id, selectedChoice?.result?.grantArtifactIds]);
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
      setTrainingQuizSoloOpen(true);
      return;
    }
    let cancelled = false;
    getQuizSet(trainingQuizSetId).then((q) => {
      if (cancelled) return;
      setTrainingQuizTitle(q?.title ?? null);
      setTrainingQuizSoloOpen(q ? isTrainingQuizAcceptingSoloCompletions(q) : false);
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
            setReflectionHabitEvidenceType((sub.habitEvidenceType as HabitEvidenceType) || 'other');
          } else {
            setReflectionHabitText('');
            setReflectionDuration(dur);
            setReflectionHabitEvidence('');
            setReflectionHabitEvidenceType('other');
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

  const chooseManifestBlocksNext =
    currentStep?.type === 'CHOOSE_MANIFEST' &&
    currentStep.requireSelection !== false &&
    !missionStepCompletion[currentStep.id];

  const skillsMasteryBlocksNext =
    currentStep?.type === 'SKILLS_MASTERY' &&
    currentStep.requireVisit !== false &&
    !missionStepCompletion[currentStep.id];

  const artifactsBlocksNext =
    currentStep?.type === 'ARTIFACTS' &&
    currentStep.requireVisit !== false &&
    !missionStepCompletion[currentStep.id];

  const elementalSkillsBlocksNext =
    currentStep?.type === 'ELEMENTAL_SKILLS' &&
    currentStep.requireSelection !== false &&
    !missionStepCompletion[currentStep.id];

  const powerCardBlocksNext =
    currentStep?.type === 'POWER_CARD' &&
    currentStep.requireVisit !== false &&
    !missionStepCompletion[currentStep.id];

  const missionPayoutTotals = useMemo(
    () => (mission ? computeMissionFixedRewardTotals(mission) : { xp: 0, pp: 0, truthMetal: 0 }),
    [mission]
  );

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
                      habitEvidenceType: reflectionHabitEvidenceType,
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

    if (currentStep.type === 'CHOOSE_MANIFEST') {
      if (chooseManifestBlocksNext) return;
    }

    if (currentStep.type === 'SKILLS_MASTERY') {
      if (skillsMasteryBlocksNext) return;
    }

    if (currentStep.type === 'ARTIFACTS') {
      if (artifactsBlocksNext) return;
    }

    if (currentStep.type === 'ELEMENTAL_SKILLS') {
      if (elementalSkillsBlocksNext) return;
    }

    if (currentStep.type === 'POWER_CARD') {
      if (powerCardBlocksNext) return;
    }

    if (currentStep.type === 'CHOICE') {
      if (!selectedChoice) return;
      const grantIds = (selectedChoice.result.grantArtifactIds || []).filter((id) => id?.trim());
      if (grantIds.length > 0 && currentUser) {
        setChoiceGrantBusy(true);
        try {
          await grantMissionChoiceArtifacts({
            userId: currentUser.uid,
            artifactIds: grantIds,
            missionId: missionId!,
            stepId: currentStep.id,
            choiceId: selectedChoice.id,
          });
        } catch (e) {
          console.error('Failed to grant choice artifacts', e);
          alert(e instanceof Error ? e.message : 'Failed to grant artifacts from this choice.');
          setChoiceGrantBusy(false);
          return;
        } finally {
          setChoiceGrantBusy(false);
        }
      }
      const jumpId = selectedChoice.goToStepId?.trim();
      let nextIndex: number | null = null;
      if (jumpId && mission.sequence) {
        const idx = mission.sequence.findIndex((s) => s.id === jumpId);
        if (idx >= 0) nextIndex = idx;
      }
      if (nextIndex == null) {
        if (isLastStep) {
          await handleComplete();
          return;
        }
        nextIndex = currentStepIndex + 1;
      }
      if (playerMissionId) {
        try {
          await setPlayerMissionSequencePlayheadIndex(playerMissionId, nextIndex);
        } catch (e) {
          console.error('Failed to save mission step position', e);
        }
      }
      setChoiceSelectedId(null);
      setCurrentStepIndex(nextIndex);
      return;
    }

    if (isLastStep) {
      await handleComplete();
    } else {
      const nextIndex = currentStepIndex + 1;
      if (playerMissionId) {
        try {
          await setPlayerMissionSequencePlayheadIndex(playerMissionId, nextIndex);
        } catch (e) {
          console.error('Failed to save mission step position', e);
        }
      }
      setCurrentStepIndex(nextIndex);
      const redirect =
        (currentStep.type === 'STORY_SLIDE' || currentStep.type === 'VIDEO') &&
        normalizeMissionNavigateTo(currentStep.navigateTo);
      if (redirect) {
        navigate(redirect);
      }
    }
  };

  const handleBack = async () => {
    if (currentStep?.type === 'CHOICE' && choiceSelectedId) {
      setChoiceSelectedId(null);
      return;
    }
    if (currentStepIndex <= 0) return;
    const prevIndex = currentStepIndex - 1;
    if (playerMissionId) {
      try {
        await setPlayerMissionSequencePlayheadIndex(playerMissionId, prevIndex);
      } catch (e) {
        console.error('Failed to save mission step position', e);
      }
    }
    setCurrentStepIndex(prevIndex);
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
    if (!currentUser || !currentStep || currentStep.type !== 'BATTLE' || !mission || !missionId) return;

    try {
      let effectivePlayerMissionId = playerMissionId;
      if (!effectivePlayerMissionId) {
        const missionSource: MissionSource =
          Array.isArray(mission.deliveryChannels) && mission.deliveryChannels.includes('PLAYER_JOURNEY')
            ? 'PLAYER_JOURNEY'
            : 'HUB_NPC';
        const acc = await acceptMission(currentUser.uid, missionId, missionSource);
        if (acc.playerMissionId) {
          effectivePlayerMissionId = acc.playerMissionId;
          setPlayerMissionId(acc.playerMissionId);
        }
        if (!effectivePlayerMissionId) {
          alert(acc.error || 'Could not start this mission. Try accepting it from the mission hub first.');
          return;
        }
      }

      const mergedCpuOpponents = await loadMergedCpuOpponents();
      const opponentById = new Map(mergedCpuOpponents.map((o) => [o.id, o]));

      // Pre-sync Manifest skills so Fight menu never opens empty for demos / missions
      try {
        const { ensureManifestSkillsForBattle } = await import('../utils/battleMovesManifestSync');
        await ensureManifestSkillsForBattle(currentUser.uid);
      } catch (skillPrepErr) {
        console.warn('Mission battle skill prep:', skillPrepErr);
      }

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

      /**
       * Legacy enemy types that should spawn from the CPU Opponent catalog
       * (stats, moves, image) instead of the generic stub template.
       */
      const LEGACY_TYPE_TO_CPU_ID: Record<string, string> = {
        AHINTA_TUMI: 'ahinta-tumi',
      };

      const partitionLegacyTokens = (typeTokens: string[]) => {
        const cpuIds: string[] = [];
        const genericTypes: string[] = [];
        for (const t of typeTokens) {
          const cpuId = LEGACY_TYPE_TO_CPU_ID[t] || LEGACY_TYPE_TO_CPU_ID[t.toUpperCase()];
          if (cpuId && opponentById.has(cpuId)) {
            cpuIds.push(cpuId);
          } else if (cpuId) {
            // Catalog not loaded / missing — still try CPU id so image/name resolve when possible
            cpuIds.push(cpuId);
          } else {
            genericTypes.push(t);
          }
        }
        return { cpuIds, genericTypes };
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
        const types = enemyTypes.length ? enemyTypes : battleConfig.enemySet;
        // Prefer catalog-backed spawns for types like AHINTA_TUMI; keep legacy 2× padding for pure stubs.
        const { cpuIds, genericTypes } = partitionLegacyTokens(types);
        if (cpuIds.length > 0 && genericTypes.length === 0) {
          // Expand each catalog type twice to match historical generateEnemiesForWave density.
          const doubled: string[] = [];
          for (const id of cpuIds) {
            doubled.push(id, id);
            if (doubled.length >= maxPerWave) break;
          }
          return generateEnemiesFromExpandedCpuIds(waveNum, doubled.slice(0, maxPerWave));
        }
        if (cpuIds.length > 0) {
          const fromCpu = generateEnemiesFromExpandedCpuIds(waveNum, cpuIds);
          const stubCount = Math.min(
            maxPerWave - fromCpu.length,
            Math.max(0, genericTypes.length * 2)
          );
          const stubTokens: string[] = [];
          for (let i = 0; i < stubCount; i++) {
            stubTokens.push(genericTypes[i % genericTypes.length]);
          }
          const fromGeneric = generateEnemiesFromExpandedTypes(waveNum, stubTokens).map((e, i) => ({
            ...e,
            id: `enemy_${waveNum}_legacy_${cpuIds.length + i}`,
          }));
          return [...fromCpu, ...fromGeneric].slice(0, maxPerWave);
        }
        const enemies: any[] = [];
        const count = Math.min(maxPerWave, Math.max(1, types.length * 2));
        for (let i = 0; i < count; i++) {
          const enemyType = types[i % types.length];
          const displayName =
            enemyType === 'AHINTA_TUMI' ? 'Ahinta Tumi' : enemyType.replace(/_/g, ' ');
          enemies.push({
            id: `enemy_${waveNum}_${i}`,
            type: enemyType.toLowerCase(),
            name: `${displayName} ${i + 1}`,
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
            image:
              enemyType === 'AHINTA_TUMI'
                ? '/images/Ahinta Tumi Agent.png'
                : `/images/${enemyType}.png`,
          });
        }
        return enemies;
      };

      const generateEnemiesFromExpandedTypes = (waveNum: number, typeTokens: string[]) => {
        const enemies: any[] = [];
        for (let i = 0; i < typeTokens.length; i++) {
          const enemyType = typeTokens[i];
          const displayName =
            enemyType === 'AHINTA_TUMI' ? 'Ahinta Tumi' : enemyType.replace(/_/g, ' ');
          enemies.push({
            id: `enemy_${waveNum}_${i}`,
            type: enemyType.toLowerCase(),
            name: `${displayName} ${i + 1}`,
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
            image:
              enemyType === 'AHINTA_TUMI'
                ? '/images/Ahinta Tumi Agent.png'
                : `/images/${enemyType}.png`,
          });
        }
        return enemies;
      };

      /** Resolve legacy type tokens, routing catalog-backed types (e.g. Ahinta Tumi) through CPU spawns. */
      const generateEnemiesFromLegacyTokens = (waveNum: number, typeTokens: string[]) => {
        const { cpuIds, genericTypes } = partitionLegacyTokens(typeTokens);
        const fromCpu = cpuIds.length > 0 ? generateEnemiesFromExpandedCpuIds(waveNum, cpuIds) : [];
        // Offset generic ids so they do not collide with CPU rows from the same wave index.
        const fromGeneric = generateEnemiesFromExpandedTypes(waveNum, genericTypes).map((e, i) => ({
          ...e,
          id: `enemy_${waveNum}_legacy_${cpuIds.length + i}`,
        }));
        return [...fromCpu, ...fromGeneric];
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
                ? generateEnemiesFromLegacyTokens(waveNum, typeTokens)
                : generateEnemiesForWave(waveNum, waveConfig.enemySet || battleConfig.enemySet);
          }
        }
        initialEnemies = customWaves[1];
      } else {
        initialEnemies = generateEnemiesForWave(1, battleConfig.enemySet);
        maxWaves = battleConfig.waves ?? 3;
      }

      const rawRewards = battleConfig.rewards as { xp?: unknown; pp?: unknown; drops?: unknown } | undefined;
      const payoutTotals = computeMissionFixedRewardTotals(mission);
      const missionRewards: { xp: number; pp: number; truthMetal: number; drops?: unknown[] } = {
        xp: payoutTotals.xp,
        pp: payoutTotals.pp,
        truthMetal: payoutTotals.truthMetal,
        ...(rawRewards &&
        typeof rawRewards === 'object' &&
        Array.isArray(rawRewards.drops) &&
        rawRewards.drops.length > 0
          ? { drops: rawRewards.drops as unknown[] }
          : {}),
      };

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
        playerMissionId: effectivePlayerMissionId,
        rewards: missionRewards,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        roundNumber: 1,
        hostPlayerId: currentUser.uid,
      };
      const bgUrl = battleConfig.backgroundImage?.url?.trim();
      if (bgUrl) {
        battleRoomData.battleBackgroundUrl = bgUrl;
      }
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
      <div className="mst-mission-shell">
        <div className="mst-mission-loading" role="status" aria-live="polite">
          <div className="mst-mission-loading-mark" aria-hidden="true" />
          <p className="mst-mission-loading-title">Loading Mission...</p>
          <p className="mst-mission-loading-copy">Preparing your next challenge...</p>
        </div>
      </div>
    );
  }

  if (!mission || !currentStep) {
    return (
      <div className="mst-mission-shell">
        <div className="mst-mission-error" role="alert">
          <p className="mst-mission-error-title">Mission unavailable</p>
          <p style={{ margin: '0 0 1rem', color: 'var(--mst-text-muted)' }}>
            Mission not found or has no sequence.
          </p>
          <button type="button" className="mst-mission-btn mst-mission-btn--primary" onClick={() => navigate('/home')}>
            Go Home
          </button>
        </div>
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

  const sequenceLength = mission.sequence?.length || 0;
  const progressPct =
    sequenceLength > 0 ? Math.min(100, ((currentStepIndex + 1) / sequenceLength) * 100) : 0;

  return (
    <div className="mst-mission-shell">
      <div className="mst-mission-layout">
        <aside className="mst-mission-rail" aria-hidden="true">
          <div className="mst-mission-rail-mark" />
          <span className="mst-mission-rail-motto">Same Mind. Higher Purpose.</span>
        </aside>

        <div className="mst-mission-panel" data-step-type={currentStep.type}>
        {/* Mission Header */}
        <header className="mst-mission-header">
          <p className="mst-mission-kicker">Missions</p>
          <h1 className="mst-mission-title">{mission.title}</h1>
          <p className="mst-mission-step-meta">
            Step {currentStepIndex + 1} of {sequenceLength}
          </p>
          <div className="mst-mission-progress" aria-hidden="true">
            <div className="mst-mission-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </header>

        {/* Step Content */}
        {currentStep.type === 'STORY_SLIDE' && (
          <div>
            {currentStep.title && (
              <h2 className="mst-mission-step-heading">{currentStep.title}</h2>
            )}
            {currentStep.image.url && (
              <img
                src={currentStep.image.url}
                alt={currentStep.image.alt || currentStep.title || 'Story slide'}
                className="mst-mission-media"
              />
            )}
            <MissionRichText
              text={currentStep.bodyText}
              as="p"
              style={{ fontSize: '1.05rem', lineHeight: '1.7', color: '#e5e7eb' }}
              linkColor="#f0c96a"
            />
          </div>
        )}

        {currentStep.type === 'VIDEO' && (
          <div>
            {currentStep.title && (
              <h2 className="mst-mission-step-heading">{currentStep.title}</h2>
            )}
            {currentStep.video.url && (
              <div className="mst-mission-video-frame">
                <video
                  src={currentStep.video.url}
                  poster={currentStep.video.posterUrl}
                  controls={currentStep.video.controls !== false}
                  autoPlay={currentStep.video.autoplay || false}
                  muted={currentStep.video.muted || false}
                  style={{
                    width: '100%',
                    maxHeight: '500px',
                  }}
                  onEnded={() => {
                    // Auto-advance when video ends (optional)
                    // handleNext();
                  }}
                />
              </div>
            )}
            {currentStep.bodyText && (
              <MissionRichText
                text={currentStep.bodyText}
                as="p"
                style={{ fontSize: '1.05rem', lineHeight: '1.7', color: '#e5e7eb', marginTop: '1rem' }}
                linkColor="#f0c96a"
              />
            )}
          </div>
        )}

        {currentStep.type === 'TRAINING_ASSIGNMENT' && (
          <div>
            {currentStep.title && <h2 className="mst-mission-step-heading">{currentStep.title}</h2>}
            {currentStep.bodyText && (
              <MissionRichText
                text={currentStep.bodyText}
                as="p"
                style={{ fontSize: '1.05rem', lineHeight: '1.7', color: '#e5e7eb', marginBottom: '1.5rem' }}
                linkColor="#f0c96a"
              />
            )}
            <div className="mst-mission-block mst-mission-block--accent">
              <h3>Training Grounds (CFUs) assignment</h3>
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
                <p style={{ marginTop: '1rem' }}>Checking your progress…</p>
              ) : trainingGate?.met ? (
                <p style={{ marginTop: '1rem', fontWeight: 600 }}>Requirement met — you can continue.</p>
              ) : (
                <p style={{ marginTop: '1rem' }}>
                  {currentStep.training.minimumPassPercent > 0
                    ? `Your best completed score so far: ${trainingGate?.bestPercent ?? 0}%. Keep practicing until you reach ${currentStep.training.minimumPassPercent}%.`
                    : 'Complete the quiz once to unlock the next step.'}
                </p>
              )}
            </div>
            {!trainingQuizSoloOpen && (
              <div className="mst-mission-block mst-mission-block--warn" style={{ fontSize: '0.95rem' }}>
                This CFU is temporarily <strong>closed for completions</strong>. You can see the assignment here, but your teacher must turn completions back on before you can take the quiz.
              </div>
            )}
            <button
              type="button"
              className="mst-mission-btn mst-mission-btn--primary mst-mission-btn--block"
              disabled={!trainingQuizSoloOpen}
              title={
                !trainingQuizSoloOpen
                  ? 'This CFU is closed for completions until your teacher turns it back on.'
                  : undefined
              }
              onClick={() => {
                if (!trainingQuizSoloOpen || !missionId) return;
                const returnPath = `/mission/${missionId}/play`;
                navigate(
                  `/training-grounds/quiz/${currentStep.training.quizSetId}?returnMission=${encodeURIComponent(returnPath)}`
                );
              }}
            >
              {trainingQuizSoloOpen ? 'Open quiz in Training Grounds (CFUs)' : 'Quiz closed for completions'}
            </button>
          </div>
        )}

        {currentStep.type === 'BATTLE' && (
          <div>
            {currentStep.title && (
              <h2 className="mst-mission-step-heading">{currentStep.title}</h2>
            )}
            {currentStep.bodyText && (
              <MissionRichText
                text={currentStep.bodyText}
                as="p"
                style={{ fontSize: '1.05rem', lineHeight: '1.7', color: '#e5e7eb', marginBottom: '1.5rem' }}
                linkColor="#f0c96a"
              />
            )}
            <div className="mst-mission-block mst-mission-block--danger">
              <h3>Battle Configuration</h3>
              <p><strong>Difficulty:</strong> {currentStep.battle.difficulty}</p>
              <p><strong>Enemy Types:</strong> {currentStep.battle.enemySet.join(', ')}</p>
              <p><strong>Waves:</strong> {currentStep.battle.waves || 3}</p>
              <p>
                <strong>Rewards (granted when you finish the mission):</strong>{' '}
                {missionPayoutTotals.xp} XP, {missionPayoutTotals.pp} PP
                {missionPayoutTotals.truthMetal > 0 ? `, ${missionPayoutTotals.truthMetal} Truth Metal` : ''}
              </p>
            </div>
            <button
              type="button"
              className="mst-mission-btn mst-mission-btn--danger mst-mission-btn--block"
              onClick={handleStartBattle}
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

        {currentStep.type === 'CHOOSE_MANIFEST' && currentUser && (
          <MissionChooseManifestStepPanel
            step={currentStep}
            userId={currentUser.uid}
            playerMissionId={playerMissionId}
            stepAlreadyComplete={!!missionStepCompletion[currentStep.id]}
            onRefreshCompletion={() => void refreshMissionStepProgress()}
          />
        )}

        {currentStep.type === 'SKILLS_MASTERY' && currentUser && (
          <MissionSkillsMasteryStepPanel
            step={currentStep}
            userId={currentUser.uid}
            missionId={missionId!}
            playerMissionId={playerMissionId}
            stepAlreadyComplete={!!missionStepCompletion[currentStep.id]}
            onRefreshCompletion={() => void refreshMissionStepProgress()}
          />
        )}

        {currentStep.type === 'ARTIFACTS' && currentUser && (
          <MissionArtifactsStepPanel
            step={currentStep}
            userId={currentUser.uid}
            missionId={missionId!}
            playerMissionId={playerMissionId}
            stepAlreadyComplete={!!missionStepCompletion[currentStep.id]}
            onRefreshCompletion={() => void refreshMissionStepProgress()}
          />
        )}

        {currentStep.type === 'ELEMENTAL_SKILLS' && currentUser && (
          <MissionElementalSkillsStepPanel
            step={currentStep}
            userId={currentUser.uid}
            playerMissionId={playerMissionId}
            stepAlreadyComplete={!!missionStepCompletion[currentStep.id]}
            onRefreshCompletion={() => void refreshMissionStepProgress()}
          />
        )}

        {currentStep.type === 'POWER_CARD' && currentUser && (
          <MissionPowerCardStepPanel
            step={currentStep}
            userId={currentUser.uid}
            missionId={missionId!}
            playerMissionId={playerMissionId}
            stepAlreadyComplete={!!missionStepCompletion[currentStep.id]}
            onRefreshCompletion={() => void refreshMissionStepProgress()}
          />
        )}

        {currentStep.type === 'CHOICE' && (
          <div>
            {currentStep.title && <h2 className="mst-mission-step-heading">{currentStep.title}</h2>}
            {currentStep.bodyText && (
              <MissionRichText
                text={currentStep.bodyText}
                as="p"
                style={{ fontSize: '1.05rem', lineHeight: '1.7', marginBottom: '1.25rem', color: '#e5e7eb' }}
                linkColor="#f0c96a"
              />
            )}

            {!selectedChoice ? (
              <>
                <p style={{ fontWeight: 700, marginBottom: '1rem', fontSize: '1.15rem', lineHeight: 1.45 }}>
                  {currentStep.prompt}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {currentStep.choices.map((choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      className="mst-mission-choice"
                      onClick={() => setChoiceSelectedId(choice.id)}
                    >
                      <div className="mst-mission-choice-label">{choice.label}</div>
                      {choice.description?.trim() && (
                        <div className="mst-mission-choice-desc">{choice.description}</div>
                      )}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="mst-mission-block mst-mission-block--accent">
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', fontWeight: 700 }}>
                  You chose: {selectedChoice.label}
                </p>
                {selectedChoice.result.title?.trim() && (
                  <h3 style={{ margin: '0 0 0.75rem' }}>{selectedChoice.result.title}</h3>
                )}
                {selectedChoice.result.imageUrl?.trim() && (
                  <img
                    src={selectedChoice.result.imageUrl}
                    alt={selectedChoice.result.title || selectedChoice.label}
                    className="mst-mission-media"
                  />
                )}
                <MissionRichText
                  text={selectedChoice.result.bodyText}
                  as="p"
                  style={{ margin: 0, fontSize: '1.05rem', lineHeight: 1.7, color: '#e5e7eb' }}
                  linkColor="#f0c96a"
                />
                {((selectedChoice.result.grantArtifactIds || []).filter((id) => id?.trim()).length > 0) && (
                  <div className="mst-mission-block mst-mission-block--success" style={{ marginTop: '1rem', marginBottom: 0 }}>
                    <p style={{ margin: '0 0 0.35rem', fontWeight: 700, fontSize: '0.85rem' }}>
                      Artifact reward
                    </p>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.95rem' }}>
                      {(selectedChoice.result.grantArtifactIds || [])
                        .filter((id) => id?.trim())
                        .map((id) => (
                          <li key={id}>{choiceGrantPreviewNames[id] || choiceGrantPreviewNames[id.trim()] || id}</li>
                        ))}
                    </ul>
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem' }}>
                      Continue to claim {((selectedChoice.result.grantArtifactIds || []).filter((id) => id?.trim()).length === 1) ? 'this artifact' : 'these artifacts'}.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {currentStep.type === 'REFLECTION' && (
          <div>
            {currentStep.title && <h2 className="mst-mission-step-heading">{currentStep.title}</h2>}
            {currentStep.bodyText && (
              <MissionRichText
                text={currentStep.bodyText}
                as="p"
                style={{ fontSize: '1.05rem', lineHeight: '1.7', marginBottom: '1.25rem', color: '#e5e7eb' }}
                linkColor="#f0c96a"
              />
            )}
            <p className="mst-mission-label" style={{ marginBottom: '0.35rem' }}>Reflection question</p>
            <p style={{ margin: '0 0 1rem', fontSize: '1.02rem', lineHeight: 1.5 }}>
              {currentStep.prompt}
            </p>

            {aidTrim && reflectionLinkCtx?.loading && (
              <p style={{ marginBottom: '1rem' }}>Loading linked assessment…</p>
            )}

            {aidTrim && reflectionLinkCtx && !reflectionLinkCtx.loading && (
              <div className="mst-mission-block mst-mission-block--success">
                <strong>Linked assessment:</strong>{' '}
                {reflectionLinkCtx.assessmentTitle || aidTrim}
                {reflectionLinkCtx.goalHint && (
                  <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem' }}>
                    {reflectionLinkCtx.goalHint}
                  </p>
                )}
              </div>
            )}

            {aidTrim && reflectionLinkCtx?.isLocked && (
              <div className="mst-mission-block mst-mission-block--info">
                This assessment is locked in Assessment Goals (students can&apos;t edit goals there), but this mission
                is linked by your teacher — what you enter here still saves to the class dashboard for habits /
                story-goal, or merges into your goal evidence for other types.
              </div>
            )}

            {habitsGoalForm && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label htmlFor="mission-reflection-habit" className="mst-mission-label">
                    What habit are you committing to?
                  </label>
                  <textarea
                    id="mission-reflection-habit"
                    className="mst-mission-textarea"
                    value={reflectionHabitText}
                    onChange={(e) => setReflectionHabitText(e.target.value)}
                    disabled={reflectionSaving}
                    placeholder="e.g., Exercise for 30 minutes every day…"
                    minLength={3}
                    maxLength={180}
                    rows={3}
                  />
                  <p style={{ marginTop: '0.35rem', fontSize: '0.875rem' }}>
                    {reflectionHabitText.length}/180 characters
                  </p>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <span className="mst-mission-label">Duration</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {(
                      [
                        ['1_class', '1 Class'],
                        ['1_day', '1 Day'],
                        ['3_days', '3 Days'],
                        ['1_week', '1 Week'],
                      ] as const
                    ).map(([val, label]) => (
                      <label key={val} className="mst-mission-radio">
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
                <div className="mst-mission-block mst-mission-block--info">
                  <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>2 — Evidence</div>
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem' }}>
                    Live Event options track Class Flow sprints when you join a session.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '0.75rem' }}>
                    <label className="mst-mission-radio" style={{ alignItems: 'flex-start' }}>
                      <input
                        type="radio"
                        name="mission-habit-evidence-type"
                        checked={reflectionHabitEvidenceType === 'live_event_sprint_rate'}
                        onChange={() => setReflectionHabitEvidenceType('live_event_sprint_rate')}
                        disabled={reflectionSaving}
                      />
                      <span style={{ fontSize: '0.9rem' }}>
                        <strong>Sprint completion rate</strong> (offered vs. completed per session)
                      </span>
                    </label>
                    <label className="mst-mission-radio" style={{ alignItems: 'flex-start' }}>
                      <input
                        type="radio"
                        name="mission-habit-evidence-type"
                        checked={reflectionHabitEvidenceType === 'live_event_consistency'}
                        onChange={() => setReflectionHabitEvidenceType('live_event_consistency')}
                        disabled={reflectionSaving}
                      />
                      <span style={{ fontSize: '0.9rem' }}>
                        <strong>Consistency</strong> (days with a completed sprint)
                      </span>
                    </label>
                    <label className="mst-mission-radio" style={{ alignItems: 'flex-start' }}>
                      <input
                        type="radio"
                        name="mission-habit-evidence-type"
                        checked={reflectionHabitEvidenceType === 'other'}
                        onChange={() => setReflectionHabitEvidenceType('other')}
                        disabled={reflectionSaving}
                      />
                      <span style={{ fontSize: '0.9rem' }}>
                        <strong>Other</strong> (type your own)
                      </span>
                    </label>
                  </div>
                  {reflectionHabitEvidenceType === 'other' && (
                    <>
                      <label htmlFor="mission-habit-evidence" className="mst-mission-label">
                        Reflection or proof (optional)
                      </label>
                      <textarea
                        id="mission-habit-evidence"
                        className="mst-mission-textarea"
                        value={reflectionHabitEvidence}
                        onChange={(e) => setReflectionHabitEvidence(e.target.value)}
                        disabled={reflectionSaving}
                        placeholder="Share evidence of how you've been maintaining your habit consistently."
                        rows={4}
                      />
                    </>
                  )}
                </div>
              </>
            )}

            {storyGoalForm && (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <label htmlFor="mission-story-goal" className="mst-mission-label">
                    Describe your goal
                  </label>
                  <textarea
                    id="mission-story-goal"
                    className="mst-mission-textarea"
                    value={reflectionStoryTextGoal}
                    onChange={(e) => setReflectionStoryTextGoal(e.target.value)}
                    disabled={reflectionSaving}
                    placeholder="What are you working toward?"
                    minLength={3}
                    maxLength={500}
                    rows={4}
                  />
                  <p style={{ marginTop: '0.35rem', fontSize: '0.875rem' }}>
                    {reflectionStoryTextGoal.length}/500 characters
                  </p>
                </div>
                <div className="mst-mission-block mst-mission-block--info">
                  <label htmlFor="mission-story-evidence" className="mst-mission-label">
                    Area of Consistency (optional)
                  </label>
                  <textarea
                    id="mission-story-evidence"
                    className="mst-mission-textarea"
                    value={reflectionStoryEvidence}
                    onChange={(e) => setReflectionStoryEvidence(e.target.value)}
                    disabled={reflectionSaving}
                    placeholder="Describe how you've been consistent toward your goal…"
                    rows={4}
                  />
                </div>
              </>
            )}

            {(habitsGoalForm || storyGoalForm) && (
              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="mission-reflection-extra" className="mst-mission-label">
                  Additional reflection (optional)
                </label>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>
                  Appended to your evidence with a timestamp so teachers can see it with your goal.
                </p>
                <textarea
                  id="mission-reflection-extra"
                  className="mst-mission-textarea"
                  value={reflectionDraft}
                  onChange={(e) => setReflectionDraft(e.target.value)}
                  disabled={reflectionSaving}
                  placeholder={currentStep.textareaPlaceholder || 'Optional notes…'}
                  maxLength={4000}
                  rows={4}
                />
              </div>
            )}

            {!habitsGoalForm && !storyGoalForm && !(aidTrim && reflectionLinkCtx?.loading) && (
              <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="mission-reflection-main" className="mst-mission-label">
                  {aidTrim && reflectionLinkCtx?.isLocked ? 'Your note (optional)' : 'Your response'}
                </label>
                <textarea
                  id="mission-reflection-main"
                  className="mst-mission-textarea"
                  value={reflectionDraft}
                  onChange={(e) => setReflectionDraft(e.target.value)}
                  disabled={reflectionSaving || (!!aidTrim && reflectionLinkCtx?.loading)}
                  placeholder={currentStep.textareaPlaceholder || 'Write your reflection…'}
                  maxLength={4000}
                  rows={6}
                />
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="mst-mission-nav">
          <button
            type="button"
            className="mst-mission-btn mst-mission-btn--secondary"
            onClick={handleBack}
            disabled={currentStepIndex === 0 && !(currentStep.type === 'CHOICE' && choiceSelectedId)}
          >
            ← Back
          </button>
          <button
            type="button"
            className="mst-mission-btn mst-mission-btn--ghost"
            onClick={() => navigate('/home')}
          >
            Exit
          </button>
          {currentStep.type !== 'BATTLE' && (() => {
            const nextCompletes =
              currentStep.type === 'CHOICE'
                ? !!selectedChoice &&
                  !(
                    selectedChoice.goToStepId &&
                    mission.sequence?.some((s) => s.id === selectedChoice.goToStepId)
                  ) &&
                  isLastStep
                : isLastStep;
            const nextBlocked =
              trainingBlocksNext ||
              reflectionBlocksNext ||
              reflectionSaving ||
              l2BlocksNext ||
              choiceBlocksNext ||
              choiceGrantBusy ||
              chooseManifestBlocksNext ||
              elementalSkillsBlocksNext ||
              skillsMasteryBlocksNext ||
              artifactsBlocksNext ||
              powerCardBlocksNext;
            return (
            <button
              type="button"
              className={`mst-mission-btn ${nextCompletes ? 'mst-mission-btn--complete' : 'mst-mission-btn--primary'}`}
              onClick={() => void handleNext()}
              disabled={nextBlocked}
            >
              {reflectionSaving
                ? 'Saving…'
                : choiceGrantBusy
                  ? 'Claiming…'
                  : currentStep.type === 'CHOICE' && !selectedChoice
                  ? 'Choose an option'
                  : chooseManifestBlocksNext
                    ? 'Choose a manifest'
                    : elementalSkillsBlocksNext
                      ? 'Awaken Elemental Skills'
                      : skillsMasteryBlocksNext
                        ? 'Open Skills & Mastery'
                        : artifactsBlocksNext
                          ? 'Open Artifacts'
                          : powerCardBlocksNext
                            ? 'Open Power Card'
                            : nextCompletes
                              ? 'Complete Mission ✓'
                              : 'Next →'}
            </button>
            );
          })()}
        </div>
        </div>

        <aside className="mst-mission-rail mst-mission-rail--right" aria-hidden="true">
          <div className="mst-mission-rail-mark" />
          <span className="mst-mission-rail-motto">Knowledge is Power. Truth is Freedom.</span>
        </aside>
      </div>

      {pendingRewardChoiceGroups.length > 0 && (
        <div
          className="mst-mission-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mission-reward-choice-title"
        >
          <div className="mst-mission-modal">
            <h2 id="mission-reward-choice-title" style={{ margin: '0 0 0.5rem' }}>
              Choose your rewards
            </h2>
            <p style={{ margin: '0 0 1.25rem', fontSize: '0.95rem' }}>
              This mission includes reward choices. Pick the options you want, then confirm to finish.
            </p>
            {pendingRewardChoiceGroups.map((g) => (
              <div key={g.groupId} style={{ marginBottom: '1.5rem' }}>
                <h3 style={{ margin: '0 0 0.35rem', fontSize: '1.05rem' }}>
                  {g.displayName || 'Reward choice'}
                </h3>
                {g.description ? (
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem' }}>
                    {g.description}
                  </p>
                ) : null}
                <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
                  Pick {g.pickCount} of {g.options.length}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {g.options.map((opt) => {
                    const selected = (rewardChoicePicks[g.groupId] || []).includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        className={`mst-mission-modal-option${selected ? ' is-selected' : ''}`}
                        onClick={() => toggleMissionRewardPick(g.groupId, opt.id, g.pickCount)}
                      >
                        <div style={{ fontWeight: 600 }}>{opt.displayName}</div>
                        <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                          {summarizeMissionBattlePassReward(opt)}
                        </div>
                        {opt.description ? (
                          <div style={{ fontSize: '0.8rem', marginTop: '0.35rem' }}>
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
              className="mst-mission-btn mst-mission-btn--primary mst-mission-btn--block"
              disabled={claimingMissionChoices}
              onClick={() => void handleClaimMissionRewardChoices()}
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

