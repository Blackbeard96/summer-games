/**
 * Mission Sequence Builder Component
 * 
 * Allows admins to build and edit mission sequences: slides, video, battle, training, reflection, choice, choose manifest (Demo), Level 2 Manifest.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MissionSequenceStep, type MissionChoiceOption, type MissionCategory } from '../types/missions';
import type { TrainingQuizSet } from '../types/trainingGrounds';
import { uploadMissionImage, uploadMissionChoiceResultImage, uploadMissionBattleBackground, uploadMissionVideoResumable, uploadMissionPoster, isVideoFile } from '../utils/missionStorage';
import { getAllQuizSets } from '../utils/trainingGroundsService';
import { listAssessmentsForMissionLinking, type AssessmentPickItem } from '../utils/assessmentGoalsFirestore';
import { fetchCpuOpponentsMergedWithDefaults, type CPUOpponent } from '../utils/cpuOpponentsCatalog';
import { getAvailableArtifactsAsync, type ArtifactOption } from '../utils/artifactCompensation';
import { MISSION_STEP_NAVIGATE_OPTIONS } from '../utils/missionStepNavigate';

interface MissionSequenceBuilderProps {
  sequence: MissionSequenceStep[];
  onChange: (sequence: MissionSequenceStep[]) => void;
  missionId?: string; // For uploads (undefined during creation)
  /** When set, only story slides + videos (e.g. CPU awakening animation in admin). */
  variant?: 'mission' | 'cpuAwakeningMedia';
  /** Used to gate Demo-only step types (e.g. Choose Manifest). */
  missionCategory?: MissionCategory;
}

/** All enemy types admins can assign per wave in battle steps. */
const ALL_ENEMY_TYPES = ['ZOMBIE', 'APPRENTICE', 'SOVEREIGN', 'UNVEILED', 'AHINTA_TUMI'] as const;

const ENEMY_TYPE_LABELS: Record<(typeof ALL_ENEMY_TYPES)[number], string> = {
  ZOMBIE: 'ZOMBIE',
  APPRENTICE: 'APPRENTICE',
  SOVEREIGN: 'SOVEREIGN',
  UNVEILED: 'UNVEILED',
  AHINTA_TUMI: 'AHINTA TUMI',
};
type EnemyType = typeof ALL_ENEMY_TYPES[number];

const MissionSequenceBuilder: React.FC<MissionSequenceBuilderProps> = ({
  sequence,
  onChange,
  missionId,
  variant = 'mission',
  missionCategory,
}) => {
  const isMediaOnly = variant === 'cpuAwakeningMedia';
  const isDemoMission = missionCategory === 'DEMO';
  const [editingStep, setEditingStep] = useState<MissionSequenceStep | null>(null);
  const [uploading, setUploading] = useState(false);

  const generateStepId = () => {
    return crypto.randomUUID ? crypto.randomUUID() : `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  const addStorySlide = () => {
    const newStep: MissionSequenceStep = {
      id: generateStepId(),
      type: "STORY_SLIDE",
      order: sequence.length,
      bodyText: '',
      image: {
        url: ''
      }
    };
    onChange([...sequence, newStep]);
    setEditingStep(newStep);
  };

  const addVideo = () => {
    const newStep: MissionSequenceStep = {
      id: generateStepId(),
      type: "VIDEO",
      order: sequence.length,
      video: {
        sourceType: "URL",
        url: '',
        autoplay: false,
        muted: false,
        controls: true
      }
    };
    onChange([...sequence, newStep]);
    setEditingStep(newStep);
  };

  const addBattle = () => {
    const newStep: MissionSequenceStep = {
      id: generateStepId(),
      type: "BATTLE",
      order: sequence.length,
      battle: {
        mode: "ISLAND_RAID",
        difficulty: "MEDIUM",
        enemySet: ["ZOMBIE"],
        waves: 3,
        maxEnemiesPerWave: 4,
        waveConfigs: [
          { enemySet: ["ZOMBIE"], enemyTypeCounts: { ZOMBIE: 1 } },
          { enemySet: ["ZOMBIE"], enemyTypeCounts: { ZOMBIE: 1 } },
          { enemySet: ["ZOMBIE"], enemyTypeCounts: { ZOMBIE: 1 } }
        ],
        rewards: {
          xp: 100,
          pp: 50
        }
      }
    };
    onChange([...sequence, newStep]);
    setEditingStep(newStep);
  };

  const addTrainingAssignment = () => {
    const newStep: MissionSequenceStep = {
      id: generateStepId(),
      type: 'TRAINING_ASSIGNMENT',
      order: sequence.length,
      title: 'Training assignment',
      bodyText: '',
      training: {
        quizSetId: '',
        minimumPassPercent: 70,
      },
    };
    onChange([...sequence, newStep]);
    setEditingStep(newStep);
  };

  const addReflection = () => {
    const newStep: MissionSequenceStep = {
      id: generateStepId(),
      type: 'REFLECTION',
      order: sequence.length,
      title: 'Reflection',
      bodyText: '',
      prompt: 'What will you take away from this step?',
      textareaPlaceholder: 'Write a few sentences…',
      requireResponse: true,
    };
    onChange([...sequence, newStep]);
    setEditingStep(newStep);
  };

  const makeChoiceOption = (label: string, resultBody: string): MissionChoiceOption => ({
    id: generateStepId(),
    label,
    description: '',
    result: { title: '', bodyText: resultBody },
  });

  const addChoice = () => {
    const newStep: MissionSequenceStep = {
      id: generateStepId(),
      type: 'CHOICE',
      order: sequence.length,
      title: 'Choice',
      bodyText: '',
      prompt: 'What do you do?',
      choices: [
        makeChoiceOption('Option A', 'Describe what happens if they pick Option A.'),
        makeChoiceOption('Option B', 'Describe what happens if they pick Option B.'),
      ],
    };
    onChange([...sequence, newStep]);
    setEditingStep(newStep);
  };

  const addChooseManifest = () => {
    const newStep: MissionSequenceStep = {
      id: generateStepId(),
      type: 'CHOOSE_MANIFEST',
      order: sequence.length,
      title: 'Choose Your Manifest',
      bodyText:
        'In the Nine Knowings Universe, ordinary skills become extraordinary through mastery, intent, and will. Pick the path that resonates with you.',
      prompt: 'Select the manifest that resonates with your inner truth.',
      requireSelection: true,
      allowReselect: true,
    };
    onChange([...sequence, newStep]);
    setEditingStep(newStep);
  };

  const addLevel2Manifest = () => {
    const newStep: MissionSequenceStep = {
      id: generateStepId(),
      type: 'LEVEL2_MANIFEST',
      order: sequence.length,
      title: 'Level 2 Manifest — Meta State',
      description:
        'Flow State / Metacognition: build your first Level 2 Manifest skill (single-target, Live Events only).',
      sonidoDialogue:
        'Student — when your mind watches itself in the heat of a Live Event, your Manifest can touch another. Let me guide you.',
      requireMetaStateFirst: false,
      autoUnlockBuilderOnEntry: true,
      requireSkillCreation: true,
      requireSkillEquip: false,
    };
    onChange([...sequence, newStep]);
    setEditingStep(newStep);
  };

  const addSkillsMastery = () => {
    const newStep: MissionSequenceStep = {
      id: generateStepId(),
      type: 'SKILLS_MASTERY',
      order: sequence.length,
      title: 'Skills & Mastery',
      captions: [
        'Open Skills & Mastery to review your Manifest moves, spend PP to level skills, and equip your loadout.',
      ],
      grantPP: 100,
      requireVisit: true,
    };
    onChange([...sequence, newStep]);
    setEditingStep(newStep);
  };

  const addArtifacts = () => {
    const newStep: MissionSequenceStep = {
      id: generateStepId(),
      type: 'ARTIFACTS',
      order: sequence.length,
      title: 'Artifacts',
      captions: [
        'Open your Artifacts menu to equip gear, upgrade items, and set your loadout. Return here when you are ready to continue.',
      ],
      grantPP: 0,
      requireVisit: true,
    };
    onChange([...sequence, newStep]);
    setEditingStep(newStep);
  };

  const addElementalSkills = () => {
    const newStep: MissionSequenceStep = {
      id: generateStepId(),
      type: 'ELEMENTAL_SKILLS',
      order: sequence.length,
      title: 'Awaken Elemental Skills',
      bodyText:
        'The Elemental Ring answers to your nature. Choose Fire, Water, Earth, or Air to unlock your Level 1 elemental skills for battle.',
      prompt: 'Which element most aligns with your nature?',
      requireSelection: true,
      allowReselect: false,
    };
    onChange([...sequence, newStep]);
    setEditingStep(newStep);
  };

  const addPowerCard = () => {
    const newStep: MissionSequenceStep = {
      id: generateStepId(),
      type: 'POWER_CARD',
      order: sequence.length,
      title: 'Power Card',
      captions: [
        'Open your Power Card on Profile to review your stats, customize your card, and check your journey progress. Return here when you are ready to continue.',
      ],
      grantPP: 0,
      requireVisit: true,
    };
    onChange([...sequence, newStep]);
    setEditingStep(newStep);
  };

  const deleteStep = (stepId: string) => {
    const newSequence = sequence.filter(s => s.id !== stepId).map((s, idx) => ({ ...s, order: idx }));
    onChange(newSequence);
    if (editingStep?.id === stepId) {
      setEditingStep(null);
    }
  };

  const moveStep = (stepId: string, direction: 'up' | 'down') => {
    const index = sequence.findIndex(s => s.id === stepId);
    if (index === -1) return;
    
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sequence.length) return;
    
    const newSequence = [...sequence];
    [newSequence[index], newSequence[newIndex]] = [newSequence[newIndex], newSequence[index]];
    const normalized = newSequence.map((s, idx) => ({ ...s, order: idx }));
    onChange(normalized);
  };

  const updateStep = (updatedStep: MissionSequenceStep) => {
    const newSequence = sequence.map(s => s.id === updatedStep.id ? updatedStep : s);
    onChange(newSequence);
    setEditingStep(null);
  };

  /** Push step changes (e.g. Storage URL after upload) into parent sequence immediately so React Strict Mode remounts and re-renders do not wipe local-only editor state. */
  const persistStepDraftToParent = useCallback(
    (updated: MissionSequenceStep) => {
      const newSequence = sequence.map((s) => (s.id === updated.id ? updated : s));
      onChange(newSequence);
      setEditingStep(updated);
    },
    [sequence, onChange]
  );

  const getStepSummary = (step: MissionSequenceStep): string => {
    switch (step.type) {
      case "STORY_SLIDE":
        return step.bodyText.substring(0, 60) || step.title || "Story Slide";
      case "VIDEO":
        return step.bodyText?.substring(0, 60) || step.title || `Video (${step.video.sourceType})`;
      case "BATTLE": {
        const wc = step.battle.waveConfigs;
        const bkg = step.battle.backgroundImage?.url ? ' · 🖼 bg' : '';
        if (!wc?.length) {
          return (
            step.bodyText?.substring(0, 60) ||
            step.title ||
            `Battle: ${step.battle.difficulty} – ${step.battle.waves || 3} waves, ${step.battle.enemySet.join(', ')}${bkg}`
          );
        }
        type W = (typeof wc)[number];
        const part = (w: W) => {
          const cpu =
            (w.opponentIds || [])
              .map((id: string) => `${w.opponentCounts?.[id] ?? 1}×${id}`)
              .join(',') || '';
          const leg =
            (w.enemySet || [])
              .map((t: 'ZOMBIE' | 'APPRENTICE' | 'SOVEREIGN' | 'UNVEILED' | 'AHINTA_TUMI') => `${w.enemyTypeCounts?.[t] ?? 1}×${t}`)
              .join(',') || '';
          return [cpu && `CPU:${cpu}`, leg].filter(Boolean).join(' ') || '—';
        };
        const waveSummary = wc.map((w, i) => `W${i + 1}: ${part(w)}`).join(' · ');
        return step.bodyText?.substring(0, 60) || step.title || `Battle: ${step.battle.difficulty} – ${waveSummary}${bkg}`;
      }
      case "TRAINING_ASSIGNMENT": {
        const min = step.training.minimumPassPercent;
        const req = min <= 0 ? 'any completed attempt' : `${min}%+`;
        return (
          step.bodyText?.substring(0, 60) ||
          step.title ||
          `Quiz ${step.training.quizSetId || '(not set)'} — pass: ${req}`
        );
      }
      case "REFLECTION":
        return (
          step.prompt.substring(0, 60) ||
          step.title ||
          (step.linkedAssessmentId ? 'Reflection (linked goal)' : 'Reflection')
        );
      case "LEVEL2_MANIFEST":
        return (
          step.description?.substring(0, 60) ||
          step.sonidoDialogue?.substring(0, 60) ||
          step.title ||
          'Level 2 Manifest'
        );
      case "CHOICE":
        return (
          step.prompt.substring(0, 60) ||
          step.title ||
          `Choice (${step.choices.length} options)`
        );
      case "CHOOSE_MANIFEST":
        return (
          step.prompt?.substring(0, 60) ||
          step.bodyText?.substring(0, 60) ||
          step.title ||
          'Choose Manifest'
        );
      case "SKILLS_MASTERY": {
        const cap = step.captions?.find((c) => c.trim())?.substring(0, 50) || '';
        const pp = Math.max(0, Math.floor(Number(step.grantPP) || 0));
        return (
          cap ||
          step.title ||
          `Skills & Mastery${pp > 0 ? ` (+${pp} PP)` : ''}`
        );
      }
      case "ARTIFACTS": {
        const cap = step.captions?.find((c) => c.trim())?.substring(0, 50) || '';
        const pp = Math.max(0, Math.floor(Number(step.grantPP) || 0));
        return (
          cap ||
          step.title ||
          `Artifacts${pp > 0 ? ` (+${pp} PP)` : ''}`
        );
      }
      case "ELEMENTAL_SKILLS":
        return (
          step.prompt?.substring(0, 60) ||
          step.bodyText?.substring(0, 60) ||
          step.title ||
          'Awaken Elemental Skills'
        );
      case "POWER_CARD": {
        const cap = step.captions?.find((c) => c.trim())?.substring(0, 50) || '';
        const pp = Math.max(0, Math.floor(Number(step.grantPP) || 0));
        return (
          cap ||
          step.title ||
          `Power Card${pp > 0 ? ` (+${pp} PP)` : ''}`
        );
      }
      default: {
        const _exhaustive: never = step;
        return _exhaustive;
      }
    }
  };

  const getStepBadge = (type: MissionSequenceStep['type']): string => {
    switch (type) {
      case "STORY_SLIDE": return "📖 Slide";
      case "VIDEO": return "🎥 Video";
      case "BATTLE": return "⚔️ Battle";
      case "TRAINING_ASSIGNMENT": return "🎓 Training";
      case "REFLECTION": return "💭 Reflection";
      case "LEVEL2_MANIFEST": return "🜂 L2 Manifest";
      case "CHOICE": return "🔀 Choice";
      case "CHOOSE_MANIFEST": return "✨ Choose Manifest";
      case "SKILLS_MASTERY": return "🎯 Skills & Mastery";
      case "ARTIFACTS": return "💎 Artifacts";
      case "ELEMENTAL_SKILLS": return "🔥 Elemental Skills";
      case "POWER_CARD": return "🃏 Power Card";
    }
  };

  return (
    <div style={{ marginTop: isMediaOnly ? 0 : '2rem', padding: '1.5rem', background: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>
          {isMediaOnly ? 'Awakening animation sequence' : 'Mission Story Sequence'}
        </h3>
        <p style={{ margin: '0.5rem 0 0.75rem', fontSize: '0.8125rem', color: '#64748b', lineHeight: 1.5, maxWidth: '52rem' }}>
          {isMediaOnly
            ? 'Add story slides (image + caption) and/or videos in order. Players see this full-screen when the CPU awakens in battle, then combat resumes.'
            : 'Build the order players experience. Add slides, combat, quizzes, reflection — and for Season 1 Meta skills, use the Level 2 Manifest block below.'}
        </p>

        {!isMediaOnly && (
          <>
        {/* Full-width CTA so the L2 step is never clipped or missed in narrow modals */}
        <div
          style={{
            marginBottom: '1rem',
            padding: '1rem 1.1rem',
            background: 'linear-gradient(145deg, #fffbeb 0%, #fef3c7 55%, #fde68a 100%)',
            border: '2px solid #d97706',
            borderRadius: '0.75rem',
            boxShadow: '0 2px 8px rgba(180, 83, 9, 0.12)',
          }}
        >
          <div style={{ fontWeight: 800, color: '#92400e', marginBottom: '0.35rem', fontSize: '0.95rem', letterSpacing: '0.02em' }}>
            🜂 Level 2 Manifest — player skill builder
          </div>
          <p style={{ margin: '0 0 0.85rem', fontSize: '0.8125rem', color: '#78350f', lineHeight: 1.45 }}>
            Inserts a mission step that sends players to the <strong>Level 2 Manifest Skill Builder</strong> (dropdowns, Live Event–only Meta skill).
            They save their skill and return to finish the mission. Ideal for Sonido / Flow State rollout.
          </p>
          <button
            type="button"
            data-testid="mission-add-level2-manifest"
            onClick={addLevel2Manifest}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '0.85rem 1rem',
              background: 'linear-gradient(180deg, #ea580c 0%, #c2410c 100%)',
              color: 'white',
              border: '1px solid #9a3412',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 800,
              letterSpacing: '0.03em',
              textShadow: '0 1px 0 rgba(0,0,0,0.2)',
            }}
            title="Adds a LEVEL2_MANIFEST step; Mission Runner opens the builder for players."
          >
            + Add Level 2 Manifest step to sequence
          </button>
        </div>
          </>
        )}

        <div
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#64748b',
            marginBottom: '0.5rem',
          }}
        >
          {isMediaOnly ? 'Scenes' : 'Other step types'}
        </div>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={addStorySlide}
            style={{
              padding: '0.5rem 1rem',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            + Add Story Slide
          </button>
          <button
            type="button"
            onClick={addVideo}
            style={{
              padding: '0.5rem 1rem',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            + Add Video
          </button>
          {!isMediaOnly && (
            <>
          <button
            type="button"
            onClick={addBattle}
            style={{
              padding: '0.5rem 1rem',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            + Add Battle
          </button>
          <button
            type="button"
            onClick={addTrainingAssignment}
            style={{
              padding: '0.5rem 1rem',
              background: '#7c3aed',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}
          >
            + Add Training Assignment
          </button>
          <button
            type="button"
            onClick={addReflection}
            style={{
              padding: '0.5rem 1rem',
              background: '#0d9488',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
            }}
          >
            + Add Reflection
          </button>
          <button
            type="button"
            onClick={addChoice}
            style={{
              padding: '0.5rem 1rem',
              background: '#db2777',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
            }}
          >
            + Add Choice
          </button>
          <button
            type="button"
            onClick={addSkillsMastery}
            title="Sends players to Battle Arena → Skills & Mastery; optional PP grant + captions"
            style={{
              padding: '0.5rem 1rem',
              background: 'linear-gradient(135deg, #2563eb 0%, #0f766e 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
            }}
          >
            + Add Skills & Mastery
          </button>
          <button
            type="button"
            onClick={addArtifacts}
            title="Sends players to Artifacts to equip/edit gear, then return to the mission"
            style={{
              padding: '0.5rem 1rem',
              background: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '500',
            }}
          >
            + Add Artifacts
          </button>
          <button
            type="button"
            onClick={addElementalSkills}
            title="Players choose Fire / Water / Earth / Air to awaken Level 1 elemental skills"
            style={{
              padding: '0.5rem 1rem',
              background: 'linear-gradient(135deg, #ea580c 0%, #0284c7 55%, #65a30d 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
            }}
          >
            + Add Elemental Skills
          </button>
          <button
            type="button"
            onClick={addPowerCard}
            title="Sends players to Profile / Power Card, then return to the mission"
            style={{
              padding: '0.5rem 1rem',
              background: 'linear-gradient(135deg, #1d4ed8 0%, #4f46e5 55%, #7c3aed 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: '600',
            }}
          >
            + Add Power Card
          </button>
          {isDemoMission && (
            <button
              type="button"
              onClick={addChooseManifest}
              title="Demo Missions only — opens the real Choose Manifest experience for new players"
              style={{
                padding: '0.5rem 1rem',
                background: 'linear-gradient(135deg, #d97706 0%, #7c3aed 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '600',
              }}
            >
              + Add Choose Manifest
            </button>
          )}
            </>
          )}
        </div>
      </div>

      {sequence.length === 0 ? (
        <p style={{ color: '#6b7280', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>
          {isMediaOnly
            ? 'No awakening scenes yet. Add a story slide or video.'
            : 'No sequence steps yet. Add steps to create a playable mission sequence.'}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {sequence.map((step, index) => (
            isMediaOnly && step.type !== 'STORY_SLIDE' && step.type !== 'VIDEO' ? (
              <div
                key={step.id}
                style={{
                  padding: '1rem',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                }}
              >
                <span style={{ color: '#991b1b', fontSize: '0.875rem' }}>
                  Unsupported step type ({(step as { type?: string }).type}) — remove and use only slides or videos.
                </span>
                <button
                  type="button"
                  onClick={() => deleteStep(step.id)}
                  style={{
                    padding: '0.35rem 0.65rem',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}
                >
                  Remove
                </button>
              </div>
            ) : (
            <div
              key={step.id}
              style={{
                padding: '1rem',
                background: 'white',
                border: '1px solid #d1d5db',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: '60px' }}>
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>#{index + 1}</span>
                <span style={{
                  padding: '0.25rem 0.5rem',
                  background:
                    step.type === 'STORY_SLIDE'
                      ? '#dbeafe'
                      : step.type === 'VIDEO'
                        ? '#d1fae5'
                        : step.type === 'BATTLE'
                          ? '#fee2e2'
                          : step.type === 'TRAINING_ASSIGNMENT'
                            ? '#ede9fe'
                            : step.type === 'LEVEL2_MANIFEST'
                              ? '#ffedd5'
                              : step.type === 'CHOICE'
                                ? '#fce7f3'
                                : step.type === 'CHOOSE_MANIFEST'
                                  ? '#ede9fe'
                                  : step.type === 'SKILLS_MASTERY'
                                    ? '#dbeafe'
                                    : step.type === 'ARTIFACTS'
                                      ? '#f3e8ff'
                                      : step.type === 'ELEMENTAL_SKILLS'
                                        ? '#ffedd5'
                                        : step.type === 'POWER_CARD'
                                          ? '#dbeafe'
                                          : '#ccfbf1',
                  color:
                    step.type === 'STORY_SLIDE'
                      ? '#1e40af'
                      : step.type === 'VIDEO'
                        ? '#065f46'
                        : step.type === 'BATTLE'
                          ? '#991b1b'
                          : step.type === 'TRAINING_ASSIGNMENT'
                            ? '#5b21b6'
                            : step.type === 'LEVEL2_MANIFEST'
                              ? '#9a3412'
                              : step.type === 'CHOICE'
                                ? '#9d174d'
                                : step.type === 'CHOOSE_MANIFEST'
                                  ? '#5b21b6'
                                  : step.type === 'SKILLS_MASTERY'
                                    ? '#1e40af'
                                    : step.type === 'ARTIFACTS'
                                      ? '#6b21a8'
                                      : step.type === 'ELEMENTAL_SKILLS'
                                        ? '#c2410c'
                                        : step.type === 'POWER_CARD'
                                          ? '#1e40af'
                                          : '#0f766e',
                  borderRadius: '0.25rem',
                  fontSize: '0.75rem',
                  fontWeight: 'bold'
                }}>
                  {getStepBadge(step.type)}
                </span>
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                  {step.title || `Step ${index + 1}`}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {getStepSummary(step)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => moveStep(step.id, 'up')}
                  disabled={index === 0}
                  style={{
                    padding: '0.375rem',
                    background: index === 0 ? '#e5e7eb' : '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.25rem',
                    cursor: index === 0 ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveStep(step.id, 'down')}
                  disabled={index === sequence.length - 1}
                  style={{
                    padding: '0.375rem',
                    background: index === sequence.length - 1 ? '#e5e7eb' : '#f3f4f6',
                    border: '1px solid #d1d5db',
                    borderRadius: '0.25rem',
                    cursor: index === sequence.length - 1 ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setEditingStep(step)}
                  style={{
                    padding: '0.375rem 0.75rem',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Delete this step?')) {
                      deleteStep(step.id);
                    }
                  }}
                  style={{
                    padding: '0.375rem 0.75rem',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.25rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
            )
          ))}
        </div>
      )}

      {/* Step Editor Modal */}
      {editingStep && (
        <StepEditorModal
          step={editingStep}
          allSteps={sequence}
          onSave={updateStep}
          onCancel={() => setEditingStep(null)}
          onDraftPersist={persistStepDraftToParent}
          uploading={uploading}
          setUploading={setUploading}
          missionId={missionId}
          variant={variant}
        />
      )}
    </div>
  );
};

interface StepEditorModalProps {
  step: MissionSequenceStep;
  /** Full mission sequence — used for Choice branch targets. */
  allSteps: MissionSequenceStep[];
  onSave: (step: MissionSequenceStep) => void;
  onCancel: () => void;
  /** Merge this step into the mission sequence + keep modal open (used after Storage uploads). */
  onDraftPersist: (step: MissionSequenceStep) => void;
  uploading: boolean;
  setUploading: (uploading: boolean) => void;
  missionId?: string;
  variant?: 'mission' | 'cpuAwakeningMedia';
}

const StepEditorModal: React.FC<StepEditorModalProps> = ({
  step,
  allSteps,
  onSave,
  onCancel,
  onDraftPersist,
  uploading,
  setUploading,
  missionId,
  variant = 'mission',
}) => {
  const isMediaOnly = variant === 'cpuAwakeningMedia';
  const [editedStep, setEditedStep] = useState<MissionSequenceStep>(step);
  const editedStepRef = useRef(editedStep);
  editedStepRef.current = editedStep;
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [artifactOptions, setArtifactOptions] = useState<ArtifactOption[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [quizOptions, setQuizOptions] = useState<TrainingQuizSet[]>([]);
  const [assessmentPickList, setAssessmentPickList] = useState<AssessmentPickItem[]>([]);
  const [cpuOpponentCatalog, setCpuOpponentCatalog] = useState<CPUOpponent[]>([]);
  const [cpuOpponentsLoading, setCpuOpponentsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setArtifactsLoading(true);
    getAvailableArtifactsAsync()
      .then((opts) => {
        if (!cancelled) setArtifactOptions(opts);
      })
      .finally(() => {
        if (!cancelled) setArtifactsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (step.type !== 'TRAINING_ASSIGNMENT') return;
    let cancelled = false;
    getAllQuizSets(true)
      .then((list) => {
        if (!cancelled) setQuizOptions(list);
      })
      .catch(() => {
        if (!cancelled) setQuizOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [step.type]);

  useEffect(() => {
    if (step.type !== 'REFLECTION') return;
    let cancelled = false;
    listAssessmentsForMissionLinking()
      .then((list) => {
        if (!cancelled) setAssessmentPickList(list);
      })
      .catch(() => {
        if (!cancelled) setAssessmentPickList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [step.type]);

  useEffect(() => {
    if (step.type !== 'BATTLE') return;
    let cancelled = false;
    setCpuOpponentsLoading(true);
    fetchCpuOpponentsMergedWithDefaults()
      .then((list) => {
        if (!cancelled) setCpuOpponentCatalog(list);
      })
      .catch(() => {
        if (!cancelled) setCpuOpponentCatalog([]);
      })
      .finally(() => {
        if (!cancelled) setCpuOpponentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step.type, step.id]);

  // Keep editedStep in sync when step prop changes (e.g. parent re-render)
  useEffect(() => {
    setEditedStep(step);
    setUploadError(null);
    setUploadProgress(0);
  }, [step.id]);

  // Type guards
  const isStorySlide = (s: MissionSequenceStep): s is Extract<MissionSequenceStep, { type: 'STORY_SLIDE' }> => {
    return s.type === 'STORY_SLIDE';
  };
  
  const isVideo = (s: MissionSequenceStep): s is Extract<MissionSequenceStep, { type: 'VIDEO' }> => {
    return s.type === 'VIDEO';
  };
  
  const isBattle = (s: MissionSequenceStep): s is Extract<MissionSequenceStep, { type: 'BATTLE' }> => {
    return s.type === 'BATTLE';
  };

  const isTrainingAssignment = (s: MissionSequenceStep): s is Extract<MissionSequenceStep, { type: 'TRAINING_ASSIGNMENT' }> => {
    return s.type === 'TRAINING_ASSIGNMENT';
  };

  const isReflection = (s: MissionSequenceStep): s is Extract<MissionSequenceStep, { type: 'REFLECTION' }> => {
    return s.type === 'REFLECTION';
  };

  const isLevel2Manifest = (s: MissionSequenceStep): s is Extract<MissionSequenceStep, { type: 'LEVEL2_MANIFEST' }> => {
    return s.type === 'LEVEL2_MANIFEST';
  };

  const isChoice = (s: MissionSequenceStep): s is Extract<MissionSequenceStep, { type: 'CHOICE' }> => {
    return s.type === 'CHOICE';
  };

  const isChooseManifest = (s: MissionSequenceStep): s is Extract<MissionSequenceStep, { type: 'CHOOSE_MANIFEST' }> => {
    return s.type === 'CHOOSE_MANIFEST';
  };

  const isSkillsMastery = (s: MissionSequenceStep): s is Extract<MissionSequenceStep, { type: 'SKILLS_MASTERY' }> => {
    return s.type === 'SKILLS_MASTERY';
  };

  const isArtifacts = (s: MissionSequenceStep): s is Extract<MissionSequenceStep, { type: 'ARTIFACTS' }> => {
    return s.type === 'ARTIFACTS';
  };

  const isElementalSkills = (s: MissionSequenceStep): s is Extract<MissionSequenceStep, { type: 'ELEMENTAL_SKILLS' }> => {
    return s.type === 'ELEMENTAL_SKILLS';
  };

  const isPowerCard = (s: MissionSequenceStep): s is Extract<MissionSequenceStep, { type: 'POWER_CARD' }> => {
    return s.type === 'POWER_CARD';
  };

  const artifactSelectChoices = useMemo(() => {
    const base: ArtifactOption[] = [...artifactOptions];
    const seen = new Set(base.map((a) => a.id));
    if (editedStep.type === 'BATTLE') {
      for (const d of editedStep.battle.rewards.drops || []) {
        if (d.type !== 'ARTIFACT' || !d.refId?.trim() || seen.has(d.refId)) continue;
        seen.add(d.refId);
        base.push({
          id: d.refId,
          name: `${d.refId} (not in loaded catalog)`,
          description: '',
          icon: '❔',
          image: '',
          category: 'unknown',
          rarity: 'common',
          source: 'static',
        });
      }
    }
    if (editedStep.type === 'CHOICE') {
      for (const c of editedStep.choices || []) {
        for (const id of c.result?.grantArtifactIds || []) {
          if (!id?.trim() || seen.has(id)) continue;
          seen.add(id);
          base.push({
            id,
            name: `${id} (not in loaded catalog)`,
            description: '',
            icon: '❔',
            image: '',
            category: 'unknown',
            rarity: 'common',
            source: 'static',
          });
        }
      }
    }
    base.sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: 'base' }));
    return base;
  }, [artifactOptions, editedStep]);

  const handleImageUpload = async (file: File) => {
    if (!missionId) {
      alert('Please save the mission first before uploading images.');
      return;
    }
    setUploading(true);
    try {
      const { url, storagePath } = await uploadMissionImage(missionId, step.id, file);
      const prev = editedStepRef.current;
      if (isStorySlide(prev)) {
        const next = {
          ...prev,
          image: {
            ...prev.image,
            url,
            storagePath,
          },
        };
        setEditedStep(next);
        editedStepRef.current = next;
        onDraftPersist(next);
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleChoiceResultImageUpload = async (choiceId: string, file: File) => {
    if (!missionId) {
      alert('Please save the mission first before uploading images.');
      return;
    }
    setUploading(true);
    try {
      const { url, storagePath } = await uploadMissionChoiceResultImage(
        missionId,
        step.id,
        choiceId,
        file
      );
      const prev = editedStepRef.current;
      if (!isChoice(prev)) return;
      const next: Extract<MissionSequenceStep, { type: 'CHOICE' }> = {
        ...prev,
        choices: prev.choices.map((c) =>
          c.id === choiceId
            ? {
                ...c,
                result: {
                  ...c.result,
                  imageUrl: url,
                  imageStoragePath: storagePath,
                },
              }
            : c
        ),
      };
      setEditedStep(next);
      editedStepRef.current = next;
      onDraftPersist(next);
    } catch (error) {
      console.error('Error uploading choice result image:', error);
      const message = error instanceof Error ? error.message : 'Failed to upload image';
      alert(message);
    } finally {
      setUploading(false);
    }
  };

  const handleBattleBackgroundUpload = async (file: File) => {
    if (!missionId) {
      alert('Please save the mission first before uploading images.');
      return;
    }
    setUploading(true);
    try {
      const { url, storagePath } = await uploadMissionBattleBackground(missionId, step.id, file);
      const prev = editedStepRef.current;
      if (!isBattle(prev)) return;
      const next: Extract<MissionSequenceStep, { type: 'BATTLE' }> = {
        ...prev,
        battle: {
          ...prev.battle,
          backgroundImage: {
            url,
            storagePath,
            alt: prev.battle.backgroundImage?.alt,
          },
        },
      };
      setEditedStep(next);
      editedStepRef.current = next;
      onDraftPersist(next);
    } catch (error) {
      console.error('Error uploading battle background:', error);
      alert(error instanceof Error ? error.message : 'Failed to upload background image');
    } finally {
      setUploading(false);
    }
  };

  const handleVideoUpload = async (file: File) => {
    const effectiveMissionId = typeof missionId === 'string' ? missionId.trim() : '';
    if (!effectiveMissionId) {
      setUploadError('Save the mission first to enable uploads.');
      return;
    }
    if (!file || file.size === 0) {
      setUploadError('No file selected or file is empty.');
      return;
    }
    if (!isVideoFile(file)) {
      setUploadError('Please select a video file (.mp4, .webm, or .mov).');
      return;
    }
    setUploadError(null);
    setUploadProgress(0);
    setUploading(true);
    try {
      console.log('[MissionSequenceBuilder] Video upload start', { name: file.name, size: file.size, stepId: step.id, missionId: effectiveMissionId });
      const { url, storagePath } = await uploadMissionVideoResumable(
        effectiveMissionId,
        step.id,
        file,
        (percent) => setUploadProgress(percent)
      );
      console.log('[MissionSequenceBuilder] Video upload complete', { url: url?.substring(0, 50), storagePath });
      const prev = editedStepRef.current;
      if (prev.type === 'VIDEO') {
        const next = {
          ...prev,
          video: {
            ...prev.video,
            url,
            storagePath,
            sourceType: 'UPLOAD' as const,
          },
        };
        setEditedStep(next);
        editedStepRef.current = next;
        onDraftPersist(next);
      }
      setSelectedFileName(null);
      setUploadProgress(100);
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      const message = err?.message || (error instanceof Error ? error.message : 'Upload failed');
      const code = err?.code ? ` (${err.code})` : '';
      console.error('[MissionSequenceBuilder] Video upload failed:', error);
      setUploadError(`${message}${code}`);
      if (typeof alert !== 'undefined') alert(`Video upload failed: ${message}${code}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handlePosterUpload = async (file: File) => {
    if (!missionId) {
      alert('Please save the mission first before uploading poster.');
      return;
    }
    setUploading(true);
    try {
      const { url, storagePath } = await uploadMissionPoster(missionId, step.id, file);
      const prev = editedStepRef.current;
      if (isVideo(prev)) {
        const next = {
          ...prev,
          video: {
            ...prev.video,
            posterUrl: url,
          },
        };
        setEditedStep(next);
        editedStepRef.current = next;
        onDraftPersist(next);
      }
    } catch (error) {
      console.error('Error uploading poster:', error);
      alert('Failed to upload poster');
    } finally {
      setUploading(false);
    }
  };

  if (step.type === 'STORY_SLIDE' && isStorySlide(editedStep)) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20000,
        padding: '2rem'
      }} onClick={onCancel}>
        <div style={{
          background: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto'
        }} onClick={(e) => e.stopPropagation()}>
          <h3 style={{ marginBottom: '1.5rem' }}>Edit Story Slide</h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Title (optional)</label>
            <input
              type="text"
              value={editedStep.title || ''}
              onChange={(e) => setEditedStep({ ...editedStep, title: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Image</label>
            {missionId ? (
              <>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                    e.target.value = '';
                  }}
                  disabled={uploading}
                  style={{ marginBottom: '0.5rem' }}
                />
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                  Browsers clear the file picker after upload — use the preview below to confirm the image is saved.
                </p>
                {isStorySlide(editedStep) && editedStep.image.url && (
                  <img src={editedStep.image.url} alt={editedStep.image.alt} style={{ maxWidth: '100%', maxHeight: '200px', marginBottom: '0.5rem' }} />
                )}
              </>
            ) : (
              <div style={{ padding: '1rem', background: '#fef3c7', borderRadius: '0.5rem', marginBottom: '0.5rem' }}>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#92400e' }}>
                  Save the mission first to enable image uploads.
                </p>
                <label style={{ display: 'block', marginTop: '0.5rem', fontWeight: 'bold' }}>Image URL (temporary)</label>
                <input
                  type="text"
                  value={isStorySlide(editedStep) ? editedStep.image.url : ''}
                  onChange={(e) => {
                    if (isStorySlide(editedStep)) {
                      setEditedStep({
                        ...editedStep,
                        image: { ...editedStep.image, url: e.target.value }
                      });
                    }
                  }}
                  placeholder="https://..."
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                />
              </div>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Caption Text *</label>
            <textarea
              value={editedStep.bodyText}
              onChange={(e) => setEditedStep({ ...editedStep, bodyText: e.target.value })}
              required
              rows={4}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          {!isMediaOnly && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                After player taps Continue (optional)
              </label>
              <select
                value={editedStep.navigateTo ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditedStep({
                    ...editedStep,
                    navigateTo: v ? v : undefined,
                  });
                }}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
              >
                {MISSION_STEP_NAVIGATE_OPTIONS.map((o) => (
                  <option key={o.path || 'none'} value={o.path}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                Opens that page after advancing the mission. Progress is saved so they can return here and continue.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => onSave(editedStep)}
              disabled={!isStorySlide(editedStep) || !editedStep.bodyText || !editedStep.image.url || uploading}
              style={{
                padding: '0.75rem 1.5rem',
                background: uploading || !isStorySlide(editedStep) || !editedStep.bodyText || !editedStep.image.url ? '#9ca3af' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: uploading || !isStorySlide(editedStep) || !editedStep.bodyText || !editedStep.image.url ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              {uploading ? 'Uploading...' : 'Save Step'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'VIDEO' && isVideo(editedStep)) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20000,
        padding: '2rem'
      }} onClick={onCancel}>
        <div style={{
          background: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto'
        }} onClick={(e) => e.stopPropagation()}>
          <h3 style={{ marginBottom: '1.5rem' }}>Edit Video Step</h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Title (optional)</label>
            <input
              type="text"
              value={editedStep.title || ''}
              onChange={(e) => setEditedStep({ ...editedStep, title: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Source Type</label>
            <select
              value={isVideo(editedStep) ? editedStep.video.sourceType : 'URL'}
              onChange={(e) => {
                if (isVideo(editedStep)) {
                  setEditedStep({
                    ...editedStep,
                    video: { ...editedStep.video, sourceType: e.target.value as "URL" | "UPLOAD" }
                  });
                }
              }}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            >
              <option value="URL">URL</option>
              <option value="UPLOAD">Upload</option>
            </select>
          </div>

          {isVideo(editedStep) && editedStep.video.sourceType === 'UPLOAD' ? (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Video File (MP4, WebM, MOV)</label>
              {missionId ? (
                <>
                  {uploadError && (
                    <div style={{ padding: '0.75rem', marginBottom: '0.5rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.5rem', color: '#991b1b', fontSize: '0.875rem' }}>
                      {uploadError}
                      <button type="button" onClick={() => setUploadError(null)} style={{ marginLeft: '0.5rem', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b' }}>Dismiss</button>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="video/mp4,.mp4,video/webm,.webm,video/quicktime,.mov,video/*"
                    onChange={(e) => {
                      const input = e.target;
                      const file = input.files?.[0];
                      console.log('[MissionSequenceBuilder] File selected', file ? { name: file.name, size: file.size, type: file.type } : 'none');
                      if (!file) {
                        setSelectedFileName(null);
                        return;
                      }
                      setSelectedFileName(file.name);
                      handleVideoUpload(file);
                      input.value = '';
                    }}
                    disabled={uploading}
                    style={{ marginBottom: '0.5rem' }}
                  />
                  {selectedFileName && isVideo(editedStep) && !editedStep.video.url && (
                    <div style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                      Selected: {selectedFileName} {uploading ? '(uploading…)' : ''}
                    </div>
                  )}
                  {uploading && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <div style={{ height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${uploadProgress}%`, background: '#10b981', transition: 'width 0.2s' }} />
                      </div>
                      <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>{uploadProgress}%</span>
                    </div>
                  )}
                  {isVideo(editedStep) && editedStep.video.url && !uploading && (
                    <>
                      <div style={{ fontSize: '0.875rem', color: '#059669', marginBottom: '0.25rem' }}>Uploaded</div>
                      <video src={editedStep.video.url} controls style={{ maxWidth: '100%', maxHeight: '200px', marginBottom: '0.5rem' }} />
                    </>
                  )}
                </>
              ) : (
                <div style={{ padding: '1rem', background: '#fef3c7', borderRadius: '0.5rem' }}>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#92400e' }}>
                    Preparing uploads… If this doesn’t update, save the mission first to enable video uploads.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Video URL *</label>
              <input
                type="text"
                value={isVideo(editedStep) ? editedStep.video.url : ''}
                onChange={(e) => {
                  if (isVideo(editedStep)) {
                    setEditedStep({
                      ...editedStep,
                      video: { ...editedStep.video, url: e.target.value }
                    });
                  }
                }}
                required
                placeholder="https://..."
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
              />
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Poster Image (optional)</label>
            {missionId ? (
              <>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handlePosterUpload(file);
                  }}
                  disabled={uploading}
                  style={{ marginBottom: '0.5rem' }}
                />
                {isVideo(editedStep) && editedStep.video.posterUrl && (
                  <img src={editedStep.video.posterUrl} alt="Poster" style={{ maxWidth: '100%', maxHeight: '150px' }} />
                )}
              </>
            ) : (
              <div style={{ padding: '1rem', background: '#fef3c7', borderRadius: '0.5rem', marginBottom: '0.5rem' }}>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#92400e' }}>
                  Save the mission first to enable poster uploads.
                </p>
                <label style={{ display: 'block', marginTop: '0.5rem', fontWeight: 'bold' }}>Poster URL (temporary)</label>
                <input
                  type="text"
                  value={isVideo(editedStep) ? (editedStep.video.posterUrl || '') : ''}
                  onChange={(e) => {
                    if (isVideo(editedStep)) {
                      setEditedStep({
                        ...editedStep,
                        video: { ...editedStep.video, posterUrl: e.target.value }
                      });
                    }
                  }}
                  placeholder="https://..."
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                />
              </div>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={isVideo(editedStep) ? (editedStep.video.autoplay || false) : false}
                onChange={(e) => {
                  if (isVideo(editedStep)) {
                    setEditedStep({
                      ...editedStep,
                      video: { ...editedStep.video, autoplay: e.target.checked }
                    });
                  }
                }}
              />
              <span>Autoplay</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input
                type="checkbox"
                checked={isVideo(editedStep) ? (editedStep.video.muted || false) : false}
                onChange={(e) => {
                  if (isVideo(editedStep)) {
                    setEditedStep({
                      ...editedStep,
                      video: { ...editedStep.video, muted: e.target.checked }
                    });
                  }
                }}
              />
              <span>Muted</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input
                type="checkbox"
                checked={isVideo(editedStep) ? (editedStep.video.controls !== false) : true}
                onChange={(e) => {
                  if (isVideo(editedStep)) {
                    setEditedStep({
                      ...editedStep,
                      video: { ...editedStep.video, controls: e.target.checked }
                    });
                  }
                }}
              />
              <span>Show Controls</span>
            </label>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Description (optional)</label>
            <textarea
              value={editedStep.bodyText || ''}
              onChange={(e) => setEditedStep({ ...editedStep, bodyText: e.target.value })}
              rows={3}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          {!isMediaOnly && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                After player taps Continue (optional)
              </label>
              <select
                value={editedStep.navigateTo ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditedStep({
                    ...editedStep,
                    navigateTo: v ? v : undefined,
                  });
                }}
                style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
              >
                {MISSION_STEP_NAVIGATE_OPTIONS.map((o) => (
                  <option key={o.path || 'none'} value={o.path}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
                Opens that page after advancing the mission. Progress is saved so they can return here and continue.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => onSave(editedStep)}
              disabled={!isVideo(editedStep) || !editedStep.video.url || uploading}
              style={{
                padding: '0.75rem 1.5rem',
                background: uploading || !isVideo(editedStep) || !editedStep.video.url ? '#9ca3af' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: uploading || !isVideo(editedStep) || !editedStep.video.url ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              {uploading ? 'Uploading...' : 'Save Step'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'BATTLE' && isBattle(editedStep)) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20000,
        padding: '2rem'
      }} onClick={onCancel}>
        <div style={{
          background: 'white',
          borderRadius: '1rem',
          padding: '2rem',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto'
        }} onClick={(e) => e.stopPropagation()}>
          <h3 style={{ marginBottom: '1.5rem' }}>Edit Battle Step</h3>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Title (optional)</label>
            <input
              type="text"
              value={editedStep.title || ''}
              onChange={(e) => setEditedStep({ ...editedStep, title: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Difficulty *</label>
            <select
              value={isBattle(editedStep) ? editedStep.battle.difficulty : 'MEDIUM'}
              onChange={(e) => {
                if (isBattle(editedStep)) {
                  setEditedStep({
                    ...editedStep,
                    battle: { ...editedStep.battle, difficulty: e.target.value as any }
                  });
                }
              }}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            >
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
              <option value="BOSS">Boss</option>
            </select>
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#6b7280' }}>
              Enemy health, shields, and attack scale: Easy ×1, Medium ×1.5, Hard ×2, Boss ×2.5.
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Battle background (optional)
            </label>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
              Shown behind the arena during this mission battle. Leave empty to use the default Island Raid background.
            </p>
            {missionId ? (
              <>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleBattleBackgroundUpload(file);
                    e.target.value = '';
                  }}
                  disabled={uploading}
                  style={{ marginBottom: '0.5rem' }}
                />
                {uploading && (
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>Uploading…</p>
                )}
              </>
            ) : (
              <div style={{ padding: '0.75rem', background: '#fef3c7', borderRadius: '0.5rem', marginBottom: '0.5rem' }}>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#92400e' }}>
                  Save the mission first to enable background uploads, or paste a URL below.
                </p>
              </div>
            )}
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 600 }}>
              Background image URL
            </label>
            <input
              type="text"
              value={isBattle(editedStep) ? editedStep.battle.backgroundImage?.url || '' : ''}
              onChange={(e) => {
                if (!isBattle(editedStep)) return;
                const url = e.target.value.trim();
                setEditedStep({
                  ...editedStep,
                  battle: {
                    ...editedStep.battle,
                    backgroundImage: url
                      ? {
                          url,
                          storagePath: editedStep.battle.backgroundImage?.storagePath,
                          alt: editedStep.battle.backgroundImage?.alt,
                        }
                      : undefined,
                  },
                });
              }}
              placeholder="/images/Island Raid BKG.png or https://…"
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
            {isBattle(editedStep) && editedStep.battle.backgroundImage?.url ? (
              <div style={{ marginTop: '0.75rem' }}>
                <img
                  src={editedStep.battle.backgroundImage.url}
                  alt={editedStep.battle.backgroundImage.alt || 'Battle background preview'}
                  style={{
                    maxWidth: '100%',
                    maxHeight: '160px',
                    objectFit: 'cover',
                    borderRadius: '0.5rem',
                    border: '1px solid #e5e7eb',
                    display: 'block',
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!isBattle(editedStep)) return;
                    const { backgroundImage: _removed, ...restBattle } = editedStep.battle;
                    setEditedStep({ ...editedStep, battle: restBattle });
                  }}
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '0.35rem',
                    border: '1px solid #fca5a5',
                    background: '#fef2f2',
                    color: '#b91c1c',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                  }}
                >
                  Remove background
                </button>
              </div>
            ) : null}
          </div>

          {(() => {
            if (!isBattle(editedStep)) return null;
            const b = editedStep.battle;
            type WaveEnemyType = 'ZOMBIE' | 'APPRENTICE' | 'SOVEREIGN' | 'UNVEILED' | 'AHINTA_TUMI';
            type WaveEntry = {
              enemySet: WaveEnemyType[];
              enemyTypeCounts?: Partial<Record<WaveEnemyType, number>>;
              opponentIds?: string[];
              opponentCounts?: Record<string, number>;
            };

            const normalizeWave = (w: {
              enemySet?: WaveEnemyType[];
              enemyTypeCounts?: Partial<Record<WaveEnemyType, number>>;
              opponentIds?: string[];
              opponentCounts?: Record<string, number>;
            }): WaveEntry => {
              const enemySet = [...(w.enemySet || [])] as WaveEnemyType[];
              const enemyTypeCounts = { ...(w.enemyTypeCounts || {}) } as Partial<Record<WaveEnemyType, number>>;
              for (const t of enemySet) {
                if (enemyTypeCounts[t] == null || enemyTypeCounts[t]! < 1) enemyTypeCounts[t] = 1;
              }
              const opponentIds = [...(w.opponentIds || [])];
              const opponentCounts = { ...(w.opponentCounts || {}) };
              for (const id of opponentIds) {
                if (opponentCounts[id] == null || opponentCounts[id]! < 1) opponentCounts[id] = 1;
              }
              return { enemySet, enemyTypeCounts, opponentIds, opponentCounts };
            };

            const waveConfigs: WaveEntry[] = b.waveConfigs?.length
              ? b.waveConfigs.map((w) => normalizeWave(w))
              : Array.from({ length: b.waves || 3 }, () =>
                  normalizeWave({ enemySet: [...b.enemySet] as WaveEnemyType[], opponentIds: [] })
                );

            const updateWaveConfigs = (next: WaveEntry[]) => {
              const allEnemies = next.flatMap((w) => w.enemySet);
              const union = Array.from(new Set(allEnemies)) as WaveEnemyType[];
              setEditedStep({
                ...editedStep,
                battle: {
                  ...b,
                  waveConfigs: next,
                  waves: next.length,
                  enemySet: union.length ? union : b.enemySet,
                  maxEnemiesPerWave: b.maxEnemiesPerWave || 4,
                },
              });
            };

            const setWaveEnemySet = (waveIndex: number, enemySet: WaveEnemyType[]) => {
              const next = waveConfigs.map((w, i) => {
                if (i !== waveIndex) return w;
                const enemyTypeCounts = { ...(w.enemyTypeCounts || {}) };
                for (const t of Object.keys(enemyTypeCounts) as WaveEnemyType[]) {
                  if (!enemySet.includes(t)) delete enemyTypeCounts[t];
                }
                for (const t of enemySet) {
                  if (enemyTypeCounts[t] == null || enemyTypeCounts[t]! < 1) enemyTypeCounts[t] = 1;
                }
                return { ...w, enemySet, enemyTypeCounts };
              });
              updateWaveConfigs(next);
            };

            const setEnemyTypeCount = (waveIndex: number, enemyType: WaveEnemyType, count: number) => {
              const n = Math.max(1, Math.min(50, Math.floor(count) || 1));
              const next = waveConfigs.map((w, i) =>
                i === waveIndex ? { ...w, enemyTypeCounts: { ...(w.enemyTypeCounts || {}), [enemyType]: n } } : w
              );
              updateWaveConfigs(next);
            };

            const setWaveOpponentIds = (waveIndex: number, opponentIds: string[]) => {
              const next = waveConfigs.map((w, i) => {
                if (i !== waveIndex) return w;
                const opponentCounts = { ...(w.opponentCounts || {}) };
                for (const id of Object.keys(opponentCounts)) {
                  if (!opponentIds.includes(id)) delete opponentCounts[id];
                }
                for (const id of opponentIds) {
                  if (opponentCounts[id] == null || opponentCounts[id]! < 1) opponentCounts[id] = 1;
                }
                return { ...w, opponentIds, opponentCounts };
              });
              updateWaveConfigs(next);
            };

            const setOpponentCount = (waveIndex: number, oppId: string, count: number) => {
              const n = Math.max(1, Math.min(50, Math.floor(count) || 1));
              const next = waveConfigs.map((w, i) =>
                i === waveIndex
                  ? { ...w, opponentCounts: { ...(w.opponentCounts || {}), [oppId]: n } }
                  : w
              );
              updateWaveConfigs(next);
            };

            const addWave = () =>
              updateWaveConfigs([
                ...waveConfigs,
                waveConfigs.length
                  ? normalizeWave({
                      enemySet: [...waveConfigs[0].enemySet],
                      enemyTypeCounts: { ...waveConfigs[0].enemyTypeCounts },
                      opponentIds: [...(waveConfigs[0].opponentIds || [])],
                      opponentCounts: { ...waveConfigs[0].opponentCounts },
                    })
                  : normalizeWave({ enemySet: ['ZOMBIE'], opponentIds: [] }),
              ]);

            const removeWave = (index: number) => {
              if (waveConfigs.length <= 1) return;
              updateWaveConfigs(waveConfigs.filter((_, i) => i !== index));
            };

            return (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <label style={{ fontWeight: 'bold' }}>Waves – edit each wave’s enemies</label>
                  <button type="button" onClick={addWave} style={{ padding: '0.35rem 0.75rem', fontSize: '0.875rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}>+ Add Wave</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
                  {waveConfigs.map((wave, idx) => (
                    <div key={idx} style={{ padding: '1rem', background: '#f3f4f6', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <strong>Wave {idx + 1}</strong>
                        {waveConfigs.length > 1 && (
                          <button type="button" onClick={() => removeWave(idx)} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}>Remove wave</button>
                        )}
                      </div>
                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.35rem' }}>Enemy types (legacy) — count each</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {ALL_ENEMY_TYPES.map((enemyType) => (
                            <div key={enemyType} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: '10rem' }}>
                                <input
                                  type="checkbox"
                                  checked={wave.enemySet.includes(enemyType)}
                                  onChange={(e) => {
                                    const nextSet = e.target.checked
                                      ? [...wave.enemySet, enemyType]
                                      : wave.enemySet.filter((x) => x !== enemyType);
                                    setWaveEnemySet(idx, nextSet as WaveEnemyType[]);
                                  }}
                                />
                                <span>{ENEMY_TYPE_LABELS[enemyType]}</span>
                              </label>
                              {wave.enemySet.includes(enemyType) ? (
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: '#374151' }}>
                                  Count
                                  <input
                                    type="number"
                                    min={1}
                                    max={50}
                                    value={wave.enemyTypeCounts?.[enemyType] ?? 1}
                                    onChange={(e) => setEnemyTypeCount(idx, enemyType, parseInt(e.target.value, 10))}
                                    style={{ width: '3.5rem', padding: '0.2rem 0.35rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                                  />
                                </label>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                          CPU Opponents (from list) – used when set
                          {cpuOpponentsLoading ? (
                            <span style={{ marginLeft: '0.5rem', color: '#3b82f6' }}>Loading roster…</span>
                          ) : null}
                        </div>
                        <p style={{ fontSize: '0.7rem', color: '#9ca3af', margin: '0 0 0.35rem' }}>
                          List matches <strong>Admin → CPU Opponent Moves</strong> (Firestore). Set how many of each spawn this wave.
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          {cpuOpponentCatalog.map((opp) => (
                            <div key={opp.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem', flex: '1 1 12rem' }}>
                                <input
                                  type="checkbox"
                                  checked={(wave.opponentIds || []).includes(opp.id)}
                                  onChange={(e) => {
                                    const current = wave.opponentIds || [];
                                    const next = e.target.checked ? [...current, opp.id] : current.filter((id) => id !== opp.id);
                                    setWaveOpponentIds(idx, next);
                                  }}
                                />
                                <span>{opp.name}</span>
                              </label>
                              {(wave.opponentIds || []).includes(opp.id) ? (
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem' }}>
                                  Count
                                  <input
                                    type="number"
                                    min={1}
                                    max={50}
                                    value={wave.opponentCounts?.[opp.id] ?? 1}
                                    onChange={(e) => setOpponentCount(idx, opp.id, parseInt(e.target.value, 10))}
                                    style={{ width: '3.5rem', padding: '0.2rem 0.35rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                                  />
                                </label>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Max enemies per wave (cap)</label>
                  <input
                    type="number"
                    value={b.maxEnemiesPerWave ?? 4}
                    onChange={(e) => {
                      if (isBattle(editedStep)) {
                        setEditedStep({
                          ...editedStep,
                          battle: { ...editedStep.battle, maxEnemiesPerWave: parseInt(e.target.value, 10) || 4 },
                        });
                      }
                    }}
                    min={1}
                    max={50}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                  />
                  <p style={{ margin: '0.35rem 0 0', fontSize: '0.72rem', color: '#6b7280' }}>
                    If your counts add up to more than this, extra spawns are skipped for that wave.
                  </p>
                </div>
              </>
            );
          })()}

          <div style={{ marginBottom: '1rem', padding: '1rem', background: '#eef2ff', borderRadius: '0.5rem', border: '1px solid #c7d2fe' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Co-op (optional)</label>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.75rem', color: '#475569' }}>
              Mid-battle join uses explicit Join on the battle URL. Cap defaults to 4 allied slots (humans + NPC allies).
            </p>
            {isBattle(editedStep) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    checked={!!editedStep.battle.coop?.allowPlayerJoinMidBattle}
                    onChange={(e) => {
                      const c = editedStep.battle.coop || {};
                      setEditedStep({
                        ...editedStep,
                        battle: {
                          ...editedStep.battle,
                          coop: { ...c, allowPlayerJoinMidBattle: e.target.checked },
                        },
                      });
                    }}
                  />
                  Allow player join mid-battle (joinable + invite link)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    checked={!!editedStep.battle.coop?.allowNpcAllies}
                    onChange={(e) => {
                      const c = editedStep.battle.coop || {};
                      setEditedStep({
                        ...editedStep,
                        battle: {
                          ...editedStep.battle,
                          coop: { ...c, allowNpcAllies: e.target.checked },
                        },
                      });
                    }}
                  />
                  Allow NPC allies (Support Drone template)
                </label>
                <label style={{ fontSize: '0.875rem' }}>
                  Max allied participants (humans + NPC)
                  <input
                    type="number"
                    min={2}
                    max={8}
                    value={editedStep.battle.coop?.maxAlliedParticipants ?? 4}
                    onChange={(e) => {
                      const c = editedStep.battle.coop || {};
                      setEditedStep({
                        ...editedStep,
                        battle: {
                          ...editedStep.battle,
                          coop: {
                            ...c,
                            maxAlliedParticipants: Math.min(8, Math.max(2, parseInt(e.target.value, 10) || 4)),
                          },
                        },
                      });
                    }}
                    style={{ marginLeft: '0.5rem', width: '4rem', padding: '0.25rem' }}
                  />
                </label>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '1rem', padding: '1rem', background: '#f3f4f6', borderRadius: '0.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.75rem', fontWeight: 'bold' }}>Rewards</label>
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>XP</label>
                <input
                  type="number"
                  value={isBattle(editedStep) ? editedStep.battle.rewards.xp : 0}
                  onChange={(e) => {
                    if (isBattle(editedStep)) {
                      setEditedStep({
                        ...editedStep,
                        battle: {
                          ...editedStep.battle,
                          rewards: { ...editedStep.battle.rewards, xp: parseInt(e.target.value) || 0 }
                        }
                      });
                    }
                  }}
                  min={0}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem' }}>PP</label>
                <input
                  type="number"
                  value={isBattle(editedStep) ? editedStep.battle.rewards.pp : 0}
                  onChange={(e) => {
                    if (isBattle(editedStep)) {
                      setEditedStep({
                        ...editedStep,
                        battle: {
                          ...editedStep.battle,
                          rewards: { ...editedStep.battle.rewards, pp: parseInt(e.target.value) || 0 }
                        }
                      });
                    }
                  }}
                  min={0}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                />
              </div>
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '600' }}>Drops (rewards after battle)</label>
              <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                Use “Add drop” for multiple rewards. Artifact list loads from Artifacts Admin (marketplace + equippable).
              </p>
              {(isBattle(editedStep) ? (editedStep.battle.rewards.drops || []) : []).map((drop, dIdx) => (
                <div key={dIdx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  <select
                    value={drop.type}
                    onChange={(e) => {
                      if (!isBattle(editedStep)) return;
                      const drops = [...(editedStep.battle.rewards.drops || [])];
                      drops[dIdx] = { ...drops[dIdx], type: e.target.value as 'ARTIFACT' | 'STS_SHARD' | 'ITEM' };
                      setEditedStep({
                        ...editedStep,
                        battle: { ...editedStep.battle, rewards: { ...editedStep.battle.rewards, drops } }
                      });
                    }}
                    style={{ padding: '0.35rem', borderRadius: '0.25rem', border: '1px solid #d1d5db', minWidth: '100px' }}
                  >
                    <option value="ARTIFACT">Artifact</option>
                    <option value="STS_SHARD">STS Shard</option>
                    <option value="ITEM">Item</option>
                  </select>
                  {drop.type === 'ARTIFACT' && (
                    <select
                      value={drop.refId || ''}
                      onChange={(e) => {
                        if (!isBattle(editedStep)) return;
                        const drops = [...(editedStep.battle.rewards.drops || [])];
                        drops[dIdx] = { ...drops[dIdx], refId: e.target.value || undefined };
                        setEditedStep({
                          ...editedStep,
                          battle: { ...editedStep.battle, rewards: { ...editedStep.battle.rewards, drops } }
                        });
                      }}
                      disabled={artifactsLoading}
                      style={{ padding: '0.35rem', borderRadius: '0.25rem', border: '1px solid #d1d5db', minWidth: '160px', opacity: artifactsLoading ? 0.7 : 1 }}
                    >
                      <option value="">{artifactsLoading ? 'Loading artifacts…' : '— Select artifact —'}</option>
                      {artifactSelectChoices.map((a) => (
                        <option key={a.id} value={a.id}>{a.icon} {a.name}</option>
                      ))}
                    </select>
                  )}
                  <input
                    type="number"
                    placeholder="Qty"
                    value={drop.qty ?? 1}
                    onChange={(e) => {
                      if (!isBattle(editedStep)) return;
                      const drops = [...(editedStep.battle.rewards.drops || [])];
                      drops[dIdx] = { ...drops[dIdx], qty: parseInt(e.target.value, 10) || 1 };
                      setEditedStep({
                        ...editedStep,
                        battle: { ...editedStep.battle, rewards: { ...editedStep.battle.rewards, drops } }
                      });
                    }}
                    min={1}
                    style={{ width: '60px', padding: '0.35rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!isBattle(editedStep)) return;
                      const drops = (editedStep.battle.rewards.drops || []).filter((_, i) => i !== dIdx);
                      setEditedStep({
                        ...editedStep,
                        battle: { ...editedStep.battle, rewards: { ...editedStep.battle.rewards, drops } }
                      });
                    }}
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  if (!isBattle(editedStep)) return;
                  const drops = [...(editedStep.battle.rewards.drops || []), { type: 'ARTIFACT' as const, refId: undefined as string | undefined, qty: 1 }];
                  setEditedStep({
                    ...editedStep,
                    battle: { ...editedStep.battle, rewards: { ...editedStep.battle.rewards, drops } }
                  });
                }}
                style={{ marginTop: '0.25rem', padding: '0.35rem 0.75rem', fontSize: '0.875rem', background: '#10b981', color: 'white', border: 'none', borderRadius: '0.375rem', cursor: 'pointer' }}
              >
                + Add drop (Artifact / Shard / Item)
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Briefing Text (optional)</label>
            <textarea
              value={editedStep.bodyText || ''}
              onChange={(e) => setEditedStep({ ...editedStep, bodyText: e.target.value })}
              rows={3}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => onSave(editedStep)}
              disabled={!isBattle(editedStep) || !(editedStep.battle.waveConfigs?.some(w => w.enemySet.length > 0 || (w.opponentIds?.length ?? 0) > 0) || editedStep.battle.enemySet.length > 0)}
              style={{
                padding: '0.75rem 1.5rem',
                background: !isBattle(editedStep) || !(editedStep.battle.waveConfigs?.some(w => w.enemySet.length > 0 || (w.opponentIds?.length ?? 0) > 0) || editedStep.battle.enemySet.length > 0) ? '#9ca3af' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: !isBattle(editedStep) || !(editedStep.battle.waveConfigs?.some(w => w.enemySet.length > 0 || (w.opponentIds?.length ?? 0) > 0) || editedStep.battle.enemySet.length > 0) ? 'not-allowed' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              Save Step
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'TRAINING_ASSIGNMENT' && isTrainingAssignment(editedStep)) {
    const canSave =
      isTrainingAssignment(editedStep) &&
      Boolean(editedStep.training.quizSetId?.trim()) &&
      Number.isFinite(editedStep.training.minimumPassPercent) &&
      editedStep.training.minimumPassPercent >= 0 &&
      editedStep.training.minimumPassPercent <= 100;

    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20000,
          padding: '2rem',
        }}
        onClick={onCancel}
      >
        <div
          style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '560px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginBottom: '1.5rem' }}>Edit Training Assignment</h3>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Title (optional)</label>
            <input
              type="text"
              value={editedStep.title || ''}
              onChange={(e) => setEditedStep({ ...editedStep, title: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Intro text (optional)</label>
            <textarea
              value={editedStep.bodyText || ''}
              onChange={(e) => setEditedStep({ ...editedStep, bodyText: e.target.value })}
              rows={3}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Training Grounds (CFUs) quiz *</label>
            <select
              value={editedStep.training.quizSetId}
              onChange={(e) =>
                setEditedStep({
                  ...editedStep,
                  training: { ...editedStep.training, quizSetId: e.target.value },
                })
              }
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            >
              <option value="">Select a quiz…</option>
              {quizOptions.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.title || q.id}
                </option>
              ))}
            </select>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
              Includes unpublished sets so you can wire missions before publishing.
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Minimum score to continue (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={editedStep.training.minimumPassPercent}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                setEditedStep({
                  ...editedStep,
                  training: {
                    ...editedStep.training,
                    minimumPassPercent: Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0,
                  },
                });
              }}
              style={{ width: '120px', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
              Use 0 to require any completed attempt (no minimum percent). Otherwise the player’s best completed solo run
              must be at least this percent to unlock Next.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => onSave(editedStep)}
              disabled={!canSave}
              style={{
                padding: '0.75rem 1.5rem',
                background: canSave ? '#7c3aed' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: canSave ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
              }}
            >
              Save Step
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'REFLECTION' && isReflection(editedStep)) {
    const canSave = editedStep.prompt.trim().length > 0;
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20000,
          padding: '2rem',
        }}
        onClick={onCancel}
      >
        <div
          style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '560px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginBottom: '1.5rem' }}>Edit Reflection</h3>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Title (optional)</label>
            <input
              type="text"
              value={editedStep.title || ''}
              onChange={(e) => setEditedStep({ ...editedStep, title: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Intro (optional)</label>
            <textarea
              value={editedStep.bodyText || ''}
              onChange={(e) => setEditedStep({ ...editedStep, bodyText: e.target.value })}
              rows={2}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Reflection question *</label>
            <textarea
              value={editedStep.prompt}
              onChange={(e) => setEditedStep({ ...editedStep, prompt: e.target.value })}
              rows={4}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Textarea placeholder (optional)</label>
            <input
              type="text"
              value={editedStep.textareaPlaceholder || ''}
              onChange={(e) => setEditedStep({ ...editedStep, textareaPlaceholder: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Link to Assessment Goals (optional)
            </label>
            <input
              type="text"
              value={editedStep.linkedAssessmentId || ''}
              onChange={(e) =>
                setEditedStep({
                  ...editedStep,
                  linkedAssessmentId: e.target.value.trim() || undefined,
                })
              }
              list="mission-reflection-assessment-ids"
              placeholder="Assessment document ID — pick or paste"
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
            <datalist id="mission-reflection-assessment-ids">
              {assessmentPickList.map((a) => (
                <option key={a.id} value={a.id} label={`${a.title} (${a.type})`} />
              ))}
            </datalist>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
              For <strong>habits</strong> / <strong>story-goal</strong> assessments, players get the same fields as Set Goal
              (habit + duration + area of consistency, or story goal + evidence). That data is written to Assessment Goals
              and shows on the teacher dashboard — including when the assessment is <strong>locked</strong> there (the
              mission is the allowed path). For other types, the written response merges into goal evidence. If saving
              isn&apos;t possible, responses are stored on the player&apos;s account only.
            </p>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={editedStep.requireResponse !== false}
              onChange={(e) => setEditedStep({ ...editedStep, requireResponse: e.target.checked })}
            />
            <span style={{ fontSize: '0.9rem' }}>Require written response before continuing</span>
          </label>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => onSave(editedStep)}
              disabled={!canSave}
              style={{
                padding: '0.75rem 1.5rem',
                background: canSave ? '#0d9488' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: canSave ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
              }}
            >
              Save Step
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'LEVEL2_MANIFEST' && isLevel2Manifest(editedStep)) {
    const canSave = true;
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20000,
          padding: '2rem',
        }}
        onClick={onCancel}
      >
        <div
          style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '560px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginBottom: '1.5rem' }}>Edit Level 2 Manifest step</h3>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Title</label>
            <input
              type="text"
              value={editedStep.title || ''}
              onChange={(e) => setEditedStep({ ...editedStep, title: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Instructions / intro</label>
            <textarea
              value={editedStep.description || ''}
              onChange={(e) => setEditedStep({ ...editedStep, description: e.target.value })}
              rows={3}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Sonido dialogue</label>
            <textarea
              value={editedStep.sonidoDialogue || ''}
              onChange={(e) => setEditedStep({ ...editedStep, sonidoDialogue: e.target.value })}
              rows={4}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={editedStep.requireMetaStateFirst === true}
              onChange={(e) => setEditedStep({ ...editedStep, requireMetaStateFirst: e.target.checked })}
            />
            <span style={{ fontSize: '0.9rem' }}>Require Meta / Flow unlock before continuing</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={editedStep.autoUnlockBuilderOnEntry === true}
              onChange={(e) => setEditedStep({ ...editedStep, autoUnlockBuilderOnEntry: e.target.checked })}
            />
            <span style={{ fontSize: '0.9rem' }}>Auto-unlock Level 2 builder when step is shown</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={editedStep.requireSkillCreation !== false}
              onChange={(e) => setEditedStep({ ...editedStep, requireSkillCreation: e.target.checked })}
            />
            <span style={{ fontSize: '0.9rem' }}>Require saving a Level 2 skill to complete step</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={editedStep.requireSkillEquip === true}
              onChange={(e) => setEditedStep({ ...editedStep, requireSkillEquip: e.target.checked })}
            />
            <span style={{ fontSize: '0.9rem' }}>Require active equipped L2 skill (must match saved)</span>
          </label>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              onClick={() => onSave(editedStep)}
              disabled={!canSave}
              style={{
                padding: '0.75rem 1.5rem',
                background: canSave ? '#b45309' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: canSave ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
              }}
            >
              Save Step
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'CHOICE' && isChoice(editedStep)) {
    const canSave =
      editedStep.prompt.trim().length > 0 &&
      editedStep.choices.length >= 2 &&
      editedStep.choices.every(
        (c) => c.label.trim().length > 0 && c.result.bodyText.trim().length > 0
      );

    const updateChoice = (choiceId: string, patch: Partial<MissionChoiceOption>) => {
      setEditedStep({
        ...editedStep,
        choices: editedStep.choices.map((c) =>
          c.id === choiceId
            ? {
                ...c,
                ...patch,
                result: patch.result ? { ...c.result, ...patch.result } : c.result,
              }
            : c
        ),
      });
    };

    const addOption = () => {
      const n = editedStep.choices.length + 1;
      setEditedStep({
        ...editedStep,
        choices: [
          ...editedStep.choices,
          {
            id: crypto.randomUUID ? crypto.randomUUID() : `choice_${Date.now()}_${n}`,
            label: `Option ${String.fromCharCode(64 + n)}`,
            description: '',
            result: { title: '', bodyText: '' },
          },
        ],
      });
    };

    const removeOption = (choiceId: string) => {
      if (editedStep.choices.length <= 2) return;
      setEditedStep({
        ...editedStep,
        choices: editedStep.choices.filter((c) => c.id !== choiceId),
      });
    };

    const jumpTargets = allSteps.filter((s) => s.id !== editedStep.id);

    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20000,
          padding: '2rem',
        }}
        onClick={onCancel}
      >
        <div
          style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '640px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginBottom: '0.5rem' }}>Edit Choice</h3>
          <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: '#6b7280' }}>
            Players pick one option, see that option&apos;s result, then continue (next step or a jump target).
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Title (optional)</label>
            <input
              type="text"
              value={editedStep.title || ''}
              onChange={(e) => setEditedStep({ ...editedStep, title: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Intro (optional)</label>
            <textarea
              value={editedStep.bodyText || ''}
              onChange={(e) => setEditedStep({ ...editedStep, bodyText: e.target.value })}
              rows={2}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Prompt *</label>
            <textarea
              value={editedStep.prompt}
              onChange={(e) => setEditedStep({ ...editedStep, prompt: e.target.value })}
              rows={3}
              placeholder="What do you do?"
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <strong>Options ({editedStep.choices.length})</strong>
            <button
              type="button"
              onClick={addOption}
              style={{
                padding: '0.35rem 0.75rem',
                background: '#db2777',
                color: 'white',
                border: 'none',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
              }}
            >
              + Add option
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
            {editedStep.choices.map((choice, idx) => (
              <div
                key={choice.id}
                style={{
                  padding: '1rem',
                  border: '1px solid #f9a8d4',
                  borderRadius: '0.5rem',
                  background: '#fdf2f8',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontWeight: 700, color: '#9d174d' }}>Option {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeOption(choice.id)}
                    disabled={editedStep.choices.length <= 2}
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: editedStep.choices.length <= 2 ? '#e5e7eb' : '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.25rem',
                      cursor: editedStep.choices.length <= 2 ? 'not-allowed' : 'pointer',
                      fontSize: '0.75rem',
                    }}
                  >
                    Remove
                  </button>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 600 }}>
                    Label *
                  </label>
                  <input
                    type="text"
                    value={choice.label}
                    onChange={(e) => updateChoice(choice.id, { label: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                  />
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 600 }}>
                    Hint (optional)
                  </label>
                  <input
                    type="text"
                    value={choice.description || ''}
                    onChange={(e) => updateChoice(choice.id, { description: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                  />
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 600 }}>
                    Result title (optional)
                  </label>
                  <input
                    type="text"
                    value={choice.result.title || ''}
                    onChange={(e) =>
                      updateChoice(choice.id, { result: { ...choice.result, title: e.target.value } })
                    }
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                  />
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 600 }}>
                    Result text *
                  </label>
                  <textarea
                    value={choice.result.bodyText}
                    onChange={(e) =>
                      updateChoice(choice.id, { result: { ...choice.result, bodyText: e.target.value } })
                    }
                    rows={3}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                  />
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 600 }}>
                    Result image (optional)
                  </label>
                  {missionId ? (
                    <>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleChoiceResultImageUpload(choice.id, file);
                          e.target.value = '';
                        }}
                        disabled={uploading}
                        style={{ marginBottom: '0.5rem', display: 'block' }}
                      />
                      <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                        {uploading
                          ? 'Uploading…'
                          : 'Upload JPG, PNG, WebP, or GIF (max 5 MB). You can also paste a URL below.'}
                      </p>
                    </>
                  ) : (
                    <div
                      style={{
                        padding: '0.75rem',
                        background: '#fef3c7',
                        borderRadius: '0.5rem',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#92400e' }}>
                        Save the mission first to enable image uploads. You can still paste a temporary URL.
                      </p>
                    </div>
                  )}
                  {choice.result.imageUrl ? (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <img
                        src={choice.result.imageUrl}
                        alt={choice.result.title || choice.label || 'Result'}
                        style={{
                          maxWidth: '100%',
                          maxHeight: '160px',
                          objectFit: 'contain',
                          borderRadius: '0.375rem',
                          background: '#fff',
                          border: '1px solid #e5e7eb',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateChoice(choice.id, {
                            result: {
                              ...choice.result,
                              imageUrl: undefined,
                              imageStoragePath: undefined,
                            },
                          })
                        }
                        disabled={uploading}
                        style={{
                          display: 'block',
                          marginTop: '0.35rem',
                          padding: '0.25rem 0.5rem',
                          background: '#f3f4f6',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          cursor: uploading ? 'not-allowed' : 'pointer',
                          fontSize: '0.75rem',
                        }}
                      >
                        Remove image
                      </button>
                    </div>
                  ) : null}
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.75rem', color: '#6b7280' }}>
                    Or image URL
                  </label>
                  <input
                    type="url"
                    value={choice.result.imageUrl || ''}
                    onChange={(e) =>
                      updateChoice(choice.id, {
                        result: {
                          ...choice.result,
                          imageUrl: e.target.value,
                          imageStoragePath: e.target.value ? choice.result.imageStoragePath : undefined,
                        },
                      })
                    }
                    placeholder="https://…"
                    disabled={uploading}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                  />
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 600 }}>
                    Grant artifacts (optional)
                  </label>
                  <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
                    Players receive these when they continue after this result.
                  </p>
                  {(choice.result.grantArtifactIds || []).map((artId, artIdx) => (
                    <div
                      key={`${choice.id}-art-${artIdx}-${artId}`}
                      style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}
                    >
                      <select
                        value={artId}
                        onChange={(e) => {
                          const next = [...(choice.result.grantArtifactIds || [])];
                          next[artIdx] = e.target.value;
                          updateChoice(choice.id, {
                            result: { ...choice.result, grantArtifactIds: next.filter(Boolean) },
                          });
                        }}
                        style={{ flex: 1, padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                      >
                        <option value="">Select artifact…</option>
                        {artifactSelectChoices.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.icon} {a.name} ({a.id})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          const next = (choice.result.grantArtifactIds || []).filter((_, i) => i !== artIdx);
                          updateChoice(choice.id, {
                            result: {
                              ...choice.result,
                              grantArtifactIds: next.length ? next : undefined,
                            },
                          });
                        }}
                        style={{
                          padding: '0.35rem 0.6rem',
                          background: '#fee2e2',
                          color: '#991b1b',
                          border: '1px solid #fecaca',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      updateChoice(choice.id, {
                        result: {
                          ...choice.result,
                          grantArtifactIds: [...(choice.result.grantArtifactIds || []), ''],
                        },
                      })
                    }
                    style={{
                      padding: '0.35rem 0.75rem',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                    }}
                  >
                    + Add artifact grant
                  </button>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.875rem', fontWeight: 600 }}>
                    After result, go to
                  </label>
                  <select
                    value={choice.goToStepId || ''}
                    onChange={(e) =>
                      updateChoice(choice.id, {
                        goToStepId: e.target.value || undefined,
                      })
                    }
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                  >
                    <option value="">Next step in order</option>
                    {jumpTargets.map((s) => {
                      const orderLabel = allSteps.findIndex((x) => x.id === s.id) + 1;
                      return (
                        <option key={s.id} value={s.id}>
                          #{orderLabel} — {s.title || s.type} ({s.type})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="button"
              onClick={() => onSave(editedStep)}
              disabled={!canSave || uploading}
              style={{
                padding: '0.75rem 1.5rem',
                background: canSave && !uploading ? '#db2777' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: canSave && !uploading ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
              }}
            >
              {uploading ? 'Uploading…' : 'Save Step'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'CHOOSE_MANIFEST' && isChooseManifest(editedStep)) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20000,
          padding: '2rem',
        }}
        onClick={onCancel}
      >
        <div
          style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '560px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginBottom: '0.5rem' }}>Edit Choose Manifest</h3>
          <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: '#6b7280' }}>
            Demo Missions only. Players open the real Choose Manifest picker and their selection is saved to their
            profile.
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Title (optional)</label>
            <input
              type="text"
              value={editedStep.title || ''}
              onChange={(e) => setEditedStep({ ...editedStep, title: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Intro (optional)</label>
            <textarea
              value={editedStep.bodyText || ''}
              onChange={(e) => setEditedStep({ ...editedStep, bodyText: e.target.value })}
              rows={3}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Prompt (optional)</label>
            <textarea
              value={editedStep.prompt || ''}
              onChange={(e) => setEditedStep({ ...editedStep, prompt: e.target.value })}
              rows={2}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.75rem',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={editedStep.requireSelection !== false}
              onChange={(e) => setEditedStep({ ...editedStep, requireSelection: e.target.checked })}
            />
            <span style={{ fontSize: '0.9rem' }}>Require confirming a manifest before Next</span>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.5rem',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={editedStep.allowReselect !== false}
              onChange={(e) => setEditedStep({ ...editedStep, allowReselect: e.target.checked })}
            />
            <span style={{ fontSize: '0.9rem' }}>Allow choosing again after completing this step</span>
          </label>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="button"
              onClick={() => onSave(editedStep)}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'linear-gradient(135deg, #d97706 0%, #7c3aed 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Save Step
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'SKILLS_MASTERY' && isSkillsMastery(editedStep)) {
    const captions = Array.isArray(editedStep.captions) ? editedStep.captions : [''];
    const canSave =
      typeof editedStep.grantPP === 'number' &&
      Number.isFinite(editedStep.grantPP) &&
      editedStep.grantPP >= 0;

    const setCaptionAt = (index: number, value: string) => {
      const next = [...captions];
      next[index] = value;
      setEditedStep({ ...editedStep, captions: next });
    };

    const addCaption = () => {
      setEditedStep({ ...editedStep, captions: [...captions, ''] });
    };

    const removeCaption = (index: number) => {
      if (captions.length <= 1) {
        setEditedStep({ ...editedStep, captions: [''] });
        return;
      }
      setEditedStep({ ...editedStep, captions: captions.filter((_, i) => i !== index) });
    };

    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20000,
          padding: '2rem',
        }}
        onClick={onCancel}
      >
        <div
          style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginBottom: '0.5rem' }}>Edit Skills &amp; Mastery</h3>
          <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.5 }}>
            Sends players to Battle Arena → Skills &amp; Mastery. Optionally grant PP once when they open it,
            and show instructional captions on the mission step.
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Title (optional)</label>
            <input
              type="text"
              value={editedStep.title || ''}
              onChange={(e) => setEditedStep({ ...editedStep, title: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              PP to grant (once)
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={editedStep.grantPP}
              onChange={(e) =>
                setEditedStep({
                  ...editedStep,
                  grantPP: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                })
              }
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
              0 = no grant. Claimed only once per player mission step.
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontWeight: 'bold' }}>Captions</label>
              <button
                type="button"
                onClick={addCaption}
                style={{
                  padding: '0.35rem 0.75rem',
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                + Add caption
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {captions.map((cap, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <textarea
                    value={cap}
                    onChange={(e) => setCaptionAt(i, e.target.value)}
                    rows={3}
                    placeholder={`Caption ${i + 1}`}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #d1d5db',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeCaption(i)}
                    style={{
                      padding: '0.5rem 0.65rem',
                      background: '#fee2e2',
                      color: '#991b1b',
                      border: '1px solid #fecaca',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.5rem',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={editedStep.requireVisit !== false}
              onChange={(e) => setEditedStep({ ...editedStep, requireVisit: e.target.checked })}
            />
            <span style={{ fontSize: '0.9rem' }}>Require opening Skills &amp; Mastery before Next</span>
          </label>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="button"
              onClick={() =>
                onSave({
                  ...editedStep,
                  captions: captions.map((c) => c.trim()).filter(Boolean).length
                    ? captions.map((c) => c.trim()).filter(Boolean)
                    : [''],
                  grantPP: Math.max(0, Math.floor(Number(editedStep.grantPP) || 0)),
                })
              }
              disabled={!canSave}
              style={{
                padding: '0.75rem 1.5rem',
                background: canSave ? 'linear-gradient(135deg, #2563eb 0%, #0f766e 100%)' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: canSave ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
              }}
            >
              Save Step
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'ARTIFACTS' && isArtifacts(editedStep)) {
    const captions = Array.isArray(editedStep.captions) ? editedStep.captions : [''];
    const canSave =
      typeof editedStep.grantPP === 'number' &&
      Number.isFinite(editedStep.grantPP) &&
      editedStep.grantPP >= 0;

    const setCaptionAt = (index: number, value: string) => {
      const next = [...captions];
      next[index] = value;
      setEditedStep({ ...editedStep, captions: next });
    };

    const addCaption = () => {
      setEditedStep({ ...editedStep, captions: [...captions, ''] });
    };

    const removeCaption = (index: number) => {
      if (captions.length <= 1) {
        setEditedStep({ ...editedStep, captions: [''] });
        return;
      }
      setEditedStep({ ...editedStep, captions: captions.filter((_, i) => i !== index) });
    };

    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20000,
          padding: '2rem',
        }}
        onClick={onCancel}
      >
        <div
          style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginBottom: '0.5rem' }}>Edit Artifacts</h3>
          <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.5 }}>
            Sends players to the Artifacts menu to equip and edit gear. Optionally grant PP once when they open it,
            and show instructional captions on the mission step.
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Title (optional)</label>
            <input
              type="text"
              value={editedStep.title || ''}
              onChange={(e) => setEditedStep({ ...editedStep, title: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              PP to grant (once)
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={editedStep.grantPP}
              onChange={(e) =>
                setEditedStep({
                  ...editedStep,
                  grantPP: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                })
              }
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
              0 = no grant. Claimed only once per player mission step.
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontWeight: 'bold' }}>Captions</label>
              <button
                type="button"
                onClick={addCaption}
                style={{
                  padding: '0.35rem 0.75rem',
                  background: '#7c3aed',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                + Add caption
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {captions.map((cap, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <textarea
                    value={cap}
                    onChange={(e) => setCaptionAt(i, e.target.value)}
                    rows={3}
                    placeholder={`Caption ${i + 1}`}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #d1d5db',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeCaption(i)}
                    style={{
                      padding: '0.5rem 0.65rem',
                      background: '#fee2e2',
                      color: '#991b1b',
                      border: '1px solid #fecaca',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.5rem',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={editedStep.requireVisit !== false}
              onChange={(e) => setEditedStep({ ...editedStep, requireVisit: e.target.checked })}
            />
            <span style={{ fontSize: '0.9rem' }}>Require opening Artifacts before Next</span>
          </label>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="button"
              onClick={() =>
                onSave({
                  ...editedStep,
                  captions: captions.map((c) => c.trim()).filter(Boolean).length
                    ? captions.map((c) => c.trim()).filter(Boolean)
                    : [''],
                  grantPP: Math.max(0, Math.floor(Number(editedStep.grantPP) || 0)),
                })
              }
              disabled={!canSave}
              style={{
                padding: '0.75rem 1.5rem',
                background: canSave ? 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)' : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: canSave ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
              }}
            >
              Save Step
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'ELEMENTAL_SKILLS' && isElementalSkills(editedStep)) {
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20000,
          padding: '2rem',
        }}
        onClick={onCancel}
      >
        <div
          style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '560px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginBottom: '0.5rem' }}>Edit Elemental Skills</h3>
          <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: '#6b7280' }}>
            Players choose Fire, Water, Earth, or Air. Selection grants the Elemental Ring and unlocks Level 1
            elemental skills for battle.
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Title (optional)</label>
            <input
              type="text"
              value={editedStep.title || ''}
              onChange={(e) => setEditedStep({ ...editedStep, title: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Intro (optional)</label>
            <textarea
              value={editedStep.bodyText || ''}
              onChange={(e) => setEditedStep({ ...editedStep, bodyText: e.target.value })}
              rows={3}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Prompt (optional)</label>
            <textarea
              value={editedStep.prompt || ''}
              onChange={(e) => setEditedStep({ ...editedStep, prompt: e.target.value })}
              rows={2}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '0.75rem',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={editedStep.requireSelection !== false}
              onChange={(e) => setEditedStep({ ...editedStep, requireSelection: e.target.checked })}
            />
            <span style={{ fontSize: '0.9rem' }}>Require awakening an Element before Next</span>
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.5rem',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={editedStep.allowReselect === true}
              onChange={(e) => setEditedStep({ ...editedStep, allowReselect: e.target.checked })}
            />
            <span style={{ fontSize: '0.9rem' }}>
              Allow changing Element after completing this step (overwrites affinity)
            </span>
          </label>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="button"
              onClick={() => onSave(editedStep)}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'linear-gradient(135deg, #ea580c 0%, #0284c7 55%, #65a30d 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Save Step
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'POWER_CARD' && isPowerCard(editedStep)) {
    const captions = Array.isArray(editedStep.captions) ? editedStep.captions : [''];
    const canSave =
      typeof editedStep.grantPP === 'number' &&
      Number.isFinite(editedStep.grantPP) &&
      editedStep.grantPP >= 0;

    const setCaptionAt = (index: number, value: string) => {
      const next = [...captions];
      next[index] = value;
      setEditedStep({ ...editedStep, captions: next });
    };

    const addCaption = () => {
      setEditedStep({ ...editedStep, captions: [...captions, ''] });
    };

    const removeCaption = (index: number) => {
      if (captions.length <= 1) {
        setEditedStep({ ...editedStep, captions: [''] });
        return;
      }
      setEditedStep({ ...editedStep, captions: captions.filter((_, i) => i !== index) });
    };

    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20000,
          padding: '2rem',
        }}
        onClick={onCancel}
      >
        <div
          style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginBottom: '0.5rem' }}>Edit Power Card</h3>
          <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.5 }}>
            Sends players to Profile / Power Card. Optionally grant PP once when they open it, and show instructional
            captions on the mission step.
          </p>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Title (optional)</label>
            <input
              type="text"
              value={editedStep.title || ''}
              onChange={(e) => setEditedStep({ ...editedStep, title: e.target.value })}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              PP to grant (once)
            </label>
            <input
              type="number"
              min={0}
              step={1}
              value={editedStep.grantPP}
              onChange={(e) =>
                setEditedStep({
                  ...editedStep,
                  grantPP: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                })
              }
              style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
            />
            <p style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
              0 = no grant. Claimed only once per player mission step.
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <label style={{ fontWeight: 'bold' }}>Captions</label>
              <button
                type="button"
                onClick={addCaption}
                style={{
                  padding: '0.35rem 0.75rem',
                  background: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                + Add caption
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {captions.map((cap, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                  <textarea
                    value={cap}
                    onChange={(e) => setCaptionAt(i, e.target.value)}
                    rows={3}
                    placeholder={`Caption ${i + 1}`}
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      borderRadius: '0.25rem',
                      border: '1px solid #d1d5db',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeCaption(i)}
                    style={{
                      padding: '0.5rem 0.65rem',
                      background: '#fee2e2',
                      color: '#991b1b',
                      border: '1px solid #fecaca',
                      borderRadius: '0.375rem',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginBottom: '1.5rem',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={editedStep.requireVisit !== false}
              onChange={(e) => setEditedStep({ ...editedStep, requireVisit: e.target.checked })}
            />
            <span style={{ fontSize: '0.9rem' }}>Require opening Power Card before Next</span>
          </label>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <button
              type="button"
              onClick={() =>
                onSave({
                  ...editedStep,
                  captions: captions.map((c) => c.trim()).filter(Boolean).length
                    ? captions.map((c) => c.trim()).filter(Boolean)
                    : [''],
                  grantPP: Math.max(0, Math.floor(Number(editedStep.grantPP) || 0)),
                })
              }
              disabled={!canSave}
              style={{
                padding: '0.75rem 1.5rem',
                background: canSave
                  ? 'linear-gradient(135deg, #1d4ed8 0%, #4f46e5 55%, #7c3aed 100%)'
                  : '#9ca3af',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: canSave ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
              }}
            >
              Save Step
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '0.75rem 1.5rem',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default MissionSequenceBuilder;

