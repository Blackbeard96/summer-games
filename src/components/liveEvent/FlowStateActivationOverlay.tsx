import React from 'react';
import './flowState.css';

type Props = {
  visible: boolean;
  displayName?: string;
};

/**
 * One-shot full-screen-adjacent banner when the local player crosses into Flow State.
 * Controlled by parent; parent clears `visible` after a timeout.
 */
const FlowStateActivationOverlay: React.FC<Props> = ({ visible, displayName }) => {
  if (!visible) return null;
  const who = displayName?.trim() || 'You';
  return (
    <div className="mst-flow-activation-root" role="status" aria-live="polite">
      <div className="mst-flow-activation-burst" aria-hidden />
      <div className="mst-flow-activation-card">
        <div className="mst-flow-activation-title">Flow State</div>
        <div className="mst-flow-activation-name">{who}</div>
        <div className="mst-flow-activation-sub">3 successes in a row — momentum locked in.</div>
      </div>
    </div>
  );
};

export default FlowStateActivationOverlay;
