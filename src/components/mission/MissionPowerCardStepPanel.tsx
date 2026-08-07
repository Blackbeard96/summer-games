import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MissionSequenceStep } from '../../types/missions';
import {
  grantMissionSkillsMasteryPp,
  markSkillsMasteryStepVisited,
} from '../../utils/missionSkillsMasteryGrant';

interface Props {
  step: Extract<MissionSequenceStep, { type: 'POWER_CARD' }>;
  userId: string;
  missionId: string;
  playerMissionId: string | null;
  stepAlreadyComplete: boolean;
  onRefreshCompletion: () => void;
}

const MissionPowerCardStepPanel: React.FC<Props> = ({
  step,
  userId,
  missionId,
  playerMissionId,
  stepAlreadyComplete,
  onRefreshCompletion,
}) => {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const grantPP = Math.max(0, Math.floor(Number(step.grantPP) || 0));
  const captions = Array.isArray(step.captions)
    ? step.captions.map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean)
    : [];

  const openPowerCard = async () => {
    setBusy(true);
    setStatusMsg(null);
    const pmId = playerMissionId;
    if (!pmId) {
      setStatusMsg('Mission progress is not ready yet. Refresh the page, then try again.');
      setBusy(false);
      return;
    }

    let granted = 0;
    let alreadyClaimed = false;
    let grantError: string | null = null;

    try {
      if (grantPP > 0) {
        const r = await grantMissionSkillsMasteryPp({
          userId,
          playerMissionId: pmId,
          stepId: step.id,
          amount: grantPP,
        });
        granted = r.granted;
        alreadyClaimed = r.alreadyClaimed;
      } else {
        await markSkillsMasteryStepVisited(pmId, step.id);
      }
    } catch (e) {
      console.error('Power Card step grant/visit failed', e);
      grantError = e instanceof Error ? e.message : 'Could not apply PP grant.';
      try {
        await markSkillsMasteryStepVisited(pmId, step.id);
      } catch (visitErr) {
        console.warn('Power Card mark visited failed', visitErr);
      }
    }

    try {
      onRefreshCompletion();
    } catch {
      /* ignore */
    }

    const q = new URLSearchParams({
      returnMission: missionId,
      stepId: step.id,
      playerMission: pmId,
      ...(granted > 0 || (alreadyClaimed && grantPP > 0) || grantPP > 0
        ? { missionPp: String(grantPP) }
        : {}),
    });

    navigate(`/profile?${q.toString()}`);

    if (grantError) {
      setStatusMsg(grantError);
    }
    setBusy(false);
  };

  return (
    <div>
      {step.title ? <h2 style={{ marginBottom: '1rem' }}>{step.title}</h2> : null}

      {captions.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.25rem' }}>
          {captions.map((text, i) => (
            <p
              key={`${i}-${text.slice(0, 24)}`}
              style={{
                margin: 0,
                fontSize: '1.05rem',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                color: '#374151',
                padding: '0.85rem 1rem',
                background: i % 2 === 0 ? '#eff6ff' : '#f8fafc',
                border: '1px solid #93c5fd',
                borderRadius: '0.65rem',
              }}
            >
              {text}
            </p>
          ))}
        </div>
      ) : null}

      {grantPP > 0 ? (
        <div
          style={{
            marginBottom: '1.25rem',
            padding: '0.85rem 1rem',
            borderRadius: '0.65rem',
            background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
            border: '1px solid #6ee7b7',
            color: '#065f46',
            fontWeight: 700,
          }}
        >
          This stop grants {grantPP.toLocaleString()} PP when you open your Power Card
          {stepAlreadyComplete ? ' (already claimed if you visited before).' : '.'}
        </div>
      ) : null}

      {stepAlreadyComplete ? (
        <p style={{ color: '#059669', fontWeight: 600, marginBottom: '1rem' }}>
          You already visited your Power Card for this step. You can open it again anytime.
        </p>
      ) : null}

      {statusMsg ? (
        <p style={{ color: '#1e40af', fontWeight: 600, marginBottom: '0.75rem' }}>{statusMsg}</p>
      ) : null}

      <button
        type="button"
        onClick={() => void openPowerCard()}
        disabled={busy}
        style={{
          padding: '0.9rem 1.4rem',
          background: busy
            ? '#9ca3af'
            : 'linear-gradient(135deg, #1d4ed8 0%, #4f46e5 55%, #7c3aed 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '0.5rem',
          fontWeight: 800,
          fontSize: '1rem',
          cursor: busy ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? 'Opening…' : 'Open Power Card'}
      </button>

      {step.requireVisit !== false && !stepAlreadyComplete ? (
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem', color: '#92400e' }}>
          Open your Power Card (Profile), then return to continue the mission.
        </p>
      ) : null}
    </div>
  );
};

export default MissionPowerCardStepPanel;
