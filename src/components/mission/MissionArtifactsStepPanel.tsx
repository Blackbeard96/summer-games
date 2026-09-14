import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MissionSequenceStep } from '../../types/missions';
import {
  grantMissionSkillsMasteryPp,
  markSkillsMasteryStepVisited,
} from '../../utils/missionSkillsMasteryGrant';
import { MissionRichText } from '../../utils/missionRichText';

interface Props {
  step: Extract<MissionSequenceStep, { type: 'ARTIFACTS' }>;
  userId: string;
  missionId: string;
  playerMissionId: string | null;
  stepAlreadyComplete: boolean;
  onRefreshCompletion: () => void;
}

const MissionArtifactsStepPanel: React.FC<Props> = ({
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

  const openArtifacts = async () => {
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
      console.error('Artifacts step grant/visit failed', e);
      grantError = e instanceof Error ? e.message : 'Could not apply PP grant.';
      try {
        await markSkillsMasteryStepVisited(pmId, step.id);
      } catch (visitErr) {
        console.warn('Artifacts mark visited failed', visitErr);
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

    navigate(`/artifacts?${q.toString()}`);

    if (grantError) {
      setStatusMsg(grantError);
    }
    setBusy(false);
  };

  return (
    <div>
      {step.title ? <h2 className="mst-mission-step-heading">{step.title}</h2> : null}

      {captions.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1.25rem' }}>
          {captions.map((text, i) => (
            <div key={`${i}-${text.slice(0, 24)}`} className="mst-mission-block mst-mission-block--info">
              <MissionRichText
                text={text}
                as="p"
                className="mst-mission-body-text"
                style={{ margin: 0 }}
                linkColor="#f0e6c8"
              />
            </div>
          ))}
        </div>
      ) : null}

      {grantPP > 0 ? (
        <div className="mst-mission-block mst-mission-block--success" style={{ fontWeight: 700 }}>
          This stop grants {grantPP.toLocaleString()} PP when you open Artifacts
          {stepAlreadyComplete ? ' (already claimed if you visited before).' : '.'}
        </div>
      ) : null}

      {stepAlreadyComplete ? (
        <p className="mst-mission-body-text" style={{ fontWeight: 600, marginBottom: '1rem', color: '#6ee7a8' }}>
          You already visited Artifacts for this step. You can open it again anytime.
        </p>
      ) : null}

      {statusMsg ? (
        <p className="mst-mission-body-text" style={{ fontWeight: 600, marginBottom: '0.75rem', color: '#93c5fd' }}>
          {statusMsg}
        </p>
      ) : null}

      <button
        type="button"
        className="mst-mission-btn mst-mission-btn--primary"
        onClick={() => void openArtifacts()}
        disabled={busy}
      >
        {busy ? 'Opening…' : 'Open Artifacts'}
      </button>

      {step.requireVisit !== false && !stepAlreadyComplete ? (
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem', color: 'var(--mst-gold-bright)' }}>
          Open Artifacts to equip gear, then return to continue the mission.
        </p>
      ) : null}
    </div>
  );
};

export default MissionArtifactsStepPanel;
