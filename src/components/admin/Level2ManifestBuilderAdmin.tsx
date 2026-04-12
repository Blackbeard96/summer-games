import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  LEVEL2_IMPACT_AREA_LABELS,
  LEVEL2_IMPACT_LABELS,
  LEVEL2_MANIFEST_ALLOWLISTS,
  LEVEL2_MANIFEST_TYPE_LABELS,
  LEVEL2_RESULT_LABELS,
  LEVEL2_TARGET_LABELS,
  getAllowlistForManifest,
  level2ImpactsForManifestType,
  level2PpResultRange,
  level2TargetsUnlockedAtLevel,
  level2TurnResultForLevel,
} from '../../data/level2ManifestSkillConfig';
import type { Level2ManifestTypeCategory } from '../../types/level2Manifest';

const card: React.CSSProperties = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '0.75rem',
  padding: '1.25rem',
  marginBottom: '1.25rem',
};

const h2: React.CSSProperties = {
  fontSize: '1.35rem',
  fontWeight: 800,
  color: '#0f172a',
  margin: '0 0 0.5rem',
};

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
  fontSize: '0.8rem',
  background: '#e2e8f0',
  padding: '0.15rem 0.4rem',
  borderRadius: '0.25rem',
};

const Level2BandsTable: React.FC = () => {
  const rows = useMemo(() => {
    const samples = [1, 6, 11, 20, 22];
    return samples.map((lv) => {
      const maxT = level2TurnResultForLevel(lv);
      return {
        lv,
        targets: level2TargetsUnlockedAtLevel(lv).map((t) => LEVEL2_TARGET_LABELS[t]).join(', '),
        pp: level2PpResultRange(lv),
        turns: maxT === 1 ? '1' : `1–${maxT}`,
      };
    });
  }, []);
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
      <thead>
        <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
          <th style={{ padding: '0.5rem' }}>Sample level</th>
          <th style={{ padding: '0.5rem' }}>Targets unlocked</th>
          <th style={{ padding: '0.5rem' }}>PP result range</th>
          <th style={{ padding: '0.5rem' }}>Skills / cooldowns (turns)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.lv} style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: '0.5rem', fontWeight: 700 }}>{r.lv}</td>
            <td style={{ padding: '0.5rem' }}>{r.targets}</td>
            <td style={{ padding: '0.5rem' }}>
              {r.pp.min}–{r.pp.max}
            </td>
            <td style={{ padding: '0.5rem' }}>{r.turns}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const Level2ManifestBuilderAdmin: React.FC = () => {
  const manifestTypes: Level2ManifestTypeCategory[] = ['offensive', 'enhance', 'utility', 'defensive'];

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', color: '#334155' }}>
      <div style={card}>
        <h1 style={{ ...h2, fontSize: '1.6rem' }}>Level 2 Manifest builder</h1>
        <p style={{ margin: '0 0 1rem', lineHeight: 1.55, color: '#64748b' }}>
          Hub for tuning the Live Event–only Level 2 Manifest skill creator (player builder, PP/cooldown math, and
          per-manifest allowlists). Code changes ship with deploys; use this screen to see live rules and jump to
          tools.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <Link
            to="/level2-manifest-builder"
            style={{
              display: 'inline-block',
              padding: '0.65rem 1.25rem',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: 'white',
              borderRadius: '0.5rem',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Open player builder
          </Link>
          <span style={{ alignSelf: 'center', fontSize: '0.85rem', color: '#64748b' }}>
            (Player must meet unlock rules in the app.)
          </span>
        </div>
      </div>

      <div style={card}>
        <h2 style={h2}>Source files (edit & redeploy)</h2>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', lineHeight: 1.8 }}>
          <li>
            <span style={mono}>src/data/level2ManifestSkillConfig.ts</span> — labels, allowlists, level bands, impact
            lists, PP/cooldown baselines
          </li>
          <li>
            <span style={mono}>src/types/level2Manifest.ts</span> — persisted record types
          </li>
          <li>
            <span style={mono}>src/services/level2ManifestService.ts</span> — Firestore read/write, move projection
          </li>
          <li>
            <span style={mono}>src/pages/Level2ManifestBuilderPage.tsx</span> — player-facing UI
          </li>
          <li>
            <span style={mono}>src/utils/level2ManifestSkillCodec.ts</span> — card description text & name validation
          </li>
          <li>
            <span style={mono}>src/utils/level2ManifestModifiers.ts</span> — perk-based PP & cooldown notes
          </li>
        </ul>
      </div>

      <div style={card}>
        <h2 style={h2}>Level scaling (reference)</h2>
        <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: 0 }}>
          Targets: 1–5 single · 6–10 two · 11–19 four · 20+ all. PP bands use{' '}
          <span style={mono}>level2PpResultRange</span>. For skills/cooldowns, players pick any turn count from{' '}
          <strong>1</strong> up to the cap from <span style={mono}>level2TurnResultForLevel</span>.
        </p>
        <Level2BandsTable />
      </div>

      <div style={card}>
        <h2 style={h2}>Impact verbs by manifest type</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '0.5rem' }}>Type</th>
              <th style={{ padding: '0.5rem' }}>Impacts shown in builder</th>
            </tr>
          </thead>
          <tbody>
            {manifestTypes.map((mt) => (
              <tr key={mt} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '0.5rem', fontWeight: 700 }}>{LEVEL2_MANIFEST_TYPE_LABELS[mt]}</td>
                <td style={{ padding: '0.5rem' }}>
                  {level2ImpactsForManifestType(mt)
                    .map((id) => LEVEL2_IMPACT_LABELS[id])
                    .join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={card}>
        <h2 style={h2}>Impact areas & result labels</h2>
        <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: 0 }}>
          Builder uses PP ranges or fixed turns per level; legacy <span style={mono}>Level2ManifestResult</span> labels
          remain in types for older rows.
        </p>
        <p style={{ margin: '0.5rem 0' }}>
          <strong>Impact areas:</strong>{' '}
          {Object.entries(LEVEL2_IMPACT_AREA_LABELS)
            .map(([k, v]) => `${v} (${k})`)
            .join(' · ')}
        </p>
      </div>

      <div style={card}>
        <h2 style={h2}>Per-manifest allowlists</h2>
        <p style={{ fontSize: '0.9rem', color: '#64748b', marginTop: 0 }}>
          Allowed manifest <em>types</em> and legacy <em>result</em> enum values (PP magnitudes override in builder).
          Optional <span style={mono}>extraTargets</span> (e.g. object/space).
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '0.45rem' }}>Manifest id</th>
                <th style={{ padding: '0.45rem' }}>Types</th>
                <th style={{ padding: '0.45rem' }}>Results</th>
                <th style={{ padding: '0.45rem' }}>Extra targets</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(LEVEL2_MANIFEST_ALLOWLISTS)
                .sort()
                .map((id) => {
                  const a = getAllowlistForManifest(id);
                  return (
                    <tr key={id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '0.45rem', fontWeight: 700 }}>{id}</td>
                      <td style={{ padding: '0.45rem' }}>
                        {a.manifestTypes.map((t) => LEVEL2_MANIFEST_TYPE_LABELS[t]).join(', ')}
                      </td>
                      <td style={{ padding: '0.45rem' }}>
                        {a.results.map((r) => LEVEL2_RESULT_LABELS[r]).join(', ')}
                      </td>
                      <td style={{ padding: '0.45rem' }}>
                        {(a.extraTargets || []).map((t) => LEVEL2_TARGET_LABELS[t]).join(', ') || '—'}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ ...card, marginBottom: 0 }}>
        <h2 style={h2}>Related admin</h2>
        <p style={{ margin: 0, lineHeight: 1.6 }}>
          Mission flows that gate the builder use <strong>Mission Admin</strong> (sequence steps{' '}
          <span style={mono}>LEVEL2_MANIFEST</span>). Season 1 / Flow copy lives under{' '}
          <strong>Battle Pass</strong> where relevant.
        </p>
      </div>
    </div>
  );
};

export default Level2ManifestBuilderAdmin;
