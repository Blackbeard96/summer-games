import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import SkillCardArt from '../skillCard/SkillCardArt';
import { loadSkillArtwork } from '../../utils/skillArtwork';
import { announceSkillActivation } from '../../utils/skillActivationAnnounce';
import { useServerClockOffset } from '../../hooks/useServerClock';
import { subscribePublicState } from '../../utils/classFlowWorkService';
import type { ClassFlowSprintState } from '../../types/season1';
import type {
  ClassSkill,
  IrlActivation,
  IrlActiveRule,
  IrlEffectType,
  IrlPlayerState,
  IrlViolation,
} from '../../types/classSkills';
import { CLASS_SKILL_ELEMENTS } from '../../types/classSkills';
import {
  CLASS_SKILL_LIMITS,
  IRL_EFFECT_LABELS,
  IRL_EFFECT_TYPES,
  IRL_ESSENTIAL_EXCEPTIONS,
  IRL_TARGET_LABELS,
  IRL_VERIFICATION_LABELS,
  checkActivation,
  classSkillUnlockState,
  describeConsequence,
  describeDuration,
  describeEffect,
  describeReward,
  effectiveApproval,
  effectiveClassSkillLoadout,
  effectiveCost,
  elementalLevelFromMoves,
  isDirectEffectType,
  parseClassSkillEquipped,
  skillHarmsTargets,
  formatRuleClock,
  groupRulesByActivation,
  isRuleEnforceable,
  parseIrlEventConfig,
  resolveTargetUids,
  ruleRemainingMs,
  summarizeIrlUsage,
  type IrlRuleGroup,
  type IrlTeamOption,
  type PhaseGate,
  type RuleClock,
} from '../../utils/classSkillsConfig';
import {
  approveClassSkillActivation,
  cancelClassSkillActivation,
  classSkillArtKey,
  completeClassSkillRule,
  confirmClassSkillViolation,
  dismissClassSkillViolation,
  endClassSkillRule,
  expireClassSkillRule,
  rejectClassSkillActivation,
  reportPossibleViolation,
  requestClassSkillActivation,
  subscribeClassSkillLoadout,
  subscribeClassSkills,
  subscribeIrlActivations,
  subscribeIrlPlayerStates,
  subscribeIrlRules,
  subscribeIrlViolations,
  updateIrlEventConfig,
} from '../../utils/classSkillsService';
import {
  bindPhaseRulesToSprint,
  closeClassSkillPhase,
  extendClassSkillPhase,
  openClassSkillPhase,
  passClassSkillPhase,
  setClassSkillCapacity,
  setClassSkillEquipped,
  setSprintClassSkillsEnabled,
  subscribeClassSkillCapacity,
  subscribeClassSkillEquipped,
} from '../../utils/classSkillPhaseService';
import {
  parseClassSkillPhase,
  phaseAutoCloseReason,
  phaseRemainingMs,
  phaseToOpen,
  playerPhaseStatus,
  type PhaseSprint,
  type PlayerPhaseStatus,
} from '../../utils/classSkillPhase';
import { describeResolvedEffect } from '../../utils/classSkillDirectEffects';
import { sprintTimerInput } from '../../utils/liveEventSprintService';
import { sprintPhase } from '../../utils/classFlowConfig';
import ClassSkillCard, { type ClassSkillCardTone } from './ClassSkillCard';
import ClassSkillPhasePrompt from './ClassSkillPhasePrompt';
import ClassSkillPhaseFacilitator from './ClassSkillPhaseFacilitator';
import '../classFlow/classFlow.css';
import './classSkills.css';

export interface ClassSkillsLivePanelProps {
  sessionId: string;
  liveEventMode: string | null;
  rawConfig: unknown;
  /** Room field `classSkillPhase` (post-sprint Class Skill Phase). */
  rawPhase?: unknown;
  sprint: ClassFlowSprintState | null;
  sessionStatus?: string;
  players: { userId: string; displayName?: string; movesEarned?: number }[];
  isFacilitator: boolean;
  currentUserId: string;
  currentUserName: string;
}

type FacTab = 'phase' | 'approvals' | 'active' | 'reports' | 'history' | 'settings';

const artInput = (skillId: string, name: string, element: string) => ({
  id: classSkillArtKey(skillId),
  name,
  category: 'elemental',
  elementalAffinity: element,
});
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const RULE_STATUS_LABEL: Record<IrlActiveRule['status'], string> = {
  active: 'Active',
  expired: 'Expired',
  completed: 'Completed',
  violated: 'Violation confirmed',
  ended: 'Ended by facilitator',
  blocked: 'Blocked by protection',
};

/** Live Event Class Skills (IRL): activation for players, management for facilitators. */
const ClassSkillsLivePanel: React.FC<ClassSkillsLivePanelProps> = ({
  sessionId,
  liveEventMode,
  rawConfig,
  rawPhase,
  sprint,
  sessionStatus,
  players,
  isFacilitator,
  currentUserId,
  currentUserName,
}) => {
  const config = useMemo(() => parseIrlEventConfig(rawConfig, liveEventMode), [rawConfig, liveEventMode]);
  const phase = useMemo(() => parseClassSkillPhase(rawPhase), [rawPhase]);
  const phaseSprint: PhaseSprint | null = useMemo(
    () => (sprint ? { id: sprint.id, title: sprint.title, classSkillsEnabled: sprint.classSkillsEnabled, timer: sprintTimerInput(sprint) } : null),
    [sprint]
  );
  const offset = useServerClockOffset(sessionId, currentUserId, config.enabled || isFacilitator);
  const [nowMs, setNowMs] = useState(() => Date.now() + offset);
  const [skills, setSkills] = useState<ClassSkill[]>([]);
  const [activations, setActivations] = useState<IrlActivation[]>([]);
  const [rules, setRules] = useState<IrlActiveRule[]>([]);
  const [violations, setViolations] = useState<IrlViolation[]>([]);
  const [states, setStates] = useState<Record<string, IrlPlayerState>>({});
  const [teams, setTeams] = useState<IrlTeamOption[]>([]);
  const [levels, setLevels] = useState<Record<string, number> | null>(null);
  const [loadout, setLoadout] = useState<string[]>([]);
  const [rawEquipped, setRawEquipped] = useState<string[]>([]);
  const [capacity, setCapacity] = useState<number>(CLASS_SKILL_LIMITS.defaultCapacity);
  const [activating, setActivating] = useState<ClassSkill | null>(null);
  const [facTab, setFacTab] = useState<FacTab>('phase');
  const [collapsed, setCollapsed] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const live = config.enabled || isFacilitator;

  useEffect(() => {
    setNowMs(Date.now() + offset);
    const id = window.setInterval(() => setNowMs(Date.now() + offset), 1000);
    return () => window.clearInterval(id);
  }, [offset]);

  useEffect(() => {
    if (!live) return;
    loadSkillArtwork().catch(() => undefined);
    return subscribeClassSkills(setSkills);
  }, [live]);

  useEffect(() => {
    if (!live) return;
    const unsubs = [
      subscribeIrlActivations(sessionId, setActivations),
      subscribeIrlRules(sessionId, setRules),
      subscribeIrlPlayerStates(sessionId, setStates),
      subscribeIrlViolations(sessionId, setViolations, isFacilitator ? undefined : currentUserId),
      subscribePublicState(sessionId, (s) => {
        const raw = Array.isArray(s?.teams) ? (s?.teams as Record<string, unknown>[]) : [];
        setTeams(
          raw
            .filter((t) => typeof t.id === 'string' && Array.isArray(t.memberIds))
            .map((t) => ({ id: String(t.id), name: String(t.tag || t.displayName || 'Team'), memberIds: (t.memberIds as unknown[]).map(String) }))
        );
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [live, sessionId, isFacilitator, currentUserId]);

  useEffect(() => {
    if (!config.enabled || isFacilitator) return;
    const unsubs = [
      subscribeClassSkillLoadout(currentUserId, setLoadout),
      subscribeClassSkillEquipped(currentUserId, setRawEquipped),
      subscribeClassSkillCapacity(setCapacity),
    ];
    return () => unsubs.forEach((u) => u());
  }, [config.enabled, isFacilitator, currentUserId]);

  // Elemental level comes from the player's own unlocked moves (existing progression).
  useEffect(() => {
    if (!config.enabled || isFacilitator) return;
    let cancelled = false;
    getDoc(doc(db, 'battleMoves', currentUserId))
      .then((snap) => {
        if (cancelled) return;
        const moves = snap.exists() ? snap.data()?.moves : null;
        const out: Record<string, number> = {};
        CLASS_SKILL_ELEMENTS.forEach((el) => (out[el] = elementalLevelFromMoves(moves, el)));
        setLevels(out);
      })
      .catch(() => !cancelled && setLevels({}));
    return () => {
      cancelled = true;
    };
  }, [config.enabled, isFacilitator, currentUserId]);

  const liveSprintId = sprint?.status === 'live' ? sprint.id : null;
  const clock: RuleClock = useMemo(
    () => ({ nowMs, liveSprintId, eventEnded: sessionStatus === 'ended' }),
    [nowMs, liveSprintId, sessionStatus]
  );
  const nameOf = useCallback(
    (uid: string) => players.find((p) => p.userId === uid)?.displayName || (uid === currentUserId ? currentUserName : 'Player'),
    [players, currentUserId, currentUserName]
  );
  const skillsById = useMemo(() => Object.fromEntries(skills.map((s) => [s.id, s])), [skills]);
  const ctx = useCallback(() => ({ sessionId, facilitatorUid: currentUserId, nowMs: Date.now() + offset }), [sessionId, currentUserId, offset]);
  const activeRules = useMemo(() => rules.filter((r) => isRuleEnforceable(r, clock)), [rules, clock]);
  const pending = useMemo(() => activations.filter((a) => a.status === 'pending'), [activations]);
  const openReports = useMemo(() => violations.filter((v) => v.status === 'reported' || v.status === 'player_report'), [violations]);
  const flash = useCallback((ok: boolean, text: string) => setMsg({ tone: ok ? 'ok' : 'error', text }), []);

  /* ---------------------------- Facilitator automation ---------------------------- */

  const approve = useCallback(
    async (a: IrlActivation) => {
      const names: Record<string, string> = {};
      a.targetUids.forEach((u) => (names[u] = nameOf(u)));
      const res = await approveClassSkillActivation(ctx(), a.id, names);
      if (!res.ok) return flash(false, res.error);
      const v = res.value;
      if (v?.approved) {
        const skill = skillsById[a.skillId];
        const results = (v.resolvedEffects || []).filter((r) => r.kind !== 'protection' && r.kind !== 'modifier').map((r) => describeResolvedEffect(r, nameOf));
        announceSkillActivation({
          id: `irl:${a.id}`,
          skill: artInput(a.skillId, a.skillName, a.element),
          actorName: a.casterName,
          actorUid: a.casterUid,
          side: 'ally',
          targetName: a.targetLabel || null,
          rawName: true,
          details: skill
            ? [
                skill.irlEffect || (skill.effects[0] ? describeEffect(skill.effects[0]) : ''),
                ...results.slice(0, 3),
                skill.effects.some((e) => !isDirectEffectType(e.type)) ? `Duration: ${describeDuration(skill)}` : '',
                v.cost != null ? `Cost: ${v.cost} Participation Points` : '',
              ].filter(Boolean)
            : undefined,
        });
        flash(true, `${a.skillName} approved${results.length ? ` · ${results.join(' · ')}` : ''}${v.blockedUids.length ? ` · blocked for ${v.blockedUids.length} by protection` : ''}.`);
      } else if (v?.reason) {
        flash(false, `${a.skillName} not approved: ${v.reason}`);
      }
    },
    [ctx, nameOf, skillsById, flash]
  );

  const autoTried = useRef(new Set<string>());
  useEffect(() => {
    if (!isFacilitator || !config.enabled) return;
    pending.forEach((a) => {
      const skill = skillsById[a.skillId];
      if (!skill || autoTried.current.has(a.id) || effectiveApproval(skill, config) !== 'auto') return;
      autoTried.current.add(a.id);
      void approve(a);
    });
  }, [isFacilitator, config, pending, skillsById, approve]);

  const expiring = useRef(new Set<string>());
  useEffect(() => {
    if (!isFacilitator) return;
    rules
      .filter((r) => r.status === 'active' && !isRuleEnforceable(r, clock) && !expiring.current.has(r.id))
      .forEach((r) => {
        expiring.current.add(r.id);
        void expireClassSkillRule(ctx(), r.id).finally(() => expiring.current.delete(r.id));
      });
  }, [isFacilitator, rules, clock, ctx]);

  /* ----------------------------- Class Skill Phase ----------------------------- */

  // Open once per completion cycle; the transaction re-checks, so several facilitator screens are safe.
  const openTried = useRef(new Set<string>());
  useEffect(() => {
    if (!isFacilitator || !config.enabled || sessionStatus === 'ended') return;
    const id = phaseToOpen({ config, sprint: phaseSprint, phase, cycles: [], nowMs });
    if (!id || openTried.current.has(id)) return;
    openTried.current.add(id);
    void openClassSkillPhase(ctx()).then((res) => {
      if (res.ok) return;
      flash(false, `Couldn't open the Class Skill Phase: ${res.error}`);
      window.setTimeout(() => openTried.current.delete(id), 5000);
    });
  }, [isFacilitator, config, phaseSprint, phase, nowMs, sessionStatus, ctx, flash]);

  const closeTried = useRef(new Set<string>());
  useEffect(() => {
    if (!isFacilitator || !phase) return;
    const pendingIn = pending.filter((a) => a.phaseId === phase.id).length;
    const reason = phaseAutoCloseReason(phase, nowMs, pendingIn);
    if (!reason || closeTried.current.has(`${phase.id}:${reason}`)) return;
    closeTried.current.add(`${phase.id}:${reason}`);
    void closeClassSkillPhase(ctx(), phase.id, reason);
  }, [isFacilitator, phase, pending, nowMs, ctx]);

  // "Until end of sprint" effects chosen in a phase start counting when the next sprint is running.
  const binding = useRef(new Set<string>());
  useEffect(() => {
    if (!isFacilitator || !phaseSprint) return;
    const state = sprintPhase(phaseSprint.timer, nowMs);
    if ((state !== 'running' && state !== 'paused') || phase?.sprintId === phaseSprint.id) return;
    const ids = rules.filter((r) => r.status === 'active' && r.durationKind === 'end_of_sprint' && r.sprintId === null && !binding.current.has(r.id)).map((r) => r.id);
    if (!ids.length) return;
    ids.forEach((id) => binding.current.add(id));
    void bindPhaseRulesToSprint(sessionId, ids, phaseSprint.id);
  }, [isFacilitator, phaseSprint, phase, rules, nowMs, sessionId]);

  if (!live) return null;

  const myState = states[currentUserId] || null;
  const myPP = players.find((p) => p.userId === currentUserId)?.movesEarned || 0;
  const myElements = levels ? CLASS_SKILL_ELEMENTS.filter((el) => (levels[el] || 0) > 0) : [];
  const myLoadout = effectiveClassSkillLoadout(loadout, skills);
  const myPending = pending.filter((a) => a.casterUid === currentUserId);
  const myEffects = activeRules.filter((r) => r.targetUid === currentUserId);
  const myPendingInPhase = phase ? myPending.filter((a) => a.phaseId === phase.id).length : 0;
  const phaseStatus = playerPhaseStatus({ config, sprint: phaseSprint, phase, uid: currentUserId, nowMs, pendingInPhase: myPendingInPhase });
  const equippedIds = parseClassSkillEquipped(rawEquipped, capacity).filter((id) => skillsById[id]);
  const equippedSkills = equippedIds.map((id) => skillsById[id]);
  const equipOptions =
    equippedIds.length < capacity
      ? skills.filter(
          (s) =>
            !equippedIds.includes(s.id) &&
            !config.disabledSkillIds.includes(s.id) &&
            s.level <= config.maxLevel &&
            classSkillUnlockState(s, levels, myLoadout).unlocked
        )
      : [];
  const activatedThisPhase = new Set(
    phase ? activations.filter((a) => a.casterUid === currentUserId && a.phaseId === phase.id && a.status === 'approved').map((a) => a.skillId) : []
  );
  const liveStates = equippedSkills.map((s) =>
    classSkillLiveState({
      skill: s,
      config,
      phaseStatus,
      levels,
      loadout: myLoadout,
      equipped: equippedIds,
      casterState: myState,
      participationPoints: myPP,
      nowMs,
      sprintLive: !!liveSprintId,
      currentUserId,
      pending: myPending.some((a) => a.skillId === s.id),
      activated: activatedThisPhase.has(s.id),
    })
  );
  const equip = async (s: ClassSkill) => {
    const res = await setClassSkillEquipped(currentUserId, [...equippedIds, s.id], capacity);
    flash(res.ok, res.ok ? `${s.name} equipped.` : res.error);
  };
  const pass = async () => {
    if (!phase) return;
    const res = await passClassSkillPhase(sessionId, phase.id, currentUserId, Date.now() + offset);
    flash(res.ok, res.ok ? 'You passed this Class Skill Phase.' : res.error);
  };
  const showPrompt = !isFacilitator && config.enabled && phase && phaseStatus.state === 'open' && !activating;

  return (
    <div className="cf-root cs-root" data-testid="class-skills-panel">
      <div className="cf-between">
        <div>
          <h3 className="cf-title">Class Skills (IRL)</h3>
          <div className="cf-sub">
            {config.enabled ? 'Elemental skills that create short classroom rules, verified by the facilitator.' : 'Off for this Live Event.'}
          </div>
        </div>
        <div className="cf-row">
          {!isFacilitator && config.enabled && <span className="cf-badge">Participation Points: {myPP}</span>}
          {isFacilitator && pending.length > 0 && <span className="cf-badge cf-badge--count">{pending.length}</span>}
          <button type="button" className="cf-btn cf-btn--ghost" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>
            {collapsed ? 'Show' : 'Hide'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {msg && (
            <div className={`cf-msg${msg.tone === 'error' ? ' cf-msg--error' : ''}`} role="status" style={{ marginTop: 10 }}>
              {msg.text}
            </div>
          )}

          {config.enabled && (
            <ActiveEffects
              groups={groupRulesByActivation(activeRules)}
              clock={clock}
              currentUserId={currentUserId}
              isFacilitator={isFacilitator}
              title={isFacilitator ? 'Active Class Effects' : myEffects.length ? 'Active Class Effects (you are affected)' : 'Active Class Effects'}
              onReport={async (rule, note) => {
                const res = await reportPossibleViolation(sessionId, rule, currentUserId, currentUserName, note, false);
                flash(res.ok, res.ok ? 'Report sent to the facilitator. Reports never apply a penalty on their own.' : res.error);
              }}
              onEnd={async (rule) => {
                const res = await endClassSkillRule(ctx(), rule.id);
                flash(res.ok, res.ok ? `Ended ${rule.skillName} for ${rule.targetName}.` : res.error);
              }}
              onComplete={async (rule, credit) => {
                const res = await completeClassSkillRule(ctx(), rule, clock, credit);
                flash(res.ok, res.ok ? `Completed${res.value?.rewardPP ? ` · +${res.value.rewardPP} PP to ${rule.targetName}` : ''}.` : res.error);
              }}
              onViolation={async (rule, note) => {
                const rep = await reportPossibleViolation(sessionId, rule, currentUserId, currentUserName, note, true);
                if (!rep.ok || !rep.value) return flash(false, rep.ok ? 'Could not record the violation.' : rep.error);
                const v: IrlViolation = {
                  id: rep.value,
                  ruleId: rule.id,
                  targetUid: rule.targetUid,
                  reporterUid: currentUserId,
                  reporterName: currentUserName,
                  note,
                  status: 'reported',
                  createdAtMs: Date.now(),
                  decidedBy: null,
                  decidedAtMs: null,
                  consequenceApplied: null,
                };
                const res = await confirmClassSkillViolation(ctx(), v, rule, clock);
                flash(res.ok, res.ok ? `Violation confirmed for ${rule.targetName}: ${res.value?.applied}` : res.error);
              }}
            />
          )}

          {!isFacilitator && config.enabled && (
            <PlayerSkills
              phaseStatus={phaseStatus}
              phaseEndsAtMs={phase?.status === 'open' ? phase.endsAtMs : null}
              skills={equippedSkills}
              liveStates={liveStates}
              equipOptions={equipOptions}
              capacity={capacity}
              levels={levels}
              hasElement={myElements.length > 0}
              config={config}
              pending={myPending}
              nowMs={nowMs}
              onActivate={setActivating}
              onEquip={equip}
              onPass={pass}
              onCancel={async (a) => {
                const res = await cancelClassSkillActivation(sessionId, a.id);
                flash(res.ok, res.ok ? 'Request cancelled. Nothing was charged.' : res.error);
              }}
            />
          )}

          {isFacilitator && (
            <>
              <div className="cf-tabs" role="tablist">
                {(
                  [
                    ['phase', phase?.status === 'open' ? `Phase · ${formatRuleClock(phaseRemainingMs(phase, nowMs))}` : 'Class Skill Phase'],
                    ['approvals', `Pending approvals${pending.length ? ` (${pending.length})` : ''}`],
                    ['active', `Active rules (${activeRules.length})`],
                    ['reports', `Violations${openReports.length ? ` (${openReports.length})` : ''}`],
                    ['history', 'History & analytics'],
                    ['settings', 'Settings'],
                  ] as [FacTab, string][]
                ).map(([id, text]) => (
                  <button key={id} type="button" role="tab" aria-selected={facTab === id} className={`cf-tab${facTab === id ? ' cf-tab--active' : ''}`} onClick={() => setFacTab(id)}>
                    {text}
                  </button>
                ))}
              </div>
              {facTab === 'phase' && (
                <ClassSkillPhaseFacilitator
                  phase={phase}
                  sprint={phaseSprint}
                  config={config}
                  activations={activations}
                  nowMs={nowMs}
                  nameOf={nameOf}
                  onShowApprovals={() => setFacTab('approvals')}
                  onOpen={async () => {
                    const res = await openClassSkillPhase(ctx(), { manual: true });
                    flash(res.ok, res.ok ? (res.value?.opened ? 'Class Skill Phase opened.' : 'A Class Skill Phase is already open.') : res.error);
                  }}
                  onClose={async (id) => {
                    const res = await closeClassSkillPhase(ctx(), id, 'facilitator');
                    flash(res.ok, res.ok ? 'Class Skill Phase ended. Pending requests can still be approved or rejected.' : res.error);
                  }}
                  onExtend={async (id, s) => {
                    const res = await extendClassSkillPhase(ctx(), id, s);
                    flash(res.ok, res.ok ? `Phase extended by ${s}s.` : res.error);
                  }}
                  onToggleSprint={async (sprintId, enabled) => {
                    const res = await setSprintClassSkillsEnabled(ctx(), sprintId, enabled);
                    flash(res.ok, res.ok ? `Class Skills ${enabled ? 'enabled' : 'disabled'} for this sprint.` : res.error);
                  }}
                />
              )}
              {facTab === 'settings' && (
                <FacilitatorSettings
                  sessionId={sessionId}
                  config={config}
                  skills={skills.filter((s) => s.status === 'active')}
                  onResult={flash}
                  activeRules={activeRules}
                  onEndAll={async () => {
                    for (const r of activeRules) await endClassSkillRule(ctx(), r.id, 'Ended by facilitator (all effects)');
                    flash(true, 'All active Class Skill effects ended.');
                  }}
                />
              )}
              {facTab === 'approvals' && (
                <PendingApprovals
                  pending={pending}
                  skillsById={skillsById}
                  config={config}
                  states={states}
                  nowMs={nowMs}
                  onApprove={approve}
                  onReject={async (a, reason) => {
                    const res = await rejectClassSkillActivation(ctx(), a.id, reason);
                    flash(res.ok, res.ok ? `Rejected ${a.skillName}. Nothing was charged and no cooldown started.` : res.error);
                  }}
                />
              )}
              {facTab === 'active' && (
                <FacilitatorRulesTable
                  rules={activeRules}
                  clock={clock}
                  onEnd={async (r) => {
                    const res = await endClassSkillRule(ctx(), r.id);
                    flash(res.ok, res.ok ? `Ended ${r.skillName} for ${r.targetName}.` : res.error);
                  }}
                />
              )}
              {facTab === 'reports' && (
                <ViolationReports
                  reports={openReports}
                  rules={rules}
                  clock={clock}
                  onConfirm={async (v, rule) => {
                    const res = await confirmClassSkillViolation(ctx(), v, rule, clock);
                    flash(res.ok, res.ok ? `Violation confirmed: ${res.value?.applied}` : res.error);
                  }}
                  onDismiss={async (v) => {
                    const res = await dismissClassSkillViolation(ctx(), v.id);
                    flash(res.ok, res.ok ? 'Report dismissed. No consequence applied.' : res.error);
                  }}
                />
              )}
              {facTab === 'history' && <History activations={activations} rules={rules} states={states} nameOf={nameOf} violations={violations} />}
            </>
          )}
        </>
      )}

      {showPrompt && phase && (
        <ClassSkillPhasePrompt
          phase={phase}
          nowMs={nowMs}
          participationPoints={myPP}
          cost={config.costSource === 'event' ? config.classSkillCost : phase.cost}
          equipped={equippedSkills.map((s, i) => ({ skill: s, cost: effectiveCost(s, config), status: liveStates[i].status, canUse: liveStates[i].canUse }))}
          equipOptions={equipOptions}
          onChoose={setActivating}
          onEquip={equip}
          onPass={pass}
        />
      )}

      {activating && (
        <ActivationModal
          skill={activating}
          config={config}
          casterUid={currentUserId}
          casterLevel={levels?.[activating.element] || 0}
          casterState={myState}
          participationPoints={myPP}
          nowMs={nowMs}
          sprintLive={!!liveSprintId}
          phaseGate={phaseStatus.gate}
          equipped={equippedIds}
          loadout={myLoadout}
          players={players.map((p) => ({ uid: p.userId, name: nameOf(p.userId) }))}
          teams={teams}
          onClose={() => setActivating(null)}
          onConfirm={async (targetUids, targetLabel) => {
            if (!phaseStatus.gate.ok) {
              setActivating(null);
              return flash(false, phaseStatus.gate.reason);
            }
            const res = await requestClassSkillActivation({
              sessionId,
              skill: activating,
              casterUid: currentUserId,
              casterName: currentUserName,
              targetType: activating.targetType,
              targetUids,
              targetLabel,
              phaseId: phaseStatus.gate.phaseId,
            });
            setActivating(null);
            flash(
              res.ok,
              res.ok
                ? effectiveApproval(activating, config) === 'auto'
                  ? `${activating.name} sent. It activates as soon as the facilitator's screen confirms it.`
                  : `${activating.name} is waiting for facilitator approval. Nothing is charged unless it's approved.`
                : res.error
            );
          }}
        />
      )}
    </div>
  );
};

/* ---------------------------------- Player ---------------------------------- */

interface LiveSkillState {
  status: { label: string; tone: ClassSkillCardTone };
  canUse: boolean;
  reason: string | null;
}

/** Card state for one equipped skill: the same checks the approval transaction runs, plus phase timing. */
function classSkillLiveState(input: {
  skill: ClassSkill;
  config: ReturnType<typeof parseIrlEventConfig>;
  phaseStatus: PlayerPhaseStatus;
  levels: Record<string, number> | null;
  loadout: string[];
  equipped: string[];
  casterState: IrlPlayerState | null;
  participationPoints: number;
  nowMs: number;
  sprintLive: boolean;
  currentUserId: string;
  pending: boolean;
  activated: boolean;
}): LiveSkillState {
  const { skill, config, phaseStatus } = input;
  const st = (label: string, tone: ClassSkillCardTone, reason: string | null = null): LiveSkillState => ({ status: { label, tone }, canUse: false, reason });
  if (config.disabledSkillIds.includes(skill.id)) return st('Disabled by Facilitator', 'muted', 'Your facilitator turned this skill off for this Live Event.');
  const unlock = classSkillUnlockState(skill, input.levels, input.loadout);
  if (!unlock.unlocked) return st('Locked', 'locked', unlock.reason);
  if (input.pending) return st('Pending Approval', 'warn', 'Waiting for the facilitator.');
  if (input.activated) return st('Activated', 'active', 'Used in this Class Skill Phase.');
  if (phaseStatus.state === 'awaiting') return st('Awaiting Post-Sprint Phase', 'muted', phaseStatus.message);
  if (phaseStatus.state === 'disabled') return st('Disabled by Facilitator', 'muted', phaseStatus.message);
  const ready = input.casterState?.cooldowns[skill.id] || 0;
  if (ready > input.nowMs) return st(`On Cooldown · ${formatRuleClock(ready - input.nowMs)}`, 'locked', 'This skill is recharging.');
  const cost = effectiveCost(skill, config);
  if (input.participationPoints < cost) return st('Insufficient Participation Points', 'warn', `Needs ${cost}; you have ${input.participationPoints}.`);
  if (!phaseStatus.gate.ok) return st('Equipped', 'muted', phaseStatus.message);
  const check = checkActivation({
    skill,
    loadout: input.loadout,
    equipped: input.equipped,
    phase: phaseStatus.gate,
    config,
    casterUid: input.currentUserId,
    casterLevel: input.levels?.[skill.element] || 0,
    casterState: input.casterState,
    participationPoints: input.participationPoints,
    // Target choice happens in the modal; preview only the caster-side checks here.
    targetUids: skill.targetType === 'self' ? [input.currentUserId] : ['preview'],
    nowMs: input.nowMs,
    sprintLive: input.sprintLive,
  });
  if (!check.ok) return st('Unavailable', 'warn', check.reason);
  return { status: { label: 'Available', tone: 'ready' }, canUse: true, reason: null };
}

const PlayerSkills: React.FC<{
  phaseStatus: PlayerPhaseStatus;
  phaseEndsAtMs: number | null;
  skills: ClassSkill[];
  liveStates: LiveSkillState[];
  equipOptions: ClassSkill[];
  capacity: number;
  levels: Record<string, number> | null;
  hasElement: boolean;
  config: ReturnType<typeof parseIrlEventConfig>;
  pending: IrlActivation[];
  nowMs: number;
  onActivate: (s: ClassSkill) => void;
  onEquip: (s: ClassSkill) => Promise<void>;
  onPass: () => Promise<void>;
  onCancel: (a: IrlActivation) => void;
}> = ({ phaseStatus, phaseEndsAtMs, skills, liveStates, equipOptions, capacity, levels, hasElement, config, pending, nowMs, onActivate, onEquip, onPass, onCancel }) => (
  <div style={{ marginTop: 12 }}>
    <div className={`cs-phase-banner${phaseStatus.state === 'open' ? ' cs-phase-banner--open' : ''}`} data-testid="class-skill-phase-status">
      <span>
        <strong>{phaseStatus.state === 'open' ? 'Class Skill Phase' : 'Class Skills'}</strong> · {phaseStatus.message}
      </span>
      {phaseStatus.state === 'open' && phaseEndsAtMs != null && (
        <span className="cf-row" style={{ flexWrap: 'nowrap' }}>
          <span className="cs-phase-clock">{formatRuleClock(Math.max(0, phaseEndsAtMs - nowMs))}</span>
          <button type="button" className="cf-btn cf-btn--ghost" onClick={() => void onPass()}>
            Pass
          </button>
        </span>
      )}
    </div>
    <div className="cf-stat-label" style={{ margin: '12px 0 6px' }}>
      Your equipped Class Skills ({skills.length}/{capacity})
    </div>
    {pending.map((a) => (
      <div key={a.id} className="cf-card cs-pending">
        <span>
          <strong>{a.skillName}</strong> → {a.targetLabel || 'target'} · waiting for approval
        </span>
        <button type="button" className="cf-btn cf-btn--ghost" onClick={() => onCancel(a)}>
          Cancel
        </button>
      </div>
    ))}
    {levels === null ? (
      <div className="cf-empty">Loading your elemental level…</div>
    ) : !hasElement ? (
      <div className="cf-empty">Unlock an elemental move to use Class Skills.</div>
    ) : skills.length === 0 ? (
      <div className="cf-empty">No Class Skills equipped. Equip them in your Loadout (Class Skills tab){equipOptions.length ? ' or below' : ''}.</div>
    ) : (
      <div className="cs-skill-grid">
        {skills.map((s, i) => {
          const ls = liveStates[i];
          return (
            <ClassSkillCard key={s.id} skill={s} cost={effectiveCost(s, config)} equipped status={ls.status}>
              {ls.reason && <div className="cs-skill-reason">{ls.reason}</div>}
              {effectiveApproval(s, config) === 'facilitator' && <div className="cf-sub">Needs facilitator approval</div>}
              <button type="button" className="cf-btn cf-btn--primary" disabled={!ls.canUse} onClick={() => onActivate(s)}>
                Activate
              </button>
            </ClassSkillCard>
          );
        })}
      </div>
    )}
    {equipOptions.length > 0 && (
      <>
        <div className="cf-stat-label" style={{ margin: '12px 0 6px' }}>
          Unlocked — equip into a free slot
        </div>
        <div className="cs-skill-grid">
          {equipOptions.map((s) => (
            <ClassSkillCard key={s.id} skill={s} cost={effectiveCost(s, config)} compact status={{ label: 'Unlocked', tone: 'ready' }}>
              <button type="button" className="cf-btn cf-btn--ghost" onClick={() => void onEquip(s)}>
                Equip
              </button>
            </ClassSkillCard>
          ))}
        </div>
      </>
    )}
  </div>
);

const ActivationModal: React.FC<{
  skill: ClassSkill;
  config: ReturnType<typeof parseIrlEventConfig>;
  casterUid: string;
  casterLevel: number;
  casterState: IrlPlayerState | null;
  participationPoints: number;
  nowMs: number;
  sprintLive: boolean;
  phaseGate: PhaseGate;
  equipped: string[];
  loadout: string[];
  players: { uid: string; name: string }[];
  teams: IrlTeamOption[];
  onClose: () => void;
  onConfirm: (targetUids: string[], targetLabel: string) => Promise<void>;
}> = ({ skill, config, casterUid, casterLevel, casterState, participationPoints, nowMs, sprintLive, phaseGate, equipped, loadout, players, teams, onClose, onConfirm }) => {
  const [playerUid, setPlayerUid] = useState('');
  const [playerUids, setPlayerUids] = useState<string[]>([]);
  const [teamId, setTeamId] = useState('');
  const [busy, setBusy] = useState(false);
  const restrict = skillHarmsTargets(skill);
  const targetUids = resolveTargetUids(skill, casterUid, { playerUid, playerUids, teamId }, players.map((p) => p.uid), teams);
  const check = checkActivation({ skill, config, casterUid, casterLevel, casterState, participationPoints, targetUids, nowMs, sprintLive, phase: phaseGate, equipped, loadout });
  const cost = effectiveCost(skill, config);
  const hasRules = skill.effects.some((e) => !isDirectEffectType(e.type));
  const label =
    skill.targetType === 'self'
      ? 'Self'
      : skill.targetType === 'player'
        ? players.find((p) => p.uid === playerUid)?.name || ''
        : skill.targetType === 'players'
          ? targetUids.map((u) => players.find((p) => p.uid === u)?.name || 'Player').join(', ').slice(0, 120)
          : skill.targetType === 'team'
            ? teams.find((t) => t.id === teamId)?.name || ''
            : 'Whole class';

  return (
    <div className="cf-modal-backdrop" role="dialog" aria-modal="true" aria-label={`Activate ${skill.name}`}>
      <div className="cf-root cf-modal">
        <div className="cf-between">
          <h3 className="cf-title">Activate {skill.name}</h3>
          <button type="button" className="cf-btn cf-btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="cs-modal-head">
          <SkillCardArt skill={artInput(skill.id, skill.name, skill.element)} alt="" className="cs-skill-art cs-skill-art--lg" />
          <div>
            <div className="cf-sub">
              {cap(skill.element)} · Level {skill.level}
            </div>
            <p style={{ margin: '6px 0' }}>{skill.irlEffect || skill.description}</p>
            {skill.effects.map((e) => (
              <div key={e.id} className="cf-sub">
                <strong>{IRL_EFFECT_LABELS[e.type]}:</strong> {isDirectEffectType(e.type) ? describeEffect(e) : e.behavior}
              </div>
            ))}
          </div>
        </div>

        {skill.targetType === 'players' && (
          <div className="cf-label">
            Target players ({playerUids.length} chosen)
            <div className="cs-player-picks">
              {players
                .filter((p) => !(restrict && p.uid === casterUid))
                .map((p) => (
                  <label key={p.uid} className="cf-check">
                    <input
                      type="checkbox"
                      checked={playerUids.includes(p.uid)}
                      onChange={(e) => setPlayerUids((cur) => (e.target.checked ? [...cur, p.uid] : cur.filter((u) => u !== p.uid)))}
                    />
                    {p.uid === casterUid ? `${p.name} (you)` : p.name}
                  </label>
                ))}
            </div>
          </div>
        )}

        {skill.targetType === 'player' && (
          <label className="cf-label">
            Target player
            <select className="cf-select" value={playerUid} onChange={(e) => setPlayerUid(e.target.value)}>
              <option value="">Choose a player…</option>
              {players
                .filter((p) => !(restrict && p.uid === casterUid))
                .map((p) => (
                  <option key={p.uid} value={p.uid}>
                    {p.uid === casterUid ? `${p.name} (you)` : p.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {skill.targetType === 'team' && (
          <label className="cf-label">
            Target team
            <select className="cf-select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">{teams.length ? 'Choose a team…' : 'No teams in this Live Event'}</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <table className="cf-table" style={{ marginTop: 10 }}>
          <tbody>
            <tr>
              <th>Target</th>
              <td>
                {label || '—'}
                {targetUids.length > 1 ? ` (${targetUids.length} players)` : ''}
              </td>
            </tr>
            {hasRules && (
              <tr>
                <th>Duration</th>
                <td>{describeDuration(skill)}</td>
              </tr>
            )}
            <tr>
              <th>Cost</th>
              <td>
                {cost} Participation Point{cost === 1 ? '' : 's'} (you have {participationPoints}) — not Vault PP; only charged if it resolves
              </td>
            </tr>
            <tr>
              <th>Cooldown</th>
              <td>{Math.round(skill.cooldownSeconds / 60)} min after approval</td>
            </tr>
            <tr>
              <th>If broken</th>
              <td>{describeConsequence(skill.consequence)}</td>
            </tr>
            <tr>
              <th>Reward</th>
              <td>{describeReward(skill.reward)}</td>
            </tr>
            <tr>
              <th>Approval</th>
              <td>{effectiveApproval(skill, config) === 'facilitator' ? 'Facilitator must approve' : 'Automatic'}</td>
            </tr>
          </tbody>
        </table>
        <p className="cf-sub" style={{ marginTop: 8 }}>
          {IRL_ESSENTIAL_EXCEPTIONS}
        </p>
        {!check.ok && <div className="cf-msg cf-msg--error">{check.reason}</div>}
        <div className="cf-row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button type="button" className="cf-btn cf-btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="cf-btn cf-btn--primary"
            disabled={!check.ok || busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm(targetUids, label);
              setBusy(false);
            }}
          >
            {busy ? 'Sending…' : 'Confirm activation'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------ Active effects ------------------------------ */

const ActiveEffects: React.FC<{
  groups: IrlRuleGroup[];
  clock: RuleClock;
  currentUserId: string;
  isFacilitator: boolean;
  title: string;
  onReport: (rule: IrlActiveRule, note: string) => void;
  onEnd: (rule: IrlActiveRule) => void;
  onComplete: (rule: IrlActiveRule, credit: number) => void;
  onViolation: (rule: IrlActiveRule, note: string) => void;
}> = ({ groups, clock, currentUserId, isFacilitator, title, onReport, onEnd, onComplete, onViolation }) => {
  const [open, setOpen] = useState<string | null>(null);
  const visible = isFacilitator ? groups : groups.filter((g) => g.casterUid === currentUserId || g.rules.some((r) => r.targetUid === currentUserId) || g.rules.length > 1);
  return (
    <div style={{ marginTop: 12 }}>
      <div className="cf-stat-label" style={{ marginBottom: 6 }}>
        {title}
      </div>
      {visible.length === 0 ? (
        <div className="cf-empty">No active Class Skill effects.</div>
      ) : (
        <div className="cs-effects">
          {visible.map((g) => {
            const first = g.rules[0];
            const remaining = ruleRemainingMs(first, clock.nowMs);
            const mine = g.rules.some((r) => r.targetUid === currentUserId);
            const expanded = open === g.activationId;
            const targets = g.rules.length > 1 ? `${g.rules.length} players` : first.targetName;
            return (
              <div key={g.activationId} className={`cf-card cs-effect cs-el-${g.element}${mine ? ' cs-effect--mine' : ''}`}>
                <button type="button" className="cs-effect-head" onClick={() => setOpen(expanded ? null : g.activationId)} aria-expanded={expanded}>
                  <SkillCardArt skill={artInput(first.skillId, g.skillName, g.element)} alt="" className="cs-effect-art" />
                  <span className="cs-effect-main">
                    <strong>{g.skillName}</strong>
                    <span className="cf-sub">
                      {g.casterName} → {targets}
                    </span>
                    <span className="cs-effect-rule">{first.effects[0]?.behavior || first.irlEffect}</span>
                  </span>
                  <span className="cs-effect-clock" aria-label="Time remaining">
                    {remaining != null ? formatRuleClock(remaining) : first.durationKind === 'instant' ? 'Instant' : first.durationKind === 'end_of_sprint' ? 'Sprint' : first.durationKind === 'objective' ? 'Objective' : 'Event'}
                  </span>
                </button>
                {expanded && (
                  <div className="cs-effect-details">
                    <div>
                      <strong>Effect:</strong> {first.irlEffect}
                    </div>
                    {first.effects.map((e) => (
                      <div key={e.id}>
                        <strong>{IRL_EFFECT_LABELS[e.type]}:</strong> {e.behavior}
                      </div>
                    ))}
                    {first.violationConditions && (
                      <div>
                        <strong>Violation:</strong> {first.violationConditions}
                      </div>
                    )}
                    <div>
                      <strong>Consequence:</strong> {describeConsequence(first.consequence)}
                    </div>
                    <div>
                      <strong>Reward:</strong> {describeReward(first.reward)}
                    </div>
                    <div>
                      <strong>Verification:</strong> {IRL_VERIFICATION_LABELS[first.verification]}
                    </div>
                    <div className="cf-sub">{IRL_ESSENTIAL_EXCEPTIONS}</div>
                    {g.rules.map((r) => (
                      <RuleActions
                        key={r.id}
                        rule={r}
                        showName={g.rules.length > 1 || isFacilitator}
                        isFacilitator={isFacilitator}
                        canReport={!isFacilitator && r.targetUid !== currentUserId}
                        onReport={onReport}
                        onEnd={onEnd}
                        onComplete={onComplete}
                        onViolation={onViolation}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const RuleActions: React.FC<{
  rule: IrlActiveRule;
  showName: boolean;
  isFacilitator: boolean;
  canReport: boolean;
  onReport: (rule: IrlActiveRule, note: string) => void;
  onEnd: (rule: IrlActiveRule) => void;
  onComplete: (rule: IrlActiveRule, credit: number) => void;
  onViolation: (rule: IrlActiveRule, note: string) => void;
}> = ({ rule, showName, isFacilitator, canReport, onReport, onEnd, onComplete, onViolation }) => {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => unknown) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  if (!isFacilitator && !canReport) return null;
  return (
    <div className="cs-rule-row">
      {showName && <span className="cs-rule-target">{rule.targetName}</span>}
      {isFacilitator && (
        <>
          <button type="button" className="cf-btn cf-btn--red" disabled={busy} onClick={() => run(() => onEnd(rule))}>
            End now
          </button>
          {rule.consequence.type !== 'none' && (
            <button
              type="button"
              className="cf-btn cf-btn--ghost"
              disabled={busy}
              onClick={() => {
                const note = window.prompt(`Confirm a violation by ${rule.targetName}? Consequence: ${describeConsequence(rule.consequence)}\n\nOptional note:`, '');
                if (note !== null) void run(() => onViolation(rule, note));
              }}
            >
              Confirm violation
            </button>
          )}
          <button
            type="button"
            className="cf-btn cf-btn--green"
            disabled={busy}
            onClick={() => {
              let credit = 0;
              if (rule.reward.type === 'reward_multiplier') {
                const raw = window.prompt(`Approved credit (PP) earned by ${rule.targetName} during this effect? Bonus = ${rule.reward.multiplier}× minus 1, max ${rule.reward.amount || CLASS_SKILL_LIMITS.maxRewardPP}.`, '0');
                if (raw === null) return;
                credit = Math.max(0, Math.floor(Number(raw) || 0));
              }
              void run(() => onComplete(rule, credit));
            }}
          >
            Mark complete
          </button>
        </>
      )}
      {canReport && (
        <button
          type="button"
          className="cf-btn cf-btn--ghost"
          disabled={busy}
          onClick={() => {
            const note = window.prompt('Report a possible violation to the facilitator. What happened?', '');
            if (note !== null) void run(() => onReport(rule, note));
          }}
        >
          Report to facilitator
        </button>
      )}
    </div>
  );
};

/* -------------------------------- Facilitator ------------------------------- */

const NumberSetting: React.FC<{ label: string; value: number; min: number; max: number; onSave: (n: number) => void | Promise<void> }> = ({
  label,
  value,
  min,
  max,
  onSave,
}) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Math.max(min, Math.min(max, Math.floor(Number(draft))));
    if (!Number.isFinite(n) || n === value) return setDraft(String(value));
    void onSave(n);
  };
  return (
    <label className="cf-label">
      {label}
      <input
        className="cf-input"
        type="number"
        min={min}
        max={max}
        value={draft}
        style={{ width: 110 }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  );
};

const FacilitatorSettings: React.FC<{
  sessionId: string;
  config: ReturnType<typeof parseIrlEventConfig>;
  skills: ClassSkill[];
  activeRules: IrlActiveRule[];
  onResult: (ok: boolean, text: string) => void;
  onEndAll: () => Promise<void>;
}> = ({ sessionId, config, skills, activeRules, onResult, onEndAll }) => {
  const [capacity, setCapacity] = useState<number>(CLASS_SKILL_LIMITS.defaultCapacity);
  useEffect(() => subscribeClassSkillCapacity(setCapacity), []);
  const save = async (patch: Parameters<typeof updateIrlEventConfig>[1], text: string) => {
    const res = await updateIrlEventConfig(sessionId, patch);
    onResult(res.ok, res.ok ? text : res.error);
  };
  const toggleEffect = (t: IrlEffectType) => {
    const next = config.allowedEffectTypes.includes(t) ? config.allowedEffectTypes.filter((x) => x !== t) : [...config.allowedEffectTypes, t];
    void save({ allowedEffectTypes: next }, 'Allowed effect types updated.');
  };
  return (
    <div className="cs-settings">
      <div className="cf-row">
        <label className="cf-check">
          <input type="checkbox" checked={config.enabled} onChange={(e) => save({ enabled: e.target.checked }, e.target.checked ? 'Class Skills enabled.' : 'Class Skills disabled.')} />
          Enable Class Skills in this Live Event
        </label>
        <label className="cf-label">
          Approval
          <select className="cf-select" value={config.approvalMode} onChange={(e) => save({ approvalMode: e.target.value as 'skill' | 'all' }, 'Approval mode updated.')}>
            <option value="skill">Per skill (class-wide and restriction skills always need approval)</option>
            <option value="all">Every activation needs approval</option>
          </select>
        </label>
        <label className="cf-label">
          Highest level allowed
          <select className="cf-select" value={config.maxLevel} onChange={(e) => save({ maxLevel: Number(e.target.value) }, 'Level limit updated.')}>
            {Array.from({ length: CLASS_SKILL_LIMITS.maxLevel }, (_, i) => i + 1).map((l) => (
              <option key={l} value={l}>
                Level {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="cf-stat-label" style={{ marginTop: 12 }}>
        Battle Sprints · Class Skill Phase
      </div>
      <div className="cf-row">
        <label className="cf-check">
          <input
            type="checkbox"
            checked={config.sprintPhaseDefault}
            onChange={(e) => save({ sprintPhaseDefault: e.target.checked }, `New sprints: Class Skills ${e.target.checked ? 'enabled' : 'disabled'} by default.`)}
          />
          Enable Class Skills for new sprints by default
        </label>
        <label className="cf-label">
          Cost
          <select className="cf-select" value={config.costSource} onChange={(e) => save({ costSource: e.target.value as 'event' | 'skill' }, 'Cost rule updated.')}>
            <option value="event">Same cost for every Class Skill</option>
            <option value="skill">Each skill's own cost</option>
          </select>
        </label>
        {config.costSource === 'event' && (
          <NumberSetting
            label="Participation Points per use"
            value={config.classSkillCost}
            min={0}
            max={CLASS_SKILL_LIMITS.maxCost}
            onSave={(n) => save({ classSkillCost: n }, `Class Skill cost set to ${n} Participation Points.`)}
          />
        )}
        <NumberSetting
          label="Phase length (seconds)"
          value={config.phaseSeconds}
          min={CLASS_SKILL_LIMITS.minPhaseSeconds}
          max={CLASS_SKILL_LIMITS.maxPhaseSeconds}
          onSave={(n) => save({ phaseSeconds: n }, `Class Skill Phase set to ${n}s.`)}
        />
        <NumberSetting
          label="Activations per player per phase"
          value={config.activationLimit}
          min={1}
          max={CLASS_SKILL_LIMITS.maxActivationLimit}
          onSave={(n) => save({ activationLimit: n }, `Players can use ${n} Class Skill${n === 1 ? '' : 's'} per phase.`)}
        />
        <NumberSetting
          label="Protected minimum Vault PP"
          value={config.vaultFloorPP}
          min={0}
          max={CLASS_SKILL_LIMITS.maxVaultFloorPP}
          onSave={(n) => save({ vaultFloorPP: n }, `Direct Vault effects never take a Vault below ${n} PP.`)}
        />
        <NumberSetting
          label="Class Skill slots (all players, admin only)"
          value={capacity}
          min={1}
          max={CLASS_SKILL_LIMITS.maxCapacity}
          onSave={async (n) => {
            const res = await setClassSkillCapacity(n);
            onResult(res.ok, res.ok ? `Players can equip ${n} Class Skills.` : `Only admins can change slots: ${res.error}`);
          }}
        />
      </div>
      <div className="cf-stat-label" style={{ marginTop: 12 }}>
        Allowed effect types for this event
      </div>
      <div className="cf-row">
        {IRL_EFFECT_TYPES.map((t) => (
          <label key={t} className="cf-check">
            <input type="checkbox" checked={config.allowedEffectTypes.includes(t)} onChange={() => toggleEffect(t)} />
            {IRL_EFFECT_LABELS[t]}
          </label>
        ))}
      </div>
      <div className="cf-stat-label" style={{ marginTop: 12 }}>
        Active skills (uncheck to disable for this event)
      </div>
      {skills.length === 0 ? (
        <div className="cf-empty">No active Class Skills. Set skills to Active in Elemental Moves Admin → Class Skills (IRL).</div>
      ) : (
        <div className="cf-row">
          {skills.map((s) => (
            <label key={s.id} className="cf-check">
              <input
                type="checkbox"
                checked={!config.disabledSkillIds.includes(s.id)}
                onChange={(e) =>
                  save(
                    { disabledSkillIds: e.target.checked ? config.disabledSkillIds.filter((x) => x !== s.id) : [...config.disabledSkillIds, s.id] },
                    `${s.name} ${e.target.checked ? 'enabled' : 'disabled'} for this event.`
                  )
                }
              />
              {s.name} <span className="cf-sub">({cap(s.element)} Lv {s.level})</span>
            </label>
          ))}
        </div>
      )}
      <div className="cf-row" style={{ marginTop: 12 }}>
        <button type="button" className="cf-btn cf-btn--red" disabled={activeRules.length === 0} onClick={() => window.confirm('End every active Class Skill effect now?') && void onEndAll()}>
          End all active effects ({activeRules.length})
        </button>
      </div>
    </div>
  );
};

const PendingApprovals: React.FC<{
  pending: IrlActivation[];
  skillsById: Record<string, ClassSkill>;
  config: ReturnType<typeof parseIrlEventConfig>;
  states: Record<string, IrlPlayerState>;
  nowMs: number;
  onApprove: (a: IrlActivation) => Promise<void>;
  onReject: (a: IrlActivation, reason: string) => Promise<void>;
}> = ({ pending, skillsById, config, onApprove, onReject }) => {
  const [busy, setBusy] = useState<string | null>(null);
  if (!pending.length) return <div className="cf-empty">No activations waiting for approval.</div>;
  return (
    <table className="cf-table">
      <thead>
        <tr>
          <th>Player</th>
          <th>Skill</th>
          <th>Target</th>
          <th>Effect</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {pending.map((a) => {
          const skill = skillsById[a.skillId];
          return (
            <tr key={a.id}>
              <td>{a.casterName}</td>
              <td>
                {a.skillName}
                <div className="cf-sub">
                  {cap(a.element)}
                  {skill ? ` · Lv ${skill.level} · Cost ${effectiveCost(skill, config)}` : ''}
                  {skill && effectiveApproval(skill, config) === 'auto' ? ' · auto' : ''}
                </div>
              </td>
              <td>{a.targetLabel || IRL_TARGET_LABELS[a.targetType]}</td>
              <td>
                {skill ? skill.irlEffect || skill.effects[0]?.behavior : 'Skill no longer exists'}
                {skill && <div className="cf-sub">{describeDuration(skill)} · {describeConsequence(skill.consequence)}</div>}
              </td>
              <td>
                <div className="cf-row" style={{ flexWrap: 'nowrap' }}>
                  <button
                    type="button"
                    className="cf-btn cf-btn--green"
                    disabled={busy === a.id}
                    onClick={async () => {
                      setBusy(a.id);
                      await onApprove(a);
                      setBusy(null);
                    }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="cf-btn cf-btn--red"
                    disabled={busy === a.id}
                    onClick={async () => {
                      const reason = window.prompt('Reason (shown to the player):', 'Not right now');
                      if (reason === null) return;
                      setBusy(a.id);
                      await onReject(a, reason);
                      setBusy(null);
                    }}
                  >
                    Reject
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

const FacilitatorRulesTable: React.FC<{ rules: IrlActiveRule[]; clock: RuleClock; onEnd: (r: IrlActiveRule) => Promise<void> }> = ({ rules, clock, onEnd }) => {
  if (!rules.length) return <div className="cf-empty">No active rules.</div>;
  return (
    <table className="cf-table">
      <thead>
        <tr>
          <th>Target</th>
          <th>Skill</th>
          <th>Rule</th>
          <th>Remaining</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rules.map((r) => {
          const rem = ruleRemainingMs(r, clock.nowMs);
          return (
            <tr key={r.id}>
              <td>{r.targetName}</td>
              <td>
                {r.skillName}
                <div className="cf-sub">by {r.casterName}</div>
              </td>
              <td>{r.effects[0]?.behavior || r.irlEffect}</td>
              <td>{rem != null ? formatRuleClock(rem) : describeDuration({ durationKind: r.durationKind, durationSeconds: 0 })}</td>
              <td>
                <button type="button" className="cf-btn cf-btn--red" onClick={() => onEnd(r)}>
                  End now
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

const ViolationReports: React.FC<{
  reports: IrlViolation[];
  rules: IrlActiveRule[];
  clock: RuleClock;
  onConfirm: (v: IrlViolation, rule: IrlActiveRule) => Promise<void>;
  onDismiss: (v: IrlViolation) => Promise<void>;
}> = ({ reports, rules, clock, onConfirm, onDismiss }) => {
  if (!reports.length) return <div className="cf-empty">No open reports. Player reports never apply consequences until you confirm them.</div>;
  return (
    <table className="cf-table">
      <thead>
        <tr>
          <th>Target</th>
          <th>Rule</th>
          <th>Reported by</th>
          <th>Note</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {reports.map((v) => {
          const rule = rules.find((r) => r.id === v.ruleId);
          const enforceable = !!rule && isRuleEnforceable(rule, clock);
          return (
            <tr key={v.id}>
              <td>{rule?.targetName || 'Player'}</td>
              <td>
                {rule?.skillName || 'Unknown rule'}
                <div className="cf-sub">{rule ? (enforceable ? describeConsequence(rule.consequence) : `${RULE_STATUS_LABEL[rule.status]} · can't be enforced`) : ''}</div>
              </td>
              <td>{v.reporterName}</td>
              <td>{v.note || '—'}</td>
              <td>
                <div className="cf-row" style={{ flexWrap: 'nowrap' }}>
                  <button type="button" className="cf-btn cf-btn--red" disabled={!enforceable || !rule} onClick={() => rule && onConfirm(v, rule)}>
                    Confirm
                  </button>
                  <button type="button" className="cf-btn cf-btn--ghost" onClick={() => onDismiss(v)}>
                    Dismiss
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

const History: React.FC<{
  activations: IrlActivation[];
  rules: IrlActiveRule[];
  violations: IrlViolation[];
  states: Record<string, IrlPlayerState>;
  nameOf: (uid: string) => string;
}> = ({ activations, rules, violations, states, nameOf }) => {
  const usage = summarizeIrlUsage(activations, rules);
  const recent = [...activations].filter((a) => a.status !== 'pending').sort((a, b) => (b.decidedAtMs || b.requestedAtMs) - (a.decidedAtMs || a.requestedAtMs)).slice(0, 30);
  const playerRows = Object.values(states).filter((s) => s.stats.activations || s.stats.violations || s.stats.rulesCompleted || s.warnings);
  return (
    <div className="cs-history">
      <div className="cf-stat-label">Skill usage</div>
      {usage.length === 0 ? (
        <div className="cf-empty">No Class Skill activity yet.</div>
      ) : (
        <table className="cf-table">
          <thead>
            <tr>
              <th>Skill</th>
              <th>Requested</th>
              <th>Approved</th>
              <th>Rejected</th>
              <th>Completed</th>
              <th>Violations</th>
              <th>Ended early</th>
              <th>Blocked</th>
            </tr>
          </thead>
          <tbody>
            {usage.map((u) => (
              <tr key={u.skillId}>
                <td>{u.skillName}</td>
                <td>{u.requested}</td>
                <td>{u.approved}</td>
                <td>{u.rejected}</td>
                <td>{u.completed}</td>
                <td>{u.violated}</td>
                <td>{u.ended}</td>
                <td>{u.blocked}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {playerRows.length > 0 && (
        <>
          <div className="cf-stat-label" style={{ marginTop: 12 }}>
            Players
          </div>
          <table className="cf-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Activations</th>
                <th>Completed</th>
                <th>Violations</th>
                <th>Warnings</th>
                <th>Rewards</th>
                <th>Penalties</th>
              </tr>
            </thead>
            <tbody>
              {playerRows.map((s) => (
                <tr key={s.uid}>
                  <td>{nameOf(s.uid)}</td>
                  <td>
                    {s.stats.approved}/{s.stats.activations}
                  </td>
                  <td>{s.stats.rulesCompleted}</td>
                  <td>{s.stats.violations}</td>
                  <td>{s.warnings}</td>
                  <td>+{s.stats.rewardsPP} PP</td>
                  <td>−{s.stats.penaltiesPP} PP</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div className="cf-stat-label" style={{ marginTop: 12 }}>
        Recent decisions
      </div>
      {recent.length === 0 ? (
        <div className="cf-empty">Nothing yet.</div>
      ) : (
        <table className="cf-table">
          <tbody>
            {recent.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.decidedAtMs || a.requestedAtMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</td>
                <td>
                  {a.casterName} · {a.skillName} → {a.targetLabel || IRL_TARGET_LABELS[a.targetType]}
                </td>
                <td className={a.status === 'approved' ? 'cf-status-approved' : 'cf-status-rejected'}>
                  {cap(a.status)}
                  {a.reason ? ` — ${a.reason}` : ''}
                  {a.status === 'approved' && a.costCharged > 0 && <div className="cf-sub">−{a.costCharged} Participation Points</div>}
                  {a.resolvedEffects.map((r, i) => (
                    <div key={i} className="cf-sub">
                      {describeResolvedEffect(r, nameOf)}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="cf-stat-label" style={{ marginTop: 12 }}>
        Resolved rules
      </div>
      <table className="cf-table">
        <tbody>
          {rules
            .filter((r) => r.status !== 'active')
            .slice(0, 30)
            .map((r) => (
              <tr key={r.id}>
                <td>{r.targetName}</td>
                <td>{r.skillName}</td>
                <td>
                  {RULE_STATUS_LABEL[r.status]}
                  {r.resolution && r.resolution !== RULE_STATUS_LABEL[r.status] ? ` — ${r.resolution}` : ''}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {violations.some((v) => v.status === 'dismissed') && (
        <div className="cf-sub" style={{ marginTop: 8 }}>
          Dismissed reports: {violations.filter((v) => v.status === 'dismissed').length}
        </div>
      )}
    </div>
  );
};

export default ClassSkillsLivePanel;
