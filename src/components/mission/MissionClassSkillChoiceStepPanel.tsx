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
import SkillCardArt from '../skillCard/SkillCardArt';

interface Props {
  step: Extract<MissionSequenceStep, { type: 'CLASS_SKILL_CHOICE' }>;
  userId: string;
  playerMissionId: string | null;
  stepAlreadyComplete: boolean;
  onRefreshCompletion: () => void;
}

interface PlayerContext {
  /** Elements the player has (awakened affinity or unlocked elemental moves). */
  elements: string[];
  levels: Record<string, number>;
  /** Picks already recorded on this step. */
  previous: string[];
}

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
  const [skills, setSkills] = useState<ClassSkill[] | null>(null);
  const [ctx, setCtx] = useState<PlayerContext | null>(null);
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
        const [userSnap, studentSnap, movesSnap, missionSnap] = await Promise.all([
          getDoc(doc(db, 'users', userId)),
          getDoc(doc(db, 'students', userId)),
          getDoc(doc(db, 'battleMoves', userId)).catch(() => null),
          playerMissionId ? getDoc(doc(db, 'playerMissions', playerMissionId)) : Promise.resolve(null),
        ]);
        const moves = movesSnap?.exists() ? movesSnap.data()?.moves : null;
        const levels: Record<string, number> = {};
        CLASS_SKILL_ELEMENTS.forEach((el) => (levels[el] = elementalLevelFromMoves(moves, el)));
        const affinity = extractElementOrNull(
          userSnap.exists() ? userSnap.data() : undefined,
          studentSnap.exists() ? studentSnap.data() : undefined
        );
        const elements = new Set(CLASS_SKILL_ELEMENTS.filter((el) => levels[el] > 0));
        if (affinity) elements.add(String(affinity).toLowerCase() as (typeof CLASS_SKILL_ELEMENTS)[number]);
        const completion = missionSnap?.exists() ? missionSnap.data()?.sequenceStepCompletion?.[step.id] : null;
        const previous: string[] = Array.isArray(completion?.classSkillIds) ? completion.classSkillIds : [];
        if (cancelled) return;
        setCtx({ elements: Array.from(elements), levels, previous });
        setPicked(previous);
      } catch (e) {
        console.error('MissionClassSkillChoiceStepPanel load', e);
        if (!cancelled) setCtx({ elements: [], levels: {}, previous: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, playerMissionId, step.id]);

  const offered = useMemo(() => {
    if (!skills || !ctx) return null;
    const ids = new Set(step.skillIds || []);
    return skills.filter((s) => ids.has(s.id) && s.status === 'active' && ctx.elements.includes(s.element));
  }, [skills, ctx, step.skillIds]);

  const needed = Math.max(1, Math.min(step.pickCount || 1, offered?.length || 1));

  // Nothing to choose for this player: record the step so the mission never gets stuck.
  useEffect(() => {
    if (!offered || offered.length > 0 || stepAlreadyComplete || !playerMissionId) return;
    void markMissionSequenceStepComplete(playerMissionId, step.id).then(() => onRefreshCompletion());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once the offer list resolves
  }, [offered, stepAlreadyComplete, playerMissionId, step.id]);

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : needed === 1 ? [id] : p.length < needed ? [...p, id] : p));

  const confirm = async () => {
    if (saving || picked.length !== needed) return;
    setSaving(true);
    setError(null);
    const res = await chooseClassSkills(userId, picked, ctx?.previous || []);
    if (!res.ok) {
      setError(res.error);
      setSaving(false);
      return;
    }
    if (playerMissionId) {
      const done = await markMissionSequenceStepComplete(playerMissionId, step.id, { classSkillIds: picked });
      if (!done.success) setError(done.error || 'Could not save your choice.');
    }
    setCtx((c) => (c ? { ...c, previous: picked } : c));
    setChanging(false);
    setSaving(false);
    onRefreshCompletion();
  };

  const editable = !stepAlreadyComplete || (allowReselect && changing);
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

      {offered === null ? (
        <p style={{ color: '#6b7280' }}>Loading Class Skills…</p>
      ) : offered.length === 0 ? (
        <p style={{ color: '#6b7280' }}>
          {ctx && ctx.elements.length === 0
            ? 'Awaken your Element first to unlock Class Skills. You can continue the mission.'
            : 'There are no Class Skills for your Element on this step. You can continue the mission.'}
        </p>
      ) : (
        <>
          {stepAlreadyComplete && !changing && (
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
              const usableNow = (ctx?.levels[s.element] || 0) >= s.level;
              return (
                <button
                  key={s.id}
                  type="button"
                  disabled={!editable || saving}
                  aria-pressed={on}
                  onClick={() => toggle(s.id)}
                  style={{
                    textAlign: 'left',
                    padding: 0,
                    borderRadius: '0.75rem',
                    border: `2px solid ${on ? accent : '#e5e7eb'}`,
                    boxShadow: on ? `0 0 0 3px ${accent}33` : 'none',
                    background: on ? `linear-gradient(135deg, ${accent}14 0%, #fff 100%)` : '#fff',
                    cursor: editable ? 'pointer' : 'default',
                    overflow: 'hidden',
                    opacity: !editable && !on ? 0.55 : 1,
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
                    {!usableNow && (
                      <div style={{ fontSize: '0.78rem', color: '#92400e', marginTop: 6 }}>
                        Usable once you reach {s.element} level {s.level}.
                      </div>
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

          {requireSelection && !stepAlreadyComplete && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem', color: '#92400e' }}>Choose above to continue.</p>
          )}
        </>
      )}
    </div>
  );
};

export default MissionClassSkillChoiceStepPanel;
