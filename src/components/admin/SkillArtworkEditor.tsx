import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import SkillCardArt from '../skillCard/SkillCardArt';
import {
  loadSkillArtwork,
  removeSkillArtwork,
  resolveSkillArtworkSync,
  saveSkillArtwork,
  subscribeSkillArtwork,
} from '../../utils/skillArtwork';
import {
  SKILL_ART_ALLOWED_TYPES,
  SKILL_ART_MAX_BYTES,
  getSkillCategoryLabel,
  normalizeSkillArtKey,
  validateSkillArtFile,
  type SkillArtInput,
} from '../../utils/skillArtworkDefaults';

interface SkillArtworkEditorProps {
  /** Stable skill id (template name for elemental/manifest moves, move id for CPU moves). */
  skillKey: string;
  skillName: string;
  category?: SkillArtInput['category'];
  elementalAffinity?: string | null;
  manifestType?: string | null;
}

/**
 * Upload / preview / replace / remove Skill Card artwork. Saves independently of the move editor's
 * own Save button so existing move save behavior is unchanged.
 */
const SkillArtworkEditor: React.FC<SkillArtworkEditorProps> = ({
  skillKey,
  skillName,
  category,
  elementalAffinity,
  manifestType,
}) => {
  const { currentUser, isAdmin } = useAuth();
  const [, setVersion] = useState(0);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadSkillArtwork().catch(() => undefined);
    return subscribeSkillArtwork(() => setVersion((v) => v + 1));
  }, []);

  useEffect(() => {
    if (!pendingFile) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  if (!isAdmin) return null;

  const skill: SkillArtInput = { id: skillKey, name: skillKey, category, elementalAffinity, manifestType };
  const resolved = resolveSkillArtworkSync(skill);
  const hasCustom = resolved.source === 'custom';
  const keyOk = Boolean(normalizeSkillArtKey(skillKey));

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    e.target.value = '';
    setMessage(null);
    if (!file) return;
    const invalid = validateSkillArtFile(file);
    if (invalid) {
      setPendingFile(null);
      setMessage({ tone: 'error', text: invalid });
      return;
    }
    setPendingFile(file);
  };

  const onSave = async () => {
    if (!pendingFile) return;
    setBusy('upload');
    setMessage(null);
    try {
      await saveSkillArtwork({
        skillKey,
        skillName,
        category: category || undefined,
        file: pendingFile,
        updatedBy: currentUser?.email || currentUser?.uid,
      });
      setPendingFile(null);
      setMessage({ tone: 'ok', text: 'Artwork saved.' });
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Upload failed.';
      setMessage({ tone: 'error', text: /permission|unauthorized/i.test(text) ? 'Only designated admin accounts can upload skill artwork.' : text });
    } finally {
      setBusy(null);
    }
  };

  const onRemove = async () => {
    if (!window.confirm(`Remove custom artwork for "${skillName}"? It will use the default MST artwork.`)) return;
    setBusy('remove');
    setMessage(null);
    try {
      await removeSkillArtwork(skillKey, currentUser?.email || currentUser?.uid);
      setMessage({ tone: 'ok', text: 'Artwork removed. Default artwork will be shown.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Remove failed.' });
    } finally {
      setBusy(null);
    }
  };

  const btn = (bg: string, disabled: boolean): React.CSSProperties => ({
    padding: '0.35rem 0.75rem',
    background: disabled ? 'rgba(255,255,255,0.12)' : bg,
    border: 'none',
    borderRadius: '0.35rem',
    color: 'white',
    fontSize: '0.78rem',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <div
      data-testid="skill-artwork-editor"
      style={{
        marginTop: '0.75rem',
        padding: '0.75rem',
        borderRadius: '0.5rem',
        border: '1px solid rgba(212,168,79,0.45)',
        background: 'rgba(5,7,13,0.55)',
        display: 'flex',
        gap: '0.85rem',
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ width: 132, flexShrink: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(212,168,79,0.5)', aspectRatio: '300 / 228', background: '#05070d' }}>
        <SkillCardArt skill={skill} overrideSrc={previewUrl} alt={`${skillName} artwork preview`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </div>
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f0c96a', letterSpacing: '0.04em' }}>Skill Card Artwork</div>
        <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', margin: '0.15rem 0 0.5rem' }}>
          {previewUrl
            ? 'Previewing new artwork — not saved yet.'
            : hasCustom
              ? 'Custom artwork.'
              : `Using default ${getSkillCategoryLabel(skill)} artwork.`}{' '}
          PNG, JPG, or WebP · max {Math.round(SKILL_ART_MAX_BYTES / (1024 * 1024))} MB.
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={SKILL_ART_ALLOWED_TYPES.join(',')}
          onChange={onPick}
          style={{ display: 'none' }}
        />
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {!pendingFile && (
            <button type="button" disabled={!keyOk || busy !== null} onClick={() => inputRef.current?.click()} style={btn('#6d3ef2', !keyOk || busy !== null)}>
              {hasCustom ? 'Replace artwork' : 'Upload artwork'}
            </button>
          )}
          {pendingFile && (
            <>
              <button type="button" disabled={busy !== null} onClick={onSave} style={btn('#10b981', busy !== null)}>
                {busy === 'upload' ? 'Saving…' : 'Save artwork'}
              </button>
              <button type="button" disabled={busy !== null} onClick={() => setPendingFile(null)} style={btn('#4b5563', busy !== null)}>
                Cancel
              </button>
            </>
          )}
          {hasCustom && !pendingFile && (
            <button type="button" disabled={busy !== null} onClick={onRemove} style={btn('#dc2626', busy !== null)}>
              {busy === 'remove' ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
        {message && (
          <div role={message.tone === 'error' ? 'alert' : 'status'} style={{ marginTop: '0.4rem', fontSize: '0.74rem', color: message.tone === 'error' ? '#fca5a5' : '#86efac' }}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
};

export default SkillArtworkEditor;
