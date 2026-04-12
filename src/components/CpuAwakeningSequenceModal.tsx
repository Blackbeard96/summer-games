import React, { useEffect, useState } from 'react';
import type { MissionMediaSequenceStep } from '../types/missions';

export interface CpuAwakeningSequenceModalProps {
  open: boolean;
  title: string;
  steps: MissionMediaSequenceStep[];
  onDismiss: () => void;
}

/**
 * Full-screen player-facing sequence when a CPU opponent awakens (slides + videos, mission-style).
 */
const CpuAwakeningSequenceModal: React.FC<CpuAwakeningSequenceModalProps> = ({
  open,
  title,
  steps,
  onDismiss,
}) => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (open) setIndex(0);
  }, [open, steps]);

  if (!open || steps.length === 0) return null;

  const step = steps[index];
  const isLast = index >= steps.length - 1;

  const goNext = () => {
    if (isLast) onDismiss();
    else setIndex((i) => i + 1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cpu-awakening-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        background: 'linear-gradient(145deg, #0f172a 0%, #1e1b4b 45%, #312e81 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          overflow: 'auto',
          background: 'rgba(15, 23, 42, 0.92)',
          borderRadius: '1rem',
          border: '2px solid rgba(251, 191, 36, 0.45)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          padding: '1.5rem',
          color: '#f8fafc',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <div
            id="cpu-awakening-title"
            style={{
              fontSize: '1.35rem',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: '#fde68a',
              marginBottom: '0.35rem',
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Scene {index + 1} of {steps.length}
          </div>
        </div>

        {step.type === 'STORY_SLIDE' && (
          <div>
            {step.title && (
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.2rem', color: '#e2e8f0' }}>{step.title}</h2>
            )}
            {step.image?.url ? (
              <img
                src={step.image.url}
                alt={step.image.alt || step.title || 'Awakening scene'}
                style={{
                  width: '100%',
                  maxHeight: 360,
                  objectFit: 'contain',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                }}
              />
            ) : null}
            <p style={{ fontSize: '1rem', lineHeight: 1.65, whiteSpace: 'pre-wrap', margin: 0, color: '#cbd5e1' }}>
              {step.bodyText}
            </p>
          </div>
        )}

        {step.type === 'VIDEO' && (
          <div>
            {step.title && (
              <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.2rem', color: '#e2e8f0' }}>{step.title}</h2>
            )}
            {step.video?.url ? (
              <video
                src={step.video.url}
                poster={step.video.posterUrl}
                controls={step.video.controls !== false}
                autoPlay={step.video.autoplay === true}
                muted={step.video.muted === true}
                playsInline
                style={{
                  width: '100%',
                  maxHeight: 420,
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  background: '#020617',
                }}
              />
            ) : (
              <p style={{ color: '#f87171' }}>Video URL missing for this step.</p>
            )}
            {step.bodyText ? (
              <p style={{ fontSize: '0.95rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0, color: '#cbd5e1' }}>
                {step.bodyText}
              </p>
            ) : null}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              padding: '0.65rem 1rem',
              borderRadius: '0.5rem',
              border: '1px solid #64748b',
              background: 'transparent',
              color: '#e2e8f0',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Skip all
          </button>
          <button
            type="button"
            onClick={goNext}
            style={{
              padding: '0.65rem 1.25rem',
              borderRadius: '0.5rem',
              border: 'none',
              background: 'linear-gradient(180deg, #f59e0b 0%, #d97706 100%)',
              color: '#0f172a',
              cursor: 'pointer',
              fontWeight: 800,
              minWidth: 120,
            }}
          >
            {isLast ? 'Continue' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CpuAwakeningSequenceModal;
