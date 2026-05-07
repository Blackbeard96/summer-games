import React from 'react';
import {
  isLiveEventReviveBattleLogLine,
  LIVE_EVENT_REVIVE_BATTLE_LOG_PREFIX,
} from '../../utils/liveEventRevive';

type Props = {
  line: string;
  /** Dark panel (battle log panel) vs light-ish HUD */
  lightOnDark?: boolean;
  /** Non-revive lines: softer text (e.g. economy HUD feed) */
  subdued?: boolean;
};

/**
 * Renders one battle log row; revive rows get a labeled card (who + how + HP).
 */
const LiveEventBattleLogLine: React.FC<Props> = ({ line, lightOnDark = true, subdued = false }) => {
  if (!isLiveEventReviveBattleLogLine(line)) {
    return (
      <div
        style={{
          color: lightOnDark ? (subdued ? '#cbd5e1' : 'white') : '#374151',
          padding: '0.25rem 0',
          lineHeight: 1.45,
          fontSize: subdued ? '0.7rem' : undefined,
        }}
      >
        {line}
      </div>
    );
  }

  const parts = line.split(' — ');
  const structured =
    line.startsWith(LIVE_EVENT_REVIVE_BATTLE_LOG_PREFIX) &&
    parts.length >= 4 &&
    parts[2]?.trim().startsWith('How:');

  if (!structured) {
    return (
      <div
        style={{
          padding: '0.45rem 0.55rem',
          margin: '0.15rem 0',
          borderRadius: '0.45rem',
          background: lightOnDark ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16, 185, 129, 0.12)',
          border: lightOnDark
            ? '1px solid rgba(52, 211, 153, 0.45)'
            : '1px solid rgba(16, 185, 129, 0.35)',
          borderLeft: '4px solid #34d399',
          lineHeight: 1.45,
          color: lightOnDark ? (subdued ? '#d1fae5' : '#ecfdf5') : '#065f46',
          fontSize: subdued ? '0.7rem' : '0.8125rem',
        }}
      >
        <div style={{ fontWeight: 800, color: '#6ee7b7', fontSize: '0.72rem', letterSpacing: '0.06em' }}>
          REVIVE
        </div>
        <div style={{ marginTop: 4 }}>{line}</div>
      </div>
    );
  }

  const revivedWho = parts[1]?.trim() || 'Player';
  const howRaw = parts[2]?.trim() || '';
  const how = howRaw.startsWith('How:') ? howRaw.slice(4).trim() : howRaw;
  const hpPart = parts.length > 3 ? parts.slice(3).join(' — ').trim() : '';

  return (
    <div
      style={{
        padding: '0.45rem 0.55rem',
        margin: '0.15rem 0',
        borderRadius: '0.45rem',
        background: lightOnDark ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16, 185, 129, 0.12)',
        border: lightOnDark
          ? '1px solid rgba(52, 211, 153, 0.45)'
          : '1px solid rgba(16, 185, 129, 0.35)',
        borderLeft: '4px solid #34d399',
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontWeight: 800, color: '#6ee7b7', fontSize: '0.72rem', letterSpacing: '0.06em' }}>
        REVIVED
      </div>
      <div style={{ color: lightOnDark ? '#ecfdf5' : '#065f46', fontWeight: 700, marginTop: 2 }}>
        Player: <span style={{ fontWeight: 800 }}>{revivedWho}</span>
      </div>
      {how ? (
        <div style={{ color: lightOnDark ? '#d1fae5' : '#047857', fontSize: '0.8125rem', marginTop: 4 }}>
          <span style={{ fontWeight: 700, opacity: 0.9 }}>How revived: </span>
          {how}
        </div>
      ) : null}
      {hpPart ? (
        <div style={{ color: lightOnDark ? '#a7f3d0' : '#059669', fontSize: '0.75rem', marginTop: 2 }}>{hpPart}</div>
      ) : null}
    </div>
  );
};

export default LiveEventBattleLogLine;
