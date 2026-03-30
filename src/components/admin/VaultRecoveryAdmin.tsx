import React, { useState } from 'react';
import { db } from '../../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { findPlayerByName } from '../../utils/fixPlayerManifestAndSkills';

/**
 * Fields that may be written to vaults/{userId} during manual recovery.
 * Only these keys are merged from JSON (plus id/ownerId are never overwritten from client).
 */
const VAULT_RECOVERY_KEYS = [
  'capacity',
  'capacityLevel',
  'shieldLevel',
  'currentPP',
  'vaultHealth',
  'maxVaultHealth',
  'shieldStrength',
  'maxShieldStrength',
  'overshield',
  'generatorLevel',
  'generatorPendingPP',
  'movesRemaining',
  'maxMovesPerDay',
  'debtStatus',
  'debtAmount',
  'vaultSiegeFreezeSkipsRemaining',
] as const;

type RecoveryEntry = {
  userId?: string;
  displayName?: string;
  syncStudentPP?: boolean;
} & Partial<Record<(typeof VAULT_RECOVERY_KEYS)[number], number | boolean>>;

function buildVaultPatch(entry: RecoveryEntry): Record<string, number | boolean> {
  const patch: Record<string, number | boolean> = {};
  for (const k of VAULT_RECOVERY_KEYS) {
    const v = entry[k];
    if (v !== undefined && v !== null) patch[k] = v;
  }
  const cap = patch.capacity;
  if (typeof cap === 'number' && patch.maxVaultHealth === undefined) {
    patch.maxVaultHealth = Math.floor(cap * 0.1);
  }
  return patch;
}

async function resolveUserId(entry: RecoveryEntry): Promise<string | null> {
  if (entry.userId && typeof entry.userId === 'string' && entry.userId.trim()) {
    return entry.userId.trim();
  }
  if (entry.displayName && typeof entry.displayName === 'string' && entry.displayName.trim()) {
    return findPlayerByName(entry.displayName.trim());
  }
  return null;
}

const EXAMPLE_JSON = `[
  {
    "displayName": "Main Character M",
    "capacity": 10000,
    "capacityLevel": 12,
    "maxShieldStrength": 22000,
    "shieldLevel": 12,
    "shieldStrength": 22000,
    "currentPP": 10000,
    "vaultHealth": 1000,
    "maxVaultHealth": 1000,
    "syncStudentPP": true
  }
]`;

const VaultRecoveryAdmin: React.FC = () => {
  const [jsonText, setJsonText] = useState(EXAMPLE_JSON);
  const [lookupName, setLookupName] = useState('');
  const [lookupUid, setLookupUid] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const runLookup = async () => {
    if (!lookupName.trim()) {
      alert('Enter a display name');
      return;
    }
    setLookupLoading(true);
    setLookupUid(null);
    try {
      const uid = await findPlayerByName(lookupName.trim());
      setLookupUid(uid);
      if (!uid) setLog((l) => [...l, `No UID found for "${lookupName.trim()}".`]);
      else setLog((l) => [...l, `UID for "${lookupName.trim()}": ${uid}`]);
    } finally {
      setLookupLoading(false);
    }
  };

  const applyRecovery = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      alert('Invalid JSON. Fix syntax and try again.');
      return;
    }
    const rows: RecoveryEntry[] = Array.isArray(parsed) ? parsed : [parsed as RecoveryEntry];
    if (rows.length === 0) {
      alert('JSON array is empty.');
      return;
    }

    setApplying(true);
    const lines: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const entry = rows[i];
      const uid = await resolveUserId(entry);
      if (!uid) {
        lines.push(`Row ${i + 1}: missing userId / displayName not found — skipped.`);
        continue;
      }
      const patch = buildVaultPatch(entry);
      if (Object.keys(patch).length === 0) {
        lines.push(`Row ${i + 1} (${uid}): no vault fields to update — skipped.`);
        continue;
      }

      try {
        const vaultRef = doc(db, 'vaults', uid);
        const snap = await getDoc(vaultRef);
        if (!snap.exists()) {
          lines.push(`Row ${i + 1} (${uid}): vault document does not exist — skipped (create vault in app first or use setDoc elsewhere).`);
          continue;
        }
        await updateDoc(vaultRef, patch);
        lines.push(`Row ${i + 1} (${uid}): vault updated.`);

        if (entry.syncStudentPP && typeof patch.currentPP === 'number') {
          const studentRef = doc(db, 'students', uid);
          const st = await getDoc(studentRef);
          if (st.exists()) {
            await updateDoc(studentRef, { powerPoints: patch.currentPP });
            lines.push(`  → students/${uid} powerPoints set to ${patch.currentPP}.`);
          } else {
            lines.push(`  → no students/${uid} doc; PP not synced.`);
          }
        }
      } catch (err: any) {
        lines.push(`Row ${i + 1} (${uid}): error — ${err?.message || String(err)}`);
      }
    }

    setLog((prev) => [...prev, `--- ${new Date().toISOString()} ---`, ...lines]);
    setApplying(false);
  };

  return (
    <div
      style={{
        background: '#f8fafc',
        borderRadius: '0.75rem',
        padding: '2rem',
        color: '#374151',
        border: '1px solid #e5e7eb',
        marginBottom: '2rem',
        maxWidth: '960px',
      }}
    >
      <h2 style={{ fontSize: '1.75rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#0f766e' }}>
        Vault recovery (manual restore)
      </h2>
      <p style={{ fontSize: '1rem', color: '#6b7280', marginBottom: '1.25rem', lineHeight: 1.55 }}>
        The app cannot recover lost Firestore values by itself. Use a{' '}
        <strong>Firestore export, backup, or point-in-time recovery</strong> in Google Cloud to retrieve old
        numbers, then paste them here as JSON. Each row needs <code>userId</code> or <code>displayName</code>{' '}
        plus the vault fields to write. Optional <code>syncStudentPP: true</code> sets{' '}
        <code>students/&lt;uid&gt;.powerPoints</code> to match <code>currentPP</code>.
      </p>

      <div style={{ marginBottom: '1.25rem' }}>
        <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.35rem' }}>
          Find UID by display name
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            value={lookupName}
            onChange={(e) => setLookupName(e.target.value)}
            placeholder='e.g. Main Character M'
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              minWidth: '260px',
            }}
          />
          <button
            type="button"
            onClick={runLookup}
            disabled={lookupLoading}
            style={{
              padding: '0.5rem 1rem',
              background: lookupLoading ? '#9ca3af' : '#0d9488',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: lookupLoading ? 'wait' : 'pointer',
              fontWeight: 600,
            }}
          >
            {lookupLoading ? 'Searching…' : 'Look up UID'}
          </button>
        </div>
        {lookupUid && (
          <p style={{ marginTop: '0.5rem', fontFamily: 'monospace', fontSize: '0.9rem' }}>{lookupUid}</p>
        )}
      </div>

      <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.35rem' }}>
        JSON (array of objects)
      </label>
      <textarea
        value={jsonText}
        onChange={(e) => setJsonText(e.target.value)}
        spellCheck={false}
        style={{
          width: '100%',
          minHeight: '220px',
          fontFamily: 'monospace',
          fontSize: '0.85rem',
          padding: '0.75rem',
          border: '1px solid #d1d5db',
          borderRadius: '0.5rem',
          boxSizing: 'border-box',
        }}
      />

      <button
        type="button"
        onClick={applyRecovery}
        disabled={applying}
        style={{
          marginTop: '1rem',
          padding: '0.75rem 1.5rem',
          background: applying ? '#9ca3af' : '#059669',
          color: 'white',
          border: 'none',
          borderRadius: '0.5rem',
          cursor: applying ? 'wait' : 'pointer',
          fontWeight: 'bold',
        }}
      >
        {applying ? 'Applying…' : 'Apply to Firestore'}
      </button>

      {log.length > 0 && (
        <pre
          style={{
            marginTop: '1.25rem',
            padding: '1rem',
            background: '#1e293b',
            color: '#e2e8f0',
            borderRadius: '0.5rem',
            fontSize: '0.8rem',
            overflow: 'auto',
            maxHeight: '320px',
          }}
        >
          {log.join('\n')}
        </pre>
      )}
    </div>
  );
};

export default VaultRecoveryAdmin;
