/**
 * Mission Sequence Builder Component
 * 
 * Allows admins to build and edit mission sequences with Story Slides, Videos, and Battles
 */

import React, { useState, useEffect } from 'react';
import { MissionSequenceStep } from '../types/missions';
import { uploadMissionImage, uploadMissionVideoResumable, uploadMissionPoster, isVideoFile } from '../utils/missionStorage';
import { DEFAULT_OPPONENTS } from './CPUOpponentMovesAdmin';
import { getAvailableArtifacts } from '../utils/artifactCompensation';

interface MissionSequenceBuilderProps {
  sequence: MissionSequenceStep[];
  onChange: (sequence: MissionSequenceStep[]) => void;
  missionId?: string; // For uploads (undefined during creation)
}

/** All enemy types admins can assign per wave in battle steps. */
const ALL_ENEMY_TYPES = ['ZOMBIE', 'APPRENTICE', 'SOVEREIGN', 'UNVEILED'] as const;
type EnemyType = typeof ALL_ENEMY_TYPES[number];

const MissionSequenceBuilder: React.FC<MissionSequenceBuilderProps> = ({
  sequence,
  onChange,
  missionId
}) => {
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
          { enemySet: ["ZOMBIE"] },
          { enemySet: ["ZOMBIE"] },
          { enemySet: ["ZOMBIE"] }
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

  const getStepSummary = (step: MissionSequenceStep): string => {
    switch (step.type) {
      case "STORY_SLIDE":
        return step.bodyText.substring(0, 60) || step.title || "Story Slide";
      case "VIDEO":
        return step.bodyText?.substring(0, 60) || step.title || `Video (${step.video.sourceType})`;
      case "BATTLE": {
        const wc = step.battle.waveConfigs;
        const waveSummary = wc?.length
          ? wc.map((w, i) => `W${i + 1}: ${w.enemySet.join(',') || '—'}`).join(' · ')
          : `${step.battle.waves || 3} waves, ${step.battle.enemySet.join(', ')}`;
        return step.bodyText?.substring(0, 60) || step.title || `Battle: ${step.battle.difficulty} – ${waveSummary}`;
      }
    }
  };

  const getStepBadge = (type: MissionSequenceStep['type']): string => {
    switch (type) {
      case "STORY_SLIDE": return "📖 Slide";
      case "VIDEO": return "🎥 Video";
      case "BATTLE": return "⚔️ Battle";
    }
  };

  return (
    <div style={{ marginTop: '2rem', padding: '1.5rem', background: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 'bold' }}>Mission Story Sequence</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
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
        </div>
      </div>

      {sequence.length === 0 ? (
        <p style={{ color: '#6b7280', fontStyle: 'italic', textAlign: 'center', padding: '2rem' }}>
          No sequence steps yet. Add steps to create a playable mission sequence.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {sequence.map((step, index) => (
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
                  background: step.type === 'STORY_SLIDE' ? '#dbeafe' : step.type === 'VIDEO' ? '#d1fae5' : '#fee2e2',
                  color: step.type === 'STORY_SLIDE' ? '#1e40af' : step.type === 'VIDEO' ? '#065f46' : '#991b1b',
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
          ))}
        </div>
      )}

      {/* Step Editor Modal */}
      {editingStep && (
        <StepEditorModal
          step={editingStep}
          onSave={updateStep}
          onCancel={() => setEditingStep(null)}
          uploading={uploading}
          setUploading={setUploading}
          missionId={missionId}
        />
      )}
    </div>
  );
};

interface StepEditorModalProps {
  step: MissionSequenceStep;
  onSave: (step: MissionSequenceStep) => void;
  onCancel: () => void;
  uploading: boolean;
  setUploading: (uploading: boolean) => void;
  missionId?: string;
}

const StepEditorModal: React.FC<StepEditorModalProps> = ({
  step,
  onSave,
  onCancel,
  uploading,
  setUploading,
  missionId
}) => {
  const [editedStep, setEditedStep] = useState<MissionSequenceStep>(step);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

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

  const handleImageUpload = async (file: File) => {
    if (!missionId) {
      alert('Please save the mission first before uploading images.');
      return;
    }
    setUploading(true);
    try {
      const { url, storagePath } = await uploadMissionImage(missionId, step.id, file);
      if (isStorySlide(editedStep)) {
        setEditedStep({
          ...editedStep,
          image: {
            ...editedStep.image,
            url,
            storagePath
          }
        });
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
      setEditedStep((prev) => {
        if (prev.type !== 'VIDEO') return prev;
        return {
          ...prev,
          video: {
            ...prev.video,
            url,
            storagePath,
            sourceType: 'UPLOAD'
          }
        };
      });
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
      if (isVideo(editedStep)) {
        setEditedStep({
          ...editedStep,
          video: {
            ...editedStep.video,
            posterUrl: url
          }
        });
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
                  }}
                  disabled={uploading}
                  style={{ marginBottom: '0.5rem' }}
                />
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
          </div>

          {(() => {
            if (!isBattle(editedStep)) return null;
            const b = editedStep.battle;
            type WaveEntry = { enemySet: ("ZOMBIE" | "APPRENTICE" | "SOVEREIGN" | "UNVEILED")[]; opponentIds?: string[] };
            const waveConfigs: WaveEntry[] = b.waveConfigs?.length
              ? b.waveConfigs.map(w => ({ enemySet: w.enemySet || [], opponentIds: w.opponentIds || [] }))
              : Array.from({ length: b.waves || 3 }, () => ({ enemySet: [...b.enemySet], opponentIds: [] as string[] }));
            const updateWaveConfigs = (next: WaveEntry[]) => {
              const allEnemies = next.flatMap(w => w.enemySet);
              const union = Array.from(new Set(allEnemies)) as ("ZOMBIE" | "APPRENTICE" | "SOVEREIGN" | "UNVEILED")[];
              setEditedStep({
                ...editedStep,
                battle: {
                  ...b,
                  waveConfigs: next,
                  waves: next.length,
                  enemySet: union.length ? union : b.enemySet,
                  maxEnemiesPerWave: b.maxEnemiesPerWave || 4
                }
              });
            };
            const setWaveEnemySet = (waveIndex: number, enemySet: ("ZOMBIE" | "APPRENTICE" | "SOVEREIGN" | "UNVEILED")[]) => {
              const next = waveConfigs.map((w, i) => i === waveIndex ? { ...w, enemySet } : w);
              updateWaveConfigs(next);
            };
            const setWaveOpponentIds = (waveIndex: number, opponentIds: string[]) => {
              const next = waveConfigs.map((w, i) => i === waveIndex ? { ...w, opponentIds } : w);
              updateWaveConfigs(next);
            };
            const addWave = () => updateWaveConfigs([...waveConfigs, { enemySet: waveConfigs.length ? [...waveConfigs[0].enemySet] : ['ZOMBIE'], opponentIds: [] }]);
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
                      <div style={{ marginBottom: '0.5rem' }}>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Enemy types (legacy)</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
                          {ALL_ENEMY_TYPES.map(enemyType => (
                            <label key={enemyType} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <input
                                type="checkbox"
                                checked={wave.enemySet.includes(enemyType)}
                                onChange={(e) => {
                                  const nextSet = e.target.checked
                                    ? [...wave.enemySet, enemyType]
                                    : wave.enemySet.filter((x: string) => x !== enemyType);
                                  setWaveEnemySet(idx, nextSet as ("ZOMBIE" | "APPRENTICE" | "SOVEREIGN" | "UNVEILED")[]);
                                }}
                              />
                              <span>{enemyType}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>CPU Opponents (from list) – used when set</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.75rem' }}>
                          {DEFAULT_OPPONENTS.map(opp => (
                            <label key={opp.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.875rem' }}>
                              <input
                                type="checkbox"
                                checked={(wave.opponentIds || []).includes(opp.id)}
                                onChange={(e) => {
                                  const current = wave.opponentIds || [];
                                  const next = e.target.checked ? [...current, opp.id] : current.filter(id => id !== opp.id);
                                  setWaveOpponentIds(idx, next);
                                }}
                              />
                              <span>{opp.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Max Enemies Per Wave</label>
                  <input
                    type="number"
                    value={b.maxEnemiesPerWave ?? 4}
                    onChange={(e) => {
                      if (isBattle(editedStep)) {
                        setEditedStep({
                          ...editedStep,
                          battle: { ...editedStep.battle, maxEnemiesPerWave: parseInt(e.target.value, 10) || 4 }
                        });
                      }
                    }}
                    min={1}
                    max={10}
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db' }}
                  />
                </div>
              </>
            );
          })()}

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
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: '600' }}>Drops (e.g. Artifacts)</label>
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
                      style={{ padding: '0.35rem', borderRadius: '0.25rem', border: '1px solid #d1d5db', minWidth: '140px' }}
                    >
                      <option value="">— Select artifact —</option>
                      {getAvailableArtifacts().map(a => (
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

  return null;
};

export default MissionSequenceBuilder;

