import React, { useState } from 'react';
import type { CfConfig, CfTeam } from '../../../types/classFlowWork';
import { UNASSIGNED_TEAM_ID } from '../../../utils/classFlowRewards';
import { formatTeamTag, sanitizeTeamName, teamTableNumber } from '../../../utils/classFlowTeams';
import {
  deleteStoredTeam,
  resolveTeamName,
  saveStoredTeam,
  setTableNumber,
  updateCfConfig,
  type CfStoredTeam,
} from '../../../utils/classFlowWorkService';
import type { CfToastInput } from '../classFlowPanelTypes';

interface Props {
  sessionId: string;
  actorUid: string;
  config: CfConfig;
  teams: CfTeam[];
  storedTeams: Record<string, CfStoredTeam>;
  tableByUid: Record<string, number>;
  nameOf: (uid: string) => string;
  notify: (t: CfToastInput) => void;
}

const TeamsTab: React.FC<Props> = ({ sessionId, actorUid, config, teams, storedTeams, tableByUid, nameOf, notify }) => {
  const [renames, setRenames] = useState<Record<string, string>>({});

  const report = (res: { ok: boolean; error?: string }, success?: string) => {
    if (!res.ok) notify({ title: 'Update failed', body: res.error, tone: 'bad' });
    else if (success) notify({ title: success });
  };

  const manualTeams = teams.filter((t) => t.groupingType === 'manual' && t.id !== UNASSIGNED_TEAM_ID);

  const assignManual = async (uid: string, teamId: string) => {
    for (const t of manualTeams) {
      const members = storedTeams[t.id]?.memberIds || [];
      if (members.includes(uid) && t.id !== teamId) {
        await saveStoredTeam(sessionId, t.id, { memberIds: members.filter((m) => m !== uid) });
      }
    }
    if (teamId) {
      const members = storedTeams[teamId]?.memberIds || [];
      if (!members.includes(uid)) await saveStoredTeam(sessionId, teamId, { memberIds: [...members, uid] });
    }
  };

  return (
    <div>
      <div className="cf-row" style={{ marginBottom: 10 }}>
        <label className="cf-label">
          Group players by
          <select
            className="cf-select"
            value={config.grouping}
            onChange={async (e) => report(await updateCfConfig(sessionId, { grouping: e.target.value as CfConfig['grouping'] }))}
          >
            <option value="squad">Existing squads</option>
            <option value="table">Table number</option>
            <option value="manual">Manual teams</option>
          </select>
        </label>
        <label className="cf-label">
          Table tag (this session only)
          <select
            className="cf-select"
            value={config.tagDisplay}
            onChange={async (e) => report(await updateCfConfig(sessionId, { tagDisplay: e.target.value as CfConfig['tagDisplay'] }))}
          >
            <option value="alongside">Show alongside squad tag</option>
            <option value="replace">Replace squad tag</option>
          </select>
        </label>
        {config.grouping === 'manual' && (
          <button
            type="button"
            className="cf-btn"
            onClick={async () =>
              report(
                await saveStoredTeam(sessionId, `manual_${Date.now().toString(36)}`, { groupingType: 'manual', memberIds: [] }),
                'Team created'
              )
            }
          >
            + New team
          </button>
        )}
      </div>
      <div className="cf-sub" style={{ marginBottom: 10 }}>
        Team names here are for this Live Event only — permanent squad names are never changed.
      </div>

      {teams.length === 0 && <div className="cf-empty">No players yet.</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {teams.map((t) => {
          const table = teamTableNumber(t, tableByUid);
          const unassigned = t.id === UNASSIGNED_TEAM_ID;
          return (
            <div key={t.id} className="cf-card cf-card--gold">
              <div className="cf-between">
                <span className="cf-team-tag">{formatTeamTag(t, config.tagDisplay, table)}</span>
                {!unassigned && t.displayName !== t.defaultName && (
                  <button type="button" className="cf-btn cf-btn--ghost" onClick={async () => report(await resolveTeamName(sessionId, t.id, 'reset'), 'Name reset')}>
                    Reset name
                  </button>
                )}
              </div>
              {!unassigned && (
                <div className="cf-row" style={{ marginTop: 8 }}>
                  <input
                    className="cf-input"
                    maxLength={32}
                    placeholder={t.displayName}
                    value={renames[t.id] ?? ''}
                    onChange={(e) => setRenames((r) => ({ ...r, [t.id]: e.target.value }))}
                  />
                  <button
                    type="button"
                    className="cf-btn"
                    disabled={!sanitizeTeamName(renames[t.id] || '')}
                    onClick={async () => {
                      report(await saveStoredTeam(sessionId, t.id, { displayName: sanitizeTeamName(renames[t.id] || '') }), 'Team renamed');
                      setRenames((r) => ({ ...r, [t.id]: '' }));
                    }}
                  >
                    Rename
                  </button>
                  <label className="cf-label" style={{ flexDirection: 'row', alignItems: 'center' }}>
                    Captain
                    <select
                      className="cf-select"
                      value={t.captainId || ''}
                      onChange={async (e) => report(await saveStoredTeam(sessionId, t.id, { captainId: e.target.value || null }))}
                    >
                      <option value="">None</option>
                      {t.memberIds.map((m) => (
                        <option key={m} value={m}>{nameOf(m)}</option>
                      ))}
                    </select>
                  </label>
                  {t.groupingType === 'manual' && (
                    <button type="button" className="cf-btn cf-btn--red" onClick={async () => report(await deleteStoredTeam(sessionId, t.id), 'Team removed')}>
                      Delete team
                    </button>
                  )}
                </div>
              )}
              {t.proposedName && (
                <div className="cf-msg" style={{ marginTop: 8 }}>
                  Suggested name: <strong>{t.proposedName}</strong>
                  {storedTeams[t.id]?.proposedBy ? ` (by ${nameOf(storedTeams[t.id]!.proposedBy!)})` : ''}{' '}
                  <button type="button" className="cf-btn cf-btn--green" onClick={async () => report(await resolveTeamName(sessionId, t.id, 'approve', sanitizeTeamName(t.proposedName || '')), 'Name approved')}>
                    Approve
                  </button>{' '}
                  <button type="button" className="cf-btn cf-btn--ghost" onClick={async () => report(await resolveTeamName(sessionId, t.id, 'decline'))}>
                    Decline
                  </button>
                </div>
              )}
              <table className="cf-table" style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>Table</th>
                    {config.grouping === 'manual' && <th>Team</th>}
                  </tr>
                </thead>
                <tbody>
                  {t.memberIds.map((uid) => (
                    <tr key={uid}>
                      <td>
                        {nameOf(uid)}
                        {t.captainId === uid ? ' ★' : ''}
                      </td>
                      <td>
                        <input
                          className="cf-input"
                          type="number"
                          min={1}
                          max={99}
                          style={{ width: 70 }}
                          defaultValue={tableByUid[uid] ?? ''}
                          key={`${uid}:${tableByUid[uid] ?? ''}`}
                          aria-label={`Table for ${nameOf(uid)}`}
                          onBlur={async (e) => {
                            const n = Number(e.target.value);
                            if ((n || null) === (tableByUid[uid] ?? null)) return;
                            report(await setTableNumber(sessionId, uid, n > 0 ? n : null, actorUid));
                          }}
                        />
                      </td>
                      {config.grouping === 'manual' && (
                        <td>
                          <select
                            className="cf-select"
                            value={unassigned ? '' : t.id}
                            onChange={(e) => void assignManual(uid, e.target.value)}
                            aria-label={`Team for ${nameOf(uid)}`}
                          >
                            <option value="">Unassigned</option>
                            {manualTeams.map((mt) => (
                              <option key={mt.id} value={mt.id}>{mt.displayName}</option>
                            ))}
                          </select>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TeamsTab;
