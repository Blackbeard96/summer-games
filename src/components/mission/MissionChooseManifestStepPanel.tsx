import React, { useEffect, useState } from 'react';
import type { MissionSequenceStep } from '../../types/missions';
import { MANIFESTS, type PlayerManifest } from '../../types/manifest';
import ManifestSelection from '../ManifestSelection';
import { markMissionSequenceStepComplete } from '../../utils/missionsService';
import {
  loadPlayerManifest,
  savePlayerManifestSelection,
} from '../../utils/playerManifestSelection';

interface Props {
  step: Extract<MissionSequenceStep, { type: 'CHOOSE_MANIFEST' }>;
  userId: string;
  playerMissionId: string | null;
  stepAlreadyComplete: boolean;
  onRefreshCompletion: () => void;
}

const MissionChooseManifestStepPanel: React.FC<Props> = ({
  step,
  userId,
  playerMissionId,
  stepAlreadyComplete,
  onRefreshCompletion,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [playerManifest, setPlayerManifest] = useState<PlayerManifest | null>(null);

  const requireSelection = step.requireSelection !== false;
  const allowReselect = step.allowReselect !== false;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const m = await loadPlayerManifest(userId);
        if (!cancelled) setPlayerManifest(m);
      } catch (e) {
        console.error('MissionChooseManifestStepPanel load', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const selectedMeta = playerManifest
    ? MANIFESTS.find((m) => m.id === playerManifest.manifestId)
    : null;

  const handleManifestSelect = async (manifestId: string) => {
    setSaving(true);
    try {
      const saved = await savePlayerManifestSelection(userId, manifestId, playerManifest);
      setPlayerManifest(saved);
      setShowPicker(false);
      if (playerMissionId) {
        await markMissionSequenceStepComplete(playerMissionId, step.id, { manifestId });
      }
      onRefreshCompletion();
    } catch (e) {
      if (e instanceof Error && e.message === 'Manifest change cancelled') {
        return;
      }
      console.error('Mission choose manifest failed', e);
      alert('Failed to save your manifest. Please try again.');
    } finally {
      setSaving(false);
    }
  };

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
          {selectedMeta && (
            <div
              style={{
                marginBottom: '1.25rem',
                padding: '1rem 1.15rem',
                borderRadius: '0.75rem',
                border: `2px solid ${selectedMeta.color}`,
                background: `linear-gradient(135deg, ${selectedMeta.color}18 0%, #fff 100%)`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '2.5rem' }}>{selectedMeta.icon}</span>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', letterSpacing: '0.04em' }}>
                    YOUR MANIFEST
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '1.25rem', color: selectedMeta.color }}>
                    {selectedMeta.name}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: '#4b5563', marginTop: '0.25rem' }}>
                    {selectedMeta.description}
                  </div>
                </div>
              </div>
            </div>
          )}

          {stepAlreadyComplete && (
            <p style={{ margin: '0 0 1rem', color: '#166534', fontWeight: 600 }}>
              Manifest choice recorded for this mission step.
            </p>
          )}

          {(!stepAlreadyComplete || allowReselect) && (
            <button
              type="button"
              onClick={() => setShowPicker(true)}
              disabled={saving}
              style={{
                padding: '0.85rem 1.5rem',
                background: saving
                  ? '#9ca3af'
                  : 'linear-gradient(135deg, #d97706 0%, #7c3aed 55%, #059669 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.5rem',
                cursor: saving ? 'not-allowed' : 'pointer',
                fontWeight: 800,
                fontSize: '1rem',
              }}
            >
              {saving
                ? 'Saving…'
                : stepAlreadyComplete
                  ? 'Choose again'
                  : selectedMeta
                    ? 'Open Choose Manifest'
                    : 'Choose Your Manifest'}
            </button>
          )}

          {requireSelection && !stepAlreadyComplete && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem', color: '#92400e' }}>
              Confirm a manifest above to continue.
            </p>
          )}
        </>
      )}

      {showPicker && (
        <ManifestSelection
          onManifestSelect={(id) => void handleManifestSelect(id)}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
};

export default MissionChooseManifestStepPanel;
