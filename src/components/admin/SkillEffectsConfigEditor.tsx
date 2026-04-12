import React, { useMemo } from 'react';
import { SKILL_EFFECT_REGISTRY, type SkillEffectFormField } from '../../data/skillEffectRegistry';
import { SKILL_EFFECT_TYPES, type SkillEffectPayload, type SkillEffectType } from '../../types/skillEffects';

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.75rem',
  fontWeight: 600,
  marginBottom: '0.2rem',
  color: '#374151',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.35rem',
  borderRadius: '0.25rem',
  border: '1px solid #d1d5db',
  fontSize: '0.8rem',
};

export interface SkillEffectsConfigEditorProps {
  value: SkillEffectPayload[];
  onChange: (next: SkillEffectPayload[]) => void;
  disabled?: boolean;
}

function defaultsFor(type: SkillEffectType): SkillEffectPayload {
  const row = SKILL_EFFECT_REGISTRY[type];
  return { type, ...(row?.defaults ?? {}) } as SkillEffectPayload;
}

function renderMetadataField(
  p: SkillEffectPayload,
  field: SkillEffectFormField,
  onPatch: (patch: Partial<SkillEffectPayload>) => void
): React.ReactNode {
  const md = { ...(p.metadata ?? {}) };
  if (field === 'metadata_remove_buff') {
    return (
      <div key={field}>
        <label style={labelStyle}>Remove buff mode</label>
        <select
          style={inputStyle}
          value={md.removeAll ? 'all' : 'one'}
          onChange={(e) =>
            onPatch({
              metadata: { ...md, removeOne: e.target.value === 'one', removeAll: e.target.value === 'all' },
            })
          }
        >
          <option value="one">Remove one</option>
          <option value="all">Remove all</option>
        </select>
      </div>
    );
  }
  if (field === 'metadata_reduce_cooldown') {
    return (
      <div key={field}>
        <label style={labelStyle}>Cooldown scope</label>
        <select
          style={inputStyle}
          value={md.scope === 'selected_skill' ? 'selected_skill' : 'all_equipped'}
          onChange={(e) =>
            onPatch({
              metadata: {
                ...md,
                scope: e.target.value === 'selected_skill' ? 'selected_skill' : 'all_equipped',
              },
            })
          }
        >
          <option value="all_equipped">All equipped skills</option>
          <option value="selected_skill">Selected skill id (set below)</option>
        </select>
        <input
          style={{ ...inputStyle, marginTop: '0.35rem' }}
          placeholder="skillId when scope = selected"
          value={typeof md.skillId === 'string' ? md.skillId : ''}
          onChange={(e) => onPatch({ metadata: { ...md, skillId: e.target.value } })}
        />
      </div>
    );
  }
  if (field === 'metadata_delay') {
    return (
      <div key={field}>
        <label style={labelStyle}>Delay: lose next action</label>
        <select
          style={inputStyle}
          value={md.loseNextAction === false ? 'no' : 'yes'}
          onChange={(e) => onPatch({ metadata: { ...md, loseNextAction: e.target.value === 'yes' } })}
        >
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </div>
    );
  }
  return null;
}

function renderField(
  p: SkillEffectPayload,
  field: SkillEffectFormField,
  onPatch: (patch: Partial<SkillEffectPayload>) => void
): React.ReactNode {
  if (field.startsWith('metadata_')) {
    return renderMetadataField(p, field, onPatch);
  }
  switch (field) {
    case 'value':
      return (
        <div key={field}>
          <label style={labelStyle}>Value</label>
          <input
            type="number"
            style={inputStyle}
            value={p.value ?? ''}
            onChange={(e) => onPatch({ value: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </div>
      );
    case 'secondaryValue':
      return (
        <div key={field}>
          <label style={labelStyle}>Secondary value</label>
          <input
            type="number"
            style={inputStyle}
            value={p.secondaryValue ?? ''}
            onChange={(e) =>
              onPatch({ secondaryValue: e.target.value === '' ? undefined : Number(e.target.value) })
            }
          />
        </div>
      );
    case 'duration':
      return (
        <div key={field}>
          <label style={labelStyle}>Duration (turns, empty = none)</label>
          <input
            type="number"
            style={inputStyle}
            value={p.duration === null || p.duration === undefined ? '' : p.duration}
            onChange={(e) =>
              onPatch({
                duration: e.target.value === '' ? null : Math.max(0, Math.floor(Number(e.target.value))),
              })
            }
          />
        </div>
      );
    case 'chance':
      return (
        <div key={field}>
          <label style={labelStyle}>Chance %</label>
          <input
            type="number"
            style={inputStyle}
            value={p.chance ?? ''}
            onChange={(e) => onPatch({ chance: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </div>
      );
    case 'targetScope':
      return (
        <div key={field}>
          <label style={labelStyle}>Target scope</label>
          <select
            style={inputStyle}
            value={p.targetScope ?? 'single'}
            onChange={(e) => onPatch({ targetScope: e.target.value as SkillEffectPayload['targetScope'] })}
          >
            <option value="self">self</option>
            <option value="single">single</option>
            <option value="ally">ally</option>
            <option value="enemy">enemy</option>
            <option value="all_enemies">all_enemies</option>
            <option value="all_allies">all_allies</option>
          </select>
        </div>
      );
    case 'stackable':
      return (
        <div key={field} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <input
            type="checkbox"
            checked={Boolean(p.stackable)}
            onChange={(e) => onPatch({ stackable: e.target.checked })}
          />
          <span style={{ fontSize: '0.8rem' }}>Stackable</span>
        </div>
      );
    case 'maxStacks':
      return (
        <div key={field}>
          <label style={labelStyle}>Max stacks</label>
          <input
            type="number"
            style={inputStyle}
            value={p.maxStacks ?? ''}
            onChange={(e) => onPatch({ maxStacks: e.target.value === '' ? undefined : Number(e.target.value) })}
          />
        </div>
      );
    case 'elementTag':
      return (
        <div key={field}>
          <label style={labelStyle}>Element tag</label>
          <input
            style={inputStyle}
            value={p.elementTag ?? ''}
            onChange={(e) => onPatch({ elementTag: e.target.value || null })}
          />
        </div>
      );
    default:
      return null;
  }
}

export const SkillEffectsConfigEditor: React.FC<SkillEffectsConfigEditorProps> = ({
  value,
  onChange,
  disabled,
}) => {
  const rows = useMemo(() => value ?? [], [value]);

  const patchRow = (index: number, patch: Partial<SkillEffectPayload>) => {
    const next = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(next);
  };

  const setType = (index: number, type: SkillEffectType) => {
    const next = rows.map((r, i) => (i === index ? defaultsFor(type) : r));
    onChange(next);
  };

  return (
    <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
      <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.5rem', color: '#111827' }}>
        MST skill effects (engine)
      </div>
      <p style={{ fontSize: '0.72rem', color: '#6b7280', margin: '0 0 0.5rem' }}>
        Optional payloads consumed by <code>resolveSkillAction</code>. Registry:{' '}
        <code>src/data/skillEffectRegistry.ts</code>.
      </p>
      {rows.map((p, index) => {
        const reg = SKILL_EFFECT_REGISTRY[p.type];
        return (
          <div
            key={index}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: '0.4rem',
              padding: '0.5rem',
              marginBottom: '0.5rem',
              background: 'white',
            }}
          >
            <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
              <select
                disabled={disabled}
                style={{ ...inputStyle, maxWidth: 200 }}
                value={p.type}
                onChange={(e) => setType(index, e.target.value as SkillEffectType)}
              >
                {SKILL_EFFECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SKILL_EFFECT_REGISTRY[t]?.label ?? t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              >
                Remove
              </button>
            </div>
            {reg?.description && (
              <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.35rem' }}>{reg.description}</div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
              {(reg?.formFields ?? []).map((f) => renderField(p, f, (patch) => patchRow(index, patch)))}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...rows, defaultsFor('heal')])}
        style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem', marginTop: '0.25rem' }}
      >
        + Add effect
      </button>
    </div>
  );
};
