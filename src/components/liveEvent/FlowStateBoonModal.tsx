import React, { useEffect, useState } from 'react';
import type { FlowBoonId, FlowBoonThreshold } from '../../types/liveEventFlowBoons';
import { getFlowBoonOptionsForThreshold } from '../../utils/liveEventFlowBoons';
import './flowState.css';

type Props = {
  open: boolean;
  threshold: FlowBoonThreshold;
  saving: boolean;
  onSelect: (boonId: FlowBoonId) => void | Promise<void>;
};

const FlowStateBoonModal: React.FC<Props> = ({ open, threshold, saving, onSelect }) => {
  const [picked, setPicked] = useState<FlowBoonId | null>(null);
  const options = getFlowBoonOptionsForThreshold(threshold);

  useEffect(() => {
    if (open) setPicked(null);
  }, [open, threshold]);

  if (!open) return null;

  const handleConfirm = () => {
    if (!picked || saving) return;
    void onSelect(picked);
  };

  return (
    <div className="mst-flow-boon-overlay" role="dialog" aria-modal="true" aria-labelledby="flow-boon-title">
      <div className="mst-flow-boon-card">
        <p className="mst-flow-boon-eyebrow">Flow State Activated!</p>
        <h2 id="flow-boon-title" className="mst-flow-boon-title">
          {threshold}-Streak Boon
        </h2>
        <p className="mst-flow-boon-sub">Choose one reward to continue your momentum.</p>
        <div className="mst-flow-boon-options">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`mst-flow-boon-option${picked === opt.id ? ' mst-flow-boon-option--picked' : ''}`}
              disabled={saving}
              onClick={() => setPicked(opt.id)}
            >
              <span className="mst-flow-boon-option-title">{opt.title}</span>
              <span className="mst-flow-boon-option-desc">{opt.description}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="mst-flow-boon-confirm"
          disabled={!picked || saving}
          onClick={handleConfirm}
        >
          {saving ? 'Claiming…' : 'Claim Boon'}
        </button>
      </div>
    </div>
  );
};

export default FlowStateBoonModal;
