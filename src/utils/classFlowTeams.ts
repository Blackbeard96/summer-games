/**
 * Class Flow teams — event-scoped grouping (pure). Permanent squads are only read, never renamed.
 */
import type { CfGrouping, CfTagDisplay, CfTeam } from '../types/classFlowWork';
import { UNASSIGNED_TEAM_ID } from './classFlowRewards';

export interface CfTeamSourcePlayer {
  uid: string;
  name: string;
  squadId?: string | null;
  squadName?: string | null;
  squadTag?: string | null;
}

export interface CfStoredTeamOverrides {
  displayName?: string;
  proposedName?: string | null;
  captainId?: string | null;
  memberIds?: string[];
}

/**
 * Builds teams for the chosen grouping.
 *  - squad: one team per permanent squad
 *  - table: one team per table number (event-scoped)
 *  - manual: the facilitator's stored teams
 * Players without a group land in the Unassigned team.
 * `stored` keeps event-level overrides (custom names, captain) keyed by team id.
 */
export function buildTeams(
  grouping: CfGrouping,
  players: CfTeamSourcePlayer[],
  tableByUid: Record<string, number>,
  stored: Record<string, CfStoredTeamOverrides & { groupingType?: CfGrouping }>
): CfTeam[] {
  const teams = new Map<string, CfTeam>();
  const placed = new Set<string>();
  const ensure = (id: string, init: Omit<CfTeam, 'memberIds' | 'displayName' | 'proposedName' | 'captainId'>) => {
    let t = teams.get(id);
    if (!t) {
      const o = stored[id] || {};
      t = {
        ...init,
        memberIds: [],
        displayName: (o.displayName || '').trim() || init.defaultName,
        proposedName: o.proposedName ?? null,
        captainId: o.captainId ?? null,
      };
      teams.set(id, t);
    }
    return t;
  };

  if (grouping === 'manual') {
    const byUid = new Map(players.map((p) => [p.uid, p]));
    Object.entries(stored)
      .filter(([id, o]) => id !== UNASSIGNED_TEAM_ID && o.groupingType === 'manual')
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([id, o], i) => {
        const t = ensure(id, {
          id,
          groupingType: 'manual',
          tableNumber: null,
          squadId: null,
          squadTag: null,
          defaultName: `Team ${i + 1}`,
        });
        for (const uid of o.memberIds || []) {
          if (byUid.has(uid) && !placed.has(uid)) {
            t.memberIds.push(uid);
            placed.add(uid);
          }
        }
      });
  } else {
    for (const p of players) {
      if (grouping === 'squad' && p.squadId) {
        const id = `squad_${p.squadId}`;
        ensure(id, {
          id,
          groupingType: 'squad',
          tableNumber: tableByUid[p.uid] ?? null,
          squadId: p.squadId,
          squadTag: p.squadTag || null,
          defaultName: p.squadName || p.squadTag || 'Squad',
        }).memberIds.push(p.uid);
        placed.add(p.uid);
      } else if (grouping === 'table' && tableByUid[p.uid] != null) {
        const n = tableByUid[p.uid];
        const id = `table_${n}`;
        ensure(id, {
          id,
          groupingType: 'table',
          tableNumber: n,
          squadId: null,
          squadTag: null,
          defaultName: `Table ${n}`,
        }).memberIds.push(p.uid);
        placed.add(p.uid);
      }
    }
  }

  const unassigned = players.filter((p) => !placed.has(p.uid)).map((p) => p.uid);
  const list = Array.from(teams.values()).sort((a, b) => {
    if (a.tableNumber != null && b.tableNumber != null && a.tableNumber !== b.tableNumber)
      return a.tableNumber - b.tableNumber;
    return a.displayName.localeCompare(b.displayName);
  });
  if (unassigned.length) {
    list.push({
      id: UNASSIGNED_TEAM_ID,
      groupingType: grouping,
      tableNumber: null,
      squadId: null,
      squadTag: null,
      defaultName: 'Unassigned',
      displayName: 'Unassigned',
      proposedName: null,
      memberIds: unassigned,
      captainId: null,
    });
  }
  return list;
}

/** Most common table number among members (squads can span tables). */
export function teamTableNumber(team: CfTeam, tableByUid: Record<string, number>): number | null {
  if (team.tableNumber != null) return team.tableNumber;
  const counts = new Map<number, number>();
  for (const uid of team.memberIds) {
    const n = tableByUid[uid];
    if (n != null) counts.set(n, (counts.get(n) || 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  counts.forEach((c, n) => {
    if (c > bestCount || (c === bestCount && best != null && n < best)) {
      best = n;
      bestCount = c;
    }
  });
  return best;
}

/**
 * "THE ARCHITECTS / Table 1 | 4 Players".
 * replace: the table tag replaces the squad tag when a table is known (this session only).
 */
export function formatTeamTag(team: CfTeam, tagDisplay: CfTagDisplay, tableNumber: number | null): string {
  const count = team.memberIds.length;
  const players = `${count} Player${count === 1 ? '' : 's'}`;
  const name = team.displayName.toUpperCase();
  const table = tableNumber != null ? `Table ${tableNumber}` : null;
  const squad = team.squadTag && team.squadTag.toUpperCase() !== name ? `[${team.squadTag}]` : null;
  let label: string;
  if (tagDisplay === 'replace') {
    label = table ? `${name} / ${table}` : squad ? `${name} ${squad}` : name;
  } else {
    label = [name + (squad ? ` ${squad}` : ''), table].filter(Boolean).join(' / ');
  }
  return `${label} | ${players}`;
}

export function sanitizeTeamName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 32);
}
