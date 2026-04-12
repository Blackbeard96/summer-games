import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { getPlayerSkillState } from '../utils/skillStateService';
import { getLevelFromXP } from '../utils/leveling';
import {
  getAllowlistForManifest,
  LEVEL2_ALL_IMPACT_AREAS,
  LEVEL2_ALL_TARGETS,
  LEVEL2_ALL_TYPES,
  LEVEL2_IMPACT_AREA_LABELS,
  LEVEL2_IMPACT_LABELS,
  LEVEL2_MANIFEST_TYPE_LABELS,
  LEVEL2_TARGET_LABELS,
  basePpAndCooldownLevel2,
  level2ImpactsForManifestType,
  level2PpResultRange,
  level2ResultMagnitudeOptions,
  level2TargetsUnlockedAtLevel,
  level2TurnResultForLevel,
} from '../data/level2ManifestSkillConfig';
import type {
  Level2ManifestImpact,
  Level2ManifestImpactArea,
  Level2ManifestTarget,
  Level2ManifestTypeCategory,
} from '../types/level2Manifest';
import { applyLevel2PerkModifiers } from '../utils/level2ManifestModifiers';
import { buildLevel2SkillDescription, validateLevel2SkillName } from '../utils/level2ManifestSkillCodec';
import { getLevel2ManifestState, saveLevel2ManifestSkill } from '../services/level2ManifestService';
import { markMissionSequenceStepComplete } from '../utils/missionsService';

const Level2ManifestBuilderPage: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnMission = params.get('returnMission') || '';
  const playerMission = params.get('playerMission') || '';
  const stepId = params.get('stepId') || '';

  const [manifestId, setManifestId] = useState<string>('reading');
  const [playerLevel, setPlayerLevel] = useState(1);
  const [skillName, setSkillName] = useState('');
  const [manifestType, setManifestType] = useState<Level2ManifestTypeCategory>('utility');
  const [target, setTarget] = useState<Level2ManifestTarget>('single_ally_or_enemy');
  const [impact, setImpact] = useState<Level2ManifestImpact>('heal');
  const [impactArea, setImpactArea] = useState<Level2ManifestImpactArea>('pp');
  const [resultMagnitude, setResultMagnitude] = useState(5);
  const [unlockedNodes, setUnlockedNodes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    (async () => {
      const [stDoc, skillState] = await Promise.all([
        getDoc(doc(db, 'students', currentUser.uid)),
        getPlayerSkillState(currentUser.uid),
      ]);
      if (cancelled) return;
      const data = stDoc.exists() ? stDoc.data() : {};
      const mid =
        (data.manifest as { manifestId?: string } | undefined)?.manifestId ||
        (typeof data.manifest === 'string' ? data.manifest : '') ||
        'reading';
      setManifestId(String(mid).toLowerCase() || 'reading');
      const xp = typeof data.xp === 'number' ? data.xp : 0;
      const levelField = typeof data.level === 'number' ? data.level : undefined;
      const lv = levelField && levelField > 0 ? levelField : getLevelFromXP(xp) || 1;
      setPlayerLevel(lv);
      const nodes = skillState?.unlockedNodeIds || [];
      setUnlockedNodes(Array.isArray(nodes) ? nodes : []);
      const l2 = await getLevel2ManifestState(currentUser.uid);
      if (!l2.builderUnlocked) {
        setErr('Level 2 Manifest builder is locked. Enter Flow State in a Live Event or continue Sonido’s mission.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  const allow = useMemo(() => getAllowlistForManifest(manifestId), [manifestId]);

  const filteredTypes = LEVEL2_ALL_TYPES.filter((t) => allow.manifestTypes.includes(t));

  const filteredTargets = useMemo(() => {
    const byLevel = level2TargetsUnlockedAtLevel(playerLevel);
    const extras = allow.extraTargets ?? [];
    const merged = new Set<Level2ManifestTarget>([...byLevel, ...extras]);
    return LEVEL2_ALL_TARGETS.filter((t) => merged.has(t));
  }, [playerLevel, allow.extraTargets]);

  const filteredImpacts = useMemo(() => level2ImpactsForManifestType(manifestType), [manifestType]);

  const magnitudeOptions = useMemo(
    () => level2ResultMagnitudeOptions(playerLevel, impactArea),
    [playerLevel, impactArea]
  );

  useEffect(() => {
    if (!filteredTypes.includes(manifestType)) setManifestType(filteredTypes[0] || 'utility');
  }, [filteredTypes, manifestType]);
  useEffect(() => {
    if (!filteredTargets.includes(target)) setTarget(filteredTargets[0] || 'single_ally_or_enemy');
  }, [filteredTargets, target]);
  useEffect(() => {
    if (!filteredImpacts.includes(impact)) setImpact(filteredImpacts[0] || 'reveal');
  }, [filteredImpacts, impact]);
  useEffect(() => {
    setResultMagnitude((prev) => (magnitudeOptions.includes(prev) ? prev : magnitudeOptions[0] ?? 5));
  }, [magnitudeOptions]);

  const base = basePpAndCooldownLevel2(impact, impactArea, resultMagnitude);
  const mod = applyLevel2PerkModifiers({
    basePp: base.pp,
    baseCooldown: base.cooldown,
    unlockedSkillNodeIds: unlockedNodes,
  });
  const previewDescription = buildLevel2SkillDescription({
    skillName: skillName.trim() || 'Unnamed skill',
    manifestType,
    target,
    impact,
    impactArea,
    result: 'small',
    resultMagnitude,
  });

  const targetLevelHint = (() => {
    if (playerLevel >= 20) return 'Level 20+: you can target all enemies or allies in the Live Event.';
    if (playerLevel >= 11) return 'Levels 11–19: up to 4 enemies or allies.';
    if (playerLevel >= 6) return 'Levels 6–10: up to 2 enemies or allies.';
    return 'Levels 1–5: single enemy or ally only.';
  })();

  const handleSave = async () => {
    if (!currentUser) return;
    const nameErr = validateLevel2SkillName(skillName);
    if (nameErr) {
      setErr(nameErr);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const l2 = await getLevel2ManifestState(currentUser.uid);
      if (!l2.builderUnlocked) {
        setErr('Builder still locked.');
        return;
      }
      const record = await saveLevel2ManifestSkill(currentUser.uid, {
        skillName: skillName.trim(),
        manifestId,
        manifestType,
        target,
        impact,
        impactArea,
        resultMagnitude,
        result: 'small',
        unlockSource: playerMission && stepId ? 'mission_auto' : 'live_event_flow_first',
        missionStepId: stepId || undefined,
        unlockedSkillNodeIds: unlockedNodes,
      });
      if (playerMission && stepId) {
        await markMissionSequenceStepComplete(playerMission, stepId, { skillId: record.id });
      }
      if (returnMission) {
        navigate(`/mission/${encodeURIComponent(returnMission)}/play`);
      } else {
        navigate('/home');
      }
    } catch (e) {
      console.error(e);
      setErr('Could not save skill. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!currentUser) {
    return <div style={{ padding: '2rem' }}>Sign in to use the builder.</div>;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #0f172a 0%, #1e1b4b 45%, #312e81 100%)',
        padding: '2rem 1rem 3rem',
        color: '#e2e8f0',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <p style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.12em', color: '#a5b4fc' }}>
          SEASON 1 · META STATE
        </p>
        <h1 style={{ margin: '0.25rem 0 0.5rem', fontSize: '1.75rem' }}>Level 2 Manifest Skill Builder</h1>
        <p style={{ margin: '0 0 1.5rem', color: '#94a3b8', lineHeight: 1.5 }}>
          Live Events only. Target count scales with your level; impact verbs follow your Manifest type (
          <strong>{manifestId}</strong>
          ). Impact area sets how results are measured: pick any PP value in your level band, or any turn count from
          1 up to your level cap for skills/cooldowns; perk unlocks still shape PP cost & cooldown.
        </p>

        {err ? (
          <div
            style={{
              padding: '0.75rem 1rem',
              background: 'rgba(127, 29, 29, 0.35)',
              border: '1px solid #f87171',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
            }}
          >
            {err}
          </div>
        ) : null}

        <div
          style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(99, 102, 241, 0.35)',
            borderRadius: '1rem',
            padding: '1.5rem',
            marginBottom: '1.25rem',
          }}
        >
          <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.35rem' }}>Skill name</label>
          <input
            value={skillName}
            onChange={(e) => setSkillName(e.target.value)}
            maxLength={40}
            placeholder="e.g. Pattern Intercept"
            style={{
              width: '100%',
              padding: '0.65rem 0.75rem',
              borderRadius: '0.5rem',
              border: '1px solid #475569',
              background: '#0f172a',
              color: '#f8fafc',
              marginBottom: '1rem',
            }}
          />

          {(
            [
              ['Manifest type', filteredTypes, manifestType, setManifestType, LEVEL2_MANIFEST_TYPE_LABELS] as const,
              ['Target', filteredTargets, target, setTarget, LEVEL2_TARGET_LABELS] as const,
              ['Impact', filteredImpacts, impact, setImpact, LEVEL2_IMPACT_LABELS] as const,
              [
                'Impact area',
                LEVEL2_ALL_IMPACT_AREAS,
                impactArea,
                setImpactArea,
                LEVEL2_IMPACT_AREA_LABELS,
              ] as const,
            ] as const
          ).map(([label, options, val, setVal, labels]) => (
            <div key={label} style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.35rem' }}>{label}</label>
              {label === 'Target' ? (
                <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', color: '#94a3b8' }}>
                  Level <strong>{playerLevel}</strong> · {targetLevelHint}
                </p>
              ) : null}
              <select
                value={val}
                onChange={(e) => setVal(e.target.value as never)}
                style={{
                  width: '100%',
                  padding: '0.6rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #475569',
                  background: '#0f172a',
                  color: '#f8fafc',
                }}
              >
                {options.map((k) => (
                  <option key={k} value={k}>
                    {labels[k as keyof typeof labels]}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontWeight: 700, marginBottom: '0.35rem' }}>Result</label>
            {impactArea === 'pp' ? (
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', color: '#94a3b8' }}>
                Level <strong>{playerLevel}</strong> · PP range{' '}
                <strong>
                  {level2PpResultRange(playerLevel).min}–{level2PpResultRange(playerLevel).max}
                </strong>{' '}
                (pick an amount).
              </p>
            ) : (
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.85rem', color: '#94a3b8' }}>
                Level <strong>{playerLevel}</strong> · Choose <strong>1</strong> up to{' '}
                <strong>
                  {level2TurnResultForLevel(playerLevel)} turn
                  {level2TurnResultForLevel(playerLevel) === 1 ? '' : 's'}
                </strong>{' '}
                for {LEVEL2_IMPACT_AREA_LABELS[impactArea]} (your level sets the maximum).
              </p>
            )}
            <select
              value={resultMagnitude}
              onChange={(e) => setResultMagnitude(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '0.6rem',
                borderRadius: '0.5rem',
                border: '1px solid #475569',
                background: '#0f172a',
                color: '#f8fafc',
              }}
            >
              {magnitudeOptions.map((n) => (
                <option key={n} value={n}>
                  {impactArea === 'pp' ? `${n} PP` : `${n} turn${n === 1 ? '' : 's'}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div
          style={{
            background: 'rgba(30, 27, 75, 0.5)',
            border: '1px solid #6366f1',
            borderRadius: '1rem',
            padding: '1.25rem',
            marginBottom: '1rem',
          }}
        >
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.05rem' }}>Skill card preview</h3>
          <p style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', lineHeight: 1.55 }}>{previewDescription}</p>
          <div style={{ fontSize: '0.9rem', color: '#c7d2fe' }}>
            <div>
              PP cost: <strong>{mod.ppCost}</strong> · Cooldown: <strong>{mod.cooldownTurns}</strong> turns
            </div>
            {mod.perkModifierNotes.length > 0 ? (
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem' }}>
                {mod.perkModifierNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div
            style={{
              marginTop: '0.75rem',
              fontSize: '0.75rem',
              fontWeight: 800,
              letterSpacing: '0.06em',
              color: '#fbbf24',
            }}
          >
            LIVE EVENT ONLY · LEVEL 2 META SKILL
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            style={{
              padding: '0.85rem 1.5rem',
              background: saving ? '#64748b' : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontWeight: 800,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save & equip for Live Events'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{
              padding: '0.85rem 1.25rem',
              background: 'transparent',
              color: '#cbd5e1',
              border: '1px solid #64748b',
              borderRadius: '0.5rem',
              cursor: 'pointer',
            }}
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
};

export default Level2ManifestBuilderPage;
