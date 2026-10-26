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
  describeConsequence,
  describeDuration,
  describeReward,
  effectiveApproval,
  elementalLevelFromMoves,
  formatRuleClock,
  groupRulesByActivation,
  isRuleEnforceable,
  parseIrlEventConfig,
  resolveTargetUids,
  ruleRemainingMs,
  summarizeIrlUsage,
  type IrlRuleGroup,
  type IrlTeamOption,
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
  subscribeClassSkills,
  subscribeIrlActivations,
  subscribeIrlPlayerStates,
  subscribeIrlRules,
  subscribeIrlViolations,
  updateIrlEventConfig,
} from '../../utils/classSkillsService';
import '../classFlow/classFlow.css';
import './classSkills.css';

export interface ClassSkillsLivePanelProps {
  sessionId: string;
  liveEventMode: string | null;
  rawConfig: unknown;
  sprint: ClassFlowSprintState | null;
  sessionStatus?: string;
  players: { userId: string; displayName?: string; movesEarned?: number }[];
  isFacilitator: boolean;
  currentUserId: string;
  currentUserName: string;
}

type FacTab = 'approvals' | 'active' | 'reports' | 'history' | 'settings';

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
  sprint,
  sessionStatus,
  players,
  isFacilitator,
  currentUserId,
  currentUserName,
}) => {
  const config = useMemo(() => parseIrlEventConfig(rawConfig, liveEventMode), [rawConfig, liveEventMode]);
  const offset = useServerClockOffset(sessionId, currentUserId, config.enabled || isFacilitator);
  const [nowMs, setNowMs] = useState(() => Date.now() + offset);
  const [skills, setSkills] = useState<ClassSkill[]>([]);
  const [activations, setActivations] = useState<IrlActivation[]>([]);
  const [rules, setRules] = useState<IrlActiveRule[]>([]);
  const [violations, setViolations] = useState<IrlViolation[]>([]);
  const [states, setStates] = useState<Record<string, IrlPlayerState>>({});
  const [teams, setTeams] = useState<IrlTeamOption[]>([]);
  const [levels, setLevels] = useState<Record<string, number> | null>(null);
  const [activating, setActivating] = useState<ClassSkill | null>(null);
  const [facTab, setFacTab] = useState<FacTab>('approvals');
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
        announceSkillActivation({
          id: `irl:${a.id}`,
          skill: artInput(a.skillId, a.skillName, a.element),
          actorName: a.casterName,
          actorUid: a.casterUid,
          side: 'ally',
          targetName: a.targetLabel || null,
          rawName: true,
          details: skill ? [skill.irlEffect || skill.effects[0]?.behavior || '', `Duration: ${describeDuration(skill)}`].filter(Boolean) : undefined,
        });
        flash(true, `${a.skillName} approved${v.blockedUids.length ? ` · blocked for ${v.blockedUids.length} by protection` : ''}.`);
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

  if (!live) return null;

  const myState = states[currentUserId] || null;
  const myPP = players.find((p) => p.userId === currentUserId)?.movesEarned || 0;
  const usable = skills.filter((s) => s.status === 'active' && !config.disabledSkillIds.includes(s.id) && s.level <= config.maxLevel);
  const myElements = levels ? CLASS_SKILL_ELEMENTS.filter((el) => (levels[el] || 0) > 0) : [];
  const mySkills = usable.filter((s) => myElements.includes(s.element));
  const myPending = pending.filter((a) => a.casterUid === currentUserId);
  const myEffects = activeRules.filter((r) => r.targetUid === currentUserId);

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
              skills={mySkills}
              levels={levels}
              hasElement={myElements.length > 0}
              myState={myState}
              myPP={myPP}
              pending={myPending}
              nowMs={nowMs}
              config={config}
              sprintLive={!!liveSprintId}
              currentUserId={currentUserId}
              onActivate={setActivating}
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
          players={players.map((p) => ({ uid: p.userId, name: nameOf(p.userId) }))}
          teams={teams}
          onClose={() => setActivating(null)}
          onConfirm={async (targetUids, targetLabel) => {
            const res = await requestClassSkillActivation({
              sessionId,
              skill: activating,
              casterUid: currentUserId,
              casterName: currentUserName,
              targetType: activating.targetType,
              targetUids,
              targetLabel,
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

const PlayerSkills: React.FC<{
  skills: ClassSkill[];
  levels: Record<string, number> | null;
  hasElement: boolean;
  myState: IrlPlayerState | null;
  myPP: number;
  pending: IrlActivation[];
  nowMs: number;
  config: ReturnType<typeof parseIrlEventConfig>;
  sprintLive: boolean;
  currentUserId: string;
  onActivate: (s: ClassSkill) => void;
  onCancel: (a: IrlActivation) => void;
}> = ({ skills, levels, hasElement, myState, myPP, pending, nowMs, config, sprintLive, currentUserId, onActivate, onCancel }) => (
  <div style={{ marginTop: 12 }}>
    <div className="cf-stat-label" style={{ marginBottom: 6 }}>
      Your Class Skills
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
      <div className="cf-empty">No Class Skills are available for your element in this Live Event.</div>
    ) : (
      <div className="cs-skill-grid">
        {skills.map((s) => {
          const check = checkActivation({
            skill: s,
            config,
            casterUid: currentUserId,
            casterLevel: levels[s.element] || 0,
            casterState: myState,
            participationPoints: myPP,
            // Target choice happens in the modal; preview only the caster-side checks here.
            targetUids: s.targetType === 'self' ? [currentUserId] : ['preview'],
            nowMs,
            sprintLive,
          });
          const waiting = pending.some((a) => a.skillId === s.id);
          return (
            <div key={s.id} className={`cs-skill cs-el-${s.element}${check.ok ? '' : ' cs-skill--locked'}`}>
              <SkillCardArt skill={artInput(s.id, s.name, s.element)} alt="" className="cs-skill-art" />
              <div className="cs-skill-body">
                <div className="cs-skill-name">{s.name}</div>
                <div className="cf-sub">
                  {cap(s.element)} · Lv {s.level} · {IRL_TARGET_LABELS[s.targetType]} · {describeDuration(s)}
                </div>
                <div className="cs-skill-effect">{s.irlEffect || s.description}</div>
                <div className="cf-sub">
                  Cost {s.activationCost} · Cooldown {Math.round(s.cooldownSeconds / 60)} min
                  {effectiveApproval(s, config) === 'facilitator' ? ' · Needs approval' : ''}
                </div>
                {!check.ok && <div className="cs-skill-reason">{check.reason}</div>}
                <button type="button" className="cf-btn cf-btn--primary" disabled={!check.ok || waiting} onClick={() => onActivate(s)}>
                  {waiting ? 'Requested' : 'Activate'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
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
  players: { uid: string; name: string }[];
  teams: IrlTeamOption[];
  onClose: () => void;
  onConfirm: (targetUids: string[], targetLabel: string) => Promise<void>;
}> = ({ skill, config, casterUid, casterLevel, casterState, participationPoints, nowMs, sprintLive, players, teams, onClose, onConfirm }) => {
  const [playerUid, setPlayerUid] = useState('');
  const [teamId, setTeamId] = useState('');
  const [busy, setBusy] = useState(false);
  const restrict = skill.effects.some((e) => e.type === 'restriction');
  const targetUids = resolveTargetUids(skill, casterUid, { playerUid, teamId }, players.map((p) => p.uid), teams);
  const check = checkActivation({ skill, config, casterUid, casterLevel, casterState, participationPoints, targetUids, nowMs, sprintLive });
  const label =
    skill.targetType === 'self'
      ? 'Self'
      : skill.targetType === 'player'
        ? players.find((p) => p.uid === playerUid)?.name || ''
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
                <strong>{IRL_EFFECT_LABELS[e.type]}:</strong> {e.behavior}
              </div>
            ))}
          </div>
        </div>

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
            <tr>
              <th>Duration</th>
              <td>{describeDuration(skill)}</td>
            </tr>
            <tr>
              <th>Cost</th>
              <td>
                {skill.activationCost} Participation Point{skill.activationCost === 1 ? '' : 's'} (you have {participationPoints}) — only charged if approved
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

const FacilitatorSettings: React.FC<{
  sessionId: string;
  config: ReturnType<typeof parseIrlEventConfig>;
  skills: ClassSkill[];
  activeRules: IrlActiveRule[];
  onResult: (ok: boolean, text: string) => void;
  onEndAll: () => Promise<void>;
}> = ({ sessionId, config, skills, activeRules, onResult, onEndAll }) => {
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
                  {skill ? ` · Lv ${skill.level} · Cost ${skill.activationCost}` : ''}
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
