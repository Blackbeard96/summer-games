import React from 'react';
import { mst } from '../../theme/mstTokens';

type Overlay = 'dark' | 'heavier' | 'left' | 'none';

type Props = {
  image?: string;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  overlay?: Overlay;
  height?: string;
  children?: React.ReactNode;
  align?: 'left' | 'center';
  style?: React.CSSProperties;
};

/**
 * Swappable cinematic hero. Pass page-specific art via `image`
 * (prefer /assets/mst/backgrounds/...). Does not change game logic.
 */
export function CinematicHero({
  image,
  title,
  subtitle,
  eyebrow,
  overlay = 'left',
  height = 'min(52vh, 420px)',
  children,
  align = 'left',
  style,
}: Props) {
  const overlayBg =
    overlay === 'none'
      ? 'transparent'
      : overlay === 'heavier'
        ? 'linear-gradient(180deg, rgba(5,7,13,0.55) 0%, rgba(5,7,13,0.88) 100%)'
        : 'var(--mst-bg-hero-overlay)';

  return (
    <section
      style={{
        position: 'relative',
        minHeight: height,
        borderRadius: mst.radius.lg,
        overflow: 'hidden',
        border: `1px solid ${mst.border.gold}`,
        boxShadow: mst.shadow.panel,
        backgroundColor: mst.bg.secondary,
        backgroundImage: image
          ? `url(${image})`
          : `radial-gradient(ellipse at 70% 40%, rgba(109,62,242,0.25), transparent 55%),
             radial-gradient(ellipse at 20% 80%, rgba(212,168,79,0.12), transparent 50%),
             linear-gradient(160deg, #0e1420, #05070d)`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        ...style,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: overlayBg,
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          minHeight: height,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          alignItems: align === 'center' ? 'center' : 'flex-start',
          textAlign: align,
          padding: 'var(--mst-space-6) var(--mst-space-5)',
          maxWidth: align === 'center' ? '100%' : 560,
        }}
      >
        {eyebrow ? <div className="mst-label">{eyebrow}</div> : null}
        {title ? (
          <h1
            className="mst-display"
            style={{
              margin: eyebrow ? '0.5rem 0 0' : 0,
              fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
              lineHeight: 1.15,
              color: mst.text.primary,
              textShadow: '0 2px 18px rgba(0,0,0,0.55)',
            }}
          >
            {title}
          </h1>
        ) : null}
        {subtitle ? (
          <p
            style={{
              margin: '0.75rem 0 0',
              color: mst.text.secondary,
              fontSize: '1.05rem',
              maxWidth: 440,
            }}
          >
            {subtitle}
          </p>
        ) : null}
        {children}
      </div>
    </section>
  );
}
