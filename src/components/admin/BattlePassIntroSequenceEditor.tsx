import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { BattlePassIntroStep } from '../../types/missions';
import {
  uploadBattlePassIntroImage,
  uploadBattlePassIntroPoster,
  uploadBattlePassIntroVideoResumable,
} from '../../utils/battlePassStorage';
import { isVideoFile } from '../../utils/missionStorage';

interface Props {
  seasonId: string;
  sequence: BattlePassIntroStep[];
  onChange: (sequence: BattlePassIntroStep[]) => void;
}

function generateStepId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `step_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function isStorySlide(s: BattlePassIntroStep): s is Extract<BattlePassIntroStep, { type: 'STORY_SLIDE' }> {
  return s.type === 'STORY_SLIDE';
}

function isVideo(s: BattlePassIntroStep): s is Extract<BattlePassIntroStep, { type: 'VIDEO' }> {
  return s.type === 'VIDEO';
}

const BattlePassIntroSequenceEditor: React.FC<Props> = ({ seasonId, sequence, onChange }) => {
  const [editingStep, setEditingStep] = useState<BattlePassIntroStep | null>(null);
  const [uploading, setUploading] = useState(false);

  const addStorySlide = () => {
    const newStep: BattlePassIntroStep = {
      id: generateStepId(),
      type: 'STORY_SLIDE',
      order: sequence.length,
      bodyText: '',
      image: { url: '' },
    };
    onChange([...sequence, newStep]);
    setEditingStep(newStep);
  };

  const addVideo = () => {
    const newStep: BattlePassIntroStep = {
      id: generateStepId(),
      type: 'VIDEO',
      order: sequence.length,
      video: {
        sourceType: 'URL',
        url: '',
        autoplay: false,
        muted: false,
        controls: true,
      },
    };
    onChange([...sequence, newStep]);
    setEditingStep(newStep);
  };

  const deleteStep = (stepId: string) => {
    const next = sequence.filter((s) => s.id !== stepId).map((s, idx) => ({ ...s, order: idx }));
    onChange(next);
    if (editingStep?.id === stepId) setEditingStep(null);
  };

  const moveStep = (stepId: string, direction: 'up' | 'down') => {
    const index = sequence.findIndex((s) => s.id === stepId);
    if (index === -1) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sequence.length) return;
    const nextArr = [...sequence];
    [nextArr[index], nextArr[newIndex]] = [nextArr[newIndex], nextArr[index]];
    onChange(nextArr.map((s, idx) => ({ ...s, order: idx })));
  };

  const updateStep = (updated: BattlePassIntroStep) => {
    onChange(sequence.map((s) => (s.id === updated.id ? updated : s)));
    setEditingStep(null);
  };

  const persistStepDraftToParent = useCallback(
    (updated: BattlePassIntroStep) => {
      onChange(sequence.map((s) => (s.id === updated.id ? updated : s)));
      setEditingStep(updated);
    },
    [sequence, onChange]
  );

  const summary = (step: BattlePassIntroStep): string => {
    if (step.type === 'STORY_SLIDE') {
      return step.bodyText.substring(0, 60) || step.title || 'Story slide';
    }
    return step.bodyText?.substring(0, 60) || step.title || `Video (${step.video.sourceType})`;
  };

  const effectiveSeasonId = typeof seasonId === 'string' ? seasonId.trim() : '';

  return (
    <div
      style={{
        marginTop: 12,
        padding: '1rem',
        background: '#f8fafc',
        borderRadius: 10,
        border: '1px solid #e2e8f0',
      }}
    >
      <h4 style={{ margin: '0 0 0.35rem', fontSize: '0.95rem', color: '#1e293b' }}>Intro slides &amp; videos</h4>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.45, maxWidth: '48rem' }}>
        Same flow as mission builder: story slides (image + caption) and video steps. Shown to players as an optional “Season
        intro” on the battle pass page. Save the battle pass to persist.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={addStorySlide}
          style={{
            padding: '0.45rem 0.85rem',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          + Story slide
        </button>
        <button
          type="button"
          onClick={addVideo}
          style={{
            padding: '0.45rem 0.85rem',
            background: '#059669',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          + Video step
        </button>
      </div>

      {sequence.length === 0 ? (
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>
          No intro steps yet. Add slides or videos above.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sequence.map((step, index) => (
            <div
              key={step.id}
              style={{
                padding: '0.65rem 0.85rem',
                background: '#fff',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', minWidth: 28 }}>#{index + 1}</span>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  background: step.type === 'STORY_SLIDE' ? '#dbeafe' : '#d1fae5',
                  color: step.type === 'STORY_SLIDE' ? '#1e40af' : '#065f46',
                }}
              >
                {step.type === 'STORY_SLIDE' ? 'Slide' : 'Video'}
              </span>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>{step.title || `Step ${index + 1}`}</div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: '#64748b',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {summary(step)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => moveStep(step.id, 'up')}
                  disabled={index === 0}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    background: index === 0 ? '#f1f5f9' : '#fff',
                    cursor: index === 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveStep(step.id, 'down')}
                  disabled={index === sequence.length - 1}
                  style={{
                    padding: '4px 8px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    background: index === sequence.length - 1 ? '#f1f5f9' : '#fff',
                    cursor: index === sequence.length - 1 ? 'not-allowed' : 'pointer',
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setEditingStep(step)}
                  style={{
                    padding: '4px 10px',
                    background: '#3b82f6',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Delete this intro step?')) deleteStep(step.id);
                  }}
                  style={{
                    padding: '4px 10px',
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingStep && (
        <IntroStepModal
          step={editingStep}
          seasonId={effectiveSeasonId}
          uploading={uploading}
          setUploading={setUploading}
          onSave={updateStep}
          onCancel={() => setEditingStep(null)}
          onDraftPersist={persistStepDraftToParent}
        />
      )}
    </div>
  );
};

interface ModalProps {
  step: BattlePassIntroStep;
  seasonId: string;
  uploading: boolean;
  setUploading: (v: boolean) => void;
  onSave: (s: BattlePassIntroStep) => void;
  onCancel: () => void;
  onDraftPersist: (s: BattlePassIntroStep) => void;
}

const IntroStepModal: React.FC<ModalProps> = ({
  step,
  seasonId,
  uploading,
  setUploading,
  onSave,
  onCancel,
  onDraftPersist,
}) => {
  const [edited, setEdited] = useState<BattlePassIntroStep>(step);
  const editedRef = useRef(edited);
  editedRef.current = edited;
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    setEdited(step);
    setUploadError(null);
    setUploadProgress(0);
  }, [step]);

  const handleImageUpload = async (file: File) => {
    if (!seasonId) {
      alert('Battle pass needs an ID before upload (create a new pass to get one).');
      return;
    }
    setUploading(true);
    try {
      const { url, storagePath } = await uploadBattlePassIntroImage(seasonId, step.id, file);
      const prev = editedRef.current;
      if (isStorySlide(prev)) {
        const next = { ...prev, image: { ...prev.image, url, storagePath } };
        setEdited(next);
        editedRef.current = next;
        onDraftPersist(next);
      }
    } catch (e) {
      console.error(e);
      alert('Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleVideoUpload = async (file: File) => {
    if (!seasonId) {
      setUploadError('Missing season id for upload.');
      return;
    }
    if (!file?.size) {
      setUploadError('No file selected.');
      return;
    }
    if (!isVideoFile(file)) {
      setUploadError('Use .mp4, .webm, or .mov.');
      return;
    }
    setUploadError(null);
    setUploadProgress(0);
    setUploading(true);
    try {
      const { url, storagePath } = await uploadBattlePassIntroVideoResumable(seasonId, step.id, file, (p) =>
        setUploadProgress(p)
      );
      const prev = editedRef.current;
      if (isVideo(prev)) {
        const next = {
          ...prev,
          video: { ...prev.video, url, storagePath, sourceType: 'UPLOAD' as const },
        };
        setEdited(next);
        editedRef.current = next;
        onDraftPersist(next);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(msg);
      alert(`Video upload failed: ${msg}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handlePosterUpload = async (file: File) => {
    if (!seasonId) {
      alert('Battle pass needs an ID before upload.');
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadBattlePassIntroPoster(seasonId, step.id, file);
      const prev = editedRef.current;
      if (isVideo(prev)) {
        const next = { ...prev, video: { ...prev.video, posterUrl: url } };
        setEdited(next);
        editedRef.current = next;
        onDraftPersist(next);
      }
    } catch (e) {
      console.error(e);
      alert('Poster upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (step.type === 'STORY_SLIDE' && isStorySlide(edited)) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20000,
          padding: '1.5rem',
        }}
        onClick={onCancel}
      >
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: '1.5rem',
            maxWidth: 560,
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginTop: 0 }}>Edit story slide</h3>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Title (optional)</label>
          <input
            type="text"
            value={edited.title || ''}
            onChange={(e) => setEdited({ ...edited, title: e.target.value })}
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', marginBottom: 12 }}
          />
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Image</label>
          {seasonId ? (
            <>
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImageUpload(f);
                  e.target.value = '';
                }}
                style={{ marginBottom: 8 }}
              />
              {edited.image.url ? (
                <img
                  src={edited.image.url}
                  alt={edited.image.alt || ''}
                  style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8, marginBottom: 8 }}
                />
              ) : null}
            </>
          ) : null}
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Image URL</label>
          <input
            type="text"
            value={edited.image.url}
            onChange={(e) =>
              setEdited({ ...edited, image: { ...edited.image, url: e.target.value } })
            }
            placeholder="https://..."
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', marginBottom: 12 }}
          />
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Caption</label>
          <textarea
            value={edited.bodyText}
            onChange={(e) => setEdited({ ...edited, bodyText: e.target.value })}
            rows={4}
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', marginBottom: 16 }}
          />
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              disabled={uploading || !edited.bodyText.trim() || !edited.image.url.trim()}
              onClick={() => onSave(edited)}
              style={{
                padding: '10px 18px',
                background: uploading || !edited.bodyText.trim() || !edited.image.url.trim() ? '#94a3b8' : '#059669',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Save step
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '10px 18px',
                background: '#64748b',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step.type === 'VIDEO' && isVideo(edited)) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20000,
          padding: '1.5rem',
        }}
        onClick={onCancel}
      >
        <div
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: '1.5rem',
            maxWidth: 560,
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h3 style={{ marginTop: 0 }}>Edit video step</h3>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Title (optional)</label>
          <input
            type="text"
            value={edited.title || ''}
            onChange={(e) => setEdited({ ...edited, title: e.target.value })}
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', marginBottom: 12 }}
          />
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Source</label>
          <select
            value={edited.video.sourceType}
            onChange={(e) =>
              setEdited({
                ...edited,
                video: { ...edited.video, sourceType: e.target.value as 'URL' | 'UPLOAD' },
              })
            }
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', marginBottom: 12 }}
          >
            <option value="URL">URL</option>
            <option value="UPLOAD">Upload</option>
          </select>

          {edited.video.sourceType === 'UPLOAD' ? (
            <div style={{ marginBottom: 12 }}>
              {uploadError ? (
                <div
                  style={{
                    padding: 8,
                    marginBottom: 8,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: 8,
                    color: '#991b1b',
                    fontSize: '0.85rem',
                  }}
                >
                  {uploadError}
                </div>
              ) : null}
              <input
                type="file"
                accept="video/mp4,.mp4,video/webm,.webm,video/quicktime,.mov,video/*"
                disabled={uploading || !seasonId}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleVideoUpload(f);
                  e.target.value = '';
                }}
              />
              {uploading ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ height: 6, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${uploadProgress}%`, background: '#059669' }} />
                  </div>
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{uploadProgress}%</span>
                </div>
              ) : null}
              {edited.video.url && !uploading ? (
                <video src={edited.video.url} controls style={{ width: '100%', maxHeight: 200, marginTop: 8, borderRadius: 8 }} />
              ) : null}
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Video URL</label>
              <input
                type="text"
                value={edited.video.url}
                onChange={(e) =>
                  setEdited({ ...edited, video: { ...edited.video, url: e.target.value } })
                }
                placeholder="https://..."
                style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
              />
            </div>
          )}

          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Poster (optional)</label>
          {seasonId ? (
            <input
              type="file"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePosterUpload(f);
              }}
              style={{ marginBottom: 8 }}
            />
          ) : null}
          <input
            type="text"
            value={edited.video.posterUrl || ''}
            onChange={(e) =>
              setEdited({ ...edited, video: { ...edited.video, posterUrl: e.target.value } })
            }
            placeholder="Poster URL"
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', marginBottom: 12 }}
          />
          {edited.video.posterUrl ? (
            <img
              src={edited.video.posterUrl}
              alt=""
              style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 8, marginBottom: 12 }}
            />
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={edited.video.autoplay || false}
                onChange={(e) =>
                  setEdited({ ...edited, video: { ...edited.video, autoplay: e.target.checked } })
                }
              />
              Autoplay
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={edited.video.muted || false}
                onChange={(e) =>
                  setEdited({ ...edited, video: { ...edited.video, muted: e.target.checked } })
                }
              />
              Muted
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={edited.video.controls !== false}
                onChange={(e) =>
                  setEdited({ ...edited, video: { ...edited.video, controls: e.target.checked } })
                }
              />
              Show controls
            </label>
          </div>

          <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>Description (optional)</label>
          <textarea
            value={edited.bodyText || ''}
            onChange={(e) => setEdited({ ...edited, bodyText: e.target.value })}
            rows={3}
            style={{ width: '100%', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', marginBottom: 16 }}
          />

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              disabled={uploading || !edited.video.url.trim()}
              onClick={() => onSave(edited)}
              style={{
                padding: '10px 18px',
                background: uploading || !edited.video.url.trim() ? '#94a3b8' : '#059669',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              Save step
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                padding: '10px 18px',
                background: '#64748b',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 700,
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

export default BattlePassIntroSequenceEditor;
