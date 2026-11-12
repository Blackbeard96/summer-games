import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { MissionSequenceStep } from '../../types/missions';
import type { ClassSkill } from '../../types/classSkills';
import { CLASS_SKILL_ELEMENTS } from '../../types/classSkills';
import { markMissionSequenceStepComplete } from '../../utils/missionsService';
import { IRL_TARGET_LABELS, describeDuration, elementalLevelFromMoves } from '../../utils/classSkillsConfig';
import { chooseClassSkills, classSkillArtKey, subscribeClassSkills } from '../../utils/classSkillsService';
import { loadSkillArtwork } from '../../utils/skillArtwork';
import { extractElementOrNull } from '../../utils/elementDisplay';
import { getEarnedSecondElementFromStudent } from '../../utils/artifactPerkEffects';
import { grantPlayerElement } from '../../utils/elementSelectionService';
import { useBattle } from '../../context/BattleContext';
import SkillCardArt from '../skillCard/SkillCardArt';

interface Props {
  step: Extract<MissionSequenceStep, { type: 'CLASS_SKILL_CHOICE' }>;
  userId: string;
  playerMissionId: string | null;
  stepAlreadyComplete: boolean;
  onRefreshCompletion: () => void;
}

interface PlayerContext {
  /** Elements the player has (primary, second, or unlocked elemental moves). */
  elements: string[];
  primary: string | null;
  second: string | null;
  levels: Record<string, number>;
  /** Picks already recorded on this step. */
  previous: string[];
}

type ElementAccess = 'owned' | 'awaken' | 'second' | 'full';

function elementAccess(ctx: PlayerContext, element: string): ElementAccess {
  if (ctx.elements.includes(element)) return 'owned';
  if (!ctx.primary) return 'awaken';
  return ctx.second ? 'full' : 'second';
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const ELEMENT_ACCENT: Record<string, string> = {
  fire: '#ea580c',
  water: '#0284c7',
  air: '#7c3aed',
  earth: '#65a30d',
  lightning: '#d97706',
  light: '#ca8a04',
  shadow: '#4b5563',
  metal: '#64748b',
};

const MissionClassSkillChoiceStepPanel: React.FC<Props> = ({
  step,
  userId,
  playerMissionId,
  stepAlreadyComplete,
  onRefreshCompletion,
}) => {
  const { unlockElementalMoves } = useBattle();
  const [skills, setSkills] = useState<ClassSkill[] | null>(null);
  const [ctx, setCtx] = useState<PlayerContext | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [changing, setChanging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowReselect = step.allowReselect === true;
  const requireSelection = step.requireSelection !== false;

  useEffect(() => {
    loadSkillArtwork().catch(() => undefined);
    return subscribeClassSkills(setSkills);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadError(false);
        const [userSnap, studentSnap, movesSnap, missionSnap] = await Promise.all([
          getDoc(doc(db, 'users', userId)),
          getDoc(doc(db, 'students', userId)),
          getDoc(doc(db, 'battleMoves', userId)).catch(() => null),
          playerMissionId ? getDoc(doc(db, 'playerMissions', playerMissionId)) : Promise.resolve(null),
        ]);
        const moves = movesSnap?.exists() ? movesSnap.data()?.moves : null;
        const levels: Record<string, number> = {};
        CLASS_SKILL_ELEMENTS.forEach((el) => (levels[el] = elementalLevelFromMoves(moves, el)));
        const studentData = studentSnap.exists() ? studentSnap.data() : undefined;
        const primary = extractElementOrNull(userSnap.exists() ? userSnap.data() : undefined, studentData);
        const second = getEarnedSecondElementFromStudent(studentData);
        const elements = new Set<string>(CLASS_SKILL_ELEMENTS.filter((el) => levels[el] > 0));
        if (primary) elements.add(primary);
        if (second) elements.add(second);
        const completion = missionSnap?.exists() ? missionSnap.data()?.sequenceStepCompletion?.[step.id] : null;
        const previous: string[] = Array.isArray(completion?.classSkillIds) ? completion.classSkillIds : [];
        if (cancelled) return;
        setCtx({ elements: Array.from(elements), primary, second, levels, previous });
        setPicked(previous);
      } catch (e) {
        console.error('MissionClassSkillChoiceStepPanel load', e);
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, playerMissionId, step.id, reloadKey]);

  const offered = useMemo(() => {
    if (!skills || !ctx) return null;
    const ids = new Set(step.skillIds || []);
    return skills.filter((s) => ids.has(s.id) && s.status === 'active');
  }, [skills, ctx, step.skillIds]);

  const needed = Math.max(1, Math.min(step.pickCount || 1, offered?.length || 1));

  // The step has no active Class Skills at all: record it so the mission never gets stuck.
  useEffect(() => {
    if (!offered || offered.length > 0 || stepAlreadyComplete || !playerMissionId) return;
    void markMissionSequenceStepComplete(playerMissionId, step.id).then(() => onRefreshCompletion());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once the offer list resolves
  }, [offered, stepAlreadyComplete, playerMissionId, step.id]);

  /** New Elements the current picks would add (at most one second Element can be granted). */
  const newElements = (ids: string[]) =>
    Array.from(new Set((offered || []).filter((s) => ids.includes(s.id) && ctx && !ctx.elements.includes(s.element)).map((s) => s.element)));
  const newElementLimit = ctx && !ctx.primary ? 2 : ctx?.second ? 0 : 1;

  const toggle = (id: string) =>
    setPicked((p) => {
      if (p.includes(id)) return p.filter((x) => x !== id);
      const next = needed === 1 ? [id] : p.length < needed ? [...p, id] : p;
      return newElements(next).length > newElementLimit ? p : next;
    });

  const confirm = async () => {
    if (saving || picked.length !== needed || !ctx) return;
    setSaving(true);
    setError(null);
    for (const element of newElements(picked)) {
      const granted = await grantPlayerElement(userId, element);
      if (!granted.success) {
        setError(granted.error || `Could not unlock ${cap(element)}.`);
        setSaving(false);
        return;
      }
      if (granted.grantedAs === 'primary') {
        try {
          await unlockElementalMoves(element);
        } catch (syncErr) {
          console.warn('BattleContext unlock after Class Skill awaken', syncErr);
        }
      }
    }
    const res = await chooseClassSkills(userId, picked, ctx.previous);
    if (!res.ok) {
      setError(res.error);
      setSaving(false);
      return;
    }
    if (playerMissionId) {
      const done = await markMissionSequenceStepComplete(playerMissionId, step.id, { classSkillIds: picked });
      if (!done.success) setError(done.error || 'Could not save your choice.');
    }
    setChanging(false);
    setSaving(false);
    setReloadKey((k) => k + 1);
    onRefreshCompletion();
  };

  // A step completed without a recorded pick (older empty-list bug) stays choosable.
  const hasRecordedPick = (ctx?.previous.length || 0) > 0;
  const editable = !stepAlreadyComplete || !hasRecordedPick || (allowReselect && changing);
  const chosenNames = (skills || []).filter((s) => ctx?.previous.includes(s.id)).map((s) => s.name);

  return (
    <div>
      {step.title && <h2 style={{ marginBottom: '1rem' }}>{step.title}</h2>}
      {step.bodyText?.trim() && (
        <p style={{ fontSize: '1.05rem', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: '1rem', color: '#374151' }}>{step.bodyText}</p>
      )}
      {step.prompt?.trim() && (
        <p style={{ fontWeight: 700, marginBottom: '1.25rem', fontSize: '1.1rem', color: '#1f2937' }}>{step.prompt}</p>
      )}

      {loadError ? (
        <p style={{ color: '#b91c1c' }}>
          Could not load your Elements.{' '}
          <button type="button" onClick={() => setReloadKey((k) => k + 1)} style={{ fontWeight: 700, textDecoration: 'underline', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>
            Try again
          </button>
        </p>
      ) : offered === null ? (
        <p style={{ color: '#6b7280' }}>Loading Class Skills…</p>
      ) : offered.length === 0 ? (
        <p style={{ color: '#6b7280' }}>There are no Class Skills on this step yet. You can continue the mission.</p>
      ) : (
        <>
          {stepAlreadyComplete && hasRecordedPick && !changing && (
            <p style={{ margin: '0 0 1rem', color: '#166534', fontWeight: 600 }}>
              {chosenNames.length ? `You chose: ${chosenNames.join(', ')}.` : 'Your choice is recorded for this step.'}
            </p>
          )}

          {editable && (
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.9rem', color: '#4b5563' }}>
              Choose {needed} skill{needed === 1 ? '' : 's'} ({picked.length}/{needed} selected).
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.85rem', marginBottom: '1rem' }}>
            {offered.map((s) => {
              const on = editable ? picked.includes(s.id) : !!ctx?.previous.includes(s.id);
              const accent = ELEMENT_ACCENT[s.element] || '#0f766e';
              const access = ctx ? elementAccess(ctx, s.element) : 'owned';
              const blocked = editable && access === 'full';
              const usableNow = (ctx?.levels[s.element] || 0) >= s.level;
              const elementNote =
                access === 'awaken'
                  ? `Choosing this awakens ${cap(s.element)} as your Element.`
                  : access === 'second'
                    ? `Choosing this unlocks ${cap(s.element)} as your second Element.`
                    : access === 'full'
                      ? `You already have two Elements (${cap(ctx?.primary || '')} and ${cap(ctx?.second || '')}).`
                      : !usableNow
                        ? `Usable once you reach ${s.element} level ${s.level}.`
                        : null;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!editable || saving || blocked}
                  aria-pressed={on}
                  onClick={() => toggle(s.id)}
                  style={{
                    textAlign: 'left',
                    padding: 0,
                    borderRadius: '0.75rem',
                    border: `2px solid ${on ? accent : '#e5e7eb'}`,
                    boxShadow: on ? `0 0 0 3px ${accent}33` : 'none',
                    background: on ? `linear-gradient(135deg, ${accent}14 0%, #fff 100%)` : '#fff',
                    cursor: editable && !blocked ? 'pointer' : 'default',
                    overflow: 'hidden',
                    opacity: (!editable && !on) || blocked ? 0.55 : 1,
                  }}
                >
                  <SkillCardArt
                    skill={{ id: classSkillArtKey(s.id), name: s.name, category: 'elemental', elementalAffinity: s.element }}
                    alt=""
                    style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }}
                  />
                  <div style={{ padding: '0.7rem 0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                      <strong style={{ color: '#111827' }}>{s.name}</strong>
                      {on && <span style={{ color: accent, fontWeight: 800 }}>✓</span>}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#6b7280', margin: '2px 0 6px', textTransform: 'capitalize' }}>
                      {s.element} · Lv {s.level} · {IRL_TARGET_LABELS[s.targetType]} · {describeDuration(s)}
                    </div>
                    <div style={{ fontSize: '0.88rem', color: '#374151' }}>{s.irlEffect || s.description}</div>
                    {elementNote && (
                      <div style={{ fontSize: '0.78rem', color: access === 'full' ? '#6b7280' : '#92400e', marginTop: 6 }}>{elementNote}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {error && <p style={{ color: '#b91c1c', margin: '0 0 0.75rem' }}>{error}</p>}

          {editable ? (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={saving || picked.length !== needed}
                style={{
                  padding: '0.85rem 1.5rem',
                  background: saving || picked.length !== needed ? '#9ca3af' : 'linear-gradient(135deg, #0f766e 0%, #ca8a04 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  cursor: saving || picked.length !== needed ? 'not-allowed' : 'pointer',
                  fontWeight: 800,
                  fontSize: '1rem',
                }}
              >
                {saving ? 'Saving…' : needed === 1 ? 'Choose this Class Skill' : 'Choose these Class Skills'}
              </button>
              {changing && (
                <button
                  type="button"
                  onClick={() => {
                    setChanging(false);
                    setPicked(ctx?.previous || []);
                  }}
                  style={{ padding: '0.85rem 1.25rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 700 }}
                >
                  Keep my current pick
                </button>
              )}
            </div>
          ) : (
            allowReselect && (
              <button
                type="button"
                onClick={() => setChanging(true)}
                style={{ padding: '0.7rem 1.25rem', background: '#0f766e', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 700 }}
              >
                Choose a different Class Skill
              </button>
            )
          )}

          {requireSelection && (!stepAlreadyComplete || !hasRecordedPick) && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem', color: '#92400e' }}>Choose above to continue.</p>
          )}
        </>
      )}
    </div>
  );
};

export default MissionClassSkillChoiceStepPanel;
