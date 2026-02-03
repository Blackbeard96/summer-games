import React, { useState } from 'react';
import { RewardTier, PenaltyTier, ArtifactReward } from '../types/assessmentGoals';
import { validateAssessmentConfig } from '../utils/assessmentGoals';

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
  classId: string;
  onSave: (data: any) => void;
  onCancel: () => void;
  initialData?: any; // Optional: assessment data for editing mode
}

const CreateAssessmentForm: React.FC<CreateAssessmentFormProps> = ({
  classId,
  onSave,
  onCancel,
  initialData
}) => {
  const isEditMode = !!initialData;
  
  // Initialize state from initialData if editing, otherwise use defaults
  const [title, setTitle] = useState(initialData?.title || '');
  const [type, setType] = useState<'test' | 'exam' | 'quiz' | 'habits'>(initialData?.type || 'test');
  const [date, setDate] = useState(initialData?.date ? (initialData.date.toDate ? initialData.date.toDate().toISOString().split('T')[0] : new Date(initialData.date).toISOString().split('T')[0]) : '');
  const [maxScore, setMaxScore] = useState(initialData?.maxScore || 100);
  const [minGoalScore, setMinGoalScore] = useState<number | ''>(initialData?.minGoalScore ?? 0);
  const [isLocked, setIsLocked] = useState(initialData?.isLocked || false);
  const [bonusCap, setBonusCap] = useState(initialData?.bonusCap || 75);
  const [penaltyCap, setPenaltyCap] = useState(initialData?.penaltyCap || 75);
  
  const [rewardTiers, setRewardTiers] = useState<RewardTier[]>(
    initialData?.rewardTiers || [
      { threshold: 0, bonus: 50 },   // Exact hit - top reward
      { threshold: 1, bonus: 35 },    // 1 away - Tier 1
      { threshold: 2, bonus: 20 }     // 2 away - Tier 2
    ]
  );
  
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

  const addRewardTier = () => {
    setRewardTiers([...rewardTiers, { threshold: 0, bonus: 0 }]);
  };

  const removeRewardTier = (index: number) => {
    setRewardTiers(rewardTiers.filter((_, i) => i !== index));
  };

  const updateRewardTier = (index: number, field: 'threshold' | 'bonus', value: number) => {
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

    onSave(assessmentData);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <h2>{isEditMode ? 'Edit Assessment' : 'Create Assessment'}</h2>
      
      <form onSubmit={handleSubmit}>
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
              onChange={(e) => setType(e.target.value as 'test' | 'exam' | 'quiz' | 'habits')}
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

        {/* Max Score and Minimum Goal Score (hidden for Habits) */}
        {type !== 'habits' && (
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
                  <input
                    type="number"
                    value={tier.threshold}
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

