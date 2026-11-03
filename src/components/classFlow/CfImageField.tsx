import React, { useRef, useState } from 'react';
import { uploadClassFlowImage } from '../../utils/classFlowWorkService';

interface Props {
  value?: string;
  onChange: (url: string | undefined) => void | Promise<void>;
  actorUid: string;
  label?: string;
  compact?: boolean;
  onMessage?: (text: string, error?: boolean) => void;
}

/** Upload / replace / remove a picture for a sprint or a piece of work. */
const CfImageField: React.FC<Props> = ({ value, onChange, actorUid, label = 'Image', compact, onMessage }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await onChange(await uploadClassFlowImage(actorUid, file));
    } catch (e) {
      onMessage?.(e instanceof Error ? e.message : 'Image upload failed', true);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className={`cf-image-field${compact ? ' cf-image-field--compact' : ''}`}>
      {value ? (
        <img src={value} alt="" className="cf-image-field__thumb" />
      ) : (
        !compact && <div className="cf-image-field__empty">No image</div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <button type="button" className="cf-btn cf-btn--ghost" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Uploading…' : value ? `Replace ${label.toLowerCase()}` : `🖼 Add ${label.toLowerCase()}`}
      </button>
      {value && !busy && (
        <button type="button" className="cf-btn cf-btn--ghost" onClick={() => void onChange(undefined)} aria-label={`Remove ${label}`}>
          Remove
        </button>
      )}
    </div>
  );
};

export default CfImageField;
