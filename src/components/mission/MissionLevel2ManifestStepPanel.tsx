import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MissionSequenceStep } from '../../types/missions';
import {
  getLevel2ManifestState,
  grantMissionAutoUnlock,
} from '../../services/level2ManifestService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import type { PlayerMission } from '../../types/missions';

interface Props {
  step: Extract<MissionSequenceStep, { type: 'LEVEL2_MANIFEST' }>;
  userId: string;
  missionId: string;
  playerMissionId: string | null;
  /** From player mission doc */
  stepAlreadyComplete: boolean;
  onRefreshCompletion: () => void;
}

const MissionLevel2ManifestStepPanel: React.FC<Props> = ({
  step,
  userId,
  missionId,
  playerMissionId,
  stepAlreadyComplete,
  onRefreshCompletion,
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [builderUnlocked, setBuilderUnlocked] = useState(false);
  const [hasSkill, setHasSkill] = useState(false);
  const [activeOk, setActiveOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const st = await getLevel2ManifestState(userId);
        if (!cancelled) {
          setBuilderUnlocked(st.builderUnlocked);
          const skills = st.skills?.length ? st.skills : [];
          setHasSkill(skills.length > 0);
          const active = st.activeSkillId && skills.some((s) => s.id === st.activeSkillId);
          setActiveOk(!!active);
        }
        if (step.autoUnlockBuilderOnEntry && !cancelled) {
          await grantMissionAutoUnlock(userId);
          const st2 = await getLevel2ManifestState(userId);
          if (!cancelled) setBuilderUnlocked(st2.builderUnlocked);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, step.autoUnlockBuilderOnEntry]);

  const openBuilder = () => {
    const q = new URLSearchParams({
      returnMission: missionId,
      stepId: step.id,
      ...(playerMissionId ? { playerMission: playerMissionId } : {}),
    });
    navigate(`/level2-manifest-builder?${q.toString()}`);
  };

  const canProceed =
    stepAlreadyComplete ||
    ((!step.requireMetaStateFirst || builderUnlocked) &&
      (!step.requireSkillCreation || hasSkill) &&
      (!step.requireSkillEquip || activeOk));

  const blockingMessage = (() => {
    if (step.requireMetaStateFirst && !builderUnlocked) {
      return 'Reach Flow State in a Live Event once to awaken Meta-level access (or complete Sonido’s guided unlock).';
    }
    if (step.requireSkillCreation && !hasSkill) {
      return 'Save your Level 2 Manifest skill in the builder to continue.';
    }
    if (step.requireSkillEquip && !activeOk) {
      return 'Equip your Level 2 skill for Live Events in the builder (it becomes active automatically when saved).';
    }
    return null;
  })();

  return (
    <div>
      {step.title ? <h2 style={{ marginBottom: '1rem' }}>{step.title}</h2> : null}
      {step.description ? (
        <p
          style={{
            fontSize: '1.05rem',
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            marginBottom: '1rem',
            color: '#374151',
          }}
        >
          {step.description}
        </p>
      ) : null}
      <div
        style={{
          padding: '1rem 1.25rem',
          borderRadius: '0.75rem',
          background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
          color: '#f8fafc',
          marginBottom: '1.25rem',
          border: '1px solid #475569',
        }}
      >
        <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', opacity: 0.85 }}>
          SONIDO
        </div>
        <p style={{ margin: '0.5rem 0 0', fontSize: '1rem', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          {step.sonidoDialogue ||
            'Listen for the signal beneath the noise. Your Manifest already speaks — Level Two is when it reaches another mind.'}
        </p>
      </div>

      {loading ? <p style={{ color: '#6b7280' }}>Checking your Meta progress…</p> : null}

      {!loading && stepAlreadyComplete ? (
        <p style={{ color: '#059669', fontWeight: 600 }}>This step is complete.</p>
      ) : null}

      {!loading && !stepAlreadyComplete ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            type="button"
            onClick={() => openBuilder()}
            style={{
              padding: '0.85rem 1.25rem',
              background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Open Level 2 Manifest Builder
          </button>
          <button
            type="button"
            onClick={() => onRefreshCompletion()}
            style={{
              padding: '0.5rem 1rem',
              background: '#e5e7eb',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
            }}
          >
            I saved my skill — refresh progress
          </button>
          {blockingMessage ? (
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#b45309' }}>{blockingMessage}</p>
          ) : null}
        </div>
      ) : null}

    </div>
  );
};

export function computeLevel2StepReady(
  step: Extract<MissionSequenceStep, { type: 'LEVEL2_MANIFEST' }>,
  args: {
    stepAlreadyComplete: boolean;
    builderUnlocked: boolean;
    hasSkill: boolean;
    activeOk: boolean;
  }
): boolean {
  if (args.stepAlreadyComplete) return true;
  return (
    (!step.requireMetaStateFirst || args.builderUnlocked) &&
    (!step.requireSkillCreation || args.hasSkill) &&
    (!step.requireSkillEquip || args.activeOk)
  );
}

export async function fetchPlayerMissionCompletion(
  playerMissionId: string | null
): Promise<Record<string, { completedAt?: unknown; skillId?: string }>> {
  if (!playerMissionId) return {};
  const snap = await getDoc(doc(db, 'playerMissions', playerMissionId));
  if (!snap.exists()) return {};
  const pm = snap.data() as PlayerMission;
  return pm.sequenceStepCompletion || {};
}

export default MissionLevel2ManifestStepPanel;
