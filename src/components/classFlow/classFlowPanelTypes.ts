import type { ClassFlowSprintState } from '../../types/season1';
import type {
  CfAllocation,
  CfConfig,
  CfPayout,
  CfSharingDecision,
  CfSubmission,
  CfTeam,
} from '../../types/classFlowWork';
import type { CfSprintArchive, CfStoredTeam, CfActor } from '../../utils/classFlowWorkService';
import type { CfRosterStatusRow } from '../../utils/classFlowAnalytics';

export interface CfPlayerRef {
  uid: string;
  name: string;
}

/** Team progress the facilitator's client publishes for players (no evidence, no other players' work). */
export interface CfPublicTeam {
  id: string;
  displayName: string;
  tag: string;
  memberIds: string[];
  captainId: string | null;
  proposedName: string | null;
  approvedPoints: number;
  teamAssignmentsDone: number;
  pendingCount: number;
}

export interface CfPublicState {
  sprintId: string | null;
  teams: CfPublicTeam[];
  pool: { totalBase: number; approvedBase: number; remainingBase: number; extraApproved: number } | null;
  /** Who has / has not submitted this sprint's work (shown on the full-screen countdown). */
  roster?: CfRosterStatusRow[];
}

export interface CfSharedProps {
  sessionId: string;
  actor: CfActor;
  sprint: ClassFlowSprintState | null;
  config: CfConfig;
  nowMs: number;
  players: CfPlayerRef[];
  nameOf: (uid: string) => string;
  notify: (n: CfToastInput) => void;
  embedded?: boolean;
  classId?: string | null;
  roster?: CfRosterStatusRow[] | null;
}

export interface CfFacilitatorData {
  submissions: CfSubmission[];
  teams: CfTeam[];
  storedTeams: Record<string, CfStoredTeam>;
  tableByUid: Record<string, number>;
  sharing: CfSharingDecision[];
  allocations: CfAllocation[];
  archive: CfSprintArchive[];
}

export interface CfPlayerData {
  submissions: CfSubmission[];
  allocations: CfAllocation[];
  payouts: CfPayout[];
  sharing: CfSharingDecision[];
  tableByUid: Record<string, number>;
  publicState: CfPublicState | null;
}

export type CfToastTone = 'good' | 'warn' | 'bad' | 'info';
export interface CfToastInput {
  title: string;
  body?: string;
  tone?: CfToastTone;
}
