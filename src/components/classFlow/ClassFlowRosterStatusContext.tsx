import { createContext, useContext } from 'react';
import type { CfRosterStatusRow } from '../../utils/classFlowAnalytics';

/** Lets the Sprint Manager share this sprint's submission status with the surrounding Class Flow panel. */
export const ClassFlowRosterStatusContext = createContext<((rows: CfRosterStatusRow[] | null) => void) | null>(null);

export function useReportClassFlowRosterStatus() {
  return useContext(ClassFlowRosterStatusContext);
}
