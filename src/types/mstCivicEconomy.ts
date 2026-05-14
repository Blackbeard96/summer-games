import type { Timestamp } from 'firebase/firestore';

export type CivicTaxLedgerStatus = 'paid' | 'unpaid' | 'defaulted' | 'forgiven';

export type CivicRoleType = 'scorekeeper' | 'flowkeeper' | 'passage_keeper';

export type CivicPayFrequency = 'daily' | 'weekly';

export type CivicTaxStatus =
  | 'paid'
  | 'due_soon'
  | 'unpaid'
  | 'defaulted'
  | 'shutdown';

export type CivicSeatFreedom = 'active' | 'restricted';

/** Global tax configuration — doc id `config` in `mstCivicTaxSettings`. */
export interface MstCivicTaxSettings {
  baseWeeklyTaxPp: number;
  /** 0 = Sunday … 6 = Saturday */
  collectionDayOfWeek: number;
  /** Local hour 0–23 */
  collectionHour: number;
  /** Local minute 0–59 */
  collectionMinute: number;
  automaticDeductionEnabled: boolean;
  gracePeriodHours: number;
  /** Default 9 */
  shutdownPenaltyHours: number;
  restrictSeatOnUnpaid: boolean;
  createBountyOnDefault: boolean;
  /** Last week id processed when auto ran */
  lastProcessedWeekId?: string;
  lastRunAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface MstCivicRoleAssignment {
  id: string;
  roleType: CivicRoleType;
  studentId: string;
  studentName?: string;
  payRatePp: number;
  payFrequency: CivicPayFrequency;
  taxDiscountPercent: number;
  active: boolean;
  notes?: string;
  updatedAt?: Timestamp;
}

export interface MstCivicTaxLedgerEntry {
  id: string;
  studentId: string;
  studentName: string;
  baseTax: number;
  roleDiscount: number;
  finalTaxOwed: number;
  ppBalanceBefore: number;
  ppBalanceAfter: number;
  status: CivicTaxLedgerStatus;
  paidAt?: Timestamp | null;
  defaultedAt?: Timestamp | null;
  weekId: string;
  nextTaxDate: number;
  createdAt?: Timestamp;
}

export interface MstCivicBounty {
  studentId: string;
  active: boolean;
  reason: 'tax_default';
  weekId?: string;
  createdAt?: Timestamp;
}

/** Per-player denormalized civic UI + enforcement — doc id = student uid in `mstCivicPlayerState`. */
export interface MstCivicPlayerState {
  studentId: string;
  displayName?: string;
  jobRole: CivicRoleType | null;
  jobPayRatePp: number;
  taxDiscountPercent: number;
  weeklyTaxOwed: number;
  taxStatus: CivicTaxStatus;
  nextTaxDate: number;
  seatFreedom: CivicSeatFreedom;
  shutdownEndsAt?: Timestamp | null;
  activeBounty: boolean;
  taxDefaultWeekId?: string | null;
  updatedAt?: Timestamp;
}
