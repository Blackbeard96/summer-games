import React, { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_POPUP_CONTROLS,
  POPUP_CONTROL_META,
  type PopupControlKey,
  type PopupControls,
} from '../../types/popupControls';
import { getPopupControls, savePopupControls } from '../../utils/popupControlsService';

const GROUPS = ['Login queue', 'Home intros', 'Global notifiers'] as const;

const PopupControlsAdmin: React.FC = () => {
  const [controls, setControls] = useState<PopupControls>({ ...DEFAULT_POPUP_CONTROLS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setStatus('');
    try {
      const next = await getPopupControls();
      setControls(next);
    } catch (e) {
      setStatus(`Load failed: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setToggle = (key: PopupControlKey, value: boolean) => {
    setControls((prev) => ({ ...prev, [key]: value }));
  };

  const setAll = (value: boolean) => {
    const next = { ...DEFAULT_POPUP_CONTROLS };
    (Object.keys(next) as PopupControlKey[]).forEach((k) => {
      next[k] = value;
    });
    setControls(next);
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus('Saving…');
    try {
      await savePopupControls(controls);
      setStatus('Saved. Players pick up changes within a few seconds (live listener).');
    } catch (e) {
      setStatus(`Save failed: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: 24, color: '#0f172a' }}>Loading popup controls…</div>;
  }

  return (
    <div
      className="mst-light-surface"
      style={{
        background: '#f8fafc',
        color: '#0f172a',
        borderRadius: 12,
        padding: '1.5rem',
        border: '1px solid #e2e8f0',
        maxWidth: 860,
      }}
    >
      <h2 style={{ margin: '0 0 0.5rem', color: '#0f172a' }}>Login &amp; Game Popups</h2>
      <p style={{ margin: '0 0 1rem', color: '#334155', lineHeight: 1.55, fontSize: '0.95rem' }}>
        Toggle which automatic popups appear for players. Turning a popup <strong>off</strong> stops it from
        auto-showing on login / Home. Manual opens (Help tutorials, Battle Pass replay button) still work unless
        noted. Stored in <code>adminSettings/popupControls</code>.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setAll(true)}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: 8,
            border: '1px solid #059669',
            background: '#ecfdf5',
            color: '#047857',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Enable all
        </button>
        <button
          type="button"
          onClick={() => setAll(false)}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: 8,
            border: '1px solid #fca5a5',
            background: '#fef2f2',
            color: '#b91c1c',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Disable all
        </button>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: 8,
            border: '1px solid #94a3b8',
            background: '#fff',
            color: '#0f172a',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          style={{
            padding: '0.45rem 1rem',
            borderRadius: 8,
            border: 'none',
            background: '#2563eb',
            color: '#fff',
            fontWeight: 700,
            cursor: saving ? 'wait' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save popup settings'}
        </button>
      </div>

      {GROUPS.map((group) => {
        const rows = POPUP_CONTROL_META.filter((m) => m.group === group);
        return (
          <section key={group} style={{ marginBottom: 22 }}>
            <h3
              style={{
                margin: '0 0 10px',
                fontSize: '0.8rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#4338ca',
              }}
            >
              {group}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map((meta) => {
                const on = controls[meta.key];
                return (
                  <label
                    key={meta.key}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'flex-start',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: `1px solid ${on ? '#a7f3d0' : '#e2e8f0'}`,
                      background: on ? '#f0fdf4' : '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setToggle(meta.key, e.target.checked)}
                      style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 700, color: '#0f172a' }}>
                        {meta.label}{' '}
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            color: on ? '#047857' : '#64748b',
                            marginLeft: 6,
                          }}
                        >
                          {on ? 'ON' : 'OFF'}
                        </span>
                      </span>
                      <span style={{ display: 'block', fontSize: '0.85rem', color: '#334155', marginTop: 4, lineHeight: 1.45 }}>
                        {meta.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}

      {status ? (
        <p
          style={{
            marginTop: 8,
            fontWeight: 600,
            color: status.includes('fail') ? '#b91c1c' : '#047857',
          }}
        >
          {status}
        </p>
      ) : null}
    </div>
  );
};

export default PopupControlsAdmin;
