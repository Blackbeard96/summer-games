import React, { useEffect, useMemo, useState } from 'react';
import type { CfRewardResult } from '../../utils/classFlowRewards';
import type { CfSprintAssignment } from '../../types/classFlowWork';
import { sprintPhase, sprintTasks } from '../../utils/classFlowConfig';
import {
  endPlannedSprint,
  startPlannedSprint,
  updateCfConfig,
  updateLiveSprintAssignments,
} from '../../utils/classFlowWorkService';
import SprintWorkPicker from './SprintWorkPicker';
import { sprintTimerInput, updateClassFlowSprintTimer } from '../../utils/liveEventSprintService';
import ClassFlowSprintTimer from './ClassFlowSprintTimer';
import PlanEditor from './facilitator/PlanEditor';
import ApprovalsTab from './facilitator/ApprovalsTab';
import TeamsTab from './facilitator/TeamsTab';
import RewardsTab from './facilitator/RewardsTab';
import AnalyticsTab from './facilitator/AnalyticsTab';
import SettingsTab from './facilitator/SettingsTab';
import SprintSubmissionsCard, { type SprintReviewActions } from './facilitator/SprintSubmissionsCard';
import ClassFlowPlayerView from './ClassFlowPlayerView';
import type { CfFacilitatorData, CfPlayerData, CfSharedProps } from './classFlowPanelTypes';

type Tab = 'sprint' | 'mywork' | 'approvals' | 'teams' | 'rewards' | 'analytics' | 'settings';

type Props = CfSharedProps & {
  data: CfFacilitatorData;
  preview: CfRewardResult | null;
  playerData?: CfPlayerData;
  review: SprintReviewActions | null;
};

const ClassFlowFacilitatorView: React.FC<Props> = (props) => {
  const { sessionId, actor, sprint, config, nowMs, players, nameOf, notify, data, preview, embedded, classId, playerData, roster, review } = props;
  const sharedProps: CfSharedProps = { sessionId, actor, sprint, config, nowMs, players, nameOf, notify, classId, roster, embedded: true };
  const rootClass = `cf-root${embedded ? ' cf-embedded' : ''}`;
  const [tab, setTab] = useState<Tab>('sprint');
  const [workDraft, setWorkDraft] = useState<CfSprintAssignment[] | null>(null);
  const liveWork = useMemo(() => sprint?.assignments || [], [sprint?.assignments]);
  const workDirty = workDraft !== null && JSON.stringify(workDraft) !== JSON.stringify(liveWork);
  const lockedWorkIds = useMemo(
    () => Array.from(new Set(data.submissions.filter((s) => s.sprintId === sprint?.id).map((s) => s.assignmentId))),
    [data.submissions, sprint?.id]
  );
  useEffect(() => setWorkDraft(null), [sprint?.id]);
  const [collapsed, setCollapsed] = useState(!config.workAssignmentsEnabled);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [startIndex, setStartIndex] = useState<number | null>(null);

  const pendingCount = data.submissions.filter((s) => s.status === 'submitted' || s.status === 'awaiting_approval').length;
  const phase = sprint ? sprintPhase(sprintTimerInput(sprint), nowMs) : null;
  const isLive = phase === 'running' || phase === 'paused';
  const plan = config.plan;
  const currentIdx = sprint?.planId ? plan.findIndex((p) => p.planId === sprint.planId) : -1;
  const nextIdx = startIndex ?? (currentIdx >= 0 ? currentIdx + 1 : 0);
  const nextPlan = plan[nextIdx] || null;

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) => {
    setBusy(true);
    setMessage(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) setMessage({ text: res.error || 'Something went wrong', error: true });
    else if (success) setMessage({ text: success });
  };

  const timer = (kind: 'pause' | 'resume' | 'extend', seconds = 0) =>
    run(() =>
      updateClassFlowSprintTimer(
        sessionId,
        actor.uid,
        actor.email,
        actor.displayName,
        kind === 'extend' ? { kind, seconds } : { kind },
        nowMs
      )
    );

  const startNext = async (endCurrentFirst: boolean) => {
    if (!nextPlan) return;
    await run(async () => {
      if (endCurrentFirst && sprint && sprint.status === 'live') {
        const r = await endPlannedSprint(sessionId, actor, sprint.id);
        if (!r.ok) return r;
      }
      const r = await startPlannedSprint(sessionId, actor, nextPlan, nowMs);
      if (r.ok) setStartIndex(null);
      return r.ok ? { ok: true } : r;
    }, `Started “${nextPlan.title}”.`);
  };

  if (!config.workAssignmentsEnabled && collapsed) {
    return (
      <div className={rootClass}>
        <div className="cf-between">
          <div>
            <h3 className="cf-title">Sprint Manager</h3>
            <div className="cf-sub">
              Work assignments, approvals, teams and rewards are off for this session. Attaching work to a sprint turns
              them on automatically.
            </div>
          </div>
          <div className="cf-row">
            <button
              type="button"
              className="cf-btn cf-btn--primary"
              onClick={async () => {
                const res = await updateCfConfig(sessionId, { workAssignmentsEnabled: true, expandedTimerEnabled: true });
                if (res.ok) setCollapsed(false);
                else notify({ title: 'Could not enable', body: res.error, tone: 'bad' });
              }}
            >
              Enable Work Assignments
            </button>
            <button type="button" className="cf-btn cf-btn--ghost" onClick={() => { setCollapsed(false); setTab('settings'); }}>
              Settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  const TABS: [Tab, string][] = [
    ['sprint', 'Sprint'],
    ...(playerData ? ([['mywork', 'My work']] as [Tab, string][]) : []),
    ['approvals', 'Approvals'],
    ...(config.teamModeEnabled ? ([['teams', 'Teams']] as [Tab, string][]) : []),
    ['rewards', 'Rewards'],
    ['analytics', 'Analytics'],
    ['settings', 'Settings'],
  ];

  return (
    <div className={rootClass} aria-label="Class Flow facilitator dashboard">
      <div className="cf-between">
        <h3 className="cf-title">Sprint Manager</h3>
        <div className="cf-row">
          {data.support.length > 0 && (
            <button type="button" className="cf-btn cf-btn--ghost" onClick={() => setTab('sprint')}>
              🙋 Support <span className="cf-badge cf-badge--count">{data.support.length}</span>
            </button>
          )}
          {pendingCount > 0 && (
            <button type="button" className="cf-btn cf-btn--ghost" onClick={() => setTab('approvals')}>
              Pending <span className="cf-badge cf-badge--count">{pendingCount}</span>
            </button>
          )}
          {!config.workAssignmentsEnabled && (
            <button type="button" className="cf-btn cf-btn--ghost" onClick={() => setCollapsed(true)}>
              Close
            </button>
          )}
        </div>
      </div>

      <div className="cf-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`cf-tab ${tab === id ? 'cf-tab--active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
            {id === 'sprint' && data.support.length > 0 ? <span className="cf-badge cf-badge--count" style={{ marginLeft: 6 }}>{data.support.length}</span> : null}
            {id === 'approvals' && pendingCount > 0 ? <span className="cf-badge cf-badge--count" style={{ marginLeft: 6 }}>{pendingCount}</span> : null}
          </button>
        ))}
      </div>

      {message && <div className={`cf-msg ${message.error ? 'cf-msg--error' : ''}`} style={{ marginBottom: 10 }}>{message.text}</div>}

      {tab === 'sprint' && (
        <div>
          {sprint ? (
            <ClassFlowSprintTimer
              sprint={sprint}
              nowMs={nowMs}
              expandable
              acceptLate={config.acceptLateSubmissions}
              availablePoints={preview?.pool.totalBase ?? null}
              items={sprintTasks(sprint).map((a) => {
                const subs = data.submissions.filter((s) => s.sprintId === sprint.id && s.assignmentId === a.assignmentId);
                const approvedN = subs.filter((s) => s.status === 'approved').length;
                return { assignment: a, detail: `${subs.length} submitted · ${approvedN} approved` };
              })}
              roster={roster}
            />
          ) : (
            <div className="cf-empty">No sprint running.</div>
          )}

          <div className="cf-row" style={{ marginTop: 10 }}>
            {phase === 'running' && (
              <button type="button" className="cf-btn" disabled={busy} onClick={() => timer('pause')}>⏸ Pause</button>
            )}
            {phase === 'paused' && (
              <button type="button" className="cf-btn cf-btn--green" disabled={busy} onClick={() => timer('resume')}>▶ Resume</button>
            )}
            {sprint && (
              <>
                <button type="button" className="cf-btn" disabled={busy} onClick={() => timer('extend', 60)}>+1 min</button>
                <button type="button" className="cf-btn" disabled={busy} onClick={() => timer('extend', 300)}>+5 min</button>
              </>
            )}
            {sprint && isLive && (
              <button
                type="button"
                className="cf-btn cf-btn--red"
                disabled={busy}
                onClick={() => window.confirm(`End “${sprint.title}” now? Submissions will close.`) && run(() => endPlannedSprint(sessionId, actor, sprint.id), 'Sprint ended.')}
              >
                ■ End sprint
              </button>
            )}
            {plan.length > 0 && (
              <>
                <select
                  className="cf-select"
                  value={nextIdx}
                  onChange={(e) => setStartIndex(Number(e.target.value))}
                  aria-label="Next sprint"
                >
                  {plan.map((p, i) => (
                    <option key={p.planId} value={i}>
                      {i + 1}. {p.title} ({p.durationMinutes} min · {p.assignments.length} tasks)
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="cf-btn cf-btn--primary"
                  disabled={busy || !nextPlan}
                  onClick={() => {
                    if (isLive && !window.confirm('End the current sprint and start the next one?')) return;
                    void startNext(isLive);
                  }}
                >
                  {isLive ? '⏭ Next sprint' : '▶ Start sprint'}
                </button>
              </>
            )}
          </div>
          {sprint && phase !== 'running' && phase !== 'paused' && config.workAssignmentsEnabled && (
            <div className="cf-sub" style={{ marginTop: 8 }}>
              Sprint ended. Review pending work, then finalize rewards in the Rewards tab.
            </div>
          )}

          {sprint && (
            <SprintSubmissionsCard
              sessionId={sessionId}
              actorUid={actor.uid}
              rows={roster || []}
              support={data.support}
              rewardedUids={sprint.rewardsGrantedUids || []}
              actions={review}
              notify={notify}
            />
          )}

          {preview && (
            <div className="cf-grid" style={{ marginTop: 12 }}>
              <div className="cf-card"><div className="cf-stat-label">Pending review</div><div className="cf-stat-value">{data.submissions.filter((s) => s.sprintId === sprint?.id && (s.status === 'submitted' || s.status === 'awaiting_approval')).length}</div></div>
              <div className="cf-card"><div className="cf-stat-label">Approved base</div><div className="cf-stat-value">{preview.pool.approvedBase}</div></div>
              <div className="cf-card"><div className="cf-stat-label">Remaining</div><div className="cf-stat-value">{preview.pool.remainingBase}</div></div>
              <div className="cf-card"><div className="cf-stat-label">Projected payout</div><div className="cf-stat-value">{preview.pool.finalDistributed}</div></div>
            </div>
          )}

          {sprint && (
            <div className="cf-card cf-card--gold" style={{ marginTop: 12 }}>
              <div className="cf-between" style={{ marginBottom: 8 }}>
                <div>
                  <div className="cf-stat-label">Work in this sprint</div>
                  <div className="cf-sub">
                    {sprint.title} — add library work or create new work. Players see changes right away.
                  </div>
                </div>
                {workDirty && (
                  <div className="cf-row">
                    <button type="button" className="cf-btn cf-btn--ghost" disabled={busy} onClick={() => setWorkDraft(null)}>
                      Discard
                    </button>
                    <button
                      type="button"
                      className="cf-btn cf-btn--primary"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const r = await updateLiveSprintAssignments(sessionId, sprint.id, workDraft || []);
                          if (!r.ok) return r;
                          setWorkDraft(null);
                          if (!config.workAssignmentsEnabled && (workDraft || []).length) {
                            return updateCfConfig(sessionId, { workAssignmentsEnabled: true, expandedTimerEnabled: true });
                          }
                          return r;
                        }, 'Sprint work saved.')
                      }
                    >
                      Save sprint work
                    </button>
                  </div>
                )}
              </div>
              <SprintWorkPicker
                assignments={workDraft ?? liveWork}
                onChange={setWorkDraft}
                actorUid={actor.uid}
                classId={classId}
                lockedIds={lockedWorkIds}
                onMessage={(text, error) => setMessage({ text, error })}
              />
            </div>
          )}

          <PlanEditor
            sessionId={sessionId}
            plan={plan}
            activePlanId={sprint?.planId ?? null}
            classId={classId}
            actorUid={actor.uid}
            onMessage={(text, error) => setMessage({ text, error })}
          />
        </div>
      )}

      {playerData && tab === 'mywork' && (
        <div>
          <div className="cf-sub" style={{ marginBottom: 8 }}>
            Submit your own work as a participant. It goes to Approvals like everyone else's and counts toward rewards.
          </div>
          <ClassFlowPlayerView {...sharedProps} data={playerData} />
        </div>
      )}
      {playerData && tab !== 'mywork' && (
        <ClassFlowPlayerView {...sharedProps} data={playerData} barOnly onOpenMyWork={() => setTab('mywork')} />
      )}

      {tab === 'approvals' && (
        <ApprovalsTab
          sessionId={sessionId}
          reviewerUid={actor.uid}
          submissions={data.submissions}
          teams={data.teams}
          tableByUid={data.tableByUid}
          archive={data.archive}
          currentSprintId={sprint?.id ?? null}
          notify={notify}
        />
      )}

      {tab === 'teams' && (
        <TeamsTab
          sessionId={sessionId}
          actorUid={actor.uid}
          config={config}
          teams={data.teams}
          storedTeams={data.storedTeams}
          tableByUid={data.tableByUid}
          nameOf={nameOf}
          notify={notify}
        />
      )}

      {tab === 'rewards' && (
        <RewardsTab
          sessionId={sessionId}
          actorUid={actor.uid}
          config={config}
          currentSprint={sprint ? { id: sprint.id, title: sprint.title, assignments: sprintTasks(sprint) } : null}
          archive={data.archive}
          submissions={data.submissions}
          teams={data.teams}
          players={players}
          sharing={data.sharing}
          allocations={data.allocations}
          nameOf={nameOf}
          notify={notify}
        />
      )}

      {tab === 'analytics' && (
        <AnalyticsTab
          submissions={data.submissions}
          allocations={data.allocations}
          archive={data.archive}
          currentAssignments={sprintTasks(sprint)}
          teams={data.teams}
          players={players}
          nameOf={nameOf}
        />
      )}

      {tab === 'settings' && <SettingsTab sessionId={sessionId} config={config} notify={notify} />}
    </div>
  );
};

export default ClassFlowFacilitatorView;
