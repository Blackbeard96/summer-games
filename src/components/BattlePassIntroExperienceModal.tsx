import React, { useEffect, useState } from 'react';
import type { BattlePassIntroStep } from '../types/missions';

interface Props {
  open: boolean;
  onClose: () => void;
  seasonTitle: string;
  heroVideoUrl?: string;
  introSteps: BattlePassIntroStep[];
}

/**
 * Full-screen intro: story slides and video steps in admin order.
 * Legacy `heroVideoUrl` (season trailer field) is used only when there is no `introSequence`,
 * so slide-then-video flows are not duplicated by an extra opening video.
 */
const BattlePassIntroExperienceModal: React.FC<Props> = ({
  open,
  onClose,
  seasonTitle,
  heroVideoUrl,
  introSteps,
}) => {
  const [idx, setIdx] = useState(0);
  const hero = heroVideoUrl?.trim();
  const heroFirst = !!hero && introSteps.length === 0;
  const total = (heroFirst ? 1 : 0) + introSteps.length;

  useEffect(() => {
    if (open) setIdx(0);
  }, [open, seasonTitle, hero, introSteps.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || total === 0) return null;

  const atHero = heroFirst && idx === 0;
  const stepIndex = idx - (heroFirst ? 1 : 0);
  const currentStep = !atHero && stepIndex >= 0 ? introSteps[stepIndex] : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Season intro"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10050,
        background: 'rgba(15, 23, 42, 0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          overflow: 'auto',
          background: 'linear-gradient(180deg, #1e1b4b 0%, #312e81 100%)',
          borderRadius: 16,
          border: '1px solid rgba(165, 180, 252, 0.35)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.45)',
          padding: '1.5rem',
          color: '#f8fafc',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#a5b4fc' }}>
              Season intro
            </div>
            <h2 style={{ margin: '4px 0 0', fontSize: '1.25rem' }}>{seasonTitle}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              flexShrink: 0,
              padding: '6px 12px',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.08)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Close
          </button>
        </div>

        <div style={{ fontSize: '0.8rem', color: '#c7d2fe', marginBottom: 14 }}>
          Step {idx + 1} of {total}
        </div>

        {atHero && hero ? (
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: '1.05rem' }}>Welcome</h3>
            <video
              src={hero}
              controls
              playsInline
              style={{
                width: '100%',
                maxHeight: 'min(50vh, 420px)',
                borderRadius: 12,
                background: '#000',
              }}
            />
          </div>
        ) : null}

        {!atHero && currentStep?.type === 'STORY_SLIDE' ? (
          <div>
            {currentStep.title ? <h3 style={{ marginTop: 0 }}>{currentStep.title}</h3> : null}
            {currentStep.image.url ? (
              <img
                src={currentStep.image.url}
                alt={currentStep.image.alt || currentStep.title || 'Intro slide'}
                style={{
                  width: '100%',
                  maxHeight: 'min(45vh, 380px)',
                  objectFit: 'contain',
                  borderRadius: 12,
                  marginBottom: 12,
                }}
              />
            ) : null}
            <p style={{ fontSize: '1rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{currentStep.bodyText}</p>
          </div>
        ) : null}

        {!atHero && currentStep?.type === 'VIDEO' ? (
          <div>
            {currentStep.title ? <h3 style={{ marginTop: 0 }}>{currentStep.title}</h3> : null}
            {currentStep.video.url ? (
              <video
                src={currentStep.video.url}
                poster={currentStep.video.posterUrl}
                controls={currentStep.video.controls !== false}
                autoPlay={currentStep.video.autoplay || false}
                muted={currentStep.video.muted || false}
                playsInline
                style={{
                  width: '100%',
                  maxHeight: 'min(50vh, 420px)',
                  borderRadius: 12,
                  background: '#000',
                  marginBottom: 12,
                }}
              />
            ) : null}
            {currentStep.bodyText ? (
              <p style={{ fontSize: '1rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{currentStep.bodyText}</p>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={idx <= 0}
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.2)',
              background: idx <= 0 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.12)',
              color: '#fff',
              cursor: idx <= 0 ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => {
              if (idx >= total - 1) onClose();
              else setIdx((i) => i + 1);
            }}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(180deg, #6366f1 0%, #4f46e5 100%)',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            {idx >= total - 1 ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BattlePassIntroExperienceModal;
