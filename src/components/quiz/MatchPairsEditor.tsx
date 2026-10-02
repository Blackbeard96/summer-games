import React, { useEffect, useState } from 'react';
import { MAX_MATCH_PAIRS, MIN_MATCH_PAIRS, newMatchPairId } from '../../utils/quizMatching';

export interface MatchPairDraft {
  id: string;
  promptText: string;
  promptImageUrl: string | null;
  promptImageFile: File | null;
  responseText: string;
  responseImageUrl: string | null;
  responseImageFile: File | null;
}

export const emptyMatchPairDraft = (): MatchPairDraft => ({
  id: newMatchPairId(),
  promptText: '',
  promptImageUrl: null,
  promptImageFile: null,
  responseText: '',
  responseImageUrl: null,
  responseImageFile: null,
});

/** Same order as the player board's `.mst-match-color-N` palette. */
const PAIR_COLORS = [
  { prompt: '#2f6fb0', response: '#1c3d5e' },
  { prompt: '#2a9fa3', response: '#1a5654' },
  { prompt: '#e9a52b', response: '#7a571a' },
  { prompt: '#d4566d', response: '#6e2f3a' },
  { prompt: '#9a4596', response: '#5a2c59' },
  { prompt: '#4f8a3c', response: '#2d4f22' },
];

type Side = 'prompt' | 'response';

const FileImagePreview: React.FC<{ file: File }> = ({ file }) => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url ? <img src={url} alt="" style={previewImgStyle} /> : null;
};

const previewImgStyle: React.CSSProperties = {
  maxWidth: '100%',
  maxHeight: 110,
  borderRadius: 8,
  display: 'block',
  background: 'rgba(255,255,255,0.9)',
  objectFit: 'contain',
};

interface CardEditorProps {
  label: string;
  color: string;
  text: string;
  imageUrl: string | null;
  imageFile: File | null;
  disabled?: boolean;
  onText: (text: string) => void;
  onImageFile: (file: File) => void;
  onClearImage: () => void;
}

const CardEditor: React.FC<CardEditorProps> = ({
  label,
  color,
  text,
  imageUrl,
  imageFile,
  disabled,
  onText,
  onImageFile,
  onClearImage,
}) => {
  const hasImage = !!imageFile || !!imageUrl;
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: color,
        borderRadius: 12,
        padding: '0.6rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
        color: 'white',
      }}
    >
      <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.9 }}>
        {label}
      </div>
      <textarea
        value={text}
        disabled={disabled}
        onChange={(e) => onText(e.target.value)}
        placeholder={hasImage ? 'Caption (optional)' : 'Type text…'}
        rows={2}
        style={{
          width: '100%',
          resize: 'vertical',
          borderRadius: 8,
          border: 'none',
          padding: '0.45rem 0.55rem',
          fontSize: '0.9rem',
          color: '#111827',
          background: 'rgba(255,255,255,0.95)',
        }}
      />
      {imageFile ? (
        <FileImagePreview file={imageFile} />
      ) : imageUrl ? (
        <img src={imageUrl} alt="" style={previewImgStyle} />
      ) : null}
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label
          style={{
            fontSize: '0.78rem',
            fontWeight: 600,
            padding: '0.3rem 0.6rem',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.22)',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          {hasImage ? 'Replace image' : '+ Image'}
          <input
            type="file"
            accept="image/*"
            disabled={disabled}
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImageFile(file);
              e.target.value = '';
            }}
          />
        </label>
        {hasImage && (
          <button
            type="button"
            disabled={disabled}
            onClick={onClearImage}
            style={{
              fontSize: '0.78rem',
              fontWeight: 600,
              padding: '0.3rem 0.6rem',
              borderRadius: 999,
              border: 'none',
              background: 'rgba(0,0,0,0.25)',
              color: 'white',
              cursor: 'pointer',
            }}
          >
            Remove image
          </button>
        )}
      </div>
    </div>
  );
};

interface MatchPairsEditorProps {
  pairs: MatchPairDraft[];
  onChange: (pairs: MatchPairDraft[]) => void;
  disabled?: boolean;
}

const MatchPairsEditor: React.FC<MatchPairsEditorProps> = ({ pairs, onChange, disabled }) => {
  const update = (index: number, patch: Partial<MatchPairDraft>) => {
    onChange(pairs.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  };
  const setImage = (index: number, side: Side, file: File | null) => {
    update(
      index,
      side === 'prompt'
        ? { promptImageFile: file, promptImageUrl: null }
        : { responseImageFile: file, responseImageUrl: null }
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {pairs.map((pair, index) => {
        const color = PAIR_COLORS[index % PAIR_COLORS.length];
        return (
          <div
            key={pair.id}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 14,
              padding: '0.6rem',
              background: '#f9fafb',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
              <strong style={{ fontSize: '0.85rem', color: '#374151' }}>Pair {index + 1}</strong>
              {pairs.length > MIN_MATCH_PAIRS && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(pairs.filter((_, i) => i !== index))}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#dc2626',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                >
                  Remove pair
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch' }}>
              <CardEditor
                label="Prompt card"
                color={color.prompt}
                text={pair.promptText}
                imageUrl={pair.promptImageUrl}
                imageFile={pair.promptImageFile}
                disabled={disabled}
                onText={(text) => update(index, { promptText: text })}
                onImageFile={(file) => setImage(index, 'prompt', file)}
                onClearImage={() => setImage(index, 'prompt', null)}
              />
              <div style={{ alignSelf: 'center', fontSize: '1.2rem', color: '#9ca3af' }} aria-hidden>
                ⇄
              </div>
              <CardEditor
                label="Matching card"
                color={color.response}
                text={pair.responseText}
                imageUrl={pair.responseImageUrl}
                imageFile={pair.responseImageFile}
                disabled={disabled}
                onText={(text) => update(index, { responseText: text })}
                onImageFile={(file) => setImage(index, 'response', file)}
                onClearImage={() => setImage(index, 'response', null)}
              />
            </div>
          </div>
        );
      })}
      {pairs.length < MAX_MATCH_PAIRS && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...pairs, emptyMatchPairDraft()])}
          style={{
            alignSelf: 'flex-start',
            padding: '0.5rem 1rem',
            background: '#10b981',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          + Add Pair
        </button>
      )}
    </div>
  );
};

export default MatchPairsEditor;
