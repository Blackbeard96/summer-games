import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './classFlow.css';
import type { ClassFlowSprintState } from '../../types/season1';
import type {
  CfAllocation,
  CfPayout,
  CfSharingDecision,
  CfSubmission,
} from '../../types/classFlowWork';
import { parseCfConfig, sprintPhase } from '../../utils/classFlowConfig';
import { computeSprintRewards } from '../../utils/classFlowRewards';
import { buildTeams, formatTeamTag, teamTableNumber } from '../../utils/classFlowTeams';
import {
  claimMyPayouts,
  publishPublicState,
  reviewSubmission,
  subscribeAllocations,
  subscribeAllSubmissions,
  subscribeMyAllocations,
  subscribeMyPayouts,
  subscribeMySubmissions,
  subscribePublicState,
  subscribeSharing,
  subscribeSprintArchive,
  subscribeStoredTeams,
  subscribeTables,
  type CfSprintArchive,
  type CfStoredTeam,
} from '../../utils/classFlowWorkService';
import { sprintTimerInput, updateClassFlowSprintTimer } from '../../utils/liveEventSprintService';
import { getUserSquadInfo, type UserSquadInfo } from '../../utils/squadUtils';
import { useServerClockOffset } from '../../hooks/useServerClock';
import ClassFlowPlayerView from './ClassFlowPlayerView';
import ClassFlowFacilitatorView from './ClassFlowFacilitatorView';
import { ClassFlowToastStack, useClassFlowToasts } from './ClassFlowToasts';
import type { CfPlayerRef, CfPublicState, CfPublicTeam, CfSharedProps } from './classFlowPanelTypes';

export interface ClassFlowWorkPanelProps {
  sessionId: string;
  sprint: ClassFlowSprintState | null;
  rawConfig: unknown;
  sessionPlayers: { userId: string; displayName?: string }[];
  hostUid?: string;
  isFacilitator: boolean;
  currentUserId: string;
  userEmail?: string | null;
  userDisplayName?: string | null;
}

function parsePublicState(raw: Record<string, unknown> | null): CfPublicState | null {
  if (!raw) return null;
  return {
    sprintId: typeof raw.sprintId === 'string' ? raw.sprintId : null,
    teams: Array.isArray(raw.teams) ? (raw.teams as CfPublicTeam[]) : [],
    pool: (raw.pool as CfPublicState['pool']) || null,
  };
}

const ClassFlowWorkPanel: React.FC<ClassFlowWorkPanelProps> = ({
  sessionId,
  sprint,
  rawConfig,
  sessionPlayers,
  hostUid,
  isFacilitator,
  currentUserId,
  userEmail,
  userDisplayName,
}) => {
  const config = useMemo(() => parseCfConfig(rawConfig), [rawConfig]);
  const enabled = config.workAssignmentsEnabled;
  const active = enabled || isFacilitator;
  const offset = useServerClockOffset(sessionId, currentUserId, enabled && !!currentUserId);
  const [nowMs, setNowMs] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (!enabled) return;
    setNowMs(Date.now() + offset);
    const id = window.setInterval(() => setNowMs(Date.now() + offset), 1000);
    return () => clearInterval(id);
  }, [enabled, offset]);

  const { items: toasts, push: notify, dismiss } = useClassFlowToasts();
  const actor = useMemo(
    () => ({ uid: currentUserId, email: userEmail || undefined, displayName: userDisplayName || undefined }),
    [currentUserId, userEmail, userDisplayName]
  );

  const players: CfPlayerRef[] = useMemo(() => {
    const seen = new Set<string>();
    const out: CfPlayerRef[] = [];
    for (const p of sessionPlayers) {
      if (!p.userId || seen.has(p.userId) || p.userId === hostUid) continue;
      seen.add(p.userId);
      out.push({ uid: p.userId, name: p.displayName || 'Player' });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [sessionPlayers, hostUid]);
  const nameMap = useMemo(() => new Map(players.map((p) => [p.uid, p.name])), [players]);
  const nameOf = useCallback((uid: string) => nameMap.get(uid) || 'Player', [nameMap]);

  /* ----------------------------- Facilitator data ----------------------------- */
  const [allSubs, setAllSubs] = useState<CfSubmission[]>([]);
  const [storedTeams, setStoredTeams] = useState<Record<string, CfStoredTeam>>({});
  const [tableByUid, setTableByUid] = useState<Record<string, number>>({});
  const [sharing, setSharing] = useState<CfSharingDecision[]>([]);
  const [allocations, setAllocations] = useState<CfAllocation[]>([]);
  const [archive, setArchive] = useState<CfSprintArchive[]>([]);
  const [squadByUid, setSquadByUid] = useState<Map<string, UserSquadInfo>>(new Map());

  useEffect(() => {
    if (!isFacilitator || !enabled || !sessionId) return;
    const unsubs = [
      subscribeAllSubmissions(sessionId, setAllSubs),
      subscribeStoredTeams(sessionId, setStoredTeams),
      subscribeAllocations(sessionId, setAllocations),
      subscribeSprintArchive(sessionId, setArchive),
    ];
    return () => unsubs.forEach((u) => u());
  }, [isFacilitator, enabled, sessionId]);

  useEffect(() => {
    if (!enabled || !sessionId) return;
    const unsubs = [subscribeTables(sessionId, setTableByUid), subscribeSharing(sessionId, setSharing)];
    return () => unsubs.forEach((u) => u());
  }, [enabled, sessionId]);

  const playerKey = players.map((p) => p.uid).join(',');
  useEffect(() => {
    if (!isFacilitator || !enabled || !config.teamModeEnabled || config.grouping !== 'squad' || !playerKey) return;
    let cancelled = false;
    void getUserSquadInfo(playerKey.split(',')).then((m) => {
      if (!cancelled) setSquadByUid(m);
    });
    return () => {
      cancelled = true;
    };
  }, [isFacilitator, enabled, config.teamModeEnabled, config.grouping, playerKey]);

  const teams = useMemo(() => {
    if (!config.teamModeEnabled) return [];
    return buildTeams(
      config.grouping,
      players.map((p) => {
        const sq = squadByUid.get(p.uid);
        return { uid: p.uid, name: p.name, squadId: sq?.squadId, squadName: sq?.name, squadTag: sq?.abbreviation };
      }),
      tableByUid,
      storedTeams
    );
  }, [config.teamModeEnabled, config.grouping, players, squadByUid, tableByUid, storedTeams]);

  const currentSprintSubs = useMemo(
    () => (sprint ? allSubs.filter((s) => s.sprintId === sprint.id) : []),
    [allSubs, sprint]
  );

  const livePreview = useMemo(() => {
    if (!isFacilitator || !sprint || !enabled) return null;
    const sharePct: Record<string, number> = {};
    sharing
      .filter((d) => d.sprintId === sprint.id && d.status === 'approved')
      .forEach((d) => (sharePct[d.teamId] = d.approvedPercent || 0));
    return computeSprintRewards({
      config,
      assignments: sprint.assignments || [],
      submissions: currentSprintSubs,
      participantIds: players.map((p) => p.uid),
      teams,
      sharingPercentByTeam: sharePct,
    });
  }, [isFacilitator, sprint, enabled, config, currentSprintSubs, players, teams, sharing]);

  // Publish team progress for players (debounced; facilitator only).
  const publishKey = useMemo(() => {
    if (!isFacilitator || !enabled) return '';
    const teamRows: CfPublicTeam[] = teams.map((t) => {
      const memberSet = new Set(t.memberIds);
      const subs = currentSprintSubs.filter((s) => memberSet.has(s.playerId));
      const approved = subs.filter((s) => s.status === 'approved');
      return {
        id: t.id,
        displayName: t.displayName,
        tag: formatTeamTag(t, config.tagDisplay, teamTableNumber(t, tableByUid)),
        memberIds: t.memberIds,
        captainId: t.captainId,
        proposedName: t.proposedName,
        approvedPoints: livePreview?.teams[t.id]?.teamTotal ?? approved.reduce((n, s) => n + s.approvedPoints, 0),
        teamAssignmentsDone: new Set(approved.filter((s) => s.workType === 'team').map((s) => s.assignmentId)).size,
        pendingCount: subs.filter((s) => s.status === 'submitted' || s.status === 'awaiting_approval').length,
      };
    });
    const state: CfPublicState = {
      sprintId: sprint?.id ?? null,
      teams: teamRows,
      pool: livePreview
        ? {
            totalBase: livePreview.pool.totalBase,
            approvedBase: livePreview.pool.approvedBase,
            remainingBase: livePreview.pool.remainingBase,
            extraApproved: livePreview.pool.extraApproved,
          }
        : null,
    };
    return JSON.stringify(state);
  }, [isFacilitator, enabled, teams, currentSprintSubs, config.tagDisplay, tableByUid, livePreview, sprint?.id]);

  const lastPublished = useRef('');
  useEffect(() => {
    if (!publishKey || publishKey === lastPublished.current) return;
    const id = window.setTimeout(() => {
      lastPublished.current = publishKey;
      void publishPublicState(sessionId, JSON.parse(publishKey));
    }, 1200);
    return () => clearTimeout(id);
  }, [publishKey, sessionId]);

  // Facilitator: notify on new submissions.
  const seenPending = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!isFacilitator) return;
    const pending = allSubs.filter((s) => s.status === 'submitted' || s.status === 'awaiting_approval');
    const keys = new Set(pending.map((s) => `${s.id}:${s.submittedAt}`));
    if (seenPending.current) {
      pending
        .filter((s) => !seenPending.current!.has(`${s.id}:${s.submittedAt}`))
        .slice(0, 3)
        .forEach((s) =>
          notify({
            title: s.revisionCount > 0 ? 'Resubmission' : 'New submission',
            body: `${s.playerName} — ${s.assignmentTitle}\nRequested: +${s.requestedPoints}`,
          })
        );
    }
    seenPending.current = keys;
  }, [allSubs, isFacilitator, notify]);

  // Facilitator: when approval is not required, approve pending work automatically (still facilitator-side).
  const autoApproved = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isFacilitator || !enabled || config.submissionApprovalRequired) return;
    allSubs
      .filter((s) => s.status === 'submitted' && s.method !== 'facilitator')
      .forEach((s) => {
        const key = `${s.id}:${s.submittedAt}`;
        if (autoApproved.current.has(key)) return;
        autoApproved.current.add(key);
        void reviewSubmission(sessionId, s.id, { kind: 'approve', points: s.requestedPoints }, currentUserId);
      });
  }, [allSubs, isFacilitator, enabled, config.submissionApprovalRequired, sessionId, currentUserId]);

  // Facilitator: close the sprint automatically when the shared timer runs out.
  const autoClosed = useRef<string | null>(null);
  const phase = sprint ? sprintPhase(sprintTimerInput(sprint), nowMs) : null;
  useEffect(() => {
    if (!isFacilitator || !enabled || !sprint || phase !== 'expired') return;
    if (autoClosed.current === sprint.id) return;
    autoClosed.current = sprint.id;
    void updateClassFlowSprintTimer(sessionId, actor.uid, actor.email, actor.displayName, { kind: 'autoClose' }, nowMs);
  }, [isFacilitator, enabled, sprint, phase, sessionId, actor, nowMs]);

  /* -------------------------------- Player data ------------------------------- */
  const [mySubs, setMySubs] = useState<CfSubmission[]>([]);
  const [myAllocs, setMyAllocs] = useState<CfAllocation[]>([]);
  const [myPayouts, setMyPayouts] = useState<CfPayout[]>([]);
  const [publicState, setPublicState] = useState<CfPublicState | null>(null);
  const isPlayerView = !isFacilitator && enabled;

  useEffect(() => {
    if (!isPlayerView || !currentUserId) return;
    const unsubs = [
      subscribeMySubmissions(sessionId, currentUserId, setMySubs),
      subscribeMyAllocations(sessionId, currentUserId, setMyAllocs),
      subscribeMyPayouts(sessionId, currentUserId, setMyPayouts),
      subscribePublicState(sessionId, (raw) => setPublicState(parsePublicState(raw))),
    ];
    return () => unsubs.forEach((u) => u());
  }, [isPlayerView, sessionId, currentUserId]);

  // Player: status-change notifications.
  const prevStatus = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!isPlayerView) return;
    const next = new Map(mySubs.map((s) => [s.id, `${s.status}:${s.approvedPoints}`]));
    if (prevStatus.current) {
      for (const s of mySubs) {
        const before = prevStatus.current.get(s.id);
        const now = `${s.status}:${s.approvedPoints}`;
        if (!before || before === now) continue;
        const mine = s.playerId === currentUserId;
        if (s.status === 'approved') {
          const share = s.workType === 'team' ? Math.floor(s.approvedPoints / Math.max(1, s.contributorIds.length)) : s.approvedPoints;
          const lines = [s.assignmentTitle, `${s.workType === 'team' ? 'Your share' : 'Individual Credit'}: +${share}`];
          if (config.teamModeEnabled) lines.push(`Team Contribution: +${share}`);
          notify({ title: s.isExtraCredit ? 'Extra credit approved' : 'Work approved', body: lines.join('\n'), tone: 'good' });
        } else if (s.status === 'revision_requested' && mine) {
          notify({ title: 'Revision requested', body: `${s.assignmentTitle}${s.feedback ? `\n“${s.feedback}”` : ''}`, tone: 'warn' });
        } else if (s.status === 'rejected' && mine) {
          notify({ title: 'Submission not accepted', body: `${s.assignmentTitle}${s.feedback ? `\n“${s.feedback}”` : ''}`, tone: 'bad' });
        }
      }
    }
    prevStatus.current = next;
  }, [mySubs, isPlayerView, currentUserId, config.teamModeEnabled, notify]);

  // Player: claim pending payouts (idempotent, one transaction per payout).
  const claiming = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!isPlayerView || !currentUserId) return;
    const pending = myPayouts.filter((p) => p.status === 'pending' && !claiming.current.has(p.id));
    if (!pending.length) return;
    pending.forEach((p) => claiming.current.add(p.id));
    void claimMyPayouts(sessionId, currentUserId, pending).then((t) => {
      if (t.points > 0 || t.pp > 0 || t.xp > 0) {
        const parts = [`Sprint Points: +${t.points}`];
        if (t.pp > 0) parts.push(`PP: +${t.pp}`);
        if (t.xp > 0) parts.push(`XP: +${t.xp}`);
        notify({ title: 'Sprint rewards received', body: parts.join('\n'), tone: 'good' });
      }
      pending.forEach((p) => claiming.current.delete(p.id));
    });
  }, [myPayouts, isPlayerView, sessionId, currentUserId, notify]);

  // Player: sprint start / end notices.
  const lastSprintKey = useRef<string | null>(null);
  useEffect(() => {
    if (!isPlayerView) return;
    const key = sprint ? `${sprint.id}:${phase === 'expired' ? 'closed' : sprint.status}` : null;
    if (lastSprintKey.current !== null && key && key !== lastSprintKey.current && sprint) {
      if (key.endsWith(':live') && !lastSprintKey.current.startsWith(sprint.id)) {
        notify({ title: 'Sprint started', body: sprint.title });
      } else if (key.endsWith(':closed')) {
        notify({ title: 'Sprint complete', body: `${sprint.title}\nSubmissions are now closed.`, tone: 'warn' });
      }
    }
    lastSprintKey.current = key ?? '';
  }, [sprint, phase, isPlayerView, notify]);

  if (!active) return null;

  const shared: CfSharedProps = { sessionId, actor, sprint, config, nowMs, players, nameOf, notify };

  return (
    <>
      {isFacilitator ? (
        <ClassFlowFacilitatorView
          {...shared}
          data={{ submissions: allSubs, teams, storedTeams, tableByUid, sharing, allocations, archive }}
          preview={livePreview}
        />
      ) : (
        <ClassFlowPlayerView
          {...shared}
          data={{ submissions: mySubs, allocations: myAllocs, payouts: myPayouts, sharing, tableByUid, publicState }}
        />
      )}
      <ClassFlowToastStack items={toasts} onDismiss={dismiss} />
    </>
  );
};

export default ClassFlowWorkPanel;
