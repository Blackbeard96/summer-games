import React, { useEffect, useMemo, useState } from 'react';
import type { MissionSequenceStep } from '../../types/missions';
import type { ClassSkill } from '../../types/classSkills';
import { CLASS_SKILL_ELEMENTS } from '../../types/classSkills';
import { subscribeClassSkills } from '../../utils/classSkillsService';

type Step = Extract<MissionSequenceStep, { type: 'CLASS_SKILL_CHOICE' }>;

interface Props {
  step: Step;
  onSave: (step: Step) => void;
  onCancel: () => void;
}

const field: React.CSSProperties = { width: '100%', padding: '0.5rem', borderRadius: '0.25rem', border: '1px solid #d1d5db', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' };
const STATUS_COLOR: Record<ClassSkill['status'], string> = { active: '#047857', draft: '#64748b', disabled: '#b91c1c' };

/** Mission Admin editor for a CLASS_SKILL_CHOICE step: pick which Class Skills (IRL) players choose from. */
const ClassSkillChoiceStepEditor: React.FC<Props> = ({ step, onSave, onCancel }) => {
  const [draft, setDraft] = useState<Step>({ ...step, skillIds: step.skillIds || [], pickCount: step.pickCount || 1 });
  const [skills, setSkills] = useState<ClassSkill[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => subscribeClassSkills(setSkills, (e) => setLoadError(e.message)), []);

  const byElement = useMemo(
    () => CLASS_SKILL_ELEMENTS.map((el) => ({ el, list: (skills || []).filter((s) => s.element === el) })).filter((g) => g.list.length),
    [skills]
  );
  const selected = new Set(draft.skillIds);
  const toggle = (id: string) =>
    setDraft((d) => ({ ...d, skillIds: selected.has(id) ? d.skillIds.filter((x) => x !== id) : [...d.skillIds, id] }));
  const setElement = (el: string, on: boolean) => {
    const ids = (skills || []).filter((s) => s.element === el).map((s) => s.id);
    setDraft((d) => ({ ...d, skillIds: on ? Array.from(new Set([...d.skillIds, ...ids])) : d.skillIds.filter((x) => !ids.includes(x)) }));
  };
  const offeredInactive = (skills || []).filter((s) => selected.has(s.id) && s.status !== 'active');
  const canSave = draft.skillIds.length > 0;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20000, padding: '2rem' }}
      onClick={onCancel}
    >
      <div
        style={{ background: 'white', borderRadius: '1rem', padding: '2rem', maxWidth: '680px', width: '100%', maxHeight: '90vh', overflow: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginBottom: '0.5rem' }}>Edit Class Skill Choice</h3>
        <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: '#6b7280' }}>
          Players pick from the Class Skills you offer here; each player only sees the ones for their element. Their picks
          become the Class Skills they can use in Live Events (players who never chose keep every skill for their element).
        </p>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Title (optional)</label>
          <input type="text" value={draft.title || ''} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={field} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Intro (optional)</label>
          <textarea value={draft.bodyText || ''} onChange={(e) => setDraft({ ...draft, bodyText: e.target.value })} rows={3} style={field} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Prompt (optional)</label>
          <textarea value={draft.prompt || ''} onChange={(e) => setDraft({ ...draft, prompt: e.target.value })} rows={2} style={field} />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Skills offered ({draft.skillIds.length} selected)</label>
          {loadError && <div style={{ color: '#b91c1c', fontSize: '0.85rem' }}>Couldn't load Class Skills: {loadError}</div>}
          {skills === null && !loadError && <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>Loading Class Skills…</div>}
          {skills && skills.length === 0 && (
            <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>
              No Class Skills yet. Create them in Elemental Moves Admin → Class Skills (IRL).
            </div>
          )}
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {byElement.map(({ el, list }) => {
              const allOn = list.every((s) => selected.has(s.id));
              return (
                <div key={el} style={{ border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.6rem 0.75rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, textTransform: 'capitalize', marginBottom: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={allOn} onChange={(e) => setElement(el, e.target.checked)} />
                    {el}
                  </label>
                  <div style={{ display: 'grid', gap: 4, paddingLeft: '1.5rem' }}>
                    {list.map((s) => (
                      <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                        <span>{s.name}</span>
                        <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>Lv {s.level}</span>
                        <span style={{ color: STATUS_COLOR[s.status], fontSize: '0.75rem', fontWeight: 700 }}>{s.status}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {offeredInactive.length > 0 && (
            <div style={{ marginTop: 8, color: '#b45309', fontSize: '0.8rem' }}>
              {offeredInactive.map((s) => s.name).join(', ')} {offeredInactive.length === 1 ? 'is' : 'are'} not Active, so
              players won't see {offeredInactive.length === 1 ? 'it' : 'them'} until you set Status to Active.
            </div>
          )}
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>Skills each player picks</label>
          <input
            type="number"
            min={1}
            max={5}
            value={draft.pickCount || 1}
            onChange={(e) => setDraft({ ...draft, pickCount: Math.max(1, Math.min(5, Math.floor(Number(e.target.value) || 1))) })}
            style={{ ...field, width: 90 }}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.requireSelection !== false} onChange={(e) => setDraft({ ...draft, requireSelection: e.target.checked })} />
          <span style={{ fontSize: '0.9rem' }}>Require choosing before Next</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={draft.allowReselect === true} onChange={(e) => setDraft({ ...draft, allowReselect: e.target.checked })} />
          <span style={{ fontSize: '0.9rem' }}>Allow changing the pick after completing this step</span>
        </label>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onSave(draft)}
            style={{
              padding: '0.75rem 1.5rem',
              background: 'linear-gradient(135deg, #0f766e 0%, #ca8a04 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: canSave ? 'pointer' : 'not-allowed',
              opacity: canSave ? 1 : 0.5,
              fontWeight: 'bold',
            }}
          >
            Save Step
          </button>
          <button
            type="button"
            onClick={onCancel}
            style={{ padding: '0.75rem 1.5rem', background: '#6b7280', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Cancel
          </button>
          {!canSave && <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Select at least one skill.</span>}
        </div>
      </div>
    </div>
  );
};

export default ClassSkillChoiceStepEditor;
