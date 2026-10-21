import React, { useEffect, useState } from 'react';
import {
  cancelSupportRequest,
  requestSupport,
  subscribeMySupportRequest,
  type CfSupportRequest,
} from '../../utils/classFlowWorkService';

export function useMySupportRequest(sessionId: string, sprintId: string | null | undefined, uid: string) {
  const [row, setRow] = useState<CfSupportRequest | null>(null);
  useEffect(() => {
    setRow(null);
    if (!sessionId || !sprintId || !uid) return;
    return subscribeMySupportRequest(sessionId, sprintId, uid, setRow);
  }, [sessionId, sprintId, uid]);
  return row;
}

/** Player "raise hand": joins the facilitator's support queue in request order. */
const ClassFlowSupportButton: React.FC<{
  sessionId: string;
  sprintId: string;
  uid: string;
  playerName: string;
  className?: string;
  style?: React.CSSProperties;
  onError?: (message: string) => void;
}> = ({ sessionId, sprintId, uid, playerName, className = 'cf-btn cf-btn--ghost', style, onError }) => {
  const mine = useMySupportRequest(sessionId, sprintId, uid);
  const [busy, setBusy] = useState(false);
  const open = mine?.status === 'open';

  const toggle = async () => {
    setBusy(true);
    const res = open
      ? await cancelSupportRequest(sessionId, sprintId, uid)
      : await requestSupport(sessionId, sprintId, uid, playerName);
    setBusy(false);
    if (!res.ok) onError?.(res.error);
  };

  return (
    <button
      type="button"
      className={className}
      style={style}
      disabled={busy}
      onClick={() => void toggle()}
      title={open ? 'Cancel your support request' : 'Let the facilitator know you need help'}
    >
      {open ? '✋ Support requested · Cancel' : '🙋 Request support'}
    </button>
  );
};

export default ClassFlowSupportButton;
