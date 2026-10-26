import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import SkillArtworkEditor from './SkillArtworkEditor';
import type {
  ClassSkill,
  ClassSkillElement,
  IrlConsequenceType,
  IrlDurationKind,
  IrlEffectType,
  IrlRewardType,
  IrlRuleEffect,
  IrlTargetType,
} from '../../types/classSkills';
import {
  CLASS_SKILL_LIMITS,
  IRL_CONSEQUENCE_LABELS,
  IRL_DURATION_LABELS,
  IRL_EFFECT_LABELS,
  IRL_EFFECT_TYPES,
  IRL_ESSENTIAL_EXCEPTIONS,
  IRL_TARGET_LABELS,
  IRL_VERIFICATION_LABELS,
  describeConsequence,
  describeDuration,
  describeReward,
  isClassSkillElement,
  newClassSkill,
  parseClassSkill,
  validateClassSkill,
} from '../../utils/classSkillsConfig';
import {
  classSkillArtKey,
  deleteClassSkill,
  installClassSkillTemplates,
  newClassSkillId,
  saveClassSkill,
  subscribeClassSkills,
} from '../../utils/classSkillsService';

interface ClassSkillsAdminProps {
  element: string | null;
  elementName: string;
  elementColor: string;
}

const box: React.CSSProperties = { border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', padding: '1rem' };
const label: React.CSSProperties = { display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4, fontWeight: 600 };
const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.45rem 0.6rem',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(15,23,42,0.8)',
  color: 'white',
  fontSize: '0.85rem',
};
const btn = (bg: string): React.CSSProperties => ({
  padding: '0.45rem 0.9rem',
  background: bg,
  border: 'none',
  borderRadius: 6,
  color: 'white',
  cursor: 'pointer',
  fontSize: '0.82rem',
  fontWeight: 600,
});
const STATUS_COLORS: Record<ClassSkill['status'], string> = { draft: '#64748b', active: '#10b981', disabled: '#ef4444' };

const Field: React.FC<{ title: string; children: React.ReactNode; span?: number }> = ({ title, children, span }) => (
  <label style={{ gridColumn: span ? `span ${span}` : undefined }}>
    <span style={label}>{title}</span>
    {children}
  </label>
);

/** Class Skills (IRL) editor shown under the CLASS SKILLS (IRL) tab of the Elemental Moves Admin. */
const ClassSkillsAdmin: React.FC<ClassSkillsAdminProps> = ({ element, elementName, elementColor }) => {
  const { currentUser } = useAuth();
  const [skills, setSkills] = useState<ClassSkill[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ClassSkill | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => subscribeClassSkills(setSkills, (e) => setLoadError(e.message)), []);

  useEffect(() => {
    setDraft((d) => (d && d.element !== element ? null : d));
    setMessage(null);
  }, [element]);

  const elementSkills = useMemo(() => skills.filter((s) => s.element === element), [skills, element]);
  const errors = draft ? validateClassSkill(draft) : [];
  const isSaved = !!draft?.id && skills.some((s) => s.id === draft.id);

  const patch = (p: Partial<ClassSkill>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const patchEffect = (idx: number, p: Partial<IrlRuleEffect>) =>
    setDraft((d) => (d ? { ...d, effects: d.effects.map((e, i) => (i === idx ? { ...e, ...p } : e)) } : d));

  const save = async () => {
    if (!draft || errors.length || !currentUser) return;
    setBusy(true);
    const res = await saveClassSkill(parseClassSkill(draft.id, draft), currentUser.uid);
    setBusy(false);
    if (res.ok) {
      setDraft((d) => (d ? { ...d, id: res.value || d.id } : d));
      setMessage({ tone: 'ok', text: 'Saved.' });
    } else {
      setMessage({ tone: 'error', text: res.error });
    }
  };

  const remove = async () => {
    if (!draft?.id || !window.confirm(`Delete "${draft.name}"? Active rules already in Live Events are not affected.`)) return;
    setBusy(true);
    const res = await deleteClassSkill(draft.id);
    setBusy(false);
    if (res.ok) {
      setDraft(null);
      setMessage({ tone: 'ok', text: 'Deleted.' });
    } else setMessage({ tone: 'error', text: res.error });
  };

  const installTemplates = async () => {
    if (!currentUser) return;
    setBusy(true);
    const res = await installClassSkillTemplates(skills, currentUser.uid);
    setBusy(false);
    setMessage(
      res.ok
        ? { tone: 'ok', text: res.value ? `Added ${res.value} example skill${res.value === 1 ? '' : 's'} as drafts. Review and set them to Active to use them.` : 'All example skills are already installed.' }
        : { tone: 'error', text: res.error }
    );
  };

  if (!element || !isClassSkillElement(element)) {
    return (
      <div style={{ ...box, color: '#9ca3af', textAlign: 'center', padding: '2rem' }}>
        Select an element to view its Class Skills
      </div>
    );
  }

  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, color: elementColor }}>{elementName} Class Skills (IRL)</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={btn('#334155')} onClick={installTemplates} disabled={busy}>
            Load example templates
          </button>
          <button
            type="button"
            style={btn('#10b981')}
            onClick={() => {
              setDraft(newClassSkill(element as ClassSkillElement, newClassSkillId()));
              setMessage(null);
            }}
            disabled={busy}
          >
            + New Class Skill
          </button>
        </div>
      </div>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.78rem', color: '#94a3b8' }}>
        Class Skills create temporary classroom rules that a facilitator verifies. They never affect battle damage, PP costs or cooldowns of In-Game Skills. {IRL_ESSENTIAL_EXCEPTIONS}
      </p>
      {loadError && <div style={{ color: '#fca5a5', fontSize: '0.8rem', marginBottom: 8 }}>Couldn't load Class Skills: {loadError}</div>}
      {message && (
        <div role="status" style={{ color: message.tone === 'ok' ? '#86efac' : '#fca5a5', fontSize: '0.82rem', marginBottom: 8 }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '1rem' }}>
        {elementSkills.length === 0 && <div style={{ color: '#64748b', fontSize: '0.85rem' }}>No Class Skills for {elementName} yet.</div>}
        {elementSkills.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setDraft(s);
              setMessage(null);
            }}
            style={{
              ...btn(draft?.id === s.id ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.05)'),
              border: `1px solid ${draft?.id === s.id ? '#fbbf24' : 'rgba(255,255,255,0.12)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>{s.name}</span>
            <span style={{ fontSize: '0.7rem', color: '#cbd5e1' }}>Lv {s.level}</span>
            <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 999, background: STATUS_COLORS[s.status] }}>{s.status}</span>
          </button>
        ))}
      </div>

      {draft && (
        <div style={{ display: 'grid', gap: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.75rem' }}>
            <Field title="Name" span={2}>
              <input style={input} value={draft.name} maxLength={80} onChange={(e) => patch({ name: e.target.value })} />
            </Field>
            <Field title="Required elemental level">
              <select style={input} value={draft.level} onChange={(e) => patch({ level: Number(e.target.value) })}>
                {Array.from({ length: CLASS_SKILL_LIMITS.maxLevel }, (_, i) => i + 1).map((l) => (
                  <option key={l} value={l}>
                    Level {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field title="Status">
              <select style={input} value={draft.status} onChange={(e) => patch({ status: e.target.value as ClassSkill['status'] })}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </Field>
            <Field title="Description" span={2}>
              <textarea style={{ ...input, minHeight: 56 }} value={draft.description} onChange={(e) => patch({ description: e.target.value })} />
            </Field>
            <Field title="IRL effect (what happens in class)" span={2}>
              <textarea style={{ ...input, minHeight: 56 }} value={draft.irlEffect} onChange={(e) => patch({ irlEffect: e.target.value })} />
            </Field>
            <Field title="Target">
              <select style={input} value={draft.targetType} onChange={(e) => patch({ targetType: e.target.value as IrlTargetType })}>
                {(Object.keys(IRL_TARGET_LABELS) as IrlTargetType[]).map((t) => (
                  <option key={t} value={t}>
                    {IRL_TARGET_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field title="Duration">
              <select style={input} value={draft.durationKind} onChange={(e) => patch({ durationKind: e.target.value as IrlDurationKind, durationSeconds: draft.durationSeconds || 120 })}>
                {(Object.keys(IRL_DURATION_LABELS) as IrlDurationKind[]).map((d) => (
                  <option key={d} value={d}>
                    {IRL_DURATION_LABELS[d]}
                  </option>
                ))}
              </select>
            </Field>
            <Field title="Minutes (timed)">
              <input
                style={input}
                type="number"
                min={1}
                max={CLASS_SKILL_LIMITS.maxDurationSeconds / 60}
                disabled={draft.durationKind !== 'timed'}
                value={draft.durationKind === 'timed' ? Math.round((draft.durationSeconds || 120) / 6) / 10 : ''}
                onChange={(e) => patch({ durationSeconds: Math.round(Number(e.target.value) * 60) })}
              />
            </Field>
            <Field title="Verification">
              <select style={input} value={draft.verification} onChange={(e) => patch({ verification: e.target.value as ClassSkill['verification'] })}>
                {Object.entries(IRL_VERIFICATION_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field title={`Activation cost (Participation Points, max ${CLASS_SKILL_LIMITS.maxCost})`}>
              <input style={input} type="number" min={0} max={CLASS_SKILL_LIMITS.maxCost} value={draft.activationCost} onChange={(e) => patch({ activationCost: Number(e.target.value) })} />
            </Field>
            <Field title="Cooldown (minutes)">
              <input
                style={input}
                type="number"
                min={0}
                max={CLASS_SKILL_LIMITS.maxCooldownSeconds / 60}
                value={Math.round(draft.cooldownSeconds / 6) / 10}
                onChange={(e) => patch({ cooldownSeconds: Math.round(Number(e.target.value) * 60) })}
              />
            </Field>
            <Field title="Approval">
              <select style={input} value={draft.approval} onChange={(e) => patch({ approval: e.target.value as ClassSkill['approval'] })}>
                <option value="facilitator">Facilitator approval</option>
                <option value="auto">Automatic (when the event allows)</option>
              </select>
            </Field>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', alignSelf: 'end' }}>
              Whole-class and restriction skills always need facilitator approval.
            </div>
            <Field title="Activation conditions" span={2}>
              <textarea style={{ ...input, minHeight: 48 }} value={draft.activationConditions} onChange={(e) => patch({ activationConditions: e.target.value })} />
            </Field>
            <Field title="Violation conditions" span={2}>
              <textarea style={{ ...input, minHeight: 48 }} value={draft.violationConditions} onChange={(e) => patch({ violationConditions: e.target.value })} />
            </Field>
          </div>

          <div style={{ ...box, background: 'rgba(15,23,42,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ color: '#fbbf24', fontSize: '0.9rem' }}>Rule Builder</strong>
              <button
                type="button"
                style={btn('#334155')}
                disabled={draft.effects.length >= CLASS_SKILL_LIMITS.maxEffects}
                onClick={() => patch({ effects: [...draft.effects, { id: `e${Date.now().toString(36)}`, type: 'challenge', behavior: '', trigger: 'on_activation' }] })}
              >
                + Add rule
              </button>
            </div>
            {draft.effects.map((eff, i) => (
              <div key={eff.id} style={{ display: 'grid', gridTemplateColumns: '170px 1fr auto', gap: 8, alignItems: 'start', marginBottom: 8 }}>
                <select
                  style={input}
                  aria-label={`Rule ${i + 1} type`}
                  value={eff.type}
                  onChange={(e) => {
                    const type = e.target.value as IrlEffectType;
                    patchEffect(i, { type, blocksIrlSkills: type === 'restriction' ? eff.blocksIrlSkills : undefined, blocksRestrictions: type === 'protection' ? eff.blocksRestrictions || 1 : undefined });
                  }}
                >
                  {IRL_EFFECT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {IRL_EFFECT_LABELS[t]}
                    </option>
                  ))}
                </select>
                <div>
                  <input
                    style={input}
                    aria-label={`Rule ${i + 1} required behavior`}
                    placeholder="Required behavior, e.g. Remain silent except for approved communication"
                    value={eff.behavior}
                    maxLength={300}
                    onChange={(e) => patchEffect(i, { behavior: e.target.value })}
                  />
                  {eff.type === 'restriction' && (
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.75rem', color: '#cbd5e1', marginTop: 4 }}>
                      <input type="checkbox" checked={!!eff.blocksIrlSkills} onChange={(e) => patchEffect(i, { blocksIrlSkills: e.target.checked })} />
                      Target can't use Class Skills while active
                    </label>
                  )}
                  {eff.type === 'protection' && (
                    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: '0.75rem', color: '#cbd5e1', marginTop: 4 }}>
                      Blocks
                      <input
                        type="number"
                        min={1}
                        max={CLASS_SKILL_LIMITS.maxProtectionBlocks}
                        style={{ ...input, width: 60 }}
                        value={eff.blocksRestrictions || 1}
                        onChange={(e) => patchEffect(i, { blocksRestrictions: Number(e.target.value) })}
                      />
                      incoming restriction(s)
                    </label>
                  )}
                </div>
                <button type="button" style={btn('#7f1d1d')} aria-label={`Remove rule ${i + 1}`} onClick={() => patch({ effects: draft.effects.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </div>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.75rem', marginTop: 8 }}>
              <Field title="Consequence (only after facilitator confirmation)">
                <select style={input} value={draft.consequence.type} onChange={(e) => patch({ consequence: { ...draft.consequence, type: e.target.value as IrlConsequenceType } })}>
                  {(Object.keys(IRL_CONSEQUENCE_LABELS) as IrlConsequenceType[]).map((c) => (
                    <option key={c} value={c}>
                      {IRL_CONSEQUENCE_LABELS[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field title={draft.consequence.type === 'disable_irl_skills' ? `Minutes (max ${CLASS_SKILL_LIMITS.maxDisableMinutes})` : `PP (max ${CLASS_SKILL_LIMITS.maxPenaltyPP})`}>
                <input
                  style={input}
                  type="number"
                  min={0}
                  disabled={draft.consequence.type !== 'deduct_pp' && draft.consequence.type !== 'disable_irl_skills'}
                  value={draft.consequence.amount}
                  onChange={(e) => patch({ consequence: { ...draft.consequence, amount: Number(e.target.value) } })}
                />
              </Field>
              <Field title="Consequence note" span={2}>
                <input style={input} maxLength={300} value={draft.consequence.note} onChange={(e) => patch({ consequence: { ...draft.consequence, note: e.target.value } })} />
              </Field>
              <Field title="Reward">
                <select style={input} value={draft.reward.type} onChange={(e) => patch({ reward: { ...draft.reward, type: e.target.value as IrlRewardType } })}>
                  <option value="none">No reward</option>
                  <option value="bonus_pp">Bonus PP on completion</option>
                  <option value="reward_multiplier">Reward multiplier (bounded)</option>
                </select>
              </Field>
              <Field title={draft.reward.type === 'reward_multiplier' ? `Max bonus PP (≤ ${CLASS_SKILL_LIMITS.maxRewardPP})` : `PP (≤ ${CLASS_SKILL_LIMITS.maxRewardPP})`}>
                <input
                  style={input}
                  type="number"
                  min={0}
                  disabled={draft.reward.type === 'none'}
                  value={draft.reward.amount}
                  onChange={(e) => patch({ reward: { ...draft.reward, amount: Number(e.target.value) } })}
                />
              </Field>
              <Field title={`Multiplier (1–${CLASS_SKILL_LIMITS.maxMultiplier})`}>
                <input
                  style={input}
                  type="number"
                  step={0.05}
                  min={1}
                  max={CLASS_SKILL_LIMITS.maxMultiplier}
                  disabled={draft.reward.type !== 'reward_multiplier'}
                  value={draft.reward.multiplier}
                  onChange={(e) => patch({ reward: { ...draft.reward, multiplier: Number(e.target.value) } })}
                />
              </Field>
            </div>

            {(() => {
              const p = parseClassSkill(draft.id, draft);
              return (
                <div style={{ marginTop: 10, fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.6 }}>
                  <div>
                    <strong>TARGET</strong> {IRL_TARGET_LABELS[p.targetType]} · <strong>TRIGGER</strong> On approved activation · <strong>DURATION</strong> {describeDuration(p)}
                  </div>
                  {p.effects.map((e) => (
                    <div key={e.id}>
                      <strong>{IRL_EFFECT_LABELS[e.type].toUpperCase()}</strong> {e.behavior || '—'}
                    </div>
                  ))}
                  <div>
                    <strong>CONSEQUENCE</strong> {describeConsequence(p.consequence)} · <strong>REWARD</strong> {describeReward(p.reward)}
                  </div>
                </div>
              );
            })()}
          </div>

          <div style={box}>
            <strong style={{ color: '#fbbf24', fontSize: '0.9rem' }}>Skill Card artwork</strong>
            {draft.id && <SkillArtworkEditor skillKey={classSkillArtKey(draft.id)} skillName={draft.name} category="elemental" elementalAffinity={draft.element} />}
            {!isSaved && (
              <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: 6 }}>
                Artwork saves right away and is linked to this skill once you click Save Class Skill.
              </div>
            )}
          </div>

          {errors.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: '1.2rem', color: '#fca5a5', fontSize: '0.8rem' }}>
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {isSaved && (
              <button type="button" style={btn('#991b1b')} onClick={remove} disabled={busy}>
                Delete
              </button>
            )}
            <button type="button" style={btn('#475569')} onClick={() => setDraft(null)} disabled={busy}>
              Close
            </button>
            <button type="button" style={{ ...btn('#10b981'), opacity: errors.length ? 0.5 : 1 }} onClick={save} disabled={busy || errors.length > 0}>
              {busy ? 'Saving…' : 'Save Class Skill'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClassSkillsAdmin;
