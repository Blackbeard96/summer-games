import React, { useState } from 'react';
import type { ClassFlowSprintState } from '../../types/season1';
import type { CfSprintAssignment } from '../../types/classFlowWork';
import { formatClock, sprintPhase, sprintRemainingMs, submissionsOpen } from '../../utils/classFlowConfig';
import { sprintTimerInput } from '../../utils/liveEventSprintService';

interface Props {
  sprint: ClassFlowSprintState;
  nowMs: number;
  expandable: boolean;
  acceptLate: boolean;
  teamLabel?: string | null;
  availablePoints?: number | null;
  submissionSummary?: string | null;
  onSubmitWork?: () => void;
}

const PHASE_LABEL = {
  running: 'Submissions open',
  paused: 'Paused — submissions open',
  expired: 'Time is up',
  closed: 'Sprint closed',
} as const;

const ClassFlowSprintTimer: React.FC<Props> = ({
  sprint,
  nowMs,
  expandable,
  acceptLate,
  teamLabel,
  availablePoints,
  submissionSummary,
  onSubmitWork,
}) => {
  const [expanded, setExpanded] = useState(false);
  const t = sprintTimerInput(sprint);
  const remaining = sprintRemainingMs(t, nowMs);
  const phase = sprintPhase(t, nowMs);
  const open = submissionsOpen(t, nowMs, acceptLate);
  const low = phase === 'running' && remaining <= 60_000;
  const assignments: CfSprintAssignment[] = sprint.assignments || [];
  const isExpanded = expandable && expanded;
  const statusText = open ? (phase === 'expired' || phase === 'closed' ? 'Late submissions accepted' : PHASE_LABEL[phase]) : PHASE_LABEL[phase];

  return (
    <div
      className={`cf-timer ${isExpanded ? 'cf-timer--expanded' : ''} ${low ? 'cf-timer--low' : ''} ${
        phase === 'paused' ? 'cf-timer--paused' : ''
      }`}
      role="timer"
      aria-live="off"
    >
      <div className="cf-between">
        <div className="cf-row" style={{ gap: 14 }}>
          <div className="cf-timer-clock" aria-label={`Time remaining ${formatClock(remaining)}`}>
            {formatClock(remaining)}
          </div>
          <div>
            <div className="cf-title" style={{ fontSize: isExpanded ? 18 : 13 }}>
              {sprint.title}
            </div>
            <div className="cf-sub">
              <span className={`cf-badge ${open ? 'cf-status-approved' : 'cf-status-rejected'}`}>{statusText}</span>
            </div>
          </div>
        </div>
        <div className="cf-row">
          {!isExpanded && onSubmitWork && open && (
            <button type="button" className="cf-btn cf-btn--primary" onClick={onSubmitWork}>
              Submit Work
            </button>
          )}
          {expandable && (
            <button
              type="button"
              className="cf-btn cf-btn--ghost"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={isExpanded}
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
          {(sprint.objective || sprint.description) && (
            <div>
              <div className="cf-stat-label">Objective</div>
              <div style={{ fontSize: 15 }}>{sprint.objective || sprint.description}</div>
            </div>
          )}
          <div className="cf-grid">
            <div className="cf-card">
              <div className="cf-stat-label">Time remaining</div>
              <div className="cf-stat-value">{formatClock(remaining)}</div>
            </div>
            {teamLabel && (
              <div className="cf-card">
                <div className="cf-stat-label">Team</div>
                <div className="cf-team-tag">{teamLabel}</div>
              </div>
            )}
            {availablePoints != null && (
              <div className="cf-card">
                <div className="cf-stat-label">Sprint points available</div>
                <div className="cf-stat-value">{availablePoints}</div>
              </div>
            )}
            {submissionSummary && (
              <div className="cf-card">
                <div className="cf-stat-label">Your submissions</div>
                <div style={{ fontSize: 13 }}>{submissionSummary}</div>
              </div>
            )}
          </div>
          {assignments.length > 0 && (
            <div>
              <div className="cf-stat-label" style={{ marginBottom: 6 }}>
                Assigned work
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>
                {assignments.map((a) => (
                  <li key={a.assignmentId} style={{ fontSize: 13 }}>
                    <strong>{a.title}</strong> — {a.points} pts · {a.workType === 'team' ? 'Team' : 'Individual'}
                    {a.isExtraCredit ? ' · Extra credit' : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {onSubmitWork && (
            <div>
              <button type="button" className="cf-btn cf-btn--primary" onClick={onSubmitWork} disabled={!open}>
                {open ? 'Submit Work' : 'Submissions closed'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClassFlowSprintTimer;
