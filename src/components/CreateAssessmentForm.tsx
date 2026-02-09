import React, { useState, useEffect } from 'react';
import { RewardTier, PenaltyTier, ArtifactReward, RewardTierLabel } from '../types/assessmentGoals';
import { validateAssessmentConfig } from '../utils/assessmentGoals';
import { HERO_JOURNEY_STAGES } from '../utils/heroJourneyStages';

// Available artifacts for selection (from Marketplace)
const AVAILABLE_ARTIFACTS = [
  { id: 'checkin-free', name: 'Get Out of Check-in Free' },
  { id: 'shield', name: 'Shield' },
  { id: 'health-potion-25', name: 'Health Potion (25)' },
  { id: 'lunch-mosley', name: 'Lunch on Mosley' },
  { id: 'forge-token', name: 'Forge Token' },
  { id: 'uxp-credit-1', name: '+1 UXP Credit' },
  { id: 'uxp-credit', name: '+2 UXP Credit' },
  { id: 'uxp-credit-4', name: '+4 UXP Credit' },
  { id: 'double-pp', name: 'Double PP' },
  { id: 'skip-the-line', name: 'Skip the Line' },
  { id: 'work-extension', name: 'Work Extension' },
  { id: 'instant-a', name: 'Instant A' },
  { id: 'blaze-ring', name: 'Blaze Ring' },
  { id: 'terra-ring', name: 'Terra Ring' },
  { id: 'aqua-ring', name: 'Aqua Ring' },
  { id: 'air-ring', name: 'Air Ring' },
  { id: 'instant-regrade-pass', name: 'Instant Regrade Pass' },
  { id: 'captain-helmet', name: "Captain's Helmet" }
];

interface CreateAssessmentFormProps {
  classId?: string; // Optional: for edit mode or single class selection
  classes?: Array<{ id: string; name: string }>; // Optional: for multi-class selection
  onSave: (data: any, selectedClassIds?: string[]) => void; // Pass selected class IDs
  onCancel: () => void;
  initialData?: any; // Optional: assessment data for editing mode
}

const CreateAssessmentForm: React.FC<CreateAssessmentFormProps> = ({
  classId,
  classes,
  onSave,
  onCancel,
  initialData
}) => {
  const isEditMode = !!initialData;
  const isMultiClassMode = !isEditMode && classes && classes.length > 0;
  
  // State for multi-class selection
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>(
    classId ? [classId] : []
  );
  
  // Initialize state from initialData if editing, otherwise use defaults
  const [title, setTitle] = useState(initialData?.title || '');
  const [type, setType] = useState<'test' | 'exam' | 'quiz' | 'habits' | 'story-goal'>(initialData?.type || 'test');
  const [date, setDate] = useState(initialData?.date ? (initialData.date.toDate ? initialData.date.toDate().toISOString().split('T')[0] : new Date(initialData.date).toISOString().split('T')[0]) : '');
  const [maxScore, setMaxScore] = useState(initialData?.maxScore || 100);
  const [minGoalScore, setMinGoalScore] = useState<number | ''>(initialData?.minGoalScore ?? 0);
  const [isLocked, setIsLocked] = useState(initialData?.isLocked || false);
  const [bonusCap, setBonusCap] = useState(initialData?.bonusCap || 75);
  const [penaltyCap, setPenaltyCap] = useState(initialData?.penaltyCap || 75);
  
  // Initialize reward tiers - label-based for Story Goals, threshold-based for others
  const initializeRewardTiers = (): RewardTier[] => {
    const isStoryGoal = initialData?.type === 'story-goal' || type === 'story-goal';
    
    if (initialData?.rewardTiers) {
      // If it's a Story Goal, use label-based system
      if (isStoryGoal) {
        // Check if using old threshold-based system (needs migration)
        const hasThresholds = initialData.rewardTiers.some((tier: RewardTier) => tier.threshold !== undefined && tier.label === undefined);
        if (hasThresholds) {
          // Migrate: keep bonus values but assign default labels
          return [
            { label: 'Completed', bonus: initialData.rewardTiers[0]?.bonus || 50 },
            { label: 'Almost', bonus: initialData.rewardTiers[1]?.bonus || 35 },
            { label: 'Attempted', bonus: initialData.rewardTiers[2]?.bonus || 20 },
            { label: 'Did not Complete', bonus: 0 }
          ];
        }
        // Already using label-based system
        return initialData.rewardTiers;
      } else {
        // For non-Story Goals, use threshold-based system
        // Check if it has labels (shouldn't happen, but handle it)
        const hasLabels = initialData.rewardTiers.some((tier: RewardTier) => tier.label !== undefined);
        if (hasLabels) {
        // Convert labels back to thresholds (fallback to defaults)
        return [
          { threshold: 0, bonus: initialData.rewardTiers.find((t: RewardTier) => t.label === 'Completed')?.bonus || 50 },
          { threshold: 1, bonus: initialData.rewardTiers.find((t: RewardTier) => t.label === 'Almost')?.bonus || 35 },
          { threshold: 2, bonus: initialData.rewardTiers.find((t: RewardTier) => t.label === 'Attempted')?.bonus || 20 }
        ];
        }
        // Already using threshold-based system
        return initialData.rewardTiers;
      }
    }
    
    // Default tiers based on type
    if (isStoryGoal) {
      return [
        { label: 'Completed', bonus: 50 },
        { label: 'Almost', bonus: 35 },
        { label: 'Attempted', bonus: 20 },
        { label: 'Did not Complete', bonus: 0 }
      ];
    } else {
      // Default threshold-based tiers for test/exam/quiz
      return [
        { threshold: 0, bonus: 50 },
        { threshold: 1, bonus: 35 },
        { threshold: 2, bonus: 20 }
      ];
    }
  };

  const [rewardTiers, setRewardTiers] = useState<RewardTier[]>(initializeRewardTiers());
  
  const [missPenaltyTiers, setMissPenaltyTiers] = useState<PenaltyTier[]>(
    initialData?.missPenaltyTiers || [
      { threshold: 5, penalty: 15 },  // 3-5 away - Penalty Tier 1
      { threshold: 20, penalty: 50 }   // 6+ away - Penalty Tier 2 (max)
    ]
  );

  // Habits-specific fields
  const [defaultDuration, setDefaultDuration] = useState<'1_class' | '1_day' | '3_days' | '1_week'>(
    initialData?.habitsConfig?.defaultDuration || '1_week'
  );
  const [defaultRewardPP, setDefaultRewardPP] = useState<number | ''>(
    initialData?.habitsConfig?.defaultRewardPP ?? ''
  );
  const [defaultRewardXP, setDefaultRewardXP] = useState<number | ''>(
    initialData?.habitsConfig?.defaultRewardXP ?? ''
  );
  const [defaultConsequencePP, setDefaultConsequencePP] = useState<number | ''>(
    initialData?.habitsConfig?.defaultConsequencePP ?? ''
  );
  const [defaultConsequenceXP, setDefaultConsequenceXP] = useState<number | ''>(
    initialData?.habitsConfig?.defaultConsequenceXP ?? ''
  );
  const [requireNotesOnCheckIn, setRequireNotesOnCheckIn] = useState(
    initialData?.habitsConfig?.requireNotesOnCheckIn || false
  );

  // Story Goal-specific fields
  const [storyStageId, setStoryStageId] = useState<string>(
    initialData?.storyGoal?.stageId || ''
  );
  const [milestoneTitle, setMilestoneTitle] = useState<string>(
    initialData?.storyGoal?.milestoneTitle || ''
  );
  const [storyPrompt, setStoryPrompt] = useState<string>(
    initialData?.storyGoal?.prompt || ''
  );

  // Update reward tiers when type changes
  useEffect(() => {
    const isStoryGoal = type === 'story-goal';
    const hasLabels = rewardTiers.some(t => t.label !== undefined);
    const hasThresholds = rewardTiers.some(t => t.threshold !== undefined);
    
    // Only migrate if we have the wrong type of tiers
    if (isStoryGoal && hasThresholds && !hasLabels) {
      // Convert threshold-based to label-based
      setRewardTiers([
        { label: 'Completed', bonus: rewardTiers[0]?.bonus || 50 },
        { label: 'Almost', bonus: rewardTiers[1]?.bonus || 35 },
        { label: 'Attempted', bonus: rewardTiers[2]?.bonus || 20 },
        { label: 'Did not Complete', bonus: 0 }
      ]);
    } else if (!isStoryGoal && hasLabels && !hasThresholds) {
      // Convert label-based to threshold-based
      setRewardTiers([
        { threshold: 0, bonus: rewardTiers.find(t => t.label === 'Completed')?.bonus || 50 },
        { threshold: 1, bonus: rewardTiers.find(t => t.label === 'Almost')?.bonus || 35 },
        { threshold: 2, bonus: rewardTiers.find(t => t.label === 'Attempted')?.bonus || 20 }
      ]);
    }
  }, [type]); // Only run when type changes

  const addRewardTier = () => {
    const isStoryGoal = type === 'story-goal';
    
    if (isStoryGoal) {
      // For Story Goals: Only allow adding if we don't have all 4 labels yet
      const availableLabels: RewardTierLabel[] = ['Completed', 'Almost', 'Attempted', 'Did not Complete'];
      const usedLabels = rewardTiers.map(t => t.label).filter(Boolean);
      const nextLabel = availableLabels.find(l => !usedLabels.includes(l));
      if (nextLabel) {
        setRewardTiers([...rewardTiers, { label: nextLabel, bonus: 0 }]);
      }
    } else {
      // For other assessment types: Add threshold-based tier
      setRewardTiers([...rewardTiers, { threshold: 0, bonus: 0 }]);
    }
  };

  const removeRewardTier = (index: number) => {
    setRewardTiers(rewardTiers.filter((_, i) => i !== index));
  };

  const updateRewardTier = (index: number, field: 'label' | 'threshold' | 'bonus', value: RewardTierLabel | number) => {
    const updated = [...rewardTiers];
    updated[index] = { ...updated[index], [field]: value };
    setRewardTiers(updated);
  };

  const addPenaltyTier = () => {
    setMissPenaltyTiers([...missPenaltyTiers, { threshold: 0, penalty: 0 }]);
  };

  const removePenaltyTier = (index: number) => {
    setMissPenaltyTiers(missPenaltyTiers.filter((_, i) => i !== index));
  };

  const updatePenaltyTier = (index: number, field: 'threshold' | 'penalty', value: number) => {
    const updated = [...missPenaltyTiers];
    updated[index] = { ...updated[index], [field]: value };
    setMissPenaltyTiers(updated);
  };

  const addArtifactToTier = (tierIndex: number) => {
    const updated = [...rewardTiers];
    if (!updated[tierIndex].artifacts) {
      updated[tierIndex].artifacts = [];
    }
    updated[tierIndex].artifacts!.push({
      artifactId: '',
      artifactName: '',
      quantity: 1
    });
    setRewardTiers(updated);
  };

  const removeArtifactFromTier = (tierIndex: number, artifactIndex: number) => {
    const updated = [...rewardTiers];
    if (updated[tierIndex].artifacts) {
      updated[tierIndex].artifacts = updated[tierIndex].artifacts!.filter((_, i) => i !== artifactIndex);
    }
    setRewardTiers(updated);
  };

  const updateArtifactInTier = (tierIndex: number, artifactIndex: number, field: keyof ArtifactReward, value: string | number) => {
    const updated = [...rewardTiers];
    if (updated[tierIndex].artifacts && updated[tierIndex].artifacts![artifactIndex]) {
      updated[tierIndex].artifacts![artifactIndex] = {
        ...updated[tierIndex].artifacts![artifactIndex],
        [field]: value
      };
      // If artifactId changes, update artifactName
      if (field === 'artifactId' && typeof value === 'string') {
        const artifact = AVAILABLE_ARTIFACTS.find(a => a.id === value);
        if (artifact) {
          updated[tierIndex].artifacts![artifactIndex].artifactName = artifact.name;
        }
      }
    }
    setRewardTiers(updated);
  };

  // Handler for class selection
  const handleClassToggle = (classId: string) => {
    setSelectedClassIds(prev => {
      if (prev.includes(classId)) {
        return prev.filter(id => id !== classId);
      } else {
        return [...prev, classId];
      }
    });
  };

  // Select all classes
  const handleSelectAll = () => {
    if (classes && selectedClassIds.length === classes.length) {
      setSelectedClassIds([]);
    } else if (classes) {
      setSelectedClassIds(classes.map(c => c.id));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const assessmentData: any = {
      title,
      type,
      date,
      maxScore,
      minGoalScore: minGoalScore === '' ? undefined : Number(minGoalScore),
      isLocked,
      rewardTiers,
      missPenaltyTiers,
      bonusCap,
      penaltyCap
    };

    // Add Habits-specific config if type is habits
    // Only include fields that have values (Firestore doesn't allow undefined)
    if (type === 'habits') {
      const habitsConfig: any = {
        defaultDuration,
        requireNotesOnCheckIn
      };
      
      // Only include numeric fields if they have values
      if (defaultRewardPP !== '') {
        habitsConfig.defaultRewardPP = Number(defaultRewardPP);
      }
      if (defaultRewardXP !== '') {
        habitsConfig.defaultRewardXP = Number(defaultRewardXP);
      }
      if (defaultConsequencePP !== '') {
        habitsConfig.defaultConsequencePP = Number(defaultConsequencePP);
      }
      if (defaultConsequenceXP !== '') {
        habitsConfig.defaultConsequenceXP = Number(defaultConsequenceXP);
      }
      
      assessmentData.habitsConfig = habitsConfig;
    }

    // Add Story Goal-specific config if type is story-goal
    if (type === 'story-goal') {
      if (!storyStageId) {
        alert('Please select a Story Stage for the Story Goal');
        return;
      }
      
      const selectedStage = HERO_JOURNEY_STAGES.find(s => s.id === storyStageId);
      if (!selectedStage) {
        alert('Invalid story stage selected');
        return;
      }

      const storyGoalConfig: any = {
        stageId: storyStageId,
        stageLabel: selectedStage.label
      };

      // Only include optional fields if they have values
      if (milestoneTitle.trim()) {
        storyGoalConfig.milestoneTitle = milestoneTitle.trim();
      }
      if (storyPrompt.trim()) {
        storyGoalConfig.prompt = storyPrompt.trim();
      }

      assessmentData.storyGoal = storyGoalConfig;
    }

    // For multi-class mode, pass selected class IDs
    if (isMultiClassMode) {
      if (selectedClassIds.length === 0) {
        alert('Please select at least one class');
        return;
      }
      onSave(assessmentData, selectedClassIds);
    } else {
      // Single class mode (edit or legacy single class)
      onSave(assessmentData, classId ? [classId] : undefined);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h2>{isEditMode ? 'Edit Assessment' : 'Create Assessment'}</h2>
      
      <form onSubmit={handleSubmit}>
        {/* Class Selection (Multi-select for create mode) */}
        {isMultiClassMode && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f0f9ff', borderRadius: '0.5rem', border: '2px solid #3b82f6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <label style={{ display: 'block', fontWeight: 'bold', color: '#1e40af' }}>
                Select Classes: <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <button
                type="button"
                onClick={handleSelectAll}
                style={{
                  padding: '0.375rem 0.75rem',
                  background: '#3b82f6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '500'
                }}
              >
                {classes && selectedClassIds.length === classes.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' }}>
              {classes.map(classItem => (
                <label
                  key={classItem.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem',
                    background: selectedClassIds.includes(classItem.id) ? '#dbeafe' : 'white',
                    borderRadius: '0.375rem',
                    cursor: 'pointer',
                    border: selectedClassIds.includes(classItem.id) ? '2px solid #3b82f6' : '1px solid #d1d5db'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedClassIds.includes(classItem.id)}
                    onChange={() => handleClassToggle(classItem.id)}
                    style={{ width: '1.25rem', height: '1.25rem', cursor: 'pointer' }}
                  />
                  <span style={{ fontWeight: selectedClassIds.includes(classItem.id) ? '600' : '400' }}>
                    {classItem.name}
                  </span>
                </label>
              ))}
            </div>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
              {selectedClassIds.length} of {classes?.length || 0} class{classes && classes.length !== 1 ? 'es' : ''} selected
            </p>
          </div>
        )}

        {/* Basic Info */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
            Title:
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid #d1d5db',
              fontSize: '1rem'
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Type:
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'test' | 'exam' | 'quiz' | 'habits' | 'story-goal')}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid #d1d5db',
                fontSize: '1rem'
              }}
            >
              <option value="test">Test</option>
              <option value="exam">Exam</option>
              <option value="quiz">Quiz</option>
              <option value="habits">Habits</option>
              <option value="story-goal">Story Goal</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Date:
            </label>
            <input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid #d1d5db',
                fontSize: '1rem'
              }}
            />
          </div>
        </div>

        {/* Max Score and Minimum Goal Score (hidden for Habits and Story Goals) */}
        {type !== 'habits' && type !== 'story-goal' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Max Score:
              </label>
              <input
                type="number"
                value={maxScore}
                onChange={(e) => {
                  const newMax = parseInt(e.target.value) || 100;
                  setMaxScore(newMax);
                  // Ensure minGoalScore doesn't exceed maxScore
                  if (minGoalScore !== '' && Number(minGoalScore) > newMax) {
                    setMinGoalScore(newMax);
                  }
                }}
                min="1"
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Minimum Goal Score (Optional):
              </label>
              <input
                type="number"
                value={minGoalScore}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setMinGoalScore('');
                  } else {
                    const numValue = parseInt(value) || 0;
                    // Ensure minGoalScore doesn't exceed maxScore
                    setMinGoalScore(Math.min(numValue, maxScore));
                  }
                }}
                min="0"
                max={maxScore}
                placeholder="0"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem'
                }}
              />
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                Students must set a goal of at least this score (default: 0)
              </p>
            </div>
          </div>
        )}

        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={isLocked}
              onChange={(e) => setIsLocked(e.target.checked)}
            />
            <span style={{ fontWeight: 'bold' }}>Locked (students cannot change goals)</span>
          </label>
        </div>

        {/* Habits-specific fields (shown only when type === 'habits') */}
        {type === 'habits' && (
          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f3f4f6', borderRadius: '0.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Habits Configuration</h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Default Duration:
              </label>
              <select
                value={defaultDuration}
                onChange={(e) => setDefaultDuration(e.target.value as '1_class' | '1_day' | '3_days' | '1_week')}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem'
                }}
              >
                <option value="1_class">1 Class</option>
                <option value="1_day">1 Day</option>
                <option value="3_days">3 Days</option>
                <option value="1_week">1 Week</option>
              </select>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                Default time frame for habit commitments (students can choose a different duration if allowed)
              </p>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Default Reward PP:
                </label>
                <input
                  type="number"
                  value={defaultRewardPP}
                  onChange={(e) => setDefaultRewardPP(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                  min="0"
                  placeholder="50"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Default Reward XP:
                </label>
                <input
                  type="number"
                  value={defaultRewardXP}
                  onChange={(e) => setDefaultRewardXP(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                  min="0"
                  placeholder="25"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    fontSize: '1rem'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Default Consequence PP (penalty):
                </label>
                <input
                  type="number"
                  value={defaultConsequencePP}
                  onChange={(e) => setDefaultConsequencePP(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                  min="0"
                  placeholder="0"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    fontSize: '1rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                  Default Consequence XP (penalty):
                </label>
                <input
                  type="number"
                  value={defaultConsequenceXP}
                  onChange={(e) => setDefaultConsequenceXP(e.target.value === '' ? '' : parseInt(e.target.value) || 0)}
                  min="0"
                  placeholder="0"
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db',
                    fontSize: '1rem'
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={requireNotesOnCheckIn}
                  onChange={(e) => setRequireNotesOnCheckIn(e.target.checked)}
                  style={{ width: '1rem', height: '1rem' }}
                />
                <span style={{ fontWeight: 'bold' }}>Require notes on check-in</span>
              </label>
              <p style={{ margin: '0.25rem 0 0 1.5rem', fontSize: '0.875rem', color: '#6b7280' }}>
                Students must provide notes/reflection when checking in
              </p>
            </div>
          </div>
        )}

        {/* Story Goal Configuration */}
        {type === 'story-goal' && (
          <div style={{ 
            marginBottom: '1.5rem', 
            padding: '1.5rem', 
            background: '#f0f9ff', 
            border: '2px solid #3b82f6', 
            borderRadius: '0.75rem' 
          }}>
            <h3 style={{ marginBottom: '1rem', color: '#1e40af' }}>Story Goal Configuration</h3>
            
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Story Stage: <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={storyStageId}
                onChange={(e) => setStoryStageId(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem'
                }}
              >
                <option value="">Select a Hero's Journey stage...</option>
                {HERO_JOURNEY_STAGES.map(stage => (
                  <option key={stage.id} value={stage.id}>
                    {stage.label}
                  </option>
                ))}
              </select>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                This stage will be marked as completed when students finish this goal
              </p>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Milestone Title (Optional):
              </label>
              <input
                type="text"
                value={milestoneTitle}
                onChange={(e) => setMilestoneTitle(e.target.value)}
                placeholder="e.g., 'Accept the invite', 'Complete Squad Up'"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem'
                }}
              />
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                A short title for this milestone (shown to students)
              </p>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Story Notes / Prompt (Optional):
              </label>
              <textarea
                value={storyPrompt}
                onChange={(e) => setStoryPrompt(e.target.value)}
                placeholder="Optional prompt or notes shown to students when setting this goal"
                rows={4}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #d1d5db',
                  fontSize: '1rem',
                  fontFamily: 'inherit'
                }}
              />
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                Additional context or instructions for students
              </p>
            </div>

            {/* Student Goal Field Info for Story Goals */}
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '2px solid #3b82f6' }}>
              <h4 style={{ marginBottom: '1rem', color: '#1e40af', fontSize: '1rem' }}>Student Goal Field</h4>
              
              <div style={{ marginTop: '1rem', padding: '1rem', background: '#fef3c7', borderRadius: '0.5rem', border: '1px solid #fbbf24' }}>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#92400e', fontWeight: 'bold', marginBottom: '0.75rem' }}>
                  📝 Student Goal Field Preview:
                </p>
                <div style={{ background: 'white', padding: '1rem', borderRadius: '0.5rem', border: '2px solid #fbbf24' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#92400e', fontSize: '0.875rem' }}>
                    Describe Your Goal: <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <textarea
                    disabled
                    placeholder="e.g., I will complete all my homework assignments on time, I will participate actively in class discussions..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      border: '2px solid #fbbf24',
                      fontSize: '1rem',
                      background: '#fef3c7',
                      opacity: 0.7,
                      cursor: 'not-allowed',
                      fontFamily: 'inherit',
                      resize: 'none'
                    }}
                  />
                  <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.75rem', color: '#78350f', fontStyle: 'italic' }}>
                    Students must enter 3-500 characters describing their goal
                  </p>
                </div>
                <p style={{ margin: '0.75rem 0 0 0', fontSize: '0.875rem', color: '#78350f', lineHeight: '1.5' }}>
                  Story Goals are text-based (similar to Habit Goals). Students will describe their goal in their own words and can provide evidence of consistency.
                </p>
              </div>
            </div>

            {/* Area of Consistency Configuration */}
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '2px solid #3b82f6' }}>
              <h4 style={{ marginBottom: '1rem', color: '#1e40af', fontSize: '1rem' }}>Area of Consistency</h4>
              
              <div style={{ padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#6b7280', lineHeight: '1.5' }}>
                  Students will be able to provide evidence of their consistency when setting their goal. 
                  This field is optional and allows students to describe how they've been working toward their goal consistently.
                </p>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: '#6b7280', fontStyle: 'italic' }}>
                  💡 Tip: You can mention this in the "Story Notes / Prompt" field above to encourage students to provide evidence.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Reward Tiers (hidden for Habits) */}
        {type !== 'habits' && (
          <>
          <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>Reward Tiers</h3>
            <button
              type="button"
              onClick={addRewardTier}
              style={{
                padding: '0.5rem 1rem',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer'
              }}
            >
              + Add Tier
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {rewardTiers.map((tier, index) => (
              <div key={index} style={{ 
                border: '1px solid #e5e7eb', 
                borderRadius: '0.5rem', 
                padding: '1rem',
                background: '#f9fafb'
              }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                  {type === 'story-goal' ? (
                    // Story Goals: Use label dropdown
                    <>
                      <select
                        value={tier.label || ''}
                        onChange={(e) => updateRewardTier(index, 'label', e.target.value as RewardTierLabel)}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          borderRadius: '0.5rem',
                          border: '1px solid #d1d5db',
                          fontSize: '1rem'
                        }}
                      >
                        <option value="Completed">Completed</option>
                        <option value="Almost">Almost</option>
                        <option value="Attempted">Attempted</option>
                        <option value="Did not Complete">Did not Complete</option>
                      </select>
                      <span>→</span>
                    </>
                  ) : (
                    // Other assessment types: Use threshold number input
                    <>
                      <input
                        type="number"
                        value={tier.threshold ?? 0}
                        onChange={(e) => updateRewardTier(index, 'threshold', parseInt(e.target.value) || 0)}
                        placeholder="Threshold"
                        min="0"
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          borderRadius: '0.5rem',
                          border: '1px solid #d1d5db'
                        }}
                      />
                      <span>points →</span>
                    </>
                  )}
                  <input
                    type="number"
                    value={tier.bonus}
                    onChange={(e) => updateRewardTier(index, 'bonus', parseInt(e.target.value) || 0)}
                    placeholder="Bonus PP"
                    min="0"
                    style={{
                      flex: 1,
                      padding: '0.5rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #d1d5db'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeRewardTier(index)}
                    style={{
                      padding: '0.5rem',
                      background: '#ef4444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '0.5rem',
                      cursor: 'pointer'
                    }}
                  >
                    ×
                  </button>
                </div>
                
                {/* Artifact Rewards for this tier */}
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#6b7280' }}>Artifact Rewards:</span>
                    <button
                      type="button"
                      onClick={() => addArtifactToTier(index)}
                      style={{
                        padding: '0.25rem 0.5rem',
                        background: '#3b82f6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      + Add Artifact
                    </button>
                  </div>
                  
                  {tier.artifacts && tier.artifacts.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {tier.artifacts.map((artifact, artifactIndex) => (
                        <div key={artifactIndex} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <select
                            value={artifact.artifactId}
                            onChange={(e) => updateArtifactInTier(index, artifactIndex, 'artifactId', e.target.value)}
                            style={{
                              flex: 2,
                              padding: '0.5rem',
                              borderRadius: '0.5rem',
                              border: '1px solid #d1d5db',
                              fontSize: '0.875rem'
                            }}
                          >
                            <option value="">Select artifact...</option>
                            {AVAILABLE_ARTIFACTS.map(art => (
                              <option key={art.id} value={art.id}>{art.name}</option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={artifact.quantity || 1}
                            onChange={(e) => updateArtifactInTier(index, artifactIndex, 'quantity', parseInt(e.target.value) || 1)}
                            placeholder="Qty"
                            min="1"
                            style={{
                              flex: 1,
                              padding: '0.5rem',
                              borderRadius: '0.5rem',
                              border: '1px solid #d1d5db',
                              fontSize: '0.875rem',
                              width: '60px'
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => removeArtifactFromTier(index, artifactIndex)}
                            style={{
                              padding: '0.5rem',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '0.5rem',
                              cursor: 'pointer',
                              fontSize: '0.875rem'
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Penalty Tiers */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3>Penalty Tiers</h3>
            <button
              type="button"
              onClick={addPenaltyTier}
              style={{
                padding: '0.5rem 1rem',
                background: '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: 'pointer'
              }}
            >
              + Add Tier
            </button>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {missPenaltyTiers.map((tier, index) => (
              <div key={index} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="number"
                  value={tier.threshold}
                  onChange={(e) => updatePenaltyTier(index, 'threshold', parseInt(e.target.value) || 0)}
                  placeholder="Threshold"
                  min="0"
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db'
                  }}
                />
                <span>points off →</span>
                <input
                  type="number"
                  value={tier.penalty}
                  onChange={(e) => updatePenaltyTier(index, 'penalty', parseInt(e.target.value) || 0)}
                  placeholder="Penalty PP"
                  min="0"
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #d1d5db'
                  }}
                />
                <button
                  type="button"
                  onClick={() => removePenaltyTier(index)}
                  style={{
                    padding: '0.5rem',
                    background: '#ef4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '0.5rem',
                    cursor: 'pointer'
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Caps */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Bonus Cap:
            </label>
            <input
              type="number"
              value={bonusCap}
              onChange={(e) => setBonusCap(parseInt(e.target.value) || 75)}
              min="0"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid #d1d5db',
                fontSize: '1rem'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Penalty Cap:
            </label>
            <input
              type="number"
              value={penaltyCap}
              onChange={(e) => setPenaltyCap(parseInt(e.target.value) || 75)}
              min="0"
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: '1px solid #d1d5db',
                fontSize: '1rem'
              }}
            />
          </div>
        </div>
          </>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#e5e7eb',
              color: '#374151',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            style={{
              padding: '0.75rem 1.5rem',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {isEditMode ? 'Update Assessment' : 'Create Assessment'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateAssessmentForm;

