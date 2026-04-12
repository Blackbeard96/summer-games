import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { DEFAULT_RR_CANDY_TREES } from '../../data/defaultRRCandyTrees';
import { getRRCandyConfig, saveRRCandyConfig, validateRRCandyConfig } from '../../services/rrCandyConfigService';
import { migrateExistingKonfigOwners } from '../../services/rrCandyPlayerStateService';
import type { RRCandyConfig, RRCandyDefinition, RRCandyNodeDefinition } from '../../types/rrCandyConfig';

function cloneConfig(c: RRCandyConfig): RRCandyConfig {
  return JSON.parse(JSON.stringify(c)) as RRCandyConfig;
}

function syncStarterIdsFromNodes(candy: RRCandyDefinition): RRCandyDefinition {
  const starterNodeIds = (candy.nodes || [])
    .filter((n) => n.starterNode)
    .map((n) => n.nodeId);
  return { ...candy, starterNodeIds };
}

const emptyNode = (): RRCandyNodeDefinition => ({
  nodeId: '',
  skillId: '',
  name: '',
  icon: '✨',
  summary: '',
  category: 'Utility',
  requiresNodeIds: [],
  isEnabled: true,
  starterNode: false,
  position: { col: 0, row: 0 },
});

/**
 * Admin — RR Candy trees (Firestore system_config/rr_candy_trees_v1).
 * Unlock detection stays in user chapter data (rrCandyUtils); this page edits global definitions only.
 */
const RRCandyAdminPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [config, setConfig] = useState<RRCandyConfig | null>(null);
  const [selectedId, setSelectedId] = useState<string>('konfig');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [migrateStatus, setMigrateStatus] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setStatus('');
    try {
      const c = await getRRCandyConfig();
      setConfig(cloneConfig(c));
    } catch (e) {
      setStatus(`Load error: ${String(e)}`);
      setConfig(cloneConfig(DEFAULT_RR_CANDY_TREES));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = config?.candies.find((c) => c.id === selectedId);

  const updateCandy = (patch: Partial<RRCandyDefinition>) => {
    if (!config) return;
    setConfig({
      ...config,
      candies: config.candies.map((c) => (c.id === selectedId ? { ...c, ...patch } : c)),
    });
  };

  const updateNode = (index: number, patch: Partial<RRCandyNodeDefinition>) => {
    if (!selected) return;
    const nodes = [...selected.nodes];
    nodes[index] = { ...nodes[index], ...patch };
    updateCandy({ nodes });
  };

  const addNode = () => {
    if (!selected) return;
    updateCandy({ nodes: [...selected.nodes, emptyNode()] });
  };

  const removeNode = (index: number) => {
    if (!selected) return;
    updateCandy({ nodes: selected.nodes.filter((_, i) => i !== index) });
  };

  const save = async () => {
    if (!config) return;
    const synced: RRCandyConfig = {
      ...config,
      candies: config.candies.map((c) => syncStarterIdsFromNodes(c)),
    };
    const v = validateRRCandyConfig(synced);
    if (!v.ok) {
      setStatus(v.error);
      return;
    }
    setStatus('Saving…');
    try {
      await saveRRCandyConfig(synced);
      setConfig(cloneConfig(synced));
      setStatus('Saved.');
    } catch (e) {
      setStatus(`Save error: ${String(e)}`);
    }
  };

  const runSelfMigration = async () => {
    if (!currentUser?.uid) {
      setMigrateStatus('Not signed in.');
      return;
    }
    setMigrateStatus('Running…');
    try {
      await migrateExistingKonfigOwners(currentUser.uid);
      setMigrateStatus('Konfig starter migration applied for your account (if eligible).');
    } catch (e) {
      setMigrateStatus(`Error: ${String(e)}`);
    }
  };

  if (loading || !config) {
    return <div style={{ padding: 24 }}>Loading RR Candy config…</div>;
  }

  return (
    <div
      style={{
        background: '#f8fafc',
        borderRadius: 12,
        padding: '1.5rem',
        border: '1px solid #e5e7eb',
        maxWidth: 1200,
      }}
    >
      <h2 style={{ marginTop: 0 }}>RR Candy trees</h2>
      <p style={{ color: '#64748b', lineHeight: 1.5, maxWidth: 720 }}>
        Global definitions in <code>system_config/rr_candy_trees_v1</code>. Player learned nodes live in{' '}
        <code>players/&#123;uid&#125;/skill_state/main</code> (<code>rrCandySkillState</code>). Konfig starters
        for existing owners: migration flag <code>migrations.rrCandyStarterNodesV1</code> (see{' '}
        <code>migrateExistingKonfigOwners</code> — also runs when players load RR Candy skills).
      </p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
        <div style={{ minWidth: 200 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>Candies</h3>
          {config.candies.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                marginBottom: 8,
                padding: '10px 12px',
                borderRadius: 8,
                border: selectedId === c.id ? '2px solid #0891b2' : '1px solid #cbd5e1',
                background: selectedId === c.id ? '#ecfeff' : '#fff',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 700 }}>{c.title}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {c.isActive ? 'Active' : 'Inactive'} · {c.nodes.length} nodes · starters:{' '}
                {c.starterNodeIds.length}
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <div style={{ flex: 1, minWidth: 280 }}>
            <h3 style={{ fontSize: 16, marginTop: 0 }}>{selected.title}</h3>
            <label style={{ display: 'block', marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>Title</span>
              <input
                value={selected.title}
                onChange={(e) => updateCandy({ title: e.target.value })}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>Subtitle</span>
              <input
                value={selected.subtitle}
                onChange={(e) => updateCandy({ subtitle: e.target.value })}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>Description</span>
              <textarea
                value={selected.description}
                onChange={(e) => updateCandy({ description: e.target.value })}
                rows={3}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
              />
            </label>
            <label style={{ display: 'block', marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>Theme color</span>
              <input
                value={selected.themeColor}
                onChange={(e) => updateCandy({ themeColor: e.target.value })}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid #cbd5e1' }}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={selected.isActive}
                onChange={(e) => updateCandy({ isActive: e.target.checked })}
              />
              <span>Active (visible to clients)</span>
            </label>

            <h4 style={{ margin: '16px 0 8px' }}>Nodes</h4>
            <button
              type="button"
              onClick={addNode}
              style={{
                marginBottom: 12,
                padding: '6px 12px',
                borderRadius: 8,
                border: '1px solid #94a3b8',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              Add node
            </button>

            {selected.nodes.map((node, idx) => (
              <div
                key={`${node.nodeId}-${idx}`}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 12,
                  background: '#fff',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>Node {idx + 1}</strong>
                  <button type="button" onClick={() => removeNode(idx)} style={{ color: '#b91c1c' }}>
                    Remove
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  <label>
                    nodeId
                    <input
                      value={node.nodeId}
                      onChange={(e) => updateNode(idx, { nodeId: e.target.value })}
                      style={{ width: '100%', padding: 6, marginTop: 4 }}
                    />
                  </label>
                  <label>
                    skillId
                    <input
                      value={node.skillId}
                      onChange={(e) => updateNode(idx, { skillId: e.target.value })}
                      style={{ width: '100%', padding: 6, marginTop: 4 }}
                    />
                  </label>
                  <label>
                    name
                    <input
                      value={node.name}
                      onChange={(e) => updateNode(idx, { name: e.target.value })}
                      style={{ width: '100%', padding: 6, marginTop: 4 }}
                    />
                  </label>
                  <label>
                    icon
                    <input
                      value={node.icon}
                      onChange={(e) => updateNode(idx, { icon: e.target.value })}
                      style={{ width: '100%', padding: 6, marginTop: 4 }}
                    />
                  </label>
                </div>
                <label style={{ display: 'block', marginTop: 8 }}>
                  summary
                  <input
                    value={node.summary}
                    onChange={(e) => updateNode(idx, { summary: e.target.value })}
                    style={{ width: '100%', padding: 6, marginTop: 4 }}
                  />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                  <label>
                    category
                    <input
                      value={node.category}
                      onChange={(e) => updateNode(idx, { category: e.target.value })}
                      style={{ width: '100%', padding: 6, marginTop: 4 }}
                    />
                  </label>
                  <label>
                    effectKey
                    <input
                      value={node.effectKey || ''}
                      onChange={(e) => updateNode(idx, { effectKey: e.target.value || undefined })}
                      style={{ width: '100%', padding: 6, marginTop: 4 }}
                      placeholder="AUTO_DODGE_NEXT_DAMAGE"
                    />
                  </label>
                </div>
                <label style={{ display: 'block', marginTop: 8 }}>
                  requiresNodeIds (comma-separated)
                  <input
                    value={node.requiresNodeIds.join(', ')}
                    onChange={(e) =>
                      updateNode(idx, {
                        requiresNodeIds: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    style={{ width: '100%', padding: 6, marginTop: 4 }}
                  />
                </label>
                <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={node.isEnabled}
                      onChange={(e) => updateNode(idx, { isEnabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={!!node.starterNode}
                      onChange={(e) => updateNode(idx, { starterNode: e.target.checked })}
                    />
                    Starter node
                  </label>
                  <label>
                    col
                    <input
                      type="number"
                      value={node.position.col}
                      onChange={(e) =>
                        updateNode(idx, { position: { ...node.position, col: Number(e.target.value) || 0 } })
                      }
                      style={{ width: 56, marginLeft: 6 }}
                    />
                  </label>
                  <label>
                    row
                    <input
                      type="number"
                      value={node.position.row}
                      onChange={(e) =>
                        updateNode(idx, { position: { ...node.position, row: Number(e.target.value) || 0 } })
                      }
                      style={{ width: 56, marginLeft: 6 }}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <button
          type="button"
          onClick={save}
          style={{
            background: '#0891b2',
            color: '#fff',
            border: 'none',
            padding: '0.65rem 1.25rem',
            borderRadius: 8,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Save / publish
        </button>
        <button type="button" onClick={load} style={{ padding: '0.65rem 1.25rem', borderRadius: 8 }}>
          Reload
        </button>
        <button type="button" onClick={runSelfMigration} style={{ padding: '0.65rem 1.25rem', borderRadius: 8 }}>
          Run Konfig starter migration (my account)
        </button>
      </div>
      {status && <p style={{ marginTop: 12 }}>{status}</p>}
      {migrateStatus && <p style={{ marginTop: 8, color: '#0369a1' }}>{migrateStatus}</p>}
    </div>
  );
};

export default RRCandyAdminPage;
