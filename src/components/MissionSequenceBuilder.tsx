/**
 * Mission Sequence Builder Component
 * 
 * Allows admins to build and edit mission sequences: slides, video, battle, training, reflection, Level 2 Manifest.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MissionSequenceStep } from '../types/missions';
import type { TrainingQuizSet } from '../types/trainingGrounds';
import { uploadMissionImage, uploadMissionVideoResumable, uploadMissionPoster, isVideoFile } from '../utils/missionStorage';
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
}

/** All enemy types admins can assign per wave in battle steps. */
const ALL_ENEMY_TYPES = ['ZOMBIE', 'APPRENTICE', 'SOVEREIGN', 'UNVEILED'] as const;
type EnemyType = typeof ALL_ENEMY_TYPES[number];

const MissionSequenceBuilder: React.FC<MissionSequenceBuilderProps> = ({
  sequence,
  onChange,
  missionId,
  variant = 'mission',
}) => {
  const isMediaOnly = variant === 'cpuAwakeningMedia';
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
        if (!wc?.length) {
          return (
            step.bodyText?.substring(0, 60) ||
            step.title ||
            `Battle: ${step.battle.difficulty} – ${step.battle.waves || 3} waves, ${step.battle.enemySet.join(', ')}`
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
              .map((t: 'ZOMBIE' | 'APPRENTICE' | 'SOVEREIGN' | 'UNVEILED') => `${w.enemyTypeCounts?.[t] ?? 1}×${t}`)
              .join(',') || '';
          return [cpu && `CPU:${cpu}`, leg].filter(Boolean).join(' ') || '—';
        };
        const waveSummary = wc.map((w, i) => `W${i + 1}: ${part(w)}`).join(' · ');
        return step.bodyText?.substring(0, 60) || step.title || `Battle: ${step.battle.difficulty} – ${waveSummary}`;
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

          {(() => {
            if (!isBattle(editedStep)) return null;
            const b = editedStep.battle;
            type WaveEnemyType = 'ZOMBIE' | 'APPRENTICE' | 'SOVEREIGN' | 'UNVEILED';
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
                                <span>{enemyType}</span>
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
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Training Grounds quiz *</label>
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

  return null;
};

export default MissionSequenceBuilder;

