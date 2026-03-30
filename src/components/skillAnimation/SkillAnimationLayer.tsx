import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Move } from '../../types/battle';
import { getMoveName } from '../../utils/moveOverrides';
import {
  buildSkillAnimationTimeline,
  getStoredVfxQuality,
  resolveSkillVfxConfig,
  resolveTargetReaction,
  REACTION_CLASS,
  type SkillAnimationLayerProps as SkillAnimLayerProps,
  type SkillAnimationRuntimeEvent,
} from '../../skillAnimation';
import './skillAnimation.css';

const SHAKE_MAP = {
  none: undefined,
  light: 'light',
  medium: 'medium',
  heavy: 'heavy',
} as const;

/**
 * Data-driven skill VFX: five narrative phases (cast → manifestation → travel → impact → after)
 * map to timeline hooks. BattleEngine still resolves damage after onAnimationComplete.
 */
export type SkillAnimationLayerPublicProps = SkillAnimLayerProps;

const SkillAnimationLayer: React.FC<SkillAnimLayerProps> = ({
  move,
  isPlayerMove,
  onAnimationComplete,
  onPhase,
  quality: qualityProp,
  actorDisplayName,
}) => {
  const [displayName, setDisplayName] = useState('');
  const [showProjectile, setShowProjectile] = useState(false);
  const [showImpact, setShowImpact] = useState(false);
  const [showAfter, setShowAfter] = useState(false);
  const [reactionClass, setReactionClass] = useState('');
  const [shakeLevel, setShakeLevel] = useState<string | undefined>(undefined);
  const timersRef = useRef<number[]>([]);

  const reducedMotion = useMemo(() => {
    try {
      return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    } catch {
      return false;
    }
  }, []);

  const quality = useMemo(() => {
    if (qualityProp) return qualityProp;
    const q = getStoredVfxQuality();
    return reducedMotion ? 'low' : q;
  }, [qualityProp, reducedMotion]);

  const config = useMemo(() => (move ? resolveSkillVfxConfig(move, quality) : null), [move, quality]);

  useEffect(() => {
    if (!move || !config) {
      setDisplayName('');
      return;
    }
    let cancelled = false;
    getMoveName(move.name)
      .then((n) => {
        if (!cancelled) setDisplayName(n || move.name);
      })
      .catch(() => {
        if (!cancelled) setDisplayName(move.name);
      });
    return () => {
      cancelled = true;
    };
  }, [move, config]);

  useEffect(() => {
    if (!move || !config) return;

    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    setShowProjectile(false);
    setShowImpact(false);
    setShowAfter(false);
    setReactionClass('');

    const { entries: timeline, totalMs: total } = buildSkillAnimationTimeline(config, quality);
    const fire = (event: SkillAnimationRuntimeEvent) => {
      onPhase?.({ event, move, config, quality });
      switch (event) {
        case 'onProjectileSpawn':
          setShowProjectile(true);
          break;
        case 'onProjectileHit':
          setShowImpact(true);
          setReactionClass(REACTION_CLASS[resolveTargetReaction(move)]);
          break;
        case 'onAfterEffectStart':
          setShowAfter(true);
          break;
        case 'onCastStart':
          if (config.camera?.shake && config.camera.shake !== 'none') {
            setShakeLevel(SHAKE_MAP[config.camera.shake]);
          }
          break;
        default:
          break;
      }
    };

    timeline.forEach(({ atMs, event }) => {
      const id = window.setTimeout(() => fire(event), atMs);
      timersRef.current.push(id);
    });

    const doneId = window.setTimeout(() => {
      onPhase?.({ event: 'onAnimationComplete', move, config, quality });
      onAnimationComplete();
    }, total);
    timersRef.current.push(doneId);

    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- complete mirrors legacy BattleAnimations contract
  }, [move?.id, config?.id, quality]);

  if (!move || !config) return null;

  const elementKey = config.profile.element || move.elementalAffinity || '';
  const manifestKey = config.profile.manifest || move.manifestType || '';
  const selfDirected =
    move.targetType === 'self' ||
    ((move.shieldBoost || move.healing) && move.type !== 'attack');
  const dir = selfDirected ? 'to-player' : isPlayerMove ? 'to-enemy' : 'to-player';
  const impactSide = selfDirected
    ? isPlayerMove
      ? 'player'
      : 'enemy'
    : isPlayerMove
      ? 'enemy'
      : 'player';
  const casterSide = isPlayerMove ? 'player' : 'opponent';
  const manifestClass =
    manifestKey === 'reading'
      ? 'mst-skill-manifest-reading'
      : manifestKey === 'writing' || manifestKey === 'drawing'
        ? 'mst-skill-manifest-writing'
        : manifestKey === 'gaming'
          ? 'mst-skill-manifest-gaming'
          : '';

  const tier = config.profile.tier;
  const projDur = `${0.35 + tier * 0.12}s`;
  const impactDur = `${0.4 + tier * 0.06}s`;

  return (
    <div
      className={`mst-skill-root ${manifestClass} mst-skill-shake`}
      data-element={elementKey === 'metal' ? 'truth' : elementKey}
      data-tier={tier}
      data-quality={quality}
      data-shake-level={shakeLevel}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1000,
        overflow: 'hidden',
      }}
    >
      {config.profile.impactType === 'glitch' || config.templateId === 'glitchPulse' ? (
        <div className="mst-skill-glitch mst-skill-flash" style={{ ['--mst-flash-op' as string]: 0.22 }} />
      ) : (
        <div className="mst-skill-flash" style={{ ['--mst-flash-op' as string]: 0.28 + tier * 0.04 }} />
      )}

      {config.ui?.showSkillName !== false && (
        <div className="mst-skill-banner">
          {(actorDisplayName ? `${actorDisplayName} — ` : '') + (displayName || move.name)}
          {config.ui?.showElementBadge && elementKey ? (
            <span style={{ display: 'block', fontSize: '0.72rem', opacity: 0.85, marginTop: '0.25rem' }}>
              {elementKey.toUpperCase()}
            </span>
          ) : null}
        </div>
      )}

      <div className="mst-skill-caster-glow" data-side={casterSide} />

      {config.artifactVisual?.prop && (
        <div
          style={{
            position: 'absolute',
            bottom: '14%',
            left: isPlayerMove ? '12%' : '78%',
            transform: 'translateX(-50%)',
            fontSize: '1.75rem',
            opacity: 0.75,
            filter: config.artifactVisual.tint ? `drop-shadow(0 0 6px ${config.artifactVisual.tint})` : undefined,
          }}
          aria-hidden
        >
          {config.artifactVisual.prop === 'pen' && '✒️'}
          {config.artifactVisual.prop === 'gauntlet' && '🧤'}
          {config.artifactVisual.prop === 'compass' && '🧭'}
          {config.artifactVisual.prop === 'ring' && '💍'}
          {config.artifactVisual.prop === 'mic' && '🎤'}
          {config.artifactVisual.prop === 'card' && '🃏'}
          {config.artifactVisual.prop === 'hudLens' && '◈'}
        </div>
      )}

      {showProjectile &&
        !selfDirected &&
        (config.profile.deliveryType === 'projectile' ||
          config.profile.deliveryType === 'beam' ||
          config.profile.deliveryType === 'melee') && (
          <div
            className="mst-skill-projectile"
            data-dir={dir}
            style={{ ['--mst-proj-dur' as string]: projDur }}
          />
        )}

      {config.profile.deliveryType === 'beam' && showProjectile && !selfDirected && (
        <div
          style={{
            position: 'absolute',
            top: '48%',
            left: isPlayerMove ? '22%' : '78%',
            width: isPlayerMove ? '48%' : '48%',
            height: 4,
            transform: isPlayerMove ? 'none' : 'translateX(-100%)',
            background: `linear-gradient(90deg, transparent, var(--mst-accent), transparent)`,
            opacity: 0.85,
            filter: 'blur(1px)',
          }}
        />
      )}

      {showImpact && (
        <div
          className={`mst-skill-impact ${reactionClass}`}
          data-side={impactSide}
          style={{ ['--mst-impact-dur' as string]: impactDur }}
        />
      )}

      {showAfter && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(circle at ${isPlayerMove ? '78%' : '22%'} 50%, var(--mst-manifest-tint), transparent 55%)`,
            opacity: 0.9,
          }}
        />
      )}
    </div>
  );
};

export default SkillAnimationLayer;
