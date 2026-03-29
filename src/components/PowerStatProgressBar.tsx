import React from 'react';
import type { PowerStatBranch, PowerStatBranchState } from '../types/playerPowerStats';
import { getPowerStatBarFillPercent, POWER_STAT_BAR_THEME } from '../utils/liveEventPowerStatsService';

export interface PowerStatProgressBarProps {
  branch: PowerStatBranch;
  st: PowerStatBranchState;
  /** Bar thickness in px */
  height?: number;
  style?: React.CSSProperties;
}

/**
 * Horizontal XP-to-next-level bar (Sims-style readable fill).
 */
const PowerStatProgressBar: React.FC<PowerStatProgressBarProps> = ({
  branch,
  st,
  height = 10,
  style,
}) => {
  const pct = getPowerStatBarFillPercent(st);
  const theme = POWER_STAT_BAR_THEME[branch];

  return (
    <div
      style={{ width: '100%', ...style }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${branch} XP progress`}
    >
      <div
        style={{
          height,
          borderRadius: 9999,
          background: theme.track,
          overflow: 'hidden',
          boxShadow: 'inset 0 1px 3px rgba(15, 23, 42, 0.12)',
          border: '1px solid rgba(148, 163, 184, 0.45)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            minWidth: pct > 0 ? 4 : 0,
            borderRadius: 9999,
            background: `linear-gradient(90deg, ${theme.fill} 0%, ${theme.fillSoft} 100%)`,
            transition: 'width 0.45s ease',
            boxShadow: '0 0 8px rgba(255,255,255,0.35) inset',
          }}
        />
      </div>
    </div>
  );
};

export default PowerStatProgressBar;
