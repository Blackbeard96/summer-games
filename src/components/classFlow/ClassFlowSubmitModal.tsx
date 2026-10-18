import React, { useMemo, useState } from 'react';
import type { CfEvidence, CfSprintAssignment, CfSubmission, CfSubmissionMethod } from '../../types/classFlowWork';
import { CF_METHOD_LABELS } from '../../utils/classFlowConfig';
import { uploadEvidenceFile } from '../../utils/classFlowWorkService';

export interface CfSubmitDraft {
  assignment: CfSprintAssignment;
  method: CfSubmissionMethod;
  evidence: CfEvidence;
  contributorIds: string[];
}

interface Props {
  sessionId: string;
  uid: string;
  assignments: CfSprintAssignment[];
  /** Existing submission per assignment id (own or as a team contributor). */
  existing: Record<string, CfSubmission | undefined>;
  teammates: { uid: string; name: string }[];
  initialAssignmentId?: string | null;
  onSubmit: (drafts: CfSubmitDraft[]) => Promise<string | null>;
  onClose: () => void;
}

interface RowState {
  checked: boolean;
  method: CfSubmissionMethod;
  text: string;
  url: string;
  file: File | null;
  confirmed: boolean;
  contributors: string[];
}

function canSubmit(existing: CfSubmission | undefined): boolean {
  return !existing || existing.status === 'revision_requested';
}

function isValidUrl(v: string): boolean {
  try {
    const u = new URL(v.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

const ClassFlowSubmitModal: React.FC<Props> = ({
  sessionId,
  uid,
  assignments,
  existing,
  teammates,
  initialAssignmentId,
  onSubmit,
  onClose,
}) => {
  const available = useMemo(() => assignments.filter((a) => canSubmit(existing[a.assignmentId])), [assignments, existing]);
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const out: Record<string, RowState> = {};
    available.forEach((a) => {
      out[a.assignmentId] = {
        checked: a.assignmentId === initialAssignmentId || available.length === 1,
        method: a.submissionMethods[0] || 'confirm',
        text: '',
        url: '',
        file: null,
        confirmed: false,
        contributors: [],
      };
    });
    return out;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (id: string, p: Partial<RowState>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...p } }));

  const validate = (a: CfSprintAssignment, r: RowState): string | null => {
    if (r.method === 'written' && r.text.trim().length < 3) return `${a.title}: write a response.`;
    if (r.method === 'link' && !isValidUrl(r.url)) return `${a.title}: enter a valid link (https://…).`;
    if (r.method === 'upload' && !r.file) return `${a.title}: choose a file to upload.`;
    if (r.method === 'confirm' && !r.confirmed) return `${a.title}: confirm that you completed it.`;
    return null;
  };

  const handleSubmit = async () => {
    setError(null);
    const chosen = available.filter((a) => rows[a.assignmentId]?.checked);
    if (!chosen.length) {
      setError('Select at least one task you completed.');
      return;
    }
    for (const a of chosen) {
      const msg = validate(a, rows[a.assignmentId]);
      if (msg) {
        setError(msg);
        return;
      }
    }
    setBusy(true);
    try {
      const drafts: CfSubmitDraft[] = [];
      for (const a of chosen) {
        const r = rows[a.assignmentId];
        const evidence: CfEvidence = {};
        if (r.method === 'written') evidence.text = r.text.trim().slice(0, 4000);
        if (r.method === 'link') evidence.url = r.url.trim();
        if (r.method === 'confirm') evidence.confirmed = true;
        if (r.method === 'upload' && r.file) {
          const up = await uploadEvidenceFile(sessionId, uid, r.file);
          evidence.fileUrl = up.url;
          evidence.filePath = up.path;
          evidence.fileName = up.name;
        }
        drafts.push({ assignment: a, method: r.method, evidence, contributorIds: r.contributors });
      }
      const err = await onSubmit(drafts);
      if (err) setError(err);
      else onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cf-modal-backdrop" role="dialog" aria-modal="true" aria-label="Submit work" onClick={onClose}>
      <div className="cf-root cf-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cf-between">
          <h3 className="cf-title">Submit Work</h3>
          <button type="button" className="cf-btn cf-btn--ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <p className="cf-sub" style={{ marginTop: 6 }}>
          Check each task you completed. Each one is reviewed separately — selecting a task does not approve it.
        </p>
        {available.length === 0 && <div className="cf-empty">Everything in this sprint is already submitted.</div>}
        <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
          {available.map((a) => {
            const r = rows[a.assignmentId];
            const prev = existing[a.assignmentId];
            return (
              <div key={a.assignmentId} className="cf-card cf-card--gold">
                <label className="cf-check">
                  <input
                    type="checkbox"
                    checked={r.checked}
                    onChange={(e) => patch(a.assignmentId, { checked: e.target.checked })}
                  />
                  <strong>{a.title}</strong>
                  <span className="cf-sub">
                    {a.points} pts · {a.workType === 'team' ? 'Team work' : 'Individual work'}
                    {a.isExtraCredit ? ' · Extra credit' : ''}
                  </span>
                </label>
                {prev?.status === 'revision_requested' && prev.feedback && (
                  <div className="cf-msg" style={{ marginTop: 8 }}>
                    <strong>Revision requested:</strong> {prev.feedback}
                  </div>
                )}
                {r.checked && (
                  <div style={{ marginTop: 10, display: 'grid', gap: 8, fontSize: 13 }}>
                    {a.description && <div>{a.description}</div>}
                    {a.instructions && (
                      <div>
                        <div className="cf-stat-label">How to complete it</div>
                        <div style={{ whiteSpace: 'pre-line' }}>{a.instructions}</div>
                      </div>
                    )}
                    {a.submissionRequirements && (
                      <div>
                        <div className="cf-stat-label">Evidence required</div>
                        <div style={{ whiteSpace: 'pre-line' }}>{a.submissionRequirements}</div>
                      </div>
                    )}
                    <div className="cf-sub">
                      Credit: {a.points} Sprint Points
                      {a.workType === 'team' ? ' — split across the teammates you list as contributors' : ''}
                    </div>
                    {a.submissionMethods.length > 1 && (
                      <label className="cf-label">
                        Submission method
                        <select
                          className="cf-select"
                          value={r.method}
                          onChange={(e) => patch(a.assignmentId, { method: e.target.value as CfSubmissionMethod })}
                        >
                          {a.submissionMethods.map((m) => (
                            <option key={m} value={m}>
                              {CF_METHOD_LABELS[m]}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {r.method === 'facilitator' && (
                      <div className="cf-msg">Your facilitator will verify this in person after you submit.</div>
                    )}
                    {r.method === 'written' && (
                      <textarea
                        className="cf-textarea"
                        placeholder="Write your response…"
                        value={r.text}
                        maxLength={4000}
                        onChange={(e) => patch(a.assignmentId, { text: e.target.value })}
                      />
                    )}
                    {r.method === 'link' && (
                      <input
                        className="cf-input"
                        type="url"
                        placeholder="https://"
                        value={r.url}
                        onChange={(e) => patch(a.assignmentId, { url: e.target.value })}
                      />
                    )}
                    {r.method === 'upload' && (
                      <input
                        className="cf-input"
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => patch(a.assignmentId, { file: e.target.files?.[0] || null })}
                      />
                    )}
                    {r.method === 'confirm' && (
                      <label className="cf-check">
                        <input
                          type="checkbox"
                          checked={r.confirmed}
                          onChange={(e) => patch(a.assignmentId, { confirmed: e.target.checked })}
                        />
                        I completed this task
                      </label>
                    )}
                    {a.workType === 'team' && teammates.length > 0 && (
                      <div>
                        <div className="cf-stat-label">Teammates who contributed</div>
                        <div className="cf-row" style={{ marginTop: 4 }}>
                          {teammates.map((tm) => (
                            <label key={tm.uid} className="cf-check" style={{ fontSize: 12 }}>
                              <input
                                type="checkbox"
                                checked={r.contributors.includes(tm.uid)}
                                onChange={(e) =>
                                  patch(a.assignmentId, {
                                    contributors: e.target.checked
                                      ? [...r.contributors, tm.uid]
                                      : r.contributors.filter((x) => x !== tm.uid),
                                  })
                                }
                              />
                              {tm.name}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {error && (
          <div className="cf-msg cf-msg--error" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}
        <div className="cf-row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <button type="button" className="cf-btn cf-btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="cf-btn cf-btn--primary"
            onClick={handleSubmit}
            disabled={busy || available.length === 0}
          >
            {busy ? 'Submitting…' : 'Submit for review'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClassFlowSubmitModal;
