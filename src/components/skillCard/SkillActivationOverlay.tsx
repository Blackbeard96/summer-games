import React, { useEffect, useRef, useState } from 'react';
import SkillCardArt from './SkillCardArt';
import { getSkillCategoryLabel } from '../../utils/skillArtworkDefaults';
import {
  enqueuePending,
  getCardDuration,
  SKILL_CARD_DETAILS_EXTRA_MS,
  subscribeSkillActivations,
  type SkillActivationEvent,
} from '../../utils/skillActivationQueue';
import './skillCard.css';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface ActiveCard {
  event: SkillActivationEvent;
  durationMs: number;
  reduced: boolean;
}

/**
 * Global, non-interactive Skill Card shown after a confirmed skill activation.
 * Purely visual: never blocks input (pointer-events: none) and never waits on battle logic.
 */
const SkillActivationOverlay: React.FC = () => {
  const [active, setActive] = useState<ActiveCard | null>(null);
  const pendingRef = useRef<SkillActivationEvent[]>([]);
  const activeRef = useRef<ActiveCard | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const showNext = () => {
      clearTimer();
      const next = pendingRef.current.shift();
      if (!next) {
        activeRef.current = null;
        setActive(null);
        return;
      }
      const reduced = prefersReducedMotion();
      const base = getCardDuration(pendingRef.current.length, reduced);
      const card: ActiveCard = { event: next, durationMs: next.details?.length ? base + SKILL_CARD_DETAILS_EXTRA_MS : base, reduced };
      activeRef.current = card;
      setActive(card);
      timerRef.current = window.setTimeout(showNext, card.durationMs);
    };

    const unsubscribe = subscribeSkillActivations((msg) => {
      if (msg.kind === 'clear') {
        pendingRef.current = [];
        if (msg.keepCurrent) return;
        clearTimer();
        activeRef.current = null;
        setActive(null);
        return;
      }
      pendingRef.current = enqueuePending(pendingRef.current, msg.event);
      if (!activeRef.current) showNext();
    });

    return () => {
      unsubscribe();
      clearTimer();
      pendingRef.current = [];
      activeRef.current = null;
    };
  }, []);

  if (!active) return null;
  const { event, durationMs, reduced } = active;
  const name = event.skillDisplayName || event.skill.name;
  const side = event.side || 'self';

  return (
    <div className="mst-skill-card-layer">
      <div
        aria-hidden="true"
        key={event.id}
        className={`mst-skill-card mst-skill-card--${side}${reduced ? ' mst-skill-card--reduced' : ''}`}
        style={{ ['--mst-skill-card-duration' as string]: `${durationMs}ms` }}
        data-testid="skill-activation-card"
      >
        <div className="mst-skill-card__frame">
          <div className="mst-skill-card__art">
            <SkillCardArt skill={event.skill} alt="" />
            <span className="mst-skill-card__sheen" />
          </div>
          <div className="mst-skill-card__body">
            <div className="mst-skill-card__category">{getSkillCategoryLabel(event.skill)}</div>
            <div className="mst-skill-card__name">{name}</div>
            <div className="mst-skill-card__actor">
              {event.actorName}
              {event.targetName ? <span className="mst-skill-card__target"> → {event.targetName}</span> : null}
            </div>
            {event.details?.length ? (
              <div className="mst-skill-card__details">
                {event.details.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <span className="mst-skill-card__sr" role="status">
        {`${event.actorName} used ${name}`}
      </span>
    </div>
  );
};

export default SkillActivationOverlay;
