import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { MissionSequenceStep } from '../../types/missions';
import type { ElementType } from '../../types/elementTypes';
import { useBattle } from '../../context/BattleContext';
import { markMissionSequenceStepComplete } from '../../utils/missionsService';
import { selectPlayerElement } from '../../utils/elementSelectionService';
import {
  ELEMENT_UNAWAKENED_LABEL,
  SELECTABLE_ONBOARDING_ELEMENTS,
  extractElementOrNull,
  formatElementDisplayLabel,
  getElementDisplayColor,
} from '../../utils/elementDisplay';
import { elementTypeEmoji, elementTypeLabel } from '../../utils/elementTypeUi';

interface Props {
  step: Extract<MissionSequenceStep, { type: 'ELEMENTAL_SKILLS' }>;
  userId: string;
  playerMissionId: string | null;
  stepAlreadyComplete: boolean;
  onRefreshCompletion: () => void;
}

const ELEMENT_BUTTON_STYLES: Record<
  string,
  { bg: string; hover: string }
> = {
  fire: {
    bg: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    hover: 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)',
  },
  water: {
    bg: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
    hover: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)',
  },
  earth: {
    bg: 'linear-gradient(135deg, #84cc16 0%, #65a30d 100%)',
    hover: 'linear-gradient(135deg, #a3e635 0%, #84cc16 100%)',
  },
  air: {
    bg: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)',
    hover: 'linear-gradient(135deg, #c084fc 0%, #a855f7 100%)',
  },
};

const MissionElementalSkillsStepPanel: React.FC<Props> = ({
  step,
  userId,
  playerMissionId,
  stepAlreadyComplete,
  onRefreshCompletion,
}) => {
  const { unlockElementalMoves } = useBattle();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [currentElement, setCurrentElement] = useState<string | null>(null);

  const requireSelection = step.requireSelection !== false;
  const allowReselect = step.allowReselect === true;

  const loadElement = async () => {
    const [userSnap, studentSnap] = await Promise.all([
      getDoc(doc(db, 'users', userId)),
      getDoc(doc(db, 'students', userId)),
    ]);
    return extractElementOrNull(
      userSnap.exists() ? userSnap.data() : undefined,
      studentSnap.exists() ? studentSnap.data() : undefined
    );
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const el = await loadElement();
        if (cancelled) return;
        setCurrentElement(el);
        // Already awakened — record step completion so Next is not blocked.
        if (el && !stepAlreadyComplete && playerMissionId) {
          await markMissionSequenceStepComplete(playerMissionId, step.id, { element: el });
          if (!cancelled) onRefreshCompletion();
        }
      } catch (e) {
        console.error('MissionElementalSkillsStepPanel load', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only re-load when the player / step identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [userId, step.id, playerMissionId]);

  const handleAwaken = async (element: ElementType) => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await selectPlayerElement(userId, element, {
        allowOverwrite: allowReselect,
      });
      if (!result.success && !result.alreadySelected) {
        throw new Error(result.error || 'Failed to awaken Element');
      }
      const refreshed = (await loadElement()) || result.element || element;
      setCurrentElement(refreshed);
      try {
        await unlockElementalMoves(refreshed);
      } catch (syncErr) {
        console.warn('BattleContext unlock after elemental awaken', syncErr);
      }
      setShowPicker(false);
      if (playerMissionId) {
        await markMissionSequenceStepComplete(playerMissionId, step.id, { element: refreshed });
      }
      onRefreshCompletion();
    } catch (e) {
      console.error('Mission elemental awaken failed', e);
      alert(e instanceof Error ? e.message : 'Failed to awaken your Element. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const elementLabel = formatElementDisplayLabel(currentElement);
  const elementColor = getElementDisplayColor(currentElement);
  const isAwakened = !!currentElement;

  return (
    <div>
      {step.title && <h2 style={{ marginBottom: '1rem' }}>{step.title}</h2>}
      {step.bodyText?.trim() && (
        <p
          style={{
            fontSize: '1.05rem',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            marginBottom: '1rem',
            color: '#374151',
          }}
        >
          {step.bodyText}
        </p>
      )}
      {step.prompt?.trim() && (
        <p style={{ fontWeight: 700, marginBottom: '1.25rem', fontSize: '1.1rem', color: '#1f2937' }}>
          {step.prompt}
        </p>
      )}

      {loading ? (
        <p style={{ color: '#6b7280' }}>Loading…</p>
      ) : (
        <>
          <div
            style={{
              marginBottom: '1.25rem',
              padding: '1rem 1.15rem',
              borderRadius: '0.75rem',
              border: `2px solid ${elementColor}`,
              background: isAwakened
                ? `linear-gradient(135deg, ${elementColor}18 0%, #fff 100%)`
                : 'linear-gradient(135deg, #f3f4f6 0%, #fff 100%)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '2.5rem' }}>
                {isAwakened
                  ? elementTypeEmoji(currentElement as ElementType)
                  : '◎'}
              </span>
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#6b7280',
                    letterSpacing: '0.04em',
                  }}
                >
                  YOUR ELEMENT
                </div>
                <div style={{ fontWeight: 800, fontSize: '1.25rem', color: elementColor }}>
                  {isAwakened ? elementLabel : ELEMENT_UNAWAKENED_LABEL}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#4b5563', marginTop: '0.25rem' }}>
                  {isAwakened
                    ? `Level 1 ${elementLabel} skills are unlocked for battle.`
                    : 'Choose Fire, Water, Earth, or Air to awaken your elemental skills.'}
                </div>
              </div>
            </div>
          </div>

          {stepAlreadyComplete && (
            <p style={{ margin: '0 0 1rem', color: '#166534', fontWeight: 600 }}>
              Element awakening recorded for this mission step.
            </p>
          )}

          {((!isAwakened && !stepAlreadyComplete) || allowReselect) && (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              disabled={saving}
              style={{
                padding: '0.85rem 1.5rem',
                background: saving
                  ? '#9ca3af'
                  : 'linear-gradient(135deg, #ea580c 0%, #0284c7 55%, #65a30d 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontWeight: 800,
                fontSize: '1rem',
              }}
            >
              {saving
                ? 'Awakening…'
                : allowReselect && isAwakened
                  ? 'Choose a different Element'
                  : 'Awaken Elemental Skills'}
            </button>
          )}

          {requireSelection && !stepAlreadyComplete && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem', color: '#92400e' }}>
              Awaken an Element above to continue.
            </p>
          )}
        </>
      )}

      {showPicker && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '2rem',
          }}
          onClick={() => !saving && setShowPicker(false)}
        >
          <div
            style={{
              background: 'linear-gradient(135deg, #1e3a5f 0%, #0f766e 55%, #854d0e 100%)',
              borderRadius: '1.5rem',
              padding: '2.5rem',
              maxWidth: '560px',
              width: '100%',
              color: 'white',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
              textAlign: 'center',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {!saving && (
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                style={{
                  position: 'absolute',
                  top: '1rem',
                  right: '1rem',
                  background: 'rgba(255, 255, 255, 0.2)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '2rem',
                  height: '2rem',
                  color: 'white',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            )}

            <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'center' }}>
              <img
                src="/images/Elemental Ring.png"
                alt="Elemental Ring"
                style={{
                  width: '160px',
                  height: 'auto',
                  borderRadius: '0.5rem',
                  border: '3px solid rgba(255, 255, 255, 0.3)',
                }}
              />
            </div>

            <h2 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.75rem' }}>
              Awaken Elemental Skills
            </h2>
            <p
              style={{
                fontSize: '1.1rem',
                lineHeight: 1.55,
                opacity: 0.95,
                marginBottom: '1.75rem',
                fontWeight: 500,
              }}
            >
              {step.prompt?.trim() || 'Which element most aligns with your nature?'}
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '1rem',
                marginBottom: '0.5rem',
              }}
            >
              {SELECTABLE_ONBOARDING_ELEMENTS.map((el) => {
                const colors = ELEMENT_BUTTON_STYLES[el] || ELEMENT_BUTTON_STYLES.fire;
                return (
                  <button
                    key={el}
                    type="button"
                    disabled={saving}
                    onClick={() => void handleAwaken(el)}
                    style={{
                      background: colors.bg,
                      border:
                        currentElement === el ? '3px solid rgba(255,255,255,0.9)' : 'none',
                      borderRadius: '0.75rem',
                      padding: '1.25rem',
                      color: 'white',
                      fontSize: '1.125rem',
                      fontWeight: 'bold',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '0.5rem',
                      opacity: saving ? 0.7 : 1,
                    }}
                    onMouseOver={(e) => {
                      if (!saving) e.currentTarget.style.background = colors.hover;
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = colors.bg;
                    }}
                  >
                    <span style={{ fontSize: '2rem' }}>{elementTypeEmoji(el)}</span>
                    <span>{elementTypeLabel(el)}</span>
                  </button>
                );
              })}
            </div>

            {saving && (
              <p style={{ margin: '1rem 0 0', fontSize: '0.9rem', opacity: 0.9 }}>
                Awakening your Element…
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MissionElementalSkillsStepPanel;
