import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ClassFlowSprintState } from '../../types/season1';
import type { CfSprintAssignment } from '../../types/classFlowWork';
import { formatClock, sprintPhase, sprintRemainingMs, submissionsOpen } from '../../utils/classFlowConfig';
import { sprintTimerInput } from '../../utils/liveEventSprintService';

/** One row of the work list shown in the full-screen timer. */
export interface CfTimerItem {
  assignment: CfSprintAssignment;
  statusLabel?: string;
  statusClass?: string;
  /** Facilitator display, e.g. "3 submitted · 1 approved". */
  detail?: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface Props {
  sprint: ClassFlowSprintState;
  nowMs: number;
  expandable: boolean;
  acceptLate: boolean;
  teamLabel?: string | null;
  availablePoints?: number | null;
  submissionSummary?: string | null;
  onSubmitWork?: () => void;
  items?: CfTimerItem[];
  /** Controlled full-screen state (optional). */
  fullScreen?: boolean;
  onFullScreenChange?: (open: boolean) => void;
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
  items,
  fullScreen,
  onFullScreenChange,
}) => {
  const [localOpen, setLocalOpen] = useState(false);
  const isOpen = expandable && (fullScreen ?? localOpen);
  const setOpen = (v: boolean) => (onFullScreenChange ? onFullScreenChange(v) : setLocalOpen(v));

  const t = sprintTimerInput(sprint);
  const remaining = sprintRemainingMs(t, nowMs);
  const phase = sprintPhase(t, nowMs);
  const open = submissionsOpen(t, nowMs, acceptLate);
  const low = phase === 'running' && remaining <= 60_000;
  const statusText = open ? (phase === 'expired' || phase === 'closed' ? 'Late submissions accepted' : PHASE_LABEL[phase]) : PHASE_LABEL[phase];
  const rows: CfTimerItem[] = items ?? (sprint.assignments || []).map((assignment) => ({ assignment }));
  const timerClass = `${low ? 'cf-timer--low' : ''} ${phase === 'paused' ? 'cf-timer--paused' : ''}`;

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const overlay = isOpen
    ? createPortal(
        <div className={`cf-root cf-fullscreen ${timerClass}`} role="dialog" aria-modal="true" aria-label={`${sprint.title} timer`}>
          <div className="cf-between">
            <div>
              <div className="cf-title cf-fullscreen-title">{sprint.title}</div>
              <span className={`cf-badge ${open ? 'cf-status-approved' : 'cf-status-rejected'}`}>{statusText}</span>
              {teamLabel && <span className="cf-team-tag" style={{ marginLeft: 10 }}>{teamLabel}</span>}
            </div>
            <button type="button" className="cf-btn cf-btn--ghost" onClick={() => setOpen(false)}>
              ✕ Exit full screen
            </button>
          </div>

          <div className="cf-fullscreen-clock cf-timer-clock" role="timer" aria-label={`Time remaining ${formatClock(remaining)}`}>
            {formatClock(remaining)}
          </div>

          {(sprint.objective || sprint.description) && (
            <div className="cf-fullscreen-objective">{sprint.objective || sprint.description}</div>
          )}

          {(availablePoints != null || submissionSummary) && (
            <div className="cf-row" style={{ justifyContent: 'center', gap: 24, marginBottom: 18 }}>
              {availablePoints != null && (
                <div style={{ textAlign: 'center' }}>
                  <div className="cf-stat-label">Sprint points available</div>
                  <div className="cf-stat-value">{availablePoints}</div>
                </div>
              )}
              {submissionSummary && (
                <div style={{ textAlign: 'center' }}>
                  <div className="cf-stat-label">Your submissions</div>
                  <div style={{ fontSize: 15 }}>{submissionSummary}</div>
                </div>
              )}
            </div>
          )}

          {rows.length > 0 ? (
            <div className="cf-fullscreen-items">
              <div className="cf-stat-label" style={{ marginBottom: 8 }}>Complete these items</div>
              {rows.map((r, i) => (
                <div key={r.assignment.assignmentId} className="cf-card cf-card--gold cf-fullscreen-item">
                  <div className="cf-fullscreen-item-num">{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cf-fullscreen-item-title">{r.assignment.title}</div>
                    <div className="cf-sub">
                      {r.assignment.points} pts · {r.assignment.workType === 'team' ? 'Team' : 'Individual'}
                      {r.assignment.isExtraCredit ? ' · Extra credit' : ''}
                      {r.detail ? ` · ${r.detail}` : ''}
                    </div>
                    {r.assignment.description && <div style={{ marginTop: 4, fontSize: 14 }}>{r.assignment.description}</div>}
                    {r.assignment.instructions && (
                      <div className="cf-sub" style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.assignment.instructions}</div>
                    )}
                  </div>
                  <div className="cf-row" style={{ flexShrink: 0 }}>
                    {r.statusLabel && <span className={`cf-badge ${r.statusClass || ''}`}>{r.statusLabel}</span>}
                    {r.onAction && (
                      <button type="button" className="cf-btn cf-btn--primary" disabled={!open} onClick={r.onAction}>
                        {r.actionLabel || 'Submit'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="cf-empty">No work attached to this sprint.</div>
          )}

          {onSubmitWork && (
            <div style={{ textAlign: 'center', marginTop: 18 }}>
              <button type="button" className="cf-btn cf-btn--primary cf-btn--lg" onClick={onSubmitWork} disabled={!open}>
                {open ? 'Submit Work' : 'Submissions closed'}
              </button>
            </div>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <div className={`cf-timer ${timerClass}`} role="timer" aria-live="off">
      <div className="cf-between">
        <div className="cf-row" style={{ gap: 14 }}>
          <div className="cf-timer-clock" aria-label={`Time remaining ${formatClock(remaining)}`}>
            {formatClock(remaining)}
          </div>
          <div>
            <div className="cf-title" style={{ fontSize: 13 }}>{sprint.title}</div>
            <div className="cf-sub">
              <span className={`cf-badge ${open ? 'cf-status-approved' : 'cf-status-rejected'}`}>{statusText}</span>
            </div>
          </div>
        </div>
        <div className="cf-row">
          {onSubmitWork && open && (
            <button type="button" className="cf-btn cf-btn--primary" onClick={onSubmitWork}>
              Submit Work
            </button>
          )}
          {expandable && (
            <button type="button" className="cf-btn cf-btn--ghost" onClick={() => setOpen(true)}>
              ⛶ Full screen
            </button>
          )}
        </div>
      </div>
      {overlay}
    </div>
  );
};

export default ClassFlowSprintTimer;
